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