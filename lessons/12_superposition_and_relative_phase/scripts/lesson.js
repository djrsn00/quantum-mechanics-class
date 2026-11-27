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

const lesson = document.querySelector(".site-main.relative-phase-lesson");
if (lesson) initializeLab(lesson);