const FULL_TURN = 360;
const AMPLITUDE = Math.SQRT1_2;

function wrapDegrees(angle) {
  return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function turn(degrees) {
  const angle = wrapDegrees(degrees);
  switch (angle) {
    case 0: return [1, 0];
    case 90: return [0, 1];
    case 180: return [-1, 0];
    case 270: return [0, -1];
    default: {
      const radians = angle * Math.PI / 180;
      return [Math.cos(radians), Math.sin(radians)];
    }
  }
}

function multiply([a, b], [c, d]) {
  return [a * c - b * d, a * d + b * c];
}

function scale([real, imaginary], factor) {
  return [real * factor, imaginary * factor];
}

function probability([real, imaginary]) {
  return Math.min(1, real * real + imaginary * imaginary);
}

function alternateBasis(relativeTurn) {
  const [cosine, sine] = relativeTurn;
  const plus = [(1 + cosine) / 2, sine / 2];
  const minus = [(1 - cosine) / 2, -sine / 2];

  return {
    plus,
    minus,
    pPlus: probability(plus),
    pMinus: probability(minus)
  };
}

function stateAt(relative, global) {
  const relativeTurn = turn(relative);
  const alphaDirection = turn(global);
  const betaDirection = multiply(alphaDirection, relativeTurn);
  const alternate = alternateBasis(relativeTurn);

  return {
    relative,
    global,
    alphaDirection,
    betaDirection,
    alpha: scale(alphaDirection, AMPLITUDE),
    beta: scale(betaDirection, AMPLITUDE),
    cPlus: multiply(alphaDirection, alternate.plus),
    cMinus: multiply(alphaDirection, alternate.minus),
    pZero: 0.5,
    pOne: 0.5,
    pPlus: alternate.pPlus,
    pMinus: alternate.pMinus
  };
}

function isZero([real, imaginary]) {
  return real === 0 && imaginary === 0;
}

function numberText(number, digits = 5) {
  return String(Number(number.toFixed(digits))).replace("-", "−");
}

function exactPart(value) {
  if (value === 0 || value === 1) return String(value);
  if (Math.abs(value - 0.5) < 1e-15) return "1/2";
  if (Math.abs(value - AMPLITUDE) < 1e-15) return "1/√2";
  return null;
}

function complexReading([real, imaginary]) {
  const re = Math.abs(real);
  const im = Math.abs(imaginary);
  const realExact = exactPart(re);
  const imagExact = exactPart(im);
  const realPart = realExact ?? numberText(re);
  const imagPart = imagExact === "1" ? "i" : imagExact ? `i/${imagExact.slice(2)}` : `${numberText(im)}i`;
  const leadingSign = (real || imaginary) < 0 ? "−" : "";

  let text;
  if (imaginary === 0) text = leadingSign + realPart;
  else if (real === 0) text = leadingSign + imagPart;
  else text = `${leadingSign}${realPart} ${imaginary < 0 ? "−" : "+"} ${imagPart}`;

  return { text, approximate: realExact === null || imagExact === null };
}

function amplitudeText(value) {
  if (isZero(value)) return "0 · no phase";
  const reading = complexReading(value);
  return `${reading.approximate ? "≈ " : ""}${reading.text}`;
}

function phaseText(degrees) {
  const exact = { 0: "0", 90: "π/2", 180: "π", 270: "3π/2", 360: "2π" };
  const radians = exact[degrees] ?? `≈ ${numberText(degrees * Math.PI / 180, 3)}`;
  return `${degrees}° · ${radians} rad`;
}

function probabilityText(value) {
  if (value === 0) return "0 · 0%";
  if (value === 0.5) return "1/2 · 50%";
  if (value === 1) return "1 · 100%";
  return `≈ ${numberText(value)} · ${numberText(100 * value, 2)}%`;
}

function percentText(value) {
  return `${numberText(100 * value, 2)}%`;
}

function attributes(node, values) {
  for (const [name, value] of Object.entries(values)) node.setAttribute(name, value);
}

function line(node, [x1, y1], [x2, y2]) {
  attributes(node, { x1, y1, x2, y2 });
}

function circle(node, [cx, cy]) {
  attributes(node, { cx, cy });
}

function diamond(node, [x, y], radius) {
  const points = [
    [x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]
  ];
  node.setAttribute("points", points.map(point => point.join(",")).join(" "));
}

function planeCoordinates(svg) {
  const x = Number(svg.dataset.originX);
  const y = Number(svg.dataset.originY);
  const unit = Number(svg.dataset.unit);

  return {
    origin: [x, y],
    point: ([real, imaginary], size = unit) => [x + real * size, y - imaginary * size]
  };
}

function drawAmplitudes(svg, find, state) {
  const { origin, point } = planeCoordinates(svg);
  const endAlpha = point(state.alpha);
  const endBeta = point(state.beta);
  line(find("alpha-arrow"), origin, endAlpha);
  line(find("beta-arrow"), origin, endBeta);
  circle(find("alpha-dot"), endAlpha);
  diamond(find("beta-dot"), endBeta, 8);

  const arc = find("relative-arc");
  const angle = wrapDegrees(state.relative);
  arc.toggleAttribute("hidden", angle === 0);
  if (angle === 0) return;

  const radius = Number(svg.dataset.arcRadius);
  const start = point(state.alphaDirection, radius);
  const end = point(state.betaDirection, radius);
  const [real, imaginary] = state.betaDirection;
  const baseX = end[0] + imaginary * 6;
  const baseY = end[1] + real * 6;

  arc.setAttribute("d", [
    `M${start.join(",")}`,
    `A${radius},${radius} 0 ${angle > 180 ? 1 : 0} 0 ${end.join(",")}`,
    `M${baseX + real * 3},${baseY - imaginary * 3}`,
    `L${end.join(",")}`,
    `L${baseX - real * 3},${baseY + imaginary * 3}`
  ].join(" "));
}

function drawSum(svg, find, state, resultant) {
  const { origin, point } = planeCoordinates(svg);
  const join = point(scale(state.alphaDirection, 0.5));
  const end = point(resultant);
  line(find("sum-alpha"), origin, join);
  line(find("sum-beta"), join, end);
  line(find("sum-arrow"), origin, end);
  circle(find("sum-join"), join);
  circle(find("sum-end"), end);

  const cancelled = isZero(resultant);
  find("sum-result").toggleAttribute("hidden", cancelled);
  find("sum-zero").toggleAttribute("hidden", !cancelled);
}

function sweepCoordinates(svg) {
  const left = Number(svg.dataset.left);
  const right = Number(svg.dataset.right);
  const top = Number(svg.dataset.top);
  const bottom = Number(svg.dataset.bottom);

  return (angle, chance) => [
    left + angle / FULL_TURN * (right - left),
    bottom - chance * (bottom - top)
  ];
}

function drawCurves(svg, find) {
  const point = sweepCoordinates(svg);
  const plus = [];
  const minus = [];

  for (let degrees = 0; degrees <= FULL_TURN; degrees += 2) {
    const alternate = alternateBasis(turn(degrees));
    plus.push(point(degrees, alternate.pPlus).join(","));
    minus.push(point(degrees, alternate.pMinus).join(","));
  }

  find("plus-curve").setAttribute("points", plus.join(" "));
  find("minus-curve").setAttribute("points", minus.join(" "));
}

function drawSweep(svg, find, state) {
  const point = sweepCoordinates(svg);
  line(find("sweep-cursor"), point(state.relative, 1), point(state.relative, 0));
  circle(find("plus-dot"), point(state.relative, state.pPlus));
  diamond(find("minus-dot"), point(state.relative, state.pMinus), 7);
}

function wireChallenge(find, getState) {
  const form = find("challenge");
  const panels = [...form.querySelectorAll("[data-phase-question]")];
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
    panels.forEach((panel, position) => { panel.hidden = position !== index; });
    check.textContent = index === 0 ? "Check my phase" : "Check answer";
    clearFeedback();
    panels[index].querySelector("h4").focus();
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const state = getState();

    if (index === 0) {
      const correct = state.pMinus === 1 && state.pZero === state.pOne;
      feedback.textContent = correct
        ? "Correct. At a relative phase of 180° modulo a full turn, c₊ cancels and P(−) is 1. The 0/1 predictions stay equal."
        : "The current phase leaves some probability for +. Try rotating β until it points opposite α, while keeping their lengths equal.";
      next.hidden = !correct;
      return;
    }

    const choice = form.querySelector("input[name='phase-challenge-global']:checked");
    if (!choice) {
      feedback.textContent = "Choose an answer first.";
      panels[index].querySelector("input").focus();
      return;
    }

    const correct = choice.value === "no";
    feedback.textContent = correct
      ? "Correct. A common rotation keeps φ fixed. Starting at |+⟩, c₋ stays zero and + remains certain."
      : "A half-turn multiplies both amplitudes by −1. The arrows still point in the same direction as each other. Which outcome remains certain?";
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
  const find = id => root.querySelector(`#phase-${id}`);
  const write = (id, text) => { find(id).textContent = text; };
  const relative = find("relative");
  const global = find("global");
  const prediction = find("prediction-form");
  const presetButtons = [...root.querySelectorAll("[data-phase-preset]")];
  const alternate = find("alternate");
  const branch = find("sum-branch");
  let state = stateAt(0, 0);
  let revealed = false;

  const invalidatePhaseAnswer = wireChallenge(find, () => state);

  function setMeter(id, chance) {
    find(id).value = chance;
    write(id, percentText(chance));
    write(`${id}-text`, probabilityText(chance));
  }

  // Every graph has a numerical text equivalent and can fail independently.
  function safelyDraw(id, draw) {
    const svg = find(id);
    if (!svg || svg.hasAttribute("hidden")) return;
    try {
      draw(svg);
    } catch {
      svg.setAttribute("hidden", "");
    }
  }

  function updateSum() {
    const plus = branch.value === "plus";
    const symbol = plus ? "c₊" : "c₋";
    const resultant = plus ? state.cPlus : state.cMinus;
    const first = scale(state.alphaDirection, 0.5);
    const second = scale(state.betaDirection, plus ? 0.5 : -0.5);
    const firstText = complexReading(first);
    const secondText = complexReading(second);
    const resultText = complexReading(resultant);
    const sign = [firstText, secondText, resultText].some(reading => reading.approximate) ? "≈" : "=";
    const sentence = isZero(resultant)
      ? `The contributions cancel. ${symbol} = 0 at the origin and has no defined phase.`
      : `(${firstText.text}) + (${secondText.text}) ${sign} ${resultText.text}, the value of ${symbol}.`;

    write("sum-beta-label", plus ? "Second · β/√2" : "Second · −β/√2");
    write("sum-result-label", `Result · ${symbol}`);
    write("sum-caption", `Each contribution includes the factor 1/√2. ${sentence}`);
    write("sum-desc", `First contribution ${firstText.text}. From that point, add ${secondText.text}. ${sentence}`);

    safelyDraw("sum-plane", svg => {
      for (const id of ["sum-result", "sum-result-label"]) {
        find(id).classList.toggle("phase-plus-color", plus);
        find(id).classList.toggle("phase-minus-color", !plus);
      }
      drawSum(svg, find, state, resultant);
    });
  }

  function render() {
    const relativeText = phaseText(state.relative);
    const globalText = phaseText(state.global);
    write("relative-value", relativeText);
    write("global-value", globalText);
    relative.setAttribute("aria-valuetext", relativeText);
    global.setAttribute("aria-valuetext", globalText);

    for (const button of presetButtons) {
      const active = Number(button.dataset.phasePreset) === wrapDegrees(state.relative);
      button.setAttribute("aria-pressed", String(active));
    }

    const alpha = complexReading(state.alpha);
    const beta = complexReading(state.beta);
    const relation = alpha.approximate || beta.approximate ? "≈" : "=";
    write("alpha", amplitudeText(state.alpha));
    write("beta", amplitudeText(state.beta));
    write("ket", `|ψ⟩ ${relation} (${alpha.text})|0⟩ + (${beta.text})|1⟩`);

    const coincide = wrapDegrees(state.relative) === 0;
    const angleNote = coincide
      ? `The arrows coincide at φ = ${state.relative}°. Each has length 1/√2.`
      : `Measured counterclockwise from α to β, φ = ${state.relative}°. Each arrow has length 1/√2.`;
    write("angle-note", angleNote);
    write("plane-desc", `Alpha ${amplitudeText(state.alpha)}. Beta ${amplitudeText(state.beta)}. ${angleNote}`);
    setMeter("p-zero", state.pZero);
    setMeter("p-one", state.pOne);
    safelyDraw("plane", svg => { drawAmplitudes(svg, find, state); });

    alternate.hidden = !revealed;
    branch.disabled = !revealed;
    if (!revealed) return;

    write("c-plus", amplitudeText(state.cPlus));
    write("c-minus", amplitudeText(state.cMinus));
    setMeter("p-plus", state.pPlus);
    setMeter("p-minus", state.pMinus);

    const explanation = isZero(state.cMinus)
      ? "The contributions cancel in c₋, so + is certain."
      : isZero(state.cPlus)
        ? "The contributions cancel in c₊, so − is certain."
        : state.pPlus === state.pMinus
          ? "Neither amplitude cancels here. Their magnitudes match, so the +/− predictions are 50/50."
          : "Changing the relative phase changes how strongly the contributions reinforce or cancel.";
    write("measurement-note", explanation);

    updateSum();
    const sweepText = `At φ = ${state.relative}°, P(+) is ${probabilityText(state.pPlus)} and P(−) is ${probabilityText(state.pMinus)}. The curves give model predictions.`;
    write("sweep-caption", sweepText);
    write("sweep-desc", sweepText);
    safelyDraw("sweep", svg => { drawSweep(svg, find, state); });
  }

  function readPhases() {
    const newRelative = relative.valueAsNumber;
    const newGlobal = global.valueAsNumber;
    if (!Number.isFinite(newRelative) || !Number.isFinite(newGlobal)) return;

    if (wrapDegrees(newRelative) !== wrapDegrees(state.relative)) invalidatePhaseAnswer();
    state = stateAt(newRelative, newGlobal);
    render();
  }

  function announceRelative() {
    const tail = revealed
      ? `Plus ${percentText(state.pPlus)}. Minus ${percentText(state.pMinus)}.`
      : "The 0/1 predictions are still 50/50.";
    write("announcement", `Relative phase ${state.relative} degrees. ${tail}`);
  }

  for (const name of ["relative-value", "global-value"]) {
    find(name).setAttribute("aria-live", "off");
  }

  relative.addEventListener("input", readPhases);
  relative.addEventListener("change", announceRelative);
  global.addEventListener("input", readPhases);
  global.addEventListener("change", () => {
    write("announcement", `Global phase ${state.global} degrees. The relative phase and all probabilities are unchanged.`);
  });

  for (const button of presetButtons) {
    button.addEventListener("click", () => {
      relative.value = button.dataset.phasePreset;
      readPhases();
      announceRelative();
    });
  }

  prediction.addEventListener("submit", event => {
    event.preventDefault();
    const guessZ = prediction.querySelector("input[name='phase-guess-z']:checked");
    const guessX = prediction.querySelector("input[name='phase-guess-x']:checked");
    if (!guessZ || !guessX) return;

    const z = guessZ.value === "same" ? "Correct for 0/1." : "Recheck 0/1.";
    const x = guessX.value === "swap" ? "Correct for +/−." : "Recheck +/−.";
    revealed = true;
    render();
    write("prediction-feedback", `${z} Squared magnitudes stay at 1/2. ${x} Turning only β by 180° swaps the certain + outcome for a certain − outcome. The live comparison is now open below.`);
  });

  branch.addEventListener("change", () => {
    updateSum();
    write("announcement", branch.value === "plus" ? "Showing the sum for plus." : "Showing the difference for minus.");
  });

  find("reset").addEventListener("click", () => {
    relative.value = "0";
    global.value = "0";
    branch.value = "plus";
    revealed = false;
    prediction.reset();
    write("prediction-feedback", "");
    invalidatePhaseAnswer();
    state = stateAt(0, 0);
    render();
    write("announcement", "Both phases reset to zero. Answer the opening prediction to reveal the comparison again.");
  });

  relative.value = "0";
  global.value = "0";
  branch.value = "plus";
  safelyDraw("sweep", svg => { drawCurves(svg, find); });
  render();

  for (const id of ["controls", "prediction-controls", "challenge-controls"]) {
    find(id).disabled = false;
  }
  find("static-note").hidden = true;
}

// ===========================================================================
// Relative Phase Arcade · optional practice
// Everything below uses the rp- prefix and starts after the lab above, so a
// failure here (including Three.js failing to load) never affects the lab.
// ===========================================================================

const RP_TOLERANCE = 0.002; // typed answers, per real or imaginary part
const RP_DERIVED = 0.005;   // probabilities computed from a state or setting you build
const RP_ANGLE = 1;         // degrees
const RP_SVG = "http://www.w3.org/2000/svg";
const RP_R = Math.SQRT1_2;
const rpNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

function rpFmt(value) {
  if (!Number.isFinite(value)) return "undefined";
  return rpNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
}

// An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
const rpTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
const rpFits = (value, answer) => Math.abs(value - answer) <= (rpTerminates(answer) ? 1e-9 : RP_TOLERANCE + 1e-12);
const rpNear = (value, target, tolerance = RP_DERIVED) => Math.abs(value - target) <= tolerance + 1e-12;
const rpWrap = (degrees, turn = 360) => ((degrees % turn) + turn) % turn;
const rpAngleGap = (a, b, turn = 360) => { const d = rpWrap(a - b, turn); return Math.min(d, turn - d); };
// Angles that differ by whole turns are equal.
const rpAngleFits = (a, b, turn = 360) => rpAngleGap(a, b, turn) <= RP_ANGLE + 1e-9;

// Parse numbers such as 2, −1.5, 3/5, √2, 1/√2 or (1 + √3)/2.
// This is a small arithmetic reader (+ − × / √ and brackets), never eval.
function rpParse(raw) {
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

// Complex numbers are [real, imaginary] pairs. A state is [α, β].
const rpAdd = ([a, b], [c, d]) => [a + c, b + d];
const rpSub = ([a, b], [c, d]) => [a - c, b - d];
const rpMul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
const rpScale = ([a, b], k) => [a * k, b * k];
const rpAbs2 = ([a, b]) => a * a + b * b;
const rpAbs = ([a, b]) => Math.hypot(a, b);
const rpPolar = (r, degrees) => [r * Math.cos(degrees * Math.PI / 180), r * Math.sin(degrees * Math.PI / 180)];
const rpNorm2 = state => rpAbs2(state[0]) + rpAbs2(state[1]);
const rpFitsC = (z, target) => rpFits(z[0], target[0]) && rpFits(z[1], target[1]);
const rpNearC = (z, target, tolerance = RP_DERIVED) => rpAbs(rpSub(z, target)) <= tolerance + 1e-12;
const rpEqual = phi => [[RP_R, 0], rpPolar(RP_R, phi)];
const rpPlusAt = phi => (1 + Math.cos(phi * Math.PI / 180)) / 2;

// Angle in degrees in [0°, 360°).
function rpArg([a, b]) {
  return rpWrap(Math.atan2(b, a) * 180 / Math.PI);
}

function rpCx([a, b]) {
  const re = Math.abs(a) < 5e-10 ? 0 : a, im = Math.abs(b) < 5e-10 ? 0 : b;
  if (im === 0) return rpFmt(re);
  const size = Math.abs(im) === 1 ? "i" : rpFmt(Math.abs(im)) + "i";
  if (re === 0) return (im < 0 ? "−" : "") + size;
  return rpFmt(re) + (im < 0 ? " − " : " + ") + size;
}
const rpVec = state => "(" + state.map(rpCx).join(", ") + ")ᵀ";

// Degrees with radians alongside, as the lab shows them: 60° · π/3 rad.
function rpRadText(degrees) {
  const k = degrees / 15;
  if (Math.abs(k - Math.round(k)) > 1e-9) return "≈ " + rpFmt(degrees * Math.PI / 180);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let n = Math.round(k), d = 12;
  if (n === 0) return "0";
  const g = gcd(Math.abs(n), d);
  n /= g; d /= g;
  const top = n === 1 ? "π" : n === -1 ? "−π" : rpFmt(n) + "π";
  return d === 1 ? top : top + "/" + d;
}
const rpAngleText = degrees => rpFmt(degrees) + "° · " + rpRadText(degrees) + " rad";

// Amplitudes in a measurement basis. ⟨+i| = (⟨0| − i⟨1|)/√2 carries the conjugate.
const RP_BASES = {
  z: { name: "0/1", outcomes: ["0", "1"] },
  x: { name: "+/−", outcomes: ["+", "−"] },
  y: { name: "+i/−i", outcomes: ["+i", "−i"] }
};
function rpBasis([a, b], basis) {
  if (basis === "z") return [a, b];
  if (basis === "x") return [rpScale(rpAdd(a, b), RP_R), rpScale(rpSub(a, b), RP_R)];
  const ib = rpMul([0, 1], b);
  return [rpScale(rpSub(a, ib), RP_R), rpScale(rpAdd(a, ib), RP_R)];
}
const rpProbs = (state, basis) => rpBasis(state, basis).map(rpAbs2);

const rpGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
const rpSetup = message => rpGrade(false, message);

function rpLabelText(field) {
  const label = field.closest("label");
  if (!label) return "the selected input";
  const copy = label.cloneNode(true);
  copy.querySelectorAll("input, select, output").forEach(node => node.remove());
  return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
}

class RpFieldError extends Error {
  constructor(field, detail = "", custom = false) {
    super("Check " + rpLabelText(field) + "." + (detail ? " " + detail : ""));
    this.field = field;
    this.detail = detail;
    this.custom = custom;
  }
}

function rpSetText(element, text) {
  text = String(text ?? "");
  if (element && element.textContent !== text) element.textContent = text;
}

// Plot builders used by the station show() functions. A plan holds panels laid
// out side by side (complex planes, charts and bar groups), or one 3D view.
const rpArrow = (z, tone, label = "", extra = {}) => ({ z, tone, label, ...extra });
const rpPlane = (caption, items, extra = {}) => ({ kind: "plane", caption, items, limit: 1, circle: 1, ...extra });
const rpBars = (caption, items, extra = {}) => ({ kind: "bars", caption, items, ...extra });
const rpChart = (caption, extra) => ({ kind: "chart", caption, x: [0, 360], y: [0, 1],
  xTicks: [0, 90, 180, 270, 360], yTicks: [0, 0.5, 1], xLabel: "φ (degrees)", ...extra });
const rpSweep = (f, x0 = 0, x1 = 360, n = 120) => Array.from({ length: n + 1 }, (_, k) => {
  const x = x0 + (x1 - x0) * k / n;
  return [x, f(x)];
});
const rpProbBars = (state, basis, caption = RP_BASES[basis].name + " basis", extra = {}) => {
  const p = rpProbs(state, basis);
  return rpBars(caption, RP_BASES[basis].outcomes.map((name, k) => ({ label: "P(" + name + ")", value: p[k], tone: k ? "minus" : "plus" })), extra);
};

// 1 · Phase Tuner
const RP_TUNER = {
  t34: { text: "P(+) = 3/4", value: 3 / 4, plus: true,
    work: "P(+) = (1 + cos φ)/2 = 3/4 gives cos φ = 1/2, so φ = 60° (π/3 rad) or φ = 300° (5π/3 rad). The sweep is symmetric about 180°: φ and 360° − φ always give the same P(+), because cos(360° − φ) = cos φ." },
  t14: { text: "P(+) = 1/4", value: 1 / 4, plus: true,
    work: "(1 + cos φ)/2 = 1/4 gives cos φ = −1/2, so φ = 120° (2π/3 rad) or φ = 240° (4π/3 rad), a mirror pair about 180°." },
  m09: { text: "P(−) = 0.9", value: 0.9, plus: false,
    work: "P(−) = (1 − cos φ)/2 = 0.9 gives cos φ = −0.8, so φ ≈ 143.13° or φ ≈ 216.87° (≈ 2.498 and ≈ 3.785 rad). The whole degrees 143° and 217° land within 0.005 of 0.9." }
};

function rpTunerGrader(key) {
  const target = RP_TUNER[key];
  return c => {
    const hits = c.s.records.filter(r => rpNear(target.plus ? r.p : 1 - r.p, target.value));
    if (hits.some(a => hits.some(b => rpAngleGap(a.phi, b.phi) > 2))) return rpGrade(true, "", target.work);
    if (hits.length) {
      return rpGrade(false, "You have one solution, φ = " + rpFmt(hits[0].phi) + "°. Every angle you've recorded for this target is the same angle. Look for a second one in the other half of the turn.");
    }
    return rpGrade(false, c.s.records.length
      ? "None of your recorded angles gives " + target.text + " within 0.005. Record an angle while the readout says you're on target."
      : "Record at least two angles first. Move the slider or type an angle, then press a Record button.");
  };
}

// 2 · Same State or Not?  The convention is first = e^(iγ) × second.
const RP_PAIRS = {
  p1: { first: [[0, RP_R], [-RP_R, 0]], second: [[RP_R, 0], [0, RP_R]], ft: "(i|0⟩ − |1⟩)/√2", st: "(|0⟩ + i|1⟩)/√2", verdict: "global", angle: 90,
    work: "Multiply the second ket by i: i(|0⟩ + i|1⟩)/√2 = (i|0⟩ − |1⟩)/√2. So first = e^(i90°) × second, a global phase of 90° (π/2 rad). Same physical state." },
  p2: { first: [[RP_R, 0], [0, RP_R]], second: [[RP_R, 0], [0, -RP_R]], ft: "(|0⟩ + i|1⟩)/√2", st: "(|0⟩ − i|1⟩)/√2", verdict: "relative", angle: 180,
    work: "Both kets have |α| = |β| = 1/√2, but β/α is i in the first and −i in the second. Their relative phases are 90° and 270°, which differ by 180° (π rad), so no single factor e^(iγ) turns one into the other." },
  p3: { first: [[-RP_R, 0], [RP_R, 0]], second: [[RP_R, 0], [-RP_R, 0]], ft: "(−|0⟩ + |1⟩)/√2", st: "(|0⟩ − |1⟩)/√2", verdict: "global", angle: 180,
    work: "The first ket is −1 times the second, and −1 = e^(i180°). A global phase of 180° (π rad): both are |−⟩." },
  p4: { first: [rpPolar(RP_R, 30), rpPolar(RP_R, 75)], second: [rpPolar(RP_R, 75), rpPolar(RP_R, 120)],
    ft: "e^(i30°)(|0⟩ + e^(i45°)|1⟩)/√2", st: "(e^(i75°)|0⟩ + e^(i120°)|1⟩)/√2", verdict: "global", angle: 315,
    work: "Both kets have relative phase 45° (75° − 30° and 120° − 75°). The first ket’s α sits at 30° and the second’s at 75°, so first = e^(−i45°) × second. −45° and 315° (7π/4 rad) are the same angle." },
  p5: { first: [[Math.sqrt(3) / 2, 0], [0.5, 0]], second: [[0.5, 0], [Math.sqrt(3) / 2, 0]], ft: "(√3|0⟩ + |1⟩)/2", st: "(|0⟩ + √3|1⟩)/2", verdict: "magnitude",
    work: "|α|² is 3/4 in the first ket and 1/4 in the second. A phase factor never changes a magnitude, so these are different states, and the 0/1 measurement already tells them apart." }
};

function rpPairGrader(key) {
  const pair = RP_PAIRS[key];
  return c => {
    const verdict = c.choice("v-" + key);
    if (verdict !== pair.verdict) {
      const sameMagnitudes = rpNear(rpAbs(pair.first[0]), rpAbs(pair.second[0]), 1e-6);
      return rpGrade(false, !sameMagnitudes
        ? "Compare |α| in the two kets first. Can a phase factor change a magnitude?"
        : "The magnitudes match. Now compare the angle from α to β in each ket, or use the trial rotation to try to lay one ket on the other.");
    }
    if (pair.verdict === "magnitude") return rpGrade(true, "", pair.work);
    const angle = c.ans("a-" + key);
    if (pair.verdict === "relative") {
      return rpGrade(rpAngleFits(angle, pair.angle) || rpAngleFits(angle, -pair.angle),
        "Right verdict. Now find each ket’s relative phase, the angle of β/α, and subtract.", pair.work);
    }
    if (rpAngleFits(angle, pair.angle)) return rpGrade(true, "", pair.work);
    if (rpAngleFits(angle, -pair.angle)) return rpGrade(false, "Right verdict, but that angle turns the first ket onto the second. The card asks for γ with first = e^(iγ) × second.");
    return rpGrade(false, "Right verdict. Now find γ: by what angle must you turn the second ket’s arrows to land on the first? The trial rotation can help.");
  };
}

// 3 · Unequal Interference. α is real and positive; β = |β|e^(iφ).
const rpUnequal = (a2, phi) => [[Math.sqrt(a2), 0], rpPolar(Math.sqrt(Math.max(0, 1 - a2)), phi)];
const rpSwing = a2 => Math.sqrt(Math.max(0, a2 * (1 - a2)));

// 4 · Curve Matcher. Each curve is P(+) = 1/2 + |α||β| cos(φ + shift) for a state α|0⟩ + e^(iφ)β|1⟩.
const rpCurve = (a2, shift = 0) => phi => 0.5 + rpSwing(a2) * Math.cos((phi + shift) * Math.PI / 180);
const RP_CURVE_SETS = {
  match: [{ name: "A", f: rpCurve(0.9) }, { name: "B", f: rpCurve(0.5) }, { name: "C", f: rpCurve(1) }],
  read: [{ name: "A", f: rpCurve(0.8) }],
  shift: [{ name: "A", f: rpCurve(0.5, 90) }],
  fake: [{ name: "A", f: rpCurve(0.8) }, { name: "B", f: phi => 0.6 + 0.3 * Math.cos(phi * Math.PI / 180) },
    { name: "C", f: rpCurve((1 + Math.sqrt(0.96)) / 2) }, { name: "D", f: rpCurve(0.5, -90) }]
};
const RP_SHIFT_PICKS = {
  a: { text: "(1, i)ᵀ/√2", peak: 270 }, b: { text: "(1, −i)ᵀ/√2", peak: 90 },
  c: { text: "(1, −1)ᵀ/√2", peak: 180 }, d: { text: "(i, 1)ᵀ/√2", peak: 90 }
};

// 5 · Pick the Measurement
const RP_PREPS = {
  pm: { a: [[RP_R, 0], [0, RP_R]], at: "|+i⟩", b: [[RP_R, 0], [0, -RP_R]], bt: "|−i⟩", answer: "y",
    work: "In the +i/−i basis, c₊ᵢ = (α − iβ)/√2. For |+i⟩ it is (1 − i·i)/2 = 1, and for |−i⟩ it is (1 − 1)/2 = 0. So +i is certain for one and −i for the other, while the 0/1 and +/− bases give 50/50 for both." },
  same: { a: [[1, 0], [0, 0]], at: "|0⟩", b: [[0, 1], [0, 0]], bt: "i|0⟩", answer: "same",
    work: "i|0⟩ = e^(i90°)|0⟩ differs from |0⟩ only by a global phase. Every basis gives identical bars for both, so no measurement can tell them apart: they are one physical state." },
  overlap: { a: [[RP_R, 0], [RP_R, 0]], at: "|+⟩", b: [[RP_R, 0], [0, RP_R]], bt: "|+i⟩", answer: "overlap",
    work: "|⟨+|+i⟩|² = |(1 + i)/2|² = 1/2, so the states aren’t orthogonal. Whatever the basis, some outcome can happen for both. The +/− basis is certain for |+⟩ but gives 50/50 for |+i⟩." },
  disguise: { a: [[-RP_R, 0], [-RP_R, 0]], at: "(−|0⟩ − |1⟩)/√2", b: [[0, RP_R], [0, -RP_R]], bt: "(i|0⟩ − i|1⟩)/√2", answer: "x",
    work: "These are −|+⟩ and i|−⟩: |+⟩ and |−⟩ with global phases −1 and i. The +/− basis gives + for the first and − for the second, every time." },
  z: { a: [[0, 0], [0, -1]], at: "−i|1⟩", b: [rpPolar(1, 30), [0, 0]], bt: "e^(i30°)|0⟩", answer: "z",
    work: "Drop the global phases −i and e^(i30°): the preparations are |1⟩ and |0⟩, so the plain 0/1 basis tells them apart." }
};

function rpMeasureGrader(key) {
  const prep = RP_PREPS[key];
  return c => {
    const pick = c.choice("pick-" + key);
    if (pick === prep.answer) return rpGrade(true, "", prep.work);
    if (RP_BASES[pick]) {
      const pa = rpProbs(prep.a, pick), pb = rpProbs(prep.b, pick), o = RP_BASES[pick].outcomes;
      const line = p => "P(" + o[0] + ") = " + rpFmt(p[0]) + ", P(" + o[1] + ") = " + rpFmt(p[1]);
      return rpGrade(false, "In the " + RP_BASES[pick].name + " basis, A gives " + line(pa) + " and B gives " + line(pb) +
        ". Some outcome there could come from either preparation. Preview the other bases.");
    }
    if (pick === "same") return rpGrade(false, "Compare β/α, or the magnitudes, in the two kets. If they differ, the states differ, even when the global phases look alike.");
    return rpGrade(false, prep.answer === "same"
      ? "Every basis gives identical bars for these two. What does that say about the states?"
      : "These two are orthogonal. Look for a basis whose bars are 1 and 0 for A and 0 and 1 for B.");
  };
}

// 6 · The Third Basis
const RP_THIRD = {
  sixty: { state: rpEqual(60), text: "(|0⟩ + e^(i60°)|1⟩)/√2",
    work: "P(0) = |α|² = 1/2. P(+) = (1 + cos 60°)/2 = 3/4. c₊ᵢ = (1 − i·e^(i60°))/2 = (1 + e^(−i30°))/2, so P(+i) = (1 + cos 30°)/2 = (1 + sin 60°)/2 = (2 + √3)/4 ≈ 0.933." },
  root: { state: [[Math.sqrt(3) / 2, 0], [0, -0.5]], text: "(√3|0⟩ − i|1⟩)/2",
    work: "P(0) = 3/4. c₊ = (√3/2 − i/2)/√2, so P(+) = (3/4 + 1/4)/2 = 1/2. c₊ᵢ = (α − iβ)/√2 = (√3/2 − 1/2)/√2, so P(+i) = (√3 − 1)²/8 = (2 − √3)/4 ≈ 0.067." },
  minusi: { state: [[RP_R, 0], [0, -RP_R]], text: "(|0⟩ − i|1⟩)/√2",
    work: "P(0) = 1/2 and P(+) = (1 + cos 270°)/2 = 1/2. c₊ᵢ = (1 − i(−i))/2 = (1 − 1)/2 = 0: the state is |−i⟩ itself, so P(+i) = 0 and P(−i) = 1." }
};

function rpThirdGrader(key) {
  const card = RP_THIRD[key];
  return c => {
    const typed = ["z", "x", "y"].map(b => c.ans(key + "-" + b));
    const truth = ["z", "x", "y"].map(b => rpProbs(card.state, b)[0]);
    const ok = typed.map((v, k) => rpFits(v, truth[k]));
    if (ok.every(Boolean)) return rpGrade(true, "", card.work);
    if (ok[0] && ok[1] && rpFits(typed[2], 1 - truth[2])) {
      return rpGrade(false, "Your P(+i) is P(−i). The bra ⟨+i| carries the conjugate, so c₊ᵢ = (α − iβ)/√2, not (α + iβ)/√2.");
    }
    const names = ["P(0)", "P(+)", "P(+i)"].filter((_, k) => !ok[k]);
    return rpGrade(false, "Recheck " + names.join(" and ") + ". Find each amplitude in that basis first, then square its magnitude.");
  };
}

// 7 · Phase Gate Workshop. Gates act on the amplitude column (α, β)ᵀ.
const RP_INPUTS = {
  zero: { state: [[1, 0], [0, 0]], text: "|0⟩" }, one: { state: [[0, 0], [1, 0]], text: "|1⟩" },
  plus: { state: [[RP_R, 0], [RP_R, 0]], text: "|+⟩" }, plusi: { state: [[RP_R, 0], [0, RP_R]], text: "|+i⟩" }
};
function rpGate(gate, [a, b], theta) {
  if (gate === "H") return [rpScale(rpAdd(a, b), RP_R), rpScale(rpSub(a, b), RP_R)];
  if (gate === "P") return [a, rpMul(rpPolar(1, theta), b)];
  return [a, b];
}

// 8 · Interferometer Bench. Beam splitters act like H on the (upper, lower) path
// amplitudes, and the phase shifter multiplies the upper path by e^(iθ).
function rpBenchModel(c) {
  const theta = c.num("theta"), up = !c.checked("block-up"), low = !c.checked("block-low"), bs2 = !c.checked("no-bs2");
  const u = up ? rpPolar(RP_R, theta) : [0, 0], l = low ? [RP_R, 0] : [0, 0];
  const d0 = bs2 ? rpScale(rpAdd(u, l), RP_R) : u, d1 = bs2 ? rpScale(rpSub(u, l), RP_R) : l;
  const p0 = rpAbs2(d0), p1 = rpAbs2(d1);
  return { theta, up, low, bs2, p0, p1, lost: Math.max(0, 1 - p0 - p1) };
}
const RP_BENCH = {
  src: [-2.5, -1.45], bs1: [-1.3, -1.45], mu: [-1.3, 0.45], blockUp: [-0.65, 0.45], ps: [0, 0.45],
  bs2: [1.3, 0.45], blockLow: [0, -1.45], ml: [1.3, -1.45], d0: [2.5, 0.45], d1: [1.3, 1.35]
};
function rpBenchBeams(m) {
  const B = RP_BENCH, h = 0.5;
  return [
    { a: B.src, b: B.bs1, s: 1 },
    { a: B.bs1, b: B.mu, s: h }, { a: B.mu, b: B.blockUp, s: h }, { a: B.blockUp, b: B.ps, s: m.up ? h : 0 }, { a: B.ps, b: B.bs2, s: m.up ? h : 0 },
    { a: B.bs1, b: B.blockLow, s: h }, { a: B.blockLow, b: B.ml, s: m.low ? h : 0 }, { a: B.ml, b: B.bs2, s: m.low ? h : 0 },
    { a: B.bs2, b: B.d0, s: m.p0, out: true }, { a: B.bs2, b: B.d1, s: m.p1, out: true }
  ];
}

// 9 · Coherent vs Random. A small seeded generator (mulberry32) so runs can be reset.
function rpRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const RP_PREP_NAMES = { coherent: "coherent |+⟩", random: "random 50/50 |0⟩ or |1⟩" };
const rpLatestRun = (c, prep, basis) => c.s.runs.findLast(run => run.prep === prep && run.basis === basis);

// 10 · Phase Designer. Each target is [basis, outcome index, value].
const RP_DESIGN = {
  quarter: { want: [["z", 0, 1 / 4], ["x", 0, 3 / 4]],
    hint: ["P(0) = |α|² = 1/4 fixes |α| = 1/2 and |β| = √3/2.", "P(+) = 1/2 + |α||β| cos φ = 1/2 + (√3/4) cos φ. Solve for cos φ, then build β = |β|e^(iφ)."],
    work: "α = 1/2 gives P(0) = 1/4, so |β| = √3/2. P(+) = 1/2 + (√3/4) cos φ = 3/4 needs cos φ = 1/√3, so φ ≈ 54.74°. One answer: α = 1/2 and β = 1/2 + i/√2. Any global phase on both, or φ ≈ −54.74°, also works." },
  circle: { want: [["x", 0, 1 / 2], ["y", 0, 1]],
    hint: ["P(+i) = 1 means the state is |+i⟩, up to a global phase.", "|+i⟩ = (|0⟩ + i|1⟩)/√2. Multiply both entries by any e^(iγ) if you like."],
    work: "P(+i) = 1 forces |ψ⟩ = e^(iγ)|+i⟩, for example α = 1/√2 and β = i/√2. P(+) = 1/2 then follows automatically. Only the global phase is free here." },
  third: { want: [["z", 0, 1 / 2], ["x", 0, 1 / 4]], above: ["y", 0, 1 / 2],
    hint: ["P(0) = 1/2 means |α| = |β| = 1/√2, so P(+) = (1 + cos φ)/2.", "cos φ = −1/2 allows 120° or 240°. P(+i) = (1 + sin φ)/2 decides between them."],
    work: "Equal magnitudes give P(+) = (1 + cos φ)/2 = 1/4, so cos φ = −1/2 and φ = 120° or 240°. P(+i) = (1 + sin φ)/2 > 1/2 needs sin φ > 0, so φ = 120°. One answer: α = 1/√2 and β = (−1 + i√3)/(2√2) ≈ −0.354 + 0.612i." },
  hidden: { want: [["z", 0, 0.9], ["x", 1, 1 / 2]], alphaNonreal: true,
    hint: ["|α||β| = √(0.9 × 0.1) = 0.3, and P(−) = 1/2 − 0.3 cos φ.", "P(−) = 1/2 needs cos φ = 0. A nonreal α is just a global phase: put the same phase on β as well."],
    work: "|α||β| = 0.3, and P(−) = 1/2 − 0.3 cos φ = 1/2 needs cos φ = 0, so φ = ±90°. A nonreal α only adds a global phase. One answer: α = i√0.9 ≈ 0.949i and β = −√0.1 ≈ −0.316. Then β/α = i/3, which points at 90°." }
};
const RP_OUT_NAMES = { z: ["P(0)", "P(1)"], x: ["P(+)", "P(−)"], y: ["P(+i)", "P(−i)"] };

function rpDesignGrader(key) {
  const card = RP_DESIGN[key];
  return c => {
    const state = [c.cx("a"), c.cx("b")], n2 = rpNorm2(state);
    if (!rpNear(n2, 1)) return rpGrade(false, "Your state has |α|² + |β|² = " + rpFmt(n2) + ". Normalize it first.");
    const missed = card.want.filter(([basis, k, v]) => !rpNear(rpProbs(state, basis)[k], v));
    if (missed.length) {
      return rpGrade(false, missed.map(([basis, k, v]) => RP_OUT_NAMES[basis][k] + " is " + rpFmt(rpProbs(state, basis)[k]) + ", not " + rpFmt(v)).join("; ") + ".");
    }
    if (card.above && !(rpProbs(state, card.above[0])[card.above[1]] > card.above[2] + RP_DERIVED)) {
      return rpGrade(false, RP_OUT_NAMES[card.above[0]][card.above[1]] + " is " + rpFmt(rpProbs(state, card.above[0])[card.above[1]]) + ". It must be more than 1/2. Try the other angle with the same cosine.");
    }
    if (card.alphaNonreal && Math.abs(state[0][1]) <= 0.01) return rpGrade(false, "Your probabilities are right, but α must not be real. Give both amplitudes the same extra phase.");
    return rpGrade(true, "", card.work, "Mission complete. Your own state passes, and other designs can pass too.");
  };
}

// 11 · Error Detective
const RP_CASES = {
  add: { line: "3", text: "P(+) for (|0⟩ + e^(i120°)|1⟩)/√2",
    work: "Line 3 adds probabilities. Add the amplitudes first: c₊ = (1 + e^(i120°))/2 = e^(i60°)/2, so P(+) = 1/4 and P(−) = 3/4. The contributions partly cancel." },
  global: { line: "3", text: "comparing |+⟩ with e^(iπ/3)|+⟩",
    work: "Line 3 uses the common angle of both amplitudes as if it were observable. That 60° is a global phase: |e^(iπ/3)|² = 1 drops out of every probability, so P(+) = 1 for both kets and no measurement tells them apart." },
  units: { line: "3", text: "P(+) at φ = 60°",
    work: "Line 3 feeds the radian value 1.047 into a cosine read in degrees. cos(π/3) = cos 60° = 1/2, so P(+) = (1 + 1/2)/2 = 3/4." },
  zero: { line: "2", text: "|0⟩ versus |0⟩ + 0·e^(i180°)|1⟩",
    work: "Line 2 gives β = 0 a phase. A zero amplitude has no defined phase, so 0·e^(i180°) is just 0. The two kets are the same vector, and every prediction matches." },
  conj: { line: "2", text: "P(+) from |1 + e^(iφ)|² at φ = 90°",
    work: "Line 2 squares instead of multiplying by the conjugate: |z|² = z z*, so |1 + e^(iφ)|² = (1 + e^(iφ))(1 + e^(−iφ)) = 2 + 2 cos φ. At φ = 90° that is 2, and P(+) = 2/4 = 1/2, a real number as every probability must be." }
};

function rpDetectiveGrader(key) {
  const card = RP_CASES[key];
  return c => {
    const line = c.choice(key + "-line"), kind = c.choice(key + "-kind");
    if (line === card.line && kind === key) return rpGrade(true, "", card.work);
    if (line === card.line) return rpGrade(false, "Right line. Now name what goes wrong there.");
    if (kind === key) return rpGrade(false, "Right mistake, wrong line. Find the first line where it happens.");
    return rpGrade(false, Number(line) < Number(card.line) ? "That line is correct. Read on." : "Something goes wrong before that line.");
  };
}

function rpDetectivePlan(key) {
  if (key === "units") {
    return { panels: [rpChart("P(+) = (1 + cos φ)/2", { series: [{ pts: rpSweep(rpPlusAt), tone: "plus" }], vlines: [{ x: 60 }],
      dots: [{ x: 60, y: 0.75, tone: "plus", label: "60° → 3/4" }] })],
      desc: "P(+) against φ in degrees. At φ = 60° the curve is at 3/4, not near 1." };
  }
  if (key === "add") {
    const first = [0.5, 0], second = rpPolar(0.5, 120);
    return { panels: [rpPlane("c₊ head to tail", [rpArrow(first, "alpha", "α/√2"), rpArrow(second, "beta", "β/√2", { from: first, dashed: true }),
      rpArrow(rpAdd(first, second), "plus", "c₊", { wide: true })], { circle: 0.5 })],
      desc: "Two contributions of length 1/2 at 0° and 120° add head to tail to c₊ of length 1/2, not length 1/√2." };
  }
  if (key === "global") {
    return { panels: [rpPlane("|+⟩", [rpArrow([RP_R, 0], "alpha", "α"), rpArrow([RP_R, 0], "beta", "β", { dashed: true })]),
      rpPlane("e^(iπ/3)|+⟩", [rpArrow(rpPolar(RP_R, 60), "alpha", "α"), rpArrow(rpPolar(RP_R, 60), "beta", "β", { dashed: true })])],
      desc: "In both kets α and β point the same way. The second ket has both arrows turned by 60° together." };
  }
  if (key === "zero") {
    return { panels: [rpPlane("α", [rpArrow([1, 0], "alpha", "α = 1")]), rpPlane("β", [rpArrow([0, 0], "beta", "β = 0", { dot: true, hollow: true })])],
      desc: "α = 1 on the real axis. β is the single point 0, with no direction." };
  }
  return { panels: [rpPlane("1 + e^(i90°)", [rpArrow([1, 0], "alpha", "1"), rpArrow([0, 1], "beta", "e^(iφ)", { from: [1, 0], dashed: true }),
    rpArrow([1, 1], "plus", "1 + i", { wide: true })], { limit: 1.5 })],
    desc: "1 plus i drawn head to tail. The sum 1 + i has squared length 2, a real number." };
}

// 12 · Quantum Preview: Phase in Motion
const rpMotionPhase = c => Number(c.val("start")) + Number(c.val("rate")) * c.num("time");

// 13 · Bloch Sphere Longitude. |α|² sets the latitude, φ the longitude; γ moves nothing.
function rpBlochState(c) {
  const a2 = c.num("a2"), phi = c.num("phi"), gamma = c.num("gamma");
  const alpha = rpPolar(Math.sqrt(a2), gamma), beta = rpPolar(Math.sqrt(1 - a2), gamma + phi);
  const polar = 2 * Math.acos(Math.min(1, Math.sqrt(a2))) * 180 / Math.PI;
  return { a2, phi, gamma, alpha, beta, polar, point: rpBlochPoint({ polar, azimuth: phi }) };
}

// 14 · Polarization Lab. |0⟩ = |H⟩, |1⟩ = |V⟩; a linear polarizer at angle θ
// passes (cos θ, sin θ), so its amplitude is cos θ·α + sin θ·β.
const RP_LIGHT = {
  H: { state: [[1, 0], [0, 0]], text: "|H⟩ = |0⟩, horizontal" },
  V: { state: [[0, 0], [1, 0]], text: "|V⟩ = |1⟩, vertical" },
  D: { state: [[RP_R, 0], [RP_R, 0]], text: "|D⟩ = |+⟩, diagonal" },
  A: { state: [[RP_R, 0], [-RP_R, 0]], text: "|A⟩ = |−⟩, antidiagonal" },
  R: { state: [[RP_R, 0], [0, RP_R]], text: "|R⟩ = |+i⟩, circular" },
  L: { state: [[RP_R, 0], [0, -RP_R]], text: "|L⟩ = |−i⟩, circular, other hand" },
  s60: { state: rpEqual(60), text: "(|H⟩ + e^(i60°)|V⟩)/√2, elliptical" }
};
const rpPass = ([a, b], theta) => rpAbs2(rpAdd(rpScale(a, Math.cos(theta * Math.PI / 180)), rpScale(b, Math.sin(theta * Math.PI / 180))));
// The tip of the electric field over one cycle: (Re(α e^(−it)), Re(β e^(−it))).
const rpEllipse = ([a, b]) => Array.from({ length: 73 }, (_, k) => {
  const t = k / 72 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
  return [a[0] * c + a[1] * s, b[0] * c + b[1] * s];
});

// 15 · Wave Callback. Path difference d (in wavelengths) gives phase difference 360°·d.
const rpWavePhase = c => 360 * c.num("path");

const rpStations = {
  // 1 · Phase Tuner ---------------------------------------------------------------------------
  tuner: {
    start(c) { c.s.records = []; },
    actions: {
      record(c) { return rpTunerRecord(c, c.num("phi")); },
      typed(c) { return rpTunerRecord(c, rpWrap(c.ans("typed"))); },
      clear(c) { c.s.records = []; return "Recorded angles cleared."; }
    },
    show(c) {
      const phi = c.num("phi"), target = RP_TUNER[c.val("target")];
      const p = rpPlusAt(phi), tracked = target.plus ? p : 1 - p;
      const hit = rpNear(tracked, target.value);
      c.put("state", "φ = " + rpAngleText(phi) + " · P(+) = " + rpFmt(p) + " · P(−) = " + rpFmt(1 - p) +
        (hit ? " · on target, " + target.text + "." : " · target " + target.text + "."));
      c.list("log", c.s.records.map(r => "φ = " + rpAngleText(r.phi) + " → P(+) = " + rpFmt(r.p) + ", P(−) = " + rpFmt(1 - r.p)));
      const outcome = target.plus ? "P(+)" : "P(−)";
      const curve = phi2 => (target.plus ? rpPlusAt(phi2) : 1 - rpPlusAt(phi2));
      return {
        panels: [
          rpPlane("amplitudes", [rpArrow([RP_R, 0], "alpha", "α"), rpArrow(rpPolar(RP_R, phi), "beta", "β", { dashed: true })],
            { rays: [{ angle: phi, tone: "angle" }] }),
          rpChart(outcome + " across one turn", { weight: 1.8,
            series: [{ pts: rpSweep(curve), tone: target.plus ? "plus" : "minus" }],
            hlines: [{ y: target.value, label: "target " + rpFmt(target.value) }],
            vlines: [{ x: phi }],
            dots: [...c.s.records.map(r => ({ x: r.phi, y: target.plus ? r.p : 1 - r.p, tone: "angle", r: 4 })),
              { x: phi, y: tracked, tone: target.plus ? "plus" : "minus" }] })
        ],
        caption: "target " + target.text,
        desc: "Left: α along the real axis and β at φ = " + rpFmt(phi) + "°. Right: " + outcome + " against φ with a horizontal target line at " +
          rpFmt(target.value) + ". " + c.s.records.length + " recorded angles are marked."
      };
    },
    checks: {
      t34: ["P(+) = (1 + cos φ)/2. Solve for cos φ first.", "cos φ = 1/2 has one solution in the first quadrant and one in the fourth.", rpTunerGrader("t34")],
      t14: ["Solve (1 + cos φ)/2 = 1/4 for cos φ.", "cos φ = −1/2 has one solution in the second quadrant and one in the third.", rpTunerGrader("t14")],
      m09: ["P(−) = (1 − cos φ)/2.", "cos φ = −0.8. The angles are near 143° and 217°; check each readout.", rpTunerGrader("m09")],
      mirror: ["P(+) depends on φ only through cos φ.", "Which other angle in one turn has the same cosine as 50°?", c => {
        const x = c.ans("mirror");
        if (rpAngleFits(x, 310)) {
          return rpGrade(true, "", "cos(360° − 50°) = cos 50°, so φ = 310° (31π/18 rad) gives the same P(+) = cos²(25°) ≈ 0.821. Typing −50° is fine too: it is the same angle as 310°.");
        }
        if (rpAngleFits(x, 50)) return rpGrade(false, "That is 50° itself, perhaps plus whole turns. Find a different angle with the same cosine.");
        return rpGrade(false, "At " + rpFmt(x) + "°, P(+) = " + rpFmt(rpPlusAt(x)) + ", not ≈ 0.821. Which angle has the same cosine as 50°?");
      }]
    }
  },

  // 2 · Same State or Not? -------------------------------------------------------------------
  same: {
    show(c) {
      const key = c.open() ?? "p1", pair = RP_PAIRS[key], trial = c.num("trial");
      const turned = pair.second.map(z => rpMul(rpPolar(1, trial), z));
      const lands = turned.every((z, k) => rpNearC(z, pair.first[k], 0.01));
      c.put("state", "First ket " + pair.ft + " · second ket " + pair.st + " · second ket turned by γ = " + rpAngleText(trial) +
        (lands ? ". The turned second ket lies exactly on the first." : ". The turned second ket doesn’t match the first yet."));
      const plane = k => rpPlane(k ? "β" : "α", [
        rpArrow(pair.first[k], k ? "beta" : "alpha", "first"),
        rpArrow(turned[k], "angle", "e^(iγ) × second", { dashed: true })
      ]);
      return {
        panels: [plane(0), plane(1)],
        caption: (c.open() ? "pair " : "pair 1 (open a mission to switch) ") + key.slice(1),
        desc: "The α and β amplitudes of the first ket are solid. The second ket’s amplitudes turned by γ = " + rpFmt(trial) + "° are dashed." +
          (lands ? " They coincide." : "")
      };
    },
    checks: Object.fromEntries(Object.keys(RP_PAIRS).map(key => [key, [
      {
        p1: "Write the ratio β/α for each ket.", p2: "Write the ratio β/α for each ket.", p3: "Is one ket a number times the other?",
        p4: "Find each ket’s relative phase: the angle of β minus the angle of α.", p5: "Compare |α|² in the two kets."
      }[key],
      {
        p1: "Both ratios are i. Then find the factor that turns (1, i) into (i, −1).", p2: "The ratios are i and −i.",
        p3: "−1 = e^(iγ) for which γ?", p4: "Both relative phases are 45°. Compare the angles of the two α’s.",
        p5: "|α|² = 3/4 in one and 1/4 in the other."
      }[key],
      rpPairGrader(key)]]))
  },

  // 3 · Unequal Interference ------------------------------------------------------------------
  unequal: {
    show(c) {
      const a2 = c.num("a2"), phi = c.num("phi"), plus = c.val("branch") === "plus";
      const state = rpUnequal(a2, phi), ab = rpSwing(a2);
      const first = rpScale(state[0], RP_R), second = rpScale(state[1], plus ? RP_R : -RP_R);
      const result = rpAdd(first, second), sym = plus ? "c₊" : "c₋";
      const pPlus = 0.5 + ab * Math.cos(phi * Math.PI / 180);
      const hide = c.open() === "build";
      c.put("state", "|α|² = " + rpFmt(a2) + ", |β|² = " + rpFmt(1 - a2) + " · φ = " + rpAngleText(phi) +
        (hide ? " · " + sym + " is hidden while mission 4 is open" : " · " + sym + " = " + rpCx(result)) +
        " · P(+) = " + rpFmt(pPlus) + ", P(−) = " + rpFmt(1 - pPlus) +
        " · as φ turns, P(+) runs from " + rpFmt(0.5 - ab) + " to " + rpFmt(0.5 + ab) + ".");
      return {
        panels: [
          rpPlane("head to tail: " + sym, [
            rpArrow(first, "alpha", "α/√2"),
            rpArrow(second, "beta", (plus ? "" : "−") + "β/√2", { from: first, dashed: true }),
            rpArrow(result, plus ? "plus" : "minus", hide ? "" : sym, { wide: true })
          ], { circle: 0, circles: [{ c: first, r: rpAbs(state[1]) * RP_R, tone: "beta" }] }),
          rpChart("P(+) for |α|² = " + rpFmt(a2), { weight: 1.5,
            series: [{ pts: rpSweep(rpCurve(a2)), tone: "plus" }],
            hlines: [{ y: 0.5 + ab, tone: "guide", label: "max " + rpFmt(0.5 + ab) }, { y: 0.5 - ab, tone: "guide", label: "min " + rpFmt(0.5 - ab) }],
            vlines: [{ x: phi }], dots: [{ x: phi, y: pPlus, tone: "plus" }] })
        ],
        caption: sym + " with |α|² = " + rpFmt(a2),
        desc: "Head-to-tail construction of " + sym + ": α/√2, then " + (plus ? "" : "minus ") + "β/√2 from its tip. A dashed circle shows every point the second arrow can reach as φ turns; " +
          (ab < 0.5 - 1e-9 ? "it never passes through the origin." : "it passes through the origin.") + " Right: P(+) against φ."
      };
    },
    checks: {
      extremes: ["P(+) = |α + β|²/2 = 1/2 + |α||β| cos φ.", "|α||β| = √(0.8 × 0.2). Put cos φ = 1 and cos φ = −1.", c => {
        const max = c.ans("ext-max"), min = c.ans("ext-min");
        if (rpFits(max, 1) && rpFits(min, 0)) return rpGrade(false, "Those are the extremes for equal magnitudes. Here the arrows have different lengths.");
        return rpGrade(rpFits(max, 0.9) && rpFits(min, 0.1), "P(+) = 1/2 + |α||β| cos φ. Find |α||β| for |α|² = 0.8 and |β|² = 0.2.",
          "|α||β| = √(0.8 × 0.2) = 0.4. P(+) = 1/2 + 0.4 cos φ runs from 0.9 at φ = 0° down to 0.1 at φ = 180°. Perfect cancellation would need |α| = |β|.");
      }],
      floor: ["The smallest P(+) is at φ = 180°, where the arrows point opposite ways.", "|α||β| = 0.8 × 0.6.", c => {
        const min = c.ans("floor-min"), why = c.choice("floor-why");
        if (!rpFits(min, 0.02)) return rpGrade(false, "Find the smallest P(+): 1/2 − |α||β| with |α| = 0.8 and |β| = 0.6.");
        return rpGrade(why === "unequal", "Your minimum is right. Now look at the construction at φ = 180°: does the second arrow reach back to 0?",
          "|α||β| = 0.48, so the smallest P(+) is 1/2 − 0.48 = 0.02, at φ = 180°. There the second arrow points straight back but is shorter (0.6/√2 against 0.8/√2), so c₊ = 0.2/√2 ≠ 0. A global phase turns both arrows together and can’t help.");
      }],
      swing: ["max − min = 2|α||β|.", "2|α||β| = 0.6 means |α|²(1 − |α|²) = 0.09.", c => {
        const a2 = c.num("a2"), swing = 2 * rpSwing(a2);
        return rpGrade(rpNear(swing, 0.6), "With |α|² = " + rpFmt(a2) + " the swing is " + rpFmt(swing) + ". Move the |α|² slider.",
          "2|α||β| = 0.6 gives |α|²(1 − |α|²) = 0.09, so |α|² = 0.9 or 0.1. Both work: swapping the two magnitudes leaves the swing unchanged.");
      }],
      build: ["α = √(1/4) = 1/2 and β = √(3/4) e^(i90°) = (√3/2)i.", "c₊ = (α + β)/√2. Divide both parts by √2.", c => {
        const z = c.cx("b");
        if (rpFitsC(z, [0.5, Math.sqrt(3) / 2])) return rpGrade(false, "That is α + β. Divide by √2.");
        return rpGrade(rpFitsC(z, [Math.SQRT2 / 4, Math.sqrt(6) / 4]), "Find α and β first, add them, then divide by √2.",
          "α = 1/2 and β = (√3/2)i. c₊ = (1/2 + (√3/2)i)/√2 = √2/4 + (√6/4)i ≈ 0.354 + 0.612i, and |c₊|² = 1/8 + 3/8 = 1/2.");
      }]
    }
  },

  // 4 · Curve Matcher -------------------------------------------------------------------------
  curves: {
    show(c) {
      const key = c.open() ?? "match", set = RP_CURVE_SETS[key];
      const tones = ["plus", "alpha", "beta", "minus"];
      const spots = [20, 110, 200, 290];
      c.put("state", key === "match" && !c.open() ? "Open a mission to load its curves. Showing mission 1’s curves." : "Showing " + set.length + " curve" + (set.length > 1 ? "s" : "") + " for this mission.");
      return {
        panels: [rpChart("P(+) against the dial angle φ", {
          series: set.map((curve, k) => ({ pts: rpSweep(curve.f), tone: tones[k], dashed: k === 1, dotted: k === 3,
            label: curve.name, labelAt: [spots[k], curve.f(spots[k])], labelDx: 0, labelDy: -8, labelAnchor: "middle" }))
        })],
        caption: "mission curves",
        desc: "Curves " + set.map(curve => curve.name + " runs from " + rpFmt(Math.min(...rpSweep(curve.f).map(p => p[1]))) + " to " +
          rpFmt(Math.max(...rpSweep(curve.f).map(p => p[1]))) + " and peaks at φ = " + rpFmt(rpSweep(curve.f, 0, 360, 360).reduce((m, p) => (p[1] > m[1] ? p : m))[0]) + "°").join("; ") + "."
      };
    },
    checks: {
      match: ["A flat line means P(+) doesn’t depend on φ at all. When does that happen?", "The swing is |α||β| each way from 1/2: 0.5 for |α|² = 1/2 and 0.3 for |α|² = 0.9.", c => {
        const picks = ["a", "b", "c"].map(k => c.choice("match-" + k));
        return rpGrade(picks.join() === "n,h,o", "Read each curve’s highest and lowest values. The swing is |α||β| on each side of 1/2.",
          "A swings 0.3 each way (0.2 to 0.8), so |α||β| = 0.3 and |α|² = 0.9. B swings fully (0 to 1): |α|² = 1/2. C is flat because |α|² = 1 leaves β = 0, and with nothing to interfere P(+) stays 1/2.");
      }],
      read: ["The middle of every curve is 1/2. The swing each way is |α||β|.", "|α||β| = 0.4 and |α|² + |β|² = 1.", c => {
        const a2 = c.ans("read-a2"), b2 = c.ans("read-b2");
        if (!rpFits(a2 + b2, 1)) return rpGrade(false, "Your two values must add to 1.");
        return rpGrade((rpFits(a2, 0.8) && rpFits(b2, 0.2)) || (rpFits(a2, 0.2) && rpFits(b2, 0.8)), "The curve swings 0.4 each way from 1/2, so |α||β| = 0.4.",
          "|α|²|β|² = 0.16 with |α|² + |β|² = 1, so the squared magnitudes are 0.8 and 0.2. The curve can’t say which is which: swapping |α| and |β| leaves |α||β| and so the curve unchanged.");
      }],
      shift: ["P(+) peaks where the arrows α and e^(iφ)β line up.", "At φ = 270°, e^(iφ) = −i. Which β does −i turn onto α?", c => {
        const pick = c.choice("shift-pick");
        return rpGrade(pick === "a", RP_SHIFT_PICKS[pick].text + " peaks at φ = " + RP_SHIFT_PICKS[pick].peak + "°, not 270°.",
          "P(+) is largest when e^(iφ)β points along α. For (1, i)ᵀ/√2, e^(i270°) × i = −i × i = 1, which lines up with α at φ = 270°. A phase built into the state slides the whole curve sideways.");
      }],
      fake: ["Every allowed curve has the form 1/2 + |α||β| cos(φ + shift).", "Find each curve’s middle value.", c => {
        const pick = c.choice("fake-pick");
        return rpGrade(pick === "b", "Curve " + pick.toUpperCase() + " is centred on 1/2, so some state produces it.",
          "Curve B runs from 0.3 to 0.9, so it is centred on 0.6. Every P(+) curve is centred on 1/2 because P(+) + P(−) = 1 and the sweep treats + and − symmetrically. C is a small swing (|α| ≫ |β|) and D is a full swing slid by 90°.");
      }]
    }
  },

  // 5 · Pick the Measurement ------------------------------------------------------------------
  measure: {
    show(c) {
      const key = c.open() ?? "pm", prep = RP_PREPS[key], basis = c.val("basis");
      const o = RP_BASES[basis].outcomes, pa = rpProbs(prep.a, basis), pb = rpProbs(prep.b, basis);
      c.put("state", "A = " + prep.at + " · B = " + prep.bt + " · in the " + RP_BASES[basis].name + " basis A gives P(" + o[0] + ") = " + rpFmt(pa[0]) +
        ", P(" + o[1] + ") = " + rpFmt(pa[1]) + " and B gives P(" + o[0] + ") = " + rpFmt(pb[0]) + ", P(" + o[1] + ") = " + rpFmt(pb[1]) + "." +
        (c.open() ? "" : " Open a mission to load its preparations."));
      return {
        panels: [rpProbBars(prep.a, basis, "A · " + prep.at), rpProbBars(prep.b, basis, "B · " + prep.bt)],
        caption: RP_BASES[basis].name + " basis",
        desc: "Predicted bars for preparation A, " + prep.at + ", and preparation B, " + prep.bt + ", in the " + RP_BASES[basis].name + " basis."
      };
    },
    checks: {
      pm: ["Preview the 0/1 and +/− bases first: are any bars 1 and 0?", "Try the +i/−i basis. Remember c₊ᵢ = (α − iβ)/√2.", rpMeasureGrader("pm")],
      same: ["How are |0⟩ and i|0⟩ related?", "Does any basis give different bars for A and B?", rpMeasureGrader("same")],
      overlap: ["A basis tells two states apart with certainty only if the states are orthogonal.", "Compute |⟨+|+i⟩|².", rpMeasureGrader("overlap")],
      disguise: ["Factor −1 out of A and i out of B.", "A = −|+⟩ and B = i|−⟩.", rpMeasureGrader("disguise")],
      z: ["Ignore the global phases −i and e^(i30°).", "Which basis contains |0⟩ and |1⟩?", rpMeasureGrader("z")]
    }
  },

  // 6 · The Third Basis -----------------------------------------------------------------------
  third: {
    show(c) {
      const key = c.open() ?? "sixty";
      const state = key === "conj" ? [[RP_R, 0], [0, RP_R]] : RP_THIRD[key].state;
      const text = key === "conj" ? "(|0⟩ + i|1⟩)/√2" : RP_THIRD[key].text;
      const shown = c.revealed(key);
      c.put("state", "|ψ⟩ = " + text + " · α = " + rpCx(state[0]) + ", β = " + rpCx(state[1]) + "." +
        (shown ? " Bars for all three bases are shown." : " The bars appear once you complete this mission."));
      const panels = [rpPlane("|ψ⟩", [rpArrow(state[0], "alpha", "α"), rpArrow(state[1], "beta", "β", { dashed: true })], { weight: shown ? 1.1 : 1 })];
      if (shown) panels.push(rpProbBars(state, "z", "0/1"), rpProbBars(state, "x", "+/−"), rpProbBars(state, "y", "+i/−i"));
      return {
        panels,
        caption: text,
        desc: "α and β for " + text + " on the complex plane." + (shown ? " Bars give the predicted probabilities in the 0/1, +/− and +i/−i bases." : "")
      };
    },
    checks: {
      sixty: ["P(+) = (1 + cos φ)/2 for equal magnitudes.", "For equal magnitudes P(+i) = (1 + sin φ)/2, because c₊ᵢ = (1 − i e^(iφ))/2.", rpThirdGrader("sixty")],
      root: ["P(0) = |α|². Find c₊ = (α + β)/√2 next.", "−iβ = −i(−i/2) = −1/2, so c₊ᵢ = (√3/2 − 1/2)/√2.", rpThirdGrader("root")],
      minusi: ["Compare the state with the definition of |−i⟩.", "c₊ᵢ = (α − iβ)/√2 with β = −i/√2.", rpThirdGrader("minusi")],
      conj: ["⟨+i| = (⟨0| − i⟨1|)/√2: the bra conjugates the i.", "c₊ᵢ = (α − iβ)/√2 = (1/√2 − i·i/√2)/√2.", c => {
        const z = c.cx("conj");
        if (rpFitsC(z, [0, 0])) return rpGrade(false, "That is (α + iβ)/√2. You dropped the conjugate on ⟨+i|.");
        return rpGrade(rpFitsC(z, [1, 0]), "Use c₊ᵢ = (α − iβ)/√2.",
          "⟨+i| = (⟨0| − i⟨1|)/√2. c₊ᵢ = (1/√2 − i · i/√2)/√2 = (1 + 1)/2 = 1, so P(+i) = 1: the state is |+i⟩.");
      }]
    }
  },

  // 7 · Phase Gate Workshop ------------------------------------------------------------------
  gates: {
    show(c) {
      const input = RP_INPUTS[c.val("input")], theta = c.num("theta");
      const gates = ["g1", "g2", "g3", "g4"].map(name => c.val(name)).filter(g => g !== "none");
      let column = input.state;
      const trail = [input.text + " = " + rpVec(column)];
      for (const gate of gates) {
        column = rpGate(gate, column, theta);
        trail.push((gate === "H" ? "H" : "P(" + rpFmt(theta) + "°)") + " → " + rpVec(column));
      }
      const p = rpProbs(column, "z");
      c.put("state", trail.join(" · ") + " · P(0) = " + rpFmt(p[0]) + ", P(1) = " + rpFmt(p[1]) + ".");
      return {
        panels: [
          rpPlane("output α", [rpArrow(input.state[0], "guide", "in", { dashed: true }), rpArrow(column[0], "alpha", "α′")]),
          rpPlane("output β", [rpArrow(input.state[1], "guide", "in", { dashed: true }), rpArrow(column[1], "beta", "β′")]),
          rpProbBars(column, "z", "0/1 predictions", { weight: 0.9 })
        ],
        caption: gates.length ? gates.map(g => (g === "H" ? "H" : "P(" + rpFmt(theta) + "°)")).join(" → ") : "no gates",
        desc: "Input " + input.text + " drawn dashed, output column " + rpVec(column) + " drawn solid, with its 0/1 predictions."
      };
    },
    checks: {
      flip: ["H|0⟩ = (1, 1)ᵀ/√2.", "P(180°) turns the second entry by 180°: (1, −1)ᵀ/√2. Then apply H once more.", c => {
        const a = c.cx("f-a"), b = c.cx("f-b");
        if (rpFitsC(a, [1, 0]) && rpFitsC(b, [0, 0])) return rpGrade(false, "That is the input |0⟩. Does the middle phase shift change anything after the second H?");
        return rpGrade(rpFitsC(a, [0, 0]) && rpFitsC(b, [1, 0]), "Apply the gates one at a time, left to right, to the column (1, 0)ᵀ.",
          "H|0⟩ = (1, 1)ᵀ/√2. P(180°) gives (1, −1)ᵀ/√2 = |−⟩. H then gives ((1 − 1)/2, (1 + 1)/2)ᵀ = (0, 1)ᵀ = |1⟩. A phase shift between two basis switches turned |0⟩ into |1⟩.");
      }],
      quarter: ["After H and P(90°) the column is (1, i)ᵀ/√2.", "H(α, β)ᵀ = ((α + β)/√2, (α − β)/√2)ᵀ.", c => {
        const a = c.cx("q-a"), b = c.cx("q-b");
        return rpGrade(rpFitsC(a, [0.5, 0.5]) && rpFitsC(b, [0.5, -0.5]), "Track the column after each gate. The final H adds and subtracts the two entries and divides by √2.",
          "H|0⟩ = (1, 1)ᵀ/√2. P(90°) gives (1, i)ᵀ/√2. H gives ((1 + i)/2, (1 − i)/2)ᵀ, so P(0) = P(1) = 1/2. Compare the 180° shift, which made 1 certain.");
      }],
      collapse: ["Multiply the matrices. The rightmost one acts first, but for H · P(180°) · H the order on each side is the same.", "P(180°) = [[1, 0], [0, −1]]. Find P(180°)H first, then multiply by H on the left.", c => {
        const m = ["m11", "m12", "m21", "m22"].map(name => c.ans(name));
        if ([1, 0, 0, -1].every((v, k) => rpFits(m[k], v))) return rpGrade(false, "That is P(180°) alone. The H on each side changes it.");
        return rpGrade([0, 1, 1, 0].every((v, k) => rpFits(m[k], v)), "Compute P(180°)H = (1/√2)[[1, 1], [−1, 1]], then H times that.",
          "P(180°)H = (1/√2)[[1, 1], [−1, 1]]. H times that is (1/2)[[1 − 1, 1 + 1], [1 + 1, 1 − 1]] = [[0, 1], [1, 0]]. The sequence swaps the two amplitudes, which matches the first mission.");
      }],
      order: ["H|+⟩ = |0⟩.", "A phase shift on |0⟩ changes nothing. A phase shift on |+⟩ makes |+i⟩.", c => {
        const pick = c.choice("order-pick");
        return rpGrade(pick === "ph", "With H first, |+⟩ becomes |0⟩. What does P(90°) do to (1, 0)ᵀ?",
          "H then P(90°): |+⟩ → |0⟩ → |0⟩, so P(0) stays 1, as with no phase shift. P(90°) then H: |+⟩ → |+i⟩ → ((1 + i)/2, (1 − i)/2)ᵀ, so P(0) drops to 1/2. A phase shift shows up in 0/1 predictions only if a basis switch comes after it.");
      }]
    }
  },

  // 8 · Interferometer Bench (3D) ------------------------------------------------------------
  bench: {
    start(c) { c.s.clock = 0; },
    drag(c, dx, dy) {
      c.set("turn", Math.max(-60, Math.min(60, Math.round((c.num("turn") + dx * 0.3) / 5) * 5)));
      c.set("tilt", Math.max(15, Math.min(90, Math.round((c.num("tilt") - dy * 0.3) / 5) * 5)));
    },
    moving: () => true,
    tick(c, dt) { c.s.clock = (c.s.clock + dt) % 600; },
    show(c) {
      const m = rpBenchModel(c);
      const layout = m.up && m.low ? "both arms open" : m.up || m.low ? "one arm blocked" : "both arms blocked";
      c.put("state", "θ = " + rpAngleText(m.theta) + " · " + layout + " · second beam splitter " + (m.bs2 ? "in place" : "removed") +
        " · P(D0) = " + rpFmt(m.p0) + ", P(D1) = " + rpFmt(m.p1) + (m.lost > 1e-9 ? ", absorbed by a block " + rpFmt(m.lost) : "") + ".");
      return {
        bench: { turn: c.num("turn"), tilt: c.num("tilt"), model: m, beams: rpBenchBeams(m), clock: c.reduced() ? null : c.s.clock },
        caption: "θ = " + rpFmt(m.theta) + "°",
        desc: "A photon interferometer seen from above. Light from the source meets the first beam splitter, travels both arms, the upper one through a phase shifter set to " +
          rpFmt(m.theta) + "°, and recombines at the second beam splitter" + (m.bs2 ? "" : ", which is removed") + ". Detector D0 receives " + rpFmt(m.p0) + " and D1 receives " + rpFmt(m.p1) + "."
      };
    },
    checks: {
      dark: ["P(D0) = cos²(θ/2) and P(D1) = sin²(θ/2) on the intact bench.", "Keep both arms open and the second splitter in place.", c => {
        const m = rpBenchModel(c);
        if (!m.up || !m.low || !m.bs2) return rpSetup("Open both arms and put the second beam splitter back first: interference needs both paths.");
        return rpGrade(m.p1 >= 1 - RP_DERIVED, "P(D1) is " + rpFmt(m.p1) + " at θ = " + rpFmt(m.theta) + "°. Turn the phase shifter.",
          "At θ = 180° (π rad) the upper path’s amplitude is flipped. The two paths cancel at D0 and add at D1, so every photon arrives at D1.");
      }],
      block: ["Half the light enters each arm. A block absorbs its half.", "The surviving half meets the second beam splitter alone and splits 50/50.", c => {
        const m = rpBenchModel(c);
        if (m.up === m.low || !m.bs2) return rpSetup("Block exactly one arm, keep the second beam splitter in place, and watch the detectors.");
        const p = c.ans("block-ans");
        return rpGrade(rpFits(p, 1 / 4), "Half the photons are absorbed. What happens to the other half at the second splitter?",
          "Half the photons hit the block. The other half arrive at the second splitter along one path only, so nothing interferes and they split 1/4 to D0 and 1/4 to D1, whatever θ is.");
      }],
      remove: ["Without the second splitter, each arm leads straight to one detector.", "The phase shifter changes the upper amplitude’s phase, not its size.", c => {
        const pick = c.choice("remove-pick");
        return rpGrade(pick === "none", "Remove the splitter and turn θ. Do the detector readings move?",
          "With no second splitter the paths never meet again: the upper arm feeds D0 and the lower arm feeds D1, each with probability |e^(iθ)/√2|² = 1/2. A relative phase only shows up when the two paths are recombined, just as a +/− measurement needs both amplitudes.");
      }],
      gates: ["The first splitter turns ‘came from the source’ into an equal superposition of the two paths.", "Compare station 7’s first mission.", c => {
        const pick = c.choice("gate-pick");
        return rpGrade(pick === "hph", "Count the optical elements a photon meets in order.",
          "Splitter, phase shifter, splitter: H, then P(θ), then H. Station 7 showed that H · P(180°) · H swaps the amplitudes, which is why θ = 180° sends everything to D1.");
      }]
    }
  },

  // 9 · Coherent vs Random --------------------------------------------------------------------
  trials: {
    start(c) { c.s.seed = 1; c.s.rng = rpRandom(1); c.s.runs = []; },
    actions: {
      run(c) {
        const prep = c.val("prep"), basis = c.val("basis");
        const counts = [0, 0];
        for (let k = 0; k < 20; k++) {
          const ket = prep === "coherent" ? "plus" : c.s.rng() < 0.5 ? "zero" : "one";
          const outcome = basis === "x" ? (ket === "plus" ? 0 : c.s.rng() < 0.5 ? 0 : 1) : (ket === "plus" ? (c.s.rng() < 0.5 ? 0 : 1) : ket === "zero" ? 0 : 1);
          counts[outcome] += 1;
        }
        c.s.runs.push({ prep, basis, counts, seed: c.s.seed });
        const o = RP_BASES[basis].outcomes;
        return "Run " + c.s.runs.length + ": " + counts[0] + " × " + o[0] + " and " + counts[1] + " × " + o[1] + ".";
      },
      reseed(c) {
        c.s.seed += 1;
        c.s.rng = rpRandom(c.s.seed);
        return "Seed " + c.s.seed + ". New runs use a fresh sequence. Reset this station to return to seed 1.";
      }
    },
    show(c) {
      const last = c.s.runs.at(-1);
      c.put("state", "Seed " + c.s.seed + " · " + c.s.runs.length + " run" + (c.s.runs.length === 1 ? "" : "s") + " recorded." +
        (last ? " Latest: " + RP_PREP_NAMES[last.prep] + " in the " + RP_BASES[last.basis].name + " basis." : " Choose a preparation and a basis, then run 20 trials."));
      c.list("runs", c.s.runs.map((run, k) => {
        const o = RP_BASES[run.basis].outcomes;
        return "Run " + (k + 1) + " · " + RP_PREP_NAMES[run.prep] + " · " + RP_BASES[run.basis].name + " basis · " + run.counts[0] + " × " + o[0] + ", " + run.counts[1] + " × " + o[1];
      }));
      const o = RP_BASES[last?.basis ?? c.val("basis")].outcomes;
      return {
        panels: [rpBars(last ? "Run " + c.s.runs.length + " · counts out of 20" : "No run yet", [
          { label: o[0], value: last ? last.counts[0] : 0, tone: "plus", text: last ? String(last.counts[0]) : "–" },
          { label: o[1], value: last ? last.counts[1] : 0, tone: "minus", text: last ? String(last.counts[1]) : "–" }], { max: 20 })],
        caption: last ? RP_PREP_NAMES[last.prep] : "no run yet",
        desc: last ? "Counts from run " + c.s.runs.length + ": " + last.counts[0] + " × " + o[0] + " and " + last.counts[1] + " × " + o[1] + " out of 20." : "No trials yet."
      };
    },
    checks: {
      z: ["Run both preparations with the 0/1 basis selected.", "Compare the two runs. Does either one look special?", c => {
        if (!rpLatestRun(c, "coherent", "z") || !rpLatestRun(c, "random", "z")) return rpSetup("Record a 0/1 run of each preparation first.");
        const pick = c.choice("z-pick");
        return rpGrade(pick === "no", "Look at the two 0/1 runs again. Could you say which preparation made which?",
          "Both preparations give P(0) = P(1) = 1/2, so both runs show a mix of 0s and 1s. In the 0/1 basis these two very different preparations look alike.");
      }],
      coherent: ["Select the coherent |+⟩ and the +/− basis, then run.", "Type the number of − outcomes in that run.", c => {
        const run = rpLatestRun(c, "coherent", "x");
        if (!run) return rpSetup("Record a +/− run of the coherent |+⟩ first.");
        const n = c.ans("coh-minus");
        return rpGrade(rpFits(n, run.counts[1]), "Your latest coherent +/− run has " + run.counts[1] + " − outcomes. Type that count.",
          "|+⟩ is a basis ket of the +/− basis, so c₋ = 0 and every trial gives +. You saw " + run.counts[1] + " − outcomes, and every run will show 0.");
      }],
      random: ["Select the random preparation and the +/− basis, then run.", "Type the number of − outcomes in that run.", c => {
        const run = rpLatestRun(c, "random", "x");
        if (!run) return rpSetup("Record a +/− run of the random preparation first.");
        const n = c.ans("rand-minus");
        return rpGrade(rpFits(n, run.counts[1]), "Your latest random +/− run has " + run.counts[1] + " − outcomes. Type that count.",
          "Each trial is |0⟩ or |1⟩, and each of those gives + or − with probability 1/2. Your run had " + run.counts[1] + " − outcomes, so the − outcome does appear. Coherent |+⟩ never gives −. The +/− basis tells the two preparations apart.");
      }]
    }
  },

  // 10 · Phase Designer -----------------------------------------------------------------------
  designer: {
    show(c) {
      const a = c.quietCx("a"), b = c.quietCx("b"), key = c.open(), card = key ? RP_DESIGN[key] : null;
      if (!a || !b) {
        c.put("state", "Enter α and β.");
        return { panels: [rpPlane("|ψ⟩", [])], caption: "enter a state", desc: "No state entered yet." };
      }
      const state = [a, b];
      const pz = rpProbs(state, "z"), px = rpProbs(state, "x"), py = rpProbs(state, "y");
      c.put("state", "|α|² + |β|² = " + rpFmt(rpNorm2(state)) + " · P(0) = " + rpFmt(pz[0]) + " · P(+) = " + rpFmt(px[0]) + ", P(−) = " + rpFmt(px[1]) +
        " · P(+i) = " + rpFmt(py[0]) + (rpAbs(a) > 1e-9 && rpAbs(b) > 1e-9 ? " · relative phase φ = " + rpAngleText(Math.round(rpWrap(rpArg(b) - rpArg(a)) * 100) / 100) : "") + ".");
      const target = (basis, k) => card?.want.find(w => w[0] === basis && w[1] === k)?.[2];
      return {
        panels: [
          rpPlane("|ψ⟩", [rpArrow(a, "alpha", "α"), rpArrow(b, "beta", "β", { dashed: true })]),
          rpBars(card ? "your state · yellow: targets" : "your state", [
            { label: "P(0)", value: pz[0], tone: "alpha", target: target("z", 0) },
            { label: card?.want.some(w => w[0] === "x" && w[1] === 1) ? "P(−)" : "P(+)", value: card?.want.some(w => w[0] === "x" && w[1] === 1) ? px[1] : px[0], tone: "plus", target: target("x", 0) ?? target("x", 1) },
            { label: "P(+i)", value: py[0], tone: "minus", target: target("y", 0) }
          ], { weight: 1.4 })
        ],
        caption: card ? "open card targets shown" : "open a card to see its targets",
        desc: "Your α and β on the complex plane, and bars for P(0), P(+) and P(+i)." + (card ? " Yellow lines mark the open card’s targets." : "")
      };
    },
    checks: Object.fromEntries(Object.keys(RP_DESIGN).map(key => [key, [...RP_DESIGN[key].hint, rpDesignGrader(key)]]))
  },

  // 11 · Error Detective ----------------------------------------------------------------------
  detective: {
    show(c) {
      const key = c.open() ?? "add";
      c.put("state", c.open() ? "Case file open: " + RP_CASES[key].text + "." : "Open a case file. Showing case 1.");
      return { ...rpDetectivePlan(key), caption: RP_CASES[key].text };
    },
    checks: {
      add: ["Line 1 is correct.", "What has to be combined before you square: probabilities or amplitudes?", rpDetectiveGrader("add")],
      global: ["Lines 1 and 2 are correct.", "Can a phase shared by both amplitudes change |c₊|²?", rpDetectiveGrader("global")],
      units: ["Lines 1 and 2 are correct.", "What unit is 1.047 in, and what unit does the cosine on line 3 expect?", rpDetectiveGrader("units")],
      zero: ["Line 1 is correct.", "What is the phase of the number 0?", rpDetectiveGrader("zero")],
      conj: ["Line 1 is correct.", "|z|² is z times its conjugate, z*.", rpDetectiveGrader("conj")]
    }
  },

  // 12 · Quantum Preview: Phase in Motion -----------------------------------------------------
  motion: {
    start(c) { c.s.playing = false; },
    actions: {
      play(c) {
        if (c.s.playing) {
          c.s.playing = false;
          return "Paused at t = " + c.val("time") + " ns.";
        }
        if (c.reduced()) return "Reduced effects is on, so Play stays off. Drag the time slider or use Step instead.";
        if (c.num("time") >= 24) c.set("time", 0);
        c.s.clock = c.num("time");
        c.s.playing = true;
        return "Playing. The relative phase grows by " + c.val("rate") + "° each nanosecond.";
      },
      step(c) {
        c.s.playing = false;
        c.set("time", Math.min(24, c.num("time") + 0.5));
        return null;
      }
    },
    moving: c => c.s.playing,
    tick(c, dt) {
      c.s.clock = Math.min(24, (c.s.clock ?? c.num("time")) + dt * 2);
      c.set("time", Math.round(c.s.clock * 10) / 10);
      if (c.s.clock >= 24) { c.s.playing = false; c.say("Reached t = 24 ns."); }
    },
    settle(c) { if (c.reduced()) c.s.playing = false; },
    edit(c, name) {
      if (name === "time") { c.s.playing = false; c.s.clock = c.num("time"); }
    },
    show(c) {
      const t = c.num("time"), phi = rpMotionPhase(c), p = rpPlusAt(phi);
      const button = c.node('[data-rp-action="play"]');
      rpSetText(button, c.s.playing ? "Pause" : "Play");
      button.setAttribute("aria-pressed", String(Boolean(c.s.playing)));
      c.put("state", "t = " + rpFmt(t) + " ns · φ(t) = " + rpFmt(Number(c.val("start"))) + "° + " + c.val("rate") + "°/ns × t = " + rpFmt(phi) + "°, the same angle as " +
        rpAngleText(rpWrap(phi)) + " · P(+) = " + rpFmt(p) + " · P(0) = 0.5.");
      const curve = rpSweep(time => rpPlusAt(Number(c.val("start")) + Number(c.val("rate")) * time), 0, 24, 240);
      return {
        panels: [
          rpPlane("phase dial", [rpArrow([RP_R, 0], "alpha", "α"), rpArrow(rpPolar(RP_R, phi), "beta", "β", { dashed: true })], { rays: [{ angle: phi }] }),
          rpChart("P(+) and P(0) over time", { weight: 1.9, x: [0, 24], xTicks: [0, 4, 8, 12, 16, 20, 24], xLabel: "t (ns)",
            series: [{ pts: curve, tone: "plus", label: "P(+)", labelAt: [24, curve.at(-1)[1]], labelDx: -4, labelAnchor: "end" },
              { pts: [[0, 0.5], [24, 0.5]], tone: "alpha", dashed: true, label: "P(0)", labelAt: [1, 0.5], labelDx: 0 }],
            vlines: [{ x: t }], dots: [{ x: t, y: p, tone: "plus" }] })
        ],
        caption: "t = " + rpFmt(t) + " ns",
        desc: "Left: α fixed and β turned to φ(t) = " + rpFmt(rpWrap(phi)) + "°. Right: P(+) oscillates over 24 ns while P(0) stays at 1/2."
      };
    },
    checks: {
      zero: ["P(+) = 0 when φ = 180°.", "φ(t) = 45° × t. Solve 45t = 180.", c => {
        const t = c.ans("zero-t");
        return rpGrade(rpFits(t, 4), "Find the first time when φ(t) = 45°/ns × t reaches 180°.",
          "φ(t) = 45°/ns × t reaches 180° at t = 4 ns. There c₊ cancels, so P(+) = 0.");
      }],
      period: ["P(+) repeats when φ grows by a full turn.", "Solve 30°/ns × T = 360°.", c => {
        const t = c.ans("period");
        if (rpFits(t, 6)) return rpGrade(false, "At 6 ns P(+) reaches its minimum. One full period has to bring P(+) back to 1.");
        return rpGrade(rpFits(t, 12), "How long does φ take to grow by 360° at 30°/ns?",
          "The pattern repeats when φ grows by 360°: T = 360°/(30°/ns) = 12 ns.");
      }],
      pzero: ["P(0) = |α|².", "Does the growing phase change any magnitude?", c => {
        const pick = c.choice("pzero-pick");
        return rpGrade(pick === "no", "Watch the dashed P(0) line while the clock runs.",
          "The phase factor e^(iφ(t)) has magnitude 1, so |α|² and |β|² stay 1/2. Only the relative phase changes, so only measurements that combine the amplitudes, such as +/−, see the motion.");
      }],
      return: ["Starting at φ₀ = 90°, P(+) = 1 when φ(t) reaches 360°.", "Solve 90° + 60°/ns × t = 360°.", c => {
        const t = c.ans("return-t");
        if (rpFits(t, 6)) return rpGrade(false, "At 6 ns φ = 450°, the same angle as 90°: you’ve returned to |+i⟩, not |+⟩.");
        return rpGrade(rpFits(t, 4.5), "Find when 90° + 60°t first equals a whole turn.",
          "90° + 60°/ns × t = 360° gives t = 270° ÷ 60°/ns = 4.5 ns. At that moment the state is |+⟩ again, and P(+) = 1.");
      }]
    }
  },

  // 13 · Bloch Sphere Longitude (3D) ---------------------------------------------------------
  bloch: {
    start(c) { c.s.visited = new Set(); c.s.trail = []; },
    drag(c, dx, dy) {
      c.set("yaw", ((Math.round((c.num("yaw") - dx * 0.5) / 5) * 5) % 360 + 360) % 360);
      c.set("tilt", Math.max(-60, Math.min(60, Math.round((c.num("tilt") + dy * 0.3) / 5) * 5)));
    },
    edit(c, name) {
      if ((name !== "phi" && name !== "a2") || !rpNear(c.num("a2"), 0.5, 1e-9)) return;
      const phi = c.num("phi");
      c.s.visited.add(Math.floor(rpWrap(phi) / 90));
      if (!c.s.trail.some(old => rpAngleGap(old, phi) < 5)) c.s.trail = [...c.s.trail, phi].slice(-36);
    },
    show(c) {
      const b = rpBlochState(c), x = b.point[0];
      const pole = b.a2 >= 1 - 1e-9 || b.a2 <= 1e-9;
      c.put("state", "α = " + rpCx(b.alpha) + ", β = " + rpCx(b.beta) + " · θ = " + rpFmt(b.polar) + "° from the top" +
        (pole ? " · one amplitude is 0, so the point is a pole and has no longitude" : " · longitude = relative phase φ = " + rpAngleText(b.phi)) +
        " · global phase γ = " + rpFmt(b.gamma) + "° does not move the point · (x, y, z) = (" + b.point.map(rpFmt).join(", ") +
        ") · P(+) = (1 + x)/2 = " + rpFmt((1 + x) / 2) + "." +
        (c.s.visited.size ? " Equator quadrants visited: " + c.s.visited.size + " of 4." : ""));
      const points = c.s.trail.map(phi => ({ point: rpBlochPoint({ polar: 90, azimuth: phi }), tone: "angle", size: 3 }));
      return {
        sphere: { yaw: c.num("yaw"), tilt: c.num("tilt"), marker: { polar: b.polar, azimuth: b.phi }, points },
        caption: "θ = " + rpFmt(b.polar) + "°, φ = " + rpFmt(b.phi) + "°",
        desc: "A sphere with |0⟩ at the top, |1⟩ at the bottom, and |+⟩, |+i⟩, |−⟩, |−i⟩ around the equator. The state point sits " +
          rpFmt(b.polar) + "° from the top at longitude " + rpFmt(b.phi) + "°." + (points.length ? " Small dots mark equator longitudes you have visited." : "")
      };
    },
    checks: {
      read: ["The longitude is the relative phase: the angle of β minus the angle of α.", "140° − 20°.", c => {
        const lon = c.ans("read-lon");
        if (rpAngleFits(lon, 140)) return rpGrade(false, "140° is the phase of β alone. α has a phase too, and only the difference counts.");
        if (rpAngleFits(lon, 20)) return rpGrade(false, "20° is the phase both amplitudes share. That is a global phase, which doesn’t move the point.");
        return rpGrade(rpAngleFits(lon, 120), "Subtract the angle of α from the angle of β.",
          "Factor out e^(i20°): the ket is e^(i20°)(|0⟩ + e^(i120°)|1⟩)/√2. The global factor doesn’t move the point, so it sits on the equator at longitude 120° (2π/3 rad).");
      }],
      sweep: ["Keep |α|² = 0.5 so the point stays on the equator.", "Move φ through all four quarter-turns: 0–90°, 90–180°, 180–270° and 270–360°.", c => {
        const n = c.s.visited.size;
        return rpGrade(n === 4, n ? "You have visited " + n + " of the 4 equator quadrants with |α|² = 0.5. Keep turning φ." : "Set |α|² = 0.5, then move φ around the equator.",
          "With |α| = |β| the point stays on the equator, and φ carries it once around: |+⟩ at 0°, |+i⟩ at 90°, |−⟩ at 180° and |−i⟩ at 270°. The relative phase is literally a longitude.");
      }],
      moves: ["The point depends only on |α|, |β| and the relative phase.", "Ask what each operation does to the angle of β minus the angle of α, and to |α|.", c => {
        const picks = ["mv-both", "mv-beta", "mv-alpha", "mv-swap"].map(name => c.checked(name));
        if (picks[0]) return rpGrade(false, "Multiplying both amplitudes by e^(i50°) is a global phase. The point stays put.");
        return rpGrade(picks[1] && picks[2] && picks[3], "One or more operations that change the relative phase or the magnitudes are unticked.",
          "β × e^(i50°) adds 50° to the longitude and α × e^(i50°) subtracts 50°. Swapping α and β trades the latitudes (θ → 180° − θ) and reverses the longitude. Multiplying both by e^(i50°) changes nothing you can measure, so the point stays put.");
      }],
      off: ["x = sin θ cos φ = 2|α||β| cos φ.", "P(+) = (1 + x)/2 = 1/2 + |α||β| cos φ, with |α||β| = 0.4.", c => {
        const p = c.ans("off-p");
        return rpGrade(rpFits(p, 0.1), "Find x = 2|α||β| cos φ for |α|² = 0.8 and φ = 180°, then P(+) = (1 + x)/2.",
          "|α||β| = √(0.8 × 0.2) = 0.4, so x = 2 × 0.4 × cos 180° = −0.8 and P(+) = (1 − 0.8)/2 = 0.1. This matches station 3’s smallest value: the sphere’s x coordinate is P(+) − P(−).");
      }]
    }
  },

  // 14 · Polarization Lab ---------------------------------------------------------------------
  polar: {
    show(c) {
      const light = RP_LIGHT[c.val("prep")], theta = c.num("angle"), pass = rpPass(light.state, theta);
      c.put("state", light.text + " · polarizer at " + rpAngleText(theta) + " · passes " + rpFmt(pass) + ", blocks " + rpFmt(1 - pass) + ".");
      return {
        panels: [
          rpPlane("field and polarizer", [], { circle: 0, axes: ["H", "V"], weight: 1.1,
            rays: [{ angle: theta, through: true, solid: true }],
            paths: [{ pts: rpEllipse(light.state), tone: "plus" }] }),
          rpBars("this polarizer", [{ label: "passes", value: pass, tone: "plus" }, { label: "blocked", value: 1 - pass, tone: "minus" }])
        ],
        caption: light.text.split(",")[0] + " at " + rpFmt(theta) + "°",
        desc: "The green curve traces the light’s electric field over one cycle: a line for linear light, a circle for circular light. The yellow line is the polarizer’s axis at " +
          rpFmt(theta) + "° from horizontal. The bars show that " + rpFmt(pass) + " passes."
      };
    },
    checks: {
      diag: ["|D⟩ = |+⟩ = (|H⟩ + |V⟩)/√2 is linear light along the diagonal.", "A polarizer passes everything when its axis lies along the light’s line.", c => {
        if (c.val("prep") !== "D") return rpSetup("Prepare |D⟩ first.");
        const theta = c.num("angle");
        return rpGrade(rpAngleFits(theta, 45, 180), "At " + theta + "° the polarizer passes " + rpFmt(rpPass(RP_LIGHT.D.state, theta)) + ". Line its axis up with the light.",
          "At 45° the polarizer passes (|H⟩ + |V⟩)/√2 = |+⟩ completely. At 135° it passes |−⟩ and blocks |D⟩ completely. A polarizer set at 45° and 135° is the +/− measurement.");
      }],
      match: ["H and V are horizontal and vertical: the 0/1 basis.", "Diagonal light has equal H and V parts in phase. Circular light has them 90° apart.", c => {
        const picks = ["m-hv", "m-da", "m-rl"].map(name => c.choice(name));
        return rpGrade(picks.join() === "z,x,y", "Write each pair in terms of |H⟩ = |0⟩ and |V⟩ = |1⟩.",
          "|H⟩, |V⟩ are |0⟩, |1⟩. |D⟩, |A⟩ = (|H⟩ ± |V⟩)/√2 are |+⟩, |−⟩. |R⟩, |L⟩ = (|H⟩ ± i|V⟩)/√2 are |+i⟩, |−i⟩. The relative phase between the H and V parts is what turns a line into an ellipse or a circle.");
      }],
      circle: ["Prepare |R⟩ and turn the polarizer.", "|cos θ + i sin θ|²/2 for every θ.", c => {
        const p = c.ans("circ-p");
        return rpGrade(rpFits(p, 1 / 2), "Prepare |R⟩ and read the pass bar at a few angles.",
          "The amplitude is (cos θ + i sin θ)/√2 = e^(iθ)/√2, whose squared magnitude is 1/2 at every angle. |L⟩ gives 1/2 at every angle too, so no linear polarizer can tell |R⟩ from |L⟩. Measuring in the +i/−i basis needs a different analyzer, such as a quarter-wave plate in front of the polarizer.");
      }],
      best: ["Prepare the 60° state and sweep the polarizer.", "Pass = (1 + sin 2θ cos φ)/2 for equal magnitudes.", c => {
        const angle = c.ans("best-angle"), p = c.ans("best-p");
        if (!rpAngleFits(angle, 45, 180)) return rpGrade(false, "At " + rpFmt(angle) + "° the 60° state passes " + rpFmt(rpPass(RP_LIGHT.s60.state, angle)) + ". Find the angle where the bar is highest.");
        return rpGrade(rpFits(p, 3 / 4), "Read the pass bar at 45°, or use (1 + cos 60°)/2.",
          "For (|H⟩ + e^(iφ)|V⟩)/√2, a polarizer at θ passes (1 + sin 2θ cos φ)/2. With φ = 60° that peaks at θ = 45°, with (1 + 1/2)/2 = 3/4, which is P(+) from the lab. A diagonal polarizer is a P(+) meter.");
      }]
    }
  },

  // 15 · Wave Callback ------------------------------------------------------------------------
  wave: {
    show(c) {
      const delta = rpWavePhase(c), wrapped = rpWrap(delta), intensity = rpPlusAt(delta), rad = delta * Math.PI / 180;
      c.put("state", "Path difference " + rpFmt(c.num("path")) + "λ → phase difference " + rpFmt(delta) + "°" +
        (Math.abs(delta - wrapped) > 1e-9 ? ", the same angle as " + rpAngleText(wrapped) : " · " + rpRadText(delta) + " rad") +
        " · Lesson 3: I/Iₘₐₓ = cos²(Δ/2) = " + rpFmt(intensity) + " · Lesson 12: P(+) for φ = " + rpFmt(wrapped) + "° = " + rpFmt(intensity) + ".");
      const wave = shift => rpSweep(x => Math.cos(2 * Math.PI * x - shift), 0, 2, 120);
      return {
        panels: [
          rpChart("two waves and their sum", { weight: 1.3, x: [0, 2], y: [-2, 2], xTicks: [0, 0.5, 1, 1.5, 2], yTicks: [-2, -1, 0, 1, 2], xLabel: "position (wavelengths)",
            series: [{ pts: wave(0), tone: "alpha", dashed: true }, { pts: wave(rad), tone: "beta", dotted: true },
              { pts: rpSweep(x => Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * x - rad), 0, 2, 120), tone: "plus", label: "sum", labelAt: [2, Math.cos(4 * Math.PI) + Math.cos(4 * Math.PI - rad)], labelDx: -4, labelAnchor: "end" }] }),
          rpChart("cos²(Δ/2) = P(+)", { series: [{ pts: rpSweep(rpPlusAt), tone: "plus" }], vlines: [{ x: wrapped }],
            dots: [{ x: wrapped, y: intensity, tone: "plus" }], xLabel: "Δ or φ (degrees)" })
        ],
        caption: "Δ = " + rpFmt(delta) + "°",
        desc: "Left: two equal waves, one shifted by " + rpFmt(delta) + "°, and their sum, whose height is 2|cos(Δ/2)|. Right: the shared law cos²(Δ/2), at " + rpFmt(intensity) + "."
      };
    },
    checks: {
      dark: ["One full wavelength of path is a 360° phase difference.", "Half a wavelength is half of that.", c => {
        const phi = c.ans("dark-phi");
        return rpGrade(rpAngleFits(phi, 180), "λ/2 of extra path is half a wavelength. What phase difference is that?",
          "λ/2 of path gives Δ = 180° (π rad), so the waves cancel and cos²(90°) = 0: a dark fringe. The matching amplitude state, with φ = 180°, is |−⟩, and its P(+) is 0 in exactly the same way.");
      }],
      third: ["Δ = 360° × (1/3) = 120°.", "cos²(60°) = (1/2)².", c => {
        const v = c.ans("third-val");
        if (rpFits(v, 1 / 2)) return rpGrade(false, "1/2 is cos 60°. The law squares it.");
        return rpGrade(rpFits(v, 1 / 4), "Find Δ for a path difference of λ/3, then compute cos²(Δ/2).",
          "λ/3 gives Δ = 120°, so I/Iₘₐₓ = cos²(60°) = 1/4. A state with φ = 120° has P(+) = (1 + cos 120°)/2 = 1/4. Same numbers, same law: amplitudes add first, then you square.");
      }],
      wrap: ["2.25 wavelengths is 2.25 × 360°.", "Subtract whole turns.", c => {
        const phi = c.ans("wrap-phi");
        return rpGrade(rpAngleFits(phi, 90), "Multiply 2.25 by 360°, then remove whole turns.",
          "2.25λ gives Δ = 810° = 2 × 360° + 90°. Whole turns change nothing, so this is the same as Δ = 90°, and both laws give 1/2.");
      }]
    }
  }
};

function rpTunerRecord(c, phi) {
  const p = rpPlusAt(phi);
  c.s.records = [...c.s.records.filter(r => rpAngleGap(r.phi, phi) > 1e-9), { phi, p }].slice(-8);
  return "Recorded φ = " + rpAngleText(phi) + ": P(+) = " + rpFmt(p) + ", P(−) = " + rpFmt(1 - p) + ".";
}

// ---------------------------------------------------------------------------
// Arcade engine: station switching, missions, hints, progress, motion and drawing.
// ---------------------------------------------------------------------------

function rpPalette(root) {
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

function initializeRelativePhaseArcade(root) {
  const details = root.querySelector("#relative-phase-arcade");
  if (!details) return;
  const get = id => root.querySelector("#rp-" + id);
  const select = get("station"), resetButton = get("reset"), status = get("status");
  const reducedBox = get("reduced"), progress = get("progress");
  const figure = get("figure-template").content.firstElementChild.cloneNode(true);
  const toolTemplate = get("mission-template");
  const viewport = figure.querySelector("#rp-viewport");
  const canvas = figure.querySelector("#rp-canvas");
  const geometry = figure.querySelector("[data-rp-geometry]");
  const labelLayer = figure.querySelector("[data-rp-labels]");
  const desc = figure.querySelector("#rp-desc");
  const title = figure.querySelector("#rp-title");
  const renderStatus = figure.querySelector("#rp-render-status");
  const colors = rpPalette(root);
  const lifetime = new AbortController();
  const listen = (node, type, handler, options = {}) =>
    node?.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
  const panels = new Map(), cards = new Map(), completion = new Set();
  let active = null, plan = null;
  let graphics = null, loading = false, failed = false, contextLost = false, disposed = false;
  let frame = null, motionFrame = null, lastTick = null, drag = null, glide = null;

  const say = message => rpSetText(status, message ?? "");
  const updateProgress = () => rpSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");

  for (const panel of root.querySelectorAll("#rp-panels [data-rp-station]")) {
    const key = panel.dataset.rpStation;
    const spec = rpStations[key];
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
        const value = rpParse(input.value);
        if (value === null) throw new RpFieldError(input, "Enter a number such as 2, −0.5, 3/5, √2 or 1/√2.", true);
        return value;
      },
      quiet: name => rpParse(field(name).value),
      cx: prefix => [c.ans(prefix + "-re"), c.ans(prefix + "-im")],
      // A complex value for drawing only; null while either box is blank or mid-edit.
      quietCx(prefix) {
        const re = c.quiet(prefix + "-re"), im = c.quiet(prefix + "-im");
        return re === null || im === null ? null : [re, im];
      },
      choice(name) {
        const input = field(name);
        if (!input.value) throw new RpFieldError(input, "Choose an option.");
        return input.value;
      },
      set(name, value) { field(name).value = String(value); },
      put(name, text) { rpSetText(c.node('[data-rp-read="' + name + '"]'), text); },
      list(name, lines) {
        const list = c.node('[data-rp-log="' + name + '"]');
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
    for (const card of panel.querySelectorAll("[data-rp-mission]")) {
      const id = card.dataset.rpMission, check = id.slice(key.length + 1);
      if (!spec.checks[check]) continue;
      card.append(toolTemplate.content.cloneNode(true));
      c.cards.set(check, card);
      cards.set(id, { card, check, id, hints: 0, station: c });
      listen(card, "toggle", () => { if (active === c) refresh(); });
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
    rpSetText(renderStatus, message);
  }

  function refresh() {
    if (!active || !details.open) return;
    plan = active.spec.show(active);
    for (const output of active.panel.querySelectorAll("output[data-rp-for]")) {
      const value = active.val(output.dataset.rpFor);
      rpSetText(output, "rpAngle" in output.dataset
        ? rpAngleText(Number(value))
        : value.replace("-", "−") + (output.dataset.rpUnit ?? ""));
    }
    rpSetText(title, active.panel.querySelector("h4").textContent + (plan.caption ? " · " + plan.caption : ""));
    rpSetText(desc, plan.desc || "");
    if (plan.sphere) {
      const target = rpBlochPoint(plan.sphere.marker);
      if (!glide) glide = { from: target, to: target, start: 0, point: target };
      else if (glide.to.some((n, i) => n !== target[i])) {
        glide = { from: glide.point, to: target, start: performance.now(), point: glide.point };
        if (reduced() || !onScreen()) glide = { from: target, to: target, start: 0, point: target };
      }
    }
    if ((plan.sphere || plan.bench) && !graphics && !loading && !failed) loadGraphics();
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
    const kind = plan.sphere ? "sphere" : plan.bench ? "bench" : null;
    const view = plan.sphere ? { ...plan.sphere, shown: glide?.point } : plan.bench ?? null;
    rpPaintSvg(plan, geometry, labelLayer, view);
    if (!kind) {
      showSvg("SVG diagram.");
      return;
    }
    const noun = kind === "sphere" ? "sphere" : "bench";
    if (!graphics || contextLost) {
      if (!loading) showSvg(failed
        ? "Three.js is unavailable here, so the " + noun + " uses the SVG view. Use the view sliders to turn it."
        : "SVG view of the " + noun + ". Use the view sliders or drag to turn it.");
      return;
    }
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    try {
      graphics.draw(kind, view, width, height, reduced());
      canvas.hidden = false;
      viewport.dataset.renderer = "webgl";
      rpSetText(renderStatus, "Three.js 3D view. Drag the " + noun + " or use the view sliders to turn it.");
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
      graphics = rpCreateGraphics(THREE, canvas, colors);
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
    active.node("[data-rp-plot-slot]").append(figure);
    viewport.dataset.space = active.spec.drag ? "true" : "false";
    glide = null;
    lastTick = null;
    refresh();
  }

  function clearCard(card) {
    rpSetText(card.querySelector("[data-rp-feedback]"), "");
    const work = card.querySelector("[data-rp-work]");
    work.hidden = true;
    work.open = false;
  }

  function showGrade(mission, result) {
    const { card, id, check, station } = mission;
    const work = card.querySelector("[data-rp-work]");
    rpSetText(card.querySelector("[data-rp-feedback]"),
      result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
    rpSetText(card.querySelector("[data-rp-work-text]"), result.work || "");
    work.hidden = !result.work;
    work.open = Boolean(result.work) && !result.pass;
    if (result.pass) station.s.revealed[check] = true;
    if (result.pass && !completion.has(id)) {
      completion.add(id);
      card.querySelector("[data-rp-done]").hidden = false;
      updateProgress();
    }
    say("");
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !active || !active.panel.contains(button) || button.disabled) return;
    const missionCard = button.closest("[data-rp-mission]");
    const mission = missionCard ? cards.get(missionCard.dataset.rpMission) : null;
    const action = button.dataset.rpAction;
    try {
      if (action) {
        const message = active.spec.actions[action](active, mission?.check ?? null);
        if (mission) rpSetText(mission.card.querySelector("[data-rp-feedback]"), message ?? "");
        else if (message !== null) say(message);
      } else if (mission && button.hasAttribute("data-rp-check")) {
        showGrade(mission, active.spec.checks[mission.check][2](active));
      } else if (mission && button.hasAttribute("data-rp-hint")) {
        if (mission.hints >= 2) return;
        const list = mission.card.querySelector("[data-rp-hint-list]");
        const item = document.createElement("li");
        rpSetText(item, active.spec.checks[mission.check][mission.hints]);
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
      if (!(error instanceof RpFieldError)) throw error;
      if (mission) rpSetText(mission.card.querySelector("[data-rp-feedback]"), error.message);
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
    const missionCard = target.closest("[data-rp-mission]");
    if (missionCard) clearCard(missionCard);
    active.spec.edit?.(active, target.name, event.type);
    refresh();
  }

  // Drag to turn a 3D view.
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
  listen(root.querySelector("#rp-arcade-link"), "click", () => { details.open = true; });

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
  if (location.hash === "#relative-phase-arcade") details.open = true;
}

// ---------------------------------------------------------------------------
// SVG drawing. The viewBox is 560 × 300 and labels always stay in SVG.
// ---------------------------------------------------------------------------

function rpNode(name, attributes = {}, text = "") {
  const node = document.createElementNS(RP_SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  if (text) node.textContent = text;
  return node;
}

function rpPaintSvg(plan, geometry, labels, view) {
  const shapes = [], words = [];
  if (plan.panels) rpDrawPanels(plan.panels, shapes, words);
  if (plan.sphere && view) rpDrawSphere(view, shapes, words);
  if (plan.bench) rpDrawBench(plan.bench, shapes, words);
  geometry.replaceChildren(...shapes);
  labels.replaceChildren(...words);
}

function rpDrawPanels(panels, shapes, words) {
  const total = panels.reduce((sum, panel) => sum + (panel.weight ?? 1), 0);
  let x = 0;
  for (const panel of panels) {
    const box = { x, w: 560 * (panel.weight ?? 1) / total };
    if (panel.kind === "plane") rpDrawPlane(panel, box, shapes, words);
    else if (panel.kind === "chart") rpDrawChart(panel, box, shapes, words);
    else if (panel.kind === "bars") rpDrawBars(panel, box, shapes, words);
    x += box.w;
  }
}

function rpLabel(words, text, x, y, tone, anchor = "middle", extra = {}) {
  // Keep the whole label inside the 560-wide viewBox (about 8.5 px per character).
  const span = text.length * 8.5;
  const left = anchor === "start" ? x : anchor === "end" ? x - span : x - span / 2;
  if (left + span > 556) { x = 556; anchor = "end"; }
  else if (left < 4) { x = 4; anchor = "start"; }
  words.push(rpNode("text", { class: "rp-label", "data-tone": tone, x, y, "text-anchor": anchor, ...extra }, text));
}

function rpDrawPlane(plane, box, shapes, words) {
  const size = Math.min(box.w - 20, 238), half = size / 2, cx = box.x + box.w / 2, cy = 166;
  const limit = plane.limit ?? 1, unit = (half - 10) / limit;
  const X = re => cx + re * unit, Y = im => cy - im * unit;
  shapes.push(rpNode("rect", { class: "rp-frame", x: cx - half, y: cy - half, width: size, height: size, rx: 4 }));
  const step = limit <= 1 ? 0.25 : limit <= 2 ? 0.5 : 1;
  let grid = "";
  for (let k = -Math.floor(limit / step); k <= Math.floor(limit / step); k++) {
    if (k === 0) continue;
    const v = k * step;
    grid += "M" + X(v) + " " + (cy - half) + "V" + (cy + half) + "M" + (cx - half) + " " + Y(v) + "H" + (cx + half);
  }
  shapes.push(rpNode("path", { class: "rp-grid", d: grid }));
  shapes.push(rpNode("path", { class: "rp-axis", d: "M" + (cx - half) + " " + cy + "H" + (cx + half) + "M" + cx + " " + (cy - half) + "V" + (cy + half) }));
  if (size > 150) {
    words.push(rpNode("text", { class: "rp-tick", x: X(limit) - 2, y: cy + 14, "text-anchor": "end" }, plane.axes?.[0] ?? "Re"));
    words.push(rpNode("text", { class: "rp-tick", x: cx + 5, y: Y(limit) + 10, "text-anchor": "start" }, plane.axes?.[1] ?? "Im"));
  }
  words.push(rpNode("text", { class: "rp-caption", "data-tone": plane.tone, x: cx, y: cy - half - 9, "text-anchor": "middle" }, plane.caption));
  const rings = [...(plane.circle ? [{ c: [0, 0], r: plane.circle, tone: "guide" }] : []), ...(plane.circles ?? [])];
  for (const ring of rings) {
    if (ring.r > 0) shapes.push(rpNode("circle", { class: "rp-ring", "data-tone": ring.tone ?? "guide", cx: X(ring.c[0]), cy: Y(ring.c[1]), r: ring.r * unit }));
  }
  for (const ray of plane.rays ?? []) {
    const end = rpPolar(limit * 1.05, ray.angle);
    const start = ray.through ? rpScale(end, -1) : [0, 0];
    shapes.push(rpNode("line", { class: "rp-ray" + (ray.solid ? " rp-solid" : ""), "data-tone": ray.tone ?? "angle",
      x1: X(start[0]), y1: Y(start[1]), x2: X(end[0]), y2: Y(end[1]) }));
  }
  for (const path of plane.paths ?? []) {
    shapes.push(rpNode("polyline", { class: "rp-curve" + (path.dashed ? " rp-dashed" : ""), "data-tone": path.tone,
      points: path.pts.map(([re, im]) => X(re).toFixed(1) + "," + Y(im).toFixed(1)).join(" ") }));
  }
  for (const item of plane.items) {
    const from = item.from ?? [0, 0];
    const fx = X(from[0]), fy = Y(from[1]);
    const [re, im] = rpAdd(from, item.z);
    const reach = Math.max(Math.abs(re), Math.abs(im));
    const clip = reach > limit ? limit / reach : 1;
    const ex = X(re * clip), ey = Y(im * clip);
    const length = Math.hypot(ex - fx, ey - fy);
    if (item.dot || length < 3) {
      shapes.push(rpNode("circle", { class: "rp-dot" + (item.hollow || length < 3 ? " rp-hollow" : ""), "data-tone": item.tone, cx: ex, cy: ey, r: item.dot ? item.size ?? 4.5 : 5 }));
    } else {
      const ux = (ex - fx) / length, uy = (ey - fy) / length, depth = Math.min(13, length * 0.6), wing = depth * 0.42;
      const bx = ex - ux * depth, by = ey - uy * depth;
      shapes.push(rpNode("line", { class: "rp-arrow" + (item.dashed ? " rp-dashed" : "") + (item.wide ? " rp-wide" : ""), "data-tone": item.tone, x1: fx, y1: fy, x2: bx, y2: by }));
      shapes.push(rpNode("polygon", { class: "rp-head" + (item.dashed ? " rp-hollow" : ""), "data-tone": item.tone,
        points: ex + "," + ey + " " + (bx - uy * wing) + "," + (by + ux * wing) + " " + (bx + uy * wing) + "," + (by - ux * wing) }));
    }
    if (item.label) {
      // Past the tip and a little to one side, so a label never hides an arrow along the same line.
      const ux = (ex - fx) / (length || 1), uy = (ey - fy) / (length || 1);
      const away = length < 3 ? [10, -10] : [ux * 12 + uy * 9, uy * 12 - ux * 9];
      const anchor = Math.abs(away[0]) < 4 ? "middle" : away[0] > 0 ? "start" : "end";
      rpLabel(words, item.label + (clip < 1 ? " (off scale)" : ""), ex + away[0], ey + away[1] + 4, item.tone, anchor);
    }
  }
}

function rpDrawChart(chart, box, shapes, words) {
  const left = box.x + 46, right = box.x + box.w - 16, top = 40, bottom = 246;
  const [x0, x1] = chart.x, [y0, y1] = chart.y;
  const X = v => left + (v - x0) / (x1 - x0) * (right - left);
  const Y = v => bottom - (Math.max(y0, Math.min(y1, v)) - y0) / (y1 - y0) * (bottom - top);
  shapes.push(rpNode("rect", { class: "rp-frame", x: left, y: top, width: right - left, height: bottom - top }));
  let grid = "";
  for (const v of chart.xTicks) grid += "M" + X(v) + " " + top + "V" + bottom;
  for (const v of chart.yTicks) grid += "M" + left + " " + Y(v) + "H" + right;
  shapes.push(rpNode("path", { class: "rp-grid", d: grid }));
  const zeroY = y0 < 0 && y1 > 0 ? Y(0) : bottom;
  shapes.push(rpNode("path", { class: "rp-axis", d: "M" + left + " " + top + "V" + bottom + "M" + left + " " + zeroY + "H" + right }));
  const every = Math.max(1, Math.ceil(chart.xTicks.length * 34 / (right - left)));
  chart.xTicks.forEach((v, k) => {
    if (k % every === 0) words.push(rpNode("text", { class: "rp-tick", x: X(v), y: bottom + 16, "text-anchor": "middle" }, rpFmt(v)));
  });
  for (const v of chart.yTicks) words.push(rpNode("text", { class: "rp-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, rpFmt(v)));
  words.push(rpNode("text", { class: "rp-tick", x: (left + right) / 2, y: bottom + 36, "text-anchor": "middle" }, chart.xLabel));
  words.push(rpNode("text", { class: "rp-caption", x: (left + right) / 2, y: top - 12, "text-anchor": "middle" }, chart.caption));
  for (const h of chart.hlines ?? []) {
    shapes.push(rpNode("line", { class: "rp-ray", "data-tone": h.tone ?? "angle", x1: left, y1: Y(h.y), x2: right, y2: Y(h.y) }));
    if (h.label) rpLabel(words, h.label, right - 4, Y(h.y) - 6, h.tone ?? "angle", "end");
  }
  for (const v of chart.vlines ?? []) {
    shapes.push(rpNode("line", { class: "rp-ray rp-solid", "data-tone": v.tone ?? "angle", x1: X(v.x), y1: top, x2: X(v.x), y2: bottom }));
  }
  for (const series of chart.series ?? []) {
    shapes.push(rpNode("polyline", { class: "rp-curve" + (series.dashed ? " rp-dashed" : "") + (series.dotted ? " rp-dotted" : ""), "data-tone": series.tone,
      points: series.pts.map(([x, y]) => X(x).toFixed(1) + "," + Y(y).toFixed(1)).join(" ") }));
    if (series.label) {
      const [lx, ly] = series.labelAt ?? series.pts.at(-1);
      rpLabel(words, series.label, X(lx) + (series.labelDx ?? 6), Y(ly) + (series.labelDy ?? -6), series.tone, series.labelAnchor ?? "start");
    }
  }
  for (const dot of chart.dots ?? []) {
    shapes.push(rpNode("circle", { class: "rp-dot" + (dot.hollow ? " rp-hollow" : ""), "data-tone": dot.tone, cx: X(dot.x), cy: Y(dot.y), r: dot.r ?? 5 }));
    if (dot.label) rpLabel(words, dot.label, X(dot.x) + 8, Y(dot.y) - 8, dot.tone, "start");
  }
}

function rpDrawBars(bars, box, shapes, words) {
  const left = box.x + 40, right = box.x + box.w - 10, top = 48, bottom = 246, max = bars.max ?? 1;
  const Y = v => bottom - (Math.max(0, Math.min(v, max)) / max) * (bottom - top);
  let grid = "";
  for (const v of [0, max / 2, max]) {
    grid += "M" + left + " " + Y(v) + "H" + right;
    words.push(rpNode("text", { class: "rp-tick", x: left - 6, y: Y(v) + 4, "text-anchor": "end" }, rpFmt(v)));
  }
  shapes.push(rpNode("path", { class: "rp-grid", d: grid }));
  shapes.push(rpNode("path", { class: "rp-axis", d: "M" + left + " " + top + "V" + bottom + "H" + right }));
  words.push(rpNode("text", { class: "rp-caption", x: (left + right) / 2, y: top - 22, "text-anchor": "middle" }, bars.caption));
  const slot = (right - left) / bars.items.length;
  bars.items.forEach((bar, index) => {
    const x = left + slot * index + slot * 0.2, w = slot * 0.6, y = Y(bar.value);
    shapes.push(rpNode("rect", { class: "rp-bar" + (bar.outline ? " rp-hollow" : ""), "data-tone": bar.tone, x, y, width: w, height: Math.max(0, bottom - y) }));
    if (bar.target !== undefined) {
      shapes.push(rpNode("line", { class: "rp-ray rp-solid", "data-tone": "angle", x1: x - 4, y1: Y(bar.target), x2: x + w + 4, y2: Y(bar.target) }));
    }
    words.push(rpNode("text", { class: "rp-label", "data-tone": bar.tone, x: x + w / 2, y: bottom + 20, "text-anchor": "middle" }, bar.label));
    words.push(rpNode("text", { class: "rp-label", "data-tone": bar.tone, x: x + w / 2, y: Math.max(top - 4, y - 8), "text-anchor": "middle" }, bar.text ?? rpFmt(bar.value)));
  });
}

// ---------------------------------------------------------------------------
// 3D views. World coordinates have z up. The view turns by yaw about z and
// tilts by an elevation angle; the SVG fallback and Three.js share rpFrame,
// so SVG labels line up with the WebGL picture.
// ---------------------------------------------------------------------------

const RP_VIEW = { cx: 280, cy: 152 };
const RP_BLOCH_R = 112;
const RP_BENCH_SCALE = 78;

function rpFrame(yaw, tilt) {
  const y = yaw * Math.PI / 180, t = tilt * Math.PI / 180;
  return {
    right: [-Math.sin(y), Math.cos(y), 0],
    up: [-Math.sin(t) * Math.cos(y), -Math.sin(t) * Math.sin(y), Math.cos(t)],
    toward: [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)]
  };
}
const rpDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rpProject = (frame, point, scale) => ({
  x: RP_VIEW.cx + scale * rpDot3(frame.right, point),
  y: RP_VIEW.cy - scale * rpDot3(frame.up, point),
  depth: rpDot3(frame.toward, point)
});
// The bench is seen from the −y side: turn 0 means yaw −90°.
const rpBenchFrame = view => rpFrame(-90 + view.turn, view.tilt);

function rpBlochPoint({ polar, azimuth }) {
  const t = polar * Math.PI / 180, p = azimuth * Math.PI / 180;
  return [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
}

function rpDrawSphere(view, shapes, words) {
  const frame = rpFrame(view.yaw, view.tilt);
  const P = point => rpProject(frame, point, RP_BLOCH_R);
  shapes.push(rpNode("circle", { class: "rp-sphere", cx: RP_VIEW.cx, cy: RP_VIEW.cy, r: RP_BLOCH_R }));
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
    shapes.push(rpNode("path", { class: "rp-wire", d: front }));
    shapes.push(rpNode("path", { class: "rp-wire rp-back", d: back }));
  }
  const axes = [[[0, 0, 1], "|0⟩"], [[0, 0, -1], "|1⟩"], [[1, 0, 0], "|+⟩"], [[-1, 0, 0], "|−⟩"], [[0, 1, 0], "|+i⟩"], [[0, -1, 0], "|−i⟩"]];
  for (const [direction, name] of axes) {
    const end = P(direction.map(n => n * 1.18)), start = P([0, 0, 0]);
    shapes.push(rpNode("line", { class: "rp-axis" + (end.depth < -0.05 ? " rp-back" : ""), x1: start.x, y1: start.y, x2: end.x, y2: end.y }));
    const tag = P(direction.map(n => n * 1.34));
    words.push(rpNode("text", { class: "rp-tick" + (tag.depth < -0.05 ? " rp-back" : ""), x: tag.x, y: tag.y + 4, "text-anchor": "middle" }, name));
  }
  if (view.shown) {
    const q = P(view.shown), o = P([0, 0, 0]);
    shapes.push(rpNode("line", { class: "rp-arrow", "data-tone": "plus", x1: o.x, y1: o.y, x2: q.x, y2: q.y }));
  }
  const points = [...(view.points ?? [])];
  if (view.shown) points.push({ point: view.shown, tone: "plus", label: "|ψ⟩", size: 7 });
  points.sort((a, b) => P(a.point).depth - P(b.point).depth);
  for (const item of points) {
    const q = P(item.point);
    shapes.push(rpNode("circle", { class: "rp-dot" + (q.depth < -0.02 ? " rp-back" : ""), "data-tone": item.tone, cx: q.x, cy: q.y, r: item.size ?? 4 }));
    if (item.label) {
      words.push(rpNode("text", { class: "rp-label" + (q.depth < -0.02 ? " rp-back" : ""), "data-tone": item.tone, x: q.x + 11, y: q.y - 9, "text-anchor": "start" }, item.label));
    }
  }
}

// Bench parts as flat plates: [centre, half-width direction, half-width, height].
const RP_DIAG = [Math.SQRT1_2, Math.SQRT1_2];
function rpBenchParts(m) {
  const B = RP_BENCH;
  return [
    { at: B.src, dir: [0, 1], w: 0.22, h: 0.4, tone: "angle", label: "source" },
    { at: B.bs1, dir: RP_DIAG, w: 0.3, h: 0.45, tone: "ink", label: "splitter 1", glass: true },
    { at: B.mu, dir: RP_DIAG, w: 0.3, h: 0.45, tone: "guide", label: "mirror" },
    { at: B.ml, dir: RP_DIAG, w: 0.3, h: 0.45, tone: "guide", label: "mirror" },
    { at: B.ps, dir: [0, 1], w: 0.24, h: 0.5, tone: "angle", label: "θ = " + rpFmt(m.theta) + "°" },
    ...(m.bs2 ? [{ at: B.bs2, dir: RP_DIAG, w: 0.3, h: 0.45, tone: "ink", label: "splitter 2", glass: true }] : []),
    ...(m.up ? [] : [{ at: B.blockUp, dir: [0, 1], w: 0.22, h: 0.5, tone: "warn", label: "block" }]),
    ...(m.low ? [] : [{ at: B.blockLow, dir: [0, 1], w: 0.22, h: 0.5, tone: "warn", label: "block" }]),
    { at: B.d0, dir: [0, 1], w: 0.26, h: 0.55, tone: "plus", label: "D0 " + rpFmt(m.p0), glow: m.p0 },
    { at: B.d1, dir: [1, 0], w: 0.26, h: 0.55, tone: "minus", label: "D1 " + rpFmt(m.p1), glow: m.p1 }
  ];
}
const RP_BEAM_Z = 0.22;
// Dots drift along each lit beam to show light flowing; they stop under reduced effects.
function rpBenchPhotons(beams, clock) {
  if (clock === null || clock === undefined) return [];
  const dots = [];
  for (const beam of beams) {
    if (beam.s < 0.01) continue;
    const length = Math.hypot(beam.b[0] - beam.a[0], beam.b[1] - beam.a[1]);
    const count = Math.max(1, Math.round(length * 2));
    for (let k = 0; k < count; k++) {
      const f = ((k / count) + clock * 0.45 / length) % 1;
      dots.push({ p: [beam.a[0] + (beam.b[0] - beam.a[0]) * f, beam.a[1] + (beam.b[1] - beam.a[1]) * f, RP_BEAM_Z], s: beam.s, out: beam.out });
    }
  }
  return dots;
}

function rpDrawBench(view, shapes, words) {
  const frame = rpBenchFrame(view);
  const P = point => rpProject(frame, point, RP_BENCH_SCALE);
  const poly = points => points.map(p => { const q = P(p); return q.x.toFixed(1) + "," + q.y.toFixed(1); }).join(" ");
  shapes.push(rpNode("polygon", { class: "rp-table", points: poly([[-3, -1.9, 0], [3, -1.9, 0], [3, 1.75, 0], [-3, 1.75, 0]]) }));
  for (const beam of view.beams) {
    if (beam.s < 0.005) continue;
    const a = P([...beam.a, RP_BEAM_Z]), b = P([...beam.b, RP_BEAM_Z]);
    shapes.push(rpNode("line", { class: "rp-beam", "data-tone": beam.out ? "plus" : "angle", x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      "stroke-width": (1.5 + 6 * beam.s).toFixed(1), "stroke-opacity": (0.35 + 0.65 * beam.s).toFixed(2) }));
  }
  const parts = rpBenchParts(view.model).sort((p, q) => P([...p.at, 0]).depth - P([...q.at, 0]).depth);
  for (const part of parts) {
    const [dx, dy] = part.dir, [x, y] = part.at, w = part.w, h = part.h;
    const corners = [[x - dx * w, y - dy * w, 0], [x + dx * w, y + dy * w, 0], [x + dx * w, y + dy * w, h], [x - dx * w, y - dy * w, h]];
    shapes.push(rpNode("polygon", { class: "rp-part", "data-tone": part.tone, points: poly(corners),
      "fill-opacity": part.glow !== undefined ? (0.25 + 0.75 * part.glow).toFixed(2) : null }));
    const tag = P([x, y, h + 0.25]);
    rpLabel(words, part.label, tag.x, tag.y, part.tone);
  }
  for (const dot of rpBenchPhotons(view.beams, view.clock)) {
    const q = P(dot.p);
    shapes.push(rpNode("circle", { class: "rp-dot", "data-tone": dot.out ? "plus" : "angle", cx: q.x, cy: q.y, r: (1.6 + 2.4 * dot.s).toFixed(1) }));
  }
}

// One WebGL renderer for both 3D stations; each scene is built the first time it is drawn.
function rpCreateGraphics(THREE, canvas, colors) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const camera = new THREE.OrthographicCamera(-RP_VIEW.cx, 560 - RP_VIEW.cx, RP_VIEW.cy, RP_VIEW.cy - 300, 1, 2000);
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
    const dots = pool(group, keep(new THREE.SphereGeometry(1, 20, 14)));
    return {
      draw(view) {
        place(group, RP_BLOCH_R, rpFrame(view.yaw, view.tilt));
        const points = [...(view.points ?? [])];
        if (view.shown) points.push({ point: view.shown, tone: "plus", size: 7 });
        stem.visible = Boolean(view.shown);
        if (view.shown) stemGeometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...view.shown)]);
        dots(points.length, (mesh, k) => {
          mesh.material = basic(points[k].tone);
          mesh.position.set(...points[k].point);
          mesh.scale.setScalar((points[k].size ?? 4) / RP_BLOCH_R);
        });
        renderer.render(scene, camera);
      }
    };
  }

  function buildBench() {
    const scene = new THREE.Scene();
    lit(scene);
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    scene.add(group);
    const table = new THREE.Mesh(keep(new THREE.BoxGeometry(6, 3.65, 0.06)), keep(new THREE.MeshLambertMaterial({ color: colors.table })));
    table.position.set(0, -0.075, -0.03);
    group.add(table);
    const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));
    const beamGeometry = keep(new THREE.CylinderGeometry(1, 1, 1, 12));
    const glass = keep(new THREE.MeshLambertMaterial({ color: colors.glass, transparent: true, opacity: 0.45, depthWrite: false }));
    const lambert = new Map();
    const solid = (tone, glow = null) => {
      const key = tone + (glow === null ? "" : ":" + glow.toFixed(2));
      if (!lambert.has(key)) {
        const color = new THREE.Color(colors[tone] ?? colors.plus);
        lambert.set(key, keep(new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow === null ? 0.15 : 0.1 + 0.9 * glow })));
      }
      return lambert.get(key);
    };
    const beamMaterial = new Map();
    const beamLook = (tone, s) => {
      const key = tone + ":" + s.toFixed(2);
      if (!beamMaterial.has(key)) beamMaterial.set(key, keep(new THREE.MeshBasicMaterial({ color: colors[tone], transparent: true, opacity: 0.35 + 0.6 * s })));
      return beamMaterial.get(key);
    };
    const plates = pool(group, unitBox);
    const beams = pool(group, beamGeometry);
    const photons = pool(group, keep(new THREE.SphereGeometry(1, 12, 8)));
    return {
      draw(view) {
        place(group, RP_BENCH_SCALE, rpBenchFrame(view));
        const parts = rpBenchParts(view.model);
        plates(parts.length, (mesh, k) => {
          const part = parts[k];
          mesh.material = part.glass ? glass : solid(part.tone, part.glow === undefined ? null : Math.round(part.glow * 20) / 20);
          mesh.position.set(part.at[0], part.at[1], part.h / 2);
          mesh.scale.set(part.w * 2, 0.05, part.h);
          mesh.rotation.set(0, 0, Math.atan2(part.dir[1], part.dir[0]));
        });
        const shining = view.beams.filter(beam => beam.s >= 0.005);
        beams(shining.length, (mesh, k) => {
          const beam = shining[k], dx = beam.b[0] - beam.a[0], dy = beam.b[1] - beam.a[1];
          mesh.material = beamLook(beam.out ? "plus" : "angle", Math.round(beam.s * 20) / 20);
          mesh.position.set((beam.a[0] + beam.b[0]) / 2, (beam.a[1] + beam.b[1]) / 2, RP_BEAM_Z);
          const r = 0.012 + 0.035 * beam.s;
          mesh.scale.set(r, Math.hypot(dx, dy), r);
          mesh.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
        });
        const dots = rpBenchPhotons(view.beams, view.clock);
        photons(dots.length, (mesh, k) => {
          mesh.material = basic(dots[k].out ? "plus" : "angle");
          mesh.position.set(...dots[k].p);
          mesh.scale.setScalar((1.6 + 2.4 * dots[k].s) / RP_BENCH_SCALE);
        });
        renderer.render(scene, camera);
      }
    };
  }

  return {
    draw(kind, view, width, height, low) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
      renderer.setSize(width, height, false);
      scenes[kind] ??= kind === "sphere" ? buildSphere() : buildBench();
      scenes[kind].draw(view);
    },
    invalidate() { /* Geometry lives on the GPU only while drawing; nothing to rebuild. */ },
    dispose() {
      for (const item of disposables) item.dispose();
      renderer.dispose();
    }
  };
}

const lesson = document.querySelector(".site-main.relative-phase-lesson");
if (lesson) {
  initializeLab(lesson);
  // The arcade is optional. If it fails, the lab above keeps working.
  try {
    initializeRelativePhaseArcade(lesson);
  } catch (error) {
    console.error("Relative Phase Arcade could not start.", error);
  }
}