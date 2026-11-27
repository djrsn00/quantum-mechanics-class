const MIN = -6;
const MAX = 6;
const BIN_WIDTH = 0.25;
const BIN_COUNT = (MAX - MIN) / BIN_WIDTH;
const SVG_NS = "http://www.w3.org/2000/svg";
const SQRT_2PI = Math.sqrt(2 * Math.PI);
const BATCH_SIZES = ["100", "500", "1000"];
const PRESETS = ["gaussian", "coherent"];
const MISSION_COUNT = 200;
const TOLERANCE = 5; // percentage points
const OPENING = { preset: "gaussian", sigma: 1, carrier: 0, separation: 2, phase: 0 };

const VIEWS = {
  position: { name: "Position Space", variable: "x", unit: "nm", density: "nm⁻¹", speech: "nanometers" },
  momentum: { name: "Momentum Space", variable: "p", unit: "ℏ/nm", density: "(ℏ/nm)⁻¹", speech: "h-bar per nanometer" }
};

const MISSIONS = [
  {
    name: "Original momentum gate",
    brief: "A Gaussian source narrows from 1 to 0.5 nm at central momentum 0 ℏ/nm. Estimate the fraction the original momentum gate will catch.",
    setup: { sigma: 0.5 }, view: "momentum", gate: [-0.5, 0.5]
  },
  {
    name: "Crosswind at the outpost",
    brief: "The Gaussian’s spatial phase shifts its central momentum toward positive values. Estimate how much of the wind spectrum the old, zero-centered gate still covers.",
    setup: { carrier: 1 }, view: "momentum", gate: [-0.5, 0.5]
  },
  {
    name: "Quiet band in the spectrum",
    brief: "The two coherent packets are out of phase. Inspect the minimum at the carrier momentum, then forecast how much the finite gate around it will catch.",
    setup: { preset: "coherent", phase: 180 }, view: "momentum", gate: [-0.5, 0.5]
  },
  {
    name: "Fog survey",
    brief: "The station switches to a position survey of two in-phase packets. Forecast the fraction of detections between the two packet centers.",
    setup: { preset: "coherent", sigma: 0.75, separation: 3 }, view: "position", gate: [-1.5, 1.5]
  }
];

const QUIZ_FEEDBACK = {
  same: "Position probabilities give the magnitude squared of the wavefunction. A change in spatial phase can leave those probabilities fixed and shift the momentum distribution.",
  phase: "Correct. A carrier phase exp(ip₀x/ℏ) leaves the position density fixed and translates the momentum density by p₀."
};

// Internal coordinate numbers are in nm and h-bar/nm, so q*d is an angle.
function prepare(setup) {
  const { preset, sigma, carrier, separation, phase } = setup;
  const coherent = preset === "coherent";
  const degrees = phase % 360;
  const theta = degrees * Math.PI / 180;
  const cosine = degrees === 90 || degrees === 270 ? 0 : Math.cos(theta);
  const sine = degrees === 0 || degrees === 180 ? 0 : Math.sin(theta);
  const overlap = Math.exp(-(separation ** 2) / (8 * sigma ** 2));
  const cross = overlap * cosine;
  const z = 1 + cross;
  const t = 1 / (2 * sigma);
  const meanQ = overlap * separation * t ** 2 * sine / z;
  const varianceQ = t ** 2 - cross * separation ** 2 * t ** 4 / z - meanQ ** 2;
  const widthX = coherent ? Math.sqrt(sigma ** 2 + separation ** 2 / (4 * z)) : sigma;
  const widthP = coherent ? Math.sqrt(varianceQ) : t;

  return {
    ...setup, coherent, theta, cosine, cross, z, t, widthX, widthP,
    meanP: coherent ? carrier + meanQ : carrier
  };
}

function gaussianDensity(x, mean, width) {
  return Math.exp(-0.5 * ((x - mean) / width) ** 2) / (SQRT_2PI * width);
}

function density(model, view, coordinate) {
  const { coherent, sigma, carrier, separation, t, theta, cosine, z } = model;
  if (view === "momentum") {
    const q = coordinate - carrier;
    const envelope = gaussianDensity(q, 0, t);
    return coherent ? envelope * (1 + Math.cos(theta - q * separation)) / z : envelope;
  }
  if (!coherent) return gaussianDensity(coordinate, 0, sigma);

  const left = Math.sqrt(gaussianDensity(coordinate, -separation / 2, sigma));
  const right = Math.sqrt(gaussianDensity(coordinate, separation / 2, sigma));
  return ((left - right) ** 2 + 2 * (1 + cosine) * left * right) / (2 * z);
}

// From Lesson 20: map the infinite normal tail to [0,1] using an offset
// t/(1-t). Composite Simpson quadrature approximates the transformed CDF.
function normalTail(z) {
  if (z === 0) return 0.5;
  const panels = 256;
  let sum = 1;
  for (let index = 1; index < panels; index += 1) {
    const t = index / panels;
    const offset = t / (1 - t);
    const integrand = Math.exp(-z * offset - 0.5 * offset ** 2) / (1 - t) ** 2;
    sum += (index % 2 ? 4 : 2) * integrand;
  }
  return Math.exp(-0.5 * z ** 2) * sum / (3 * panels * SQRT_2PI);
}

function gaussianInterval(a, b, center, sigma) {
  const left = (a - center) / sigma;
  const right = (b - center) / sigma;
  if (left >= 0) return normalTail(left) - normalTail(right);
  if (right <= 0) return normalTail(-right) - normalTail(-left);
  return 1 - normalTail(-left) - normalTail(right);
}

function gateProbability(model, view, a, b) {
  if (a >= b) return 0;
  if (!model.coherent) {
    return view === "position"
      ? gaussianInterval(a, b, 0, model.sigma)
      : gaussianInterval(a, b, model.carrier, model.t);
  }

  let probability;
  if (view === "position") {
    const interval = center => gaussianInterval(a, b, center, model.sigma);
    const half = model.separation / 2;
    probability = (interval(-half) + interval(half) + 2 * model.cross * interval(0)) / (2 * model.z);
  } else {
    // Integrate the analytic fringe density with Simpson panels of at most
    // 0.01 h-bar/nm, independent of SVG coordinates and display resolution.
    const panels = 2 * Math.ceil((b - a) / 0.02);
    const step = (b - a) / panels;
    let sum = density(model, view, a) + density(model, view, b);
    for (let index = 1; index < panels; index += 1) {
      sum += (index % 2 ? 4 : 2) * density(model, view, a + index * step);
    }
    probability = sum * step / 3;
  }

  if (probability < 0 && probability > -1e-9) return 0;
  if (probability > 1 && probability < 1 + 1e-9) return 1;
  return probability;
}

function normalDraw(random) {
  return Math.sqrt(-2 * Math.log1p(-random())) * Math.cos(2 * Math.PI * random());
}

function sample(model, view, random = Math.random) {
  const { coherent, sigma, carrier, separation, theta, cosine, t } = model;
  if (view === "momentum") {
    for (;;) {
      const q = t * normalDraw(random);
      if (!coherent || random() < (1 + Math.cos(theta - q * separation)) / 2) return carrier + q;
    }
  }
  if (!coherent) return sigma * normalDraw(random);

  for (;;) {
    const center = (random() < 0.5 ? -1 : 1) * separation / 2;
    const x = center + sigma * normalDraw(random);
    // Stable form of 2*gL*gR/(gL²+gR²) for opposite packet offsets.
    const ratio = 1 / Math.cosh(x * separation / (2 * sigma ** 2));
    if (random() < (1 + cosine * ratio) / 2) return x;
  }
}

function newEnsemble() {
  return { positions: [], bins: Array(BIN_COUNT).fill(0), outside: 0 };
}

function newEnsembles() {
  return { position: newEnsemble(), momentum: newEnsemble() };
}

function newLab(setup = OPENING) {
  return {
    setup: { ...setup }, model: prepare(setup), view: "position", batchSize: "500",
    gates: { position: [-1, 1], momentum: [-0.5, 0.5] }, ensembles: newEnsembles()
  };
}

function collect(lab, count) {
  const run = lab.ensembles[lab.view];
  for (let index = 0; index < count; index += 1) {
    const value = sample(lab.model, lab.view);
    run.positions.push(value);
    if (value < MIN || value > MAX) {
      run.outside += 1;
    } else {
      const bin = Math.min(BIN_COUNT - 1, Math.floor((value - MIN) / BIN_WIDTH));
      run.bins[bin] += 1;
    }
  }
}

function countHits(run, [a, b]) {
  if (a >= b) return 0;
  let hits = 0;
  for (const value of run.positions) {
    if (value >= a && value <= b) hits += 1;
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

function finitePercent(value, digits = 2) {
  const resolution = 10 ** -digits;
  if (value > 0 && 100 * value < resolution / 2) return "<" + resolution.toFixed(digits) + "%";
  if (100 * value >= 100 - resolution / 2) return ">" + (100 - resolution).toFixed(digits) + "%";
  return percent(value, digits);
}

function plotX(value) {
  return 332 + 45 * value;
}

function plotPath(values, first, last, y) {
  return "M" + values.map((value, index) => {
    const x = first + (last - first) * index / (values.length - 1);
    return plotX(x).toFixed(2) + " " + y(value).toFixed(2);
  }).join(" L");
}

function profile(model, view, a, b, segments) {
  return Array.from({ length: segments + 1 }, (_, index) =>
    density(model, view, a + (b - a) * index / segments)
  );
}

function setEdge(node, x) {
  node.setAttribute("x1", plotX(x));
  node.setAttribute("x2", plotX(x));
}

function initializeCharts(root) {
  const get = id => root.querySelector("#mp-" + id);
  const ids = [
    "density-plot", "density-line", "gate-area", "histogram", "gate-left", "gate-right",
    "plot-description", "x-axis", "y1", "y2", "y3", "y4",
    "weather-plot", "weather-gate", "weather-fill", "weather-crest", "weather-left",
    "weather-right", "weather-marks", "weather-axis", "weather-description"
  ];
  const graph = Object.fromEntries(ids.map(id => [id, get(id)]));
  const coreIds = ids.slice(0, 12);
  const weatherIds = ids.slice(12);
  const document = root.ownerDocument;
  const canDraw = typeof document?.createElementNS === "function";
  const hasCore = canDraw && coreIds.every(id => graph[id]);
  const hasWeather = canDraw && weatherIds.every(id => graph[id]);
  const bars = [];

  if (!hasCore) graph["density-plot"]?.setAttribute("hidden", "");
  if (!hasWeather) graph["weather-plot"]?.setAttribute("hidden", "");

  const svg = (name, attributes) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };

  if (hasCore) {
    for (let index = 0; index < BIN_COUNT; index += 1) {
      const bar = svg("rect", { x: plotX(MIN + index * BIN_WIDTH), width: 45 * BIN_WIDTH });
      graph.histogram.append(bar);
      bars.push(bar);
    }
  }

  return function draw(lab, run, stationOpen, axis, summary) {
    const [a, b] = lab.gates[lab.view];
    const points = profile(lab.model, lab.view, MIN, MAX, 240);
    const densityCeiling = Math.max(0.5, Math.ceil(2 * Math.max(...points)) / 2);

    if (hasCore) {
      const total = run.positions.length;
      const heights = run.bins.map(count => total === 0 ? 0 : count / (total * BIN_WIDTH));
      const ceiling = Math.max(densityCeiling, Math.ceil(2 * Math.max(...heights)) / 2);
      const y = value => 175 - 155 * value / ceiling;
      graph["density-line"].setAttribute("d", plotPath(points, MIN, MAX, y));
      const area = a === b ? "" : plotPath(
        profile(lab.model, lab.view, a, b, Math.ceil((b - a) * 20)), a, b, y
      ) + " V175 H" + plotX(a) + " Z";
      graph["gate-area"].setAttribute("d", area);
      setEdge(graph["gate-left"], a);
      setEdge(graph["gate-right"], b);
      for (let index = 1; index <= 4; index += 1) {
        graph["y" + index].textContent = String(index * ceiling / 4);
      }
      graph["x-axis"].textContent = axis;
      graph["plot-description"].textContent = summary
        + " The shaded area lies under the predicted density within the gate. "
        + total + " detections, " + run.outside + " outside the plot.";
      bars.forEach((bar, index) => {
        bar.setAttribute("y", y(heights[index]));
        bar.setAttribute("height", 175 - y(heights[index]));
      });
    }

    if (hasWeather && stationOpen) {
      const crest = plotPath(points, MIN, MAX, value => 170 - 134 * value / densityCeiling);
      graph["weather-plot"].setAttribute("data-view", lab.view);
      graph["weather-crest"].setAttribute("d", crest);
      graph["weather-fill"].setAttribute("d", crest + " V170 H62 Z");
      graph["weather-gate"].setAttribute("x", plotX(a));
      graph["weather-gate"].setAttribute("width", plotX(b) - plotX(a));
      setEdge(graph["weather-left"], a);
      setEdge(graph["weather-right"], b);
      graph["weather-axis"].textContent = axis;
      graph["weather-description"].textContent = summary
        + " Crest height encodes probability density. Circles on the axis mark recent detections.";
      const markers = run.positions.slice(-32).filter(value => value >= MIN && value <= MAX);
      graph["weather-marks"].replaceChildren(...markers.map(value =>
        svg("circle", { cx: plotX(value), cy: 186, r: 2.6 })
      ));
    } else if (hasWeather) {
      graph["weather-marks"].replaceChildren();
    }

    return densityCeiling;
  };
}

function initializeLesson(root) {
  const ids = [
    "preparation-controls", "detector-controls", "detection-controls", "mission-controls", "quiz-controls",
    "static-note", "preset", "sigma", "sigma-label", "sigma-value", "carrier", "carrier-label", "carrier-value",
    "coherent-controls", "separation", "separation-value", "phase", "phase-value",
    "view", "lower", "lower-value", "upper", "upper-value",
    "plot-title", "plot-summary", "mean-x", "mean-p", "width-x", "width-p", "product",
    "reference-label", "reference-density", "theory", "visible", "ensemble-label",
    "batch-size", "detect-one", "detect-batch", "clear", "new-run", "reset", "open-station",
    "total", "hits", "observed", "outside", "latest", "lab-status",
    "weather-station", "station-title", "weather-view", "weather-scale", "weather-summary", "station-preview",
    "mission-panel", "mission-name", "mission-brief", "mission-config", "forecast", "committed",
    "commit", "launch", "start-mission", "retry-mission", "new-mission", "reset-station", "return",
    "report", "report-forecast", "report-theory", "report-observed", "report-count", "report-error",
    "report-verdict", "station-status", "quiz", "quiz-retry", "quiz-feedback"
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, root.querySelector("#mp-" + id)]));
  if (Object.values(nodes).some(node => !node)) return;

  const ranges = {
    sigma: [0.5, 1.5, 0.05, 2], carrier: [-3, 3, 0.25, 2],
    separation: [1, 4, 0.1, 1], phase: [0, 360, 1, 0],
    lower: [MIN, MAX, 0.05, 2], upper: [MIN, MAX, 0.05, 2]
  };
  const groups = ["preparation", "detector", "detection", "mission", "quiz"];
  const shortcuts = [...root.querySelectorAll("button[data-mp-phase]")];
  const answers = [...nodes.quiz.querySelectorAll('input[type="radio"][name="mp-quiz-answer"]')];
  const phaseShortcuts = ["0", "90", "180"];

  function sameValues(values, expected) {
    return values.length === expected.length && expected.every(value => values.includes(value));
  }

  function hasOptions(node, expected) {
    return node.tagName === "SELECT" && sameValues(Array.from(node.options, item => item.value), expected);
  }

  if (
    groups.some(group => nodes[group + "-controls"].tagName !== "FIELDSET") ||
    nodes.quiz.tagName !== "FORM" || nodes.forecast.type !== "number" ||
    !hasOptions(nodes.preset, PRESETS) || !hasOptions(nodes.view, Object.keys(VIEWS)) ||
    !hasOptions(nodes["batch-size"], BATCH_SIZES) ||
    !sameValues(answers.map(answer => answer.value), Object.keys(QUIZ_FEEDBACK)) ||
    !sameValues(shortcuts.map(button => button.dataset.mpPhase), phaseShortcuts) ||
    Object.entries(ranges).some(([id, [min, max, step]]) => {
      const node = nodes[id];
      return node.type !== "range" || Number(node.min) !== min
        || Number(node.max) !== max || Number(node.step) !== step;
    })
  ) return;

  const draw = initializeCharts(root);
  let explorer = newLab();
  let mission = null;
  let stationOpen = false;
  const lab = () => mission?.lab ?? explorer;

  function write(id, value) {
    const text = String(value);
    if (nodes[id].textContent !== text) nodes[id].textContent = text;
  }

  function syncRange(id, value, unit, speech) {
    const shown = fixed(value, ranges[id][3]);
    nodes[id].value = String(value);
    nodes[id].setAttribute("aria-valuetext", shown.replace("−", "minus ") + " " + speech);
    write(id + "-value", shown + unit);
  }

  function readRange(id) {
    const [min, max, step, digits] = ranges[id];
    const value = nodes[id].valueAsNumber;
    if (!Number.isFinite(value) || value < min || value > max) return null;
    return Number((min + Math.round((value - min) / step) * step).toFixed(digits));
  }

  function render() {
    const active = lab();
    const { setup, model, view } = active;
    const details = VIEWS[view];
    const positionView = view === "position";
    const label = positionView ? "Position" : "Momentum";
    const axis = label + " " + details.variable + " (" + details.unit + ")";
    const gate = active.gates[view];
    const [a, b] = gate;
    const gateText = "[" + fixed(a, 2) + ", " + fixed(b, 2) + "] " + details.unit;
    const run = active.ensembles[view];
    const total = run.positions.length;
    const hits = countHits(run, gate);
    const sourceName = model.coherent ? "Two coherent packets" : "Single Gaussian";
    const summary = sourceName + " in " + details.name + ". Gate " + gateText
      + ". Visible range [−6, 6] " + details.unit + ".";
    const hiddenAnswer = mission !== null && mission.report === null;

    nodes.preset.value = setup.preset;
    nodes.view.value = view;
    nodes["batch-size"].value = active.batchSize;
    nodes["coherent-controls"].hidden = !model.coherent;
    write("sigma-label", model.coherent ? "Individual packet width σ" : "Position width σ");
    write("carrier-label", model.coherent ? "Carrier momentum p₀" : "Central momentum p₀");
    syncRange("sigma", setup.sigma, " nm", "nanometers");
    syncRange("carrier", setup.carrier, " ℏ/nm", "h-bar per nanometer");
    syncRange("separation", setup.separation, " nm", "nanometers");
    syncRange("phase", setup.phase, "°", "degrees");
    syncRange("lower", a, " " + details.unit, details.speech);
    syncRange("upper", b, " " + details.unit, details.speech);

    write("plot-title", label + " probability density · " + details.density);
    write("plot-summary", summary);
    write("mean-x", "0.000 nm");
    write("mean-p", fixed(model.meanP, 3) + " ℏ/nm");
    write("width-x", fixed(model.widthX, 3) + " nm");
    write("width-p", fixed(model.widthP, 3) + " ℏ/nm");
    write("product", fixed(model.widthX * model.widthP, 3) + " ℏ");
    write("reference-label", positionView ? "Density at x = 0" : "Density at p = p₀");
    write("reference-density", fixed(density(model, view, positionView ? 0 : model.carrier), 5)
      + " " + details.density);
    write("theory", hiddenAnswer ? "Revealed after launch" : finitePercent(gateProbability(model, view, a, b)));
    write("visible", finitePercent(gateProbability(model, view, MIN, MAX), 5));
    write("ensemble-label", label + " ensemble");
    write("total", total);
    write("hits", hits);
    write("observed", total === 0 ? "—" : percent(hits / total));
    write("outside", run.outside);
    write("latest", total === 0 ? "—" : fixed(run.positions[total - 1], 4) + " " + details.unit);

    const ceiling = draw(active, run, stationOpen, axis, summary);
    write("weather-view", positionView ? "Position fog banks" : "Momentum wind spectrum");
    write("weather-scale", "Profile height spans 0 to " + ceiling + " " + details.density
      + ". The background landscape shows the outpost.");
    write("weather-summary", summary);

    for (const group of ["preparation", "detector", "detection"]) {
      nodes[group + "-controls"].disabled = mission !== null;
    }
    nodes["weather-station"].hidden = !stationOpen;
    nodes["open-station"].hidden = stationOpen;
    nodes["open-station"].setAttribute("aria-expanded", String(stationOpen));
    nodes["station-preview"].hidden = mission !== null;
    nodes["mission-panel"].hidden = mission === null;
    nodes["start-mission"].hidden = mission !== null;
    nodes["retry-mission"].disabled = mission === null;
    nodes["new-mission"].disabled = mission === null;

    const committed = mission?.forecast != null;
    nodes.forecast.disabled = mission === null || committed;
    nodes.commit.disabled = mission === null || committed;
    nodes.launch.disabled = !committed || mission.report !== null;
    nodes.committed.hidden = !committed;
    write("committed", committed ? "Committed forecast " + mission.forecast.toFixed(1) + "%." : "");
    const report = mission?.report;
    nodes.report.hidden = !report;
    if (mission) {
      const { name, brief } = MISSIONS[mission.index];
      write("mission-name", name);
      write("mission-brief", brief);
      const relative = model.coherent ? " · d = " + fixed(model.separation, 1) + " nm · θ = " + model.phase + "°" : "";
      write("mission-config", details.name + " · " + sourceName + " · σ = "
        + fixed(model.sigma, 2) + " nm · p₀ = " + fixed(model.carrier, 2)
        + " ℏ/nm" + relative + " · gate " + gateText);
    }
    write("report-forecast", report ? mission.forecast.toFixed(1) + "%" : "—");
    write("report-theory", report ? finitePercent(report.theory) : "—");
    write("report-observed", report ? percent(report.observed) : "—");
    write("report-count", report ? MISSION_COUNT : "—");
    write("report-error", report ? report.error.toFixed(2) + " percentage points" : "—");
    write("report-verdict", report ? report.verdict : "");
  }

  function changePreparation(id, value) {
    if (mission || explorer.setup[id] === value) return;
    const hadSamples = Object.values(explorer.ensembles).some(run => run.positions.length > 0);
    explorer.setup[id] = value;
    explorer.model = prepare(explorer.setup);
    explorer.ensembles = newEnsembles();
    render();
    if (hadSamples) write("lab-status", "Preparation changed. Both detection ensembles were cleared.");
  }

  nodes.preset.addEventListener("change", () => {
    const value = nodes.preset.value;
    if (!mission && PRESETS.includes(value)) changePreparation("preset", value);
    else nodes.preset.value = lab().setup.preset;
  });
  for (const id of ["sigma", "carrier", "separation", "phase"]) {
    nodes[id].addEventListener("input", () => {
      const value = readRange(id);
      const applicable = id === "sigma" || id === "carrier" || explorer.model.coherent;
      if (!mission && applicable && value !== null) changePreparation(id, value);
      else nodes[id].value = String(lab().setup[id]);
    });
  }
  for (const button of shortcuts) {
    button.addEventListener("click", () => {
      const phase = button.dataset.mpPhase;
      if (explorer.model.coherent && phaseShortcuts.includes(phase)) changePreparation("phase", Number(phase));
    });
  }

  nodes.view.addEventListener("change", () => {
    if (!mission && Object.hasOwn(VIEWS, nodes.view.value)) explorer.view = nodes.view.value;
    render();
  });
  for (const [index, id] of ["lower", "upper"].entries()) {
    nodes[id].addEventListener("input", () => {
      const value = readRange(id);
      if (!mission && value !== null) {
        const gate = explorer.gates[explorer.view];
        gate[index] = index === 0 ? Math.min(value, gate[1]) : Math.max(value, gate[0]);
      }
      render();
    });
  }

  nodes["batch-size"].addEventListener("change", () => {
    const value = nodes["batch-size"].value;
    if (!mission && BATCH_SIZES.includes(value)) explorer.batchSize = value;
    else nodes["batch-size"].value = lab().batchSize;
  });

  function detect(count) {
    if (mission) return;
    // Supported batch sizes complete synchronously with one render.
    collect(explorer, count);
    render();
    const run = explorer.ensembles[explorer.view];
    write("lab-status", count === 1
      ? "Detection " + run.positions.length + " at " + fixed(run.positions.at(-1), 4)
        + " " + VIEWS[explorer.view].speech + "."
      : count + " detections added. " + run.positions.length + " total, "
        + countHits(run, explorer.gates[explorer.view]) + " inside the gate.");
  }

  nodes["detect-one"].addEventListener("click", () => detect(1));
  nodes["detect-batch"].addEventListener("click", () => detect(Number(explorer.batchSize)));
  nodes.clear.addEventListener("click", () => {
    if (mission) return;
    explorer.ensembles[explorer.view] = newEnsemble();
    render();
    write("lab-status", "Detections cleared for " + VIEWS[explorer.view].name + ".");
  });
  nodes["new-run"].addEventListener("click", () => {
    if (mission) return;
    explorer.ensembles = newEnsembles();
    render();
    write("lab-status", "New run. Both detection ensembles were cleared.");
  });
  nodes.reset.addEventListener("click", () => {
    explorer = newLab();
    mission = null;
    stationOpen = false;
    nodes.forecast.value = "";
    write("station-status", "");
    render();
    write("lab-status", "Lab reset to the opening Gaussian, original gates, and zero detections.");
  });

  function startMission(index) {
    const assignment = MISSIONS[index];
    const stationLab = newLab({ ...OPENING, ...assignment.setup });
    stationLab.view = assignment.view;
    stationLab.gates[assignment.view] = [...assignment.gate];
    mission = { index, lab: stationLab, forecast: null, report: null };
    nodes.forecast.value = "";
    write("lab-status", "");
    render();
    nodes.forecast.focus();
    write("station-status", assignment.name + ". Inspect the forecast and enter your predicted percentage.");
  }

  nodes["open-station"].addEventListener("click", () => {
    stationOpen = true;
    render();
    nodes["station-title"].focus();
  });
  nodes["start-mission"].addEventListener("click", () => { if (stationOpen && !mission) startMission(0); });
  nodes["retry-mission"].addEventListener("click", () => { if (mission) startMission(mission.index); });
  nodes["new-mission"].addEventListener("click", () => {
    if (mission) startMission((mission.index + 1) % MISSIONS.length);
  });
  nodes["reset-station"].addEventListener("click", () => { if (stationOpen) startMission(0); });
  nodes.return.addEventListener("click", () => {
    stationOpen = false;
    mission = null;
    nodes.forecast.value = "";
    write("station-status", "");
    render();
    nodes["open-station"].focus();
    write("lab-status", "Returned to free exploration.");
  });

  function commitForecast() {
    if (!mission || mission.forecast !== null) return;
    const forecast = nodes.forecast.valueAsNumber;
    if (!Number.isFinite(forecast) || forecast < 0 || forecast > 100
      || Math.abs(10 * forecast - Math.round(10 * forecast)) > 1e-8) {
      write("station-status", "Enter a percentage from 0 to 100 with at most one decimal place.");
      nodes.forecast.focus();
      return;
    }
    mission.forecast = forecast;
    render();
    nodes.launch.focus();
    write("station-status", "Forecast committed at " + forecast.toFixed(1) + "%. Ready to launch.");
  }

  nodes.commit.addEventListener("click", commitForecast);
  nodes.forecast.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitForecast();
    }
  });
  nodes.launch.addEventListener("click", () => {
    if (!mission || mission.forecast === null || mission.report) return;
    const active = mission.lab;
    const gate = active.gates[active.view];
    const theory = gateProbability(active.model, active.view, ...gate);
    const error = Math.abs(mission.forecast - 100 * theory);
    const verdict = error <= TOLERANCE + 1e-10 ? "Forecast within tolerance." : "Forecast outside tolerance.";
    collect(active, MISSION_COUNT);
    const observed = countHits(active.ensembles[active.view], gate) / MISSION_COUNT;
    mission.report = { theory, observed, error, verdict };
    render();
    nodes["retry-mission"].focus();
    write("station-status", verdict + " Theory " + finitePercent(theory) + ", observed "
      + percent(observed) + " from " + MISSION_COUNT + " detections. Error "
      + error.toFixed(2) + " percentage points.");
  });

  nodes.quiz.addEventListener("change", () => write("quiz-feedback", ""));
  nodes.quiz.addEventListener("submit", event => {
    event.preventDefault();
    const answer = answers.find(input => input.checked)?.value;
    if (Object.hasOwn(QUIZ_FEEDBACK, answer)) {
      write("quiz-feedback", QUIZ_FEEDBACK[answer]);
      nodes["quiz-retry"].hidden = false;
    } else {
      write("quiz-feedback", "Choose one answer first.");
      answers[0].focus();
    }
  });
  nodes["quiz-retry"].addEventListener("click", () => {
    nodes.quiz.reset();
    write("quiz-feedback", "");
    nodes["quiz-retry"].hidden = true;
    answers[0].focus();
  });

  nodes.quiz.reset();
  render();
  nodes["mission-controls"].disabled = false;
  nodes["quiz-controls"].disabled = false;
  nodes.reset.disabled = false;
  nodes["open-station"].disabled = false;
  nodes["static-note"].hidden = true;
}

const lesson = document.querySelector(".site-main.momentum-lesson");
if (lesson) initializeLesson(lesson);