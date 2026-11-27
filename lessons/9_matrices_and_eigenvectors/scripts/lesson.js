const SVG_NS = "http://www.w3.org/2000/svg";
const ZERO = [0, 0];
const PRESETS = {
  opening: [2, 1, 1, 2],
  stretch: [3, 0, 0, 1],
  reflection: [1, 0, 0, -1],
  shear: [1, 1, 0, 1],
  rotation: [0, -1, 1, 0],
  projection: [1, 0, 0, 0],
  scalar: [2, 0, 0, 2],
  zero: [0, 0, 0, 0]
};
const VECTORS = {
  e1: [1, 0],
  e2: [0, 1],
  plus: [1, 1],
  minus: [1, -1],
  zero: [0, 0]
};
const NUMBER = new Intl.NumberFormat("en", {
  maximumFractionDigits: 4,
  useGrouping: false
});

function format(value) {
  return NUMBER.format(Math.abs(value) < 0.00005 ? 0 : value).replace("-", "−");
}

function pair([x, y]) {
  return `(${format(x)}, ${format(y)})`;
}

function samePair([x, y], [u, v]) {
  return x === u && y === v;
}

function multiply([a, b, c, d], [x, y]) {
  return [a * x + b * y, c * x + d * y];
}

function scale([x, y], factor) {
  return [x * factor, y * factor];
}

function add([x, y], [u, v]) {
  return [x + u, y + v];
}

function difference([x, y], [u, v]) {
  return [x - u, y - v];
}

function eigenline([a, b, c, d], value) {
  const first = [a - value, b];
  const second = [c, d - value];
  const row = Math.hypot(...first) >= Math.hypot(...second) ? first : second;
  const length = Math.hypot(...row);
  const [x, y] = [-row[1] / length, row[0] / length];
  return { value, direction: x < 0 || (x === 0 && y < 0) ? [-x, -y] : [x, y] };
}

function getSpectrum(matrix) {
  const [a, b, c, d] = matrix;
  const trace = a + d;
  // Half-unit entries make the sign and zeros of this discriminant exact.
  const discriminant = (a - d) ** 2 + 4 * b * c;
  if (discriminant < 0) return { kind: "complex", values: [], lines: [] };
  if (a === d && b === 0 && c === 0) {
    return { kind: "scalar", values: [a], lines: [] };
  }
  const root = Math.sqrt(discriminant);
  const values = root === 0 ? [trace / 2] : [(trace + root) / 2, (trace - root) / 2];
  return {
    kind: root === 0 ? "repeated" : "distinct",
    values,
    lines: values.map(value => eigenline(matrix, value))
  };
}

function selectedVector(matrix, input, output) {
  if (samePair(input, ZERO)) return { kind: "zero-input" };
  if (samePair(output, ZERO)) return { kind: "zero", value: 0 };

  const [x, y] = input;
  const [u, v] = output;
  const value = (x * u + y * v) / (x * x + y * y);
  const residual = Math.hypot(...difference(output, scale(input, value)));
  const tolerance = 64 * Number.EPSILON * Math.hypot(...matrix) * Math.hypot(x, y);
  if (residual > tolerance) return { kind: "off-line" };
  return { kind: value > 0 ? "same" : "opposite", value };
}

function analyze(matrix, input) {
  const [a, b, c, d] = matrix;
  const output = multiply(matrix, input);
  const rank = a * d - b * c !== 0 ? 2 : matrix.every(value => value === 0) ? 0 : 1;
  const column = samePair(input, VECTORS.e1) ? 1 : samePair(input, VECTORS.e2) ? 2 : 0;
  return {
    output,
    rank,
    column,
    selected: selectedVector(matrix, input, output),
    spectrum: getSpectrum(matrix)
  };
}

function selectedMessage({ kind, value }) {
  switch (kind) {
    case "zero-input":
      return "The zero input has no direction. It is excluded from the eigenvector test.";
    case "off-line":
      return "The output leaves the input’s line. This input is not an eigenvector.";
    case "zero":
      return "The nonzero input maps to the origin, so it is an eigenvector with λ = 0. The zero output has no direction.";
    case "opposite":
      return `The output points the opposite way along the same line. This input is an eigenvector with λ = ${format(value)}.`;
    default:
      return `The output points the same way along the same line. This input is an eigenvector with λ = ${format(value)}.`;
  }
}

function spectrumMessage({ kind }) {
  switch (kind) {
    case "complex":
      return "This matrix has no real eigenvalues and no real eigenlines.";
    case "scalar":
      return "Every nonzero input is an eigenvector with the same eigenvalue. There are no special lines to single out.";
    case "repeated":
      return "The eigenvalue is repeated in the characteristic equation. Its eigenvectors lie on one line.";
    default:
      return "There are two distinct real eigenvalues and two eigenlines. The green guides are labeled with their eigenvalues.";
  }
}

function buildDiagram(config, matrix, input, result, revealed) {
  const { origin, radius, gridRadius, minExtent } = config;
  const { output, rank, column, spectrum } = result;
  const [ox, oy] = origin;
  const g = gridRadius;
  const sourceCorners = [[-g, -g], [g, -g], [g, g], [-g, g]];
  const imageCorners = sourceCorners.map(point => multiply(matrix, point));
  const extent = Math.max(minExtent, Math.ceil(Math.max(...[...imageCorners, input, output].flat().map(Math.abs))));
  const unit = radius / extent;
  const project = ([x, y]) => [ox + x * unit, oy - y * unit];
  const [left, top] = [ox - radius, oy - radius];
  const [right, bottom] = [ox + radius, oy + radius];
  const reference = [];
  const image = [];
  const axes = [];
  const guides = [];
  const arrows = [];
  const labels = [];
  const ticks = [];

  const line = (group, points, color, width, dash = null) =>
    group.push({ points, color, width, dash });
  const polygon = (group, points, color) => group.push({ points, color, filled: true });

  function loop(group, points, color, width, dash) {
    line(group, [...points, points[0]], color, width, dash);
  }

  function circle(center, r, color, width = 0) {
    const points = Array.from({ length: 20 }, (_, index) => {
      const angle = index * Math.PI / 10;
      return add(center, [r * Math.cos(angle), r * Math.sin(angle)]);
    });
    if (width) loop(arrows, points, color, width);
    else polygon(arrows, points, color);
  }

  function label(text, point, color) {
    labels.push({ text, point, color });
  }

  const gridStep = Math.max(1, Math.ceil(extent / 7));
  for (let tick = -Math.floor(extent / gridStep) * gridStep; tick <= extent; tick += gridStep) {
    if (tick === 0) continue;
    line(reference, [project([tick, -extent]), project([tick, extent])], "reference", 1);
    line(reference, [project([-extent, tick]), project([extent, tick])], "reference", 1);
    if (tick % (2 * gridStep) === 0 && Math.abs(tick) < extent) {
      ticks.push({ text: format(tick), at: [project([tick, 0])[0], oy + 18], anchor: "middle" });
      ticks.push({ text: format(tick), at: [ox - 10, project([0, tick])[1] + 4], anchor: "end" });
    }
  }
  loop(reference, sourceCorners.map(project), "axis", 1);

  if (rank === 2) {
    loop(image, imageCorners.map(project), "grid", 2, [7, 4]);
    for (let k = -g + 1; k < g; k++) {
      line(image, [[k, -g], [k, g]].map(point => project(multiply(matrix, point))), "grid", 1.3, [7, 4]);
      line(image, [[-g, k], [g, k]].map(point => project(multiply(matrix, point))), "grid", 1.3, [7, 4]);
    }
  } else if (rank === 1) {
    const [a, b, c, d] = matrix;
    const axis = Math.abs(a) + Math.abs(b) >= Math.abs(c) + Math.abs(d) ? 0 : 1;
    const ordered = [...imageCorners].sort((a, b) => a[axis] - b[axis]);
    line(image, [project(ordered[0]), project(ordered.at(-1))], "grid", 6, [7, 4]);
  } else {
    polygon(image, [add(origin, [-7, -7]), add(origin, [7, -7]),
      add(origin, [7, 7]), add(origin, [-7, 7])], "grid");
  }

  line(axes, [[left - 5, oy], [right + 8, oy]], "axis", 1.5);
  line(axes, [[right + 1, oy - 5], [right + 8, oy], [right + 1, oy + 5]], "axis", 1.5);
  line(axes, [[ox, bottom + 5], [ox, top - 8]], "axis", 1.5);
  line(axes, [[ox - 5, top - 1], [ox, top - 8], [ox + 5, top - 1]], "axis", 1.5);
  ticks.push(
    { text: "x", at: [right + 13, oy + 5] },
    { text: "y", at: [ox + 10, top - 8] },
    { text: "0", at: [ox - 15, oy + 19] }
  );

  if (revealed) {
    spectrum.lines.forEach(({ value, direction }, index) => {
      const end = scale(direction, extent / Math.max(...direction.map(Math.abs)));
      line(guides, [project(scale(end, -1)), project(end)], "eigen", 2.5, [2, 6]);
      label(`λ = ${format(value)}`, project(scale(end, index === 0 ? 0.72 : -0.72)), "eigen");
    });
  }

  function drawArrow(vector, color) {
    const end = project(vector);
    const delta = difference(end, origin);
    const length = Math.hypot(...delta);
    const isOutput = color === "output";
    if (length === 0) {
      circle(origin, isOutput ? 3.2 : 5.5, color, isOutput ? 0 : 2);
      return;
    }
    const heading = scale(delta, 1 / length);
    const depth = Math.min(isOutput ? 10 : 14, length * 0.75);
    const base = difference(end, scale(heading, depth));
    const wing = scale([-heading[1], heading[0]], depth * 0.47);
    const head = [add(base, wing), end, difference(base, wing)];
    line(arrows, [origin, end], color, isOutput ? 3 : 4.5, isOutput ? [8, 5] : null);
    if (isOutput) polygon(arrows, head, color);
    else line(arrows, head, color, 2.7);
  }

  const inputEnd = project(input);
  const outputEnd = project(output);
  drawArrow(input, "input");
  drawArrow(output, "output");
  if (column) {
    circle(outputEnd, 8.5, "column", 1.5);
    label(`Column ${column}`, outputEnd, "column");
  }
  label(`Av ${pair(output)}`, outputEnd, "output");
  label(`v ${pair(input)}`, inputEnd, "input");

  return { reference, image, axes, guides, arrows, ticks, labels };
}

function svgNode(name, attributes, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawSvg(groups, diagram, colors, size) {
  const layerNames = ["reference", "image", "axes", "guides", "arrows"];
  for (const name of layerNames) {
    const shapes = diagram[name].map(({ points, color, filled, width, dash }) => {
      const coordinates = points.map(point => point.join(",")).join(" ");
      if (filled) return svgNode("polygon", { points: coordinates, fill: colors[color] });
      const attributes = {
        points: coordinates,
        fill: "none",
        stroke: colors[color],
        "stroke-width": width,
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      };
      if (dash) attributes["stroke-dasharray"] = dash.join(" ");
      return svgNode("polyline", attributes);
    });
    groups[name].replaceChildren(...shapes);
  }

  groups.ticks.replaceChildren(...diagram.ticks.map(({ text, at, anchor }) =>
    svgNode("text", { x: at[0], y: at[1], "text-anchor": anchor ?? "start" }, text)
  ));

  const occupied = [];
  const order = ["output", "input", "column", "eigen"];
  const labels = [...diagram.labels].sort((a, b) => order.indexOf(a.color) - order.indexOf(b.color));
  groups.labels.replaceChildren(...labels.map(({ text, point: [x, y], color }) => {
    const width = text.length * 9.2;
    const height = 18;
    const choices = [
      [x + 10, y - 21], [x + 10, y + 8], [x - width - 10, y - 21],
      [x - width - 10, y + 8], [x + 10, y - 43], [x + 10, y + 30],
      [x - width - 10, y - 43], [x - width - 10, y + 30]
    ].map(([left, top]) => [
      Math.max(4, Math.min(size - width - 4, left)),
      Math.max(4, Math.min(size - height - 4, top))
    ]);
    const [left, top] = choices.find(([px, py]) => occupied.every(box =>
      px + width + 3 <= box.x || box.x + box.width + 3 <= px ||
      py + height + 3 <= box.y || box.y + box.height + 3 <= py
    )) ?? choices[0];
    occupied.push({ x: left, y: top, width, height });
    return svgNode("text", { class: `matrix-${color}-color`, x: left, y: top + 14 }, text);
  }));
}

function appendTriangles(shape, size, color, positions, colors) {
  const { points, width, dash, filled } = shape;

  function vertex([x, y]) {
    positions.push(x, size - y, 0);
    colors.push(color.r, color.g, color.b);
  }

  function triangle(a, b, c) {
    vertex(a);
    vertex(b);
    vertex(c);
  }

  if (filled) {
    for (let i = 1; i < points.length - 1; i++) triangle(points[0], points[i], points[i + 1]);
    return;
  }

  let distanceAlongPath = 0;
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const delta = difference(points[i], start);
    const length = Math.hypot(...delta);
    if (length < 1e-9) continue;
    const direction = scale(delta, 1 / length);
    const normal = scale([-direction[1], direction[0]], width / 2);
    const [on, off] = dash ?? [length, 0];
    const period = on + off;
    const offset = dash ? -(distanceAlongPath % period) : 0;
    for (let cursor = offset; cursor < length; cursor += period) {
      const from = Math.max(0, cursor);
      const to = Math.min(length, cursor + on);
      if (to <= from) continue;
      const first = add(start, scale(direction, from));
      const last = add(start, scale(direction, to));
      const a = add(first, normal);
      const b = difference(first, normal);
      const c = add(last, normal);
      const d = difference(last, normal);
      triangle(a, b, c);
      triangle(c, b, d);
    }
    distanceAlongPath += length;
  }
}

function createRenderer(THREE, canvas, size, colors) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(colors.plot);
  const camera = new THREE.OrthographicCamera(0, size, size, 0, 0.1, 10);
  camera.position.z = 1;
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const palette = Object.fromEntries(
    Object.entries(colors).map(([name, color]) => [name, new THREE.Color(color)])
  );
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let previous;
  let bufferSize;

  return {
    draw(diagram, width, height) {
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const key = `${width}:${height}:${density}`;
      if (bufferSize !== key) {
        renderer.setDrawingBufferSize(width, height, density);
        const xPad = (Math.max(1, width / height) - 1) * size / 2;
        const yPad = (Math.max(1, height / width) - 1) * size / 2;
        camera.left = -xPad;
        camera.right = size + xPad;
        camera.bottom = -yPad;
        camera.top = size + yPad;
        camera.updateProjectionMatrix();
        bufferSize = key;
      }
      if (diagram !== previous) {
        const positions = [];
        const vertexColors = [];
        const shapes = [...diagram.reference, ...diagram.image, ...diagram.axes, ...diagram.guides, ...diagram.arrows];
        for (const shape of shapes) {
          appendTriangles(shape, size, palette[shape.color], positions, vertexColors);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 3));
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        previous = diagram;
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

function enhanceGraphics(viewport, canvas, size, colors, getDiagram, listen, lifetime) {
  let graphics = null;
  let frame = null;
  let lost = false;
  let active = true;

  function fallback() {
    viewport.dataset.renderer = "svg";
    canvas.hidden = true;
  }

  function cancelDraw() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function requestDraw() {
    if (!graphics || !active || lost || document.hidden || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!graphics || !active || lost || document.hidden) return;
      const { clientWidth, clientHeight } = viewport;
      if (clientWidth === 0 || clientHeight === 0) {
        fallback();
        return;
      }
      try {
        graphics.draw(getDiagram(), clientWidth, clientHeight);
        if (graphics.isLost()) {
          fallback();
          return;
        }
        canvas.hidden = false;
        viewport.dataset.renderer = "webgl";
      } catch {
        fallback();
        if (!graphics.isLost()) {
          graphics.dispose();
          graphics = null;
        }
      }
    });
  }

  listen(canvas, "webglcontextlost", event => {
    event.preventDefault();
    lost = true;
    cancelDraw();
    fallback();
  });
  listen(canvas, "webglcontextrestored", () => {
    lost = false;
    requestDraw();
  });
  listen(document, "visibilitychange", () => {
    if (document.hidden) cancelDraw();
    else requestDraw();
  });
  listen(window, "resize", requestDraw);
  listen(window, "pageshow", () => {
    active = true;
    requestDraw();
  });
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(requestDraw) : null;
  observer?.observe(viewport);
  listen(window, "pagehide", event => {
    active = false;
    cancelDraw();
    if (event.persisted) return;
    lifetime.abort();
    observer?.disconnect();
    graphics?.dispose();
    graphics = null;
  });

  import("../vendor/three.module.js").then(THREE => {
    if (lifetime.signal.aborted) return;
    graphics = createRenderer(THREE, canvas, size, colors);
    requestDraw();
  }).catch(fallback);

  return requestDraw;
}

function challengeResult(question) {
  const input = [0, 2];
  const preset = question === "reverse" ? "reflection" : question;
  const example = analyze(PRESETS[preset], input);

  switch (question) {
    case "reverse":
      return {
        answer: example.selected.value < 0 ? "negative" : "positive",
        right: `Correct. ${pair(example.output)} is ${format(example.selected.value)} times ${pair(input)}. A negative eigenvalue reverses the arrow along its line.`,
        retry: "The input and output have equal length. What sign must the multiplier have to make the arrow point the other way?"
      };
    case "projection":
      return {
        answer: example.selected.kind,
        right: `Correct. The input is nonzero, and multiplying it by ${format(example.selected.value)} gives the zero output. The eigenvector equation still holds.`,
        retry: "Apply the nonzero condition to the input. Find the multiplier that turns this input into the zero output."
      };
    default: {
      const axis = analyze(PRESETS.shear, VECTORS.e1);
      return {
        answer: axis.selected.kind === "same" && example.selected.kind === "off-line" ? "horizontal" : "vertical",
        right: `Correct. When y = 0, the shear leaves the input unchanged, so λ = ${format(axis.selected.value)}. Any nonzero y adds a horizontal shift, leaving only y = 0 as an eigenline.`,
        retry: "Try both unit vectors in the shear preset. Which image stays on its original line when x changes by y?"
      };
    }
  }
}

function wireChallenge(find, listen) {
  const form = find("challenge-form");
  const next = find("challenge-next");
  const restart = find("challenge-restart");
  const feedback = find("challenge-feedback");
  const panels = [...form.querySelectorAll("[data-matrix-question]")];
  let index = 0;

  function clearFeedback() {
    next.hidden = true;
    restart.hidden = true;
    feedback.textContent = "";
  }

  function showQuestion() {
    panels.forEach((panel, position) => { panel.hidden = position !== index; });
    clearFeedback();
    panels[index].querySelector("h4").focus();
  }

  listen(form, "submit", event => {
    event.preventDefault();
    const panel = panels[index];
    const choice = panel.querySelector("input:checked");
    if (!choice) {
      feedback.textContent = "Choose an answer first.";
      panel.querySelector("input").focus();
      return;
    }
    const { answer, right, retry } = challengeResult(panel.dataset.matrixQuestion);
    const correct = choice.value === answer;
    feedback.textContent = correct ? right : retry;
    next.hidden = !correct || index === panels.length - 1;
    restart.hidden = !correct || index < panels.length - 1;
  });
  listen(form, "change", clearFeedback);
  listen(next, "click", () => {
    if (next.hidden) return;
    index++;
    showQuestion();
  });
  listen(restart, "click", () => {
    form.reset();
    index = 0;
    showQuestion();
  });
}

function initializeReactor(root) {
  const find = id => root.querySelector(`#matrix-${id}`);
  const controls = find("controls");
  const entryGroup = find("entries");
  const matrixInputs = ["a", "b", "c", "d"].map(find);
  const vectorInputs = ["x", "y"].map(find);
  const quickInputs = [...controls.querySelectorAll("[data-matrix-vector]")];
  const preset = find("preset");
  const prediction = find("prediction");
  const guess = find("guess");
  const feedback = find("prediction-feedback");
  const reveal = find("reveal");
  const eigenResults = find("eigen-results");
  const status = find("status");

  const svg = find("svg");
  const size = svg.viewBox.baseVal.width;
  const config = {
    origin: [Number(svg.dataset.originX), Number(svg.dataset.originY)],
    radius: Number(svg.dataset.plotRadius),
    minExtent: Number(svg.dataset.minExtent),
    gridRadius: Number(svg.dataset.gridRadius)
  };
  const groups = {
    reference: find("svg-reference"),
    image: find("svg-grid"),
    axes: find("svg-axes"),
    guides: find("svg-eigenlines"),
    arrows: find("svg-arrows"),
    ticks: find("svg-ticks"),
    labels: find("svg-labels")
  };
  const css = getComputedStyle(root);
  const colors = Object.fromEntries(
    ["plot", "reference", "axis", "input", "output", "eigen", "grid", "column"]
      .map(name => [name, css.getPropertyValue(`--matrix-${name}`).trim()])
  );

  const lifetime = new AbortController();
  const listen = (element, event, handler) => element.addEventListener(event, handler, { signal: lifetime.signal });
  let matrix = [...PRESETS.opening];
  let input = [...VECTORS.e1];
  let result;
  let diagram;
  let revealed = false;
  let requestDraw = () => {};

  function equation(a, b, x, y, total) {
    const factor = value => value < 0 ? `(${format(value)})` : format(value);
    return `${factor(a)} × ${factor(x)} + ${factor(b)} × ${factor(y)} = ${format(total)}`;
  }

  function render() {
    result = analyze(matrix, input);
    const { output, rank, column, spectrum, selected } = result;
    diagram = buildDiagram(config, matrix, input, result, revealed);
    drawSvg(groups, diagram, colors, size);

    const [a, b, c, d] = matrix;
    const [x, y] = input;
    const [u, v] = output;
    find("input-readout").textContent = pair(input);
    find("output-readout").textContent = pair(output);
    find("equation-x").textContent = equation(a, b, x, y, u);
    find("equation-y").textContent = equation(c, d, x, y, v);
    entryGroup.dataset.activeColumn = String(column);
    find("column-note").textContent = column
      ? `With v = ${column === 1 ? "e₁" : "e₂"}, the output is column ${column}, ${pair(output)}.`
      : "The output combines the two columns using x and y as weights.";
    for (const button of quickInputs) {
      button.setAttribute("aria-pressed", String(samePair(input, VECTORS[button.dataset.matrixVector])));
    }

    const gridMessages = [
      "Rank 0. The violet square marks the point where the entire grid collapses.",
      "Rank 1. The violet dashed segment is the grid patch collapsed onto a line.",
      "Rank 2. The transformed patch covers an area inside the violet outline."
    ];
    find("grid-note").textContent = gridMessages[rank];
    reveal.setAttribute("aria-expanded", String(revealed));
    reveal.textContent = revealed ? "Hide eigenlines" : "Reveal eigenlines";
    eigenResults.hidden = !revealed;
    find("spectrum").textContent = spectrum.values.length ? spectrum.values.map(format).join(", ") : "None";
    find("selected-eigen").textContent = selectedMessage(selected);
    find("eigen-note").textContent = spectrumMessage(spectrum);

    const vectorText = `Input ${pair(input)}. Output ${pair(output)}.`;
    const eigenText = revealed ? ` ${selectedMessage(selected)} ${spectrumMessage(spectrum)}` : "";
    find("svg-desc").textContent = `${vectorText} ${gridMessages[rank]}${eigenText}`;
    status.textContent = revealed ? `${vectorText}${eigenText}` : vectorText;
    requestDraw();
  }

  function sync(inputs, values) {
    inputs.forEach((element, index) => {
      element.value = values[index];
      element.removeAttribute("aria-invalid");
    });
  }

  function clearPrediction() {
    guess.value = "";
    feedback.textContent = "";
  }

  function editComponents(inputs, values, matrixEntry) {
    inputs.forEach((element, index) => {
      listen(element, "input", () => {
        if (!element.validity.valid) {
          element.setAttribute("aria-invalid", "true");
          status.textContent = "Enter a value from −3 to 3 in half-unit increments. The display uses the last valid value.";
          return;
        }
        element.removeAttribute("aria-invalid");
        if (values()[index] === element.valueAsNumber) {
          render();
          return;
        }
        values()[index] = element.valueAsNumber;
        if (matrixEntry) {
          preset.value = "custom";
          revealed = false;
        }
        clearPrediction();
        render();
      });
      listen(element, "blur", () => {
        if (element.validity.valid) return;
        element.value = values()[index];
        element.removeAttribute("aria-invalid");
        render();
      });
    });
  }

  editComponents(matrixInputs, () => matrix, true);
  editComponents(vectorInputs, () => input, false);

  listen(preset, "change", () => {
    if (!Object.hasOwn(PRESETS, preset.value)) return;
    matrix = [...PRESETS[preset.value]];
    sync(matrixInputs, matrix);
    revealed = false;
    clearPrediction();
    render();
  });
  for (const button of quickInputs) {
    listen(button, "click", () => {
      input = [...VECTORS[button.dataset.matrixVector]];
      sync(vectorInputs, input);
      clearPrediction();
      render();
    });
  }
  listen(find("reset"), "click", () => {
    matrix = [...PRESETS.opening];
    input = [...VECTORS.e1];
    preset.value = "opening";
    sync(matrixInputs, matrix);
    sync(vectorInputs, input);
    guess.value = "";
    revealed = false;
    render();
    status.textContent = "Lab reset. Input (1, 0). Output (2, 1).";
    feedback.textContent = "";
  });
  listen(guess, "change", () => { feedback.textContent = ""; });
  listen(prediction, "submit", event => {
    event.preventDefault();
    if (!prediction.reportValidity()) return;
    const lead = guess.value === result.selected.kind ? "Correct." : "Compare the input and output again.";
    feedback.textContent = `${lead} ${selectedMessage(result.selected)}`;
  });
  listen(reveal, "click", () => {
    revealed = !revealed;
    render();
  });

  // Build the SVG and enable the controls before the optional Three.js import.
  wireChallenge(find, listen);
  preset.value = "opening";
  sync(matrixInputs, matrix);
  sync(vectorInputs, input);
  clearPrediction();
  render();
  controls.disabled = false;
  find("prediction-controls").disabled = false;
  find("challenge-controls").disabled = false;
  find("static-note").hidden = true;

  requestDraw = enhanceGraphics(find("viewport"), find("canvas"), size, colors, () => diagram, listen, lifetime);
}

// ---------------------------------------------------------------------------
// Matrix Arcade · optional practice stations.
// Everything below uses the "mx" prefix and runs separately from the Matrix
// Reactor, so the lab and the challenge above behave exactly as before.
// Matrices are stored by rows as [a, b, c, d], matching the Reactor presets.
// ---------------------------------------------------------------------------

const MX_TOLERANCE = 0.002;
const MX_SIZE = [560, 360];
const MX_CENTER = [280, 180];
const MX_I = [1, 0, 0, 1];
const MX_ENTRIES = ["a", "b", "c", "d"];
const MX_XYZ = ["x", "y", "z"];
const mxNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 3, useGrouping: false });

function mxFmt(value) {
  if (Math.abs(value) >= 1e7) {
    const [mantissa, power] = value.toExponential(2).split("e");
    return mantissa.replace("-", "−") + " × 10^" + Number(power);
  }
  return mxNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
}
const mxPair = vector => "(" + vector.map(mxFmt).join(", ") + ")";
const mxMat = ([a, b, c, d]) => "[" + mxFmt(a) + ", " + mxFmt(b) + "] [" + mxFmt(c) + ", " + mxFmt(d) + "]";
const mxMatShow = ([a, b, c, d]) => "[" + mxShow(a) + ", " + mxShow(b) + "] [" + mxShow(c) + ", " + mxShow(d) + "]";
const mxMat3 = rows => rows.map(row => "[" + row.map(mxFmt).join(", ") + "]").join(" ");
const mxParen = value => value < 0 ? "(" + mxFmt(value) + ")" : mxFmt(value);
const mxTimes = (a, b) => mxParen(a) + "·" + mxParen(b);
// An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
const mxTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
const mxFits = (value, answer) => Math.abs(value - answer) <= (mxTerminates(answer) ? 1e-9 : MX_TOLERANCE + 1e-12);
const mxFitsAll = (values, answers) => values.length === answers.length && values.every((v, i) => mxFits(v, answers[i]));
// Two unordered answers, such as a pair of eigenvalues.
const mxFitsSet = ([p, q], [s, t]) => (mxFits(p, s) && mxFits(q, t)) || (mxFits(p, t) && mxFits(q, s));
const mxNear = (a, b, eps = 1e-9) => a.length === b.length && a.every((n, i) => Math.abs(n - b[i]) <= eps * Math.max(1, Math.abs(b[i])));
const mxIsZero = vector => vector.every(n => Math.abs(n) < 1e-12);
const mxDot = (u, v) => u.reduce((sum, n, i) => sum + n * v[i], 0);
const mxLength = vector => Math.hypot(...vector);
const mxCross2 = ([p, q], [r, s]) => p * s - q * r;
const mxApply = ([a, b, c, d], [x, y]) => [a * x + b * y, c * x + d * y];
// mxProduct(P, Q) is the matrix PQ: apply Q first, then P.
const mxProduct = ([a, b, c, d], [e, f, g, h]) => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];
const mxDet = ([a, b, c, d]) => a * d - b * c;
const mxTrace = ([a, , , d]) => a + d;
const mxColumns = ([a, b, c, d]) => [[a, c], [b, d]];
const mxScalar = ([a, b, c, d]) => b === 0 && c === 0 && a === d;
const mxApply3 = (rows, v) => rows.map(row => mxDot(row, v));
const mxAdd3 = (a, b) => a.map((n, i) => n + b[i]);
const mxScale3 = (v, k) => v.map(n => n * k);
const mxCross3 = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
const mxWrapDegrees = angle => ((angle + 180) % 360 + 360) % 360 - 180;
const mxLineAngle = ([x, y]) => ((Math.atan2(y, x) * 180 / Math.PI) % 180 + 180) % 180;
const mxLineGap = (p, q) => { const d = Math.abs(p - q) % 180; return Math.min(d, 180 - d); };
const mxPolar = degrees => [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)];
const mxDegrees = radians => radians * 180 / Math.PI;
// Signed area of a polygon (shoelace formula).
const mxArea = points => points.reduce((sum, p, i) => sum + mxCross2(p, points[(i + 1) % points.length]), 0) / 2;
const MX_F = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 1.8], [1, 1.8], [1, 2.2], [2.5, 2.2], [2.5, 3], [0, 3]];

// Real eigenvalues and eigenline directions, reusing the Reactor's analysis.
function mxEigen(matrix) {
  const spectrum = getSpectrum(matrix);
  return { ...spectrum, lines: spectrum.lines.map(({ value, direction }) => ({ value, direction, angle: mxLineAngle(direction) })) };
}
function mxEigenAngle(matrix) {
  const { lines } = mxEigen(matrix);
  if (lines.length < 2) return null;
  return mxDegrees(Math.acos(Math.min(1, Math.abs(mxDot(lines[0].direction, lines[1].direction)))));
}

// Show exact fractions such as 1/3 in worked steps, and ≈ for irrational values.
function mxShow(value) {
  if (mxTerminates(value)) return mxFmt(value);
  for (let q = 2; q <= 60; q++) {
    const p = Math.round(value * q);
    if (Math.abs(value * q - p) < 1e-9) return (p < 0 ? "−" : "") + Math.abs(p) + "/" + q;
  }
  return "≈ " + mxFmt(value);
}

// Parse numbers such as 2, −1.5, 1/3, √2, 2√2, 1/√2, √3/2, (1 + √5)/2 or sqrt(2)/2.
// This is a small arithmetic reader (+ − × / √ and brackets), never eval.
function mxParse(raw) {
  const text = String(raw).trim().toLowerCase()
    .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/sqrt/g, "√").replace(/\s+/g, "");
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

const mxArrow = (to, color, label = "", from = [0, 0], options = {}) => ({ to, color, label, from, ...options });
const mxMark = (at, color, label = "", options = {}) => ({ at, color, label, ...options });
const mxGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
const mxSetup = message => mxGrade(false, message);

// Draw what a matrix does to the grid: warped grid lines, or the dots it collapses onto.
function mxWarp(matrix, color = "warp", options = {}) {
  const [c1, c2] = mxColumns(matrix);
  if (mxDet(matrix) !== 0) {
    const plan = { lattice: { basis: [c1, c2], color } };
    if (options.cell) plan.fills = [{ points: [[0, 0], c1, [c1[0] + c2[0], c1[1] + c2[1]], c2], color, opacity: 0.28 }];
    return plan;
  }
  const marks = [];
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
    marks.push(mxMark(mxApply(matrix, [i, j]), color, "", { loose: true, r: 3.2 }));
  }
  const direction = mxIsZero(c1) ? c2 : c1;
  return { marks, lines: mxIsZero(direction) ? [] : [{ direction, color, width: 1.4, dashed: true }] };
}
// Merge plan fragments, concatenating lists.
function mxMerge(...parts) {
  const plan = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part ?? {})) {
      plan[key] = Array.isArray(value) && Array.isArray(plan[key]) ? [...plan[key], ...value] : value;
    }
  }
  return plan;
}
const mxUnitArrows = () => [mxArrow([1, 0], "input", "e₁", [0, 0], { width: 2 }), mxArrow([0, 1], "input", "e₂", [0, 0], { width: 2 })];
const mxCard = c => (c.s.card && c.spec.cards?.[c.s.card]) ? c.s.card : c.spec.defaultCard;

// Linearity Lab machines.
const MX_MACHINES = {
  p: { name: "P", map: ([x, y]) => [2 * x - y, 3 * y] },
  q: { name: "Q", map: ([x, y]) => [x + y, x * y] },
  r: { name: "R", map: ([x, y]) => [y, -x] }
};
const MX_LINEAR_U = [1, 2], MX_LINEAR_V = [3, -1];
const MX_LINEAR_AU = [2, 1], MX_LINEAR_AV = [-1, 4];

function mxMatrixCheck(key, fail, workFor) {
  return c => {
    const card = c.spec.cards[key];
    const entry = c.ansMat(key);
    const pass = mxFitsAll(entry, card.matrix);
    return mxGrade(pass, typeof fail === "function" ? fail(entry, card) : fail, pass ? workFor(card) : "");
  };
}
function mxPairCheck(key, answer, fail, work) {
  return c => {
    const entry = [c.ans(key + "-x"), c.ans(key + "-y")];
    const pass = mxFitsAll(entry, answer);
    return mxGrade(pass, typeof fail === "function" ? fail(entry) : fail, pass ? work : "");
  };
}

// ---------------------------------------------------------------------------
// Station definitions. Each station has start / actions / show / checks, where
// each check is [first hint, second hint, grader]. A grader returns
// mxGrade(pass, failure message, worked steps).
// ---------------------------------------------------------------------------

const mxStations = {

  // 1 · Column Reader ---------------------------------------------------------
  columns: {
    defaultCard: "build",
    matrix: [3, 2, -1, 4],
    cards: { build: {}, predict: { v: [2, -1] }, half: { v: [0.5, 3] }, recipe: {} },
    start(c) { c.s.drawn = {}; },
    edit(c, name) { delete c.s.drawn[name.split("-")[0]]; },
    actions: {
      draw(c, button, check) {
        const matrix = c.ansMat(check);
        c.s.drawn[check] = matrix;
        const [k1, k2] = mxColumns(matrix);
        return "Your matrix sends e₁ to " + mxPair(k1) + " and e₂ to " + mxPair(k2) + ".";
      }
    },
    show(c) {
      const key = mxCard(c);
      const card = c.spec.cards[key];
      const [k1, k2] = mxColumns(c.spec.matrix);
      const arrows = mxUnitArrows();
      const parts = [];
      if (key !== "recipe") {
        arrows.push(mxArrow(k1, "column", "Ae₁ " + mxPair(k1)), mxArrow(k2, "column", "Ae₂ " + mxPair(k2)));
        parts.push("Column 1 is Ae₁ = " + mxPair(k1) + " and column 2 is Ae₂ = " + mxPair(k2) + ".");
      } else parts.push("Only e₁ and e₂ are shown. Draw your columns to compare them with the description.");
      if (card.v) {
        arrows.push(mxArrow(card.v, "input", "v " + mxPair(card.v)));
        if (c.s.revealed[key]) {
          const first = [k1[0] * card.v[0], k1[1] * card.v[0]];
          const out = mxApply(c.spec.matrix, card.v);
          arrows.push(mxArrow(first, "column", mxShow(card.v[0]) + "·col 1", [0, 0], { dashed: true }),
            mxArrow(out, "column", mxShow(card.v[1]) + "·col 2", first, { dashed: true }),
            mxArrow(out, "output", "Av " + mxPair(out)));
          parts.push("Dashed steps add " + mxShow(card.v[0]) + " copies of column 1 and " + mxShow(card.v[1]) + " copies of column 2, giving Av = " + mxPair(out) + ".");
        } else parts.push("Input v = " + mxPair(card.v) + ". Predict its image, then check.");
      }
      const drawn = c.s.drawn[key];
      if (drawn) {
        const [d1, d2] = mxColumns(drawn);
        arrows.push(mxArrow(d1, "output", "your Ae₁", [0, 0], { dashed: true }), mxArrow(d2, "output", "your Ae₂", [0, 0], { dashed: true }));
        parts.push("Dashed orange arrows show the columns of your matrix " + mxMat(drawn) + ".");
      }
      c.put("state", key === "recipe" ? "Ae₁ = 2e₁ · Ae₂ = e₁ + e₂" : "Ae₁ = " + mxPair(k1) + " · Ae₂ = " + mxPair(k2));
      return { desc: parts.join(" "), arrows, min: 3 };
    },
    checks: {
      build: ["The image of e₁ is the first column, read top to bottom.",
        "Row 1 holds the x-parts of the two images, and row 2 holds the y-parts.",
        c => {
          const entry = c.ansMat("build");
          const pass = mxFitsAll(entry, [3, 2, -1, 4]);
          const [k1] = mxColumns(entry);
          return mxGrade(pass, mxNear(k1, [3, 2]) ? "You placed the images along the rows. Each image belongs in a column." :
            "Your matrix sends e₁ to " + mxPair(mxColumns(entry)[0]) + " and e₂ to " + mxPair(mxColumns(entry)[1]) + ". Compare with (3, −1) and (2, 4).",
            "A = [3, 2] [−1, 4]. Check: A(1, 0) = (3, −1), the first column, and A(0, 1) = (2, 4), the second.");
        }],
      predict: ["Av = 2·(column 1) + (−1)·(column 2).", "2·(3, −1) = (6, −2), then subtract (2, 4).",
        mxPairCheck("predict", [4, -6], "Rebuild it as 2·(3, −1) − (2, 4), one component at a time.",
          "2·(3, −1) + (−1)·(2, 4) = (6, −2) + (−2, −4) = (4, −6).")],
      half: ["Av = (1/2)·(column 1) + 3·(column 2).", "Half of (3, −1) is (1.5, −0.5), and 3·(2, 4) = (6, 12).",
        mxPairCheck("half", [7.5, 11.5], "Add (1/2)·(3, −1) and 3·(2, 4) component by component.",
          "(1/2)·(3, −1) + 3·(2, 4) = (1.5, −0.5) + (6, 12) = (7.5, 11.5).")],
      recipe: ["Doubling e₁ gives the first column (2, 0).", "e₁ + e₂ = (1, 1) is the second column.",
        c => {
          const entry = c.ansMat("recipe");
          const pass = mxFitsAll(entry, [2, 1, 0, 1]);
          return mxGrade(pass, "Your matrix sends e₁ to " + mxPair(mxColumns(entry)[0]) + " and e₂ to " + mxPair(mxColumns(entry)[1]) +
            ". The description asks for (2, 0) and (1, 1).", "Ae₁ = (2, 0) and Ae₂ = (1, 1), so A = [2, 1] [0, 1].");
        }]
    }
  },

  // 2 · Grid Warp Detective ----------------------------------------------------
  warp: {
    defaultCard: "grid",
    cards: {
      grid: { matrix: [2, -1, 1, 1] },
      arrow: { matrix: [-1, 1, 2, 1], probe: [1, 2] },
      pair: { matrix: [2, 1, -1, 2] },
      flat: { matrix: [2, -4, 1, -2] }
    },
    start(c) { c.s.overlay = {}; },
    edit(c, name) { delete c.s.overlay[name.split("-")[0]]; },
    actions: {
      overlay(c, button, check) {
        const matrix = c.ansMat(check);
        c.s.overlay[check] = matrix;
        return "Your guess " + mxMat(matrix) + " is drawn in red. Where it matches, the two grids line up.";
      }
    },
    show(c) {
      const key = mxCard(c);
      const { matrix, probe } = c.spec.cards[key];
      const [c1] = mxColumns(matrix);
      let plan, text;
      if (key === "grid") {
        plan = mxMerge(mxWarp(matrix, "warp", { cell: true }), { marks: [mxMark(c1, "output", "Ae₁ lands here")] });
        text = "Warped grid with the image of the unit square shaded. The orange dot marks Ae₁.";
      } else if (key === "arrow") {
        plan = mxMerge(mxWarp(matrix, "warp", { cell: true }), { arrows: [mxArrow(mxApply(matrix, probe), "output", "A(1, 2)")] });
        text = "Warped grid with the image of the unit square shaded, and the arrow A(1, 2) = " + mxPair(mxApply(matrix, probe)) + ".";
      } else if (key === "pair") {
        plan = { arrows: [mxArrow([1, 1], "input", "(1, 1)", [0, 0], { width: 2 }), mxArrow([1, -1], "input", "(1, −1)", [0, 0], { width: 2 }),
          mxArrow([3, 1], "output", "A(1, 1)"), mxArrow([1, -3], "output", "A(1, −1)")] };
        text = "No grid. A(1, 1) = (3, 1) and A(1, −1) = (1, −3).";
      } else {
        plan = mxMerge(mxWarp(matrix, "warp"), { marks: [mxMark(c1, "output", "Ae₁")], arrows: [mxArrow([2, 1], "input", "(2, 1) ↦ 0", [0, 0], { width: 2 })] });
        text = "The plane collapses onto one line. Dots are images of whole-number points. The orange dot is Ae₁, and (2, 1) is sent to the origin.";
      }
      const guess = c.s.overlay[key];
      if (guess) {
        const mine = mxWarp(guess, "bad");
        delete mine.fills;
        plan = mxMerge(plan, mine, { arrows: [mxArrow(mxColumns(guess)[0], "bad", "your Ae₁", [0, 0], { dashed: true }), mxArrow(mxColumns(guess)[1], "bad", "your Ae₂", [0, 0], { dashed: true })] });
        text += " Your guess " + mxMat(guess) + " is overlaid in red.";
      }
      c.put("state", { grid: "Case 1 · warped grid, unit cell shaded", arrow: "Case 2 · warped grid plus A(1, 2)",
        pair: "Case 3 · A(1, 1) = (3, 1) and A(1, −1) = (1, −3)", flat: "Case 4 · flattened grid, A(2, 1) = (0, 0)" }[key]);
      return { ...plan, desc: text, min: 3.2, caption: "Evidence" };
    },
    checks: {
      grid: ["Count grid squares from the origin to the orange dot. That point is the first column.",
        "The other edge of the shaded cell that starts at the origin is Ae₂, the second column.",
        mxMatrixCheck("grid", entry => "Your matrix puts Ae₁ at " + mxPair(mxColumns(entry)[0]) + " and Ae₂ at " + mxPair(mxColumns(entry)[1]) +
          ". Overlay it to see where the grids disagree.", () => "Ae₁ = (2, 1) and Ae₂ = (−1, 1), so A = [2, −1] [1, 1].")],
      arrow: ["The two edges of the shaded cell that start at the origin are Ae₁ and Ae₂, in some order.",
        "Try both orders. Only one gives 1·Ae₁ + 2·Ae₂ = (1, 4).",
        mxMatrixCheck("arrow", entry => "With your columns, A(1, 2) = " + mxPair(mxApply(entry, [1, 2])) + ", but the evidence shows (1, 4).",
          () => "The cell edges are (−1, 2) and (1, 1). (−1, 2) + 2·(1, 1) = (1, 4), so Ae₁ = (−1, 2), Ae₂ = (1, 1) and A = [−1, 1] [2, 1].")],
      pair: ["Add the two clues: A(1, 1) + A(1, −1) = A(2, 0) = 2Ae₁.",
        "Subtract them: A(1, 1) − A(1, −1) = A(0, 2) = 2Ae₂.",
        mxMatrixCheck("pair", entry => "Your matrix gives A(1, 1) = " + mxPair(mxApply(entry, [1, 1])) + " and A(1, −1) = " + mxPair(mxApply(entry, [1, -1])) + ".",
          () => "2Ae₁ = (3, 1) + (1, −3) = (4, −2), so Ae₁ = (2, −1). 2Ae₂ = (3, 1) − (1, −3) = (2, 4), so Ae₂ = (1, 2). A = [2, 1] [−1, 2].")],
      flat: ["The orange dot gives the first column directly.",
        "A(2, 1) = 2Ae₁ + Ae₂ = 0, so Ae₂ = −2Ae₁.",
        mxMatrixCheck("flat", entry => "Your matrix sends (2, 1) to " + mxPair(mxApply(entry, [2, 1])) + " and e₁ to " + mxPair(mxColumns(entry)[0]) + ".",
          () => "Ae₁ = (2, 1). From 2Ae₁ + Ae₂ = 0, Ae₂ = (−4, −2). A = [2, −4] [1, −2], with det A = −4 + 4 = 0.")]
    }
  },

  // 3 · Linearity Lab -----------------------------------------------------------
  linear: {
    defaultCard: "sum",
    cards: { sum: { v: [4, 1], weights: [1, 1] }, scale: { v: [-3, -6], weights: [-3, 0] }, combo: { v: [-1, 5], weights: [2, -1] }, impostor: {} },
    start(c) { c.s.test = null; },
    edit(c, name) { if (name.startsWith("impostor")) c.s.test = null; },
    actions: {
      test(c) {
        const key = c.choice("impostor-machine");
        const u = [c.num("impostor-ux"), c.num("impostor-uy")], v = [c.num("impostor-vx"), c.num("impostor-vy")];
        const machine = MX_MACHINES[key];
        const whole = machine.map([u[0] + v[0], u[1] + v[1]]);
        const parts = machine.map(u).map((n, i) => n + machine.map(v)[i]);
        c.s.test = { key, u, v, whole, parts };
        return machine.name + "(u + v) = " + mxPair(whole) + " and " + machine.name + "(u) + " + machine.name + "(v) = " + mxPair(parts) +
          (mxNear(whole, parts) ? ". They agree for this pair." : ". They disagree.");
      }
    },
    show(c) {
      const key = mxCard(c);
      const card = c.spec.cards[key];
      const arrows = [mxArrow(MX_LINEAR_U, "input", "u", [0, 0], { width: 2.2 }), mxArrow(MX_LINEAR_V, "input", "v", [0, 0], { width: 2.2 }),
        mxArrow(MX_LINEAR_AU, "output", "Au", [0, 0], { dashed: true }), mxArrow(MX_LINEAR_AV, "output", "Av", [0, 0], { dashed: true })];
      let text = "Known pairs: u = (1, 2) ↦ Au = (2, 1) and v = (3, −1) ↦ Av = (−1, 4).";
      if (card.v) {
        arrows.push(mxArrow(card.v, "column", "new input " + mxPair(card.v)));
        if (c.s.revealed[key]) {
          const [p, q] = card.weights;
          const out = [p * MX_LINEAR_AU[0] + q * MX_LINEAR_AV[0], p * MX_LINEAR_AU[1] + q * MX_LINEAR_AV[1]];
          arrows.push(mxArrow(out, "output", "output " + mxPair(out)));
          text += " The new input " + mxPair(card.v) + " maps to " + mxPair(out) + ".";
        } else text += " New input " + mxPair(card.v) + ". Its output appears after a correct prediction.";
      }
      const marks = [];
      if (key === "impostor" && c.s.test) {
        const { whole, parts, key: machine } = c.s.test;
        marks.push(mxMark(whole, "bad", MX_MACHINES[machine].name + "(u + v)", { shape: "ring" }), mxMark(parts, "column", "sum of outputs"));
        text += " Sum test on machine " + MX_MACHINES[machine].name + ": " + mxPair(whole) + " versus " + mxPair(parts) + ".";
      }
      return { desc: text, arrows, marks, min: 3.5, caption: "Sealed machine" };
    },
    checks: {
      sum: ["u + v = (4, 1). Linearity says its output is Au + Av.", "Add (2, 1) and (−1, 4) component by component.",
        mxPairCheck("sum", [1, 5], "Add the two known outputs (2, 1) and (−1, 4).", "A(u + v) = Au + Av = (2, 1) + (−1, 4) = (1, 5).")],
      scale: ["A(−3u) = −3·Au.", "Multiply each component of (2, 1) by −3.",
        mxPairCheck("scale", [-6, -3], "Scale Au = (2, 1) by −3.", "A(−3u) = −3·Au = −3·(2, 1) = (−6, −3).")],
      combo: ["A(2u − v) = 2Au − Av.", "2·(2, 1) = (4, 2). Subtract (−1, 4).",
        mxPairCheck("combo", [5, -2], "Compute 2Au − Av = 2·(2, 1) − (−1, 4).", "A(2u − v) = 2·(2, 1) − (−1, 4) = (4, 2) − (−1, 4) = (5, −2).")],
      impostor: ["Linear maps only add, subtract and scale x and y. Look for a product of the inputs.",
        "For Q, the second output is xy. Pick u and v that each have a nonzero x and a nonzero y somewhere, such as u = (1, 0) and v = (0, 1).",
        c => {
          const key = c.choice("impostor-machine");
          const u = [c.num("impostor-ux"), c.num("impostor-uy")], v = [c.num("impostor-vx"), c.num("impostor-vy")];
          if (key !== "q") return mxGrade(false, MX_MACHINES[key].name + " only adds and scales x and y, so it is linear for every pair. Look for the machine that multiplies the inputs together.");
          const machine = MX_MACHINES.q;
          const whole = machine.map([u[0] + v[0], u[1] + v[1]]);
          const parts = machine.map(u).map((n, i) => n + machine.map(v)[i]);
          const pass = !mxNear(whole, parts);
          return mxGrade(pass, "Q is the impostor, but your pair passes the sum test: Q(u + v) = " + mxPair(whole) + " = Q(u) + Q(v). Choose inputs where u·y and v·x are not both zero.",
            "Q(u + v) = " + mxPair(whole) + " but Q(u) + Q(v) = " + mxPair(parts) + ". The difference in the second slot is u_x·v_y + v_x·u_y = " +
            mxFmt(u[0] * v[1] + v[0] * u[1]) + ", which is not zero, so Q is not linear.");
        }]
    }
  },

  // 4 · Transformation Zoo -------------------------------------------------------
  zoo: {
    defaultCard: "rot",
    cards: {
      rot: { matrix: [0.6, -0.8, 0.8, 0.6], type: "rotation", why: "lengths" },
      refl: { matrix: [0, -1, -1, 0], type: "reflection", why: "mirror" },
      shear: { matrix: [1, 0, 1.5, 1], type: "shear", why: "slide" },
      proj: { matrix: [0.5, 0.5, 0.5, 0.5], type: "projection", why: "twice" },
      spiral: { matrix: [1, -1, 1, 1], type: "spiral", why: "turn" }
    },
    start() {},
    actions: {},
    show(c) {
      const key = mxCard(c);
      const { matrix } = c.spec.cards[key];
      const [k1, k2] = mxColumns(matrix);
      const image = MX_F.map(p => mxApply(matrix, p));
      c.put("state", "Specimen " + (Object.keys(c.spec.cards).indexOf(key) + 1) + " · A = " + mxMat(matrix) + " · Ae₁ = " + mxPair(k1) + " · Ae₂ = " + mxPair(k2));
      return {
        desc: "The faint F is the input outline. The filled orange F is its image under A = " + mxMat(matrix) + ". Ae₁ = " + mxPair(k1) + " and Ae₂ = " + mxPair(k2) + ".",
        paths: [{ points: [...MX_F, MX_F[0]], color: "axis", width: 1.4, opacity: 0.7 }, { points: [...image, image[0]], color: "output", width: 2.2 }],
        fills: mxArea(image) === 0 ? [] : [{ points: image, color: "output", opacity: 0.25 }],
        arrows: [...mxUnitArrows(), mxArrow(k1, "column", "Ae₁"), mxArrow(k2, "column", "Ae₂")],
        min: 3.4, caption: "Specimen"
      };
    },
    checks: Object.fromEntries([
      ["rot", "Check the lengths of Ae₁ and Ae₂: 0.6² + 0.8² = 1.", "det A = 0.36 + 0.64 = 1, and the F keeps its shape and handedness."],
      ["refl", "Compare the image F with the input F. Can you still read it the right way round?", "det A = 0 − 1 = −1. Test the arrow (1, −1): it maps to itself."],
      ["shear", "Which of e₁ and e₂ comes back unchanged?", "det A = 1 − 0 = 1. Ae₂ = e₂, while Ae₁ = (1, 1.5) has slid straight up."],
      ["proj", "det A = 0.25 − 0.25 = 0. Where does every arrow land?", "Every output lands on y = x, and an arrow already on y = x stays put, so applying A again changes nothing."],
      ["spiral", "Ae₁ = (1, 1) and Ae₂ = (−1, 1). Measure their lengths and the angle between them.", "Both columns have length √2 and are perpendicular. det A = 1 + 1 = 2 = (√2)²."]
    ].map(([key, h1, h2]) => [key, [h1, h2, c => {
      const card = c.spec.cards[key];
      const type = c.choice(key + "-type"), why = c.choice(key + "-why");
      const pass = type === card.type && why === card.why;
      const names = { rotation: "rotation", reflection: "reflection", shear: "shear", projection: "projection", scaling: "scaling along the axes", spiral: "rotation combined with scaling" };
      return mxGrade(pass, type !== card.type ? "That type doesn’t fit. Look at det A and at what happens to the F." : "Right type. The evidence you chose doesn’t prove it, so pick the statement that is true for this matrix.",
        "A = " + mxMat(card.matrix) + " is a " + names[card.type] + ". det A = " + mxFmt(mxDet(card.matrix)) + ". " + h2);
    }]]))
  },

  // 5 · Area Scaling Lab ----------------------------------------------------------
  area: {
    shapes: {
      square: { name: "unit square", points: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      triangle: { name: "triangle", points: [[0, 0], [2, 0], [0, 3]] },
      f: { name: "F outline", points: MX_F }
    },
    cards: {
      triangle: { matrix: [3, 1, 1, 2], shape: "triangle" },
      flip: { matrix: [1, 3, 2, 1], shape: "square" },
      flat: { matrix: [2, -4, -1, 2], shape: "square" },
      record: {}
    },
    defaultCard: "record",
    start(c) { c.s.records = []; },
    actions: {
      load(c, button, check) {
        const card = c.spec.cards[check];
        c.writeMat("m", card.matrix);
        c.set("shape", card.shape);
        return "Loaded A = " + mxMat(card.matrix) + " and the " + c.spec.shapes[card.shape].name + ".";
      },
      record(c) {
        const matrix = c.mat("m"), shape = c.val("shape");
        const det = mxDet(matrix);
        if (det === 0) return "This matrix collapses every area to 0. Choose one with det A ≠ 0.";
        if (c.s.records.length && !mxNear(c.s.records[0].matrix, matrix)) c.s.records = [];
        const points = c.spec.shapes[shape].points;
        const before = Math.abs(mxArea(points)), after = Math.abs(mxArea(points.map(p => mxApply(matrix, p))));
        c.s.records = c.s.records.filter(r => r.shape !== shape);
        c.s.records.push({ matrix, shape, before, after });
        return "Recorded the " + c.spec.shapes[shape].name + ": area " + mxFmt(before) + " → " + mxFmt(after) + ", ratio " + mxFmt(after / before) + ".";
      }
    },
    show(c) {
      const matrix = c.liveMat("m"), shape = c.spec.shapes[c.val("shape")] ?? c.spec.shapes.square;
      const image = shape.points.map(p => mxApply(matrix, p));
      const before = mxArea(shape.points), signed = mxArea(image), det = mxDet(matrix);
      const key = mxCard(c), card = c.spec.cards[key];
      const hide = card.matrix && !c.s.revealed[key] && mxNear(matrix, card.matrix);
      const orientation = det > 0 ? "orientation kept" : det < 0 ? "orientation flipped" : "collapsed, no area";
      c.put("state", hide ? "Area before " + mxFmt(Math.abs(before)) + " · after and factor hidden until you check your prediction" :
        "Area before " + mxFmt(Math.abs(before)) + " · after " + mxFmt(Math.abs(signed)) + " · factor " + mxFmt(Math.abs(det)) + " · det A = " + mxFmt(det) + " · " + orientation);
      c.put("saved", c.s.records.length ? c.s.records.map(r => c.spec.shapes[r.shape].name + " " + mxFmt(r.before) + " → " + mxFmt(r.after)).join(" · ") +
        " with A = " + mxMat(c.s.records[0].matrix) : "No shapes recorded.");
      const color = det < 0 ? "bad" : "output";
      return {
        desc: "Input " + shape.name + " (faint) and its image under A = " + mxMat(matrix) + (hide ? "." : ", with " + orientation + "."),
        fills: [{ points: shape.points, color: "axis", opacity: 0.12 }, ...(det === 0 ? [] : [{ points: image, color, opacity: 0.3 }])],
        paths: [{ points: [...shape.points, shape.points[0]], color: "axis", width: 1.4 }, { points: [...image, image[0]], color, width: 2.4 }],
        arrows: [...mxUnitArrows(), mxArrow(mxColumns(matrix)[0], "column", "Ae₁"), mxArrow(mxColumns(matrix)[1], "column", "Ae₂")],
        min: 3.2, caption: "A = " + mxMat(matrix)
      };
    },
    checks: {
      triangle: ["Every area is multiplied by |det A|.", "det A = 3·2 − 1·1 = 5, and the triangle starts with area 3.",
        c => {
          const value = c.ans("triangle-area");
          return mxGrade(mxFits(value, 15), "Multiply the starting area 3 by |det A|, where det A = 3·2 − 1·1.",
            "det A = 3·2 − 1·1 = 5. The image area is 5 × 3 = 15.");
        }],
      flip: ["det A = ad − bc = 1·1 − 3·2.", "A negative det means the shape is mirrored.",
        c => {
          const value = c.ans("flip-factor"), orient = c.choice("flip-orient");
          const pass = mxFits(value, -5) && orient === "flipped";
          return mxGrade(pass, !mxFits(value, -5) ? "Recompute det A = 1·1 − 3·2." : "The factor is right. Its sign tells you about orientation.",
            "det A = 1 − 6 = −5. Areas grow by 5, and the negative sign means the image is mirrored. Ae₁ = (1, 2) and Ae₂ = (3, 1) now turn clockwise.");
        }],
      flat: ["det A = 2·2 − (−4)(−1).", "The columns (2, −1) and (−4, 2) are parallel, but A is not the zero matrix.",
        c => {
          const value = c.ans("flat-factor"), kind = c.choice("flat-kind");
          const pass = mxFits(value, 0) && kind === "line";
          return mxGrade(pass, !mxFits(value, 0) ? "Recompute det A = 2·2 − (−4)(−1)." : "det A = 0 is right. Is the image a single point or a whole line?",
            "det A = 4 − 4 = 0. Column 2 is −2 times column 1, so every output is a multiple of (2, −1). The plane collapses onto that line.");
        }],
      record: ["Pick a matrix such as [2, 1] [0, 1.5] with det 3, then record two different shapes.",
        "The ratio after ÷ before should come out the same for every shape.",
        c => {
          const records = c.s.records;
          if (records.length < 2) return mxSetup("Record at least two different shapes with the same matrix.");
          const det = mxDet(records[0].matrix);
          if (Math.abs(det) === 1) return mxSetup("With |det A| = 1 every area stays the same, which proves too little. Choose a matrix with |det A| ≠ 1.");
          const value = c.ans("record-factor");
          const pass = mxFits(value, Math.abs(det)) || mxFits(value, det);
          return mxGrade(pass, "Compare your factor with the recorded ratios.",
            records.map(r => c.spec.shapes[r.shape].name + ": " + mxFmt(r.after) + " ÷ " + mxFmt(r.before) + " = " + mxFmt(r.after / r.before)).join(". ") +
            ". Both equal |det A| = " + mxFmt(Math.abs(det)) + ".");
        }]
    }
  },

  // 6 · Assembly Line -------------------------------------------------------------
  assembly: {
    defaultCard: "counter",
    cards: { combine: {}, reverse: {}, counter: {}, partner: {} },
    start() {},
    actions: {
      load(c, button, check) {
        c.writeMat("a", check === "partner" ? [1, 2, 0, 3] : [1, 2, 0, 1]);
        if (check !== "partner") c.writeMat("b", [2, 0, 0, -1]);
        return check === "partner" ? "Loaded A = [1, 2] [0, 3]. Now set B." : "Loaded A = [1, 2] [0, 1] and B = [2, 0] [0, −1].";
      }
    },
    show(c) {
      const A = c.liveMat("a"), B = c.liveMat("b"), v = [c.live("vx"), c.live("vy")];
      const Av = mxApply(A, v), BAv = mxApply(B, Av);
      const Bv = mxApply(B, v), ABv = mxApply(A, Bv);
      const key = mxCard(c);
      const arrows = [mxArrow(v, "input", "v"), mxArrow(Av, "output", "Av", [0, 0], { dashed: true }), mxArrow(BAv, "column", "B(Av)")];
      if (key === "counter" || key === "reverse") arrows.push(mxArrow(ABv, "bad", "A(Bv)", [0, 0], { dashed: true }));
      c.put("state", "v = " + mxPair(v) + " → Av = " + mxPair(Av) + " → B(Av) = " + mxPair(BAv) + " · other order: Bv = " + mxPair(Bv) + " → A(Bv) = " + mxPair(ABv));
      return {
        desc: "Input v = " + mxPair(v) + ". Machine A gives " + mxPair(Av) + ", then machine B gives " + mxPair(BAv) + ". In the other order, A(Bv) = " + mxPair(ABv) + ".",
        arrows, min: 3, caption: "A then B"
      };
    },
    checks: {
      combine: ["Column 1 of BA is B applied to column 1 of A.",
        "A's columns are (1, 0) and (2, 1). Apply B = [2, 0] [0, −1] to each.",
        c => {
          const entry = c.ansMat("combine");
          const pass = mxFitsAll(entry, [2, 4, 0, -1]);
          return mxGrade(pass, mxFitsAll(entry, [2, -2, 0, -1]) ? "That is AB, which means B runs first. Here A runs first, so you need BA." :
            "Test your matrix on v = (1, 1). It gives " + mxPair(mxApply(entry, [1, 1])) + ", but B(A(1, 1)) = (6, −1).",
            "B(1, 0) = (2, 0) and B(2, 1) = (4, −1), so BA = [2, 4] [0, −1]. Check: (BA)(1, 1) = (6, −1) = B(A(1, 1)).");
        }],
      reverse: ["Now B runs first, so the product is AB.",
        "Column 1 of AB is A applied to B's first column (2, 0). Column 2 is A applied to (0, −1).",
        c => {
          const entry = c.ansMat("reverse");
          const pass = mxFitsAll(entry, [2, -2, 0, -1]);
          return mxGrade(pass, mxFitsAll(entry, [2, 4, 0, -1]) ? "That is BA, with A first. Swap the order." : "Apply A = [1, 2] [0, 1] to each column of B.",
            "A(2, 0) = (2, 0) and A(0, −1) = (−2, −1), so AB = [2, −2] [0, −1]. That differs from BA = [2, 4] [0, −1], so the order matters.");
        }],
      counter: ["Almost any pair of non-diagonal matrices fails to commute.",
        "Try A = [1, 1] [0, 1] with B = [1, 0] [1, 1] and v = (1, 0).",
        c => {
          const A = c.mat("a"), B = c.mat("b"), v = [c.num("vx"), c.num("vy")];
          const BAv = mxApply(B, mxApply(A, v)), ABv = mxApply(A, mxApply(B, v));
          const pass = !mxNear(BAv, ABv);
          return mxGrade(pass, "With these settings, both orders give " + mxPair(BAv) + ". Change a matrix or v until they differ.",
            "B(Av) = " + mxPair(BAv) + " but A(Bv) = " + mxPair(ABv) + ". So BA = " + mxMat(mxProduct(B, A)) + " and AB = " + mxMat(mxProduct(A, B)) + " are different.");
        }],
      partner: ["Try B = A + I or B = 2A − I. A polynomial in A always commutes with A.",
        "A + I = [2, 2] [0, 4]. Check that AB and BA match.",
        c => {
          const A = c.mat("a"), B = c.mat("b");
          if (!mxNear(A, [1, 2, 0, 3])) return mxSetup("Load A = [1, 2] [0, 3] first, then change only B.");
          if (mxScalar(B)) return mxGrade(false, "Every multiple of I commutes with everything. Find a more interesting B.");
          if (mxNear(B, A)) return mxGrade(false, "A commutes with itself, of course. Find a different B.");
          const AB = mxProduct(A, B), BA = mxProduct(B, A);
          const pass = mxNear(AB, BA);
          return mxGrade(pass, "AB = " + mxMat(AB) + " but BA = " + mxMat(BA) + ".",
            "AB = BA = " + mxMat(AB) + ". Your B = " + mxMat(B) + " runs in either order with A and gives the same result.");
        }]
    }
  },

  // 7 · Undo Button ---------------------------------------------------------------
  undo: {
    defaultCard: "first",
    cards: {
      first: { matrix: [2, 1, 1, 1] },
      vshear: { matrix: [1, 0, -3, 1] },
      fifths: { matrix: [2, 1, 1, 3] },
      project: { matrix: [0.2, 0.4, 0.4, 0.8] },
      zero: { matrix: [0, 0, 0, 0] }
    },
    start(c) { c.s.composed = {}; },
    edit(c, name) { delete c.s.composed[name.split("-")[0]]; },
    actions: {
      compose(c, button, check) {
        const B = c.ansMat(check);
        c.s.composed[check] = B;
        const BA = mxProduct(B, c.spec.cards[check].matrix);
        return "Your matrix after A gives " + mxMat(BA) + (mxNear(BA, MX_I) ? ", which is I. Every arrow is back where it started." : ". The green grid shows where the squares end up.");
      }
    },
    show(c) {
      const key = mxCard(c);
      const A = c.spec.cards[key].matrix;
      let plan = mxWarp(A, "warp", { cell: true });
      let text = "Violet: the grid after A = " + mxMat(A) + ".";
      if (key === "project") {
        const u = [c.live("project-ux"), c.live("project-uy")], v = [c.live("project-vx"), c.live("project-vy")];
        plan = mxMerge(plan, { arrows: [mxArrow(u, "input", "u"), mxArrow(v, "input", "v"),
          mxArrow(mxApply(A, u), "output", "Pu", [0, 0], { dashed: true }), mxArrow(mxApply(A, v), "column", "Pv", [0, 0], { dashed: true })] });
        text += " Every output lies on y = 2x. Pu = " + mxPair(mxApply(A, u)) + " and Pv = " + mxPair(mxApply(A, v)) + ".";
      } else if (key === "zero") {
        plan = mxMerge(plan, { marks: [mxMark([0, 0], "warp", "every input ↦ (0, 0)", { r: 6 })] });
        text = "The zero matrix sends the whole plane to the origin.";
      } else {
        const [k1, k2] = mxColumns(A);
        plan = mxMerge(plan, { arrows: [mxArrow(k1, "column", "Ae₁"), mxArrow(k2, "column", "Ae₂")] });
        const B = c.s.composed[key];
        if (B) {
          const BA = mxProduct(B, A);
          const back = mxWarp(BA, "eigen");
          delete back.fills;
          plan = mxMerge(plan, back, { arrows: [mxArrow(mxColumns(BA)[0], "eigen", "B(Ae₁)", [0, 0], { dashed: true }), mxArrow(mxColumns(BA)[1], "eigen", "B(Ae₂)", [0, 0], { dashed: true })] });
          text += " Green: the grid after A then your B, which is " + mxMat(BA) + (mxNear(BA, MX_I) ? ", the identity." : ".");
        }
      }
      c.put("state", "A = " + mxMat(A) + " · det A = " + mxFmt(mxDet(A)));
      return { ...plan, desc: text, min: 3.2, caption: "A = " + mxMat(A) };
    },
    checks: Object.assign(Object.fromEntries([
      ["first", "det A = 2·1 − 1·1 = 1. Swap a and d, and negate b and c.", "Candidate: [1, −1] [−1, 2]. Multiply it by A to confirm."],
      ["vshear", "This shear adds −3 times x to y. Undo it by adding +3 times x back.", "det A = 1, so the formula gives [1, 0] [3, 1]."],
      ["fifths", "det A = 2·3 − 1·1 = 5, so every entry of the inverse is a multiple of 1/5.", "(1/5)·[3, −1] [−1, 2]."]
    ].map(([key, h1, h2]) => [key, [h1, h2, c => {
      const A = c.spec.cards[key].matrix, B = c.ansMat(key);
      const BA = mxProduct(B, A), AB = mxProduct(A, B);
      const pass = mxNear(BA, MX_I) && mxNear(AB, MX_I);
      const det = mxDet(A), [a, b, cc, d] = A;
      return mxGrade(pass, "Your matrix times A gives " + mxMat(BA) + ", not I = [1, 0] [0, 1]. Compose to see where the grid ends up.",
        "det A = " + mxFmt(det) + ". A⁻¹ = (1/" + mxFmt(det) + ")·" + mxMat([d, -b, -cc, a]) + " = " + mxMatShow(B) +
        ". Check: A⁻¹A = " + mxMat(BA) + " = I.");
    }]])), {
      project: ["Two inputs have the same output when their difference is sent to (0, 0).",
        "P(2, −1) = (0, 0), so any u and u + (2, −1) work. For example (0, 0) and (2, −1).",
        c => {
          const P = c.spec.cards.project.matrix;
          const u = [c.num("project-ux"), c.num("project-uy")], v = [c.num("project-vx"), c.num("project-vy")];
          if (mxNear(u, v)) return mxGrade(false, "u and v must be different inputs.");
          const Pu = mxApply(P, u), Pv = mxApply(P, v);
          const pass = mxNear(Pu, Pv);
          return mxGrade(pass, "Pu = " + mxPair(Pu) + " and Pv = " + mxPair(Pv) + " are different. Look for a difference u − v that P sends to zero.",
            "Pu = Pv = " + mxPair(Pu) + ", although u = " + mxPair(u) + " and v = " + mxPair(v) + ". An undo button would have to return both from one output, which is impossible. This matches det P = 0.2·0.8 − 0.4·0.4 = 0.");
        }],
      zero: ["What does the zero matrix do to (1, 0), and what does it do to (0, 1)?",
        "Can you recover the input from the output (0, 0)?",
        c => {
          const pass = c.choice("zero-why") === "lost";
          return mxGrade(pass, "Think about what information the output keeps.",
            "Every input gives (0, 0), so the output carries no information about the input. det 0 = 0, and no matrix B can satisfy B·0 = I.");
        }]
    })
  },

  // 8 · Eigen Hunter ----------------------------------------------------------------
  hunter: {
    defaultCard: "distinct",
    cards: {
      distinct: { matrix: [3, 2, 1, 2] },
      negative: { matrix: [-2, 3, 0, 1] },
      zero: { matrix: [2, -1, -4, 2] },
      single: { matrix: [3, -1, 1, 1] }
    },
    start(c) { c.s.angle = Number(c.val("angle")); c.s.records = {}; },
    edit(c, name) { if (name === "angle") c.s.angle = c.live("angle"); },
    point(c, [x, y]) {
      const [dx, dy] = [x - MX_CENTER[0], MX_CENTER[1] - y];
      if (Math.hypot(dx, dy) < 6) return;
      const angle = Math.round(((mxDegrees(Math.atan2(dy, dx)) % 180 + 180) % 180) * 2) / 2 % 180;
      c.s.angle = angle;
      c.set("angle", angle);
    },
    actions: {
      nudge(c, button) {
        const next = Math.round((c.s.angle + Number(button.dataset.mxStep)) * 2) / 2;
        c.s.angle = (next % 180 + 180) % 180;
        c.set("angle", c.s.angle);
        return null;
      },
      record(c) {
        const key = mxCard(c);
        const list = (c.s.records[key] ??= []);
        if (list.length >= 2) list.shift();
        list.push(c.s.angle);
        return "Recorded the line at " + mxFmt(c.s.angle) + "°. Records for this card: " + list.map(a => mxFmt(a) + "°").join(", ") + ".";
      },
      clear(c) { c.s.records[mxCard(c)] = []; return "Records cleared for this card."; }
    },
    show(c) {
      const key = mxCard(c);
      const A = c.spec.cards[key].matrix;
      const u = mxPolar(c.s.angle);
      const out = mxApply(A, u);
      const size = mxLength(out);
      const off = size < 0.02 ? 0 : mxDegrees(Math.acos(Math.min(1, Math.abs(mxDot(u, out)) / size)));
      let reach = 1;
      for (let a = 0; a < 180; a += 5) reach = Math.max(reach, mxLength(mxApply(A, mxPolar(a))));
      const circle = Array.from({ length: 73 }, (_, i) => mxPolar(i * 5));
      const records = c.s.records[key] ?? [];
      const on = size < 0.02 ? "The output is at the origin." : off < 0.5 ? (mxDot(u, out) > 0 ? "On the line, pointing the same way." : "On the line, pointing the opposite way.") :
        "The output is " + mxFmt(Math.round(off * 10) / 10) + "° off the input’s line.";
      c.put("state", "Input at " + mxFmt(c.s.angle) + "° · v = " + mxPair(u) + " · Av = " + mxPair(out) + " · |Av| = " + mxFmt(size) + " · " + on);
      c.put("saved", records.length ? "Recorded lines: " + records.map((a, i) => (i + 1) + ") " + mxFmt(a) + "°").join(" · ") : "No lines recorded.");
      return {
        desc: "A = " + mxMat(A) + ". Unit input at " + mxFmt(c.s.angle) + "° and its output " + mxPair(out) + ". " + on,
        fit: [[reach, reach], [-reach, -reach]],
        paths: [{ points: circle, color: "input", width: 1, opacity: 0.45, loose: true }],
        lines: [{ direction: u, color: "input", width: 1, dashed: true }, ...records.map((a, i) => ({ direction: mxPolar(a), color: "eigen", width: 2.2, dashed: true, label: "record " + (i + 1) }))],
        arrows: [mxArrow(u, "input", "v"), mxArrow(out, "output", "Av", [0, 0], { dashed: true })],
        min: 1.6, caption: "A = " + mxMat(A)
      };
    },
    checks: (() => {
      // A record matches an eigenline when it is within 1°.
      const match = (A, angle) => mxEigen(A).lines.find(line => mxLineGap(line.angle, angle) <= 1) ?? null;
      const recs = (c, key) => c.s.records[key] ?? [];
      const lineWork = A => "Eigenlines of " + mxMat(A) + ": " + mxEigen(A).lines.map(l => mxFmt(Math.round(l.angle * 100) / 100) + "° with λ = " + mxFmt(l.value)).join(", ") + ".";
      return {
        distinct: ["Sweep slowly. The output swings through the input’s line twice in half a turn.",
          "The lines are near 27° and 135°. Compare |Av| with |v| = 1 on each.",
          c => {
            const A = c.spec.cards.distinct.matrix, r = recs(c, "distinct");
            if (r.length < 2) return mxSetup("Record two lines for this card first.");
            const lines = r.map(a => match(A, a));
            if (lines.includes(null)) return mxGrade(false, "Record " + (lines.indexOf(null) + 1) + " is more than 1° from an eigenline. Look for the angle where the output lines up with the input.");
            if (lines[0] === lines[1]) return mxGrade(false, "Both records are on the same eigenline. Find the other one.");
            const pass = mxFits(c.ans("distinct-l1"), lines[0].value) && mxFits(c.ans("distinct-l2"), lines[1].value);
            return mxGrade(pass, "Both lines are right. Recheck λ: divide |Av| by |v| = 1, and make it negative if the output points backward.", lineWork(A));
          }],
        negative: ["Watch for the moment the orange output points exactly opposite the blue input.",
          "It happens on the x-axis, at 0°.",
          c => {
            const A = c.spec.cards.negative.matrix;
            const line = recs(c, "negative").map(a => match(A, a)).find(l => l && l.value < 0);
            if (!line) return mxSetup("Record the eigenline where the output points the opposite way.");
            return mxGrade(mxFits(c.ans("negative-l"), line.value), "On that line |Av| = 2 and the output points backward.", lineWork(A));
          }],
        zero: ["Find the angle where the orange arrow shrinks to a dot.",
          "It is near 63.4°, the direction of (1, 2).",
          c => {
            const A = c.spec.cards.zero.matrix;
            const line = recs(c, "zero").map(a => match(A, a)).find(l => l && l.value === 0);
            if (!line) return mxSetup("Record the line whose arrows are sent to the origin.");
            return mxGrade(mxFits(c.ans("zero-l"), 0), "Av = 0 = λv for a nonzero v. What must λ be?", lineWork(A) + " A(1, 2) = (0, 0).");
          }],
        single: ["Sweep all the way from 0° to 180°. How many times does the output line up?",
          "It lines up only at 45°, where |Av| = 2 |v|.",
          c => {
            const A = c.spec.cards.single.matrix;
            const line = recs(c, "single").map(a => match(A, a)).find(Boolean);
            if (!line) return mxSetup("Record the eigenline you found.");
            const pass = mxFits(c.ans("single-l"), 2) && c.choice("single-count") === "one";
            return mxGrade(pass, "Check λ and the count again. Did the output line up anywhere else?",
              lineWork(A) + " det(A − λI) = (λ − 2)², so λ = 2 is repeated, but A − 2I = [1, −1] [1, −1] only sends the line y = x to zero.");
          }]
      };
    })()
  },

  // 9 · Characteristic Equation Forge -------------------------------------------------------
  forge: {
    defaultCard: "f1",
    cards: {
      f1: { matrix: [4, -2, 1, 1] },
      f2: { matrix: [1, 4, 2, 3] },
      f3: { matrix: [1, 1, 1, 0] },
      f4: { matrix: [5, -1, 4, 1] }
    },
    start(c) { c.s.plots = {}; },
    edit(c, name) { delete c.s.plots[name.split("-")[0]]; },
    actions: {
      plot(c, button, check) {
        const t = c.ans(check + "-tr"), d = c.ans(check + "-det");
        c.s.plots[check] = { t, d };
        return "Plotted p(λ) = λ² − " + mxParen(t) + "λ + " + mxParen(d) + ".";
      }
    },
    show(c) {
      const key = mxCard(c);
      const A = c.spec.cards[key].matrix;
      const curve = (t, d) => Array.from({ length: 121 }, (_, i) => { const x = -4 + i * 0.1; return [x, x * x - t * x + d]; });
      const paths = [], marks = [];
      const mine = c.s.plots[key];
      if (mine) paths.push({ points: curve(mine.t, mine.d), color: "output", width: 2.4, loose: true, label: "your p(λ)", labelAt: [5.5, 5.5 * 5.5 - mine.t * 5.5 + mine.d] });
      if (c.s.revealed[key]) {
        const t = mxTrace(A), d = mxDet(A);
        paths.push({ points: curve(t, d), color: "eigen", width: 2, dashed: true, loose: true });
        for (const value of mxEigen(A).values) marks.push(mxMark([value, 0], "eigen", "λ = " + mxShow(value)));
      }
      c.put("state", "A = " + mxMat(A) + (mine ? " · your p(λ) = λ² − " + mxParen(mine.t) + "λ + " + mxParen(mine.d) : ""));
      return {
        desc: "Axes λ and p(λ). " + (mine ? "Your polynomial is drawn in orange. " : "Plot your polynomial to see where it crosses zero. ") + (c.s.revealed[key] ? "The true polynomial is dashed green, with its roots marked." : ""),
        paths, marks, fit: [[-3, -5], [7, 9]], axisNames: ["λ", "p(λ)"], caption: "p(λ) = det(A − λI)"
      };
    },
    checks: Object.fromEntries([
      ["f1", "trace = 4 + 1 and det = 4·1 − (−2)·1.", "λ² − 5λ + 6 = (λ − 2)(λ − 3)."],
      ["f2", "trace = 1 + 3 and det = 1·3 − 4·2.", "λ² − 4λ − 5 = (λ − 5)(λ + 1)."],
      ["f3", "trace = 1 + 0 and det = 1·0 − 1·1.", "λ² − λ − 1 = 0 gives λ = (1 ± √5)/2."],
      ["f4", "trace = 5 + 1 and det = 5·1 − (−1)·4.", "λ² − 6λ + 9 = (λ − 3)²."]
    ].map(([key, h1, h2]) => [key, [h1, h2, c => {
      const A = c.spec.cards[key].matrix;
      const t = c.ans(key + "-tr"), d = c.ans(key + "-det");
      const roots = [c.ans(key + "-l1"), c.ans(key + "-l2")];
      const values = mxEigen(A).values;
      const answer = values.length === 1 ? [values[0], values[0]] : values;
      if (!mxFits(t, mxTrace(A))) return mxGrade(false, "Recheck the trace: add the two diagonal entries a + d.");
      if (!mxFits(d, mxDet(A))) return mxGrade(false, "The trace is right. Recheck det A = ad − bc.");
      const pass = mxFitsSet(roots, answer);
      const sum = roots[0] + roots[1], product = roots[0] * roots[1];
      return mxGrade(pass, "Your polynomial is right. Your roots add to " + mxFmt(sum) + " and multiply to " + mxFmt(product) +
        ", but they should add to the trace " + mxFmt(t) + " and multiply to det " + mxFmt(d) + ".",
        "det(A − λI) = λ² − " + mxParen(mxTrace(A)) + "λ + " + mxParen(mxDet(A)) + ". " + h2 + " Shortcut check: " +
        answer.map(mxShow).join(" + ") + " = " + mxFmt(mxTrace(A)) + " and " + answer.map(mxShow).join(" × ") + " = " + mxFmt(mxDet(A)) + ".");
    }]]))
  },

  // 10 · Eigen Designer -----------------------------------------------------------------
  designer: {
    defaultCard: "pair",
    cards: {
      pair: { pairs: [[[1, 1], 2], [[1, -1], -1]] },
      null: { pairs: [[[1, 2], 3], [[1, 0], 0]] },
      det: { pairs: [[[2, 1], 3]] },
      repeat: { pairs: [[[1, 1], 2]] }
    },
    start() {},
    actions: {},
    show(c) {
      const A = c.liveMat("m");
      const key = mxCard(c);
      const { pairs } = c.spec.cards[key];
      const arrows = [], lines = [], marks = [];
      for (const [v, value] of pairs) {
        lines.push({ direction: v, color: "eigen", width: 1.6, dashed: true });
        arrows.push(mxArrow(v, "input", mxPair(v)), mxArrow(mxApply(A, v), "output", "A" + mxPair(v), [0, 0], { dashed: true }));
        marks.push(mxMark(scale(v, value), "eigen", "target " + mxShow(value) + "·" + mxPair(v), { shape: "ring" }));
      }
      c.put("state", "A = " + mxMat(A) + " · trace " + mxFmt(mxTrace(A)) + " · det " + mxFmt(mxDet(A)) + " · " +
        pairs.map(([v]) => "A" + mxPair(v) + " = " + mxPair(mxApply(A, v))).join(" · "));
      return {
        desc: "Your matrix " + mxMat(A) + ". Green rings mark where each eigenvector must land. Orange dashed arrows show where your matrix sends it.",
        arrows, lines, marks, min: 3, caption: "Your A = " + mxMat(A)
      };
    },
    checks: (() => {
      const hits = (A, pairs) => pairs.every(([v, value]) => mxNear(mxApply(A, v), scale(v, value)));
      const miss = (A, pairs) => pairs.filter(([v, value]) => !mxNear(mxApply(A, v), scale(v, value)))
        .map(([v, value]) => "A" + mxPair(v) + " = " + mxPair(mxApply(A, v)) + ", but it should be " + mxPair(scale(v, value))).join(". ") + ".";
      return {
        pair: ["A(1, 1) = (2, 2) and A(1, −1) = (1, −1). Adding them gives A(2, 0).",
          "A(2, 0) = (3, 1), so column 1 is (1.5, 0.5). Subtracting gives column 2.",
          c => {
            const A = c.mat("m"), { pairs } = c.spec.cards.pair;
            return mxGrade(hits(A, pairs), miss(A, pairs), "A = " + mxMat(A) + ". A(1, 1) = (2, 2) = 2·(1, 1) and A(1, −1) = (1, −1) = −1·(1, −1). Two eigenpairs fix A completely, so this is the only answer.");
          }],
        null: ["λ = 0 on (1, 0) means the first column is (0, 0).",
          "Then A(1, 2) = 2·(column 2) must equal (3, 6).",
          c => {
            const A = c.mat("m"), { pairs } = c.spec.cards.null;
            return mxGrade(hits(A, pairs), miss(A, pairs), "A = " + mxMat(A) + ". Ae₁ = (0, 0) and A(1, 2) = (3, 6) = 3·(1, 2).");
          }],
        det: ["You need 2a + b = 6 and 2c + d = 3, with ad − bc = −6.",
          "Try a = 3 and b = 0. Then d = 3 − 2c, and det = 3d = −6.",
          c => {
            const A = c.mat("m"), { pairs } = c.spec.cards.det;
            if (!hits(A, pairs)) return mxGrade(false, miss(A, pairs));
            return mxGrade(mxDet(A) === -6, "(2, 1) is an eigenvector with λ = 3. Now adjust the matrix so that det A = −6. Yours is " + mxFmt(mxDet(A)) + ".",
              "A = " + mxMat(A) + ". A(2, 1) = (6, 3) and det A = −6, so the other eigenvalue is −6 ÷ 3 = −2. Many matrices work. This one is yours.");
          }],
        repeat: ["You need trace 4, det 4 and A(1, 1) = (2, 2).",
          "Add any nonzero multiple of [1, −1] [1, −1] to 2I.",
          c => {
            const A = c.mat("m"), { pairs } = c.spec.cards.repeat;
            if (mxNear(A, [2, 0, 0, 2])) return mxGrade(false, "2I has every line as an eigenline. Keep λ = 2 but leave only one eigenline.");
            if (!hits(A, pairs)) return mxGrade(false, miss(A, pairs));
            const pass = mxTrace(A) === 4 && mxDet(A) === 4;
            return mxGrade(pass, "A(1, 1) = (2, 2) is right, but trace " + mxFmt(mxTrace(A)) + " and det " + mxFmt(mxDet(A)) + " give a second eigenvalue. Aim for trace 4 and det 4.",
              "A = " + mxMat(A) + ". det(A − λI) = λ² − 4λ + 4 = (λ − 2)², and A − 2I ≠ 0, so (1, 1) spans the only eigenline.");
          }]
      };
    })()
  },

  // 11 · Repeat Until Aligned ------------------------------------------------------------
  repeat: {
    defaultCard: "settle",
    maxSteps: 24,
    cards: {
      settle: { matrix: [3, 2, 1, 4], start: [1, 0], pick: "yx", factor: 5 },
      flip: { matrix: [-1, 2, 2, -1], start: [1, 0], pick: "ymx", factor: -3 },
      swap: { matrix: [0, 2, 2, 0], start: [1, 0], pick: "alternate" },
      spin: { matrix: [1, -2, 2, 1], start: [1, 0], pick: "turn" },
      slow: { matrix: [3, 2, 1, 4], start: [2, -1], pick: "stay", factor: 2 }
    },
    restart(c) {
      c.s.seq = [[c.live("sx"), c.live("sy")]];
      c.s.queue = 0;
      c.s.t = 0;
      c.s.seqCard = mxCard(c);
    },
    // Apply A once to the newest arrow. Returns false when nothing more can happen.
    advance(c) {
      const last = c.s.seq.at(-1);
      if (c.s.seq.length > c.spec.maxSteps || mxIsZero(last)) return false;
      c.s.seq.push(mxApply(c.spec.cards[c.s.seqCard].matrix, last));
      return true;
    },
    queue(c, steps) {
      if (mxIsZero(c.s.seq[0])) return "Choose a nonzero starting arrow.";
      if (c.s.seq.length > c.spec.maxSteps) return "This run has reached " + c.spec.maxSteps + " steps. Restart to watch again.";
      // With reduced effects, or when the diagram is off screen, jump straight to the result.
      if (c.reduced() || !c.onScreen()) {
        for (let i = 0; i < steps && c.spec.advance(c); i++);
      } else c.s.queue += steps;
      return null;
    },
    start(c) { c.spec.restart(c); },
    edit(c, name) { if (name === "sx" || name === "sy") c.spec.restart(c); },
    flush(c) {
      while (c.s.queue > 0) {
        c.s.queue--;
        if (!c.spec.advance(c)) c.s.queue = 0;
      }
      c.s.t = 0;
    },
    tick(c, dt) {
      if (!c.s.queue) return false;
      c.s.t += dt / 420;
      if (c.s.t >= 1) {
        c.s.t = 0;
        c.s.queue--;
        if (!c.spec.advance(c)) c.s.queue = 0;
      }
      return true;
    },
    actions: {
      load(c, button, check) {
        const { start } = c.spec.cards[check];
        c.set("sx", start[0]);
        c.set("sy", start[1]);
        c.s.live = {};
        c.spec.restart(c);
        return "Loaded the system. Starting arrow " + mxPair(start) + ".";
      },
      step(c) { return c.spec.queue(c, 1); },
      run(c) { return c.spec.queue(c, 8); },
      restart(c) { c.spec.restart(c); return "Restarted at step 0."; }
    },
    show(c) {
      const key = mxCard(c);
      if (c.s.seqCard !== key) {
        const { start } = c.spec.cards[key];
        c.set("sx", start[0]);
        c.set("sy", start[1]);
        c.s.live = {};
        c.spec.restart(c);
      }
      const { matrix } = c.spec.cards[key];
      const rescale = c.checked("rescale");
      const show = v => rescale && !mxIsZero(v) ? scale(v, 2.5 / mxLength(v)) : v;
      const seq = c.s.seq, n = seq.length - 1, last = seq[n];
      const sup = String(n).split("").map(d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]).join("");
      const arrows = [];
      seq.slice(Math.max(0, n - 5), n).forEach((v, i, list) =>
        arrows.push(mxArrow(show(v), "input", "", [0, 0], { opacity: 0.18 + 0.12 * (i + 6 - list.length), width: 2 })));
      let current = show(last);
      if (c.s.t > 0 && c.s.queue > 0) {
        const next = show(mxApply(matrix, last));
        const mix = add(scale(current, 1 - c.s.t), scale(next, c.s.t));
        current = rescale && !mxIsZero(mix) ? scale(mix, 2.5 / mxLength(mix)) : mix;
      }
      arrows.push(mxArrow(current, "output", n ? "A" + sup + "v" : "v"));
      const lines = c.s.revealed[key] ? mxEigen(matrix).lines.map(l => ({ direction: l.direction, color: "eigen", width: 1.6, dashed: true, label: "λ = " + mxShow(l.value) })) : [];
      const ratio = n && mxLength(seq[n - 1]) ? mxLength(last) / mxLength(seq[n - 1]) : null;
      c.put("state", "A = " + mxMat(matrix) + " · step " + n + " · " + (n ? "A" + sup + "v" : "v") + " = " + mxPair(last) +
        (ratio === null ? "" : " · length ratio to the previous step " + mxFmt(ratio)) +
        (mxIsZero(last) ? "" : " · direction " + mxFmt(Math.round(mxDegrees(Math.atan2(last[1], last[0])) * 10) / 10) + "°"));
      return {
        desc: "Step " + n + " of repeatedly applying A = " + mxMat(matrix) + ". The orange arrow is the newest one, and faint blue arrows are the earlier steps" +
          (rescale ? ", all drawn at the same length." : ".") + (lines.length ? " Green dashed lines are the eigenlines." : ""),
        arrows, lines, min: 3, caption: rescale ? "Directions only" : "True lengths"
      };
    },
    checks: Object.fromEntries([
      ["settle", "Find the eigenvalues first: the trace is 7 and the det is 10.", "λ = 5 on (1, 1) and λ = 2 on (2, −1). Which part grows faster?"],
      ["flip", "Here λ = 1 on (1, 1) and λ = −3 on (1, −1).", "|−3| > |1|, so the (1, −1) part wins, and a negative λ flips the arrow each step."],
      ["swap", "The eigenvalues are 2 and −2, which have the same size.", "Apply A twice by hand: (1, 0) → (0, 2) → (4, 0)."],
      ["spin", "trace² − 4 det = 4 − 20 < 0. What does that say about the eigenvalues?", "Complex eigenvalues give no real line to settle on. The arrow keeps rotating."],
      ["slow", "Check whether (2, −1) is already an eigenvector: A(2, −1) = ?", "A(2, −1) = (4, −2). With no (1, 1) part to start with, nothing can grow along y = x."]
    ].map(([key, h1, h2]) => [key, [h1, h2, c => {
      const card = c.spec.cards[key];
      const pick = c.choice(key + "-pick");
      const factorOk = card.factor === undefined || mxFits(c.ans(key + "-factor"), card.factor);
      const pass = pick === card.pick && factorOk;
      const lines = mxEigen(card.matrix).lines;
      return mxGrade(pass, pick !== card.pick ? "That behavior doesn’t match. Run the steps and watch the direction, or compare the sizes of the eigenvalues." :
        "The behavior is right. Recheck the factor per step, including its sign.",
        "A = " + mxMat(card.matrix) + (lines.length ? ". Eigenpairs: " + lines.map(l => "λ = " + mxShow(l.value) + " on " + mxPair(l.direction.map(n => Math.round(n * 1000) / 1000))).join(", ") + "." : " has no real eigenvalues.") + " " + h2);
    }]]))
  },

  // 12 · Eigenbasis Payoff ----------------------------------------------------------------
  payoff: {
    matrix: [7, -8, 4, -5],
    basis: [[2, 1], [1, 1]],
    values: [3, -1],
    v: [5, 3],
    defaultCard: "coords",
    cards: { coords: {}, action: {}, diagonal: {}, cube: {} },
    start() {},
    actions: {},
    show(c) {
      const [b1, b2] = c.spec.basis;
      const v = c.spec.v;
      const plan = { arrows: [mxArrow(b1, "eigen", "b₁ (λ = 3)"), mxArrow(b2, "eigen", "b₂ (λ = −1)"), mxArrow(v, "input", "v (5, 3)")] };
      if (c.checked("showeig")) plan.lattice = { basis: [b1, b2], color: "warp" };
      const parts = ["v = (5, 3)"];
      if (c.s.revealed.coords) {
        plan.arrows.push(mxArrow([4, 2], "eigen", "2b₁", [0, 0], { dashed: true }), mxArrow(v, "eigen", "1b₂", [4, 2], { dashed: true }));
        parts.push("[v]_B = (2, 1)");
      }
      if (c.s.revealed.action) {
        plan.arrows.push(mxArrow([12, 6], "column", "6b₁", [0, 0], { dashed: true }), mxArrow([11, 5], "column", "−1b₂", [12, 6], { dashed: true }),
          mxArrow([11, 5], "output", "Av (11, 5)"));
        parts.push("[Av]_B = (6, −1) · Av = (11, 5)");
      }
      if (c.s.revealed.cube) parts.push("A³v = (107, 53)");
      c.put("state", parts.join(" · "));
      return { ...plan, desc: "Eigenbasis b₁ = (2, 1) with λ = 3 and b₂ = (1, 1) with λ = −1" + (plan.lattice ? ", drawn as a violet grid" : "") + ". " + parts.join(". ") + ".",
        min: 3.4, caption: "Eigenbasis B" };
    },
    checks: {
      coords: ["Solve 2c₁ + c₂ = 5 and c₁ + c₂ = 3.", "Subtract the second equation from the first to get c₁.",
        c => {
          const entry = [c.ans("coords-c1"), c.ans("coords-c2")];
          const pass = mxFitsAll(entry, [2, 1]);
          const back = add(scale([2, 1], entry[0]), scale([1, 1], entry[1]));
          return mxGrade(pass, "Your coordinates rebuild c₁b₁ + c₂b₂ = " + mxPair(back) + ", not (5, 3).",
            "2c₁ + c₂ = 5 and c₁ + c₂ = 3 give c₁ = 2 and c₂ = 1. Check: 2·(2, 1) + 1·(1, 1) = (5, 3).");
        }],
      action: ["Multiply each eigen-coordinate by its own eigenvalue: (3·2, −1·1).", "Then rebuild 6b₁ + (−1)b₂ in standard coordinates.",
        c => {
          const coords = [c.ans("action-c1"), c.ans("action-c2")], out = [c.ans("action-x"), c.ans("action-y")];
          const okCoords = mxFitsAll(coords, [6, -1]), okOut = mxFitsAll(out, [11, 5]);
          return mxGrade(okCoords && okOut, !okCoords ? "Scale c₁ = 2 by λ₁ = 3 and c₂ = 1 by λ₂ = −1." : "[Av]_B is right. Now compute 6·(2, 1) − 1·(1, 1).",
            "[Av]_B = (3·2, −1·1) = (6, −1). Av = 6·(2, 1) − (1, 1) = (11, 5). Direct check: A(5, 3) = (35 − 24, 20 − 15) = (11, 5).");
        }],
      diagonal: ["In B-coordinates, A sends (c₁, c₂) to (3c₁, −c₂).", "A matrix that scales the first slot by 3 and the second by −1 is diagonal.",
        c => {
          const entry = c.ansMat("diagonal");
          const pass = mxFitsAll(entry, [3, 0, 0, -1]);
          return mxGrade(pass, mxFitsAll(entry, [-1, 0, 0, 3]) ? "Keep the order of the basis: b₁ comes first, with λ = 3." : "Write the matrix that turns (c₁, c₂) into (3c₁, −c₂).",
            "D = [3, 0] [0, −1]. In the eigenbasis, A just multiplies each coordinate by its eigenvalue. In standard coordinates A = PDP⁻¹ with P = [2, 1] [1, 1].");
        }],
      cube: ["[A³v]_B = (3³·2, (−1)³·1).", "That is (54, −1). Rebuild 54·(2, 1) − (1, 1).",
        c => {
          const entry = [c.ans("cube-x"), c.ans("cube-y")];
          const pass = mxFitsAll(entry, [107, 53]);
          return mxGrade(pass, "Cube each eigenvalue, scale the eigen-coordinates (2, 1), then convert back to standard coordinates.",
            "[A³v]_B = (27·2, −1·1) = (54, −1). A³v = 54·(2, 1) − (1, 1) = (107, 53). Without the eigenbasis you would multiply A by itself three times.");
        }]
    }
  },

  // 13 · Symmetric Matrices Preview -------------------------------------------------------
  symmetric: {
    defaultCard: "build",
    cards: { sym: { matrix: [2, -2, -2, 5] }, contrast: { matrix: [3, 1, 0, 2] }, build: {}, why: {} },
    start() {},
    edit(c, name) {
      if (!c.checked("mirror")) return;
      if (name === "mb" || name === "mirror") c.set("mc", c.val("mb"));
      else if (name === "mc") c.set("mb", c.val("mc"));
    },
    actions: {
      load(c, button, check) {
        c.field("mirror").checked = false;
        c.writeMat("m", c.spec.cards[check].matrix);
        return "Loaded A = " + mxMat(c.spec.cards[check].matrix) + ".";
      }
    },
    show(c) {
      const A = c.liveMat("m");
      const key = mxCard(c), card = c.spec.cards[key];
      const hide = card.matrix && !c.s.revealed[key] && mxNear(A, card.matrix);
      const eig = mxEigen(A);
      const angle = mxEigenAngle(A);
      const symmetric = A[1] === A[2];
      const lines = eig.lines.map(l => ({ direction: l.direction, color: "eigen", width: 2, dashed: true, label: hide ? "" : "λ = " + mxShow(l.value) }));
      const spectrum = eig.kind === "complex" ? "no real eigenvalues" : eig.kind === "scalar" ? "every line is an eigenline" :
        eig.kind === "repeated" ? "one repeated eigenvalue " + mxShow(eig.values[0]) + " and one eigenline" :
        "eigenvalues " + eig.values.map(mxShow).join(" and ") + " · angle between eigenlines " + mxFmt(Math.round(angle * 100) / 100) + "°";
      c.put("state", "A = " + mxMat(A) + " · " + (symmetric ? "symmetric" : "not symmetric") + " · " +
        (hide ? "eigenvalues and angle hidden until you check" : spectrum));
      return {
        desc: "Eigenlines of A = " + mxMat(A) + " drawn as green dashed lines. " + (hide ? "" : spectrum + "."),
        lines, arrows: [mxArrow(mxColumns(A)[0], "column", "Ae₁", [0, 0], { width: 2 }), mxArrow(mxColumns(A)[1], "column", "Ae₂", [0, 0], { width: 2 })],
        min: 3, caption: symmetric ? "Symmetric" : "Not symmetric"
      };
    },
    checks: {
      sym: ["det(A − λI) = λ² − 7λ + 6.", "The eigenvectors are (1, −2) and (2, 1). Take their dot product.",
        c => {
          const pass = mxFitsSet([c.ans("sym-l1"), c.ans("sym-l2")], [6, 1]) && mxFits(c.ans("sym-angle"), 90);
          return mxGrade(pass, "Check the eigenvalues with trace 7 and det 6, then measure the angle between the green lines.",
            "λ = 6 on (1, −2) and λ = 1 on (2, 1). (1, −2)·(2, 1) = 2 − 2 = 0, so the eigenlines meet at 90°.");
        }],
      contrast: ["The eigenvalues are 3 and 2. λ = 3 has eigenvector (1, 0).", "For λ = 2, A − 2I = [1, 1] [0, 0], giving (1, −1).",
        c => {
          const pass = mxFits(c.ans("contrast-angle"), 45);
          return mxGrade(pass, "Find the angle between (1, 0) and the second eigenvector.",
            "Eigenvectors (1, 0) and (1, −1). cos θ = 1/√2, so θ = 45°. Without symmetry, the eigenlines need not be perpendicular.");
        }],
      build: ["Tick “Keep b and c equal”, then pick any nonzero b.", "Read the angle from the readout. It is the same for every symmetric choice with distinct eigenvalues.",
        c => {
          const A = c.mat("m");
          if (A[1] !== A[2]) return mxSetup("Your matrix is not symmetric. Make b equal to c.");
          if (A[1] === 0) return mxSetup("With b = c = 0 the eigenlines are just the axes. Choose b ≠ 0.");
          const angle = mxEigenAngle(A);
          return mxGrade(mxFits(c.ans("build-angle"), 90) && Math.abs(angle - 90) < 1e-6, "Look at the green lines and the readout again.",
            "A = " + mxMat(A) + " has eigenvalues " + mxEigen(A).values.map(mxShow).join(" and ") + ", and its eigenlines meet at 90°.");
        }],
      why: ["The eigenvalues are (trace ± √discriminant)/2.", "When can a square root fail to be real?",
        c => {
          const pass = c.choice("why-reason") === "square";
          return mxGrade(pass, "Look at the form of (a − d)² + 4b². Can it ever be negative?",
            "(a − d)² ≥ 0 and 4b² ≥ 0, so the discriminant is never negative and both eigenvalues are real. Lesson 14 extends this to Hermitian matrices.");
        }]
    }
  },

  // 14 · Rotation Has No Real Eigenvectors ---------------------------------------------------
  rotation: {
    defaultCard: "perp",
    cards: { perp: {}, roots: {}, vector: {}, half: {}, sixty: {} },
    start(c) { c.s.theta = Number(c.val("theta")); },
    edit(c, name) { if (name === "theta") c.s.theta = c.live("theta"); },
    actions: {},
    show(c) {
      const t = c.s.theta;
      const clean = n => Math.abs(n) < 1e-12 ? 0 : n;
      const [cos, sin] = mxPolar(t).map(clean);
      const R = [cos, -sin, sin, cos];
      const arrows = [];
      for (let k = 0; k < 8; k++) {
        const v = scale(mxPolar(k * 45), 1.6);
        arrows.push(mxArrow(v, "input", "", [0, 0], { opacity: 0.4, width: 1.6 }), mxArrow(mxApply(R, v), "output", "", [0, 0], { dashed: true, opacity: 0.55, width: 1.6 }));
      }
      const v = scale(mxPolar(20), 2.4);
      arrows.push(mxArrow(v, "input", "v"), mxArrow(mxApply(R, v), "output", "Av", [0, 0], { dashed: true }));
      if (mxCard(c) === "perp") {
        const mine = [c.live("perp-x"), c.live("perp-y")];
        arrows.push(mxArrow(mine, "column", "your v"), mxArrow(mxApply([0, -1, 1, 0], mine), "column", "quarter-turn of your v", [0, 0], { dashed: true }));
      }
      const real = sin === 0;
      c.put("state", "θ = " + mxFmt(t) + "° · A = " + mxMat(R) + " · " + (real ? "every line is an eigenline again" : "no real eigenlines"));
      return {
        desc: "Eight sample inputs (blue) and their outputs (dashed orange) under rotation by " + mxFmt(t) + "°. " + (real ? "Every output stays on its input’s line." : "Every output leaves its input’s line."),
        arrows, arcs: t === 0 ? [] : [{ start: 20 * Math.PI / 180, sweep: t * Math.PI / 180, radius: 46, color: "column", label: "θ" }],
        min: 3, caption: "θ = " + mxFmt(t) + "°"
      };
    },
    checks: {
      perp: ["The quarter-turn sends (x, y) to (−y, x).", "v · Av = x(−y) + y(x).",
        c => {
          const v = [c.num("perp-x"), c.num("perp-y")];
          if (mxIsZero(v)) return mxSetup("Choose a nonzero v.");
          const Av = mxApply([0, -1, 1, 0], v), dot = mxDot(v, Av);
          const pass = mxFits(c.ans("perp-dot"), dot) && c.choice("perp-why") === "perp";
          return mxGrade(pass, mxFits(c.ans("perp-dot"), dot) ? "Your dot product is right. What does a zero dot product say about the two arrows?" :
            "Compute Av = " + mxPair(Av) + " and then v · Av.",
            "Av = " + mxPair(Av) + " and v · Av = " + mxTimes(v[0], Av[0]) + " + " + mxTimes(v[1], Av[1]) + " = 0. Every output is perpendicular to its input, so Av can never equal λv for a real λ.");
        }],
      roots: ["λ² = −1 has no real solution.", "In Lesson 6, i² = −1. The roots are 0 + 1i and 0 − 1i.",
        c => {
          const r = [c.ans("roots-r1"), c.ans("roots-r2")], im = [c.ans("roots-i1"), c.ans("roots-i2")];
          const pass = mxFits(r[0], 0) && mxFits(r[1], 0) && mxFitsSet(im, [1, -1]);
          return mxGrade(pass, "Each root squares to −1. Its real part is 0, and the two imaginary parts are opposites.",
            "λ² + 1 = (λ − i)(λ + i), so λ = i or λ = −i. They are complex conjugates.");
        }],
      vector: ["Av = (−z, 1) and iv = (i, iz). Match the first components.", "−z = i gives z = −i. Check the second: i·(−i) = 1.",
        c => {
          const z = [c.ans("vector-zr"), c.ans("vector-zi")];
          const cmul = ([a, b], [p, q]) => [a * p - b * q, a * q + b * p];
          const Av = [[-z[0], -z[1]], [1, 0]];
          const iv = [[0, 1], cmul([0, 1], z)];
          const pass = Av.every((w, k) => mxFitsAll(w, iv[k]));
          return mxGrade(pass, "With your z, Av = (" + mxShow(Av[0][0]) + " + " + mxShow(Av[0][1]) + "i, 1) but iv = (i, " + mxShow(iv[1][0]) + " + " + mxShow(iv[1][1]) + "i).",
            "v = (1, −i). Av = (i, 1) and iv = (i, −i²) = (i, 1). They match, so (1, −i) is a complex eigenvector with λ = i.");
        }],
      half: ["Which nonzero rotation turns every arrow onto its own line?", "A half-turn sends v to −v.",
        c => {
          if (Math.abs(c.s.theta) !== 180) return mxSetup("Move the slider to the nonzero angle where every output lies on its input’s line.");
          return mxGrade(mxFits(c.ans("half-l"), -1), "The output has the same length and points the opposite way.",
            "Rotation by 180° is [−1, 0] [0, −1] = −I. Every nonzero v satisfies Av = −v, so λ = −1 for every line.");
        }],
      sixty: ["cos 60° = 1/2.", "sin 60° = √3/2. Either sign of the imaginary part is fine.",
        c => {
          const pass = mxFits(c.ans("sixty-re"), 0.5) && mxFits(Math.abs(c.ans("sixty-im")), Math.sqrt(3) / 2);
          return mxGrade(pass, "Use cos 60° for the real part and ±sin 60° for the imaginary part.",
            "λ = 1/2 ± (√3/2)i = cos 60° ± i sin 60°. Its magnitude is 1 and its angle is ±60°. Multiplying by λ turns a complex number by 60°, exactly as in Lesson 6.");
        }]
    }
  },

  // 15 · 3D Axis Finder ------------------------------------------------------------------------
  axis: {
    defaultCard: "z90",
    cards: {
      z90: { rows: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], lambda: 1, axis: [0, 0, 1] },
      cycle: { rows: [[0, 0, 1], [1, 0, 0], [0, 1, 0]], lambda: 1, axis: [1, 1, 1], angle: 120 },
      half: { rows: [[0, 1, 0], [1, 0, 0], [0, 0, -1]], lambda: 1, axis: [1, 1, 0] },
      mirror: { rows: [[0, 1, 0], [1, 0, 0], [0, 0, 1]], lambda: -1, axis: [1, -1, 0] }
    },
    start(c) {
      c.s.yaw = Number(c.val("yaw"));
      c.s.tilt = Number(c.val("tilt"));
      c.s.tested = {};
    },
    edit(c, name) {
      if (name === "yaw") c.s.yaw = c.live("yaw");
      else if (name === "tilt") c.s.tilt = c.live("tilt");
      else delete c.s.tested[name.split("-")[0]];
    },
    drag(c, dx, dy) {
      c.s.yaw = mxWrapDegrees(c.s.yaw - dx * 0.5);
      c.s.tilt = Math.min(80, Math.max(-10, c.s.tilt + dy * 0.4));
    },
    tick(c, dt) {
      if (!c.checked("spin")) return false;
      c.s.yaw = mxWrapDegrees(c.s.yaw + dt * 0.012);
      return true;
    },
    actions: {
      test(c, button, check) {
        const v = MX_XYZ.map(axis => c.ans(check + "-" + axis));
        if (mxIsZero(v)) return "The zero vector lies on every axis, so it can’t identify one. Enter a nonzero vector.";
        c.s.tested[check] = v;
        const Av = mxApply3(c.spec.cards[check].rows, v);
        return "A sends " + mxPair(v) + " to " + mxPair(Av) +
          (mxNear(Av, v) ? ", the same arrow." : mxNear(Av, mxScale3(v, -1)) ? ", the reversed arrow." : ". That is a different direction.");
      }
    },
    show(c) {
      const key = mxCard(c);
      const { rows } = c.spec.cards[key];
      const names = ["e₁", "e₂", "e₃"];
      const vectors = [];
      for (let j = 0; j < 3; j++) {
        const e = [0, 0, 0];
        e[j] = 1;
        vectors.push({ v: e, color: "dim", label: names[j], faint: true }, { v: rows.map(row => row[j]), color: "column", label: "A" + names[j] });
      }
      const tested = c.s.tested[key];
      const lines = [];
      if (tested) {
        const Av = mxApply3(rows, tested);
        vectors.push({ v: tested, color: "input", label: "v" }, { v: Av, color: "output", label: "Av" });
        lines.push({ direction: tested, color: "input" });
      }
      if (c.s.revealed[key]) lines.push({ direction: c.spec.cards[key].axis, color: "eigen", label: key === "mirror" ? "flip axis" : "axis" });
      c.put("state", "A = " + mxMat3(rows) + (tested ? " · v = " + mxPair(tested) + " ↦ Av = " + mxPair(mxApply3(rows, tested)) : ""));
      return {
        space: true, yaw: c.s.yaw, tilt: c.s.tilt, vectors, lines, caption: "3D view",
        desc: "3D view of A = " + mxMat3(rows) + ". Faint arrows are e₁, e₂ and e₃. Yellow arrows are their images, the columns of A." +
          (tested ? " Your test vector v = " + mxPair(tested) + " goes to Av = " + mxPair(mxApply3(rows, tested)) + "." : "")
      };
    },
    checks: Object.fromEntries([
      ["z90", "Which standard arrow is its own image? Compare each eᵢ with its column.", "Column 3 is (0, 0, 1) = e₃, so e₃ doesn’t move."],
      ["cycle", "The shuffle sends (x, y, z) to (z, x, y). Which vectors are unchanged?", "Any vector with x = y = z works. trace A = 0 = 1 + 2cos θ."],
      ["half", "Solve (A − I)v = 0: −x + y = 0 and −2z = 0.", "x = y and z = 0, so the axis is along (1, 1, 0)."],
      ["mirror", "A swaps x and y and keeps z. Which arrow is reversed by a swap?", "(1, −1, 0) becomes (−1, 1, 0) = −(1, −1, 0)."]
    ].map(([key, h1, h2]) => [key, [h1, h2, c => {
      const card = c.spec.cards[key];
      const v = MX_XYZ.map(axis => c.ans(key + "-" + axis));
      if (mxIsZero(v)) return mxGrade(false, "The zero vector can’t name a direction. Enter a nonzero vector.");
      const Av = mxApply3(card.rows, v);
      const onAxis = mxNear(Av, mxScale3(v, card.lambda), 1e-6);
      if (!onAxis) return mxGrade(false, "A sends your v = " + mxPair(v) + " to " + mxPair(Av) + ", which is not " + (card.lambda === 1 ? "v itself." : "−v."));
      if (card.angle !== undefined && !mxFits(c.ans(key + "-angle"), card.angle)) {
        return mxGrade(false, "The axis is right. Now find the angle. Watch e₁ → e₂ → e₃ around the axis, or use trace A = 1 + 2cos θ.");
      }
      return mxGrade(true, "", "A" + mxPair(v) + " = " + mxPair(Av) + (card.lambda === 1 ? " = v, so v spans the axis with λ = 1. " : " = −v, so λ = −1. ") + h2);
    }]]))
  },

  // 16 · Quantum Matrix Preview ------------------------------------------------------------------
  quantum: {
    defaultCard: "z",
    cards: { z: {}, plus: {}, minus: {}, swap: {}, cross: {} },
    ops: { z: { name: "σz", matrix: [1, 0, 0, -1] }, x: { name: "σx", matrix: [0, 1, 1, 0] } },
    states: {
      0: { name: "|0⟩", v: [1, 0] },
      1: { name: "|1⟩", v: [0, 1] },
      p: { name: "|+⟩", v: [Math.SQRT1_2, Math.SQRT1_2] },
      m: { name: "|−⟩", v: [Math.SQRT1_2, -Math.SQRT1_2] }
    },
    start() {},
    actions: {},
    show(c) {
      const op = c.spec.ops[c.val("op")] ?? c.spec.ops.z;
      const state = c.spec.states[c.val("state")] ?? c.spec.states[0];
      const out = mxApply(op.matrix, state.v);
      const known = Object.values(c.spec.states).map(s => mxNear(out, s.v) ? "= " + s.name : mxNear(out, scale(s.v, -1)) ? "= −" + s.name : null).find(Boolean);
      const key = mxCard(c);
      const hide = c.cards.get(key).open && !c.s.revealed[key];
      const coords = v => "(" + v.map(n => Math.abs(Math.abs(n) - Math.SQRT1_2) < 1e-9 ? (n < 0 ? "−" : "") + "1/√2" : mxFmt(n)).join(", ") + ")";
      c.put("state", hide ? op.name + " applied to " + state.name + " = " + coords(state.v) + ". Work out the output from the matrix, then compare it with the dashed arrow." :
        op.name + state.name + " = " + coords(out) + " " + (known ?? ""));
      const lines = c.checked("showx") ? [{ direction: [1, 1], color: "warp", width: 1.4, dashed: true, label: "|+⟩" }, { direction: [1, -1], color: "warp", width: 1.4, dashed: true, label: "|−⟩" }] : [];
      return {
        desc: op.name + " acting on " + state.name + ". The blue arrow is the state and the dashed orange arrow is the output" + (hide ? "." : " " + coords(out) + "."),
        lines, arrows: [mxArrow(state.v, "input", state.name), mxArrow(out, "output", op.name + state.name, [0, 0], { dashed: true })],
        axisNames: ["|0⟩", "|1⟩"], min: 1.4, gridStep: 0.5, caption: op.name
      };
    },
    checks: {
      z: ["σz(1, 0) = (1, 0).", "σz(0, 1) = (0, −1) = −1·(0, 1).",
        c => mxGrade(mxFits(c.ans("z-l0"), 1) && mxFits(c.ans("z-l1"), -1), "Apply [1, 0] [0, −1] to each state and compare the output with the input.",
          "σz|0⟩ = |0⟩, so λ = +1. σz|1⟩ = −|1⟩, so λ = −1. The z basis is the eigenbasis of σz.")],
      plus: ["σx swaps the two coordinates.", "Swapping (1/√2, 1/√2) changes nothing.",
        c => {
          const pass = mxFitsAll([c.ans("plus-x"), c.ans("plus-y")], [Math.SQRT1_2, Math.SQRT1_2]) && mxFits(c.ans("plus-l"), 1);
          return mxGrade(pass, "Swap the coordinates of |+⟩ = (1/√2, 1/√2), then compare with |+⟩.",
            "σx|+⟩ = (1/√2, 1/√2) = |+⟩, so λ = +1.");
        }],
      minus: ["Swap the coordinates of (1/√2, −1/√2).", "(−1/√2, 1/√2) = −1·(1/√2, −1/√2).",
        c => {
          const pass = mxFitsAll([c.ans("minus-x"), c.ans("minus-y")], [-Math.SQRT1_2, Math.SQRT1_2]) && mxFits(c.ans("minus-l"), -1);
          return mxGrade(pass, "Swap the coordinates of |−⟩ = (1/√2, −1/√2), then compare with |−⟩.",
            "σx|−⟩ = (−1/√2, 1/√2) = −|−⟩, so λ = −1. The x basis is the eigenbasis of σx.");
        }],
      swap: ["σx(1, 0) = (0, 1).", "Is (0, 1) a multiple of (1, 0)?",
        c => mxGrade(c.choice("swap-why") === "swap", "Compare σx|0⟩ with |0⟩. Does the output lie on the same line?",
          "σx|0⟩ = |1⟩, which is perpendicular to |0⟩, so |0⟩ is not an eigenvector of σx.")],
      cross: ["σz(1/√2, 1/√2) = (1/√2, −1/√2).", "That is |−⟩. Is it a multiple of |+⟩?",
        c => mxGrade(c.choice("cross-why") === "turn", "Compare σz|+⟩ with |+⟩. Is the output on the same line?",
          "σz|+⟩ = |−⟩, which is perpendicular to |+⟩, so |+⟩ is not an eigenvector of σz. Each matrix scales its own eigenbasis and mixes the other.")]
    }
  }
};

// ---------------------------------------------------------------------------
// Arcade runtime: one shared figure moves into the active station.
// ---------------------------------------------------------------------------

function mxLabelText(field) {
  const label = field.closest("label");
  if (!label) return "the selected input";
  const copy = label.cloneNode(true);
  copy.querySelectorAll("input, select, textarea").forEach(node => node.remove());
  return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
}

class MxFieldError extends Error {
  constructor(field, detail = "", custom = false) {
    super("Check " + mxLabelText(field) + "." + (detail ? " " + detail : ""));
    this.field = field;
    this.detail = detail;
    this.custom = custom;
  }
}

// Write text, turning "[v]_B" into [v]<sub>B</sub> to match the lesson's notation.
function mxRich(element, text) {
  text = String(text ?? "");
  if (!element || element.dataset.mxText === text) return;
  element.dataset.mxText = text;
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
const mxPlain = text => String(text).replace(/\]_([A-Za-z])/g, "]$1");
function mxSetPlain(element, text) {
  const plain = mxPlain(text);
  if (element.textContent !== plain) element.textContent = plain;
}

function mxPalette(root) {
  const css = getComputedStyle(root);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    input: read("--matrix-input", "#65b7ff"),
    output: read("--matrix-output", "#ff9f55"),
    eigen: read("--matrix-eigen", "#63f59b"),
    warp: read("--matrix-grid", "#c19bff"),
    column: read("--matrix-column", "#ffe16a"),
    axis: read("--matrix-axis", "#b6c5d5"),
    grid: read("--matrix-reference", "#39485c"),
    plot: read("--matrix-plot", "#080e18"),
    ink: read("--ink", "#ecfff1"),
    bad: read("--red", "#ff676f"),
    dim: "#56677d"
  };
}

function initializeMatrixArcade(root) {
  const details = root.querySelector("#matrix-arcade");
  if (!details) return;
  const get = id => root.querySelector("#mx-" + id);
  const select = get("station"), resetButton = get("reset"), status = get("status");
  const reducedBox = get("reduced"), progress = get("progress");
  const figure = get("figure-template").content.firstElementChild.cloneNode(true);
  const toolTemplate = get("mission-template");
  const viewport = figure.querySelector("#mx-viewport");
  const canvas = figure.querySelector("#mx-canvas");
  const svg = figure.querySelector("#mx-diagram");
  const geometry = figure.querySelector("[data-mx-geometry]");
  const labelLayer = figure.querySelector("[data-mx-labels]");
  const desc = figure.querySelector("#mx-desc");
  const title = figure.querySelector("#mx-title");
  const renderStatus = figure.querySelector("#mx-render-status");
  const colors = mxPalette(root);
  const lifetime = new AbortController();
  const listen = (node, type, handler, options = {}) =>
    node.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
  const panels = new Map(), cards = new Map(), completion = new Set();
  let active = null, plan = null, drawing = null;
  let graphics = null, loading = false, contextLost = false, disposed = false;
  let frame = null, lastTick = null, drag = null;

  const say = message => mxRich(status, message ?? "");
  const updateProgress = () => mxRich(progress, completion.size + " of " + cards.size + " missions completed this session.");
  const lastOpenCard = c => [...c.cards].filter(([, card]) => card.open).map(([check]) => check).at(-1) ?? null;

  function onScreen() {
    if (!details.open || document.hidden || !viewport.isConnected) return false;
    const box = viewport.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
  }

  for (const panel of root.querySelectorAll("#mx-panels [data-mx-station]")) {
    const key = panel.dataset.mxStation;
    const spec = mxStations[key];
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
        throw new MxFieldError(input);
      },
      ans(name) {
        const input = field(name);
        const value = mxParse(input.value);
        if (value === null) throw new MxFieldError(input, "Enter a number such as 2, −1.5, 1/3, 1/√2 or (1 + √5)/2.", true);
        return value;
      },
      choice(name) {
        const input = field(name);
        if (!input.value) throw new MxFieldError(input, "Choose an option.");
        return input.value;
      },
      mat: prefix => MX_ENTRIES.map(k => c.num(prefix + k)),
      ansMat: prefix => MX_ENTRIES.map(k => c.ans(prefix + "-" + k)),
      // Read a number for drawing; keep the last valid value while an input is mid-edit.
      live(name) {
        const input = field(name);
        c.s.live ??= {};
        if (input.validity.valid && Number.isFinite(input.valueAsNumber)) c.s.live[name] = input.valueAsNumber;
        return c.s.live[name] ?? (Number(c.defaults.get(name)) || 0);
      },
      liveMat: prefix => MX_ENTRIES.map(k => c.live(prefix + k)),
      set(name, value) { field(name).value = String(value); },
      writeMat(prefix, matrix) { MX_ENTRIES.forEach((k, i) => c.set(prefix + k, matrix[i])); },
      put(name, text) { mxRich(c.node('[data-mx-read="' + name + '"]'), text); },
      reduced,
      onScreen
    };
    for (const card of panel.querySelectorAll("[data-mx-mission]")) {
      const id = card.dataset.mxMission;
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
    c.s = { card: lastOpenCard(c), revealed: {} };
    c.spec.start(c);
  }

  function rebuild() {
    if (!active || !details.open) return;
    plan = active.spec.show(active);
    mxSetPlain(title, active.title + (plan.caption ? " · " + plan.caption : ""));
    mxSetPlain(desc, plan.desc);
    drawing = plan.space ? mxBuildSpace(plan) : mxBuildFlat(plan);
    mxPaintSvg(drawing, geometry, labelLayer, colors);
  }

  function refresh() {
    rebuild();
    requestDraw();
  }

  function showSvg(message) {
    viewport.dataset.renderer = "svg";
    canvas.hidden = true;
    if (message) mxRich(renderStatus, message);
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
      mxRich(renderStatus, drawing.space
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
    mxRich(renderStatus, "SVG diagram. Loading the WebGL view.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (disposed) return;
      graphics = mxCreateGraphics(THREE, canvas, colors);
      requestDraw();
    } catch {
      graphics = null;
      showSvg("WebGL is unavailable here, so the diagram uses SVG.");
    } finally {
      loading = false;
    }
  }

  function mount() {
    active = panels.get(select.value) ?? panels.values().next().value;
    for (const c of panels.values()) c.panel.hidden = c !== active;
    active.node("[data-mx-plot-slot]").append(figure);
    viewport.dataset.space = active.spec.drag ? "true" : "false";
    viewport.dataset.point = active.spec.point ? "true" : "false";
    refresh();
  }

  function clearCard(card) {
    mxRich(card.querySelector("[data-mx-feedback]"), "");
    const work = card.querySelector("[data-mx-work]");
    work.hidden = true;
    work.open = false;
  }

  function showGrade(mission, result) {
    const { card, id, check } = mission;
    const work = card.querySelector("[data-mx-work]");
    mxRich(card.querySelector("[data-mx-feedback]"),
      result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
    mxRich(card.querySelector("[data-mx-work-text]"), result.work || "");
    work.hidden = !result.work;
    work.open = Boolean(result.work) && !result.pass;
    if (result.pass) active.s.revealed[check] = true;
    if (result.pass && !completion.has(id)) {
      completion.add(id);
      card.querySelector("[data-mx-done]").hidden = false;
      updateProgress();
    }
    say("");
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !active || !active.panel.contains(button) || button.disabled) return;
    const missionCard = button.closest("[data-mx-mission]");
    const mission = missionCard ? cards.get(missionCard.dataset.mxMission) : null;
    const action = button.dataset.mxAction;
    try {
      if (action) {
        const message = active.spec.actions[action](active, button, mission?.check ?? null);
        if (mission) mxRich(mission.card.querySelector("[data-mx-feedback]"), message ?? "");
        else if (message !== null) say(message);
      } else if (mission && button.hasAttribute("data-mx-check")) {
        showGrade(mission, active.spec.checks[mission.check][2](active));
      } else if (mission && button.hasAttribute("data-mx-hint")) {
        if (mission.hints >= 2) return;
        const list = mission.card.querySelector("[data-mx-hint-list]");
        const item = document.createElement("li");
        mxRich(item, active.spec.checks[mission.check][mission.hints]);
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
      if (!(error instanceof MxFieldError)) throw error;
      if (mission) mxRich(mission.card.querySelector("[data-mx-feedback]"), error.message);
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
    const missionCard = target.closest("[data-mx-mission]");
    if (missionCard) clearCard(missionCard);
    active.spec.edit?.(active, target.name, event.type);
    refresh();
  }

  // Point at the diagram (Eigen Hunter) or drag to turn the 3D view (Axis Finder).
  function svgPoint(event) {
    const box = svg.getBoundingClientRect();
    const k = Math.min(box.width / MX_SIZE[0], box.height / MX_SIZE[1]);
    return [(event.clientX - box.left - (box.width - MX_SIZE[0] * k) / 2) / k,
      (event.clientY - box.top - (box.height - MX_SIZE[1] * k) / 2) / k];
  }
  listen(viewport, "pointerdown", event => {
    if (!active || event.button > 0) return;
    if (active.spec.point) {
      drag = { id: event.pointerId, point: true };
      viewport.setPointerCapture?.(event.pointerId);
      active.spec.point(active, svgPoint(event));
      refresh();
      return;
    }
    if (!active.spec.drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
    viewport.setPointerCapture?.(event.pointerId);
  });
  listen(viewport, "pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.point) {
      active.spec.point?.(active, svgPoint(event));
      refresh();
      return;
    }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    active.spec.drag?.(active, dx, drag.touch ? 0 : dy);
    refresh();
  });
  const endDrag = event => { if (drag && event.pointerId === drag.id) drag = null; };
  listen(viewport, "pointerup", endDrag);
  listen(viewport, "pointercancel", endDrag);

  listen(details, "click", handleClick);
  listen(details, "input", handleEdit);
  listen(details, "change", handleEdit);
  listen(details, "toggle", () => {
    if (details.open) {
      loadGraphics();
      refresh();
    } else cancelDraw();
  });
  listen(select, "change", () => {
    say("");
    mount();
  });
  listen(resetButton, "click", () => {
    resetModel(active);
    for (const card of active.cards.values()) clearCard(card);
    say("Station settings reset. Completed missions stay counted for this session.");
    refresh();
  });
  const settle = () => {
    for (const c of panels.values()) c.spec.flush?.(c);
    refresh();
  };
  listen(reducedBox, "change", settle);
  if (motionQuery?.addEventListener) listen(motionQuery, "change", settle);
  listen(root.querySelector("#mx-arcade-link"), "click", () => { details.open = true; });

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestDraw()) : null;
  observer?.observe(viewport);
  // Resume animations when the diagram scrolls back into view.
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
  if (location.hash === "#matrix-arcade") details.open = true;
  if (details.open) loadGraphics();
}

// ---------------------------------------------------------------------------
// Flat diagrams: build one list of shapes in SVG pixels, then paint it with
// SVG (fallback) or WebGL (main renderer). Labels always stay in SVG.
// ---------------------------------------------------------------------------

// Smallest "nice" grid step (0.25, 0.5, then 1, 2 or 5 × 10ⁿ) that is at least the given size,
// so the number of grid lines stays bounded however large the diagram gets.
function mxNiceStep(minimum) {
  if (minimum <= 0.25) return 0.25;
  if (minimum <= 0.5) return 0.5;
  const power = 10 ** Math.floor(Math.log10(minimum));
  return [1, 2, 5, 10].map(m => m * power).find(step => step >= minimum - 1e-12);
}

function mxBuildFlat(plan) {
  const [W, H] = MX_SIZE, [CX, CY] = MX_CENTER;
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
  function head(tip, from, color, layer, size = 12, opacity = 1) {
    const d = difference(tip, from), length = Math.hypot(...d);
    if (length < 4) return tip;
    const u = scale(d, 1 / length), n = [-u[1], u[0]];
    const base = difference(tip, scale(u, Math.min(size, length * 0.6)));
    const wing = Math.min(size, length * 0.6) * 0.45;
    fill(layer, [tip, add(base, scale(n, wing)), difference(base, scale(n, wing))], color, opacity);
    return add(base, scale(u, 2));
  }

  // Standard reference grid and axes.
  if (plan.grid !== false) {
    const g = plan.gridStep ?? mxNiceStep(15 / k);
    for (let i = Math.ceil(-hx / g); i <= Math.floor(hx / g); i++) stroke(0, [map([i * g, -hy]), map([i * g, hy])], "grid", 1);
    for (let i = Math.ceil(-hy / g); i <= Math.floor(hy / g); i++) stroke(0, [map([-hx, i * g]), map([hx, i * g])], "grid", 1);
    const labelStep = g * ([1, 2, 5].find(m => g * m * k >= 44) ?? mxNiceStep(44 / (g * k)));
    for (let i = Math.ceil(-hx / labelStep); i <= Math.floor(hx / labelStep); i++) {
      if (i === 0 || Math.abs(i * labelStep) > hx - 0.4 * labelStep) continue;
      const [x, y] = map([i * labelStep, 0]);
      stroke(4, [[x, y - 4], [x, y + 4]], "axis", 1.2);
      label(mxFmt(i * labelStep), [x, y], "axis", [-5, 17], true);
    }
    for (let i = Math.ceil(-hy / labelStep); i <= Math.floor(hy / labelStep); i++) {
      if (i === 0 || Math.abs(i * labelStep) > hy - 0.4 * labelStep) continue;
      const [x, y] = map([0, i * labelStep]);
      stroke(4, [[x - 4, y], [x + 4, y]], "axis", 1.2);
      label(mxFmt(i * labelStep), [x, y], "axis", [-26, 5], true);
    }
  }
  if (plan.axes !== false) {
    const [xName, yName] = plan.axisNames ?? ["x", "y"];
    const xEnd = map([hx, 0]), yEnd = map([0, hy]);
    stroke(4, [map([-hx, 0]), head(xEnd, map([-hx, 0]), "axis", 4, 9)], "axis", 1.4);
    stroke(4, [map([0, -hy]), head(yEnd, map([0, -hy]), "axis", 4, 9)], "axis", 1.4);
    label(xName, xEnd, "axis", [-14 - 7 * Math.max(0, xName.length - 1), -8], true);
    label(yName, yEnd, "axis", [8, 12], true);
  }

  // Warped grid: lines through whole-number multiples of two image columns.
  if (plan.lattice) {
    const { basis: [b1, b2], color = "warp" } = plan.lattice;
    const D = mxCross2(b1, b2);
    if (D !== 0) {
      const corners = [[-hx, -hy], [-hx, hy], [hx, -hy], [hx, hy]].map(p => [mxCross2(p, b2) / D, mxCross2(b1, p) / D]);
      const span = i => [Math.ceil(Math.min(...corners.map(p => p[i]))), Math.floor(Math.max(...corners.map(p => p[i])))];
      const [lo1, hi1] = span(0), [lo2, hi2] = span(1);
      if (hi2 - lo2 <= 90) for (let n = lo2; n <= hi2; n++) {
        const line = clip(scale(b2, n), b1);
        if (line) stroke(1, line.map(map), color, n === 0 ? 1.8 : 1, { dashed: true });
      }
      if (hi1 - lo1 <= 90) for (let n = lo1; n <= hi1; n++) {
        const line = clip(scale(b1, n), b2);
        if (line) stroke(1, line.map(map), color, n === 0 ? 1.8 : 1, { dashed: true });
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
      const piece = clip(p.points[i - 1], difference(p.points[i], p.points[i - 1]), 0, 1);
      if (!piece) continue;
      const [a, b] = piece.map(map);
      if (!coords.length || Math.hypot(...difference(coords.at(-1), a)) > 0.5) {
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
    const direction = difference(a.to, a.from);
    const opacity = a.opacity ?? 1;
    if (Math.hypot(...direction) < 1e-9) {
      if (inside(a.to)) shapes.push({ kind: "dot", layer, at: map(a.to), r: 4, color: a.color });
      if (a.label) label(a.label + " = 0", map(a.to), a.color);
      continue;
    }
    const segment = clip(a.from, direction, 0, 1);
    if (!segment) continue;
    let [start, end] = segment.map(map);
    if (inside(a.to)) end = head(map(a.to), start, a.color, layer, a.dashed ? 11 : 13, opacity);
    stroke(layer, [start, end], a.color, a.width ?? (a.dashed ? 2.6 : 3), { dashed: a.dashed, glow: !a.dashed && opacity === 1, opacity: a.opacity });
    if (a.label) {
      if (a.dashed) {
        const mid = scale(add(start, end), 0.5);
        const d = difference(end, start), n = Math.hypot(...d) || 1;
        label(a.label, mid, a.color, [(-d[1] / n) * 14 - 10, (d[0] / n) * 14 + 4]);
      } else label(a.label, map(inside(a.to) ? a.to : segment[1]), a.color);
    }
  }
  for (const m of plan.marks ?? []) {
    if (!inside(m.at)) continue;
    const at = map(m.at);
    const shape = m.shape ?? "dot";
    shapes.push({
      kind: "dot", layer: 8, at, color: m.color,
      r: m.r ?? (shape === "ring" ? 7 : 4.8),
      hollow: shape === "ring"
    });
    label(m.label, at, m.color, m.offset ?? [10, -10]);
  }
  return { shapes, names, scale: k };
}

function mxSvgNode(name, attributes, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
}

function mxPaintSvg(drawing, geometry, labelLayer, colors) {
  const points = coords => coords.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
  const nodes = [...drawing.shapes].sort((a, b) => a.layer - b.layer).map(shape => {
    if (shape.kind === "stroke") {
      return mxSvgNode("polyline", {
        points: points(shape.coords), fill: "none", stroke: colors[shape.color], "stroke-width": shape.width,
        "stroke-linecap": "round", "stroke-linejoin": "round",
        "stroke-dasharray": shape.dashed ? "6 5" : null, "stroke-opacity": shape.opacity ?? null
      });
    }
    if (shape.kind === "fill") {
      return mxSvgNode("polygon", {
        points: points(shape.coords), fill: colors[shape.color],
        "fill-opacity": shape.opacity < 1 ? shape.opacity : null
      });
    }
    return mxSvgNode("circle", {
      cx: shape.at[0].toFixed(2), cy: shape.at[1].toFixed(2), r: shape.r,
      fill: shape.hollow ? colors.plot : colors[shape.color],
      stroke: shape.hollow ? colors[shape.color] : colors.plot,
      "stroke-width": shape.hollow ? 2.2 : 1.4
    });
  });
  geometry.replaceChildren(...nodes);
  labelLayer.replaceChildren(...drawing.names.map(({ text, x, y, color, small }) => mxSvgNode("text", {
    x: x.toFixed(1), y: y.toFixed(1), fill: colors[color], class: small ? "mx-label-small" : null
  }, text)));
}

// ---------------------------------------------------------------------------
// WebGL renderer. Flat diagrams become batched triangle meshes; the 3D station
// gets lit geometry. Shapes share the SVG layout, so the SVG labels line up
// with either renderer.
// ---------------------------------------------------------------------------

function mxCreateGraphics(THREE, canvas, colors) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(colors.plot);
  const flatScene = new THREE.Scene();
  const flatCamera = new THREE.OrthographicCamera(-280, 280, 180, -180, 0.1, 10);
  flatCamera.position.z = 5;
  const flatGroup = new THREE.Group();
  flatScene.add(flatGroup);
  const materials = new Map();
  const space = mxCreateSpaceScene(THREE, colors);
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
      const d = difference(to, from), length = Math.hypot(...d);
      if (length < 1e-6) return;
      const n = scale([-d[1], d[0]], width / 2 / length);
      const a = add(from, n), b = difference(from, n), c = add(to, n), e = difference(to, n);
      triangle(list, a, b, c);
      triangle(list, c, b, e);
    };
    const polyline = (list, coords, width, dashed) => {
      for (let i = 1; i < coords.length; i++) {
        const from = coords[i - 1], d = difference(coords[i], from), length = Math.hypot(...d);
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
    // Simple polygons such as the F are not convex, so fan from a vertex only when convex;
    // otherwise ear-clip.
    const polygon = (list, coords) => {
      const pts = coords.map(p => [...p]);
      const sign = Math.sign(pts.reduce((sum, p, i) => sum + mxCross2(p, pts[(i + 1) % pts.length]), 0)) || 1;
      const inTriangle = (p, a, b, c) => {
        const s1 = mxCross2(difference(b, a), difference(p, a)) * sign, s2 = mxCross2(difference(c, b), difference(p, b)) * sign;
        const s3 = mxCross2(difference(a, c), difference(p, c)) * sign;
        return s1 > 0 && s2 > 0 && s3 > 0;
      };
      let guard = 0;
      while (pts.length > 3 && guard++ < 400) {
        let clipped = false;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
          if (mxCross2(difference(b, a), difference(c, b)) * sign <= 0) continue;
          if (pts.some(p => p !== a && p !== b && p !== c && inTriangle(p, a, b, c))) continue;
          triangle(list, a, b, c);
          pts.splice(i, 1);
          clipped = true;
          break;
        }
        if (!clipped) break;
      }
      for (let i = 1; i < pts.length - 1; i++) triangle(list, pts[0], pts[i], pts[i + 1]);
    };
    for (const shape of drawing.shapes) {
      if (shape.kind === "stroke") {
        if (shape.glow) polyline(bucket(shape.layer - 0.5, shape.color, 0.2), shape.coords, shape.width + 7, false);
        polyline(bucket(shape.layer, shape.color, shape.opacity ?? 1), shape.coords, shape.width, shape.dashed);
      } else if (shape.kind === "fill") {
        polygon(bucket(shape.layer, shape.color, shape.opacity ?? 1), shape.coords);
      } else if (shape.hollow) {
        disc(bucket(shape.layer, "plot", 1), shape.at, shape.r);
        disc(bucket(shape.layer + 0.1, shape.color, 1), shape.at, shape.r + 1.1, shape.r - 1.1);
      } else {
        disc(bucket(shape.layer, "plot", 1), shape.at, shape.r + 1.3);
        disc(bucket(shape.layer + 0.1, shape.color, 1), shape.at, shape.r);
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
        space.draw(renderer, drawing, width * unit / 2, height * unit / 2);
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

// 3D station: shared projection, SVG fallback and WebGL scene.
// The SVG labels and the WebGL camera use the same right/up vectors, so they line up.
function mxBuildSpace(plan) {
  const [W, H] = MX_SIZE, [CX, CY] = MX_CENTER;
  const yaw = plan.yaw * Math.PI / 180, tilt = plan.tilt * Math.PI / 180;
  const toward = [Math.cos(tilt) * Math.cos(yaw), Math.cos(tilt) * Math.sin(yaw), Math.sin(tilt)];
  const up = [-Math.sin(tilt) * Math.cos(yaw), -Math.sin(tilt) * Math.sin(yaw), Math.cos(tilt)];
  const right = mxCross3(up, toward);
  const ext = Math.max(2, ...plan.vectors.map(entry => mxLength(entry.v)));
  const k = 150 / ext;
  const gridN = Math.ceil(ext);
  const shapes = [], names = [];
  const project = p => [CX + k * mxDot(p, right), CY - k * mxDot(p, up)];
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
  const arrow = (from, to, color, layer, width, size, opacity = 1) => {
    const start = project(from), tip = project(to);
    const d = difference(tip, start), length = Math.hypot(...d);
    if (length < 4) {
      shapes.push({ kind: "dot", layer, at: tip, r: 4.5, color });
      return;
    }
    const u = scale(d, 1 / length), n = [-u[1], u[0]];
    const headLength = Math.min(size, length * 0.5);
    const base = difference(tip, scale(u, headLength));
    shapes.push({ kind: "stroke", layer, coords: [start, add(base, scale(u, 2))], color, width, glow: layer > 5, opacity });
    shapes.push({ kind: "fill", layer, coords: [tip, add(base, scale(n, headLength * 0.45)), difference(base, scale(n, headLength * 0.45))], color, opacity });
  };

  for (let i = -gridN; i <= gridN; i++) {
    stroke(0, [[i, -gridN, 0], [i, gridN, 0]], "grid", 1);
    stroke(0, [[-gridN, i, 0], [gridN, i, 0]], "grid", 1);
  }
  MX_XYZ.forEach((name, axis) => {
    const end = [0, 0, 0], start = [0, 0, 0];
    end[axis] = ext * 1.2;
    start[axis] = -ext * 1.05;
    arrow(start, end, "axis", 4, 1.3, 9);
    label(name, project(end), "axis", true);
  });
  for (const line of plan.lines ?? []) {
    const unit = mxScale3(line.direction, ext * 1.3 / mxLength(line.direction));
    stroke(5, [mxScale3(unit, -1), unit], line.color, 2, { dashed: true });
    if (line.label) label(line.label, project(unit), line.color);
  }
  for (const entry of plan.vectors) {
    arrow([0, 0, 0], entry.v, entry.color, entry.faint ? 3 : 7, entry.faint ? 1.8 : 3, entry.faint ? 9 : 13, entry.faint ? 0.75 : 1);
    if (entry.label) label(mxIsZero(entry.v) ? entry.label + " = 0" : entry.label, project(entry.v), entry.color, entry.faint);
  }
  shapes.push({ kind: "dot", layer: 8, at: project([0, 0, 0]), r: 3, color: "ink" });
  return {
    shapes, names,
    space: { vectors: plan.vectors, lines: plan.lines ?? [], k, ext, right, up, toward, gridN }
  };
}

function mxCreateSpaceScene(THREE, colors) {
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

  function solid(name, basic = false, opacity = 1) {
    return own(basic
      ? new THREE.MeshBasicMaterial({ color: tint(name), transparent: opacity < 1, opacity })
      : new THREE.MeshLambertMaterial({ color: tint(name), emissive: tint(name).multiplyScalar(0.3), transparent: opacity < 1, opacity }));
  }

  function arrow(vector, name, radius, headLength, headRadius, basic = false, from = [0, 0, 0], opacity = 1) {
    const length = Math.hypot(...vector);
    const material = solid(name, basic, opacity);
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
    const { gridN: n, ext } = space;
    const grid = [];
    for (let i = -n; i <= n; i++) grid.push([i, -n, 0], [i, n, 0], [-n, i, 0], [n, i, 0]);
    segments(grid, "grid", 0.9);
    for (let axis = 0; axis < 3; axis++) {
      const start = [0, 0, 0], direction = [0, 0, 0];
      start[axis] = -ext * 1.05;
      direction[axis] = ext * 2.25;
      arrow(direction, "axis", 0.7 * px, 10 * px, 4 * px, true, start);
    }
    for (const line of space.lines) {
      const unit = mxScale3(line.direction, ext * 1.3 / mxLength(line.direction));
      const pieces = [];
      for (let i = 0; i < 24; i += 2) pieces.push(mxScale3(unit, -1 + i / 12), mxScale3(unit, -1 + (i + 1) / 12));
      segments(pieces, line.color);
    }
    for (const entry of space.vectors) {
      if (entry.faint) arrow(entry.v, entry.color, 1.2 * px, 9 * px, 4 * px, true, [0, 0, 0], 0.75);
      else arrow(entry.v, entry.color, 2.6 * px, 15 * px, 6.5 * px);
    }
    world.add(new THREE.Mesh(own(new THREE.SphereGeometry(3 * px, 12, 10)), solid("ink", true)));
  }

  return {
    draw(renderer, drawing, halfWidth, halfHeight) {
      const { space } = drawing;
      const next = JSON.stringify([space.vectors, space.lines, space.k, space.gridN]);
      if (next !== signature) {
        rebuild(space);
        signature = next;
      }
      camera.left = -halfWidth / space.k;
      camera.right = halfWidth / space.k;
      camera.top = halfHeight / space.k;
      camera.bottom = -halfHeight / space.k;
      camera.position.copy(v3(mxScale3(space.toward, 200)));
      camera.up.copy(v3(space.up));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      sun.position.copy(v3(mxAdd3(mxScale3(space.toward, 100), mxAdd3(mxScale3(space.up, 80), mxScale3(space.right, -60)))));
      renderer.render(scene, camera);
    },
    dispose() {
      clear();
      signature = "";
    }
  };
}

// All declarations are initialized before the page starts.
const lesson = document.querySelector(".site-main.matrix-lesson");
if (lesson) {
  initializeReactor(lesson);
  // The arcade is optional. If it fails, the Reactor and the challenge keep working.
  try {
    initializeMatrixArcade(lesson);
  } catch (error) {
    console.error("Matrix Arcade could not start.", error);
  }
}
