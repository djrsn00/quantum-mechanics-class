const PREPARATIONS = {
  tagged: "Tagged comparison",
  boson: "Identical bosons",
  fermion: "Spin-polarized fermions"
};
const RECORDS = [[2, 0], [1, 1], [0, 2]];
const BINS = ["20", "11", "02"];
const MODES = { "1s-up": "1s↑", "1s-down": "1s↓", "2s-up": "2s↑", "2s-down": "2s↓" };
const SPINS = {
  singlet: { sign: -1, ket: "(|↑↓⟩ − |↓↑⟩)/√2", outcomes: "↑↓ and ↓↑ each have probability ½." },
  "triplet-up": { sign: 1, ket: "|↑↑⟩", outcomes: "↑↑ has probability 1." },
  "triplet-zero": { sign: 1, ket: "(|↑↓⟩ + |↓↑⟩)/√2", outcomes: "↑↓ and ↓↑ each have probability ½." },
  "triplet-down": { sign: 1, ket: "|↓↓⟩", outcomes: "↓↓ has probability 1." }
};
const COLORS = {
  background: "#070f15", axis: "#b9d8c9", grid: "#29453e", cyan: "#80e9eb",
  pink: "#ff9cbe", yellow: "#ffe16a", violet: "#c19bff", green: "#63f59b"
};

function number(value, digits = 3) {
  return (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toFixed(digits).replace("-", "−");
}

function percent(value) {
  return number(100 * value, 2) + "%";
}

function recordLabel(index) {
  return "(" + RECORDS[index].join(",") + ")";
}

function splitter({ prep, delay, width }) {
  const exponent = -((delay / width) ** 2) / 4;
  const overlap = Math.exp(exponent);
  const split = prep === "boson" ? -Math.expm1(exponent) / 2 :
    prep === "fermion" ? (1 + overlap) / 2 : 0.5;
  const same = (1 - split) / 2;
  return { overlap, probabilities: [same, split, same] };
}

function samplePair(probabilities, draw = Math.random()) {
  if (draw < probabilities[0]) return 0;
  return draw < probabilities[0] + probabilities[1] ? 1 : 2;
}

function modes(preset, sign, distance = 0) {
  const gaussian = preset === "gaussian";
  const direction = sign === "minus" ? -1 : 1;
  const exponent = -(distance ** 2) / 4;
  const overlap = gaussian ? Math.exp(exponent / 2) : 0;
  const normSquared = !gaussian ? 2 : direction === -1 ?
    -2 * Math.expm1(exponent) : 2 * (1 + Math.exp(exponent));
  const normalization = normSquared > 0 ? 1 / Math.sqrt(normSquared) : null;
  const packet = x => Math.exp(-(x * x) / 4) / (2 * Math.PI) ** 0.25;
  const a = gaussian ? x => packet(x + distance / 2) : x => Math.SQRT2 * Math.sin(Math.PI * x);
  const b = gaussian ? x => packet(x - distance / 2) : x => Math.SQRT2 * Math.sin(2 * Math.PI * x);
  const amplitude = (x, y, A = a(x) * b(y), B = b(x) * a(y)) => {
    if (normalization === null) return null;
    if (!gaussian || direction === 1) return normalization * (A + direction * B);
    // log(A/B) gives a stable difference even for nearly equal packets.
    const logRatio = distance * (y - x) / 2;
    const difference = logRatio >= 0 ? -A * Math.expm1(-logRatio) : B * Math.expm1(logRatio);
    return normalization * difference;
  };
  return { a, b, amplitude, overlap, normalization };
}

function emptyVault(prep = "tagged", delay = 4, width = 1) {
  return { prep, delay, width, counts: [0, 0, 0], total: 0, last: null };
}

function laboratory() {
  return {
    vault: emptyVault(),
    exchange: { sign: "plus", x1: 0.25, x2: 0.55 },
    builder: { preset: "well", sign: "plus", distance: 2, x1: 0.25, x2: 0.55 },
    occupation: { type: "boson", counts: Object.keys(MODES).map(() => 0), message: "Board empty." },
    spin: { key: "singlet", swapped: false }
  };
}

function setupPlot(canvas, xRange, yRange, xTicks, yTicks, labels, square = false) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const left = square ? 56 : 74;
  const right = width - 22;
  const top = 18;
  const bottom = height - 58;
  const x = value => left + (right - left) * (value - xRange[0]) / (xRange[1] - xRange[0]);
  const y = value => bottom - (bottom - top) * (value - yRange[0]) / (yRange[1] - yRange[0]);

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.font = (square ? 16 : 20) + "px ui-monospace, monospace";
  ctx.lineWidth = 1;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (const tick of yTicks) {
    ctx.fillStyle = COLORS.axis;
    ctx.fillText(tick.label, left - 7, y(tick.value));
    ctx.fillStyle = COLORS.grid;
    ctx.fillRect(left, y(tick.value), right - left, 1);
  }
  ctx.textAlign = "center";
  for (const tick of xTicks) {
    ctx.fillStyle = COLORS.axis;
    ctx.fillText(tick.label, x(tick.value), bottom + 17);
    ctx.fillStyle = COLORS.grid;
    ctx.fillRect(x(tick.value), top, 1, bottom - top);
  }
  ctx.fillStyle = COLORS.axis;
  ctx.fillText(labels[0], (left + right) / 2, height - 15);
  ctx.save();
  ctx.translate(square ? 12 : 15, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(labels[1], 0, 0);
  ctx.restore();
  ctx.strokeStyle = COLORS.axis;
  ctx.strokeRect(left, top, right - left, bottom - top);
  canvas.hidden = false;
  return { ctx, x, y, left, right, top, bottom };
}

const ticks = values => values.map(value => ({ value, label: String(value).replace("-", "−") }));

function trace(plot, domain, fn, color, dash = []) {
  const { ctx, x, y } = plot;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (let i = 0; i <= 180; i += 1) {
    const t = domain[0] + (domain[1] - domain[0]) * i / 180;
    if (i === 0) ctx.moveTo(x(t), y(fn(t)));
    else ctx.lineTo(x(t), y(fn(t)));
  }
  ctx.stroke();
  ctx.restore();
}

function heatMap(canvas, domain, markers, valueAt, probe, scale, signed, resolution) {
  const plot = setupPlot(canvas, domain, domain, ticks(markers), ticks(markers), ["x₁", "x₂"], true);
  if (!plot) return;
  const { ctx, x, y, left, right, top, bottom } = plot;
  const dx = (right - left) / resolution;
  const dy = (bottom - top) / resolution;
  const step = (domain[1] - domain[0]) / resolution;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  for (let j = 0; j < resolution; j += 1) {
    for (let i = 0; i < resolution; i += 1) {
      const value = valueAt(domain[0] + (i + 0.5) * step, domain[0] + (j + 0.5) * step);
      const alpha = Math.min(1, Math.sqrt(Math.abs(value) / scale));
      const rgb = signed && value < 0 ? "255 125 171" : "93 231 225";
      ctx.fillStyle = "rgb(" + rgb + " / " + alpha + ")";
      ctx.fillRect(left + i * dx, bottom - (j + 1) * dy, dx + 0.5, dy + 0.5);
    }
  }
  if (signed) {
    ctx.font = "bold 15px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ecfff1";
    for (let j = 1; j < 8; j += 1) {
      for (let i = 1; i < 8; i += 1) {
        const px = domain[0] + i * (domain[1] - domain[0]) / 8;
        const py = domain[0] + j * (domain[1] - domain[0]) / 8;
        const value = valueAt(px, py);
        if (Math.abs(value) > 0.08 * scale) ctx.fillText(value > 0 ? "+" : "−", x(px), y(py));
      }
    }
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#d0dfd9";
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, top);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = COLORS.yellow;
  ctx.beginPath();
  ctx.arc(x(probe.x1), y(probe.x2), 7, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

const choices = (label, ...options) => ({ label, options });
const probability = label => ({ label });
const exchangeChoices = label => choices(label, ["same", "Stays the same"], ["reverse", "Reverses sign"]);
const spatialChoices = label => choices(label, ["plus", "Symmetric spatial factor"], ["minus", "Antisymmetric spatial factor"]);
const recordQuestions = prefix => RECORDS.map((_, index) => probability(prefix + " " + recordLabel(index) + " (%)"));
const probabilityList = probabilities => probabilities.map(percent).join(" / ");
const PREP_KEYS = ["boson", "tagged", "fermion"];

const MISSIONS = {
  missing: {
    station: "exchange",
    objective: "Exchange the coordinates once in each symmetry away from a node. Predict how the signed amplitude and density respond in both cases.",
    hint: "Pick two different interior coordinates, such as the starting values. Think about what squaring does to a real sign.",
    questions: [
      exchangeChoices("Symmetric amplitude"), exchangeChoices("Symmetric density"),
      exchangeChoices("Antisymmetric amplitude"), exchangeChoices("Antisymmetric density")
    ],
    ready: m => m.actions.has("plus") && m.actions.has("minus") ? "" :
      "Use Exchange coordinates for both symmetries away from a node, then commit.",
    answer: () => ["same", "same", "reverse", "same"],
    explanation: () => "Exchanging the coordinates leaves the symmetric amplitude unchanged and reverses the antisymmetric amplitude. Both densities stay the same."
  },
  meter: {
    station: "vault",
    objective: "The bosonic packets start separated. Tune the arrival delay to the minimum coincidence probability. Predict P(1,1) there and use a batch to compare.",
    hint: "Fix the packet width. Try making the two intensity profiles coincide exactly.",
    questions: [probability("Minimum coincidence probability (%)")],
    setup: data => { data.vault = emptyVault("boson"); },
    answer: m => [100 * splitter(m.data.vault).probabilities[1]],
    stateCorrect: m => m.data.vault.delay === 0,
    explanation: m => "At your delay the predicted coincidence probability is " +
      percent(splitter(m.data.vault).probabilities[1]) + ". The Hong–Ou–Mandel minimum is 0% at exactly zero delay."
  },
  exits: {
    station: "vault",
    objective: "The packets arrive at the same time. Predict the three pair probabilities for each preparation. After committing, select each preparation in the vault to compare records at zero delay.",
    hint: "Both transmissions and both reflections can give one particle at each exit. Ask when the two amplitudes cancel, reinforce, or contribute separate probabilities.",
    questions: PREP_KEYS.flatMap(key => recordQuestions(PREPARATIONS[key])),
    setup: data => { data.vault = emptyVault("tagged", 0); },
    answer: m => PREP_KEYS.flatMap(prep => splitter({ ...m.data.vault, prep }).probabilities.map(p => 100 * p)),
    explanation: m => PREP_KEYS.map(prep => PREPARATIONS[prep] + " " +
      probabilityList(splitter({ ...m.data.vault, prep }).probabilities)).join(". ") +
      ". The order is (2,0), (1,1), (0,2). Each mean equals one because the two same-output outcomes are equally likely."
  },
  denied: {
    station: "occupation",
    objective: "Try adding two electrons to 1s↑, then build any allowed two-electron configuration. Explain the rejected attempt.",
    hint: "The board distinguishes a spatial orbital from a mode with a specific orbital and spin.",
    questions: [choices("Why was the second 1s↑ rejected?",
      ["complete", "The complete mode was already occupied."],
      ["spatial", "Two electrons can never share a spatial orbital."],
      ["count", "Only one electron may occupy the whole board."])],
    setup: data => { data.occupation.type = "electron"; },
    ready: m => m.actions.has("rejected") && m.data.occupation.counts.reduce((a, b) => a + b, 0) === 2 ? "" :
      "Get a rejected 1s↑ addition and leave two electrons in distinct complete modes.",
    answer: () => ["complete"],
    explanation: () => "Duplicating a complete electron mode makes the two product terms identical, so their antisymmetric difference is zero. Two distinct complete modes give an allowed pair."
  },
  "same-spin": {
    station: "occupation",
    objective: "Put one electron in 1s↑ and one in 1s↓. Choose the spin symmetry that goes with their common 1s spatial product.",
    hint: "Exchanging the coordinates leaves the common spatial product unchanged. The total electron state must reverse sign.",
    questions: [choices("Compatible spin factor", ["singlet", "Singlet"], ["triplet", "M = 0 triplet"])],
    setup: data => { data.occupation.type = "electron"; },
    ready: m => m.data.occupation.counts[0] === 1 && m.data.occupation.counts[1] === 1 ? "" :
      "Put one electron in each of 1s↑ and 1s↓ before committing.",
    answer: () => ["singlet"],
    explanation: () => "The symmetric 1s(x₁)1s(x₂) product pairs with the antisymmetric singlet. The electrons occupy distinct complete modes, so the full state obeys Pauli exclusion."
  },
  build: {
    station: "builder",
    objective: "Use the orthonormal sine preset to construct both exchange states. Identify the second term, the normalization factor, and the state with a diagonal node.",
    hint: "Exchange the arguments of the first product. Orthogonal normalized modes give product terms with zero mutual inner product.",
    questions: [
      choices("Exchange partner of a(x₁)b(x₂)", ["swap", "b(x₁)a(x₂)"], ["same", "a(x₁)b(x₂)"]),
      choices("Normalization for each sign", ["sqrt", "1/√2"], ["half", "1/2"], ["one", "1"]),
      choices("State with zero amplitude all along x₁ = x₂", ["minus", "Antisymmetric"], ["plus", "Symmetric"])
    ],
    ready: m => m.actions.has("plus") && m.actions.has("minus") ? "" :
      "Prepare both signs in the State Builder before committing.",
    answer: () => ["swap", "sqrt", "minus"],
    explanation: () => "Exchange turns A into B. The two unit norms add to 2, giving 1/√2 for either sign. On the diagonal A and B are equal, so their difference vanishes."
  },
  "spin-key": {
    station: "spin",
    objective: "Match each displayed spin factor to the spatial symmetry required for a separable two-electron state.",
    hint: "Apply the swap to the two arrows. Multiply the exchange sign of spin by the exchange sign of space.",
    questions: [
      spatialChoices("Singlet (|↑↓⟩ − |↓↑⟩)/√2"),
      spatialChoices("M = +1 triplet |↑↑⟩"),
      spatialChoices("M = 0 triplet (|↑↓⟩ + |↓↑⟩)/√2"),
      spatialChoices("M = −1 triplet |↓↓⟩")
    ],
    answer: () => ["plus", "minus", "minus", "minus"],
    explanation: () => "The singlet needs symmetric space. All three triplets need antisymmetric space. The singlet and the M = 0 triplet have the same opposite-arrow frequencies, but the two terms carry different relative signs."
  },
  forecast: {
    station: "vault",
    objective: "Forecast both same-output probabilities and the coincidence probability for identical bosons with matched internal states, τ = 2 ps and σₜ = 1 ps. Then measure a batch of 100 fresh pairs.",
    hint: "Calculate M = exp[−τ²/(4σₜ²)]. Coincidences have probability (1 − M)/2, and the same-output records split the remainder equally.",
    questions: recordQuestions("P"),
    setup: data => { data.vault = emptyVault("boson", 2); },
    answer: m => splitter(m.data.vault).probabilities.map(p => 100 * p),
    explanation: m => "The calculated probabilities in (2,0), (1,1), (0,2) order are " +
      probabilityList(splitter(m.data.vault).probabilities) + ". Read the batch as finite-sample evidence."
  }
};

function buildVaultScene(THREE, canvas, viewport) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 75);
  scene.background = new THREE.Color("#071019");
  scene.fog = new THREE.Fog("#071019", 16, 32);
  scene.add(new THREE.HemisphereLight("#c7e7ff", "#334554", 2));
  const light = new THREE.DirectionalLight("#e4fcff", 2.25);
  light.position.set(1, 7, 4);
  scene.add(light);

  const resources = new Set();
  function mesh(geometry, material, x, y, z) {
    resources.add(geometry);
    resources.add(material);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    scene.add(object);
    return object;
  }
  function box(size, position, color, lit = false) {
    const material = lit ? new THREE.MeshBasicMaterial({ color }) :
      new THREE.MeshStandardMaterial({ color, roughness: 0.43, metalness: 0.45 });
    return mesh(new THREE.BoxGeometry(...size), material, ...position);
  }

  box([13, 0.24, 9], [0, -0.18, 0], "#172733");
  box([13, 3.5, 0.28], [0, 1.55, -4.45], "#20323e");
  const grid = new THREE.GridHelper(12, 24, "#315763", "#203e4a");
  resources.add(grid.geometry);
  resources.add(grid.material);
  grid.scale.z = 0.74;
  scene.add(grid);
  for (const x of [-5.8, -4.1, -2.4, 2.4, 4.1, 5.8]) {
    box([0.18, 3, 0.24], [x, 1.45, -4.2], "#36515f");
    box([0.035, 2.4, 0.03], [x, 1.52, -4.06], "#4b968b", true);
  }
  box([3.1, 0.05, 0.12], [0, 2.95, -4.15], COLORS.violet, true);
  box([9.2, 0.22, 3.25], [0, 0.1, 1.45], "#263d4d");
  box([1.3, 0.6, 1.4], [0, 0.48, 1.45], "#3c5672");
  box([0.94, 0.92, 0.94], [0, 1.16, 1.45], "#4a6882").rotation.y = Math.PI / 4;
  box([0.055, 0.67, 1.25], [0, 1.19, 1.45], COLORS.violet, true).rotation.y = Math.PI / 4;

  const inputLights = [];
  const outputLights = [];
  for (const x of [-3.8, 3.8]) {
    for (const z of [0.55, 2.35]) {
      const input = x < 0;
      box([1.0, 0.84, 0.8], [x, 0.64, z], "#334b62");
      box([1.75, 0.12, 0.13], [Math.sign(x) * 2.35, 0.72, z], "#3d687b");
      const strip = box([0.68, 0.08, 0.57], [x, 1.09, z], COLORS.cyan, true);
      (input ? inputLights : outputLights).push(strip);
    }
  }

  const screens = {};
  for (const [key, x, z, label, color] of [
    ["exchange", -4.7, -1.6, "EXCHANGE", COLORS.cyan],
    ["occupation", -1.57, -1.6, "OCCUPATION", COLORS.yellow],
    ["builder", 1.57, -1.6, "STATE BUILDER", COLORS.violet],
    ["spin", 4.7, -1.6, "SPIN SYMMETRY", COLORS.pink],
    ["vault", 0, -3.55, "COINCIDENCE METER", COLORS.green]
  ]) {
    box([2.6, 0.18, 0.9], [x, 0.13, z], "#253d50");
    box([0.55, 1.05, 0.55], [x, 0.73, z], "#2e4559");
    box([2.52, 1.02, 0.22], [x, 1.55, z], "#425b73");
    box([2.25, 0.045, 0.035], [x, 2.025, z + 0.13], color, true);
    const display = document.createElement("canvas");
    display.width = 512;
    display.height = 192;
    const ctx = display.getContext("2d");
    const texture = new THREE.CanvasTexture(display);
    texture.colorSpace = THREE.SRGBColorSpace;
    resources.add(texture);
    mesh(new THREE.PlaneGeometry(2.28, 0.85), new THREE.MeshBasicMaterial({ map: texture }), x, 1.55, z + 0.122);
    screens[key] = { ctx, texture, label, color, position: [x, 1.48, z] };
  }

  return {
    draw({ station, close, prep, record, pulse, displays }) {
      const size = viewport.getBoundingClientRect();
      if (size.width < 1 || size.height < 1) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1500 / size.width, 850 / size.height);
      const width = Math.round(size.width * ratio);
      const height = Math.round(size.height * ratio);
      if (canvas.width !== width || canvas.height !== height) renderer.setSize(width, height, false);
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
      if (!close) {
        const distance = Math.max(1, 1.35 / camera.aspect);
        camera.position.set(7.1 * distance, 7.4 * distance, 11.5 * distance);
        camera.lookAt(0, 0.5, -0.55);
      } else if (station === "vault" || station === "missions") {
        camera.position.set(3.2, 3.25, 5.6);
        camera.lookAt(0, 0.65, 1.32);
      } else {
        const [x, y, z] = screens[station].position;
        camera.position.set(x + 0.4, y + 0.42, z + Math.max(2.9, 3.7 / camera.aspect));
        camera.lookAt(x, y, z);
      }
      inputLights[0].material.color.set(prep === "tagged" ? COLORS.yellow : COLORS.cyan);
      inputLights[1].material.color.set(prep === "tagged" ? COLORS.pink : COLORS.cyan);
      outputLights.forEach((lamp, index) => {
        lamp.material.color.set(record?.[index] ? [COLORS.green, COLORS.violet][index] : "#395262");
        if (pulse && record?.[index]) lamp.material.color.lerp(new THREE.Color("#ffffff"), 0.56);
      });
      for (const [key, screen] of Object.entries(screens)) {
        const { ctx, texture, label, color } = screen;
        if (!ctx) continue;
        ctx.fillStyle = "#09141d";
        ctx.fillRect(0, 0, 512, 192);
        ctx.fillStyle = color;
        ctx.font = "bold 33px monospace";
        ctx.fillText(label, 25, 54, 462);
        ctx.fillStyle = "#ecfff1";
        ctx.font = "25px monospace";
        displays[key].forEach((line, i) => ctx.fillText(line, 25, 109 + i * 45, 462));
        texture.needsUpdate = true;
      }
      renderer.render(scene, camera);
    },
    dispose() {
      for (const resource of resources) resource.dispose();
      renderer.dispose();
    }
  };
}

function initialize(root) {
  const element = id => document.getElementById("ip-" + id);
  const text = (id, value) => { element(id).textContent = String(value); };
  const set = (id, value) => { element(id).value = value; };
  const disable = (id, value) => { element(id).disabled = value; };
  const hide = (id, value) => { element(id).hidden = value; };
  const on = (id, callback, event = "click") => element(id).addEventListener(event, callback);
  const pressed = (id, value) => element(id).setAttribute("aria-pressed", String(value));
  const all = selector => Array.from(root.querySelectorAll(selector));
  const free = laboratory();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(pointer: coarse) and (max-width: 64rem)");
  const reduced = () => motion.matches || element("effects").checked;
  const stations = all("[data-ip-station]");
  const deck = all("[data-ip-deck]");
  const answers = all("[data-ip-answer]");
  const modeKeys = Object.keys(MODES);
  let mission = null;
  let scene = null;
  let loading = false;
  let loadVersion = 0;
  let sceneFailed = false;
  let heist = false;
  let close = false;
  let station = "vault";
  let pulseTimer = null;
  let pendingRender = null;

  const lab = () => mission?.data ?? free;
  const awaiting = key => mission?.key === key && !mission.revealed;
  const missionVault = () => mission?.definition.station === "vault";
  const announce = message => element("status").replaceChildren(document.createTextNode(message));

  function renderExchange() {
    const data = lab().exchange;
    const { amplitude } = modes("well", data.sign);
    const direct = amplitude(data.x1, data.x2);
    const swapped = amplitude(data.x2, data.x1);
    set("exchange-sign", data.sign);
    for (const key of ["x1", "x2"]) {
      set("exchange-" + key, data[key]);
      text("exchange-" + key + "-value", number(data[key], 2));
    }
    text("exchange-psi", number(direct));
    text("exchange-swapped-psi", number(swapped));
    text("exchange-rho", number(direct ** 2));
    text("exchange-swapped-rho", number(swapped ** 2));
    text("exchange-description", data.sign === "plus" ?
      "The amplitude and density are mirror-symmetric across the dashed x₁ = x₂ line. A ring marks the probe." :
      "The amplitude reverses sign across the dashed diagonal. The density mirrors across it and vanishes on the line. A ring marks the probe.");
    const resolution = reduced() ? 40 : 72;
    const domain = [0, 1];
    const markers = [0, 0.5, 1];
    heatMap(element("exchange-density"), domain, markers, (x, y) => amplitude(x, y) ** 2, data, 8, false, resolution);
    heatMap(element("exchange-amplitude"), domain, markers, amplitude, data, Math.sqrt(8), true, resolution);
  }

  function renderBuilder() {
    const data = lab().builder;
    const model = modes(data.preset, data.sign, data.distance);
    const { a, b, amplitude, overlap, normalization } = model;
    const gaussian = data.preset === "gaussian";
    const valid = normalization !== null;
    const domain = gaussian ? [-8, 8] : [0, 1];
    const markers = gaussian ? [-8, -4, 0, 4, 8] : [0, 0.5, 1];
    const first = a(data.x1) * b(data.x2);
    const second = b(data.x1) * a(data.x2);
    const psi = amplitude(data.x1, data.x2, first, second);
    set("builder-preset", data.preset);
    set("builder-sign", data.sign);
    set("builder-distance", data.distance);
    text("builder-distance-value", number(data.distance, 2));
    disable("builder-distance", !gaussian);
    disable("builder-preset", awaiting("build"));
    disable("builder-swap", !valid);
    for (const key of ["x1", "x2"]) {
      const slider = element("builder-" + key);
      slider.min = domain[0];
      slider.max = domain[1];
      slider.step = gaussian ? 0.05 : 0.01;
      slider.value = data[key];
      text("builder-" + key + "-value", number(data[key], 2));
    }
    text("builder-domain", gaussian ?
      "Coordinates are in units of σₓ. The Gaussian domain extends over the real line. Plots crop to −8 ≤ x ≤ 8 without renormalizing the state. Separation steps are 0.05. Joint maps use x₁ horizontally and x₂ vertically." :
      "Sine preset domain and plot both run from 0 to 1, in well-length units. Joint maps use x₁ horizontally and x₂ vertically.");
    text("builder-formula", data.sign === "plus" ? "Ψ₊ = N₊ (A + B)" : "Ψ₋ = N₋ (A − B)");
    hide("builder-invalid", valid);
    text("builder-mode-description", gaussian ?
      "A solid line shows a, centered at " + number(-data.distance / 2, 2) + ". A dashed line shows b, centered at " +
      number(data.distance / 2, 2) + ". Each density has unit standard deviation in these coordinates." :
      "On the unit interval, a(x) = √2 sin(πx) and b(x) = √2 sin(2πx). The solid line is a, and the dashed line is b.");
    text("builder-overlap", number(overlap, 5));
    text("builder-normalization", valid ? (gaussian ? number(normalization, 5) : "1/√2") : "—");
    text("builder-term-a", number(first, 5));
    text("builder-term-b", number(second, 5));
    text("builder-psi", valid ? number(psi, 5) : "—");
    text("builder-rho", valid ? number(psi ** 2, 5) : "—");
    text("builder-tagged-value", number(first ** 2, 5));
    text("builder-density-description", !valid ? "The two product terms coincide everywhere." :
      data.sign === "minus" ? "The exchange state has a diagonal node. The readout gives density at the probe." :
        "The joint density is mirror-symmetric. The readout gives density at the probe.");
    const modePlot = setupPlot(element("builder-modes"), domain, gaussian ? [0, 0.7] : [-1.5, 1.5],
      ticks(markers), ticks(gaussian ? [0, 0.3, 0.6] : [-1, 0, 1]), ["x", "Amplitude"]);
    if (modePlot) {
      trace(modePlot, domain, a, COLORS.cyan);
      trace(modePlot, domain, b, COLORS.pink, [9, 7]);
    }
    const resolution = reduced() ? 40 : 72;
    const scale = gaussian ? 0.35 : 8;
    hide("builder-density", !valid);
    if (valid) heatMap(element("builder-density"), domain, markers, (x, y) => amplitude(x, y) ** 2, data, scale, false, resolution);
    heatMap(element("builder-tagged"), domain, markers, (x, y) => (a(x) * b(y)) ** 2, data, scale, false, resolution);
  }

  function renderOccupation() {
    const { type, counts, message } = lab().occupation;
    set("occupation-type", type);
    disable("occupation-type", awaiting("denied") || awaiting("same-spin"));
    modeKeys.forEach((key, i) => {
      text("occ-" + key, counts[i]);
      root.querySelector('[data-ip-remove="' + key + '"]').disabled = counts[i] === 0;
    });
    text("occupation-feedback", message);
    let description = "Occupation record (1s↑, 1s↓, 2s↑, 2s↓) = (" + counts.join(", ") + ")";
    if (type === "electron" && ((counts[0] && counts[1]) || (counts[2] && counts[3]))) {
      const orbital = counts[0] ? "1s" : "2s";
      description += ". Ψ = " + orbital + "(x₁)" + orbital + "(x₂)(|↑↓⟩ − |↓↑⟩)/√2.";
    }
    text("occupation-state", description);
  }

  function renderSpin() {
    const { key, swapped } = lab().spin;
    const spin = SPINS[key];
    const symmetricSpace = spin.sign === -1;
    const spatial = symmetricSpace ? "Ψ₊" : "Ψ₋";
    set("spin-state", key);
    pressed("spin-swap", swapped);
    text("spin-ket", swapped && spin.sign === -1 ? "−" + spin.ket : spin.ket);
    text("spin-sign", spin.sign === -1 ? "Antisymmetric under exchange (−1)." : "Symmetric under exchange (+1).");
    text("space-wave", (swapped && !symmetricSpace ? "−" : "") + spatial + "(x₁,x₂)");
    text("space-sign", symmetricSpace ? "Symmetric under exchange (+1)." : "Antisymmetric under exchange (−1).");
    text("total-sign", "Total exchange sign = " + (symmetricSpace ? "(−1)(+1)" : "(+1)(−1)") +
      " = −1" + (swapped ? ". The displayed state is −Ψtotal." : "."));
    text("spin-outcomes", spin.outcomes + (key === "singlet" || key === "triplet-zero" ?
      " The singlet and M = 0 triplet yield the same opposite-arrow probabilities in this basis." : ""));
  }

  function renderVault() {
    const data = lab().vault;
    const { overlap, probabilities } = splitter(data);
    const record = data.last === null ? null : RECORDS[data.last];
    const locked = missionVault();
    const predicting = locked && !mission.revealed;
    const prepCanChange = !locked || mission.key === "exits" && mission.revealed;
    const canTune = !locked || awaiting("meter");
    set("prep", data.prep);
    set("delay", data.delay);
    set("width", data.width);
    disable("prep", !prepCanChange);
    disable("delay", !canTune);
    disable("width", locked);
    disable("zero", !canTune);
    disable("vault-reset", locked);
    disable("measure-controls", predicting);
    hide("opening", predicting);
    text("delay-value", number(data.delay, 2) + " ps");
    text("width-value", number(data.width, 2) + " ps");
    text("delay-ratio", number(data.delay / data.width, 2));
    text("overlap", overlap < 0.0001 ? overlap.toExponential(3) : number(overlap, 4));
    text("packet-description", "Input a is centered at " + number(-data.delay / 2, 2) +
      " ps. Input b is centered at " + number(data.delay / 2, 2) +
      " ps. The intensity standard deviation of each packet is " + number(data.width, 2) + " ps.");
    element("apparatus").dataset.preparation = data.prep;
    text("input-a", data.prep === "tagged" ? "1 · tag A" : "1 · matched internal state");
    text("input-b", data.prep === "tagged" ? "1 · tag B" : "1 · matched internal state");
    text("detector-c-value", record?.[0] ?? "—");
    text("detector-d-value", record?.[1] ?? "—");
    text("last", data.last === null ? "—" : recordLabel(data.last));
    text("coincidences", data.counts[1]);
    text("together", data.counts[0] + data.counts[2]);
    text("trials", data.total);
    for (const [i, key] of BINS.entries()) {
      text("p" + key, percent(probabilities[i]));
      text("n" + key, data.counts[i]);
      text("f" + key, data.total ? percent(data.counts[i] / data.total) : "—");
    }
    text("delay-description", PREPARATIONS[data.prep] + " at τ = " + number(data.delay, 2) +
      " ps and σₜ = " + number(data.width, 2) + " ps: P(1,1) = " + percent(probabilities[1]) + ".");

    const extent = Math.ceil(Math.abs(data.delay / 2) + 4 * data.width);
    const time = [-extent, extent];
    const intensity = setupPlot(element("packets"), time, [0, 1.05],
      ticks([-extent, 0, extent]), ticks([0, 0.5, 1]), ["Time (ps)", "Rel. intensity"]);
    if (intensity) {
      const profile = center => t => Math.exp(-0.5 * ((t - center) / data.width) ** 2);
      trace(intensity, time, profile(-data.delay / 2), COLORS.cyan);
      trace(intensity, time, profile(data.delay / 2), COLORS.pink, [10, 8]);
    }
    if (predicting) return;

    const delays = [-8, 8];
    const theory = setupPlot(element("delay-plot"), delays, [0, 1],
      ticks([-8, -4, 0, 4, 8]), ticks([0, 0.25, 0.5, 0.75, 1]), ["Arrival difference (ps)", "P(1,1)"]);
    if (theory) {
      const { ctx, x, y } = theory;
      trace(theory, delays, delay => splitter({ ...data, prep: "boson", delay }).probabilities[1], COLORS.cyan);
      trace(theory, delays, () => 0.5, COLORS.yellow, [12, 8]);
      trace(theory, delays, delay => splitter({ ...data, prep: "fermion", delay }).probabilities[1], COLORS.pink, [2, 6]);
      ctx.fillStyle = COLORS.background;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x(data.delay), y(probabilities[1]), 6.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    const top = Math.max(4, 4 * Math.ceil(Math.max(...data.counts) / 4));
    const categories = RECORDS.map((_, index) => ({ value: index, label: recordLabel(index) }));
    const bars = setupPlot(element("histogram"), [-0.55, 2.55], [0, top],
      categories, ticks([0, top / 4, top / 2, 3 * top / 4, top]), ["Detector record", "Count"]);
    if (bars) {
      const { ctx, x, y } = bars;
      const barWidth = x(0.59) - x(0);
      data.counts.forEach((count, i) => {
        ctx.fillStyle = [COLORS.green, COLORS.cyan, COLORS.violet][i];
        ctx.fillRect(x(i) - barWidth / 2, y(count), barWidth, y(0) - y(count));
        ctx.fillStyle = "#ecfff1";
        ctx.fillText(String(count), x(i), Math.max(12, y(count) - 12));
      });
    }
  }

  function renderMission() {
    const active = Boolean(mission);
    for (const node of answers) {
      node.hidden = active && !mission.revealed && node.dataset.ipAnswer.split(" ").includes(mission.key);
    }
    hide("mission-case", !active);
    hide("case-dock", !active);
    disable("mission-retry", !active);
    disable("mission-exit", !active);
    if (!active) return;
    const title = [...element("mission").options].find(option => option.value === mission.key).text;
    text("mission-title", title);
    text("active-case", title);
    text("mission-objective", mission.definition.objective);
    text("mission-hint", mission.definition.hint);
    text("mission-feedback", mission.feedback);
    text("mission-evidence", mission.evidence);
    disable("mission-submit", mission.revealed);
  }

  function renderAll() {
    renderMission();
    renderExchange();
    renderVault();
    renderOccupation();
    renderBuilder();
    renderSpin();
    drawScene();
  }

  function queuePlots() {
    if (pendingRender !== null) return;
    pendingRender = window.requestAnimationFrame(() => {
      pendingRender = null;
      renderExchange();
      renderBuilder();
      renderVault();
      drawScene();
    });
  }

  function selectStation(key) {
    station = key;
    stations.forEach(node => node.toggleAttribute("data-ip-active", node.dataset.ipStation === key));
    deck.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.ipDeck === key)));
    if (mission && key !== "missions") element(key).before(element("case-dock"));
    drawScene();
  }

  function visit(key) {
    selectStation(key);
    element(key + "-title").focus();
  }

  function stopPulse() {
    window.clearTimeout(pulseTimer);
    pulseTimer = null;
    for (const key of ["c", "d"]) element("detector-" + key).removeAttribute("data-ip-flash");
  }

  function pulseRecord(record) {
    stopPulse();
    if (!reduced()) {
      ["c", "d"].forEach((key, i) => {
        element("detector-" + key).toggleAttribute("data-ip-flash", record[i] > 0);
      });
      pulseTimer = window.setTimeout(() => {
        stopPulse();
        drawScene();
      }, 480);
    }
    drawScene();
  }

  function disposeScene() {
    loadVersion += 1;
    loading = false;
    hide("viewport", true);
    scene?.dispose();
    scene = null;
  }

  function rendererFailed() {
    sceneFailed = true;
    disposeScene();
    text("renderer", "3D graphics are unavailable. The 2D apparatus, plots, and missions are active.");
  }

  function drawScene() {
    if (!scene || document.hidden || !heist || reduced()) return;
    const { vault, exchange, builder, spin, occupation } = lab();
    const predicting = mission && !mission.revealed;
    const privateStation = predicting ? mission.definition.station : "";
    const { probabilities } = splitter(vault);
    const hideSpin = (predicting && mission.key === "same-spin") || privateStation === "spin";
    try {
      scene.draw({
        station, close, prep: vault.prep, pulse: pulseTimer !== null,
        record: vault.last === null ? null : RECORDS[vault.last],
        displays: {
          vault: privateStation === "vault" ? ["Forecast in progress", "Commit to reveal theory"] :
            ["P(1,1)  " + percent(probabilities[1]), vault.counts[1] + " coincidences / " + vault.total + " trials"],
          exchange: privateStation === "exchange" ? ["Prediction in progress"] :
            ["Probe  " + number(exchange.x1, 2) + ", " + number(exchange.x2, 2), "Spatial symmetry: " + exchange.sign],
          occupation: ["Complete-mode occupations", occupation.counts.join("  /  ")],
          builder: privateStation === "builder" ? ["Prediction in progress"] :
            [builder.preset === "well" ? "Orthonormal well modes" : "Overlapping Gaussian modes",
              modes(builder.preset, builder.sign, builder.distance).normalization === null ?
                "No antisymmetric state" : "Combination: " + builder.sign],
          spin: hideSpin ? ["Prediction in progress"] : [SPINS[spin.key].ket, "Total exchange sign: −1"]
        }
      });
    } catch {
      rendererFailed();
    }
  }

  async function updateGraphics() {
    if (!heist || reduced() || sceneFailed) {
      disposeScene();
      if (!sceneFailed) text("renderer", reduced() ? "Reduced effects. The 2D apparatus and all instruments are active." :
        "The 2D apparatus and instruments are available in every view.");
      return;
    }
    if (scene) {
      drawScene();
      return;
    }
    if (loading || document.hidden) return;
    loading = true;
    const token = ++loadVersion;
    text("renderer", "Loading the facility view. The 2D instruments are ready.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (token !== loadVersion || document.hidden) return;
      scene = buildVaultScene(THREE, element("world"), element("viewport"));
      hide("viewport", false);
      text("renderer", "Facility view active. Use the station controls below to operate the equipment.");
      drawScene();
    } catch {
      if (token === loadVersion) rendererFailed();
    } finally {
      if (token === loadVersion) loading = false;
    }
  }

  function setClose(value) {
    close = value;
    pressed("camera-close", close);
    text("camera-close", close ? "Overview" : "Close-up");
    drawScene();
  }

  function adjustVault(settings) {
    const previous = lab().vault;
    const { prep, delay, width } = { ...previous, ...settings };
    if (prep === previous.prep && delay === previous.delay && width === previous.width) return;
    stopPulse();
    lab().vault = emptyVault(prep, delay, width);
    renderVault();
    drawScene();
  }

  function measure(count) {
    if (missionVault() && !mission.revealed) return;
    const data = lab().vault;
    const { probabilities } = splitter(data);
    const batch = [0, 0, 0];
    for (let i = 0; i < count; i += 1) {
      const result = samplePair(probabilities);
      batch[result] += 1;
      data.counts[result] += 1;
      data.last = result;
    }
    data.total += count;
    renderVault();
    pulseRecord(RECORDS[data.last]);
    let evidence = "";
    if (missionVault() && count === 100) {
      mission.batches.set(data.prep, batch);
      if (mission.key === "exits") {
        evidence = [...mission.batches].map(([key, bins]) =>
          PREPARATIONS[key] + ": " + probabilityList(bins.map(n => n / count))).join(". ") +
          ". Each set is the latest batch for that preparation.";
      } else if (mission.key === "forecast") {
        evidence = "Your forecast: " + probabilityList(mission.values.map(value => value / 100)) +
          ". Theory: " + probabilityList(probabilities) + ". Observed in this batch: " +
          probabilityList(batch.map(n => n / count)) + ". Record order: (2,0), (1,1), (0,2).";
      } else {
        evidence = "Predicted coincidence fraction " + percent(probabilities[1]) + ". This batch: " +
          batch[1] + " coincidences out of 100.";
      }
      if (mission.correct && mission.key !== "exits") evidence = "Case solved. " + evidence;
      mission.evidence = evidence;
      renderMission();
    }
    const report = count === 1 ? "Recorded " + recordLabel(data.last) + ". Total trials " + data.total + "." :
      "Recorded 100 pairs. Batch counts: " + batch.map((n, i) => recordLabel(i) + " " + n).join(", ") + ".";
    announce(report + (evidence ? " " + evidence : ""));
  }

  function clearVault(restore) {
    const { prep, delay, width } = lab().vault;
    lab().vault = restore ? emptyVault() : emptyVault(prep, delay, width);
    if (missionVault()) {
      mission.batches.delete(prep);
      mission.evidence = "";
      renderMission();
    }
    stopPulse();
    renderVault();
    drawScene();
    announce(restore ? "Opening setup restored. Counts cleared." : "Counts cleared.");
  }

  function changeOccupation(mode, direction) {
    const data = lab().occupation;
    const index = modeKeys.indexOf(mode);
    const { counts, type } = data;
    if (direction === 1 && type === "electron" && counts[index] === 1) {
      data.message = "Access denied. A second electron cannot occupy the complete mode " + MODES[mode] + ".";
      if (awaiting("denied") && mode === "1s-up") mission.actions.add("rejected");
      announce(data.message);
    } else if (direction === 1 && counts.reduce((a, b) => a + b, 0) === 2) {
      data.message = "This board models two particles. Remove one to try a different configuration.";
      announce(data.message);
    } else if (direction === 1 || counts[index] > 0) {
      counts[index] += direction;
      data.message = (direction === 1 ? "Added one to " : "Removed one from ") + MODES[mode] + ".";
    }
    renderOccupation();
    drawScene();
  }

  function prepareQuestions(definition) {
    const fields = element("mission-questions");
    fields.className = definition.questions.length > 4 ? "ip-fields" : "ip-stack";
    const labels = definition.questions.map(({ label, options }, i) => {
      const wrapper = document.createElement("label");
      wrapper.textContent = label;
      const field = document.createElement(options ? "select" : "input");
      field.name = "answer-" + i;
      field.required = true;
      if (options) {
        field.add(new Option("Choose an answer", ""));
        for (const [value, name] of options) field.add(new Option(name, value));
      } else {
        field.type = "number";
        field.inputMode = "decimal";
        field.min = "0";
        field.max = "100";
        field.step = "any";
      }
      wrapper.append(field);
      return wrapper;
    });
    fields.replaceChildren(...labels);
  }

  function startMission(key) {
    stopPulse();
    if (key === "free") {
      mission = null;
    } else {
      const definition = MISSIONS[key];
      mission = {
        key, definition, data: laboratory(), actions: new Set(),
        batches: new Map(), revealed: false, correct: false, values: [],
        feedback: "", evidence: ""
      };
      definition.setup?.(mission.data);
      if (key === "build") mission.actions.add("plus");
      prepareQuestions(definition);
      element("mission-help").open = false;
      element("missions").before(element("case-dock"));
    }
    set("mission", key);
    renderAll();
    if (mission) element("mission-title").focus();
    else element("mission").focus();
  }

  function checkMission(event) {
    event.preventDefault();
    if (!mission || mission.revealed) return;
    const { definition, key } = mission;
    const missingAction = definition.ready?.(mission);
    if (missingAction) {
      mission.feedback = missingAction;
      renderMission();
      announce(missingAction);
      return;
    }
    const form = new FormData(event.currentTarget);
    const expected = definition.answer(mission);
    mission.values = expected.map((value, i) => {
      const input = form.get("answer-" + i);
      return typeof value === "number" ? Number(input) : input;
    });
    const accurate = expected.every((value, i) => typeof value === "number" ?
      Math.abs(value - mission.values[i]) <= 1 : value === mission.values[i]);
    const normalized = (key !== "exits" && key !== "forecast") ||
      mission.values.every((_, i, values) => i % 3 !== 0 ||
        Math.abs(values[i] + values[i + 1] + values[i + 2] - 100) <= 1);
    mission.correct = accurate && normalized && (definition.stateCorrect?.(mission) ?? true);
    mission.revealed = true;
    const needsBatch = key === "forecast" || key === "meter";
    const result = mission.correct ? (needsBatch ? "Prediction accepted. Measure 100 pairs for evidence. " : "Case solved. ") :
      "Review the theory and retry for another attempt. ";
    mission.feedback = result + definition.explanation(mission) +
      (typeof expected[0] === "number" ? " The scoring tolerance is 1 percentage point." : "");
    for (const field of element("mission-questions").querySelectorAll("input, select")) field.disabled = true;
    renderAll();
    element("mission-station").focus();
    announce(mission.feedback);
  }

  on("opening", event => {
    event.preventDefault();
    const right = element("opening-choice").value === "unknown";
    const feedback = (right ? "Correct. " : "Try comparing the pair records. ") +
      "Both detectors average one for an even mix of (2,0) and (0,2), and also for a run of (1,1) records. The coincidence fraction separates those examples.";
    text("opening-feedback", feedback);
    announce(feedback);
  }, "submit");

  on("prep", event => adjustVault({ prep: event.target.value }), "change");
  on("delay", event => adjustVault({ delay: event.target.valueAsNumber }), "input");
  on("width", event => adjustVault({ width: event.target.valueAsNumber }), "input");
  on("zero", () => adjustVault({ delay: 0 }));
  on("vault-reset", () => clearVault(true));
  on("clear", () => clearVault(false));
  on("one", () => measure(1));
  on("hundred", () => measure(100));

  on("exchange-sign", event => {
    lab().exchange.sign = event.target.value;
    renderExchange();
    drawScene();
  }, "change");
  on("exchange-swap", () => {
    const data = lab().exchange;
    if (awaiting("missing") && Math.abs(modes("well", data.sign).amplitude(data.x1, data.x2)) > 0.025) {
      mission.actions.add(data.sign);
    }
    [data.x1, data.x2] = [data.x2, data.x1];
    renderExchange();
    drawScene();
  });
  for (const key of ["x1", "x2"]) {
    on("exchange-" + key, event => {
      lab().exchange[key] = event.target.valueAsNumber;
      queuePlots();
    }, "input");
    on("builder-" + key, event => {
      lab().builder[key] = event.target.valueAsNumber;
      queuePlots();
    }, "input");
  }

  on("occupation-type", event => {
    const data = lab().occupation;
    data.type = event.target.value;
    data.counts.fill(0);
    data.message = "New statistics selected. Board empty.";
    renderOccupation();
    drawScene();
  }, "change");
  on("occupation-clear", () => {
    lab().occupation.counts.fill(0);
    lab().occupation.message = "Board empty.";
    renderOccupation();
    drawScene();
  });
  for (const button of all("[data-ip-add]")) {
    button.addEventListener("click", () => changeOccupation(button.dataset.ipAdd, 1));
  }
  for (const button of all("[data-ip-remove]")) {
    button.addEventListener("click", () => {
      changeOccupation(button.dataset.ipRemove, -1);
      if (button.disabled) root.querySelector('[data-ip-add="' + button.dataset.ipRemove + '"]').focus();
    });
  }

  on("builder-preset", event => {
    const data = lab().builder;
    data.preset = event.target.value;
    [data.x1, data.x2] = data.preset === "well" ? [0.25, 0.55] : [-1, 1];
    renderBuilder();
    drawScene();
  }, "change");
  on("builder-sign", event => {
    lab().builder.sign = event.target.value;
    if (awaiting("build")) mission.actions.add(lab().builder.sign);
    renderBuilder();
    drawScene();
  }, "change");
  on("builder-distance", event => {
    lab().builder.distance = event.target.valueAsNumber;
    queuePlots();
  }, "input");
  on("builder-swap", () => {
    const data = lab().builder;
    [data.x1, data.x2] = [data.x2, data.x1];
    renderBuilder();
    drawScene();
  });

  on("spin-state", event => {
    lab().spin.key = event.target.value;
    lab().spin.swapped = false;
    renderSpin();
    drawScene();
  }, "change");
  on("spin-swap", () => {
    lab().spin.swapped = !lab().spin.swapped;
    renderSpin();
  });

  on("mission-start", () => startMission(element("mission").value));
  on("mission-retry", () => { if (mission) startMission(mission.key); });
  on("mission-exit", () => startMission("free"));
  on("mission-station", () => { if (mission) visit(mission.definition.station); });
  on("case-return", () => visit("missions"));
  on("mission-form", checkMission, "submit");

  on("enter", () => {
    heist = true;
    root.dataset.ipView = "heist";
    hide("heist", false);
    element("enter").setAttribute("aria-expanded", "true");
    selectStation(mission?.definition.station ?? station);
    element("heist-title").focus();
    void updateGraphics();
  });
  on("return", () => {
    heist = false;
    delete root.dataset.ipView;
    hide("heist", true);
    element("enter").setAttribute("aria-expanded", "false");
    element("enter").focus();
    void updateGraphics();
  });
  on("camera-close", () => setClose(!close));
  on("camera-reset", () => setClose(false));

  function changeEffects() {
    stopPulse();
    queuePlots();
    void updateGraphics();
  }

  on("effects", changeEffects, "change");
  motion.addEventListener("change", changeEffects);
  for (const button of deck) {
    button.disabled = false;
    button.addEventListener("click", () => visit(button.dataset.ipDeck));
  }
  for (const link of all('a[href^="#"]')) {
    link.addEventListener("click", () => {
      const target = document.getElementById(link.hash.slice(1));
      const panel = target?.closest("[data-ip-station]");
      if (panel) selectStation(panel.dataset.ipStation);
    });
  }
  on("world", event => {
    event.preventDefault();
    rendererFailed();
  }, "webglcontextlost");
  on("world", () => {
    sceneFailed = false;
    void updateGraphics();
  }, "webglcontextrestored");
  if (window.ResizeObserver) new ResizeObserver(drawScene).observe(element("viewport"));
  else window.addEventListener("resize", drawScene);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPulse();
    else void updateGraphics();
  });
  window.addEventListener("pagehide", () => {
    stopPulse();
    disposeScene();
  });
  window.addEventListener("pageshow", () => { if (heist) void updateGraphics(); });

  element("effects").checked = mobile.matches;
  element("opening").reset();
  set("mission", "free");
  selectStation("vault");
  renderAll();
  for (const id of ["camera", "exchange", "opening", "vault", "occupation", "builder", "spin", "mission"]) {
    disable(id + "-controls", false);
  }
  disable("enter", false);
  hide("static-note", true);
}

const lesson = document.querySelector(".identical-particles-lesson");
if (lesson) initialize(lesson);