const DEFAULT_SETUP = { source: "plus-z", mode: "single", a: 0, b: 0, pass: "plus" };

const PRESETS = {
  direct: DEFAULT_SETUP,
  puzzle: { ...DEFAULT_SETUP, mode: "sequence", a: 90 },
  repeat: { ...DEFAULT_SETUP, mode: "sequence", a: 90, b: 90, pass: "minus" }
};

const SOURCES = {
  "plus-z": { angle: 0, ket: "|+z⟩" },
  "minus-z": { angle: 180, ket: "|−z⟩" },
  "plus-x": { angle: 90, ket: "|+x⟩" }
};

const BRANCHES = ["plus", "minus"];
const SIGN = { plus: "+", minus: "−" };
const ALIGNED_AXES = { 0: "+z", 90: "+x", 180: "−z" };

function opposite(branch) {
  return branch === "plus" ? "minus" : "plus";
}

function spinProbabilities(separation) {
  // These three cases have exact probabilities. For all other settings,
  // the cosine is the dot product of the two unit directions.
  let plus;
  if (separation === 0) plus = 1;
  else if (separation === 90) plus = 0.5;
  else if (separation === 180) plus = 0;
  else plus = (1 + Math.cos(separation * Math.PI / 180)) / 2;

  return { plus, minus: 1 - plus };
}

function theoryFor(setup) {
  const separationA = Math.abs(SOURCES[setup.source].angle - setup.a);
  const a = spinProbabilities(separationA);
  if (setup.mode === "single") return { separationA, a };

  const axisDifference = Math.abs(setup.a - setup.b);
  const separationB = setup.pass === "plus" ? axisDifference : 180 - axisDifference;
  const b = spinProbabilities(separationB);
  const passed = a[setup.pass];

  return {
    separationA,
    a,
    separationB,
    b,
    passed,
    blocked: a[opposite(setup.pass)],
    perSource: { plus: passed * b.plus, minus: passed * b.minus }
  };
}

function pickBranch(plus, random) {
  if (plus === 1) return "plus";
  if (plus === 0) return "minus";
  return random() < plus ? "plus" : "minus";
}

function freshCounts() {
  return { sent: 0, a: { plus: 0, minus: 0 }, b: { plus: 0, minus: 0 }, last: null };
}

function checkCounts(counts, setup) {
  const allA = counts.a.plus + counts.a.minus;
  const allB = counts.b.plus + counts.b.minus;
  const expectedB = setup.mode === "sequence" ? counts.a[setup.pass] : 0;

  if (allA !== counts.sent || allB !== expectedB) {
    throw new Error("The simulated atom counts do not balance.");
  }
}

function sampleBatch(size, setup, theory, random = Math.random) {
  const batch = freshCounts();
  batch.sent = size;

  for (let index = 0; index < size; index++) {
    const a = pickBranch(theory.a.plus, random);
    const reachesB = setup.mode === "sequence" && a === setup.pass;
    const b = reachesB ? pickBranch(theory.b.plus, random) : null;
    batch.a[a]++;
    if (b !== null) batch.b[b]++;
    batch.last = { a, b };
  }

  checkCounts(batch, setup);
  return batch;
}

function percent(probability) {
  if (probability === 0) return "0%";
  if (probability === 1) return "100%";
  const value = 100 * probability;
  if (value < 0.01) return "<0.01%";
  if (value > 99.99) return ">99.99%";
  return String(Number(value.toFixed(2))) + "%";
}

function frequency(count, total) {
  return total === 0 ? "—" : percent(count / total);
}

function axisLabel(angle) {
  const axis = ALIGNED_AXES[angle];
  return axis ? angle + "° (" + axis + ")" : angle + "°";
}

function describeRoute(last, setup) {
  if (setup.mode === "single") {
    return "The atom reached A" + SIGN[last.a] + " at " + SIGN[last.a] + "ℏ/2.";
  }
  if (last.b === null) {
    return "The atom went into A" + SIGN[last.a] + " and was blocked at the selector.";
  }
  return "The atom passed through A" + SIGN[last.a] + " and reached B" + SIGN[last.b]
    + " at " + SIGN[last.b] + "ℏ/2.";
}

function initializeLab(root) {
  const find = id => root.querySelector("#spin-" + id);
  const write = (id, value) => { find(id).textContent = value; };
  const source = find("source");
  const mode = find("mode");
  const pass = find("pass");
  const angles = { a: find("angle-a"), b: find("angle-b") };
  const modePanels = root.querySelectorAll("[data-spin-show]");
  const diagrams = root.querySelectorAll(".spin-diagram");
  const prediction = find("prediction");
  const challenge = find("challenge");

  let setup = { ...DEFAULT_SETUP };
  let theory = theoryFor(setup);
  let counts = freshCounts();
  let unlocked = false;
  let question = "angle";

  function renderRoutes() {
    const active = new Set();
    if (counts.last !== null) {
      const { a, b } = counts.last;
      active.add("input");
      active.add("a-" + a);
      if (setup.mode === "sequence") {
        if (b === null) {
          active.add("block-" + a);
        } else {
          active.add("pass-" + a);
          active.add("b-" + b);
        }
      }
    }

    for (const diagram of diagrams) {
      const visible = diagram.dataset.spinShow === setup.mode;
      for (const path of diagram.querySelectorAll("[data-spin-route]")) {
        path.toggleAttribute("data-spin-active", visible && active.has(path.dataset.spinRoute));
      }
    }

    write("last-route", counts.last === null
      ? "Last simulated atom — none sent."
      : "Last simulated atom. " + describeRoute(counts.last, setup));
  }

  function renderCounts() {
    write("sent", counts.sent);
    for (const sign of BRANCHES) {
      const count = counts.a[sign];
      write("a-" + sign + "-count", count);
      write("a-" + sign + "-observed", frequency(count, counts.sent));
    }

    if (setup.mode === "sequence") {
      const passed = counts.a[setup.pass];
      const blocked = counts.a[opposite(setup.pass)];
      write("passed", passed);
      write("blocked", blocked);
      write("blocked-count", blocked);
      write("blocked-observed", frequency(blocked, counts.sent));

      for (const sign of BRANCHES) {
        const count = counts.b[sign];
        write("b-" + sign + "-count", count);
        write("b-" + sign + "-observed", frequency(count, counts.sent));
        write("b-" + sign + "-passed-observed", frequency(count, passed));
      }

      write("accounting", counts.sent + " sent = " + blocked + " blocked + " + passed
        + " passed. " + passed + " passed = " + counts.b.plus + " B+ + " + counts.b.minus + " B−.");
    }

    renderRoutes();
  }

  function renderSetup() {
    source.value = setup.source;
    mode.value = setup.mode;
    pass.value = setup.pass;

    for (const axis of ["a", "b"]) {
      angles[axis].value = setup[axis];
      find("arrow-" + axis)?.setAttribute("transform", "rotate(" + setup[axis] + " 40 40)");
    }

    for (const panel of modePanels) {
      panel.toggleAttribute("hidden", panel.dataset.spinShow !== setup.mode);
    }

    const aLabel = axisLabel(setup.a);
    const beam = SOURCES[setup.source].ket;
    const singleDescription = "A is at " + aLabel + " and reads the " + beam
      + " preparation. Circles mark positive end detectors and squares mark negative end detectors.";
    const singleTitle = find("single-description");
    if (singleTitle) singleTitle.textContent = singleDescription;

    write("a-summary", "At A, the separation angle is " + theory.separationA
      + "°. Of all atoms sent, " + percent(theory.a.plus) + " are predicted in A+ and "
      + percent(theory.a.minus) + " in A−.");

    for (const sign of BRANCHES) {
      write("a-" + sign + "-model", percent(theory.a[sign]));
    }

    if (setup.mode === "single") {
      write("route-summary", singleDescription);
    } else {
      const selected = "A" + SIGN[setup.pass];
      const rejected = "A" + SIGN[opposite(setup.pass)];
      const description = beam + " enters A at " + aLabel + ". The selector passes " + selected
        + " to B at " + axisLabel(setup.b) + " and blocks " + rejected + ". B has two end detectors.";

      find("sequence-diagram")?.setAttribute("data-pass", setup.pass);
      const sequenceTitle = find("sequence-description");
      if (sequenceTitle) sequenceTitle.textContent = description;
      write("route-summary", description);
      write("blocked-model", percent(theory.blocked));
      write("b-summary", theory.passed === 0
        ? selected + " has zero probability in this setup. B receives no beam."
        : percent(theory.passed) + " of all atoms sent pass through " + selected
          + ". At B, the selected state and B’s axis are " + theory.separationB + "° apart.");

      for (const sign of BRANCHES) {
        write("b-" + sign + "-model", percent(theory.perSource[sign]));
        write("b-" + sign + "-conditional", theory.passed === 0 ? "—" : percent(theory.b[sign]));
      }
    }

    renderCounts();
  }

  function clearChallengeFeedback() {
    write("challenge-feedback", "");
    find("challenge-next").hidden = true;
    find("challenge-restart").hidden = true;
  }

  function applySetup(changes, reset = false) {
    const next = { ...setup, ...changes };
    if (!reset && Object.keys(next).every(key => next[key] === setup[key])) return;

    setup = next;
    theory = theoryFor(setup);
    counts = freshCounts();
    if (question === "angle") clearChallengeFeedback();
    renderSetup();
    write("announcement", reset
      ? "Setup reset to a positive Z source and one Z analyzer. Counts cleared."
      : "Setup changed. A fresh count series starts at zero.");
  }

  function commitAngle(axis) {
    const input = angles[axis];
    const value = input.valueAsNumber;

    if (!Number.isInteger(value) || value < 0 || value > 180) {
      input.value = setup[axis];
      write("announcement", "Enter a whole number between 0 and 180 for analyzer "
        + axis.toUpperCase() + ". The angle stays at " + setup[axis] + " degrees.");
      return;
    }

    applySetup({ [axis]: value });
  }

  function send(size) {
    if (!unlocked) return;

    const batch = sampleBatch(size, setup, theory);
    const next = { ...freshCounts(), sent: counts.sent + batch.sent, last: batch.last };
    for (const sign of BRANCHES) {
      next.a[sign] = counts.a[sign] + batch.a[sign];
      next.b[sign] = counts.b[sign] + batch.b[sign];
    }

    checkCounts(next, setup);
    counts = next;
    renderCounts();

    const summary = size === 1
      ? describeRoute(batch.last, setup)
      : setup.mode === "single"
        ? size + " simulated atoms. A positive " + batch.a.plus + ". A negative " + batch.a.minus + "."
        : size + " simulated atoms. Blocked " + batch.a[opposite(setup.pass)] + ". B positive "
          + batch.b.plus + ". B negative " + batch.b.minus + ".";

    write("announcement", summary + " Total sent " + counts.sent + ".");
  }

  prediction.addEventListener("change", () => { write("prediction-feedback", ""); });

  prediction.addEventListener("submit", event => {
    event.preventDefault();
    const answer = prediction.querySelector('input[name="spin-guess"]:checked');
    if (!answer) return;

    if (!unlocked) {
      unlocked = true;
      for (const id of ["setup", "run", "challenge-controls"]) find(id).disabled = false;
      find("lock").hidden = true;
    }

    const lead = answer.value === "half-quarter" ? "Correct." : "Follow the beam through both stages.";
    write("prediction-feedback", lead + " Half the atoms sent pass through A+. Of those, half reach B−."
      + " That is ½ of the passed beam and ¼ of all atoms sent. Compare Direct Z and X+ then Z with a batch in each setup.");
  });

  source.addEventListener("change", () => applySetup({ source: source.value }));
  mode.addEventListener("change", () => applySetup({ mode: mode.value }));
  pass.addEventListener("change", () => applySetup({ pass: pass.value }));

  for (const [axis, input] of Object.entries(angles)) {
    input.addEventListener("change", () => commitAngle(axis));
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitAngle(axis);
    });
  }

  for (const button of root.querySelectorAll("[data-spin-angle]")) {
    const { spinAxis, spinAngle } = button.dataset;
    button.addEventListener("click", () => applySetup({ [spinAxis]: Number(spinAngle) }));
  }

  for (const button of root.querySelectorAll("[data-spin-preset]")) {
    button.addEventListener("click", () => applySetup(PRESETS[button.dataset.spinPreset]));
  }

  for (const button of root.querySelectorAll("[data-spin-send]")) {
    button.addEventListener("click", () => send(Number(button.dataset.spinSend)));
  }

  find("clear").addEventListener("click", () => {
    counts = freshCounts();
    renderCounts();
    write("announcement", "Counts cleared. The selected setup stays active.");
  });

  find("reset").addEventListener("click", () => applySetup(DEFAULT_SETUP, true));

  function showQuestion(next) {
    question = next;
    for (const panel of challenge.querySelectorAll("[data-spin-question]")) {
      panel.hidden = panel.dataset.spinQuestion !== question;
      if (!panel.hidden) panel.querySelector("h4").focus();
    }
    find("challenge-check").textContent = question === "angle" ? "Check my setup" : "Check answer";
    clearChallengeFeedback();
  }

  challenge.addEventListener("submit", event => {
    event.preventDefault();
    if (!unlocked) return;

    if (question === "angle") {
      const correctSetup = setup.mode === "single" && setup.source === "plus-z";
      const correct = correctSetup && Math.abs(theory.a.plus - 0.75) < 1e-12;
      let feedback = "Use Direct Z to select a single analyzer and a |+z⟩ source. Then try a new angle.";
      if (correctSetup) {
        const hint = theory.a.plus > 0.75 ? "Increase A’s angle." : "Decrease A’s angle.";
        feedback = correct
          ? "Correct. At 60° the half-angle is 30°, so cos²(30°) gives a 75% positive channel."
          : "At " + setup.a + "°, the model gives A+ " + percent(theory.a.plus) + ". " + hint;
      }
      write("challenge-feedback", feedback);
      find("challenge-next").hidden = !correct;
      return;
    }

    const answer = challenge.querySelector('input[name="spin-repeat-answer"]:checked');
    if (!answer) {
      write("challenge-feedback", "Choose a percentage first.");
      challenge.querySelector('input[name="spin-repeat-answer"]').focus();
      return;
    }

    const correct = Number(answer.value) === 100 * theoryFor(PRESETS.repeat).b.minus;
    write("challenge-feedback", correct
      ? "Correct. Every atom that reaches B is in |−x⟩, so a second X analyzer sends 100% of that beam to B−."
      : "Try again. A passes only its negative X eigenstate. B measures along the same axis.");
    find("challenge-restart").hidden = !correct;
  });

  challenge.addEventListener("change", clearChallengeFeedback);
  find("challenge-next").addEventListener("click", () => showQuestion("repeat"));
  find("challenge-restart").addEventListener("click", () => {
    challenge.reset();
    showQuestion("angle");
  });

  renderSetup();
  find("prediction-controls").disabled = false;
  find("static-note").hidden = true;
  find("lock").hidden = false;
}

const lesson = document.querySelector(".site-main.spin-lesson");
if (lesson) initializeLab(lesson);


// ===========================================================================
// Stern–Gerlach Arcade (optional practice). Everything below uses the sg-
// prefix so it never touches the Stern–Gerlach lab above, which uses spin-.
// The whole arcade runs inside one try block: if anything in it fails, the
// lab and the challenge keep working.
// ===========================================================================

try {
  const SG_TOLERANCE = 0.002; // typed answers
  const SG_DERIVED = 0.005;   // probabilities computed from a setting you build
  const SG_ANGLE = 1;         // degrees
  const SG_SVG = "http://www.w3.org/2000/svg";
  const sgNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

  function sgFmt(value) {
    if (!Number.isFinite(value)) return "undefined";
    return sgNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
  }

  // An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
  const sgTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
  const sgFits = (value, answer) => Math.abs(value - answer) <= (sgTerminates(answer) ? 1e-9 : SG_TOLERANCE + 1e-12);
  const sgNear = (value, target, tolerance = SG_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
  const sgWrap = (degrees, turn = 360) => ((degrees % turn) + turn) % turn;
  const sgAngleGap = (a, b, turn = 360) => { const d = sgWrap(a - b, turn); return Math.min(d, turn - d); };
  // Angles that differ by whole turns are equal.
  const sgAngleFits = (a, b, turn = 360) => sgAngleGap(a, b, turn) <= SG_ANGLE + 1e-9;

  // Parse numbers such as 2, −1.5, 3/5, √2, 1/√2 or (1 + √3)/2.
  // This is a small arithmetic reader (+ − × / √ and brackets), never eval.
  function sgParse(raw) {
    const text = String(raw).trim().toLowerCase()
      .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/sqrt/g, "√").replace(/°/g, "").replace(/\s+/g, "");
    if (!text || text.length > 40) return null;
    let i = 0;
    const peek = () => text[i];
    function number() {
      const match = /^(\d+(?:\.\d*)?|\.\d+)/.exec(text.slice(i));
      if (!match) return null;
      i += match[0].length;
      return Number(match[0]);
    }
    function atom() {
      if (peek() === "(") {
        i++;
        const value = expression();
        if (value === null || peek() !== ")") return null;
        i++;
        return value;
      }
      if (peek() === "√") {
        i++;
        const value = atom();
        return value === null || value < 0 ? null : Math.sqrt(value);
      }
      return number();
    }
    function unary() {
      if (peek() === "-") { i++; const value = unary(); return value === null ? null : -value; }
      if (peek() === "+") { i++; return unary(); }
      return atom();
    }
    function term() {
      let value = unary();
      while (value !== null) {
        const ch = peek();
        if (ch === "*" || ch === "/") {
          i++;
          const right = unary();
          if (right === null || (ch === "/" && right === 0)) return null;
          value = ch === "/" ? value / right : value * right;
        } else if (ch === "(" || ch === "√") {
          const right = atom();
          if (right === null) return null;
          value *= right;
        } else break;
      }
      return value;
    }
    function expression() {
      let value = term();
      while (value !== null && (peek() === "+" || peek() === "-")) {
        const op = text[i++];
        const right = term();
        if (right === null) return null;
        value = op === "+" ? value + right : value - right;
      }
      return value;
    }
    const value = expression();
    return value !== null && i === text.length && Number.isFinite(value) ? value : null;
  }

  function sgRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Seeded stations share these: start at seed 1, "New seed" moves on, reset returns to seed 1.
  function sgSeed(c, seed = 1) { c.s.seed = seed; c.s.rng = sgRandom(seed * 7919 + c.key.length); }
  const sgReseed = (c, after = "") => {
    sgSeed(c, c.s.seed + 1);
    return "Seed " + c.s.seed + ". New atoms use a fresh random sequence. Reset this station to return to seed 1." + after;
  };
  const sgPick = (rng, probabilities) => {
    let r = rng(), k = 0;
    while (k < probabilities.length - 1 && r >= probabilities[k]) { r -= probabilities[k]; k++; }
    return k;
  };
  const sgCount = (rng, p, n) => { let k = 0; for (let t = 0; t < n; t++) if (rng() < p) k++; return k; };

  const sgGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
  const sgSetup = message => sgGrade(false, message);

  function sgLabelText(field) {
    const label = field.closest("label");
    if (!label) return "the selected input";
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input, select, output").forEach(node => node.remove());
    return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
  }

  class SgFieldError extends Error {
    constructor(field, detail = "", custom = false) {
      super("Check " + sgLabelText(field) + "." + (detail ? " " + detail : ""));
      this.field = field;
      this.detail = detail;
      this.custom = custom;
    }
  }

  function sgSetText(element, text) {
    text = String(text ?? "");
    if (element && element.textContent !== text) element.textContent = text;
  }

  // Degrees with radians alongside: 60° · π/3 rad.
  function sgRadText(degrees) {
    const k = degrees / 7.5;
    if (Math.abs(k - Math.round(k)) > 1e-9) return "≈ " + sgFmt(degrees * Math.PI / 180);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let n = Math.round(k), d = 24;
    if (n === 0) return "0";
    const g = gcd(Math.abs(n), d);
    n /= g; d /= g;
    const top = n === 1 ? "π" : n === -1 ? "−π" : sgFmt(n) + "π";
    return d === 1 ? top : top + "/" + d;
  }
  const sgAngleText = degrees => sgFmt(degrees) + "° · " + sgRadText(degrees) + " rad";


  // ---------------------------------------------------------------------------
  // Spin directions and probabilities shared by the stations. A direction n is
  // given by its tilt η from +z and its azimuth φ from +x toward +y, in degrees.
  // For spin-½ prepared along s and an analyzer along n, P(+) = (1 + s·n)/2.
  // ---------------------------------------------------------------------------
  const sgRad = degrees => degrees * Math.PI / 180;
  const sgDeg2 = radians => radians * 180 / Math.PI;
  // 2D points as [first, second] pairs, used by the plane views.
  const sgAdd = ([a, b], [c, d]) => [a + c, b + d];
  const sgScale = ([a, b], k) => [a * k, b * k];
  const sgPolar = (r, degrees) => [r * Math.cos(sgRad(degrees)), r * Math.sin(sgRad(degrees))];
  const sgDir = (eta, phi = 0) => [Math.sin(sgRad(eta)) * Math.cos(sgRad(phi)), Math.sin(sgRad(eta)) * Math.sin(sgRad(phi)), Math.cos(sgRad(eta))];
  const sgDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sgNeg = v => v.map(n => -n);
  const sgLen = v => Math.hypot(...v);
  const sgUnit = v => { const r = sgLen(v); return r > 1e-12 ? v.map(n => n / r) : [0, 0, 1]; };
  const sgBetween = (u, v) => sgDeg2(Math.acos(Math.max(-1, Math.min(1, sgDot(sgUnit(u), sgUnit(v))))));
  const sgSameDir = (u, v, tolerance = SG_ANGLE) => sgBetween(u, v) <= tolerance + 1e-9;
  const sgP = (s, n) => Math.max(0, Math.min(1, (1 + sgDot(s, n)) / 2));
  const sgRound = (v, step) => Math.round(v / step) * step;
  const sgClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sgSame = (u, v) => Math.abs(u - v) < 1e-9;
  // The tilt and azimuth of a direction, with η in [0°, 180°] and φ in [0°, 360°).
  function sgAngles(v) {
    const u = sgUnit(v);
    const eta = sgDeg2(Math.acos(sgClamp(u[2], -1, 1)));
    const phi = Math.hypot(u[0], u[1]) < 1e-9 ? 0 : sgWrap(sgDeg2(Math.atan2(u[1], u[0])));
    return { eta, phi };
  }
  const SG_NAMED = [[[0, 0, 1], "+z"], [[0, 0, -1], "−z"], [[1, 0, 0], "+x"], [[-1, 0, 0], "−x"], [[0, 1, 0], "+y"], [[0, -1, 0], "−y"]];
  function sgDirText(v) {
    const named = SG_NAMED.find(([d]) => sgBetween(d, v) < 0.01);
    if (named) return named[1];
    const { eta, phi } = sgAngles(v);
    return "η = " + sgFmt(sgRound(eta, 0.01)) + "°, φ = " + sgFmt(sgRound(phi, 0.01)) + "°";
  }
  const sgKetText = v => "|" + (SG_NAMED.find(([d]) => sgBetween(d, v) < 0.01)?.[1] ?? "+n") + "⟩";
  const sgVecText = v => "(" + v.map(n => sgFmt(sgRound(n, 0.001))).join(", ") + ")";
  // An angle box may be blank mid-edit; fall back to its paired slider.
  function sgDeg(c, name) {
    const text = String(c.val(name)).trim(), value = Number(text);
    if (text !== "" && Number.isFinite(value)) return value;
    const range = c.field(name + "-range");
    return range ? Number(range.value) : 0;
  }
  const sgDirOf = (c, prefix) => sgDir(sgDeg(c, prefix + "-eta"), sgDeg(c, prefix + "-phi"));
  const sgSetDir = (c, prefix, eta, phi) => { c.set(prefix + "-eta", eta); c.set(prefix + "-phi", phi); };
  const sgPct = p => sgFmt(sgRound(100 * p, 0.01)) + "%";
  const sgOneIn = (count, word) => count + " " + word + (count === 1 ? "" : "s");

  // Sources offered by the station menus.
  const SG_SOURCES = {
    "plus-z": { dir: [0, 0, 1], ket: "|+z⟩" },
    "minus-z": { dir: [0, 0, -1], ket: "|−z⟩" },
    "plus-x": { dir: [1, 0, 0], ket: "|+x⟩" },
    "minus-x": { dir: [-1, 0, 0], ket: "|−x⟩" },
    "plus-y": { dir: [0, 1, 0], ket: "|+y⟩" },
    "minus-y": { dir: [0, -1, 0], ket: "|−y⟩" }
  };

  // A sequence of analyzers, each with a selector. Every stage passes the atoms
  // in channel q (+1 or −1) and blocks the other channel; the passed atoms leave
  // in the state q·n. Returns one row per stage plus the overall survivors.
  function sgChainRun(source, stages) {
    let state = source, alive = 1;
    const rows = stages.map(stage => {
      const conditional = sgP(state, stage.q > 0 ? stage.n : sgNeg(stage.n));
      const reached = alive, passed = alive * conditional;
      const row = { reached, conditional, passed, blocked: reached - passed, before: state };
      alive = passed;
      if (conditional > 1e-12) state = stage.q > 0 ? stage.n : sgNeg(stage.n);
      return row;
    });
    return { rows, overall: alive, out: state };
  }

  function sgGauss(rng) {
    const u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Plot builders used by the station show() functions. A plan holds panels laid
  // out side by side, or one 3D bench view.
  const sgArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
  const sgPlane = (caption, items, extra = {}) => ({ kind: "plane", caption, items, limit: 1, circle: 1, axes: ["x", "z"], ...extra });
  const sgBars = (caption, items, extra = {}) => ({ kind: "bars", caption, items, ...extra });
  const sgChart = (caption, extra) => ({ kind: "chart", caption, x: [0, 1], y: [0, 1], xTicks: [0, 1], yTicks: [0, 0.5, 1], xLabel: "", ...extra });
  const sgSweep = (f, x0, x1, n = 120) => Array.from({ length: n + 1 }, (_, k) => {
    const x = x0 + (x1 - x0) * k / n;
    return [x, f(x)];
  });
  const sgChain = (caption, items, extra = {}) => ({ kind: "chain", caption, items, ...extra });
  const sgLine = (caption, extra) => ({ kind: "line", caption, ...extra });
  // A direction drawn in a plane view: [first, second] components of a 3-vector.
  const sgXZ = v => [v[0], v[2]];
  const sgXY = v => [v[0], v[1]];

  // ---------------------------------------------------------------------------
  // Stations 1–5 · The apparatus, and angles.
  // ---------------------------------------------------------------------------

  // 1 · Classical vs Quantum Screen. Deflections are fractions of the largest one.
  const SG_PLATE_MAX = 0.85;
  const SG_PLATE_BINS = 22;
  function sgScreenAtom(c, model) {
    const rng = c.s.rng;
    const spread = sgClamp(0.32 * sgGauss(rng), -0.95, 0.95);
    // A classical moment points every way equally often, so cos α is uniform on [−1, 1].
    const share = model === "classical" ? 2 * rng() - 1 : (rng() < 0.5 ? 1 : -1);
    const blur = model === "classical" ? 0.02 : 0.05;
    return { share, x: spread, z: sgClamp(SG_PLATE_MAX * share + blur * sgGauss(rng), -1, 1) };
  }
  const sgMiddle = hit => Math.abs(hit.share) < 0.5;
  function sgScreenSend(c, n) {
    const model = c.val("model"), list = c.s.hits[model];
    let middle = 0;
    for (let k = 0; k < n; k++) {
      const hit = sgScreenAtom(c, model);
      list.push(hit);
      if (sgMiddle(hit)) middle++;
    }
    const total = list.length, inside = list.filter(sgMiddle).length;
    return sgOneIn(n, "simulated atom") + " (" + model + " model): " + middle + " in the middle half of the plate, " + (n - middle)
      + " outside it. This plate now holds " + total + " atoms, " + inside + " of them in the middle half.";
  }

  // 2 · Gradient and Deflection. The magnet's axis u = (sin ρ, 0, cos ρ) in the
  // plane facing the beam. The field points along u; the gradient sets where it is stronger.
  const SG_GRAD = { up: 1, down: -1, none: 0 };
  function sgMagnetModel(c) {
    const roll = sgDeg(c, "roll"), grad = SG_GRAD[c.val("grad")], u = sgDir(roll, 0);
    // F = μ_u ∂B_u/∂u with μ opposite S: S_u = +ℏ/2 goes toward −g u.
    return { roll, grad, u, plus: grad ? sgNeg(u).map(n => n * grad) : null, minus: grad ? u.map(n => n * grad) : null };
  }
  function sgMagnetGrader(target, choiceName, answer, work) {
    return c => {
      const m = sgMagnetModel(c);
      if (c.val("grad") !== target.grad) return sgSetup("Set the field gradient as the mission says: " + { up: "stronger toward +u", down: "stronger toward −u", none: "uniform field" }[target.grad] + ".");
      if (target.roll !== undefined && !sgAngleFits(m.roll, target.roll)) return sgSetup("Roll the magnet to ρ = " + target.roll + "°.");
      return sgGrade(c.choice(choiceName) === answer, "Use F = μ_u ∂B_u/∂u, and remember that a silver atom’s moment points opposite its spin.", work);
    };
  }

  // 3 · Readings in ℏ.
  const SG_HBAR = 1.054571817; // ×10⁻³⁴ J·s
  function sgUnitsModel(c) {
    const eta = sgDeg(c, "eta"), axis = c.val("axis"), s = sgDir(eta, 0);
    const n = axis === "x" ? [1, 0, 0] : [0, 0, 1], p = sgP(s, n);
    return { eta, axis, s, n, p, mean: 2 * p - 1 };
  }

  // 4 · Angle Sharpshooter.
  function sgAimModel(c) {
    const s = sgDirOf(c, "s"), n = sgDirOf(c, "n");
    return { s, n, theta: sgBetween(s, n), p: sgP(s, n) };
  }
  const SG_TARGETS = [1 / 4, 1 / 2, 9 / 10];
  const SG_TARGET_TEXT = ["1/4", "1/2", "9/10"];
  const SG_AIM_SOURCE = { a: [0, 0], b: [90, 0], c: [60, 45], d: [90, 0], e: [50, 30] };

  // 5 · Half-Angle Puzzle.
  const sgHalfModel = c => {
    const alpha = sgDeg(c, "alpha");
    return { alpha, pol: Math.cos(sgRad(alpha)) ** 2, spin: Math.cos(sgRad(alpha) / 2) ** 2 };
  };

  const sgStations1 = {
    // 1 · Classical vs Quantum Screen ---------------------------------------------------------------------
    screen: {
      start(c) {
        sgSeed(c);
        c.s.hits = { classical: [], quantum: [] };
      },
      show(c) {
        const model = c.val("model"), hits = c.s.hits[model], n = hits.length;
        const inside = hits.filter(sgMiddle).length;
        c.put("state", "Model: " + (model === "classical" ? "classical spinning moments" : "quantum spin-½") + ". Seed " + c.s.seed + ". "
          + sgOneIn(n, "atom") + " on this plate" + (n ? ", " + inside + " in the middle half (|deflection| < ½ of the largest)." : ". Send atoms to see where they land."));
        const bins = new Array(SG_PLATE_BINS).fill(0);
        for (const hit of hits) bins[sgClamp(Math.floor((hit.z + 1) / 2 * SG_PLATE_BINS), 0, SG_PLATE_BINS - 1)]++;
        const top = Math.max(1, ...bins);
        const rects = bins.map((count, k) => ({ x0: -1 + 2 * k / SG_PLATE_BINS, x1: -1 + 2 * (k + 1) / SG_PLATE_BINS, y0: 0, y1: count / top, tone: model === "classical" ? "beta" : "plus" }));
        rects.unshift({ x0: -0.5 * SG_PLATE_MAX, x1: 0.5 * SG_PLATE_MAX, y0: 0, y1: 1, tone: "angle", opacity: 0.12 });
        return {
          panels: [
            { kind: "plate", caption: "detector plate", hits: hits.slice(-600), band: 0.5 * SG_PLATE_MAX, tone: model === "classical" ? "beta" : "plus", weight: 1 },
            sgChart("deflections (yellow: middle half)", { x: [-1, 1], y: [0, 1], xTicks: [-1, -0.5, 0, 0.5, 1], yTicks: [0, 0.5, 1], xLabel: "deflection along z",
              rects, weight: 1.35 })
          ],
          caption: model + " model",
          desc: "Left: the detector plate with " + sgOneIn(n, "atom") + " from the " + model + " model. Right: a histogram of their deflections, scaled to the tallest bin. "
            + (n ? inside + " of " + n + " landed in the middle half." : "No atoms yet.")
        };
      },
      actions: {
        send1: c => sgScreenSend(c, 1),
        send10: c => sgScreenSend(c, 10),
        send100: c => sgScreenSend(c, 100),
        clear: c => { c.s.hits[c.val("model")] = []; return "This plate is cleared. The other model’s plate keeps its atoms."; },
        reseed: c => { c.s.hits = { classical: [], quantum: [] }; return sgReseed(c, " Both plates are cleared."); }
      },
      checks: {
        a: ["A classical moment can point in any direction.", "Its z component, which sets the deflection, can take any value from −μ to +μ.", c => sgGrade(c.choice("a-pick") === "band",
          "Picture moments pointing every way. What z components do they have?",
          "Classically the deflection is proportional to μ_z = μ cos α. An oven sends moments in every direction, so cos α takes every value from −1 to 1, and the plate shows one continuous band from the top edge to the bottom edge, densest nowhere in particular. Send 100 atoms in the classical model to see it.")],
        b: ["Switch to the quantum model and send 100 atoms.", "Count the possible deflections.", c => {
          const ok = c.choice("b-pattern") === "two" && c.choice("b-means") === "two";
          return sgGrade(ok, "Compare the two plates. One of your two choices doesn’t match the quantum plate yet.",
            "Silver atoms land in two separate spots with nothing between them. The deflection measures the moment’s z component, so S_z has only two values, +ℏ/2 and −ℏ/2. Stern and Gerlach saw this in Frankfurt in 1922 and read it as “space quantization”. The idea of electron spin came in 1925, and silver’s moment comes from its one unpaired outer electron.");
        }],
        c: ["The deflection is proportional to μ_z = μ cos α.", "cos 60° = 1/2.", c => sgGrade(sgFits(c.ans("c-f"), 0.5), "Write the deflection as a share of the largest, which belongs to α = 0.",
          "Deflection ∝ μ cos α, and the largest deflection has α = 0. At α = 60° the share is cos 60° = 1/2: halfway out from the centre of the band.")],
        d: ["The middle half holds atoms whose |cos α| < 1/2.", "cos α is uniform on [−1, 1] in the classical model.", c => {
          const need = ["classical", "quantum"].filter(m => c.s.hits[m].length < 100);
          if (need.length) return sgSetup("Send at least 100 atoms in the " + need.join(" and the ") + " model" + (need.length > 1 ? "s" : "") + " first.");
          const cl = c.ans("d-cl"), qu = c.ans("d-qu");
          return sgGrade(sgFits(cl, 0.5) && sgFits(qu, 0), !sgFits(cl, 0.5) ? "Find the share of the interval [−1, 1] where |cos α| < 1/2." : "Where do the two quantum spots sit?",
            "Classical: cos α is uniform on [−1, 1], and |cos α| < 1/2 covers a length 1 out of 2, so the model fraction is 1/2. Quantum: every atom sits at ±(largest deflection), so the model fraction is 0. Your own counts scatter around these values; that scatter is expected, and it isn’t graded.");
        }]
      }
    },

    // 2 · Gradient and Deflection -------------------------------------------------------------------------
    gradient: {
      show(c) {
        const m = sgMagnetModel(c), show = c.checked("show");
        const field = m.grad === 0 ? "a uniform field, no gradient" : "a field along u that grows stronger toward " + (m.grad > 0 ? "+u" : "−u");
        c.put("state", "Magnet roll ρ = " + sgFmt(m.roll) + "°, so its axis u points along " + sgDirText(m.u) + ". The beam travels along +y into the page. The magnet makes " + field + "."
          + (show ? m.grad ? " S_u = +ℏ/2 atoms deflect toward " + sgDirText(m.plus) + ", and S_u = −ℏ/2 atoms toward " + sgDirText(m.minus) + "." : " Atoms are not deflected." : " Tick Show the deflections to see where each channel goes."));
        return {
          panels: [{ kind: "magnet", caption: "looking down the beam (+y into the page)", roll: m.roll, grad: m.grad, show }],
          caption: "ρ = " + sgFmt(m.roll) + "°",
          desc: "The magnet seen along the beam, rolled by " + sgFmt(m.roll) + "°. " + (m.grad ? "The pointed pole marks where the field is stronger. " : "Two flat poles make a uniform field. ")
            + (show && m.grad ? "Arrows show S_u = +ℏ/2 deflecting toward " + sgDirText(m.plus) + " and S_u = −ℏ/2 toward " + sgDirText(m.minus) + "." : "")
        };
      },
      checks: {
        a: ["Silver’s moment points opposite its spin, so S_z = +ℏ/2 means μ_z < 0.", "F_z = μ_z ∂B_z/∂z, and the field grows toward +z.",
          sgMagnetGrader({ grad: "up", roll: 0 }, "a-pick", "-z",
            "μ_z < 0 for S_z = +ℏ/2, and ∂B_z/∂z > 0, so F_z = μ_z ∂B_z/∂z < 0. The +ℏ/2 atoms bend toward −z, away from the pointed pole, and the −ℏ/2 atoms bend toward +z. Which way is “up” depends on the sign of the moment, not on the name of the reading.")],
        b: ["Only the sign of ∂B_z/∂z changes.", "Flip the sign of the force.",
          sgMagnetGrader({ grad: "down", roll: 0 }, "b-pick", "+z",
            "With the field stronger toward −z, ∂B_z/∂z < 0, so F_z = μ_z ∂B_z/∂z > 0 for μ_z < 0. The +ℏ/2 atoms now bend toward +z. Reversing the gradient swaps where the two channels land, so the detectors must swap labels too.")],
        c: ["At ρ = 90° the axis u is +x.", "Repeat the reasoning of mission 1 along x.",
          sgMagnetGrader({ grad: "up", roll: 90 }, "c-pick", "-x",
            "Rolled by 90°, the magnet measures S_x. For S_x = +ℏ/2, μ_x < 0 and ∂B_x/∂x > 0, so the force points along −x. The channels now sit to the left and right instead of up and down.")],
        d: ["At ρ = 180°, u = −z. An atom with S_z = +ℏ/2 has S_u = −ℏ/2.", "Work out ∂B_z/∂z for the upside-down magnet.",
          sgMagnetGrader({ grad: "up", roll: 180 }, "d-pick", "same",
            "Turned upside down, the field points along −z and grows toward −z, so B_z is negative and grows more negative toward −z, which still gives ∂B_z/∂z > 0. S_z = +ℏ/2 atoms still bend toward −z. Nothing moves on the plate; only the labels change, because the magnet’s positive axis is now −z and it calls those atoms S_u = −ℏ/2. Compare mission 2, where the atoms really do swap places.")],
        e: ["A force needs the energy −μ·B to change from place to place.", "A uniform field turns a moment but pulls both ends equally.",
          sgMagnetGrader({ grad: "none" }, "e-pick", "none",
            "In a uniform field the energy −μ·B is the same everywhere, so there is no net force and no splitting, only a torque. That is why the lesson says a uniform field alone gives no spatial splitting. The torque makes the moment precess, which Lesson 17 takes up.")]
      }
    },

    // 3 · Readings in ℏ ---------------------------------------------------------------------------------------
    units: {
      load(c, check) {
        if (check === "b" || check === "c") { c.set("eta", 60); c.field("axis").value = "z"; }
        if (check === "d") c.field("axis").value = "x";
      },
      show(c) {
        const m = sgUnitsModel(c), A = m.axis.toUpperCase();
        c.put("state", "State |+n⟩ at η = " + sgFmt(m.eta) + "° in the xz-plane, analyzer along " + m.axis + ". P(+) = " + sgFmt(m.p) + " and P(−) = " + sgFmt(1 - m.p) + ".");
        const row = (label, scale, ticks, tickText, tone) => ({ label, tone, ticks, tickText, points: [
          { x: -scale, tone: "minus", r: 4 + 10 * (1 - m.p), label: "P = " + sgFmt(1 - m.p) },
          { x: scale, tone: "plus", r: 4 + 10 * m.p, label: "P = " + sgFmt(m.p) },
          { x: scale * m.mean, tone: "angle", r: 4, mean: true }] });
        return {
          panels: [sgLine("Pauli scale (top) and physical scale (bottom)", { x: [-1.2, 1.2], rows: [
            row(A, 1, [-1, 0, 1], ["−1", "0", "+1"], "alpha"),
            row("S_" + m.axis, 0.5, [-1, -0.5, 0, 0.5, 1], ["−ℏ", "−ℏ/2", "0", "+ℏ/2", "+ℏ"], "beta")],
          links: [{ from: -1, to: -0.5, rows: [0, 1] }, { from: 1, to: 0.5, rows: [0, 1] }] })],
          caption: "analyzer along " + m.axis,
          desc: "Two number lines. On the Pauli line the readings are −1 and +1. On the physical line the same readings sit at −ℏ/2 and +ℏ/2. Dot sizes show P(+) = " + sgFmt(m.p) + " and P(−) = " + sgFmt(1 - m.p) + ". A yellow triangle marks the mean on each line."
        };
      },
      checks: {
        a: ["S_z = (ℏ/2) Z, so multiply the reading by 1/2.", "ℏ ≈ 1.054571817 × 10⁻³⁴ J·s, which is 10.54571817 × 10⁻³⁵ J·s.", c => {
          const s = c.ans("a-s"), si = c.ans("a-si");
          return sgGrade(sgFits(s, -0.5) && Math.abs(si + 10 * SG_HBAR / 2) <= 0.01, !sgFits(s, -0.5) ? "Convert the reading −1 into units of ℏ first." : "Check the SI value: multiply −1/2 by ℏ, written in units of 10⁻³⁵ J·s.",
            "Z = −1 ↔ S_z = (ℏ/2)(−1) = −ℏ/2. In SI units, −(1.054571817 × 10⁻³⁴)/2 J·s = −5.27 × 10⁻³⁵ J·s. Spin is angular momentum, so it is measured in J·s.");
        }],
        b: ["P(+) = 3/4 and P(−) = 1/4.", "⟨Z⟩ = (+1)P(+) + (−1)P(−), and ⟨S_z⟩ = (ℏ/2)⟨Z⟩.", c => {
          const z = c.ans("b-z"), s = c.ans("b-s");
          return sgGrade(sgFits(z, 0.5) && sgFits(s, 0.25), !sgFits(z, 0.5) ? "Find ⟨Z⟩ from the two probabilities." : "Now scale ⟨Z⟩ by ℏ/2.",
            "⟨Z⟩ = 3/4 − 1/4 = 1/2, and ⟨S_z⟩ = (ℏ/2)(1/2) = ℏ/4. The mean lies between the two readings, and no single atom shows ℏ/4.");
        }],
        c: ["(ΔZ)² = 1 − ⟨Z⟩² for a Pauli observable.", "ΔS_z = (ℏ/2)ΔZ.", c => {
          const dz = c.ans("c-dz"), ds = c.ans("c-ds");
          return sgGrade(sgFits(dz, Math.sqrt(3) / 2) && sgFits(ds, Math.sqrt(3) / 4), !sgFits(dz, Math.sqrt(3) / 2) ? "Use ⟨Z⟩ = 1/2 in ΔZ = √(1 − ⟨Z⟩²)." : "Scale ΔZ by ℏ/2.",
            "ΔZ = √(1 − 1/4) = √3/2, so ΔS_z = (ℏ/2)(√3/2) = (√3/4)ℏ ≈ 0.433ℏ. Every Lesson 15 spread of a Pauli observable becomes a physical spread on multiplying by ℏ/2.");
        }],
        d: ["Divide by ℏ/2 to get back to the Pauli scale.", "P(+x) = (1 + ⟨X⟩)/2.", c => {
          const x = c.ans("d-x"), p = c.ans("d-p");
          return sgGrade(sgFits(x, -0.6) && sgFits(p, 0.2), !sgFits(x, -0.6) ? "⟨X⟩ = ⟨S_x⟩/(ℏ/2)." : "Use ⟨X⟩ = P(+) − P(−) with P(+) + P(−) = 1.",
            "⟨X⟩ = −0.3ℏ/(ℏ/2) = −0.6. Then P(+x) − P(−x) = −0.6 and P(+x) + P(−x) = 1, so P(+x) = 0.2. With axis x, the η slider shows this at η ≈ 216.87° or 323.13°, where sin η = −0.6.");
        }],
        e: ["The only readings of S_z are ±ℏ/2.", "Square each possible reading.", c => {
          const ok = c.choice("e-pick") === "no", sq = c.ans("e-sq");
          return sgGrade(ok && sgFits(sq, 0.25), !ok ? "List the readings an S_z analyzer can show." : "Square ±1/2.",
            "One reading is always +ℏ/2 or −ℏ/2, never ℏ/4. ℏ/4 can only be a mean. Both readings square to ℏ²/4, so every S_z² reading is ℏ²/4 and S_z² = (ℏ²/4)I. Station 9 uses this.");
        }]
      }
    },

    // 4 · Angle Sharpshooter ------------------------------------------------------------------------------
    aim: {
      start(c) { c.s.pins = []; },
      load(c, check) {
        const [eta, phi] = SG_AIM_SOURCE[check];
        sgSetDir(c, "s", eta, phi);
        if (check === "b") sgSetDir(c, "n", 300, 0);
        if (check === "e") c.s.pins = [];
      },
      show(c) {
        const m = sgAimModel(c);
        const pins = c.s.pins.length ? " Pinned: " + c.s.pins.map(k => SG_TARGET_TEXT[k]).join(", ") + "." : "";
        c.put("state", "Source s = " + sgVecText(m.s) + " · analyzer n = " + sgVecText(m.n) + " · separation θ = " + sgFmt(sgRound(m.theta, 0.01)) + "° · P(+) = cos²(θ/2) = " + sgFmt(m.p) + "." + pins);
        const arrows = view => [sgArrow(view(m.s), "plus", "s"), sgArrow(view(m.n), "angle", "n"), sgArrow(view(sgNeg(m.n)), "angle", "", { dashed: true })];
        return {
          panels: [
            sgPlane("side view (xz)", arrows(sgXZ), { axes: ["x", "z"] }),
            sgPlane("top view (xy)", arrows(sgXY), { axes: ["x", "y"] }),
            sgBars("channels", [{ label: "+ℏ/2", value: m.p, tone: "plus" }, { label: "−ℏ/2", value: 1 - m.p, tone: "minus" }], { weight: 0.8 })
          ],
          caption: "θ = " + sgFmt(sgRound(m.theta, 0.01)) + "°",
          desc: "Side and top views of the source direction s and the analyzer direction n, which are " + sgFmt(sgRound(m.theta, 0.01)) + "° apart. Bars show P(+) = " + sgFmt(m.p) + " and P(−) = " + sgFmt(1 - m.p) + "."
        };
      },
      actions: {
        pin(c) {
          const m = sgAimModel(c), [eta, phi] = SG_AIM_SOURCE.e;
          if (!sgSameDir(m.s, sgDir(eta, phi))) return "Keep the source at η = 50°, φ = 30° for this mission.";
          const k = SG_TARGETS.findIndex((t, i) => !c.s.pins.includes(i) && sgNear(m.p, t));
          if (k < 0) return "P(+) = " + sgFmt(m.p) + " is not within 0.005 of a target you still need (" + SG_TARGET_TEXT.filter((_, i) => !c.s.pins.includes(i)).join(", ") + ").";
          c.s.pins.push(k);
          return "Pinned " + SG_TARGET_TEXT[k] + ". " + (c.s.pins.length === 3 ? "All three targets are pinned." : (3 - c.s.pins.length) + " to go.");
        }
      },
      checks: {
        a: ["cos²(θ/2) = (1 + cos θ)/2 = 1/3 gives cos θ = −1/3.", "With s = +z, cos θ is n_z. Put n in the yz-plane (φ = 90°) at η ≈ 109.47°.", c => {
          const m = sgAimModel(c);
          if (!sgSameDir(m.s, [0, 0, 1])) return sgSetup("Keep the source along +z (η = 0°). Reopening the mission resets it.");
          if (Math.abs(m.n[1]) < 0.3) return sgSetup("Give the analyzer a y component of at least 0.3 in size. Its n_y is " + sgFmt(sgRound(m.n[1], 0.001)) + ".");
          return sgGrade(sgNear(m.p, 1 / 3), "P(+) is " + sgFmt(m.p) + ". Tilt the analyzer until n_z = −1/3.",
            "P(+) = (1 + n_z)/2 = 1/3 needs n_z = −1/3, so η = arccos(−1/3) ≈ 109.47°, at any azimuth. φ = 90° puts n in the yz-plane, which the lab’s dial can’t reach.");
        }],
        b: ["η = 300° in the xz-plane is the same direction as −60°: n = (−√3/2, 0, 1/2).", "s·n = −√3/2. And 300° is opposite 120°.", c => {
          const m = sgAimModel(c);
          if (!sgSameDir(m.s, [1, 0, 0]) || !sgSameDir(m.n, sgDir(300, 0))) return sgSetup("Use source |+x⟩ (η = 90°, φ = 0°) and analyzer η = 300°, φ = 0°. Reopening the mission sets them.");
          const p = c.ans("b-p"), dial = c.ans("b-dial");
          return sgGrade(sgFits(p, (2 - Math.sqrt(3)) / 4) && sgAngleFits(dial, 120), !sgFits(p, (2 - Math.sqrt(3)) / 4) ? "Compute (1 + s·n)/2 exactly." : "Which direction in 0°–180° is exactly opposite 300°?",
            "n = (sin 300°, 0, cos 300°) = (−√3/2, 0, 1/2), so s·n = −√3/2 and P(+) = (1 − √3/2)/2 = (2 − √3)/4 ≈ 0.067. The direction 300° is −(120° direction), so this magnet is the lab’s 120° magnet with its + and − channels swapped: P(+) here equals P(−) there.");
        }],
        c: ["P(+) = 0 needs s·n = −1.", "Point n exactly opposite s: η = 180° − 60°, φ = 45° + 180°.", c => {
          const m = sgAimModel(c);
          if (!sgSameDir(m.s, sgDir(60, 45))) return sgSetup("Keep the source at η = 60°, φ = 45°. Reopening the mission resets it.");
          return sgGrade(sgSameDir(m.n, sgNeg(m.s)), "n is " + sgFmt(sgRound(sgBetween(m.n, sgNeg(m.s)), 0.1)) + "° from the opposite of s.",
            "Only n = −s gives (1 + s·n)/2 = 0. That is η = 120°, φ = 225°. Every other direction lets some atoms through, so “never +ℏ/2” singles out one direction.");
        }],
        d: ["P(+) = 3/4 needs s·n = 1/2: n is 60° from +x.", "Try η = 90°, φ = 60°: n = (1/2, √3/2, 0). Many other answers work.", c => {
          const m = sgAimModel(c);
          if (!sgSameDir(m.s, [1, 0, 0])) return sgSetup("Keep the source along +x. Reopening the mission resets it.");
          if (Math.abs(m.n[1]) < 0.3) return sgSetup("Give the analyzer a y component of at least 0.3 in size.");
          return sgGrade(sgNear(m.p, 0.75), "P(+) is " + sgFmt(m.p) + ". You need n_x = 1/2.",
            "Every n with n_x = 1/2 works: a whole cone of directions 60° from +x. For example η = 90°, φ = 60° gives n = (1/2, √3/2, 0), and η = 90°, φ = −60° gives (1/2, −√3/2, 0). The checker tests the direction you chose.");
        }],
        e: ["Each target fixes θ: cos θ = 2P − 1.", "1/4 → θ = 120°, 1/2 → 90°, 9/10 → θ ≈ 36.87°. Aim n that far from s, then press Pin this shot.", c => {
          const missing = SG_TARGETS.map((_, k) => k).filter(k => !c.s.pins.includes(k));
          return sgGrade(!missing.length, "Still to pin: " + missing.map(k => SG_TARGET_TEXT[k]).join(", ") + ".",
            "cos θ = 2P(+) − 1 gives θ = 120° for 1/4, θ = 90° for 1/2 and θ = arccos 0.8 ≈ 36.87° for 9/10. Each target is a cone of directions around s, so you could hit each one in endlessly many ways.");
        }]
      }
    },

    // 5 · Half-Angle Puzzle -------------------------------------------------------------------------------
    half: {
      show(c) {
        const m = sgHalfModel(c), a = m.alpha;
        c.put("state", "Turn α = " + sgAngleText(sgRound(a, 0.01)) + ". Polarizer: P(pass) = cos²α = " + sgFmt(m.pol) + ". Spin analyzer: P(+) = cos²(α/2) = " + sgFmt(m.spin)
          + ". In the ket, the spin analyzer’s angle appears as α/2 = " + sgFmt(sgRound(a / 2, 0.01)) + "°.");
        return {
          panels: [
            sgPlane("polarizer", [sgArrow([1, 0], "plus", "H")], { axes: ["H", "V"], rays: [{ angle: a, through: true, solid: true, tone: "alpha" }], marks: [{ angle: a, label: "axis", tone: "alpha" }], weight: 1 }),
            sgPlane("spin analyzer", [sgArrow([0, 1], "plus", "+z"), sgArrow([Math.sin(sgRad(a)), Math.cos(sgRad(a))], "angle", "n"), sgArrow([-Math.sin(sgRad(a)), -Math.cos(sgRad(a))], "angle", "", { dashed: true })], { axes: ["x", "z"], weight: 1 }),
            sgChart("pass probability vs turn α", { x: [0, 360], y: [0, 1], xTicks: [0, 90, 180, 270, 360], yTicks: [0, 0.5, 1], xLabel: "α in degrees",
              series: [{ pts: sgSweep(t => Math.cos(sgRad(t)) ** 2, 0, 360), tone: "alpha", label: "cos²α", labelAt: [100, 0.93] },
                { pts: sgSweep(t => Math.cos(sgRad(t) / 2) ** 2, 0, 360), tone: "plus", label: "cos²(α/2)", labelAt: [180, 0.08] }],
              vlines: [{ x: sgWrap(a) }], dots: [{ x: sgWrap(a), y: m.pol, tone: "alpha" }, { x: sgWrap(a), y: m.spin, tone: "plus" }], weight: 1.6 })
          ],
          caption: "α = " + sgFmt(sgRound(a, 0.01)) + "°",
          desc: "Left: a polarizer turned " + sgFmt(sgRound(a, 0.01)) + "° from horizontal, with horizontal light in. Middle: a spin analyzer turned the same angle from +z, with |+z⟩ in. Right: cos²α and cos²(α/2) against α; the polarizer passes " + sgFmt(m.pol) + " and the spin analyzer passes " + sgFmt(m.spin) + "."
        };
      },
      checks: {
        a: ["Find where each curve first reaches 0.", "cos²α = 0 at α = 90°; cos²(α/2) = 0 at α/2 = 90°.", c => {
          const pol = c.ans("a-pol"), spin = c.ans("a-spin");
          return sgGrade(sgAngleFits(pol, 90, 180) && sgAngleFits(spin, 180), !sgAngleFits(pol, 90, 180) ? "Check the polarizer: when does H light never pass?" : "Check the spin analyzer: when does |+z⟩ never give +ℏ/2?",
            "A polarizer blocks H light completely at 90°, so |H⟩ and |V⟩ are 90° apart in space. A spin analyzer blocks |+z⟩ completely at 180°, so |+z⟩ and |−z⟩ are 180° apart in space. In both cases the kets are orthogonal: the ket angle is the physical angle for light and half of it for spin.");
        }],
        b: ["The polarizer at 60° passes cos²60° = 1/4.", "cos²(α/2) = 1/4 needs α/2 = 60°.", c => {
          const m = sgHalfModel(c);
          if (!sgAngleFits(m.alpha, 120) && !sgAngleFits(m.alpha, 240)) return sgSetup("Turn α until the spin analyzer passes 1/4. Its P(+) is " + sgFmt(m.spin) + " now.");
          return sgGrade(c.choice("b-pick") === "half", "Compare the angle inside the cosine with the physical turn.",
            "cos²(α/2) = 1/4 at α = 120° (or 240°). The spin ket is |+n⟩ = cos(η/2)|+z⟩ + sin(η/2)|−z⟩, so the ket angle is half the physical angle. Light’s ket |θ⟩ = cos θ|H⟩ + sin θ|V⟩ uses the physical angle itself.");
        }],
        c: ["Put η = 360° into |+n⟩ = cos(η/2)|+z⟩ + sin(η/2)|−z⟩.", "cos 180° = −1 and sin 180° = 0.", c => {
          const coef = c.ans("c-coef"), ok = c.choice("c-pick") === "same";
          return sgGrade(sgFits(coef, -1) && ok, !sgFits(coef, -1) ? "Evaluate cos(360°/2)." : "Does an overall factor of −1 change any probability?",
            "At η = 360°, |+n⟩ = −|+z⟩. A whole turn of the analyzer gives the same physical state, because a global factor of −1 changes no probability. Spin kets need a 720° turn to return exactly, which is the half-angle rule seen from the ket side.");
        }],
        d: ["Polarizer: maximize cos²θ₁ cos²(90° − θ₁).", "Spin: maximize cos²(η/2) cos²((180° − η)/2).", c => {
          const pol = c.ans("d-pol"), spin = c.ans("d-spin");
          return sgGrade(sgAngleFits(pol, 45, 90) && sgAngleFits(spin, 90, 180), !sgAngleFits(pol, 45, 90) ? "Check the polarizer: halfway between H and V." : "Check the spin analyzer: halfway between +z and −z.",
            "Both best middle settings sit halfway between the opposite states: 45° for light (H→45°→V passes 1/2 × 1/2 = 1/4 of the H light) and 90° for spin (+z→+x→−z passes 1/4 of the |+z⟩ atoms). The halfway point is 45° in one case and 90° in the other because opposite states are 90° apart for light and 180° apart for spin.");
        }]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 6–10 · Mystery Oven, sequences, what spin is, and the Designer.
  // ---------------------------------------------------------------------------

  // 6 · Mystery Oven. Each mission has its own hidden oven, atom budget and
  // setting limit. Results are graded against what the learner's own counts imply.
  const SG_SUSPECTS = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
  const SG_SUSPECT_TEXT = { "+x": "|+x⟩", "-x": "|−x⟩", "+y": "|+y⟩", "-y": "|−y⟩", "+z": "|+z⟩", "-z": "|−z⟩" };
  const SG_OVEN_RULES = {
    a: { budget: 20, settings: Infinity, least: 0 },
    b: { budget: 400, settings: 2, least: 100 },
    c: { budget: 600, settings: 3, least: 150 },
    d: { budget: 300, settings: 3, least: 240 }
  };
  function sgOvenStart(c, seed = 1) {
    sgSeed(c, seed);
    const rng = c.s.rng, keys = Object.keys(SG_SUSPECTS);
    const sphere = () => { const z = 2 * rng() - 1, p = 360 * rng(); return sgDir(sgDeg2(Math.acos(z)), p); };
    const suspect = keys[Math.min(5, Math.floor(rng() * 6))];
    c.s.ovens = {
      a: { truth: SG_SUSPECTS[suspect], name: suspect, axes: [], used: 0 },
      b: { truth: sgDir(360 * rng(), 0), axes: [], used: 0 },
      c: { truth: sphere(), axes: [], used: 0 },
      d: { truth: sphere(), axes: [], used: 0 }
    };
  }
  const sgOvenKey = c => c.open() ?? "a";
  // A setting and its opposite measure the same axis with the channels swapped.
  function sgOvenAxis(oven, n, create) {
    for (const axis of oven.axes) {
      if (sgSameDir(axis.n, n, 0.5)) return { axis, sign: 1 };
      if (sgSameDir(axis.n, sgNeg(n), 0.5)) return { axis, sign: -1 };
    }
    if (!create) return null;
    const axis = { n, count: 0, plus: 0 };
    oven.axes.push(axis);
    return { axis, sign: 1 };
  }
  function sgOvenSend(c, k) {
    const key = sgOvenKey(c), oven = c.s.ovens[key], rule = SG_OVEN_RULES[key], n = sgDirOf(c, "m");
    if (oven.used + k > rule.budget) return "Oven " + key + " has " + (rule.budget - oven.used) + " of its " + rule.budget + " atoms left.";
    if (!sgOvenAxis(oven, n, false) && oven.axes.length >= rule.settings) {
      return "Oven " + key + " allows at most " + rule.settings + " magnet settings. Reuse one of your settings or its opposite.";
    }
    const { axis, sign } = sgOvenAxis(oven, n, true), p = sgP(oven.truth, n);
    let plus = 0;
    for (let t = 0; t < k; t++) if (c.s.rng() < p) plus++;
    axis.count += k;
    axis.plus += sign > 0 ? plus : k - plus;
    oven.used += k;
    return sgOneIn(k, "atom") + " from oven " + key + " with the magnet at " + sgDirText(n) + ": " + plus + " at +ℏ/2 and " + (k - plus) + " at −ℏ/2. "
      + oven.used + " of " + rule.budget + " atoms used, " + sgOneIn(oven.axes.length, "setting") + ".";
  }
  const sgMean = axis => (2 * axis.plus - axis.count) / axis.count;

  // Weighted least squares for v with n_k·v ≈ m_k. In the xz-plane only x and z are fitted.
  function sgSolve(A, b) {
    const det3 = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    if (A.length === 2) {
      const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
      if (Math.abs(det) < 1e-6) return null;
      return [(b[0] * A[1][1] - A[0][1] * b[1]) / det, (A[0][0] * b[1] - b[0] * A[1][0]) / det];
    }
    const det = det3(A);
    if (Math.abs(det) < 1e-6) return null;
    return [0, 1, 2].map(j => det3(A.map((row, i) => row.map((v, k) => (k === j ? b[i] : v)))) / det);
  }
  function sgOvenFit(oven, plane) {
    const pick = plane ? n => [n[0], n[2]] : n => n, size = plane ? 2 : 3;
    const A = Array.from({ length: size }, () => new Array(size).fill(0)), b = new Array(size).fill(0);
    let total = 0;
    for (const axis of oven.axes) {
      const u = pick(axis.n), m = sgMean(axis), N = axis.count;
      total += N;
      for (let i = 0; i < size; i++) {
        b[i] += N * m * u[i];
        for (let j = 0; j < size; j++) A[i][j] += N * u[i] * u[j];
      }
    }
    if (!total) return null;
    const scale = total;
    const v = sgSolve(A.map(row => row.map(x => x / scale)), b.map(x => x / scale));
    if (!v) return null;
    const full = plane ? [v[0], 0, v[1]] : v;
    return sgLen(full) < 0.05 ? null : sgUnit(full);
  }
  // Eigenvalues of a symmetric 3×3 matrix (trigonometric method).
  function sgSymEig(M) {
    const p1 = M[0][1] ** 2 + M[0][2] ** 2 + M[1][2] ** 2, q = (M[0][0] + M[1][1] + M[2][2]) / 3;
    if (p1 < 1e-14) return [M[0][0], M[1][1], M[2][2]].sort((a, b) => a - b);
    const p2 = (M[0][0] - q) ** 2 + (M[1][1] - q) ** 2 + (M[2][2] - q) ** 2 + 2 * p1, p = Math.sqrt(p2 / 6);
    const B = M.map((row, i) => row.map((v, j) => (v - (i === j ? q : 0)) / p));
    const detB = B[0][0] * (B[1][1] * B[2][2] - B[1][2] * B[2][1]) - B[0][1] * (B[1][0] * B[2][2] - B[1][2] * B[2][0]) + B[0][2] * (B[1][0] * B[2][1] - B[1][1] * B[2][0]);
    const phi = Math.acos(sgClamp(detB / 2, -1, 1)) / 3;
    const e1 = q + 2 * p * Math.cos(phi), e3 = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3);
    return [e3, 3 * q - e1 - e3, e1].sort((a, b) => a - b);
  }
  // Precision score of a design: 3·λ_min(Σ N_k n_k n_kᵀ)/N. Perpendicular settings with equal atoms give 1.
  function sgScore(oven) {
    const total = oven.axes.reduce((sum, axis) => sum + axis.count, 0);
    if (!total) return 0;
    const M = [0, 1, 2].map(i => [0, 1, 2].map(j => oven.axes.reduce((sum, axis) => sum + axis.count * axis.n[i] * axis.n[j], 0)));
    return Math.max(0, 3 * sgSymEig(M)[0] / total);
  }
  function sgLogLike(oven, candidate) {
    let total = 0;
    for (const axis of oven.axes) {
      const p = sgP(candidate, axis.n), minus = axis.count - axis.plus;
      if ((p < 1e-12 && axis.plus) || (p > 1 - 1e-12 && minus)) return -Infinity;
      if (axis.plus) total += axis.plus * Math.log(p);
      if (minus) total += minus * Math.log(1 - p);
    }
    return total;
  }
  function sgOvenEstimateGrader(key, plane) {
    return c => {
      const oven = c.s.ovens[key], rule = SG_OVEN_RULES[key];
      if (oven.used < rule.least) return sgSetup("Spend at least " + rule.least + " atoms on oven " + key + " first. You have used " + oven.used + ".");
      const est = sgOvenFit(oven, plane);
      if (!est) return sgSetup(plane ? "Your settings can’t fix a direction in the xz-plane yet. Use two settings whose xz parts are not parallel." : "Your settings can’t fix a direction yet. Use three settings that don’t lie in one plane.");
      if (key === "d") {
        const score = sgScore(oven);
        if (score < 0.8) return sgSetup("Your precision score is " + sgFmt(sgRound(score, 0.001)) + ". Choose settings closer to perpendicular, with the atoms split more evenly.");
      }
      const typed = plane ? sgDir(c.ans(key + "-eta"), 0) : sgDir(c.ans(key + "-eta"), c.ans(key + "-phi"));
      const off = sgBetween(typed, est), truth = sgBetween(est, oven.truth);
      const found = sgAngles(est);
      return sgGrade(off <= 3 + 1e-9, "Your answer is " + sgFmt(sgRound(off, 0.1)) + "° from the direction your own counts imply. Use the means m = (up − down)/atoms.",
        "From your counts, the best fit is η ≈ " + sgFmt(sgRound(plane ? sgWrap(sgDeg2(Math.atan2(est[0], est[2]))) : found.eta, 0.1)) + "°" + (plane ? "" : ", φ ≈ " + sgFmt(sgRound(found.phi, 0.1)) + "°")
        + ". The hidden oven pointed " + sgFmt(sgRound(truth, 0.1)) + "° from that estimate. Your grade used only your counts, so a lucky or unlucky run doesn’t matter." + (key === "d" ? " Your precision score was " + sgFmt(sgRound(sgScore(oven), 0.001)) + "." : ""));
    };
  }

  // 7 · Analyzer Chain Builder. Stages A1 … A5 in the xz-plane, each with a selector.
  function sgChainModel(c) {
    const count = Number(c.val("count")), source = SG_SOURCES[c.val("source")];
    const stages = Array.from({ length: count }, (_, k) => ({ eta: sgDeg(c, "a" + (k + 1) + "-eta"), q: c.val("a" + (k + 1) + "-pass") === "minus" ? -1 : 1 }))
      .map(stage => ({ ...stage, n: sgDir(stage.eta, 0) }));
    return { count, source, stages, run: sgChainRun(source.dir, stages) };
  }
  const SG_CHAIN_CARDS = {
    a: { source: "plus-z", stages: [[90, "plus"], [0, "minus"], [90, "plus"]] },
    b: { source: "plus-x", stages: [[0, "plus"], [90, "minus"], [0, "plus"]] },
    d: { source: "plus-z", stages: [[60, "plus"], [120, "plus"], [0, "plus"]] }
  };
  function sgChainLoad(c, card) {
    c.field("source").value = card.source;
    c.field("count").value = String(card.stages.length);
    card.stages.forEach(([eta, pass], k) => { c.set("a" + (k + 1) + "-eta", eta); c.field("a" + (k + 1) + "-pass").value = pass; });
  }

  // 8 · Recombine the Beams. A Z splitter, two paths, a reversed magnet that
  // recombines them, then a final analyzer F along n.
  const SG_MYSTERY = sgDir(135, 0);
  function sgLoopModel(c) {
    const key = c.val("source"), s = key === "mystery" ? SG_MYSTERY : SG_SOURCES[key].dir, paths = c.val("paths"), n = sgDirOf(c, "f");
    const up = (1 + s[2]) / 2;
    let weight = 1, v = s;
    if (paths === "block-plus") { weight = 1 - up; v = [0, 0, -1]; }
    if (paths === "block-minus") { weight = up; v = [0, 0, 1]; }
    if (paths === "tag") v = [0, 0, s[2]];
    return { key, s, paths, n, up, weight, v, plus: weight * (1 + sgDot(v, n)) / 2, minus: weight * (1 - sgDot(v, n)) / 2 };
  }
  function sgLoopSend(c, k) {
    const m = sgLoopModel(c), rng = c.s.rng;
    let lost = 0, plus = 0;
    for (let t = 0; t < k; t++) {
      if (m.paths === "open") { if (rng() < (1 + sgDot(m.s, m.n)) / 2) plus++; continue; }
      // Blocked or tagged: the atom takes one path, which leaves it in |+z⟩ or |−z⟩.
      const upper = rng() < m.up;
      if ((upper && m.paths === "block-plus") || (!upper && m.paths === "block-minus")) { lost++; continue; }
      if (rng() < (1 + (upper ? m.n[2] : -m.n[2])) / 2) plus++;
    }
    const minus = k - lost - plus;
    c.s.counts.sent += k; c.s.counts.lost += lost; c.s.counts.plus += plus; c.s.counts.minus += minus;
    return sgOneIn(k, "atom") + ": " + lost + " blocked, " + plus + " at F+ and " + minus + " at F−. Totals: " + c.s.counts.sent + " sent, "
      + c.s.counts.lost + " blocked, " + c.s.counts.plus + " F+, " + c.s.counts.minus + " F−.";
  }
  const sgLoopClear = c => { c.s.counts = { sent: 0, lost: 0, plus: 0, minus: 0 }; };
  function sgLoopGrader(source, pathsOk, test, fail, work) {
    return c => {
      const m = sgLoopModel(c);
      if (m.key !== source) return sgSetup("Choose the source the mission names.");
      if (!pathsOk(m.paths)) return sgSetup("Set the paths as the mission says.");
      return sgGrade(test(c, m), typeof fail === "function" ? fail(m) : fail, work);
    };
  }
  const sgAlongX = n => Math.abs(n[0]) >= Math.cos(sgRad(SG_ANGLE)) - 1e-12;

  // 9 · Magnitude vs Component.
  const SG_CONE = sgDeg2(Math.acos(1 / Math.sqrt(3)));

  // 10 · Beamline Designer. Stages D1 … D4 with any direction.
  function sgDesignModel(c) {
    const count = Number(c.val("count")), sourceKey = c.val("source"), source = SG_SOURCES[sourceKey];
    const stages = Array.from({ length: count }, (_, k) => {
      const i = k + 1, eta = sgDeg(c, "d" + i + "-eta"), phi = sgDeg(c, "d" + i + "-phi");
      return { eta, phi, n: sgDir(eta, phi), q: c.val("d" + i + "-pass") === "minus" ? -1 : 1 };
    });
    return { count, sourceKey, source, stages, run: sgChainRun(source.dir, stages) };
  }
  function sgDesignGrader(target, test, want) {
    return c => {
      const m = sgDesignModel(c), { overall, out } = m.run;
      if (m.sourceKey !== "plus-z") return sgSetup("Use the source |+z⟩ for this card.");
      if (overall < 1e-9) return sgGrade(false, "No atoms reach the end of your beamline. Check each selector.");
      const where = sgSameDir(out, target), enough = test(overall);
      return sgGrade(where && enough, !where ? "Your beam leaves in " + sgKetText(out) + " along " + sgDirText(out) + ", not " + sgKetText(target) + "." : "The output state is right, but " + sgFmt(overall) + " of the atoms arrive. You need " + want + ".",
        "Your beamline delivers " + sgKetText(out) + " with " + sgFmt(overall) + " of the atoms. The checker tested your own beamline, so any design that meets the card passes.");
    };
  }

  const sgStations2 = {
    // 6 · Mystery Oven ------------------------------------------------------------------------------------
    oven: {
      start: c => sgOvenStart(c),
      show(c) {
        const key = sgOvenKey(c), oven = c.s.ovens[key], rule = SG_OVEN_RULES[key], n = sgDirOf(c, "m");
        const limit = Number.isFinite(rule.settings) ? ", at most " + rule.settings + " settings" : "";
        c.put("state", "Oven " + key + (c.open() ? "" : " (open a mission to pick its oven)") + ": " + oven.used + " of " + rule.budget + " atoms used" + limit
          + ". Seed " + c.s.seed + ". The magnet points along " + sgDirText(n) + "." + (key === "d" ? " Precision score of your design: " + sgFmt(sgRound(sgScore(oven), 0.001)) + "." : ""));
        c.list("log", oven.axes.length ? oven.axes.map((axis, k) => "Setting " + (k + 1) + " along " + sgDirText(axis.n) + ": " + axis.count + " atoms, "
          + axis.plus + " at +ℏ/2 and " + (axis.count - axis.plus) + " at −ℏ/2, mean m = " + sgFmt(sgRound(sgMean(axis), 0.001)) + ".") : ["No atoms sent from this oven yet."]);
        const items = view => [
          ...oven.axes.flatMap(axis => [sgArrow(view(axis.n), "guide", "", { dashed: true }), sgArrow(view(axis.n.map(x => x * sgMean(axis))), "plus", "", { dot: true, size: 5 })]),
          sgArrow(view(n), "angle", "magnet")];
        return {
          panels: [sgPlane("side view (xz)", items(sgXZ), { axes: ["x", "z"] }), sgPlane("top view (xy)", items(sgXY), { axes: ["x", "y"] })],
          caption: "oven " + key,
          desc: "Side and top views. The yellow arrow is the magnet’s axis. Each dashed line is a setting you used, with a green dot at m times that direction, where m is your mean reading on that setting. The oven’s direction is hidden."
        };
      },
      actions: {
        send1: c => sgOvenSend(c, 1),
        send10: c => sgOvenSend(c, 10),
        send50: c => sgOvenSend(c, 50),
        reseed: c => { const seed = c.s.seed + 1; sgOvenStart(c, seed); return "Seed " + seed + ". All four ovens are refilled with new hidden directions. Reset this station to return to seed 1."; }
      },
      checks: {
        a: ["A setting rules out a suspect when it shows a reading that suspect can never give.", "Try z first. Mixed readings rule out ±z; all one sign makes ±z likely. Then try x or y.", c => {
          const oven = c.s.ovens.a, pick = c.choice("a-pick");
          if (!oven.used) return sgSetup("Send some atoms from oven a first.");
          const logs = Object.fromEntries(Object.entries(SG_SUSPECTS).map(([k, v]) => [k, sgLogLike(oven, v)]));
          const ranked = Object.keys(logs).sort((p, q) => logs[q] - logs[p]), best = ranked[0], second = ranked[1];
          if (pick !== best) return sgGrade(false, "Your counts favor " + SG_SUSPECT_TEXT[best] + " over " + SG_SUSPECT_TEXT[pick] + ".");
          const ratio = Math.exp(logs[best] - logs[second]);
          if (ratio < 20) return sgGrade(false, "Your counts favor " + SG_SUSPECT_TEXT[best] + ", but only " + sgFmt(sgRound(ratio, 0.1)) + ":1 over " + SG_SUSPECT_TEXT[second] + ". Spend atoms on a setting that separates them.");
          return sgGrade(true, "", "Your counts favor " + SG_SUSPECT_TEXT[best] + " by at least " + (Number.isFinite(ratio) ? sgFmt(sgRound(ratio, 1)) : "an unlimited factor") + ":1 over every other suspect, using " + oven.used + " atoms. The oven was " + SG_SUSPECT_TEXT[oven.name] + ". A reading of −ℏ/2 on a +n analyzer rules out |+n⟩ completely; perpendicular suspects give 50/50 and fade by a factor of 2 per atom.");
        }],
        b: ["Use a z setting and an x setting. Each mean estimates one component: m_z ≈ cos η and m_x ≈ sin η.", "η = atan2(m_x, m_z), taken in the right quadrant.", sgOvenEstimateGrader("b", true)],
        c: ["Use x, y and z settings. The means estimate the three components of the oven’s direction.", "η = arccos(m_z/r) and φ = atan2(m_y, m_x), with r = √(m_x² + m_y² + m_z²).", sgOvenEstimateGrader("c", false)],
        d: ["The score is 1 for three perpendicular settings with equal atoms.", "Use x, y and z with 80 to 100 atoms each.", sgOvenEstimateGrader("d", false)]
      }
    },

    // 7 · Analyzer Chain Builder --------------------------------------------------------------------------
    chain: {
      load(c, check) {
        if (SG_CHAIN_CARDS[check]) sgChainLoad(c, SG_CHAIN_CARDS[check]);
        if (check === "c") { c.field("source").value = "plus-z"; c.field("count").value = "3"; }
      },
      show(c) {
        const m = sgChainModel(c), model = c.checked("model");
        for (let k = 1; k <= 5; k++) { const group = c.node('[data-sg-stage="' + k + '"]'); if (group) group.hidden = k > m.count; }
        const items = [{ title: "source", sub: m.source.ket, tone: "plus" }];
        m.stages.forEach((stage, k) => {
          const row = m.run.rows[k];
          items.push({ title: "A" + (k + 1), sub: sgFmt(sgRound(stage.eta, 0.1)) + "° " + (stage.q > 0 ? "+" : "−"), tone: "alpha", below: model ? sgFmt(sgRound(row.conditional, 0.0001)) : "", belowTone: "angle" });
        });
        items.push({ title: "end", sub: model ? sgFmt(sgRound(m.run.overall, 0.0001)) : "?", tone: "angle" });
        c.put("state", model
          ? m.run.rows.map((row, k) => "A" + (k + 1) + ": reached " + sgFmt(row.reached) + ", P(pass | reached) = " + sgFmt(row.conditional) + ", blocked " + sgFmt(row.blocked) + ".").join(" ")
            + " Surviving to the end: " + sgFmt(m.run.overall) + " of all atoms sent" + (m.run.overall > 1e-9 ? ", in " + sgKetText(m.run.out) + "." : ".")
          : "Model hidden. Work out the ledger yourself, then tick Show the model to check it.");
        return {
          panels: [sgChain(model ? "chain (yellow under each stage: P(pass | reached))" : "chain", items, { note: model ? "end box: fraction of all atoms sent" : "tick Show the model for the numbers" })],
          caption: m.count + " stages",
          desc: "Source " + m.source.ket + ", then " + m.stages.map((stage, k) => "A" + (k + 1) + " at " + sgFmt(sgRound(stage.eta, 0.1)) + "° passing " + (stage.q > 0 ? "+" : "−")).join(", ") + "."
            + (model ? " " + sgFmt(m.run.overall) + " of the atoms reach the end." : "")
        };
      },
      checks: {
        a: ["P_A1(+x | +z) = 1/2, then each later stage is 90° from the state it receives.", "Multiply P_A1 × P_A2(− | A1 = +) × P_A3(+ | A2 = −).", c => {
          const all = c.ans("a-all"), cond = c.ans("a-cond");
          return sgGrade(sgFits(all, 1 / 8) && sgFits(cond, 1 / 2), !sgFits(cond, 1 / 2) ? "The conditional at A3 uses only the atoms that reach A3." : "The overall fraction multiplies every stage, starting with P_A1.",
            "A1 passes 1/2 in |+x⟩. A2 measures Z and passes −: 1/2 of those, in |−z⟩. A3 measures X and passes +: 1/2 of those. Overall 1/2 × 1/2 × 1/2 = 1/8 of all atoms sent. Given an atom reaches A3, it passes with probability 1/2.");
        }],
        b: ["Every atom that leaves the source ends up blocked at some stage or reaches the end.", "Blocked at A1 = 1 − P_A1; blocked at A2 = (reached A2) × (1 − P_A2).", c => {
          const v = ["b-1", "b-2", "b-3", "b-out"].map(name => c.ans(name)), want = [1 / 2, 1 / 4, 1 / 8, 1 / 8];
          const miss = v.findIndex((x, i) => !sgFits(x, want[i]));
          return sgGrade(miss < 0, ["Blocked at A1", "Blocked at A2", "Blocked at A3", "The end"][Math.max(0, miss)] + " is not right yet.",
            "|+x⟩ meets Z, passing +: 1/2 is blocked. The 1/2 in |+z⟩ meets X, passing −: half of it, 1/4, is blocked. The 1/4 in |−x⟩ meets Z, passing +: 1/8 is blocked and 1/8 reaches the end. 1/2 + 1/4 + 1/8 + 1/8 = 1, so every atom is accounted for.");
        }],
        c: ["Rotate in equal steps, so each stage turns the state by the same angle.", "Three steps of 60°: 60°, 120°, 180°, all passing +. Each passes cos²30° = 3/4.", c => {
          const m = sgChainModel(c);
          if (c.val("source") !== "plus-z") return sgSetup("Use the source |+z⟩.");
          if (m.count !== 3) return sgSetup("Use exactly three analyzers.");
          const flipped = m.run.overall > 1e-9 && sgSameDir(m.run.out, [0, 0, -1]);
          return sgGrade(flipped && m.run.overall > 0.4, !flipped ? "The atoms must leave the last stage in |−z⟩." : sgFmt(m.run.overall) + " of the atoms arrive. You need more than 0.4.",
            "Three equal 60° steps keep (3/4)³ = 27/64 ≈ 0.42 of the atoms. One analyzer set straight to −z would keep none of a |+z⟩ beam. Smaller steps keep more: with more stages the fraction approaches 1.");
        }],
        d: ["Forward: P(60° | +z) × P(120° | 60°) × P(0° | 120°).", "Reversed: P(0° | +z) × P(120° | 0°) × P(60° | 120°).", c => {
          const f = c.ans("d-fwd"), r = c.ans("d-rev");
          return sgGrade(sgFits(f, 9 / 64) && sgFits(r, 3 / 16), !sgFits(f, 9 / 64) ? "Check the forward chain." : "Check the reversed chain. Reorder the stages to see it.",
            "Forward: 3/4 × 3/4 × 1/4 = 9/64. Reversed: 1 × 1/4 × 3/4 = 3/16. The same three analyzers in a different order give different results, because each selector prepares the state the next one sees.");
        }]
      }
    },

    // 8 · Recombine the Beams -----------------------------------------------------------------------------
    recombine: {
      start(c) { sgSeed(c); sgLoopClear(c); },
      edit(c, name) { if (["source", "paths", "f-eta", "f-phi", "f-eta-range", "f-phi-range"].includes(name)) sgLoopClear(c); },
      show(c) {
        const m = sgLoopModel(c), k = c.s.counts;
        const pathText = { open: "both paths open, recombined with no which-path record", "block-plus": "the +z path blocked", "block-minus": "the −z path blocked", tag: "both paths open, each tagged by a which-path marker" }[m.paths];
        c.put("state", "Source " + (m.key === "mystery" ? "mystery |+n⟩" : SG_SOURCES[m.key].ket) + ", " + pathText + ", final analyzer F along " + sgDirText(m.n)
          + ". Model: F+ " + sgFmt(m.plus) + ", F− " + sgFmt(m.minus) + ", blocked " + sgFmt(1 - m.weight) + " of the atoms sent. Seed " + c.s.seed + ", " + k.sent + " atoms sent so far.");
        return {
          panels: [{ kind: "loop", caption: "split along z, recombine, then analyze along n", paths: m.paths, plus: m.plus, minus: m.minus, lost: 1 - m.weight, n: m.n, counts: k }],
          caption: m.paths,
          desc: "A Z magnet splits the beam into a +z path and a −z path. A reversed magnet brings them back together before the final analyzer F. " + pathText + ". F+ gets " + sgFmt(m.plus) + " and F− gets " + sgFmt(m.minus) + " of the atoms sent."
        };
      },
      actions: {
        send1: c => sgLoopSend(c, 1),
        send10: c => sgLoopSend(c, 10),
        send100: c => sgLoopSend(c, 100),
        clear: c => { sgLoopClear(c); return "Counts cleared."; },
        reseed: c => { sgLoopClear(c); return sgReseed(c); }
      },
      checks: {
        a: ["With nothing recording the path, the recombined beam is the original state.", "Point F along +x.", sgLoopGrader("plus-x", p => p === "open", (c, m) => sgSameDir(m.n, [1, 0, 0]) && sgFits(c.ans("a-p"), 1),
          m => sgSameDir(m.n, [1, 0, 0]) ? "What fraction of the |+x⟩ atoms give +ℏ/2 along x?" : "Point the final analyzer along +x.",
          "Splitting along z and recombining without any record of the path restores |+x⟩ exactly, including the relative phase between |+z⟩ and |−z⟩. Every atom reaches F+: P = 1. This is an idealized thought experiment; undoing the split so precisely that the paths can’t be told apart is extremely hard in practice.")],
        b: ["Blocking one path is a selector: half the atoms are lost, and the rest are in a Z eigenstate.", "A Z eigenstate gives 1/2 along x.", sgLoopGrader("plus-x", p => p === "block-plus" || p === "block-minus", (c, m) => sgAlongX(m.n) && sgFits(c.ans("b-p"), 1 / 4),
          m => sgAlongX(m.n) ? "Count the blocked atoms in the fraction of all atoms sent." : "Point the final analyzer along +x or −x.",
          "With one path blocked, 1/2 of the atoms are lost and the survivors are in |+z⟩ or |−z⟩. Along x they split 1/2–1/2, so F+ gets 1/2 × 1/2 = 1/4 of the atoms sent. The original |+x⟩ does not come back.")],
        c: ["A which-path record acts like a Z measurement, even if nobody reads it.", "Each atom is then in |+z⟩ or |−z⟩.", sgLoopGrader("plus-x", p => p === "tag", (c, m) => sgAlongX(m.n) && sgFits(c.ans("c-p"), 1 / 2) && c.choice("c-pick") === "measure",
          "Check both answers: the F+ fraction and the reason.",
          "With a marker on each path no atom is lost, but each one carries a record of its path, so it behaves as |+z⟩ or |−z⟩ with probability 1/2 each. Along x that gives 1/2 at F+, not 1. Recombining only restores the state when nothing anywhere records which path was taken.")],
        d: ["With both paths open and no record, F sees the source state itself.", "Find the direction where F+ reaches 1.", sgLoopGrader("mystery", p => p === "open", (c, m) => sgSameDir(m.n, SG_MYSTERY),
          m => "F+ is " + sgFmt(m.plus) + ". Turn F until every atom gives +ℏ/2.",
          "F+ = 1 only when n points along the source direction, η = 135°, φ = 0°. The recombined beam carries the whole state, so one alignment finds it. With a path blocked or tagged, no direction gives F+ = 1.")]
      }
    },

    // 9 · Magnitude vs Component --------------------------------------------------------------------------
    magnitude: {
      show(c) {
        const axis = c.val("comp"), az = sgDeg(c, "az");
        c.put("state", "Vector model for a state with definite S_" + axis + " = +ℏ/2: length |S| = (√3/2)ℏ ≈ 0.866ℏ, tilted " + sgFmt(sgRound(SG_CONE, 0.01)) + "° from the " + axis
          + " axis. The azimuth " + sgFmt(az) + "° is only for the picture: the other two components have no definite values.");
        return {
          panels: [{ kind: "cone", caption: "vector model (picture)", axis, az }],
          caption: "definite S_" + axis,
          desc: "A cone around the " + axis + " axis. A vector of length 0.866ℏ lies on the cone, with its " + axis + " component ℏ/2. The axis length ℏ/2 is shorter than the vector, so the vector can never lie along the axis."
        };
      },
      checks: {
        a: ["|S| = √(s(s + 1)) ℏ with s = 1/2.", "s(s + 1) = 3/4.", c => {
          const mag = c.ans("a-mag"), sq = c.ans("a-sq");
          return sgGrade(sgFits(mag, Math.sqrt(3) / 2) && sgFits(sq, 0.75), !sgFits(sq, 0.75) ? "Find s(s + 1) for s = 1/2." : "Take the square root.",
            "S² has the single eigenvalue s(s + 1)ℏ² = (3/4)ℏ² on every spin-½ state, so |S| = (√3/2)ℏ ≈ 0.866ℏ. That is longer than the largest component reading, ℏ/2.");
        }],
        b: ["cos(tilt) = component / length.", "(1/2)/(√3/2) = 1/√3.", c => {
          const angle = c.ans("b-angle");
          return sgGrade(sgAngleFits(angle, SG_CONE) && c.choice("b-pick") === "never", !sgAngleFits(angle, SG_CONE) ? "Use cos(tilt) = (ℏ/2)/((√3/2)ℏ)." : "Compare |S_z| with |S|.",
            "cos(tilt) = 1/√3, so the tilt is arccos(1/√3) ≈ 54.74°. To lie along z the vector would need S_z = |S| = 0.866ℏ, but S_z only reads ±ℏ/2. So spin never points exactly along an axis.");
        }],
        c: ["Each component reads ±ℏ/2.", "Add the three squares: S² = S_x² + S_y² + S_z².", c => {
          const x2 = c.ans("c-x2"), sum = c.ans("c-sum");
          return sgGrade(sgFits(x2, 0.25) && sgFits(sum, 0.75), !sgFits(x2, 0.25) ? "Square a reading of ±1/2." : "Add three equal squares.",
            "Every reading of S_x, S_y or S_z is ±ℏ/2, so each square is ℏ²/4 and S_x² = S_y² = S_z² = (ℏ²/4)I. Their sum is (3/4)ℏ² I = S², matching s(s + 1)ℏ².");
        }],
        d: ["[X, Y] = 2iZ, and S = (ℏ/2)σ.", "[S_x, S_y] = (ℏ/2)²[X, Y] = (ℏ²/4)(2iZ).", c => {
          const k = c.ans("d-c");
          return sgGrade(sgFits(k, 1) && c.choice("d-pick") === "x", !sgFits(k, 1) ? "Write (ℏ²/4)(2iZ) in terms of S_z = (ℏ/2)Z." : "Cycle x → y → z → x.",
            "[S_x, S_y] = (ℏ²/4)(2iZ) = iℏ(ℏ/2)Z = iℏS_z, so c = 1. Cycling the labels gives [S_y, S_z] = iℏS_x and [S_z, S_x] = iℏS_y.");
        }],
        e: ["|+z⟩ = (|+x⟩ + |−x⟩)/√2.", "Two observables with definite values together need a shared eigenket.", c => {
          const p = c.ans("e-p");
          return sgGrade(sgFits(p, 0.5) && c.choice("e-pick") === "noshared", !sgFits(p, 0.5) ? "Find |⟨+x|+z⟩|²." : "What would a state with definite S_x and definite S_z have to be?",
            "In |+z⟩, S_z is definite but S_x gives ±ℏ/2 with probability 1/2 each. Both values definite together would need a ket that is an eigenket of S_x and S_z at once, and since [S_z, S_x] = iℏS_y ≠ 0 they share none. Lesson 15 turns this into an inequality.");
        }]
      }
    },

    // 10 · Beamline Designer ------------------------------------------------------------------------------
    designer: {
      show(c) {
        const m = sgDesignModel(c);
        for (let k = 1; k <= 4; k++) { const group = c.node('[data-sg-stage="' + k + '"]'); if (group) group.hidden = k > m.count; }
        const out = m.run.overall > 1e-9 ? sgKetText(m.run.out) + " along " + sgDirText(m.run.out) : "no atoms";
        c.put("state", "Source " + m.source.ket + " → " + m.stages.map((st, k) => "D" + (k + 1) + " along " + sgDirText(st.n) + " passing " + (st.q > 0 ? "+" : "−")).join(" → ")
          + ". Output: " + out + ", " + sgFmt(m.run.overall) + " of the atoms sent.");
        const items = [{ title: "source", sub: m.source.ket, tone: "plus" }];
        m.stages.forEach((st, k) => items.push({ title: "D" + (k + 1) + " " + (st.q > 0 ? "+" : "−"), sub: sgFmt(sgRound(st.eta, 1)) + "°, " + sgFmt(sgRound(st.phi, 1)) + "°", tone: "minus",
          below: sgFmt(sgRound(m.run.rows[k].conditional, 0.001)), belowTone: "angle" }));
        items.push({ title: m.run.overall > 1e-9 ? sgKetText(m.run.out) : "none", sub: sgFmt(sgRound(m.run.overall, 0.0001)), tone: "angle" });
        return {
          panels: [sgChain("your beamline (stage: η, φ; yellow: P(pass | reached))", items, { note: "last box: output state and fraction of all atoms sent" })],
          caption: m.count + (m.count === 1 ? " stage" : " stages"),
          desc: "Source " + m.source.ket + " and " + m.count + " analyzer stages. Output " + out + " with " + sgFmt(m.run.overall) + " of the atoms."
        };
      },
      checks: {
        a: ["A Y analyzer splits |+z⟩ evenly.", "One stage along +y passing −, or along −y passing +.", sgDesignGrader([0, -1, 0], f => sgNear(f, 0.5), "1/2")],
        b: ["Rotate +z to −z in equal steps; each step of angle θ keeps cos²(θ/2).", "Four steps of 45°: η = 45°, 90°, 135°, 180°, all passing +, keep about 0.53.", sgDesignGrader([0, 0, -1], f => f >= 0.5 - 1e-12, "at least 1/2")],
        c: ["3/8 = 3/4 × 1/2. A stage 60° from +z keeps 3/4.", "If that stage lies in the yz-plane (φ = 90°), it is 90° from +x, so an x stage keeps 1/2.", sgDesignGrader([1, 0, 0], f => sgNear(f, 3 / 8), "3/8")],
        d: ["With two stages, the second must be along ±x.", "Find the largest P(stage 1) × P(stage 2) over every first direction.", c => sgGrade(c.choice("d-pick") === "no", "Try to beat 1/4 with two stages, using the formula for each step.",
          "With D2 along x, the product is (1 + n·x)/2 × (1 − n·x)/2 = (1 − (n·x)²)/4 for D1 along n, which is largest, 1/4, when n ⟂ x. So two stages can deliver at most 1/4, below 1/3. Three 60° steps keep (3/4)³ ≈ 0.42.")]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 11–14 · Recurring formats and extras.
  // ---------------------------------------------------------------------------

  // 11 · Error Detective.
  const SG_ERRORS = {
    half: { line: 2, text: "Case 1 · the 60° analyzer", claim: "P(+) = 1/4", truth: "P(+) = 3/4",
      work: "Line 2 uses cos²θ. The rule is P(+) = cos²(θ/2) = cos²30° = 3/4, so P(−) = 1/4 and most atoms read +ℏ/2. cos²θ is the polarizer rule, where opposite states are 90° apart; for spin they are 180° apart." },
    blocked: { line: 3, text: "Case 2 · the share at B−", claim: "1/2 of all sent", truth: "1/4 of all sent",
      work: "Lines 1 and 2 are right. Line 3 forgets the atoms blocked at A: only 1/2 of the atoms sent reach B, so B− gets 1/2 × 1/2 = 1/4 of all atoms sent. B+ gets 1/4, and the other 1/2 never reach B." },
    chain: { line: 4, text: "Case 3 · three analyzers", claim: "1/4 at C+", truth: "1/8 at C+",
      work: "Lines 1–3 are right. Line 4 multiplies the two conditional probabilities but leaves out P_A(+) = 1/2, the chance of getting past A at all. The share of all atoms sent is 1/2 × 1/2 × 1/2 = 1/8. The product 1/4 is the share among atoms that pass A." },
    selector: { line: 2, text: "Case 4 · what the selector does", claim: "nothing reaches B", truth: "P_B(+ | A = +) = 1",
      work: "Line 2 treats the selector as an absorbing detector. The selector only blocks A−; the A+ atoms pass untouched in |+x⟩. B measures X again, so P_B(+ | A = +) = 1, with 1/2 of the atoms sent reaching B+." },
    points: { line: 2, text: "Case 5 · where |+z⟩ points", claim: "S along +z, S_x = 0", truth: "|S| = (√3/2)ℏ, S_x = ±ℏ/2",
      work: "Line 1 is right. Line 2 says the spin points along z. |S| = (√3/2)ℏ is larger than S_z = ℏ/2, so it can’t lie along z, and S_x is not definite: an S_x analyzer gives +ℏ/2 or −ℏ/2 with probability 1/2 each. It never reads 0." }
  };
  function sgErrorGrader(key) {
    return c => {
      const card = SG_ERRORS[key], line = Number(c.choice(key + "-line")), kind = c.choice(key + "-kind");
      if (line !== card.line && kind === key) return sgGrade(false, "That names the mistake, but it first appears on a different line.");
      if (line === card.line && kind !== key) return sgGrade(false, "That is the first wrong line. Name what goes wrong there more precisely.");
      return sgGrade(line === card.line && kind === key, "Check each line in order, and stop at the first one that is false.", card.work);
    };
  }

  // 12 · Quantum Preview: Precession. The spin turns from +x toward +y once per period T.
  const SG_PREVIEW_AXES = { "+x": [1, 0, 0], "+y": [0, 1, 0], "-x": [-1, 0, 0], "+z": [0, 0, 1] };
  function sgPreviewModel(c) {
    const t = sgClamp(Number.isFinite(c.num("t")) ? c.num("t") : 0, 0, 3), input = c.val("input"), axis = c.val("axis");
    const s = input === "+z" ? [0, 0, 1] : [Math.cos(2 * Math.PI * t), Math.sin(2 * Math.PI * t), 0];
    const n = SG_PREVIEW_AXES[axis];
    const curve = tt => input === "+z" ? sgP([0, 0, 1], n) : sgP([Math.cos(2 * Math.PI * tt), Math.sin(2 * Math.PI * tt), 0], n);
    return { t, input, axis, s, n, p: sgP(s, n), curve };
  }

  // 13 · 3D Stern–Gerlach Bench. The beam runs along +y. Each magnet rolls about
  // the beam, so its axis is n = (sin ρ, 0, cos ρ). Every channel continues; the
  // screen shows one spot per path with nonzero probability.
  const SG_BENCH = { source: -1.3, screen: 1.3, kick: 0.2, half: 0.95, places: { 1: [0], 2: [-0.45, 0.35], 3: [-0.75, -0.1, 0.55] } };
  function sgBenchModel(c) {
    const count = Number(c.val("count")), src = sgDirOf(c, "src");
    const ys = SG_BENCH.places[count];
    const magnets = ys.map((y, k) => { const roll = sgDeg(c, "roll" + (k + 1)); return { y, roll, n: sgDir(roll, 0) }; });
    const segments = [], leaves = [];
    const offset = (kicks, y) => kicks.reduce((p, kick) => [p[0] + kick.v[0] * (y - kick.y), p[1] + kick.v[2] * (y - kick.y)], [0, 0]);
    const point = (kicks, y) => { const [x, z] = offset(kicks, y); return [x, y, z]; };
    segments.push({ from: [0, SG_BENCH.source, 0], to: [0, magnets[0].y, 0], prob: 1, tone: "guide" });
    (function walk(k, state, prob, kicks, signs) {
      if (k === magnets.length) {
        const [x, z] = offset(kicks, SG_BENCH.screen);
        leaves.push({ signs, prob, x, z });
        return;
      }
      const m = magnets[k], up = sgP(state, m.n);
      for (const [q, p] of [[1, up], [-1, 1 - up]]) {
        if (p < 1e-9) continue;
        const next = [...kicks, { y: m.y, v: m.n.map(v => -q * SG_BENCH.kick * v) }];
        const end = k + 1 < magnets.length ? magnets[k + 1].y : SG_BENCH.screen;
        segments.push({ from: point(kicks, m.y), to: point(next, end), prob: prob * p, tone: q > 0 ? "plus" : "minus" });
        walk(k + 1, q > 0 ? m.n : sgNeg(m.n), prob * p, next, signs + (q > 0 ? "+" : "−"));
      }
    })(0, src, 1, [], "");
    return { count, src, magnets, segments, leaves };
  }
  function sgBenchSend(c, k) {
    const m = sgBenchModel(c), tally = {};
    for (let t = 0; t < k; t++) {
      let r = c.s.rng(), leaf = m.leaves.at(-1);
      for (const candidate of m.leaves) { if (r < candidate.prob) { leaf = candidate; break; } r -= candidate.prob; }
      c.s.hits.push({ x: leaf.x + 0.03 * sgGauss(c.s.rng), z: leaf.z + 0.03 * sgGauss(c.s.rng) });
      tally[leaf.signs] = (tally[leaf.signs] ?? 0) + 1;
    }
    if (c.s.hits.length > 600) c.s.hits.splice(0, c.s.hits.length - 600);
    c.s.sent += k;
    return sgOneIn(k, "atom") + " on the screen: " + Object.entries(tally).map(([signs, n]) => "spot " + signs + " " + n).join(", ") + ". " + c.s.sent + " atoms sent since the last change.";
  }
  const sgBenchClear = c => { c.s.hits = []; c.s.sent = 0; };
  const SG_BENCH_CARDS = { a: { src: [90, 90], count: 1 }, b: { src: [0, 0], count: 3, rolls: [0, 90, 0] }, c: { src: [90, 0], count: 3 }, d: { src: [0, 0], count: 2 } };
  function sgBenchSetup(c, key) {
    const card = SG_BENCH_CARDS[key], m = sgBenchModel(c);
    if (m.count !== card.count) return "Use " + sgOneIn(card.count, "magnet") + ".";
    if (!sgSameDir(m.src, sgDir(...card.src))) return "Set the source as the mission says. Reopening the mission sets it.";
    if (card.rolls && !card.rolls.every((roll, k) => sgAngleFits(m.magnets[k].roll, roll))) return "Roll the magnets to " + card.rolls.join("°, ") + "°.";
    return null;
  }

  // 14 · Spin-1 Preview. A |m = +1⟩ state along z, analyzed along an axis θ from z.
  function sgSpin1(theta) {
    const c = Math.cos(sgRad(theta));
    return { plus: ((1 + c) / 2) ** 2, zero: (1 - c * c) / 2, minus: ((1 - c) / 2) ** 2 };
  }

  const sgStations3 = {
    // 11 · Error Detective --------------------------------------------------------------------------------
    detective: {
      show(c) {
        const key = c.open() ?? "half", card = SG_ERRORS[key];
        c.put("state", c.open() ? "Case file open: " + card.text + "." : "Open a case file. Showing case 1.");
        const done = c.revealed(key);
        return {
          panels: [sgChain("claimed vs actual", [
            { title: "the solution", sub: card.claim, tone: "warn" },
            { title: "actually", sub: done ? card.truth : "?", tone: "plus" }], { note: done ? "Case solved." : "The truth fills in once you solve the case." })],
          caption: card.text,
          desc: "Two boxes. The solution claims: " + card.claim + ". " + (done ? "Actually: " + card.truth + "." : "The second box fills in once the case is solved.")
        };
      },
      checks: {
        half: ["Line 1 is correct.", "Which angle goes inside the cosine for spin?", sgErrorGrader("half")],
        blocked: ["Lines 1 and 2 are correct.", "How many of the atoms sent ever reach B?", sgErrorGrader("blocked")],
        chain: ["Lines 1, 2 and 3 are correct.", "Which factor is missing from line 4?", sgErrorGrader("chain")],
        selector: ["Line 1 is correct.", "What does a selector do to the channel it passes?", sgErrorGrader("selector")],
        points: ["Line 1 is correct.", "Compare |S| with S_z.", sgErrorGrader("points")]
      }
    },

    // 12 · Quantum Preview: Precession --------------------------------------------------------------------
    preview: {
      load(c, check) {
        c.field("input").value = check === "d" ? "+z" : "+x";
        c.field("axis").value = check === "d" ? "+z" : "+x";
        c.set("t", 0);
      },
      moving: c => c.checked("run"),
      tick(c, dt) {
        let t = c.num("t") + dt * 0.25;
        if (!Number.isFinite(t) || t > 3) t = 0;
        c.set("t", sgRound(t, 0.0001));
      },
      settle(c) { if (c.reduced()) c.say("Reduced effects: the clock stays still. Move the delay slider by hand."); },
      show(c) {
        const m = sgPreviewModel(c), running = c.checked("run") && !c.reduced();
        c.put("state", "Delay t = " + sgFmt(m.t) + " T. The spin points along " + sgDirText(m.s) + ". Analyzer along " + m.axis + ": P(+) = " + sgFmt(m.p) + "."
          + (c.checked("run") && c.reduced() ? " Reduced effects are on, so the clock doesn’t run." : ""));
        return {
          panels: [
            sgPlane("top view (B along +z)", [sgArrow(sgXY(m.s), "plus", m.input === "+z" ? "" : "spin"), sgArrow(sgXY(m.n), "angle", m.axis === "+z" ? "" : "analyzer")], { axes: ["x", "y"], weight: 1,
              paths: m.input === "+z" ? [] : [{ pts: Array.from({ length: 49 }, (_, k) => sgPolar(0.55, k * 360 * Math.min(1, m.t) / 48)), tone: "plus", dashed: true }] }),
            sgChart("P(+) along " + m.axis + " vs delay", { x: [0, 3], y: [0, 1], xTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3], yTicks: [0, 0.5, 1], xLabel: "delay t in periods T",
              series: [{ pts: sgSweep(m.curve, 0, 3, 240), tone: "plus" }], vlines: [{ x: m.t }], dots: [{ x: m.t, y: m.p, tone: "angle" }], weight: 1.5 })
          ],
          caption: "t = " + sgFmt(m.t) + " T" + (running ? " (running)" : ""),
          desc: "Top view with the field out of the page. The spin arrow points along " + sgDirText(m.s) + " and the analyzer along " + m.axis + ". The chart shows P(+) against the delay; at t = " + sgFmt(m.t) + " T it is " + sgFmt(m.p) + "."
        };
      },
      checks: {
        a: ["P(+x) = cos²(angle turned/2), and the spin turns 360° per period.", "P = 0 when the spin points along −x: half a turn.", c => {
          const m = sgPreviewModel(c);
          if (m.input !== "+x" || m.axis !== "+x") return sgSetup("Use input |+x⟩ and the analyzer along +x.");
          return sgGrade(sgNear(m.p, 0), "P(+x) is " + sgFmt(m.p) + ". Change the delay.",
            "After half a period the spin has turned 180° from +x to −x, so P(+x) = cos²90° = 0. It happens again at 3T/2 and 5T/2: the probability oscillates with the delay.");
        }],
        b: ["At T/4 the spin has turned 90°, from +x to +y.", "Choose the analyzer along the spin’s direction at T/4.", c => {
          const m = sgPreviewModel(c), p = c.ans("b-p");
          if (m.input !== "+x") return sgSetup("Use input |+x⟩.");
          if (!sgFits(p, 0.5)) return sgGrade(false, "Find P(+x) for a spin along +y.");
          return sgGrade(m.axis === "+y" && sgNear(m.p, 1), m.axis !== "+y" ? "Which analyzer axis matches the spin at T/4?" : "Set the delay to T/4 so the +y analyzer gives P = 1.",
            "At t = T/4 the spin points along +y, so an x analyzer gives 1/2, and a y analyzer gives +ℏ/2 every time. A later analyzer must be aimed where the spin will be.");
        }],
        c: ["At T/3 the spin has turned 120°.", "P = cos²(120°/2).", c => sgGrade(sgFits(c.ans("c-p"), 0.25), "Use the half-angle rule with the angle turned.",
          "At T/3 the spin is 120° from +x, so P(+x) = cos²60° = 1/4. The curve is cos²(πt/T), which repeats every T.")],
        d: ["A spin along the field’s axis has nothing to turn around.", "Try input |+z⟩ with the analyzer along +z at several delays.", c => sgGrade(c.choice("d-pick") === "stays", "Watch P(+z) as the delay changes.",
          "A |+z⟩ spin is already along the field, so it stays put: P(+z) = 1 at every delay. Only spins with a component across the field precess. Lesson 17 shows how the field sets the turning rate, using time evolution.")]
      }
    },

    // 13 · 3D Stern–Gerlach Bench -------------------------------------------------------------------------
    bench: {
      start(c) { sgSeed(c); sgBenchClear(c); },
      load(c, check) {
        const card = SG_BENCH_CARDS[check];
        sgSetDir(c, "src", ...card.src);
        c.field("count").value = String(card.count);
        if (card.rolls) card.rolls.forEach((roll, k) => c.set("roll" + (k + 1), roll));
        sgBenchClear(c);
      },
      edit(c, name) { if (name !== "yaw" && name !== "tilt") sgBenchClear(c); },
      drag(c, dx, dy) {
        c.set("yaw", sgWrap(Math.round((c.num("yaw") - dx * 0.5) / 5) * 5 + 180) - 180);
        c.set("tilt", sgClamp(Math.round((c.num("tilt") + dy * 0.3) / 5) * 5, -60, 60));
      },
      show(c) {
        const m = sgBenchModel(c);
        for (let k = 1; k <= 3; k++) { const group = c.node('[data-sg-stage="' + k + '"]'); if (group) group.hidden = k > m.count; }
        const spots = m.leaves.map(leaf => "spot " + leaf.signs + " " + sgFmt(sgRound(leaf.prob, 0.0001))).join(", ");
        c.put("state", "Source along " + sgDirText(m.src) + ". " + m.magnets.map((mag, k) => "Magnet " + (k + 1) + " rolled " + sgFmt(mag.roll) + "° (axis " + sgDirText(mag.n) + ")").join("; ")
          + ". " + sgOneIn(m.leaves.length, "spot") + ": " + spots + ". Seed " + c.s.seed + ", " + c.s.sent + " atoms on the screen.");
        return {
          bench: { yaw: c.num("yaw"), tilt: c.num("tilt"), magnets: m.magnets, segments: m.segments, leaves: m.leaves, hits: c.s.hits },
          caption: sgOneIn(m.count, "magnet") + ", " + sgOneIn(m.leaves.length, "spot"),
          desc: "A beam along +y from the oven on the left passes " + sgOneIn(m.count, "magnet") + " and reaches a screen on the right. Every channel continues to the screen, which shows " + sgOneIn(m.leaves.length, "spot") + ": " + spots + "."
        };
      },
      actions: {
        send1: c => sgBenchSend(c, 1),
        send10: c => sgBenchSend(c, 10),
        send100: c => sgBenchSend(c, 100),
        clear: c => { sgBenchClear(c); return "Screen cleared."; },
        reseed: c => { sgBenchClear(c); return sgReseed(c, " The screen is cleared."); }
      },
      checks: {
        a: ["|+y⟩ points along the beam, and every magnet axis is perpendicular to the beam.", "s·n = 0 for every roll.", c => {
          const setup = sgBenchSetup(c, "a");
          if (setup) return sgSetup(setup);
          return sgGrade(sgFits(c.ans("a-p"), 0.5) && c.choice("a-pick") === "always", "Compute s·n for s = +y and n = (sin ρ, 0, cos ρ).",
            "Every roll gives an axis perpendicular to +y, so s·n = 0 and the two spots get 1/2 each, whatever the roll. A magnet can never measure the spin component along its own beam.");
        }],
        b: ["Magnet 1 (Z) sends every |+z⟩ atom up the + channel.", "Magnet 2 (X) splits that beam; magnet 3 (Z) splits each half again.", c => {
          const setup = sgBenchSetup(c, "b");
          if (setup) return sgSetup(setup);
          const n = c.ans("b-n"), max = c.ans("b-max");
          return sgGrade(sgFits(n, 4) && sgFits(max, 0.25), !sgFits(n, 4) ? "Count the paths with nonzero probability." : "Multiply the probabilities along one path.",
            "Magnet 1 gives + with certainty. Magnet 2 splits into |±x⟩ at 1/2 each, and magnet 3 splits each of those into |±z⟩ at 1/2 each: 4 spots (+ + +, + + −, + − +, + − −), each with 1/4. Spots from magnet 1’s − channel never appear.");
        }],
        c: ["A magnet along the state’s own axis sends every atom one way.", "Roll every magnet to 90° or 270°.", c => {
          const setup = sgBenchSetup(c, "c");
          if (setup) return sgSetup(setup);
          const m = sgBenchModel(c);
          return sgGrade(m.leaves.length === 1, "Your screen shows " + sgOneIn(m.leaves.length, "spot") + ".",
            "With every magnet along ±x, each one meets an x eigenstate and sends every atom into one channel. A 270° magnet is the 90° magnet with its channels swapped, so it still keeps a single spot.");
        }],
        d: ["9/16 = 3/4 × 3/4.", "Two 60° steps: rolls 60° and 120°, or 60° and 0°.", c => {
          const setup = sgBenchSetup(c, "d");
          if (setup) return sgSetup(setup);
          const best = Math.max(...sgBenchModel(c).leaves.map(leaf => leaf.prob));
          return sgGrade(sgNear(best, 9 / 16), "Your brightest spot has " + sgFmt(best) + ".",
            "Rolls 60° then 120°: the + channel of magnet 1 keeps 3/4 and leaves in its own axis state; magnet 2 is 60° further, so its + channel keeps 3/4 of that. 3/4 × 3/4 = 9/16. The checker tested your rolls.");
        }]
      }
    },

    // 14 · Spin-1 Preview -------------------------------------------------------------------------------
    spin1: {
      show(c) {
        const theta = sgDeg(c, "theta"), p = sgSpin1(theta), half = Math.cos(sgRad(theta) / 2) ** 2;
        c.put("state", "Analyzer " + sgFmt(theta) + "° from z. Spin-1 beams: +ℏ " + sgFmt(p.plus) + ", 0 " + sgFmt(p.zero) + ", −ℏ " + sgFmt(p.minus) + ". For comparison, spin-½ at the same angle: +ℏ/2 " + sgFmt(half) + ".");
        return {
          panels: [
            sgBars("spin-1 beams", [{ label: "+ℏ", value: p.plus, tone: "plus" }, { label: "0", value: p.zero, tone: "angle" }, { label: "−ℏ", value: p.minus, tone: "minus" }], { weight: 1 }),
            sgChart("probabilities vs analyzer angle", { x: [0, 360], y: [0, 1], xTicks: [0, 90, 180, 270, 360], yTicks: [0, 0.5, 1], xLabel: "θ in degrees (dashed: spin-½ P(+))",
              series: [{ pts: sgSweep(t => sgSpin1(t).plus, 0, 360), tone: "plus" }, { pts: sgSweep(t => sgSpin1(t).zero, 0, 360), tone: "angle" },
                { pts: sgSweep(t => sgSpin1(t).minus, 0, 360), tone: "minus" }, { pts: sgSweep(t => Math.cos(sgRad(t) / 2) ** 2, 0, 360), tone: "guide", dashed: true }],
              vlines: [{ x: sgWrap(theta) }], weight: 1.5 })
          ],
          caption: "θ = " + sgFmt(theta) + "°",
          desc: "Three bars for the spin-1 beams +ℏ, 0 and −ℏ, with probabilities " + sgFmt(p.plus) + ", " + sgFmt(p.zero) + " and " + sgFmt(p.minus) + ". The chart shows all three against the analyzer angle, with the spin-½ P(+) dashed."
        };
      },
      checks: {
        a: ["Spin-1 has readings −ℏ, 0 and +ℏ along any axis.", "One spot per reading.", c => {
          const n = c.ans("a-n"), mid = c.ans("a-mid");
          return sgGrade(sgFits(n, 3) && sgFits(mid, 0), !sgFits(n, 3) ? "Count the readings of a spin-1 component." : "Which reading sits between +ℏ and −ℏ?",
            "A spin-s particle has 2s + 1 readings along any axis, from −sℏ to +sℏ in steps of ℏ. Spin-½ gives 2 spots; spin-1 gives 3: +ℏ, 0 and −ℏ. The middle beam is undeflected.");
        }],
        b: ["Set θ = 90°, so cos θ = 0.", "Use ((1 + cos θ)/2)², sin²θ/2 and ((1 − cos θ)/2)².", c => {
          const theta = sgDeg(c, "theta");
          if (!sgAngleFits(theta, 90, 180)) return sgSetup("Turn the analyzer to 90° from z.");
          const v = ["b-p1", "b-p0", "b-m1"].map(name => c.ans(name)), want = [0.25, 0.5, 0.25];
          return sgGrade(v.every((x, i) => sgFits(x, want[i])), "Check each of the three probabilities.",
            "At 90°: +ℏ gets (1/2)² = 1/4, 0 gets 1/2 and −ℏ gets 1/4. Spin-½ at 90° would give 1/2 and 1/2. The three still add to 1.");
        }],
        c: ["sin²θ/2 is largest at θ = 90°.", "Its largest value is 1/2, never 1.", c => {
          const theta = sgDeg(c, "theta");
          if (!sgAngleFits(theta, 90, 180)) return sgSetup("Turn the analyzer to where P(0) is largest.");
          return sgGrade(sgFits(c.ans("c-max"), 0.5) && c.choice("c-pick") === "notall", "Compare the most P(0) can be with 1.",
            "P(0) peaks at 1/2. So the m = 0 state along an axis is not |m = +1⟩ along any other axis: some spin-1 states don’t point anywhere. For spin-½, every state is |+n⟩ for some direction n, which is what makes the Bloch sphere work. Lesson 26 develops general spin.");
        }]
      }
    }
  };

  const sgStations = { ...sgStations1, ...sgStations2, ...sgStations3 };

  function sgPalette(root) {
    const css = getComputedStyle(root);
    const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    return {
      alpha: read("--blue", "#65b7ff"),
      beta: read("--orange", "#ff9f55"),
      plus: read("--green", "#63f59b"),
      minus: read("--violet", "#c19bff"),
      angle: read("--yellow", "#ffe16a"),
      warn: read("--red", "#ff676f"),
      ink: read("--ink", "#ecfff1"),
      axis: "#b4c9bc",
      guide: "#b4c9bc",
      sphere: "#24453a",
      table: "#0f241b",
      glass: "#9fd8ff"
    };
  }

  function initializeSternGerlachArcade(root) {
    const details = root.querySelector("#stern-gerlach-arcade");
    if (!details) return;
    const get = id => root.querySelector("#sg-" + id);
    const select = get("station"), resetButton = get("reset"), status = get("status");
    const reducedBox = get("reduced"), progress = get("progress");
    const figure = get("figure-template").content.firstElementChild.cloneNode(true);
    const toolTemplate = get("mission-template");
    const viewport = figure.querySelector("#sg-viewport");
    const canvas = figure.querySelector("#sg-canvas");
    const geometry = figure.querySelector("[data-sg-geometry]");
    const labelLayer = figure.querySelector("[data-sg-labels]");
    const desc = figure.querySelector("#sg-desc");
    const title = figure.querySelector("#sg-title");
    const renderStatus = figure.querySelector("#sg-render-status");
    const colors = sgPalette(root);
    const lifetime = new AbortController();
    const listen = (node, type, handler, options = {}) =>
      node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
    const panels = new Map(), cards = new Map(), completion = new Set();
    let active = null, plan = null;
    let graphics = null, loading = false, failed = false, contextLost = false, disposed = false;
    let frame = null, motionFrame = null, lastTick = null, drag = null;

    const say = message => sgSetText(status, message ?? "");
    const updateProgress = () => sgSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

    for (const panel of root.querySelectorAll("#sg-panels [data-sg-station]")) {
      const key = panel.dataset.sgStation;
      const spec = sgStations[key];
      if (!spec) continue;
      const fields = new Map([...panel.querySelectorAll("[name]")].map(field => [field.name, field]));
      const defaults = new Map([...fields].map(([name, field]) => [name, field.type === "checkbox" ? field.checked : field.value]));
      const field = name => fields.get(name);
      const c = {
        key, panel, spec, defaults, field, s: {}, cards: new Map(),
        node: selector => panel.querySelector(selector),
        val: name => field(name).value,
        checked: name => field(name).checked,
        num: name => Number(field(name).value),
        ans(name) {
          const input = field(name);
          const value = sgParse(input.value);
          if (value === null) throw new SgFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2 or 1/√2.", true);
          return value;
        },
        quiet: name => sgParse(field(name).value),
        choice(name) {
          const input = field(name);
          if (!input.value) throw new SgFieldError(input, "Choose an option.");
          return input.value;
        },
        // Setting a value also moves any slider paired with that box.
        set(name, value) {
          field(name).value = String(value);
          for (const range of panel.querySelectorAll('[data-sg-pair="' + name + '"]')) range.value = String(value);
        },
        put(name, text) { sgSetText(c.node('[data-sg-read="' + name + '"]'), text); },
        text(name, text) { for (const node of panel.querySelectorAll('[data-sg-text="' + name + '"]')) sgSetText(node, text); },
        // Show or hide the label that holds a field.
        reveal(name, shown) { const label = field(name).closest("label"); if (label) label.hidden = !shown; },
        list(name, lines) {
          const list = c.node('[data-sg-log="' + name + '"]');
          if (!list || list.dataset.text === lines.join("\n")) return;
          list.dataset.text = lines.join("\n");
          list.replaceChildren(...lines.map(line => {
            const item = document.createElement("li");
            item.textContent = line;
            return item;
          }));
        },
        // The open mission card nearest the end of the list, or null.
        open: () => [...c.cards].filter(([, card]) => card.open).map(([check]) => check).at(-1) ?? null,
        revealed: check => Boolean(c.s.revealed[check]),
        reduced,
        say
      };
      panels.set(key, c);
      for (const card of panel.querySelectorAll("[data-sg-mission]")) {
        const id = card.dataset.sgMission, check = id.slice(key.length + 1);
        if (!spec.checks[check]) continue;
        card.append(toolTemplate.content.cloneNode(true));
        c.cards.set(check, card);
        cards.set(id, { card, check, id, hints: 0, station: c });
        listen(card, "toggle", () => {
          if (card.open) spec.load?.(c, check);
          if (active === c) refresh();
        });
      }
      resetModel(c);
      for (const fieldset of panel.querySelectorAll("fieldset")) fieldset.disabled = false;
    }
    if (!panels.size) return;

    function resetModel(c) {
      for (const [name, value] of c.defaults) {
        const input = c.field(name);
        if (input.type === "checkbox") input.checked = value;
        else input.value = value;
        input.setCustomValidity?.("");
      }
      c.s = { revealed: {} };
      c.spec.start?.(c);
    }

    function onScreen() {
      if (!details.open || document.hidden || !viewport.isConnected) return false;
      const box = viewport.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
    }

    function showSvg(message) {
      canvas.hidden = true;
      viewport.dataset.renderer = "svg";
      sgSetText(renderStatus, message);
    }

    function refresh() {
      if (!active || !details.open) return;
      plan = active.spec.show(active);
      for (const output of active.panel.querySelectorAll("output[data-sg-for]")) {
        const value = active.val(output.dataset.sgFor);
        sgSetText(output, "sgAngle" in output.dataset
          ? sgAngleText(Number(value))
          : value.replace("-", "−") + (output.dataset.sgUnit ?? ""));
      }
      sgSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
      sgSetText(desc, plan.desc || "");
      if (plan.bench && !graphics && !loading && !failed) loadGraphics();
      draw();
      requestMotion();
    }

    function draw() {
      if (!plan) return;
      const kind = plan.bench ? "bench" : null;
      const view = plan.bench ?? null;
      sgPaintSvg(plan, geometry, labelLayer, view);
      if (!kind) {
        showSvg("SVG diagram.");
        return;
      }
      const noun = "bench";
      const how = active.spec.pointer ? " Drag the point to move it, drag elsewhere or use the view sliders to turn the view." : "";
      if (!graphics || contextLost) {
        if (!loading) showSvg(failed
          ? "Three.js is unavailable here, so the " + noun + " uses the SVG view." + (how || " Use the view sliders to turn it.")
          : "SVG view of the " + noun + "." + (how || " Use the view sliders or drag to turn it."));
        return;
      }
      const width = viewport.clientWidth, height = viewport.clientHeight;
      if (!width || !height) return;
      try {
        graphics.draw(kind, view, width, height, reduced());
        canvas.hidden = false;
        viewport.dataset.renderer = "webgl";
        sgSetText(renderStatus, "Three.js 3D view." + (how || " Drag the " + noun + " or use the view sliders to turn it."));
      } catch {
        graphics.dispose();
        graphics = null;
        failed = true;
        showSvg("The 3D view stopped, so the " + noun + " uses the SVG view.");
      }
    }

    function requestFrame() {
      if (frame !== null || disposed) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (onScreen()) draw();
      });
    }

    // Stations with motion (photon dots, a running clock) tick only while the
    // arcade is on screen and reduced effects are off.
    const moving = () => Boolean(active?.spec.tick && active.spec.moving?.(active) && !reduced() && onScreen());
    function requestMotion() {
      if (motionFrame !== null || disposed || !moving()) return;
      motionFrame = requestAnimationFrame(now => {
        motionFrame = null;
        if (!moving()) { lastTick = null; return; }
        const dt = lastTick === null ? 0 : Math.min(0.1, (now - lastTick) / 1000);
        lastTick = now;
        active.spec.tick(active, dt);
        refresh();
      });
    }

    async function loadGraphics() {
      if (loading || graphics || disposed) return;
      loading = true;
      showSvg("SVG view. Loading the Three.js view.");
      try {
        const THREE = await import("../vendor/three.module.js");
        if (disposed) return;
        graphics = sgCreateGraphics(THREE, canvas, colors);
      } catch {
        graphics = null;
        failed = true;
      } finally {
        loading = false;
      }
      draw();
    }

    function mount() {
      active = panels.get(select.value) ?? panels.values().next().value;
      for (const c of panels.values()) c.panel.hidden = c !== active;
      active.node("[data-sg-plot-slot]").append(figure);
      viewport.dataset.space = active.spec.pointer ? "point" : active.spec.drag ? "true" : "false";
      if (active.spec.key) {
        viewport.tabIndex = 0;
        viewport.setAttribute("role", "group");
        viewport.setAttribute("aria-label", active.spec.keyLabel ?? "Diagram. Arrow keys adjust the setting.");
      } else {
        viewport.removeAttribute("tabindex");
        viewport.removeAttribute("role");
        viewport.removeAttribute("aria-label");
      }
      lastTick = null;
      refresh();
    }

    function clearCard(card) {
      sgSetText(card.querySelector("[data-sg-feedback]"), "");
      const work = card.querySelector("[data-sg-work]");
      work.hidden = true;
      work.open = false;
    }

    function showGrade(mission, result) {
      const { card, id, check, station } = mission;
      const work = card.querySelector("[data-sg-work]");
      sgSetText(card.querySelector("[data-sg-feedback]"),
        result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
      sgSetText(card.querySelector("[data-sg-work-text]"), result.work || "");
      work.hidden = !result.work;
      work.open = Boolean(result.work) && !result.pass;
      if (result.pass) station.s.revealed[check] = true;
      if (result.pass && !completion.has(id)) {
        completion.add(id);
        card.querySelector("[data-sg-done]").hidden = false;
        updateProgress();
      }
      say("");
    }

    function handleClick(event) {
      const button = event.target.closest("button");
      if (!button || !active || !active.panel.contains(button) || button.disabled) return;
      const missionCard = button.closest("[data-sg-mission]");
      const mission = missionCard ? cards.get(missionCard.dataset.sgMission) : null;
      const action = button.dataset.sgAction;
      try {
        if (action) {
          const message = active.spec.actions[action](active, mission?.check ?? null);
          if (mission) sgSetText(mission.card.querySelector("[data-sg-feedback]"), message ?? "");
          else if (message !== null) say(message);
        } else if (mission && button.hasAttribute("data-sg-check")) {
          showGrade(mission, active.spec.checks[mission.check][2](active));
        } else if (mission && button.hasAttribute("data-sg-hint")) {
          if (mission.hints >= 2) return;
          const list = mission.card.querySelector("[data-sg-hint-list]");
          const item = document.createElement("li");
          sgSetText(item, active.spec.checks[mission.check][mission.hints]);
          list.append(item);
          list.hidden = false;
          mission.hints += 1;
          if (mission.hints === 2) {
            button.textContent = "Both hints shown";
            button.disabled = true;
            list.tabIndex = -1;
            list.focus();
          } else button.textContent = "Show second hint";
          return;
        } else return;
      } catch (error) {
        if (!(error instanceof SgFieldError)) throw error;
        if (mission) sgSetText(mission.card.querySelector("[data-sg-feedback]"), error.message);
        else say(error.message);
        if (error.custom) error.field.setCustomValidity(error.detail);
        error.field.reportValidity();
        error.field.focus();
      }
      refresh();
    }

    function handleEdit(event) {
      const target = event.target;
      if (!active || !active.panel.contains(target) || !target.name) return;
      target.setCustomValidity?.("");
      // A slider and its number box hold the same value.
      if (target.dataset.sgPair) active.field(target.dataset.sgPair).value = target.value;
      else for (const range of active.panel.querySelectorAll('[data-sg-pair="' + target.name + '"]')) {
        if (target.value !== "" && Number.isFinite(Number(target.value))) range.value = target.value;
      }
      const missionCard = target.closest("[data-sg-mission]");
      if (missionCard) clearCard(missionCard);
      active.spec.edit?.(active, target.name, event.type);
      refresh();
    }

    // Pointer input. Stations with pointer() edit their setting from the diagram, in
    // viewBox units (560 × 300); stations with drag() turn a 3D view.
    const svgPoint = event => {
      const box = viewport.getBoundingClientRect();
      return { x: (event.clientX - box.left) * 560 / (box.width || 1), y: (event.clientY - box.top) * 300 / (box.height || 1) };
    };
    listen(viewport, "pointerdown", event => {
      if (!active || event.button > 0) return;
      if (active.spec.pointer?.(active, svgPoint(event), "down")) {
        drag = { id: event.pointerId, point: true };
        try { viewport.setPointerCapture?.(event.pointerId); } catch { /* Capture is optional. */ }
        event.preventDefault();
        refresh();
        return;
      }
      if (!active.spec.drag) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
      try { viewport.setPointerCapture?.(event.pointerId); } catch { /* Capture is optional. */ }
    });
    listen(viewport, "pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.point) {
        active.spec.pointer(active, svgPoint(event), "move");
        refresh();
        return;
      }
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      active.spec.drag(active, dx, drag.touch ? 0 : dy);
      refresh();
    });
    const endDrag = event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.point) active.spec.pointer?.(active, svgPoint(event), "up");
      drag = null;
    };
    listen(viewport, "pointerup", endDrag);
    listen(viewport, "pointercancel", endDrag);
    listen(viewport, "keydown", event => {
      if (!active?.spec.key || event.altKey || event.ctrlKey || event.metaKey) return;
      if (active.spec.key(active, event.key, event.shiftKey)) {
        event.preventDefault();
        refresh();
      }
    });

    listen(details, "click", handleClick);
    listen(details, "input", handleEdit);
    listen(details, "change", handleEdit);
    listen(details, "toggle", () => { if (details.open) refresh(); });
    listen(select, "change", () => {
      say("");
      mount();
    });
    listen(resetButton, "click", () => {
      resetModel(active);
      for (const card of active.cards.values()) clearCard(card);
      say("Station settings reset. Completed missions stay counted for this session.");
      refresh();
    });
    const settle = () => {
      active?.spec.settle?.(active);
      refresh();
    };
    listen(reducedBox, "change", settle);
    if (motionQuery?.addEventListener) listen(motionQuery, "change", settle);
    listen(root.querySelector("#sg-arcade-link"), "click", () => { details.open = true; });

    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestFrame()) : null;
    observer?.observe(viewport);
    const wake = () => { requestFrame(); requestMotion(); };
    listen(document, "visibilitychange", () => { if (!document.hidden) wake(); });
    listen(window, "scroll", () => requestMotion(), { passive: true });
    listen(canvas, "webglcontextlost", event => {
      event.preventDefault();
      contextLost = true;
      showSvg("The WebGL context was lost, so the 3D view uses SVG.");
    });
    listen(canvas, "webglcontextrestored", () => {
      contextLost = false;
      graphics?.invalidate();
      requestFrame();
    });
    listen(window, "pageshow", wake);
    listen(window, "pagehide", event => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (motionFrame !== null) cancelAnimationFrame(motionFrame);
      frame = motionFrame = null;
      lastTick = null;
      if (event.persisted) return;
      disposed = true;
      lifetime.abort();
      observer?.disconnect();
      graphics?.dispose();
      graphics = null;
    });

    select.disabled = false;
    resetButton.disabled = false;
    reducedBox.disabled = false;
    updateProgress();
    mount();
    if (location.hash === "#stern-gerlach-arcade") details.open = true;
  }
  // ---------------------------------------------------------------------------
  // SVG drawing. The viewBox is 560 × 300 and labels always stay in SVG.
  // ---------------------------------------------------------------------------

  function sgNode(name, attributes = {}, text = "") {
    const node = document.createElementNS(SG_SVG, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    }
    if (text) node.textContent = text;
    return node;
  }


  function sgPaintSvg(plan, geometry, labels, view) {
    const shapes = [], words = [];
    if (plan.panels) sgDrawPanels(plan.panels, shapes, words);
    if (plan.bench && view) sgDrawBench(view, shapes, words);
    geometry.replaceChildren(...shapes);
    labels.replaceChildren(...words);
  }

  function sgDrawPanels(panels, shapes, words) {
    const total = panels.reduce((sum, panel) => sum + (panel.weight ?? 1), 0);
    let x = 0;
    for (const panel of panels) {
      const box = { x, w: 560 * (panel.weight ?? 1) / total };
      SG_PANEL_DRAW[panel.kind]?.(panel, box, shapes, words);
      x += box.w;
    }
  }

  // Boxes joined by arrows: a preparation, then measurement stages, each with a line of detail.
  function sgDrawChain(chain, box, shapes, words) {
    const n = chain.items.length, left = box.x + 10, right = box.x + box.w - 10;
    const slot = (right - left) / n, w = Math.min(slot - 22, 120), cy = 140, h = 74;
    words.push(sgNode("text", { class: "sg-caption", x: (left + right) / 2, y: 40, "text-anchor": "middle" }, chain.caption));
    chain.items.forEach((item, k) => {
      const cx = left + slot * (k + 0.5);
      shapes.push(sgNode("rect", { class: "sg-part", "data-tone": item.tone, x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 7 }));
      words.push(sgNode("text", { class: "sg-label", "data-tone": item.tone, x: cx, y: cy - 8, "text-anchor": "middle" }, item.title));
      if (item.sub) words.push(sgNode("text", { class: "sg-tick", x: cx, y: cy + 16, "text-anchor": "middle" }, item.sub));
      if (item.below) words.push(sgNode("text", { class: "sg-label", "data-tone": item.belowTone ?? "plus", x: cx, y: cy + h / 2 + 26, "text-anchor": "middle" }, item.below));
      if (k < n - 1) {
        const x1 = cx + w / 2 + 3, x2 = cx + slot - w / 2 - 5;
        shapes.push(sgNode("line", { class: "sg-arrow" + (item.dashedAfter ? " sg-dashed" : ""), "data-tone": "guide", x1, y1: cy, x2: x2 - 6, y2: cy }));
        shapes.push(sgNode("polygon", { class: "sg-head", "data-tone": "guide", points: x2 + "," + cy + " " + (x2 - 8) + "," + (cy - 5) + " " + (x2 - 8) + "," + (cy + 5) }));
      }
    });
    if (chain.note) words.push(sgNode("text", { class: "sg-tick", x: (left + right) / 2, y: 270, "text-anchor": "middle" }, chain.note));
  }

  function sgLabel(words, text, x, y, tone, anchor = "middle", extra = {}) {
    // Keep the whole label inside the 560-wide viewBox (about 8.5 px per character).
    const span = text.length * 8.5;
    const left = anchor === "start" ? x : anchor === "end" ? x - span : x - span / 2;
    if (left + span > 556) { x = 556; anchor = "end"; }
    else if (left < 4) { x = 4; anchor = "start"; }
    words.push(sgNode("text", { class: "sg-label", "data-tone": tone, x, y, "text-anchor": anchor, ...extra }, text));
  }

  function sgDrawPlane(plane, box, shapes, words) {
    const size = Math.min(box.w - 20, 238), half = size / 2, cx = box.x + box.w / 2, cy = 166;
    const limit = plane.limit ?? 1, unit = (half - 10) / limit;
    const X = re => cx + re * unit, Y = im => cy - im * unit;
    shapes.push(sgNode("rect", { class: "sg-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
    const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
    let grid = "";
    for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
      if (k === 0) continue;
      const v = k * step;
      grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
    }
    shapes.push(sgNode("path", { class: "sg-grid", d: grid }));
    shapes.push(sgNode("path", { class: "sg-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
    if (size > 150) {
      words.push(sgNode("text", { class: "sg-tick", x: X(limit) - 2, y: cy + 14, "text-anchor": "end" }, plane.axes?.[0] ?? "Re"));
      words.push(sgNode("text", { class: "sg-tick", x: cx + 5, y: Y(limit) + 10, "text-anchor": "start" }, plane.axes?.[1] ?? "Im"));
    }
    words.push(sgNode("text", { class: "sg-caption", "data-tone": plane.tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
    const rings = [...(plane.circle ? [{ c: [0, 0], r: plane.circle, tone: "guide" }] : []), ...(plane.circles ?? [])];
    for (const ring of rings) {
      if (ring.r > 0) shapes.push(sgNode("circle", { class: "sg-ring", "data-tone": ring.tone ?? "guide", cx: X(ring.c[0]), cy: Y(ring.c[1]), r: ring.r * unit }));
    }
    for (const ray of plane.rays ?? []) {
      const end = sgPolar(limit * 1.05, ray.angle);
      const start = ray.through ? sgScale(end, -1) : [0, 0];
      shapes.push(sgNode("line", { class: "sg-ray" + (ray.solid ? " sg-solid" : ""), "data-tone": ray.tone ?? "angle",
        x1: X(start[0]), y1: Y(start[1]), x2: X(end[0]), y2: Y(end[1]) }));
    }
    for (const mark of plane.marks ?? []) {
      // Inside the circle and just off the ray, so marks never sit on the axis labels.
      const [mx, my] = sgPolar(limit * 0.6, mark.angle + 12);
      sgLabel(words, mark.label, X(mx), Y(my) + 5, mark.tone, "middle");
    }
    for (const path of plane.paths ?? []) {
      shapes.push(sgNode("polyline", { class: "sg-curve" + (path.dashed ? " sg-dashed" : ""), "data-tone": path.tone,
        points: path.pts.map(([re, im]) => X(re).toFixed(1) + "," + Y(im).toFixed(1)).join(" ") }));
    }
    for (const item of plane.items) {
      const from = item.from ?? [0, 0];
      const fx = X(from[0]), fy = Y(from[1]);
      const [re, im] = sgAdd(from, item.z);
      const reach = Math.max(Math.abs(re), Math.abs(im));
      const clip = reach > limit ? limit / reach : 1;
      const ex = X(re * clip), ey = Y(im * clip);
      const length = Math.hypot(ex - fx, ey - fy);
      if (item.dot || length < 3) {
        shapes.push(sgNode("circle", { class: "sg-dot" + (item.hollow || length < 3 ? " sg-hollow" : ""), "data-tone": item.tone, cx: ex, cy: ey, r: item.dot ? item.size ?? 4.5 : 5 }));
      } else {
        const ux = (ex - fx) / length, uy = (ey - fy) / length, depth = Math.min(13, length * 0.6), wing = depth * 0.42;
        const bx = ex - ux * depth, by = ey - uy * depth;
        shapes.push(sgNode("line", { class: "sg-arrow" + (item.dashed ? " sg-dashed" : "") + (item.wide ? " sg-wide" : ""), "data-tone": item.tone, x1: fx, y1: fy, x2: bx, y2: by }));
        shapes.push(sgNode("polygon", { class: "sg-head" + (item.dashed ? " sg-hollow" : ""), "data-tone": item.tone,
          points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
      }
      if (item.label) {
        // Past the tip and a little to one side, so a label never hides an arrow along the same line.
        const ux = (ex - fx) / (length || 1), uy = (ey - fy) / (length || 1);
        const away = length < 3 ? [10, -10] : [ux * 12 + uy * 9, uy * 12 - ux * 9];
        const anchor = Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end";
        sgLabel(words, item.label + (clip < 1 ? " (off scale)" : ""), ex + away[0], ey + away[1] + 4, item.tone, anchor);
      }
    }
  }

  function sgDrawChart(chart, box, shapes, words) {
    const left = box.x + 46, right = box.x + box.w - 16, top = 40, bottom = 246;
    const [x0, x1] = chart.x, [y0, y1] = chart.y;
    const X = v => left + (v - x0) / (x1 - x0) * (right - left);
    const Y = v => bottom - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0) * (bottom - top);
    shapes.push(sgNode("rect", { class: "sg-frame", x: left, y: top, width: right - left, height: bottom - top }));
    let grid = "";
    for (const v of chart.xTicks) grid += "M" + X(v) + " " + top + "V" + bottom;
    for (const v of chart.yTicks) grid += "M" + left + " " + Y(v) + "H" + right;
    shapes.push(sgNode("path", { class: "sg-grid", d: grid }));
    const zeroY = y0 < 0 && y1 > 0 ? Y(0) : bottom;
    shapes.push(sgNode("path", { class: "sg-axis", d: "M" + left + " " + top + "V" + bottom + "M" + left + " " + zeroY + "H" + right }));
    const every = Math.max(1, Math.ceil(chart.xTicks.length * 34 / (right - left)));
    chart.xTicks.forEach((v, k) => {
      if (k % every === 0) words.push(sgNode("text", { class: "sg-tick", x: X(v), y: bottom + 16, "text-anchor": "middle" }, chart.xTickText?.[k] ?? sgFmt(v)));
    });
    for (const v of chart.yTicks) words.push(sgNode("text", { class: "sg-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, sgFmt(v)));
    words.push(sgNode("text", { class: "sg-tick", x: (left + right) / 2, y: bottom + 36, "text-anchor": "middle" }, chart.xLabel));
    words.push(sgNode("text", { class: "sg-caption", x: (left + right) / 2, y: top - 12, "text-anchor": "middle" }, chart.caption));
    for (const h of chart.hlines ?? []) {
      shapes.push(sgNode("line", { class: "sg-ray", "data-tone": h.tone ?? "angle", x1: left, y1: Y(h.y), x2: right, y2: Y(h.y) }));
      if (h.label) sgLabel(words, h.label, right - 4, Y(h.y) - 6, h.tone ?? "angle", "end");
    }
    for (const v of chart.vlines ?? []) {
      shapes.push(sgNode("line", { class: "sg-ray sg-solid", "data-tone": v.tone ?? "angle", x1: X(v.x), y1: top, x2: X(v.x), y2: bottom }));
    }
    for (const series of chart.series ?? []) {
      shapes.push(sgNode("polyline", { class: "sg-curve" + (series.dashed ? " sg-dashed" : "") + (series.dotted ? " sg-dotted" : ""), "data-tone": series.tone,
        points: series.pts.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join(" ") }));
      if (series.label) {
        const [lx, ly] = series.labelAt ?? series.pts.at(-1);
        sgLabel(words, series.label, X(lx) + (series.labelDx ?? 6), Y(ly) + (series.labelDy ?? -6), series.tone, series.labelAnchor ?? "start");
      }
    }
    for (const r of chart.rects ?? []) {
      const xa = X(r.x0), xb = X(r.x1), ya = Y(r.y1), yb = Y(r.y0);
      shapes.push(sgNode("rect", { class: "sg-cell" + (r.hollow ? " sg-hollow" : ""), "data-tone": r.tone, x: Math.min(xa, xb), y: Math.min(ya, yb),
        width: Math.abs(xb - xa), height: Math.abs(yb - ya), "fill-opacity": r.opacity ?? null }));
    }
    for (const seg of chart.segments ?? []) {
      shapes.push(sgNode("line", { class: "sg-arrow" + (seg.dashed ? " sg-dashed" : ""), "data-tone": seg.tone, x1: X(seg.x0), y1: Y(seg.y0), x2: X(seg.x1), y2: Y(seg.y1) }));
      if (seg.label) sgLabel(words, seg.label, (X(seg.x0) + X(seg.x1)) / 2, Math.min(Y(seg.y0), Y(seg.y1)) - 8, seg.tone, "middle");
    }
    for (const dot of chart.dots ?? []) {
      shapes.push(sgNode("circle", { class: "sg-dot" + (dot.hollow ? " sg-hollow" : ""), "data-tone": dot.tone, cx: X(dot.x), cy: Y(dot.y), r: dot.r ?? 5 }));
      if (dot.label) sgLabel(words, dot.label, X(dot.x) + 8, Y(dot.y) - 8, dot.tone, "start");
    }
  }

  function sgDrawBars(bars, box, shapes, words) {
    const left = box.x + 40, right = box.x + box.w - 10, top = 48, bottom = 246, max = bars.max ?? 1;
    const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
    let grid = "";
    for (const v of [0, max / 2, max]) {
      grid += "M" + left + " " + Y(v) + "H" + right;
      words.push(sgNode("text", { class: "sg-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, sgFmt(v)));
    }
    shapes.push(sgNode("path", { class: "sg-grid", d: grid }));
    shapes.push(sgNode("path", { class: "sg-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
    words.push(sgNode("text", { class: "sg-caption", x: (left + right) / 2, y: top - 22, "text-anchor": "middle" }, bars.caption));
    const slot = (right - left) / bars.items.length;
    bars.items.forEach((bar, index) => {
      const x = left + slot * index + slot * 0.2, w = slot * 0.6, y = Y(bar.value);
      shapes.push(sgNode("rect", { class: "sg-bar" + (bar.outline ? " sg-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: Math.max(0, bottom - y) }));
      if (bar.target !== undefined) {
        shapes.push(sgNode("line", { class: "sg-ray sg-solid", "data-tone": "angle", x1: x - 4, y1: Y(bar.target), x2: x + w + 4, y2: Y(bar.target) }));
      }
      words.push(sgNode("text", { class: "sg-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 20, "text-anchor": "middle" }, bar.label));
      words.push(sgNode("text", { class: "sg-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top - 4, y - 8), "text-anchor": "middle" }, bar.text ?? sgFmt(bar.value)));
    });
  }

  // ---------------------------------------------------------------------------
  // 3D views. World coordinates have z up. The view turns by yaw about z and
  // tilts by an elevation angle; the SVG fallback and Three.js share sgFrame,
  // so SVG labels line up with the WebGL picture.
  // ---------------------------------------------------------------------------

  const SG_VIEW = { cx: 280, cy: 152 };
  
  function sgFrame(yaw, tilt) {
    const y = yaw * Math.PI / 180, t = tilt * Math.PI / 180;
    return {
      right: [-Math.sin(y), Math.cos(y), 0],
      up: [-Math.sin(t) * Math.cos(y), -Math.sin(t) * Math.sin(y), Math.cos(t)],
      toward: [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)]
    };
  }
  const sgDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sgProject = (frame, point, scale) => ({
    x: SG_VIEW.cx + scale * sgDot3(frame.right, point),
    y: SG_VIEW.cy - scale * sgDot3(frame.up, point),
    depth: sgDot3(frame.toward, point)
  });

  // Number lines: one row per operator, each with labelled points; links join
  // matching points on neighbouring rows.
  function sgDrawLine(panel, box, shapes, words) {
    const left = box.x + 70, right = box.x + box.w - 24, [x0, x1] = panel.x;
    const X = v => left + (Math.max(x0, Math.min(x1, v)) - x0) / (x1 - x0) * (right - left);
    const gap = 200 / Math.max(1, panel.rows.length), Y = k => 78 + gap * k;
    words.push(sgNode("text", { class: "sg-caption", x: (left + right) / 2, y: 36, "text-anchor": "middle" }, panel.caption));
    panel.rows.forEach((row, k) => {
      const y = Y(k);
      shapes.push(sgNode("path", { class: "sg-axis", d: "M" + left + " " + y + "H" + right }));
      const marks = row.ticks ?? Array.from({ length: Math.floor(x1) - Math.ceil(x0) + 1 }, (_, i) => Math.ceil(x0) + i);
      let ticks = "";
      for (const v of marks) ticks += "M" + X(v) + " " + (y - 4) + "V" + (y + 4);
      shapes.push(sgNode("path", { class: "sg-grid", d: ticks }));
      marks.forEach((v, i) => {
        words.push(sgNode("text", { class: "sg-tick", x: X(v), y: y + 22, "text-anchor": "middle" }, row.tickText?.[i] ?? sgFmt(v)));
      });
      words.push(sgNode("text", { class: "sg-label", "data-tone": row.tone ?? "ink", x: left - 12, y: y + 5, "text-anchor": "end" }, row.label));
      for (const point of row.points) {
        if (point.mean) {
          shapes.push(sgNode("polygon", { class: "sg-head", "data-tone": point.tone, points: X(point.x) + "," + (y + 6) + " " + (X(point.x) - 7) + "," + (y + 17) + " " + (X(point.x) + 7) + "," + (y + 17) }));
          continue;
        }
        shapes.push(sgNode("circle", { class: "sg-dot", "data-tone": point.tone, cx: X(point.x), cy: y, r: point.r ?? 6 }));
        if (point.label) sgLabel(words, point.label, X(point.x), y - 12 - (point.raise ?? 0), point.tone, "middle");
      }
    });
    for (const link of panel.links ?? []) {
      shapes.push(sgNode("line", { class: "sg-ray", "data-tone": link.tone ?? "guide", x1: X(link.from), y1: Y(link.rows[0]) + 7, x2: X(link.to), y2: Y(link.rows[1]) - 7 }));
    }
  }


  // A detector plate seen face on: z up, hits as small dots, the middle half
  // between dashed lines.
  function sgDrawPlate(panel, box, shapes, words) {
    const w = Math.min(box.w - 50, 170), h = 210, cx = box.x + box.w / 2, cy = 160;
    const X = v => cx + v * w / 2, Y = v => cy - v * h / 2;
    words.push(sgNode("text", { class: "sg-caption", x: cx, y: 38, "text-anchor": "middle" }, panel.caption));
    shapes.push(sgNode("rect", { class: "sg-glass", x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 6 }));
    shapes.push(sgNode("path", { class: "sg-ray", "data-tone": "angle", d: "M" + (cx - w / 2) + " " + Y(panel.band) + "H" + (cx + w / 2) + "M" + (cx - w / 2) + " " + Y(-panel.band) + "H" + (cx + w / 2) }));
    for (const hit of panel.hits) shapes.push(sgNode("circle", { class: "sg-hit", "data-tone": panel.tone, cx: X(hit.x).toFixed(1), cy: Y(hit.z).toFixed(1), r: 2.2 }));
    words.push(sgNode("text", { class: "sg-tick", x: cx - w / 2 - 6, y: Y(1) + 10, "text-anchor": "end" }, "+z"));
    words.push(sgNode("text", { class: "sg-tick", x: cx - w / 2 - 6, y: Y(-1), "text-anchor": "end" }, "−z"));
    words.push(sgNode("text", { class: "sg-tick", x: cx, y: cy + h / 2 + 18, "text-anchor": "middle" }, panel.hits.length ? "latest " + panel.hits.length + " atoms" : "no atoms yet"));
  }

  // A Stern–Gerlach magnet seen along the beam. The figure is drawn with its axis u
  // pointing up, then turned by the roll angle; text stays upright.
  function sgDrawMagnet(panel, box, shapes, words) {
    const cx = box.x + box.w / 2, cy = 150, t = sgRad(panel.roll), cos = Math.cos(t), sin = Math.sin(t);
    const R = (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos];
    const poly = pts => pts.map(([x, y]) => R(x, y).map(n => n.toFixed(1)).join(",")).join(" ");
    words.push(sgNode("text", { class: "sg-caption", x: cx, y: 22, "text-anchor": "middle" }, panel.caption));
    const knife = [[-70, -108], [70, -108], [70, -66], [12, -66], [0, -42], [-12, -66], [-70, -66]];
    const groove = [[-70, 108], [70, 108], [70, 50], [26, 50], [14, 64], [-14, 64], [-26, 50], [-70, 50]];
    const flat = sign => [[-70, sign * 108], [70, sign * 108], [70, sign * 52], [-70, sign * 52]];
    const flip = pts => pts.map(([x, y]) => [x, -y]);
    let top, bottom;
    if (panel.grad > 0) { top = knife; bottom = groove; }
    else if (panel.grad < 0) { top = flip(groove); bottom = flip(knife); }
    else { top = flat(-1); bottom = flat(1); }
    shapes.push(sgNode("polygon", { class: "sg-part", "data-tone": "alpha", points: poly(top) }));
    shapes.push(sgNode("polygon", { class: "sg-part", "data-tone": "alpha", points: poly(bottom) }));
    // Axis u through the beam, positive end labelled.
    const [ax, ay] = R(0, -122), [bx, by] = R(0, 122);
    shapes.push(sgNode("line", { class: "sg-ray", "data-tone": "angle", x1: bx, y1: by, x2: ax, y2: ay }));
    const [lx, ly] = R(18, -116);
    words.push(sgNode("text", { class: "sg-label", "data-tone": "angle", x: lx, y: ly + 5, "text-anchor": "middle" }, "+u"));
    if (panel.grad) {
      const [sx, sy] = R(-46, panel.grad > 0 ? -40 : 40);
      words.push(sgNode("text", { class: "sg-tick", x: sx, y: sy + 4, "text-anchor": "middle" }, "stronger"));
    }
    // The beam goes into the page.
    shapes.push(sgNode("circle", { class: "sg-beam-dot", cx, cy, r: 9 }));
    shapes.push(sgNode("path", { class: "sg-axis", d: "M" + (cx - 5) + " " + (cy - 5) + "L" + (cx + 5) + " " + (cy + 5) + "M" + (cx + 5) + " " + (cy - 5) + "L" + (cx - 5) + " " + (cy + 5) }));
    if (panel.show && panel.grad) {
      for (const [q, tone, text] of [[1, "plus", "+ℏ/2 channel (solid)"], [-1, "minus", "−ℏ/2 channel (dashed)"]]) {
        const d = q * panel.grad * 34; // +ℏ/2 moves toward −g·u, which is down in the unturned figure
        const [ex, ey] = R(0, d), [fx, fy] = R(0, Math.sign(d) * 12);
        const len = Math.hypot(ex - fx, ey - fy) || 1, ux = (ex - fx) / len, uy = (ey - fy) / len;
        shapes.push(sgNode("line", { class: "sg-arrow" + (q < 0 ? " sg-dashed" : ""), "data-tone": tone, x1: fx, y1: fy, x2: ex - ux * 8, y2: ey - uy * 8 }));
        shapes.push(sgNode("polygon", { class: "sg-head", "data-tone": tone,
          points: ex + "," + ey + " " + (ex - ux * 10 - uy * 5) + "," + (ey - uy * 10 + ux * 5) + " " + (ex - ux * 10 + uy * 5) + "," + (ey - uy * 10 - ux * 5) }));
        sgLabel(words, text, q > 0 ? box.x + box.w - 110 : box.x + 150, 290, tone, "middle");
      }
    }
    if (!panel.grad) words.push(sgNode("text", { class: "sg-label", "data-tone": "warn", x: cx, y: 286, "text-anchor": "middle" }, "uniform field: no split"));
    // Fixed world axes in the corner.
    const ox = box.x + 40, oy = 96;
    shapes.push(sgNode("path", { class: "sg-axis", d: "M" + ox + " " + oy + "h34M" + ox + " " + oy + "v-34" }));
    words.push(sgNode("text", { class: "sg-tick", x: ox + 40, y: oy + 4 }, "+x"));
    words.push(sgNode("text", { class: "sg-tick", x: ox - 4, y: oy - 40 }, "+z"));
  }

  // A split-and-recombine loop: source, Z splitter, two paths, reversed magnet,
  // final analyzer F and its two detectors.
  function sgDrawLoop(panel, box, shapes, words) {
    const y0 = 150, up = 92, down = 208;
    const boxAt = (x, w, label, tone) => {
      shapes.push(sgNode("rect", { class: "sg-part", "data-tone": tone, x, y: y0 - 22, width: w, height: 44, rx: 6 }));
      words.push(sgNode("text", { class: "sg-label", "data-tone": tone, x: x + w / 2, y: y0 + 5, "text-anchor": "middle" }, label));
    };
    words.push(sgNode("text", { class: "sg-caption", x: 280, y: 24, "text-anchor": "middle" }, panel.caption));
    const path = (d, tone, extra = "") => shapes.push(sgNode("path", { class: "sg-path" + extra, "data-tone": tone, d }));
    path("M70 " + y0 + "H104", "guide");
    const blockedUp = panel.paths === "block-plus", blockedDown = panel.paths === "block-minus";
    path("M150 " + y0 + "C178 " + y0 + " 172 " + up + " 205 " + up + "H330C362 " + up + " 356 " + y0 + " 384 " + y0, "plus", blockedUp ? " sg-faint" : "");
    path("M150 " + y0 + "C178 " + y0 + " 172 " + down + " 205 " + down + "H330C362 " + down + " 356 " + y0 + " 384 " + y0, "minus", " sg-dashed" + (blockedDown ? " sg-faint" : ""));
    words.push(sgNode("text", { class: "sg-tick", x: 268, y: up - 12, "text-anchor": "middle" }, "+z path"));
    words.push(sgNode("text", { class: "sg-tick", x: 268, y: down + 24, "text-anchor": "middle" }, "−z path"));
    for (const [y, on] of [[up, blockedUp], [down, blockedDown]]) {
      if (on) {
        shapes.push(sgNode("path", { class: "sg-block", d: "M258 " + (y - 10) + "l20 20m0 -20l-20 20" }));
        words.push(sgNode("text", { class: "sg-label", "data-tone": "warn", x: 296, y: y < y0 ? y - 26 : y + 44, "text-anchor": "start" }, "blocked " + sgFmt(sgRound(panel.lost, 0.001))));
      }
      if (panel.paths === "tag") {
        shapes.push(sgNode("circle", { class: "sg-dot", "data-tone": "angle", cx: 268, cy: y, r: 6 }));
        words.push(sgNode("text", { class: "sg-label", "data-tone": "angle", x: 280, y: y + (y < y0 ? 24 : -12), "text-anchor": "start" }, "marker"));
      }
    }
    path("M430 " + y0 + "H452", "guide");
    path("M494 " + y0 + "C512 " + y0 + " 508 112 530 112", "plus");
    path("M494 " + y0 + "C512 " + y0 + " 508 188 530 188", "minus", " sg-dashed");
    boxAt(14, 56, "src", "plus");
    boxAt(104, 46, "Z", "alpha");
    boxAt(384, 46, "Z⁻¹", "alpha");
    boxAt(452, 42, "F", "angle");
    shapes.push(sgNode("circle", { class: "sg-dot", "data-tone": "plus", cx: 536, cy: 112, r: 6 }));
    shapes.push(sgNode("rect", { class: "sg-dot", "data-tone": "minus", x: 530, y: 182, width: 12, height: 12 }));
    sgLabel(words, "F+ " + sgFmt(sgRound(panel.plus, 0.001)), 548, 94, "plus", "end");
    sgLabel(words, "F− " + sgFmt(sgRound(panel.minus, 0.001)), 548, 220, "minus", "end");
    words.push(sgNode("text", { class: "sg-tick", x: 473, y: y0 + 40, "text-anchor": "middle" }, "n: " + sgDirText(panel.n).replace("η = ", "η ").replace("φ = ", "φ ")));
    const k = panel.counts;
    words.push(sgNode("text", { class: "sg-tick", x: 280, y: 288, "text-anchor": "middle" },
      k.sent ? "simulated: " + k.sent + " sent · " + k.lost + " blocked · " + k.plus + " F+ · " + k.minus + " F−" : "no simulated atoms yet"));
  }

  // The vector model for spin-½: a cone of half-angle arccos(1/√3) around the axis
  // with a definite component. The drawn azimuth is only a picture.
  function sgDrawCone(panel, box, shapes, words) {
    const unit = 200, ox = 170, oy = 262, top = oy - unit * 0.5, r = unit * Math.SQRT1_2, ry = 26;
    const t = sgRad(panel.az), px = ox + r * Math.sin(t), py = top + ry * Math.cos(t);
    words.push(sgNode("text", { class: "sg-caption", x: 352, y: 56, "text-anchor": "start" }, panel.caption));
    shapes.push(sgNode("ellipse", { class: "sg-ring", "data-tone": "guide", cx: ox, cy: top, rx: r, ry }));
    shapes.push(sgNode("path", { class: "sg-ray", "data-tone": "guide", d: "M" + ox + " " + oy + "L" + (ox - r) + " " + top + "M" + ox + " " + oy + "L" + (ox + r) + " " + top }));
    shapes.push(sgNode("line", { class: "sg-axis", x1: ox, y1: oy, x2: ox, y2: oy - unit * 0.95 }));
    words.push(sgNode("text", { class: "sg-label", "data-tone": "ink", x: ox + 8, y: oy - unit * 0.95 + 4, "text-anchor": "start" }, "+" + panel.axis));
    // The length |S| marked along the axis: the vector would need this much component to lie on the axis.
    const full = oy - unit * Math.sqrt(3) / 2;
    shapes.push(sgNode("path", { class: "sg-ray", "data-tone": "warn", d: "M" + (ox - 14) + " " + full + "H" + (ox + 14) }));
    words.push(sgNode("text", { class: "sg-tick", x: ox - 18, y: full + 4, "text-anchor": "end" }, "|S|"));
    shapes.push(sgNode("path", { class: "sg-ray sg-solid", "data-tone": "angle", d: "M" + (ox - 14) + " " + top + "H" + (ox + 14) }));
    words.push(sgNode("text", { class: "sg-label", "data-tone": "angle", x: ox + 20, y: top - 8, "text-anchor": "start" }, "ℏ/2"));
    shapes.push(sgNode("line", { class: "sg-arrow", "data-tone": "plus", x1: ox, y1: oy, x2: px, y2: py }));
    shapes.push(sgNode("circle", { class: "sg-dot", "data-tone": "plus", cx: px, cy: py, r: 5 }));
    shapes.push(sgNode("line", { class: "sg-arrow sg-dashed", "data-tone": "angle", x1: px, y1: py, x2: ox, y2: py }));
    const lines = [["S² = (3/4)ℏ²", "ink"], ["|S| = (√3/2)ℏ ≈ 0.866ℏ", "plus"], ["S_" + panel.axis + " = +ℏ/2", "angle"], ["tilt ≈ 54.74°", "ink"], ["other two components:", "minus"], ["no definite values", "minus"]];
    lines.forEach(([text, tone], k) => words.push(sgNode("text", { class: k > 3 ? "sg-tick" : "sg-label", "data-tone": tone, x: 352, y: 96 + 30 * k, "text-anchor": "start" }, text)));
  }

  // The bench view, drawn in SVG (and as the fallback when Three.js is unavailable).
  const SG_BENCH_SCALE = 120;
  // The two pole pieces of a magnet: centres at ±0.2 n, faces spanned by the beam
  // direction and t = (cos ρ, 0, −sin ρ).
  function sgPoles(mag) {
    const t = [Math.cos(sgRad(mag.roll)), 0, -Math.sin(sgRad(mag.roll))];
    return [1, -1].map(side => ({ side, centre: [0.2 * side * mag.n[0], mag.y, 0.2 * side * mag.n[2]], t }));
  }
  function sgDrawBench(view, shapes, words) {
    const frame = sgFrame(view.yaw, view.tilt), P = point => sgProject(frame, point, SG_BENCH_SCALE);
    const poly = (pts, cls, tone) => shapes.push(sgNode("polygon", { class: cls, "data-tone": tone, points: pts.map(p => { const q = P(p); return q.x.toFixed(1) + "," + q.y.toFixed(1); }).join(" ") }));
    const h = SG_BENCH.half, Y = SG_BENCH.screen;
    poly([[-h, Y, -h], [h, Y, -h], [h, Y, h], [-h, Y, h]], "sg-glass", null);
    poly([[-0.12, SG_BENCH.source - 0.12, -0.12], [0.12, SG_BENCH.source - 0.12, -0.12], [0.12, SG_BENCH.source + 0.12, 0.12], [-0.12, SG_BENCH.source + 0.12, 0.12]], "sg-part", "beta");
    for (const mag of view.magnets) {
      for (const pole of sgPoles(mag)) {
        const c = pole.centre, t = pole.t, corner = (a, b) => [c[0] + a * 0.16 * t[0], c[1] + b * 0.1, c[2] + a * 0.16 * t[2]];
        poly([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], "sg-part", pole.side > 0 ? "angle" : "alpha");
      }
    }
    for (const seg of view.segments) {
      const a = P(seg.from), b = P(seg.to);
      // Beams, hits and spots go in the label layer, so they show over the WebGL picture too.
      words.push(sgNode("line", { class: "sg-path" + (seg.tone === "minus" ? " sg-dashed" : ""), "data-tone": seg.tone, x1: a.x, y1: a.y, x2: b.x, y2: b.y, "stroke-opacity": (0.35 + 0.65 * seg.prob).toFixed(2) }));
    }
    for (const hit of view.hits) { const q = P([hit.x, Y, hit.z]); words.push(sgNode("circle", { class: "sg-hit", "data-tone": "plus", cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: 2 })); }
    view.leaves.forEach(leaf => {
      const q = P([leaf.x, Y, leaf.z]);
      words.push(sgNode("circle", { class: "sg-ring", "data-tone": "angle", cx: q.x, cy: q.y, r: 4 + 8 * leaf.prob }));
      words.push(sgNode("text", { class: "sg-tick", x: q.x + 12, y: q.y + 4, "text-anchor": "start" }, leaf.signs + " " + sgFmt(sgRound(leaf.prob, 0.001))));
    });
    view.magnets.forEach((mag, k) => {
      const q = P([0.32 * mag.n[0], mag.y, 0.32 * mag.n[2]]);
      words.push(sgNode("text", { class: "sg-label", "data-tone": "angle", x: q.x, y: q.y - 6, "text-anchor": "middle" }, "M" + (k + 1) + " +n"));
    });
    const oven = P([0, SG_BENCH.source, -0.22]);
    words.push(sgNode("text", { class: "sg-tick", x: oven.x, y: oven.y + 16, "text-anchor": "middle" }, "oven"));
    const screen = P([0, Y, -h]);
    words.push(sgNode("text", { class: "sg-tick", x: screen.x, y: Math.min(292, screen.y + 16), "text-anchor": "middle" }, "screen"));
    // A small set of axes beside the oven.
    const o = [0, SG_BENCH.source - 0.1, 0.55], O = P(o);
    for (const [d, name] of [[[0.25, 0, 0], "x"], [[0, 0.25, 0], "y"], [[0, 0, 0.25], "z"]]) {
      const e = P(o.map((v, i) => v + d[i]));
      shapes.push(sgNode("line", { class: "sg-axis", x1: O.x, y1: O.y, x2: e.x, y2: e.y }));
      const tag = P(o.map((v, i) => v + d[i] * 1.45));
      words.push(sgNode("text", { class: "sg-tick", x: tag.x, y: tag.y + 4, "text-anchor": "middle" }, "+" + name));
    }
  }

  const SG_PANEL_DRAW = {
    plane: sgDrawPlane, chart: sgDrawChart, bars: sgDrawBars, line: sgDrawLine, chain: sgDrawChain,
    plate: sgDrawPlate, magnet: sgDrawMagnet, loop: sgDrawLoop, cone: sgDrawCone
  };

  // Three.js view of the bench: oven, pole pieces and screen. Beams, hits, spots
  // and labels stay in the SVG label layer on top, for both renderers.
  function sgCreateGraphics(THREE, canvas, colors) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    const camera = new THREE.OrthographicCamera(-SG_VIEW.cx, 560 - SG_VIEW.cx, SG_VIEW.cy, SG_VIEW.cy - 300, 1, 2000);
    camera.position.set(0, 0, 800);
    camera.lookAt(0, 0, 0);
    const disposables = [];
    const keep = item => { disposables.push(item); return item; };
    const materials = new Map();
    const lambert = tone => {
      const key = "lambert-" + tone;
      if (!materials.has(key)) materials.set(key, keep(new THREE.MeshLambertMaterial({ color: colors[tone] ?? colors.plus })));
      return materials.get(key);
    };
    const scenes = {};

    function place(group, scale, frame) {
      group.matrix.set(
        scale * frame.right[0], scale * frame.right[1], scale * frame.right[2], 0,
        scale * frame.up[0], scale * frame.up[1], scale * frame.up[2], 0,
        scale * frame.toward[0], scale * frame.toward[1], scale * frame.toward[2], 0,
        0, 0, 0, 1);
      group.matrixWorldNeedsUpdate = true;
    }
    function pool(group, geometry, material) {
      const meshes = [];
      return (count, each) => {
        while (meshes.length < count) {
          const mesh = new THREE.Mesh(geometry, material);
          group.add(mesh);
          meshes.push(mesh);
        }
        meshes.forEach((mesh, k) => {
          mesh.visible = k < count;
          if (k < count) each(mesh, k);
        });
      };
    }

    function buildBench() {
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.5);
      sun.position.set(-300, 400, 600);
      scene.add(sun);
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      scene.add(group);
      const h = SG_BENCH.half;
      const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * h, 2 * h)),
        keep(new THREE.MeshBasicMaterial({ color: colors.glass, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })));
      screen.rotation.x = Math.PI / 2;
      screen.position.y = SG_BENCH.screen;
      group.add(screen);
      const rim = new THREE.LineLoop(keep(new THREE.BufferGeometry().setFromPoints([[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => new THREE.Vector3(x, SG_BENCH.screen, z)))),
        keep(new THREE.LineBasicMaterial({ color: colors.axis })));
      group.add(rim);
      const oven = new THREE.Mesh(keep(new THREE.BoxGeometry(0.24, 0.24, 0.24)), lambert("beta"));
      oven.position.y = SG_BENCH.source;
      group.add(oven);
      const o = [0, SG_BENCH.source - 0.1, 0.55];
      group.add(new THREE.LineSegments(keep(new THREE.BufferGeometry().setFromPoints([[0.25, 0, 0], [0, 0.25, 0], [0, 0, 0.25]].flatMap(d =>
        [new THREE.Vector3(...o), new THREE.Vector3(o[0] + d[0], o[1] + d[1], o[2] + d[2])]))), keep(new THREE.LineBasicMaterial({ color: colors.axis }))));
      const poleGeometry = keep(new THREE.BoxGeometry(1, 1, 1));
      const poles = { angle: pool(group, poleGeometry, lambert("angle")), alpha: pool(group, poleGeometry, lambert("alpha")) };
      return {
        draw(view) {
          place(group, SG_BENCH_SCALE, sgFrame(view.yaw, view.tilt));
          const bySide = { angle: [], alpha: [] };
          for (const mag of view.magnets) for (const pole of sgPoles(mag)) bySide[pole.side > 0 ? "angle" : "alpha"].push({ pole, mag });
          for (const side of ["angle", "alpha"]) {
            poles[side](bySide[side].length, (mesh, k) => {
              const { pole, mag } = bySide[side][k];
              mesh.position.set(...pole.centre);
              mesh.rotation.set(0, sgRad(mag.roll), 0);
              mesh.scale.set(0.32, 0.2, 0.1);
            });
          }
          renderer.render(scene, camera);
        }
      };
    }

    return {
      draw(kind, view, width, height, low) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
        renderer.setSize(width, height, false);
        scenes[kind] ??= buildBench();
        scenes[kind].draw(view);
      },
      invalidate() { /* Geometry is rebuilt on every draw; nothing to restore. */ },
      dispose() {
        for (const item of disposables) item.dispose();
        renderer.dispose();
      }
    };
  }

  if (lesson) initializeSternGerlachArcade(lesson);
} catch (error) {
  console.error("Stern–Gerlach Arcade could not start.", error);
}
