const MIN_X = -5;
const MAX_X = 5;
const BIN_WIDTH = 0.25;
const BIN_COUNT = (MAX_X - MIN_X) / BIN_WIDTH;
const SVG_NS = "http://www.w3.org/2000/svg";
const OPENING = { preset: "single", mu: 0, sigma: 1, phase: 0, probe: 0, a: -1, b: 1 };
const BATCH_SIZES = ["100", "500", "1000"];
const PRESETS = ["single", "coherent"];
const SCANNER_TOLERANCE = 0.50; // percentage points
const SCANNER_IDLE = "Choose New target to begin.";
const QUIZ_FEEDBACK = {
  zero: "The density is zero at the center. A finite window also includes nearby positions where the density is positive, so the integral can be positive.",
  nonzero: "Correct. The node makes the density zero at one position. The detector probability is the area under the curve across the whole window."
};

// Standard-normal upper tail for z >= 0. Substitute x = z + t/(1-t)
// in the integral from z to infinity, then apply composite Simpson's rule
// on [0, 1]. The transformed integrand tends to zero at t = 1.
function normalTail(z) {
  if (z === 0) return 0.5;

  const panels = 256;
  let sum = 1;
  for (let index = 1; index < panels; index += 1) {
    const t = index / panels;
    const remaining = 1 - t;
    const offset = t / remaining;
    const value = Math.exp(-z * offset - 0.5 * offset ** 2) / remaining ** 2;
    sum += (index % 2 === 0 ? 2 : 4) * value;
  }
  return Math.exp(-0.5 * z ** 2) * sum / (3 * panels * Math.sqrt(2 * Math.PI));
}

function gaussianInterval(a, b, center, sigma) {
  const left = (a - center) / sigma;
  const right = (b - center) / sigma;

  // Use tail differences on one side of the center to avoid subtracting
  // cumulative probabilities that have both rounded to one.
  if (left >= 0) return normalTail(left) - normalTail(right);
  if (right <= 0) return normalTail(-right) - normalTail(-left);
  return 1 - normalTail(-left) - normalTail(right);
}

function makePreparation({ preset, mu, sigma, phase }) {
  const degrees = phase % 360;
  const radians = degrees * Math.PI / 180;
  const cosine = degrees === 90 || degrees === 270 ? 0 : Math.cos(radians);
  const sine = degrees === 0 || degrees === 180 ? 0 : Math.sin(radians);
  const overlap = Math.exp(-1 / (2 * sigma ** 2));
  const cross = 2 * overlap * cosine;
  const norm = 2 + cross;
  const amplitudeScale = (2 * Math.PI * sigma ** 2) ** (-1 / 4);

  return { preset, mu, sigma, phase, cosine, sine, cross, norm, amplitudeScale };
}

function waveAt(preparation, x) {
  const { preset, mu, sigma, cosine, sine, norm, amplitudeScale } = preparation;
  const packet = center => amplitudeScale * Math.exp(-0.25 * ((x - center) / sigma) ** 2);

  if (preset === "single") {
    const re = packet(mu);
    return { re, im: 0, density: re ** 2 };
  }

  const right = packet(1);
  const re = (packet(-1) + cosine * right) / Math.sqrt(norm);
  const im = sine * right / Math.sqrt(norm);
  return { re, im, density: re ** 2 + im ** 2 };
}

function intervalProbability(preparation, a, b) {
  if (a >= b) return 0;

  const { preset, mu, sigma, norm, cross } = preparation;
  const interval = center => gaussianInterval(a, b, center, sigma);
  const probability = preset === "single"
    ? interval(mu)
    : (interval(-1) + interval(1) + cross * interval(0)) / norm;

  // Only remove excursions consistent with numerical integration error.
  if (probability < 0 && probability > -1e-9) return 0;
  if (probability > 1 && probability < 1 + 1e-9) return 1;
  return probability;
}

function normalDraw(random) {
  const radius = Math.sqrt(-2 * Math.log1p(-random()));
  return radius * Math.cos(2 * Math.PI * random());
}

function samplePosition(preparation, random = Math.random) {
  const { preset, mu, sigma, cosine } = preparation;
  if (preset === "single") return mu + sigma * normalDraw(random);

  for (;;) {
    const center = random() < 0.5 ? -1 : 1;
    const position = center + sigma * normalDraw(random);

    // For centers -1 and +1, 2*gL*gR/(gL²+gR²) = sech(x/sigma²).
    // This form also works where both component densities are tiny.
    const overlapRatio = 1 / Math.cosh(position / sigma ** 2);
    const acceptance = (1 + cosine * overlapRatio) / 2;
    if (random() < acceptance) return position;
  }
}

function newRun() {
  return { samples: [], bins: new Uint32Array(BIN_COUNT), outside: 0, latest: null };
}

function addDetection(run, position) {
  run.samples.push(position);
  run.latest = position;
  if (position < MIN_X || position > MAX_X) {
    run.outside += 1;
    return;
  }

  const bin = Math.min(BIN_COUNT - 1, Math.floor((position - MIN_X) / BIN_WIDTH));
  run.bins[bin] += 1;
}

function hitCount(run, a, b) {
  if (a === b) return 0;

  let hits = 0;
  for (const x of run.samples) {
    if (x >= a && x <= b) hits += 1;
  }
  return hits;
}

function fixed(value, digits) {
  const magnitude = Math.abs(value).toFixed(digits);
  return value < 0 && Number(magnitude) !== 0 ? "−" + magnitude : magnitude;
}

function percent(value, digits = 2) {
  return (100 * value).toFixed(digits) + "%";
}

function finiteWindowPercent(value, digits) {
  const magnitude = 100 * value;
  const unit = 10 ** -digits;
  if (value > 0 && magnitude < unit / 2) return "<" + unit.toFixed(digits) + "%";
  if (magnitude >= 100 - unit / 2) {
    return ">" + (100 - unit).toFixed(digits) + "%";
  }
  return percent(value, digits);
}

function chooseTarget(preparation, a, b, previous, random = Math.random) {
  const current = 100 * intervalProbability(preparation, a, b);
  const center = preparation.preset === "single" ? preparation.mu : 0;
  const candidates = [];

  // Each candidate comes from a valid pair of slider endpoints.
  for (let offset = 1; offset <= 30; offset += 1) {
    const left = Math.round(10 * center - offset) / 10;
    const right = Math.round(10 * center + offset) / 10;
    const target = Math.round(1000 * intervalProbability(preparation, left, right)) / 10;
    if (target < 15 || target > 85 || Math.abs(target - current) < 3) continue;
    if (previous !== null && Math.abs(target - previous) < 1) continue;
    candidates.push(target);
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

function plotX(x) {
  return 58 + (x - MIN_X) * 48.4;
}

function pathFor(start, end, segments, toY) {
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const x = start + (end - start) * index / segments;
    points.push(plotX(x).toFixed(2) + " " + toY(x).toFixed(2));
  }
  return "M" + points.join(" L");
}

function setLineX(line, x) {
  const position = plotX(x);
  line.setAttribute("x1", position);
  line.setAttribute("x2", position);
}

function initializePlots(root) {
  const find = id => root.querySelector("#wf-" + id);
  const amplitudePlot = find("amplitude-plot");
  const densityPlot = find("density-plot");
  const amplitude = {
    real: find("real-curve"), imag: find("imag-curve"), probe: find("amplitude-probe"),
    description: find("amplitude-description")
  };
  const density = {
    curve: find("density-curve"), area: find("detector-area"), histogram: find("histogram"),
    left: find("detector-left"), right: find("detector-right"), probe: find("density-probe"),
    description: find("density-description")
  };
  const ticks = [1, 2, 3, 4].map(index => find("density-tick-" + index));
  const hasAmplitude = amplitudePlot && Object.values(amplitude).every(Boolean);
  const hasDensity = densityPlot && Object.values(density).every(Boolean) && ticks.every(Boolean);
  const bars = [];

  if (amplitudePlot && !hasAmplitude) amplitudePlot.setAttribute("hidden", "");
  if (densityPlot && !hasDensity) densityPlot.setAttribute("hidden", "");

  if (hasDensity) {
    const document = root.ownerDocument;
    const width = plotX(MIN_X + BIN_WIDTH) - plotX(MIN_X);
    for (let index = 0; index < BIN_COUNT; index += 1) {
      const bar = document.createElementNS(SVG_NS, "rect");
      bar.setAttribute("x", plotX(MIN_X + index * BIN_WIDTH));
      bar.setAttribute("width", width);
      density.histogram.append(bar);
      bars.push(bar);
    }
  }

  return function renderPlots(preparation, { probe, a, b }, run, summary) {
    if (hasAmplitude) {
      amplitude.real.setAttribute("d", pathFor(MIN_X, MAX_X, 160, x =>
        80 - 62 * waveAt(preparation, x).re
      ));
      amplitude.imag.setAttribute("d", pathFor(MIN_X, MAX_X, 160, x =>
        80 - 62 * waveAt(preparation, x).im
      ));
      setLineX(amplitude.probe, probe);
      amplitude.description.textContent = summary
        + " Solid line is the real amplitude, dashed line is the imaginary amplitude.";
    }

    if (hasDensity) {
      const total = run.samples.length;
      const heights = Array.from(run.bins, count => total === 0 ? 0 : count / (total * BIN_WIDTH));
      const ceiling = Math.max(1, Math.ceil(Math.max(...heights)));
      const y = value => 142 - 124 * value / ceiling;
      const densityY = x => y(waveAt(preparation, x).density);

      ticks.forEach((tick, index) => { tick.textContent = String((index + 1) * ceiling / 4); });
      density.curve.setAttribute("d", pathFor(MIN_X, MAX_X, 160, densityY));
      const area = a === b ? "" : pathFor(a, b, Math.ceil((b - a) * 16), densityY)
        + " L" + plotX(b) + " 142 L" + plotX(a) + " 142 Z";
      density.area.setAttribute("d", area);
      setLineX(density.left, a);
      setLineX(density.right, b);
      setLineX(density.probe, probe);

      bars.forEach((bar, index) => {
        bar.setAttribute("y", y(heights[index]));
        bar.setAttribute("height", 142 - y(heights[index]));
      });
      density.description.textContent = summary
        + " Shading marks the area below the predicted density inside the detector. "
        + total + " simulated detections, " + run.outside + " outside the plot.";
    }
  };
}

function initializeLesson(root) {
  const ids = [
    "preparation-controls", "position-controls", "detection-controls", "scanner-controls", "quiz-controls",
    "static-note", "preset", "center-field", "phase-field", "mu", "sigma", "phase", "probe", "a", "b",
    "mu-value", "sigma-value", "phase-value", "probe-value", "a-value", "b-value",
    "scan-a", "scan-b", "scan-a-value", "scan-b-value",
    "plot-summary", "read-re", "read-im", "read-density", "read-interval", "read-visible",
    "batch-size", "detect-one", "detect-batch", "clear", "reset", "total", "hits", "observed",
    "outside", "last", "lab-status", "target-value", "scanner-state", "scanner-window",
    "new-target", "check", "retry", "end", "scanner-feedback", "quiz", "quiz-retry", "quiz-feedback"
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, root.querySelector("#wf-" + id)]));
  if (Object.values(nodes).some(node => !node)) return;

  const ranges = {
    mu: [-2, 2, 0.1, 1],
    sigma: [0.5, 1.5, 0.05, 2],
    phase: [0, 360, 1, 0],
    probe: [MIN_X, MAX_X, 0.1, 1],
    a: [MIN_X, MAX_X, 0.1, 1],
    b: [MIN_X, MAX_X, 0.1, 1],
    "scan-a": [MIN_X, MAX_X, 0.1, 1],
    "scan-b": [MIN_X, MAX_X, 0.1, 1]
  };
  const controlGroups = ["preparation", "position", "detection", "scanner", "quiz"];
  const shortcuts = [...root.querySelectorAll("button[data-wf-phase]")];
  const phases = ["0", "90", "180", "360"];
  const quizInputs = [...nodes.quiz.querySelectorAll('input[type="radio"][name="wf-quiz-answer"]')];

  function hasValues(values, expected) {
    return values.length === expected.length && expected.every(value => values.includes(value));
  }

  function hasOptions(node, expected) {
    return node.tagName === "SELECT"
      && hasValues(Array.from(node.options, option => option.value), expected);
  }

  if (
    controlGroups.some(group => nodes[group + "-controls"].tagName !== "FIELDSET") ||
    nodes.quiz.tagName !== "FORM" ||
    !hasOptions(nodes.preset, PRESETS) ||
    !hasOptions(nodes["batch-size"], BATCH_SIZES) ||
    !hasValues(shortcuts.map(button => button.dataset.wfPhase), phases) ||
    !hasValues(quizInputs.map(input => input.value), Object.keys(QUIZ_FEEDBACK)) ||
    Object.entries(ranges).some(([id, [min, max, step]]) => {
      const input = nodes[id];
      return input.type !== "range" || Number(input.min) !== min
        || Number(input.max) !== max || Number(input.step) !== step;
    })
  ) return;

  const drawPlots = initializePlots(root);
  const settings = { ...OPENING };
  let preparation = makePreparation(settings);
  let visibleProbability = intervalProbability(preparation, MIN_X, MAX_X);
  let run = newRun();
  let batchSize = "500";
  let challenge = null;
  let scannerIdle = SCANNER_IDLE;

  function write(id, value) {
    const text = String(value);
    if (nodes[id].textContent !== text) nodes[id].textContent = text;
  }

  function syncRange(id, value) {
    const input = nodes[id];
    const number = fixed(value, ranges[id][3]);
    const isPhase = id === "phase";
    input.value = String(value);
    input.setAttribute("aria-valuetext", number.replace("−", "minus ")
      + (isPhase ? " degrees" : " nanometers"));
    write(id + "-value", number + (isPhase ? "°" : " nm"));
  }

  function capture() {
    return intervalProbability(preparation, settings.a, settings.b);
  }

  function render() {
    const { preset, mu, sigma, phase, probe, a, b } = settings;
    const isCoherent = preset === "coherent";
    const aiming = challenge !== null && !challenge.checked;
    nodes.preset.value = preset;
    nodes["batch-size"].value = batchSize;
    nodes["center-field"].hidden = isCoherent;
    nodes["phase-field"].hidden = !isCoherent;
    for (const id of ["mu", "sigma", "phase", "probe", "a", "b"]) syncRange(id, settings[id]);
    syncRange("scan-a", a);
    syncRange("scan-b", b);

    const point = waveAt(preparation, probe);
    const stateLabel = isCoherent
      ? "Coherent packets at −1 and +1 nm with σ = " + fixed(sigma, 2) + " nm and φ = " + phase + "°."
      : "Single Gaussian centered at " + fixed(mu, 1) + " nm with σ = " + fixed(sigma, 2) + " nm.";
    const summary = stateLabel + " Probe at " + fixed(probe, 1) + " nm. Detector from "
      + fixed(a, 1) + " to " + fixed(b, 1) + " nm.";
    write("plot-summary", summary);
    write("read-re", fixed(point.re, 5) + " nm⁻¹ᐟ²");
    write("read-im", fixed(point.im, 5) + " nm⁻¹ᐟ²");
    write("read-density", fixed(point.density, 5) + " nm⁻¹");
    write("read-interval", aiming ? "Hidden until check" : finiteWindowPercent(capture(), 2));
    write("read-visible", finiteWindowPercent(visibleProbability, 5));

    const total = run.samples.length;
    const hits = hitCount(run, a, b);
    write("total", total);
    write("hits", hits);
    write("observed", total === 0 ? "—" : percent(hits / total));
    write("outside", run.outside);
    write("last", run.latest === null ? "—" : fixed(run.latest, 4) + " nm");

    nodes["scanner-window"].hidden = challenge === null;
    nodes["scan-a"].disabled = !aiming;
    nodes["scan-b"].disabled = !aiming;
    nodes.check.disabled = !aiming;
    nodes.retry.disabled = challenge === null || aiming;
    nodes.end.disabled = challenge === null;
    write("target-value", challenge === null ? "—" : challenge.target.toFixed(1) + "%");
    write("scanner-state", challenge === null ? scannerIdle : aiming
      ? "Adjust the edges and check your capture."
      : "Attempt scored. Try again to retry this target, or choose a new one.");

    drawPlots(preparation, settings, run, summary);
  }

  function endChallenge(message) {
    challenge = null;
    scannerIdle = message;
    write("scanner-feedback", "");
  }

  function updatePreparation(id, value) {
    if (settings[id] === value) return;

    const endedChallenge = challenge !== null;
    const clearedDetections = run.samples.length > 0;
    settings[id] = value;
    preparation = makePreparation(settings);
    visibleProbability = intervalProbability(preparation, MIN_X, MAX_X);
    run = newRun();
    if (endedChallenge) endChallenge("Preparation changed. Choose New target to start again.");
    render();

    if (endedChallenge || clearedDetections || id === "preset") {
      const scannerNote = endedChallenge ? " Scanner challenge ended." : "";
      write("lab-status", "Preparation updated. Detection count is zero." + scannerNote);
    }
  }

  function readRange(id) {
    const [min, max, step, digits] = ranges[id];
    const value = nodes[id].valueAsNumber;
    if (!Number.isFinite(value) || value < min || value > max) return null;
    return Number((min + Math.round((value - min) / step) * step).toFixed(digits));
  }

  nodes.preset.addEventListener("change", () => {
    const value = nodes.preset.value;
    if (PRESETS.includes(value)) updatePreparation("preset", value);
    else nodes.preset.value = settings.preset;
  });

  for (const id of ["mu", "sigma", "phase"]) {
    nodes[id].addEventListener("input", () => {
      const value = readRange(id);
      const visible = (id !== "mu" || settings.preset === "single")
        && (id !== "phase" || settings.preset === "coherent");
      if (value !== null && visible) updatePreparation(id, value);
      else syncRange(id, settings[id]);
    });
  }

  for (const shortcut of shortcuts) {
    shortcut.addEventListener("click", () => {
      if (settings.preset !== "coherent" || !phases.includes(shortcut.dataset.wfPhase)) return;
      const phase = Number(shortcut.dataset.wfPhase);
      if (settings.phase === phase) return;
      updatePreparation("phase", phase);
      write("lab-status", "Phase set to " + phase + " degrees. Detection count is zero.");
    });
  }

  nodes.probe.addEventListener("input", () => {
    const value = readRange("probe");
    if (value !== null) settings.probe = value;
    render();
  });

  for (const id of ["a", "b", "scan-a", "scan-b"]) {
    const edge = id.endsWith("a") ? "a" : "b";
    nodes[id].addEventListener("input", () => {
      if (id.startsWith("scan-") && (challenge === null || challenge.checked)) return;
      const value = readRange(id);
      if (value !== null) {
        settings[edge] = edge === "a" ? Math.min(value, settings.b) : Math.max(value, settings.a);
      }
      render();
    });
  }

  nodes["batch-size"].addEventListener("change", () => {
    if (BATCH_SIZES.includes(nodes["batch-size"].value)) batchSize = nodes["batch-size"].value;
    else nodes["batch-size"].value = batchSize;
  });

  function detect(count) {
    // Up to 1,000 synchronous draws, with one render and announcement.
    for (let index = 0; index < count; index += 1) {
      addDetection(run, samplePosition(preparation));
    }
    render();

    write("lab-status", count === 1
      ? "Detection " + run.samples.length + " at " + fixed(run.latest, 4) + " nanometers."
      : count + " detections added. " + run.samples.length + " total, "
        + hitCount(run, settings.a, settings.b) + " inside the detector.");
  }

  nodes["detect-one"].addEventListener("click", () => detect(1));
  nodes["detect-batch"].addEventListener("click", () => detect(Number(batchSize)));
  nodes.clear.addEventListener("click", () => {
    run = newRun();
    render();
    write("lab-status", "Detections cleared.");
  });

  nodes.reset.addEventListener("click", () => {
    Object.assign(settings, OPENING);
    preparation = makePreparation(settings);
    visibleProbability = intervalProbability(preparation, MIN_X, MAX_X);
    run = newRun();
    batchSize = "500";
    endChallenge(SCANNER_IDLE);
    render();
    write("lab-status", "Lab reset to the opening Gaussian. Detections and scanner target cleared.");
  });

  nodes["new-target"].addEventListener("click", () => {
    const target = chooseTarget(preparation, settings.a, settings.b, challenge?.target ?? null);
    if (target === null) {
      write("scanner-feedback", "Move a detector edge and choose New target again.");
      return;
    }

    challenge = { target, startA: settings.a, startB: settings.b, checked: false };
    render();
    write("scanner-feedback", "Target " + target.toFixed(1) + "%. Move the edges to estimate the area.");
  });

  nodes.check.addEventListener("click", () => {
    if (challenge === null || challenge.checked) return;

    const probability = capture();
    const difference = 100 * probability - challenge.target;
    const error = Math.abs(difference);
    challenge.checked = true;
    render();
    nodes.retry.focus();

    const result = error <= SCANNER_TOLERANCE + 1e-10 ? "Within tolerance." : "Outside tolerance.";
    const area = " Captured " + finiteWindowPercent(probability, 2)
      + " against a " + challenge.target.toFixed(1) + "% target.";
    if (error < 1e-10) {
      write("scanner-feedback", result + area + " Error 0.00 percentage points.");
      return;
    }

    const direction = difference < 0 ? "low" : "high";
    const amount = error < 0.005 ? "Less than 0.01" : error.toFixed(2);
    const hint = difference < 0
      ? " Widen the window toward a region with higher density."
      : " Bring an edge inward to reduce the covered area.";
    write("scanner-feedback", result + area + " " + amount + " percentage points " + direction + "." + hint);
  });

  nodes.retry.addEventListener("click", () => {
    if (challenge === null || !challenge.checked) return;

    settings.a = challenge.startA;
    settings.b = challenge.startB;
    challenge.checked = false;
    render();
    nodes["scan-a"].focus();
    write("scanner-feedback", "Same target, " + challenge.target.toFixed(1) + "%. Starting window restored.");
  });

  nodes.end.addEventListener("click", () => {
    if (challenge === null) return;

    endChallenge(SCANNER_IDLE);
    render();
    nodes["new-target"].focus();
    write("scanner-feedback", "Challenge ended. The lab again shows the detector probability.");
  });

  nodes.quiz.addEventListener("change", () => write("quiz-feedback", ""));
  nodes.quiz.addEventListener("submit", event => {
    event.preventDefault();
    const answer = quizInputs.find(input => input.checked)?.value;
    if (!Object.hasOwn(QUIZ_FEEDBACK, answer)) {
      write("quiz-feedback", "Choose one answer first.");
      quizInputs[0].focus();
      return;
    }

    write("quiz-feedback", QUIZ_FEEDBACK[answer]);
    nodes["quiz-retry"].hidden = false;
  });
  nodes["quiz-retry"].addEventListener("click", () => {
    nodes.quiz.reset();
    write("quiz-feedback", "");
    nodes["quiz-retry"].hidden = true;
    quizInputs[0].focus();
  });

  nodes.quiz.reset();
  render();
  for (const group of controlGroups) nodes[group + "-controls"].disabled = false;
  nodes["static-note"].hidden = true;
}

const lesson = document.querySelector(".site-main.wavefunction-lesson");
if (lesson) initializeLesson(lesson);