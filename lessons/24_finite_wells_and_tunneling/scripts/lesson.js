const WELL = { depth: Math.PI ** 2 / 16, width: 2, mass: 1 };
const BARRIER = { height: 3, width: 1, mass: 1, sigma: 3, momentum: 2 };
const REGIONS = ["left", "center", "right"];
const COUNT = 240;
const START = -15;
const EDGE = 95;
const ABSORB = 70;
const MARGIN = 5;
const DX = 0.05;
const DT = 0.01;
const LIMIT = 70;
const LOCK_TARGET = 0.01;
const MIN_BREACH_GAIN = 0.005;
const REFERENCES = { narrow: 0.5, wide: 1.5 };
const SVG = "http://www.w3.org/2000/svg";

const percentage = p => p > 0 && p < 0.00005 ? "<0.01%" : (100 * p).toFixed(2) + "%";
const number = (x, digits = 4) => x.toFixed(digits).replace("-", "−");
const parity = state => state.odd ? "Odd" : "Even";
const region = (x, edge) => x < -edge ? 0 : x >= edge ? 2 : 1;
const magnitude = (r, i) => r * r + i * i;

function boundSpectrum({ width, depth, mass }) {
  const a = width / 2;
  const z0 = a * Math.sqrt(2 * mass * depth);
  const states = [];

  for (let branch = 0; branch * Math.PI / 2 < z0; branch += 1) {
    const start = branch * Math.PI / 2;
    if (z0 - start <= 8 * Number.EPSILON * Math.max(1, z0)) break;

    // On each parity branch the matching condition is z = z0 cos(z − start).
    let lo = start;
    let hi = Math.min(z0, start + Math.PI / 2);
    for (let iteration = 0; iteration < 58; iteration += 1) {
      const mid = (lo + hi) / 2;
      if (mid > z0 * Math.cos(mid - start)) hi = mid;
      else lo = mid;
    }
    const z = (lo + hi) / 2;
    const q = z / a;
    const k = z0 * Math.sin(z - start) / a;
    if (k <= 0) continue;

    const odd = branch % 2 === 1;
    const sign = odd ? -1 : 1;
    const edge = odd ? Math.sin(z) : Math.cos(z);
    const interior = a + sign * Math.sin(2 * z) / (2 * q);
    const exterior = edge ** 2 / k;
    const amp = 1 / Math.sqrt(interior + exterior);
    states.push({
      n: branch + 1, odd, sign, a, q, k, edge, amp,
      energy: -(k ** 2) / (2 * mass),
      tail: exterior / (interior + exterior)
    });
  }
  return states;
}

function boundValue(state, x) {
  if (!state) return 0;
  if (Math.abs(x) <= state.a) {
    return state.amp * (state.odd ? Math.sin(state.q * x) : Math.cos(state.q * x));
  }
  const leftSign = x < 0 ? state.sign : 1;
  return leftSign * state.amp * state.edge * Math.exp(-state.k * (Math.abs(x) - state.a));
}

function boundDraw(state, random = Math.random) {
  const u = random();
  const tail = state.tail / 2;
  if (u < tail) return -state.a + Math.log(Math.max(u, Number.MIN_VALUE) / tail) / (2 * state.k);
  if (u > 1 - tail) return state.a - Math.log((1 - u) / tail) / (2 * state.k);

  const primitive = x => (x + state.sign * Math.sin(2 * state.q * x) / (2 * state.q)) / 2;
  const bottom = primitive(-state.a);
  let lo = -state.a;
  let hi = state.a;
  for (let iteration = 0; iteration < 42; iteration += 1) {
    const mid = (lo + hi) / 2;
    if (tail + state.amp ** 2 * (primitive(mid) - bottom) < u) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function newWell(setup = WELL) {
  return { setup: { ...setup }, states: boundSpectrum(setup), selected: 1, time: 0, samples: [] };
}

function newPacket(setup = BARRIER, dx = DX, dt = DT) {
  const size = Math.round(2 * EDGE / dx);
  const array = () => new Float64Array(size);
  const re = array(), im = array(), forwardR = array(), forwardI = array();
  const pivotR = array(), pivotI = array(), upperR = array(), upperI = array();
  const diagonal = array(), mask = array();
  const kinetic = 1 / (2 * setup.mass * dx * dx);
  const coupling = dt * kinetic / 2;
  const xAt = j => -EDGE + (j + 0.5) * dx;
  const halfCells = Math.round(setup.width / (2 * dx));
  const wall = halfCells * dx;
  const detector = wall + MARGIN;
  const interactionStart = Math.round((EDGE - detector) / dx);
  const interactionEnd = Math.round((EDGE + detector) / dx);
  let norm = 0;

  for (let j = 0; j < size; j += 1) {
    const x = xAt(j);
    const displacement = x - START;
    const amp = Math.exp(-(displacement ** 2) / (4 * setup.sigma ** 2));
    re[j] = amp * Math.cos(setup.momentum * displacement);
    im[j] = amp * Math.sin(setup.momentum * displacement);
    norm += magnitude(re[j], im[j]) * dx;
    const inBarrier = j >= size / 2 - halfCells && j < size / 2 + halfCells;
    diagonal[j] = dt / 2 * (2 * kinetic + (inBarrier ? setup.height : 0));
    const absorber = Math.max(0, (Math.abs(x) - ABSORB) / (EDGE - ABSORB));
    mask[j] = Math.exp(-6 * absorber ** 4 * dt);

    // Factor the fixed tridiagonal left side once. Both off-diagonals are −i·coupling.
    const pr = j ? 1 - coupling * upperI[j - 1] : 1;
    const pi = j ? diagonal[j] + coupling * upperR[j - 1] : diagonal[j];
    const divisor = magnitude(pr, pi);
    pivotR[j] = pr / divisor;
    pivotI[j] = -pi / divisor;
    upperR[j] = coupling * pivotI[j];
    upperI[j] = -coupling * pivotR[j];
  }

  const normalize = 1 / Math.sqrt(norm);
  for (let j = 0; j < size; j += 1) {
    re[j] *= normalize;
    im[j] *= normalize;
  }

  const packet = {
    setup: { ...setup }, re, im, size, xAt, dx, dt, wall, detector,
    steps: 0, samples: [], lossLeft: 0, lossRight: 0, history: [],

    stats() {
      const masses = [0, 0, 0];
      for (let j = 0; j < size; j += 1) {
        const bank = j < interactionStart ? 0 : j < interactionEnd ? 1 : 2;
        masses[bank] += magnitude(re[j], im[j]) * dx;
      }
      const surviving = masses[0] + masses[1] + masses[2];
      const reflected = masses[0] + this.lossLeft;
      const transmitted = masses[2] + this.lossRight;
      return {
        masses, surviving, reflected, transmitted,
        accounted: reflected + masses[1] + transmitted
      };
    },

    advance(count) {
      const stop = Math.min(Math.round(LIMIT / dt), this.steps + count);
      const checkEvery = Math.round(0.5 / dt);
      if (stop > this.steps) this.samples.length = 0;

      while (this.steps < stop) {
        for (let j = 0; j < size; j += 1) {
          const leftR = j ? re[j - 1] : 0;
          const rightR = j + 1 < size ? re[j + 1] : 0;
          const leftI = j ? im[j - 1] : 0;
          const rightI = j + 1 < size ? im[j + 1] : 0;
          const rhsR = re[j] + diagonal[j] * im[j]
            - coupling * (leftI + rightI + (j ? forwardI[j - 1] : 0));
          const rhsI = im[j] - diagonal[j] * re[j]
            + coupling * (leftR + rightR + (j ? forwardR[j - 1] : 0));
          forwardR[j] = rhsR * pivotR[j] - rhsI * pivotI[j];
          forwardI[j] = rhsR * pivotI[j] + rhsI * pivotR[j];
        }

        let nextR = 0;
        let nextI = 0;
        for (let j = size - 1; j >= 0; j -= 1) {
          const r = forwardR[j] - upperR[j] * nextR + upperI[j] * nextI;
          const i = forwardI[j] - upperR[j] * nextI - upperI[j] * nextR;
          re[j] = r * mask[j];
          im[j] = i * mask[j];
          if (mask[j] < 1) {
            const removed = (1 - mask[j] ** 2) * magnitude(r, i) * dx;
            if (j < size / 2) this.lossLeft += removed;
            else this.lossRight += removed;
          }
          nextR = r;
          nextI = i;
        }

        this.steps += 1;
        if (this.steps % checkEvery === 0) {
          this.history.push({ steps: this.steps, ...this.stats() });
          if (this.history.length > 5) this.history.shift();
        }
      }
    }
  };
  packet.initialRight = packet.stats().masses[2];
  return packet;
}

function outgoing(packet, stats = packet.stats()) {
  const time = packet.steps * packet.dt;
  const arrived = (Math.abs(START) + packet.wall + MARGIN + 2 * packet.setup.sigma)
    * packet.setup.mass / packet.setup.momentum;
  const history = packet.history;
  const plateau = history.length === 5 && history.every(item =>
    item.masses[1] < 0.01
    && Math.abs(stats.transmitted - item.transmitted) <= 0.001
    && Math.abs(stats.reflected - item.reflected) <= 0.001);
  return { ...stats, time, arrived, separated: time >= arrived && stats.masses[1] < 0.01 && plateau };
}

function packetDraws(packet, count, random = Math.random) {
  const sums = new Float64Array(packet.size);
  let total = 0;
  for (let j = 0; j < packet.size; j += 1) {
    total += magnitude(packet.re[j], packet.im[j]) * packet.dx;
    sums[j] = total;
  }
  if (total <= 1e-12) return [];

  return Array.from({ length: count }, () => {
    const target = random() * total;
    let lo = 0;
    let hi = packet.size - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (target < sums[mid]) hi = mid;
      else lo = mid + 1;
    }
    return packet.xAt(lo) + (random() - 0.5) * packet.dx;
  });
}

function tally(samples, edge) {
  const counts = [0, 0, 0];
  for (const x of samples) counts[region(x, edge)] += 1;
  return counts;
}

function plotStation(id, get, document, frame) {
  const { limit, low, high, half, detector, potential, energy, levels, values, samples, showAmplitude } = frame;
  const x = position => 340 + 276 * position / limit;
  const y = e => 135 - 105 * (e - low) / (high - low);
  const path = (name, data) => get(id + "-" + name).setAttribute("d", data);
  const label = (name, text) => { get(id + "-" + name).textContent = text; };
  const maxDensity = values.reduce((max, v) => Math.max(max, v[3]), 0);
  const densityScale = Math.max(0.05, Math.ceil(20 * maxDensity) / 20);
  const waveScale = Math.max(0.25, Math.ceil(4 * Math.sqrt(maxDensity)) / 4);
  const curve = (column, baseline, factor) => values.map((v, index) =>
    (index ? "L" : "M") + x(v[0]).toFixed(2) + " " + (baseline - v[column] * factor).toFixed(2)
  ).join("");

  path("edges", "M" + x(-detector) + " 30V302 M" + x(detector) + " 30V302");
  if (id === "b") {
    const plot = get("b-plot");
    for (const [side, start, end] of [["left", -EDGE, -ABSORB], ["right", ABSORB, EDGE]]) {
      let layer = get("b-absorber-" + side);
      if (!layer) {
        layer = document.createElementNS(SVG, "rect");
        layer.setAttribute("id", "fw-b-absorber-" + side);
        layer.setAttribute("y", "30");
        layer.setAttribute("height", "272");
        layer.setAttribute("fill", "#c19bff");
        layer.setAttribute("opacity", "0.14");
        plot.insertBefore(layer, get("b-edges"));
      }
      layer.toggleAttribute("hidden", limit < EDGE);
      if (limit >= EDGE) {
        layer.setAttribute("x", x(start));
        layer.setAttribute("width", x(end) - x(start));
      }
    }
  }

  path("potential", "M64 " + y(0) + "H" + x(-half) + "V" + y(potential)
    + "H" + x(half) + "V" + y(0) + "H616");
  path("energy-line", energy === null ? "" : "M" + (id === "w" ? x(-half) : 64)
    + " " + y(energy) + "H" + (id === "w" ? x(half) : 616));

  if (id === "w") {
    const lines = levels.filter(level => level !== energy).map(level => {
      const line = document.createElementNS(SVG, "line");
      const coords = { x1: x(-half), x2: x(half), y1: y(level), y2: y(level) };
      for (const [key, value] of Object.entries(coords)) line.setAttribute(key, value);
      return line;
    });
    get("w-level-lines").replaceChildren(...lines);
  }

  path("density", curve(3, 302, 78 / densityScale));
  for (const [key, column] of [["real", 1], ["imag", 2]]) {
    get(id + "-" + key).toggleAttribute("hidden", !showAmplitude);
    if (showAmplitude) path(key, curve(column, 178, 26 / waveScale));
  }
  get(id + "-marks").replaceChildren(...samples.slice(-24).filter(p => Math.abs(p) <= limit).map(p => {
    const dot = document.createElementNS(SVG, "circle");
    dot.setAttribute("cx", x(p));
    dot.setAttribute("cy", "300");
    dot.setAttribute("r", "2.7");
    return dot;
  }));
  label("e-top", number(high, 2));
  label("e-bottom", number(low, 2));
  label("amp-top", showAmplitude ? number(waveScale, 2) : "—");
  label("rho-top", number(densityScale, 2));
  label("x-left", number(-limit, limit % 1 ? 1 : 0));
  label("x-right", number(limit, limit % 1 ? 1 : 0));
}

function apparatus(THREE, canvas, viewport, browser) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1420);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 60);
  const box = (color, wireframe = false) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, wireframe }));
    scene.add(mesh);
    return mesh;
  };

  const floor = box(0x233643);
  floor.scale.set(14, 0.2, 4.8);
  floor.position.y = -1.6;
  for (const z of [-1.75, 1.75]) {
    const rail = box(0x4c6375);
    rail.scale.set(13.5, 0.07, 0.07);
    rail.position.set(0, -1.15, z);
  }
  const source = box(0xc19bff, true);
  source.scale.set(0.3, 1.2, 1.2);
  const wall = box(0xff9f55, true);
  const detectors = REGIONS.map((_, j) => {
    const bank = box(0x344454);
    bank.scale.set(0.46, 0.34, 0.35);
    bank.position.set((j - 1) * 4.6, -1.12, 1.35);
    return bank;
  });

  const capacity = 1400;
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(new Float32Array(3 * capacity), 3)
    .setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  const density = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x69e3d8 }));
  density.frustumCulled = false;
  scene.add(density);
  let size = "";

  return {
    render(frame, bank) {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(browser.devicePixelRatio || 1, 1.5, 1500 / Math.max(width, height));
      const tag = width + ":" + height + ":" + scale;
      if (size !== tag) {
        renderer.setPixelRatio(scale);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        size = tag;
      }

      const scaleX = 6 / frame.limit;
      const zoom = Math.max(1, 1.65 / camera.aspect);
      camera.position.set(-7 * zoom, 3.9 * zoom, 10 * zoom);
      camera.lookAt(0, -0.3, 0);
      source.visible = frame.station === "barrier";
      source.position.set(START * scaleX, -0.62, 0);
      wall.visible = frame.potential !== 0;
      const heightScale = 1.5 / Math.max(Math.abs(frame.low), frame.high, 0.5);
      const h = Math.abs(frame.potential) * heightScale;
      wall.scale.set(2 * frame.half * scaleX, h, 1.4);
      wall.position.y = Math.sign(frame.potential) * h / 2;
      detectors.forEach((detector, index) => detector.material.color.setHex(bank === index ? 0xff9f55 : 0x344454));

      const max = frame.values.reduce((result, v) => Math.max(result, v[3]), 0.015);
      const points = Math.min(capacity, frame.values.length);
      for (let index = 0; index < points; index += 1) {
        const v = frame.values[Math.round(index * (frame.values.length - 1) / Math.max(1, points - 1))];
        attribute.setXYZ(index, v[0] * scaleX, -0.9 + 1.65 * v[3] / max, 0.9);
      }
      geometry.setDrawRange(0, points);
      attribute.needsUpdate = true;
      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse(node => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      renderer.dispose();
    }
  };
}

function wellFrame(lab, state, expanded, amplitudes) {
  const a = lab.setup.width / 2;
  const limit = expanded && state
    ? Math.min(1e6, Math.max(10, Math.ceil(a + 4 / state.k)))
    : Math.max(5, 2 * a);
  const phase = state ? -state.energy * lab.time : 0;
  const cosine = Math.cos(phase);
  const sine = Math.sin(phase);
  const values = [];

  // Keep the interior resolved even when the exterior spans many decay lengths.
  for (const [start, end, count] of [[-limit, -a, 128], [-a, a, 256], [a, limit, 128]]) {
    for (let j = 0; j < count; j += 1) {
      const x = start + (end - start) * j / count;
      const value = boundValue(state, x);
      values.push([x, value * cosine, value * sine, value ** 2]);
    }
  }
  const edge = boundValue(state, limit);
  values.push([limit, edge * cosine, edge * sine, edge ** 2]);

  return {
    station: "well", limit, low: -Math.ceil(10 * lab.setup.depth) / 10,
    high: Math.max(0.2, 0.12 * lab.setup.depth),
    half: a, detector: a, potential: -lab.setup.depth, energy: state?.energy ?? null,
    levels: lab.states.map(level => level.energy), values, samples: lab.samples, showAmplitude: amplitudes
  };
}

function barrierFrame(packet, expanded, amplitudes) {
  const { re, im, dx, size, setup } = packet;
  const limit = expanded ? EDGE : 40;
  const start = Math.max(0, Math.round((EDGE - limit) / dx));
  const end = Math.min(size, Math.round((EDGE + limit) / dx));
  const stride = Math.max(1, Math.floor((end - start) / 950));
  const values = [];
  for (let j = start; j < end; j += stride) {
    const endBin = Math.min(end, j + stride);
    let density = 0;
    for (let k = j; k < endBin; k += 1) density += magnitude(re[k], im[k]);
    const mid = j + Math.floor((endBin - j) / 2);
    values.push([packet.xAt(mid), re[mid], im[mid], density / (endBin - j)]);
  }
  const energy = setup.momentum ** 2 / (2 * setup.mass);
  return {
    station: "barrier", limit, low: 0, high: Math.max(1, Math.ceil(Math.max(energy, setup.height) + 0.25)),
    half: packet.wall, detector: packet.detector, potential: setup.height, energy,
    values, samples: packet.samples, showAmplitude: amplitudes
  };
}

const MISSIONS = {
  containment: [
    "well",
    "Containment 101. Commit a prediction for the selected bound state, then compare its two snapshots.",
    "Inspect whether the probability changes even when the amplitude changes phase."
  ],
  thinner: [
    "barrier",
    "Thinner Walls. Run the preset, save the separated baseline, then reduce the barrier width.",
    "The packet, mass, and height stay fixed. Compare the outgoing estimates after the separation check passes."
  ],
  lock: [
    "barrier",
    "Lock It Down. Choose a barrier with at most 1.00% transmission, even if all residual interaction mass reaches the right lead.",
    "Try height 5 E₀ and width 2 L₀ with the preset packet. Then sample repeated batches at the separated snapshot."
  ],
  count: [
    "well",
    "Count the States. With m = m₀ and 2a = 2L₀, predict the number of bound states after raising the depth from π²/16 to 2 E₀.",
    "The physical branches start at z = 0, π/2, π, … and require their starting point to be below z₀."
  ],
  mystery: [
    "barrier",
    "The Mystery Barrier. Compare a narrow reference (0.5 L₀), a wide reference (1.5 L₀), and the hidden barrier.",
    "The height, mass, and incident packet use the preset for all three runs. Record each separated result, then match the hidden one."
  ]
};

const ANSWERS = {
  escape: "A single outside detection shows where that copy was found. Compare the density at two times and check for a current through the well edge.",
  tail: "Correct. The stationary state gives the same outside probability at both times and has zero net current through the well edge.",
  never: "A finite boundary allows a decaying exterior amplitude. The Born rule gives that exterior region a positive detection probability."
};

function initialize(root) {
  const document = root.ownerDocument;
  const browser = document.defaultView;
  const get = id => root.querySelector("#fw-" + id);
  const text = (id, value) => {
    const node = get(id);
    if (node.textContent !== value) node.textContent = value;
  };
  const hide = (id, state) => { get(id).hidden = state; };
  const disable = (id, state) => { get(id).disabled = state; };
  const on = (id, action, type = "click") => get(id).addEventListener(type, action);
  const input = id => get(id).value;
  const checked = id => get(id).checked;
  const set = (id, value) => { get(id).value = String(value); };
  const motion = browser.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motion.matches || checked("effects");
  const missionPanes = [...root.querySelectorAll("[data-mission]")];

  let station = "well";
  let freeStation = "well";
  let freeWell = newWell();
  let freePacket = null;
  let mission = null;
  let inFacility = false;
  let frame = null;
  let previous = null;
  let balance = 0;
  let paintTime = -Infinity;
  let animation = null;
  let canvasView = null;
  let importToken = 0;
  let pendingImport = false;
  let failedGraphics = false;

  const kind = () => mission?.key;
  const well = () => mission?.well ?? freeWell;
  const packet = () => mission?.packet ?? (freePacket ??= newPacket());
  const selected = lab => lab.states.find(state => state.n === lab.selected);
  const countHidden = () => kind() === "count" && !mission.revealed;
  const mysteryHidden = () => kind() === "mystery" && !mission.revealed
    && (!mission.run || mission.run === "hidden");
  const containmentPending = () => kind() === "containment" && !mission.committed;

  function stop() {
    if (animation !== null) browser.cancelAnimationFrame(animation);
    animation = null;
    previous = null;
    balance = 0;
  }

  function setStation(value) {
    if (value !== "well" && value !== "barrier") return;
    stop();
    station = value;
    set("station", value);
    sync();
  }

  function syncWell() {
    const lab = well();
    for (const key of Object.keys(WELL)) set("w-" + key, lab.setup[key]);
    const empty = new browser.Option("Choose a bound state", "");
    const options = countHidden() ? [] : lab.states.map(state =>
      new browser.Option(state.n + " · " + parity(state), state.n));
    get("w-state").replaceChildren(empty, ...options);
    set("w-state", countHidden() ? "" : lab.selected ?? "");
    disable("w-prepare", kind() === "count" || (kind() === "containment" && mission.committed));
  }

  function syncPacket() {
    const sim = packet();
    const secret = mysteryHidden();
    for (const key of Object.keys(BARRIER)) {
      set("b-" + key, secret ? "" : sim.setup[key]);
      disable("b-" + key, kind() === "thinner" && (key !== "width" || !mission.baseline));
    }
    hide("b-prepare", secret);
    disable("b-prepare", kind() === "mystery");
    disable("b-preset", kind() === "thinner");
  }

  function sync() {
    hide("well", station !== "well");
    hide("barrier", station !== "barrier");
    for (const pane of missionPanes) pane.hidden = pane.dataset.mission !== kind();
    disable("mission-exit", !mission);
    disable("mission-retry", !mission);
    if (station === "well") syncWell();
    else syncPacket();
    render();
    void syncGraphics();
  }

  function table(id, masses, samples, edge, norm = null) {
    const counts = tally(samples, edge);
    REGIONS.forEach((bank, index) => {
      text(id + "-" + bank + "-p", masses ? percentage(masses[index]) : "—");
      text(id + "-" + bank + "-n", String(counts[index]));
      if (id === "b") text("b-" + bank + "-c", norm > 1e-12 ? percentage(masses[index] / norm) : "—");
    });
    const sample = samples.at(-1);
    const outsideView = sample !== undefined && Math.abs(sample) > frame.limit;
    text(id + "-sample-report", samples.length + (sample === undefined
      ? " detections. No position measured yet."
      : " detections. Latest at x = " + number(sample) + " L₀" + (outsideView ? " (beyond this view)." : ".")));
  }

  function renderWell() {
    const lab = well();
    const state = selected(lab);
    const suppressed = countHidden() || containmentPending();
    hide("w-data", suppressed);
    hide("predict", kind() === "containment" || kind() === "count");
    disable("w-clock", !state);
    disable("w-measure", !state);
    disable("w-clear", lab.samples.length === 0);
    disable("containment-commit", kind() !== "containment" || mission.committed || !state);
    disable("containment-compare", kind() !== "containment" || !mission.committed);
    disable("count-commit", kind() !== "count" || mission.revealed);
    if (suppressed) return null;

    const values = wellFrame(lab, state, checked("w-expand"), checked("w-amplitudes"));
    plotStation("w", get, document, values);
    text("w-time", number(lab.time, 2) + " t₀");
    text("w-parity", state ? parity(state) : "—");
    text("w-energy", state ? number(state.energy, 5) + " E₀" : "—");
    text("w-decay", state ? number(1 / state.k, 5) + " L₀" : "—");
    text("w-inside", state ? percentage(1 - state.tail) : "—");
    text("w-outside", state ? percentage(state.tail) : "—");
    text("w-floor", state ? number(state.energy + lab.setup.depth, 5) + " E₀" : "—");
    text("w-infinite", state
      ? number((state.n * Math.PI / lab.setup.width) ** 2 / (2 * lab.setup.mass), 5) + " E₀"
      : "—");
    const omitted = state ? state.tail * Math.exp(-2 * state.k * (values.limit - state.a)) : 0;
    text("w-omitted", state ? "Outside this view: " + (omitted * 100).toPrecision(3)
      + "% of total probability. The detectors include the full tails."
      : "Choose a surviving state to plot its wavefunction and tails.");
    text("w-desc", "Well width " + number(lab.setup.width, 2) + " L₀ and depth " + number(lab.setup.depth, 4)
      + " E₀. " + (state ? parity(state) + " state at " + number(state.energy, 5)
        + " E₀. Total exterior probability " + percentage(state.tail) + " at both times." : "No level is selected."));
    get("w-ladder").replaceChildren(...lab.states.map(level => {
      const row = document.createElement("tr");
      row.toggleAttribute("data-selected", level.n === lab.selected);
      for (const [index, value] of [level.n, parity(level), number(level.energy, 5)].entries()) {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
    return values;
  }

  function renderPacket() {
    const sim = packet();
    const result = outgoing(sim);
    const secret = mysteryHidden();
    const ready = !(kind() === "mystery" && !mission.run);
    const finished = result.time >= LIMIT;
    const recorded = kind() === "mystery" && !mission.revealed && Object.hasOwn(mission.results, mission.run);

    hide("b-data", secret);
    disable("b-play", !ready || animation !== null || finished || recorded);
    disable("b-step", !ready || animation !== null || finished || recorded);
    disable("b-pause", animation === null);
    disable("b-restart", !ready);
    disable("b-measure", secret || result.surviving <= 1e-12);
    disable("b-clear", !sim.samples.length);
    disable("thinner-save", kind() !== "thinner" || Boolean(mission.baseline) || !result.separated);
    disable("thinner-check", kind() !== "thinner" || !mission.baseline || !result.separated);
    disable("lock-check", kind() !== "lock" || !result.separated);
    disable("lock-repeat", kind() !== "lock" || !mission.lockRuns || mission.lockStep !== sim.steps || !result.separated);
    disable("mystery-capture", kind() !== "mystery" || !mission.run || mission.revealed || recorded || !result.separated);
    disable("mystery-commit", kind() !== "mystery" || mission.revealed || Object.keys(mission.results).length !== 3);
    for (const key of ["narrow", "wide", "hidden"]) {
      disable("mystery-" + key, kind() !== "mystery" || mission.revealed);
    }

    text("b-clock-note", (finished ? "Time limit reached."
      : animation !== null ? "Evolving."
      : reduced() ? "Paused. Launch / Play advances one still step." : "Paused.")
      + " t = " + number(result.time, 2) + " t₀. Step advances 50 fixed time steps.");
    if (kind() === "mystery") {
      text("mystery-progress", !ready ? "Choose a reference or the hidden preparation."
        : recorded ? "Recorded. Select another preparation or commit your prediction when all three are recorded."
        : result.separated ? "Separation check passed. Record the result."
        : "Advance the current run until separation passes.");
    }
    if (secret) return null;

    const values = barrierFrame(sim, checked("b-expand"), checked("b-amplitudes"));
    plotStation("b", get, document, values);
    const mean = (sim.setup.momentum ** 2 + 1 / (4 * sim.setup.sigma ** 2)) / (2 * sim.setup.mass);
    const relation = values.energy < values.potential ? " < " : values.energy > values.potential ? " > " : " = ";
    text("b-time", number(result.time, 2) + " t₀");
    text("b-kinetic", number(values.energy) + relation + number(values.potential) + " E₀");
    text("b-spread", number(1 / (2 * sim.setup.sigma)) + " ℏ/L₀");
    text("b-mean", number(mean) + " E₀");
    text("b-norm", percentage(result.surviving));
    text("b-total", percentage(result.accounted));
    text("b-lost-left", percentage(sim.lossLeft));
    text("b-lost-right", percentage(sim.lossRight));
    text("b-phase", result.separated ? "Outgoing components separated."
      : result.time < (Math.abs(START) - sim.detector) * sim.setup.mass / sim.setup.momentum
        ? "Incident packet approaching. Left-region mass includes the incoming packet."
        : "Interaction or separation under way. Regional masses are provisional.");
    const residual = "Residual interaction mass " + percentage(result.masses[1]) + ".";
    text("b-estimates", result.separated
      ? "Reflection estimate " + percentage(result.reflected) + ". Transmission estimate "
        + percentage(result.transmitted) + ". " + residual
        + (result.transmitted <= sim.initialRight + 1e-7 ? " Right-side signal is at the initial-tail or numerical scale." : "")
      : residual + " Separation requires arrival, less than 1% interaction mass, and outgoing mass changes within 0.10 percentage points over 2 t₀.");
    text("b-normalization", "The ledger uses the original preparation. Position samples are conditioned on survival, with N = "
      + percentage(result.surviving) + " as the denominator.");
    text("b-desc", "Barrier width " + number(2 * sim.wall, 2) + " L₀ and height " + number(sim.setup.height, 2)
      + " E₀. Current probability masses are left " + percentage(result.masses[0]) + ", interaction "
      + percentage(result.masses[1]) + ", right " + percentage(result.masses[2]) + ".");
    text("b-omitted", (checked("b-expand") ? "Full grid with absorbing layers at |x| ≥ 70 L₀."
      : "Close view spans −40 to 40 L₀. Expand to see the absorbing region.")
      + " The interaction boundary is at |x| = " + number(sim.detector, 2) + " L₀.");
    return values;
  }

  function gallery() {
    const latest = frame?.samples.at(-1);
    const bank = latest === undefined ? -1 : region(latest, frame.detector);
    REGIONS.forEach((name, index) => get("light-" + name).toggleAttribute("data-active", index === bank));
    let report = "Awaiting a position sample.";
    if (latest !== undefined) {
      const at = " x = " + number(latest) + " L₀.";
      if (station === "well") {
        report = bank === 1 ? "Well interior detection at" + at
          : "Bound-state exterior detection at" + at + " Stationary density gives the tail a positive probability.";
      } else {
        const sim = packet();
        const result = outgoing(sim);
        report = bank === 2 && result.separated && result.transmitted > sim.initialRight + 1e-7
          ? "Outgoing right-side sample at" + at
          : "Position sample in the " + ["left", "interaction", "right"][bank] + " region at" + at;
      }
    }
    text("gallery-report", frame ? report : "Detector gallery concealed for the current prediction or mystery run.");
    return bank;
  }

  function render() {
    root.toggleAttribute("data-fw-reduced", reduced());
    frame = station === "well" ? renderWell() : renderPacket();
    if (frame) {
      if (station === "well") {
        const lab = well();
        const state = selected(lab);
        table("w", state ? [state.tail / 2, 1 - state.tail, state.tail / 2] : null, lab.samples, frame.detector);
      } else {
        const sim = packet();
        const stats = sim.stats();
        table("b", stats.masses, sim.samples, frame.detector, stats.surviving);
      }
    }
    const bank = gallery();
    hide("viewport", !canvasView || !frame || !wantsGraphics());
    drawScene(bank);
  }

  function wantsGraphics() {
    return inFacility && input("camera") === "inside" && !reduced() && Boolean(frame);
  }

  function releaseGraphics() {
    importToken += 1;
    pendingImport = false;
    canvasView?.dispose();
    canvasView = null;
    hide("viewport", true);
  }

  function drawScene(bank) {
    if (!canvasView || !wantsGraphics() || document.hidden) return;
    try {
      canvasView.render(frame, bank);
    } catch {
      failedGraphics = true;
      releaseGraphics();
      text("renderer", "Graphics unavailable. The calibrated plots and detector gallery remain active.");
    }
  }

  async function syncGraphics() {
    if (!wantsGraphics() || failedGraphics) {
      releaseGraphics();
      text("renderer", !frame ? "Apparatus concealed until the experiment allows a reveal."
        : failedGraphics ? "Graphics unavailable. The calibrated plots and detector gallery remain active."
        : reduced() ? "Reduced effects. Use the calibrated plots and detector gallery."
        : "Cross-section uses the calibrated station plots below.");
      return;
    }
    if (document.hidden || canvasView || pendingImport) return;
    pendingImport = true;
    const ticket = ++importToken;
    text("renderer", "Loading the apparatus view. The calibrated plots remain active.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (ticket !== importToken || !wantsGraphics()) return;
      canvasView = apparatus(THREE, get("canvas"), get("viewport"), browser);
      text("renderer", "Inside the apparatus. The calibrated scales are on the station plots.");
      render();
    } catch {
      if (ticket !== importToken) return;
      failedGraphics = true;
      releaseGraphics();
      text("renderer", "Graphics unavailable. The calibrated plots and detector gallery remain active.");
    } finally {
      if (ticket === importToken) pendingImport = false;
    }
  }

  function snapshot(time) {
    const lab = well();
    if (!selected(lab)) return;
    if (lab.time !== time) lab.samples.length = 0;
    lab.time = time;
    render();
    text("w-status", "Snapshot at " + number(time, 2) + " t₀. Exterior probability "
      + percentage(selected(lab).tail) + ". Probability current is zero.");
  }

  function sampleWell(count) {
    const lab = well();
    const state = selected(lab);
    if (!state || countHidden() || containmentPending()) return [];
    const draws = Array.from({ length: count }, () => boundDraw(state));
    lab.samples.push(...draws);
    render();
    const counts = tally(draws, state.a);
    text("w-status", count + " sampled at t = " + number(lab.time, 2) + " t₀. "
      + (counts[0] + counts[2]) + " outside the well.");
    return counts;
  }

  function samplePacket(count, announce = true) {
    const sim = packet();
    if (mysteryHidden()) return [];
    stop();
    const draws = packetDraws(sim, count);
    sim.samples.push(...draws);
    render();
    const counts = tally(draws, sim.detector);
    if (announce) text("b-status", draws.length + " samples from surviving copies at t = "
      + number(sim.steps * sim.dt, 2) + " t₀. " + counts[2] + " in the right region.");
    return counts;
  }

  function replacePacket(setup, message) {
    stop();
    const next = newPacket(setup);
    if (mission?.packet) mission.packet = next;
    else freePacket = next;
    if (kind() === "lock") {
      mission.lockRuns = 0;
      text("lock-record", "No detector batches recorded for this run.");
    }
    if (kind() === "mystery" && mission.run && !mission.revealed) {
      delete mission.results[mission.run];
      text("mystery-" + mission.run + "-result", "—");
    }
    text("b-status", message);
    sync();
  }

  function validNumber(id) {
    const control = get(id);
    return control.value && control.validity.valid && Number.isFinite(control.valueAsNumber);
  }

  function editWell(key) {
    if (kind() === "count" || (kind() === "containment" && mission.committed)) return;
    const lab = well();
    const id = "w-" + key;
    if (!validNumber(id)) {
      set(id, lab.setup[key]);
      text("w-status", "Enter a value within the control’s supported range.");
      return;
    }
    const value = get(id).valueAsNumber;
    if (lab.setup[key] === value) return;
    const old = selected(lab);
    lab.setup[key] = value;
    lab.states = boundSpectrum(lab.setup);
    const survives = old && lab.states.some(state => state.n === old.n && state.odd === old.odd);
    lab.selected = survives ? old.n : null;
    lab.time = 0;
    lab.samples = [];
    sync();
    text("w-status", old && !survives
      ? "The selected level reached the continuum and disappeared. Choose a surviving bound state before measuring."
      : "New static well prepared at t = 0. Previous samples cleared.");
  }

  function editPacket(key) {
    const sim = packet();
    const id = "b-" + key;
    if (kind() === "mystery" || (kind() === "thinner" && (key !== "width" || !mission.baseline))) return;
    if (!validNumber(id)) {
      set(id, sim.setup[key]);
      text("b-status", "Enter a value within the control’s supported range and step.");
      return;
    }
    const value = get(id).valueAsNumber;
    if (sim.setup[key] !== value) replacePacket({ ...sim.setup, [key]: value }, "Fresh packet prepared at t = 0.");
  }

  function stepPacket() {
    stop();
    packet().advance(50);
    render();
  }

  function tick(now) {
    if (previous !== null) balance += Math.min(50, now - previous) * (checked("b-slow") ? 0.13 : 0.55);
    previous = now;
    const steps = Math.min(70, Math.floor(balance));
    balance -= steps;
    const sim = packet();
    if (steps) sim.advance(steps);
    if (sim.steps * sim.dt >= LIMIT) {
      stop();
      render();
      text("b-status", "Run stopped at the time limit. The ledger shows whether separation passed.");
      return;
    }
    animation = browser.requestAnimationFrame(tick);
    if (now - paintTime >= 50) {
      paintTime = now;
      render();
    }
  }

  function playPacket() {
    if (animation !== null || (kind() === "mystery" && !mission.run)) return;
    if (reduced()) {
      stepPacket();
    } else {
      text("b-status", "");
      animation = browser.requestAnimationFrame(tick);
      render();
    }
  }

  function loadMission(key) {
    if (key !== "free" && !Object.hasOwn(MISSIONS, key)) return;
    stop();
    if (!mission) freeStation = station;
    if (key === "free") {
      mission = null;
      set("mission-select", "free");
      text("mission-goal", "Free exploration is active.");
      text("mission-hint", "");
      text("mission-feedback", "Free exploration restored.");
      disable("station", false);
      setStation(freeStation);
      return;
    }

    const [place, goal, hint] = MISSIONS[key];
    mission = { key, revealed: false, committed: false };
    if (place === "well") mission.well = newWell(key === "count" ? { ...WELL, depth: 2 } : WELL);
    else mission.packet = newPacket();
    if (key === "mystery") {
      mission.secret = Math.random() < 0.5 ? "narrow" : "wide";
      mission.results = {};
      for (const name of ["narrow", "wide", "hidden"]) text("mystery-" + name + "-result", "—");
    }
    for (const id of ["containment-answer", "count-answer", "mystery-answer"]) set(id, "");
    text("thinner-record", "No baseline saved.");
    text("lock-record", "No detector batches recorded.");
    text("mission-goal", goal);
    text("mission-hint", hint);
    text("mission-feedback", "");
    text("w-status", "");
    text("b-status", "");
    set("mission-select", key);
    disable("station", true);
    setStation(place);
  }

  on("mission-load", () => loadMission(input("mission-select")));
  on("mission-retry", () => { if (mission) loadMission(mission.key); });
  on("mission-exit", () => loadMission("free"));

  on("containment-commit", () => {
    if (kind() !== "containment" || mission.committed || !selected(well())) return;
    const answer = input("containment-answer");
    if (answer !== "yes" && answer !== "no") {
      text("mission-feedback", "Choose a prediction first.");
      return;
    }
    mission.committed = true;
    const lab = well();
    const state = selected(lab);
    lab.time = 0;
    lab.samples.length = 0;
    const counts = sampleWell(COUNT);
    mission.outsideCount = counts[0] + counts[2];
    text("mission-feedback", (answer === "yes" ? "Correct. " : "The exterior density stays positive beyond the edge. ")
      + "Theory gives " + percentage(state.tail) + " outside. The t = 0 batch found " + mission.outsideCount
      + " outside out of " + COUNT + ". Compare it with a fresh batch at t = 4t₀.");
    sync();
    get("containment-compare").focus();
  });

  on("containment-compare", () => {
    if (kind() !== "containment" || !mission.committed) return;
    const lab = well();
    lab.time = 4;
    lab.samples.length = 0;
    const counts = sampleWell(COUNT);
    text("mission-feedback", "Outside counts: " + mission.outsideCount + "/" + COUNT + " at t = 0 and "
      + (counts[0] + counts[2]) + "/" + COUNT + " at t = 4t₀. The theory is "
      + percentage(selected(lab).tail) + " at both times. Independent samples fluctuate, while the phase cancels in the density.");
  });

  on("thinner-save", () => {
    if (kind() !== "thinner" || mission.baseline) return;
    const sim = packet();
    const result = outgoing(sim);
    if (!result.separated) return;
    stop();
    mission.baseline = { ...result, width: sim.setup.width };
    text("thinner-record", "Baseline width " + number(sim.setup.width, 2) + " L₀. Transmission estimate "
      + percentage(result.transmitted) + ". Interaction residual " + percentage(result.masses[1]) + ".");
    text("mission-feedback", "Baseline committed. Decrease the width, then launch the fresh preparation.");
    sync();
    get("b-width").focus();
  });

  on("thinner-check", () => {
    if (kind() !== "thinner" || !mission.baseline) return;
    const sim = packet();
    const result = outgoing(sim);
    if (!result.separated) return;
    stop();
    const baseline = mission.baseline;
    const thinner = sim.setup.width < baseline.width;
    const gain = result.transmitted - baseline.transmitted;
    const resolved = gain > MIN_BREACH_GAIN + baseline.masses[1];
    render();
    text("mission-feedback", (thinner && resolved ? "Resolved increase. "
      : thinner ? "The estimated increase is within the comparison allowance. " : "Choose a width below the baseline. ")
      + "Baseline " + percentage(baseline.transmitted) + ", current " + percentage(result.transmitted)
      + ". Change " + number(100 * gain, 2) + " percentage points. The comparison allowance includes the baseline residual and a 0.50 percentage-point margin.");
  });

  function lockTrial(repeat) {
    if (kind() !== "lock" || (repeat && !mission.lockRuns)) return;
    const sim = packet();
    const result = outgoing(sim);
    if (!result.separated || (repeat && mission.lockStep !== sim.steps)) return;
    if (mission.lockStep !== sim.steps) mission.lockRuns = 0;
    mission.lockStep = sim.steps;
    const upper = result.transmitted + result.masses[1];
    const counts = samplePacket(COUNT, false);
    if (counts.length === 0) return;
    mission.lockRuns = (mission.lockRuns || 0) + 1;
    text("lock-record", "Batch " + mission.lockRuns + " used " + COUNT + " fresh surviving copies. "
      + counts[2] + " right-side positions in this batch.");
    text("mission-feedback", (upper <= LOCK_TARGET ? "Target reached. " : "Adjust the barrier and try again. ")
      + "Transmission estimate " + percentage(result.transmitted) + ". Including all interaction mass gives "
      + percentage(upper) + ". Zero right-side positions in a finite batch can occur with positive probability.");
    render();
  }

  on("lock-check", () => lockTrial(false));
  on("lock-repeat", () => lockTrial(true));

  on("count-commit", () => {
    if (kind() !== "count" || mission.revealed) return;
    const guess = get("count-answer").valueAsNumber;
    if (!validNumber("count-answer") || !Number.isInteger(guess)) {
      text("mission-feedback", "Enter a whole number before revealing the ladder.");
      return;
    }
    mission.revealed = true;
    const levelCount = well().states.length;
    text("mission-feedback", (guess === levelCount ? "Correct. " : "Compare with the revealed ladder. ")
      + "The deeper well supports " + levelCount + " states. z₀ increases to 2, above π/2, so the odd branch gains a bound solution below E = 0. At the threshold itself its tail cannot be normalized.");
    sync();
    get("mission-retry").focus();
  });

  for (const name of ["narrow", "wide", "hidden"]) {
    on("mystery-" + name, () => {
      if (kind() !== "mystery" || mission.revealed) return;
      mission.run = name;
      const width = REFERENCES[name === "hidden" ? mission.secret : name];
      replacePacket({ ...BARRIER, width }, "Controlled preparation ready at t = 0.");
      text("mission-feedback", "Preparation ready. Advance the packet, then record the separated result.");
      get("b-play").focus();
    });
  }

  on("mystery-capture", () => {
    if (kind() !== "mystery" || mission.revealed || !mission.run) return;
    const sim = packet();
    const result = outgoing(sim);
    if (!result.separated) return;
    stop();
    mission.results[mission.run] = result.transmitted;
    if (mission.run === "hidden") mission.hiddenPacket = sim;
    text("mystery-" + mission.run + "-result", percentage(result.transmitted));
    text("mission-feedback", "Separated result recorded. Compare all three preparations.");
    render();
  });

  on("mystery-commit", () => {
    if (kind() !== "mystery" || mission.revealed || Object.keys(mission.results).length !== 3) return;
    const guess = input("mystery-answer");
    if (guess !== "narrow" && guess !== "wide") {
      text("mission-feedback", "Choose the reference that matches the hidden result.");
      return;
    }
    stop();
    mission.revealed = true;
    mission.packet = mission.hiddenPacket;
    text("mission-feedback", (guess === mission.secret ? "Correct. " : "Compare the three estimates. ")
      + "The hidden width was " + number(REFERENCES[mission.secret], 2)
      + " L₀. With the same incident packet and height, the thicker barrier gave the lower transmission.");
    sync();
    get("mission-retry").focus();
  });

  on("station", () => setStation(input("station")), "change");
  on("enter", () => {
    inFacility = true;
    hide("facility", false);
    hide("enter", true);
    get("enter").setAttribute("aria-expanded", "true");
    get("facility-title").focus();
    void syncGraphics();
  });
  on("return", () => {
    inFacility = false;
    hide("facility", true);
    hide("enter", false);
    get("enter").setAttribute("aria-expanded", "false");
    releaseGraphics();
    get("enter").focus();
  });
  on("camera", () => { void syncGraphics(); }, "change");
  on("camera-reset", () => {
    set("camera", "section");
    void syncGraphics();
  });

  const effectsChanged = () => {
    if (reduced()) stop();
    render();
    void syncGraphics();
  };
  on("effects", effectsChanged, "change");
  motion.addEventListener("change", effectsChanged);
  on("canvas", event => {
    event.preventDefault();
    failedGraphics = true;
    releaseGraphics();
    void syncGraphics();
  }, "webglcontextlost");
  on("canvas", () => {
    failedGraphics = false;
    void syncGraphics();
  }, "webglcontextrestored");
  if (browser.ResizeObserver) {
    new browser.ResizeObserver(() => drawScene(gallery())).observe(get("viewport"));
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else void syncGraphics();
    render();
  });
  browser.addEventListener("pagehide", () => {
    stop();
    releaseGraphics();
  });
  browser.addEventListener("pageshow", () => { void syncGraphics(); });

  const quiz = get("predict");
  on("predict", event => {
    event.preventDefault();
    const answer = quiz.querySelector('input[name="fw-opening"]:checked')?.value;
    if (!Object.hasOwn(ANSWERS, answer)) return;
    text("predict-result", ANSWERS[answer]);
    hide("predict-retry", false);
  }, "submit");
  on("predict-retry", () => {
    quiz.reset();
    text("predict-result", "");
    hide("predict-retry", true);
    quiz.querySelector('input[name="fw-opening"]').focus();
  });

  for (const key of Object.keys(WELL)) on("w-" + key, () => editWell(key), "change");
  on("w-state", () => {
    if (kind() === "count" || (kind() === "containment" && mission.committed)) return;
    const lab = well();
    const choice = Number(input("w-state"));
    lab.selected = lab.states.some(state => state.n === choice) ? choice : null;
    lab.time = 0;
    lab.samples.length = 0;
    render();
    text("w-status", lab.selected
      ? "Selected state prepared at t = 0. Samples cleared."
      : "Choose a bound state to measure.");
  }, "change");
  on("w-preset", () => {
    if (kind() === "count" || (kind() === "containment" && mission.committed)) return;
    if (mission?.well) mission.well = newWell();
    else freeWell = newWell();
    sync();
    text("w-status", "Well preset restored.");
  });
  on("w-zero", () => snapshot(0));
  on("w-later", () => snapshot(4));
  on("w-single", () => sampleWell(1));
  on("w-batch", () => sampleWell(COUNT));
  on("w-clear", () => {
    well().samples.length = 0;
    render();
    text("w-status", "Detections cleared.");
  });

  for (const key of Object.keys(BARRIER)) on("b-" + key, () => editPacket(key), "change");
  on("b-preset", () => {
    if (kind() !== "thinner" && kind() !== "mystery") replacePacket(BARRIER, "Barrier preset restored.");
  });
  on("b-restart", () => replacePacket(packet().setup, "Preparation restarted at t = 0."));
  on("b-play", playPacket);
  on("b-pause", () => {
    stop();
    render();
    text("b-status", "Packet paused.");
  });
  on("b-step", stepPacket);
  on("b-single", () => samplePacket(1));
  on("b-batch", () => samplePacket(COUNT));
  on("b-clear", () => {
    packet().samples.length = 0;
    render();
    text("b-status", "Detections cleared.");
  });
  for (const id of ["w-expand", "w-amplitudes", "b-expand", "b-amplitudes"]) on(id, render, "change");
  for (const detail of root.querySelectorAll("[data-fw-symbol]")) {
    detail.addEventListener("toggle", () => {
      if (detail.open) root.dataset.fwSymbol = detail.dataset.fwSymbol;
      else if (root.dataset.fwSymbol === detail.dataset.fwSymbol) delete root.dataset.fwSymbol;
    });
  }

  quiz.reset();
  set("camera", "section");
  set("station", "well");
  set("mission-select", "free");
  sync();
  for (const id of ["nav-controls", "camera-controls", "mission-controls", "predict-controls", "b-clock", "b-view"]) {
    disable(id, false);
  }
  hide("static-note", true);
}

const root = document.querySelector(".site-main.finite-well-lesson");
if (root) initialize(root);