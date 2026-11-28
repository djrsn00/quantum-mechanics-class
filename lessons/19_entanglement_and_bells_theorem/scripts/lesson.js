const INPUT_PAIRS = [[0, 0], [0, 1], [1, 0], [1, 1]];
const SIGN_PAIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALICE_AXES = [0, 90];
const BOB_AXES = [225, 135];
const MODES = ["classical", "quantum"];
const PAIR_KEYS = INPUT_PAIRS.map(pair => pair.join(""));

const QUIZ_FEEDBACK = {
  "higher-bound": "Eight out of ten is the observed rate. The all-zero table wins on three of the four equally likely input pairs, so its expected rate is exactly 75%.",
  quantum: "This score can come from the all-zero classical table. For example, if only two of the ten draws are input pair 11, the table wins the other eight.",
  sample: "Correct. The run observed 80%, while the all-zero strategy has an expected rate of 75%. The mix of input pairs varies from one finite run to another."
};

function predictPair(strategy, x, y) {
  const required = x & y;

  if (strategy.mode === "classical") {
    // Each reply uses only that player's input and committed table.
    const a = strategy.alice[x];
    const b = strategy.bob[y];
    const actual = a ^ b;
    return {
      required, a, b, actual,
      correlation: actual === 0 ? 1 : -1,
      winProbability: Number(actual === required)
    };
  }

  const alpha = ALICE_AXES[x];
  const beta = BOB_AXES[y];
  const delta = (alpha - beta) * Math.PI / 180;
  const correlation = -Math.cos(delta);
  const probabilities = SIGN_PAIRS.map(([u, v]) => (1 + u * v * correlation) / 4);
  const winProbability = required === 0
    ? probabilities[0] + probabilities[3]
    : probabilities[1] + probabilities[2];

  return { required, alpha, beta, correlation, probabilities, winProbability };
}

function predictStrategy(strategy) {
  const pairs = INPUT_PAIRS.map(([x, y]) => predictPair(strategy, x, y));
  const [e00, e01, e10, e11] = pairs.map(pair => pair.correlation);
  const chsh = e00 + e01 + e10 - e11;
  return { pairs, chsh, winProbability: 0.5 + chsh / 8 };
}

function sampleSignPair(probabilities, random) {
  const sample = random();
  let cumulative = 0;

  // Assign the final interval to the final pair, including floating-point residue.
  for (let index = 0; index < probabilities.length - 1; index += 1) {
    cumulative += probabilities[index];
    if (sample < cumulative) return SIGN_PAIRS[index];
  }

  return SIGN_PAIRS[SIGN_PAIRS.length - 1];
}

function playRound(strategy, random = Math.random) {
  const x = Number(random() >= 0.5);
  const y = Number(random() >= 0.5);
  const prediction = predictPair(strategy, x, y);
  let { a, b } = prediction;

  if (strategy.mode === "quantum") {
    const [u, v] = sampleSignPair(prediction.probabilities, random);
    a = Number(u === -1);
    b = Number(v === -1);
  }

  const required = prediction.required;
  const actual = a ^ b;
  return { x, y, a, b, required, actual, won: actual === required };
}

function percent(probability) {
  return Number((100 * probability).toFixed(2)) + "%";
}

function signed(value) {
  const magnitude = Math.abs(value);
  const sign = value < 0 ? "−" : "+";
  return Number.isInteger(magnitude)
    ? sign + magnitude
    : "≈ " + sign + magnitude.toFixed(4);
}

function parityLabel(bit) {
  return bit === 0 ? "0 (match)" : "1 (differ)";
}

function parityVerb(bit) {
  return bit === 0 ? "match" : "differ";
}

function describeRound(round) {
  const outcome = round.won ? "Win." : "Loss.";
  return outcome + " Inputs " + round.x + round.y + " require the outputs to "
    + parityVerb(round.required) + ". The outputs " + round.a + round.b
    + " " + parityVerb(round.actual) + ".";
}

function initializeLesson(root) {
  const ids = [
    "game-controls", "mode", "classical-controls", "quantum-note",
    "a0", "a1", "b0", "b1", "play-one", "play-batch", "reset", "static-note",
    "rounds", "wins", "losses", "observed", "theory", "chsh", "run-status",
    "last-x", "last-y", "last-a", "last-b", "last-required", "last-actual", "last-explanation",
    "inspect", "inspect-required", "inspect-win", "inspect-classical", "inspect-quantum",
    "inspect-a", "inspect-b", "inspect-result", "inspect-alpha", "inspect-beta",
    "inspect-e", "inspect-status", "p-00", "p-01", "p-10", "p-11",
    "quiz", "quiz-controls", "quiz-retry", "quiz-feedback"
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, root.querySelector("#bell-" + id)]));
  if (Object.values(nodes).some(node => !node)) return;

  const pairCells = PAIR_KEYS.map(pair =>
    root.querySelector('[data-bell-pair="' + pair + '"] .bell-pair-prediction')
  );
  const replies = [
    { node: nodes.a0, player: "alice", input: 0 },
    { node: nodes.a1, player: "alice", input: 1 },
    { node: nodes.b0, player: "bob", input: 0 },
    { node: nodes.b1, player: "bob", input: 1 }
  ];
  const quizInputs = [...nodes.quiz.querySelectorAll('input[type="radio"][name="bell-quiz-answer"]')];

  function hasValues(controls, values) {
    return controls.length === values.length
      && values.every(value => controls.some(control => control.value === value));
  }

  function hasOptions(node, values) {
    return node.tagName === "SELECT" && hasValues([...node.options], values);
  }

  if (
    nodes["game-controls"].tagName !== "FIELDSET" ||
    nodes["quiz-controls"].tagName !== "FIELDSET" ||
    nodes.quiz.tagName !== "FORM" ||
    !hasOptions(nodes.mode, MODES) ||
    !hasOptions(nodes.inspect, PAIR_KEYS) ||
    replies.some(({ node }) => !hasOptions(node, ["0", "1"])) ||
    pairCells.some(cell => !cell) ||
    !hasValues(quizInputs, Object.keys(QUIZ_FEEDBACK))
  ) return;

  const strategy = { mode: "classical", alice: [0, 0], bob: [0, 0] };
  let inspected = "00";
  let rounds = 0;
  let wins = 0;
  let lastRound = null;
  let theory = predictStrategy(strategy);

  function write(id, value) {
    nodes[id].textContent = String(value);
  }

  function renderInspector() {
    const prediction = theory.pairs[PAIR_KEYS.indexOf(inspected)];
    const isQuantum = strategy.mode === "quantum";

    nodes.inspect.value = inspected;
    nodes["inspect-classical"].hidden = isQuantum;
    nodes["inspect-quantum"].hidden = !isQuantum;
    write("inspect-required", parityLabel(prediction.required));
    write("inspect-win", percent(prediction.winProbability));

    if (isQuantum) {
      write("inspect-alpha", prediction.alpha + "°");
      write("inspect-beta", prediction.beta + "°");
      write("inspect-e", signed(prediction.correlation));
      PAIR_KEYS.forEach((key, index) => {
        write("p-" + key, percent(prediction.probabilities[index]));
      });
    } else {
      write("inspect-a", prediction.a);
      write("inspect-b", prediction.b);
      const result = prediction.winProbability === 1 ? "Win." : "Loss.";
      write("inspect-result", result + " Actual parity is " + parityLabel(prediction.actual) + ".");
    }
  }

  function renderStrategy() {
    const isQuantum = strategy.mode === "quantum";
    nodes.mode.value = strategy.mode;
    nodes["classical-controls"].hidden = isQuantum;
    nodes["quantum-note"].hidden = !isQuantum;
    for (const { node, player, input } of replies) {
      node.value = String(strategy[player][input]);
      node.disabled = isQuantum;
    }

    pairCells.forEach((cell, index) => {
      const chance = theory.pairs[index].winProbability;
      const verdict = chance === 1 ? " · Win" : " · Loss";
      cell.textContent = percent(chance) + (isQuantum ? "" : verdict);
    });

    write("theory", percent(theory.winProbability));
    write("chsh", signed(theory.chsh));
    renderInspector();
  }

  function renderRun() {
    write("rounds", rounds);
    write("wins", wins);
    write("losses", rounds - wins);
    write("observed", rounds === 0 ? "—" : percent(wins / rounds));

    for (const key of ["x", "y", "a", "b"]) {
      write("last-" + key, lastRound?.[key] ?? "—");
    }
    write("last-required", lastRound ? parityLabel(lastRound.required) : "—");
    write("last-actual", lastRound ? parityLabel(lastRound.actual) : "—");
    write("last-explanation", lastRound ? describeRound(lastRound) : "No rounds played yet.");
  }

  function startNewRun(message) {
    rounds = 0;
    wins = 0;
    lastRound = null;
    theory = predictStrategy(strategy);
    renderStrategy();
    renderRun();
    write("inspect-status", "");
    write("run-status", message);
  }

  function play(count) {
    // Copy the response table before drawing either input.
    const committed = {
      mode: strategy.mode,
      alice: [...strategy.alice],
      bob: [...strategy.bob]
    };
    let newWins = 0;
    for (let index = 0; index < count; index += 1) {
      lastRound = playRound(committed);
      newWins += Number(lastRound.won);
    }

    rounds += count;
    wins += newWins;
    renderRun();

    const message = count === 1
      ? "Round " + rounds + ". " + describeRound(lastRound)
      : "Played " + count + " rounds. " + newWins + " wins and " + (count - newWins)
        + " losses in this batch. Run win rate " + percent(wins / rounds) + ".";
    write("run-status", message);
  }

  nodes.mode.addEventListener("change", () => {
    const mode = nodes.mode.value;
    if (!MODES.includes(mode)) {
      nodes.mode.value = strategy.mode;
      return;
    }
    if (mode === strategy.mode) return;

    strategy.mode = mode;
    const label = mode === "quantum" ? "Quantum singlet" : "Classical response table";
    startNewRun(label + " selected. Round counts cleared.");
  });

  for (const { node, player, input } of replies) {
    node.addEventListener("change", () => {
      const value = node.value;
      if (strategy.mode !== "classical" || (value !== "0" && value !== "1")) {
        node.value = String(strategy[player][input]);
        return;
      }

      const bit = Number(value);
      if (bit === strategy[player][input]) return;

      strategy[player][input] = bit;
      startNewRun("Classical reply changed. Round counts cleared.");
    });
  }

  nodes.inspect.addEventListener("change", () => {
    const selected = nodes.inspect.value;
    if (!PAIR_KEYS.includes(selected)) {
      nodes.inspect.value = inspected;
      return;
    }
    if (selected === inspected) return;

    inspected = selected;
    const prediction = theory.pairs[PAIR_KEYS.indexOf(inspected)];
    renderInspector();
    write("inspect-status", "Inspecting input pair " + inspected + ". To win, outputs must "
      + parityVerb(prediction.required) + ". Win probability " + percent(prediction.winProbability) + ".");
  });

  nodes["play-one"].addEventListener("click", () => play(1));
  nodes["play-batch"].addEventListener("click", () => play(100));
  nodes.reset.addEventListener("click", () => {
    strategy.mode = "classical";
    strategy.alice = [0, 0];
    strategy.bob = [0, 0];
    inspected = "00";
    startNewRun("Reset to the all-zero classical table, inspector pair 00, and zero rounds.");
  });

  nodes.quiz.addEventListener("change", () => write("quiz-feedback", ""));
  nodes.quiz.addEventListener("submit", event => {
    event.preventDefault();
    const answer = quizInputs.find(input => input.checked)?.value;
    if (!Object.hasOwn(QUIZ_FEEDBACK, answer)) {
      write("quiz-feedback", "Choose one answer first.");
      quizInputs[0].focus();
      return;
    }

    write("quiz-feedback", QUIZ_FEEDBACK[answer]);
    nodes["quiz-retry"].hidden = false;
  });

  nodes["quiz-retry"].addEventListener("click", () => {
    nodes.quiz.reset();
    write("quiz-feedback", "");
    nodes["quiz-retry"].hidden = true;
    quizInputs[0].focus();
  });

  nodes.quiz.reset();
  renderStrategy();
  renderRun();
  nodes["game-controls"].disabled = false;
  nodes.inspect.disabled = false;
  nodes["quiz-controls"].disabled = false;
  nodes["static-note"].hidden = true;
}

const lesson = document.querySelector(".site-main.bell-lesson");
if (lesson) initializeLesson(lesson);

// ===========================================================================
// Entanglement Arcade (optional practice). Everything below uses the eb-
// prefix so it never touches the CHSH lab above, which uses bell-. The whole
// arcade runs inside one try block: if anything in it fails, the lab keeps
// working. Alice is always first and Bob second, signs map +1 → 0 and −1 → 1,
// and angles are in degrees in the X–Z plane, measured from +z toward +x.
// ===========================================================================

try {
  const EB_TOLERANCE = 0.002;  // typed answers, per real or imaginary part
  const EB_DERIVED = 0.005;    // probabilities of a state you build
  const EB_SVG = "http://www.w3.org/2000/svg";
  const EB_TURN = 2 * Math.PI;
  const EB_KETS = ["00", "01", "10", "11"];
  const ebNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

  function ebFmt(value) {
    if (!Number.isFinite(value)) return "undefined";
    return ebNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
  }

  // A number written exactly where it is a simple fraction or square root:
  // 3/5, 1/√2, √3/2, √(2/3). Anything else is a rounded decimal.
  function ebNum(value) {
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
    return sign + ebFmt(v);
  }

  // An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
  const ebTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
  const ebFits = (value, answer) => Math.abs(value - answer) <= (ebTerminates(answer) ? 1e-9 : EB_TOLERANCE + 1e-12);
  const ebNear = (value, target, tolerance = EB_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
  const ebRound = (v, step) => Math.round(v / step) * step;
  const ebTidy = v => Number(v.toFixed(4));
  const ebClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Parse numbers such as 2, −1.5, 3/5, √2, 1/√2, (1 + √3)/2, √(2/3), π/4 or 6.6e-3.
  // This is a small arithmetic reader (+ − × / √ π and brackets), never eval.
  function ebParse(raw) {
    const text = String(raw).trim().toLowerCase()
      .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/sqrt/g, "√").replace(/pi/g, "π")
      .replace(/(°|degrees|degree|deg)$/, "")
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

  const ebGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
  const ebSetup = message => ebGrade(false, message);

  function ebLabelText(field) {
    const label = field.closest("label");
    if (!label) return field.getAttribute("aria-label") || "the selected input";
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input, select, output, .eb-sr-only").forEach(node => node.remove());
    const own = copy.textContent.replace(/\s+/g, " ").trim();
    const hidden = label.querySelector(".eb-sr-only")?.textContent.trim() ?? "";
    return (hidden + " " + own).trim() || field.getAttribute("aria-label") || "the selected input";
  }

  class EbFieldError extends Error {
    constructor(field, detail = "", custom = false) {
      super("Check " + ebLabelText(field) + "." + (detail ? " " + detail : ""));
      this.field = field;
      this.detail = detail;
      this.custom = custom;
    }
  }

  function ebSetText(element, text) {
    text = String(text ?? "");
    if (element && element.textContent !== text) element.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Complex numbers are [real, imaginary] pairs. A single-qubit ket is [a, b];
  // a pair ket is [α00, α01, α10, α11]; a matrix is a list of rows.
  // ---------------------------------------------------------------------------
  const ebAdd = ([a, b], [c, d]) => [a + c, b + d];
  const ebSub = ([a, b], [c, d]) => [a - c, b - d];
  const ebMul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  const ebDiv = (z, w) => { const n = ebAbs2(w); return ebScale(ebMul(z, ebConj(w)), 1 / n); };
  const ebConj = ([a, b]) => [a, -b];
  const ebScale = ([a, b], k) => [a * k, b * k];
  const ebAbs2 = ([a, b]) => a * a + b * b;
  const ebAbs = ([a, b]) => Math.hypot(a, b);
  const ebArg = ([a, b]) => Math.atan2(b, a);
  const ebCis = angle => [Math.cos(angle), Math.sin(angle)];
  const ebZ = v => (typeof v === "number" ? [v, 0] : v);
  const ebKet = list => list.map(ebZ);
  const ebInner = (u, v) => u.reduce((sum, z, k) => ebAdd(sum, ebMul(ebConj(z), v[k])), [0, 0]);
  const ebNorm2 = v => v.reduce((sum, z) => sum + ebAbs2(z), 0);
  const ebNormalize = v => { const n = Math.sqrt(ebNorm2(v)); return v.map(z => ebScale(z, 1 / n)); };
  const ebApply = (A, v) => A.map(row => row.reduce((sum, z, k) => ebAdd(sum, ebMul(ebZ(z), v[k])), [0, 0]));
  const ebMatMul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((sum, z, k) => ebAdd(sum, ebMul(ebZ(z), ebZ(B[k][j]))), [0, 0])));

  // i times a size: i, 3i/5, i/√2, (√3/2)i.
  function ebTimesI(text) {
    if (text === "1") return "i";
    if (/^1\//.test(text)) return "i" + text.slice(1);
    if (/^\d+\/\d+$/.test(text)) return text.replace("/", "i/");
    return /[/√]/.test(text) ? "(" + text + ")i" : text + "i";
  }
  function ebCx(z) {
    const [a, b] = ebZ(z);
    const re = Math.abs(a) < 5e-10 ? 0 : a, im = Math.abs(b) < 5e-10 ? 0 : b;
    if (im === 0) return ebNum(re);
    const size = ebTimesI(ebNum(Math.abs(im)));
    if (re === 0) return (im < 0 ? "−" : "") + size;
    return ebNum(re) + (im < 0 ? " − " : " + ") + size;
  }
  const ebColText = v => "(" + v.map(ebCx).join(", ") + ")";

  // ---------------------------------------------------------------------------
  // Pair states. |ij⟩ = |i⟩A ⊗ |j⟩B, in the ordered basis (|00⟩, |01⟩, |10⟩, |11⟩).
  // ---------------------------------------------------------------------------
  const ebTensor = ([a, b], [c, d]) => [ebMul(a, c), ebMul(a, d), ebMul(b, c), ebMul(b, d)];
  // The product test: zero exactly for product states.
  const ebD = ([p, q, r, s]) => ebSub(ebMul(p, s), ebMul(q, r));
  const ebProbs = psi => psi.map(ebAbs2);
  function ebTable(psi) {
    const n = ebNorm2(psi) || 1, [p00, p01, p10, p11] = ebProbs(psi).map(p => p / n);
    return { p: [p00, p01, p10, p11], a: [p00 + p01, p10 + p11], b: [p00 + p10, p01 + p11], match: p00 + p11, norm: n };
  }
  // Swap which qubit is A and which is B: |01⟩ and |10⟩ trade places.
  const ebSwap = ([p, q, r, s]) => [p, r, q, s];
  // The ket written out, such as (1/2)|00⟩ + (i/2)|01⟩.
  function ebKetText(psi, names = EB_KETS) {
    const terms = [];
    psi.forEach((z, k) => {
      if (ebAbs(z) < 5e-10) return;
      const [re, im] = z;
      let coeff;
      if (Math.abs(re) > 5e-10 && Math.abs(im) > 5e-10) coeff = "(" + ebCx(z) + ")";
      else {
        coeff = ebCx(z);
        const negative = coeff.startsWith("−"), body = negative ? coeff.slice(1) : coeff;
        coeff = (negative ? "−" : "") + (body === "1" ? "" : /[/√ ]/.test(body) && !body.startsWith("(") ? "(" + body + ")" : body);
      }
      terms.push(coeff + "|" + names[k] + "⟩");
    });
    if (!terms.length) return "0";
    return terms.map((t, k) => (k === 0 ? t : t.startsWith("−") ? " − " + t.slice(1) : " + " + t)).join("");
  }
  // Is typed equal to exact up to one overall phase? Each part within tolerance.
  function ebPhaseOf(typed, exact) {
    const k = exact.reduce((best, z, j) => (ebAbs(z) > ebAbs(exact[best]) ? j : best), 0);
    const ratio = ebDiv(typed[k], exact[k]), r = ebAbs(ratio);
    return r > 1e-9 ? ebScale(ratio, 1 / r) : [1, 0];
  }
  function ebSameUpToPhase(typed, exact, tolerance = EB_TOLERANCE) {
    const phase = ebPhaseOf(typed, exact);
    return typed.every((z, j) => {
      const want = ebMul(phase, exact[j]);
      return Math.abs(z[0] - want[0]) <= tolerance + 1e-9 && Math.abs(z[1] - want[1]) <= tolerance + 1e-9;
    });
  }
  // Each part exact, or within tolerance when it doesn't end as a decimal.
  const ebCxFits = (z, w) => ebFits(z[0], w[0]) && ebFits(z[1], w[1]);
  const ebKetMisses = (typed, exact, names = EB_KETS) => names.filter((_, k) => !ebCxFits(typed[k], exact[k])).map(n => "|" + n + "⟩");
  const ebMissText = misses => misses.length === 1 ? "The " + misses[0] + " entry is" : "The " + misses.join(", ") + " entries are";
  const ebPct = p => ebFmt(ebRound(100 * p, 0.01)) + "%";

  // A seedable random source (mulberry32), so a reset with the same seed repeats a run.
  function ebRng(seed) {
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
  const ebArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
  const ebPlane = (caption, items, extra = {}) => ({ kind: "plane", caption, items, limit: 1, circle: 1, axes: ["Re", "Im"], ...extra });
  const ebBars = (caption, items, extra = {}) => ({ kind: "bars", caption, items, ...extra });
  const ebChart = (caption, extra) => ({ kind: "chart", caption, x: [0, 1], y: [0, 1], xTicks: [0, 1], yTicks: [0, 0.5, 1], xLabel: "", ...extra });
  const ebSweep = (f, x0, x1, n = 160) => Array.from({ length: n + 1 }, (_, k) => {
    const x = x0 + (x1 - x0) * k / n;
    return [x, f(x)];
  });
  const ebMatrixPanel = (caption, rows, extra = {}) => ({
    kind: "matrix", caption, rows: rows.map(row => row.map(z => (typeof z === "string" ? z : ebCx(z)))), ...extra
  });
  
  // A 2×2 grid with A's bit down the side and B's bit across the top. Each cell
  // holds a line of text, an optional fill (0–1) and an optional phasor arrow.
  const ebGrid = (caption, cells, extra = {}) => ({ kind: "grid", caption, cells, rows: ["A = 0", "A = 1"], cols: ["B = 0", "B = 1"], ...extra });
  // Two lists joined by lines: item i on the left goes to item j on the right.
  
  // Two wires, A on top and B below, with gates in order.
  
  // Grid cells for a pair ket: text is the amplitude, fill its probability, arrow its phase.
  const ebKetCells = (psi, shown = true, tones = ["warn", "angle", "plus", "minus"]) => {
    const n = ebNorm2(psi) || 1;
    return psi.map((z, k) => ({ tag: "|" + EB_KETS[k] + "⟩", text: shown ? ebCx(z) : "?", fill: shown ? ebAbs2(z) / n : 0, z: shown ? ebScale(z, 1 / Math.sqrt(n)) : null, tone: tones[k] }));
  };

  // ---------------------------------------------------------------------------
  // Bell helpers. Angles are degrees; full turns are the same axis, so 370° = 10°.
  // The singlet |Ψ⁻⟩ gives E(α, β) = −cos δ with δ = α − β, and the CHSH sum is
  // S = E00 + E01 + E10 − E11, so P(win) = 1/2 + S/8.
  // ---------------------------------------------------------------------------
  const EB_RAD = Math.PI / 180;
  const EB_Q = Math.SQRT1_2;
  const ebWrap = d => { const r = ((d % 360) + 360) % 360; return r > 180 + 1e-9 ? r - 360 : r; };  // (−180°, 180°]
  const ebSameAngle = (a, b, tol = 0.5) => Math.abs(ebWrap(a - b)) <= tol + 1e-9;
  const ebDeg = v => ebFmt(ebTidy(v)) + "°";
  const ebE = (alpha, beta) => -Math.cos((alpha - beta) * EB_RAD);
  const ebChsh = ([e00, e01, e10, e11]) => e00 + e01 + e10 - e11;
  const ebWin = s => 0.5 + s / 8;
  const ebSigned = v => (v > 5e-10 ? "+" : "") + ebNum(v);
  // An exact form when there is one, with a decimal next to it when that helps.
  const ebBoth = v => { const n = ebNum(v), d = ebFmt(ebRound(v, 0.0001)); return n === d ? n : n + " ≈ " + d; };
  const ebAxisDir = deg => [Math.sin(deg * EB_RAD), 0, Math.cos(deg * EB_RAD)];
  // The four CHSH correlations for the singlet, with Alice's axes a = [α0, α1] and Bob's b = [β0, β1].
  const ebCorrs = (a, b) => [ebE(a[0], b[0]), ebE(a[0], b[1]), ebE(a[1], b[0]), ebE(a[1], b[1])];
  // Win probability for input pair xy given its correlation.
  const ebPairWin = (e, k) => (k === 3 ? (1 - e) / 2 : (1 + e) / 2);
  const EB_PAIRS = ["00", "01", "10", "11"];

  // A whole-number seed from the station's seed box, or null.
  function ebSeed(c) {
    const seed = ebParse(c.val("seed"));
    return seed !== null && Number.isInteger(seed) && seed >= 0 && seed < 1e9 ? seed : null;
  }
  function ebNeedSeed(c) {
    const seed = ebSeed(c);
    if (seed === null) throw new EbFieldError(c.field("seed"), "Enter a whole number from 0 to 999999999.", true);
    return seed;
  }
  // A run keyed by name: it keeps its own random stream, so the same seed and the
  // same clicks always repeat the same rounds.
  function ebRun(c, key, salt, make = () => ({})) {
    c.s.runs ??= {};
    const seed = ebSeed(c);
    let run = c.s.runs[key];
    if (!run || run.seed !== seed) run = c.s.runs[key] = { seed, rng: ebRng(seed * 7919 + salt), ...make() };
    return run;
  }
  const ebLive = (c, key) => { const run = c.s.runs?.[key]; return run && run.seed === ebSeed(c) ? run : null; };
  // A fresh seed for the New seed button.
  function ebReseed(c) {
    const seed = Math.floor(Math.random() * 900000) + 100;
    c.set("seed", seed);
    c.s.runs = {};
    return seed;
  }

  // ---------------------------------------------------------------------------
  // Stations 1–5 · Correlations, and the classical side of the CHSH game.
  // ---------------------------------------------------------------------------
  const ebClassicalE = delta => -1 + Math.abs(ebWrap(delta)) / 90;
  const ebAngles = (c, names) => names.map(name => c.number(name));
  const ebNoAngles = c => {
    c.put("state", "Enter every angle in degrees, such as 30, −45 or 370.");
    return { panels: [], caption: "angle needed", desc: "An angle box is empty or unreadable." };
  };
  // Signs in the lesson's order: (+1, +1), (+1, −1), (−1, +1), (−1, −1); bits 00, 01, 10, 11.
  const EB_SIGNS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const EB_SIGN_TEXT = ["(+1, +1)", "(+1, −1)", "(−1, +1)", "(−1, −1)"];
  const ebSinglet = (alpha, beta) => { const e = ebE(alpha, beta); return EB_SIGNS.map(([u, v]) => (1 + u * v * e) / 4); };
  // Draw one index from a probability list.
  const ebPick = (rng, p) => { const u = rng(); let acc = 0; for (let k = 0; k < p.length - 1; k++) { acc += p[k]; if (u < acc) return k; } return p.length - 1; };
  const ebSignCells = (p, shown = true, tones = ["plus", "warn", "warn", "plus"]) =>
    p.map((v, k) => ({ tag: EB_SIGN_TEXT[k], text: shown ? ebNum(v) : "?", fill: shown ? v : 0, tone: tones[k] }));
  const EB_ROWS_A = ["Alice +1", "Alice −1"], EB_COLS_B = ["Bob +1", "Bob −1"];

  // 2 · Bell State Atlas.
  const EB_BELL = {
    phip: { ket: ebKet([EB_Q, 0, 0, EB_Q]), name: "|Φ⁺⟩" },
    phim: { ket: ebKet([EB_Q, 0, 0, -EB_Q]), name: "|Φ⁻⟩" },
    psip: { ket: ebKet([0, EB_Q, EB_Q, 0]), name: "|Ψ⁺⟩" },
    psim: { ket: ebKet([0, EB_Q, -EB_Q, 0]), name: "|Ψ⁻⟩" }
  };
  // Eigenkets for +1 and −1 of each Pauli basis.
  const EB_BASIS = {
    z: [ebKet([1, 0]), ebKet([0, 1])],
    x: [ebKet([EB_Q, EB_Q]), ebKet([EB_Q, -EB_Q])],
    y: [ebKet([EB_Q, [0, EB_Q]]), ebKet([EB_Q, [0, -EB_Q]])]
  };
  function ebAtlasProbs(state, ba, bb) {
    const psi = EB_BELL[state].ket;
    return EB_SIGNS.map(([u, v]) => {
      const e = EB_BASIS[ba][u === 1 ? 0 : 1], f = EB_BASIS[bb][v === 1 ? 0 : 1];
      let amp = [0, 0];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) amp = ebAdd(amp, ebMul(ebMul(ebConj(e[i]), ebConj(f[j])), psi[2 * i + j]));
      return ebAbs2(amp);
    });
  }
  const ebCorrOf = p => p[0] + p[3] - p[1] - p[2];
  const EB_SAME = { phip: [1, -1, 1], phim: [-1, 1, 1], psip: [1, 1, -1], psim: [-1, -1, -1] };  // (XX, YY, ZZ)

  // 3 · Mixture Unmasked. Index k of a pair is its bits (a, b) = (k >> 1, k & 1).
  const EB_MIX_SALT = { "phi-z": 1, "phi-x": 2, "mix-z": 3, "mix-x": 4, "mystery-z": 5, "mystery-x": 6 };
  const ebMysteryIsMix = seed => ebRng(seed * 31 + 7)() < 0.5;
  function ebMixTrial(rng, kind, basis) {
    if (kind === "phi") return rng() < 0.5 ? 0 : 3;            // Z: 00 or 11; X: ++ or −−
    return basis === "z" ? (rng() < 0.5 ? 0 : 3) : Math.floor(rng() * 4);  // the mixture
  }
  const ebMatches = counts => counts[0] + counts[3];
  const ebSum = list => list.reduce((a, b) => a + b, 0);

  // 4 · No-Signaling Check.
  const ebAliceAxis = c => c.number(c.val("msg") === "1" ? "a1" : "a0");

  // 5 · Classical Strategy Hunter. Table k holds the bits (a0, a1, b0, b1).
  const EB_TABLES = Array.from({ length: 16 }, (_, k) => {
    const bits = [k >> 3 & 1, k >> 2 & 1, k >> 1 & 1, k & 1];
    const [A0, A1, B0, B1] = bits.map(b => 1 - 2 * b);
    const S = A0 * B0 + A0 * B1 + A1 * B0 - A1 * B1;
    const wins = EB_PAIRS.filter((_, j) => ((bits[j >> 1] ^ bits[2 + (j & 1)]) === ((j >> 1) & (j & 1)))).length;
    return { k, bits, S, win: wins / 4, name: "Alice " + bits[0] + bits[1] + ", Bob " + bits[2] + bits[3] };
  });
  function ebMixer(c) {
    const rows = [1, 2, 3].map(j => ({ table: EB_TABLES[Number(c.val("t" + j))], w: c.quiet("w" + j) }));
    if (rows.some(r => r.w === null)) return { ok: false, rows };
    const total = ebSum(rows.map(r => r.w)), S = ebSum(rows.map(r => r.w * r.table.S));
    const used = new Set(rows.filter(r => r.w > 1e-9).map(r => r.table.k));
    return { ok: true, rows, total, S, win: ebSum(rows.map(r => r.w * r.table.win)), used, valid: rows.every(r => r.w >= -1e-12) && Math.abs(total - 1) <= EB_TOLERANCE };
  }
  function ebMixGrader(c, target, label) {
    const rows = [1, 2, 3].map(j => c.ans("w" + j));
    if (rows.some(w => w < 0)) return ebGrade(false, "A weight is a probability, so none can be negative.");
    const m = ebMixer(c);
    if (!m.valid) return ebGrade(false, "Your weights add to " + ebNum(m.total) + ". Make them add to 1.");
    return { m, ok: ebFits(m.win, target) || Math.abs(m.win - target) <= EB_TOLERANCE, label };
  }

  const ebStations1 = {
    // 1 · Correlation Curve -----------------------------------------------------------------------------
    curve: {
      load(c, check) { if (check === "c") { c.set("al", 370); c.set("be", 130); } },
      show(c) {
        const [al, be] = ebAngles(c, ["al", "be"]);
        if (![al, be].every(Number.isFinite)) return ebNoAngles(c);
        const raw = al - be, d = ebWrap(raw), eq = ebE(al, be), ecl = ebClassicalE(raw);
        const showQ = c.checked("q"), showC = c.checked("cl");
        c.put("state", "α = " + ebDeg(al) + ", β = " + ebDeg(be) + ", so δ = α − β = " + ebDeg(raw)
          + (Math.abs(raw - d) > 1e-9 ? ", which is " + ebDeg(d) + " once full turns are removed" : "") + ". "
          + (showQ ? "Singlet: E = −cos δ = " + ebBoth(eq) + ". " : "")
          + (showC ? "Instruction-set model: E = " + ebBoth(ecl) + ". " : "")
          + (showQ && showC ? "Gap E_singlet − E_model = " + ebBoth(eq - ecl) + "." : ""));
        const series = [], dots = [];
        if (showQ) { series.push({ pts: ebSweep(x => -Math.cos(x * EB_RAD), -180, 180), tone: "plus" }); dots.push({ x: d, y: eq, tone: "plus" }); }
        if (showC) { series.push({ pts: [[-180, 1], [0, -1], [180, 1]], tone: "minus", dashed: true }); dots.push({ x: d, y: ecl, tone: "minus", hollow: true }); }
        return {
          panels: [
            { kind: "dial", caption: "the two axes", weight: 0.9, arrows: [{ deg: al, tone: "alpha", label: "α" }, { deg: be, tone: "beta", label: "β", stack: ebSameAngle(al, be, 8) ? 1 : 0 }] },
            ebChart("E against δ", { weight: 1.6, x: [-180, 180], y: [-1, 1], xTicks: [-180, -90, 0, 90, 180], xTickText: ["−180°", "−90°", "0°", "90°", "180°"], yTicks: [-1, -0.5, 0, 0.5, 1], xLabel: "δ = α − β", series, dots, vlines: [{ x: d, tone: "angle", dashed: true }] })
          ],
          caption: "δ = " + ebDeg(d),
          desc: "Left: Alice’s axis at " + ebDeg(al) + " and Bob’s at " + ebDeg(be) + " in the X–Z plane. Right: correlation against δ from −180° to 180°"
            + (showQ ? ", the singlet’s −cos δ (solid)" : "") + (showC ? ", the instruction-set model’s straight segments (dashed)" : "") + ". Marked at δ = " + ebDeg(d)
            + (showQ ? ": singlet " + ebBoth(eq) : "") + (showC ? ", model " + ebBoth(ecl) : "") + "."
        };
      },
      checks: {
        a: ["δ = α − β. Any pair 60° apart works, such as α = 60°, β = 0°.", "−cos 60° = −1/2. For the model, −1 + 60/90 = −1/3.", c => {
          const d = ebWrap(c.ans("al") - c.ans("be"));
          if (Math.abs(Math.abs(d) - 60) > 0.5) return ebSetup("Set the axes so δ = α − β is 60° or −60° first. Yours is " + ebDeg(d) + ".");
          if (!ebFits(c.ans("a-q"), -0.5)) return ebGrade(false, "Check the singlet value: E = −cos δ, and cos 60° = 1/2.");
          return ebGrade(ebFits(c.ans("a-c"), -1 / 3), "The singlet value is right. For the model use E = −1 + |δ|/90°.",
            "δ = ±60°. Singlet: E = −cos 60° = −1/2. Model: E = −1 + 60/90 = −1/3. The singlet is more strongly anticorrelated here: the cosine stays near −1 longer than the straight line does.");
        }],
        b: ["The curves meet at δ = 0°, ±90° and 180°. Look between those.", "Try δ near 40° or near 140°.", c => {
          const al = c.ans("al"), be = c.ans("be"), gap = ebE(al, be) - ebClassicalE(al - be);
          return ebGrade(Math.abs(gap) >= 0.2 - 1e-9, "At your setting (δ = " + ebDeg(ebWrap(al - be)) + ") the gap is " + ebBoth(Math.abs(gap)) + ". Move to where the curves are farthest apart.",
            "At δ = " + ebDeg(ebWrap(al - be)) + " the gap is " + ebBoth(Math.abs(gap)) + ". The largest gap, about 0.21, is near |δ| ≈ 39.5° and 140.5°, where sin δ = 2/π. A straight-line model can match the cosine only where they cross.");
        }],
        c: ["370° is the same axis as 10°, so δ = 240°, or −120° with a full turn removed.", "−cos 240° = 1/2. For the model use |δ| = 120°: −1 + 120/90.", c => {
          if (!ebFits(c.ans("c-q"), 0.5)) return ebGrade(false, "Check the singlet value. δ = 370° − 130° = 240°, and cos 240° = −1/2.");
          return ebGrade(ebFits(c.ans("c-c"), 1 / 3), "The singlet value is right. Reduce δ to the range −180° to 180° before using the model’s formula.",
            "δ = 240°, the same as −120°. Singlet: E = −cos 240° = +1/2. Model: E = −1 + 120/90 = +1/3. Full turns never change an axis, so 370° behaves exactly like 10°.");
        }],
        d: ["E = −cos δ = +1 needs cos δ = −1.", "Opposite axes: δ = 180°.", c => {
          const d = ebWrap(c.ans("al") - c.ans("be"));
          if (Math.abs(Math.abs(d) - 180) > 0.5) return ebSetup("At your setting δ = " + ebDeg(d) + ", where E is not +1. Find axes where the signs always agree.");
          return ebGrade(c.choice("d-pick") === "both", "Read both curves at δ = 180°.",
            "With δ = 180° the analyzers point in opposite directions. The singlet gives E = −cos 180° = +1, and the model gives −1 + 180/90 = +1. Both agree at the extremes δ = 0° and 180°; only the cosine’s shape in between separates them.");
        }]
      }
    },

    // 2 · Bell State Atlas --------------------------------------------------------------------------------
    atlas: {
      load(c, check) {
        if (check === "a") c.field("state").value = "phip";
        if (check === "c") { c.field("state").value = "phip"; c.field("ba").value = "z"; c.field("bb").value = "x"; }
      },
      show(c) {
        const state = c.val("state"), ba = c.val("ba"), bb = c.val("bb"), shown = c.checked("reveal");
        const p = ebAtlasProbs(state, ba, bb), E = ebCorrOf(p);
        const label = EB_BELL[state].name + ", Alice " + ba.toUpperCase() + ", Bob " + bb.toUpperCase();
        c.put("state", label + ". " + (shown
          ? "P(00) = " + ebNum(p[0]) + ", P(01) = " + ebNum(p[1]) + ", P(10) = " + ebNum(p[2]) + ", P(11) = " + ebNum(p[3]) + ". E = " + ebSigned(E) + ". Alice’s P(+1) = " + ebNum(p[0] + p[1]) + " and Bob’s P(+1) = " + ebNum(p[0] + p[2]) + "."
          : "Predictions hidden. Work out E = P(equal) − P(unequal), then tick Reveal."));
        return {
          panels: [ebGrid(label, ebSignCells(p, shown), { rows: EB_ROWS_A, cols: EB_COLS_B, weight: 1.3, margins: shown ? { rows: ["P = " + ebNum(p[0] + p[1]), "P = " + ebNum(p[2] + p[3])], cols: ["P = " + ebNum(p[0] + p[2]), "P = " + ebNum(p[1] + p[3])] } : null }),
            ebMatrixPanel("correlation", [["E = " + (shown ? ebSigned(E) : "?")]], { weight: 0.7, note: "equal signs count +1" })],
          caption: label,
          desc: "A 2 by 2 grid of joint sign probabilities for " + label + ", Alice’s sign down the side and Bob’s across the top. "
            + (shown ? "Values " + p.map((v, k) => EB_SIGN_TEXT[k] + " " + ebNum(v)).join(", ") + "; correlation " + ebSigned(E) + "." : "Values hidden until you reveal them.")
        };
      },
      checks: {
        a: ["|Φ⁺⟩ gives equal Z results, and the lesson shows |Φ⁺⟩ = (|++⟩ + |−−⟩)/√2.", "Y|0⟩ = i|1⟩ and Y|1⟩ = −i|0⟩, so (Y ⊗ Y)|00⟩ = (i)(i)|11⟩ = −|11⟩.", c => {
          const want = { "a-zz": 1, "a-xx": 1, "a-yy": -1 }, names = { "a-zz": "E_ZZ", "a-xx": "E_XX", "a-yy": "E_YY" };
          const wrong = Object.keys(want).filter(k => !ebFits(c.ans(k), want[k]));
          return ebGrade(!wrong.length, wrong.map(k => names[k]).join(" and ") + (wrong.length === 1 ? " is" : " are") + " not right yet." + (wrong.includes("a-yy") ? " Watch the factors of i in Y." : ""),
            "Z: 00 or 11, always equal, E = +1. X: |Φ⁺⟩ = (|++⟩ + |−−⟩)/√2, always equal, E = +1. Y: (Y ⊗ Y)|Φ⁺⟩ = −|Φ⁺⟩, so the Y signs are always unequal and E = −1.");
        }],
        b: ["Which two Bell states have equal Z results? Of those, which flips sign under X ⊗ X?", "(X ⊗ X)(|00⟩ − |11⟩) = |11⟩ − |00⟩, minus the state.", c => {
          if (c.choice("b-state") !== "phim") return ebGrade(false, "E_ZZ = +1 leaves |Φ⁺⟩ or |Φ⁻⟩. Which one has E_XX = −1?");
          return ebGrade(ebFits(c.ans("b-yy"), 1), "The state is right. Now apply Y ⊗ Y to |00⟩ and |11⟩.",
            "|Φ⁻⟩ = (|00⟩ − |11⟩)/√2. X ⊗ X swaps |00⟩ and |11⟩, giving −|Φ⁻⟩, so E_XX = −1. Y ⊗ Y sends |00⟩ to −|11⟩ and |11⟩ to −|00⟩, giving +|Φ⁻⟩, so E_YY = +1.");
        }],
        c: ["Write Bob’s |0⟩ and |1⟩ in the X basis: |0⟩ = (|+⟩ + |−⟩)/√2 and |1⟩ = (|+⟩ − |−⟩)/√2.", "The |0⟩|+⟩ amplitude is (1/√2)(1/√2) = 1/2.", c => {
          if (!ebFits(c.ans("c-p00"), 0.25)) return ebGrade(false, "Check P(00), the chance of Alice +1 on Z and Bob +1 on X. Square the amplitude of |0⟩|+⟩.");
          return ebGrade(ebFits(c.ans("c-e"), 0), "P(00) is right. Now find P(01), P(10) and P(11) too.",
            "|Φ⁺⟩ = (1/2)(|0⟩|+⟩ + |0⟩|−⟩ + |1⟩|+⟩ − |1⟩|−⟩). All four joint probabilities are 1/4, so E = 1/4 + 1/4 − 1/4 − 1/4 = 0. Measuring in mismatched bases destroys the correlation, but each marginal is still 50/50.");
        }],
        d: ["Start with |Φ⁺⟩: E_XX = +1, E_YY = −1, E_ZZ = +1.", "Check |Ψ⁻⟩ as well: all three correlations are −1.", c =>
          ebGrade(ebFits(c.ans("d-prod"), -1), "Multiply the three same-basis correlations for one state, such as |Φ⁺⟩.",
            "|Φ⁺⟩: (+1)(−1)(+1) = −1. |Φ⁻⟩: (−1)(+1)(+1) = −1. |Ψ⁺⟩: (+1)(+1)(−1) = −1. |Ψ⁻⟩: (−1)(−1)(−1) = −1. The reason is (X ⊗ X)(Y ⊗ Y)(Z ⊗ Z) = (XYZ) ⊗ (XYZ) = (iI) ⊗ (iI) = −I.")]
      }
    },

    // 3 · Mixture Unmasked ---------------------------------------------------------------------------------
    mixture: {
      load(c, check) {
        if (check === "c") { c.field("source").value = "mystery"; c.field("basis").value = "x"; c.field("n").value = "20"; }
      },
      actions: {
        run(c) {
          const seed = ebNeedSeed(c), source = c.val("source"), basis = c.val("basis"), key = source + "-" + basis, n = Number(c.val("n"));
          const run = ebRun(c, key, EB_MIX_SALT[key], () => ({ counts: [0, 0, 0, 0], records: [] }));
          const kind = source === "mystery" ? (ebMysteryIsMix(seed) ? "mix" : "phi") : source;
          for (let k = 0; k < n; k++) {
            const j = ebMixTrial(run.rng, kind, basis);
            run.counts[j] += 1;
            run.records.push(j);
          }
          const total = ebSum(run.counts), match = ebMatches(run.counts);
          return "Ran " + n + " pairs in " + basis.toUpperCase() + " with seed " + seed + ". This run now has " + total + " pairs: " + match + " matched and " + (total - match) + " mismatched.";
        },
        clear(c) {
          c.s.runs ??= {};
          delete c.s.runs[c.val("source") + "-" + c.val("basis")];
          return "Run cleared. With the same seed, the next pairs repeat the same results.";
        },
        reseed(c) { return "New seed " + ebReseed(c) + ". All runs cleared."; }
      },
      show(c) {
        const source = c.val("source"), basis = c.val("basis"), key = source + "-" + basis, run = ebLive(c, key);
        const name = { phi: "|Φ⁺⟩", mix: "the 50/50 mixture", mystery: "the mystery source" }[source];
        const total = run ? ebSum(run.counts) : 0, match = run ? ebMatches(run.counts) : 0;
        const tag = basis === "x" ? ["++", "+−", "−+", "−−"] : ["00", "01", "10", "11"];
        const bit = j => (basis === "x" ? ["+ (a = 0)", "− (a = 1)"] : ["0", "1"]);
        c.put("state", ebSeed(c) === null ? "Enter a whole-number seed to run pairs."
          : total ? name[0].toUpperCase() + name.slice(1) + " in " + basis.toUpperCase() + ", seed " + ebSeed(c) + ": " + total + " pairs. " + tag.map((t, j) => t + " × " + run.counts[j]).join(", ") + ". Matched " + match + " of " + total + "."
          : "No pairs yet for " + name + " in " + basis.toUpperCase() + ". Press Run pairs.");
        c.list("records", total ? run.records.slice(-20).map((j, k) => "Pair " + (total - Math.min(20, total) + k + 1) + ": Alice " + bit()[j >> 1].replace("a =", "a =") + ", Bob " + bit()[j & 1].replace("a =", "b =") + (j === 0 || j === 3 ? ", match" : ", mismatch")) : []);
        return {
          panels: [ebBars(total ? "fraction of " + total + " pairs in " + basis.toUpperCase() : "no pairs yet", [
            ...tag.map((t, j) => ({ label: t, value: total ? run.counts[j] / total : 0, text: String(run ? run.counts[j] : 0), tone: j === 0 || j === 3 ? "plus" : "warn" })),
            { label: "match", value: total ? match / total : 0, text: total ? ebFmt(ebRound(match / total, 0.001)) : "0", tone: "ink", outline: true }])],
          caption: name + ", " + basis.toUpperCase(),
          desc: total ? "Bars give the fraction of each sign pair for " + name + " measured in " + basis.toUpperCase() + ": counts " + run.counts.join(", ") + ", match fraction " + ebFmt(ebRound(match / total, 0.001)) + "." : "No pairs yet."
        };
      },
      checks: {
        a: ["Both sources only ever produce 00 or 11 in Z.", "If two sources give identical statistics, records can’t separate them.", c => {
          if (!ebFits(c.ans("a-phi"), 1) || !ebFits(c.ans("a-mix"), 1)) return ebGrade(false, "Check the two probabilities. In Z, does either source ever give 01 or 10?");
          return ebGrade(c.choice("a-pick") === "same", "Both probabilities are right. What does that mean for telling the sources apart?",
            "In Z both sources give 00 or 11 with probability 1/2 each, so P(match) = 1 for both. Their Z statistics are identical, so Z records alone can’t tell them apart. That’s where Lesson 18 stopped.");
        }],
        b: ["Rewrite |Φ⁺⟩ in the X basis: (|++⟩ + |−−⟩)/√2.", "Each component of the mixture is a product, and |0⟩ or |1⟩ gives + or − along X with probability 1/2.", c => {
          if (!ebFits(c.ans("b-phi"), 1)) return ebGrade(false, "Check |Φ⁺⟩. The lesson writes it as (|++⟩ + |−−⟩)/√2.");
          return ebGrade(ebFits(c.ans("b-mix"), 0.5), "|Φ⁺⟩ is right. For the mixture, each qubit’s X result is a fair coin, independently.",
            "|Φ⁺⟩ = (|++⟩ + |−−⟩)/√2 always matches in X. For |00⟩ or |11⟩, each qubit gives + or − with probability 1/2 independently, so each X pair has probability 1/4 and P(match) = 1/2. The X test separates the two preparations.");
        }],
        c: ["Count the mismatched pairs (+− or −+) in your X run.", "One mismatch rules out |Φ⁺⟩. If none appear in 20 pairs, the mixture had only a 1 in 2²⁰ chance of producing that.", c => {
          const run = ebLive(c, "mystery-x");
          if (!run || ebSum(run.counts) < 20) return ebSetup("Run at least 20 pairs of the mystery source in X first (with the seed shown).");
          const total = ebSum(run.counts), mismatches = total - ebMatches(run.counts);
          const evidence = mismatches > 0 ? "mismatch" : "allmatch";
          if (c.choice("c-ev") !== evidence) return ebGrade(false, "Look at your run again: it has " + mismatches + " mismatched pairs out of " + total + ".");
          const truth = ebMysteryIsMix(ebSeed(c)) ? "the 50/50 mixture" : "|Φ⁺⟩";
          return ebGrade(c.choice("c-verdict") === (evidence === "mismatch" ? "mix" : "phi"), evidence === "mismatch" ? "Can the ideal |Φ⁺⟩ ever give a mismatched X pair?" : "Every pair matched. Which source predicts exactly that?",
            "Your run had " + mismatches + " mismatches in " + total + " X pairs. " + (evidence === "mismatch" ? "|Φ⁺⟩ never mismatches in X, so the source is the mixture." : "That is what |Φ⁺⟩ predicts. The mixture would do it only with probability 2^−" + total + ".") + " For seed " + ebSeed(c) + " the mystery source was in fact " + truth + ".");
        }],
        d: ["You need (1/2)^N < 1/1000.", "2¹⁰ = 1024.", c => {
          const n = c.whole("d-n", 1);
          return ebGrade(n === 10, n < 10 ? "(1/2)^" + n + " = 1/" + 2 ** n + ", which is not below 1/1000 yet." : "(1/2)^" + n + " is below 1/1000, but is it the smallest such N?",
            "(1/2)⁹ = 1/512 is above 1/1000, and (1/2)¹⁰ = 1/1024 is below it. So 10 matching X pairs already make the mixture very unlikely, while one mismatch rules out |Φ⁺⟩ outright.");
        }]
      }
    },

    // 4 · No-Signaling Check --------------------------------------------------------------------------------
    nosignal: {
      load(c, check) {
        if (check === "a") { c.field("msg").value = "0"; c.set("a0", 0); c.set("be", 30); c.s.runs = {}; }
      },
      edit(c, name) {
        // New axes start new runs, so both runs always share the same settings.
        if (/^(a0|a1|be)(-range)?$/.test(name)) c.s.runs = {};
      },
      actions: {
        send(c) {
          const seed = ebNeedSeed(c), msg = c.val("msg"), al = ebAliceAxis(c), be = c.number("be");
          if (![al, be].every(Number.isFinite)) throw new EbFieldError(c.field(msg === "1" ? "a1" : "a0"), "Enter the angles in degrees.", true);
          const run = ebRun(c, "m" + msg, msg === "1" ? 11 : 10, () => ({ n: 0, bobPlus: 0, alicePlus: 0 }));
          const p = ebSinglet(al, be);
          for (let k = 0; k < 200; k++) {
            const j = ebPick(run.rng, p);
            run.n += 1;
            if (EB_SIGNS[j][1] === 1) run.bobPlus += 1;
            if (EB_SIGNS[j][0] === 1) run.alicePlus += 1;
          }
          return "Sent 200 pairs with bit " + msg + " (α = " + ebDeg(al) + ", β = " + ebDeg(be) + ", seed " + seed + "). Bob saw +1 on " + run.bobPlus + " of " + run.n + ", a fraction of " + ebFmt(ebRound(run.bobPlus / run.n, 0.001)) + ".";
        },
        clear(c) { c.s.runs = {}; return "Both runs cleared. With the same seed, the next sends repeat the same results."; },
        reseed(c) { return "New seed " + ebReseed(c) + ". Both runs cleared."; }
      },
      show(c) {
        const al = ebAliceAxis(c), be = c.number("be");
        if (![al, be].every(Number.isFinite)) return ebNoAngles(c);
        const p = ebSinglet(al, be), msg = c.val("msg");
        c.s.seen ??= {};
        const key = String(Math.round(((be % 360) + 360) % 360));
        (c.s.seen[key] ??= new Set()).add(Math.round(((al % 360) + 360) % 360));
        const runs = ["0", "1"].map(m => ebLive(c, "m" + m));
        const frac = r => (r && r.n ? r.bobPlus / r.n : 0);
        c.put("state", "Bit " + msg + ": α = " + ebDeg(al) + ", β = " + ebDeg(be) + ", E = " + ebBoth(ebE(al, be)) + ". Bob’s P(+1) = P(+1, +1) + P(−1, +1) = " + ebNum(p[0]) + " + " + ebNum(p[2]) + " = " + ebNum(p[0] + p[2]) + ". "
          + runs.map((r, m) => "Bit " + m + " run: " + (r && r.n ? r.bobPlus + " of " + r.n + " Bob +1 (" + ebFmt(ebRound(frac(r), 0.001)) + ")" : "none yet")).join(". ") + ".");
        return {
          panels: [ebGrid("joint probabilities, bit " + msg, ebSignCells(p), { rows: EB_ROWS_A, cols: EB_COLS_B, weight: 1.25, margins: { cols: ["Bob +1: " + ebNum(p[0] + p[2]), "Bob −1: " + ebNum(p[1] + p[3])] } }),
            ebBars("Bob’s + fraction", [...runs.map((r, m) => ({ label: "bit " + m, value: frac(r), text: r && r.n ? ebFmt(ebRound(frac(r), 0.001)) : "—", tone: m ? "beta" : "alpha" })), { label: "theory", value: 0.5, text: "1/2", tone: "guide", outline: true }], { weight: 0.8 })],
          caption: "bit " + msg + ", α = " + ebDeg(al),
          desc: "Joint sign probabilities for α = " + ebDeg(al) + " and β = " + ebDeg(be) + ": " + p.map((v, k) => EB_SIGN_TEXT[k] + " " + ebNum(v)).join(", ") + ". Bob’s marginal for +1 is " + ebNum(p[0] + p[2]) + ". Bars show Bob’s observed + fraction for the bit 0 and bit 1 runs."
        };
      },
      checks: {
        a: ["δ = 0° − 30° = −30°, and cos(−30°) = √3/2.", "P(++) = (1 − cos δ)/4 and P(−+) = (1 + cos δ)/4.", c => {
          if (!ebFits(c.ans("a-pp"), (2 - Math.sqrt(3)) / 8)) return ebGrade(false, "Check P(+1, +1) = (1 − cos δ)/4 with cos δ = √3/2.");
          if (!ebFits(c.ans("a-mp"), (2 + Math.sqrt(3)) / 8)) return ebGrade(false, "P(+1, +1) is right. Check P(−1, +1) = (1 + cos δ)/4.");
          return ebGrade(ebFits(c.ans("a-sum"), 0.5), "Both joint probabilities are right. Add them.",
            "P(+1, +1) = (1 − √3/2)/4 = (2 − √3)/8 ≈ 0.0335 and P(−1, +1) = (2 + √3)/8 ≈ 0.4665. Their sum is 4/8 = 1/2: the cos δ terms cancel, so Bob’s marginal never depends on α.");
        }],
        b: ["Bob’s marginal is the sum down one column of the grid.", "The cos δ terms appear with opposite signs in the two cells.", c => {
          const key = String(Math.round(((c.ans("be") % 360) + 360) % 360)), seen = c.s.seen?.[key]?.size ?? 0;
          if (seen < 3) return ebSetup("Keep β where it is and move Alice’s current axis through at least three different angles first (" + seen + " so far at this β).");
          return ebGrade(c.choice("b-pick") === "half", "Read Bob’s marginal under the grid as you move α.",
            "Every α gave Bob’s P(+1) = 1/2. The joint cells change with α, but the column sums don’t: [(1 − cos δ) + (1 + cos δ)]/4 = 1/2.");
        }],
        c: ["Your two fractions are listed in the readout.", "Each fraction wobbles by about 0.5/√200 ≈ 0.035, so their difference wobbles by about 0.05.", c => {
          const runs = ["0", "1"].map(m => ebLive(c, "m" + m));
          if (runs.some(r => !r || r.n < 200)) return ebSetup("Send at least 200 pairs with bit 0 and at least 200 with bit 1 first, without changing the axes in between.");
          const diff = Math.abs(runs[0].bobPlus / runs[0].n - runs[1].bobPlus / runs[1].n);
          if (Math.abs(c.ans("c-diff") - diff) > 0.01 + 1e-9) return ebGrade(false, "Check your difference: " + runs[0].bobPlus + "/" + runs[0].n + " and " + runs[1].bobPlus + "/" + runs[1].n + ".");
          return ebGrade(c.choice("c-pick") === "noise", "Your difference is right. What does the theory predict for Bob’s marginal with each bit?",
            "Your difference was " + ebFmt(ebRound(diff, 0.001)) + " with " + runs[0].n + " and " + runs[1].n + " pairs. Both bits give Bob P(+1) = 1/2 exactly, so the expected difference is 0; with 200 pairs each its typical size is about 0.05. Sending more pairs shrinks the gap toward 0, never toward a message.");
        }],
        d: ["E(α, β) = −cos δ does depend on α.", "To see a correlation, you need both lists side by side.", c =>
          ebGrade(c.choice("d-pick") === "compare", "Bob’s local fraction is always 1/2. Where else could α show up?",
            "The correlation E = −cos(α − β) changes with Alice’s axis, but only the pair of records shows it. Bob has to receive Alice’s list by an ordinary, light-speed-limited signal before he can compare. Entanglement gives correlations, not a channel.")]
      }
    },

    // 5 · Classical Strategy Hunter ------------------------------------------------------------------------
    hunter: {
      show(c) {
        const m = ebMixer(c);
        c.list("tables", EB_TABLES.map(t => "Table " + t.k + ": " + t.name + ", S = " + ebSigned(t.S) + ", win rate " + ebNum(t.win)));
        const cells = [0, 1, 2, 3].map(a => [0, 1, 2, 3].map(b => {
          const t = EB_TABLES[a * 4 + b];
          return { text: "S = " + ebSigned(t.S), fill: t.win, tone: t.S > 0 ? "plus" : "warn", ring: m.ok && m.used.has(t.k) };
        }));
        c.put("state", m.ok
          ? "Mixer: " + m.rows.map((r, j) => "table " + r.table.k + " (S = " + ebSigned(r.table.S) + ") × " + ebNum(r.w)).join(", ") + ". Weights add to " + ebNum(m.total) + (m.valid ? "" : ", not 1") + ". S_mix = " + ebBoth(m.S) + ", expected win rate " + ebBoth(m.win) + "."
          : "Fill every weight box with a number such as 1/2 or 0.25.");
        return {
          panels: [{ kind: "table", caption: "16 tables, ringed when mixed", weight: 1.45, rowHead: 76, rowH: 46, rows: ["Alice 00", "Alice 01", "Alice 10", "Alice 11"], cols: ["Bob 00", "Bob 01", "Bob 10", "Bob 11"], cells, note: "fill = win rate (3/4 or 1/4)" },
            ebBars("mixture", [{ label: "P(win)", value: m.ok ? ebClamp(m.win, 0, 1) : 0, text: m.ok ? ebFmt(ebRound(m.win, 0.0001)) : "?", tone: "angle" }, { label: "bound", value: 0.75, text: "3/4", tone: "guide", outline: true }], { weight: 0.55 })],
          caption: m.ok ? "S_mix = " + ebFmt(ebRound(m.S, 0.001)) : "",
          desc: "A 4 by 4 grid of the 16 response tables, Alice’s replies (x = 0, x = 1) down the side and Bob’s across the top. Eight have S = +2 and win rate 3/4; eight have S = −2 and win rate 1/4. "
            + (m.ok ? "The mixer’s expected win rate is " + ebBoth(m.win) + ", against the bound 3/4." : "")
        };
      },
      checks: {
        a: ["Every table has S = +2 or −2, and P(win) = 1/2 + S/8.", "Flipping both of Alice’s replies turns S into −S.", c => {
          const n = c.whole("a-n");
          return ebGrade(n === 8, "Count the tables marked S = +2 in the grid or the list.",
            "8 tables have S = +2 and win 3 of the 4 input pairs; the other 8 have S = −2 and win only 1. Flipping both of Alice’s replies pairs each table with one of opposite sign, so the split is exactly even.");
        }],
        b: ["Any table with S = +2 wins 3/4 on its own.", "Mix two different S = +2 tables, for example with weights 1/2 and 1/2.", c => {
          const r = ebMixGrader(c, 0.75);
          if (!r.m) return r;
          if (r.m.used.size < 2) return ebSetup("Give positive weight to at least two different tables.");
          return ebGrade(r.ok, "Your mixture wins " + ebBoth(r.m.win) + " on average. Use only tables with S = +2.",
            "Your mixture has S = " + ebBoth(r.m.S) + " and expected win rate " + ebBoth(r.m.win) + ". A mixture reaches 3/4 only if every table in it has S = +2: any weight on an S = −2 table pulls the average down.");
        }],
        c: ["5/8 = 1/2 + S/8 needs S = 1.", "w on an S = +2 table and 1 − w on an S = −2 table gives S = 4w − 2.", c => {
          const r = ebMixGrader(c, 5 / 8);
          if (!r.m) return r;
          return ebGrade(r.ok, "Your mixture wins " + ebBoth(r.m.win) + " on average. Aim for S_mix = 1.",
            "Your mixture has S = " + ebBoth(r.m.S) + ", so P(win) = 1/2 + 1/8 = 5/8. For example 3/4 on table 0 (S = +2) and 1/4 on table 8 (S = −2): S = 3/2 − 1/2 = 1.");
        }],
        d: ["S_mix = Σ w S for weights w that add to 1.", "A private coin is one more random variable that the strategy can include in λ.", c => {
          if (c.choice("d-why") !== "average") return ebGrade(false, "Think about what mixing does to S: it averages.");
          return ebGrade(c.choice("d-coin") === "mixture", "The first part is right. Is a private coin really new, or another way of choosing a table?",
            "Each table has S = ±2, and a mixture’s S is their weighted average, so |S_mix| ≤ 2 and P(win) ≤ 3/4. Private coins only choose among tables, so they are part of the mixture too. Beating 3/4 on average needs something no table provides.");
        }]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 6–9 · The quantum CHSH strategy, statistics, Mermin and the Designer.
  // ---------------------------------------------------------------------------
  const EB_AXES = ["a0", "a1", "b0", "b1"];
  const EB_TSIRELSON = 2 * Math.SQRT2;
  const EB_TILT = 22;
  // The four axes from a station's controls, or null while one is unreadable.
  function ebFour(c, strict = false) {
    const v = EB_AXES.map(name => (strict ? c.ans(name) : c.number(name)));
    if (v.some(x => !Number.isFinite(x))) return null;
    const corr = ebCorrs([v[0], v[1]], [v[2], v[3]]), S = ebChsh(corr);
    return { v, corr, S, wins: corr.map(ebPairWin), win: ebWin(S) };
  }
  const ebFourText = m => "α₀ = " + ebDeg(m.v[0]) + ", α₁ = " + ebDeg(m.v[1]) + ", β₀ = " + ebDeg(m.v[2]) + ", β₁ = " + ebDeg(m.v[3]) + ". "
    + EB_PAIRS.map((p, k) => "E" + p + " = " + ebBoth(m.corr[k])).join(", ") + ". S = " + ebBoth(m.S) + ", P(win) = " + ebBoth(m.win) + ".";
  // Analyzer arrows, with labels nudged apart when two axes coincide.
  function ebAxisArrows(v) {
    const names = ["α₀", "α₁", "β₀", "β₁"], tones = ["alpha", "alpha", "beta", "beta"];
    return v.map((deg, k) => ({ deg, tone: tones[k], label: names[k], dashed: k % 2 === 1, stack: v.slice(0, k).filter(d => ebSameAngle(d, deg, 8)).length }));
  }
  const ebIsLabSet = v => [0, 90, 225, 135].every((d, k) => ebSameAngle(v[k], d));

  // 7 · How Many Rounds?
  const EB_P = { quantum: Math.cos(Math.PI / 8) ** 2, classical: 0.75 };
  const ebSHat = (wins, n) => 8 * wins / n - 4;
  function ebExperiment(rng, p, n) {
    let wins = 0;
    for (let k = 0; k < n; k++) if (rng() < p) wins += 1;
    return wins;
  }

  // 8 · Mermin's Device. Settings 1, 2, 3 are axes 0°, 120°, 240°.
  const EB_MERMIN_AXES = [0, 120, 240];
  const ebMerminAgree = (c, i, j) => (c.val("device") === "quantum"
    ? (1 + Math.cos((EB_MERMIN_AXES[i] - EB_MERMIN_AXES[j]) * EB_RAD)) / 2
    : Number(c.val("s" + (i + 1)) === c.val("s" + (j + 1))));

  const ebStations2 = {
    // 6 · Angle Tuner ---------------------------------------------------------------------------------------
    tuner: {
      manual: ["yaw"],
      load(c, check) { if (check === "d") [0, 90, 225, 135].forEach((d, k) => c.set(EB_AXES[k], d)); },
      play(c) { c.field("view3d").checked = true; },
      tick(c, dt) {
        let yaw = c.number("yaw") + 24 * dt;
        if (yaw > 180) yaw -= 360;
        c.set("yaw", ebTidy(yaw));
      },
      show(c) {
        const m = ebFour(c);
        if (!m) return ebNoAngles(c);
        const view3d = c.checked("view3d"), yaw = c.number("yaw");
        c.put("state", ebFourText(m) + (m.S > 2 + 1e-9 ? " This beats the classical bound |S| ≤ 2." : m.S < -2 - 1e-9 ? " |S| beats 2, with the sign reversed." : " |S| ≤ 2: no quantum advantage at these axes."));
        const arrows = ebAxisArrows(m.v);
        const desc = "Analyzer directions in the X–Z plane: Alice’s α₀ at " + ebDeg(m.v[0]) + " and α₁ at " + ebDeg(m.v[1]) + ", Bob’s β₀ at " + ebDeg(m.v[2]) + " and β₁ at " + ebDeg(m.v[3]) + ", measured from +z toward +x. S = " + ebBoth(m.S) + ".";
        if (view3d) {
          const view = { yaw: Number.isFinite(yaw) ? yaw : -60, tilt: EB_TILT, arrows };
          return { panels: [{ kind: "dial", caption: "analyzers, S = " + ebFmt(ebRound(m.S, 0.001)), view, arrows, note: "Alice blue, Bob violet; dashed = the input-1 axis" }], scene3d: view, caption: "3D view", desc: desc + " Shown in 3D, turned " + ebDeg(view.yaw) + "." };
        }
        return {
          panels: [{ kind: "dial", caption: "analyzers", weight: 1.05, arrows, note: "dashed = the input-1 axis" },
            ebMatrixPanel("correlations", [...EB_PAIRS.map((p, k) => ["E" + p, ebSigned(ebRound(m.corr[k], 0.0001))]), ["S", ebSigned(ebRound(m.S, 0.0001))]], { weight: 0.95, tones: [0, 1, 2, 3, 4].map(k => [k === 4 ? "angle" : "ink", k === 4 ? "angle" : (m.corr[k] ?? 0) >= 0 ? "plus" : "warn"]) })],
          caption: "S = " + ebFmt(ebRound(m.S, 0.001)),
          desc
        };
      },
      checks: {
        a: ["Every Alice–Bob pair should be 45° or 135° apart, with the 11 pair the odd one out.", "Rotate the lesson’s set: add 45° to every axis.", c => {
          const m = ebFour(c, true);
          if (ebIsLabSet(m.v)) return ebSetup("That is the lesson’s arrangement. Change at least one axis and keep S = 2√2.");
          return ebGrade(m.S >= EB_TSIRELSON - 0.005, "Your S is " + ebBoth(m.S) + ". Keep Alice’s two axes 90° apart and Bob’s two 90° apart.",
            "Your axes give S = " + ebBoth(m.S) + ". Rotating all four axes together keeps every δ, so α = 45°/135° and β = 270°/180° work as well as the lesson’s set. 2√2 ≈ 2.828 is as high as the singlet goes.");
        }],
        b: ["Add 180° to both of Bob’s axes in a 2√2 arrangement: every E flips sign.", "Use signed S in P(win) = 1/2 + S/8.", c => {
          const m = ebFour(c, true);
          if (m.S > -EB_TSIRELSON + 0.005) return ebSetup("Your S is " + ebBoth(m.S) + ". Find axes with S = −2√2 first.");
          return ebGrade(ebFits(c.ans("b-p"), (2 - Math.SQRT2) / 4), "Check the win rate: put the signed S = −2√2 into 1/2 + S/8.",
            "P(win) = 1/2 − 2√2/8 = (2 − √2)/4 ≈ 0.146. The correlations are just as strong, but they point the wrong way for this game’s rule. Using |S| would wrongly give 85%.");
        }],
        c: ["With α₀ = α₁ = α, S = E(α, β₀) + E(α, β₁) + E(α, β₀) − E(α, β₁).", "So S = 2E(α, β₀), which is largest when β₀ is opposite α.", c => {
          const m = ebFour(c, true);
          if (!ebSameAngle(m.v[0], m.v[1])) return ebSetup("Set α₀ and α₁ to the same axis first.");
          if (m.S < 2 - 0.005) return ebGrade(false, "Your S is " + ebBoth(m.S) + ". With one axis for Alice, S = 2E(α, β₀). Make that as big as possible.");
          return ebGrade(ebFits(c.ans("c-max"), 2), "You reached S = " + ebBoth(m.S) + ". Is that the largest possible value?",
            "With α₀ = α₁, the β₁ terms cancel and S = 2E(α, β₀) = −2cos(α − β₀) ≤ 2. A single question for Alice leaves nothing a classical table can’t match: β₀ = α + 180° reaches exactly 2.");
        }],
        d: ["S = √2 + (sin β₁ − cos β₁) with the other three axes fixed.", "That equals 2 at β₁ ≈ 69.5° or 200.5°.", c => {
          const m = ebFour(c, true);
          if (![0, 90, 225].every((d, k) => ebSameAngle(m.v[k], d))) return ebSetup("Keep α₀ = 0°, α₁ = 90° and β₀ = 225°; move only β₁. Reopen the mission to reload them.");
          return ebGrade(Math.abs(m.S - 2) <= 0.005, "Your S is " + ebBoth(m.S) + ". Move β₁ until S = 2; a decimal such as 69.5 in the box helps.",
            "At β₁ = " + ebDeg(m.v[3]) + ", S = " + ebBoth(m.S) + ". The quantum advantage is lost long before the axes are far from optimal: β₁ only moved about 65° from 135°. Between the two crossings, β₁ near 135° keeps S above 2.");
        }],
        e: ["Look at the two blue arrows in your 2√2 arrangement.", "In the lesson’s set, α₀ = 0° and α₁ = 90°.", c => {
          const m = ebFour(c, true);
          if (Math.abs(m.S) < EB_TSIRELSON - 0.005) return ebSetup("Set up an arrangement with S = 2√2 (or −2√2) first. Your S is " + ebBoth(m.S) + ".");
          return ebGrade(Math.abs(Math.abs(ebWrap(c.ans("e-ang"))) - 90) <= 0.5, "Measure the angle between α₀ and α₁ in your arrangement.",
            "Alice’s two analyzers are 90° apart in every optimal arrangement, and so are Bob’s. Each of Bob’s axes sits 45° from one of Alice’s and 135° from the other.");
        }]
      }
    },

    // 7 · How Many Rounds? ---------------------------------------------------------------------------------
    rounds: {
      actions: {
        one(c) {
          const seed = ebNeedSeed(c), n = c.whole("n", 1), strat = c.val("strat");
          if (n > 5000) throw new EbFieldError(c.field("n"), "Use at most 5000 rounds.", true);
          const run = ebRun(c, "own-" + strat, strat === "quantum" ? 21 : 22, () => ({ list: [] }));
          const wins = ebExperiment(run.rng, EB_P[strat], n);
          const S = ebSHat(wins, n);
          run.list.push({ n, wins, S });
          return "Experiment " + run.list.length + " (" + strat + ", seed " + seed + "): " + wins + " wins in " + n + " rounds, so Ŝ = 8 × " + wins + "/" + n + " − 4 = " + ebFmt(ebRound(S, 0.001)) + (S > 2 ? ", above 2." : ", not above 2.");
        },
        repeat(c) {
          const seed = ebNeedSeed(c), n = c.whole("n", 1), strat = c.val("strat");
          if (n > 5000) throw new EbFieldError(c.field("n"), "Use at most 5000 rounds.", true);
          const run = ebRun(c, "batch-" + strat, strat === "quantum" ? 23 : 24);
          run.batch = { n, list: Array.from({ length: 100 }, () => ebSHat(ebExperiment(run.rng, EB_P[strat], n), n)) };
          const low = run.batch.list.filter(S => S <= 2).length;
          return "Repeated 100 " + strat + " experiments of " + n + " rounds (seed " + seed + "). " + low + " of 100 had Ŝ ≤ 2.";
        },
        clear(c) { c.s.runs = {}; return "Experiments cleared. With the same seed, the next experiments repeat the same results."; },
        reseed(c) { return "New seed " + ebReseed(c) + ". Experiments cleared."; }
      },
      show(c) {
        const strat = c.val("strat"), p = EB_P[strat], n = c.quiet("n");
        const own = ebLive(c, "own-" + strat), batch = ebLive(c, "batch-" + strat)?.batch;
        const se = n && n > 0 ? 8 * Math.sqrt(p * (1 - p) / n) : null;
        const last = own?.list.at(-1);
        const stats = batch ? (() => {
          const mean = ebSum(batch.list) / 100, sd = Math.sqrt(ebSum(batch.list.map(S => (S - mean) ** 2)) / 99);
          return { mean, sd, low: batch.list.filter(S => S <= 2).length / 100 };
        })() : null;
        c.put("state", (strat === "quantum" ? "Quantum strategy: p = cos²(π/8) ≈ 0.8536, expected S = 2√2." : "Best classical table: p = 3/4, expected S = 2.")
          + (se ? " For N = " + n + ", the standard error of Ŝ is 8√(p(1 − p)/N) ≈ " + ebFmt(ebRound(se, 0.0001)) + "." : " Enter N to see the standard error.")
          + (last ? " Your latest experiment: N = " + last.n + ", " + last.wins + " wins, Ŝ = " + ebFmt(ebRound(last.S, 0.001)) + "." : "")
          + (stats ? " Batch of 100 at N = " + batch.n + ": mean Ŝ = " + ebFmt(ebRound(stats.mean, 0.001)) + ", spread " + ebFmt(ebRound(stats.sd, 0.001)) + ", fraction with Ŝ ≤ 2 = " + ebFmt(stats.low) + "." : ""));
        c.list("mine", own ? own.list.map((e, k) => "Experiment " + (k + 1) + ": N = " + e.n + ", " + e.wins + " wins, Ŝ = " + ebFmt(ebRound(e.S, 0.001))) : []);
        const bins = Array.from({ length: 40 }, (_, k) => ({ x0: k / 10, x1: (k + 1) / 10, y: 0 }));
        for (const S of batch?.list ?? []) { const k = ebClamp(Math.floor(S * 10 + 1e-9), 0, 39); bins[k].y += 1 / 100; }
        const top = Math.max(0.1, ...bins.map(b => b.y));
        const ymax = Math.ceil(top * 10) / 10;
        return {
          panels: [ebChart(batch ? "Ŝ for 100 experiments of N = " + batch.n : "no repeated batch yet", {
            x: [0, 4], y: [0, ymax], xTicks: [0, 1, 2, 3, 4], yTicks: [0, ymax / 2, ymax], xLabel: "Ŝ = 8 × wins/N − 4",
            rects: bins.map(b => ({ ...b, tone: b.x0 < 2 - 1e-9 ? "warn" : "plus" })),
            vlines: [{ x: 2, tone: "warn", label: "2" }, { x: EB_TSIRELSON, tone: "plus", label: "2√2" }, ...(last ? [{ x: ebClamp(last.S, 0, 4), tone: "angle", dashed: true, label: "your run" }] : [])]
          })],
          caption: strat,
          desc: (batch ? "A histogram of Ŝ for 100 experiments of " + batch.n + " rounds, with lines at 2 and 2√2. Mean " + ebFmt(ebRound(stats.mean, 0.001)) + ", " + Math.round(stats.low * 100) + " of 100 at or below 2." : "No batch yet; lines mark 2 and 2√2.") + (last ? " Your latest experiment gave Ŝ = " + ebFmt(ebRound(last.S, 0.001)) + "." : "")
        };
      },
      checks: {
        a: ["cos²(π/8) sin²(π/8) = (sin(π/4)/2)².", "Ŝ = 8 × (win fraction) − 4, so its standard error is 8√(p(1 − p)/N).", c => {
          if (!ebFits(c.ans("a-pq"), 1 / 8)) return ebGrade(false, "Check p(1 − p). Use 2 sin θ cos θ = sin 2θ with θ = π/8.");
          return ebGrade(ebFits(c.ans("a-se"), Math.sqrt(0.08)), "p(1 − p) = 1/8 is right. Now multiply the win fraction’s standard error by 8.",
            "p(1 − p) = cos²(π/8) sin²(π/8) = sin²(π/4)/4 = 1/8. The win fraction has standard error √(1/(8N)), so Ŝ has 8√(1/(8N)) = √(8/N). At N = 100 that is √0.08 ≈ 0.283.");
        }],
        b: ["You need 3 × √(8/N) ≤ 2√2 − 2 ≈ 0.828.", "Square both sides: N ≥ 72/0.6863 ≈ 104.9.", c => {
          const n = c.whole("b-n", 1);
          if (n < 105) return ebGrade(false, "At N = " + n + ", three standard errors are " + ebFmt(ebRound(3 * Math.sqrt(8 / n), 0.001)) + ", more than the gap 2√2 − 2 ≈ 0.828.");
          if (n > 115) return ebGrade(false, "N = " + n + " works but is more than 10% above the smallest N. Find the smallest.");
          const run = ebLive(c, "own-quantum"), mine = run?.list.filter(e => e.n === n).at(-1);
          if (!mine) return ebSetup("Now run one quantum experiment with N = " + n + " (set the strategy and N, then Run one experiment).");
          return ebGrade(c.choice("b-over") === (mine.S > 2 ? "yes" : "no"), "Look at your experiment at N = " + n + ": Ŝ = " + ebFmt(ebRound(mine.S, 0.001)) + ".",
            "N ≥ 72/(2√2 − 2)² ≈ 104.9, so N = 105. Your experiment at N = " + n + " gave Ŝ = " + ebFmt(ebRound(mine.S, 0.001)) + ". Three standard errors means a run like this falls to 2 or below only about once in 700, but it still can. Real Bell tests use thousands of rounds.");
        }],
        c: ["Count the bars left of the line at 2.", "At N = 50 the standard error is √(8/50) = 0.4, and 2√2 − 2 ≈ 0.83 is about 2.07 of them.", c => {
          const batch = ebLive(c, "batch-quantum")?.batch;
          if (!batch || batch.n !== 50) return ebSetup("Repeat 100 quantum experiments with N = 50 first.");
          const low = batch.list.filter(S => S <= 2).length / 100;
          if (Math.abs(c.ans("c-frac") - low) > 0.01 + 1e-9) return ebGrade(false, "Check your fraction: the readout gives the share of your batch with Ŝ ≤ 2.");
          return ebGrade(c.choice("c-pick") === "2", "Your fraction is right. How many standard errors is 2√2 above 2 at N = 50?",
            "Your batch had " + Math.round(low * 100) + " of 100 at or below 2. The expected share is about 2%, since 0.83/0.4 ≈ 2.07 standard errors. A short quantum run sometimes fails to beat 2, just as a short classical run sometimes beats it.");
        }],
        d: ["The classical runs center on Ŝ = 2.", "Ŝ > 2 needs more than 75 wins in 100 rounds; exactly 75 gives Ŝ = 2.", c =>
          ebGrade(c.choice("d-pick") === "half", "Where does a classical team’s Ŝ center?",
            "The bound |S| ≤ 2 limits the expected value, not a single run. With N = 100, Ŝ > 2 needs at least 76 wins, which happens about 45% of the time. A short winning run is never proof of entanglement.")]
      }
    },

    // 8 · Mermin's Device ----------------------------------------------------------------------------------
    mermin: {
      load(c, check) {
        if (check === "a") { c.field("device").value = "sets"; ["+", "+", "-"].forEach((s, k) => { c.field("s" + (k + 1)).value = s; }); c.s.runs = {}; }
        if (check === "d") c.field("device").value = "quantum";
      },
      // A new instruction set starts a new run; each device keeps its own run.
      edit(c, name) { if (/^s[123]$/.test(name) && c.s.runs) delete c.s.runs["run-sets"]; },
      actions: {
        run(c) {
          const seed = ebNeedSeed(c), device = c.val("device");
          const run = ebRun(c, "run-" + device, device === "quantum" ? 31 : 32, () => ({ n: 0, agree: 0, records: [] }));
          for (let k = 0; k < 90; k++) {
            const i = Math.floor(run.rng() * 3), j = Math.floor(run.rng() * 3);
            const p = ebMerminAgree(c, i, j), agree = run.rng() < p;
            run.n += 1;
            run.agree += Number(agree);
            run.records.push([i, j, agree]);
          }
          return "Ran 90 rounds of the " + (device === "quantum" ? "quantum" : "instruction-set") + " device (seed " + seed + "). The lights agreed on " + run.agree + " of " + run.n + ", a fraction of " + ebFmt(ebRound(run.agree / run.n, 0.001)) + ".";
        },
        clear(c) { c.s.runs = {}; return "Run cleared. With the same seed, the next rounds repeat."; },
        reseed(c) { return "New seed " + ebReseed(c) + ". Run cleared."; }
      },
      show(c) {
        const quantum = c.val("device") === "quantum";
        const P = [0, 1, 2].map(i => [0, 1, 2].map(j => ebMerminAgree(c, i, j)));
        const overall = ebSum(P.flat()) / 9, run = ebLive(c, "run-" + c.val("device"));
        const set = [1, 2, 3].map(k => c.val("s" + k) === "+" ? "+" : "−").join(", ");
        c.put("state", (quantum ? "Quantum device: settings at 0°, 120° and 240°." : "Instruction set (" + set + "): " + Math.round(overall * 9) + " of 9 setting pairs agree.")
          + " Expected agreement with random settings: " + ebNum(overall) + "." + (run && run.n ? " Your run: " + run.agree + " of " + run.n + " agreed (" + ebFmt(ebRound(run.agree / run.n, 0.001)) + ")." : ""));
        c.list("records", run ? run.records.slice(-20).map(([i, j, a], k) => "Round " + (run.n - Math.min(20, run.n) + k + 1) + ": settings " + (i + 1) + " and " + (j + 1) + ", lights " + (a ? "agree" : "differ")) : []);
        const cells = P.map(row => row.map(p => ({ text: quantum ? ebNum(p) : p ? "agree" : "differ", fill: p, tone: p > 0.5 ? "plus" : "warn" })));
        return {
          panels: [{ kind: "table", caption: quantum ? "P(lights agree), quantum" : "lights for (" + set + ")", weight: 1.25, rows: ["Alice 1", "Alice 2", "Alice 3"], cols: ["Bob 1", "Bob 2", "Bob 3"], cells, rowH: 58 },
            ebBars("agreement", [{ label: "theory", value: overall, text: ebNum(overall), tone: "angle" }, { label: "run", value: run && run.n ? run.agree / run.n : 0, text: run && run.n ? ebFmt(ebRound(run.agree / run.n, 0.001)) : "—", tone: "ink" }, { label: "5/9", value: 5 / 9, text: "5/9", tone: "guide", outline: true }], { weight: 0.75 })],
          caption: quantum ? "quantum" : "instruction set",
          desc: "A 3 by 3 grid of setting pairs, Alice’s setting down the side and Bob’s across the top, showing " + (quantum ? "the chance the lights agree: 1 on the diagonal and 1/4 elsewhere" : "whether the lights agree for the instruction set (" + set + ")") + ". Expected agreement " + ebNum(overall) + "; the instruction-set floor is 5/9."
        };
      },
      checks: {
        a: ["The 3 equal-setting pairs always agree.", "Settings 1 and 2 both say +, so the pairs (1, 2) and (2, 1) agree too.", c => {
          const n = c.whole("a-n");
          return ebGrade(n === 5, "Count the cells marked agree in the 3 by 3 grid for (+, +, −).",
            "The diagonal gives 3 agreements and the pairs (1, 2) and (2, 1) give 2 more: 5 of 9. The four pairs that involve setting 3 with setting 1 or 2 disagree.");
        }],
        b: ["(+, +, +) and (−, −, −) agree on all 9 pairs.", "Every other set has two of one color and one of the other.", c =>
          ebGrade(ebFits(c.ans("b-min"), 5 / 9), "Try a set with two of one color, such as (+, −, −).",
            "Uniform sets agree 9/9. Every mixed set agrees on 5 of 9 pairs. So any instruction-set model, or any random mixture of them, has P(agree) ≥ 5/9 ≈ 0.556.")],
        c: ["Bob’s light shows the opposite of his sign, so agree means unequal signs: P = (1 + cos δ)/2.", "cos 120° = −1/2. Then average: 1/3 of pairs are equal settings.", c => {
          if (!ebFits(c.ans("c-diff"), 0.25)) return ebGrade(false, "Check P(agree | different settings) = (1 + cos 120°)/2.");
          return ebGrade(ebFits(c.ans("c-all"), 0.5), "The 1/4 is right. Now weight it: equal settings 1/3 of the time, different 2/3.",
            "Different settings: (1 − 1/2)/2 = 1/4. Overall: (1/3)(1) + (2/3)(1/4) = 1/2. The quantum device agrees half the time, below the 5/9 every instruction set must reach.");
        }],
        d: ["Your fraction is agreements ÷ rounds, in the readout.", "One standard error is √(1/4 ÷ N): about 0.053 for 90 rounds.", c => {
          const run = ebLive(c, "run-quantum");
          if (c.val("device") !== "quantum" || !run || run.n < 90) return ebSetup("Switch to the quantum device and run at least 90 rounds first.");
          const f = run.agree / run.n, se = Math.sqrt(0.25 / run.n);
          if (Math.abs(c.ans("d-frac") - f) > 0.01 + 1e-9) return ebGrade(false, "Check your fraction: " + run.agree + " ÷ " + run.n + ".");
          const within = Math.abs(f - 0.5) <= 2 * se + 1e-12;
          return ebGrade(c.choice("d-pick") === (within ? "within" : "outside"), "Compare |" + ebFmt(ebRound(f, 0.001)) + " − 1/2| with 2 × " + ebFmt(ebRound(se, 0.001)) + ".",
            "Your fraction " + ebFmt(ebRound(f, 0.001)) + " is " + ebFmt(ebRound(Math.abs(f - 0.5) / se, 0.01)) + " standard errors from 1/2. The floor 5/9 is about " + ebFmt(ebRound((5 / 9 - 0.5) / se, 0.1)) + " standard errors above 1/2 at this N, so a few hundred rounds are needed to separate them convincingly.");
        }]
      }
    },

    // 9 · Strategy Designer -------------------------------------------------------------------------------
    designer: {
      load(c, check) { if (check === "d") { c.set("b0", 0); c.set("b1", 90); } },
      show(c) {
        const m = ebFour(c);
        if (!m) return ebNoAngles(c);
        const open = c.open();
        const target = { c: [1, 0.5, 0.5, 1] }[open] ?? null;
        c.put("state", ebFourText(m) + " Win probabilities by input pair: " + EB_PAIRS.map((p, k) => p + " " + ebBoth(m.wins[k])).join(", ") + ".");
        const bars = EB_PAIRS.map((p, k) => ({ label: p, value: m.wins[k], text: ebFmt(ebRound(m.wins[k], 0.001)), tone: "plus" }));
        if (target) target.forEach((t, k) => bars.push({ label: "goal " + EB_PAIRS[k], value: t, text: ebNum(t), tone: "angle", outline: true }));
        return {
          panels: [{ kind: "dial", caption: "your axes", weight: 0.85, arrows: ebAxisArrows(m.v) },
            ebBars("P(win | xy), S = " + ebFmt(ebRound(m.S, 0.001)), bars, { weight: target ? 1.4 : 1.15 })],
          caption: "S = " + ebFmt(ebRound(m.S, 0.001)),
          desc: "Your axes α₀ " + ebDeg(m.v[0]) + ", α₁ " + ebDeg(m.v[1]) + ", β₀ " + ebDeg(m.v[2]) + ", β₁ " + ebDeg(m.v[3]) + ", and bars of the win probability for input pairs 00, 01, 10, 11: " + m.wins.map(w => ebFmt(ebRound(w, 0.001))).join(", ") + (target ? ", next to the card’s targets " + target.map(ebNum).join(", ") : "") + ". S = " + ebBoth(m.S) + "."
        };
      },
      checks: {
        a: ["Start from a 2√2 arrangement and move one of Bob’s axes until S falls to 2.5.", "Or try α₀ = 120°, α₁ = 0°, β₀ = 240°, β₁ = 0°.", c => {
          const m = ebFour(c, true);
          return ebGrade(Math.abs(m.S - 2.5) <= 0.005, "Your S is " + ebBoth(m.S) + ". The card asks for 2.5.",
            "Your axes give S = " + ebBoth(m.S) + ", so P(win) = 1/2 + 2.5/8 = 0.8125. Countless arrangements give 2.5; this card only fixes S.");
        }],
        b: ["P(win | 11) = 1 needs E₁₁ = −1, so α₁ = β₁.", "Then S = 1 − cos α₀ − cos β₀ − cos(α₀ − β₀) when α₁ = β₁ = 0°. Spread three directions 120° apart.", c => {
          const m = ebFour(c, true);
          if (m.wins[3] < 0.995) return ebGrade(false, "P(win | 11) is " + ebBoth(m.wins[3]) + ". Make α₁ and β₁ equal.");
          return ebGrade(m.S >= 2.49, "Input 11 is a sure win. Your S is " + ebBoth(m.S) + "; spread α₀, β₀ and the shared axis 120° apart.",
            "With α₁ = β₁ and the other two axes 120° away in opposite directions, every other pair wins with probability 3/4 and S = 1.5 + 1 = 2.5. That is the most a certain win on 11 allows.");
        }],
        c: ["A certain win on 00 needs α₀ − β₀ = 180°, and on 11 needs α₁ = β₁.", "A coin flip needs the two axes 90° apart.", c => {
          const m = ebFour(c, true), want = [1, 0.5, 0.5, 1];
          const miss = EB_PAIRS.filter((_, k) => Math.abs(m.wins[k] - want[k]) > 0.005);
          return ebGrade(!miss.length, "Input pair" + (miss.length === 1 ? " " : "s ") + miss.join(", ") + (miss.length === 1 ? " is" : " are") + " off target.",
            "Your axes give 1, 1/2, 1/2, 1, so S = 1 + 0 + 0 + 1 = 2: exactly the classical bound. A classical table can’t hit these per-pair numbers, yet its average win rate can still reach 3/4.");
        }],
        d: ["With β₀ = 0° and β₁ = 90°, S = −(cos α₀ + sin α₀) + (sin α₁ − cos α₁).", "Each bracket is at most √2: α₀ = 225° and α₁ = 135°.", c => {
          const m = ebFour(c, true);
          if (!ebSameAngle(m.v[2], 0) || !ebSameAngle(m.v[3], 90)) return ebSetup("Keep Bob at β₀ = 0° and β₁ = 90° (reopen the mission to reload them).");
          return ebGrade(m.S >= EB_TSIRELSON - 0.005, "Your S is " + ebBoth(m.S) + ". Maximize each bracket separately.",
            "α₀ = 225° makes −(cos α₀ + sin α₀) = √2, and α₁ = 135° makes sin α₁ − cos α₁ = √2, so S = 2√2. The roles of Alice and Bob are symmetric: fixing either side, the other can always reach 2√2.");
        }]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 10–13 · Error Detective, the EPR preview, Loophole Lab and E91.
  // ---------------------------------------------------------------------------
  // 10 · Error Detective: the first wrong line, and what each solution claimed next to the truth.
  const EB_CASES = {
    signal: { line: "4", claim: "Bob’s + fraction: depends on α", truth: "Bob’s + fraction: 1/2 for every α",
      work: "Lines 1–3 are right: the correlation E does depend on α. But Bob’s own record is 50/50 either way: P(Bob +1) = [(1 + E) + (1 − E)]/4 = 1/2. He can only see the correlation by comparing lists with Alice, which needs an ordinary signal. No message travels faster than light." },
    short: { line: "4", claim: "9 of 10 wins: proof of entanglement", truth: "9 of 10 wins: about 24% likely for a classical team",
      work: "The bound limits the expected win rate, not a 10-round sample. The all-zero table wins each round with probability 3/4, so 9 or more wins in 10 happens with probability 10(3/4)⁹(1/4) + (3/4)¹⁰ ≈ 0.244. A convincing test needs enough rounds for the standard error to be small (station 7)." },
    sign: { line: "4", claim: "S = q + q + q + (−q) = √2", truth: "S = q + q + q − (−q) = 2√2",
      work: "The CHSH sum subtracts E₁₁: S = E₀₀ + E₀₁ + E₁₀ − E₁₁ = q + q + q − (−q) = 4q = 2√2. These axes are the lesson’s optimal set rotated by 45°, so they reach the quantum maximum." },
    marginal: { line: "3", claim: "P(Alice +1) = P(+1, +1) = 1/8", truth: "P(Alice +1) = 1/8 + 3/8 = 1/2",
      work: "Alice gets +1 whatever Bob gets, so add both joint cells: P(Alice +1) = P(+1, +1) + P(+1, −1) = 1/8 + 3/8 = 1/2. Each observer’s local results are 50/50 for every pair of axes, so turning β never changes Alice’s odds." },
    unsigned: { line: "3", claim: "P(win) = 1/2 + |S|/8 ≈ 85%", truth: "P(win) = 1/2 + S/8 ≈ 15%",
      work: "The formula P(win) = 1/2 + S/8 uses signed S. With S = −2√2, P(win) = 1/2 − √2/4 ≈ 0.146. The correlations are strong but point the wrong way for this game’s rule; flipping all of Bob’s outputs would turn this into an 85% strategy." }
  };
  const EB_KIND_HINT = {
    signal: "Which line claims more than the probabilities support? Think about what Bob alone can see.",
    short: "Which line draws a conclusion from too few rounds?",
    sign: "Check each correlation, then check how the four enter S.",
    marginal: "Which line computes a single observer’s probability? Did it sum over the other observer’s results?",
    unsigned: "Which line puts S into the win formula?"
  };
  function ebCaseGrader(kind) {
    return c => {
      const line = c.choice(kind + "-line"), chosen = c.choice(kind + "-kind"), card = EB_CASES[kind];
      if (line !== card.line) return ebGrade(false, Number(line) < Number(card.line) ? "Line " + line + " is correct. Keep reading." : "Something goes wrong before line " + line + ".");
      return ebGrade(chosen === kind, "Right line. Now name the mistake it makes.", card.work);
    };
  }

  // 12 · Loophole Lab. The detection model: guessing pairs win whenever both detectors fire.
  const EB_C = 299792458;
  const ebLoopW = w => (3 - 2 * w) / (4 - 3 * w);
  const EB_EVENTS = { 1972: "fc", 1982: "aspect", 2015: "free", 2022: "nobel" };

  // 13 · E91. Alice's axes 0°, 45°, 90°; Bob's 45°, 90°, 135°.
  const EB_E91_A = [0, 45, 90], EB_E91_B = [45, 90, 135];
  // CHSH labels: x = 0 → 90°, x = 1 → 0°; y = 0 → 45°, y = 1 → 135°.
  const EB_E91_X = { 90: 0, 0: 1 }, EB_E91_Y = { 45: 0, 135: 1 };
  const ebMysteryF = seed => (ebRng(seed * 13 + 5)() < 0.5 ? 1 : 0);
  function ebE91Round(rng, f) {
    const al = EB_E91_A[Math.floor(rng() * 3)], be = EB_E91_B[Math.floor(rng() * 3)];
    let u, v;
    if (rng() < f) {
      // Eve measures Bob's particle along θ, gets s, and resends it; Alice's half is left opposite.
      const theta = rng() * 360, s = rng() < 0.5 ? 1 : -1;
      u = rng() < (1 - s * Math.cos((al - theta) * EB_RAD)) / 2 ? 1 : -1;
      v = rng() < (1 + s * Math.cos((be - theta) * EB_RAD)) / 2 ? 1 : -1;
    } else {
      [u, v] = EB_SIGNS[ebPick(rng, ebSinglet(al, be))];
    }
    return { al, be, u, v };
  }
  function ebE91Stats(run) {
    const E = [0, 1, 2, 3].map(k => (run.n4[k] ? run.sum4[k] / run.n4[k] : 0));
    const errors = run.key.filter(([a, b]) => a !== b).length;
    return { E, S: ebChsh(E), ready: run.n4.every(n => n > 0), errors, rate: run.key.length ? errors / run.key.length : 0 };
  }

  const ebStations3 = {
    // 10 · Error Detective ---------------------------------------------------------------------------------
    detective: {
      show(c) {
        const open = c.open(), card = open ? EB_CASES[open] : null, solved = open && c.revealed(open);
        c.put("state", !open ? "Open a case file to begin." : solved ? "Solved. Claimed: " + card.claim + ". Actually: " + card.truth + "." : "Find the first wrong line, then name the mistake.");
        return {
          panels: [{ kind: "rows", caption: open ? (solved ? "claim against truth" : "case open") : "no case open", indent: 120, gap: 46,
            rows: card ? [{ label: "Claimed", text: card.claim, tone: "warn" }, { label: "Actually", text: solved ? card.truth : "solve the case to see", tone: solved ? "plus" : "guide" }] : [{ label: "", text: "Open a case file below.", tone: "guide" }] }],
          caption: open ? (solved ? "solved" : "open") : "",
          desc: card ? "The case’s claim: " + card.claim + ". " + (solved ? "The truth: " + card.truth + "." : "The truth appears once the case is solved.") : "No case is open."
        };
      },
      checks: Object.fromEntries(Object.keys(EB_CASES).map(kind => [kind, [EB_KIND_HINT[kind], "Exactly one line is wrong; every line before it is correct.", ebCaseGrader(kind)]]))
    },

    // 11 · Quantum Preview: EPR ---------------------------------------------------------------------------
    preview: {
      show(c) {
        const measure = c.val("measure"), L = c.quiet("L"), x1 = c.quiet("x1"), p1 = c.quiet("p1");
        if ([L, x1, p1].some(v => v === null)) {
          c.put("state", "Fill each box with a number.");
          return { panels: [], caption: "", desc: "A box is empty or unreadable." };
        }
        const lines = measure === "x"
          ? [{ text: "Alice measures x₁ = " + ebNum(x1), tone: "alpha" }, { text: "so x₂ = x₁ − L = " + ebNum(x1 - L), tone: "beta" }]
          : [{ text: "Alice measures p₁ = " + ebNum(p1), tone: "alpha" }, { text: "so p₂ = −p₁ = " + ebNum(-p1), tone: "beta" }];
        c.put("state", lines.map(l => l.text).join(", ") + ", with certainty and without touching particle 2. EPR asked: was that value there all along?");
        return {
          panels: [{ kind: "epr", caption: "x₁ − x₂ = " + ebNum(L) + " and p₁ + p₂ = 0", lines, mark: 2 }],
          caption: measure === "x" ? "position" : "momentum",
          desc: "Two particles fly apart from a source. " + lines.map(l => l.text).join(", ") + "."
        };
      },
      checks: {
        a: ["EPR asked what you can predict without disturbing a system.", "Their phrase was “element of physical reality”.", c =>
          ebGrade(c.choice("a-pick") === "reality", "Which choice describes a prediction made without disturbing the system?",
            "EPR: “If, without in any way disturbing a system, we can predict with certainty the value of a physical quantity, then there exists an element of physical reality corresponding to this physical quantity.” Bell’s theorem shows that local elements of reality of this kind can’t reproduce the quantum correlations.")],
        b: ["x₂ = x₁ − L.", "p₂ = −p₁.", c => {
          if (!ebFits(c.ans("b-x2"), 2)) return ebGrade(false, "Check x₂. The source fixes x₁ − x₂ = 3.");
          return ebGrade(ebFits(c.ans("b-p2"), -2), "x₂ is right. Now use p₁ + p₂ = 0.",
            "x₂ = 5 − 3 = 2 and p₂ = −2. Either prediction is certain, but Alice can make only one of the two measurements on each pair.");
        }],
        c: ["Recall the No-Signaling Check (station 4).", "Bob’s own statistics never depend on what Alice chooses to measure.", c =>
          ebGrade(c.choice("c-pick") === "no", "What did station 4 show about Bob’s marginal?",
            "As with the spins, Alice’s choice shows up only when the two records are compared. Bob’s own list of positions or momenta looks the same whatever Alice does, so EPR correlations can’t send a signal either.")],
        d: ["Position isn’t limited to a short list of values.", "Lesson 20 is called Wavefunctions.", c =>
          ebGrade(c.choice("d-pick") === "continuous", "How many possible values does a position have?",
            "A position can take any value on a line, so Lesson 20 replaces the finite list of amplitudes with a wavefunction: an amplitude for every position, whose squared magnitude is a probability density.")]
      }
    },

    // 12 · Loophole Lab ----------------------------------------------------------------------------------
    loophole: {
      load(c, check) {
        if (check === "a") { c.field("mode").value = "detect"; c.set("w", 0.5); c.s.runs = {}; }
        if (check === "c") { c.field("mode").value = "locality"; c.set("d", 400); }
        if (check === "e") c.field("mode").value = "timeline";
      },
      edit(c, name) { if (/^w(-range)?$/.test(name)) c.s.runs = {}; },
      actions: {
        run(c) {
          const seed = ebNeedSeed(c), w = c.ans("w");
          if (w < 0 || w > 0.7) throw new EbFieldError(c.field("w"), "Use a fraction from 0 to 0.7.", true);
          const run = ebRun(c, "detect", 41, () => ({ pairs: 0, clicksA: 0, coinc: 0, wins: 0 }));
          for (let k = 0; k < 1000; k++) {
            const x = run.rng() < 0.5 ? 1 : 0, y = run.rng() < 0.5 ? 1 : 0;
            const guess = run.rng() < w;
            const gx = run.rng() < 0.5 ? 1 : 0, gy = run.rng() < 0.5 ? 1 : 0;
            const clickA = !guess || gx === x, clickB = !guess || gy === y;
            run.pairs += 1;
            run.clicksA += Number(clickA);
            if (clickA && clickB) {
              run.coinc += 1;
              // Guessing pairs carry outputs that win for the guessed settings; the rest use the all-zero table.
              run.wins += Number(guess || (x & y) === 0);
            }
          }
          return "Ran 1000 pairs at w = " + ebFmt(w) + " (seed " + seed + "). Coincidences " + run.coinc + " of " + run.pairs + "; wins on coincidences " + run.wins + ", a rate of " + ebFmt(ebRound(run.wins / run.coinc, 0.001)) + ".";
        },
        clear(c) { c.s.runs = {}; return "Run cleared. With the same seed, the next pairs repeat."; },
        reseed(c) { return "New seed " + ebReseed(c) + ". Run cleared."; }
      },
      show(c) {
        const mode = c.val("mode");
        for (const block of c.panel.querySelectorAll("[data-eb-when]")) block.hidden = block.dataset.ebWhen !== mode;
        if (mode === "timeline") {
          c.put("state", "1972 Freedman–Clauser, 1982 Aspect, 2015 loophole-free tests, 2022 Nobel Prize. Match them in the mission.");
          return {
            panels: [{ kind: "timeline", caption: "closing the loopholes", span: [1965, 2025], events: [
              { year: 1972, title: "Freedman–Clauser", sub: "first CHSH test", tone: "alpha" },
              { year: 1982, title: "Aspect", sub: "settings switched in flight", tone: "beta" },
              { year: 2015, title: "loophole-free", sub: "Delft, Vienna, NIST", tone: "plus" },
              { year: 2022, title: "Nobel Prize", sub: "Aspect, Clauser, Zeilinger", tone: "angle" }] }],
            caption: "timeline",
            desc: "A timeline: 1972 Freedman and Clauser’s first CHSH test; 1982 Aspect’s experiment with settings switched while the photons were in flight; 2015 the first loophole-free tests at Delft, Vienna and NIST; 2022 the Nobel Prize to Aspect, Clauser and Zeilinger."
          };
        }
        if (mode === "locality") {
          const d = c.number("d"), t = c.number("t");
          if (![d, t].every(Number.isFinite) || d <= 0 || t < 0) {
            c.put("state", "Enter a positive distance and a time of 0 or more.");
            return { panels: [], caption: "", desc: "A box is empty or unreadable." };
          }
          const light = d / EB_C * 1e6, ok = t < light;
          c.put("state", "Light needs " + ebFmt(ebRound(light, 0.0001)) + " μs to cross " + ebFmt(d) + " m. Each measurement finishes " + ebFmt(t) + " μs after its setting choice, "
            + (ok ? "so neither setting can reach the other side in time: locality is enforced." : "so a light-speed signal from one setting could reach the other measurement: a local model could use it."));
          return {
            panels: [{ kind: "spacetime", caption: ok ? "spacelike: closed" : "timelike: loophole open", d, t, light }],
            caption: ok ? "locality enforced" : "loophole open",
            desc: "A spacetime diagram with Alice and Bob " + ebFmt(d) + " m apart. Light lines from each setting choice reach the other side after " + ebFmt(ebRound(light, 0.001)) + " μs; the measurements finish at " + ebFmt(t) + " μs, " + (ok ? "before" : "after") + " the light arrives."
          };
        }
        const w = c.quiet("w"), run = ebLive(c, "detect");
        if (w === null) { c.put("state", "Enter w, a fraction from 0 to 0.7."); return { panels: [], caption: "", desc: "The w box is empty or unreadable." }; }
        const W = ebLoopW(w), obs = run && run.coinc ? run.wins / run.coinc : null;
        c.put("state", "Model at w = " + ebFmt(w) + ": coincidence win rate W = (3 − 2w)/(4 − 3w) = " + ebBoth(W) + ", apparent S = 8W − 4 = " + ebBoth(8 * W - 4) + ", detection efficiency per side η = 1 − w/2 = " + ebBoth(1 - w / 2) + "."
          + (run ? " Your run: " + run.coinc + " coincidences in " + run.pairs + " pairs, Alice’s detector fired on " + run.clicksA + "; observed W = " + ebFmt(ebRound(obs ?? 0, 0.001)) + ", apparent S = " + ebFmt(ebRound(8 * (obs ?? 0) - 4, 0.001)) + "." : " Run pairs to simulate it."));
        return {
          panels: [ebBars("coincidences only", [
            { label: "W model", value: W, text: ebFmt(ebRound(W, 0.001)), tone: "minus" },
            { label: "W run", value: obs ?? 0, text: obs === null ? "—" : ebFmt(ebRound(obs, 0.001)), tone: "ink" },
            { label: "3/4", value: 0.75, text: "3/4", tone: "guide", outline: true },
            { label: "η", value: 1 - w / 2, text: ebFmt(ebRound(1 - w / 2, 0.001)), tone: "angle" }])],
          caption: "apparent S = " + ebFmt(ebRound(8 * W - 4, 0.001)),
          desc: "Bars: the model’s coincidence win rate " + ebFmt(ebRound(W, 0.001)) + ", your run’s " + (obs === null ? "(none yet)" : ebFmt(ebRound(obs, 0.001))) + ", the classical 3/4, and the detection efficiency " + ebFmt(ebRound(1 - w / 2, 0.001)) + "."
        };
      },
      checks: {
        a: ["W = (3 − 2w)/(4 − 3w) with w = 1/2.", "Then S = 8W − 4, and η = 1 − w/2.", c => {
          if (!ebFits(c.ans("a-s"), 2.4)) return ebGrade(false, "Check the apparent S: W = (3 − 1)/(4 − 1.5) = 2/2.5.");
          return ebGrade(ebFits(c.ans("a-eta"), 0.75), "The apparent S is right. In a guessing pair a detector fires only half the time.",
            "W = 2/2.5 = 4/5, so the apparent S = 8(4/5) − 4 = 2.4, above 2, from a purely local model. Each detector fires on 1 − w/2 = 3/4 of its particles. Counting the missing rounds removes the illusion.");
        }],
        b: ["The model works by choosing which rounds get counted.", "If every round counts, or nearly every one, the trick has nothing to hide behind.", c =>
          ebGrade(c.choice("b-pick") === "count", "More rounds only make the fake violation more convincing. What does the model rely on?",
            "The detection loophole closes when detectors are efficient enough and every round enters the score, non-detections included. For the CHSH test with a maximally entangled state the efficiency must exceed about 82.8%. The 2015 tests closed it with heralded electron spins at Delft, and with high-efficiency photon detectors and a suitably chosen state and inequality at Vienna and NIST.")],
        c: ["Light travels 299,792,458 m in a second.", "t = 400 / 299,792,458 s, then convert to μs.", c =>
          ebGrade(ebFits(c.ans("c-t"), 400 / EB_C * 1e6), "Check the arithmetic: 400 ÷ 299,792,458 s, times 10⁶ for μs.",
            "400 m ÷ 299,792,458 m/s ≈ 1.334 × 10⁻⁶ s = 1.334 μs. Aspect’s 1982 experiment switched settings about every 10 ns with stations 12 m apart (about 40 ns for light); the 2015 Delft test used stations 1.3 km apart.")],
        d: ["The derivation averages ±2 over λ.", "If λ depends on x and y, the weights used for different input pairs differ.", c =>
          ebGrade(c.choice("d-pick") === "lambda", "Every table still gives ±2. Which step assumed the settings are independent of λ?",
            "The bound averages each table’s S over λ with the same weights for every input pair. If the source can predict the settings, λ can depend on x and y, and that averaging step fails. Experiments use fast random number generators, and even light from distant stars, to choose the settings.")],
        e: ["Freedman and Clauser came first, in the early 1970s.", "The Nobel Prize came last, after the loophole-free tests.", c => {
          const wrong = Object.keys(EB_EVENTS).filter(y => c.choice("e-" + y) !== EB_EVENTS[y]);
          return ebGrade(!wrong.length, "Check " + wrong.join(" and ") + ".",
            "1972 Freedman–Clauser, the first CHSH test. 1982 Aspect, with settings switched while the photons were in flight. 2015 Delft, Vienna and NIST, the first loophole-free tests. 2022 the Nobel Prize in Physics to Alain Aspect, John Clauser and Anton Zeilinger.");
        }]
      }
    },

    // 13 · Quantum Key Distribution (E91) -----------------------------------------------------------------
    qkd: {
      load(c, check) { if (check === "e") { c.field("line").value = "mystery"; c.field("n").value = "900"; } },
      edit(c, name) { if (/^f(-range)?$/.test(name) && c.s.runs) delete c.s.runs.open; },
      actions: {
        run(c) {
          const seed = ebNeedSeed(c), line = c.val("line"), n = Number(c.val("n"));
          const f = line === "mystery" ? ebMysteryF(seed) : c.ans("f");
          if (f < 0 || f > 1) throw new EbFieldError(c.field("f"), "Use a fraction from 0 to 1.", true);
          const run = ebRun(c, line, line === "mystery" ? 52 : 51, () => ({ rounds: 0, key: [], n4: [0, 0, 0, 0], sum4: [0, 0, 0, 0] }));
          for (let k = 0; k < n; k++) {
            const r = ebE91Round(run.rng, f);
            run.rounds += 1;
            if (r.al === r.be) run.key.push([Number(r.u === -1), 1 - Number(r.v === -1)]);
            else if (r.al in EB_E91_X && r.be in EB_E91_Y) {
              const j = 2 * EB_E91_X[r.al] + EB_E91_Y[r.be];
              run.n4[j] += 1;
              run.sum4[j] += r.u * r.v;
            }
          }
          const st = ebE91Stats(run);
          return "Ran " + n + " rounds (seed " + seed + "). After " + run.rounds + " rounds: " + run.key.length + " key bits with " + st.errors + " errors" + (st.ready ? ", and |Ŝ| = " + ebFmt(ebRound(Math.abs(st.S), 0.001)) + " from the test rounds." : ".");
        },
        clear(c) { c.s.runs = {}; return "Run cleared. With the same seed, the next rounds repeat."; },
        reseed(c) { return "New seed " + ebReseed(c) + ". Run cleared."; }
      },
      show(c) {
        const line = c.val("line"), run = ebLive(c, line);
        // The mystery channel hides Eve's fraction, so the f controls rest.
        c.field("f").disabled = c.field("f-range").disabled = line === "mystery";
        if (!run || !run.rounds) {
          c.put("state", (line === "mystery" ? "Mystery channel: Eve’s fraction is hidden." : "Eve intercepts a fraction f = " + c.val("f") + ".") + " No rounds yet. Press Run rounds.");
          return { panels: [{ kind: "rows", caption: "no rounds yet", rows: [{ label: "Alice", text: "", tone: "alpha" }, { label: "Bob", text: "", tone: "beta" }] }], caption: "", desc: "No rounds yet." };
        }
        const st = ebE91Stats(run), shown = run.key.slice(0, 32);
        const absS = Math.abs(st.S);
        c.put("state", run.rounds + " rounds: " + run.key.length + " key bits (" + ebFmt(ebRound(run.key.length / run.rounds, 0.001)) + " of the rounds), " + st.errors + " errors, error rate " + ebFmt(ebRound(st.rate, 0.001)) + ". "
          + (st.ready ? "Test rounds: " + ["E₀₀", "E₀₁", "E₁₀", "E₁₁"].map((name, k) => name + " = " + ebFmt(ebRound(st.E[k], 0.001))).join(", ") + "; S = " + ebFmt(ebRound(st.S, 0.001)) + ", |Ŝ| = " + ebFmt(ebRound(absS, 0.001)) + (absS > 2 ? ", above 2." : ", not above 2.") : "Not every test pair has appeared yet."));
        return {
          panels: [{ kind: "rows", caption: "first " + shown.length + " key bits", weight: 1.45, indent: 64, gap: 40, rows: [
            { label: "Alice", text: shown.map(k => k[0]).join(""), tone: "alpha" },
            { label: "Bob", text: shown.map(k => k[1]).join(""), tone: "beta" },
            { label: "errors", text: shown.map(k => (k[0] === k[1] ? "·" : "×")).join(""), tone: "warn" }], note: st.errors + " errors in " + run.key.length + " key bits" },
            ebBars("test rounds", [{ label: "|Ŝ|", value: st.ready ? Math.min(absS, 3) : 0, text: st.ready ? ebFmt(ebRound(absS, 0.001)) : "—", tone: absS > 2 ? "plus" : "warn" }, { label: "2", value: 2, text: "2", tone: "guide", outline: true }], { max: 3, weight: 0.55 })],
          caption: st.ready ? "|Ŝ| = " + ebFmt(ebRound(absS, 0.001)) : "",
          desc: "Alice’s and Bob’s first " + shown.length + " key bits, with " + shown.filter(k => k[0] !== k[1]).length + " disagreements among them; " + st.errors + " errors in " + run.key.length + " key bits overall. " + (st.ready ? "|Ŝ| from the test rounds is " + ebFmt(ebRound(absS, 0.001)) + ", against the classical bound 2." : "")
        };
      },
      checks: {
        a: ["There are 3 × 3 = 9 equally likely setting pairs.", "The shared axes are 45° and 90°.", c =>
          ebGrade(ebFits(c.ans("a-frac"), 2 / 9), "Count the setting pairs where Alice and Bob use the same axis.",
            "Of the 9 setting pairs, (45°, 45°) and (90°, 90°) give key bits: 2/9 of the rounds, about 200 per 900. Four more pairs form the CHSH test, and the remaining three are discarded.")],
        b: ["For the singlet, E = −cos 0° = −1 on equal axes.", "With no eavesdropper, flipped bits always match.", c => {
          if (c.choice("b-pick") !== "flip") return ebGrade(false, "What sign relation does the singlet give on equal axes?");
          return ebGrade(ebFits(c.ans("b-err"), 0), "Flipping is right. How often do flipped bits disagree with no one listening?",
            "Equal axes give opposite signs every time, so Bob flips each bit and the two keys agree perfectly: error rate 0. Any errors then point to noise or an eavesdropper.");
        }],
        c: ["Eve’s measurement leaves a product state: E = −cos(α − θ)cos(β − θ).", "Averaged over θ, every E halves.", c => {
          if (!ebFits(c.ans("c-s"), Math.SQRT2)) return ebGrade(false, "Check |S|. Every correlation is halved, so |S| = 2√2 / 2.");
          return ebGrade(ebFits(c.ans("c-err"), 0.25), "|S| is right. On a key round E becomes −1/2: how often do the signs come out equal?",
            "Averaging −cos(α − θ)cos(β − θ) over θ gives −(1/2)cos(α − β), so |S| = √2, inside the classical range. On key rounds E = −1/2, so the signs are equal (an error after Bob’s flip) with probability (1 + E)/2 = 1/4.");
        }],
        d: ["Solve 2√2(1 − f/2) = 2.", "1 − f/2 = 1/√2.", c =>
          ebGrade(ebFits(c.ans("d-f"), 2 - Math.SQRT2), "Solve 2√2(1 − f/2) = 2 for f.",
            "1 − f/2 = 1/√2 gives f = 2 − √2 ≈ 0.586. Intercepting more than about 59% of the pairs drops |S| to 2 or below; even less shows up as a key error rate of f/4.")],
        e: ["Read |Ŝ| from the readout after your run.", "|Ŝ| ≈ 2.83 means the pairs are intact; |Ŝ| ≈ 1.41 means every pair was intercepted.", c => {
          const run = ebLive(c, "mystery");
          if (c.val("line") !== "mystery" || !run || run.rounds < 900) return ebSetup("Pick the mystery channel and run at least 900 rounds first.");
          const st = ebE91Stats(run), absS = Math.abs(st.S);
          if (Math.abs(c.ans("e-s") - absS) > 0.01 + 1e-9) return ebGrade(false, "Check your |Ŝ|: copy it from the readout.");
          return ebGrade(c.choice("e-pick") === (absS > 2 ? "clear" : "listen"), "Compare your |Ŝ| with 2.",
            "Your |Ŝ| = " + ebFmt(ebRound(absS, 0.001)) + " with a key error rate of " + ebFmt(ebRound(st.rate, 0.001)) + ". For seed " + ebSeed(c) + " the hidden fraction was f = " + ebMysteryF(ebSeed(c)) + ". With about 100 test rounds per input pair, the two cases sit many standard errors apart.");
        }]
      }
    }
  };
  // An angle slider runs 0°–359°, so 370° or −90° moves it to the same axis.
  const ebRangeValue = (range, value) => ("ebAngle" in range.dataset ? ((value % 360) + 360) % 360 : value);


  const ebStations = { ...ebStations1, ...ebStations2, ...ebStations3 };

  function initializeEntanglementArcade(root) {
    const details = root.querySelector("#entanglement-arcade");
    if (!details) return;
    const get = id => root.querySelector("#eb-" + id);
    const select = get("station"), resetButton = get("reset"), status = get("status");
    const reducedBox = get("reduced"), progress = get("progress");
    const figure = get("figure-template").content.firstElementChild.cloneNode(true);
    const toolTemplate = get("mission-template");
    const viewport = figure.querySelector("#eb-viewport");
    const geometry = figure.querySelector("[data-eb-geometry]");
    const labelLayer = figure.querySelector("[data-eb-labels]");
    const desc = figure.querySelector("#eb-desc");
    const title = figure.querySelector("#eb-title");
    const canvas = figure.querySelector("#eb-canvas");
    const renderStatus = figure.querySelector("#eb-render-status");
    const colors = ebPalette(root);
    const lifetime = new AbortController();
    const listen = (node, type, handler, options = {}) =>
      node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
    const panels = new Map(), cards = new Map(), completion = new Set();
    let active = null, plan = null, motionFrame = null, lastTick = null, disposed = false;
    let graphics = null, loading = false, failed = false, contextLost = false, frame = null;

    const say = message => ebSetText(status, message ?? "");
    const updateProgress = () => ebSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

    for (const panel of root.querySelectorAll("#eb-panels [data-eb-station]")) {
      const key = panel.dataset.ebStation;
      const spec = ebStations[key];
      if (!spec) continue;
      const fields = new Map([...panel.querySelectorAll("[name]")].map(field => [field.name, field]));
      const defaults = new Map([...fields].map(([name, field]) => [name, field.type === "checkbox" ? field.checked : field.value]));
      const field = name => {
        const input = fields.get(name);
        if (!input) throw new Error("Entanglement Arcade: no field named " + name + " in station " + key + ".");
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
          const value = ebParse(input.value);
          if (value === null) throw new EbFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2 or 1/√2.", true);
          return value;
        },
        quiet: name => ebParse(field(name).value),
        // A box that may hold a fraction, falling back to its paired slider mid-edit.
        number(name) {
          const value = ebParse(field(name).value);
          if (value !== null) return value;
          const range = fields.get(name + "-range");
          return range ? Number(range.value) : NaN;
        },
        whole(name, lo = 0) {
          const input = field(name), value = ebParse(input.value);
          if (value === null || !Number.isInteger(value) || value < lo) throw new EbFieldError(input, "Enter a whole number" + (lo > 0 ? " of at least " + lo : "") + ".", true);
          return value;
        },
        cx: prefix => [c.ans(prefix + "-re"), c.ans(prefix + "-im")],
        quietCx(prefix) {
          const re = c.quiet(prefix + "-re"), im = c.quiet(prefix + "-im");
          return re === null || im === null ? null : [re, im];
        },
        // A pair ket entered by basis ket: prefix-00 … prefix-11, each with -re and -im.
        ket: prefix => EB_KETS.map(k => c.cx(prefix + "-" + k)),
        quietKet(prefix) {
          const ket = EB_KETS.map(k => c.quietCx(prefix + "-" + k));
          return ket.some(z => z === null) ? null : ket;
        },
        // A real 4×4 grid: prefix-ROW-COL, with ROW and COL basis kets.
        mat4: prefix => EB_KETS.map(r => EB_KETS.map(col => c.ans(prefix + "-" + r + "-" + col))),
        choice(name) {
          const input = field(name);
          if (!input.value) throw new EbFieldError(input, "Choose an option.");
          return input.value;
        },
        // Setting a value also moves any slider paired with that box.
        set(name, value) {
          field(name).value = String(value);
          for (const range of panel.querySelectorAll('[data-eb-pair="' + name + '"]')) range.value = String(ebRangeValue(range, Number(value)));
        },
        // Fill a complex pair of boxes with exact text, such as "1/√2" and "0".
        setCx(prefix, re, im = "0") { c.set(prefix + "-re", re); c.set(prefix + "-im", im); },
        put(name, text) { ebSetText(c.node('[data-eb-read="' + name + '"]'), text); },
        list(name, lines) {
          const list = c.node('[data-eb-log="' + name + '"]');
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
      for (const card of panel.querySelectorAll("[data-eb-mission]")) {
        const id = card.dataset.ebMission, check = id.slice(key.length + 1);
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
        for (const range of c.panel.querySelectorAll('[data-eb-pair="' + name + '"]')) {
          const value = ebParse(c.val(name));
          if (value !== null) range.value = String(ebRangeValue(range, value));
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
      for (const output of active.panel.querySelectorAll("output[data-eb-for]")) {
        const number = ebParse(active.val(output.dataset.ebFor));
        ebSetText(output, number === null ? "?" : ebFmt(number) + (output.dataset.ebUnit ?? ""));
      }
      // Play buttons show what a press would do.
      for (const button of active.panel.querySelectorAll('[data-eb-action="play"]')) {
        ebSetText(button, active.s.playing && !reduced() ? "Pause" : "Spin the view");
        button.setAttribute("aria-pressed", String(Boolean(active.s.playing && !reduced())));
      }
      ebSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
      ebSetText(desc, plan.desc || "");
      if (plan.scene3d && !graphics && !loading && !failed) loadGraphics();
      draw();
      requestMotion();
    }

    function showSvg(message) {
      canvas.hidden = true;
      viewport.dataset.renderer = "svg";
      ebSetText(renderStatus, message);
    }

    // The optional 3D view loads the lesson's local Three.js copy on first use.
    // Without it (no WebGL, a blocked module, a lost context) the SVG view stays.
    async function loadGraphics() {
      if (loading || graphics || disposed) return;
      loading = true;
      showSvg("SVG view. Loading the Three.js view.");
      // If the 3D view hasn't started after a few seconds, say so; the SVG view works meanwhile.
      const slow = setTimeout(() => { if (loading) showSvg("SVG view. The Three.js view hasn’t started yet, so the SVG view is shown."); }, 5000);
      try {
        const THREE = await import("../vendor/three.module.js");
        if (disposed) return;
        graphics = ebCreateGraphics(THREE, canvas, colors);
      } catch {
        graphics = null;
        failed = true;
      } finally {
        clearTimeout(slow);
        loading = false;
      }
      draw();
    }

    function draw() {
      if (!plan) return;
      ebPaintSvg(plan, geometry, labelLayer);
      const view = plan.scene3d ?? null;
      if (!view) {
        showSvg(plan.svgNote ?? "");
        return;
      }
      if (!graphics || contextLost) {
        if (!loading) showSvg(failed
          ? "Three.js is unavailable here, so the analyzers use the SVG view. The view slider still turns it."
          : "SVG view of the analyzers. Use the view slider to turn it.");
        return;
      }
      const width = viewport.clientWidth, height = viewport.clientHeight;
      if (!width || !height) return;
      try {
        graphics.draw(view, width, height, reduced());
        canvas.hidden = false;
        viewport.dataset.renderer = "webgl";
        ebSetText(renderStatus, "Three.js 3D view. Use the view slider to turn it.");
      } catch {
        graphics.dispose();
        graphics = null;
        failed = true;
        showSvg("The 3D view stopped, so the analyzers use the SVG view.");
      }
    }

    function requestFrame() {
      if (frame !== null || disposed) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (onScreen()) draw();
      });
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
      active.node("[data-eb-plot-slot]").append(figure);
      lastTick = null;
      refresh();
    }

    function clearCard(card) {
      ebSetText(card.querySelector("[data-eb-feedback]"), "");
      const work = card.querySelector("[data-eb-work]");
      work.hidden = true;
      work.open = false;
    }

    function showGrade(mission, result) {
      const { card, id, check, station } = mission;
      const work = card.querySelector("[data-eb-work]");
      ebSetText(card.querySelector("[data-eb-feedback]"),
        result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
      ebSetText(card.querySelector("[data-eb-work-text]"), result.work || "");
      work.hidden = !result.work;
      work.open = Boolean(result.work) && !result.pass;
      if (result.pass) station.s.revealed[check] = true;
      if (result.pass && !completion.has(id)) {
        completion.add(id);
        card.querySelector("[data-eb-done]").hidden = false;
        updateProgress();
      }
      say("");
    }

    function handleClick(event) {
      const button = event.target.closest("button");
      if (!button || !active || !active.panel.contains(button) || button.disabled) return;
      const missionCard = button.closest("[data-eb-mission]");
      const mission = missionCard ? cards.get(missionCard.dataset.ebMission) : null;
      const action = button.dataset.ebAction;
      try {
        if (action === "play") {
          if (active.s.playing) { active.s.playing = false; say("Paused."); }
          else if (reduced()) say("Reduced effects are on, so Play stays still. Use the view slider to turn the view instead.");
          else { active.spec.play?.(active); active.s.playing = true; lastTick = null; say("Spinning the view. Press Pause to stop."); }
        } else if (action) {
          active.s.playing = false;
          const message = active.spec.actions[action](active, mission?.check ?? null);
          if (mission) ebSetText(mission.card.querySelector("[data-eb-feedback]"), message ?? "");
          else if (message !== null) say(message);
        } else if (mission && button.hasAttribute("data-eb-check")) {
          showGrade(mission, active.spec.checks[mission.check][2](active));
        } else if (mission && button.hasAttribute("data-eb-hint")) {
          if (mission.hints >= 2) return;
          const list = mission.card.querySelector("[data-eb-hint-list]");
          const item = document.createElement("li");
          ebSetText(item, active.spec.checks[mission.check][mission.hints]);
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
        if (!(error instanceof EbFieldError)) throw error;
        if (mission) ebSetText(mission.card.querySelector("[data-eb-feedback]"), error.message);
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
      if (target.dataset.ebPair) active.field(target.dataset.ebPair).value = target.value;
      else for (const range of active.panel.querySelectorAll('[data-eb-pair="' + target.name + '"]')) {
        const value = ebParse(target.value);
        // An angle slider runs 0°–359°; a typed 370° or −90° moves it to the same axis.
        if (value !== null) range.value = String(ebRangeValue(range, value));
      }
      const missionCard = target.closest("[data-eb-mission]");
      if (missionCard) clearCard(missionCard);
      // Moving the clock by hand pauses playback.
      if (active.s.playing && active.spec.manual?.includes(target.dataset.ebPair ?? target.name)) active.s.playing = false;
      active.spec.edit?.(active, target.name, event.type);
      refresh();
    }

    // Angle sliders: arrows move 1°, Page Up and Page Down move 15°, and the
    // value wraps round a full turn.
    listen(details, "keydown", event => {
      const range = event.target;
      if (!active || !(range instanceof HTMLInputElement) || range.type !== "range" || !("ebAngle" in range.dataset)) return;
      const step = { PageUp: 15, PageDown: -15 }[event.key];
      if (!step) return;
      event.preventDefault();
      range.value = String(((Number(range.value) + step) % 360 + 360) % 360);
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
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
        say("Reduced effects are on, so playback stopped. Use the view slider to turn the view instead.");
      }
      refresh();
    };
    listen(reducedBox, "change", settle);
    if (motionQuery?.addEventListener) listen(motionQuery, "change", settle);
    listen(root.querySelector("#eb-arcade-link"), "click", () => { details.open = true; });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestFrame()) : null;
    observer?.observe(viewport);
    listen(canvas, "webglcontextlost", event => {
      event.preventDefault();
      contextLost = true;
      showSvg("The WebGL context was lost, so the analyzers use the SVG view.");
    });
    listen(canvas, "webglcontextrestored", () => { contextLost = false; requestFrame(); });
    const wake = () => { requestFrame(); requestMotion(); };
    listen(document, "visibilitychange", () => { if (!document.hidden) wake(); });
    listen(window, "scroll", wake, { passive: true });
    listen(window, "pageshow", wake);
    listen(window, "pagehide", event => {
      if (motionFrame !== null) cancelAnimationFrame(motionFrame);
      motionFrame = null;
      lastTick = null;
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
    if (location.hash === "#entanglement-arcade") details.open = true;
  }
  // ---------------------------------------------------------------------------
  // SVG drawing. The viewBox is 560 × 300 and labels always stay in SVG.
  // ---------------------------------------------------------------------------

  function ebNode(name, attributes = {}, text = "") {
    const node = document.createElementNS(EB_SVG, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    }
    if (text) node.textContent = text;
    return node;
  }

  function ebPaintSvg(plan, geometry, labels) {
    const shapes = [], words = [];
    if (plan.panels) ebDrawPanels(plan.panels, shapes, words);
    geometry.replaceChildren(...shapes);
    labels.replaceChildren(...words);
  }

  function ebDrawPanels(panels, shapes, words) {
    const total = panels.reduce((sum, panel) => sum + (panel.weight ?? 1), 0);
    let x = 0;
    for (const panel of panels) {
      const box = { x, w: 560 * (panel.weight ?? 1) / total };
      if (panel.kind === "plane") ebDrawPlane(panel, box, shapes, words);
      else if (panel.kind === "chart") ebDrawChart(panel, box, shapes, words);
      else if (panel.kind === "bars") ebDrawBars(panel, box, shapes, words);
      else if (panel.kind === "matrix") ebDrawMatrix(panel, box, shapes, words);
      else if (panel.kind === "grid") ebDrawGrid(panel, box, shapes, words);
      else if (panel.kind === "table") ebDrawTable(panel, box, shapes, words);
      else if (panel.kind === "dial") ebDrawDial(panel, box, shapes, words);
      else if (panel.kind === "spacetime") ebDrawSpacetime(panel, box, shapes, words);
      else if (panel.kind === "timeline") ebDrawTimeline(panel, box, shapes, words);
      else if (panel.kind === "rows") ebDrawRows(panel, box, shapes, words);
      else if (panel.kind === "epr") ebDrawEpr(panel, box, shapes, words);
      x += box.w;
    }
  }

  function ebLabel(words, text, x, y, tone, anchor = "middle", extra = {}) {
    // Keep the whole label inside the 560-wide viewBox (about 8.5 px per character).
    const span = text.length * 8.5;
    const left = anchor === "start" ? x : anchor === "end" ? x - span : x - span / 2;
    if (left + span > 556) { x = 556; anchor = "end"; }
    else if (left < 4) { x = 4; anchor = "start"; }
    words.push(ebNode("text", { class: "eb-label", "data-tone": tone, x, y, "text-anchor": anchor, ...extra }, text));
  }

  function ebDrawPlane(plane, box, shapes, words) {
    const size = Math.min(box.w - 20, 238), half = size / 2, cx = box.x + box.w / 2, cy = 166;
    const limit = plane.limit ?? 1, unit = (half - 10) / limit;
    const X = re => cx + re * unit, Y = im => cy - im * unit;
    shapes.push(ebNode("rect", { class: "eb-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
    const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
    let grid = "";
    for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
      if (k === 0) continue;
      const v = k * step;
      grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
    }
    shapes.push(ebNode("path", { class: "eb-grid", d: grid }));
    shapes.push(ebNode("path", { class: "eb-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
    if (size > 150) {
      words.push(ebNode("text", { class: "eb-tick", x: X(limit) - 2, y: cy + 14, "text-anchor": "end" }, plane.axes?.[0] ?? "Re"));
      words.push(ebNode("text", { class: "eb-tick", x: cx + 5, y: Y(limit) + 10, "text-anchor": "start" }, plane.axes?.[1] ?? "Im"));
    }
    words.push(ebNode("text", { class: "eb-caption", "data-tone": plane.tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
    const rings = [...(plane.circle ? [{ c: [0, 0], r: plane.circle, tone: "guide" }] : []), ...(plane.circles ?? [])];
    for (const ring of rings) {
      if (ring.r > 0) shapes.push(ebNode("circle", { class: "eb-ring", "data-tone": ring.tone ?? "guide", cx: X(ring.c[0]), cy: Y(ring.c[1]), r: ring.r * unit }));
    }
    for (const path of plane.paths ?? []) {
      shapes.push(ebNode("polyline", { class: "eb-curve" + (path.dashed ? " eb-dashed" : ""), "data-tone": path.tone,
        points: path.pts.map(([re, im]) => X(re).toFixed(1) + "," + Y(im).toFixed(1)).join(" ") }));
    }
    for (const item of plane.items) {
      const from = item.from ?? [0, 0];
      const fx = X(from[0]), fy = Y(from[1]);
      const [re, im] = ebAdd(from, item.z);
      const reach = Math.max(Math.abs(re), Math.abs(im));
      const clip = reach > limit ? limit / reach : 1;
      const ex = X(re * clip), ey = Y(im * clip);
      const length = Math.hypot(ex - fx, ey - fy);
      if (item.dot || length < 3) {
        shapes.push(ebNode("circle", { class: "eb-dot" + (item.hollow || length < 3 ? " eb-hollow" : ""), "data-tone": item.tone, cx: ex, cy: ey, r: item.dot ? item.size ?? 4.5 : 5 }));
      } else {
        const ux = (ex - fx) / length, uy = (ey - fy) / length, depth = Math.min(item.thin ? 9 : 13, length * 0.6), wing = depth * 0.42;
        const bx = ex - ux * depth, by = ey - uy * depth;
        shapes.push(ebNode("line", { class: "eb-arrow" + (item.dashed ? " eb-dashed" : "") + (item.thin ? " eb-thin" : "") + (item.wide ? " eb-wide" : ""), "data-tone": item.tone, x1: fx, y1: fy, x2: bx, y2: by }));
        shapes.push(ebNode("polygon", { class: "eb-head" + (item.dashed ? " eb-hollow" : ""), "data-tone": item.tone,
          points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
      }
      if (item.label) {
        const ux = (ex - fx) / (length || 1), uy = (ey - fy) / (length || 1);
        const away = length < 3 ? [10, -10] : [ux * 12 + uy * 9, uy * 12 - ux * 9];
        const anchor = Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end";
        ebLabel(words, item.label + (clip < 1 ? " (off scale)" : ""), ex + away[0], ey + away[1] + 4, item.tone, anchor);
      }
    }
  }

  function ebDrawChart(chart, box, shapes, words) {
    const left = box.x + 46, right = box.x + box.w - 16, top = 40, bottom = 246;
    const [x0, x1] = chart.x, [y0, y1] = chart.y;
    const X = v => left + (v - x0) / (x1 - x0) * (right - left);
    const Y = v => bottom - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0) * (bottom - top);
    shapes.push(ebNode("rect", { class: "eb-frame", x: left, y: top, width: right - left, height: bottom - top }));
    let grid = "";
    for (const v of chart.xTicks) grid += "M" + X(v) + " " + top + "V" + bottom;
    for (const v of chart.yTicks) grid += "M" + left + " " + Y(v) + "H" + right;
    shapes.push(ebNode("path", { class: "eb-grid", d: grid }));
    const zeroY = y0 < 0 && y1 > 0 ? Y(0) : bottom;
    shapes.push(ebNode("path", { class: "eb-axis", d: "M" + left + " " + top + "V" + bottom + "M" + left + " " + zeroY + "H" + right }));
    const every = Math.max(1, Math.ceil(chart.xTicks.length * 34 / (right - left)));
    chart.xTicks.forEach((v, k) => {
      if (k % every === 0) words.push(ebNode("text", { class: "eb-tick", x: X(v), y: bottom + 16, "text-anchor": "middle" }, chart.xTickText?.[k] ?? ebFmt(v)));
    });
    for (const v of chart.yTicks) words.push(ebNode("text", { class: "eb-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, ebFmt(v)));
    words.push(ebNode("text", { class: "eb-tick", x: (left + right) / 2, y: bottom + 36, "text-anchor": "middle" }, chart.xLabel));
    words.push(ebNode("text", { class: "eb-caption", x: (left + right) / 2, y: top - 12, "text-anchor": "middle" }, chart.caption));
    for (const h of chart.hlines ?? []) {
      shapes.push(ebNode("line", { class: "eb-ray", "data-tone": h.tone ?? "angle", x1: left, y1: Y(h.y), x2: right, y2: Y(h.y) }));
      if (h.label) ebLabel(words, h.label, right - 4, Y(h.y) - 6, h.tone ?? "angle", "end");
    }
    for (const v of chart.vlines ?? []) {
      if (v.x < x0 - 1e-9 || v.x > x1 + 1e-9) continue;
      shapes.push(ebNode("line", { class: "eb-ray" + (v.dashed ? "" : " eb-solid"), "data-tone": v.tone ?? "angle", x1: X(v.x), y1: top, x2: X(v.x), y2: bottom }));
      if (v.label) ebLabel(words, v.label, X(v.x) + 4, top + 14, v.tone ?? "angle", "start");
    }
    // Histogram bars: each rect spans [x0, x1] from the axis up to y.
    for (const r of chart.rects ?? []) {
      const ya = Y(Math.max(y0, 0)), yb = Y(r.y);
      if (Math.abs(ya - yb) < 0.5) continue;
      shapes.push(ebNode("rect", { class: "eb-bar", "data-tone": r.tone, x: X(r.x0) + 0.5, y: Math.min(ya, yb), width: Math.max(1, X(r.x1) - X(r.x0) - 1), height: Math.abs(ya - yb) }));
    }
    for (const series of chart.series ?? []) {
      shapes.push(ebNode("polyline", { class: "eb-curve" + (series.dashed ? " eb-dashed" : ""), "data-tone": series.tone,
        points: series.pts.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join(" ") }));
      if (series.label) {
        const [lx, ly] = series.labelAt ?? series.pts.at(-1);
        ebLabel(words, series.label, X(lx) + (series.labelDx ?? 6), Y(ly) + (series.labelDy ?? -6), series.tone, series.labelAnchor ?? "start");
      }
    }
    for (const dot of chart.dots ?? []) {
      if (dot.x < x0 - 1e-9 || dot.x > x1 + 1e-9) continue;
      shapes.push(ebNode("circle", { class: "eb-dot" + (dot.hollow ? " eb-hollow" : ""), "data-tone": dot.tone, cx: X(dot.x), cy: Y(dot.y), r: dot.r ?? 5 }));
      if (dot.label) ebLabel(words, dot.label, X(dot.x) + 8, Y(dot.y) - 8, dot.tone, "start");
    }
  }

  function ebDrawBars(bars, box, shapes, words) {
    const left = box.x + 40, right = box.x + box.w - 10, top = 48, bottom = 246, max = bars.max ?? 1;
    const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
    let grid = "";
    for (const v of [0, max / 2, max]) {
      grid += "M" + left + " " + Y(v) + "H" + right;
      words.push(ebNode("text", { class: "eb-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, ebFmt(v)));
    }
    shapes.push(ebNode("path", { class: "eb-grid", d: grid }));
    shapes.push(ebNode("path", { class: "eb-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
    words.push(ebNode("text", { class: "eb-caption", x: (left + right) / 2, y: top - 22, "text-anchor": "middle" }, bars.caption));
    const slot = (right - left) / bars.items.length;
    bars.items.forEach((bar, index) => {
      const x = left + slot * index + slot * 0.2, w = slot * 0.6, y = Y(bar.value);
      shapes.push(ebNode("rect", { class: "eb-bar" + (bar.outline ? " eb-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: Math.max(0, bottom - y) }));
      words.push(ebNode("text", { class: "eb-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 20, "text-anchor": "middle" }, bar.label));
      words.push(ebNode("text", { class: "eb-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top - 4, y - 8), "text-anchor": "middle" }, bar.text ?? ebFmt(bar.value)));
    });
  }

  // A matrix drawn as text between square brackets. Entries are strings.
  function ebDrawMatrix(panel, box, shapes, words) {
    const rows = panel.rows, n = rows.length, m = rows[0].length;
    const longest = Math.max(...rows.flat().map(text => text.length), 1);
    const cell = Math.min((box.w - 40) / m, Math.max(44, longest * 9 + 16)), height = Math.min(52, 190 / n);
    const cx = box.x + box.w / 2, cy = 160, w = cell * m, h = height * n;
    const left = cx - w / 2, top = cy - h / 2;
    words.push(ebNode("text", { class: "eb-caption", "data-tone": panel.tone, x: cx, y: top - 22, "text-anchor": "middle" }, panel.caption));
    const bracket = (x, dir) => "M" + (x + dir * 9) + " " + (top - 6) + "H" + x + "V" + (top + h + 6) + "H" + (x + dir * 9);
    shapes.push(ebNode("path", { class: "eb-axis", d: bracket(left - 4, 1) + bracket(left + w + 4, -1) }));
    rows.forEach((row, i) => row.forEach((text, j) => {
      const tone = panel.tones?.[i]?.[j] ?? panel.tone ?? "ink";
      words.push(ebNode("text", { class: "eb-label", "data-tone": tone, x: left + cell * (j + 0.5), y: top + height * (i + 0.5) + 5, "text-anchor": "middle" }, text));
    }));
    if (panel.note) words.push(ebNode("text", { class: "eb-tick", x: cx, y: Math.min(286, top + h + 34), "text-anchor": "middle" }, panel.note));
  }
  // A 2×2 amplitude grid: A's bit down the side, B's bit across the top. A cell's
  // fill shows its probability, a small arrow its phase, and its text the value.
  function ebDrawGrid(grid, box, shapes, words) {
    const size = Math.min(box.w - 84, 196), cell = size / 2;
    const left = box.x + (box.w - size) / 2 + 24, top = 76;
    words.push(ebNode("text", { class: "eb-caption", "data-tone": grid.tone, x: left + size / 2 - 12, y: 30, "text-anchor": "middle" }, grid.caption));
    grid.cols.forEach((text, j) => words.push(ebNode("text", { class: "eb-tick", x: left + cell * (j + 0.5), y: top - 10, "text-anchor": "middle" }, text)));
    grid.rows.forEach((text, i) => words.push(ebNode("text", { class: "eb-tick", x: left - 8, y: top + cell * (i + 0.5) + 4, "text-anchor": "end" }, text)));
    grid.cells.forEach((item, k) => {
      const i = k >> 1, j = k & 1, x = left + cell * j, y = top + cell * i;
      const dim = grid.focus !== undefined && grid.focus !== null && grid.focus !== i;
      shapes.push(ebNode("rect", { class: "eb-frame", x, y, width: cell, height: cell }));
      const fill = ebClamp(item.fill ?? 0, 0, 1);
      if (fill > 1e-6) {
        const side = (cell - 8) * Math.sqrt(fill);
        shapes.push(ebNode("rect", { class: "eb-part" + (dim ? " eb-dim" : ""), "data-tone": item.tone, x: x + (cell - side) / 2, y: y + (cell - side) / 2, width: side, height: side, rx: 3 }));
      }
      if (item.z && ebAbs(item.z) > 1e-6 && cell >= 84) {
        const cx = x + cell - 18, cy = y + 18, r = 11, u = ebScale(item.z, 1 / ebAbs(item.z));
        shapes.push(ebNode("circle", { class: "eb-ring", "data-tone": "guide", cx, cy, r }));
        shapes.push(ebNode("line", { class: "eb-arrow eb-thin", "data-tone": item.tone, x1: cx, y1: cy, x2: cx + r * u[0], y2: cy - r * u[1] }));
      }
      words.push(ebNode("text", { class: "eb-tick", x: x + 6, y: y + 15, "text-anchor": "start" }, item.tag ?? ""));
      words.push(ebNode("text", { class: "eb-label" + (dim ? " eb-dim" : ""), "data-tone": item.tone, x: x + cell / 2, y: y + cell / 2 + 6, "text-anchor": "middle" }, item.text ?? ""));
      if (item.sub) words.push(ebNode("text", { class: "eb-tick", x: x + cell / 2, y: y + cell - 10, "text-anchor": "middle" }, item.sub));
    });
    if (grid.focus !== undefined && grid.focus !== null) {
      shapes.push(ebNode("rect", { class: "eb-ring", "data-tone": "angle", x: left - 3, y: top + cell * grid.focus - 3, width: size + 6, height: cell + 6, rx: 4 }));
    }
    if (grid.cross) {
      shapes.push(ebNode("line", { class: "eb-ray eb-solid", "data-tone": "plus", x1: left + 12, y1: top + 12, x2: left + size - 12, y2: top + size - 12 }));
      shapes.push(ebNode("line", { class: "eb-ray", "data-tone": "warn", x1: left + size - 12, y1: top + 12, x2: left + 12, y2: top + size - 12 }));
    }
    if (grid.margins) {
      grid.margins.rows?.forEach((text, i) => words.push(ebNode("text", { class: "eb-tick", x: left + size + 8, y: top + cell * (i + 0.5) + 4, "text-anchor": "start" }, text)));
      grid.margins.cols?.forEach((text, j) => words.push(ebNode("text", { class: "eb-tick", x: left + cell * (j + 0.5), y: top + size + 18, "text-anchor": "middle" }, text)));
    }
    if (grid.note) words.push(ebNode("text", { class: "eb-tick", x: left + size / 2, y: 292, "text-anchor": "middle" }, grid.note));
  }

  // A labelled table of cells: rows down the side, columns across the top. Each
  // cell has text, an optional fill (0–1) shown as a bar along its bottom, and a tone.
  function ebDrawTable(table, box, shapes, words) {
    const nr = table.cells.length, nc = table.cells[0].length;
    const head = table.rowHead ?? 64, left = box.x + head + 8, right = box.x + box.w - 10;
    const top = 70, bottom = Math.min(262, top + nr * (table.rowH ?? 60));
    const cw = (right - left) / nc, ch = (bottom - top) / nr;
    words.push(ebNode("text", { class: "eb-caption", x: (left + right) / 2, y: 28, "text-anchor": "middle" }, table.caption));
    table.cols.forEach((text, j) => words.push(ebNode("text", { class: "eb-tick", x: left + cw * (j + 0.5), y: top - 10, "text-anchor": "middle" }, text)));
    table.rows.forEach((text, i) => words.push(ebNode("text", { class: "eb-tick", x: left - 8, y: top + ch * (i + 0.5) + 4, "text-anchor": "end" }, text)));
    table.cells.forEach((row, i) => row.forEach((cell, j) => {
      const x = left + cw * j, y = top + ch * i;
      shapes.push(ebNode("rect", { class: "eb-frame", x, y, width: cw, height: ch }));
      if (cell.fill > 1e-6) {
        const h = (ch - 6) * ebClamp(cell.fill, 0, 1);
        shapes.push(ebNode("rect", { class: "eb-part", "data-tone": cell.tone, x: x + 3, y: y + ch - 3 - h, width: cw - 6, height: h, rx: 2 }));
      }
      if (cell.ring) shapes.push(ebNode("rect", { class: "eb-ring eb-solid", "data-tone": "angle", x: x + 2, y: y + 2, width: cw - 4, height: ch - 4, rx: 3 }));
      words.push(ebNode("text", { class: "eb-label", "data-tone": cell.tone, x: x + cw / 2, y: y + ch / 2 + 5, "text-anchor": "middle" }, cell.text ?? ""));
    }));
    if (table.note) words.push(ebNode("text", { class: "eb-tick", x: (left + right) / 2, y: Math.min(292, bottom + 22), "text-anchor": "middle" }, table.note));
  }

  // Analyzer axes in the X–Z plane, +z up and +x right. With a view it is drawn
  // in 3D using the same projection as the Three.js scene, so labels line up.
  const EB_VIEW = { cx: 280, cy: 152 };
  const EB_DIAL_R = 112;
  function ebFrame(yaw, tilt) {
    const y = yaw * EB_RAD, t = tilt * EB_RAD;
    return {
      right: [-Math.sin(y), Math.cos(y), 0],
      up: [-Math.sin(t) * Math.cos(y), -Math.sin(t) * Math.sin(y), Math.cos(t)],
      toward: [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)]
    };
  }
  const ebDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // A face-on view: x to the right, z up, y into the screen.
  const EB_FACE = { yaw: -90, tilt: 0 };

  function ebDrawDial(dial, box, shapes, words) {
    const full = box.w > 500;
    const cx = full ? EB_VIEW.cx : box.x + box.w / 2, cy = EB_VIEW.cy + (full ? 0 : 6);
    const R = full ? EB_DIAL_R : Math.min(box.w / 2 - 44, 100);
    const frame = ebFrame((dial.view ?? EB_FACE).yaw, (dial.view ?? EB_FACE).tilt);
    const P = p => ({ x: cx + R * ebDot3(frame.right, p), y: cy - R * ebDot3(frame.up, p) });
    // A full-width (3D) dial keeps its caption in the corner, clear of the labels.
    words.push(ebNode("text", { class: "eb-caption", x: full ? box.x + 14 : cx, y: 22, "text-anchor": full ? "start" : "middle" }, dial.caption));
    const ring = Array.from({ length: 97 }, (_, k) => P(ebAxisDir(k * 360 / 96)));
    shapes.push(ebNode("polyline", { class: "eb-axis", points: ring.map(q => q.x.toFixed(1) + "," + q.y.toFixed(1)).join(" ") }));
    const axes = [[[0, 0, 1.12], "+z"], [[1.12, 0, 0], "+x"], ...(dial.view ? [[[0, 1.12, 0], "+y"]] : [])];
    for (const [end, name] of axes) {
      const a = P(end.map(v => -v)), b = P(end);
      shapes.push(ebNode("line", { class: "eb-grid", x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
      words.push(ebNode("text", { class: "eb-tick", x: b.x + 6, y: b.y + 14, "text-anchor": "start" }, name));
    }
    for (const arc of dial.arcs ?? []) {
      const n = 32, pts = Array.from({ length: n + 1 }, (_, k) => P(ebAxisDir(arc.from + (arc.to - arc.from) * k / n).map(v => v * 0.38)));
      shapes.push(ebNode("polyline", { class: "eb-curve eb-thin-curve", "data-tone": arc.tone ?? "angle", points: pts.map(q => q.x.toFixed(1) + "," + q.y.toFixed(1)).join(" ") }));
      if (arc.label) {
        const m = P(ebAxisDir((arc.from + arc.to) / 2).map(v => v * 0.52));
        ebLabel(words, arc.label, m.x, m.y + 4, arc.tone ?? "angle");
      }
    }
    const o = P([0, 0, 0]);
    dial.arrows.forEach((arrow, k) => {
      const dir = ebAxisDir(arrow.deg), tip = P(dir.map(v => v * (arrow.len ?? 0.9)));
      const dx = tip.x - o.x, dy = tip.y - o.y, length = Math.hypot(dx, dy);
      if (length > 6) {
        const ux = dx / length, uy = dy / length, depth = 12, wing = 5;
        const bx = tip.x - ux * depth, by = tip.y - uy * depth;
        shapes.push(ebNode("line", { class: "eb-arrow" + (arrow.dashed ? " eb-dashed" : ""), "data-tone": arrow.tone, x1: o.x, y1: o.y, x2: bx, y2: by }));
        shapes.push(ebNode("polygon", { class: "eb-head", "data-tone": arrow.tone, points: tip.x + "," + tip.y + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
      } else shapes.push(ebNode("circle", { class: "eb-dot", "data-tone": arrow.tone, cx: tip.x, cy: tip.y, r: 5 }));
      if (arrow.label) {
        // Labels sit just past the tip, nudged apart when two axes coincide.
        const side = ebAxisDir(arrow.deg + 90), k = arrow.stack ?? 0, r = (arrow.len ?? 0.9) + 0.2;
        const at = P(dir.map((v, i) => v * r + side[i] * 0.2 * k));
        ebLabel(words, arrow.label, at.x, at.y + 5, arrow.tone);
      }
    });
    shapes.push(ebNode("circle", { class: "eb-dot", "data-tone": "ink", cx: o.x, cy: o.y, r: 3 }));
    if (dial.note) words.push(ebNode("text", { class: "eb-tick", x: cx, y: 292, "text-anchor": "middle" }, dial.note));
  }

  // A spacetime diagram: position across, time up. Each station's setting choice
  // sends a light cone; the other station's detection must finish outside it.
  function ebDrawSpacetime(st, box, shapes, words) {
    const left = box.x + 70, right = box.x + box.w - 70, top = 44, bottom = 250;
    const tMax = Math.max(st.t, st.light) * 1.35 || 1;
    const Y = t => bottom - t / tMax * (bottom - top);
    words.push(ebNode("text", { class: "eb-caption", x: (left + right) / 2, y: 24, "text-anchor": "middle" }, st.caption));
    shapes.push(ebNode("path", { class: "eb-axis", d: "M" + left + " " + bottom + "H" + right + "M" + left + " " + bottom + "V" + top + "M" + right + " " + bottom + "V" + top }));
    words.push(ebNode("text", { class: "eb-label", "data-tone": "alpha", x: left, y: bottom + 20, "text-anchor": "middle" }, "Alice"));
    words.push(ebNode("text", { class: "eb-label", "data-tone": "beta", x: right, y: bottom + 20, "text-anchor": "middle" }, "Bob"));
    words.push(ebNode("text", { class: "eb-tick", x: (left + right) / 2, y: bottom + 20, "text-anchor": "middle" }, ebFmt(st.d) + " m apart"));
    words.push(ebNode("text", { class: "eb-tick", x: left - 8, y: top + 4, "text-anchor": "end" }, "time"));
    // Light from each setting choice at t = 0 reaches the other side at t = light.
    shapes.push(ebNode("line", { class: "eb-ray eb-solid", "data-tone": "angle", x1: left, y1: bottom, x2: right, y2: Y(st.light) }));
    shapes.push(ebNode("line", { class: "eb-ray eb-solid", "data-tone": "angle", x1: right, y1: bottom, x2: left, y2: Y(st.light) }));
    ebLabel(words, "light: " + ebFmt(ebRound(st.light, 0.001)) + " μs", (left + right) / 2, Y(st.light / 2) - 10, "angle");
    for (const [x, tone] of [[left, "alpha"], [right, "beta"]]) {
      shapes.push(ebNode("circle", { class: "eb-dot eb-hollow", "data-tone": tone, cx: x, cy: bottom, r: 6 }));
      shapes.push(ebNode("line", { class: "eb-arrow eb-thin", "data-tone": tone, x1: x, y1: bottom, x2: x, y2: Y(st.t) }));
      shapes.push(ebNode("circle", { class: "eb-dot", "data-tone": st.t < st.light ? "plus" : "warn", cx: x, cy: Y(st.t), r: 6 }));
    }
    words.push(ebNode("text", { class: "eb-tick", x: left + 10, y: bottom - 8, "text-anchor": "start" }, "setting chosen"));
    ebLabel(words, "measurement done: " + ebFmt(ebRound(st.t, 0.001)) + " μs", left + 10, Math.min(Y(st.t) - 10, bottom - 30), st.t < st.light ? "plus" : "warn", "start");
    if (st.note) words.push(ebNode("text", { class: "eb-tick", x: (left + right) / 2, y: 292, "text-anchor": "middle" }, st.note));
  }

  // A timeline of events by year.
  function ebDrawTimeline(tl, box, shapes, words) {
    const left = box.x + 40, right = box.x + box.w - 40, y = 160, [y0, y1] = tl.span;
    const X = year => left + (year - y0) / (y1 - y0) * (right - left);
    words.push(ebNode("text", { class: "eb-caption", x: (left + right) / 2, y: 30, "text-anchor": "middle" }, tl.caption));
    shapes.push(ebNode("line", { class: "eb-axis", x1: left, y1: y, x2: right, y2: y }));
    for (let year = Math.ceil(y0 / 10) * 10; year <= y1; year += 10) {
      shapes.push(ebNode("line", { class: "eb-grid", x1: X(year), y1: y - 5, x2: X(year), y2: y + 5 }));
      words.push(ebNode("text", { class: "eb-tick", x: X(year), y: y + 20, "text-anchor": "middle" }, String(year)));
    }
    tl.events.forEach((event, k) => {
      const x = X(event.year), up = k % 2 === 0, ty = up ? y - 46 - (k % 4 === 0 ? 0 : 0) : y + 56;
      shapes.push(ebNode("line", { class: "eb-ray eb-solid", "data-tone": event.tone, x1: x, y1: y, x2: x, y2: up ? ty + 8 : ty - 18 }));
      shapes.push(ebNode("circle", { class: "eb-dot", "data-tone": event.tone, cx: x, cy: y, r: 6 }));
      ebLabel(words, event.year + " · " + event.title, x, ty, event.tone);
      if (event.sub) ebLabel(words, event.sub, x, ty + 18, "guide", "middle", { class: "eb-tick" });
    });
    if (tl.note) words.push(ebNode("text", { class: "eb-tick", x: (left + right) / 2, y: 290, "text-anchor": "middle" }, tl.note));
  }

  // Rows of monospaced text, such as two sifted keys and the places they differ.
  function ebDrawRows(panel, box, shapes, words) {
    const left = box.x + 20, top = 64, gap = panel.gap ?? 34;
    words.push(ebNode("text", { class: "eb-caption", x: box.x + box.w / 2, y: 30, "text-anchor": "middle" }, panel.caption));
    panel.rows.forEach((row, k) => {
      const y = top + gap * k;
      words.push(ebNode("text", { class: "eb-tick", x: left, y, "text-anchor": "start" }, row.label));
      words.push(ebNode("text", { class: "eb-label eb-mono", "data-tone": row.tone, x: left + (panel.indent ?? 70), y, "text-anchor": "start" }, row.text));
    });
    if (panel.note) words.push(ebNode("text", { class: "eb-tick", x: box.x + box.w / 2, y: 290, "text-anchor": "middle" }, panel.note));
  }

  // The EPR pair: two particles fly apart from a source. Measuring one particle's
  // position or momentum predicts the other's.
  function ebDrawEpr(panel, box, shapes, words) {
    const mid = box.x + box.w / 2, y = 150, x1 = mid - 170, x2 = mid + 170;
    words.push(ebNode("text", { class: "eb-caption", x: mid, y: 30, "text-anchor": "middle" }, panel.caption));
    shapes.push(ebNode("line", { class: "eb-grid", x1: box.x + 20, y1: y, x2: box.x + box.w - 20, y2: y }));
    shapes.push(ebNode("rect", { class: "eb-part", "data-tone": "guide", x: mid - 22, y: y - 16, width: 44, height: 32, rx: 5 }));
    words.push(ebNode("text", { class: "eb-tick", x: mid, y: y + 36, "text-anchor": "middle" }, "source"));
    for (const [x, tone, name, dir] of [[x1, "alpha", "particle 1", -1], [x2, "beta", "particle 2", 1]]) {
      shapes.push(ebNode("circle", { class: "eb-dot", "data-tone": tone, cx: x, cy: y, r: 9 }));
      shapes.push(ebNode("line", { class: "eb-arrow eb-thin", "data-tone": tone, x1: x + dir * 14, y1: y - 26, x2: x + dir * 60, y2: y - 26 }));
      shapes.push(ebNode("polygon", { class: "eb-head", "data-tone": tone, points: (x + dir * 66) + "," + (y - 26) + " " + (x + dir * 58) + "," + (y - 31) + " " + (x + dir * 58) + "," + (y - 21) }));
      words.push(ebNode("text", { class: "eb-label", "data-tone": tone, x, y: y + 36, "text-anchor": "middle" }, name));
    }
    panel.lines.forEach((line, k) => ebLabel(words, line.text, mid, 210 + 24 * k, line.tone ?? "ink"));
    if (panel.mark === 1 || panel.mark === 2) {
      const x = panel.mark === 1 ? x1 : x2;
      shapes.push(ebNode("circle", { class: "eb-ring eb-solid", "data-tone": "angle", cx: x, cy: y, r: 17 }));
    }
  }

  // ---------------------------------------------------------------------------
  // The Three.js analyzer view (station 6). Lines are thin in WebGL, so axes and
  // the plane ring are lines while each analyzer is a cylinder with a cone tip.
  // All text stays in the SVG label layer above the canvas.
  // ---------------------------------------------------------------------------
  function ebPalette(root) {
    const css = getComputedStyle(root);
    const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    return {
      alpha: read("--blue", "#65b7ff"), beta: read("--violet", "#c19bff"), plus: read("--green", "#63f59b"),
      minus: read("--orange", "#ff9f55"), angle: read("--yellow", "#ffe16a"), warn: read("--red", "#ff676f"),
      ink: read("--ink", "#ecfff1"), axis: "#b4c9bc", guide: "#b4c9bc", disk: "#24453a"
    };
  }

  function ebCreateGraphics(THREE, canvas, colors) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    const camera = new THREE.OrthographicCamera(-EB_VIEW.cx, 560 - EB_VIEW.cx, EB_VIEW.cy, EB_VIEW.cy - 300, 1, 2000);
    camera.position.set(0, 0, 800);
    camera.lookAt(0, 0, 0);
    const disposables = [];
    const keep = item => { disposables.push(item); return item; };
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(0.4, 0.8, 1);
    scene.add(sun);
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    scene.add(group);
    // The X–Z plane: a faint disk and its rim.
    const disk = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 64)),
      keep(new THREE.MeshBasicMaterial({ color: colors.disk, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })));
    disk.rotation.x = Math.PI / 2;
    group.add(disk);
    const rim = keep(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, k) => {
      const t = k / 96 * 2 * Math.PI;
      return new THREE.Vector3(Math.sin(t), 0, Math.cos(t));
    })));
    group.add(new THREE.Line(rim, keep(new THREE.LineBasicMaterial({ color: colors.axis }))));
    group.add(new THREE.LineSegments(keep(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.12, 0, 0), new THREE.Vector3(1.12, 0, 0), new THREE.Vector3(0, -1.12, 0),
      new THREE.Vector3(0, 1.12, 0), new THREE.Vector3(0, 0, -1.12), new THREE.Vector3(0, 0, 1.12)])),
    keep(new THREE.LineBasicMaterial({ color: colors.axis, transparent: true, opacity: 0.6 }))));
    const shaft = keep(new THREE.CylinderGeometry(0.022, 0.022, 1, 16));
    const cone = keep(new THREE.ConeGeometry(0.06, 0.16, 20));
    const arrows = Array.from({ length: 4 }, () => {
      const material = keep(new THREE.MeshLambertMaterial({ color: colors.alpha }));
      const holder = new THREE.Group();
      const body = new THREE.Mesh(shaft, material), tip = new THREE.Mesh(cone, material);
      holder.add(body, tip);
      group.add(holder);
      return { holder, body, tip, material };
    });
    const up = new THREE.Vector3(0, 1, 0);

    return {
      draw(view, width, height, low) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
        renderer.setSize(width, height, false);
        const frame = ebFrame(view.yaw, view.tilt), s = EB_DIAL_R;
        group.matrix.set(
          s * frame.right[0], s * frame.right[1], s * frame.right[2], 0,
          s * frame.up[0], s * frame.up[1], s * frame.up[2], 0,
          s * frame.toward[0], s * frame.toward[1], s * frame.toward[2], 0,
          0, 0, 0, 1);
        group.matrixWorldNeedsUpdate = true;
        arrows.forEach((arrow, k) => {
          const spec = view.arrows[k];
          arrow.holder.visible = Boolean(spec);
          if (!spec) return;
          const len = spec.len ?? 0.9, dir = new THREE.Vector3(...ebAxisDir(spec.deg));
          arrow.material.color.set(colors[spec.tone] ?? colors.ink);
          arrow.holder.quaternion.setFromUnitVectors(up, dir);
          arrow.body.scale.set(1, len - 0.14, 1);
          arrow.body.position.set(0, (len - 0.14) / 2, 0);
          arrow.tip.position.set(0, len - 0.08, 0);
        });
        renderer.render(scene, camera);
      },
      dispose() {
        for (const item of disposables) item.dispose();
        renderer.dispose();
      }
    };
  }

  if (lesson) initializeEntanglementArcade(lesson);
} catch (error) {
  console.error("Entanglement Arcade could not start.", error);
}
