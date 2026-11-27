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