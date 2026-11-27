const TAU = 2 * Math.PI;
const LEVELS = Array.from({ length: 8 }, (_, index) => String(index + 1));
const SAMPLE_COUNT = 240;
const BINS = 30;
const NODE_TOLERANCE = 0.015;
const OPENING = { mode: "eigen", length: 1, mass: 1, r: 1, s: 2, alpha: 45, phi: 0 };
const SVG_NS = "http://www.w3.org/2000/svg";

const OPENING_ANSWERS = {
  less: "The central third covers the region of highest ground-state density, so its area exceeds one third. Compare it with the n = 2 state.",
  equal: "Equal widths would give equal probabilities for a uniform density. The ground-state density peaks at the center, so this third gets more.",
  more: "Correct. The central third covers about 60.90% of the ground-state density. In n = 2 the same gate straddles a node and covers about 19.55%."
};

const MISSIONS = {
  containment: {
    goal: "Establish Containment. Predict which third receives the most ground-state detections.",
    hint: "Compare areas under the curve for equal-width regions.",
    setup: {}
  },
  nodes: {
    goal: "Find the Forbidden Points. Mark every internal node of the prepared eigenstate.",
    hint: "Follow the full density to zero. Wall zeros are outside this task.",
    setup: { r: 4 }
  },
  tune: {
    goal: "Tune the Chamber. Adjust L or m to give level 3 an energy of 4.00 Eref, within 0.05 Eref.",
    hint: "Energy scales as 1/(mL²). Try keeping the mass at 1 mref.",
    setup: { r: 3 }
  },
  moving: {
    goal: "Create a Moving Pattern. Set the left-half probability at T/4 to 80%, within 1 percentage point.",
    hint: "Adjust the mixing angle or initial phase in the lab, then use T/4 to inspect the target snapshot. Check scores that time directly.",
    setup: { mode: "pair" },
    gate: [0, 30]
  },
  mystery: {
    goal: "Identify the Mystery State. Infer the hidden energy level from the standing-wave shape.",
    hint: "Count half-waves between the walls, using the internal zeros as separators.",
    setup: {}
  },
  zero: {
    goal: "The Zero-Energy Problem. Request the diagnostic and explain why the result cannot be normalized.",
    hint: "At E = 0 the stationary equation gives a straight line. Apply both wall conditions."
  }
};

function modulo(value, period) {
  return ((value % period) + period) % period;
}

function energy(setup, n) {
  return n ** 2 / (setup.mass * setup.length ** 2);
}

function spectrum(setup, time) {
  const pair = setup.mode === "pair";
  const angle = setup.alpha * Math.PI / 180;
  const c = !pair || setup.alpha === 0 ? 1 : setup.alpha === 90 ? 0 : Math.cos(angle);
  const d = !pair || setup.alpha === 0 ? 0 : setup.alpha === 90 ? 1 : Math.sin(angle);
  const er = energy(setup, setup.r);
  const es = energy(setup, setup.s);
  const phase = setup.phi * Math.PI / 180;
  const ar = -modulo(time, TAU / er) * er;
  const as = phase - modulo(time, TAU / es) * es;
  const both = c > 0 && d > 0;
  const period = both ? TAU / Math.abs(es - er) : null;
  const delta = both ? phase - (es - er) * modulo(time, period) : 0;
  return {
    setup, er, es, c, d, both, period, delta,
    level: both ? null : c > 0 ? setup.r : setup.s,
    phase: c > 0 ? ar : as,
    cycle: period ?? TAU / (c > 0 ? er : es),
    cross: 2 * c * d * Math.cos(delta),
    rr: c * Math.cos(ar),
    ri: c * Math.sin(ar),
    sr: d * Math.cos(as),
    si: d * Math.sin(as)
  };
}

function wave(model, y) {
  if (y <= 0 || y >= 1) return { re: 0, im: 0, density: 0 };
  const { setup, rr, ri, sr, si } = model;
  const norm = Math.sqrt(2 / setup.length);
  const r = norm * Math.sin(setup.r * Math.PI * y);
  const s = norm * Math.sin(setup.s * Math.PI * y);
  const re = rr * r + sr * s;
  const im = ri * r + si * s;
  return { re, im, density: re ** 2 + im ** 2 };
}

function cdf(model, y) {
  if (y <= 0) return 0;
  if (y >= 1) return 1;
  const { r, s } = model.setup;
  const single = n => y - Math.sin(TAU * n * y) / (TAU * n);
  const base = model.c ** 2 * single(r) + model.d ** 2 * single(s);
  if (!model.both) return base;
  const difference = (r - s) * Math.PI;
  const sum = (r + s) * Math.PI;
  return base + model.cross * (Math.sin(difference * y) / difference - Math.sin(sum * y) / sum);
}

function probability(model, a, b) {
  return a >= b ? 0 : Math.min(1, Math.max(0, cdf(model, b) - cdf(model, a)));
}

function drawPosition(model, random = Math.random) {
  const target = random();
  let a = 0;
  let b = 1;
  for (let index = 0; index < 42; index += 1) {
    const mid = (a + b) / 2;
    if (cdf(model, mid) > target) b = mid;
    else a = mid;
  }
  return (a + b) / 2;
}

function newLab(setup = {}, gate = [20, 40]) {
  return {
    setup: { ...OPENING, ...setup },
    gate: [...gate],
    time: 0,
    samples: [],
    bins: Array(BINS).fill(0)
  };
}

function clearSamples(lab) {
  lab.samples = [];
  lab.bins.fill(0);
}

function measure(lab, model, count) {
  for (let index = 0; index < count; index += 1) {
    const y = drawPosition(model);
    lab.samples.push(y);
    lab.bins[Math.min(BINS - 1, Math.floor(y * BINS))] += 1;
  }
}

function internalNodes(model) {
  return model.level === null
    ? []
    : Array.from({ length: model.level - 1 }, (_, j) => (j + 1) / model.level);
}

function matchNodes(placed, expected) {
  const sorted = [...placed].sort((a, b) => a - b);
  return sorted.length === expected.length
    && sorted.every((mark, index) => Math.abs(mark - expected[index]) <= NODE_TOLERANCE + 1e-12);
}

function percent(value) {
  return (100 * value).toFixed(2) + "%";
}

function degrees(phase) {
  return (Math.round(10 * modulo(phase * 180 / Math.PI, 360)) % 3600 / 10).toFixed(1) + "°";
}

function phaseAt(value) {
  return value.density > 1e-10 ? modulo(Math.atan2(value.im, value.re), TAU) : null;
}

function cameraWindow(camera, pan) {
  const center = 0.25 + 0.5 * pan / 100;
  return camera === "side" ? [0, 1] : [center - 0.25, center + 0.25];
}

function initializePlots(root) {
  const get = id => root.querySelector("#iw-" + id);
  const document = root.ownerDocument;
  const x = y => 60 + 540 * y;
  const create = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };

  function group(id, keys) {
    const plot = get(id);
    const refs = Object.fromEntries(keys.map(key => [key, get(key)]));
    if (!plot || !Object.values(refs).every(Boolean) || typeof document.createElementNS !== "function") {
      plot?.setAttribute("hidden", "");
      return null;
    }
    return { plot, ...refs };
  }

  const core = group("core-plot", [
    "plot-real", "plot-imag", "plot-density", "plot-area", "plot-a", "plot-b", "plot-nodes",
    "plot-attempts", "plot-detections", "histogram", "hist-prediction", "amp-top", "amp-bottom",
    "density-top", "density-mid", "plot-description"
  ]);
  const tube = group("chamber-plot", [
    "chamber-a", "chamber-b", "chamber-density-layer", "chamber-area", "chamber-density",
    "chamber-wave-layer", "chamber-real", "chamber-imag", "chamber-phase-layer", "phase-segments",
    "chamber-nodes", "chamber-attempts", "chamber-detections", "chamber-description"
  ]);

  function path(values, a, b, scale) {
    return "M" + values.map((value, j) => {
      const y = a + (b - a) * j / (values.length - 1);
      return x(y).toFixed(2) + " " + scale(value).toFixed(2);
    }).join(" L");
  }

  function prepareBars(parent) {
    return Array.from({ length: BINS }, (_, bin) => {
      const rect = create("rect", { x: x(bin / BINS), width: 540 / BINS });
      parent.append(rect);
      return rect;
    });
  }

  const seenBars = core ? prepareBars(core.histogram) : [];
  const expectedBars = core ? prepareBars(core["hist-prediction"]) : [];
  const segments = tube ? Array.from({ length: 120 }, (_, index) => {
    const rect = create("rect", { x: x(index / 120), y: 210, width: 4.5, height: 12 });
    tube["phase-segments"].append(rect);
    return rect;
  }) : [];

  function edge(node, value) {
    node.setAttribute("x1", x(value));
    node.setAttribute("x2", x(value));
  }

  function marks(graph, prefix, frame, baseline, top, flash, showDetections) {
    graph[prefix + "-nodes"].replaceChildren(...frame.nodes.map(y =>
      create("circle", { cx: x(y), cy: baseline, r: 3.4 })
    ));
    graph[prefix + "-attempts"].replaceChildren(...frame.attempts.map(y =>
      create("line", { x1: x(y), x2: x(y), y1: top, y2: baseline })
    ));
    const recent = showDetections ? frame.recent : [];
    graph[prefix + "-detections"].replaceChildren(...recent.map((y, index) =>
      create("circle", {
        cx: x(y), cy: baseline, r: index === recent.length - 1 ? 3.8 : 2.5,
        class: flash && index === recent.length - 1 ? "iw-flash" : ""
      })
    ));
  }

  return function draw(frame, flash) {
    const { lab, model, values, layers, open, summary, reduced } = frame;
    const [a, b] = lab.gate.map(item => item / 60);
    const total = lab.samples.length;
    const height = Math.max(2.5, Math.ceil(2 * Math.max(...values.map(value => value.density))) / 2);
    const amp = Math.max(2, Math.ceil(2 * Math.sqrt(height)) / 2);

    if (core) {
      const observed = lab.bins.map(count => total ? count * BINS / (total * model.setup.length) : 0);
      const expected = observed.map((_, bin) =>
        total ? probability(model, bin / BINS, (bin + 1) / BINS) * BINS / model.setup.length : 0
      );
      const ceiling = Math.max(height, Math.ceil(2 * Math.max(...observed, ...expected)) / 2);
      const densityY = value => 305 - 120 * value / ceiling;
      core["amp-top"].textContent = "+" + amp.toFixed(1);
      core["amp-bottom"].textContent = "−" + amp.toFixed(1);
      core["density-top"].textContent = ceiling.toFixed(2);
      core["density-mid"].textContent = (ceiling / 2).toFixed(2);
      core["plot-real"].setAttribute("d", path(values, 0, 1, value => 89 - 64 * value.re / amp));
      core["plot-imag"].setAttribute("d", path(values, 0, 1, value => 89 - 64 * value.im / amp));
      core["plot-density"].setAttribute("d", path(values, 0, 1, value => densityY(value.density)));
      const inGate = a === b ? "" : path(Array.from({ length: 121 }, (_, j) =>
        wave(model, a + (b - a) * j / 120)
      ), a, b, value => densityY(value.density)) + " V305 H" + x(a) + " Z";
      core["plot-area"].setAttribute("d", inGate);
      edge(core["plot-a"], a);
      edge(core["plot-b"], b);
      for (const [bars, bins] of [[seenBars, observed], [expectedBars, expected]]) {
        bars.forEach((bar, index) => {
          const y = densityY(bins[index]);
          bar.setAttribute("y", y);
          bar.setAttribute("height", 305 - y);
        });
      }
      core["plot-description"].textContent = summary
        + " Solid line is real amplitude, dashed line is imaginary amplitude. The lower plot shows density and detector area.";
      marks(core, "plot", frame, 305, 185, flash && !reduced, true);
    }

    if (!tube || !open) return;
    const [left, right] = frame.cameraRange;
    tube.plot.setAttribute("viewBox", frame.camera === "side" ? "0 0 640 300"
      : (x(left) - 12) + " 0 " + (x(right) - x(left) + 24) + " 300");
    edge(tube["chamber-a"], a);
    edge(tube["chamber-b"], b);
    tube["chamber-density-layer"].toggleAttribute("hidden", !layers.density);
    tube["chamber-wave-layer"].toggleAttribute("hidden", !layers.real && !layers.imag);
    tube["chamber-phase-layer"].toggleAttribute("hidden", !layers.phase);
    tube["chamber-real"].toggleAttribute("hidden", !layers.real);
    tube["chamber-imag"].toggleAttribute("hidden", !layers.imag);
    if (layers.density) {
      const crest = path(values, 0, 1, value => 112 - 70 * value.density / height);
      tube["chamber-density"].setAttribute("d", crest);
      tube["chamber-area"].setAttribute("d", crest + " V112 H60 Z");
    }
    if (layers.real) {
      tube["chamber-real"].setAttribute("d", path(values, 0, 1, value => 155 - 34 * value.re / amp));
    }
    if (layers.imag) {
      tube["chamber-imag"].setAttribute("d", path(values, 0, 1, value => 155 - 34 * value.im / amp));
    }
    if (layers.phase) {
      segments.forEach((rect, index) => {
        const phase = phaseAt(wave(model, (index + 0.5) / segments.length));
        rect.setAttribute("fill", phase === null ? "none" : "hsl(" + phase * 180 / Math.PI + " 80% 65%)");
      });
    }
    tube["chamber-description"].textContent = summary
      + " The center line marks zero signed amplitude. The lower rail marks sampled positions.";
    marks(tube, "chamber", frame, 245, 185, flash && !reduced, layers.detections);
  };
}

function makePerspective(THREE, canvas, viewport, browser) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080f19);
  const camera = new THREE.OrthographicCamera(-7, 7, 4, -4, 0.1, 60);
  const material = (color, wireframe = false) => new THREE.MeshBasicMaterial({ color, wireframe });
  const frameMaterial = material(0x496f82, true);
  const rings = material(0x8574a8, true);
  const gateMaterial = material(0xffe16a, true);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 5), material(0x132b33));
  floor.position.y = -1.65;
  scene.add(floor);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 11, 16, 1, true), frameMaterial);
  tube.rotation.z = Math.PI / 2;
  scene.add(tube);
  for (const position of [-5.5, 5.5]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.13, 0.065, 6, 20), rings);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = position;
    scene.add(ring);
  }

  const gates = [0, 1].map(() => {
    const gate = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.028, 4, 20), gateMaterial);
    gate.rotation.y = Math.PI / 2;
    scene.add(gate);
    return gate;
  });
  const geometry = size => {
    const shape = new THREE.BufferGeometry();
    shape.setAttribute("position", new THREE.BufferAttribute(new Float32Array(size * 3), 3)
      .setUsage(THREE.DynamicDrawUsage));
    return shape;
  };
  const lines = [0x67e5df, 0x65b7ff, 0xc19bff].map(color => {
    const line = new THREE.Line(geometry(181), new THREE.LineBasicMaterial({ color }));
    line.frustumCulled = false;
    scene.add(line);
    return line;
  });

  const phaseGeo = geometry(181);
  phaseGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(181 * 3), 3)
    .setUsage(THREE.DynamicDrawUsage));
  const phasePoints = new THREE.Points(phaseGeo, new THREE.PointsMaterial({
    size: 4, sizeAttenuation: false, vertexColors: true
  }));
  const clicks = new THREE.Points(geometry(24), new THREE.PointsMaterial({
    color: 0xff9f55, size: 7, sizeAttenuation: false
  }));
  phasePoints.frustumCulled = false;
  clicks.frustumCulled = false;
  scene.add(phasePoints, clicks);
  const color = new THREE.Color();
  let size = "";

  return {
    render(frame) {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(browser.devicePixelRatio || 1, 1.5, 1500 / Math.max(width, height));
      const nextSize = width + ":" + height + ":" + ratio;
      if (size !== nextSize) {
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
        size = nextSize;
      }

      const { values, layers, cameraRange, model, lab, recent } = frame;
      const [a, b] = cameraRange;
      const center = 11 * ((a + b) / 2 - 0.5);
      const aspect = width / height;
      const half = Math.max(frame.camera === "side" ? 6.4 : 3.25, 2.05 * aspect);
      camera.left = -half;
      camera.right = half;
      camera.top = half / aspect;
      camera.bottom = -half / aspect;
      camera.position.set(center + (frame.camera === "side" ? 0.2 : 1.0), 3.0, 10);
      camera.lookAt(center, 0, 0);
      camera.updateProjectionMatrix();
      gates.forEach((gate, index) => { gate.position.x = 11 * (lab.gate[index] / 60 - 0.5); });

      const scales = [4 / model.setup.length, 2 / Math.sqrt(model.setup.length), 2 / Math.sqrt(model.setup.length)];
      ["density", "real", "imag"].forEach((key, k) => {
        const line = lines[k];
        line.visible = layers[key];
        if (!line.visible) return;
        const attr = line.geometry.attributes.position;
        values.forEach((value, index) => {
          const ordinate = [value.density / scales[0], value.re / scales[1], value.im / scales[2]][k];
          attr.setXYZ(index, 11 * (index / 180 - 0.5), ordinate - (k === 0 ? 0.65 : 0), k * 0.13);
        });
        attr.needsUpdate = true;
      });

      phasePoints.visible = layers.phase;
      if (layers.phase) {
        let count = 0;
        values.forEach((value, index) => {
          const phase = phaseAt(value);
          if (phase === null) return;
          color.setHSL(phase / TAU, 0.8, 0.65);
          phaseGeo.attributes.position.setXYZ(count, 11 * (index / 180 - 0.5), 0.83, 0.18);
          phaseGeo.attributes.color.setXYZ(count, color.r, color.g, color.b);
          count += 1;
        });
        phaseGeo.setDrawRange(0, count);
        phaseGeo.attributes.position.needsUpdate = true;
        phaseGeo.attributes.color.needsUpdate = true;
      }

      clicks.visible = layers.detections;
      if (layers.detections) {
        recent.forEach((y, index) => {
          clicks.geometry.attributes.position.setXYZ(index, 11 * (y - 0.5), -0.85, 0.25);
        });
        clicks.geometry.setDrawRange(0, recent.length);
        clicks.geometry.attributes.position.needsUpdate = true;
      }
      renderer.render(scene, camera);
    },
    dispose() {
      const materials = new Set();
      scene.traverse(object => {
        object.geometry?.dispose();
        if (object.material) materials.add(object.material);
      });
      for (const item of materials) item.dispose();
      renderer.dispose();
    }
  };
}

function initializeLesson(root) {
  const names = (
    "static-note prediction prediction-controls prediction-retry prediction-feedback " +
    "prepare-controls mode length mass r r-label s pair-controls alpha alpha-value phi phi-value " +
    "detector-controls a b a-value b-value middle left-half clock-controls play pause step reset-time quarter half clock-note step-size " +
    "plot-summary evidence time wall-values probability node-cell node-count period-cell period phase-cell evolution-phase-label evolution-phase " +
    "energy-panel energy-rows r-name r-energy r-amplitude r-weight s-row s-name s-energy s-amplitude s-weight mean-energy " +
    "sample-controls measure measure-batch clear sample-time sample-count sample-hits sample-fraction sample-latest enter lab-status " +
    "chamber chamber-title camera-controls camera pan pan-value reset-camera effects camera-summary renderer-status layer-controls " +
    "layer-density layer-real layer-imag layer-phase layer-detections phase-tools phase-probe probe-position probe-phase chamber-summary " +
    "mission-controls mission-select load-mission retry-mission end-mission return mission-goal mission-hint containment-pane region-answer " +
    "nodes-pane node-entry add-node clear-nodes node-positions mystery-pane mystery-guess zero-pane zero-request zero-diagnostic zero-answer " +
    "check-mission mission-feedback region-report left-theory middle-theory right-theory left-count middle-count right-count"
  ).split(/\s+/);
  const get = name => root.querySelector("#iw-" + name);
  const e = Object.fromEntries(names.map(name => [name, get(name)]));
  if (Object.values(e).some(node => !node)) return;

  const fieldsets = ["prediction", "prepare", "detector", "clock", "sample", "camera", "layer", "mission"];
  const radios = [...e.prediction.querySelectorAll('input[name="iw-opening-answer"]')];
  const rows = LEVELS.map(n => {
    const row = e["energy-rows"].querySelector('[data-iw-energy="' + n + '"]');
    return { n: Number(n), row, value: row?.querySelector(".iw-energy-value") };
  });
  const choices = {
    mode: ["eigen", "pair"],
    r: LEVELS,
    s: LEVELS,
    camera: ["side", "close"],
    "mission-select": Object.keys(MISSIONS),
    "region-answer": ["", "left", "middle", "right"],
    "zero-answer": ["", "walls", "constant", "negative"]
  };

  function sameValues(a, b) {
    return a.length === b.length && b.every(value => a.includes(value));
  }

  if (
    fieldsets.some(id => e[id + "-controls"].tagName !== "FIELDSET") ||
    e.prediction.tagName !== "FORM" || rows.some(row => !row.value) ||
    !sameValues(radios.map(node => node.value), Object.keys(OPENING_ANSWERS)) ||
    Object.entries(choices).some(([id, values]) => e[id].tagName !== "SELECT" ||
      !sameValues(Array.from(e[id].options, item => item.value), values))
  ) return;

  const doc = root.ownerDocument;
  const browser = doc.defaultView;
  const motion = browser.matchMedia("(prefers-reduced-motion: reduce)");
  const draw = initializePlots(root);
  const viewport = get("chamber-viewport");
  const canvas = get("chamber-canvas");
  const layerKeys = ["density", "real", "imag", "phase", "detections"];
  const explorer = newLab();
  let mission = null;
  let open = false;
  let frameId = null;
  let lastFrame = null;
  let lastDraw = -Infinity;
  let camera = "side";
  let pan = 50;
  let probe = 0.5;
  let frameData = null;
  let perspective = null;
  let loading = false;
  let unavailable = false;
  let generation = 0;
  const active = () => mission?.lab ?? explorer;
  const reduced = () => motion.matches || e.effects.checked;
  const write = (id, value) => {
    const text = String(value);
    if (e[id].textContent !== text) e[id].textContent = text;
  };

  function releasePerspective() {
    generation += 1;
    loading = false;
    perspective?.dispose();
    perspective = null;
    if (viewport) viewport.hidden = true;
  }

  function drawPerspective() {
    if (!perspective || !frameData || doc.hidden || !open) return;
    try {
      perspective.render(frameData);
    } catch {
      unavailable = true;
      releasePerspective();
      write("renderer-status", "Calibrated 2D chamber is active.");
    }
  }

  async function syncGraphics() {
    if (!open || reduced() || !canvas || !viewport || unavailable) {
      releasePerspective();
      write("renderer-status", reduced() ? "Reduced effects · calibrated 2D chamber."
        : "Calibrated 2D chamber is available.");
      return;
    }
    if (doc.hidden || perspective || loading) return;
    const ticket = ++generation;
    loading = true;
    write("renderer-status", "Calibrated 2D chamber is active while the perspective view loads.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (ticket !== generation) return;
      perspective = makePerspective(THREE, canvas, viewport, browser);
      viewport.hidden = false;
      write("renderer-status", "Perspective view and calibrated 2D instruments are active.");
      drawPerspective();
    } catch {
      if (ticket !== generation) return;
      unavailable = true;
      releasePerspective();
      write("renderer-status", "Calibrated 2D chamber is active.");
    } finally {
      if (ticket === generation) loading = false;
    }
  }

  canvas?.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    unavailable = true;
    releasePerspective();
    write("renderer-status", "Graphics context lost. Calibrated 2D chamber is active.");
  });
  canvas?.addEventListener("webglcontextrestored", () => {
    unavailable = false;
    void syncGraphics();
  });
  if (viewport && browser.ResizeObserver) new browser.ResizeObserver(drawPerspective).observe(viewport);

  function syncPreparation() {
    const { setup } = active();
    for (const key of Object.keys(OPENING)) e[key].value = String(setup[key]);
    const key = mission?.key;
    const editable = !mission || key === "zero";
    for (const id of ["mode", "r", "s"]) e[id].disabled = !editable;
    for (const id of ["length", "mass"]) e[id].disabled = !editable && key !== "tune";
    for (const id of ["alpha", "phi"]) e[id].disabled = !editable && key !== "moving";
    e["pair-controls"].hidden = setup.mode !== "pair";
    write("r-label", setup.mode === "pair" ? "First level r" : "Level n");
    for (const id of ["alpha", "phi"]) {
      write(id + "-value", setup[id] + "°");
      e[id].setAttribute("aria-valuetext", setup[id] + " degrees");
    }
    e["detector-controls"].disabled = key === "moving" || key === "containment";
  }

  function render(flash = false) {
    const lab = active();
    const { setup, time, samples } = lab;
    const model = spectrum(setup, time);
    const key = mission?.key;
    const hiddenLevel = key === "mystery" && !mission.checked;
    const awaitPrediction = key === "containment" && !mission.checked;
    const hideNodes = key === "nodes" && !mission.checked;
    const nodes = hideNodes ? [] : internalNodes(model);
    const [a, b] = lab.gate.map(tick => tick / 60);
    const physical = y => (y * setup.length).toFixed(4);
    const hits = a === b ? 0 : samples.filter(y => y >= a && y <= b).length;
    const summary = "Walls at 0 and " + physical(1) + " Lref. Detector from "
      + physical(a) + " to " + physical(b) + " Lref. Time " + time.toFixed(4) + " tref.";
    const positionText = nodes.map(y => y.toFixed(4)).join(", ");
    const shapes = model.level === null ? "Both components are occupied. The full density determines any instantaneous zeros."
      : hideNodes ? "Look for internal points where the full density reaches zero."
      : nodes.length ? "Internal zeros at x/L = " + positionText + "."
      : "No internal zeros between the walls.";
    const layers = Object.fromEntries(layerKeys.map(name => [name, e["layer-" + name].checked]));

    e["prepare-controls"].hidden = hiddenLevel;
    e["energy-panel"].hidden = hiddenLevel;
    e["node-cell"].hidden = hiddenLevel || hideNodes || model.level === null;
    e["phase-cell"].hidden = hiddenLevel;
    e["period-cell"].hidden = !model.both;
    e["s-row"].hidden = setup.mode !== "pair";
    e.prediction.hidden = awaitPrediction;
    write("time", time.toFixed(4) + " tref");
    write("wall-values", "0 and " + physical(1) + " Lref");
    write("plot-summary", summary);
    write("evidence", shapes);
    write("node-count", model.level === null ? "—" : model.level - 1);
    write("period", model.period === null ? "—" : model.period.toFixed(4) + " tref");
    write("evolution-phase-label", model.both ? "Relative phase δ(t)" : "Global phase");
    write("evolution-phase", degrees(model.both ? model.delta : model.phase));
    write("probability", awaitPrediction ? "Revealed after prediction" : percent(probability(model, a, b)));

    if (!hiddenLevel) {
      rows.forEach(({ n, row, value }) => {
        row.toggleAttribute("data-occupied", (n === setup.r && model.c > 0) || (n === setup.s && model.d > 0));
        value.textContent = energy(setup, n).toFixed(4);
      });
      for (const [label, n, value, magnitude] of [
        ["r", setup.r, model.er, model.c], ["s", setup.s, model.es, model.d]
      ]) {
        write(label + "-name", n);
        write(label + "-energy", value.toFixed(4));
        write(label + "-amplitude", magnitude.toFixed(4));
        write(label + "-weight", percent(magnitude ** 2));
      }
      write("mean-energy", (model.c ** 2 * model.er + model.d ** 2 * model.es).toFixed(4) + " Eref");
    }

    ["a", "b"].forEach((id, index) => {
      const y = lab.gate[index] / 60;
      e[id].value = String(lab.gate[index]);
      e[id].setAttribute("aria-valuetext", physical(y) + " reference lengths");
      write(id + "-value", physical(y) + " Lref");
    });
    write("sample-time", samples.length ? time.toFixed(4) + " tref" : "—");
    write("sample-count", samples.length);
    write("sample-hits", hits);
    write("sample-fraction", samples.length ? percent(hits / samples.length) : "—");
    write("sample-latest", samples.length ? physical(samples[samples.length - 1]) + " Lref" : "—");
    const running = frameId !== null;
    e.play.disabled = running;
    e.pause.disabled = !running;
    e.step.disabled = running;
    for (const id of ["quarter", "half"]) e[id].disabled = model.period === null;
    for (const id of ["measure", "measure-batch"]) e[id].disabled = awaitPrediction;
    e.clear.disabled = samples.length === 0;
    write("step-size", "Step duration ≈ " + (model.cycle / 24).toFixed(4) + " tref.");
    write("clock-note", running ? "Playing. The clock uses elapsed time."
      : reduced() ? "Paused. In reduced effects, Play takes one still step."
      : "Paused. Step advances 1/24 of the phase cycle or beat.");

    root.toggleAttribute("data-iw-reduced", reduced());
    e.chamber.hidden = !open;
    e.enter.hidden = open;
    e.enter.setAttribute("aria-expanded", String(open));
    e["phase-tools"].hidden = !layers.phase;
    const cameraRange = cameraWindow(camera, pan);
    e.pan.disabled = camera === "side";
    const panPercent = Math.round(100 * (cameraRange[0] + cameraRange[1]) / 2);
    write("pan-value", panPercent + "% of L");
    e.pan.setAttribute("aria-valuetext", panPercent + " percent across the well");
    write("camera-summary", camera === "side" ? "Full side view covers the entire well."
      : "Close-up from " + physical(cameraRange[0]) + " to " + physical(cameraRange[1]) + " Lref.");
    write("chamber-summary", summary + " Tube depth is scenic. " + shapes);
    e["phase-probe"].setAttribute("aria-valuetext", Math.round(100 * probe) + " percent across the well");
    write("probe-position", probe.toFixed(2) + " L");
    const phase = phaseAt(wave(model, probe));
    write("probe-phase", phase === null ? "Undefined at or near a zero" : degrees(phase));

    for (const id of ["containment", "nodes", "mystery", "zero"]) e[id + "-pane"].hidden = key !== id;
    e["end-mission"].disabled = !mission;
    e["retry-mission"].disabled = !mission;
    e["check-mission"].disabled = !mission || (key === "zero" && !mission.requested)
      || (mission.checked && key !== "tune" && key !== "moving");
    const attempts = key === "nodes" ? mission.marks : [];
    write("node-positions", "Markers placed · " + (attempts.length ? attempts.map(y => y.toFixed(3)).join(", ") : "none"));
    e["zero-answer"].disabled = key !== "zero" || !mission.requested;
    e["region-report"].hidden = key !== "containment" || !mission.checked;

    const values = Array.from({ length: 181 }, (_, index) => wave(model, index / 180));
    frameData = {
      lab, model, values, layers, open, summary: summary + " " + shapes, reduced: reduced(),
      nodes, attempts, recent: samples.slice(-24), camera, cameraRange
    };
    draw(frameData, flash);
    drawPerspective();
  }

  function stop() {
    if (frameId !== null) browser.cancelAnimationFrame(frameId);
    frameId = null;
    lastFrame = null;
  }

  function setTime(lab, time) {
    if (lab.time !== time) clearSamples(lab);
    lab.time = time;
  }

  function moveClock(time, message) {
    stop();
    setTime(active(), time);
    render();
    if (message) write("lab-status", message);
  }

  function tick(now) {
    const lab = active();
    const model = spectrum(lab.setup, lab.time);
    const rate = Math.min(1, 12 / Math.max(model.c > 0 ? model.er : 0, model.d > 0 ? model.es : 0));
    if (lastFrame !== null) setTime(lab, lab.time + (now - lastFrame) * rate / 1000);
    lastFrame = now;
    frameId = browser.requestAnimationFrame(tick);
    if (now - lastDraw >= 32) {
      render();
      lastDraw = now;
    }
  }

  e.play.addEventListener("click", () => {
    if (frameId !== null) return;
    const lab = active();
    if (reduced()) {
      moveClock(lab.time + spectrum(lab.setup, lab.time).cycle / 24, "Still snapshot advanced.");
    } else {
      frameId = browser.requestAnimationFrame(tick);
      render();
      e.pause.focus({ preventScroll: true });
    }
  });
  e.pause.addEventListener("click", () => {
    moveClock(active().time, "Clock paused.");
    e.play.focus({ preventScroll: true });
  });
  e.step.addEventListener("click", () => {
    const lab = active();
    moveClock(lab.time + spectrum(lab.setup, lab.time).cycle / 24);
  });
  e["reset-time"].addEventListener("click", () => {
    clearSamples(active());
    moveClock(0, "Time and measurements reset. Preparation retained.");
  });
  for (const [id, fraction] of [["quarter", 0.25], ["half", 0.5]]) {
    e[id].addEventListener("click", () => {
      const lab = active();
      const period = spectrum(lab.setup, lab.time).period;
      if (period !== null) moveClock(period * fraction, "Beat snapshot selected.");
    });
  }

  const limits = { length: [0.5, 2.5, 0.05], mass: [0.5, 3, 0.05], alpha: [0, 90, 1], phi: [0, 360, 1] };
  function editPreparation(id) {
    const lab = active();
    const key = mission?.key;
    const editable = !mission || key === "zero" || (key === "tune" && ["length", "mass"].includes(id))
      || (key === "moving" && ["alpha", "phi"].includes(id));
    const input = e[id];
    const value = id === "mode" ? input.value : Number(input.value);
    const range = limits[id];
    const valid = range ? input.value !== "" && Number.isFinite(value) && value >= range[0] && value <= range[1]
      && Math.abs((value - range[0]) / range[2] - Math.round((value - range[0]) / range[2])) < 1e-8
      : choices[id].includes(input.value);
    if (!editable || !valid) {
      syncPreparation();
      if (editable) write("lab-status", "Enter a value within the control’s range and step.");
      return;
    }
    if (lab.setup[id] === value) return;
    if (lab.setup.mode === "pair" && (id === "r" || id === "s") && value === lab.setup[id === "r" ? "s" : "r"]) {
      syncPreparation();
      write("lab-status", "Choose two distinct levels.");
      return;
    }

    stop();
    lab.setup[id] = value;
    if (id === "mode" && value === "pair" && lab.setup.r === lab.setup.s) lab.setup.s = lab.setup.r === 1 ? 2 : 1;
    lab.time = 0;
    clearSamples(lab);
    if (key === "tune" || key === "moving") write("mission-feedback", "");
    syncPreparation();
    render();
    if (input.type !== "range") write("lab-status", "State prepared at t = 0. Detections cleared.");
  }

  for (const id of Object.keys(OPENING)) {
    e[id].addEventListener(e[id].type === "range" ? "input" : "change", () => editPreparation(id));
  }

  function setGate(a, b) {
    if (mission?.key === "containment" || mission?.key === "moving") return;
    active().gate = [a, b];
    render();
  }

  for (const [id, index] of [["a", 0], ["b", 1]]) {
    e[id].addEventListener("input", () => {
      const value = e[id].valueAsNumber;
      const [a, b] = active().gate;
      if (!Number.isInteger(value) || value < 0 || value > 60) {
        render();
        return;
      }
      if (index === 0) setGate(Math.min(b, value), b);
      else setGate(a, Math.max(a, value));
    });
  }
  e.middle.addEventListener("click", () => setGate(20, 40));
  e["left-half"].addEventListener("click", () => setGate(0, 30));

  function collect(count) {
    if (mission?.key === "containment" && !mission.checked) return;
    stop();
    const lab = active();
    measure(lab, spectrum(lab.setup, lab.time), count);
    render(true);
    write("lab-status", count + (count === 1 ? " detection at " : " detections at ")
      + lab.time.toFixed(4) + " tref. " + lab.samples.length + " in this snapshot.");
  }

  e.measure.addEventListener("click", () => collect(1));
  e["measure-batch"].addEventListener("click", () => collect(SAMPLE_COUNT));
  e.clear.addEventListener("click", () => {
    clearSamples(active());
    render();
    write("lab-status", "Detections cleared.");
  });

  e.enter.addEventListener("click", () => {
    open = true;
    write("mission-goal", "Free exploration is active. Load a mission to try a specific experiment.");
    write("mission-hint", "");
    write("mission-feedback", "");
    render();
    e["chamber-title"].focus();
    void syncGraphics();
  });
  e.return.addEventListener("click", () => {
    if (mission && mission.lab !== explorer) stop();
    mission = null;
    open = false;
    releasePerspective();
    syncPreparation();
    render();
    e.enter.focus();
    write("lab-status", "Core lab view restored.");
  });
  e.camera.addEventListener("change", () => {
    camera = choices.camera.includes(e.camera.value) ? e.camera.value : "side";
    e.camera.value = camera;
    render();
  });
  e.pan.addEventListener("input", () => {
    const value = e.pan.valueAsNumber;
    if (Number.isInteger(value) && value >= 0 && value <= 100) pan = value;
    e.pan.value = String(pan);
    render();
  });
  e["reset-camera"].addEventListener("click", () => {
    camera = "side";
    pan = 50;
    e.camera.value = camera;
    e.pan.value = "50";
    render();
  });
  for (const key of layerKeys) e["layer-" + key].addEventListener("change", () => render());
  e["phase-probe"].addEventListener("input", () => {
    const value = e["phase-probe"].valueAsNumber;
    if (Number.isInteger(value) && value >= 0 && value <= 100) probe = value / 100;
    render();
  });

  function changeEffects() {
    if (reduced()) stop();
    render();
    void syncGraphics();
  }

  e.effects.addEventListener("change", changeEffects);
  motion.addEventListener("change", changeEffects);
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) stop();
    else void syncGraphics();
    render();
  });
  browser.addEventListener("pagehide", () => {
    stop();
    releasePerspective();
  });
  browser.addEventListener("pageshow", () => {
    if (open) void syncGraphics();
  });

  function loadMission(key, mysteryLevel) {
    if (!open || !Object.hasOwn(MISSIONS, key)) return;
    stop();
    const definition = MISSIONS[key];
    const setup = { ...definition.setup };
    if (key === "mystery") setup.r = mysteryLevel ?? (3 + Math.floor(5 * Math.random()));
    mission = {
      key,
      lab: key === "zero" ? explorer : newLab(setup, definition.gate),
      checked: false,
      requested: false,
      marks: []
    };
    e["mission-select"].value = key;
    for (const id of ["region-answer", "node-entry", "mystery-guess", "zero-answer"]) e[id].value = "";
    write("zero-diagnostic", "The diagnostic keeps the live preparation in the tube.");
    write("mission-goal", definition.goal);
    write("mission-hint", definition.hint);
    write("mission-feedback", "");
    syncPreparation();
    render();
  }

  e["load-mission"].addEventListener("click", () => loadMission(e["mission-select"].value));
  e["retry-mission"].addEventListener("click", () => {
    if (mission) loadMission(mission.key, mission.lab.setup.r);
  });
  e["end-mission"].addEventListener("click", () => {
    if (!mission) return;
    if (mission.lab !== explorer) stop();
    mission = null;
    write("mission-goal", "Free exploration is active. Load a mission to try a specific experiment.");
    write("mission-hint", "");
    write("mission-feedback", "Mission ended. Your exploration state is active.");
    syncPreparation();
    render();
    e["load-mission"].focus();
  });

  e["add-node"].addEventListener("click", () => {
    if (mission?.key !== "nodes" || mission.checked) return;
    const y = e["node-entry"].valueAsNumber;
    if (!Number.isFinite(y) || y <= 0 || y >= 1 || mission.marks.length >= 8) {
      write("mission-feedback", "Place a marker strictly between 0 and 1, or clear the current markers.");
      return;
    }
    mission.marks.push(y);
    e["node-entry"].value = "";
    e["node-entry"].focus();
    render();
    write("mission-feedback", "Marker placed at x/L = " + y.toFixed(3) + ".");
  });
  e["clear-nodes"].addEventListener("click", () => {
    if (mission?.key !== "nodes" || mission.checked) return;
    mission.marks = [];
    render();
    write("mission-feedback", "Markers cleared.");
  });
  e["zero-request"].addEventListener("click", () => {
    if (mission?.key !== "zero") return;
    mission.requested = true;
    write("zero-diagnostic", "Diagnostic received. Why can’t the zero-energy solution satisfy normalization?");
    render();
    e["zero-answer"].focus();
  });

  e["check-mission"].addEventListener("click", () => {
    if (!mission || e["check-mission"].disabled) return;
    stop();
    const { key, lab } = mission;
    let model = spectrum(lab.setup, lab.time);
    let message;

    if (key === "containment") {
      const choice = e["region-answer"].value;
      if (!["left", "middle", "right"].includes(choice)) {
        write("mission-feedback", "Choose a detector third first.");
        return;
      }
      clearSamples(lab);
      measure(lab, model, SAMPLE_COUNT);
      const counts = [0, 0, 0];
      for (const y of lab.samples) counts[Math.min(2, Math.floor(3 * y))] += 1;
      ["left", "middle", "right"].forEach((region, index) => {
        write(region + "-theory", percent(probability(model, index / 3, (index + 1) / 3)));
        write(region + "-count", counts[index]);
      });
      message = (choice === "middle" ? "Correct. " : "Compare the areas. ")
        + "The middle third contains the largest integrated probability. The measured counts fluctuate around those predictions.";
    } else if (key === "nodes") {
      const expected = internalNodes(model);
      if (mission.marks.length === 0) {
        write("mission-feedback", "Place at least one marker before checking.");
        return;
      }
      const correct = matchNodes(mission.marks, expected);
      measure(lab, model, SAMPLE_COUNT);
      message = (correct ? "All internal nodes matched. " : "The marked positions miss one or more internal nodes. ")
        + "The exact positions are x/L = " + expected.map(y => y.toFixed(3)).join(", ")
        + ". Compare the histogram. An empty bin in a finite sample can occur even where its probability is positive.";
    } else if (key === "tune") {
      const error = Math.abs(model.er - 4);
      message = (error <= 0.05 + 1e-10 ? "Target reached. " : "Adjust the chamber and try again. ")
        + "Energy " + model.er.toFixed(4) + " Eref. Absolute error " + error.toFixed(4)
        + " Eref. Increasing L or m lowers the energy through the factor 1/(mL²).";
    } else if (key === "moving") {
      const targetTime = TAU / Math.abs(model.es - model.er) / 4;
      setTime(lab, targetTime);
      model = spectrum(lab.setup, targetTime);
      const captured = probability(model, 0, 0.5);
      const error = Math.abs(100 * captured - 80);
      message = (error <= 1 + 1e-10 ? "Target reached. " : "Adjust the mixing or phase and try again. ")
        + "At the target time the left half holds " + percent(captured) + ". Absolute error "
        + error.toFixed(2) + " percentage points. The interference term depends on both amplitude magnitudes and the relative phase.";
    } else if (key === "mystery") {
      const guess = e["mystery-guess"].valueAsNumber;
      if (!Number.isInteger(guess) || guess < 1 || guess > 8) {
        write("mission-feedback", "Enter a level from 1 through 8.");
        return;
      }
      message = (guess === model.level ? "Correct. " : "Check the standing-wave shape. ")
        + "The hidden level was n = " + model.level + ". Its " + (model.level - 1)
        + " internal zeros separate " + model.level + " lobes.";
    } else {
      const answer = e["zero-answer"].value;
      if (!mission.requested || !choices["zero-answer"].slice(1).includes(answer)) {
        write("mission-feedback", "Choose an explanation after requesting the diagnostic.");
        return;
      }
      const lead = {
        walls: "Correct. ",
        constant: "A constant on this finite interval would have finite norm, but the walls require it to be zero. ",
        negative: "Probability is a squared magnitude, so it is nonnegative. "
      };
      message = lead[answer] + "The left wall forces B = 0 and the right wall forces A = 0. The squared norm is zero, so no finite multiplier can normalize it.";
      write("zero-diagnostic", "Computer diagnostic · zero norm. The live preparation remains available.");
    }
    mission.checked = true;
    render(key === "containment" || key === "nodes");
    write("mission-feedback", message);
    if (e["check-mission"].disabled) e["retry-mission"].focus({ preventScroll: true });
  });

  e.prediction.addEventListener("submit", event => {
    event.preventDefault();
    const answer = radios.find(radio => radio.checked)?.value;
    if (!Object.hasOwn(OPENING_ANSWERS, answer)) return;
    write("prediction-feedback", OPENING_ANSWERS[answer]);
    e["prediction-retry"].hidden = false;
  });
  e["prediction-retry"].addEventListener("click", () => {
    e.prediction.reset();
    write("prediction-feedback", "");
    radios[0].focus();
    e["prediction-retry"].hidden = true;
  });
  for (const detail of root.querySelectorAll("details[data-iw-symbol]")) {
    detail.addEventListener("toggle", () => {
      if (detail.open) root.dataset.iwSymbol = detail.dataset.iwSymbol;
      else if (root.dataset.iwSymbol === detail.dataset.iwSymbol) delete root.dataset.iwSymbol;
    });
  }

  e.prediction.reset();
  e.camera.value = "side";
  e.pan.value = "50";
  e["phase-probe"].value = "50";
  syncPreparation();
  render();
  for (const id of fieldsets) e[id + "-controls"].disabled = false;
  e.enter.disabled = false;
  e["static-note"].hidden = true;
}

const lesson = document.querySelector(".site-main.infinite-well-lesson");
if (lesson) initializeLesson(lesson);