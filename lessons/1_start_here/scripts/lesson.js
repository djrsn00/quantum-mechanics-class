(() => {
  "use strict";

  const lesson = document.querySelector(".site-main.lesson");
  const bench = lesson?.querySelector("#arcade-scene");
  if (!bench) return;

  const get = id => lesson.querySelector(`#${id}`);
  const all = selector => [...lesson.querySelectorAll(selector)];
  const set = (id, value) => { get(id).textContent = value; };
  const value = id => get(id).value;
  const number = id => get(id).valueAsNumber;
  const checked = id => get(id).checked;
  const click = (id, action) => get(id).addEventListener("click", action);
  const watch = (ids, action) => ids.forEach(id => {
    const input = get(id);
    input.addEventListener(input.type === "range" ? "input" : "change", action);
  });
  const pct = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 2 });
  const decimal = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });
  const dash = "—";
  const eps = 1e-12;
  const near = (a, b) => Math.abs(a - b) < eps;
  const radians = deg => deg * Math.PI / 180;
  const axis = deg => ((deg % 180) + 180) % 180;
  const degrees = deg => `${decimal.format(deg)}°`;
  const fmt = p => p == null ? dash : pct.format(p);
  const fraction = (count, total) => total ? count / total : null;
  const probability = p => p < eps ? 0 : p > 1 - eps ? 1 : p;
  const projection = (source, analyzer) => probability(Math.cos(radians(source - analyzer)) ** 2);
  const choose = p => (p === 1 || (p > 0 && Math.random() < p)) ? "first" : "second";
  const channels = ["first", "second"];
  const color = {
    first: "#65b7ff", second: "#c19bff", beam: "#78f8a6",
    stop: "#ff9f55", sum: "#ffe16a", grid: "#244537", text: "#ecfff1"
  };
  const labels = a => axis(a) === 0 ? ["H · 0°", "V · 90°"]
    : [`Parallel · ${degrees(axis(a))}`, `Perpendicular · ${degrees(axis(a + 90))}`];

  function trial() {
    return { sent: 0, counts: Object.create(null), last: null };
  }

  const pol = { trial: trial(), history: [], batch: 0, pending: null };
  const filters = { trial: trial() };
  const memory = { trial: trial(), guess: null };
  const wave = { canceled: false, missionDone: false };
  const path = { trial: trial(), scan: null };
  const builder = { trial: trial(), records: new Map() };

  function sample(state, amount, outcome) {
    const run = Object.create(null);
    for (let i = 0; i < amount; i += 1) {
      const result = outcome();
      state.last = result;
      state.counts[result] = (state.counts[result] ?? 0) + 1;
      run[result] = (run[result] ?? 0) + 1;
    }
    state.sent += amount;
    return run;
  }

  function wireRuns(prefix, run, reset) {
    click(`${prefix}-one`, () => run(1, false));
    click(`${prefix}-batch`, () => run(Number(value(`${prefix}-size`)), true));
    click(`${prefix}-reset`, reset);
  }

  function writeRow(row, fields) {
    fields.forEach((field, index) => { row.cells[index].textContent = field; });
  }

  all("[data-angle-for]").forEach(out => {
    const id = out.dataset.angleFor;
    get(id).addEventListener("input", () => { out.value = degrees(number(id)); });
  });

  function polModel() {
    const source = number("pol-source");
    const a = number("pol-axis");
    return { source, a, names: labels(a), p: projection(source, a) };
  }

  function meter(id, p) {
    set(id, fmt(p));
    const bar = get(id).nextElementSibling;
    bar.hidden = p == null;
    if (p != null) bar.value = p;
  }

  function renderPol(m = polModel()) {
    const { sent, counts, last } = pol.trial;
    set("pol-active-source", degrees(m.source));
    set("pol-active-axis", degrees(m.a));
    set("pol-total", sent);
    set("pol-last", last ? m.names[channels.indexOf(last)] : "No detection yet.");
    channels.forEach((key, i) => {
      const count = counts[key] ?? 0;
      set(`pol-${key}`, m.names[i]);
      set(`pol-count-${key}`, count);
      meter(`pol-model-${key}`, i ? 1 - m.p : m.p);
      meter(`pol-observed-${key}`, fraction(count, sent));
    });
  }

  function recordPolBatch(m, amount, run) {
    const counts = channels.map(key => run[key] ?? 0);
    const outputs = m.names.map((name, i) => `${name}: ${counts[i]} (${fmt(counts[i] / amount)})`);
    pol.history.unshift([++pol.batch, degrees(m.source), degrees(m.a), ...outputs]);
    pol.history.length = Math.min(pol.history.length, 5);
    const body = get("pol-history");
    body.replaceChildren();
    for (const entry of pol.history) {
      const row = body.insertRow();
      const head = document.createElement("th");
      head.scope = "row";
      row.append(head);
      entry.slice(1).forEach(() => row.insertCell());
      writeRow(row, entry);
    }

    if (pol.pending === null || amount !== 10 || m.source !== 45 || m.a !== 0) return;
    const [h, v] = counts;
    const pattern = h === 5
      ? "Five and five is one possible result. Try another ten to see whether it repeats."
      : "This uneven split occurred with equal odds at both detectors.";
    const reasoning = pol.pending === "yes"
      ? "You predicted that five H clicks were required. They are possible rather than guaranteed."
      : "You predicted that five H clicks were possible and other counts could occur too.";
    set("pol-feedback", `This batch gave ${h} H and ${v} V. ${pattern} ${reasoning} Think of ten fresh fair coin tosses: each toss is 50/50, while the count of heads can vary.`);
    pol.pending = null;
  }

  function resetPol() {
    pol.trial = trial();
    renderPol();
    set("pol-assistant", "Fresh tally. Recent batches are still available.");
    set("pol-mission-feedback", "");
    refresh();
  }

  function runPol(amount, batch) {
    const m = polModel();
    const run = sample(pol.trial, amount, () => choose(m.p));
    renderPol(m);
    if (batch) recordPolBatch(m, amount, run);
    const result = m.names.map((name, i) => `${name}: ${run[channels[i]] ?? 0}`).join(" · ");
    const comment = m.p === 0 || m.p === 1
      ? "At these settings, the source aligns with just one detector axis."
      : "The model percentages describe each fresh photon.";
    set("pol-assistant", amount === 1
      ? `One photon, one click at ${m.names[channels.indexOf(pol.trial.last)]}. ${comment}`
      : `This batch: ${result}. ${comment}`);
    refresh(true);
  }

  click("pol-save", () => {
    const answer = lesson.querySelector('input[name="pol-prediction"]:checked');
    if (!answer) {
      set("pol-feedback", "Pick an answer before locking in your prediction.");
      lesson.querySelector('input[name="pol-prediction"]').focus();
      return;
    }
    pol.pending = answer.value;
    set("pol-feedback", "Prediction saved. Run ten photons as one batch at 45° preparation and 0° analyzer.");
  });

  watch(["pol-source", "pol-axis"], () => {
    const preset = get("pol-preset");
    const match = [...preset.options].find(option => Number(option.value) === number("pol-source"));
    preset.value = match ? match.value : "custom";
    resetPol();
  });

  watch(["pol-preset"], () => {
    const slider = get("pol-source");
    if (value("pol-preset") === slider.value || value("pol-preset") === "custom") return;
    slider.value = value("pol-preset");
    slider.dispatchEvent(new Event("input"));
  });

  wireRuns("pol", runPol, resetPol);
  click("pol-mission", () => {
    const m = polModel();
    set("pol-mission-feedback", near(m.p, 0.75)
      ? `You found 75% for ${m.names[0]}. The axes differ by 30° up to reflection and half-turns. A finite batch can land above or below 75%.`
      : `The model gives ${fmt(m.p)}. The probability depends on the difference between the source and analyzer angles.`);
  });

  const quiz = [
    ["one-click", {
      "one-click": "Correct. One photon registers one click. At these settings H and V each have a 50% chance.",
      "two-halves": "Each half is a probability. Send one photon to find how many detectors register it.",
      "no-click": "One photon is enough to record an outcome. Try a single send."
    }],
    ["only-v", {
      "only-h": "H tests horizontal polarization. Use the 0° H/V analyzer and compare it with the 90° source.",
      "only-v": "Correct. The 90° preparation aligns with V, so the model sends all ten clicks to V.",
      "both": "With the source aligned to the vertical axis, check the predicted H and V percentages."
    }],
    ["frequency", {
      frequency: "Correct. Six divided by ten is the observed H frequency in that batch.",
      "new-odds": "The next photon still has a 50% H probability at the same settings. What did six divided by ten measure?",
      guarantee: "Try two batches at these settings. The observed fraction can vary."
    }]
  ];
  let question = 0;
  const questions = all("[data-question]");
  const next = get("checkout-next");
  get("checkout-questions").addEventListener("click", event => {
    const answer = event.target.closest("button[data-answer]");
    if (!answer || question >= quiz.length || !questions[question].contains(answer)) return;
    const [correct, feedback] = quiz[question];
    set("checkout-feedback", feedback[answer.dataset.answer]);
    next.hidden = answer.dataset.answer !== correct;
    next.textContent = question === quiz.length - 1 ? "Finish checkout" : "Next question";
  });

  click("checkout-next", () => {
    if (next.hidden) return;
    next.hidden = true;
    question += 1;
    if (question === quiz.length) {
      get("checkout-questions").disabled = true;
      set("checkout-progress", "Checkout complete");
      set("checkout-feedback", "You distinguished a single outcome, a model probability, and an observed frequency.");
      lesson.querySelector(".lesson-next .lesson-primary").focus();
      return;
    }
    questions[question - 1].hidden = true;
    questions[question].hidden = false;
    set("checkout-progress", `Question ${question + 1} of ${quiz.length}`);
    set("checkout-feedback", "Choose an answer to check your reasoning.");
    questions[question].querySelector("h5").focus();
  });

  function filterModel() {
    const stages = ["first", "middle", "final"].map(key => ({
      key, angle: number(`filters-${key}`), active: key !== "middle" || checked("filters-insert")
    }));
    let previous = null;
    let pass = 1;
    for (const stage of stages) {
      if (!stage.active) continue;
      stage.p = previous === null ? 0.5 : projection(previous, stage.angle);
      pass *= stage.p;
      stage.share = pass;
      previous = stage.angle;
    }
    return { stages, pass };
  }

  function renderFilters(model = filterModel()) {
    const { sent, counts } = filters.trial;
    let arrived = sent;
    for (const stage of model.stages) {
      const row = lesson.querySelector(`[data-filter="${stage.key}"]`);
      const title = stage.key[0].toUpperCase() + stage.key.slice(1);
      if (!stage.active) {
        writeRow(row, [`${title} · bypassed`, dash, dash, dash, dash, dash, dash]);
        continue;
      }
      const stopped = counts[stage.key] ?? 0;
      const passed = arrived - stopped;
      writeRow(row, [`${title} · ${degrees(stage.angle)}`, arrived, stopped,
        fmt(stage.p), fmt(fraction(passed, arrived)), fmt(stage.share), fmt(fraction(passed, sent))]);
      arrived = passed;
    }
    set("filters-sent", sent);
    set("filters-detected", counts.detector ?? 0);
    set("filters-intensity", `${fmt(model.pass)} of incident intensity at the detector.`);
    const active = model.stages.filter(stage => stage.active);
    const factors = active.slice(1).map((stage, i) =>
      `cos²(${degrees(stage.angle)} − ${degrees(active[i].angle)})`);
    const exact = near(model.pass, 0.125) ? " = 1/8" : "";
    set("filters-math", `1/2 × ${factors.join(" × ")} = ${fmt(model.pass)}${exact} of all incident photons. ${fmt(2 * model.pass)} of those passed by the first filter reach the detector in the model.`);
  }

  function runFilters(amount) {
    const model = filterModel();
    const active = model.stages.filter(stage => stage.active);
    const run = sample(filters.trial, amount, () =>
      active.find(stage => choose(stage.p) === "second")?.key ?? "detector");
    renderFilters(model);
    const last = filters.trial.last;
    const destination = last === "detector" ? "reached the detector" : `stopped at the ${last} filter`;
    set("filters-status", amount === 1 ? `The photon ${destination}.`
      : `${run.detector ?? 0} of ${amount} reached the detector. The last photon ${destination}.`);
    refresh(true);
  }

  function resetFilters() {
    filters.trial = trial();
    renderFilters();
    set("filters-status", "Fresh tally. Send photons to see where they stop.");
    set("filters-mission-feedback", "");
    refresh();
  }

  watch(["filters-first", "filters-middle", "filters-final", "filters-insert"], resetFilters);
  wireRuns("filters", runFilters, resetFilters);
  click("filters-mission", () => {
    const m = filterModel();
    const [first, mid, final] = m.stages;
    const crossed = projection(first.angle, final.angle) === 0;
    const feedback = !crossed ? "Set the first and final axes 90° apart."
      : !mid.active ? "Crossed outer filters give zero here. Insert the middle filter and rotate it."
      : near(m.pass, 1 / 8) ? "Maximum reached: 1/8 of all incident photons and 1/4 of those passed by the first filter."
      : `${fmt(m.pass)} reaches the detector. Look for a middle axis making two equal 45° steps between the outer axes.`;
    set("filters-mission-feedback", feedback);
  });

  function memoryModel() {
    const source = number("memory-source");
    const a = number("memory-first");
    const final = number("memory-final");
    const kept = axis(a + (value("memory-keep") === "parallel" ? 0 : 90));
    return { source, a, final, kept, reach: projection(source, kept), p: projection(kept, final), names: labels(final) };
  }

  function renderMemory(m = memoryModel()) {
    const { sent, counts } = memory.trial;
    const away = counts.away ?? 0;
    const arrivals = sent - away;
    const committed = memory.guess !== null;
    const opts = get("memory-keep").options;
    opts[0].textContent = `Parallel · ${degrees(axis(m.a))}`;
    opts[1].textContent = `Perpendicular · ${degrees(axis(m.a + 90))}`;
    get("memory-one").disabled = !committed;
    get("memory-batch").disabled = !committed;
    set("memory-sent", sent);
    set("memory-away", away);
    set("memory-arrived", arrivals);
    set("memory-throughput", committed
      ? `Model throughput: ${fmt(m.reach)} of all sent.`
      : "Lock in a prediction to reveal the model.");
    channels.forEach((key, i) => {
      const count = counts[key] ?? 0;
      const p = i ? 1 - m.p : m.p;
      writeRow(lesson.querySelector(`[data-memory-output="${key}"]`), [
        m.names[i], count, fmt(committed && m.reach > 0 ? p : null),
        fmt(fraction(count, arrivals)), fmt(committed ? m.reach * p : null), fmt(fraction(count, sent))
      ]);
    });
    get("memory-math").hidden = !committed;
    set("memory-math", !committed ? "" : m.reach === 0
      ? "The selected output never receives photons at these settings. The final counts are zero and there is no fraction among arrivals."
      : `The kept axis is ${degrees(m.kept)}. cos²(${degrees(m.source)} − ${degrees(m.kept)}) = ${fmt(m.reach)} reach the final analyzer. Of those, cos²(${degrees(m.kept)} − ${degrees(m.final)}) = ${fmt(m.p)} go to the first output. Multiplying gives ${fmt(m.reach * m.p)} of all sent.`);
  }

  click("memory-save", () => {
    const guess = number("memory-guess");
    if (!Number.isFinite(guess) || guess < 0 || guess > 100) {
      set("memory-feedback", "Enter a percentage from 0 through 100.");
      get("memory-guess").focus();
      return;
    }
    memory.guess = guess / 100;
    renderMemory();
    set("memory-feedback", `Saved ${fmt(memory.guess)} among arrivals. Send photons to compare it with a run.`);
  });

  function runMemory(amount) {
    if (memory.guess === null) return;
    const m = memoryModel();
    const run = sample(memory.trial, amount, () =>
      choose(m.reach) === "first" ? choose(m.p) : "away");
    renderMemory(m);
    const arrivals = amount - (run.away ?? 0);
    const observed = fraction(run.first ?? 0, arrivals);
    const comparison = observed == null ? "This run had no arrivals, so its observed fraction is undefined."
      : `In this run, ${run.first ?? 0} of ${arrivals} arrivals went to ${m.names[0]} (${fmt(observed)}).`;
    const explanation = m.reach === 0
      ? "The model routes every photon away at the first analyzer."
      : `The conditional model gives ${fmt(m.p)}. Your prediction was ${fmt(memory.guess)} among arrivals.`;
    set("memory-status", `${comparison} ${explanation}`);
    refresh(true);
  }

  function resetMemory(clearGuess) {
    memory.trial = trial();
    if (clearGuess) {
      memory.guess = null;
      get("memory-guess").value = "";
      set("memory-feedback", "Settings changed. Predict the first-output percentage among arrivals.");
      set("memory-mission-feedback", "");
    }
    set("memory-status", "");
    renderMemory();
    refresh();
  }

  wireRuns("memory", runMemory, () => resetMemory(false));
  watch(["memory-source", "memory-first", "memory-keep", "memory-final"], () => resetMemory(true));
  click("memory-mission", () => {
    if (memory.guess === null) {
      set("memory-mission-feedback", "Lock in a prediction for these settings first.");
      return;
    }
    const m = memoryModel();
    set("memory-mission-feedback", axis(m.final) !== 0 ? "Set the final analyzer to the H/V orientation."
      : !m.reach ? "No photons take the selected route. Choose a route with nonzero throughput."
      : near(m.p, 0.5) ? `Equal H/V odds among arrivals, with ${fmt(m.reach)} of all photons reaching the final analyzer.`
      : "The kept axis is closer to one final axis. Aim midway between H and V.");
  });

  function waveModel() {
    const amplitude = id => Math.max(0, Math.min(2, number(id) || 0));
    const a = amplitude("wave-a");
    const b = amplitude("wave-b");
    const phase = radians(number("wave-phase"));
    return { a, b, phase, x: number("wave-probe"), signal: Math.hypot(a + b * Math.cos(phase), b * Math.sin(phase)) };
  }

  function renderWave() {
    const m = waveModel();
    set("wave-position", `${decimal.format(m.x)} λ`);
    set("wave-signal", decimal.format(m.signal));
    refresh();
  }

  watch(["wave-a", "wave-b"], () => {
    const m = waveModel();
    get("wave-a").value = m.a;
    get("wave-b").value = m.b;
    renderWave();
  });
  watch(["wave-phase", "wave-probe"], renderWave);
  click("wave-mission", () => {
    const m = waveModel();
    let feedback;
    if (!m.a || !near(m.a, m.b)) {
      feedback = "Choose the same nonzero amplitude for both waves.";
    } else if (!wave.canceled && near(m.signal, 0)) {
      wave.canceled = true;
      feedback = "Cancellation recorded. Equal waves in opposite phase sum to zero. Now reinforce them.";
    } else if (wave.canceled && near(m.signal, m.a + m.b)) {
      wave.missionDone = true;
      feedback = `Mission complete. In phase, the two amplitudes add to ${decimal.format(m.a + m.b)}.`;
    } else {
      feedback = wave.missionDone ? "You already recorded cancellation and reinforcement."
        : wave.canceled ? "Try putting the waves in phase." : "Try putting the waves in opposite phase.";
    }
    set("wave-mission-feedback", feedback);
  });

  const pathP = (phase, overlap) => probability((1 + overlap * Math.cos(radians(phase))) / 2);
  function renderPath() {
    const overlap = number("path-overlap");
    const p = pathP(number("path-phase"), overlap);
    set("path-marker", overlap);
    channels.forEach((key, i) => {
      const count = path.trial.counts[key] ?? 0;
      writeRow(lesson.querySelector(`[data-path-output="${key}"]`),
        [`D${i}`, count, fmt(i ? 1 - p : p), fmt(fraction(count, path.trial.sent))]);
    });
  }

  function resetPath() {
    path.trial = trial();
    renderPath();
    set("path-status", "Fresh detector tally.");
    refresh();
  }

  watch(["path-phase"], resetPath);
  watch(["path-overlap"], () => {
    path.scan = null;
    set("path-scan-result", "");
    set("path-mission-feedback", "");
    resetPath();
  });

  wireRuns("path", amount => {
    const p = pathP(number("path-phase"), number("path-overlap"));
    const run = sample(path.trial, amount, () => choose(p));
    renderPath();
    set("path-status", `${amount} sent: ${run.first ?? 0} to D0 and ${run.second ?? 0} to D1. Last click: D${channels.indexOf(path.trial.last)}.`);
    refresh(true);
  }, resetPath);

  click("path-scan", () => {
    const overlap = number("path-overlap");
    const scan = Array.from({ length: 73 }, (_, i) => pathP(5 * i, overlap));
    const min = Math.min(...scan);
    const max = Math.max(...scan);
    path.scan = (max - min) / (max + min);
    set("path-scan-result", `Model D0 at 0°: ${fmt(scan[0])}, 90°: ${fmt(scan[18])}, 180°: ${fmt(scan[36])}, 270°: ${fmt(scan[54])}, 360°: ${fmt(scan[72])}. Minimum ${fmt(min)}, maximum ${fmt(max)}, visibility ${fmt(path.scan)}.`);
    set("path-mission-feedback", "");
  });
  click("path-mission", () => {
    set("path-mission-feedback", path.scan === null ? "Scan the phase at the current marker overlap first."
      : near(path.scan, 1) ? "Full visibility. With identical marker states, the D0 probability swings from zero to one."
      : `Visibility is ${fmt(path.scan)}. Increase marker overlap and scan again to widen the swing.`);
  });

  // Complex numbers are [real, imaginary]. Jones vectors contain H and V.
  const add = ([ar, ai], [br, bi]) => [ar + br, ai + bi];
  const scale = ([re, im], k) => [re * k, im * k];
  const multiply = ([ar, ai], [br, bi]) => [ar * br - ai * bi, ar * bi + ai * br];
  const dot = ([a, b], [h, v]) => add(multiply([a[0], -a[1]], h), multiply([b[0], -b[1]], v));
  const norm2 = ([re, im]) => re * re + im * im;
  const phasor = deg => [Math.cos(radians(deg)), Math.sin(radians(deg))];
  const linear = deg => phasor(deg).map(component => [component, 0]);
  const q = Math.SQRT1_2;
  const bases = {
    hv: { names: ["H", "V"], vectors: [[[1, 0], [0, 0]], [[0, 0], [1, 0]]] },
    diagonal: { names: ["D+", "D−"], vectors: [[[q, 0], [q, 0]], [[q, 0], [-q, 0]]] },
    circular: { names: ["C+", "C−"], vectors: [[[q, 0], [0, q]], [[q, 0], [0, -q]]] }
  };
  const odds = (state, basis) => state ? basis.vectors.map(vector => probability(norm2(dot(vector, state)))) : [null, null];

  function plate(state, angle, delay) {
    const fast = linear(angle);
    const slow = linear(angle + 90);
    const along = dot(fast, state);
    const across = multiply(dot(slow, state), delay);
    return fast.map(([f], i) => add(scale(along, f), scale(across, slow[i][0])));
  }

  function builderModel() {
    const mix = radians(number("builder-mix"));
    const input = [[Math.cos(mix), 0], scale(phasor(number("builder-phase")), Math.sin(mix))];
    const optics = ["polarizer", "half", "quarter"].map(key => ({
      key, active: checked(`builder-${key}-on`), angle: number(`builder-${key}`)
    }));
    const [polarizer, half, quarter] = optics;
    let state = input;
    let survive = 1;
    if (polarizer.active) {
      const direction = linear(polarizer.angle);
      const component = dot(direction, input);
      const power = norm2(component);
      survive = probability(power);
      state = survive ? direction.map(([x]) => scale(component, x / Math.sqrt(power))) : null;
    }
    if (state && half.active) state = plate(state, half.angle, [-1, 0]);
    if (state && quarter.active) state = plate(state, quarter.angle, [0, 1]);
    const basis = bases[value("builder-basis")];
    return { input, state, survive, optics, basis, p: odds(state, basis) };
  }

  function complexText([re, im]) {
    const asText = x => decimal.format(near(x, 0) ? 0 : x);
    if (near(im, 0)) return asText(re);
    if (near(re, 0)) return `${asText(im)}i`;
    return `${asText(re)} ${im < 0 ? "−" : "+"} ${asText(Math.abs(im))}i`;
  }
  const vectorText = state => `(${state.map(complexText).join(", ")})`;

  function renderBuilder(m = builderModel()) {
    const { sent, counts } = builder.trial;
    const stopped = counts.stopped ?? 0;
    const arrivals = sent - stopped;
    set("builder-input", `${vectorText(m.input)} · H/V ${odds(m.input, bases.hv).map(fmt).join(" / ")}`);
    set("builder-output", m.state ? vectorText(m.state) : "No transmitted state");
    set("builder-survival", fmt(m.survive));
    set("builder-sent", sent);
    set("builder-stopped", stopped);
    set("builder-arrived", arrivals);
    channels.forEach((key, i) => {
      const count = counts[key] ?? 0;
      writeRow(lesson.querySelector(`[data-builder-output="${key}"]`), [
        m.basis.names[i], count, fmt(m.p[i]), fmt(fraction(count, arrivals)), fmt(m.survive * (m.p[i] ?? 0))
      ]);
    });
  }

  function resetBuilder() {
    builder.trial = trial();
    renderBuilder();
    set("builder-status", "Fresh tally for these settings.");
    set("builder-mission-feedback", "");
    refresh();
  }

  watch(["builder-mix", "builder-phase", "builder-basis", "builder-polarizer", "builder-half", "builder-quarter",
    "builder-polarizer-on", "builder-half-on", "builder-quarter-on"], resetBuilder);
  wireRuns("builder", amount => {
    const m = builderModel();
    const run = sample(builder.trial, amount, () =>
      choose(m.survive) === "first" ? choose(m.p[0]) : "stopped");
    renderBuilder(m);
    const last = builder.trial.last;
    const event = last === "stopped" ? "stopped at the polarizer" : `clicked at ${m.basis.names[channels.indexOf(last)]}`;
    set("builder-status", `${amount} sent, ${run.stopped ?? 0} stopped. Last photon ${event}.`);
    refresh(true);
  }, resetBuilder);

  click("builder-record", () => {
    const m = builderModel();
    const diagonal = odds(m.input, bases.diagonal);
    if (m.optics.some(optic => optic.active) || !diagonal.includes(1)) {
      set("builder-record-feedback", "Bypass the optics, set equal H and V amplitudes, and try relative phase 0° or 180°.");
      return;
    }
    const name = diagonal[0] === 1 ? "(H + V)/√2" : "(H − V)/√2";
    builder.records.set(name, `${name} · H/V ${odds(m.input, bases.hv).map(fmt).join(" / ")} · D+/D− ${diagonal.map(fmt).join(" / ")}`);
    const list = get("builder-records");
    list.replaceChildren(...[...builder.records.values()].map(record => {
      const item = document.createElement("li");
      item.textContent = record;
      return item;
    }));
    list.hidden = false;
    set("builder-record-feedback", builder.records.size === 2
      ? "Both preparations recorded. H/V gives the same split. Diagonal analysis gives opposite definite outputs."
      : "Preparation recorded. Go to the opposite relative phase and record again.");
  });

  click("builder-mission", () => {
    const m = builderModel();
    const [polarizer, half, quarter] = m.optics;
    const linearInput = near(multiply([m.input[0][0], -m.input[0][1]], m.input[1])[1], 0);
    const across45 = near(norm2(dot(linear(quarter.angle), m.input)), 0.5);
    const output = value("builder-guess");
    const feedback = polarizer.active || half.active || !quarter.active
      ? "Insert the quarter-wave plate and bypass the other two elements."
      : !linearInput || !across45 ? "Try a linear input midway between the fast and perpendicular axes."
      : m.basis !== bases.circular ? "Select circular analysis."
      : !output ? "Choose C+ or C−."
      : m.p[channels.indexOf(output)] === 1
        ? `Correct. The equal components are in quadrature and all transmitted photons go to ${m.basis.names[channels.indexOf(output)]}.`
        : "The components are in quadrature. Compare the sign of the phase difference with the circular state definitions.";
    set("builder-mission-feedback", feedback);
  });

  click("builder-compare", () => {
    const table = get("builder-comparison");
    const comparisonBases = [bases.hv, bases.diagonal];
    const mixed = comparisonBases.map(basis => {
      const h = odds(bases.hv.vectors[0], basis);
      const v = odds(bases.hv.vectors[1], basis);
      return h.map((p, i) => (p + v[i]) / 2).map(fmt).join(" / ");
    });
    writeRow(table.tBodies[0].rows[0], ["Coherent +45°", ...comparisonBases.map(basis =>
      odds(bases.diagonal.vectors[0], basis).map(fmt).join(" / "))]);
    writeRow(table.tBodies[0].rows[1], ["Equal H/V mixture", ...mixed]);
    table.hidden = false;
    set("builder-compare-feedback", "Change the measurement basis to diagonal. The coherent preparation always gives D+. The mixture gives an equal split. Classical polarization can reproduce many of these intensity patterns.");
  });

  // Both renderers use the same diagram and the same recorded event.
  let station = "polarization";
  let interference = "wave";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const gl = get("arcade-gl");
  const flat = get("arcade-flat");
  const routeList = get("arcade-route");
  const viewport = gl.parentElement;
  let plan;
  let frame = 0;
  let started = 0;
  let inView = true;
  let drawGL = null;

  function node(key, text, x, y, type, angle = null, tint = color.beam) {
    return { key, text, x, y, type, angle, tint };
  }
  const point = ({ x, y }) => [x, y];
  const trace = (points, tint = color.grid, width = 1.5, dashed = false) => ({ points, tint, width, dashed });

  function optical(caption, nodes, routes, last) {
    const find = key => nodes.find(item => item.key === key);
    const lines = routes.map(keys => trace(keys.map(key => point(find(key)))));
    const event = last ? routes.find(keys => keys[keys.length - 1] === last) : null;
    return { caption, nodes, lines, last, event: event?.map(key => point(find(key))) ?? null };
  }

  function outputs(names, x = 4.6) {
    return channels.map((key, i) =>
      node(key, names[i], x, i ? -1.3 : 1.3, "detector", null, color[key]));
  }

  function polScene() {
    const m = polModel();
    const nodes = [
      node("source", `Source ${degrees(m.source)}`, -4.4, 0, "source", m.source),
      node("analyzer", `Analyzer ${degrees(m.a)}`, 0, 0, "analyzer", m.a), ...outputs(m.names)
    ];
    return optical(`Polarization axes: ${m.names.join(" and ")}. A bright route shows a recorded photon.`,
      nodes, channels.map(key => ["source", "analyzer", key]), pol.trial.last);
  }

  function filterScene() {
    const model = filterModel();
    const nodes = [node("source", "Unpolarized", -4.9, 0, "source")];
    model.stages.forEach((stage, i) => {
      if (stage.active) nodes.push(node(stage.key, `F${i + 1} · ${degrees(stage.angle)}`, -2.55 + i * 2.45, 0, "filter", stage.angle));
    });
    nodes.push(node("detector", "Detector", 4.9, 0, "detector", null, color.first));
    const keys = nodes.map(n => n.key);
    return optical("F1, F2, and F3 are the first, middle, and final filters. The bright route ends where the recorded photon stopped or was detected.",
      nodes, keys.slice(1).map((_, i) => keys.slice(0, i + 2)), filters.trial.last);
  }

  function memoryScene() {
    const m = memoryModel();
    const nodes = [
      node("source", `Source ${degrees(m.source)}`, -4.8, 0, "source", m.source),
      node("firstAnalyzer", `Analyzer 1 · ${degrees(m.a)}`, -2, 0, "analyzer", m.a),
      node("away", "Routed away", -2.1, -1.9, "detector", null, color.stop),
      node("final", `Analyzer 2 · ${degrees(m.final)}`, 1.2, 0, "analyzer", m.final), ...outputs(m.names)
    ];
    return optical(`The selected ${degrees(m.kept)} output leads to the final analyzer. Its output axes are ${m.names.join(" and ")}.`,
      nodes, [["source", "firstAnalyzer", "away"],
        ...channels.map(key => ["source", "firstAnalyzer", "final", key])], memory.trial.last);
  }

  function pathScene() {
    const nodes = [
      node("source", "Source", -5, 0, "source"),
      node("split", "Splitter", -2.8, 0, "analyzer"),
      node("railA", "", 0, 1.75, "guide"),
      node("railB", "", 0, -1.75, "guide"),
      node("combine", "Recombiner", 2.2, 0, "analyzer"), ...outputs(["D0", "D1"], 5)
    ];
    const paths = [["source", "split", "railA", "combine"], ["split", "railB", "combine"],
      ["combine", "first"], ["combine", "second"]];
    return optical("Both arms are drawn as apparatus. The simulated click is shown after recombination.",
      nodes, paths, path.trial.last);
  }

  function curve(count, samplePoint) {
    return Array.from({ length: count + 1 }, (_, i) => samplePoint(i / count));
  }

  function waveScene() {
    const m = waveModel();
    const y = (x, offset) => Math.cos(Math.PI * 2 * x + offset);
    const waveA = x => m.a * y(x, 0);
    const waveB = x => m.b * y(x, m.phase);
    const sum = x => waveA(x) + waveB(x);
    const xAt = x => -5.7 + x * 5.7;
    const line = fn => curve(120, t => [xAt(2 * t), 0.55 * fn(2 * t)]);
    const probe = xAt(m.x);
    return { caption: "Classical waves at a fixed time. The marker crosses the instantaneous sum at the probe.",
      nodes: [node("probe", "", probe, 0.55 * sum(m.x), "detector", null, color.sum)],
      lines: [
        trace([[-5.7, 0], [5.7, 0]]), trace([[probe, -2.5], [probe, 2.5]], color.text, 1, true),
        trace(line(sum), color.sum, 5), trace(line(waveA), color.first, 2), trace(line(waveB), color.second, 2, true)
      ] };
  }

  function builderScene() {
    const m = builderModel();
    const nodes = [node("source", "Source", -5.1, 0.9, "source")];
    const names = ["Polarizer", "HWP", "QWP"];
    m.optics.forEach((optic, i) => {
      if (optic.active) nodes.push(node(optic.key, `${names[i]} ${degrees(optic.angle)}`,
        -3.15 + i * 1.75, 0.9, "filter", optic.angle));
    });
    nodes.push(node("analyzer", "Analyzer", 2.3, 0.9, "analyzer"), ...outputs(m.basis.names, 5.05));
    const keys = nodes.slice(0, -2).map(n => n.key);
    const paths = channels.map(key => [...keys, key]);
    if (m.optics[0].active) paths.push(["source", "polarizer"]);
    const drawing = optical(m.state
      ? "Bench above. Below, a classical electric-field illustration shows the normalized state just before analysis."
      : "Bench only. No photons pass the polarizer at these settings, so there is no transmitted state to illustrate.",
      nodes, paths, builder.trial.last === "stopped" ? "polarizer" : builder.trial.last);
    if (m.state) {
      const [[hr, hi], [vr, vi]] = m.state;
      const tip = t => {
        const theta = 2 * Math.PI * t;
        return [-0.4 + 0.95 * (hr * Math.cos(theta) + hi * Math.sin(theta)),
          -2.05 + 0.95 * (vr * Math.cos(theta) + vi * Math.sin(theta))];
      };
      drawing.lines.push(trace([[-1.55, -2.05], [0.75, -2.05]]), trace([[-0.4, -3.2], [-0.4, -0.9]]),
        trace(curve(64, tip), color.sum, 3));
      drawing.field = tip;
    }
    return drawing;
  }

  const diagrams = { polarization: polScene, filters: filterScene, memory: memoryScene,
    wave: waveScene, path: pathScene, builder: builderScene };

  function refresh(animate = false) {
    plan = diagrams[station === "interference" ? interference : station]();
    started = animate && plan.event ? performance.now() : 0;
    set("arcade-scene-description", plan.caption);
    routeList.replaceChildren(...plan.nodes.filter(n => n.text).map(n => {
      const li = document.createElement("li");
      const hit = plan.last === n.key;
      li.textContent = hit ? `${n.text} · last event` : n.text;
      if (hit) li.dataset.event = "true";
      return li;
    }));
    requestFrame();
  }

  function openStation(name, focus = false) {
    station = name;
    all("[data-panel]").forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    all("[data-station]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.station === name));
    });
    const panel = lesson.querySelector(`[data-panel="${name}"]`);
    const host = name === "interference" ? get(`${interference}-panel`) : panel;
    const slot = host.querySelector("[data-scene-slot]");
    if (bench.parentElement !== slot) slot.append(bench);
    if (focus) panel.querySelector("h3").focus();
    refresh();
  }

  all("[data-station]").forEach(button => {
    button.addEventListener("click", () => openStation(button.dataset.station, true));
  });
  all('input[name="interference-view"]').forEach(radio => radio.addEventListener("change", () => {
    if (!radio.checked) return;
    interference = radio.value;
    get("wave-panel").hidden = interference !== "wave";
    get("path-panel").hidden = interference !== "path";
    openStation("interference");
  }));
  all("[data-open-polarization]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    openStation("polarization", true);
  }));

  const reduced = () => motion.matches || checked("arcade-economy");
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, reduced() ? 1 : 1.6);

  function requestFrame() {
    if (!frame && !document.hidden && inView) frame = requestAnimationFrame(paint);
  }

  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function dotOnPath(points, t) {
    const progress = t * (points.length - 1);
    const i = Math.min(points.length - 2, Math.floor(progress));
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    return [x + (nx - x) * (progress - i), y + (ny - y) * (progress - i)];
  }

  function paint(time) {
    frame = 0;
    if (document.hidden || !inView) return;
    const { width, height } = viewport.getBoundingClientRect();
    if (!width || !height) return;
    const move = !reduced();
    const travel = move && started ? Math.max(0, Math.min(1, (time - started) / 760)) : 1;
    const pulse = plan.event ? dotOnPath(plan.event, travel) : null;
    const field = plan.field?.(move ? (time % 4500) / 4500 : 0);
    if (drawGL) {
      try {
        drawGL.paint(plan, width, height, pulse, field);
      } catch {
        fallback("3D drawing stopped.");
      }
    }
    if (!drawGL) drawFlat(plan, width, height, pulse, field);
    if (move && (travel < 1 || plan.field)) requestFrame();
  }

  function drawFlat(drawing, width, height, pulse, field) {
    const ctx = flat.getContext("2d");
    if (!ctx) {
      routeList.hidden = false;
      return;
    }
    flat.hidden = false;
    routeList.hidden = true;
    const dpr = pixelRatio();
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (flat.width !== w || flat.height !== h) {
      flat.width = w;
      flat.height = h;
    }
    const unit = Math.min(w / 13.8, h / 7.1);
    const xy = ([x, y]) => [w / 2 + x * unit, h / 2 - y * unit];
    const line = ({ points, tint, width: thickness, dashed }) => {
      ctx.beginPath();
      ctx.strokeStyle = tint;
      ctx.lineWidth = thickness * dpr;
      ctx.setLineDash(dashed ? [5 * dpr, 4 * dpr] : []);
      points.forEach((p, i) => i ? ctx.lineTo(...xy(p)) : ctx.moveTo(...xy(p)));
      ctx.stroke();
    };
    const circle = (p, r, tint) => {
      ctx.beginPath();
      ctx.arc(...xy(p), r * unit, 0, 2 * Math.PI);
      ctx.fillStyle = tint;
      ctx.fill();
    };
    ctx.clearRect(0, 0, w, h);
    drawing.lines.forEach(line);
    if (drawing.event) line(trace(drawing.event, color.beam, 2));
    ctx.font = `${Math.max(10 * dpr, unit * 0.22)}px monospace`;
    ctx.textAlign = "center";
    for (const n of drawing.nodes) {
      if (n.type === "guide") continue;
      circle(point(n), n.text ? 0.26 : 0.11, drawing.last === n.key ? color.text : n.tint);
      if (n.angle != null) {
        const [dx, dy] = phasor(n.angle);
        line(trace([[n.x - dx * 0.44, n.y - dy * 0.44], [n.x + dx * 0.44, n.y + dy * 0.44]], color.text, 2));
      }
      const [x, y] = xy([n.x, n.y - 0.58]);
      ctx.fillStyle = color.text;
      ctx.fillText(n.text, x, y, unit * 2.7);
    }
    if (pulse) circle(pulse, 0.12, color.text);
    if (field) circle(field, 0.1, color.sum);
  }

  function makeWebGL(T) {
    const renderer = new T.WebGLRenderer({ canvas: gl, alpha: true, antialias: !reduced() });
    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-7, 7, 3.6, -3.6, 0.1, 40);
    camera.position.z = 15;
    const light = new T.DirectionalLight(0xe3fff2, 2.4);
    light.position.set(-4, 5, 8);
    scene.add(light, new T.AmbientLight(0xb4dbca, 1));
    let geometryGroup, lastPlan, pulseMesh, fieldMesh;
    let lastW, lastH, lastDpr;

    function mesh(geometry, tint, x, y, z = 0.3, basic = false) {
      const material = basic ? new T.MeshBasicMaterial({ color: tint, side: T.DoubleSide })
        : new T.MeshStandardMaterial({ color: tint, metalness: 0.25, roughness: 0.4 });
      const object = new T.Mesh(geometry, material);
      object.position.set(x, y, z);
      geometryGroup.add(object);
      return object;
    }

    function label(text, x, y) {
      if (!text) return;
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = "bold 33px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color.text;
      ctx.fillText(text, 180, 32, 350);
      const map = new T.CanvasTexture(canvas);
      map.colorSpace = T.SRGBColorSpace;
      const sprite = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false }));
      sprite.position.set(x, y - 0.64, 0.9);
      sprite.scale.set(2.65, 0.47, 1);
      geometryGroup.add(sprite);
    }

    function line({ points, tint, width, dashed }, z = 0) {
      const vectors = points.map(([x, y]) => new T.Vector3(x, y, z));
      if (width >= 3 && !dashed) {
        const verts = [];
        for (let i = 1; i < vectors.length; i += 1) {
          const a = vectors[i - 1], b = vectors[i];
          const length = a.distanceTo(b);
          if (!length) continue;
          const dx = (b.y - a.y) * width * 0.009 / length;
          const dy = (a.x - b.x) * width * 0.009 / length;
          verts.push(a.x + dx, a.y + dy, z, a.x - dx, a.y - dy, z, b.x - dx, b.y - dy, z,
            a.x + dx, a.y + dy, z, b.x - dx, b.y - dy, z, b.x + dx, b.y + dy, z);
        }
        const geometry = new T.BufferGeometry();
        geometry.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
        mesh(geometry, tint, 0, 0, 0, true);
        return;
      }
      const material = dashed ? new T.LineDashedMaterial({ color: tint, dashSize: 0.14, gapSize: 0.09 })
        : new T.LineBasicMaterial({ color: tint });
      const object = new T.Line(new T.BufferGeometry().setFromPoints(vectors), material);
      if (dashed) object.computeLineDistances();
      geometryGroup.add(object);
    }

    function disposeGroup() {
      if (!geometryGroup) return;
      geometryGroup.traverse(object => {
        if (!object.isSprite) object.geometry?.dispose();
        object.material?.map?.dispose();
        object.material?.dispose();
      });
      scene.remove(geometryGroup);
    }

    function build(drawing) {
      disposeGroup();
      geometryGroup = new T.Group();
      scene.add(geometryGroup);
      drawing.lines.forEach((track, i) => line(track, i * 0.025));
      if (drawing.event) line(trace(drawing.event, color.beam, 3), 0.15);
      for (const n of drawing.nodes) {
        if (n.type === "guide") continue;
        const hit = drawing.last === n.key;
        const tint = hit ? color.text : n.tint;
        const shape = n.type === "filter" ? new T.TorusGeometry(0.34, 0.08, 10, 24)
          : n.type === "detector" ? new T.SphereGeometry(n.text ? 0.27 : 0.1, 16, 12)
          : new T.BoxGeometry(n.type === "source" ? 0.68 : 0.54, 0.53, 0.48);
        mesh(shape, tint, n.x, n.y);
        if (n.angle != null) {
          const marker = mesh(new T.BoxGeometry(0.78, 0.05, 0.05), color.text, n.x, n.y, 0.58, true);
          marker.rotation.z = radians(n.angle);
        }
        label(n.text, n.x, n.y);
      }
      pulseMesh = drawing.event ? mesh(new T.SphereGeometry(0.12, 12, 10), color.text, 0, 0, 0.9, true) : null;
      fieldMesh = drawing.field ? mesh(new T.SphereGeometry(0.1, 12, 10), color.sum, 0, 0, 0.6, true) : null;
    }

    return {
      paint(drawing, w, h, pulse, field) {
        const dpr = pixelRatio();
        if (w !== lastW || h !== lastH || dpr !== lastDpr) {
          lastW = w; lastH = h; lastDpr = dpr;
          renderer.setPixelRatio(dpr);
          renderer.setSize(w, h, false);
          const halfWidth = Math.max(6.9, 3.55 * w / h);
          const halfHeight = halfWidth * h / w;
          camera.left = -halfWidth; camera.right = halfWidth;
          camera.top = halfHeight; camera.bottom = -halfHeight;
          camera.updateProjectionMatrix();
        }
        if (drawing !== lastPlan) {
          build(drawing);
          lastPlan = drawing;
        }
        if (pulseMesh && pulse) pulseMesh.position.set(pulse[0], pulse[1], 0.9);
        if (fieldMesh && field) fieldMesh.position.set(field[0], field[1], 0.6);
        renderer.render(scene, camera);
      },
      dispose() { disposeGroup(); renderer.dispose(); }
    };
  }

  function fallback(reason) {
    const old = drawGL;
    drawGL = null;
    try { old?.dispose(); } catch { /* A lost context may already be unavailable. */ }
    gl.hidden = true;
    const has2D = Boolean(flat.getContext("2d"));
    flat.hidden = !has2D;
    routeList.hidden = has2D;
    set("arcade-render-status", `${reason} ${has2D ? "Using the 2D view." : "Using the text view."} The experiment controls and results are available.`);
    requestFrame();
  }

  gl.addEventListener("webglcontextlost", () => fallback("The WebGL context was lost."));
  watch(["arcade-economy"], requestFrame);
  if (motion.addEventListener) motion.addEventListener("change", requestFrame);
  else motion.addListener?.(requestFrame);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopFrame();
    else requestFrame();
  });
  if ("ResizeObserver" in window) new ResizeObserver(requestFrame).observe(viewport);
  window.addEventListener("resize", requestFrame);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) requestFrame();
      else stopFrame();
    }).observe(viewport);
  }

  // Controls are initialized before the optional Three.js import.
  all("[data-enable]").forEach(control => { control.disabled = false; });
  renderPol();
  renderFilters();
  renderMemory();
  renderPath();
  renderBuilder();
  lesson.querySelector(".arcade-switcher").hidden = false;
  openStation("polarization");
  set("arcade-render-status", "Loading the 3D view…");

  import("../vendor/three.module.js").then(T => {
    try {
      drawGL = makeWebGL(T);
      gl.hidden = false;
      flat.hidden = true;
      routeList.hidden = true;
      set("arcade-render-status", "");
      requestFrame();
    } catch {
      fallback("WebGL is unavailable.");
    }
  }, () => fallback("The local Three.js module could not load."));
})();