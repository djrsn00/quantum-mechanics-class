const SVG_NS = "http://www.w3.org/2000/svg";
const UNIT_TOLERANCE = 1e-12;

const PRESETS = {
  "ket-zero": { label: "Basis ket zero", values: [1, 0, 0, 0] },
  "ket-one": { label: "Basis ket one", values: [0, 0, 1, 0] },
  opening: { label: "Opening candidate", values: [3, 0, 0, 4] },
  real: { label: "Real beta", values: [3 / 5, 0, 4 / 5, 0] },
  imaginary: { label: "Imaginary beta", values: [3 / 5, 0, 0, 4 / 5] },
  "zero-pair": { label: "Zero pair", values: [0, 0, 0, 0] }
};

const QUESTIONS = {
  normalize: {
    answer: "scale",
    correct: "Correct. Each squared magnitude is 1/4, so the squared norm is 1/2. Dividing both entries by the norm 1/√2 gives the stated pair.",
    retry: "Square each magnitude and add. Then take the square root before choosing the divisor."
  },
  interpret: {
    answer: "squared",
    correct: "Correct. The amplitude is 4i/5, its magnitude is 4/5, and the probability in this basis is (4/5)² = 16/25.",
    retry: "Find the magnitude of the coefficient of |1⟩ and square it. That last step converts the magnitude to a probability in this basis."
  }
};

function sameValues(first, second) {
  return first.every((value, index) => value === second[index]);
}

function displayNumber(value) {
  return String(Number(value.toPrecision(8))).replaceAll("-", "−");
}

function reading(value) {
  const shown = Number(value.toPrecision(8));
  const rounded = Math.abs(shown - value) > 8 * Number.EPSILON * Math.abs(value);
  return `${rounded ? "≈ " : ""}${displayNumber(value)}`;
}

function complexText([real, imaginary]) {
  if (imaginary === 0) return displayNumber(real);
  const magnitude = Math.abs(imaginary);
  const term = magnitude === 1 ? "i" : `${displayNumber(magnitude)}i`;
  if (real === 0) return imaginary < 0 ? `−${term}` : term;
  return `${displayNumber(real)} ${imaginary < 0 ? "−" : "+"} ${term}`;
}

function ketFactor(parts) {
  const text = complexText(parts);
  return parts[0] !== 0 && parts[1] !== 0 ? `(${text})` : text;
}

function analyze(values) {
  const [ar, ai, br, bi] = values;
  const alpha = [ar, ai];
  const beta = [br, bi];
  const alphaMagnitude = Math.hypot(...alpha);
  const betaMagnitude = Math.hypot(...beta);
  const alphaSquared = ar * ar + ai * ai;
  const betaSquared = br * br + bi * bi;
  const squared = alphaSquared + betaSquared;
  const norm = Math.hypot(...values);
  const kind = norm === 0 ? "zero" : Math.abs(norm - 1) <= UNIT_TOLERANCE ? "normalized" : "candidate";
  return { alpha, beta, alphaMagnitude, betaMagnitude, alphaSquared, betaSquared, squared, norm, kind };
}

function normalize(values) {
  const scale = Math.max(...values.map(Math.abs));
  if (scale === 0) return null;

  // Rescale before dividing so even very small nonzero coefficients can be normalized.
  const scaled = values.map(value => value / scale);
  const norm = Math.hypot(...scaled);
  return scaled.map(value => value / norm);
}

function squaredReading(magnitude, squared) {
  if (magnitude !== 0 && squared === 0) return "Less than 5e−324";
  return reading(squared);
}

function probabilityText(magnitude, squared) {
  if (magnitude === 3 / 5) return "9/25 (36%)";
  if (magnitude === 4 / 5) return "16/25 (64%)";
  if (magnitude !== 0 && squared === 0) return "Less than 5e−324";
  return `${reading(100 * squared)}%`;
}

function phaseText([real, imaginary], magnitude) {
  if (magnitude === 0) return "phase undefined at zero";

  let degrees = Math.atan2(imaginary, real) * 180 / Math.PI;
  if (degrees === -180) degrees = 180;
  return `phase ${degrees > 0 ? "+" : ""}${displayNumber(degrees)}°`;
}

function svgNode(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function diamond(x, y, radius) {
  return `${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`;
}

function drawArrow(group, [real, imaginary], { x, y, unit, shape }) {
  const dx = real * unit;
  const dy = -imaginary * unit;
  const length = Math.hypot(dx, dy);
  const endX = x + dx;
  const endY = y + dy;
  const zero = real === 0 && imaginary === 0;
  const marker = shape === "circle"
    ? svgNode("circle", { cx: endX, cy: endY, r: 5 })
    : svgNode("polygon", { points: diamond(endX, endY, 7) });

  if (zero) {
    marker.setAttribute("class", "state-zero-point");
    group.replaceChildren(marker);
    return;
  }

  const line = svgNode("line", { x1: x, y1: y, x2: endX, y2: endY });
  if (length < 9) {
    group.replaceChildren(line, marker);
    return;
  }

  const ux = dx / length;
  const uy = dy / length;
  const depth = Math.min(20, length * 0.72);
  const baseX = endX - ux * depth;
  const baseY = endY - uy * depth;
  const wing = depth * 0.35;
  const head = svgNode("polygon", {
    points: `${endX},${endY} ${baseX - uy * wing},${baseY + ux * wing} ${baseX + uy * wing},${baseY - ux * wing}`
  });
  group.replaceChildren(line, head, marker);
}

function makePlane(find, key, symbol, shape) {
  const svg = find(`${key}-plane`);
  const current = find(`${key}-current`);
  const before = find(`${key}-before`);
  const description = find(`${key}-plane-desc`);
  const summary = find(`${key}-plot-value`);
  const config = svg && {
    x: Number(svg.dataset.originX),
    y: Number(svg.dataset.originY),
    unit: Number(svg.dataset.unit),
    shape
  };

  return (parts, magnitude, previous) => {
    const valueText = `${symbol} = ${complexText(parts)} · magnitude ${reading(magnitude)} · ${phaseText(parts, magnitude)}`;
    summary.textContent = valueText;

    if (!svg || !current || !before) return;
    const beforeText = previous
      ? ` Dashed reference before normalization: ${complexText(previous)}. The plot scale is unchanged.`
      : "";
    if (description) {
      description.textContent = `${valueText}. ${shape === "circle" ? "Circle" : "Diamond"} marks the endpoint${magnitude === 0 ? " at the origin" : ""}.${beforeText}`;
    }

    try {
      drawArrow(current, parts, config);
      before.toggleAttribute("hidden", previous === null);
      if (previous) drawArrow(before, previous, config);
      else before.replaceChildren();
    } catch {
      svg.setAttribute("hidden", "");
    }
  };
}

function wireChallenge(find) {
  const form = find("challenge");
  const panels = [...form.querySelectorAll("[data-state-question]")];
  const next = find("challenge-next");
  const restart = find("challenge-restart");
  const feedback = find("challenge-feedback");
  let index = 0;

  function clearFeedback() {
    next.hidden = true;
    restart.hidden = true;
    feedback.textContent = "";
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

    const question = QUESTIONS[panel.dataset.stateQuestion];
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
    if (restart.hidden) return;
    form.reset();
    index = 0;
    showQuestion();
  });
}

function initializeLab(root) {
  const find = name => root.querySelector(`#state-${name}`);
  const write = (name, text) => { find(name).textContent = text; };
  const inputs = ["alpha-real", "alpha-imag", "beta-real", "beta-imag"].map(find);
  const presetButtons = [...root.querySelectorAll("[data-state-preset]")];
  const openingForm = find("opening-prediction");
  const status = find("status");
  const paintAlpha = makePlane(find, "alpha", "α", "circle");
  const paintBeta = makePlane(find, "beta", "β", "diamond");

  let values = [...PRESETS.opening.values];
  let previous = null;

  function syncInputs() {
    inputs.forEach((input, index) => {
      if (input.valueAsNumber !== values[index]) input.value = String(values[index]);
      input.removeAttribute("aria-invalid");
    });
  }

  function clearPrediction() {
    openingForm.reset();
    write("prediction-feedback", "");
  }

  function render() {
    const data = analyze(values);
    const normalized = data.kind === "normalized";
    const zero = data.kind === "zero";
    const negativeBeta = data.beta[0] < 0 || (data.beta[0] === 0 && data.beta[1] < 0);
    const betaFactor = negativeBeta ? data.beta.map(value => -value) : data.beta;

    status.dataset.status = data.kind;
    status.textContent = normalized ? "Normalized" : zero ? "Zero pair" : "Unnormalized candidate";
    write("ket-alpha", ketFactor(data.alpha));
    write("ket-sign", negativeBeta ? "−" : "+");
    write("ket-beta", ketFactor(betaFactor));
    write("column-alpha", complexText(data.alpha));
    write("column-beta", complexText(data.beta));

    const squared = squaredReading(data.norm, data.squared);
    const squares = values.map(value => `${value < 0 ? `(${displayNumber(value)})` : displayNumber(value)}²`);
    write("alpha-squared", squaredReading(data.alphaMagnitude, data.alphaSquared));
    write("beta-squared", squaredReading(data.betaMagnitude, data.betaSquared));
    write("norm-squared", squared);
    write("norm", reading(data.norm));

    const normSign = reading(data.norm).startsWith("≈") ? "≈" : "=";
    const normText = `‖ψ‖ ${normSign} ${displayNumber(data.norm)}.`;
    const sumSign = [squared, ...values.map(reading)].some(text => text.startsWith("≈")) ? "≈" : "=";
    write("norm-work", data.squared === 0 && !zero
      ? `‖ψ‖² < 5e−324. ${normText}`
      : `‖ψ‖² = ${squares.join(" + ")} ${sumSign} ${displayNumber(data.squared)}. Taking the square root gives ${normText}`);

    find("probabilities").hidden = !normalized;
    write("prob-zero", normalized ? probabilityText(data.alphaMagnitude, data.alphaSquared) : "—");
    write("prob-one", normalized ? probabilityText(data.betaMagnitude, data.betaSquared) : "—");
    write("interpretation", zero
      ? "Both coefficients are zero. Dividing by the norm would mean dividing by zero, so there is no normalized state here."
      : normalized
        ? "This state has unit norm. In the chosen basis, the squared magnitudes give the two outcome probabilities."
        : "The squared magnitudes contribute to the squared norm. Normalize before reading them as probabilities.");

    const comparedOpening = previous !== null && sameValues(previous, PRESETS.opening.values);
    openingForm.hidden = !sameValues(values, PRESETS.opening.values) && !comparedOpening;
    find("comparison").hidden = previous === null;
    if (previous !== null) {
      const before = analyze(previous);
      write("comparison-note", comparedOpening
        ? "Divide both entries by 5 to get α = 3/5 and β = 4i/5. The norm goes from 5 to 1, and the squared magnitudes become 9/25 and 16/25. Compare the solid arrows with the dashed traces on the same scale."
        : `The common divisor was the original norm, ${reading(before.norm)}. The new norm is 1. Compare each solid arrow with its dashed trace. A nonzero coefficient keeps its phase.`);
    } else {
      write("comparison-note", "");
    }

    for (const button of presetButtons) {
      const preset = PRESETS[button.dataset.statePreset];
      button.setAttribute("aria-pressed", String(sameValues(values, preset.values)));
    }

    paintAlpha(data.alpha, data.alphaMagnitude, previous ? previous.slice(0, 2) : null);
    paintBeta(data.beta, data.betaMagnitude, previous ? previous.slice(2) : null);
  }

  function announce(label) {
    const data = analyze(values);
    write("announcement", `${label} ${status.textContent}. Norm ${reading(data.norm)}.`);
  }

  function validInputs() {
    const invalid = inputs.find(input => !input.validity.valid || !Number.isFinite(input.valueAsNumber));
    if (!invalid) return true;
    invalid.reportValidity();
    invalid.focus();
    return false;
  }

  function loadPreset(key, label) {
    values = [...PRESETS[key].values];
    previous = null;
    clearPrediction();
    syncInputs();
    render();
    announce(label);
  }

  function applyNormalization(candidate) {
    const normalized = normalize(candidate);
    if (normalized === null) {
      write("announcement", "The zero pair cannot be normalized. Set at least one component to a nonzero value.");
      return;
    }

    if (analyze(candidate).kind === "normalized") {
      write("announcement", "The current pair already has unit norm.");
      return;
    }

    previous = [...candidate];
    values = normalized;
    syncInputs();
    render();
    announce("Both coefficients were divided by the original norm.");
  }

  inputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      const value = input.valueAsNumber;
      if (!input.validity.valid || !Number.isFinite(value)) {
        if (!input.hasAttribute("aria-invalid")) {
          write("announcement", "Enter a number from −4 to 4. The readouts still use the last valid value for that component.");
        }
        input.setAttribute("aria-invalid", "true");
        return;
      }

      input.removeAttribute("aria-invalid");
      if (value === values[index]) return;
      values[index] = value;
      previous = null;
      clearPrediction();
      render();
    });

    input.addEventListener("change", () => {
      if (input.validity.valid && Number.isFinite(input.valueAsNumber)) announce("Component updated.");
    });
  });

  for (const button of presetButtons) {
    const key = button.dataset.statePreset;
    button.addEventListener("click", () => { loadPreset(key, `${PRESETS[key].label} loaded.`); });
  }

  find("reset").addEventListener("click", () => { loadPreset("opening", "State builder reset."); });
  find("normalize").addEventListener("click", () => {
    if (!validInputs()) return;
    clearPrediction();
    applyNormalization(values);
  });

  openingForm.addEventListener("change", () => { write("prediction-feedback", ""); });
  openingForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!validInputs()) return;
    const answer = openingForm.querySelector("input[name='state-divisor']:checked");
    if (!answer) return;

    applyNormalization(PRESETS.opening.values);
    write("prediction-feedback", answer.value === "5"
      ? "Correct. Dividing by the norm 5 gives a pair of norm 1."
      : "25 is the squared norm. Using 25 would leave norm 1/5, so the lab used the correct divisor, 5.");
  });

  wireChallenge(find);
  syncInputs();
  render();
  for (const name of ["controls", "prediction-controls", "challenge-controls"]) {
    find(name).disabled = false;
  }
  find("static-note").hidden = true;
}


// ===========================================================================
// Quantum States Arcade (optional practice)
// Everything below uses the qs prefix and runs only inside #states-arcade.
// ===========================================================================

const QS_TOLERANCE = 0.002; // typed answers, per real or imaginary part
const QS_DERIVED = 0.005;   // squared norms and squared magnitudes computed from a typed state
const QS_ANGLE = 1;         // degrees
const QS_SVG = "http://www.w3.org/2000/svg";
const qsNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

function qsFmt(value) {
  if (!Number.isFinite(value)) return "undefined";
  return qsNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
}

// An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
const qsTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
const qsFits = (value, answer) => Math.abs(value - answer) <= (qsTerminates(answer) ? 1e-9 : QS_TOLERANCE + 1e-12);
const qsNear = (value, target, tolerance = QS_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
const qsAngleGap = (degrees, target) => Math.abs(((degrees - target) % 360 + 540) % 360 - 180);
const qsAngleFits = (degrees, target) => qsAngleGap(degrees, target) <= QS_ANGLE + 1e-9;

// Parse numbers such as 2, −1.5, 3/5, √2, 1/√2 or (1 + √3)/2.
// This is a small arithmetic reader (+ − × / √ and brackets), never eval.
function qsParse(raw) {
  const text = String(raw).trim().toLowerCase()
    .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/sqrt/g, "√").replace(/\s+/g, "");
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

// Complex numbers are [real, imaginary] pairs. A state is an array of them.
const qsAdd = ([a, b], [c, d]) => [a + c, b + d];
const qsSub = ([a, b], [c, d]) => [a - c, b - d];
const qsMul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
const qsConj = ([a, b]) => [a, -b];
const qsScale = ([a, b], k) => [a * k, b * k];
const qsAbs2 = ([a, b]) => a * a + b * b;
const qsAbs = ([a, b]) => Math.hypot(a, b);
const qsNorm2 = state => state.reduce((sum, z) => sum + qsAbs2(z), 0);
const qsInner = (bra, ket) => bra.reduce((sum, z, k) => qsAdd(sum, qsMul(qsConj(z), ket[k])), [0, 0]);
const qsFitsC = (z, target) => qsFits(z[0], target[0]) && qsFits(z[1], target[1]);
const qsFitsV = (state, target) => state.every((z, k) => qsFitsC(z, target[k]));
const qsNearC = (z, target, tolerance = QS_DERIVED) => qsAbs(qsSub(z, target)) <= tolerance + 1e-12;
const qsNonreal = z => Math.abs(z[1]) > 0.01;
const qsRoot2 = Math.SQRT1_2;

// Angle in degrees in (−180°, 180°].
function qsArg([a, b]) {
  const degrees = Math.atan2(b, a) * 180 / Math.PI;
  return degrees <= -180 + 1e-9 ? 180 : degrees;
}

function qsCx([a, b]) {
  const re = Math.abs(a) < 5e-10 ? 0 : a, im = Math.abs(b) < 5e-10 ? 0 : b;
  if (im === 0) return qsFmt(re);
  const size = Math.abs(im) === 1 ? "i" : qsFmt(Math.abs(im)) + "i";
  if (re === 0) return (im < 0 ? "−" : "") + size;
  return qsFmt(re) + (im < 0 ? " − " : " + ") + size;
}
const qsVec = state => "(" + state.map(qsCx).join(", ") + ")ᵀ";
const qsDeg = degrees => qsFmt(degrees) + "°";

const qsGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
const qsSetup = message => qsGrade(false, message);

function qsLabelText(field) {
  const label = field.closest("label");
  if (!label) return "the selected input";
  const copy = label.cloneNode(true);
  copy.querySelectorAll("input, select, output").forEach(node => node.remove());
  return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
}

class QsFieldError extends Error {
  constructor(field, detail = "", custom = false) {
    super("Check " + qsLabelText(field) + "." + (detail ? " " + detail : ""));
    this.field = field;
    this.detail = detail;
    this.custom = custom;
  }
}

function qsSetText(element, text) {
  text = String(text ?? "");
  if (element && element.textContent !== text) element.textContent = text;
}

// Plot builders used by the station show() functions.
const qsArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
const qsPlane = (caption, tone, items, extra = {}) => ({ caption, tone, items, limit: 1, circle: 1, ...extra });
const qsAlphaBeta = (alpha, beta, extra = {}) => [
  qsPlane("α · coefficient of |0⟩", "alpha", alpha, extra),
  qsPlane("β · coefficient of |1⟩", "beta", beta, extra)
];

// --- Station data: building states ------------------------------------------

const QS_FORGE = {
  p1: { text: "(1 + i, 2 − i)ᵀ", v: [[1, 1], [2, -1]], n2: 7,
    work: "‖ψ‖² = |1 + i|² + |2 − i|² = (1 + 1) + (4 + 1) = 7, so ‖ψ‖ = √7 ≈ 2.6458. Dividing both entries by √7 gives ((1 + i)/√7, (2 − i)/√7)ᵀ ≈ (0.378 + 0.378i, 0.7559 − 0.378i)ᵀ. Check: 2/7 + 5/7 = 1." },
  p2: { text: "(2i, 1 + i)ᵀ", v: [[0, 2], [1, 1]], n2: 6,
    work: "‖ψ‖² = |2i|² + |1 + i|² = 4 + 2 = 6, so ‖ψ‖ = √6 ≈ 2.4495. The state is (2i/√6, (1 + i)/√6)ᵀ ≈ (0.8165i, 0.4082 + 0.4082i)ᵀ. Check: 4/6 + 2/6 = 1." },
  p3: { text: "(1 − 2i, 2 + 2i)ᵀ", v: [[1, -2], [2, 2]], n2: 13,
    work: "‖ψ‖² = (1 + 4) + (4 + 4) = 13, so ‖ψ‖ = √13 ≈ 3.6056. The state is ((1 − 2i)/√13, (2 + 2i)/√13)ᵀ ≈ (0.2774 − 0.5547i, 0.5547 + 0.5547i)ᵀ. Check: 5/13 + 8/13 = 1." },
  p4: { text: "(−3 + i, 1 + 3i)ᵀ", v: [[-3, 1], [1, 3]], n2: 20,
    work: "‖ψ‖² = (9 + 1) + (1 + 9) = 20, so ‖ψ‖ = √20 = 2√5 ≈ 4.4721. The state is ((−3 + i)/√20, (1 + 3i)/√20)ᵀ ≈ (−0.6708 + 0.2236i, 0.2236 + 0.6708i)ᵀ. Check: 10/20 + 10/20 = 1." }
};

function qsForgeGates(c) {
  const pair = QS_FORGE[c.val("pair")];
  const n2 = c.ans("n2"), n = c.ans("n");
  const state = [c.cx("a"), c.cx("b")];
  const root = Math.sqrt(pair.n2);
  const target = pair.v.map(z => qsScale(z, 1 / root));
  const gates = [
    qsFits(n2, pair.n2) ? null : "Gate 1: add |α|² and |β|². Each one is (real part)² + (imaginary part)².",
    qsFits(n, root) ? null : qsFits(n, pair.n2)
      ? "Gate 2: that is the squared norm again. The norm is its square root."
      : "Gate 2: the norm ‖ψ‖ is the square root of the squared norm.",
    qsFitsV(state, target) ? null
      : qsFitsV(state, pair.v.map(z => qsScale(z, 1 / pair.n2)))
        ? "Gate 3: you divided by the squared norm. That leaves ‖ψ‖² = 1/" + pair.n2 + ". Divide by ‖ψ‖ instead."
        : qsNear(qsNorm2(state), 1)
          ? "Gate 3: your pair has norm 1, but it is not the original pair shrunk. Divide each original entry by the same positive number, ‖ψ‖, so neither arrow turns."
          : "Gate 3: divide the real and imaginary parts of both entries by ‖ψ‖."
  ];
  return { pair, gates };
}

function qsForgeGrader(key) {
  return c => {
    if (c.val("pair") !== key) return qsSetup("Choose the pair " + QS_FORGE[key].text + " in the forge first.");
    const { pair, gates } = qsForgeGates(c);
    const failure = gates.find(Boolean);
    return qsGrade(!failure, failure, pair.work);
  };
}

const QS_ALPHAS = {
  m1: { text: "(1 + i)/2", z: [0.5, 0.5], check: "half" },
  m2: { text: "(1 + 2i)/3", z: [1 / 3, 2 / 3], check: "third" },
  m4: { text: "−0.28 + 0.96i", z: [-0.28, 0.96], check: "none" }
};

const QS_MATCH = {
  a: [[0.5, -0.5], [-0.5, -0.5]],
  b: [[-0.5, -0.5], [0.5, -0.5]],
  c: [[0.5, 0.5], [-0.5, 0.5]],
  d: [[-0.5, 0.5], [0.5, 0.5]]
};

// Already normalized, normalizable, or impossible (the zero pair).
const QS_INSPECT = {
  a: { answers: ["normalized", "normalizable", "normalized", "impossible"],
    work: "1: 1/2 + 1/2 = 1, normalized. 2: |1 + i|² + |1 − i|² = 2 + 2 = 4, normalizable (divide by 2). 3: |i|² + 0 = 1, normalized. 4: the zero pair has norm 0 and cannot be normalized." },
  b: { answers: ["normalized", "normalizable", "normalized", "normalizable"],
    work: "1: |(1 + i)/2|² = 2/4 = 1/2 for each entry, so 1/2 + 1/2 = 1, normalized. 2: (1/2)² + (1/2)² = 1/2. The entries add to 1, but the squared magnitudes don’t, so it is normalizable. 3: 0.0784 + 0.9216 = 1, normalized. 4: 0.000001 is tiny but not zero, so dividing by its norm 0.001 works." },
  c: { answers: ["normalized", "normalizable", "normalized", "normalizable"],
    work: "1: 1/3 + 2/3 = 1, normalized. 2: 1 + 1 = 2, normalizable (divide by √2). 3: |2i/√5|² + |−1/√5|² = 4/5 + 1/5 = 1, normalized. 4: 1/9 + 4/9 = 5/9, normalizable (divide by √5/3)." }
};

function qsClassify(state) {
  const n2 = qsNorm2(state);
  if (n2 === 0) return "impossible";
  return qsNear(n2, 1) ? "normalized" : "normalizable";
}
const QS_BIN_NAMES = { normalized: "Already normalized", normalizable: "Normalizable", impossible: "Impossible (zero pair)" };

function qsInspectGrader(batch) {
  return c => {
    const picks = QS_INSPECT[batch].answers.map((_, k) => c.choice(batch + (k + 1)));
    const right = picks.filter((pick, k) => pick === QS_INSPECT[batch].answers[k]).length;
    return qsGrade(right === picks.length, right + " of " + picks.length + " are right. Compare each squared norm with 1, and look for the pair whose norm is exactly 0.",
      QS_INSPECT[batch].work);
  };
}

const QS_SCALE_START = [[2, 1], [1, -2]];
const QS_SCALE_OPS = {
  norm: { text: "divide by ‖ψ‖", factor: v => 1 / Math.sqrt(qsNorm2(v)) },
  square: { text: "divide by ‖ψ‖²", factor: v => 1 / qsNorm2(v) },
  alpha: { text: "divide by |α|", factor: v => 1 / qsAbs(v[0]) },
  k: { text: "multiply by k", factor: null }
};
const qsScaleRecord = (c, op, before) => c.s.records.findLast(r => r.op === op && qsNear(r.before, before, 1e-9));

// --- Stations ---------------------------------------------------------------

const qsStations = {
  // 1 · Normalization Forge -------------------------------------------------------------------
  forge: {
    actions: {
      gates(c) {
        const { gates } = qsForgeGates(c);
        return gates.map((gate, k) => gate ?? "Gate " + (k + 1) + " ✓.").join(" ") +
          (gates.every(gate => !gate) ? " The state is forged. Use Check mission to record it." : "");
      }
    },
    show(c) {
      const pair = QS_FORGE[c.val("pair")];
      const a = c.quietCx("a"), b = c.quietCx("b");
      const mine = a && b ? [a, b] : null;
      c.put("state", "Pair " + pair.text + (mine
        ? ". Your forged state is " + qsVec(mine) + ", with squared norm " + qsFmt(qsNorm2(mine)) + "."
        : ". Fill in all three gates to draw your forged state."));
      const planes = qsAlphaBeta(
        [qsArrow(pair.v[0], "alpha", "original", { dashed: true }), ...(a ? [qsArrow(a, "alpha", "α")] : [])],
        [qsArrow(pair.v[1], "beta", "original", { dashed: true }), ...(b ? [qsArrow(b, "beta", "β")] : [])],
        { limit: 3.5 });
      return { planes, caption: "dashed: original pair · solid: your state · circle: radius 1",
        desc: "Original pair " + pair.text + " drawn dashed." + (mine ? " Your state " + qsVec(mine) + " drawn solid." : "") + " A dashed circle marks magnitude 1." };
    },
    checks: Object.fromEntries(Object.keys(QS_FORGE).map(key => [key, [
      "Square the real and imaginary parts of each entry and add all four squares.",
      "The divisor is the norm, √" + QS_FORGE[key].n2 + ". Divide every real and imaginary part by it.",
      qsForgeGrader(key)]]))
  },

  // 2 · Missing Amplitude -------------------------------------------------------------------------
  missing: {
    start(c) { c.s.records = []; },
    actions: {
      record(c) {
        const z = c.cx("b");
        c.s.records.push({ alpha: c.val("alpha"), z });
        if (c.s.records.length > 8) c.s.records.shift();
        return "Recorded β = " + qsCx(z) + " for α = " + QS_ALPHAS[c.val("alpha")].text + ".";
      },
      clear(c) { c.s.records = []; return "Recorded β values cleared."; }
    },
    show(c) {
      const key = c.val("alpha"), alpha = QS_ALPHAS[key], beta = c.quietCx("b");
      const known = c.revealed(alpha.check);
      const need = Math.sqrt(Math.max(0, 1 - qsAbs2(alpha.z)));
      const records = c.s.records.filter(r => r.alpha === key);
      c.put("state", "α = " + alpha.text + "." + (beta
        ? " Your β = " + qsCx(beta) + " gives |α|² + |β|² = " + qsFmt(qsAbs2(alpha.z) + qsAbs2(beta)) + "."
        : " Enter β to test it."));
      c.list("records", c.s.records.map(r => "α = " + QS_ALPHAS[r.alpha].text + " · β = " + qsCx(r.z) + " · |β| = " + qsFmt(qsAbs(r.z))));
      const planes = qsAlphaBeta([qsArrow(alpha.z, "alpha", "α")], [
        ...records.map(r => qsArrow(r.z, "beta", "", { dot: true, hollow: true })),
        ...(beta ? [qsArrow(beta, "beta", "β")] : [])],
      { limit: 1 });
      if (known) planes[1].rings = [{ r: need, tone: "beta" }];
      return { planes, caption: known ? "the orange circle shows every allowed β" : "find the size of β",
        desc: "α = " + alpha.text + " in its plane." + (beta ? " β = " + qsCx(beta) + "." : "") + " Recorded β values for this α appear as hollow dots." +
          (known ? " An orange circle of radius " + qsFmt(need) + " marks every β that normalizes the state." : "") };
    },
    checks: {
      half: ["|α|² = (real part)² + (imaginary part)² = 1/4 + 1/4.", "|β|² = 1 − |α|². Then take the square root.", c => {
        const answer = c.ans("half-ans");
        return qsGrade(qsFits(answer, qsRoot2), qsFits(answer, 0.5) ? "1/2 is |β|². The magnitude |β| is its square root." : "Find |α|² first, then use |α|² + |β|² = 1.",
          "|α|² = (1/2)² + (1/2)² = 1/2. So |β|² = 1 − 1/2 = 1/2 and |β| = 1/√2 ≈ 0.7071.");
      }],
      third: ["|α|² = (1/3)² + (2/3)² = 1/9 + 4/9.", "|β|² = 1 − 5/9 = 4/9.", c => {
        const answer = c.ans("third-ans");
        return qsGrade(qsFits(answer, 2 / 3), qsFits(answer, 4 / 9) ? "4/9 is |β|². The magnitude is its square root." : "Find |α|², subtract it from 1, then take the square root.",
          "|α|² = 1/9 + 4/9 = 5/9. So |β|² = 4/9 and |β| = 2/3.");
      }],
      many: ["Every β on a circle of radius 2/3 works.", "Try β = 2/3, then β = 2i/3 or (√2/3)(1 + i).", c => {
        if (c.val("alpha") !== "m2") return qsSetup("Choose α = (1 + 2i)/3 first.");
        const good = c.s.records.filter(r => r.alpha === "m2" && qsNear(qsAbs2(r.z), 4 / 9));
        const pair = good.flatMap((r, i) => good.slice(i + 1).map(s => [r, s])).find(([r, s]) => qsAbs(qsSub(r.z, s.z)) > 0.01);
        if (!good.length) return qsSetup("Record a β with |β| = 2/3 for α = (1 + 2i)/3.");
        return qsGrade(Boolean(pair), "Record a second β with the same size but a different direction.",
          pair ? "β = " + qsCx(pair[0].z) + " and β = " + qsCx(pair[1].z) + " both have |β|² = 4/9, so both make |α|² + |β|² = 1. Normalization fixes the size of β, not its angle." : "");
      }],
      none: ["|α|² = 0.28² + 0.96² = 0.0784 + 0.9216.", "If |α|² = 1, then |β|² = 0. Can a zero coefficient have an angle?", c => {
        const answer = c.ans("none-ans"), why = c.choice("none-why");
        if (!qsFits(answer, 0)) return qsGrade(false, "Compute |α|² carefully. Here it is exactly 1.");
        return qsGrade(why === "undefined", "|β| = 0 is right. Now pick the reason that fits a zero coefficient.",
          "|α|² = 0.0784 + 0.9216 = 1, so |β|² = 0 and β = 0. Zero has no defined phase, so there is no choice left to make.");
      }]
    }
  },

  // 3 · Ket ↔ Column ↔ Arrows Translator -------------------------------------------------------
  translator: {
    show(c) {
      const open = c.open();
      if (open === "arrows") {
        c.put("state", "Mystery state. Read both arrow tips from the grid. Grid lines are 0.25 apart.");
        return { planes: qsAlphaBeta([qsArrow([0.5, 0.5], "alpha", "α ?")], [qsArrow([-0.5, 0.5], "beta", "β ?")]),
          caption: "mystery arrows", desc: "Two arrows for the mystery state. Read each tip from the grid, which has lines every 0.25." };
      }
      if (open === "match") {
        const pick = c.val("match-pick");
        if (!pick) {
          c.put("state", "Choose a diagram in the mission to preview it.");
          return { planes: qsAlphaBeta([], []), caption: "choose a diagram", desc: "Empty planes. Choose a diagram to preview." };
        }
        const [a, b] = QS_MATCH[pick];
        c.put("state", "Diagram " + pick.toUpperCase() + " is shown. Compare each arrow with the column ((1 − i)/2, (−1 − i)/2)ᵀ.");
        return { planes: qsAlphaBeta([qsArrow(a, "alpha", "α")], [qsArrow(b, "beta", "β")]),
          caption: "diagram " + pick.toUpperCase(), desc: "Diagram " + pick.toUpperCase() + ": α arrow to " + qsCx(a) + ", β arrow to " + qsCx(b) + "." };
      }
      const order = c.val("order"), top = c.quietCx("top"), bottom = c.quietCx("bot");
      const names = order === "std" ? ["|0⟩", "|1⟩"] : ["|1⟩", "|0⟩"];
      const tones = order === "std" ? ["alpha", "beta"] : ["beta", "alpha"];
      const ket = top && bottom
        ? "(" + qsCx(top) + ")" + names[0] + " + (" + qsCx(bottom) + ")" + names[1]
        : "fill in both entries";
      c.put("state", "Basis order " + (order === "std" ? "ℬ = (|0⟩, |1⟩)" : "ℬ′ = (|1⟩, |0⟩)") + ". Your column reads as |ψ⟩ = " + ket + ".");
      return {
        planes: [
          qsPlane("top entry · coefficient of " + names[0], tones[0], top ? [qsArrow(top, tones[0], "top")] : []),
          qsPlane("bottom entry · coefficient of " + names[1], tones[1], bottom ? [qsArrow(bottom, tones[1], "bottom")] : [])],
        caption: "your column", desc: "Your column entries as arrows. The top entry multiplies " + names[0] + " and the bottom entry multiplies " + names[1] + "."
      };
    },
    checks: {
      column: ["Find the coefficient that multiplies |0⟩. In ℬ, it goes on top.", "The ket lists |1⟩ first, but the column follows ℬ, not the order of the written terms.", c => {
        if (c.val("order") !== "std") return qsSetup("Set the basis order to ℬ = (|0⟩, |1⟩) first.");
        const top = c.cx("top"), bottom = c.cx("bot"), zero = [1 / 3, 2 / 3], one = [0, 2 / 3];
        if (qsFitsC(top, one) && qsFitsC(bottom, zero)) return qsGrade(false, "Those entries are in the written order. In ℬ, the coefficient of |0⟩ goes on top.");
        return qsGrade(qsFitsC(top, zero) && qsFitsC(bottom, one), "Use the coefficient of |0⟩, (1 + 2i)/3, on top and the coefficient of |1⟩, 2i/3, below.",
          "In ℬ = (|0⟩, |1⟩), [|ψ⟩]ℬ = ((1 + 2i)/3, 2i/3)ᵀ ≈ (0.3333 + 0.6667i, 0.6667i)ᵀ.");
      }],
      reverse: ["In ℬ′ = (|1⟩, |0⟩), the first basis ket is |1⟩.", "The same state gets a different column when the basis order changes.", c => {
        if (c.val("order") !== "rev") return qsSetup("Set the basis order to ℬ′ = (|1⟩, |0⟩) first.");
        const top = c.cx("top"), bottom = c.cx("bot"), zero = [1 / 3, 2 / 3], one = [0, 2 / 3];
        if (qsFitsC(top, zero) && qsFitsC(bottom, one)) return qsGrade(false, "That is the column for ℬ. In ℬ′, the coefficient of |1⟩ goes on top.");
        return qsGrade(qsFitsC(top, one) && qsFitsC(bottom, zero), "Put the coefficient of |1⟩, 2i/3, on top.",
          "In ℬ′ = (|1⟩, |0⟩), [|ψ⟩]ℬ′ = (2i/3, (1 + 2i)/3)ᵀ. The state is the same. Only its coordinate list changed.");
      }],
      arrows: ["The horizontal coordinate of a tip is the real part. The vertical coordinate is the imaginary part.", "Both tips sit on grid crossings 0.5 from each axis.", c => {
        const a = c.cx("ar-a"), b = c.cx("ar-b");
        if (qsFitsC(a, [-0.5, 0.5]) && qsFitsC(b, [0.5, 0.5])) return qsGrade(false, "Those values are swapped. The α plane belongs to |0⟩.");
        return qsGrade(qsFitsC(a, [0.5, 0.5]) && qsFitsC(b, [-0.5, 0.5]), "Read the real part across and the imaginary part up for each arrow.",
          "|ψ⟩ = (0.5 + 0.5i)|0⟩ + (−0.5 + 0.5i)|1⟩. Check: 0.5 + 0.5 = 1, so it is normalized.");
      }],
      match: ["(1 − i)/2 has a positive real part and a negative imaginary part.", "β = (−1 − i)/2 points down and to the left.", c => {
        const pick = c.choice("match-pick");
        const why = { b: "Diagram B swaps α and β.", c: "Diagram C shows the conjugates: both arrows are mirrored across the real axis.", d: "Diagram D both swaps and mirrors the arrows." };
        return qsGrade(pick === "a", why[pick] ?? "Compare both arrows.",
          "α = (1 − i)/2 = 0.5 − 0.5i points down and right. β = (−1 − i)/2 = −0.5 − 0.5i points down and left. That is diagram A.");
      }]
    }
  },

  // 4 · Polar Dial --------------------------------------------------------------------------------
  polar: {
    show(c) {
      const r = c.quiet("r"), theta = c.quiet("theta"), a = c.quiet("re"), b = c.quiet("im");
      const items = [];
      let polar = null;
      if (r !== null && theta !== null) {
        polar = [r * Math.cos(theta * Math.PI / 180), r * Math.sin(theta * Math.PI / 180)];
        items.push(qsArrow(polar, "accent", "polar", { dashed: true }));
      }
      if (a !== null && b !== null) items.push(qsArrow([a, b], "alpha", "a + bi"));
      const size = Math.max(1, ...items.map(item => Math.max(Math.abs(item.z[0]), Math.abs(item.z[1]))));
      c.put("state", (polar ? "Polar arrow: r = " + qsFmt(r) + " at θ = " + qsDeg(theta) + "." : "Enter r and θ to draw the polar arrow.") +
        (a !== null && b !== null ? " Rectangular arrow: " + qsCx([a, b]) + "." : " Enter a and b to draw the rectangular arrow."));
      return { planes: [qsPlane("one amplitude · polar (dashed) and a + bi (solid)", "accent", items, { limit: Math.ceil(size * 2) / 2 })],
        caption: "the two arrows match when the forms agree", desc: "The polar form is drawn dashed and the rectangular form solid in one complex plane." };
    },
    checks: {
      rect: ["a = r cos θ and b = r sin θ.", "cos 120° = −1/2 and sin 120° = √3/2.", c => {
        const r = c.ans("r"), theta = c.ans("theta");
        if (!qsFits(r, 0.5) || !qsAngleFits(theta, 120)) return qsSetup("Set r = 1/2 and θ = 120° first.");
        const a = c.ans("re"), b = c.ans("im");
        if (qsFits(a, Math.sqrt(3) / 4) && qsFits(b, -0.25)) return qsGrade(false, "Those are swapped. The real part uses cos θ.");
        return qsGrade(qsFits(a, -0.25) && qsFits(b, Math.sqrt(3) / 4), "Multiply r by cos θ for a and by sin θ for b.",
          "a = (1/2)cos 120° = −1/4 and b = (1/2)sin 120° = √3/4 ≈ 0.433. So the amplitude is −1/4 + (√3/4)i.");
      }],
      polar: ["r = √(a² + b²).", "The point is in the third quadrant, below and left of the origin.", c => {
        const a = c.ans("re"), b = c.ans("im");
        if (!qsFits(a, -0.5) || !qsFits(b, -0.5)) return qsSetup("Set a = −1/2 and b = −1/2 first.");
        const r = c.ans("r"), theta = c.ans("theta");
        if (qsFits(r, 0.5)) return qsGrade(false, "r² = 1/4 + 1/4 = 1/2. Take the square root.");
        if (qsAngleFits(theta, 45)) return qsGrade(false, "tan θ = 1 also holds at 45°, but this point is in the third quadrant.");
        return qsGrade(qsFits(r, qsRoot2) && qsAngleFits(theta, -135), "Find the length, then the direction measured from the positive real axis.",
          "r = √(1/4 + 1/4) = 1/√2 ≈ 0.7071. The arrow points into the third quadrant at θ = −135°, which is the same direction as 225°.");
      }],
      axis: ["A point on the imaginary axis has θ = 90° or −90°.", "r is a length, so it is never negative.", c => {
        const a = c.ans("re"), b = c.ans("im");
        if (!qsFits(a, 0) || !qsFits(b, -0.3)) return qsSetup("Set a = 0 and b = −0.3 first.");
        const r = c.ans("r"), theta = c.ans("theta");
        if (qsFits(r, -0.3)) return qsGrade(false, "r is a magnitude, so it can’t be negative. Use r = 0.3 and let θ carry the direction.");
        return qsGrade(qsFits(r, 0.3) && qsAngleFits(theta, -90), "The arrow points straight down.",
          "r = 0.3 and θ = −90° (or 270°). So −0.3i = 0.3 at −90°.");
      }],
      negative: ["Adding or subtracting 360° gives the same direction.", "300° − 360° = ?", c => {
        const answer = c.ans("neg-ans");
        if (!(answer > -180 && answer <= 0)) return qsGrade(false, "Give an angle between −180° and 0°.");
        return qsGrade(qsAngleFits(answer, -60), "Subtract a full turn from 300°.", "300° − 360° = −60°. Both angles name the same direction, so 1 at 300° = 1 at −60° = 1/2 − (√3/2)i.");
      }]
    }
  },

  // 5 · Valid State Inspector -----------------------------------------------------------------------
  inspector: {
    start(c) { c.s.bins = {}; },
    actions: {
      file(c) {
        const state = [c.cx("al"), c.cx("be")];
        const kind = qsClassify(state);
        c.s.bins[kind] = state;
        return "Filed " + qsVec(state) + " in: " + QS_BIN_NAMES[kind] + ".";
      }
    },
    show(c) {
      const a = c.quietCx("al"), b = c.quietCx("be");
      const bins = Object.entries(QS_BIN_NAMES).map(([kind, name]) => name + ": " + (c.s.bins[kind] ? qsVec(c.s.bins[kind]) : "empty"));
      c.put("state", a && b ? "Candidate " + qsVec([a, b]) + " · squared norm " + qsFmt(qsNorm2([a, b])) + "." : "Enter a candidate pair.");
      c.list("bins", bins);
      return { planes: qsAlphaBeta(a ? [qsArrow(a, "alpha", "α")] : [], b ? [qsArrow(b, "beta", "β")] : [], { limit: 2 }),
        caption: "your candidate", desc: "Your candidate's entries drawn as arrows. The dashed circle has radius 1." };
    },
    checks: {
      first: ["A normalized pair has |α|² + |β|² = 1.", "Only one pair has norm exactly 0.", qsInspectGrader("a")],
      traps: ["Add squared magnitudes, not the entries themselves.", "A very small nonzero pair can still be normalized.", qsInspectGrader("b")],
      third: ["|2i/√5|² = 4/5.", "Normalizable means nonzero but with a squared norm other than 1.", qsInspectGrader("c")],
      build: ["The inspector files each candidate in the bin it belongs to.", "For the normalizable bin, try (1 + i, 1). For the normalized bin, try (i/√2, 1/√2).", c => {
        const { normalized, normalizable, impossible } = c.s.bins;
        if (!normalized || !normalizable || !impossible) return qsSetup("File one candidate in each of the three bins.");
        const nonreal = state => state.some(qsNonreal);
        return qsGrade(nonreal(normalized) && nonreal(normalizable), "Give the normalized and normalizable candidates at least one entry with a nonzero imaginary part.",
          "Normalized " + qsVec(normalized) + ", squared norm " + qsFmt(qsNorm2(normalized)) + ". Normalizable " + qsVec(normalizable) +
          ", squared norm " + qsFmt(qsNorm2(normalizable)) + ". Impossible " + qsVec(impossible) + ", squared norm 0.");
      }]
    }
  },

  // 6 · Scaling Trap ----------------------------------------------------------------------------------
  scaling: {
    start(c) { c.s.v = QS_SCALE_START; c.s.prev = null; c.s.records = []; },
    actions: {
      apply(c) {
        const predicted = c.ans("predict"), op = c.val("op"), before = qsNorm2(c.s.v);
        let factor;
        if (op === "k") {
          factor = c.ans("k");
          if (!(factor > 0)) throw new QsFieldError(c.field("k"), "Use a positive k.", true);
        } else factor = QS_SCALE_OPS[op].factor(c.s.v);
        c.s.prev = c.s.v;
        c.s.v = c.s.v.map(z => qsScale(z, factor));
        const after = qsNorm2(c.s.v);
        c.s.records.push({ op, before, after, predicted, k: op === "k" ? factor : null });
        if (c.s.records.length > 12) c.s.records.shift();
        c.set("predict", "");
        return "Applied: " + QS_SCALE_OPS[op].text + (op === "k" ? " = " + qsFmt(factor) : "") + ". You predicted ‖ψ‖² = " + qsFmt(predicted) + ". The new ‖ψ‖² is " + qsFmt(after) + ".";
      },
      restart(c) { c.s.v = QS_SCALE_START; c.s.prev = null; return "Restarted from (2 + i, 1 − 2i)ᵀ, where ‖ψ‖² = 10."; }
    },
    show(c) {
      const { v, prev } = c.s;
      c.put("state", "Current |ψ⟩ = " + qsVec(v) + " · ‖ψ‖² = " + qsFmt(qsNorm2(v)) + ". Choose an operation and predict the new ‖ψ‖² before you apply it.");
      c.list("records", c.s.records.map(r => QS_SCALE_OPS[r.op].text + (r.k !== null ? " = " + qsFmt(r.k) : "") + ": ‖ψ‖² " +
        qsFmt(r.before) + " → " + qsFmt(r.after) + " (predicted " + qsFmt(r.predicted) + ")"));
      return { planes: qsAlphaBeta(
        [...(prev ? [qsArrow(prev[0], "alpha", "", { dashed: true })] : []), qsArrow(v[0], "alpha", "α")],
        [...(prev ? [qsArrow(prev[1], "beta", "", { dashed: true })] : []), qsArrow(v[1], "beta", "β")], { limit: 3 }),
      caption: "dashed: before the last step", desc: "Current state " + qsVec(v) + "." + (prev ? " The state before the last operation is dashed." : "") };
    },
    checks: {
      square: ["Scaling a vector by 1/s scales its squared norm by 1/s².", "Here s = ‖ψ‖² = 10.", c => {
        const record = qsScaleRecord(c, "square", 10);
        if (!record) return qsSetup("From the starting state (‖ψ‖² = 10), predict and apply “divide by ‖ψ‖²”.");
        return qsGrade(qsFits(record.predicted, 0.1), "Dividing by 10 multiplies the squared norm by 1/100.",
          "Dividing by ‖ψ‖² = 10 scales ‖ψ‖² by 1/10² = 1/100, so ‖ψ‖² = 10/100 = 1/10. The divisor was the squared norm, not the norm.");
      }],
      alpha: ["|α| = |2 + i| = √5.", "Scaling by 1/√5 scales the squared norm by 1/5.", c => {
        const record = qsScaleRecord(c, "alpha", 10);
        if (!record) return qsSetup("From the starting state, predict and apply “divide by |α|”.");
        return qsGrade(qsFits(record.predicted, 2), "Find the factor 1/|α|, then square it.",
          "|α| = √5, so ‖ψ‖² becomes 10 × (1/√5)² = 10/5 = 2. Dividing by the size of one entry doesn’t normalize the pair.");
      }],
      k: ["Multiplying by k scales the squared norm by k².", "Solve k² × 1 = 9/4 with k > 0.", c => {
        const answer = c.ans("k-ans");
        return qsGrade(qsFits(answer, 1.5), qsFits(answer, 2.25) ? "9/4 is k². Take the positive square root." : "Use ‖kψ‖² = k²‖ψ‖² with ‖ψ‖² = 1.",
          "‖kψ‖² = k² × 1 = 9/4, so k = 3/2.");
      }],
      undo: ["After the trap, ‖ψ‖² = 1/10.", "Multiplying by k scales 1/10 by k². Solve for k² = 10.", c => {
        const record = qsScaleRecord(c, "k", 0.1);
        if (!record) return qsSetup("Apply “divide by ‖ψ‖²” from the start, then predict and apply “multiply by k”.");
        if (!qsFits(record.predicted, 1)) return qsGrade(false, "Predict the squared norm you are aiming for, which is 1.");
        return qsGrade(qsNear(record.after, 1), "That k gave ‖ψ‖² = " + qsFmt(record.after) + ". You need k² = 10.",
          "k = √10 ≈ 3.1623 scales 1/10 by 10, back to ‖ψ‖² = 1. Dividing by 10 and multiplying by √10 is the same as dividing by √10 = ‖ψ‖ once.");
      }]
    }
  }
};

// ---------------------------------------------------------------------------
// Arcade engine: station switching, missions, hints, progress and drawing.
// ---------------------------------------------------------------------------

function qsPalette(root) {
  const css = getComputedStyle(root);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    alpha: read("--blue", "#65b7ff"),
    beta: read("--orange", "#ff9f55"),
    gamma: read("--green", "#63f59b"),
    accent: read("--violet", "#c19bff"),
    warn: read("--red", "#ff676f"),
    mark: read("--yellow", "#ffe16a"),
    ink: read("--ink", "#ecfff1"),
    axis: "#c1cddd",
    sphere: "#304258"
  };
}

function initializeStatesArcade(root) {
  const details = root.querySelector("#states-arcade");
  if (!details) return;
  const get = id => root.querySelector("#qs-" + id);
  const select = get("station"), resetButton = get("reset"), status = get("status");
  const reducedBox = get("reduced"), progress = get("progress");
  const figure = get("figure-template").content.firstElementChild.cloneNode(true);
  const toolTemplate = get("mission-template");
  const viewport = figure.querySelector("#qs-viewport");
  const canvas = figure.querySelector("#qs-canvas");
  const geometry = figure.querySelector("[data-qs-geometry]");
  const labelLayer = figure.querySelector("[data-qs-labels]");
  const desc = figure.querySelector("#qs-desc");
  const title = figure.querySelector("#qs-title");
  const renderStatus = figure.querySelector("#qs-render-status");
  const colors = qsPalette(root);
  const lifetime = new AbortController();
  const listen = (node, type, handler, options = {}) =>
    node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
  const panels = new Map(), cards = new Map(), completion = new Set();
  let active = null, plan = null;
  let graphics = null, loading = false, failed = false, contextLost = false, disposed = false;
  let frame = null, drag = null, glide = null;

  const say = message => qsSetText(status, message ?? "");
  const updateProgress = () => qsSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

  for (const panel of root.querySelectorAll("#qs-panels [data-qs-station]")) {
    const key = panel.dataset.qsStation;
    const spec = qsStations[key];
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
        const value = qsParse(input.value);
        if (value === null) throw new QsFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2 or 1/√2.", true);
        return value;
      },
      quiet: name => qsParse(field(name).value),
      cx: prefix => [c.ans(prefix + "-re"), c.ans(prefix + "-im")],
      // A complex value for drawing only; null while either box is blank or mid-edit.
      quietCx(prefix) {
        const re = c.quiet(prefix + "-re"), im = c.quiet(prefix + "-im");
        return re === null || im === null ? null : [re, im];
      },
      choice(name) {
        const input = field(name);
        if (!input.value) throw new QsFieldError(input, "Choose an option.");
        return input.value;
      },
      set(name, value) { field(name).value = String(value); },
      put(name, text) { qsSetText(c.node('[data-qs-read="' + name + '"]'), text); },
      list(name, lines) {
        const list = c.node('[data-qs-log="' + name + '"]');
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
      reduced
    };
    panels.set(key, c);
    for (const card of panel.querySelectorAll("[data-qs-mission]")) {
      const id = card.dataset.qsMission, check = id.slice(key.length + 1);
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
    qsSetText(renderStatus, message);
  }

  function refresh() {
    if (!active || !details.open) return;
    plan = active.spec.show(active);
    qsSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
    qsSetText(desc, plan.desc || "");
    if (plan.sphere) {
      const target = qsBlochPoint(plan.sphere.marker);
      if (!glide) glide = { from: target, to: target, start: 0, point: target };
      else if (glide.to.some((n, i) => n !== target[i])) {
        glide = { from: glide.point, to: target, start: performance.now(), point: glide.point };
        if (reduced() || !onScreen()) glide = { from: target, to: target, start: 0, point: target };
      }
      if (!graphics && !loading && !failed) loadGraphics();
    }
    draw();
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
    const view = plan.sphere ? { ...plan.sphere, shown: glide?.point } : null;
    qsPaintSvg(plan, geometry, labelLayer, view);
    if (!plan.sphere) {
      showSvg("SVG diagram.");
      return;
    }
    if (!graphics || contextLost) {
      if (!loading) showSvg(failed
        ? "Three.js is unavailable here, so the sphere uses the SVG view. Use the view sliders to turn it."
        : "SVG view of the sphere. Use the view sliders or drag to turn it.");
      return;
    }
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    try {
      graphics.draw(view, width, height, reduced());
      canvas.hidden = false;
      viewport.dataset.renderer = "webgl";
      qsSetText(renderStatus, "Three.js 3D view. Drag the sphere or use the view sliders to turn it.");
    } catch {
      graphics.dispose();
      graphics = null;
      failed = true;
      showSvg("The 3D view stopped, so the sphere uses the SVG view.");
    }
  }

  function requestFrame() {
    if (frame !== null || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (onScreen()) draw();
    });
  }

  async function loadGraphics() {
    if (loading || graphics || disposed) return;
    loading = true;
    showSvg("SVG view of the sphere. Loading the Three.js view.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (disposed) return;
      graphics = qsCreateBloch(THREE, canvas, colors);
    } catch {
      graphics = null;
      failed = true;
    } finally {
      loading = false;
    }
    if (active?.spec.drag) draw();
  }

  function mount() {
    active = panels.get(select.value) ?? panels.values().next().value;
    for (const c of panels.values()) c.panel.hidden = c !== active;
    active.node("[data-qs-plot-slot]").append(figure);
    viewport.dataset.space = active.spec.drag ? "true" : "false";
    glide = null;
    refresh();
  }

  function clearCard(card) {
    qsSetText(card.querySelector("[data-qs-feedback]"), "");
    const work = card.querySelector("[data-qs-work]");
    work.hidden = true;
    work.open = false;
  }

  function showGrade(mission, result) {
    const { card, id, check, station } = mission;
    const work = card.querySelector("[data-qs-work]");
    qsSetText(card.querySelector("[data-qs-feedback]"),
      result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
    qsSetText(card.querySelector("[data-qs-work-text]"), result.work || "");
    work.hidden = !result.work;
    work.open = Boolean(result.work) && !result.pass;
    if (result.pass) station.s.revealed[check] = true;
    if (result.pass && !completion.has(id)) {
      completion.add(id);
      card.querySelector("[data-qs-done]").hidden = false;
      updateProgress();
    }
    say("");
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !active || !active.panel.contains(button) || button.disabled) return;
    const missionCard = button.closest("[data-qs-mission]");
    const mission = missionCard ? cards.get(missionCard.dataset.qsMission) : null;
    const action = button.dataset.qsAction;
    try {
      if (action) {
        const message = active.spec.actions[action](active, mission?.check ?? null);
        if (mission) qsSetText(mission.card.querySelector("[data-qs-feedback]"), message ?? "");
        else if (message !== null) say(message);
      } else if (mission && button.hasAttribute("data-qs-check")) {
        showGrade(mission, active.spec.checks[mission.check][2](active));
      } else if (mission && button.hasAttribute("data-qs-hint")) {
        if (mission.hints >= 2) return;
        const list = mission.card.querySelector("[data-qs-hint-list]");
        const item = document.createElement("li");
        qsSetText(item, active.spec.checks[mission.check][mission.hints]);
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
      if (!(error instanceof QsFieldError)) throw error;
      if (mission) qsSetText(mission.card.querySelector("[data-qs-feedback]"), error.message);
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
    const missionCard = target.closest("[data-qs-mission]");
    if (missionCard) clearCard(missionCard);
    active.spec.edit?.(active, target.name, event.type);
    refresh();
  }

  // Drag to turn the sphere.
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
    draw();
  };
  listen(reducedBox, "change", settle);
  if (motionQuery?.addEventListener) listen(motionQuery, "change", settle);
  listen(root.querySelector("#qs-arcade-link"), "click", () => { details.open = true; });

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestFrame()) : null;
  observer?.observe(viewport);
  listen(document, "visibilitychange", () => { if (!document.hidden) requestFrame(); });
  listen(canvas, "webglcontextlost", event => {
    event.preventDefault();
    contextLost = true;
    showSvg("The WebGL context was lost, so the sphere uses the SVG view.");
  });
  listen(canvas, "webglcontextrestored", () => {
    contextLost = false;
    graphics?.invalidate();
    requestFrame();
  });
  listen(window, "pageshow", () => requestFrame());
  listen(window, "pagehide", event => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
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
  if (location.hash === "#states-arcade") details.open = true;
}

// ---------------------------------------------------------------------------
// SVG drawing: complex planes, bars and the sphere preview.
// The viewBox is 560 × 300. Labels always stay in SVG.
// ---------------------------------------------------------------------------

function qsNode(name, attributes = {}, text = "") {
  const node = document.createElementNS(QS_SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  if (text) node.textContent = text;
  return node;
}

function qsPaintSvg(plan, geometry, labels, sphere) {
  const shapes = [], words = [];
  if (plan.planes) qsDrawPlanes(plan.planes, shapes, words);
  if (plan.bars) qsDrawBars(plan.bars, shapes, words);
  if (sphere) qsDrawSphere(sphere, shapes, words);
  geometry.replaceChildren(...shapes);
  labels.replaceChildren(...words);
}

function qsDrawPlanes(planes, shapes, words) {
  const count = planes.length, width = 560 / count;
  const size = Math.min(width - 20, 238), cy = 164;
  planes.forEach((plane, index) => {
    const cx = width * index + width / 2, half = size / 2;
    const limit = plane.limit ?? 1, unit = (half - 10) / limit;
    const X = re => cx + re * unit, Y = im => cy - im * unit;
    const tone = plane.tone ?? "accent";
    shapes.push(qsNode("rect", { class: "qs-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
    const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
    let grid = "";
    for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
      if (k === 0) continue;
      const v = k * step;
      grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
    }
    shapes.push(qsNode("path", { class: "qs-grid", d: grid }));
    shapes.push(qsNode("path", { class: "qs-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
    const tickStep = limit <= 1 ? 0.5 : 1;
    for (let v = tickStep; v <= limit + 1e-9; v += tickStep) {
      if (count === 3 && limit > 1 && v < limit - 1e-9) continue;
      const text = qsFmt(v);
      words.push(qsNode("text", { class: "qs-tick", x: X(v), y: cy + 14, "text-anchor": "middle" }, text));
      words.push(qsNode("text", { class: "qs-tick", x: cx - 4, y: Y(v) + 4, "text-anchor": "end" }, text + "i"));
    }
    words.push(qsNode("text", { class: "qs-caption", "data-tone": tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
    for (const ring of [plane.circle, ...(plane.rings ?? [])]) {
      if (ring === null || ring === undefined) continue;
      const r = typeof ring === "number" ? { r: ring, tone: "guide" } : ring;
      if (r.r > 0) shapes.push(qsNode("circle", { class: "qs-ring", "data-tone": r.tone, cx, cy, r: r.r * unit }));
    }
    for (const ray of plane.rays ?? []) {
      const angle = ray.angle * Math.PI / 180, reach = limit * unit;
      shapes.push(qsNode("line", { class: "qs-ray", "data-tone": ray.tone ?? tone, x1: cx, y1: cy, x2: cx + Math.cos(angle) * reach, y2: cy - Math.sin(angle) * reach }));
    }
    for (const item of plane.items) {
      const [re, im] = item.z;
      const clip = Math.max(Math.abs(re), Math.abs(im)) > limit ? limit / Math.max(Math.abs(re), Math.abs(im)) : 1;
      const ex = X(re * clip), ey = Y(im * clip);
      const itemTone = item.tone ?? tone;
      const length = Math.hypot(ex - cx, ey - cy);
      if (item.dot || length < 3) {
        shapes.push(qsNode("circle", { class: "qs-dot" + (item.hollow || length < 3 ? " qs-hollow" : ""), "data-tone": itemTone, cx: ex, cy: ey, r: item.dot ? 4.5 : 5 }));
      } else {
        const ux = (ex - cx) / length, uy = (ey - cy) / length, depth = Math.min(13, length * 0.6), wing = depth * 0.42;
        const bx = ex - ux * depth, by = ey - uy * depth;
        shapes.push(qsNode("line", { class: "qs-arrow" + (item.dashed ? " qs-dashed" : ""), "data-tone": itemTone, x1: cx, y1: cy, x2: bx, y2: by }));
        shapes.push(qsNode("polygon", { class: "qs-head" + (item.dashed ? " qs-hollow" : ""), "data-tone": itemTone,
          points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
      }
      if (item.label) {
        const away = length < 3 ? [10, -10] : [((ex - cx) / (length || 1)) * 14, ((ey - cy) / (length || 1)) * 14];
        words.push(qsNode("text", { class: "qs-label", "data-tone": itemTone, x: ex + away[0], y: ey + away[1] + 4,
          "text-anchor": Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end" }, item.label + (clip < 1 ? " (off scale)" : "")));
      }
    }
  });
}

function qsDrawBars(bars, shapes, words) {
  const left = 120, right = 500, top = 40, bottom = 250, max = bars.max ?? 1;
  const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
  let grid = "";
  for (let v = 0; v <= max + 1e-9; v += max / 4) {
    grid += "M" + left + " " + Y(v) + "H" + right;
    words.push(qsNode("text", { class: "qs-tick", x: left - 8, y: Y(v) + 4, "text-anchor": "end" }, qsFmt(v)));
  }
  shapes.push(qsNode("path", { class: "qs-grid", d: grid }));
  shapes.push(qsNode("path", { class: "qs-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
  const slot = (right - left) / bars.items.length;
  bars.items.forEach((bar, index) => {
    const x = left + slot * index + slot * 0.25, w = slot * 0.5, y = Y(bar.value);
    shapes.push(qsNode("rect", { class: "qs-bar" + (bar.outline ? " qs-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: bottom - y }));
    words.push(qsNode("text", { class: "qs-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 22, "text-anchor": "middle" }, bar.label));
    words.push(qsNode("text", { class: "qs-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top + 12, y - 8), "text-anchor": "middle" },
      bar.value > max + 1e-9 ? qsFmt(bar.value) + " (off scale)" : qsFmt(bar.value)));
  });
  if (bars.note) words.push(qsNode("text", { class: "qs-caption", x: 310, y: 24, "text-anchor": "middle" }, bars.note));
}

// The sphere view. Bloch coordinates (x, y, z) have z up. The view turns by
// yaw about z and tilts by an elevation angle; both renderers share qsBlochFrame.
const QS_BLOCH = { cx: 280, cy: 152, r: 112 };

function qsBlochPoint({ polar, azimuth }) {
  const t = polar * Math.PI / 180, p = azimuth * Math.PI / 180;
  return [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
}

function qsBlochFrame(yaw, tilt) {
  const y = yaw * Math.PI / 180, t = tilt * Math.PI / 180;
  const right = [-Math.sin(y), Math.cos(y), 0];
  const up = [-Math.sin(t) * Math.cos(y), -Math.sin(t) * Math.sin(y), Math.cos(t)];
  const toward = [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)];
  return { right, up, toward };
}

function qsBlochProject(frame, point) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return { x: QS_BLOCH.cx + QS_BLOCH.r * dot(frame.right, point), y: QS_BLOCH.cy - QS_BLOCH.r * dot(frame.up, point), depth: dot(frame.toward, point) };
}

function qsDrawSphere(view, shapes, words) {
  const frame = qsBlochFrame(view.yaw, view.tilt);
  const P = point => qsBlochProject(frame, point);
  shapes.push(qsNode("circle", { class: "qs-sphere", cx: QS_BLOCH.cx, cy: QS_BLOCH.cy, r: QS_BLOCH.r }));
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
    shapes.push(qsNode("path", { class: "qs-wire", d: front }));
    shapes.push(qsNode("path", { class: "qs-wire qs-back", d: back }));
  }
  const axes = [[[0, 0, 1], "|0⟩"], [[0, 0, -1], "|1⟩"], [[1, 0, 0], "+x"], [[-1, 0, 0], "−x"], [[0, 1, 0], "+y"], [[0, -1, 0], "−y"]];
  for (const [direction, name] of axes) {
    const end = P(direction.map(n => n * 1.18)), start = P([0, 0, 0]);
    shapes.push(qsNode("line", { class: "qs-axis" + (end.depth < -0.05 ? " qs-back" : ""), x1: start.x, y1: start.y, x2: end.x, y2: end.y }));
    const tag = P(direction.map(n => n * 1.32));
    words.push(qsNode("text", { class: "qs-tick" + (tag.depth < -0.05 ? " qs-back" : ""), x: tag.x, y: tag.y + 4, "text-anchor": "middle" }, name));
  }
  const points = [...(view.points ?? [])];
  if (view.shown) points.push({ point: view.shown, tone: "accent", label: "marker", size: 7 });
  points.sort((a, b) => P(a.point).depth - P(b.point).depth);
  for (const item of points) {
    const q = P(item.point);
    shapes.push(qsNode("circle", { class: "qs-dot" + (q.depth < -0.02 ? " qs-back" : ""), "data-tone": item.tone, cx: q.x, cy: q.y, r: item.size ?? 5.5 }));
    if (item.label) {
      words.push(qsNode("text", { class: "qs-label" + (q.depth < -0.02 ? " qs-back" : ""), "data-tone": item.tone,
        x: q.x + (item.dx ?? 11), y: q.y + (item.dy ?? -9), "text-anchor": (item.dx ?? 11) < 0 ? "end" : "start" }, item.label));
    }
  }
}

// Three.js renderer for the sphere preview. It draws the same frame as the SVG
// fallback, so the SVG labels line up with the WebGL picture.
function qsCreateBloch(THREE, canvas, colors) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-QS_BLOCH.cx, 560 - QS_BLOCH.cx, QS_BLOCH.cy, QS_BLOCH.cy - 300, 1, 2000);
  camera.position.set(0, 0, 800);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-300, 400, 600);
  scene.add(sun);
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  scene.add(group);
  const disposables = [];
  const keep = item => { disposables.push(item); return item; };

  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 48, 32)),
    keep(new THREE.MeshLambertMaterial({ color: colors.sphere, transparent: true, opacity: 0.32, depthWrite: false })));
  group.add(ball);
  const wireMaterial = keep(new THREE.LineBasicMaterial({ color: colors.axis, transparent: true, opacity: 0.55 }));
  const ring = keep(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, k) => {
    const t = k / 96 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
  })));
  // Equator (xy), the xz meridian and the yz meridian.
  for (const turn of [[0, 0, 0], [Math.PI / 2, 0, 0], [Math.PI / 2, 0, Math.PI / 2]]) {
    const line = new THREE.Line(ring, wireMaterial);
    line.rotation.set(...turn, "ZYX");
    group.add(line);
  }
  const axisMaterial = keep(new THREE.LineBasicMaterial({ color: colors.axis }));
  const axisGeometry = keep(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.18, 0, 0), new THREE.Vector3(1.18, 0, 0), new THREE.Vector3(0, -1.18, 0),
    new THREE.Vector3(0, 1.18, 0), new THREE.Vector3(0, 0, -1.18), new THREE.Vector3(0, 0, 1.18)]));
  group.add(new THREE.LineSegments(axisGeometry, axisMaterial));
  const dotGeometry = keep(new THREE.SphereGeometry(1, 20, 14));
  const materials = new Map();
  const material = tone => {
    if (!materials.has(tone)) materials.set(tone, keep(new THREE.MeshBasicMaterial({ color: colors[tone] ?? colors.accent })));
    return materials.get(tone);
  };
  const dots = [];

  return {
    draw(view, width, height, low) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
      renderer.setSize(width, height, false);
      const f = qsBlochFrame(view.yaw, view.tilt), r = QS_BLOCH.r;
      group.matrix.set(
        r * f.right[0], r * f.right[1], r * f.right[2], 0,
        r * f.up[0], r * f.up[1], r * f.up[2], 0,
        r * f.toward[0], r * f.toward[1], r * f.toward[2], 0,
        0, 0, 0, 1);
      group.matrixWorldNeedsUpdate = true;
      const points = [...(view.points ?? [])];
      if (view.shown) points.push({ point: view.shown, tone: "accent", size: 7 });
      while (dots.length < points.length) {
        const mesh = new THREE.Mesh(dotGeometry, material("accent"));
        group.add(mesh);
        dots.push(mesh);
      }
      dots.forEach((mesh, index) => {
        const item = points[index];
        mesh.visible = Boolean(item);
        if (!item) return;
        mesh.material = material(item.tone);
        mesh.position.set(...item.point);
        mesh.scale.setScalar((item.size ?? 5.5) / r);
      });
      renderer.render(scene, camera);
    },
    invalidate() { /* Geometry lives on the GPU only while drawing; nothing to rebuild. */ },
    dispose() {
      for (const item of disposables) item.dispose();
      renderer.dispose();
    }
  };
}

const lesson = document.querySelector(".site-main.quantum-states-lesson");
if (lesson) {
  initializeLab(lesson);
  // The arcade is optional. If it fails, the lab above keeps working.
  try {
    initializeStatesArcade(lesson);
  } catch (error) {
    console.error("Quantum States Arcade could not start.", error);
  }
}
