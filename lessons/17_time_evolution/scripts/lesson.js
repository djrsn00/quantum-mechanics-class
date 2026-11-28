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


// ===========================================================================
// Time Evolution Arcade (optional practice). Everything below uses the te-
// prefix so it never touches the Spin precession lab above, which uses evo-.
// The whole arcade runs inside one try block: if anything in it fails, the
// lab keeps working.
// ===========================================================================

try {
  const TE_TOLERANCE = 0.002;  // typed answers, per real or imaginary part
  const TE_ANGLE_TOL = 0.002;  // typed angles, in radians
  const TE_RELATIVE = 0.005;   // answers that use measured constants (0.5%)
  const TE_DERIVED = 0.005;    // probabilities of a setting you build
  const TE_BUILD = 1;          // degrees on the Bloch sphere for a state you build
  const TE_SVG = "http://www.w3.org/2000/svg";
  const TE_TURN = 2 * Math.PI;
  const teNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

  function teFmt(value) {
    if (!Number.isFinite(value)) return "undefined";
    return teNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
  }
  // Four significant figures, for physical sizes.
  function teSig(value, digits = 4) {
    if (!Number.isFinite(value)) return "undefined";
    if (value === 0) return "0";
    return Number(value.toPrecision(digits)).toString().replace("-", "−");
  }
  // Scientific notation with a ×10ⁿ tail.
  function teSci(value, digits = 4) {
    if (!Number.isFinite(value) || value === 0) return teSig(value, digits);
    const power = Math.floor(Math.log10(Math.abs(value)));
    const mantissa = Number((value / 10 ** power).toPrecision(digits));
    const sup = String(power).replace("-", "⁻").replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
    return String(mantissa).replace("-", "−") + " × 10" + sup;
  }

  // An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
  const teTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
  const teFits = (value, answer) => Math.abs(value - answer) <= (teTerminates(answer) ? 1e-9 : TE_TOLERANCE + 1e-12);
  const teNear = (value, target, tolerance = TE_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
  const teRel = (value, target, tolerance = TE_RELATIVE) => Math.abs(value - target) <= tolerance * Math.abs(target) + 1e-15;
  // Angles in radians that differ by whole turns are equal.
  const teWrapRad = (a, turn = TE_TURN) => ((a % turn) + turn) % turn;
  const teRadGap = (a, b, turn = TE_TURN) => { const d = teWrapRad(a - b, turn); return Math.min(d, turn - d); };
  const teAngleFits = (a, b, turn = TE_TURN) => teRadGap(a, b, turn) <= TE_ANGLE_TOL + 1e-12;
  const teWrap = (degrees, turn = 360) => ((degrees % turn) + turn) % turn;
  // A time that matches target up to whole periods: t = target + kT.
  const tePeriodFits = (t, target, period) => {
    const k = Math.round((t - target) / period);
    return Math.abs(t - target - k * period) <= TE_TOLERANCE * Math.max(1, period) + 1e-12;
  };

  // Parse numbers such as 2, −1.5, 3/5, √2, 1/√2, (1 + √3)/2, π/4, 2pi, 6.6e-25,
  // and, in a time box, multiples of the period: T/4, 0.25T, 3T/8.
  // This is a small arithmetic reader (+ − × / √ π T and brackets), never eval.
  function teParse(raw, period = null) {
    const text = String(raw).trim().toLowerCase()
      .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/sqrt/g, "√").replace(/pi/g, "π")
      .replace(/°/g, "").replace(/\s+/g, "");
    if (!text || text.length > 40) return null;
    let i = 0;
    const peek = () => text[i];
    const constant = ch => ch === "π" || (ch === "t" && period !== null);
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
      if (peek() === "t" && period !== null) { i++; return period; }
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
        } else if (ch === "(" || ch === "√" || constant(ch)) {
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

  const teGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
  const teSetup = message => teGrade(false, message);

  function teLabelText(field) {
    const label = field.closest("label");
    if (!label) return field.getAttribute("aria-label") || "the selected input";
    const copy = label.cloneNode(true);
    copy.querySelectorAll("input, select, output, .te-sr-only").forEach(node => node.remove());
    const own = copy.textContent.replace(/\s+/g, " ").trim();
    const hidden = label.querySelector(".te-sr-only")?.textContent.trim() ?? "";
    return (hidden + " " + own).trim() || "the selected input";
  }

  class TeFieldError extends Error {
    constructor(field, detail = "", custom = false) {
      super("Check " + teLabelText(field) + "." + (detail ? " " + detail : ""));
      this.field = field;
      this.detail = detail;
      this.custom = custom;
    }
  }

  function teSetText(element, text) {
    text = String(text ?? "");
    if (element && element.textContent !== text) element.textContent = text;
  }

  // Radians as a multiple of π where that is exact: π/3, 3π/2.
  function teRadText(radians) {
    const k = radians / (Math.PI / 24);
    if (Math.abs(k - Math.round(k)) > 1e-9) return "≈ " + teFmt(radians);
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let n = Math.round(k), d = 24;
    if (n === 0) return "0";
    const g = gcd(Math.abs(n), d);
    n /= g; d /= g;
    const top = n === 1 ? "π" : n === -1 ? "−π" : teFmt(n) + "π";
    return d === 1 ? top : top + "/" + d;
  }
  // "= π/2" when exact, "≈ 1.2" otherwise.
  const teRadIs = radians => { const text = teRadText(radians); return text.startsWith("≈") ? text : "= " + text; };
  const teAngleText = degrees => teFmt(degrees) + "° · " + teRadText(degrees * Math.PI / 180) + " rad";
  // A multiple of T as text: T/4, 3T/8, 1.37T.
  function teTText(fraction) {
    const k = fraction * 24;
    if (Math.abs(k - Math.round(k)) > 1e-9) return teFmt(fraction) + "T";
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let n = Math.round(k), d = 24;
    if (n === 0) return "0";
    const g = gcd(Math.abs(n), d);
    n /= g; d /= g;
    const top = n === 1 ? "T" : n === -1 ? "−T" : teFmt(n) + "T";
    return d === 1 ? top : top + "/" + d;
  }


  // ---------------------------------------------------------------------------
  // Complex numbers are [real, imaginary] pairs. A ket is a list of complex
  // coordinates in the ordered basis (|+z⟩, |−z⟩); a matrix is a list of rows.
  // ---------------------------------------------------------------------------
  const teAdd = ([a, b], [c, d]) => [a + c, b + d];
  const teSub = ([a, b], [c, d]) => [a - c, b - d];
  const teMul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  const teConj = ([a, b]) => [a, -b];
  const teScale = ([a, b], k) => [a * k, b * k];
  const teAbs2 = ([a, b]) => a * a + b * b;
  const teAbs = ([a, b]) => Math.hypot(a, b);
  const teArg = ([a, b]) => Math.atan2(b, a);
  const teCis = angle => [Math.cos(angle), Math.sin(angle)];
  const teZ = v => (typeof v === "number" ? [v, 0] : v);
  const teRad = degrees => degrees * Math.PI / 180;
  const teDeg = radians => radians * 180 / Math.PI;
  const tePolar = (r, degrees) => [r * Math.cos(teRad(degrees)), r * Math.sin(teRad(degrees))];

  const teInner = (u, v) => u.reduce((sum, z, k) => teAdd(sum, teMul(teConj(z), v[k])), [0, 0]);
  const teNorm2 = v => v.reduce((sum, z) => sum + teAbs2(z), 0);
  const teNormalize = v => { const n = Math.sqrt(teNorm2(v)); return v.map(z => teScale(z, 1 / n)); };
  const teApply = (A, v) => A.map(row => row.reduce((sum, z, k) => teAdd(sum, teMul(z, v[k])), [0, 0]));
  const teMatMul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((sum, z, k) => teAdd(sum, teMul(z, B[k][j])), [0, 0])));
  const teDagger = A => A[0].map((_, j) => A.map(row => teConj(row[j])));
  const teMatAdd = (A, B) => A.map((row, i) => row.map((z, j) => teAdd(z, B[i][j])));
  const teMatSub = (A, B) => A.map((row, i) => row.map((z, j) => teSub(z, B[i][j])));
  const teMatScale = (A, c) => A.map(row => row.map(z => teMul(z, teZ(c))));
  const teMatGap = (A, B) => Math.max(...A.flatMap((row, i) => row.map((z, j) => teAbs(teSub(z, B[i][j])))));
  const teIdentity = () => [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];
  const teM = (a, b, c, d) => [[teZ(a), teZ(b)], [teZ(c), teZ(d)]];
  const TE_PAULI = { x: teM(0, 1, 1, 0), y: teM(0, [0, -1], [0, 1], 0), z: teM(1, 0, 0, -1) };

  function teCx(z) {
    const [a, b] = teZ(z);
    const re = Math.abs(a) < 5e-10 ? 0 : a, im = Math.abs(b) < 5e-10 ? 0 : b;
    if (im === 0) return teFmt(re);
    const size = Math.abs(im) === 1 ? "i" : teFmt(Math.abs(im)) + "i";
    if (re === 0) return (im < 0 ? "−" : "") + size;
    return teFmt(re) + (im < 0 ? " − " : " + ") + size;
  }
  const teMatText = A => "rows " + A.map(row => "[" + row.map(teCx).join(", ") + "]").join(", ");
  const teWhere = (i, j) => "row " + (i + 1) + ", column " + (j + 1);
  // Exact matrix entry check: returns the cells that miss, as "row r, column c".
  function teMatMisses(typed, exact) {
    const misses = [];
    exact.forEach((row, i) => row.forEach((z, j) => {
      const [re, im] = typed[i][j];
      if (!teFits(re, z[0]) || !teFits(im, z[1])) misses.push(teWhere(i, j));
    }));
    return misses;
  }
  const teMissText = misses => misses.length === 1 ? misses[0][0].toUpperCase() + misses[0].slice(1) + " is" : misses.length + " cells are";


  // ---------------------------------------------------------------------------
  // Bloch vectors and precession. A direction is given by its tilt η from +z and
  // its azimuth φ from +x toward +y, in degrees. For H = (ℏω/2) n·σ the Bloch
  // vector turns right-handedly about n through θ = ωt, and
  // U(t) = cos(θ/2) I − i sin(θ/2) n·σ.
  // ---------------------------------------------------------------------------
  const teDir = (eta, phi = 0) => [Math.sin(teRad(eta)) * Math.cos(teRad(phi)), Math.sin(teRad(eta)) * Math.sin(teRad(phi)), Math.cos(teRad(eta))];
  const teDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const teCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const teLen = v => Math.hypot(...v);
  const teUnit = v => { const r = teLen(v); return r > 1e-12 ? v.map(n => n / r) : [0, 0, 1]; };
  const teNeg = v => v.map(n => -n);
  const teBetween = (u, v) => teDeg(Math.acos(Math.max(-1, Math.min(1, teDot(teUnit(u), teUnit(v))))));
  const teSameDir = (u, v, tolerance = TE_BUILD) => teBetween(u, v) <= tolerance + 1e-9;
  const teP = (s, n) => Math.max(0, Math.min(1, (1 + teDot(s, n)) / 2));
  const teRound = (v, step) => Math.round(v / step) * step;
  // Four decimals for values written back into a box, without float tails.
  const teTidy = v => Number(v.toFixed(4));
  const teClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Rodrigues: turn v about the unit axis n by theta radians, right-handed.
  function teRotate(v, n, theta) {
    const c = Math.cos(theta), s = Math.sin(theta), k = teDot(n, v) * (1 - c), x = teCross(n, v);
    return [0, 1, 2].map(i => v[i] * c + x[i] * s + n[i] * k);
  }
  function teAngles(v) {
    const u = teUnit(v);
    const eta = teDeg(Math.acos(teClamp(u[2], -1, 1)));
    const phi = Math.hypot(u[0], u[1]) < 1e-9 ? 0 : teWrap(teDeg(Math.atan2(u[1], u[0])));
    return { eta, phi };
  }
  const TE_NAMED = [[[0, 0, 1], "+z"], [[0, 0, -1], "−z"], [[1, 0, 0], "+x"], [[-1, 0, 0], "−x"], [[0, 1, 0], "+y"], [[0, -1, 0], "−y"]];
  function teDirText(v) {
    const named = TE_NAMED.find(([d]) => teBetween(d, v) < 0.01);
    if (named) return named[1];
    const { eta, phi } = teAngles(v);
    return "η = " + teFmt(teRound(eta, 0.01)) + "°, φ = " + teFmt(teRound(phi, 0.01)) + "°";
  }
  const teVecText = v => "(" + v.map(n => teFmt(teRound(n, 0.001))).join(", ") + ")";
  const TE_STATES = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
  const TE_KETS = { "+x": "|+x⟩", "-x": "|−x⟩", "+y": "|+y⟩", "-y": "|−y⟩", "+z": "|+z⟩", "-z": "|−z⟩" };
  // n·σ for a unit direction n.
  const teNSigma = n => teMatAdd(teMatAdd(teMatScale(TE_PAULI.x, n[0]), teMatScale(TE_PAULI.y, n[1])), teMatScale(TE_PAULI.z, n[2]));
  const teU = (n, theta) => teMatAdd(teMatScale(teIdentity(), Math.cos(theta / 2)), teMatScale(teNSigma(n), [0, -Math.sin(theta / 2)]));
  // The ket cos(η/2)|+z⟩ + e^(iφ) sin(η/2)|−z⟩ for a Bloch direction.
  function teKetOf(v) {
    const { eta, phi } = teAngles(v);
    return [[Math.cos(teRad(eta) / 2), 0], tePolar(Math.sin(teRad(eta) / 2), phi)];
  }
  function teBlochOf(ket) {
    const u = teNormalize(ket), ab = teMul(teConj(u[0]), u[1]);
    return [2 * ab[0], 2 * ab[1], teAbs2(u[0]) - teAbs2(u[1])];
  }
  // Points along the precession from v about n, for path drawings.
  const tePath = (v, n, theta, steps = 64) => Array.from({ length: steps + 1 }, (_, k) => teRotate(v, n, theta * k / steps));
  const tePct = p => teFmt(teRound(100 * p, 0.01)) + "%";

  // Physical constants (CODATA 2018, exact where the SI fixes them).
  const TE_H_EV = 4.135667696e-15;     // h in eV·s
  const TE_HBAR_EV = 6.582119569e-16;  // ℏ in eV·s
  const TE_EV_J = 1.602176634e-19;     // joules per eV


  // Plot builders used by the station show() functions. A plan holds panels laid
  // out side by side, or one 3D Bloch sphere view.
  const teArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
  const tePlane = (caption, items, extra = {}) => ({ kind: "plane", caption, items, limit: 1, circle: 1, axes: ["x", "y"], ...extra });
  const teBars = (caption, items, extra = {}) => ({ kind: "bars", caption, items, ...extra });
  const teChart = (caption, extra) => ({ kind: "chart", caption, x: [0, 1], y: [0, 1], xTicks: [0, 1], yTicks: [0, 0.5, 1], xLabel: "", ...extra });
  const teSweep = (f, x0, x1, n = 160) => Array.from({ length: n + 1 }, (_, k) => {
    const x = x0 + (x1 - x0) * k / n;
    return [x, f(x)];
  });
  const teMatrixPanel = (caption, rows, extra = {}) => ({
    kind: "matrix", caption, rows: rows.map(row => row.map(z => (typeof z === "string" ? z : teCx(z)))), ...extra
  });
  const teLine = (caption, extra) => ({ kind: "line", caption, ...extra });
  const teChain = (caption, items, extra = {}) => ({ kind: "chain", caption, items, ...extra });
  const teXY = v => [v[0], v[1]];
  // A sphere view: marker is the Bloch vector; axis the field; paths are traces.
  const teSphere = (c, shown, extra = {}) => ({ yaw: c.num("yaw"), tilt: c.num("tilt"), shown, ...extra });
  const teViewDrag = (c, dx, dy) => {
    // The view sliders step by 1°.
    c.set("yaw", Math.round(teWrap(c.num("yaw") - dx * 0.5 + 180) - 180));
    c.set("tilt", Math.round(teClamp(c.num("tilt") + dy * 0.4, -60, 60)));
  };


  // ---------------------------------------------------------------------------
  // Stations 1–4 · Energy and phase, and precession in 3D.
  // ---------------------------------------------------------------------------

  // 1 · Energy Ladder. H is entered in µeV; its energies are its eigenvalues.
  function teLadderModel(c, strict = false) {
    const read = name => (strict ? c.ans(name) : c.quiet(name));
    const h11 = read("h-11"), h22 = read("h-22"), re = read("h-12-re"), im = read("h-12-im");
    if ([h11, h22, re, im].some(v => v === null)) return { ok: false };
    const mean = (h11 + h22) / 2, r = Math.hypot((h11 - h22) / 2, re, im);
    return { ok: true, h11, h22, re, im, off: Math.hypot(re, im), ep: mean + r, em: mean - r, gap: 2 * r };
  }
  // A gap in µeV as joules, ω, f and T.
  function teConvert(gap) {
    const ev = gap * 1e-6;
    return { joule: ev * TE_EV_J, omega: ev / TE_HBAR_EV, f: ev / TE_H_EV, period: TE_H_EV / ev };
  }
  const TE_LADDER = { a: [3, -1, 0, 0], b: [1, -2, 2, 0], c: [2.5, -2.5, 0, 0] };
  function teLadderGrader(key, ep, em, gap, work) {
    return c => {
      const typed = [c.ans(key + "-ep"), c.ans(key + "-em"), c.ans(key + "-gap")];
      if (!teFits(typed[0], ep) || !teFits(typed[1], em)) return teGrade(false, typed[0] < typed[1] ? "E₊ is the larger energy and E₋ the smaller." : "Not yet. Find both eigenvalues of H: the roots of the characteristic equation.");
      return teGrade(teFits(typed[2], gap), "The energies are right. ΔE = E₊ − E₋.", work);
    };
  }

  // 2 · Phase Clocks. Rates are E/ℏ in rad/ns; V is a common shift of both energies.
  const TE_CLOCK_STARTS = {
    tilt: { a: [Math.sqrt(3) / 2, 0], b: [0.5, 0], text: "(√3/2)|+z⟩ + (1/2)|−z⟩" },
    "plus-x": { a: [Math.SQRT1_2, 0], b: [Math.SQRT1_2, 0], text: "|+x⟩ = (|+z⟩ + |−z⟩)/√2" },
    "plus-y": { a: [Math.SQRT1_2, 0], b: [0, Math.SQRT1_2], text: "|+y⟩ = (|+z⟩ + i|−z⟩)/√2" }
  };
  // Wrap a phase into (−π, π].
  const teSigned = a => { const w = teWrapRad(a); return w > Math.PI ? w - TE_TURN : w; };
  function teClockModel(c) {
    const ep = c.number("ep"), em = c.number("em"), shift = c.number("shift"), t = Math.max(0, c.number("t"));
    const start = TE_CLOCK_STARTS[c.val("start")];
    const ra = ep + shift, rb = em + shift;
    const a = teMul(start.a, teCis(-ra * t)), b = teMul(start.b, teCis(-rb * t));
    const ket = [a, b];
    const px = teAbs2(teAdd(a, b)) / 2, py = teAbs2(teSub(a, teMul([0, 1], b))) / 2;
    return { ep, em, shift, t, start, ra, rb, a, b, ket, px, py, pz: teAbs2(a),
      phaseA: teSigned(teArg(a)), phaseB: teSigned(teArg(b)), rel: teSigned(teArg(b) - teArg(a)) };
  }

  // 3 · Stationary or Not? H = (ℏω/2) n·σ; time is measured in periods T.
  const TE_FIELDS = {
    x: { n: [1, 0, 0], text: "(ℏω/2)σx, field along +x" },
    y: { n: [0, 1, 0], text: "(ℏω/2)σy, field along +y" },
    n: { n: [Math.SQRT1_2, 0, Math.SQRT1_2], text: "(ℏω/2)(σx + σz)/√2, field halfway between +x and +z" }
  };
  const TE_OBS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  function teStationModel(c) {
    const field = TE_FIELDS[c.val("h")], s0 = teDir(c.number("eta"), c.number("phi")), obs = c.val("obs"), a = TE_OBS[obs];
    const curve = t => teP(teRotate(s0, field.n, TE_TURN * t), a);
    const samples = Array.from({ length: 97 }, (_, k) => curve(k / 96));
    const lo = Math.min(...samples), hi = Math.max(...samples);
    return { field, s0, obs, a, curve, lo, hi, still: hi - lo < 1e-6, aligned: teBetween(s0, field.n) < 0.5 || teBetween(s0, teNeg(field.n)) < 0.5 };
  }
  const teComm = (A, B) => teMatSub(teMatMul(A, B), teMatMul(B, A));
  function teDeckGrader(names, answers, fail, work) {
    return c => {
      const wrong = names.filter((name, k) => c.choice(name) !== answers[k]);
      return teGrade(!wrong.length, wrong.length === 1 ? "One choice is not right yet. " + fail : wrong.length + " choices are not right yet. " + fail, work);
    };
  }

  // 4 · Field Dial. Time in periods T; the Bloch vector turns about the field.
  function teDialModel(c) {
    const n = teDir(c.number("beta"), c.number("bphi")), s0 = teDir(c.number("seta"), c.number("sphi"));
    const t = Math.max(0, c.number("t")), theta = TE_TURN * t, s = teRotate(s0, n, theta);
    return { n, s0, t, theta, s, cone: teBetween(s0, n) };
  }
  const TE_DIAL_CARDS = { a: [90, 0, 0, 0], b: [90, 90, 90, 0], c: [45, 0, 0, 0], d: [60, 0, 0, 0] };
  const TE_AXES = ["+x", "-x", "+y", "-y", "+z", "-z"];
  function teDialLoad(c, check) {
    const card = TE_DIAL_CARDS[check];
    if (!card) return;
    c.set("beta", card[0]); c.set("bphi", card[1]); c.set("seta", card[2]); c.set("sphi", card[3]); c.set("t", 0);
  }

  // Play and Step for stations whose clock is a "t" dial.
  function teAdvance(c, dt, rate, top) {
    let t = c.number("t") + dt * rate;
    if (!Number.isFinite(t)) t = 0;
    if (t >= top) { t = top; c.s.playing = false; c.say("Playback stopped at the end of the time range."); }
    c.set("t", teTidy(t));
  }
  function teStep(c, step, top, unit) {
    let t = teRound(c.number("t") + step, 1e-9);
    if (!Number.isFinite(t) || t > top + 1e-9) t = 0;
    c.set("t", teTidy(t));
    return "Time t = " + teFmt(t) + unit + ".";
  }

  const teStations1 = {
    // 1 · Energy Ladder -----------------------------------------------------------------------------------
    ladder: {
      load(c, check) {
        const card = TE_LADDER[check];
        if (!card) return;
        c.set("h-11", card[0]); c.set("h-22", card[1]); c.set("h-12-re", card[2]); c.set("h-12-im", card[3]);
      },
      show(c) {
        const m = teLadderModel(c);
        if (!m.ok) {
          c.text("h-21", "?");
          c.put("state", "Fill every box of H with a number to see its energy ladder.");
          return { panels: [teMatrixPanel("H in µeV", [["?", "?"], ["?", "?"]])], caption: "incomplete H", desc: "H has an empty or unreadable entry." };
        }
        const h21 = [m.re, -m.im];
        c.text("h-21", teCx(h21));
        const conv = teConvert(m.gap);
        c.put("state", c.checked("show")
          ? "E₊ = " + teFmt(m.ep) + " µeV, E₋ = " + teFmt(m.em) + " µeV, ΔE = " + teFmt(m.gap) + " µeV."
            + (m.gap > 1e-9 ? " ΔE = " + teSci(conv.joule) + " J, ω = ΔE/ℏ = " + teSci(conv.omega) + " rad/s, f = ΔE/h = " + teSci(conv.f) + " Hz, T = h/ΔE = " + teSci(conv.period) + " s." : " The levels coincide, so nothing precesses.")
          : "H is entered. Tick Show the energies to see E₊, E₋ and the conversions, or work them out first.");
        const values = [m.ep, m.em, m.h11, m.h22];
        const lo = Math.floor(Math.min(...values)) - 1, hi = Math.ceil(Math.max(...values)) + 1;
        const span = hi - lo, every = span > 16 ? 4 : span > 8 ? 2 : 1;
        const ticks = [];
        for (let v = Math.ceil(lo / every) * every; v <= hi; v += every) ticks.push(v);
        const show = c.checked("show");
        return {
          panels: [
            teMatrixPanel("H in µeV", [[m.h11, [m.re, m.im]], [h21, m.h22]], { weight: 0.9 }),
            { kind: "levels", caption: "energy ladder (µeV)", y: [lo, hi], ticks, unit: "µeV", weight: 1.1,
              levels: [
                { value: m.h11, label: "H₁₁", tone: "guide", dashed: true, side: "left" },
                { value: m.h22, label: "H₂₂", tone: "guide", dashed: true, side: "left" },
                { value: m.ep, label: show ? "E₊ = " + teFmt(m.ep) : "E₊", tone: "plus", side: "right" },
                { value: m.em, label: show ? "E₋ = " + teFmt(m.em) : "E₋", tone: "minus", side: "right" }],
              gap: [m.em, m.ep], gapLabel: show ? "ΔE = " + teFmt(m.gap) : "ΔE" }
          ],
          caption: m.off > 1e-9 ? "off-diagonal H" : "diagonal H",
          desc: "Left: H with rows [" + teCx(m.h11) + ", " + teCx([m.re, m.im]) + "] and [" + teCx(h21) + ", " + teCx(m.h22) + "] in µeV. Right: an energy ladder with the diagonal entries as dashed lines and the two energies as solid lines"
            + (show ? " at " + teFmt(m.ep) + " and " + teFmt(m.em) + " µeV." : ". Tick Show the energies to label them.")
        };
      },
      checks: {
        a: ["For a diagonal H the basis kets are already eigenkets.", "Read the energies off the diagonal; E₊ is the larger.",
          teLadderGrader("a", 3, -1, 4, "H is diagonal, so |+z⟩ and |−z⟩ are energy eigenstates with E₊ = 3 µeV and E₋ = −1 µeV. ΔE = 3 − (−1) = 4 µeV. Only the gap matters for the motion; the next station shows why.")],
        b: ["For a 2×2 Hermitian H, E± = (H₁₁ + H₂₂)/2 ± √[((H₁₁ − H₂₂)/2)² + |H₁₂|²].", "Here (H₁₁ + H₂₂)/2 = −1/2 and ((H₁₁ − H₂₂)/2)² + |H₁₂|² = 9/4 + 4 = 25/4.",
          teLadderGrader("b", 2, -3, 5, "The characteristic equation is (1 − E)(−2 − E) − 4 = 0, so E² + E − 6 = 0 and E = 2 or −3. E₊ = 2 µeV, E₋ = −3 µeV and ΔE = 5 µeV. The diagonal entries 1 and −2 sit inside the ladder: mixing pushes the energies apart.")],
        c: ["1 eV = 1.602176634 × 10⁻¹⁹ J, ℏ = 6.582119569 × 10⁻¹⁶ eV·s, h = 4.135667696 × 10⁻¹⁵ eV·s.", "ω = ΔE/ℏ, f = ΔE/h = ω/2π and T = 1/f = h/ΔE.", c => {
          const conv = teConvert(5);
          const tests = [["c-j", conv.joule / 1e-25, "ΔE in units of 10⁻²⁵ J: multiply 5 × 10⁻⁶ eV by the joules per eV."],
            ["c-w", conv.omega / 1e9, "ω: divide ΔE in eV by ℏ in eV·s, then give it in units of 10⁹ rad/s."],
            ["c-f", conv.f / 1e9, "f: divide ΔE by h, not ℏ, and give it in GHz."],
            ["c-t", conv.period / 1e-9, "T = 1/f, in nanoseconds."]];
          for (const [name, value, fail] of tests) if (!teRel(c.ans(name), value)) return teGrade(false, fail);
          return teGrade(true, "", "ΔE = 5 × 10⁻⁶ eV × 1.602 × 10⁻¹⁹ J/eV = 8.011 × 10⁻²⁵ J. ω = 5 × 10⁻⁶ / 6.582 × 10⁻¹⁶ = 7.596 × 10⁹ rad/s. f = ω/2π = 1.209 GHz, and T = 1/f = 0.8271 ns. A few µeV is the size of a spin splitting in a laboratory magnet, and it ticks at GHz rates.");
        }],
        d: ["Keep the diagonal entries equal for an easy start: then ΔE = 2|H₁₂|.", "H₁₁ = H₂₂ = 0 and H₁₂ = 1 gives energies ±1.", c => {
          const m = teLadderModel(c, true);
          if (m.off < 0.01) return teGrade(false, "Make the off-diagonal entry H₁₂ nonzero, so |+z⟩ and |−z⟩ are not the energy eigenstates.");
          return teGrade(teNear(m.gap, 2), "Your H has ΔE = " + teFmt(m.gap) + " µeV. Adjust it to 2 µeV.",
            "Your H has E₊ = " + teFmt(m.ep) + " µeV and E₋ = " + teFmt(m.em) + " µeV, so ΔE = 2 µeV. Many matrices work: the gap is 2√[((H₁₁ − H₂₂)/2)² + |H₁₂|²], and adding the same number to both diagonal entries moves both levels without changing the gap.", "Mission complete. The checker diagonalized your H.");
        }]
      }
    },

    // 2 · Phase Clocks ------------------------------------------------------------------------------------
    clocks: {
      manual: ["t"],
      load(c, check) {
        c.set("ep", 3); c.set("em", 1); c.set("shift", 0); c.field("start").value = "tilt";
        c.set("t", check === "a" || check === "b" ? 0.5 : check === "d" ? 1 : 0);
      },
      tick: (c, dt) => teAdvance(c, dt, 0.4, 8),
      actions: {
        step: c => teStep(c, 0.25, 8, " ns"),
        zero: c => { c.set("t", 0); return "Back to t = 0."; }
      },
      show(c) {
        const m = teClockModel(c);
        if (![m.ep, m.em, m.shift, m.t].every(Number.isFinite)) {
          c.put("state", "Enter numbers for both rates, the shift and the time.");
          return { panels: [], caption: "", desc: "" };
        }
        c.put("state", "t = " + teFmt(m.t) + " ns. The |+z⟩ clock turns at (E₊ + V)/ℏ = " + teFmt(m.ra) + " rad/ns and reads arg a = " + teFmt(m.phaseA)
          + " rad. The |−z⟩ clock turns at (E₋ + V)/ℏ = " + teFmt(m.rb) + " rad/ns and reads arg b = " + teFmt(m.phaseB)
          + " rad. Relative phase arg b − arg a = " + teFmt(m.rel) + " rad (mod 2π). P(+z) = " + teFmt(m.pz) + ", P(+x) = " + teFmt(m.px) + ", P(+y) = " + teFmt(m.py) + ".");
        const trail = (z, rate) => ({ pts: Array.from({ length: 25 }, (_, k) => teMul(z, teCis(rate * Math.min(m.t, 1.5) * k / 24))), tone: "guide", dashed: true });
        return {
          panels: [
            tePlane("|+z⟩ clock: a", [teArrow(m.a, "plus", "a")], { axes: ["Re", "Im"], circle: teAbs(m.a), paths: [trail(m.a, m.ra)] }),
            tePlane("|−z⟩ clock: b", [teArrow(m.b, "minus", "b")], { axes: ["Re", "Im"], circle: teAbs(m.b), paths: [trail(m.b, m.rb)] }),
            teBars("probabilities", [{ label: "+z", value: m.pz, tone: "alpha" }, { label: "+x", value: m.px, tone: "plus" }, { label: "+y", value: m.py, tone: "beta" }], { weight: 0.9 })
          ],
          caption: "t = " + teFmt(m.t) + " ns" + (c.s.playing && !c.reduced() ? " (playing)" : ""),
          desc: "Two clock faces in the complex plane. The hand a of |+z⟩ points at " + teFmt(m.phaseA) + " rad and the hand b of |−z⟩ at " + teFmt(m.phaseB)
            + " rad; both turn clockwise, at their energy over ℏ. Dashed arcs show where each hand just came from. Bars: P(+z) = " + teFmt(m.pz) + ", P(+x) = " + teFmt(m.px) + ", P(+y) = " + teFmt(m.py) + "."
        };
      },
      checks: {
        a: ["Each amplitude gains exp(−iEt/ℏ), so its phase is −(E/ℏ)t.", "Both start real and positive, so arg a = −3 × 0.5 and arg b = −1 × 0.5.", c => {
          const pa = c.angle("a-pa"), pb = c.angle("a-pb");
          if (!teAngleFits(pa, -1.5)) return teGrade(false, "Check arg a. The clock turns clockwise, so the phase is negative.");
          return teGrade(teAngleFits(pb, -0.5), "arg a is right. Do the same for the |−z⟩ clock with E₋/ℏ = 1 rad/ns.",
            "arg a = −(E₊/ℏ)t = −3 × 0.5 = −1.5 rad and arg b = −(E₋/ℏ)t = −0.5 rad. The same angles plus whole turns, such as 4.783 rad, count too.");
        }],
        b: ["Subtract the two phases from mission 1.", "arg b − arg a = (E₊ − E₋)t/ℏ.", c => teGrade(teAngleFits(c.angle("b-rel"), 1), "Take arg b − arg a, in that order.",
          "arg b − arg a = −0.5 − (−1.5) = 1 rad = (E₊ − E₋)t/ℏ = 2 × 0.5. The relative phase grows at the gap over ℏ. It is the only phase that changes P(+x) and P(+y).")],
        c: ["Move the shift V away from 0 and watch both clocks.", "Compare the relative-phase readout and the bars before and after.", c => {
          if (Math.abs(c.number("shift")) < 0.1) return teSetup("Set a shift V/ℏ of at least 0.1 rad/ns in size first.");
          return teGrade(c.choice("c-pick") === "global", "Look at which readouts stayed the same when you moved V.",
            "Adding V to both energies multiplies the whole ket by exp(−iVt/ℏ). Both hands turn faster or slower together, so their difference, the relative phase, is unchanged, and so is every probability. Only the global phase changes.");
        }],
        d: ["The |+z⟩ clock turns at (E₊ + V)/ℏ.", "Make that rate zero, then look at the bars.", c => {
          if (!teNear(c.number("ep"), 3, 1e-9) || !teNear(c.number("em"), 1, 1e-9)) return teSetup("Use E₊/ℏ = 3 and E₋/ℏ = 1 rad/ns. Reopening the mission sets them.");
          if (!teNear(c.number("shift"), -3, TE_TOLERANCE)) return teGrade(false, "The |+z⟩ clock still turns at " + teFmt(3 + c.number("shift")) + " rad/ns. Choose V/ℏ to cancel E₊/ℏ.");
          return teGrade(c.choice("d-pick") === "same", "Compare P(+x) at 1 ns with V = 0 and with your V.",
            "With V/ℏ = −3 rad/ns the |+z⟩ clock stands still and the |−z⟩ clock turns at −2 rad/ns. That is a choice of the zero of energy. P(+x) at 1 ns is the same as with V = 0, because the relative phase still grows at 2 rad/ns.");
        }],
        e: ["The relative phase grows at (E₊ − E₋)/ℏ = 2 rad/ns.", "It is back to 0 (mod 2π) after one full turn: 2π divided by 2 rad/ns.", c => {
          const period = TE_TURN / 2, t = c.time("e-t", period);
          if (t <= 1e-9) return teGrade(false, "Give a time after the start, t > 0.");
          return teGrade(tePeriodFits(t, 0, period), "At that time the relative phase is " + teFmt(teWrapRad(2 * t)) + " rad. Find when it is a whole number of turns.",
            "The clocks line up again when (E₊ − E₋)t/ℏ = 2π, so t = π ns ≈ 3.1416 ns. That is the period T of every probability, and later realignments at 2π ns, 3π ns, … count too. The individual hands have not returned to 0 then; only their difference has.");
        }]
      }
    },

    // 3 · Stationary or Not? -------------------------------------------------------------------------------
    stationary: {
      load(c, check) {
        if (check === "a" || check === "b") c.field("h").value = "x";
        if (check === "b") { c.set("eta", 0); c.set("phi", 0); }
        if (check === "d") { c.field("h").value = "n"; c.set("eta", 90); c.set("phi", 90); }
        c.s.comm = null;
      },
      edit(c, name) { if (name === "h" || name === "obs") c.s.comm = null; },
      actions: {
        comm(c) {
          c.s.comm = c.val("obs");
          return "[H, " + c.val("obs").toUpperCase() + "] computed for the selected Hamiltonian.";
        }
      },
      show(c) {
        const m = teStationModel(c), A = m.obs.toUpperCase();
        c.put("state", "H = " + m.field.text + ". State along " + teDirText(m.s0) + ". Over one period, P(+" + m.obs + ") "
          + (m.still ? "stays at " + teFmt(m.lo) + "." : "moves between " + teFmt(m.lo) + " and " + teFmt(m.hi) + ".")
          + (m.aligned ? " This state lies along the field, so it is an energy eigenstate." : ""));
        const panels = [teChart("P(+" + m.obs + ") over two periods", { x: [0, 2], y: [0, 1], xTicks: [0, 0.5, 1, 1.5, 2], xTickText: ["0", "T/2", "T", "3T/2", "2T"], yTicks: [0, 0.5, 1],
          xLabel: "time t", series: [{ pts: teSweep(m.curve, 0, 2), tone: m.still ? "angle" : "plus" }], weight: 1.4 })];
        if (c.s.comm) {
          const K = teComm(teNSigma(m.field.n), TE_PAULI[c.s.comm]);
          panels.push(teMatrixPanel("[n·σ, " + c.s.comm.toUpperCase() + "]", K.map(row => row.map(z => [teRound(z[0], 1e-4), teRound(z[1], 1e-4)])),
            { weight: 0.9, note: teMatGap(K, teM(0, 0, 0, 0)) < 1e-9 ? "zero: they commute" : "nonzero: they don’t commute" }));
        }
        return {
          panels,
          caption: "A = " + A,
          desc: "A chart of P(+" + m.obs + ") against time over two periods for the chosen state and Hamiltonian. " + (m.still ? "The curve is flat." : "The curve oscillates between " + teFmt(m.lo) + " and " + teFmt(m.hi) + ".")
            + (c.s.comm ? " The matrix panel shows the commutator of n·σ with " + c.s.comm.toUpperCase() + "." : "")
        };
      },
      checks: {
        a: ["A state is stationary when it is an energy eigenstate: here, along ±x.", "Set each state with the dials and watch the curves for X, Y and Z.",
          teDeckGrader(["a-px", "a-mx", "a-pz", "a-py"], ["still", "still", "moves", "moves"], "Only energy eigenstates keep every probability fixed.",
            "H ∝ σx has eigenstates |+x⟩ and |−x⟩. Each gains only a global phase, so every probability stays fixed: they are stationary. |+z⟩ and |+y⟩ are superpositions of |+x⟩ and |−x⟩ with different energies, so their relative phase grows and some probabilities change.")],
        b: ["The state starts at |+z⟩ and turns about the x axis.", "Which component of the Bloch vector stays fixed during a turn about x?",
          teDeckGrader(["b-x", "b-y", "b-z"], ["fixed", "changes", "changes"], "Turn |+z⟩ about +x and watch each component.",
            "A turn about x keeps the x component fixed, here at 0, so P(+x) = 1/2 at every time. The y and z components trade places, so P(+y) and P(+z) oscillate. X commutes with H ∝ σx; Y and Z don’t. An observable that commutes with H has constant probabilities in every state.")],
        c: ["σxσz has rows [0, −1], [1, 0].", "σzσx has rows [0, 1], [−1, 0]. Subtract.", c => {
          const misses = teMatMisses(c.mat("c"), teM(0, -2, 2, 0));
          return teGrade(!misses.length, misses.length ? teMissText(misses) + " not right yet. Compute σxσz − σzσx entry by entry." : "",
            "[σx, σz] = σxσz − σzσx = rows [0, −1], [1, 0] minus rows [0, 1], [−1, 0] = rows [0, −2], [2, 0] = −2iσy. It is not zero, so for H ∝ σx the Z probabilities change in time, as the chart shows. Lesson 14 made the same test for compatibility.");
        }],
        d: ["Stationary states are the energy eigenstates: along the field or against it.", "The field points halfway between +x and +z: η = 45°, φ = 0°.", c => {
          if (c.val("h") !== "n") return teSetup("Select H = (ℏω/2)(σx + σz)/√2 first.");
          const n = TE_FIELDS.n.n, s0 = teDir(c.number("eta"), c.number("phi"));
          return teGrade(teSameDir(s0, n) || teSameDir(s0, teNeg(n)), "Your state is " + teFmt(teBetween(s0, n)) + "° from the field. Put it along the field or opposite it.",
            "A state along ±n, at η = 45°, φ = 0° or at η = 135°, φ = 180°, is an energy eigenstate of H. It gains only a global phase, so every curve is flat. Any other state turns on a cone around n.", "Mission complete. The checker tested your dial setting.");
        }]
      }
    },

    // 4 · Field Dial (3D) ---------------------------------------------------------------------------------
    dial: {
      manual: ["t"],
      load: teDialLoad,
      tick: (c, dt) => teAdvance(c, dt, 0.25, 2),
      actions: {
        step: c => teStep(c, 0.125, 2, " T"),
        zero: c => { c.set("t", 0); return "Back to t = 0."; }
      },
      drag: teViewDrag,
      keyLabel: "Bloch sphere. Arrow keys turn the field: left and right change its azimuth φ, up and down its tilt η. Shift with left or right steps time by T/8.",
      key(c, key, shift) {
        if (shift && (key === "ArrowRight" || key === "ArrowLeft")) {
          c.set("t", teTidy(teClamp(c.number("t") + (key === "ArrowRight" ? 0.125 : -0.125), 0, 2)));
          return true;
        }
        const turn = { ArrowLeft: ["bphi", -5], ArrowRight: ["bphi", 5], ArrowUp: ["beta", -5], ArrowDown: ["beta", 5] }[key];
        if (!turn) return false;
        const [name, delta] = turn;
        c.set(name, name === "bphi" ? teWrap(c.number(name) + delta) : teClamp(c.number(name) + delta, 0, 180));
        return true;
      },
      show(c) {
        const m = teDialModel(c);
        c.put("state", "Field along " + teDirText(m.n) + ". At t = " + teTText(teRound(m.t, 1e-4)) + " the Bloch vector is " + teVecText(m.s) + ", along " + teDirText(m.s)
          + ". It stays " + teFmt(teRound(m.cone, 0.01)) + "° from the field. P(+x) = " + teFmt(teP(m.s, [1, 0, 0])) + ", P(+y) = " + teFmt(teP(m.s, [0, 1, 0])) + ", P(+z) = " + teFmt(teP(m.s, [0, 0, 1])) + ".");
        return {
          sphere: teSphere(c, m.s, {
            axis: m.n,
            paths: [{ pts: tePath(m.s0, m.n, TE_TURN, 96), tone: "guide", dashed: true }, { pts: tePath(m.s0, m.n, Math.min(m.theta, 2 * TE_TURN), 96), tone: "plus" }],
            points: [{ point: m.s0, tone: "alpha", label: "start", hollow: true, size: 5 }]
          }),
          caption: "t = " + teTText(teRound(m.t, 1e-4)) + (c.s.playing && !c.reduced() ? " (playing)" : ""),
          desc: "Bloch sphere with the field arrow B along " + teDirText(m.n) + ". The state started along " + teDirText(m.s0) + " and now points along " + teDirText(m.s)
            + ". A dashed circle shows its whole cone around the field, and a solid trace shows the path so far."
        };
      },
      checks: {
        a: ["The vector turns right-handedly about the field: point your right thumb along +x.", "A quarter turn about +x takes +z to −y.", c => {
          const ok = c.choice("a-q") === "-y" && c.choice("a-h") === "-z";
          return teGrade(ok, c.val("a-q") !== "-y" ? "Check T/4. Curl your right fingers about +x, starting from +z." : "T/4 is right. Half a turn about +x takes +z where?",
            "θ = ωt, so T/4 is a quarter turn and T/2 a half turn. Right-handed about +x: +z → −y → −z → +y → +z. At T/4 the vector points along −y; at T/2 along −z, so a Z measurement then gives − with certainty.");
        }],
        b: ["Thumb along +y, fingers curl from +z toward +x … and from +x toward −z.", "y × x = −z.", c => {
          const ok = c.choice("b-q") === "-z" && c.choice("b-h") === "-x";
          return teGrade(ok, c.val("b-q") !== "-z" ? "Check T/4. Use v → n × v for a quarter turn." : "T/4 is right. After a half turn the vector points opposite its start.",
            "For a quarter turn the new vector is n × v = y × x = −z. After half a turn about +y the vector is opposite: −x. Run it with the dials to watch the circle through ±x and ±z.");
        }],
        c: ["Rodrigues: v(θ) = v cos θ + (n × v) sin θ + n(n·v)(1 − cos θ).", "At θ = π/2: v = n × v + n(n·v), with n = (1, 0, 1)/√2 and v = (0, 0, 1).", c => {
          const v = [c.ans("c-x"), c.ans("c-y"), c.ans("c-z")], want = [0.5, -Math.SQRT1_2, 0.5];
          const wrong = ["x", "y", "z"].filter((_, k) => !teFits(v[k], want[k]));
          if (wrong.length) return teGrade(false, "The " + wrong.join(", ") + " component" + (wrong.length > 1 ? "s are" : " is") + " not right yet.");
          return teGrade(c.choice("c-h") === "+x", "The T/4 vector is right. At T/2 the vector is reflected through the field axis.",
            "n × v = (0, −1/√2, 0) and n(n·v) = (1/2, 0, 1/2), so at T/4 the vector is (1/2, −√2/2, 1/2). At T/2, v = 2n(n·v) − v = (1, 0, 1) − (0, 0, 1) = (1, 0, 0) = +x. The state stays 45° from the field the whole time.");
        }],
        d: ["The angle between the state and the field never changes.", "The vector starts 60° from the field, so it gets as far as 120° from +z.", c => teGrade(teFits(c.ans("d-p"), 0.25), "Find the lowest point of the cone, then use P(+z) = (1 + z)/2.",
          "The state stays on a cone of half-angle 60° about the field. Its lowest point is 120° from +z, where z = cos 120° = −1/2, so the smallest P(+z) is (1 − 1/2)/2 = 1/4. It reaches it at T/2.")]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 5–8 · Timing, pulses, unitary evolution and the Designer.
  // ---------------------------------------------------------------------------

  // 5 · Timing Puzzles. Each scenario fixes a field, ω, a start and a measured axis.
  const TE_TIMING = {
    A: { n: [1, 0, 0], omega: Math.PI, s0: [0, 0, 1], a: [0, 0, 1], axis: "Z", text: "field along +x, ω = π rad/s, start |+z⟩, measure Z" },
    B: { n: [0, 0, 1], omega: 4 * Math.PI, s0: teDir(60, 0), a: [0, 1, 0], axis: "Y", text: "field along +z, ω = 4π rad/s, start at η = 60°, φ = 0°, measure Y" },
    C: { n: [0, 1, 0], omega: 6 * Math.PI, s0: [0, 0, 1], a: [1, 0, 0], axis: "X", text: "field along +y, ω = 6π rad/s, start |+z⟩, measure X" }
  };
  const TE_TIMING_CARD = { a: "A", b: "B", c: "C", d: "A" };
  function teTimingModel(c) {
    const card = TE_TIMING[c.val("card")], period = TE_TURN / card.omega;
    const p = t => teP(teRotate(card.s0, card.n, card.omega * t), card.a);
    return { card, period, p };
  }
  // P(+z) = 1/4 (equivalently P(−z) = 3/4) in scenario A: t = T/3 + kT or 2T/3 + kT, T = 2 s.
  const teQuarterFamily = t => t >= -1e-12 && (tePeriodFits(t, 2 / 3, 2) || tePeriodFits(t, 4 / 3, 2));

  // 6 · Pulse Workshop. A transverse field of fixed strength: ω = π/2 rad/µs, T = 4 µs.
  const TE_PULSE_OMEGA = Math.PI / 2, TE_PULSE_T = 4;
  function tePulseRun(pulses, pending = null) {
    let s = [0, 0, 1];
    const paths = [];
    for (const pulse of pulses) {
      const n = teDir(90, pulse.phi), area = TE_PULSE_OMEGA * pulse.t;
      paths.push(tePath(s, n, area, Math.max(8, Math.ceil(Math.abs(area) / 0.08))));
      s = teRotate(s, n, area);
    }
    return { s, paths, pending: pending === null ? null : teDir(90, pending) };
  }
  const tePulseText = (pulse, k) => "Pulse " + (k + 1) + ": axis φ = " + teFmt(teRound(pulse.phi, 0.01)) + "°, length " + teFmt(teRound(pulse.t, 1e-4)) + " µs, area θ "
    + teRadIs(TE_PULSE_OMEGA * pulse.t) + " rad.";
  const teAreaFits = (pulse, area) => teAngleFits(TE_PULSE_OMEGA * pulse.t, area);
  const tePulseSetup = (c, count) => c.s.pulses.length !== count ? "Apply exactly " + (count === 1 ? "one pulse" : count + " pulses") + " from |+z⟩. Clear the sequence to start again." : null;

  // 7 · Unitary Toolkit. U(t) = cos(ωt/2) I − i sin(ωt/2) n·σ for H = (ℏω/2) n·σ.
  const TE_TOOL_FIELDS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], n: [Math.SQRT1_2, 0, Math.SQRT1_2] };
  const TE_TOOL_NAMES = { x: "σx", y: "σy", z: "σz", n: "(σx + σz)/√2" };
  const TE_GAMMA = Math.LN2; // the fake evolution's leak rate, per second
  const teLeaky = t => teM(1, 0, 0, Math.exp(-TE_GAMMA * t));
  function teToolModel(c) {
    const n = TE_TOOL_FIELDS[c.val("h")], omega = c.quiet("omega");
    const period = omega && omega > 0 ? TE_TURN / omega : null;
    const t1 = period ? c.quietTime("t1", period) : null, t2 = period ? c.quietTime("t2", period) : null;
    const U = t => teU(n, omega * t);
    return { n, omega, period, t1, t2, U, name: TE_TOOL_NAMES[c.val("h")] };
  }
  const teRoundMat = A => A.map(row => row.map(z => [teRound(z[0], 1e-4), teRound(z[1], 1e-4)]));

  // 8 · Evolution Designer. Cards name a start and a target; the checker runs your choice.
  const TE_DESIGN = {
    a: { start: "+z", target: [1, 0, 0], text: "|+x⟩" },
    b: { start: "+x", target: [-1, 0, 0], text: "|−x⟩" },
    c: { start: "+z", target: [0, 1, 0], text: "|+y⟩" },
    d: { start: "+z", target: teDir(60, 0), text: "the state at η = 60°, φ = 0°" },
    e: { start: "+z", target: [1, 0, 0], text: "|+x⟩" }
  };
  function teDesignModel(c, strict = false) {
    const n = teDir(c.number("beta"), c.number("bphi")), s0 = TE_STATES[c.val("start")];
    const omega = strict ? c.ans("omega") : c.quiet("omega");
    const period = omega && omega > 0 ? TE_TURN / omega : null;
    const t = period ? (strict ? c.time("t", period) : c.quietTime("t", period)) : null;
    const ok = period !== null && t !== null;
    const s = ok ? teRotate(s0, n, omega * t) : s0;
    return { n, s0, omega, period, t, ok, s, theta: ok ? omega * t : 0 };
  }
  function teDesignGrader(key, rule = null) {
    return c => {
      const card = TE_DESIGN[key];
      if (c.val("start") !== card.start) return teSetup("Start from " + TE_KETS[card.start] + ". Reopening the card sets it.");
      const m = teDesignModel(c, true);
      if (!(m.omega > 0)) return teGrade(false, "Choose a positive ω.");
      if (m.t < 0) return teGrade(false, "Choose a time t ≥ 0.");
      const broken = rule?.(m);
      if (broken) return teGrade(false, broken);
      return teGrade(teSameDir(m.s, card.target), "Your state ends along " + teDirText(m.s) + ", " + teFmt(teRound(teBetween(m.s, card.target), 0.1)) + "° from " + card.text + ".",
        "Your field along " + teDirText(m.n) + " with ω = " + teFmt(m.omega) + " rad/s and t = " + teFmt(m.t) + " s turns the state by θ = " + teFmt(m.theta) + " rad and ends within 1° of " + card.text + ". "
        + TE_DESIGN_WORK[key], "Mission complete. The checker ran your field and time.");
    };
  }
  const TE_DESIGN_WORK = {
    a: "Two families work: a field along ±y with θ = π/2 (+y) or 3π/2 (−y), or a field along the bisector (x + z)/√2 with θ = π, which swaps +z and +x. Adding whole turns of θ = 2π works too.",
    b: "With t = 1 s, θ = ω. A field along ±z (or anywhere in the yz-plane) with ω = π rad/s turns +x halfway round to −x. ω = 3π would also turn it, but breaks the ω ≤ 5 rad/s limit.",
    c: "With the field in the xy-plane, the field must be perpendicular to both +z and +y, so along ±x: −x with θ = π/2, or +x with θ = 3π/2.",
    d: "A field along ±y turns +z within the xz-plane: +y with θ = π/3 reaches (sin 60°, 0, cos 60°) = (√3/2, 0, 1/2). Tilted fields that make +z and the target equally far from the axis work too."
  };

  const teStations2 = {
    // 5 · Timing Puzzles ----------------------------------------------------------------------------------
    timing: {
      start(c) { c.s.tries = []; },
      load(c, check) { c.field("card").value = TE_TIMING_CARD[check]; c.s.tries = []; },
      edit(c, name) { if (name === "card") c.s.tries = []; },
      actions: {
        try(c) {
          const m = teTimingModel(c), t = c.time("t", m.period);
          if (t < 0) return "Choose a time t ≥ 0.";
          c.s.tries.push(t);
          if (c.s.tries.length > 8) c.s.tries.shift();
          return "At t = " + teFmt(t) + " s = " + teFmt(teRound(t / m.period, 1e-4)) + "T, P(+" + m.card.axis.toLowerCase() + ") = " + teFmt(m.p(t)) + ".";
        },
        clear(c) { c.s.tries = []; return "Plotted times cleared."; }
      },
      show(c) {
        const m = teTimingModel(c), key = c.open(), card = c.val("card");
        const family = [];
        if (key && c.revealed(key)) {
          const roots = { a: [1 / 3, 2 / 3], d: [1 / 3, 2 / 3], b: [1 / 4], c: [1 / 4] }[key];
          for (let k = 0; k < 3; k++) for (const r of roots) family.push({ x: r + k, tone: "minus", dashed: true });
        }
        const target = { a: 0.25, d: 0.25, c: 1 }[key];
        c.put("state", "Scenario " + card + ": " + m.card.text + ". T = " + teFmt(m.period) + " s. "
          + (c.s.tries.length ? "Plotted: " + c.s.tries.map(t => "t = " + teFmt(t) + " s, P = " + teFmt(m.p(t))).join("; ") + "." : "Type a time and press Plot this time."));
        return {
          panels: [teChart("P(+" + m.card.axis.toLowerCase() + ") in scenario " + card, { x: [0, 3], y: [0, 1], xTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3],
            xTickText: ["0", "T/2", "T", "3T/2", "2T", "5T/2", "3T"], yTicks: [0, 0.25, 0.5, 0.75, 1], xLabel: "time t (T = " + teFmt(m.period) + " s)",
            series: [{ pts: teSweep(x => m.p(x * m.period), 0, 3, 240), tone: "plus" }],
            hlines: target === undefined ? [] : [{ y: target, label: "target", tone: "angle" }],
            vlines: family, dots: c.s.tries.map(t => ({ x: t / m.period, y: m.p(t), tone: "beta", label: teFmt(teRound(t, 1e-3)) + " s" })) })],
          caption: "scenario " + card,
          desc: "A chart of P(+" + m.card.axis.toLowerCase() + ") against time over three periods for scenario " + card + ". " + (c.s.tries.length ? c.s.tries.length + " plotted times are marked." : "")
            + (family.length ? " Dashed lines mark every solution in the window." : "")
        };
      },
      checks: {
        a: ["P(+z) = cos²(θ/2) = (1 + cos ωt)/2 for a turn about x from +z.", "cos ωt = −1/2 at ωt = 2π/3 and 4π/3, plus whole turns.", c => {
          if (c.val("card") !== "A") return teSetup("Select scenario A. Reopening the mission selects it.");
          const t = c.time("a-t", 2);
          if (t < 0) return teGrade(false, "Choose a time after the start, t ≥ 0.");
          return teGrade(teQuarterFamily(t), "At t = " + teFmt(t) + " s, P(+z) = " + teFmt(teTimingModel(c).p(t)) + ". Plot it to see how far off it is.",
            "1/4 = (1 + cos ωt)/2 gives cos ωt = −1/2, so ωt = 2π/3 or 4π/3 (mod 2π). With ω = π rad/s: t = 2/3 s = T/3 or t = 4/3 s = 2T/3, plus any whole number of periods T = 2 s. Every one of these is a right answer.");
        }],
        b: ["The vector circles about +z at height cos 60° = 1/2; its y component is sin 60° sin ωt.", "P(+y) = (1 + (√3/2) sin ωt)/2 is largest when ωt = π/2.", c => {
          if (c.val("card") !== "B") return teSetup("Select scenario B. Reopening the mission selects it.");
          const t = c.time("b-t", 0.5);
          if (!teFits(t, 0.125)) return teGrade(false, "Check the earliest time. The vector starts along x and reaches its largest y after a quarter turn.");
          return teGrade(teFits(c.ans("b-p"), (2 + Math.sqrt(3)) / 4), "The time is right. P(+y) = (1 + y)/2 with y = sin 60°.",
            "The vector stays 60° from the field, so its largest y component is sin 60° = √3/2, reached at ωt = π/2: t = T/4 = 0.125 s. Then P(+y) = (1 + √3/2)/2 = (2 + √3)/4 ≈ 0.933. It is never 1, because the cone never reaches +y.");
        }],
        c: ["Turning +z about +y moves it toward +x: P(+x) = (1 + sin ωt)/2.", "P(+x) = 1 when ωt = π/2 + 2πk, so t = T/4 + kT with T = 1/3 s.", c => {
          if (c.val("card") !== "C") return teSetup("Select scenario C. Reopening the mission selects it.");
          const n = c.ans("c-n"), t = c.time("c-t", 1 / 3);
          if (!teFits(n, 3)) return teGrade(false, "Count the times t = T/4 + kT that fit between 0 and 1 s.");
          return teGrade(teFits(t, 1 / 12), "The count is right. The earliest is a quarter of a period.",
            "T = 2π/6π = 1/3 s, and P(+x) = 1 at t = T/4 + kT = 1/12 s, 5/12 s and 9/12 s. The next, 13/12 s, is past 1 s. So there are 3 such times in the first second, the earliest at 1/12 s.");
        }],
        d: ["P(−z) = 3/4 is the same condition as P(+z) = 1/4.", "Combine T/3 and 2T/3 with different whole numbers of periods.", c => {
          if (c.val("card") !== "A") return teSetup("Select scenario A. Reopening the mission selects it.");
          const ts = ["d-t1", "d-t2", "d-t3"].map(name => c.time(name, 2));
          const bad = ts.findIndex(t => !teQuarterFamily(t));
          if (bad >= 0) return teGrade(false, "Time " + (bad + 1) + " gives P(−z) = " + teFmt(1 - teTimingModel(c).p(ts[bad])) + ", not 3/4.");
          if (Math.abs(ts[0] - ts[1]) < 0.01 || Math.abs(ts[0] - ts[2]) < 0.01 || Math.abs(ts[1] - ts[2]) < 0.01) return teGrade(false, "All three times work, but two are the same. Give three different times.");
          return teGrade(c.choice("d-pick") === "both", "Your times are right. Which formula lists all of them?",
            "Every solution is t = T/3 + kT or t = 2T/3 + kT for whole k ≥ 0, with T = 2 s: 2/3, 4/3, 8/3, 10/3 s, … Precession repeats each period, so each solution comes back once per T, and each period holds two.");
        }]
      }
    },

    // 6 · Pulse Workshop ----------------------------------------------------------------------------------
    pulse: {
      start(c) { c.s.pulses = []; },
      load(c, check) { c.s.pulses = []; c.set("phi", check === "d" ? 90 : 0); c.set("dur", "1"); },
      drag: teViewDrag,
      actions: {
        apply(c) {
          if (c.s.pulses.length >= 3) return "The sequence holds at most three pulses. Undo or clear first.";
          const t = c.time("dur", TE_PULSE_T);
          if (t <= 0) return "Choose a pulse length greater than 0.";
          c.s.pulses.push({ phi: c.number("phi"), t });
          return tePulseText(c.s.pulses.at(-1), c.s.pulses.length - 1) + " The state is now along " + teDirText(tePulseRun(c.s.pulses).s) + ".";
        },
        undo(c) { c.s.pulses.pop(); return c.s.pulses.length ? "Last pulse removed." : "The sequence is empty; the state is |+z⟩."; },
        clear(c) { c.s.pulses = []; return "Sequence cleared. The state is back at |+z⟩."; }
      },
      show(c) {
        const run = tePulseRun(c.s.pulses, c.number("phi"));
        c.list("pulses", c.s.pulses.map(tePulseText));
        c.put("state", (c.s.pulses.length ? c.s.pulses.length + " pulse" + (c.s.pulses.length > 1 ? "s" : "") + " applied. " : "No pulses yet; the state is |+z⟩. ")
          + "The state is " + teVecText(run.s) + ", along " + teDirText(run.s) + ". P(+z) = " + teFmt(teP(run.s, [0, 0, 1])) + ". Next pulse axis: " + teDirText(run.pending) + ".");
        const tones = ["alpha", "beta", "minus"];
        return {
          sphere: teSphere(c, run.s, { axis: run.pending, axisLabel: "next axis",
            paths: run.paths.map((pts, k) => ({ pts, tone: tones[k] })), points: [{ point: [0, 0, 1], tone: "guide", label: "start", hollow: true, size: 5 }] }),
          caption: c.s.pulses.length + " pulse" + (c.s.pulses.length === 1 ? "" : "s"),
          desc: "Bloch sphere. The state starts at +z; each applied pulse traces an arc in its own colour. The yellow arrow shows the axis of the next pulse, along " + teDirText(run.pending)
            + ". The state is now along " + teDirText(run.s) + "."
        };
      },
      checks: {
        a: ["A pulse turns the state by its area θ = ωt about an axis in the xy-plane.", "A full flip needs θ = π: t = T/2 = 2 µs.", c => {
          const setup = tePulseSetup(c, 1);
          if (setup) return teSetup(setup);
          const s = tePulseRun(c.s.pulses).s;
          return teGrade(teSameDir(s, [0, 0, -1]), "Your pulse ends along " + teDirText(s) + ". Change its length.",
            "Any axis in the xy-plane is perpendicular to +z, so a turn of θ = π carries +z to −z: a π pulse of length T/2 = 2 µs. In quantum computing this is the X (NOT) gate when the axis is +x; in MRI it inverts the magnetization.");
        }],
        b: ["A quarter turn about −x takes +z to +y.", "Or turn three quarters about +x: θ = 3π/2.", c => {
          const setup = tePulseSetup(c, 1);
          if (setup) return teSetup(setup);
          const s = tePulseRun(c.s.pulses).s;
          return teGrade(teSameDir(s, [0, 1, 0]), "Your pulse ends along " + teDirText(s) + ". Choose the axis so that +z swings toward +y.",
            "A π/2 pulse (length 1 µs) about −x (φ = 180°) takes +z to +y, since (−x) × z = +y. So does a 3π/2 pulse about +x. In MRI a π/2 pulse tips the magnetization into the transverse plane, where its precession makes the signal.");
        }],
        c: ["A π/2 pulse is T/4 = 1 µs long.", "Two π/2 pulses about the same axis add up to π.", c => {
          const setup = tePulseSetup(c, 2);
          if (setup) return teSetup(setup);
          if (!c.s.pulses.every(p => teAreaFits(p, Math.PI / 2))) return teGrade(false, "Each pulse must have area π/2: length 1 µs (or 5 µs, a whole extra turn).");
          const s = tePulseRun(c.s.pulses).s;
          return teGrade(teSameDir(s, [0, 0, -1]), "Both pulses are π/2, but the state ends along " + teDirText(s) + ". Use the same axis twice.",
            "Two π/2 pulses about the same axis make one π pulse: U(t₁)U(t₂) = U(t₁ + t₂) when the field is the same. About different axes they don’t add up to a flip: x then y leaves the state along −y.");
        }],
        d: ["Undo a turn by turning back: the same axis with the opposite sense.", "A π/2 pulse about −y (φ = 270°), or 3π/2 about +y.", c => {
          const setup = tePulseSetup(c, 2);
          if (setup) return teSetup(setup);
          const first = c.s.pulses[0];
          if (teBetween(teDir(90, first.phi), [0, 1, 0]) > TE_BUILD || !teAreaFits(first, Math.PI / 2)) return teGrade(false, "Make the first pulse a π/2 pulse about +y: φ = 90°, length 1 µs.");
          const s = tePulseRun(c.s.pulses).s;
          return teGrade(teSameDir(s, [0, 0, 1]), "After both pulses the state is along " + teDirText(s) + ", not back at +z.",
            "The first pulse takes +z to +x. A π/2 pulse about −y, or a 3π/2 pulse about +y, takes it back: U for the axis −n is U(−t) for n, the inverse. Running a pulse backward is how echoes and many quantum gates are undone.");
        }]
      }
    },

    // 7 · Unitary Toolkit ---------------------------------------------------------------------------------
    unitary: {
      start(c) { c.s.view = "u"; },
      load(c, check) {
        if (check === "a" || check === "b") { c.field("h").value = "x"; c.set("omega", "2"); c.set("t1", "π/4"); c.s.view = check === "a" ? "u" : "dag"; }
        if (check === "c") c.s.view = "comp";
        if (check === "d") { c.field("h").value = "x"; c.set("omega", "2"); c.set("t1", "0.3"); c.set("t2", ""); c.s.view = "back"; }
        if (check === "e") { c.set("t1", "1"); c.s.view = "leak"; }
      },
      actions: {
        u: c => { c.s.view = "u"; return "Showing U(t₁)."; },
        dag: c => { c.s.view = "dag"; return "Showing U(t₁)†."; },
        udu: c => { c.s.view = "udu"; return "Showing U(t₁)†U(t₁)."; },
        comp: c => { c.s.view = "comp"; return "Showing U(t₁)U(t₂) beside U(t₁ + t₂)."; },
        back: c => { c.s.view = "back"; return "Evolving |+z⟩ by t₁, then by t₂."; },
        leak: c => { c.s.view = "leak"; return "Showing the fake evolution M(t₁)."; }
      },
      show(c) {
        const m = teToolModel(c), view = c.s.view;
        if (!m.period || m.t1 === null || (["comp", "back"].includes(view) && m.t2 === null)) {
          c.put("state", "Enter a positive ω and the times the view needs (t₂ for the two-step views).");
          return { panels: [], caption: "", desc: "Some inputs are missing." };
        }
        const U1 = m.U(m.t1), head = "H = (ℏω/2)" + m.name + ", ω = " + teFmt(m.omega) + " rad/s, T = " + teFmt(m.period) + " s. ";
        if (view === "leak") {
          const M = teLeaky(m.t1), psi = teApply(M, [[Math.SQRT1_2, 0], [Math.SQRT1_2, 0]]);
          const total = teNorm2(psi);
          c.put("state", "Fake evolution M(t) = diag(1, e^(−γt)) with γ = ln 2 per second, at t₁ = " + teFmt(m.t1) + " s, applied to (|+z⟩ + |−z⟩)/√2. Total probability |a|² + |b|² = " + teFmt(total) + ". M†M has rows [1, 0], [0, " + teFmt(Math.exp(-2 * TE_GAMMA * m.t1)) + "].");
          return { panels: [teMatrixPanel("fake M(t₁)", teRoundMat(M)), teBars("after M(t₁)", [{ label: "|a|²", value: teAbs2(psi[0]), tone: "alpha" }, { label: "|b|²", value: teAbs2(psi[1]), tone: "beta" }, { label: "total", value: total, tone: total < 0.995 ? "warn" : "plus" }])],
            caption: "fake leaky evolution", desc: "The matrix M(t₁) and bars for |a|², |b|² and the total probability " + teFmt(total) + ", which falls below 1." };
        }
        if (view === "back") {
          const psi1 = teApply(U1, [[1, 0], [0, 0]]), psi2 = teApply(m.U(m.t2), psi1), back = teAbs2(teInner([[1, 0], [0, 0]], psi2));
          c.put("state", head + "|+z⟩ → U(t₁) → along " + teDirText(teBlochOf(psi1)) + " → U(t₂) → along " + teDirText(teBlochOf(psi2)) + ". |⟨+z|ψ⟩|² = " + teFmt(back) + ".");
          return { panels: [teChain("evolve, then evolve again", [{ title: "|+z⟩", sub: "start", tone: "plus" }, { title: "U(" + teFmt(m.t1) + " s)", sub: teDirText(teBlochOf(psi1)), tone: "alpha" },
            { title: "U(" + teFmt(m.t2) + " s)", sub: teDirText(teBlochOf(psi2)), tone: back > 0.99999 ? "plus" : "beta" }], { note: "|⟨+z|ψ⟩|² = " + teFmt(back) })],
            caption: "run it back", desc: "A chain: |+z⟩, then U(t₁), then U(t₂). The final overlap with the start is " + teFmt(back) + "." };
        }
        if (view === "comp") {
          const P = teMatMul(U1, m.U(m.t2)), S = m.U(m.t1 + m.t2);
          c.put("state", head + "U(t₁)U(t₂) and U(t₁ + t₂) differ by at most " + teFmt(teMatGap(P, S)) + " in any entry. U(T/4) has " + teMatText(teRoundMat(m.U(m.period / 4))) + ".");
          return { panels: [teMatrixPanel("U(t₁)U(t₂)", teRoundMat(P)), teMatrixPanel("U(t₁ + t₂)", teRoundMat(S))], caption: "composition",
            desc: "Two matrices side by side: the product U(t₁)U(t₂) and U(t₁ + t₂). They are equal." };
        }
        const shown = view === "dag" ? teDagger(U1) : view === "udu" ? teMatMul(teDagger(U1), U1) : U1;
        const label = view === "dag" ? "U(t₁)†" : view === "udu" ? "U(t₁)†U(t₁)" : "U(t₁)";
        c.put("state", head + "θ = ωt₁ " + teRadIs(m.omega * m.t1) + " rad. " + label + " has " + teMatText(teRoundMat(shown)) + "."
          + (view === "udu" ? " It is the identity: U is unitary, so every norm is kept." : ""));
        return { panels: [teMatrixPanel(label, teRoundMat(shown), { note: "entries rounded to 4 decimals" })], caption: label, desc: label + " for the chosen H and time: " + teMatText(teRoundMat(shown)) + "." };
      },
      checks: {
        a: ["U(t) = cos(θ/2) I − i sin(θ/2) σx with θ = π/2.", "cos(π/4) = sin(π/4) = 1/√2; the off-diagonal entries are −i/√2.", c => {
          const exact = teU([1, 0, 0], Math.PI / 2), misses = teMatMisses(c.mat("a"), exact);
          return teGrade(!misses.length, misses.length ? teMissText(misses) + " not right yet." : "",
            "σx has 1s off the diagonal, so U = rows [1/√2, −i/√2], [−i/√2, 1/√2]. Applied to |+z⟩ it gives (|+z⟩ − i|−z⟩)/√2 = |−y⟩, a quarter turn about +x.");
        }],
        b: ["Take the transpose, then conjugate every entry.", "Compare U(t)† with U for the opposite time.", c => {
          const misses = teMatMisses(c.mat("b"), teDagger(teU([1, 0, 0], Math.PI / 2)));
          if (misses.length) return teGrade(false, teMissText(misses) + " not right yet. Transpose U, then flip the sign of every imaginary part.");
          return teGrade(c.choice("b-pick") === "minus", "U† is right. Which U has +i off the diagonal?",
            "U† = rows [1/√2, i/√2], [i/√2, 1/√2] = cos(θ/2) I + i sin(θ/2) σx = U(−t). So U(t)†U(t) = U(−t)U(t) = I: running time backward undoes the evolution, and U is unitary.");
        }],
        c: ["U(t₁)U(t₂) = U(t₁ + t₂) for the same H.", "Pick t₁ + t₂ = T/4, for example t₁ = T/8 and t₂ = T/8 … but they must differ.", c => {
          const m = teToolModel(c);
          if (!m.period) return teSetup("Enter a positive ω first.");
          const t1 = c.time("t1", m.period), t2 = c.time("t2", m.period);
          if (Math.abs(t1) < 1e-9 || Math.abs(t2) < 1e-9 || Math.abs(t1 - t2) < TE_TOLERANCE) return teGrade(false, "Choose two different, nonzero times.");
          const gap = teMatGap(teMatMul(m.U(t1), m.U(t2)), m.U(m.period / 4));
          return teGrade(gap <= TE_TOLERANCE, "U(t₁)U(t₂) differs from U(T/4) by up to " + teFmt(gap) + " in an entry. Check the sum t₁ + t₂.",
            "Your product equals U(T/4) = U(t₁ + t₂). Evolving for t₁ and then t₂ is the same as evolving for t₁ + t₂, because H doesn’t change in time. (For spin ½, U(t + T) = −U(t), so the matrix itself repeats only every 2T; the physical state repeats every T.)", "Mission complete. The checker multiplied your matrices.");
        }],
        d: ["Undo U(t₁) with U(t₁)† = U(−t₁).", "Try t₂ = −0.3 s.", c => {
          const m = teToolModel(c);
          if (c.val("h") !== "x" || !m.period || !teNear(c.time("t1", m.period), 0.3, 1e-9)) return teSetup("Use H = (ℏω/2)σx and t₁ = 0.3 s. Reopening the mission sets them.");
          const t2 = c.time("t2", m.period), back = teAbs2(teInner([[1, 0], [0, 0]], teApply(m.U(t2), teApply(m.U(0.3), [[1, 0], [0, 0]]))));
          return teGrade(back >= 0.99999, "With that t₂ the state is not back at |+z⟩: |⟨+z|ψ⟩|² = " + teFmt(back) + ".",
            "t₂ = −0.3 s gives U(−0.3)U(0.3) = U(0) = I, so the state returns exactly. t₂ = T − 0.3 s also works, since U(T) = −I is only a global sign. Unitary evolution never loses information: it can always be run backward.");
        }],
        e: ["|a|² stays 1/2; |b|² is multiplied by e^(−2γt).", "e^(−2 ln 2) = 1/4.", c => {
          const p = c.ans("e-p");
          if (!teFits(p, 5 / 8)) return teGrade(false, "Add |a|² = 1/2 and |b|² = (1/2)e^(−2γt).");
          return teGrade(c.choice("e-pick") === "nonunitary", "The total is right. What property has M lost?",
            "After 1 s, |a|² = 1/2 and |b|² = (1/2)(1/4) = 1/8, so the total is 5/8. M†M = diag(1, e^(−2γt)) ≠ I, so M is not unitary and probability leaks away. Real time evolution under a Hermitian H is always unitary.");
        }]
      }
    },

    // 8 · Evolution Designer ------------------------------------------------------------------------------
    designer: {
      load(c, check) { c.field("start").value = TE_DESIGN[check].start; c.s.target = check === "e" ? null : TE_DESIGN[check].target; },
      drag: teViewDrag,
      show(c) {
        const m = teDesignModel(c), target = c.s.target ?? null;
        if (!m.ok) {
          c.put("state", "Enter a positive ω and a time t ≥ 0.");
          return { sphere: teSphere(c, m.s0, { axis: m.n }), caption: "", desc: "The field and start state. Enter ω and t to run the evolution." };
        }
        c.put("state", "Field along " + teDirText(m.n) + ", ω = " + teFmt(m.omega) + " rad/s, T = " + teFmt(m.period) + " s, t = " + teFmt(m.t) + " s, so θ = " + teFmt(m.theta) + " rad. "
          + "The state ends along " + teDirText(m.s) + (target ? ", " + teFmt(teRound(teBetween(m.s, target), 0.1)) + "° from the target." : "."));
        const points = [{ point: m.s0, tone: "alpha", label: "start", hollow: true, size: 5 }];
        if (target) points.push({ point: target, tone: "warn", label: "target", hollow: true, size: 8 });
        return {
          sphere: teSphere(c, m.s, { axis: m.n, paths: [{ pts: tePath(m.s0, m.n, TE_TURN, 96), tone: "guide", dashed: true }, { pts: tePath(m.s0, m.n, Math.min(m.theta, 3 * TE_TURN), 144), tone: "plus" }], points }),
          caption: "θ = " + teFmt(teRound(m.theta, 1e-3)) + " rad",
          desc: "Bloch sphere with the field along " + teDirText(m.n) + ". The state starts along " + teDirText(m.s0) + " and ends along " + teDirText(m.s) + (target ? ". A red ring marks the target." : ".")
        };
      },
      checks: {
        a: ["Turning +z to +x is a quarter turn about ±y.", "A field along +y with θ = ωt = π/2 turns +z toward +x.", teDesignGrader("a")],
        b: ["With t = 1 s, θ = ω, so you need θ = π within the limit.", "A field along +z turns +x through +y to −x.", teDesignGrader("b", m => {
          if (!teFits(m.t, 1)) return "This card fixes t = 1 s.";
          if (m.omega > 5 + 1e-9) return "This card needs ω ≤ 5 rad/s.";
          return null;
        })],
        c: ["A field in the xy-plane has η_B = 90°.", "The field must be perpendicular to both +z and +y: along ±x.", teDesignGrader("c", m => (Math.abs(m.n[2]) > Math.sin(teRad(TE_BUILD)) ? "This card needs the field in the xy-plane: η_B = 90°." : null))],
        d: ["The target is 60° from +z in the xz-plane.", "A field along +y with θ = π/3.", teDesignGrader("d")],
        e: ["Where does a state along the field go?", "|+z⟩ is an energy eigenstate of (ℏω/2)σz.", c => teGrade(c.choice("e-pick") === "no", "Try it: set the field along +z and run any time.",
          "A field along +z leaves |+z⟩ on the axis: it is an energy eigenstate and gains only a global phase. No ω or t reaches |+x⟩. The field must have a component perpendicular to the start.")]
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Stations 9–12 · Error Detective, the Two Spins preview, Spin Echo and
  // real-world precession.
  // ---------------------------------------------------------------------------

  // 9 · Error Detective. Each case has exactly one planted mistake.
  const TE_ERRORS = {
    hbar: { line: 2, text: "Case 1 · from gap to frequency", claim: "T ≈ 9.8 × 10²⁴ s", truth: "T ≈ 1.034 ns",
      work: "Line 1 is right. Line 2 drops ℏ: ω = ΔE/ℏ = (4 × 10⁻⁶ eV)/(6.582 × 10⁻¹⁶ eV·s) = 6.077 × 10⁹ rad/s. Then T = 2π/ω = 1.034 ns. Setting ω = ΔE in joules gives a number with the wrong units and a period longer than the age of the universe." },
    sign: { line: 2, text: "Case 2 · which way it turns", claim: "toward +y", truth: "toward −y",
      work: "Line 1 is right. Line 2 uses exp(+iEt/ℏ). The Schrödinger equation gives exp(−iEt/ℏ), so |ψ(t)⟩ = (e^(−iθ/2)|+x⟩ + e^(+iθ/2)|−x⟩)/√2 = cos(θ/2)|+z⟩ − i sin(θ/2)|−z⟩. At θ = π/2 that is |−y⟩: the spin turns right-handedly about +x, from +z toward −y." },
    global: { line: 4, text: "Case 3 · one full period", claim: "Z gives − with certainty", truth: "Z gives + with certainty",
      work: "Lines 1–3 are right: U(T) = −I and |ψ(T)⟩ = −|+z⟩. Line 4 treats the minus sign as physical. A global factor of −1 multiplies every amplitude, so P(+z) = |−1|² = 1. −|+z⟩ and |+z⟩ are the same physical state, and every measurement agrees." },
    half: { line: 2, text: "Case 4 · a quarter period", claim: "P(+z) = 0 at T/4", truth: "P(+z) = 1/2 at T/4",
      work: "Line 1 is right: θ = π/2. Line 2 uses cos θ for the amplitude. U(t) = cos(θ/2) I − i sin(θ/2) σx, so the amplitude of |+z⟩ is cos(θ/2) = cos(π/4) = 1/√2 and P(+z) = 1/2. The ket’s angle is half the Bloch sphere angle: at T/4 the Bloch vector has turned 90°, to −y, not 180°." },
    still: { line: 2, text: "Case 5 · an energy eigenstate", claim: "|ψ(t)⟩ = |+y⟩", truth: "|ψ(t)⟩ = e^(−iωt/2)|+y⟩",
      work: "Line 1 is right. Line 2 says the state doesn’t evolve at all. An energy eigenstate does evolve: it gains the phase exp(−iEt/ℏ) = e^(−iωt/2). That phase is global, so every probability stays fixed (line 3 is true), but line 4 follows from the wrong line 2: adding a constant V to H multiplies the ket by a further e^(−iVt/ℏ)." }
  };
  function teErrorGrader(key) {
    return c => {
      const card = TE_ERRORS[key], line = Number(c.choice(key + "-line")), kind = c.choice(key + "-kind");
      if (line !== card.line && kind === key) return teGrade(false, "That names the mistake, but it first appears on a different line.");
      if (line === card.line && kind !== key) return teGrade(false, "That is the first wrong line. Name what goes wrong there more precisely.");
      return teGrade(line === card.line && kind === key, "Check each line in order, and stop at the first one that is false.", card.work);
    };
  }

  // 10 · Quantum Preview: Two Spins. Each spin has its own field along +z and turns
  // from its start about z at its own ω. There is no interaction between them.
  const TE_TWO_STARTS = { "+x": 0, "+y": 90, "-x": 180 };
  function teTwoModel(c) {
    const wa = c.quiet("wa"), wb = c.quiet("wb"), t = Math.max(0, c.number("t"));
    const angle = (start, w) => teRad(TE_TWO_STARTS[start]) + w * t;
    const sA = Number.isFinite(wa) ? [Math.cos(angle(c.val("sa"), wa)), Math.sin(angle(c.val("sa"), wa)), 0] : null;
    const sB = Number.isFinite(wb) ? [Math.cos(angle(c.val("sb"), wb)), Math.sin(angle(c.val("sb"), wb)), 0] : null;
    const pa = sA ? teP(sA, [1, 0, 0]) : NaN, pb = sB ? teP(sB, [1, 0, 0]) : NaN;
    return { wa, wb, t, sA, sB, pa, pb, ok: Boolean(sA && sB) };
  }
  const teTwoLoaded = c => teNear(c.quiet("wa") ?? NaN, TE_TURN, 1e-9) && teNear(c.quiet("wb") ?? NaN, 3 * Math.PI, 1e-9);

  // 11 · Spin Echo. In the frame turning at the average rate, spin k drifts at δₖ.
  // A π pulse about x at τ sends each phase φ to −φ, so afterwards φ = δ(t − 2τ).
  function teEchoModel(c) {
    const spread = c.number("spread"), tau = c.number("tau"), pulse = c.checked("pulse"), t = Math.max(0, c.number("t"));
    const two = c.val("mode") === "two";
    const rates = two ? [spread, -spread] : Array.from({ length: 12 }, (_, k) => spread * (-1 + 2 * k / 11));
    const phase = (d, time) => (pulse && time > tau ? d * (time - 2 * tau) : d * time);
    const net = time => {
      const sum = rates.reduce((acc, d) => teAdd(acc, teCis(phase(d, time))), [0, 0]);
      return teScale(sum, 1 / rates.length);
    };
    return { spread, tau, pulse, t, two, rates, phase, net, ok: [spread, tau, t].every(Number.isFinite) && tau > 0 };
  }

  // 12 · Real-World Precession. |ω| = γB for a spin in a field B.
  const TE_REAL = {
    proton: { gamma: 42.577478e6, text: "a proton (hydrogen nucleus)", rate: "γ/2π = 42.577 MHz per tesla" },
    electron: { gamma: 28.0249514e9, text: "a free electron", rate: "|γ|/2π = 28.025 GHz per tesla" },
    cs: { f: 9192631770, text: "the caesium-133 clock transition", rate: "f = 9 192 631 770 Hz exactly, by the definition of the second" }
  };
  const TE_REAL_CARD = { a: ["proton", "1.5"], b: ["proton", "3"], c: ["electron", "1"], d: ["cs", "1"], e: ["proton", "50e-6"] };
  function teRealModel(c) {
    const sys = c.val("sys"), info = TE_REAL[sys], B = c.quiet("b");
    const f = sys === "cs" ? info.f : B !== null && B > 0 ? info.gamma * B : NaN;
    return { sys, info, B, f, omega: TE_TURN * f, period: 1 / f, energy: TE_H_EV * f };
  }
  const teSup = n => String(n).replace("-", "⁻").replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
  function teRealGrader(key, tests, work) {
    return c => {
      const [sys, B] = TE_REAL_CARD[key];
      if (c.val("sys") !== sys || (sys !== "cs" && !teRel(c.quiet("b") ?? NaN, Number(B), 1e-9))) return teSetup("Use the system and field the mission names. Reopening it sets them.");
      for (const [name, value, fail] of tests) if (!teRel(c.ans(name), value)) return teGrade(false, fail);
      return teGrade(true, "", work);
    };
  }

  const teStations3 = {
    // 9 · Error Detective ---------------------------------------------------------------------------------
    detective: {
      show(c) {
        const key = c.open() ?? "hbar", card = TE_ERRORS[key];
        c.put("state", c.open() ? "Case file open: " + card.text + "." : "Open a case file. Showing case 1.");
        const done = c.revealed(key);
        return {
          panels: [teChain("claimed vs actual", [
            { title: "the solution", sub: card.claim, tone: "warn" },
            { title: "actually", sub: done ? card.truth : "?", tone: "plus" }], { note: done ? "Case solved." : "The truth fills in once you solve the case." })],
          caption: card.text,
          desc: "Two boxes. The solution claims: " + card.claim + ". " + (done ? "Actually: " + card.truth + "." : "The second box fills in once the case is solved.")
        };
      },
      checks: {
        hbar: ["Line 1 is correct.", "What are the units of ω, and of ΔE?", teErrorGrader("hbar")],
        sign: ["Line 1 is correct.", "Which sign does the exponent take in U(t) = exp(−iHt/ℏ)?", teErrorGrader("sign")],
        global: ["Lines 1, 2 and 3 are correct.", "What does an overall factor of −1 do to |amplitude|²?", teErrorGrader("global")],
        half: ["Line 1 is correct.", "Which angle goes inside the cosine in U(t)?", teErrorGrader("half")],
        still: ["Line 1 is correct.", "What does exp(−iEt/ℏ) do to an eigenstate?", teErrorGrader("still")]
      }
    },

    // 10 · Quantum Preview: Two Spins ---------------------------------------------------------------------
    twospins: {
      manual: ["t"],
      load(c, check) {
        c.set("wa", "2π"); c.set("wb", "3π");
        c.field("sa").value = "+x"; c.field("sb").value = check === "b" ? "+y" : "+x";
        c.set("t", check === "b" ? 1 / 3 : 0);
      },
      tick: (c, dt) => teAdvance(c, dt, 0.25, 4),
      actions: {
        step: c => teStep(c, 1 / 12, 4, " s"),
        zero: c => { c.set("t", 0); return "Back to t = 0."; }
      },
      show(c) {
        const m = teTwoModel(c);
        if (!m.ok) {
          c.put("state", "Enter a number for each ω, such as 2π.");
          return { panels: [], caption: "", desc: "" };
        }
        const joint = [["++", m.pa * m.pb, "plus"], ["+−", m.pa * (1 - m.pb), "alpha"], ["−+", (1 - m.pa) * m.pb, "beta"], ["−−", (1 - m.pa) * (1 - m.pb), "minus"]];
        c.put("state", "t = " + teFmt(m.t) + " s. Spin A points along " + teDirText(m.sA) + ", P_A(+x) = " + teFmt(m.pa) + ". Spin B points along " + teDirText(m.sB) + ", P_B(+x) = " + teFmt(m.pb)
          + ". Measuring X on both: " + joint.map(([label, p]) => "P(" + label[0] + ", " + label[1] + ") = " + teFmt(p)).join(", ") + ".");
        const trail = (s, w) => ({ pts: Array.from({ length: 25 }, (_, k) => { const a = Math.atan2(s[1], s[0]) - w * Math.min(m.t, 0.5) * k / 24; return [Math.cos(a), Math.sin(a)]; }), tone: "guide", dashed: true });
        return {
          panels: [
            tePlane("spin A, ω_A " + teRadIs(m.wa), [teArrow(teXY(m.sA), "alpha", "A")], { paths: [trail(m.sA, m.wa)], weight: 0.9 }),
            tePlane("spin B, ω_B " + teRadIs(m.wb), [teArrow(teXY(m.sB), "beta", "B")], { paths: [trail(m.sB, m.wb)], weight: 0.9 }),
            teBars("X on both: P(A, B)", joint.map(([label, value, tone]) => ({ label, value, tone, text: teFmt(teRound(value, 0.01)) })), { weight: 1.3 })
          ],
          caption: "t = " + teFmt(m.t) + " s" + (c.s.playing && !c.reduced() ? " (playing)" : ""),
          desc: "Top views of two separate spins, each turning about its own field along +z (out of the page). A points along " + teDirText(m.sA) + " and B along " + teDirText(m.sB)
            + ". Bars give the joint probabilities for measuring X on both, each the product of the two single-spin probabilities."
        };
      },
      checks: {
        a: ["Each spin is back at its start after its own period, T = 2π/ω.", "T_A = 1 s and T_B = 2/3 s. Find the first time that is a whole number of both.", c => {
          if (!teTwoLoaded(c)) return teSetup("Use ω_A = 2π and ω_B = 3π rad/s. Reopening the mission sets them.");
          const t = c.time("a-t", 1);
          if (t <= 1e-9) return teGrade(false, "Give a time after the start.");
          return teGrade(tePeriodFits(t, 0, 1) && tePeriodFits(t, 0, 2 / 3), "At that time spin " + (tePeriodFits(t, 0, 1) ? "B" : "A") + " is not back at its start.",
            "T_A = 2π/2π = 1 s and T_B = 2π/3π = 2/3 s. Both are whole numbers of periods first at t = 2 s: two turns of A and three of B. Every multiple of 2 s works too.");
        }],
        b: ["Find each spin’s direction at t = 1/3 s, then its P(+x) = (1 + x)/2.", "For separate spins, the joint probability is the product.", c => {
          if (!teTwoLoaded(c) || c.val("sa") !== "+x" || c.val("sb") !== "+y") return teSetup("Use ω_A = 2π, ω_B = 3π, A from |+x⟩ and B from |+y⟩. Reopening the mission sets them.");
          return teGrade(teFits(c.ans("b-p"), 1 / 8), "Compute P_A(+x) and P_B(+x) at t = 1/3 s separately, then multiply.",
            "A has turned 2π/3 = 120°, so its x component is −1/2 and P_A(+x) = 1/4. B started at 90° and turned π = 180°, so it points along −y, x = 0 and P_B(+x) = 1/2. With no interaction the spins are independent, so P(+, +) = 1/4 × 1/2 = 1/8.");
        }],
        c: ["Change ω_B and watch spin A’s readout.", "Nothing in A’s evolution mentions B.", c => teGrade(c.choice("c-pick") === "same", "Change ω_B and compare P_A(+x) before and after.",
          "Each spin evolves under its own field, so P_A(+x) depends only on ω_A and t. Changing ω_B changes only B’s readings, and the joint probabilities stay products.")],
        d: ["Here H is a sum of a term for A and a term for B.", "Lesson 18 adds a term that involves both spins at once.", c => teGrade(c.choice("d-pick") === "interaction", "What kind of term in H could make A’s motion depend on B?",
          "Separate fields give H = H_A + H_B, so each spin evolves on its own. A term that involves both spins, such as a coupling between them, lets one spin’s evolution depend on the other. Building the joint state space and such interactions is Lesson 18’s topic.")]
      }
    },

    // 11 · Spin Echo --------------------------------------------------------------------------------------
    echo: {
      manual: ["t"],
      load(c, check) {
        c.field("mode").value = check === "c" ? "two" : "many";
        c.set("spread", check === "c" ? "π/4" : "0.5"); c.set("tau", 2); c.field("pulse").checked = true;
        c.set("t", check === "c" ? 2 : 0);
      },
      tick: (c, dt) => teAdvance(c, dt, 1, 12),
      actions: {
        step(c) { const m = teEchoModel(c); return teStep(c, m.ok ? m.tau / 4 : 0.5, 12, " ms"); },
        zero: c => { c.set("t", 0); return "Back to t = 0."; }
      },
      show(c) {
        const m = teEchoModel(c);
        if (!m.ok) {
          c.put("state", "Enter a spread, a pulse time τ > 0 and a time.");
          return { panels: [], caption: "", desc: "" };
        }
        const M = m.net(m.t), size = teAbs(M);
        const phases = m.rates.map(d => teSigned(m.phase(d, m.t)));
        const fanned = Math.max(...phases) - Math.min(...phases);
        c.put("state", "t = " + teFmt(m.t) + " ms. " + (m.pulse ? "π pulse at τ = " + teFmt(m.tau) + " ms" + (m.t > m.tau ? " (done)" : " (not yet)") : "No π pulse")
          + ". " + m.rates.length + " spins; the net magnetization has length |M| = " + teFmt(size) + "." + (m.two ? " The two spins are " + teFmt(teRadGap(phases[0], phases[1])) + " rad apart." : " The phases span " + teFmt(fanned) + " rad."));
        const items = m.rates.map(d => teArrow(teCis(m.phase(d, m.t)), d >= 0 ? "alpha" : "beta", "", { thin: true }));
        items.push(teArrow(M, "angle", "M", { wide: true }));
        return {
          panels: [
            tePlane("rotating frame, top view", items, { weight: 1 }),
            teChart("|M| against time", { x: [0, 12], y: [0, 1], xTicks: [0, 2, 4, 6, 8, 10, 12], yTicks: [0, 0.5, 1], xLabel: "t in ms",
              series: [{ pts: teSweep(time => teAbs(m.net(time)), 0, 12, 240), tone: "plus" }],
              vlines: [...(m.pulse ? [{ x: m.tau, tone: "warn", label: "π" }] : []), { x: m.t, tone: "angle" }], weight: 1.4 })
          ],
          caption: "t = " + teFmt(m.t) + " ms" + (c.s.playing && !c.reduced() ? " (playing)" : ""),
          desc: "Left: the spins in the frame turning at their average rate, seen from above, with blue arrows for faster spins and orange for slower ones, and the net magnetization M in yellow, of length " + teFmt(size)
            + ". Right: |M| against time" + (m.pulse ? ", with the π pulse marked at τ = " + teFmt(m.tau) + " ms." : ".")
        };
      },
      checks: {
        a: ["After the pulse each phase is δ(t − 2τ).", "Every phase is 0 again when t = 2τ.", c => teGrade(teFits(c.ans("a-t"), 4), "Use the chart: when does |M| return to 1?",
          "The π pulse at τ = 2 ms turns each phase δτ into −δτ. Each spin keeps drifting at its own δ, so its phase is δ(t − 2τ), zero for every spin at t = 2τ = 4 ms. That refocusing is the echo.")],
        b: ["At the echo every spin points the same way.", "Average twelve unit arrows that all agree.", c => teGrade(teFits(c.ans("b-m"), 1), "Look at the arrows at t = 4 ms.",
          "At t = 2τ every phase is 0, so all twelve arrows line up along +x and |M| = 1. Real echoes are a little weaker, because random changes that are not undone by the pulse still spread the spins.")],
        c: ["Each spin turns δτ = (π/4)(2) = π/2, in opposite senses.", "Their angle apart is twice that; M is the average of two unit arrows.", c => {
          const angle = c.angle("c-a");
          if (!teAngleFits(angle, Math.PI)) return teGrade(false, "Find each spin’s phase at τ, then the angle between them.");
          return teGrade(teFits(c.ans("c-m"), 0), "The angle is right. What is the average of two opposite unit arrows?",
            "At τ = 2 ms the spins have phases +π/2 and −π/2, so they are π rad (180°) apart and |M| = |cos(π/2)| = 0: the signal has vanished. The π pulse then swaps them, and they meet again at 4 ms.");
        }],
        d: ["The echo comes at 2τ.", "So τ = 3 ms, with the pulse on.", c => {
          const m = teEchoModel(c);
          if (!m.pulse) return teGrade(false, "Turn on the π pulse.");
          return teGrade(teNear(m.tau, 3, TE_TOLERANCE), "With τ = " + teFmt(m.tau) + " ms the echo comes at " + teFmt(2 * m.tau) + " ms.",
            "τ = 3 ms puts the echo at 2τ = 6 ms. The time between the pulse and the echo always equals the time between the start and the pulse.", "Mission complete. The checker read your τ.");
        }],
        e: ["Compare a fast spin’s phase just before and just after the pulse.", "After the pulse the fast spin is behind, still moving faster.", c => teGrade(c.choice("e-pick") === "reverse", "Watch one fast spin across the pulse.",
          "The π pulse sends each phase φ to −φ. A fast spin that was ahead is now just as far behind, and it keeps its faster rate, so it catches up exactly when the slow spins do, at 2τ. Spin echoes in MRI and in qubits work this way: they undo spreading that stays constant over time.")]
      }
    },

    // 12 · Real-World Precession --------------------------------------------------------------------------
    real: {
      load(c, check) { const [sys, B] = TE_REAL_CARD[check]; c.field("sys").value = sys; c.set("b", B); },
      show(c) {
        const m = teRealModel(c);
        c.reveal("b", m.sys !== "cs");
        const show = c.checked("show") && Number.isFinite(m.f);
        c.put("state", "System: " + m.info.text + ", " + m.info.rate + "." + (m.sys !== "cs" ? " B = " + (m.B === null ? "?" : teSig(m.B)) + " T." : "")
          + (show ? " f = " + teSci(m.f) + " Hz, ω = 2πf = " + teSci(m.omega) + " rad/s, T = 1/f = " + teSci(m.period) + " s, ΔE = hf = " + teSci(m.energy) + " eV."
            : " Tick Show the computed values to check your arithmetic."));
        const dot = (f, tone, label) => ({ x: Math.log10(f), tone, label, r: 7 });
        const points = [];
        const B = m.B !== null && m.B > 0 ? m.B : 1;
        points.push(dot(TE_REAL.proton.gamma * B, "plus", "proton"));
        points.push(dot(TE_REAL.electron.gamma * B, "alpha", "electron"));
        const rows = [{ label: "spins", points }, { label: "clock", points: [dot(TE_REAL.cs.f, "angle", "Cs-133")] }];
        return {
          panels: [teLine("f in Hz (log scale); spins at B = " + teSig(B) + " T", { x: [2, 11], rows, tickText: v => "10" + teSup(v) })],
          caption: m.sys === "cs" ? "Cs-133" : m.sys + " at " + teSig(B) + " T",
          desc: "A logarithmic frequency line from 100 Hz to 100 GHz. At B = " + teSig(B) + " T the proton precesses near 10^" + teFmt(teRound(Math.log10(TE_REAL.proton.gamma * B), 0.1))
            + " Hz and the electron near 10^" + teFmt(teRound(Math.log10(TE_REAL.electron.gamma * B), 0.1)) + " Hz. The caesium clock sits at 9.19 GHz."
        };
      },
      checks: {
        a: ["f = (γ/2π)B.", "T = 1/f; give it in ns.", teRealGrader("a", [["a-f", 63.866217, "f = 42.577 MHz/T × 1.5 T, in MHz."], ["a-t", 15.65773, "The frequency is right. T = 1/f, and 1/(10⁶ Hz) = 1000 ns."]],
          "f = 42.577 MHz/T × 1.5 T = 63.87 MHz, so T = 1/f = 15.66 ns. A 1.5 T MRI scanner is tuned to about 64 MHz, in the radio band.")],
        b: ["ω = 2πf = 2π(γ/2π)B.", "f = 127.73 MHz at 3 T.", teRealGrader("b", [["b-w", 8.0257, "ω = 2π × 42.577 × 10⁶ Hz/T × 3 T, in units of 10⁸ rad/s."]],
          "f = 42.577 × 3 = 127.73 MHz and ω = 2πf = 8.026 × 10⁸ rad/s. Doubling the field doubles the precession rate.")],
        c: ["f = 28.025 GHz/T × 1 T.", "Divide the electron’s rate per tesla by the proton’s.", teRealGrader("c", [["c-f", 28.0249514, "f = 28.025 GHz per tesla × 1 T, in GHz."], ["c-r", 28024.9514 / 42.577478, "The frequency is right. Divide 28 024.95 MHz by 42.577 MHz."]],
          "The electron precesses at 28.02 GHz in 1 T, about 658 times faster than a proton, because its magnetic moment is that much larger. This is electron spin resonance, in the microwave band.")],
        d: ["ΔE = hf with h = 4.135667696 × 10⁻¹⁵ eV·s.", "T = 1/f; give it in ps (10⁻¹² s).", teRealGrader("d", [["d-e", TE_H_EV * 9192631770 * 1e6, "ΔE = hf, in µeV (10⁻⁶ eV)."], ["d-t", 1e12 / 9192631770, "The energy is right. T = 1/f, in picoseconds."]],
          "ΔE = hf = 4.1357 × 10⁻¹⁵ eV·s × 9.1926 × 10⁹ Hz = 3.802 × 10⁻⁵ eV = 38.02 µeV, and T = 108.8 ps. Since 1967 the second has been defined as 9 192 631 770 periods of this transition.")],
        e: ["f = 42.577 MHz/T × 50 × 10⁻⁶ T.", "T = 1/f, in ms.", teRealGrader("e", [["e-f", 42.577478e6 * 50e-6, "f = 42.577 × 10⁶ Hz/T × 5 × 10⁻⁵ T, in Hz."], ["e-t", 1e3 / (42.577478e6 * 50e-6), "The frequency is right. T = 1/f, in milliseconds."]],
          "In Earth’s field of about 50 µT, protons precess at about 2129 Hz, an audio frequency, with T ≈ 0.47 ms. Earth’s-field NMR and proton magnetometers use exactly this signal.")]
      }
    }
  };

  const teStations = { ...teStations1, ...teStations2, ...teStations3 };

  function tePalette(root) {
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
      sphere: "#24453a"
    };
  }

  function initializeTimeArcade(root) {
    const details = root.querySelector("#time-arcade");
    if (!details) return;
    const get = id => root.querySelector("#te-" + id);
    const select = get("station"), resetButton = get("reset"), status = get("status");
    const reducedBox = get("reduced"), progress = get("progress");
    const figure = get("figure-template").content.firstElementChild.cloneNode(true);
    const toolTemplate = get("mission-template");
    const viewport = figure.querySelector("#te-viewport");
    const canvas = figure.querySelector("#te-canvas");
    const geometry = figure.querySelector("[data-te-geometry]");
    const labelLayer = figure.querySelector("[data-te-labels]");
    const desc = figure.querySelector("#te-desc");
    const title = figure.querySelector("#te-title");
    const renderStatus = figure.querySelector("#te-render-status");
    const colors = tePalette(root);
    const lifetime = new AbortController();
    const listen = (node, type, handler, options = {}) =>
      node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
    const panels = new Map(), cards = new Map(), completion = new Set();
    let active = null, plan = null;
    let graphics = null, loading = false, failed = false, contextLost = false, disposed = false;
    let frame = null, motionFrame = null, lastTick = null, drag = null;

    const say = message => teSetText(status, message ?? "");
    const updateProgress = () => teSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

    for (const panel of root.querySelectorAll("#te-panels [data-te-station]")) {
      const key = panel.dataset.teStation;
      const spec = teStations[key];
      if (!spec) continue;
      const fields = new Map([...panel.querySelectorAll("[name]")].map(field => [field.name, field]));
      const defaults = new Map([...fields].map(([name, field]) => [name, field.type === "checkbox" ? field.checked : field.value]));
      const field = name => {
        const input = fields.get(name);
        if (!input) throw new Error("Time Evolution Arcade: no field named " + name + " in station " + key + ".");
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
          const value = teParse(input.value);
          if (value === null) throw new TeFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2, π/4 or 6.6e-25.", true);
          return value;
        },
        quiet: name => teParse(field(name).value),
        // A time in seconds (or the station's unit), or a multiple of the period T.
        time(name, period) {
          const input = field(name);
          const value = teParse(input.value, period);
          if (value === null) throw new TeFieldError(input, "Enter a time such as 0.5, T/4, 0.25T or 3T/8.", true);
          return value;
        },
        quietTime: (name, period) => teParse(field(name).value, period),
        // A typed angle with its unit menu, returned in radians. π always means radians.
        angle(name) {
          const input = field(name);
          const value = teParse(input.value);
          if (value === null) throw new TeFieldError(input, "Enter an angle such as π/2, 1.5 or 90, and pick its unit.", true);
          return /π|pi/i.test(input.value) || c.val(name + "-unit") === "rad" ? value : teRad(value);
        },
        // A box that may hold π or a fraction, falling back to its paired slider mid-edit.
        number(name) {
          const value = teParse(field(name).value);
          if (value !== null) return value;
          const range = fields.get(name + "-range");
          return range ? Number(range.value) : NaN;
        },
        cx: prefix => [c.ans(prefix + "-re"), c.ans(prefix + "-im")],
        quietCx(prefix) {
          const re = c.quiet(prefix + "-re"), im = c.quiet(prefix + "-im");
          return re === null || im === null ? null : [re, im];
        },
        // A 2×2 matrix grid: cells prefix-11, prefix-12, prefix-21, prefix-22.
        mat: prefix => [[1, 2], [1, 2]].map((cols, r) => cols.map(col => c.cx(prefix + "-" + (r + 1) + col))),
        choice(name) {
          const input = field(name);
          if (!input.value) throw new TeFieldError(input, "Choose an option.");
          return input.value;
        },
        // Setting a value also moves any slider paired with that box.
        set(name, value) {
          field(name).value = String(value);
          for (const range of panel.querySelectorAll('[data-te-pair="' + name + '"]')) range.value = String(value);
        },
        put(name, text) { teSetText(c.node('[data-te-read="' + name + '"]'), text); },
        text(name, text) { for (const node of panel.querySelectorAll('[data-te-text="' + name + '"]')) teSetText(node, text); },
        reveal(name, shown) { const label = field(name).closest("label"); if (label) label.hidden = !shown; },
        list(name, lines) {
          const list = c.node('[data-te-log="' + name + '"]');
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
      for (const card of panel.querySelectorAll("[data-te-mission]")) {
        const id = card.dataset.teMission, check = id.slice(key.length + 1);
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
        for (const range of c.panel.querySelectorAll('[data-te-pair="' + name + '"]')) {
          if (Number.isFinite(Number(c.val(name)))) range.value = c.val(name);
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

    function showSvg(message) {
      canvas.hidden = true;
      viewport.dataset.renderer = "svg";
      teSetText(renderStatus, message);
    }

    function refresh() {
      if (!active || !details.open) return;
      plan = active.spec.show(active);
      for (const output of active.panel.querySelectorAll("output[data-te-for]")) {
        const value = active.val(output.dataset.teFor);
        const number = teParse(value);
        teSetText(output, number === null ? "?" : "teAngle" in output.dataset
          ? teAngleText(number)
          : teFmt(number) + (output.dataset.teUnit ?? ""));
      }
      // Play buttons show what a press would do.
      for (const button of active.panel.querySelectorAll('[data-te-action="play"]')) {
        teSetText(button, active.s.playing && !reduced() ? "Pause" : "Play");
        button.setAttribute("aria-pressed", String(Boolean(active.s.playing && !reduced())));
      }
      teSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
      teSetText(desc, plan.desc || "");
      if (plan.sphere && !graphics && !loading && !failed) loadGraphics();
      draw();
      requestMotion();
    }

    function draw() {
      if (!plan) return;
      const view = plan.sphere ?? null;
      tePaintSvg(plan, geometry, labelLayer, view);
      if (!view) {
        showSvg("SVG diagram.");
        return;
      }
      const how = active.spec.key ? " Focus the diagram and use the arrow keys to turn the field; drag or use the view sliders to turn the view." : "";
      if (!graphics || contextLost) {
        if (!loading) showSvg(failed
          ? "Three.js is unavailable here, so the sphere uses the SVG view." + (how || " Use the view sliders to turn it.")
          : "SVG view of the sphere." + (how || " Use the view sliders or drag to turn it."));
        return;
      }
      const width = viewport.clientWidth, height = viewport.clientHeight;
      if (!width || !height) return;
      try {
        graphics.draw("sphere", view, width, height, reduced());
        canvas.hidden = false;
        viewport.dataset.renderer = "webgl";
        teSetText(renderStatus, "Three.js 3D view." + (how || " Drag the sphere or use the view sliders to turn it."));
      } catch {
        graphics.dispose();
        graphics = null;
        failed = true;
        showSvg("The 3D view stopped, so the sphere uses the SVG view.");
      }
    }

    function requestFrame() {
      if (frame !== null || disposed) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (onScreen()) draw();
      });
    }

    // Stations with Play tick only while the arcade is open and on screen and
    // reduced effects are off. Every one of them also has a Step button.
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

    async function loadGraphics() {
      if (loading || graphics || disposed) return;
      loading = true;
      showSvg("SVG view. Loading the Three.js view.");
      try {
        const THREE = await import("../vendor/three.module.js");
        if (disposed) return;
        graphics = teCreateGraphics(THREE, canvas, colors);
      } catch {
        graphics = null;
        failed = true;
      } finally {
        loading = false;
      }
      draw();
    }

    function mount() {
      if (active) active.s.playing = false;
      active = panels.get(select.value) ?? panels.values().next().value;
      for (const c of panels.values()) c.panel.hidden = c !== active;
      active.node("[data-te-plot-slot]").append(figure);
      viewport.dataset.space = active.spec.drag ? "true" : "false";
      if (active.spec.key) {
        viewport.tabIndex = 0;
        viewport.setAttribute("role", "group");
        viewport.setAttribute("aria-label", active.spec.keyLabel ?? "Diagram. Arrow keys adjust the setting.");
      } else {
        viewport.removeAttribute("tabindex");
        viewport.removeAttribute("role");
        viewport.removeAttribute("aria-label");
      }
      lastTick = null;
      refresh();
    }

    function clearCard(card) {
      teSetText(card.querySelector("[data-te-feedback]"), "");
      const work = card.querySelector("[data-te-work]");
      work.hidden = true;
      work.open = false;
    }

    function showGrade(mission, result) {
      const { card, id, check, station } = mission;
      const work = card.querySelector("[data-te-work]");
      teSetText(card.querySelector("[data-te-feedback]"),
        result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
      teSetText(card.querySelector("[data-te-work-text]"), result.work || "");
      work.hidden = !result.work;
      work.open = Boolean(result.work) && !result.pass;
      if (result.pass) station.s.revealed[check] = true;
      if (result.pass && !completion.has(id)) {
        completion.add(id);
        card.querySelector("[data-te-done]").hidden = false;
        updateProgress();
      }
      say("");
    }

    function handleClick(event) {
      const button = event.target.closest("button");
      if (!button || !active || !active.panel.contains(button) || button.disabled) return;
      const missionCard = button.closest("[data-te-mission]");
      const mission = missionCard ? cards.get(missionCard.dataset.teMission) : null;
      const action = button.dataset.teAction;
      try {
        if (action === "play") {
          if (active.s.playing) { active.s.playing = false; say("Paused."); }
          else if (reduced()) say("Reduced effects are on, so Play stays still. Use Step or the time slider instead.");
          else { active.spec.play?.(active); active.s.playing = true; lastTick = null; say("Playing. Press Pause to stop."); }
        } else if (action) {
          active.s.playing = false;
          const message = active.spec.actions[action](active, mission?.check ?? null);
          if (mission) teSetText(mission.card.querySelector("[data-te-feedback]"), message ?? "");
          else if (message !== null) say(message);
        } else if (mission && button.hasAttribute("data-te-check")) {
          showGrade(mission, active.spec.checks[mission.check][2](active));
        } else if (mission && button.hasAttribute("data-te-hint")) {
          if (mission.hints >= 2) return;
          const list = mission.card.querySelector("[data-te-hint-list]");
          const item = document.createElement("li");
          teSetText(item, active.spec.checks[mission.check][mission.hints]);
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
        if (!(error instanceof TeFieldError)) throw error;
        if (mission) teSetText(mission.card.querySelector("[data-te-feedback]"), error.message);
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
      if (target.dataset.tePair) active.field(target.dataset.tePair).value = target.value;
      else for (const range of active.panel.querySelectorAll('[data-te-pair="' + target.name + '"]')) {
        const value = teParse(target.value);
        if (value !== null) range.value = String(value);
      }
      const missionCard = target.closest("[data-te-mission]");
      if (missionCard) clearCard(missionCard);
      // Moving the clock by hand pauses playback.
      if (active.s.playing && active.spec.manual?.includes(target.dataset.tePair ?? target.name)) active.s.playing = false;
      active.spec.edit?.(active, target.name, event.type);
      refresh();
    }

    // Dragging the diagram turns a 3D view.
    listen(viewport, "pointerdown", event => {
      if (!active?.spec.drag || event.button > 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
      try { viewport.setPointerCapture?.(event.pointerId); } catch { /* Capture is optional. */ }
    });
    listen(viewport, "pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      active.spec.drag(active, dx, drag.touch ? 0 : dy);
      refresh();
    });
    const endDrag = event => { if (drag && event.pointerId === drag.id) drag = null; };
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
    listen(root.querySelector("#te-arcade-link"), "click", () => { details.open = true; });

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
    if (location.hash === "#time-arcade") details.open = true;
  }

  // ---------------------------------------------------------------------------
  // SVG drawing. The viewBox is 560 × 300 and labels always stay in SVG.
  // ---------------------------------------------------------------------------

  function teNode(name, attributes = {}, text = "") {
    const node = document.createElementNS(TE_SVG, name);
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    }
    if (text) node.textContent = text;
    return node;
  }

  function tePaintSvg(plan, geometry, labels, view) {
    const shapes = [], words = [];
    if (plan.panels) teDrawPanels(plan.panels, shapes, words);
    if (view) teDrawSphere(view, shapes, words);
    geometry.replaceChildren(...shapes);
    labels.replaceChildren(...words);
  }

  function teDrawPanels(panels, shapes, words) {
    const total = panels.reduce((sum, panel) => sum + (panel.weight ?? 1), 0);
    let x = 0;
    for (const panel of panels) {
      const box = { x, w: 560 * (panel.weight ?? 1) / total };
      if (panel.kind === "plane") teDrawPlane(panel, box, shapes, words);
      else if (panel.kind === "chart") teDrawChart(panel, box, shapes, words);
      else if (panel.kind === "bars") teDrawBars(panel, box, shapes, words);
      else if (panel.kind === "matrix") teDrawMatrix(panel, box, shapes, words);
      else if (panel.kind === "line") teDrawLine(panel, box, shapes, words);
      else if (panel.kind === "chain") teDrawChain(panel, box, shapes, words);
      else if (panel.kind === "levels") teDrawLevels(panel, box, shapes, words);
      x += box.w;
    }
  }

  // Boxes joined by arrows, each with a line of detail.
  function teDrawChain(chain, box, shapes, words) {
    const n = chain.items.length, left = box.x + 10, right = box.x + box.w - 10;
    const slot = (right - left) / n, w = Math.min(slot - 22, 200), cy = 140, h = 74;
    words.push(teNode("text", { class: "te-caption", x: (left + right) / 2, y: 40, "text-anchor": "middle" }, chain.caption));
    chain.items.forEach((item, k) => {
      const cx = left + slot * (k + 0.5);
      shapes.push(teNode("rect", { class: "te-part", "data-tone": item.tone, x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 7 }));
      words.push(teNode("text", { class: "te-label", "data-tone": item.tone, x: cx, y: cy - 8, "text-anchor": "middle" }, item.title));
      if (item.sub) words.push(teNode("text", { class: "te-tick", x: cx, y: cy + 16, "text-anchor": "middle" }, item.sub));
      if (k < n - 1) {
        const x1 = cx + w / 2 + 3, x2 = cx + slot - w / 2 - 5;
        shapes.push(teNode("line", { class: "te-arrow", "data-tone": "guide", x1, y1: cy, x2: x2 - 6, y2: cy }));
        shapes.push(teNode("polygon", { class: "te-head", "data-tone": "guide", points: x2 + "," + cy + " " + (x2 - 8) + "," + (cy - 5) + " " + (x2 - 8) + "," + (cy + 5) }));
      }
    });
    if (chain.note) words.push(teNode("text", { class: "te-tick", x: (left + right) / 2, y: 270, "text-anchor": "middle" }, chain.note));
  }

  function teLabel(words, text, x, y, tone, anchor = "middle", extra = {}) {
    // Keep the whole label inside the 560-wide viewBox (about 8.5 px per character).
    const span = text.length * 8.5;
    const left = anchor === "start" ? x : anchor === "end" ? x - span : x - span / 2;
    if (left + span > 556) { x = 556; anchor = "end"; }
    else if (left < 4) { x = 4; anchor = "start"; }
    words.push(teNode("text", { class: "te-label", "data-tone": tone, x, y, "text-anchor": anchor, ...extra }, text));
  }

  function teDrawPlane(plane, box, shapes, words) {
    const size = Math.min(box.w - 20, 238), half = size / 2, cx = box.x + box.w / 2, cy = 166;
    const limit = plane.limit ?? 1, unit = (half - 10) / limit;
    const X = re => cx + re * unit, Y = im => cy - im * unit;
    shapes.push(teNode("rect", { class: "te-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
    const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
    let grid = "";
    for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
      if (k === 0) continue;
      const v = k * step;
      grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
    }
    shapes.push(teNode("path", { class: "te-grid", d: grid }));
    shapes.push(teNode("path", { class: "te-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
    if (size > 150) {
      words.push(teNode("text", { class: "te-tick", x: X(limit) - 2, y: cy + 14, "text-anchor": "end" }, plane.axes?.[0] ?? "Re"));
      words.push(teNode("text", { class: "te-tick", x: cx + 5, y: Y(limit) + 10, "text-anchor": "start" }, plane.axes?.[1] ?? "Im"));
    }
    words.push(teNode("text", { class: "te-caption", "data-tone": plane.tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
    const rings = [...(plane.circle ? [{ c: [0, 0], r: plane.circle, tone: "guide" }] : []), ...(plane.circles ?? [])];
    for (const ring of rings) {
      if (ring.r > 0) shapes.push(teNode("circle", { class: "te-ring", "data-tone": ring.tone ?? "guide", cx: X(ring.c[0]), cy: Y(ring.c[1]), r: ring.r * unit }));
    }
    for (const path of plane.paths ?? []) {
      shapes.push(teNode("polyline", { class: "te-curve" + (path.dashed ? " te-dashed" : ""), "data-tone": path.tone,
        points: path.pts.map(([re, im]) => X(re).toFixed(1) + "," + Y(im).toFixed(1)).join(" ") }));
    }
    for (const item of plane.items) {
      const from = item.from ?? [0, 0];
      const fx = X(from[0]), fy = Y(from[1]);
      const [re, im] = teAdd(from, item.z);
      const reach = Math.max(Math.abs(re), Math.abs(im));
      const clip = reach > limit ? limit / reach : 1;
      const ex = X(re * clip), ey = Y(im * clip);
      const length = Math.hypot(ex - fx, ey - fy);
      if (item.dot || length < 3) {
        shapes.push(teNode("circle", { class: "te-dot" + (item.hollow || length < 3 ? " te-hollow" : ""), "data-tone": item.tone, cx: ex, cy: ey, r: item.dot ? item.size ?? 4.5 : 5 }));
      } else {
        const ux = (ex - fx) / length, uy = (ey - fy) / length, depth = Math.min(item.thin ? 9 : 13, length * 0.6), wing = depth * 0.42;
        const bx = ex - ux * depth, by = ey - uy * depth;
        shapes.push(teNode("line", { class: "te-arrow" + (item.dashed ? " te-dashed" : "") + (item.thin ? " te-thin" : "") + (item.wide ? " te-wide" : ""), "data-tone": item.tone, x1: fx, y1: fy, x2: bx, y2: by }));
        shapes.push(teNode("polygon", { class: "te-head" + (item.dashed ? " te-hollow" : ""), "data-tone": item.tone,
          points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
      }
      if (item.label) {
        const ux = (ex - fx) / (length || 1), uy = (ey - fy) / (length || 1);
        const away = length < 3 ? [10, -10] : [ux * 12 + uy * 9, uy * 12 - ux * 9];
        const anchor = Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end";
        teLabel(words, item.label + (clip < 1 ? " (off scale)" : ""), ex + away[0], ey + away[1] + 4, item.tone, anchor);
      }
    }
  }

  function teDrawChart(chart, box, shapes, words) {
    const left = box.x + 46, right = box.x + box.w - 16, top = 40, bottom = 246;
    const [x0, x1] = chart.x, [y0, y1] = chart.y;
    const X = v => left + (v - x0) / (x1 - x0) * (right - left);
    const Y = v => bottom - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0) * (bottom - top);
    shapes.push(teNode("rect", { class: "te-frame", x: left, y: top, width: right - left, height: bottom - top }));
    let grid = "";
    for (const v of chart.xTicks) grid += "M" + X(v) + " " + top + "V" + bottom;
    for (const v of chart.yTicks) grid += "M" + left + " " + Y(v) + "H" + right;
    shapes.push(teNode("path", { class: "te-grid", d: grid }));
    const zeroY = y0 < 0 && y1 > 0 ? Y(0) : bottom;
    shapes.push(teNode("path", { class: "te-axis", d: "M" + left + " " + top + "V" + bottom + "M" + left + " " + zeroY + "H" + right }));
    const every = Math.max(1, Math.ceil(chart.xTicks.length * 34 / (right - left)));
    chart.xTicks.forEach((v, k) => {
      if (k % every === 0) words.push(teNode("text", { class: "te-tick", x: X(v), y: bottom + 16, "text-anchor": "middle" }, chart.xTickText?.[k] ?? teFmt(v)));
    });
    for (const v of chart.yTicks) words.push(teNode("text", { class: "te-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, teFmt(v)));
    words.push(teNode("text", { class: "te-tick", x: (left + right) / 2, y: bottom + 36, "text-anchor": "middle" }, chart.xLabel));
    words.push(teNode("text", { class: "te-caption", x: (left + right) / 2, y: top - 12, "text-anchor": "middle" }, chart.caption));
    for (const h of chart.hlines ?? []) {
      shapes.push(teNode("line", { class: "te-ray", "data-tone": h.tone ?? "angle", x1: left, y1: Y(h.y), x2: right, y2: Y(h.y) }));
      if (h.label) teLabel(words, h.label, right - 4, Y(h.y) - 6, h.tone ?? "angle", "end");
    }
    for (const v of chart.vlines ?? []) {
      if (v.x < x0 - 1e-9 || v.x > x1 + 1e-9) continue;
      shapes.push(teNode("line", { class: "te-ray" + (v.dashed ? "" : " te-solid"), "data-tone": v.tone ?? "angle", x1: X(v.x), y1: top, x2: X(v.x), y2: bottom }));
      if (v.label) teLabel(words, v.label, X(v.x) + 4, top + 14, v.tone ?? "angle", "start");
    }
    for (const series of chart.series ?? []) {
      shapes.push(teNode("polyline", { class: "te-curve" + (series.dashed ? " te-dashed" : ""), "data-tone": series.tone,
        points: series.pts.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join(" ") }));
      if (series.label) {
        const [lx, ly] = series.labelAt ?? series.pts.at(-1);
        teLabel(words, series.label, X(lx) + (series.labelDx ?? 6), Y(ly) + (series.labelDy ?? -6), series.tone, series.labelAnchor ?? "start");
      }
    }
    for (const dot of chart.dots ?? []) {
      if (dot.x < x0 - 1e-9 || dot.x > x1 + 1e-9) continue;
      shapes.push(teNode("circle", { class: "te-dot" + (dot.hollow ? " te-hollow" : ""), "data-tone": dot.tone, cx: X(dot.x), cy: Y(dot.y), r: dot.r ?? 5 }));
      if (dot.label) teLabel(words, dot.label, X(dot.x) + 8, Y(dot.y) - 8, dot.tone, "start");
    }
  }

  function teDrawBars(bars, box, shapes, words) {
    const left = box.x + 40, right = box.x + box.w - 10, top = 48, bottom = 246, max = bars.max ?? 1;
    const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
    let grid = "";
    for (const v of [0, max / 2, max]) {
      grid += "M" + left + " " + Y(v) + "H" + right;
      words.push(teNode("text", { class: "te-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, teFmt(v)));
    }
    shapes.push(teNode("path", { class: "te-grid", d: grid }));
    shapes.push(teNode("path", { class: "te-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
    words.push(teNode("text", { class: "te-caption", x: (left + right) / 2, y: top - 22, "text-anchor": "middle" }, bars.caption));
    const slot = (right - left) / bars.items.length;
    bars.items.forEach((bar, index) => {
      const x = left + slot * index + slot * 0.2, w = slot * 0.6, y = Y(bar.value);
      shapes.push(teNode("rect", { class: "te-bar" + (bar.outline ? " te-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: Math.max(0, bottom - y) }));
      words.push(teNode("text", { class: "te-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 20, "text-anchor": "middle" }, bar.label));
      words.push(teNode("text", { class: "te-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top - 4, y - 8), "text-anchor": "middle" }, bar.text ?? teFmt(bar.value)));
    });
  }

  // A matrix drawn as text between square brackets. Entries are strings.
  function teDrawMatrix(panel, box, shapes, words) {
    const rows = panel.rows, n = rows.length, m = rows[0].length;
    const longest = Math.max(...rows.flat().map(text => text.length), 1);
    const cell = Math.min((box.w - 40) / m, Math.max(44, longest * 9 + 16)), height = Math.min(52, 190 / n);
    const cx = box.x + box.w / 2, cy = 160, w = cell * m, h = height * n;
    const left = cx - w / 2, top = cy - h / 2;
    words.push(teNode("text", { class: "te-caption", "data-tone": panel.tone, x: cx, y: top - 22, "text-anchor": "middle" }, panel.caption));
    const bracket = (x, dir) => "M" + (x + dir * 9) + " " + (top - 6) + "H" + x + "V" + (top + h + 6) + "H" + (x + dir * 9);
    shapes.push(teNode("path", { class: "te-axis", d: bracket(left - 4, 1) + bracket(left + w + 4, -1) }));
    rows.forEach((row, i) => row.forEach((text, j) => {
      const tone = panel.tones?.[i]?.[j] ?? panel.tone ?? "ink";
      words.push(teNode("text", { class: "te-label", "data-tone": tone, x: left + cell * (j + 0.5), y: top + height * (i + 0.5) + 5, "text-anchor": "middle" }, text));
    }));
    if (panel.note) words.push(teNode("text", { class: "te-tick", x: cx, y: Math.min(286, top + h + 34), "text-anchor": "middle" }, panel.note));
  }

  // Number lines: one row each, with labelled points.
  function teDrawLine(panel, box, shapes, words) {
    const left = box.x + 70, right = box.x + box.w - 24, [x0, x1] = panel.x;
    const X = v => left + (Math.max(x0, Math.min(x1, v)) - x0) / (x1 - x0) * (right - left);
    const gap = 200 / Math.max(1, panel.rows.length), Y = k => 78 + gap * k;
    words.push(teNode("text", { class: "te-caption", x: (left + right) / 2, y: 36, "text-anchor": "middle" }, panel.caption));
    panel.rows.forEach((row, k) => {
      const y = Y(k);
      shapes.push(teNode("path", { class: "te-axis", d: "M" + left + " " + y + "H" + right }));
      let ticks = "";
      for (let v = Math.ceil(x0); v <= x1; v++) ticks += "M" + X(v) + " " + (y - 4) + "V" + (y + 4);
      shapes.push(teNode("path", { class: "te-grid", d: ticks }));
      for (let v = Math.ceil(x0); v <= x1; v += panel.every ?? 1) {
        words.push(teNode("text", { class: "te-tick", x: X(v), y: y + 20, "text-anchor": "middle" }, panel.tickText?.(v) ?? teFmt(v)));
      }
      words.push(teNode("text", { class: "te-label", "data-tone": row.tone ?? "ink", x: left - 12, y: y + 5, "text-anchor": "end" }, row.label));
      for (const point of row.points) {
        shapes.push(teNode("circle", { class: "te-dot" + (point.hollow ? " te-hollow" : ""), "data-tone": point.tone, cx: X(point.x), cy: y, r: point.r ?? 6 }));
        if (point.label) teLabel(words, point.label, X(point.x), y - 12 - (point.raise ?? 0), point.tone, "middle");
      }
    });
  }

  // An energy ladder: dashed lines for the diagonal entries of H, solid lines for
  // the energies E₊ and E₋, and a double arrow for the gap ΔE.
  function teDrawLevels(panel, box, shapes, words) {
    const top = 46, bottom = 262, left = box.x + 64, right = box.x + box.w - 20;
    const [y0, y1] = panel.y;
    const Y = v => bottom - (teClamp(v, y0, y1) - y0) / (y1 - y0) * (bottom - top);
    words.push(teNode("text", { class: "te-caption", x: (left + right) / 2, y: 28, "text-anchor": "middle" }, panel.caption));
    shapes.push(teNode("path", { class: "te-axis", d: "M" + left + " " + top + "V" + bottom }));
    for (const v of panel.ticks) {
      shapes.push(teNode("path", { class: "te-grid", d: "M" + left + " " + Y(v) + "H" + right }));
      words.push(teNode("text", { class: "te-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, teFmt(v)));
    }
    const mid = (left + right) / 2;
    for (const level of panel.levels) {
      const [a, b] = level.side === "left" ? [left + 14, mid - 12] : [mid + 12, right - 10];
      shapes.push(teNode("line", { class: "te-arrow" + (level.dashed ? " te-dashed" : ""), "data-tone": level.tone, x1: a, y1: Y(level.value), x2: b, y2: Y(level.value) }));
      teLabel(words, level.label, (a + b) / 2, Y(level.value) - 8, level.tone, "middle");
    }
    if (panel.gap) {
      const x = right - 4, ya = Y(panel.gap[1]), yb = Y(panel.gap[0]);
      if (Math.abs(yb - ya) > 18) {
        shapes.push(teNode("line", { class: "te-arrow te-thin", "data-tone": "angle", x1: x, y1: ya + 8, x2: x, y2: yb - 8 }));
        shapes.push(teNode("polygon", { class: "te-head", "data-tone": "angle", points: x + "," + ya + " " + (x - 5) + "," + (ya + 9) + " " + (x + 5) + "," + (ya + 9) }));
        shapes.push(teNode("polygon", { class: "te-head", "data-tone": "angle", points: x + "," + yb + " " + (x - 5) + "," + (yb - 9) + " " + (x + 5) + "," + (yb - 9) }));
      }
      teLabel(words, panel.gapLabel, x - 8, (ya + yb) / 2 + 5, "angle", "end");
    }
    words.push(teNode("text", { class: "te-tick", x: left + 6, y: top - 6, "text-anchor": "start" }, panel.unit));
  }

  // ---------------------------------------------------------------------------
  // The 3D Bloch sphere. World coordinates have z up. The view turns by yaw about
  // z and tilts by an elevation angle; the SVG fallback and Three.js share teFrame,
  // so SVG labels line up with the WebGL picture. Traces, cones and the field arrow
  // are drawn in the SVG label layer, so they show over the WebGL sphere.
  // ---------------------------------------------------------------------------

  const TE_VIEW = { cx: 280, cy: 152 };
  const TE_BLOCH_R = 112;

  function teFrame(yaw, tilt) {
    const y = yaw * Math.PI / 180, t = tilt * Math.PI / 180;
    return {
      right: [-Math.sin(y), Math.cos(y), 0],
      up: [-Math.sin(t) * Math.cos(y), -Math.sin(t) * Math.sin(y), Math.cos(t)],
      toward: [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)]
    };
  }
  const teProject = (frame, point, scale) => ({
    x: TE_VIEW.cx + scale * teDot(frame.right, point),
    y: TE_VIEW.cy - scale * teDot(frame.up, point),
    depth: teDot(frame.toward, point)
  });

  // A curve on the sphere split into its front and back parts.
  function teSphereCurve(P, pts, cls, tone) {
    let front = "", back = "", last = null;
    for (const point of pts) {
      const q = P(point);
      const side = q.depth >= -0.02 ? "front" : "back";
      const move = (last === side ? "L" : "M") + q.x.toFixed(1) + " " + q.y.toFixed(1);
      if (side === "front") front += move; else back += move;
      last = side;
    }
    const out = [];
    if (front) out.push(teNode("path", { class: cls, "data-tone": tone, d: front }));
    if (back) out.push(teNode("path", { class: cls + " te-back", "data-tone": tone, d: back }));
    return out;
  }

  function teDrawSphere(view, shapes, words) {
    const frame = teFrame(view.yaw, view.tilt);
    const P = point => teProject(frame, point, TE_BLOCH_R);
    shapes.push(teNode("circle", { class: "te-sphere", cx: TE_VIEW.cx, cy: TE_VIEW.cy, r: TE_BLOCH_R }));
    const circles = [t => [Math.cos(t), Math.sin(t), 0], t => [Math.cos(t), 0, Math.sin(t)], t => [0, Math.cos(t), Math.sin(t)]];
    for (const curve of circles) shapes.push(...teSphereCurve(P, Array.from({ length: 97 }, (_, k) => curve(k / 96 * TE_TURN)), "te-wire", "guide"));
    const axes = [[[0, 0, 1], "+z"], [[0, 0, -1], "−z"], [[1, 0, 0], "+x"], [[-1, 0, 0], "−x"], [[0, 1, 0], "+y"], [[0, -1, 0], "−y"]];
    for (const [direction, name] of axes) {
      const end = P(direction.map(n => n * 1.18)), start = P([0, 0, 0]);
      shapes.push(teNode("line", { class: "te-axis" + (end.depth < -0.05 ? " te-back" : ""), x1: start.x, y1: start.y, x2: end.x, y2: end.y }));
      const tag = P(direction.map(n => n * 1.34));
      words.push(teNode("text", { class: "te-tick" + (tag.depth < -0.05 ? " te-back" : ""), x: tag.x, y: tag.y + 4, "text-anchor": "middle" }, name));
    }
    // The field direction: an arrow through the centre, labelled at its tip.
    if (view.axis) {
      const a = P(view.axis.map(n => n * 1.28)), b = P(view.axis.map(n => -n * 1.1)), o = P([0, 0, 0]);
      words.push(teNode("line", { class: "te-arrow te-field", "data-tone": "angle", x1: b.x, y1: b.y, x2: a.x, y2: a.y }));
      const length = Math.hypot(a.x - o.x, a.y - o.y);
      if (length > 12) {
        const ux = (a.x - o.x) / length, uy = (a.y - o.y) / length, bx = a.x - ux * 12, by = a.y - uy * 12;
        words.push(teNode("polygon", { class: "te-head", "data-tone": "angle", points: a.x + "," + a.y + " " + (bx - uy * 5) + "," + (by + ux * 5) + " " + (bx + uy * 5) + "," + (by - ux * 5) }));
      } else words.push(teNode("circle", { class: "te-dot te-hollow", "data-tone": "angle", cx: a.x, cy: a.y, r: 7 }));
      teLabel(words, view.axisLabel ?? "B", a.x + 8, a.y - 8, "angle", "start");
    }
    for (const path of view.paths ?? []) words.push(...teSphereCurve(P, path.pts, "te-curve te-trace" + (path.dashed ? " te-dashed" : ""), path.tone));
    if (view.shown) {
      const q = P(view.shown), o = P([0, 0, 0]);
      words.push(teNode("line", { class: "te-arrow", "data-tone": "plus", x1: o.x, y1: o.y, x2: q.x, y2: q.y }));
    }
    const points = [...(view.points ?? [])];
    if (view.shown) points.push({ point: view.shown, tone: "plus", label: view.shownLabel ?? "|ψ(t)⟩", size: 7 });
    points.sort((a, b) => P(a.point).depth - P(b.point).depth);
    for (const item of points) {
      const q = P(item.point);
      words.push(teNode("circle", { class: "te-dot" + (item.hollow ? " te-hollow" : "") + (q.depth < -0.02 ? " te-back" : ""), "data-tone": item.tone, cx: q.x, cy: q.y, r: item.size ?? 4 }));
      if (item.label) words.push(teNode("text", { class: "te-label" + (q.depth < -0.02 ? " te-back" : ""), "data-tone": item.tone, x: q.x + 11, y: q.y - 9, "text-anchor": "start" }, item.label));
    }
  }

  function teCreateGraphics(THREE, canvas, colors) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    const camera = new THREE.OrthographicCamera(-TE_VIEW.cx, 560 - TE_VIEW.cx, TE_VIEW.cy, TE_VIEW.cy - 300, 1, 2000);
    camera.position.set(0, 0, 800);
    camera.lookAt(0, 0, 0);
    const disposables = [];
    const keep = item => { disposables.push(item); return item; };
    const scenes = {};

    function place(group, scale, frame) {
      group.matrix.set(
        scale * frame.right[0], scale * frame.right[1], scale * frame.right[2], 0,
        scale * frame.up[0], scale * frame.up[1], scale * frame.up[2], 0,
        scale * frame.toward[0], scale * frame.toward[1], scale * frame.toward[2], 0,
        0, 0, 0, 1);
      group.matrixWorldNeedsUpdate = true;
    }

    // The sphere body, its three great circles and the axes. The state, field and
    // traces are drawn over it in SVG.
    function buildSphere() {
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-300, 400, 600);
      scene.add(sun);
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      scene.add(group);
      group.add(new THREE.Mesh(keep(new THREE.SphereGeometry(1, 48, 32)),
        keep(new THREE.MeshLambertMaterial({ color: colors.sphere, transparent: true, opacity: 0.38, depthWrite: false }))));
      const wire = keep(new THREE.LineBasicMaterial({ color: colors.axis, transparent: true, opacity: 0.55 }));
      const ring = keep(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, k) => {
        const t = k / 96 * TE_TURN;
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
      const tip = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 20, 14)), keep(new THREE.MeshLambertMaterial({ color: colors.plus })));
      group.add(tip);
      return {
        draw(view) {
          place(group, TE_BLOCH_R, teFrame(view.yaw, view.tilt));
          tip.visible = Boolean(view.shown);
          if (view.shown) {
            tip.position.set(...view.shown);
            tip.scale.setScalar(9 / TE_BLOCH_R);
          }
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
      invalidate() { /* Geometry is rebuilt from the same buffers on the next draw. */ },
      dispose() {
        for (const item of disposables) item.dispose();
        renderer.dispose();
      }
    };
  }

  if (lesson) initializeTimeArcade(lesson);
} catch (error) {
  console.error("Time Evolution Arcade could not start.", error);
}
