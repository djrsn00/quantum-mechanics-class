const HEIGHT = 2;
const TOLERANCE = 1;
const STRENGTHS = [0, .01, .02, .03, .04, .05, .06, .08, .10, .125, .15, .20, .25, .30, .35];
const METHOD = {
  pert: "First-order perturbation",
  var: "Gaussian Rayleigh quotient",
  wkb: "Leading WKB exponential"
};
const ASSUMPTION = {
  pert: "Static quartic perturbation of a nondegenerate harmonic level. Only the term linear in λ is retained.",
  var: "Normalized full-line Gaussian. The quotient bounds the true ground energy from above. Tails and other observables require their own checks.",
  wkb: "Smooth Gaussian barrier, equal free leads and below-barrier incidence. The estimate keeps the leading tunneling exponential and omits its prefactor."
};
const COLOR = {
  cyan: "#80e9eb", pink: "#ff9cbe", yellow: "#ffe16a", violet: "#c19bff",
  green: "#63f59b", orange: "#ffad6e", ink: "#c9e6da", grid: "#28443f"
};
const DASH = "—";
const fmt = (number, digits = 4) => number.toFixed(digits).replace("-", "−");
const small = number => number.toExponential(2);
const yieldToPage = () => new Promise(resolve => setTimeout(resolve, 0));
const potential = (x, lambda) => x * x / 2 + lambda * x ** 4;
const barrier = (x, w) => HEIGHT * Math.exp(-x * x / (2 * w * w));
const turn = (energy, w) => w * Math.sqrt(2 * Math.log(HEIGHT / energy));
const wave = (x, b) => (b / Math.PI) ** .25 * Math.exp(-b * x * x / 2);

function firstOrder(lambda, n) {
  const base = n + .5;
  const coefficient = .75 * (2 * n * n + 2 * n + 1);
  const shift = lambda * coefficient;
  return { base, coefficient, shift, value: base + shift };
}

function gaussian(lambda, b) {
  const kinetic = b / 4;
  const quadratic = 1 / (4 * b);
  const quartic = 3 * lambda / (4 * b * b);
  return { kinetic, quadratic, quartic, sigma: 1 / Math.sqrt(2 * b), value: kinetic + quadratic + quartic };
}

function integral(fn, a, b, count = 128) {
  const dx = (b - a) / count;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < count; i += 1) sum += (i % 2 ? 4 : 2) * fn(a + i * dx);
  return sum * dx / 3;
}

function wkb(energy, width) {
  const edge = turn(energy, width);
  const action = 2 * integral(theta => {
    const x = edge * Math.sin(theta);
    return Math.sqrt(Math.max(0, 2 * (barrier(x, width) - energy))) * edge * Math.cos(theta);
  }, 0, Math.PI / 2, 256);
  return { edge, action, value: Math.exp(-2 * action) };
}

function oscillatorGrid(lambda, n, limit, step) {
  const intervals = Math.round(2 * limit / step);
  const h = 2 * limit / intervals;
  const diagonal = Float64Array.from({ length: intervals - 1 },
    (_, i) => 1 / (h * h) + potential(-limit + (i + 1) * h, lambda));
  const offSquared = .25 / h ** 4;

  function countBelow(energy) {
    let count = 0;
    let pivot = 1;
    for (let i = 0; i < diagonal.length; i += 1) {
      pivot = diagonal[i] - energy - (i ? offSquared / pivot : 0);
      if (Math.abs(pivot) < 1e-12) pivot = -1e-12;
      if (pivot < 0) count += 1;
    }
    return count;
  }

  let low = 0;
  let high = 1 + firstOrder(lambda, n).value;
  while (countBelow(high) <= n) high *= 2;
  while (high - low > 1e-10) {
    const middle = (low + high) / 2;
    if (countBelow(middle) <= n) low = middle;
    else high = middle;
  }
  return { value: (low + high) / 2, limit, h };
}

function scatteringGrid(energy, width, limit, requestedStep, keepProfile = false) {
  const k = Math.sqrt(2 * energy);
  const count = Math.ceil(2 * limit / requestedStep);
  const h = 2 * limit / count;
  const dt = -h;
  const q = x => 2 * (barrier(x, width) - energy);

  // Start at the right boundary with a unit outgoing wave and arbitrary overall phase.
  let real = 1, imag = 0, du = 0, dv = k;
  const profile = [];
  const stride = Math.ceil(count / 650);
  function rk(u, v, q0, qm, q1) {
    const au = v, av = q0 * u;
    const bu = v + dt * av / 2, bv = qm * (u + dt * au / 2);
    const cu = v + dt * bv / 2, cv = qm * (u + dt * bu / 2);
    const eu = v + dt * cv, ev = q1 * (u + dt * cu);
    return [u + dt * (au + 2 * bu + 2 * cu + eu) / 6, v + dt * (av + 2 * bv + 2 * cv + ev) / 6];
  }
  for (let i = 0; i <= count; i += 1) {
    const x = limit - i * h;
    if (keepProfile && (i % stride === 0 || i === count)) profile.push([x, real * real + imag * imag]);
    if (i === count) break;
    const q0 = q(x), qm = q(x + dt / 2), q1 = q(x + dt);
    [real, du] = rk(real, du, q0, qm, q1);
    [imag, dv] = rk(imag, dv, q0, qm, q1);
  }
  const incoming = ((real + dv / k) ** 2 + (imag - du / k) ** 2) / 4;
  const outgoing = ((real - dv / k) ** 2 + (imag + du / k) ** 2) / 4;
  const value = 1 / incoming;
  return {
    value, reflection: outgoing / incoming, limit, h,
    profile: profile.reverse().map(([x, density]) => [x, density * value])
  };
}

const cache = new Map();

function reference(kind, settings) {
  const key = kind + ":" + JSON.stringify(settings);
  if (cache.has(key)) return cache.get(key);
  const scatter = kind === "wkb";
  const { energy, width, lambda, n } = settings;
  const bounds = scatter ? [7 * width, 9 * width] : [7, 9];
  const steps = scatter ? [.024, .012] : [.008, .004];
  const solve = (limit, h, profile) => scatter ? scatteringGrid(energy, width, limit, h, profile) :
    oscillatorGrid(lambda, n, limit, h);
  const rough = solve(bounds[0], steps[0], false);
  const fine = solve(bounds[0], steps[1], false);
  const wide = solve(bounds[1], steps[1], true);
  const stepChange = Math.abs(rough.value - fine.value);
  const domainChange = Math.abs(fine.value - wide.value);
  const scale = Math.max(1e-9, stepChange, domainChange);
  const flux = scatter ? wide.value + wide.reflection : 1;
  const quality = Number.isFinite(wide.value) && wide.value > 10 * scale &&
    scale / wide.value < .0005 && (!scatter || Math.abs(1 - flux) < 1e-6);
  const result = {
    ...wide, flux, scale, quality,
    detail: "Half-domain L=" + fmt(rough.limit, 2) + ", h≈" + fmt(rough.h, 5) + " → " + fmt(fine.h, 5) +
      " gave |Δ|=" + small(stepChange) + ". Enlarging L to " + fmt(wide.limit, 2) +
      " at h≈" + fmt(wide.h, 5) + " gave |Δ|=" + small(domainChange) + "." +
      (scatter ? " R+T=" + fmt(flux, 7) + "." : "") +
      " Changes are convergence evidence rather than certified error bounds."
  };
  if (cache.size >= 128) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

function refValue(ref) {
  if (!ref) return "Hidden";
  if (!ref.quality) return "Unresolved";
  const digits = Math.max(0, Math.min(7, Math.floor(-Math.log10(ref.scale))));
  return ref.value < 10 ** -digits * 10 ? ref.value.toPrecision(4) : fmt(ref.value, digits);
}

function comparison(estimate, ref) {
  const blank = { absolute: DASH, percent: DASH, verdict: "Inconclusive", numeric: null };
  if (estimate === null || !ref?.quality) return blank;
  const difference = Math.abs(estimate - ref.value);
  if (difference <= 3 * ref.scale) return { ...blank, absolute: "Within refinement scale" };
  const percent = 100 * difference / Math.abs(ref.value);
  const lower = 100 * Math.max(0, difference - ref.scale) / (Math.abs(ref.value) + ref.scale);
  const upper = 100 * (difference + ref.scale) / (Math.abs(ref.value) - ref.scale);
  const digits = Math.max(0, Math.min(6, Math.floor(-Math.log10(ref.scale))));
  return {
    absolute: digits < 3 || difference < 1e-3 ? small(difference) : fmt(difference, digits),
    percent: fmt(percent, 2) + "%",
    numeric: percent,
    verdict: upper <= TOLERANCE ? "Meets 1%" : lower > TOLERANCE ? "Exceeds 1%" : "Inconclusive"
  };
}

const fresh = () => ({ forecast: null, visible: false, ref: null, busy: false });

function initial() {
  return {
    lambda: .10, n: 0, b: 1, blueprint: "gaussian", error: "", best: null, opening: true,
    energy: 1.20, width: 1, x: 0, marks: [null, null], sweep: null,
    pert: fresh(), var: fresh(), wkb: fresh()
  };
}

function chart(canvas, xmin, xmax, ymax, xLabel, yLabel) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.hidden = false;
  const left = 79, right = canvas.width - 27, top = 20, bottom = canvas.height - 58;
  const x = t => left + (right - left) * (t - xmin) / (xmax - xmin);
  const y = t => bottom - (bottom - top) * t / ymax;
  ctx.fillStyle = "#070f15";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "19px ui-monospace, monospace";
  for (let i = 0; i <= 4; i += 1) {
    const tx = xmin + (xmax - xmin) * i / 4;
    const ty = ymax * i / 4;
    ctx.fillStyle = COLOR.grid;
    ctx.fillRect(x(tx), top, 1, bottom - top);
    ctx.fillRect(left, y(ty), right - left, 1);
    ctx.fillStyle = COLOR.ink;
    ctx.textAlign = "center";
    ctx.fillText(String(+tx.toFixed(3)), x(tx), bottom + 23);
    ctx.textAlign = "right";
    ctx.fillText(String(+ty.toFixed(2)), left - 7, y(ty) + 6);
  }
  ctx.textAlign = "center";
  ctx.fillText(xLabel, (left + right) / 2, canvas.height - 9);
  ctx.save();
  ctx.translate(16, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
  ctx.strokeStyle = COLOR.ink;
  ctx.strokeRect(left, top, right - left, bottom - top);
  return { ctx, x, y };
}

function series(min, max, fn, count = 160) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = min + (max - min) * i / count;
    return [t, fn(t)];
  });
}

function line({ ctx, x, y }, points, color, dash = []) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash(dash);
  ctx.beginPath();
  let connected = false;
  for (const [a, b] of points) {
    if (b === null) connected = false;
    else if (connected) ctx.lineTo(x(a), y(b));
    else {
      ctx.moveTo(x(a), y(b));
      connected = true;
    }
  }
  ctx.stroke();
  ctx.restore();
}

function dot({ ctx, x, y }, a, b, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x(a), y(b), 5, 0, Math.PI * 2);
  ctx.fill();
}

const choice = (label, options) => ({ label, options });
const numeric = (label, min, max) => ({ label, min, max });

const missions = {
  gentle: {
    station: "pert", mask: "pert var table manual", lambda: .02, lockOscillator: true,
    objective: "For n = 0 at λ = 0.02, predict the direction and first-order size of the energy shift. Then reveal the numerical comparison.",
    hint: "The perturbation is positive wherever x differs from zero. The harmonic ground state has variance ½ in these units.",
    questions: [choice("Direction", { up: "Higher", down: "Lower", same: "Unchanged" }),
      numeric("Magnitude of the first-order shift / ℏω", 0, 1)]
  },
  "too-far": {
    station: "pert", mask: "", lambda: .01, lockLevel: true,
    objective: "Compute the ground-level error sweep. Increase λ, then report adjacent sampled strengths where first order goes from meeting to exceeding 1%.",
    hint: "Use nearby points with decisive comparisons. The bracket resolves a change between samples without locating an exact threshold.",
    questions: [numeric("Passing sampled λ", 0, .35), numeric("Failing sampled λ", 0, .35)]
  },
  better: {
    station: "var", mask: "manual table", b: .70, lockOscillator: true,
    objective: "Start at b = 0.70. Lower the trial energy at λ = 0.10, identify the tradeoff, and reveal the ground-energy comparison.",
    hint: "Try increasing b a little at a time and compare the three contributions.",
    questions: [choice("What happens to the kinetic and potential contributions as b rises?", {
      trade: "Kinetic rises, potential falls", both: "Both rise", reverse: "Kinetic falls, potential rises"
    })]
  },
  blueprint: {
    station: "var", mask: "var manual table", blueprint: "constant",
    objective: "Diagnose the constant-amplitude blueprint on the full line. Switch to a Gaussian with a valid b and submit the diagnosis before evaluating it.",
    hint: "Imagine doubling the width of the interval over which you integrate the squared amplitude.",
    questions: [choice("Why is the constant blueprint inadmissible?", {
      norm: "Its full-line norm diverges", sign: "Its amplitude has the wrong sign", phase: "Its phase is independent of x"
    })]
  },
  turning: {
    station: "wkb", mask: "turn wkb manual table", lockBarrier: true,
    objective: "Move the scanner to both crossings of U and E and mark them. Classify the center and explain the need for connection formulas.",
    hint: "Use the intersections of the horizontal energy line and the barrier. Either side of the hill is symmetric about x = 0.",
    questions: [choice("Region sequence from left to right", {
      afa: "Allowed, forbidden, allowed", faf: "Forbidden, allowed, forbidden", aaa: "Allowed throughout"
    }), choice("What goes wrong with the simple local amplitude at a crossing?", {
      zero: "Its wave number tends to zero", high: "Its wave number becomes arbitrarily large", none: "The amplitude formula applies without a change"
    })]
  },
  "three-tools": {
    station: "pert", alt: "var", mask: "manual", lockOscillator: true,
    objective: "Open the first-order estimate and compare it with a Gaussian estimate for the same quartic ground energy. Try a b other than 1. Explain how the WKB scanner fits.",
    hint: "Read the observable and units on each instrument. The scanner takes an incident energy as input.",
    questions: [choice("Which two workbenches estimate this bound-state energy?", {
      pv: "Perturbation and variational", pw: "Perturbation and the barrier scanner", vw: "Variational and the barrier scanner"
    }), choice("What does the scanner calculate here?", {
      t: "Transmission probability at a specified incident energy", e: "A discrete oscillator level"
    })]
  },
  mystery: {
    station: "pert", alt: "var", mask: "pert var manual table", lambda: .18, lockOscillator: true,
    objective: "The workbench shows a quartic oscillator, λ = 0.18. Choose the tool that guarantees an upper bound on the true ground energy and forecast that energy in ℏω.",
    hint: "A bound can follow from the spectral weights of an admissible trial state.",
    questions: [choice("Tool with an upper-bound guarantee", {
      pert: METHOD.pert, var: METHOD.var, wkb: METHOD.wkb
    }), numeric("Forecast of ground energy / ℏω", 0, 4)]
  },
  tolerance: {
    station: "var", mask: "pert manual table", lockOscillator: true,
    objective: "At λ = 0.10, tune an admissible Gaussian, then commit a numerical forecast for the ground energy. Reveal the reference and check both the forecast and the chosen Gaussian against 1%.",
    hint: "Start near b = 1.20 and compare trial energies while the reference is hidden. Their spread gives a way to refine your estimate.",
    questions: [numeric("Forecast of ground energy / ℏω", 0, 4)]
  },
  report: {
    station: "wkb", alt: "table", mask: "",
    objective: "Commit a transmission forecast, calculate the WKB estimate, reveal the reference, and pin a run. Open its report on the comparison table, then identify the checks behind it. You can revise the barrier and file another report.",
    hint: "The report should name the observable and explain how the numerical result was checked.",
    questions: [choice("Which evidence checks a stationary-scattering reference?", {
      both: "Step refinement, lead enlargement, and R + T",
      only: "Agreement with WKB alone",
      trial: "The width of a Gaussian oscillator trial"
    })]
  }
};

function workshop(THREE, canvas, viewport) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 65);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#071119");
  scene.fog = new THREE.Fog("#071119", 18, 36);
  scene.add(new THREE.HemisphereLight("#d2eeff", "#304357", 2));
  const light = new THREE.DirectionalLight("#f0fbff", 2);
  light.position.set(0, 9, 6);
  scene.add(light);
  const resources = new Set();
  const plotted = new THREE.Group();
  scene.add(plotted);
  const grid = new THREE.GridHelper(14, 28, "#325965", "#223a46");
  resources.add(grid.geometry);
  resources.add(grid.material);
  scene.add(grid);

  function box(x, y, z, sx, sy, sz, color, emissive = false) {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    const material = new THREE.MeshStandardMaterial({
      color, roughness: .65, metalness: .25, emissive: emissive ? color : "#000000", emissiveIntensity: .55
    });
    resources.add(geometry);
    resources.add(material);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    scene.add(object);
  }

  box(0, -.21, 0, 15, .35, 12, "#172936");
  box(0, 1.6, -5.8, 15, 3.6, .30, "#253946");
  for (const [x, accent] of [[-5.5, COLOR.cyan], [-2, COLOR.pink], [2, COLOR.orange], [5.5, COLOR.violet]]) {
    box(x, .55, -4.2, 2.5, 1.05, 1.8, "#3a5264");
    box(x, 1.2, -4.45, 2.25, .23, 1.31, accent, true);
    box(x, 2.1, -5.59, 2.1, .75, .09, "#0c1e29");
    box(x, 2.52, -5.53, 2.1, .055, .10, accent, true);
  }
  box(0, .11, .5, 12, .19, 4.2, "#213e4c");

  function clearPlot() {
    while (plotted.children.length) {
      const object = plotted.children[0];
      plotted.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    }
  }

  function track(points, color, dashed = false) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: .15, gapSize: .10 }) :
      new THREE.LineBasicMaterial({ color });
    const object = new THREE.Line(geometry, material);
    if (dashed) object.computeLineDistances();
    plotted.add(object);
  }

  function surface(profile, vertical) {
    const vertices = [];
    for (let i = 1; i < profile.length; i += 1) {
      const [a, pa] = profile[i - 1], [b, pb] = profile[i];
      const ya = vertical(pa), yb = vertical(pb);
      vertices.push(a, ya, -.8, a, ya, .8, b, yb, .8, a, ya, -.8, b, yb, .8, b, yb, -.8);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.MeshBasicMaterial({
      color: COLOR.cyan, opacity: .28, transparent: true, side: THREE.DoubleSide, depthWrite: false
    });
    plotted.add(new THREE.Mesh(geometry, material));
  }

  let previous = "";
  return {
    draw(config, side, focus) {
      const size = viewport.getBoundingClientRect();
      if (size.width < 2 || size.height < 2) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1550 / size.width, 900 / size.height);
      const width = Math.round(size.width * ratio), height = Math.round(size.height * ratio);
      if (canvas.width !== width || canvas.height !== height) renderer.setSize(width, height, false);
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
      const distance = Math.max(1, 1.35 / camera.aspect);
      if (side) camera.position.set(focus, 2.2, 13 * distance);
      else camera.position.set(focus + 6.1, 7 * distance, 10 * distance);
      camera.lookAt(focus, 1.15, 0);
      const key = JSON.stringify(config);
      if (key !== previous) {
        previous = key;
        clearPlot();
        const y = value => .26 + value * config.scale;
        surface(config.profile, y);
        track(config.profile.map(([x, u]) => [x, y(u), .83]), COLOR.cyan);
        for (const [level, color, z] of config.levels) {
          track([[-config.extent, y(level), z], [config.extent, y(level), z]], color, true);
        }
        for (const [x, u, color] of config.markers) {
          track([[x, .27, .98], [x, y(u) + .5, .98]], color, true);
        }
        if (config.extra) track(config.extra.map(([x, value]) => [x, .30 + value, 1.24]), COLOR.pink);
      }
      renderer.render(scene, camera);
    },
    dispose() {
      clearPlot();
      for (const resource of resources) resource.dispose();
      renderer.dispose();
    }
  };
}

function initialize(root) {
  const get = id => document.getElementById("am-" + id);
  const set = (id, value) => { get(id).value = value; };
  const text = (id, value) => { get(id).textContent = String(value); };
  const hide = (id, value) => { get(id).hidden = Boolean(value); };
  const disable = (id, value) => { get(id).disabled = Boolean(value); };
  const on = (id, callback, event = "click") => get(id).addEventListener(event, callback);
  const say = message => get("status").replaceChildren(document.createTextNode(message));
  const all = selector => Array.from(root.querySelectorAll(selector));
  const make = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  const panels = all("[data-am-station]");
  const deck = all("[data-am-deck]");
  const masks = all("[data-am-answer]");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(pointer: coarse) and (max-width: 64rem)");
  const reduced = () => motion.matches || get("effects").checked;
  const runs = [];
  const revealedRuns = new Map();
  const pendingRuns = new Set();
  let nextRun = 1, nextTicket = 1, reportId = null;
  const free = initial();
  let ticket = null, station = "pert", landscape = "pert";
  let inside = false, side = false, focus = 0;
  let scene = null, graphicsToken = 0, loading = false, sceneFailed = false, frame = null;

  const lab = () => ticket?.state ?? free;
  const pending = key => ticket?.key === key && !ticket.committed;
  const opening = () => lab().opening && !lab().pert.visible;
  const masked = key => Boolean(ticket && !ticket.committed && ticket.def.mask.split(" ").includes(key)) ||
    (opening() && (key === "var" || key === "manual"));
  const settings = (state, method) => method === "wkb" ? { energy: state.energy, width: state.width } :
    { lambda: state.lambda, n: method === "var" ? 0 : state.n };
  const estimate = (state, method) => method === "wkb" ? wkb(state.energy, state.width).value :
    method === "var" ? gaussian(state.lambda, state.b).value : firstOrder(state.lambda, state.n).value;
  const validTrial = state => state.blueprint === "gaussian";
  const forecastLabel = (forecast, method) => {
    if (!forecast) return "No forecast committed.";
    const { direction, value } = forecast;
    const amount = value === null ? "" : fmt(value, method === "wkb" ? 5 : 6) + (method === "wkb" ? "" : " ℏω");
    return [direction, amount].filter(Boolean).join(" · ");
  };
  const heldReference = method => Boolean(ticket && !ticket.committed &&
    (method === "wkb" ? pending("turning") : ["gentle", "better", "blueprint", "mystery", "tolerance"].includes(ticket.key)));
  const estimateOpen = method => !masked(method) && (method === "var" ? validTrial(lab()) : lab()[method].visible);
  const toleranceLine = label => label === "Inconclusive" ? "The numerical evidence is inconclusive at 1%." :
    label + " of the reference value.";

  function rememberTrial() {
    const state = lab();
    if (!validTrial(state) || masked("var")) return;
    const value = gaussian(state.lambda, state.b).value;
    if (!state.best || value < state.best.value) state.best = { b: state.b, value };
  }

  function syncComparison(method, current) {
    const entry = lab()[method];
    const ref = masked(method) || heldReference(method) || (method === "var" && !validTrial(lab())) ? null : entry.ref;
    const result = comparison(current, ref);
    text(method + "-ref", entry.busy ? "Calculating…" : refValue(ref));
    text(method + "-abs", result.absolute);
    text(method + "-percent", result.percent);
    text(method + "-evidence", entry.busy ? "Checking refinement and domain…" : !ref ?
      "Reveal the numerical reference to inspect its convergence evidence." :
      ref.detail + (!ref.quality ? " The reference did not pass the reliability checks." :
        result.absolute === "Within refinement scale" ? " The difference is comparable to refinement changes. Error scoring is inconclusive." :
          result.numeric !== null && result.verdict === "Inconclusive" ? " The refinement scale overlaps the 1% decision." : ""));
    return ref;
  }

  function svgPart(tag, attrs, value) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, val);
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function drawOscillator(state, model, ref, showEstimate) {
    const limits = [potential(2, state.lambda), model.base, showEstimate ? model.value : 0, ref?.quality ? ref.value : 0];
    const ymax = Math.max(2, Math.ceil(Math.max(...limits) * 1.08));
    const x = t => 340 + 134 * t;
    const y = t => 252 - 240 * t / ymax;
    const parts = [];
    const path = (d, cls) => svgPart("path", { d, class: cls });
    const label = (a, b, value, anchor = "middle") => svgPart("text", { x: a, y: b, "text-anchor": anchor }, value);
    for (let i = 0; i <= 4; i += 1) {
      const level = ymax * i / 4;
      parts.push(path("M72 " + y(level) + "h536", "am-gridlines"),
        label(62, y(level) + 5, +level.toFixed(2), "end"), label(x(i - 2), 274, i - 2));
      if (i > 0 && i < 4) parts.push(path("M" + x(i - 2) + " 12v240", "am-gridlines"));
    }
    parts.push(path("M72 12v240h536", "am-axis"), label(340, 296, "Scaled position x"),
      svgPart("text", { x: 21, y: 132, "text-anchor": "middle", transform: "rotate(-90 21 132)" }, "Energy / ℏω"));
    const curve = lambda => series(-2, 2, t => potential(t, lambda), 100).map(([a, b]) =>
      x(a).toFixed(2) + " " + y(b).toFixed(2)).join(" L");
    parts.push(path("M" + curve(0), "am-curve am-original"), path("M" + curve(state.lambda), "am-curve am-modified"));
    parts.push(path("M72 " + y(model.base) + "h536", "am-curve am-base"));
    if (showEstimate) parts.push(path("M72 " + y(model.value) + "h536", "am-curve am-est"));
    if (ref?.quality) parts.push(path("M72 " + y(ref.value) + "h536", "am-curve am-ref"));
    get("pert-ink").replaceChildren(...parts);
    hide("pert-key-est", !showEstimate);
    hide("pert-key-ref", !ref?.quality);
    const description = "At x = ±2, the modified potential is " + fmt(limits[0], 3) +
      " ℏω. The unperturbed n = " + state.n + " level is " + fmt(model.base) + " ℏω." +
      (showEstimate ? " First order: " + fmt(model.value) + " ℏω." : "") +
      (ref?.quality ? " Numerical reference: " + refValue(ref) + " ℏω." : "");
    text("pert-description", description);
    text("pert-plot-desc", description);
  }

  function renderPert() {
    const state = lab(), entry = state.pert, model = firstOrder(state.lambda, state.n);
    const shown = estimateOpen("pert");
    set("lambda", state.lambda);
    text("lambda-value", fmt(state.lambda, 3));
    set("level", state.n);
    text("e0", fmt(model.base));
    text("e1", shown ? fmt(model.coefficient) : DASH);
    text("shift", shown ? fmt(model.shift) : DASH);
    text("pert-value", shown ? fmt(model.value) : DASH);
    text("pert-forecast-state", forecastLabel(entry.forecast, "pert"));
    const ref = syncComparison("pert", shown ? model.value : null);
    const canCompare = !masked("pert") && !heldReference("pert");
    disable("pert-estimate", masked("pert") || (opening() && !entry.forecast) || shown);
    disable("pert-reference", !canCompare || !shown || entry.busy || Boolean(ref));
    disable("pert-pin", !shown);
    disable("sweep", !canCompare || opening() || Boolean(state.sweep?.busy));
    hide("worked", !shown || state.lambda !== .10 || state.n !== 0);
    drawOscillator(state, model, ref, shown);
    const ground = state.var.ref ?? (state.n === 0 ? ref : null);
    const firstRef = ref ?? (state.n === 0 ? ground : null);
    let status = state.opening ? "Opening ticket tolerance is 1% of the reference ground energy." :
      "Compare first order at the selected level using a 1% tolerance.";
    if (firstRef && shown) status += " First order: " + toleranceLine(comparison(model.value, firstRef).verdict);
    if (ground && !masked("var") && state.n === 0 && state.best) {
      status += " Best Gaussian at b = " + fmt(state.best.b, 3) + ": " + toleranceLine(comparison(state.best.value, ground).verdict);
    }
    if (ground && state.n === 0 && entry.forecast?.value != null && shown) {
      status += " Your forecast: " + toleranceLine(comparison(entry.forecast.value, ground).verdict);
    }
    text("ticket-status", status);
    renderSweep(state.sweep);
  }

  function renderSweep(sweep) {
    const rows = sweep?.rows ?? [];
    const visible = rows.length > 0 && !masked("pert");
    hide("sweep-table", !visible);
    hide("error-plot", !visible);
    text("sweep-state", sweep?.busy ? "Computing " + rows.length + " of " + STRENGTHS.length + " reference points…" :
      visible ? "Level n = " + sweep.n + ". Dots are resolved samples. The dashed line is the 1% tolerance. Unresolved differences are omitted from the plot." :
        "The sweep checks the selected level against independent reference calculations.");
    if (!visible) return;
    get("sweep-rows").replaceChildren(...rows.map(({ lambda, ref, result }) => {
      const row = make("tr");
      const heading = make("th", fmt(lambda, 3));
      heading.scope = "row";
      row.append(heading, make("td", refValue(ref)), make("td", result.absolute),
        make("td", result.percent + " · " + result.verdict), make("td", ref.detail));
      return row;
    }));
    const ymax = Math.max(1.25, ...rows.map(row => (row.result.numeric ?? 0) * 1.08));
    const plot = chart(get("error-plot"), 0, .35, ymax, "Quartic strength λ", "Error (%)");
    if (plot) {
      line(plot, [[0, TOLERANCE], [.35, TOLERANCE]], COLOR.yellow, [8, 6]);
      line(plot, rows.map(row => [row.lambda, row.result.numeric]), COLOR.pink);
      for (const row of rows) if (row.result.numeric !== null) dot(plot, row.lambda, row.result.numeric, COLOR.pink);
    }
  }

  function renderVar() {
    const state = lab(), entry = state.var;
    const valid = validTrial(state);
    const shown = estimateOpen("var");
    const trial = shown ? gaussian(state.lambda, state.b) : null;
    set("var-lambda", state.lambda);
    text("var-lambda-value", fmt(state.lambda, 3));
    set("blueprint", state.blueprint);
    set("b", state.b);
    text("b-value", fmt(state.b, 3));
    disable("b", !valid || (ticket?.key === "tolerance" && ticket.committed));
    const ref = syncComparison("var", trial?.value ?? null);
    disable("var-reference", !shown || heldReference("var") || entry.busy || Boolean(ref));
    disable("var-pin", !shown);
    text("var-forecast-state", forecastLabel(entry.forecast, "var"));
    text("blueprint-state", state.error || (valid ?
      "Gaussian available. The display crops the full-line state to −6 ≤ x ≤ 6." :
      pending("blueprint") ? "Blueprint held for diagnosis. Select a replacement before evaluation." :
        "A nonzero full-line constant has infinite squared norm. No energy is evaluated."));
    for (const key of ["sigma", "kinetic", "quadratic", "quartic"]) text(key, trial ? fmt(trial[key], 6) : DASH);
    text("var-value", trial ? fmt(trial.value, 6) : DASH);
    text("best", shown && state.best ? fmt(state.best.value, 6) + " at b = " + fmt(state.best.b, 3) : DASH);
    hide("var-plot", !shown);
    text("var-description", !shown ? "A valid evaluated Gaussian is required to draw this profile." :
      "The positive wavefunction peaks at " + fmt(wave(0, state.b), 4) + " at x = 0 and tends to zero in both tails.");
    if (shown) {
      const peak = wave(0, state.b);
      const plot = chart(get("var-plot"), -6, 6, 1.13 * Math.max(peak, peak ** 2), "Scaled position x", "ψ and |ψ|²");
      if (plot) {
        line(plot, series(-6, 6, x => wave(x, state.b)), COLOR.cyan);
        line(plot, series(-6, 6, x => wave(x, state.b) ** 2), COLOR.pink, [11, 6]);
      }
    }
  }

  function renderWkb() {
    const state = lab(), entry = state.wkb;
    const { energy, width, x, marks } = state;
    const u = barrier(x, width), edge = turn(energy, width);
    const conceal = masked("turn");
    const shown = estimateOpen("wkb");
    const model = shown ? wkb(energy, width) : null;
    const ref = syncComparison("wkb", model?.value ?? null);
    for (const [id, value] of [["incident", energy], ["barrier-width", width], ["scanner", x]]) {
      set(id, value);
      text(id + "-value", fmt(value, 2));
    }
    hide("markers", !pending("turning"));
    hide("marks", !pending("turning"));
    hide("turn-key", conceal);
    text("marks", marks.map((position, i) => (i ? "Right: " : "Left: ") +
      (position === null ? "unmarked" : fmt(position, 2))).join(" · "));
    const allowed = u < energy;
    const near = Math.abs(u - energy) < .025;
    const k = Math.sqrt(2 * Math.abs(energy - u));
    text("turns", conceal ? DASH : fmt(-edge, 4) + ", " + fmt(edge, 4));
    text("local-u", conceal ? DASH : fmt(u));
    text("region", conceal ? DASH : near ? "Turning region" : allowed ? "Allowed" : "Forbidden");
    text("wave-number", conceal || near ? DASH : (allowed ? "k = " : "κ = ") + fmt(k));
    const anchor = allowed ? Math.sign(x) * edge : -edge;
    const interval = !conceal && !near ?
      Math.abs(integral(a => Math.sqrt(2 * Math.abs(energy - barrier(a, width))), anchor, x)) : null;
    text("local-integral", interval === null ? DASH : (allowed ? "Phase from adjacent crossing: " : "Action from left crossing: ") + fmt(interval));
    text("local-guide", conceal || near ? DASH : fmt(Math.abs(x * u / (width ** 2 * k ** 3)), 4));
    text("local-note", near ? "Turning-point caution. The local wave number is small. Use connection formulas in this region." :
      "The local guide measures variation on the wave scale. A small value is favorable away from a turning point.");
    text("wkb-description", "Incident energy " + fmt(energy, 2) + " ℏω. Scanner x = " + fmt(x, 2) +
      (conceal ? "." : ". Turning points " + fmt(-edge, 3) + " and " + fmt(edge, 3) +
        ". The outer regions are allowed and the central region is forbidden."));
    const plot = chart(get("wkb-plot"), -5, 5, 2.2, "Scaled position x", "Energy / ℏω");
    if (plot) {
      line(plot, series(-5, 5, a => barrier(a, width)), COLOR.cyan);
      line(plot, [[-5, energy], [5, energy]], COLOR.yellow, [6, 6]);
      line(plot, [[x, 0], [x, u]], COLOR.green);
      dot(plot, x, u, COLOR.green);
      if (!conceal) for (const a of [-edge, edge]) dot(plot, a, energy, COLOR.orange);
    }
    text("action", model ? fmt(model.action, 5) : DASH);
    text("wkb-value", model ? (model.value < .001 ? small(model.value) : fmt(model.value, 6)) : DASH);
    text("reflection", ref?.quality ? fmt(ref.reflection, 6) : refValue(ref));
    text("wkb-forecast-state", forecastLabel(entry.forecast, "wkb"));
    disable("wkb-estimate", masked("wkb") || shown || (ticket?.key === "report" && !entry.forecast));
    disable("wkb-reference", !shown || heldReference("wkb") || entry.busy || Boolean(ref));
    disable("wkb-pin", !shown);
    const profile = ref?.quality ? ref.profile : null;
    hide("scattering-profile", !profile?.length);
    if (profile?.length) {
      const ymax = Math.max(1, ...profile.map(point => point[1])) * 1.08;
      const density = chart(get("scattering-plot"), -ref.limit, ref.limit, ymax, "Scaled position x", "|ψ|²");
      if (density) line(density, profile, COLOR.violet);
      text("scattering-description", "Unit incident amplitude. The left lead combines incident and reflected waves. Far to the right, the density is T = " +
        refValue(ref) + ". Profile shown on |x| ≤ " + fmt(ref.limit, 2) + ".");
    }
  }

  function render() {
    for (const panel of masks) panel.hidden = masked(panel.dataset.amAnswer);
    const state = lab();
    const def = ticket?.def;
    const trialLocked = ticket?.key === "tolerance" && ticket.committed;
    disable("lambda", def?.lockOscillator);
    disable("var-lambda", def?.lockOscillator);
    disable("level", def?.lockLevel || def?.lockOscillator);
    disable("pert-reset", Boolean(def));
    disable("incident", def?.lockBarrier);
    disable("barrier-width", def?.lockBarrier);
    disable("wkb-reset", def?.lockBarrier);
    disable("var-reset", trialLocked);
    disable("blueprint", trialLocked);
    disable("var-b-controls", !validTrial(state) || trialLocked);
    renderPert();
    renderVar();
    renderWkb();
    drawScene();
  }

  function schedule() {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      render();
    });
  }

  function setupChange(key, value) {
    const state = lab();
    if (!Number.isFinite(value) || state[key] === value) return;
    state[key] = value;
    if (key === "lambda" || key === "n") {
      state.opening = false;
      state.pert = fresh();
      get("pert-forecast").reset();
      if (key === "lambda") {
        state.var = fresh();
        get("var-forecast").reset();
        state.best = null;
      } else state.sweep = null;
      rememberTrial();
    } else {
      state.wkb = fresh();
      state.marks = [null, null];
      get("wkb-forecast").reset();
    }
    schedule();
  }

  function applyB(value) {
    const state = lab();
    if (!validTrial(state) || (ticket?.key === "tolerance" && ticket.committed)) return;
    if (!Number.isFinite(value) || value < .2 || value > 4) {
      state.error = "Choose a finite b from 0.20 to 4.00. The last valid trial and best-energy record are unchanged.";
      text("blueprint-state", state.error);
      say(state.error);
      return;
    }
    state.error = "";
    state.b = value;
    set("b-input", value);
    rememberTrial();
    schedule();
  }

  function afterReference(method, state) {
    if (!ticket?.committed || ticket.state !== state ||
      (ticket.def.station !== method && !(ticket.key === "mystery" && method === "var"))) return "";
    const ref = state[method].ref;
    const model = comparison(estimate(state, method), ref);
    const forecast = state[method].forecast;
    let message = "Numerical reference: " + refValue(ref) + (method === "wkb" ? "." : " ℏω.") +
      " Method comparison: " + toleranceLine(model.verdict);
    if (ticket.key === "tolerance") {
      const result = comparison(forecast?.value ?? null, ref);
      message = "Your forecast: " + toleranceLine(result.verdict) + " Gaussian estimate: " + toleranceLine(model.verdict) +
        " " + (result.verdict === "Inconclusive" || model.verdict === "Inconclusive" ?
          "The numerical comparison does not resolve both verdicts." : "The refinement check distinguishes both verdicts at the selected tolerance.");
    } else if (ticket.key === "gentle" && ref.quality) {
      message += " The numerical shift from 0.5000 ℏω is approximately " + fmt(ref.value - .5, 5) + " ℏω.";
    }
    text("mission-evidence", message);
    return " " + message;
  }

  async function reveal(method) {
    const state = lab(), entry = state[method];
    if (entry.busy || entry.ref || !estimateOpen(method) || heldReference(method)) return;
    entry.busy = true;
    render();
    await yieldToPage();
    if (lab() !== state || state[method] !== entry) {
      entry.busy = false;
      return;
    }
    entry.ref = reference(method === "wkb" ? "wkb" : "energy", settings(state, method));
    entry.busy = false;
    render();
    say((entry.ref.quality ? "Numerical reference revealed. " : "Reference comparison is unresolved. ") +
      METHOD[method] + "." + afterReference(method, state));
  }

  async function sweep() {
    const state = lab();
    if (state.sweep?.busy) return;
    const current = { n: state.n, busy: true, rows: [] };
    state.sweep = current;
    render();
    for (const lambda of STRENGTHS) {
      await yieldToPage();
      if (lab() !== state || state.sweep !== current) {
        current.busy = false;
        return;
      }
      const ref = reference("energy", { lambda, n: current.n });
      current.rows.push({ lambda, ref, result: comparison(firstOrder(lambda, current.n).value, ref) });
      if (current.rows.length % 4 === 0) renderSweep(current);
    }
    current.busy = false;
    render();
    say("Error sweep complete for level " + current.n + ". " +
      current.rows.filter(row => row.result.numeric !== null).length + " of " + current.rows.length + " comparisons have resolved errors.");
  }

  function button(label, callback) {
    const node = make("button", label);
    node.type = "button";
    node.addEventListener("click", callback);
    return node;
  }

  function pin(method) {
    if (!estimateOpen(method)) return;
    const state = lab(), entry = state[method];
    const run = Object.freeze({
      id: nextRun++, method, settings: Object.freeze(settings(state, method)),
      b: method === "var" ? state.b : null, forecast: entry.forecast, estimate: estimate(state, method),
      ref: heldReference(method) ? null : entry.ref, ticket: ticket?.id
    });
    runs.push(run);
    renderTable();
    say("Run " + run.id + " pinned to the comparison table.");
  }

  const runRef = run => revealedRuns.get(run.id) ?? run.ref;
  const runParams = run => run.method === "wkb" ? "Uᵦ = 2, E = " + fmt(run.settings.energy, 2) +
    " ℏω, w = " + fmt(run.settings.width, 2) + " ℓ" :
    "λ = " + fmt(run.settings.lambda, 3) + ", n = " + run.settings.n + (run.b === null ? "" : ", b = " + fmt(run.b, 4));

  function renderReport() {
    const run = runs.find(item => item.id === reportId);
    hide("report", !run);
    if (!run) return;
    const ref = runRef(run);
    const result = comparison(run.estimate, ref);
    const fields = {
      Model: run.method === "wkb" ? "Gaussian barrier with equal free leads" : "One-dimensional quartic oscillator",
      Parameters: runParams(run),
      Observable: run.method === "wkb" ? "Transmission at the stated incident energy" : "Discrete bound-state energy",
      Units: run.method === "wkb" ? "dimensionless probability" : "ℏω",
      Method: METHOD[run.method],
      Assumptions: ASSUMPTION[run.method],
      "Learner forecast": forecastLabel(run.forecast, run.method),
      "Calculated estimate": fmt(run.estimate, 6),
      "Numerical reference": refValue(ref),
      "Absolute error": result.absolute,
      "Percentage error": result.percent,
      "Verdict at 1%": ref ? toleranceLine(result.verdict) : "Reference hidden",
      "Numerical evidence": ref ? ref.detail + (ref.quality ? "" : " Reliability check failed.") : "Reveal this saved run to see its evidence."
    };
    text("report-title", "Repair report · run " + run.id);
    get("report-fields").replaceChildren(...Object.entries(fields).map(([key, value]) => {
      const field = make("div");
      field.append(make("dt", key), make("dd", value));
      return field;
    }));
  }

  function renderTable() {
    hide("empty-runs", runs.length > 0);
    disable("clear-runs", runs.length === 0);
    const groups = new Map();
    for (const run of runs) {
      const key = run.method === "wkb" ? "Transmission at the labeled barrier settings · probability" :
        "Bound-state energy / ℏω · n = " + run.settings.n + ", λ = " + fmt(run.settings.lambda, 3);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(run);
    }
    get("saved-energy").replaceChildren();
    get("saved-transmission").replaceChildren();
    for (const [title, group] of groups) {
      const wrapper = make("div", undefined, "am-scroll");
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", title);
      const table = make("table");
      const head = make("thead"), heading = make("tr"), body = make("tbody");
      for (const name of ["Run and parameters", "Forecast", "Estimate", "Reference", "Abs. error", "Error %", "Actions"]) {
        const cell = make("th", name);
        cell.scope = "col";
        heading.append(cell);
      }
      head.append(heading);
      for (const run of group) {
        const ref = runRef(run), row = make("tr");
        const label = make("th", "#" + run.id + " · " + METHOD[run.method] + " · " + runParams(run));
        label.scope = "row";
        const result = comparison(run.estimate, ref);
        const actions = make("td");
        const tools = make("div", undefined, "am-actions");
        const open = button("Open report", () => {
          reportId = run.id;
          if (ticket && ticket.id === run.ticket) ticket.opened.add(run.id);
          renderReport();
          get("report-title").focus();
          say("Report for run " + run.id + " opened.");
        });
        const remove = button("Remove", () => {
          runs.splice(runs.indexOf(run), 1);
          revealedRuns.delete(run.id);
          if (reportId === run.id) reportId = null;
          renderTable();
          get("table-title").focus();
          say("Run " + run.id + " removed.");
        });
        open.setAttribute("aria-label", "Open report for run " + run.id);
        remove.setAttribute("aria-label", "Remove run " + run.id);
        tools.append(open, remove);
        if (!ref) {
          const inspect = button(pendingRuns.has(run.id) ? "Calculating…" : "Reveal reference", async () => {
            pendingRuns.add(run.id);
            renderTable();
            await yieldToPage();
            pendingRuns.delete(run.id);
            if (!runs.includes(run)) return;
            revealedRuns.set(run.id, reference(run.method === "wkb" ? "wkb" : "energy", run.settings));
            renderTable();
            get("table-title").focus();
            say("Numerical comparison for saved run " + run.id + " opened.");
          });
          inspect.disabled = pendingRuns.has(run.id);
          inspect.setAttribute("aria-label", "Reveal numerical reference for saved run " + run.id);
          tools.append(inspect);
        }
        actions.append(tools);
        row.append(label, make("td", forecastLabel(run.forecast, run.method)), make("td", fmt(run.estimate, 6)),
          make("td", refValue(ref)), make("td", result.absolute), make("td", result.percent), actions);
        body.append(row);
      }
      table.append(make("caption", title), head, body);
      wrapper.append(table);
      get(group[0].method === "wkb" ? "saved-transmission" : "saved-energy").append(wrapper);
    }
    renderReport();
  }

  function startMission(key) {
    ticket = null;
    get("mission-form").reset();
    for (const method of Object.keys(METHOD)) get(method + "-forecast").reset();
    if (key !== "free") {
      const def = missions[key], state = initial();
      state.opening = false;
      for (const prop of ["lambda", "b", "blueprint"]) if (def[prop] !== undefined) state[prop] = def[prop];
      ticket = { id: nextTicket++, key, def, state, committed: false, opened: new Set() };
      const name = get("mission").selectedOptions[0].textContent;
      text("mission-title", name);
      text("active-mission", name);
      text("mission-objective", def.objective);
      text("mission-hint", def.hint);
      text("mission-feedback", "");
      text("mission-evidence", "");
      text("mission-station", "Open " + METHOD[def.station]);
      if (def.alt) text("mission-alt", def.alt === "table" ? "Open comparison table" : "Open " + METHOD[def.alt]);
      hide("mission-alt", !def.alt);
      get("mission-help").open = false;
      get("mission-questions").replaceChildren(...def.questions.map((question, i) => {
        const label = make("label", question.label);
        const field = make(question.options ? "select" : "input");
        field.name = "answer-" + i;
        field.required = true;
        if (question.options) {
          field.add(new Option("Choose an answer", ""));
          for (const [value, name] of Object.entries(question.options)) field.add(new Option(name, value));
        } else {
          field.type = "number";
          field.inputMode = "decimal";
          field.min = question.min;
          field.max = question.max;
          field.step = "any";
        }
        label.append(field);
        return label;
      }));
      get("missions").before(get("mission-dock"));
    }
    set("b-input", lab().b);
    hide("mission-case", !ticket);
    hide("mission-dock", !ticket);
    disable("mission-submit", false);
    disable("mission-exit", !ticket);
    disable("mission-retry", !ticket);
    rememberTrial();
    render();
    get(ticket ? "mission-title" : "mission").focus();
  }

  function assess(values) {
    const { key, state, opened, id } = ticket;
    const [a, b] = values;
    if (key === "gentle") {
      const shift = firstOrder(state.lambda, state.n).shift;
      state.pert.forecast = {
        direction: a === "up" ? "Higher" : a === "down" ? "Lower" : "Unchanged",
        value: .5 + Number(b) * (a === "down" ? -1 : a === "same" ? 0 : 1)
      };
      state.pert.visible = true;
      return {
        right: a === "up" && Math.abs(Number(b) - shift) <= .001,
        detail: "First order raises the level by " + fmt(shift) + " ℏω. The scoring window is ±0.001 ℏω. Open the reference to check the true shift numerically."
      };
    }
    if (key === "too-far") {
      if (!state.sweep || state.sweep.busy) return { wait: "Compute the full error sweep first." };
      const rows = state.sweep.rows;
      const index = rows.findIndex(row => Math.abs(row.lambda - Number(a)) < .00001);
      const upper = rows[index + 1];
      const right = index >= 0 && upper && Math.abs(upper.lambda - Number(b)) < .00001 &&
        rows[index].result.verdict === "Meets 1%" && upper.result.verdict === "Exceeds 1%";
      if (right && state.lambda + 1e-10 < upper.lambda) return { wait: "Increase the live strength to at least your failing sample." };
      const crossing = rows.findIndex((row, i) => i > 0 && row.result.verdict === "Exceeds 1%" &&
        rows[i - 1].result.verdict === "Meets 1%");
      return {
        right,
        detail: crossing > 0 ? "Resolved sampled bracket: λ = " + fmt(rows[crossing - 1].lambda, 3) +
          " (" + rows[crossing - 1].result.percent + ") to " + fmt(rows[crossing].lambda, 3) +
          " (" + rows[crossing].result.percent + "). This bracket is for n = 0 at 1%." :
          "The sweep did not resolve a decisive adjacent bracket. The ticket remains inconclusive."
      };
    }
    if (key === "better") {
      if (!validTrial(state) || !state.best || state.best.value >= gaussian(state.lambda, .70).value - 1e-6) {
        return { wait: "Use an admissible Gaussian and lower the energy from the b = 0.70 baseline." };
      }
      return {
        right: a === "trade",
        detail: "Kinetic energy rises as b increases. The quadratic and quartic energies fall. Your best energy is " +
          fmt(state.best.value, 6) + " ℏω. Reveal the numerical reference to compare."
      };
    }
    if (key === "blueprint") {
      if (!validTrial(state)) return { wait: "Select a valid Gaussian replacement before submitting." };
      return { right: a === "norm", detail: "A nonzero constant has divergent norm on the full line. The replacement Gaussian has finite norm and finite energy." };
    }
    if (key === "turning") {
      if (state.marks.some(value => value === null)) return { wait: "Use the scanner to mark both crossings." };
      const edge = turn(state.energy, state.width);
      return {
        right: a === "afa" && b === "zero" && state.marks.every((x, i) => Math.abs(x - (i ? edge : -edge)) <= .06),
        detail: "The crossings are " + fmt(-edge, 4) + " and " + fmt(edge, 4) +
          ". The position tolerance is 0.06 in scaled x. The center is forbidden, both leads are allowed, and k or κ vanishes at a crossing."
      };
    }
    if (key === "three-tools") {
      if (!state.pert.visible || !validTrial(state) || Math.abs(state.b - 1) < .001) {
        return { wait: "Reveal first order and try a Gaussian with b different from 1." };
      }
      return {
        right: a === "pv" && b === "t",
        detail: "First order gives " + fmt(estimate(state, "pert"), 6) +
          " ℏω and your Gaussian gives " + fmt(estimate(state, "var"), 6) +
          " ℏω for the same ground-state energy. This WKB scanner returns a transmission probability for a different Hamiltonian."
      };
    }
    if (key === "mystery" || key === "tolerance") {
      if (!validTrial(state)) return { wait: "Select a valid Gaussian before submitting." };
      state.var.forecast = { value: Number(key === "tolerance" ? a : b) };
      return {
        right: key === "mystery" ? a === "var" : null,
        detail: key === "mystery" ?
          "An admissible Rayleigh quotient gives the ground-energy upper bound. Your numerical forecast is recorded separately. Open the reference in the Design Bay." :
          "Forecast committed. Reveal the reference from the Design Bay to resolve the forecast and method verdicts."
      };
    }
    const ready = runs.some(run => run.ticket === id && run.method === "wkb" &&
      run.forecast?.value != null && runRef(run) && opened.has(run.id));
    return ready ? {
      right: a === "both",
      detail: "The report compares independent numerical evidence: step refinement, longer leads, and flux conservation. Revise the setup and pin a new run to compare reports."
    } : { wait: "File and open a transmission report with a committed forecast, calculated estimate, and revealed reference." };
  }

  function submitMission(event) {
    event.preventDefault();
    if (!ticket || ticket.committed) return;
    const data = new FormData(event.currentTarget);
    const result = assess(ticket.def.questions.map((_, i) => data.get("answer-" + i)));
    if (!result.wait) {
      ticket.committed = true;
      for (const field of get("mission-questions").querySelectorAll("input, select")) field.disabled = true;
      disable("mission-submit", true);
      rememberTrial();
      render();
      get("mission-station").focus();
    }
    const feedback = result.wait ?? ((result.right === null ? "" :
      result.right ? "Decision accepted. " : "Review the evidence and reset the experiment to retry. ") + result.detail);
    text("mission-feedback", feedback);
    say(feedback);
  }

  function activate(key, focusHeading = false) {
    station = key;
    if (["pert", "var", "wkb"].includes(key)) landscape = key;
    for (const panel of panels) panel.toggleAttribute("data-am-active", panel.dataset.amStation === station);
    for (const button of deck) button.setAttribute("aria-pressed", String(button.dataset.amDeck === station));
    if (ticket && key !== "missions") get(key).before(get("mission-dock"));
    if (focusHeading) get(key + "-title").focus();
    drawScene();
  }

  function drawScene() {
    if (!inside || document.hidden) return;
    const state = lab(), model = firstOrder(state.lambda, state.n);
    const config = {
      extent: 2, scale: 2.8 / Math.max(2, potential(2, state.lambda)), markers: [],
      profile: series(-2, 2, x => potential(x, state.lambda), 80), levels: []
    };
    let info;
    if (landscape === "wkb") {
      config.extent = 5;
      config.scale = 1.48;
      config.profile = series(-5, 5, x => barrier(x, state.width), 100);
      config.levels.push([state.energy, COLOR.yellow, 1.12]);
      config.markers.push([state.x, barrier(state.x, state.width), COLOR.green]);
      info = "Cyan: Gaussian barrier. Dashed yellow: incident energy " + fmt(state.energy, 2) + " ℏω. Green: scanner.";
      if (!masked("turn")) {
        const edge = turn(state.energy, state.width);
        config.markers.push([-edge, state.energy, COLOR.orange], [edge, state.energy, COLOR.orange]);
        info += " Orange: turning points " + fmt(-edge, 3) + " and " + fmt(edge, 3) + ".";
      }
      if (estimateOpen("wkb")) info += " Leading WKB transmission: " + fmt(estimate(state, "wkb"), 6) + ".";
      if (state.wkb.ref?.quality && !heldReference("wkb")) {
        info += " Numerical T = " + refValue(state.wkb.ref) + ". Its unit-incident density is plotted below.";
      }
    } else {
      const method = landscape;
      const shown = estimateOpen(method);
      const ref = shown && !heldReference(method) ? state[method].ref : null;
      config.levels.push([method === "pert" ? model.base : .5, COLOR.yellow, 1.04]);
      info = "Cyan: quartic potential. Dashed yellow: unperturbed level.";
      if (shown) {
        const value = estimate(state, method);
        config.levels.push([value, COLOR.pink, 1.2]);
        info += " Dashed pink: " + METHOD[method] + ", " + fmt(value, 6) + " ℏω.";
        if (method === "var") {
          config.extra = series(-2, 2, x => wave(x, state.b), 80);
          info += " Solid pink near the floor: Gaussian amplitude on a separate vertical scale.";
        }
      }
      if (ref?.quality) {
        config.levels.push([ref.value, COLOR.violet, 1.4]);
        info += " Dashed violet: numerical reference " + refValue(ref) + " ℏω.";
      }
    }
    text("scene-summary", info);
    if (!scene || reduced()) return;
    try {
      scene.draw(config, side, focus);
    } catch {
      graphicsFailed();
    }
  }

  function releaseScene() {
    graphicsToken += 1;
    loading = false;
    hide("viewport", true);
    scene?.dispose();
    scene = null;
  }

  function graphicsFailed() {
    sceneFailed = true;
    releaseScene();
    text("renderer", "3D is unavailable. Use the same instruments, tickets, and reports in 2D below.");
  }

  async function updateGraphics() {
    if (!inside || reduced() || sceneFailed) {
      releaseScene();
      if (!sceneFailed) text("renderer", reduced() ? "Reduced effects. The lab is active in 2D." : "The instruments below are active.");
      drawScene();
      return;
    }
    if (document.hidden || loading) return;
    if (scene) {
      drawScene();
      return;
    }
    loading = true;
    const token = ++graphicsToken;
    text("renderer", "Loading the landscape. The 2D instruments are ready.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (token !== graphicsToken || document.hidden) return;
      scene = workshop(THREE, get("world"), get("viewport"));
      hide("viewport", false);
      text("renderer", "Landscape active. The plots and instruments describe the same underlying model.");
      drawScene();
    } catch {
      if (token === graphicsToken) graphicsFailed();
    } finally {
      if (token === graphicsToken) loading = false;
    }
  }

  for (const [id, key] of [["lambda", "lambda"], ["var-lambda", "lambda"], ["incident", "energy"], ["barrier-width", "width"]]) {
    on(id, event => setupChange(key, event.target.valueAsNumber), "input");
  }
  on("level", event => setupChange("n", Number(event.target.value)), "change");
  on("b", event => applyB(event.target.valueAsNumber), "input");
  on("var-b-form", event => {
    event.preventDefault();
    applyB(get("b-input").valueAsNumber);
  }, "submit");
  on("blueprint", event => {
    lab().blueprint = event.target.value;
    lab().error = "";
    rememberTrial();
    render();
  }, "change");
  on("scanner", event => {
    lab().x = event.target.valueAsNumber;
    schedule();
  }, "input");
  ["left", "right"].forEach((position, i) => on("mark-" + position, () => {
    lab().marks[i] = lab().x;
    renderWkb();
    say(position + " crossing marked at " + fmt(lab().x, 2) + ".");
  }));

  for (const method of Object.keys(METHOD)) {
    on(method + "-forecast", event => {
      event.preventDefault();
      const field = get(method + "-guess");
      const direction = method === "pert" ? get("pert-direction").selectedOptions[0]?.textContent : undefined;
      if ((field.value && !Number.isFinite(field.valueAsNumber)) || (method !== "pert" && !field.value)) return;
      lab()[method].forecast = { direction, value: field.value ? field.valueAsNumber : null };
      render();
      say("Forecast committed. " + forecastLabel(lab()[method].forecast, method));
    }, "submit");
    on(method + "-reference", () => void reveal(method));
    on(method + "-pin", () => pin(method));
  }

  for (const method of ["pert", "wkb"]) on(method + "-estimate", () => {
    if (masked(method) || (method === "pert" && opening() && !lab().pert.forecast)) return;
    lab()[method].visible = true;
    rememberTrial();
    render();
    if (!get(method + "-reference").disabled) get(method + "-reference").focus();
    say(METHOD[method] + " estimate revealed: " + fmt(estimate(lab(), method), 6) + (method === "wkb" ? "." : " ℏω."));
  });

  on("pert-reset", () => {
    const reset = initial();
    Object.assign(free, {
      lambda: reset.lambda, n: reset.n, b: reset.b, blueprint: reset.blueprint,
      error: "", best: null, opening: true, pert: reset.pert, var: reset.var, sweep: null
    });
    set("b-input", free.b);
    get("pert-forecast").reset();
    get("var-forecast").reset();
    render();
    say("Opening oscillator restored.");
  });
  on("var-reset", () => {
    const state = lab();
    state.b = ticket?.def.b ?? 1;
    state.blueprint = ticket?.def.blueprint ?? "gaussian";
    state.error = "";
    state.var = fresh();
    get("var-forecast").reset();
    set("b-input", state.b);
    rememberTrial();
    render();
    say("Trial controls reset. The best valid trial for this Hamiltonian is retained.");
  });
  on("wkb-reset", () => {
    Object.assign(lab(), { energy: 1.20, width: 1, x: 0, marks: [null, null], wkb: fresh() });
    get("wkb-forecast").reset();
    render();
    say("Barrier and scanner restored.");
  });
  on("sweep", () => void sweep());
  on("clear-runs", () => {
    runs.length = 0;
    revealedRuns.clear();
    reportId = null;
    renderTable();
    get("table-title").focus();
    say("Saved runs cleared.");
  });

  on("mission-start", () => startMission(get("mission").value));
  on("mission-retry", () => {
    set("mission", ticket.key);
    startMission(ticket.key);
  });
  on("mission-exit", () => {
    set("mission", "free");
    startMission("free");
  });
  on("mission-station", () => activate(ticket.def.station, true));
  on("mission-alt", () => activate(ticket.def.alt, true));
  on("dock-return", () => activate("missions", true));
  on("mission-form", submitMission, "submit");

  on("check-form", event => {
    event.preventDefault();
    if (!get("check").value) return;
    const feedback = (get("check").value === "var" ? "Correct. " : "Try again. ") +
      "An admissible variational expectation averages exact energy levels with nonnegative weights, so it cannot fall below the true ground energy.";
    text("check-feedback", feedback);
    say(feedback);
  }, "submit");
  on("check-reset", () => {
    get("check-form").reset();
    text("check-feedback", "");
    get("check").focus();
  });
  for (const link of all('a[href^="#"]')) link.addEventListener("click", () => {
    const target = document.getElementById(link.hash.slice(1));
    const panel = target?.closest("[data-am-station]");
    if (panel) activate(panel.dataset.amStation);
    if (link.closest("[data-am-symbol]") && target) {
      for (const node of all("[data-am-highlight]")) node.removeAttribute("data-am-highlight");
      target.setAttribute("data-am-highlight", "");
      setTimeout(() => target.removeAttribute("data-am-highlight"), 2500);
    }
  });
  for (const button of deck) button.addEventListener("click", () => activate(button.dataset.amDeck, true));

  function camera() {
    set("camera-position", focus);
    text("camera-position-value", fmt(focus, 1));
    get("side").setAttribute("aria-pressed", String(side));
    text("side", side ? "Overview" : "Side view");
    drawScene();
  }
  on("enter", () => {
    inside = true;
    root.dataset.amView = "shop";
    hide("shop", false);
    get("enter").setAttribute("aria-expanded", "true");
    activate(station);
    get("shop-title").focus();
    void updateGraphics();
  });
  on("return", () => {
    inside = false;
    delete root.dataset.amView;
    hide("shop", true);
    get("enter").setAttribute("aria-expanded", "false");
    releaseScene();
    get("enter").focus();
  });
  on("side", () => { side = !side; camera(); });
  on("camera-reset", () => { side = false; focus = 0; camera(); });
  on("camera-position", event => { focus = event.target.valueAsNumber; camera(); }, "input");
  on("effects", () => void updateGraphics(), "change");
  motion.addEventListener("change", () => void updateGraphics());
  on("world", event => { event.preventDefault(); graphicsFailed(); }, "webglcontextlost");
  on("world", () => { sceneFailed = false; void updateGraphics(); }, "webglcontextrestored");
  if (window.ResizeObserver) new ResizeObserver(drawScene).observe(get("viewport"));
  else window.addEventListener("resize", drawScene);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && inside) void updateGraphics();
  });
  window.addEventListener("pagehide", releaseScene);
  window.addEventListener("pageshow", () => { if (inside) void updateGraphics(); });

  get("effects").checked = mobile.matches;
  set("mission", "free");
  set("b-input", free.b);
  activate("pert");
  render();
  renderTable();
  for (const id of ["camera-controls", "pert-controls", "pert-forecast-controls", "pert-actions", "var-controls",
    "var-forecast-controls", "var-actions", "wkb-controls", "wkb-forecast-controls", "wkb-actions",
    "table-controls", "mission-controls", "check-controls", "enter"]) disable(id, false);
  for (const button of deck) button.disabled = false;
  hide("static-note", true);
}

const lesson = document.querySelector(".approximation-lesson");
if (lesson) initialize(lesson);