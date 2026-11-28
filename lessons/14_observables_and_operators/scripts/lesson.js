const STATES = {
  zero: { label: "|0⟩", parts: [[1, 0], [0, 0]], denominatorSquared: 1 },
  one: { label: "|1⟩", parts: [[0, 0], [1, 0]], denominatorSquared: 1 },
  "plus-x": { label: "|+x⟩", parts: [[1, 0], [1, 0]], denominatorSquared: 2 },
  "minus-x": { label: "|−x⟩", parts: [[1, 0], [-1, 0]], denominatorSquared: 2 },
  "plus-y": { label: "|+y⟩", parts: [[1, 0], [0, 1]], denominatorSquared: 2 },
  "minus-y": { label: "|−y⟩", parts: [[1, 0], [0, -1]], denominatorSquared: 2 },
  complex: { label: "Complex preparation", parts: [[3, 0], [0, 4]], denominatorSquared: 25 }
};

const OBSERVABLES = {
  x: {
    symbol: "X",
    matrix: [[[0, 0], [1, 0]], [[1, 0], [0, 0]]],
    eigenkets: ["plus-x", "minus-x"]
  },
  y: {
    symbol: "Y",
    matrix: [[[0, 0], [0, -1]], [[0, 1], [0, 0]]],
    eigenkets: ["plus-y", "minus-y"]
  },
  z: {
    symbol: "Z",
    matrix: [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]],
    eigenkets: ["zero", "one"]
  }
};

const READINGS = [
  { label: "+1", spoken: "plus one", slot: "positive" },
  { label: "−1", spoken: "minus one", slot: "negative" }
];

function multiply([a, b], [c, d]) {
  return [a * c - b * d, a * d + b * c];
}

function conjugate([real, imaginary]) {
  return [real, -imaginary];
}

function rowProduct(row, column) {
  const [a, b] = multiply(row[0], column[0]);
  const [c, d] = multiply(row[1], column[1]);
  return [a + c, b + d];
}

function squaredMagnitude([real, imaginary]) {
  return real * real + imaginary * imaginary;
}

// Integer numerators and square-root denominators preserve exact cancellations.
function buildModel(preparationKey, observableKey) {
  const preparation = STATES[preparationKey];
  const observable = OBSERVABLES[observableKey];
  const product = {
    parts: observable.matrix.map(row => rowProduct(row, preparation.parts)),
    denominatorSquared: preparation.denominatorSquared
  };

  const outcomes = observable.eigenkets.map((key, index) => {
    const eigenket = STATES[key];
    const bra = {
      parts: eigenket.parts.map(conjugate),
      denominatorSquared: eigenket.denominatorSquared
    };
    const overlap = {
      parts: rowProduct(bra.parts, preparation.parts),
      denominatorSquared: bra.denominatorSquared * preparation.denominatorSquared
    };
    const weight = squaredMagnitude(overlap.parts);

    return {
      ...READINGS[index],
      key,
      eigenket,
      bra,
      overlap,
      weight,
      probability: weight / overlap.denominatorSquared
    };
  });

  return { preparation, observable, product, outcomes };
}

function sampleOutcome(outcomes, random = Math.random) {
  const positive = outcomes[0].probability;
  if (positive === 1) return outcomes[0];
  if (positive === 0) return outcomes[1];
  return random() < positive ? outcomes[0] : outcomes[1];
}

function gcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function fraction(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  const top = numerator / divisor;
  const bottom = denominator / divisor;
  return bottom === 1 ? String(top) : `${top}/${bottom}`;
}

function radicalFactors(squared) {
  let factor = Math.floor(Math.sqrt(squared));
  while (squared % (factor * factor) !== 0) factor--;
  return [factor, squared / (factor * factor)];
}

function radicalText(factor, radical) {
  if (radical === 1) return String(factor);
  return factor === 1 ? `√${radical}` : `(${factor}√${radical})`;
}

function complexText([real, imaginary]) {
  if (imaginary === 0) return String(real).replace("-", "−");

  const magnitude = Math.abs(imaginary);
  const term = magnitude === 1 ? "i" : `${magnitude}i`;
  if (real === 0) return imaginary < 0 ? `−${term}` : term;
  return `${String(real).replace("-", "−")} ${imaginary < 0 ? "−" : "+"} ${term}`;
}

function amplitudeText([real, imaginary], denominatorSquared) {
  if (real === 0 && imaginary === 0) return "0";

  const [factor, radical] = radicalFactors(denominatorSquared);
  const divisor = gcd(gcd(Math.abs(real), Math.abs(imaginary)), factor);
  const re = real / divisor;
  const im = imaginary / divisor;
  const denominator = radicalText(factor / divisor, radical);
  const numerator = complexText([re, im]);

  if (denominator === "1") return numerator;
  const top = re !== 0 && im !== 0 ? `(${numerator})` : numerator;
  return `${top}/${denominator}`;
}

function expansion({ parts, denominatorSquared }, bra = false) {
  const terms = [];

  for (const [index, [real, imaginary]] of parts.entries()) {
    if (real === 0 && imaginary === 0) continue;

    const negative = real < 0 || (real === 0 && imaginary < 0);
    const sign = negative ? -1 : 1;
    const coefficient = [sign * real, sign * imaginary];
    const bare = complexText(coefficient);
    const text = coefficient[0] !== 0 && coefficient[1] !== 0 ? `(${bare})` : bare;
    const ket = bra ? `⟨${index}|` : `|${index}⟩`;
    const prefix = terms.length === 0
      ? (negative ? "−" : "")
      : (negative ? " − " : " + ");
    terms.push(prefix + (text === "1" ? "" : text) + ket);
  }

  const numerator = terms.join("") || "0";
  if (denominatorSquared === 1) return numerator;
  return `(${numerator})/${radicalText(...radicalFactors(denominatorSquared))}`;
}

function namedEigenket(ket) {
  const text = expansion(ket);
  return text === ket.label ? text : `${ket.label} = ${text}`;
}

function namedBra(ket, bra) {
  const label = ket.label.replace("|", "⟨").replace("⟩", "|");
  const text = expansion(bra, true);
  return text === label ? text : `${label} = ${text}`;
}

function productTerms(row, rowDenominatorSquared, column) {
  const factors = row.map((parts, index) => {
    const first = amplitudeText(parts, rowDenominatorSquared);
    const second = amplitudeText(column.parts[index], column.denominatorSquared);
    const group = text => /^[0-9]+$/.test(text) ? text : `(${text})`;
    return `${group(first)} × ${group(second)}`;
  });
  return factors.join(" + ");
}

function percent(probability) {
  return `${Number((100 * probability).toFixed(2))}%`;
}

const OPENING_MODEL = buildModel("zero", "x");

const DEFINITE_OBSERVABLE = Object.keys(OBSERVABLES).find(key =>
  buildModel("plus-y", key).outcomes.some(outcome => outcome.probability === 1)
);

const OPENING_NEGATIVE_KET = OPENING_MODEL.outcomes[1];

const QUESTIONS = {
  definite: {
    answer: DEFINITE_OBSERVABLE,
    correct: "Correct. Y|+y⟩ = (+1)|+y⟩. The overlap with |+y⟩ has squared magnitude 1, so +1 is definite.",
    retry: "Compare the product with the prepared ket. A definite reading requires the product to equal the input times that eigenvalue."
  },
  update: {
    answer: OPENING_NEGATIVE_KET.key,
    correct: `Correct. The reading −1 selects the X eigenket ${namedEigenket(OPENING_NEGATIVE_KET.eigenket)}.`,
    retry: "Use the eigenket associated with the observed value −1. The input and the mathematical product answer different questions."
  }
};

function wireChallenge(find) {
  const form = find("challenge");
  const panels = [...form.querySelectorAll("[data-operator-question]")];
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
    panels.forEach((panel, position) => {
      panel.hidden = position !== index;
    });
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

    const question = QUESTIONS[panel.dataset.operatorQuestion];
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

function initializeWorkbench(root) {
  const find = id => root.querySelector(`#operator-${id}`);
  const write = (id, text) => { find(id).textContent = text; };
  const stateSelect = find("state");
  const observableSelect = find("observable");
  const prediction = find("prediction");
  let preparationKey = "zero";
  let observableKey = "x";
  let model = OPENING_MODEL;
  let unlocked = false;

  function renderProduct() {
    const { preparation, observable, product } = model;
    const { matrix, symbol } = observable;

    write("prepared-ket", `Prepared ket |ψ⟩ = ${expansion(preparation)}`);
    write("symbol", symbol);
    find("matrix").setAttribute("aria-label", `Pauli ${symbol} matrix in the ordered zero-one basis`);

    matrix.forEach((row, rowIndex) => {
      row.forEach((entry, columnIndex) => {
        write(`m${rowIndex}${columnIndex}`, complexText(entry));
      });
    });

    const [alpha, beta] = preparation.parts.map(parts =>
      amplitudeText(parts, preparation.denominatorSquared)
    );
    const [outputZero, outputOne] = product.parts.map(parts =>
      amplitudeText(parts, product.denominatorSquared)
    );

    write("input-alpha", alpha);
    write("input-beta", beta);
    write("output-zero", outputZero);
    write("output-one", outputOne);
    write("row-zero", `${productTerms(matrix[0], 1, preparation)} = ${outputZero}`);
    write("row-one", `${productTerms(matrix[1], 1, preparation)} = ${outputOne}`);
    write("product-ket", `${symbol}|ψ⟩ = ${expansion(product)}`);
  }

  function renderSpectrum() {
    find("spectrum").hidden = !unlocked;
    find("spectrum-lock").hidden = unlocked;
    find("measure-lock").hidden = unlocked;
    find("measure-controls").disabled = !unlocked;
    if (!unlocked) return;

    const { observable, preparation, outcomes } = model;
    write("spectrum-note", `${observable.symbol} has possible readings +1 and −1. The bars show model probabilities. Each overlap uses the conjugated eigenket coefficients.`);

    for (const outcome of outcomes) {
      const { slot, eigenket, bra, overlap, weight, probability } = outcome;
      const amplitude = amplitudeText(overlap.parts, overlap.denominatorSquared);
      write(`${slot}-ket`, namedEigenket(eigenket));
      write(`${slot}-bra`, namedBra(eigenket, bra));
      write(`${slot}-overlap`, `${productTerms(bra.parts, bra.denominatorSquared, preparation)} = ${amplitude}`);
      write(`${slot}-weight`, `|${amplitude}|² = ${fraction(weight, overlap.denominatorSquared)}`);

      const meter = find(`${slot}-probability`);
      meter.value = probability;
      meter.textContent = percent(probability);
      write(`${slot}-probability-text`, meter.textContent);
    }

    const definite = outcomes.find(outcome => outcome.probability === 1);
    write("eigenstate-note", definite
      ? `${observable.symbol}|ψ⟩ = (${definite.label})|ψ⟩. The prepared ket is an eigenstate of this observable, so ${definite.label} is certain.`
      : "Both eigenkets have nonzero squared overlaps with this preparation. Either reading can occur.");
  }

  function clearReading(note) {
    write("reading", "—");
    find("reading").dataset.outcome = "none";
    write("post-ket", "—");
    write("result-note", note);
  }

  function changeSetup() {
    const nextPreparation = stateSelect.value;
    const nextObservable = observableSelect.value;
    if (nextPreparation === preparationKey && nextObservable === observableKey) return;

    preparationKey = nextPreparation;
    observableKey = nextObservable;
    model = buildModel(preparationKey, observableKey);
    clearReading("Setup changed. A new measurement will use the selected preparation.");
    renderProduct();
    renderSpectrum();
    write("announcement", `${model.preparation.label} prepared. Observable ${model.observable.symbol} selected. Last reading cleared.`);
  }

  stateSelect.addEventListener("change", changeSetup);
  observableSelect.addEventListener("change", changeSetup);

  prediction.addEventListener("change", () => { write("prediction-feedback", ""); });
  prediction.addEventListener("submit", event => {
    event.preventDefault();
    const choice = prediction.querySelector("input[name='operator-guess']:checked");
    if (!choice) return;

    unlocked = true;
    renderSpectrum();

    const feedback = {
      readings: "Correct. Measuring X on |0⟩ gives +1 or −1, each with probability 1/2.",
      ket: "The mathematical product X|0⟩ is |1⟩. A measurement of X reports +1 or −1, each with probability 1/2.",
      zero: "Zero is the average across many readings in this setup. One X measurement reports either +1 or −1, each with probability 1/2."
    };
    write("prediction-feedback", `${feedback[choice.value]} Try the simulated measurement to see the conditional ket.`);
  });

  find("measure").addEventListener("click", () => {
    if (!unlocked) return;

    const outcome = sampleOutcome(model.outcomes);
    write("reading", outcome.label);
    find("reading").dataset.outcome = outcome.slot;
    write("post-ket", namedEigenket(outcome.eigenket));
    write("result-note", "This ket belongs to the measured system. The next click uses a fresh copy of the selected preparation.");
    write("announcement", `Simulated ${model.observable.symbol} reading: ${outcome.spoken}. The measured system is now in ${outcome.eigenket.label}. The preparation for fresh trials is unchanged.`);
  });

  find("reset").addEventListener("click", () => {
    preparationKey = "zero";
    observableKey = "x";
    stateSelect.value = preparationKey;
    observableSelect.value = observableKey;
    model = OPENING_MODEL;
    unlocked = false;
    prediction.reset();
    write("prediction-feedback", "");
    clearReading("No measurement has been made. The prepared ket is shown in the calculation panel.");
    renderProduct();
    renderSpectrum();
    write("announcement", "Workbench reset to ket zero and observable X. Answer the opening prediction to enable measurement.");
  });

  wireChallenge(find);
  stateSelect.value = preparationKey;
  observableSelect.value = observableKey;
  renderProduct();
  renderSpectrum();
  for (const id of ["setup-controls", "prediction-controls", "challenge-controls"]) {
    find(id).disabled = false;
  }
  find("static-note").hidden = true;
}

const lesson = document.querySelector(".site-main.operators-lesson");
if (lesson) initializeWorkbench(lesson);


// ===========================================================================
// Observables Arcade (optional practice). Everything below uses the op- prefix
// so it never touches the Operator Workbench above, which uses operator-.
// The whole arcade runs inside one try block: if anything in it fails, the
// workbench and challenge keep working.
// ===========================================================================

try {
  const OP_TOLERANCE = 0.002; // typed answers, per real or imaginary part
  const OP_DERIVED = 0.005;   // probabilities computed from a setting you build
  const OP_ANGLE = 1;         // degrees
  const OP_SVG = "http://www.w3.org/2000/svg";
  const OP_R = Math.SQRT1_2;
  const opNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

  function opFmt(value) {
    if (!Number.isFinite(value)) return "undefined";
    return opNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
  }

  // An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
  const opTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
  const opFits = (value, answer) => Math.abs(value - answer) <= (opTerminates(answer) ? 1e-9 : OP_TOLERANCE + 1e-12);
  const opNear = (value, target, tolerance = OP_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
  const opWrap = (degrees, turn = 360) => ((degrees % turn) + turn) % turn;
  const opAngleGap = (a, b, turn = 360) => { const d = opWrap(a - b, turn); return Math.min(d, turn - d); };
  // Angles that differ by whole turns are equal.
  const opAngleFits = (a, b, turn = 360) => opAngleGap(a, b, turn) <= OP_ANGLE + 1e-9;

  // Parse numbers such as 2, −1.5, 3/5, √2, 1/√2 or (1 + √3)/2.
  // This is a small arithmetic reader (+ − × / √ and brackets), never eval.
  function opParse(raw) {
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

  function opRandom(seed) {
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
  function opSeed(c, seed = 1) { c.s.seed = seed; c.s.rng = opRandom(seed * 7919 + c.key.length); }
  const opReseed = (c, after = "") => {
    opSeed(c, c.s.seed + 1);
    return "Seed " + c.s.seed + ". New trials use a fresh sequence. Reset this station to return to seed 1." + after;
  };
  const opPick = (rng, probabilities) => {
    let r = rng(), k = 0;
    while (k < probabilities.length - 1 && r >= probabilities[k]) { r -= probabilities[k]; k++; }
    return k;
  };
  const opCount = (rng, p, n) => { let k = 0; for (let t = 0; t < n; t++) if (rng() < p) k++; return k; };

  const opGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
  const opSetup = message => opGrade(false, message);

  function opLabelText(field) {
    const label = field.closest("label");
    if (!label) return "the selected input";
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input, select, output").forEach(node => node.remove());
    return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
  }

  class OpFieldError extends Error {
    constructor(field, detail = "", custom = false) {
      super("Check " + opLabelText(field) + "." + (detail ? " " + detail : ""));
      this.field = field;
      this.detail = detail;
      this.custom = custom;
    }
  }

  function opSetText(element, text) {
    text = String(text ?? "");
    if (element && element.textContent !== text) element.textContent = text;
  }

  // Plot builders used by the station show() functions. A plan holds panels laid
  // out side by side (planes, charts, bars, polarizer stacks, chains), or one 3D view.
  const opArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
  const opPlane = (caption, items, extra = {}) => ({ kind: "plane", caption, items, limit: 1, circle: 1, axes: ["|0⟩", "|1⟩"], ...extra });
  const opBars = (caption, items, extra = {}) => ({ kind: "bars", caption, items, ...extra });
  const opChart = (caption, extra) => ({ kind: "chart", caption, x: [0, 1], y: [0, 1], xTicks: [0, 1], yTicks: [0, 0.5, 1], xLabel: "", ...extra });
  const opSweep = (f, x0, x1, n = 120) => Array.from({ length: n + 1 }, (_, k) => {
    const x = x0 + (x1 - x0) * k / n;
    return [x, f(x)];
  });
  // A real ket drawn as an arrow in the |0⟩/|1⟩ plane.
  const opKetArrow = (ket, tone, label, extra = {}) => opArrow([ket[0][0], ket[1][0]], tone, label, extra);
  const opAxisRays = (theta, extra = {}) => [{ angle: theta, through: true, solid: true, tone: "angle", ...extra }, { angle: theta + 90, through: true, tone: "minus", ...extra }];


  // Complex numbers are [real, imaginary] pairs. A ket is a list of complex
  // coordinates in the ordered basis (|0⟩, |1⟩, …); a matrix is a list of rows.
  const opAdd = ([a, b], [c, d]) => [a + c, b + d];
  const opSub = ([a, b], [c, d]) => [a - c, b - d];
  const opMul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  const opConj = ([a, b]) => [a, -b];
  const opScale = ([a, b], k) => [a * k, b * k];
  const opAbs2 = ([a, b]) => a * a + b * b;
  const opAbs = ([a, b]) => Math.hypot(a, b);
  const opRad = degrees => degrees * Math.PI / 180;
  const opPolar = (r, degrees) => [r * Math.cos(opRad(degrees)), r * Math.sin(opRad(degrees))];
  const opDiv = (z, w) => opScale(opMul(z, opConj(w)), 1 / opAbs2(w));
  const opZ = v => (typeof v === "number" ? [v, 0] : v);

  // ⟨u|v⟩ = Σ uₖ* vₖ. The bra carries the conjugate.
  const opInner = (u, v) => u.reduce((sum, z, k) => opAdd(sum, opMul(opConj(z), v[k])), [0, 0]);
  const opNorm2 = v => v.reduce((sum, z) => sum + opAbs2(z), 0);
  const opNormalize = v => { const n = Math.sqrt(opNorm2(v)); return v.map(z => opScale(z, 1 / n)); };
  const opProb = (a, psi) => opAbs2(opInner(a, psi)) / (opNorm2(a) * opNorm2(psi));
  const opKet = (...entries) => opNormalize(entries.map(opZ));
  const opApply = (A, v) => A.map(row => row.reduce((sum, z, k) => opAdd(sum, opMul(z, v[k])), [0, 0]));
  const opMatMul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((sum, z, k) => opAdd(sum, opMul(z, B[k][j])), [0, 0])));
  const opDagger = A => A[0].map((_, j) => A.map(row => opConj(row[j])));
  const opMatAdd = (A, B) => A.map((row, i) => row.map((z, j) => opAdd(z, B[i][j])));
  const opMatSub = (A, B) => A.map((row, i) => row.map((z, j) => opSub(z, B[i][j])));
  const opMatScale = (A, c) => A.map(row => row.map(z => opMul(z, opZ(c))));
  const opMatGap = (A, B) => Math.max(...A.flatMap((row, i) => row.map((z, j) => opAbs(opSub(z, B[i][j])))));
  const opIdentity = (n = 2) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => [i === j ? 1 : 0, 0]));
  const opHermGap = A => opMatGap(A, opDagger(A));
  const opOuter = (u, v) => u.map(a => v.map(b => opMul(a, opConj(b))));
  // A 2×2 matrix from four entries, each a real number or a [re, im] pair.
  const opM = (a, b, c, d) => [[opZ(a), opZ(b)], [opZ(c), opZ(d)]];
  const opTrace = A => A.reduce((sum, row, i) => opAdd(sum, row[i]), [0, 0]);
  const opDet2 = A => opSub(opMul(A[0][0], A[1][1]), opMul(A[0][1], A[1][0]));

  function opSqrtC([a, b]) {
    const r = Math.hypot(a, b);
    const re = Math.sqrt(Math.max(0, (r + a) / 2)), im = Math.sqrt(Math.max(0, (r - a) / 2));
    return [re, b < 0 ? -im : im];
  }

  // Eigenvalues and eigenkets of any 2×2 matrix: roots of a² − (tr A)a + det A = 0.
  // Pairs are sorted by real part, then imaginary part. A defective matrix returns
  // the same eigenket twice.
  function opEig2(A) {
    const t = opTrace(A), half = opScale(t, 0.5);
    const s = opSqrtC(opSub(opMul(half, half), opDet2(A)));
    const values = [opSub(half, s), opAdd(half, s)];
    const eps = 1e-12;
    const vector = value => {
      if (opAbs(A[0][1]) > eps) return opNormalize([A[0][1], opSub(value, A[0][0])]);
      if (opAbs(A[1][0]) > eps) return opNormalize([opSub(value, A[1][1]), A[1][0]]);
      return opAbs(opSub(value, A[0][0])) <= opAbs(opSub(value, A[1][1])) ? [[1, 0], [0, 0]] : [[0, 0], [1, 0]];
    };
    let pairs = values.map(value => ({ value, ket: vector(value) }));
    if (opAbs(A[0][1]) <= eps && opAbs(A[1][0]) <= eps) {
      pairs = [{ value: A[0][0], ket: [[1, 0], [0, 0]] }, { value: A[1][1], ket: [[0, 0], [1, 0]] }];
    }
    return pairs.sort((p, q) => p.value[0] - q.value[0] || p.value[1] - q.value[1]);
  }

  // How close |v⟩ is to an eigenket of A: the Rayleigh value a = ⟨v|A|v⟩/⟨v|v⟩ and
  // the relative residual ‖A|v⟩ − a|v⟩‖/‖v‖. Scale- and phase-invariant.
  function opEigenTest(A, v) {
    const n2 = opNorm2(v);
    if (n2 < 1e-12) return { zero: true, value: [NaN, NaN], residual: Infinity };
    const value = opScale(opInner(v, opApply(A, v)), 1 / n2);
    const residual = Math.sqrt(opNorm2(opApply(A, v).map((z, k) => opSub(z, opMul(value, v[k])))) / n2);
    return { zero: false, value, residual };
  }
  const opIsEigen = (A, v, reading = null) => {
    const test = opEigenTest(A, v);
    return !test.zero && test.residual <= OP_DERIVED && (reading === null || opAbs(opSub(test.value, opZ(reading))) <= OP_DERIVED);
  };
  // Same ray: equal up to a global phase and length.
  const opParallel = (u, v) => opNorm2(u) > 1e-12 && opNorm2(v) > 1e-12 && opProb(u, v) >= 1 - OP_DERIVED;

  // Readings typed in any order.
  function opSameSet(typed, exact) {
    if (typed.length !== exact.length) return false;
    const left = [...exact];
    for (const value of typed) {
      const k = left.findIndex(target => opFits(value, target));
      if (k < 0) return false;
      left.splice(k, 1);
    }
    return true;
  }

  function opCx(z) {
    const [a, b] = opZ(z);
    const re = Math.abs(a) < 5e-10 ? 0 : a, im = Math.abs(b) < 5e-10 ? 0 : b;
    if (im === 0) return opFmt(re);
    const size = Math.abs(im) === 1 ? "i" : opFmt(Math.abs(im)) + "i";
    if (re === 0) return (im < 0 ? "−" : "") + size;
    return opFmt(re) + (im < 0 ? " − " : " + ") + size;
  }
  const opKetText = ket => "(" + ket.map(opCx).join(", ") + ")ᵀ";
  const opMatText = A => "rows " + A.map(row => "[" + row.map(opCx).join(", ") + "]").join(", ");
  const opWhere = (i, j) => "row " + (i + 1) + ", column " + (j + 1);

  // Exact matrix entry check: returns the cells that miss, as "row r, column c".
  function opMatMisses(typed, exact) {
    const misses = [];
    exact.forEach((row, i) => row.forEach((z, j) => {
      const [re, im] = typed[i][j];
      if (!opFits(re, z[0]) || !opFits(im, z[1])) misses.push(opWhere(i, j));
    }));
    return misses;
  }
  const opMissText = misses => misses.length === 1 ? misses[0][0].toUpperCase() + misses[0].slice(1) + " is" : misses.length + " cells are";

  // Degrees with radians alongside: 60° · π/3 rad.
  function opRadText(degrees) {
    const k = degrees / 7.5;
    if (Math.abs(k - Math.round(k)) > 1e-9) return "≈ " + opFmt(degrees * Math.PI / 180);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let n = Math.round(k), d = 24;
    if (n === 0) return "0";
    const g = gcd(Math.abs(n), d);
    n /= g; d /= g;
    const top = n === 1 ? "π" : n === -1 ? "−π" : opFmt(n) + "π";
    return d === 1 ? top : top + "/" + d;
  }
  const opAngleText = degrees => opFmt(degrees) + "° · " + opRadText(degrees) + " rad";

  // The matrices and kets the stations share.
  const OP_MATS = {
    id: opM(1, 0, 0, 1),
    x: opM(0, 1, 1, 0),
    y: opM(0, [0, -1], [0, 1], 0),
    z: opM(1, 0, 0, -1),
    m6: opM(6, -2, -2, 3),
    h14: opM(2, [1, -1], [1, 1], 3),
    d25: opM(2, 0, 0, 5)
  };
  OP_MATS.m6b = opMatSub(opMatScale(OP_MATS.m6, 2), OP_MATS.id);
  OP_MATS.i3y = opMatAdd(OP_MATS.id, opMatScale(OP_MATS.y, 3));
  OP_MATS.i2y = opMatSub(OP_MATS.id, opMatScale(OP_MATS.y, 2));
  OP_MATS.ny = opMatScale(OP_MATS.y, -1);
  OP_MATS.p11 = opM(1, 1, 1, 1);
  OP_MATS.q31 = opM(3, -1, -1, 3);
  const OP_NAMES = {
    id: "I", x: "X", y: "Y", z: "Z", m6: "M₆ (rows [6, −2], [−2, 3])", h14: "H (rows [2, 1 − i], [1 + i, 3])", d25: "B (rows [2, 0], [0, 5])",
    m6b: "2M₆ − I", i3y: "I + 3Y", i2y: "I − 2Y (rows [1, 2i], [−2i, 1])", ny: "−Y (rows [0, i], [−i, 0])",
    p11: "rows [1, 1], [1, 1]", q31: "rows [3, −1], [−1, 3]"
  };
  const OP_KETS = {
    zero: opKet(1, 0), one: opKet(0, 1),
    plusx: opKet(1, 1), minusx: opKet(1, -1),
    plusy: opKet(1, [0, 1]), minusy: opKet(1, [0, -1]),
    ot: opKet(1, 2), tf: opKet(3, 4)
  };
  const OP_KET_NAMES = {
    zero: "|0⟩", one: "|1⟩", plusx: "|+x⟩", minusx: "|−x⟩", plusy: "|+y⟩", minusy: "|−y⟩",
    ot: "(|0⟩ + 2|1⟩)/√5", tf: "(3|0⟩ + 4|1⟩)/5", my: "|−y⟩"
  };

  // Readings of a Hermitian 2×2 matrix as real numbers, low to high, with eigenkets.
  const opSpectrum = A => opEig2(A).map(({ value, ket }) => ({ a: value[0], ket }));

  // Plot builders added for this arcade: a matrix drawn with brackets, and a number line.
  const opMatrixPanel = (caption, rows, extra = {}) => ({
    kind: "matrix", caption, rows: rows.map(row => row.map(z => (typeof z === "string" ? z : opCx(z)))), ...extra
  });
  const opChain = (caption, items, extra = {}) => ({ kind: "chain", caption, items, ...extra });
  const opLine = (caption, extra) => ({ kind: "line", caption, ...extra });

  // ---------------------------------------------------------------------------
  // Stations 1–5 · What an operator does, and finding eigenkets.
  // ---------------------------------------------------------------------------

  // 1 · Product, Reading, or Ket? Each story is a timeline: prepare → multiply → measure → afterwards.
  const OP_SORT = {
    ymx: {
      prep: "|−y⟩", obs: "X", product: "−i|+y⟩", reading: "+1 or −1", after: "|+x⟩ or |−x⟩",
      answers: ["product", "reading", "ket", "product", "reading"],
      work: "Multiplying gives X(1, −i)ᵀ/√2 = (−i, 1)ᵀ/√2 = −i|+y⟩: a calculation, statements 1 and 4. The instrument reports an eigenvalue of X, +1 or −1, each with probability |⟨±x|−y⟩|² = 1/2: statements 2 and 5. After +1 the measured system is in |+x⟩ = (|0⟩ + |1⟩)/√2: statement 3."
    },
    diag: {
      prep: "|+x⟩", obs: "B", product: "(2|0⟩ + 5|1⟩)/√2", reading: "2 or 5", after: "|0⟩ or |1⟩",
      answers: ["product", "reading", "ket", "reading"],
      work: "B|+x⟩ = (2|0⟩ + 5|1⟩)/√2 is the product, and it isn’t even normalized: its squared norm is (4 + 25)/2 = 29/2. The instrument shows an eigenvalue, 2 or 5. After 5 is observed the system is in the eigenket |1⟩."
    },
    same: {
      prep: "|−y⟩", obs: "Y", product: "−|−y⟩", reading: "−1, certain", after: "|−y⟩",
      answers: ["product", "reading", "ket", "product"],
      work: "|−y⟩ is an eigenket of Y, so the product is Y|−y⟩ = −|−y⟩, the input times the eigenvalue: statements 1 and 4. The reading −1 is certain: statement 2. The ket after the reading is |−y⟩ itself: statement 3. All three look alike here, but they still answer different questions."
    },
    repeat: {
      prep: "(2|0⟩ + |1⟩)/√5", obs: "X, then X again", product: "X|+x⟩ = |+x⟩", reading: "+1, then +1", after: "|+x⟩",
      answers: ["reading", "ket", "product", "reading"],
      work: "The first reading +1 had probability |⟨+x|ψ⟩|² = (2 + 1)²/10 = 9/10, and it leaves the system in |+x⟩. Measuring X again on that same system gives +1 with certainty and leaves it in |+x⟩. X|+x⟩ = |+x⟩ is the product that explains why: |+x⟩ is an eigenket with eigenvalue +1."
    }
  };

  function opSortGrader(key) {
    return c => {
      const card = OP_SORT[key];
      const picks = card.answers.map((_, k) => c.choice(key + "-" + (k + 1)));
      const wrong = picks.filter((pick, k) => pick !== card.answers[k]).length;
      return opGrade(wrong === 0, (wrong === 1 ? "1 statement is" : wrong + " statements are") + " in the wrong place. For each one, ask: is it a calculation, a number on the instrument, or the state afterwards?", card.work);
    };
  }

  // 2 · Dagger Workshop.
  const OP_DAGGER = {
    one: { A: opM(1, [2, 1], [0, 3], 4), herm: "no" },
    two: { A: opM(3, [1, -2], [1, 2], -1), herm: "yes" },
    diag: { A: opM([0, 2], 1, 1, 0), herm: "no" },
    anti: { A: opM(0, [0, 1], [0, 1], 0), herm: "no" },
    order: { A: opMatMul(OP_MATS.z, OP_MATS.x) }
  };
  const OP_DAGGER_WORK = {
    one: "Transpose: rows [1, 3i], [2 + i, 4]. Conjugate: rows [1, −3i], [2 − i, 4]. That differs from A (for example A₁₂ = 2 + i but A†₁₂ = −3i), so A is not Hermitian.",
    two: "Transpose: rows [3, 1 + 2i], [1 − 2i, −1]. Conjugate: rows [3, 1 − 2i], [1 + 2i, −1], which is A again. The diagonal is real and the off-diagonal entries are conjugates, so A is Hermitian.",
    diag: "Transpose leaves A unchanged because it is symmetric, but conjugating turns 2i into −2i: A† has rows [−2i, 1], [1, 0]. An imaginary diagonal entry is enough to break A = A†.",
    anti: "Transpose leaves it unchanged; conjugating gives rows [0, −i], [−i, 0] = −A. This matrix is anti-Hermitian. It is iX, not Y: Y has −i above the diagonal and +i below.",
    order: "ZX has rows [0, 1], [−1, 0]. Transpose: rows [0, −1], [1, 0]; every entry is real, so that is (ZX)†. Compare XZ: rows [0, −1], [1, 0]. So (ZX)† = XZ = X†Z†: the dagger reverses the order."
  };

  function opDaggerGrader(key) {
    return c => {
      const card = OP_DAGGER[key];
      const misses = opMatMisses(c.mat("d"), opDagger(card.A));
      if (misses.length) return opGrade(false, opMissText(misses) + " not yet right. Entry (i, j) of A† is the conjugate of entry (j, i) of A.");
      if (key === "order") {
        return opGrade(c.choice("order-pick") === "xz", "Your (ZX)† is right. Now multiply out XZ and ZX and compare.", OP_DAGGER_WORK.order);
      }
      return opGrade(c.choice(key + "-herm") === card.herm, "Your A† is right. Compare it entry by entry with A.", OP_DAGGER_WORK[key]);
    };
  }

  // 3 · Hermitian Builder. Each card builds A from its own boxes; blanks show as ?.
  function opBuilderMatrix(c, key) {
    const q = name => c.quietCx(name);
    if (key === "fill") return [[[4, 0], [2, -3]], [q("fill-z"), [-1, 0]]];
    if (key === "free") return [[q("free-p"), [0, 1]], [q("free-z"), q("free-q")]];
    if (key === "stuck") return [[[2, 1], [1, 0]], [[1, 0], null]];
    if (key === "column") return c.quietMat("column") ?? [[null, null], [null, null]];
    return null;
  }

  // 4 · Why Not an Observable?
  function opNonModel(c) {
    const fam = c.val("fam"), k = Math.round(c.num("k") * 100) / 100;
    const A = fam === "m" ? opM(0, 1, k, 0) : opM(1, k, 0, 2);
    const pairs = opEig2(A), psi = OP_KETS[c.val("psi")];
    const [e1, e2] = pairs.map(p => p.ket);
    const p1 = opProb(e1, psi), p2 = opProb(e2, psi);
    const defective = opProb(e1, e2) > 1 - 1e-9 && opAbs(opSub(pairs[0].value, pairs[1].value)) < 1e-9;
    return { fam, k, A, pairs, e1, e2, overlap: opProb(e1, e2), p1, p2, sum: p1 + p2, herm: opHermGap(A) < 1e-9, defective, psi };
  }

  // 5 · Eigenket Finder.
  const OP_EIGEN = {
    h14: { A: OP_MATS.h14, readings: [1, 4], target: 4, normalized: true,
      work: "tr A = 5 and det A = 6 − (1 − i)(1 + i) = 6 − 2 = 4, so a² − 5a + 4 = (a − 1)(a − 4) = 0: readings 1 and 4. For a = 4 the first row of A − 4I is [−2, 1 − i], so −2v₀ + (1 − i)v₁ = 0 and v = (1 − i, 2)ᵀ. Its squared length is |1 − i|² + 4 = 6, so the normalized eigenket is (1 − i, 2)ᵀ/√6, or any phase times it." },
    two: { A: opM(0, [0, 2], [0, -2], 3), readings: [-1, 4], target: -1, normalized: false,
      work: "tr A = 3 and det A = 0 − (2i)(−2i) = −4, so a² − 3a − 4 = (a − 4)(a + 1) = 0: readings 4 and −1. For a = −1 the first row of A + I is [1, 2i], so v₀ = −2iv₁. Taking v₁ = 1 gives (−2i, 1)ᵀ; multiplying by i gives (2, i)ᵀ. Both are the same ray." },
    five: { A: opM(3, [0, 4], [0, -4], -3), readings: [-5, 5], target: 5, normalized: true,
      work: "tr A = 0 and det A = −9 − (4i)(−4i) = −9 − 16 = −25, so a² = 25: readings ±5. For a = 5 the first row of A − 5I is [−2, 4i], so v₀ = 2iv₁ and v = (2i, 1)ᵀ/√5. Multiplying by −i gives (2, −i)ᵀ/√5, the same eigenket with a different global phase." },
    partner: { A: OP_MATS.h14, target: 1, normalized: false, noReadings: true,
      work: "Eigenkets of a Hermitian matrix for different readings are orthogonal. In two dimensions the partner of (v₀, v₁) is (−v₁*, v₀*): from (1 − i, 2) that is (−2, 1 + i), up to 1/√6. Check: ⟨4|1⟩ ∝ (1 + i)(−2) + 2(1 + i) = 0. Multiplying by −(1 − i)/2 gives (1 − i, −1)ᵀ, the same ray." }
  };

  function opEigenGrader(key) {
    return c => {
      const card = OP_EIGEN[key];
      if (!card.noReadings) {
        const typed = [c.ans("r1"), c.ans("r2")];
        if (!opSameSet(typed, card.readings)) return opGrade(false, "Those readings don’t solve det(A − aI) = 0. They must add to tr A and multiply to det A.");
      }
      const v = c.ket("v"), test = opEigenTest(card.A, v);
      if (test.zero) return opGrade(false, "The zero ket is never an eigenket. Enter a nonzero |v⟩.");
      if (!opIsEigen(card.A, v, card.target)) {
        if (opIsEigen(card.A, v)) return opGrade(false, "That is an eigenket, but for reading " + opFmt(test.value[0]) + ". This mission wants reading " + opFmt(card.target) + ".");
        return opGrade(false, "A|v⟩ is not a multiple of |v⟩ yet. Solve the first row of (A − aI)|v⟩ = 0 with a = " + opFmt(card.target) + ".");
      }
      if (card.normalized && Math.abs(opNorm2(v) - 1) > OP_DERIVED) {
        return opGrade(false, "That is the right eigenket, but ⟨v|v⟩ = " + opFmt(opNorm2(v)) + ". Divide by its length to normalize.");
      }
      return opGrade(true, "", card.work);
    };
  }

  const opStations1 = {
    // 1 · Product, Reading, or Ket? ----------------------------------------------------------------
    sort: {
      show(c) {
        const key = c.open() ?? "ymx", card = OP_SORT[key], done = c.revealed(key);
        c.put("state", (c.open() ? "Story: " : "Open a story. Showing story 1: ") + "prepare " + card.prep + " and measure " + card.obs + "." +
          (done ? " Timeline filled in." : " The timeline fills in once you tag every statement correctly."));
        const box = (title, sub, tone) => ({ title, sub: done ? sub : "?", tone });
        return {
          panels: [opChain("one story, four questions", [
            box("prepare", card.prep, "alpha"), box("multiply", card.product, "angle"), box("measure", card.reading, "plus"), box("afterwards", card.after, "minus")],
          { note: done ? "Only the measure box is random." : "Which box does each statement belong to?" })],
          caption: "prepare " + card.prep + ", measure " + card.obs,
          desc: "A timeline with four boxes: prepare " + card.prep + ", multiply by the matrix, measure, and the ket afterwards." +
            (done ? " Product: " + card.product + ". Reading: " + card.reading + ". Afterwards: " + card.after + "." : " The boxes show question marks until the mission is complete.")
        };
      },
      checks: {
        ymx: ["Statements with an = sign and a matrix are calculations.", "A reading is a number, ±1 for X. A ket after the reading is an eigenket of X.", opSortGrader("ymx")],
        diag: ["Readings of B are its eigenvalues, 2 and 5.", "A normalized ket can’t have squared norm 29/2, so that statement isn’t about the state afterwards.", opSortGrader("diag")],
        same: ["Ask what kind of object each statement describes, not what it equals.", "A number is a reading; a ket written as an equation with Y is a product.", opSortGrader("same")],
        repeat: ["Two of the statements are numbers on the instrument.", "X|+x⟩ = |+x⟩ is the calculation that explains the repeat.", opSortGrader("repeat")]
      }
    },

    // 2 · Dagger Workshop ----------------------------------------------------------------------------
    dagger: {
      show(c) {
        const key = c.open() ?? "one", A = OP_DAGGER[key].A, typed = c.quietMat("d");
        c.put("state", (c.open() ? "A = " : "Open a mission to load its matrix. Showing mission 1: A = ") + opMatText(A) +
          (typed ? " · your A† = " + opMatText(typed) : " · finish every box of your A†") + ".");
        return {
          panels: [opMatrixPanel("A", A, { tone: "alpha" }), opMatrixPanel("your A†", typed ?? [["?", "?"], ["?", "?"]], { tone: "beta" })],
          caption: key === "order" ? "A = ZX" : opMatText(A),
          desc: "Left: A with " + opMatText(A) + ". Right: your A†" + (typed ? " with " + opMatText(typed) : ", not complete yet") + "."
        };
      },
      checks: {
        one: ["Swap A₁₂ and A₂₁ first, then conjugate all four entries.", "A₂₁ = 3i lands in row 1, column 2 and becomes −3i.", opDaggerGrader("one")],
        two: ["Transpose, then conjugate.", "Compare your A† with A entry by entry.", opDaggerGrader("two")],
        diag: ["The diagonal stays in place under a transpose.", "Conjugation still acts on the diagonal: 2i → −2i.", opDaggerGrader("diag")],
        anti: ["Y has −i in row 1, column 2 and +i in row 2, column 1.", "Conjugate both i entries.", opDaggerGrader("anti")],
        order: ["Every entry of ZX is real, so only the transpose matters.", "Multiply X by Z in that order and compare.", opDaggerGrader("order")]
      }
    },

    // 3 · Hermitian Builder ---------------------------------------------------------------------------
    builder: {
      show(c) {
        const key = c.open() ?? "fill", A = opBuilderMatrix(c, key);
        if (!A) {
          c.put("state", "This card is about counting. Picture rows [p, z], [z*, q] with p and q real.");
          return { panels: [opMatrixPanel("a general Hermitian A", [["p", "z"], ["z*", "q"]], { tone: "alpha", note: "p, q real · z complex" })], caption: "counting", desc: "A general Hermitian matrix with real diagonal entries p and q, z above the diagonal and its conjugate z* below." };
        }
        const shown = A.map(row => row.map(z => (z ? z : "?")));
        const full = A.flat().every(Boolean);
        const gap = full ? opHermGap(A) : null;
        c.put("state", (c.open() ? "" : "Open a mission. Showing mission 1. ") + "A = rows " + shown.map(row => "[" + row.map(z => (typeof z === "string" ? z : opCx(z))).join(", ") + "]").join(", ") +
          (full ? " · largest entry of A − A† = " + opFmt(gap) + (gap < 1e-9 ? ", so A = A†" : "") : " · fill every blank to test A = A†") + ".");
        const tones = A.map((row, i) => row.map((z, j) => (i === j ? "alpha" : "beta")));
        return {
          panels: [opMatrixPanel("your A", shown, { tones, note: full ? "A − A†: largest entry " + opFmt(gap) : "blue: diagonal · orange: off-diagonal" })],
          caption: full ? (gap < 1e-9 ? "Hermitian" : "not Hermitian yet") : "blanks remain",
          desc: "Your matrix A" + (full ? " with " + opMatText(A) + ". The largest entry of A − A† is " + opFmt(gap) + "." : ", with blanks still to fill.")
        };
      },
      checks: {
        fill: ["The entry below the diagonal is the conjugate of the one above.", "Conjugate 2 − 3i.", c => {
          const z = c.cx("fill-z");
          if (opFits(z[0], 2) && opFits(z[1], -3)) return opGrade(false, "That copies A₁₂. A₂₁ must be its conjugate, not a copy.");
          return opGrade(opFits(z[0], 2) && opFits(z[1], 3), "With that entry A ≠ A†. Set A₂₁ = (A₁₂)*.",
            "A₂₁ = (2 − 3i)* = 2 + 3i, so A has rows [4, 2 − 3i], [2 + 3i, −1]. Transposing and conjugating returns A.");
        }],
        free: ["The diagonal entries can be any real numbers.", "z must be the conjugate of i.", c => {
          const p = c.cx("free-p"), q = c.cx("free-q"), z = c.cx("free-z");
          if (!opFits(p[1], 0) || !opFits(q[1], 0)) return opGrade(false, "A diagonal entry has an imaginary part. A Hermitian diagonal must be real.");
          return opGrade(opFits(z[0], 0) && opFits(z[1], -1), "Check z: it sits opposite i and must be its conjugate.",
            "Any real p and q work, with z = i* = −i. You chose rows [" + opCx(p) + ", i], [−i, " + opCx(q) + "]. With p = q = 0 this is −Y.");
        }],
        stuck: ["Which entries does A = A† constrain, and how?", "A diagonal entry must equal its own conjugate.", c => opGrade(c.choice("stuck-pick") === "none",
          "Look at the entry 2 + i. Where does it go under the dagger?",
          "The dagger leaves 2 + i on the diagonal but turns it into 2 − i, so A₁₁ = A†₁₁ fails whatever you put elsewhere. No choice of ? helps.")],
        column: ["The first column of A is A|0⟩.", "So A₂₁ = 3i, and Hermiticity fixes A₁₂.", c => {
          const A = c.mat("column");
          if (!opFits(A[0][0][0], 0) || !opFits(A[0][0][1], 0) || !opFits(A[1][1][0], 0) || !opFits(A[1][1][1], 0)) return opGrade(false, "Both diagonal entries must be 0.");
          if (!opFits(A[1][0][0], 0) || !opFits(A[1][0][1], 3)) return opGrade(false, "A|0⟩ is the first column of A, so it must read (0, 3i) down the column.");
          return opGrade(opFits(A[0][1][0], 0) && opFits(A[0][1][1], -3), "The first column is right. Now make A₁₂ = (A₂₁)*.",
            "A₂₁ = 3i forces A₁₂ = −3i, so A has rows [0, −3i], [3i, 0] = 3Y. Its readings are ±3.");
        }],
        count: ["Count the diagonal and the off-diagonal entries separately.", "Two real diagonal entries, plus one complex number above the diagonal.", c => {
          const n = c.ans("count-n");
          if (opFits(n, 8)) return opGrade(false, "8 counts every real and imaginary part separately, but A = A† ties many of them together.");
          return opGrade(opFits(n, 4), "Which entries are free once A = A† is imposed?",
            "Two real diagonal entries, plus the real and imaginary parts of A₁₂: four real numbers. A₂₁ is not free. Equivalently, every 2×2 Hermitian matrix is aI + bX + cY + dZ for real a, b, c, d.");
        }]
      }
    },

    // 4 · Why Not an Observable? ---------------------------------------------------------------------
    nonobs: {
      show(c) {
        const m = opNonModel(c);
        const name = (m.fam === "m" ? "M(" : "N(") + opFmt(m.k) + ")";
        const values = m.pairs.map(p => opCx(p.value));
        c.put("state", name + " = " + opMatText(m.A) + (m.herm ? " · Hermitian" : " · not Hermitian") +
          " · eigenvalues " + values.join(" and ") +
          (m.defective ? " · only one eigenket direction, " + opKetText(m.e1) : " · normalized eigenkets " + opKetText(m.e1) + " and " + opKetText(m.e2) +
            " · |⟨e₁|e₂⟩|² = " + opFmt(m.overlap)) +
          " · for |ψ⟩ = " + OP_KET_NAMES[c.val("psi")] + ", |⟨e₁|ψ⟩|² + |⟨e₂|ψ⟩|² = " + opFmt(m.sum) + ".");
        const reach = Math.max(1.5, ...m.pairs.map(p => opAbs(p.value)));
        const complex = m.pairs.some(p => Math.abs(p.value[1]) > 1e-9);
        return {
          panels: [
            opPlane("eigenvalues in the complex plane", m.pairs.map((p, k) => opArrow(p.value, complex ? "warn" : k ? "minus" : "plus", values[k], { dot: true, size: 6 })),
              { limit: Math.ceil(reach * 2) / 2 + 0.5, circle: 0, axes: ["Re", "Im"] }),
            opBars("|⟨eₖ|ψ⟩|² for each eigenket", [
              { label: "e₁", value: m.p1, tone: "plus" }, { label: "e₂", value: m.p2, tone: "minus" },
              { label: "sum", value: m.sum, tone: Math.abs(m.sum - 1) < 1e-6 ? "plus" : "warn", target: 1 }], { max: 2 })
          ],
          caption: name,
          desc: "Left: the eigenvalues " + values.join(" and ") + " as dots in the complex plane" + (complex ? ", off the real axis." : ", on the real axis.") +
            " Right: squared overlaps of the eigenkets with " + OP_KET_NAMES[c.val("psi")] + ", " + opFmt(m.p1) + " and " + opFmt(m.p2) + ", adding to " + opFmt(m.sum) + ". The yellow mark shows 1."
        };
      },
      checks: {
        imag: ["Family M has eigenvalues a with a² = k.", "Slide k below 0.", c => {
          if (c.val("fam") !== "m") return opSetup("Choose family M first.");
          if (c.num("k") >= 0) return opGrade(false, "At k = " + opFmt(c.num("k")) + " the eigenvalues are real. Make a² = k negative.");
          return opGrade(c.choice("imag-pick") === "complex", "What kind of number can a display show?",
            "For k < 0, a² = k gives a = ±i√|k|. No instrument reading is imaginary, so M(k) cannot be an observable. Hermitian matrices never have this problem.");
        }],
        overlap: ["The eigenkets are (1, ±1/2)ᵀ before normalizing.", "⟨e₊|e₋⟩ = (1 − 1/4)/(1 + 1/4).", c => {
          const v = c.ans("overlap-v");
          if (opFits(v, 3 / 5)) return opGrade(false, "3/5 is ⟨e₊|e₋⟩. The mission asks for its squared magnitude.");
          return opGrade(opFits(v, 9 / 25), "Normalize (1, 1/2) and (1, −1/2), then take the inner product and square it.",
            "e± = (1, ±1/2)ᵀ/√(5/4) = (2, ±1)ᵀ/√5. ⟨e₊|e₋⟩ = (4 − 1)/5 = 3/5, so |⟨e₊|e₋⟩|² = 9/25. Orthonormal eigenkets would give 0.");
        }],
        sum: ["At k = 1 the eigenkets are |0⟩ and (|0⟩ + |1⟩)/√2.", "|⟨0|0⟩|² = 1. What is |⟨+x|0⟩|²?", c => {
          const v = c.ans("sum-v");
          return opGrade(opFits(v, 3 / 2), "Add the squared overlap of |0⟩ with each normalized eigenket.",
            "|⟨0|0⟩|² + |⟨+x|0⟩|² = 1 + 1/2 = 3/2. Would-be probabilities that add to more than 1 can’t describe one measurement. The eigenkets would need to be orthogonal.");
        }],
        fix: ["A Hermitian matrix has A₂₁ = (A₁₂)*.", "M needs k = 1; N needs k = 0.", c => {
          const k = Math.round(c.num("k") * 100) / 100, fam = c.val("fam");
          const ok = (fam === "m" && Math.abs(k - 1) < 1e-9) || (fam === "n" && Math.abs(k) < 1e-9);
          return opGrade(ok, "Your matrix still has A₂₁ ≠ (A₁₂)*.",
            fam === "m" ? "M(1) has rows [0, 1], [1, 0] = X: real readings ±1 and orthogonal eigenkets |±x⟩." : "N(0) has rows [1, 0], [0, 2]: Hermitian, with readings 1 and 2 and eigenkets |0⟩ and |1⟩.");
        }],
        enough: ["Look again at M(1/4) and the shear N(1).", "Both had real eigenvalues. What failed?", c => opGrade(c.choice("enough-pick") === "no",
          "Recall the overlap and the sum from the earlier missions.",
          "Real eigenvalues are necessary but not enough. The readings also need an orthonormal set of eigenkets, so that P(a) = |⟨a|ψ⟩|² adds to 1 for every state. Hermitian matrices guarantee both.")]
      }
    },

    // 5 · Eigenket Finder -----------------------------------------------------------------------------
    eigen: {
      show(c) {
        const key = c.open() ?? "h14", A = OP_EIGEN[key].A;
        const v = c.quietKet("v"), r = [c.quiet("r1"), c.quiet("r2")];
        const t = opTrace(A)[0], d = opDet2(A)[0];
        const rows = [];
        let bars = [];
        if (v && opNorm2(v) > 1e-12) {
          const Av = opApply(A, v);
          rows.push("A|v⟩ = " + opKetText(Av), "⟨v|v⟩ = " + opFmt(opNorm2(v)));
          bars = r.map((a, k) => (a === null ? null : {
            label: "a = " + opFmt(a),
            value: Math.sqrt(opNorm2(Av.map((z, j) => opSub(z, opScale(v[j], a)))) / opNorm2(v)),
            tone: k ? "minus" : "plus"
          })).filter(Boolean);
        }
        c.put("state", (c.open() ? "" : "Open a mission to load its matrix. Showing mission 1. ") + "A = " + opMatText(A) + " · det(A − aI) = a² − (" + opFmt(t) + ")a + (" + opFmt(d) + ")" +
          (v ? " · your |v⟩ = " + opKetText(v) + (rows.length ? " · " + rows.join(" · ") : "") : " · finish the eigenket boxes") + ".");
        return {
          panels: [opMatrixPanel("A", A, { tone: "alpha" }),
            opBars("‖A|v⟩ − a|v⟩‖ / ‖v‖ (0 means eigenket)", bars.length ? bars : [{ label: "type a reading", value: 0, text: "–", tone: "guide" }], { max: Math.max(1, Math.ceil(Math.max(0, ...bars.map(b => b.value)))) })],
          caption: opMatText(A),
          desc: "Left: A with " + opMatText(A) + ". Right: for each reading you typed, how far A|v⟩ is from a|v⟩; a bar of height 0 means |v⟩ is an eigenket for that reading."
        };
      },
      checks: {
        h14: ["tr A = 5 and det A = 6 − |1 − i|² = 4.", "For a = 4 the first row of A − 4I is [−2, 1 − i].", opEigenGrader("h14")],
        two: ["tr A = 3 and det A = −(2i)(−2i) = −4.", "For a = −1 the first row of A + I is [1, 2i].", opEigenGrader("two")],
        five: ["tr A = 0, so the readings are ±√(−det A).", "For a = 5 solve −2v₀ + 4iv₁ = 0, then normalize.", opEigenGrader("five")],
        partner: ["Eigenkets for different readings of a Hermitian matrix are orthogonal.", "The partner of (v₀, v₁) is (−v₁*, v₀*).", opEigenGrader("partner")]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 6–10 · Readings, eigenkets, compatibility and spectral assembly.
  // ---------------------------------------------------------------------------

  const opColumn = (caption, ket, extra = {}) => opMatrixPanel(caption, ket.map(z => [z]), extra);
  const opReadingsText = spectrum => spectrum.map(s => opFmt(s.a) + " for " + opKetText(s.ket)).join(" and ");

  // Ticked boxes against an expected set. Returns how many boxes are off.
  function opTickMisses(c, prefix, keys, expected) {
    return keys.filter(key => c.checked(prefix + "-" + key) !== expected.includes(key)).length;
  }
  const opTickText = n => (n === 1 ? "1 box is" : n + " boxes are") + " not right yet.";

  // 6 · Any Observable, Any State: two probabilities typed for one setup.
  function opPairGrader(names, exact, labels, work, swapNote = true) {
    return c => {
      const typed = names.map(name => c.ans(name));
      if (swapNote && typed.every((v, k) => opFits(v, exact[1 - k])) && !typed.every((v, k) => opFits(v, exact[k]))) {
        return opGrade(false, "Those two probabilities are swapped. Match each reading with its own eigenket.");
      }
      return opGrade(typed.every((v, k) => opFits(v, exact[k])), "Compute ⟨a|ψ⟩ with the conjugated eigenket for each reading, then square its magnitude. " + labels + " should add to 1.", work);
    };
  }

  // 7 · Scale and Shift.
  function opShiftModel(c) {
    const A = OP_MATS[c.val("base")], k = c.num("c"), d = c.num("d");
    const B = opMatAdd(opMatScale(A, k), opMatScale(OP_MATS.id, d));
    const spec = opSpectrum(A), psi = OP_KETS[c.val("psi")];
    const rows = spec.map(s => ({ a: s.a, b: k * s.a + d, ket: s.ket, p: opProb(s.ket, psi) }));
    return { A, B, k, d, rows, psi };
  }

  // 8 · Definite or Not?
  const OP_DEF_STATES = { ot: OP_KETS.ot, my: OP_KETS.minusy, one: OP_KETS.one };

  // 9 · Compatible Observables: measure A, then B, then A again, on fresh copies.
  function opMeasure(rng, A, psi) {
    const spec = opSpectrum(A);
    const k = opPick(rng, spec.map(s => opProb(s.ket, psi)));
    return spec[k];
  }
  function opSequences(c, n) {
    const A = OP_MATS[c.val("a")], B = OP_MATS[c.val("b")], psi = OP_KETS[c.val("psi")];
    let same = 0;
    for (let t = 0; t < n; t++) {
      const first = opMeasure(c.s.rng, A, psi);
      const middle = opMeasure(c.s.rng, B, first.ket);
      const last = opMeasure(c.s.rng, A, middle.ket);
      if (Math.abs(first.a - last.a) < 1e-9) same++;
    }
    return same;
  }
  const opCommutator = (A, B) => opMatSub(opMatMul(A, B), opMatMul(B, A));

  // 10 · Spectral Assembly.
  const OP_SPECTRAL_SETS = {
    y: { kets: [OP_KETS.plusy, OP_KETS.minusy], names: ["|+y⟩", "|−y⟩"] },
    m6: { kets: [OP_KETS.ot, opKet(2, -1)], names: ["(1, 2)ᵀ/√5", "(2, −1)ᵀ/√5"] },
    z: { kets: [OP_KETS.zero, OP_KETS.one], names: ["|0⟩", "|1⟩"] }
  };
  const opHalf = (a, b, c2, d) => opMatScale(opM(a, b, c2, d), 0.5);
  function opGridGrader(prefix, target, fail, work, traps = []) {
    return c => {
      const typed = c.mat(prefix);
      for (const [trap, message] of traps) if (!opMatMisses(typed, trap).length) return opGrade(false, message);
      const misses = opMatMisses(typed, target);
      return opGrade(!misses.length, misses.length ? opMissText(misses) + " not yet right. " + fail : "", work);
    };
  }

  const opStations2 = {
    // 6 · Any Observable, Any State -----------------------------------------------------------------
    predict: {
      start(c) { c.s.bars = false; },
      actions: {
        reveal(c) { c.s.bars = true; return "Bars shown for this setup."; },
        hide(c) { c.s.bars = false; return "Bars hidden."; }
      },
      show(c) {
        const A = OP_MATS[c.val("obs")], psi = OP_KETS[c.val("psi")], spec = opSpectrum(A);
        const probs = spec.map(s => opProb(s.ket, psi));
        c.put("state", "A = " + opMatText(A) + " · |ψ⟩ = " + OP_KET_NAMES[c.val("psi")] +
          (c.s.bars ? " · readings " + opReadingsText(spec) + " · P = " + probs.map(opFmt).join(" and ") + "." : " · press Show the bars to see the readings and their probabilities."));
        return {
          panels: [opMatrixPanel("A", A, { tone: "alpha" }),
            opBars(c.s.bars ? "P(a) for this setup" : "bars hidden", spec.map((s, k) => ({
              label: c.s.bars ? "a = " + opFmt(s.a) : "a = ?", value: c.s.bars ? probs[k] : 0, text: c.s.bars ? opFmt(probs[k]) : "?", tone: k ? "minus" : "plus"
            })))],
          caption: OP_KET_NAMES[c.val("psi")],
          desc: "Left: A with " + opMatText(A) + ". Right: " + (c.s.bars ? "bars for the readings " + spec.map(s => opFmt(s.a)).join(" and ") + " with probabilities " + probs.map(opFmt).join(" and ") + "." : "the probability bars are hidden.")
        };
      },
      checks: {
        trace: ["Two numbers that add to 9 and multiply to 14.", "Solve a² − 9a + 14 = 0.", c => {
          const typed = [c.ans("trace-r1"), c.ans("trace-r2")];
          if (opSameSet(typed, [6, 3])) return opGrade(false, "Those are the diagonal entries. The readings are the eigenvalues.");
          return opGrade(opSameSet(typed, [2, 7]), "Find two numbers whose sum is tr A = 9 and whose product is det A = 14.",
            "a² − 9a + 14 = (a − 2)(a − 7) = 0, so the readings are 2 and 7. Check: (1, 2)ᵀ is an eigenket for 2, since 6 − 4 = 2 and −2 + 6 = 4.");
        }],
        zero: ["⟨a|0⟩ is the first entry of |a⟩, conjugated.", "P(2) = |1/√5|².", opPairGrader(["zero-p2", "zero-p7"], [1 / 5, 4 / 5], "P(2) and P(7)",
          "⟨2|0⟩ = 1/√5 and ⟨7|0⟩ = 2/√5, so P(2) = 1/5 and P(7) = 4/5. The diagonal entry 6 of A is not a reading, even though |0⟩ is the first basis ket.")],
        plusx: ["⟨2|+x⟩ = (1·1 + 2·1)/√10.", "Square 3/√10.", opPairGrader(["plusx-p2", "plusx-p7"], [9 / 10, 1 / 10], "P(2) and P(7)",
          "⟨2|+x⟩ = (1 + 2)/√10 = 3/√10 and ⟨7|+x⟩ = (2 − 1)/√10 = 1/√10, so P(2) = 9/10 and P(7) = 1/10.")],
        complex: ["Conjugate the eigenket: ⟨4| has coefficients (1 + i, 2)/√6.", "⟨4|+y⟩ = [(1 + i) + 2i]/√12.", opPairGrader(["complex-p1", "complex-p4"], [1 / 6, 5 / 6], "P(1) and P(4)",
          "⟨4|+y⟩ = [(1 + i)·1 + 2·i]/√12 = (1 + 3i)/√12, so P(4) = 10/12 = 5/6. ⟨1|+y⟩ = [(1 + i)·1 − 1·i]/√6 = 1/√6, so P(1) = 1/6.")],
        which: ["The instrument shows eigenvalues only.", "You found them in the first mission.", c => {
          const off = opTickMisses(c, "which", ["6", "3", "2", "7", "9", "14"], ["2", "7"]);
          return opGrade(!off, opTickText(off) + " Only eigenvalues can appear.",
            "Only 2 and 7 can appear. 6 and 3 are diagonal entries, 9 is the trace and 14 is the determinant. None of them is a reading.");
        }]
      }
    },

    // 7 · Scale and Shift ---------------------------------------------------------------------------
    shift: {
      show(c) {
        const m = opShiftModel(c), name = c.val("base") === "m6" ? "M₆" : c.val("base").toUpperCase();
        const scaled = m.k === 0 ? "" : m.k === 1 ? name : m.k === -1 ? "−" + name : opFmt(m.k) + name;
        const shifted = m.d === 0 ? "" : m.d === 1 ? "I" : m.d === -1 ? "−I" : opFmt(m.d) + "I";
        const label = (scaled && shifted ? scaled + (shifted.startsWith("−") ? " − " + shifted.slice(1) : " + " + shifted) : scaled || shifted) || "0";
        const all = m.rows.flatMap(r => [r.a, r.b]);
        const x0 = Math.floor(Math.min(...all) - 1), x1 = Math.ceil(Math.max(...all) + 1);
        const span = x1 - x0;
        c.put("state", "B = " + label + " = " + opMatText(m.B) + " · " +
          m.rows.map(r => "eigenket " + opKetText(r.ket) + ": A reads " + opFmt(r.a) + ", B reads " + opFmt(r.b) + ", P = " + opFmt(r.p)).join(" · ") + ".");
        const merged = m.rows.length === 2 && Math.abs(m.rows[0].b - m.rows[1].b) < 1e-9;
        return {
          panels: [
            opLine("readings move along the line", {
              weight: 1.6, x: [x0, x1], every: span > 24 ? 5 : span > 12 ? 2 : 1,
              rows: [
                { label: "A", tone: "alpha", points: m.rows.map((r, k) => ({ x: r.a, tone: k ? "minus" : "plus", label: opFmt(r.a) })) },
                { label: "B", tone: "beta", points: m.rows.map((r, k) => ({ x: r.b, tone: k ? "minus" : "plus", label: opFmt(r.b), raise: merged && k ? 16 : 0 })) }],
              links: m.rows.map(r => ({ from: r.a, to: r.b, rows: [0, 1] }))
            }),
            opBars("same probabilities", m.rows.map((r, k) => ({ label: opFmt(r.a) + " → " + opFmt(r.b), value: r.p, tone: k ? "minus" : "plus" })))
          ],
          caption: "B = " + label,
          desc: "Top line: the readings of A, " + m.rows.map(r => opFmt(r.a)).join(" and ") + ". Bottom line: the readings of B = " + label + ", " +
            m.rows.map(r => opFmt(r.b)).join(" and ") + ", joined to the reading with the same eigenket. Bars: the probabilities " + m.rows.map(r => opFmt(r.p)).join(" and ") + " for " + OP_KET_NAMES[c.val("psi")] + "."
        };
      },
      checks: {
        five: ["Each reading a of X becomes 2a + 3.", "X reads +1 and −1.", c => {
          const typed = [c.ans("five-r1"), c.ans("five-r2")];
          return opGrade(opSameSet(typed, [5, 1]), "Apply a → 2a + 3 to each reading of X.",
            "(2X + 3I)|±x⟩ = (2(±1) + 3)|±x⟩, so the readings are 5 for |+x⟩ and 1 for |−x⟩.");
        }],
        bits: ["Z reads +1 and −1. You need c·(+1) + d and c·(−1) + d to be 0 and 1.", "Adding the two gives 2d = 1.", c => {
          if (c.val("base") !== "z") return opSetup("Choose base Z first.");
          const k = c.num("c"), d = c.num("d"), got = [k + d, -k + d];
          return opGrade(opSameSet(got, [0, 1]), "With these sliders B reads " + got.map(opFmt).join(" and ") + ".",
            "c = " + opFmt(k) + " and d = " + opFmt(d) + " give readings " + got.map(opFmt).join(" and ") + ". Both (I − Z)/2 and (I + Z)/2 work: one reads 1 for |1⟩, the other reads 1 for |0⟩. Each is a projector.");
        }],
        prob: ["B has the same eigenkets as Z.", "Reading 5 = 2(+1) + 3 belongs to |0⟩.", c => {
          const v = c.ans("prob-p");
          if (opFits(v, 16 / 25)) return opGrade(false, "16/25 belongs to |1⟩, whose reading is 2(−1) + 3 = 1.");
          return opGrade(opFits(v, 9 / 25), "Find the eigenket for reading 5, then square its overlap with the state.",
            "Reading 5 belongs to |0⟩, so P(5) = |⟨0|ψ⟩|² = (3/5)² = 9/25, the same as P(+1) for Z. Scaling and shifting change the numbers on the display, not the odds.");
        }],
        flip: ["−X reads −1 on |+x⟩ and +1 on |−x⟩.", "A negative c reverses the order.", c => opGrade(c.choice("flip-pick") === "minusx",
          "Apply −X to each X eigenket.", "−X|−x⟩ = −(−1)|−x⟩ = +1·|−x⟩, so the larger reading +1 now belongs to |−x⟩. The eigenkets are unchanged; only their readings swap.")],
        zero: ["Slide c to 0.", "B = dI multiplies every ket by d.", c => {
          if (c.num("c") !== 0) return opSetup("Set c = 0 first.");
          const n = c.ans("zero-n");
          return opGrade(opFits(n, 1), "With c = 0, what does B do to each eigenket of A?",
            "B = " + opFmt(c.num("d")) + "I sends every ket to " + opFmt(c.num("d")) + " times itself, so the only reading is " + opFmt(c.num("d")) +
            " and it is certain for every state. A single reading now belongs to more than one eigenket: the degenerate case of station 14.");
        }]
      }
    },

    // 8 · Definite or Not? ------------------------------------------------------------------------------
    definite: {
      show(c) {
        const psi = OP_DEF_STATES[c.val("psi")], A = OP_MATS[c.val("cand")], Apsi = opApply(A, psi);
        c.put("state", "|ψ⟩ = " + OP_KET_NAMES[c.val("psi")] + " = " + opKetText(psi) + " · A = " + OP_NAMES[c.val("cand")] + " · A|ψ⟩ = " + opKetText(Apsi) + ". Is the product a multiple of |ψ⟩?");
        const real = [...psi, ...Apsi].every(z => Math.abs(z[1]) < 1e-9);
        const reach = Math.max(1, ...Apsi.map(z => Math.abs(z[0])));
        const panels = [opColumn("|ψ⟩", psi, { tone: "alpha" }), opColumn("A|ψ⟩", Apsi, { tone: "angle" })];
        if (real) {
          panels.push(opPlane("real plane", [opArrow([psi[0][0], psi[1][0]], "alpha", "|ψ⟩", { wide: true }), opArrow([Apsi[0][0], Apsi[1][0]], "angle", "A|ψ⟩")],
            { limit: Math.ceil(reach), circle: 1, weight: 1.4 }));
        }
        return {
          panels,
          caption: "A = " + OP_NAMES[c.val("cand")],
          desc: "The column |ψ⟩ = " + opKetText(psi) + " beside the product A|ψ⟩ = " + opKetText(Apsi) + (real ? ", and both drawn as arrows in the real plane." : ".")
        };
      },
      checks: {
        ot: ["Apply each candidate and compare the product with (1, 2)ᵀ.", "M₆(1, 2)ᵀ = (2, 4)ᵀ.", c => {
          const off = opTickMisses(c, "ot", ["x", "y", "z", "m6", "m6b", "d25"], ["m6", "m6b"]);
          return opGrade(!off, opTickText(off),
            "M₆(1, 2)ᵀ = (6 − 4, −2 + 6)ᵀ = 2(1, 2)ᵀ, so M₆ gives the definite reading 2, and 2M₆ − I gives 2·2 − 1 = 3. X, Y, Z and B = diag(2, 5) all turn (1, 2)ᵀ into something that is not a multiple of it.");
        }],
        my: ["Rewrite each candidate in terms of Y and I.", "Y|−y⟩ = −|−y⟩. Any aI + bY has |−y⟩ as an eigenket.", c => {
          const off = opTickMisses(c, "my", ["x", "y", "z", "i3y", "i2y", "ny"], ["y", "i3y", "i2y", "ny"]);
          return opGrade(!off, opTickText(off),
            "Y, I + 3Y (reading −2), rows [1, 2i], [−2i, 1] = I − 2Y (reading 3) and rows [0, i], [−i, 0] = −Y (reading +1) all have |−y⟩ as an eigenket. X|−y⟩ = −i|+y⟩ and Z|−y⟩ = |+y⟩ are not multiples of |−y⟩.");
        }],
        value: ["Compute M₆(1, 2)ᵀ.", "Divide the product by (1, 2)ᵀ entry by entry.", c => {
          const v = c.ans("value-a");
          if (opFits(v, 7)) return opGrade(false, "7 is the other reading of M₆. This state belongs to the first.");
          return opGrade(opFits(v, 2), "Find the number a with M₆|ψ⟩ = a|ψ⟩.", "M₆(1, 2)ᵀ = (2, 4)ᵀ = 2(1, 2)ᵀ, so the reading 2 is certain. P(2) = |⟨2|ψ⟩|² = 1.");
        }],
        build: ["B is diagonal, so its eigenkets are basis kets.", "Which basis ket does B multiply by 5?", c => {
          const v = c.ket("build");
          if (opNorm2(v) < 1e-12) return opGrade(false, "The zero ket is not a state. Enter a nonzero ket.");
          if (opIsEigen(OP_MATS.d25, v, 2)) return opGrade(false, "That ket gives the reading 2 with certainty, not 5.");
          return opGrade(opIsEigen(OP_MATS.d25, v, 5), "B times your ket is not 5 times your ket.",
            "B|1⟩ = 5|1⟩, so any nonzero multiple of |1⟩ works, such as |1⟩, i|1⟩ or −2|1⟩. They differ only by global phase and length.");
        }],
        identity: ["What is I|ψ⟩?", "I has a single reading, 1.", c => opGrade(c.choice("identity-pick") === "all", "Apply I to any ket.",
          "I|ψ⟩ = |ψ⟩ = 1·|ψ⟩ for every |ψ⟩, so every state is an eigenket and the reading 1 is certain. It is the c = 0, d = 1 case of station 7.")]
      }
    },

    // 9 · Compatible Observables --------------------------------------------------------------------
    commute: {
      start(c) { opSeed(c); c.s.log = []; c.s.products = false; },
      edit(c, name) { if (["a", "b", "psi"].includes(name)) c.s.products = false; },
      actions: {
        run(c) {
          const same = opSequences(c, 20);
          const line = "Seed " + c.s.seed + " · A = " + OP_NAMES[c.val("a")] + ", B = " + OP_NAMES[c.val("b")] + ", fresh copies of " + OP_KET_NAMES[c.val("psi")] +
            ": the second A reading matched the first in " + same + " of 20 sequences.";
          c.s.log.push(line);
          return line;
        },
        products(c) { c.s.products = true; return "AB and BA shown."; },
        clear(c) { c.s.log = []; return "Log cleared."; },
        reseed(c) { return opReseed(c); }
      },
      show(c) {
        const A = OP_MATS[c.val("a")], B = OP_MATS[c.val("b")];
        const AB = opMatMul(A, B), BA = opMatMul(B, A), typed = c.quietMat("k");
        c.list("log", c.s.log);
        c.put("state", "A = " + OP_NAMES[c.val("a")] + " · B = " + OP_NAMES[c.val("b")] +
          (c.s.products ? " · AB = " + opMatText(AB) + " · BA = " + opMatText(BA) : " · press Show AB and BA to see both products") +
          (typed ? " · your [A, B] = " + opMatText(typed) : "") + ".");
        const panels = [opMatrixPanel("A", A, { tone: "alpha" }), opMatrixPanel("B", B, { tone: "beta" })];
        if (c.s.products) panels.push(opMatrixPanel("AB", AB, { tone: "angle" }), opMatrixPanel("BA", BA, { tone: "minus" }));
        return {
          panels,
          caption: "A = " + OP_NAMES[c.val("a")].split(" (")[0] + ", B = " + OP_NAMES[c.val("b")].split(" (")[0],
          desc: "A with " + opMatText(A) + " and B with " + opMatText(B) + (c.s.products ? ", then AB with " + opMatText(AB) + " and BA with " + opMatText(BA) + "." : ".")
        };
      },
      checks: {
        xz: ["XZ has rows [0, −1], [1, 0].", "ZX has rows [0, 1], [−1, 0].", opGridGrader("k", opCommutator(OP_MATS.x, OP_MATS.z), "Subtract ZX from XZ entry by entry.",
          "XZ − ZX has rows [0, −1] − [0, 1] = [0, −2] and [1, 0] − [−1, 0] = [2, 0]. That is −2iY, which is not zero: X and Z are not compatible.",
          [[opCommutator(OP_MATS.z, OP_MATS.x), "That is ZX − XZ, the negative of [X, Z]. Keep the order AB − BA."]])],
        pair: ["Both matrices are combinations of I and X.", "aI + bX always has eigenkets |±x⟩.", c => {
          const misses = opMatMisses(c.mat("k"), opIdentity().map(row => row.map(() => [0, 0])));
          if (misses.length) return opGrade(false, opMissText(misses) + " not zero. Compute AB and BA; for this pair they are equal.");
          return opGrade(c.choice("pair-basis") === "x", "[A, B] = 0 is right. Which kets does X leave as multiples of themselves?",
            "A = I + X and B = 3I − X both commute with X, so AB = BA = 2I + 2X and [A, B] = 0. Their shared eigenkets are |+x⟩ (A reads 2, B reads 2) and |−x⟩ (A reads 0, B reads 4).");
        }],
        repeat: ["Shared eigenkets: B finds the system in an eigenket of B already.", "For X then Z: after Z the system is |0⟩ or |1⟩, and |⟨±x|0⟩|² = 1/2.", c => {
          const a = c.ans("repeat-c"), b = c.ans("repeat-n");
          if (!opFits(a, 1)) return opGrade(false, "Check the commuting pair. After the first A reading the system is in a shared eigenket. What does B do to it?");
          return opGrade(opFits(b, 1 / 2), "Check X then Z. Which kets can Z leave behind, and what are their X probabilities?",
            "For the commuting pair the first A reading leaves |+x⟩ or |−x⟩, which B leaves in place, so the second A reading repeats with probability 1. For X then Z, Z leaves |0⟩ or |1⟩, and either gives each X reading with probability 1/2. Run the sequences: your counts scatter around 20 and 10 of 20.");
        }],
        shared: ["Both matrices are diagonal.", "Any basis ket is an eigenket of every diagonal matrix.", c => {
          const v = c.ket("shared");
          if (opNorm2(v) < 1e-12) return opGrade(false, "The zero ket is not a state.");
          const z = opIsEigen(OP_MATS.z, v), b = opIsEigen(OP_MATS.d25, v);
          return opGrade(z && b, !z ? "Z does not give your ket a definite reading." : "B does not give your ket a definite reading.",
            "Z and B commute because both are diagonal. |0⟩ is definite for both (Z reads +1, B reads 2) and so is |1⟩ (Z reads −1, B reads 5), up to phase and length.");
        }],
        sort: ["Compute or recall each commutator.", "Matrices of the form aI + bY all commute with each other.", c => {
          const picks = [1, 2, 3, 4].map(k => c.choice("sort-" + k)), want = ["no", "yes", "yes", "no"];
          const off = picks.filter((p, k) => p !== want[k]).length;
          return opGrade(!off, (off === 1 ? "1 pair is" : off + " pairs are") + " not right yet.",
            "[X, Y] = 2iZ ≠ 0. Z and B are both diagonal, so they commute. I − 2Y is built from I and Y, so it commutes with Y. M₆ = 4.5I − 2X + 1.5Z contains Z, and [X, Z] ≠ 0, so X and M₆ don’t commute.");
        }]
      }
    },

    // 10 · Spectral Assembly --------------------------------------------------------------------------
    spectral: {
      show(c) {
        const set = OP_SPECTRAL_SETS[c.val("set")], P = c.quietMat("p");
        const lines = ["|a₁⟩ = " + set.names[0] + " = " + opKetText(set.kets[0]), "|a₂⟩ = " + set.names[1] + " = " + opKetText(set.kets[1])];
        let panels = [opMatrixPanel("your matrix", [["?", "?"], ["?", "?"]], { tone: "beta" })], note = "Finish every box of your matrix.";
        if (P) {
          const P2 = opMatMul(P, P), gap = opMatGap(P2, P), herm = opHermGap(P);
          note = "your matrix: Hermitian " + (herm < 1e-9 ? "yes" : "no") + " · largest entry of P² − P = " + opFmt(gap) + " · trace " + opCx(opTrace(P));
          panels = [opMatrixPanel("your matrix P", P, { tone: "beta" }), opMatrixPanel("P²", P2, { tone: gap < 1e-9 ? "plus" : "angle", note: gap < 1e-9 ? "P² = P: a projector" : "P² ≠ P" })];
        }
        c.put("state", lines.join(" · ") + " · " + note + ".");
        return {
          panels,
          caption: P ? "P² " + (opMatGap(opMatMul(P, P), P) < 1e-9 ? "= P" : "≠ P") : "your matrix",
          desc: P ? "Your matrix P with " + opMatText(P) + " and its square with " + opMatText(opMatMul(P, P)) + "." : "Your matrix is not complete yet."
        };
      },
      checks: {
        outer: ["Entry (i, j) of |a⟩⟨a| is aᵢ·aⱼ*.", "|+y⟩ = (1, i)ᵀ/√2, so the conjugated row is (1, −i)/√2.", opGridGrader("p", opOuter(OP_KETS.plusy, OP_KETS.plusy), "Entry (i, j) is aᵢ times the conjugate of aⱼ.",
          "|+y⟩⟨+y| = (1/2)·[1·1, 1·(−i); i·1, i·(−i)] = rows [1/2, −i/2], [i/2, 1/2]. It is Hermitian, its trace is 1, and squaring it gives it back.",
          [[opHalf(1, [0, 1], [0, 1], -1), "That multiplies the column by itself without conjugating the row. Use ⟨+y| = (1, −i)/√2."]])],
        partner: ["|−y⟩ = (1, −i)ᵀ/√2.", "The two projectors add to I.", opGridGrader("p", opOuter(OP_KETS.minusy, OP_KETS.minusy), "Entry (i, j) is aᵢ times the conjugate of aⱼ.",
          "|−y⟩⟨−y| = rows [1/2, i/2], [−i/2, 1/2]. Adding |+y⟩⟨+y| = rows [1/2, −i/2], [i/2, 1/2] gives I.")],
        m6: ["|a⟩⟨a| = rows [1, 2], [2, 4] divided by 5.", "|b⟩⟨b| = rows [4, −2], [−2, 1] divided by 5.", opGridGrader("p", OP_MATS.m6, "Add 2/5 of rows [1, 2], [2, 4] to 7/5 of rows [4, −2], [−2, 1].",
          "2·(1/5)[1, 2; 2, 4] + 7·(1/5)[4, −2; −2, 1] = (1/5)[2 + 28, 4 − 14; 4 − 14, 8 + 7] = rows [6, −2], [−2, 3]: the matrix from station 6.")],
        zero4: ["The reading-0 term drops out.", "A = 4|−y⟩⟨−y|.", opGridGrader("p", opMatScale(opOuter(OP_KETS.minusy, OP_KETS.minusy), 4), "Multiply |−y⟩⟨−y| by 4.",
          "A = 0·|+y⟩⟨+y| + 4·|−y⟩⟨−y| = rows [2, 2i], [−2i, 2]. Check: A|+y⟩ = 0 and A|−y⟩ = 4|−y⟩. It also equals 2I − 2Y.")],
        makey: ["Y|+y⟩ = +|+y⟩ and Y|−y⟩ = −|−y⟩.", "Use the eigenvalues of Y as the readings.", c => {
          if (c.val("set") !== "y") return opSetup("Choose the pair |+y⟩ and |−y⟩ first.");
          const a1 = c.ans("a1"), a2 = c.ans("a2"), [P1, P2] = OP_SPECTRAL_SETS.y.kets.map(k => opOuter(k, k));
          const built = opMatAdd(opMatScale(P1, a1), opMatScale(P2, a2));
          return opGrade(opMatGap(built, OP_MATS.y) <= OP_DERIVED, "With a₁ = " + opFmt(a1) + " and a₂ = " + opFmt(a2) + " the sum is " + opMatText(built) + ", not Y.",
            "(+1)|+y⟩⟨+y| + (−1)|−y⟩⟨−y| = rows [0, −i], [i, 0] = Y. Every observable is its readings times its projectors.");
        }]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 11–16 · Recurring formats and extras.
  // ---------------------------------------------------------------------------

  // 11 · Observable Designer. The checker tests the matrix the learner builds.
  function opDesignCheck(c) {
    const A = c.mat("a"), gap = opHermGap(A);
    if (gap > OP_DERIVED) return { A, fail: opGrade(false, "Your A is not Hermitian: the largest entry of A − A† is " + opFmt(gap) + ". Use a real diagonal and conjugate off-diagonal entries.") };
    return { A, spec: opSpectrum(A) };
  }
  const opNearSet = (typed, exact) => typed.length === exact.length && [...typed].sort((p, q) => p - q).every((v, k) => opNear(v, [...exact].sort((p, q) => p - q)[k]));
  const OP_DESIGN_KET = opKet([1, -1], 1);

  // 12 · Error Detective.
  const OP_ERRORS = {
    product: { line: 3, kind: "product", text: "Case 1 · the instrument shows a ket",
      work: "Line 3 treats the product Z|−x⟩ = |+x⟩ as the reading and as the new ket. Z reports +1 or −1, each with probability |⟨0|−x⟩|² = |⟨1|−x⟩|² = 1/2, and leaves the system in |0⟩ or |1⟩. Line 4 inherits the mistake." },
    conj: { line: 2, kind: "conj", text: "Case 2 · a tiny overlap",
      work: "Line 2 forgets to conjugate: ⟨+y| = (⟨0| − i⟨1|)/√2. Then ⟨+y|ψ⟩ = (2 + (−i)(i))/√10 = 3/√10 and P(+1) = 9/10. As a check, P(−1) = |2 − 1|²/10 = 1/10, and the two add to 1." },
    nonherm: { line: 2, kind: "nonherm", text: "Case 3 · real is enough",
      work: "Line 1 is right: the eigenvalues are 1 and 3. Line 2 is wrong: M† has rows [1, 0], [2, 3] ≠ M, so M is not Hermitian and cannot be an observable. Line 3 confirms the trouble: |0⟩ and (|0⟩ + |1⟩)/√2 are not orthogonal." },
    eigprob: { line: 3, kind: "eigprob", text: "Case 4 · point eight",
      work: "Line 3 uses the reading 0.8 as its own probability. The probabilities come from the state: P(0.8) = |⟨1|+x⟩|² = 1/2 and P(0.2) = |⟨0|+x⟩|² = 1/2. That the readings happen to add to 1 is a coincidence." },
    norm: { line: 3, kind: "norm", text: "Case 5 · probability two",
      work: "Line 3 uses ‖A|−x⟩‖² as a probability; it equals 2, which no probability can. The Born rule uses the eigenket: P(2) = |⟨0|−x⟩|² = 1/2. The product’s norm mixes the reading 2 into the answer." }
  };
  function opErrorGrader(key) {
    return c => {
      const card = OP_ERRORS[key];
      const line = Number(c.choice(key + "-line")), kind = c.choice(key + "-kind");
      if (line !== card.line && kind === card.kind) return opGrade(false, "That names the mistake, but it first appears on a different line.");
      if (line === card.line && kind !== card.kind) return opGrade(false, "That is the first wrong line. Name what goes wrong there more precisely.");
      return opGrade(line === card.line && kind === card.kind, "Check each line in order, and stop at the first one that is false.", card.work);
    };
  }
  function opErrorPlan(key) {
    if (key === "product") {
      return { panels: [opChain("claimed vs actual", [
        { title: "prepare", sub: "|−x⟩", tone: "alpha" }, { title: "measure Z", sub: "Z|−x⟩ = |+x⟩", tone: "angle" },
        { title: "claimed", sub: "shows |+x⟩", tone: "warn" }, { title: "actual", sub: "±1, 1/2 each", tone: "plus" }], { note: "A display shows numbers, not kets." })],
        desc: "A timeline: prepare |−x⟩, measure Z. The solution claims the display shows |+x⟩; actually it shows +1 or −1 with probability 1/2 each." };
    }
    if (key === "nonherm") {
      return { panels: [opMatrixPanel("M", opM(1, 2, 0, 3), { tone: "alpha" }), opMatrixPanel("M†", opM(1, 0, 2, 3), { tone: "warn", note: "M† ≠ M" })],
        desc: "M with rows [1, 2], [0, 3] beside M† with rows [1, 0], [2, 3]. They differ, so M is not Hermitian." };
    }
    const bars = {
      conj: [["claimed P(+1)", 1 / 10, "warn"], ["actual P(+1)", 9 / 10, "plus"]],
      eigprob: [["claimed P(0.8)", 0.8, "warn"], ["actual P(0.8)", 0.5, "plus"], ["claimed P(0.2)", 0.2, "warn"], ["actual P(0.2)", 0.5, "plus"]],
      norm: [["claimed P(2)", 2, "warn"], ["actual P(2)", 0.5, "plus"]]
    }[key];
    return { panels: [opBars("red: the solution’s claim · green: the truth", bars.map(([label, value, tone]) => ({ label, value, tone })), { max: key === "norm" ? 2 : 1 })],
      desc: "Bars: " + bars.map(([label, value]) => label + " " + opFmt(value)).join(", ") + "." };
  }

  // 13 · Quantum Preview: Average Reading. Seeded trials.
  function opAverageModel(c) {
    const A = OP_MATS[c.val("obs")], psi = OP_KETS[c.val("psi")], spec = opSpectrum(A);
    const probs = spec.map(s => opProb(s.ket, psi));
    return { A, psi, spec, probs, mean: spec.reduce((sum, s, k) => sum + s.a * probs[k], 0) };
  }
  function opAverageClear(c) { c.s.n = 0; c.s.sum = 0; c.s.trail = []; c.s.counts = [0, 0]; }
  function opAverageRun(c, n) {
    const m = opAverageModel(c);
    for (let t = 0; t < n; t++) {
      const k = opPick(c.s.rng, m.probs);
      c.s.counts[k] += 1;
      c.s.n += 1;
      c.s.sum += m.spec[k].a;
      c.s.trail.push([c.s.n, c.s.sum / c.s.n]);
    }
    return "Seed " + c.s.seed + " · " + c.s.n + " trials so far · running average " + opFmt(c.s.sum / c.s.n) + ".";
  }

  // 14 · Degenerate Readings. Three-level kets; eigenspaces as lists of orthonormal kets.
  const OP_THREE = {
    d113: { A: [[1, 0, 0], [0, 1, 0], [0, 0, 3]], spaces: { 1: [opKet(1, 0, 0), opKet(0, 1, 0)], 3: [opKet(0, 0, 1)] } },
    k: { A: [[1, 0, 0], [0, 2, 1], [0, 1, 2]], spaces: { 1: [opKet(1, 0, 0), opKet(0, 1, -1)], 3: [opKet(0, 1, 1)] } }
  };
  const OP_THREE_STATES = { u: opKet(1, 1, 1), one: opKet(0, 1, 0), zero: opKet(1, 0, 0) };
  const OP_THREE_NAMES = { u: "(|0⟩ + |1⟩ + |2⟩)/√3", one: "|1⟩", zero: "|0⟩" };
  const opSpaceProb = (space, psi) => space.reduce((sum, k) => sum + opAbs2(opInner(k, psi)), 0);
  const opProjectOnto = (space, psi) => space.reduce((acc, k) => acc.map((z, j) => opAdd(z, opMul(opInner(k, psi), k[j]))), psi.map(() => [0, 0]));
  const opThreeMat = A => A.map(row => row.map(v => [v, 0]));

  // 15 · Direction Dial. n·σ for a unit direction at polar angle θ and azimuth φ.
  const opDialN = (theta, phi) => [Math.sin(opRad(theta)) * Math.cos(opRad(phi)), Math.sin(opRad(theta)) * Math.sin(opRad(phi)), Math.cos(opRad(theta))];
  function opNSigma(theta, phi) {
    const [x, y, z] = opDialN(theta, phi);
    return opM(z, [x, -y], [x, y], -z);
  }
  // The Bloch direction of a ket, after removing its global phase.
  function opBlochOf(v) {
    const u = opNormalize(v), a = opAbs(u[0]), b = opAbs(u[1]);
    const polar = 2 * Math.atan2(b, a) * 180 / Math.PI;
    const azimuth = b < 1e-9 || a < 1e-9 ? 0 : (Math.atan2(u[1][1], u[1][0]) - Math.atan2(u[0][1], u[0][0])) * 180 / Math.PI;
    return { polar, azimuth: opWrap(azimuth) };
  }
  // For a Hermitian, traceless matrix r·σ, the vector r = (Re A₁₂, −Im A₁₂, A₁₁).
  const opAxisOf = A => [A[0][1][0], -A[0][1][1], A[0][0][0]];

  // 16 · Hermitian vs Unitary.
  const OP_DECK = {
    x: { A: OP_MATS.x, kind: "both", name: "X" }, y: { A: OP_MATS.y, kind: "both", name: "Y" }, z: { A: OP_MATS.z, kind: "both", name: "Z" },
    h: { A: opMatScale(opMatAdd(OP_MATS.x, OP_MATS.z), Math.SQRT1_2), kind: "both", name: "(X + Z)/√2" },
    s: { A: opM(1, 0, 0, [0, 1]), kind: "unit", name: "S" }, twoz: { A: opMatScale(OP_MATS.z, 2), kind: "herm", name: "2Z" },
    rot: { A: opM(0, -1, 1, 0), kind: "unit", name: "quarter-turn" }, shear: { A: opM(1, 1, 0, 1), kind: "neither", name: "shear" }
  };
  const opIsUnitary = A => opMatGap(opMatMul(opDagger(A), A), OP_MATS.id) < 1e-9;

  const opStations3 = {
    // 11 · Observable Designer ------------------------------------------------------------------------
    designer: {
      show(c) {
        const A = c.quietMat("a");
        if (!A) {
          c.put("state", "Finish every box of your A.");
          return { panels: [opMatrixPanel("your A", [["?", "?"], ["?", "?"]], { tone: "beta" })], caption: "your A", desc: "Your matrix is not complete yet." };
        }
        const gap = opHermGap(A), herm = gap <= OP_DERIVED;
        const spec = herm ? opSpectrum(A) : [];
        c.put("state", "Your A = " + opMatText(A) + (herm ? " · Hermitian · readings " + opReadingsText(spec) : " · not Hermitian: largest entry of A − A† = " + opFmt(gap)) + ".");
        const panels = [opMatrixPanel("your A", A, { tone: herm ? "plus" : "warn", note: herm ? "A = A†" : "A ≠ A†" })];
        if (herm) {
          const all = spec.map(s => s.a), x0 = Math.floor(Math.min(...all, 0) - 1), x1 = Math.ceil(Math.max(...all, 1) + 1);
          panels.push(opLine("your readings", { weight: 1.4, x: [x0, x1], every: x1 - x0 > 12 ? 2 : 1,
            rows: [{ label: "A", tone: "alpha", points: spec.map((s, k) => ({ x: s.a, tone: k ? "minus" : "plus", label: opFmt(s.a), raise: k && Math.abs(spec[0].a - s.a) < 0.4 ? 16 : 0 })) }] }));
        }
        return {
          panels,
          caption: herm ? "readings " + spec.map(s => opFmt(s.a)).join(" and ") : "not Hermitian",
          desc: "Your matrix with " + opMatText(A) + (herm ? ". It is Hermitian with readings " + spec.map(s => opFmt(s.a)).join(" and ") + ", marked on a number line." : ". It is not Hermitian.")
        };
      },
      checks: {
        qubit: ["Use A = 0·|−y⟩⟨−y| + 1·|+y⟩⟨+y|.", "|+y⟩⟨+y| has rows [1/2, −i/2], [i/2, 1/2].", c => {
          const d = opDesignCheck(c);
          if (d.fail) return d.fail;
          if (!opNearSet(d.spec.map(s => s.a), [0, 1])) return opGrade(false, "Your readings are " + d.spec.map(s => opFmt(s.a)).join(" and ") + ", not 0 and 1.");
          return opGrade(opIsEigen(d.A, OP_KETS.plusy, 1), "Readings 0 and 1 are right, but |+y⟩ is not the eigenket for 1.",
            "Your A has readings 0 and 1 with A|+y⟩ = |+y⟩. With two readings and one eigenket fixed, the only answer is |+y⟩⟨+y| = (I + Y)/2: a projector, which answers the yes-or-no question “is the system in |+y⟩?”");
        }],
        offdiag: ["Diagonal matrices have eigenkets |0⟩ and |1⟩.", "Try 3.5I + 1.5X, or any 2|a⟩⟨a| + 5|b⟩⟨b| with a tilted pair.", c => {
          const d = opDesignCheck(c);
          if (d.fail) return d.fail;
          if (!opNearSet(d.spec.map(s => s.a), [2, 5])) return opGrade(false, "Your readings are " + d.spec.map(s => opFmt(s.a)).join(" and ") + ", not 2 and 5.");
          return opGrade(opAbs(d.A[0][1]) > OP_DERIVED, "Readings 2 and 5 are right, but your A is diagonal, so its eigenkets are |0⟩ and |1⟩.",
            "Your A reads 2 and 5 with eigenkets " + d.spec.map(s => opKetText(s.ket)).join(" and ") + ". One design is 3.5I + 1.5X, with 5 on |+x⟩ and 2 on |−x⟩. There are infinitely many others.");
        }],
        plusx: ["A|+x⟩ = 3|+x⟩ fixes A on |+x⟩. A|−x⟩ = b|−x⟩ for any b ≠ 3.", "For example, 3|+x⟩⟨+x| has rows [3/2, 3/2], [3/2, 3/2].", c => {
          const d = opDesignCheck(c);
          if (d.fail) return d.fail;
          if (!opIsEigen(d.A, OP_KETS.plusx, 3)) return opGrade(false, "Your A does not send |+x⟩ to 3|+x⟩.");
          return opGrade(!opIsEigen(d.A, OP_KETS.zero), "|+x⟩ is right, but your A also gives |0⟩ a definite reading. Make the other reading differ from 3.",
            "Your A reads 3 on |+x⟩ and " + opFmt(d.spec.find(s => !opParallel(s.ket, OP_KETS.plusx))?.a ?? 3) + " on |−x⟩, so |0⟩, an even mix of the two, has no definite reading. 3I would fail: it makes every state definite.");
        }],
        complex: ["Normalize the ket first: (1 − i, 1)ᵀ/√3 already is.", "A = 4|v⟩⟨v| + b|w⟩⟨w|, with |w⟩ orthogonal to |v⟩.", c => {
          const d = opDesignCheck(c);
          if (d.fail) return d.fail;
          if (!opIsEigen(d.A, OP_DESIGN_KET, 4)) return opGrade(false, "Your A does not send (1 − i, 1)ᵀ to 4 times itself.");
          return opGrade(Math.abs(d.spec[0].a - d.spec[1].a) > OP_DERIVED, "Both readings are 4, so A = 4I. Choose a different second reading.",
            "Your A has readings " + d.spec.map(s => opFmt(s.a)).join(" and ") + ". One design is 4|v⟩⟨v| = rows [8/3, (4 − 4i)/3], [(4 + 4i)/3, 4/3], with second reading 0 on (1, −1 − i)ᵀ/√3.");
        }],
        impossible: ["Are |0⟩ and |+x⟩ orthogonal?", "⟨0|+x⟩ = 1/√2.", c => opGrade(c.choice("impossible-pick") === "orth", "Compute ⟨0|+x⟩.",
          "Eigenkets of a Hermitian matrix for different readings are orthogonal, but ⟨0|+x⟩ = 1/√2 ≠ 0. No observable has this card’s eigenkets. Station 4 shows the non-Hermitian matrices that would.")]
      }
    },

    // 12 · Error Detective ------------------------------------------------------------------------------
    detective: {
      show(c) {
        const key = c.open() ?? "product";
        c.put("state", c.open() ? "Case file open: " + OP_ERRORS[key].text + "." : "Open a case file. Showing case 1.");
        return { ...opErrorPlan(key), caption: OP_ERRORS[key].text };
      },
      checks: {
        product: ["Lines 1 and 2 are correct.", "What does an instrument display: a ket or a number?", opErrorGrader("product")],
        conj: ["Line 1 is correct.", "The bra is the conjugate transpose of the ket.", opErrorGrader("conj")],
        nonherm: ["Line 1 is correct.", "Compute M†.", opErrorGrader("nonherm")],
        eigprob: ["Lines 1 and 2 are correct.", "Where does the state |+x⟩ enter the calculation?", opErrorGrader("eigprob")],
        norm: ["Lines 1 and 2 are correct.", "Can a probability be 2?", opErrorGrader("norm")]
      }
    },

    // 13 · Quantum Preview: Average Reading -------------------------------------------------------------
    average: {
      start(c) { opSeed(c); opAverageClear(c); },
      edit(c, name) { if (name === "obs" || name === "psi") opAverageClear(c); },
      actions: {
        run10(c) { return opAverageRun(c, 10); },
        run100(c) { return opAverageRun(c, 100); },
        run1000(c) { return opAverageRun(c, 1000); },
        clear(c) { opAverageClear(c); return "Readings cleared."; },
        reseed(c) { return opReseed(c); }
      },
      show(c) {
        const m = opAverageModel(c), n = c.s.n, lo = m.spec[0].a, hi = m.spec[1].a;
        c.put("state", "Seed " + c.s.seed + " · A = " + OP_NAMES[c.val("obs")] + " · |ψ⟩ = " + OP_KET_NAMES[c.val("psi")] + " · readings " +
          m.spec.map((s, k) => opFmt(s.a) + " with P = " + opFmt(m.probs[k])).join(" and ") + " · " + n + " trials" +
          (n ? ": " + m.spec.map((s, k) => c.s.counts[k] + " × " + opFmt(s.a)).join(", ") + ", average " + opFmt(c.s.sum / n) : "") + ".");
        const width = Math.max(10, n), step = Math.max(1, Math.ceil(c.s.trail.length / 400));
        const pts = c.s.trail.filter((_, k) => k % step === 0 || k === c.s.trail.length - 1);
        const shown = ["d25", "m6", "run", "h14"].some(key => c.revealed(key));
        const y0 = Math.floor(lo - 0.5), y1 = Math.ceil(hi + 0.5);
        return {
          panels: [
            opChart("running average of the readings", { weight: 1.7, x: [0, width], y: [y0, y1], xTicks: [0, Math.round(width / 2), width], yTicks: [y0, lo, hi, y1].filter((v, k, a) => a.indexOf(v) === k), xLabel: "number of trials",
              series: pts.length ? [{ pts, tone: "plus" }] : [], hlines: shown ? [{ y: m.mean, label: "Σ a·P(a)" }] : [] }),
            opBars("readings seen", m.spec.map((s, k) => ({ label: opFmt(s.a), value: n ? c.s.counts[k] / n : 0, text: n ? String(c.s.counts[k]) : "–", tone: k ? "minus" : "plus" })))
          ],
          caption: n ? "average " + opFmt(c.s.sum / n) : "no trials yet",
          desc: "Left: the running average of the readings after each of " + n + " trials" + (n ? ", ending at " + opFmt(c.s.sum / n) : "") +
            ". Right: how often each reading appeared. After you complete a prediction mission, a yellow line marks the long-run value."
        };
      },
      checks: {
        d25: ["|+x⟩ gives each reading with probability 1/2.", "2·(1/2) + 5·(1/2).", c => {
          const v = c.ans("d25-avg");
          return opGrade(opFits(v, 7 / 2), "Weight each reading by its probability and add.",
            "Σ a·P(a) = 2·(1/2) + 5·(1/2) = 7/2. No single trial shows 3.5; runs of trials average toward it.");
        }],
        m6: ["Σ a·P(a) = 2·(1/5) + 7·(4/5).", "⟨0|A|0⟩ is the entry in row 1, column 1.", c => {
          const a = c.ans("m6-sum"), b = c.ans("m6-sandwich");
          if (!opFits(a, 6)) return opGrade(false, "Recompute Σ a·P(a) = 2·(1/5) + 7·(4/5).");
          if (!opFits(b, 6)) return opGrade(false, "Σ a·P(a) is right. For ⟨0|A|0⟩, multiply A|0⟩ by the bra ⟨0|.");
          return opGrade(c.choice("m6-pick") === "not", "Is 6 one of the readings 2 and 7?",
            "2/5 + 28/5 = 6, and ⟨0|A|0⟩ = A₁₁ = 6. The long-run average equals a diagonal entry here, yet 6 is never displayed: every trial shows 2 or 7.");
        }],
        run: ["Run at least 100 trials without changing the setup.", "Read your average from the readout; the long-run value comes from the probabilities.", c => {
          if (c.s.n < 100) return opSetup("Run at least 100 trials first. You have " + c.s.n + ".");
          const obs = c.ans("run-obs"), long = c.ans("run-long"), m = opAverageModel(c), avg = c.s.sum / c.s.n;
          if (Math.abs(obs - avg) > 0.01) return opGrade(false, "Your run’s average is " + opFmt(avg) + ". Copy it from the readout.");
          return opGrade(opFits(long, m.mean), "That is not Σ a·P(a) for this setup. Use the probabilities, not the run.",
            "Your " + c.s.n + " trials average " + opFmt(avg) + ", and the long-run value is " + opFmt(m.mean) + ". A finite run lands near the long-run value but rarely on it; Lesson 15 measures how near.");
        }],
        h14: ["You found P(1) = 1/6 and P(4) = 5/6 in station 6.", "For the sandwich, compute A|+y⟩ first, then take ⟨+y| of it.", c => {
          const a = c.ans("h14-sum"), b = c.ans("h14-sandwich");
          if (!opFits(a, 7 / 2)) return opGrade(false, "Recompute Σ a·P(a) = 1·(1/6) + 4·(5/6).");
          return opGrade(opFits(b, 7 / 2), "Σ a·P(a) is right. Now A|+y⟩ = (3 + i, 1 + 4i)ᵀ/√2; take its inner product with ⟨+y| = (1, −i)/√2.",
            "1/6 + 20/6 = 21/6 = 7/2. And ⟨+y|A|+y⟩ = [(3 + i) + (−i)(1 + 4i)]/2 = (3 + i − i + 4)/2 = 7/2. Both routes agree, as A = Σ a|a⟩⟨a| promises.");
        }],
        single: ["Run 10 trials and read each value.", "What can one trial show?", c => opGrade(c.choice("single-pick") === "no", "List the values a single trial can show.",
          "Every trial shows an eigenvalue, 2 or 5. The average 3.5 describes many trials, not any one of them.")]
      }
    },

    // 14 · Degenerate Readings ----------------------------------------------------------------------------
    degenerate: {
      start(c) { c.s.bars = false; },
      actions: {
        reveal(c) { c.s.bars = true; return "Bars shown for this setup."; },
        hide(c) { c.s.bars = false; return "Bars hidden."; }
      },
      show(c) {
        const obs = OP_THREE[c.val("obs")], psi = OP_THREE_STATES[c.val("psi")];
        const p1 = opSpaceProb(obs.spaces[1], psi), p3 = opSpaceProb(obs.spaces[3], psi);
        const after = p1 > 1e-9 ? opNormalize(opProjectOnto(obs.spaces[1], psi)) : null;
        c.put("state", "A = rows " + obs.A.map(r => "[" + r.map(opFmt).join(", ") + "]").join(", ") + " · |ψ⟩ = " + OP_THREE_NAMES[c.val("psi")] +
          (c.s.bars ? " · P(1) = " + opFmt(p1) + " · P(3) = " + opFmt(p3) + (after ? " · after reading 1 the ket is " + opKetText(after) : "") + "." : " · press Show the bars to see P(1) and P(3)."));
        return {
          panels: [opMatrixPanel("A", opThreeMat(obs.A), { tone: "alpha" }),
            opBars(c.s.bars ? "probability of each reading" : "bars hidden", [
              { label: "reading 1", value: c.s.bars ? p1 : 0, text: c.s.bars ? opFmt(p1) : "?", tone: "plus" },
              { label: "reading 3", value: c.s.bars ? p3 : 0, text: c.s.bars ? opFmt(p3) : "?", tone: "minus" }])],
          caption: OP_THREE_NAMES[c.val("psi")],
          desc: "Left: the 3×3 matrix A. Right: " + (c.s.bars ? "P(1) = " + opFmt(p1) + " and P(3) = " + opFmt(p3) + "." : "the bars are hidden.")
        };
      },
      checks: {
        count: ["List the eigenvalues, then remove repeats.", "The reading 1 has two eigenkets, |0⟩ and |1⟩.", c => {
          const n = c.ans("count-n");
          if (opFits(n, 3)) return opGrade(false, "3 counts eigenkets. The reading 1 appears twice.");
          return opGrade(opFits(n, 2), "How many different numbers can the display show?",
            "The eigenvalues are 1, 1 and 3, so only two readings can appear: 1 and 3. The reading 1 belongs to a whole plane of eigenkets.");
        }],
        sum: ["Add the squared overlaps with |0⟩ and |1⟩ for P(1).", "Each overlap is 1/√3.", c => {
          const a = c.ans("sum-p1"), b = c.ans("sum-p3");
          if (opFits(a, 1 / 3) && opFits(b, 1 / 3)) return opGrade(false, "Those add to 2/3, not 1. The reading 1 collects two eigenkets.");
          return opGrade(opFits(a, 2 / 3) && opFits(b, 1 / 3), "P(1) is a sum over the reading-1 eigenkets.",
            "P(1) = |⟨0|ψ⟩|² + |⟨1|ψ⟩|² = 1/3 + 1/3 = 2/3 and P(3) = |⟨2|ψ⟩|² = 1/3.");
        }],
        after: ["Keep the part of |ψ⟩ in the reading-1 plane and drop the rest.", "Project: (1, 1, 1) → (1, 1, 0), then normalize.", c => {
          const v = c.ket("after", 3);
          if (opNorm2(v) < 1e-12) return opGrade(false, "The zero ket is not a state.");
          if (opParallel(v, OP_THREE_STATES.u)) return opGrade(false, "That is the state before the reading. The reading 1 removes the |2⟩ part.");
          if (opParallel(v, opKet(1, 0, 0)) || opParallel(v, opKet(0, 1, 0))) return opGrade(false, "That is one eigenket for reading 1, but the reading doesn’t pick one. Keep the whole projection.");
          return opGrade(opParallel(v, opKet(1, 1, 0)), "Your ket is not the projection of |ψ⟩ onto the reading-1 plane.",
            "The projection is (1, 1, 0)ᵀ/√3, which normalizes to (|0⟩ + |1⟩)/√2. With a degenerate reading, the new ket depends on the state, not only on the reading.");
        }],
        which: ["Apply diag(1, 1, 3) to each ket.", "Any combination of |0⟩ and |1⟩ is multiplied by 1.", c => {
          const off = opTickMisses(c, "which", ["0", "1", "mix", "2", "02"], ["0", "1", "mix"]);
          return opGrade(!off, opTickText(off),
            "|0⟩, |1⟩ and (|0⟩ − i|1⟩)/√2 all lie in the reading-1 plane, so A multiplies them by 1. |2⟩ has reading 3, and (|0⟩ + |2⟩)/√2 mixes the two readings, so it is not an eigenket.");
        }],
        hidden: ["The reading-1 eigenkets of this A are |0⟩ and (|1⟩ − |2⟩)/√2.", "|⟨0|1⟩|² + |⟨(1 − 2)/√2|1⟩|².", c => {
          const v = c.ans("hidden-p1");
          if (opFits(v, 0)) return opGrade(false, "|1⟩ has no overlap with |0⟩, but the reading 1 has a second eigenket.");
          return opGrade(opFits(v, 1 / 2), "Sum the squared overlaps of |1⟩ with both reading-1 eigenkets.",
            "P(1) = |⟨0|1⟩|² + |(⟨1| − ⟨2|)|1⟩/√2|² = 0 + 1/2 = 1/2, and P(3) = 1/2. The degeneracy is hidden by the off-diagonal entries, but the rule is the same.");
        }]
      }
    },

    // 15 · Direction Dial (3D) ----------------------------------------------------------------------------
    dial: {
      drag(c, dx, dy) {
        c.set("yaw", ((Math.round((c.num("yaw") - dx * 0.5) / 5) * 5) % 360 + 360) % 360);
        c.set("tilt", Math.max(-60, Math.min(60, Math.round((c.num("tilt") + dy * 0.3) / 5) * 5)));
      },
      show(c) {
        const theta = c.num("theta"), phi = c.num("phi"), n = opDialN(theta, phi);
        const v = c.quietKet("v"), typed = c.quietMat("n");
        const valid = v && opNorm2(v) > 1e-12;
        const points = [];
        let built = "";
        if (typed && opHermGap(typed) < OP_DERIVED && Math.abs(opTrace(typed)[0]) < OP_DERIVED) {
          const r = opAxisOf(typed), size = Math.hypot(...r);
          if (size > 1e-6) {
            points.push({ point: r.map(x => x / size), tone: "beta", label: "your +1", size: 6 }, { point: r.map(x => -x / size), tone: "beta", size: 4 });
            built = " · your matrix is r·σ with r = (" + r.map(opFmt).join(", ") + ")";
          }
        } else if (typed) built = " · your matrix is not of the form r·σ (it must be Hermitian with trace 0)";
        const marker = valid ? opBlochOf(v) : { polar: 0, azimuth: 0 };
        c.put("state", "θ = " + opAngleText(theta) + " · φ = " + opAngleText(phi) + " · n = (" + n.map(opFmt).join(", ") + ")" + built +
          (valid ? " · your |v⟩ sits " + opFmt(Math.round(marker.polar * 10) / 10) + "° from |0⟩ at azimuth " + opFmt(Math.round(marker.azimuth * 10) / 10) + "°" : "") + ".");
        return {
          sphere: { yaw: c.num("yaw"), tilt: c.num("tilt"), marker, axis: n, ends: ["+1", "−1"], shownLabel: "|v⟩",
            points: [{ point: n, tone: "angle", size: 5 }, { point: n.map(x => -x), tone: "minus", size: 5 }, ...points] },
          caption: "θ = " + opFmt(theta) + "°, φ = " + opFmt(phi) + "°",
          desc: "A Bloch sphere with |0⟩ at the top. The yellow axis is n at θ = " + opFmt(theta) + "° and φ = " + opFmt(phi) + "°, with the +1 eigenket at its tip and the −1 eigenket opposite." +
            (points.length ? " Orange dots mark the axis of the matrix you typed." : "") + (valid ? " The green point is your eigenket |v⟩." : "")
        };
      },
      checks: {
        tilt45: ["n = (sin 45°, 0, cos 45°) = (1/√2, 0, 1/√2).", "n·σ = (X + Z)/√2.", opGridGrader("n", opNSigma(45, 0), "n·σ has rows [n_z, n_x − i n_y], [n_x + i n_y, −n_z].",
          "n·σ = (X + Z)/√2, with rows [1/√2, 1/√2], [1/√2, −1/√2]. Its trace is 0 and its determinant is −1/2 − 1/2 = −1, so its readings are ±1.")],
        eq45: ["n = (cos 45°, sin 45°, 0).", "The off-diagonal entries are n_x ∓ i n_y.", opGridGrader("n", opNSigma(90, 45), "n·σ has rows [n_z, n_x − i n_y], [n_x + i n_y, −n_z].",
          "n = (1/√2, 1/√2, 0), so n·σ = (X + Y)/√2, with rows [0, (1 − i)/√2], [(1 + i)/√2, 0]. Its +1 eigenket is (|0⟩ + e^(iπ/4)|1⟩)/√2, on the equator at φ = 45°.",
          [[opNSigma(90, -45), "That has the signs of i swapped. Row 1, column 2 is n_x − i n_y."]])],
        ket60: ["The +1 eigenket is cos(θ/2)|0⟩ + e^(iφ) sin(θ/2)|1⟩.", "cos 30° = √3/2, sin 30° = 1/2, e^(i·90°) = i.", c => {
          const v = c.ket("v"), A = opNSigma(60, 90);
          if (opNorm2(v) < 1e-12) return opGrade(false, "The zero ket is not a state.");
          if (opIsEigen(A, v, -1)) return opGrade(false, "That is the −1 eigenket, at the opposite end of the axis.");
          return opGrade(opIsEigen(A, v, 1), "n·σ times your ket is not your ket.",
            "(√3/2)|0⟩ + (i/2)|1⟩ is the +1 eigenket, sitting at θ = 60°, φ = 90° on the sphere. Any global phase times it is the same point.");
        }],
        aim: ["|−y⟩ sits on the equator at the −y end.", "θ = 90°; which azimuth points along −y?", c => {
          const ok = opAngleFits(c.num("theta"), 90) && opAngleFits(c.num("phi"), 270);
          return opGrade(ok, "The +1 end of the yellow axis must sit on |−y⟩. Watch the sphere labels.",
            "θ = 90°, φ = 270° gives n = (0, −1, 0) and n·σ = −Y. Its +1 eigenket is |−y⟩, because Y|−y⟩ = −|−y⟩.");
        }],
        five: ["r·σ has trace 0 and determinant −|r|².", "|r| = √(9 + 16).", c => {
          const typed = [c.ans("five-r1"), c.ans("five-r2")];
          if (opSameSet(typed, [1, -1])) return opGrade(false, "±1 is for unit vectors. This one has length 5.");
          return opGrade(opSameSet(typed, [5, -5]), "Find the eigenvalues of rows [4, −3i], [3i, −4].",
            "3Y + 4Z has rows [4, −3i], [3i, −4]: trace 0 and determinant −16 − 9 = −25, so the readings are ±5. It is 5 times the unit-direction observable for n = (0, 3/5, 4/5).");
        }]
      }
    },

    // 16 · Hermitian vs Unitary -------------------------------------------------------------------------------
    unitary: {
      start(c) { c.s.log = []; c.s.tested = {}; },
      actions: {
        testh(c) {
          const key = c.val("mat"), card = OP_DECK[key], herm = opHermGap(card.A) < 1e-9;
          (c.s.tested[key] ??= {}).herm = herm;
          const line = card.name + ": A† = " + opMatText(opDagger(card.A)) + (herm ? ", equal to A: Hermitian." : ", not equal to A: not Hermitian.");
          c.s.log.push(line);
          return line;
        },
        testu(c) {
          const key = c.val("mat"), card = OP_DECK[key], unit = opIsUnitary(card.A);
          (c.s.tested[key] ??= {}).unit = unit;
          const line = card.name + ": A†A = " + opMatText(opMatMul(opDagger(card.A), card.A)) + (unit ? ", equal to I: unitary." : ", not I: not unitary.");
          c.s.log.push(line);
          return line;
        },
        clear(c) { c.s.log = []; c.s.tested = {}; return "Tests cleared."; }
      },
      show(c) {
        const card = OP_DECK[c.val("mat")];
        c.list("log", c.s.log);
        c.put("state", card.name + " = " + opMatText(card.A) + ". Run both tests to place it on the map.");
        const dots = Object.entries(c.s.tested).filter(([, t]) => "herm" in t && "unit" in t).map(([key, t], k) => ({
          x: (t.herm ? 1.5 : 0.5) + ((k % 3) - 1) * 0.28, y: (t.unit ? 1.5 : 0.5) + (Math.floor(k / 3) % 3 - 1) * 0.25,
          tone: t.herm && t.unit ? "plus" : t.herm ? "alpha" : t.unit ? "angle" : "warn", label: OP_DECK[key].name.split(" ")[0]
        }));
        return {
          panels: [opChart("tested matrices", {
            x: [0, 2], y: [0, 2], xTicks: [1], yTicks: [], xTickText: ["← not Hermitian | Hermitian →"], xLabel: "",
            vlines: [{ x: 1, tone: "guide" }], hlines: [{ y: 1, tone: "guide", label: "unitary above" }], dots
          }), opMatrixPanel(card.name, card.A, { tone: "alpha" })],
          caption: card.name,
          desc: "Left: a map with Hermitian matrices on the right and unitary ones on the top; each matrix you have tested both ways is a dot. Right: " + card.name + " with " + opMatText(card.A) + "."
        };
      },
      checks: {
        deck: ["Run both tests on each matrix.", "Hermitian needs A† = A. Unitary needs A†A = I.", c => {
          const keys = Object.keys(OP_DECK), off = keys.filter(key => c.choice("deck-" + key) !== OP_DECK[key].kind).length;
          return opGrade(!off, (off === 1 ? "1 matrix is" : off + " matrices are") + " in the wrong place.",
            "Both: X, Y, Z and (X + Z)/√2. Unitary only: S and the quarter-turn rows [0, −1], [1, 0]. Hermitian only: 2Z, which doubles norms. Neither: the shear rows [1, 1], [0, 1].");
        }],
        ss: ["S† has rows [1, 0], [0, −i].", "Multiply S† by S.", opGridGrader("u", OP_MATS.id, "Compute S†S = rows [1, 0], [0, (−i)(i)].",
          "S†S = rows [1, 0], [0, (−i)(i)] = rows [1, 0], [0, 1] = I. S is unitary.", [[opM(1, 0, 0, -1), "That is SS = S². Use S† on the left."]])],
        seig: ["What must every reading be?", "Is i real?", c => opGrade(c.choice("seig-pick") === "real", "Think about what a display can show.",
          "Readings are eigenvalues, and readings are real. S has eigenvalue i, so S ≠ S† and S is not an observable. It still preserves norms, since |i| = 1.")],
        cz: ["(cZ)†(cZ) = |c|² I.", "(cZ)† = c* Z, which equals cZ only when c is real.", c => {
          const z = c.cx("cz"), size = opAbs(z);
          if (Math.abs(size - 1) > OP_DERIVED) return opGrade(false, "|c| = " + opFmt(size) + ". Unitarity needs |c| = 1.");
          return opGrade(Math.abs(z[1]) > OP_DERIVED, "c = " + opCx(z) + " is real, so cZ is also Hermitian. Give c an imaginary part.",
            "c = " + opCx(z) + " has |c| = 1, so (cZ)†(cZ) = |c|²I = I. It isn’t real, so (cZ)† = c*Z ≠ cZ. For example, c = i gives iZ = rows [i, 0], [0, −i].");
        }],
        both: ["Hermitian forces real eigenvalues.", "Unitary forces |λ| = 1.", c => opGrade(c.choice("both-pick") === "pm1", "Combine the two conditions on λ.",
          "Real and of size 1 leaves only +1 and −1. That is why X, Y and Z, which are both, read ±1. In Lesson 17, unitary matrices that are not Hermitian describe how states change in time.")]
      }
    }
  };

  const opStations = { ...opStations1, ...opStations2, ...opStations3 };

  function opPalette(root) {
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

  function initializeObservablesArcade(root) {
    const details = root.querySelector("#observables-arcade");
    if (!details) return;
    const get = id => root.querySelector("#op-" + id);
    const select = get("station"), resetButton = get("reset"), status = get("status");
    const reducedBox = get("reduced"), progress = get("progress");
    const figure = get("figure-template").content.firstElementChild.cloneNode(true);
    const toolTemplate = get("mission-template");
    const viewport = figure.querySelector("#op-viewport");
    const canvas = figure.querySelector("#op-canvas");
    const geometry = figure.querySelector("[data-op-geometry]");
    const labelLayer = figure.querySelector("[data-op-labels]");
    const desc = figure.querySelector("#op-desc");
    const title = figure.querySelector("#op-title");
    const renderStatus = figure.querySelector("#op-render-status");
    const colors = opPalette(root);
    const lifetime = new AbortController();
    const listen = (node, type, handler, options = {}) =>
      node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
    const panels = new Map(), cards = new Map(), completion = new Set();
    let active = null, plan = null;
    let graphics = null, loading = false, failed = false, contextLost = false, disposed = false;
    let frame = null, motionFrame = null, lastTick = null, drag = null, glide = null;

    const say = message => opSetText(status, message ?? "");
    const updateProgress = () => opSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

    for (const panel of root.querySelectorAll("#op-panels [data-op-station]")) {
      const key = panel.dataset.opStation;
      const spec = opStations[key];
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
          const value = opParse(input.value);
          if (value === null) throw new OpFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2 or 1/√2.", true);
          return value;
        },
        quiet: name => opParse(field(name).value),
        cx: prefix => [c.ans(prefix + "-re"), c.ans(prefix + "-im")],
        // A complex value for drawing only; null while either box is blank or mid-edit.
        quietCx(prefix) {
          const re = c.quiet(prefix + "-re"), im = c.quiet(prefix + "-im");
          return re === null || im === null ? null : [re, im];
        },
        // A 2×2 matrix grid: cells prefix-11, prefix-12, prefix-21, prefix-22.
        mat: prefix => [[1, 2], [1, 2]].map((cols, r) => cols.map(col => c.cx(prefix + "-" + (r + 1) + col))),
        quietMat(prefix) {
          const rows = [[1, 2], [1, 2]].map((cols, r) => cols.map(col => c.quietCx(prefix + "-" + (r + 1) + col)));
          return rows.flat().some(z => !z) ? null : rows;
        },
        // A ket typed as prefix-0, prefix-1, … complex boxes.
        ket: (prefix, n = 2) => Array.from({ length: n }, (_, k) => c.cx(prefix + "-" + k)),
        quietKet(prefix, n = 2) {
          const ket = Array.from({ length: n }, (_, k) => c.quietCx(prefix + "-" + k));
          return ket.some(z => !z) ? null : ket;
        },
        choice(name) {
          const input = field(name);
          if (!input.value) throw new OpFieldError(input, "Choose an option.");
          return input.value;
        },
        set(name, value) { field(name).value = String(value); },
        put(name, text) { opSetText(c.node('[data-op-read="' + name + '"]'), text); },
        list(name, lines) {
          const list = c.node('[data-op-log="' + name + '"]');
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
      for (const card of panel.querySelectorAll("[data-op-mission]")) {
        const id = card.dataset.opMission, check = id.slice(key.length + 1);
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
      opSetText(renderStatus, message);
    }

    function refresh() {
      if (!active || !details.open) return;
      plan = active.spec.show(active);
      for (const output of active.panel.querySelectorAll("output[data-op-for]")) {
        const value = active.val(output.dataset.opFor);
        opSetText(output, "opAngle" in output.dataset
          ? opAngleText(Number(value))
          : value.replace("-", "−") + (output.dataset.opUnit ?? ""));
      }
      opSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
      opSetText(desc, plan.desc || "");
      if (plan.sphere) {
        const target = opBlochPoint(plan.sphere.marker);
        if (!glide) glide = { from: target, to: target, start: 0, point: target };
        else if (glide.to.some((n, i) => n !== target[i])) {
          glide = { from: glide.point, to: target, start: performance.now(), point: glide.point };
          if (reduced() || !onScreen()) glide = { from: target, to: target, start: 0, point: target };
        }
      }
      if (plan.sphere && !graphics && !loading && !failed) loadGraphics();
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
      const kind = plan.sphere ? "sphere" : null;
      const view = plan.sphere ? { ...plan.sphere, shown: glide?.point } : null;
      opPaintSvg(plan, geometry, labelLayer, view);
      if (!kind) {
        showSvg("SVG diagram.");
        return;
      }
      const noun = "sphere";
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
        opSetText(renderStatus, "Three.js 3D view. Drag the " + noun + " or use the view sliders to turn it.");
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
        graphics = opCreateGraphics(THREE, canvas, colors);
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
      active.node("[data-op-plot-slot]").append(figure);
      viewport.dataset.space = active.spec.drag ? "true" : "false";
      glide = null;
      lastTick = null;
      refresh();
    }

    function clearCard(card) {
      opSetText(card.querySelector("[data-op-feedback]"), "");
      const work = card.querySelector("[data-op-work]");
      work.hidden = true;
      work.open = false;
    }

    function showGrade(mission, result) {
      const { card, id, check, station } = mission;
      const work = card.querySelector("[data-op-work]");
      opSetText(card.querySelector("[data-op-feedback]"),
        result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
      opSetText(card.querySelector("[data-op-work-text]"), result.work || "");
      work.hidden = !result.work;
      work.open = Boolean(result.work) && !result.pass;
      if (result.pass) station.s.revealed[check] = true;
      if (result.pass && !completion.has(id)) {
        completion.add(id);
        card.querySelector("[data-op-done]").hidden = false;
        updateProgress();
      }
      say("");
    }

    function handleClick(event) {
      const button = event.target.closest("button");
      if (!button || !active || !active.panel.contains(button) || button.disabled) return;
      const missionCard = button.closest("[data-op-mission]");
      const mission = missionCard ? cards.get(missionCard.dataset.opMission) : null;
      const action = button.dataset.opAction;
      try {
        if (action) {
          const message = active.spec.actions[action](active, mission?.check ?? null);
          if (mission) opSetText(mission.card.querySelector("[data-op-feedback]"), message ?? "");
          else if (message !== null) say(message);
        } else if (mission && button.hasAttribute("data-op-check")) {
          showGrade(mission, active.spec.checks[mission.check][2](active));
        } else if (mission && button.hasAttribute("data-op-hint")) {
          if (mission.hints >= 2) return;
          const list = mission.card.querySelector("[data-op-hint-list]");
          const item = document.createElement("li");
          opSetText(item, active.spec.checks[mission.check][mission.hints]);
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
        if (!(error instanceof OpFieldError)) throw error;
        if (mission) opSetText(mission.card.querySelector("[data-op-feedback]"), error.message);
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
      const missionCard = target.closest("[data-op-mission]");
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
    listen(root.querySelector("#op-arcade-link"), "click", () => { details.open = true; });

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
    if (location.hash === "#observables-arcade") details.open = true;
  }

  // ---------------------------------------------------------------------------
  // SVG drawing. The viewBox is 560 × 300 and labels always stay in SVG.
  // ---------------------------------------------------------------------------

  function opNode(name, attributes = {}, text = "") {
    const node = document.createElementNS(OP_SVG, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    }
    if (text) node.textContent = text;
    return node;
  }


  function opPaintSvg(plan, geometry, labels, view) {
    const shapes = [], words = [];
    if (plan.panels) opDrawPanels(plan.panels, shapes, words);
    if (plan.sphere && view) opDrawSphere(view, shapes, words);
    geometry.replaceChildren(...shapes);
    labels.replaceChildren(...words);
  }

  function opDrawPanels(panels, shapes, words) {
    const total = panels.reduce((sum, panel) => sum + (panel.weight ?? 1), 0);
    let x = 0;
    for (const panel of panels) {
      const box = { x, w: 560 * (panel.weight ?? 1) / total };
      if (panel.kind === "plane") opDrawPlane(panel, box, shapes, words);
      else if (panel.kind === "chart") opDrawChart(panel, box, shapes, words);
      else if (panel.kind === "bars") opDrawBars(panel, box, shapes, words);
      else if (panel.kind === "matrix") opDrawMatrix(panel, box, shapes, words);
      else if (panel.kind === "line") opDrawLine(panel, box, shapes, words);
      else if (panel.kind === "chain") opDrawChain(panel, box, shapes, words);
      x += box.w;
    }
  }

  // Boxes joined by arrows: a preparation, then measurement stages, each with a line of detail.
  function opDrawChain(chain, box, shapes, words) {
    const n = chain.items.length, left = box.x + 10, right = box.x + box.w - 10;
    const slot = (right - left) / n, w = Math.min(slot - 22, 120), cy = 140, h = 74;
    words.push(opNode("text", { class: "op-caption", x: (left + right) / 2, y: 40, "text-anchor": "middle" }, chain.caption));
    chain.items.forEach((item, k) => {
      const cx = left + slot * (k + 0.5);
      shapes.push(opNode("rect", { class: "op-part", "data-tone": item.tone, x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 7 }));
      words.push(opNode("text", { class: "op-label", "data-tone": item.tone, x: cx, y: cy - 8, "text-anchor": "middle" }, item.title));
      if (item.sub) words.push(opNode("text", { class: "op-tick", x: cx, y: cy + 16, "text-anchor": "middle" }, item.sub));
      if (item.below) words.push(opNode("text", { class: "op-label", "data-tone": item.belowTone ?? "plus", x: cx, y: cy + h / 2 + 26, "text-anchor": "middle" }, item.below));
      if (k < n - 1) {
        const x1 = cx + w / 2 + 3, x2 = cx + slot - w / 2 - 5;
        shapes.push(opNode("line", { class: "op-arrow" + (item.dashedAfter ? " op-dashed" : ""), "data-tone": "guide", x1, y1: cy, x2: x2 - 6, y2: cy }));
        shapes.push(opNode("polygon", { class: "op-head", "data-tone": "guide", points: x2 + "," + cy + " " + (x2 - 8) + "," + (cy - 5) + " " + (x2 - 8) + "," + (cy + 5) }));
      }
    });
    if (chain.note) words.push(opNode("text", { class: "op-tick", x: (left + right) / 2, y: 270, "text-anchor": "middle" }, chain.note));
  }

  function opLabel(words, text, x, y, tone, anchor = "middle", extra = {}) {
    // Keep the whole label inside the 560-wide viewBox (about 8.5 px per character).
    const span = text.length * 8.5;
    const left = anchor === "start" ? x : anchor === "end" ? x - span : x - span / 2;
    if (left + span > 556) { x = 556; anchor = "end"; }
    else if (left < 4) { x = 4; anchor = "start"; }
    words.push(opNode("text", { class: "op-label", "data-tone": tone, x, y, "text-anchor": anchor, ...extra }, text));
  }

  function opDrawPlane(plane, box, shapes, words) {
    const size = Math.min(box.w - 20, 238), half = size / 2, cx = box.x + box.w / 2, cy = 166;
    const limit = plane.limit ?? 1, unit = (half - 10) / limit;
    const X = re => cx + re * unit, Y = im => cy - im * unit;
    shapes.push(opNode("rect", { class: "op-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
    const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
    let grid = "";
    for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
      if (k === 0) continue;
      const v = k * step;
      grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
    }
    shapes.push(opNode("path", { class: "op-grid", d: grid }));
    shapes.push(opNode("path", { class: "op-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
    if (size > 150) {
      words.push(opNode("text", { class: "op-tick", x: X(limit) - 2, y: cy + 14, "text-anchor": "end" }, plane.axes?.[0] ?? "Re"));
      words.push(opNode("text", { class: "op-tick", x: cx + 5, y: Y(limit) + 10, "text-anchor": "start" }, plane.axes?.[1] ?? "Im"));
    }
    words.push(opNode("text", { class: "op-caption", "data-tone": plane.tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
    const rings = [...(plane.circle ? [{ c: [0, 0], r: plane.circle, tone: "guide" }] : []), ...(plane.circles ?? [])];
    for (const ring of rings) {
      if (ring.r > 0) shapes.push(opNode("circle", { class: "op-ring", "data-tone": ring.tone ?? "guide", cx: X(ring.c[0]), cy: Y(ring.c[1]), r: ring.r * unit }));
    }
    for (const ray of plane.rays ?? []) {
      const end = opPolar(limit * 1.05, ray.angle);
      const start = ray.through ? opScale(end, -1) : [0, 0];
      shapes.push(opNode("line", { class: "op-ray" + (ray.solid ? " op-solid" : ""), "data-tone": ray.tone ?? "angle",
        x1: X(start[0]), y1: Y(start[1]), x2: X(end[0]), y2: Y(end[1]) }));
    }
    for (const mark of plane.marks ?? []) {
      // Inside the circle and just off the ray, so marks never sit on the axis labels.
      const [mx, my] = opPolar(limit * 0.6, mark.angle + 12);
      opLabel(words, mark.label, X(mx), Y(my) + 5, mark.tone, "middle");
    }
    for (const path of plane.paths ?? []) {
      shapes.push(opNode("polyline", { class: "op-curve" + (path.dashed ? " op-dashed" : ""), "data-tone": path.tone,
        points: path.pts.map(([re, im]) => X(re).toFixed(1) + "," + Y(im).toFixed(1)).join(" ") }));
    }
    for (const item of plane.items) {
      const from = item.from ?? [0, 0];
      const fx = X(from[0]), fy = Y(from[1]);
      const [re, im] = opAdd(from, item.z);
      const reach = Math.max(Math.abs(re), Math.abs(im));
      const clip = reach > limit ? limit / reach : 1;
      const ex = X(re * clip), ey = Y(im * clip);
      const length = Math.hypot(ex - fx, ey - fy);
      if (item.dot || length < 3) {
        shapes.push(opNode("circle", { class: "op-dot" + (item.hollow || length < 3 ? " op-hollow" : ""), "data-tone": item.tone, cx: ex, cy: ey, r: item.dot ? item.size ?? 4.5 : 5 }));
      } else {
        const ux = (ex - fx) / length, uy = (ey - fy) / length, depth = Math.min(13, length * 0.6), wing = depth * 0.42;
        const bx = ex - ux * depth, by = ey - uy * depth;
        shapes.push(opNode("line", { class: "op-arrow" + (item.dashed ? " op-dashed" : "") + (item.wide ? " op-wide" : ""), "data-tone": item.tone, x1: fx, y1: fy, x2: bx, y2: by }));
        shapes.push(opNode("polygon", { class: "op-head" + (item.dashed ? " op-hollow" : ""), "data-tone": item.tone,
          points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
      }
      if (item.label) {
        // Past the tip and a little to one side, so a label never hides an arrow along the same line.
        const ux = (ex - fx) / (length || 1), uy = (ey - fy) / (length || 1);
        const away = length < 3 ? [10, -10] : [ux * 12 + uy * 9, uy * 12 - ux * 9];
        const anchor = Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end";
        opLabel(words, item.label + (clip < 1 ? " (off scale)" : ""), ex + away[0], ey + away[1] + 4, item.tone, anchor);
      }
    }
  }

  function opDrawChart(chart, box, shapes, words) {
    const left = box.x + 46, right = box.x + box.w - 16, top = 40, bottom = 246;
    const [x0, x1] = chart.x, [y0, y1] = chart.y;
    const X = v => left + (v - x0) / (x1 - x0) * (right - left);
    const Y = v => bottom - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0) * (bottom - top);
    shapes.push(opNode("rect", { class: "op-frame", x: left, y: top, width: right - left, height: bottom - top }));
    let grid = "";
    for (const v of chart.xTicks) grid += "M" + X(v) + " " + top + "V" + bottom;
    for (const v of chart.yTicks) grid += "M" + left + " " + Y(v) + "H" + right;
    shapes.push(opNode("path", { class: "op-grid", d: grid }));
    const zeroY = y0 < 0 && y1 > 0 ? Y(0) : bottom;
    shapes.push(opNode("path", { class: "op-axis", d: "M" + left + " " + top + "V" + bottom + "M" + left + " " + zeroY + "H" + right }));
    const every = Math.max(1, Math.ceil(chart.xTicks.length * 34 / (right - left)));
    chart.xTicks.forEach((v, k) => {
      if (k % every === 0) words.push(opNode("text", { class: "op-tick", x: X(v), y: bottom + 16, "text-anchor": "middle" }, chart.xTickText?.[k] ?? opFmt(v)));
    });
    for (const v of chart.yTicks) words.push(opNode("text", { class: "op-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, opFmt(v)));
    words.push(opNode("text", { class: "op-tick", x: (left + right) / 2, y: bottom + 36, "text-anchor": "middle" }, chart.xLabel));
    words.push(opNode("text", { class: "op-caption", x: (left + right) / 2, y: top - 12, "text-anchor": "middle" }, chart.caption));
    for (const h of chart.hlines ?? []) {
      shapes.push(opNode("line", { class: "op-ray", "data-tone": h.tone ?? "angle", x1: left, y1: Y(h.y), x2: right, y2: Y(h.y) }));
      if (h.label) opLabel(words, h.label, right - 4, Y(h.y) - 6, h.tone ?? "angle", "end");
    }
    for (const v of chart.vlines ?? []) {
      shapes.push(opNode("line", { class: "op-ray op-solid", "data-tone": v.tone ?? "angle", x1: X(v.x), y1: top, x2: X(v.x), y2: bottom }));
    }
    for (const series of chart.series ?? []) {
      shapes.push(opNode("polyline", { class: "op-curve" + (series.dashed ? " op-dashed" : "") + (series.dotted ? " op-dotted" : ""), "data-tone": series.tone,
        points: series.pts.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join(" ") }));
      if (series.label) {
        const [lx, ly] = series.labelAt ?? series.pts.at(-1);
        opLabel(words, series.label, X(lx) + (series.labelDx ?? 6), Y(ly) + (series.labelDy ?? -6), series.tone, series.labelAnchor ?? "start");
      }
    }
    for (const dot of chart.dots ?? []) {
      shapes.push(opNode("circle", { class: "op-dot" + (dot.hollow ? " op-hollow" : ""), "data-tone": dot.tone, cx: X(dot.x), cy: Y(dot.y), r: dot.r ?? 5 }));
      if (dot.label) opLabel(words, dot.label, X(dot.x) + 8, Y(dot.y) - 8, dot.tone, "start");
    }
  }

  function opDrawBars(bars, box, shapes, words) {
    const left = box.x + 40, right = box.x + box.w - 10, top = 48, bottom = 246, max = bars.max ?? 1;
    const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
    let grid = "";
    for (const v of [0, max / 2, max]) {
      grid += "M" + left + " " + Y(v) + "H" + right;
      words.push(opNode("text", { class: "op-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, opFmt(v)));
    }
    shapes.push(opNode("path", { class: "op-grid", d: grid }));
    shapes.push(opNode("path", { class: "op-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
    words.push(opNode("text", { class: "op-caption", x: (left + right) / 2, y: top - 22, "text-anchor": "middle" }, bars.caption));
    const slot = (right - left) / bars.items.length;
    bars.items.forEach((bar, index) => {
      const x = left + slot * index + slot * 0.2, w = slot * 0.6, y = Y(bar.value);
      shapes.push(opNode("rect", { class: "op-bar" + (bar.outline ? " op-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: Math.max(0, bottom - y) }));
      if (bar.target !== undefined) {
        shapes.push(opNode("line", { class: "op-ray op-solid", "data-tone": "angle", x1: x - 4, y1: Y(bar.target), x2: x + w + 4, y2: Y(bar.target) }));
      }
      words.push(opNode("text", { class: "op-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 20, "text-anchor": "middle" }, bar.label));
      words.push(opNode("text", { class: "op-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top - 4, y - 8), "text-anchor": "middle" }, bar.text ?? opFmt(bar.value)));
    });
  }

  // ---------------------------------------------------------------------------
  // 3D views. World coordinates have z up. The view turns by yaw about z and
  // tilts by an elevation angle; the SVG fallback and Three.js share opFrame,
  // so SVG labels line up with the WebGL picture.
  // ---------------------------------------------------------------------------

  const OP_VIEW = { cx: 280, cy: 152 };
  const OP_BLOCH_R = 112;

  function opFrame(yaw, tilt) {
    const y = yaw * Math.PI / 180, t = tilt * Math.PI / 180;
    return {
      right: [-Math.sin(y), Math.cos(y), 0],
      up: [-Math.sin(t) * Math.cos(y), -Math.sin(t) * Math.sin(y), Math.cos(t)],
      toward: [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)]
    };
  }
  const opDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const opProject = (frame, point, scale) => ({
    x: OP_VIEW.cx + scale * opDot3(frame.right, point),
    y: OP_VIEW.cy - scale * opDot3(frame.up, point),
    depth: opDot3(frame.toward, point)
  });

  function opBlochPoint({ polar, azimuth }) {
    const t = polar * Math.PI / 180, p = azimuth * Math.PI / 180;
    return [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
  }

  function opDrawSphere(view, shapes, words) {
    const frame = opFrame(view.yaw, view.tilt);
    const P = point => opProject(frame, point, OP_BLOCH_R);
    shapes.push(opNode("circle", { class: "op-sphere", cx: OP_VIEW.cx, cy: OP_VIEW.cy, r: OP_BLOCH_R }));
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
      shapes.push(opNode("path", { class: "op-wire", d: front }));
      shapes.push(opNode("path", { class: "op-wire op-back", d: back }));
    }
    const axes = [[[0, 0, 1], "|0⟩"], [[0, 0, -1], "|1⟩"], [[1, 0, 0], "|+x⟩"], [[-1, 0, 0], "|−x⟩"], [[0, 1, 0], "|+y⟩"], [[0, -1, 0], "|−y⟩"]];
    for (const [direction, name] of axes) {
      const end = P(direction.map(n => n * 1.18)), start = P([0, 0, 0]);
      shapes.push(opNode("line", { class: "op-axis" + (end.depth < -0.05 ? " op-back" : ""), x1: start.x, y1: start.y, x2: end.x, y2: end.y }));
      const tag = P(direction.map(n => n * 1.34));
      words.push(opNode("text", { class: "op-tick" + (tag.depth < -0.05 ? " op-back" : ""), x: tag.x, y: tag.y + 4, "text-anchor": "middle" }, name));
    }
    if (view.axis) {
      // The observable's axis runs through the centre; its ends are the two eigenkets.
      const up = view.axis, a = P(up.map(n => n * 1.22)), b = P(up.map(n => -n * 1.22));
      shapes.push(opNode("line", { class: "op-arrow op-wide", "data-tone": "angle", x1: b.x, y1: b.y, x2: a.x, y2: a.y }));
      const ta = P(up.map(n => n * 1.05)), tb = P(up.map(n => -n * 1.05));
      words.push(opNode("text", { class: "op-label", "data-tone": "angle", x: ta.x - 12, y: ta.y + 20, "text-anchor": "end" }, view.ends?.[0] ?? "+1"));
      words.push(opNode("text", { class: "op-label", "data-tone": "minus", x: tb.x - 12, y: tb.y + 20, "text-anchor": "end" }, view.ends?.[1] ?? "−1"));
    }
    if (view.shown) {
      const q = P(view.shown), o = P([0, 0, 0]);
      shapes.push(opNode("line", { class: "op-arrow", "data-tone": "plus", x1: o.x, y1: o.y, x2: q.x, y2: q.y }));
    }
    const points = [...(view.points ?? [])];
    if (view.shown) points.push({ point: view.shown, tone: "plus", label: view.shownLabel ?? "|ψ⟩", size: 7 });
    points.sort((a, b) => P(a.point).depth - P(b.point).depth);
    for (const item of points) {
      const q = P(item.point);
      shapes.push(opNode("circle", { class: "op-dot" + (q.depth < -0.02 ? " op-back" : ""), "data-tone": item.tone, cx: q.x, cy: q.y, r: item.size ?? 4 }));
      if (item.label) {
        words.push(opNode("text", { class: "op-label" + (q.depth < -0.02 ? " op-back" : ""), "data-tone": item.tone, x: q.x + 11, y: q.y - 9, "text-anchor": "start" }, item.label));
      }
    }
  }

  // A matrix drawn as text between square brackets. Entries are strings.
  function opDrawMatrix(panel, box, shapes, words) {
    const rows = panel.rows, n = rows.length, m = rows[0].length;
    const longest = Math.max(...rows.flat().map(text => text.length), 1);
    const cell = Math.min((box.w - 40) / m, Math.max(44, longest * 9 + 16)), height = Math.min(52, 190 / n);
    const cx = box.x + box.w / 2, cy = 160, w = cell * m, h = height * n;
    const left = cx - w / 2, top = cy - h / 2;
    words.push(opNode("text", { class: "op-caption", "data-tone": panel.tone, x: cx, y: top - 22, "text-anchor": "middle" }, panel.caption));
    const bracket = (x, dir) => "M" + (x + dir * 9) + " " + (top - 6) + "H" + x + "V" + (top + h + 6) + "H" + (x + dir * 9);
    shapes.push(opNode("path", { class: "op-axis", d: bracket(left - 4, 1) + bracket(left + w + 4, -1) }));
    rows.forEach((row, i) => row.forEach((text, j) => {
      const tone = panel.tones?.[i]?.[j] ?? panel.tone ?? "ink";
      words.push(opNode("text", { class: "op-label", "data-tone": tone, x: left + cell * (j + 0.5), y: top + height * (i + 0.5) + 5, "text-anchor": "middle" }, text));
    }));
    if (panel.note) words.push(opNode("text", { class: "op-tick", x: cx, y: Math.min(286, top + h + 34), "text-anchor": "middle" }, panel.note));
  }

  // Number lines: one row per operator, each with labelled points; links join
  // matching points on neighbouring rows.
  function opDrawLine(panel, box, shapes, words) {
    const left = box.x + 70, right = box.x + box.w - 24, [x0, x1] = panel.x;
    const X = v => left + (Math.max(x0, Math.min(x1, v)) - x0) / (x1 - x0) * (right - left);
    const gap = 200 / Math.max(1, panel.rows.length), Y = k => 78 + gap * k;
    words.push(opNode("text", { class: "op-caption", x: (left + right) / 2, y: 36, "text-anchor": "middle" }, panel.caption));
    panel.rows.forEach((row, k) => {
      const y = Y(k);
      shapes.push(opNode("path", { class: "op-axis", d: "M" + left + " " + y + "H" + right }));
      let ticks = "";
      for (let v = Math.ceil(x0); v <= x1; v++) ticks += "M" + X(v) + " " + (y - 4) + "V" + (y + 4);
      shapes.push(opNode("path", { class: "op-grid", d: ticks }));
      for (let v = Math.ceil(x0); v <= x1; v += panel.every ?? 1) {
        words.push(opNode("text", { class: "op-tick", x: X(v), y: y + 20, "text-anchor": "middle" }, opFmt(v)));
      }
      words.push(opNode("text", { class: "op-label", "data-tone": row.tone ?? "ink", x: left - 12, y: y + 5, "text-anchor": "end" }, row.label));
      for (const point of row.points) {
        shapes.push(opNode("circle", { class: "op-dot", "data-tone": point.tone, cx: X(point.x), cy: y, r: point.r ?? 6 }));
        if (point.label) opLabel(words, point.label, X(point.x), y - 12 - (point.raise ?? 0), point.tone, "middle");
      }
    });
    for (const link of panel.links ?? []) {
      shapes.push(opNode("line", { class: "op-ray", "data-tone": link.tone ?? "guide", x1: X(link.from), y1: Y(link.rows[0]) + 7, x2: X(link.to), y2: Y(link.rows[1]) - 7 }));
    }
  }

  function opCreateGraphics(THREE, canvas, colors) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    const camera = new THREE.OrthographicCamera(-OP_VIEW.cx, 560 - OP_VIEW.cx, OP_VIEW.cy, OP_VIEW.cy - 300, 1, 2000);
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
          place(group, OP_BLOCH_R, opFrame(view.yaw, view.tilt));
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
            mesh.scale.setScalar((points[k].size ?? 4) / OP_BLOCH_R);
          });
          renderer.render(scene, camera);
        }
      };
    }

    return {
      draw(kind, view, width, height, low) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
        renderer.setSize(width, height, false);
        scenes[kind] ??= buildSphere();
        scenes[kind].draw(view);
      },
      invalidate() { /* Geometry lives on the GPU only while drawing; nothing to rebuild. */ },
      dispose() {
        for (const item of disposables) item.dispose();
        renderer.dispose();
      }
    };
  }


  if (lesson) initializeObservablesArcade(lesson);
} catch (error) {
  console.error("Observables Arcade could not start.", error);
}
