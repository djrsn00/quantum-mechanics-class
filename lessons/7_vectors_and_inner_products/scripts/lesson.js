const ORIGIN = [0, 0, 0];
const AXES = ["x", "y", "z"];

function add(a, b) {
  return a.map((value, index) => value + b[index]);
}

function subtract(a, b) {
  return a.map((value, index) => value - b[index]);
}

function scale(vector, factor) {
  return vector.map(value => value * factor);
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function length(vector) {
  return Math.hypot(...vector);
}

function measure(a, b) {
  const lengthA = length(a);
  const lengthB = length(b);
  const products = a.map((value, index) => value * b[index]);
  const product = products.reduce((sum, value) => sum + value, 0);
  const normal = cross(a, b);
  const normalLength = length(normal);

  let cosine = null;
  let angle = null;
  let alignment = "No angle: at least one vector is zero";

  if (lengthA > 0 && lengthB > 0) {
    if (normalLength === 0) {
      cosine = product > 0 ? 1 : -1;
    } else {
      cosine = Math.max(-1, Math.min(1, product / (lengthA * lengthB)));
    }

    angle = Math.acos(cosine);

    if (normalLength === 0) {
      alignment = product > 0 ? "Parallel · same direction" : "Antiparallel · opposite directions";
    } else if (product === 0) {
      alignment = "Perpendicular";
    } else {
      alignment = product > 0 ? "Acute" : "Obtuse";
    }
  }

  const signedComponent = lengthA === 0 ? null : product / lengthA;
  const projection = lengthA === 0 ? null : scale(a, product / dot(a, a));

  return {
    a,
    b,
    lengthA,
    lengthB,
    products,
    product,
    normal,
    normalLength,
    cosine,
    angle,
    alignment,
    signedComponent,
    projection,
    sum: add(a, b)
  };
}

function makeDiagram(model, overlay, revealed, axisLimit) {
  const arrows = [
    { kind: "a", label: "a", from: ORIGIN, to: model.a },
    { kind: "b", label: "b", from: ORIGIN, to: model.b }
  ];
  const lines = [];

  if (overlay === "components") {
    for (const [x, y, z] of [model.a, model.b]) {
      lines.push({ kind: "guide", points: [ORIGIN, [x, 0, 0], [x, y, 0], [x, y, z]] });
    }
  }

  if (overlay === "addition") {
    arrows.push(
      { kind: "translated-b", label: "b copy", from: model.a, to: model.sum },
      { kind: "sum", label: "a + b", from: ORIGIN, to: model.sum }
    );
  }

  if (overlay === "projection" && model.projection !== null) {
    const largestComponent = Math.max(...model.a.map(Math.abs));
    const spanEnd = scale(model.a, axisLimit / largestComponent);

    lines.push(
      { kind: "span", points: [scale(spanEnd, -1), spanEnd] },
      { kind: "guide", points: [model.b, model.projection] }
    );
    arrows.push({
      kind: "projection",
      label: "proj",
      from: ORIGIN,
      to: model.projection
    });
  }

  let angleLabel = null;

  // A vanishing cross product leaves no unique plane for an angle arc.
  if (revealed && model.angle !== null && model.normalLength > 0) {
    const u = scale(model.a, 1 / model.lengthA);
    const normal = scale(model.normal, 1 / model.normalLength);
    const v = cross(normal, u);
    const radius = Math.min(1.6, Math.min(model.lengthA, model.lengthB) * 0.6);

    const arcPoint = (angle, distance) =>
      add(scale(u, distance * Math.cos(angle)), scale(v, distance * Math.sin(angle)));

    const segments = 32;
    const points = Array.from({ length: segments + 1 }, (_, index) =>
      arcPoint(model.angle * index / segments, radius)
    );

    lines.push({ kind: "angle", points });
    angleLabel = arcPoint(model.angle / 2, radius + 0.4);
  }

  return { arrows, lines, angleLabel };
}

function initializeVectorLab(root) {
  const get = name => root.querySelector(`#vector-${name}`);
  const put = (name, text) => { get(name).textContent = text; };
  const lab = get("lab");
  const controls = get("controls");
  const sliders = [...controls.querySelectorAll("input[data-vector-component]")];
  const viewButtons = [...controls.querySelectorAll("button[data-vector-view]")];
  const overlaySelect = get("overlay");

  const viewport = get("viewport");
  const canvas = get("canvas");
  const sceneLabels = get("scene-labels");
  const svg = get("svg");
  const svgArrows = get("svg-arrows");
  const svgOverlays = get("svg-overlays");
  const svgLabels = get("svg-labels");

  const axisLimit = Number(lab.dataset.axisLimit);
  const originX = Number(lab.dataset.originX);
  const originY = Number(lab.dataset.originY);
  const unitPx = Number(lab.dataset.unitPx);

  const openingForm = get("opening-form");
  const openingGuess = get("opening-guess");
  const signForm = get("sign-form");
  const signZ = get("sign-z");
  const signGuess = get("sign-guess");

  const challengeControls = get("challenge-controls");
  const panels = [...challengeControls.querySelectorAll("[data-vector-question]")];
  const nextQuestion = get("next-question");

  const presets = {
    opening: { a: [1, 1, 1], b: [1, 1, -2] },
    parallel: { a: [1, 1, 1], b: [2, 2, 2] },
    perpendicular: { a: [1, 1, 1], b: [1, -1, 0] },
    opposite: { a: [1, 1, 1], b: [-1, -1, -1] },
    "zero-a": { a: [0, 0, 0], b: [1, 1, -2] },
    "zero-b": { a: [1, 1, 1], b: [0, 0, 0] }
  };

  const viewNames = {
    xy: "XY · z is hidden",
    xz: "XZ · y is hidden",
    oblique: "Oblique · x, y and z"
  };

  const overlayNotes = {
    components: "The component guides break each arrow into steps along the axes.",
    addition: "The dashed b copy starts at the tip of a. The orange sum reaches the tip of that copy.",
    projection: "The blue guide line spans a. The dotted guide joins the tip of b to its projection on that line."
  };

  const formatter = new Intl.NumberFormat("en", { maximumFractionDigits: 4 });
  const svgNS = "http://www.w3.org/2000/svg";
  const listeners = new AbortController();
  const listen = (target, type, callback) =>
    target.addEventListener(type, callback, { signal: listeners.signal });

  let model = measure(presets.opening.a, presets.opening.b);
  let overlay = "components";
  let requestedView = "xy";
  let planeView = "xy";
  let revealed = false;
  let diagram = makeDiagram(model, overlay, revealed, axisLimit);
  let openingPrediction = null;
  let questionIndex = 0;
  let constructionPassed = false;
  let challengeComplete = false;

  const reducedControl = get("reduced");
  const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => Boolean(reducedControl.checked || motionPreference?.matches);
  let graphics = null;
  let contextLost = false;
  let frameId = null;
  let pageActive = true;
  let disposed = false;
  let fallbackReason = "Loading the local Three.js scene. The XY and XZ controls are available.";

  let lastDraw = null;
  const arcade = initializeArcade(root, requestDraw, reduced, listen);

  function number(value) {
    // Suppress a minus sign when a small negative value rounds to zero.
    const rounded = Number(value.toFixed(4));
    return formatter.format(rounded === 0 ? 0 : rounded).replace("-", "−");
  }

  function tuple(values) {
    return `(${values.map(number).join(", ")})`;
  }

  function angleText(data) {
    if (data.angle === null) return "Undefined";

    if (data.normalLength === 0) {
      return data.product > 0 ? "0° = 0 rad" : "180° = π rad";
    }

    if (data.product === 0) return "90° = π/2 rad";

    const degrees = data.angle * 180 / Math.PI;
    return `≈ ${number(degrees)}° · ${number(data.angle)} rad`;
  }

  function projectionText(data) {
    if (data.projection === null) {
      return "Projection is undefined because a is zero and supplies no direction.";
    }

    if (data.lengthB === 0) {
      return "Vector b is zero, so its signed component and vector projection are both zero.";
    }

    if (data.product === 0) {
      return "The projection lands at the origin. The perpendicular guide runs from the tip of b to that point.";
    }

    return data.product < 0
      ? "The signed component is negative. The projection points along the ray opposite a."
      : "The signed component is positive. The projection points along the same ray as a.";
  }

  function renderNumbers() {
    put("a", tuple(model.a));
    put("b", tuple(model.b));
    put("length-a", `${number(model.lengthA)} units`);
    put("length-b", `${number(model.lengthB)} units`);
    put("shadow-a", tuple(model.a.slice(0, 2)));
    put("shadow-b", tuple(model.b.slice(0, 2)));
    put("sum", tuple(model.sum));

    const terms = model.a.map((value, index) =>
      `${value < 0 ? `(${number(value)})` : number(value)}(${number(model.b[index])})`
    );

    put("dot-expression", `a · b = ${terms.join(" + ")} = ${number(model.product)}`);
    put("dot", `${number(model.product)} square units`);
    put("cosine", model.cosine === null ? "Undefined" : number(model.cosine));
    put("angle", angleText(model));
    put("alignment", model.alignment);
    put("proj-scalar", model.signedComponent === null
      ? "Undefined"
      : `${number(model.signedComponent)} units`);
    put("proj", model.projection === null ? "Undefined" : tuple(model.projection));
    put("projection-status", projectionText(model));

    put("challenge-pair", `Current a = ${tuple(model.a)} · b = ${tuple(model.b)}`);
    get("result-values").hidden = !revealed;
    get("reveal-placeholder").hidden = revealed;
    get("reveal-live").hidden = revealed;
  }

  function syncInputs() {
    for (const input of sliders) {
      const [name, axis] = input.dataset.vectorComponent;
      const vector = name === "a" ? model.a : model.b;
      const value = vector[AXES.indexOf(axis)];

      input.valueAsNumber = value;
      input.setAttribute("aria-valuetext", `${number(value)} units`);
      put(`${name}${axis}-value`, number(value));
    }

    overlaySelect.value = overlay;
    lab.dataset.overlay = overlay;
    put("overlay-note", overlayNotes[overlay]);
  }

  function svgNode(tag, attrs, text) {
    const node = document.createElementNS(svgNS, tag);

    for (const [name, value] of Object.entries(attrs)) {
      node.setAttribute(name, String(value));
    }

    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderSvg() {
    const verticalIndex = planeView === "xz" ? 2 : 1;
    const verticalAxis = AXES[verticalIndex];
    const hiddenAxis = planeView === "xz" ? "y" : "z";
    const project = vector => [
      originX + vector[0] * unitPx,
      originY - vector[verticalIndex] * unitPx
    ];

    put("svg-title", `${planeView.toUpperCase()} projection of vectors a and b`);
    put("svg-horizontal", "+x");
    put("svg-vertical", `+${verticalAxis}`);

    const projectedA = [model.a[0], model.a[verticalIndex]];
    const projectedB = [model.b[0], model.b[verticalIndex]];
    const angleNote = revealed ? ` Angle of the full vectors: ${angleText(model)}.` : "";

    put(
      "svg-desc",
      `Vector a is ${tuple(model.a)} and its shadow is ${tuple(projectedA)}. Vector b is ${tuple(model.b)} and its shadow is ${tuple(projectedB)}. The ${hiddenAxis} axis is hidden. ${overlayNotes[overlay]}${angleNote}`
    );

    const lineClasses = {
      guide: "vector-guide",
      span: "vector-span",
      angle: "vector-angle-arc"
    };

    const lines = diagram.lines.map(line => {
      const points = line.points.map(project).map(pair => pair.join(",")).join(" ");
      return svgNode("polyline", { class: lineClasses[line.kind], points });
    });

    const arrows = [];
    const labels = [];
    const offsets = {
      a: [12, -11],
      b: [12, 15],
      "translated-b": [12, 15],
      sum: [-15, -11],
      projection: [-16, 16]
    };

    for (const arrow of diagram.arrows) {
      const kind = arrow.kind === "translated-b" ? "b" : arrow.kind;
      const [x1, y1] = project(arrow.from);
      const [x2, y2] = project(arrow.to);

      if (Math.hypot(x2 - x1, y2 - y1) > 1e-6) {
        arrows.push(svgNode("line", {
          class: `vector-line-${kind}`,
          x1, y1, x2, y2,
          "marker-end": `url(#vector-tip-${kind})`
        }));
      }

      if (kind === "a") {
        arrows.push(svgNode("circle", { class: "vector-point-a", cx: x2, cy: y2, r: 3.5 }));
      } else if (kind === "b") {
        arrows.push(svgNode("path", {
          class: "vector-point-b",
          d: `M${x2} ${y2 - 6}l6 6-6 6-6-6Z`
        }));
      } else {
        arrows.push(svgNode("circle", {
          class: `vector-fill-${kind}`, cx: x2, cy: y2, r: 3.2
        }));
      }

      const [dx, dy] = offsets[arrow.kind];
      labels.push(svgNode("text", {
        class: `vector-label-${kind}`,
        x: Math.max(28, Math.min(392, x2 + dx)),
        y: Math.max(21, Math.min(406, y2 + dy))
      }, arrow.label));
    }

    if (diagram.angleLabel) {
      const [x, y] = project(diagram.angleLabel);
      labels.push(svgNode("text", { class: "vector-label-angle", x, y: y - 5 }, "θ"));
    }

    svgOverlays.replaceChildren(...lines);
    svgArrows.replaceChildren(...arrows);
    svgLabels.replaceChildren(...labels);
  }

  function activeView() {
    return graphics && !contextLost && !canvas.hidden && canvas.parentElement === viewport ? requestedView : planeView;
  }

  function syncView() {
    const view = activeView();
    lab.dataset.view = view;
    put("current-view", viewNames[view]);

    for (const button of viewButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.vectorView === view));
    }
  }

  function showFallback() {
    canvas.hidden = true;
    sceneLabels.hidden = true;
    svg.toggleAttribute("hidden", false);
    put("renderer-status", fallbackReason);
    syncView();
  }

  function showThree() {
    if (canvas.parentElement !== viewport) viewport.prepend(canvas);
    canvas.hidden = false;
    sceneLabels.hidden = false;
    svg.toggleAttribute("hidden", true);
    const message = "Three.js · Orthographic view with one common unit scale.";

    if (get("renderer-status").textContent !== message) put("renderer-status", message);
    syncView();
  }

  function render() {
    diagram = makeDiagram(model, overlay, revealed, axisLimit);
    renderNumbers();
    renderSvg();
    requestDraw();
  }

  function setVectors(a, b) {
    const changed = !same(a, model.a) || !same(b, model.b);
    model = measure([...a], [...b]);

    if (changed && constructionPassed && !challengeComplete) {
      constructionPassed = false;
      nextQuestion.hidden = true;
      put("challenge-feedback", "The vectors changed. Check the new construction when you’re ready.");
    }

    syncInputs();
    render();
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    render();
  }

    listen(controls, "input", event => {
    const key = event.target.dataset.vectorComponent;
    if (!key) return;

    const [name, axis] = key;
    const index = AXES.indexOf(axis);
    const a = [...model.a];
    const b = [...model.b];

    (name === "a" ? a : b)[index] = event.target.valueAsNumber;
    setVectors(a, b);
  });

  listen(overlaySelect, "change", () => {
    overlay = overlaySelect.value;
    syncInputs();
    render();
  });

  listen(controls, "click", event => {
    const button = event.target.closest("button");
    if (!button) return;

    const preset = button.dataset.vectorPreset;
    const view = button.dataset.vectorView;

    if (preset) {
      const pair = presets[preset];
      setVectors(pair.a, pair.b);
      put("lab-feedback", `Loaded a = ${tuple(model.a)} and b = ${tuple(model.b)}. Try another view or overlay.`);
      return;
    }

    if (view) {
      requestedView = view;
      if (view === "xy" || view === "xz") planeView = view;

      if (view === "oblique" && activeView() !== "oblique") {
        put("lab-feedback", `Oblique view uses WebGL. The SVG is showing ${planeView.toUpperCase()}. You can switch between XY and XZ with the same vectors.`);
      } else {
        put("lab-feedback", "The view changed. The components and calculations are the same.");
      }

      renderSvg();
      syncView();
      requestDraw();
    }
  });

  listen(get("reset"), "click", () => {
    overlay = "components";
    requestedView = "xy";
    planeView = "xy";
    revealed = false;
    openingPrediction = null;
    openingGuess.value = "";
    signZ.value = "-2";
    signGuess.value = "";

    put("opening-feedback", "Save a prediction, then try the XZ or oblique view before checking the starting pair.");
    put("sign-feedback", "Choose a depth and predict the sign before loading the pair.");
    put("lab-feedback", "Reset to the opening pair in XY view. Try XZ to see the depth difference.");

    setVectors(presets.opening.a, presets.opening.b);
    syncView();
  });

  listen(openingForm, "submit", event => {
    event.preventDefault();
    if (!openingForm.reportValidity()) return;

    openingPrediction = openingGuess.value;
    put("opening-feedback", "Prediction saved. Explore another view, then check the starting pair.");
  });

  listen(openingGuess, "change", () => {
    openingPrediction = null;
    put("opening-feedback", "Save your choice before checking the starting pair.");
  });

  listen(get("check-opening"), "click", () => {
    if (!openingPrediction) {
      put("opening-feedback", "Choose and save a prediction first.");
      if (openingForm.reportValidity()) openingForm.querySelector('[type="submit"]').focus();
      return;
    }

    revealed = true;
    setVectors(presets.opening.a, presets.opening.b);

    const verdict = openingPrediction === "yes"
      ? "Your prediction matched."
      : "Look at the depth terms to see what the XY shadow left out.";

    put(
      "opening-feedback",
      `${verdict} The full dot product is 1 + 1 − 2 = 0. Both vectors are nonzero, so the angle is 90° even though both XY shadows end at (1, 1).`
    );
    put("lab-feedback", "The opening pair is loaded. XZ separates the tips, and the calculation gives the angle between the full 3D vectors.");
  });

  listen(get("reveal-live"), "click", () => {
    reveal();

    const results = get("result-values");
    results.setAttribute("tabindex", "-1");
    results.focus({ preventScroll: true });
  });

  listen(signForm, "submit", event => {
    event.preventDefault();
    if (!signForm.reportValidity()) return;

    const z = Number(signZ.value);
    revealed = true;
    setVectors([1, 1, 1], [1, 1, z]);

    const sign = model.product === 0 ? "zero" : model.product > 0 ? "positive" : "negative";
    const verdict = signGuess.value === sign ? "Correct." : `The sign is ${sign}.`;

    put(
      "sign-feedback",
      `${verdict} At b_z = ${number(z)}, the component products are 1, 1, and ${number(z)}. They add to ${number(model.product)}. The angle is ${angleText(model)}.`
    );
    put("lab-feedback", `Loaded the b_z = ${number(z)} case. Try XZ or the projection overlay to investigate.`);
  });

  listen(challengeControls, "click", event => {
    const answer = event.target.closest("button[data-vector-answer]");
    if (!answer || questionIndex !== 0) return;

    const answers = {
      right: "A zero dot product gives a right angle only when both vectors are nonzero. The zero vector supplies no direction.",
      undefined: "Correct. The zero vector has no direction, so the angle is undefined even though the dot product is zero.",
      parallel: "A 0° angle compares two nonzero arrows with the same direction. The zero vector has no direction to compare."
    };

    const choice = answer.dataset.vectorAnswer;
    put("challenge-feedback", answers[choice]);
    nextQuestion.hidden = choice !== "undefined";
  });

  listen(get("challenge-setup"), "click", () => {
    revealed = true;
    setVectors([1, 1, 1], [1, 0, 0]);
    put("challenge-feedback", "Setup loaded. Change b so its three component products cancel.");
  });

  listen(get("check-construction"), "click", () => {
    if (questionIndex !== 1 || challengeComplete) return;

    let message;
    constructionPassed = false;

    if (!model.a.every(value => value === 1)) {
      message = "Set a to (1, 1, 1) or use Load challenge setup.";
    } else if (model.lengthB === 0) {
      message = "Choose a nonzero b. The zero vector has a zero dot product but no angle.";
    } else if (model.b[0] === 1 && model.b[1] === 1) {
      message = "Find a b with a different XY shadow. Change at least one of its x or y components.";
    } else if (model.product !== 0) {
      message = `Your component products add to ${number(model.product)}. Adjust b until they add to zero.`;
    } else {
      constructionPassed = true;
      message =
        `Correct. The products ${model.products.map(number).join(", ")} add to zero. Both vectors are nonzero, so your b is perpendicular to a.`;
    }

    put("challenge-feedback", message);
    nextQuestion.hidden = !constructionPassed;
  });

  listen(nextQuestion, "click", () => {
    if (nextQuestion.hidden) return;

    if (questionIndex === 1) {
      if (!constructionPassed) return;

      challengeComplete = true;
      challengeControls.disabled = true;
      nextQuestion.hidden = true;
      put("challenge-progress", "Challenge complete");
      put("challenge-feedback", "You built a nonzero perpendicular vector and explained how its component products cancel.");

      const bridge = get("bridge-title");
      bridge.setAttribute("tabindex", "-1");
      bridge.focus();
      return;
    }

    panels[0].hidden = true;
    panels[1].hidden = false;
    questionIndex = 1;
    nextQuestion.hidden = true;
    nextQuestion.textContent = "Finish challenge";
    put("challenge-progress", "Question 2 of 2");
    put("challenge-feedback", "Build a different nonzero b and check it here.");
    panels[1].querySelector("h4").focus();
  });

  function requestDraw() {
    if (disposed || !pageActive || document.hidden || frameId !== null) return;

    frameId = window.requestAnimationFrame(time => {
      frameId = null;
      if (disposed || !pageActive || document.hidden) return;
      arcade.tick(time);
      const useArcade = arcade.visible() && arcade.shape;
      if (!graphics || contextLost) {
        arcade.renderMode(false, "Interactive SVG coordinate diagram.");
        return;
      }
      const host = useArcade ? arcade.viewport : viewport;
      if (!host.clientWidth || !host.clientHeight) return;
      const density = Math.min(window.devicePixelRatio || 1, reduced() ? 1 : 1.5);
      const width = host.clientWidth, height = host.clientHeight;
      const picture = useArcade ? arcade.shape : diagram;
      const view = useArcade ? "arcade" : requestedView;
      if (lastDraw && canvas.parentElement === host && !canvas.hidden &&
          lastDraw.picture === picture && lastDraw.view === view &&
          lastDraw.width === width && lastDraw.height === height && lastDraw.density === density) return;

      try {
        if (useArcade) {
          if (canvas.parentElement !== host) {
            showFallback();
            put("renderer-status", "The Vector Lab is showing interactive SVG while the arcade scene is in view.");
            host.prepend(canvas);
          }
          graphics.drawArcade(picture, width, height, density);
          canvas.hidden = false;
          arcade.renderMode(true, "Three.js · Orthographic coordinate diagram.");
        } else {
          graphics.draw(picture, view, width, height, density);
          showThree();
          if (arcade.usingThree) arcade.renderMode(false, "Interactive SVG coordinate diagram.");
        }
        lastDraw = { picture, view, width, height, density };
      } catch {
        graphics.dispose();
        graphics = null;
        fallbackReason = "The local Three.js scene stopped. Interactive SVG and calculations remain available.";
        showFallback();
        arcade.renderMode(false, fallbackReason);
      }
    });
  }

  function cancelDraw() {
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    frameId = null;
  }

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(requestDraw) : null;
  observer?.observe(viewport);
  observer?.observe(arcade.viewport);
  const visibility = typeof IntersectionObserver === "function" ? new IntersectionObserver(requestDraw) : null;
  visibility?.observe(arcade.viewport);

  listen(window, "scroll", requestDraw);
  listen(reducedControl, "change", () => { arcade.finish(); requestDraw(); });
  motionPreference?.addEventListener?.("change", () => {
    arcade.finish();
    requestDraw();
  }, { signal: listeners.signal });

  listen(window, "resize", requestDraw);
  listen(document, "visibilitychange", () => {
    if (document.hidden) {
      arcade.finish();
      cancelDraw();
    } else requestDraw();
  });

  listen(canvas, "webglcontextlost", event => {
    event.preventDefault();
    contextLost = true;
    lastDraw = null;
    cancelDraw();
    fallbackReason = "WebGL was interrupted. Your current vectors are available in the SVG XY and XZ views.";
    showFallback();
    arcade.renderMode(false, fallbackReason);
  });

  listen(canvas, "webglcontextrestored", () => {
    contextLost = false;
    requestDraw();
  });

  listen(window, "pagehide", event => {
    pageActive = false;
    arcade.finish();
    cancelDraw();
    if (event.persisted) return;

    disposed = true;
    observer?.disconnect();
    visibility?.disconnect();
    listeners.abort();
    graphics?.dispose();
    graphics = null;
  });

  listen(window, "pageshow", () => {
    pageActive = true;
    requestDraw();
  });

  async function loadThree() {
    try {
      const THREE = await import("../vendor/three.module.js");
      if (disposed) return;
      graphics = createVectorScene(THREE, canvas, sceneLabels, axisLimit);
      fallbackReason = "Interactive SVG · XY and XZ views.";
      requestDraw();
    } catch {
      if (disposed) return;
      fallbackReason = "The local Three.js scene is unavailable. The interactive SVG XY and XZ views are active.";
      showFallback();
    }
  }

  openingGuess.value = "";
  signZ.value = "-2";
  signGuess.value = "";

  syncInputs();
  render();
  showFallback();

  for (const name of ["controls", "opening-controls", "result-controls", "sign-controls", "challenge-controls"]) {
    get(name).disabled = false;
  }

  reducedControl.disabled = false;

  put("challenge-feedback", "Choose an answer. You can retry after reading the feedback.");
  void loadThree();
}

function createVectorScene(THREE, canvas, labelLayer, limit) {
  const colors = {
    a: 0x63f59b,
    b: 0xc19bff,
    sum: 0xff9f55,
    projection: 0x65b7ff,
    guide: 0x8cb8a3,
    span: 0x65b7ff,
    angle: 0xffe16a,
    axis: 0x729783,
    grid: 0x234c33
  };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "low-power"
  });
  renderer.setClearColor(0x050d09);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  const moving = new THREE.Group();
  scene.add(moving);

  const toVector = coordinates => new THREE.Vector3(...coordinates);
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const labelPosition = new THREE.Vector3();

  const xyGrid = new THREE.GridHelper(limit * 2, limit * 2, colors.axis, colors.grid);
  xyGrid.rotation.x = Math.PI / 2;
  xyGrid.position.z = -0.025;

  const xzGrid = new THREE.GridHelper(limit * 2, limit * 2, colors.axis, colors.grid);
  xzGrid.position.y = 0.025;
  scene.add(xyGrid, xzGrid);

  const coneGeometry = new THREE.ConeGeometry(0.5, 1, 10);
  const circleGeometry = new THREE.SphereGeometry(0.1, 10, 8);
  const diamondGeometry = new THREE.OctahedronGeometry(0.17);
  const sharedGeometry = new Set([coneGeometry, circleGeometry, diamondGeometry]);

  function lineMaterial(color, dash = 0, gap = 0) {
    return dash
      ? new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: gap, depthTest: false })
      : new THREE.LineBasicMaterial({ color, depthTest: false });
  }

  const lines = {
    a: lineMaterial(colors.a),
    b: lineMaterial(colors.b, 0.25, 0.14),
    sum: lineMaterial(colors.sum),
    projection: lineMaterial(colors.projection, 0.25, 0.12),
    guide: lineMaterial(colors.guide, 0.07, 0.16),
    span: lineMaterial(colors.span, 0.06, 0.28),
    angle: lineMaterial(colors.angle)
  };

  const heads = Object.fromEntries(["a", "b", "sum", "projection"].map(kind => [
    kind,
    new THREE.MeshBasicMaterial({ color: colors[kind], depthTest: false })
  ]));

  const diamondMaterial = new THREE.MeshBasicMaterial({
    color: colors.b,
    wireframe: true,
    depthTest: false
  });

  const originMarker = new THREE.Mesh(
    circleGeometry,
    new THREE.MeshBasicMaterial({ color: 0xecfff1 })
  );
  scene.add(originMarker);

  const labels = new Map();

  function addLabel(key, text, colorKey = key) {
    const node = document.createElement("span");
    node.dataset.vectorLabel = colorKey;
    node.textContent = text;
    labelLayer.append(node);
    labels.set(key, node);
  }

  function placeLabel(key, coordinates, visible, dx = 0, dy = 0) {
    const node = labels.get(key);
    node.hidden = !visible;
    if (!visible) return;

    labelPosition.set(...coordinates).project(camera);
    node.style.left = `calc(${(labelPosition.x + 1) * 50}% + ${dx}px)`;
    node.style.top = `calc(${(1 - labelPosition.y) * 50}% + ${dy}px)`;
  }

  const axisGroups = AXES.map((name, index) => {
    const group = new THREE.Group();
    const direction = AXES.map((_, axis) => axis === index ? 1 : 0);
    const axis = toVector(direction);
    const start = axis.clone().multiplyScalar(-limit);
    const arrow = new THREE.ArrowHelper(axis, start, limit * 2 + 0.4, colors.axis, 0.32, 0.18);
    group.add(arrow);

    const perpendicular = index === 0
      ? new THREE.Vector3(0, 0.10, 0.10)
      : new THREE.Vector3(0.12, 0, 0);
    const tickPoints = [];

    for (let value = -limit; value <= limit; value += 1) {
      if (value === 0) continue;
      const center = axis.clone().multiplyScalar(value);
      tickPoints.push(center.clone().sub(perpendicular), center.clone().add(perpendicular));
    }

    group.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tickPoints),
      new THREE.LineBasicMaterial({ color: colors.axis })
    ));
    scene.add(group);

    addLabel(`axis-${name}`, `+${name}`);
    for (const value of [-limit, -limit / 2, limit / 2, limit]) {
      addLabel(`tick-${name}-${value}`, String(value).replace("-", "−"));
    }

    return { name, group, direction };
  });

  addLabel("origin", "O");
  addLabel("a", "a");
  addLabel("b", "b");
  addLabel("translated-b", "b copy");
  addLabel("sum", "a + b");
  addLabel("projection", "proj");
  addLabel("angle", "θ");

  function addLine(points, material, order) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(toVector));
    const line = new THREE.Line(geometry, material);
    if (material.isLineDashedMaterial) line.computeLineDistances();
    line.renderOrder = order;
    moving.add(line);
    return line;
  }

  function clearMoving() {
    for (const object of moving.children) {
      if (object.geometry && !sharedGeometry.has(object.geometry)) object.geometry.dispose();
    }
    moving.clear();
  }

  function drawArrows(diagram) {
    clearMoving();

    for (const path of diagram.lines) {
      addLine(path.points, lines[path.kind], path.kind === "angle" ? 5 : 1);
    }

    for (const arrow of diagram.arrows) {
      const kind = arrow.kind === "translated-b" ? "b" : arrow.kind;
      const tip = toVector(arrow.to);
      const delta = subtract(arrow.to, arrow.from);
      const size = length(delta);
      const order = kind === "b" ? 4 : 3;

      if (size > 0) {
        const direction = scale(delta, 1 / size);
        const headLength = Math.min(0.32, size * 0.36);
        const shaftEnd = subtract(arrow.to, scale(direction, headLength * 0.72));
        addLine([arrow.from, shaftEnd], lines[kind], order);

        const head = new THREE.Mesh(coneGeometry, heads[kind]);
        head.quaternion.setFromUnitVectors(up, toVector(direction));
        head.position.copy(tip).addScaledVector(toVector(direction), -headLength / 2);
        head.scale.set(headLength * 0.7, headLength, headLength * 0.7);
        head.renderOrder = order;
        moving.add(head);
      }

      const marker = kind === "b"
        ? new THREE.Mesh(diamondGeometry, diamondMaterial)
        : new THREE.Mesh(circleGeometry, heads[kind]);

      marker.position.copy(tip);
      marker.renderOrder = order + 2;
      moving.add(marker);
    }
  }

  let lastDiagram = null;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastDensity = 0;

  const offsets = {
    a: [12, -12],
    b: [12, 13],
    "translated-b": [14, 16],
    sum: [-16, -12],
    projection: [-15, 17]
  };

  function resize(width, height, density) {
    if (width !== lastWidth || height !== lastHeight || density !== lastDensity) {
      renderer.setPixelRatio(density);
      renderer.setSize(width, height, false);
      lastWidth = width;
      lastHeight = height;
      lastDensity = density;
    }

  }

  function draw(diagram, view, width, height, density) {
    resize(width, height, density);
    if (diagram !== lastDiagram) {
      drawArrows(diagram);
      lastDiagram = diagram;
    }

    const aspect = width / height;
    const halfSpan = view === "oblique" ? Math.sqrt(3) * limit + 1.35 : limit + 2;
    const horizontal = halfSpan * Math.max(1, aspect);
    const vertical = halfSpan * Math.max(1, 1 / aspect);

    camera.left = -horizontal;
    camera.right = horizontal;
    camera.top = vertical;
    camera.bottom = -vertical;

    if (view === "xy") {
      camera.position.set(0, 0, 26);
      camera.up.set(0, 1, 0);
    } else if (view === "xz") {
      camera.position.set(0, -26, 0);
      camera.up.set(0, 0, 1);
    } else {
      camera.position.set(14, -18, 16);
      camera.up.set(0, 0, 1);
    }

    camera.lookAt(origin);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    xyGrid.visible = view !== "xz";
    xzGrid.visible = view === "xz";

    for (const axis of axisGroups) {
      const { name, group, direction } = axis;
      const visible = view === "oblique" || (view === "xy" ? name !== "z" : name !== "y");
      group.visible = visible;

      placeLabel(`axis-${name}`, scale(direction, limit + 0.73), visible);
      for (const value of [-limit, -limit / 2, limit / 2, limit]) {
        const horizontalAxis = name === "x" || (view === "oblique" && name === "y");

        placeLabel(
          `tick-${name}-${value}`,
          scale(direction, value),
          visible,
          horizontalAxis ? 0 : -12,
          horizontalAxis ? 10 : 0
        );
      }
    }

    placeLabel("origin", ORIGIN, true, -11, 12);

    for (const key of Object.keys(offsets)) labels.get(key).hidden = true;

    for (const arrow of diagram.arrows) {
      const [dx, dy] = offsets[arrow.kind];
      placeLabel(arrow.kind, arrow.to, true, dx, dy);
    }

    placeLabel("angle", diagram.angleLabel ?? ORIGIN, diagram.angleLabel !== null, 0, -6);
    renderer.render(scene, camera);
  }

  const arcadeScene = createArcadeScene(THREE, renderer);

  function drawArcade(shape, width, height, density) {
    resize(width, height, density);
    arcadeScene.draw(shape, width, height);
  }

  function dispose() {
    arcadeScene.dispose();
    clearMoving();

    const geometries = new Set(sharedGeometry);
    const materials = new Set([...Object.values(lines), ...Object.values(heads), diamondMaterial]);

    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);

      if (Array.isArray(object.material)) {
        for (const material of object.material) materials.add(material);
      } else if (object.material) {
        materials.add(object.material);
      }
    });

    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    renderer.dispose();
    labelLayer.replaceChildren();
  }

  return { draw, drawArcade, dispose };
}

const format = new Intl.NumberFormat("en", { maximumFractionDigits: 5 });
const fmt = n => format.format(Math.abs(n) < 1e-10 ? 0 : n).replace("-", "−");
const tuple = v => "(" + v.map(fmt).join(", ") + ")";
const approx = (a, b, tolerance = 1e-10) =>
  Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
const same = (a, b) => Boolean(a && b && a.length === b.length && a.every((n, i) => n === b[i]));
const close = (a, b) => a.every((n, i) => approx(n, b[i]));
const typed = (a, b) => a.every((n, i) => Math.abs(n - b[i]) <= 0.002 + 1e-12);
const xy = ([x, y]) => [x, y, 0];
const reference = [1, 1, 1];
const terms = m => m.products.map(fmt).join(" + ") + " = " + fmt(m.product);
const pairText = m => "a · b = " + terms(m) + ". ‖a‖ = " + fmt(m.lengthA) +
  ", ‖b‖ = " + fmt(m.lengthB) + ". Normalized alignment " +
  (m.cosine === null ? "and angle are undefined (zero direction)." :
    fmt(m.cosine) + ". Angle " + fmt(m.angle * 180 / Math.PI) + "°.");
const grade = (pass, fail, work, success = "Mission complete.") => ({ pass, fail, work, success });
const setup = message => grade(false, message);
const arrow = (label, to, color = "a", from = ORIGIN) => ({ label, to, from, color });
const pairArrows = m => [arrow("a", m.a), arrow("b", m.b, "b")];
const path = (points, color = "guide", dash = true) => ({ points, color, dash });
const marker = (label, point, color = "target") => ({ label, point, color });
const spatial = (desc, arrows, paths = [], markers = []) => ({ desc, arrows, paths, markers });
const routeEnd = legs => legs.at(-1)?.to ?? ORIGIN;
const leg = (from, delta) => ({ from, delta, to: add(from, delta) });
const navHelp = "Start at the origin and add each signed displacement to the previous position.";
const directionHelp = "Compare the ratio of the lengths and the normalized dot product.";
const dotHelp = "Multiply matching components and add the three products.";
const perpHelp = "Check that both lengths are nonzero before interpreting a zero dot product as a right angle.";
const projectionHelp = "Divide a · b by a · a, then multiply each component of a by that factor.";
const lengthHelp = "For a fixed shadow, the full squared length differs from the shadow's squared length by z².";
const complexHelp = "Conjugate the first vector's entries, multiply matching components, then add.";
const overlapHelp = "Normalize both states and take the squared magnitude of ⟨φ|ψ⟩.";
const routeText = r => tuple(r.from) + " + " + tuple(r.delta) + " = " + tuple(r.to);
const mText = v => "Vector " + tuple(v) + " · Length " + fmt(length(v)) + " · " +
  (length(v) ? "Unit direction " + tuple(scale(v, 1 / length(v))) : "No direction at zero length.");
const scaleText = (before, after) => "Before " + tuple(before) + " has length " + fmt(length(before)) +
  ". After " + tuple(after) + " has length " + fmt(length(after)) + ". Normalized alignment " +
  (length(before) && length(after) ? fmt(measure(before, after).cosine) : "undefined") + ".";
const projectionText = m => m.projection === null ? "Projection and signed component are undefined because a is zero." :
  "Signed component " + fmt(m.signedComponent) + ". Projection " + tuple(m.projection) +
  (m.product === 0 ? " is defined at the origin." : ".");
function projectionPlot(m, hidden = false) {
  const arrows = [...pairArrows(m), arrow("XY shadow", xy(m.b), "sum")];
  const paths = [];
  if (m.projection !== null) {
    const u = scale(m.a, (1.2 + Math.max(1, length(m.a), length(m.b))) / m.lengthA);
    paths.push(path([scale(u, -1), u], "extra"));
    if (!hidden) {
      paths.push(path([m.b, m.projection]));
      arrows.push(arrow("projₐ b", m.projection, "extra"));
    }
  }
  return spatial(hidden ? "Reference a, source b, and XY shadow. Projection awaiting a prediction." :
    "Reference a, source b, and separate XY shadow. " + projectionText(m), arrows, paths);
}
function codeData(key) {
  return {
    missing: { a: reference, target: 0, clue: "Find z so (1, 1, 1) · (1, 1, z) = 0." },
    construct: { a: [2, 1, 0], target: 3, clue: "Choose b so (2, 1, 0) · b = 3." },
    none: { a: [1, 1, 0], target: 3, clue: "Classify (1, 1, 0) · (1, 1, z) = 3." },
    many: { a: [1, 1, 0], target: 2, clue: "Choose two depths for (1, 1, 0) · (1, 1, z) = 2." },
    range: { a: [0, 0, 1], target: 5, clue: "Classify (0, 0, 1) · (1, 1, z) = 5, with inputs from −4 to 4." }
  }[key];
}
const cparts = ([r, i, s, j]) => [[r, i], [s, j]];
const conj = ([r, i]) => [r, -i];
const cmul = ([r, i], [s, j]) => [r * s - i * j, r * j + i * s];
const cfmt = ([r, i]) => {
  if (approx(i, 0)) return fmt(r);
  const imaginary = (approx(Math.abs(i), 1) ? "" : fmt(Math.abs(i))) + "i";
  return approx(r, 0) ? (i < 0 ? "−" : "") + imaginary : fmt(r) + (i < 0 ? " − " : " + ") + imaginary;
};
const ket = v => "(" + cparts(v).map(cfmt).join(", ") + ")";
const inner = (u, v) => {
  const conjugates = cparts(u).map(conj);
  const products = conjugates.map((z, i) => cmul(z, cparts(v)[i]));
  return { conjugates, products, sum: add(...products) };
};
function innerText(u, v, showNorm = true) {
  const m = inner(u, v);
  return "Conjugated u " + "(" + m.conjugates.map(cfmt).join(", ") + "). Products (" +
    m.products.map(cfmt).join(") + (") + ") = " + cfmt(m.sum) + "." +
    (showNorm ? " ‖u‖² = " + fmt(dot(u, u)) + "." : " Commit a norm prediction to reveal ‖u‖².");
}
const measurement = (p, f) => {
  if (!p || !f) return null;
  const amp = inner(f, p).sum;
  return { amp, probability: Math.min(1, dot(amp, amp)) };
};
function polar(degrees) {
  const quarter = degrees / 90;
  const cardinal = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  if (Number.isInteger(quarter)) return cardinal[(quarter % 4 + 4) % 4];
  return [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)];
}
const config = (a, b, angle) => measure([a, 0, 0], [...scale(polar(angle), b), 0]);
const complexPlot = (desc, first, second, symbols) => ({ desc, complex: [first, second], symbols });

const stations = {

    navigation: {
    start(c) { c.s.legs = []; },
    actions: {
      move(c) {
        if (c.busy()) return "The current leg is still in flight.";
        const delta = c.vec("d");
        if (!length(delta)) return "Enter a nonzero displacement to fly.";
        if (c.s.legs.length >= 64) return "This log holds 64 legs. Save a route if needed, then restart at the origin.";
        const move = leg(routeEnd(c.s.legs), delta);
        c.s.legs.push(move);
        c.animate(move);
        return "Flight leg recorded. " + routeText(move) + ".";
      },
      restart(c) { c.stop(); c.s.legs = []; return "Flight restarted at the origin."; },
      pin(c) {
        if (c.s.legs.length < 2) return "Fly at least two legs before saving a route.";
        c.s.saved = [...c.s.legs];
        return "Route saved. Restart and try another path to the same endpoint.";
      }
    },
    show(c) {
      const { legs, saved } = c.s;
      const end = routeEnd(legs);
      const active = c.flight();
      const visible = active ? legs.slice(0, -1) : legs;
      const arrows = visible.map((step, i) => arrow(String(i + 1), step.to, "b", step.from));
      if (active) arrows.push(arrow(String(legs.length), active.point, "b", active.move.from));
      if (legs.length) arrows.push(arrow("resultant", end, "a"));
      const last = legs.at(-1);
      c.put("state", "Start " + tuple(ORIGIN) + " · Position " + tuple(end) + " · Total displacement " + tuple(end) + ".");
      c.put("saved", saved ? "Saved endpoint " + tuple(routeEnd(saved)) + ". Intermediate positions " +
        saved.slice(0, -1).map(item => tuple(item.to)).join(" → ") + "." : "No route saved.");
      if (c.s.lastLogLength !== legs.length) {
        c.s.lastLogLength = legs.length;
        c.node("[data-va-log]").replaceChildren(...legs.map(item => {
          const li = document.createElement("li");
          li.textContent = routeText(item);
          return li;
        }));
      }
      const savedPath = saved ? [path([ORIGIN, ...saved.map(item => item.to)], "extra")] : [];
      const plan = spatial("Recorded route from the origin to " + tuple(end) + ".", arrows, savedPath,
        [marker("one-leg target", [2, 1, -1]), marker("two-leg target", [3, 2, 1])]);
      plan.ship = { point: active?.point ?? end, direction: last?.delta ?? [1, 0, 0] };
      return plan;
    },
    checks: {
      one: [navHelp, "Set the displacement equal to the target coordinates.", c => {
        const r = c.s.legs;
        return grade(r.length === 1 && same(routeEnd(r), [2, 1, -1]),
          "Reach (2, 1, −1) in exactly one leg from the origin.", r.length ? r.map(routeText).join(" → ") : "No legs recorded.");
      }],
      two: [navHelp, "Subtract your intermediate point from (3, 2, 1) to find the second leg.", c => {
        const r = c.s.legs;
        return grade(r.length === 2 && same(routeEnd(r), [3, 2, 1]),
          "Use exactly two nonzero legs and finish at (3, 2, 1).", r.length ? r.map(routeText).join(" → ") : "No legs recorded.");
      }],
      negative: ["Inspect Δz on a recorded leg.", "A negative depth change can end at a positive z.", c => {
        const r = c.s.legs.find(item => item.delta[2] < 0);
        return grade(Boolean(r), "The log needs a leg with negative Δz.",
          r ? routeText(r) + ". Δz is " + fmt(r.delta[2]) + "." : "Read Δz from the displacement in the middle of each leg equation.");
      }],
      routes: [navHelp, "Keep the final sum and change one of the intermediate positions.", c => {
        const { saved, legs } = c.s;
        if (!saved || legs.length < 2) return setup("Save one route and fly a second route with an intermediate point.");
        const middle = route => route.slice(0, -1).map(r => r.to);
        const onRoute = (point, route) => route.some(({ from, delta }) => {
          const offset = subtract(point, from);
          const along = dot(offset, delta) / dot(delta, delta);
          return along >= 0 && along <= 1 && length(cross(offset, delta)) === 0;
        });
        const different = middle(legs).some(point => !onRoute(point, saved)) || middle(saved).some(point => !onRoute(point, legs));
        return grade(different && same(routeEnd(saved), routeEnd(legs)),
          "Match the endpoint and change the path through space. Extra stops on the same track still trace that track.",
          "Saved middle " + middle(saved).map(tuple).join(" → ") + ". Current middle " + middle(legs).map(tuple).join(" → ") +
          ". Endpoints " + tuple(routeEnd(saved)) + " and " + tuple(routeEnd(legs)) + ".");
      }]
    }
  },
  yard: {
    start(c) { c.s.legs = []; },
    conceal(c, check) {
      return check !== "predict" && c.pending("predict", yardDraft(c, true));
    },
    actions: {
      build(c) { buildYard(c); return "Two-leg path built."; },
      reverse(c) {
        if (c.val("operation") !== "add") return "Choose addition for the order comparison.";
        if (!c.s.base || c.s.base.operation !== "add" || !same(c.s.base.a, c.vec("a")) || !same(c.s.base.b, c.vec("b"))) {
          return "Build the sum with these same operands first.";
        }
        const { a, b } = c.s.base;
        c.s.legs = [leg(ORIGIN, b), leg(b, a)];
        c.s.reversal = { first: a, second: b, end: add(b, a) };
        c.s.appended = null;
        return "Reversed addition order.";
      },
      append(c) {
        if (!c.s.base) return "Build the initial path first.";
        if (c.s.legs.length >= 64) return "This plot holds 64 legs. Build the initial path again to clear it.";
        const delta = c.vec("c");
        if (!length(delta)) return "Enter a nonzero extra leg.";
        c.s.appended = leg(routeEnd(c.s.legs), delta);
        c.s.legs.push(c.s.appended);
        return "Extra leg appended.";
      }
    },
    show(c) {
      const { legs, reversal } = c.s;
      const draft = yardDraft(c, true);
      const hide = c.pending("predict", draft);
      c.put("state", hide ? "Predict the components before revealing the translated path and endpoint." :
        (legs.length ? legs.map(routeText).join(" · ") + ". Resultant " + tuple(routeEnd(legs)) + "." : "Set a and b, then build their path."));
      c.put("comparison", reversal && !hide ? "Intermediate points " + tuple(reversal.first) + " and " +
        tuple(reversal.second) + ". Both totals " + tuple(reversal.end) + "." : "No order comparison shown.");
      if (hide) return spatial("Operands only. Resultant concealed pending a prediction.",
        draft ? [arrow("a", draft.a), arrow("b", draft.b, "b")] : []);
      const base = c.s.base;
      const arrows = !base ? [] : [arrow("a operand", base.a), arrow("b operand", base.b, "b"),
        ...legs.map((r, i) => arrow(i === 1 && base.operation === "subtract" ? "−b copy" : "leg " + (i + 1), r.to, "extra", r.from)),
        arrow("resultant", routeEnd(legs), "sum")];
      return spatial("Head-to-tail path and resultant.", arrows);
    },
    checks: {
      endpoint: [navHelp, "Choose two vectors whose x components add to 3, y to 1, and z to 1.", c => {
        const m = c.s.base;
        if (!m || m.operation !== "add") return setup("Build an addition path first.");
        return grade(same(add(m.a, m.b), [3, 1, 1]), "The two-leg sum must reach (3, 1, 1).", routeText(leg(m.a, m.b)) + ".");
      }],
      order: ["The initial endpoint of each leg is the previous leg's tip.", "Choose distinct a and b so their first tips differ.", c => {
        const r = c.s.reversal;
        if (!r) return setup("Build a sum, then use Build b then a.");
        return grade(!same(r.first, r.second), "Choose operands that give distinct intermediate points.",
          tuple(r.first) + " + " + tuple(r.second) + " and " + tuple(r.second) + " + " + tuple(r.first) + " both give " + tuple(r.end) + ".");
      }],
      cancel: [navHelp, "Negate every component of the current nonzero endpoint.", c => {
        const r = c.s.appended;
        if (!r) return setup("Build a path and append a nonzero leg first.");
        return grade(length(r.from) > 0 && !length(r.to), "The last leg must take a nonzero total to the origin.", routeText(r) + ".");
      }],
      predict: ["Add matching components of the arrows in the chosen operation.", "For subtraction, reverse every component of b first.", c => {
        const guess = c.vec("guess");
        const m = buildYard(c);
        c.commit("predict", m);
        const second = m.operation === "add" ? m.b : scale(m.b, -1);
        return grade(same(guess, add(m.a, second)), "Compare your prediction with the component sum.", routeText(leg(m.a, second)) + ".");
      }]
    }
  },
  magnitude: {
    start(c) { c.s.v = c.vec("v"); },
    actions: {
      plot(c) { c.s.v = c.vec("v"); c.s.record = null; return "Vector plotted."; },
      scale(c) {
        const before = c.vec("v"), after = scale(before, c.num("factor"));
        c.s.v = after;
        c.s.record = { before, after };
        return "Scaled the entered vector. The plotted result can extend beyond the input range.";
      },
      pin(c) {
        if (!length(c.s.v)) return "Plot a nonzero vector before saving.";
        c.s.saved = c.s.v;
        return "Vector saved.";
      }
    },
    show(c) {
      const { v, saved, record } = c.s;
      c.put("state", mText(v));
      c.put("record", record ? scaleText(record.before, record.after) : "No scaling comparison.");
      c.put("saved", saved ? "Saved " + mText(saved) : "No vector saved.");
      return spatial(mText(v), [arrow("v", v), ...(saved ? [arrow("saved", saved, "b")] : [])]);
    },
    checks: {
      five: ["Set x² + y² + z² to 25.", "Try the sides of a 3–4–5 triangle in one plane.", c =>
        grade(approx(length(c.s.v), 5), "Plot a vector with length 5.", mText(c.s.v))],
      double: [directionHelp, "A scale of +2 doubles the length without reversing the arrow.", c => scaleGrade(c.s.record, 2, 1)],
      reverse: [directionHelp, "A scale of −1 reverses the arrow and keeps its length.", c => scaleGrade(c.s.record, 1, -1)],
      match: [directionHelp, "Swap unequal components or reverse the vector to keep its length.", c => {
        const { saved, v } = c.s;
        if (!saved) return setup("Save a nonzero vector before plotting its comparison.");
        const m = measure(saved, v);
        return grade(m.lengthB > 0 && approx(m.lengthA, m.lengthB) && !approx(m.cosine, 1),
          "Keep the saved length and change the direction.", scaleText(saved, v));
      }],
      zero: ["Use the length formula on your plotted vector.", "A zero-length arrow has no unit direction.", c =>
        grade(length(c.s.v) === 0 && c.choice("why") === "none", "Plot the zero vector and choose its geometric explanation.",
          mText(c.s.v) + " A direction would require dividing by its length.")]
    }
  },
  dot: {
    start: startPair,
    actions: {
      plot: plotPair,
      scale(c) {
        const before = c.s.m, factor = c.num("factor");
        const after = measure(before.a, scale(before.b, factor));
        c.s.m = after;
        c.s.record = { before, after };
        return "Scaled the plotted b by " + fmt(factor) + ".";
      },
      pin(c) {
        if (c.s.m.cosine !== 1) return "Plot a nonzero pair pointing in the same direction first.";
        c.s.saved = c.s.m;
        return "Saved a parallel pair with normalized alignment +1.";
      }
    },
    show(c) {
      c.put("record", c.s.record ? comparisonText(c.s.record.before, c.s.record.after) : "No scale comparison.");
      c.put("saved", c.s.saved ? "Saved pair: " + pairText(c.s.saved) : "No pair saved.");
      return showPair(c);
    },
    checks: {
      positive: [dotHelp, "Aim for positive products large enough to outweigh any negative ones.", c =>
        dotGrade(c.s.m, c.s.m.product > 0, "The products need a strictly positive sum.")],
      negative: [dotHelp, "Opposing components contribute negative products.", c =>
        dotGrade(c.s.m, c.s.m.product < 0, "The products need a strictly negative sum.")],
      zero: [dotHelp, perpHelp, c =>
        dotGrade(c.s.m, isRight(c.s.m), "Use two nonzero vectors with cancelling products.")],
      scale: [dotHelp, "A positive scale appears both in the numerator and in the magnitude of b.", c => {
        const r = c.s.record;
        if (!r) return setup("Plot a pair with nonzero dot product, then use Scale b and compare.");
        return grade(r.before.product !== 0 && r.after.product !== r.before.product && approx(r.before.cosine, r.after.cosine),
          "Start with nonzero dot product and use a positive scale different from 1.", comparisonText(r.before, r.after));
      }],
      endpoints: ["Parallel nonzero vectors have cosine +1.", "Reverse one of the two arrows to get cosine −1.", c =>
        grade(Boolean(c.s.saved) && c.s.m.cosine === -1, "Save a parallel same-direction pair, then plot an opposite pair.",
          c.s.saved ? comparisonText(c.s.saved, c.s.m) : pairText(c.s.m))]
    }
  },
  ortho: {
    start: startPair,
    actions: { plot: plotPair },
    show(c) {
      const m = c.s.m;
      c.put("door", isRight(m) ? "Door open · two nonzero vectors at 90°." :
        m.cosine === null ? "Door closed · a zero vector supplies no direction." : "Door closed · the dot product is " + fmt(m.product) + ".");
      return showPair(c);
    },
    checks: {
      fixed: [dotHelp, "Make the three components of b sum to zero.", c =>
        dotGrade(c.s.m, same(c.s.m.a, reference) && isRight(c.s.m), "Keep a = (1, 1, 1) and use a nonzero b with zero dot product.")],
      shadow: [perpHelp, "With x and y matching, choose depths whose product cancels x² + y².", c => {
        const m = c.s.m;
        return dotGrade(m, isRight(m) && length(xy(m.a)) > 0 && same(xy(m.a), xy(m.b)),
          "Match the nonzero XY shadows and make the full 3D dot product zero.");
      }],
      missing: [dotHelp, "The first two products add to 3. The last product must cancel them.", c => {
        const z = c.num("missing");
        return grade(2 + 1 + z === 0, "The chosen depth needs to cancel the other terms.",
          "2 + 1 + " + fmt(z) + " = " + fmt(3 + z) + ". The solution is z = −3.");
      }],
      zero: [perpHelp, "Check the denominator of the normalized dot product.", c => {
        const why = c.choice("why"), m = c.s.m;
        return dotGrade(m, m.lengthA > 0 && m.lengthB === 0 && why === "undefined",
          "Use nonzero a and zero b, then identify the undefined angle.");
      }]
    }
  },
  projection: {
    start: startPair,
    actions: { plot: plotPair },
    show(c) {
      const m = c.s.m;
      const pending = m.lengthA > 0 && m.lengthB === 0 && !c.did("source", [m.a, m.b]);
      c.put("state", (pending ? "Submit a prediction to reveal the projection for this zero source." :
        projectionText(m)) + " XY shadow " + tuple(xy(m.b)) + ".");
      return projectionPlot(m, pending);
    },
    checks: {
      forward: [projectionHelp, "The coefficient of a must be positive.", c => projectionGrade(c, m => m.signedComponent > 0, "Choose a defined positive signed component.")],
      back: [projectionHelp, "The coefficient of a must be negative.", c => projectionGrade(c, m => m.signedComponent < 0, "Choose a defined negative signed component.")],
      zero: [projectionHelp, perpHelp, c => projectionGrade(c, isRight, "Use two nonzero perpendicular vectors.")],
      shadow: [projectionHelp, "Compare (bₓ, bᵧ, 0) against the projection vector, component by component.", c =>
        projectionGrade(c, m => m.projection !== null && !close(m.projection, xy(m.b)), "Choose a defined projection that differs from the XY shadow.")],
      source: [projectionHelp, "Track which vector appears in the denominator.", c => {
        const guess = c.choice("guess");
        const m = c.s.m;
        if (m.lengthB !== 0 || !m.lengthA) return setup("Apply zero b with nonzero a for this prediction.");
        c.commit("source", [m.a, m.b]);
        return grade(guess === "zero", "Compare the zero numerator with the nonzero denominator.",
          projectionText(m) + " With zero a the coefficient is undefined. Try changing the reference now.");
      }]
    }
  },
  breakdown: {
    start(c) { startPair(c); c.s.mode = "axes"; },
    actions: { plot(c) { plotPair(c); c.s.mode = c.val("mode"); return "Decomposition applied."; } },
    conceal(c, check) {
      return (check === "remainder" || check === "sum") && c.pending("parallel", [c.s.m.a, c.s.m.b]);
    },
    show(c) {
      const m = c.s.m, key = [m.a, m.b];
      if (c.s.mode === "axes") {
        const [x, y, z] = m.b;
        const parts = [[x, 0, 0], [0, y, 0], [0, 0, z]];
        c.put("state", "Axis steps " + parts.map(tuple).join(" + ") + " = " + tuple(m.b) + ".");
        return spatial("Three successive axis steps reconstruct b.", [
          arrow("x step", [x, 0, 0]), arrow("y step", [x, y, 0], "b", [x, 0, 0]),
          arrow("z step", m.b, "extra", [x, y, 0]), arrow("b", m.b, "sum")
        ]);
      }
      const hidden = c.pending("parallel", key);
      if (hidden || m.projection === null) {
        const desc = hidden ? "The parallel and perpendicular parts await your prediction." : projectionText(m);
        c.put("state", desc);
        return spatial(desc, pairArrows(m));
      }
      const rest = subtract(m.b, m.projection);
      const rightHidden = c.pending("remainder", key);
      const sumHidden = c.pending("sum", key);
      const desc = "b∥ = " + tuple(m.projection) + ". b⊥ = " + tuple(rest) + "." +
        (rightHidden ? " Check your prediction to see a · b⊥." : " a · b⊥ = " + fmt(dot(m.a, rest)) + ".") +
        (length(rest) === 0 ? " The zero remainder has no direction." : "") +
        (sumHidden ? " Predict the reconstructed vector." : " Their sum is b = " + tuple(m.b) + ".");
      c.put("state", desc);
      return spatial(desc, [arrow("a", m.a), arrow("b∥", m.projection, "extra"),
        arrow("b⊥", m.b, "b", m.projection), ...(sumHidden ? [] : [arrow("b", m.b, "sum")])]);
    },
    checks: {
      axes: ["Use the x, then y, then z component as a separate displacement.", "Each step changes just one coordinate.", c => {
        const [x, y, z] = c.s.m.b;
        return grade(c.s.mode === "axes" && same(c.s.m.b, [2, -1, 3]), "Build (2, −1, 3) in Axis components mode.",
          tuple([x, 0, 0]) + " + " + tuple([0, y, 0]) + " + " + tuple([0, 0, z]) + " = " + tuple([x, y, z]) + ".");
      }],
      parallel: [projectionHelp, "Rounded component answers within 0.002 are accepted.", c => {
        const answer = c.vec("parallel"), m = c.s.m;
        if (m.projection === null) return setup("Apply a nonzero reference a first.");
        c.s.mode = "parallel";
        c.set("mode", "parallel");
        c.commit("parallel", [m.a, m.b]);
        return grade(typed(answer, m.projection), "Compare with the computed parallel part.", projectionText(m));
      }],
      remainder: [projectionHelp, "Compute b⊥ = b − b∥ before multiplying by a.", c => {
        const answer = c.num("dot"), m = c.s.m;
        if (!m.projection || c.s.mode !== "parallel") return setup("Build a parallel and perpendicular decomposition with nonzero a.");
        const rest = subtract(m.b, m.projection);
        if (length(rest) < 1e-10) return setup("Choose a nonzero remainder for the geometric angle.");
        c.commit("remainder", [m.a, m.b]);
        return grade(Math.abs(answer - dot(m.a, rest)) <= 0.002, "The expected dot product is zero.",
          "For a · b⊥, " + terms(measure(m.a, rest)) + ". Both directions exist, so their angle is 90°.");
      }],
      sum: ["Add matching components of the two parts.", "b∥ + (b − b∥) reduces to b.", c => {
        const answer = c.vec("sum"), m = c.s.m;
        if (!m.projection || c.s.mode !== "parallel") return setup("Build a parallel and perpendicular decomposition first.");
        c.commit("sum", [m.a, m.b]);
        return grade(typed(answer, m.b), "Add both components along each axis.",
          tuple(m.projection) + " + " + tuple(subtract(m.b, m.projection)) + " = " + tuple(m.b) + " using the unrounded parts.");
      }]
    }
  },

    shadow: {
    start: startPair,
    actions: {
      opening(c) {
        c.writeVec("a", reference);
        c.writeVec("b", [1, 1, -2]);
        c.set("view", "xy");
        c.s.reveals.clear();
        startPair(c);
        return "Opening pair loaded. XY evidence hides z.";
      },
      plot(c) {
        const showDepth = c.val("view") === "xz";
        const read = name => [c.num(name + "x"), c.num(name + "y"),
          showDepth ? c.num(name + "z") : c.s.m[name][2]];
        c.s.m = measure(read("a"), read("b"));
        return showDepth ? "Updated the plotted components." : "Updated the XY evidence.";
      }
    },
    show(c) {
      const m = c.s.m;
      const seeDepth = c.val("view") === "xz";
      c.node("[data-va-depth]").hidden = !seeDepth;
      const desc = seeDepth ? "XZ evidence: a = " + tuple(m.a) + " and b = " + tuple(m.b) + "." :
        "XY evidence: a ends at " + tuple(m.a.slice(0, 2)) + ", b ends at " + tuple(m.b.slice(0, 2)) +
        ". Depth is concealed.";
      const key = [m.a, m.b];
      c.put("state", desc + (c.did("opening", key) ? " " + pairText(m) : "") +
        (c.did("length", key) ? " Lengths " + fmt(m.lengthA) + " and " + fmt(m.lengthB) + "." : ""));
      return spatial(desc, seeDepth ? pairArrows(m) : [arrow("a XY", xy(m.a)), arrow("b XY", xy(m.b), "b")]);
    },
    checks: {
      shared: [lengthHelp, "Reveal and edit z in XZ, holding x and y fixed.", c => {
        const m = c.s.m;
        if (c.val("view") !== "xz") return setup("Use XZ to supply the two depths for this construction.");
        return grade(same(xy(m.a), xy(m.b)) && m.a[2] !== m.b[2], "Match x and y and choose different depths.",
          "a = " + tuple(m.a) + ", b = " + tuple(m.b) + ". XY retains only the first two entries.");
      }],
      view: ["Compare the labels of the two coordinate planes.", "Choose the plane that includes z.", c => {
        const axis = c.choice("axis");
        if (c.val("view") !== "xz") return setup("Switch to the plane that contains the new coordinate.");
        return grade(axis === "z", "XZ includes the previously hidden coordinate z.",
          "In XZ the depths are a_z = " + fmt(c.s.m.a[2]) + " and b_z = " + fmt(c.s.m.b[2]) + ".");
      }],
      length: [lengthHelp, "Compare squared depths, including the case of opposite signs.", c => {
        const answer = c.choice("guess"), m = c.s.m;
        c.commit("length", [m.a, m.b]);
        return grade(answer === "no" && same(xy(m.a), xy(m.b)) && !approx(m.lengthA, m.lengthB),
          "Choose No and show a counterexample with matching shadows and unequal lengths.",
          "For this pair, ‖a‖ = " + fmt(m.lengthA) + " and ‖b‖ = " + fmt(m.lengthB) +
          ". Opposite depths of equal absolute value contribute identical z² terms.");
      }],
      opening: [dotHelp, "Use XZ to supply the third product that XY leaves out.", c => {
        const answer = c.num("dot"), m = c.s.m;
        if (!same(m.a, reference) || !same(m.b, [1, 1, -2])) return setup("Load the opening pair before submitting.");
        c.commit("opening", [m.a, m.b]);
        return dotGrade(m, m.product === answer, "Include the product of the two depths.");
      }]
    }
  },
  alignment: {
    start(c) { c.s.m = config(c.num("a-length"), c.num("b-length"), c.num("angle")); },
    actions: {
      plot(c) {
        const lengths = c.s.locked ?? [c.num("a-length"), c.num("b-length")];
        c.s.m = config(...lengths, c.num("angle"));
        return "Configuration plotted.";
      },
      lock(c) {
        if (c.s.locked) {
          c.s.locked = null;
          return "Length controls unlocked.";
        }
        c.s.locked = [c.s.m.lengthA, c.s.m.lengthB];
        c.set("a-length", Number(c.s.m.lengthA.toFixed(8)));
        c.set("b-length", Number(c.s.m.lengthB.toFixed(8)));
        return "Both plotted lengths are locked.";
      },
      pin(c) {
        if (c.s.m.cosine === null) return "Plot two nonzero vectors before saving.";
        c.s.saved = { m: c.s.m, locked: Boolean(c.s.locked) };
        return "Configuration saved.";
      }
    },
    show(c) {
      const locked = Boolean(c.s.locked);
      c.field("a-length").readOnly = locked;
      c.field("b-length").readOnly = locked;
      const lock = c.node('[data-va-action="lock"]');
      lock.setAttribute("aria-pressed", String(locked));
      lock.textContent = locked ? "Unlock lengths" : "Lock lengths";
      c.put("saved", c.s.saved ? "Saved" + (c.s.saved.locked ? " with lengths locked. " : ". ") +
        pairText(c.s.saved.m) : "No comparison saved.");
      return showPair(c);
    },
    checks: {
      parallel: [directionHelp, "Align b with +x.", c => alignmentGrade(c, 1)],
      right: [directionHelp, "Place b along either ray of the y-axis.", c => alignmentGrade(c, 0)],
      opposite: [directionHelp, "Place b along the negative x-axis.", c => alignmentGrade(c, -1)],
      length: [directionHelp, "Save a pair, leave the direction controls alone, then change a single length.", c => {
        const before = c.s.saved?.m, after = c.s.m;
        if (!before || after.cosine === null) return setup("Save and compare two configurations with nonzero directions.");
        const sameA = approx(before.lengthA, after.lengthA), sameB = approx(before.lengthB, after.lengthB);
        const heading = measure(before.b, after.b).cosine;
        return grade(sameA !== sameB && approx(heading, 1), "Change exactly one length and preserve the heading.",
          comparisonText(before, after));
      }],
      lock: [directionHelp, "Save a positive-dot configuration while locked, then rotate beyond a right angle.", c => {
        const saved = c.s.saved, after = c.s.m;
        if (!saved?.locked || !c.s.locked) return setup("Save the initial pair while locked and keep the lock engaged.");
        const before = saved.m;
        return grade(before.product > 0 && after.product < 0 &&
          approx(before.lengthA, after.lengthA) && approx(before.lengthB, after.lengthB),
          "Start positive and finish negative with both saved lengths fixed.", comparisonText(before, after));
      }]
    }
  },
  codebreaker: {
    start(c) { c.s.key = "missing"; c.s.candidate = null; },
    actions: {
      load(c) {
        c.s.key = c.val("case");
        c.s.candidate = null;
        c.s.saved = null;
        c.s.reveals.clear();
        c.writeVec("b", [1, 1, 0]);
        return "Clue card loaded.";
      },
      try(c) {
        const candidate = c.vec("b");
        c.s.candidate = c.s.key === "construct" ? candidate : [1, 1, candidate[2]];
        return "Candidate evaluated.";
      },
      pin(c) {
        const { key, candidate } = c.s;
        if (key !== "many" || !candidate || dot(codeData(key).a, candidate) !== 2) {
          return "Submit a valid candidate on the Underdetermined card.";
        }
        c.s.saved = candidate;
        return "Candidate saved. Try another depth.";
      }
    },
    show(c) {
      const { key, candidate, saved } = c.s;
      const { a, target, clue } = codeData(key);
      for (const name of ["bx", "by"]) c.field(name).readOnly = key !== "construct";
      c.put("clue", clue);
      c.put("state", candidate ? "Candidate " + tuple(candidate) + " gives " + fmt(dot(a, candidate)) + " with target " +
        fmt(target) + "." : "Submit a candidate to inspect its dot product.");
      c.put("saved", saved ? "Saved candidate " + tuple(saved) + "." : "No candidate saved.");
      return spatial("Reference a and any submitted candidate b.", [arrow("a", a), ...(candidate ? [arrow("b", candidate, "b")] : [])]);
    },
    checks: {
      missing: [dotHelp, "Keep x and y fixed. Move their total to the other side of the equation.", c => codeGrade(c, "missing")],
      construct: [dotHelp, "The third coefficient is zero. Try adjusting the first two components.", c => codeGrade(c, "construct")],
      none: ["Check the coefficient of the missing coordinate.", "With a nonzero coefficient, solve first and check the input range separately.", c => {
        const answer = c.choice("verdict"), key = c.s.key;
        if (key === "many" && answer === "many") {
          return setup("Correct for this clue: every supported depth works. Load Inconsistent or Outside the supported range for this mission.");
        }
        if (key !== "none" && key !== "range") return setup("Load Inconsistent or Outside the supported range.");
        const work = key === "none" ? "2 + 0z stays at 2 for every real z. The target 3 is impossible." :
          "0 + z = 5 has the real solution z = 5, beyond the supported interval [−4, 4].";
        return grade(answer === key, "Check whether a real solution exists before applying the input limits.", work);
      }],
      many: ["If the depth coefficient is zero, changing the depth leaves the product fixed.", "Submit a working depth, save it, and try a different one.", c => {
        const { key, saved, candidate } = c.s;
        if (key !== "many" || !saved || !candidate) return setup("Load Underdetermined and save a valid candidate before trying another.");
        return grade(saved[2] !== candidate[2] && dot(codeData(key).a, candidate) === 2,
          "Choose a valid candidate with a different depth.", tuple(saved) + " and " + tuple(candidate) + " both give 2 because 2 + 0z = 2.");
      }]
    }
  },
  complex: {
    start: readComplex,
    conceal(c, check) {
      const key = [c.s.u, c.s.v];
      return (check !== "real" && check !== "norm" && isRealPair(...key) && c.pending("real", key)) ||
        (check === "zero" && same(c.s.u, [1, 0, 0, 1]) && c.pending("norm", c.s.u));
    },
    actions: {
      compute(c) { readComplex(c); c.s.record = null; return "Complex pair applied."; },
      swap(c) {
        const { u, v } = c.s;
        c.s.record = { before: inner(u, v).sum, after: inner(v, u).sum };
        c.s.u = v;
        c.s.v = u;
        c.writeComplex("u", v);
        c.writeComplex("v", u);
        return "Swapped the applied complex vectors.";
      }
    },
    show(c) {
      const { u, v, record } = c.s;
      const key = [u, v];
      const normHidden = same(u, [1, 0, 0, 1]) && c.pending("norm", u);
      const realHidden = isRealPair(u, v) && c.pending("real", key);
      const desc = "u = " + ket(u) + ", v = " + ket(v) + ".";
      const result = realHidden ? "Commit a real-dot prediction to reveal the product." : innerText(u, v, !normHidden);
      c.put("state", desc + " " + result);
      c.put("record", record && !realHidden ? "Before " + cfmt(record.before) + ". After " + cfmt(record.after) + "." : "No swap comparison shown.");
      return complexPlot(desc, u, v, ["u", "v"]);
    },
    checks: {
      norm: ["The squared magnitude of r + is is r² + s².", "Add the squared magnitudes of the two entries.", c => {
        const answer = c.num("norm"), { u } = c.s;
        if (!same(u, [1, 0, 0, 1])) return setup("Compute with u = (1, i) first.");
        c.commit("norm", u);
        return grade(approx(answer, dot(u, u)), "Check the squared magnitude of each entry.", "|1|² + |i|² = 1 + 1 = 2.");
      }],
      swap: [complexHelp, "The real part stays fixed and the nonzero imaginary part changes sign.", c => {
        const r = c.s.record;
        if (!r) return setup("Compute a pair with nonreal overlap and use Swap u and v.");
        return grade(!approx(r.before[1], 0) && close(conj(r.before), r.after),
          "Try a pair with nonzero imaginary part so the swap is visible.",
          "⟨u,v⟩ = " + cfmt(r.before) + ", and ⟨v,u⟩ = " + cfmt(r.after) + " after interchanging the arguments.");
      }],
      zero: [complexHelp, "Choose products that cancel in both real and imaginary parts.", c => {
        const { u, v } = c.s;
        return grade(length(u) > 0 && length(v) > 0 && close(inner(u, v).sum, [0, 0]),
          "Use two nonzero vectors and make the real and imaginary parts of the total vanish.", innerText(u, v));
      }],
      real: [complexHelp, "A real entry is unchanged by conjugation.", c => {
        const answer = c.num("real"), { u, v } = c.s;
        if (!isRealPair(u, v)) return setup("Use only real components and apply the pair.");
        c.commit("real", [u, v]);
        return grade(approx(answer, inner(u, v).sum[0]), "Add the two ordinary real products.",
          fmt(u[0]) + " × " + fmt(v[0]) + " + " + fmt(u[2]) + " × " + fmt(v[2]) + " = " + fmt(dot(u, v)) + ".");
      }]
    }
  },
  overlap: {
    start(c) { c.s.p = null; c.s.f = null; },
    edit(c, name) {
      if (/^[pf][12][ri]$/.test(name)) {
        c.s[name[0]] = null;
        c.s.record = null;
      }
    },
    actions: {
      "normalize-p": c => normalize(c, "p", "ψ"),
      "normalize-f": c => normalize(c, "f", "φ"),
      phase(c) {
        const side = c.val("phase-side"), degrees = c.num("phase-angle");
        const before = measurement(c.s.p, c.s.f);
        if (!before) return "Normalize both states first.";
        if (degrees % 360 === 0) return "Choose a phase other than a whole turn.";
        const rot = polar(degrees);
        c.s[side] = cparts(c.s[side]).flatMap(z => cmul(z, rot));
        const after = measurement(c.s.p, c.s.f);
        c.s.record = { before, after, side, expected: cmul(before.amp, side === "p" ? rot : conj(rot)) };
        return "Applied a global phase to normalized " + (side === "p" ? "ψ." : "φ.");
      }
    },
    show(c) {
      const { p, f, record } = c.s;
      const result = measurement(p, f);
      const names = ["ψ", "φ"];
      const desc = [p, f].map((v, i) => names[i] + (v ? " = " + ket(v) + " · norm " + fmt(length(v)) :
        " awaits normalization")).join(". ") + ".";
      c.put("state", desc + (result ? " Amplitude ⟨φ|ψ⟩ = " + cfmt(result.amp) +
        ". Yes probability |⟨φ|ψ⟩|² = " + fmt(result.probability) + " for projector |φ⟩⟨φ|." :
        " Normalize both nonzero inputs to obtain a probability."));
      c.put("record", record ? phaseText(record) : "No global phase comparison.");
      return complexPlot(desc, p, f, names);
    },
    checks: {
      one: [overlapHelp, "Use matching components in the two input states.", c =>
        probabilityGrade(c, 1, "Use identical normalized states.", () => close(c.s.p, c.s.f))],
      zero: [overlapHelp, "For example, put all amplitude in different components.", c =>
        probabilityGrade(c, 0, "Make both parts of the complex overlap zero.", result => approx(length(result.amp), 0))],
      half: [overlapHelp, "Try a unit first component for ψ and two equal nonzero components for φ.", c =>
        probabilityGrade(c, 0.5, "Choose an amplitude of magnitude 1/√2.")],
      phase: [overlapHelp, "A nontrivial phase changes the direction of a nonzero complex amplitude in its plane.", c => {
        const r = c.s.record;
        if (!r) return setup("Normalize both states and apply a nontrivial global phase.");
        return grade(length(r.before.amp) > 1e-10 && !close(r.before.amp, r.after.amp) && close(r.expected, r.after.amp) &&
          approx(r.before.probability, r.after.probability), "Use a nonzero starting overlap so the amplitude rotation is visible.", phaseText(r));
      }]
    }
  }
};

function yardDraft(c, quiet = false) {
  const a = c.vec("a", quiet), b = c.vec("b", quiet);
  return a && b ? { a, b, operation: c.val("operation") } : null;
}
function buildYard(c) {
  const draft = yardDraft(c);
  c.s.base = draft;
  const { a, b, operation } = draft;
  c.s.legs = [leg(ORIGIN, a), leg(a, operation === "add" ? b : scale(b, -1))];
  c.s.reversal = null;
  c.s.appended = null;
  return draft;
}
function scaleGrade(record, factor, direction) {
  if (!record) return setup("Apply a scale to a nonzero vector first.");
  const { before, after } = record;
  const m = measure(before, after);
  return grade(m.cosine !== null && approx(m.lengthB, factor * m.lengthA) && approx(m.cosine, direction),
    "Check the length ratio and direction separately.", scaleText(before, after));
}
function startPair(c) { c.s.m = measure(c.vec("a"), c.vec("b")); }
function plotPair(c) {
  startPair(c);
  c.s.record = null;
  return "Pair applied.";
}
function showPair(c) {
  const m = c.s.m;
  c.put("state", pairText(m));
  return spatial(pairText(m), pairArrows(m));
}
const comparisonText = (before, after) => "Before: " + pairText(before) + " After: " + pairText(after);
const isRight = m => m.cosine !== null && m.product === 0;
const dotGrade = (m, pass, fail) => grade(pass, fail, pairText(m));
function projectionGrade(c, check, fail) {
  const m = c.s.m;
  if (m.lengthA && !m.lengthB && !c.did("source", [m.a, m.b])) return setup("Finish the zero-source prediction before inspecting this result.");
  return grade(check(m), fail, projectionText(m) + " XY shadow " + tuple(xy(m.b)) + ".");
}
function alignmentGrade(c, target) {
  return dotGrade(c.s.m, c.s.m.cosine !== null && approx(c.s.m.cosine, target),
    "Use two nonzero lengths and aim for normalized alignment " + fmt(target) + ".");
}
function codeGrade(c, want) {
  const { candidate, key } = c.s;
  if (key !== want || !candidate) return setup("Load the mission's clue card and submit a candidate first.");
  const { a, target } = codeData(key);
  const m = measure(a, candidate);
  return grade(m.product === target, "The candidate needs to give the target product.",
    "a · b = " + terms(m) + ". Target = " + fmt(target) + ".");
}
const isRealPair = (u, v) => u[1] === 0 && u[3] === 0 && v[1] === 0 && v[3] === 0;
function readComplex(c) {
  const u = c.complex("u"), v = c.complex("v");
  c.s.u = u;
  c.s.v = v;
}
function normalize(c, side, name) {
  const draft = c.complex(side), norm = length(draft);
  c.s[side] = norm > 0 ? scale(draft, 1 / norm) : null;
  c.s.record = null;
  return norm ? "Normalized " + name + " from input norm " + fmt(norm) + "." : "The zero input for " + name + " cannot be normalized.";
}
function probabilityGrade(c, target, fail, check = () => true) {
  const r = measurement(c.s.p, c.s.f);
  if (!r) return setup("Normalize both nonzero complex vectors first.");
  return grade(approx(r.probability, target) && check(r), fail,
    "⟨φ|ψ⟩ = " + cfmt(r.amp) + ". Its squared magnitude is " + fmt(r.probability) + ".");
}
function phaseText(r) {
  return "Amplitude before " + cfmt(r.before.amp) + ", after " + cfmt(r.after.amp) +
    ". Yes probability before " + fmt(r.before.probability) + ", after " + fmt(r.after.probability) + ". " +
    (r.side === "p" ? "Phasing ψ multiplies the overlap by that phase." : "Phasing φ multiplies the overlap by the conjugate phase.");
}
class FieldError extends Error {
  constructor(field) { super("Check " + (field.closest("label")?.textContent.trim() || "the selected input") + "."); this.field = field; }
}

function initializeArcade(root, requestDraw, reduced, listen) {
  const get = id => root.querySelector("#va-" + id);
  const details = root.querySelector("#vector-arcade");
  const select = get("station"), reset = get("reset"), status = get("status");
  const figure = get("figure-template").content.firstElementChild.cloneNode(true);
  const toolTemplate = get("mission-template");
  const viewport = figure.querySelector("#va-viewport");
  const geometry = figure.querySelector("[data-va-geometry]");
  const labels = figure.querySelector("[data-va-labels]");
  const desc = figure.querySelector("#va-desc");
  const title = figure.querySelector("#va-title");
  const renderStatus = figure.querySelector("#va-render-status");
  const completion = new Set(), panels = new Map();
  const cards = new Map();
  const uniqueProgress = () => setText(get("progress"),
    completion.size + " of " + cards.size + " missions completed this session.");
  const sig = value => JSON.stringify(value);
  let active, motion = null, timestamp = null, plan = null, shape = null;
  let graphicsOn = false;

  function say(message) { setText(status, message); }
  function stop() { motion = null; timestamp = null; }
  function flight() {
    if (!motion || timestamp === null) return null;
    const t = Math.max(0, Math.min(1, (timestamp - motion.start) / 365));
    return { move: motion.move, point: add(motion.move.from, scale(motion.move.delta, t * t * (3 - 2 * t))) };
  }

  for (const panel of get("panels").querySelectorAll("[data-va-station]")) {
    const key = panel.dataset.vaStation;
    const spec = stations[key];
    const fields = new Map([...panel.querySelectorAll("[name]")].map(field => [field.name, field]));
    const defaults = new Map([...fields].map(([name, field]) => [name, field.value]));
    const field = name => fields.get(name);
    const read = (name, quiet = false) => {
      const input = field(name), n = input.valueAsNumber;
      if (Number.isFinite(n) && input.validity.valid) return n;
      if (quiet) return null;
      throw new FieldError(input);
    };
    const readMany = (prefix, suffixes, quiet) => {
      const values = suffixes.map(suffix => read(prefix + suffix, quiet));
      return values.includes(null) ? null : values;
    };
    const node = selector => panel.querySelector(selector);
    const c = {
      key, panel, spec, defaults, field, node, s: {}, cards: new Map(),
      val: name => field(name).value,
      num: read,
      choice(name) {
        if (field(name).value === "") throw new FieldError(field(name));
        return field(name).value;
      },
      vec: (prefix, quiet) => readMany(prefix, AXES, quiet),
      complex: prefix => readMany(prefix, ["1r", "1i", "2r", "2i"]),
      set(name, value) { field(name).value = String(value); },
      writeVec(prefix, vector) { AXES.forEach((axis, i) => c.set(prefix + axis, vector[i])); },
      writeComplex(prefix, vector) { ["1r", "1i", "2r", "2i"].forEach((k, i) => c.set(prefix + k, vector[i])); },
      put(name, text) { setText(node('[data-va-read="' + name + '"]'), text); },
      did: (id, value) => c.s.reveals.get(id) === sig(value),
      pending: (id, value) => c.cards.get(id).open && !c.did(id, value),
      commit(id, value) { c.s.reveals.set(id, sig(value)); },
      busy: () => Boolean(motion),
      animate(move) {
        if (reduced() || document.hidden || !visible()) return;
        const start = window.performance.now();
        timestamp = start;
        motion = { move, start };
      },
      stop, flight
    };
    panels.set(key, c);
    for (const card of panel.querySelectorAll("[data-va-mission]")) {
      const id = card.dataset.vaMission, check = id.slice(key.length + 1);
      card.append(toolTemplate.content.cloneNode(true));
      c.cards.set(check, card);
      cards.set(id, { card, check, hints: 0 });
      listen(card, "toggle", () => {
        if (active === c && details.open) refresh();
      });
    }
    resetModel(c);
    node("fieldset").disabled = false;
  }

  function resetModel(c) {
    for (const [name, value] of c.defaults) c.set(name, value);
    c.s = { reveals: new Map() };
    c.spec.start(c);
  }

  function visible() {
    if (!details.open || document.hidden || viewport.clientWidth === 0 || viewport.clientHeight === 0) return false;
    const bounds = viewport.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight &&
      bounds.right > 0 && bounds.left < window.innerWidth;
  }

  function refresh() {
    if (!active || !details.open) return;
    const view = active.field("view")?.value ?? "xy";
    plan = active.spec.show(active);
    const caption = active.panel.querySelector("h4").textContent + " · " +
      (plan.complex ? "Complex component planes" : view === "oblique" ? "Orthographic oblique" : view.toUpperCase());
    setText(title, caption);
    setText(desc, plan.desc);
    shape = buildArcadeDrawing(plan, view);
    paintArcadeSvg(shape, geometry, labels);
    requestDraw();
  }

  function mount() {
    stop();
    active = panels.get(select.value) || panels.values().next().value;
    for (const panel of panels.values()) panel.panel.hidden = panel !== active;
    active.node("[data-va-plot-slot]").append(figure);
    renderMode(false, "Coordinate diagram is ready.");
    refresh();
  }

  function renderMode(three, message) {
    graphicsOn = three;
    geometry.style.display = three ? "none" : "";
    setText(renderStatus, message);
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !active.panel.contains(button)) return;
    const action = button.dataset.vaAction;
    const id = button.closest("[data-va-mission]")?.dataset.vaMission;
    const mission = cards.get(id);
    try {
      if (action) {
        if (action === "move" && event.detail > 1) return;
        say(active.spec.actions[action](active));
      } else if (mission && button.hasAttribute("data-va-check")) {
        const prediction = mission.check;
        const evaluation = active.spec.conceal?.(active, prediction)
          ? setup("Check the open prediction before asking for these worked steps.")
          : active.spec.checks[prediction][2](active);
        showGrade(mission, id, evaluation);
      } else if (mission && button.hasAttribute("data-va-hint")) {
        const hintList = mission.card.querySelector("[data-va-hint-list]");
        const li = document.createElement("li");
        li.textContent = active.spec.checks[mission.check][mission.hints];
        hintList.append(li);
        hintList.hidden = false;
        mission.hints += 1;
        button.disabled = mission.hints === 2;
        button.textContent = button.disabled ? "Both hints shown" : "Show second hint";
        return;
      } else return;
    } catch (error) {
      if (!(error instanceof FieldError)) throw error;
      say(error.message);
      if (mission) setText(mission.card.querySelector("[data-va-feedback]"), error.message);
      error.field.reportValidity();
      error.field.focus();
    }
    refresh();
  }

  function showGrade(mission, id, result) {
    const { card } = mission;
    const feedback = card.querySelector("[data-va-feedback]");
    const work = card.querySelector("[data-va-work]");
    const text = card.querySelector("[data-va-work-text]");
    setText(feedback, result.pass ? result.success + " Check the worked steps or try another setup." : result.fail);
    setText(text, result.work || "");
    work.hidden = !result.work;
    if (result.work && !result.pass) work.open = true;
    if (!result.work) work.open = false;
    if (result.pass && !completion.has(id)) {
      completion.add(id);
      card.querySelector("[data-va-done]").hidden = false;
      uniqueProgress();
    }
    say("");
  }

  function handleEdit(event) {
    if (!active.panel.contains(event.target) || !event.target.name) return;
    const id = event.target.closest("[data-va-mission]")?.dataset.vaMission;
    const mission = cards.get(id);
    if (mission) {
      active.s.reveals.delete(mission.check);
      setText(mission.card.querySelector("[data-va-feedback]"), "");
      const work = mission.card.querySelector("[data-va-work]");
      work.hidden = true;
      work.open = false;
    }
    active.spec.edit?.(active, event.target.name);
    refresh();
  }

  reset.disabled = false;
  select.disabled = false;
  uniqueProgress();
  mount();
  listen(details, "click", handleClick);
  listen(details, "input", handleEdit);
  listen(details, "change", handleEdit);
  listen(details, "toggle", () => {
    if (details.open) refresh();
    else { stop(); requestDraw(); }
  });
  listen(select, "change", () => { say(""); mount(); });
  listen(reset, "click", () => {
    stop();
    resetModel(active);
    for (const card of active.cards.values()) {
      setText(card.querySelector("[data-va-feedback]"), "");
      setText(card.querySelector("[data-va-work-text]"), "");
      const work = card.querySelector("[data-va-work]");
      work.hidden = true;
      work.open = false;
    }
    say("Station settings reset. Completed missions are saved for this session.");
    refresh();
  });
  listen(root.querySelector("#vector-arcade-link"), "click", () => {
    details.open = true;
    refresh();
  });

  return {
    viewport, visible, stop, renderMode, refresh,
    get shape() { return shape; },
    get usingThree() { return graphicsOn; },
    tick(now) {
      if (!motion) return;
      if (!visible() || reduced() || now - motion.start >= 365) stop();
      else timestamp = now;
      refresh();
    },
    finish() {
      if (motion) { stop(); refresh(); }
    }
  };
}

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

const plotColors = {
  a: "#63f59b", b: "#cf9aff", sum: "#ffa462", extra: "#65bcff",
  target: "#ffe279", axis: "#6f9580", guide: "#42644e", origin: "#ebfff1"
};
const color = name => plotColors[name];
const plotSize = [560, 340];
const normalOf = v => scale(v, 1 / length(v));

function buildArcadeDrawing(plan, view) {
  const strokes = [], names = [], points = [];
  const line = (coords, pigment, dashed = false, width = 2) => strokes.push({ coords, pigment, dashed, width });
  const label = (text, [x, y], offsets = [9, -10]) => {
    const left = Math.max(9, Math.min(plotSize[0] - text.length * 8 - 10, x + offsets[0]));
    const top = Math.max(20, Math.min(plotSize[1] - 10, y + offsets[1]));
    const row = names.find(p => Math.abs(p.x - left) < text.length * 8 && Math.abs(p.y - top) < 14);
    names.push({ text, x: left, y: row ? Math.min(plotSize[1] - 9, top + 18) : top });
  };
  const tip = (from, to, pigment, name, dashed = false) => {
    const [dx, dy] = subtract(to, from);
    if (Math.hypot(dx, dy) < 0.8) {
      points.push({ at: to, pigment, size: 4 });
    } else {
      const [x, y] = normalOf([dx, dy]);
      const wing = d => [to[0] - 10 * x + d * y, to[1] - 10 * y - d * x];
      line([from, to], pigment, dashed, 2.7);
      line([wing(-4), to, wing(4)], pigment, false, 2.7);
    }
    if (name) label(name, to, dashed ? [9, 16] : [9, -10]);
  };

  if (plan.complex) {
    const vectors = plan.complex;
    const max = Math.max(1, ...vectors.filter(Boolean).flat().map(Math.abs));
    const extent = Math.ceil(max);
    const px = 92 / extent;
    for (const i of [0, 1]) {
      const mid = [140 + 280 * i, 176];
      const map = ([x, y]) => [mid[0] + px * x, mid[1] - px * y];
      const span = extent * 1.18;
      line([map([-span, 0]), map([span, 0])], "axis");
      line([map([0, -span]), map([0, span])], "axis");
      label("Component " + (i + 1), [mid[0] - 62, 25], [0, 0]);
      label("Real", map([span, 0]), [-25, 20]);
      label("Imaginary", map([0, span]), [6, -5]);
      label(fmt(extent), map([extent, 0]), [-6, 18]);
      label(fmt(extent), map([0, extent]), [-26, 5]);
      vectors.forEach((v, j) => {
        if (v) tip(mid, map(cparts(v)[i]), j ? "b" : "a", plan.symbols[j] + (i ? "₂" : "₁"), Boolean(j));
      });
    }
    return { strokes, names, points, ship: null };
  }

  const right = view === "oblique" ? normalOf([18, 14, 0]) : [1, 0, 0];
  const up = view === "oblique" ? normalOf(cross([14, -18, 16], right)) :
    view === "xz" ? [0, 0, 1] : [0, 1, 0];
  const project = v => [dot(v, right), dot(v, up)];
  const all = [...plan.arrows.flatMap(a => [a.from, a.to]), ...plan.paths.flatMap(p => p.points),
    ...plan.markers.map(p => p.point), ...(plan.ship ? [plan.ship.point] : [])].map(project);
  const maxX = Math.max(4, ...all.map(p => Math.abs(p[0])));
  const maxY = Math.max(4, ...all.map(p => Math.abs(p[1])));
  const k = Math.min(222 / maxX, 126 / maxY);
  const map = v => {
    const [x, y] = project(v);
    return [280 + k * x, 176 - k * y];
  };
  const plane = view === "xz" ? 2 : 1;
  const unit = (axis, amount) => AXES.map((_, index) => index === axis ? amount : 0);
  const gridLimit = Math.max(4, Math.min(256, Math.ceil(Math.max(maxX, maxY))));
  const step = Math.max(1, Math.ceil(gridLimit / 9));
  for (let i = -gridLimit; i <= gridLimit; i += step) {
    line([map(add(unit(0, i), unit(plane, -gridLimit))), map(add(unit(0, i), unit(plane, gridLimit)))], "guide", false, 0.7);
    line([map(add(unit(0, -gridLimit), unit(plane, i))), map(add(unit(0, gridLimit), unit(plane, i)))], "guide", false, 0.7);
  }
  const axes = view === "oblique" ? [0, 1, 2] : [0, plane];
  for (const axis of axes) {
    const p = project(unit(axis, 1));
    const extent = Math.min(226 / Math.abs(k * p[0]), 132 / Math.abs(k * p[1]));
    const end = map(unit(axis, extent)), start = map(unit(axis, -extent));
    tip(start, end, "axis", "+" + AXES[axis]);
    const tick = map(unit(axis, step));
    const [vx, vy] = normalOf([p[1], p[0]]);
    line([[tick[0] + vx * 4, tick[1] + vy * 4], [tick[0] - vx * 4, tick[1] - vy * 4]], "axis");
    label(fmt(step), tick, [-10, 17]);
  }
  label("O", map(ORIGIN), [-15, 16]);
  for (const p of plan.paths) line(p.points.map(map), p.color, p.dash);
  for (const a of plan.arrows) tip(map(a.from), map(a.to), a.color, a.label, a.color === "b");
  for (const mark of plan.markers) {
    const at = map(mark.point);
    points.push({ at, pigment: mark.color, size: 5 });
    label(mark.label, at);
  }
  const ship = plan.ship ? { at: map(plan.ship.point), direction: project(plan.ship.direction) } : null;
  if (ship) label(length(ship.direction) < 1e-10 ? "craft · depth heading" : "craft", ship.at, [15, -13]);
  return { strokes, names, points, ship };
}

function paintArcadeSvg(drawing, geometry, labels) {
  const element = (name, attributes, content = "") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (content) node.textContent = content;
    return node;
  };
  const shapes = drawing.strokes.map(({ coords, pigment, dashed, width }) => element("polyline", {
    points: coords.map(p => p.join(",")).join(" "), fill: "none", stroke: color(pigment),
    "stroke-width": width, "stroke-dasharray": dashed ? "5 5" : "none"
  }));
  for (const { at, pigment, size } of drawing.points) {
    shapes.push(element("circle", { cx: at[0], cy: at[1], r: size, fill: "#050d09", stroke: color(pigment), "stroke-width": 2 }));
  }
  if (drawing.ship) {
    const { at, direction } = drawing.ship;
    const rotation = Math.atan2(-direction[1], direction[0]) * 180 / Math.PI;
    shapes.push(element("polygon", {
      points: "15,0 -6,8 -3,2 -10,0 -3,-2 -6,-8", transform: "translate(" + at.join(" ") + ") rotate(" + rotation + ")",
      fill: color("a"), stroke: color("b"), "stroke-width": 2
    }));
  }
  geometry.replaceChildren(...shapes);
  labels.replaceChildren(...drawing.names.map(({ text, x, y }) => element("text", { x, y }, text)));
}

function createArcadeScene(THREE, renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-280, 280, 170, -170, 0.1, 1000);
  camera.position.z = 300;
  const drawing = new THREE.Group();
  scene.add(drawing);
  const materials = {};
  const material = pigment => {
    if (!materials[pigment]) {
      materials[pigment] = new THREE.MeshBasicMaterial({
        color: color(pigment), side: THREE.DoubleSide, depthTest: false, depthWrite: false
      });
    }
    return materials[pigment];
  };

  const ship = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(17, 6, 5), material("a"));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 10), material("extra"));
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 11;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(5, 18, 2), material("b"));
  fin.position.set(-4, 0, 2);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), material("target"));
  canopy.position.set(2, 0, 3);
  for (const [i, object] of [body, fin, nose, canopy].entries()) object.renderOrder = 10000 + i;
  ship.add(body, nose, fin, canopy);
  scene.add(ship);

  function clear() {
    for (const child of drawing.children) child.geometry.dispose();
    drawing.clear();
  }

  function replace(shape) {
    clear();
    let order = 0;
    const addMesh = (geometry, pigment) => {
      const mesh = new THREE.Mesh(geometry, material(pigment));
      mesh.renderOrder = order++;
      drawing.add(mesh);
      return mesh;
    };
    for (const { coords, pigment, dashed, width } of shape.strokes) {
      const vertices = [];
      function quad(from, to, offset, run) {
        if (run <= 0) return;
        const x = from[0] + to[0] * offset - 280;
        const y = 170 - (from[1] + to[1] * offset);
        const dx = to[0] * run, dy = -to[1] * run;
        const sx = -to[1] * width / 2, sy = -to[0] * width / 2;
        const a = [x + sx, y + sy, 0], b = [x - sx, y - sy, 0];
        const c = [x + dx - sx, y + dy - sy, 0], d = [x + dx + sx, y + dy + sy, 0];
        vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
      for (let i = 1; i < coords.length; i += 1) {
        const from = coords[i - 1], delta = subtract(coords[i], from);
        const magnitude = length(delta);
        if (!magnitude) continue;
        const to = scale(delta, 1 / magnitude);
        if (!dashed) quad(from, to, 0, magnitude);
        else for (let start = 0; start < magnitude; start += 10) quad(from, to, start, Math.min(5, magnitude - start));
      }
      if (!vertices.length) continue;
      const meshGeometry = new THREE.BufferGeometry();
      meshGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      addMesh(meshGeometry, pigment);
    }
    for (const { at, pigment, size } of shape.points) {
      const mesh = addMesh(new THREE.RingGeometry(Math.max(1, size - 1.8), size, 16), pigment);
      mesh.position.set(at[0] - 280, 170 - at[1], 1);
    }
    ship.visible = Boolean(shape.ship);
    if (shape.ship) {
      const { at, direction } = shape.ship;
      ship.position.set(at[0] - 280, 170 - at[1], 5);
      ship.rotation.z = Math.atan2(direction[1], direction[0]);
    }
  }

  let lastShape = null;
  return {
    draw(shape, width, height) {
      if (lastShape !== shape) {
        replace(shape);
        lastShape = shape;
      }
      const unit = Math.max(560 / width, 340 / height);
      camera.left = -width * unit / 2;
      camera.right = -camera.left;
      camera.top = height * unit / 2;
      camera.bottom = -camera.top;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    dispose() {
      clear();
      ship.traverse(item => item.geometry?.dispose());
      for (const item of Object.values(materials)) item.dispose();
    }
  };
}

const lesson = document.querySelector(".site-main.vector-lesson");
if (lesson) initializeVectorLab(lesson);