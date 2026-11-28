const PREPARATIONS = {
  opening: { label: "Opening preparation", parts: [[3, 0], [4, 0]], denominatorSquared: 25 },
  complex: { label: "Imaginary coefficient", parts: [[3, 0], [0, 4]], denominatorSquared: 25 },
  zero: { label: "Basis state |0⟩", parts: [[1, 0], [0, 0]], denominatorSquared: 1 },
  plus: { label: "Basis state |+⟩", parts: [[1, 0], [1, 0]], denominatorSquared: 2 }
};

const BASES = {
  z: {
    label: "Z basis",
    denominatorSquared: 1,
    outcomes: [
      { label: "0", spoken: "zero", subscript: "₀", parts: [[1, 0], [0, 0]] },
      { label: "1", spoken: "one", subscript: "₁", parts: [[0, 0], [1, 0]] }
    ]
  },
  x: {
    label: "X basis",
    denominatorSquared: 2,
    outcomes: [
      { label: "+", spoken: "plus", subscript: "₊", parts: [[1, 0], [1, 0]] },
      { label: "−", spoken: "minus", subscript: "₋", parts: [[1, 0], [-1, 0]] }
    ]
  }
};

const SLOTS = ["first", "second"];

function gcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function squaredMagnitude([real, imaginary]) {
  return real * real + imaginary * imaginary;
}

// Each ket stores integer real and imaginary parts over one square-root denominator.
function innerProduct(basisKet, state, basisDenominatorSquared) {
  let real = 0;
  let imaginary = 0;

  for (let index = 0; index < state.parts.length; index++) {
    const [a, b] = basisKet[index];
    const [c, d] = state.parts[index];
    real += a * c + b * d;
    imaginary += a * d - b * c;
  }

  return {
    parts: [real, imaginary],
    denominatorSquared: basisDenominatorSquared * state.denominatorSquared
  };
}

function measurement(stateKey, basisKey) {
  const preparation = PREPARATIONS[stateKey];
  const basis = BASES[basisKey];
  const outcomes = basis.outcomes.map(outcome => {
    const amplitude = innerProduct(outcome.parts, preparation, basis.denominatorSquared);
    const weight = squaredMagnitude(amplitude.parts);

    return {
      ...outcome,
      amplitude,
      weight,
      probability: weight / amplitude.denominatorSquared
    };
  });

  return { preparation, basis, outcomes };
}

function sampleOutcome(firstProbability, draw = Math.random) {
  if (firstProbability === 1) return 0;
  if (firstProbability === 0) return 1;
  return draw() < firstProbability ? 0 : 1;
}

function fraction(top, bottom) {
  const divisor = gcd(top, bottom);
  const reducedTop = top / divisor;
  const reducedBottom = bottom / divisor;
  return reducedBottom === 1 ? String(reducedTop) : `${reducedTop}/${reducedBottom}`;
}

function amplitudeText([real, imaginary], denominatorSquared) {
  if (real === 0 && imaginary === 0) return "0";

  let outsideRoot = Math.floor(Math.sqrt(denominatorSquared));
  while (denominatorSquared % (outsideRoot * outsideRoot) !== 0) outsideRoot--;
  const insideRoot = denominatorSquared / (outsideRoot * outsideRoot);
  const divisor = gcd(gcd(Math.abs(real), Math.abs(imaginary)), outsideRoot);
  const re = real / divisor;
  const im = imaginary / divisor;
  const coefficient = outsideRoot / divisor;
  const imaginaryTerm = Math.abs(im) === 1 ? "i" : `${Math.abs(im)}i`;

  let numerator;
  if (re === 0) numerator = `${im < 0 ? "−" : ""}${imaginaryTerm}`;
  else if (im === 0) numerator = String(re).replace("-", "−");
  else numerator = `${String(re).replace("-", "−")} ${im < 0 ? "−" : "+"} ${imaginaryTerm}`;

  if (insideRoot === 1 && coefficient === 1) return numerator;
  if (re !== 0 && im !== 0) numerator = `(${numerator})`;

  const denominator = insideRoot === 1
    ? String(coefficient)
    : coefficient === 1 ? `√${insideRoot}` : `(${coefficient}√${insideRoot})`;
  return `${numerator}/${denominator}`;
}

function percent(value) {
  return `${Number((100 * value).toFixed(2))}%`;
}

function amplitudeCalculation(outcome, index, basisKey, [alpha, beta]) {
  const amplitude = amplitudeText(outcome.amplitude.parts, outcome.amplitude.denominatorSquared);
  const substitution = basisKey === "x"
    ? `(${alpha} ${index === 0 ? "+" : "−"} ${beta})/√2 = `
    : "";
  return `c${outcome.subscript} = ⟨${outcome.label}|ψ⟩ = ${substitution}${amplitude}`;
}

function probabilityCalculation(outcome) {
  const { parts: [real, imaginary], denominatorSquared } = outcome.amplitude;
  const amplitude = amplitudeText(outcome.amplitude.parts, denominatorSquared);
  const ratio = fraction(outcome.weight, denominatorSquared);

  return real !== 0 && imaginary !== 0
    ? `|${amplitude}|² = (${Math.abs(real)}² + ${Math.abs(imaginary)}²)/${denominatorSquared} = ${ratio}`
    : `|${amplitude}|² = ${ratio}`;
}

const openingInX = measurement("opening", "x").outcomes;
const plusExpected = 100 * openingInX[0].probability;
const minusChance = percent(openingInX[1].probability);

const QUESTIONS = {
  frequency: {
    answer: "varies",
    correct: `Correct. The expected plus count is 100 × ${openingInX[0].probability} = ${plusExpected}. Individual batches can contain different counts.`,
    retry: "An expected count describes the average across batches. Each fresh trial still has a chance of returning minus."
  },
  repeat: {
    answer: "same-system",
    correct: `Correct. After a minus result, that ideal measured system is in |−⟩. A fresh copy of the opening state has a ${minusChance} chance of minus in X.`,
    retry: "Compare the system already measured with a new copy of the opening preparation. Only the system already measured is guaranteed to be in |−⟩."
  }
};

function wireChallenge(find) {
  const form = find("challenge");
  const panels = [...form.querySelectorAll("[data-born-question]")];
  const next = find("challenge-next");
  const restart = find("challenge-restart");
  const feedback = find("challenge-feedback");
  let index = 0;

  function clearFeedback() {
    feedback.textContent = "";
    next.hidden = true;
    restart.hidden = true;
  }

  function showQuestion() {
    panels.forEach((panel, position) => { panel.hidden = position !== index; });
    clearFeedback();
    panels[index].querySelector("h4").focus();
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const panel = panels[index];
    const choice = panel.querySelector("input:checked");
    if (!choice) {
      feedback.textContent = "Choose an answer first.";
      panel.querySelector("input").focus();
      return;
    }

    const question = QUESTIONS[panel.dataset.bornQuestion];
    const correct = choice.value === question.answer;
    feedback.textContent = correct ? question.correct : question.retry;
    next.hidden = !correct || index === panels.length - 1;
    restart.hidden = !correct || index !== panels.length - 1;
  });

  form.addEventListener("change", clearFeedback);
  next.addEventListener("click", () => {
    if (next.hidden) return;
    index++;
    showQuestion();
  });
  restart.addEventListener("click", () => {
    form.reset();
    index = 0;
    showQuestion();
  });
}

function initializeLab(root) {
  const find = id => root.querySelector(`#born-${id}`);
  const write = (id, value) => { find(id).textContent = value; };
  const stateSelect = find("state");
  const basisOptions = [...root.querySelectorAll("input[name='born-basis']")];
  const prediction = find("prediction");
  const runControls = find("run-controls");
  const runButtons = [...runControls.querySelectorAll("[data-born-trials]")];

  let stateKey = "opening";
  let basisKey = "z";
  let unlocked = false;
  let series = 1;
  let counts = [0, 0];
  let last = null;
  let model = measurement(stateKey, basisKey);

  function clearSeries() {
    counts = [0, 0];
    last = null;
  }

  function syncSettings() {
    stateSelect.value = stateKey;
    for (const radio of basisOptions) radio.checked = radio.value === basisKey;
  }

  function setMeter(id, value) {
    const meter = find(id);
    meter.value = value ?? 0;
    meter.hidden = value === null;
    meter.textContent = value === null ? "—" : percent(value);
    write(`${id}-text`, meter.textContent);
  }

  function renderApparatus() {
    const [first, second] = model.outcomes;
    const lastResult = last === null ? "" : ` Most recent simulated outcome: ${model.outcomes[last].spoken}.`;
    const labels = {
      "diagram-basis": model.basis.label,
      "diagram-first": first.label,
      "diagram-second": second.label,
      "diagram-desc": `The prepared state enters the ${model.basis.label} measurement. A trial reports either ${first.spoken} or ${second.spoken}.${lastResult}`
    };

    for (const [id, value] of Object.entries(labels)) {
      const element = find(id);
      if (element) element.textContent = value;
    }

    for (const [index, slot] of SLOTS.entries()) {
      find(`channel-${slot}`)?.setAttribute("data-active", String(last === index));
    }
  }

  function render() {
    const { preparation, basis, outcomes } = model;
    const [alpha, beta] = preparation.parts.map(parts =>
      amplitudeText(parts, preparation.denominatorSquared)
    );
    const [alphaSquared, betaSquared] = preparation.parts.map(parts =>
      fraction(squaredMagnitude(parts), preparation.denominatorSquared)
    );

    write("ket", `|ψ⟩ = (${alpha})|0⟩ + (${beta})|1⟩`);
    write("alpha", alpha);
    write("beta", beta);
    write("norm", `Normalization · |α|² + |β|² = ${alphaSquared} + ${betaSquared} = 1.`);
    write("series", `Series ${series} · ${preparation.label} · ${basis.label}`);

    const total = counts[0] + counts[1];
    write("total", total);
    write("last", last === null ? "—" : outcomes[last].label);
    write("last-ket", last === null ? "—" : `|${outcomes[last].label}⟩`);

    const theoryVisible = unlocked || (stateKey === "opening" && basisKey === "z");
    find("run-lock").hidden = unlocked;
    find("theory-pending").hidden = theoryVisible;
    runControls.disabled = !unlocked;

    for (const [index, slot] of SLOTS.entries()) {
      const outcome = outcomes[index];
      write(`${slot}-label`, outcome.label);
      find(`${slot}-theory`).hidden = !theoryVisible;
      write(`${slot}-amplitude`, amplitudeCalculation(outcome, index, basisKey, [alpha, beta]));
      write(`${slot}-work`, probabilityCalculation(outcome));
      setMeter(`${slot}-probability`, outcome.probability);
      setMeter(`${slot}-frequency`, total === 0 ? null : counts[index] / total);
      write(`${slot}-count`, counts[index]);
    }

    renderApparatus();
  }

  function changeSettings(nextState, nextBasis) {
    if (nextState === stateKey && nextBasis === basisKey) return;

    stateKey = nextState;
    basisKey = nextBasis;
    model = measurement(stateKey, basisKey);
    series++;
    clearSeries();
    render();
    write("announcement", `Fresh series ${series}. ${model.preparation.label}. ${model.basis.label}. Zero trials so far.`);
  }

  function runTrials(size) {
    if (!unlocked) return;

    const batch = [0, 0];
    for (let trial = 0; trial < size; trial++) {
      last = sampleOutcome(model.outcomes[0].probability);
      batch[last]++;
    }

    counts[0] += batch[0];
    counts[1] += batch[1];
    render();

    const total = counts[0] + counts[1];
    if (size === 1) {
      write("announcement", `Simulated outcome ${model.outcomes[last].spoken}. ${total} total trials in series ${series}.`);
    } else {
      const [first, second] = model.outcomes;
      write("announcement", `Batch of ${size} simulated trials. Outcome ${first.spoken}: ${batch[0]}. Outcome ${second.spoken}: ${batch[1]}. ${total} total trials in series ${series}.`);
    }
  }

  stateSelect.addEventListener("change", () => {
    changeSettings(stateSelect.value, basisKey);
  });

  for (const radio of basisOptions) {
    radio.addEventListener("change", () => {
      if (radio.checked) changeSettings(stateKey, radio.value);
    });
  }

  prediction.addEventListener("change", () => { write("prediction-feedback", ""); });
  prediction.addEventListener("submit", event => {
    event.preventDefault();
    const guess = prediction.querySelector("input[name='born-guess']:checked");
    if (!guess) return;

    unlocked = true;
    render();
    const lead = guess.value === "combine" ? "Correct." : "Combine the amplitudes first.";
    const minus = openingInX[1];
    const amplitude = amplitudeText(minus.amplitude.parts, minus.amplitude.denominatorSquared);
    write("prediction-feedback", `${lead} For the opening state in X, the minus amplitude is ${amplitude}. Squaring its magnitude gives ${minusChance}. Live calculations and trials are now available.`);
  });

  for (const button of runButtons) {
    const size = Number(button.dataset.bornTrials);
    button.addEventListener("click", () => { runTrials(size); });
  }

  find("reset").addEventListener("click", () => {
    stateKey = "opening";
    basisKey = "z";
    series = 1;
    unlocked = false;
    model = measurement(stateKey, basisKey);
    clearSeries();
    prediction.reset();
    write("prediction-feedback", "");
    syncSettings();
    render();
    write("announcement", "Lab reset to the opening preparation and Z basis. Counts cleared. Check a prediction to unlock trials.");
  });

  wireChallenge(find);
  syncSettings();
  render();
  for (const id of ["setup-controls", "prediction-controls", "challenge-controls"]) {
    find(id).disabled = false;
  }
  find("static-note").hidden = true;
}

const lesson = document.querySelector(".site-main.born-rule-lesson");
if (lesson) initializeLab(lesson);


// ===========================================================================
// Measurement Arcade (optional practice). Everything below uses the br- prefix
// so it never touches the Measurement Lab above, which uses born-.
// ===========================================================================

const BR_TOLERANCE = 0.002; // typed answers, per real or imaginary part
const BR_DERIVED = 0.005;   // probabilities computed from a setting you build
const BR_ANGLE = 1;         // degrees
const BR_SVG = "http://www.w3.org/2000/svg";
const BR_R = Math.SQRT1_2;
const brNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

function brFmt(value) {
  if (!Number.isFinite(value)) return "undefined";
  return brNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
}

// An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
const brTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
const brFits = (value, answer) => Math.abs(value - answer) <= (brTerminates(answer) ? 1e-9 : BR_TOLERANCE + 1e-12);
const brNear = (value, target, tolerance = BR_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
const brWrap = (degrees, turn = 360) => ((degrees % turn) + turn) % turn;
const brAngleGap = (a, b, turn = 360) => { const d = brWrap(a - b, turn); return Math.min(d, turn - d); };
// Angles that differ by whole turns are equal.
const brAngleFits = (a, b, turn = 360) => brAngleGap(a, b, turn) <= BR_ANGLE + 1e-9;

// Parse numbers such as 2, −1.5, 3/5, √2, 1/√2 or (1 + √3)/2.
// This is a small arithmetic reader (+ − × / √ and brackets), never eval.
function brParse(raw) {
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

// Complex numbers are [real, imaginary] pairs. A ket is [first, second] in the 0/1 basis.
const brAdd = ([a, b], [c, d]) => [a + c, b + d];
const brSub = ([a, b], [c, d]) => [a - c, b - d];
const brMul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
const brConj = ([a, b]) => [a, -b];
const brScale = ([a, b], k) => [a * k, b * k];
const brAbs2 = ([a, b]) => a * a + b * b;
const brAbs = ([a, b]) => Math.hypot(a, b);
const brPolar = (r, degrees) => [r * Math.cos(degrees * Math.PI / 180), r * Math.sin(degrees * Math.PI / 180)];
const brNorm2 = ket => brAbs2(ket[0]) + brAbs2(ket[1]);
const brRad = degrees => degrees * Math.PI / 180;
// c_a = ⟨a|ψ⟩ = a₀*α + a₁*β. The bra carries the conjugate.
const brInner = (a, psi) => brAdd(brMul(brConj(a[0]), psi[0]), brMul(brConj(a[1]), psi[1]));
const brProb = (a, psi) => brAbs2(brInner(a, psi));
// |θ⟩ = cos θ|0⟩ + sin θ|1⟩ and its partner |θ⊥⟩ = −sin θ|0⟩ + cos θ|1⟩.
const brTilt = theta => [[Math.cos(brRad(theta)), 0], [Math.sin(brRad(theta)), 0]];
const brTiltPerp = theta => [[-Math.sin(brRad(theta)), 0], [Math.cos(brRad(theta)), 0]];
const BR_KETS = {
  zero: [[1, 0], [0, 0]], one: [[0, 0], [1, 0]],
  plus: [[BR_R, 0], [BR_R, 0]], minus: [[BR_R, 0], [-BR_R, 0]],
  plusi: [[BR_R, 0], [0, BR_R]], minusi: [[BR_R, 0], [0, -BR_R]]
};
const BR_BASES = {
  z: { name: "Z", outcomes: ["0", "1"], kets: [BR_KETS.zero, BR_KETS.one] },
  x: { name: "X", outcomes: ["+", "−"], kets: [BR_KETS.plus, BR_KETS.minus] },
  y: { name: "Y", outcomes: ["+i", "−i"], kets: [BR_KETS.plusi, BR_KETS.minusi] }
};
const brProbs = (psi, basis) => BR_BASES[basis].kets.map(ket => brProb(ket, psi));
const brReal = ket => Math.abs(ket[0][1]) < 1e-9 && Math.abs(ket[1][1]) < 1e-9;

function brCx([a, b]) {
  const re = Math.abs(a) < 5e-10 ? 0 : a, im = Math.abs(b) < 5e-10 ? 0 : b;
  if (im === 0) return brFmt(re);
  const size = Math.abs(im) === 1 ? "i" : brFmt(Math.abs(im)) + "i";
  if (re === 0) return (im < 0 ? "−" : "") + size;
  return brFmt(re) + (im < 0 ? " − " : " + ") + size;
}
const brKetText = ket => "(" + ket.map(brCx).join(", ") + ")ᵀ";

// Degrees with radians alongside: 60° · π/3 rad.
function brRadText(degrees) {
  const k = degrees / 7.5;
  if (Math.abs(k - Math.round(k)) > 1e-9) return "≈ " + brFmt(degrees * Math.PI / 180);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let n = Math.round(k), d = 24;
  if (n === 0) return "0";
  const g = gcd(Math.abs(n), d);
  n /= g; d /= g;
  const top = n === 1 ? "π" : n === -1 ? "−π" : brFmt(n) + "π";
  return d === 1 ? top : top + "/" + d;
}
const brAngleText = degrees => brFmt(degrees) + "° · " + brRadText(degrees) + " rad";

// A small seeded generator (mulberry32), so a reset replays the same run.
function brRandom(seed) {
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
function brSeed(c, seed = 1) { c.s.seed = seed; c.s.rng = brRandom(seed * 7919 + c.key.length); }
const brReseed = (c, after = "") => {
  brSeed(c, c.s.seed + 1);
  return "Seed " + c.s.seed + ". New trials use a fresh sequence. Reset this station to return to seed 1." + after;
};
const brPick = (rng, probabilities) => {
  let r = rng(), k = 0;
  while (k < probabilities.length - 1 && r >= probabilities[k]) { r -= probabilities[k]; k++; }
  return k;
};
const brCount = (rng, p, n) => { let k = 0; for (let t = 0; t < n; t++) if (rng() < p) k++; return k; };

const brGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
const brSetup = message => brGrade(false, message);

function brLabelText(field) {
  const label = field.closest("label");
  if (!label) return "the selected input";
  const copy = label.cloneNode(true);
  copy.querySelectorAll("input, select, output").forEach(node => node.remove());
  return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
}

class BrFieldError extends Error {
  constructor(field, detail = "", custom = false) {
    super("Check " + brLabelText(field) + "." + (detail ? " " + detail : ""));
    this.field = field;
    this.detail = detail;
    this.custom = custom;
  }
}

function brSetText(element, text) {
  text = String(text ?? "");
  if (element && element.textContent !== text) element.textContent = text;
}

// Plot builders used by the station show() functions. A plan holds panels laid
// out side by side (planes, charts, bars, polarizer stacks, chains), or one 3D view.
const brArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
const brPlane = (caption, items, extra = {}) => ({ kind: "plane", caption, items, limit: 1, circle: 1, axes: ["|0⟩", "|1⟩"], ...extra });
const brBars = (caption, items, extra = {}) => ({ kind: "bars", caption, items, ...extra });
const brChart = (caption, extra) => ({ kind: "chart", caption, x: [0, 1], y: [0, 1], xTicks: [0, 1], yTicks: [0, 0.5, 1], xLabel: "", ...extra });
const brSweep = (f, x0, x1, n = 120) => Array.from({ length: n + 1 }, (_, k) => {
  const x = x0 + (x1 - x0) * k / n;
  return [x, f(x)];
});
// A real ket drawn as an arrow in the |0⟩/|1⟩ plane.
const brKetArrow = (ket, tone, label, extra = {}) => brArrow([ket[0][0], ket[1][0]], tone, label, extra);
const brAxisRays = (theta, extra = {}) => [{ angle: theta, through: true, solid: true, tone: "angle", ...extra }, { angle: theta + 90, through: true, tone: "minus", ...extra }];

// 1 · Tilted Detector. The detector measures in {|θ⟩, |θ⊥⟩}; θ and θ + 180° are the same basis.
const BR_TILT_PREPS = {
  sixty: { ket: brTilt(60), text: "|ψ⟩ = (1/2)|0⟩ + (√3/2)|1⟩" },
  minus30: { ket: brTilt(-30), text: "|ψ⟩ = (√3/2)|0⟩ − (1/2)|1⟩" },
  zero: { ket: BR_KETS.zero, text: "|ψ⟩ = |0⟩" },
  plusi: { ket: BR_KETS.plusi, text: "|ψ⟩ = |+i⟩ = (|0⟩ + i|1⟩)/√2" }
};

function brTiltRecord(c, theta) {
  const prep = c.val("prep"), ket = BR_TILT_PREPS[prep].ket, p = brProb(brTilt(theta), ket);
  c.s.records = [...c.s.records.filter(r => r.prep !== prep || brAngleGap(r.theta, theta, 180) > 1e-9), { prep, theta, p }].slice(-10);
  return "Recorded θ = " + brAngleText(theta) + " for " + BR_TILT_PREPS[prep].text + ": P(θ) = " + brFmt(p) + ", P(θ⊥) = " + brFmt(1 - p) + ".";
}

function brTiltGrader(prep, test, label, work, two = false) {
  return c => {
    const mine = c.s.records.filter(r => r.prep === prep);
    const hits = mine.filter(r => test(r.p));
    if (!mine.length) return brSetup("Choose " + BR_TILT_PREPS[prep].text + ", then record at least one θ.");
    if (!two && hits.length) return brGrade(true, "", work);
    if (two && hits.some(a => hits.some(b => brAngleGap(a.theta, b.theta, 180) > 2))) return brGrade(true, "", work);
    if (two && hits.length) return brGrade(false, "You have one setting, θ = " + brFmt(hits[0].theta) + "°. There is a second one in the same half-turn.");
    return brGrade(false, "None of your recorded settings for this state gives " + label + " within 0.005. Watch the bars, then record.");
  };
}

// 2 · Completeness Check. Each candidate is a pair of kets that may or may not be an orthonormal basis.
const BR_CANDIDATES = {
  z: { kets: [BR_KETS.zero, BR_KETS.one], names: ["|0⟩", "|1⟩"], text: "Z: |0⟩ and |1⟩", ok: true },
  x: { kets: [BR_KETS.plus, BR_KETS.minus], names: ["|+⟩", "|−⟩"], text: "X: |+⟩ and |−⟩", ok: true },
  y: { kets: [BR_KETS.plusi, BR_KETS.minusi], names: ["|+i⟩", "|−i⟩"], text: "Y: |+i⟩ and |−i⟩", ok: true },
  t30: { kets: [brTilt(30), brTiltPerp(30)], names: ["|30°⟩", "|30°⊥⟩"], text: "Tilted: |30°⟩ and |30°⊥⟩", ok: true },
  zi: { kets: [BR_KETS.zero, [[0, 0], [0, 1]]], names: ["|0⟩", "i|1⟩"], text: "|0⟩ and i|1⟩", ok: true },
  mixed: { kets: [BR_KETS.zero, BR_KETS.plus], names: ["|0⟩", "|+⟩"], text: "|0⟩ and |+⟩", ok: false },
  long: { kets: [[[1, 0], [1, 0]], [[1, 0], [-1, 0]]], names: ["|0⟩ + |1⟩", "|0⟩ − |1⟩"], text: "|0⟩ + |1⟩ and |0⟩ − |1⟩, no √2", ok: false }
};
const brCompleteState = c => {
  const t = c.num("t"), phase = Number(c.val("phase"));
  return [[Math.cos(brRad(t)), 0], brPolar(Math.sin(brRad(t)), phase)];
};
const BR_FINISH_A = [[1 / Math.sqrt(3), 0], [0, Math.sqrt(2 / 3)]];

// 3 · Single Shot Limits. One observed outcome rules out exactly the candidates with zero amplitude for it.
const BR_SHOTS = {
  z1: { ket: BR_KETS.one, said: "Z gave 1",
    candidates: [["|0⟩", BR_KETS.zero], ["|1⟩", BR_KETS.one], ["|+⟩", BR_KETS.plus], ["|−⟩", BR_KETS.minus], ["(√3|0⟩ + |1⟩)/2", brTilt(30)], ["i|0⟩", [[0, 1], [0, 0]]]],
    work: "c₁ = ⟨1|ψ⟩ is the |1⟩ coefficient. It is 0 only for |0⟩ and i|0⟩, so only those two are ruled out. The others all have c₁ ≠ 0: |1⟩ gives 1 with certainty, |+⟩ and |−⟩ with probability 1/2, and (√3|0⟩ + |1⟩)/2 with probability 1/4. One click can’t tell those apart." },
  xm: { ket: BR_KETS.minus, said: "X gave −",
    candidates: [["|0⟩", BR_KETS.zero], ["|+⟩", BR_KETS.plus], ["−|+⟩", [[-BR_R, 0], [-BR_R, 0]]], ["|−⟩", BR_KETS.minus], ["(|0⟩ + i|1⟩)/√2", BR_KETS.plusi], ["|1⟩", BR_KETS.one]],
    work: "c₋ = (α − β)/√2. It vanishes when α = β, which is |+⟩ and −|+⟩ (a global phase doesn’t change that). |0⟩, |1⟩ and |+i⟩ each give − with probability 1/2, and |−⟩ gives it with certainty." },
  tilt: { ket: brTilt(60), said: "the tilted detector at θ = 60° gave outcome θ",
    candidates: [["|60°⟩", brTilt(60)], ["|150°⟩", brTilt(150)], ["|148°⟩", brTilt(148)], ["|0⟩", BR_KETS.zero], ["|1⟩", BR_KETS.one], ["|+⟩", BR_KETS.plus]],
    work: "⟨60°|φ°⟩ = cos(φ − 60°). That is exactly 0 only at φ = 150°, so only |150°⟩ is ruled out. |148°⟩ gives outcome θ with probability cos²(88°) ≈ 0.0012. That is unlikely, but it can still happen, so one click doesn’t rule it out." }
};
const BR_CLICK_EXAMPLES = [["|0⟩", BR_KETS.zero], ["|+⟩", BR_KETS.plus], ["|60°⟩", brTilt(60)], ["|+i⟩", BR_KETS.plusi], ["|1⟩", BR_KETS.one]];

function brShotGrader(key) {
  const shot = BR_SHOTS[key];
  return c => {
    const truth = shot.candidates.map(([, ket]) => brProb(shot.ket, ket) < 1e-9);
    const picks = shot.candidates.map((_, k) => c.checked(key + "-c" + (k + 1)));
    const missed = shot.candidates.filter((_, k) => truth[k] && !picks[k]).map(([name]) => name);
    const extra = shot.candidates.filter((_, k) => !truth[k] && picks[k]).map(([name]) => name);
    if (!missed.length && !extra.length) return brGrade(true, "", shot.work);
    if (extra.length) return brGrade(false, "You ruled out " + extra.join(", ") + ". Compute the amplitude for the observed outcome. Is it exactly 0, or just small?");
    return brGrade(false, "Some candidate with zero amplitude for this outcome is still unticked. Find every one with c = 0.");
  };
}

// 4 · Frequency Forecaster
const BR_FORECAST = {
  q34: { p: 3 / 4, text: "|30°⟩ = (√3/2)|0⟩ + (1/2)|1⟩", exact: "3/4" },
  q20: { p: 1 / 5, text: "(|0⟩ + 2|1⟩)/√5", exact: "1/5" },
  qhalf: { p: 1 / 2, text: "|+i⟩", exact: "1/2" }
};
const brSpread = (counts, mean) => counts.reduce((sum, k) => sum + Math.abs(k - mean), 0) / counts.length;
// All 20-batch runs for one state and one N, pooled so repeat runs steady the spread estimate.
function brBatchSet(c, prep, n) {
  const sets = c.s.sets.filter(set => set.prep === prep && set.n === n);
  if (!sets.length) return null;
  const counts = sets.flatMap(set => set.counts);
  return { prep, n, counts, runs: sets.length, spread: brSpread(counts, n * BR_FORECAST[prep].p) };
}

// 5 · State Detective. α is real and ≥ 0 (the global phase is not measurable); β is complex.
const BR_CASES = {
  c1: { budget: 300, ket: [[Math.sqrt(0.8), 0], [0, Math.sqrt(0.2)]], text: "√0.8|0⟩ + i√0.2|1⟩ ≈ 0.894|0⟩ + 0.447i|1⟩" },
  c2: { budget: 300, ket: [[Math.sqrt(0.7), 0], brPolar(Math.sqrt(0.3), -60)], text: "√0.7|0⟩ + √0.3·e^(−i60°)|1⟩ ≈ 0.837|0⟩ + (0.274 − 0.474i)|1⟩" },
  c3: { budget: 60, ket: [[0.6, 0], [-0.8, 0]], text: "0.6|0⟩ − 0.8|1⟩" }
};
const BR_MIN_TRIALS = 20;
const brSlack = n => 0.1 + 1 / Math.sqrt(n);
const brOverlap = (a, b) => brAbs2(brInner(a, b));

function brCaseGrader(key) {
  const card = BR_CASES[key];
  return c => {
    const data = c.s.cases[key];
    const short = ["z", "x", "y"].filter(b => data.counts[b][0] + data.counts[b][1] < BR_MIN_TRIALS);
    if (short.length) return brSetup("Measure case " + key.slice(1) + " at least " + BR_MIN_TRIALS + " times in each basis first. Still short: " + short.map(b => BR_BASES[b].name).join(", ") + ".");
    const a = c.ans(key + "-a");
    if (a < 0) return brGrade(false, "Take α real and not negative. A global phase can always make it so.");
    const est = [[a, 0], [c.ans(key + "-bre"), c.ans(key + "-bim")]];
    const n2 = brNorm2(est);
    if (!brNear(n2, 1, 0.02)) return brGrade(false, "Your estimate has |α|² + |β|² = " + brFmt(n2) + ". Normalize it first.");
    const misses = [];
    for (const b of ["z", "x", "y"]) {
      const [k0, k1] = data.counts[b], n = k0 + k1, freq = k0 / n, predicted = brProbs(est, b)[0];
      if (Math.abs(predicted - freq) > brSlack(n)) {
        misses.push("P(" + BR_BASES[b].outcomes[0] + ") is " + brFmt(predicted) + " for your estimate, but you saw " + brFmt(freq) + " in " + n + " trials");
      }
    }
    if (misses.length) return brGrade(false, misses.join("; ") + ". Adjust the estimate to fit your own counts.");
    data.shown = true;
    const score = brOverlap(card.ket, est);
    return brGrade(true, "", "The true state was " + card.text + ". Your overlap score |⟨estimate|true⟩|² = " + brFmt(score) +
      (score >= 0.97 ? ", a very close match." : score >= 0.9 ? ", a good match." : ". Your counts were a little unlucky or the estimate is rough; more trials would pin it down.") +
      " Z fixes |α|², X fixes the cosine of the relative phase, and Y fixes its sine, so all three are needed." + (key === "c2" ? " Here P(+i) < 1/2 is what tells you the phase is −60° and not +60°." : ""),
      "Mission complete. Your estimate fits your own counts.");
  };
}

const brChain = (caption, items, extra = {}) => ({ kind: "chain", caption, items, ...extra });

// 6 · Collapse Chain. Each stage measures in its basis and leaves the system in the observed ket.
const BR_CHAIN_STARTS = {
  zero: { ket: BR_KETS.zero, text: "|0⟩" },
  root: { ket: brTilt(30), text: "|30°⟩" },
  plus: { ket: BR_KETS.plus, text: "|+⟩" }
};
const BR_KET_NAMES = { z: ["|0⟩", "|1⟩"], x: ["|+⟩", "|−⟩"], y: ["|+i⟩", "|−i⟩"] };
const brChainStages = c => ["s1", "s2", "s3"].map(name => c.val(name)).filter(b => b !== "none");

function brChainSend(c, count) {
  const stages = brChainStages(c);
  if (!stages.length) return null;
  let last = null;
  for (let k = 0; k < count; k++) {
    let ket = BR_CHAIN_STARTS[c.val("start")].ket;
    const path = stages.map(b => {
      const pick = brPick(c.s.rng, brProbs(ket, b));
      ket = BR_BASES[b].kets[pick];
      return BR_BASES[b].outcomes[pick];
    });
    last = path;
    const key = path.join(" → ");
    c.s.tally.set(key, (c.s.tally.get(key) ?? 0) + 1);
    c.s.sent += 1;
  }
  c.s.last = last;
  return last;
}

// 7 · Repeat or Refresh. Each story: a preparation, a first readout, and a next readout.
const BR_STORIES = {
  echo: { ket: BR_KETS.plus, prep: "|+⟩", first: ["z", 1], next: "z", who: "same", ask: 1, p: 1,
    work: "Same system. The Z outcome 1 left it in |1⟩, and an immediate repeat of Z on |1⟩ gives 1 with certainty. The |+⟩ it started in no longer matters." },
  next: { ket: brTilt(30), prep: "|30°⟩ = (√3/2)|0⟩ + (1/2)|1⟩", first: ["z", 1], next: "z", who: "fresh", ask: 1, p: 1 / 4,
    work: "Fresh copy. The next system from the source is a new |30°⟩, untouched by the first system’s result, so P(1) = (1/2)² = 1/4." },
  switch: { ket: brTilt(30), prep: "|30°⟩", first: ["z", 0], next: "x", who: "same", ask: 0, p: 1 / 2,
    work: "Same system, new basis. After outcome 0 the system is in |0⟩, and ⟨+|0⟩ = 1/√2, so P(+) = 1/2. For the original |30°⟩ it would have been (√3/2 + 1/2)²/2 ≈ 0.933." },
  lab: { ket: [[0.6, 0], [0.8, 0]], prep: "the Measurement Lab’s opening state (3/5)|0⟩ + (4/5)|1⟩", first: ["z", 1], next: "z", who: "fresh", ask: 1, p: 16 / 25,
    work: "Fresh copy. Every lab trial starts from a new copy of the selected preparation, so the next Measure one gives 1 with probability (4/5)² = 16/25, whatever the last trial showed." },
  wait: { ket: brTilt(60), prep: "(1/2)|0⟩ + (√3/2)|1⟩", first: ["z", 0], next: "z", who: "same", ask: 0, p: 1,
    work: "Same system. This 0 was the less likely outcome (1/4), but once it happened the system is in |0⟩. With nothing acting on it, the repeat gives 0 with certainty." }
};

// 8 · Polarizer Stack. |H⟩ light meets polarizers at the listed angles; each passes cos² of the step.
function brStackModel(c) {
  const mode = c.val("mode"), n = c.num("n");
  const middle = mode === "one" ? [c.num("custom")] : Array.from({ length: n }, (_, k) => 90 * (k + 1) / (n + 1));
  const angles = [0, ...middle, 90], levels = [];
  let level = 1, previous = 0;
  for (const angle of angles) {
    level *= Math.cos(brRad(angle - previous)) ** 2;
    levels.push(level);
    previous = angle;
  }
  return { mode, n: middle.length, angles, levels, pass: level };
}

// 9 · Best Guess. One copy of A or B, equally likely; measure in {|θ⟩, |θ⊥⟩} and guess by a rule.
const BR_GUESS = {
  zp: { a: 0, b: 45, an: "|0⟩", bn: "|+⟩", text: "|0⟩ or |+⟩" },
  z30: { a: 0, b: 30, an: "|0⟩", bn: "|30°⟩", text: "|0⟩ or |30°⟩" },
  pm: { a: 45, b: -45, an: "|+⟩", bn: "|−⟩", text: "|+⟩ or |−⟩" }
};
function brGuessModel(c) {
  const pair = BR_GUESS[c.val("pair")], theta = c.num("theta"), r0 = c.val("rule0"), r1 = c.val("rule1");
  const A = brTilt(pair.a), B = brTilt(pair.b), up = brTilt(theta);
  const pa = brProb(up, A), pb = brProb(up, B);
  const rightA = (r0 === "a" ? pa : 0) + (r1 === "a" ? 1 - pa : 0);
  const rightB = (r0 === "b" ? pb : 0) + (r1 === "b" ? 1 - pb : 0);
  return { pair, theta, r0, r1, A, B, rightA, rightB, success: (rightA + rightB) / 2 };
}

// 10 · Measurement Designer. The state is fixed; the learner builds {|a⟩, |b⟩}.
const BR_DESIGN = {
  certain: { ket: brTilt(60), text: "(1/2)|0⟩ + (√3/2)|1⟩", target: 1,
    hint: ["P(a) = 1 means |a⟩ is the state itself, up to a phase.", "Then |b⟩ must be perpendicular: try (−√3/2, 1/2)."],
    work: "|a⟩ = (1/2)|0⟩ + (√3/2)|1⟩ and |b⟩ = −(√3/2)|0⟩ + (1/2)|1⟩. Then ⟨a|b⟩ = −√3/4 + √3/4 = 0 and P(a) = 1. Any phase on either ket also passes." },
  half: { ket: BR_KETS.zero, text: "|0⟩", target: 1 / 2,
    hint: ["P(a) = |a₀|² for the state |0⟩.", "Any ket with |a₀|² = 1/2 works: |+⟩, |+i⟩ or (|0⟩ + e^(iφ)|1⟩)/√2. Then find its partner."],
    work: "One answer is X: |a⟩ = |+⟩, |b⟩ = |−⟩. Y works too, or any |a⟩ = (|0⟩ + e^(iφ)|1⟩)/√2 with |b⟩ = (|0⟩ − e^(iφ)|1⟩)/√2. A whole circle of bases gives 50/50 for |0⟩." },
  quarter: { ket: BR_KETS.plus, text: "|+⟩", target: 1 / 4,
    hint: ["For a real |a⟩ = |θ⟩, P(a) = cos²(θ − 45°).", "cos²(60°) = 1/4, so try θ = 105° or θ = −15°."],
    work: "With |a⟩ = |105°⟩ ≈ −0.2588|0⟩ + 0.9659|1⟩ and |b⟩ = |105°⊥⟩ ≈ −0.9659|0⟩ − 0.2588|1⟩, ⟨a|+⟩ = (−0.2588 + 0.9659)/√2 = 1/2, so P(a) = 1/4. Exact entries: cos 105° = −(√6 − √2)/4 and sin 105° = (√6 + √2)/4." },
  complex: { ket: BR_KETS.plusi, text: "|+i⟩", target: 0.9,
    hint: ["Every real basis gives 1/2 for |+i⟩ (station 1), so |a⟩ needs an imaginary entry.", "Try |a⟩ = (2/√5)|0⟩ + (i/√5)|1⟩ and compute ⟨a|+i⟩, remembering the conjugate."],
    work: "|a⟩ = (2/√5)|0⟩ + (i/√5)|1⟩ gives ⟨a|+i⟩ = (2/√5)(1/√2) + (−i/√5)(i/√2) = 3/√10, so P(a) = 9/10. Its partner |b⟩ = (1/√5)|0⟩ − (2i/√5)|1⟩ has ⟨a|b⟩ = 2/5 − 2/5 = 0." }
};
function brDesignGrader(key) {
  const card = BR_DESIGN[key];
  return c => {
    const a = [c.cx("a0"), c.cx("a1")], b = [c.cx("b0"), c.cx("b1")];
    const na = brNorm2(a), nb = brNorm2(b), overlap = brInner(a, b), pa = brProb(a, card.ket);
    if (!brNear(na, 1)) return brGrade(false, "Your |a⟩ has ⟨a|a⟩ = " + brFmt(na) + ". Normalize it.");
    if (!brNear(nb, 1)) return brGrade(false, "Your |b⟩ has ⟨b|b⟩ = " + brFmt(nb) + ". Normalize it.");
    if (brAbs(overlap) > BR_DERIVED) return brGrade(false, "⟨a|b⟩ = " + brCx(overlap) + ", so your kets aren’t orthogonal. Remember the conjugate on the bra.");
    if (!brNear(pa, card.target)) return brGrade(false, "Your basis is orthonormal, but P(a) = " + brFmt(pa) + ", not " + brFmt(card.target) + ".");
    return brGrade(true, "", card.work, "Mission complete. Your own basis passes, and other designs can pass too.");
  };
}

// 11 · Error Detective. Each case: the first wrong line and the mistake planted there.
const BR_ERRORS = {
  square: { line: "3", text: "P(+) for (1/2)|0⟩ − (√3/2)|1⟩",
    work: "Line 3 squares the amplitudes before combining them. Combine first: c₊ = (1/2 − √3/2)/√2, so P(+) = (1 − √3)²/8 = (2 − √3)/4 ≈ 0.067. The two contributions nearly cancel, which squaring first can never show." },
  over: { line: "2", text: "P(+) for (√3/2)|0⟩ + (1/2)|1⟩",
    work: "Line 2 squares the numerator but not the whole √2 in the denominator: |c₊|² = (√3 + 1)²/(2√2)² = (4 + 2√3)/8 ≈ 0.933. A probability above 1 always signals an error, and line 3’s negative P(−) is the knock-on effect." },
  conj: { line: "2", text: "P(+i) for |+i⟩",
    work: "Line 2 forgets the conjugate. The bra is ⟨+i| = (⟨0| − i⟨1|)/√2, so c₊ᵢ = (1 − i·i)/2 = (1 + 1)/2 = 1 and P(+i) = 1, as it must be for a state measured in its own basis." },
  freq: { line: "2", text: "7 zeros in 10 trials",
    work: "Line 2 treats an observed frequency as the exact probability. 7 out of 10 is quite likely when P(0) is 0.5, 0.6, 0.7 or 0.8. A frequency only estimates P(0), and the estimate tightens as N grows (station 4). Line 3 then inherits the error: even if P(0) were 0.7, 100 trials would rarely give exactly 70." },
  click: { line: "2", text: "one + in X",
    work: "Line 2 believes one click reveals the state. One + shows only that c₊ ≠ 0. |0⟩, |30°⟩, |+i⟩ and countless other states can all give +, so nothing about the state follows from a single outcome except that |−⟩ is ruled out (station 3)." },
  fresh: { line: "3", text: "a next system from the source",
    work: "Line 3 confuses remeasuring the same system with measuring a fresh copy. The measured system is in |1⟩, but the next system from the source is a new |30°⟩, so P(1) = 1/4 for it (station 7)." }
};
const brBinomial = (n, k, p) => { let c = 1; for (let j = 1; j <= k; j++) c = c * (n - k + j) / j; return c * p ** k * (1 - p) ** (n - k); };

function brErrorGrader(key) {
  const card = BR_ERRORS[key];
  return c => {
    const line = c.choice(key + "-line"), kind = c.choice(key + "-kind");
    if (line === card.line && kind === key) return brGrade(true, "", card.work);
    if (line === card.line) return brGrade(false, "Right line. Now name what goes wrong there.");
    if (kind === key) return brGrade(false, "Right mistake, wrong line. Find the first line where it happens.");
    return brGrade(false, Number(line) < Number(card.line) ? "That line is correct. Read on." : "Something goes wrong before that line.");
  };
}

function brErrorPlan(key) {
  const vs = (claimed, correct, extra = {}) => ({ panels: [brBars("claimed versus correct", [
    { label: "claimed", value: claimed, tone: "warn", text: brFmt(claimed) }, { label: "correct", value: correct, tone: "plus", text: brFmt(correct) }], extra)] });
  if (key === "square") return { ...vs(0.5, (2 - Math.sqrt(3)) / 4), desc: "Claimed P(+) = 0.5 against the correct (2 − √3)/4 ≈ 0.067." };
  if (key === "over") return { ...vs((4 + 2 * Math.sqrt(3)) / 4, (4 + 2 * Math.sqrt(3)) / 8, { max: 2 }), desc: "Claimed P(+) ≈ 1.866, above the line at 1, against the correct 0.933." };
  if (key === "conj") return { ...vs(0, 1), desc: "Claimed P(+i) = 0 against the correct 1." };
  if (key === "freq") {
    return { panels: [brBars("chance of exactly 7 zeros in 10", [0.5, 0.6, 0.7, 0.8, 0.9].map(p => ({ label: "P(0)=" + p, value: brBinomial(10, 7, p), tone: p === 0.7 ? "angle" : "plus", text: brFmt(Math.round(brBinomial(10, 7, p) * 1000) / 1000) })), { max: 0.5 })],
      desc: "The chance of exactly 7 zeros in 10 trials is 0.117 for P(0) = 0.5, 0.215 for 0.6, 0.267 for 0.7, 0.201 for 0.8 and 0.057 for 0.9. Many probabilities fit one run." };
  }
  if (key === "click") {
    const states = [["|+⟩", BR_KETS.plus], ["|0⟩", BR_KETS.zero], ["|30°⟩", brTilt(30)], ["|+i⟩", BR_KETS.plusi], ["|−⟩", BR_KETS.minus]];
    return { panels: [brBars("P(+) for some states", states.map(([name, ket]) => ({ label: name, value: brProb(BR_KETS.plus, ket), tone: brProb(BR_KETS.plus, ket) < 1e-9 ? "warn" : "plus" })))],
      desc: "P(+) is 1 for |+⟩, 0.5 for |0⟩, about 0.933 for |30°⟩, 0.5 for |+i⟩ and 0 for |−⟩. Every state except |−⟩ can give a single +." };
  }
  return { panels: [brChain("two systems from one source", [
    { title: "source", sub: "|30°⟩", tone: "alpha" }, { title: "1st: Z", sub: "gave 1", tone: "angle", below: "now |1⟩" },
    { title: "2nd: Z", sub: "fresh |30°⟩", tone: "minus", below: "P(1) = 1/4" }])],
    desc: "A source prepares |30°⟩. System 1 gives 1 and is left in |1⟩. System 2 is a fresh |30°⟩, with P(1) = 1/4." };
}

// 12 · Quantum Preview: Outcomes With Values. Outcome 0 carries the value +1, outcome 1 the value −1.
const brValuesP0 = c => Math.cos(brRad(c.num("t"))) ** 2;
function brValuesRun(c, n) {
  const p0 = brValuesP0(c);
  let plus = 0;
  for (let k = 0; k < n; k++) {
    const value = c.s.rng() < p0 ? 1 : -1;
    if (value === 1) plus++;
    c.s.sum += value;
    c.s.n += 1;
    if (c.s.trail.length < 4000) c.s.trail.push([c.s.n, c.s.sum / c.s.n]);
  }
  c.s.plus += plus;
  return "Ran " + n + " trials: " + plus + " × (+1) and " + (n - plus) + " × (−1). Average of all " + c.s.n + " values so far: " + brFmt(c.s.sum / c.s.n) + ".";
}

// 13 · Measurement Axis on the Bloch Sphere. P(a) = cos²(γ/2), where γ is the angle from the state to the axis.
function brAxisModel(c) {
  const state = brBlochPoint({ polar: c.num("sp"), azimuth: c.num("sa") });
  const axis = brBlochPoint({ polar: c.num("ap"), azimuth: c.num("aa") });
  const dot = Math.max(-1, Math.min(1, state[0] * axis[0] + state[1] * axis[1] + state[2] * axis[2]));
  const gamma = Math.acos(dot) * 180 / Math.PI;
  return { state, axis, dot, gamma, p: (1 + dot) / 2 };
}

// 14 · Quantum Random Number Generator. P(1) = sin²t for cos t|0⟩ + sin t|1⟩ measured in Z.
const brQrngP1 = c => Math.sin(brRad(c.num("t"))) ** 2;
function brPairs(bits) {
  const out = [];
  for (let k = 0; k + 1 < bits.length; k += 2) {
    if (bits[k] === 0 && bits[k + 1] === 1) out.push(0);
    else if (bits[k] === 1 && bits[k + 1] === 0) out.push(1);
  }
  return out;
}

// 15 · Bomb Tester. The Lesson 12 bench with a bomb that may sit in the lower arm. A live bomb
// absorbs (explodes on) any photon in that arm, which is a which-path measurement.
const BR_BENCH = {
  src: [-2.5, -1.45], bs1: [-1.3, -1.45], mu: [-1.3, 0.45], ps: [0, 0.45],
  bs2: [1.3, 0.45], bomb: [0, -1.45], ml: [1.3, -1.45], d0: [2.5, 0.45], d1: [1.3, 1.35]
};
function brBombModel(c) {
  const theta = c.num("theta"), arm = c.val("arm");
  const u = brPolar(BR_R, theta), l = [BR_R, 0];
  if (arm === "live") return { theta, arm, pe: 1 / 2, p0: 1 / 4, p1: 1 / 4 };
  return { theta, arm, pe: 0, p0: brAbs2(brScale(brAdd(u, l), BR_R)), p1: brAbs2(brScale(brSub(u, l), BR_R)) };
}
function brBenchBeams(m) {
  const B = BR_BENCH, h = 0.5, low = m.arm === "live" ? 0 : h;
  return [
    { a: B.src, b: B.bs1, s: 1 },
    { a: B.bs1, b: B.mu, s: h }, { a: B.mu, b: B.ps, s: h }, { a: B.ps, b: B.bs2, s: h },
    { a: B.bs1, b: B.bomb, s: h }, { a: B.bomb, b: B.ml, s: low }, { a: B.ml, b: B.bs2, s: low },
    { a: B.bs2, b: B.d0, s: m.p0, out: true }, { a: B.bs2, b: B.d1, s: m.p1, out: true }
  ];
}
function brQrngGenerate(c, n) {
  const p1 = brQrngP1(c);
  if (c.s.bias !== null && !brNear(c.s.bias, p1, 1e-12)) c.s.bits = [];
  c.s.bias = p1;
  let ones = 0;
  for (let k = 0; k < n; k++) {
    const bit = c.s.rng() < p1 ? 1 : 0;
    ones += bit;
    if (c.s.bits.length < 20000) c.s.bits.push(bit);
  }
  const out = brPairs(c.s.bits);
  return "Measured " + n + " fresh copies in Z: " + ones + " ones and " + (n - ones) + " zeros. " + c.s.bits.length + " raw bits stored" +
    (c.checked("pair") ? "; pairing keeps " + out.length + " output bits, " + out.reduce((s, b) => s + b, 0) + " of them 1." : ".");
}

const brStations = {
  // 1 · Tilted Detector ------------------------------------------------------------------------
  tilt: {
    start(c) { c.s.records = []; },
    actions: {
      record(c) { return brTiltRecord(c, c.num("theta")); },
      typed(c) { return brTiltRecord(c, brWrap(c.ans("typed"), 180)); },
      clear(c) { c.s.records = []; return "Recorded settings cleared."; }
    },
    show(c) {
      const prep = BR_TILT_PREPS[c.val("prep")], theta = c.num("theta");
      const p = brProb(brTilt(theta), prep.ket), q = brProb(brTiltPerp(theta), prep.ket);
      c.put("state", prep.text + " · detector at θ = " + brAngleText(theta) + " · |θ⟩ = (" + brFmt(Math.cos(brRad(theta))) + ")|0⟩ + (" +
        brFmt(Math.sin(brRad(theta))) + ")|1⟩ · P(θ) = " + brFmt(p) + " · P(θ⊥) = " + brFmt(q) + " · sum " + brFmt(p + q) + ".");
      c.list("log", c.s.records.map(r => BR_TILT_PREPS[r.prep].text + " · θ = " + brAngleText(r.theta) + " → P(θ) = " + brFmt(r.p) + ", P(θ⊥) = " + brFmt(1 - r.p)));
      const real = brReal(prep.ket);
      return {
        panels: [
          brPlane(real ? "state and detector axes" : "detector axes only", real ? [brKetArrow(prep.ket, "alpha", "|ψ⟩", { wide: true })] : [],
            { rays: brAxisRays(theta), marks: [{ angle: theta, tone: "angle", label: "θ" }, { angle: theta + 90, tone: "minus", label: "θ⊥" }] }),
          brBars("this detector", [{ label: "P(θ)", value: p, tone: "angle" }, { label: "P(θ⊥)", value: q, tone: "minus" }])
        ],
        caption: "θ = " + brFmt(theta) + "°",
        desc: "Left: the |0⟩/|1⟩ plane with the detector axes |θ⟩ (solid) and |θ⊥⟩ (dashed) at " + brFmt(theta) + "° and " + brFmt(theta + 90) + "°" +
          (real ? ", and the state as a blue arrow." : ". |+i⟩ has a complex amplitude, so it has no arrow in this real plane.") +
          " Right: P(θ) = " + brFmt(p) + " and P(θ⊥) = " + brFmt(q) + "."
      };
    },
    checks: {
      certain: ["The outcome θ is certain when |θ⟩ points along the state.", "(1/2, √3/2) = (cos 60°, sin 60°).",
        brTiltGrader("sixty", p => p >= 1 - BR_DERIVED, "P(θ) = 1",
          "|ψ⟩ = cos 60°|0⟩ + sin 60°|1⟩ = |60°⟩, so at θ = 60° (π/3 rad) c_θ = ⟨60°|ψ⟩ = 1 and P(θ) = 1. In general ⟨θ|ψ⟩ = cos(θ − 60°) for this state.")],
      blind: ["P(θ) = 0 when |θ⟩ is perpendicular to the state.", "Turn a quarter-turn past the certain setting.",
        brTiltGrader("sixty", p => p <= BR_DERIVED, "P(θ) = 0",
          "At θ = 150° (5π/6 rad), cos(150° − 60°) = cos 90° = 0. The outcome θ never happens, and θ⊥ = |240°⟩ = −|60°⟩ is certain: a global phase −1 changes nothing.")],
      halves: ["This state is |−30°⟩, so P(θ) = cos²(θ + 30°).", "cos² is 1/2 when its angle is 45° or 135°.",
        brTiltGrader("minus30", p => brNear(p, 0.5), "P(θ) = 1/2",
          "cos²(θ + 30°) = 1/2 needs θ + 30° = 45° or 135°, so θ = 15° (π/12 rad) or θ = 105° (7π/12 rad). These are the two settings whose axes sit exactly halfway between the state and its perpendicular.", true)],
      target: ["For |0⟩, ⟨θ|0⟩ = cos θ, so P(θ) = cos²θ.", "cos θ = ±√3/2.", c => {
        const v = c.ans("target-theta");
        if (brAngleFits(v, 60, 180) || brAngleFits(v, 120, 180)) return brGrade(false, "At that θ, P(θ) = cos²θ = 1/4. You found the setting for P(θ⊥) = 3/4.");
        return brGrade(brAngleFits(v, 30, 180) || brAngleFits(v, 150, 180), "Solve cos²θ = 3/4 for θ between 0° and 180°.",
          "cos²θ = 3/4 gives cos θ = ±√3/2, so θ = 30° (π/6 rad) or θ = 150° (5π/6 rad). Both settings are correct.");
      }],
      never: ["Choose |+i⟩ and sweep θ.", "|cos θ + i sin θ|²/2 for every θ.", c => {
        const pick = c.choice("never-pick");
        return brGrade(pick === "half", "Choose |+i⟩ and watch the bars as you turn θ.",
          "⟨θ|+i⟩ = (cos θ + i sin θ)/√2 = e^(iθ)/√2, whose squared magnitude is 1/2 at every θ. No real tilted detector separates |+i⟩ from |−i⟩. The Y basis from Lesson 12 makes the outcome certain.");
      }]
    }
  },

  // 2 · Completeness Check ---------------------------------------------------------------------
  complete: {
    show(c) {
      const cand = BR_CANDIDATES[c.val("cand")], state = brCompleteState(c);
      const [a, b] = cand.kets, pa = brProb(a, state), pb = brProb(b, state), overlap = brInner(a, b);
      const orthonormal = brNear(brNorm2(a), 1, 1e-9) && brNear(brNorm2(b), 1, 1e-9) && brAbs(overlap) < 1e-9;
      c.put("state", cand.text + " · ⟨a|a⟩ = " + brFmt(brNorm2(a)) + ", ⟨b|b⟩ = " + brFmt(brNorm2(b)) + ", ⟨a|b⟩ = " + brCx(overlap) +
        " · state (" + brCx(state[0]) + ", " + brCx(state[1]) + ")ᵀ · |⟨a|ψ⟩|² + |⟨b|ψ⟩|² = " + brFmt(pa) + " + " + brFmt(pb) + " = " + brFmt(pa + pb) +
        (orthonormal ? " · orthonormal, so the sum is 1 for every state." : " · not orthonormal, so these are not outcome probabilities."));
      const items = cand.kets.map((ket, k) => brReal(ket) ? brKetArrow(ket, k ? "minus" : "angle", cand.names[k], { dashed: k === 1 }) : null).filter(Boolean);
      if (brReal(state)) items.unshift(brKetArrow(state, "alpha", "|ψ⟩", { wide: true }));
      return {
        panels: [
          brPlane("candidate kets", items, { limit: 1.5 }),
          brBars("|⟨a|ψ⟩|², |⟨b|ψ⟩|² and their sum", [
            { label: cand.names[0], value: pa, tone: "angle" }, { label: cand.names[1], value: pb, tone: "minus" },
            { label: "sum", value: pa + pb, tone: orthonormal ? "plus" : "warn", target: 1 }], { max: 2 })
        ],
        caption: cand.text,
        desc: "Left: the real kets of the candidate pair" + (brReal(state) ? " and the state" : "") + " in the |0⟩/|1⟩ plane. Right: the two squared overlaps and their sum, " + brFmt(pa + pb) + ", against a yellow line at 1."
      };
    },
    checks: {
      sort: ["A basis is orthonormal when each ket has length 1 and ⟨a|b⟩ = 0.", "Watch the readout’s ⟨a|a⟩, ⟨b|b⟩ and ⟨a|b⟩ for each candidate.", c => {
        const wrong = Object.entries(BR_CANDIDATES).filter(([key, cand]) => c.checked("s-" + key) !== cand.ok).map(([, cand]) => cand.text);
        return brGrade(!wrong.length, "Recheck: " + wrong.join("; ") + ".",
          "Z, X, Y, the tilted pair and {|0⟩, i|1⟩} are orthonormal (i|1⟩ has |i|² = 1). {|0⟩, |+⟩} has ⟨0|+⟩ = 1/√2 ≠ 0, and |0⟩ ± |1⟩ without the √2 have length √2.");
      }],
      overlap: ["Set the state to |0⟩ (t = 0°) and the candidate to |0⟩ and |+⟩.", "|⟨0|0⟩|² = 1 and |⟨+|0⟩|² = 1/2.", c => {
        const v = c.ans("overlap-sum");
        return brGrade(brFits(v, 1.5), "Add |⟨0|0⟩|² and |⟨+|0⟩|².",
          "1 + 1/2 = 3/2 > 1. |0⟩ and |+⟩ overlap, so the same part of the state is counted twice. They can’t be the two outcomes of one measurement.");
      }],
      long: ["Each unnormalized ket has length √2.", "|⟨0|0⟩ + ⟨1|0⟩|² = 1, twice.", c => {
        const v = c.ans("long-sum");
        return brGrade(brFits(v, 2), "Compute |(1)(1) + (1)(0)|² and |(1)(1) + (−1)(0)|² for the state |0⟩.",
          "Both squared overlaps are 1, so the sum is 2. Dividing each ket by √2 gives |+⟩ and |−⟩, and the sum drops to 1.");
      }],
      finish: ["Write |b⟩ = (b₀, b₁) and require ⟨a|b⟩ = a₀*b₀ + a₁*b₁ = 0.", "Swap the sizes: try b₀ = √(2/3) and choose b₁ = ±i/√3 so the terms cancel.", c => {
        const b = [c.cx("b0"), c.cx("b1")], n2 = brNorm2(b), overlap = brInner(BR_FINISH_A, b);
        if (!brNear(n2, 1)) return brGrade(false, "Your |b⟩ has ⟨b|b⟩ = " + brFmt(n2) + ". Normalize it.");
        return brGrade(brAbs(overlap) <= BR_DERIVED, "⟨a|b⟩ = " + brCx(overlap) + ". Remember the bra ⟨a| carries the conjugate of the i.",
          "One answer is |b⟩ = √(2/3)|0⟩ − (i/√3)|1⟩: ⟨a|b⟩ = (1/√3)(√(2/3)) + (−i√(2/3))(−i/√3) = √2/3 − √2/3 = 0. Any phase times this |b⟩ also works.",
          "Mission complete. The checker tested your own |b⟩, and other phases pass too.");
      }],
      lucky: ["Choose the pair |0⟩ and |+⟩ and move t.", "With phase 0 the sum is cos²t + (1 + sin 2t)/2.", c => {
        if (c.val("cand") !== "mixed") return brSetup("Choose the candidate |0⟩ and |+⟩ first.");
        const state = brCompleteState(c), sum = BR_CANDIDATES.mixed.kets.reduce((s, ket) => s + brProb(ket, state), 0);
        return brGrade(brNear(sum, 1), "The sum is " + brFmt(sum) + " here. Keep moving t.",
          "With phase 0, cos²t + (1 + sin 2t)/2 = 1 needs cos 2t + sin 2t = 0, so t = 67.5° or 157.5°. A sum of 1 for one state proves nothing. An orthonormal basis gives 1 for every state, and this pair gives 3/2 for |0⟩.");
      }]
    }
  },

  // 3 · Single Shot Limits ---------------------------------------------------------------------
  single: {
    show(c) {
      const key = c.open() ?? "z1";
      if (key === "click") {
        const shown = c.revealed("click");
        c.put("state", "Observed: Z gave 0 once. " + (shown ? "Bars show P(0) for some states that could have done it." : "Check the mission to see P(0) for some candidate states."));
        return {
          panels: [brBars("P(0) for candidate states", BR_CLICK_EXAMPLES.map(([name, ket]) => ({ label: name, value: shown ? brProb(BR_KETS.zero, ket) : 0, text: shown ? undefined : "?", tone: "plus" })))],
          caption: "Z gave 0",
          desc: shown ? "P(0) for " + BR_CLICK_EXAMPLES.map(([name, ket]) => name + " " + brFmt(brProb(BR_KETS.zero, ket))).join(", ") + "." : "Bars hidden until the mission is checked."
        };
      }
      const shot = BR_SHOTS[key], shown = c.revealed(key);
      c.put("state", "Observed: " + shot.said + ". Tick each candidate this one outcome rules out." + (shown ? " Bars show each candidate’s probability for the observed outcome." : ""));
      return {
        panels: [brBars("P(observed outcome) for each candidate", shot.candidates.map(([name, ket]) => {
          const p = brProb(shot.ket, ket);
          return { label: name.length > 7 ? name.slice(0, 6) + "…" : name, value: shown ? p : 0, text: shown ? (p > 0 && p < 0.01 ? "≈" + brFmt(p) : undefined) : "?", tone: shown && p < 1e-9 ? "warn" : "plus" };
        }))],
        caption: shot.said,
        desc: shown ? shot.candidates.map(([name, ket]) => name + ": " + brFmt(brProb(shot.ket, ket))).join("; ") + "." : "Bars hidden until the mission is checked. Observed: " + shot.said + "."
      };
    },
    checks: {
      z1: ["A candidate is ruled out only if its amplitude for the outcome is exactly 0.", "c₁ = ⟨1|ψ⟩ is the |1⟩ coefficient. A phase such as i doesn’t make a coefficient nonzero.", brShotGrader("z1")],
      xm: ["c₋ = (α − β)/√2.", "Which candidates have α = β exactly, including a global phase on both?", brShotGrader("xm")],
      tilt: ["⟨60°|φ°⟩ = cos(φ − 60°) for a real tilted ket |φ°⟩.", "Small is not zero.", brShotGrader("tilt")],
      click: ["Many different states have c₀ ≠ 0.", "Does a probability above 1/2 have to be involved?", c => {
        const pick = c.choice("click-pick");
        if (pick === "majority") return brGrade(false, "|+i⟩ has P(0) = 1/2 and |60°⟩ has P(0) = 1/4, and both can still give 0.");
        return brGrade(pick === "nonzero", "Would |+⟩ ever give 0 in Z?",
          "One click of 0 says only that c₀ = ⟨0|ψ⟩ was not zero. |0⟩, |+⟩, |60°⟩ and |+i⟩ can all produce it. Only |1⟩ (and its phase multiples) is ruled out. Learning the state takes many fresh copies and more than one basis, as in station 5.");
      }]
    }
  },

  // 4 · Frequency Forecaster -------------------------------------------------------------------
  forecast: {
    start(c) { brSeed(c); c.s.runs = []; c.s.sets = []; },
    actions: {
      run(c) {
        const key = c.val("prep"), prep = BR_FORECAST[key], n = c.num("n");
        const count = brCount(c.s.rng, prep.p, n);
        const low = c.quiet("low"), high = c.quiet("high");
        c.s.runs.push({ prep: key, n, count, low, high });
        const inside = low !== null && high !== null ? (count >= low && count <= high ? " It landed inside your forecast of " + brFmt(low) + " to " + brFmt(high) + "." : " It landed outside your forecast of " + brFmt(low) + " to " + brFmt(high) + ".") : "";
        return "Run " + c.s.runs.length + ": " + n + " trials of " + prep.text + " gave " + count + " × 0 and " + (n - count) + " × 1. Frequency of 0 = " + brFmt(count / n) + ". Expected count " + brFmt(n * prep.p) + "." + inside;
      },
      batches(c) {
        const key = c.val("prep"), prep = BR_FORECAST[key], n = c.num("n"), mean = n * prep.p;
        const counts = Array.from({ length: 20 }, () => brCount(c.s.rng, prep.p, n));
        const spread = brSpread(counts, mean);
        c.s.sets.push({ prep: key, n, counts });
        return "20 batches of " + n + ": counts of 0 from " + Math.min(...counts) + " to " + Math.max(...counts) + ". Typical distance from " + brFmt(mean) + ": " + brFmt(spread) +
          " counts, or " + brFmt(spread / n) + " in frequency.";
      },
      reseed(c) { return brReseed(c); }
    },
    show(c) {
      const key = c.val("prep"), prep = BR_FORECAST[key], n = c.num("n"), last = c.s.runs.at(-1);
      c.put("state", "Seed " + c.s.seed + " · " + prep.text + " · P(0) = " + prep.exact + " · N = " + n + " · expected count of 0 = N × P(0) = " + brFmt(n * prep.p) +
        (last ? " · latest run: " + last.count + " of " + last.n + " (" + BR_FORECAST[last.prep].text + ")" : " · no runs yet") + ".");
      c.list("log", [
        ...c.s.runs.slice(-6).map((r, k, all) => "Run " + (c.s.runs.length - all.length + k + 1) + " · " + BR_FORECAST[r.prep].text + " · N = " + r.n + " · " + r.count + " × 0 · frequency " + brFmt(r.count / r.n) + " · off by " + brFmt(Math.abs(r.count - r.n * BR_FORECAST[r.prep].p))),
        ...[10, 100, 1000, 10000].map(size => brBatchSet(c, key, size)).filter(Boolean).map(s => s.runs * 20 + " batches pooled · " + BR_FORECAST[s.prep].text + " · N = " + s.n +
          " · typical count spread " + brFmt(s.spread) + " · frequency spread " + brFmt(s.spread / s.n))
      ]);
      const sizes = [10, 100, 1000, 10000], dots = [];
      for (const size of sizes) {
        const set = brBatchSet(c, key, size);
        if (set) for (const k of set.counts) dots.push({ x: Math.log10(size), y: k / size, tone: "plus", r: 3.5, hollow: true });
      }
      const mine = c.s.runs.filter(r => r.prep === key).slice(-12);
      for (const r of mine) dots.push({ x: Math.log10(r.n), y: r.count / r.n, tone: "alpha", r: 4 });
      return {
        panels: [
          brChart("frequency of 0 by batch size", { weight: 1.5, x: [0.5, 4.5], xTicks: [1, 2, 3, 4], xTickText: ["10", "100", "1000", "10⁴"], xLabel: "N trials per batch",
            hlines: [{ y: prep.p, label: "P(0) = " + prep.exact }], dots }),
          brBars(last ? "latest run, out of " + last.n : "no run yet", [
            { label: "0", value: last ? last.count / last.n : 0, tone: "plus", text: last ? String(last.count) : "–" },
            { label: "1", value: last ? 1 - last.count / last.n : 0, tone: "minus", text: last ? String(last.n - last.count) : "–" }])
        ],
        caption: prep.text + ", N = " + n,
        desc: "Left: observed frequencies of 0 for this state, green circles for each batch in a 20-batch run and blue dots for single runs, at N = 10, 100, 1000 and 10⁴, against a yellow line at P(0) = " + prep.exact +
          ". The circles bunch closer to the line as N grows. Right: counts from the latest run."
      };
    },
    checks: {
      range: ["Expected count = N × P(0) = 100 × 3/4.", "Pick a range of at most 20 counts around 75, then press Run N trials.", c => {
        const run = c.s.runs.findLast(r => r.prep === "q34" && r.n === 100);
        if (!run) return brSetup("Choose |30°⟩ and N = 100, type your forecast, then press Run N trials.");
        if (run.low === null || run.high === null) return brSetup("Type both ends of your forecast before you press Run N trials.");
        const ok = run.low >= 0 && run.low <= 75 && run.high >= 75 && run.high - run.low <= 20;
        const where = run.count >= run.low && run.count <= run.high ? "inside" : "outside";
        return brGrade(ok, run.low > run.high ? "The low end is above the high end." : run.high - run.low > 20 ? "That range is wider than 20 counts. Narrow it." : "A good forecast should contain the expected count, 75.",
          "100 × 3/4 = 75. A forecast such as 66 to 84 contains most batches: in 20-batch runs at N = 100, counts usually stay within about 9 of 75. Your run gave " + run.count + ".",
          "Mission complete. Your forecast was sound. This run gave " + run.count + ", " + where + " it. Chance decides any single run, so the checker grades the forecast, not the luck.");
      }],
      expected: ["Expected count = N × P(0).", "1000 × 1/5.", c => {
        const v = c.ans("exp-count");
        return brGrade(brFits(v, 200), "Multiply the number of trials by P(0).",
          "1000 × 1/5 = 200. Individual runs scatter around 200. Try Run N trials a few times to see how far.");
      }],
      spread: ["Run 20 batches at N = 100 and at N = 10⁴, for the same state.", "Compare the typical count spread and the frequency spread in the log.", c => {
        const key = c.val("prep");
        if (!brBatchSet(c, key, 100) || !brBatchSet(c, key, 10000)) return brSetup("For the selected state, run 20 batches at N = 100 and 20 batches at N = 10⁴.");
        const pick = c.choice("spread-pick");
        return brGrade(pick === "count-up", "Read both spreads in the log for N = 100 and N = 10⁴.",
          "The counts scatter more at large N (often 3 to 4 counts at N = 100, but 30 to 40 at N = 10⁴ for P(0) = 3/4), while the frequencies scatter much less (about 0.035 versus 0.0035). The frequency settles toward P(0) even though the counts wander further from N × P(0).");
      }],
      sqrt: ["Compare the typical count spreads at N = 100 and N = 10⁴.", "N grew 100-fold. Is the spread closer to ×10, ×50 or ×100?", c => {
        const key = c.val("prep"), small = brBatchSet(c, key, 100), big = brBatchSet(c, key, 10000);
        if (!small || !big) return brSetup("For the selected state, run 20 batches at N = 100 and 20 batches at N = 10⁴ first.");
        const v = c.ans("sqrt-ratio"), seen = big.spread / Math.max(small.spread, 1e-9);
        return brGrade(Math.abs(v - 10) <= 1 || Math.abs(v - seen) <= 1, "Your own runs show a ratio of about " + brFmt(seen) + ". Type the factor your runs show, or the round number they cluster around.",
          "Your runs gave a ratio of " + brFmt(seen) + ". Across many runs it comes out near 10 = √100: the typical spread in counts grows roughly like √N. Since N grows faster than √N, the spread in frequency, spread ÷ N, shrinks like 1/√N. Lesson 15 explains why.");
      }]
    }
  },

  // 5 · State Detective ------------------------------------------------------------------------
  tomo: {
    start(c) {
      brSeed(c);
      c.s.cases = Object.fromEntries(Object.keys(BR_CASES).map(key => [key, { counts: { z: [0, 0], x: [0, 0], y: [0, 0] }, used: 0, shown: false }]));
    },
    actions: {
      measure(c) {
        const key = c.val("case"), card = BR_CASES[key], data = c.s.cases[key], basis = c.val("basis");
        const n = Math.min(c.num("batch"), card.budget - data.used);
        if (n <= 0) return "Case " + key.slice(1) + " has used its whole budget of " + card.budget + " trials. Make your estimate from these counts.";
        const k = brCount(c.s.rng, brProbs(card.ket, basis)[0], n);
        data.counts[basis][0] += k;
        data.counts[basis][1] += n - k;
        data.used += n;
        const o = BR_BASES[basis].outcomes;
        return "Case " + key.slice(1) + ", " + BR_BASES[basis].name + " basis, " + n + " fresh copies: " + k + " × " + o[0] + " and " + (n - k) + " × " + o[1] + ". Budget used " + data.used + " of " + card.budget + ".";
      },
      reveal(c) {
        const key = c.val("case"), data = c.s.cases[key];
        data.shown = true;
        return "Case " + key.slice(1) + " true state: " + BR_CASES[key].text + ".";
      },
      reseed(c) { return brReseed(c, " Counts you already have are kept."); }
    },
    show(c) {
      const key = c.val("case"), card = BR_CASES[key], data = c.s.cases[key];
      const a = c.quiet(key + "-a"), bre = c.quiet(key + "-bre"), bim = c.quiet(key + "-bim");
      const est = a !== null && bre !== null && bim !== null ? [[a, 0], [bre, bim]] : null;
      const lines = ["z", "x", "y"].map(b => {
        const [k0, k1] = data.counts[b], o = BR_BASES[b].outcomes;
        return BR_BASES[b].name + ": " + k0 + " × " + o[0] + ", " + k1 + " × " + o[1] + (k0 + k1 ? " (frequency " + brFmt(k0 / (k0 + k1)) + ")" : "");
      });
      c.put("state", "Seed " + c.s.seed + " · case " + key.slice(1) + " · budget used " + data.used + " of " + card.budget + " · " + lines.join(" · ") +
        (est ? " · your estimate predicts P(0) = " + brFmt(brProbs(est, "z")[0]) + ", P(+) = " + brFmt(brProbs(est, "x")[0]) + ", P(+i) = " + brFmt(brProbs(est, "y")[0]) : "") +
        (data.shown ? " · true state " + card.text + (est && brNear(brNorm2(est), 1, 0.02) ? ", overlap score " + brFmt(brOverlap(card.ket, est)) : "") : "") + ".");
      const bars = ["z", "x", "y"].map((b, k) => {
        const [k0, k1] = data.counts[b], n = k0 + k1;
        return { label: "P(" + BR_BASES[b].outcomes[0] + ")", value: n ? k0 / n : 0, text: n ? brFmt(k0 / n) : "–", tone: ["alpha", "plus", "minus"][k], outline: true,
          target: est ? brProbs(est, b)[0] : undefined };
      });
      const panels = [brBars("observed frequency · yellow: your estimate", bars, { weight: 1.3 })];
      if (data.shown) panels.push(brBars("true probabilities", ["z", "x", "y"].map((b, k) => ({ label: "P(" + BR_BASES[b].outcomes[0] + ")", value: brProbs(card.ket, b)[0], tone: ["alpha", "plus", "minus"][k] }))));
      return {
        panels,
        caption: "case " + key.slice(1),
        desc: "Observed frequencies of the first outcome in Z, X and Y for case " + key.slice(1) + ": " + lines.join("; ") + "." + (est ? " Yellow lines mark your estimate’s predictions." : "") + (data.shown ? " The true probabilities are shown on the right." : "")
      };
    },
    checks: {
      c1: ["P(0) = |α|² fixes α. P(+) and P(+i) fix the phase of β: P(+) = 1/2 + |α||β| cos φ and P(+i) = 1/2 + |α||β| sin φ.", "Choose case 1 in the controls and spend some budget in each of Z, X and Y.", brCaseGrader("c1")],
      c2: ["Z and X alone can’t tell φ from −φ.", "If P(+i) comes out below 1/2, sin φ is negative.", brCaseGrader("c2")],
      c3: ["60 trials is only 20 per basis, so expect rough frequencies.", "Use batches of 10 or 20 so the budget spreads evenly.", brCaseGrader("c3")],
      global: ["Every probability is a squared magnitude.", "What does |e^(iγ)c|² equal?", c => {
        const pick = c.choice("global-pick");
        return brGrade(pick === "global", "Which change to the state leaves every Z, X and Y probability exactly the same?",
          "Multiplying the whole state by e^(iγ) multiplies every amplitude ⟨a|ψ⟩ by e^(iγ), and |e^(iγ)|² = 1. No count in any basis can reveal it, which is why the estimate takes α real. The relative phase and the magnitudes are what the counts determine.");
      }]
    }
  },

  // 6 · Collapse Chain -------------------------------------------------------------------------
  chain: {
    start(c) { brSeed(c); c.s.tally = new Map(); c.s.sent = 0; c.s.last = null; },
    edit(c, name) {
      if (["start", "s1", "s2", "s3"].includes(name)) { c.s.tally = new Map(); c.s.sent = 0; c.s.last = null; }
    },
    actions: {
      send1(c) {
        const path = brChainSend(c, 1);
        if (!path) return "Choose at least one measurement stage first.";
        return "One system: " + path.join(" → ") + ". " + c.s.sent + " sent with this chain.";
      },
      send100(c) {
        if (!brChainSend(c, 100)) return "Choose at least one measurement stage first.";
        const rows = [...c.s.tally].sort((p, q) => q[1] - p[1]);
        return "100 more systems. Paths so far: " + rows.map(([path, n]) => path + ": " + n).join("; ") + ".";
      },
      reseed(c) { return brReseed(c); }
    },
    show(c) {
      const start = BR_CHAIN_STARTS[c.val("start")], stages = brChainStages(c), last = c.s.last;
      const items = [{ title: "start", sub: start.text, tone: "alpha" }];
      stages.forEach((b, k) => {
        const outcome = last?.[k];
        const pick = outcome === undefined ? -1 : BR_BASES[b].outcomes.indexOf(outcome);
        items.push({ title: BR_BASES[b].name + " basis", sub: outcome === undefined ? "no run yet" : "gave " + outcome, tone: ["angle", "minus", "plus"][k],
          below: pick >= 0 ? "now " + BR_KET_NAMES[b][pick] : undefined });
      });
      const rows = [...c.s.tally].sort((p, q) => q[1] - p[1]);
      c.put("state", "Seed " + c.s.seed + " · " + start.text + (stages.length ? " → " + stages.map(b => BR_BASES[b].name).join(" → ") : " with no stages") + " · " +
        c.s.sent + " systems sent" + (last ? " · last path " + last.join(" → ") : "") + ".");
      c.list("log", rows.map(([path, n]) => path + ": " + n + " of " + c.s.sent));
      const finalBasis = stages.at(-1);
      const finals = finalBasis ? BR_BASES[finalBasis].outcomes.map(o => rows.filter(([path]) => path.split(" → ").at(-1) === o).reduce((s, [, n]) => s + n, 0)) : [0, 0];
      return {
        panels: [
          brChain("one system through the chain", items, { weight: 2.2, note: last ? "each stage leaves its outcome’s ket" : "send a system to see one path" }),
          brBars(finalBasis ? "last stage, " + c.s.sent + " sent" : "no stage", (finalBasis ? BR_BASES[finalBasis].outcomes : ["–", "–"]).map((o, k) => ({
            label: o, value: c.s.sent ? finals[k] / c.s.sent : 0, text: c.s.sent ? String(finals[k]) : "–", tone: k ? "minus" : "plus" })))
        ],
        caption: start.text + (stages.length ? " → " + stages.map(b => BR_BASES[b].name).join(" → ") : ""),
        desc: "A chain of boxes: prepare " + start.text + ", then " + (stages.map(b => "measure " + BR_BASES[b].name).join(", then ") || "no measurement") + "." +
          (last ? " Last path: " + last.join(" → ") + "." : "") + " Bars count the last stage’s outcomes across " + c.s.sent + " systems."
      };
    },
    checks: {
      zz: ["After the first Z the system is in |0⟩ or |1⟩.", "Measure Z again on |0⟩. What can it give?", c => {
        const v = c.ans("zz-p");
        return brGrade(brFits(v, 1), "Whatever the first Z gave, what state is the system in just before the second Z?",
          "The first Z leaves |0⟩ (probability 3/4) or |1⟩ (1/4). Either way the second Z finds the same ket again, so it agrees with probability 1.");
      }],
      zxz: ["The middle X leaves |+⟩ or |−⟩.", "⟨0|+⟩ and ⟨0|−⟩ both have magnitude 1/√2.", c => {
        const v = c.ans("zxz-p");
        if (brFits(v, 1)) return brGrade(false, "The first Z result is no longer stored once X has measured the system. Send 100 through Z → X → Z and look at the final bars.");
        return brGrade(brFits(v, 1 / 2), "Find the state after X, then compute P(0) for it.",
          "Start |0⟩: the first Z gives 0. X then gives + or −, each with probability 1/2, leaving |+⟩ or |−⟩. Both have |⟨0|±⟩|² = 1/2, so the final Z gives 0 only half the time. The X measurement erased the Z certainty.");
      }],
      joint: ["Multiply the probabilities along the path.", "P(Z gives 0) = cos²30° = 3/4. After that the state is |0⟩.", c => {
        const v = c.ans("joint-p");
        if (brFits(v, (1 + Math.sqrt(3) / 2) / 2 * 3 / 4)) return brGrade(false, "After Z gives 0 the system is |0⟩, not |30°⟩. Use P(+) for |0⟩.");
        return brGrade(brFits(v, 3 / 8), "P(0 first) times P(+ given the system is now |0⟩).",
          "P(Z gives 0) = (√3/2)² = 3/4 leaves |0⟩. Then P(+) = |⟨+|0⟩|² = 1/2. The path 0 → + has probability 3/4 × 1/2 = 3/8.");
      }],
      xyx: ["Start |+⟩, so the first X gives + for sure.", "Y leaves |+i⟩ or |−i⟩, and |⟨+|±i⟩|² = 1/2.", c => {
        const v = c.ans("xyx-p");
        return brGrade(brFits(v, 1 / 2), "Track the state after Y, then compute P(+).",
          "The first X gives + with certainty. Y then leaves |+i⟩ or |−i⟩, and either one gives + in X with probability 1/2. Any intervening measurement in a basis that doesn’t share kets with X resets the odds.");
      }],
      remove: ["Set the chain to Z → Z → none and send systems.", "Nothing between the two Z measurements disturbs the system.", c => {
        const pick = c.choice("remove-pick");
        return brGrade(pick === "certain", "Try Z → Z with no middle stage and send 100 systems.",
          "With no middle stage, the second Z repeats the first Z’s result every time. The uncertainty in Z → X → Z comes from the X measurement, which leaves |+⟩ or |−⟩.");
      }]
    }
  },

  // 7 · Repeat or Refresh ----------------------------------------------------------------------
  refresh: {
    start(c) { brSeed(c); c.s.sims = {}; },
    actions: {
      sim(c, check) {
        const story = BR_STORIES[check ?? c.open() ?? "echo"];
        const ket = story.who === "same" ? BR_BASES[story.first[0]].kets[story.first[1]] : story.ket;
        const p = brProbs(ket, story.next)[story.ask], k = brCount(c.s.rng, p, 20);
        c.s.sims[check] = k;
        const o = BR_BASES[story.next].outcomes;
        return "20 simulated next readouts of this story: " + k + " × " + o[story.ask] + " and " + (20 - k) + " × " + o[1 - story.ask] + ".";
      },
      reseed(c) { return brReseed(c); }
    },
    show(c) {
      const key = c.open() ?? "echo", story = BR_STORIES[key], shown = c.revealed(key);
      const [b0, k0] = story.first, o = BR_BASES[story.next].outcomes;
      c.put("state", "Seed " + c.s.seed + " · story: " + story.prep + " · " + BR_BASES[b0].name + " gave " + BR_BASES[b0].outcomes[k0] + " · next readout in " + BR_BASES[story.next].name +
        (shown ? " · " + (story.who === "same" ? "same system" : "fresh copy") + ", P(" + o[story.ask] + ") = " + brFmt(story.p) : "") + ".");
      const sim = c.s.sims[key];
      return {
        panels: [
          brChain("the story", [
            { title: "source", sub: story.prep.length > 14 ? "see readout" : story.prep, tone: "alpha" },
            { title: "first: " + BR_BASES[b0].name, sub: "gave " + BR_BASES[b0].outcomes[k0], tone: "angle", below: "now " + BR_KET_NAMES[b0][k0] },
            { title: "next: " + BR_BASES[story.next].name, sub: shown ? (story.who === "same" ? "same system" : "fresh copy") : "which system?", tone: "minus" }
          ], { weight: 2.2 }),
          brBars(sim === undefined ? "no simulation yet" : "20 next readouts", [
            { label: o[story.ask], value: sim === undefined ? 0 : sim / 20, text: sim === undefined ? "–" : String(sim), tone: "plus" },
            { label: o[1 - story.ask], value: sim === undefined ? 0 : 1 - sim / 20, text: sim === undefined ? "–" : String(20 - sim), tone: "minus" }])
        ],
        caption: key,
        desc: "Story: prepare " + story.prep + ", measure " + BR_BASES[b0].name + " and get " + BR_BASES[b0].outcomes[k0] + ", then a next readout in " + BR_BASES[story.next].name + "." +
          (sim === undefined ? "" : " The last simulation gave " + sim + " of 20 for outcome " + o[story.ask] + ".")
      };
    },
    checks: Object.fromEntries(Object.entries(BR_STORIES).map(([key, story]) => [key, [
      "Is the next readout on the system that was just measured, or on a new copy from the source?",
      story.who === "same" ? "A measured system is left in the ket of its outcome." : "A new copy is in the prepared state, whatever happened before.",
      c => {
        const who = c.choice(key + "-who"), v = c.ans(key + "-p");
        if (who !== story.who) return brGrade(false, "Read the story again: " + (story.who === "same" ? "nothing new is prepared." : "the next readout uses another system."));
        return brGrade(brFits(v, story.p), "Right system. Now compute the probability for " + (who === "same" ? "the post-measurement ket" : "the prepared state") + ".", story.work);
      }]]))
  },

  // 8 · Polarizer Stack ------------------------------------------------------------------------
  stack: {
    show(c) {
      const m = brStackModel(c);
      c.put("state", "Polarizer angles " + m.angles.map(a => brFmt(Math.round(a * 100) / 100) + "°").join(", ") + " · " +
        m.angles.slice(1).map((a, k) => "cos²(" + brFmt(Math.round((a - m.angles[k]) * 100) / 100) + "°)").join(" × ") + " = " + brFmt(m.pass) + " of the |H⟩ light passes.");
      return {
        panels: [
          { kind: "stack", caption: m.n ? m.n + " middle polarizer" + (m.n === 1 ? "" : "s") : "crossed polarizers", angles: m.angles, levels: m.levels, weight: 2.2 },
          brBars("after the last", [{ label: "passes", value: m.pass, tone: "plus" }, { label: "blocked", value: 1 - m.pass, tone: "minus" }])
        ],
        caption: brFmt(m.pass) + " passes",
        desc: "Horizontally polarized light meets polarizers at " + m.angles.map(a => brFmt(Math.round(a * 100) / 100) + "°").join(", ") +
          ". After each one the passing fraction is " + m.levels.map(l => brFmt(l)).join(", ") + "."
      };
    },
    checks: {
      crossed: ["The first polarizer passes |H⟩ = |0⟩ completely.", "The 90° polarizer passes |V⟩ = |1⟩. What is |⟨1|0⟩|²?", c => {
        const v = c.ans("crossed-t");
        return brGrade(brFits(v, 0), "Compute |⟨V|H⟩|².",
          "⟨V|H⟩ = ⟨1|0⟩ = 0, so crossed polarizers pass nothing. A polarizer at θ measures in {|θ⟩, |θ⊥⟩} and passes the |θ⟩ outcome, with |0⟩ = horizontal as in Lesson 12.");
      }],
      ff: ["Set one middle polarizer at 45°.", "Each step passes cos²(45°) = 1/2.", c => {
        const m = brStackModel(c);
        if (m.angles.length !== 3 || !brNear(m.angles[1], 45, 1e-9)) return brSetup("Set the stack to exactly one middle polarizer at 45° first.");
        const v = c.ans("ff-t");
        return brGrade(brFits(v, 1 / 4), "Multiply the passing fractions of the two steps.",
          "The 45° polarizer passes half the |H⟩ light and leaves it in |45°⟩ = |+⟩. The 90° polarizer passes |⟨V|+⟩|² = 1/2 of that. 1/2 × 1/2 = 1/4 gets through where none did before.");
      }],
      thirty: ["Steps of 30° then 60°.", "cos²30° = 3/4 and cos²60° = 1/4.", c => {
        const v = c.ans("thirty-t");
        return brGrade(brFits(v, 3 / 16), "Multiply cos² of each step.",
          "3/4 × 1/4 = 3/16 ≈ 0.19, less than the 1/4 at 45°. With one middle polarizer, 45° splits the turn evenly and passes the most.");
      }],
      sixty: ["Use evenly spaced middle polarizers.", "Transmission is cos^(2(n+1))(90°/(n + 1)). Try n = 3 and n = 4.", c => {
        const m = brStackModel(c);
        if (m.mode !== "even") return brSetup("Choose evenly spaced polarizers first.");
        if (m.pass <= 0.6) return brGrade(false, "With " + m.n + " middle polarizers " + brFmt(m.pass) + " passes. Add more.");
        if (m.n > 4) return brGrade(false, brFmt(m.pass) + " passes, but fewer middle polarizers also clear 60%.");
        return brGrade(true, "",
          "Three middle polarizers pass cos⁸(22.5°) ≈ 0.531, and four pass cos¹⁰(18°) ≈ 0.605. Smaller steps mean each measurement barely disturbs the state, so the polarization is dragged round from H to V. With many tiny steps almost everything passes.");
      }],
      why: ["What state does a photon leave a polarizer in?", "Compare with the Collapse Chain station.", c => {
        const pick = c.choice("why-pick");
        return brGrade(pick === "reset", "A polarizer can only absorb light, yet adding one lets more through. What does it do to the light that passes?",
          "Each polarizer is a measurement. A photon that passes is left in that polarizer’s |θ⟩, so the next polarizer sees a new state. Inserting 45° replaces |H⟩, which the 90° polarizer always blocks, with |+⟩, which it passes half the time.");
      }]
    }
  },

  // 9 · Best Guess -----------------------------------------------------------------------------
  guess: {
    show(c) {
      const m = brGuessModel(c), p = m.pair, name = r => r === "a" ? p.an : p.bn;
      c.put("state", "One copy of " + p.text + ", equally likely · detector at θ = " + brAngleText(m.theta) + " · outcome θ → guess " + name(m.r0) + ", outcome θ⊥ → guess " + name(m.r1) +
        " · P(right | " + p.an + ") = " + brFmt(m.rightA) + " · P(right | " + p.bn + ") = " + brFmt(m.rightB) + " · success " + brFmt(m.success) + ".");
      return {
        panels: [
          brPlane("states and detector", [brKetArrow(m.A, "alpha", p.an, { wide: true }), brKetArrow(m.B, "beta", p.bn, { wide: true })],
            { rays: brAxisRays(m.theta), marks: [{ angle: m.theta, tone: "angle", label: "θ" }, { angle: m.theta + 90, tone: "minus", label: "θ⊥" }] }),
          brBars("chance of guessing right", [
            { label: "if " + p.an, value: m.rightA, tone: "alpha" }, { label: "if " + p.bn, value: m.rightB, tone: "beta" },
            { label: "overall", value: m.success, tone: "plus" }], { weight: 1.2 })
        ],
        caption: "success " + brFmt(m.success),
        desc: "Left: " + p.an + " and " + p.bn + " as arrows, with the detector axes at " + brFmt(m.theta) + "° and " + brFmt(m.theta + 90) + "°. Right: the chance of guessing right for each state and overall, " + brFmt(m.success) + "."
      };
    },
    checks: {
      naive: ["With rule 0 → |0⟩, 1 → |+⟩: if the state is |0⟩ you are always right.", "If it is |+⟩ you are right only when Z gives 1.", c => {
        const v = c.ans("naive-p");
        return brGrade(brFits(v, 3 / 4), "Average P(right | |0⟩) = 1 and P(right | |+⟩) = P(1 | |+⟩).",
          "P(right) = ½ × 1 + ½ × 1/2 = 3/4. The rule never mistakes |0⟩, but it calls |+⟩ wrong half the time.");
      }],
      optimal: ["Choose the pair |0⟩ or |+⟩.", "Put the detector axes symmetrically around the two states: θ = 157.5° (−22.5°) with θ → |0⟩, or θ = 67.5° with θ → |+⟩.", c => {
        const m = brGuessModel(c);
        if (c.val("pair") !== "zp") return brSetup("Choose the pair |0⟩ or |+⟩ first.");
        const best = (2 + Math.SQRT2) / 4;
        return brGrade(m.success >= best - BR_DERIVED, "Success is " + brFmt(m.success) + ". The best possible is about 0.854. Turn the detector and check the rule.",
          "The best detector straddles the two states symmetrically, 22.5° outside each. Then P(right) = cos²(22.5°) = (2 + √2)/4 ≈ 0.854 for both states. That beats the Z detector’s 3/4 and is the most any measurement can do for this pair.");
      }],
      best30: ["For two real states Δ apart, the best symmetric detector gives ½(1 + sin Δ).", "Here Δ = 30°.", c => {
        const v = c.ans("best30-p");
        return brGrade(brFits(v, 3 / 4), "Set the pair |0⟩ or |30°⟩ and look for the highest success, or use ½(1 + sin 30°).",
          "½(1 + sin 30°) = ½(1 + 1/2) = 3/4. The closer the states, the closer the best guess is to a coin flip.");
      }],
      ortho: ["Choose the pair |+⟩ or |−⟩.", "Measure in the basis the two states form.", c => {
        if (c.val("pair") !== "pm") return brSetup("Choose the pair |+⟩ or |−⟩ first.");
        const m = brGuessModel(c);
        return brGrade(m.success >= 1 - BR_DERIVED, "Success is " + brFmt(m.success) + ". Line the detector up with one of the states and set the rule to match.",
          "At θ = 45° the detector measures X. |+⟩ always gives θ and |−⟩ always gives θ⊥, so the rule θ → |+⟩, θ⊥ → |−⟩ is never wrong. Orthogonal states can be told apart perfectly.");
      }],
      never: ["Perfect guessing needs each outcome to come from only one of the states.", "Compare with station 3.", c => {
        const pick = c.choice("never-pick");
        return brGrade(pick === "overlap", "What does ⟨0|+⟩ = 1/√2 say about the outcomes the two states can share?",
          "Because ⟨0|+⟩ ≠ 0, no detector puts them on perpendicular axes, so every outcome has a nonzero probability for both. Some guesses must sometimes be wrong. Only orthogonal states can be distinguished with certainty.");
      }]
    }
  },

  // 10 · Measurement Designer ------------------------------------------------------------------
  designer: {
    show(c) {
      const key = c.open() ?? "certain", card = BR_DESIGN[key];
      const parts = ["a0", "a1", "b0", "b1"].map(p => c.quietCx(p));
      if (parts.some(p => !p)) {
        c.put("state", "State " + card.text + ". Enter all four entries of |a⟩ and |b⟩.");
        return { panels: [brPlane("your basis", [])], caption: card.text, desc: "No basis entered yet." };
      }
      const a = [parts[0], parts[1]], b = [parts[2], parts[3]], pa = brProb(a, card.ket), pb = brProb(b, card.ket), overlap = brInner(a, b);
      c.put("state", "State " + card.text + " · ⟨a|a⟩ = " + brFmt(brNorm2(a)) + " · ⟨b|b⟩ = " + brFmt(brNorm2(b)) + " · ⟨a|b⟩ = " + brCx(overlap) +
        " · P(a) = " + brFmt(pa) + " · P(b) = " + brFmt(pb) + " · sum " + brFmt(pa + pb) + (c.open() ? " · target P(a) = " + brFmt(card.target) : "") + ".");
      const items = [];
      if (brReal(card.ket)) items.push(brKetArrow(card.ket, "alpha", "|ψ⟩", { wide: true }));
      if (brReal(a)) items.push(brKetArrow(a, "angle", "|a⟩"));
      if (brReal(b)) items.push(brKetArrow(b, "minus", "|b⟩", { dashed: true }));
      return {
        panels: [
          brPlane(brReal(a) && brReal(b) ? "your basis" : "real parts only drawn", items, { limit: 1.2 }),
          brBars(c.open() ? "yellow: target P(a)" : "open a card for its target", [
            { label: "P(a)", value: pa, tone: "angle", target: c.open() ? card.target : undefined }, { label: "P(b)", value: pb, tone: "minus" },
            { label: "sum", value: pa + pb, tone: "plus" }], { max: Math.max(1, Math.ceil((pa + pb) * 2) / 2) })
        ],
        caption: card.text,
        desc: "Your |a⟩ and |b⟩" + (brReal(a) && brReal(b) ? " drawn as arrows" : "") + " for the state " + card.text + ". Bars: P(a) = " + brFmt(pa) + ", P(b) = " + brFmt(pb) + "."
      };
    },
    checks: Object.fromEntries(Object.keys(BR_DESIGN).map(key => [key, [...BR_DESIGN[key].hint, brDesignGrader(key)]]))
  },

  // 11 · Error Detective -----------------------------------------------------------------------
  detective: {
    show(c) {
      const key = c.open() ?? "square";
      c.put("state", c.open() ? "Case file open: " + BR_ERRORS[key].text + "." : "Open a case file. Showing case 1.");
      return { ...brErrorPlan(key), caption: BR_ERRORS[key].text };
    },
    checks: {
      square: ["Lines 1 and 2 are correct.", "What must be combined before you square: probabilities or amplitudes?", brErrorGrader("square")],
      over: ["Line 1 is correct.", "Square the whole denominator: (2√2)² = 8.", brErrorGrader("over")],
      conj: ["Line 1 is correct.", "The bra is the conjugate transpose of the ket.", brErrorGrader("conj")],
      freq: ["Line 1 is correct.", "Could a state with P(0) = 0.6 give 7 zeros in 10 trials?", brErrorGrader("freq")],
      click: ["Line 1 is correct.", "Which states have c₊ ≠ 0?", brErrorGrader("click")],
      fresh: ["Lines 1 and 2 are correct.", "Is the next system the one that was measured?", brErrorGrader("fresh")]
    }
  },

  // 12 · Quantum Preview: Outcomes With Values -------------------------------------------------
  values: {
    start(c) { brSeed(c); c.s.n = 0; c.s.sum = 0; c.s.plus = 0; c.s.trail = []; },
    edit(c, name) { if (name === "t") { c.s.n = 0; c.s.sum = 0; c.s.plus = 0; c.s.trail = []; } },
    actions: {
      run10(c) { return brValuesRun(c, 10); },
      run100(c) { return brValuesRun(c, 100); },
      run1000(c) { return brValuesRun(c, 1000); },
      clear(c) { c.s.n = 0; c.s.sum = 0; c.s.plus = 0; c.s.trail = []; return "Values cleared."; },
      reseed(c) { return brReseed(c); }
    },
    show(c) {
      const t = c.num("t"), p0 = brValuesP0(c), longRun = 2 * p0 - 1, n = c.s.n;
      c.put("state", "Seed " + c.s.seed + " · state cos t|0⟩ + sin t|1⟩ with t = " + brAngleText(t) + " · P(0) = " + brFmt(p0) + ", P(1) = " + brFmt(1 - p0) +
        " · outcome 0 → +1, outcome 1 → −1 · " + n + " trials" + (n ? ": " + c.s.plus + " × (+1), " + (n - c.s.plus) + " × (−1), average " + brFmt(c.s.sum / n) : "") + ".");
      const width = Math.max(10, n), step = Math.max(1, Math.ceil(c.s.trail.length / 400));
      const pts = c.s.trail.filter((_, k) => k % step === 0 || k === c.s.trail.length - 1);
      const ticks = [0, width / 2, width].map(v => Math.round(v));
      return {
        panels: [
          brChart("running average of the values", { weight: 1.7, x: [0, width], y: [-1, 1], xTicks: ticks, yTicks: [-1, -0.5, 0, 0.5, 1], xLabel: "number of trials",
            series: pts.length ? [{ pts, tone: "plus" }] : [], hlines: c.revealed("plus") || c.revealed("quarter") || c.revealed("reverse") ? [{ y: longRun, label: "(+1)P(0) + (−1)P(1)" }] : [] }),
          brBars("values seen", [
            { label: "+1", value: n ? c.s.plus / n : 0, text: n ? String(c.s.plus) : "–", tone: "plus" },
            { label: "−1", value: n ? 1 - c.s.plus / n : 0, text: n ? String(n - c.s.plus) : "–", tone: "minus" }])
        ],
        caption: n ? "average " + brFmt(c.s.sum / n) : "no trials yet",
        desc: "Left: the average of all values so far, after each trial, for " + n + " trials." + (n ? " It ends at " + brFmt(c.s.sum / n) + "." : "") +
          " Right: how many trials gave +1 and −1. After you complete a prediction mission, a yellow line marks the long-run value."
      };
    },
    checks: {
      plus: ["t = 45° gives |+⟩, with P(0) = P(1) = 1/2.", "Half the values are +1 and half are −1, in the long run.", c => {
        const v = c.ans("plus-avg");
        return brGrade(brFits(v, 0), "Weight each value by its probability and add.",
          "(+1)(1/2) + (−1)(1/2) = 0. Runs wander around 0 and settle closer to it as the number of trials grows, as station 4 showed for frequencies.");
      }],
      quarter: ["t = 30° gives P(0) = 3/4.", "(+1)(3/4) + (−1)(1/4).", c => {
        const v = c.ans("quarter-avg");
        if (brFits(v, 3 / 4)) return brGrade(false, "3/4 is P(0). The −1 outcomes pull the average down.");
        return brGrade(brFits(v, 1 / 2), "Weight +1 by P(0) and −1 by P(1).",
          "(+1)(3/4) + (−1)(1/4) = 1/2. That is P(0) − P(1), the same as cos 2t = cos 60°.");
      }],
      reverse: ["The long-run average is P(0) − P(1) = 2P(0) − 1.", "Solve 2P(0) − 1 = −0.6.", c => {
        const v = c.ans("reverse-p0");
        return brGrade(brFits(v, 0.2), "Write the average in terms of P(0) alone, then solve.",
          "2P(0) − 1 = −0.6 gives P(0) = 0.2 and P(1) = 0.8. A state such as (|0⟩ + 2|1⟩)/√5 does it. Lessons 14 and 15 call this kind of average an expectation value.");
      }],
      single: ["Run 10 trials and read each value.", "What values can one trial produce?", c => {
        const pick = c.choice("single-pick");
        return brGrade(pick === "no", "List the values a single trial can show.",
          "Each trial reports one outcome, so it shows +1 or −1 and never 0.5. The average is a property of many trials, not a value any single measurement displays.");
      }]
    }
  },

  // 13 · Measurement Axis on the Bloch Sphere (3D) --------------------------------------------
  axis: {
    start(c) { brSeed(c); c.s.trials = 0; c.s.snapped = null; },
    drag(c, dx, dy) {
      c.set("yaw", ((Math.round((c.num("yaw") - dx * 0.5) / 5) * 5) % 360 + 360) % 360);
      c.set("tilt", Math.max(-60, Math.min(60, Math.round((c.num("tilt") + dy * 0.3) / 5) * 5)));
    },
    edit(c, name) { if (["sp", "sa", "ap", "aa"].includes(name)) c.s.snapped = null; },
    actions: {
      measure(c) {
        const m = brAxisModel(c), up = c.s.rng() < m.p;
        const ap = c.num("ap"), aa = c.num("aa");
        c.set("sp", up ? ap : 180 - ap);
        c.set("sa", up ? aa : (aa + 180) % 360);
        c.s.trials += 1;
        c.s.snapped = up ? "a" : "a⊥";
        return "Trial " + c.s.trials + ": outcome " + c.s.snapped + " (it had probability " + brFmt(up ? m.p : 1 - m.p) + "). The state point snaps to the " + c.s.snapped + " end of the axis.";
      },
      reseed(c) { return brReseed(c); }
    },
    show(c) {
      const m = brAxisModel(c);
      c.put("state", "State point " + brFmt(c.num("sp")) + "° from |0⟩ at longitude " + brFmt(c.num("sa")) + "° · axis a " + brFmt(c.num("ap")) + "° from |0⟩ at longitude " + brFmt(c.num("aa")) +
        "° · angle between them γ = " + brAngleText(Math.round(m.gamma * 100) / 100) + " · P(a) = cos²(γ/2) = " + brFmt(m.p) + " · P(a⊥) = " + brFmt(1 - m.p) +
        (c.s.snapped ? " · last trial gave " + c.s.snapped + ", so the point sits on the axis" : "") + ".");
      return {
        sphere: { yaw: c.num("yaw"), tilt: c.num("tilt"), marker: { polar: c.num("sp"), azimuth: c.num("sa") }, axis: m.axis,
          points: [{ point: m.axis, tone: "angle", size: 5 }, { point: m.axis.map(n => -n), tone: "minus", size: 5 }] },
        caption: "γ = " + brFmt(Math.round(m.gamma * 10) / 10) + "°, P(a) = " + brFmt(m.p),
        desc: "A Bloch sphere with |0⟩ at the top. The yellow axis is the measurement, with outcome a at one end and a⊥ at the other. The state point is " +
          brFmt(Math.round(m.gamma * 10) / 10) + "° from the a end, so P(a) = " + brFmt(m.p) + "."
      };
    },
    checks: {
      eq: ["|0⟩ is the top of the sphere, and an equator axis is 90° away.", "cos²(45°).", c => {
        const v = c.ans("eq-p");
        return brGrade(brFits(v, 1 / 2), "Find γ between the top and an equator point, then use cos²(γ/2).",
          "γ = 90°, so P(a) = cos²(45°) = 1/2. Every axis on the equator, such as X (the |+⟩ end) or Y (the |+i⟩ end), is a fair coin for |0⟩.");
      }],
      sixty: ["Keep the state at |0⟩ (0° from the top).", "cos²(γ/2) = 3/4 needs γ/2 = 30°.", c => {
        const m = brAxisModel(c);
        if (c.num("sp") !== 0) return brSetup("Put the state point at |0⟩ first: 0° from the top.");
        return brGrade(brNear(m.p, 3 / 4), "P(a) is " + brFmt(m.p) + ". Tilt the axis.",
          "Tilting the axis 60° from the top gives γ = 60° and P(a) = cos²(30°) = 3/4, at any longitude. On the sphere, angles are doubled: the tilted detector |30°⟩ from station 1 sits 60° from |0⟩.");
      }],
      ha: ["|+⟩ sits on the equator at longitude 0°. The axis sits 45° from the top at longitude 0°.", "γ = 45°, so P(a) = cos²(22.5°) = (1 + cos 45°)/2.", c => {
        const v = c.ans("ha-p");
        return brGrade(brFits(v, (2 + Math.SQRT2) / 4), "Find γ, halve it, and take cos².",
          "γ = 90° − 45° = 45°, so P(a) = cos²(22.5°) = (1 + cos 45°)/2 = (2 + √2)/4 ≈ 0.854. This is the best-guess detector from station 9, drawn on the sphere.");
      }],
      opp: ["The axis points straight away from the state.", "γ = 180°.", c => {
        const v = c.ans("opp-p");
        return brGrade(brFits(v, 0), "What is cos²(90°)?",
          "γ = 180° gives cos²(90°) = 0: outcome a never happens and a⊥ is certain. Opposite points on the sphere are orthogonal states, like |0⟩ and |1⟩.");
      }],
      rep: ["Press Measure once along the axis, then leave the sliders alone.", "After the trial the state point is at one end of the axis.", c => {
        if (!c.s.trials || !c.s.snapped) return brSetup("Run one trial first, and don’t move the state or axis sliders afterwards.");
        const v = c.ans("rep-p");
        return brGrade(brFits(v, 1), "Your last trial gave " + c.s.snapped + ". Where is the point now, and what is γ from that end?",
          "The trial left the point at the " + c.s.snapped + " end, so γ = 0° from that end and an immediate repeat gives " + c.s.snapped + " with probability cos²(0°) = 1.");
      }]
    }
  },

  // 14 · Quantum Random Number Generator -------------------------------------------------------
  qrng: {
    start(c) { brSeed(c); c.s.bits = []; c.s.bias = null; },
    edit(c, name) { if (name === "t" && c.s.bits.length) { c.s.bits = []; c.s.bias = null; c.say("The bias changed, so the stored bits were cleared."); } },
    actions: {
      gen100(c) { return brQrngGenerate(c, 100); },
      gen1000(c) { return brQrngGenerate(c, 1000); },
      clear(c) { c.s.bits = []; c.s.bias = null; return "Bits cleared."; },
      reseed(c) { return brReseed(c); }
    },
    show(c) {
      const p1 = brQrngP1(c), bits = c.s.bits, n = bits.length, ones = bits.reduce((s, b) => s + b, 0);
      const pair = c.checked("pair"), out = brPairs(bits), outOnes = out.reduce((s, b) => s + b, 0);
      c.put("state", "Seed " + c.s.seed + " · cos t|0⟩ + sin t|1⟩ with t = " + brAngleText(c.num("t")) + " · P(1) = " + brFmt(p1) + " · " + n + " raw bits" +
        (n ? ", " + brFmt(ones / n) + " of them 1" : "") + (pair ? " · pairing on: " + out.length + " output bits" + (out.length ? ", " + brFmt(outOnes / out.length) + " of them 1, " + brFmt(out.length / Math.max(1, n)) + " output bits per raw bit" : "") : " · pairing off") + ".");
      c.put("bits", n ? "Raw: " + bits.slice(0, 64).join("") + (n > 64 ? "…" : "") : "");
      c.put("out", pair && out.length ? "Paired: " + out.slice(0, 48).join("") + (out.length > 48 ? "…" : "") : "");
      return {
        panels: [brBars(pair ? "fraction of 1s · yellow: 1/2" : "fraction of 1s · yellow: P(1)", [
          { label: "raw", value: n ? ones / n : 0, text: n ? brFmt(Math.round(ones / n * 1000) / 1000) : "–", tone: "alpha", target: pair ? undefined : p1 },
          ...(pair ? [{ label: "paired", value: out.length ? outOnes / out.length : 0, text: out.length ? brFmt(Math.round(outOnes / out.length * 1000) / 1000) : "–", tone: "plus", target: 0.5 },
            { label: "kept per raw", value: n ? out.length / n : 0, text: n ? brFmt(Math.round(out.length / n * 1000) / 1000) : "–", tone: "minus" }] : [])
        ])],
        caption: n + " raw bits",
        desc: "Bars: the fraction of 1s among " + n + " raw bits" + (pair ? ", among " + out.length + " paired output bits, and the number of output bits kept per raw bit." : ".")
      };
    },
    checks: {
      bias: ["P(1) = sin²t.", "sin t = √0.9 gives t ≈ 71.57°.", c => {
        const p1 = brQrngP1(c);
        return brGrade(brNear(p1, 0.9), "P(1) is " + brFmt(p1) + " at this t.",
          "sin²t = 0.9 needs t ≈ 71.57° (≈ 1.249 rad). The setting t = 71.5° gives 0.8993, within 0.005. The bits now come out about 90% ones.");
      }],
      pair: ["Two raw bits are independent, so multiply.", "P(0 then 1) = P(0) × P(1).", c => {
        const v = c.ans("pair-p");
        return brGrade(brFits(v, 0.16), "Multiply P(0) = 0.2 by P(1) = 0.8.",
          "P(01) = 0.2 × 0.8 = 0.16, and P(10) = 0.8 × 0.2 = 0.16 as well. Because 01 and 10 are equally likely for any bias, the pairing trick gives a fair 0 or 1.");
      }],
      rate: ["Each pair of raw bits gives an output bit only for 01 or 10.", "For fair bits P(01) + P(10) = 1/2, per two raw bits.", c => {
        const v = c.ans("rate-r");
        if (brFits(v, 1 / 2)) return brGrade(false, "1/2 is the output per pair. Each pair uses two raw bits.");
        return brGrade(brFits(v, 1 / 4), "Find the chance a pair is kept, then divide by the two raw bits it uses.",
          "A pair is kept with probability 2p(1 − p) = 1/2 for p = 1/2, and it uses two raw bits, so the output rate is p(1 − p) = 1/4 per raw bit. With p = 0.9 it falls to 0.09. Fairness costs bits.");
      }],
      fair: ["Set P(1) = 0.9, tick pairing, and generate at least 1000 raw bits.", "Compare the raw and paired bars.", c => {
        if (c.s.bits.length < 1000 || c.s.bias === null || !brNear(c.s.bias, 0.9)) return brSetup("Generate at least 1000 raw bits with P(1) = 0.9 first.");
        if (!c.checked("pair")) return brSetup("Tick the pairing box to see the output bits.");
        const pick = c.choice("fair-pick");
        return brGrade(pick === "half", "Read the paired bar against the yellow line at 1/2.",
          "The raw bits are about 90% ones, but the paired bits are close to half ones, because 01 and 10 each have probability 0.09. Only about 9 output bits survive per 100 raw bits.");
      }]
    }
  },

  // 15 · Bomb Tester (3D) ----------------------------------------------------------------------
  bomb: {
    start(c) { brSeed(c); c.s.clock = 0; c.s.flash = false; c.s.shots = 0; },
    drag(c, dx, dy) {
      c.set("turn", Math.max(-60, Math.min(60, Math.round((c.num("turn") + dx * 0.3) / 5) * 5)));
      c.set("tilt", Math.max(15, Math.min(90, Math.round((c.num("tilt") - dy * 0.3) / 5) * 5)));
    },
    edit(c) { c.s.flash = false; },
    moving: () => true,
    tick(c, dt) { c.s.clock = (c.s.clock + dt) % 600; },
    actions: {
      send1(c) {
        const m = brBombModel(c), k = brPick(c.s.rng, [m.pe, m.p0, m.p1]);
        c.s.shots += 1;
        c.s.flash = k === 0;
        return "Photon " + c.s.shots + ": " + ["the bomb exploded.", "D0 clicked. Inconclusive: run again.",
          m.arm === "live" ? "D1 clicked. The bomb is live, and this photon never reached it." : "D1 clicked."][k];
      },
      test100(c) {
        const m = brBombModel(c), tally = [0, 0, 0];
        for (let bomb = 0; bomb < 100; bomb++) {
          let result = 2;
          for (let run = 0; run < 20; run++) {
            const k = brPick(c.s.rng, [m.pe, m.p0, m.p1]);
            if (k === 0) { result = 0; break; }
            if (k === 2) { result = 1; break; }
          }
          tally[result] += 1;
        }
        c.s.flash = false;
        return "100 " + (m.arm === "empty" ? "empty arms" : m.arm === "live" ? "live bombs" : "duds") + ", each run until D1 clicks or it explodes (at most 20 runs): " +
          tally[1] + " flagged by D1, " + tally[0] + " exploded, " + tally[2] + " still inconclusive.";
      },
      reseed(c) { return brReseed(c); }
    },
    show(c) {
      const m = { ...brBombModel(c), flash: c.s.flash };
      c.put("state", "Seed " + c.s.seed + " · θ = " + brAngleText(m.theta) + " · lower arm: " + (m.arm === "empty" ? "empty" : m.arm === "live" ? "live bomb" : "dud (transparent)") +
        " · P(explode) = " + brFmt(m.pe) + " · P(D0) = " + brFmt(m.p0) + " · P(D1) = " + brFmt(m.p1) + ".");
      return {
        bench: { turn: c.num("turn"), tilt: c.num("tilt"), model: m, beams: brBenchBeams(m), clock: c.reduced() ? null : c.s.clock },
        caption: m.arm === "live" ? "live bomb in the lower arm" : m.arm === "dud" ? "dud in the lower arm" : "empty arms",
        desc: "The Lesson 12 interferometer seen from above, with the phase shifter at " + brFmt(m.theta) + "° and " +
          (m.arm === "empty" ? "nothing in the lower arm" : m.arm === "live" ? "a live bomb in the lower arm, which absorbs any photon there" : "a dud in the lower arm, which lets photons through") +
          ". P(explode) = " + brFmt(m.pe) + ", D0 receives " + brFmt(m.p0) + " and D1 receives " + brFmt(m.p1) + "."
      };
    },
    checks: {
      dark: ["Leave the lower arm empty.", "P(D1) = sin²(θ/2).", c => {
        const m = brBombModel(c);
        if (m.arm === "live") return brSetup("Take the live bomb out first: tune the interferometer with an empty arm.");
        return brGrade(m.p1 <= BR_DERIVED, "P(D1) is " + brFmt(m.p1) + ". Turn the phase shifter.",
          "At θ = 0° the two paths cancel at D1 and add at D0, so with an undisturbed interferometer D1 never clicks. Any D1 click now means something disturbed the paths.");
      }],
      single: ["A live bomb absorbs the photon if it takes the lower arm: probability 1/2.", "Otherwise the photon reaches splitter 2 along the upper arm only, and splits 50/50.", c => {
        const e = c.ans("single-e"), d1 = c.ans("single-d1"), d0 = c.ans("single-d0");
        if (brFits(e, 0.5) && brFits(d0, 0.5) && brFits(d1, 0)) return brGrade(false, "Those are the numbers with no bomb interfering. The bomb removes the lower path, so nothing cancels at D1.");
        return brGrade(brFits(e, 0.5) && brFits(d1, 0.25) && brFits(d0, 0.25), "Your three numbers should add to 1. Split the photon at splitter 1, then at splitter 2.",
          "P(explode) = 1/2. The other half reach splitter 2 on the upper path alone, with nothing to interfere with, so P(D0) = P(D1) = 1/4. A D1 click is impossible without the bomb, so it proves the bomb is live, yet that photon went the other way.");
      }],
      dud: ["A dud lets the photon pass as if the arm were empty.", "With both paths open, the tuned interferometer keeps D1 dark.", c => {
        const pick = c.choice("dud-pick");
        return brGrade(pick === "live", "Set the lower arm to dud and send photons. Does D1 ever click?",
          "With a dud, both paths stay open and interfere, so D1 stays dark. A D1 click only happens with a live bomb, and in that run the photon did not reach the bomb, because if it had, the bomb would have exploded. This is the Elitzur–Vaidman interaction-free measurement.");
      }],
      twice: ["The first run must be inconclusive (D0), and the second must be D1.", "Runs are independent, so multiply.", c => {
        const v = c.ans("twice-p");
        return brGrade(brFits(v, 1 / 16), "Multiply P(D0) by P(D1).",
          "P(D0 first) × P(D1 second) = 1/4 × 1/4 = 1/16.");
      }],
      repeat: ["Each run ends the test with D1 (1/4) or an explosion (1/2), or repeats on D0 (1/4).", "Only the runs that end the test matter: compare 1/4 with 1/4 + 1/2.", c => {
        const v = c.ans("repeat-p");
        if (brFits(v, 1 / 4)) return brGrade(false, "1/4 is the chance for one run. Repeating inconclusive runs gives D1 more chances.");
        return brGrade(brFits(v, 1 / 3), "Add 1/4 + (1/4)(1/4) + (1/4)²(1/4) + …, or compare the two ways a test can end.",
          "P(D1 eventually) = 1/4 + 1/4 × 1/4 + (1/4)² × 1/4 + … = (1/4)/(1 − 1/4) = 1/3, and P(explode eventually) = 2/3. Test 100 live bombs to see roughly a third flagged safely. Other splitter ratios can push the safe fraction toward 1/2.");
      }]
    }
  },
};

// ---------------------------------------------------------------------------
// Arcade engine: station switching, missions, hints, progress, motion and drawing.
// ---------------------------------------------------------------------------

function brPalette(root) {
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

function initializeMeasurementArcade(root) {
  const details = root.querySelector("#measurement-arcade");
  if (!details) return;
  const get = id => root.querySelector("#br-" + id);
  const select = get("station"), resetButton = get("reset"), status = get("status");
  const reducedBox = get("reduced"), progress = get("progress");
  const figure = get("figure-template").content.firstElementChild.cloneNode(true);
  const toolTemplate = get("mission-template");
  const viewport = figure.querySelector("#br-viewport");
  const canvas = figure.querySelector("#br-canvas");
  const geometry = figure.querySelector("[data-br-geometry]");
  const labelLayer = figure.querySelector("[data-br-labels]");
  const desc = figure.querySelector("#br-desc");
  const title = figure.querySelector("#br-title");
  const renderStatus = figure.querySelector("#br-render-status");
  const colors = brPalette(root);
  const lifetime = new AbortController();
  const listen = (node, type, handler, options = {}) =>
    node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
  const panels = new Map(), cards = new Map(), completion = new Set();
  let active = null, plan = null;
  let graphics = null, loading = false, failed = false, contextLost = false, disposed = false;
  let frame = null, motionFrame = null, lastTick = null, drag = null, glide = null;

  const say = message => brSetText(status, message ?? "");
  const updateProgress = () => brSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

  for (const panel of root.querySelectorAll("#br-panels [data-br-station]")) {
    const key = panel.dataset.brStation;
    const spec = brStations[key];
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
        const value = brParse(input.value);
        if (value === null) throw new BrFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2 or 1/√2.", true);
        return value;
      },
      quiet: name => brParse(field(name).value),
      cx: prefix => [c.ans(prefix + "-re"), c.ans(prefix + "-im")],
      // A complex value for drawing only; null while either box is blank or mid-edit.
      quietCx(prefix) {
        const re = c.quiet(prefix + "-re"), im = c.quiet(prefix + "-im");
        return re === null || im === null ? null : [re, im];
      },
      choice(name) {
        const input = field(name);
        if (!input.value) throw new BrFieldError(input, "Choose an option.");
        return input.value;
      },
      set(name, value) { field(name).value = String(value); },
      put(name, text) { brSetText(c.node('[data-br-read="' + name + '"]'), text); },
      list(name, lines) {
        const list = c.node('[data-br-log="' + name + '"]');
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
    for (const card of panel.querySelectorAll("[data-br-mission]")) {
      const id = card.dataset.brMission, check = id.slice(key.length + 1);
      if (!spec.checks[check]) continue;
      card.append(toolTemplate.content.cloneNode(true));
      c.cards.set(check, card);
      cards.set(id, { card, check, id, hints: 0, station: c });
      listen(card, "toggle", () => { if (active === c) refresh(); });
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
    brSetText(renderStatus, message);
  }

  function refresh() {
    if (!active || !details.open) return;
    plan = active.spec.show(active);
    for (const output of active.panel.querySelectorAll("output[data-br-for]")) {
      const value = active.val(output.dataset.brFor);
      brSetText(output, "brAngle" in output.dataset
        ? brAngleText(Number(value))
        : value.replace("-", "−") + (output.dataset.brUnit ?? ""));
    }
    brSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
    brSetText(desc, plan.desc || "");
    if (plan.sphere) {
      const target = brBlochPoint(plan.sphere.marker);
      if (!glide) glide = { from: target, to: target, start: 0, point: target };
      else if (glide.to.some((n, i) => n !== target[i])) {
        glide = { from: glide.point, to: target, start: performance.now(), point: glide.point };
        if (reduced() || !onScreen()) glide = { from: target, to: target, start: 0, point: target };
      }
    }
    if ((plan.sphere || plan.bench) && !graphics && !loading && !failed) loadGraphics();
    draw();
    requestMotion();
  }

  function draw() {
    if (!plan) return;
    if (plan.sphere && glide) {
      const t = glide.start ? Math.min(1, (performance.now() - glide.start) / 360) : 1;
      const ease = t * t * (3 - 2 * t);
      const mix = glide.from.map((n, i) => n + (glide.to[i] - n) * ease);
      const size = Math.hypot(...mix);
      glide.point = size > 1e-6 ? mix.map(n => n / size) : glide.to;
      if (t < 1) requestFrame();
    }
    const kind = plan.sphere ? "sphere" : plan.bench ? "bench" : null;
    const view = plan.sphere ? { ...plan.sphere, shown: glide?.point } : plan.bench ?? null;
    brPaintSvg(plan, geometry, labelLayer, view);
    if (!kind) {
      showSvg("SVG diagram.");
      return;
    }
    const noun = kind === "sphere" ? "sphere" : "bench";
    if (!graphics || contextLost) {
      if (!loading) showSvg(failed
        ? "Three.js is unavailable here, so the " + noun + " uses the SVG view. Use the view sliders to turn it."
        : "SVG view of the " + noun + ". Use the view sliders or drag to turn it.");
      return;
    }
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    try {
      graphics.draw(kind, view, width, height, reduced());
      canvas.hidden = false;
      viewport.dataset.renderer = "webgl";
      brSetText(renderStatus, "Three.js 3D view. Drag the " + noun + " or use the view sliders to turn it.");
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
      graphics = brCreateGraphics(THREE, canvas, colors);
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
    active.node("[data-br-plot-slot]").append(figure);
    viewport.dataset.space = active.spec.drag ? "true" : "false";
    glide = null;
    lastTick = null;
    refresh();
  }

  function clearCard(card) {
    brSetText(card.querySelector("[data-br-feedback]"), "");
    const work = card.querySelector("[data-br-work]");
    work.hidden = true;
    work.open = false;
  }

  function showGrade(mission, result) {
    const { card, id, check, station } = mission;
    const work = card.querySelector("[data-br-work]");
    brSetText(card.querySelector("[data-br-feedback]"),
      result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
    brSetText(card.querySelector("[data-br-work-text]"), result.work || "");
    work.hidden = !result.work;
    work.open = Boolean(result.work) && !result.pass;
    if (result.pass) station.s.revealed[check] = true;
    if (result.pass && !completion.has(id)) {
      completion.add(id);
      card.querySelector("[data-br-done]").hidden = false;
      updateProgress();
    }
    say("");
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !active || !active.panel.contains(button) || button.disabled) return;
    const missionCard = button.closest("[data-br-mission]");
    const mission = missionCard ? cards.get(missionCard.dataset.brMission) : null;
    const action = button.dataset.brAction;
    try {
      if (action) {
        const message = active.spec.actions[action](active, mission?.check ?? null);
        if (mission) brSetText(mission.card.querySelector("[data-br-feedback]"), message ?? "");
        else if (message !== null) say(message);
      } else if (mission && button.hasAttribute("data-br-check")) {
        showGrade(mission, active.spec.checks[mission.check][2](active));
      } else if (mission && button.hasAttribute("data-br-hint")) {
        if (mission.hints >= 2) return;
        const list = mission.card.querySelector("[data-br-hint-list]");
        const item = document.createElement("li");
        brSetText(item, active.spec.checks[mission.check][mission.hints]);
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
      if (!(error instanceof BrFieldError)) throw error;
      if (mission) brSetText(mission.card.querySelector("[data-br-feedback]"), error.message);
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
    const missionCard = target.closest("[data-br-mission]");
    if (missionCard) clearCard(missionCard);
    active.spec.edit?.(active, target.name, event.type);
    refresh();
  }

  // Drag to turn a 3D view.
  listen(viewport, "pointerdown", event => {
    if (!active?.spec.drag || event.button > 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
    try { viewport.setPointerCapture?.(event.pointerId); } catch { /* Capture is optional. */ }
  });
  listen(viewport, "pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    active.spec.drag(active, dx, drag.touch ? 0 : dy);
    refresh();
  });
  const endDrag = event => { if (drag && event.pointerId === drag.id) drag = null; };
  listen(viewport, "pointerup", endDrag);
  listen(viewport, "pointercancel", endDrag);

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
    glide = null;
    say("Station settings reset. Completed missions stay counted for this session.");
    refresh();
  });
  const settle = () => {
    if (glide) glide = { from: glide.to, to: glide.to, start: 0, point: glide.to };
    active?.spec.settle?.(active);
    refresh();
  };
  listen(reducedBox, "change", settle);
  if (motionQuery?.addEventListener) listen(motionQuery, "change", settle);
  listen(root.querySelector("#br-arcade-link"), "click", () => { details.open = true; });

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
  if (location.hash === "#measurement-arcade") details.open = true;
}

// ---------------------------------------------------------------------------
// SVG drawing. The viewBox is 560 × 300 and labels always stay in SVG.
// ---------------------------------------------------------------------------

function brNode(name, attributes = {}, text = "") {
  const node = document.createElementNS(BR_SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  if (text) node.textContent = text;
  return node;
}

function brPaintSvg(plan, geometry, labels, view) {
  const shapes = [], words = [];
  if (plan.panels) brDrawPanels(plan.panels, shapes, words);
  if (plan.sphere && view) brDrawSphere(view, shapes, words);
  if (plan.bench) brDrawBench(plan.bench, shapes, words);
  geometry.replaceChildren(...shapes);
  labels.replaceChildren(...words);
}

function brDrawPanels(panels, shapes, words) {
  const total = panels.reduce((sum, panel) => sum + (panel.weight ?? 1), 0);
  let x = 0;
  for (const panel of panels) {
    const box = { x, w: 560 * (panel.weight ?? 1) / total };
    if (panel.kind === "plane") brDrawPlane(panel, box, shapes, words);
    else if (panel.kind === "chart") brDrawChart(panel, box, shapes, words);
    else if (panel.kind === "bars") brDrawBars(panel, box, shapes, words);
    else if (panel.kind === "stack") brDrawStack(panel, box, shapes, words);
    else if (panel.kind === "chain") brDrawChain(panel, box, shapes, words);
    x += box.w;
  }
}

// A row of polarizers. Each disc shows its transmission axis; the beam between
// discs gets thinner as the light that is still passing drops.
function brDrawStack(stack, box, shapes, words) {
  const n = stack.angles.length, left = box.x + 30, right = box.x + box.w - 20, cy = 150;
  const gap = (right - left) / Math.max(1, n), r = Math.min(30, gap * 0.4);
  words.push(brNode("text", { class: "br-caption", x: (left + right) / 2, y: 40, "text-anchor": "middle" }, stack.caption));
  let x = left, level = 1;
  for (let k = 0; k <= n; k++) {
    const next = k < n ? left + gap * (k + 0.5) : right;
    if (level > 0.0005) {
      shapes.push(brNode("line", { class: "br-beam", "data-tone": k ? "plus" : "angle", x1: x, y1: cy, x2: next - (k < n ? r : 0), y2: cy,
        "stroke-width": (1.5 + 8 * level).toFixed(1), "stroke-opacity": (0.35 + 0.65 * level).toFixed(2) }));
    }
    if (k === n) break;
    const angle = stack.angles[k];
    shapes.push(brNode("circle", { class: "br-ring br-disc", "data-tone": "guide", cx: next, cy, r }));
    const [dx, dy] = brPolar(r * 0.85, angle);
    shapes.push(brNode("line", { class: "br-arrow", "data-tone": "minus", x1: next - dx, y1: cy + dy, x2: next + dx, y2: cy - dy }));
    level = stack.levels[k];
    if (n <= 6 || k % 2 === 0 || k === n - 1) {
      words.push(brNode("text", { class: "br-tick", x: next, y: cy - r - 10, "text-anchor": "middle" }, brFmt(angle) + "°"));
      words.push(brNode("text", { class: "br-label", "data-tone": "plus", x: next, y: cy + r + 22, "text-anchor": "middle" }, brFmt(Math.round(level * 1000) / 1000)));
    }
    x = next + r;
  }
  words.push(brNode("text", { class: "br-tick", x: left, y: 262, "text-anchor": "start" }, "light in: |H⟩ = |0⟩"));
  words.push(brNode("text", { class: "br-tick", x: right, y: 262, "text-anchor": "end" }, "passes: " + brFmt(level)));
}

// Boxes joined by arrows: a preparation, then measurement stages, each with a line of detail.
function brDrawChain(chain, box, shapes, words) {
  const n = chain.items.length, left = box.x + 10, right = box.x + box.w - 10;
  const slot = (right - left) / n, w = Math.min(slot - 22, 120), cy = 140, h = 74;
  words.push(brNode("text", { class: "br-caption", x: (left + right) / 2, y: 40, "text-anchor": "middle" }, chain.caption));
  chain.items.forEach((item, k) => {
    const cx = left + slot * (k + 0.5);
    shapes.push(brNode("rect", { class: "br-part", "data-tone": item.tone, x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 7 }));
    words.push(brNode("text", { class: "br-label", "data-tone": item.tone, x: cx, y: cy - 8, "text-anchor": "middle" }, item.title));
    if (item.sub) words.push(brNode("text", { class: "br-tick", x: cx, y: cy + 16, "text-anchor": "middle" }, item.sub));
    if (item.below) words.push(brNode("text", { class: "br-label", "data-tone": item.belowTone ?? "plus", x: cx, y: cy + h / 2 + 26, "text-anchor": "middle" }, item.below));
    if (k < n - 1) {
      const x1 = cx + w / 2 + 3, x2 = cx + slot - w / 2 - 5;
      shapes.push(brNode("line", { class: "br-arrow" + (item.dashedAfter ? " br-dashed" : ""), "data-tone": "guide", x1, y1: cy, x2: x2 - 6, y2: cy }));
      shapes.push(brNode("polygon", { class: "br-head", "data-tone": "guide", points: x2 + "," + cy + " " + (x2 - 8) + "," + (cy - 5) + " " + (x2 - 8) + "," + (cy + 5) }));
    }
  });
  if (chain.note) words.push(brNode("text", { class: "br-tick", x: (left + right) / 2, y: 270, "text-anchor": "middle" }, chain.note));
}

function brLabel(words, text, x, y, tone, anchor = "middle", extra = {}) {
  // Keep the whole label inside the 560-wide viewBox (about 8.5 px per character).
  const span = text.length * 8.5;
  const left = anchor === "start" ? x : anchor === "end" ? x - span : x - span / 2;
  if (left + span > 556) { x = 556; anchor = "end"; }
  else if (left < 4) { x = 4; anchor = "start"; }
  words.push(brNode("text", { class: "br-label", "data-tone": tone, x, y, "text-anchor": anchor, ...extra }, text));
}

function brDrawPlane(plane, box, shapes, words) {
  const size = Math.min(box.w - 20, 238), half = size / 2, cx = box.x + box.w / 2, cy = 166;
  const limit = plane.limit ?? 1, unit = (half - 10) / limit;
  const X = re => cx + re * unit, Y = im => cy - im * unit;
  shapes.push(brNode("rect", { class: "br-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
  const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
  let grid = "";
  for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
    if (k === 0) continue;
    const v = k * step;
    grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
  }
  shapes.push(brNode("path", { class: "br-grid", d: grid }));
  shapes.push(brNode("path", { class: "br-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
  if (size > 150) {
    words.push(brNode("text", { class: "br-tick", x: X(limit) - 2, y: cy + 14, "text-anchor": "end" }, plane.axes?.[0] ?? "Re"));
    words.push(brNode("text", { class: "br-tick", x: cx + 5, y: Y(limit) + 10, "text-anchor": "start" }, plane.axes?.[1] ?? "Im"));
  }
  words.push(brNode("text", { class: "br-caption", "data-tone": plane.tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
  const rings = [...(plane.circle ? [{ c: [0, 0], r: plane.circle, tone: "guide" }] : []), ...(plane.circles ?? [])];
  for (const ring of rings) {
    if (ring.r > 0) shapes.push(brNode("circle", { class: "br-ring", "data-tone": ring.tone ?? "guide", cx: X(ring.c[0]), cy: Y(ring.c[1]), r: ring.r * unit }));
  }
  for (const ray of plane.rays ?? []) {
    const end = brPolar(limit * 1.05, ray.angle);
    const start = ray.through ? brScale(end, -1) : [0, 0];
    shapes.push(brNode("line", { class: "br-ray" + (ray.solid ? " br-solid" : ""), "data-tone": ray.tone ?? "angle",
      x1: X(start[0]), y1: Y(start[1]), x2: X(end[0]), y2: Y(end[1]) }));
  }
  for (const mark of plane.marks ?? []) {
    // Inside the circle and just off the ray, so marks never sit on the axis labels.
    const [mx, my] = brPolar(limit * 0.6, mark.angle + 12);
    brLabel(words, mark.label, X(mx), Y(my) + 5, mark.tone, "middle");
  }
  for (const path of plane.paths ?? []) {
    shapes.push(brNode("polyline", { class: "br-curve" + (path.dashed ? " br-dashed" : ""), "data-tone": path.tone,
      points: path.pts.map(([re, im]) => X(re).toFixed(1) + "," + Y(im).toFixed(1)).join(" ") }));
  }
  for (const item of plane.items) {
    const from = item.from ?? [0, 0];
    const fx = X(from[0]), fy = Y(from[1]);
    const [re, im] = brAdd(from, item.z);
    const reach = Math.max(Math.abs(re), Math.abs(im));
    const clip = reach > limit ? limit / reach : 1;
    const ex = X(re * clip), ey = Y(im * clip);
    const length = Math.hypot(ex - fx, ey - fy);
    if (item.dot || length < 3) {
      shapes.push(brNode("circle", { class: "br-dot" + (item.hollow || length < 3 ? " br-hollow" : ""), "data-tone": item.tone, cx: ex, cy: ey, r: item.dot ? item.size ?? 4.5 : 5 }));
    } else {
      const ux = (ex - fx) / length, uy = (ey - fy) / length, depth = Math.min(13, length * 0.6), wing = depth * 0.42;
      const bx = ex - ux * depth, by = ey - uy * depth;
      shapes.push(brNode("line", { class: "br-arrow" + (item.dashed ? " br-dashed" : "") + (item.wide ? " br-wide" : ""), "data-tone": item.tone, x1: fx, y1: fy, x2: bx, y2: by }));
      shapes.push(brNode("polygon", { class: "br-head" + (item.dashed ? " br-hollow" : ""), "data-tone": item.tone,
        points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
    }
    if (item.label) {
      // Past the tip and a little to one side, so a label never hides an arrow along the same line.
      const ux = (ex - fx) / (length || 1), uy = (ey - fy) / (length || 1);
      const away = length < 3 ? [10, -10] : [ux * 12 + uy * 9, uy * 12 - ux * 9];
      const anchor = Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end";
      brLabel(words, item.label + (clip < 1 ? " (off scale)" : ""), ex + away[0], ey + away[1] + 4, item.tone, anchor);
    }
  }
}

function brDrawChart(chart, box, shapes, words) {
  const left = box.x + 46, right = box.x + box.w - 16, top = 40, bottom = 246;
  const [x0, x1] = chart.x, [y0, y1] = chart.y;
  const X = v => left + (v - x0) / (x1 - x0) * (right - left);
  const Y = v => bottom - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0) * (bottom - top);
  shapes.push(brNode("rect", { class: "br-frame", x: left, y: top, width: right - left, height: bottom - top }));
  let grid = "";
  for (const v of chart.xTicks) grid += "M" + X(v) + " " + top + "V" + bottom;
  for (const v of chart.yTicks) grid += "M" + left + " " + Y(v) + "H" + right;
  shapes.push(brNode("path", { class: "br-grid", d: grid }));
  const zeroY = y0 < 0 && y1 > 0 ? Y(0) : bottom;
  shapes.push(brNode("path", { class: "br-axis", d: "M" + left + " " + top + "V" + bottom + "M" + left + " " + zeroY + "H" + right }));
  const every = Math.max(1, Math.ceil(chart.xTicks.length * 34 / (right - left)));
  chart.xTicks.forEach((v, k) => {
    if (k % every === 0) words.push(brNode("text", { class: "br-tick", x: X(v), y: bottom + 16, "text-anchor": "middle" }, chart.xTickText?.[k] ?? brFmt(v)));
  });
  for (const v of chart.yTicks) words.push(brNode("text", { class: "br-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, brFmt(v)));
  words.push(brNode("text", { class: "br-tick", x: (left + right) / 2, y: bottom + 36, "text-anchor": "middle" }, chart.xLabel));
  words.push(brNode("text", { class: "br-caption", x: (left + right) / 2, y: top - 12, "text-anchor": "middle" }, chart.caption));
  for (const h of chart.hlines ?? []) {
    shapes.push(brNode("line", { class: "br-ray", "data-tone": h.tone ?? "angle", x1: left, y1: Y(h.y), x2: right, y2: Y(h.y) }));
    if (h.label) brLabel(words, h.label, right - 4, Y(h.y) - 6, h.tone ?? "angle", "end");
  }
  for (const v of chart.vlines ?? []) {
    shapes.push(brNode("line", { class: "br-ray br-solid", "data-tone": v.tone ?? "angle", x1: X(v.x), y1: top, x2: X(v.x), y2: bottom }));
  }
  for (const series of chart.series ?? []) {
    shapes.push(brNode("polyline", { class: "br-curve" + (series.dashed ? " br-dashed" : "") + (series.dotted ? " br-dotted" : ""), "data-tone": series.tone,
      points: series.pts.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join(" ") }));
    if (series.label) {
      const [lx, ly] = series.labelAt ?? series.pts.at(-1);
      brLabel(words, series.label, X(lx) + (series.labelDx ?? 6), Y(ly) + (series.labelDy ?? -6), series.tone, series.labelAnchor ?? "start");
    }
  }
  for (const dot of chart.dots ?? []) {
    shapes.push(brNode("circle", { class: "br-dot" + (dot.hollow ? " br-hollow" : ""), "data-tone": dot.tone, cx: X(dot.x), cy: Y(dot.y), r: dot.r ?? 5 }));
    if (dot.label) brLabel(words, dot.label, X(dot.x) + 8, Y(dot.y) - 8, dot.tone, "start");
  }
}

function brDrawBars(bars, box, shapes, words) {
  const left = box.x + 40, right = box.x + box.w - 10, top = 48, bottom = 246, max = bars.max ?? 1;
  const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
  let grid = "";
  for (const v of [0, max / 2, max]) {
    grid += "M" + left + " " + Y(v) + "H" + right;
    words.push(brNode("text", { class: "br-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, brFmt(v)));
  }
  shapes.push(brNode("path", { class: "br-grid", d: grid }));
  shapes.push(brNode("path", { class: "br-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
  words.push(brNode("text", { class: "br-caption", x: (left + right) / 2, y: top - 22, "text-anchor": "middle" }, bars.caption));
  const slot = (right - left) / bars.items.length;
  bars.items.forEach((bar, index) => {
    const x = left + slot * index + slot * 0.2, w = slot * 0.6, y = Y(bar.value);
    shapes.push(brNode("rect", { class: "br-bar" + (bar.outline ? " br-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: Math.max(0, bottom - y) }));
    if (bar.target !== undefined) {
      shapes.push(brNode("line", { class: "br-ray br-solid", "data-tone": "angle", x1: x - 4, y1: Y(bar.target), x2: x + w + 4, y2: Y(bar.target) }));
    }
    words.push(brNode("text", { class: "br-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 20, "text-anchor": "middle" }, bar.label));
    words.push(brNode("text", { class: "br-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top - 4, y - 8), "text-anchor": "middle" }, bar.text ?? brFmt(bar.value)));
  });
}

// ---------------------------------------------------------------------------
// 3D views. World coordinates have z up. The view turns by yaw about z and
// tilts by an elevation angle; the SVG fallback and Three.js share brFrame,
// so SVG labels line up with the WebGL picture.
// ---------------------------------------------------------------------------

const BR_VIEW = { cx: 280, cy: 152 };
const BR_BLOCH_R = 112;
const BR_BENCH_SCALE = 78;

function brFrame(yaw, tilt) {
  const y = yaw * Math.PI / 180, t = tilt * Math.PI / 180;
  return {
    right: [-Math.sin(y), Math.cos(y), 0],
    up: [-Math.sin(t) * Math.cos(y), -Math.sin(t) * Math.sin(y), Math.cos(t)],
    toward: [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)]
  };
}
const brDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const brProject = (frame, point, scale) => ({
  x: BR_VIEW.cx + scale * brDot3(frame.right, point),
  y: BR_VIEW.cy - scale * brDot3(frame.up, point),
  depth: brDot3(frame.toward, point)
});
// The bench is seen from the −y side: turn 0 means yaw −90°.
const brBenchFrame = view => brFrame(-90 + view.turn, view.tilt);

function brBlochPoint({ polar, azimuth }) {
  const t = polar * Math.PI / 180, p = azimuth * Math.PI / 180;
  return [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
}

function brDrawSphere(view, shapes, words) {
  const frame = brFrame(view.yaw, view.tilt);
  const P = point => brProject(frame, point, BR_BLOCH_R);
  shapes.push(brNode("circle", { class: "br-sphere", cx: BR_VIEW.cx, cy: BR_VIEW.cy, r: BR_BLOCH_R }));
  const circles = [t => [Math.cos(t), Math.sin(t), 0], t => [Math.cos(t), 0, Math.sin(t)], t => [0, Math.cos(t), Math.sin(t)]];
  for (const curve of circles) {
    let front = "", back = "", last = null;
    for (let k = 0; k <= 96; k++) {
      const q = P(curve(k / 96 * Math.PI * 2));
      const side = q.depth >= 0 ? "front" : "back";
      const move = (last === side ? "L" : "M") + q.x.toFixed(1) + " " + q.y.toFixed(1);
      if (side === "front") front += move; else back += move;
      last = side;
    }
    shapes.push(brNode("path", { class: "br-wire", d: front }));
    shapes.push(brNode("path", { class: "br-wire br-back", d: back }));
  }
  const axes = [[[0, 0, 1], "|0⟩"], [[0, 0, -1], "|1⟩"], [[1, 0, 0], "|+⟩"], [[-1, 0, 0], "|−⟩"], [[0, 1, 0], "|+i⟩"], [[0, -1, 0], "|−i⟩"]];
  for (const [direction, name] of axes) {
    const end = P(direction.map(n => n * 1.18)), start = P([0, 0, 0]);
    shapes.push(brNode("line", { class: "br-axis" + (end.depth < -0.05 ? " br-back" : ""), x1: start.x, y1: start.y, x2: end.x, y2: end.y }));
    const tag = P(direction.map(n => n * 1.34));
    words.push(brNode("text", { class: "br-tick" + (tag.depth < -0.05 ? " br-back" : ""), x: tag.x, y: tag.y + 4, "text-anchor": "middle" }, name));
  }
  if (view.axis) {
    // The measurement axis runs through the centre; its two ends are the two outcomes.
    const up = view.axis, a = P(up.map(n => n * 1.22)), b = P(up.map(n => -n * 1.22));
    shapes.push(brNode("line", { class: "br-arrow br-wide", "data-tone": "angle", x1: b.x, y1: b.y, x2: a.x, y2: a.y }));
    const ta = P(up.map(n => n * 1.05)), tb = P(up.map(n => -n * 1.05));
    words.push(brNode("text", { class: "br-label", "data-tone": "angle", x: ta.x - 12, y: ta.y + 20, "text-anchor": "end" }, "a"));
    words.push(brNode("text", { class: "br-label", "data-tone": "minus", x: tb.x - 12, y: tb.y + 20, "text-anchor": "end" }, "a⊥"));
  }
  if (view.shown) {
    const q = P(view.shown), o = P([0, 0, 0]);
    shapes.push(brNode("line", { class: "br-arrow", "data-tone": "plus", x1: o.x, y1: o.y, x2: q.x, y2: q.y }));
  }
  const points = [...(view.points ?? [])];
  if (view.shown) points.push({ point: view.shown, tone: "plus", label: "|ψ⟩", size: 7 });
  points.sort((a, b) => P(a.point).depth - P(b.point).depth);
  for (const item of points) {
    const q = P(item.point);
    shapes.push(brNode("circle", { class: "br-dot" + (q.depth < -0.02 ? " br-back" : ""), "data-tone": item.tone, cx: q.x, cy: q.y, r: item.size ?? 4 }));
    if (item.label) {
      words.push(brNode("text", { class: "br-label" + (q.depth < -0.02 ? " br-back" : ""), "data-tone": item.tone, x: q.x + 11, y: q.y - 9, "text-anchor": "start" }, item.label));
    }
  }
}

// Bench parts as flat plates: [centre, half-width direction, half-width, height].
const BR_DIAG = [Math.SQRT1_2, Math.SQRT1_2];
function brBenchParts(m) {
  const B = BR_BENCH;
  return [
    { at: B.src, dir: [0, 1], w: 0.22, h: 0.4, tone: "angle", label: "source" },
    { at: B.bs1, dir: BR_DIAG, w: 0.3, h: 0.45, tone: "ink", label: "splitter 1", glass: true },
    { at: B.mu, dir: BR_DIAG, w: 0.3, h: 0.45, tone: "guide", label: "mirror" },
    { at: B.ml, dir: BR_DIAG, w: 0.3, h: 0.45, tone: "guide", label: "mirror" },
    { at: B.ps, dir: [0, 1], w: 0.24, h: 0.5, tone: "angle", label: "θ = " + brFmt(m.theta) + "°" },
    { at: B.bs2, dir: BR_DIAG, w: 0.3, h: 0.45, tone: "ink", label: "splitter 2", glass: true },
    ...(m.arm === "empty" ? [] : [{ at: B.bomb, dir: [0, 1], w: 0.26, h: 0.6, tone: m.arm === "live" ? "warn" : "guide",
      label: m.arm === "live" ? "live bomb" : "dud", glow: m.flash ? 1 : undefined }]),
    { at: B.d0, dir: [0, 1], w: 0.26, h: 0.55, tone: "plus", label: "D0 " + brFmt(m.p0), glow: m.p0 },
    { at: B.d1, dir: [1, 0], w: 0.26, h: 0.55, tone: "minus", label: "D1 " + brFmt(m.p1), glow: m.p1 }
  ];
}
const BR_BEAM_Z = 0.22;
// Dots drift along each lit beam to show light flowing; they stop under reduced effects.
function brBenchPhotons(beams, clock) {
  if (clock === null || clock === undefined) return [];
  const dots = [];
  for (const beam of beams) {
    if (beam.s < 0.01) continue;
    const length = Math.hypot(beam.b[0] - beam.a[0], beam.b[1] - beam.a[1]);
    const count = Math.max(1, Math.round(length * 2));
    for (let k = 0; k < count; k++) {
      const f = ((k / count) + clock * 0.45 / length) % 1;
      dots.push({ p: [beam.a[0] + (beam.b[0] - beam.a[0]) * f, beam.a[1] + (beam.b[1] - beam.a[1]) * f, BR_BEAM_Z], s: beam.s, out: beam.out });
    }
  }
  return dots;
}

function brDrawBench(view, shapes, words) {
  const frame = brBenchFrame(view);
  const P = point => brProject(frame, point, BR_BENCH_SCALE);
  const poly = points => points.map(p => { const q = P(p); return q.x.toFixed(1) + "," + q.y.toFixed(1); }).join(" ");
  shapes.push(brNode("polygon", { class: "br-table", points: poly([[-3, -1.9, 0], [3, -1.9, 0], [3, 1.75, 0], [-3, 1.75, 0]]) }));
  for (const beam of view.beams) {
    if (beam.s < 0.005) continue;
    const a = P([...beam.a, BR_BEAM_Z]), b = P([...beam.b, BR_BEAM_Z]);
    shapes.push(brNode("line", { class: "br-beam", "data-tone": beam.out ? "plus" : "angle", x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      "stroke-width": (1.5 + 6 * beam.s).toFixed(1), "stroke-opacity": (0.35 + 0.65 * beam.s).toFixed(2) }));
  }
  const parts = brBenchParts(view.model).sort((p, q) => P([...p.at, 0]).depth - P([...q.at, 0]).depth);
  for (const part of parts) {
    const [dx, dy] = part.dir, [x, y] = part.at, w = part.w, h = part.h;
    const corners = [[x - dx * w, y - dy * w, 0], [x + dx * w, y + dy * w, 0], [x + dx * w, y + dy * w, h], [x - dx * w, y - dy * w, h]];
    shapes.push(brNode("polygon", { class: "br-part", "data-tone": part.tone, points: poly(corners),
      "fill-opacity": part.glow !== undefined ? (0.25 + 0.75 * part.glow).toFixed(2) : null }));
    const tag = P([x, y, h + 0.25]);
    brLabel(words, part.label, tag.x, tag.y, part.tone);
  }
  for (const dot of brBenchPhotons(view.beams, view.clock)) {
    const q = P(dot.p);
    shapes.push(brNode("circle", { class: "br-dot", "data-tone": dot.out ? "plus" : "angle", cx: q.x, cy: q.y, r: (1.6 + 2.4 * dot.s).toFixed(1) }));
  }
}

// One WebGL renderer for both 3D stations; each scene is built the first time it is drawn.
function brCreateGraphics(THREE, canvas, colors) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const camera = new THREE.OrthographicCamera(-BR_VIEW.cx, 560 - BR_VIEW.cx, BR_VIEW.cy, BR_VIEW.cy - 300, 1, 2000);
  camera.position.set(0, 0, 800);
  camera.lookAt(0, 0, 0);
  const disposables = [];
  const keep = item => { disposables.push(item); return item; };
  const materials = new Map();
  const basic = tone => {
    const key = "basic-" + tone;
    if (!materials.has(key)) materials.set(key, keep(new THREE.MeshBasicMaterial({ color: colors[tone] ?? colors.plus })));
    return materials.get(key);
  };
  const scenes = {};

  function lit(scene) {
    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-300, 400, 600);
    scene.add(sun);
  }
  function place(group, scale, frame) {
    group.matrix.set(
      scale * frame.right[0], scale * frame.right[1], scale * frame.right[2], 0,
      scale * frame.up[0], scale * frame.up[1], scale * frame.up[2], 0,
      scale * frame.toward[0], scale * frame.toward[1], scale * frame.toward[2], 0,
      0, 0, 0, 1);
    group.matrixWorldNeedsUpdate = true;
  }
  function pool(group, geometry) {
    const meshes = [];
    return (count, each) => {
      while (meshes.length < count) {
        const mesh = new THREE.Mesh(geometry, basic("plus"));
        group.add(mesh);
        meshes.push(mesh);
      }
      meshes.forEach((mesh, k) => {
        mesh.visible = k < count;
        if (k < count) each(mesh, k);
      });
    };
  }

  function buildSphere() {
    const scene = new THREE.Scene();
    lit(scene);
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    scene.add(group);
    group.add(new THREE.Mesh(keep(new THREE.SphereGeometry(1, 48, 32)),
      keep(new THREE.MeshLambertMaterial({ color: colors.sphere, transparent: true, opacity: 0.32, depthWrite: false }))));
    const wire = keep(new THREE.LineBasicMaterial({ color: colors.axis, transparent: true, opacity: 0.55 }));
    const ring = keep(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, k) => {
      const t = k / 96 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
    })));
    for (const turn of [[0, 0, 0], [Math.PI / 2, 0, 0], [Math.PI / 2, 0, Math.PI / 2]]) {
      const loop = new THREE.Line(ring, wire);
      loop.rotation.set(...turn, "ZYX");
      group.add(loop);
    }
    group.add(new THREE.LineSegments(keep(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.18, 0, 0), new THREE.Vector3(1.18, 0, 0), new THREE.Vector3(0, -1.18, 0),
      new THREE.Vector3(0, 1.18, 0), new THREE.Vector3(0, 0, -1.18), new THREE.Vector3(0, 0, 1.18)])),
    keep(new THREE.LineBasicMaterial({ color: colors.axis }))));
    const stemGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]));
    const stem = new THREE.Line(stemGeometry, keep(new THREE.LineBasicMaterial({ color: colors.plus })));
    group.add(stem);
    const axisGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1)]));
    const axisLine = new THREE.Line(axisGeometry, keep(new THREE.LineBasicMaterial({ color: colors.angle })));
    group.add(axisLine);
    const dots = pool(group, keep(new THREE.SphereGeometry(1, 20, 14)));
    return {
      draw(view) {
        place(group, BR_BLOCH_R, brFrame(view.yaw, view.tilt));
        const points = [...(view.points ?? [])];
        if (view.shown) points.push({ point: view.shown, tone: "plus", size: 7 });
        stem.visible = Boolean(view.shown);
        axisLine.visible = Boolean(view.axis);
        if (view.axis) {
          axisGeometry.setFromPoints([new THREE.Vector3(...view.axis.map(n => -n * 1.22)), new THREE.Vector3(...view.axis.map(n => n * 1.22))]);
          points.push({ point: view.axis, tone: "angle", size: 5 }, { point: view.axis.map(n => -n), tone: "minus", size: 5 });
        }
        if (view.shown) stemGeometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...view.shown)]);
        dots(points.length, (mesh, k) => {
          mesh.material = basic(points[k].tone);
          mesh.position.set(...points[k].point);
          mesh.scale.setScalar((points[k].size ?? 4) / BR_BLOCH_R);
        });
        renderer.render(scene, camera);
      }
    };
  }

  function buildBench() {
    const scene = new THREE.Scene();
    lit(scene);
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    scene.add(group);
    const table = new THREE.Mesh(keep(new THREE.BoxGeometry(6, 3.65, 0.06)), keep(new THREE.MeshLambertMaterial({ color: colors.table })));
    table.position.set(0, -0.075, -0.03);
    group.add(table);
    const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));
    const beamGeometry = keep(new THREE.CylinderGeometry(1, 1, 1, 12));
    const glass = keep(new THREE.MeshLambertMaterial({ color: colors.glass, transparent: true, opacity: 0.45, depthWrite: false }));
    const lambert = new Map();
    const solid = (tone, glow = null) => {
      const key = tone + (glow === null ? "" : ":" + glow.toFixed(2));
      if (!lambert.has(key)) {
        const color = new THREE.Color(colors[tone] ?? colors.plus);
        lambert.set(key, keep(new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow === null ? 0.15 : 0.1 + 0.9 * glow })));
      }
      return lambert.get(key);
    };
    const beamMaterial = new Map();
    const beamLook = (tone, s) => {
      const key = tone + ":" + s.toFixed(2);
      if (!beamMaterial.has(key)) beamMaterial.set(key, keep(new THREE.MeshBasicMaterial({ color: colors[tone], transparent: true, opacity: 0.35 + 0.6 * s })));
      return beamMaterial.get(key);
    };
    const plates = pool(group, unitBox);
    const beams = pool(group, beamGeometry);
    const photons = pool(group, keep(new THREE.SphereGeometry(1, 12, 8)));
    return {
      draw(view) {
        place(group, BR_BENCH_SCALE, brBenchFrame(view));
        const parts = brBenchParts(view.model);
        plates(parts.length, (mesh, k) => {
          const part = parts[k];
          mesh.material = part.glass ? glass : solid(part.tone, part.glow === undefined ? null : Math.round(part.glow * 20) / 20);
          mesh.position.set(part.at[0], part.at[1], part.h / 2);
          mesh.scale.set(part.w * 2, 0.05, part.h);
          mesh.rotation.set(0, 0, Math.atan2(part.dir[1], part.dir[0]));
        });
        const shining = view.beams.filter(beam => beam.s >= 0.005);
        beams(shining.length, (mesh, k) => {
          const beam = shining[k], dx = beam.b[0] - beam.a[0], dy = beam.b[1] - beam.a[1];
          mesh.material = beamLook(beam.out ? "plus" : "angle", Math.round(beam.s * 20) / 20);
          mesh.position.set((beam.a[0] + beam.b[0]) / 2, (beam.a[1] + beam.b[1]) / 2, BR_BEAM_Z);
          const r = 0.012 + 0.035 * beam.s;
          mesh.scale.set(r, Math.hypot(dx, dy), r);
          mesh.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
        });
        const dots = brBenchPhotons(view.beams, view.clock);
        photons(dots.length, (mesh, k) => {
          mesh.material = basic(dots[k].out ? "plus" : "angle");
          mesh.position.set(...dots[k].p);
          mesh.scale.setScalar((1.6 + 2.4 * dots[k].s) / BR_BENCH_SCALE);
        });
        renderer.render(scene, camera);
      }
    };
  }

  return {
    draw(kind, view, width, height, low) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
      renderer.setSize(width, height, false);
      scenes[kind] ??= kind === "sphere" ? buildSphere() : buildBench();
      scenes[kind].draw(view);
    },
    invalidate() { /* Geometry lives on the GPU only while drawing; nothing to rebuild. */ },
    dispose() {
      for (const item of disposables) item.dispose();
      renderer.dispose();
    }
  };
}

// The arcade is optional. If it fails to start, the Measurement Lab above keeps working.
if (lesson) {
  try {
    initializeMeasurementArcade(lesson);
  } catch (error) {
    console.error("Measurement Arcade could not start.", error);
  }
}
