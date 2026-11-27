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