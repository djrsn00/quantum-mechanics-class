(() => {
  "use strict";

  const lesson = document.querySelector(".site-main.waves-lesson");
  const sceneHost = lesson?.querySelector("#waves-scene");
  if (!sceneHost) return;

  const get = id => lesson.querySelector("#" + id);
  const query = selector => lesson.querySelector(selector);
  const all = selector => [...lesson.querySelectorAll(selector)];
  const set = (id, text) => { get(id).textContent = text; };
  const value = id => get(id).value;
  const num = id => Number(value(id));
  const click = (id, fn) => get(id).addEventListener("click", fn);
  const watch = (ids, fn, event = "change") => ids.forEach(id => get(id).addEventListener(event, fn));
  const TAU = 2 * Math.PI;
  const rad = deg => deg * Math.PI / 180;
  const normal = deg => ((deg % 360) + 360) % 360;
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  const clean = n => Math.abs(n) < 1e-12 ? 0 : n;
  const fmt = n => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2).replace("-", "−");
  const signed = n => n >= 0.005 ? "+" + fmt(n) : fmt(n);
  const sequence = count => Array.from({ length: count }, (_, i) => i);
  const wave = (a, lambda, f, phase, x, t) => a * Math.cos(TAU * (x / lambda - f * t) + phase);
  const magnitude = (a, b, phase) => clean(Math.hypot(a + b * Math.cos(phase), b * Math.sin(phase)));

  function pair(a, b, phase, x, t) {
    const p = TAU * (x / 4 - 0.5 * t);
    const y1 = clean(wave(a, 4, 0.5, 0, x, t));
    const y2 = clean(wave(b, 4, 0.5, phase, x, t));
    return { y1, y2, sum: clean(y1 + y2), p, q: p + phase, R: magnitude(a, b, phase) };
  }

  function answer(id, status) {
    const raw = value(id).trim().replace(/−/g, "-");
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) && Number.isFinite(Number(raw))) return Number(raw);
    get(id).setAttribute("aria-invalid", "true");
    set(status, "Enter a number in the answer field.");
    get(id).focus();
    return null;
  }
  all('input[type="text"]').forEach(el => el.addEventListener("input", () => el.removeAttribute("aria-invalid")));

  function numericControls(ids, start, apply) {
    let current = start;
    watch(ids, () => {
      const numbers = ids.map(num);
      const invalid = ids.map(get).find((el, i) => !el.value || !Number.isFinite(numbers[i]) || !el.validity.valid);
      if (invalid) {
        invalid.setAttribute("aria-invalid", "true");
        invalid.setCustomValidity("Enter a value within the allowed range and step size. The model still uses the last accepted settings.");
        invalid.reportValidity();
        invalid.setCustomValidity("");
        return;
      }
      ids.forEach(id => get(id).removeAttribute("aria-invalid"));
      if (numbers.some((n, i) => n !== current[i])) {
        current = numbers;
        apply();
      }
    });
    return () => current;
  }

  function choose(id, status) {
    const selected = value(id);
    if (selected) return selected;
    set(status, "Choose an answer before checking.");
    get(id).focus();
    return "";
  }

  // Original interference lab
  const mainIds = ["waves-a1", "waves-a2", "waves-phase", "waves-probe"];
  const main = { t: 0, revealed: false };
  const presets = { aligned: [1, 1, 0], partial: [1, 1, 120], cancel: [1, 1, 180], unequal: [1, 0.5, 180] };
  const readMain = () => mainIds.map(num);
  const rounded = n => Math.round(Number(n.toFixed(2)) * 100);

  function mainReadouts() {
    const [a, b, d, x] = readMain();
    const p = pair(a, b, rad(d), x, main.t);
    set("waves-time", fmt(main.t) + " s");
    set("waves-y1", signed(p.y1) + " cm");
    set("waves-y2", signed(p.y2) + " cm");
    set("waves-probe-location", fmt(x) + " m");
    const terms = rounded(p.y1) + rounded(p.y2);
    set("waves-probe-equation", main.revealed
      ? `${signed(p.y1)} cm + (${signed(p.y2)} cm) ${terms === rounded(p.sum) ? "=" : "≈"} ${signed(p.sum)} cm` : "—");
    set("waves-result-amplitude", main.revealed ? fmt(p.R) + " cm" : "—");
  }

  function renderMain() {
    const [a, b, d, x] = readMain();
    const shown = [a.toFixed(1) + " cm", b.toFixed(1) + " cm", d + "°", fmt(x) + " m"];
    const spoken = [a.toFixed(1) + " centimetres", b.toFixed(1) + " centimetres", d + " degrees", fmt(x) + " metres"];
    mainIds.forEach((id, i) => {
      set(id + "-value", shown[i]);
      get(id).setAttribute("aria-valuetext", spoken[i]);
    });
    get("waves-plot-sum").hidden = !main.revealed;
    get("waves-sum-readouts").hidden = !main.revealed;
    get("waves-sum-placeholder").hidden = main.revealed;
    get("waves-hide-sum").hidden = !main.revealed;
    get("waves-reveal-sum").hidden = main.revealed;
    mainReadouts();
    refresh("main");
  }

  function react(message) {
    set("waves-prediction-feedback", "Lab assistant · " + message);
  }

  function changeMain() {
    restoreMain();
    get("waves-guess").value = "";
    react(main.revealed ? "The sum now uses the new setup. Hide it to make a fresh prediction."
      : "Make a new prediction for the current setup.");
    renderMain();
  }

  watch(mainIds.slice(0, 3), changeMain, "input");
  watch(["waves-probe"], () => { restoreMain(); renderMain(); }, "input");
  all("[data-waves-preset]").forEach(button => button.addEventListener("click", () => {
    presets[button.dataset.wavesPreset].forEach((n, i) => { get(mainIds[i]).value = n; });
    changeMain();
  }));
  click("waves-reveal-sum", () => {
    restoreMain();
    const guess = value("waves-guess");
    if (!guess) {
      react("Choose a prediction or select “Show me the sum first.”");
      get("waves-guess").focus();
      return;
    }
    const [a, b, d] = readMain();
    const R = magnitude(a, b, rad(d));
    const hundredths = rounded(R);
    const matches = guess === "other" ? ![0, 50, 100, 200].includes(hundredths) : hundredths === rounded(Number(guess));
    main.revealed = true;
    renderMain();
    const result = guess === "skip" ? "" : matches ? "Your prediction matches the readout. "
      : `Your prediction differs from the displayed ${fmt(R)} cm. `;
    const reason = R === 0 ? "The resultant is flat at every position for all times."
      : `The whole sum wave has amplitude ${fmt(R)} cm. Move the probe to see how the instantaneous reading varies.`;
    react(result + reason);
    get("waves-hide-sum").focus({ preventScroll: true });
  });
  click("waves-hide-sum", () => {
    restoreMain();
    main.revealed = false;
    get("waves-guess").value = "";
    renderMain();
    react("Sum hidden. Choose a prediction for the current setup.");
    get("waves-guess").focus({ preventScroll: true });
  });
  click("waves-play", () => togglePlay("main"));
  click("waves-step", () => {
    pause();
    main.t += 0.25;
    restoreMain();
    renderMain();
    set("waves-lab-status", `Advanced 0.25 s. Paused at ${fmt(main.t)} s.`);
  });
  click("waves-reset", () => {
    pause();
    Object.assign(main, { t: 0, revealed: false });
    [1, 1, 0, 2].forEach((n, i) => { get(mainIds[i]).value = n; });
    restoreMain();
    changeMain();
    set("waves-lab-status", "Lab reset. Paused at 0.00 s with the sum hidden.");
  });

  const quiz = [
    ["flat", { probe: "A nonzero wave can cross equilibrium at one point. Check the whole plot.",
      flat: "Correct. The sum stays zero everywhere as time advances.",
      equal: "Equal amplitudes can reinforce or cancel. Compare 0° and 180°." }],
    ["half", { zero: "The larger wave has 0.5 cm left over. Try the unequal preset.",
      half: "Correct. The waves oppose each other. Subtracting 0.5 cm from 1 cm leaves 0.5 cm.",
      "one-and-half": "The waves oppose each other at 180°. Subtract their amplitudes." }],
    ["transverse", { rides: "The crest travels right. Step with the probe fixed and watch the point.",
      transverse: "Correct. The point moves vertically at a fixed horizontal position.",
      stays: "A point can cross equilibrium during its cycle. Step again to see it move." }]
  ];
  const questions = all("[data-waves-question]");
  const quizControls = get("waves-challenge-controls");
  const next = get("waves-next-question");
  let question = 0;
  quizControls.addEventListener("click", event => {
    const button = event.target.closest("[data-waves-answer]");
    if (!button || !questions[question]?.contains(button)) return;
    const [correct, feedback] = quiz[question];
    const selected = button.dataset.wavesAnswer;
    set("waves-challenge-feedback", feedback[selected]);
    next.hidden = selected !== correct;
    next.textContent = question === 2 ? "Finish checkout" : "Next question";
  });
  click("waves-next-question", () => {
    if (next.hidden) return;
    next.hidden = true;
    question += 1;
    if (question === quiz.length) {
      quizControls.disabled = true;
      set("waves-challenge-progress", "Checkout complete");
      set("waves-challenge-feedback", "You distinguished instantaneous displacement, whole-wave amplitude, and transverse motion.");
      const bridge = get("waves-bridge-title");
      bridge.tabIndex = -1;
      bridge.focus();
      return;
    }
    questions[question - 1].hidden = true;
    questions[question].hidden = false;
    set("waves-challenge-progress", `Question ${question + 1} of ${quiz.length}`);
    set("waves-challenge-feedback", "Choose an answer. You can retry after reading the feedback.");
    questions[question].querySelector("h4").focus();
  });

  // Wave Builder
  let buildTime = 0;
  let buildBase = { a: 0.5, speed: 2 };
  let marks = [];
  const builder = numericControls(["builder-a", "builder-lambda", "builder-f", "builder-phase"], [0.5, 4, 0.5, 0], () => {
    clearMarks();
    renderBuilder();
  });
  function buildAt(x) {
    const [a, lambda, f, d] = builder();
    return wave(a, lambda, f, rad(d), x, buildTime);
  }
  function renderBuilder() {
    const [, lambda, f] = builder();
    set("builder-reading", `Time ${fmt(buildTime)} s · Speed ${fmt(lambda * f)} m/s · Period ${fmt(1 / f)} s · Point at 2.00 m reads ${signed(buildAt(2))} cm.`);
    refresh("builder");
  }
  function options(id, values, selected = "") {
    get(id).replaceChildren(...values.map(([key, text]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = text;
      return option;
    }));
    get(id).value = String(selected);
  }
  function clearMarks() {
    marks = [];
    ["builder-mark-a", "builder-mark-b"].forEach(id => {
      options(id, [["", "Freeze a wave first"]]);
      get(id).disabled = true;
    });
    get("builder-mark-check").disabled = true;
    set("builder-mark-feedback", "");
  }
  function buildStep(t) {
    buildTime = t;
    clearMarks();
    renderBuilder();
  }
  click("builder-step", () => buildStep(buildTime + 0.25));
  click("builder-rewind", () => buildStep(0));
  click("builder-pin", () => {
    const [a, lambda, f] = builder();
    const status = "builder-speed-feedback";
    if (a <= 0 || a > 1) {
      set(status, "Save an amplitude from 0.10 to 1.00 cm so it can be doubled.");
      return;
    }
    buildBase = { a, speed: lambda * f };
    set("builder-baseline", `Saved baseline · ${fmt(a)} cm at ${fmt(buildBase.speed)} m/s.`);
    set(status, "Now double the saved amplitude while keeping its speed.");
  });
  click("builder-double", () => {
    const [a, lambda, f] = builder();
    const passes = close(a, 2 * buildBase.a) && close(lambda * f, buildBase.speed);
    set("builder-speed-feedback", `${passes ? "Correct." : "Compare with the saved pair."} Current amplitude ${fmt(a)} cm and speed ${fmt(lambda * f)} m/s. Doubling amplitude changes displacement. Speed is set by fλ.`);
  });
  click("builder-speed", () => {
    const [, lambda, f] = builder();
    set("builder-speed-feedback", `${close(lambda * f, 2) ? "Target reached." : "Try changing either factor."} ${fmt(f)} Hz × ${fmt(lambda)} m = ${fmt(f * lambda)} m/s.`);
  });
  click("builder-motion-check", () => {
    const status = "builder-motion-feedback";
    if (!builder()[0]) {
      set(status, "Use a nonzero wave to see transverse motion.");
      return;
    }
    const selected = choose("builder-motion-guess", status);
    if (!selected) return;
    const prev = buildAt(2);
    buildStep(buildTime + 0.25);
    set(status, `${selected === "fixed" ? "Correct." : "Check the coordinates."} The marked point stayed at x = 2.00 m. Displacement was ${signed(prev)} cm and is now ${signed(buildAt(2))} cm. Equal readings at two instants are possible even during an oscillation.`);
  });
  click("builder-mark", () => {
    const [a, lambda, f, d] = builder();
    if (!a) {
      set("builder-mark-feedback", "Set a nonzero amplitude to identify crests and troughs.");
      return;
    }
    const offset = normal(360 * (f * buildTime % 1) - d) / 360;
    marks = sequence(15).map(i => (offset + (i - 2) / 2) * lambda)
      .filter(x => x >= -1e-9 && x <= 12 + 1e-9)
      .map((x, i) => ({ label: "M" + (i + 1), x: clean(x) }));
    const choices = [["", "Choose a position"], ...marks.map((m, i) => [i, `${m.label} · ${fmt(m.x)} m · ${buildAt(m.x) > 0 ? "crest" : "trough"}`])];
    ["builder-mark-a", "builder-mark-b"].forEach(id => { options(id, choices); get(id).disabled = false; });
    get("builder-mark-check").disabled = false;
    set("builder-mark-feedback", "The current snapshot is marked. Choose two matching adjacent extrema.");
    refresh("builder");
  });
  click("builder-mark-check", () => {
    const status = "builder-mark-feedback";
    const a = choose("builder-mark-a", status);
    const b = a && choose("builder-mark-b", status);
    if (!b) return;
    const distance = Math.abs(marks[a].x - marks[b].x);
    set(status, close(distance, builder()[1])
      ? `Correct. ${fmt(distance)} m separates these adjacent matching points.`
      : `Those points are ${fmt(distance)} m apart. Look for neighboring crests or neighboring troughs.`);
  });

  // Pulse Collision
  let pulseTime = 0;
  let pulsePrediction = null;
  const pulse = numericControls(["pulse-p", "pulse-q", "pulse-wp", "pulse-wq"], [1, 1, 1, 1], () => {
    pulsePrediction = null;
    set("pulse-after-feedback", "Pulse settings changed. Lock in a new prediction before they cross.");
    set("pulse-overlap-feedback", "");
    set("pulse-unequal-feedback", "");
    renderPulse();
  });
  const centers = t => [4 + 2 * t, 16 - 2 * t];
  function pulseAt(x, t = pulseTime) {
    const [a, b, u, v] = pulse();
    const [p, q] = centers(t);
    return [a * Math.exp(-(((x - p) / u) ** 2)), b * Math.exp(-(((x - q) / v) ** 2))];
  }
  function renderPulse() {
    const [p, q] = centers(pulseTime);
    const [a, b] = pulseAt(10);
    set("pulse-reading", `Time ${fmt(pulseTime)} s · P center ${fmt(p)} m · Q center ${fmt(q)} m · Sum at 10 m ${signed(a + b)} cm.`);
    get("pulse-step").disabled = pulseTime >= 6;
    refresh("pulse");
  }
  function movePulse(t) { pulseTime = t; renderPulse(); }
  click("pulse-before", () => movePulse(0));
  click("pulse-overlap", () => movePulse(3));
  click("pulse-step", () => {
    const wasFocused = document.activeElement === get("pulse-step");
    movePulse(Math.min(6, pulseTime + 0.5));
    if (pulseTime === 6 && wasFocused) get("pulse-before").focus();
  });
  click("pulse-check-up", () => {
    movePulse(3);
    const [a, b] = pulseAt(10);
    set("pulse-overlap-feedback", a > 0 && b > 0
      ? `At their shared center the peak is ${fmt(a)} + ${fmt(b)} = ${fmt(a + b)} cm.`
      : "Set both signed heights above zero for the upward overlap mission.");
  });
  click("pulse-check-zero", () => {
    movePulse(3);
    const [a, b, u, v] = pulse();
    const center = signed(a + b);
    set("pulse-overlap-feedback", a * b < 0 && close(a + b, 0) && close(u, v)
      ? "Complete cancellation at overlap. The equal opposite profiles add to zero at every position."
      : `The center reads ${center} cm. For two nonzero pulses to cancel everywhere, use equal opposite heights and equal widths.`);
  });
  click("pulse-commit", () => {
    const status = "pulse-after-feedback";
    if (pulseTime >= 3 || !pulse()[0] || !pulse()[1]) {
      set(status, "Rewind before overlap and use two nonzero pulses before locking in.");
      return;
    }
    const predictions = [];
    for (const suffix of ["direction", "sign", "shape"]) {
      const selected = choose("pulse-guess-" + suffix, status);
      if (!selected) return;
      predictions.push(selected);
    }
    pulsePrediction = predictions;
    set(status, "Prediction locked. Step until the centers are well separated after 5.5 s.");
  });
  click("pulse-check-after", () => {
    const status = "pulse-after-feedback";
    if (!pulsePrediction || pulseTime < 5.5) {
      set(status, "Lock in all three predictions before crossing, then observe at 5.5 s or later.");
      return;
    }
    const [a, b, u, v] = pulse();
    const [p, q] = centers(pulseTime);
    const matches = pulsePrediction.filter(item => item === "keep").length;
    set(status, `${matches} of 3 predictions matched. P continues right at ${fmt(p)} m, height ${signed(a)} cm and width ${fmt(u)} m. Q continues left at ${fmt(q)} m, height ${signed(b)} cm and width ${fmt(v)} m. Linear superposition leaves both profiles intact.`);
  });
  click("pulse-check-unequal", () => {
    const status = "pulse-unequal-feedback";
    const [a, b] = pulse();
    if (a * b >= 0 || close(a + b, 0)) {
      set(status, "Choose opposite signs and unequal magnitudes.");
      return;
    }
    const predicted = answer("pulse-unequal-guess", status);
    if (predicted === null) return;
    movePulse(3);
    const [p, q] = pulseAt(10);
    set(status, `${close(predicted, p + q) ? "Correct." : "Compare the signed addition."} At the shared center, ${signed(p)} cm plus ${signed(q)} cm gives ${signed(p + q)} cm.`);
  });

  // Standing Wave Studio
  let standTime = 0;
  let standBase = null;
  let standForecast = false;
  const standing = numericControls(["stand-l", "stand-n"], [3, 2], () => {
    if (playing === "stand") pause();
    standTime = 0;
    standForecast = Boolean(standBase);
    buildStandChoices();
    renderStand();
  });
  function standModel() {
    const [L, n] = standing();
    return { L, n, lambda: 2 * L / n, f: n / L, period: L / n, k: n * Math.PI / L };
  }
  function standAt(m, x, t) {
    const a = m.k * x;
    const b = TAU * m.f * t;
    return [Math.sin(a - b), Math.sin(a + b), clean(2 * Math.sin(a) * Math.cos(b))];
  }
  function standPoints(m) {
    return sequence(2 * m.n + 1).map(i => ({ i, x: i * m.L / (2 * m.n), name: "P" + i }));
  }
  function buildStandChoices() {
    const points = standPoints(standModel());
    const choices = points.map(({ i, x, name }) => [i, `${name} · ${fmt(x)} m`]);
    options("stand-probe", choices, 1);
    ["stand-node", "stand-antinode"].forEach(id => options(id, [["", "Choose a point"], ...choices]));
    get("stand-zero-points").replaceChildren(...points.map(({ i, x, name }) => {
      const label = document.createElement("label");
      label.className = "wave-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = i;
      label.append(input, ` ${name} · ${fmt(x)} m`);
      return label;
    }));
    ["stand-pair-feedback", "stand-zero-feedback", "stand-lambda-feedback"].forEach(id => set(id, ""));
  }
  function standReadouts() {
    const m = standModel();
    const point = standPoints(m)[num("stand-probe")];
    const [a, b, s] = standAt(m, point.x, standTime);
    set("stand-reading", `Time ${fmt(standTime)} s · ${point.name} at ${fmt(point.x)} m · Right ${signed(a)} cm · Left ${signed(b)} cm · Sum ${signed(s)} cm.`);
    set("stand-wavelength", standForecast ? "Wavelength and frequency readouts are hidden for your prediction."
      : `Wavelength ${fmt(m.lambda)} m · Frequency ${fmt(m.f)} Hz.`);
  }
  function renderStand() { standReadouts(); refresh("stand"); }
  watch(["stand-probe"], renderStand);
  click("stand-play", () => togglePlay("stand"));
  click("stand-step", () => {
    if (playing === "stand") pause();
    standTime += standModel().period / 8;
    renderStand();
  });
  click("stand-rewind", () => {
    if (playing === "stand") pause();
    standTime = 0;
    renderStand();
  });
  click("stand-check-mode", () => {
    const { n } = standModel();
    set("stand-pair-feedback", n === 3 ? "Target reached. Mode 3 has three antinodes."
      : `Mode ${n} gives ${n} ${n === 1 ? "antinode" : "antinodes"}. There is one between each pair of neighboring nodes.`);
  });
  click("stand-check-pair", () => {
    const status = "stand-pair-feedback";
    const a = choose("stand-node", status);
    const b = a && choose("stand-antinode", status);
    if (!b) return;
    set(status, Number(a) % 2 === 0 && Number(b) % 2 === 1
      ? `Correct. P${a} always stays at zero. P${b} can reach either extreme at ±2.00 cm.`
      : "Check both points at time zero and then step. A node stays at zero, while an antinode reaches a maximum excursion.");
  });
  click("stand-pin", () => {
    standBase = standModel();
    standForecast = false;
    get("stand-guess-lambda").value = "";
    set("stand-baseline", `Saved L = ${standBase.L} m, n = ${standBase.n}, λ = ${fmt(standBase.lambda)} m. Changing the geometry pauses at 0 s and hides the new wavelength and frequency readouts.`);
    set("stand-lambda-feedback", "");
    renderStand();
  });
  click("stand-check-lambda", () => {
    const status = "stand-lambda-feedback";
    const m = standModel();
    if (!standBase || (m.L === standBase.L && m.n === standBase.n)) {
      set(status, "Save a geometry and then change its length or mode.");
      return;
    }
    const predicted = answer("stand-guess-lambda", status);
    if (predicted === null) return;
    standForecast = false;
    renderStand();
    set(status, `${rounded(predicted) === rounded(m.lambda) ? "Correct." : "Compare with the formula."} λ = 2 × ${m.L} m ÷ ${m.n} = ${fmt(m.lambda)} m.`);
  });
  click("stand-zero-snapshot", () => {
    if (playing === "stand") pause();
    standTime = standModel().period / 4;
    all("#stand-zero-points input").forEach(input => { input.checked = false; });
    renderStand();
    set("stand-zero-feedback", "At one quarter period, the entire sum reads zero. Select the points that stay at zero.");
  });
  click("stand-check-zeros", () => {
    const status = "stand-zero-feedback";
    const m = standModel();
    if (!close(standTime, m.period / 4)) {
      set(status, "Pause at a quarter period to start this comparison.");
      return;
    }
    const selected = all("#stand-zero-points input").filter(el => el.checked).map(el => Number(el.value));
    const zeros = standPoints(m).filter(p => p.i % 2 === 0);
    const correct = selected.length === zeros.length && selected.every(i => i % 2 === 0);
    set(status, `${correct ? "Correct." : "Compare with the permanent nodes."} ${zeros.map(p => p.name).join(", ")} stay at zero. The remaining points read zero in this snapshot because cos(ωt) is zero.`);
  });

  // Beat Frequency Mixer
  const beat = numericControls(["beat-f1", "beat-f2", "beat-probe"], [4, 4.5, 0], renderBeat);
  let beatBase = 0.5;
  let beatPrediction = null;
  function beatsAt(t) {
    const [f1, f2, x] = beat();
    const delay = x / 2 - t;
    const a = Math.cos(TAU * f1 * delay);
    const b = Math.cos(TAU * f2 * delay);
    return [a, b, a + b, 2 * Math.abs(Math.cos(Math.PI * (f2 - f1) * delay))];
  }
  const beatRate = () => Math.abs(beat()[0] - beat()[1]);
  function renderBeat() {
    const t = num("beat-time");
    const rate = beatRate();
    const [a, b, sum] = beatsAt(t);
    set("beat-time-value", fmt(t) + " s");
    set("beat-reading", rate
      ? `Beat rate ${fmt(rate)} Hz · Spacing of envelope maxima ${fmt(1 / rate)} s.`
      : "Beat rate 0.00 Hz · Period: no beats.");
    set("beat-sample", `At ${fmt(t)} s: Wave 1 ${signed(a)} cm · Wave 2 ${signed(b)} cm · Sum ${signed(sum)} cm.`);
    refresh("beat");
  }
  watch(["beat-time"], renderBeat, "input");
  click("beat-check-one", () => {
    const r = beatRate();
    set("beat-rate-feedback", r === 1 ? "Correct. With a 1 Hz difference, envelope maxima are 1 s apart."
      : `The frequency difference is ${fmt(r)} Hz. Aim for a difference of 1 Hz.`);
  });
  click("beat-pin", () => {
    if (!beatRate()) {
      set("beat-rate-feedback", "Save a pair with two distinct frequencies.");
      return;
    }
    beatBase = beatRate();
    set("beat-baseline", `Saved pair · ${fmt(beat()[0])} and ${fmt(beat()[1])} Hz. Beat rate ${fmt(beatBase)} Hz.`);
    set("beat-rate-feedback", "");
  });
  click("beat-check-slow", () => {
    const rate = beatRate();
    const ok = rate > 0 && rate < beatBase;
    set("beat-rate-feedback", `${ok ? "Correct. The envelope maxima are farther apart." : "Choose a smaller, nonzero frequency difference."} Saved rate ${fmt(beatBase)} Hz, current ${fmt(rate)} Hz.`);
  });
  click("beat-check-equal", () => {
    set("beat-rate-feedback", beatRate() === 0
      ? "Correct. At equal frequencies the relative phase stays fixed, so the envelope has constant magnitude."
      : "The frequencies still differ. Equalize them to remove the changing beat envelope.");
  });
  click("beat-commit", () => {
    const status = "beat-spacing-feedback";
    const prediction = choose("beat-guess", status);
    if (!prediction) return;
    if (!beatRate()) {
      set(status, "Start with a nonzero beat rate.");
      return;
    }
    beatPrediction = { rate: beatRate(), prediction };
    set(status, `Prediction locked at spacing ${fmt(1 / beatPrediction.rate)} s. Increase the frequency difference.`);
  });
  click("beat-check-spacing", () => {
    const status = "beat-spacing-feedback";
    const r = beatRate();
    if (!beatPrediction || r <= beatPrediction.rate) {
      set(status, "Lock a prediction with a distinct pair, then increase its frequency difference.");
      return;
    }
    set(status, `${beatPrediction.prediction === "closer" ? "Correct." : "Compare the two spacings."} Beat rate rose from ${fmt(beatPrediction.rate)} to ${fmt(r)} Hz. Maxima went from ${fmt(1 / beatPrediction.rate)} s apart to ${fmt(1 / r)} s apart.`);
  });

  // Ripple Tank
  let tankTime = 0;
  let tankBase = [3, 2, 0];
  const tank = numericControls(["tank-d", "tank-lambda", "tank-phase", "tank-x", "tank-y"], [3, 2, 0, 0, 2], renderTank);
  function tankAt([d, lambda, phase], x, y, t = tankTime) {
    const r1 = Math.hypot(x + d / 2, y);
    const r2 = Math.hypot(x - d / 2, y);
    const k = TAU / lambda;
    const delta = k * (r2 - r1) + rad(phase);
    const theta = k * r1 - Math.PI * t;
    const a = 0.5 * Math.cos(theta);
    const b = 0.5 * Math.cos(theta + delta);
    return { r1, r2, delta, a, b, y: clean(a + b), R: clean(Math.abs(Math.cos(delta / 2))) };
  }
  function renderTank() {
    const m = tank();
    const p = tankAt(m, m[3], m[4]);
    const amplitude = value("tank-view") === "amplitude";
    set("tank-legend", amplitude ? "Height represents local amplitude, from 0.00 to 1.00 cm. In the 2D map, dark is zero and bright is 1.00 cm."
      : "Height shows signed displacement, from −1.00 to +1.00 cm. In the 2D map, violet is negative, dark is zero, and mint is positive. The marker identifies the probe.");
    set("tank-reading", `Time ${fmt(tankTime)} s · Distances ${fmt(p.r1)} and ${fmt(p.r2)} m · Path difference ${signed(p.r2 - p.r1)} m · Local amplitude ${fmt(p.R)} cm.`);
    set("tank-sample", `Source contributions ${signed(p.a)} and ${signed(p.b)} cm · Sum ${signed(p.y)} cm.`);
    refresh("tank");
  }
  watch(["tank-view"], renderTank);
  click("tank-step", () => { tankTime += 0.25; renderTank(); });
  click("tank-rewind", () => { tankTime = 0; renderTank(); });
  for (const name of ["bright", "dark"]) click("tank-check-" + name, () => {
    const m = tank();
    const p = tankAt(m, m[3], m[4]);
    const passed = name === "bright" ? p.R >= 0.95 : p.R <= 0.1;
    set("tank-probe-feedback", `${passed ? "Target reached." : "Try another probe position or phase."} Local amplitude ${fmt(p.R)} cm with total phase difference ${fmt(p.delta / Math.PI)}π. Even multiples of π reinforce. Odd multiples cancel.`);
  });
  click("tank-pin", () => {
    tankBase = tank().slice(0, 3);
    set("tank-baseline", `Saved pattern · d = ${fmt(tankBase[0])} m, λ = ${fmt(tankBase[1])} m, phase = ${tankBase[2]}°.`);
  });
  function bisect(fn, lo, hi) {
    let left = fn(lo);
    for (let i = 0; i < 42; i += 1) {
      const mid = (lo + hi) / 2;
      const center = fn(mid);
      if (Math.abs(center) < 1e-13) return mid;
      if (Math.sign(center) === Math.sign(left)) { lo = mid; left = center; }
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function tankZeros(model) {
    const phaseAt = x => tankAt(model, x, 2, 0).delta;
    const low = phaseAt(4), high = phaseAt(0);
    const positions = [];
    for (let n = Math.ceil((low / Math.PI - 1) / 2 - 1e-12);
      n <= Math.floor((high / Math.PI - 1) / 2 + 1e-12); n += 1) {
      const target = (2 * n + 1) * Math.PI;
      positions.push(close(target, high) ? 0 : close(target, low) ? 4 : bisect(x => phaseAt(x) - target, 0, 4));
    }
    return positions.reverse().map(fmt);
  }
  click("tank-check-spacing", () => {
    const status = "tank-compare-feedback";
    const m = tank();
    if (m[0] === tankBase[0] || m[1] !== tankBase[1] || normal(m[2]) !== normal(tankBase[2])) {
      set(status, "Keep the saved wavelength and phase, then change the source separation.");
      return;
    }
    const a = tankZeros(tankBase), b = tankZeros(m);
    const changed = a.join() !== b.join();
    const describe = xs => xs.length ? xs.join(", ") + " m" : "none on this slice";
    set(status, `${changed ? "The pattern changed." : "These settings give the same listed cancellation locations. Try a larger separation change."} At y = 2 m and x ≥ 0, saved cancellation: ${describe(a)}. Current cancellation: ${describe(b)}.`);
  });
  click("tank-check-phase", () => {
    const status = "tank-compare-feedback";
    const m = tank();
    const [d, lambda, phase, x, y] = m;
    const p = tankAt(m, x, y);
    if (!close(p.r1, p.r2) || normal(phase) !== 180) {
      set(status, "Put the probe at equal distances from the sources and choose 180°.");
      return;
    }
    const base = tankAt([d, lambda, 0], x, y);
    set(status, `Correct. With equal paths, relative source phase alone gives ${fmt(base.R)} cm at 0° and ${fmt(p.R)} cm at 180°.`);
  });

  // Double-Slit Pattern Explorer
  const slit = numericControls(["slit-lambda", "slit-d", "slit-y"], [0.75, 4, 0], renderSlit);
  let slitBase = [0.75, 4];
  let slitPrediction = null;
  let overlay = null;
  const D = 12;
  function screenAt([lambda, d], y) {
    const r1 = Math.hypot(D, y + d / 2);
    const r2 = Math.hypot(D, y - d / 2);
    const difference = r2 - r1;
    return { r1, r2, difference, I: Math.cos(Math.PI * difference / lambda) ** 2 };
  }
  function fringe(model) {
    return bisect(y => Math.abs(screenAt(model, y).difference) - model[0], 0, 10);
  }
  function renderSlit() {
    const m = slit();
    const p = screenAt(m, m[2]);
    set("slit-reading", `Screen y = ${signed(m[2])} m · Paths ${fmt(p.r1)} and ${fmt(p.r2)} m · Difference r₂ − r₁ = ${signed(p.difference)} m · Normalized intensity ${fmt(p.I)}.`);
    set("slit-spacing", `Center to nearest positive bright fringe: ${fmt(fringe(m))} m. Near-axis estimate: ${fmt(m[0] * D / m[1])} m.`);
    refresh("slit");
  }
  click("slit-pin", () => {
    slitBase = slit().slice(0, 2);
    overlay = slitBase;
    set("slit-baseline", `Saved pattern · λ = ${fmt(slitBase[0])} m, d = ${fmt(slitBase[1])} m, spacing ${fmt(fringe(slitBase))} m.`);
    set("slit-result", "");
    refresh("slit");
  });
  click("slit-check-wide", () => {
    const start = fringe(slitBase), end = fringe(slit());
    overlay = slitBase;
    set("slit-result", `${end > start + 1e-9 ? "Spacing increased." : "Try increasing wavelength or reducing separation."} Saved spacing ${fmt(start)} m. Current spacing ${fmt(end)} m.`);
    refresh("slit");
  });
  click("slit-check-center", () => {
    const m = slit();
    const p = screenAt(m, m[2]);
    set("slit-result", m[2] === 0 ? `Correct. Both paths are ${fmt(p.r1)} m, giving zero path difference and intensity 1.00.`
      : "Find y = 0 m, where the two distances agree by symmetry.");
  });
  click("slit-commit", () => {
    const status = "slit-wave-feedback";
    const prediction = choose("slit-guess", status);
    if (!prediction) return;
    const model = slit().slice(0, 2);
    slitPrediction = { model, prediction };
    overlay = null;
    set(status, `Prediction locked with λ = ${fmt(model[0])} m. Increase wavelength at the same separation.`);
    refresh("slit");
  });
  click("slit-check-wave", () => {
    const status = "slit-wave-feedback";
    const m = slit();
    if (!slitPrediction || m[1] !== slitPrediction.model[1] || m[0] <= slitPrediction.model[0]) {
      set(status, "Lock a prediction, then increase wavelength while keeping the slit separation fixed.");
      return;
    }
    overlay = slitPrediction.model;
    set(status, `${slitPrediction.prediction === "wider" ? "Correct." : "Compare the patterns on the same scale."} The nearest bright point moved from ${fmt(fringe(overlay))} m to ${fmt(fringe(m))} m. A longer wavelength needs a larger path difference to reach the next bright fringe.`);
    refresh("slit");
  });
  click("slit-check-class", () => {
    const status = "slit-class-feedback";
    const choice = choose("slit-class", status);
    if (!choice) return;
    const m = slit();
    const p = screenAt(m, m[2]);
    const expected = p.I >= 0.95 ? "bright" : p.I <= 0.05 ? "dark" : "";
    const result = !expected ? "This probe is between the mission thresholds."
      : choice === expected ? "Correct." : "Try the other classification.";
    set(status, `${result} The path difference is ${signed(p.difference / m[0])} wavelengths and intensity is ${fmt(p.I)}. Whole wavelengths are bright and half-integer wavelengths are dark.`);
  });

  // Phase Wheel
  let wheelTime = 0;
  let equalPair = null;
  const wheel = numericControls(["wheel-a1", "wheel-a2", "wheel-phase", "wheel-x"], [1, 1, 0, 2], renderWheel);
  const angle = radians => fmt(normal(radians * 360 / TAU)) + "°";
  function renderWheel() {
    const [a, b, d, x] = wheel();
    const p = pair(a, b, rad(d), x, wheelTime);
    const vertical = a * Math.sin(p.p) + b * Math.sin(p.q);
    const resultPhase = p.R ? angle(Math.atan2(vertical, p.sum)) : "undefined";
    set("wheel-reading", `Time ${fmt(wheelTime)} s · Component angles ${angle(p.p)} and ${angle(p.q)} · Relative phase ${d}° · Resultant ${fmt(p.R)} cm · Resultant phase ${resultPhase}.`);
    set("wheel-projections", `At x = ${fmt(x)} m: projections ${signed(p.y1)} and ${signed(p.y2)} cm · Sum ${signed(p.sum)} cm.`);
    refresh("wheel");
  }
  click("wheel-step", () => { wheelTime += 0.25; renderWheel(); });
  click("wheel-rewind", () => { wheelTime = 0; renderWheel(); });
  for (const task of ["align", "zero", "target"]) click("wheel-check-" + task, () => {
    const [a, b, d] = wheel();
    const r = magnitude(a, b, rad(d));
    const equal = a > 0 && close(a, b);
    const match = task === "align" ? equal && normal(d) === 0
      : task === "zero" ? equal && d === 180
      : a === 1 && b === 1 && Math.abs(r - 1) <= 0.005;
    const hint = task === "align" ? "Use equal nonzero amplitudes at 0° or 360°."
      : task === "zero" ? "Use equal nonzero amplitudes at 180°."
      : "Use two 1.00 cm waves and adjust the phase to match the 1.00 cm target.";
    set("wheel-match-feedback", `Resultant ${fmt(r)} cm. ${match ? "Target reached." : hint}`);
  });
  click("wheel-pin", () => {
    const [a, b, d] = wheel();
    if (!a || !close(a, b) || d !== 180) {
      set("wheel-residual-feedback", "Save a nonzero equal pair at 180°.");
      return;
    }
    equalPair = a;
    set("wheel-baseline", `Saved ${fmt(a)} and ${fmt(b)} cm at 180° · Resultant 0.00 cm.`);
    set("wheel-residual-feedback", "Now make the amplitudes unequal while keeping 180°.");
  });
  click("wheel-check-residual", () => {
    const [a, b, d] = wheel();
    set("wheel-residual-feedback", equalPair !== null && d === 180 && !close(a, b)
      ? `Correct. The saved equal pair canceled. The unequal pair leaves |A₁ − A₂| = ${fmt(Math.abs(a - b))} cm.`
      : "Save an equal pair at 180°, then compare an unequal pair at that phase.");
  });

  // Shared geometry for the Three.js view and its 2D fallback.
  const W = 680, H = 390;
  const blue = "#65b7ff", violet = "#c19bff", mint = "#78f8a6";
  const gold = "#ffe16a", ink = "#ecfff1", grid = "#456b58", muted = "#a6c5b0";
  function diagram(caption) {
    const marks = [];
    return {
      caption, marks,
      line(points, tint = grid, dash = false, width = 1) { marks.push({ type: "line", points, tint, dash, width }); },
      label(x, y, text, tint = ink) { marks.push({ type: "label", x, y, text, tint }); },
      dot(x, y, tint = gold, size = 4) { marks.push({ type: "dot", x, y, tint, size }); }
    };
  }

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motion.matches || get("waves-economy").checked;
  const ratio = () => Math.min(window.devicePixelRatio || 1, reduced() ? 1 : 1.5);
  function samples(n, low, high, fn) {
    return sequence(n + 1).map(i => fn(low + (high - low) * i / n));
  }
  function plot(d, { box, x, y, ticks, yTicks, xUnit, yUnit, tag, probe, traces, sampleCount = 160 }) {
    const [left, top, w, h] = box;
    const X = v => left + (v - x[0]) * w / (x[1] - x[0]);
    const Y = v => top + h - (v - y[0]) * h / (y[1] - y[0]);
    d.line([[left, top], [left, top + h], [left + w, top + h]]);
    if (y[0] < 0 && y[1] > 0) d.line([[left, Y(0)], [left + w, Y(0)]], muted, true);
    for (const tick of ticks) {
      d.line([[X(tick), top + h], [X(tick), top + h + 4]]);
      d.label(X(tick), top + h + 15, String(tick), muted);
    }
    for (const tick of yTicks) {
      d.line([[left - 5, Y(tick)], [left, Y(tick)]]);
      d.label(left - 19, Y(tick), String(tick).replace("-", "−"), muted);
    }
    d.label(left + w - 17, top + h + 30, xUnit, muted);
    d.label(left - 16, top - 12, yUnit, muted);
    if (tag) d.label(left + 85, top - 12, tag);
    if (probe != null) d.line([[X(probe), top], [X(probe), top + h]], gold, true);
    traces.forEach(({ fn, tint, dash, width, mark }) => {
      d.line(samples(sampleCount, x[0], x[1], v => [X(v), Y(fn(v))]), tint, dash, width);
      if (mark && probe != null) d.dot(X(probe), Y(fn(probe)), tint);
    });
    return { X, Y };
  }
  function mainDiagram() {
    const [a, b, d, x] = readMain();
    const phase = rad(d);
    const p = v => pair(a, b, phase, v, main.t);
    const views = [["Wave 1", "y1", blue, false], ["Wave 2", "y2", violet, true]];
    if (main.revealed) views.push(["Sum", "sum", mint, false]);
    const out = diagram("The marked points move vertically. The horizontal coordinate is fixed by the shared probe.");
    views.forEach(([name, key, tint, dash], i) => {
      const axes = plot(out, { box: [76, 34 + i * 118, 554, 64], x: [0, 8], y: [-2, 2],
        ticks: [0, 4, 8], yTicks: [-2, 0, 2], xUnit: "x (m)", yUnit: "cm", tag: name, probe: x,
        traces: [{ fn: v => p(v)[key], tint, dash, width: key === "sum" ? 3 : 1.7, mark: true }] });
      if (i === 0 && main.t === 0 && a > 0) {
        const crest = axes.Y(a);
        out.dot(axes.X(0), crest);
        out.dot(axes.X(4), crest);
        out.dot(axes.X(2), axes.Y(-a));
        out.line([[axes.X(0), crest - 8], [axes.X(4), crest - 8]], gold);
        out.label(axes.X(2), crest - 15, "λ = 4 m", gold);
        out.label(axes.X(4) + 34, crest - 3, "Crest", gold);
        out.label(axes.X(2) + 37, axes.Y(-a) + 4, "Trough", gold);
      }
    });
    return out;
  }
  function builderDiagram() {
    const d = diagram("The string chart shows a fixed probe at 2 m. The traveling pattern moves right. Vertical displacement is exaggerated.");
    const { X, Y } = plot(d, { box: [75, 67, 552, 238], x: [0, 12], y: [-2, 2],
      ticks: [0, 2, 4, 6, 8, 10, 12], yTicks: [-2, 0, 2], xUnit: "x (m)", yUnit: "cm",
      tag: "Traveling wave", probe: 2, traces: [{ fn: buildAt, tint: blue, width: 2, mark: true }] });
    marks.forEach(m => { d.dot(X(m.x), Y(buildAt(m.x))); d.label(X(m.x), Y(buildAt(m.x)) - 16, m.label, gold); });
    return d;
  }
  function pulseDiagram() {
    const d = diagram("P travels right and Q travels left. The dotted probe is at 10 m. The plot is a window onto an infinite string.");
    plot(d, { box: [75, 67, 552, 238], x: [0, 20], y: [-2, 2], ticks: [0, 5, 10, 15, 20],
      yTicks: [-2, 0, 2], xUnit: "x (m)", yUnit: "cm", probe: 10, sampleCount: 224,
      traces: [{ fn: x => pulseAt(x).reduce((a, b) => a + b), tint: mint, width: 3 },
        { fn: x => pulseAt(x)[0], tint: blue }, { fn: x => pulseAt(x)[1], tint: violet, dash: true }] });
    d.label(190, 30, "P · solid", blue);
    d.label(317, 30, "Q · dashed", violet);
    d.label(440, 30, "Sum · bold", mint);
    return d;
  }
  function standDiagram() {
    const m = standModel();
    const list = standPoints(m);
    const dot = list[num("stand-probe")];
    const d = diagram("Fixed ends are marked on the sum graph. The traveling components can each be nonzero there while their sum is zero.");
    const styles = [["Right-going", blue, false], ["Left-going", violet, true], ["Standing sum", mint, false]];
    styles.forEach(([tag, tint, dash], i) => {
      const top = 32 + i * 118;
      const { X, Y } = plot(d, { box: [72, top, 555, 64], x: [0, m.L], y: [-2, 2],
        ticks: [0, m.L], yTicks: [-2, 0, 2], xUnit: "x (m)", yUnit: "cm", tag, probe: dot.x,
        traces: [{ fn: x => standAt(m, x, standTime)[i], tint, dash, width: i === 2 ? 3 : 1.7, mark: true }] });
      if (i === 2) list.forEach(p => {
        d.dot(X(p.x), Y(standAt(m, p.x, standTime)[2]), gold, (p.i === 0 || p.i === 2 * m.n) ? 5 : 3);
        d.label(X(p.x), top - 8, p.name, gold);
      });
    });
    return d;
  }
  function beatDiagram() {
    const d = diagram("Time traces at the fixed probe. The dotted envelope lines bound the rapid oscillation of the sum.");
    plot(d, { box: [76, 58, 552, 235], x: [0, 8], y: [-2, 2], ticks: [0, 2, 4, 6, 8],
      yTicks: [-2, 0, 2], xUnit: "t (s)", yUnit: "cm", probe: num("beat-time"), sampleCount: 800,
      traces: [
        { fn: t => beatsAt(t)[0], tint: blue }, { fn: t => beatsAt(t)[1], tint: violet, dash: true },
        { fn: t => beatsAt(t)[2], tint: mint, width: 2, mark: true },
        { fn: t => beatsAt(t)[3], tint: gold, dash: true },
        { fn: t => -beatsAt(t)[3], tint: gold, dash: true }
      ] });
    d.label(138, 24, "Wave 1", blue);
    d.label(249, 24, "Wave 2", violet);
    d.label(363, 24, "Sum", mint);
    d.label(522, 24, "±Envelope", gold);
    return d;
  }
  function tankDiagram() {
    const m = tank();
    const showAmplitude = value("tank-view") === "amplitude";
    const field = (x, y) => {
      const p = tankAt(m, x, y);
      return showAmplitude ? p.R : p.y;
    };
    const desc = showAmplitude ? "Local amplitude is shown. Sources are S1 and S2. P identifies the probe."
      : "Instantaneous displacement is shown. Sources are S1 and S2. P identifies the probe.";
    return { caption: desc, marks: [], tank: { field, markers: [[-m[0] / 2, 0, "S1"], [m[0] / 2, 0, "S2"], [m[3], m[4], "P"]] } };
  }
  function slitDiagram() {
    const m = slit();
    const y = m[2];
    const d = diagram("Left: openings and paths to the probe on the screen. Right: classical time-averaged screen intensity. The dashed curve is the saved pattern when shown.");
    const sy = v => 180 - 11 * v;
    const left = 140, screen = 340;
    for (const x of [38, 66, 94]) d.line([[x, 82], [x, 278]], muted, true);
    const gap = m[1] / 2;
    d.line([[left, 70], [left, sy(gap) - 5]]);
    d.line([[left, sy(gap) + 5], [left, sy(-gap) - 5]]);
    d.line([[left, sy(-gap) + 5], [left, 290]]);
    d.line([[screen, 70], [screen, 290]], muted);
    d.line([[left, sy(gap)], [screen, sy(y)]], violet, true);
    d.line([[left, sy(-gap)], [screen, sy(y)]], blue);
    d.dot(screen, sy(y));
    d.label(74, 312, "Incident →", muted);
    d.label(left + 10, 53, "Openings");
    d.label(screen, 53, "Screen");
    const traces = [{ fn: v => screenAt(m, v).I, tint: mint, width: 2, mark: true }];
    if (overlay) traces.unshift({ fn: v => screenAt(overlay, v).I, tint: violet, dash: true });
    plot(d, { box: [406, 95, 238, 180], x: [-10, 10], y: [0, 1], ticks: [-10, 0, 10],
      yTicks: [0, 1], xUnit: "y (m)", yUnit: "I/Imax", probe: y, traces });
    d.label(522, 53, overlay ? "Current and saved" : "Screen intensity");
    return d;
  }
  function wheelDiagram() {
    const [a, b, phase, x] = wheel();
    const d = diagram("The phasors’ horizontal projections add to the signed sum at the same probe shown on the right.");
    const p = pair(a, b, rad(phase), x, wheelTime);
    const cy = 180, cx = 167, unit = 60;
    const tip = (radius, theta) => [cx + unit * radius * Math.cos(theta), cy - unit * radius * Math.sin(theta)];
    d.line(samples(100, 0, TAU, theta => tip(2, theta)));
    d.line([[cx - 125, cy], [cx + 125, cy]], muted);
    d.line([[cx, cy - 125], [cx, cy + 125]], muted);
    const vectors = [[tip(a, p.p), blue, false], [tip(b, p.q), violet, true]];
    if (p.R) {
      const vertical = a * Math.sin(p.p) + b * Math.sin(p.q);
      vectors.push([[cx + unit * p.sum, cy - unit * vertical], mint, false]);
    }
    vectors.forEach(([end, tint, dashed]) => {
      d.line([[cx, cy], end], tint, dashed, tint === mint ? 3 : 2);
      d.line([end, [end[0], cy]], tint, true);
      d.dot(...end, tint);
    });
    d.label(cx, 31, p.R ? "Phasor projections" : "Resultant phase undefined");
    const at = v => pair(a, b, rad(phase), v, wheelTime).sum;
    plot(d, { box: [373, 87, 260, 188], x: [0, 8], y: [-2, 2], ticks: [0, 4, 8],
      yTicks: [-2, 0, 2], xUnit: "x (m)", yUnit: "cm", probe: x, tag: "String sum",
      traces: [{ fn: at, tint: mint, width: 2.5, mark: true }] });
    d.label(163, 330, "Wave 1 · solid", blue);
    d.label(163, 350, "Wave 2 · dashed", violet);
    d.label(163, 370, "Resultant · bold", mint);
    return d;
  }

  const diagrams = { main: mainDiagram, builder: builderDiagram, pulse: pulseDiagram, stand: standDiagram,
    beat: beatDiagram, tank: tankDiagram, slit: slitDiagram, wheel: wheelDiagram };
  const stations = get("waves-stations");
  const canvas = get("waves-gl");
  const flat = get("waves-flat");
  const viewport = canvas.parentElement;
  const staticNote = get("waves-static-note");
  let active = "main";
  let selected = "builder";
  let playing = null;
  let before = null;
  let lastDraw = null;
  let request = 0;
  let gpu = null;
  let needsDraw = true;

  function schedule() {
    if (!request && !document.hidden) request = requestAnimationFrame(paint);
  }
  function refresh(name) {
    if (active !== name) return;
    needsDraw = true;
    schedule();
  }
  function pause(reason = "") {
    if (!playing) return;
    const last = playing;
    const button = get(last === "main" ? "waves-play" : "stand-play");
    playing = null;
    before = lastDraw = null;
    button.textContent = "Play";
    button.setAttribute("aria-pressed", "false");
    if (last === "main" && reason) set("waves-lab-status", reason);
    refresh(last);
  }
  function moveScene(name) {
    if (active !== name) pause("Paused. Use Play to resume.");
    active = name;
    const slot = query(`[data-wave-scene="${name}"]`);
    if (sceneHost.parentElement !== slot) slot.append(sceneHost);
    refresh(name);
  }
  function restoreMain() { if (active !== "main") moveScene("main"); }
  function togglePlay(name) {
    if (playing === name) {
      pause(`Paused at ${fmt(main.t)} s.`);
      return;
    }
    if (active !== name) moveScene(name);
    pause();
    playing = name;
    const button = get(name === "main" ? "waves-play" : "stand-play");
    button.textContent = "Pause";
    button.setAttribute("aria-pressed", "true");
    if (name === "main") set("waves-lab-status", "Playing. Keep the probe fixed to watch a point move vertically.");
    schedule();
  }
  all("[data-wave-station]").forEach(button => button.addEventListener("click", () => {
    selected = button.dataset.waveStation;
    all("[data-wave-panel]").forEach(panel => { panel.hidden = panel.dataset.wavePanel !== selected; });
    all("[data-wave-station]").forEach(el => el.setAttribute("aria-pressed", String(el === button)));
    moveScene(selected);
    query(`[data-wave-panel="${selected}"] h3`).focus();
  }));
  stations.addEventListener("toggle", () => moveScene(stations.open ? selected : "main"));
  all('a[href="#waves-plot-1"], a[href="#waves-lab"]').forEach(link => link.addEventListener("click", () => {
    moveScene("main");
  }));
  get("waves-lab").addEventListener("focusin", restoreMain);
  stations.addEventListener("focusin", event => {
    if (stations.open && event.target.closest("[data-wave-panel]") && active !== selected) moveScene(selected);
  });

  function paint(timestamp) {
    request = 0;
    if (document.hidden) return;
    const running = playing === active;
    if (running) {
      const dt = before === null ? 0 : Math.max(0, timestamp - before) / 1000;
      before = timestamp;
      if (active === "main") main.t += dt;
      else if (active === "stand") standTime += dt;
      if (lastDraw === null || timestamp - lastDraw >= (reduced() ? 65 : 30)) needsDraw = true;
      schedule();
    }
    if (!needsDraw) return;
    needsDraw = false;
    lastDraw = timestamp;
    if (active === "main") mainReadouts();
    if (active === "stand") standReadouts();
    const plan = diagrams[active]();
    set("waves-scene-caption", plan.caption);
    const { width: w, height: h } = viewport.getBoundingClientRect();
    if (!w || !h) return;
    if (gpu) {
      try { gpu.paint(active, plan, w, h); return; }
      catch { fallback("The 3D view stopped."); }
    }
    paint2D(plan, w, h);
  }

  const fieldColor = n => {
    const level = Math.min(1, Math.abs(n));
    const to = n < 0 ? [193, 155, 255] : [120, 248, 166];
    return to.map((v, i) => Math.round([8, 20, 14][i] * (1 - level) + v * level));
  };
  function paint2D(plan, w, h) {
    const ctx = flat.getContext("2d");
    if (!ctx) return;
    const dpr = ratio();
    const scale = Math.min(w / W, h / H);
    const width = Math.round(w * dpr), height = Math.round(h * dpr);
    if (flat.width !== width || flat.height !== height) { flat.width = width; flat.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (w - scale * W) / 2, dpr * (h - scale * H) / 2);
    staticNote.hidden = true;
    flat.hidden = false;
    if (plan.tank) {
      const { field, markers } = plan.tank;
      const nx = reduced() ? 56 : 96, ny = reduced() ? 42 : 72;
      const X = x => 76 + 66 * (x + 4), Y = y => 316 - 46 * y;
      for (let i = 0; i < nx; i += 1) {
        for (let j = 0; j < ny; j += 1) {
          const x = -4 + 8 * i / nx, y = 6 * j / ny;
          const n = field(x + 4 / nx, y + 3 / ny);
          ctx.fillStyle = "rgb(" + fieldColor(n).join(",") + ")";
          ctx.fillRect(X(x), Y(y + 6 / ny), 528 / nx + 0.5, 276 / ny + 0.5);
        }
      }
      ctx.font = "bold 16px monospace";
      ctx.fillStyle = ink;
      ctx.fillText("x (m)  −4 to +4", 76, 348);
      ctx.fillText("y (m)  0 to 6", 465, 348);
      markers.forEach(([x, y, id]) => {
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.arc(X(x), Y(y), 5, 0, TAU);
        ctx.fill();
        ctx.fillText(id, X(x) + 7, Y(y) - 7);
      });
      return;
    }
    for (const m of plan.marks) {
      ctx.strokeStyle = ctx.fillStyle = m.tint;
      if (m.type === "line") {
        ctx.setLineDash(m.dash ? [7, 5] : []);
        ctx.lineWidth = m.width;
        ctx.beginPath();
        m.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.stroke();
      } else if (m.type === "label") {
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.text, m.x, m.y);
      } else {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, TAU);
        ctx.fill();
      }
    }
  }

  function createGPU(T) {
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: !reduced() });
    const world = new T.Scene();
    const camera = new T.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 1600);
    const group = new T.Group();
    world.add(group);
    const objects = [];
    let previous = "", surface = null, size = "";

    function dispose() {
      for (const obj of [...group.children]) {
        group.remove(obj);
        if (!obj.isSprite) obj.geometry?.dispose();
        obj.material.map?.dispose();
        obj.material.dispose();
      }
      objects.length = 0;
      surface = null;
    }

    function sprite(text, tint) {
      const label = document.createElement("canvas");
      label.width = 512;
      label.height = 64;
      const ctx = label.getContext("2d");
      if (!ctx) return null;
      ctx.font = "bold 32px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = tint;
      ctx.fillText(text, 256, 32, 500);
      const map = new T.CanvasTexture(label);
      map.colorSpace = T.SRGBColorSpace;
      const obj = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false, toneMapped: false }));
      obj.scale.set(256, 32, 1);
      return obj;
    }
    function release(obj) {
      if (!obj) return;
      group.remove(obj);
      if (!obj.isSprite) obj.geometry?.dispose();
      obj.material.map?.dispose();
      obj.material.dispose();
    }
    function obtain(i, key, make) {
      if (objects[i]?.key !== key) {
        release(objects[i]?.obj);
        const obj = make();
        objects[i] = { key, obj };
        if (obj) group.add(obj);
      }
      const obj = objects[i].obj;
      if (obj) obj.visible = true;
      return obj;
    }
    function lineObject(count, dashed, bold, tint) {
      const coords = new T.BufferAttribute(new Float32Array((bold ? (count - 1) * 6 : count) * 3), 3);
      coords.setUsage(T.DynamicDrawUsage);
      const g = new T.BufferGeometry();
      g.setAttribute("position", coords);
      if (bold) return new T.Mesh(g, new T.MeshBasicMaterial({ color: tint, side: T.DoubleSide }));
      if (!dashed) return new T.Line(g, new T.LineBasicMaterial({ color: tint }));
      const distances = new T.BufferAttribute(new Float32Array(count), 1);
      distances.setUsage(T.DynamicDrawUsage);
      g.setAttribute("lineDistance", distances);
      return new T.Line(g, new T.LineDashedMaterial({ color: tint, dashSize: 6, gapSize: 5 }));
    }
    function updateLine(obj, m, z, bold) {
      const position = obj.geometry.attributes.position;
      const distances = obj.geometry.attributes.lineDistance;
      let travel = 0;
      m.points.forEach(([x, y], i) => {
        const X = x - W / 2, Y = H / 2 - y;
        if (bold) {
          if (!i) return;
          const [px, py] = m.points[i - 1];
          const U = px - W / 2, V = H / 2 - py;
          const length = Math.hypot(Y - V, X - U) || 1;
          const s = m.width / (2 * length);
          const dx = (Y - V) * s, dy = (U - X) * s;
          const k = 6 * (i - 1);
          position.setXYZ(k, U + dx, V + dy, z);
          position.setXYZ(k + 1, U - dx, V - dy, z);
          position.setXYZ(k + 2, X - dx, Y - dy, z);
          position.setXYZ(k + 3, U + dx, V + dy, z);
          position.setXYZ(k + 4, X - dx, Y - dy, z);
          position.setXYZ(k + 5, X + dx, Y + dy, z);
        } else {
          position.setXYZ(i, X, Y, z);
          if (distances) {
            if (i) travel += Math.hypot(x - m.points[i - 1][0], y - m.points[i - 1][1]);
            distances.setX(i, travel);
          }
        }
      });
      position.needsUpdate = true;
      if (distances) distances.needsUpdate = true;
      obj.frustumCulled = false;
    }
    function drawMarks(marks) {
      marks.forEach((m, i) => {
        if (m.type === "line") {
          const bold = m.width >= 2 && !m.dash;
          const key = `line:${m.points.length}:${m.tint}:${bold}:${m.dash}`;
          const obj = obtain(i, key, () => lineObject(m.points.length, m.dash, bold, m.tint));
          updateLine(obj, m, 0.2 + i * 0.025, bold);
        } else if (m.type === "dot") {
          const obj = obtain(i, "dot:" + m.size + m.tint, () => new T.Mesh(
            new T.SphereGeometry(m.size, 14, 10), new T.MeshBasicMaterial({ color: m.tint })));
          obj.position.set(m.x - W / 2, H / 2 - m.y, 22);
        } else {
          const obj = obtain(i, "label:" + m.text + m.tint, () => sprite(m.text, m.tint));
          obj?.position.set(m.x - W / 2, H / 2 - m.y, 26);
        }
      });
      for (const entry of objects.slice(marks.length)) if (entry?.obj) entry.obj.visible = false;
    }
    function buildSurface(nx, ny) {
      surface?.mesh && release(surface.mesh);
      const g = new T.PlaneGeometry(1, 1, nx, ny);
      const count = g.attributes.position.count;
      g.attributes.position.setUsage(T.DynamicDrawUsage);
      g.setAttribute("color", new T.BufferAttribute(new Float32Array(count * 3), 3).setUsage(T.DynamicDrawUsage));
      const mesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide }));
      mesh.frustumCulled = false;
      group.add(mesh);
      return { nx, ny, mesh };
    }
    function drawTank({ field, markers }) {
      const nx = reduced() ? 56 : 96, ny = reduced() ? 42 : 72;
      if (surface?.nx !== nx) surface = buildSurface(nx, ny);
      const { position, color } = surface.mesh.geometry.attributes;
      const temp = new T.Color();
      const X = x => 60 * x, Z = y => 29 * (3 - y);
      for (let j = 0; j <= ny; j += 1) {
        for (let i = 0; i <= nx; i += 1) {
          const index = j * (nx + 1) + i;
          const x = -4 + 8 * i / nx, y = 6 * j / ny;
          const v = field(x, y);
          position.setXYZ(index, X(x), v * 37, Z(y));
          const [r, g, b] = fieldColor(v);
          temp.setRGB(r / 255, g / 255, b / 255, T.SRGBColorSpace);
          color.setXYZ(index, temp.r, temp.g, temp.b);
        }
      }
      position.needsUpdate = color.needsUpdate = true;
      markers.forEach(([x, y, id], i) => {
        const spot = obtain(2 * i, "tank-marker", () => new T.Mesh(
          new T.SphereGeometry(6, 14, 10), new T.MeshBasicMaterial({ color: gold })));
        const h = 37 * field(x, y);
        spot.position.set(X(x), h + 5, Z(y));
        const label = obtain(2 * i + 1, "tank-label:" + id, () => sprite(id, ink));
        label?.position.set(X(x), h + 23, Z(y));
      });
      const axis = obtain(6, "tank-axes", () => sprite("x: −4 to +4 m   y: 0 to 6 m", ink));
      axis?.position.set(0, -40, 107);
    }
    return {
      paint(name, plan, w, h) {
        if (previous !== name) {
          dispose();
          previous = name;
          camera.position.set(0, plan.tank ? 430 : 0, plan.tank ? 490 : 530);
          camera.lookAt(0, 0, 0);
        }
        const dpr = ratio();
        const newSize = `${w}:${h}:${dpr}`;
        if (newSize !== size) {
          size = newSize;
          renderer.setPixelRatio(dpr);
          renderer.setSize(w, h, false);
          const fit = Math.min(w / W, h / H);
          camera.right = w / fit / 2;
          camera.left = -camera.right;
          camera.top = h / fit / 2;
          camera.bottom = -camera.top;
          camera.updateProjectionMatrix();
        }
        if (plan.tank) drawTank(plan.tank);
        else drawMarks(plan.marks);
        renderer.render(world, camera);
      },
      dispose() { dispose(); renderer.dispose(); }
    };
  }

  function fallback(reason) {
    const previous = gpu;
    gpu = null;
    try { previous?.dispose(); } catch { /* The rendering context may already be gone. */ }
    canvas.hidden = true;
    const canDraw = Boolean(flat.getContext("2d"));
    flat.hidden = !canDraw;
    staticNote.hidden = true;
    viewport.hidden = !canDraw;
    set("waves-render-status", reason + (canDraw ? " Using the 2D view." : " Use the numerical readouts.") + " The experiment controls remain available.");
    refresh(active);
  }
  canvas.addEventListener("webglcontextlost", () => fallback("The WebGL context was lost."));
  watch(["waves-economy"], () => refresh(active));
  const motionChange = () => {
    pause("Paused after the system motion preference changed. Press Play or Step to continue.");
    refresh(active);
  };
  if (motion.addEventListener) motion.addEventListener("change", motionChange);
  else motion.addListener?.(motionChange);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pause("Paused because this page was hidden. Press Play or Step to continue.");
      cancelAnimationFrame(request);
      request = 0;
    } else refresh(active);
  });
  const resize = () => refresh(active);
  window.addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(viewport);

  get("waves-controls").disabled = quizControls.disabled = false;
  all("[data-wave-enable]").forEach(el => { el.disabled = false; });
  buildStandChoices();
  renderMain();
  renderBuilder();
  renderPulse();
  renderStand();
  renderBeat();
  renderTank();
  renderSlit();
  renderWheel();
  if (stations.open && !["#waves-plot-1", "#waves-lab"].includes(window.location?.hash)) moveScene(selected);
  set("waves-lab-status", "Paused at 0.00 s. Use Play or Step to move the wave pattern.");
  set("waves-challenge-feedback", "Choose an answer. You can retry after reading the feedback.");
  set("waves-render-status", "Loading the local 3D view…");

  import("../vendor/three.module.js").then(T => {
    try {
      gpu = createGPU(T);
      canvas.hidden = false;
      flat.hidden = true;
      staticNote.hidden = true;
      set("waves-render-status", "");
      refresh(active);
    } catch {
      fallback("WebGL is unavailable.");
    }
  }, () => fallback("The local Three.js module could not load."));
})();