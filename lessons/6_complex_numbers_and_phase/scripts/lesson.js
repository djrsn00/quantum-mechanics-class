const lesson = document.querySelector(".site-main.phase-lesson");
if (lesson) initialize(lesson);

function initialize(root) {
  const find = (selector, host = root) => host.querySelector(selector);
  const all = (selector, host = root) => [...host.querySelectorAll(selector)];
  const id = key => find("#" + key);
  const phase = key => id("phase-" + key);
  const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  const attrs = (el, data) => Object.entries(data).forEach(([key, value]) => el.setAttribute(key, value));
  const on = (el, type, fn) => el.addEventListener(type, fn);
  const origin = [0, 0], opening = [3, 4];
  const colors = { a: "#65b7ff", b: "#ff9f55", c: "#78f8a6", d: "#c19bff", gold: "#ffe16a",
    axis: "#729783", grid: "#224334", ink: "#ecfff1", red: "#ff676f" };
  const symbols = ["1", "i", "−1", "−i"], symbolIDs = ["one", "i", "minus-one", "minus-i"];
  const turns = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const rad = a => a * Math.PI / 180;
  const magnitude = z => Math.hypot(...z);
  const sq = ([a, b]) => a * a + b * b;
  const add = ([a, b], [c, d]) => [a + c, b + d];
  const scale = (z, f) => z.map(v => v * f);
  const conj = ([a, b]) => [a, -b];
  const normalize = angle => {
    const a = angle % 360;
    return a <= -180 ? a + 360 : a > 180 ? a - 360 : a || 0;
  };
  const argument = ([a, b]) => a || b ? normalize(Math.atan2(b, a) * 180 / Math.PI) : null;

  function polar(r, angle) {
    if (!r) return origin;
    const a = normalize(angle);
    if (a % 90 === 0) return scale(turns[(a / 90 + 4) % 4], r);
    return [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
  }

  const close = (a, b, tolerance = 0.002) => Math.abs(a - b) <= tolerance;
  const near = (z, w, tolerance = 0.002) => magnitude(add(z, scale(w, -1))) <= tolerance;
  const sameAngle = (a, b, tolerance = 0.1) => a !== null && b !== null && Math.abs(normalize(a - b)) <= tolerance;

  function str(v, n = 4) {
    if (v === 0) return "0";
    const abs = Math.abs(v);
    const value = abs < 10 ** -n || abs >= 1e7 ? v.toExponential(n - 1) : String(Number(v.toFixed(n)));
    return value.replaceAll("-", "−");
  }

  const pointText = ([a, b]) => `(${str(a)}, ${str(b)})`;

  function complex([a, b]) {
    if (!b) return str(a);
    const imaginary = Math.abs(b) === 1 ? "i" : str(Math.abs(b)) + "i";
    return a ? `${str(a)} ${b < 0 ? "−" : "+"} ${imaginary}` : (b < 0 ? "−" : "") + imaginary;
  }

  const term = x => x < 0 ? `(${str(x)})` : str(x);
  const exact = { 0: "0", 30: "π/6", 45: "π/4", 60: "π/3", 90: "π/2", 120: "2π/3",
    135: "3π/4", 180: "π", 225: "5π/4", 240: "4π/3", 270: "3π/2", 315: "7π/4",
    360: "2π", "-90": "−π/2" };
  const radiansText = a => exact[a] ?? "≈" + str(rad(a));
  const angleText = a => a === null ? "undefined" : str(a, 2) + "°";
  const describe = z => `${complex(z)} · magnitude ${str(magnitude(z))} · argument ${angleText(argument(z))}`;
  const cleanup = (value, first, second) =>
    Math.sign(first) !== Math.sign(second) && Math.abs(value) <= (Math.abs(first) + Math.abs(second)) * Number.EPSILON * 8 ? 0 : value;

  function multiply([a, b], [c, d]) {
    return [cleanup(a * c - b * d, a * c, -b * d), cleanup(a * d + b * c, a * d, b * c)];
  }

  const svg = (name, data = {}) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    attrs(node, data);
    return node;
  };
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motion.matches || phase("reduced").checked;

  // Original phasor lab.
  const lab = phase("lab"), canvas = phase("canvas"), mainViewport = phase("viewport");
  const mainSvg = phase("plane"), layer = phase("scene-labels");
  const maxRadius = Number(lab.dataset.maxRadius), margin = maxRadius * Number.EPSILON * 8;
  const mainForms = { rectangular: phase("rect-form"), polar: phase("polar-form") };
  const modeInput = phase("mode");
  const inputs = ["a", "b", "r", "theta"].map(k => phase("input-" + k));
  const [inputA, inputB, inputR, inputTheta] = inputs;
  const busyFields = ["mode-controls", "rect-controls", "polar-controls", "prediction-controls", "euler-controls"].map(phase);
  const busyButtons = all("button", phase("action-controls"));
  const presets = { opening, "lower-left": [-3, -4], "negative-real": [-5, 0], zero: origin };
  let z = opening, chosen = 0, mode = "rectangular", prediction = null, animation = null;
  let mainGeometry;
  const out = (name, value) => text(phase(name), value);
  const say = value => out("lab-feedback", value);
  const predictionStatus = value => out("prediction-feedback", value);
  const startMessage = "Save your prediction, then run the opening turn.";
  const eulerPrompt = "The presets use radius 1 and open the polar controls.";

  function plotMain(point, preview = false) {
    const [a, b] = point, r = magnitude(point), theta = argument(point);
    const X0 = Number(lab.dataset.originX), Y0 = Number(lab.dataset.originY);
    const unit = Number(lab.dataset.unitPx), X = x => X0 + x * unit, Y = y => Y0 - y * unit;
    const x = X(a), y = Y(b);
    const set = (key, values) => attrs(phase(key), values);
    const show = (key, visible) => phase(key).toggleAttribute("hidden", !visible);
    set("triangle", { d: `M${X0} ${Y0}H${x}V${y}Z` });
    show("triangle", Boolean(a && b));
    set("real-line", { x1: X0, y1: Y0, x2: x, y2: Y0 });
    set("imag-line", { x1: x, y1: Y0, x2: x, y2: y });
    set("imag-guide", { x1: X0, y1: y, x2: x, y2: y });
    show("real-line", Boolean(a));
    show("imag-line", Boolean(b));
    show("imag-guide", Boolean(a && b));
    const corner = Math.min(10, Math.abs(a * unit) / 2, Math.abs(b * unit) / 2);
    const dx = -Math.sign(a) * corner, dy = -Math.sign(b) * corner;
    set("right-angle", { d: `M${x + dx} ${Y0}v${dy}h${-dx}` });
    show("right-angle", corner >= 1);
    const arcRadius = Math.min(Number(lab.dataset.arcPx), 0.6 * r * unit);
    const arcOn = theta !== null && Boolean(theta) && arcRadius >= 1;
    const [u, v] = polar(arcRadius, theta ?? 0);
    set("angle-arc", { d: `M${X0 + arcRadius} ${Y0}A${arcRadius} ${arcRadius} 0 0 ${theta > 0 ? 0 : 1} ${X0 + u} ${Y0 - v}` });
    show("angle-arc", arcOn);
    set("vector", { x1: X0, y1: Y0, x2: x, y2: y });
    show("vector", r > 0);
    set("dot", { cx: x, cy: y });
    show("dot", r > 0);
    const circleOn = Math.abs(r - 1) <= margin;
    show("unit-circle", circleOn);
    const side = a > 7 ? -1 : 1, lift = b > 7 ? -1 : 1;
    const labels = [
      ["a", X(a / 2), Y0 + 17, Boolean(a), "a", colors.b],
      ["b", x + side * 16, Y(b / 2), Boolean(b), "b", colors.a],
      ["r", X(a * 0.55) - (b / (r || 1)) * 15, Y(b * 0.55) - (a / (r || 1)) * 15, r > 0, "r", colors.c],
      ["theta", X0 + (arcRadius + 14) * Math.cos(rad((theta ?? 0) / 2)),
        Y0 - (arcRadius + 14) * Math.sin(rad((theta ?? 0) / 2)), arcOn, "θ", colors.gold],
      ["point", x + side * 16, y - lift * 14, true, r ? "z" : "z = 0", colors.d]
    ];
    for (const [key, px, py, visible, value] of labels) {
      set("label-" + key, { x: px, y: py + 4 });
      show("label-" + key, visible);
      if (visible) out("label-" + key, value);
    }

    const p = makePlan(420, 420, "Complex plane", "");
    for (let i = -8; i <= 8; i += 1) {
      p.line([[X(i), Y(-8)], [X(i), Y(8)]], i ? colors.grid : colors.axis);
      p.line([[X(-8), Y(i)], [X(8), Y(i)]], i ? colors.grid : colors.axis);
    }
    for (const i of [-8, -4, 4, 8]) {
      p.label(X(i), Y0 + 24, str(i), colors.axis);
      p.label(X0 - 18, Y(i), str(i), colors.axis);
    }
    p.label(X(8), Y0 - 16, "Real", colors.ink);
    p.label(X0, 23, "Imaginary", colors.ink);
    p.label(X0 - 13, Y0 + 18, "0", colors.axis);
    if (a && b) {
      p.poly([[X0, Y0], [x, Y0], [x, y]], colors.a, 0.13);
      p.line([[X0, y], [x, y]], colors.axis, true);
      if (corner >= 1) p.line([[x + dx, Y0], [x + dx, Y0 + dy], [x, Y0 + dy]], colors.axis);
    }
    if (a) p.line([[X0, Y0], [x, Y0]], colors.b, true);
    if (b) p.line([[x, Y0], [x, y]], colors.a, true);
    if (circleOn) p.line(circlePoints(X0, Y0, unit), colors.red, true);
    if (arcOn) p.line(circlePoints(X0, Y0, arcRadius, theta), colors.gold);
    p.arrow([X0, Y0], [x, y], colors.c);
    p.dot([x, y], colors.d, r ? 4.5 : 3);
    for (const [, px, py, visible, value, color] of labels) if (visible) p.label(px, py, value, color);
    mainGeometry = p;

    if (preview) return;
    out("plot-desc", `Endpoint ${pointText(point)}. Magnitude ${str(r)} units. Principal argument ${angleText(theta)}.`);
    out("point", pointText(point));
    out("rectangular", complex(point));
    out("magnitude", str(r) + " units");
    out("argument", theta === null ? "undefined" : `${angleText(theta)}${exact[theta] !== undefined ? " = " : " "}${radiansText(theta)} rad`);
    out("magnitude-work", `r = √(${term(a)}² + ${term(b)}²) ${Number(r.toFixed(4)) === r ? "=" : "≈"} ${str(r)}`);
    out("polar-expression", r ? `z ${exact[theta] !== undefined && r === Number(r.toFixed(4)) ? "=" : "≈"} ${str(r)}[cos(${exact[theta] ?? str(rad(theta))}) + i sin(${exact[theta] ?? str(rad(theta))})]`
      : "z = 0. Every chosen direction gives the origin at radius 0.");
    const unitVector = r ? [a / r, b / r] : null;
    out("unit-expression", r ? `cos θ + i sin θ ${unitVector.every(v => Number(v.toFixed(4)) === v) ? "=" : "≈"} ${complex(unitVector)}`
      : "Unit direction: undefined at z = 0.");
  }

  function syncMain() {
    modeInput.value = mode;
    Object.entries(mainForms).forEach(([key, form]) => { form.hidden = key !== mode; });
    [inputA.value, inputB.value, inputR.value, inputTheta.value] = [...z, magnitude(z), argument(z) ?? chosen].map(v => String(v || 0));
    out("input-theta-label", magnitude(z) ? "Angle θ (degrees)" : "Chosen direction (degrees)");
    inputs.forEach(el => el.removeAttribute("aria-invalid"));
  }

  function setPoint(point, zeroDirection = chosen) {
    z = point.map(v => v || 0);
    chosen = argument(z) ?? normalize(zeroDirection);
    syncMain();
    plotMain(z);
    schedule();
  }

  function decimal(el) {
    const value = el.value.trim().replaceAll("−", "-");
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ? Number(value) : NaN;
  }

  function invalid(el, message) {
    el.setAttribute("aria-invalid", "true");
    say(message);
    el.focus();
  }

  inputs.forEach(el => on(el, "input", () => el.removeAttribute("aria-invalid")));
  on(modeInput, "change", () => {
    if (animation) return;
    mode = modeInput.value;
    syncMain();
    say("The input form changed. The committed point stayed in place.");
  });
  on(mainForms.rectangular, "submit", event => {
    event.preventDefault();
    if (animation) return;
    const a = decimal(inputA), b = decimal(inputB);
    if (!Number.isFinite(a)) return invalid(inputA, "Enter a finite decimal for the real part.");
    if (!Number.isFinite(b)) return invalid(inputB, "Enter a finite decimal for the imaginary part.");
    if (Math.hypot(a, b) > maxRadius + margin) return invalid(inputA, "The point is outside the radius-8 disk. Adjust either component.");
    setPoint([a, b]);
    say(`Plotted ${complex(z)}.`);
  });
  on(mainForms.polar, "submit", event => {
    event.preventDefault();
    if (animation) return;
    const r = decimal(inputR), theta = decimal(inputTheta);
    if (!Number.isFinite(r) || r < 0 || r > maxRadius + margin) return invalid(inputR, "Enter a radius from 0 through 8.");
    if (!Number.isFinite(theta)) return invalid(inputTheta, "Enter a finite angle in degrees.");
    setPoint(polar(r, theta), theta);
    say(r ? `Plotted ${complex(z)}. Equivalent angles differ by a full turn.`
      : `The argument is undefined at zero. Chosen direction for the next outward move: ${angleText(chosen)}.`);
  });

  function busy(value) {
    [...busyFields, ...busyButtons].forEach(el => { el.disabled = value; });
  }

  function finishTurn() {
    if (!animation) return;
    const { before, after, delta, guess, focus } = animation;
    animation = null;
    setPoint(after);
    busy(false);
    out("turn-before", complex(before));
    out("turn-after", complex(after));
    out("turn-delta", delta === 90 ? "+90° · +π/2 rad" : "+360° · +2π rad");
    out("turn-length", `${str(magnitude(before))} → ${str(magnitude(after))} units`);
    say(!magnitude(after) ? "Zero stays at the origin and its argument is undefined."
      : delta === 90 ? `Multiplication by i sends (a,b) to (−b,a). The endpoint is ${complex(after)}.`
      : `A full turn returns to ${complex(after)}. The applied turn in the record is +360°.`);
    if (guess) {
      predictionStatus(`${guess.tip === "minus-4-plus-3i" ? "Your endpoint prediction matched." : "Compare your endpoint with −4 + 3i."} ${guess.length === "same" ? "Your magnitude prediction matched." : "Compare your magnitude prediction with the record."} Both magnitudes are 5 units.`);
    }
    if (focus && !document.hidden && document.activeElement === document.body) focus.focus({ preventScroll: true });
  }

  function turn(delta, guess = null) {
    if (animation) return;
    const before = guess ? opening : z;
    animation = { before, after: delta === 90 ? [-before[1], before[0]] : before, delta,
      guess, focus: document.activeElement, start: null, duration: delta === 90 ? 480 : 840 };
    if (reduced() || document.hidden || !mainVisible || !magnitude(before)) return finishTurn();
    busy(true);
    plotMain(before, true);
    say(`Turning counterclockwise by ${delta}°.`);
    schedule();
  }

  on(phase("action-controls"), "click", event => {
    const button = event.target.closest("button");
    if (!button || animation || event.detail > 1) return;
    const { phasePoint, phaseTurn } = button.dataset;
    if (phasePoint) {
      setPoint(presets[phasePoint]);
      say(describe(z));
    }
    if (phaseTurn) turn(Number(phaseTurn));
  });
  on(phase("reset"), "click", () => {
    if (animation) return;
    mode = "rectangular";
    prediction = null;
    phase("predict-tip").value = "";
    phase("predict-length").value = "";
    ["before", "after", "delta", "length"].forEach(k => out("turn-" + k, "—"));
    setPoint(opening);
    predictionStatus(startMessage);
    out("euler-status", eulerPrompt);
    say("Reset to 3 + 4i in rectangular form.");
  });

  const predictionForm = phase("prediction-form");
  function invalidatePrediction() {
    prediction = null;
    predictionStatus("Save both answers before testing the opening turn.");
  }

  on(predictionForm, "input", invalidatePrediction);
  on(predictionForm, "change", invalidatePrediction);
  on(predictionForm, "submit", event => {
    event.preventDefault();
    if (animation || !predictionForm.reportValidity()) return;
    prediction = { tip: phase("predict-tip").value, length: phase("predict-length").value };
    predictionStatus("Prediction saved. Run the opening turn to check both answers.");
  });
  on(phase("test-opening"), "click", event => {
    if (animation || event.detail > 1) return;
    if (!prediction) {
      predictionStatus("Choose both answers and save your prediction first.");
      if (predictionForm.reportValidity()) find('button[type="submit"]', predictionForm).focus();
      return;
    }
    turn(90, prediction);
  });
  on(phase("euler-controls"), "click", event => {
    const button = event.target.closest("[data-phase-unit-angle]");
    if (!button || animation) return;
    const theta = Number(button.dataset.phaseUnitAngle);
    mode = "polar";
    setPoint(polar(1, theta));
    out("euler-status", `Loaded ${radiansText(theta)} rad at radius 1. Point ${complex(z)}.`);
    say(`The original lab is in polar mode at ${complex(z)}.`);
  });

  const questions = all("[data-phase-question]"), next = phase("next-question");
  const answers = [
    { "90": "90° lands on +i. Start at −90° and add a full turn.", "180": "180° lands on −1. Add 360° to −90°.",
      "270": "Correct. −90° + 360° = 270°. Both describe −i." },
    { "zero-degrees": "A measured angle of 0° describes a nonzero arrow on the positive real axis.",
      "last-angle": "The chosen control angle guides a future move. Zero itself has no direction.",
      undefined: "Correct. The argument is undefined at zero because there is no direction." }
  ];
  let question = 0;
  on(phase("challenge-controls"), "click", event => {
    const answer = event.target.closest("[data-phase-answer]");
    if (!answer || !questions[question]?.contains(answer)) return;
    const value = answer.dataset.phaseAnswer;
    out("challenge-feedback", answers[question][value]);
    next.hidden = value !== ["270", "undefined"][question];
  });
  on(next, "click", () => {
    if (next.hidden) return;
    next.hidden = true;
    if (question === 1) {
      question = 2;
      phase("challenge-controls").disabled = true;
      out("challenge-progress", "Checkout complete");
      out("challenge-feedback", "You identified equivalent angles and explained the argument at zero.");
      phase("bridge-title").focus();
    } else {
      questions[0].hidden = true;
      questions[1].hidden = false;
      question = 1;
      text(next, "Finish checkout");
      out("challenge-progress", "Question 2 of 2");
      out("challenge-feedback", "Choose an answer.");
      find("h4", questions[1]).focus();
    }
  });

  // Arcade controls and session progress.
  const arcade = phase("arcade"), selector = id("cp-station");
  const figure = id("cp-figure-template").content.firstElementChild.cloneNode(true);
  const arcViewport = find("#cp-viewport", figure), arcStatus = find("#cp-render-status", figure);
  const arcGeometry = find("[data-cp-geometry]", figure), arcLabels = find("[data-cp-labels]", figure);
  const cardTemplate = id("cp-mission-template").content;
  const progress = id("cp-progress"), status = id("cp-status");
  const total = all("[data-cp-mission]", arcade).length, completed = new Set();
  const stations = new Map(), incomplete = Symbol("incomplete");
  let arcPlan;

  function station(name, defaults, build) {
    const panel = find(`[data-cp-station="${name}"]`);
    const fields = Object.fromEntries(all("[name]", panel).map(el => [el.name, el]));
    const initialValues = Object.entries(fields).map(([key, el]) => [key, el.value]);
    const cards = new Map(all("[data-cp-mission]", panel).map(el => {
      el.append(cardTemplate.firstElementChild.cloneNode(true));
      return [el.dataset.cpMission.slice(name.length + 1), { el, resolved: false, hints: 0 }];
    }));
    const s = defaults();
    const out = (key, value) => text(find(`[data-cp-read="${key}"]`, panel), value);

    function choose(key) {
      const el = fields[key];
      if (el.value) return el.value;
      el.focus();
      throw incomplete;
    }

    function value(key) {
      const el = fields[key], n = el.valueAsNumber;
      if (Number.isFinite(n) && el.validity.valid) return n || 0;
      el.reportValidity();
      el.focus();
      throw incomplete;
    }

    const readPoint = (prefix = "") => [value(prefix + "a"), value(prefix + "b")];
    const set = (key, v) => { fields[key].value = v; };

    function setPoint(prefix, point) {
      set(prefix + "a", point[0]);
      set(prefix + "b", point[1]);
    }

    function clearAnswer(key) {
      const card = cards.get(key);
      card.resolved = false;
      find("[data-cp-work]", card.el).hidden = true;
      text(find("[data-cp-work-text]", card.el), "");
      text(find("[data-cp-feedback]", card.el), "");
    }

    const pending = (...keys) => keys.some(key => cards.get(key).el.open && !cards.get(key).resolved);
    const { draw, actions = {}, checks, hints, changed, opened } = build(
      { s, fields, out, choose, value, readPoint, set, setPoint, clearAnswer, pending, panel });
    const redraw = () => {
      if (selector.value !== name) return;
      arcPlan = draw();
      drawSvg(arcPlan, arcGeometry, arcLabels);
      if (canvas.parentElement === arcViewport) canvas.hidden = true;
      text(find("#cp-figure-title", figure), arcPlan.title);
      text(find("#cp-diagram-desc", figure), arcPlan.description);
      schedule();
    };

    function examine(key, card) {
      const response = checks[key]();
      const feedback = find("[data-cp-feedback]", card.el);
      text(feedback, response.message);
      if (response.work) {
        card.resolved = true;
        find("[data-cp-work]", card.el).hidden = false;
        text(find("[data-cp-work-text]", card.el), response.work);
      }
      const fullID = card.el.dataset.cpMission;
      if (response.pass && !completed.has(fullID)) {
        completed.add(fullID);
        find("[data-cp-done]", card.el).hidden = false;
        text(progress, `${completed.size} of ${total} missions completed this session.`);
      }
    }

    for (const [key, card] of cards) {
      on(card.el, "toggle", () => {
        if (card.el.open) opened?.(key);
        redraw();
      });
    }
    on(panel, "click", event => {
      const button = event.target.closest("button");
      if (!button || button.disabled || panel.hidden) return;
      const mission = button.closest("[data-cp-mission]");
      const key = mission?.dataset.cpMission.slice(name.length + 1), card = cards.get(key);
      const feedback = card ? find("[data-cp-feedback]", mission) : status;
      if (button.hasAttribute("data-cp-hint")) {
        const list = find("[data-cp-hint-list]", mission), li = document.createElement("li");
        li.textContent = hints[key][card.hints++];
        list.hidden = false;
        list.append(li);
        text(button, card.hints >= hints[key].length ? "All hints shown" : "Show next hint");
        button.disabled = card.hints >= hints[key].length;
        return;
      }
      const action = actions[button.dataset.cpAction];
      if (!button.hasAttribute("data-cp-check") && !action) return;
      try {
        text(feedback, "");
        if (button.hasAttribute("data-cp-check")) examine(key, card);
        else {
          const message = action();
          if (message) text(feedback, message);
        }
        redraw();
      } catch (error) {
        if (error !== incomplete) throw error;
        text(feedback, "Complete the highlighted field with a valid entry.");
      }
    });
    for (const type of ["input", "change"]) on(panel, type, event => {
      if (changed?.(event.target.name, event.type)) redraw();
    });
    stations.set(name, { panel, redraw, reset() {
      Object.assign(s, defaults());
      for (const [key, v] of initialValues) set(key, v);
      for (const [key, card] of cards) {
        clearAnswer(key);
        card.hints = 0;
        const button = find("[data-cp-hint]", card.el), list = find("[data-cp-hint-list]", card.el);
        button.disabled = false;
        text(button, "Show first hint");
        list.replaceChildren();
        list.hidden = true;
        find("[data-cp-work]", card.el).open = false;
      }
      redraw();
    } });
  }

  const waitFor = message => ({ pass: false, message });
  const judge = (pass, work, retry = "Compare with the worked steps and try again.") =>
    ({ pass, message: pass ? "Correct. " + work : retry, work });

  station("treasure", () => ({ z: origin, target: "quadrant", form: "rect", records: {}, latest: null, pin: null }),
    ({ s, fields, out, choose, value, readPoint, set, setPoint, panel }) => {
      const targets = { quadrant: [-3, 2], opening, both: [0, 2] };
      for (const axis of [fields.a, fields.b]) axis.setAttribute("step", "any");

      function map(key) {
        s.target = key;
        set("target", key);
      }

      function plot() {
        const polarInput = s.form === "polar";
        const r = polarInput ? value("r") : 0, theta = polarInput ? value("angle") : 0;
        const point = polarInput ? polar(r, theta) : readPoint();
        if (magnitude(point) > 8 + margin) {
          fields.a.focus();
          return "Choose a marker within 8 units of the origin so both input forms can describe it.";
        }
        s.z = point;
        s.latest = polarInput ? { r, theta, z: s.z } : null;
        if (s.target === "both") s.records[s.form] = s.z;
      }

      return {
        changed(name, type) {
          if (type !== "change") return false;
          if (name === "target") { map(choose("target")); return true; }
          if (name !== "mode") return false;
          s.form = choose("mode");
          setPoint("", s.z);
          set("r", Math.min(8, magnitude(s.z)));
          set("angle", argument(s.z) ?? s.latest?.theta ?? 0);
          return true;
        },
        opened(key) { map({ quadrant: "quadrant", length: "opening", both: "both", equivalent: "angles" }[key]); },
        actions: { plot, pin() {
          if (!s.latest || !s.latest.r || s.form !== "polar") return "Plot a nonzero polar point first.";
          s.pin = s.latest;
        } },
        checks: {
          quadrant() {
            const error = plot();
            if (error) return waitFor(error);
            return judge(near(s.z, targets.quadrant), `The marker is ${pointText(s.z)}. Negative real and positive imaginary coordinates put the target in quadrant II.`);
          },
          length() {
            const guess = value("length");
            const error = plot();
            if (error) return waitFor(error);
            return judge(near(s.z, opening) && close(guess, 5), "For (3, 4), √(3² + 4²) = √25 = 5.",
              `The plotted marker is ${complex(s.z)}. Check both its location and your magnitude entry.`);
          },
          both() {
            const correct = ["rect", "polar"].every(form => s.records[form] && near(s.records[form], targets.both));
            return correct ? judge(true, "Both submissions reach 2i. Rectangular (0, 2) and polar radius 2 at 90° describe the same number.")
              : waitFor("Use Plot marker on the 2i map with each form. Each latest submission must match 2i.");
          },
          equivalent() {
            const a = s.pin, b = s.latest;
            if (!a || !b || !b.r || s.form !== "polar") return waitFor("Save a nonzero polar submission, then plot the alternate angle.");
            const ok = close(a.r, b.r) && Math.abs(a.theta - b.theta) > 0.1 && sameAngle(a.theta, b.theta) && near(a.z, b.z);
            return judge(ok, `The angles ${angleText(a.theta)} and ${angleText(b.theta)} differ by ${str(b.theta - a.theta)}°. Their endpoints are ${pointText(a.z)} and ${pointText(b.z)}.`,
              "Keep the radius and change the entered angle by a whole turn.");
          }
        },
        hints: {
          quadrant: ["Read the signed coordinates in the target.", "Quadrant II lies left of the origin and above the real axis."],
          length: ["Real and imaginary parts give the perpendicular legs.", "Square each leg, add the squares, and take the square root."],
          both: ["Complete one Plot marker action in each form.", "A positive imaginary axis point has no real component and lies a quarter-turn from +Real."],
          equivalent: ["Save one plotted polar point with positive radius.", "Keep the radius and add or subtract 360° from its angle."]
        },
        draw() {
          all("[data-cp-form]", panel).forEach(el => { el.hidden = el.dataset.cpForm !== s.form; });
          const target = targets[s.target], desc = `Marker ${describe(s.z)}.${target ? " Target " + complex(target) + "." : ""}`;
          out("state", desc);
          out("trials", ["rect", "polar"].map(form => `${form === "rect" ? "Rectangular" : "Polar"} submission for 2i: ${s.records[form] ? complex(s.records[form]) : "pending"}`).join(" · "));
          out("saved", s.pin ? `Saved ${describe(s.pin.z)} from entered angle ${angleText(s.pin.theta)}.` : "No polar point saved.");
          return planePlan("Treasure map", desc, [[s.z, "Marker", colors.c], [target, "Target", colors.gold, true], [s.pin?.z, "Saved", colors.d, true]]);
        }
      };
    });

  station("rotate", () => ({ start: opening, z: opening, count: 0, allI: true, log: [], last: null }),
    ({ s, out, choose, readPoint, set, pending }) => {
      const bases = { opening, diagonal: [1, 1], zero: origin };
      const moves = { i: [1, "i", "+90°"], "minus-i": [3, "−i", "−90°"], "minus-one": [2, "−1", "+180°"] };

      function restart(z) {
        Object.assign(s, { start: z, z, count: 0, allI: true, log: [], last: null });
      }

      function move(key) {
        const [k, symbol, angle] = moves[key], before = s.z;
        const after = multiply(before, turns[k]);
        s.z = after;
        s.count += 1;
        s.allI &&= key === "i";
        s.last = { before, after, symbol, angle };
        s.log = [...s.log.slice(-7), symbol];
      }

      const last = () => s.last ? `${complex(s.last.before)} × ${s.last.symbol} → ${complex(s.last.after)} (${s.last.angle}). Magnitude ${str(magnitude(s.last.before))} → ${str(magnitude(s.last.after))}.` : "No turn yet.";
      return {
        actions: {
          restart: () => restart(bases[choose("start")]),
          multiply() {
            const k = choose("by");
            if (k === "minus-i" && pending("clockwise")) return "Commit the clockwise prediction before running that turn.";
            move(k);
          }
        },
        checks: {
          quarter: () => judge(s.count === 1 && s.allI && near(s.start, opening) && near(s.z, [-4, 3]),
            last() + " The map is (a,b) → (−b,a).", "Load 3 + 4i and multiply once by i."),
          four: () => judge(magnitude(s.start) > 0 && s.count === 4 && s.allI && near(s.start, s.z),
            `Four i moves form a full turn and return to ${complex(s.start)}.`, "Use exactly four i moves starting from a nonzero number."),
          clockwise() {
            const guess = readPoint("guess-");
            restart(opening);
            set("start", "opening");
            set("by", "minus-i");
            move("minus-i");
            return judge(near(guess, s.z), last() + " Clockwise maps (a,b) to (b,−a).");
          },
          opposite: () => judge(Boolean(magnitude(s.start)) && near(s.z, scale(s.start, -1)) &&
            close(magnitude(s.z), magnitude(s.start)), `The opposite of ${complex(s.start)} is ${complex(s.z)} at the same magnitude.`,
            "Reach the negative of both starting components.")
        },
        hints: {
          quarter: ["A counterclockwise right angle uses i.", "The old imaginary coordinate changes sign when it becomes the real part."],
          four: ["Restart to clear previous moves.", "Use one multiplier throughout. Four quarter-turns make a full turn."],
          clockwise: ["A negative quarter-turn sends +Real toward −Imaginary.", "The old imaginary component becomes the real component."],
          opposite: ["Look for a half-turn.", "The new coordinates are the negatives of the starting coordinates."]
        },
        draw() {
          const mask = pending("clockwise");
          const desc = mask ? "Clockwise test starts at 3 + 4i. Submit your prediction to reveal the turn."
            : `Started at ${complex(s.start)}. Now ${describe(s.z)}. ${last()}`;
          out("state", desc);
          out("history", !mask && s.count ? `${s.count} moves · recent multipliers ${s.log.join(", ")}` : mask ? "Move log concealed during prediction." : "No moves recorded.");
          return planePlan("Rotation arcade", desc, [[mask ? opening : s.z, mask ? "Start" : "Current", colors.c],
            [mask ? null : s.start, "Start", colors.d, true]]);
        }
      };
    });

  station("workshop", () => ({ z: [2, 3], w: [1, -2], op: "add", show: false }),
    ({ s, out, readPoint, choose, clearAnswer, pending }) => {
      const sign = () => s.op === "add" ? "+" : "−";
      const summand = () => s.op === "add" ? s.w : scale(s.w, -1);
      const result = () => add(s.z, summand());
      const calculation = () => `(${complex(s.z)}) ${sign()} (${complex(s.w)}) = ${complex(result())}. Add ${pointText(s.z)} to ${pointText(summand())} component by component.`;

      function compute(reveal = true) {
        const z = readPoint("z-"), w = readPoint("w-"), op = choose("operation");
        Object.assign(s, { z, w, op, show: reveal });
      }

      const check = test => {
        if (pending("predict")) return waitFor("Submit the open prediction before revealing the result.");
        compute();
        return judge(test(result()), calculation());
      };
      return {
        changed(name) {
          if (!/^(z-|w-|operation)/.test(name)) return false;
          s.show = false;
          clearAnswer("predict");
          return true;
        },
        actions: { calculate() {
          if (pending("predict")) return "Use Lock and reveal in the open prediction.";
          compute();
        } },
        checks: {
          target: () => check(z => s.op === "add" && near(z, [3, 1])),
          real: () => check(z => z[1] === 0),
          zero: () => check(z => s.op === "add" && magnitude(s.z) > 0 && magnitude(s.w) > 0 && magnitude(z) === 0),
          predict() {
            const guess = readPoint("guess-");
            compute();
            return judge(near(guess, result()), calculation());
          }
        },
        hints: {
          target: ["Use addition.", "Choose real parts that total 3 and imaginary parts that total 1."],
          real: ["A real result has imaginary component zero.", "For addition, choose opposite imaginary parts."],
          zero: ["Both coordinates have to cancel.", "Use one nonzero number and its additive inverse."],
          predict: ["Treat the two coordinates separately.", "For subtraction, negate both coordinates of w before adding."]
        },
        draw() {
          const show = s.show && !pending("predict"), resultPoint = show ? result() : null;
          const desc = show ? calculation() : `Last applied operands: ${complex(s.z)} and ${complex(s.w)}. Result pending.`;
          out("state", desc);
          return planePlan("Head-to-tail arithmetic", desc, [[s.z, "z", colors.a], [s.w, "w", colors.b, true],
            [resultPoint, "Result", colors.c]], show ? [[s.z, resultPoint, s.op === "add" ? "Translated w" : "Translated −w", colors.d]] : []);
        }
      };
    });

  station("multiply", () => ({ z: opening, r: 1, theta: 45, show: false, example: false }),
    ({ s, out, readPoint, value, set, setPoint, clearAnswer, pending }) => {
      const w = () => polar(s.r, s.theta);
      const product = () => multiply(s.z, w());

      function compute() {
        const z = s.example ? polar(2, 30) : readPoint("z-");
        const r = value("w-r"), theta = value("w-angle");
        Object.assign(s, { z, r, theta, show: true });
      }

      function explain() {
        const [a, b] = s.z, [c, d] = w(), p = product();
        const rect = `Real: ${term(a)}×${term(c)} − ${term(b)}×${term(d)}. Imaginary: ${term(a)}×${term(d)} + ${term(b)}×${term(c)}. Product ${complex(p)}.`;
        return rect + (magnitude(p) ? ` Magnitudes multiply to ${str(magnitude(p))}. Arguments add to ${angleText(argument(p))} modulo 360°.`
          : " A zero factor gives zero, with undefined argument.");
      }

      const check = test => {
        if (pending("predict")) return waitFor("Submit your polar prediction first.");
        compute();
        return judge(test(), explain());
      };
      return {
        changed(name) {
          if (!/^(z-|w-)/.test(name)) return false;
          if (name.startsWith("z-")) s.example = false;
          s.show = false;
          clearAnswer("predict");
          return true;
        },
        actions: {
          calculate() {
            if (pending("predict")) return "Use the prediction’s Lock and multiply button.";
            compute();
          },
          example() {
            s.example = true;
            setPoint("z-", [1.7321, 1]);
            set("w-r", 3);
            set("w-angle", 60);
            compute();
            clearAnswer("predict");
          }
        },
        checks: {
          turn: () => check(() => magnitude(s.z) > 0 && close(s.r, 1) && sameAngle(s.theta, 45)),
          double: () => check(() => magnitude(s.z) > 0 && close(s.r, 2) && sameAngle(s.theta, 0)),
          map: () => check(() => near(s.z, [1, 1]) && near(product(), [-2, 2])),
          predict() {
            const guess = value("guess-r"), theta = value("guess-angle");
            compute();
            if (!magnitude(s.z) || !s.r) return waitFor("Use two nonzero factors for an argument prediction.");
            const p = product();
            return judge(close(guess, magnitude(p)) && sameAngle(theta, argument(p)), explain());
          }
        },
        hints: {
          turn: ["Preserve the magnitude by using a unit multiplier.", "Arguments add, so enter the desired turn as the multiplier’s angle."],
          double: ["The multiplier’s magnitude sets the length ratio.", "A positive real multiplier has argument zero."],
          map: ["Compare the target’s length with the starting length.", "Compare how far the target is turned from 1 + i."],
          predict: ["Multiply the two lengths.", "Add the two arguments and allow for a full turn."]
        },
        draw() {
          const show = s.show && !pending("predict");
          const desc = show ? (s.example && s.r === 3 && sameAngle(s.theta, 60, 0) ? "2e^(iπ/6) × 3e^(iπ/3) = 6i. " : "") + explain()
            : `Factors: z = ${complex(s.z)}, w = ${describe(w())}. Product pending.`;
          out("state", desc);
          return planePlan("Complex product", desc, [[s.z, "z", colors.a], [w(), "w", colors.b, true],
            [show ? product() : null, "Product", colors.c]]);
        }
      };
    });

  station("mirror", () => ({ z: opening, show: false }),
    ({ s, out, readPoint, value, choose, setPoint, clearAnswer, pending }) => {
      const mask = () => pending("point", "predict");
      const show = () => { s.z = readPoint(); s.show = true; };
      const explanation = () => `z = ${complex(s.z)}, z* = ${complex(conj(s.z))}. The product is ${term(s.z[0])}² + ${term(s.z[1])}² = ${str(sq(s.z))}. The reflected argument is ${angleText(argument(conj(s.z)))}.`;

      function check(test) {
        if (mask()) return waitFor("Submit the open prediction first.");
        show();
        return judge(test(), explanation());
      }

      return {
        changed(name) {
          if (name !== "a" && name !== "b") return false;
          s.show = false;
          clearAnswer("point");
          clearAnswer("predict");
          return true;
        },
        actions: { show() {
          if (mask()) return "Lock your answer before revealing the mirror.";
          show();
        } },
        checks: {
          point() {
            const guess = readPoint("guess-");
            setPoint("", opening);
            s.z = opening;
            s.show = true;
            return judge(near(guess, conj(s.z)), explanation());
          },
          product: () => check(() => close(sq(s.z), 25)),
          fixed: () => check(() => s.z[0] !== 0 && s.z[1] === 0),
          predict() {
            const guess = choose("magnitude"), theta = value("argument");
            show();
            if (!magnitude(s.z)) return waitFor("Use a nonzero z to predict a measured argument.");
            return judge(guess === "same" && sameAngle(theta, argument(conj(s.z))), explanation() +
              " Reflection preserves the magnitude and negates the angle modulo 360°.");
          }
        },
        hints: {
          point: ["The real axis is the mirror.", "Keep the real coordinate and reverse the imaginary coordinate."],
          product: ["The product with the conjugate is real.", "Choose legs whose squares add to 25."],
          fixed: ["A fixed point lies on the mirror.", "Set the imaginary coordinate to zero and keep the real coordinate nonzero."],
          predict: ["Reflecting across the real axis keeps the distance from the origin.", "Negate the angle and account for the principal interval."]
        },
        draw() {
          const visible = s.show && !mask(), shown = pending("point") ? opening : s.z;
          const desc = visible ? explanation() : `Original ${describe(shown)}. Mirror result pending.`;
          out("state", desc);
          return planePlan("Real-axis mirror", desc, [[shown, "z", colors.a], [visible ? conj(shown) : null, "z*", colors.d, true]]);
        }
      };
    });

  station("conversion", () => ({ mode: "", points: [], line: "" }), ({ s, out, choose, value, readPoint }) => {
    const axis = { negative: [-5, 0], "positive-i": [0, 2], "negative-i": [0, -2], zero: origin };

    function polarCheck(z, r, theta, defined = true) {
      const measured = argument(z), correct = close(r, magnitude(z)) &&
        (measured === null ? !defined : defined && sameAngle(theta, measured));
      s.points = [z];
      s.line = describe(z);
      return judge(correct, `${pointText(z)} gives r = √(${term(z[0])}² + ${term(z[1])}²) = ${str(magnitude(z))}; argument ${angleText(measured)}.`);
    }

    return {
      opened(key) {
        s.mode = key;
        s.line = "";
        s.points = { axis: [axis[choose("axis")]], quadrant: [[-3, 4]], components: [], ratio: [opening, scale(opening, -1)] }[key];
      },
      changed(name, type) {
        if (type !== "change") return false;
        if (name === "axis") {
          s.mode = "axis";
          s.points = [axis[choose("axis")]];
          s.line = "";
          return true;
        }
        return false;
      },
      checks: {
        axis() {
          const z = axis[choose("axis")], r = value("axis-r"), defined = choose("axis-type") === "angle";
          return polarCheck(z, r, defined ? value("axis-angle") : null, defined);
        },
        quadrant: () => polarCheck([-3, 4], value("quad-r"), value("quad-angle")),
        components() {
          const guess = readPoint("guess-"), z = polar(2, 60);
          s.points = [z];
          s.line = describe(z);
          return judge(near(guess, z), "a = 2 cos 60° = 1; b = 2 sin 60° = √3 ≈ 1.7321.");
        },
        ratio() {
          const guess = choose("ratio"), a = opening, b = scale(a, -1);
          s.points = [a, b];
          s.line = `Both have b/a = 4/3. Their principal arguments are ${angleText(argument(a))} and ${angleText(argument(b))}.`;
          return judge(guess === "opposite", s.line + " They differ by a half-turn.");
        }
      },
      hints: {
        axis: ["A point on an axis has one zero coordinate.", "Magnitude is distance to the origin. Only a nonzero point has an argument."],
        quadrant: ["Use both signed components to locate the quadrant.", "Compute √(a² + b²) then use atan2(b,a)."],
        components: ["Cosine gives the real component per unit radius.", "Multiply the radius by cosine and by sine of 60°."],
        ratio: ["Both signs reverse together.", "A single ratio cannot distinguish directions separated by a half-turn."]
      },
      draw() {
        const desc = s.line || (s.mode === "components" ? "Given r = 2 and θ = 60°. Submit both components to reveal the point."
          : s.points.length ? "Given " + s.points.map(complex).join(" and ") + ". Enter your conversion." : "Choose a conversion mission.");
        out("state", desc);
        return planePlan("Representation converter", desc, s.points.map((p, i) => [p, i ? "Point 2" : "Point 1", i ? colors.d : colors.a, Boolean(i)]));
      }
    };
  });

  function pair(r1, r2, a, b) {
    const A = polar(r1, a), B = polar(r2, b);
    const delta = r1 && r2 ? normalize(b - a) : null;
    const opposed = sameAngle(delta, 180, 1e-10);
    const sum = opposed ? polar(r1 - r2, a) : add(A, B);
    return { A, B, delta, sum, squared: sq(sum), r1, r2, a, b };
  }

  function pairText(p, reveal = true) {
    return `A = ${describe(p.A)}. B = ${describe(p.B)}. Relative phase ${angleText(p.delta)}.` +
      (reveal ? ` Sum ${complex(p.sum)} · magnitude ${str(magnitude(p.sum))} · raw squared magnitude ${str(p.squared)}.`
        : " Sum concealed until you submit a prediction.");
  }

  function pairPlan(title, p, reveal, prior = null) {
    return planePlan(title, pairText(p, reveal), [[p.A, "A", colors.a], [p.B, "B", colors.b, true],
      [reveal ? p.sum : null, "Sum", colors.c], [prior, "Earlier sum", colors.d, true]]);
  }

  station("interference", () => ({ settings: pair(1, 1, 0, 60), setup: "unit", residual: false }),
    ({ s, fields, out, choose, value, set, clearAnswer }) => {
      function load() {
        s.setup = choose("setup");
        const opposing = s.setup === "opposing";
        s.settings = opposing ? pair(2, 1, 0, 180) : pair(1, 1, 0, 60);
        set("a-r", s.settings.r1);
        set("b-r", s.settings.r2);
        set("a-angle", s.settings.a);
        set("b-angle", s.settings.b);
        s.residual = false;
        clearAnswer("residual");
      }

      function plot() {
        const r1 = s.setup === "free" ? value("a-r") : s.setup === "opposing" ? 2 : 1;
        const r2 = s.setup === "free" ? value("b-r") : 1;
        const a = value("a-angle"), b = value("b-angle");
        s.settings = pair(r1, r2, a, b);
      }

      const unit = (test, note) => {
        if (s.setup !== "unit") return waitFor("Load the unit-pair setup first.");
        plot();
        return judge(test(s.settings), pairText(s.settings) + " " + note);
      };
      return {
        actions: { load, plot },
        changed(name) {
          if (s.setup !== "opposing" || name !== "a-angle" && name !== "b-angle" || !s.residual) return false;
          s.residual = false;
          clearAnswer("residual");
          return true;
        },
        checks: {
          max: () => unit(p => sameAngle(p.delta, 0, 1e-10), "Aligned unit arrows add to length 2."),
          zero: () => unit(p => p.squared === 0, "Equal and opposite arrows cancel exactly."),
          residual() {
            const guess = value("guess");
            if (s.setup !== "opposing") return waitFor("Load the opposing 2 and 1 setup.");
            plot();
            if (!sameAngle(s.settings.delta, 180, 1e-10)) return waitFor("The phases must differ by a half-turn.");
            s.residual = true;
            return judge(close(guess, magnitude(s.settings.sum)), pairText(s.settings) + " The residual length is |2 − 1|.");
          },
          target: () => unit(p => close(magnitude(p.sum), 1), "Both 120° and 240° give this length.")
        },
        hints: {
          max: ["Keep both radii at one.", "Make the two directions coincide modulo 360°."],
          zero: ["An opposite arrow points a half-turn away.", "The two lengths must be equal. Add 180° to one angle."],
          residual: ["Opposing arrows subtract along one line.", "Take the nonnegative difference between the two radii."],
          target: ["For unit inputs the raw square is 2 + 2 cos Δ.", "Choose a phase with cosine −1/2."]
        },
        draw() {
          const locked = s.setup !== "free";
          fields["a-r"].readOnly = locked;
          fields["b-r"].readOnly = locked;
          const plan = pairPlan("Phase match · amplitude sum", s.settings, s.setup !== "opposing" || s.residual);
          out("state", plan.description);
          return plan;
        }
      };
    });

  station("global", () => ({ p: pair(1, 1, 0, 120), last: null }), ({ s, value, out }) => {
    function apply(kind) {
      const delta = value(kind), before = s.p;
      s.p = pair(1, 1, normalize(before.a + (kind === "common" ? delta : 0)), normalize(before.b + delta));
      s.last = { kind, delta, before, after: s.p };
    }

    function record() {
      const { kind, before, after, delta } = s.last;
      return `${kind === "common" ? "Common" : "B-only"} turn ${angleText(delta)}. Sum ${complex(before.sum)} → ${complex(after.sum)}; direction ${angleText(argument(before.sum))} → ${angleText(argument(after.sum))}; raw squared magnitude ${str(before.squared)} → ${str(after.squared)}.`;
    }

    return {
      actions: { common: () => apply("common"), relative: () => apply("relative") },
      checks: {
        together() {
          if (s.last?.kind !== "common") return waitFor("Apply a common turn first.");
          const { before, after, delta } = s.last;
          return judge(Boolean(before.squared && after.squared) && normalize(delta) !== 0 &&
            !sameAngle(argument(before.sum), argument(after.sum), 1e-10) && close(before.squared, after.squared, 1e-10),
            record() + " The direction turns through the common angle.");
        },
        increase() {
          if (s.last?.kind !== "relative") return waitFor("Turn only B first.");
          return judge(s.p.squared - s.last.before.squared > 1e-10, record() + " Changing only B changes the relative phase.");
        },
        zero() {
          if (s.last?.kind !== "common") return waitFor("Create cancellation, then turn both arrows.");
          return judge(normalize(s.last.delta) !== 0 && s.last.before.squared === 0 && s.p.squared === 0,
            record() + " The zero sum has undefined argument. The component phase difference is still 180°.");
        }
      },
      hints: {
        together: ["Start with a nonzero sum.", "Turn both arrows by the same angle other than a whole turn."],
        increase: ["More alignment increases the sum for this unit pair.", "Turn B toward A and compare the two squared magnitudes."],
        zero: ["First turn B to oppose A.", "Apply a nontrivial common turn and compare the two zero sums."]
      },
      draw() {
        const plan = pairPlan("Common and relative phase", s.p, true, s.last?.before.sum);
        out("state", plan.description);
        out("last", s.last ? record() : "No turn recorded.");
        return plan;
      }
    };
  });

  station("euler", () => ({ angle: 0, lap: null }), ({ s, out, set, value, choose, clearAnswer, pending }) => {
    function move(angle) {
      s.angle = angle;
      set("angle", angle);
      if (s.lap && angle === 360) s.lap.end = 360;
    }

    return {
      changed(name, type) {
        if (name === "angle" && type === "input") {
          move(value("angle"));
          return true;
        }
        if (name === "quadrant" && type === "change") {
          clearAnswer("signs");
          return true;
        }
        return false;
      },
      actions: {
        start() { s.lap = { start: 0, end: null }; move(0); },
        turn() { if (!s.lap) s.lap = { start: 0, end: null }; move(360); }
      },
      checks: {
        cardinal() {
          const got = symbolIDs.map(value), correct = got.every((a, i) => sameAngle(a, 90 * i));
          return judge(correct, "The axis points in counterclockwise order are 1 at 0°, i at 90°, −1 at 180°, and −i at 270°.");
        },
        identity() {
          const guess = choose("identity");
          move(180);
          return judge(guess === "zero", "At π radians the endpoint is −1, so e^(iπ) + 1 = −1 + 1 = 0.");
        },
        turn() {
          if (s.lap?.end !== 360) return waitFor("Record 0°, then move the angle to 360°.");
          return judge(true, "The endpoint is (1, 0) at both 0 rad and 2π rad. The recorded turn is 360°.");
        },
        signs() {
          const quadrant = Number(choose("quadrant")), guess = choose("signs");
          move(45 + 90 * (quadrant - 1));
          const [a, b] = polar(1, s.angle);
          const result = (a > 0 ? "+" : "-") + (b > 0 ? "+" : "-");
          return judge(result === guess, `At ${s.angle}° the projections are ${pointText([a, b])}. The signs in order are ${result}.`);
        }
      },
      hints: {
        cardinal: ["The positive real axis is the starting direction.", "Count counterclockwise in increments of 90°."],
        identity: ["π radians is a half-turn from 1.", "Read the endpoint on the real axis before adding 1."],
        turn: ["Start a record at angle zero.", "Use the full angle range. A complete lap spans 2π radians."],
        signs: ["Real is the horizontal projection.", "Imaginary is the vertical projection. Think about which side of each axis the point lies on."]
      },
      draw() {
        const hidden = pending("signs"), point = hidden ? null : polar(1, s.angle);
        const desc = hidden ? "Submit both signs to reveal the unit-circle point and trace cursor."
          : `${s.angle}° · ${radiansText(s.angle)} rad · e^(iθ) ${point.every(v => Number(v.toFixed(4)) === v) ? "=" : "≈"} ${complex(point)} · cos θ ${str(point[0])} · sin θ ${str(point[1])}.`;
        out("state", desc);
        out("lap", s.lap?.end === 360 ? "0° (1, 0) → 360° (1, 0); applied angle +2π rad."
          : s.lap ? "Start recorded at 0°." : "No full turn recorded.");
        return eulerPlan(desc, hidden ? null : s.angle, point);
      }
    };
  });

  station("powers", () => ({ n: 0, pin: null }), ({ s, value, choose, out, set, pending }) => {
    const result = n => symbols[n % 4];
    const step = n => `${n} = 4 × ${Math.floor(n / 4)} + ${n % 4}. i^${n} = ${result(n)}.`;
    const take = () => { s.n = value("n"); };
    return {
      actions: {
        evaluate() {
          if (pending("five") && value("n") === 5) return "Commit your i⁵ prediction before evaluating it.";
          take();
        },
        pin() {
          if (pending("five") && value("n") === 5) return "Commit your i⁵ prediction before saving that result.";
          take();
          s.pin = s.n;
        }
      },
      checks: {
        five() {
          const guess = choose("guess");
          s.n = 5;
          set("n", 5);
          return judge(guess === "i", step(5) + " One full cycle leaves one quarter-turn.");
        },
        "minus-i"() {
          if (pending("five") && value("n") === 5) return waitFor("Commit your i⁵ prediction before evaluating it.");
          take();
          return judge(s.n % 4 === 3, step(s.n));
        },
        period: () => judge(choose("reason") === "full", "Four quarter-turns make 360°, so i⁴ = 1. Another block of four multiplies by 1."),
        match() {
          if (s.pin === null) return waitFor("Save an exponent first.");
          if (pending("five") && value("n") === 5) return waitFor("Commit your i⁵ prediction before evaluating it.");
          take();
          return judge(s.n !== s.pin && s.n % 4 === s.pin % 4, step(s.pin) + " " + step(s.n),
            "Use distinct exponents with the same remainder after division by 4.");
        }
      },
      hints: {
        five: ["Separate the exponent into complete cycles and leftover factors.", "A block of four factors of i contributes the factor 1."],
        "minus-i": ["Find the clockwise direction on the unit circle.", "Count positive quarter-turns from 1 to its equivalent direction."],
        period: ["A factor of i adds one quarter-turn.", "Look for the number of quarter-turns that closes a circle."],
        match: ["Only the remainder after division by 4 matters.", "Try a distinct exponent four larger or four smaller than the saved one."]
      },
      draw() {
        const hidden = pending("five") && s.n === 5;
        const desc = hidden ? "Prediction pending." : step(s.n);
        out("state", desc);
        out("saved", s.pin === null ? "No exponent saved." : pending("five") && s.pin === 5 ? "Saved result concealed during prediction." : step(s.pin));
        const p = planePlan("Quarter-turn reactor", desc, [[hidden ? null : turns[s.n % 4], "Endpoint", colors.c]], [], 2);
        if (!hidden && s.n % 4) p.line(circlePoints(280, 170, 50, 90 * (s.n % 4)), colors.gold);
        return p;
      }
    };
  });

  station("defender", () => ({ round: "free", r: 2, theta: 90, pin: null }),
    ({ s, fields, out, choose, value, set }) => {
      const targets = { radius: [0, 5], phase: [-3, 0], zero: origin };
      const point = () => polar(s.r, s.theta);

      function load() {
        s.round = choose("round");
        s.r = s.round === "phase" ? 3 : 2;
        s.theta = s.round === "phase" ? 0 : 90;
        set("r", s.r);
        set("angle", s.theta);
      }

      function plot() {
        const r = s.round === "phase" ? 3 : value("r"), theta = s.round === "radius" ? 90 : value("angle");
        s.r = r;
        s.theta = theta;
      }

      function target(key, evidence) {
        if (s.round !== key) return waitFor("Load the matching round first.");
        plot();
        return judge(near(point(), targets[key]), evidence, `The plotted point is ${complex(point())}. Reach ${complex(targets[key])}.`);
      }

      return {
        actions: { load, plot, pin() {
          if (s.round !== "free" || !s.r) return "Plot a nonzero point in free practice first.";
          s.pin = point();
        } },
        checks: {
          radius: () => target("radius", "You reached 5i by keeping the 90° ray and changing the radius from 2 to 5."),
          phase: () => target("phase", "You reached −3 by turning to the negative real axis at radius 3."),
          match() {
            if (s.round !== "free" || !s.pin) return waitFor("Save a nonzero point in free practice.");
            plot();
            const z = point();
            return judge(Boolean(s.r) && close(s.r, magnitude(s.pin)) && !sameAngle(s.theta, argument(s.pin)),
              `Saved ${describe(s.pin)}. Current ${describe(z)}.`, "Keep the radius and choose a genuinely different direction.");
          },
          zero() {
            const guess = choose("reason");
            if (s.round !== "zero") return waitFor("Load Return to zero first.");
            plot();
            return judge(s.r === 0 && guess === "direction", `The measured argument is undefined at zero. The chosen control angle is ${angleText(s.theta)}.`,
              s.r ? "Set the radius to zero first." : "At zero there is no measured direction. The control angle is a separate record.");
          }
        },
        hints: {
          radius: ["The point stays on the +Imaginary ray.", "Match the target’s distance from the origin."],
          phase: ["The target is on the negative real axis.", "Change the angle by a half-turn from +Real."],
          match: ["Save a positive radius first.", "Keep that radius and choose an angle that differs by more than full turns."],
          zero: ["A radius of zero puts both components at zero.", "Consider whether a point at the origin can specify an arrow direction."]
        },
        draw() {
          fields.r.readOnly = s.round === "phase";
          fields.angle.readOnly = s.round === "radius";
          const z = point(), goal = targets[s.round];
          const desc = `Marker ${describe(z)}.${goal ? " Target " + complex(goal) + "." : " Free practice."}` +
            (!s.r ? ` Chosen outward direction ${angleText(s.theta)}.` : "");
          out("state", desc);
          out("saved", s.pin ? "Saved " + describe(s.pin) : "No point saved.");
          return planePlan("Magnitude and phase controls", desc, [[z, "Marker", colors.c], [goal, "Target", colors.gold, true],
            [s.pin, "Saved", colors.d, true]]);
        }
      };
    });

  station("division", () => ({ z: opening, w: [0, 1], show: false, draft: false }),
    ({ s, readPoint, out, value, choose, setPoint, clearAnswer, pending }) => {
      function compute() {
        const z = readPoint("z-"), w = readPoint("w-");
        Object.assign(s, { z, w, show: true, draft: false });
      }

      const numerator = () => multiply(s.z, conj(s.w));
      const quotient = () => sq(s.w) ? scale(numerator(), 1 / sq(s.w)) : null;

      function explain() {
        const q = quotient();
        if (!q) return "Division unavailable. The denominator is zero, so c² + d² = 0.";
        const [c, d] = s.w;
        const line = `Multiply both parts by ${complex(conj(s.w))}. The real denominator is ${term(c)}² + ${term(d)}² = ${str(sq(s.w))}. Numerator ${complex(numerator())}; quotient ${complex(q)}.`;
        return line + (magnitude(s.z) ? ` Magnitudes divide to ${str(magnitude(q))}; the arguments subtract to ${angleText(argument(q))} modulo a turn.`
          : " A zero numerator gives a valid zero quotient with undefined argument.");
      }

      function check(test) {
        if (pending("i")) return waitFor("Submit the open prediction first.");
        compute();
        return judge(test(), explain());
      }

      return {
        changed(name) {
          if (!/^(z-|w-)/.test(name)) return false;
          s.show = false;
          s.draft = true;
          clearAnswer("i");
          return true;
        },
        actions: {
          calculate() {
            if (pending("i")) return "Lock your prediction before revealing the quotient.";
            compute();
          },
          example() {
            setPoint("z-", opening);
            setPoint("w-", [1, -1]);
            compute();
            clearAnswer("i");
          }
        },
        checks: {
          i() {
            const guess = readPoint("guess-");
            setPoint("z-", opening);
            setPoint("w-", [0, 1]);
            compute();
            return judge(near(guess, quotient()), explain() + " Division by i equals multiplication by −i.");
          },
          unit: () => check(() => Boolean(magnitude(s.z) && magnitude(s.w)) && close(magnitude(quotient()), 1)),
          conjugate() {
            if (pending("i")) return waitFor("Submit the open clockwise prediction first.");
            const guess = value("denominator");
            compute();
            const d = sq(s.w);
            return judge(d > 0 && Math.abs(guess - d) <= Math.min(0.002, d * 0.01), explain());
          },
          zero() {
            const guess = choose("reason");
            compute();
            return judge(!magnitude(s.w) && guess === "zero", explain());
          }
        },
        hints: {
          i: ["The reciprocal of i is −i.", "A clockwise quarter-turn sends (a,b) to (b,−a)."],
          unit: ["A quotient divides the two magnitudes.", "Use the same positive length for both factors."],
          conjugate: ["Flip the sign of the denominator’s imaginary component.", "Multiplying the original denominator by its conjugate gives c² + d²."],
          zero: ["Inspect both denominator components.", "A zero denominator makes the real divisor zero as well."]
        },
        draw() {
          const mask = pending("i"), show = s.show && !mask, a = mask ? opening : s.z, b = mask ? [0, 1] : s.w;
          const desc = show ? explain() : mask ? "Prediction pending for (3 + 4i) ÷ i."
            : s.draft ? "Unapplied input. The previous quotient has been cleared." : `Set ${complex(s.z)} ÷ ${complex(s.w)}. Apply the division to see the quotient.`;
          out("state", desc);
          return planePlan("Complex division", desc, [[s.draft && !mask ? null : a, "Numerator", colors.a],
            [s.draft && !mask ? null : b, "Denominator", colors.b, true], [show ? quotient() : null, "Quotient", colors.c]]);
        }
      };
    });

  // One geometry description drives the SVG and Three.js views.
  function makePlan(width, height, title, description) {
    const lines = [], shapes = [], labels = [];
    return { width, height, title, description, lines, shapes, labels,
      line(points, color, dash = false) { lines.push({ points, color, dash }); },
      poly(points, color, opacity = 1) { shapes.push({ points, color, opacity }); },
      dot([x, y], color, size = 4, diamond = false) { shapes.push({ x, y, color, size, diamond }); },
      label(x, y, label, color = colors.ink) {
        const margin = Math.min(width / 2, label.length * 4.2 + 6);
        labels.push({ x: Math.max(margin, Math.min(width - margin, x)), y: Math.max(13, Math.min(height - 13, y)), label, color });
      },
      arrow(a, b, color, dash = false) {
        const delta = [b[0] - a[0], b[1] - a[1]], d = magnitude(delta);
        if (d < 0.01) return;
        this.line([a, b], color, dash);
        const [x, y] = scale(delta, Math.min(11, d / 3) / d);
        this.poly([b, [b[0] - x - y / 2, b[1] - y + x / 2], [b[0] - x + y / 2, b[1] - y - x / 2]], color);
      }
    };
  }

  function circlePoints(x, y, r, angle = 360) {
    const n = Math.max(1, Math.ceil(Math.abs(angle) / 5));
    return Array.from({ length: n + 1 }, (_, i) => {
      const [a, b] = polar(r, angle * i / n);
      return [x + a, y - b];
    });
  }

  function planePlan(title, desc, items, translated = [], initial = 4) {
    const p = makePlan(560, 340, title, desc);
    const points = [...items.map(([z]) => z), ...translated.flatMap(([a, b]) => [a, b])].filter(Boolean);
    const max = Math.max(initial, ...points.flat().map(Math.abs));
    const step = 10 ** Math.floor(Math.log10(max / 4));
    const span = Math.ceil(max * 1.08 / step) * step;
    const x0 = 280, y0 = 169, unit = 130 / span;
    const xy = ([a, b]) => [x0 + a * unit, y0 - b * unit];
    const [left, bottom] = xy([-span, -span]), [right, top] = xy([span, span]);
    for (const frac of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
      const [x, y] = xy([frac * span, frac * span]);
      const color = frac ? colors.grid : colors.axis;
      p.line([[x, top], [x, bottom]], color);
      p.line([[left, y], [right, y]], color);
    }
    p.label(right + 47, y0 - 11, "Real");
    p.label(x0, top - 18, "Imaginary");
    p.label(x0 - 13, y0 + 13, "0", colors.axis);
    p.label(right, y0 + 17, "+" + str(span), colors.axis);
    p.label(left, y0 + 17, "−" + str(span), colors.axis);
    p.label(x0 - 28, top, str(span), colors.axis);
    p.label(x0 - 28, bottom, "−" + str(span), colors.axis);
    p.label(x0, 321, `Grid interval: ${str(span / 4)} units · equal scale`, colors.axis);
    translated.forEach(([a, b, label, color]) => {
      const [x, y] = xy(b), [u, v] = xy(a);
      p.arrow([u, v], [x, y], color, true);
      p.label((u + x) / 2, (v + y) / 2 + 14, label, color);
    });
    items.forEach(([z, label, color, dash = false], i) => {
      if (!z) return;
      const [x, y] = xy(z);
      p.arrow([x0, y0], [x, y], color, dash);
      p.dot([x, y], color, dash ? 6 : 4.5, dash);
      p.label(x + (x < x0 ? -25 : 25), y + (y > y0 ? 1 : -1) * (11 + i * 13), label, color);
    });
    return p;
  }

  function eulerPlan(desc, angle, point) {
    const p = makePlan(560, 340, "Euler explorer · unit circle and traces", desc);
    const ox = 132, oy = 150, r = 90;
    p.line(circlePoints(ox, oy, r), colors.axis);
    p.line([[35, oy], [229, oy]], colors.axis);
    p.line([[ox, 54], [ox, 247]], colors.axis);
    p.label(224, 168, "Real");
    p.label(132, 37, "Imaginary");
    const X = a => 282 + a * (247 / 360), Y = y => 150 - y * 84;
    for (const a of [0, 90, 180, 270, 360]) {
      p.line([[X(a), Y(-1)], [X(a), Y(1)]], colors.grid);
      p.label(X(a), 257, exact[a], colors.axis);
    }
    for (const v of [-1, 0, 1]) {
      p.line([[X(0), Y(v)], [X(360), Y(v)]], colors.axis);
      p.label(X(0) - 12, Y(v), str(v), colors.axis);
    }
    p.label(408, 288, "Angle θ (radians)");
    p.label(352, 31, "cos θ · solid", colors.a);
    p.label(485, 31, "sin θ · dashed", colors.b);
    if (!point) return p;
    const samples = Array.from({ length: 73 }, (_, i) => i * 5);
    p.line(samples.map(a => [X(a), Y(polar(1, a)[0])]), colors.a);
    p.line(samples.map(a => [X(a), Y(polar(1, a)[1])]), colors.b, true);
    const [a, b] = point, tip = [ox + r * a, oy - r * b];
    p.arrow([ox, oy], tip, colors.c);
    p.line([[ox + r * a, oy], tip], colors.b, true);
    p.line([[ox, oy - r * b], tip], colors.a, true);
    p.dot(tip, colors.c);
    p.line([[X(angle), Y(-1)], [X(angle), Y(1)]], colors.d, true);
    p.dot([X(angle), Y(a)], colors.a);
    p.dot([X(angle), Y(b)], colors.b, 5, true);
    return p;
  }

  function drawLabels(plan, host) {
    host.replaceChildren(...plan.labels.map(({ x, y, label, color }) => {
      const el = svg("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central",
        style: `fill:${color};font:700 15px ui-monospace,monospace;paint-order:stroke fill;stroke:#050d09;stroke-width:3px` });
      el.textContent = label;
      return el;
    }));
  }

  function polygonPoints(m) {
    const { x, y, size: r } = m;
    return m.points || (m.diamond ? [[x, y - r], [x + r, y], [x, y + r], [x - r, y]] : circlePoints(x, y, r));
  }

  function drawSvg(plan, geometry, labels) {
    const vertices = points => points.map(p => p.join(",")).join(" ");
    geometry.replaceChildren(...plan.lines.map(({ points, color, dash }) => svg("polyline", {
      points: vertices(points), stroke: color, "stroke-width": 1.4, fill: "none", "stroke-dasharray": dash ? "5 4" : "none"
    })), ...plan.shapes.map(m => m.size && !m.diamond
      ? svg("circle", { cx: m.x, cy: m.y, r: m.size, fill: m.color })
      : svg("polygon", { points: vertices(polygonPoints(m)), fill: m.color, opacity: m.opacity ?? 1 })));
    drawLabels(plan, labels);
  }

  function makeRenderer(T) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: !reduced(), powerPreference: "low-power" });
    renderer.setClearColor(0x050d09);
    const world = new T.Scene(), group = new T.Group();
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 30);
    camera.position.z = 10;
    world.add(group);
    let current = null, viewSize = "";

    function clear() {
      for (const node of [...group.children]) {
        node.geometry.dispose();
        node.material.dispose();
        group.remove(node);
      }
    }

    function rebuild(plan) {
      clear();
      const x0 = plan.width / 2, y0 = plan.height / 2;
      const vertex = ([x, y], z = 0) => new T.Vector3(x - x0, y0 - y, z);
      const solid = new Map();
      for (const { points, color, dash } of plan.lines) {
        if (!dash) {
          const bag = solid.get(color) || [];
          for (let i = 1; i < points.length; i += 1) bag.push(vertex(points[i - 1]), vertex(points[i]));
          solid.set(color, bag);
          continue;
        }
        const geo = new T.BufferGeometry().setFromPoints(points.map(p => vertex(p, 0.05)));
        const line = new T.Line(geo, new T.LineDashedMaterial({ color, dashSize: 5, gapSize: 4 }));
        line.computeLineDistances();
        group.add(line);
      }
      for (const [color, points] of solid) {
        group.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color })));
      }
      for (const shape of plan.shapes) {
        const { color, opacity = 1 } = shape, points = polygonPoints(shape), coords = [];
        for (let i = 2; i < points.length; i += 1) {
          coords.push(...vertex(points[0], 0.1).toArray(), ...vertex(points[i - 1], 0.1).toArray(), ...vertex(points[i], 0.1).toArray());
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute("position", new T.Float32BufferAttribute(coords, 3));
        group.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color, side: T.DoubleSide,
          transparent: opacity < 1, opacity, depthWrite: opacity === 1 })));
      }
      current = plan;
    }

    return { draw(plan, width, height) {
      if (plan !== current) rebuild(plan);
      const density = Math.min(window.devicePixelRatio || 1, reduced() ? 1 : 1.5);
      const key = [width, height, plan.width, plan.height, density].join(":");
      if (key !== viewSize) {
        renderer.setPixelRatio(density);
        renderer.setSize(width, height, false);
        const scale = Math.min(width / plan.width, height / plan.height);
        camera.right = width / (2 * scale);
        camera.left = -camera.right;
        camera.top = height / (2 * scale);
        camera.bottom = -camera.top;
        camera.updateProjectionMatrix();
        viewSize = key;
      }
      renderer.render(world, camera);
    }, dispose() { clear(); renderer.dispose(); } };
  }

  const overlay = svg("svg", { viewBox: "0 0 420 420", width: "100%", height: "100%", "aria-hidden": "true" });
  layer.append(overlay);
  let graphics = null, frame = null, owner = "main", mainVisible = true, arcVisible = false;
  let lost = false, loading = false, active = true, disposed = false, visibilityObserver;
  let notice = "Loading the local Three.js view.";
  const originalStatus = phase("renderer-status");

  function fallback() {
    canvas.hidden = true;
    layer.hidden = true;
    mainSvg.removeAttribute("hidden");
    arcGeometry.removeAttribute("hidden");
    text(originalStatus, notice + " The interactive SVG is available.");
    text(arcStatus, notice + " The interactive diagram and readouts are available.");
  }

  function schedule() {
    if (!active || disposed || document.hidden || frame !== null) return;
    frame = window.requestAnimationFrame(renderFrame);
  }

  function cancel() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  }

  async function load() {
    loading = true;
    try {
      const T = await import("../vendor/three.module.js");
      if (disposed) return;
      graphics = makeRenderer(T);
      schedule();
    } catch {
      notice = "The local Three.js view is unavailable.";
      if (!disposed) fallback();
    }
  }

  function renderFrame(now) {
    frame = null;
    if (!active || disposed || document.hidden) return;
    const useArcade = arcade.open && (visibilityObserver ? (!mainVisible && arcVisible) ||
      (owner === "arcade" && arcVisible) : owner === "arcade");
    if (animation) {
      if (useArcade || !mainVisible || reduced()) finishTurn();
      else {
        animation.start ??= now;
        const interval = Math.min(1, (now - animation.start) / animation.duration);
        if (interval === 1) finishTurn();
        else plotMain(multiply(animation.before, polar(1, animation.delta * interval)), true);
      }
    }
    if (!graphics || lost) {
      if (!loading && (mainVisible || arcVisible)) void load();
    } else if (useArcade || mainVisible) {
      const host = useArcade ? arcViewport : mainViewport, p = useArcade ? arcPlan : mainGeometry;
      const { clientWidth: width, clientHeight: height } = host;
      if (width && height && p) {
        if (canvas.parentElement !== host) host.prepend(canvas);
        try {
          graphics.draw(p, width, height);
          canvas.hidden = false;
          layer.hidden = useArcade;
          mainSvg.toggleAttribute("hidden", !useArcade);
          arcGeometry.toggleAttribute("hidden", useArcade);
          if (!useArcade) drawLabels(mainGeometry, overlay);
          text(originalStatus, useArcade ? "Interactive complex-plane SVG." : "Three.js · Equal scale on both axes.");
          text(arcStatus, useArcade ? "Three.js diagram." : "Interactive diagram.");
        } catch {
          try { graphics.dispose(); } catch { /* A lost context can interrupt disposal. */ }
          graphics = null;
          notice = "The 3D view stopped.";
          fallback();
        }
      }
    }
    if (animation) schedule();
  }

  function activateStation() {
    const current = stations.get(selector.value);
    for (const entry of stations.values()) entry.panel.hidden = entry !== current;
    find("[data-cp-slot]", current.panel).append(figure);
    current.redraw();
  }

  on(selector, "change", () => {
    owner = "arcade";
    finishTurn();
    text(status, "");
    activateStation();
  });
  on(id("cp-reset"), "click", () => {
    stations.get(selector.value).reset();
    text(status, "Station reset. Your completed missions still count.");
  });
  on(arcade, "toggle", () => {
    owner = arcade.open ? "arcade" : "main";
    if (arcade.open) finishTurn();
    schedule();
  });
  on(arcade, "focusin", () => { owner = "arcade"; schedule(); });
  on(lab, "focusin", () => { owner = "main"; schedule(); });
  on(phase("arcade-link"), "click", () => {
    arcade.open = true;
    owner = "arcade";
    finishTurn();
    find("summary", arcade).focus({ preventScroll: true });
    schedule();
  });
  for (const link of all('a[href="#phase-lab"], a[href="#phase-plane-heading"]')) on(link, "click", () => {
    owner = "main";
    find(link.getAttribute("href")).focus({ preventScroll: true });
    schedule();
  });

  function motionChange() {
    if (reduced()) finishTurn();
    schedule();
  }

  on(phase("reduced"), "change", motionChange);
  if (motion.addEventListener) on(motion, "change", motionChange);
  else motion.addListener?.(motionChange);
  on(canvas, "webglcontextlost", event => {
    event.preventDefault();
    lost = true;
    notice = "The WebGL context was interrupted.";
    fallback();
  });
  on(canvas, "webglcontextrestored", () => { lost = false; schedule(); });
  on(document, "visibilitychange", () => {
    if (document.hidden) {
      finishTurn();
      cancel();
    } else schedule();
  });
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  resize?.observe(mainViewport);
  resize?.observe(arcViewport);
  if (typeof IntersectionObserver === "function") {
    visibilityObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === mainViewport) mainVisible = entry.isIntersecting;
        else arcVisible = entry.isIntersecting;
      }
      schedule();
    });
    visibilityObserver.observe(mainViewport);
    visibilityObserver.observe(arcViewport);
  }
  on(window, "resize", schedule);
  on(window, "pagehide", event => {
    active = false;
    finishTurn();
    cancel();
    if (event.persisted) return;
    disposed = true;
    resize?.disconnect();
    visibilityObserver?.disconnect();
    graphics?.dispose();
  });
  on(window, "pageshow", () => { active = true; schedule(); });

  busy(false);
  phase("action-controls").disabled = false;
  phase("reduced").disabled = false;
  phase("challenge-controls").disabled = false;
  for (const fieldset of all("fieldset", arcade)) fieldset.disabled = false;
  selector.disabled = false;
  id("cp-reset").disabled = false;
  out("challenge-feedback", "Choose an answer. You can retry after reading the feedback.");
  setPoint(opening);
  activateStation();
  fallback();
}