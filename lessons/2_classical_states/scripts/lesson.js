(() => {
  "use strict";

  const root = document.querySelector(".site-main.states-lesson");
  const scene = root?.querySelector("#states-scene");
  if (!scene) return;

  const get = id => root.querySelector(`#${id}`);
  const all = selector => [...root.querySelectorAll(selector)];
  const text = (id, content) => { get(id).textContent = content; };
  const value = id => get(id).value;
  const number = id => Number(value(id));
  const click = (id, fn) => get(id).addEventListener("click", fn);
  const watch = (ids, fn, event = "change") => ids.forEach(id => get(id).addEventListener(event, fn));
  const row = (key, name) => root.querySelector(`[data-${key}="${name}"]`);
  const plain = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
  const plus = new Intl.NumberFormat("en", { maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const signed = n => plus.format(n).replace("-", "−");
  const fmt = n => plain.format(n).replace("-", "−");
  const dash = "—";
  const same = (a, b) => Math.abs(a - b) < 1e-9;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const range = (first, last) => Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const coat = ["#65b7ff", "#c19bff", "#ffe16a", "#78f8a6"];
  const ink = "#ecfff1";
  const grid = "#497260";
  const muted = "#aacbb8";
  const coast = (x, v, t) => x + v * t;
  const acceleration = (x, v, a, t) => ({ x: x + v * t + 0.5 * a * t * t, v: v + a * t });

  function writeCells(tr, values, start = 1) {
    values.forEach((val, i) => { tr.cells[start + i].textContent = val; });
  }

  function writeRows(id, rows, columnCount, empty) {
    const body = get(id);
    body.replaceChildren();
    if (!rows.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = columnCount;
      cell.textContent = empty;
      return;
    }
    for (const [label, ...values] of rows) {
      const tr = body.insertRow();
      const head = document.createElement("th");
      head.scope = "row";
      head.textContent = label;
      tr.append(head);
      values.forEach(val => { tr.insertCell().textContent = val; });
    }
  }

  function clear(ids) {
    ids.forEach(id => {
      get(id).value = "";
      get(id).removeAttribute("aria-invalid");
    });
  }

  function guess(id, status, optional = false) {
    const el = get(id);
    const raw = el.value.trim().replace(/−/g, "-");
    if (!raw && optional) return null;
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) && Number.isFinite(Number(raw))) return Number(raw);
    el.setAttribute("aria-invalid", "true");
    text(status, optional ? "Enter a signed number or clear that guess. The clock has stayed where it was."
      : "Enter a number in the answer field, such as −2 or 1.5.");
    el.focus();
    return NaN;
  }

  all('input[type="text"]').forEach(el => el.addEventListener("input", () => el.removeAttribute("aria-invalid")));

  function settings(ids, status) {
    const bad = ids.map(get).find(el => !Number.isFinite(el.valueAsNumber) || !el.validity.valid);
    if (bad) {
      bad.setAttribute("aria-invalid", "true");
      if (status) text(status, "Enter values within the displayed limits. Results still use the last accepted settings.");
      bad.reportValidity();
      return null;
    }
    ids.forEach(id => get(id).removeAttribute("aria-invalid"));
    if (status) text(status, "");
    return ids.map(id => get(id).valueAsNumber);
  }

  function stepButton(id, reset, t, end) {
    const button = get(id);
    button.disabled = t >= end;
    if (button.disabled && document.activeElement === button) get(reset).focus();
  }

  // Switch and original cart lab
  const switchSetting = "states-switch-setting";
  const switchGuess = "states-switch-guess";
  const switchFeedback = "states-switch-feedback";
  function renderSwitch() {
    const current = value(switchSetting);
    get("states-switch-display").dataset.state = current;
    text("states-switch-state", current === "on" ? "ON · 1" : "OFF · 0");
  }
  watch([switchSetting], () => {
    clear([switchGuess]);
    renderSwitch();
    text(switchFeedback, "Choose what one toggle will do from this setting.");
  });
  click("states-toggle-switch", () => {
    const answer = value(switchGuess);
    if (!answer) {
      text(switchFeedback, "Choose a prediction before toggling. The switch is unchanged.");
      get(switchGuess).focus();
      return;
    }
    const next = value(switchSetting) === "off" ? "on" : "off";
    get(switchSetting).value = next;
    clear([switchGuess]);
    renderSwitch();
    text(switchFeedback, `${answer === next ? "Your prediction matched." : "Your prediction differed."} One toggle flipped the bit to ${next === "on" ? "1 (on)" : "0 (off)"}.`);
  });

  let cartTime = 0;
  const cartGuesses = ["states-prediction-a", "states-prediction-b"];
  const cartStatus = "states-cart-status";
  function currentCarts() {
    const x0 = number("states-position");
    const v = number("states-velocity");
    const carts = [{ name: "A", x0, v }];
    if (value("states-cart-mode") === "comparison") carts.push({ name: "B", x0, v: -v });
    return carts.map(c => ({ ...c, x: coast(c.x0, c.v, cartTime) }));
  }
  function renderCart() {
    const carts = currentCarts();
    const show = get("states-show-velocity").checked;
    const single = carts.length === 1;
    get("states-velocity-setting").hidden = !show;
    get("states-velocity").disabled = !show;
    get("states-comparison-rule").hidden = single;
    get("states-readout-b").hidden = single;
    get("states-prediction-b-field").hidden = single;
    get(cartGuesses[1]).disabled = single;
    text("states-time", `${cartTime} s`);
    for (const cart of carts) {
      const prefix = `states-${cart.name.toLowerCase()}`;
      text(`${prefix}-initial`, signed(cart.x0));
      text(`${prefix}-position`, signed(cart.x));
      text(`${prefix}-velocity`, show ? signed(cart.v) : "Hidden");
    }
    stepButton("states-advance-cart", "states-reset-cart", cartTime, 3);
    refresh("cart");
  }
  function resetCart(message) {
    cartTime = 0;
    clear(cartGuesses);
    text("states-cart-feedback", "This snapshot shows position. Use the next timed reading to test your prediction.");
    text(cartStatus, message);
    renderCart();
  }
  watch(["states-position", "states-velocity", "states-cart-mode"],
    () => resetCart("Setup changed. The new trial starts at 0 s."));
  watch(["states-show-velocity"], () => {
    renderCart();
    text(cartStatus, `Velocity ${get("states-show-velocity").checked ? "shown" : "hidden"}. Time stays at ${cartTime} s.`);
  });
  click("states-load-comparison", () => {
    get("states-cart-mode").value = "comparison";
    get("states-position").value = "0";
    get("states-velocity").value = "2";
    get("states-show-velocity").checked = false;
    resetCart("Both carts are back at 0 m. Velocity is hidden.");
  });
  click("states-reset-cart", () => resetCart("Returned to 0 s with the current starting settings."));
  click("states-advance-cart", () => {
    if (cartTime >= 3) return;
    const guesses = [];
    for (const id of cartGuesses.slice(0, currentCarts().length)) {
      const entered = guess(id, cartStatus, true);
      if (Number.isNaN(entered)) return;
      guesses.push(entered);
    }
    cartTime += 1;
    const carts = currentCarts();
    clear(cartGuesses);
    renderCart();
    const readings = carts.map(c => `${c.name} is at ${signed(c.x)} m`).join(" and ");
    text(cartStatus, `At ${cartTime} s, ${readings}.${cartTime === 3 ? " Reset to start another trial." : ""}`);
    const feedback = carts.flatMap((c, i) => guesses[i] === null ? [] : [
      `Cart ${c.name}: you predicted ${signed(guesses[i])} m and measured ${signed(c.x)} m. ${same(guesses[i], c.x) ? "Match." : "Try the next trial."}`
    ]);
    text("states-cart-feedback", [...feedback, "Compare the current and initial positions to find the signed displacement."].join(" "));
  });

  const checkout = [
    ["pair", {
      position: "The two opening snapshots have the same position. What else tells you how each cart moves?",
      pair: "Correct. Initial position locates the cart. Signed velocity gives its change in position each second.",
      speed: "Equal speeds can describe carts moving in opposite directions. Include the sign."
    }],
    ["timed-position", {
      "same-time": "Another snapshot at the same instant still gives you one observation time.",
      clock: "The clock tells you the denominator. You also need a second position to find the displacement.",
      "timed-position": "Correct. Divide the position difference by the known, nonzero time interval."
    }],
    ["minus-one", {
      "minus-one": "Correct. The displacement is −3 m. Add it to +2 m to get −1 m.",
      "minus-three": "−3 m is the displacement. Add it to the starting position.",
      "plus-five": "Negative velocity decreases position by 1 m each second. Start at +2 m and apply that change three times."
    }]
  ];
  let question = 0;
  const questions = all("[data-states-question]");
  const nextQuestion = get("states-next-question");
  const checkoutControls = get("states-challenge-controls");
  checkoutControls.addEventListener("click", event => {
    const button = event.target.closest("[data-states-answer]");
    if (!button || !questions[question]?.contains(button)) return;
    const [correct, feedback] = checkout[question];
    const answer = button.dataset.statesAnswer;
    text("states-challenge-feedback", feedback[answer]);
    nextQuestion.hidden = answer !== correct;
    nextQuestion.textContent = question === checkout.length - 1 ? "Finish checkout" : "Next question";
  });
  click("states-next-question", () => {
    if (nextQuestion.hidden) return;
    nextQuestion.hidden = true;
    question += 1;
    if (question === checkout.length) {
      checkoutControls.disabled = true;
      text("states-challenge-progress", "Checkout complete");
      text("states-challenge-feedback", "You chose a sufficient state, identified the missing observation, and predicted a signed position.");
      const bridge = get("states-bridge-title");
      bridge.tabIndex = -1;
      bridge.focus();
      return;
    }
    questions[question - 1].hidden = true;
    questions[question].hidden = false;
    text("states-challenge-progress", `Question ${question + 1} of ${checkout.length}`);
    text("states-challenge-feedback", "Choose an answer to check your reasoning.");
    questions[question].querySelector("h4").focus();
  });

  // Mystery Cart Garage
  const fleet = [
    { name: "A", x0: 0, v: 2 }, { name: "B", x0: 0, v: -2 },
    { name: "C", x0: -2, v: 2 }, { name: "D", x0: 1, v: 0 }
  ];
  let garageObserved = false;
  let garageRevealed = false;
  function renderGarage() {
    fleet.forEach(c => writeCells(row("garage-cart", c.name),
      [signed(c.x0), garageObserved ? signed(coast(c.x0, c.v, 2)) : dash, garageRevealed ? signed(c.v) : "Hidden"]));
    get("garage-reveal").disabled = !garageObserved || garageRevealed;
    refresh("garage");
  }
  click("garage-observe", () => {
    garageObserved = true;
    renderGarage();
    text("garage-status", "Positions at 2 s are recorded. Compare them with the starting positions.");
  });
  click("garage-reveal", () => {
    if (!garageObserved) return;
    garageRevealed = true;
    renderGarage();
    text("garage-status", "Velocities are visible. The two observations have stayed the same.");
    get("garage-reset").focus();
  });
  click("garage-reset", () => {
    garageObserved = garageRevealed = false;
    clear(["garage-velocity"]);
    get("garage-which").value = "A";
    get("garage-pair-first").value = "A";
    get("garage-pair-second").value = "B";
    ["garage-status", "garage-pair-feedback", "garage-velocity-feedback"].forEach(id => text(id, ""));
    renderGarage();
  });
  function observedGarage(status) {
    if (garageObserved) return true;
    text(status, "Take the 2 s reading first. Both times are needed for this check.");
    return false;
  }
  const fleetCart = id => fleet.find(c => c.name === value(id));
  const cartEvidence = c => `${c.name}: ${signed(c.x0)} m at 0 s, ${signed(coast(c.x0, c.v, 2))} m at 2 s`;
  click("garage-check-velocity", () => {
    const status = "garage-velocity-feedback";
    if (!observedGarage(status)) return;
    const answer = guess("garage-velocity", status);
    if (Number.isNaN(answer)) return;
    const c = fleetCart("garage-which");
    text(status, same(answer, c.v)
      ? `Correct. ${cartEvidence(c)}. Dividing the signed displacement by 2 s gives ${signed(c.v)} m/s.`
      : `Try again. ${cartEvidence(c)}. Subtract the first reading from the second and divide by 2 s.`);
  });
  function garagePair(apart) {
    const status = "garage-pair-feedback";
    if (!observedGarage(status)) return;
    const a = fleetCart("garage-pair-first");
    const b = fleetCart("garage-pair-second");
    if (a === b) {
      text(status, "Choose two different carts.");
      return;
    }
    const success = apart ? a.x0 === b.x0 && a.v !== b.v : a.v === b.v && a.x0 !== b.x0;
    const result = apart ? "They start together and separate." : "Their signed displacements match over the same interval, at distinct positions.";
    text(status, `${cartEvidence(a)}. ${cartEvidence(b)}. ${success ? result : "This pair does not meet both conditions. Try another pair."}`);
  }
  click("garage-check-apart", () => garagePair(true));
  click("garage-check-parallel", () => garagePair(false));

  // Rule-Changing Track
  const ruleIds = ["rules-x", "rules-v", "rules-a", "rules-f"];
  let ruleParams = [0, 2, -1, 1];
  let ruleTime = 0;
  const ruleNames = { coast: "zero net force", accel: "constant acceleration", friction: "friction" };
  const ruleKeys = Object.keys(ruleNames);
  const hiddenRules = [0, 2, -1, 1];
  let hiddenRule = pick(ruleKeys);
  let ruleObserved = 0;

  function evaluateRule(rule, [x, v, a, f], t) {
    if (rule === "accel") return acceleration(x, v, a, t);
    if (rule === "coast" || f === 0) return { x: coast(x, v, t), v };
    const direction = Math.sign(v);
    const u = Math.min(t, Math.abs(v) / f);
    return { x: coast(x, v, u) - 0.5 * direction * f * u * u,
      v: direction * Math.max(Math.abs(v) - f * t, 0) };
  }
  const targetTime = () => number("rules-target-time");
  const targetPosition = t => acceleration(ruleParams[0], ruleParams[1], -1, t).x;
  function renderRuleTarget() {
    const t = targetTime();
    text("rules-target-label", `Target at ${t} s · ${signed(targetPosition(t))} m`);
    text("rules-mission-feedback", "");
  }
  function renderRules() {
    text("rules-time", `${ruleTime} s`);
    ruleKeys.forEach(key => {
      const s = evaluateRule(key, ruleParams, ruleTime);
      writeCells(row("rules-row", key), [signed(s.x), signed(s.v)]);
    });
    stepButton("rules-step", "rules-reset", ruleTime, 4);
    refresh("rules");
  }
  get("rules-a").step = "any";
  function setRules() {
    const next = settings(ruleIds);
    if (!next) return false;
    if (next.some((n, i) => n !== ruleParams[i])) {
      ruleParams = next;
      ruleTime = 0;
      renderRuleTarget();
    }
    return true;
  }
  watch(ruleIds, () => { if (setRules()) renderRules(); });
  watch(["rules-target-time"], renderRuleTarget);
  click("rules-step", () => {
    if (!setRules() || ruleTime >= 4) return;
    ruleTime += 1;
    renderRules();
  });
  click("rules-reset", () => {
    if (!setRules()) return;
    ruleTime = 0;
    renderRules();
  });
  click("rules-check-stop", () => {
    if (!setRules()) return;
    const t = targetTime();
    const v = evaluateRule("accel", ruleParams, t).v;
    const success = Math.abs(v) < 0.005;
    text("rules-mission-feedback", success
      ? `At ${t} s, v is zero to the displayed precision. The check allows less than 0.005 m/s from zero. A nonzero acceleration then carries the cart through rest.`
      : `At ${t} s, v = ${signed(v)} m/s. Adjust a so its change in velocity cancels the initial velocity.`);
  });
  click("rules-check-target", () => {
    if (!setRules()) return;
    const t = targetTime();
    const x = evaluateRule("accel", ruleParams, t).x;
    text("rules-mission-feedback", same(x, targetPosition(t))
      ? `Target matched at ${signed(x)} m after ${t} s.`
      : `Cart B reaches ${signed(x)} m. The target is ${signed(targetPosition(t))} m at ${t} s.`);
  });
  function renderRuleCase() {
    writeRows("rules-case-observations", range(0, ruleObserved).map(t => {
      const s = evaluateRule(hiddenRule, hiddenRules, t);
      return [t, signed(s.x), signed(s.v)];
    }), 3);
    stepButton("rules-case-observe", "rules-case-guess", ruleObserved, 3);
  }
  click("rules-case-new", () => {
    hiddenRule = pick(ruleKeys);
    ruleObserved = 0;
    clear(["rules-case-guess"]);
    text("rules-case-feedback", "New concealed case. Take timed readings through 3 s.");
    renderRuleCase();
  });
  click("rules-case-observe", () => {
    if (ruleObserved >= 3) return;
    ruleObserved += 1;
    renderRuleCase();
  });
  click("rules-case-check", () => {
    const status = "rules-case-feedback";
    if (ruleObserved < 3) {
      text(status, "Take readings through 3 s. Friction and the chosen acceleration agree until the stop at 2 s.");
      return;
    }
    const chosen = value("rules-case-guess");
    if (!chosen) {
      text(status, "Choose a rule to check.");
      get("rules-case-guess").focus();
      return;
    }
    const wanted = evaluateRule(chosen, hiddenRules, 3);
    const actual = evaluateRule(hiddenRule, hiddenRules, 3);
    text(status, chosen === hiddenRule
      ? `Correct. With ${ruleNames[chosen]}, the 3 s reading is ${signed(actual.x)} m and ${signed(actual.v)} m/s.`
      : `That rule predicts ${signed(wanted.x)} m and ${signed(wanted.v)} m/s at 3 s. Compare with the last reading.`);
  });

  // Phase-Space Playground
  const phaseIds = ["phase-x", "phase-v", "phase-a"];
  let phaseParams = [1, -2, 0];
  let phaseTime = 0;
  let pinned = null;
  let matching = false;
  const matchPoints = [{ name: "P", x: -1, v: 2 }, { name: "Q", x: 1, v: -2 }, { name: "R", x: -1, v: -2 }];
  const phaseAt = t => ({ t, ...acceleration(...phaseParams, t) });
  function renderPhase() {
    const data = point => point ? [fmt(point.t), signed(point.x), signed(point.v)] : [dash, dash, dash];
    writeCells(row("phase-row", "current"), data(phaseAt(phaseTime)));
    writeCells(row("phase-row", "reference"), data(pinned));
    stepButton("phase-step", "phase-reset", phaseTime, 4);
    get("phase-match-view").setAttribute("aria-pressed", String(matching));
    text("phase-match-view", matching ? "Return to exploration graph" : "Show matching choices on graph");
    refresh("phase");
  }
  function setPhase() {
    const params = settings(phaseIds);
    if (!params) return false;
    if (params.some((n, i) => n !== phaseParams[i])) {
      phaseParams = params;
      phaseTime = 0;
      matching = false;
      text("phase-pair-feedback", "");
    }
    return true;
  }
  watch(phaseIds, () => { if (setPhase()) renderPhase(); });
  click("phase-step", () => {
    if (!setPhase() || phaseTime >= 4) return;
    phaseTime += 1;
    matching = false;
    renderPhase();
  });
  click("phase-reset", () => {
    if (!setPhase()) return;
    phaseTime = 0;
    matching = false;
    renderPhase();
  });
  click("phase-pin", () => {
    if (!setPhase()) return;
    pinned = phaseAt(phaseTime);
    matching = false;
    renderPhase();
    text("phase-pair-feedback", `Saved state: (${signed(pinned.x)} m, ${signed(pinned.v)} m/s).`);
  });
  function phasePair(opposite) {
    const status = "phase-pair-feedback";
    if (!pinned) {
      text(status, "Save a state first, then change your setup or advance the cart to compare.");
      return;
    }
    if (!setPhase()) return;
    const now = phaseAt(phaseTime);
    const passes = opposite ? same(pinned.x, now.x) && same(pinned.v, -now.v) && !same(now.v, 0)
      : !same(pinned.x, now.x) && same(pinned.v, now.v);
    const pair = `Saved (${signed(pinned.x)} m, ${signed(pinned.v)} m/s). Current (${signed(now.x)} m, ${signed(now.v)} m/s).`;
    text(status, `${pair} ${passes ? "Both conditions match." : "Adjust the current state to meet both conditions."}`);
  }
  click("phase-check-opposite", () => phasePair(true));
  click("phase-check-equal", () => phasePair(false));
  click("phase-match-view", () => { matching = !matching; renderPhase(); });
  click("phase-match-check", () => {
    const answer = value("phase-match-guess");
    const feedback = {
      P: "The position is right. The cart went left, so the signed velocity is negative.",
      Q: "The velocity is right. The requested point is the later position at 1 s.",
      R: "Correct. At 1 s the position is −1 m. The change from +1 m in 1 s gives −2 m/s."
    };
    text("phase-match-feedback", feedback[answer] ?? "Choose P, Q, or R.");
    if (!answer) get("phase-match-guess").focus();
  });

  // Pendulum State Lab. Model units are radians and seconds.
  const pendulumIds = ["pendulum-angle", "pendulum-a", "pendulum-b"];
  const rad = Math.PI / 180;
  const gravity = theta => -9.81 * Math.sin(theta);
  const pendulumStep = 1 / 240;
  let release = [20, 30, -30];
  let pendulumTicks = 0;
  let bobs;
  function startBobs() {
    const theta = release[0] * rad;
    pendulumTicks = 0;
    bobs = release.slice(1).map((speed, i) => ({
      name: i ? "B" : "A", theta, omega: speed * rad, side: Math.sign(theta), crossed: false
    }));
  }
  function integrateBob(bob, h) {
    const { theta, omega } = bob;
    const a1 = gravity(theta);
    const w2 = omega + h * a1 / 2;
    const a2 = gravity(theta + h * omega / 2);
    const w3 = omega + h * a2 / 2;
    const a3 = gravity(theta + h * w2 / 2);
    const w4 = omega + h * a3;
    const a4 = gravity(theta + h * w3);
    bob.theta += h * (omega + 2 * w2 + 2 * w3 + w4) / 6;
    bob.omega += h * (a1 + 2 * a2 + 2 * a3 + a4) / 6;

    const side = Math.abs(bob.theta) < 1e-10 ? 0 : Math.sign(bob.theta);
    if (side && bob.side && side !== bob.side) bob.crossed = true;
    if (side) bob.side = side;
  }
  function renderPendulum() {
    const t = pendulumTicks * pendulumStep;
    text("pendulum-time", `${fmt(t)} s`);
    bobs.forEach(b => writeCells(row("pendulum-bob", b.name),
      [b.theta, b.omega, gravity(b.theta)].map(n => signed(n / rad))));
    stepButton("pendulum-step", "pendulum-reset", pendulumTicks, 960);
    refresh("pendulum");
  }
  function resetPendulum() {
    startBobs();
    clear(["pendulum-guess"]);
    text("pendulum-guess-feedback", "");
    text("pendulum-run-feedback", "");
  }
  function setPendulum() {
    const next = settings(pendulumIds);
    if (!next) return false;
    if (next.some((n, i) => n !== release[i])) {
      release = next;
      resetPendulum();
    }
    return true;
  }
  watch(pendulumIds, () => { if (setPendulum()) renderPendulum(); });
  click("pendulum-step", () => {
    if (!setPendulum() || pendulumTicks >= 960) return;
    for (let i = 0; i < 60; i += 1) bobs.forEach(bob => integrateBob(bob, pendulumStep));
    pendulumTicks += 60;
    renderPendulum();
  });
  click("pendulum-reset", () => {
    if (!setPendulum()) return;
    resetPendulum();
    renderPendulum();
  });
  click("pendulum-opposite-check", () => {
    if (!setPendulum()) return;
    const [angle, a, b] = release;
    text("pendulum-run-feedback", a * b < 0
      ? `Both start at ${signed(angle)}°, with ${signed(a)}°/s and ${signed(b)}°/s. Their initial directions are opposite.`
      : "Choose one positive and one negative angular velocity at the same starting angle.");
  });
  click("pendulum-cross-check", () => {
    if (!setPendulum()) return;
    text("pendulum-run-feedback", bobs[0].crossed
      ? `A crossed from one side of downward vertical to the other after release, by ${fmt(pendulumTicks * pendulumStep)} s.`
      : "No crossing is recorded yet. Step forward or choose a release that moves A through vertical.");
  });
  click("pendulum-guess-check", () => {
    if (!setPendulum()) return;
    const status = "pendulum-guess-feedback";
    const answer = value("pendulum-guess");
    if (!answer) {
      text(status, "Choose an initial direction.");
      get("pendulum-guess").focus();
      return;
    }
    const [angle, initialSpeed] = release;
    const a = gravity(angle * rad) / rad;
    const direction = Math.sign(initialSpeed || a);
    const expected = direction > 0 ? "positive" : direction < 0 ? "negative" : "rest";
    const reason = initialSpeed !== 0 ? `A starts with ${signed(initialSpeed)}°/s, which determines its initial direction.`
      : a !== 0 ? `A starts at zero speed. Its acceleration is ${signed(a)}°/s², so it starts moving toward equilibrium.`
      : "At downward vertical with zero angular velocity the bob remains at rest.";
    text(status, `${answer === expected ? "Correct." : "Try another answer."} ${reason}`);
  });

  // Hidden-State Detective
  const makeSecret = () => ({ x: pick(range(-3, 3)), v: pick(range(-2, 2)) });
  let secret = makeSecret();
  const observations = new Map();
  let detectiveTime = null;
  let futureGuess = null;
  let futureRevealed = false;
  const detectiveAnswers = ["detective-guess-x", "detective-guess-v", "detective-guess-future",
    "detective-short", "detective-long"];
  const secretAt = t => coast(secret.x, secret.v, t);
  const laterTimes = () => [...observations.keys()].filter(t => t > 1).sort((a, b) => a - b);

  function renderDetective() {
    const times = [...observations.keys()].sort((a, b) => a - b);
    writeRows("detective-observations", times.map(t => [t === 1 ? "First" : "Later", t, signed(observations.get(t))]),
      3, "Take a reading to start.");
    get("detective-second").disabled = !observations.has(1);
    get("detective-reveal").disabled = futureGuess === null || futureRevealed;
    get("detective-commit").disabled = futureRevealed;
    get("detective-guess-future").disabled = futureRevealed;
    refresh("detective");
  }
  function resetDetective(message) {
    observations.clear();
    detectiveTime = futureGuess = null;
    futureRevealed = false;
    clear(detectiveAnswers);
    ["detective-state-feedback", "detective-future-feedback", "detective-compare-feedback"].forEach(id => text(id, ""));
    text("detective-status", message);
    renderDetective();
  }
  click("detective-repeat", () => resetDetective("Observations cleared. The secret cart is the same."));
  click("detective-new", () => {
    secret = makeSecret();
    resetDetective("New case drawn. Take the first reading at 1 s.");
  });
  function observe(t) {
    detectiveTime = t;
    observations.set(t, secretAt(t));
    renderDetective();
    text("detective-compare-feedback", "");
    text("detective-status", `At ${t} s the secret cart is at ${signed(observations.get(t))} m.`);
  }
  click("detective-first", () => observe(1));
  click("detective-second", () => {
    if (!observations.has(1)) return;
    observe(1 + number("detective-interval"));
  });

  function infer(time) {
    const x1 = observations.get(1);
    const displacement = observations.get(time) - x1;
    const v = displacement / (time - 1);
    return { x: x1 - v, v, displacement };
  }
  function requireReadings(status, count = 1) {
    const times = laterTimes();
    if (times.length >= count) return times;
    text(status, count === 1 ? "Take the first reading and one later reading for this check."
      : "Take later readings at two different intervals in this case.");
    return null;
  }
  click("detective-check-state", () => {
    const status = "detective-state-feedback";
    const times = requireReadings(status);
    if (!times) return;
    const x = guess("detective-guess-x", status);
    if (Number.isNaN(x)) return;
    const v = guess("detective-guess-v", status);
    if (Number.isNaN(v)) return;
    const t = times[0];
    const result = infer(t);
    text(status, same(x, result.x) && same(v, result.v)
      ? `Both match. Between 1 s and ${t} s the displacement is ${signed(result.displacement)} m. That gives v = ${signed(result.v)} m/s and x₀ = ${signed(result.x)} m.`
      : "At least one value differs. Divide the displacement by the time gap, then subtract v × 1 s from the first position.");
  });
  watch(["detective-guess-future"], () => {
    futureGuess = null;
    renderDetective();
    text("detective-future-feedback", "Lock in the edited prediction before revealing.");
  }, "input");
  click("detective-commit", () => {
    const status = "detective-future-feedback";
    if (futureRevealed || !requireReadings(status)) return;
    const answer = guess("detective-guess-future", status);
    if (Number.isNaN(answer)) return;
    futureGuess = answer;
    renderDetective();
    text(status, `Prediction locked: ${signed(answer)} m at 5 s. Reveal when ready.`);
  });
  click("detective-reveal", () => {
    if (futureGuess === null || futureRevealed) return;
    futureRevealed = true;
    const result = secretAt(5);
    text("detective-future-feedback", `${same(result, futureGuess) ? "Prediction matched." : "Prediction differed."} The secret was x₀ = ${signed(secret.x)} m, v = ${signed(secret.v)} m/s. At 5 s, x = ${signed(result)} m.`);
    renderDetective();
    get("detective-repeat").focus({ preventScroll: true });
  });
  click("detective-compare", () => {
    const status = "detective-compare-feedback";
    const times = requireReadings(status, 2);
    if (!times) return;
    const shorter = guess("detective-short", status);
    if (Number.isNaN(shorter)) return;
    const longer = guess("detective-long", status);
    if (Number.isNaN(longer)) return;
    const first = times[0], last = times[times.length - 1];
    const a = infer(first), b = infer(last);
    text(status, `${same(shorter, a.v) && same(longer, b.v) ? "Both estimates match." : "Check the signed ratios again."} Shortest: ${signed(a.displacement)} m over ${first - 1} s. Longest: ${signed(b.displacement)} m over ${last - 1} s. Both give ${signed(a.v)} m/s with exact readings.`);
  });

  // Classical Uncertainty Machine
  const boundsIds = ["ensemble-x-min", "ensemble-x-max", "ensemble-v-min", "ensemble-v-max"];
  let bounds = [-1, 1, -2, 1];
  let ensembleComparison = false;
  const previewTime = () => number("ensemble-time");
  const limits = ([xmin, xmax, vmin, vmax], t) => [coast(xmin, vmin, t), coast(xmax, vmax, t)];
  const width = ([lo, hi]) => hi - lo;
  const interval = endpoints => `[${endpoints.map(signed).join(", ")}]`;
  const middle = (a, b) => (a + b) / 2;
  const midstate = () => [middle(bounds[0], bounds[1]), middle(bounds[2], bounds[3])];
  const alternatives = { precise: [0, 0, -1, 1], spread: [-2, 2, 0, 0] };
  function readBounds() {
    const status = "ensemble-input-feedback";
    const next = settings(boundsIds, status);
    if (!next) return false;
    const reversed = next[0] > next[1] ? 0 : next[2] > next[3] ? 2 : -1;
    if (reversed !== -1) {
      boundsIds.slice(reversed, reversed + 2).forEach(id => get(id).setAttribute("aria-invalid", "true"));
      text(status, "Minimum must be at most maximum. The display uses the last valid ranges.");
      return false;
    }
    bounds = next;
    return true;
  }
  function renderEnsemble() {
    const t = previewTime();
    writeCells(row("ensemble-row", "initial"), [...limits(bounds, 0).map(signed), fmt(width(limits(bounds, 0)))]);
    const now = limits(bounds, t);
    writeCells(row("ensemble-row", "current"), [`At ${fmt(t)} s`, ...now.map(signed), fmt(width(now))], 0);
    const [x, v] = midstate();
    text("ensemble-time-label", `${fmt(t)} s`);
    text("ensemble-individual", `Highlighted cart · x₀ = ${signed(x)} m, v₀ = ${signed(v)} m/s, x(${fmt(t)} s) = ${signed(coast(x, v, t))} m.`);
    get("ensemble-compare-table").hidden = !ensembleComparison;
    refresh("ensemble");
  }
  watch(boundsIds, () => {
    const valid = readBounds();
    text("ensemble-width-feedback", "");
    text("ensemble-target-feedback", "");
    if (valid) renderEnsemble();
  });
  watch(["ensemble-time"], () => {
    ensembleComparison = false;
    clear(["ensemble-compare-guess"]);
    text("ensemble-compare-feedback", "");
    renderEnsemble();
  }, "input");
  watch(["ensemble-target-time"], () => {
    text("ensemble-target-feedback", "");
    refresh("ensemble");
  });
  watch(["ensemble-width-time"], () => text("ensemble-width-feedback", ""));
  click("ensemble-check-target", () => {
    if (!readBounds()) return;
    const t = number("ensemble-target-time");
    const span = limits(bounds, t);
    const fits = span[0] >= -1 && span[1] <= 1;
    text("ensemble-target-feedback", `At ${t} s the full interval is ${interval(span)} m. ${fits
      ? "Both bounds fit inside the target, including its endpoints."
      : "At least one bound is outside the target. Tighten the ranges and check again."}`);
    renderEnsemble();
  });
  click("ensemble-check-compare", () => {
    const status = "ensemble-compare-feedback";
    const answer = value("ensemble-compare-guess");
    if (!answer) {
      text(status, "Choose which scenario has the wider interval.");
      get("ensemble-compare-guess").focus();
      return;
    }
    const t = previewTime();
    const precise = limits(alternatives.precise, t);
    const spread = limits(alternatives.spread, t);
    const p = width(precise), s = width(spread);
    const expected = p === s ? "equal" : p > s ? "precise" : "spread";
    Object.entries({ precise, spread }).forEach(([key, span]) =>
      writeCells(row("ensemble-compare", key), [interval(span), fmt(width(span))]));
    text("ensemble-compare-caption", `Intervals at ${fmt(t)} s`);
    ensembleComparison = true;
    text(status, `${answer === expected ? "Correct." : "Compare the widths below."} P starts at one position and grows by 2 m each second. S holds its 4 m width because all its initial velocities are equal.`);
    renderEnsemble();
  });
  click("ensemble-check-width", () => {
    if (!readBounds()) return;
    const status = "ensemble-width-feedback";
    const answer = guess("ensemble-width-guess", status);
    if (Number.isNaN(answer)) return;
    const t = number("ensemble-width-time");
    const dx = bounds[1] - bounds[0], dv = bounds[3] - bounds[2];
    const result = dx + dv * t;
    text(status, `${same(answer, result) ? "Correct." : "Check how much spread the velocity range adds."} ${fmt(dx)} m + ${t} s × ${fmt(dv)} m/s = ${fmt(result)} m at ${t} s.`);
    renderEnsemble();
  });

  // A shared drawing model drives both WebGL and the 2D fallback.
  const W = 640, H = 308;
  function drawing(caption) {
    const marks = [];
    return {
      caption, marks,
      line(points, tint = grid, dashed = false) { marks.push({ kind: "line", points, tint, dashed }); },
      label(x, y, label, tint = ink) { marks.push({ kind: "label", x, y, label, tint }); },
      mark(kind, x, y, tint) { marks.push({ kind, x, y, tint }); }
    };
  }
  function tracks(d, carts, radius = 10, area = [42, 598, 20, 276]) {
    const [left, right, top, bottom] = area;
    const pixel = x => left + (right - left) * (x / radius + 1) / 2;
    d.line([[pixel(0), top], [pixel(0), bottom - 12]], muted, true);
    const lanes = Math.max(carts.length, 1);
    carts.forEach((c, i) => {
      const y = top + (bottom - top - 24) * (i + 0.5) / lanes;
      d.line([[left, y + 11], [right, y + 11]]);
      d.mark("cart", pixel(c.x), y, coat[i % coat.length]);
      d.label(pixel(c.x), y - 23, c.name);
    });
    d.line([[left, bottom - 10], [right, bottom - 10], [right - 6, bottom - 15]]);
    [-radius, -radius / 2, 0, radius / 2, radius].forEach(tick => {
      const x = pixel(tick);
      d.line([[x, bottom - 14], [x, bottom - 6]]);
      d.label(x, bottom + 7, signed(tick), muted);
    });
    d.label(right, bottom + 24, "x (m) →", muted);
  }

  function phaseDiagram() {
    const now = phaseAt(phaseTime);
    const trace = range(0, 24).map(i => phaseAt(phaseTime * i / 24));
    const points = matching ? matchPoints : [
      { ...now, name: "Current" }, ...(pinned ? [{ ...pinned, name: "Saved" }] : [])
    ];
    const xy = matching ? points : [...points, ...trace];
    const extent = (key, min) => Math.max(min, Math.ceil(Math.max(...xy.map(p => Math.abs(p[key]))) / 2) * 2);
    const rx = extent("x", 4), rv = extent("v", 4);
    const d = drawing(matching
      ? "Matching view. The track shows the test cart at 1 s. P, Q, and R are possible graph points."
      : `At ${phaseTime} s, the track and graph show the same cart. The dashed trace connects its state points from 0 s.`);
    tracks(d, [matching ? { name: "Test", x: -1 } : { name: "Cart", x: now.x }], rx, [38, 225, 52, 226]);
    const X = x => 432 + 151 * x / rx;
    const Y = v => 144 - 100 * v / rv;
    d.line([[X(-rx), Y(0)], [X(rx), Y(0)]]);
    d.line([[X(0), Y(-rv)], [X(0), Y(rv)]]);
    d.label(X(rx), 275, "x (m)", muted);
    d.label(X(0), 18, "v (m/s)", muted);
    d.label(X(-rx), 268, signed(-rx), muted);
    d.label(X(rx), 254, signed(rx), muted);
    d.label(258, Y(rv), signed(rv), muted);
    d.label(258, Y(-rv), signed(-rv), muted);
    if (!matching && phaseTime) d.line(trace.map(p => [X(p.x), Y(p.v)]), coat[0], true);
    points.forEach((p, i) => {
      d.mark("point", X(p.x), Y(p.v), coat[i]);
      const overlap = !matching && i === 1 && same(now.x, p.x) && same(now.v, p.v);
      d.label(X(p.x), Y(p.v) + (overlap ? 22 : -20), p.name);
    });
    return d;
  }

  function pendulumDiagram() {
    const d = drawing(`Both bobs at ${fmt(pendulumTicks * pendulumStep)} s. Dashed lines mark downward vertical.`);
    bobs.forEach((b, i) => {
      const x = 156 + 328 * i, y = 66, rod = 145;
      const bx = x + rod * Math.sin(b.theta), by = y + rod * Math.cos(b.theta);
      d.line([[x, y], [x, y + rod]], muted, true);
      d.line([[x, y], [bx, by]], ink);
      d.mark("bob", bx, by, coat[i]);
      d.label(bx, by + 24, b.name);
    });
    return d;
  }

  function ensembleDiagram() {
    const t = previewTime();
    const d = drawing("The grid traces possible carts. The highlighted midpoint cart follows one trajectory. The two outer lines bound every allowed position.");
    const X = time => 63 + 127 * time;
    const Y = x => 145 - 5 * x;
    d.line([[X(0), Y(-20)], [X(0), Y(20)]]);
    d.line([[X(0), Y(0)], [X(4), Y(0)]]);
    d.line([[X(t), Y(-20)], [X(t), Y(20)]], muted, true);
    range(0, 4).forEach(s => d.label(X(s), 264, String(s), muted));
    [-20, -10, 0, 10, 20].forEach(x => d.label(33, Y(x), signed(x), muted));
    d.label(596, 264, "t (s)", muted);
    d.label(51, 19, "x (m)", muted);
    const [x0, x1, v0, v1] = bounds;
    const [x, v] = midstate();
    const states = [x0, x, x1].flatMap(a => [v0, v, v1].map(b => [a, b]));
    states.forEach(([a, b]) => d.line([[X(0), Y(a)], [X(4), Y(coast(a, b, 4))]]));
    d.line([[X(0), Y(x0)], [X(4), Y(coast(x0, v0, 4))]], coat[0]);
    d.line([[X(0), Y(x1)], [X(4), Y(coast(x1, v1, 4))]], coat[0]);
    d.line([[X(0), Y(x)], [X(4), Y(coast(x, v, 4))]], coat[2]);
    d.mark("cart", X(t), Y(coast(x, v, t)), coat[2]);
    const target = number("ensemble-target-time");
    d.line([[X(target), Y(-1)], [X(target), Y(1)]], ink);
    d.label(X(target), 288, "Target ±1 m", muted);
    return d;
  }

  const plans = {
    cart() {
      const d = drawing("Position in metres. Separate tracks share the dashed origin. Positive is to the right.");
      tracks(d, currentCarts());
      return d;
    },
    garage() {
      const t = garageObserved ? 2 : 0;
      const d = drawing(`Fleet snapshot at ${t} s. Each cart occupies its own track.`);
      tracks(d, fleet.map(c => ({ name: c.name, x: coast(c.x0, c.v, t) })));
      return d;
    },
    rules() {
      const d = drawing(`Comparison tracks at ${ruleTime} s. The concealed case uses the separate observation table.`);
      const carts = ruleKeys.map((key, i) => ({ name: "ABC"[i], ...evaluateRule(key, ruleParams, ruleTime) }));
      const radius = Math.max(10, Math.ceil(Math.max(...carts.map(c => Math.abs(c.x))) / 10) * 10);
      tracks(d, carts, radius);
      return d;
    },
    phase: phaseDiagram,
    pendulum: pendulumDiagram,
    detective() {
      const t = detectiveTime;
      const d = drawing(t === null ? "No position has been recorded. Take an observation to locate the cart."
        : `Observed position at ${t} s. The scale shows position in metres.`);
      tracks(d, t === null ? [] : [{ name: "?", x: observations.get(t) }], 12);
      return d;
    },
    ensemble: ensembleDiagram
  };

  const lab = get("states-lab");
  const gl = get("states-webgl");
  const flat = get("states-flat");
  const starter = get("states-static-view");
  const viewport = gl.parentElement;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motion.matches || get("states-reduce-effects").checked;
  const ratio = () => Math.min(window.devicePixelRatio || 1, reduced() ? 1 : 1.5);
  let selected = "garage", plan, frame = 0, gpu = null;
  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  }
  function refresh(name) {
    if (name !== "cart" && (!lab.open || name !== selected)) return;
    const slot = row("states-scene-slot", name);
    if (scene.parentElement !== slot) slot.append(scene);
    plan = plans[name]();
    text("states-scene-caption", plan.caption);
    schedule();
  }
  all("[data-states-station]").forEach(button => button.addEventListener("click", () => {
    selected = button.dataset.statesStation;
    all("[data-states-panel]").forEach(panel => { panel.hidden = panel.dataset.statesPanel !== selected; });
    all("[data-states-station]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    refresh(selected);
    row("states-panel", selected).querySelector("h3").focus();
  }));
  lab.addEventListener("toggle", () => refresh(lab.open ? selected : "cart"));
  root.querySelector('a[href="#states-cart"]').addEventListener("click", () => refresh("cart"));

  function paint() {
    frame = 0;
    if (!plan || document.hidden) return;
    const { width: w, height: h } = viewport.getBoundingClientRect();
    if (!w || !h) return;
    const scale = Math.min(w / W, h / H);
    if (gpu) {
      try {
        gpu.paint(plan, w, h, scale);
        return;
      } catch {
        fallback("The 3D view stopped.");
      }
    }
    paintFlat(plan, w, h, scale);
  }

  function paintFlat(data, w, h, scale) {
    const ctx = flat.getContext("2d");
    if (!ctx) return;
    const dpr = ratio();
    flat.width = Math.round(w * dpr);
    flat.height = Math.round(h * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale,
      (w - scale * W) * dpr / 2, (h - scale * H) * dpr / 2);
    starter.hidden = true;
    flat.hidden = false;
    for (const m of data.marks) {
      ctx.fillStyle = ctx.strokeStyle = m.tint;
      if (m.kind === "line") {
        ctx.setLineDash(m.dashed ? [6, 5] : []);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        m.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.stroke();
      } else if (m.kind === "label") {
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.label, m.x, m.y);
      } else if (m.kind === "cart") {
        ctx.fillRect(m.x - 13, m.y - 8, 26, 16);
      } else {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.kind === "bob" ? 13 : 5, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  function makeGPU(T) {
    const renderer = new T.WebGLRenderer({ canvas: gl, alpha: true, antialias: !reduced() });
    const world = new T.Scene();
    const camera = new T.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 800);
    camera.position.z = 400;
    world.add(new T.HemisphereLight(0xeafff2, 0x314153, 2));
    const key = new T.DirectionalLight(0xffffff, 2);
    key.position.set(-120, 130, 180);
    world.add(key);
    const group = new T.Group();
    world.add(group);
    let previous, size = "";
    const X = x => x - W / 2;
    const Y = y => H / 2 - y;
    function place(object, x, y, z) {
      object.position.set(X(x), Y(y), z);
      group.add(object);
    }
    function mesh(shape, tint, x, y, z) {
      place(new T.Mesh(shape, new T.MeshStandardMaterial({ color: tint, roughness: 0.5 })), x, y, z);
    }
    function disposeMarks() {
      for (const object of [...group.children]) {
        if (!object.isSprite) object.geometry.dispose();
        object.material.map?.dispose();
        object.material.dispose();
        group.remove(object);
      }
    }
    function build(data) {
      disposeMarks();
      for (const m of data.marks) {
        if (m.kind === "line") {
          const geometry = new T.BufferGeometry().setFromPoints(m.points.map(([x, y]) => new T.Vector3(X(x), Y(y), 0)));
          const material = m.dashed ? new T.LineDashedMaterial({ color: m.tint, dashSize: 6, gapSize: 5 })
            : new T.LineBasicMaterial({ color: m.tint });
          const line = new T.Line(geometry, material);
          if (m.dashed) line.computeLineDistances();
          group.add(line);
        } else if (m.kind === "label") {
          const label = document.createElement("canvas");
          const ctx = label.getContext("2d");
          if (!ctx) continue;
          label.width = 256;
          label.height = 64;
          ctx.font = "bold 36px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = m.tint;
          ctx.fillText(m.label, 128, 32, 250);
          const map = new T.CanvasTexture(label);
          map.colorSpace = T.SRGBColorSpace;
          const sprite = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false, toneMapped: false }));
          sprite.scale.set(128, 32, 1);
          place(sprite, m.x, m.y, 22);
        } else if (m.kind === "cart") {
          mesh(new T.BoxGeometry(27, 15, 15), m.tint, m.x, m.y, 9);
          mesh(new T.BoxGeometry(14, 4, 12), "#c9e4db", m.x, m.y - 8, 9);
          for (const dx of [-8, 8]) mesh(new T.SphereGeometry(4, 12, 8), "#203438", m.x + dx, m.y + 7, 12);
        } else {
          mesh(new T.SphereGeometry(m.kind === "bob" ? 13 : 6, 16, 12), m.tint, m.x, m.y, 9);
        }
      }
    }
    return {
      paint(data, w, h, scale) {
        const dpr = ratio();
        const nextSize = `${w}×${h}@${dpr}`;
        if (size !== nextSize) {
          size = nextSize;
          renderer.setPixelRatio(dpr);
          renderer.setSize(w, h, false);
          camera.right = w / scale / 2;
          camera.left = -camera.right;
          camera.top = h / scale / 2;
          camera.bottom = -camera.top;
          camera.updateProjectionMatrix();
        }
        if (data !== previous) {
          build(data);
          previous = data;
        }
        renderer.render(world, camera);
      },
      dispose() { disposeMarks(); renderer.dispose(); }
    };
  }

  function fallback(reason) {
    const old = gpu;
    gpu = null;
    try { old?.dispose(); } catch { /* A lost context may already be invalid. */ }
    gl.hidden = true;
    const available = Boolean(flat.getContext("2d"));
    viewport.hidden = !available;
    flat.hidden = !available;
    starter.hidden = true;
    text("states-render-status", `${reason} ${available ? "Using the 2D view." : "Use the numerical readouts."} The controls remain available.`);
    schedule();
  }
  gl.addEventListener("webglcontextlost", () => fallback("The WebGL context was lost."));
  watch(["states-reduce-effects"], schedule);
  if (motion.addEventListener) motion.addEventListener("change", schedule);
  else motion.addListener?.(schedule);
  window.addEventListener("resize", schedule);
  if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(viewport);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedule();
  });

  startBobs();
  for (const id of ["states-switch-controls", "states-cart-controls", "states-challenge-controls"]) get(id).disabled = false;
  all("[data-states-enable]").forEach(el => { el.disabled = false; });
  renderSwitch();
  renderCart();
  renderGarage();
  renderRules();
  renderRuleTarget();
  renderRuleCase();
  renderPhase();
  renderPendulum();
  renderDetective();
  renderEnsemble();
  text(cartStatus, "Ready at 0 s. Enter a prediction or advance one second.");
  text("states-challenge-feedback", "Choose an answer. You can retry after reading the feedback.");
  if (lab.open) refresh(selected);

  text("states-render-status", "Loading the 3D view…");
  import("../vendor/three.module.js").then(T => {
    try {
      gpu = makeGPU(T);
      gl.hidden = false;
      flat.hidden = true;
      starter.hidden = true;
      text("states-render-status", "");
      schedule();
    } catch {
      fallback("WebGL is unavailable.");
    }
  }, () => fallback("The local Three.js module could not load."));
})();