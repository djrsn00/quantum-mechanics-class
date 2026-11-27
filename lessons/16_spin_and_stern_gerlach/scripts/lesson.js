const DEFAULT_SETUP = { source: "plus-z", mode: "single", a: 0, b: 0, pass: "plus" };

const PRESETS = {
  direct: DEFAULT_SETUP,
  puzzle: { ...DEFAULT_SETUP, mode: "sequence", a: 90 },
  repeat: { ...DEFAULT_SETUP, mode: "sequence", a: 90, b: 90, pass: "minus" }
};

const SOURCES = {
  "plus-z": { angle: 0, ket: "|+z⟩" },
  "minus-z": { angle: 180, ket: "|−z⟩" },
  "plus-x": { angle: 90, ket: "|+x⟩" }
};

const BRANCHES = ["plus", "minus"];
const SIGN = { plus: "+", minus: "−" };
const ALIGNED_AXES = { 0: "+z", 90: "+x", 180: "−z" };

function opposite(branch) {
  return branch === "plus" ? "minus" : "plus";
}

function spinProbabilities(separation) {
  // These three cases have exact probabilities. For all other settings,
  // the cosine is the dot product of the two unit directions.
  let plus;
  if (separation === 0) plus = 1;
  else if (separation === 90) plus = 0.5;
  else if (separation === 180) plus = 0;
  else plus = (1 + Math.cos(separation * Math.PI / 180)) / 2;

  return { plus, minus: 1 - plus };
}

function theoryFor(setup) {
  const separationA = Math.abs(SOURCES[setup.source].angle - setup.a);
  const a = spinProbabilities(separationA);
  if (setup.mode === "single") return { separationA, a };

  const axisDifference = Math.abs(setup.a - setup.b);
  const separationB = setup.pass === "plus" ? axisDifference : 180 - axisDifference;
  const b = spinProbabilities(separationB);
  const passed = a[setup.pass];

  return {
    separationA,
    a,
    separationB,
    b,
    passed,
    blocked: a[opposite(setup.pass)],
    perSource: { plus: passed * b.plus, minus: passed * b.minus }
  };
}

function pickBranch(plus, random) {
  if (plus === 1) return "plus";
  if (plus === 0) return "minus";
  return random() < plus ? "plus" : "minus";
}

function freshCounts() {
  return { sent: 0, a: { plus: 0, minus: 0 }, b: { plus: 0, minus: 0 }, last: null };
}

function checkCounts(counts, setup) {
  const allA = counts.a.plus + counts.a.minus;
  const allB = counts.b.plus + counts.b.minus;
  const expectedB = setup.mode === "sequence" ? counts.a[setup.pass] : 0;

  if (allA !== counts.sent || allB !== expectedB) {
    throw new Error("The simulated atom counts do not balance.");
  }
}

function sampleBatch(size, setup, theory, random = Math.random) {
  const batch = freshCounts();
  batch.sent = size;

  for (let index = 0; index < size; index++) {
    const a = pickBranch(theory.a.plus, random);
    const reachesB = setup.mode === "sequence" && a === setup.pass;
    const b = reachesB ? pickBranch(theory.b.plus, random) : null;
    batch.a[a]++;
    if (b !== null) batch.b[b]++;
    batch.last = { a, b };
  }

  checkCounts(batch, setup);
  return batch;
}

function percent(probability) {
  if (probability === 0) return "0%";
  if (probability === 1) return "100%";
  const value = 100 * probability;
  if (value < 0.01) return "<0.01%";
  if (value > 99.99) return ">99.99%";
  return String(Number(value.toFixed(2))) + "%";
}

function frequency(count, total) {
  return total === 0 ? "—" : percent(count / total);
}

function axisLabel(angle) {
  const axis = ALIGNED_AXES[angle];
  return axis ? angle + "° (" + axis + ")" : angle + "°";
}

function describeRoute(last, setup) {
  if (setup.mode === "single") {
    return "The atom reached A" + SIGN[last.a] + " at " + SIGN[last.a] + "ℏ/2.";
  }
  if (last.b === null) {
    return "The atom went into A" + SIGN[last.a] + " and was blocked at the selector.";
  }
  return "The atom passed through A" + SIGN[last.a] + " and reached B" + SIGN[last.b]
    + " at " + SIGN[last.b] + "ℏ/2.";
}

function initializeLab(root) {
  const find = id => root.querySelector("#spin-" + id);
  const write = (id, value) => { find(id).textContent = value; };
  const source = find("source");
  const mode = find("mode");
  const pass = find("pass");
  const angles = { a: find("angle-a"), b: find("angle-b") };
  const modePanels = root.querySelectorAll("[data-spin-show]");
  const diagrams = root.querySelectorAll(".spin-diagram");
  const prediction = find("prediction");
  const challenge = find("challenge");

  let setup = { ...DEFAULT_SETUP };
  let theory = theoryFor(setup);
  let counts = freshCounts();
  let unlocked = false;
  let question = "angle";

  function renderRoutes() {
    const active = new Set();
    if (counts.last !== null) {
      const { a, b } = counts.last;
      active.add("input");
      active.add("a-" + a);
      if (setup.mode === "sequence") {
        if (b === null) {
          active.add("block-" + a);
        } else {
          active.add("pass-" + a);
          active.add("b-" + b);
        }
      }
    }

    for (const diagram of diagrams) {
      const visible = diagram.dataset.spinShow === setup.mode;
      for (const path of diagram.querySelectorAll("[data-spin-route]")) {
        path.toggleAttribute("data-spin-active", visible && active.has(path.dataset.spinRoute));
      }
    }

    write("last-route", counts.last === null
      ? "Last simulated atom — none sent."
      : "Last simulated atom. " + describeRoute(counts.last, setup));
  }

  function renderCounts() {
    write("sent", counts.sent);
    for (const sign of BRANCHES) {
      const count = counts.a[sign];
      write("a-" + sign + "-count", count);
      write("a-" + sign + "-observed", frequency(count, counts.sent));
    }

    if (setup.mode === "sequence") {
      const passed = counts.a[setup.pass];
      const blocked = counts.a[opposite(setup.pass)];
      write("passed", passed);
      write("blocked", blocked);
      write("blocked-count", blocked);
      write("blocked-observed", frequency(blocked, counts.sent));

      for (const sign of BRANCHES) {
        const count = counts.b[sign];
        write("b-" + sign + "-count", count);
        write("b-" + sign + "-observed", frequency(count, counts.sent));
        write("b-" + sign + "-passed-observed", frequency(count, passed));
      }

      write("accounting", counts.sent + " sent = " + blocked + " blocked + " + passed
        + " passed. " + passed + " passed = " + counts.b.plus + " B+ + " + counts.b.minus + " B−.");
    }

    renderRoutes();
  }

  function renderSetup() {
    source.value = setup.source;
    mode.value = setup.mode;
    pass.value = setup.pass;

    for (const axis of ["a", "b"]) {
      angles[axis].value = setup[axis];
      find("arrow-" + axis)?.setAttribute("transform", "rotate(" + setup[axis] + " 40 40)");
    }

    for (const panel of modePanels) {
      panel.toggleAttribute("hidden", panel.dataset.spinShow !== setup.mode);
    }

    const aLabel = axisLabel(setup.a);
    const beam = SOURCES[setup.source].ket;
    const singleDescription = "A is at " + aLabel + " and reads the " + beam
      + " preparation. Circles mark positive end detectors and squares mark negative end detectors.";
    const singleTitle = find("single-description");
    if (singleTitle) singleTitle.textContent = singleDescription;

    write("a-summary", "At A, the separation angle is " + theory.separationA
      + "°. Of all atoms sent, " + percent(theory.a.plus) + " are predicted in A+ and "
      + percent(theory.a.minus) + " in A−.");

    for (const sign of BRANCHES) {
      write("a-" + sign + "-model", percent(theory.a[sign]));
    }

    if (setup.mode === "single") {
      write("route-summary", singleDescription);
    } else {
      const selected = "A" + SIGN[setup.pass];
      const rejected = "A" + SIGN[opposite(setup.pass)];
      const description = beam + " enters A at " + aLabel + ". The selector passes " + selected
        + " to B at " + axisLabel(setup.b) + " and blocks " + rejected + ". B has two end detectors.";

      find("sequence-diagram")?.setAttribute("data-pass", setup.pass);
      const sequenceTitle = find("sequence-description");
      if (sequenceTitle) sequenceTitle.textContent = description;
      write("route-summary", description);
      write("blocked-model", percent(theory.blocked));
      write("b-summary", theory.passed === 0
        ? selected + " has zero probability in this setup. B receives no beam."
        : percent(theory.passed) + " of all atoms sent pass through " + selected
          + ". At B, the selected state and B’s axis are " + theory.separationB + "° apart.");

      for (const sign of BRANCHES) {
        write("b-" + sign + "-model", percent(theory.perSource[sign]));
        write("b-" + sign + "-conditional", theory.passed === 0 ? "—" : percent(theory.b[sign]));
      }
    }

    renderCounts();
  }

  function clearChallengeFeedback() {
    write("challenge-feedback", "");
    find("challenge-next").hidden = true;
    find("challenge-restart").hidden = true;
  }

  function applySetup(changes, reset = false) {
    const next = { ...setup, ...changes };
    if (!reset && Object.keys(next).every(key => next[key] === setup[key])) return;

    setup = next;
    theory = theoryFor(setup);
    counts = freshCounts();
    if (question === "angle") clearChallengeFeedback();
    renderSetup();
    write("announcement", reset
      ? "Setup reset to a positive Z source and one Z analyzer. Counts cleared."
      : "Setup changed. A fresh count series starts at zero.");
  }

  function commitAngle(axis) {
    const input = angles[axis];
    const value = input.valueAsNumber;

    if (!Number.isInteger(value) || value < 0 || value > 180) {
      input.value = setup[axis];
      write("announcement", "Enter a whole number between 0 and 180 for analyzer "
        + axis.toUpperCase() + ". The angle stays at " + setup[axis] + " degrees.");
      return;
    }

    applySetup({ [axis]: value });
  }

  function send(size) {
    if (!unlocked) return;

    const batch = sampleBatch(size, setup, theory);
    const next = { ...freshCounts(), sent: counts.sent + batch.sent, last: batch.last };
    for (const sign of BRANCHES) {
      next.a[sign] = counts.a[sign] + batch.a[sign];
      next.b[sign] = counts.b[sign] + batch.b[sign];
    }

    checkCounts(next, setup);
    counts = next;
    renderCounts();

    const summary = size === 1
      ? describeRoute(batch.last, setup)
      : setup.mode === "single"
        ? size + " simulated atoms. A positive " + batch.a.plus + ". A negative " + batch.a.minus + "."
        : size + " simulated atoms. Blocked " + batch.a[opposite(setup.pass)] + ". B positive "
          + batch.b.plus + ". B negative " + batch.b.minus + ".";

    write("announcement", summary + " Total sent " + counts.sent + ".");
  }

  prediction.addEventListener("change", () => { write("prediction-feedback", ""); });

  prediction.addEventListener("submit", event => {
    event.preventDefault();
    const answer = prediction.querySelector('input[name="spin-guess"]:checked');
    if (!answer) return;

    if (!unlocked) {
      unlocked = true;
      for (const id of ["setup", "run", "challenge-controls"]) find(id).disabled = false;
      find("lock").hidden = true;
    }

    const lead = answer.value === "half-quarter" ? "Correct." : "Follow the beam through both stages.";
    write("prediction-feedback", lead + " Half the atoms sent pass through A+. Of those, half reach B−."
      + " That is ½ of the passed beam and ¼ of all atoms sent. Compare Direct Z and X+ then Z with a batch in each setup.");
  });

  source.addEventListener("change", () => applySetup({ source: source.value }));
  mode.addEventListener("change", () => applySetup({ mode: mode.value }));
  pass.addEventListener("change", () => applySetup({ pass: pass.value }));

  for (const [axis, input] of Object.entries(angles)) {
    input.addEventListener("change", () => commitAngle(axis));
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitAngle(axis);
    });
  }

  for (const button of root.querySelectorAll("[data-spin-angle]")) {
    const { spinAxis, spinAngle } = button.dataset;
    button.addEventListener("click", () => applySetup({ [spinAxis]: Number(spinAngle) }));
  }

  for (const button of root.querySelectorAll("[data-spin-preset]")) {
    button.addEventListener("click", () => applySetup(PRESETS[button.dataset.spinPreset]));
  }

  for (const button of root.querySelectorAll("[data-spin-send]")) {
    button.addEventListener("click", () => send(Number(button.dataset.spinSend)));
  }

  find("clear").addEventListener("click", () => {
    counts = freshCounts();
    renderCounts();
    write("announcement", "Counts cleared. The selected setup stays active.");
  });

  find("reset").addEventListener("click", () => applySetup(DEFAULT_SETUP, true));

  function showQuestion(next) {
    question = next;
    for (const panel of challenge.querySelectorAll("[data-spin-question]")) {
      panel.hidden = panel.dataset.spinQuestion !== question;
      if (!panel.hidden) panel.querySelector("h4").focus();
    }
    find("challenge-check").textContent = question === "angle" ? "Check my setup" : "Check answer";
    clearChallengeFeedback();
  }

  challenge.addEventListener("submit", event => {
    event.preventDefault();
    if (!unlocked) return;

    if (question === "angle") {
      const correctSetup = setup.mode === "single" && setup.source === "plus-z";
      const correct = correctSetup && Math.abs(theory.a.plus - 0.75) < 1e-12;
      let feedback = "Use Direct Z to select a single analyzer and a |+z⟩ source. Then try a new angle.";
      if (correctSetup) {
        const hint = theory.a.plus > 0.75 ? "Increase A’s angle." : "Decrease A’s angle.";
        feedback = correct
          ? "Correct. At 60° the half-angle is 30°, so cos²(30°) gives a 75% positive channel."
          : "At " + setup.a + "°, the model gives A+ " + percent(theory.a.plus) + ". " + hint;
      }
      write("challenge-feedback", feedback);
      find("challenge-next").hidden = !correct;
      return;
    }

    const answer = challenge.querySelector('input[name="spin-repeat-answer"]:checked');
    if (!answer) {
      write("challenge-feedback", "Choose a percentage first.");
      challenge.querySelector('input[name="spin-repeat-answer"]').focus();
      return;
    }

    const correct = Number(answer.value) === 100 * theoryFor(PRESETS.repeat).b.minus;
    write("challenge-feedback", correct
      ? "Correct. Every atom that reaches B is in |−x⟩, so a second X analyzer sends 100% of that beam to B−."
      : "Try again. A passes only its negative X eigenstate. B measures along the same axis.");
    find("challenge-restart").hidden = !correct;
  });

  challenge.addEventListener("change", clearChallengeFeedback);
  find("challenge-next").addEventListener("click", () => showQuestion("repeat"));
  find("challenge-restart").addEventListener("click", () => {
    challenge.reset();
    showQuestion("angle");
  });

  renderSetup();
  find("prediction-controls").disabled = false;
  find("static-note").hidden = true;
  find("lock").hidden = false;
}

const lesson = document.querySelector(".site-main.spin-lesson");
if (lesson) initializeLab(lesson);