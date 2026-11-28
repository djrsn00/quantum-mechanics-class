const INV_SQRT_2 = 1 / Math.sqrt(2);
const BASIS = ["00", "01", "10", "11"];
const PRESETS = {
  zero: { ket: "|0⟩", amplitudes: [1, 0] },
  one: { ket: "|1⟩", amplitudes: [0, 1] },
  plus: { ket: "|+⟩", amplitudes: [INV_SQRT_2, INV_SQRT_2] },
  minus: { ket: "|−⟩", amplitudes: [INV_SQRT_2, -INV_SQRT_2] }
};
const BELL_AMPLITUDES = [INV_SQRT_2, 0, 0, INV_SQRT_2];
const OPENING = { mode: "product", a: "plus", b: "plus" };

const PREDICTION_FEEDBACK = {
  different: "Yes. Switch from the opening Product preparation to Bell. Both marginals stay at 50/50, while the mismatched pairs 01 and 10 drop to zero.",
  same: "Equal single-qubit probabilities tell you how often each bit appears on its own. Switch to Bell and look at 01 and 10 to see how often those bits appear together."
};
const QUIZ_FEEDBACK = {
  reversed: "A is prepared in |1⟩, so the first bit must be 1. Put B’s possible results in the second position. That gives 10 and 11, each with probability 50%.",
  negative: "The pairs are right. The amplitude of 11 is −1/√2, and the Born rule squares its magnitude. Both 10 and 11 have probability 50%.",
  correct: "Correct. A fixes the first bit at 1. B gives 10 and 11 amplitudes of +1/√2 and −1/√2, so each probability is 50%."
};

function calculateState({ mode, a, b }) {
  // The outer loop fixes A's bit. The inner loop pairs it with B = 0 and B = 1.
  const amplitudes = mode === "bell"
    ? BELL_AMPLITUDES
    : PRESETS[a].amplitudes.flatMap(first =>
        PRESETS[b].amplitudes.map(second => first * second)
      );
  const probabilities = amplitudes.map(amplitude => amplitude ** 2);
  const [p00, p01, p10, p11] = probabilities;

  return {
    amplitudes,
    probabilities,
    aMarginals: [p00 + p01, p10 + p11],
    bMarginals: [p00 + p10, p01 + p11],
    total: p00 + p01 + p10 + p11
  };
}

function formatAmplitude(value) {
  if (value === 0) return "0.000";

  const magnitude = Math.abs(value);
  const rounded = magnitude === INV_SQRT_2 ? "≈ " : "";
  const sign = value < 0 ? "−" : "+";
  return rounded + sign + magnitude.toFixed(3);
}

function formatExpansion(amplitudes) {
  // Product presets only produce nonzero magnitudes 1, 1/√2, and 1/2.
  const terms = amplitudes.flatMap((value, index) => {
    if (value === 0) return [];

    const magnitude = Math.abs(value);
    let coefficient = "½";
    if (magnitude === 1) coefficient = "";
    if (magnitude === INV_SQRT_2) coefficient = "(1/√2)";

    return [{ negative: value < 0, ket: coefficient + "|" + BASIS[index] + "⟩" }];
  });

  return "= " + terms.map(({ negative, ket }, index) => {
    if (index === 0) return (negative ? "−" : "") + ket;
    return (negative ? " − " : " + ") + ket;
  }).join("");
}

function formatProbability(probability) {
  return Math.round(probability * 100) + "%";
}

function initializeLesson(root) {
  const ids = [
    "controls", "factors", "input-a", "input-b", "reset", "bell-note",
    "product-ket", "bell-ket", "factor-a", "factor-b", "expansion",
    "a-zero", "a-one", "b-zero", "b-one", "total", "lab-status", "static-note",
    "prediction", "prediction-controls", "prediction-feedback",
    "quiz", "quiz-controls", "quiz-feedback", "quiz-retry"
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, root.querySelector("#cs-" + id)]));
  if (Object.values(nodes).some(node => !node)) return;

  const modeInputs = [...nodes.controls.querySelectorAll('input[type="radio"][name="cs-mode"]')];
  const predictionInputs = [...nodes.prediction.querySelectorAll('input[type="radio"][name="cs-prediction-answer"]')];
  const quizInputs = [...nodes.quiz.querySelectorAll('input[type="radio"][name="cs-quiz-answer"]')];
  const rows = BASIS.map(outcome => {
    const row = root.querySelector('.cs-joint-table [data-cs-outcome="' + outcome + '"]');
    return {
      row,
      amplitude: row?.querySelector(".cs-amplitude"),
      probability: row?.querySelector(".cs-probability"),
      bar: row?.querySelector(".cs-bar-fill")
    };
  });

  function hasValues(controls, values) {
    return controls.length === values.length
      && values.every(value => controls.some(control => control.value === value));
  }

  if (
    nodes.controls.tagName !== "FIELDSET" ||
    nodes.factors.tagName !== "FIELDSET" ||
    nodes.prediction.tagName !== "FORM" ||
    nodes.quiz.tagName !== "FORM" ||
    nodes["prediction-controls"].tagName !== "FIELDSET" ||
    nodes["quiz-controls"].tagName !== "FIELDSET" ||
    nodes["input-a"].tagName !== "SELECT" ||
    nodes["input-b"].tagName !== "SELECT" ||
    !hasValues([...nodes["input-a"].options], Object.keys(PRESETS)) ||
    !hasValues([...nodes["input-b"].options], Object.keys(PRESETS)) ||
    !hasValues(modeInputs, ["product", "bell"]) ||
    !hasValues(predictionInputs, Object.keys(PREDICTION_FEEDBACK)) ||
    !hasValues(quizInputs, Object.keys(QUIZ_FEEDBACK)) ||
    rows.some(({ row, amplitude, probability, bar }) => !row || !amplitude || !probability || !bar)
  ) return;

  const setup = { ...OPENING };

  function render() {
    const isBell = setup.mode === "bell";
    const result = calculateState(setup);

    for (const input of modeInputs) input.checked = input.value === setup.mode;

    nodes["input-a"].value = setup.a;
    nodes["input-b"].value = setup.b;
    nodes.factors.disabled = isBell;
    nodes.factors.hidden = isBell;
    nodes["bell-note"].hidden = !isBell;
    nodes["product-ket"].hidden = isBell;
    nodes["bell-ket"].hidden = !isBell;
    nodes["factor-a"].textContent = PRESETS[setup.a].ket;
    nodes["factor-b"].textContent = PRESETS[setup.b].ket;
    nodes.expansion.textContent = formatExpansion(result.amplitudes);

    rows.forEach(({ row, amplitude, probability }, index) => {
      const percentage = formatProbability(result.probabilities[index]);
      amplitude.textContent = formatAmplitude(result.amplitudes[index]);
      probability.textContent = percentage;
      row.style.setProperty("--cs-probability", percentage);
    });

    nodes["a-zero"].textContent = formatProbability(result.aMarginals[0]);
    nodes["a-one"].textContent = formatProbability(result.aMarginals[1]);
    nodes["b-zero"].textContent = formatProbability(result.bMarginals[0]);
    nodes["b-one"].textContent = formatProbability(result.bMarginals[1]);
    nodes.total.textContent = formatProbability(result.total);
  }

  function announce(message) {
    nodes["lab-status"].textContent = message;
  }

  for (const input of modeInputs) {
    input.addEventListener("change", () => {
      if (!input.checked || (input.value !== "product" && input.value !== "bell")) return;

      setup.mode = input.value;
      render();
      announce(setup.mode === "bell"
        ? "Bell preparation selected."
        : "Product preparation restored. A is " + PRESETS[setup.a].ket
          + " and B is " + PRESETS[setup.b].ket + ".");
    });
  }

  const factors = [
    { key: "a", label: "A", input: nodes["input-a"] },
    { key: "b", label: "B", input: nodes["input-b"] }
  ];

  for (const { key, label, input } of factors) {
    input.addEventListener("change", () => {
      if (setup.mode !== "product" || !Object.hasOwn(PRESETS, input.value)) {
        input.value = setup[key];
        return;
      }

      setup[key] = input.value;
      render();
      announce("Qubit " + label + " prepared in " + PRESETS[setup[key]].ket
        + ". Probabilities updated.");
    });
  }

  nodes.reset.addEventListener("click", () => {
    Object.assign(setup, OPENING);
    render();
    announce("Lab reset to Product preparation with A and B both in |+⟩.");
  });

  function bindQuestion(form, inputs, messages, feedback, retry) {
    form.addEventListener("change", () => {
      feedback.textContent = "";
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      const answer = inputs.find(input => input.checked)?.value;
      if (!Object.hasOwn(messages, answer)) {
        feedback.textContent = "Choose one answer first.";
        inputs[0].focus();
        return;
      }

      feedback.textContent = messages[answer];
      if (retry) retry.hidden = false;
    });

    if (retry) {
      retry.addEventListener("click", () => {
        form.reset();
        feedback.textContent = "";
        retry.hidden = true;
        inputs[0].focus();
      });
    }
  }

  bindQuestion(nodes.prediction, predictionInputs, PREDICTION_FEEDBACK, nodes["prediction-feedback"]);
  bindQuestion(nodes.quiz, quizInputs, QUIZ_FEEDBACK, nodes["quiz-feedback"], nodes["quiz-retry"]);

  nodes.prediction.reset();
  nodes.quiz.reset();
  render();
  nodes.controls.disabled = false;
  nodes["prediction-controls"].disabled = false;
  nodes["quiz-controls"].disabled = false;
  nodes["static-note"].hidden = true;
}

const lesson = document.querySelector(".site-main.composite-systems-lesson");
if (lesson) initializeLesson(lesson);

// ===========================================================================
// Composite Systems Arcade (optional practice). Everything below uses the ca-
// prefix so it never touches the Two-qubit preparation lab above, which uses
// cs-. The whole arcade runs inside one try block: if anything in it fails,
// the lab keeps working. A is always the first qubit and B the second, and a
// pair state is the ordered column (α00, α01, α10, α11).
// ===========================================================================

try {
  const CA_TOLERANCE = 0.002;  // typed answers, per real or imaginary part
  const CA_DERIVED = 0.005;    // probabilities of a state you build
  const CA_SVG = "http://www.w3.org/2000/svg";
  const CA_TURN = 2 * Math.PI;
  const CA_KETS = ["00", "01", "10", "11"];
  const caNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

  function caFmt(value) {
    if (!Number.isFinite(value)) return "undefined";
    return caNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
  }

  // A number written exactly where it is a simple fraction or square root:
  // 3/5, 1/√2, √3/2, √(2/3). Anything else is a rounded decimal.
  function caNum(value) {
    if (!Number.isFinite(value)) return "undefined";
    if (Math.abs(value) < 5e-10) return "0";
    const sign = value < 0 ? "−" : "", v = Math.abs(value);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    for (let q = 1; q <= 100; q++) {
      const p = Math.round(v * q);
      if (p > 0 && Math.abs(v - p / q) < 1e-9) {
        const g = gcd(p, q);
        return sign + (q / g === 1 ? String(p / g) : p / g + "/" + q / g);
      }
    }
    const v2 = v * v;
    // √n as [outside, inside], so √50 is 5√2.
    const root = n => { let out = 1, inside = n; for (let k = 2; k * k <= inside; k++) while (inside % (k * k) === 0) { inside /= k * k; out *= k; } return [out, inside]; };
    const part = ([out, inside]) => (inside === 1 ? String(out) : (out === 1 ? "" : out) + "√" + inside);
    for (let q = 1; q <= 100; q++) {
      const p = Math.round(v2 * q);
      if (p <= 0 || Math.abs(v2 - p / q) > 1e-9) continue;
      const g = gcd(p, q), [top, bottom] = [root(p / g), root(q / g)];
      if (top[1] === 1 && bottom[1] === 1) continue;
      if (top[1] > 1 && bottom[1] > 1) {
        // √(P/Q) = √(PQ)/Q, used when that leaves a small denominator: √6/4.
        const [o, inside] = root((p / g) * (q / g)), h = gcd(o, q / g), den = q / g / h;
        return sign + (den <= 4 ? (o / h === 1 ? "" : o / h) + "√" + inside + "/" + den : "√(" + p / g + "/" + q / g + ")");
      }
      const num = part(top), den = part(bottom);
      if (den === "1") return sign + num;
      return sign + num + "/" + (/√/.test(den) && bottom[0] > 1 ? "(" + den + ")" : den);
    }
    return sign + caFmt(v);
  }

  // An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
  const caTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
  const caFits = (value, answer) => Math.abs(value - answer) <= (caTerminates(answer) ? 1e-9 : CA_TOLERANCE + 1e-12);
  const caNear = (value, target, tolerance = CA_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
  const caRound = (v, step) => Math.round(v / step) * step;
  const caTidy = v => Number(v.toFixed(4));
  const caClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Parse numbers such as 2, −1.5, 3/5, √2, 1/√2, (1 + √3)/2, √(2/3), π/4 or 6.6e-3.
  // This is a small arithmetic reader (+ − × / √ π and brackets), never eval.
  function caParse(raw) {
    const text = String(raw).trim().toLowerCase()
      .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/sqrt/g, "√").replace(/pi/g, "π")
      .replace(/\s+/g, "");
    if (!text || text.length > 40) return null;
    let i = 0;
    const peek = () => text[i];
    function number() {
      const match = /^(\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?/.exec(text.slice(i));
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
      if (peek() === "π") { i++; return Math.PI; }
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
        } else if (ch === "(" || ch === "√" || ch === "π") {
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

  const caGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
  const caSetup = message => caGrade(false, message);

  function caLabelText(field) {
    const label = field.closest("label");
    if (!label) return field.getAttribute("aria-label") || "the selected input";
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input, select, output, .ca-sr-only").forEach(node => node.remove());
    const own = copy.textContent.replace(/\s+/g, " ").trim();
    const hidden = label.querySelector(".ca-sr-only")?.textContent.trim() ?? "";
    return (hidden + " " + own).trim() || field.getAttribute("aria-label") || "the selected input";
  }

  class CaFieldError extends Error {
    constructor(field, detail = "", custom = false) {
      super("Check " + caLabelText(field) + "." + (detail ? " " + detail : ""));
      this.field = field;
      this.detail = detail;
      this.custom = custom;
    }
  }

  function caSetText(element, text) {
    text = String(text ?? "");
    if (element && element.textContent !== text) element.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Complex numbers are [real, imaginary] pairs. A single-qubit ket is [a, b];
  // a pair ket is [α00, α01, α10, α11]; a matrix is a list of rows.
  // ---------------------------------------------------------------------------
  const caAdd = ([a, b], [c, d]) => [a + c, b + d];
  const caSub = ([a, b], [c, d]) => [a - c, b - d];
  const caMul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  const caDiv = (z, w) => { const n = caAbs2(w); return caScale(caMul(z, caConj(w)), 1 / n); };
  const caConj = ([a, b]) => [a, -b];
  const caScale = ([a, b], k) => [a * k, b * k];
  const caAbs2 = ([a, b]) => a * a + b * b;
  const caAbs = ([a, b]) => Math.hypot(a, b);
  const caArg = ([a, b]) => Math.atan2(b, a);
  const caCis = angle => [Math.cos(angle), Math.sin(angle)];
  const caZ = v => (typeof v === "number" ? [v, 0] : v);
  const caKet = list => list.map(caZ);
  const caInner = (u, v) => u.reduce((sum, z, k) => caAdd(sum, caMul(caConj(z), v[k])), [0, 0]);
  const caNorm2 = v => v.reduce((sum, z) => sum + caAbs2(z), 0);
  const caNormalize = v => { const n = Math.sqrt(caNorm2(v)); return v.map(z => caScale(z, 1 / n)); };
  const caApply = (A, v) => A.map(row => row.reduce((sum, z, k) => caAdd(sum, caMul(caZ(z), v[k])), [0, 0]));
  const caMatMul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((sum, z, k) => caAdd(sum, caMul(caZ(z), caZ(B[k][j]))), [0, 0])));

  // i times a size: i, 3i/5, i/√2, (√3/2)i.
  function caTimesI(text) {
    if (text === "1") return "i";
    if (/^1\//.test(text)) return "i" + text.slice(1);
    if (/^\d+\/\d+$/.test(text)) return text.replace("/", "i/");
    return /[/√]/.test(text) ? "(" + text + ")i" : text + "i";
  }
  function caCx(z) {
    const [a, b] = caZ(z);
    const re = Math.abs(a) < 5e-10 ? 0 : a, im = Math.abs(b) < 5e-10 ? 0 : b;
    if (im === 0) return caNum(re);
    const size = caTimesI(caNum(Math.abs(im)));
    if (re === 0) return (im < 0 ? "−" : "") + size;
    return caNum(re) + (im < 0 ? " − " : " + ") + size;
  }
  const caColText = v => "(" + v.map(caCx).join(", ") + ")";

  // ---------------------------------------------------------------------------
  // Pair states. |ij⟩ = |i⟩A ⊗ |j⟩B, in the ordered basis (|00⟩, |01⟩, |10⟩, |11⟩).
  // ---------------------------------------------------------------------------
  const caTensor = ([a, b], [c, d]) => [caMul(a, c), caMul(a, d), caMul(b, c), caMul(b, d)];
  // The product test: zero exactly for product states.
  const caD = ([p, q, r, s]) => caSub(caMul(p, s), caMul(q, r));
  const caProbs = psi => psi.map(caAbs2);
  function caTable(psi) {
    const n = caNorm2(psi) || 1, [p00, p01, p10, p11] = caProbs(psi).map(p => p / n);
    return { p: [p00, p01, p10, p11], a: [p00 + p01, p10 + p11], b: [p00 + p10, p01 + p11], match: p00 + p11, norm: n };
  }
  // Swap which qubit is A and which is B: |01⟩ and |10⟩ trade places.
  const caSwap = ([p, q, r, s]) => [p, r, q, s];
  // The ket written out, such as (1/2)|00⟩ + (i/2)|01⟩.
  function caKetText(psi, names = CA_KETS) {
    const terms = [];
    psi.forEach((z, k) => {
      if (caAbs(z) < 5e-10) return;
      const [re, im] = z;
      let coeff;
      if (Math.abs(re) > 5e-10 && Math.abs(im) > 5e-10) coeff = "(" + caCx(z) + ")";
      else {
        coeff = caCx(z);
        const negative = coeff.startsWith("−"), body = negative ? coeff.slice(1) : coeff;
        coeff = (negative ? "−" : "") + (body === "1" ? "" : /[/√ ]/.test(body) && !body.startsWith("(") ? "(" + body + ")" : body);
      }
      terms.push(coeff + "|" + names[k] + "⟩");
    });
    if (!terms.length) return "0";
    return terms.map((t, k) => (k === 0 ? t : t.startsWith("−") ? " − " + t.slice(1) : " + " + t)).join("");
  }
  // Is typed equal to exact up to one overall phase? Each part within tolerance.
  function caPhaseOf(typed, exact) {
    const k = exact.reduce((best, z, j) => (caAbs(z) > caAbs(exact[best]) ? j : best), 0);
    const ratio = caDiv(typed[k], exact[k]), r = caAbs(ratio);
    return r > 1e-9 ? caScale(ratio, 1 / r) : [1, 0];
  }
  function caSameUpToPhase(typed, exact, tolerance = CA_TOLERANCE) {
    const phase = caPhaseOf(typed, exact);
    return typed.every((z, j) => {
      const want = caMul(phase, exact[j]);
      return Math.abs(z[0] - want[0]) <= tolerance + 1e-9 && Math.abs(z[1] - want[1]) <= tolerance + 1e-9;
    });
  }
  // Each part exact, or within tolerance when it doesn't end as a decimal.
  const caCxFits = (z, w) => caFits(z[0], w[0]) && caFits(z[1], w[1]);
  const caKetMisses = (typed, exact, names = CA_KETS) => names.filter((_, k) => !caCxFits(typed[k], exact[k])).map(n => "|" + n + "⟩");
  const caMissText = misses => misses.length === 1 ? "The " + misses[0] + " entry is" : "The " + misses.join(", ") + " entries are";
  const caPct = p => caFmt(caRound(100 * p, 0.01)) + "%";

  // A seedable random source (mulberry32), so a reset with the same seed repeats a run.
  function caRng(seed) {
    let a = (Math.floor(Math.abs(seed)) >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Plot builders used by the station show() functions. A plan holds panels laid
  // out side by side across a 560 × 300 viewBox.
  // ---------------------------------------------------------------------------
  const caArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
  const caPlane = (caption, items, extra = {}) => ({ kind: "plane", caption, items, limit: 1, circle: 1, axes: ["Re", "Im"], ...extra });
  const caBars = (caption, items, extra = {}) => ({ kind: "bars", caption, items, ...extra });
  const caChart = (caption, extra) => ({ kind: "chart", caption, x: [0, 1], y: [0, 1], xTicks: [0, 1], yTicks: [0, 0.5, 1], xLabel: "", ...extra });
  const caSweep = (f, x0, x1, n = 160) => Array.from({ length: n + 1 }, (_, k) => {
    const x = x0 + (x1 - x0) * k / n;
    return [x, f(x)];
  });
  const caMatrixPanel = (caption, rows, extra = {}) => ({
    kind: "matrix", caption, rows: rows.map(row => row.map(z => (typeof z === "string" ? z : caCx(z)))), ...extra
  });
  const caChain = (caption, items, extra = {}) => ({ kind: "chain", caption, items, ...extra });
  // A 2×2 grid with A's bit down the side and B's bit across the top. Each cell
  // holds a line of text, an optional fill (0–1) and an optional phasor arrow.
  const caGrid = (caption, cells, extra = {}) => ({ kind: "grid", caption, cells, rows: ["A = 0", "A = 1"], cols: ["B = 0", "B = 1"], ...extra });
  // Two lists joined by lines: item i on the left goes to item j on the right.
  const caMap = (caption, left, right, links, extra = {}) => ({ kind: "map", caption, left, right, links, ...extra });
  // Two wires, A on top and B below, with gates in order.
  const caCircuit = (caption, gates, extra = {}) => ({ kind: "circuit", caption, gates, ...extra });
  // Grid cells for a pair ket: text is the amplitude, fill its probability, arrow its phase.
  const caKetCells = (psi, shown = true, tones = ["warn", "angle", "plus", "minus"]) => {
    const n = caNorm2(psi) || 1;
    return psi.map((z, k) => ({ tag: "|" + CA_KETS[k] + "⟩", text: shown ? caCx(z) : "?", fill: shown ? caAbs2(z) / n : 0, z: shown ? caScale(z, 1 / Math.sqrt(n)) : null, tone: tones[k] }));
  };

  // ---------------------------------------------------------------------------
  // Stations 1–5 · Building pair states, and joint and marginal probabilities.
  // ---------------------------------------------------------------------------
  const CA_H = Math.SQRT1_2;
  const caExact = text => caParse(text);
  const caCard = pairs => pairs.map(([re, im]) => [caExact(re), caExact(im)]);
  const CA_TONES = ["warn", "angle", "plus", "minus"];

  // A typed column graded entry by entry. A column in B-first order gets its own message.
  function caColumnGrader(prefix, exact, work, names = CA_KETS) {
    return c => {
      const typed = c.ket(prefix);
      const misses = caKetMisses(typed, exact, names);
      if (!misses.length) return caGrade(true, "", work);
      if (!caKetMisses(typed, caSwap(exact)).length) return caGrade(false, "That column has B’s bit first. Keep A first: the |01⟩ entry is A = 0, B = 1.");
      return caGrade(false, caMissText(misses) + " not right yet.");
    };
  }

  // 1 · Tensor Expander. Cards hold exact text for a, b, c, d.
  const CA_EXPAND = {
    a: [["3/5", "0"], ["4/5", "0"], ["1/√2", "0"], ["0", "1/√2"]],
    b: [["1/2", "1/2"], ["1/√2", "0"], ["√3/2", "0"], ["-1/2", "0"]],
    c: [["1/√3", "0"], ["√(2/3)", "0"], ["3/5", "0"], ["0", "-4/5"]],
    d: [["0", "3/5"], ["0", "4/5"], ["1/√2", "0"], ["0", "1/√2"]]
  };
  const caExpandExact = key => { const [a, b, c, d] = caCard(CA_EXPAND[key]); return caTensor([a, b], [c, d]); };
  function caFactorModel(c) {
    const z = ["a", "b", "c", "d"].map(name => c.quietCx(name));
    if (z.some(v => v === null)) return { ok: false };
    const [a, b, cc, d] = z;
    return { ok: true, a, b, c: cc, d, psi: caTensor([a, b], [cc, d]), nA: caAbs2(a) + caAbs2(b), nB: caAbs2(cc) + caAbs2(d) };
  }
  function caLoadFactors(c, card) {
    ["a", "b", "c", "d"].forEach((name, k) => c.setCx(name, card[k][0], card[k][1]));
  }

  // 2 · Order Matters.
  const CA_ORDER = {
    s1: caKet([0, 0, 3 / 5, 4 / 5]),
    s2: caKet([1 / 2, [0, 1 / 2], CA_H, 0]),
    s3: caKet([Math.sqrt(0.1), Math.sqrt(0.2), Math.sqrt(0.3), Math.sqrt(0.4)])
  };

  // 3 · Factor Finder.
  const CA_TARGETS = {
    t1: caKet([Math.sqrt(3) / 4, 1 / 4, 3 / 4, Math.sqrt(3) / 4]),
    t2: caKet([1 / Math.sqrt(6), [0, 1 / Math.sqrt(6)], 1 / Math.sqrt(3), [0, 1 / Math.sqrt(3)]]),
    t3: caKet([0, 0, 3 / 5, [0, 4 / 5]]),
    t4: caKet([1 / Math.sqrt(3), 1 / Math.sqrt(3), 0, 1 / Math.sqrt(3)])
  };
  const CA_FACTOR_MISSION = { a: "t1", b: "t2", c: "t3", d: "t4" };
  const CA_FACTOR_WORK = {
    t1: "The rows (√3/4, 1/4) and (3/4, √3/4) are proportional: the second is √3 times the first. So take (c, d) = (√3/2, 1/2), a = 1/2 and b = √3/2. Check: ac = √3/4, ad = 1/4, bc = 3/4, bd = √3/4. Any a, b scaled by k with c, d scaled by 1/k works as well.",
    t2: "The A = 0 row is (1/√6, i/√6) = (1/√3)(1/√2, i/√2), and the A = 1 row is √2 times it. So a = 1/√3, b = √(2/3) and (c, d) = (1/√2, i/√2). B is in (|0⟩ + i|1⟩)/√2.",
    t3: "The A = 0 row is zero, so a = 0, and the A = 1 row gives B’s factor directly: b = 1, c = 3/5, d = 4i/5. The state is |1⟩A ⊗ ((3/5)|0⟩ + (4i/5)|1⟩)B.",
    t4: "D = α00α11 − α01α10 = (1/√3)(1/√3) − (1/√3)(0) = 1/3 ≠ 0. The rows (1/√3, 1/√3) and (0, 1/√3) aren’t proportional, so no factors exist: the state is entangled."
  };
  const CA_FACTOR_TOL = 0.004;

  // 4 · Product or Entangled?
  const CA_TEST = {
    phip: caKet([CA_H, 0, 0, CA_H]), phim: caKet([CA_H, 0, 0, -CA_H]),
    psip: caKet([0, CA_H, CA_H, 0]), psim: caKet([0, CA_H, -CA_H, 0]),
    dis: caKet([0.5, -0.5, 0.5, -0.5]), sign: caKet([0.5, 0.5, 0.5, -0.5]),
    cplx: caKet([0.5, [0, 0.5], [0, 0.5], -0.5])
  };
  function caTestGrader(prefix, card, verdict, work) {
    return c => {
      const D = caD(CA_TEST[card]), typed = c.cx(prefix + "-d");
      if (!caCxFits(typed, D)) return caGrade(false, "Check D. Multiply the diagonal α00α11, then subtract α01α10, keeping every sign" + (card === "cplx" ? " and using i × i = −1." : "."));
      return caGrade(c.choice(prefix + "-pick") === verdict, "D is right. Now classify: D = 0 exactly for product states.", work);
    };
  }

  // 5 · Joint and Marginal Ledger.
  const CA_LEDGER = {
    l1: caKet([1, 2, 2, 1].map(v => v / Math.sqrt(10))),
    l2: caKet([0.5, [0, 0.5], 0, [0.5, 0.5]]),
    l3: caKet([1, [0, 1], 2, [0, -2]])
  };
  const caLedgerOf = psi => { const t = caTable(psi); return { p: t.p, a: t.a, b: t.b }; };
  function caLedgerGrader(prefix, table, work) {
    return c => {
      const joint = ["00", "01", "10", "11"].map(k => c.ans(prefix + "-p" + k));
      const miss = ["00", "01", "10", "11"].filter((k, j) => !caFits(joint[j], table.p[j]));
      if (miss.length) {
        if (joint.some(v => v < 0)) return caGrade(false, "A probability can’t be negative. P(ij) = |αij|², the squared magnitude.");
        return caGrade(false, (miss.length === 1 ? "P(" + miss[0] + ") is" : miss.length + " joint cells are") + " not right yet." + (prefix === "c" ? " Normalize first: divide each |αij|² by the sum of all four." : ""));
      }
      const margins = [c.ans(prefix + "-a0"), c.ans(prefix + "-a1"), c.ans(prefix + "-b0"), c.ans(prefix + "-b1")];
      const want = [...table.a, ...table.b];
      const names = ["P(A = 0)", "P(A = 1)", "P(B = 0)", "P(B = 1)"];
      const wrong = names.filter((_, j) => !caFits(margins[j], want[j]));
      return caGrade(!wrong.length, wrong.join(" and ") + (wrong.length === 1 ? " is" : " are") + " not right yet. A row adds to P(A = i); a column adds to P(B = j).", work);
    };
  }
  const CA_LEDGER_D = { p: [0.3, 0.4, 0.1, 0.2], a: [0.7, 0.3], b: [0.4, 0.6] };

  const caStations1 = {
    // 1 · Tensor Expander -------------------------------------------------------------------------------
    expand: {
      load(c, check) { if (CA_EXPAND[check]) caLoadFactors(c, CA_EXPAND[check]); },
      show(c) {
        const m = caFactorModel(c);
        if (!m.ok) {
          c.put("state", "Fill each real and imaginary box with a number such as 3/5, 1/√2 or 0.");
          return { panels: [], caption: "incomplete factors", desc: "A factor box is empty or unreadable." };
        }
        const show = c.checked("show");
        const names = ["ac", "ad", "bc", "bd"];
        const cells = m.psi.map((z, k) => ({ tag: "|" + CA_KETS[k] + "⟩", text: show ? caCx(z) : names[k], fill: show ? caAbs2(z) : 0, z: show ? z : null, tone: CA_TONES[k] }));
        const norm = Math.abs(m.nA - 1) < 1e-6 && Math.abs(m.nB - 1) < 1e-6;
        c.put("state", "|a|² + |b|² = " + caNum(m.nA) + " and |c|² + |d|² = " + caNum(m.nB) + (norm ? ", so both factors are normalized." : ". Every card uses normalized factors.")
          + (show ? " Column (ac, ad, bc, bd) = " + caColText(m.psi) + "." : " Tick the box to see the products."));
        return {
          panels: [
            caGrid("A down the side, B across the top", cells, { rows: ["a = " + caCx(m.a), "b = " + caCx(m.b)], cols: ["c = " + caCx(m.c), "d = " + caCx(m.d)], weight: 1.35 }),
            caMatrixPanel("ordered column", m.psi.map((z, k) => [show ? caCx(z) : names[k]]), { weight: 0.65, note: "(α00, α01, α10, α11)" })
          ],
          caption: show ? "products shown" : "products hidden",
          desc: "A multiplication grid. Rows are A’s amplitudes a = " + caCx(m.a) + " and b = " + caCx(m.b) + "; columns are B’s amplitudes c = " + caCx(m.c) + " and d = " + caCx(m.d)
            + ". " + (show ? "Cells: " + m.psi.map((z, k) => "|" + CA_KETS[k] + "⟩ " + caCx(z)).join(", ") + "." : "The cells read ac, ad, bc, bd until you show the products.")
        };
      },
      checks: {
        a: ["The |01⟩ entry pairs A’s |0⟩ amplitude a with B’s |1⟩ amplitude d.", "ad = (3/5)(i/√2) = 3i/(5√2) ≈ 0.4243i, so its real part is 0.",
          caColumnGrader("a-col", caExpandExact("a"), "ac = (3/5)(1/√2) = 3/(5√2) ≈ 0.4243, ad = 3i/(5√2) ≈ 0.4243i, bc = 4/(5√2) ≈ 0.5657 and bd = 4i/(5√2) ≈ 0.5657i. The probabilities are 9/50, 9/50, 16/50 and 16/50, which add to 1.")],
        b: ["Multiply complex numbers term by term: ((1 + i)/2)(√3/2) = (√3 + √3 i)/4.", "bd = (1/√2)(−1/2) = −1/(2√2) ≈ −0.3536.",
          caColumnGrader("b-col", caExpandExact("b"), "ac = (1 + i)√3/4 ≈ 0.4330 + 0.4330i, ad = −(1 + i)/4 = −0.25 − 0.25i, bc = √3/(2√2) = √6/4 ≈ 0.6124 and bd = −1/(2√2) ≈ −0.3536. |a|² = 1/2 and |c|² = 3/4, so P(00) = 3/8.")],
        c: ["P(01) = |ad|² = |a|²|d|²: magnitudes multiply.", "|a|² = 1/3 and |d|² = 16/25. For the sum, factor: (|a|² + |b|²)(|c|² + |d|²).", c => {
          if (!caFits(c.ans("c-p"), 16 / 75)) return caGrade(false, "Check P(01). It is |a|² times |d|², and |−4i/5|² = 16/25.");
          return caGrade(caFits(c.ans("c-sum"), 1), "P(01) is right. Now add all four: the sum factors into (|a|² + |b|²)(|c|² + |d|²).",
            "P(01) = |a|²|d|² = (1/3)(16/25) = 16/75 ≈ 0.2133. The four probabilities add to (|a|² + |b|²)(|c|² + |d|²) = 1 × 1 = 1: a product of normalized factors is normalized.");
        }],
        d: ["α10 = bc, with the new b = 4i/5.", "Every amplitude contains exactly one of a or b.", c => {
          const want = caMul([0, 1], caExpandExact("a")[2]);
          if (!caCxFits(c.cx("d-a10"), want)) return caGrade(false, "Check the new α10 = bc = (4i/5)(1/√2).");
          return caGrade(c.choice("d-pick") === "global", "α10 is right. Look at what happens to the other three entries too.",
            "The new α10 = (4i/5)(1/√2) = 4i/(5√2) ≈ 0.5657i. Every entry of the column contains one factor from A, so all four gain the same factor i. That is a global phase: |i|² = 1 leaves every probability unchanged, and the physical state is the same.");
        }]
      }
    },

    // 2 · Order Matters -----------------------------------------------------------------------------------
    order: {
      load(c, check) {
        const pick = { a: "s1", c: "s2", d: "s3" }[check];
        if (pick) c.field("state").value = pick;
      },
      show(c) {
        const psi = CA_ORDER[c.val("state")], swap = c.checked("swap");
        const left = psi.map((z, k) => ({ text: "|" + CA_KETS[k] + "⟩  " + caCx(z), tone: CA_TONES[k] }));
        const right = CA_KETS.map((k, j) => ({ text: swap ? "|" + k + "⟩ ← old |" + CA_KETS[[0, 2, 1, 3][j]] + "⟩" : "|" + k + "⟩", tone: CA_TONES[swap ? [0, 2, 1, 3][j] : j] }));
        const links = swap ? [[0, 0, "warn"], [1, 2, "angle"], [2, 1, "plus"], [3, 3, "minus"]] : [[0, 0, "warn"], [1, 1, "angle"], [2, 2, "plus"], [3, 3, "minus"]];
        const t = caTable(psi);
        c.put("state", "Column with the original labels: " + caColText(psi) + ". P(A = 0) = " + caNum(t.a[0]) + ", P(B = 0) = " + caNum(t.b[0]) + "."
          + (swap ? " Labels swapped: the old |01⟩ amplitude moves to |10⟩ and the old |10⟩ amplitude to |01⟩; |00⟩ and |11⟩ stay put." : " Tick Swap to rename the qubits."));
        return {
          panels: [caMap(swap ? "renaming A ↔ B" : "original labels", left, right, links, { heads: ["A first, B second", swap ? "after the swap" : "unchanged"], note: swap ? "|01⟩ and |10⟩ trade places" : "" })],
          caption: swap ? "labels swapped" : "original labels",
          desc: "Left: the four kets and their amplitudes " + caColText(psi) + ". Right: " + (swap ? "after swapping the labels, |00⟩ and |11⟩ keep their amplitudes, while |01⟩ and |10⟩ trade." : "the same kets, unchanged.")
        };
      },
      checks: {
        a: ["Only the kets with unequal bits move: |01⟩ ↔ |10⟩.", "The amplitude 3/5 was on |10⟩. After the swap it sits on |01⟩.", c => {
          const exact = caSwap(CA_ORDER.s1), typed = c.ket("a-col");
          if (!caKetMisses(typed, CA_ORDER.s1).length) return caGrade(false, "That is the column before the swap.");
          const misses = caKetMisses(typed, exact);
          return caGrade(!misses.length, caMissText(misses) + " not right yet.", "Before: (0, 0, 3/5, 4/5), from |1⟩ ⊗ ((3/5)|0⟩ + (4/5)|1⟩). After the swap the first qubit is the old B: ((3/5)|0⟩ + (4/5)|1⟩) ⊗ |1⟩ = (3/5)|01⟩ + (4/5)|11⟩, so the column is (0, 3/5, 0, 4/5).");
        }],
        b: ["Which kets have their name changed by swapping the two bits?", "|00⟩ and |11⟩ read the same both ways.", c =>
          caGrade(c.choice("b-pick") === "swap", "Write a ket |ij⟩ with the labels swapped: it becomes |ji⟩. Which positions does that move?",
            "|ij⟩ becomes |ji⟩, so αij moves to position ji: the new column is (α00, α10, α01, α11). Nothing is conjugated and |00⟩, |11⟩ stay where they are.")],
        c: ["The 1/√2 on |10⟩ moves to |01⟩.", "The i/2 on |01⟩ moves to |10⟩.",
          caColumnGrader("c-col", caSwap(CA_ORDER.s2), "Before: (1/2, i/2, 1/√2, 0). After the swap: (1/2, 1/√2, i/2, 0). |00⟩ keeps 1/2 and |11⟩ keeps 0.")],
        d: ["The new A is the old B, so the new P(A = 0) is the old P(B = 0).", "The new |10⟩ is the old |01⟩.", c => {
          if (!caFits(c.ans("d-a0"), 0.4)) return caGrade(false, "Check P(A = 0). After the swap A is the old B, and the old P(B = 0) = P(00) + P(10).");
          return caGrade(caFits(c.ans("d-p10"), 0.2), "P(A = 0) is right. The new |10⟩ is the old |01⟩.",
            "Old: P(00) = 0.1, P(01) = 0.2, P(10) = 0.3, P(11) = 0.4, so P(A = 0) = 0.3 and P(B = 0) = 0.4. After the swap the column is (√0.1, √0.3, √0.2, √0.4), so P(A = 0) = 0.1 + 0.3 = 0.4 and P(10) = 0.2.");
        }]
      }
    },

    // 3 · Factor Finder -----------------------------------------------------------------------------------
    factor: {
      load(c, check) {
        if (!CA_FACTOR_MISSION[check]) return;
        c.field("target").value = CA_FACTOR_MISSION[check];
        caLoadFactors(c, [["1", "0"], ["0", "0"], ["1", "0"], ["0", "0"]]);
        c.field("none").checked = false;
      },
      show(c) {
        const target = CA_TARGETS[c.val("target")], m = caFactorModel(c);
        const tCells = caKetCells(target);
        if (!m.ok) {
          c.put("state", "Target: " + caKetText(target) + ". Fill every factor box with a number.");
          return { panels: [caGrid("target", tCells)], caption: "target", desc: "The target grid: " + caColText(target) + "." };
        }
        const close = m.psi.map((z, k) => Math.abs(z[0] - target[k][0]) <= CA_FACTOR_TOL && Math.abs(z[1] - target[k][1]) <= CA_FACTOR_TOL);
        const yours = m.psi.map((z, k) => ({ tag: "|" + CA_KETS[k] + "⟩", text: caCx(z), fill: caAbs2(z), z, tone: close[k] ? CA_TONES[k] : "guide", sub: close[k] ? "" : "differs" }));
        const matched = close.filter(Boolean).length;
        c.put("state", "Target: " + caKetText(target) + ". Your product (ac, ad, bc, bd) = " + caColText(m.psi) + ". " + matched + " of 4 entries match the target." + (c.checked("none") ? " You have ticked “No factors exist”." : ""));
        return {
          panels: [caGrid("target", tCells), caGrid("your a, b ⊗ c, d", yours)],
          caption: matched === 4 ? "product matches" : matched + " of 4 match",
          desc: "Left: the target grid " + caColText(target) + ". Right: the product of your factors, " + caColText(m.psi) + ", with " + matched + " of 4 entries matching."
        };
      },
      checks: Object.fromEntries(Object.entries(CA_FACTOR_MISSION).map(([check, key]) => [check, [
        { t1: "Is the A = 1 row a multiple of the A = 0 row? By what factor?", t2: "Factor 1/√3 out of the A = 0 row.", t3: "A whole row is zero. What does that say about a?", t4: "Compare the two rows of the grid. Are they proportional?" }[key],
        { t1: "Take (c, d) = (√3/2, 1/2); then a and b are what scale it into each row.", t2: "B’s factor is (1/√2, i/√2).", t3: "Take a = 0 and b = 1; then (c, d) is the A = 1 row.", t4: "Compute α00α11 − α01α10." }[key],
        c => {
          const target = CA_TARGETS[key], D = caD(target), none = c.checked("none");
          if (none) return caAbs(D) > 1e-6 ? caGrade(true, "", CA_FACTOR_WORK[key]) : caGrade(false, "This target does have factors. Untick the box and look for rows that are multiples of each other.");
          if (caAbs(D) > 1e-6) return caGrade(false, "No a, b, c, d make this product. Try to explain why, then tick “No factors exist”.");
          const m = caFactorModel(c);
          if (!m.ok) return caGrade(false, "Fill every factor box with a number.");
          const good = m.psi.every((z, k) => Math.abs(z[0] - target[k][0]) <= CA_FACTOR_TOL + 1e-12 && Math.abs(z[1] - target[k][1]) <= CA_FACTOR_TOL + 1e-12);
          return caGrade(good, "Your product (ac, ad, bc, bd) doesn’t match the target yet. The diagram marks the entries that differ.", CA_FACTOR_WORK[key], "Mission complete. The checker multiplied your factors.");
        }]]))
    },

    // 4 · Product or Entangled? ------------------------------------------------------------------------------
    test: {
      load(c, check) {
        const card = { a: "phip", b: "dis", c: "sign", d: "cplx" }[check];
        if (card) c.field("card").value = card;
      },
      show(c) {
        const psi = CA_TEST[c.val("card")], D = caD(psi), show = c.checked("show");
        const ad = caMul(psi[0], psi[3]), bc = caMul(psi[1], psi[2]);
        c.put("state", "State: " + caKetText(psi) + ". " + (show
          ? "α00α11 = " + caCx(ad) + ", α01α10 = " + caCx(bc) + ", so D = " + caCx(D) + (caAbs(D) < 1e-9 ? ": a product state." : ": entangled.")
          : "Tick the box to see D, or compute it first."));
        return {
          panels: [caGrid("solid: α00α11 · dashed: α01α10", caKetCells(psi), { cross: true, note: show ? "D = " + caCx(D) : "D = α00α11 − α01α10 = ?" })],
          caption: show ? "D = " + caCx(D) : "D hidden",
          desc: "The amplitude grid for " + caKetText(psi) + ", with a solid line along the α00, α11 diagonal and a dashed line along the α01, α10 diagonal." + (show ? " D = " + caCx(D) + "." : "")
        };
      },
      checks: {
        a: ["For |Φ±⟩ the off-diagonal amplitudes are zero, so D = α00α11.", "For |Ψ±⟩ the diagonal is zero, so D = −α01α10.", c => {
          const want = { phip: 0.5, phim: -0.5, psip: -0.5, psim: 0.5 };
          for (const [key, value] of Object.entries(want)) if (!caFits(c.ans("a-" + key), value)) return caGrade(false, "Check D for " + { phip: "|Φ⁺⟩", phim: "|Φ⁻⟩", psip: "|Ψ⁺⟩", psim: "|Ψ⁻⟩" }[key] + ". Watch the sign: D subtracts α01α10.");
          return caGrade(c.choice("a-pick") === "all", "The four values of D are right. What does a nonzero D say?",
            "|Φ⁺⟩: D = (1/√2)(1/√2) − 0 = 1/2. |Φ⁻⟩: D = −1/2. |Ψ⁺⟩: D = 0 − (1/√2)(1/√2) = −1/2. |Ψ⁻⟩: D = +1/2. All four are nonzero, so all four Bell states are entangled; each has the largest possible |D| = 1/2. Equal 50/50 marginals don’t make a state a product.");
        }],
        b: ["α00α11 = (1/2)(−1/2) and α01α10 = (−1/2)(1/2).", "The two products are equal.",
          caTestGrader("b", "dis", "product", "D = (1/2)(−1/2) − (−1/2)(1/2) = −1/4 + 1/4 = 0, so it is a product. Its factors: the rows (1/2, −1/2) and (1/2, −1/2) are equal, so it is (|0⟩ + |1⟩)/√2 ⊗ (|0⟩ − |1⟩)/√2 = |+⟩A ⊗ |−⟩B.")],
        c: ["α00α11 = (1/2)(−1/2) = −1/4.", "α01α10 = (1/2)(1/2) = 1/4.",
          caTestGrader("c", "sign", "entangled", "D = −1/4 − 1/4 = −1/2 ≠ 0, so the state is entangled, with the same |D| as a Bell state. Its probabilities are all 1/4, exactly like |+⟩|+⟩: in the computational basis the sign shows up in no single probability.")],
        d: ["α00α11 = (1/2)(−1/2) = −1/4.", "α01α10 = (i/2)(i/2) = i²/4 = −1/4.",
          caTestGrader("d", "cplx", "product", "D = −1/4 − (−1/4) = 0, so it is a product: the A = 1 row (i/2, −1/2) is i times the A = 0 row (1/2, i/2). The state is ((|0⟩ + i|1⟩)/√2)A ⊗ ((|0⟩ + i|1⟩)/√2)B.")]
      }
    },

    // 5 · Joint and Marginal Ledger --------------------------------------------------------------------------
    ledger: {
      load(c, check) {
        const card = { a: "l1", b: "l2", c: "l3" }[check];
        if (card) c.field("card").value = card;
      },
      show(c) {
        const psi = CA_LEDGER[c.val("card")], t = caTable(psi), show = c.checked("show");
        const cells = psi.map((z, k) => ({ tag: "|" + CA_KETS[k] + "⟩", text: show ? caNum(t.p[k]) : "?", fill: show ? t.p[k] : 0, tone: CA_TONES[k] }));
        c.put("state", "Amplitudes: " + caKetText(psi) + ". Sum of |αij|² = " + caNum(t.norm) + "." + (show
          ? " P(00) = " + caNum(t.p[0]) + ", P(01) = " + caNum(t.p[1]) + ", P(10) = " + caNum(t.p[2]) + ", P(11) = " + caNum(t.p[3]) + "; P(A = 0) = " + caNum(t.a[0]) + ", P(B = 0) = " + caNum(t.b[0]) + "."
          : " Tick the box to see the probabilities, or fill in the ledger first."));
        return {
          panels: [caGrid("joint probabilities", cells, show ? { margins: { rows: ["P(A=0) = " + caNum(t.a[0]), "P(A=1) = " + caNum(t.a[1])], cols: ["P(B=0) = " + caNum(t.b[0]), "P(B=1) = " + caNum(t.b[1])] } } : {})],
          caption: show ? "probabilities shown" : "probabilities hidden",
          desc: "A 2×2 ledger with A down the side and B across the top for " + caKetText(psi) + "." + (show ? " Joint: " + t.p.map(caNum).join(", ") + ". Margins: P(A = 0) = " + caNum(t.a[0]) + ", P(B = 0) = " + caNum(t.b[0]) + "." : "")
        };
      },
      checks: {
        a: ["P(01) = |2/√10|² = 4/10.", "Each row and each column adds to 1/2.", caLedgerGrader("a", caLedgerOf(CA_LEDGER.l1),
          "P(00) = 1/10, P(01) = 4/10, P(10) = 4/10, P(11) = 1/10. Each row adds to 1/2 and each column to 1/2. The margins are 50/50, the same as |+⟩|+⟩, but this pair mismatches 80% of the time; no product with these margins could do that.")],
        b: ["|i/2|² = 1/4 and |(1 + i)/2|² = (1 + 1)/4 = 1/2.", "P(B = 1) = P(01) + P(11).", caLedgerGrader("b", caLedgerOf(CA_LEDGER.l2),
          "P(00) = 1/4, P(01) = 1/4, P(10) = 0, P(11) = 1/2. Rows: P(A = 0) = 1/2, P(A = 1) = 1/2. Columns: P(B = 0) = 1/4, P(B = 1) = 3/4. Phases never enter a computational-basis probability.")],
        c: ["The squared magnitudes are 1, 1, 4 and 4.", "Divide each by their sum, 10.", caLedgerGrader("c", caLedgerOf(CA_LEDGER.l3),
          "|1|² + |i|² + |2|² + |−2i|² = 10. P(00) = 1/10, P(01) = 1/10, P(10) = 4/10, P(11) = 4/10. P(A = 0) = 1/5, P(A = 1) = 4/5, P(B = 0) = P(B = 1) = 1/2.")],
        d: ["P(01) = P(A = 0) − P(00).", "P(10) = P(B = 0) − P(00), and everything adds to 1.", caLedgerGrader("d", CA_LEDGER_D,
          "P(01) = 0.7 − 0.3 = 0.4. P(10) = 0.4 − 0.3 = 0.1. P(11) = 1 − 0.3 − 0.4 − 0.1 = 0.2. P(A = 1) = 0.3 and P(B = 1) = 0.6. Two margins and one cell fix the whole table.")]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 6–10 · Conditional odds, measuring one qubit, records, and operators
  // on pairs.
  // ---------------------------------------------------------------------------

  // 6 · Conditional Odds.
  const CA_COND = {
    c1: caTensor(caKet([Math.sqrt(3) / 2, [0, 1 / 2]]), caKet([3 / 5, 4 / 5])),
    c2: caKet([Math.sqrt(0.3), 0, 0, Math.sqrt(0.7)]),
    c3: caKet([2, 1, 0, 1].map(v => v / Math.sqrt(6))),
    c4: caKet([0.5, 0.5, 0.5, [0, 0.5]])
  };
  // P(B = j | A = i) from a table.
  const caGiven = (t, i, j) => t.p[2 * i + j] / t.a[i];

  // 7 · Measure Just One.
  const CA_MEASURE = {
    m1: caKet([0.5, 0.5, 0, CA_H]),
    m2: caKet([1, [0, 1], -1, 0].map(v => caScale(caZ(v), 1 / Math.sqrt(3)))),
    m3: caTensor(caKet([3 / 5, 4 / 5]), caKet([CA_H, [0, CA_H]]))
  };
  function caCollapse(psi, i) {
    const keep = psi.map((z, k) => ((k >> 1) === i ? z : [0, 0]));
    const p = caNorm2(keep);
    return { p, post: p > 0 ? keep.map(z => caScale(z, 1 / Math.sqrt(p))) : keep };
  }
  function caMeasureGrader(prefix, card, i, bit, work) {
    return c => {
      const { p, post } = caCollapse(CA_MEASURE[card], i);
      if (!caFits(c.ans(prefix + "-p"), p)) return caGrade(false, "Check P(A = " + i + "). Add |αij|² over the two terms with A = " + i + ".");
      const typed = c.ket(prefix + "-post");
      if (!caSameUpToPhase(typed, post)) {
        if (caSameUpToPhase(typed, post.map(z => caScale(z, Math.sqrt(p))), 1e-3)) return caGrade(false, "Those are the surviving amplitudes before rescaling. Divide them by √P(A = " + i + ") so the state has length 1.");
        return caGrade(false, "Check the state afterwards. Keep only the terms with A = " + i + ", zero the others, and rescale to length 1.");
      }
      const t = caTable(post);
      return caGrade(caFits(c.ans(prefix + "-b"), t.b[bit]), "The state afterwards is right. Now read B’s odds from it.", work);
    };
  }

  // 8 · Correlation Detective. Each source gives joint probabilities for one trial.
  const CA_SOURCES = {
    x: { p: [0.5, 0, 0, 0.5], name: "mystery source X" },
    phi: { p: [0.5, 0, 0, 0.5], name: "|Φ⁺⟩" },
    mix: { name: "the 50/50 mixture" },
    p8: { p: [0.64, 0.16, 0.16, 0.04], name: "the (√0.8, √0.2) product" },
    p9: { p: [0.81, 0.09, 0.09, 0.01], name: "the (√0.9, √0.1) product" }
  };
  const CA_SOURCE_SALT = { x: 1, phi: 2, mix: 3, p8: 4, p9: 5 };
  function caSeed(c) {
    const seed = caParse(c.val("seed"));
    return seed !== null && Number.isInteger(seed) && seed >= 0 ? seed : null;
  }
  function caRun(c, source) {
    c.s.runs ??= {};
    const seed = caSeed(c);
    let run = c.s.runs[source];
    if (!run || run.seed !== seed) {
      run = c.s.runs[source] = { seed, rng: caRng(seed * 7919 + CA_SOURCE_SALT[source]), counts: [0, 0, 0, 0], records: [] };
    }
    return run;
  }
  // One trial: the mixture first picks |00⟩ or |11⟩ by a coin, then measuring it gives that pair.
  function caTrial(run, source) {
    if (source === "mix") return run.rng() < 0.5 ? 0 : 3;
    const u = run.rng(), p = CA_SOURCES[source].p;
    let acc = 0;
    for (let k = 0; k < 4; k++) { acc += p[k]; if (u < acc) return k; }
    return 3;
  }
  const caTotal = run => run.counts.reduce((a, b) => a + b, 0);
  const caTally = run => CA_KETS.map((k, j) => k + " × " + run.counts[j]).join(", ");

  // 9 · Local Gates.
  const CA_GATES = { I: [[1, 0], [0, 1]], X: [[0, 1], [1, 0]], Z: [[1, 0], [0, -1]] };
  const caKron = (A, B) => CA_KETS.map((_, r) => CA_KETS.map((__, col) => caMul(caZ(A[r >> 1][col >> 1]), caZ(B[r & 1][col & 1]))));
  const CA_LOCAL_IN = { phip: caKet([CA_H, 0, 0, CA_H]), prod: caTensor(caKet([3 / 5, [0, 4 / 5]]), caKet([Math.sqrt(3) / 2, 1 / 2])) };
  const CA_BELL = { phim: caKet([CA_H, 0, 0, -CA_H]), psip: caKet([0, CA_H, CA_H, 0]), psim: caKet([0, CA_H, -CA_H, 0]) };
  function caMatGrader(prefix, exact, work) {
    return c => {
      const typed = c.mat4(prefix), misses = [];
      CA_KETS.forEach((r, i) => CA_KETS.forEach((col, j) => { if (!caFits(typed[i][j], exact[i][j][0])) misses.push("row ⟨" + r + "|, column |" + col + "⟩"); }));
      if (!misses.length) return caGrade(true, "", work);
      return caGrade(false, misses.length === 1 ? "The entry in " + misses[0] + " is not right yet." : misses.length + " entries are not right yet, the first in " + misses[0] + ". Column |kl⟩ is the output for the input |kl⟩.");
    };
  }

  // 10 · CNOT, with A as control and B as target: |10⟩ ↔ |11⟩.
  const caCnot = ([p, q, r, s]) => [p, q, s, r];
  function caCnotInput(c, strict) {
    const m = caFactorModel(c);
    if (!m.ok) return { ok: false, message: "Fill every factor box with a number." };
    if (strict && (!caNear(m.nA, 1) || !caNear(m.nB, 1))) return { ok: false, message: "Normalize both inputs: |a|² + |b|² = 1 and |c|² + |d|² = 1 (now " + caFmt(m.nA) + " and " + caFmt(m.nB) + ")." };
    return { ...m, ok: true, out: caCnot(m.psi) };
  }
  function caCnotDesign(target, name, work) {
    return c => {
      const m = caCnotInput(c, true);
      if (!m.ok) return caGrade(false, m.message);
      return caGrade(caSameUpToPhase(m.out, target, CA_DERIVED), "CNOT on your input gives " + caColText(m.out) + ", which isn’t " + name + " yet. Work backwards: which product input has the right first row?", work, "Mission complete. The checker ran CNOT on your input.");
    };
  }

  const caStations2 = {
    // 6 · Conditional Odds --------------------------------------------------------------------------------
    cond: {
      load(c, check) {
        const card = { a: "c1", b: "c2", c: "c3", d: "c4" }[check];
        if (card) c.field("card").value = card;
      },
      show(c) {
        const psi = CA_COND[c.val("card")], t = caTable(psi), given = c.val("given"), show = c.checked("show");
        const focus = given === "none" ? null : Number(given);
        const cells = psi.map((z, k) => ({ tag: "|" + CA_KETS[k] + "⟩", text: caNum(t.p[k]), fill: t.p[k], tone: CA_TONES[k] }));
        const odds = focus === null ? [t.b[0], t.b[1]] : [caGiven(t, focus, 0), caGiven(t, focus, 1)];
        const label = focus === null ? "P(B = j)" : "P(B = j | A = " + focus + ")";
        c.put("state", "State: " + caKetText(psi) + ". Joint: P(00) = " + caNum(t.p[0]) + ", P(01) = " + caNum(t.p[1]) + ", P(10) = " + caNum(t.p[2]) + ", P(11) = " + caNum(t.p[3]) + "."
          + (focus === null ? " B alone: P(B = 1) = " + caNum(t.b[1]) + "." : " Spotlight on A = " + focus + ", which has P(A = " + focus + ") = " + caNum(t.a[focus]) + ".")
          + (show && focus !== null ? " Rescaled: P(B = 0 | A = " + focus + ") = " + caNum(odds[0]) + ", P(B = 1 | A = " + focus + ") = " + caNum(odds[1]) + "." : focus !== null ? " Tick the box to see the rescaled odds." : ""));
        const shown = show || focus === null;
        return {
          panels: [
            caGrid("joint probabilities", cells, { focus, weight: 1.15 }),
            caBars(shown ? label : label + " (hidden)", [
              { label: "B = 0", value: shown ? odds[0] : 0, text: shown ? caNum(odds[0]) : "?", tone: "alpha" },
              { label: "B = 1", value: shown ? odds[1] : 0, text: shown ? caNum(odds[1]) : "?", tone: "beta" },
              { label: "P(B=1)", value: t.b[1], text: caNum(t.b[1]), tone: "guide", outline: true }], { weight: 0.85 })
          ],
          caption: focus === null ? "no condition" : "given A = " + focus,
          desc: "Left: the joint probabilities " + t.p.map(caNum).join(", ") + (focus === null ? "." : ", with the row A = " + focus + " spotlighted.")
            + " Right: bars for " + label + (shown ? ", " + caNum(odds[0]) + " and " + caNum(odds[1]) : ", hidden") + ", beside B’s unconditioned P(B = 1) = " + caNum(t.b[1]) + "."
        };
      },
      checks: {
        a: ["Keep the A = 0 row and rescale it: P(B = 1 | A = 0) = P(01)/P(A = 0).", "For a product, each row is A’s probability times B’s odds.", c => {
          const t = caTable(CA_COND.c1);
          if (!caFits(c.ans("a-0"), caGiven(t, 0, 1)) || !caFits(c.ans("a-1"), caGiven(t, 1, 1))) return caGrade(false, "Check the two conditional odds. P(01) = (3/4)(16/25) and P(A = 0) = 3/4.");
          return caGrade(c.choice("a-pick") === "same", "The odds are right. Compare them with each other and with P(B = 1).",
            "P(01) = |√3/2|²|4/5|² = (3/4)(16/25) and P(A = 0) = 3/4, so P(B = 1 | A = 0) = 16/25. Likewise P(B = 1 | A = 1) = (1/4)(16/25)/(1/4) = 16/25. Both equal P(B = 1) = 16/25: for a product state, A’s result tells you nothing about B.");
        }],
        b: ["Given A = 0, which pairs are still possible?", "Only 00 survives when A = 0, and only 11 when A = 1.", c => {
          if (!caFits(c.ans("b-0"), 1) || !caFits(c.ans("b-1"), 1)) return caGrade(false, "Check the odds. Given A = 0, the only surviving pair is 00.");
          return caGrade(c.choice("b-pick") === "fix", "The odds are right. What do they say about B?",
            "P(B = 0 | A = 0) = P(00)/P(A = 0) = 0.3/0.3 = 1, and P(B = 1 | A = 1) = 0.7/0.7 = 1. A’s result determines B’s, even though the marginals are uneven, 0.3 and 0.7.");
        }],
        c: ["P(A = 0) = 4/6 + 1/6 = 5/6.", "For P(A = 0 | B = 1) use the B = 1 column: P(01)/P(B = 1).", c => {
          const t = caTable(CA_COND.c3);
          if (!caFits(c.ans("c-0"), caGiven(t, 0, 1))) return caGrade(false, "Check P(B = 1 | A = 0) = P(01)/P(A = 0).");
          if (!caFits(c.ans("c-1"), caGiven(t, 1, 1))) return caGrade(false, "Check P(B = 1 | A = 1). Which pairs with A = 1 can occur?");
          return caGrade(caFits(c.ans("c-b"), t.p[1] / t.b[1]), "The first two are right. Now condition on B instead: use the B = 1 column.",
            "P(00) = 4/6, P(01) = 1/6, P(10) = 0, P(11) = 1/6. P(B = 1 | A = 0) = (1/6)/(5/6) = 1/5. P(B = 1 | A = 1) = (1/6)/(1/6) = 1. P(A = 0 | B = 1) = (1/6)/(2/6) = 1/2. Conditioning is not symmetric: A = 1 forces B = 1, but B = 1 leaves A at 50/50.");
        }],
        d: ["Every joint probability is 1/4.", "Compute D = α00α11 − α01α10 with α11 = i/2.", c => {
          if (!caFits(c.ans("d-0"), 0.5) || !caFits(c.ans("d-1"), 0.5)) return caGrade(false, "Check the odds. Each row is (1/4, 1/4), so each rescales to (1/2, 1/2).");
          return caGrade(c.choice("d-pick") === "entangled", "The odds are right. Now test the state itself with D.",
            "Both conditional odds are 1/2, so in this basis A’s result tells you nothing about B. But D = (1/2)(i/2) − (1/2)(1/2) = (i − 1)/4 ≠ 0, so the pure state is entangled. The phase i on |11⟩ is invisible to computational-basis probabilities; other measurements, covered in Lesson 19, can reveal the correlation it carries.");
        }]
      }
    },

    // 7 · Measure Just One --------------------------------------------------------------------------------
    measure: {
      load(c, check) {
        const set = { a: ["m1", "0"], b: ["m1", "1"], c: ["m2", "0"], d: ["m3", "1"] }[check];
        if (!set) return;
        c.field("card").value = set[0];
        c.field("result").value = set[1];
      },
      show(c) {
        const psi = CA_MEASURE[c.val("card")], i = Number(c.val("result")), show = c.checked("show");
        const { p, post } = caCollapse(psi, i);
        const before = caKetCells(psi);
        const after = post.map((z, k) => ({ tag: "|" + CA_KETS[k] + "⟩", text: show ? caCx(z) : (k >> 1) === i ? "?" : "0", fill: show ? caAbs2(z) : 0, z: show ? z : null, tone: CA_TONES[k] }));
        c.put("state", "Before: " + caKetText(psi) + ". A gives " + i + " with probability " + caNum(p) + "."
          + (show ? " Afterwards: " + caKetText(post) + ", so P(B = 0) = " + caNum(caTable(post).b[0]) + " and P(B = 1) = " + caNum(caTable(post).b[1]) + "." : " Tick the box to see the state afterwards."));
        return {
          panels: [
            caGrid("before: keep row A = " + i, before, { focus: i }),
            caGrid(show ? "after: ÷ √P(A = " + i + ") = " + caNum(Math.sqrt(p)) : "after (hidden)", after, { focus: i })
          ],
          caption: "A gave " + i,
          desc: "Left: the grid before the measurement, " + caColText(psi) + ", with row A = " + i + " kept and the other row struck out. Right: the state after, "
            + (show ? caColText(post) + "." : "hidden until you tick the box.")
        };
      },
      checks: {
        a: ["P(A = 0) = |α00|² + |α01|² = 1/4 + 1/4.", "Keep (1/2, 1/2, 0, 0), then divide by √(1/2).",
          caMeasureGrader("a", "m1", 0, 0, "P(A = 0) = 1/4 + 1/4 = 1/2. The surviving piece (1/2)|00⟩ + (1/2)|01⟩ has length √(1/2), so the state becomes (|00⟩ + |01⟩)/√2 = |0⟩A ⊗ |+⟩B. B is now 50/50: P(B = 0) = 1/2.")],
        b: ["Only one term has A = 1.", "That term is (1/√2)|11⟩; rescale it to length 1.",
          caMeasureGrader("b", "m1", 1, 1, "P(A = 1) = 0 + 1/2 = 1/2. Only (1/√2)|11⟩ survives, and it rescales to |11⟩. B gives 1 with certainty afterwards, although before the measurement P(B = 1) was 3/4.")],
        c: ["P(A = 0) = 1/3 + 1/3.", "Keep (1/√3)|00⟩ + (i/√3)|01⟩ and multiply by √(3/2).",
          caMeasureGrader("c", "m2", 0, 1, "P(A = 0) = |1/√3|² + |i/√3|² = 2/3. The state becomes (|00⟩ + i|01⟩)/√2 = |0⟩A ⊗ ((|0⟩ + i|1⟩)/√2)B. Its relative phase i survives the measurement, and B is 50/50: P(B = 1) = 1/2. Any overall phase, such as −(|00⟩ + i|01⟩)/√2, describes the same state.")],
        d: ["P(A = 1) = |4/5|² = 16/25.", "The A = 1 row is (4/5)(1/√2, i/√2).", c => {
          if (!caFits(c.ans("d-p"), 16 / 25)) return caGrade(false, "Check P(A = 1) = |b|² for A’s factor.");
          const typed = [c.cx("d-c"), c.cx("d-d")];
          if (!caSameUpToPhase(typed, caKet([CA_H, [0, CA_H]]))) return caGrade(false, "Check B’s state. Take the A = 1 row, (bc, bd), and rescale it to length 1.");
          return caGrade(c.choice("d-pick") === "same", "B’s state is right. Compare it with B’s factor before the measurement.",
            "P(A = 1) = 16/25. The A = 1 row is (4/5)(1/√2, i/√2), which rescales to (1/√2, i/√2): exactly B’s factor before. For a product state, measuring A leaves B’s state unchanged.");
        }]
      }
    },

    // 8 · Correlation Detective ---------------------------------------------------------------------------
    records: {
      load(c, check) {
        const source = { a: "x", b: "p8", c: "phi", d: "p9" }[check];
        if (source) c.field("source").value = source;
      },
      actions: {
        run(c) {
          const seed = caSeed(c);
          if (seed === null) throw new CaFieldError(c.field("seed"), "Enter a whole number of 0 or more.", true);
          const source = c.val("source"), run = caRun(c, source), n = Number(c.val("trials"));
          for (let k = 0; k < n; k++) {
            const j = caTrial(run, source);
            run.counts[j] += 1;
            run.records.push(CA_KETS[j]);
          }
          const total = caTotal(run), mismatches = run.counts[1] + run.counts[2];
          return "Ran " + n + " trials of " + CA_SOURCES[source].name + " with seed " + seed + ". After " + total + " trials: " + caTally(run) + "; " + (total - mismatches) + " matches and " + mismatches + " mismatches.";
        },
        clear(c) {
          c.s.runs ??= {};
          delete c.s.runs[c.val("source")];
          return "Run reset for " + CA_SOURCES[c.val("source")].name + ". With the same seed, the next trials repeat the same records.";
        }
      },
      show(c) {
        const source = c.val("source"), seed = caSeed(c);
        const run = seed === null ? null : c.s.runs?.[source];
        const live = run && run.seed === seed ? run : null;
        const total = live ? caTotal(live) : 0;
        const frac = j => (total ? live.counts[j] / total : 0);
        const mismatch = total ? (live.counts[1] + live.counts[2]) / total : 0;
        c.put("state", seed === null ? "Enter a whole-number seed to run trials."
          : total ? CA_SOURCES[source].name[0].toUpperCase() + CA_SOURCES[source].name.slice(1) + ", seed " + seed + ": " + total + " trials. " + caTally(live) + ". Match rate " + caFmt(1 - mismatch) + ", mismatch rate " + caFmt(mismatch) + "."
          : "No trials yet for " + CA_SOURCES[source].name + " with seed " + seed + ". Press Run trials.");
        c.list("records", total ? live.records.slice(-20).map((r, k) => "Trial " + (total - Math.min(20, total) + k + 1) + ": A = " + r[0] + ", B = " + r[1]) : []);
        return {
          panels: [caBars(total ? "fraction of " + total + " records" : "no records yet", [
            ...CA_KETS.map((k, j) => ({ label: k, value: frac(j), text: total ? String(live.counts[j]) : "0", tone: CA_TONES[j] })),
            { label: "mismatch", value: mismatch, text: caFmt(caRound(mismatch, 0.001)), tone: "ink", outline: true }])],
          caption: total ? total + " trials" : "no trials",
          desc: total ? "Bars give the fraction of records 00, 01, 10 and 11, with counts " + live.counts.join(", ") + ", and the mismatch fraction " + caFmt(caRound(mismatch, 0.001)) + "." : "No records yet."
        };
      },
      checks: {
        a: ["A mismatch is a record 01 or 10.", "One mismatch rules out the ideal |Φ⁺⟩. Zero mismatches is consistent with it, but is it proof?", c => {
          const run = c.s.runs?.x;
          if (!run || run.seed !== caSeed(c) || caTotal(run) < 50) return caSetup("Run at least 50 trials of mystery source X first (with the seed shown).");
          const mismatches = run.counts[1] + run.counts[2];
          if (c.whole("a-n") !== mismatches) return caGrade(false, "Count again: your run has " + caTotal(run) + " records. Add the 01 and 10 tallies.");
          const want = mismatches > 0 ? "product" : "phi";
          return caGrade(c.choice("a-pick") === want, mismatches > 0 ? "Your run has mismatches. What does even one mismatch rule out?" : "No mismatches in your run. That rules out a lot, but would a classical coin flip between 00 and 11 give anything different?",
            "Your run of " + caTotal(run) + " trials has " + mismatches + " mismatches. Every record matches, which is what the ideal |Φ⁺⟩ predicts. The verdict is “consistent with”, not “proof”: a classical 50/50 mixture of |00⟩ and |11⟩ gives the same computational-basis records (case 3). Source X was in fact |Φ⁺⟩.");
        }],
        b: ["Your matching fraction is (00 count + 11 count)/total.", "For a product, P(match) = P(A = 0)P(B = 0) + P(A = 1)P(B = 1).", c => {
          const run = c.s.runs?.p8;
          if (!run || run.seed !== caSeed(c) || caTotal(run) < 50) return caSetup("Run at least 50 trials of the (√0.8, √0.2) product first.");
          const f = (run.counts[0] + run.counts[3]) / caTotal(run);
          if (!caFits(c.ans("b-f"), f)) return caGrade(false, "Check your matching fraction: (" + run.counts[0] + " + " + run.counts[3] + ")/" + caTotal(run) + ".");
          return caGrade(caFits(c.ans("b-p"), 0.68), "Your fraction is right. Now find the exact probability from the state.",
            "Your run matched " + (run.counts[0] + run.counts[3]) + " times in " + caTotal(run) + ", a fraction of " + caFmt(f) + ". The exact P(match) = (0.8)(0.8) + (0.2)(0.2) = 0.68. The bits match often only because both qubits lean toward 0: they are independent, so P(00) = P(A = 0)P(B = 0) = 0.64.");
        }],
        c: ["Compare the 01 and 10 tallies of the two sources.", "What does the mixture send on each trial, and what does measuring it give?", c => {
          const enough = key => { const run = c.s.runs?.[key]; return run && run.seed === caSeed(c) && caTotal(run) >= 20; };
          if (!enough("phi") || !enough("mix")) return caSetup("Run at least 20 trials of |Φ⁺⟩ and at least 20 of the mixture (switch the source between runs).");
          return caGrade(c.choice("c-pick") === "same", "Look at your two sets of tallies again: do either of them ever show 01 or 10?",
            "Both sources give 00 or 11 with probability 1/2 each, and never 01 or 10. In the computational basis their records are statistically identical, so these frequencies alone can’t certify entanglement. |Φ⁺⟩ is a pure entangled state and the mixture is not; telling them apart needs measurements in other bases, which Lesson 19 covers.");
        }],
        d: ["P(mismatch) = P(01) + P(10) = 2(0.9)(0.1).", "Find the smallest n with (1 − 0.18)ⁿ < 0.01.", c => {
          if (!caFits(c.ans("d-p"), 0.18)) return caGrade(false, "Check P(mismatch) = P(A = 0)P(B = 1) + P(A = 1)P(B = 0).");
          const n = c.whole("d-n", 1);
          return caGrade(n === 24, n < 24 ? "With " + n + " trials, (0.82)^" + n + " ≈ " + caFmt(0.82 ** n) + " is still above 0.01." : "Fewer trials already do it: check (0.82)ⁿ for smaller n.",
            "P(mismatch) = 0.09 + 0.09 = 0.18. With no mismatch in n trials having probability 0.82ⁿ, (0.82)²³ ≈ 0.0105 > 0.01 and (0.82)²⁴ ≈ 0.0086 < 0.01, so n = 24. A run of 24 all-matching records would be unusual for this product, though still possible.");
        }]
      }
    },

    // 9 · Local Gates ---------------------------------------------------------------------------------------
    local: {
      load(c, check) { if (check === "d") c.field("input").value = "prod"; },
      show(c) {
        const ga = c.val("ga"), gb = c.val("gb"), K = caKron(CA_GATES[ga], CA_GATES[gb]), psi = CA_LOCAL_IN[c.val("input")], out = caApply(K, psi);
        const show = c.checked("show");
        c.put("state", ga + " ⊗ " + gb + " on " + caKetText(psi) + " gives " + caKetText(out) + ". D before = " + caCx(caD(psi)) + ", D after = " + caCx(caD(out)) + ".");
        return {
          panels: [
            caMatrixPanel(ga + " ⊗ " + gb, show ? K.map(row => row.map(z => caCx(z))) : K.map(row => row.map(() => "?")), { weight: 1.1, note: show ? "rows ⟨00|…⟨11|, columns |00⟩…|11⟩" : "tick the box to show it" }),
            caGrid("output", caKetCells(out), { weight: 0.9 })
          ],
          caption: ga + " ⊗ " + gb,
          desc: "Left: the 4×4 matrix " + ga + " ⊗ " + gb + (show ? ", rows " + K.map(row => "[" + row.map(caCx).join(", ") + "]").join(", ") + "." : ", hidden.") + " Right: the output grid " + caColText(out) + "."
        };
      },
      checks: {
        a: ["Column |00⟩ is the image of |00⟩: X ⊗ I sends it to |10⟩.", "Each column has a single 1, in the row of the image.",
          caMatGrader("a-m", caKron(CA_GATES.X, CA_GATES.I), "X ⊗ I sends |00⟩ → |10⟩, |01⟩ → |11⟩, |10⟩ → |00⟩ and |11⟩ → |01⟩. So the 1s sit in row ⟨10| column |00⟩, row ⟨11| column |01⟩, row ⟨00| column |10⟩ and row ⟨01| column |11⟩: rows [0, 0, 1, 0], [0, 0, 0, 1], [1, 0, 0, 0], [0, 1, 0, 0]. It is X with each entry replaced by that entry times I.")],
        b: ["I ⊗ Z never changes a ket, only its sign.", "The sign is −1 whenever B = 1.",
          caMatGrader("b-m", caKron(CA_GATES.I, CA_GATES.Z), "I ⊗ Z is diagonal with entries +1, −1, +1, −1 on |00⟩, |01⟩, |10⟩, |11⟩: a minus sign wherever B’s bit is 1. Every off-diagonal entry is 0.")],
        c: ["Z on either qubit gives |11⟩ a minus sign.", "X on either qubit turns |00⟩ + |11⟩ into |01⟩ + |10⟩ or |10⟩ + |01⟩.", c => {
          const tests = [["1", CA_BELL.phim, "|Φ⁻⟩"], ["2", CA_BELL.psip, "|Ψ⁺⟩"], ["3", CA_BELL.psim, "|Ψ⁻⟩"]];
          for (const [k, target, name] of tests) {
            const out = caApply(caKron(CA_GATES[c.choice("c-" + k + "a")], CA_GATES[c.choice("c-" + k + "b")]), CA_LOCAL_IN.phip);
            if (!caSameUpToPhase(out, target)) return caGrade(false, "Your gates for " + name + " give " + caKetText(out) + ".");
          }
          return caGrade(true, "", "|Φ⁻⟩: Z ⊗ I or I ⊗ Z. |Ψ⁺⟩: X ⊗ I or I ⊗ X. |Ψ⁻⟩: Z ⊗ X gives (|01⟩ − |10⟩)/√2, and X ⊗ Z gives −(|01⟩ − |10⟩)/√2, the same state up to a global phase. A gate on one qubit can move between all four Bell states.");
        }],
        d: ["The input is a product, so D before = 0.", "Each gate has determinant ±1.", c => {
          if (c.val("input") !== "prod") return caSetup("Choose the product input. Reopening this mission picks it.");
          const out = caApply(caKron(CA_GATES[c.val("ga")], CA_GATES[c.val("gb")]), CA_LOCAL_IN.prod);
          if (!caCxFits(c.cx("d-d"), caD(out))) return caGrade(false, "Check D for the output " + caKetText(out) + ".");
          return caGrade(c.choice("d-pick") === "det", "D is right. Why must it be?",
            "With your gates the output is " + caKetText(out) + " and D = 0. In general U on A and V on B send the 2×2 amplitude grid M to U M Vᵀ, so D becomes det(U) det(V) D. A product has D = 0, so every output of gates acting on one qubit at a time is still a product. It takes a gate acting on both qubits together, such as CNOT, to entangle.");
        }]
      }
    },

    // 10 · Entangling Gate (CNOT) ------------------------------------------------------------------------------
    cnot: {
      load(c, check) {
        if (check === "d") caLoadFactors(c, [["√3/2", "0"], ["1/2", "0"], ["1", "0"], ["0", "0"]]);
      },
      show(c) {
        const m = caCnotInput(c, false), show = c.checked("show");
        if (!m.ok) {
          c.put("state", m.message);
          return { panels: [caCircuit("CNOT: A controls, B is the target", [{ cnot: true }])], caption: "incomplete input", desc: "A two-wire circuit with a CNOT gate. The input is incomplete." };
        }
        const dIn = caD(m.psi), dOut = caD(m.out);
        c.put("state", "Input: " + caKetText(m.psi) + " (D = " + caCx(dIn) + ")." + (caNear(m.nA, 1) && caNear(m.nB, 1) ? "" : " The inputs aren’t normalized yet.")
          + (show ? " Output: " + caKetText(m.out) + ", D = " + caCx(dOut) + (caAbs(dOut) < 1e-6 ? ", still a product." : ", entangled.") : " Tick the box to see the output."));
        return {
          panels: [
            caCircuit("CNOT: A controls, B is the target", [{ cnot: true }], { inA: caKetText([m.a, m.b], ["0", "1"]), inB: caKetText([m.c, m.d], ["0", "1"]), weight: 1.1, note: show ? "D: " + caCx(dIn) + " → " + caCx(dOut) : "" }),
            caGrid(show ? "output" : "output (hidden)", show ? caKetCells(m.out) : caKetCells(m.out, false), { weight: 0.9, rows: ["A=0", "A=1"], cols: ["B=0", "B=1"] })
          ],
          caption: show ? (caAbs(dOut) < 1e-6 ? "product output" : "entangled output") : "output hidden",
          desc: "Qubit A, " + caKetText([m.a, m.b], ["0", "1"]) + ", on the top wire and B, " + caKetText([m.c, m.d], ["0", "1"]) + ", below, joined by a CNOT with its control dot on A and target ⊕ on B."
            + (show ? " Output grid " + caColText(m.out) + ", D = " + caCx(dOut) + "." : "")
        };
      },
      checks: {
        a: ["When A is 0, B is untouched.", "When A is 1, B flips: 0 ↔ 1.", c => {
          const want = { "00": "00", "01": "01", "10": "11", "11": "10" };
          const wrong = Object.keys(want).filter(k => c.choice("a-" + k) !== want[k]);
          return caGrade(!wrong.length, (wrong.length === 1 ? "|" + wrong[0] + "⟩ is" : wrong.length + " rows are") + " not right yet. The first bit (A) never changes.",
            "|00⟩ → |00⟩, |01⟩ → |01⟩, |10⟩ → |11⟩, |11⟩ → |10⟩. As a 4×4 matrix it is the identity on the A = 0 block and X on the A = 1 block.");
        }],
        b: ["The output must have equal amplitudes on |00⟩ and |11⟩, and nothing on |01⟩ or |10⟩.", "CNOT turns |10⟩ into |11⟩. So which input is (|00⟩ + |10⟩)/√2?",
          caCnotDesign(CA_LOCAL_IN.phip, "|Φ⁺⟩", "Input |+⟩A ⊗ |0⟩B = (|00⟩ + |10⟩)/√2. CNOT leaves |00⟩ and sends |10⟩ to |11⟩, giving (|00⟩ + |11⟩)/√2 = |Φ⁺⟩. A product input became entangled: D went from 0 to 1/2.")],
        c: ["Undo the CNOT: which input does it send to |01⟩ − |10⟩?", "CNOT sends |01⟩ → |01⟩ and |11⟩ → |10⟩, so the input is (|01⟩ − |11⟩)/√2.",
          caCnotDesign(CA_BELL.psim, "|Ψ⁻⟩", "CNOT is its own inverse, so the input is CNOT(|01⟩ − |10⟩)/√2 = (|01⟩ − |11⟩)/√2 = |−⟩A ⊗ |1⟩B. Any global phase on the input works as well.")],
        d: ["The output is (ac, ad, bd, bc).", "With c = 1 and d = 0 that is (√3/2, 0, 0, 1/2).", c => {
          const exact = caKet([Math.sqrt(3) / 2, 0, 0, 1 / 2]);
          const misses = caKetMisses(c.ket("d-col"), exact);
          if (misses.length) return caGrade(false, caMissText(misses) + " not right yet. CNOT moves the |10⟩ amplitude to |11⟩.");
          return caGrade(caFits(c.ans("d-D"), Math.sqrt(3) / 4), "The column is right. Now compute D for it.",
            "Input (√3/2)|00⟩ + (1/2)|10⟩; CNOT gives (√3/2)|00⟩ + (1/2)|11⟩. D = (√3/2)(1/2) − 0 = √3/4 ≈ 0.433. It is entangled, but less than |Φ⁺⟩’s 1/2: the bits always match, with uneven odds 3/4 and 1/4.");
        }],
        e: ["The output’s D is ab(c² − d²).", "Make c² = d²: try B in (|0⟩ + |1⟩)/√2.", c => {
          const m = caCnotInput(c, true);
          if (!m.ok) return caGrade(false, m.message);
          if (caAbs(m.a) < 0.05 || caAbs(m.b) < 0.05) return caGrade(false, "Keep both a and b clearly nonzero, so A really is in a superposition.");
          return caGrade(caAbs(caD(m.out)) <= CA_DERIVED, "CNOT on your input gives D = " + caCx(caD(m.out)) + ", so it entangles. Which B states does a flip leave unchanged, up to a sign?",
            "Your output " + caKetText(m.out) + " has D = 0. D = ab(c² − d²), so with a, b ≠ 0 you need d = ±c: B in (|0⟩ + |1⟩)/√2 or (|0⟩ − |1⟩)/√2. Flipping B then changes it at most by a sign, which factors out, so the output stays a product.", "Mission complete. The checker ran CNOT on your input.");
        }]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 11–14 · Dimension Counter, Pair Designer, Error Detective, and an
  // interaction that builds entanglement.
  // ---------------------------------------------------------------------------

  // 12 · Pair Designer. The checker reads the learner’s own state.
  function caDesignModel(c, strict) {
    const psi = strict ? c.ket("s") : c.quietKet("s");
    if (!psi) return { ok: false };
    const norm = caNorm2(psi), t = caTable(psi);
    return { ok: true, psi, norm, t, D: caD(psi), normalized: caNear(norm, 1) };
  }
  function caDesignGrader(test, work) {
    return c => {
      const m = caDesignModel(c, true);
      if (!m.normalized) return caGrade(false, "Normalize your state first: the four |αij|² add to " + caFmt(m.norm) + ", not 1.");
      const miss = test(m);
      return caGrade(!miss, miss || "", work(m), "Mission complete. The checker tested the state you built.");
    };
  }
  const caWithin = (value, target) => caNear(value, target, CA_DERIVED);

  // 13 · Error Detective. Each case has exactly one planted mistake.
  const CA_ERRORS = {
    add: { line: 2, text: "Case 1 · expanding a product", claim: "P(01) ≈ 1.709", truth: "P(01) = 9/50 = 0.18",
      work: "Line 1 is right. Line 2 adds the amplitudes. The tensor product multiplies them: α01 = (3/5)(1/√2) = 3/(5√2) ≈ 0.4243, so P(01) = 9/50 = 0.18. A “probability” of 1.709 is a sure sign that something went wrong: no probability exceeds 1." },
    order: { line: 2, text: "Case 2 · which bit comes first", claim: "P(A = 0) = 9/25", truth: "P(A = 0) = 0",
      work: "Line 1 is right. Line 2 puts B’s bit first. With A first, |1⟩A ⊗ |0⟩B = |10⟩ and |1⟩A ⊗ |1⟩B = |11⟩, so the joint state is (3/5)|10⟩ + (4/5)|11⟩. Every record starts with A’s 1, and P(A = 0) = 0." },
    negative: { line: 3, text: "Case 3 · a negative amplitude", claim: "P(11) = −1/2", truth: "P(11) = 1/2",
      work: "Lines 1 and 2 are right. Line 3 forgets the squared magnitude: P(11) = |α11|² = |−1/√2|² = 1/2. The total is 1/4 + 1/4 + 0 + 1/2 = 1, so the state was normalized all along. A minus sign on an amplitude never makes a probability negative." },
    marginal: { line: 3, text: "Case 4 · a joint probability", claim: "P(00) = 0.09", truth: "P(00) = 0.3",
      work: "Lines 1 and 2 are right. Line 3 multiplies the marginals, which works only for a product state. This state is entangled (D = √0.21 ≠ 0). Read the joint probability directly: P(00) = |α00|² = 0.3. The bits never disagree: P(01) = P(10) = 0." },
    proof: { line: 4, text: "Case 5 · what the records show", claim: "certainly |Φ⁺⟩", truth: "|Φ⁺⟩ or a 50/50 mixture",
      work: "Lines 1–3 are right: no pure product state matches perfectly with 50/50 marginals. Line 4 overreaches. A classical source that sends |00⟩ or |11⟩ at random gives the same computational-basis records, so these frequencies alone can’t certify entanglement. Telling the two apart needs measurements in other bases, which Lesson 19 covers." },
    sign: { line: 3, text: "Case 6 · four equal magnitudes", claim: "a product, D = 0", truth: "entangled, D = −1/2",
      work: "Lines 1 and 2 are right. Line 3 drops the signs. They change no computational-basis probability, but they change the state: D = (1/2)(−1/2) − (−1/2)(−1/2) = −1/4 − 1/4 = −1/2 ≠ 0. The rows (1/2, −1/2) and (−1/2, −1/2) aren’t proportional, so the state is entangled." }
  };
  function caErrorGrader(key) {
    return c => {
      const card = CA_ERRORS[key], line = Number(c.choice(key + "-line")), kind = c.choice(key + "-kind");
      if (line !== card.line && kind === key) return caGrade(false, "That names the mistake, but it first appears on a different line.");
      if (line === card.line && kind !== key) return caGrade(false, "That is the first wrong line. Name what goes wrong there more precisely.");
      return caGrade(line === card.line && kind === key, "Check each line in order, and stop at the first one that is false.", card.work);
    };
  }

  // 14 · Interaction Builds Entanglement. H = J Z⊗Z with θ = (J/ℏ)t: matched kets
  // gain e^(−iθ), mismatched kets e^(+iθ).
  const CA_STARTS = {
    pp: caTensor(caKet([CA_H, CA_H]), caKet([CA_H, CA_H])),
    zp: caTensor(caKet([1, 0]), caKet([CA_H, CA_H])),
    tp: caTensor(caKet([Math.sqrt(3) / 2, 1 / 2]), caKet([CA_H, CA_H]))
  };
  const CA_ZZ = [1, -1, -1, 1];
  const caEvolve = (psi, theta) => psi.map((z, k) => caMul(z, caCis(-CA_ZZ[k] * theta)));
  function caInteractModel(c) {
    const w = c.quiet("w"), t = Math.max(0, c.number("t")), psi0 = CA_STARTS[c.val("start")];
    if (w === null) return { ok: false };
    const psi = caEvolve(psi0, w * t);
    return { ok: true, w, t, psi0, psi, D: caD(psi), curve: s => caAbs(caD(caEvolve(psi0, w * s))) };
  }
  const caInteractLoaded = c => caNear(c.quiet("w") ?? NaN, Math.PI, 1e-9) && c.val("start") === "pp";
  // A time that matches target up to whole multiples of period.
  const caRepeats = (t, target, period) => { const k = Math.round((t - target) / period); return k >= 0 && Math.abs(t - target - k * period) <= CA_TOLERANCE + 1e-12; };

  const caStations3 = {
    // 11 · Dimension Counter --------------------------------------------------------------------------------
    dims: {
      show(c) {
        if (c.checked("qutrit")) {
          const rows = [["|0,0⟩", "|0,1⟩", "|0,2⟩"], ["|1,0⟩", "|1,1⟩", "|1,2⟩"]];
          c.put("state", "A qubit A with a three-level system C: dim(ℋA ⊗ ℋC) = 2 × 3 = 6. Ordered basis, A first: |0,0⟩, |0,1⟩, |0,2⟩, |1,0⟩, |1,1⟩, |1,2⟩.");
          return {
            panels: [caMatrixPanel("A down, C across: 2 × 3 = 6", rows, { tones: [["warn", "angle", "plus"], ["alpha", "beta", "minus"]], note: "read row by row for the ordered basis" })],
            caption: "qubit ⊗ three-level system",
            desc: "A 2 by 3 table of basis kets with A’s level as the row and C’s as the column: |0,0⟩, |0,1⟩, |0,2⟩ on top and |1,0⟩, |1,1⟩, |1,2⟩ below, six in all."
          };
        }
        const n = Math.round(caClamp(c.number("n"), 1, 10)), big = 2 ** n;
        c.put("state", "n = " + n + " qubits: a general state needs 2^" + n + " = " + big + " complex amplitudes. A product of " + n + " single-qubit states needs " + 2 * n + ". "
          + n + " classical bits have " + big + " configurations, but sit in just 1 of them at a time, recorded by " + n + " bits.");
        return {
          panels: [caBars("counts for n = " + n, [
            { label: "2ⁿ amps", value: big, text: String(big), tone: "alpha" },
            { label: "product", value: 2 * n, text: String(2 * n), tone: "plus" },
            { label: "n bits", value: n, text: String(n), tone: "beta" },
            { label: "configs now", value: 1, text: "1", tone: "angle" }], { max: big })],
          caption: n + (n === 1 ? " qubit" : " qubits"),
          desc: "Bars on a scale up to " + big + ": a general state needs " + big + " amplitudes, a product " + 2 * n + ", n classical bits use " + n + " bits, and they occupy 1 configuration at a time."
        };
      },
      checks: {
        a: ["Each qubit doubles the count: 2 × 2 × 2.", "A classical register holds one definite configuration, such as 101.", c => {
          if (c.whole("a-amps", 1) !== 8) return caGrade(false, "Check the amplitudes: one for each joint basis state |000⟩ … |111⟩.");
          return caGrade(c.whole("a-at", 0) === 1, "The amplitudes are right. How many configurations is a classical register in at one moment?",
            "Three qubits have 2³ = 8 joint basis states, so a general state needs 8 complex amplitudes. Three classical bits also have 8 possible configurations, but they are in exactly 1 of them at a time.");
        }],
        b: ["2¹⁰ = 1024.", "One configuration is a string of ten 0s and 1s.", c => {
          if (c.whole("b-amps", 1) !== 1024) return caGrade(false, "Check the amplitudes: 2 multiplied by itself 10 times.");
          return caGrade(c.whole("b-bits", 1) === 10, "The amplitudes are right. How long is one configuration written as bits?",
            "A general 10-qubit state needs 2¹⁰ = 1024 complex amplitudes. One classical configuration of 10 bits is written with just 10 bits. The amplitude count doubles with every qubit; the bit count grows by one.");
        }],
        c: ["Dimensions multiply.", "Count along the ordered list: A’s 0 block comes first, then A’s 1 block.", c => {
          if (c.whole("c-dim", 1) !== 6) return caGrade(false, "Check the dimension: 2 levels for A times 3 for C.");
          if (c.whole("c-pos", 1) !== 6) return caGrade(false, "Check the position: count |0,0⟩, |0,1⟩, |0,2⟩, |1,0⟩, |1,1⟩, |1,2⟩.");
          return caGrade(c.choice("c-coef") === "be", "Dimension and position are right. Which amplitude of A goes with |1⟩, and which of C with |2⟩?",
            "dim = 2 × 3 = 6. |1,2⟩ is the last of the six, position 6. Its coefficient pairs A’s |1⟩ amplitude b with C’s |2⟩ amplitude e: be. The same tensor rules hold for any pair of systems.");
        }],
        d: ["Each factor has two amplitudes.", "2⁵ = 32.", c => {
          if (c.whole("d-prod", 1) !== 10) return caGrade(false, "Check the product count: five factors with two amplitudes each.");
          return caGrade(c.whole("d-gen", 1) === 32, "The product count is right. Now a general 5-qubit state.",
            "The factors carry 5 × 2 = 10 amplitudes, but a general state needs 2⁵ = 32. Products fill only a thin corner of the space; most states of several qubits are entangled.");
        }]
      }
    },

    // 12 · Pair Designer --------------------------------------------------------------------------------------
    designer: {
      show(c) {
        const m = caDesignModel(c, false);
        if (!m.ok) {
          c.put("state", "Fill every real and imaginary box with a number.");
          return { panels: [], caption: "incomplete state", desc: "A box of your state is empty or unreadable." };
        }
        const t = m.t;
        c.put("state", "Sum of |αij|² = " + caFmt(m.norm) + (m.normalized ? " (normalized)." : " (not normalized yet).")
          + " P(00) = " + caFmt(t.p[0]) + ", P(01) = " + caFmt(t.p[1]) + ", P(10) = " + caFmt(t.p[2]) + ", P(11) = " + caFmt(t.p[3])
          + ". P(A = 0) = " + caFmt(t.a[0]) + ", P(B = 0) = " + caFmt(t.b[0]) + ", P(match) = " + caFmt(t.match) + ". D = " + caCx([caTidy(m.D[0]), caTidy(m.D[1])]) + ".");
        return {
          panels: [
            caBars("joint probabilities", m.psi.map((z, k) => ({ label: CA_KETS[k], value: t.p[k], text: caFmt(caRound(t.p[k], 0.001)), tone: CA_TONES[k] })), { weight: 1.2 }),
            caBars("margins and |D|", [
              { label: "A=0", value: t.a[0], text: caFmt(caRound(t.a[0], 0.001)), tone: "alpha" },
              { label: "B=0", value: t.b[0], text: caFmt(caRound(t.b[0], 0.001)), tone: "beta" },
              { label: "match", value: t.match, text: caFmt(caRound(t.match, 0.001)), tone: "ink" },
              { label: "|D|", value: caAbs(m.D), text: caFmt(caRound(caAbs(m.D), 0.001)), tone: "plus", outline: true }], { weight: 0.8 })
          ],
          caption: m.normalized ? "normalized" : "not normalized",
          desc: "Bars for your state, after normalizing: P(00) to P(11) = " + t.p.map(p => caFmt(caRound(p, 0.001))).join(", ") + "; P(A = 0) = " + caFmt(caRound(t.a[0], 0.001)) + ", P(B = 0) = " + caFmt(caRound(t.b[0], 0.001)) + ", P(match) = " + caFmt(caRound(t.match, 0.001)) + ", |D| = " + caFmt(caRound(caAbs(m.D), 0.001)) + "."
        };
      },
      checks: {
        a: ["50/50 margins and an 80% match force P(00) = P(11) and P(01) = P(10).", "Try P(00) = P(11) = 0.4 and P(01) = P(10) = 0.1, so amplitudes √0.4 and √0.1.",
          caDesignGrader(m => (!caWithin(m.t.a[0], 0.5) ? "P(A = 0) is " + caFmt(m.t.a[0]) + "; make it 1/2." : !caWithin(m.t.b[0], 0.5) ? "P(B = 0) is " + caFmt(m.t.b[0]) + "; make it 1/2." : !caWithin(m.t.match, 0.8) ? "Your bits match with probability " + caFmt(m.t.match) + "; make it 0.8." : ""),
            m => "Your state has P(A = 0) = " + caFmt(m.t.a[0]) + ", P(B = 0) = " + caFmt(m.t.b[0]) + " and P(match) = " + caFmt(m.t.match) + ". The margins force P(00) = P(11) = 0.4 and P(01) = P(10) = 0.1; any phases on top of √0.4, √0.1, √0.1, √0.4 work. Its D = " + caCx([caTidy(m.D[0]), caTidy(m.D[1])]) + " is nonzero: no product could do this.")],
        b: ["Build it as a product: A’s factor has |a|² = 0.9, and B’s factor has |d|² = 0.25.", "Multiply: (√0.9|0⟩ + √0.1|1⟩) ⊗ (√0.75|0⟩ + √0.25|1⟩).",
          caDesignGrader(m => (caAbs(m.D) > CA_DERIVED ? "Your state has |D| = " + caFmt(caAbs(m.D)) + ", so it isn’t a product. Make the two rows proportional." : !caWithin(m.t.a[0], 0.9) ? "P(A = 0) is " + caFmt(m.t.a[0]) + "; make it 0.9." : !caWithin(m.t.b[1], 0.25) ? "P(B = 1) is " + caFmt(m.t.b[1]) + "; make it 0.25." : ""),
            m => "Your product has P(A = 0) = " + caFmt(m.t.a[0]) + " and P(B = 1) = " + caFmt(m.t.b[1]) + ". One answer is (√0.9|0⟩ + √0.1|1⟩) ⊗ ((√3/2)|0⟩ + (1/2)|1⟩), with column (√0.675, √0.225, √0.075, √0.025).")],
        c: ["Every |αij| must be 1/2. Only the phases are free.", "One minus sign: (|00⟩ + |01⟩ + |10⟩ − |11⟩)/2 has D = −1/2.",
          caDesignGrader(m => (m.t.p.some(p => !caWithin(p, 0.25)) ? "Every joint probability must be 1/4; yours are " + m.t.p.map(p => caFmt(caRound(p, 0.001))).join(", ") + "." : caAbs(m.D) < 0.1 ? "Your |D| is " + caFmt(caAbs(m.D)) + "; it must be at least 0.1. Change a sign or a phase." : ""),
            m => "Your state has every P(ij) = 1/4 and |D| = " + caFmt(caAbs(m.D)) + ". All four probabilities match |+⟩|+⟩, yet the state is entangled: in the computational basis the phases are invisible.")],
        d: ["P(11) = 0, so P(A = 1) = P(10) and P(B = 1) = P(01).", "Then P(01) = 1/3, P(10) = 1/2, and P(00) = 1/2 − 1/3 = 1/6.",
          caDesignGrader(m => (!caWithin(m.t.p[3], 0) ? "P(11) is " + caFmt(m.t.p[3]) + "; it must be 0." : !caWithin(m.t.a[0], 0.5) ? "P(A = 0) is " + caFmt(m.t.a[0]) + "; make it 1/2." : !caWithin(m.t.b[0], 2 / 3) ? "P(B = 0) is " + caFmt(m.t.b[0]) + "; make it 2/3." : ""),
            m => "The targets force P(00) = 1/6, P(01) = 1/3, P(10) = 1/2 and P(11) = 0, so |α| = (1/√6, 1/√3, 1/√2, 0) with any phases. Yours: " + m.t.p.map(p => caFmt(caRound(p, 0.001))).join(", ") + ".")],
        e: ["For a product, P(ij) = P(A = i)P(B = j).", "With 50/50 margins, what is P(00) + P(11)?", c =>
          caGrade(c.choice("e-pick") === "no", "Work out P(match) for a product with 50/50 margins. The example column has D ≠ 0.",
            "A product has P(ij) = P(A = i)P(B = j) = 1/4 for every pair when both margins are 50/50, so P(match) = 1/4 + 1/4 = 1/2, never 0.8. The column (√0.4, √0.1, √0.1, √0.4) meets the targets, but its D = 0.4 − 0.1 = 0.3 ≠ 0: it is entangled.")]
      }
    },

    // 13 · Error Detective ----------------------------------------------------------------------------------
    detective: {
      show(c) {
        const key = c.open() ?? "add", card = CA_ERRORS[key];
        c.put("state", c.open() ? "Case file open: " + card.text + "." : "Open a case file. Showing case 1.");
        const done = c.revealed(key);
        return {
          panels: [caChain("claimed vs actual", [
            { title: "the solution", sub: card.claim, tone: "warn" },
            { title: "actually", sub: done ? card.truth : "?", tone: "plus" }], { note: done ? "Case solved." : "The truth fills in once you solve the case." })],
          caption: card.text,
          desc: "Two boxes. The solution claims: " + card.claim + ". " + (done ? "Actually: " + card.truth + "." : "The second box fills in once the case is solved.")
        };
      },
      checks: {
        add: ["Line 1 is correct.", "How do amplitudes combine in a tensor product?", caErrorGrader("add")],
        order: ["Line 1 is correct.", "Which qubit’s bit comes first in |ij⟩?", caErrorGrader("order")],
        negative: ["Lines 1 and 2 are correct.", "What does the Born rule square?", caErrorGrader("negative")],
        marginal: ["Lines 1 and 2 are correct.", "When is P(ij) = P(A = i)P(B = j)?", caErrorGrader("marginal")],
        proof: ["Lines 1, 2 and 3 are correct.", "Could a source with no entanglement at all produce the same records?", caErrorGrader("proof")],
        sign: ["Lines 1 and 2 are correct.", "Compute D for the state with its signs.", caErrorGrader("sign")]
      }
    },

    // 14 · Interaction Builds Entanglement ---------------------------------------------------------------------
    interact: {
      manual: ["t"],
      load(c, check) {
        c.set("w", "π");
        c.field("start").value = { d: "zp", e: "tp" }[check] ?? "pp";
        c.set("t", 0);
      },
      tick(c, dt) {
        let t = c.number("t") + dt * 0.25;
        if (!Number.isFinite(t)) t = 0;
        if (t >= 2) { t = 2; c.s.playing = false; c.say("Playback stopped at t = 2 s."); }
        c.set("t", caTidy(t));
      },
      actions: {
        step(c) {
          let k = Math.round(c.number("t") * 24) + 1;
          if (!Number.isFinite(k) || k > 48) k = 0;
          c.set("t", caTidy(k / 24));
          const m = caInteractModel(c);
          return "Time t = " + caFmt(k / 24) + " s." + (m.ok ? " D = " + caCx([caTidy(m.D[0]), caTidy(m.D[1])]) + ", |D| = " + caFmt(caAbs(m.D)) + "." : "");
        },
        zero(c) { c.set("t", 0); return "Back to t = 0."; }
      },
      show(c) {
        const m = caInteractModel(c);
        if (!m.ok) {
          c.put("state", "Enter a number for J/ℏ, such as π or 2.");
          return { panels: [], caption: "", desc: "" };
        }
        const tidy = z => [caTidy(z[0]), caTidy(z[1])];
        c.put("state", "t = " + caFmt(m.t) + " s, θ = (J/ℏ)t = " + caFmt(m.w * m.t) + " rad. Amplitudes (α00, α01, α10, α11) ≈ (" + m.psi.map(z => caCx(tidy(z))).join(", ") + "). D ≈ " + caCx(tidy(m.D)) + ", |D| ≈ " + caFmt(caAbs(m.D)) + (caAbs(m.D) < 1e-6 ? ": a product state." : ": entangled."));
        return {
          panels: [
            caChart("|D(t)| for this start", { x: [0, 2], y: [0, 0.5], xTicks: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], yTicks: [0, 0.25, 0.5], xLabel: "t in s", weight: 1.35,
              series: [{ pts: caSweep(m.curve, 0, 2, 200), tone: "plus" }], dots: [{ x: m.t, y: caAbs(m.D), tone: "angle", label: "now" }] }),
            caPlane("D in the complex plane", [caArrow(m.D, "angle", "D")], { limit: 0.5, circle: 0.5, weight: 0.65 })
          ],
          caption: "t = " + caFmt(m.t) + " s" + (c.s.playing && !c.reduced() ? " (playing)" : ""),
          desc: "Left: |D| against time from 0 to 2 s, now " + caFmt(caAbs(m.D)) + " at t = " + caFmt(m.t) + " s. Right: D ≈ " + caCx(tidy(m.D)) + " as an arrow in the complex plane, inside a circle of radius 1/2."
        };
      },
      checks: {
        a: ["D(t) = −(i/2) sin 2θ with θ = (J/ℏ)t.", "|sin 2θ| = 1 first at θ = π/4.", c => {
          if (!caInteractLoaded(c)) return caSetup("Use J/ℏ = π rad/s and the |+⟩|+⟩ start. Reopening the mission sets them.");
          const t = c.ans("a-t");
          return caGrade(t > 0 && caRepeats(t, 0.25, 0.5), "|D| isn’t at its peak then. Find θ with sin 2θ = ±1, then t = θ/(J/ℏ).",
            "θ = πt, so |D| = (1/2)|sin 2πt| first reaches 1/2 at t = 1/4 s, and again every 1/2 s after that. At that moment the state is maximally entangled, as entangled as a Bell state.");
        }],
        b: ["At θ = π/4 every amplitude is (1/2)e^(∓iπ/4).", "α00α11 = (1/4)e^(−iπ/2) and α01α10 = (1/4)e^(+iπ/2).", c => {
          if (!caInteractLoaded(c)) return caSetup("Use J/ℏ = π rad/s and the |+⟩|+⟩ start. Reopening the mission sets them.");
          return caGrade(caCxFits(c.cx("b-d"), [0, -0.5]), "Check D. Subtract (1/4)e^(iπ/2) = i/4 from (1/4)e^(−iπ/2) = −i/4.",
            "D = (1/4)(e^(−iπ/2) − e^(iπ/2)) = (1/4)(−i − i) = −i/2. Its size is 1/2, the largest possible.");
        }],
        c: ["D returns to 0 when sin 2θ = 0 again.", "At θ = π/2 the matched kets gain −i and the mismatched kets +i.", c => {
          if (!caInteractLoaded(c)) return caSetup("Use J/ℏ = π rad/s and the |+⟩|+⟩ start. Reopening the mission sets them.");
          if (!caFits(c.ans("c-t"), 0.5)) return caGrade(false, "Check the time: the first t > 0 with sin 2πt = 0.");
          return caGrade(c.choice("c-pick") === "mm", "The time is right. Write out the four amplitudes at θ = π/2 and factor out −i.",
            "At t = 1/2 s, θ = π/2: the amplitudes are (1/2)(−i, i, i, −i) = −i (1/2)(1, −1, −1, 1) = −i |−⟩A ⊗ |−⟩B. D = 0 again: the pair has gone from |+⟩|+⟩ through a maximally entangled state to a different product. At t = 1 s it returns to |+⟩|+⟩ up to a global phase.");
        }],
        d: ["Here a = 1 and b = 0.", "D(t) = −2i abcd sin 2θ.", c => {
          if (c.val("start") !== "zp") return caSetup("Start in |0⟩|+⟩. Reopening the mission sets it.");
          return caGrade(c.choice("d-pick") === "never", "Watch |D| as you play or step: does it ever leave 0?",
            "With A in |0⟩, b = 0 and D(t) = 0 at every time. Z⊗Z acts on |0⟩A ⊗ |v⟩B as |0⟩A ⊗ Z|v⟩B, so the coupling just turns B’s relative phase. Entanglement grows only when A’s value of Z is uncertain.");
        }],
        e: ["D(t) = −2i abcd sin 2θ.", "abcd = (√3/2)(1/2)(1/√2)(1/√2).", c => {
          if (c.val("start") !== "tp") return caSetup("Start in ((√3/2)|0⟩ + (1/2)|1⟩) ⊗ |+⟩. Reopening the mission sets it.");
          return caGrade(caFits(c.ans("e-max"), Math.sqrt(3) / 4), "Check the size. The largest |D| is 2abcd.",
            "abcd = √3/8, so |D| = (√3/4)|sin 2θ| and its largest value is √3/4 ≈ 0.433, reached at t = 1/4 s. That is less than 1/2: A starts unbalanced, P(A = 0) = 3/4, which limits how entangled the pair can get.");
        }]
      }
    }
  };

  const caStations = { ...caStations1, ...caStations2, ...caStations3 };

  function initializeCompositeArcade(root) {
    const details = root.querySelector("#composite-arcade");
    if (!details) return;
    const get = id => root.querySelector("#ca-" + id);
    const select = get("station"), resetButton = get("reset"), status = get("status");
    const reducedBox = get("reduced"), progress = get("progress");
    const figure = get("figure-template").content.firstElementChild.cloneNode(true);
    const toolTemplate = get("mission-template");
    const viewport = figure.querySelector("#ca-viewport");
    const geometry = figure.querySelector("[data-ca-geometry]");
    const labelLayer = figure.querySelector("[data-ca-labels]");
    const desc = figure.querySelector("#ca-desc");
    const title = figure.querySelector("#ca-title");
    const lifetime = new AbortController();
    const listen = (node, type, handler, options = {}) =>
      node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
    const panels = new Map(), cards = new Map(), completion = new Set();
    let active = null, plan = null, motionFrame = null, lastTick = null, disposed = false;

    const say = message => caSetText(status, message ?? "");
    const updateProgress = () => caSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

    for (const panel of root.querySelectorAll("#ca-panels [data-ca-station]")) {
      const key = panel.dataset.caStation;
      const spec = caStations[key];
      if (!spec) continue;
      const fields = new Map([...panel.querySelectorAll("[name]")].map(field => [field.name, field]));
      const defaults = new Map([...fields].map(([name, field]) => [name, field.type === "checkbox" ? field.checked : field.value]));
      const field = name => {
        const input = fields.get(name);
        if (!input) throw new Error("Composite Systems Arcade: no field named " + name + " in station " + key + ".");
        return input;
      };
      const c = {
        key, panel, spec, defaults, field, s: {}, cards: new Map(),
        has: name => fields.has(name),
        node: selector => panel.querySelector(selector),
        val: name => field(name).value,
        checked: name => field(name).checked,
        num: name => Number(field(name).value),
        ans(name) {
          const input = field(name);
          const value = caParse(input.value);
          if (value === null) throw new CaFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2 or 1/√2.", true);
          return value;
        },
        quiet: name => caParse(field(name).value),
        // A box that may hold a fraction, falling back to its paired slider mid-edit.
        number(name) {
          const value = caParse(field(name).value);
          if (value !== null) return value;
          const range = fields.get(name + "-range");
          return range ? Number(range.value) : NaN;
        },
        whole(name, lo = 0) {
          const input = field(name), value = caParse(input.value);
          if (value === null || !Number.isInteger(value) || value < lo) throw new CaFieldError(input, "Enter a whole number" + (lo > 0 ? " of at least " + lo : "") + ".", true);
          return value;
        },
        cx: prefix => [c.ans(prefix + "-re"), c.ans(prefix + "-im")],
        quietCx(prefix) {
          const re = c.quiet(prefix + "-re"), im = c.quiet(prefix + "-im");
          return re === null || im === null ? null : [re, im];
        },
        // A pair ket entered by basis ket: prefix-00 … prefix-11, each with -re and -im.
        ket: prefix => CA_KETS.map(k => c.cx(prefix + "-" + k)),
        quietKet(prefix) {
          const ket = CA_KETS.map(k => c.quietCx(prefix + "-" + k));
          return ket.some(z => z === null) ? null : ket;
        },
        // A real 4×4 grid: prefix-ROW-COL, with ROW and COL basis kets.
        mat4: prefix => CA_KETS.map(r => CA_KETS.map(col => c.ans(prefix + "-" + r + "-" + col))),
        choice(name) {
          const input = field(name);
          if (!input.value) throw new CaFieldError(input, "Choose an option.");
          return input.value;
        },
        // Setting a value also moves any slider paired with that box.
        set(name, value) {
          field(name).value = String(value);
          for (const range of panel.querySelectorAll('[data-ca-pair="' + name + '"]')) range.value = String(value);
        },
        // Fill a complex pair of boxes with exact text, such as "1/√2" and "0".
        setCx(prefix, re, im = "0") { c.set(prefix + "-re", re); c.set(prefix + "-im", im); },
        put(name, text) { caSetText(c.node('[data-ca-read="' + name + '"]'), text); },
        list(name, lines) {
          const list = c.node('[data-ca-log="' + name + '"]');
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
      for (const card of panel.querySelectorAll("[data-ca-mission]")) {
        const id = card.dataset.caMission, check = id.slice(key.length + 1);
        if (!spec.checks[check]) continue;
        card.append(toolTemplate.content.cloneNode(true));
        c.cards.set(check, card);
        cards.set(id, { card, check, id, hints: 0, station: c });
        listen(card, "toggle", () => {
          if (card.open) { c.s.playing = false; spec.load?.(c, check); }
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
      for (const [name] of c.defaults) {
        for (const range of c.panel.querySelectorAll('[data-ca-pair="' + name + '"]')) {
          const value = caParse(c.val(name));
          if (value !== null) range.value = String(value);
        }
      }
      c.s = { revealed: {}, playing: false };
      c.spec.start?.(c);
    }

    function onScreen() {
      if (!details.open || document.hidden || !viewport.isConnected) return false;
      const box = viewport.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
    }

    function refresh() {
      if (!active || !details.open) return;
      plan = active.spec.show(active);
      for (const output of active.panel.querySelectorAll("output[data-ca-for]")) {
        const number = caParse(active.val(output.dataset.caFor));
        caSetText(output, number === null ? "?" : caFmt(number) + (output.dataset.caUnit ?? ""));
      }
      // Play buttons show what a press would do.
      for (const button of active.panel.querySelectorAll('[data-ca-action="play"]')) {
        caSetText(button, active.s.playing && !reduced() ? "Pause" : "Play");
        button.setAttribute("aria-pressed", String(Boolean(active.s.playing && !reduced())));
      }
      caSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
      caSetText(desc, plan.desc || "");
      caPaintSvg(plan, geometry, labelLayer);
      requestMotion();
    }

    // A station with Play ticks only while the arcade is open and on screen and
    // reduced effects are off. It also has a Step button.
    const moving = () => Boolean(active?.spec.tick && active.s.playing && !reduced() && onScreen());
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

    function mount() {
      if (active) active.s.playing = false;
      active = panels.get(select.value) ?? panels.values().next().value;
      for (const c of panels.values()) c.panel.hidden = c !== active;
      active.node("[data-ca-plot-slot]").append(figure);
      lastTick = null;
      refresh();
    }

    function clearCard(card) {
      caSetText(card.querySelector("[data-ca-feedback]"), "");
      const work = card.querySelector("[data-ca-work]");
      work.hidden = true;
      work.open = false;
    }

    function showGrade(mission, result) {
      const { card, id, check, station } = mission;
      const work = card.querySelector("[data-ca-work]");
      caSetText(card.querySelector("[data-ca-feedback]"),
        result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
      caSetText(card.querySelector("[data-ca-work-text]"), result.work || "");
      work.hidden = !result.work;
      work.open = Boolean(result.work) && !result.pass;
      if (result.pass) station.s.revealed[check] = true;
      if (result.pass && !completion.has(id)) {
        completion.add(id);
        card.querySelector("[data-ca-done]").hidden = false;
        updateProgress();
      }
      say("");
    }

    function handleClick(event) {
      const button = event.target.closest("button");
      if (!button || !active || !active.panel.contains(button) || button.disabled) return;
      const missionCard = button.closest("[data-ca-mission]");
      const mission = missionCard ? cards.get(missionCard.dataset.caMission) : null;
      const action = button.dataset.caAction;
      try {
        if (action === "play") {
          if (active.s.playing) { active.s.playing = false; say("Paused."); }
          else if (reduced()) say("Reduced effects are on, so Play stays still. Use Step or the time slider instead.");
          else { active.spec.play?.(active); active.s.playing = true; lastTick = null; say("Playing. Press Pause to stop."); }
        } else if (action) {
          active.s.playing = false;
          const message = active.spec.actions[action](active, mission?.check ?? null);
          if (mission) caSetText(mission.card.querySelector("[data-ca-feedback]"), message ?? "");
          else if (message !== null) say(message);
        } else if (mission && button.hasAttribute("data-ca-check")) {
          showGrade(mission, active.spec.checks[mission.check][2](active));
        } else if (mission && button.hasAttribute("data-ca-hint")) {
          if (mission.hints >= 2) return;
          const list = mission.card.querySelector("[data-ca-hint-list]");
          const item = document.createElement("li");
          caSetText(item, active.spec.checks[mission.check][mission.hints]);
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
        if (!(error instanceof CaFieldError)) throw error;
        if (mission) caSetText(mission.card.querySelector("[data-ca-feedback]"), error.message);
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
      if (target.dataset.caPair) active.field(target.dataset.caPair).value = target.value;
      else for (const range of active.panel.querySelectorAll('[data-ca-pair="' + target.name + '"]')) {
        const value = caParse(target.value);
        if (value !== null) range.value = String(value);
      }
      const missionCard = target.closest("[data-ca-mission]");
      if (missionCard) clearCard(missionCard);
      // Moving the clock by hand pauses playback.
      if (active.s.playing && active.spec.manual?.includes(target.dataset.caPair ?? target.name)) active.s.playing = false;
      active.spec.edit?.(active, target.name, event.type);
      refresh();
    }

    listen(details, "click", handleClick);
    listen(details, "input", handleEdit);
    listen(details, "change", handleEdit);
    listen(details, "toggle", () => {
      if (details.open) refresh();
      else if (active) active.s.playing = false;
    });
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
      if (active?.s.playing && reduced()) {
        active.s.playing = false;
        say("Reduced effects are on, so playback stopped. Use Step or the time slider instead.");
      }
      refresh();
    };
    listen(reducedBox, "change", settle);
    if (motionQuery?.addEventListener) listen(motionQuery, "change", settle);
    listen(root.querySelector("#ca-arcade-link"), "click", () => { details.open = true; });
    const wake = () => requestMotion();
    listen(document, "visibilitychange", () => { if (!document.hidden) wake(); });
    listen(window, "scroll", wake, { passive: true });
    listen(window, "pageshow", wake);
    listen(window, "pagehide", event => {
      if (motionFrame !== null) cancelAnimationFrame(motionFrame);
      motionFrame = null;
      lastTick = null;
      if (event.persisted) return;
      disposed = true;
      lifetime.abort();
    });

    select.disabled = false;
    resetButton.disabled = false;
    reducedBox.disabled = false;
    updateProgress();
    mount();
    if (location.hash === "#composite-arcade") details.open = true;
  }
  // ---------------------------------------------------------------------------
  // SVG drawing. The viewBox is 560 × 300 and labels always stay in SVG.
  // ---------------------------------------------------------------------------

  function caNode(name, attributes = {}, text = "") {
    const node = document.createElementNS(CA_SVG, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    }
    if (text) node.textContent = text;
    return node;
  }

  function caPaintSvg(plan, geometry, labels) {
    const shapes = [], words = [];
    if (plan.panels) caDrawPanels(plan.panels, shapes, words);
    geometry.replaceChildren(...shapes);
    labels.replaceChildren(...words);
  }

  function caDrawPanels(panels, shapes, words) {
    const total = panels.reduce((sum, panel) => sum + (panel.weight ?? 1), 0);
    let x = 0;
    for (const panel of panels) {
      const box = { x, w: 560 * (panel.weight ?? 1) / total };
      if (panel.kind === "plane") caDrawPlane(panel, box, shapes, words);
      else if (panel.kind === "chart") caDrawChart(panel, box, shapes, words);
      else if (panel.kind === "bars") caDrawBars(panel, box, shapes, words);
      else if (panel.kind === "matrix") caDrawMatrix(panel, box, shapes, words);
      else if (panel.kind === "chain") caDrawChain(panel, box, shapes, words);
      else if (panel.kind === "grid") caDrawGrid(panel, box, shapes, words);
      else if (panel.kind === "map") caDrawMap(panel, box, shapes, words);
      else if (panel.kind === "circuit") caDrawCircuit(panel, box, shapes, words);
      x += box.w;
    }
  }

  // Boxes joined by arrows, each with a line of detail.
  function caDrawChain(chain, box, shapes, words) {
    const n = chain.items.length, left = box.x + 10, right = box.x + box.w - 10;
    const slot = (right - left) / n, w = Math.min(slot - 22, 200), cy = 140, h = 74;
    words.push(caNode("text", { class: "ca-caption", x: (left + right) / 2, y: 40, "text-anchor": "middle" }, chain.caption));
    chain.items.forEach((item, k) => {
      const cx = left + slot * (k + 0.5);
      shapes.push(caNode("rect", { class: "ca-part", "data-tone": item.tone, x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 7 }));
      words.push(caNode("text", { class: "ca-label", "data-tone": item.tone, x: cx, y: cy - 8, "text-anchor": "middle" }, item.title));
      if (item.sub) words.push(caNode("text", { class: "ca-tick", x: cx, y: cy + 16, "text-anchor": "middle" }, item.sub));
      if (k < n - 1) {
        const x1 = cx + w / 2 + 3, x2 = cx + slot - w / 2 - 5;
        shapes.push(caNode("line", { class: "ca-arrow", "data-tone": "guide", x1, y1: cy, x2: x2 - 6, y2: cy }));
        shapes.push(caNode("polygon", { class: "ca-head", "data-tone": "guide", points: x2 + "," + cy + " " + (x2 - 8) + "," + (cy - 5) + " " + (x2 - 8) + "," + (cy + 5) }));
      }
    });
    if (chain.note) words.push(caNode("text", { class: "ca-tick", x: (left + right) / 2, y: 270, "text-anchor": "middle" }, chain.note));
  }

  function caLabel(words, text, x, y, tone, anchor = "middle", extra = {}) {
    // Keep the whole label inside the 560-wide viewBox (about 8.5 px per character).
    const span = text.length * 8.5;
    const left = anchor === "start" ? x : anchor === "end" ? x - span : x - span / 2;
    if (left + span > 556) { x = 556; anchor = "end"; }
    else if (left < 4) { x = 4; anchor = "start"; }
    words.push(caNode("text", { class: "ca-label", "data-tone": tone, x, y, "text-anchor": anchor, ...extra }, text));
  }

  function caDrawPlane(plane, box, shapes, words) {
    const size = Math.min(box.w - 20, 238), half = size / 2, cx = box.x + box.w / 2, cy = 166;
    const limit = plane.limit ?? 1, unit = (half - 10) / limit;
    const X = re => cx + re * unit, Y = im => cy - im * unit;
    shapes.push(caNode("rect", { class: "ca-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
    const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
    let grid = "";
    for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
      if (k === 0) continue;
      const v = k * step;
      grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
    }
    shapes.push(caNode("path", { class: "ca-grid", d: grid }));
    shapes.push(caNode("path", { class: "ca-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
    if (size > 150) {
      words.push(caNode("text", { class: "ca-tick", x: X(limit) - 2, y: cy + 14, "text-anchor": "end" }, plane.axes?.[0] ?? "Re"));
      words.push(caNode("text", { class: "ca-tick", x: cx + 5, y: Y(limit) + 10, "text-anchor": "start" }, plane.axes?.[1] ?? "Im"));
    }
    words.push(caNode("text", { class: "ca-caption", "data-tone": plane.tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
    const rings = [...(plane.circle ? [{ c: [0, 0], r: plane.circle, tone: "guide" }] : []), ...(plane.circles ?? [])];
    for (const ring of rings) {
      if (ring.r > 0) shapes.push(caNode("circle", { class: "ca-ring", "data-tone": ring.tone ?? "guide", cx: X(ring.c[0]), cy: Y(ring.c[1]), r: ring.r * unit }));
    }
    for (const path of plane.paths ?? []) {
      shapes.push(caNode("polyline", { class: "ca-curve" + (path.dashed ? " ca-dashed" : ""), "data-tone": path.tone,
        points: path.pts.map(([re, im]) => X(re).toFixed(1) + "," + Y(im).toFixed(1)).join(" ") }));
    }
    for (const item of plane.items) {
      const from = item.from ?? [0, 0];
      const fx = X(from[0]), fy = Y(from[1]);
      const [re, im] = caAdd(from, item.z);
      const reach = Math.max(Math.abs(re), Math.abs(im));
      const clip = reach > limit ? limit / reach : 1;
      const ex = X(re * clip), ey = Y(im * clip);
      const length = Math.hypot(ex - fx, ey - fy);
      if (item.dot || length < 3) {
        shapes.push(caNode("circle", { class: "ca-dot" + (item.hollow || length < 3 ? " ca-hollow" : ""), "data-tone": item.tone, cx: ex, cy: ey, r: item.dot ? item.size ?? 4.5 : 5 }));
      } else {
        const ux = (ex - fx) / length, uy = (ey - fy) / length, depth = Math.min(item.thin ? 9 : 13, length * 0.6), wing = depth * 0.42;
        const bx = ex - ux * depth, by = ey - uy * depth;
        shapes.push(caNode("line", { class: "ca-arrow" + (item.dashed ? " ca-dashed" : "") + (item.thin ? " ca-thin" : "") + (item.wide ? " ca-wide" : ""), "data-tone": item.tone, x1: fx, y1: fy, x2: bx, y2: by }));
        shapes.push(caNode("polygon", { class: "ca-head" + (item.dashed ? " ca-hollow" : ""), "data-tone": item.tone,
          points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
      }
      if (item.label) {
        const ux = (ex - fx) / (length || 1), uy = (ey - fy) / (length || 1);
        const away = length < 3 ? [10, -10] : [ux * 12 + uy * 9, uy * 12 - ux * 9];
        const anchor = Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end";
        caLabel(words, item.label + (clip < 1 ? " (off scale)" : ""), ex + away[0], ey + away[1] + 4, item.tone, anchor);
      }
    }
  }

  function caDrawChart(chart, box, shapes, words) {
    const left = box.x + 46, right = box.x + box.w - 16, top = 40, bottom = 246;
    const [x0, x1] = chart.x, [y0, y1] = chart.y;
    const X = v => left + (v - x0) / (x1 - x0) * (right - left);
    const Y = v => bottom - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0) * (bottom - top);
    shapes.push(caNode("rect", { class: "ca-frame", x: left, y: top, width: right - left, height: bottom - top }));
    let grid = "";
    for (const v of chart.xTicks) grid += "M" + X(v) + " " + top + "V" + bottom;
    for (const v of chart.yTicks) grid += "M" + left + " " + Y(v) + "H" + right;
    shapes.push(caNode("path", { class: "ca-grid", d: grid }));
    const zeroY = y0 < 0 && y1 > 0 ? Y(0) : bottom;
    shapes.push(caNode("path", { class: "ca-axis", d: "M" + left + " " + top + "V" + bottom + "M" + left + " " + zeroY + "H" + right }));
    const every = Math.max(1, Math.ceil(chart.xTicks.length * 34 / (right - left)));
    chart.xTicks.forEach((v, k) => {
      if (k % every === 0) words.push(caNode("text", { class: "ca-tick", x: X(v), y: bottom + 16, "text-anchor": "middle" }, chart.xTickText?.[k] ?? caFmt(v)));
    });
    for (const v of chart.yTicks) words.push(caNode("text", { class: "ca-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, caFmt(v)));
    words.push(caNode("text", { class: "ca-tick", x: (left + right) / 2, y: bottom + 36, "text-anchor": "middle" }, chart.xLabel));
    words.push(caNode("text", { class: "ca-caption", x: (left + right) / 2, y: top - 12, "text-anchor": "middle" }, chart.caption));
    for (const h of chart.hlines ?? []) {
      shapes.push(caNode("line", { class: "ca-ray", "data-tone": h.tone ?? "angle", x1: left, y1: Y(h.y), x2: right, y2: Y(h.y) }));
      if (h.label) caLabel(words, h.label, right - 4, Y(h.y) - 6, h.tone ?? "angle", "end");
    }
    for (const v of chart.vlines ?? []) {
      if (v.x < x0 - 1e-9 || v.x > x1 + 1e-9) continue;
      shapes.push(caNode("line", { class: "ca-ray" + (v.dashed ? "" : " ca-solid"), "data-tone": v.tone ?? "angle", x1: X(v.x), y1: top, x2: X(v.x), y2: bottom }));
      if (v.label) caLabel(words, v.label, X(v.x) + 4, top + 14, v.tone ?? "angle", "start");
    }
    for (const series of chart.series ?? []) {
      shapes.push(caNode("polyline", { class: "ca-curve" + (series.dashed ? " ca-dashed" : ""), "data-tone": series.tone,
        points: series.pts.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join(" ") }));
      if (series.label) {
        const [lx, ly] = series.labelAt ?? series.pts.at(-1);
        caLabel(words, series.label, X(lx) + (series.labelDx ?? 6), Y(ly) + (series.labelDy ?? -6), series.tone, series.labelAnchor ?? "start");
      }
    }
    for (const dot of chart.dots ?? []) {
      if (dot.x < x0 - 1e-9 || dot.x > x1 + 1e-9) continue;
      shapes.push(caNode("circle", { class: "ca-dot" + (dot.hollow ? " ca-hollow" : ""), "data-tone": dot.tone, cx: X(dot.x), cy: Y(dot.y), r: dot.r ?? 5 }));
      if (dot.label) caLabel(words, dot.label, X(dot.x) + 8, Y(dot.y) - 8, dot.tone, "start");
    }
  }

  function caDrawBars(bars, box, shapes, words) {
    const left = box.x + 40, right = box.x + box.w - 10, top = 48, bottom = 246, max = bars.max ?? 1;
    const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
    let grid = "";
    for (const v of [0, max / 2, max]) {
      grid += "M" + left + " " + Y(v) + "H" + right;
      words.push(caNode("text", { class: "ca-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, caFmt(v)));
    }
    shapes.push(caNode("path", { class: "ca-grid", d: grid }));
    shapes.push(caNode("path", { class: "ca-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
    words.push(caNode("text", { class: "ca-caption", x: (left + right) / 2, y: top - 22, "text-anchor": "middle" }, bars.caption));
    const slot = (right - left) / bars.items.length;
    bars.items.forEach((bar, index) => {
      const x = left + slot * index + slot * 0.2, w = slot * 0.6, y = Y(bar.value);
      shapes.push(caNode("rect", { class: "ca-bar" + (bar.outline ? " ca-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: Math.max(0, bottom - y) }));
      words.push(caNode("text", { class: "ca-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 20, "text-anchor": "middle" }, bar.label));
      words.push(caNode("text", { class: "ca-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top - 4, y - 8), "text-anchor": "middle" }, bar.text ?? caFmt(bar.value)));
    });
  }

  // A matrix drawn as text between square brackets. Entries are strings.
  function caDrawMatrix(panel, box, shapes, words) {
    const rows = panel.rows, n = rows.length, m = rows[0].length;
    const longest = Math.max(...rows.flat().map(text => text.length), 1);
    const cell = Math.min((box.w - 40) / m, Math.max(44, longest * 9 + 16)), height = Math.min(52, 190 / n);
    const cx = box.x + box.w / 2, cy = 160, w = cell * m, h = height * n;
    const left = cx - w / 2, top = cy - h / 2;
    words.push(caNode("text", { class: "ca-caption", "data-tone": panel.tone, x: cx, y: top - 22, "text-anchor": "middle" }, panel.caption));
    const bracket = (x, dir) => "M" + (x + dir * 9) + " " + (top - 6) + "H" + x + "V" + (top + h + 6) + "H" + (x + dir * 9);
    shapes.push(caNode("path", { class: "ca-axis", d: bracket(left - 4, 1) + bracket(left + w + 4, -1) }));
    rows.forEach((row, i) => row.forEach((text, j) => {
      const tone = panel.tones?.[i]?.[j] ?? panel.tone ?? "ink";
      words.push(caNode("text", { class: "ca-label", "data-tone": tone, x: left + cell * (j + 0.5), y: top + height * (i + 0.5) + 5, "text-anchor": "middle" }, text));
    }));
    if (panel.note) words.push(caNode("text", { class: "ca-tick", x: cx, y: Math.min(286, top + h + 34), "text-anchor": "middle" }, panel.note));
  }

  // A 2×2 amplitude grid: A's bit down the side, B's bit across the top. A cell's
  // fill shows its probability, a small arrow its phase, and its text the value.
  function caDrawGrid(grid, box, shapes, words) {
    const size = Math.min(box.w - 84, 196), cell = size / 2;
    const left = box.x + (box.w - size) / 2 + 24, top = 76;
    words.push(caNode("text", { class: "ca-caption", "data-tone": grid.tone, x: left + size / 2 - 12, y: 30, "text-anchor": "middle" }, grid.caption));
    grid.cols.forEach((text, j) => words.push(caNode("text", { class: "ca-tick", x: left + cell * (j + 0.5), y: top - 10, "text-anchor": "middle" }, text)));
    grid.rows.forEach((text, i) => words.push(caNode("text", { class: "ca-tick", x: left - 8, y: top + cell * (i + 0.5) + 4, "text-anchor": "end" }, text)));
    grid.cells.forEach((item, k) => {
      const i = k >> 1, j = k & 1, x = left + cell * j, y = top + cell * i;
      const dim = grid.focus !== undefined && grid.focus !== null && grid.focus !== i;
      shapes.push(caNode("rect", { class: "ca-frame", x, y, width: cell, height: cell }));
      const fill = caClamp(item.fill ?? 0, 0, 1);
      if (fill > 1e-6) {
        const side = (cell - 8) * Math.sqrt(fill);
        shapes.push(caNode("rect", { class: "ca-part" + (dim ? " ca-dim" : ""), "data-tone": item.tone, x: x + (cell - side) / 2, y: y + (cell - side) / 2, width: side, height: side, rx: 3 }));
      }
      if (item.z && caAbs(item.z) > 1e-6 && cell >= 84) {
        const cx = x + cell - 18, cy = y + 18, r = 11, u = caScale(item.z, 1 / caAbs(item.z));
        shapes.push(caNode("circle", { class: "ca-ring", "data-tone": "guide", cx, cy, r }));
        shapes.push(caNode("line", { class: "ca-arrow ca-thin", "data-tone": item.tone, x1: cx, y1: cy, x2: cx + r * u[0], y2: cy - r * u[1] }));
      }
      words.push(caNode("text", { class: "ca-tick", x: x + 6, y: y + 15, "text-anchor": "start" }, item.tag ?? ""));
      words.push(caNode("text", { class: "ca-label" + (dim ? " ca-dim" : ""), "data-tone": item.tone, x: x + cell / 2, y: y + cell / 2 + 6, "text-anchor": "middle" }, item.text ?? ""));
      if (item.sub) words.push(caNode("text", { class: "ca-tick", x: x + cell / 2, y: y + cell - 10, "text-anchor": "middle" }, item.sub));
    });
    if (grid.focus !== undefined && grid.focus !== null) {
      shapes.push(caNode("rect", { class: "ca-ring", "data-tone": "angle", x: left - 3, y: top + cell * grid.focus - 3, width: size + 6, height: cell + 6, rx: 4 }));
    }
    if (grid.cross) {
      shapes.push(caNode("line", { class: "ca-ray ca-solid", "data-tone": "plus", x1: left + 12, y1: top + 12, x2: left + size - 12, y2: top + size - 12 }));
      shapes.push(caNode("line", { class: "ca-ray", "data-tone": "warn", x1: left + size - 12, y1: top + 12, x2: left + 12, y2: top + size - 12 }));
    }
    if (grid.margins) {
      grid.margins.rows?.forEach((text, i) => words.push(caNode("text", { class: "ca-tick", x: left + size + 8, y: top + cell * (i + 0.5) + 4, "text-anchor": "start" }, text)));
      grid.margins.cols?.forEach((text, j) => words.push(caNode("text", { class: "ca-tick", x: left + cell * (j + 0.5), y: top + size + 18, "text-anchor": "middle" }, text)));
    }
    if (grid.note) words.push(caNode("text", { class: "ca-tick", x: left + size / 2, y: 292, "text-anchor": "middle" }, grid.note));
  }

  // Two columns of labels joined by lines: links are [from, to, tone].
  function caDrawMap(map, box, shapes, words) {
    const left = box.x + box.w * 0.34, right = box.x + box.w * 0.6, top = 92;
    const n = Math.max(map.left.length, map.right.length), gap = Math.min(52, 196 / Math.max(1, n - 1));
    const Y = k => top + gap * k;
    words.push(caNode("text", { class: "ca-caption", x: (left + right) / 2, y: 30, "text-anchor": "middle" }, map.caption));
    if (map.heads) {
      words.push(caNode("text", { class: "ca-tick", x: left - 8, y: 62, "text-anchor": "end" }, map.heads[0]));
      words.push(caNode("text", { class: "ca-tick", x: right + 8, y: 62, "text-anchor": "start" }, map.heads[1]));
    }
    for (const [from, to, tone] of map.links) {
      shapes.push(caNode("line", { class: "ca-arrow ca-thin", "data-tone": tone ?? "guide", x1: left, y1: Y(from) - 5, x2: right, y2: Y(to) - 5 }));
    }
    map.left.forEach((item, k) => words.push(caNode("text", { class: "ca-label", "data-tone": item.tone, x: left - 8, y: Y(k), "text-anchor": "end" }, item.text)));
    map.right.forEach((item, k) => words.push(caNode("text", { class: "ca-label", "data-tone": item.tone, x: right + 8, y: Y(k), "text-anchor": "start" }, item.text)));
    if (map.note) words.push(caNode("text", { class: "ca-tick", x: (left + right) / 2, y: 290, "text-anchor": "middle" }, map.note));
  }

  // A two-wire circuit. Gates: { wire: "A" | "B", label } boxes, or { cnot: true }
  // with its control dot on A and ⊕ on B.
  function caDrawCircuit(circuit, box, shapes, words) {
    const left = box.x + 34, right = box.x + box.w - 24, yA = 120, yB = 210;
    words.push(caNode("text", { class: "ca-caption", x: (left + right) / 2, y: 36, "text-anchor": "middle" }, circuit.caption));
    for (const [y, name, input, output] of [[yA, "A", circuit.inA, circuit.outA], [yB, "B", circuit.inB, circuit.outB]]) {
      shapes.push(caNode("line", { class: "ca-axis", x1: left, y1: y, x2: right, y2: y }));
      words.push(caNode("text", { class: "ca-label", "data-tone": name === "A" ? "alpha" : "beta", x: left - 8, y: y + 5, "text-anchor": "end" }, name));
      if (input) words.push(caNode("text", { class: "ca-tick", x: left + 4, y: y - 14, "text-anchor": "start" }, input));
      if (output) words.push(caNode("text", { class: "ca-tick", x: right, y: y - 14, "text-anchor": "end" }, output));
    }
    const n = circuit.gates.length;
    circuit.gates.forEach((gate, k) => {
      const x = left + (right - left) * (k + 1.4) / (n + 1.4);
      if (gate.cnot) {
        shapes.push(caNode("line", { class: "ca-arrow ca-thin", "data-tone": "angle", x1: x, y1: yA, x2: x, y2: yB + 14 }));
        shapes.push(caNode("circle", { class: "ca-dot", "data-tone": "angle", cx: x, cy: yA, r: 6 }));
        shapes.push(caNode("circle", { class: "ca-ring ca-solid", "data-tone": "angle", cx: x, cy: yB, r: 14 }));
        shapes.push(caNode("line", { class: "ca-arrow ca-thin", "data-tone": "angle", x1: x - 14, y1: yB, x2: x + 14, y2: yB }));
        words.push(caNode("text", { class: "ca-tick", x, y: yB + 36, "text-anchor": "middle" }, gate.label ?? "CNOT"));
      } else {
        const y = gate.wire === "A" ? yA : yB;
        shapes.push(caNode("rect", { class: "ca-part", "data-tone": gate.tone ?? "minus", x: x - 20, y: y - 20, width: 40, height: 40, rx: 5 }));
        words.push(caNode("text", { class: "ca-label", "data-tone": "ink", x, y: y + 5, "text-anchor": "middle" }, gate.label));
      }
    });
    if (circuit.note) words.push(caNode("text", { class: "ca-tick", x: box.x + box.w / 2, y: 270, "text-anchor": "middle" }, circuit.note));
  }

  if (lesson) initializeCompositeArcade(lesson);
} catch (error) {
  console.error("Composite Systems Arcade could not start.", error);
}
