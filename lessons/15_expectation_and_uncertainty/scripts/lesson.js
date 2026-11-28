const STATES = {
  complex: {
    label: "opening preparation",
    ket: "(3|0⟩ + 4i|1⟩)/5",
    parts: [[3, 0], [0, 4]],
    denominatorSquared: 25
  },
  zero: {
    label: "basis state |0⟩",
    ket: "|0⟩",
    parts: [[1, 0], [0, 0]],
    denominatorSquared: 1
  },
  one: {
    label: "basis state |1⟩",
    ket: "|1⟩",
    parts: [[0, 0], [1, 0]],
    denominatorSquared: 1
  },
  "plus-x": {
    label: "X eigenstate |+x⟩",
    ket: "(|0⟩ + |1⟩)/√2",
    parts: [[1, 0], [1, 0]],
    denominatorSquared: 2
  },
  "plus-y": {
    label: "Y eigenstate |+y⟩",
    ket: "(|0⟩ + i|1⟩)/√2",
    parts: [[1, 0], [0, 1]],
    denominatorSquared: 2
  },
  "phase-quarter": {
    label: "equatorial state at phase π/4",
    ket: "(|0⟩ + e^(iπ/4)|1⟩)/√2",
    parts: [[Math.SQRT2, 0], [1, 1]],
    denominatorSquared: 4
  }
};

const OBSERVABLES = {
  x: { symbol: "X", denominatorSquared: 2, eigenkets: [[[1, 0], [1, 0]], [[1, 0], [-1, 0]]] },
  y: { symbol: "Y", denominatorSquared: 2, eigenkets: [[[1, 0], [0, 1]], [[1, 0], [0, -1]]] },
  z: { symbol: "Z", denominatorSquared: 1, eigenkets: [[[1, 0], [0, 0]], [[0, 0], [1, 0]]] }
};

const MODEL_TOLERANCE = 32 * Number.EPSILON;
const READINGS = ["+1", "−1"];
const SLOTS = ["plus", "minus"];

function overlapWeight(eigenket, state) {
  let real = 0;
  let imaginary = 0;

  // Conjugate each eigenket coefficient to take the inner product.
  for (const [index, [a, b]] of eigenket.entries()) {
    const [c, d] = state.parts[index];
    real += a * c + b * d;
    imaginary += a * d - b * c;
  }

  return real * real + imaginary * imaginary;
}

function distribution(state, observable) {
  const weights = observable.eigenkets.map(ket => overlapWeight(ket, state));
  const denominator = state.denominatorSquared * observable.denominatorSquared;
  const totalWeight = weights[0] + weights[1];

  if (Math.abs(totalWeight - denominator) > MODEL_TOLERANCE * denominator) {
    throw new RangeError("The squared overlaps do not sum to one.");
  }

  const probabilities = weights.map(weight => weight / totalWeight);
  const [plus, minus] = probabilities;
  const mean = plus - minus;

  // For ±1 readings, 4P(+)P(−) gives the variance and preserves exact zero.
  const variance = 4 * plus * minus;

  return {
    weights,
    denominator,
    exact: weights.every(Number.isInteger) && totalWeight === denominator,
    probabilities,
    mean,
    secondMoment: 1,
    variance,
    spread: Math.sqrt(variance)
  };
}

function modelFor(stateKey) {
  const state = STATES[stateKey];
  return Object.fromEntries(
    Object.entries(OBSERVABLES).map(([key, observable]) => [key, distribution(state, observable)])
  );
}

function xyComparison(model) {
  return {
    deltaX: model.x.spread,
    deltaY: model.y.spread,
    product: model.x.spread * model.y.spread,
    limit: Math.abs(model.z.mean)
  };
}

function sampleIndex(positiveProbability, random = Math.random) {
  if (positiveProbability === 1) return 0;
  if (positiveProbability === 0) return 1;
  return random() < positiveProbability ? 0 : 1;
}

function numberText(value, digits = 5) {
  return String(Number(value.toFixed(digits))).replace("-", "−");
}

function percent(value) {
  return `${numberText(value * 100, 2)}%`;
}

function gcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function fraction(numerator, denominator) {
  const divisor = gcd(Math.abs(numerator), denominator);
  const top = numberText(numerator / divisor);
  const bottom = denominator / divisor;
  return bottom === 1 ? top : `${top}/${bottom}`;
}

function probabilityFraction(data, index) {
  return data.exact
    ? fraction(data.weights[index], data.denominator)
    : numberText(data.probabilities[index]);
}

function arithmetic(data) {
  const [plus, minus] = data.probabilities.map((_, index) => probabilityFraction(data, index));
  const sum = `(+1)(${plus}) + (−1)(${minus})`;
  const squareSum = `(+1)²(${plus}) + (−1)²(${minus})`;

  if (!data.exact) {
    return {
      mean: `${sum} ≈ ${numberText(data.mean)}`,
      second: `${squareSum} ≈ ${numberText(data.secondMoment)}. A² = I gives ⟨A²⟩ = 1.`,
      spread: `1 − (${numberText(data.mean)})² ≈ ${numberText(data.variance)}. Taking the square root gives ΔA ≈ ${numberText(data.spread)}.`
    };
  }

  const signedWeight = data.weights[0] - data.weights[1];
  const meanFraction = fraction(signedWeight, data.denominator);
  const shownMean = numberText(data.mean);
  const varianceNumerator = 4 * data.weights[0] * data.weights[1];
  const varianceFraction = fraction(varianceNumerator, data.denominator ** 2);
  const root = Math.sqrt(varianceNumerator);
  const spreadFraction = Number.isInteger(root) ? fraction(root, data.denominator) : null;
  const shownSpread = numberText(data.spread);

  const shownMeanValue = Number(shownMean.replace("−", "-"));
  const meanSign = Math.abs(shownMeanValue - data.mean) <= MODEL_TOLERANCE ? "=" : "≈";
  const meanAnswer = meanFraction === shownMean
    ? meanFraction
    : `${meanFraction} ${meanSign} ${shownMean}`;

  let spreadAnswer = `√(${varianceFraction}) ≈ ${shownSpread}`;
  if (spreadFraction !== null) {
    spreadAnswer = `√(${varianceFraction}) = ${spreadFraction}`;
    if (spreadFraction !== shownSpread) {
      const sign = Math.abs(Number(shownSpread) - data.spread) <= MODEL_TOLERANCE ? "=" : "≈";
      spreadAnswer += ` ${sign} ${shownSpread}`;
    }
  }

  return {
    mean: `${sum} = ${meanAnswer}`,
    second: `${squareSum} = ${data.secondMoment}`,
    spread: `1 − (${meanFraction})² = ${varianceFraction}. ${spreadAnswer}.`
  };
}

function updatePlot(plot, find, data) {
  const origin = Number(plot.dataset.origin);
  const unit = Number(plot.dataset.unit);
  const base = Number(plot.dataset.barBase);
  const height = Number(plot.dataset.barHeight);
  const position = number => origin + unit * number;

  for (const [index, slot] of SLOTS.entries()) {
    const probability = data.probabilities[index];
    const barHeight = probability * height;
    const bar = find(`${slot}-bar`);
    bar.setAttribute("y", base - barHeight);
    bar.setAttribute("height", barHeight);
    find(`${slot}-svg-text`).textContent = percent(probability);
  }

  find("mean-marker").setAttribute("transform", `translate(${position(data.mean)} 0)`);

  const left = position(data.mean - data.spread);
  const right = position(data.mean + data.spread);
  const collapsed = data.spread === 0;
  const line = find("spread-line");
  line.setAttribute("x1", left);
  line.setAttribute("x2", right);
  line.toggleAttribute("hidden", collapsed);

  for (const [id, x] of [["spread-start", left], ["spread-end", right]]) {
    const tick = find(id);
    tick.setAttribute("x1", x);
    tick.setAttribute("x2", x);
    tick.toggleAttribute("hidden", collapsed);
  }

  const point = find("spread-point");
  point.setAttribute("cx", position(data.mean));
  point.toggleAttribute("hidden", !collapsed);
}

function wireChallenge(find, readModel) {
  const form = find("challenge");
  const panels = [...form.querySelectorAll("[data-expect-question]")];
  const check = find("challenge-check");
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
    check.textContent = index === 0 ? "Check my preparation" : "Check answer";
    clearFeedback();
    panels[index].querySelector("h4").focus();
  }

  form.addEventListener("submit", event => {
    event.preventDefault();

    if (index === 0) {
      const model = readModel();
      const correct = model.z.spread === 0 && Math.abs(model.x.spread - 1) <= MODEL_TOLERANCE;
      const spreads = `ΔZ = ${numberText(model.z.spread)} and ΔX = ${numberText(model.x.spread)}.`;
      feedback.textContent = correct
        ? `Correct. ${spreads} This preparation gives one definite Z reading and equally likely X readings.`
        : `For this preparation, ${spreads} Try a basis state with only one nonzero 0/1 coefficient.`;
      next.hidden = !correct;
      return;
    }

    const answer = form.querySelector("input[name='expect-bound-answer']:checked");
    if (!answer) {
      feedback.textContent = "Choose an answer first.";
      panels[index].querySelector("input").focus();
      return;
    }

    const correct = answer.value === "undetermined";
    feedback.textContent = correct
      ? "Correct. The π/4 preset has a zero lower bound and two positive spreads. The product is 1/2."
      : "Try comparing the X eigenstate and the π/4 preset. Both have zero lower bound. Compare their individual spreads.";
    restart.hidden = !correct;
  });

  form.addEventListener("change", clearFeedback);

  next.addEventListener("click", () => {
    if (next.hidden) return;
    index = 1;
    showQuestion();
  });

  restart.addEventListener("click", () => {
    form.reset();
    index = 0;
    showQuestion();
  });

  return () => {
    if (index === 0 && feedback.textContent) clearFeedback();
  };
}

function initializeLab(root) {
  const find = id => root.querySelector(`#expect-${id}`);
  const write = (id, text) => {
    find(id).textContent = text;
  };

  const stateSelect = find("state");
  const choices = [...root.querySelectorAll("input[name='expect-observable']")];
  const prediction = find("prediction");
  const runControls = find("run-controls");
  const buttons = [...runControls.querySelectorAll("[data-expect-trials]")];
  const plot = find("plot");

  let stateKey = "complex";
  let observableKey = "z";
  let model = modelFor(stateKey);
  let unlocked = false;
  let counts = [0, 0];
  let last = null;

  const invalidateChallenge = wireChallenge(find, () => model);

  function clearSample() {
    counts = [0, 0];
    last = null;
  }

  function renderTheory(data) {
    const symbol = OBSERVABLES[observableKey].symbol;
    const work = arithmetic(data);
    const intervalStart = data.mean - data.spread;
    const intervalEnd = data.mean + data.spread;

    write("symbol", symbol);
    write("mean", numberText(data.mean));
    write("second", data.secondMoment);
    write("variance", numberText(data.variance));
    write("spread", numberText(data.spread));
    write("mean-work", work.mean);
    write("second-work", work.second);
    write("spread-work", work.spread);
    write("interval", data.spread === 0
      ? `The spread collapses to a point at ${numberText(data.mean)}. This setting has a definite reading.`
      : `The illustrated span is ${numberText(intervalStart)} to ${numberText(intervalEnd)}. The possible readings are still −1 and +1.`);

    const desc = find("svg-desc");
    if (desc) {
      desc.textContent = [
        `Outcome minus one has probability ${percent(data.probabilities[1])}.`,
        `Outcome plus one has probability ${percent(data.probabilities[0])}.`,
        `The mean is ${numberText(data.mean)}.`,
        `The standard deviation is ${numberText(data.spread)}.`,
        `The span runs from ${numberText(intervalStart)} to ${numberText(intervalEnd)}.`
      ].join(" ");
    }

    if (plot && !plot.hasAttribute("hidden")) {
      try {
        updatePlot(plot, find, data);
      } catch {
        plot.setAttribute("hidden", "");
      }
    }
  }

  function renderBound() {
    const { deltaX, deltaY, product, limit } = xyComparison(model);
    const gap = product - limit;

    write("delta-x", numberText(deltaX));
    write("delta-y", numberText(deltaY));
    write("bound-product", numberText(product));
    write("bound-limit", numberText(limit));
    write("bound-comparison", gap > MODEL_TOLERANCE
      ? "ΔX · ΔY > |⟨Z⟩| · strict inequality"
      : gap < -MODEL_TOLERANCE
        ? "The calculated product falls below the bound. Check the model values."
        : "ΔX · ΔY = |⟨Z⟩| · equality");
  }

  function renderSample(data, theoryVisible) {
    const total = counts[0] + counts[1];
    const mean = total === 0 ? null : (counts[0] - counts[1]) / total;

    write("total", total);
    write("last", last === null ? "—" : READINGS[last]);
    write("sample-mean", mean === null ? "—" : numberText(mean));

    if (mean === null) {
      write("sample-work", "After the first trial, divide the difference of the two counts by the total number of trials.");
    } else {
      const sign = mean === Number(mean.toFixed(5)) ? "=" : "≈";
      write("sample-work", `ā = (${counts[0]} − ${counts[1]})/${total} ${sign} ${numberText(mean)}. The model mean is ${numberText(data.mean)}.`);
    }

    for (const [index, slot] of SLOTS.entries()) {
      const chance = data.probabilities[index];
      const probability = data.exact
        ? `${probabilityFraction(data, index)} · ${percent(chance)}`
        : `≈ ${percent(chance)}`;

      write(`${slot}-probability`, theoryVisible ? probability : "—");
      write(`${slot}-count`, counts[index]);
      write(`${slot}-frequency`, total === 0 ? "—" : percent(counts[index] / total));
    }
  }

  function render() {
    const data = model[observableKey];
    const theoryVisible = unlocked || (stateKey === "complex" && observableKey === "z");
    const state = STATES[stateKey];

    write("ket", `|ψ⟩ = ${state.ket}`);
    write("sample-setting", `Sample for ${state.label} · ${OBSERVABLES[observableKey].symbol}`);
    find("theory").hidden = !theoryVisible;
    find("theory-lock").hidden = theoryVisible;
    find("run-lock").hidden = unlocked;
    runControls.disabled = !unlocked;

    if (theoryVisible) renderTheory(data);
    renderSample(data, theoryVisible);
    renderBound();
  }

  function changeSetup(nextState, nextObservable) {
    if (stateKey === nextState && observableKey === nextObservable) return;
    if (stateKey !== nextState) {
      model = modelFor(nextState);
      invalidateChallenge();
    }

    stateKey = nextState;
    observableKey = nextObservable;
    clearSample();
    render();
    write("announcement", `Selected ${STATES[stateKey].label} with observable ${OBSERVABLES[observableKey].symbol}. A fresh sample starts at zero trials.`);
  }

  function runTrials(size) {
    if (!unlocked) return;
    const data = model[observableKey];
    const batch = [0, 0];

    for (let trial = 0; trial < size; trial++) {
      last = sampleIndex(data.probabilities[0]);
      batch[last]++;
    }

    counts[0] += batch[0];
    counts[1] += batch[1];
    renderSample(data, true);

    const total = counts[0] + counts[1];
    const mean = numberText((counts[0] - counts[1]) / total);
    const summary = size === 1
      ? `Simulated reading ${last === 0 ? "plus one" : "minus one"}.`
      : `Batch of ${size} simulated trials. Plus one: ${batch[0]}. Minus one: ${batch[1]}.`;

    write("announcement", `${summary} ${total} total trials. Sample mean ${mean}.`);
  }

  stateSelect.addEventListener("change", () => {
    changeSetup(stateSelect.value, observableKey);
  });

  for (const radio of choices) {
    radio.addEventListener("change", () => {
      if (radio.checked) changeSetup(stateKey, radio.value);
    });
  }

  prediction.addEventListener("change", () => {
    write("prediction-feedback", "");
  });

  prediction.addEventListener("submit", event => {
    event.preventDefault();
    const guess = prediction.querySelector("input[name='expect-guess']:checked");
    if (!guess) return;

    unlocked = true;
    render();

    const lead = guess.value === "no" ? "Correct." : "Look at the two possible readings.";
    write("prediction-feedback", `${lead} One trial gives +1 or −1. The value −0.28 is the opening distribution’s weighted mean. The standard deviation 0.96 measures the spread of readings around that mean. Try a simulated batch.`);
  });

  for (const button of buttons) {
    const size = Number(button.dataset.expectTrials);
    button.addEventListener("click", () => {
      runTrials(size);
    });
  }

  find("clear").addEventListener("click", () => {
    if (!unlocked) return;
    clearSample();
    renderSample(model[observableKey], true);
    write("announcement", "Sample cleared. The selected preparation and observable stay active.");
  });

  stateSelect.value = stateKey;
  for (const radio of choices) {
    radio.checked = radio.value === observableKey;
  }

  render();
  for (const id of ["setup-controls", "prediction-controls", "challenge-controls"]) {
    find(id).disabled = false;
  }
  find("static-note").hidden = true;
}

const lesson = document.querySelector(".site-main.expectation-lesson");
if (lesson) initializeLab(lesson);


// ===========================================================================
// Uncertainty Arcade (optional practice). Everything below uses the eu- prefix
// so it never touches the Expectation and Uncertainty Lab above, which uses
// expect-. The whole arcade runs inside one try block: if anything in it
// fails, the lab and the challenge keep working.
// ===========================================================================

try {
  const EU_TOLERANCE = 0.002; // typed answers, per real or imaginary part
  const EU_DERIVED = 0.005;   // probabilities computed from a setting you build
  const EU_ANGLE = 1;         // degrees
  const EU_SVG = "http://www.w3.org/2000/svg";
  const EU_R = Math.SQRT1_2;
  const euNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

  function euFmt(value) {
    if (!Number.isFinite(value)) return "undefined";
    return euNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
  }

  // An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
  const euTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
  const euFits = (value, answer) => Math.abs(value - answer) <= (euTerminates(answer) ? 1e-9 : EU_TOLERANCE + 1e-12);
  const euNear = (value, target, tolerance = EU_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
  const euWrap = (degrees, turn = 360) => ((degrees % turn) + turn) % turn;
  const euAngleGap = (a, b, turn = 360) => { const d = euWrap(a - b, turn); return Math.min(d, turn - d); };
  // Angles that differ by whole turns are equal.
  const euAngleFits = (a, b, turn = 360) => euAngleGap(a, b, turn) <= EU_ANGLE + 1e-9;

  // Parse numbers such as 2, −1.5, 3/5, √2, 1/√2 or (1 + √3)/2.
  // This is a small arithmetic reader (+ − × / √ and brackets), never eval.
  function euParse(raw) {
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

  function euRandom(seed) {
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
  function euSeed(c, seed = 1) { c.s.seed = seed; c.s.rng = euRandom(seed * 7919 + c.key.length); }
  const euReseed = (c, after = "") => {
    euSeed(c, c.s.seed + 1);
    return "Seed " + c.s.seed + ". New trials use a fresh sequence. Reset this station to return to seed 1." + after;
  };
  const euPick = (rng, probabilities) => {
    let r = rng(), k = 0;
    while (k < probabilities.length - 1 && r >= probabilities[k]) { r -= probabilities[k]; k++; }
    return k;
  };
  const euCount = (rng, p, n) => { let k = 0; for (let t = 0; t < n; t++) if (rng() < p) k++; return k; };

  const euGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
  const euSetup = message => euGrade(false, message);

  function euLabelText(field) {
    const label = field.closest("label");
    if (!label) return "the selected input";
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input, select, output").forEach(node => node.remove());
    return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
  }

  class EuFieldError extends Error {
    constructor(field, detail = "", custom = false) {
      super("Check " + euLabelText(field) + "." + (detail ? " " + detail : ""));
      this.field = field;
      this.detail = detail;
      this.custom = custom;
    }
  }

  function euSetText(element, text) {
    text = String(text ?? "");
    if (element && element.textContent !== text) element.textContent = text;
  }

  // Plot builders used by the station show() functions. A plan holds panels laid
  // out side by side (planes, charts, bars, polarizer stacks, chains), or one 3D view.
  const euArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
  const euPlane = (caption, items, extra = {}) => ({ kind: "plane", caption, items, limit: 1, circle: 1, axes: ["|0⟩", "|1⟩"], ...extra });
  const euBars = (caption, items, extra = {}) => ({ kind: "bars", caption, items, ...extra });
  const euChart = (caption, extra) => ({ kind: "chart", caption, x: [0, 1], y: [0, 1], xTicks: [0, 1], yTicks: [0, 0.5, 1], xLabel: "", ...extra });
  const euSweep = (f, x0, x1, n = 120) => Array.from({ length: n + 1 }, (_, k) => {
    const x = x0 + (x1 - x0) * k / n;
    return [x, f(x)];
  });
  // A real ket drawn as an arrow in the |0⟩/|1⟩ plane.
  const euKetArrow = (ket, tone, label, extra = {}) => euArrow([ket[0][0], ket[1][0]], tone, label, extra);
  const euAxisRays = (theta, extra = {}) => [{ angle: theta, through: true, solid: true, tone: "angle", ...extra }, { angle: theta + 90, through: true, tone: "minus", ...extra }];


  // Complex numbers are [real, imaginary] pairs. A ket is a list of complex
  // coordinates in the ordered basis (|0⟩, |1⟩, …); a matrix is a list of rows.
  const euAdd = ([a, b], [c, d]) => [a + c, b + d];
  const euSub = ([a, b], [c, d]) => [a - c, b - d];
  const euMul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  const euConj = ([a, b]) => [a, -b];
  const euScale = ([a, b], k) => [a * k, b * k];
  const euAbs2 = ([a, b]) => a * a + b * b;
  const euAbs = ([a, b]) => Math.hypot(a, b);
  const euRad = degrees => degrees * Math.PI / 180;
  const euPolar = (r, degrees) => [r * Math.cos(euRad(degrees)), r * Math.sin(euRad(degrees))];
  const euDiv = (z, w) => euScale(euMul(z, euConj(w)), 1 / euAbs2(w));
  const euZ = v => (typeof v === "number" ? [v, 0] : v);

  // ⟨u|v⟩ = Σ uₖ* vₖ. The bra carries the conjugate.
  const euInner = (u, v) => u.reduce((sum, z, k) => euAdd(sum, euMul(euConj(z), v[k])), [0, 0]);
  const euNorm2 = v => v.reduce((sum, z) => sum + euAbs2(z), 0);
  const euNormalize = v => { const n = Math.sqrt(euNorm2(v)); return v.map(z => euScale(z, 1 / n)); };
  const euProb = (a, psi) => euAbs2(euInner(a, psi)) / (euNorm2(a) * euNorm2(psi));
  const euKet = (...entries) => euNormalize(entries.map(euZ));
  const euApply = (A, v) => A.map(row => row.reduce((sum, z, k) => euAdd(sum, euMul(z, v[k])), [0, 0]));
  const euMatMul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((sum, z, k) => euAdd(sum, euMul(z, B[k][j])), [0, 0])));
  const euDagger = A => A[0].map((_, j) => A.map(row => euConj(row[j])));
  const euMatAdd = (A, B) => A.map((row, i) => row.map((z, j) => euAdd(z, B[i][j])));
  const euMatSub = (A, B) => A.map((row, i) => row.map((z, j) => euSub(z, B[i][j])));
  const euMatScale = (A, c) => A.map(row => row.map(z => euMul(z, euZ(c))));
  const euMatGap = (A, B) => Math.max(...A.flatMap((row, i) => row.map((z, j) => euAbs(euSub(z, B[i][j])))));
  const euIdentity = (n = 2) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => [i === j ? 1 : 0, 0]));
  const euHermGap = A => euMatGap(A, euDagger(A));
  const euOuter = (u, v) => u.map(a => v.map(b => euMul(a, euConj(b))));
  // A 2×2 matrix from four entries, each a real number or a [re, im] pair.
  const euM = (a, b, c, d) => [[euZ(a), euZ(b)], [euZ(c), euZ(d)]];
  const euTrace = A => A.reduce((sum, row, i) => euAdd(sum, row[i]), [0, 0]);
  const euDet2 = A => euSub(euMul(A[0][0], A[1][1]), euMul(A[0][1], A[1][0]));

  function euSqrtC([a, b]) {
    const r = Math.hypot(a, b);
    const re = Math.sqrt(Math.max(0, (r + a) / 2)), im = Math.sqrt(Math.max(0, (r - a) / 2));
    return [re, b < 0 ? -im : im];
  }

  // Eigenvalues and eigenkets of any 2×2 matrix: roots of a² − (tr A)a + det A = 0.
  // Pairs are sorted by real part, then imaginary part. A defective matrix returns
  // the same eigenket twice.
  function euEig2(A) {
    const t = euTrace(A), half = euScale(t, 0.5);
    const s = euSqrtC(euSub(euMul(half, half), euDet2(A)));
    const values = [euSub(half, s), euAdd(half, s)];
    const eps = 1e-12;
    const vector = value => {
      if (euAbs(A[0][1]) > eps) return euNormalize([A[0][1], euSub(value, A[0][0])]);
      if (euAbs(A[1][0]) > eps) return euNormalize([euSub(value, A[1][1]), A[1][0]]);
      return euAbs(euSub(value, A[0][0])) <= euAbs(euSub(value, A[1][1])) ? [[1, 0], [0, 0]] : [[0, 0], [1, 0]];
    };
    let pairs = values.map(value => ({ value, ket: vector(value) }));
    if (euAbs(A[0][1]) <= eps && euAbs(A[1][0]) <= eps) {
      pairs = [{ value: A[0][0], ket: [[1, 0], [0, 0]] }, { value: A[1][1], ket: [[0, 0], [1, 0]] }];
    }
    return pairs.sort((p, q) => p.value[0] - q.value[0] || p.value[1] - q.value[1]);
  }

  // How close |v⟩ is to an eigenket of A: the Rayleigh value a = ⟨v|A|v⟩/⟨v|v⟩ and
  // the relative residual ‖A|v⟩ − a|v⟩‖/‖v‖. Scale- and phase-invariant.
  function euEigenTest(A, v) {
    const n2 = euNorm2(v);
    if (n2 < 1e-12) return { zero: true, value: [NaN, NaN], residual: Infinity };
    const value = euScale(euInner(v, euApply(A, v)), 1 / n2);
    const residual = Math.sqrt(euNorm2(euApply(A, v).map((z, k) => euSub(z, euMul(value, v[k])))) / n2);
    return { zero: false, value, residual };
  }
  const euIsEigen = (A, v, reading = null) => {
    const test = euEigenTest(A, v);
    return !test.zero && test.residual <= EU_DERIVED && (reading === null || euAbs(euSub(test.value, euZ(reading))) <= EU_DERIVED);
  };
  // Same ray: equal up to a global phase and length.
  const euParallel = (u, v) => euNorm2(u) > 1e-12 && euNorm2(v) > 1e-12 && euProb(u, v) >= 1 - EU_DERIVED;

  // Readings typed in any order.
  function euSameSet(typed, exact) {
    if (typed.length !== exact.length) return false;
    const left = [...exact];
    for (const value of typed) {
      const k = left.findIndex(target => euFits(value, target));
      if (k < 0) return false;
      left.splice(k, 1);
    }
    return true;
  }

  function euCx(z) {
    const [a, b] = euZ(z);
    const re = Math.abs(a) < 5e-10 ? 0 : a, im = Math.abs(b) < 5e-10 ? 0 : b;
    if (im === 0) return euFmt(re);
    const size = Math.abs(im) === 1 ? "i" : euFmt(Math.abs(im)) + "i";
    if (re === 0) return (im < 0 ? "−" : "") + size;
    return euFmt(re) + (im < 0 ? " − " : " + ") + size;
  }
  const euKetText = ket => "(" + ket.map(euCx).join(", ") + ")ᵀ";
  const euMatText = A => "rows " + A.map(row => "[" + row.map(euCx).join(", ") + "]").join(", ");
  const euWhere = (i, j) => "row " + (i + 1) + ", column " + (j + 1);

  // Exact matrix entry check: returns the cells that miss, as "row r, column c".
  function euMatMisses(typed, exact) {
    const misses = [];
    exact.forEach((row, i) => row.forEach((z, j) => {
      const [re, im] = typed[i][j];
      if (!euFits(re, z[0]) || !euFits(im, z[1])) misses.push(euWhere(i, j));
    }));
    return misses;
  }
  const euMissText = misses => misses.length === 1 ? misses[0][0].toUpperCase() + misses[0].slice(1) + " is" : misses.length + " cells are";

  // Degrees with radians alongside: 60° · π/3 rad.
  function euRadText(degrees) {
    const k = degrees / 7.5;
    if (Math.abs(k - Math.round(k)) > 1e-9) return "≈ " + euFmt(degrees * Math.PI / 180);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let n = Math.round(k), d = 24;
    if (n === 0) return "0";
    const g = gcd(Math.abs(n), d);
    n /= g; d /= g;
    const top = n === 1 ? "π" : n === -1 ? "−π" : euFmt(n) + "π";
    return d === 1 ? top : top + "/" + d;
  }
  const euAngleText = degrees => euFmt(degrees) + "° · " + euRadText(degrees) + " rad";


  // ---------------------------------------------------------------------------
  // Qubit statistics shared by the stations.
  // ---------------------------------------------------------------------------
  const EU_MATS = {
    id: euM(1, 0, 0, 1), x: euM(0, 1, 1, 0), y: euM(0, [0, -1], [0, 1], 0), z: euM(1, 0, 0, -1)
  };
  // cos(θ/2)|0⟩ + e^(iφ) sin(θ/2)|1⟩, angles in degrees.
  const euBloch = (theta, phi) => [[Math.cos(euRad(theta) / 2), 0], euPolar(Math.sin(euRad(theta) / 2), phi)];
  // ⟨X⟩, ⟨Y⟩, ⟨Z⟩ of any nonzero ket.
  function euMeans(v) {
    const u = euNormalize(v), ab = euMul(euConj(u[0]), u[1]);
    return { x: 2 * ab[0], y: 2 * ab[1], z: euAbs2(u[0]) - euAbs2(u[1]) };
  }
  const euSpread = m => Math.sqrt(Math.max(0, 1 - m * m));
  // Mean, second moment, variance and spread of a Hermitian matrix in a normalized ket.
  function euStats(A, v) {
    const u = euNormalize(v), mean = euInner(u, euApply(A, u))[0];
    const second = euInner(u, euApply(euMatMul(A, A), u))[0];
    const variance = Math.max(0, second - mean * mean);
    return { mean, second, variance, spread: Math.sqrt(variance) };
  }
  const euMeansText = m => "⟨X⟩ = " + euFmt(m.x) + " · ⟨Y⟩ = " + euFmt(m.y) + " · ⟨Z⟩ = " + euFmt(m.z);
  const euSpreadsText = m => "ΔX = " + euFmt(euSpread(m.x)) + " · ΔY = " + euFmt(euSpread(m.y)) + " · ΔZ = " + euFmt(euSpread(m.z));
  // Angle boxes may be blank mid-edit; fall back to the slider.
  function euAngles(c) {
    const read = name => {
      const v = Number(c.val(name));
      return c.val(name) !== "" && Number.isFinite(v) ? v : Number(c.field(name + "-range").value);
    };
    return { theta: Math.max(0, Math.min(180, read("theta"))), phi: read("phi") };
  }
  const euRound = (v, step) => Math.round(v / step) * step;
  const euClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const euMatrixPanel = (caption, rows, extra = {}) => ({
    kind: "matrix", caption, rows: rows.map(row => row.map(z => (typeof z === "string" ? z : euCx(z)))), ...extra
  });
  const euLine = (caption, extra) => ({ kind: "line", caption, ...extra });
  const euChain = (caption, items, extra = {}) => ({ kind: "chain", caption, items, ...extra });


  // ---------------------------------------------------------------------------
  // Stations 1–5 · The mean and the spread.
  // ---------------------------------------------------------------------------

  // 1 · Balance Point. Each card loads its readings and starting weights.
  const EU_BALANCE = {
    a: { r: [-1, 3], w: ["3/4", "1/4"], fixed: [3 / 4, 1 / 4] },
    b: { r: [-2, 0, 3], w: ["1/2", "1/3", "1/6"], fixed: [1 / 2, 1 / 3, 1 / 6] },
    c: { r: [0, 4], w: ["1/2", "1/2"] },
    d: { r: [-1, 1, 2], w: ["1/3", "1/3", "1/3"] }
  };
  const EU_W = ["w1", "w2", "w3"];
  function euBalanceLoad(c, key) {
    const card = EU_BALANCE[key];
    c.s.card = key;
    EU_W.forEach((name, k) => {
      c.set(name, card.w[k] ?? "0");
      c.text("r" + (k + 1), euFmt(card.r[k] ?? 0));
      c.reveal(name, k < card.r.length);
    });
  }
  function euBalanceModel(c) {
    const card = EU_BALANCE[c.s.card], n = card.r.length;
    const weights = EU_W.slice(0, n).map(name => c.quiet(name) ?? NaN);
    const ok = weights.every(Number.isFinite);
    const f = c.num("f"), sum = weights.reduce((s, w) => s + w, 0);
    const mean = ok ? card.r.reduce((s, a, k) => s + a * weights[k], 0) : NaN;
    const torque = ok ? card.r.reduce((s, a, k) => s + weights[k] * (a - f), 0) : 0;
    return { card, n, weights, ok, f, sum, mean, torque };
  }
  const euBalanceLevel = m => Math.abs(m.torque) <= 0.0101;
  function euBalanceFixed(key, mean, field, work) {
    return c => {
      const m = euBalanceModel(c), card = EU_BALANCE[key];
      if (c.s.card !== key) return euSetup("Open this mission again to load its readings.");
      if (!m.ok || m.weights.some((w, k) => Math.abs(w - card.fixed[k]) > 1e-9)) {
        return euGrade(false, "This card fixes the weights at " + card.w.join(", ") + ". Reset the station or reopen the mission to reload them.");
      }
      if (!euNear(m.f, mean, 0.01)) return euGrade(false, "The beam still tips: Σ P(a)(a − f) = " + euFmt(m.torque) + ". Move the fulcrum toward the heavier side.");
      return euGrade(euFits(c.ans(field), mean), "The fulcrum is balanced. Read its position, or compute Σ a·P(a).", work);
    };
  }

  // 2 · Sandwich Calculator.
  const EU_SANDWICH = {
    a: { A: euM(1, [0, 2], [0, -2], -2), psi: euKet(2, 1), psiRows: [["2/√5"], ["1/√5"]], a: 2, eig: euKet([0, 2], 1),
      work: "A|ψ⟩ = (1·2 + 2i·1, −2i·2 − 2·1)ᵀ/√5 = (2 + 2i, −2 − 4i)ᵀ/√5. The bra is (2, 1)/√5, so ⟨ψ|A|ψ⟩ = [2(2 + 2i) + 1(−2 − 4i)]/5 = 2/5. The imaginary parts cancel. ⟨2|ψ⟩ = [(−2i)(2) + 1]/5 = (1 − 4i)/5, so P(2) = 17/25 and P(−3) = 8/25. Σ a·P(a) = 34/25 − 24/25 = 2/5." },
    b: { A: euM(0, [1, -1], [1, 1], 1), psi: euKet(3, 4), psiRows: [["3/5"], ["4/5"]], a: 2, eig: euKet([1, -1], 2),
      work: "A|ψ⟩ = ((1 − i)·4, (1 + i)·3 + 4)ᵀ/5 = (4 − 4i, 7 + 3i)ᵀ/5. ⟨ψ|A|ψ⟩ = [3(4 − 4i) + 4(7 + 3i)]/25 = 40/25 = 8/5. ⟨2|ψ⟩ = [(1 + i)·3 + 2·4]/(5√6) = (11 + 3i)/(5√6), so P(2) = 130/150 = 13/15. Σ a·P(a) = 2·13/15 − 2/15 = 24/15 = 8/5." },
    c: { A: euM(2, [0, 1], [0, -1], 2), psi: euKet(1, [1, 1]), psiRows: [["1/√3"], ["(1 + i)/√3"]], a: 3, eig: euKet([0, 1], 1),
      work: "A|ψ⟩ = (2 + i(1 + i), −i + 2(1 + i))ᵀ/√3 = (1 + i, 2 + i)ᵀ/√3. The bra conjugates: (1, 1 − i)/√3. ⟨ψ|A|ψ⟩ = [(1 + i) + (1 − i)(2 + i)]/3 = [(1 + i) + (3 − i)]/3 = 4/3. ⟨3|ψ⟩ = [(−i)(1) + (1 + i)]/√6 = 1/√6, so P(3) = 1/6. Σ a·P(a) = 3/6 + 5/6 = 4/3." },
    d: { A: euM(1, 2, 0, 1), psi: euKet(1, [0, 1]), psiRows: [["1/√2"], ["i/√2"]],
      work: "M|ψ⟩ = (1 + 2i, i)ᵀ/√2. With the bra (1, −i)/√2: ⟨ψ|M|ψ⟩ = [(1 + 2i) + (−i)(i)]/2 = (2 + 2i)/2 = 1 + i. M† has rows [1, 0], [2, 1] ≠ M, so M is not an observable. Its sandwich can be complex, and no average of real readings is complex." }
  };
  function euSandwichGrader(key) {
    return c => {
      const card = EU_SANDWICH[key], product = euApply(card.A, card.psi), mean = euInner(card.psi, product);
      const misses = [0, 1].filter(k => { const z = c.cx(key + "-p" + k); return !euFits(z[0], product[k][0]) || !euFits(z[1], product[k][1]); });
      if (misses.length) return euGrade(false, "Row " + (misses[0] + 1) + " of A|ψ⟩ is not right yet. Multiply that row of A by the column |ψ⟩, keeping the 1/√ factor.");
      const s = c.cx(key + "-s");
      if (!euFits(s[0], mean[0]) || !euFits(s[1], mean[1])) return euGrade(false, "A|ψ⟩ is right. For ⟨ψ|A|ψ⟩, conjugate the coefficients of |ψ⟩ and take the dot product with A|ψ⟩.");
      const p = euProb(card.eig, card.psi);
      if (!euFits(c.ans(key + "-p"), p)) return euGrade(false, "The sandwich is right. For P(" + card.a + "), take |⟨" + card.a + "|ψ⟩|² with the eigenket given.");
      return euGrade(euFits(c.ans(key + "-sum"), mean[0]), "P(" + card.a + ") is right. The other reading has probability 1 − P(" + card.a + "). Weight each reading and add.", card.work);
    };
  }

  // 3 · Mean Hunter.
  function euHunterModel(c) {
    const { theta, phi } = euAngles(c), ket = euBloch(theta, phi);
    return { theta, phi, ket, m: euMeans(ket) };
  }
  // Three pins on target whose ⟨X⟩ values are pairwise at least 0.2 apart.
  function euSpreadTriple(pins) {
    for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) for (let k = j + 1; k < pins.length; k++) {
      const xs = [pins[i], pins[j], pins[k]].map(p => p.m.x);
      if (Math.abs(xs[0] - xs[1]) >= 0.2 && Math.abs(xs[0] - xs[2]) >= 0.2 && Math.abs(xs[1] - xs[2]) >= 0.2) return true;
    }
    return false;
  }

  // 4 · Spread Sculptor.
  const EU_OBS_NAMES = { x: "X", y: "Y", z: "Z" };
  function euSculptKet(c, strict) {
    const v = strict ? [c.cx("a"), c.cx("b")] : [c.quietCx("a"), c.quietCx("b")];
    if (v.some(z => !z) || euNorm2(v) < 1e-12) return null;
    return v;
  }

  // 5 · Deviation Ledger.
  const EU_LEDGER = {
    a: { r: [-2, 1, 4], p: [1 / 4, 1 / 2, 1 / 4] },
    b: { r: [0, 3], p: [2 / 3, 1 / 3] },
    c: { r: [-1, 0, 2], p: [1 / 9, 4 / 9, 4 / 9], typedP: true },
    d: { r: [1, 5], p: [1 / 2, 1 / 2] }
  };
  function euLedgerExact(card) {
    const mean = card.r.reduce((s, a, k) => s + a * card.p[k], 0);
    const rows = card.r.map((a, k) => ({ a, p: card.p[k], d: card.p[k] * (a - mean), d2: card.p[k] * (a - mean) ** 2, a2: card.p[k] * a * a }));
    const variance = rows.reduce((s, r) => s + r.d2, 0), second = rows.reduce((s, r) => s + r.a2, 0);
    return { mean, rows, variance, second, spread: Math.sqrt(variance) };
  }
  const EU_LEDGER_WORK = {
    a: "⟨A⟩ = −2/4 + 1/2 + 4/4 = 1. Deviations −3, 0, 3 give P·(a − ⟨A⟩) = −3/4, 0, 3/4, which total 0. Squared: 9/4, 0, 9/4, so (ΔA)² = 9/2. ⟨A²⟩ = 4/4 + 1/2 + 16/4 = 11/2, and 11/2 − 1 = 9/2. ΔA = 3/√2 ≈ 2.1213.",
    b: "⟨A⟩ = 0 + 3/3 = 1. Deviations −1 and 2 give −2/3 and 2/3, which total 0. Squared: 2/3 and 4/3, so (ΔA)² = 2. ⟨A²⟩ = 9/3 = 3, and 3 − 1 = 2. ΔA = √2.",
    c: "P = 1/9, 4/9, 4/9 from the squared coefficients. ⟨A⟩ = −1/9 + 0 + 8/9 = 7/9. Deviations −16/9, −7/9, 11/9 give −16/81, −28/81, 44/81, which total 0. Squared and weighted: 256/729, 196/729, 484/729, total 936/729 = 104/81. ⟨A²⟩ = 1/9 + 16/9 = 17/9, and 17/9 − 49/81 = 104/81. ΔA = √104/9 ≈ 1.1331.",
    d: "⟨A⟩ = 1/2 + 5/2 = 3. Deviations −2 and 2 give −1 and 1. Squared and weighted: 2 and 2, so (ΔA)² = 4 and ΔA = 2. ⟨A²⟩ = 1/2 + 25/2 = 13, but ⟨A⟩² = 9. The difference 13 − 9 = 4 is the variance, a sum of squares that can never be negative."
  };
  function euLedgerGrader(key) {
    return c => {
      const card = EU_LEDGER[key], ex = euLedgerExact(card);
      const cell = (name, value, what) => {
        if (!euFits(c.ans(name), value)) throw euGrade(false, what);
      };
      try {
        if (card.typedP) card.r.forEach((a, k) => cell(key + "-" + (k + 1) + "-p", card.p[k], "Check P(a) in row a = " + euFmt(a) + ": square the size of the coefficient of |" + k + "⟩."));
        cell(key + "-mean", ex.mean, "⟨A⟩ is not right yet. Weight each reading by its probability and add.");
        ex.rows.forEach((r, k) => {
          const row = "row a = " + euFmt(r.a);
          cell(key + "-" + (k + 1) + "-d", r.d, "Check P·(a − ⟨A⟩) in " + row + ": subtract ⟨A⟩ from the reading, then multiply by P.");
          cell(key + "-" + (k + 1) + "-d2", r.d2, "Check P·(a − ⟨A⟩)² in " + row + ": square the deviation before multiplying by P.");
          cell(key + "-" + (k + 1) + "-a2", r.a2, "Check P·a² in " + row + ": square the reading, then multiply by P.");
        });
        cell(key + "-dsum", 0, "Add the P·(a − ⟨A⟩) column. What do the signed deviations total?");
        cell(key + "-var", ex.variance, "Add the P·(a − ⟨A⟩)² column to get (ΔA)².");
        cell(key + "-sq", ex.second, "Add the P·a² column to get ⟨A²⟩.");
        cell(key + "-short", ex.variance, "Subtract the square of ⟨A⟩ from ⟨A²⟩. It should match your (ΔA)².");
        cell(key + "-sd", ex.spread, "ΔA is the square root of (ΔA)².");
        if (key === "d") {
          cell("d-sqmean", ex.mean ** 2, "⟨A⟩² squares the mean: 3².");
          if (c.choice("d-pick") !== "sum") return euGrade(false, "Look at the column you added up to get (ΔA)².");
        }
      } catch (result) {
        if (result instanceof EuFieldError || !("pass" in result)) throw result;
        return result;
      }
      return euGrade(true, "", EU_LEDGER_WORK[key]);
    };
  }

  const euStations1 = {
    // 1 · Balance Point ------------------------------------------------------------------------------
    balance: {
      start(c) { euBalanceLoad(c, "a"); },
      load(c, check) { euBalanceLoad(c, check); },
      pointer(c, pt, phase) {
        const panel = { x: [-3, 5] }, m = euBalanceModel(c);
        if (phase === "up") { c.s.grab = null; return true; }
        if (phase === "down") {
          if (pt.y > EU_BAL.axisY + 6) c.s.grab = "f";
          else {
            const near = m.card.r.map((a, k) => [Math.abs(euBalX(panel, a) - pt.x), k]).sort((p, q) => p[0] - q[0])[0];
            if (!near || near[0] > 30 || pt.y < 30) return false;
            c.s.grab = near[1];
          }
        }
        if (c.s.grab === null || c.s.grab === undefined) return false;
        if (c.s.grab === "f") c.set("f", euFmt(euClamp(euRound(euBalValue(panel, pt.x), 0.05), -3, 5)).replace("−", "-"));
        else {
          const w = euClamp(euRound((EU_BAL.axisY - pt.y) / EU_BAL.barMax, 0.005), 0, 1);
          c.set(EU_W[c.s.grab], euFmt(w));
          if (m.n === 2) c.set(EU_W[1 - c.s.grab], euFmt(Math.round((1 - w) * 1000) / 1000));
        }
        return true;
      },
      show(c) {
        const m = euBalanceModel(c), card = m.card;
        const tip = !m.ok ? "finish the weights" : euBalanceLevel(m) ? "the beam is level" : m.torque > 0 ? "the beam tips right" : "the beam tips left";
        c.put("state", "Readings " + card.r.map(euFmt).join(", ") + " · weights " + m.weights.map(w => (Number.isFinite(w) ? euFmt(w) : "?")).join(", ") +
          " (sum " + (m.ok ? euFmt(m.sum) : "?") + ") · fulcrum f = " + euFmt(m.f) + " · Σ P(a)(a − f) = " + euFmt(m.torque) + ": " + tip + ".");
        const shown = c.revealed(c.s.card);
        return {
          panels: [{ kind: "balance", caption: "weights P(a) on the reading line", x: [-3, 5], readings: card.r, weights: m.weights, f: m.f, torque: m.torque,
            mean: shown && m.ok ? m.mean : undefined, note: m.ok && Math.abs(m.sum - 1) > 0.005 ? "The weights add to " + euFmt(m.sum) + ", not 1." : shown ? "Blue marker: ⟨A⟩ = Σ a·P(a)" : "" }],
          caption: tip,
          desc: "A beam with columns at readings " + card.r.map(euFmt).join(", ") + " of heights " + m.weights.map(w => (Number.isFinite(w) ? euFmt(w) : "unknown")).join(", ") +
            ", resting on a fulcrum at " + euFmt(m.f) + ". The weighted distance Σ P(a)(a − f) is " + euFmt(m.torque) + ", so " + tip + "."
        };
      },
      checks: {
        a: ["Each weight pulls with P(a) at distance a − f from the fulcrum.", "(−1)(3/4) + (3)(1/4).", euBalanceFixed("a", 0, "a-mean",
          "Σ a·P(a) = (−1)(3/4) + 3(1/4) = 0. The beam balances at 0, a value no trial can show: every trial reads −1 or 3.")],
        b: ["Multiply each reading by its weight and add.", "(−2)(1/2) + 0(1/3) + 3(1/6).", euBalanceFixed("b", -1 / 2, "b-mean",
          "Σ a·P(a) = −1 + 0 + 1/2 = −1/2. The reading 0 adds no pull, but its weight still counts in the total of 1.")],
        c: ["With the fulcrum at 1.5: P(0)(0 − 1.5) + P(4)(4 − 1.5) = 0.", "−1.5(1 − p) + 2.5p = 0.", c => {
          const m = euBalanceModel(c);
          if (c.s.card !== "c") return euSetup("Open this mission again to load its readings.");
          if (!euNear(m.f, 1.5, 0.01)) return euGrade(false, "Put the fulcrum at 1.5 first. It is at " + euFmt(m.f) + ".");
          if (!m.ok || !euNear(m.sum, 1)) return euGrade(false, "The two weights must add to 1.");
          return euGrade(euNear(m.weights[1], 3 / 8), "The beam tips: Σ P(a)(a − f) = " + euFmt(m.torque) + ". Shift weight toward the lighter side.",
            "Balance at 1.5 needs 4·P(4) = 1.5, so P(4) = 3/8 and P(0) = 5/8. Check: 0·5/8 + 4·3/8 = 3/2.");
        }],
        d: ["Two equations: P(−1) + P(1) + P(2) = 1 and −P(−1) + P(1) + 2P(2) = 0.5.", "Try P(2) = 0.2 and solve for the other two.", c => {
          const m = euBalanceModel(c);
          if (c.s.card !== "d") return euSetup("Open this mission again to load its readings.");
          if (!m.ok || m.weights.some(w => w < 0.005)) return euGrade(false, "Give every reading a nonzero weight.");
          if (!euNear(m.sum, 1)) return euGrade(false, "Your weights add to " + euFmt(m.sum) + ". They must add to 1.");
          if (!euNear(m.mean, 0.5)) return euGrade(false, "Your weights balance at Σ a·P(a) = " + euFmt(m.mean) + ", not 0.5.");
          if (!euNear(m.f, 0.5, 0.01)) return euGrade(false, "The weights are right. Now put the fulcrum at 0.5.");
          return euGrade(c.choice("d-pick") === "no", "List the values a single trial can show.",
            "Your weights " + m.weights.map(euFmt).join(", ") + " balance at 0.5. Many other choices do too, for example 0.35, 0.45, 0.2. The balance point 0.5 is not a reading: each trial shows −1, 1 or 2.");
        }]
      }
    },

    // 2 · Sandwich Calculator ----------------------------------------------------------------------------
    sandwich: {
      show(c) {
        const key = c.open() ?? "a", card = EU_SANDWICH[key], name = key === "d" ? "M" : "A";
        c.put("state", (c.open() ? "" : "Open a mission to load its matrix. Showing mission 1: ") + name + " = " + euMatText(card.A) + " · |ψ⟩ = (" + card.psiRows.map(r => r[0]).join(", ") + ")ᵀ.");
        const panels = [euMatrixPanel(name, card.A, { tone: "alpha" }), euMatrixPanel("|ψ⟩", card.psiRows, { tone: "plus", weight: 0.6 })];
        if (c.revealed(key)) {
          const product = euApply(card.A, card.psi);
          panels.push(euMatrixPanel(name + "|ψ⟩", product.map(z => [z]), { tone: "beta", weight: 0.8, note: "⟨ψ|" + name + "|ψ⟩ = " + euCx(euInner(card.psi, product)) }));
        }
        return { panels, caption: name + " and |ψ⟩",
          desc: "The matrix " + name + " with " + euMatText(card.A) + " beside the column |ψ⟩." + (c.revealed(key) ? " After the mission, the product column is shown too." : "") };
      },
      checks: {
        a: ["Row 1: 1·(2/√5) + 2i·(1/√5).", "The bra of (2, 1)/√5 is (2, 1)/√5: real coefficients don’t change.", euSandwichGrader("a")],
        b: ["Row 2: (1 + i)(3/5) + 1·(4/5).", "⟨2|ψ⟩ uses the conjugate of the eigenket: (1 + i, 2)/√6.", euSandwichGrader("b")],
        c: ["Row 1: 2·(1/√3) + i·(1 + i)/√3.", "The bra conjugates 1 + i to 1 − i.", euSandwichGrader("c")],
        d: ["M|ψ⟩ = (1 + 2i, i)ᵀ/√2.", "The bra is (1, −i)/√2.", c => {
          const card = EU_SANDWICH.d, mean = euInner(card.psi, euApply(card.A, card.psi)), s = c.cx("d-s");
          if (!euFits(s[0], mean[0]) || !euFits(s[1], mean[1])) return euGrade(false, "Compute M|ψ⟩ first, then take the dot product with the conjugated coefficients (1, −i)/√2.");
          return euGrade(c.choice("d-pick") === "not", "Is M equal to its conjugate transpose?", card.work);
        }]
      }
    },

    // 3 · Mean Hunter ---------------------------------------------------------------------------------------
    hunter: {
      start(c) { c.s.pins = []; },
      actions: {
        pin(c) {
          const h = euHunterModel(c);
          c.s.pins.push(h);
          if (c.s.pins.length > 6) c.s.pins.shift();
          return "Pinned θ = " + euFmt(h.theta) + "°, φ = " + euFmt(h.phi) + "°. " + c.s.pins.length + " pin" + (c.s.pins.length === 1 ? "" : "s") + " kept (up to 6).";
        },
        unpin(c) { c.s.pins = []; return "Pins cleared."; }
      },
      show(c) {
        const h = euHunterModel(c), m = h.m;
        c.list("pins", c.s.pins.map((p, k) => "Pin " + (k + 1) + ": θ = " + euFmt(p.theta) + "°, φ = " + euFmt(p.phi) + "° · " + euMeansText(p.m)));
        c.put("state", "|ψ⟩ = " + euKetText(h.ket) + " · " + euMeansText(m) + ".");
        const row = (label, key, tone) => ({ label, tone, points: [
          ...c.s.pins.map(p => ({ x: p.m[key], tone: "guide", r: 4 })),
          { x: m[key], tone, label: euFmt(m[key]) }] });
        return {
          panels: [euLine("the three means of your state (grey: pins)", { x: [-1, 1], rows: [row("⟨Z⟩", "z", "plus"), row("⟨X⟩", "x", "alpha"), row("⟨Y⟩", "y", "beta")] })],
          caption: "θ = " + euFmt(h.theta) + "°, φ = " + euFmt(h.phi) + "°",
          desc: "Three number lines from −1 to 1 for ⟨Z⟩, ⟨X⟩ and ⟨Y⟩. Your state sits at " + euFmt(m.z) + ", " + euFmt(m.x) + " and " + euFmt(m.y) + ". " + c.s.pins.length + " pinned states appear as grey dots."
        };
      },
      checks: {
        a: ["⟨Z⟩ = cos θ.", "cos θ = −0.6 gives θ ≈ 126.9°. φ doesn’t matter.", c => {
          const m = euHunterModel(c).m;
          return euGrade(euNear(m.z, -0.6), "Your ⟨Z⟩ is " + euFmt(m.z) + ". Turn θ.", "⟨Z⟩ = cos θ = −0.6 at θ ≈ 126.87°. Any φ works, because φ never enters ⟨Z⟩.");
        }],
        b: ["⟨X⟩ = sin θ cos φ.", "With θ = 45°, cos φ = (1/2)/sin 45° = 1/√2, so φ = 45°.", c => {
          const m = euHunterModel(c).m;
          if (!euNear(m.x, 0.5)) return euGrade(false, "Your ⟨X⟩ is " + euFmt(m.x) + ".");
          return euGrade(Math.abs(m.z) > 0.1, "⟨X⟩ = 1/2, but this state sits near the equator. Move θ away from 90° and retune φ.",
            "Your state has ⟨X⟩ = 1/2 with ⟨Z⟩ = " + euFmt(m.z) + ". On the equator, φ = 60° would also do it. Many (θ, φ) pairs give the same X mean.");
        }],
        c: ["Fix θ with cos θ = 0.28, then pin three different φ.", "φ = 0°, 90° and 180° give ⟨X⟩ = 0.96, 0 and −0.96.", c => {
          const on = c.s.pins.filter(p => euNear(p.m.z, 0.28));
          if (on.length < 3) return euSetup("Pin at least three states with ⟨Z⟩ = 0.28. You have " + on.length + ".");
          if (!euSpreadTriple(on)) return euGrade(false, "Your pinned states have ⟨X⟩ values too close together. Spread φ out.");
          return euGrade(c.choice("c-pick") === "theta", "Compare θ and φ across your pins.",
            "All three have θ ≈ 73.7°, so cos θ = 0.28, and different φ. They lie on one circle of latitude, and every state on it has ⟨Z⟩ = 0.28 while ⟨X⟩ ranges from −0.96 to 0.96.");
        }],
        d: ["⟨X⟩ = 0 when cos φ = 0, or at the poles.", "θ = 60°, φ = 90° and θ = 120°, φ = 90° both work.", c => {
          const on = c.s.pins.filter(p => euNear(p.m.x, 0));
          if (!on.some(p => p.m.z > 0.1) || !on.some(p => p.m.z < -0.1)) return euSetup("Pin one state with ⟨X⟩ = 0 and ⟨Z⟩ > 0.1, and another with ⟨X⟩ = 0 and ⟨Z⟩ < −0.1.");
          return euGrade(c.choice("d-pick") === "no", "Your two pins share ⟨X⟩. Are they the same state?",
            "Both pins have ⟨X⟩ = 0, yet their Z means have opposite signs. ⟨X⟩ = 0 holds on a whole great circle through the poles. One mean is one number, and a qubit state needs two angles.");
        }]
      }
    },

    // 4 · Spread Sculptor ---------------------------------------------------------------------------------
    sculptor: {
      show(c) {
        const v = euSculptKet(c, false), key = c.val("obs");
        if (!v) {
          c.put("state", "Enter both coefficients. They can’t both be zero.");
          return { panels: [euChart("(ΔA)² against ⟨A⟩", { x: [-1, 1], xTicks: [-1, 0, 1], yTicks: [0, 0.5, 1], series: [{ pts: euSweep(m => 1 - m * m, -1, 1), tone: "guide", dashed: true }] })],
            caption: "no ket yet", desc: "The parabola (ΔA)² = 1 − ⟨A⟩². Your ket is not complete yet." };
        }
        const u = euNormalize(v), m = euMeans(v);
        c.put("state", "Normalized |ψ⟩ = " + euKetText(u) + " · " + EU_OBS_NAMES[key] + ": ⟨" + EU_OBS_NAMES[key] + "⟩ = " + euFmt(m[key]) +
          ", (Δ" + EU_OBS_NAMES[key] + ")² = " + euFmt(1 - m[key] ** 2) + ", Δ" + EU_OBS_NAMES[key] + " = " + euFmt(euSpread(m[key])) + " · " + euSpreadsText(m) + ".");
        const dots = ["z", "x", "y"].map(k => ({ x: m[k], y: 1 - m[k] ** 2, tone: { z: "plus", x: "alpha", y: "beta" }[k], hollow: k !== key, label: EU_OBS_NAMES[k], r: k === key ? 7 : 5 }));
        return {
          panels: [euChart("(ΔA)² = 1 − ⟨A⟩² for A = X, Y, Z", { x: [-1, 1], xTicks: [-1, -0.5, 0, 0.5, 1], yTicks: [0, 0.25, 0.5, 0.75, 1], xLabel: "⟨A⟩",
            series: [{ pts: euSweep(m => 1 - m * m, -1, 1), tone: "guide", dashed: true }], dots })],
          caption: "Δ" + EU_OBS_NAMES[key] + " = " + euFmt(euSpread(m[key])),
          desc: "The parabola (ΔA)² = 1 − ⟨A⟩² with three dots for X, Y and Z. The selected observable " + EU_OBS_NAMES[key] + " is at ⟨A⟩ = " + euFmt(m[key]) + ", (ΔA)² = " + euFmt(1 - m[key] ** 2) + "."
        };
      },
      checks: {
        a: ["ΔZ = 0 needs ⟨Z⟩ = ±1: one coefficient must be zero.", "Try α = 0 and β = i.", c => {
          const v = euSculptKet(c, true);
          if (!v) return euGrade(false, "The zero ket is not a state.");
          const m = euMeans(v), u = euNormalize(v);
          if (euSpread(m.z) > EU_DERIVED) return euGrade(false, "ΔZ = " + euFmt(euSpread(m.z)) + ". Make one coefficient zero.");
          return euGrade(u.some(z => Math.abs(z[1]) > EU_DERIVED), "ΔZ = 0, but every coefficient is real. Give the nonzero one an imaginary part.",
            "Your ket is a multiple of |" + (m.z > 0 ? 0 : 1) + "⟩. A global phase such as i changes nothing measurable, so the Z reading is still certain and ΔZ = 0.");
        }],
        b: ["(ΔZ)² = 1/4 means ⟨Z⟩² = 3/4.", "|α|² = (1 + √3/2)/2. Try α = 2 + √3 and β = 1, before normalizing.", c => {
          const v = euSculptKet(c, true);
          if (!v) return euGrade(false, "The zero ket is not a state.");
          const m = euMeans(v);
          if (!euNear(euSpread(m.z), 0.5)) return euGrade(false, "Your ΔZ is " + euFmt(euSpread(m.z)) + ". You need ⟨Z⟩ = ±√3/2 ≈ ±0.866.");
          return euGrade(euFits(c.ans("b-absz"), Math.sqrt(3) / 2), "ΔZ = 1/2 is right. Solve 1 − ⟨Z⟩² = 1/4 for |⟨Z⟩|.",
            "1 − ⟨Z⟩² = 1/4 gives |⟨Z⟩| = √3/2. Your ket has ⟨Z⟩ = " + euFmt(m.z) + ". Then |α|² = (1 ± √3/2)/2 ≈ 0.933 or 0.067.");
        }],
        c: ["ΔZ = 1 needs |α| = |β|.", "Keep |α| = |β| but give β a phase other than 0°, 90°, 180°, 270°, such as α = 1, β = 1/2 + (√3/2)i.", c => {
          const v = euSculptKet(c, true);
          if (!v) return euGrade(false, "The zero ket is not a state.");
          const m = euMeans(v);
          if (euSpread(m.z) < 0.995) return euGrade(false, "Your ΔZ is " + euFmt(euSpread(m.z)) + ". Make |α| = |β|.");
          return euGrade(Math.abs(m.x) < 0.99 && Math.abs(m.y) < 0.99, "ΔZ = 1, but this is |±x⟩ or |±y⟩. Turn the relative phase to something in between.",
            "|α| = |β| puts the state on the equator, where ⟨Z⟩ = 0 and ΔZ = 1. Your state has ⟨X⟩ = " + euFmt(m.x) + " and ⟨Y⟩ = " + euFmt(m.y) + ". The whole equator has full Z spread.");
        }],
        d: ["(ΔX)² = 16/25 needs ⟨X⟩ = ±3/5.", "For real (α, β), ⟨X⟩ = 2αβ/(α² + β²). Try (3, 1).", c => {
          const v = euSculptKet(c, true);
          if (!v) return euGrade(false, "The zero ket is not a state.");
          if (v.some(z => z[1] !== 0)) return euGrade(false, "Use real coefficients: both imaginary parts must be 0.");
          const m = euMeans(v);
          return euGrade(euNear(euSpread(m.x), 0.8), "Your ΔX is " + euFmt(euSpread(m.x)) + ". You need ⟨X⟩ = ±0.6.",
            "Your ket has ⟨X⟩ = " + euFmt(m.x) + ", so (ΔX)² = 1 − 9/25 = 16/25 and ΔX = 4/5. For example (3, 1)/√10 gives ⟨X⟩ = 6/10.");
        }]
      }
    },

    // 5 · Deviation Ledger ---------------------------------------------------------------------------------
    ledger: {
      show(c) {
        const key = c.open() ?? "a", card = EU_LEDGER[key], ex = euLedgerExact(card), done = c.revealed(key);
        const typedMean = c.quiet(key + "-mean");
        const typed = card.r.map((_, k) => c.quiet(key + "-" + (k + 1) + "-d2"));
        c.put("state", (c.open() ? "Ledger: " : "Open a ledger. Showing ledger 1: ") + "readings " + card.r.map(euFmt).join(", ") +
          (card.typedP ? " with Born probabilities from |ψ⟩" : " with P = " + card.p.map(euFmt).join(", ")) + (typedMean === null ? "." : " · your ⟨A⟩ = " + euFmt(typedMean) + "."));
        const lo = Math.min(...card.r) - 1, hi = Math.max(...card.r) + 1;
        const points = card.r.map((a, k) => ({ x: a, tone: "angle", label: card.typedP && !done ? "P = ?" : "P = " + euFmt(card.p[k]) }));
        if (typedMean !== null) points.push({ x: typedMean, tone: "alpha", label: "your ⟨A⟩", raise: 18, r: 5 });
        return {
          panels: [
            euLine("readings, weights and your mean", { weight: 1.3, x: [lo, hi], rows: [{ label: "a", tone: "ink", points }] }),
            euBars("your P·(a − ⟨A⟩)² column", card.r.map((a, k) => ({ label: euFmt(a), value: typed[k] ?? 0, text: typed[k] === null ? "?" : euFmt(typed[k]), tone: "minus" })),
              { max: Math.max(1, Math.ceil(Math.max(...ex.rows.map(r => r.d2), ...typed.map(v => v ?? 0)))) })
          ],
          caption: done ? "(ΔA)² = " + euFmt(ex.variance) : "ledger " + key,
          desc: "A number line with readings " + card.r.map(euFmt).join(", ") + (typedMean === null ? "" : " and your mean at " + euFmt(typedMean)) +
            ". Beside it, bars show the squared-deviation entries you have typed: " + typed.map(v => (v === null ? "blank" : euFmt(v))).join(", ") + "."
        };
      },
      checks: {
        a: ["⟨A⟩ = (−2)(1/4) + 1(1/2) + 4(1/4).", "With ⟨A⟩ = 1, the deviations are −3, 0 and 3.", euLedgerGrader("a")],
        b: ["⟨A⟩ = 0(2/3) + 3(1/3) = 1.", "P·a² for a = 3 is (1/3)(9) = 3.", euLedgerGrader("b")],
        c: ["P = |coefficient|²: 1/9, 4/9, 4/9.", "⟨A⟩ = 7/9. The deviation for a = 2 is 11/9.", euLedgerGrader("c")],
        d: ["⟨A⟩ = 3, and both deviations have size 2.", "⟨A²⟩ = (1 + 25)/2.", euLedgerGrader("d")]
      }
    }
  };


  // ---------------------------------------------------------------------------
  // Stations 6–11 · Spread rules, samples, and the uncertainty relation.
  // ---------------------------------------------------------------------------

  // 6 · Shift and Stretch Statistics. Base distributions have readings ±1 with P(+1) = p.
  const EU_SHIFT = {
    a: { obs: "Z", p: 0.8, a: 3, b: 1 },
    b: { obs: "X", p: 0.25, a: -2, b: 5 },
    c: { obs: "Z", p: 0.8, a: 1, b: -0.6 },
    d: { obs: "Z", p: 0.9, a: 0.5, b: 0.5 }
  };
  const euShiftBase = card => ({ mean: 2 * card.p - 1, spread: 2 * Math.sqrt(card.p * (1 - card.p)) });
  const euSame = (u, v) => Math.abs(u - v) < 1e-9;
  function euShiftGrader(key, fieldsWanted, work) {
    return c => {
      const card = EU_SHIFT[key], base = euShiftBase(card), a = c.num("a"), b = c.num("b");
      if (c.s.card !== key) return euSetup("Open this mission again to load its distribution.");
      if (key === "c") {
        if (!euSame(a, 1)) return euGrade(false, "Keep a = 1 for this mission.");
        if (!euSame(b, -0.6)) return euGrade(false, "With b = " + euFmt(b) + " the new mean is " + euFmt(base.mean + b) + ". Choose b to cancel ⟨Z⟩ = 0.6.");
      } else if (!euSame(a, card.a) || !euSame(b, card.b)) {
        return euGrade(false, key === "d" ? "Readings a·(+1) + b = 1 and a·(−1) + b = 0. Solve for a and b, and set the sliders."
          : "Set the sliders to a = " + euFmt(card.a) + " and b = " + euFmt(card.b) + ".");
      }
      const mean = card.a * base.mean + card.b, spread = Math.abs(card.a) * base.spread;
      if (fieldsWanted.includes("mean") && !euFits(c.ans(key + "-mean"), mean)) return euGrade(false, "The new mean is a⟨A⟩ + b. Use ⟨" + card.obs + "⟩ = " + euFmt(base.mean) + ".");
      return euGrade(euFits(c.ans(key + "-spread"), spread), "The shift b never changes the spread. The scale multiplies it by |a|.", work);
    };
  }

  // 7 · Zero Spread Detector.
  const EU_G = euM(2, 1, 1, 2), EU_B = euM(1, [0, 1], [0, -1], 1);
  const EU_DECK = {
    p1: { A: EU_MATS.x, an: "X", psi: euKet(1, -1), kind: "zero" },
    p2: { A: EU_MATS.z, an: "Z", psi: euKet(1, -1), kind: "pos" },
    p3: { A: EU_MATS.y, an: "Y", psi: euKet(1, [0, -1]), kind: "zero" },
    p4: { A: EU_MATS.z, an: "Z", psi: euKet(0, [0, 1]), kind: "zero" },
    p5: { A: EU_MATS.x, an: "X", psi: euKet(3, 4), kind: "pos" },
    g1: { A: EU_G, an: "G", psi: euKet(1, 1), kind: "zero" },
    g2: { A: EU_G, an: "G", psi: euKet(1, -1), kind: "zero" },
    g3: { A: EU_G, an: "G", psi: euKet(1, 0), kind: "pos" },
    g4: { A: EU_B, an: "B", psi: euKet(1, [0, -1]), kind: "zero" }
  };
  function euDeckGrader(prefix, keys, work) {
    return c => {
      const off = keys.filter(k => c.choice(prefix + "-" + k) !== EU_DECK[k].kind).length;
      return euGrade(!off, (off === 1 ? "1 card is" : off + " cards are") + " tagged wrong. Inspect each card: is A|ψ⟩ a multiple of |ψ⟩?", work);
    };
  }

  // 8 · How Many Trials? Seeded experiments of N trials each.
  const EU_TRIALS = {
    zx: { name: "Z on (2|0⟩ + |1⟩)/√5", sym: "Z", p: 0.8 },
    xx: { name: "X on (2|0⟩ + |1⟩)/√5", sym: "X", p: 0.9 },
    mx: { name: "X on |−x⟩", sym: "X", p: 0 }
  };
  const euTrialModel = setup => ({ ...EU_TRIALS[setup], mean: 2 * EU_TRIALS[setup].p - 1, spread: 2 * Math.sqrt(EU_TRIALS[setup].p * (1 - EU_TRIALS[setup].p)) });
  const EU_BUDGET = 2000;
  function euTrialN(c) {
    const n = Number(c.val("n"));
    if (!Number.isInteger(n) || n < 1 || n > 5000) throw new EuFieldError(c.field("n"), "Enter a whole number from 1 to 5000.", true);
    return n;
  }
  function euExperiment(c, setup, n) {
    const k = euCount(c.s.rng, EU_TRIALS[setup].p, n);
    return (2 * k - n) / n;
  }
  function euTrialsClear(c) { c.s.runs = []; c.s.last = null; c.s.used = 0; }
  const euSD = list => {
    if (list.length < 2) return NaN;
    const m = list.reduce((s, v) => s + v, 0) / list.length;
    return Math.sqrt(list.reduce((s, v) => s + (v - m) ** 2, 0) / list.length);
  };

  // 9 · Robertson Bound Explorer.
  const EU_D = euM(2, 0, 0, -1), EU_H = euMatScale(euMatAdd(EU_MATS.x, EU_MATS.z), Math.SQRT1_2);
  const EU_PAIRS = {
    xy: [EU_MATS.x, EU_MATS.y, "X", "Y"], yz: [EU_MATS.y, EU_MATS.z, "Y", "Z"], zx: [EU_MATS.z, EU_MATS.x, "Z", "X"],
    zd: [EU_MATS.z, EU_D, "Z", "D"], xh: [EU_MATS.x, EU_H, "X", "H"]
  };
  const EU_RSTATES = {
    s1: euKet(2, 1), s2: euKet(1, [1, 1]), s3: euKet(1, euPolar(1, 60)), s4: euKet(3, 4), s5: euKet(2, [0, 1])
  };
  const EU_RCARDS = { yz: ["yz", "s1"], zx: ["zx", "s2"], xy: ["xy", "s3"], zd: ["zd", "s4"], xh: ["xh", "s5"] };
  function euRobertson(pairKey, stateKey) {
    const [A, B, an, bn] = EU_PAIRS[pairKey], psi = EU_RSTATES[stateKey];
    const C = euMatSub(euMatMul(A, B), euMatMul(B, A)), sa = euStats(A, psi), sb = euStats(B, psi);
    const bound = euAbs(euInner(psi, euApply(C, psi))) / 2, product = sa.spread * sb.spread;
    return { A, B, an, bn, C, sa, sb, bound, product, zero: bound < 1e-9, equal: Math.abs(product - bound) < 1e-9 };
  }
  const EU_ROBERTSON_WORK = {
    yz: "For (2, 1)/√5: ⟨X⟩ = 4/5, ⟨Y⟩ = 0, ⟨Z⟩ = 3/5. ΔY = 1 and ΔZ = √(1 − 9/25) = 4/5, so the product is 4/5. The bound is ½|⟨2iX⟩| = |⟨X⟩| = 4/5. Equality: ⟨Y⟩ = 0 puts the state on the X–Z great circle.",
    zx: "⟨Z⟩ = (1 − 2)/3 = −1/3, ⟨X⟩ = 2/3, ⟨Y⟩ = 2/3. ΔZ = √(8/9) = 2√2/3 ≈ 0.9428 and ΔX = √(5/9) = √5/3 ≈ 0.7454, so the product is 2√10/9 ≈ 0.7027. The bound is |⟨Y⟩| = 2/3. (ΔZ·ΔX)² − ⟨Y⟩² = 40/81 − 36/81 = 4/81 = ⟨Z⟩²⟨X⟩², so the inequality is strict.",
    xy: "On the equator at φ = 60°: ⟨X⟩ = 1/2, ⟨Y⟩ = √3/2, ⟨Z⟩ = 0. ΔX = √3/2 and ΔY = 1/2, so the product is √3/4 ≈ 0.433. The bound |⟨Z⟩| is 0. A zero bound with both spreads positive: strict inequality.",
    zd: "D = (1/2)I + (3/2)Z commutes with Z, so [Z, D] = 0 and the bound is 0 for every state. ⟨Z⟩ = −7/25, so ΔZ = 24/25, and ΔD = (3/2)ΔZ = 36/25. The product is 864/625 ≈ 1.3824: strict inequality with a zero bound.",
    xh: "[X, H] = ([X, X] + [X, Z])/√2 = −2iY/√2 = −√2 iY, so c = −√2. For (2, i)/√5: ⟨X⟩ = 0, ⟨Y⟩ = 4/5, ⟨Z⟩ = 3/5. ΔX = 1. ⟨H⟩ = (0 + 3/5)/√2 and H² = I, so ΔH = √(1 − 9/50) = √0.82 ≈ 0.9055. The bound is (√2/2)(4/5) ≈ 0.5657 < 0.9055: strict."
  };
  function euRobertsonGrader(key) {
    return c => {
      const [pair, state] = EU_RCARDS[key];
      if (c.val("pair") !== pair || c.val("psi") !== state) return euSetup("Open this mission again, or set the pair and state it names.");
      const r = euRobertson(pair, state);
      if (key === "xh" && !euFits(c.ans("xh-c"), -Math.SQRT2)) return euGrade(false, "Expand [X, (X + Z)/√2]. [X, X] = 0 and [X, Z] = −[Z, X] = −2iY.");
      if (!euFits(c.ans(key + "-da"), r.sa.spread)) return euGrade(false, "Δ" + r.an + " is not right yet. For a Pauli observable, (ΔA)² = 1 − ⟨A⟩².");
      if (!euFits(c.ans(key + "-db"), r.sb.spread)) return euGrade(false, "Δ" + r.bn + " is not right yet." + (key === "zd" ? " D = (1/2)I + (3/2)Z, so ΔD = (3/2)ΔZ." : key === "xh" ? " H² = I, so (ΔH)² = 1 − ⟨H⟩²." : ""));
      if (!euFits(c.ans(key + "-prod"), r.product)) return euGrade(false, "Multiply your two spreads.");
      if (!euFits(c.ans(key + "-bound"), r.bound)) return euGrade(false, "Find ⟨[A, B]⟩, take its magnitude, and halve it.");
      if (c.choice(key + "-zero") !== (r.zero ? "yes" : "no")) return euGrade(false, "Look at your bound again.");
      return euGrade(c.choice(key + "-kind") === (r.equal ? "eq" : "strict"), "Compare your product with your bound.", EU_ROBERTSON_WORK[key]);
    };
  }

  // 10 · Minimum Uncertainty Hunt.
  function euGapAt(theta, phi) {
    const m = euMeans(euBloch(theta, phi)), dx = euSpread(m.x), dy = euSpread(m.y);
    return { m, dx, dy, product: dx * dy, bound: Math.abs(m.z), gap: dx * dy - Math.abs(m.z) };
  }
  const EU_MAP = { left: 46, right: 544, top: 40, bottom: 246 };
  let euHeatCells = null;
  function euHeat() {
    if (euHeatCells) return euHeatCells;
    euHeatCells = [];
    for (let i = 0; i < 36; i++) for (let j = 0; j < 24; j++) {
      const g = euGapAt(i * 5 + 2.5, j * 15 + 7.5).gap;
      euHeatCells.push({ x0: i * 5, x1: i * 5 + 5, y0: j * 15, y1: j * 15 + 15, tone: "beta", opacity: (0.06 + 0.9 * Math.min(1, g / 0.5)).toFixed(3) });
    }
    return euHeatCells;
  }
  function euSetAngles(c, theta, phi) {
    c.set("theta", euFmt(euClamp(euRound(theta, 0.5), 0, 180)));
    c.set("phi", euFmt(euWrap(euRound(phi, 1))));
  }

  // 11 · The Spread Budget.
  function euBudget(c) {
    const vx = c.num("vx"), vy = c.num("vy"), vz = 2 - vx - vy;
    const valid = vz >= -1e-9 && vz <= 1 + 1e-9;
    const m = valid ? { x: Math.sqrt(Math.max(0, 1 - vx)), y: Math.sqrt(Math.max(0, 1 - vy)), z: Math.sqrt(Math.max(0, 1 - vz)) } : null;
    return { vx, vy, vz, valid, m };
  }
  // The ket with these three means: θ from ⟨Z⟩ and φ from ⟨X⟩, ⟨Y⟩.
  function euKetFromMeans(m) {
    const theta = Math.acos(euClamp(m.z, -1, 1)) * 180 / Math.PI, phi = Math.atan2(m.y, m.x) * 180 / Math.PI;
    return { theta, phi: euWrap(phi), ket: euBloch(theta, phi) };
  }

  const euStations2 = {
    // 6 · Shift and Stretch Statistics -------------------------------------------------------------------
    shift: {
      start(c) { c.s.card = "a"; c.s.applied = false; },
      load(c, check) { c.s.card = check; c.s.applied = false; },
      edit(c, name) { if (name === "a" || name === "b") c.s.applied = false; },
      actions: { apply(c) { c.s.applied = true; return "New distribution shown for a = " + euFmt(c.num("a")) + ", b = " + euFmt(c.num("b")) + "."; } },
      show(c) {
        const card = EU_SHIFT[c.s.card], base = euShiftBase(card), a = c.num("a"), b = c.num("b");
        const name = (a === 1 ? "" : a === -1 ? "−" : euFmt(a)) + (a === 0 ? "0" : card.obs) + (b > 0 ? " + " + euFmt(b) + "I" : b < 0 ? " − " + euFmt(-b) + "I" : "");
        const nm = a * base.mean + b, ns = Math.abs(a) * base.spread;
        c.put("state", "Base " + card.obs + ": readings +1 and −1 with P = " + euFmt(card.p) + " and " + euFmt(1 - card.p) + ", ⟨" + card.obs + "⟩ = " + euFmt(base.mean) +
          ", Δ" + card.obs + " = " + euFmt(base.spread) + " · new observable " + name + (c.s.applied ? ": mean " + euFmt(nm) + ", spread " + euFmt(ns) + "." : ". Predict, then show the new distribution."));
        const hi = a + b, lo = -a + b, all = [-1, 1, hi, lo, 0];
        const x0 = Math.floor(Math.min(...all) - 1), x1 = Math.ceil(Math.max(...all) + 1);
        const rows = [{ label: card.obs, tone: "alpha", points: [{ x: 1, tone: "plus", label: "P " + euFmt(card.p) }, { x: -1, tone: "minus", label: "P " + euFmt(1 - card.p) },
          { x: base.mean, tone: "angle", r: 4, label: "mean", raise: 18 }] }];
        if (c.s.applied) rows.push({ label: "new", tone: "beta", points: [{ x: hi, tone: "plus", label: euFmt(hi) }, { x: lo, tone: "minus", label: euFmt(lo), raise: Math.abs(hi - lo) < 0.6 ? 16 : 0 },
          { x: nm, tone: "angle", r: 4, label: "mean", raise: 18 }] });
        return {
          panels: [euLine(c.s.applied ? "each reading a moves to a·a + b" : "base distribution (press the button to see " + name + ")", { x: [x0, x1], every: x1 - x0 > 12 ? 2 : 1, rows,
            links: c.s.applied ? [{ from: 1, to: hi, rows: [0, 1], tone: "plus" }, { from: -1, to: lo, rows: [0, 1], tone: "minus" }] : [] })],
          caption: name,
          desc: "Readings +1 and −1 of " + card.obs + " on a number line" + (c.s.applied ? ", and below them the new readings " + euFmt(hi) + " and " + euFmt(lo) + " of " + name + ", joined by lines." : ".")
        };
      },
      checks: {
        a: ["⟨3Z + I⟩ = 3⟨Z⟩ + 1.", "Δ(3Z + I) = |3|·ΔZ.", euShiftGrader("a", ["mean"], "⟨3Z + I⟩ = 3(0.6) + 1 = 2.8 and Δ(3Z + I) = 3(0.8) = 2.4. The readings move to 4 and −2, with the same probabilities 0.8 and 0.2.")],
        b: ["⟨−2X + 5I⟩ = −2⟨X⟩ + 5.", "ΔX = √(1 − 1/4) = √3/2, and the spread scales by |−2| = 2.", euShiftGrader("b", ["mean"], "⟨−2X + 5I⟩ = −2(−1/2) + 5 = 6 and Δ = 2(√3/2) = √3 ≈ 1.732. The negative scale swaps which reading is larger: +1 → 3, −1 → 7.")],
        c: ["The new mean is ⟨Z⟩ + b.", "The shift leaves the spread alone.", euShiftGrader("c", [], "b = −0.6 moves the mean to 0, and the spread stays ΔZ = 0.8. Subtracting the mean, A − ⟨A⟩I, is exactly the deviation operator used in the variance.")],
        d: ["a + b = 1 and −a + b = 0.", "ΔQ = (1/2)ΔZ, and ΔZ = 2√(0.9 × 0.1).", euShiftGrader("d", ["mean"], "a = b = 1/2 gives Q = (I + Z)/2 with readings 1 and 0. ⟨Q⟩ = (1 + 0.8)/2 = 0.9 = P(+1), and ΔQ = (1/2)(0.6) = 0.3 = √(0.9 × 0.1). A yes-or-no meter averages to its probability.")]
      }
    },

    // 7 · Zero Spread Detector ------------------------------------------------------------------------------
    zero: {
      show(c) {
        const card = EU_DECK[c.val("card")], Apsi = euApply(card.A, card.psi), mean = euInner(card.psi, Apsi)[0];
        const scaled = card.psi.map(z => euScale(z, mean)), match = euNorm2(Apsi.map((z, k) => euSub(z, scaled[k]))) < 1e-12;
        c.put("state", card.an + " = " + euMatText(card.A) + " · |ψ⟩ = " + euKetText(card.psi) + " · " + card.an + "|ψ⟩ = " + euKetText(Apsi) + " · ⟨" + card.an + "⟩|ψ⟩ = " + euKetText(scaled) + ".");
        return {
          panels: [euMatrixPanel("|ψ⟩", card.psi.map(z => [z]), { tone: "plus" }), euMatrixPanel(card.an + "|ψ⟩", Apsi.map(z => [z]), { tone: "alpha" }),
            euMatrixPanel("⟨" + card.an + "⟩|ψ⟩", scaled.map(z => [z]), { tone: "angle", note: "⟨" + card.an + "⟩ = " + euFmt(mean) })],
          caption: match ? "the two columns match" : "the two columns differ",
          desc: "Three columns: |ψ⟩ = " + euKetText(card.psi) + ", " + card.an + "|ψ⟩ = " + euKetText(Apsi) + ", and ⟨" + card.an + "⟩|ψ⟩ = " + euKetText(scaled) + ". They " + (match ? "match." : "differ.")
        };
      },
      checks: {
        pauli: ["|−x⟩ is an X eigenket and |−y⟩ is a Y eigenket.", "A global phase such as i doesn’t change which eigenket a state is.", euDeckGrader("pauli", ["p1", "p2", "p3", "p4", "p5"],
          "Zero: |−x⟩ with X, |−y⟩ with Y and i|1⟩ with Z, all eigenkets. Positive: |−x⟩ with Z (ΔZ = 1) and (3|0⟩ + 4|1⟩)/5 with X (⟨X⟩ = 24/25, so ΔX = 7/25).")],
        general: ["G(1, 1)ᵀ = 3(1, 1)ᵀ.", "Multiply B by (1, −i)ᵀ and compare.", euDeckGrader("general", ["g1", "g2", "g3", "g4"],
          "G = 2I + X has eigenkets |±x⟩, readings 3 and 1, so both are zero. |0⟩ is not an eigenket of G: ⟨G⟩ = 2 and (ΔG)² = ⟨G²⟩ − 4 = 5 − 4 = 1. B = I − Y, and (1, −i)/√2 = |−y⟩ is an eigenket with reading 2.")],
        pin: ["ΔZ = 0 means |0⟩ or |1⟩.", "Both X readings are equally likely for |0⟩ and |1⟩.", c => {
          if (!euFits(c.ans("pin-mean"), 0)) return euGrade(false, "Compute ⟨X⟩ for |0⟩.");
          return euGrade(euFits(c.ans("pin-spread"), 1), "(ΔX)² = 1 − ⟨X⟩².", "ΔZ = 0 forces |0⟩ or |1⟩ up to a phase. Each has ⟨X⟩ = 0 and ΔX = 1, the largest spread X can have.");
        }],
        floor: ["(ΔX)² = 1 − ⟨X⟩², and ⟨X⟩² ≤ 1 − ⟨Z⟩².", "(ΔZ)² = 0.04 means ⟨Z⟩² = 0.96.", c => {
          if (!euFits(c.ans("floor-dx"), Math.sqrt(0.96))) return euGrade(false, "Find ⟨Z⟩² from ΔZ, then make ⟨X⟩² as large as it can be.");
          return euGrade(c.choice("floor-pick") === "eigen", "Which states have ΔX = 0, and which have ΔZ = 0?",
            "(ΔX)² = 1 − ⟨X⟩² ≥ ⟨Z⟩² = 1 − (ΔZ)² = 0.96, so ΔX ≥ √0.96 ≈ 0.98, with equality when ⟨Y⟩ = 0. ΔX = 0 needs |±x⟩ and ΔZ = 0 needs |0⟩ or |1⟩. No state is both.");
        }],
        ident: ["What does 3I do to any ket?", "Every trial reads 3.", c => euGrade(c.choice("ident-pick") === "all", "Apply 3I to a state and compare with the state.",
          "3I|ψ⟩ = 3|ψ⟩ for every |ψ⟩, so every state is an eigenket and every trial reads 3. ΔA = 0 always. 3I commutes with everything, and Lesson 14 called it the do-nothing observable.")]
      }
    },

    // 8 · How Many Trials? -----------------------------------------------------------------------------------
    trials: {
      start(c) { euSeed(c); euTrialsClear(c); },
      edit(c, name) { if (name === "setup" || name === "n") c.s.runs = []; },
      actions: {
        one(c) {
          const n = euTrialN(c), setup = c.val("setup"), abar = euExperiment(c, setup, n);
          c.s.used += n;
          c.s.last = { setup, n, abar };
          return "Seed " + c.s.seed + " · one experiment of " + n + " trials: ā = " + euFmt(abar) + ". Budget used: " + c.s.used + " of " + EU_BUDGET + "." + (c.s.used > EU_BUDGET ? " Over budget." : "");
        },
        repeat(c) {
          const n = euTrialN(c), setup = c.val("setup");
          for (let k = 0; k < 100; k++) c.s.runs.push(euExperiment(c, setup, n));
          return "Seed " + c.s.seed + " · " + c.s.runs.length + " simulated experiments of " + n + " trials. Their ā values spread by " + euFmt(euSD(c.s.runs)) + ".";
        },
        clear(c) { euTrialsClear(c); return "Experiments cleared and budget restored."; },
        reseed(c) { return euReseed(c); }
      },
      show(c) {
        const model = euTrialModel(c.val("setup")), n = Number(c.val("n")), okN = Number.isInteger(n) && n >= 1 && n <= 5000;
        const sigma = okN ? model.spread / Math.sqrt(n) : NaN, runs = c.s.runs;
        c.put("state", "Seed " + c.s.seed + " · " + model.name + ": ⟨" + model.sym + "⟩ = " + euFmt(model.mean) + ", Δ" + model.sym + " = " + euFmt(model.spread) +
          " · N = " + (okN ? n : "?") + " · " + runs.length + " repeated experiments" + (runs.length > 1 ? ", ā spread " + euFmt(euSD(runs)) : "") +
          " · budget used " + c.s.used + " of " + EU_BUDGET + (c.s.last ? " · your last experiment: N = " + c.s.last.n + ", ā = " + euFmt(c.s.last.abar) : "") + ".");
        const half = Math.max(okN ? 4 * sigma : 0.2, 0.05), lo = model.mean - half, hi = model.mean + half, bins = 24, w = (hi - lo) / bins;
        const counts = new Array(bins).fill(0);
        for (const v of runs) counts[euClamp(Math.floor((v - lo) / w), 0, bins - 1)]++;
        const top = Math.max(0.1, ...counts.map(k => k / Math.max(1, runs.length)));
        const yMax = Math.ceil(top * 10) / 10;
        const rects = counts.map((k, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, y0: 0, y1: k / Math.max(1, runs.length), tone: "angle", opacity: 0.8 }));
        const vlines = [{ x: model.mean, tone: "alpha" }];
        if (okN && sigma > 0) vlines.push({ x: model.mean - sigma, tone: "plus" }, { x: model.mean + sigma, tone: "plus" });
        const dots = c.s.last && c.s.last.setup === c.val("setup") && c.s.last.abar >= lo && c.s.last.abar <= hi ? [{ x: c.s.last.abar, y: yMax * 0.9, tone: "beta", label: "your ā" }] : [];
        return {
          panels: [euChart("ā across repeated experiments (green: ⟨A⟩ ± ΔA/√N)", { x: [lo, hi], y: [0, yMax], xTicks: [lo, model.mean, hi], yTicks: [0, yMax / 2, yMax], xLabel: "sample mean ā", rects, vlines, dots })],
          caption: okN ? "ΔA/√N = " + euFmt(sigma) : "enter N",
          desc: "A histogram of " + runs.length + " sample means ā, centred on ⟨A⟩ = " + euFmt(model.mean) + (okN ? ", with green lines one spread ΔA/√N = " + euFmt(sigma) + " either side." : ".") +
            (dots.length ? " An orange dot marks your own experiment at " + euFmt(c.s.last.abar) + "." : "")
        };
      },
      checks: {
        wobble: ["The wobble of ā is ΔA/√N.", "0.8/√100.", c => {
          const n = Number(c.val("n"));
          if (c.val("setup") !== "zx" || n !== 100 || c.s.runs.length < 20) return euSetup("Choose Z on (2|0⟩ + |1⟩)/√5, set N = 100 and repeat at least 20 experiments.");
          return euGrade(euFits(c.ans("wobble-pred"), 0.08), "Divide ΔZ by √N.",
            "ΔZ/√N = 0.8/10 = 0.08. Your " + c.s.runs.length + " experiments spread by " + euFmt(euSD(c.s.runs)) + ", close to 0.08 but not exactly, because that spread is itself estimated from a sample.");
        }],
        plan: ["Need 0.8/√N ≤ 0.02, so √N ≥ 40.", "Smallest N = 1600. Then run one experiment and read your ā.", c => {
          const n = Number(c.val("n"));
          if (c.val("setup") !== "zx") return euSetup("Choose Z on (2|0⟩ + |1⟩)/√5.");
          if (!(n >= 1600 && n <= 1760)) return euGrade(false, n < 1600 ? "With N = " + n + ", ΔZ/√N = " + euFmt(0.8 / Math.sqrt(n)) + ", above 0.02." : "N = " + n + " works but wastes trials. Stay within 10% of the smallest N.");
          if (!c.s.last || c.s.last.n !== n || c.s.last.setup !== "zx") return euSetup("Run one experiment with this N first.");
          if (c.s.used > EU_BUDGET) return euGrade(false, "You used " + c.s.used + " trials, over the 2000 budget. Clear experiments and run once.");
          const inside = Math.abs(c.s.last.abar - 0.6) <= 0.02 + 1e-12;
          if (c.choice("plan-in") !== (inside ? "yes" : "no")) return euGrade(false, "Compare your ā = " + euFmt(c.s.last.abar) + " with 0.6 ± 0.02.");
          return euGrade(c.choice("plan-share") === "68", "How much of a bell-shaped spread lies within one standard deviation of the centre?",
            "N ≥ (0.8/0.02)² = 1600. Your run gave ā = " + euFmt(c.s.last.abar) + ", " + (inside ? "inside" : "outside") + " the ±0.02 window. About 68% of runs land inside it, so a run outside is unlucky but not wrong. Doubling the window to ±0.04 would catch about 95%.");
        }],
        four: ["Wobble = ΔA/√N.", "Halving 1/√N means doubling √N.", c => euGrade(euFits(c.ans("four-factor"), 4), "Solve ΔA/√N′ = (1/2)ΔA/√N for N′.",
          "ΔA/√(4N) = (1/2)ΔA/√N. Each extra digit of precision costs 100 times more trials.")],
        compare: ["ΔZ = 0.8 and ΔX = 0.6 for this state.", "N scales as (ΔA)².", c => {
          if (c.choice("compare-pick") !== "z") return euGrade(false, "The observable with the larger spread needs more trials.");
          return euGrade(euFits(c.ans("compare-ratio"), 16 / 9), "Take the ratio of the variances.", "N ∝ (ΔA/ε)², so N_Z/N_X = (0.8/0.6)² = 16/9 ≈ 1.78. The same state is easier to pin down in X than in Z.");
        }],
        eigen: ["What is ΔX for |−x⟩?", "Every trial reads −1.", c => euGrade(euFits(c.ans("eigen-n"), 1), "With ΔX = 0, how much can ā vary?",
          "|−x⟩ is an X eigenket, so every trial reads −1 and ΔX/√N = 0. One trial gives ⟨X⟩ = −1 exactly.")]
      }
    },

    // 9 · Robertson Bound Explorer ---------------------------------------------------------------------------
    robertson: {
      load(c, check) { c.set("pair", EU_RCARDS[check][0]); c.set("psi", EU_RCARDS[check][1]); },
      show(c) {
        const pair = c.val("pair"), state = c.val("psi"), r = euRobertson(pair, state);
        const shown = Object.entries(EU_RCARDS).some(([key, [p, s]]) => p === pair && s === state && c.revealed(key));
        c.put("state", "A = " + r.an + ", B = " + r.bn + " · [A, B] = " + euMatText(r.C) + " · |ψ⟩ = " + euKetText(EU_RSTATES[state]) +
          (shown ? " · ΔA = " + euFmt(r.sa.spread) + ", ΔB = " + euFmt(r.sb.spread) + ", product " + euFmt(r.product) + ", bound " + euFmt(r.bound) : "") + ".");
        const bar = (label, value, tone) => ({ label, value: shown ? value : 0, text: shown ? euFmt(value) : "?", tone });
        return {
          panels: [euMatrixPanel("[" + r.an + ", " + r.bn + "]", r.C, { tone: "alpha", weight: 0.9 }),
            euBars("spreads, product and bound", [bar("Δ" + r.an, r.sa.spread, "plus"), bar("Δ" + r.bn, r.sb.spread, "minus"), bar("product", r.product, "beta"), bar("bound", r.bound, "angle")],
              { max: shown ? Math.max(1, Math.ceil(Math.max(r.sa.spread, r.sb.spread, r.product) * 2) / 2) : 1, weight: 1.3 })],
          caption: r.an + " and " + r.bn,
          desc: "The commutator [" + r.an + ", " + r.bn + "] with " + euMatText(r.C) + ". Bars for the two spreads, their product and the bound" + (shown ? ": " + [r.sa.spread, r.sb.spread, r.product, r.bound].map(euFmt).join(", ") + "." : " fill in after the matching mission.")
        };
      },
      checks: {
        yz: ["⟨Y⟩ = 0 for a real ket, and ⟨Z⟩ = (4 − 1)/5.", "The bound is |⟨X⟩| with ⟨X⟩ = 2·2·1/5.", euRobertsonGrader("yz")],
        zx: ["For (1, 1 + i)/√3: ⟨X⟩ = 2 Re(1 + i)/3, ⟨Y⟩ = 2 Im(1 + i)/3.", "The bound is |⟨Y⟩| = 2/3.", euRobertsonGrader("zx")],
        xy: ["On the equator ⟨X⟩ = cos φ and ⟨Y⟩ = sin φ.", "⟨Z⟩ = 0 here.", euRobertsonGrader("xy")],
        zd: ["D = (1/2)I + (3/2)Z.", "Two diagonal matrices always commute.", euRobertsonGrader("zd")],
        xh: ["[X, Z] = XZ − ZX = −2iY.", "H² = (X² + XZ + ZX + Z²)/2 = I.", euRobertsonGrader("xh")]
      }
    },

    // 10 · Minimum Uncertainty Hunt --------------------------------------------------------------------------
    minimum: {
      start(c) { c.s.marks = []; },
      keyLabel: "Map of all states, θ across and φ up. Arrow keys move the crosshair; Shift moves 10°.",
      key(c, key, shift) {
        const { theta, phi } = euAngles(c), step = shift ? 10 : 1;
        const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (!moves[key]) return false;
        euSetAngles(c, theta + moves[key][0], phi + moves[key][1]);
        return true;
      },
      pointer(c, pt, phase) {
        if (phase === "up") return true;
        if (pt.x < EU_MAP.left - 4 || pt.x > EU_MAP.right + 4 || pt.y < EU_MAP.top - 4 || pt.y > EU_MAP.bottom + 4) return phase === "move";
        const theta = (pt.x - EU_MAP.left) / (EU_MAP.right - EU_MAP.left) * 180, phi = (EU_MAP.bottom - pt.y) / (EU_MAP.bottom - EU_MAP.top) * 360;
        euSetAngles(c, euClamp(theta, 0, 180), euClamp(phi, 0, 359));
        return true;
      },
      actions: {
        mark(c) {
          const { theta, phi } = euAngles(c);
          c.s.marks.push({ theta, phi, ...euGapAt(theta, phi) });
          if (c.s.marks.length > 6) c.s.marks.shift();
          return "Marked θ = " + euFmt(theta) + "°, φ = " + euFmt(phi) + "°.";
        },
        unmark(c) { c.s.marks = []; return "Marks cleared."; }
      },
      show(c) {
        const { theta, phi } = euAngles(c), g = euGapAt(theta, phi);
        c.list("marks", c.s.marks.map((s, k) => "Mark " + (k + 1) + ": θ = " + euFmt(s.theta) + "°, φ = " + euFmt(s.phi) + "° · gap " + euFmt(s.gap)));
        c.put("state", "θ = " + euFmt(theta) + "°, φ = " + euFmt(phi) + "° · " + euMeansText(g.m) + " · ΔX = " + euFmt(g.dx) + ", ΔY = " + euFmt(g.dy) +
          " · ΔX·ΔY = " + euFmt(g.product) + " ≥ |⟨Z⟩| = " + euFmt(g.bound) + " · gap " + euFmt(g.gap) + (Math.abs(g.gap) <= EU_DERIVED ? ": equality" : "") + ".");
        const wrapPhi = euWrap(phi);
        return {
          panels: [euChart("gap ΔX·ΔY − |⟨Z⟩| over all states (darker = closer to equality)", { x: [0, 180], y: [0, 360], xTicks: [0, 45, 90, 135, 180], yTicks: [0, 90, 180, 270, 360],
            xLabel: "θ (degrees) · φ up the side", rects: euHeat(),
            dots: [...c.s.marks.map(s => ({ x: s.theta, y: euWrap(s.phi), tone: "alpha", r: 4, hollow: true })), { x: theta, y: wrapPhi, tone: "plus", r: 6, label: "gap " + euFmt(g.gap) }] })],
          caption: "gap " + euFmt(g.gap),
          desc: "A heat map of the gap ΔX·ΔY − |⟨Z⟩| for θ from 0° to 180° and φ from 0° to 360°. The crosshair is at θ = " + euFmt(theta) + "°, φ = " + euFmt(phi) + "°, where the gap is " + euFmt(g.gap) + "."
        };
      },
      checks: {
        a: ["Try the X–Z great circle, φ = 0°.", "cos θ = 0.6 gives θ ≈ 53.1°.", c => {
          const { theta, phi } = euAngles(c), g = euGapAt(theta, phi);
          if (!euNear(g.bound, 0.6)) return euGrade(false, "|⟨Z⟩| = " + euFmt(g.bound) + ". Adjust θ.");
          return euGrade(g.gap <= EU_DERIVED, "|⟨Z⟩| is right, but the gap is " + euFmt(g.gap) + ". Follow the dark bands in φ.",
            "At θ = " + euFmt(theta) + "°, φ = " + euFmt(phi) + "°: ΔX·ΔY = " + euFmt(g.product) + " = |⟨Z⟩|. On the X–Z circle ⟨Y⟩ = 0, so ΔY = 1 and ΔX = |⟨Z⟩|.");
        }],
        b: ["Below the equator means θ > 90°.", "Keep ⟨X⟩ = 0 with φ = 90° or 270°.", c => {
          const { theta, phi } = euAngles(c), g = euGapAt(theta, phi);
          if (g.gap > EU_DERIVED) return euGrade(false, "The gap is " + euFmt(g.gap) + ". Find a dark band first.");
          if (!(g.m.z < -0.1)) return euGrade(false, "This is equality, but ⟨Z⟩ = " + euFmt(g.m.z) + ". Go below the equator.");
          return euGrade(Math.abs(g.m.y) > 0.1, "Equality with ⟨Y⟩ ≈ 0. Use the other dark band, where ⟨X⟩ = 0.",
            "⟨X⟩ = " + euFmt(g.m.x) + " and ⟨Y⟩ = " + euFmt(g.m.y) + ": with ⟨X⟩ = 0, ΔX = 1 and ΔY = |⟨Z⟩|. Equality happens on both great circles through the poles.");
        }],
        c: ["Read ΔX, ΔY and ⟨Z⟩ from the readout.", "Compare your answer with ⟨X⟩²⟨Y⟩².", c => {
          const { theta, phi } = euAngles(c), g = euGapAt(theta, phi);
          if (!euAngleFits(phi, 45) || Math.abs(theta - 90) <= 1 || theta < 1 || theta > 179) return euSetup("Set φ = 45° and a θ away from 90° and the poles.");
          const want = g.m.x ** 2 * g.m.y ** 2;
          if (!euNear(c.ans("c-gap2"), want)) return euGrade(false, "For this state (ΔX·ΔY)² − ⟨Z⟩² = " + euFmt(want) + " within rounding. Square the product, then subtract ⟨Z⟩².");
          return euGrade(c.choice("c-pick") === "axis", "Your number equals ⟨X⟩²⟨Y⟩². When is that zero?",
            "(1 − ⟨X⟩²)(1 − ⟨Y⟩²) − (1 − ⟨X⟩² − ⟨Y⟩²) = ⟨X⟩²⟨Y⟩². Here it is " + euFmt(want) + ". It vanishes only when ⟨X⟩ = 0 or ⟨Y⟩ = 0.");
        }],
        d: ["(ΔX·ΔY)² − ⟨Z⟩² = ⟨X⟩²⟨Y⟩², so make ⟨X⟩ and ⟨Y⟩ both large.", "Try the equator at φ = 45°.", c => {
          const { theta, phi } = euAngles(c), g = euGapAt(theta, phi);
          return euGrade(g.gap >= 0.495, "The gap here is " + euFmt(g.gap) + ". Look for the brightest cells.",
            "On the equator at φ = 45°, ΔX = ΔY = 1/√2, so the product is 1/2 while ⟨Z⟩ = 0. That is the lab’s π/4 preset, the state farthest from equality. φ = 135°, 225° and 315° tie with it.");
        }]
      }
    },

    // 11 · The Spread Budget -----------------------------------------------------------------------------------
    budget: {
      show(c) {
        const b = euBudget(c);
        let state = "";
        if (b.valid) {
          const k = euKetFromMeans(b.m);
          state = " · one such state: θ = " + euFmt(k.theta) + "°, φ = " + euFmt(k.phi) + "°, |ψ⟩ = " + euKetText(k.ket) + ", " + euMeansText(b.m);
        }
        c.put("state", "(ΔX)² = " + euFmt(b.vx) + " + (ΔY)² = " + euFmt(b.vy) + " + (ΔZ)² = " + euFmt(b.vz) + " = 2" + (b.valid ? state : " · no state: (ΔZ)² must lie between 0 and 1") + ".");
        return {
          panels: [euBars("three variances that must add to 2", [
            { label: "(ΔX)²", value: b.vx, tone: "alpha" }, { label: "(ΔY)²", value: b.vy, tone: "beta" },
            { label: "(ΔZ)²", value: euClamp(b.vz, 0, 1), text: euFmt(b.vz), tone: b.valid ? "plus" : "warn", outline: !b.valid }])],
          caption: b.valid ? "a state can pay for this" : "no state can pay for this",
          desc: "Three bars: (ΔX)² = " + euFmt(b.vx) + ", (ΔY)² = " + euFmt(b.vy) + ", and the forced (ΔZ)² = " + euFmt(b.vz) + (b.valid ? "." : ", which is impossible.")
        };
      },
      checks: {
        zero: ["(ΔZ)² = 2 − (ΔX)² − (ΔY)².", "Both sliders at their maximum.", c => {
          const b = euBudget(c);
          if (!euNear(b.vz, 0)) return euGrade(false, "(ΔZ)² is " + euFmt(b.vz) + ". Push the other two variances up.");
          return euGrade(c.choice("zero-pick") === "poles", "Which states give a certain Z reading?",
            "(ΔZ)² = 0 forces (ΔX)² = (ΔY)² = 1, the most any Pauli variance can be. Those states are |0⟩ and |1⟩, where X and Y are fair coins.");
        }],
        given: ["Set the two sliders first.", "(ΔZ)² = 2 − 0.36 − 0.64.", c => {
          const b = euBudget(c);
          if (!euNear(b.vx, 0.36) || !euNear(b.vy, 0.64)) return euSetup("Set (ΔX)² = 0.36 and (ΔY)² = 0.64.");
          return euGrade(euFits(c.ans("given-dz"), 1), "Take the square root of the forced (ΔZ)².",
            "(ΔZ)² = 2 − 1 = 1, so ΔZ = 1 and ⟨Z⟩ = 0. ⟨X⟩ = ±0.8 and ⟨Y⟩ = ±0.6: an equatorial state, with no Z information at all.");
        }],
        even: ["Three equal variances adding to 2.", "Each is 2/3.", c => {
          const b = euBudget(c);
          if (!euNear(b.vx, 2 / 3) || !euNear(b.vy, 2 / 3)) return euGrade(false, "Set both sliders to 2/3 ≈ 0.67, so the third is 2/3 too.");
          return euGrade(euFits(c.ans("even-d"), Math.sqrt(2 / 3)), "Take the square root of 2/3.",
            "Each variance is 2/3, so each spread is √(2/3) ≈ 0.8165. Then ⟨X⟩² = ⟨Y⟩² = ⟨Z⟩² = 1/3: the state points along a diagonal like (1, 1, 1)/√3.");
        }],
        cap: ["If each spread is at most 0.75, each variance is at most 0.5625.", "Three of those add to at most 1.6875.", c => euGrade(c.choice("cap-pick") === "no", "Add up the largest variances the cap allows.",
          "The budget is always exactly 2. A cap of 0.75 allows at most 3 × 0.5625 = 1.6875, so it can’t be met. All three spreads can’t be small at once.")]
      }
    }
  };


  // ---------------------------------------------------------------------------
  // Stations 12–16 · Recurring formats and extras.
  // ---------------------------------------------------------------------------

  // 12 · Statistics Designer. √p|0⟩ + e^(iφ)√(1 − p)|1⟩ from typed p and φ.
  function euDesignState(c, strict) {
    const p = strict ? c.ans("p0") : c.quiet("p0");
    const phiText = c.val("phi"), phi = Number(phiText);
    if (p === null || phiText === "" || !Number.isFinite(phi)) {
      if (strict) throw new EuFieldError(c.field("phi"), "Enter the phase in degrees.", true);
      return null;
    }
    if (p < 0 || p > 1) {
      if (strict) throw new EuFieldError(c.field("p0"), "P(0) must lie between 0 and 1.", true);
      return null;
    }
    const ket = [[Math.sqrt(p), 0], euPolar(Math.sqrt(1 - p), phi)], m = euMeans(ket);
    return { p, phi, ket, m, dx: euSpread(m.x), dy: euSpread(m.y), dz: euSpread(m.z) };
  }
  function euDesignGrader(test, fail, work) {
    return c => {
      const s = euDesignState(c, true);
      return euGrade(test(s), fail(s), "Your state has " + euMeansText(s.m) + " and " + euSpreadsText(s.m) + ". " + work);
    };
  }

  // 13 · Error Detective.
  const EU_ERRORS = {
    mean: { line: 3, text: "Case 1 · the likeliest reading", claim: "next reading 0.6", truth: "+1 (P = 4/5)",
      work: "Line 3 treats the mean as a reading. Z only ever shows +1 or −1. The likeliest next reading is +1, with probability 4/5. Over 100 trials about 80 show +1 and 20 show −1, and their average is near 0.6." },
    square: { line: 2, text: "Case 2 · no spread at all", claim: "⟨A²⟩ = 1, ΔA = 0", truth: "⟨A²⟩ = 2, ΔA = 1",
      work: "Line 2 squares the mean instead of averaging the squares: ⟨A²⟩ = 0²·(1/2) + 2²·(1/2) = 2. Then (ΔA)² = 2 − 1 = 1 and ΔA = 1. No trial reads 1: half read 0 and half read 2." },
    instrument: { line: 3, text: "Case 3 · a better meter", claim: "ΔX is meter error", truth: "ΔX = 3/5 with any meter",
      work: "Lines 1 and 2 are right. Line 3 treats ΔX as instrument error. The instrument is already ideal. ΔX = 3/5 is the spread of X readings in this state, and a perfect meter still shows +1 on 9/10 of the trials and −1 on 1/10." },
    equality: { line: 3, text: "Case 4 · exactly the bound", claim: "ΔY = 1/√3", truth: "ΔY ≥ 1/√3",
      work: "Line 3 reads ≥ as =. The relation only gives ΔY ≥ (1/2)/(√3/2) = 1/√3 ≈ 0.577. For a pure state with ⟨Z⟩ = 1/2 and ⟨X⟩ = ±1/2, ⟨Y⟩² = 1/2, so ΔY = 1/√2 ≈ 0.707: strictly above the bound." },
    same: { line: 3, text: "Case 5 · one batch for both", claim: "Y on measured systems", truth: "Y on fresh systems",
      work: "Line 3 reuses systems that were already measured in X. After an X reading each system is in |+x⟩ or |−x⟩, no longer the prepared state. Split the 2000 fresh systems into two groups of 1000, and measure X on one and Y on the other." },
    half: { line: 3, text: "Case 6 · twice the bound", claim: "bound 0.8", truth: "bound 0.4",
      work: "Line 3 drops the ½: ΔX·ΔY ≥ ½|⟨[X, Y]⟩| = ½|−0.8i| = 0.4 = |⟨Z⟩|. A product of 0.6 is allowed. Keeping the magnitude matters too: the bound is never negative, even though ⟨Z⟩ = −0.4." }
  };
  function euErrorGrader(key) {
    return c => {
      const card = EU_ERRORS[key], line = Number(c.choice(key + "-line")), kind = c.choice(key + "-kind");
      if (line !== card.line && kind === key) return euGrade(false, "That names the mistake, but it first appears on a different line.");
      if (line === card.line && kind !== key) return euGrade(false, "That is the first wrong line. Name what goes wrong there more precisely.");
      return euGrade(line === card.line && kind === key, "Check each line in order, and stop at the first one that is false.", card.work);
    };
  }

  // 15 · Means on the Bloch Sphere.
  function euSphereState(c) {
    const { theta, phi } = euAngles(c), ket = euBloch(theta, phi), m = euMeans(ket);
    return { theta, phi, ket, m, point: [m.x, m.y, m.z] };
  }
  const euAt = (m, target) => euNear(m.x, target[0]) && euNear(m.y, target[1]) && euNear(m.z, target[2]);

  // 16 · Instrument Noise vs Quantum Spread. Seeded readings plus Gaussian noise.
  const EU_NOISE = {
    zs: { name: "Z on (2|0⟩ + |1⟩)/√5", sym: "Z", p: 0.8 },
    xs: { name: "X on (2|0⟩ + |1⟩)/√5", sym: "X", p: 0.9 },
    mx: { name: "X on |−x⟩", sym: "X", p: 0 }
  };
  const EU_NOISE_BINS = 30;
  function euNoiseClear(c) { c.s.n = 0; c.s.sum = 0; c.s.sumsq = 0; c.s.hist = new Array(EU_NOISE_BINS).fill(0); }
  function euGauss(rng) {
    const u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function euNoiseRun(c, n) {
    const card = EU_NOISE[c.val("setup")], sigma = c.num("sigma");
    for (let k = 0; k < n; k++) {
      const value = (c.s.rng() < card.p ? 1 : -1) + sigma * euGauss(c.s.rng);
      c.s.n += 1;
      c.s.sum += value;
      c.s.sumsq += value * value;
      c.s.hist[euClamp(Math.floor((value + 3) / 6 * EU_NOISE_BINS), 0, EU_NOISE_BINS - 1)]++;
    }
  }
  const euNoiseStats = c => {
    const mean = c.s.n ? c.s.sum / c.s.n : NaN;
    return { mean, variance: c.s.n ? Math.max(0, c.s.sumsq / c.s.n - mean * mean) : NaN };
  };

  const euStations3 = {
    // 12 · Statistics Designer ----------------------------------------------------------------------------
    designer: {
      show(c) {
        const s = euDesignState(c, false);
        if (!s) {
          c.put("state", "Enter P(0) between 0 and 1 and a phase in degrees.");
          return { panels: [euLine("your three means", { x: [-1, 1], rows: [] })], caption: "no state yet", desc: "Your state is not complete yet." };
        }
        c.put("state", "|ψ⟩ = " + euKetText(s.ket) + " · " + euMeansText(s.m) + " · " + euSpreadsText(s.m) + ".");
        const row = (label, mean, spread, tone) => ({ label, tone, points: [
          { x: euClamp(mean - spread, -1, 1), tone: "guide", r: 3 }, { x: euClamp(mean + spread, -1, 1), tone: "guide", r: 3 },
          { x: mean, tone, label: euFmt(mean) + " ± " + euFmt(spread) }] });
        return {
          panels: [euLine("each mean with one spread either side (grey)", { x: [-2, 2], rows: [row("X", s.m.x, s.dx, "alpha"), row("Y", s.m.y, s.dy, "beta"), row("Z", s.m.z, s.dz, "plus")] })],
          caption: "P(0) = " + euFmt(s.p) + ", φ = " + euFmt(s.phi) + "°",
          desc: "Three number lines for X, Y and Z, each showing your mean and a grey dot one spread to either side. " + euMeansText(s.m) + ". " + euSpreadsText(s.m) + "."
        };
      },
      checks: {
        a: ["⟨Z⟩ = 0.6 gives P(0) = 0.8. ΔX = 0.8 needs ⟨X⟩ = ±0.6.", "⟨X⟩ = 2√(0.8 × 0.2) cos φ = 0.8 cos φ, so cos φ = ±3/4.", euDesignGrader(
          s => euNear(s.m.z, 0.6) && euNear(s.dx, 0.8), s => !euNear(s.m.z, 0.6) ? "Your ⟨Z⟩ is " + euFmt(s.m.z) + ". Set P(0) from ⟨Z⟩ = 2P(0) − 1." : "⟨Z⟩ is right, but ΔX = " + euFmt(s.dx) + ". Turn φ.",
          "P(0) = 4/5 with cos φ = ±3/4 works, for example φ ≈ 41.41°. Then ⟨Y⟩ = ±√0.28, which the card doesn’t care about.")],
        b: ["ΔZ = ΔX means |⟨Z⟩| = |⟨X⟩|. With ⟨Y⟩ = 0.6, ⟨X⟩² + ⟨Z⟩² = 0.64.", "|⟨Z⟩| = |⟨X⟩| = √0.32 ≈ 0.566, so P(0) ≈ 0.783 and tan φ = 0.6/0.566.", euDesignGrader(
          s => euNear(s.m.y, 0.6) && euNear(s.dz, s.dx), s => !euNear(s.m.y, 0.6) ? "Your ⟨Y⟩ is " + euFmt(s.m.y) + "." : "⟨Y⟩ is right, but ΔZ = " + euFmt(s.dz) + " and ΔX = " + euFmt(s.dx) + ".",
          "Any signs work: ⟨X⟩ = ±√0.32 and ⟨Z⟩ = ±√0.32 with ⟨Y⟩ = 0.6. Four different states meet this card.")],
        c: ["ΔY = ΔX means |⟨Y⟩| = |⟨X⟩| = 1/2.", "Then ⟨Z⟩² = 1/2. Try φ = 45° and P(0) = (1 + 1/√2)/2.", euDesignGrader(
          s => euNear(s.m.x, 0.5) && euNear(s.dy, s.dx), s => !euNear(s.m.x, 0.5) ? "Your ⟨X⟩ is " + euFmt(s.m.x) + "." : "⟨X⟩ is right, but ΔY = " + euFmt(s.dy) + " and ΔX = " + euFmt(s.dx) + ".",
          "⟨X⟩ = 1/2 and ⟨Y⟩ = ±1/2 leave ⟨Z⟩ = ±1/√2, so P(0) = (1 ± 1/√2)/2 and φ = ±45°.")],
        d: ["What state has ΔY = 0?", "|±y⟩ sit on the equator.", c => euGrade(c.choice("d-pick") === "no", "Find ⟨Z⟩ for every state with ΔY = 0.",
          "ΔY = 0 needs ⟨Y⟩ = ±1, which uses up the whole budget ⟨X⟩² + ⟨Y⟩² + ⟨Z⟩² = 1. So ⟨Z⟩ = 0, never 0.3. Station 11 puts the same fact as (ΔX)² + (ΔY)² + (ΔZ)² = 2.")]
      }
    },

    // 13 · Error Detective -----------------------------------------------------------------------------------
    detective: {
      show(c) {
        const key = c.open() ?? "mean", card = EU_ERRORS[key];
        c.put("state", c.open() ? "Case file open: " + card.text + "." : "Open a case file. Showing case 1.");
        const done = c.revealed(key);
        return {
          panels: [euChain("claimed vs actual", [
            { title: "the solution", sub: card.claim, tone: "warn" },
            { title: "actually", sub: done ? card.truth : "?", tone: "plus" }], { note: done ? "Case solved." : "The truth fills in once you solve the case." })],
          caption: card.text,
          desc: "Two boxes. The solution claims: " + card.claim + ". " + (done ? "Actually: " + card.truth + "." : "The second box fills in once the case is solved.")
        };
      },
      checks: {
        mean: ["Lines 1 and 2 are correct.", "What values can Z display?", euErrorGrader("mean")],
        square: ["Line 1 is correct.", "Average the squared readings: 0² and 2².", euErrorGrader("square")],
        instrument: ["Lines 1 and 2 are correct.", "The case says the instrument is ideal.", euErrorGrader("instrument")],
        equality: ["Lines 1 and 2 are correct.", "Is the relation an equation or an inequality?", euErrorGrader("equality")],
        same: ["Lines 1 and 2 are correct.", "What state is a system in after its X reading?", euErrorGrader("same")],
        half: ["Lines 1 and 2 are correct.", "Write out the bound: ½|⟨[A, B]⟩|.", euErrorGrader("half")]
      }
    },

    // 14 · Quantum Preview: Position and Momentum ------------------------------------------------------------
    preview: {
      show(c) {
        const dx = c.num("dx"), dp = 1 / (2 * dx);
        c.put("state", "Δx = " + euFmt(dx) + " L · smallest Δp = ħ/(2Δx) = " + euFmt(dp) + " ħ/L · product at the bound = ħ/2.");
        const shade = Array.from({ length: 38 }, (_, k) => {
          const x0 = 0.1 + k * 0.05, x1 = x0 + 0.05;
          return { x0, x1, y0: 0, y1: Math.min(5, 1 / (2 * x1)), tone: "warn", opacity: 0.22 };
        });
        return {
          panels: [euChart("Δx·Δp ≥ ħ/2 (red: forbidden)", { x: [0, 2], y: [0, 5], xTicks: [0, 0.5, 1, 1.5, 2], yTicks: [0, 1, 2, 3, 4, 5], xLabel: "Δx in units of L · Δp up the side in units of ħ/L",
            rects: shade, series: [{ pts: euSweep(x => 1 / (2 * x), 0.1, 2), tone: "angle", label: "Δp = ħ/(2Δx)", labelAt: [1.2, 1 / 2.4] }],
            dots: [{ x: dx, y: Math.min(5, dp), tone: "plus", label: "smallest Δp " + euFmt(dp) }] })],
          caption: "Δx = " + euFmt(dx) + " L",
          desc: "The curve Δp = ħ/(2Δx), with the region below it shaded as forbidden. At Δx = " + euFmt(dx) + " L the smallest allowed Δp is " + euFmt(dp) + " ħ/L."
        };
      },
      checks: {
        map: ["The qubit commutator is [X, Y] = 2iZ.", "For x and p the commutator is a constant times I.", c => {
          const off = [["map-comm", "ihbar"], ["map-bound", "hbar2"], ["map-role", "2iz"]].filter(([n, v]) => c.choice(n) !== v).length;
          return euGrade(!off, (off === 1 ? "1 match is" : off + " matches are") + " not right yet.",
            "[X, Y] = 2iZ gives the bound ½|⟨2iZ⟩| = |⟨Z⟩|. [x, p] = iħI gives ½|⟨iħI⟩| = ħ/2. The structure is the same, ΔA·ΔB ≥ ½|⟨[A, B]⟩|. What differs is the commutator.");
        }],
        state: ["⟨iħI⟩ = iħ⟨ψ|ψ⟩.", "⟨ψ|ψ⟩ = 1 for every normalized state.", c => euGrade(c.choice("state-pick") === "always", "Compute ⟨iħI⟩ for a normalized state.",
          "The commutator iħI is a multiple of the identity, so its expectation is iħ in every state. The X·Y bound |⟨Z⟩| can be zero, and then it allows ΔX = 0. ħ/2 never allows Δx or Δp to vanish.")],
        quarter: ["Δp ≥ ħ/(2Δx).", "ħ/(2 · L/4) = 2ħ/L.", c => {
          if (!euSame(c.num("dx"), 0.25)) return euSetup("Set Δx = 0.25 L on the slider.");
          return euGrade(euFits(c.ans("quarter-dp"), 2), "Divide ħ/2 by Δx = L/4.", "Δp ≥ (ħ/2)/(L/4) = 2ħ/L. A tighter position spread forces a wider momentum spread.");
        }],
        halve: ["Δp_min = ħ/(2Δx).", "Halving the denominator doubles the fraction.", c => euGrade(euFits(c.ans("halve-f"), 2), "Compare ħ/(2Δx) with ħ/(2 · Δx/2).",
          "Δp_min ∝ 1/Δx, so halving Δx doubles the smallest Δp. The product at the bound stays ħ/2.")],
        meaning: ["Recall how Δ is defined in this lesson.", "ΔA describes repeated readings of one preparation.", c => euGrade(c.choice("meaning-pick") === "fresh", "What do ΔX and ΔY describe in the lab above?",
          "Like ΔX and ΔY, Δx and Δp are spreads of readings over fresh copies of the same state: one group measured in x, another in p. They are not instrument resolutions and not a disturbance. Lesson 21 develops this with wavefunctions.")]
      }
    },

    // 15 · Means on the Bloch Sphere (3D) ---------------------------------------------------------------------
    sphere: {
      drag(c, dx, dy) {
        c.set("yaw", euWrap(Math.round((c.num("yaw") - dx * 0.5) / 5) * 5 + 180) - 180);
        c.set("tilt", Math.max(-60, Math.min(60, Math.round((c.num("tilt") + dy * 0.3) / 5) * 5)));
      },
      // Grab the point and move it over the front of the sphere.
      pointer(c, pt, phase) {
        const frame = euFrame(c.num("yaw"), c.num("tilt"));
        if (phase === "up") { c.s.grab = false; return true; }
        if (phase === "down") {
          const q = euProject(frame, euSphereState(c).point, EU_BLOCH_R);
          if (Math.hypot(q.x - pt.x, q.y - pt.y) > 20) return false;
          c.s.grab = true;
          return true;
        }
        if (!c.s.grab) return false;
        let u = (pt.x - EU_VIEW.cx) / EU_BLOCH_R, v = (EU_VIEW.cy - pt.y) / EU_BLOCH_R;
        const r = Math.hypot(u, v);
        if (r > 1) { u /= r; v /= r; }
        const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
        const p = [0, 1, 2].map(i => u * frame.right[i] + v * frame.up[i] + w * frame.toward[i]);
        const theta = Math.acos(euClamp(p[2], -1, 1)) * 180 / Math.PI, phi = Math.atan2(p[1], p[0]) * 180 / Math.PI;
        c.set("theta", euFmt(euRound(theta, 0.5)));
        c.set("phi", euFmt(euWrap(euRound(phi, 0.5))));
        return true;
      },
      show(c) {
        const s = euSphereState(c), m = s.m;
        c.put("state", "θ = " + euFmt(s.theta) + "°, φ = " + euFmt(s.phi) + "° · |ψ⟩ = " + euKetText(s.ket) + " · point " + euMeansText(m) +
          " · distance to the X axis ΔX = " + euFmt(euSpread(m.x)) + ", to Y ΔY = " + euFmt(euSpread(m.y)) + ", to Z ΔZ = " + euFmt(euSpread(m.z)) + ".");
        return {
          sphere: { yaw: c.num("yaw"), tilt: c.num("tilt"), marker: { polar: s.theta, azimuth: s.phi }, feet: true, shownLabel: "|ψ⟩" },
          caption: "(" + [m.x, m.y, m.z].map(euFmt).join(", ") + ")",
          desc: "A Bloch sphere with |0⟩ at the top. The green point is at (⟨X⟩, ⟨Y⟩, ⟨Z⟩) = (" + [m.x, m.y, m.z].map(euFmt).join(", ") +
            "). Dashed segments run from it to each axis, with lengths ΔX = " + euFmt(euSpread(m.x)) + ", ΔY = " + euFmt(euSpread(m.y)) + " and ΔZ = " + euFmt(euSpread(m.z)) + "."
        };
      },
      checks: {
        a: ["⟨Z⟩ = cos θ = −0.8 and ⟨Y⟩ = 0 with ⟨X⟩ > 0 means φ = 0°.", "P(0) = (1 + ⟨Z⟩)/2.", c => {
          const s = euSphereState(c);
          if (!euAt(s.m, [0.6, 0, -0.8])) return euGrade(false, "The point is at (" + [s.m.x, s.m.y, s.m.z].map(euFmt).join(", ") + "). Move it to (0.6, 0, −0.8).");
          if (!euFits(c.ans("a-p0"), 0.1)) return euGrade(false, "The point is right. Use P(0) = (1 + ⟨Z⟩)/2.");
          return euGrade(euAngleFits(c.ans("a-phi"), 0), "φ is the azimuth of the point, measured from the +X axis toward +Y.",
            "P(0) = (1 − 0.8)/2 = 1/10 and φ = 0, so |ψ⟩ = (|0⟩ + 3|1⟩)/√10. Check: ⟨X⟩ = 2·1·3/10 = 0.6.");
        }],
        b: ["⟨X⟩² + ⟨Y⟩² + ⟨Z⟩² = 1.", "⟨Z⟩ = √(1 − 0.36) = 0.8, so θ ≈ 36.9° and φ = 90°.", c => {
          if (!euFits(c.ans("b-z"), 0.8)) return euGrade(false, "Use ⟨X⟩² + ⟨Y⟩² + ⟨Z⟩² = 1 with ⟨Z⟩ > 0.");
          const s = euSphereState(c);
          return euGrade(euAt(s.m, [0, 0.6, 0.8]), "⟨Z⟩ is right. Now move the point to (0, 0.6, 0.8).",
            "⟨Z⟩ = 0.8 puts the point at θ ≈ 36.87°, φ = 90°: |ψ⟩ = (3|0⟩ + i|1⟩)/√10. Two means and a sign fixed the third.");
        }],
        c: ["The distance from the X axis is √(⟨Y⟩² + ⟨Z⟩²) = ΔX.", "ΔX = 0.6 needs ⟨X⟩ = 0.8.", c => {
          const s = euSphereState(c), d = euSpread(s.m.x);
          if (!(s.m.x > 0)) return euGrade(false, "⟨X⟩ must be positive. Move the point to the +X side.");
          return euGrade(euNear(d, 0.6), "The distance from the X axis is " + euFmt(d) + ".",
            "Every point with ⟨X⟩ = 0.8 lies on a circle around the X axis of radius 0.6. That radius is ΔX = √(1 − 0.64).");
        }],
        d: ["A pure state’s point lies on the unit sphere.", "0.64 + 0.36 + 0.09.", c => euGrade(c.choice("d-pick") === "no", "Add the squares of the three means.",
          "0.8² + 0.6² + 0.3² = 1.09 > 1, outside the sphere. Pure-state means always satisfy ⟨X⟩² + ⟨Y⟩² + ⟨Z⟩² = 1. Rescaling the ket changes nothing, because the means are computed after normalizing.")],
        e: ["The opposite point negates every mean.", "Place (−0.48, −0.6, −0.64): θ ≈ 129.8°, φ ≈ 231.3°.", c => {
          const s = euSphereState(c);
          if (!euAt(s.m, [-0.48, -0.6, -0.64])) return euGrade(false, "The point is at (" + [s.m.x, s.m.y, s.m.z].map(euFmt).join(", ") + "). Negate each of (0.48, 0.6, 0.64).");
          return euGrade(c.choice("e-pick") === "same", "Compare √(1 − m²) for m and −m.",
            "Negating a mean leaves √(1 − ⟨A⟩²) unchanged, so all three spreads stay ΔX = 0.8773, ΔY = 0.8 and ΔZ = 0.7684. The two states are orthogonal yet equally uncertain.");
        }]
      }
    },

    // 16 · Instrument Noise vs Quantum Spread -----------------------------------------------------------------
    noise: {
      start(c) { euSeed(c); euNoiseClear(c); },
      edit(c, name) { if (name === "setup" || name === "sigma") euNoiseClear(c); },
      actions: {
        run(c) {
          euNoiseRun(c, 1000);
          const st = euNoiseStats(c);
          return "Seed " + c.s.seed + " · " + c.s.n + " readings · observed variance " + euFmt(st.variance) + ".";
        },
        clear(c) { euNoiseClear(c); return "Readings cleared."; },
        reseed(c) { euNoiseClear(c); return euReseed(c); }
      },
      show(c) {
        const card = EU_NOISE[c.val("setup")], sigma = c.num("sigma"), q = 4 * card.p * (1 - card.p), st = euNoiseStats(c);
        c.put("state", "Seed " + c.s.seed + " · " + card.name + ": (Δ" + card.sym + ")² = " + euFmt(q) + " · σ = " + euFmt(sigma) + ", σ² = " + euFmt(sigma * sigma) +
          " · " + c.s.n + " readings" + (c.s.n ? ": mean " + euFmt(st.mean) + ", observed variance " + euFmt(st.variance) : "") + ".");
        const width = 6 / EU_NOISE_BINS, top = Math.max(0.1, ...c.s.hist.map(k => k / Math.max(1, c.s.n)));
        const yMax = Math.ceil(top * 10) / 10;
        const rects = c.s.hist.map((k, i) => ({ x0: -3 + i * width, x1: -3 + (i + 1) * width, y0: 0, y1: k / Math.max(1, c.s.n), tone: "angle", opacity: 0.8 }));
        return {
          panels: [euChart("displayed values (green: the two quantum readings)", { x: [-3, 3], y: [0, yMax], xTicks: [-3, -2, -1, 0, 1, 2, 3], yTicks: [0, yMax / 2, yMax], xLabel: "displayed value",
            rects, vlines: [{ x: -1, tone: "plus" }, { x: 1, tone: "plus" }] })],
          caption: c.s.n ? "observed variance " + euFmt(st.variance) : "no readings yet",
          desc: "A histogram of " + c.s.n + " displayed values from −3 to 3, with lines at the quantum readings −1 and +1." + (c.s.n ? " Observed variance " + euFmt(st.variance) + "." : "")
        };
      },
      checks: {
        predict: ["Observed variance = (ΔA)² + σ².", "0.64 + 0.6².", c => {
          if (c.val("setup") !== "zs" || !euSame(c.num("sigma"), 0.6)) return euSetup("Choose Z on (2|0⟩ + |1⟩)/√5 and set σ = 0.6.");
          const st = euNoiseStats(c);
          return euGrade(euFits(c.ans("predict-s2"), 1), "Add the quantum variance and the noise variance.",
            "0.64 + 0.36 = 1." + (c.s.n ? " Your " + c.s.n + " readings show " + euFmt(st.variance) + ", close to 1 but not exactly, as finite samples always are." : " Run some readings to compare."));
        }],
        perfect: ["With σ = 0 the displayed value is the reading itself.", "ΔZ = √0.64.", c => {
          if (c.val("setup") !== "zs" || !euSame(c.num("sigma"), 0)) return euSetup("Choose Z on (2|0⟩ + |1⟩)/√5 and set σ = 0.");
          if (!euFits(c.ans("perfect-d"), 0.8)) return euGrade(false, "With no noise, the observed spread is the spread of the readings ±1 themselves.");
          return euGrade(c.choice("perfect-pick") === "quantum", "Even a perfect meter shows +1 on some trials and −1 on others.",
            "With σ = 0 the histogram collapses to two spikes at ±1, and the spread is ΔZ = 0.8. That part belongs to the state, not the meter.");
        }],
        infer: ["(ΔA)² = observed variance − σ².", "0.73 − 0.09.", c => euGrade(euFits(c.ans("infer-d"), 0.8), "Subtract σ² = 0.09, then take the square root.",
          "(ΔA)² = 0.73 − 0.09 = 0.64, so ΔA = 0.8. Subtracting spreads directly, 0.854 − 0.3, would be wrong: variances add, spreads don’t.")],
        own: ["Read the observed variance from the readout.", "Subtract 0.25.", c => {
          if (!euSame(c.num("sigma"), 0.5) || c.s.n < 2000) return euSetup("Set σ = 0.5 and collect at least 2000 readings. You have " + c.s.n + ".");
          const st = euNoiseStats(c), est = st.variance - 0.25;
          if (!euNear(c.ans("own-q"), est)) return euGrade(false, "Your run’s observed variance is " + euFmt(st.variance) + ". Subtract σ² = 0.25.");
          const card = EU_NOISE[c.val("setup")], q = 4 * card.p * (1 - card.p);
          return euGrade(c.choice("own-pick") === "more", "What shrinks the sampling wobble of any estimate?",
            "Your estimate " + euFmt(est) + " compares with the model value " + euFmt(q) + ". The gap is sampling wobble, which shrinks like 1/√N. Raising σ only adds noise to subtract.");
        }],
        eigen: ["|−x⟩ is an X eigenket.", "ΔX = 0, so only σ² is left.", c => {
          if (c.val("setup") !== "mx" || !euSame(c.num("sigma"), 0.4)) return euSetup("Choose X on |−x⟩ and set σ = 0.4.");
          return euGrade(euFits(c.ans("eigen-s2"), 0.16), "Add (ΔX)² = 0 and σ².",
            "Every reading is −1, so the observed variance is all instrument noise: 0 + 0.16. Here a better meter would remove all of the spread.");
        }]
      }
    }
  };

  const euStations = { ...euStations1, ...euStations2, ...euStations3 };

  function euPalette(root) {
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

  function initializeUncertaintyArcade(root) {
    const details = root.querySelector("#uncertainty-arcade");
    if (!details) return;
    const get = id => root.querySelector("#eu-" + id);
    const select = get("station"), resetButton = get("reset"), status = get("status");
    const reducedBox = get("reduced"), progress = get("progress");
    const figure = get("figure-template").content.firstElementChild.cloneNode(true);
    const toolTemplate = get("mission-template");
    const viewport = figure.querySelector("#eu-viewport");
    const canvas = figure.querySelector("#eu-canvas");
    const geometry = figure.querySelector("[data-eu-geometry]");
    const labelLayer = figure.querySelector("[data-eu-labels]");
    const desc = figure.querySelector("#eu-desc");
    const title = figure.querySelector("#eu-title");
    const renderStatus = figure.querySelector("#eu-render-status");
    const colors = euPalette(root);
    const lifetime = new AbortController();
    const listen = (node, type, handler, options = {}) =>
      node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
    const panels = new Map(), cards = new Map(), completion = new Set();
    let active = null, plan = null;
    let graphics = null, loading = false, failed = false, contextLost = false, disposed = false;
    let frame = null, motionFrame = null, lastTick = null, drag = null, glide = null;

    const say = message => euSetText(status, message ?? "");
    const updateProgress = () => euSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

    for (const panel of root.querySelectorAll("#eu-panels [data-eu-station]")) {
      const key = panel.dataset.euStation;
      const spec = euStations[key];
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
          const value = euParse(input.value);
          if (value === null) throw new EuFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2 or 1/√2.", true);
          return value;
        },
        quiet: name => euParse(field(name).value),
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
          if (!input.value) throw new EuFieldError(input, "Choose an option.");
          return input.value;
        },
        // Setting a value also moves any slider paired with that box.
        set(name, value) {
          field(name).value = String(value);
          for (const range of panel.querySelectorAll('[data-eu-pair="' + name + '"]')) range.value = String(value);
        },
        put(name, text) { euSetText(c.node('[data-eu-read="' + name + '"]'), text); },
        text(name, text) { for (const node of panel.querySelectorAll('[data-eu-text="' + name + '"]')) euSetText(node, text); },
        // Show or hide the label that holds a field.
        reveal(name, shown) { const label = field(name).closest("label"); if (label) label.hidden = !shown; },
        list(name, lines) {
          const list = c.node('[data-eu-log="' + name + '"]');
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
      for (const card of panel.querySelectorAll("[data-eu-mission]")) {
        const id = card.dataset.euMission, check = id.slice(key.length + 1);
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
      euSetText(renderStatus, message);
    }

    function refresh() {
      if (!active || !details.open) return;
      plan = active.spec.show(active);
      for (const output of active.panel.querySelectorAll("output[data-eu-for]")) {
        const value = active.val(output.dataset.euFor);
        euSetText(output, "euAngle" in output.dataset
          ? euAngleText(Number(value))
          : value.replace("-", "−") + (output.dataset.euUnit ?? ""));
      }
      euSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
      euSetText(desc, plan.desc || "");
      if (plan.sphere) {
        const target = euBlochPoint(plan.sphere.marker);
        if (!glide) glide = { from: target, to: target, start: 0, point: target };
        else if (glide.to.some((n, i) => n !== target[i])) {
          glide = { from: glide.point, to: target, start: performance.now(), point: glide.point };
          if (reduced() || !onScreen() || drag?.point) glide = { from: target, to: target, start: 0, point: target };
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
      // Dashed distances from the drawn point to each axis.
      if (view?.feet && view.shown) {
        const [x, y, z] = view.shown;
        view.segments = [{ from: view.shown, to: [x, 0, 0], tone: "alpha", label: "ΔX" }, { from: view.shown, to: [0, y, 0], tone: "beta", label: "ΔY" },
          { from: view.shown, to: [0, 0, z], tone: "angle", label: "ΔZ" }];
      }
      euPaintSvg(plan, geometry, labelLayer, view);
      if (!kind) {
        showSvg("SVG diagram.");
        return;
      }
      const noun = "sphere";
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
        euSetText(renderStatus, "Three.js 3D view." + (how || " Drag the " + noun + " or use the view sliders to turn it."));
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
        graphics = euCreateGraphics(THREE, canvas, colors);
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
      active.node("[data-eu-plot-slot]").append(figure);
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
      glide = null;
      lastTick = null;
      refresh();
    }

    function clearCard(card) {
      euSetText(card.querySelector("[data-eu-feedback]"), "");
      const work = card.querySelector("[data-eu-work]");
      work.hidden = true;
      work.open = false;
    }

    function showGrade(mission, result) {
      const { card, id, check, station } = mission;
      const work = card.querySelector("[data-eu-work]");
      euSetText(card.querySelector("[data-eu-feedback]"),
        result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
      euSetText(card.querySelector("[data-eu-work-text]"), result.work || "");
      work.hidden = !result.work;
      work.open = Boolean(result.work) && !result.pass;
      if (result.pass) station.s.revealed[check] = true;
      if (result.pass && !completion.has(id)) {
        completion.add(id);
        card.querySelector("[data-eu-done]").hidden = false;
        updateProgress();
      }
      say("");
    }

    function handleClick(event) {
      const button = event.target.closest("button");
      if (!button || !active || !active.panel.contains(button) || button.disabled) return;
      const missionCard = button.closest("[data-eu-mission]");
      const mission = missionCard ? cards.get(missionCard.dataset.euMission) : null;
      const action = button.dataset.euAction;
      try {
        if (action) {
          const message = active.spec.actions[action](active, mission?.check ?? null);
          if (mission) euSetText(mission.card.querySelector("[data-eu-feedback]"), message ?? "");
          else if (message !== null) say(message);
        } else if (mission && button.hasAttribute("data-eu-check")) {
          showGrade(mission, active.spec.checks[mission.check][2](active));
        } else if (mission && button.hasAttribute("data-eu-hint")) {
          if (mission.hints >= 2) return;
          const list = mission.card.querySelector("[data-eu-hint-list]");
          const item = document.createElement("li");
          euSetText(item, active.spec.checks[mission.check][mission.hints]);
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
        if (!(error instanceof EuFieldError)) throw error;
        if (mission) euSetText(mission.card.querySelector("[data-eu-feedback]"), error.message);
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
      if (target.dataset.euPair) active.field(target.dataset.euPair).value = target.value;
      else for (const range of active.panel.querySelectorAll('[data-eu-pair="' + target.name + '"]')) {
        if (target.value !== "" && Number.isFinite(Number(target.value))) range.value = target.value;
      }
      const missionCard = target.closest("[data-eu-mission]");
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
    listen(root.querySelector("#eu-arcade-link"), "click", () => { details.open = true; });

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
    if (location.hash === "#uncertainty-arcade") details.open = true;
  }

  // ---------------------------------------------------------------------------
  // SVG drawing. The viewBox is 560 × 300 and labels always stay in SVG.
  // ---------------------------------------------------------------------------

  function euNode(name, attributes = {}, text = "") {
    const node = document.createElementNS(EU_SVG, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    }
    if (text) node.textContent = text;
    return node;
  }


  function euPaintSvg(plan, geometry, labels, view) {
    const shapes = [], words = [];
    if (plan.panels) euDrawPanels(plan.panels, shapes, words);
    if (plan.sphere && view) euDrawSphere(view, shapes, words);
    geometry.replaceChildren(...shapes);
    labels.replaceChildren(...words);
  }

  function euDrawPanels(panels, shapes, words) {
    const total = panels.reduce((sum, panel) => sum + (panel.weight ?? 1), 0);
    let x = 0;
    for (const panel of panels) {
      const box = { x, w: 560 * (panel.weight ?? 1) / total };
      if (panel.kind === "plane") euDrawPlane(panel, box, shapes, words);
      else if (panel.kind === "chart") euDrawChart(panel, box, shapes, words);
      else if (panel.kind === "bars") euDrawBars(panel, box, shapes, words);
      else if (panel.kind === "matrix") euDrawMatrix(panel, box, shapes, words);
      else if (panel.kind === "line") euDrawLine(panel, box, shapes, words);
      else if (panel.kind === "chain") euDrawChain(panel, box, shapes, words);
      else if (panel.kind === "balance") euDrawBalance(panel, box, shapes, words);
      x += box.w;
    }
  }

  // Boxes joined by arrows: a preparation, then measurement stages, each with a line of detail.
  function euDrawChain(chain, box, shapes, words) {
    const n = chain.items.length, left = box.x + 10, right = box.x + box.w - 10;
    const slot = (right - left) / n, w = Math.min(slot - 22, 120), cy = 140, h = 74;
    words.push(euNode("text", { class: "eu-caption", x: (left + right) / 2, y: 40, "text-anchor": "middle" }, chain.caption));
    chain.items.forEach((item, k) => {
      const cx = left + slot * (k + 0.5);
      shapes.push(euNode("rect", { class: "eu-part", "data-tone": item.tone, x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 7 }));
      words.push(euNode("text", { class: "eu-label", "data-tone": item.tone, x: cx, y: cy - 8, "text-anchor": "middle" }, item.title));
      if (item.sub) words.push(euNode("text", { class: "eu-tick", x: cx, y: cy + 16, "text-anchor": "middle" }, item.sub));
      if (item.below) words.push(euNode("text", { class: "eu-label", "data-tone": item.belowTone ?? "plus", x: cx, y: cy + h / 2 + 26, "text-anchor": "middle" }, item.below));
      if (k < n - 1) {
        const x1 = cx + w / 2 + 3, x2 = cx + slot - w / 2 - 5;
        shapes.push(euNode("line", { class: "eu-arrow" + (item.dashedAfter ? " eu-dashed" : ""), "data-tone": "guide", x1, y1: cy, x2: x2 - 6, y2: cy }));
        shapes.push(euNode("polygon", { class: "eu-head", "data-tone": "guide", points: x2 + "," + cy + " " + (x2 - 8) + "," + (cy - 5) + " " + (x2 - 8) + "," + (cy + 5) }));
      }
    });
    if (chain.note) words.push(euNode("text", { class: "eu-tick", x: (left + right) / 2, y: 270, "text-anchor": "middle" }, chain.note));
  }

  function euLabel(words, text, x, y, tone, anchor = "middle", extra = {}) {
    // Keep the whole label inside the 560-wide viewBox (about 8.5 px per character).
    const span = text.length * 8.5;
    const left = anchor === "start" ? x : anchor === "end" ? x - span : x - span / 2;
    if (left + span > 556) { x = 556; anchor = "end"; }
    else if (left < 4) { x = 4; anchor = "start"; }
    words.push(euNode("text", { class: "eu-label", "data-tone": tone, x, y, "text-anchor": anchor, ...extra }, text));
  }

  function euDrawPlane(plane, box, shapes, words) {
    const size = Math.min(box.w - 20, 238), half = size / 2, cx = box.x + box.w / 2, cy = 166;
    const limit = plane.limit ?? 1, unit = (half - 10) / limit;
    const X = re => cx + re * unit, Y = im => cy - im * unit;
    shapes.push(euNode("rect", { class: "eu-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
    const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
    let grid = "";
    for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
      if (k === 0) continue;
      const v = k * step;
      grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
    }
    shapes.push(euNode("path", { class: "eu-grid", d: grid }));
    shapes.push(euNode("path", { class: "eu-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
    if (size > 150) {
      words.push(euNode("text", { class: "eu-tick", x: X(limit) - 2, y: cy + 14, "text-anchor": "end" }, plane.axes?.[0] ?? "Re"));
      words.push(euNode("text", { class: "eu-tick", x: cx + 5, y: Y(limit) + 10, "text-anchor": "start" }, plane.axes?.[1] ?? "Im"));
    }
    words.push(euNode("text", { class: "eu-caption", "data-tone": plane.tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
    const rings = [...(plane.circle ? [{ c: [0, 0], r: plane.circle, tone: "guide" }] : []), ...(plane.circles ?? [])];
    for (const ring of rings) {
      if (ring.r > 0) shapes.push(euNode("circle", { class: "eu-ring", "data-tone": ring.tone ?? "guide", cx: X(ring.c[0]), cy: Y(ring.c[1]), r: ring.r * unit }));
    }
    for (const ray of plane.rays ?? []) {
      const end = euPolar(limit * 1.05, ray.angle);
      const start = ray.through ? euScale(end, -1) : [0, 0];
      shapes.push(euNode("line", { class: "eu-ray" + (ray.solid ? " eu-solid" : ""), "data-tone": ray.tone ?? "angle",
        x1: X(start[0]), y1: Y(start[1]), x2: X(end[0]), y2: Y(end[1]) }));
    }
    for (const mark of plane.marks ?? []) {
      // Inside the circle and just off the ray, so marks never sit on the axis labels.
      const [mx, my] = euPolar(limit * 0.6, mark.angle + 12);
      euLabel(words, mark.label, X(mx), Y(my) + 5, mark.tone, "middle");
    }
    for (const path of plane.paths ?? []) {
      shapes.push(euNode("polyline", { class: "eu-curve" + (path.dashed ? " eu-dashed" : ""), "data-tone": path.tone,
        points: path.pts.map(([re, im]) => X(re).toFixed(1) + "," + Y(im).toFixed(1)).join(" ") }));
    }
    for (const item of plane.items) {
      const from = item.from ?? [0, 0];
      const fx = X(from[0]), fy = Y(from[1]);
      const [re, im] = euAdd(from, item.z);
      const reach = Math.max(Math.abs(re), Math.abs(im));
      const clip = reach > limit ? limit / reach : 1;
      const ex = X(re * clip), ey = Y(im * clip);
      const length = Math.hypot(ex - fx, ey - fy);
      if (item.dot || length < 3) {
        shapes.push(euNode("circle", { class: "eu-dot" + (item.hollow || length < 3 ? " eu-hollow" : ""), "data-tone": item.tone, cx: ex, cy: ey, r: item.dot ? item.size ?? 4.5 : 5 }));
      } else {
        const ux = (ex - fx) / length, uy = (ey - fy) / length, depth = Math.min(13, length * 0.6), wing = depth * 0.42;
        const bx = ex - ux * depth, by = ey - uy * depth;
        shapes.push(euNode("line", { class: "eu-arrow" + (item.dashed ? " eu-dashed" : "") + (item.wide ? " eu-wide" : ""), "data-tone": item.tone, x1: fx, y1: fy, x2: bx, y2: by }));
        shapes.push(euNode("polygon", { class: "eu-head" + (item.dashed ? " eu-hollow" : ""), "data-tone": item.tone,
          points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
      }
      if (item.label) {
        // Past the tip and a little to one side, so a label never hides an arrow along the same line.
        const ux = (ex - fx) / (length || 1), uy = (ey - fy) / (length || 1);
        const away = length < 3 ? [10, -10] : [ux * 12 + uy * 9, uy * 12 - ux * 9];
        const anchor = Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end";
        euLabel(words, item.label + (clip < 1 ? " (off scale)" : ""), ex + away[0], ey + away[1] + 4, item.tone, anchor);
      }
    }
  }

  function euDrawChart(chart, box, shapes, words) {
    const left = box.x + 46, right = box.x + box.w - 16, top = 40, bottom = 246;
    const [x0, x1] = chart.x, [y0, y1] = chart.y;
    const X = v => left + (v - x0) / (x1 - x0) * (right - left);
    const Y = v => bottom - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0) * (bottom - top);
    shapes.push(euNode("rect", { class: "eu-frame", x: left, y: top, width: right - left, height: bottom - top }));
    let grid = "";
    for (const v of chart.xTicks) grid += "M" + X(v) + " " + top + "V" + bottom;
    for (const v of chart.yTicks) grid += "M" + left + " " + Y(v) + "H" + right;
    shapes.push(euNode("path", { class: "eu-grid", d: grid }));
    const zeroY = y0 < 0 && y1 > 0 ? Y(0) : bottom;
    shapes.push(euNode("path", { class: "eu-axis", d: "M" + left + " " + top + "V" + bottom + "M" + left + " " + zeroY + "H" + right }));
    const every = Math.max(1, Math.ceil(chart.xTicks.length * 34 / (right - left)));
    chart.xTicks.forEach((v, k) => {
      if (k % every === 0) words.push(euNode("text", { class: "eu-tick", x: X(v), y: bottom + 16, "text-anchor": "middle" }, chart.xTickText?.[k] ?? euFmt(v)));
    });
    for (const v of chart.yTicks) words.push(euNode("text", { class: "eu-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, euFmt(v)));
    words.push(euNode("text", { class: "eu-tick", x: (left + right) / 2, y: bottom + 36, "text-anchor": "middle" }, chart.xLabel));
    words.push(euNode("text", { class: "eu-caption", x: (left + right) / 2, y: top - 12, "text-anchor": "middle" }, chart.caption));
    for (const h of chart.hlines ?? []) {
      shapes.push(euNode("line", { class: "eu-ray", "data-tone": h.tone ?? "angle", x1: left, y1: Y(h.y), x2: right, y2: Y(h.y) }));
      if (h.label) euLabel(words, h.label, right - 4, Y(h.y) - 6, h.tone ?? "angle", "end");
    }
    for (const v of chart.vlines ?? []) {
      shapes.push(euNode("line", { class: "eu-ray eu-solid", "data-tone": v.tone ?? "angle", x1: X(v.x), y1: top, x2: X(v.x), y2: bottom }));
    }
    for (const series of chart.series ?? []) {
      shapes.push(euNode("polyline", { class: "eu-curve" + (series.dashed ? " eu-dashed" : "") + (series.dotted ? " eu-dotted" : ""), "data-tone": series.tone,
        points: series.pts.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join(" ") }));
      if (series.label) {
        const [lx, ly] = series.labelAt ?? series.pts.at(-1);
        euLabel(words, series.label, X(lx) + (series.labelDx ?? 6), Y(ly) + (series.labelDy ?? -6), series.tone, series.labelAnchor ?? "start");
      }
    }
    for (const r of chart.rects ?? []) {
      const xa = X(r.x0), xb = X(r.x1), ya = Y(r.y1), yb = Y(r.y0);
      shapes.push(euNode("rect", { class: "eu-cell" + (r.hollow ? " eu-hollow" : ""), "data-tone": r.tone, x: Math.min(xa, xb), y: Math.min(ya, yb),
        width: Math.abs(xb - xa), height: Math.abs(yb - ya), "fill-opacity": r.opacity ?? null }));
    }
    for (const seg of chart.segments ?? []) {
      shapes.push(euNode("line", { class: "eu-arrow" + (seg.dashed ? " eu-dashed" : ""), "data-tone": seg.tone, x1: X(seg.x0), y1: Y(seg.y0), x2: X(seg.x1), y2: Y(seg.y1) }));
      if (seg.label) euLabel(words, seg.label, (X(seg.x0) + X(seg.x1)) / 2, Math.min(Y(seg.y0), Y(seg.y1)) - 8, seg.tone, "middle");
    }
    for (const dot of chart.dots ?? []) {
      shapes.push(euNode("circle", { class: "eu-dot" + (dot.hollow ? " eu-hollow" : ""), "data-tone": dot.tone, cx: X(dot.x), cy: Y(dot.y), r: dot.r ?? 5 }));
      if (dot.label) euLabel(words, dot.label, X(dot.x) + 8, Y(dot.y) - 8, dot.tone, "start");
    }
  }

  function euDrawBars(bars, box, shapes, words) {
    const left = box.x + 40, right = box.x + box.w - 10, top = 48, bottom = 246, max = bars.max ?? 1;
    const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
    let grid = "";
    for (const v of [0, max / 2, max]) {
      grid += "M" + left + " " + Y(v) + "H" + right;
      words.push(euNode("text", { class: "eu-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, euFmt(v)));
    }
    shapes.push(euNode("path", { class: "eu-grid", d: grid }));
    shapes.push(euNode("path", { class: "eu-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
    words.push(euNode("text", { class: "eu-caption", x: (left + right) / 2, y: top - 22, "text-anchor": "middle" }, bars.caption));
    const slot = (right - left) / bars.items.length;
    bars.items.forEach((bar, index) => {
      const x = left + slot * index + slot * 0.2, w = slot * 0.6, y = Y(bar.value);
      shapes.push(euNode("rect", { class: "eu-bar" + (bar.outline ? " eu-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: Math.max(0, bottom - y) }));
      if (bar.target !== undefined) {
        shapes.push(euNode("line", { class: "eu-ray eu-solid", "data-tone": "angle", x1: x - 4, y1: Y(bar.target), x2: x + w + 4, y2: Y(bar.target) }));
      }
      words.push(euNode("text", { class: "eu-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 20, "text-anchor": "middle" }, bar.label));
      words.push(euNode("text", { class: "eu-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top - 4, y - 8), "text-anchor": "middle" }, bar.text ?? euFmt(bar.value)));
    });
  }

  // ---------------------------------------------------------------------------
  // 3D views. World coordinates have z up. The view turns by yaw about z and
  // tilts by an elevation angle; the SVG fallback and Three.js share euFrame,
  // so SVG labels line up with the WebGL picture.
  // ---------------------------------------------------------------------------

  const EU_VIEW = { cx: 280, cy: 152 };
  const EU_BLOCH_R = 112;

  function euFrame(yaw, tilt) {
    const y = yaw * Math.PI / 180, t = tilt * Math.PI / 180;
    return {
      right: [-Math.sin(y), Math.cos(y), 0],
      up: [-Math.sin(t) * Math.cos(y), -Math.sin(t) * Math.sin(y), Math.cos(t)],
      toward: [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)]
    };
  }
  const euDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const euProject = (frame, point, scale) => ({
    x: EU_VIEW.cx + scale * euDot3(frame.right, point),
    y: EU_VIEW.cy - scale * euDot3(frame.up, point),
    depth: euDot3(frame.toward, point)
  });

  function euBlochPoint({ polar, azimuth }) {
    const t = polar * Math.PI / 180, p = azimuth * Math.PI / 180;
    return [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
  }

  function euDrawSphere(view, shapes, words) {
    const frame = euFrame(view.yaw, view.tilt);
    const P = point => euProject(frame, point, EU_BLOCH_R);
    shapes.push(euNode("circle", { class: "eu-sphere", cx: EU_VIEW.cx, cy: EU_VIEW.cy, r: EU_BLOCH_R }));
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
      shapes.push(euNode("path", { class: "eu-wire", d: front }));
      shapes.push(euNode("path", { class: "eu-wire eu-back", d: back }));
    }
    const axes = [[[0, 0, 1], "|0⟩"], [[0, 0, -1], "|1⟩"], [[1, 0, 0], "|+x⟩"], [[-1, 0, 0], "|−x⟩"], [[0, 1, 0], "|+y⟩"], [[0, -1, 0], "|−y⟩"]];
    for (const [direction, name] of axes) {
      const end = P(direction.map(n => n * 1.18)), start = P([0, 0, 0]);
      shapes.push(euNode("line", { class: "eu-axis" + (end.depth < -0.05 ? " eu-back" : ""), x1: start.x, y1: start.y, x2: end.x, y2: end.y }));
      const tag = P(direction.map(n => n * 1.34));
      words.push(euNode("text", { class: "eu-tick" + (tag.depth < -0.05 ? " eu-back" : ""), x: tag.x, y: tag.y + 4, "text-anchor": "middle" }, name));
    }
    if (view.axis) {
      // The observable's axis runs through the centre; its ends are the two eigenkets.
      const up = view.axis, a = P(up.map(n => n * 1.22)), b = P(up.map(n => -n * 1.22));
      shapes.push(euNode("line", { class: "eu-arrow eu-wide", "data-tone": "angle", x1: b.x, y1: b.y, x2: a.x, y2: a.y }));
      const ta = P(up.map(n => n * 1.05)), tb = P(up.map(n => -n * 1.05));
      words.push(euNode("text", { class: "eu-label", "data-tone": "angle", x: ta.x - 12, y: ta.y + 20, "text-anchor": "end" }, view.ends?.[0] ?? "+1"));
      words.push(euNode("text", { class: "eu-label", "data-tone": "minus", x: tb.x - 12, y: tb.y + 20, "text-anchor": "end" }, view.ends?.[1] ?? "−1"));
    }
    for (const seg of view.segments ?? []) {
      const a = P(seg.from), b = P(seg.to);
      shapes.push(euNode("line", { class: "eu-arrow eu-dashed", "data-tone": seg.tone, x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
      if (seg.label) words.push(euNode("text", { class: "eu-label", "data-tone": seg.tone, x: (a.x + b.x) / 2 + 6, y: (a.y + b.y) / 2 - 6, "text-anchor": "start" }, seg.label));
    }
    if (view.shown) {
      const q = P(view.shown), o = P([0, 0, 0]);
      shapes.push(euNode("line", { class: "eu-arrow", "data-tone": "plus", x1: o.x, y1: o.y, x2: q.x, y2: q.y }));
    }
    const points = [...(view.points ?? [])];
    if (view.shown) points.push({ point: view.shown, tone: "plus", label: view.shownLabel ?? "|ψ⟩", size: 7 });
    points.sort((a, b) => P(a.point).depth - P(b.point).depth);
    for (const item of points) {
      const q = P(item.point);
      shapes.push(euNode("circle", { class: "eu-dot" + (q.depth < -0.02 ? " eu-back" : ""), "data-tone": item.tone, cx: q.x, cy: q.y, r: item.size ?? 4 }));
      if (item.label) {
        words.push(euNode("text", { class: "eu-label" + (q.depth < -0.02 ? " eu-back" : ""), "data-tone": item.tone, x: q.x + 11, y: q.y - 9, "text-anchor": "start" }, item.label));
      }
    }
  }

  // A matrix drawn as text between square brackets. Entries are strings.
  function euDrawMatrix(panel, box, shapes, words) {
    const rows = panel.rows, n = rows.length, m = rows[0].length;
    const longest = Math.max(...rows.flat().map(text => text.length), 1);
    const cell = Math.min((box.w - 40) / m, Math.max(44, longest * 9 + 16)), height = Math.min(52, 190 / n);
    const cx = box.x + box.w / 2, cy = 160, w = cell * m, h = height * n;
    const left = cx - w / 2, top = cy - h / 2;
    words.push(euNode("text", { class: "eu-caption", "data-tone": panel.tone, x: cx, y: top - 22, "text-anchor": "middle" }, panel.caption));
    const bracket = (x, dir) => "M" + (x + dir * 9) + " " + (top - 6) + "H" + x + "V" + (top + h + 6) + "H" + (x + dir * 9);
    shapes.push(euNode("path", { class: "eu-axis", d: bracket(left - 4, 1) + bracket(left + w + 4, -1) }));
    rows.forEach((row, i) => row.forEach((text, j) => {
      const tone = panel.tones?.[i]?.[j] ?? panel.tone ?? "ink";
      words.push(euNode("text", { class: "eu-label", "data-tone": tone, x: left + cell * (j + 0.5), y: top + height * (i + 0.5) + 5, "text-anchor": "middle" }, text));
    }));
    if (panel.note) words.push(euNode("text", { class: "eu-tick", x: cx, y: Math.min(286, top + h + 34), "text-anchor": "middle" }, panel.note));
  }

  // Number lines: one row per operator, each with labelled points; links join
  // matching points on neighbouring rows.
  function euDrawLine(panel, box, shapes, words) {
    const left = box.x + 70, right = box.x + box.w - 24, [x0, x1] = panel.x;
    const X = v => left + (Math.max(x0, Math.min(x1, v)) - x0) / (x1 - x0) * (right - left);
    const gap = 200 / Math.max(1, panel.rows.length), Y = k => 78 + gap * k;
    words.push(euNode("text", { class: "eu-caption", x: (left + right) / 2, y: 36, "text-anchor": "middle" }, panel.caption));
    panel.rows.forEach((row, k) => {
      const y = Y(k);
      shapes.push(euNode("path", { class: "eu-axis", d: "M" + left + " " + y + "H" + right }));
      let ticks = "";
      for (let v = Math.ceil(x0); v <= x1; v++) ticks += "M" + X(v) + " " + (y - 4) + "V" + (y + 4);
      shapes.push(euNode("path", { class: "eu-grid", d: ticks }));
      for (let v = Math.ceil(x0); v <= x1; v += panel.every ?? 1) {
        words.push(euNode("text", { class: "eu-tick", x: X(v), y: y + 20, "text-anchor": "middle" }, euFmt(v)));
      }
      words.push(euNode("text", { class: "eu-label", "data-tone": row.tone ?? "ink", x: left - 12, y: y + 5, "text-anchor": "end" }, row.label));
      for (const point of row.points) {
        shapes.push(euNode("circle", { class: "eu-dot", "data-tone": point.tone, cx: X(point.x), cy: y, r: point.r ?? 6 }));
        if (point.label) euLabel(words, point.label, X(point.x), y - 12 - (point.raise ?? 0), point.tone, "middle");
      }
    });
    for (const link of panel.links ?? []) {
      shapes.push(euNode("line", { class: "eu-ray", "data-tone": link.tone ?? "guide", x1: X(link.from), y1: Y(link.rows[0]) + 7, x2: X(link.to), y2: Y(link.rows[1]) - 7 }));
    }
  }

  // A beam on a fulcrum. Columns stand on the beam at each reading, with heights
  // equal to their weights; the beam tilts toward the heavier side.
  const EU_BAL = { left: 40, right: 540, axisY: 206, barMax: 130 };
  const euBalX = (panel, v) => EU_BAL.left + (v - panel.x[0]) / (panel.x[1] - panel.x[0]) * (EU_BAL.right - EU_BAL.left);
  const euBalValue = (panel, x) => panel.x[0] + (x - EU_BAL.left) / (EU_BAL.right - EU_BAL.left) * (panel.x[1] - panel.x[0]);
  function euDrawBalance(panel, box, shapes, words) {
    const X = v => euBalX(panel, v), y = EU_BAL.axisY, fx = X(panel.f);
    const angle = Math.max(-9, Math.min(9, panel.torque * 6));
    const turn = "rotate(" + angle.toFixed(2) + " " + fx.toFixed(1) + " " + y + ")";
    const beam = euNode("g", { transform: turn }), tags = euNode("g", { transform: turn });
    words.push(euNode("text", { class: "eu-caption", x: 280, y: 26, "text-anchor": "middle" }, panel.caption));
    beam.append(euNode("line", { class: "eu-beam", x1: X(panel.x[0]), y1: y, x2: X(panel.x[1]), y2: y }));
    let ticks = "";
    for (let v = Math.ceil(panel.x[0]); v <= panel.x[1]; v++) {
      ticks += "M" + X(v) + " " + (y - 5) + "V" + (y + 5);
      // The fulcrum label already shows the value under it.
      if (Math.abs(X(v) - fx) > 16) tags.append(euNode("text", { class: "eu-tick", x: X(v), y: y + 22, "text-anchor": "middle" }, euFmt(v)));
    }
    beam.append(euNode("path", { class: "eu-axis", d: ticks }));
    panel.readings.forEach((a, k) => {
      const w = Math.max(0, Math.min(1, panel.weights[k] ?? 0)), h = w * EU_BAL.barMax;
      beam.append(euNode("rect", { class: "eu-bar", "data-tone": "angle", x: X(a) - 13, y: y - h, width: 26, height: h }));
      beam.append(euNode("circle", { class: "eu-dot", "data-tone": "plus", cx: X(a), cy: y, r: 5 }));
      tags.append(euNode("text", { class: "eu-label", "data-tone": "angle", x: X(a), y: y - h - 8, "text-anchor": "middle" }, Number.isFinite(panel.weights[k]) ? euFmt(w) : "?"));
    });
    if (panel.mean !== undefined) {
      const mx = X(panel.mean);
      beam.append(euNode("polygon", { class: "eu-head", "data-tone": "alpha", points: mx + "," + (y - 9) + " " + (mx + 7) + "," + (y - 18) + " " + (mx - 7) + "," + (y - 18) }));
    }
    shapes.push(beam);
    words.push(tags);
    shapes.push(euNode("polygon", { class: "eu-part", "data-tone": "beta", points: fx + "," + (y + 3) + " " + (fx - 14) + "," + (y + 30) + " " + (fx + 14) + "," + (y + 30) }));
    words.push(euNode("text", { class: "eu-label", "data-tone": "beta", x: fx, y: y + 48, "text-anchor": "middle" }, "f = " + euFmt(panel.f)));
    if (panel.note) words.push(euNode("text", { class: "eu-tick", x: 280, y: 292, "text-anchor": "middle" }, panel.note));
  }

  function euCreateGraphics(THREE, canvas, colors) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    const camera = new THREE.OrthographicCamera(-EU_VIEW.cx, 560 - EU_VIEW.cx, EU_VIEW.cy, EU_VIEW.cy - 300, 1, 2000);
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
      // Dashed segments from the state to each axis: one geometry per tone.
      const segmentLines = {};
      const segmentLine = tone => {
        if (!segmentLines[tone]) {
          const line = new THREE.LineSegments(keep(new THREE.BufferGeometry()),
            keep(new THREE.LineDashedMaterial({ color: colors[tone] ?? colors.plus, dashSize: 0.05, gapSize: 0.04 })));
          group.add(line);
          segmentLines[tone] = line;
        }
        return segmentLines[tone];
      };
      return {
        draw(view) {
          place(group, EU_BLOCH_R, euFrame(view.yaw, view.tilt));
          const points = [...(view.points ?? [])];
          if (view.shown) points.push({ point: view.shown, tone: "plus", size: 7 });
          stem.visible = Boolean(view.shown);
          const byTone = {};
          for (const seg of view.segments ?? []) (byTone[seg.tone] ??= []).push(new THREE.Vector3(...seg.from), new THREE.Vector3(...seg.to));
          for (const tone of new Set([...Object.keys(segmentLines), ...Object.keys(byTone)])) {
            const line = segmentLine(tone);
            line.visible = Boolean(byTone[tone]);
            if (byTone[tone]) {
              line.geometry.setFromPoints(byTone[tone]);
              line.computeLineDistances();
            }
          }
          axisLine.visible = Boolean(view.axis);
          if (view.axis) {
            axisGeometry.setFromPoints([new THREE.Vector3(...view.axis.map(n => -n * 1.22)), new THREE.Vector3(...view.axis.map(n => n * 1.22))]);
            points.push({ point: view.axis, tone: "angle", size: 5 }, { point: view.axis.map(n => -n), tone: "minus", size: 5 });
          }
          if (view.shown) stemGeometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...view.shown)]);
          dots(points.length, (mesh, k) => {
            mesh.material = basic(points[k].tone);
            mesh.position.set(...points[k].point);
            mesh.scale.setScalar((points[k].size ?? 4) / EU_BLOCH_R);
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



  if (lesson) initializeUncertaintyArcade(lesson);
} catch (error) {
  console.error("Uncertainty Arcade could not start.", error);
}
