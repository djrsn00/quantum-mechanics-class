const TAU = 2 * Math.PI;
const GROUND = Math.PI ** -0.25;
const OPENING = {
  mode: "eigen", mass: 1, omega: 1, n: 0, r: 0, s: 1,
  alpha: 45, phi: 0, x0: 2, p0: 0
};
const LEVELS = Array.from({ length: 9 }, (_, n) => n);
const BINS = 40;
const BATCH = 100;
const SVG = "http://www.w3.org/2000/svg";
const TARGET = 0.8;
const TARGET_PHASE = Math.asin((TARGET - 0.5) * Math.sqrt(2 * Math.PI)) * 180 / Math.PI;
const STATION = { eigen: "deck", pair: "mixer", coherent: "launcher" };
const MODES = { deck: "eigen", mixer: "pair", launcher: "coherent" };
const PERIOD_UNITS = " tref";
const POSITION_UNITS = " Lref";

const energy = (n, omega) => (n + 0.5) * omega;
const radians = degrees => degrees * Math.PI / 180;
const mod = (x, period) => ((x % period) + period) % period;
const format = (x, digits = 4) => (Math.abs(x) < 0.5 * 10 ** -digits ? 0 : x)
  .toFixed(digits).replace("-", "−");
const percent = x => (100 * x).toFixed(2) + "%";
const phaseText = x => format(Math.round(mod(x, TAU) * 1800 / Math.PI) % 3600 / 10, 1) + "°";

function hermite(n, x) {
  let previous = 0;
  let current = GROUND * Math.exp(-(x ** 2) / 2);
  for (let j = 1; j <= n; j += 1) {
    const next = (Math.SQRT2 * x * current - Math.sqrt(j - 1) * previous) / Math.sqrt(j);
    previous = current;
    current = next;
  }
  return current;
}

function hermiteRoots() {
  const roots = [[]];
  for (let n = 1; n < LEVELS.length; n += 1) {
    const edges = [-6, ...roots[n - 1], 6];
    roots[n] = edges.slice(0, -1).map((edge, index) => {
      let left = edge;
      let right = edges[index + 1];
      const sign = Math.sign(hermite(n, left));
      for (let step = 0; step < 52; step += 1) {
        const mid = (left + right) / 2;
        const value = hermite(n, mid);
        if (value === 0) return mid;
        if (Math.sign(value) === sign) left = mid;
        else right = mid;
      }
      return (left + right) / 2;
    });
  }
  return roots;
}

const ROOTS = hermiteRoots();
const derivativeAtZero = n => n ? Math.sqrt(2 * n) * hermite(n - 1, 0) : 0;
// The Schrödinger equations reduce the half-line overlap to the Wronskian at zero.
const HALF_OVERLAP = LEVELS.map(r => LEVELS.map(s => r === s ? 0.5
  : (hermite(r, 0) * derivativeAtZero(s) - derivativeAtZero(r) * hermite(s, 0)) / (2 * (s - r))));

function tailIntegral(density, start) {
  if (start >= 14) return 0;
  // The supported Hermite functions and the standard Gaussian have negligible tails past ξ = 14.
  const panels = 512;
  const dx = (14 - start) / panels;
  let sum = density(start) + density(14);
  for (let i = 1; i < panels; i += 1) sum += (i % 2 ? 4 : 2) * density(start + dx * i);
  return sum * dx / 3;
}

const EIGEN_TAIL = LEVELS.map(n => 2 * tailIntegral(x => hermite(n, x) ** 2, Math.sqrt(2 * n + 1)));
const gaussian = x => Math.exp(-(x ** 2)) / Math.sqrt(Math.PI);

function gaussianTail(x) {
  return x < 0 ? 1 - gaussianTail(-x) : x === 0 ? 0.5 : tailIntegral(gaussian, x);
}

function oscillator(setup, time) {
  const { omega, mass, mode, n, r, s, alpha, phi, x0, p0 } = setup;
  const ell = 1 / Math.sqrt(mass * omega);
  const period = TAU / omega;
  const sigma = ell / Math.SQRT2;
  const theta = mod(omega * time, 2 * TAU);
  const coherent = mode === "coherent";
  const pair = mode === "pair";
  const rightWeight = pair ? (alpha === 90 ? 1 : alpha === 0 ? 0 : Math.sin(radians(alpha))) : 0;
  const leftWeight = !pair || alpha === 0 ? 1 : alpha === 90 ? 0 : Math.cos(radians(alpha));
  const first = pair ? r : n;
  const both = leftWeight > 0 && rightWeight > 0 && pair;
  const level = coherent || both ? null : rightWeight === 1 ? s : first;
  const phaseA = -(first + 0.5) * theta;
  const phaseB = radians(phi) - (s + 0.5) * theta;
  const relative = radians(phi) - (s - first) * theta;
  const cross = both ? 2 * leftWeight * rightWeight * Math.cos(relative) : 0;
  const launchRadius = Math.hypot(x0, p0 / (mass * omega));
  const center = coherent ? x0 * Math.cos(theta) + p0 / (mass * omega) * Math.sin(theta) : 0;
  const momentum = coherent ? p0 * Math.cos(theta) - mass * omega * x0 * Math.sin(theta) : 0;
  const meanEnergy = coherent ? energy(0, omega) + p0 ** 2 / (2 * mass) + mass * omega ** 2 * x0 ** 2 / 2
    : leftWeight ** 2 * energy(first, omega) + rightWeight ** 2 * energy(s, omega);
  const ar = leftWeight * Math.cos(phaseA);
  const ai = leftWeight * Math.sin(phaseA);
  const br = rightWeight * Math.cos(phaseB);
  const bi = rightWeight * Math.sin(phaseB);
  const right = coherent ? gaussianTail(-center / ell)
    : Math.max(0, Math.min(1, 0.5 + cross * HALF_OVERLAP[first][s]));
  const view = coherent ? Math.max(6, Math.ceil(launchRadius + 6 * ell)) : Math.max(6, Math.ceil(6 * ell));
  const turning = level === null ? null : ell * Math.sqrt(2 * level + 1);
  const nodes = level === null ? [] : ROOTS[level].map(x => x * ell);
  const tail = level === null ? null : EIGEN_TAIL[level];
  const occupied = coherent ? [] : level === null ? [first, s] : [level];
  const beat = both ? period / Math.abs(s - first) : null;

  function value(x) {
    if (coherent) {
      const xi = (x - center) / ell;
      const amplitude = hermite(0, xi) / Math.sqrt(ell);
      const phase = momentum * (x - center / 2) - theta / 2;
      return { re: amplitude * Math.cos(phase), im: amplitude * Math.sin(phase), density: amplitude ** 2 };
    }
    const a = hermite(first, x / ell) / Math.sqrt(ell);
    const b = rightWeight ? hermite(s, x / ell) / Math.sqrt(ell) : 0;
    const re = ar * a + br * b;
    const im = ai * a + bi * b;
    return { re, im, density: re ** 2 + im ** 2 };
  }

  function omitted() {
    if (coherent) return gaussianTail((view - center) / ell) + gaussianTail((view + center) / ell);
    const tailOf = index => 2 * tailIntegral(x => hermite(index, x) ** 2, view / ell);
    const base = leftWeight ** 2 * tailOf(first) + (rightWeight ? rightWeight ** 2 * tailOf(s) : 0);
    const evenCross = both && (first + s) % 2 === 0
      ? 2 * cross * tailIntegral(x => hermite(first, x) * hermite(s, x), view / ell) : 0;
    return Math.max(0, base + evenCross);
  }

  return {
    setup, time, ell, sigma, period, coherent, pair, both, leftWeight, rightWeight, level,
    relative, phase: rightWeight === 1 ? phaseB : phaseA, center, momentum, meanEnergy, right,
    view, turning, nodes, tail, occupied, beat, value, omitted
  };
}

function positions(model, count, random = Math.random) {
  if (model.coherent || model.level === 0) {
    return Array.from({ length: count }, () => {
      const radial = Math.sqrt(-2 * Math.log(1 - random()));
      return model.center + model.sigma * radial * Math.cos(TAU * random());
    });
  }

  // Integrate the snapshot density on a fixed range in ξ, independent of the plot.
  const size = 4096;
  const start = -12 * model.ell;
  const dx = -2 * start / size;
  const cdf = new Float64Array(size + 1);
  let left = model.value(start).density;
  for (let j = 0; j < size; j += 1) {
    const x = start + j * dx;
    const right = model.value(x + dx).density;
    cdf[j + 1] = cdf[j] + dx / 6 * (left + 4 * model.value(x + dx / 2).density + right);
    left = right;
  }
  return Array.from({ length: count }, () => {
    const target = cdf[size] * random();
    let a = 0;
    let b = size;
    while (b - a > 1) {
      const mid = (a + b) >>> 1;
      if (cdf[mid] > target) b = mid;
      else a = mid;
    }
    const width = cdf[b] - cdf[a];
    return start + dx * (a + (width ? (target - cdf[a]) / width : 0));
  });
}

function makePlot(get, document) {
  const svg = (tag, attributes) => {
    const node = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  };
  const bars = Array.from({ length: BINS }, (_, i) => svg("rect", {
    x: 64 + i * 552 / BINS, width: 552 / BINS, y: 322, height: 0
  }));
  const rungs = LEVELS.map(() => svg("line", { x1: 64, x2: 616 }));
  get("histogram").replaceChildren(...bars);
  get("level-lines").replaceChildren(...rungs);

  const setPath = (id, d, visible = true) => {
    const node = get(id);
    node.setAttribute("d", d);
    node.toggleAttribute("hidden", !visible);
  };
  const label = (id, value) => {
    const node = get(id);
    if (node.textContent !== value) node.textContent = value;
  };

  return function draw(model, samples, options) {
    const { view, ell, coherent, occupied, nodes, turning, setup } = model;
    const { conceal, showTurns, showAmplitude, showReference, showClassical, target } = options;
    const x = pos => 340 + 276 * pos / view;
    const potentialMax = 0.5 * setup.mass * setup.omega ** 2 * view ** 2;
    const energyMax = Math.ceil(Math.max(energy(8, setup.omega), potentialMax));
    const energyY = e => 143 - 108 * e / energyMax;
    const points = Array.from({ length: 321 }, (_, j) => {
      const pos = (j - 160) / 160 * view;
      return {
        pos, ...model.value(pos),
        stationary: gaussian(pos / ell) / ell,
        target: target?.value(pos).density ?? 0
      };
    });

    const observed = Array(BINS).fill(0);
    let offView = 0;
    const binWidth = 2 * view / BINS;
    for (const pos of samples) {
      if (pos < -view || pos > view) offView += 1;
      else observed[Math.min(BINS - 1, Math.floor((pos + view) / binWidth))] += 1;
    }
    const curveMax = points.reduce((peak, item) => Math.max(peak, item.density,
      showReference ? item.stationary : 0, item.target), 0);
    const histogram = observed.map(count => samples.length ? count / (samples.length * binWidth) : 0);
    const maximum = Math.ceil(Math.max(0.1, curveMax, ...histogram) * 20) / 20;
    const amplitude = Math.ceil(Math.max(0.25, Math.sqrt(curveMax)) * 20) / 20;
    const densityY = rho => 322 - 80 * rho / maximum;
    const curve = (key, y) => points.map(({ pos, [key]: ordinate }, j) =>
      (j ? "L" : "M") + x(pos).toFixed(2) + " " + y(ordinate).toFixed(2)).join("");
    const vertical = (pos, top, bottom) => "M" + x(pos) + " " + top + "V" + bottom;

    setPath("potential-path", "M64 " + energyY(potentialMax) + " Q340 "
      + (2 * energyY(0) - energyY(potentialMax)) + " 616 " + energyY(potentialMax));
    rungs.forEach((line, n) => {
      const y = energyY(energy(n, setup.omega));
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.toggleAttribute("hidden", conceal || occupied.includes(n));
    });
    setPath("energy-path", conceal ? ""
      : occupied.map(n => "M64 " + energyY(energy(n, setup.omega)) + "H616").join(" "));
    setPath("turn-lines", showTurns
      ? [-turning, turning].map(pos => vertical(pos, energyY(model.meanEnergy), 322)).join(" ") : "");
    setPath("real-path", showAmplitude ? curve("re", v => 193 - 29 * v / amplitude) : "", showAmplitude);
    setPath("imag-path", showAmplitude ? curve("im", v => 193 - 29 * v / amplitude) : "", showAmplitude);
    setPath("density-path", curve("density", densityY));
    setPath("reference-path", showReference ? curve("stationary", densityY) : "", showReference);
    setPath("target-path", target ? curve("target", densityY) : "", Boolean(target));
    setPath("mean-line", coherent ? vertical(model.center, 246, 322) : "", coherent);
    setPath("classical-line", showClassical ? vertical(model.center, 224, 243) : "", showClassical);
    get("node-marks").replaceChildren(...nodes.map(pos => svg("circle", { cx: x(pos), cy: 193, r: 3.6 })));
    get("sample-marks").replaceChildren(...samples.slice(-20).filter(pos => Math.abs(pos) <= view)
      .map((pos, index) => svg("circle", { cx: x(pos), cy: 318 - index % 3 * 4, r: 2.9 })));
    bars.forEach((bar, i) => {
      const y = densityY(histogram[i]);
      bar.setAttribute("y", y);
      bar.setAttribute("height", 322 - y);
    });
    label("energy-max", format(energyMax, 1));
    label("amp-max", showAmplitude ? format(amplitude, 2) : "—");
    label("amp-min", showAmplitude ? format(-amplitude, 2) : "—");
    label("density-max", format(maximum, 2));
    label("x-min", format(-view, 0));
    label("x-max", format(view, 0));
    return { points, offView };
  };
}

function makeStudio(THREE, canvas, viewport, browser) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080e19);
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 80);

  function box(color, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  function line(color, points, capacity = points.length) {
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(new Float32Array(3 * capacity), 3);
    points.forEach((pos, j) => attribute.setXYZ(j, ...pos));
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
    const mesh = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }

  box(0x172834, 0, -2.45, 0, 15.2, 0.22, 6.0);
  box(0x233b40, 0, 3.45, -0.5, 13.7, 0.18, 3.2);
  for (const x of [-6.1, 6.1]) {
    box(0x557185, x, 1.1, -1.55, 0.12, 4.7, 0.12);
    box(0x557185, x, 1.1, 1, 0.12, 4.7, 0.12);
  }
  for (const z of [-1.45, -0.72, 0, 0.72, 1.45]) {
    line(z === 0 ? 0xffb56a : 0x9c6843, Array.from({ length: 81 }, (_, j) => {
      const x = (j - 40) / 40;
      return [5.9 * x, -1.58 + 2.25 * x * x, z];
    }));
  }

  box(0x101c32, 0, 1.1, -2.2, 12.6, 4.2, 0.15);
  const rungs = LEVELS.map(n => box(0x364e60, 4.8, -0.76 + 0.42 * n, -2.06, 2.2, 0.065, 0.12));
  box(0x303953, -3.6, -1.94, 2.1, 3.45, 0.16, 1.3);
  const faders = [0x65b7ff, 0xc19bff].map((color, j) => {
    box(0x101721, -4.22 + 1.24 * j, -1.84, 2.1, 0.15, 0.035, 0.93);
    return box(color, -4.22 + 1.24 * j, -1.77, 2.1, 0.44, 0.11, 0.17);
  });
  const density = line(0x69e3d8, [], 321);
  const detector = box(0xff676f, 0, -1.25, 1.52, 0.11, 0.12, 0.13);
  const mean = box(0x63f59b, 0, -1.42, 1.32, 0.08, 0.38, 0.11);
  let size = "";

  return {
    draw(model, points, latest, cameraMode, degrees, conceal) {
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      if (!w || !h) return;
      const aspect = w / h;
      const ratio = Math.min(browser.devicePixelRatio || 1, 1.5, 1500 / Math.max(w, h));
      const tag = w + ":" + h + ":" + ratio;
      if (tag !== size) {
        renderer.setPixelRatio(ratio);
        renderer.setSize(w, h, false);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        size = tag;
      }

      const inside = cameraMode === "inside";
      const fit = Math.max(1, 1.6 / aspect);
      const angle = radians(degrees + (inside ? -28 : 0));
      const distance = (inside ? 9.7 : 13.3) * fit;
      camera.position.set(Math.sin(angle) * distance, inside ? 2.05 : 5.2, Math.cos(angle) * distance);
      camera.lookAt(0, inside ? -0.15 : 0.33, 0);

      const scale = 5.9 / model.view;
      const height = 1.6 / Math.max(0.12, ...points.map(point => point.density));
      const positions = density.geometry.attributes.position;
      points.forEach((point, j) => positions.setXYZ(j, point.pos * scale, -0.62 + height * point.density, -1.37));
      positions.needsUpdate = true;
      rungs.forEach((rung, n) => {
        rung.visible = !conceal;
        rung.material.color.setHex(model.occupied.includes(n) ? 0xffe16a : 0x364e60);
      });
      faders[0].position.z = 2.52 - 0.84 * model.leftWeight ** 2;
      faders[1].position.z = 2.52 - 0.84 * model.rightWeight ** 2;
      faders.forEach(fader => { fader.visible = !conceal; });
      detector.visible = latest !== undefined && Math.abs(latest) <= model.view;
      if (detector.visible) detector.position.x = latest * scale;
      mean.visible = model.coherent;
      if (mean.visible) mean.position.x = model.center * scale;
      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse(object => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
      renderer.dispose();
    }
  };
}

function makeSound(browser) {
  let context = null;
  let gain = null;
  const voices = new Map();

  function remove(oscillator) {
    const envelope = voices.get(oscillator);
    if (!envelope) return;
    voices.delete(oscillator);
    oscillator.disconnect();
    envelope.disconnect();
  }

  function stop() {
    for (const oscillator of voices.keys()) {
      oscillator.stop();
      remove(oscillator);
    }
  }

  return {
    async enable() {
      const Audio = browser.AudioContext ?? browser.webkitAudioContext;
      if (!Audio) throw new Error("AudioContext unavailable");
      if (!context || context.state === "closed") {
        context = new Audio();
        gain = context.createGain();
        gain.gain.value = 0;
        gain.connect(context.destination);
      }
      await context.resume();
    },
    volume(value) {
      if (!gain || !context) return;
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(value, now, 0.015);
    },
    cue(notes) {
      if (!context || context.state !== "running") return;
      stop();
      const now = context.currentTime;
      for (const [frequency, weight, duration, type] of notes) {
        if (weight <= 0) continue;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(0.16 * weight, now + 0.018);
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(envelope);
        envelope.connect(gain);
        voices.set(oscillator, envelope);
        oscillator.onended = () => remove(oscillator);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.01);
      }
    },
    stop,
    close() {
      stop();
      gain?.disconnect();
      if (context && context.state !== "closed") void context.close().catch(() => {});
      context = null;
      gain = null;
    }
  };
}

const MISSIONS = {
  ground: [
    "Find the Ground Beat. Predict the ground-state energy and spread, then compare two sets of detections.",
    "Use the zero-point term and distinguish ℓ from the position standard deviation."
  ],
  ladder: [
    "Climb the Ladder. Compare the lowest gap with the gap between levels 6 and 7 at ω = 1.25 ωref.",
    "Subtract the energies in each pair. The offset of ½ appears in both."
  ],
  nodes: [
    "Node Detective. Identify the hidden eigenstate from the finite zeros of its signed wavefunction.",
    "The number of finite internal zeros determines n. The small tails at the edges are not additional nodes."
  ],
  mix: [
    "Mix a Moving Pattern. Adjust α or φ for levels 0 and 1. Compare with the target snapshot.",
    "At T/4 the relative phase equals the initial phase minus 90°. Compare area on the right."
  ],
  launch: [
    "Launch the Wave. Set x₀ and p₀, then predict the center at T/4.",
    "At T/4 the cosine term vanishes and the sine term equals one. Predict the mean in fixed length units."
  ],
  turn: [
    "Beyond the Turning Point. Choose a level, estimate both turning points, and predict an exterior detection.",
    "Solve V(x) = Eₙ and look at the two intersections of the occupied rung with the potential."
  ],
  tune: [
    "Tune the Instrument. At mass 1 mref, set the frequency for a gap of 1.50 Eref and predict the spread.",
    "The gap is ℏω and the ground-state spread is √[ℏ/(2mω)]."
  ]
};

const STATION_NOTES = {
  deck: "Energy-State Deck. Select an eigenstate below, then inspect its rung, nodes, and turning points.",
  mixer: "State Mixer. Use the component faders below. The relative phase changes the interference pattern.",
  launcher: "Coherent-State Launcher. Set displacement and momentum below. Compare the mean and the classical reference each quarter period.",
  sound: "Quantum Sound Console. Use the opt-in mappings below with the current preparation."
};

const OPENING_ANSWERS = {
  center: "The center is the most probable location per unit length. Position detections spread around it according to the Gaussian density.",
  spread: "Correct. Independent preparations give different positions distributed according to one stationary Gaussian.",
  turns: "The turning points are where the classical kinetic energy vanishes. The quantum position density is continuous and extends beyond both points."
};

function initialize(root) {
  const document = root.ownerDocument;
  const browser = document.defaultView;
  const lookup = new Map();

  function get(id) {
    if (!lookup.has(id)) lookup.set(id, root.querySelector("#oh-" + id));
    return lookup.get(id);
  }

  const set = (id, value) => { get(id).value = String(value); };
  const text = (id, value) => {
    const node = get(id);
    if (node.textContent !== value) node.textContent = value;
  };
  const hide = (id, state) => { get(id).hidden = state; };
  const disable = (id, state) => { get(id).disabled = state; };
  const checked = id => get(id).checked;
  const input = id => get(id).value;
  const on = (id, action, type = "click") => get(id).addEventListener(type, action);
  const motion = browser.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motion.matches || checked("effects");
  const drawPlot = makePlot(get, document);
  const ladder = [...get("ladder").rows];
  const panels = [...root.querySelectorAll("[data-oh-mission]")];
  const audio = makeSound(browser);
  const blank = "—";
  const createLab = (setup = {}) => ({ setup: { ...OPENING, ...setup }, time: 0, samples: [] });

  let exploration = createLab();
  let mission = null;
  let studioOpen = false;
  let station = "deck";
  let view = null;
  let failedGraphics = false;
  let loadingGraphics = false;
  let graphicsVersion = 0;
  let frame = null;
  let playback = null;
  let clockStart = null;
  let timeStart = 0;
  let lastPaint = -Infinity;
  let soundEnabled = false;
  let soundPending = false;
  let soundVersion = 0;

  const lab = () => mission?.lab ?? exploration;
  const kind = () => mission?.key;
  const secret = () => kind() === "nodes" && !mission.revealed;
  const groundPending = () => kind() === "ground" && !mission.baseline;
  const turnPending = () => kind() === "turn" && !mission.revealed;
  const tunePending = () => kind() === "tune" && !mission.revealed;

  function eligible(key) {
    if (!mission) return true;
    if (kind() === "mix") return key === "alpha" || key === "phi";
    if (kind() === "launch") return key === "x0" || key === "p0";
    if (kind() === "turn") return key === "n";
    return kind() === "tune" && key === "omega";
  }

  function permittedAudio() {
    return studioOpen && !document.hidden && !secret() && soundEnabled && !checked("mute");
  }

  function volume() {
    text("volume-value", input("volume") + "%");
    audio.volume(permittedAudio() ? Number(input("volume")) / 100 : 0);
  }

  function cueLevel() {
    if (!permittedAudio() || !checked("tone")) return;
    const m = oscillator(lab().setup, lab().time);
    if (m.coherent) return;
    const weights = m.both ? [m.leftWeight ** 2, m.rightWeight ** 2] : [1];
    audio.cue(m.occupied.map((n, i) => [220 * 2 ** (n / 12), weights[i], 0.32, "sine"]));
  }

  function stopAudio() {
    soundVersion += 1;
    soundEnabled = false;
    soundPending = false;
    audio.close();
    get("sound-enable").setAttribute("aria-pressed", "false");
    text("sound-enable", "Enable sound");
  }

  function syncPreparation() {
    const { setup } = lab();
    for (const key of Object.keys(OPENING)) {
      set(key, key === "n" && secret() ? "" : setup[key]);
      disable(key, !eligible(key));
    }
    hide("prepare-controls", secret());
    hide("eigen-controls", setup.mode !== "eigen");
    hide("pair-controls", setup.mode !== "pair");
    hide("coherent-controls", setup.mode !== "coherent");
    text("alpha-value", setup.alpha + "°");
    text("phi-value", setup.phi + "°");
    if (station !== "sound") station = STATION[setup.mode];
    set("station", station);
    text("station-note", secret() ? "The hidden preparation supplies its zero locations and signed trace."
      : STATION_NOTES[station]);
    disable("station", Boolean(mission));
    hide("prediction", Boolean(mission));
    hide("sound-controls", secret());
    for (const panel of panels) panel.hidden = panel.dataset.ohMission !== kind();
    disable("mission-exit", !mission);
    disable("mission-retry", !mission);
  }

  function syncControlState(model) {
    const playing = playback !== null;
    disable("play", playing || secret() || groundPending());
    disable("pause", !playing);
    disable("step", playing || secret() || groundPending());
    disable("quarter", secret() || groundPending());
    disable("reset-time", secret());
    disable("measure", groundPending());
    disable("batch", groundPending());
    disable("clear", !lab().samples.length);
    disable("ground-commit", kind() !== "ground" || Boolean(mission.baseline));
    disable("ground-observe", kind() !== "ground" || !mission.baseline || model.time <= 1e-9);
    disable("node-check", !secret());
    disable("phase-probe", secret());
    disable("amplitudes", secret());
    disable("reference", !model.pair);
    disable("classical", !model.coherent);
    text("clock-note", secret() ? "Paused for the mystery snapshot."
      : playing ? "Playing. The clock uses elapsed time."
        : reduced() ? "Paused. Play / Resume takes one still step in reduced effects."
          : "Paused. T is the oscillator period. A step advances " + format(model.period / 24) + PERIOD_UNITS + ".");
  }

  function readouts(m, phase, showTurns, showClassical) {
    hide("energy-row", secret() || groundPending());
    hide("ladder-card", secret() || groundPending());
    hide("eigen-readouts", m.level === null || secret());
    hide("nodes-row", secret());
    hide("turning-row", !showTurns);
    hide("tail-row", !showTurns);
    hide("sample-outside-row", !showTurns);
    hide("pair-readouts", !m.pair);
    hide("coherent-readouts", !m.coherent);
    hide("classical-row", !showClassical);
    get("ground-width").parentElement.hidden = groundPending() || tunePending();
    get("phase").parentElement.hidden = secret();

    text("time", format(m.time) + PERIOD_UNITS);
    text("length", format(m.ell) + POSITION_UNITS);
    text("ground-width", format(m.sigma) + POSITION_UNITS);
    text("period", format(m.period) + PERIOD_UNITS);
    text("frequency", format(1 / m.period) + " / tref");
    text("curvature", format(m.setup.mass * m.setup.omega ** 2) + " Eref/Lref²");
    text("energy-label", m.level === null ? "Mean energy" : "Eigenstate energy");
    text("energy", secret() || groundPending() ? blank : format(m.meanEnergy) + " Eref");
    text("gap", format(m.setup.omega) + " Eref");
    text("phase-label", m.both ? "Relative phase δ(t)" : m.coherent ? "Oscillator angle ωt" : "Global phase");
    text("phase", secret() ? blank : phase);
    text("right", percent(m.right));
    text("nodes", secret() ? blank : m.nodes.length ? m.nodes.length + " at "
      + m.nodes.map(x => format(x, 3)).join(", ") + POSITION_UNITS : "0");
    text("turning", showTurns ? format(-m.turning) + ", +" + format(m.turning) + POSITION_UNITS : blank);
    text("tail", showTurns ? percent(m.tail) : blank);
    text("r-weight", format(m.leftWeight) + " / " + percent(m.leftWeight ** 2));
    text("s-weight", format(m.rightWeight) + " / " + percent(m.rightWeight ** 2));
    text("beat", m.beat === null ? "Stationary density" : format(m.beat) + PERIOD_UNITS);
    text("center", m.coherent ? format(m.center) + POSITION_UNITS : blank);
    text("classical-position", showClassical ? format(m.center) + POSITION_UNITS : blank);
    text("mean-momentum", m.coherent ? format(m.momentum) + " ℏ/Lref" : blank);
    text("packet-width", m.coherent ? format(m.sigma) + POSITION_UNITS : blank);

    for (const [n, row] of ladder.entries()) {
      row.toggleAttribute("data-occupied", !secret() && !groundPending() && m.occupied.includes(n));
      row.cells[1].textContent = secret() || groundPending() ? blank : format(energy(n, m.setup.omega));
      row.cells[2].textContent = n && !secret() && !groundPending() ? format(m.setup.omega) : blank;
    }

    const description = secret() ? "The unknown state is shown at t = 0. Use its finite zeros to identify the level."
      : m.coherent ? "The packet keeps its Gaussian width as its mean oscillates. The classical reference follows the same mean."
        : m.both ? "The two occupied phases change the interference pattern. An arbitrary mix has no single eigenstate turning point or node count."
          : "The phase rotates while this eigenstate’s position density stays fixed.";
    text("state-note", description);
    text("plot-desc", description + " Right-half probability " + percent(m.right) + "."
      + (showTurns ? " Beyond both turning points " + percent(m.tail) + "." : "")
      + (m.coherent ? " Mean position " + format(m.center) + POSITION_UNITS + "." : ""));
  }

  function render() {
    const active = lab();
    const m = oscillator(active.setup, active.time);
    const showTurns = m.turning !== null && !secret() && !turnPending() && !groundPending();
    const showClassical = m.coherent && checked("classical");
    const showReference = m.pair && checked("reference");
    const target = kind() === "mix"
      ? oscillator({ ...active.setup, alpha: 45, phi: TARGET_PHASE }, m.period / 4) : null;
    const renderData = drawPlot(m, active.samples, {
      conceal: secret() || groundPending(), showTurns, showClassical, showReference, target,
      showAmplitude: secret() || checked("amplitudes")
    });
    frame = { model: m, points: renderData.points };
    hide("reference-key", !showReference);
    hide("target-key", !target);
    hide("mean-key", !m.coherent);
    hide("classical-key", !showClassical);
    const phase = phaseText(m.both ? m.relative : m.coherent ? m.setup.omega * m.time : m.phase);
    readouts(m, phase, showTurns, showClassical);
    syncControlState(m);

    text("plot-note", "View: ±" + format(m.view, 0) + " Lref."
      + (secret() ? " The finite zeros are marked on the signed trace."
        : " Probability outside this view ≈ " + m.omitted().toExponential(2)
          + " of the total. Sampling uses its own domain.")
      + (showTurns ? " Dashed vertical lines mark the classical turning points." : ""));
    const probe = Number(input("phase-probe")) * m.view / 100;
    const at = m.value(probe);
    text("probe-x", format(probe, 2) + POSITION_UNITS);
    text("probe-value", secret() ? "Use the zero locations in the mission to identify this preparation."
      : at.density < 1e-20 ? "Phase is undefined at a zero; the amplitude here is at or below the display threshold."
        : "Local phase at the probe is " + phaseText(Math.atan2(at.im, at.re)) + ".");
    get("phase-probe").setAttribute("aria-valuetext", format(probe, 2) + " reference lengths");

    const { samples } = active;
    const count = samples.length;
    const latest = samples.at(-1);
    text("sample-time", count ? format(m.time) + PERIOD_UNITS : blank);
    text("sample-count", String(count));
    text("sample-latest", count ? format(latest) + POSITION_UNITS : blank);
    text("sample-off", String(renderData.offView));
    text("sample-mean", count ? format(samples.reduce((sum, p) => sum + p, 0) / count) + POSITION_UNITS : blank);
    text("sample-right", count ? percent(samples.filter(p => p > 0).length / count) : blank);
    text("sample-outside", count && showTurns ? percent(samples.filter(p => Math.abs(p) > m.turning).length / count) : blank);
    text("studio-phase", secret() ? "Phase readout held for the mystery snapshot."
      : (m.both ? "Relative phase " : m.coherent ? "Oscillator angle " : "Global phase ") + phase);

    const detector = get("studio-detector");
    const sampleMessage = count ? "Detector · " + format(latest) + POSITION_UNITS
      + (Math.abs(latest) > m.view ? " (beyond this view)." : ".") : "Detector · Awaiting a position sample.";
    text("studio-detector", sampleMessage);
    detector.toggleAttribute("data-detected", count > 0);
    if (kind() === "nodes") {
      text("node-evidence", "Finite signed-amplitude zeros (Lref): "
        + m.nodes.map(x => format(x, 3)).join(", ") + ". The trace changes sign through each.");
    }
    renderStudio();
  }

  function releaseStudio() {
    graphicsVersion += 1;
    loadingGraphics = false;
    view?.dispose();
    view = null;
    hide("viewport", true);
  }

  function renderStudio() {
    if (!view || !frame || !studioOpen || reduced() || document.hidden) return;
    try {
      view.draw(frame.model, frame.points, lab().samples.at(-1), input("camera"),
        Number(input("orbit")), secret() || groundPending());
    } catch {
      failedGraphics = true;
      releaseStudio();
      text("renderer", "The calibrated two-dimensional instruments are active.");
    }
  }

  async function syncGraphics() {
    text("camera-readout", (input("camera") === "inside" ? "Inside" : "Overview")
      + ", orbit " + format(Number(input("orbit")), 0) + "°.");
    if (!studioOpen || reduced() || failedGraphics) {
      releaseStudio();
      text("renderer", reduced() ? "Reduced effects. The calibrated two-dimensional instruments are active."
        : "The calibrated two-dimensional instruments are active.");
      return;
    }
    if (document.hidden) return;
    if (view) {
      renderStudio();
      return;
    }
    if (loadingGraphics) return;
    const ticket = ++graphicsVersion;
    loadingGraphics = true;
    text("renderer", "Loading the chamber. The calibrated instruments are available below.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (ticket !== graphicsVersion || document.hidden) return;
      view = makeStudio(THREE, get("canvas"), get("viewport"), browser);
      hide("viewport", false);
      text("renderer", "The suspended chamber is active. Read calibrated values on the instruments below.");
      renderStudio();
    } catch {
      if (ticket !== graphicsVersion) return;
      failedGraphics = true;
      releaseStudio();
      text("renderer", "The calibrated two-dimensional instruments are active.");
    } finally {
      if (ticket === graphicsVersion) loadingGraphics = false;
    }
  }

  function pause() {
    if (playback !== null) browser.cancelAnimationFrame(playback);
    playback = null;
    clockStart = null;
    audio.stop();
  }

  function changeTime(time) {
    const active = lab();
    if (active.time !== time) active.samples = [];
    active.time = time;
  }

  function snapshot(time) {
    pause();
    changeTime(time);
    render();
  }

  function tick(now) {
    const active = lab();
    if (clockStart === null) clockStart = now;
    const period = TAU / active.setup.omega;
    const previousPeriod = Math.floor(active.time / period);
    changeTime(timeStart + (now - clockStart) / 1000);
    if (active.setup.mode === "coherent" && Math.floor(active.time / period) > previousPeriod
      && permittedAudio() && checked("pulse")) {
      audio.cue([[98, 1, 0.17, "triangle"]]);
    }
    playback = browser.requestAnimationFrame(tick);
    if (now - lastPaint < 44) return;
    lastPaint = now;
    render();
  }

  function prepare(key, value) {
    if (!eligible(key)) return;
    const active = lab();
    if (active.setup[key] === value) return;
    if ((key === "r" && value === active.setup.s) || (key === "s" && value === active.setup.r)) {
      syncPreparation();
      text("lab-status", "Choose two distinct levels for the mixer.");
      return;
    }
    pause();
    active.setup[key] = value;
    active.time = 0;
    active.samples = [];
    if (mission) {
      mission.revealed = false;
      text("mission-feedback", "");
    }
    syncPreparation();
    render();
    if (key !== "alpha" && key !== "phi") text("lab-status", "New state prepared at t = 0. Previous detections cleared.");
    if (["n", "r", "s", "mode"].includes(key)) cueLevel();
  }

  function readNumber(id) {
    const node = get(id);
    return node.value && node.validity.valid && Number.isFinite(node.valueAsNumber)
      ? node.valueAsNumber : null;
  }

  function sample(count, announce = true, replace = false) {
    if (groundPending()) return [];
    pause();
    const active = lab();
    const draws = positions(oscillator(active.setup, active.time), count);
    if (replace) active.samples = draws;
    else active.samples.push(...draws);
    render();
    if (announce) {
      text("lab-status", count + (count === 1 ? " detection" : " detections")
        + " at t = " + format(active.time) + PERIOD_UNITS + ". " + active.samples.length + " in this snapshot.");
    }
    return draws;
  }

  function missionSetup(key, level) {
    if (key === "ladder") return { omega: 1.25 };
    if (key === "nodes") return { n: level ?? 2 + Math.floor(7 * Math.random()) };
    if (key === "mix") return { mode: "pair" };
    if (key === "launch") return { mode: "coherent", x0: 2, p0: 1 };
    if (key === "turn") return { n: 2 };
    return {};
  }

  function loadMission(key, level) {
    if (key !== "free" && !Object.hasOwn(MISSIONS, key)) return;
    pause();
    station = "deck";
    mission = key === "free" ? null : {
      key, lab: createLab(missionSetup(key, level)), revealed: false, baseline: null
    };
    text("mission-goal", mission ? MISSIONS[key][0] : "Free exploration is active.");
    text("mission-hint", mission ? MISSIONS[key][1] : "");
    text("mission-feedback", "");
    text("lab-status", "");
    text("ground-baseline", "");
    for (const id of ["ground-energy-answer", "ground-width-answer", "ground-fixed", "gap-low", "gap-high",
      "node-answer", "launch-answer", "turn-left", "turn-right", "turn-tail", "tune-answer"]) set(id, "");
    set("mission", key);
    syncPreparation();
    volume();
    render();
  }

  const average = draws => draws.reduce((sum, x) => sum + x, 0) / draws.length;
  const score = message => text("mission-feedback", message);
  const close = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance + 1e-12;

  on("mission-load", () => loadMission(input("mission")));
  on("mission-retry", () => {
    if (mission) loadMission(mission.key, mission.lab.setup.n);
  });
  on("mission-exit", () => {
    loadMission("free");
    get("mission-load").focus();
  });

  on("ground-commit", () => {
    if (!groundPending()) return;
    const guessE = readNumber("ground-energy-answer");
    const guessWidth = readNumber("ground-width-answer");
    if (guessE === null || guessWidth === null) {
      score("Enter both predictions in the stated units.");
      return;
    }
    pause();
    changeTime(0);
    const m = oscillator(lab().setup, 0);
    mission.baseline = {};
    const draws = sample(BATCH, false, true);
    mission.baseline.sampleMean = average(draws);
    const correct = close(guessE, m.meanEnergy, 0.01) && close(guessWidth, m.sigma, 0.02);
    text("ground-baseline", "The t = 0 sample mean was " + format(mission.baseline.sampleMean) + POSITION_UNITS + ".");
    score((correct ? "Both predictions match. " : "Compare your predictions with the readouts. ")
      + "The energy is " + format(m.meanEnergy) + " Eref and the spread is " + format(m.sigma) + POSITION_UNITS
      + ". Advance time with Step or T/4, then commit an observation.");
  });

  on("ground-observe", () => {
    if (kind() !== "ground" || !mission.baseline || lab().time <= 1e-9) return;
    const choice = input("ground-fixed");
    if (!choice) {
      score("Choose an observation.");
      return;
    }
    const draws = sample(BATCH, false, true);
    score((choice === "density" ? "Correct. " : "Look at the full squared magnitude. ")
      + "The Gaussian density stays fixed while the phase evolves. Sample means were "
      + format(mission.baseline.sampleMean) + POSITION_UNITS + " at t = 0 and "
      + format(average(draws)) + POSITION_UNITS + " at t = " + format(lab().time)
      + PERIOD_UNITS + ". Both batches follow the same spread.");
  });

  on("ladder-check", () => {
    if (kind() !== "ladder") return;
    const low = readNumber("gap-low");
    const high = readNumber("gap-high");
    if (low === null || high === null) {
      score("Enter a prediction for each gap.");
      return;
    }
    const w = lab().setup.omega;
    const gapA = energy(1, w) - energy(0, w);
    const gapB = energy(7, w) - energy(6, w);
    const match = close(low, gapA, 0.01) && close(high, gapB, 0.01);
    score((match ? "Both gaps match. " : "Compare the differences in the ladder. ")
      + "E₁ − E₀ = " + format(gapA, 2) + " Eref and E₇ − E₆ = " + format(gapB, 2)
      + " Eref. Both gaps equal ℏω because the zero-point offsets cancel.");
  });

  on("node-check", () => {
    if (!secret()) return;
    const guess = readNumber("node-answer");
    if (guess === null || !Number.isInteger(guess)) {
      score("Enter a level from 0 to 8.");
      return;
    }
    const n = lab().setup.n;
    mission.revealed = true;
    syncPreparation();
    volume();
    render();
    score((guess === n ? "Correct. " : "Count the sign changes between the tails. ")
      + "The state was n = " + n + ". Each of its " + n + " finite zeros is a root of Hₙ.");
    get("mission-retry").focus();
  });

  on("mix-check", () => {
    if (kind() !== "mix") return;
    snapshot(TAU / (4 * lab().setup.omega));
    const actual = frame.model.right;
    score((close(actual, TARGET, 0.01) ? "Target matched. " : "Adjust the mixture or phase and compare again. ")
      + "At T/4, P(x > 0) = " + percent(actual) + ". The absolute error is "
      + format(100 * Math.abs(actual - TARGET), 2) + " percentage points. The phase sets the cross term through cos δ.");
  });

  on("launch-check", () => {
    if (kind() !== "launch") return;
    const guess = readNumber("launch-answer");
    if (guess === null) {
      score("Enter a predicted center in Lref.");
      return;
    }
    snapshot(TAU / (4 * lab().setup.omega));
    const center = frame.model.center;
    const draws = sample(BATCH, false, true);
    score((close(guess, center, 0.05) ? "Prediction matched. " : "Compare your prediction with the quarter-period solution. ")
      + "The quantum mean and classical position are both " + format(center) + POSITION_UNITS
      + ". The first sample was " + format(draws[0]) + POSITION_UNITS + ", and the batch mean was "
      + format(average(draws)) + POSITION_UNITS + ". At T/4 the mean equals p₀/(mω).");
  });

  on("turn-check", () => {
    if (kind() !== "turn") return;
    const left = readNumber("turn-left");
    const right = readNumber("turn-right");
    const tail = input("turn-tail");
    if (left === null || right === null || !tail) {
      score("Enter both positions and an exterior prediction.");
      return;
    }
    pause();
    const m = oscillator(lab().setup, lab().time);
    mission.revealed = true;
    const draws = sample(BATCH, false, true);
    const correct = close(left, -m.turning, 0.05) && close(right, m.turning, 0.05) && tail === "yes";
    score((correct ? "Both points and the tail prediction match. " : "Compare with the revealed turning points and tail. ")
      + "The turning points are ±" + format(m.turning) + POSITION_UNITS + " and " + percent(m.tail)
      + " of probability lies outside them. This batch found " + draws.filter(x => Math.abs(x) > m.turning).length
      + "/" + BATCH + " outside. The state has zero stationary current, so these detections give no evidence of steady escape.");
  });

  on("tune-check", () => {
    if (kind() !== "tune") return;
    const guess = readNumber("tune-answer");
    if (guess === null) {
      score("Enter your predicted standard deviation.");
      return;
    }
    const m = oscillator(lab().setup, lab().time);
    mission.revealed = true;
    render();
    const hit = close(m.setup.omega, 1.5, 0.001);
    const width = close(guess, m.sigma, 0.02);
    score((hit && width ? "Gap and spread matched. " : hit ? "Gap matched. Compare the spread. " : "Adjust ω to reach the target gap. ")
      + "The current gap is " + format(m.setup.omega, 2) + " Eref and the spread is " + format(m.sigma)
      + POSITION_UNITS + ". At fixed mass, the spread decreases as 1/√ω.");
  });

  for (const key of Object.keys(OPENING)) {
    const control = get(key);
    const select = control.tagName === "SELECT";
    on(key, () => {
      const value = select ? (key === "mode" ? input(key) : Number(input(key))) : readNumber(key);
      if (value === null || (key === "mode" && !Object.hasOwn(STATION, value))
        || (select && key !== "mode" && !LEVELS.includes(value))) {
        syncPreparation();
        text("lab-status", "Choose a valid preparation setting.");
        return;
      }
      prepare(key, value);
    }, control.type === "range" ? "input" : "change");
  }

  on("play", () => {
    if (playback !== null || secret() || groundPending()) return;
    if (reduced()) {
      snapshot(lab().time + TAU / (24 * lab().setup.omega));
      return;
    }
    clockStart = null;
    timeStart = lab().time;
    lastPaint = -Infinity;
    playback = browser.requestAnimationFrame(tick);
    render();
    get("pause").focus({ preventScroll: true });
  });
  on("pause", () => {
    pause();
    render();
    get("play").focus({ preventScroll: true });
  });

  for (const [id, fraction] of [["step", 1 / 24], ["quarter", 1 / 4]]) {
    on(id, () => {
      if (secret() || groundPending()) return;
      snapshot(lab().time + fraction * TAU / lab().setup.omega);
    });
  }

  on("reset-time", () => {
    if (secret()) return;
    lab().samples = [];
    snapshot(0);
    text("lab-status", "Time and detectors reset. Preparation retained.");
  });
  on("restore", () => {
    if (mission) {
      loadMission(mission.key, mission.lab.setup.n);
    } else {
      pause();
      exploration = createLab();
      station = "deck";
      syncPreparation();
      render();
      text("lab-status", "Opening ground-state preparation restored.");
    }
  });

  on("measure", () => sample(1));
  on("batch", () => sample(BATCH));
  on("clear", () => {
    lab().samples = [];
    render();
    text("lab-status", "Detections cleared.");
  });
  for (const id of ["reference", "amplitudes", "classical"]) on(id, render, "change");
  on("phase-probe", render, "input");

  on("enter", () => {
    studioOpen = true;
    hide("studio", false);
    hide("enter", true);
    get("enter").setAttribute("aria-expanded", "true");
    get("studio-title").focus();
    void syncGraphics();
  });
  on("return", () => {
    studioOpen = false;
    stopAudio();
    text("sound-status", "Sound is off.");
    hide("studio", true);
    hide("enter", false);
    get("enter").setAttribute("aria-expanded", "false");
    releaseStudio();
    get("enter").focus();
  });

  on("station", () => {
    if (mission) return;
    const choice = input("station");
    if (choice === "sound") {
      station = choice;
      syncPreparation();
      get("sound-enable").focus({ preventScroll: true });
    } else {
      if (!Object.hasOwn(MODES, choice)) return;
      station = choice;
      prepare("mode", MODES[choice]);
      syncPreparation();
    }
  }, "change");
  on("camera-reset", () => {
    set("camera", "overview");
    set("orbit", 0);
    void syncGraphics();
  });
  on("camera", () => { void syncGraphics(); }, "change");
  on("orbit", () => { void syncGraphics(); }, "input");

  const updateEffects = () => {
    if (reduced()) pause();
    render();
    void syncGraphics();
  };
  on("effects", updateEffects, "change");
  motion.addEventListener("change", updateEffects);
  on("canvas", event => {
    event.preventDefault();
    failedGraphics = true;
    void syncGraphics();
  }, "webglcontextlost");
  on("canvas", () => {
    failedGraphics = false;
    void syncGraphics();
  }, "webglcontextrestored");
  if (browser.ResizeObserver) new browser.ResizeObserver(renderStudio).observe(get("viewport"));

  on("sound-enable", async () => {
    if (!studioOpen || secret()) return;
    if (soundEnabled || soundPending) {
      stopAudio();
      text("sound-status", "Sound is off.");
      return;
    }
    soundPending = true;
    const ticket = ++soundVersion;
    text("sound-enable", "Cancel sound activation");
    try {
      await audio.enable();
      if (ticket !== soundVersion) return;
      soundEnabled = true;
      get("sound-enable").setAttribute("aria-pressed", "true");
      text("sound-enable", "Disable sound");
      text("sound-status", checked("mute") ? "Master mute is on." : "Sound is enabled.");
      volume();
      cueLevel();
    } catch {
      if (ticket !== soundVersion) return;
      stopAudio();
      text("sound-status", "Sound could not start. The visual instruments remain active.");
    } finally {
      if (ticket === soundVersion) soundPending = false;
    }
  });

  on("mute", () => {
    if (checked("mute")) audio.stop();
    volume();
    text("sound-status", checked("mute") ? "Master mute is on." : soundEnabled ? "Sound is enabled." : "Sound is off.");
  }, "change");
  for (const id of ["tone", "pulse"]) {
    on(id, () => {
      audio.stop();
      if (id === "tone" && checked("tone")) cueLevel();
    }, "change");
  }
  on("volume", volume, "input");

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    volume();
    render();
    if (!document.hidden) void syncGraphics();
  });
  browser.addEventListener("pagehide", () => {
    pause();
    stopAudio();
    text("sound-status", "Sound is off.");
    releaseStudio();
  });
  browser.addEventListener("pageshow", () => {
    render();
    if (studioOpen) void syncGraphics();
  });

  const form = get("prediction");
  on("prediction", event => {
    event.preventDefault();
    const answer = form.querySelector('input[name="oh-opening"]:checked')?.value;
    if (!Object.hasOwn(OPENING_ANSWERS, answer)) return;
    text("prediction-result", OPENING_ANSWERS[answer]);
    hide("prediction-retry", false);
  }, "submit");
  on("prediction-retry", () => {
    form.reset();
    hide("prediction-retry", true);
    text("prediction-result", "");
    form.querySelector('input[name="oh-opening"]').focus();
  });

  for (const detail of root.querySelectorAll("details[data-oh-symbol]")) {
    detail.addEventListener("toggle", () => {
      if (detail.open) root.dataset.ohSymbol = detail.dataset.ohSymbol;
      else if (root.dataset.ohSymbol === detail.dataset.ohSymbol) delete root.dataset.ohSymbol;
    });
  }

  form.reset();
  set("mission", "free");
  set("camera", "overview");
  set("orbit", 0);
  set("phase-probe", 0);
  syncPreparation();
  render();
  for (const id of ["prepare", "clock", "view", "measure", "prediction", "studio", "sound", "mission"]) {
    disable(id + "-controls", false);
  }
  disable("enter", false);
  hide("static-note", true);
}

const root = document.querySelector(".site-main.oscillator-lesson");
if (root) initialize(root);