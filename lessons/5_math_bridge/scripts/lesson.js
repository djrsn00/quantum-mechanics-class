const root = document.querySelector(".site-main.math-lesson");
if (root) initialize(root);

function initialize(root) {
  const q = (selector, scope = root) => scope.querySelector(selector);
  const all = (selector, scope = root) => [...scope.querySelectorAll(selector)];
  const id = name => q("#" + name);
  const math = name => id("math-" + name);
  const put = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };
  const attr = (node, values) => Object.entries(values).forEach(([key, value]) => node.setAttribute(key, value));
  const svg = (tag, attributes = {}, label = "") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    attr(node, attributes);
    if (label) node.textContent = label;
    return node;
  };
  const epsilon = 1e-10;
  const origin = [0, 0, 0], axes = "xyz";
  const colors = { green: "#78f8a6", orange: "#ff9f55", blue: "#65b7ff", violet: "#c19bff",
    gold: "#ffe16a", red: "#ff676f", ink: "#ecfff1", grid: "#2d5140", axis: "#759783" };
  const clean = v => Math.abs(v) < epsilon ? 0 : v;
  const rounded = (v, n = 2) => clean(Number(v.toFixed(n)));
  const fmt = (v, n = 2) => String(rounded(v, n)).replace("-", "−");
  const approx = (v, n = 2) => Math.abs(v - rounded(v, n)) > epsilon;
  const numberText = (v, n = 2) => (approx(v, n) ? "≈ " : "") + fmt(v, n);
  const tuple = (p, n = 2) => "(" + p.map(v => fmt(v, n)).join(", ") + ")";
  const coordinates = (p, n = 2) => (p.some(v => approx(v, n)) ? "≈ " : "") + tuple(p, n);
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const subtract = (a, b) => a.map((v, i) => v - b[i]);
  const scale = (p, s) => p.map(v => clean(v * s));
  const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
  const square = p => dot(p, p);
  const length = p => Math.hypot(...p);
  const close = (a, b) => Math.abs(a - b) <= epsilon;
  const same = (a, b) => a.every((v, i) => close(v, b[i]));
  const angle = degrees => degrees * Math.PI / 180;
  const circular = (degrees, radius = 1) => scale([Math.cos(angle(degrees)), Math.sin(angle(degrees)), 0], radius);
  const projection = (p, plane) => p.map((v, i) => plane.includes(axes[i]) ? v : 0);
  const viewName = v => v === "depth" ? "Depth" : v.toUpperCase();
  const rule = x => 2 * x + 1;
  const lengths = p => numberText(length(p)) + " units";
  const direction = (a, b) => {
    const la = length(a), lb = length(b);
    return la > epsilon && lb > epsilon ? dot(scale(a, 1 / la), scale(b, 1 / lb)) : null;
  };
  const exactRadians = { 0: "0", 30: "π/6", 45: "π/4", 60: "π/3", 90: "π/2", 120: "2π/3",
    135: "3π/4", 150: "5π/6", 180: "π", 210: "7π/6", 225: "5π/4", 240: "4π/3",
    270: "3π/2", 300: "5π/3", 315: "7π/4", 330: "11π/6", 360: "2π" };
  const radians = degrees => exactRadians[degrees] ? "= " + exactRadians[degrees] + " rad"
    : "≈ " + fmt(angle(degrees), 4) + " rad";
  const power = v => v < 0 ? `(${fmt(v)})²` : `${fmt(v)}²`;
  const signed = v => (approx(v) ? "≈ " : "") + (rounded(v) > 0 ? "+" : "") + fmt(v) + " units";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const effects = math("reduced");
  const reduced = () => motion.matches || effects.checked;

  // Read a rule, then work backward.
  const ruleX = math("rule-x"), calibration = math("calibration").dataset;
  function renderRule() {
    const x = ruleX.valueAsNumber, y = rule(x);
    const px = Number(calibration.originX) + x * Number(calibration.xStepPx);
    const py = Number(calibration.originY) - y * Number(calibration.yStepPx);
    put(math("rule-x-value"), fmt(x));
    put(math("rule-substitution"), `y = 2(${fmt(x)}) + 1 = ${fmt(y)}`);
    put(math("rule-point"), tuple([x, y]));
    put(math("rule-graph-desc"), `The marked point on y = 2x + 1 has input ${fmt(x)} and output ${fmt(y)}.`);
    attr(math("rule-marker"), { cx: px, cy: py });
    attr(math("rule-guides"), { d: `M${px} ${calibration.originY}V${py}H${calibration.originX}` });
  }
  ruleX.addEventListener("input", renderRule);
  math("inverse-form").addEventListener("submit", event => {
    event.preventDefault();
    const guess = math("inverse-guess");
    if (!guess.reportValidity()) return;
    const x = guess.valueAsNumber;
    ruleX.value = x;
    renderRule();
    put(math("inverse-feedback"), x === 3
      ? "Correct. 7 = 2x + 1, so 6 = 2x and x = 3. Substituting gives 2(3) + 1 = 7."
      : `That input gives ${fmt(rule(x))}. Subtract 1 from 7, then divide by 2 and try again.`);
  });

  // Original Math Space and checkout keep their own mathematical state.
  const space = math("space"), radius = Number(space.dataset.radius), tolerance = Number(space.dataset.lengthTolerance);
  const slider = [...axes].map(math), modeControl = math("mode"), angleControl = math("angle");
  const initial = slider.map(el => Number(el.defaultValue));
  const views = all("[data-math-view]", space);
  const presets = { reflected: [-3, 4, 0], depth: [3, 4, 2], origin };
  let point = initial, mode = "free", degrees = 0, view = "xy", reflection = "";
  let question = 0, checkedPoint = null, finished = false;
  const questions = all("[data-math-question]"), next = math("next-question");
  const checkoutFeedback = message => put(math("challenge-feedback"), message);
  const spaceFeedback = message => put(math("space-feedback"), "Lab assistant: " + message);
  let mainPlan, arcadePlan;

  function updateXY() {
    const [x, y, z] = point, { xyOriginX, xyOriginY, xyUnitPx } = space.dataset;
    const ox = Number(xyOriginX), oy = Number(xyOriginY), unit = Number(xyUnitPx);
    const px = ox + x * unit, py = oy - y * unit, isRadius = mode === "radius";
    const corner = Math.min(10, Math.abs(x * unit) / 2, Math.abs(y * unit) / 2);
    const show = (name, visible) => math("xy-" + name).toggleAttribute("hidden", !visible);
    const set = (name, values) => attr(math("xy-" + name), values);
    set("triangle", { d: `M${ox} ${oy}H${px}V${py}Z` });
    show("triangle", Boolean(x && y));
    set("component-x", { x2: px, y2: oy });
    set("component-y", { x1: px, y1: oy, x2: px, y2: py });
    show("component-x", Boolean(x));
    show("component-y", Boolean(y));
    set("right-angle", { d: `M${px - Math.sign(x) * corner} ${oy}v${-Math.sign(y) * corner}h${Math.sign(x) * corner}` });
    show("right-angle", corner >= 1);
    set("arrow", { x2: px, y2: py });
    show("arrow", Boolean(x || y));
    set("point", { cx: px, cy: py });
    set("point-label", { x: px + (x > 4 ? -22 : 22), y: py + (y > 4 ? 17 : -9) });
    put(math("xy-point-label"), z ? "Pxy" : x || y ? "P" : "O = P");
    show("radius-circle", isRadius);
    show("arc", isRadius && degrees > 0);
    show("angle-label", isRadius && degrees > 0);
    const arc = arcPoints(degrees, 38).map(([a, b]) => `${ox + a},${oy - b}`);
    set("arc", { d: "M" + arc.join("L") });
    const [ax, ay] = circular(degrees / 2, 52);
    set("angle-label", { x: ox + ax, y: oy - ay });
    put(math("xy-description"), `XY endpoint ${coordinates([x, y])}. Signed depth ${signed(z)}.`
      + (isRadius ? ` Radius 5 units. Counterclockwise turn ${degrees} degrees.` : ""));
  }

  function drawMath() {
    const [x, y, z] = point, isRadius = mode === "radius";
    const xy = [x, y, 0], xySquare = square(xy), squared = isRadius ? radius ** 2 : square(point);
    modeControl.value = mode;
    for (const name of ["free-controls", "reflection"]) math(name).hidden = isRadius;
    for (const name of ["radius-controls", "angle-readout"]) math(name).hidden = !isRadius;
    slider.forEach((el, i) => {
      if (!isRadius) el.value = point[i];
      attr(el, { "aria-valuetext": signed(point[i]) });
      put(math(axes[i] + "-value"), signed(point[i]));
    });
    angleControl.value = degrees;
    put(math("angle-value"), degrees + "°");
    put(math("mode-label"), isRadius ? "r = 5 · z = 0" : "Free coordinates");
    put(math("point"), coordinates(point));
    put(math("length-xy"), lengths(xy));
    put(math("length"), isRadius ? radius + " units" : lengths(point));
    put(math("depth"), signed(z));
    put(math("rxy-calc"), `${power(x)} + ${power(y)} ${approx(x) || approx(y) ? "≈" : "="} ${fmt(xySquare)} square units`);
    put(math("r-calc"), `${fmt(xySquare)} + ${power(z)} = ${fmt(squared)} square units`);
    put(math("angle-reading"), `${degrees}° ${radians(degrees)}${degrees === 360 ? " · one full turn" : ""}`);
    put(math("angle-x"), `${radius} cos(${degrees}°) ${approx(x) ? "≈" : "="} ${fmt(x)} units`);
    put(math("angle-y"), `${radius} sin(${degrees}°) ${approx(y) ? "≈" : "="} ${fmt(y)} units`);
    put(math("challenge-point"), `Current P ${coordinates(point).startsWith("≈") ? "" : "= "}${coordinates(point)} · Length ${isRadius ? "5 units" : lengths(point)}`);
    views.forEach(el => attr(el, { "aria-pressed": String(el.dataset.mathView === view) }));
    updateXY();
    const d = diagram(view, 7.5, view === "depth" ? 9 : 7.5);
    grid(d, 6);
    triangle(d, point);
    d.arrow(origin, point, colors.green);
    d.marker(point, colors.green, view === "xy" && z ? "Pxy" : "P");
    if (view === "depth" && z) d.marker(xy, colors.blue, "Pxy");
    if (isRadius) circularMarks(d, degrees, radius, point);
    mainPlan = d;
    refresh();
  }

  function setPoint(nextPoint) {
    if (checkedPoint && !finished && !same(checkedPoint, nextPoint)) {
      checkedPoint = null;
      next.hidden = true;
      checkoutFeedback("The point changed. Check the new point before finishing.");
    }
    point = nextPoint;
    drawMath();
  }

  slider.forEach((el, i) => {
    el.addEventListener("input", () => {
      if (mode === "free") setPoint(point.map((v, j) => i === j ? clean(el.valueAsNumber) : v));
    });
    el.addEventListener("change", () => {
      if (mode === "free") spaceFeedback(length(point) ? `Length ${lengths(point)}. The ${axes[i]} component is ${signed(point[i])}.`
        : "At the origin the length is zero. The zero vector has no direction.");
    });
  });
  modeControl.addEventListener("change", () => {
    mode = modeControl.value;
    if (mode === "radius") {
      degrees = 0;
      setPoint(circular(degrees, radius));
      spaceFeedback("The tip starts on +x. Turn it while the model length stays exactly 5.");
    } else {
      setPoint(point.map(v => rounded(v, 1)));
      spaceFeedback(`Free mode rounds the endpoint to the nearest tenth. The new length is ${lengths(point)}.`);
    }
  });
  function setAngle(value) {
    degrees = value;
    setPoint(circular(degrees, radius));
  }
  angleControl.addEventListener("input", () => { if (mode === "radius") setAngle(angleControl.valueAsNumber); });
  function announceAngle() {
    spaceFeedback(`${degrees}° ${radians(degrees)}. P ${coordinates(point)}. The length stays 5 units.`);
  }
  angleControl.addEventListener("change", () => { if (mode === "radius") announceAngle(); });
  const reflectionGuess = math("reflection-guess"), reflectionStatus = math("reflection-feedback");
  math("reflection-save").addEventListener("click", () => {
    reflection = reflectionGuess.value;
    put(reflectionStatus, reflection ? "Prediction saved. Try the reflected preset." : "Choose a prediction first.");
    if (!reflection) reflectionGuess.focus();
  });
  reflectionGuess.addEventListener("change", () => {
    reflection = "";
    put(reflectionStatus, "");
  });
  math("space-controls").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const { mathPoint, mathAngle, mathView } = button.dataset;
    if (mathPoint && mode === "free") {
      setPoint(presets[mathPoint]);
      if (mathPoint === "reflected") {
        const reason = "Both +3 and −3 square to 9. The reflected length is 5 units.";
        spaceFeedback(reason);
        if (reflection) put(reflectionStatus, (reflection === "same" ? "Your prediction matches. " : "Compare with the result. ") + reason);
      } else spaceFeedback(mathPoint === "depth"
        ? "The XY length is 5 units. Depth adds 4 square units, giving a total length of √29 ≈ 5.39 units."
        : "The tip is at the origin. Its length is zero and it has no direction.");
    } else if (mathAngle !== undefined && mode === "radius") {
      setAngle(Number(mathAngle));
      announceAngle();
    } else if (mathView) {
      view = mathView;
      drawMath();
      spaceFeedback("The view changed. The coordinates and length stayed the same.");
    }
  });
  math("reset").addEventListener("click", () => {
    mode = "free"; degrees = 0; view = "xy"; reflection = "";
    reflectionGuess.value = "";
    put(reflectionStatus, "");
    setPoint(initial);
    spaceFeedback("Back at (3, 4, 0) with length 5 units.");
  });

  const responses = [
    { same: "Correct. A sign change leaves x² at 9 and the length at 5 units.",
      negative: "Length is nonnegative. Try squaring −3 before finding the length.",
      longer: "The x component has the same magnitude. Compare the sums of squares." },
    { "positive-x": "That is the starting point at 0°. A quarter turn reaches +y.",
      "positive-y": "Correct. At 90°, cosine is zero and sine is one, so P = (0, 5, 0).",
      "negative-y": "A counterclockwise quarter turn from +x reaches +y. Try the 90° preset." }
  ];
  math("challenge-controls").addEventListener("click", event => {
    const button = event.target.closest("[data-math-answer]");
    if (!button || question > 1 || !questions[question].contains(button)) return;
    const answer = button.dataset.mathAnswer;
    checkoutFeedback(responses[question][answer]);
    next.hidden = answer !== ["same", "positive-y"][question];
  });
  math("check-point").addEventListener("click", () => {
    if (question !== 2 || finished) return;
    const distance = length(point), exact = close(distance, radius);
    checkedPoint = null;
    next.hidden = true;
    if (same(point, initial)) {
      checkoutFeedback("This is the starting point. Move the tip and check again.");
    } else if (Math.abs(distance - radius) > (mode === "radius" ? epsilon : tolerance + epsilon)) {
      checkoutFeedback(`The tip moved, and its length is ${lengths(point)}. Adjust the point or try fixed radius mode.`);
    } else {
      checkedPoint = point;
      next.hidden = false;
      checkoutFeedback(`Correct. The tip moved to ${coordinates(point)}. ${exact ? "The length is exactly 5 units in this model."
        : `Its length is ${lengths(point)}, within the ${tolerance}-unit free-mode tolerance.`}`);
    }
  });
  next.addEventListener("click", () => {
    if (next.hidden || finished) return;
    next.hidden = true;
    if (question === 2) {
      if (!checkedPoint) return;
      finished = true;
      math("challenge-controls").disabled = true;
      put(math("challenge-progress"), "Challenge complete");
      checkoutFeedback("You moved the tip while preserving its length to the precision of the lab.");
      math("bridge-title").focus();
      return;
    }
    questions[question++].hidden = true;
    questions[question].hidden = false;
    put(math("challenge-progress"), `Question ${question + 1} of 3`);
    checkoutFeedback(question === 2 ? "Move the tip in Math Space, then check the current point here." : "Choose an answer.");
    if (question === 2) put(next, "Finish challenge");
    q("h4", questions[question]).focus();
  });

  // Arcade input, records and progress. Each station owns its state and controls.
  const arcade = math("arcade"), select = id("arc-select");
  const figure = id("arc-apparatus-template").content.firstElementChild.cloneNode(true);
  const arcViewport = q("#arc-viewport", figure), arcSvg = q("#arc-diagram", figure);
  const complete = new Set(), missionCount = all("[data-mission]", arcade).length;
  const stations = {};
  const stop = Symbol("incomplete input");

  function station(key, defaults, configure) {
    const panel = q(`[data-station="${key}"]`);
    const state = defaults(), fields = Object.fromEntries(all("[name]", panel).map(el => [el.name, el]));
    const initialValues = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.value]));
    const read = name => q(`[data-readout="${name}"]`, panel);
    const out = (name, message) => put(read(name), message);
    const choose = name => {
      const el = fields[name];
      if (el.value) return el.value;
      el.focus();
      throw stop;
    };
    const num = name => {
      const el = fields[name];
      if (el.validity.valid && Number.isFinite(el.valueAsNumber)) return clean(el.valueAsNumber);
      el.reportValidity();
      el.focus();
      throw stop;
    };
    const pointIn = (prefix = "", plane = "xyz") => [...axes].map(a => plane.includes(a) ? num(prefix + a) : 0);
    const pointOut = p => p.forEach((v, i) => { fields[axes[i]].value = v; });
    const { draw, actions = {}, checks, changed, opened } = configure({ state, fields, read, out, choose, num, pointIn, pointOut });
    const redraw = () => {
      if (select.value === key) {
        arcadePlan = draw();
        if (canvas.parentElement === arcViewport) canvas.hidden = true;
        renderSVG(arcSvg, arcadePlan, false);
        put(q("figcaption", figure), arcadePlan.caption);
        refresh();
      }
    };
    panel.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || button.disabled || panel.hidden) return;
      const mission = button.closest("[data-mission]");
      const feedback = mission ? q(".arc-feedback", mission) : id("arc-reset-status");
      const handler = button.hasAttribute("data-check") ? checks[mission.dataset.mission] : actions[button.dataset.action];
      if (!handler) return;
      put(feedback, "");
      try {
        const result = handler();
        if (result) {
          const [passed, message] = result;
          put(feedback, message);
          if (button.hasAttribute("data-check") && passed) {
            const missionID = mission.dataset.mission;
            if (!complete.has(missionID)) {
              complete.add(missionID);
              q("[data-completion]", mission).hidden = false;
              put(id("arc-progress"), `${complete.size} of ${missionCount} missions completed this session.`);
            }
          }
        }
        redraw();
      } catch (error) {
        if (error !== stop) throw error;
        put(feedback, "Complete the highlighted field with a valid answer.");
      }
    });
    panel.addEventListener("input", event => {
      if (changed?.(event.target.name, event.target.value, event.type)) redraw();
    });
    panel.addEventListener("change", event => {
      if (changed?.(event.target.name, event.target.value, event.type)) redraw();
    });
    if (opened) for (const mission of all("[data-mission]", panel)) mission.addEventListener("toggle", () => {
      if (mission.open && opened(mission.dataset.mission)) redraw();
    });
    stations[key] = {
      panel, redraw,
      reset() {
        Object.assign(state, defaults());
        for (const [name, value] of Object.entries(initialValues)) fields[name].value = value;
        all(".arc-feedback", panel).forEach(el => put(el, ""));
        redraw();
      }
    };
  }
  const reply = (passed, yes, no) => [passed, passed ? "Correct. " + yes : no];
  const needs = message => [false, message];
  const world = (view = "xy", span = 6) => {
    const d = diagram(view, span, span * (view === "depth" ? 1.4 : 1.16));
    grid(d, span);
    return d;
  };
  const plain = caption => diagram("xy", 280, 170, caption);
  const at = (x, y, z = 0) => [x, y, z];

  station("function", () => ({ run: null, saved: null, ordered: false }), ({ state: s, fields, read, out, num, choose }) => {
    const run = x => {
      s.run = x;
      fields.x.value = x;
    };
    return {
      changed(name) {
        if (name === "x" && s.run !== null) {
          s.run = null;
          return true;
        }
        return false;
      },
      opened(mission) {
        if (mission !== "function-output") return false;
        s.run = null;
        return true;
      },
      actions: {
        run: () => run(num("x")),
        swap: () => { s.ordered = !s.ordered; },
        pin: () => { s.saved = num("x"); run(s.saved); }
      },
      checks: {
        "function-output"() {
          const x = num("x"), guess = num("guess");
          run(x);
          const detail = `${fmt(x)} × 2 = ${fmt(2 * x)}, then ${fmt(2 * x)} + 1 = ${fmt(rule(x))}.`;
          return reply(guess === rule(x), detail, `Your prediction was ${fmt(guess)}. Follow both steps. ${detail}`);
        },
        "function-inverse"() {
          const guess = num("inverse"), target = Number(choose("target")), y = rule(guess);
          run(guess);
          return reply(y === target, `Running ${fmt(guess)} forward gives ${fmt(target)}.`,
            `Your input gives ${fmt(y)}, and your target is ${fmt(target)}. Subtract 1 from the target and divide by 2.`);
        },
        "function-order"() {
          const domain = Array.from({ length: 9 }, (_, i) => i - 4);
          const matches = domain.every(x => (s.ordered ? 2 * x + 1 : 2 * (x + 1)) === rule(x));
          return reply(matches, "This order gives 2x + 1 at all nine inputs.",
            "Adding before multiplying gives 2(x + 1) = 2x + 2 at every input. Swap the operations.");
        },
        "function-delta"() {
          const x = num("x");
          if (s.saved === null) return needs("Save an input first.");
          if (s.saved === x) return needs("Choose a different input.");
          run(x);
          return [true, `${tuple([s.saved, rule(s.saved)])} to ${tuple([x, rule(x)])}. Δx = ${fmt(x - s.saved)} and Δy = ${fmt(rule(x) - rule(s.saved))}, which is twice Δx.`];
        }
      },
      draw() {
        const [first, second] = read("order").children;
        put(first, s.ordered ? "Multiply by 2" : "Add 1");
        put(second, s.ordered ? "Add 1" : "Multiply by 2");
        const x = s.run, y = x === null ? null : rule(x);
        out("machine", x === null ? "Set an input and run the machine to see both stages."
          : `Input ${fmt(x)} · ×2 gives ${fmt(2 * x)} · +1 gives ${fmt(y)} · Graph point ${tuple([x, y])}`);
        out("baseline", s.saved === null ? "No input saved." : `Saved pair ${tuple([s.saved, rule(s.saved)])}.`);
        const d = plain("Function machine and linked graph");
        const stations = [at(-195, 110), at(0, 110), at(195, 110)];
        ["Input", "× 2", "+ 1"].forEach((label, i) => {
          const p = stations[i], value = x === null ? "" : " · " + fmt([x, 2 * x, y][i]);
          d.block(p, 125, 44, [colors.blue, colors.orange, colors.green][i]);
          d.label(p, label + value, colors.ink);
          if (i < 2) d.arrow(add(p, at(64, 0)), add(stations[i + 1], at(-64, 0)), colors.gold);
        });
        const plot = (i, j) => at(i * 49, j * 8 - 25);
        chartAxes(d, plot, 4, 10);
        if (x !== null) {
          d.line([plot(-4, -7), plot(4, 9)], colors.blue);
          d.line([plot(x, 0), plot(x, y), plot(0, y)], colors.violet, true);
          d.marker(plot(x, y), colors.green, tuple([x, y]));
        }
        return d;
      }
    };
  });

  station("equation", () => ({ sign: 1, eq: [2, 1, 7, 1], step: "No operations applied." }), ({ state: s, out, num, choose }) => {
    const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
    const fraction = (n, d) => d === 1 ? fmt(n) : fmt(n / gcd(n, d)) + "/" + fmt(d / gcd(n, d));
    const left = ([a, b, , d]) => (a === d ? "x" : a === -d ? "−x" : fraction(a, d) + "x")
      + (b ? ` ${b < 0 ? "−" : "+"} ${fraction(Math.abs(b), d)}` : "");
    const right = ([, , c, d]) => fraction(c, d);
    const equation = eq => `${left(eq)} = ${right(eq)}`;
    const restart = puzzle => {
      s.sign = puzzle === "positive" ? 1 : -1;
      s.eq = [2 * s.sign, 1, 7, 1];
      s.step = "No operations applied.";
    };
    const isolate = sign => {
      const [a, b, , d] = s.eq;
      if (s.sign !== sign) return needs("Select the matching puzzle first.");
      return reply(a === d && b === 0, `${equation(s.eq)}. Both sides stayed equivalent.`,
        `${equation(s.eq)}. Use the same operations on both sides until only x remains on the left.`);
    };
    return {
      changed(name, value, type) {
        if (name !== "puzzle" || type !== "change") return false;
        restart(value);
        return true;
      },
      actions: {
        restart: () => restart(choose("puzzle")),
        apply() {
          const quantity = num("amount"), op = choose("operation"), before = s.eq;
          let [a, b, c, d] = before;
          if ((op === "multiply" || op === "divide") && !quantity) {
            s.step = `Use a nonzero multiplier or divisor. The equation stays ${equation(before)}.`;
            return;
          }
          if (op === "add" || op === "subtract") {
            const change = d * quantity * (op === "add" ? 1 : -1);
            b += change;
            c += change;
          } else if (op === "multiply") {
            a *= quantity; b *= quantity; c *= quantity;
          } else d *= quantity;
          const divisor = Math.sign(d) * [a, b, c, d].reduce(gcd);
          const after = [a, b, c, d].map(v => v / divisor);
          if (after.some(v => Math.abs(v) > 1e6)) {
            s.step = "This step would exceed the fraction limit. Try a smaller operation or restart the puzzle.";
            return;
          }
          s.eq = after;
          s.step = `${equation(before)} → ${equation(after)}. Applied ${op} ${fmt(quantity)} to both sides.`;
        }
      },
      checks: {
        "equation-positive": () => isolate(1),
        "equation-negative": () => isolate(-1),
        "equation-error": () => reply(choose("error") === "2", "Step 2 divides only the left side. Divide 6 by 2 as well to get x = 3.",
          "Check the division in step 2. Both sides must be divided by 2."),
        "equation-verify"() {
          const x = num("proposed"), a = 2 * s.sign, lhs = a * x + 1;
          const evidence = `${fmt(a)}(${fmt(x)}) + 1 = ${fmt(lhs)}. The original right side is 7.`;
          return reply(lhs === 7, evidence, evidence + " Try a value that makes the two sides equal.");
        }
      },
      draw() {
        const d = plain("Equation balance · equal algebraic sides");
        d.block(at(0, -58), 390, 14, colors.blue);
        d.polygon([at(-44, -136), at(44, -136), at(0, -64)], colors.violet, 0.75);
        for (const [label, expression, x, color] of [["Left side", left(s.eq), -118, colors.orange], ["Right side", right(s.eq), 118, colors.green]]) {
          d.block(at(x, 30), 190, 95, color);
          d.label(at(x, 56), label, colors.ink);
          d.label(at(x, 18), expression, colors.ink);
        }
        d.label(at(0, 31), "=", colors.gold);
        out("equation", "Current equation · " + equation(s.eq));
        out("steps", s.step);
        return d;
      }
    };
  });

  station("coordinate", () => ({ p: origin, view: "xy", target: [-2, 3, 1], saved: null, prior: null }),
    ({ state: s, out, choose, pointIn, pointOut }) => {
      const plot = () => { s.p = pointIn(); s.prior = null; };
      const target = goal => {
        plot();
        s.target = goal;
        const distance = length(subtract(s.p, goal));
        return reply(close(distance, 0), `All three coordinates match ${tuple(goal)}.`,
          `Marker ${tuple(s.p)} is ${numberText(distance)} units from the target in 3D. Check all three coordinates.`);
      };
      return {
        changed: (name, value, type) => changeView(s, name, value, type),
        opened(mission) {
          if (mission !== "coordinate-clue" && mission !== "coordinate-negative") return false;
          s.target = mission === "coordinate-clue" ? [4, 2, -3] : [-2, 3, 1];
          return true;
        },
        actions: {
          plot,
          "pin-shadow": () => { plot(); s.saved = s.p; }
        },
        checks: {
          "coordinate-negative": () => target([-2, 3, 1]),
          "coordinate-clue": () => target([4, 2, -3]),
          "coordinate-shadow"() {
            if (!s.saved) return needs("Save the first point.");
            plot();
            return compareProjection(s.saved, s.p, "xy");
          },
          "coordinate-depth"() {
            const guess = choose("depth-guess");
            const before = pointIn(), after = add(before, at(0, 0, before[2] < 5 ? 1 : -1));
            s.prior = before;
            s.p = after;
            pointOut(after);
            const result = `P moves from ${tuple(before)} to ${tuple(after)}. Pxy stays ${tuple(projection(after, "xy"))}.`;
            return reply(guess === "point", result, result + " Only z changed.");
          }
        },
        draw() {
          const d = world(s.view);
          d.caption = `Treasure hunt · ${viewName(s.view)} projection`;
          d.marker(s.target, colors.gold, "Target", true);
          if (s.prior) d.marker(s.prior, colors.blue, "Before");
          d.line([origin, s.p], colors.green);
          d.marker(s.p, colors.green, "Marker");
          out("point", `Marker · ${tuple(s.p)} · ${viewName(s.view)} view`);
          out("shadow", s.saved ? `Saved ${tuple(s.saved)} · XY shadow ${tuple(projection(s.saved, "xy"))}` : "No point saved.");
          return d;
        }
      };
    });
  function changeView(state, name, value, type) {
    if (name !== "view" || type !== "change" || value === state.view) return false;
    state.view = value;
    return true;
  }
  function compareProjection(a, b, plane) {
    const before = projection(a, plane), after = projection(b, plane);
    const evidence = `${tuple(a)} and ${tuple(b)} give ${viewName(plane)} shadows ${tuple(before)} and ${tuple(after)}.`;
    return reply(!same(a, b) && same(before, after), evidence,
      evidence + " Change just the omitted coordinate.");
  }

  station("vector", () => ({ a: [3, 4, 0], b: origin, saved: null, reference: false }),
    ({ state: s, out, pointIn }) => {
      const reference = [1, -1, 0];
      const plot = () => {
        const a = pointIn("a"), b = pointIn("b");
        s.a = a; s.b = b;
      };
      return {
        actions: { plot, pin() {
          plot();
          if (!length(s.a)) return needs("Choose a nonzero arrow to save.");
          s.saved = s.a;
          return [false, `Saved A = ${tuple(s.a)}.`];
        } },
        opened(mission) { s.reference = mission === "vector-opposite"; return true; },
        checks: {
          "vector-five"() {
            plot();
            return reply(same(s.a, [3, 4, 0]), "3² + 4² = 25, so A has magnitude 5 units.", `A is ${tuple(s.a)}. Set (3, 4, 0).`);
          },
          "vector-add"() {
            plot();
            const result = add(s.a, s.b), evidence = `${tuple(s.a)} + ${tuple(s.b)} = ${tuple(result)}.`;
            return reply(Boolean(length(s.a) && length(s.b)) && same(result, [3, 1, 1]), evidence,
              evidence + " Use two nonzero arrows that sum to (3, 1, 1).");
          },
          "vector-opposite"() {
            plot();
            s.reference = true;
            const cosine = direction(s.a, reference);
            return reply(cosine !== null && close(cosine, -1), `${tuple(s.a)} is a negative multiple of the reference.`,
              "Try (−1, 1, 0) or another negative multiple of (1, −1, 0). Zero has no direction.");
          },
          "vector-equal"() {
            plot();
            if (!s.saved) return needs("Save a nonzero arrow first.");
            const cosine = direction(s.saved, s.a), evidence = `Saved ${tuple(s.saved)} has length ${lengths(s.saved)}. Current ${tuple(s.a)} has length ${lengths(s.a)}.`;
            return reply(cosine !== null && !close(cosine, 1) && close(square(s.saved), square(s.a)),
              evidence + " The directions differ.", evidence + " Match the lengths and turn the arrow to a different direction.");
          }
        },
        draw() {
          const sum = add(s.a, s.b), d = world("depth", spanFor([s.a, s.b, sum, s.saved || origin]));
          d.caption = "Tail-to-tip vector addition";
          if (s.saved) labeledArrow(d, origin, s.saved, colors.violet, "Saved A");
          if (s.reference) labeledArrow(d, origin, reference, colors.gold, "Reference R");
          labeledArrow(d, origin, sum, colors.green, "A+B");
          labeledArrow(d, origin, s.a, colors.blue, "A");
          labeledArrow(d, s.a, sum, colors.orange, "B");
          out("arrows", `A = ${tuple(s.a)}, length ${lengths(s.a)}. B = ${tuple(s.b)}, length ${lengths(s.b)}. A + B = ${tuple(sum)}, length ${lengths(sum)}.`);
          out("baseline", s.saved ? `Saved A = ${tuple(s.saved)} · Length ${lengths(s.saved)}` : "No arrow saved.");
          return d;
        }
      };
    });

  station("power", () => ({ p: [3, 4, 0], view: "xy", reflected: null }),
    ({ state: s, out, choose, pointIn }) => {
      const plot = () => { s.p = pointIn(); s.reflected = null; };
      return {
        changed: (name, value, type) => changeView(s, name, value, type),
        actions: { plot },
        checks: {
          "power-triangle"() {
            plot();
            const [a, b] = s.p.slice(0, 2).map(Math.abs).sort((x, y) => x - y);
            return reply(a === 3 && b === 4 && s.p[2] === 0, "9 + 16 = 25 square units. The diagonal is 5 units.",
              `The XY legs measure ${a} and ${b}. Set their lengths to 3 and 4, with no depth.`);
          },
          "power-reflect"() {
            const guess = choose("reflection");
            plot();
            const [x, y, z] = s.p;
            if (!x) return needs("Give x a nonzero value so the tip visibly moves.");
            s.reflected = [-x, y, z];
            const evidence = `${tuple(s.p)} becomes ${tuple(s.reflected)}. Both lengths are ${lengths(s.p)}.`;
            return reply(guess === "same", evidence, evidence + " Squaring x gives the same result after the sign flip.");
          },
          "power-depth"() {
            plot();
            const area = square(s.p);
            return reply(s.p[2] !== 0 && area === 29, "The squared length is 29 square units, so the length is √29 units.",
              `${tuple(s.p)} gives ${area} square units. Try a nonzero z and aim for 29.`);
          },
          "power-sign"() {
            const axis = choose("axis"), guess = choose("sign-rule");
            plot();
            const index = axes.indexOf(axis), component = s.p[index];
            if (!component) return needs("Choose a nonzero coordinate for the sign flip.");
            s.reflected = s.p.map((v, i) => i === index ? -v : v);
            const evidence = `${power(component)} = ${power(-component)} = ${component ** 2} square units.`;
            return reply(guess === "square", evidence, evidence + " In the negative case, two negative factors give a positive product.");
          }
        },
        draw() {
          const [x, y, z] = s.p, d = world(s.view);
          d.caption = s.view === "xy" ? "XY triangle and squared lengths" : "Perpendicular XY and depth triangles";
          triangle(d, s.p, true);
          labeledArrow(d, origin, s.p, colors.green, s.view === "xy" && z ? "Pxy" : "P");
          if (s.reflected) labeledArrow(d, origin, s.reflected, colors.violet, "Reflected");
          out("areas", `P = ${tuple(s.p)} · XY squares ${x ** 2} + ${y ** 2} = ${x ** 2 + y ** 2} square units · Depth square ${z ** 2} square units · Full square ${square(s.p)} square units · Length ${lengths(s.p)}`);
          return d;
        }
      };
    });

  station("circle", () => ({ r: 1, degrees: 0, rotation: null, pair: null }),
    ({ state: s, out, num, choose }) => {
      const plot = () => {
        const r = num("radius"), degrees = num("angle");
        s.r = r; s.degrees = degrees;
      };
      const trig = a => {
        const [c, t] = circular(a);
        return `cos θ ${approx(c, 4) ? "≈" : "="} ${fmt(c, 4)} · sin θ ${approx(t, 4) ? "≈" : "="} ${fmt(t, 4)}`;
      };
      return {
        actions: {
          plot,
          "pin-rotation"() { plot(); s.rotation = [s.r, s.degrees]; },
          "pin-pair"() { plot(); s.pair = s.degrees; }
        },
        checks: {
          "circle-top"() {
            plot();
            return reply(s.r === 1 && s.degrees === 90, "At 90° the unit radius points to (0, 1).", "Use radius 1 and a quarter turn from +x.");
          },
          "circle-quadrant"() {
            plot();
            const [x, y] = circular(s.degrees);
            return reply(x < -epsilon && y > epsilon, `${s.degrees}° lies strictly in quadrant II. ${trig(s.degrees)}.`,
              "Choose an angle between 90° and 180°, with neither boundary included.");
          },
          "circle-pi": () => reply(choose("radians") === "pi", "A half turn is 180° = π radians.", "A full turn is 2π radians. Divide by two."),
          "circle-rotate"() {
            plot();
            if (!s.rotation) return needs("Save the starting radius and endpoint.");
            const [r, a] = s.rotation, before = circular(a, r), after = circular(s.degrees, s.r);
            const text = `${coordinates(before.slice(0, 2))} to ${coordinates(after.slice(0, 2))}. Radius ${r} to ${s.r} units.`;
            return reply(r === s.r && !same(before, after), text, text + " Use the same radius and reach a different endpoint.");
          },
          "circle-pair"() {
            plot();
            if (s.pair === null) return needs("Save a first angle.");
            const [a, b] = [circular(s.pair), circular(s.degrees)];
            const text = `${s.pair}°: ${trig(s.pair)}. ${s.degrees}°: ${trig(s.degrees)}.`;
            return reply(close(a[0], b[0]) && !close(a[1], b[1]), text, text + " Match cosine while changing sine.");
          }
        },
        draw() {
          const p = circular(s.degrees, s.r), d = world("xy", s.r + 1);
          d.caption = "Circular coordinates · positive angles turn counterclockwise";
          circularMarks(d, s.degrees, s.r, p);
          d.line([origin, at(p[0], 0), p], colors.blue, true);
          labeledArrow(d, origin, p, colors.green, "P");
          if (s.rotation?.[0] === s.r) d.marker(circular(s.rotation[1], s.r), colors.violet, "Saved", true);
          out("trig", `${s.degrees}° ${radians(s.degrees)} · ${trig(s.degrees)} · Endpoint ${coordinates(p.slice(0, 2), 4)} · Radius ${s.r} ${s.r === 1 ? "unit" : "units"}`);
          out("rotation", s.rotation ? `Saved radius ${s.rotation[0]}, angle ${s.rotation[1]}°, endpoint ${coordinates(circular(s.rotation[1], s.rotation[0]).slice(0, 2))}.` : "No endpoint saved.");
          out("angle-pair", s.pair === null ? "No angle saved." : `Saved ${s.pair}° · ${trig(s.pair)}`);
          return d;
        }
      };
    });

  station("projection", () => ({ p: [3, 4, 2], view: "depth", revealed: false, xy: null, camera: null, plane: null }),
    ({ state: s, fields, out, choose, pointIn }) => {
      function conceal() {
        s.revealed = false;
        put(q('[data-mission="projection-xz"] .arc-feedback'), "");
        if (s.view === "xz") s.view = "depth";
      }
      const plot = () => {
        const p = pointIn();
        if (!same(p, s.p)) conceal();
        s.p = p;
      };
      return {
        changed(name, value, type) {
          if (name && axes.includes(name) && name.length === 1 && s.revealed) {
            conceal();
            return true;
          }
          return changeView(s, name, value, type);
        },
        actions: {
          plot,
          "pin-xy"() { plot(); s.xy = s.p; },
          "pin-camera"() { plot(); s.camera = { p: s.p, view: s.view }; },
          "pin-plane"() { const key = choose("plane"); plot(); s.plane = { key, p: s.p }; }
        },
        checks: {
          "projection-xy"() {
            plot();
            return s.xy ? compareProjection(s.xy, s.p, "xy") : needs("Save a point first.");
          },
          "projection-xz"() {
            const guess = pointIn("guess-");
            plot();
            s.revealed = true;
            const p = projection(s.p, "xz"), text = `Pxz = ${tuple(p)}. XZ retains x and z and sets y to zero.`;
            return reply(same(guess, p), text, `Your prediction was ${tuple(guess)}. ${text}`);
          },
          "projection-camera"() {
            if (!s.camera) return needs("Save the point and view first.");
            const { p, view } = s.camera;
            const evidence = `${viewName(view)} view showed P = ${tuple(p)}. ${viewName(s.view)} view shows P = ${tuple(s.p)}.`;
            return reply(view !== s.view && same(p, s.p), evidence + " Only the camera changed.",
              evidence + " Keep P fixed and select a different view.");
          },
          "projection-preserve"() {
            plot();
            if (!s.plane) return needs("Save a point and plane first.");
            const { p, key } = s.plane;
            if (key !== choose("plane")) return needs("Save a baseline for the plane you selected.");
            if (key !== "xz" || s.revealed) return compareProjection(p, s.p, key);
            const equal = same(projection(p, key), projection(s.p, key));
            return reply(!same(p, s.p) && equal, "Only y changed. The XZ projection stays the same.",
              "Change y while keeping x and z fixed. The XZ coordinates remain hidden for the prediction.");
          }
        },
        draw() {
          const d = world(s.view), visible = s.revealed ? ["xy", "xz", "yz"] : ["xy", "yz"];
          const entries = visible.map(key => [key, projection(s.p, key)]);
          const xz = [...fields.view.options].find(el => el.value === "xz");
          xz.disabled = !s.revealed;
          fields.view.value = s.view;
          d.caption = `Orthogonal projections · ${viewName(s.view)} view`;
          entries.forEach(([key, p]) => {
            const color = { xy: colors.blue, xz: colors.gold, yz: colors.violet }[key];
            d.line([p, s.p], color, true);
            d.marker(p, color, "P" + key, true);
          });
          d.marker(s.p, colors.green, "P");
          out("projections", `P = ${tuple(s.p)} · ${entries.map(([key, p]) => "P" + key + " = " + tuple(p)).join(" · ")}` +
            (s.revealed ? "" : " · XZ view and shadow unlock after your prediction."));
          out("xy-pair", s.xy ? `Saved ${tuple(s.xy)} with XY shadow ${tuple(projection(s.xy, "xy"))}.` : "No point saved.");
          out("camera", s.camera ? `Saved ${tuple(s.camera.p)} in ${viewName(s.camera.view)} view.` : "No view saved.");
          out("plane", s.plane ? `Saved ${tuple(s.plane.p)} for the ${viewName(s.plane.key)} comparison.` : "No plane saved.");
          return d;
        }
      };
    });

  station("transform", () => ({ p: [3, 4, 0], result: null, op: "", scale: 1, rotated: null }),
    ({ state: s, fields, out, choose, num, pointIn }) => {
      const getPoint = () => pointIn("", "xy");
      const describe = (p, label) => `${label} ${tuple(p.slice(0, 2))} · Length ${lengths(p)}`;
      function apply(op, p, factor = 1) {
        s.p = p;
        s.op = op;
        s.scale = factor;
        s.result = op === "reflect" ? [-p[0], p[1], 0] : op === "rotate" ? [-p[1], p[0], 0] : scale(p, factor);
      }
      const ready = op => s.result && same(getPoint(), s.p) && (!op || s.op === op)
        && (s.op !== "scale" || num("factor") === s.scale);
      return {
        changed(name) {
          if (name !== "x" && name !== "y") return false;
          if (s.op === "rotate") s.result = null;
          s.rotated = null;
          put(q('[data-mission="transform-rotate"] .arc-feedback'), "");
          return true;
        },
        actions: {
          apply() {
            const op = choose("type"), p = getPoint();
            if (op === "rotate" && (!s.rotated || !same(p, s.rotated))) {
              return needs("Open the quarter-turn mission and enter your prediction before applying rotation.");
            }
            apply(op, p, op === "scale" ? num("factor") : 1);
          }
        },
        checks: {
          "transform-reflect"() {
            if (!ready("reflect")) return needs("Apply the y-axis reflection to the current arrow.");
            return reply(s.p[0] !== 0 && s.result[0] === -s.p[0] && s.result[1] === s.p[1],
              "Only x changes sign. The distance from the origin stays the same.", "Give x a nonzero value and reapply the reflection.");
          },
          "transform-rotate"() {
            const p = getPoint(), guess = pointIn("guess-", "xy");
            if (!length(p)) return needs("Choose a nonzero starting arrow.");
            s.rotated = p;
            fields.type.value = "rotate";
            apply("rotate", p);
            const text = `A +90° turn maps ${tuple(p.slice(0, 2))} to ${tuple(s.result.slice(0, 2))}, by (x, y) → (−y, x).`;
            return reply(same(guess, s.result), text, `Your prediction was ${tuple(guess.slice(0, 2))}. ${text}`);
          },
          "transform-scale"() {
            if (!ready("scale")) return needs("Apply the selected scaling to the current arrow.");
            const cosine = direction(s.p, s.result);
            return reply(s.scale > 0 && s.scale !== 1 && cosine !== null && close(cosine, 1) && !close(length(s.p), length(s.result)),
              `A positive scale of ${s.scale} preserves direction and changes the length to ${lengths(s.result)}.`,
              "Use a nonzero arrow and a positive factor other than 1.");
          },
          "transform-length"() {
            if (!ready()) return needs("Apply a transformation to the current arrow first.");
            const cosine = direction(s.p, s.result);
            return reply(cosine !== null && !close(cosine, 1) && close(square(s.p), square(s.result)),
              `The ${{ reflect: "reflection", rotate: "rotation", scale: "scaling" }[s.op]} changes direction while preserving length ${lengths(s.p)}.`,
              "Both arrows need a direction. Compare lengths and choose a transformation that turns the arrow.");
          }
        },
        draw() {
          const d = world("xy", spanFor([s.p, s.result || origin]));
          d.caption = "Transformations about O · XY plane";
          labeledArrow(d, origin, s.p, colors.blue, "Original");
          if (s.result) labeledArrow(d, origin, s.result, colors.green, "Transformed");
          out("transform", describe(s.p, "Original") + (s.result ? " · " + describe(s.result, "Transformed") : ". Apply a transformation to compare."));
          return d;
        }
      };
    });

  station("graph", () => ({ m: 0, b: 0, output: null, ab: false }), ({ state: s, out, read, num, choose }) => {
    const learner = x => s.m * x + s.b;
    function plot() {
      const m = num("m"), b = num("b");
      if (m !== s.m || b !== s.b) s.output = null;
      s.m = m; s.b = b; s.ab = false;
    }
    return {
      actions: {
        plot,
        "show-ab"() { s.ab = true; },
        "set-output"() {
          const choice = choose("output-mode"), x = choice === "reachable" ? num("trial-x") : null;
          plot();
          s.output = x === null ? Number(choice) : learner(x);
        }
      },
      changed(name) {
        if (!["m", "b", "output-mode", "trial-x"].includes(name) || s.output === null) return false;
        s.output = null;
        return true;
      },
      checks: {
        "graph-match"() {
          plot();
          return reply(s.m === 2 && s.b === 1, "Slope and intercept match. The two rules agree throughout the domain.",
            "Read the target output at x = 0 for the intercept. Use two points to find its output change per unit input.");
        },
        "graph-decrease"() {
          plot();
          const evidence = `y at −2 is ${fmt(learner(-2))}. y at 2 is ${fmt(learner(2))}.`;
          return reply(learner(2) < learner(-2), evidence + " The slope is negative.", evidence + " Choose a negative slope.");
        },
        "graph-inverse"() {
          plot();
          if (s.output === null) return needs("Choose an output for the current line first.");
          const guess = choose("solution"), y = s.output;
          if (s.m === 0) {
            const all = y === s.b, evidence = `The line is horizontal at y = ${fmt(s.b)}. ${all
              ? "Every x in the domain works." : "No x in the domain gives that output."}`;
            return reply(guess === (all ? "all" : "none"), evidence, evidence);
          }
          const x = (y - s.b) / s.m;
          if (Math.abs(x) > 4) return reply(guess === "none", "The inverse input lies outside −4 ≤ x ≤ 4.",
            `Solving gives x ${numberText(x, 4)}, outside −4 ≤ x ≤ 4.`);
          const evidence = `Subtract the intercept, then divide by the slope. x ${approx(x, 4) ? "≈" : "="} ${fmt(x, 4)}.`;
          const match = guess === "one" && Math.abs(num("inverse-x") - x) <= 0.001 + epsilon;
          return reply(match, evidence, evidence + " Enter the solution within 0.001.");
        },
        "graph-equations"() {
          const a = choose("match-a"), b = choose("match-b");
          s.ab = true;
          return reply(a === "a" && b === "b", "Graph A rises by 2 per unit and crosses at 1. Graph B falls by 1 per unit and crosses at 2.",
            "Compare intercepts at x = 0 and the direction of each line as x increases.");
        }
      },
      draw() {
        const name = `y = ${s.m ? (s.m === 1 ? "" : s.m === -1 ? "−" : fmt(s.m)) + "x" : ""}`
          + (s.m && s.b ? (s.b < 0 ? " − " : " + ") + fmt(Math.abs(s.b)) : !s.m ? fmt(s.b) : "");
        out("rule", `Learner line · ${name} · Domain −4 ≤ x ≤ 4`);
        out("output", s.output === null ? "Choose an output before checking." : `Selected output y = ${fmt(s.output)}.`);
        [...read("samples").rows].forEach((row, i) => put(row.cells[1], fmt(learner(2 * (i - 1)))));
        const d = plain(s.ab ? "Two comparison lines · A solid, B dashed" : "Learner line solid · Target dashed");
        const to = (x, y) => at(x * 50, y * 6.25);
        chartAxes(d, to, 4, 24);
        const lines = s.ab ? [[rule, colors.blue, "A"], [x => 2 - x, colors.violet, "B"]]
          : [[learner, colors.green, "Learner"], [rule, colors.violet, "Target"]];
        lines.forEach(([fn, color, label], i) => {
          d.line([to(-4, fn(-4)), to(4, fn(4))], color, Boolean(i));
          d.label(add(to(4, fn(4)), at(35, i ? -10 : 10)), label, color);
        });
        return d;
      }
    };
  });

  station("change", () => ({ before: { p: [3, 4, 0], view: "xy" }, p: [-3, 4, 0], view: "xy", turn: null }),
    ({ state: s, out, num, choose, pointIn, pointOut }) => {
      const plot = () => { s.p = pointIn(); s.turn = null; };
      return {
        changed(name, value, type) {
          if (!changeView(s, name, value, type)) return false;
          s.turn = null;
          return true;
        },
        actions: { plot, pin() { s.turn = null; s.before = { p: s.p, view: s.view }; } },
        checks: {
          "change-length"() {
            const guess = choose("reflection");
            plot();
            const moved = !same(s.p, s.before.p), sameLength = close(square(s.p), square(s.before.p));
            if (!moved || !sameLength) return needs("Move the tip to a different point with the same length as the saved arrow.");
            return reply(guess === "tip", "In the example x changes sign, the tip moves, and the direction changes. The length stays 5 units.",
              "The example changes the sign of x, the tip, and the direction while keeping the length fixed.");
          },
          "change-direction"() {
            const factor = num("factor");
            if (factor === 1 || !length(s.before.p)) return needs("Choose a nonzero saved arrow and a positive factor other than 1.");
            s.p = scale(s.before.p, factor);
            s.turn = null;
            const canCopy = s.p.every(v => Number.isInteger(v) && Math.abs(v) <= 5);
            if (canCopy) pointOut(s.p);
            return [true, `Positive scale ${factor} preserves direction. Length changes from ${lengths(s.before.p)} to ${lengths(s.p)}.`
              + (canCopy ? "" : " The scaled point is in the comparison. The integer inputs are available for your next plot.")];
          },
          "change-camera"() {
            const guess = choose("camera"), before = s.before;
            const text = `Before ${viewName(before.view)} ${tuple(before.p)}. After ${viewName(s.view)} ${tuple(s.p)}.`;
            if (before.view === s.view || !same(before.p, s.p)) return needs(text + " Save the point, then change only the view.");
            return reply(guess === "view", text + " The view changed and the mathematical arrow stayed fixed.",
              text + " Only the view changed.");
          },
          "change-turn"() {
            const a = num("angle-a"), b = num("angle-b"), p = circular(a), q = circular(b);
            s.turn = { a, b, p, q };
            const evidence = `${a}° gives ${coordinates(p.slice(0, 2))} and ${b}° gives ${coordinates(q.slice(0, 2))}.`;
            return reply(Math.abs(a - b) === 360 && same(p, q), evidence + " One full turn returns to the same endpoint.",
              evidence + " Choose angles exactly 360° apart.");
          }
        },
        draw() {
          const { p, view } = s.before, turn = s.turn;
          const d = turn ? world("xy", 2) : world(s.view, spanFor([p, s.p]));
          d.caption = turn ? "One-turn comparison on the unit circle" : "Before and after arrows in the current view";
          if (turn) {
            d.line(arcPoints(360, 1), colors.axis, true);
            labeledArrow(d, origin, turn.p, colors.blue, turn.a + "°");
            labeledArrow(d, origin, turn.q, colors.gold, same(turn.p, turn.q) ? turn.a + "° / " + turn.b + "°" : turn.b + "°");
          } else {
            labeledArrow(d, origin, p, colors.blue, "Before");
            labeledArrow(d, origin, s.p, colors.green, "After");
          }
          out("before", `${coordinates(p)} · ${lengths(p)} · ${viewName(view)} view`);
          out("after", `${coordinates(s.p)} · ${lengths(s.p)} · ${viewName(s.view)} view`);
          return d;
        }
      };
    });

  // A drawing plan drives the shared WebGL scene and its SVG equivalent.
  function diagram(view, width, height, caption = "Coordinate view") {
    const basis = {
      xy: [[1, 0, 0], [0, 1, 0]],
      xz: [[1, 0, 0], [0, 0, 1]],
      yz: [[0, 1, 0], [0, 0, 1]],
      depth: [[0.8, 0, -0.6], [-0.24, Math.sqrt(0.84), -0.32]]
    };
    const [right, up] = basis[view];
    const halfX = Math.max(width, height * 560 / 340), halfY = halfX * 340 / 560;
    const marks = [], labels = [];
    const project = p => [280 + dot(p, right) * 280 / halfX, 170 - dot(p, up) * 170 / halfY];
    const label = (p, text, color = colors.ink, dx = 0, dy = 0) => labels.push({ p, text, color, dx, dy });
    return {
      marks, labels, project, label, caption, view, right, up, halfX, halfY,
      line(points, color, dash = false) { marks.push({ kind: "line", points, color, dash }); },
      polygon(points, color, opacity = 0.27) { marks.push({ kind: "polygon", points, color, opacity }); },
      arrow(a, b, color) {
        if (!same(a, b)) marks.push({ kind: "arrow", a, b, color });
      },
      marker(p, color, name, diamond = false) {
        marks.push({ kind: "marker", p, color, diamond });
        if (name) label(p, name, color, 12, -10);
      },
      block(p, w, h, color) { marks.push({ kind: "block", p, w, h, color }); }
    };
  }
  function spanFor(points) { return Math.max(6, ...points.flat().map(Math.abs)); }

  function grid(d, radius) {
    const plane = d.view === "depth" ? "xy" : d.view;
    const [u, v] = [...plane].map(c => axes.indexOf(c));
    const on = (a, b) => origin.map((_, i) => i === u ? a : i === v ? b : 0);
    const step = radius <= 6 ? 1 : Math.ceil(radius / 5);
    for (let i = step; i <= radius; i += step) for (const n of [-i, i]) {
      d.line([on(-radius, n), on(radius, n)], colors.grid);
      d.line([on(n, -radius), on(n, radius)], colors.grid);
      d.label(on(n, 0), fmt(n), colors.axis, 0, 14);
      if (n === i && i >= radius - step) d.label(on(0, n), fmt(n), colors.axis, -13);
    }
    d.arrow(on(-radius, 0), on(radius, 0), colors.axis);
    d.arrow(on(0, -radius), on(0, radius), colors.axis);
    d.label(on(radius, 0), "+" + axes[u], colors.ink, 11);
    d.label(on(0, radius), "+" + axes[v], colors.ink, 8, -7);
    if (d.view === "depth") {
      d.arrow(at(0, 0, -radius), at(0, 0, radius), colors.violet);
      d.label(at(0, 0, radius), "+z", colors.violet, 10, -6);
    }
    d.label(origin, "O", colors.ink, -9, 13);
  }

  function chartAxes(d, to, xMax, yMax) {
    const yStep = yMax > 12 ? 6 : 5;
    for (let y = -Math.floor(yMax / yStep) * yStep; y <= yMax; y += yStep) {
      d.line([to(-xMax, y), to(xMax, y)], y ? colors.grid : colors.axis);
      if (y) d.label(to(-xMax, y), fmt(y), colors.axis, -19);
    }
    for (let x = -xMax; x <= xMax; x += 1) {
      d.line([to(x, -yMax), to(x, yMax)], x ? colors.grid : colors.axis);
      d.label(to(x, 0), fmt(x), colors.axis, 0, 15);
    }
    d.label(to(xMax, 0), "x", colors.ink, 16);
    d.label(to(0, yMax), "y", colors.ink, 11);
  }

  function labeledArrow(d, a, b, color, label) {
    d.arrow(a, b, color);
    d.marker(b, color, label);
  }

  function arcPoints(degrees, radius) {
    const n = Math.max(1, Math.ceil(degrees / 5));
    return Array.from({ length: n + 1 }, (_, i) => circular(i * degrees / n, radius));
  }

  function circularMarks(d, degrees, radius, point) {
    d.line(arcPoints(360, radius), colors.axis, true);
    if (degrees > 0) {
      d.line(arcPoints(degrees, radius * 0.37), colors.gold);
      d.label(circular(degrees / 2, radius * 0.43), degrees + "°", colors.gold, -3, -9);
    }
    d.line([at(point[0], 0), point], colors.blue, true);
  }

  function triangle(d, p, annotated = false) {
    const [x, y, z] = p, elbow = at(x, 0), xy = at(x, y);
    const xyLength = length(xy);
    d.line([origin, elbow], colors.orange);
    d.line([elbow, xy], colors.blue, true);
    if (x && y) {
      d.polygon([origin, elbow, xy], colors.blue);
      const size = Math.min(0.36, Math.abs(x) / 2, Math.abs(y) / 2);
      const a = x - Math.sign(x) * size, b = Math.sign(y) * size;
      d.line([at(a, 0), at(a, b), at(x, b)], colors.ink);
      if (annotated) {
        d.label(at(x / 2, 0), `x² = ${x ** 2}`, colors.orange, 0, 20);
        d.label(at(x, y / 2), `y² = ${y ** 2}`, colors.blue, 23);
      }
    }
    if (z && d.view === "depth") {
      d.line([xy, p], colors.violet, true);
      if (xyLength) {
        d.line([origin, xy], colors.blue, true);
        d.polygon([origin, xy, p], colors.violet);
        const size = Math.min(0.35, xyLength / 2, Math.abs(z) / 2);
        const a = scale(xy, 1 - size / xyLength), b = at(0, 0, Math.sign(z) * size);
        d.line([a, add(a, b), add(xy, b)], colors.ink);
        if (annotated) d.label(scale(xy, 0.64), `rxy² = ${square(xy)}`, colors.blue, -14, -10);
      }
      if (annotated) d.label(add(xy, at(0, 0, z / 2)), `z² = ${z ** 2}`, colors.violet, 25, -7);
    }
  }

  function renderSVG(surface, plan, labelsOnly) {
    const drawing = document.createDocumentFragment();
    const line = (points, color, dash = false, size = 1.6) => drawing.append(svg("polyline", {
      points: points.map(p => p.join(",")).join(" "), stroke: color, "stroke-width": size,
      "stroke-dasharray": dash ? "6 4" : "", fill: "none", "stroke-linejoin": "round"
    }));
    const marker = (x, y, size, color, diamond) => {
      const attrs = { fill: color, stroke: "#06140c", "stroke-width": 1 };
      drawing.append(diamond ? svg("polygon", {
        ...attrs, points: `${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`
      }) : svg("circle", { ...attrs, cx: x, cy: y, r: size }));
    };
    if (!labelsOnly) for (const m of plan.marks) {
      const { color } = m;
      switch (m.kind) {
        case "line":
          line(m.points.map(plan.project), color, m.dash, color === colors.grid ? 0.75 : 1.7);
          break;
        case "polygon":
          drawing.append(svg("polygon", { points: m.points.map(p => plan.project(p).join(",")).join(" "),
            fill: color, "fill-opacity": m.opacity }));
          break;
        case "arrow": {
          const a = plan.project(m.a), b = plan.project(m.b);
          const dx = b[0] - a[0], dy = b[1] - a[1], distance = Math.hypot(dx, dy);
          if (distance < 0.001) break;
          const tip = Math.min(10, distance * 0.3), x = tip * dx / distance, y = tip * dy / distance;
          line([a, b], color, false, 2.25);
          drawing.append(svg("polygon", { fill: color,
            points: `${b[0]},${b[1]} ${b[0] - x - y / 2},${b[1] - y + x / 2} ${b[0] - x + y / 2},${b[1] - y - x / 2}` }));
          break;
        }
        case "marker":
          marker(...plan.project(m.p), m.diamond ? 7 : 5, color, m.diamond);
          break;
        case "block": {
          const [x, y] = plan.project(m.p), w = m.w * 280 / plan.halfX, h = m.h * 170 / plan.halfY;
          drawing.append(svg("rect", { x: x - w / 2, y: y - h / 2, width: w, height: h,
            rx: 5, fill: color, "fill-opacity": 0.22, stroke: color }));
          break;
        }
      }
    }
    for (const { p, text, color, dx, dy } of plan.labels) {
      const [x, y] = plan.project(p);
      const width = Math.min(500, text.length * 8.25 + 8);
      drawing.append(svg("text", {
        x: Math.max(width / 2 + 1, Math.min(559 - width / 2, x + dx)),
        y: Math.max(12, Math.min(328, y + dy)),
        "text-anchor": "middle", "dominant-baseline": "central", stroke: "#060e09",
        "stroke-width": 3, "stroke-linejoin": "round", "paint-order": "stroke fill",
        style: `fill:${color};font:700 14px ui-monospace,monospace`
      }, text));
    }
    surface.replaceChildren(drawing);
  }

  const mainViewport = math("viewport"), mainSVG = math("xy-view"), canvas = math("canvas");
  const labelLayer = math("scene-labels");
  const labelSVG = svg("svg", { viewBox: "0 0 560 340", width: "100%", height: "100%", "aria-hidden": "true" });
  labelLayer.append(labelSVG);
  arcSvg.style.position = "relative";
  arcSvg.style.pointerEvents = "none";

  let graphics = null, lost = false, disposed = false, pageActive = true, frame = null, loading = false;
  let preferArcade = false, mainVisible = true, arcVisible = false;
  let unavailable = "Loading the local 3D view.";
  const textArc = q("#arc-render-status", figure);
  function showFallback() {
    canvas.hidden = true;
    labelLayer.hidden = true;
    mainSVG.removeAttribute("hidden");
    if (arcadePlan) renderSVG(arcSvg, arcadePlan, false);
    put(math("renderer-status"), unavailable + " The live XY projection and signed-depth readout are available.");
    put(textArc, unavailable + " The interactive diagrams and numerical readouts are available.");
  }

  function refresh() {
    if (frame !== null || disposed || !pageActive || document.hidden) return;
    frame = window.requestAnimationFrame(drawFrame);
  }

  function drawFrame() {
    frame = null;
    if (disposed || !pageActive || document.hidden) return;
    const useArcade = arcade.open && arcadePlan
      && (preferArcade ? (arcVisible || !mainVisible || !intersection) : (!mainVisible && arcVisible));
    const plan = useArcade ? arcadePlan : mainPlan, host = useArcade ? arcViewport : mainViewport;
    if (!graphics || lost) {
      showFallback();
      if (!loading && (mainVisible || arcVisible || preferArcade)) void loadScene();
      return;
    }
    if (!plan || (!useArcade && !mainVisible)) return;
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    if (canvas.parentElement !== host) host.prepend(canvas);
    try {
      graphics.draw(plan, width, height, reduced());
      canvas.hidden = false;
      labelLayer.hidden = useArcade;
      mainSVG.toggleAttribute("hidden", !useArcade);
      if (!useArcade) renderSVG(labelSVG, mainPlan, true);
      renderSVG(arcSvg, arcadePlan, useArcade);
      put(math("renderer-status"), useArcade ? "Live XY projection with signed depth below."
        : `Three.js · ${viewName(view)} view`);
      put(textArc, useArcade ? "Three.js diagram" : "Interactive diagram");
    } catch {
      try { graphics.dispose(); } catch { /* The renderer may already have lost its context. */ }
      graphics = null;
      unavailable = "The 3D view stopped.";
      showFallback();
    }
  }

  async function loadScene() {
    loading = true;
    try {
      const three = await import("../vendor/three.module.js");
      if (disposed) return;
      graphics = createRenderer(three, canvas);
      refresh();
    } catch {
      unavailable = "The local 3D view is unavailable.";
      if (!disposed) showFallback();
    }
  }

  function cancel() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  }

  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    lost = true;
    unavailable = "The WebGL context was interrupted.";
    cancel();
    showFallback();
  });
  canvas.addEventListener("webglcontextrestored", () => { lost = false; refresh(); });
  let resize, intersection;
  if (typeof ResizeObserver === "function") {
    resize = new ResizeObserver(refresh);
    resize.observe(mainViewport);
    resize.observe(arcViewport);
  }
  if (typeof IntersectionObserver === "function") {
    intersection = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === arcViewport) arcVisible = entry.isIntersecting;
        else mainVisible = entry.isIntersecting;
      }
      refresh();
    });
    intersection.observe(mainViewport);
    intersection.observe(arcViewport);
  }
  window.addEventListener("resize", refresh);
  document.addEventListener("visibilitychange", () => document.hidden ? cancel() : refresh());
  window.addEventListener("pagehide", event => {
    pageActive = false;
    cancel();
    if (event.persisted) return;
    disposed = true;
    resize?.disconnect();
    intersection?.disconnect();
    graphics?.dispose();
  });
  window.addEventListener("pageshow", () => { pageActive = true; refresh(); });
  effects.addEventListener("change", refresh);
  if (motion.addEventListener) motion.addEventListener("change", refresh);
  else motion.addListener?.(refresh);

  function activateStation() {
    const active = stations[select.value];
    for (const entry of Object.values(stations)) entry.panel.hidden = entry !== active;
    q("[data-arc-slot]", active.panel).append(figure);
    active.redraw();
  }

  select.addEventListener("change", () => {
    preferArcade = true;
    put(id("arc-reset-status"), "");
    activateStation();
  });
  id("arc-reset").addEventListener("click", () => {
    stations[select.value].reset();
    put(id("arc-reset-status"), "Station reset. Your completed missions are still counted.");
  });
  arcade.addEventListener("toggle", () => {
    preferArcade = arcade.open;
    refresh();
  });
  arcade.addEventListener("focusin", () => { preferArcade = true; refresh(); });
  space.addEventListener("focusin", () => { preferArcade = false; refresh(); });
  math("arcade-link").addEventListener("click", () => {
    arcade.open = true;
    preferArcade = true;
    q("summary", arcade).focus({ preventScroll: true });
    refresh();
  });
  math("checkout-return").addEventListener("click", () => {
    preferArcade = false;
    space.focus({ preventScroll: true });
    refresh();
  });

  for (const name of ["rule-controls", "inverse-controls", "space-controls", "challenge-controls", "reflection-save", "reduced"]) {
    math(name).disabled = false;
  }
  for (const el of all("fieldset", arcade)) el.disabled = false;
  select.disabled = false;
  id("arc-reset").disabled = false;
  checkoutFeedback("Choose an answer. You can retry after reading the feedback.");
  renderRule();
  drawMath();
  activateStation();

  function createRenderer(T, canvas) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: !reduced(), powerPreference: "low-power" });
    renderer.setClearColor(0x060e09);
    const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    const group = new T.Group();
    scene.add(group, new T.HemisphereLight(0xf4fff7, 0x263b30, 2));
    const lamp = new T.DirectionalLight(0xedfff3, 2);
    lamp.position.set(6, 14, 12);
    scene.add(lamp);
    const vector = p => new T.Vector3(...p);
    let lastPlan = null, lastReduced = null, lastSize = "";

    function clear() {
      for (const object of [...group.children]) {
        object.traverse(mesh => {
          mesh.geometry?.dispose();
          mesh.material?.dispose();
        });
        group.remove(object);
      }
    }

    function rebuild(d, simple) {
      clear();
      const unit = d.halfY / 170;
      for (const m of d.marks) {
        if (m.kind === "arrow") {
          const a = vector(m.a), delta = vector(m.b).sub(a), magnitude = delta.length();
          const size = Math.min(magnitude * 0.3, unit * 10);
          group.add(new T.ArrowHelper(delta.normalize(), a, magnitude, m.color, size, size * 0.85));
        } else if (m.kind === "line") {
          const material = m.dash ? new T.LineDashedMaterial({ color: m.color, dashSize: unit * 6, gapSize: unit * 4 })
            : new T.LineBasicMaterial({ color: m.color });
          const path = new T.Line(new T.BufferGeometry().setFromPoints(m.points.map(vector)), material);
          if (m.dash) path.computeLineDistances();
          group.add(path);
        } else if (m.kind === "polygon") {
          const geo = new T.BufferGeometry();
          geo.setAttribute("position", new T.Float32BufferAttribute(m.points.flat(), 3));
          group.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: m.color, transparent: true,
            opacity: m.opacity, side: T.DoubleSide, depthWrite: false })));
        } else {
          const geo = m.kind === "block" ? new T.BoxGeometry(m.w, m.h, unit * 16) :
            m.diamond ? new T.OctahedronGeometry(unit * 7) : new T.SphereGeometry(unit * 5, simple ? 8 : 16, simple ? 6 : 12);
          const material = m.kind === "block" ? new T.MeshStandardMaterial({ color: m.color, transparent: true, opacity: 0.54 })
            : new T.MeshStandardMaterial({ color: m.color, roughness: 0.55 });
          const mesh = new T.Mesh(geo, material);
          mesh.position.set(...m.p);
          group.add(mesh);
        }
      }
    }

    return {
      draw(d, width, height, simple) {
        if (lastPlan !== d || lastReduced !== simple) {
          rebuild(d, simple);
          lastPlan = d;
          lastReduced = simple;
        }
        const density = Math.min(window.devicePixelRatio || 1, simple ? 1 : 1.5);
        const key = `${width}:${height}:${density}`;
        if (key !== lastSize) {
          renderer.setPixelRatio(density);
          renderer.setSize(width, height, false);
          lastSize = key;
        }
        const units = Math.min(width / (2 * d.halfX), height / (2 * d.halfY));
        camera.right = width / (2 * units);
        camera.left = -camera.right;
        camera.top = height / (2 * units);
        camera.bottom = -camera.top;
        camera.position.copy(vector(d.right).cross(vector(d.up)).multiplyScalar(950));
        camera.up.set(...d.up);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      },
      dispose() { clear(); renderer.dispose(); }
    };
  }
}