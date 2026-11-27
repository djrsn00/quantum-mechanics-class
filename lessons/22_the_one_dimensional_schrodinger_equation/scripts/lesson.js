const MIN_X = -60;
const MAX_X = 60;
const DX = 0.10;
const DT = 0.01;
const STEP_COUNT = 10;
const MAX_FRAME_STEPS = 32;
const SURVIVAL_FLOOR = 1e-8;
const SAMPLE_COUNT = 200;
const BIN_WIDTH = 2;
const BIN_COUNT = (MAX_X - MIN_X) / BIN_WIDTH;
const SVG_NS = "http://www.w3.org/2000/svg";

const OPENING = {
  preset: "barrier", center: -15, sigma: 3, momentum: 2, mass: 1,
  height: 3, width: 1, location: 0, gap: 5
};
const PRESETS = { free: "Free", barrier: "Single barrier", double: "Double barrier", well: "Finite well" };
const LIMITS = {
  center: [-24, 24, 0.5], sigma: [1.5, 4, 0.1], momentum: [-2.5, 2.5, 0.1],
  mass: [0.75, 2, 0.05], height: [0.2, 5, 0.1], width: [0.8, 6, 0.2],
  location: [-10, 10, 0.5], gap: [2, 10, 0.2]
};
const MISSIONS = {
  escape: {
    name: "The Great Escape", time: 16, setup: {},
    goal: "Grow the far-side probability by at least 0.10 percentage points above the launch tail at t = 16 T₀.",
    hint: "The barrier is 3 E₀ and the central kinetic energy is 2 E₀. Evolve through the encounter, then compare the right side with its launch value."
  },
  pinball: {
    name: "Quantum Pinball", time: 12, setup: { preset: "double" },
    goal: "At t = 12 T₀, find at least 5% probability in the cavity and 5% in the entrance detector at x < −10 L₀.",
    hint: "The two barriers enclose a clear gap. Compare the cavity readout with the returned density on the left after the encounter."
  },
  trap: {
    name: "Trap the Wave", time: 12,
    setup: { preset: "well", width: 5, height: 4, center: 0, sigma: 1.5, momentum: 0.5 },
    goal: "At t = 12 T₀, retain at least 5 percentage points more inside the well interval than a matched free packet.",
    hint: "The reference run uses the same launch packet, mass, time, and marked interval. The well is the only change."
  },
  forecast: {
    name: "Prediction Challenge", time: 16, setup: { height: 1.2, width: 1.4 },
    goal: "Forecast the conditional right-side probability at t = 16 T₀ within 5 percentage points.",
    hint: "Compare the central kinetic energy with the barrier. Commit before launching, then check your forecast against the theory and 200 draws."
  }
};

const OPENING_FEEDBACK = {
  zero: "A finite barrier can transmit sub-barrier components. The central kinetic energy is the energy at p₀, and the packet includes a range of momenta. Launch and compare the far side with its opening tail.",
  transmit: "Yes. A finite barrier can give a nonzero transmitted amplitude, including for sub-barrier components. The far-side detector also sees any transmitted above-barrier components."
};

function makeRun(setup, dx = DX, dt = DT) {
  const n = Math.round((MAX_X - MIN_X) / dx) + 1;
  const array = () => new Float64Array(n);
  const re = array(), im = array(), potential = array();
  const diagonal = array(), inverseRe = array(), inverseIm = array();
  const upperRe = array(), upperIm = array(), rhsRe = array(), rhsIm = array();
  const mask = array(), loss = array();
  const at = x => Math.ceil((x - MIN_X) / dx - 1e-9);
  const coordinate = j => MIN_X + j * dx;

  const isDouble = setup.preset === "double";
  const half = isDouble ? setup.gap / 2 + setup.width : setup.width / 2;
  const left = at(setup.location - half);
  const right = at(setup.location + half);
  const cavityLeft = isDouble ? at(setup.location - setup.gap / 2) : left;
  const cavityRight = isDouble ? at(setup.location + setup.gap / 2) : left;
  const level = setup.preset === "free" ? 0 : setup.preset === "well" ? -setup.height : setup.height;
  potential.fill(level, left, right);
  potential.fill(0, cavityLeft, cavityRight);

  const kappa = 1 / (2 * setup.mass * dx ** 2);
  const side = dt * kappa / 2;
  let norm = 0;

  for (let j = 1; j < n - 1; j += 1) {
    const x = coordinate(j);
    const offset = x - setup.center;
    const envelope = Math.exp(-0.25 * (offset / setup.sigma) ** 2);
    const phase = setup.momentum * offset;
    re[j] = envelope * Math.cos(phase);
    im[j] = envelope * Math.sin(phase);
    norm += (re[j] ** 2 + im[j] ** 2) * dx;

    const exponent = -3 * dt * (Math.max(0, Math.abs(x) - 45) / 15) ** 4;
    mask[j] = Math.exp(exponent);
    loss[j] = -Math.expm1(2 * exponent);

    // Thomas factorization of I + i*dt*H/2. Both off-diagonals are -i*side.
    diagonal[j] = dt * (2 * kappa + potential[j]) / 2;
    const pivotRe = 1 - side * upperIm[j - 1];
    const pivotIm = diagonal[j] + side * upperRe[j - 1];
    const denominator = pivotRe ** 2 + pivotIm ** 2;
    inverseRe[j] = pivotRe / denominator;
    inverseIm[j] = -pivotIm / denominator;
    upperRe[j] = side * inverseIm[j];
    upperIm[j] = -side * inverseRe[j];
  }

  const normalization = 1 / Math.sqrt(norm);
  let initialNorm = 0;
  for (let j = 1; j < n - 1; j += 1) {
    re[j] *= normalization;
    im[j] *= normalization;
    initialNorm += (re[j] ** 2 + im[j] ** 2) * dx;
  }

  return {
    setup: { ...setup }, n, dx, dt, at, coordinate, re, im, potential,
    left, right, cavityLeft, cavityRight, initialNorm, step: 0, absorbed: 0,
    side, diagonal, inverseRe, inverseIm, upperRe, upperIm, rhsRe, rhsIm, mask, loss,
    samples: emptySamples()
  };
}

function propagate(run) {
  const { n, dx, re, im, side, diagonal, inverseRe, inverseIm,
    upperRe, upperIm, rhsRe, rhsIm, mask, loss } = run;

  for (let j = 1; j < n - 1; j += 1) {
    // Apply I - i*dt*H/2 and forward-substitute into the factored system.
    const r = re[j] + diagonal[j] * im[j]
      - side * (im[j - 1] + im[j + 1] + rhsIm[j - 1]);
    const i = im[j] - diagonal[j] * re[j]
      + side * (re[j - 1] + re[j + 1] + rhsRe[j - 1]);
    rhsRe[j] = r * inverseRe[j] - i * inverseIm[j];
    rhsIm[j] = r * inverseIm[j] + i * inverseRe[j];
  }

  let nextRe = 0;
  let nextIm = 0;
  let absorbed = 0;
  for (let j = n - 2; j >= 1; j -= 1) {
    const r = rhsRe[j] - upperRe[j] * nextRe + upperIm[j] * nextIm;
    const i = rhsIm[j] - upperRe[j] * nextIm - upperIm[j] * nextRe;
    // Back-substitution uses unmasked neighbors. Record only this step's loss.
    nextRe = r;
    nextIm = i;
    absorbed += loss[j] * (r ** 2 + i ** 2) * dx;
    re[j] = mask[j] * r;
    im[j] = mask[j] * i;
  }

  run.absorbed += absorbed;
  run.step += 1;
}

function density(run, j) {
  return run.re[j] ** 2 + run.im[j] ** 2;
}

function inspect(run) {
  const { n, dx, left, right, cavityLeft, cavityRight } = run;
  const entrance = run.at(-10);
  let before = 0, inside = 0, after = 0, cavity = 0, returned = 0, peak = 0;
  for (let j = 1; j < n - 1; j += 1) {
    const value = density(run, j);
    const mass = value * dx;
    peak = Math.max(peak, value);
    if (j < left) before += mass;
    else if (j < right) inside += mass;
    else after += mass;
    if (j >= cavityLeft && j < cavityRight) cavity += mass;
    if (j < entrance) returned += mass;
  }
  return { norm: before + inside + after, before, inside, after, cavity, returned, peak };
}

function emptySamples() {
  return { count: 0, right: 0, last: null, bins: Array(BIN_COUNT).fill(0), recent: [] };
}

function samplePositions(run, count, random = Math.random) {
  const cdf = new Float64Array(run.n - 2);
  let total = 0;
  for (let index = 0; index < cdf.length; index += 1) {
    total += density(run, index + 1) * run.dx;
    cdf[index] = total;
  }
  if (total < SURVIVAL_FLOOR) return false;

  const samples = run.samples;
  for (let index = 0; index < count; index += 1) {
    const target = random() * total;
    let low = 0;
    let high = cdf.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (cdf[mid] > target) high = mid;
      else low = mid + 1;
    }

    const j = low + 1;
    const x = run.coordinate(j);
    const bin = Math.min(BIN_COUNT - 1, Math.floor((x - MIN_X + 1e-9) / BIN_WIDTH));
    samples.bins[bin] += 1;
    samples.count += 1;
    if (j >= run.right) samples.right += 1;
    samples.last = x;
    samples.recent.push(x);
    if (samples.recent.length > 32) samples.recent.shift();
  }
  return true;
}

function fixed(value, places = 2) {
  const magnitude = Math.abs(value).toFixed(places);
  return value < 0 && Number(magnitude) !== 0 ? "−" + magnitude : magnitude;
}

function percent(value, places = 2) {
  return fixed(100 * value, places) + "%";
}

function plotX(x) {
  return 332 + 4.5 * x;
}

function wavePath(run, ordinate) {
  const points = [];
  for (let j = 0; j < run.n - 1; j += 2) {
    points.push(plotX(run.coordinate(j)).toFixed(2) + " " + ordinate(j).toFixed(2));
  }
  points.push("602 " + ordinate(run.n - 1).toFixed(2));
  return "M" + points.join(" L");
}

function potentialRuns(run) {
  const runs = [];
  let start = 0;
  let value = run.potential[0];
  for (let j = 1; j < run.n; j += 1) {
    if (run.potential[j] === value) continue;
    runs.push({ from: run.coordinate(start), to: run.coordinate(j), value });
    start = j;
    value = run.potential[j];
  }
  runs.push({ from: run.coordinate(start), to: MAX_X, value });
  return runs;
}

function initializeCharts(root) {
  const find = id => root.querySelector("#sc-" + id);
  const document = root.ownerDocument;
  const svg = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };

  function group(id, keys) {
    const plot = find(id);
    const nodes = Object.fromEntries(keys.map(key => [key, find(key)]));
    if (!plot || !Object.values(nodes).every(Boolean) || typeof document?.createElementNS !== "function") {
      plot?.setAttribute("hidden", "");
      return null;
    }
    return nodes;
  }

  const potential = group("potential-plot", ["potential-line", "potential-description"]);
  const wave = group("density-plot", ["density-line", "density-max", "density-mid", "density-description",
    "left-boundary", "right-boundary", "cavity-left", "cavity-right"]);
  const amplitude = group("amplitude-plot", ["amp-max", "amp-min", "real-line", "imag-line", "amplitude-description"]);
  const histogram = group("histogram-plot", ["sample-bars", "histogram-max", "histogram-description"]);
  const chamber = group("chamber-plot", ["chamber-equipment", "chamber-wave", "chamber-marks", "chamber-description"]);
  const bars = [];

  if (histogram) {
    for (let bin = 0; bin < BIN_COUNT; bin += 1) {
      const bar = svg("rect", { x: plotX(MIN_X + BIN_WIDTH * bin), width: 4.5 * BIN_WIDTH });
      histogram["sample-bars"].append(bar);
      bars.push(bar);
    }
  }

  function edge(node, coordinate, visible = true) {
    node.setAttribute("x1", plotX(coordinate));
    node.setAttribute("x2", plotX(coordinate));
    node.toggleAttribute("hidden", !visible);
  }

  let previousRun = null;
  let previousChamberRun = null;
  return function draw(run, data, summary, open, real, imag) {
    const ceiling = Math.max(0.20, Math.ceil(data.peak * 10) / 10);
    if (potential && previousRun !== run) {
      const path = potentialRuns(run).map(({ from, to, value }) =>
        "L" + plotX(from) + " " + (75 - 10 * value) + " H" + plotX(to)
      );
      potential["potential-line"].setAttribute("d", "M62 75 " + path.join(" "));
      potential["potential-description"].textContent = PRESETS[run.setup.preset]
        + ". The violet line is the physical potential. Shaded bands show the edge absorber.";
      previousRun = run;
    }

    if (wave) {
      wave["density-line"].setAttribute("d", wavePath(run, j => 153 - 128 * density(run, j) / ceiling));
      wave["density-max"].textContent = ceiling.toFixed(2);
      wave["density-mid"].textContent = (ceiling / 2).toFixed(2);
      wave["density-description"].textContent = summary;
      edge(wave["left-boundary"], run.coordinate(run.left));
      edge(wave["right-boundary"], run.coordinate(run.right));
      edge(wave["cavity-left"], run.coordinate(run.cavityLeft), run.setup.preset === "double");
      edge(wave["cavity-right"], run.coordinate(run.cavityRight), run.setup.preset === "double");
    }

    if (amplitude && (real || imag)) {
      const scale = Math.max(0.50, Math.ceil(Math.sqrt(data.peak) * 10) / 10);
      amplitude["amp-max"].textContent = "+" + scale.toFixed(2);
      amplitude["amp-min"].textContent = "−" + scale.toFixed(2);
      amplitude["real-line"].toggleAttribute("hidden", !real);
      amplitude["imag-line"].toggleAttribute("hidden", !imag);
      if (real) amplitude["real-line"].setAttribute("d", wavePath(run, j => 76 - 56 * run.re[j] / scale));
      if (imag) amplitude["imag-line"].setAttribute("d", wavePath(run, j => 76 - 56 * run.im[j] / scale));
      amplitude["amplitude-description"].textContent = "Signed amplitude at t = "
        + fixed(run.step * run.dt) + " T₀. Real is solid and imaginary is dashed.";
    }

    if (histogram) {
      const max = Math.max(1, ...run.samples.bins);
      histogram["histogram-max"].textContent = String(max);
      histogram["histogram-description"].textContent = run.samples.count === 0
        ? "No position measurements yet."
        : run.samples.count + " conditional detections at t = " + fixed(run.step * run.dt)
          + " T₀, in bins 2 L₀ wide.";
      bars.forEach((bar, index) => {
        const height = 85 * run.samples.bins[index] / max;
        bar.setAttribute("y", 105 - height);
        bar.setAttribute("height", height);
      });
    }

    if (chamber && open) {
      if (previousChamberRun !== run) {
        const equipment = potentialRuns(run).filter(part => part.value !== 0);
        chamber["chamber-equipment"].replaceChildren(...equipment.map(({ from, to, value }) =>
          svg("rect", {
            x: plotX(from), width: plotX(to) - plotX(from),
            y: 105 - 5.5 * Math.max(0, value), height: 5.5 * Math.abs(value)
          })
        ));
        previousChamberRun = run;
      }
      chamber["chamber-wave"].setAttribute("d", wavePath(run, j => 135 - 82 * density(run, j) / ceiling));
      chamber["chamber-marks"].replaceChildren(...run.samples.recent.map(x =>
        svg("circle", { cx: plotX(x), cy: 155, r: 2.8 })
      ));
      chamber["chamber-description"].textContent = summary
        + " Equipment follows the potential. Circles on the rail mark sampled positions.";
    } else if (chamber && previousChamberRun) {
      chamber["chamber-equipment"].replaceChildren();
      chamber["chamber-marks"].replaceChildren();
      previousChamberRun = null;
    }
  };
}

function initializeLesson(root) {
  const ids = [
    "static-note", "opening-form", "opening-controls", "opening-feedback",
    "source-controls", "potential-controls", "run-controls", "sampling-controls", "mission-controls",
    ...Object.keys(LIMITS), "preset", "height-label", "width-label", "location-label",
    "height-field", "gap-field", "potential-note", "play", "pause", "step", "restart", "reset",
    "run-note", "show-real", "show-imag", "amplitude-panel", "plot-summary", "time", "norm",
    "absorbed", "drift", "central-energy", "mean-energy", "left-probability", "inside-probability",
    "right-probability", "cavity-readout", "cavity-probability", "measure", "measure-batch",
    "clear-samples", "sample-note", "sample-time", "sample-count", "sample-latest", "sample-right",
    "lab-status", "enter", "chamber", "chamber-title", "chamber-summary", "mission-select",
    "load-mission", "replay", "evaluate", "return", "mission-goal", "mission-hint", "mission-state",
    "mission-forecast-pane", "forecast", "commit", "report", "report-forecast", "report-theory",
    "report-observed", "report-count", "report-error", "mission-status"
  ];
  const elements = Object.fromEntries(ids.map(id => [id, root.querySelector("#sc-" + id)]));
  if (Object.values(elements).some(element => !element)) return;

  const fieldsets = ["opening", "source", "potential", "run", "sampling", "mission"];
  const answers = [...elements["opening-form"].querySelectorAll('input[name="sc-opening-answer"]')];

  function hasValues(controls, values) {
    return controls.length === values.length && values.every(value => controls.some(node => node.value === value));
  }

  function matchesSelect(node, values) {
    return node.tagName === "SELECT" && hasValues([...node.options], values);
  }

  if (
    fieldsets.some(id => elements[id + "-controls"].tagName !== "FIELDSET") ||
    elements["opening-form"].tagName !== "FORM" || elements.forecast.type !== "number" ||
    !hasValues(answers, Object.keys(OPENING_FEEDBACK)) ||
    !matchesSelect(elements.preset, Object.keys(PRESETS)) ||
    !matchesSelect(elements["mission-select"], Object.keys(MISSIONS)) ||
    Object.entries(LIMITS).some(([id, [min, max, step]]) => {
      const node = elements[id];
      return node.type !== "number" || Number(node.min) !== min
        || Number(node.max) !== max || Number(node.step) !== step;
    })
  ) return;

  const document = root.ownerDocument;
  const window = document.defaultView;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const draw = initializeCharts(root);
  let explorer = makeRun(OPENING);
  let mission = null;
  let chamberOpen = false;
  let frame = null;
  let targetStep = Infinity;
  let previousFrame = null;
  let lastDraw = -Infinity;
  let accumulator = 0;
  const current = () => mission?.run ?? explorer;

  function write(id, value) {
    const text = String(value);
    if (elements[id].textContent !== text) elements[id].textContent = text;
  }

  function configure() {
    const { setup } = current();
    for (const id of Object.keys(LIMITS)) elements[id].value = String(setup[id]);
    elements.preset.value = setup.preset;
    elements["source-controls"].disabled = mission !== null;
    elements["potential-controls"].disabled = mission !== null;
    elements["height-field"].hidden = setup.preset === "free";
    elements["gap-field"].hidden = setup.preset !== "double";
    write("height-label", setup.preset === "well" ? "Well depth (E₀)" : "Barrier height (E₀)");
    write("width-label", setup.preset === "free" ? "Marked width (L₀)"
      : setup.preset === "well" ? "Well width (L₀)" : "Barrier width (L₀)");
    write("location-label", setup.preset === "free" ? "Marked center (L₀)"
      : setup.preset === "well" ? "Well center (L₀)" : "Profile center (L₀)");
    write("potential-note", setup.preset === "free"
      ? "V is zero. Width and center place the marked measurement region."
      : "A change rebuilds the fixed potential at t = 0. Select Free to keep the packet settings and remove the obstacle.");
  }

  function forecastPending() {
    return mission?.key === "forecast" && !mission.report;
  }

  function atObjective() {
    return mission !== null && current().step >= mission.stopStep;
  }

  function render(data = inspect(current())) {
    const run = current();
    const { setup, samples } = run;
    const time = fixed(run.step * run.dt);
    const central = setup.momentum ** 2 / (2 * setup.mass);
    const running = frame !== null;
    const needsForecast = mission?.key === "forecast" && mission.forecast === null;
    const canMeasure = !forecastPending() && data.norm >= SURVIVAL_FLOOR;
    const summary = PRESETS[setup.preset] + " at t = " + time + " T₀. Marked region ["
      + fixed(run.coordinate(run.left)) + ", " + fixed(run.coordinate(run.right))
      + ") L₀. Absorbing bands start beyond ±45 L₀."
      + (setup.preset === "double" ? " Dotted lines bound the cavity." : "");

    write("time", time + " T₀");
    write("norm", percent(data.norm, 6));
    write("absorbed", percent(run.absorbed, 6));
    write("drift", fixed(100 * (data.norm + run.absorbed - run.initialNorm), 6) + " pp");
    write("central-energy", fixed(central, 4) + " E₀");
    write("mean-energy", fixed(central + 1 / (8 * setup.mass * setup.sigma ** 2), 4) + " E₀");
    for (const [id, value] of [["left", data.before], ["inside", data.inside], ["right", data.after], ["cavity", data.cavity]]) {
      write(id + "-probability", forecastPending() ? "Revealed after scoring" : percent(value, 6));
    }
    elements["cavity-readout"].hidden = setup.preset !== "double";
    write("plot-summary", summary);
    write("chamber-summary", summary + " Equipment and density use independent vertical scales.");
    write("run-note", running ? (motion.matches ? "Calculating the next still snapshot." : "Evolving at a fixed solver time step.")
      : "Paused. Step advances 0.10 T₀, or stops at the assignment time.");
    write("sample-note", canMeasure ? "Conditional sampling uses the surviving norm. Bins are 2 L₀ wide."
      : forecastPending() ? "The prediction assignment collects its batch after scoring."
      : "Surviving probability is too small for conditional sampling.");
    write("sample-time", samples.count ? time + " T₀" : "—");
    write("sample-count", samples.count);
    write("sample-latest", samples.last === null ? "—" : fixed(samples.last) + " L₀");
    write("sample-right", samples.count ? percent(samples.right / samples.count) : "—");

    elements.play.disabled = running || needsForecast || atObjective();
    elements.pause.disabled = !running;
    elements.step.disabled = running || needsForecast || atObjective();
    elements.measure.disabled = !canMeasure;
    elements["measure-batch"].disabled = !canMeasure;
    elements["clear-samples"].disabled = samples.count === 0;
    elements["amplitude-panel"].hidden = !elements["show-real"].checked && !elements["show-imag"].checked;
    elements.chamber.hidden = !chamberOpen;
    elements.enter.hidden = chamberOpen;
    elements.enter.setAttribute("aria-expanded", String(chamberOpen));
    elements.replay.disabled = mission === null;
    elements.evaluate.disabled = !atObjective() || running || mission.evaluated;
    elements["mission-forecast-pane"].hidden = mission?.key !== "forecast";
    elements.forecast.disabled = mission?.forecast != null;
    elements.commit.disabled = mission?.forecast != null;
    elements.report.hidden = !mission?.report;

    if (mission) {
      write("mission-state", mission.evaluated ? "Objective checked. Replay to run it again."
        : needsForecast ? "Commit a forecast before launching."
        : atObjective() ? "Observation time reached. Check the objective."
        : "Use Launch or Step in the lab. The run pauses at t = " + mission.definition.time + " T₀.");
    }

    const report = mission?.report;
    write("report-forecast", report ? fixed(mission.forecast, 1) + "%" : "—");
    write("report-theory", report ? percent(report.theory) : "—");
    write("report-observed", report ? percent(report.observed) : "—");
    write("report-count", report ? SAMPLE_COUNT : "—");
    write("report-error", report ? fixed(report.error) + " percentage points" : "—");

    draw(run, data, summary, chamberOpen, elements["show-real"].checked, elements["show-imag"].checked);
  }

  function stop() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    previousFrame = null;
    accumulator = 0;
  }

  function advance(count) {
    const run = current();
    const finalStep = Math.min(run.step + count, mission?.stopStep ?? Infinity);
    if (finalStep <= run.step) return;
    if (run.samples.count) run.samples = emptySamples();
    while (run.step < finalStep) {
      propagate(run);
      if (mission?.reference) propagate(mission.reference);
    }
  }

  function tick(now) {
    if (previousFrame === null) previousFrame = now;
    accumulator += Math.min(0.08, (now - previousFrame) / 1000) * 3 / DT;
    previousFrame = now;
    const count = motion.matches ? MAX_FRAME_STEPS : Math.min(MAX_FRAME_STEPS, Math.floor(accumulator));
    if (!motion.matches) accumulator = Math.max(0, accumulator - count);
    advance(Math.min(count, targetStep - current().step));

    if (current().step >= targetStep) {
      stop();
      render();
      write("lab-status", atObjective() ? "Observation time reached. Check the chamber objective."
        : "Snapshot ready at t = " + fixed(current().step * DT) + " T₀.");
      return;
    }

    frame = window.requestAnimationFrame(tick);
    if (!motion.matches && now - lastDraw >= 32) {
      lastDraw = now;
      render();
    }
  }

  elements.play.addEventListener("click", () => {
    if (frame !== null || atObjective() || (forecastPending() && mission.forecast === null)) return;
    targetStep = mission?.stopStep ?? (motion.matches ? current().step + Math.round(1 / DT) : Infinity);
    frame = window.requestAnimationFrame(tick);
    render();
  });

  elements.pause.addEventListener("click", () => {
    stop();
    render();
    write("lab-status", "Paused at t = " + fixed(current().step * DT) + " T₀.");
  });

  elements.step.addEventListener("click", () => {
    if (frame !== null || atObjective() || (forecastPending() && mission.forecast === null)) return;
    advance(STEP_COUNT);
    render();
    if (atObjective()) write("lab-status", "Observation time reached. Check the chamber objective.");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && frame !== null) {
      stop();
      render();
      write("lab-status", "Playback paused while the page is hidden.");
    }
  });

  motion.addEventListener("change", () => {
    if (frame === null) return;
    stop();
    render();
    write("lab-status", "Motion preference changed. Evolution is paused.");
  });

  function changePreparation(id, value) {
    if (mission || explorer.setup[id] === value) return;
    stop();
    explorer = makeRun({ ...explorer.setup, [id]: value });
    configure();
    render();
    write("lab-status", "Preparation updated. Paused at t = 0 with a fresh measurement set.");
  }

  for (const [id, [min, max, step]] of Object.entries(LIMITS)) {
    elements[id].addEventListener("change", () => {
      const value = elements[id].valueAsNumber;
      const steps = (value - min) / step;
      if (Number.isFinite(value) && value >= min && value <= max && Math.abs(steps - Math.round(steps)) < 1e-8) {
        changePreparation(id, value);
      } else {
        write("lab-status", "Enter a value within the displayed control’s range and step.");
      }
      configure();
    });
  }

  elements.preset.addEventListener("change", () => {
    if (Object.hasOwn(PRESETS, elements.preset.value)) changePreparation("preset", elements.preset.value);
    configure();
  });

  for (const id of ["show-real", "show-imag"]) elements[id].addEventListener("change", () => render());

  function measure(count) {
    if (forecastPending()) return;
    stop();
    const run = current();
    const sampled = samplePositions(run, count);
    render();
    write("lab-status", sampled
      ? count + " conditional " + (count === 1 ? "detection" : "detections") + " at t = "
        + fixed(run.step * DT) + " T₀. " + run.samples.count + " in this sample set."
      : "The surviving norm is too small for conditional sampling.");
  }

  elements.measure.addEventListener("click", () => measure(1));
  elements["measure-batch"].addEventListener("click", () => measure(SAMPLE_COUNT));
  elements["clear-samples"].addEventListener("click", () => {
    current().samples = emptySamples();
    render();
    write("lab-status", "Measurements cleared.");
  });

  function startMission(key) {
    if (!chamberOpen || !Object.hasOwn(MISSIONS, key)) return;
    stop();
    const definition = MISSIONS[key];
    const setup = { ...OPENING, ...definition.setup };
    const run = makeRun(setup);
    const reference = key === "trap" ? makeRun({ ...setup, preset: "free" }) : null;
    mission = {
      key, definition, run, reference, stopStep: Math.round(definition.time / DT),
      baseline: inspect(run).after, forecast: null, report: null, evaluated: false
    };
    elements["mission-select"].value = key;
    elements.forecast.value = "";
    write("mission-goal", definition.name + ". " + definition.goal);
    write("mission-hint", definition.hint);
    write("lab-status", "");
    configure();
    render();
    write("mission-status", definition.name + " loaded at t = 0.");
    if (key === "forecast") elements.forecast.focus();
  }

  elements.restart.addEventListener("click", () => {
    if (mission) {
      startMission(mission.key);
      return;
    }
    stop();
    explorer = makeRun(explorer.setup);
    configure();
    render();
    write("lab-status", "Same preparation restarted at t = 0.");
  });

  elements.reset.addEventListener("click", () => {
    stop();
    explorer = makeRun(OPENING);
    mission = null;
    chamberOpen = false;
    elements["show-real"].checked = false;
    elements["show-imag"].checked = false;
    elements.forecast.value = "";
    elements["mission-select"].value = "escape";
    elements["opening-form"].reset();
    write("opening-feedback", "");
    write("mission-status", "");
    configure();
    render();
    write("lab-status", "Opening packet and barrier restored. Time and detections reset.");
  });

  elements.enter.addEventListener("click", () => {
    stop();
    chamberOpen = true;
    write("mission-goal", "Free exploration is active. Load an assignment to set its preparation and observation time.");
    write("mission-hint", "");
    write("mission-state", "Assignments pause at their observation time. Use the lab’s Launch or Step controls to get there.");
    render();
    elements["chamber-title"].focus();
  });

  elements["load-mission"].addEventListener("click", () => startMission(elements["mission-select"].value));
  elements.replay.addEventListener("click", () => { if (mission) startMission(mission.key); });
  elements.return.addEventListener("click", () => {
    stop();
    mission = null;
    chamberOpen = false;
    write("mission-status", "");
    configure();
    render();
    elements.enter.focus();
    write("lab-status", "Returned to free exploration at its previous snapshot.");
  });

  function commitForecast() {
    if (mission?.key !== "forecast" || mission.forecast !== null) return;
    const value = elements.forecast.valueAsNumber;
    if (!Number.isFinite(value) || value < 0 || value > 100 || Math.abs(10 * value - Math.round(10 * value)) > 1e-8) {
      write("mission-status", "Enter a forecast from 0 to 100 with at most one decimal place.");
      elements.forecast.focus();
      return;
    }
    mission.forecast = value;
    render();
    elements.play.focus();
    write("mission-status", "Forecast committed at " + fixed(value, 1) + "%. Launch or step to t = 16 T₀.");
  }

  elements.commit.addEventListener("click", commitForecast);
  elements.forecast.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitForecast();
    }
  });

  elements.evaluate.addEventListener("click", () => {
    if (!atObjective() || frame !== null || mission.evaluated) return;
    const { key, run, baseline, reference, forecast } = mission;
    const data = inspect(run);
    let message;

    if (key === "escape") {
      const gain = data.after - baseline;
      message = (gain >= 0.001 ? "Objective met. " : "Objective missed. ")
        + "Far-side mass grew from " + percent(baseline, 6) + " to " + percent(data.after)
        + ". The packet has an energy spread. Above-barrier components can contribute, and finite barriers also transmit sub-barrier amplitudes.";
    } else if (key === "pinball") {
      message = (data.cavity >= 0.05 && data.returned >= 0.05 ? "Objective met. " : "Objective missed. ")
        + "The cavity holds " + percent(data.cavity) + ". The far entrance side holds "
        + percent(data.returned) + " after reflection.";
    } else if (key === "trap") {
      const comparison = inspect(reference).inside;
      message = (data.inside - comparison >= 0.05 ? "Objective met. " : "Objective missed. ")
        + "The well retains " + percent(data.inside) + " at t = 12 T₀. The matched free run retains "
        + percent(comparison) + " in the same interval. These values describe finite-time retention.";
    } else {
      if (forecast === null || data.norm < SURVIVAL_FLOOR) return;
      const theory = data.after / data.norm;
      const error = Math.abs(forecast - 100 * theory);
      samplePositions(run, SAMPLE_COUNT);
      mission.report = { theory, error, observed: run.samples.right / run.samples.count };
      message = (error <= 5 + 1e-10 ? "Forecast within tolerance. " : "Forecast outside tolerance. ")
        + "Error " + fixed(error) + " percentage points. The report compares theory with 200 conditional draws.";
    }

    mission.evaluated = true;
    render(data);
    elements.replay.focus();
    write("mission-status", message);
  });

  elements["opening-form"].addEventListener("change", () => write("opening-feedback", ""));
  elements["opening-form"].addEventListener("submit", event => {
    event.preventDefault();
    const answer = answers.find(input => input.checked)?.value;
    if (Object.hasOwn(OPENING_FEEDBACK, answer)) write("opening-feedback", OPENING_FEEDBACK[answer]);
  });

  elements["opening-form"].reset();
  configure();
  render();
  for (const id of fieldsets) elements[id + "-controls"].disabled = false;
  elements.enter.disabled = false;
  elements["static-note"].hidden = true;
}

const lesson = document.querySelector(".site-main.schrodinger-lesson");
if (lesson) initializeLesson(lesson);