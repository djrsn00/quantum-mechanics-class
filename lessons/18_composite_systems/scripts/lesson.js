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