const FULL_TURN = 2 * Math.PI;
const OMEGA = FULL_TURN; // radians per second
const PERIOD = FULL_TURN / OMEGA;
const QUARTER_PERIOD = PERIOD / 4;
const PLAYBACK_RATE = 0.25; // simulated seconds per real second
const INV_SQRT_2 = 1 / Math.sqrt(2);

const LANDMARKS = new Map([
  [0, { angle: "0", direction: "+x" }],
  [QUARTER_PERIOD, { angle: "π/2", direction: "+y" }],
  [2 * QUARTER_PERIOD, { angle: "π", direction: "−x" }],
  [3 * QUARTER_PERIOD, { angle: "3π/2", direction: "−y" }],
  [PERIOD, { angle: "2π", direction: "+x" }]
]);

const PREDICTION_FEEDBACK = new Map([
  ["quarter-balanced", "At T/4 the Bloch vector points along +y, so X gives 50% for each outcome. Z is balanced as you predicted. Try T/2 to see when X− becomes certain."],
  ["half-balanced", "Correct. At T/2 the Bloch vector points along −x, so X− is certain. The Z-basis amplitudes keep equal magnitudes, so either Z outcome has a 50% chance. Select |+x⟩ and jump to T/2 to check."],
  ["half-minus", "T/2 is the right wait. The Z probabilities stay at 50% each because the field changes the phases of the Z-basis amplitudes while their magnitudes stay fixed. Select |+x⟩ and jump to T/2 to compare the two rows."]
]);

function calculateState(preparation, time) {
  const isEigenstate = preparation === "plus-z";
  const theta = OMEGA * time;
  const cosine = Math.cos(theta / 2);
  const sine = Math.sin(theta / 2);
  const aScale = isEigenstate ? 1 : INV_SQRT_2;
  const bScale = isEigenstate ? 0 : INV_SQRT_2;

  // Keep both dynamical phases, including the common phase at a full turn.
  const a = { real: aScale * cosine, imaginary: -aScale * sine };
  const b = { real: bScale * cosine, imaginary: bScale * sine };
  const x = isEigenstate ? 0 : Math.cos(theta);
  const y = isEigenstate ? 0 : Math.sin(theta);
  const z = isEigenstate ? 1 : 0;
  const pXPlus = (1 + x) / 2;
  const pZPlus = (1 + z) / 2;

  return {
    isEigenstate,
    theta,
    relativePhase: isEigenstate ? null : theta % FULL_TURN,
    a,
    b,
    x,
    y,
    z,
    pXPlus,
    pXMinus: 1 - pXPlus,
    pZPlus,
    pZMinus: 1 - pZPlus
  };
}

function rounded(value, places) {
  // Converting back to a number removes the sign of a rounded zero on display.
  return Number(value.toFixed(places));
}

function formatNumber(value, places = 3) {
  return String(rounded(value, places)).replace("-", "−");
}

function formatAmplitude({ real, imaginary }) {
  const realText = rounded(real, 4).toFixed(4).replace("-", "−");
  const imaginaryRounded = rounded(imaginary, 4);
  const sign = imaginaryRounded < 0 ? "−" : "+";
  return realText + " " + sign + " " + Math.abs(imaginaryRounded).toFixed(4) + "i";
}

function formatProbability(probability) {
  const percentage = 100 * probability;
  if (percentage > 0 && percentage < 0.01) return "<0.01%";
  if (percentage < 100 && percentage > 99.99) return ">99.99%";
  return formatNumber(percentage, 2) + "%";
}

function describeState(state, time) {
  if (time === PERIOD) {
    const ket = state.isEigenstate ? "|+z⟩" : "|+x⟩";
    return "At T, the full ket is −" + ket
      + ". The common minus sign leaves the Bloch vector and all probabilities at their opening values.";
  }

  if (state.isEigenstate) {
    return "Only a has a phase because b is zero. The phase of a is global, and the measurement probabilities stay fixed.";
  }

  if (time === 0) return "The two energy components start in phase.";

  return "The two amplitudes keep equal magnitudes. Their changing relative phase changes the X probabilities while the Z probabilities stay fixed.";
}

function initializeLab(root) {
  const selectors = {
    controls: "#evo-controls",
    preparation: "#evo-preparation",
    time: "#evo-time",
    play: "#evo-play",
    step: "#evo-step",
    reset: "#evo-reset",
    motionNote: "#evo-motion-note",
    staticNote: "#evo-static-note",
    timeValue: "#evo-time-value",
    angle: "#evo-angle",
    amplitudeA: "#evo-amplitude-a",
    amplitudeB: "#evo-amplitude-b",
    relativePhase: "#evo-relative-phase",
    stateNote: "#evo-state-note",
    vectorText: "#evo-vector-text",
    pXPlus: "#evo-p-x-plus",
    pXMinus: "#evo-p-x-minus",
    pZPlus: "#evo-p-z-plus",
    pZMinus: "#evo-p-z-minus",
    prediction: "#evo-prediction",
    predictionControls: "#evo-prediction-controls",
    predictionFeedback: "#evo-prediction-feedback",
    announcement: "#evo-announcement"
  };

  const elements = Object.fromEntries(
    Object.entries(selectors).map(([name, selector]) => [name, root.querySelector(selector)])
  );
  if (Object.values(elements).some(element => !element)) return;

  const timeButtons = [...elements.controls.querySelectorAll("button[data-evo-time]")];
  const landmarkTimes = timeButtons.map(button => button.dataset.evoTime);
  const guessSelector = 'input[type="radio"][name="evo-guess"]';
  const answerValues = [...elements.prediction.querySelectorAll(guessSelector)].map(input => input.value);

  if (
    !(elements.controls instanceof HTMLFieldSetElement) ||
    !(elements.predictionControls instanceof HTMLFieldSetElement) ||
    !(elements.prediction instanceof HTMLFormElement) ||
    !(elements.preparation instanceof HTMLSelectElement) ||
    !(elements.time instanceof HTMLInputElement) ||
    elements.time.type !== "range" ||
    ![...LANDMARKS.keys()].every(time => landmarkTimes.includes(String(time))) ||
    ![...PREDICTION_FEEDBACK.keys()].every(value => answerValues.includes(value))
  ) return;

  const diagram = root.querySelector(".evo-diagram");
  const equator = diagram?.querySelector("#evo-equator-state");
  const pole = diagram?.querySelector("#evo-pole-state");
  const vector = equator?.querySelector("#evo-vector");
  const hasDiagram = Boolean(equator && pole && vector);
  if (diagram && !hasDiagram) diagram.setAttribute("hidden", "");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let preparation = "plus-x";
  let elapsed = 0;
  let frameId = null;
  let playbackStart = null;
  let playbackFrom = 0;

  function write(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function render() {
    const state = calculateState(preparation, elapsed);
    const landmark = LANDMARKS.get(elapsed);
    const angle = landmark?.angle ?? formatNumber(state.theta);
    const timeValue = elapsed.toFixed(3);
    const relativePhase = state.relativePhase === 0 ? "0" : angle;

    elements.time.value = String(elapsed);
    elements.time.setAttribute("aria-valuetext", timeValue + " seconds");
    write(elements.timeValue, timeValue + " s");
    write(elements.angle, angle + " rad");
    write(elements.amplitudeA, formatAmplitude(state.a));
    write(elements.amplitudeB, formatAmplitude(state.b));
    write(elements.relativePhase, state.isEigenstate ? "Undefined" : relativePhase + " rad");
    write(elements.stateNote, describeState(state, elapsed));
    write(elements.pXPlus, formatProbability(state.pXPlus));
    write(elements.pXMinus, formatProbability(state.pXMinus));
    write(elements.pZPlus, formatProbability(state.pZPlus));
    write(elements.pZMinus, formatProbability(state.pZMinus));

    const coordinates = [state.x, state.y, state.z].map(value => formatNumber(value)).join(", ");
    const direction = state.isEigenstate ? "+z" : landmark?.direction;
    const directionText = direction
      ? " It points along " + direction + "."
      : " It lies in the x–y plane.";
    write(elements.vectorText, "Bloch vector (x, y, z) = (" + coordinates + ")." + directionText);

    if (hasDiagram) {
      equator.toggleAttribute("hidden", state.isEigenstate);
      pole.toggleAttribute("hidden", !state.isEigenstate);
      if (!state.isEigenstate) {
        const radius = 74;
        vector.setAttribute("x2", String(160 + radius * state.x));
        vector.setAttribute("y2", String(124 - radius * state.y));
      }
    }
  }

  function setElapsed(time) {
    if (Number.isFinite(time)) elapsed = Math.min(PERIOD, Math.max(0, time));
    render();
  }

  function syncPlayButton() {
    if (frameId !== null) {
      write(elements.play, "Pause");
    } else {
      write(elements.play, elapsed === PERIOD ? "Replay" : "Play");
    }
  }

  function pause() {
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    frameId = null;
    playbackStart = null;
    syncPlayButton();
  }

  function seek(time, announce = true) {
    pause();
    setElapsed(time);
    syncPlayButton();
    if (announce) write(elements.announcement, "Elapsed time " + elapsed.toFixed(3) + " seconds.");
  }

  function advance(now) {
    if (document.hidden || reducedMotion.matches) {
      pause();
      return;
    }

    if (playbackStart === null) playbackStart = now;
    setElapsed(playbackFrom + (now - playbackStart) * PLAYBACK_RATE / 1000);

    if (elapsed === PERIOD) {
      frameId = null;
      pause();
      write(elements.announcement, "Playback stopped at T, 1 second.");
      return;
    }

    frameId = window.requestAnimationFrame(advance);
  }

  function syncMotionPreference() {
    if (reducedMotion.matches && frameId !== null) {
      pause();
      write(elements.announcement, "Playback paused because reduced motion is enabled.");
    }

    elements.play.disabled = reducedMotion.matches;
    elements.motionNote.hidden = !reducedMotion.matches;
  }

  elements.preparation.addEventListener("change", () => {
    pause();
    const selected = elements.preparation.value;
    if (selected === "plus-x" || selected === "plus-z") preparation = selected;
    elements.preparation.value = preparation;
    render();
    const ket = preparation === "plus-z" ? "|+z⟩" : "|+x⟩";
    write(elements.announcement, "Preparation " + ket + " at " + elapsed.toFixed(3) + " seconds.");
  });

  elements.time.addEventListener("focus", () => {
    if (frameId === null) return;
    pause();
    write(elements.announcement, "Playback paused for manual time control.");
  });

  elements.time.addEventListener("input", () => {
    seek(elements.time.valueAsNumber, false);
    write(elements.announcement, "");
  });

  for (const button of timeButtons) {
    const value = button.dataset.evoTime;
    const time = Number(value);
    if (!value || !LANDMARKS.has(time)) continue;
    button.addEventListener("click", () => seek(time));
  }

  elements.step.addEventListener("click", () => seek(elapsed + QUARTER_PERIOD));

  elements.play.addEventListener("click", () => {
    if (frameId !== null) {
      pause();
      write(elements.announcement, "Paused at " + elapsed.toFixed(3) + " seconds.");
      return;
    }

    if (reducedMotion.matches || document.hidden) return;
    if (document.activeElement === elements.time) elements.play.focus({ preventScroll: true });
    if (elapsed === PERIOD) setElapsed(0);
    playbackFrom = elapsed;
    playbackStart = null;
    frameId = window.requestAnimationFrame(advance);
    syncPlayButton();
    write(elements.announcement, "Playing from " + elapsed.toFixed(3) + " seconds.");
  });

  elements.reset.addEventListener("click", () => {
    preparation = "plus-x";
    elements.preparation.value = preparation;
    elements.prediction.reset();
    write(elements.predictionFeedback, "");
    seek(0, false);
    write(elements.announcement, "Reset to |+x⟩ at 0 seconds. Playback is paused.");
  });

  elements.prediction.addEventListener("change", () => write(elements.predictionFeedback, ""));
  elements.prediction.addEventListener("submit", event => {
    event.preventDefault();
    const answer = elements.prediction.querySelector(guessSelector + ":checked");
    const feedback = PREDICTION_FEEDBACK.get(answer?.value)
      ?? "Choose an answer to check your prediction.";
    write(elements.predictionFeedback, feedback);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || frameId === null) return;
    pause();
    write(elements.announcement, "Playback paused while the page was hidden.");
  });

  reducedMotion.addEventListener("change", syncMotionPreference);

  elements.preparation.value = preparation;
  elements.prediction.reset();
  render();
  syncPlayButton();
  syncMotionPreference();
  elements.controls.disabled = false;
  elements.predictionControls.disabled = false;
  elements.staticNote.hidden = true;
}

const lesson = document.querySelector(".site-main.time-evolution-lesson");
if (lesson) initializeLab(lesson);