const SVG_NS = "http://www.w3.org/2000/svg";
const ORIGIN = [0, 0];
const LIMIT = 6;
const PRESETS = {
  standard: [[1, 0], [0, 1]],
  skew: [[1, 0], [1, 1]],
  rotated: [[0, 1], [-1, 0]],
  scaled: [[2, 0], [0, 1]],
  dependent: [[1, 0], [2, 0]],
  "zero-arrow": [[1, 0], [0, 0]]
};
const TARGETS = { opening: [3, 2], "on-line": [3, 0], zero: [0, 0] };
const QUESTIONS = {
  swap: {
    answer: "reverse",
    right: "Correct. The diagonal arrow now comes first, so its coefficient 2 moves to the first slot. The endpoint stays at (3, 2).",
    retry: "Keep each coefficient attached to its arrow. How should the slots change when the arrows trade places?"
  },
  dependent: {
    answer: "many",
    right: "Correct. Every combination stays on the horizontal axis. Both (3, 0) and (1, 1) as coefficient pairs reach the target (3, 0).",
    retry: "Both arrows have zero vertical component. For a horizontal target, try reaching three units using either arrow or both together."
  },
  zero: {
    answer: "only",
    right: "Correct. Linear independence means the only combination that adds to the zero vector has both coefficients zero.",
    retry: "Try a pair of nonzero opposite coefficients. They scale two different directions in a valid basis, so the resulting steps cannot cancel."
  }
};
const numberFormat = new Intl.NumberFormat("en", {
  maximumFractionDigits: 3,
  useGrouping: false
});

function format(value) {
  return numberFormat.format(Math.abs(value) < 0.0005 ? 0 : value).replace("-", "−");
}

function isRounded(value) {
  return Math.abs(value - Math.round(value * 1000) / 1000) > 1e-10;
}

function pair([x, y]) {
  return `(${format(x)}, ${format(y)})`;
}

function determinant([ax, ay], [bx, by]) {
  return ax * by - ay * bx;
}

function zero([x, y]) {
  return x === 0 && y === 0;
}

function add([ax, ay], [bx, by]) {
  return [ax + bx, ay + by];
}

function subtract([ax, ay], [bx, by]) {
  return [ax - bx, ay - by];
}

function scale([x, y], factor) {
  return [x * factor, y * factor];
}

function solve(target, [first, second]) {
  // Half-unit inputs are exact in binary, including these products and differences.
  const area = determinant(first, second);
  if (area !== 0) {
    const coefficients = [
      determinant(target, second) / area,
      determinant(first, target) / area
    ];
    const corner = scale(first, coefficients[0]);
    const sum = add(corner, scale(second, coefficients[1]));
    const sine = Math.abs(area) / (Math.hypot(...first) * Math.hypot(...second));
    return { area, kind: "unique", coefficients, corner, sum, nearlyParallel: sine < 0.2 };
  }

  const direction = zero(first) ? second : first;
  if (zero(direction)) {
    return zero(target)
      ? { area, kind: "many", examples: [[0, 0], [1, 0]] }
      : { area, kind: "unreachable" };
  }
  if (determinant(direction, target) !== 0) {
    return { area, kind: "unreachable" };
  }

  const axis = direction[0] === 0 ? 1 : 0;
  const examples = zero(first)
    ? [[0, target[axis] / second[axis]], [1, target[axis] / second[axis]]]
    : [[target[axis] / first[axis], 0], [(target[axis] - second[axis]) / first[axis], 1]];
  return { area, kind: "many", examples };
}

function insidePlot(point) {
  return point.every(value => Math.abs(value) <= LIMIT + 1e-9);
}

// Clip a line or a finite segment to the fixed reference square.
function clip(start, direction, low = -Infinity, high = Infinity) {
  for (let axis = 0; axis < 2; axis++) {
    const position = start[axis];
    const change = direction[axis];
    if (change === 0) {
      if (Math.abs(position) > LIMIT) return null;
      continue;
    }
    const a = (-LIMIT - position) / change;
    const b = (LIMIT - position) / change;
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
  }
  if (low >= high) return null;
  return [add(start, scale(direction, low)), add(start, scale(direction, high))];
}

function stroke(points, color, width, dash = null) {
  return { points, color, width, dash };
}

function makeReference(project) {
  const lines = [];
  for (let tick = -LIMIT; tick <= LIMIT; tick++) {
    lines.push(stroke([project([tick, -LIMIT]), project([tick, LIMIT])], "square", 1));
    lines.push(stroke([project([-LIMIT, tick]), project([LIMIT, tick])], "square", 1));
  }

  const axes = [
    stroke([[25, 210], [397, 210]], "axis", 1.5),
    stroke([[391, 205], [397, 210], [391, 215]], "axis", 1.5),
    stroke([[210, 395], [210, 23]], "axis", 1.5),
    stroke([[205, 29], [210, 23], [215, 29]], "axis", 1.5)
  ];
  return { lines, axes };
}

function makeDiagram(state, result, project, unit) {
  const { target, basis, revealed, grid } = state;
  const lattice = [];
  const arrows = [];
  const steps = [];
  const labels = [];
  const targetPoint = project(target);
  const pairVisible = revealed && result.kind === "unique";

  if (grid && result.kind === "unique") {
    const [first, second] = basis;
    const corners = [[-LIMIT, -LIMIT], [-LIMIT, LIMIT], [LIMIT, -LIMIT], [LIMIT, LIMIT]];
    const families = [
      { direction: first, offset: second, coordinate: point => determinant(first, point) / result.area },
      { direction: second, offset: first, coordinate: point => determinant(point, second) / result.area }
    ];
    for (const { direction, offset, coordinate } of families) {
      const values = corners.map(coordinate);
      const spacing = unit * Math.abs(result.area) / Math.hypot(...direction);
      const interval = Math.max(1, Math.ceil(11 / spacing));
      const left = Math.ceil(Math.min(...values) / interval);
      const right = Math.floor(Math.max(...values) / interval);
      for (let index = left; index <= right; index++) {
        const line = clip(scale(offset, index * interval), direction);
        if (line) lattice.push(stroke(line.map(project), "oblique", 1, [2, 5]));
      }
    }
  }

  function arrow(from, to, color, isStep = false) {
    const direction = subtract(to, from);
    if (Math.hypot(...direction) < 1e-10) return null;
    const segment = clip(from, direction, 0, 1);
    if (!segment) return null;

    const [start, end] = segment.map(project);
    const delta = subtract(end, start);
    const length = Math.hypot(...delta);
    const width = isStep ? 4 : color === "target" ? 3 : 2.4;
    const shapes = isStep ? steps : arrows;
    shapes.push(stroke([start, end], color, width, isStep ? [5, 5] : null));

    if (length > 3 && insidePlot(to)) {
      const heading = scale(delta, 1 / length);
      const normal = [-heading[1], heading[0]];
      const depth = Math.min(isStep ? 10 : 8, length * 0.65);
      const base = subtract(end, scale(heading, depth));
      const wing = scale(normal, depth * 0.55);
      shapes.push(stroke([add(base, wing), end, subtract(base, wing)], color, 2.4));
    }
    return scale(add(start, end), 0.5);
  }

  arrow(ORIGIN, target, "target");
  labels.push({ at: targetPoint, color: "target", lines: [`[v]ₑ ${pair(target)}`] });
  if (pairVisible) labels[0].lines.push(`[v]ʙ ${pair(result.coefficients)}`);

  for (const [index, color, name] of [[0, "first", "b₁"], [1, "second", "b₂"]]) {
    const vector = basis[index];
    arrow(ORIGIN, vector, color);
    labels.push({ at: project(vector), color, lines: [zero(vector) ? `${name} = 0` : name] });
  }

  if (pairVisible) {
    const [c1, c2] = result.coefficients;
    const firstLabel = arrow(ORIGIN, result.corner, "first", true);
    const secondLabel = arrow(result.corner, target, "second", true);
    if (firstLabel) labels.push({ at: firstLabel, color: "first", lines: [`${format(c1)} b₁`] });
    if (secondLabel) labels.push({ at: secondLabel, color: "second", lines: [`${format(c2)} b₂`] });
  }

  return { lattice, arrows, steps, labels, targetPoint };
}

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function drawSvgLines(group, lines, colors) {
  const fragment = document.createDocumentFragment();
  for (const { points, color, width, dash } of lines) {
    const line = svgElement("polyline", {
      points: points.map(point => point.join(",")).join(" "),
      fill: "none",
      stroke: colors[color],
      "stroke-width": width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    if (dash) line.setAttribute("stroke-dasharray", dash.join(" "));
    fragment.append(line);
  }
  group.replaceChildren(fragment);
}

function drawSvgLabels(group, { labels, targetPoint }) {
  const fragment = document.createDocumentFragment();
  const occupied = [];
  fragment.append(svgElement("circle", {
    class: "basis-target-point", cx: targetPoint[0], cy: targetPoint[1], r: 4
  }));

  for (const { at: [x, y], color, lines } of labels) {
    const width = Math.max(...lines.map(text => text.length)) * 9.2;
    const height = lines.length * 18;
    const candidates = [
      [x + 9, y - height], [x - width - 9, y - height],
      [x + 9, y + 8], [x - width - 9, y + 8],
      [x + 9, y - height - 22], [x - width - 9, y + 30]
    ];
    const bounds = candidates.map(([left, top]) => [
      Math.max(4, Math.min(416 - width, left)),
      Math.max(4, Math.min(416 - height, top))
    ]);
    const [left, top] = bounds.find(([candidateX, candidateY]) => occupied.every(box =>
      candidateX + width + 4 <= box.x || box.x + box.width + 4 <= candidateX ||
      candidateY + height + 4 <= box.y || box.y + box.height + 4 <= candidateY
    )) ?? bounds[0];

    lines.forEach((value, index) => {
      const text = svgElement("text", {
        class: `basis-${color}`, x: left, y: top + 14 + index * 18
      });
      text.textContent = value;
      fragment.append(text);
    });
    occupied.push({ x: left, y: top, width, height });
  }

  group.replaceChildren(fragment);
}

function wireChallenge(find, listen) {
  const form = find("challenge-form");
  const check = find("challenge-check");
  const next = find("challenge-next");
  const restart = find("challenge-restart");
  const feedback = find("challenge-feedback");
  const panels = [...form.querySelectorAll("[data-basis-question]")];
  let index = 0;

  function showQuestion() {
    panels.forEach((panel, position) => { panel.hidden = position !== index; });
    check.hidden = false;
    next.hidden = true;
    restart.hidden = true;
    feedback.textContent = "";
    panels[index].querySelector("h4").focus();
  }

  listen(form, "submit", event => {
    event.preventDefault();
    const current = panels[index];
    const choice = current.querySelector("input:checked");
    const { answer, right, retry } = QUESTIONS[current.dataset.basisQuestion];
    if (!choice) {
      feedback.textContent = "Choose an answer first.";
      current.querySelector("input").focus();
      return;
    }
    const correct = choice.value === answer;
    feedback.textContent = correct ? right : retry;
    next.hidden = !correct || index === panels.length - 1;
    restart.hidden = !correct || index < panels.length - 1;
  });

  listen(form, "change", () => {
    feedback.textContent = "";
    next.hidden = true;
    restart.hidden = true;
  });
  listen(next, "click", () => {
    index++;
    showQuestion();
  });
  listen(restart, "click", () => {
    form.reset();
    index = 0;
    showQuestion();
  });
}

function initializeBasisLab(root) {
  const find = id => root.querySelector(`#basis-${id}`);
  const controls = find("controls");
  const preset = find("preset");
  const grid = find("grid-toggle");
  const prediction = find("prediction");
  const predictionControls = find("prediction-controls");
  const predictionFeedback = find("prediction-feedback");
  const guesses = [find("guess-c1"), find("guess-c2")];
  const targetInputs = [find("target-x"), find("target-y")];
  const basisInputs = [[find("b1-x"), find("b1-y")], [find("b2-x"), find("b2-y")]];
  const viewport = find("viewport");
  const canvas = find("canvas");
  const svg = find("svg");
  const svgLattice = find("svg-lattice");
  const svgArrows = find("svg-arrows");
  const svgSteps = find("svg-steps");
  const svgLabels = find("svg-labels");
  const description = find("svg-desc");
  const standardReadout = find("standard-readout");
  const firstReadout = find("first-readout");
  const secondReadout = find("second-readout");
  const activeReadout = find("active-readout");
  const areaReadout = find("area-readout");
  const reconstruction = find("reconstruction-readout");
  const status = find("status");

  const unit = Number(svg.dataset.unitPx);
  const origin = [Number(svg.dataset.originX), Number(svg.dataset.originY)];
  const size = svg.viewBox.baseVal.width;
  const project = ([x, y]) => [origin[0] + x * unit, origin[1] - y * unit];
  const css = getComputedStyle(root);
  const colors = Object.fromEntries(
    ["square", "oblique", "axis", "target", "first", "second", "plot"]
      .map(name => [name, css.getPropertyValue(`--basis-${name}`).trim()])
  );
  const reference = makeReference(project);
  const state = {
    target: [...TARGETS.opening],
    basis: PRESETS.skew.map(vector => [...vector]),
    revealed: false,
    grid: true
  };
  const lifetime = new AbortController();
  const listen = (node, event, handler) => node.addEventListener(event, handler, { signal: lifetime.signal });
  let result;
  let diagram;
  let graphics = null;
  let frame = null;
  let pageActive = true;
  let contextLost = false;
  let disposed = false;

  function showSvg() {
    viewport.dataset.renderer = "svg";
    canvas.hidden = true;
  }

  function cancelDraw() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function requestDraw() {
    if (!graphics || disposed || !pageActive || document.hidden || contextLost || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!graphics || disposed || !pageActive || document.hidden || contextLost) return;
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (width === 0 || height === 0) {
        showSvg();
        return;
      }
      try {
        graphics.draw(diagram, width, height);
        if (contextLost || graphics.isLost()) {
          showSvg();
          return;
        }
        canvas.hidden = false;
        viewport.dataset.renderer = "webgl";
      } catch {
        showSvg();
        if (!graphics.isLost()) {
          graphics.dispose();
          graphics = null;
        }
      }
    });
  }

  function setReconstruction() {
    if (result.kind !== "unique" || !state.revealed) {
      reconstruction.textContent = "—";
      return;
    }
    const [first, second] = state.basis;
    const [c1, c2] = result.coefficients;
    const pieces = [
      ["basis-first", `${format(c1)}${pair(first)}`],
      ["basis-second", `${format(c2)}${pair(second)}`],
      ["basis-target", pair(result.sum)]
    ].map(([className, value]) => {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = value;
      return span;
    });
    const rounded = [c1, c2].some(isRounded);
    reconstruction.replaceChildren(pieces[0], " + ", pieces[1], rounded ? " ≈ " : " = ", pieces[2]);
  }

  function render() {
    result = solve(state.target, state.basis);
    diagram = makeDiagram(state, result, project, unit);
    drawSvgLines(svgLattice, diagram.lattice, colors);
    drawSvgLines(svgArrows, diagram.arrows, colors);
    drawSvgLines(svgSteps, diagram.steps, colors);
    drawSvgLabels(svgLabels, diagram);

    standardReadout.textContent = pair(state.target);
    firstReadout.textContent = pair(state.basis[0]);
    secondReadout.textContent = pair(state.basis[1]);
    areaReadout.textContent = format(result.area);

    let message;
    if (result.kind === "unique") {
      activeReadout.textContent = state.revealed ? pair(result.coefficients) : "Awaiting reveal";
      message = result.nearlyParallel
        ? "Valid basis, with nearly collinear arrows. A small change in the target can require a large change in the coefficients."
        : "Two independent arrows give one unique coefficient pair.";
      if (state.revealed && !insidePlot(result.corner)) {
        message += ` The first step ends at ${pair(result.corner)}, outside the fixed grid. The visible steps are clipped at its edge.`;
      }
      if (state.revealed && zero(state.target)) {
        message += " Both steps have length zero, so the target is marked at the origin.";
      }
    } else if (result.kind === "many") {
      activeReadout.textContent = "No unique pair";
      const [first, second] = result.examples;
      message = `Dependent arrows. The target is reachable, but infinitely many pairs work. Two examples are ${pair(first)} and ${pair(second)}.`;
      if (result.examples.flat().some(isRounded)) {
        message += " Coefficients are rounded to three decimal places where needed.";
      }
      if (zero(state.basis[0]) && zero(state.basis[1])) {
        message = "Both arrows are zero. Every coefficient pair reaches this zero target.";
      }
    } else {
      activeReadout.textContent = "Unreachable";
      message = zero(state.basis[0]) && zero(state.basis[1])
        ? "Both arrows are zero and reach only the origin."
        : "Dependent arrows. This target lies off the line the arrows can reach.";
    }

    predictionControls.disabled = result.kind !== "unique";
    status.textContent = message;
    description.textContent = `Target ${pair(state.target)} on the standard grid. First arrow ${pair(state.basis[0])}. Second arrow ${pair(state.basis[1])}. ${result.kind === "unique" && state.revealed
      ? `The steps use coefficients ${pair(result.coefficients)} and end at the target. `
      : ""}${message}`;
    setReconstruction();
    requestDraw();
  }

  function syncInputs(inputs, vector) {
    inputs.forEach((input, index) => {
      input.value = vector[index];
      input.removeAttribute("aria-invalid");
    });
  }

  function clearPrediction() {
    state.revealed = false;
    predictionFeedback.textContent = "";
    guesses.forEach(input => { input.value = ""; });
  }

  function applyChange() {
    clearPrediction();
    render();
  }

  function bindComponents(inputs, vector, onEdit) {
    inputs.forEach((input, index) => {
      listen(input, "input", () => {
        if (!input.validity.valid) {
          input.setAttribute("aria-invalid", "true");
          status.textContent = "Use a value within the control’s limits in half-unit increments. The diagram still shows the last valid setting.";
          return;
        }
        input.removeAttribute("aria-invalid");
        if (input.valueAsNumber === vector()[index]) {
          render();
          return;
        }
        vector()[index] = input.valueAsNumber;
        onEdit();
        applyChange();
      });
      listen(input, "blur", () => {
        if (input.validity.valid) return;
        input.value = vector()[index];
        input.removeAttribute("aria-invalid");
        render();
      });
    });
  }

  bindComponents(targetInputs, () => state.target, () => {});
  basisInputs.forEach((inputs, index) => {
    bindComponents(inputs, () => state.basis[index], () => { preset.value = "custom"; });
  });

  function selectBasis(name) {
    state.basis = PRESETS[name].map(vector => [...vector]);
    basisInputs.forEach((inputs, index) => syncInputs(inputs, state.basis[index]));
    preset.value = name;
  }

  listen(preset, "change", () => {
    if (!Object.hasOwn(PRESETS, preset.value)) return;
    selectBasis(preset.value);
    applyChange();
  });

  for (const button of controls.querySelectorAll("button[data-basis-target]")) {
    listen(button, "click", () => {
      state.target = [...TARGETS[button.dataset.basisTarget]];
      syncInputs(targetInputs, state.target);
      applyChange();
    });
  }

  listen(find("swap"), "click", () => {
    state.basis.reverse();
    basisInputs.forEach((inputs, index) => syncInputs(inputs, state.basis[index]));
    preset.value = "custom";
    applyChange();
  });

  listen(find("reset"), "click", () => {
    selectBasis("skew");
    state.target = [...TARGETS.opening];
    syncInputs(targetInputs, state.target);
    grid.checked = state.grid = true;
    applyChange();
  });

  listen(grid, "change", () => {
    state.grid = grid.checked;
    render();
  });

  listen(prediction, "submit", event => {
    event.preventDefault();
    if (result.kind !== "unique" || !prediction.reportValidity()) return;
    const submitted = guesses.map(input => input.valueAsNumber);
    const answer = result.coefficients;
    const correct = submitted.every((value, index) => Math.abs(value - answer[index]) <= 0.000500001);
    const actual = pair(answer);
    predictionFeedback.textContent = correct
      ? `Your prediction matches ${actual}. The head-to-tail steps reach the target.`
      : `Your prediction was ${pair(submitted)}. The pair is ${actual}. Follow the two steps, then swap the arrows or try a new preset and predict again.`;
    state.revealed = true;
    render();
  });

  listen(find("reveal"), "click", () => {
    if (result.kind !== "unique") return;
    predictionFeedback.textContent = "";
    state.revealed = true;
    render();
  });

  wireChallenge(find, listen);
  // Establish the functional SVG and controls before importing an optional renderer.
  selectBasis("skew");
  syncInputs(targetInputs, state.target);
  grid.checked = state.grid;
  render();
  controls.disabled = false;
  find("challenge-controls").disabled = false;
  find("static-note").hidden = true;

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(requestDraw) : null;
  observer?.observe(viewport);
  listen(window, "resize", requestDraw);
  listen(document, "visibilitychange", () => {
    if (document.hidden) cancelDraw();
    else requestDraw();
  });
  listen(canvas, "webglcontextlost", event => {
    event.preventDefault();
    contextLost = true;
    cancelDraw();
    showSvg();
  });
  listen(canvas, "webglcontextrestored", () => {
    contextLost = false;
    requestDraw();
  });
  listen(window, "pageshow", () => {
    pageActive = true;
    requestDraw();
  });
  listen(window, "pagehide", event => {
    pageActive = false;
    cancelDraw();
    if (event.persisted) return;
    disposed = true;
    lifetime.abort();
    observer?.disconnect();
    graphics?.dispose();
    graphics = null;
  });

  async function loadRenderer() {
    try {
      const THREE = await import("../vendor/three.module.js");
      if (disposed) return;
      graphics = createRenderer(THREE, canvas, size, colors, reference);
      requestDraw();
    } catch {
      showSvg();
    }
  }

  loadRenderer();
}

// Draw each stroke as triangles so line widths and dashes work in WebGL.
function appendStroke(shape, size, color, positions, colors) {
  const { points, width, dash } = shape;

  function addVertex([x, y]) {
    positions.push(x, size - y, 0);
    colors.push(color.r, color.g, color.b);
  }

  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const delta = subtract(points[index], start);
    const length = Math.hypot(...delta);
    if (length < 1e-10) continue;
    const direction = scale(delta, 1 / length);
    const normal = scale([-direction[1], direction[0]], width / 2);
    const [draw, gap] = dash ?? [length, 0];

    for (let offset = 0; offset < length; offset += draw + gap) {
      const from = add(start, scale(direction, offset));
      const to = add(start, scale(direction, Math.min(length, offset + draw)));
      const a = add(from, normal);
      const b = subtract(from, normal);
      const c = add(to, normal);
      const d = subtract(to, normal);
      [a, b, c, c, b, d].forEach(addVertex);
    }
  }
}

function createRenderer(THREE, canvas, size, colors, reference) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(colors.plot);
  const camera = new THREE.OrthographicCamera(0, size, size, 0, 0.1, 10);
  camera.position.z = 1;
  const palette = Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [name, new THREE.Color(value)])
  );
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let previousDiagram = null;
  let dimensions = "";

  return {
    draw(diagram, width, height) {
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const nextDimensions = `${width}:${height}:${density}`;
      if (nextDimensions !== dimensions) {
        renderer.setDrawingBufferSize(width, height, density);
        dimensions = nextDimensions;
      }
      if (previousDiagram !== diagram) {
        const positions = [];
        const vertexColors = [];
        const shapes = [...reference.lines, ...diagram.lattice, ...reference.axes, ...diagram.arrows, ...diagram.steps];
        for (const shape of shapes) {
          appendStroke(shape, size, palette[shape.color], positions, vertexColors);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        previousDiagram = diagram;
      }
      renderer.render(scene, camera);
    },
    isLost() {
      return renderer.getContext().isContextLost();
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    }
  };
}

// ---------------------------------------------------------------------------
// Basis Arcade · optional practice stations.
// Everything below uses the "ba" prefix and runs separately from the Basis
// Translator, so the lab and the challenge above behave exactly as before.
// ---------------------------------------------------------------------------

const BA_TOLERANCE = 0.002;
const BA_SIZE = [560, 360];
const BA_CENTER = [280, 180];
const baNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 3, useGrouping: false });

function baFmt(value) {
  return baNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
}
const baPair = vector => "(" + vector.map(baFmt).join(", ") + ")";
const baParen = value => value < 0 ? "(" + baFmt(value) + ")" : baFmt(value);
const baTimes = (a, b) => baParen(a) + "·" + baParen(b);
const baSame = (a, b) => a.length === b.length && a.every((n, i) => Math.abs(n - b[i]) < 1e-9);
// An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
const baTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
const baFits = (value, answer) => Math.abs(value - answer) <= (baTerminates(answer) ? 1e-9 : BA_TOLERANCE + 1e-12);
const baFitsAll = (values, answers) => values.every((value, i) => baFits(value, answers[i]));
const baIsZero = vector => vector.every(n => n === 0);
const baInner = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const baCombo = (basis, coefficients) => basis[0].map((_, axis) =>
  basis.reduce((sum, vector, i) => sum + coefficients[i] * vector[axis], 0));

function baSolve([first, second], target) {
  const area = determinant(first, second);
  return area === 0 ? null : [determinant(target, second) / area, determinant(first, target) / area];
}

// Show exact fractions such as 1/3 in worked steps, and ≈ for irrational values.
function baShow(value) {
  if (baTerminates(value)) return baFmt(value);
  for (let q = 2; q <= 60; q++) {
    const p = Math.round(value * q);
    if (Math.abs(value * q - p) < 1e-9) return (p < 0 ? "−" : "") + Math.abs(p) + "/" + q;
  }
  return "≈ " + baFmt(value);
}

// Parse 2, −1.5, 1/3, √2, 2√2, 1/√2, √2/2 or sqrt(2)/2.
const BA_TERM = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)?(?:√\(?(\d+(?:\.\d*)?|\.\d+)\)?)?$/;
function baTerm(text) {
  const match = BA_TERM.exec(text);
  if (!match || (match[2] === undefined && match[3] === undefined)) return null;
  const coefficient = match[2] === undefined ? 1 : Number(match[2]);
  const root = match[3] === undefined ? 1 : Math.sqrt(Number(match[3]));
  return (match[1] === "-" ? -1 : 1) * coefficient * root;
}
function baParse(raw) {
  const text = String(raw).trim().toLowerCase()
    .replace(/[−–—]/g, "-").replace(/\s+/g, "").replace(/sqrt/g, "√");
  if (!text || text.length > 24) return null;
  const parts = text.split("/");
  if (parts.length > 2) return null;
  const top = baTerm(parts[0]);
  const bottom = parts.length === 2 ? baTerm(parts[1]) : 1;
  if (top === null || bottom === null || bottom === 0) return null;
  const value = top / bottom;
  return Number.isFinite(value) ? value : null;
}

const baArrow = (to, color, label = "", from = [0, 0], options = {}) => ({ to, color, label, from, ...options });
const baMark = (at, color, label = "", options = {}) => ({ at, color, label, ...options });
const baGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
const baSetup = message => baGrade(false, message);
const baCard = c => (c.s.card && c.spec.cards?.[c.s.card]) ? c.s.card : c.spec.defaultCard;

function baSteps(basis, coefficients, names = ["b₁", "b₂"], colors = ["first", "second"]) {
  const corner = scale(basis[0], coefficients[0]);
  const end = add(corner, scale(basis[1], coefficients[1]));
  return [
    baArrow(corner, colors[0], baShow(coefficients[0]) + " " + names[0], [0, 0], { dashed: true }),
    baArrow(end, colors[1], baShow(coefficients[1]) + " " + names[1], corner, { dashed: true })
  ].filter((_, i) => Math.abs(coefficients[i]) > 1e-12);
}

function baBuildWork([b1, b2], [c1, c2]) {
  const one = scale(b1, c1), two = scale(b2, c2);
  return baShow(c1) + "·" + baPair(b1) + " + " + baShow(c2) + "·" + baPair(b2) + " = " +
    baPair(one) + " + " + baPair(two) + " = " + baPair(add(one, two)) + ".";
}

function baSolveWork([b1, b2], v, names = ["c₁", "c₂"]) {
  const D = determinant(b1, b2);
  const [c1, c2] = baSolve([b1, b2], v);
  return "D = " + baTimes(b1[0], b2[1]) + " − " + baTimes(b1[1], b2[0]) + " = " + baFmt(D) +
    ". " + names[0] + " = (" + baTimes(v[0], b2[1]) + " − " + baTimes(v[1], b2[0]) + ") / " + baParen(D) + " = " + baShow(c1) +
    ". " + names[1] + " = (" + baTimes(b1[0], v[1]) + " − " + baTimes(b1[1], v[0]) + ") / " + baParen(D) + " = " + baShow(c2) +
    ". Check: " + baBuildWork([b1, b2], [c1, c2]);
}

function baLabelText(field) {
  const label = field.closest("label");
  if (!label) return "the selected input";
  const copy = label.cloneNode(true);
  copy.querySelectorAll("input, select, textarea").forEach(node => node.remove());
  return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
}

class BaFieldError extends Error {
  constructor(field, detail = "", custom = false) {
    super("Check " + baLabelText(field) + "." + (detail ? " " + detail : ""));
    this.field = field;
    this.detail = detail;
    this.custom = custom;
  }
}

// Write text, turning "[v]_E" into [v]<sub>E</sub> to match the lesson's notation.
function baRich(element, text) {
  text = String(text ?? "");
  if (!element || element.dataset.baText === text) return;
  element.dataset.baText = text;
  const nodes = [];
  for (const part of text.split(/(\]_[A-Za-z])/)) {
    if (/^\]_[A-Za-z]$/.test(part)) {
      const sub = document.createElement("sub");
      sub.textContent = part[2];
      nodes.push("]", sub);
    } else if (part) nodes.push(part);
  }
  element.replaceChildren(...nodes);
}
const baPlain = text => String(text).replace(/\]_([A-Za-z])/g, "]$1");
function baSetPlain(element, text) {
  const plain = baPlain(text);
  if (element.textContent !== plain) element.textContent = plain;
}

function baPalette(root) {
  const css = getComputedStyle(root);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    first: read("--basis-first", "#65b7ff"),
    second: read("--basis-second", "#c19bff"),
    target: read("--basis-target", "#ffe16a"),
    sum: read("--orange", "#ff9f55"),
    good: read("--green", "#63f59b"),
    bad: read("--red", "#ff676f"),
    axis: read("--basis-axis", "#a9b8c7"),
    grid: read("--basis-square", "#3b4e60"),
    lattice: read("--basis-oblique", "#745b95"),
    plot: read("--basis-plot", "#081019"),
    ink: read("--ink", "#ecfff1"),
    dim: "#4a5d70"
  };
}

// ---------------------------------------------------------------------------
// Station definitions. Each station has start / actions / show / checks, where
// each check is [first hint, second hint, grader].
// ---------------------------------------------------------------------------

function baDecodeCheck(key) {
  return c => {
    const { basis, v } = c.spec.cards[key];
    const entry = [c.ans(key + "-c1"), c.ans(key + "-c2")];
    const pass = baFitsAll(entry, baSolve(basis, v));
    return baGrade(pass,
      "Your pair rebuilds " + baPair(baCombo(basis, entry)) + " instead of " + baPair(v) +
        ". Substitute it into both component equations to see which one fails.",
      pass ? baSolveWork(basis, v) : "Your pair: " + baBuildWork(basis, entry));
  };
}

function baEncodeCheck(key) {
  return c => {
    const { basis, coords } = c.spec.cards[key];
    const entry = [c.ans(key + "-x"), c.ans(key + "-y")];
    const answer = baCombo(basis, coords);
    const pass = baFitsAll(entry, answer);
    if (pass) c.s.revealed[key] = true;
    return baGrade(pass,
      "Your point is " + baPair(entry) + ". Recompute each component: x = c₁b₁x + c₂b₂x and y = c₁b₁y + c₂b₂y.",
      pass ? "[v]_E = " + baBuildWork(basis, coords) : "");
  };
}

function baNamesCheck(key) {
  return c => {
    const { basis } = c.spec.cards[key];
    const v = c.spec.v;
    const entry = [c.ans(key + "-c1"), c.ans(key + "-c2")];
    const answer = baSolve(basis, v);
    const pass = baFitsAll(entry, answer);
    if (pass) c.s.found[key] = { basis, coords: answer };
    return baGrade(pass,
      "Your pair rebuilds " + baPair(baCombo(basis, entry)) + ", not v = (4, 2).",
      pass ? baSolveWork(basis, v) : "Your pair: " + baBuildWork(basis, entry));
  };
}

const baNavMove = (net, code, direction) => {
  const index = code[1] === "1" ? 0 : 1;
  const sign = (code[2] === "+" ? 1 : -1) * direction;
  return net.map((n, i) => i === index ? n + sign : n);
};
const baStepName = code => (code[2] === "+" ? "+" : "−") + (code[1] === "1" ? "b₁" : "b₂");
const baNavPoint = c => baCombo(c.spec.basis, c.s.net);
const baNetWork = c => "Net steps " + baFmt(c.s.net[0]) + " and " + baFmt(c.s.net[1]) + ": " +
  baBuildWork(c.spec.basis, c.s.net);

function baFrame(degrees) {
  const turn = degrees * Math.PI / 180;
  const clean = n => Math.abs(n) < 1e-12 ? 0 : n;
  return [[clean(Math.cos(turn)), clean(Math.sin(turn))], [clean(-Math.sin(turn)), clean(Math.cos(turn))]];
}

function baAreaGrade(c, target) {
  const b1 = c.vec("b1"), b2 = c.vec("b2");
  const D = determinant(b1, b2);
  return baGrade(D === target, "D = " + baFmt(D) + ". Aim for " + baFmt(target) + ".",
    "D = " + baTimes(b1[0], b2[1]) + " − " + baTimes(b1[1], b2[0]) + " = " + baFmt(D) + ".");
}

function baPredictGrade(c, key, basis, answer, work) {
  const guess = [c.ans(key + "-d"), c.ans(key + "-c1"), c.ans(key + "-c2")];
  const current = [c.vec("b1"), c.vec("b2")];
  if (!baSame(current[0], basis[0]) || !baSame(current[1], basis[1])) {
    return baSetup("Keep your prediction, then load the starting pair and press " + (key === "swap" ? "Swap" : "Double b₁") +
      " once, so that b₁ = " + baPair(basis[0]) + " and b₂ = " + baPair(basis[1]) + ".");
  }
  c.s.shown[key] = true;
  const pass = baFitsAll(guess, answer);
  return baGrade(pass, "You predicted D = " + baFmt(guess[0]) + " and [v]_B = " + baPair(guess.slice(1)) +
    ". The readout now shows the actual values. Compare the two.", pass ? work : "");
}

function baDesignCheck(key) {
  return c => {
    const { v, coords, lock } = c.spec.cards[key];
    const basis = [c.vec("b1"), c.vec("b2")];
    if (lock && !baSame(basis[0], lock)) return baSetup("Keep b₁ = " + baPair(lock) + " for this card. The button sets it for you.");
    const D = determinant(...basis);
    const end = baCombo(basis, coords);
    if (D === 0) return baGrade(false, "D = 0, so these arrows are not a basis" + (baSame(end, v) ? ", even though they reach the target." : "."));
    const pass = baSame(end, v);
    return baGrade(pass, baShow(coords[0]) + " b₁ + " + baShow(coords[1]) + " b₂ = " + baPair(end) + ", not " + baPair(v) + ".",
      pass ? "Your basis b₁ = " + baPair(basis[0]) + ", b₂ = " + baPair(basis[1]) + " has D = " + baFmt(D) + " ≠ 0. " +
        baBuildWork(basis, coords) + " Because D ≠ 0, these are the only coordinates of the target in your basis." : "");
  };
}

function baOrthoCheck(key, work) {
  return c => {
    const card = c.spec.cards[key];
    const entry = [c.ans(key + "-c1"), c.ans(key + "-c2")];
    const pass = baFitsAll(entry, card.answer);
    if (pass) c.s.revealed[key] = true;
    return baGrade(pass, "Your pair rebuilds " + baPair(baCombo(card.basis, entry)) + " instead of " + baPair(card.v) + ".", pass ? work : "");
  };
}

function baQuantumCheck(key) {
  return c => {
    const card = c.spec.cards[key];
    const r = Math.SQRT1_2;
    const entry = [c.ans(key + "-a"), c.ans(key + "-b")];
    const pass = baFitsAll(entry, card.answer);
    if (pass) c.s.revealed[key] = true;
    const fail = card.ask === "z"
      ? "Your z coordinates " + baPair(entry) + " give x coordinates " + baPair([(entry[0] + entry[1]) * r, (entry[0] - entry[1]) * r]) + ", not (0.8, −0.6)."
      : "Your coefficients rebuild z coordinates " + baPair([(entry[0] + entry[1]) * r, (entry[0] - entry[1]) * r]) + ", not " + baPair(card.z) + ".";
    return baGrade(pass, fail, pass ? card.work : "");
  };
}

const BA_XYZ = ["x", "y", "z"];
const baAdd3 = (a, b) => a.map((n, i) => n + b[i]);
const baSubtract3 = (a, b) => a.map((n, i) => n - b[i]);
const baScale3 = (v, factor) => v.map(n => n * factor);
const baLerp3 = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
const baCross3 = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
const baDet3 = (a, b, c) => baInner(a, baCross3(b, c));
const baWrapDegrees = angle => ((angle + 180) % 360 + 360) % 360 - 180;

function baSpan3(vectors) {
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const normal = baCross3(vectors[i], vectors[j]);
      if (!baIsZero(normal)) return { kind: "plane", normal, along: [vectors[i], vectors[j]] };
    }
  }
  return vectors.some(v => !baIsZero(v)) ? { kind: "line" } : { kind: "point" };
}

function baPoly([a, b]) {
  const parts = [];
  if (a !== 0 || b === 0) parts.push(baFmt(a));
  if (b !== 0) {
    const size = Math.abs(b) === 1 ? "x" : baFmt(Math.abs(b)) + "x";
    parts.push(parts.length ? (b < 0 ? "− " : "+ ") + size : (b < 0 ? "−" : "") + size);
  }
  return parts.join(" ");
}

function baDetectiveCheck(key) {
  return c => {
    const card = c.spec.cases[key];
    const line = c.choice(key + "-line"), kind = c.choice(key + "-kind");
    const pass = line === card.line && kind === card.kind;
    if (pass) c.s.solved[key] = true;
    const fail = line === card.line ? "Right line. Look again at what kind of mistake it makes." :
      kind === card.kind ? "Right kind of mistake, but it first appears on a different line." :
      "Not this one. Rebuild the claimed answer, then work backward to the first line that is false.";
    return baGrade(pass, fail, pass ? card.explain : "");
  };
}

const baStations = {
  decoder: {
    defaultCard: "skew",
    cards: {
      skew: { basis: [[2, 1], [1, 1]], v: [5, 3] },
      negative: { basis: [[1, 2], [3, 1]], v: [-1, 3] },
      fraction: { basis: [[2, 1], [1, 2]], v: [1, 1] },
      vertical: { basis: [[0, 2], [3, 1]], v: [6, 4] }
    },
    start(c) { c.s.drawn = {}; },
    edit(c, name) { delete c.s.drawn[name.split("-")[0]]; },
    actions: {
      draw(c, button, check) {
        const { basis, v } = c.spec.cards[check];
        const coefficients = [c.ans(check + "-c1"), c.ans(check + "-c2")];
        c.s.drawn[check] = coefficients;
        c.s.card = check;
        const end = baCombo(basis, coefficients);
        const near = end.every((n, i) => Math.abs(n - v[i]) <= 0.01);
        return "Your combination lands at " + baPair(end) +
          (baSame(end, v) ? ", exactly on the target." : near ? ", within rounding of the target." : ". The target is " + baPair(v) + ".");
      }
    },
    show(c) {
      const key = baCard(c);
      const { basis, v } = c.spec.cards[key];
      c.put("state", "b₁ = " + baPair(basis[0]) + " · b₂ = " + baPair(basis[1]) + " · [v]_E = " + baPair(v) +
        " · D = " + baFmt(determinant(...basis)));
      const arrows = [baArrow(basis[0], "first", "b₁"), baArrow(basis[1], "second", "b₂"), baArrow(v, "target", "v")];
      const marks = [];
      const drawn = c.s.drawn[key];
      let text = "No combination drawn yet.";
      if (drawn) {
        const end = baCombo(basis, drawn);
        arrows.push(...baSteps(basis, drawn));
        marks.push(baMark(end, "sum", "your sum"));
        text = "Dashed steps show your combination " + baShow(drawn[0]) + " b₁ + " + baShow(drawn[1]) + " b₂, ending at " + baPair(end) + ".";
      }
      return {
        desc: "Standard grid. b₁ = " + baPair(basis[0]) + ", b₂ = " + baPair(basis[1]) + ", target v = " + baPair(v) + ". " + text,
        arrows, marks
      };
    },
    checks: {
      skew: ["Write one equation per component: 2c₁ + c₂ = 5 and c₁ + c₂ = 3.",
        "Subtract the second equation from the first to get c₁, then substitute back for c₂.", baDecodeCheck("skew")],
      negative: ["D = 1·1 − 2·3 = −5. A negative D still gives a valid basis. It only means b₁ to b₂ turns clockwise.",
        "The equations are c₁ + 3c₂ = −1 and 2c₁ + c₂ = 3.", baDecodeCheck("negative")],
      fraction: ["Add the two equations 2c₁ + c₂ = 1 and c₁ + 2c₂ = 1.",
        "The equations are mirror images, so c₁ = c₂. Type a fraction such as 1/3 or a decimal to three places.", baDecodeCheck("fraction")],
      vertical: ["b₁ has no horizontal part, so the x equation is 3c₂ = 6.",
        "With c₂ known, the y equation 2c₁ + c₂ = 4 gives c₁.", baDecodeCheck("vertical")]
    }
  },

  navigator: {
    basis: [[2, 1], [-1, 1]],
    start(c) { c.s.net = [0, 0]; c.s.log = []; },
    actions: {
      step(c, button) {
        if (c.s.log.length >= 40) return "The log holds 40 steps. Go back to the origin to start a new route.";
        const before = baNavPoint(c);
        c.s.net = baNavMove(c.s.net, button.dataset.baStep, 1);
        c.s.log.push(button.dataset.baStep);
        c.animate(before, baNavPoint(c));
        return null;
      },
      undo(c) {
        const code = c.s.log.pop();
        if (!code) return "There is no step to undo.";
        const before = baNavPoint(c);
        c.s.net = baNavMove(c.s.net, code, -1);
        c.animate(before, baNavPoint(c));
        return null;
      },
      home(c) {
        c.stopMotion();
        c.s.net = [0, 0];
        c.s.log = [];
        return "Token back at the origin. Step log cleared.";
      }
    },
    show(c) {
      const { basis } = c.spec;
      const { net, log } = c.s;
      const point = baNavPoint(c);
      const route = [[0, 0]];
      let running = [0, 0];
      for (const code of log) {
        running = baNavMove(running, code, 1);
        route.push(baCombo(basis, running));
      }
      c.put("state", "Token at " + baPair(point) + " · net " + baFmt(net[0]) + " b₁ + " + baFmt(net[1]) + " b₂ · " +
        log.length + (log.length === 1 ? " step" : " steps") + (log.length ? ": " + log.map(baStepName).join(", ") : "") + ".");
      const token = c.glide() ?? point;
      return {
        desc: "Slanted lattice of b₁ = (2, 1) and b₂ = (−1, 1). The token is at " + baPair(point) +
          ". Gold star at (0, 3). Rings at (−3, 0) and (4, 5)." + (log.length ? " The orange path traces " + log.length + " steps." : ""),
        min: 5.5,
        lattice: { basis, nodes: true },
        arrows: [baArrow(basis[0], "first", "b₁"), baArrow(basis[1], "second", "b₂")],
        paths: route.length > 1 ? [{ points: route, color: "sum", width: 2.4, loose: true }] : [],
        marks: [
          baMark([0, 3], "target", "star", { shape: "star" }),
          baMark([-3, 0], "good", "(−3, 0)", { shape: "ring" }),
          baMark([4, 5], "good", "(4, 5)", { shape: "ring" }),
          baMark(token, "sum", "", { shape: "token", loose: true })
        ]
      };
    },
    checks: {
      star: ["The star sits on a lattice node. Count the b₁ lines and the b₂ lines between the origin and the star.",
        "Try one +b₁ step, then look along the b₂ direction.", c => {
          const pass = baSame(baNavPoint(c), [0, 3]);
          return baGrade(pass, "The token is at " + baPair(baNavPoint(c)) + ", not on the star yet.", pass ? baNetWork(c) : "");
        }],
      backward: ["(−3, 0) lies to the left. b₁ points right and up, so you need −b₁ steps.",
        "Solve n₁(2, 1) + n₂(−1, 1) = (−3, 0). The y parts give n₁ + n₂ = 0.", c => {
          const point = baNavPoint(c);
          if (!baSame(point, [-3, 0])) return baGrade(false, "The token is at " + baPair(point) + ". Finish on the ring at (−3, 0).");
          const pass = c.s.log.includes("b1-");
          return baGrade(pass, "You reached (−3, 0), but the route needs at least one −b₁ step.", pass ? baNetWork(c) : "");
        }],
      fewest: ["The shortest route never takes a step and later undoes it.",
        "The net counts are the coordinates of (4, 5) in this basis. Solve 2n₁ − n₂ = 4 and n₁ + n₂ = 5.", c => {
          const point = baNavPoint(c);
          if (!baSame(point, [4, 5])) return baGrade(false, "The token is at " + baPair(point) + ". Finish on the ring at (4, 5).");
          const pass = c.s.log.length === 5;
          return baGrade(pass, "You reached (4, 5) in " + c.s.log.length + " steps. Some of them cancel. Go back to the origin and try a route with no back-and-forth.",
            pass ? baNetWork(c) + " That is |3| + |2| = 5 steps, the minimum." : "");
        }],
      loop: ["A route returns to the origin only when both net counts are zero.",
        "Try +b₁, +b₂, −b₁, −b₂.", c => {
          const { log } = c.s;
          const point = baNavPoint(c);
          if (log.length < 4) return baGrade(false, "Take at least four steps. You have " + log.length + ".");
          if (!log.some(code => code[1] === "1") || !log.some(code => code[1] === "2")) return baGrade(false, "Use both b₁ and b₂ somewhere in the loop.");
          const pass = baSame(point, [0, 0]);
          return baGrade(pass, "The token is at " + baPair(point) + ". Finish back at the origin.",
            pass ? "Net steps 0 and 0. Because b₁ and b₂ are independent, 0·b₁ + 0·b₂ is the only way to reach the origin, so every step was cancelled by an opposite step." : "");
        }]
    }
  },

  encoder: {
    defaultCard: "basic",
    cards: {
      basic: { basis: [[2, 1], [-1, 3]], coords: [2, 1] },
      negative: { basis: [[1, 2], [3, -1]], coords: [-2, 1] },
      half: { basis: [[4, 2], [-2, 6]], coords: [0.5, -0.5] },
      zero: { basis: [[5, -2], [-1, 2]], coords: [0, 3] }
    },
    start(c) { c.s.plotted = {}; c.s.revealed = {}; },
    edit(c, name) { delete c.s.plotted[name.split("-")[0]]; },
    actions: {
      plot(c, button, check) {
        c.s.plotted[check] = [c.ans(check + "-x"), c.ans(check + "-y")];
        c.s.card = check;
        return "Your point " + baPair(c.s.plotted[check]) + " is plotted in orange. Check the mission to see the steps.";
      }
    },
    show(c) {
      const key = baCard(c);
      const { basis, coords } = c.spec.cards[key];
      c.put("state", "b₁ = " + baPair(basis[0]) + " · b₂ = " + baPair(basis[1]) + " · [v]_B = " + baPair(coords));
      const arrows = [baArrow(basis[0], "first", "b₁"), baArrow(basis[1], "second", "b₂")];
      const marks = [];
      let text = "";
      if (c.s.revealed[key]) {
        const v = baCombo(basis, coords);
        arrows.push(...baSteps(basis, coords), baArrow(v, "target", "v"));
        text += " Steps revealed: they end at " + baPair(v) + ".";
      }
      const plotted = c.s.plotted[key];
      if (plotted) {
        marks.push(baMark(plotted, "sum", "your point"));
        text += " Your point is at " + baPair(plotted) + ".";
      }
      return {
        desc: "Standard grid with b₁ = " + baPair(basis[0]) + " and b₂ = " + baPair(basis[1]) + ". [v]B = " + baPair(coords) + "." + text,
        arrows, marks, fit: [[3, 3]]
      };
    },
    checks: {
      basic: ["Scale each arrow first: 2·(2, 1) and 1·(−1, 3).", "Add the scaled arrows component by component.", baEncodeCheck("basic")],
      negative: ["A coefficient of −2 reverses b₁ and doubles it: −2·(1, 2) = (−2, −4).", "Add (−2, −4) and 1·(3, −1).", baEncodeCheck("negative")],
      half: ["Take half of b₁ and minus half of b₂.", "½·(4, 2) = (2, 1) and −½·(−2, 6) = (1, −3).", baEncodeCheck("half")],
      zero: ["A zero coefficient removes b₁ from the sum entirely.", "Only 3·b₂ remains.", baEncodeCheck("zero")]
    }
  },

  names: {
    v: [4, 2],
    defaultCard: "scaled",
    cards: {
      scaled: { basis: [[2, 0], [0, 1]], name: "stretched" },
      tilted: { basis: [[1, 1], [0, 1]], name: "tilted" },
      rotated: { basis: [[0, 1], [-1, 0]], name: "rotated" },
      own: { name: "yours" }
    },
    start(c) { c.s.found = {}; },
    show(c) {
      const key = baCard(c);
      const v = c.spec.v;
      const basis = key === "own" ? [c.live("own-b1"), c.live("own-b2")] : c.spec.cards[key].basis;
      const D = determinant(...basis);
      const names = Object.entries(c.spec.cards).map(([id, card]) =>
        card.name + " " + (c.s.found[id] ? baPair(c.s.found[id].coords) : "?"));
      c.put("names", "Names found for v = (4, 2): " + names.join(" · "));
      const arrows = [baArrow(v, "target", "v", [0, 0], { width: 3.6 }),
        baArrow(basis[0], "first", "b₁"), baArrow(basis[1], "second", "b₂")];
      const found = c.s.found[key];
      if (found && baSame(found.basis[0], basis[0]) && baSame(found.basis[1], basis[1])) arrows.push(...baSteps(basis, found.coords));
      return {
        desc: "The fixed arrow v = (4, 2) with the " + c.spec.cards[key].name + " basis b₁ = " + baPair(basis[0]) +
          ", b₂ = " + baPair(basis[1]) + (D === 0 ? ". These arrows are dependent." : ". The slanted lines show this basis grid."),
        lattice: D !== 0 ? { basis } : null,
        arrows, fit: [[4, 3]]
      };
    },
    checks: {
      scaled: ["b₁ is twice as long as the standard e₁, so you need half as many copies.", "c₁ = 4 / 2. The second arrow is e₂ itself.", baNamesCheck("scaled")],
      tilted: ["Only b₁ has an x part, so c₁ must equal the x component of v.", "c₁ = 4 gives 4·(1, 1) = (4, 4). Use b₂ to fix the height.", baNamesCheck("tilted")],
      rotated: ["b₁ points up and b₂ points left.", "Height 2 needs c₁ = 2. Moving 4 to the right along a left-pointing arrow needs a negative c₂.", baNamesCheck("rotated")],
      own: ["Pick arrows with D ≠ 0, such as the starting pair (1, 2) and (3, 1).",
        "Use c₁ = (v_x b₂y − v_y b₂x) / D and c₂ = (b₁x v_y − b₁y v_x) / D.", c => {
          const basis = [c.vec("own-b1"), c.vec("own-b2")];
          if (determinant(...basis) === 0) return baSetup("These arrows have D = 0, so they are not a basis. Change one of them.");
          const deck = [[[1, 0], [0, 1]], ...Object.values(c.spec.cards).filter(card => card.basis).map(card => card.basis)];
          if (deck.some(([a, b]) => baSame(a, basis[0]) && baSame(b, basis[1]))) {
            return baSetup("That basis is already on the deck or is the standard basis. Pick a different pair.");
          }
          const v = c.spec.v;
          const entry = [c.ans("own-c1"), c.ans("own-c2")];
          const answer = baSolve(basis, v);
          const pass = baFitsAll(entry, answer);
          if (pass) c.s.found.own = { basis, coords: answer };
          return baGrade(pass, "Your pair rebuilds " + baPair(baCombo(basis, entry)) + ", not v = (4, 2).",
            pass ? baSolveWork(basis, v) : "Your pair: " + baBuildWork(basis, entry));
        }]
    }
  },

  inspector: {
    pairs: [[[2, 1], [-4, -2]], [[1, 3], [2, 5]], [[0, 0], [1, 1]], [[3, -1], [-1, 3]], [[1.5, 1], [3, 2]]],
    kinds: ["dependent", "valid", "dependent", "valid", "dependent"],
    fixed: [[1, 2], [-2, -4]],
    candidates: [[2, 4], [1, 3], [-3, -6], [4, 2], [0, 0]],
    reachable: [true, false, true, false, true],
    start() {},
    show(c) {
      const key = c.s.card;
      if (key === "reach" || key === "family") {
        const [b1, b2] = c.spec.fixed;
        c.put("state", "Mission pair (1, 2) and (−2, −4) · D = 0 · every combination lies on the line y = 2x.");
        const marks = key === "reach"
          ? c.spec.candidates.map(point => baMark(point, "target", baPair(point), { shape: "ring" }))
          : [baMark([3, 6], "target", "target (3, 6)")];
        return {
          desc: "Dependent arrows (1, 2) and (−2, −4). The dashed orange line through the origin is everything they can reach. " +
            (key === "reach" ? "Rings mark the five candidate targets." : "The target (3, 6) lies on that line."),
          lines: [{ direction: b1, color: "sum", dashed: true }],
          arrows: [baArrow(b1, "first", "b₁"), baArrow(b2, "second", "b₂")],
          marks
        };
      }
      const b1 = c.live("b1"), b2 = c.live("b2");
      const D = determinant(b1, b2);
      let verdict, lines = [], marks = [];
      if (D !== 0) verdict = "Valid basis. Every target has exactly one coefficient pair.";
      else if (baIsZero(b1) && baIsZero(b2)) {
        verdict = "Both arrows are zero, so only the origin is reachable.";
        marks = [baMark([0, 0], "bad", "only the origin")];
      } else {
        const along = baIsZero(b1) ? b2 : b1;
        verdict = "Dependent. Every combination lies on the line through the origin along " + baPair(along) + ".";
        lines = [{ direction: along, color: "sum", dashed: true }];
      }
      c.put("state", "Bench pair " + baPair(b1) + " and " + baPair(b2) + " · D = " + baFmt(D) + " · " + verdict);
      return {
        desc: "Bench arrows b₁ = " + baPair(b1) + " and b₂ = " + baPair(b2) + ". D = " + baFmt(D) + ". " + verdict,
        lattice: D !== 0 ? { basis: [b1, b2] } : null,
        lines, marks,
        arrows: [baArrow(b1, "first", "b₁"), baArrow(b2, "second", "b₂")]
      };
    },
    checks: {
      classify: ["Compute D = b₁x·b₂y − b₁y·b₂x for each pair, or enter the pair on the bench.",
        "A zero arrow always makes a pair dependent. So does one arrow being a multiple of the other.", c => {
          const picks = c.spec.pairs.map((_, i) => c.choice("pair" + (i + 1)));
          const right = picks.filter((pick, i) => pick === c.spec.kinds[i]).length;
          return baGrade(right === 5, right + " of 5 are right. Check D for each pair. D = 0 means dependent.",
            right === 5 ? "D values in order: " + c.spec.pairs.map(pair => baFmt(determinant(...pair))).join(", ") +
              ". Only the pairs with D ≠ 0 are bases." : "");
        }],
      break: ["Two nonzero arrows fail when one is a multiple of the other.", "Try b₁ = (1, 2) and b₂ = (2, 4).", c => {
        const b1 = c.vec("b1"), b2 = c.vec("b2");
        if (baIsZero(b1) || baIsZero(b2)) return baSetup("One bench arrow is zero. Make both arrows nonzero and still fail.");
        const D = determinant(b1, b2);
        return baGrade(D === 0, "D = " + baFmt(D) + ", so this pair is still a basis.",
          D === 0 ? "D = " + baTimes(b1[0], b2[1]) + " − " + baTimes(b1[1], b2[0]) + " = 0. Both arrows are nonzero but parallel, so every combination stays on one line." : "");
      }],
      reach: ["(−2, −4) = −2·(1, 2), so both arrows lie along the same line.",
        "A target is reachable exactly when it is a multiple of (1, 2), so its y is twice its x.", c => {
          const picks = c.spec.candidates.map((_, i) => c.checked("reach-" + (i + 1)));
          const pass = picks.every((pick, i) => pick === c.spec.reachable[i]);
          return baGrade(pass, "Not quite. A target is reachable exactly when it lies on the line through the origin along (1, 2).",
            pass ? "(2, 4) = 2·(1, 2), (−3, −6) = −3·(1, 2), and (0, 0) = 0·(1, 2) lie on the line y = 2x. (1, 3) and (4, 2) are off it." : "");
        }],
      family: ["Factor the combination: c₁(1, 2) + c₂(−2, −4) = (c₁ − 2c₂)·(1, 2).", "Set c₁ − 2c₂ = 3 and solve for c₁.", c => {
        const p = c.ans("family-p"), q = c.ans("family-q");
        const pass = baFits(p, 3) && baFits(q, 2);
        const test = baCombo(c.spec.fixed, [p + q, 1]);
        return baGrade(pass, "Test your family with c₂ = 1: c₁ = " + baFmt(p + q) + " gives " + baPair(test) + ", not (3, 6).",
          pass ? "c₁(1, 2) + c₂(−2, −4) = (c₁ − 2c₂)·(1, 2). That equals (3, 6) = 3·(1, 2) when c₁ − 2c₂ = 3, so c₁ = 3 + 2·c₂. For example, c₂ = 0 gives (3, 0) and c₂ = 1 gives (5, 1)." : "");
      }]
    }
  },

  area: {
    initial: [[2, 1], [1, 3]],
    v: [5, 5],
    start(c) { c.s.shown = {}; },
    edit(c, name) {
      const key = name.split("-")[0];
      if (key === "swap" || key === "double") c.s.shown[key] = false;
    },
    actions: {
      swap(c) {
        const b1 = c.vec("b1"), b2 = c.vec("b2");
        c.writeVec("b1", b2);
        c.writeVec("b2", b1);
        return null;
      },
      double(c) {
        const b1 = c.vec("b1");
        if (b1.some(n => Math.abs(2 * n) > 4)) return "Doubling would push b₁ past the ±4 limit. Load the starting pair first.";
        c.writeVec("b1", scale(b1, 2));
        return null;
      },
      load(c) {
        c.writeVec("b1", c.spec.initial[0]);
        c.writeVec("b2", c.spec.initial[1]);
        return null;
      }
    },
    show(c) {
      const b1 = c.live("b1"), b2 = c.live("b2"), v = c.spec.v;
      const D = determinant(b1, b2);
      const key = c.s.card;
      const hide = (key === "swap" || key === "double") && !c.s.shown[key];
      const coords = baSolve([b1, b2], v);
      const turn = D > 0 ? "counterclockwise from b₁ to b₂" : D < 0 ? "clockwise from b₁ to b₂" : "the arrows are parallel";
      c.put("state", "b₁ = " + baPair(b1) + " · b₂ = " + baPair(b2) + " · " + (hide
        ? "D and [v]_B are hidden until you check your prediction."
        : "D = " + baFmt(D) + " (" + turn + ") · [v]_B = " + (coords ? baPair(coords) : "none, because D = 0")));
      const tip = add(b1, b2);
      const arcs = [];
      if (D !== 0 && !hide) {
        const start = Math.atan2(b1[1], b1[0]);
        let sweep = Math.atan2(b2[1], b2[0]) - start;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        while (sweep <= -Math.PI) sweep += 2 * Math.PI;
        arcs.push({ start, sweep, radius: 34, color: D > 0 ? "good" : "bad" });
      }
      const arrows = [baArrow(b1, "first", "b₁"), baArrow(b2, "second", "b₂")];
      if (coords && !hide) arrows.push(...baSteps([b1, b2], coords));
      return {
        desc: "b₁ = " + baPair(b1) + ", b₂ = " + baPair(b2) + ". " + (hide ? "The parallelogram is grey while your prediction is pending." :
          "The parallelogram has signed area " + baFmt(D) + ", " + turn + ".") + " Target v = (5, 5).",
        fills: D !== 0 ? [{ points: [[0, 0], b1, tip, b2], color: hide ? "dim" : D > 0 ? "good" : "bad", opacity: 0.26 }] : [],
        paths: [{ points: [b1, tip, b2], color: "axis", dashed: true, width: 1.4 }],
        arcs, arrows,
        marks: [baMark(v, "target", "v = (5, 5)")],
        fit: [[5, 5], [-1, -1]]
      };
    },
    checks: {
      six: ["D is the signed area of the parallelogram. A rectangle 3 wide and 2 tall has area 6.",
        "For example b₁ = (3, 0) and b₂ = (0, 2), or b₁ = (2, 0) and b₂ = (1, 3).", c => baAreaGrade(c, 6)],
      negative: ["A negative D means b₂ is clockwise from b₁.", "Try b₁ = (0, 1) and b₂ = (3, 0).", c => baAreaGrade(c, -3)],
      swap: ["Swapping exchanges the roles of the arrows in D = b₁x·b₂y − b₁y·b₂x.",
        "Each coefficient stays with its own arrow, so the two slots trade places.", c => baPredictGrade(c, "swap", [[1, 3], [2, 1]], [-5, 1, 2],
          "Before: D = 2·3 − 1·1 = 5 and [v]_B = (2, 1). After the swap: D = 1·1 − 3·2 = −5, and the coefficients trade slots: [v]_B = (1, 2), since 1·(1, 3) + 2·(2, 1) = (5, 5).")],
      double: ["Doubling one side of a parallelogram doubles its area.",
        "An arrow twice as long needs half as many copies. The other coefficient is unchanged.", c => baPredictGrade(c, "double", [[4, 2], [1, 3]], [10, 1, 1],
          "D = 4·3 − 2·1 = 10, twice 5. [v]_B = (1, 1), since 1·(4, 2) + 1·(1, 3) = (5, 5). c₁ halves from 2 to 1 because each copy of b₁ is now twice as long.")]
    }
  },

  designer: {
    defaultCard: "ones",
    cards: {
      ones: { v: [3, 2], coords: [1, 1] },
      twice: { v: [4, -2], coords: [2, 0] },
      negative: { v: [1, 1], coords: [-1, 2] },
      locked: { v: [0, 5], coords: [-1, 1], lock: [2, 1] }
    },
    start() {},
    actions: {
      lock(c) {
        c.writeVec("b1", [2, 1]);
        return "b₁ is set to (2, 1). Now choose b₂.";
      }
    },
    show(c) {
      const key = baCard(c);
      const { v, coords } = c.spec.cards[key];
      const basis = [c.live("b1"), c.live("b2")];
      const D = determinant(...basis);
      const end = baCombo(basis, coords);
      const hit = baSame(end, v);
      c.put("state", "Target " + baPair(v) + " should read " + baPair(coords) + " · " + baShow(coords[0]) + " b₁ + " +
        baShow(coords[1]) + " b₂ = " + baPair(end) + (hit ? ", on the target" : ", off the target") + " · D = " + baFmt(D) +
        (D === 0 ? ", not a basis" : ""));
      return {
        desc: "Your arrows b₁ = " + baPair(basis[0]) + " and b₂ = " + baPair(basis[1]) + ". The dashed steps use the wanted coordinates " +
          baPair(coords) + " and end at " + baPair(end) + ". The target ring is at " + baPair(v) + ".",
        lattice: D !== 0 ? { basis } : null,
        arrows: [baArrow(basis[0], "first", "b₁"), baArrow(basis[1], "second", "b₂"), ...baSteps(basis, coords)],
        marks: [baMark(v, "target", "target", { shape: "ring" }), ...(hit ? [] : [baMark(end, "sum", "lands here")])],
        fit: [v]
      };
    },
    checks: {
      ones: ["You need b₁ + b₂ = (3, 2).", "Pick any b₁ that is not parallel to (3, 2), then set b₂ = (3, 2) − b₁.", baDesignCheck("ones")],
      twice: ["2b₁ + 0b₂ = (4, −2) fixes b₁ completely.", "b₁ = (2, −1). b₂ can be any arrow that is not parallel to it.", baDesignCheck("twice")],
      negative: ["You need −b₁ + 2b₂ = (1, 1), so b₂ = ((1, 1) + b₁) / 2.", "Choose b₁ = (1, 0). Then b₂ = (1, 0.5).", baDesignCheck("negative")],
      locked: ["With b₁ = (2, 1), the equation −b₁ + b₂ = (0, 5) has exactly one solution.", "b₂ = (0, 5) + (2, 1).", baDesignCheck("locked")]
    }
  },

  relay: {
    defaultCard: "checkpoint",
    cards: {
      checkpoint: { B: [[1, 1], [1, -1]], vB: [3, 1] },
      finish: { C: [[2, 0], [1, 1]], vE: [4, 2] },
      full: { B: [[2, 1], [0, 1]], vB: [1, 3], C: [[1, 1], [-1, 1]] },
      matrix: { B: [[2, 1], [0, 1]], vB: [1, 3] }
    },
    start(c) { c.s.revealed = {}; },
    show(c) {
      const key = baCard(c);
      const card = c.spec.cards[key];
      const vE = card.vE ?? baCombo(card.B, card.vB);
      const revealed = Boolean(c.s.revealed[key]);
      const arrows = [], parts = [];
      if (card.B) {
        arrows.push(baArrow(card.B[0], "first", "b₁"), baArrow(card.B[1], "second", "b₂"));
        parts.push("B: b₁ = " + baPair(card.B[0]) + ", b₂ = " + baPair(card.B[1]) + ", [v]_B = " + baPair(card.vB));
      }
      if (card.C) {
        arrows.push(baArrow(card.C[0], "sum", "f₁"), baArrow(card.C[1], "good", "f₂"));
        parts.push("C: f₁ = " + baPair(card.C[0]) + ", f₂ = " + baPair(card.C[1]));
      }
      if (card.vE) parts.push("checkpoint [v]_E = " + baPair(card.vE));
      if (revealed && card.B) arrows.push(...baSteps(card.B, card.vB));
      if (revealed && card.C) arrows.push(...baSteps(card.C, baSolve(card.C, vE), ["f₁", "f₂"], ["sum", "good"]));
      const showV = revealed || Boolean(card.vE);
      if (showV) arrows.push(baArrow(vE, "target", "v"));
      if (revealed) parts.push("relay complete");
      c.put("state", parts.join(" · "));
      return {
        desc: parts.join(". ").replace(/_/g, "") + "." + (showV ? " The gold arrow v ends at " + baPair(vE) + "." : " The target stays hidden until you check."),
        arrows, fit: [vE, [3, 3]]
      };
    },
    checks: {
      checkpoint: ["Encoding needs no solving: [v]_E = 3·b₁ + 1·b₂.", "3·(1, 1) + 1·(1, −1).", c => {
        const { B, vB } = c.spec.cards.checkpoint;
        const entry = [c.ans("checkpoint-x"), c.ans("checkpoint-y")];
        const pass = baFitsAll(entry, baCombo(B, vB));
        if (pass) c.s.revealed.checkpoint = true;
        return baGrade(pass, "Your checkpoint is " + baPair(entry) + ". Scale each B arrow by its coefficient, then add.",
          pass ? "[v]_E = " + baBuildWork(B, vB) : "");
      }],
      finish: ["Now decode (4, 2) in C: k₁(2, 0) + k₂(1, 1) = (4, 2).", "The y equation alone gives k₂ = 2.", c => {
        const { C, vE } = c.spec.cards.finish;
        const entry = [c.ans("finish-k1"), c.ans("finish-k2")];
        const pass = baFitsAll(entry, baSolve(C, vE));
        if (pass) c.s.revealed.finish = true;
        return baGrade(pass, "Your slots rebuild " + baPair(baCombo(C, entry)) + " instead of (4, 2).",
          pass ? baSolveWork(C, vE, ["k₁", "k₂"]) : "Your slots: " + baBuildWork(C, entry));
      }],
      full: ["Leg 1: [v]_E = 1·(2, 1) + 3·(0, 1).", "Leg 2: solve k₁(1, 1) + k₂(−1, 1) = [v]_E. Adding the two equations gives 2k₁ = x + y.", c => {
        const { B, vB, C } = c.spec.cards.full;
        const vE = baCombo(B, vB);
        const checkpoint = [c.ans("full-x"), c.ans("full-y")];
        const slots = [c.ans("full-k1"), c.ans("full-k2")];
        if (!baFitsAll(checkpoint, vE)) return baGrade(false, "Leg 1 is off. Your checkpoint " + baPair(checkpoint) + " does not equal 1·b₁ + 3·b₂.");
        const pass = baFitsAll(slots, baSolve(C, vE));
        if (pass) c.s.revealed.full = true;
        return baGrade(pass, "Leg 1 is right. Leg 2: your slots rebuild " + baPair(baCombo(C, slots)) + " instead of " + baPair(vE) + ".",
          pass ? "Leg 1: [v]_E = " + baBuildWork(B, vB) + " Leg 2: " + baSolveWork(C, vE, ["k₁", "k₂"]) : "");
      }],
      matrix: ["The columns of the matrix hold the arrows: column 1 is b₁, column 2 is b₂.",
        "Top row: b₁x and b₂x. Bottom row: b₁y and b₂y.", c => {
          const entry = ["a", "b", "c", "d"].map(k => c.ans("matrix-" + k));
          const pass = baFitsAll(entry, [2, 0, 1, 1]);
          if (pass) c.s.revealed.matrix = true;
          const transposed = baFitsAll(entry, [2, 1, 0, 1]);
          return baGrade(pass, transposed
            ? "Those entries put b₁ and b₂ in the rows. The arrows belong in the columns."
            : "Multiply your matrix by (1, 3). It gives (" + baFmt(entry[0] + 3 * entry[1]) + ", " + baFmt(entry[2] + 3 * entry[3]) + "), but [v]_E should be (2, 4).",
          pass ? "Columns (2, 1) and (0, 1). Times the column (1, 3): top row 2·1 + 0·3 = 2, bottom row 1·1 + 1·3 = 4, so [v]_E = (2, 4), the same as 1·b₁ + 3·b₂." : "");
        }]
    }
  },

  ortho: {
    sandboxV: [1, 3],
    cards: {
      rotated: { basis: baFrame(45), v: [3, 1], answer: [2 * Math.SQRT2, -Math.SQRT2] },
      frame: { basis: [[0.6, 0.8], [-0.8, 0.6]], v: [5, 0], answer: [3, -4] },
      skew: { basis: [[1, 0], [0.6, 0.8]], v: [3, 4], answer: [0, 5], dots: [3, 5] },
      scaled: { basis: [[2, 0], [0, 3]], v: [4, 6], answer: [2, 2] }
    },
    start(c) { c.s.shortcut = {}; c.s.revealed = {}; },
    edit(c, name) { if (name === "angle") delete c.s.shortcut.sandbox; },
    actions: {
      shortcut(c) {
        c.s.shortcut[c.spec.cards[c.s.card] ? c.s.card : "sandbox"] = true;
        return null;
      }
    },
    show(c) {
      const key = c.spec.cards[c.s.card] ? c.s.card : "sandbox";
      const card = c.spec.cards[key];
      const angle = Number(c.val("angle"));
      const basis = card ? card.basis : baFrame(angle);
      const v = card ? card.v : c.spec.sandboxV;
      const lengths = basis.map(b => Math.hypot(...b));
      const cross = baInner(basis[0], basis[1]);
      const unit = lengths.every(n => Math.abs(n - 1) < 1e-9);
      const parts = [(card ? "" : "Practice frame rotated " + angle + "° · ") + "b₁ = " + baPair(basis[0]) + " · b₂ = " + baPair(basis[1]) +
        " · |b₁| = " + baFmt(lengths[0]) + " · |b₂| = " + baFmt(lengths[1]) + " · b₁·b₂ = " + baFmt(cross) + " · v = " + baPair(v)];
      const arrows = [baArrow(basis[0], "first", "b₁"), baArrow(basis[1], "second", "b₂"), baArrow(v, "target", "v")];
      const marks = [];
      if (c.s.shortcut[key]) {
        const dots = basis.map(b => baInner(v, b));
        const rebuild = baCombo(basis, dots);
        const ok = baSame(rebuild, v);
        arrows.push(...baSteps(basis, dots));
        marks.push(baMark(rebuild, ok ? "good" : "bad", ok ? "rebuild = v" : "shortcut lands here"));
        parts.push("dot shortcut: v·b₁ = " + baFmt(dots[0]) + ", v·b₂ = " + baFmt(dots[1]) + " → rebuild " + baPair(rebuild) +
          (ok ? ", which matches v" : ", which misses v"));
      } else if (card && c.s.revealed[key]) arrows.push(...baSteps(basis, card.answer));
      c.put("state", parts.join(" · "));
      const circle = [];
      for (let i = 0; i <= 72; i++) circle.push([Math.cos(i * Math.PI / 36), Math.sin(i * Math.PI / 36)]);
      return {
        desc: parts.join(". ") + ".",
        paths: unit ? [{ points: circle, color: "dim", width: 1.4, loose: true }] : [],
        arrows, marks, fit: [v, [2, 2]]
      };
    },
    checks: {
      rotated: ["For an orthonormal basis, c₁ = v·b₁ and c₂ = v·b₂.", "At 45°, b₁ = (1/√2, 1/√2) and b₂ = (−1/√2, 1/√2).", baOrthoCheck("rotated",
        "b₁ = (1/√2, 1/√2) and b₂ = (−1/√2, 1/√2) are orthonormal. c₁ = v·b₁ = (3 + 1)/√2 = 2√2 ≈ 2.828. c₂ = v·b₂ = (−3 + 1)/√2 = −√2 ≈ −1.414.")],
      frame: ["Check first: |b₁| = 1, |b₂| = 1 and b₁·b₂ = 0.", "c₁ = (5, 0)·(0.6, 0.8) and c₂ = (5, 0)·(−0.8, 0.6).", baOrthoCheck("frame",
        "|b₁| = |b₂| = 1 and b₁·b₂ = −0.48 + 0.48 = 0. c₁ = 5·0.6 + 0·0.8 = 3. c₂ = 5·(−0.8) + 0·0.6 = −4. Check: 3·(0.6, 0.8) − 4·(−0.8, 0.6) = (5, 0).")],
      skew: ["The dot products are v·b₁ = 3·1 + 4·0 and v·b₂ = 3·0.6 + 4·0.8.",
        "For the true coordinates, solve c₁(1, 0) + c₂(0.6, 0.8) = (3, 4). The y equation gives c₂ first.", c => {
          const card = c.spec.cards.skew;
          const dots = [c.ans("skew-d1"), c.ans("skew-d2")];
          const coords = [c.ans("skew-c1"), c.ans("skew-c2")];
          if (!baFitsAll(dots, card.dots)) return baGrade(false, "Recheck the dot products. Multiply matching components of v and each arrow, then add.");
          const pass = baFitsAll(coords, card.answer);
          if (pass) c.s.revealed.skew = true;
          return baGrade(pass, "The dot products are right. Your true coordinates rebuild " + baPair(baCombo(card.basis, coords)) + " instead of (3, 4).",
            pass ? "Dot products (3, 5) rebuild 3·(1, 0) + 5·(0.6, 0.8) = (6, 4), which misses v. b₁·b₂ = 0.6, not 0. Solving instead: 0.8c₂ = 4 gives c₂ = 5, then c₁ + 0.6·5 = 3 gives c₁ = 0. So [v]_B = (0, 5): v is exactly 5b₂." : "");
        }],
      scaled: ["These arrows are perpendicular but not unit length, so divide each dot product by b·b.", "c₁ = (v·b₁)/(b₁·b₁) = 8/4.", baOrthoCheck("scaled",
        "b₁·b₂ = 0, so the cross term vanishes. c₁ = (v·b₁)/(b₁·b₁) = 8/4 = 2. c₂ = (v·b₂)/(b₂·b₂) = 18/9 = 2. Check: 2·(2, 0) + 2·(0, 3) = (4, 6).")]
    }
  },

  quantum: {
    defaultCard: "plus",
    cards: {
      plus: { z: [Math.SQRT1_2, Math.SQRT1_2], text: "|ψ⟩ = |+⟩, with z coordinates (1/√2, 1/√2)", answer: [1, 0],
        work: "|+⟩ = 1·|+⟩ + 0·|−⟩, so its x coordinates are (1, 0). The same state has z coordinates (1/√2, 1/√2)." },
      zero: { z: [1, 0], text: "|ψ⟩ = |0⟩, with z coordinates (1, 0)", answer: [Math.SQRT1_2, Math.SQRT1_2],
        work: "|+⟩ + |−⟩ = (2/√2)|0⟩ = √2|0⟩, so |0⟩ = (1/√2)|+⟩ + (1/√2)|−⟩. x coordinates (1/√2, 1/√2) ≈ (0.707, 0.707)." },
      convert: { z: [0.6, 0.8], text: "|ψ⟩ = 0.6|0⟩ + 0.8|1⟩", answer: [1.4 / Math.SQRT2, -0.2 / Math.SQRT2],
        work: "a|0⟩ + b|1⟩ = ((a + b)/√2)|+⟩ + ((a − b)/√2)|−⟩. With a = 0.6 and b = 0.8: (1.4/√2, −0.2/√2) ≈ (0.990, −0.141)." },
      reverse: { x: [0.8, -0.6], text: "|ψ⟩ = 0.8|+⟩ − 0.6|−⟩", answer: [0.2 / Math.SQRT2, 1.4 / Math.SQRT2], ask: "z",
        work: "0.8(|0⟩ + |1⟩)/√2 − 0.6(|0⟩ − |1⟩)/√2 = (0.2/√2)|0⟩ + (1.4/√2)|1⟩ ≈ 0.141|0⟩ + 0.990|1⟩." }
    },
    start(c) { c.s.revealed = {}; },
    show(c) {
      const key = baCard(c);
      const card = c.spec.cards[key];
      const r = Math.SQRT1_2;
      const z = card.z ?? [(card.x[0] + card.x[1]) * r, (card.x[0] - card.x[1]) * r];
      const x = [(z[0] + z[1]) * r, (z[0] - z[1]) * r];
      const revealed = c.s.revealed[key];
      c.put("state", card.text + (revealed ? " · z coordinates " + baPair(z) + " · x coordinates " + baPair(x) : ""));
      const circle = [];
      for (let i = 0; i <= 72; i++) circle.push([Math.cos(i * Math.PI / 36), Math.sin(i * Math.PI / 36)]);
      const arrows = [baArrow([1, 0], "first", "|0⟩"), baArrow([0, 1], "second", "|1⟩"),
        baArrow([r, r], "sum", "|+⟩"), baArrow([r, -r], "good", "|−⟩"), baArrow(z, "target", "|ψ⟩", [0, 0], { width: 3.6 })];
      if (revealed) arrows.push(...baSteps([[r, r], [r, -r]], x, ["|+⟩", "|−⟩"], ["sum", "good"]));
      return {
        desc: "Unit circle with |0⟩ along the horizontal axis and |1⟩ vertical. |+⟩ and |−⟩ point at plus and minus 45 degrees. The state " +
          card.text + " is the gold arrow." + (revealed ? " Dashed steps rebuild it from |+⟩ and |−⟩." : ""),
        min: 1.15, zoom: 150, axisNames: ["", ""],
        lines: c.checked("showx") ? [{ direction: [1, 1], color: "sum", dashed: true, width: 1.2 }, { direction: [1, -1], color: "good", dashed: true, width: 1.2 }] : [],
        paths: [{ points: circle, color: "dim", width: 1.4, loose: true }],
        arrows, fit: [[1.15, 1.15], [-1.15, -1.15]]
      };
    },
    checks: {
      plus: ["|+⟩ is itself one of the x-basis arrows.", "How many copies of |+⟩, and how many of |−⟩, make |+⟩?", baQuantumCheck("plus")],
      zero: ["Add the definitions: |+⟩ + |−⟩ = (2/√2)|0⟩ = √2|0⟩.", "So |0⟩ = (|+⟩ + |−⟩)/√2.", baQuantumCheck("zero")],
      convert: ["For a|0⟩ + b|1⟩, the |+⟩ coordinate is (a + b)/√2 and the |−⟩ coordinate is (a − b)/√2.",
        "Here a = 0.6 and b = 0.8. Type 1.4/√2 or a decimal.", baQuantumCheck("convert")],
      reverse: ["Substitute |+⟩ = (|0⟩ + |1⟩)/√2 and |−⟩ = (|0⟩ − |1⟩)/√2, then collect terms.",
        "The |0⟩ coordinate is (0.8 + (−0.6))/√2 and the |1⟩ coordinate is (0.8 − (−0.6))/√2.", baQuantumCheck("reverse")]
    }
  },

  coplanar: {
    sets: {
      s1: [[1, 0, 0], [0, 1, 0], [1, 1, 0]],
      s2: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      s3: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
      s4: [[1, 1, 0], [0, 1, 1], [1, 0, 1]]
    },
    kinds: ["coplanar", "valid", "coplanar", "valid"],
    start(c) {
      c.s.yaw = Number(c.val("yaw"));
      c.s.tilt = Number(c.val("tilt"));
    },
    edit(c, name) {
      if (name === "preset") {
        const set = c.spec.sets[c.val("preset")];
        if (set) set.forEach((vector, i) => c.writeVec("b" + (i + 1), vector, BA_XYZ));
      } else if (/^b[123][xyz]$/.test(name)) {
        const current = [1, 2, 3].map(i => c.live("b" + i, BA_XYZ));
        const match = Object.entries(c.spec.sets).find(([, set]) => set.every((vector, i) => baSame(vector, current[i])));
        c.set("preset", match ? match[0] : "custom");
      } else if (name === "yaw") c.s.yaw = Number(c.val("yaw"));
      else if (name === "tilt") c.s.tilt = Number(c.val("tilt"));
    },
    drag(c, dx, dy) {
      c.s.yaw = baWrapDegrees(c.s.yaw - dx * 0.5);
      c.s.tilt = Math.min(80, Math.max(-10, c.s.tilt + dy * 0.4));
      c.set("yaw", Math.round(c.s.yaw / 5) * 5);
      c.set("tilt", Math.round(c.s.tilt / 5) * 5);
    },
    tick(c, step) {
      if (!c.checked("spin")) return false;
      c.s.yaw = baWrapDegrees(c.s.yaw + step * 0.018);
      c.set("yaw", Math.round(c.s.yaw / 5) * 5);
      return true;
    },
    show(c) {
      const escape = c.s.card === "escape";
      const vectors = escape ? c.spec.sets.s1 : [1, 2, 3].map(i => c.live("b" + i, BA_XYZ));
      const D = baDet3(...vectors);
      const target = escape ? c.live("escape-", BA_XYZ) : null;
      const span = baSpan3(vectors);
      let verdict;
      if (D !== 0) verdict = "Basis: every 3D target has exactly one coordinate triple.";
      else if (span.kind === "plane") verdict = "Coplanar: every combination stays in the plane through the origin with normal " + baPair(span.normal) + ".";
      else if (span.kind === "line") verdict = "All three arrows are parallel, so only a line is reachable.";
      else verdict = "All three arrows are zero, so only the origin is reachable.";
      const names = ["b₁", "b₂", "b₃"];
      c.put("state", (escape ? "Set 1 for this mission · " : "") + vectors.map((v, i) => names[i] + " = " + baPair(v)).join(" · ") +
        " · D = " + baFmt(D) + " · " + verdict + (target ? " · target " + baPair(target) : ""));
      return {
        space: true,
        desc: "3D view turned " + Math.round(c.s.yaw) + "° and tilted " + Math.round(c.s.tilt) + "°. " +
          vectors.map((v, i) => names[i] + " = " + baPair(v)).join(", ") + ". D = " + baFmt(D) + ". " + verdict +
          (target ? " The gold target " + baPair(target) + " has a dashed drop line to the xy-plane." : ""),
        vectors: vectors.map((v, i) => ({ v, color: ["first", "second", "sum"][i], label: names[i] })),
        plane: span.kind === "plane" && D === 0 ? span : null,
        box: D !== 0 ? vectors : null,
        target, yaw: c.s.yaw, tilt: c.s.tilt
      };
    },
    checks: {
      classify: ["Load each set and look for the red sheet, or compute D = b₁·(b₂ × b₃).",
        "In Set 3, b₃ − b₂ = b₂ − b₁ = (3, 3, 3). That pattern hides a dependency.", c => {
          const picks = [1, 2, 3, 4].map(i => c.choice("set" + i));
          const right = picks.filter((pick, i) => pick === c.spec.kinds[i]).length;
          return baGrade(right === 4, right + " of 4 are right. Compute D for each set. D = 0 means coplanar.",
            right === 4 ? "D values: Set 1 = 0, Set 2 = 1, Set 3 = 0, Set 4 = 2. In Set 1, b₃ = b₁ + b₂. In Set 3, b₃ = 2b₂ − b₁." : "");
        }],
      fix: ["Keep b₁ = (1, 2, 3) and b₂ = (4, 5, 6). Their plane has normal b₁ × b₂ = (−3, 6, −3).",
        "Any b₃ with a nonzero dot product with (−3, 6, −3) leaves the plane. Try (0, 0, 1).", c => {
          const vectors = [1, 2, 3].map(i => c.vec("b" + i, BA_XYZ));
          const [s1, s2] = c.spec.sets.s3;
          if (!baSame(vectors[0], s1) || !baSame(vectors[1], s2)) return baSetup("Load Set 3 and change only b₃. b₁ must stay (1, 2, 3) and b₂ must stay (4, 5, 6).");
          const D = baDet3(...vectors);
          return baGrade(D !== 0, "D is still 0, so b₃ is still in the plane of b₁ and b₂.",
            D !== 0 ? "b₁ × b₂ = (−3, 6, −3), and D = b₃·(b₁ × b₂) = " + baFmt(D) + " ≠ 0, so the three arrows now span 3D space." : "");
        }],
      build: ["Pick two non-parallel arrows. Any combination of them lies in their plane.",
        "For example b₁ = (1, 0, 0), b₂ = (0, 0, 1) and b₃ = b₁ + b₂ = (1, 0, 1).", c => {
          const vectors = [1, 2, 3].map(i => c.vec("b" + i, BA_XYZ));
          if (vectors.some(baIsZero)) return baSetup("All three arrows must be nonzero.");
          const pairs = [[0, 1], [0, 2], [1, 2]];
          const parallel = pairs.find(([i, j]) => baIsZero(baCross3(vectors[i], vectors[j])));
          if (parallel) return baSetup("b" + "₁₂₃"[parallel[0]] + " and b" + "₁₂₃"[parallel[1]] + " are parallel. Make every pair point in different directions.");
          if (["s1", "s3"].some(key => c.spec.sets[key].every((v, i) => baSame(v, vectors[i])))) return baSetup("That is one of the presets. Build a different trap.");
          const D = baDet3(...vectors);
          return baGrade(D === 0, "D = " + baFmt(D) + ", so these three arrows are a basis. Make b₃ a combination of b₁ and b₂.",
            D === 0 ? "D = b₁·(b₂ × b₃) = 0. No two arrows are parallel, but all three lie in one plane, so they cannot reach targets off it." : "");
        }],
      escape: ["Every arrow in Set 1 has z = 0.", "Any target with a nonzero z component is out of reach.", c => {
        const target = c.vec("escape-", BA_XYZ);
        const pass = target[2] !== 0;
        return baGrade(pass, "x·(1, 0, 0) + y·(0, 1, 0) + 0·(1, 1, 0) = " + baPair(target) + ", so this target is reachable.",
          pass ? "Every combination of Set 1 has z = 0. Your target has z = " + baFmt(target[2]) + ", so no coefficients reach it." : "");
      }]
    }
  },

  lattice: {
    bases: { a: [[2, 1], [1, 1]], b: [[2, 0], [0, 1]], c: [[3, 1], [1, 1]], d: [[1, 2], [1, 3]] },
    targets: [[3, 1], [-1, 2]],
    start(c) { c.s.shots = []; },
    actions: {
      fire(c) {
        const key = c.val("basis");
        const basis = key === "own" ? [c.vec("own-b1"), c.vec("own-b2")] : c.spec.bases[key];
        const coeffs = [c.num("c1"), c.num("c2")];
        c.s.shots.push({ key, basis, coeffs, point: baCombo(basis, coeffs) });
        if (c.s.shots.length > 40) c.s.shots.shift();
        return null;
      }
    },
    show(c) {
      const key = c.val("basis");
      const basis = key === "own" ? [c.live("own-b1"), c.live("own-b2")] : c.spec.bases[key];
      const D = determinant(...basis);
      const shots = c.s.shots.filter(s => s.key === key && baSame(s.basis[0], basis[0]) && baSame(s.basis[1], basis[1]));
      const last = shots.at(-1);
      const arrows = [baArrow(basis[0], "first", "b₁"), baArrow(basis[1], "second", "b₂")];
      const marks = shots.slice(0, -1).map(s => baMark(s.point, "sum", "", { loose: true }));
      if (last) {
        arrows.push(...baSteps(basis, last.coeffs).map(a => ({ ...a, loose: true })));
        marks.push(baMark(last.point, "sum", "hit " + baPair(last.point), { loose: true }));
      }
      if (key === "a") marks.push(...c.spec.targets.map(t => baMark(t, "target", baPair(t), { shape: "ring" })));
      let scanText = "";
      if (c.checked("scan")) {
        if (D === 0) scanText = "Scan: these arrows are dependent, so they are not a basis.";
        else {
          for (let x = -8; x <= 8; x++) for (let y = -5; y <= 5; y++) {
            const coords = baSolve(basis, [x, y]);
            const whole = coords.every(n => Math.abs(n - Math.round(n)) < 1e-9);
            marks.push(baMark([x, y], whole ? "good" : "bad", "", { r: whole ? 3.2 : 2.6, shape: whole ? "dot" : "ring", loose: true }));
          }
          scanText = Math.abs(D) === 1 ? "Scan: every whole-number point is hit (green)." :
            "Scan: only 1 in every " + baFmt(Math.abs(D)) + " whole-number points is hit. The red rings are missed.";
        }
      }
      const name = key === "own" ? "Your basis" : "Basis " + key.toUpperCase();
      c.put("state", name + " · b₁ = " + baPair(basis[0]) + ", b₂ = " + baPair(basis[1]) + " · D = " + baFmt(D) + " · " +
        (last ? "last shot " + baFmt(last.coeffs[0]) + " b₁ + " + baFmt(last.coeffs[1]) + " b₂ = " + baPair(last.point) : "no shots yet") +
        (scanText ? " · " + scanText : ""));
      return {
        desc: name + " with b₁ = " + baPair(basis[0]) + " and b₂ = " + baPair(basis[1]) + ", D = " + baFmt(D) +
          ". Violet dots mark whole-number combinations. " + (last ? "The last shot landed at " + baPair(last.point) + ". " : "") +
          (key === "a" ? "Gold rings mark the targets (3, 1) and (−1, 2). " : "") + scanText,
        min: 5, gridStep: 1,
        lattice: D !== 0 ? { basis, nodes: true, lines: false } : null,
        arrows, marks
      };
    },
    checks: {
      reach: ["Solve for the coefficients of (3, 1) in basis A. Since D = 1, they come out whole.",
        "(3, 1) = 2·(2, 1) − 1·(1, 1). Now find (−1, 2).", c => {
          const hits = c.s.shots.filter(s => s.key === "a");
          const missing = c.spec.targets.filter(t => !hits.some(s => baSame(s.point, t)));
          return baGrade(!missing.length, "Basis A shots have not hit " + missing.map(baPair).join(" or ") + " yet. Choose basis A and fire.",
            !missing.length ? "(3, 1) = 2·(2, 1) − 1·(1, 1) and (−1, 2) = −3·(2, 1) + 5·(1, 1). Basis A has D = 1, so every whole-number target has whole-number coefficients." : "");
        }],
      miss: ["With b₁ = (2, 0), whole-number steps only change x by even amounts.", "Try a point with an odd x.", c => {
        const point = [c.num("miss-x"), c.num("miss-y")];
        const coords = baSolve(c.spec.bases.b, point);
        const whole = coords.every(n => Math.abs(n - Math.round(n)) < 1e-9);
        return baGrade(!whole, baPair(point) + " = " + baFmt(coords[0]) + "·(2, 0) + " + baFmt(coords[1]) + "·(0, 1), which uses whole numbers. Find a point that needs a fraction.",
          !whole ? baPair(point) + " needs c₁ = " + baShow(coords[0]) + ", which is not a whole number. Basis B has D = 2, so it misses half of the whole-number points." : "");
      }],
      which: ["Compute D for both bases.", "Full coverage with whole numbers happens exactly when D = ±1.", c => {
        const pick = c.choice("which");
        return baGrade(pick === "d", "Compare D: for C, D = 3·1 − 1·1 = 2. For D, D = 1·3 − 2·1 = 1.",
          pick === "d" ? "Basis C has D = 2, so (1, 0) needs c₁ = 1/2. Basis D has D = 1, so dividing by D never creates a fraction and every whole-number point is reached." : "");
      }],
      design: ["You need whole-number arrows with D = ±1.", "Try b₁ = (1, 1) and b₂ = (0, 1), or b₁ = (2, 1) and b₂ = (1, 1).", c => {
        const basis = [c.vec("own-b1"), c.vec("own-b2")];
        const units = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        if (basis.every(b => units.some(u => baSame(u, b)))) return baSetup("That is just the standard basis with signs or order changed. Build something slanted.");
        const D = determinant(...basis);
        const pass = Math.abs(D) === 1;
        const e1 = pass ? baSolve(basis, [1, 0]) : null, e2 = pass ? baSolve(basis, [0, 1]) : null;
        return baGrade(pass, "D = " + baFmt(D) + ". Whole-number steps cover every point only when D = ±1.",
          pass ? "D = " + baFmt(D) + ". (1, 0) has coordinates " + baPair(e1) + " and (0, 1) has " + baPair(e2) +
            ". Both are whole, so every whole-number point x·(1, 0) + y·(0, 1) is reachable with whole steps." : "");
      }]
    }
  },

  detective: {
    cases: {
      slots: { basis: [[1, 0], [1, 1]], v: [3, 2], line: "4", kind: "slots", claimed: [2, 1],
        explain: "Lines 1 to 3 are right: c₁ = 1 and c₂ = 2. Line 4 puts them in the wrong slots. The first slot belongs to b₁, so [v]_B = (1, 2). The claimed (2, 1) builds 2·(1, 0) + 1·(1, 1) = (3, 1)." },
      sign: { basis: [[2, 1], [1, 3]], v: [4, 7], line: "1", kind: "sign", claimed: [5 / 7, 10 / 7],
        explain: "D = b₁x·b₂y − b₁y·b₂x = 2·3 − 1·1 = 5, not 7. With D = 5: c₁ = 5/5 = 1 and c₂ = 10/5 = 2. Check: 1·(2, 1) + 2·(1, 3) = (4, 7)." },
      divide: { basis: [[1, 2], [2, 4]], v: [3, 6], line: "2", kind: "divide", claimed: [0, 0],
        explain: "D = 0 means the arrows are dependent, so the formula cannot be used. 0/0 is undefined, not 0. Here (3, 6) lies on the line along (1, 2), so infinitely many pairs work, such as (3, 0) and (1, 1). The claimed (0, 0) reaches only the origin." },
      order: { basis: [[1, 2], [0, 1]], v: [3, 5], line: "1", kind: "order", claimed: [1.5, 3.5],
        explain: "b₁ = (1, 2) means b₁x = 1 and b₁y = 2. In the right order: D = 1·1 − 2·0 = 1, c₁ = (3·1 − 5·0)/1 = 3 and c₂ = (1·5 − 2·3)/1 = −1. Check: 3·(1, 2) − 1·(0, 1) = (3, 5)." },
      shortcut: { basis: [[1, 0], [1, 1]], v: [3, 2], line: "2", kind: "shortcut", claimed: [3, 5],
        explain: "B is a valid basis but not orthonormal: b₁·b₂ = 1 and |b₂| = √2. The dot products (3, 5) rebuild (8, 5), not (3, 2). Solving the equations gives [v]_B = (1, 2)." }
    },
    start(c) { c.s.solved = {}; },
    show(c) {
      const key = c.spec.cases[c.s.card] ? c.s.card : null;
      if (!key) {
        c.put("state", "Open a case file.");
        return { desc: "Standard grid. Open a case file to see its arrows and claimed answer.", arrows: [] };
      }
      const card = c.spec.cases[key];
      const end = baCombo(card.basis, card.claimed);
      const D = determinant(...card.basis);
      const arrows = [baArrow(card.basis[0], "first", "b₁"), baArrow(card.basis[1], "second", "b₂"), baArrow(card.v, "target", "v")];
      arrows.push(...baSteps(card.basis, card.claimed, ["b₁", "b₂"], ["bad", "bad"]));
      const lines = [];
      if (c.s.solved[key]) {
        if (D !== 0) arrows.push(...baSteps(card.basis, baSolve(card.basis, card.v)));
        else lines.push({ direction: card.basis[0], color: "sum", dashed: true });
      }
      c.put("state", "b₁ = " + baPair(card.basis[0]) + " · b₂ = " + baPair(card.basis[1]) + " · [v]_E = " + baPair(card.v) +
        " · the claimed [v]_B = " + baPair(card.claimed) + " rebuilds " + baPair(end) + (c.s.solved[key] ? " · case solved" : ""));
      return {
        desc: "b₁ = " + baPair(card.basis[0]) + ", b₂ = " + baPair(card.basis[1]) + ", target v = " + baPair(card.v) +
          ". Red dashed steps follow the claimed answer and land at " + baPair(end) + "." + (c.s.solved[key] && D !== 0 ? " Blue and violet steps show the correct answer." : ""),
        arrows, lines,
        marks: [baMark(end, "bad", "claimed")],
        fit: [card.v, end]
      };
    },
    checks: {
      slots: ["Lines 2 and 3 compute c₁ and c₂. Check where each one ends up.", "The first slot of [v]_B always belongs to b₁.", baDetectiveCheck("slots")],
      sign: ["Recompute D from b₁x·b₂y − b₁y·b₂x.", "The formula has a minus sign between the two products.", baDetectiveCheck("sign")],
      divide: ["What does D = 0 say about the two arrows?", "Dividing by zero is undefined, and 0/0 is not 0.", baDetectiveCheck("divide")],
      order: ["Compare line 1 with the arrow (1, 2) given above it.", "A pair (x, y) lists the horizontal component first.", baDetectiveCheck("order")],
      shortcut: ["The shortcut c = v·b works only for certain bases. Which ones?", "Is b₁ perpendicular to b₂? Is b₂ a unit arrow?", baDetectiveCheck("shortcut")]
    }
  },

  poly: {
    defaultCard: "both",
    cards: {
      both: { p: [3, 2], text: "p(x) = 3 + 2x" },
      negative: { p: [1, -4], text: "p(x) = 1 − 4x" },
      reverse: { q: [-2, 3], text: "[p]_Q = (−2, 3)" },
      evaluate: { q: [2, -1], text: "[p]_Q = (2, −1)" }
    },
    start(c) { c.s.revealed = {}; },
    show(c) {
      const key = baCard(c);
      const card = c.spec.cards[key];
      const p = card.p ?? [card.q[0] + card.q[1], card.q[1]];
      const q = [p[0] - p[1], p[1]];
      const known = Boolean(card.p) || c.s.revealed[key];
      const view = c.val("view");
      const graph = f => Array.from({ length: 65 }, (_, i) => { const x = -3.2 + i * 0.1; return [x, f(x)]; });
      const at = x => [x, x];
      const paths = view === "P"
        ? [{ points: graph(() => 1), color: "first", dashed: true, width: 2, loose: true, label: "1", labelAt: [-2.6, 1] },
          { points: graph(x => x), color: "second", dashed: true, width: 2, loose: true, label: "x", labelAt: at(-2.2) }]
        : [{ points: graph(() => 1), color: "first", dashed: true, width: 2, loose: true, label: "1", labelAt: [-2.6, 1] },
          { points: graph(x => 1 + x), color: "second", dashed: true, width: 2, loose: true, label: "1 + x", labelAt: [-2.4, -1.4] }];
      if (card.q && !known) {
        paths.push({ points: graph(() => card.q[0]), color: "sum", width: 1.6, loose: true, label: baFmt(card.q[0]) + "·1", labelAt: [1.6, card.q[0]] },
          { points: graph(x => card.q[1] * (1 + x)), color: "good", width: 1.6, loose: true, label: baFmt(card.q[1]) + "·(1 + x)", labelAt: [0.6, card.q[1] * 1.6] });
      }
      if (known) paths.push({ points: graph(x => p[0] + p[1] * x), color: "target", width: 3.4, loose: true, label: "p", labelAt: [2.2, p[0] + p[1] * 2.2] });
      const marks = key === "evaluate" && known ? [baMark([2, p[0] + 2 * p[1]], "target", "p(2) = " + baFmt(p[0] + 2 * p[1]))] : [];
      c.put("state", card.text + (c.s.revealed[key] ? " · p(x) = " + baPoly(p) + " · [p]_P = " + baPair(p) + " · [p]_Q = " + baPair(q) : ""));
      return {
        desc: "Graphs over x from −3 to 3. Dashed: the basis polynomials of " + (view === "P" ? "P, 1 and x" : "Q, 1 and 1 + x") + ". " +
          (known ? "Gold: p(x) = " + baPoly(p) + "." : "The two solid pieces add up to the hidden polynomial."),
        min: 3.2, axisNames: ["x", "p(x)"], fit: [[3.2, 5], [-3.2, -5]],
        paths, marks
      };
    },
    checks: {
      both: ["In P, read the coefficients straight off a + bx.", "In Q, c₁·1 + c₂(1 + x) = (c₁ + c₂) + c₂x. Match the x terms first.", c => {
        const P = [c.ans("both-p1"), c.ans("both-p2")], Q = [c.ans("both-q1"), c.ans("both-q2")];
        const okP = baFitsAll(P, [3, 2]), okQ = baFitsAll(Q, [1, 2]);
        if (okP && okQ) c.s.revealed.both = true;
        return baGrade(okP && okQ, !okP ? "Check [p]_P. In P = {1, x}, the coordinates are just the coefficients a and b." :
          "[p]_P is right. Your [p]_Q builds " + baPoly([Q[0] + Q[1], Q[1]]) + ", not 3 + 2x.",
        okP && okQ ? "3 + 2x = 3·1 + 2·x, so [p]_P = (3, 2). In Q: c₁·1 + c₂(1 + x) = (c₁ + c₂) + c₂x. Matching gives c₂ = 2 and c₁ = 3 − 2 = 1, so [p]_Q = (1, 2). These are the same numbers as the opening example, where (3, 2) became (1, 2) in the skew basis." : "");
      }],
      negative: ["Match the x terms: c₂ = −4.", "Then match the constants: c₁ + c₂ = 1.", c => {
        const Q = [c.ans("negative-q1"), c.ans("negative-q2")];
        const pass = baFitsAll(Q, [5, -4]);
        if (pass) c.s.revealed.negative = true;
        return baGrade(pass, "Your coordinates build " + baPoly([Q[0] + Q[1], Q[1]]) + ", not 1 − 4x.",
          pass ? "c₂ = −4 from the x terms, then c₁ + c₂ = 1 gives c₁ = 5. Check: 5·1 − 4(1 + x) = 1 − 4x." : "");
      }],
      reverse: ["Expand −2·1 + 3(1 + x).", "Collect the constants and the x terms separately.", c => {
        const entry = [c.ans("reverse-a"), c.ans("reverse-b")];
        const pass = baFitsAll(entry, [1, 3]);
        if (pass) c.s.revealed.reverse = true;
        return baGrade(pass, "You wrote " + baPoly(entry) + ". Expand −2·1 + 3·(1 + x) and compare.",
          pass ? "−2·1 + 3(1 + x) = −2 + 3 + 3x = 1 + 3x. The same polynomial has [p]_P = (1, 3)." : "");
      }],
      evaluate: ["First rebuild p from 2·1 − 1·(1 + x).", "Or evaluate each basis polynomial at x = 2 and combine: 2·1 − (1 + 2).", c => {
        const value = c.ans("evaluate-value");
        const pass = baFits(value, -1);
        if (pass) c.s.revealed.evaluate = true;
        return baGrade(pass, "Rebuild p(x) from its Q coordinates first, then substitute x = 2.",
          pass ? "p(x) = 2·1 − (1 + x) = 1 − x, so p(2) = −1. Whichever basis you use to describe p, it is the same polynomial and takes the same value at x = 2." : "");
      }]
    }
  }
};

// ---------------------------------------------------------------------------
// Basis Arcade controller.
// ---------------------------------------------------------------------------

function initializeBasisArcade(root) {
  const details = root.querySelector("#basis-arcade");
  if (!details) return;
  const get = id => root.querySelector("#ba-" + id);
  const select = get("station"), resetButton = get("reset"), status = get("status");
  const reducedBox = get("reduced"), progress = get("progress");
  const figure = get("figure-template").content.firstElementChild.cloneNode(true);
  const toolTemplate = get("mission-template");
  const viewport = figure.querySelector("#ba-viewport");
  const canvas = figure.querySelector("#ba-canvas");
  const geometry = figure.querySelector("[data-ba-geometry]");
  const labelLayer = figure.querySelector("[data-ba-labels]");
  const desc = figure.querySelector("#ba-desc");
  const title = figure.querySelector("#ba-title");
  const renderStatus = figure.querySelector("#ba-render-status");
  const colors = baPalette(root);
  const lifetime = new AbortController();
  const listen = (node, type, handler, options = {}) =>
    node.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
  const panels = new Map(), cards = new Map(), completion = new Set();
  let active = null, plan = null, drawing = null;
  let motion = null, motionNow = 0;
  let graphics = null, loading = false, contextLost = false, disposed = false;
  let frame = null, lastTick = null, drag = null;

  const say = message => baRich(status, message ?? "");
  const updateProgress = () => baRich(progress, completion.size + " of " + cards.size + " missions completed this session.");
  const lastOpenCard = c => [...c.cards].filter(([, card]) => card.open).map(([check]) => check).at(-1) ?? null;

  function onScreen() {
    if (!details.open || document.hidden || !viewport.isConnected) return false;
    const box = viewport.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
  }

  for (const panel of root.querySelectorAll("#ba-panels [data-ba-station]")) {
    const key = panel.dataset.baStation;
    const spec = baStations[key];
    if (!spec) continue;
    const fields = new Map([...panel.querySelectorAll("[name]")].map(field => [field.name, field]));
    const defaults = new Map([...fields].map(([name, field]) => [name, field.type === "checkbox" ? field.checked : field.value]));
    const field = name => fields.get(name);
    const c = {
      key, panel, spec, defaults, field, s: {}, cards: new Map(),
      title: panel.querySelector("h4").textContent,
      node: selector => panel.querySelector(selector),
      val: name => field(name).value,
      checked: name => field(name).checked,
      num(name) {
        const input = field(name);
        if (input.validity.valid && Number.isFinite(input.valueAsNumber)) return input.valueAsNumber;
        throw new BaFieldError(input);
      },
      ans(name) {
        const input = field(name);
        const value = baParse(input.value);
        if (value === null) throw new BaFieldError(input, "Enter a number such as 2, −1.5, 1/3 or 1/√2.", true);
        return value;
      },
      choice(name) {
        const input = field(name);
        if (!input.value) throw new BaFieldError(input, "Choose an option.");
        return input.value;
      },
      vec: (prefix, axes = ["x", "y"]) => axes.map(axis => c.num(prefix + axis)),
      // Read a vector for drawing; keep the last valid value while an input is mid-edit.
      live(prefix, axes = ["x", "y"]) {
        const values = axes.map(axis => {
          const input = field(prefix + axis);
          return input.validity.valid && Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null;
        });
        c.s.live ??= {};
        if (values.includes(null)) return c.s.live[prefix] ?? axes.map(() => 0);
        c.s.live[prefix] = values;
        return values;
      },
      set(name, value) { field(name).value = String(value); },
      writeVec(prefix, vector, axes = ["x", "y"]) { axes.forEach((axis, i) => c.set(prefix + axis, vector[i])); },
      put(name, text) { baRich(c.node('[data-ba-read="' + name + '"]'), text); },
      animate(from, to) {
        if (reduced() || !onScreen()) { motion = null; return; }
        motion = { from, to, start: performance.now() };
        motionNow = motion.start;
      },
      glide() {
        if (!motion) return null;
        const t = Math.min(1, Math.max(0, (motionNow - motion.start) / 320));
        return add(motion.from, scale(subtract(motion.to, motion.from), t * t * (3 - 2 * t)));
      },
      stopMotion() { motion = null; },
      reduced
    };
    for (const card of panel.querySelectorAll("[data-ba-mission]")) {
      const id = card.dataset.baMission;
      const check = id.slice(key.length + 1);
      card.append(toolTemplate.content.cloneNode(true));
      c.cards.set(check, card);
      cards.set(id, { id, card, check, hints: 0 });
      listen(card, "toggle", () => {
        if (card.open) c.s.card = check;
        else if (c.s.card === check) c.s.card = lastOpenCard(c);
        if (active === c) refresh();
      });
    }
    panels.set(key, c);
    resetModel(c);
    panel.querySelector("fieldset").disabled = false;
  }

  function resetModel(c) {
    for (const [name, value] of c.defaults) {
      const input = c.field(name);
      if (input.type === "checkbox") input.checked = value;
      else input.value = value;
      input.setCustomValidity?.("");
    }
    c.s = { card: lastOpenCard(c) };
    c.spec.start(c);
  }

  function rebuild() {
    if (!active || !details.open) return;
    plan = active.spec.show(active);
    baSetPlain(title, active.title + (plan.caption ? " · " + plan.caption : ""));
    baSetPlain(desc, plan.desc);
    drawing = plan.space ? baBuildSpace(plan) : baBuildFlat(plan);
    baPaintSvg(drawing, geometry, labelLayer, colors);
  }

  function refresh() {
    rebuild();
    requestDraw();
  }

  function showSvg(message) {
    viewport.dataset.renderer = "svg";
    canvas.hidden = true;
    if (message) baRich(renderStatus, message);
  }

  function requestDraw() {
    if (disposed || frame !== null) return;
    frame = requestAnimationFrame(drawFrame);
  }

  function cancelDraw() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTick = null;
  }

  function drawFrame(now) {
    frame = null;
    if (!active || !details.open || document.hidden) {
      lastTick = null;
      return;
    }
    let again = false;
    if (motion) {
      if (reduced() || now - motion.start >= 320) motion = null;
      else {
        motionNow = now;
        again = true;
      }
      rebuild();
    }
    if (active.spec.tick && !reduced() && onScreen()) {
      const step = lastTick === null ? 0 : Math.min(64, now - lastTick);
      if (active.spec.tick(active, step)) {
        again = true;
        rebuild();
      }
    }
    lastTick = again ? now : null;
    paint();
    if (again) requestDraw();
  }

  function paint() {
    if (!drawing) return;
    if (!graphics || contextLost) {
      if (!graphics && !loading) showSvg("SVG diagram.");
      return;
    }
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    try {
      graphics.draw(drawing, width, height, reduced());
      if (graphics.isLost()) {
        showSvg("The WebGL context was lost, so the diagram uses SVG.");
        return;
      }
      canvas.hidden = false;
      viewport.dataset.renderer = "webgl";
      baRich(renderStatus, drawing.space
        ? "WebGL 3D view. Drag the diagram or use the view sliders to turn it."
        : "WebGL diagram.");
    } catch {
      graphics.dispose();
      graphics = null;
      showSvg("WebGL could not draw this diagram, so it uses SVG.");
    }
  }

  async function loadGraphics() {
    if (loading || graphics || disposed) return;
    loading = true;
    baRich(renderStatus, "SVG diagram. Loading the WebGL view.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (disposed) return;
      graphics = baCreateGraphics(THREE, canvas, colors);
      requestDraw();
    } catch {
      graphics = null;
      showSvg("WebGL is unavailable here, so the diagram uses SVG.");
    }
  }

  function mount() {
    motion = null;
    active = panels.get(select.value) ?? panels.values().next().value;
    for (const c of panels.values()) c.panel.hidden = c !== active;
    active.node("[data-ba-plot-slot]").append(figure);
    viewport.dataset.space = active.spec.drag ? "true" : "false";
    refresh();
  }

  function clearCard(card) {
    baRich(card.querySelector("[data-ba-feedback]"), "");
    const work = card.querySelector("[data-ba-work]");
    work.hidden = true;
    work.open = false;
  }

  function showGrade(mission, result) {
    const { card, id } = mission;
    const work = card.querySelector("[data-ba-work]");
    baRich(card.querySelector("[data-ba-feedback]"),
      result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
    baRich(card.querySelector("[data-ba-work-text]"), result.work || "");
    work.hidden = !result.work;
    work.open = Boolean(result.work) && !result.pass;
    if (result.pass && !completion.has(id)) {
      completion.add(id);
      card.querySelector("[data-ba-done]").hidden = false;
      updateProgress();
    }
    say("");
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !active || !active.panel.contains(button) || button.disabled) return;
    const missionCard = button.closest("[data-ba-mission]");
    const mission = missionCard ? cards.get(missionCard.dataset.baMission) : null;
    const action = button.dataset.baAction;
    try {
      if (action) {
        const message = active.spec.actions[action](active, button, mission?.check ?? null);
        if (mission) baRich(mission.card.querySelector("[data-ba-feedback]"), message ?? "");
        else if (message !== null) say(message);
      } else if (mission && button.hasAttribute("data-ba-check")) {
        showGrade(mission, active.spec.checks[mission.check][2](active));
      } else if (mission && button.hasAttribute("data-ba-hint")) {
        if (mission.hints >= 2) return;
        const list = mission.card.querySelector("[data-ba-hint-list]");
        const item = document.createElement("li");
        baRich(item, active.spec.checks[mission.check][mission.hints]);
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
      if (!(error instanceof BaFieldError)) throw error;
      if (mission) baRich(mission.card.querySelector("[data-ba-feedback]"), error.message);
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
    const missionCard = target.closest("[data-ba-mission]");
    if (missionCard) clearCard(missionCard);
    active.spec.edit?.(active, target.name, event.type);
    refresh();
  }

  listen(details, "click", handleClick);
  listen(details, "input", handleEdit);
  listen(details, "change", handleEdit);
  listen(details, "toggle", () => {
    if (details.open) {
      loadGraphics();
      refresh();
    } else {
      motion = null;
      cancelDraw();
    }
  });
  listen(select, "change", () => {
    say("");
    mount();
  });
  listen(resetButton, "click", () => {
    motion = null;
    resetModel(active);
    for (const card of active.cards.values()) clearCard(card);
    say("Station settings reset. Completed missions stay counted for this session.");
    refresh();
  });
  listen(reducedBox, "change", () => {
    motion = null;
    refresh();
  });
  if (motionQuery?.addEventListener) listen(motionQuery, "change", () => refresh());
  listen(root.querySelector("#ba-arcade-link"), "click", () => { details.open = true; });

  // Drag to turn the 3D view. Touch drags turn only sideways so the page still scrolls.
  listen(viewport, "pointerdown", event => {
    if (!active?.spec.drag || event.button > 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
    viewport.setPointerCapture?.(event.pointerId);
  });
  listen(viewport, "pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    active.spec.drag(active, dx, drag.touch ? 0 : dy);
    refresh();
  });
  const endDrag = event => { if (drag && event.pointerId === drag.id) drag = null; };
  listen(viewport, "pointerup", endDrag);
  listen(viewport, "pointercancel", endDrag);

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestDraw()) : null;
  observer?.observe(viewport);
  // Resume the slow 3D turn when the diagram scrolls back into view.
  const sight = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) requestDraw(); })
    : null;
  sight?.observe(viewport);
  listen(document, "visibilitychange", () => {
    if (document.hidden) cancelDraw();
    else requestDraw();
  });
  listen(canvas, "webglcontextlost", event => {
    event.preventDefault();
    contextLost = true;
    cancelDraw();
    showSvg("The WebGL context was lost, so the diagram uses SVG.");
  });
  listen(canvas, "webglcontextrestored", () => {
    contextLost = false;
    graphics?.invalidate();
    requestDraw();
  });
  listen(window, "pageshow", () => requestDraw());
  listen(window, "pagehide", event => {
    cancelDraw();
    if (event.persisted) return;
    disposed = true;
    lifetime.abort();
    observer?.disconnect();
    sight?.disconnect();
    graphics?.dispose();
    graphics = null;
  });

  select.disabled = false;
  resetButton.disabled = false;
  reducedBox.disabled = false;
  updateProgress();
  mount();
  if (location.hash === "#basis-arcade") details.open = true;
  if (details.open) loadGraphics();
}

// ---------------------------------------------------------------------------
// Flat diagrams: build one list of shapes in SVG pixels, then paint it with
// SVG (fallback) or WebGL (main renderer). Labels always stay in SVG.
// ---------------------------------------------------------------------------

function baBuildFlat(plan) {
  const [W, H] = BA_SIZE, [CX, CY] = BA_CENTER;
  const shapes = [], names = [];
  const points = [...(plan.fit ?? [])];
  for (const a of plan.arrows ?? []) if (!a.loose) points.push(a.from, a.to);
  for (const m of plan.marks ?? []) if (!m.loose) points.push(m.at);
  for (const f of plan.fills ?? []) points.push(...f.points);
  for (const p of plan.paths ?? []) if (!p.loose) points.push(...p.points);
  const reach = plan.min ?? 3;
  const maxX = Math.max(reach * 1.55, ...points.map(p => Math.abs(p[0]) * 1.1 + reach * 0.12));
  const maxY = Math.max(reach, ...points.map(p => Math.abs(p[1]) * 1.1 + reach * 0.12));
  const k = Math.min(262 / maxX, 160 / maxY, plan.zoom ?? 56);
  const hx = (W / 2 - 8) / k, hy = (H / 2 - 8) / k;
  const map = ([x, y]) => [CX + k * x, CY - k * y];
  const inside = ([x, y]) => Math.abs(x) <= hx + 1e-9 && Math.abs(y) <= hy + 1e-9;
  const stroke = (layer, coords, color, width, options = {}) => shapes.push({ kind: "stroke", layer, coords, color, width, ...options });
  const fill = (layer, coords, color, opacity = 1) => shapes.push({ kind: "fill", layer, coords, color, opacity });
  const label = (text, [x, y], color, offset = [8, -9], small = false) => {
    if (!text) return;
    const width = text.length * (small ? 7 : 8.6);
    const left = Math.max(4, Math.min(W - width - 4, x + offset[0]));
    let top = Math.max(16, Math.min(H - 6, y + offset[1]));
    for (let tries = 0; tries < 4; tries++) {
      const clash = names.some(n => Math.abs(n.y - top) < 15 && left < n.x + n.width && n.x < left + width);
      if (!clash) break;
      top = top + 17 > H - 6 ? top - 34 : top + 17;
    }
    names.push({ text, x: left, y: top, color, small, width });
  };
  function clip(start, direction, low = -Infinity, high = Infinity) {
    for (let axis = 0; axis < 2; axis++) {
      const limit = axis ? hy : hx, position = start[axis], change = direction[axis];
      if (Math.abs(change) < 1e-12) {
        if (Math.abs(position) > limit) return null;
        continue;
      }
      const a = (-limit - position) / change, b = (limit - position) / change;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
    return low < high ? [add(start, scale(direction, low)), add(start, scale(direction, high))] : null;
  }
  function head(tip, from, color, layer, size = 12) {
    const d = subtract(tip, from), length = Math.hypot(...d);
    if (length < 4) return tip;
    const u = scale(d, 1 / length), n = [-u[1], u[0]];
    const base = subtract(tip, scale(u, Math.min(size, length * 0.6)));
    const wing = Math.min(size, length * 0.6) * 0.45;
    fill(layer, [tip, add(base, scale(n, wing)), subtract(base, scale(n, wing))], color);
    return add(base, scale(u, 2));
  }

  // Standard reference grid and axes.
  if (plan.grid !== false) {
    const g = plan.gridStep ?? [0.25, 0.5, 1, 2, 5, 10, 20, 50].find(step => step * k >= 15) ?? 100;
    for (let i = Math.ceil(-hx / g); i <= Math.floor(hx / g); i++) stroke(0, [map([i * g, -hy]), map([i * g, hy])], "grid", 1);
    for (let i = Math.ceil(-hy / g); i <= Math.floor(hy / g); i++) stroke(0, [map([-hx, i * g]), map([hx, i * g])], "grid", 1);
    const labelStep = g * ([1, 2, 5, 10].find(m => g * m * k >= 44) ?? 20);
    for (let i = Math.ceil(-hx / labelStep); i <= Math.floor(hx / labelStep); i++) {
      if (i === 0 || Math.abs(i * labelStep) > hx - 0.4 * labelStep) continue;
      const [x, y] = map([i * labelStep, 0]);
      stroke(4, [[x, y - 4], [x, y + 4]], "axis", 1.2);
      label(baFmt(i * labelStep), [x, y], "axis", [-5, 17], true);
    }
    for (let i = Math.ceil(-hy / labelStep); i <= Math.floor(hy / labelStep); i++) {
      if (i === 0 || Math.abs(i * labelStep) > hy - 0.4 * labelStep) continue;
      const [x, y] = map([0, i * labelStep]);
      stroke(4, [[x - 4, y], [x + 4, y]], "axis", 1.2);
      label(baFmt(i * labelStep), [x, y], "axis", [-26, 5], true);
    }
  }
  if (plan.axes !== false) {
    const [xName, yName] = plan.axisNames ?? ["x", "y"];
    const xEnd = map([hx, 0]), yEnd = map([0, hy]);
    stroke(4, [map([-hx, 0]), head(xEnd, map([-hx, 0]), "axis", 4, 9)], "axis", 1.4);
    stroke(4, [map([0, -hy]), head(yEnd, map([0, -hy]), "axis", 4, 9)], "axis", 1.4);
    label(xName, xEnd, "axis", [-14, -8], true);
    label(yName, yEnd, "axis", [8, 12], true);
  }

  // Basis lattice: lines through whole-number multiples, optional nodes.
  if (plan.lattice) {
    const { basis: [b1, b2], nodes = false, lines = true, color = "lattice" } = plan.lattice;
    const D = determinant(b1, b2);
    if (D !== 0) {
      const corners = [[-hx, -hy], [-hx, hy], [hx, -hy], [hx, hy]].map(p => [determinant(p, b2) / D, determinant(b1, p) / D]);
      const span = i => [Math.ceil(Math.min(...corners.map(p => p[i]))), Math.floor(Math.max(...corners.map(p => p[i])))];
      const [lo1, hi1] = span(0), [lo2, hi2] = span(1);
      if (lines && hi2 - lo2 <= 90) for (let n = lo2; n <= hi2; n++) {
        const line = clip(scale(b2, n), b1);
        if (line) stroke(1, line.map(map), color, 1, { dashed: true });
      }
      if (lines && hi1 - lo1 <= 90) for (let n = lo1; n <= hi1; n++) {
        const line = clip(scale(b1, n), b2);
        if (line) stroke(1, line.map(map), color, 1, { dashed: true });
      }
      if (nodes && (hi1 - lo1 + 1) * (hi2 - lo2 + 1) <= 3000) {
        for (let i = lo1; i <= hi1; i++) for (let j = lo2; j <= hi2; j++) {
          const p = add(scale(b1, i), scale(b2, j));
          if (inside(p)) shapes.push({ kind: "dot", layer: 1, at: map(p), r: 2.4, color: nodes === true ? color : nodes });
        }
      }
    }
  }

  for (const f of plan.fills ?? []) fill(2, f.points.map(map), f.color, f.opacity ?? 0.22);
  for (const line of plan.lines ?? []) {
    const segment = clip(line.through ?? [0, 0], line.direction);
    if (segment) stroke(3, segment.map(map), line.color, line.width ?? 2, { dashed: line.dashed });
    if (segment && line.label) label(line.label, map(segment[1]), line.color, [-60, -10]);
  }
  for (const p of plan.paths ?? []) {
    const coords = [];
    for (let i = 1; i < p.points.length; i++) {
      const piece = clip(p.points[i - 1], subtract(p.points[i], p.points[i - 1]), 0, 1);
      if (!piece) continue;
      const [a, b] = piece.map(map);
      if (!coords.length || Math.hypot(...subtract(coords.at(-1), a)) > 0.5) {
        if (coords.length > 1) stroke(5, coords.splice(0), p.color, p.width ?? 2, { dashed: p.dashed, opacity: p.opacity });
        coords.length = 0;
        coords.push(a);
      }
      coords.push(b);
    }
    if (coords.length > 1) stroke(5, coords, p.color, p.width ?? 2, { dashed: p.dashed, opacity: p.opacity });
    if (p.label && p.labelAt && inside(p.labelAt)) label(p.label, map(p.labelAt), p.color);
  }
  for (const arc of plan.arcs ?? []) {
    const count = 28, coords = [];
    for (let i = 0; i <= count; i++) {
      const angle = arc.start + arc.sweep * i / count;
      coords.push([CX + arc.radius * Math.cos(angle), CY - arc.radius * Math.sin(angle)]);
    }
    const tip = coords.at(-1);
    coords[coords.length - 1] = head(tip, coords.at(-3), arc.color, 5, 9);
    stroke(5, coords, arc.color, 2);
    if (arc.label) label(arc.label, coords[Math.floor(count / 2)], arc.color, [6, -6], true);
  }
  for (const a of [...(plan.arrows ?? [])].sort((x, y) => Number(Boolean(y.dashed)) - Number(Boolean(x.dashed)))) {
    const layer = a.dashed ? 6 : 7;
    const direction = subtract(a.to, a.from);
    if (Math.hypot(...direction) < 1e-9) {
      if (inside(a.to)) shapes.push({ kind: "dot", layer, at: map(a.to), r: 4, color: a.color });
      if (a.label) label(a.label + " = 0", map(a.to), a.color);
      continue;
    }
    const segment = clip(a.from, direction, 0, 1);
    if (!segment) continue;
    let [start, end] = segment.map(map);
    if (inside(a.to)) end = head(map(a.to), start, a.color, layer, a.dashed ? 11 : 13);
    stroke(layer, [start, end], a.color, a.width ?? (a.dashed ? 2.6 : 3), { dashed: a.dashed, glow: !a.dashed });
    if (a.label) {
      if (a.dashed) {
        const mid = scale(add(start, end), 0.5);
        const d = subtract(end, start), n = Math.hypot(...d) || 1;
        label(a.label, mid, a.color, [(-d[1] / n) * 14 - 10, (d[0] / n) * 14 + 4]);
      } else label(a.label, map(inside(a.to) ? a.to : segment[1]), a.color);
    }
  }
  for (const m of plan.marks ?? []) {
    if (!inside(m.at)) continue;
    const at = map(m.at);
    const shape = m.shape ?? "dot";
    if (shape === "star") {
      const star = [];
      for (let i = 0; i < 10; i++) {
        const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 4.2 : 10;
        star.push([at[0] + radius * Math.cos(angle), at[1] - radius * Math.sin(angle)]);
      }
      fill(8, star, m.color);
    } else {
      shapes.push({
        kind: "dot", layer: 8, at, color: m.color,
        r: m.r ?? (shape === "token" ? 7.5 : shape === "ring" ? 6.5 : 4.8),
        hollow: shape === "ring", halo: shape === "token"
      });
    }
    label(m.label, at, m.color, m.offset ?? [10, -10]);
  }
  return { shapes, names, scale: k };
}

function baSvgNode(name, attributes, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
}

function baPaintSvg(drawing, geometry, labelLayer, colors) {
  const points = coords => coords.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
  const nodes = [...drawing.shapes].sort((a, b) => a.layer - b.layer).map(shape => {
    if (shape.kind === "stroke") {
      return baSvgNode("polyline", {
        points: points(shape.coords), fill: "none", stroke: colors[shape.color], "stroke-width": shape.width,
        "stroke-linecap": "round", "stroke-linejoin": "round",
        "stroke-dasharray": shape.dashed ? "6 5" : null, "stroke-opacity": shape.opacity ?? null
      });
    }
    if (shape.kind === "fill") {
      return baSvgNode("polygon", {
        points: points(shape.coords), fill: colors[shape.color],
        "fill-opacity": shape.opacity < 1 ? shape.opacity : null
      });
    }
    return baSvgNode("circle", {
      cx: shape.at[0].toFixed(2), cy: shape.at[1].toFixed(2), r: shape.r,
      fill: shape.hollow ? colors.plot : colors[shape.color],
      stroke: shape.hollow ? colors[shape.color] : colors.plot,
      "stroke-width": shape.hollow ? 2.2 : 1.4
    });
  });
  geometry.replaceChildren(...nodes);
  labelLayer.replaceChildren(...drawing.names.map(({ text, x, y, color, small }) => baSvgNode("text", {
    x: x.toFixed(1), y: y.toFixed(1), fill: colors[color], class: small ? "ba-label-small" : null
  }, text)));
}

// ---------------------------------------------------------------------------
// WebGL renderer. Flat diagrams become batched triangle meshes with glows and
// filled heads; the 3D station gets lit geometry. Shapes share the SVG layout,
// so the SVG labels line up with either renderer.
// ---------------------------------------------------------------------------

function baCreateGraphics(THREE, canvas, colors) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(colors.plot);
  const flatScene = new THREE.Scene();
  const flatCamera = new THREE.OrthographicCamera(-280, 280, 180, -180, 0.1, 10);
  flatCamera.position.z = 5;
  const flatGroup = new THREE.Group();
  flatScene.add(flatGroup);
  const materials = new Map();
  const space = baCreateSpaceScene(THREE, colors);
  let lastDrawing = null, dimensions = "";

  function flatMaterial(color, opacity) {
    const key = color + "|" + opacity;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshBasicMaterial({
        color: new THREE.Color(colors[color]), transparent: opacity < 1, opacity,
        side: THREE.DoubleSide, depthTest: false, depthWrite: false
      }));
    }
    return materials.get(key);
  }

  function clearFlat() {
    for (const child of flatGroup.children) child.geometry.dispose();
    flatGroup.clear();
  }

  function buildFlat(drawing) {
    clearFlat();
    const buckets = new Map();
    const bucket = (layer, color, opacity) => {
      const key = layer + "|" + color + "|" + opacity;
      if (!buckets.has(key)) buckets.set(key, { layer, color, opacity, positions: [] });
      return buckets.get(key).positions;
    };
    const vertex = (list, [x, y]) => list.push(x - 280, 180 - y, 0);
    const triangle = (list, a, b, c) => { vertex(list, a); vertex(list, b); vertex(list, c); };
    const disc = (list, center, radius, inner = 0) => {
      const count = Math.max(14, Math.ceil(radius * 2.2));
      for (let i = 0; i < count; i++) {
        const a0 = 2 * Math.PI * i / count, a1 = 2 * Math.PI * (i + 1) / count;
        const outer0 = [center[0] + radius * Math.cos(a0), center[1] + radius * Math.sin(a0)];
        const outer1 = [center[0] + radius * Math.cos(a1), center[1] + radius * Math.sin(a1)];
        if (!inner) triangle(list, center, outer0, outer1);
        else {
          const inner0 = [center[0] + inner * Math.cos(a0), center[1] + inner * Math.sin(a0)];
          const inner1 = [center[0] + inner * Math.cos(a1), center[1] + inner * Math.sin(a1)];
          triangle(list, inner0, outer0, outer1);
          triangle(list, inner0, outer1, inner1);
        }
      }
    };
    const segment = (list, from, to, width) => {
      const d = subtract(to, from), length = Math.hypot(...d);
      if (length < 1e-6) return;
      const n = scale([-d[1], d[0]], width / 2 / length);
      const a = add(from, n), b = subtract(from, n), c = add(to, n), e = subtract(to, n);
      triangle(list, a, b, c);
      triangle(list, c, b, e);
    };
    const polyline = (list, coords, width, dashed) => {
      for (let i = 1; i < coords.length; i++) {
        const from = coords[i - 1], d = subtract(coords[i], from), length = Math.hypot(...d);
        if (length < 1e-6) continue;
        if (!dashed) {
          segment(list, from, coords[i], width);
          if (i < coords.length - 1 && width > 1.5) disc(list, coords[i], width / 2);
          continue;
        }
        const u = scale(d, 1 / length);
        for (let s = 0; s < length; s += 11) {
          segment(list, add(from, scale(u, s)), add(from, scale(u, Math.min(length, s + 6))), width);
        }
      }
    };
    for (const shape of drawing.shapes) {
      if (shape.kind === "stroke") {
        if (shape.glow) polyline(bucket(shape.layer - 0.5, shape.color, 0.2), shape.coords, shape.width + 7, false);
        polyline(bucket(shape.layer, shape.color, shape.opacity ?? 1), shape.coords, shape.width, shape.dashed);
      } else if (shape.kind === "fill") {
        const list = bucket(shape.layer, shape.color, shape.opacity ?? 1);
        const n = shape.coords.length;
        const center = scale(shape.coords.reduce((sum, p) => add(sum, p), [0, 0]), 1 / n);
        for (let i = 0; i < n; i++) triangle(list, center, shape.coords[i], shape.coords[(i + 1) % n]);
      } else {
        if (shape.halo) disc(bucket(shape.layer - 0.5, shape.color, 0.22), shape.at, shape.r * 2.4);
        if (shape.hollow) {
          disc(bucket(shape.layer, "plot", 1), shape.at, shape.r);
          disc(bucket(shape.layer + 0.1, shape.color, 1), shape.at, shape.r + 1.1, shape.r - 1.1);
        } else {
          disc(bucket(shape.layer, "plot", 1), shape.at, shape.r + 1.3);
          disc(bucket(shape.layer + 0.1, shape.color, 1), shape.at, shape.r);
        }
      }
    }
    [...buckets.values()].sort((a, b) => a.layer - b.layer).forEach((entry, order) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(entry.positions, 3));
      const mesh = new THREE.Mesh(geometry, flatMaterial(entry.color, entry.opacity));
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      flatGroup.add(mesh);
    });
  }

  return {
    draw(drawing, width, height, reduced) {
      const density = Math.min(window.devicePixelRatio || 1, reduced ? 1.25 : 2);
      const next = width + ":" + height + ":" + density;
      if (next !== dimensions) {
        renderer.setDrawingBufferSize(width, height, density);
        dimensions = next;
      }
      const changed = drawing !== lastDrawing;
      lastDrawing = drawing;
      const unit = Math.max(560 / width, 360 / height);
      if (drawing.space) {
        space.draw(renderer, drawing, width * unit / 2, height * unit / 2, changed);
        return;
      }
      if (changed) buildFlat(drawing);
      flatCamera.left = -width * unit / 2;
      flatCamera.right = width * unit / 2;
      flatCamera.top = height * unit / 2;
      flatCamera.bottom = -height * unit / 2;
      flatCamera.updateProjectionMatrix();
      renderer.render(flatScene, flatCamera);
    },
    isLost: () => renderer.getContext().isContextLost(),
    invalidate() { lastDrawing = null; },
    dispose() {
      clearFlat();
      space.dispose();
      for (const material of materials.values()) material.dispose();
      renderer.dispose();
    }
  };
}

// BA-SPACE-START (3D station: shared projection, SVG fallback and WebGL scene)
// The SVG labels and the WebGL camera use the same right/up vectors, so they line up.
function baBuildSpace(plan) {
  const [W, H] = BA_SIZE, [CX, CY] = BA_CENTER;
  const yaw = plan.yaw * Math.PI / 180, tilt = plan.tilt * Math.PI / 180;
  const toward = [Math.cos(tilt) * Math.cos(yaw), Math.cos(tilt) * Math.sin(yaw), Math.sin(tilt)];
  const up = [-Math.sin(tilt) * Math.cos(yaw), -Math.sin(tilt) * Math.sin(yaw), Math.cos(tilt)];
  const right = baCross3(up, toward);
  const reach = plan.vectors.map(entry => entry.v);
  if (plan.box) {
    const [a, b, c] = plan.box;
    reach.push(baAdd3(a, b), baAdd3(a, c), baAdd3(b, c), baAdd3(baAdd3(a, b), c));
  }
  if (plan.target) reach.push(plan.target);
  const ext = Math.max(3, ...reach.map(v => Math.hypot(...v)));
  const k = 160 / ext;
  const gridStep = ext > 8 ? 2 : 1;
  const gridN = Math.ceil(ext * 0.8 / gridStep) * gridStep;
  const shapes = [], names = [];
  const project = p => [CX + k * baInner(p, right), CY - k * baInner(p, up)];
  const stroke = (layer, points, color, width, options = {}) =>
    shapes.push({ kind: "stroke", layer, coords: points.map(project), color, width, ...options });
  const label = (text, [x, y], color, small = false) => {
    const width = text.length * (small ? 7 : 8.6);
    const left = Math.max(4, Math.min(W - width - 4, x + 8));
    let top = Math.max(16, Math.min(H - 6, y - 9));
    for (let tries = 0; tries < 4; tries++) {
      if (!names.some(n => Math.abs(n.y - top) < 15 && left < n.x + n.width && n.x < left + width)) break;
      top = top + 17 > H - 6 ? top - 34 : top + 17;
    }
    names.push({ text, x: left, y: top, color, small, width });
  };
  const arrow = (from, to, color, layer, width, size) => {
    const start = project(from), tip = project(to);
    const d = subtract(tip, start), length = Math.hypot(...d);
    if (length < 4) {
      shapes.push({ kind: "dot", layer, at: tip, r: 4.5, color });
      return;
    }
    const u = scale(d, 1 / length), n = [-u[1], u[0]];
    const headLength = Math.min(size, length * 0.5);
    const base = subtract(tip, scale(u, headLength));
    shapes.push({ kind: "stroke", layer, coords: [start, add(base, scale(u, 2))], color, width, glow: layer > 5 });
    shapes.push({ kind: "fill", layer, coords: [tip, add(base, scale(n, headLength * 0.45)), subtract(base, scale(n, headLength * 0.45))], color, opacity: 1 });
  };

  for (let i = -gridN; i <= gridN; i += gridStep) {
    stroke(0, [[i, -gridN, 0], [i, gridN, 0]], "grid", 1);
    stroke(0, [[-gridN, i, 0], [gridN, i, 0]], "grid", 1);
  }
  BA_XYZ.forEach((name, axis) => {
    const end = [0, 0, 0], start = [0, 0, 0];
    end[axis] = ext * 1.15;
    start[axis] = -ext * 1.05;
    arrow(start, end, "axis", 4, 1.3, 9);
    label(name, project(end), "axis", true);
  });

  let plane = null;
  if (plan.plane) {
    const unit = v => baScale3(v, 1 / Math.hypot(...v));
    const e1 = unit(plan.plane.along[0]);
    const e2 = unit(baCross3(plan.plane.normal, e1));
    const half = ext * 0.95;
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([s, t]) => baAdd3(baScale3(e1, s * half), baScale3(e2, t * half)));
    plane = { normal: plan.plane.normal, corners };
    shapes.push({ kind: "fill", layer: 2, coords: corners.map(project), color: "bad", opacity: 0.2 });
    stroke(2, [...corners, corners[0]], "bad", 1.3);
  }
  if (plan.box) {
    const [a, b, c] = plan.box;
    const o = [0, 0, 0], ab = baAdd3(a, b), ac = baAdd3(a, c), bc = baAdd3(b, c), abc = baAdd3(ab, c);
    for (const [p, q] of [[o, a], [o, b], [o, c], [a, ab], [a, ac], [b, ab], [b, bc], [c, ac], [c, bc], [ab, abc], [ac, abc], [bc, abc]]) {
      stroke(3, [p, q], "lattice", 1.3, { dashed: true });
    }
  }
  if (plan.target) {
    const foot = [plan.target[0], plan.target[1], 0];
    stroke(6, [plan.target, foot], "target", 1.6, { dashed: true });
    shapes.push({ kind: "dot", layer: 8, at: project(plan.target), r: 5, color: "target" });
    label("target", project(plan.target), "target");
  }
  for (const entry of plan.vectors) {
    arrow([0, 0, 0], entry.v, entry.color, 7, 3, 13);
    label(baIsZero(entry.v) ? entry.label + " = 0" : entry.label, project(entry.v), entry.color);
  }
  shapes.push({ kind: "dot", layer: 8, at: project([0, 0, 0]), r: 3, color: "ink" });
  return {
    shapes, names,
    space: { vectors: plan.vectors, plane, box: plan.box, target: plan.target, k, ext, right, up, toward, gridN, gridStep }
  };
}

function baCreateSpaceScene(THREE, colors) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 1, 800);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5), sun, sun.target);
  const world = new THREE.Group();
  scene.add(world);
  const owned = [];
  let signature = "";
  const tint = name => new THREE.Color(colors[name]);
  const v3 = ([x, y, z]) => new THREE.Vector3(x, y, z);
  const own = item => { owned.push(item); return item; };

  function clear() {
    world.clear();
    owned.splice(0).forEach(item => item.dispose());
  }

  function solid(name, basic = false) {
    return own(basic
      ? new THREE.MeshBasicMaterial({ color: tint(name) })
      : new THREE.MeshLambertMaterial({ color: tint(name), emissive: tint(name).multiplyScalar(0.3) }));
  }

  function arrow(vector, name, radius, headLength, headRadius, basic = false, from = [0, 0, 0]) {
    const length = Math.hypot(...vector);
    const material = solid(name, basic);
    if (length < 1e-9) {
      const dot = new THREE.Mesh(own(new THREE.SphereGeometry(headRadius, 16, 12)), material);
      dot.position.copy(v3(from));
      world.add(dot);
      return;
    }
    const head = Math.min(headLength, length * 0.45);
    const shaft = new THREE.Mesh(own(new THREE.CylinderGeometry(radius, radius, length - head, 16)), material);
    shaft.position.y = (length - head) / 2;
    const tip = new THREE.Mesh(own(new THREE.ConeGeometry(headRadius, head, 20)), material);
    tip.position.y = length - head / 2;
    const holder = new THREE.Group();
    holder.add(shaft, tip);
    holder.position.copy(v3(from));
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3(vector).normalize());
    world.add(holder);
  }

  function segments(points, name, opacity = 1) {
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
    const material = own(new THREE.LineBasicMaterial({ color: tint(name), transparent: opacity < 1, opacity }));
    world.add(new THREE.LineSegments(geometry, material));
  }

  function rebuild(space) {
    clear();
    const px = 1 / space.k;
    const { gridN: n, gridStep: g, ext } = space;
    const grid = [];
    for (let i = -n; i <= n; i += g) grid.push([i, -n, 0], [i, n, 0], [-n, i, 0], [n, i, 0]);
    segments(grid, "grid", 0.9);
    for (let axis = 0; axis < 3; axis++) {
      const start = [0, 0, 0], direction = [0, 0, 0];
      start[axis] = -ext * 1.05;
      direction[axis] = ext * 2.2;
      arrow(direction, "axis", 0.7 * px, 10 * px, 4 * px, true, start);
    }
    if (space.plane) {
      const [a, b, c, d] = space.plane.corners;
      const geometry = own(new THREE.BufferGeometry());
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
      const sheet = new THREE.Mesh(geometry, own(new THREE.MeshBasicMaterial({
        color: tint("bad"), transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false
      })));
      sheet.renderOrder = 2;
      world.add(sheet);
      segments([a, b, b, c, c, d, d, a], "bad");
      const lines = [];
      const span = Math.hypot(...baSubtract3(a, b)) / 2;
      const steps = Math.max(2, Math.round(span / g));
      for (let i = 1; i < 2 * steps; i++) {
        const t = i / (2 * steps);
        lines.push(baLerp3(a, d, t), baLerp3(b, c, t), baLerp3(a, b, t), baLerp3(d, c, t));
      }
      segments(lines, "bad", 0.35);
    }
    if (space.box) {
      const geometry = own(new THREE.BoxGeometry(1, 1, 1));
      geometry.translate(0.5, 0.5, 0.5);
      geometry.applyMatrix4(new THREE.Matrix4().makeBasis(...space.box.map(v3)));
      const cell = new THREE.Mesh(geometry, own(new THREE.MeshBasicMaterial({
        color: tint("second"), transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false
      })));
      cell.renderOrder = 2;
      world.add(cell);
      world.add(new THREE.LineSegments(own(new THREE.EdgesGeometry(geometry)), own(new THREE.LineBasicMaterial({ color: tint("lattice") }))));
    }
    for (const entry of space.vectors) arrow(entry.v, entry.color, 2.6 * px, 15 * px, 6.5 * px);
    if (space.target) {
      const ball = new THREE.Mesh(own(new THREE.SphereGeometry(5.5 * px, 20, 14)), solid("target"));
      ball.position.copy(v3(space.target));
      world.add(ball);
      segments([space.target, [space.target[0], space.target[1], 0]], "target", 0.8);
    }
    const origin = new THREE.Mesh(own(new THREE.SphereGeometry(3 * px, 12, 10)), solid("ink", true));
    world.add(origin);
  }

  return {
    draw(renderer, drawing, halfWidth, halfHeight) {
      const { space } = drawing;
      const next = JSON.stringify([space.vectors, space.plane, space.box, space.target, space.k, space.gridN]);
      if (next !== signature) {
        rebuild(space);
        signature = next;
      }
      camera.left = -halfWidth / space.k;
      camera.right = halfWidth / space.k;
      camera.top = halfHeight / space.k;
      camera.bottom = -halfHeight / space.k;
      camera.position.copy(v3(baScale3(space.toward, 200)));
      camera.up.copy(v3(space.up));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      sun.position.copy(v3(baAdd3(baScale3(space.toward, 100), baAdd3(baScale3(space.up, 80), baScale3(space.right, -60)))));
      renderer.render(scene, camera);
    },
    dispose() {
      clear();
      signature = "";
    }
  };
}
// BA-SPACE-END

// All declarations are initialized before the page starts.
const lesson = document.querySelector(".site-main.basis-lesson");
if (lesson) {
  initializeBasisLab(lesson);
  initializeBasisArcade(lesson);
}