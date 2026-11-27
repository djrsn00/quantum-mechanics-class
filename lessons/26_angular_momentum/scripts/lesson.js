const AXES = {
  z: [0, 0, 1], x: [1, 0, 0], y: [0, 1, 0],
  "-z": [0, 0, -1], "-x": [-1, 0, 0], "-y": [0, -1, 0]
};
const PLANAR_AXES = { 0: "z", 90: "x", 180: "-z", 270: "-x" };
const STATIONS = ["rig", "deck", "sequence", "orbital", "ladder"];
const RIG = { axis: 0, sign: 1, angle: 60, preset: "60" };
const SEQUENCE = { route: "filtered", source: "z", sign: 1, middle: "x", pass: 1, final: "z" };
const ORBITAL = { l: 0, m: 0, theta: 90, phi: 0 };
const LADDER = { j: 2, m: 0, previous: null, operation: null };
const SHAPES = [[0, 0], [1, 0], [1, 1], [2, 0], [2, 1], [2, 2]];
const DASH = "—";

const mod = (value, cycle) => ((value % cycle) + cycle) % cycle;
const rad = degrees => degrees * Math.PI / 180;
const degrees = angle => angle * 180 / Math.PI;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const decimal = (value, places = 2) => value.toFixed(places).replace("-", "−");
const percent = value => value === null ? DASH : decimal(100 * value) + "%";
const quotient = (n, d) => d ? n / d : null;
const signName = sign => sign === 1 ? "positive" : "negative";
const spinValue = sign => sign === 1 ? "+ℏ/2" : "−ℏ/2";
const axisName = axis => axis.startsWith("-") ? "−" + axis.slice(1) : "+" + axis;
const planarName = angle => Object.hasOwn(PLANAR_AXES, angle)
  ? axisName(PLANAR_AXES[angle]) : angle + "° from +z toward +x";

function planarAxis(angle) {
  if (Object.hasOwn(PLANAR_AXES, angle)) return AXES[PLANAR_AXES[angle]];
  return [Math.sin(rad(angle)), 0, Math.cos(rad(angle))];
}

function cosine(u, v) {
  const dot = u.reduce((sum, component, index) => sum + component * v[index], 0);
  const c = clamp(dot / (Math.hypot(...u) * Math.hypot(...v)), -1, 1);
  return Math.abs(c) < 1e-14 ? 0 : 1 - Math.abs(c) < 1e-14 ? Math.sign(c) : c;
}

function spinProbability(result, sign, u, v) {
  return (1 + result * sign * cosine(u, v)) / 2;
}

function rigProbability(rig) {
  return spinProbability(1, rig.sign, planarAxis(rig.axis), planarAxis(rig.angle));
}

function trackModel(track) {
  const source = AXES[track.source];
  const middle = AXES[track.middle];
  const final = AXES[track.final];
  const direct = spinProbability(1, track.sign, source, final);
  const filtered = track.route === "filtered";
  const pass = filtered ? spinProbability(track.pass, track.sign, source, middle) : 1;
  const finalPlus = filtered ? spinProbability(1, track.pass, middle, final) : direct;
  return {
    filtered, pass, direct,
    conditional: pass > 0 ? [finalPlus, 1 - finalPlus] : [null, null],
    sent: [pass * finalPlus, pass * (1 - finalPlus), 1 - pass]
  };
}

function trial(track, model, random = Math.random) {
  const middleResult = model.filtered ? (random() < model.pass ? track.pass : -track.pass) : null;
  if (model.filtered && middleResult !== track.pass) return { middle: middleResult, result: 0 };
  return { middle: middleResult, result: random() < model.conditional[0] ? 1 : -1 };
}

// The deck and ladder store twice the physical j and m to keep half-integer steps exact.
function projections(j) {
  return Array.from({ length: j + 1 }, (_, index) => -j + 2 * index);
}

function fraction(value, signed = false) {
  const magnitude = Math.abs(value);
  const digits = magnitude % 2 === 0 ? String(magnitude / 2) : magnitude === 1 ? "½" : magnitude + "/2";
  return (value < 0 ? "−" : value > 0 && signed ? "+" : "") + digits;
}

const ket = (j, m) => "|" + fraction(j) + "," + fraction(m) + "⟩";

function angularState(j, m) {
  const total = j * (j + 2) / 4;
  return { total, magnitude: Math.sqrt(total), transverse: Math.sqrt((total - (m / 2) ** 2) / 2) };
}

function ladderStep(j, m, direction) {
  const squared = (j * (j + 2) - m * (m + 2 * direction)) / 4;
  return { from: m, direction, squared, coefficient: Math.sqrt(squared), to: squared ? m + 2 * direction : null };
}

function harmonic(l, m, theta, phi) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const k = Math.abs(m);
  let amplitude;
  if (l === 0) amplitude = 1 / Math.sqrt(4 * Math.PI);
  else if (l === 1) amplitude = k === 0 ? Math.sqrt(3 / (4 * Math.PI)) * c
    : -Math.sqrt(3 / (8 * Math.PI)) * s;
  else if (k === 0) amplitude = Math.sqrt(5 / (16 * Math.PI)) * (3 * c * c - 1);
  else if (k === 1) amplitude = -Math.sqrt(15 / (8 * Math.PI)) * s * c;
  else amplitude = Math.sqrt(15 / (32 * Math.PI)) * s * s;

  // The signed azimuthal phase already performs the conjugation for negative m.
  if (m < 0 && k % 2) amplitude *= -1;
  const angle = m * phi;
  return { re: amplitude * Math.cos(angle), im: amplitude * Math.sin(angle), density: amplitude * amplitude };
}

function orbitalPeak(l, m) {
  const k = Math.abs(m);
  const theta = k === 0 ? 0 : l === 2 && k === 1 ? Math.PI / 4 : Math.PI / 2;
  return harmonic(l, m, theta, 0).density;
}

function orbitalDescription(l, m) {
  const k = Math.abs(m);
  if (l === 0) return "Uniform over the sphere.";
  if (l === 1 && k === 0) return "Density peaks at the poles and vanishes on the equator.";
  if (l === 1) return "Density peaks around the equator and vanishes at both poles.";
  if (k === 0) return "Polar maxima and an equatorial band. Nodal latitudes occur at θ ≈ 54.74° and 125.26°.";
  if (k === 1) return "Two bands peak at θ = 45° and 135°. The poles and equator are nodes.";
  return "A single equatorial band with density proportional to sin⁴θ. Both poles are nodes.";
}

function rotatePath(axis, det) {
  const point = (a, radius) => [180 + radius * Math.sin(rad(a)), 116 - radius * Math.cos(rad(a))];
  const delta = mod(det - axis + 180, 360) - 180;
  const [x, y] = point(axis, 34);
  const [endX, endY] = point(axis + delta, 34);
  return {
    source: "M180 116L" + point(axis, 68).join(" "),
    detector: "M180 116L" + point(det, 78).join(" "),
    arc: delta ? "M" + x + " " + y + "A34 34 0 0 " + (delta > 0 ? 1 : 0) + " " + endX + " " + endY : "",
    separation: Math.abs(delta)
  };
}

function orbitPath(l, m, peak) {
  return Array.from({ length: 361 }, (_, j) => {
    const angle = rad(j);
    const radius = 85 * harmonic(l, m, angle, 0).density / peak;
    return (j === 0 ? "M" : "L") + (180 + radius * Math.sin(angle)).toFixed(3)
      + " " + (120 - radius * Math.cos(angle)).toFixed(3);
  }).join("") + "Z";
}

function newRig(setup = RIG) {
  return { ...setup, plus: 0, minus: 0, latest: null };
}

function newSequence() {
  return { ...SEQUENCE, plus: 0, minus: 0, reject: 0, latest: null };
}

function newLab() {
  return {
    rig: newRig(),
    deck: { j: 1, m: 1 },
    sequence: newSequence(),
    orbital: { ...ORBITAL },
    ladder: { ...LADDER }
  };
}

function makeObservatory(THREE, canvas, viewport, browser) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090e18);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 85);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const world = ([x, y, z]) => v(x, z, -y);
  const zNormal = v(0, 0, 1);

  function mesh(geometry, color, parent = scene, extra = {}) {
    const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, ...extra }));
    parent.add(object);
    return object;
  }

  function box(parent, color, x, y, z, w, h, d) {
    const object = mesh(new THREE.BoxGeometry(w, h, d), color, parent);
    object.position.set(x, y, z);
    return object;
  }

  box(scene, 0x192735, 0, -2.55, 0, 15, 0.16, 6);
  box(scene, 0x24374b, 0, 3.2, -0.7, 13, 0.18, 2.1);
  for (const x of [-5.9, 5.9]) {
    box(scene, 0x4b637c, x, 0.34, -1.65, 0.14, 5.65, 0.14);
    box(scene, 0x233c52, x / 1.8, 1.9, -1.65, 0.05, 2.65, 0.05);
  }

  const rigGroup = new THREE.Group();
  scene.add(rigGroup);
  mesh(new THREE.SphereGeometry(1.58, 28, 16), 0x31485c, rigGroup, { wireframe: true });
  const rings = [0x65b7ff, 0xc19bff, 0xffe16a].map((color, i) => {
    const ring = mesh(new THREE.TorusGeometry(1.78 + i * 0.17, 0.025, 6, 64), color, rigGroup);
    const arrow = new THREE.ArrowHelper(v(0, 1, 0), v(0, 0, 0), 2.25 + i * 0.22, color, 0.26, 0.17);
    rigGroup.add(arrow);
    return { ring, arrow };
  });
  box(rigGroup, 0x65b7ff, -4.7, -0.65, 0.6, 0.68, 0.7, 0.7);
  const channels = [
    box(rigGroup, 0x604a2a, 4.5, 0.9, 0.6, 0.78, 0.63, 0.69),
    box(rigGroup, 0x46355f, 4.5, -0.9, 0.6, 0.78, 0.63, 0.69),
    box(rigGroup, 0x543742, 0.3, -1.95, 0.75, 0.58, 0.44, 0.5)
  ];
  const pulse = mesh(new THREE.SphereGeometry(0.09, 12, 8), 0xffffff, rigGroup);
  const monitor = new THREE.Group();
  rigGroup.add(monitor);
  box(monitor, 0x132034, 3.75, 1.18, -2.2, 4.25, 3.15, 0.13);
  const theoryBars = [0x65b7ff, 0xffe16a].map((color, k) =>
    box(monitor, color, 2.08, 2.13 - k * 0.55, -2.08, 1, 0.19, 0.07));
  const sampleBars = [0x9d82cc, 0xff8da2].map((color, k) =>
    box(monitor, color, 2.08, 1.02 - k * 0.55, -2.08, 1, 0.19, 0.07));

  const galleryGeo = new THREE.SphereGeometry(1, 48, 32);
  const gallery = mesh(galleryGeo, 0xffffff);
  gallery.material.vertexColors = true;
  gallery.frustumCulled = false;
  const position = galleryGeo.attributes.position;
  const unit = Float32Array.from(position.array);
  const vertexColors = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
  galleryGeo.setAttribute("color", vertexColors);
  const color = new THREE.Color();
  let priorShape = "";

  const deckGroup = new THREE.Group();
  scene.add(deckGroup);
  box(deckGroup, 0x1b253b, 0, 0.24, -0.55, 6.3, 4.8, 0.32);
  const rungs = Array.from({ length: 5 }, (_, i) =>
    box(deckGroup, 0x47627b, 0, i * 0.77 - 1.3, 0.4, 4.4, 0.15, 0.13));
  let viewSize = "";

  function setBars(bars, values) {
    bars.forEach((bar, k) => {
      const w = values ? 3.3 * values[k] : 0;
      bar.visible = w > 0;
      bar.scale.x = w;
      bar.position.x = 2.08 + w / 2;
    });
  }

  function drawOrbit(model) {
    const { l, m } = model;
    const key = l + ":" + Math.abs(m);
    if (key === priorShape) return;
    priorShape = key;
    const peak = orbitalPeak(l, m);
    for (let j = 0; j < position.count; j += 1) {
      const x = unit[3 * j];
      const y = unit[3 * j + 1];
      const z = unit[3 * j + 2];
      const theta = Math.acos(clamp(y, -1, 1));
      const rho = harmonic(l, m, theta, 0).density / peak;
      const radius = 0.16 + 2.12 * rho;
      position.setXYZ(j, x * radius, y * radius, z * radius);
      color.setHSL(0.71 - 0.23 * rho, 0.82, 0.3 + 0.33 * rho);
      vertexColors.setXYZ(j, color.r, color.g, color.b);
    }
    position.needsUpdate = true;
    vertexColors.needsUpdate = true;
  }

  return {
    draw(frame, cameraMode, angle, progress) {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height) return;
      const aspect = width / height;
      const pixels = Math.min(browser.devicePixelRatio || 1, 1.5, 1500 / Math.max(width, height));
      const key = width + ":" + height + ":" + pixels;
      if (key !== viewSize) {
        renderer.setPixelRatio(pixels);
        renderer.setSize(width, height, false);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        viewSize = key;
      }

      const inside = cameraMode === "inside";
      const orbit = rad(angle + (inside ? -18 : 0));
      const distance = (inside ? 6.3 : 13.7) * Math.max(1, 1.58 / aspect);
      camera.position.set(distance * Math.sin(orbit), inside ? 2.0 : 4.6, distance * Math.cos(orbit));
      camera.lookAt(0, 0, 0);
      rigGroup.visible = Boolean(frame.axes);
      gallery.visible = Boolean(frame.orbital);
      deckGroup.visible = Boolean(frame.state);

      if (frame.axes) {
        rings.forEach(({ ring, arrow }, i) => {
          const axis = frame.axes[i];
          ring.visible = arrow.visible = Boolean(axis);
          if (!axis) return;
          const direction = world(axis).normalize();
          ring.quaternion.setFromUnitVectors(zNormal, direction);
          arrow.setDirection(direction);
        });
        const latest = frame.latest;
        const selected = latest === 1 ? 0 : latest === -1 ? 1 : latest === 0 ? 2 : -1;
        const idle = [0x604a2a, 0x46355f, 0x543742];
        const lit = [0xffe16a, 0xc19bff, 0xff676f];
        channels[2].visible = Boolean(frame.filtered);
        channels.forEach((channel, j) => channel.material.color.setHex(selected === j ? lit[j] : idle[j]));
        setBars(theoryBars, frame.theory);
        setBars(sampleBars, frame.observed);
        pulse.visible = selected >= 0 && progress >= 0 && progress < 1;
        if (pulse.visible) {
          const start = v(-4.7, -0.65, 0.6);
          const end = channels[selected].position;
          const center = v(0.3, 0, 0.6);
          pulse.position.copy(progress < 0.5 ? start.lerp(center, 2 * progress)
            : center.lerp(end, 2 * progress - 1));
        }
      }
      if (frame.orbital) drawOrbit(frame.orbital);
      if (frame.state) {
        const { j, m, previous } = frame.state;
        const allowed = projections(j);
        rungs.forEach((rung, i) => {
          rung.visible = i < allowed.length;
          const rungColor = allowed[i] === m ? 0xffe16a : allowed[i] === previous ? 0x65b7ff : 0x47627b;
          rung.material.color.setHex(rungColor);
          rung.position.y = (i - j / 2) * 0.77 + 0.2;
        });
      }
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

const MISSIONS = {
  align: [
    "rig",
    "Align the Instrument. Orient the detector so its positive channel is certain for the +z source.",
    "Align the positive detector arrow with +z and check P(+)."
  ],
  turn: [
    "rig",
    "Turn the Question. Commit the positive-channel fractions at 60° and 120°, then sample both setups.",
    "Use the cosine of half the detector angle for the overlap amplitude."
  ],
  track: [
    "sequence",
    "The Three-Detector Puzzle. Predict the negative final fraction for each denominator.",
    "Multiply the middle pass probability by the conditional final probability to get the fraction of all those sent."
  ],
  missing: [
    "deck",
    "Find the Missing Component. Decide which quantities are sharp in |1,0⟩ along z.",
    "Compare the operator that measures the total squared with the operator that measures one component."
  ],
  lobes: [
    "orbital",
    "Map the Lobes. Identify ℓ and |m| from the hidden angular distribution.",
    "Check the poles, the equator, and any additional nodal latitudes. Opposite signs of m share the same density."
  ],
  climb: [
    "ladder",
    "Climb the Ladder. Predict the first coefficient, reach m = +1 from m = −1 at j = 1, then try raising once more.",
    "Substitute the starting values into √[j(j+1) − m(m+1)]."
  ],
  predict: [
    "rig",
    "Predict Before You Measure. Use a negative source on +z with the detector at 60°.",
    "A negative preparation reverses the two probabilities for the same apparatus angles."
  ]
};

function initialize(root) {
  const document = root.ownerDocument;
  const browser = document.defaultView;
  const cache = new Map();
  const get = id => {
    if (!cache.has(id)) cache.set(id, root.querySelector("#am-" + id));
    return cache.get(id);
  };
  const input = id => get(id).value;
  const set = (id, value) => { get(id).value = String(value); };
  const write = (id, value) => {
    const element = get(id);
    const message = String(value);
    if (element.textContent !== message) element.textContent = message;
  };
  const hide = (id, value) => { get(id).hidden = value; };
  const disable = (id, value) => { get(id).disabled = value; };
  const on = (id, handler, type = "click") => get(id).addEventListener(type, handler);
  const path = (id, value) => get(id).setAttribute("d", value);
  const panels = [...root.querySelectorAll("[data-am-mission]")];
  const motion = browser.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motion.matches || get("effects").checked;
  const exploration = newLab();

  let initialPrediction = true;
  let initialRevealed = false;
  let mission = null;
  let freeStation = "rig";
  let station = "rig";
  let open = false;
  let scene = null;
  let frame = null;
  let ticket = 0;
  let loading = false;
  let graphicsFailed = false;
  let frameRequest = null;
  let pulseStart = null;

  const lab = () => mission?.lab ?? exploration;
  const kind = () => mission?.key;
  const pending = (...keys) => keys.includes(kind()) && !mission.revealed;
  const rigConcealed = () => mission ? pending("turn", "predict") : initialPrediction && !initialRevealed;
  const announce = message => write("lab-status", message);
  const score = message => write("mission-feedback", message);

  function replaceOptions(id, values, selected, label) {
    const select = get(id);
    const same = select.options.length === values.length
      && values.every((value, i) => select.options[i].value === String(value));
    if (!same) {
      const options = values.map(value => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = label(value);
        return option;
      });
      select.replaceChildren(...options);
    }
    set(id, selected);
  }

  function readNumber(id) {
    const element = get(id);
    const value = element.valueAsNumber;
    return element.value !== "" && element.validity.valid && Number.isFinite(value) ? value : null;
  }

  function renderRig(rig) {
    const concealed = rigConcealed();
    const plus = rigProbability(rig);
    const sent = rig.plus + rig.minus;
    const diagram = rotatePath(rig.axis, rig.angle);
    const axes = "Preparation axis " + planarName(rig.axis) + " with " + signName(rig.sign)
      + " source sign. Detector axis " + planarName(rig.angle) + ". Axis separation " + diagram.separation + "°.";
    const latest = rig.latest === null ? "No detector event yet."
      : "Latest event: " + signName(rig.latest) + " channel, " + spinValue(rig.latest) + ".";

    for (const field of ["axis", "sign", "preset", "angle"]) set("rig-" + field, rig[field]);
    write("rig-angle-value", rig.angle + "°");
    get("rig-angle").setAttribute("aria-valuetext", rig.angle + " degrees from positive z");
    path("rig-prep-line", diagram.source);
    path("rig-det-line", diagram.detector);
    path("rig-arc", diagram.arc);
    write("rig-desc", axes + " The preparation arrow is solid and the detector arrow is dashed.");
    write("rig-axis-text", axes);
    hide("opening", Boolean(mission) || !initialPrediction);
    hide("rig-hidden-note", !concealed);
    hide("rig-theory", concealed);
    disable("rig-sample-controls", concealed);
    disable("rig-clear", !sent);
    disable("rig-restore", Boolean(mission));
    for (const field of ["axis", "sign", "preset", "angle"]) {
      disable("rig-" + field, field === "axis" || field === "sign" ? Boolean(mission)
        : kind() === "predict" || pending("turn"));
    }
    for (const [key, probability] of [["plus", plus], ["minus", 1 - plus]]) {
      const frequency = quotient(rig[key], sent);
      write("rig-p-" + key, concealed ? DASH : percent(probability));
      get("rig-" + key + "-meter").value = concealed ? 0 : probability;
      write("rig-n-" + key, rig[key]);
      write("rig-f-" + key, percent(frequency));
      get("rig-bar-" + key).value = frequency ?? 0;
      hide("rig-bar-" + key, !sent);
    }
    write("rig-sent", sent);
    write("rig-latest", latest);
    return {
      axes: [planarAxis(rig.axis), null, planarAxis(rig.angle)],
      axisText: axes,
      theory: concealed ? null : [plus, 1 - plus],
      observed: sent ? [rig.plus / sent, rig.minus / sent] : null,
      latest: rig.latest,
      message: concealed ? "Commit a prediction to open the theory display." : latest
    };
  }

  function renderSequence(track) {
    const model = trackModel(track);
    const concealed = pending("track");
    const passed = track.plus + track.minus;
    const sent = passed + track.reject;
    const source = signName(track.sign) + " on " + axisName(track.source);
    const middle = model.filtered ? "Measure " + axisName(track.middle) + " axis, pass " + signName(track.pass)
      : "Bypassed. The source state reaches the final detector";
    const final = "Measure " + axisName(track.final) + " axis";
    write("seq-source-label", source);
    write("seq-middle-label", middle);
    write("seq-final-label", final);

    for (const field of Object.keys(SEQUENCE)) {
      set("seq-" + field, track[field]);
      disable("seq-" + field, kind() === "track" || (!model.filtered && (field === "middle" || field === "pass")));
    }
    hide("seq-hidden-note", !concealed);
    hide("seq-theory", concealed);
    disable("seq-sample-controls", concealed);
    disable("seq-clear", !sent);
    disable("seq-restore", Boolean(mission));

    const expression = !model.filtered ? "Direct route: 100% proceed with the original source preparation."
      : model.pass === 0 ? "P(pass) = 0%. No particle reaches the final detector, so the conditional experiment is unreachable."
        : "P(pass and final +) = " + percent(model.pass) + " × " + percent(model.conditional[0])
          + " = " + percent(model.sent[0]) + ". P(pass and final −) = " + percent(model.pass)
          + " × " + percent(model.conditional[1]) + " = " + percent(model.sent[1]) + ".";
    write("seq-equation", concealed ? "" : expression);
    write("seq-direct", concealed ? "" : "With no middle measurement, the same final axis predicts "
      + percent(model.direct) + " positive and " + percent(1 - model.direct) + " negative.");
    write("seq-sent", sent);
    write("seq-passed", passed);
    for (const [i, key] of ["plus", "minus", "reject"].entries()) {
      write("seq-p-" + key, concealed ? DASH : percent(model.sent[i]));
      write("seq-n-" + key, track[key]);
      write("seq-f-" + key, percent(quotient(track[key], sent)));
      if (i < 2) {
        write("seq-c-" + key, concealed ? DASH : percent(model.conditional[i]));
        write("seq-q-" + key, percent(quotient(track[key], passed)));
      }
    }

    const event = track.latest;
    let latest = "No particle sent yet.";
    if (event) {
      if (event.result === 0) {
        latest = "Latest particle stopped at the selector after a "
          + signName(event.middle) + " reading on " + axisName(track.middle) + ".";
      } else if (model.filtered) {
        latest = "Latest particle passed in the " + signName(event.middle) + " eigenstate on "
          + axisName(track.middle) + ", then gave " + spinValue(event.result) + " on " + axisName(track.final) + ".";
      } else {
        latest = "Latest particle went directly to " + axisName(track.final) + " and gave " + spinValue(event.result) + ".";
      }
    }
    write("seq-latest", latest);
    return {
      axes: [AXES[track.source], model.filtered ? AXES[track.middle] : null, AXES[track.final]],
      axisText: "Source: " + source + ". Middle: " + middle + ". Final: " + final + ".",
      theory: concealed ? null : model.sent,
      observed: sent ? [track.plus / sent, track.minus / sent] : null,
      latest: event?.result ?? null,
      filtered: model.filtered,
      message: concealed ? "Commit both predictions to open the track ledger." : latest
    };
  }

  function renderDeck(state) {
    const { j, m } = state;
    const info = angularState(j, m);
    const concealed = pending("missing");
    set("deck-j", j);
    replaceOptions("deck-m", projections(j), m, item => fraction(item, true));
    disable("deck-j", Boolean(mission));
    disable("deck-m", Boolean(mission));
    write("deck-ket", ket(j, m) + " along z");
    write("deck-allowed", projections(j).map(item => fraction(item, true)).join(", "));

    for (const key of ["square", "magnitude", "projection", "uncertainty"]) {
      hide("deck-" + key + "-row", concealed);
    }
    write("deck-square", concealed ? DASH : (j === 1 ? "¾" : decimal(info.total, 2)) + " ℏ²");
    write("deck-magnitude", concealed ? DASH : (j === 1 ? "√3/2" : decimal(info.magnitude, 4)) + " ℏ");
    write("deck-projection", concealed ? DASH : fraction(m, true) + " ℏ");
    write("deck-uncertainty", concealed ? DASH : (j === 1 ? "½" : decimal(info.transverse, 4)) + " ℏ");
    write("deck-note", concealed ? "Use this prepared ket to make your prediction."
      : j === 0 ? "The j = 0 singlet has zero magnitude and zero in all three components."
        : "The total and z projection are definite. Each transverse component has nonzero spread.");
    return { state, axisText: "State Deck · z quantization axis.", message: "Prepared " + ket(j, m) + " along z." };
  }

  function renderOrbital(model) {
    const { l, m, theta, phi } = model;
    const peak = orbitalPeak(l, m);
    const at = harmonic(l, m, rad(theta), rad(phi));
    const concealed = pending("lobes");
    const description = orbitalDescription(l, m);
    hide("orb-controls", concealed);
    for (const key of ["l2", "lz", "phase"]) hide("orb-" + key + "-row", concealed);
    if (!concealed) {
      set("orb-l", l);
      replaceOptions("orb-m", Array.from({ length: 2 * l + 1 }, (_, i) => i - l), m,
        value => fraction(2 * value, true));
    }
    disable("orb-l", Boolean(mission));
    disable("orb-m", Boolean(mission));
    set("orb-theta", theta);
    set("orb-phi", phi);
    write("orb-theta-value", theta + "°");
    write("orb-phi-value", phi + "°");
    write("orb-max", decimal(peak, 5) + " sr⁻¹");
    write("orb-half", decimal(peak / 2, 5) + " sr⁻¹");
    write("orb-l2", concealed ? DASH : l * (l + 1) + " ℏ²");
    write("orb-lz", concealed ? DASH : fraction(2 * m, true) + " ℏ");
    write("orb-density", decimal(at.density, 5) + " sr⁻¹");
    write("orb-phase", concealed ? DASH : at.density < 1e-28 ? "Undefined at a node"
      : decimal(mod(Math.round(10 * degrees(Math.atan2(at.im, at.re))), 3600) / 10, 1) + "°");
    write("orb-desc", description + " The meridian radius represents density per steradian, relative to the displayed peak.");
    write("orb-pattern", description + " Changing azimuth leaves this density unchanged.");
    path("orb-profile", orbitPath(l, m, peak));
    path("orb-probe-line", "M180 120L" + (180 + 93 * Math.sin(rad(theta))) + " " + (120 - 93 * Math.cos(rad(theta))));
    return {
      orbital: model,
      axisText: "Orbital angular density about the fixed +z axis.",
      message: concealed ? "Unknown state. " + description
        : "ℓ = " + l + ", m = " + fraction(2 * m, true) + ". " + description
    };
  }

  function renderLadder(state) {
    const { j, m, operation, previous } = state;
    set("ladder-j", j);
    replaceOptions("ladder-m", projections(j), m, item => fraction(item, true));
    disable("ladder-j", Boolean(mission));
    disable("ladder-m", Boolean(mission));
    const locked = kind() === "climb" && !mission.coefficientCommitted;
    disable("raise", locked);
    disable("lower", locked);

    get("rungs").replaceChildren(...projections(j).map(value => {
      const rung = document.createElement("li");
      rung.toggleAttribute("data-current", value === m);
      rung.toggleAttribute("data-previous", value === previous && value !== m);
      rung.textContent = fraction(value, true)
        + (value === m ? " · Current" : value === previous ? " · Previous" : "");
      return rung;
    }));
    write("ladder-ket", "Current state " + ket(j, m) + " along z.");
    let description = "Choose a ladder operation.";
    let note = "The result panel reports the coefficient in units of ℏ.";
    if (operation) {
      const op = operation.direction === 1 ? "J₊" : "J₋";
      const start = op + ket(j, operation.from) + " = ";
      if (operation.to === null) {
        description = start + "0 (zero vector).";
        note = "The endpoint coefficient is 0 ℏ. The original ket remains available for the next operation.";
      } else {
        const factor = Number.isInteger(operation.coefficient) ? String(operation.coefficient)
          : "√" + operation.squared + " ≈ " + decimal(operation.coefficient, 4);
        description = start + "(" + factor + ") ℏ " + ket(j, operation.to) + ".";
        note = "The next application starts from the normalized output ket " + ket(j, operation.to) + ".";
      }
    }
    write("ladder-result", description);
    write("ladder-note", note);
    return { state, axisText: "Projection ladder at fixed j = " + fraction(j) + ".", message: description };
  }

  const renderers = {
    rig: renderRig, deck: renderDeck, sequence: renderSequence,
    orbital: renderOrbital, ladder: renderLadder
  };

  function render() {
    set("station", station);
    disable("station", Boolean(mission));
    for (const place of STATIONS) hide("panel-" + place, place !== station);
    for (const pane of panels) pane.hidden = pane.dataset.amMission !== kind();
    disable("mission-retry", !mission);
    disable("mission-exit", !mission);
    disable("turn-sample-60", kind() !== "turn" || !mission.revealed);
    disable("turn-sample-120", kind() !== "turn" || !mission.revealed);
    disable("climb-predict", kind() !== "climb" || mission.coefficientCommitted);
    disable("climb-check", kind() !== "climb" || !mission.endpoint);
    frame = renderers[station](lab()[station]);
    write("observatory-axes", frame.axisText);
    write("observatory-result", frame.message);
    get("observatory-result").toggleAttribute("data-detected", frame.latest != null);
    if (scene) setRendererMessage();
    drawScene();
  }

  function setRendererMessage() {
    write("renderer", frame.orbital
      ? "Angular density view. A brighter surface and larger radius indicate higher density relative to the peak below. A small central radius keeps the surface visible at nodes."
      : frame.state ? "The illuminated rungs mark the selected projections. The calibrated values are listed below."
        : "The chamber is a schematic. Blue marks the source axis, yellow the active detector axis, and violet the middle axis when used. The upper bars show theory and the lower bars show observed frequencies.");
  }

  function stopPulse() {
    if (frameRequest !== null) browser.cancelAnimationFrame(frameRequest);
    frameRequest = null;
    pulseStart = null;
  }

  function releaseScene() {
    ticket += 1;
    loading = false;
    stopPulse();
    scene?.dispose();
    scene = null;
    hide("viewport", true);
  }

  function drawScene() {
    if (!scene || !frame || document.hidden || reduced() || !open) return;
    const progress = pulseStart === null ? 1 : (browser.performance.now() - pulseStart) / 550;
    try {
      scene.draw(frame, input("camera"), Number(input("orbit")), clamp(progress, 0, 1));
      if (progress < 1 && frameRequest === null) {
        frameRequest = browser.requestAnimationFrame(() => {
          frameRequest = null;
          drawScene();
        });
      } else if (progress >= 1 && pulseStart !== null) {
        stopPulse();
      }
    } catch {
      graphicsFailed = true;
      releaseScene();
      write("renderer", "Three-dimensional graphics are unavailable. The calibrated instruments below are active.");
    }
  }

  async function syncGraphics() {
    write("orbit-value", decimal(Number(input("orbit")), 0) + "°");
    if (!open || reduced() || graphicsFailed) {
      releaseScene();
      write("renderer", reduced()
        ? "Reduced effects. Use the calibrated diagrams and numerical instruments below."
        : "Use the calibrated diagrams and numerical instruments below.");
      return;
    }
    if (document.hidden || loading) return;
    if (scene) {
      drawScene();
      return;
    }

    loading = true;
    const started = ++ticket;
    write("renderer", "Loading the chamber. The calibrated instruments below are active.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (started !== ticket || document.hidden) return;
      scene = makeObservatory(THREE, get("canvas"), get("viewport"), browser);
      hide("viewport", false);
      setRendererMessage();
      drawScene();
    } catch {
      if (started !== ticket) return;
      graphicsFailed = true;
      releaseScene();
      write("renderer", "Three-dimensional graphics are unavailable. The calibrated instruments below are active.");
    } finally {
      if (started === ticket) loading = false;
    }
  }

  function switchStation(place) {
    if (!STATIONS.includes(place)) return;
    stopPulse();
    station = place;
    if (!mission) freeStation = place;
    render();
  }

  function clearRig() {
    lab().rig = newRig(lab().rig);
    stopPulse();
  }

  function changeRig(changes) {
    const rig = lab().rig;
    const physicalChange = ["axis", "sign", "angle"].some(key =>
      Object.hasOwn(changes, key) && changes[key] !== rig[key]);
    Object.assign(rig, changes);
    if (physicalChange) {
      clearRig();
      if (!mission) initialPrediction = false;
      announce("Apparatus updated. The next measurement starts a fresh ensemble.");
    }
    render();
  }

  function measureRig(count) {
    if (rigConcealed()) return null;
    const rig = lab().rig;
    const p = rigProbability(rig);
    let positives = 0;
    for (let k = 0; k < count; k += 1) {
      rig.latest = Math.random() < p ? 1 : -1;
      if (rig.latest === 1) positives += 1;
    }
    rig.plus += positives;
    rig.minus += count - positives;
    if (open && scene) pulseStart = browser.performance.now();
    render();
    announce(count === 1
      ? "Detector recorded " + spinValue(rig.latest) + " in its " + signName(rig.latest) + " channel."
      : "Batch complete. " + positives + " positive and " + (count - positives) + " negative out of " + count + ".");
    return positives;
  }

  function measureTrack(count) {
    if (pending("track")) return;
    const track = lab().sequence;
    const model = trackModel(track);
    const batch = { plus: 0, minus: 0, reject: 0 };
    for (let k = 0; k < count; k += 1) {
      const event = trial(track, model);
      const bank = event.result === 1 ? "plus" : event.result === -1 ? "minus" : "reject";
      batch[bank] += 1;
      track.latest = event;
    }
    for (const key of Object.keys(batch)) track[key] += batch[key];
    if (open && scene) pulseStart = browser.performance.now();
    render();
    announce(count === 1 ? get("seq-latest").textContent
      : "Batch complete. " + batch.reject + " rejected, " + batch.plus + " final positive and " + batch.minus
        + " final negative out of " + count + " sent.");
  }

  function updateBasis(place, key, value) {
    const state = lab()[place];
    if (state[key] === value) return;
    state[key] = value;
    if (!projections(state.j).includes(state.m)) state.m = state.j % 2;
    if (place === "ladder") {
      state.previous = null;
      state.operation = null;
    }
    render();
  }

  function applyLadder(direction) {
    if (kind() === "climb" && !mission.coefficientCommitted) return;
    const state = lab().ladder;
    const operation = ladderStep(state.j, state.m, direction);
    state.operation = operation;
    state.previous = operation.from;
    if (operation.to !== null) state.m = operation.to;
    if (kind() === "climb" && direction === 1 && operation.to === null && state.m === state.j) {
      mission.endpoint = true;
    }
    render();
    announce(get("ladder-result").textContent);
  }

  const missionFields = [
    "turn-60", "turn-120", "track-passed", "track-sent", "missing-answer",
    "lobes-l", "lobes-m", "climb-coefficient", "climb-endpoint",
    "predict-outcomes", "predict-plus", "predict-minus"
  ];

  function loadMission(key, shape) {
    if (key !== "free" && !Object.hasOwn(MISSIONS, key)) return;
    stopPulse();
    mission = null;
    if (key === "free") {
      station = freeStation;
    } else {
      const work = newLab();
      if (key === "missing") work.deck = { j: 2, m: 0 };
      if (key === "predict") work.rig = newRig({ ...RIG, sign: -1 });
      if (key === "climb") work.ladder.m = -2;
      if (key === "lobes") {
        const [l, m] = shape ?? SHAPES[Math.floor(Math.random() * SHAPES.length)];
        Object.assign(work.orbital, { l, m });
      }
      mission = { key, lab: work, revealed: false, coefficientCommitted: false, endpoint: false, records: {} };
      station = MISSIONS[key][0];
    }
    for (const field of missionFields) set(field, "");
    set("mission", key);
    write("mission-goal", mission ? MISSIONS[key][1] : "Free exploration is active.");
    write("mission-hint", mission ? MISSIONS[key][2] : "");
    write("turn-report", "");
    score("");
    announce("");
    render();
  }

  const errorPoints = (predicted, expected) => Math.abs(predicted - 100 * expected);
  const close = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance + 1e-12;
  const allPredicted = (...values) => values.every(value => value !== null);

  on("mission-load", () => loadMission(input("mission")));
  on("mission-retry", () => {
    if (!mission) return;
    const { l, m } = mission.lab.orbital;
    loadMission(mission.key, [l, m]);
  });
  on("mission-exit", () => {
    loadMission("free");
    get("mission-load").focus();
  });

  on("align-check", () => {
    if (kind() !== "align") return;
    const p = rigProbability(lab().rig);
    score((p === 1 ? "Aligned. " : "Align the detector’s positive arrow to the source direction. ")
      + "P(+) = " + percent(p) + ". Positive on +z is certain on a +z detector. Reversing that detector makes its negative channel certain.");
  });

  on("turn-check", () => {
    if (kind() !== "turn") return;
    const predictions = [readNumber("turn-60"), readNumber("turn-120")];
    if (!allPredicted(...predictions)) {
      score("Enter both positive-channel percentages.");
      return;
    }
    const theory = [60, 120].map(angle => rigProbability({ ...lab().rig, angle }));
    mission.revealed = true;
    render();
    score("At 60° the theory is " + percent(theory[0]) + " positive, with "
      + decimal(errorPoints(predictions[0], theory[0])) + " percentage points of error. At 120° it is "
      + percent(theory[1]) + " positive, with " + decimal(errorPoints(predictions[1], theory[1]))
      + " points of error. For +z, square cos(30°) or cos(60°).");
  });

  for (const angle of [60, 120]) {
    on("turn-sample-" + angle, () => {
      if (kind() !== "turn" || !mission.revealed) return;
      lab().rig = newRig({ ...lab().rig, angle, preset: angle === 60 ? "60" : "custom" });
      mission.records[angle] = measureRig(100);
      write("turn-report", [60, 120].filter(key => Object.hasOwn(mission.records, key))
        .map(key => key + "°: " + mission.records[key] + "/100 positive").join(" · ")
        + ". Each frequency comes from a fresh batch.");
    });
  }

  on("track-check", () => {
    if (kind() !== "track") return;
    const a = readNumber("track-passed");
    const b = readNumber("track-sent");
    if (!allPredicted(a, b)) {
      score("Enter one prediction for each denominator.");
      return;
    }
    const model = trackModel(lab().sequence);
    mission.revealed = true;
    render();
    score("Among passed particles, the negative fraction is " + percent(model.conditional[1])
      + " (error " + decimal(errorPoints(a, model.conditional[1])) + " points). Among all sent, it is "
      + percent(model.sent[1]) + " (error " + decimal(errorPoints(b, model.sent[1]))
      + " points). Multiply by the " + percent(model.pass) + " pass rate before using the sent denominator.");
  });

  on("missing-check", () => {
    if (kind() !== "missing") return;
    const answer = input("missing-answer");
    if (!answer) {
      score("Choose which quantities are definite.");
      return;
    }
    mission.revealed = true;
    render();
    score((answer === "pair" ? "Correct. " : "Inspect the z projection and total separately. ")
      + "For |1,0⟩, J² is 2ℏ² and Jz is zero with certainty. Each transverse component has spread ℏ.");
  });

  on("lobes-check", () => {
    if (kind() !== "lobes") return;
    const l = readNumber("lobes-l");
    const m = readNumber("lobes-m");
    if (!allPredicted(l, m) || m > l) {
      score("Enter supported quantum numbers with 0 ≤ |m| ≤ ℓ ≤ 2.");
      return;
    }
    const orbital = lab().orbital;
    mission.revealed = true;
    render();
    score((l === orbital.l && m === Math.abs(orbital.m) ? "Shape matched. " : "Compare with the revealed distribution. ")
      + "ℓ = " + orbital.l + " and |m| = " + Math.abs(orbital.m) + ". " + orbitalDescription(orbital.l, orbital.m)
      + (orbital.m ? " Both signs have the same density and opposite projection eigenvalues." : ""));
  });

  on("climb-predict", () => {
    if (kind() !== "climb" || mission.coefficientCommitted) return;
    const value = readNumber("climb-coefficient");
    if (value === null) {
      score("Enter a coefficient in units of ℏ.");
      return;
    }
    const expected = ladderStep(2, -2, 1).coefficient;
    mission.coefficientCommitted = true;
    render();
    score((close(value, expected, 0.02) ? "Coefficient matched. " : "Compare with the calculated coefficient. ")
      + "The first coefficient is √2 ℏ. Raise to the top using normalized output kets, then try once more.");
    get("raise").focus();
  });

  on("climb-check", () => {
    if (kind() !== "climb" || !mission.endpoint) return;
    const answer = input("climb-endpoint");
    if (!answer) {
      score("Choose an endpoint explanation.");
      return;
    }
    if (lab().ladder.m !== lab().ladder.j) {
      score("Return to the top rung before checking the climb.");
      return;
    }
    score((answer === "coefficient" ? "Climb complete. " : "Look at the squared coefficient. ")
      + "At j = m = 1, j(j+1) − m(m+1) = 2 − 2 = 0. The output is the zero vector. The last valid rung remains m = +1.");
  });

  on("predict-check", () => {
    if (kind() !== "predict") return;
    const sign = input("predict-outcomes");
    const a = readNumber("predict-plus");
    const b = readNumber("predict-minus");
    if (!sign || !allPredicted(a, b) || Math.abs(a + b - 100) > 0.05) {
      score("Choose the possible signs and enter probabilities that total 100%.");
      return;
    }
    const p = rigProbability(lab().rig);
    mission.revealed = true;
    render();
    const matched = sign === "both" && errorPoints(a, p) <= 0.5 && errorPoints(b, 1 - p) <= 0.5;
    score((matched ? "Prediction matched. " : "Compare your prediction with the theory. ")
      + "Both signs can occur. Negative on +z gives " + percent(p) + " positive and " + percent(1 - p)
      + " negative at 60°. Sample independent copies. One outcome establishes only what that particle registered.");
  });

  on("station", () => {
    if (!mission) switchStation(input("station"));
  }, "change");
  on("rig-axis", () => {
    const axis = Number(input("rig-axis"));
    if (mission || !Object.hasOwn(PLANAR_AXES, axis)) return;
    const rig = lab().rig;
    changeRig(rig.preset === "opposite" ? { axis, angle: mod(axis + 180, 360) } : { axis });
  }, "change");
  on("rig-sign", () => {
    const sign = Number(input("rig-sign"));
    if (!mission && [1, -1].includes(sign)) changeRig({ sign });
  }, "change");
  on("rig-preset", () => {
    if (kind() === "predict" || pending("turn")) return;
    const preset = input("rig-preset");
    if (preset === "opposite") changeRig({ preset, angle: mod(lab().rig.axis + 180, 360) });
    else if (["0", "60", "90"].includes(preset)) changeRig({ preset, angle: Number(preset) });
    else if (preset === "custom") changeRig({ preset });
  }, "change");
  on("rig-angle", () => {
    if (kind() === "predict" || pending("turn")) return;
    const angle = readNumber("rig-angle");
    if (angle === null || !Number.isInteger(angle)) return;
    changeRig({ angle, preset: [0, 60, 90].includes(angle) ? String(angle) : "custom" });
  }, "input");
  on("rig-one", () => measureRig(1));
  on("rig-batch", () => measureRig(100));
  on("rig-clear", () => {
    clearRig();
    render();
    announce("Detector counts cleared. Source and axes retained.");
  });

  function resetOpening() {
    if (mission) return;
    exploration.rig = newRig();
    initialPrediction = true;
    initialRevealed = false;
    get("opening").reset();
    hide("opening-retry", true);
    write("opening-feedback", "");
    stopPulse();
    render();
    announce("Opening preparation restored with zero trials.");
  }

  on("rig-restore", resetOpening);
  on("opening-retry", () => {
    resetOpening();
    get("opening-answer").focus();
  });
  on("opening", event => {
    event.preventDefault();
    if (mission || !initialPrediction || !input("opening-answer")) return;
    const p = rigProbability(lab().rig);
    const correct = close(Number(input("opening-answer")), 100 * p, 0.001);
    initialRevealed = true;
    render();
    write("opening-feedback", (correct ? "Correct. " : "Square the overlap amplitude. ")
      + "At 60°, the positive overlap is cos 30° = √3/2, so the split is "
      + percent(p) + " positive and " + percent(1 - p) + " negative. The source is still positive on +z.");
    hide("opening-retry", false);
  }, "submit");

  for (const key of Object.keys(SEQUENCE)) {
    on("seq-" + key, () => {
      if (mission) return;
      const current = lab().sequence;
      const raw = input("seq-" + key);
      const isSign = key === "pass" || key === "sign";
      const value = isSign ? Number(raw) : raw;
      const valid = isSign ? [1, -1].includes(value)
        : key === "route" ? ["filtered", "direct"].includes(value) : Object.hasOwn(AXES, value);
      if (!valid || current[key] === value) return;
      current[key] = value;
      Object.assign(current, { plus: 0, minus: 0, reject: 0, latest: null });
      stopPulse();
      render();
      announce("Track updated. Sent, passed, and branch counts reset.");
    }, "change");
  }
  on("seq-one", () => measureTrack(1));
  on("seq-batch", () => measureTrack(100));
  on("seq-clear", () => {
    Object.assign(lab().sequence, { plus: 0, minus: 0, reject: 0, latest: null });
    stopPulse();
    render();
    announce("Track counts cleared. The route and axes are retained.");
  });
  on("seq-restore", () => {
    if (mission) return;
    exploration.sequence = newSequence();
    stopPulse();
    render();
    announce("Opening track restored: positive on +z, pass positive on +x, measure along +z.");
  });

  for (const place of ["deck", "ladder"]) {
    on(place + "-j", () => {
      const j = Number(input(place + "-j"));
      if (!mission && Number.isInteger(j) && j >= 0 && j <= 4) updateBasis(place, "j", j);
    }, "change");
    on(place + "-m", () => {
      const m = Number(input(place + "-m"));
      if (!mission && projections(lab()[place].j).includes(m)) updateBasis(place, "m", m);
    }, "change");
  }

  on("orb-l", () => {
    if (mission) return;
    const l = Number(input("orb-l"));
    if (![0, 1, 2].includes(l)) return;
    lab().orbital.l = l;
    lab().orbital.m = clamp(lab().orbital.m, -l, l);
    render();
  }, "change");
  on("orb-m", () => {
    if (mission) return;
    const m = Number(input("orb-m"));
    if (!Number.isInteger(m) || Math.abs(m) > lab().orbital.l) return;
    lab().orbital.m = m;
    render();
  }, "change");
  for (const angle of ["theta", "phi"]) {
    on("orb-" + angle, () => {
      const value = readNumber("orb-" + angle);
      if (value === null) return;
      lab().orbital[angle] = value;
      render();
    }, "input");
  }

  on("raise", () => applyLadder(1));
  on("lower", () => applyLadder(-1));
  on("ladder-reset", () => {
    lab().ladder = { ...LADDER, m: kind() === "climb" ? -2 : LADDER.m };
    if (kind() === "climb") {
      mission.coefficientCommitted = false;
      mission.endpoint = false;
      set("climb-coefficient", "");
      set("climb-endpoint", "");
      score("");
    }
    render();
    announce("Ladder reset to the starting ket.");
  });

  on("enter", () => {
    open = true;
    hide("observatory", false);
    hide("enter", true);
    get("enter").setAttribute("aria-expanded", "true");
    get("observatory-title").focus();
    void syncGraphics();
  });
  on("return", () => {
    open = false;
    releaseScene();
    hide("observatory", true);
    hide("enter", false);
    get("enter").setAttribute("aria-expanded", "false");
    get("enter").focus();
  });
  on("camera", () => { void syncGraphics(); }, "change");
  on("orbit", () => { void syncGraphics(); }, "input");
  on("camera-reset", () => {
    set("camera", "overview");
    set("orbit", 0);
    void syncGraphics();
  });
  on("effects", () => { void syncGraphics(); }, "change");
  motion.addEventListener("change", () => { void syncGraphics(); });
  on("canvas", event => {
    event.preventDefault();
    graphicsFailed = true;
    releaseScene();
    write("renderer", "The graphics context was interrupted. Use the calibrated instruments below.");
  }, "webglcontextlost");
  on("canvas", () => {
    graphicsFailed = false;
    void syncGraphics();
  }, "webglcontextrestored");
  if (browser.ResizeObserver) new browser.ResizeObserver(drawScene).observe(get("viewport"));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPulse();
    else if (open) void syncGraphics();
  });
  browser.addEventListener("pagehide", releaseScene);
  browser.addEventListener("pageshow", () => { if (open) void syncGraphics(); });

  const symbols = [...root.querySelectorAll("details[data-am-symbol]")];
  for (const detail of symbols) {
    detail.addEventListener("toggle", () => {
      if (detail.open) root.dataset.amSymbol = detail.dataset.amSymbol;
      else if (root.dataset.amSymbol === detail.dataset.amSymbol) {
        const other = symbols.filter(item => item.open).at(-1);
        if (other) root.dataset.amSymbol = other.dataset.amSymbol;
        else delete root.dataset.amSymbol;
      }
    });
  }

  get("opening").reset();
  set("mission", "free");
  set("camera", "overview");
  set("orbit", 0);
  render();
  for (const prefix of [
    "station", "camera", "opening", "rig", "deck", "seq", "orb", "orb-probe", "ladder", "mission"
  ]) {
    disable(prefix + "-controls", false);
  }
  hide("static-note", true);
}

const root = document.querySelector(".site-main.angular-momentum-lesson");
if (root) initialize(root);