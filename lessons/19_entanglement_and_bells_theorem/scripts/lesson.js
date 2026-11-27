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