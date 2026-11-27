(() => {
  "use strict";

  const lesson = document.querySelector(".site-main.prob-lesson");
  if (!lesson) return;
  const get = id => lesson.querySelector("#" + id);
  const all = selector => [...lesson.querySelectorAll(selector)];
  const val = id => get(id).value;
  const num = id => Number(val(id));
  const text = (id, message) => { get(id).textContent = message; };
  const click = (id, action) => get(id).addEventListener("click", action);
  const change = (ids, action) => ids.forEach(id => get(id).addEventListener("change", action));
  const range = n => Array.from({ length: n }, (_, i) => i);
  const make = (tag, content) => {
    const node = document.createElement(tag);
    if (content != null) node.textContent = content;
    return node;
  };
  const dash = "—";
  const pf = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 2 });
  const nf = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
  const pct = p => p == null ? dash : pf.format(p);
  const fmt = n => nf.format(n);
  const modelPct = p => p > 0 && p < 0.00005 ? "<0.01%" : p < 1 && p >= 0.99995 ? ">99.99% and <100%" : pct(p);
  const freq = (count, n) => n ? count / n : null;
  const hit = p => p === 1 || (p > 0 && Math.random() < p);
  const toss = p => hit(p) ? "H" : "T";

  function countHits(n, p) {
    if (p === 1) return n;
    let count = 0;
    for (let i = 0; p > 0 && i < n; i += 1) if (hit(p)) count += 1;
    return count;
  }

  function weights(n, p) {
    if (p === 0 || p === 1) return range(n + 1).map(k => k === n * p ? 1 : 0);
    let choose = 1;
    return range(n + 1).map(k => {
      if (k) choose *= (n - k + 1) / k;
      return choose * p ** k * (1 - p) ** (n - k);
    });
  }

  function modes(values) {
    const max = Math.max(...values);
    return range(values.length).filter(i => Math.abs(values[i] - max) < 1e-12);
  }

  function table(id, rows, empty, columns) {
    const host = get(id);
    if (!rows.length) {
      const tr = make("tr");
      const cell = make("td", empty);
      cell.colSpan = columns;
      tr.append(cell);
      host.replaceChildren(tr);
      return;
    }
    host.replaceChildren(...rows.map(([heading, ...cells]) => {
      const tr = make("tr");
      const th = make("th", heading);
      th.scope = "row";
      tr.append(th, ...cells.map(v => make("td", v)));
      return tr;
    }));
  }

  function input(id, message) {
    const el = get(id);
    const value = el.valueAsNumber;
    if (Number.isFinite(value) && el.validity.valid) return value;
    if (message) text(message, "Enter a value within the range and step shown by the field.");
    el.focus();
    if (!el.value) el.setAttribute("aria-invalid", "true");
    el.reportValidity();
    return null;
  }

  function inputs(ids, message) {
    const values = [];
    for (const id of ids) {
      const value = input(id, message);
      if (value === null) return null;
      values.push(value);
    }
    return values;
  }

  function selection(id, message) {
    const value = val(id);
    if (value !== "") return value;
    text(message, "Choose an answer first.");
    get(id).focus();
    return null;
  }

  function options(id, choices, selected) {
    get(id).replaceChildren(...choices.map(([key, title]) => {
      const option = make("option", title);
      option.value = key;
      return option;
    }));
    if (selected != null) get(id).value = selected;
  }

  function percentCorrect(answer, p) {
    return Math.round(answer * 100) === Math.round(p * 10000);
  }

  function checkSettings(ids, initial, apply) {
    let values = initial;
    change(ids, () => {
      const next = inputs(ids);
      if (next && next.some((n, i) => n !== values[i])) {
        values = next;
        apply();
      }
    });
    return () => values;
  }
  all('input[type="number"]').forEach(el => el.addEventListener("input", () => el.removeAttribute("aria-invalid")));

  // Original coin lab, independent comparison and pair tally
  let bias = 70;
  const pCoin = () => bias / 100;
  const fresh = () => ({ n: 0, h: 0, recent: [], trace: [], stride: 1 });
  let run = fresh();
  let tenGuess = null;
  let pairs = { n: 0, hits: 0, last: "" };
  let pairShown = false;

  function renderCoin() {
    const p = pCoin();
    const face = run.recent.at(-1);
    const last = face === "H" ? "H · Heads" : face === "T" ? "T · Tails" : dash;
    const observed = pct(freq(run.h, run.n));
    text("prob-total", fmt(run.n));
    text("prob-head-count", fmt(run.h));
    text("prob-head-table-count", fmt(run.h));
    text("prob-tail-count", fmt(run.n - run.h));
    text("prob-head-observed", observed);
    text("prob-tail-observed", pct(freq(run.n - run.h, run.n)));
    text("prob-last-toss", last);
    text("obs-current", `${pct(p)} model · ${fmt(run.n)} ${run.n === 1 ? "toss" : "tosses"} · ${fmt(run.h)} heads · Observed ${observed} · Last face ${last}.`);
    const first = run.n - run.recent.length + 1;
    const ol = get("prob-history");
    ol.start = first;
    ol.replaceChildren(...run.recent.map((side, i) => {
      const li = make("li", side);
      li.dataset.outcome = side;
      li.value = first + i;
      li.setAttribute("aria-label", `Toss ${first + i}: ${side === "H" ? "heads" : "tails"}`);
      li.title = `Toss ${first + i}`;
      return li;
    }));
    ol.hidden = run.n === 0;
    text("prob-history-empty", run.n ? `Shown: toss ${fmt(first)} through ${fmt(run.n)}.` : "No tosses yet.");
    redraw();
  }

  function addTosses(n, view) {
    show(view);
    const p = pCoin();
    const prior = run.n ? Math.abs(run.h / run.n - p) : null;
    const start = run.h;
    const recent = run.recent.slice();
    for (let i = 0; i < n; i += 1) {
      const side = toss(p);
      recent.push(side);
      run.n += 1;
      if (side === "H") run.h += 1;
      if (run.n % run.stride === 0) run.trace.push([run.n, run.h / run.n]);
      if (run.trace.length > 420) {
        run.stride *= 2;
        run.trace = run.trace.filter(([index]) => index % run.stride === 0);
      }
    }
    run.recent = recent.slice(-20);
    const delta = run.h - start;
    const farther = prior != null && Math.abs(run.h / run.n - p) > prior + 1e-12;
    text("prob-run-feedback", `Added ${fmt(n)} ${n === 1 ? "toss" : "tosses"}: ${fmt(delta)} H and ${fmt(n - delta)} T. Current heads frequency ${pct(run.h / run.n)}. ${farther ? "This time the frequency moved farther from the model." : "Every toss uses the same model probability."}`);
    renderCoin();
    animate("coin", n === 1 ? 540 : 0);
  }

  function resetRun(message) {
    run = fresh();
    animate("", 0);
    text("prob-run-feedback", message);
    renderCoin();
  }

  const comparison = () => ({
    short: range(8).map(() => countHits(10, pCoin())),
    long: range(8).map(() => countHits(100, pCoin()))
  });
  const spread = (batch, size) => (Math.max(...batch) - Math.min(...batch)) * (100 / size);
  const spreads = group => [spread(group.short, 10), spread(group.long, 100)];
  const wider = (s, l) => s > l ? "10-toss runs" : s < l ? "100-toss runs" : "Tie";

  function drawComparison(group) {
    const plot = get("prob-comparison-plot");
    const desc = get("prob-plot-desc");
    if (!plot) return;
    const { plotLeft, plotRight, shortFirstY, longFirstY, dotGap } = plot.dataset;
    const X = f => Number(plotLeft) + f * (Number(plotRight) - Number(plotLeft));
    const modelX = X(pCoin());
    get("prob-model-line")?.setAttribute("x1", modelX);
    get("prob-model-line")?.setAttribute("x2", modelX);
    const SVG = "http://www.w3.org/2000/svg";
    [10, 100].forEach((n, i) => {
      const host = get("prob-dots-" + n);
      if (!host) return;
      const samples = group ? (i ? group.long : group.short) : [];
      host.replaceChildren(...samples.map((k, j) => {
        const x = X(k / n);
        const y = Number(i ? longFirstY : shortFirstY) + j * Number(dotGap);
        const marker = document.createElementNS(SVG, i ? "polygon" : "circle");
        if (i) marker.setAttribute("points", `${x},${y - 4} ${x + 4},${y} ${x},${y + 4} ${x - 4},${y}`);
        else {
          marker.setAttribute("cx", x);
          marker.setAttribute("cy", y);
          marker.setAttribute("r", 3.5);
        }
        const tip = document.createElementNS(SVG, "title");
        tip.textContent = `Run ${j + 1}: ${k}/${n} heads, ${pct(k / n)}.`;
        marker.append(tip);
        return marker;
      }));
    });
    if (desc) desc.textContent = `The dashed line is the ${bias}% model. ${group ? "The table gives all sixteen runs." : "No comparison runs yet."}`;
  }

  function clearComparison() {
    drawComparison(null);
    table("prob-comparison-rows", [], "No comparison runs yet.", 3);
    get("prob-comparison-spreads").hidden = true;
    text("prob-comparison-spreads", "");
    text("prob-comparison-status", "No comparison runs yet.");
    text("prob-opening-feedback", "Save a prediction, then generate fresh runs to check it.");
  }

  function pairModel() { return (10000 - (100 - bias) ** 2) / 10000; }
  function renderPairs() {
    text("prob-pair-total", fmt(pairs.n));
    text("prob-pair-hits", fmt(pairs.hits));
    text("prob-pair-model", pairShown ? pct(pairModel()) : dash);
    text("prob-pair-observed", pct(freq(pairs.hits, pairs.n)));
    text("prob-last-pair", pairs.last ? `${pairs.last} · ${pairs.last === "TT" ? "no heads" : "at least one head"}` : dash);
  }
  function resetPairs(message) {
    pairs = { n: 0, hits: 0, last: "" };
    renderPairs();
    text("prob-pair-status", message);
  }

  function renderBias() {
    ["prob-bias-value", "prob-head-model", "prob-pair-bias"].forEach(id => text(id, pct(pCoin())));
    if (get("prob-plot-bias")) text("prob-plot-bias", pct(pCoin()));
    text("prob-tail-model", pct((100 - bias) / 100));
    get("prob-bias").value = bias;
    get("prob-bias").setAttribute("aria-valuetext", bias + " percent heads");
  }
  function updateBias(next) {
    if (next === bias) return;
    bias = next;
    show("coin");
    tenGuess = null;
    pairShown = false;
    for (const id of ["prob-possible", "prob-expected", "prob-pair-guess"]) get(id).value = "";
    text("prob-prediction-status", "Bias changed. Save a new prediction for this setting.");
    text("prob-pair-feedback", "Enter a prediction for this bias.");
    renderBias();
    resetRun("Bias changed. The current run starts at zero.");
    clearComparison();
    resetPairs("Bias changed. No pairs sampled at the new setting.");
    table("obs-group-rows", [], "No samples yet.", 4);
    text("obs-group-feedback", "");
    text("obs-two-feedback", "");
  }

  get("prob-bias").addEventListener("input", () => updateBias(num("prob-bias")));
  all("[data-prob-bias]").forEach(b => b.addEventListener("click", () => updateBias(Number(b.dataset.probBias))));
  all("[data-prob-tosses]").forEach(b => b.addEventListener("click",
    () => addTosses(Number(b.dataset.probTosses), b.dataset.tossView || "coin")));
  click("prob-reset-run", () => { show("coin"); resetRun("Fresh run at the same bias. Only the current tally and trace were cleared."); });
  get("prob-prediction-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || !val("prob-possible")) return;
    const expected = input("prob-expected", "prob-prediction-status");
    if (expected === null) return;
    tenGuess = { choice: val("prob-possible"), tenths: Math.round(expected * 10) };
    text("prob-prediction-status", `Prediction saved at ${bias}% heads. Generate a fresh comparison to check it.`);
  });
  function invalidateTenGuess() {
    if (!tenGuess) return;
    tenGuess = null;
    text("prob-prediction-status", "Answer edited. Save the revised prediction before checking it.");
    text("prob-opening-feedback", "The previous comparison remains below. Save the revised prediction before drawing again.");
  }
  for (const event of ["input", "change"]) get("prob-prediction-form").addEventListener(event, invalidateTenGuess);

  click("prob-generate-comparison", () => {
    const group = comparison();
    drawComparison(group);
    table("prob-comparison-rows", group.short.map((k, i) => [i + 1, `${k}/10 H · ${pct(k / 10)}`,
      `${group.long[i]}/100 H · ${pct(group.long[i] / 100)}`]));
    const [s, l] = spreads(group);
    get("prob-comparison-spreads").hidden = false;
    text("prob-comparison-spreads", `Observed spread: ${s} percentage points for 10 tosses and ${l} percentage points for 100 tosses.`);
    text("prob-comparison-status", s === l ? "The groups tied in spread this time."
      : `${wider(s, l)} spread farther this time. ${l > s ? "A finite comparison can go against the typical pattern." : "Larger runs typically vary less in frequency."}`);
    const [a, b] = group.short;
    const first = `The first two short runs gave ${a} and ${b} heads.`;
    const note = bias === 0 || bias === 100 ? "The outcome is deterministic at this bias."
      : a === b ? "These two happened to match. Try a new comparison."
      : "The counts differ at the same bias.";
    let prediction = "Save a prediction and compare again to check it.";
    if (tenGuess) {
      const which = bias === 0 ? "only-zero" : bias === 100 ? "only-ten" : "any";
      const possible = which === "any" ? "Every whole count from 0 to 10 is possible." : `Only ${bias / 10} heads is possible.`;
      prediction = `${tenGuess.choice === which ? "Possible counts match." : "Review the possible counts."} ${possible} ${tenGuess.tenths === bias ? "Your average matches." : `Your average was ${fmt(tenGuess.tenths / 10)}.`} The model expectation is ${fmt(bias / 10)} heads across many ten-toss runs.`;
      text("prob-prediction-status", "Prediction checked against this comparison.");
    }
    text("prob-opening-feedback", [first, note, prediction].join(" "));
  });

  get("prob-pair-prediction-form").addEventListener("submit", event => {
    event.preventDefault();
    const guess = input("prob-pair-guess", "prob-pair-feedback");
    if (guess === null) return;
    pairShown = true;
    renderPairs();
    const tail = (100 - bias) / 100;
    text("prob-pair-feedback", `${percentCorrect(guess, pairModel()) ? "Correct." : "Compare with the model and try again."} P(TT) = ${pct(tail ** 2)}, so P(at least one H) = ${pct(pairModel())}.`);
  });
  all("[data-prob-pairs]").forEach(b => b.addEventListener("click", () => {
    const n = Number(b.dataset.probPairs);
    const p = pCoin();
    let hits = 0;
    for (let i = 0; i < n; i += 1) {
      pairs.last = toss(p) + toss(p);
      if (pairs.last !== "TT") hits += 1;
    }
    pairs.n += n;
    pairs.hits += hits;
    renderPairs();
    text("prob-pair-status", `${hits} of ${n} new ${n === 1 ? "pair" : "pairs"} had at least one H. The running frequency is ${pct(pairs.hits / pairs.n)} of pairs.`);
  }));
  click("prob-reset-pairs", () => resetPairs("Pair tally cleared. The prediction reveal keeps its current state."));

  // Coin Run Observatory
  click("obs-two", () => {
    const p = pCoin(), a = countHits(10, p), b = countHits(10, p);
    const outcome = a !== b ? "Different counts at the same bias."
      : p === 0 || p === 1 ? "Different counts are impossible at this endpoint."
      : "These runs matched. Sample two more.";
    text("obs-two-feedback", `${bias}% heads: the runs gave ${a} H and ${b} H. ${outcome}`);
  });
  click("obs-streak-check", () => {
    const status = "obs-streak-feedback", guess = input("obs-streak-guess", status);
    if (guess !== null) text(status, `${guess === 70 ? "Correct." : "Use the model’s fixed bias."} The next independent toss still has a 70% chance of heads.`);
  });
  click("obs-groups", () => {
    const data = range(3).map(() => spreads(comparison()));
    table("obs-group-rows", data.map(([s, l], i) => [i + 1, s, l, wider(s, l)]));
    const shorter = data.filter(([s, l]) => s > l).length;
    const longer = data.filter(([s, l]) => l > s).length;
    text("obs-group-feedback", `Wider spread in this sample: short runs in ${shorter} groups, long runs in ${longer}, tied in ${3 - shorter - longer}. Over repeated comparisons, larger runs typically vary less in frequency.`);
  });

  // Probability Tree House
  const readTreeBias = checkSettings(["tree-p"], [70], renderTree);
  let fairTree = false;
  const paths = n => range(2 ** n).map(i => i.toString(2).padStart(n, "0").replace(/0/g, "H").replace(/1/g, "T"));
  const count = (s, symbol) => [...s].filter(letter => letter === symbol).length;
  const pathP = (s, p) => p ** count(s, "H") * (1 - p) ** count(s, "T");
  function treeSelected(path) {
    const h = count(path, "H");
    switch (val("tree-event")) {
      case "one": return h === 1;
      case "some": return h > 0;
      case "none": return h === 0;
      default: return path === val("tree-path");
    }
  }
  function renderTree() {
    const p = readTreeBias()[0] / 100;
    const n = num("tree-n");
    const leaves = paths(n);
    const selected = leaves.filter(treeSelected);
    const total = selected.reduce((sum, path) => sum + pathP(path, p), 0);
    table("tree-rows", leaves.map(path => [path, [...path].map(side => pct(side === "H" ? p : 1 - p)).join(" × "),
      modelPct(pathP(path, p)), treeSelected(path) ? "Yes" : dash, pct(0.5 ** n)]));
    [...get("tree-rows").rows].forEach((row, i) => {
      row.dataset.treeSelected = String(treeSelected(leaves[i]));
      row.cells[4].dataset.treeFair = "";
      row.cells[4].hidden = !fairTree;
    });
    all("[data-tree-fair]").forEach(el => { el.hidden = !fairTree; });
    get("tree-path").disabled = val("tree-event") !== "path";
    text("tree-reading", `${selected.join(", ")} selected · ${pct(total)}. Total weight across all leaves: ${pct(leaves.reduce((sum, path) => sum + pathP(path, p), 0))}.`);
    redraw();
  }
  change(["tree-n"], () => {
    const leaves = paths(num("tree-n"));
    options("tree-path", leaves.map(path => [path, path]), leaves[0]);
    renderTree();
  });
  change(["tree-path", "tree-event"], renderTree);
  click("tree-check-one", () => {
    const status = "tree-one-feedback";
    if (num("tree-n") !== 2) { text(status, "Set the tree to two tosses for this mission."); return; }
    const chosen = all("[data-tree-member]").filter(el => el.checked).map(el => el.value);
    if (chosen.join() !== "HT,TH") { text(status, "Select both ordered leaves containing exactly one H."); return; }
    const p = readTreeBias()[0] / 100;
    get("tree-event").value = "one";
    renderTree();
    text(status, `Correct. HT and TH each weigh ${pct(p * (1 - p))}, so the event has probability ${pct(2 * p * (1 - p))}.`);
  });
  click("tree-check-some", () => {
    const status = "tree-some-feedback";
    if (num("tree-n") !== 2) { text(status, "Set the tree to two tosses for this mission."); return; }
    const answers = inputs(["tree-sum-guess", "tree-complement-guess"], status);
    if (!answers) return;
    const p = readTreeBias()[0] / 100;
    const tt = (1 - p) ** 2, total = p * p + 2 * p * (1 - p);
    const correct = percentCorrect(answers[0], total) && percentCorrect(answers[1], 1 - tt);
    get("tree-event").value = "some";
    renderTree();
    text(status, `${correct ? "Both methods match." : "Check your two calculations."} The sum gives ${pct(total)}. Subtracting TT’s ${pct(tt)} from 100% gives ${pct(1 - tt)}.`);
  });
  click("tree-compare-fair", () => {
    fairTree = true;
    renderTree();
    const p = readTreeBias()[0] / 100;
    const n = num("tree-n");
    text("tree-fair-feedback", p === 0.5 ? "Both columns are fair. Change the coin’s bias to compare different weights."
      : `Same ordered leaves, different weights. The fair coin gives every leaf ${pct(0.5 ** n)}. The current all-heads leaf has probability ${pct(p ** n)}.`);
  });

  // Binomial Distribution Factory
  let sample = null, factoryBase = null, factoryOverlay = false;
  const factory = checkSettings(["factory-p", "factory-n", "factory-m"], [70, 10, 200], clearFactory);
  function clearFactory() {
    sample = null;
    factoryOverlay = false;
    ["mode", "mean", "compare"].forEach(task => text("factory-" + task + "-feedback", ""));
    renderFactory();
  }
  function drawFactory() {
    const [bias, n, m] = factory();
    const p = bias / 100;
    const bins = range(n + 1).fill(0);
    for (let i = 0; i < m; i += 1) bins[countHits(n, p)] += 1;
    sample = { p, n, m, bins, model: weights(n, p) };
    factoryOverlay = false;
    text("factory-mode-feedback", "");
    text("factory-compare-feedback", "");
    renderFactory();
  }
  function renderFactory() {
    const [p, n, m] = factory();
    const ref = factoryOverlay ? factoryBase : null;
    table("factory-rows", range(n + 1).map(k => [k, sample ? sample.bins[k] : dash,
      sample ? pct(sample.bins[k] / sample.m) : dash, sample ? modelPct(sample.model[k]) : dash,
      ref ? pct(ref.bins[k] / ref.m) : dash, ref ? modelPct(ref.model[k]) : dash]));
    for (const row of get("factory-rows").rows) {
      for (const i of [4, 5]) { row.cells[i].dataset.factoryRef = ""; row.cells[i].hidden = !ref; }
    }
    all("[data-factory-ref]").forEach(el => { el.hidden = !ref; });
    text("factory-reading", sample
      ? `${fmt(m)} independent runs of ${n} tosses at ${p}% heads. Solid bars show observations, diamonds show model weights.`
      : `${fmt(m)} planned runs of ${n} tosses at ${p}% heads. The histogram and model appear after sampling.`);
    redraw();
  }
  click("factory-run", drawFactory);
  click("factory-clear", clearFactory);
  click("factory-check-mode", () => {
    const status = "factory-mode-feedback";
    const [p, n] = factory();
    if (p !== 70 || n !== 10) { text(status, "Use ten tosses at 70% heads for this prediction."); return; }
    const guess = input("factory-mode-guess", status);
    if (guess === null) return;
    drawFactory();
    const m = modes(sample.model);
    const tallest = modes(sample.bins);
    text(status, `${m.includes(guess) ? "Correct." : "Compare with the exact model."} Model mode: ${m.join(", ")}. Tallest sampled bin or bins: ${tallest.join(", ")}. A finite sample can have a different mode.`);
  });
  click("factory-check-mean", () => {
    const [p, n] = factory();
    const mean = p * n / 100;
    text("factory-mean-feedback", `${Number.isInteger(mean) ? "Try a setting with a noninteger mean." : "You found a noninteger mean."} Expected count = ${fmt(mean)}. It describes the average across repeated runs. Each individual count is a whole number.`);
  });
  click("factory-pin", () => {
    if (!sample) { text("factory-baseline", "Simulate a histogram before saving it."); return; }
    factoryBase = sample;
    factoryOverlay = false;
    text("factory-baseline", `Saved ${fmt(sample.m)} runs, n = ${sample.n}, p = ${pct(sample.p)}.`);
    renderFactory();
  });
  click("factory-compare", () => {
    const status = "factory-compare-feedback";
    if (!sample || !factoryBase || sample.n !== factoryBase.n || (sample.p === 0.5) === (factoryBase.p === 0.5)) {
      text(status, "Save one histogram and simulate another at the same n. Use a fair coin in just one of the two.");
      return;
    }
    factoryOverlay = true;
    renderFactory();
    text(status, `Both distributions share the 0–100% scale. Saved expectation: ${fmt(factoryBase.n * factoryBase.p)} heads. Current expectation: ${fmt(sample.n * sample.p)} heads. The reference has outlined bars and circles for its model.`);
  });

  // Galton Board
  const board = checkSettings(["board-r", "board-q"], [4, 50], () => {
    boardModelShown = false;
    clearBoard();
    text("board-mode-feedback", "");
    text("board-path-feedback", "");
  });
  let boardBins = range(5).fill(0), boardTotal = 0, boardLast = "", builtPaths = [];
  let boardModelShown = false, boardForecast = null;
  const rights = path => count(path, "R");
  function clearBoard() {
    boardBins = range(board()[0] + 1).fill(0);
    boardTotal = 0;
    boardLast = "";
    builtPaths = [];
    animate("", 0);
    renderBoard();
  }
  function renderBoard() {
    const [r, q] = board();
    const exact = weights(r, q / 100);
    table("board-rows", boardBins.map((balls, i) => [i, balls, pct(freq(balls, boardTotal)), boardModelShown ? pct(exact[i]) : dash]));
    text("board-reading", `${fmt(boardTotal)} sampled balls · Last sampled path ${boardLast ? boardLast + " → bin " + rights(boardLast) : dash}.`);
    redraw();
  }
  function drop(n) {
    const [r, q] = board();
    builtPaths = [];
    for (let i = 0; i < n; i += 1) {
      boardLast = range(r).map(() => hit(q / 100) ? "R" : "L").join("");
      boardBins[rights(boardLast)] += 1;
    }
    boardTotal += n;
    renderBoard();
    animate("board", n === 1 ? 740 : 0);
  }
  click("board-one", () => drop(1));
  click("board-many", () => drop(100));
  click("board-clear", clearBoard);
  click("board-show-model", () => { boardModelShown = true; renderBoard(); });
  click("board-check-mode", () => {
    const status = "board-mode-feedback", [r, q] = board();
    if (q !== 50) { text(status, "Set q to 50% for the fair-board mission."); return; }
    const raw = val("board-mode-guess").trim();
    if (!/^\d+(\s*,\s*\d+)*$/.test(raw)) {
      text(status, "Enter a bin number, or comma-separated numbers if there is a tie.");
      get("board-mode-guess").focus();
      return;
    }
    const chosen = raw.split(",").map(Number).sort((a, b) => a - b);
    const best = modes(weights(r, 0.5));
    boardModelShown = true;
    renderBoard();
    text(status, `${chosen.join() === best.join() ? "Correct." : "Check the exact weights."} Model mode ${best.length === 1 ? "is bin" : "ties at bins"} ${best.join(" and ")}. Sample counts can break a theoretical tie.`);
  });
  click("board-lock-shift", () => {
    const status = "board-shift-feedback";
    const answer = selection("board-shift-guess", status);
    if (answer === null) return;
    const [r, q] = board();
    boardForecast = { r, q, answer };
    text(status, `Prediction saved at q = ${q}% with ${r} rows. Change q and compare.`);
  });
  click("board-check-shift", () => {
    const status = "board-shift-feedback", [r, q] = board();
    if (!boardForecast || boardForecast.r !== r || q === boardForecast.q) {
      text(status, "Lock a prediction, then change q while keeping the row count.");
      return;
    }
    const expected = q > boardForecast.q ? "right" : "left";
    boardModelShown = true;
    renderBoard();
    text(status, `${expected === boardForecast.answer ? "Correct." : "Compare the two means."} The model mean moved ${expected} from ${fmt(r * boardForecast.q / 100)} to ${fmt(r * q / 100)}. These means use r × q.`);
  });
  click("board-check-paths", () => {
    const status = "board-path-feedback", [r] = board();
    const a = val("board-path-a").trim().toUpperCase(), b = val("board-path-b").trim().toUpperCase();
    if ([a, b].some(path => path.length !== r || !/^[LR]+$/.test(path))) {
      text(status, `Enter ${r} letters, L or R, for each path.`);
      return;
    }
    builtPaths = [a, b];
    animate("", 0);
    const result = a !== b && rights(a) === rights(b)
      ? "Correct. Different orders with the same number of right turns reach the same bin."
      : "Use two different paths with the same number of R decisions.";
    text(status, `Constructed path ${a} → bin ${rights(a)}. Constructed path ${b} → bin ${rights(b)}. ${result}`);
    redraw();
  });

  // Streak Detective
  const example = "TTTTHHTHHHTT";
  let sequence = { values: example, p: 0.7, supplied: true, span: null };
  function renderStreak() {
    text("streak-reading", `${sequence.supplied ? "Teaching example" : "Fresh independent draw"} · Fixed ${pct(sequence.p)} heads · ${sequence.values.length} outcomes.`);
    get("streak-sequence").replaceChildren(...[...sequence.values].map((side, i) => {
      const li = make("li", side);
      const inSpan = sequence.span && sequence.span[0] <= i + 1 && i + 1 <= sequence.span[1];
      li.dataset.streakSelected = String(Boolean(inSpan));
      li.setAttribute("aria-label", `Toss ${i + 1}: ${side === "H" ? "heads" : "tails"}${inSpan ? ", selected" : ""}`);
      return li;
    }));
    redraw();
  }
  function setSequence(values, p, supplied) {
    sequence = { values, p, supplied, span: null };
    for (const id of ["streak-start", "streak-end"]) get(id).value = "";
    text("streak-span-feedback", "");
    renderStreak();
  }
  click("streak-example", () => setSequence(example, 0.7, true));
  click("streak-generate", () => {
    const p = input("streak-p", "streak-span-feedback");
    if (p !== null) setSequence(range(num("streak-n")).map(() => toss(p / 100)).join(""), p / 100, false);
  });
  click("streak-check-head", () => {
    const status = "streak-head-feedback", guess = input("streak-head-guess", status);
    if (guess !== null) text(status, `${guess === 70 ? "Correct." : "Use the fixed bias."} After four tails, an independent next toss still has a 70% chance of heads.`);
  });
  click("streak-check-four", () => {
    const status = "streak-four-feedback";
    const answers = inputs(["streak-four-guess", "streak-tail-guess"], status);
    if (!answers) return;
    const ok = percentCorrect(answers[0], 0.3 ** 4) && answers[1] === 30;
    text(status, `${ok ? "Both answers match." : "Distinguish the four positions from the next toss."} Four specified tails have probability 0.30⁴ = 0.81%. The single next toss after those tails still has a 30% chance of tails.`);
  });
  click("streak-check-span", () => {
    const status = "streak-span-feedback", indices = inputs(["streak-start", "streak-end"], status);
    if (!indices) return;
    const [first, last] = indices;
    if (last > sequence.values.length || last - first < 2) {
      text(status, "Choose at least three consecutive positions within the displayed sequence.");
      return;
    }
    const selected = sequence.values.slice(first - 1, last);
    sequence.span = indices;
    renderStreak();
    text(status, new Set(selected).size === 1
      ? `Found ${selected.length} ${selected[0]} outcomes at positions ${first}–${last}. The model still gives ${pct(sequence.p)} heads next.`
      : `Positions ${first}–${last} include both H and T. Find three or more matching outcomes in order.`);
  });

  // Conditional Probability Vault
  const composition = checkSettings(["vault-r", "vault-b"], [3, 2], () => {
    get("vault-depend-table").hidden = true;
    for (const id of ["vault-rr-feedback", "vault-depend-feedback", "vault-some-feedback"]) text(id, "");
    resetVault();
  });
  let drawn = [];
  const sum = ([a, b]) => a + b;
  const red = mix => freq(mix[0], sum(mix));
  const mode = () => val("vault-mode");
  function following(mix, first, rule) {
    const i = first === "R" ? 0 : 1;
    if (!mix[i]) return null;
    return mix.map((n, j) => n - Number(rule === "without" && i === j));
  }
  function twoAvailable(mix, rule) { return sum(mix) >= (rule === "with" ? 1 : 2); }
  function ordered(mix, a, b, rule) {
    if (!twoAvailable(mix, rule)) return null;
    const after = following(mix, a, rule);
    if (!after) return 0;
    return mix[a === "R" ? 0 : 1] / sum(mix) * after[b === "R" ? 0 : 1] / sum(after);
  }
  const chanceText = mix => `R ${pct(red(mix))}, B ${pct(freq(mix[1], sum(mix)))}`;
  function renderVault() {
    const mix = composition();
    const after = drawn.length ? following(mix, drawn[0], mode()) : null;
    text("vault-reading", `Starting mix: ${mix[0]} R and ${mix[1]} B. First draw: ${sum(mix) ? chanceText(mix) : "unavailable, container empty"}.`);
    text("vault-second", !after ? "Draw one ball to see the composition before draw two."
      : `First draw: ${drawn[0]}. Before draw two: ${after[0]} R and ${after[1]} B. ${sum(after) ? "Conditional chances: " + chanceText(after) : "The second draw is unavailable"}.`);
    text("vault-result", drawn.length === 2 ? `Joint result ${drawn.join("")} · Model path chance ${pct(ordered(mix, ...drawn, mode()))}.`
      : drawn.length ? "One draw recorded." : "No ordered result yet.");
    get("vault-draw").disabled = drawn.length >= 2 || !sum(after || mix);
    redraw();
  }
  function resetVault() { drawn = []; renderVault(); }
  change(["vault-mode"], () => { text("vault-some-feedback", ""); resetVault(); });
  click("vault-reset", resetVault);
  click("vault-draw", () => {
    if (drawn.length >= 2) return;
    const mix = drawn.length ? following(composition(), drawn[0], mode()) : composition();
    if (!sum(mix)) return;
    drawn.push(hit(red(mix)) ? "R" : "B");
    renderVault();
    if (get("vault-draw").disabled && document.activeElement === get("vault-draw")) get("vault-reset").focus();
  });
  for (const rule of ["with", "without"]) click("vault-check-rr-" + rule, () => {
    const status = "vault-rr-feedback";
    const m = composition(), chance = ordered(m, "R", "R", rule);
    if (chance === null) { text(status, "A two-draw trial is unavailable under this rule."); return; }
    const guess = input("vault-rr-" + rule, status);
    if (guess === null) return;
    const after = following(m, "R", rule);
    text(status, `${percentCorrect(guess, chance) ? "Correct." : "Compare with the product."} Two reds ${rule} replacement have probability ${pct(chance)}. ${after ? pct(red(m)) + " on draw one × " + pct(red(after)) + " given R on draw one." : "A first red is impossible, so the joint event has probability zero. The conditional given a first red is undefined."}`);
  });
  click("vault-check-depend", () => {
    const status = "vault-depend-feedback", m = composition();
    if (!m.every(n => n > 0)) { text(status, "Use both categories so both first results are possible."); return; }
    const guess = selection("vault-depend-guess", status);
    if (guess === null) return;
    for (const rule of ["with", "without"]) {
      text("vault-" + rule + "-r", pct(red(following(m, "R", rule))));
      text("vault-" + rule + "-b", pct(red(following(m, "B", rule))));
    }
    get("vault-depend-table").hidden = false;
    text(status, `${guess === "without" ? "Correct." : "Compare the two rows."} Without replacement, removing R and removing B leave different mixtures. With replacement, either first result leaves the original mixture for draw two.`);
  });
  click("vault-check-some", () => {
    const status = "vault-some-feedback", bb = ordered(composition(), "B", "B", mode());
    if (bb === null) { text(status, "A two-draw trial is unavailable under the current rule."); return; }
    const guess = input("vault-some-guess", status);
    if (guess !== null) text(status, `${percentCorrect(guess, 1 - bb) ? "Correct." : "Check the complement."} With the current rule, two blues have chance ${pct(bb)}, so at least one red has chance ${pct(1 - bb)}.`);
  });

  // Rare Event Challenge
  const rare = checkSettings(["rare-p", "rare-n"], [1, 100], () => {
    clearRare();
    ["target", "hundred", "zero"].forEach(task => text("rare-" + task + "-feedback", ""));
  });
  let rareRun = { runs: 0, hits: 0, last: null };
  const zeroLog = (p, n) => n === 0 || p === 0 ? 0 : p === 1 ? -Infinity : n * Math.log1p(-p);
  const anyEvent = (p, n) => p === 0 || n === 0 ? 0 : -Math.expm1(zeroLog(p, n));
  function eventLabel(p, n) {
    const chance = anyEvent(p, n);
    return p > 0 && p < 1 && n > 0 && Math.round(chance * 10000) === 10000
      ? ">99.99% and <100%" : pct(chance);
  }
  function zeroLabel(p, n) {
    const log = zeroLog(p, n);
    const probability = Math.exp(log);
    return log > -Infinity && Math.round(probability * 10000) === 0
      ? ">0% and <0.01%" : pct(probability);
  }
  function renderRare() {
    const [bias, n] = rare();
    text("rare-next", pct(bias / 100));
    text("rare-any", eventLabel(bias / 100, n));
    text("rare-last", rareRun.last === null ? dash : `${fmt(rareRun.last)} · ${rareRun.last ? "event recorded" : "no event"}`);
    text("rare-observed", rareRun.runs ? `${fmt(rareRun.hits)} / ${fmt(rareRun.runs)} · ${pct(rareRun.hits / rareRun.runs)}` : dash);
    redraw();
  }
  function clearRare() {
    rareRun = { runs: 0, hits: 0, last: null };
    animate("", 0);
    text("rare-status", "No runs yet at these settings.");
    renderRare();
  }
  function runRare(repeats) {
    const [bias, n] = rare();
    const p = bias / 100;
    let thisBatch = 0;
    for (let i = 0; i < repeats; i += 1) {
      rareRun.last = countHits(n, p);
      if (rareRun.last > 0) thisBatch += 1;
    }
    rareRun.runs += repeats;
    rareRun.hits += thisBatch;
    text("rare-status", `${thisBatch} of ${repeats} new ${repeats === 1 ? "run" : "runs"} contained an event. Each run had ${fmt(n)} independent trials.`);
    renderRare();
    animate("rare", rareRun.last > 0 ? 480 : 0);
  }
  click("rare-one", () => runRare(1));
  click("rare-many", () => runRare(100));
  click("rare-clear", clearRare);

  // The input probabilities are integer basis points. This comparison is exact.
  function compareTarget(bias, n, target) {
    const scale = 10000n, power = BigInt(n);
    const complement = BigInt(10000 - Math.round(bias * 100)) ** power * scale;
    const boundary = BigInt(10000 - Math.round(target * 100)) * scale ** power;
    return complement < boundary ? 1 : complement > boundary ? -1 : 0;
  }
  click("rare-check-target", () => {
    const status = "rare-target-feedback";
    const target = input("rare-target", status);
    if (target === null) return;
    const [bias] = rare();
    if (bias === 0 || target === 100) {
      text(status, "No finite run can strictly exceed this target.");
      return;
    }
    const cap = Number(get("rare-n").max);
    if (compareTarget(bias, cap, target) <= 0) {
      text(status, `A finite answer exists above the ${fmt(cap)}-trial simulator cap. Chance at the cap: ${eventLabel(bias / 100, cap)}.`);
      return;
    }
    const n = input("rare-candidate", status);
    if (n === null) return;
    if (!n) { text(status, "Zero trials have zero chance of an event. Try a positive candidate."); return; }
    const current = compareTarget(bias, n, target), previous = compareTarget(bias, n - 1, target);
    const relation = c => c > 0 ? "exceeds" : c < 0 ? "is below" : "equals";
    const verdict = current > 0 && previous <= 0 ? "Correct. This is the first n strictly over the target."
      : current <= 0 ? "Increase the candidate." : "A smaller candidate already exceeds the target.";
    const p = bias / 100;
    text(status, `n = ${n}: ${eventLabel(p, n)} ${relation(current)} the target. n = ${n - 1}: ${eventLabel(p, n - 1)} ${relation(previous)} the target. ${verdict}`);
  });
  click("rare-check-hundred", () => {
    const status = "rare-hundred-feedback", guess = input("rare-hundred-guess", status);
    if (guess === null) return;
    const p = rare()[0] / 100;
    text(status, `${percentCorrect(guess, anyEvent(p, 100)) ? "Matches when rounded to hundredths of a percent." : "Compare with the run model."} Next trial: ${pct(p)}. At least one in 100 trials: ${eventLabel(p, 100)}.`);
  });
  click("rare-check-zero", () => {
    const status = "rare-zero-feedback", [bias, n] = rare();
    if (compareTarget(bias, n, 50) <= 0) { text(status, "First make the chance of an event greater than 50%."); return; }
    const guess = selection("rare-zero-guess", status);
    if (guess === null) return;
    const p = bias / 100;
    const expected = bias < 100 ? "yes" : "no";
    runRare(1);
    text(status, `${guess === expected ? "Correct." : "Check the complement."} The model chance of zero events is ${zeroLabel(p, n)}. This run gave ${fmt(rareRun.last)}. One run is one observation.`);
  });

  // Calibration forecasts are recorded only by a completed draw.
  const mixtures = { low: [2, 6], mid: [5, 5], high: [6, 2] };
  const groups = range(11).map(() => ({ n: 0, stars: 0 }));
  const usedMixtures = new Set();
  let locked = null, records = [], forecasts = 0;
  const mixLabel = ([star, plain]) => `${star} starred, ${plain} plain`;
  const starChance = mix => mix[0] / sum(mix);
  const resultLabel = star => star ? "★ Starred" : "○ Plain";

  function renderCal() {
    const isLocked = locked !== null;
    for (const id of ["cal-mixture", "cal-forecast", "cal-lock"]) get(id).disabled = isLocked;
    for (const id of ["cal-draw", "cal-cancel"]) get(id).disabled = !isLocked;
    text("cal-reading", `Mixture: ${mixLabel(mixtures[val("cal-mixture")])}. Completed forecasts: ${fmt(forecasts)}.`);
    table("cal-groups", groups.map(({ n, stars }, i) => [i * 10 + "%", n, stars, n ? i * 10 + "%" : dash, pct(freq(stars, n))]));
    table("cal-records", records.map(r => [r.index, mixLabel(mixtures[r.key]), r.guess + "%", pct(starChance(mixtures[r.key])), resultLabel(r.star)]),
      "No completed forecasts.", 5);
    const chosen = val("cal-example");
    options("cal-example", [["", "Choose a recorded forecast"], ...records.filter(r => r.guess > 0 && r.guess < 100)
      .map(r => [r.index, `#${r.index} · ${r.guess}% · ${resultLabel(r.star)}`])], chosen);
    redraw();
  }
  change(["cal-mixture"], () => {
    text("cal-status", "Choose and lock a forecast for this mixture.");
    renderCal();
  });
  click("cal-lock", () => {
    if (locked) return;
    const forecast = selection("cal-forecast", "cal-status");
    if (forecast === null) return;
    locked = { guess: Number(forecast), key: val("cal-mixture") };
    text("cal-status", `Locked ${locked.guess}% for ${mixLabel(mixtures[locked.key])}. Draw one token when ready.`);
    renderCal();
    get("cal-draw").focus();
  });
  click("cal-cancel", () => {
    if (!locked) return;
    locked = null;
    text("cal-status", "Forecast canceled. No trial was recorded.");
    renderCal();
    get("cal-forecast").focus();
  });
  click("cal-draw", () => {
    if (!locked) return;
    const forecast = locked;
    locked = null;
    const prob = starChance(mixtures[forecast.key]);
    const star = hit(prob);
    forecasts += 1;
    records.push({ ...forecast, star, index: forecasts });
    if (records.length > 20) records.shift();
    usedMixtures.add(forecast.key);
    const group = groups[forecast.guess / 10];
    group.n += 1;
    group.stars += Number(star);
    get("cal-forecast").value = "";
    text("cal-status", `Trial ${fmt(forecasts)}: forecast ${forecast.guess}%, drew ${resultLabel(star)}. The mixture’s known chance was ${pct(prob)}. A new forecast uses a fresh draw.`);
    renderCal();
    get("cal-forecast").focus();
  });
  click("cal-check-mixtures", () => {
    const description = [...usedMixtures].map(key => {
      const mix = mixtures[key];
      return `${mix[0]}/${sum(mix)} starred = ${pct(starChance(mix))}`;
    }).join("; ");
    text("cal-mixture-feedback", `Completed ${usedMixtures.size} of 3 mixtures. ${description ? description + "." : "Start by locking and drawing from one mixture."} ${usedMixtures.size === 3 ? "You compared all three proportions." : "Try each remaining mixture."}`);
  });
  click("cal-check-fifty", () => {
    const { n, stars } = groups[5];
    text("cal-fifty-feedback", n ? `Mean forecast: 50%. Recorded ${stars} stars in ${n} ${n === 1 ? "trial" : "trials"}, or ${pct(stars / n)}. Small samples can differ substantially from the forecast.`
      : "Complete a 50% forecast and draw to start its group.");
  });
  click("cal-check-example", () => {
    const status = "cal-example-feedback";
    const example = records.find(r => r.index === num("cal-example") && r.guess > 0 && r.guess < 100);
    if (!example) { text(status, "Select a recent forecast between 0% and 100%."); return; }
    const ans = selection("cal-interpret", status);
    if (ans === null) return;
    const { n, stars } = groups[example.guess / 10];
    const detail = example.guess === 50 ? "Both outcomes had the same forecast probability."
      : example.star === (example.guess > 50) ? "Even the less likely result could have occurred."
      : "This was the less likely outcome under the forecast.";
    text(status, `${ans === "context" ? "Correct." : "One result gives limited evidence."} Trial ${example.index}: ${example.guess}% forecast, ${resultLabel(example.star)} drawn. ${detail} This group has ${n} ${n === 1 ? "trial" : "trials"} and a ${pct(stars / n)} star frequency. Assess calibration across many trials.`);
  });

  // Shared drawing plans. A renderer never changes a trial.
  const W = 640, H = 360;
  const ink = "#eafff0", grid = "#527564", mint = "#78f8a6", blue = "#65b7ff",
    violet = "#c19bff", gold = "#ffe16a", redInk = "#ff767f";
  function plan(caption) {
    const marks = [];
    return {
      caption, marks,
      line(points, color = grid, dash = false) { marks.push({ type: "line", points, color, dash }); },
      label(x, y, label, color = ink) { marks.push({ type: "label", x, y, label, color }); },
      block(x, y, w, h, color, outline = false) { marks.push({ type: "block", x, y, w, h, color, outline }); },
      token(x, y, r, color, type = "sphere", tag = "") { marks.push({ type, x, y, r, color, tag }); },
      move(path) { const [x, y] = path.at(-1); marks.push({ type: "ball", x, y, path, r: 8, color: gold }); }
    };
  }
  function axis(d, left, right, top, bottom, tag) {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const y = bottom - f * (bottom - top);
      d.line([[left, y], [right, y]], grid, f !== 0);
      d.label(left - 28, y, Math.round(100 * f) + "%");
    }
    d.line([[left, top], [left, bottom]]);
    d.label((left + right) / 2, bottom + 35, tag);
    return f => bottom - f * (bottom - top);
  }
  function coinPlan() {
    const d = plan("The last face and running heads frequency come from the same recorded tosses. The dashed line shows the model.");
    const face = run.recent.at(-1) || "?";
    d.token(110, 152, 55, blue, "coin", face);
    d.label(110, 243, face === "?" ? "Ready" : face === "H" ? "H · Heads" : "T · Tails");
    const Y = axis(d, 245, 599, 57, 277, "Toss number");
    const X = n => 245 + n * 354 / Math.max(1, run.n);
    d.line([[245, Y(pCoin())], [599, Y(pCoin())]], gold, true);
    d.label(434, 31, "Running frequency of H");
    d.label(245, 295, "0");
    if (run.n) {
      const data = [...run.trace];
      if (data.at(-1)?.[0] !== run.n) data.push([run.n, run.h / run.n]);
      if (data.length > 1) d.line(data.map(([n, f]) => [X(n), Y(f)]), mint);
      d.token(X(run.n), Y(run.h / run.n), 4, mint);
      d.label(590, 295, fmt(run.n));
    }
    return d;
  }
  function treePlan() {
    const p = readTreeBias()[0] / 100, n = num("tree-n");
    const leaves = paths(n), step = 265 / leaves.length;
    const d = plan("Each branch is labeled H or T with its model weight. Bright paths lead to the selected leaves. Branches below a zero-weight history are formal links.");
    const selected = leaves.filter(treeSelected);
    const X = i => 53 + i * (493 / n);
    function branch(prefix, start, end) {
      const i = prefix.length, x = X(i), y = 48 + step * (start + end) / 2;
      if (i === n) {
        d.label(590, y, prefix + " " + pct(pathP(prefix, p)), treeSelected(prefix) ? mint : ink);
        return;
      }
      const middle = (start + end) / 2;
      for (const [side, lo, hi, q] of [["H", start, middle, p], ["T", middle, end, 1 - p]]) {
        const next = prefix + side, yy = 48 + step * (lo + hi) / 2;
        const marked = selected.some(path => path.startsWith(next));
        d.line([[x, y], [X(i + 1), yy]], marked ? mint : grid, !marked);
        d.label(x + (X(i + 1) - x) * 0.63, y + 0.63 * (yy - y) + (side === "H" ? -8 : 8), side + " " + pct(q), marked ? mint : ink);
        branch(next, lo, hi);
      }
      d.token(x, y, 5, gold);
    }
    branch("", 0, leaves.length);
    d.label(53, 331, "Start");
    d.label(585, 331, "Ordered leaves");
    return d;
  }
  function factoryPlan() {
    const d = plan("Solid bars are sampled relative frequencies. Exact model probabilities are diamonds. A saved comparison uses outlined bars and model circles.");
    const [, n] = factory(), Y = axis(d, 77, 610, 44, 279, "Heads per run · k");
    const width = 533 / (n + 1), ref = factoryOverlay ? factoryBase : null;
    range(n + 1).forEach(k => {
      const x = 77 + width * (k + 0.5);
      d.label(x, 297, String(k));
      for (const [set, isRef] of [[sample, false], [ref, true]]) {
        if (!set) continue;
        const h = set.bins[k] / set.m * 235;
        const center = ref ? x + width * (isRef ? 0.19 : -0.19) : x;
        if (h > 0) d.block(center, 279 - h / 2, width * (ref ? 0.32 : 0.64), h, isRef ? violet : blue, isRef);
        d.token(center, Y(set.model[k]), 4, isRef ? violet : gold, isRef ? "sphere" : "diamond");
      }
    });
    d.label(342, 22, ref ? "Current and saved distributions" : "Observed and theoretical weights");
    return d;
  }
  function boardPlan() {
    const [r] = board();
    const d = plan("The sampled path follows the recorded L/R decisions. Constructed paths are shown separately and never add balls to bins.");
    const X = (n, k) => 320 + (k - n / 2) * 478 / r;
    const Y = n => 45 + 192 * n / r;
    function track(s) {
      let k = 0;
      const decisions = [...s].map((side, i) => {
        if (side === "R") k += 1;
        return [X(i + 1, k), Y(i + 1)];
      });
      return [[X(0, 0), Y(0)], ...decisions, [X(r, k), 260]];
    }
    for (let n = 0; n < r; n += 1) {
      for (let k = 0; k <= n; k += 1) d.token(X(n, k), Y(n), 4, grid);
    }
    range(r + 1).forEach(k => {
      const x = X(r, k);
      d.block(x, 260, Math.min(38, 369 / r), 20, grid, true);
      d.label(x, 261, String(k));
      d.label(x, 293, fmt(boardBins[k]));
    });
    if (builtPaths.length) builtPaths.forEach((s, i) => d.line(track(s), i ? violet : mint, Boolean(i)));
    else if (boardLast) {
      const path = track(boardLast);
      d.line(path, mint);
      d.move(path);
    }
    d.label(320, 23, builtPaths.length ? "Constructed paths · solid and dashed" : "Sampled drop path");
    d.label(320, 330, "Bin number · ball count below");
    return d;
  }
  function streakPlan() {
    const d = plan("The strip shows the indexed, recorded sequence. Highlighted positions mark the learner’s selected interval.");
    [...sequence.values].forEach((s, i) => {
      const x = 62 + 68 * (i % 8), y = 25 + Math.floor(i / 8) * 32;
      const marked = sequence.span && sequence.span[0] <= i + 1 && i + 1 <= sequence.span[1];
      d.block(x, y, 57, 25, marked ? gold : grid, true);
      d.label(x, y, `${i + 1} ${s}`, marked ? gold : s === "H" ? blue : violet);
    });
    return d;
  }
  function containerPlan(vault) {
    const mix = vault && drawn.length ? following(composition(), drawn[0], mode())
      : vault ? composition() : mixtures[val("cal-mixture")];
    const d = plan(vault ? "The container shows the starting mixture or the composition before draw two. The ordered draw remains in the readout."
      : "Every forecast locks the displayed mixture. Drawing returns the token before the next trial.");
    d.block(321, 168, 425, 215, grid, true);
    mix.forEach((n, j) => {
      for (let i = 0; i < n; i += 1) {
        const x = 183 + 51 * (i % 4), y = 101 + 50 * j + 100 * Math.floor(i / 4);
        d.token(x, y, 17, j ? blue : vault ? redInk : gold, j ? "diamond" : "sphere", vault ? (j ? "B" : "R") : (j ? "○" : "★"));
      }
    });
    d.label(321, 318, vault ? `${mix[0]} R · ${mix[1]} B` : mixLabel(mix));
    return d;
  }
  function rarePlan() {
    const d = plan("The detector indicator reflects the recorded last run. The cue flashes only when that run contained a sampled event.");
    d.block(320, 164, 510, 233, grid, true);
    d.line([[110, 164], [520, 164]], violet, true);
    d.line([[202, 78], [202, 250]], blue);
    d.line([[438, 78], [438, 250]], blue);
    d.token(320, 164, 58, rareRun.last > 0 ? mint : grid, rareRun.last > 0 ? "cue" : "sphere");
    d.label(320, 164, rareRun.last === null ? "Ready" : rareRun.last ? "Event" : "No event");
    d.label(320, 316, "Simulated detector");
    return d;
  }

  const scenes = { coin: coinPlan, observatory: coinPlan, tree: treePlan, factory: factoryPlan,
    board: boardPlan, streak: streakPlan, vault: () => containerPlan(true), rare: rarePlan, cal: () => containerPlan(false) };
  const host = get("prob-apparatus");
  const gl = get("prob-gl"), flat = get("prob-flat"), viewport = gl.parentElement;
  const stations = get("prob-stations");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motion.matches || get("prob-reduced").checked;
  const ratio = () => Math.min(window.devicePixelRatio || 1, reduced() ? 1 : 1.5);
  let painter = null, active = "coin", selected = "observatory", current = null, effect = null, frame = 0, inView = true;
  function schedule() {
    if (!frame && !document.hidden && inView) frame = requestAnimationFrame(paint);
  }
  function redraw() { current = null; schedule(); }
  function animate(kind, ms) {
    effect = ms && !reduced() && !document.hidden && inView ? { kind, ms, start: performance.now() } : null;
    schedule();
  }
  function show(name) {
    if (name !== active) effect = null;
    active = name;
    const slot = lesson.querySelector(`[data-prob-scene="${name}"]`);
    if (host.parentElement !== slot) slot.append(host);
    redraw();
  }
  const stationButtons = all("[data-prob-station]");
  stationButtons.forEach(button => button.addEventListener("click", () => {
    selected = button.dataset.probStation;
    stationButtons.forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    all("[data-prob-panel]").forEach(panel => { panel.hidden = panel.dataset.probPanel !== selected; });
    show(selected);
    get(selected === "observatory" ? "obs-title" : selected + "-title").focus();
  }));
  stations.addEventListener("toggle", () => show(stations.open ? selected : "coin"));
  stations.addEventListener("focusin", event => {
    if (stations.open && event.target.closest("[data-prob-panel]") && active !== selected) show(selected);
  });
  get("prob-lab").addEventListener("focusin", () => { if (active !== "coin") show("coin"); });
  all('a[href="#prob-lab"], a[href="#prob-compare"]').forEach(link => link.addEventListener("click", () => {
    show("coin");
    get(link.getAttribute("href").slice(1)).focus({ preventScroll: true });
  }));

  function pose(mark, kind, t) {
    const { type, x, y, tag } = mark;
    if (type === "coin") return { x, y: y - (kind === "coin" ? 41 * Math.sin(Math.PI * t) : 0),
      angle: (tag === "T" ? Math.PI : 0) + (kind === "coin" ? 4 * Math.PI * t : 0), scale: 1 };
    if (type === "ball" && kind === "board") {
      const v = t * (mark.path.length - 1);
      const i = Math.min(mark.path.length - 2, Math.floor(v));
      const [a, b] = [mark.path[i], mark.path[i + 1]];
      return { x: a[0] + (b[0] - a[0]) * (v - i), y: a[1] + (b[1] - a[1]) * (v - i), angle: 0, scale: 1 };
    }
    return { x, y, angle: 0, scale: type === "cue" && kind === "rare" ? 1 + 0.18 * Math.sin(Math.PI * t) : 1 };
  }
  function paint(timestamp) {
    frame = 0;
    if (document.hidden || !inView || viewport.hidden) return;
    if (!current) {
      current = scenes[active]();
      text("prob-apparatus-caption", current.caption);
    }
    const { width: w, height: h } = viewport.getBoundingClientRect();
    if (!w || !h) return;
    const t = effect ? Math.max(0, Math.min(1, (timestamp - effect.start) / effect.ms)) : 1;
    const kind = effect && t < 1 ? effect.kind : "";
    if (!kind) effect = null;
    if (painter) {
      try { painter.paint(current, w, h, kind, t); }
      catch { fallback("The 3D view stopped."); }
    }
    if (!painter) paintFlat(current, w, h, kind, t);
    if (effect) schedule();
  }

  function paintFlat(data, w, h, kind, t) {
    const ctx = flat.getContext("2d");
    if (!ctx) return;
    const dpi = ratio(), scale = Math.min(w / W, h / H);
    const width = Math.round(w * dpi), height = Math.round(h * dpi);
    if (flat.width !== width || flat.height !== height) { flat.width = width; flat.height = height; }
    ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpi * scale, 0, 0, dpi * scale, dpi * (w - W * scale) / 2, dpi * (h - H * scale) / 2);
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const m of data.marks) {
      ctx.fillStyle = ctx.strokeStyle = m.color;
      ctx.setLineDash(m.dash ? [6, 4] : []);
      if (m.type === "line") {
        ctx.beginPath();
        m.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.stroke();
      } else if (m.type === "label") ctx.fillText(m.label, m.x, m.y);
      else if (m.type === "block") {
        ctx[m.outline ? "strokeRect" : "fillRect"](m.x - m.w / 2, m.y - m.h / 2, m.w, m.h);
      } else {
        const { x, y, angle, scale } = pose(m, kind, t);
        const r = m.r * scale;
        const flip = m.type === "coin" ? Math.max(0.08, Math.abs(Math.cos(angle))) : 1;
        const face = m.type === "coin" && m.tag !== "?" ? (Math.cos(angle) >= 0 ? "H" : "T") : m.tag;
        ctx.beginPath();
        if (m.type === "diamond") {
          ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
        } else ctx.ellipse(x, y, r, r * flip, 0, 0, 2 * Math.PI);
        if (face === "T") ctx.fillStyle = violet;
        ctx.fill();
        if (face && flip > 0.3) {
          ctx.fillStyle = "#07150c";
          ctx.fillText(face, x, y);
        }
      }
    }
    get("prob-apparatus-static").hidden = true;
    flat.hidden = false;
  }

  function makeGPU(T) {
    const renderer = new T.WebGLRenderer({ canvas: gl, alpha: true, antialias: !reduced() });
    const world = new T.Scene();
    const camera = new T.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 700);
    camera.position.z = 460;
    world.add(new T.HemisphereLight(0xffffff, 0x285039, 2));
    const light = new T.DirectionalLight(0xdfffee, 2.5);
    light.position.set(-170, 210, 270);
    world.add(light);
    const group = new T.Group();
    world.add(group);
    let previous, geometrySize = "", animated = [];
    const point = ([x, y]) => new T.Vector3(x - W / 2, H / 2 - y, 0);
    const body = (geometry, color) => new T.Mesh(geometry, new T.MeshStandardMaterial({ color, roughness: 0.48 }));
    function place(obj, x, y, z = 0) { obj.position.set(x - W / 2, H / 2 - y, z); }
    function label(text, color, size = 14, billboard = true) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 64;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(text, 256, 32, 500);
      const map = new T.CanvasTexture(c);
      map.colorSpace = T.SRGBColorSpace;
      const w = 512 * size / 36, h = 64 * size / 36;
      if (!billboard) return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
      const sprite = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false, toneMapped: false }));
      sprite.scale.set(w, h, 1);
      return sprite;
    }
    function line(points, color, dash) {
      const geo = new T.BufferGeometry().setFromPoints(points.map(point));
      const mat = dash ? new T.LineDashedMaterial({ color, dashSize: 6, gapSize: 4 }) : new T.LineBasicMaterial({ color });
      const obj = new T.Line(geo, mat);
      if (dash) obj.computeLineDistances();
      return obj;
    }
    function coin(m) {
      const token = new T.Group();
      const coinShape = new T.CylinderGeometry(m.r, m.r, 12, reduced() ? 32 : 56);
      coinShape.rotateX(Math.PI / 2);
      // Cylinder material groups are rim, top and bottom. Top faces +Z.
      const materials = [gold, blue, violet].map(color => new T.MeshStandardMaterial({ color, roughness: 0.38 }));
      token.add(new T.Mesh(coinShape, materials));
      for (const [sign, face] of [[1, "H"], [-1, "T"]]) {
        const glyph = label(m.tag === "?" ? "?" : face, "#07150c", 47, false);
        if (glyph) {
          glyph.position.z = 6.2 * sign;
          if (sign < 0) glyph.rotation.x = Math.PI;
          token.add(glyph);
        }
      }
      return token;
    }
    function clear() {
      for (const item of [...group.children]) {
        item.traverse(obj => {
          if (!obj.isSprite) obj.geometry?.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
          for (const material of materials) {
            material.map?.dispose();
            material.dispose();
          }
        });
        group.remove(item);
      }
      animated = [];
    }
    function build(data) {
      clear();
      for (const m of data.marks) {
        let obj;
        if (m.type === "line") obj = line(m.points, m.color, m.dash);
        else if (m.type === "label") {
          obj = label(m.label, m.color);
          if (!obj) continue;
          place(obj, m.x, m.y, 25);
        } else if (m.type === "block") {
          if (!m.outline) {
            obj = body(new T.BoxGeometry(m.w, m.h, 12), m.color);
            place(obj, m.x, m.y, 1);
          } else {
            const a = m.x - m.w / 2, b = m.x + m.w / 2, c = m.y - m.h / 2, e = m.y + m.h / 2;
            obj = line([[a, c], [b, c], [b, e], [a, e], [a, c]], m.color, false);
          }
        } else {
          obj = m.type === "coin" ? coin(m) : body(m.type === "diamond"
            ? new T.OctahedronGeometry(m.r) : new T.SphereGeometry(m.r, 16, 12), m.color);
          place(obj, m.x, m.y, 12);
          if (m.type !== "coin" && m.tag) {
            const glyph = label(m.tag, "#07150c", 17);
            if (glyph) { glyph.position.z = m.r + 2; obj.add(glyph); }
          }
          if (["coin", "ball", "cue"].includes(m.type)) animated.push([obj, m]);
        }
        group.add(obj);
      }
    }
    return {
      paint(data, w, h, kind, t) {
        if (previous !== data) { build(data); previous = data; }
        const dpi = ratio(), size = `${w}:${h}:${dpi}`;
        if (size !== geometrySize) {
          geometrySize = size;
          renderer.setPixelRatio(dpi);
          renderer.setSize(w, h, false);
          const scale = Math.min(w / W, h / H);
          camera.left = -w / scale / 2; camera.right = -camera.left;
          camera.top = h / scale / 2; camera.bottom = -camera.top;
          camera.updateProjectionMatrix();
        }
        animated.forEach(([obj, m]) => {
          const p = pose(m, kind, t);
          place(obj, p.x, p.y, 12);
          obj.rotation.x = p.angle;
          obj.scale.setScalar(p.scale);
        });
        renderer.render(world, camera);
      },
      dispose() { clear(); renderer.dispose(); }
    };
  }

  function fallback(reason) {
    const old = painter;
    painter = null;
    try { old?.dispose(); } catch { /* The lost context may already be invalid. */ }
    gl.hidden = true;
    const available = Boolean(flat.getContext("2d"));
    flat.hidden = !available;
    viewport.hidden = !available;
    get("prob-apparatus-static").hidden = true;
    text("prob-render-status", `${reason} ${available ? "Using the 2D view." : "Use the numerical readouts."} Controls remain available.`);
    redraw();
  }
  function stopEffect() { effect = null; cancelAnimationFrame(frame); frame = 0; }
  gl.addEventListener("webglcontextlost", () => fallback("The WebGL context was lost."));
  change(["prob-reduced"], () => { if (reduced()) stopEffect(); redraw(); });
  const motionChange = () => { stopEffect(); redraw(); };
  if (motion.addEventListener) motion.addEventListener("change", motionChange);
  else motion.addListener?.(motionChange);
  window.addEventListener("resize", redraw);
  if ("ResizeObserver" in window) new ResizeObserver(redraw).observe(viewport);
  if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) redraw();
    else stopEffect();
  }).observe(viewport);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopEffect();
    else redraw();
  });

  for (const suffix of ["toss-controls", "prediction-controls", "compare-controls", "pair-prediction-controls", "pair-controls"]) {
    get("prob-" + suffix).disabled = false;
  }
  all("[data-prob-enable]").forEach(el => { el.disabled = false; });
  renderBias();
  renderCoin();
  clearComparison();
  renderPairs();
  renderTree();
  renderFactory();
  renderBoard();
  renderStreak();
  renderVault();
  renderRare();
  renderCal();
  text("prob-run-feedback", "Ready at 70% heads. Save a prediction or toss to start.");
  text("prob-render-status", "Loading the local 3D view…");
  if (stations.open && !["#prob-lab", "#prob-compare"].includes(window.location?.hash)) show(selected);

  import("../vendor/three.module.js").then(T => {
    try {
      painter = makeGPU(T);
      gl.hidden = false;
      flat.hidden = true;
      get("prob-apparatus-static").hidden = true;
      text("prob-render-status", "");
      redraw();
    } catch {
      fallback("WebGL is unavailable.");
    }
  }, () => fallback("The local Three.js module could not load."));
})();