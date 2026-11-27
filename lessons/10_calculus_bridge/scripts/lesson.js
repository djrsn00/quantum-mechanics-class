const SVG_NS = "http://www.w3.org/2000/svg";

const FUNCTIONS = {
  square: {
    text: "f(x) = x²",
    value: x => x * x,
    slope: (x, h) => 2 * x + h,
    derivative: x => 2 * x,
    primitive: k => k ** 3,
    denominator: 3000000
  },
  linear: {
    text: "f(x) = x",
    value: x => x,
    slope: () => 1,
    derivative: () => 1,
    primitive: k => k * k,
    denominator: 20000
  },
  absolute: {
    text: "f(x) = |x|",
    value: Math.abs,
    slope: (x, h) => (Math.abs(x + h) - Math.abs(x)) / h,
    derivative: x => x === 0 ? null : Math.sign(x),
    primitive: k => k * Math.abs(k),
    denominator: 20000
  }
};

const DEFAULTS = {
  mode: "tangent", function: "square", x0: 2, h: 0.5,
  a: 0, b: 2, n: 4, rule: "left", sample: 3, shift: 0.1, showStrip: false
};

const PRESETS = {
  "quadratic-tangent": { mode: "tangent", function: "square", x0: 2, h: 0.5 },
  cusp: { mode: "tangent", function: "absolute", x0: 0, h: 0.1 },
  "quadratic-area": { mode: "area", function: "square", a: 0, b: 2, n: 4, rule: "left", sample: 3, showStrip: false },
  "signed-cancel": { mode: "area", function: "linear", a: -1, b: 1, n: 4, rule: "midpoint", sample: 3, showStrip: false },
  "moving-edge": { mode: "area", function: "square", a: 0, b: 2, n: 4, rule: "left", sample: 3, shift: 0.1, showStrip: true }
};

const CHALLENGE = {
  slope: {
    answer: "four",
    correct: "Both signs of h lead to 4. The other answers come from individual secants with nonzero runs.",
    retry: "In 4 + h, what happens to the second term as the step shrinks from either side?"
  },
  cancel: {
    answer: "zero-and-one",
    correct: "The signed halves −1/2 and +1/2 cancel. Their sizes add to 1 when you count geometric area.",
    retry: "Each triangular region has area 1/2. Which calculation keeps the minus sign for the region below the axis?"
  },
  edge: {
    answer: "change",
    correct: "The edge height is 4, so a move of 0.01 adds about 4 × 0.01 = 0.04. The value 8/3 is the accumulation before the move.",
    retry: "A′(2) gives accumulation gained per unit advance. Multiply that rate by the small change in the bound."
  }
};

const DECIMALS = 5;
const NUMBER = new Intl.NumberFormat("en", {
  maximumFractionDigits: DECIMALS,
  useGrouping: false
});

function format(value) {
  const threshold = 0.5 * 10 ** -DECIMALS;
  return NUMBER.format(Math.abs(value) < threshold ? 0 : value).replace("-", "−");
}

function rounded(value) {
  return Math.abs(value - Number(value.toFixed(DECIMALS))) > 1e-11;
}

function reading(value) {
  return `${rounded(value) ? "≈ " : ""}${format(value)}`;
}

function pointLabel([x, y]) {
  return `(${format(x)}, ${format(y)})`;
}

// Every entered bound and edge shift is a multiple of 0.01.
function integral(fn, a, b) {
  const start = Math.round(a * 100);
  const end = Math.round(b * 100);
  return { numerator: fn.primitive(end) - fn.primitive(start), denominator: fn.denominator };
}

function fractionValue({ numerator, denominator }) {
  return numerator / denominator;
}

function fractionText({ numerator, denominator }) {
  let a = Math.abs(numerator);
  let b = denominator;
  while (b !== 0) [a, b] = [b, a % b];

  const top = numerator / a;
  const bottom = denominator / a;
  return bottom === 1 ? format(top) : `${format(top)}/${format(bottom)}`;
}

function tangentData(fn, { x0, h }) {
  const x1 = Math.round((x0 + h) * 100) / 100;
  const p = [x0, fn.value(x0)];
  const q = [x1, fn.value(x1)];
  return { p, q, rise: q[1] - p[1], slope: fn.slope(x0, h), derivative: fn.derivative(x0) };
}

function areaData(fn, { a, b, n, rule, sample, shift }) {
  const width = (b - a) / n;
  const rectangles = Array.from({ length: n }, (_, index) => {
    const from = a + index * width;
    const to = index === n - 1 ? b : a + (index + 1) * width;
    const left = Math.min(from, to);
    const right = Math.max(from, to);
    const x = rule === "left" ? left : rule === "right" ? right : (left + right) / 2;
    const height = fn.value(x);
    return { left, right, x, height, term: height * width };
  });

  const sum = rectangles.reduce((total, rectangle) => total + rectangle.term, 0);
  const exact = integral(fn, a, b);
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  const split = Math.min(high, Math.max(low, 0));
  const geometric = {
    numerator: Math.abs(integral(fn, low, split).numerator) + Math.abs(integral(fn, split, high).numerator),
    denominator: fn.denominator
  };

  const shifted = Math.round((b + shift) * 100) / 100;
  const change = fractionValue(integral(fn, b, shifted));
  return {
    width, rectangles, selected: rectangles[sample - 1], sum, exact,
    error: sum - fractionValue(exact), geometric, shifted, change,
    average: change / shift, edge: fn.value(b)
  };
}

function stroke(points, color, width, dash = null) {
  return { points, color, width, dash };
}

function fill(points, color, opacity = 1) {
  return { points, color, opacity, filled: true };
}

function box(x1, y1, x2, y2) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

function buildGraph(frame, state, fn, tangent, area, slopeRevealed) {
  const { left, top, width, height, minX, maxX } = frame;
  const [minY, maxY] = state.function === "square" ? frame.squareY : frame.otherY;
  const right = left + width;
  const bottom = top + height;
  const px = x => left + (x - minX) * width / (maxX - minX);
  const py = y => bottom - (y - minY) * height / (maxY - minY);
  const project = ([x, y]) => [px(x), py(y)];
  const zero = py(0);
  const layers = {
    grid: [], area: [], rectangle: [], strip: [], curve: [], axis: [], guide: [], point: []
  };
  const ticks = [];
  const labels = [];

  for (let x = Math.ceil(minX); x <= maxX; x++) {
    if (x !== 0) layers.grid.push(stroke([[px(x), top], [px(x), bottom]], "grid", 1));
    ticks.push({ text: format(x), x: px(x), y: zero + 26, anchor: "middle" });
  }

  const tickStep = state.function === "square" ? 2 : 1;
  for (let y = Math.ceil(minY / tickStep) * tickStep; y <= maxY; y += tickStep) {
    if (y === 0) continue;
    layers.grid.push(stroke([[left, py(y)], [right, py(y)]], "grid", 1));
    ticks.push({ text: format(y), x: px(0) - 12, y: py(y) + 5, anchor: "end" });
  }

  layers.axis.push(stroke([[left, zero], [right + 5, zero]], "axis", 1.6));
  layers.axis.push(stroke([[px(0), bottom], [px(0), top - 5]], "axis", 1.6));
  ticks.push(
    { text: "x", x: right + 14, y: zero + 5 },
    { text: "f(x)", x: px(0) + 12, y: top - 6 }
  );

  const curve = Array.from({ length: 121 }, (_, index) => {
    const x = minX + index * (maxX - minX) / 120;
    return project([x, fn.value(x)]);
  });
  layers.curve.push(stroke(curve, "curve", 4.2));

  function mark([x, y], radius, diamond) {
    const points = diamond
      ? [[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]]
      : Array.from({ length: 16 }, (_, index) => {
        const angle = index * Math.PI / 8;
        return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
      });

    layers.point.push(fill(points, "point"));
    layers.point.push(stroke([...points, points[0]], "plot", 1.3));
  }

  function lineThrough([x, y], slope, color, lineWidth, dash, start = minX, end = maxX) {
    const intercept = y - slope * x;
    if (slope !== 0) {
      const a = (minY - intercept) / slope;
      const b = (maxY - intercept) / slope;
      start = Math.max(start, Math.min(a, b));
      end = Math.min(end, Math.max(a, b));
    }
    if (start < end) {
      layers.guide.push(stroke([
        project([start, slope * start + intercept]),
        project([end, slope * end + intercept])
      ], color, lineWidth, dash));
    }
  }

  if (state.mode === "tangent") {
    const p = project(tangent.p);
    const q = project(tangent.q);
    const corner = [q[0], p[1]];
    lineThrough(tangent.p, tangent.slope, "secant", 2.6);
    layers.guide.push(stroke([p, corner, q], "secant", 1.9, [6, 4]));

    if (slopeRevealed) {
      if (tangent.derivative === null) {
        lineThrough(tangent.p, -1, "tangent", 2, [8, 5], minX, 0);
        lineThrough(tangent.p, 1, "tangent", 2, [8, 5], 0, maxX);
        labels.push(
          { text: "Left −1", at: project([-1.7, 1.7]), color: "tangent" },
          { text: "Right +1", at: project([1.7, 1.7]), color: "tangent" }
        );
      } else {
        lineThrough(tangent.p, tangent.derivative, "tangent", 2, [8, 5]);
      }
    }

    mark(p, 6.5, false);
    mark(q, Math.hypot(q[0] - p[0], q[1] - p[1]) < 9 ? 4.5 : 6.5, true);
    labels.push(
      { text: `P ${pointLabel(tangent.p)}`, at: p, color: "point" },
      { text: `Q ${pointLabel(tangent.q)}`, at: q, color: "point" },
      { text: `h = ${format(state.h)}`, at: [(p[0] + q[0]) / 2, p[1]], color: "secant" }
    );
    if (Math.abs(q[1] - p[1]) >= 15) {
      labels.push({
        text: `Rise ${format(tangent.rise)}`,
        at: [q[0], (q[1] + p[1]) / 2],
        color: "secant"
      });
    }
  } else {
    function shade(from, to, color, opacity) {
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      if (low === high) return;
      const split = low < 0 && high > 0 ? [low, 0, high] : [low, high];

      for (let i = 1; i < split.length; i++) {
        const start = split[i - 1];
        const end = split[i];
        const count = Math.max(1, Math.ceil((end - start) * 24));

        for (let j = 0; j < count; j++) {
          const x = start + (end - start) * j / count;
          const next = start + (end - start) * (j + 1) / count;
          layers[color].push(fill([
            [px(x), zero], project([x, fn.value(x)]),
            project([next, fn.value(next)]), [px(next), zero]
          ], color, opacity));
        }
      }
    }

    shade(state.a, state.b, "area", 0.25);
    area.rectangles.forEach(({ left: x1, right: x2, height: value }, index) => {
      if (x1 === x2) return;
      const points = box(px(x1), zero, px(x2), py(value));
      const selected = index === state.sample - 1;
      if (selected && value !== 0) layers.rectangle.push(fill(points, "rect", 0.18));
      layers.rectangle.push(stroke([...points, points[0]], "rect", selected ? 2.7 : 1.4));
    });

    for (const value of new Set([state.a, state.b])) {
      layers.guide.push(stroke([[px(value), top], [px(value), bottom]], "area", 1.7, [6, 5]));
    }

    const a = px(state.a);
    const b = px(state.b);
    if (a !== b) {
      const y = bottom - 7;
      const head = b - Math.sign(b - a) * Math.min(8, Math.abs(b - a) / 2);
      layers.guide.push(
        stroke([[a, y], [b, y]], "area", 1.7),
        stroke([[head, y - 4], [b, y], [head, y + 4]], "area", 1.7)
      );
      labels.push(
        { text: `a = ${format(state.a)}`, at: [a, top + 35], color: "area" },
        { text: `b = ${format(state.b)}`, at: [b, top + 35], color: "area" }
      );
    } else {
      labels.push({ text: `a = b = ${format(state.a)}`, at: [a, top + 35], color: "area" });
    }

    if (state.showStrip) {
      shade(state.b, area.shifted, "strip", 0.48);
      const shiftedX = px(area.shifted);
      layers.guide.push(stroke([[shiftedX, top], [shiftedX, bottom]], "strip", 2, [4, 5]));
      labels.push({ text: `b + δ = ${format(area.shifted)}`, at: [shiftedX, top + 70], color: "strip" });
    }

    const sample = project([area.selected.x, area.selected.height]);
    mark(sample, 6, true);
    labels.push({ text: `xₖ* = ${format(area.selected.x)}`, at: sample, color: "point" });
  }

  return { layers, ticks, labels };
}

function svgNode(tag, attributes, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function drawSvg(groups, graph, colors, frame) {
  for (const [name, shapes] of Object.entries(graph.layers)) {
    groups[name].replaceChildren(...shapes.map(shape => {
      const points = shape.points.map(point => point.join(",")).join(" ");
      if (shape.filled) {
        return svgNode("polygon", { points, fill: colors[shape.color], "fill-opacity": shape.opacity });
      }
      const attributes = {
        points, fill: "none", stroke: colors[shape.color], "stroke-width": shape.width,
        "stroke-linecap": "round", "stroke-linejoin": "round"
      };
      if (shape.dash) attributes["stroke-dasharray"] = shape.dash.join(" ");
      return svgNode("polyline", attributes);
    }));
  }

  groups.ticks.replaceChildren(...graph.ticks.map(({ text, x, y, anchor }) =>
    svgNode("text", { x, y, "text-anchor": anchor ?? "start" }, text)
  ));

  const occupied = graph.ticks.map(({ text, x, y, anchor }) => {
    const w = text.length * 10.8;
    return {
      x: anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x,
      y: y - 16, w, h: 21
    };
  });

  groups.labels.replaceChildren(...graph.labels.map(({ text, at: [x, y], color }) => {
    const w = text.length * 10.8;
    const h = 22;
    const candidates = [
      [x + 10, y - 25], [x - w - 10, y - 25], [x + 10, y + 9],
      [x - w - 10, y + 9], [x + 10, y - 48], [x - w - 10, y - 48],
      [x + 10, y + 32], [x - w - 10, y + 32]
    ];
    const bounds = candidates.map(([left, top]) => ({
      x: Math.max(4, Math.min(frame.sceneWidth - w - 4, left)),
      y: Math.max(4, Math.min(frame.sceneHeight - h - 4, top)),
      w, h
    }));
    const place = bounds.find(b => occupied.every(o =>
      b.x + b.w + 3 <= o.x || o.x + o.w + 3 <= b.x ||
      b.y + b.h + 3 <= o.y || o.y + o.h + 3 <= b.y
    )) ?? bounds[0];

    occupied.push(place);
    return svgNode("text", { x: place.x, y: place.y + 17, class: `calc-${color}-color` }, text);
  }));
}

function meshShape(shape, sceneHeight, color, positions, colors) {
  function triangle(...vertices) {
    for (const [x, y] of vertices) {
      positions.push(x, sceneHeight - y, 0);
      colors.push(color.r, color.g, color.b, shape.opacity ?? 1);
    }
  }

  const { points, width, dash } = shape;
  if (shape.filled) {
    for (let i = 1; i < points.length - 1; i++) triangle(points[0], points[i], points[i + 1]);
    return;
  }

  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i - 1];
    const dx = points[i][0] - x;
    const dy = points[i][1] - y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) continue;

    const normal = [-dy * width / (2 * length), dx * width / (2 * length)];
    const [on, off] = dash ?? [length, 0];
    const period = on + off;
    const offset = dash ? -(distance % period) : 0;

    for (let t = offset; t < length; t += period) {
      const from = Math.max(0, t) / length;
      const to = Math.min(length, t + on) / length;
      if (to <= from) continue;
      const ax = x + from * dx;
      const ay = y + from * dy;
      const bx = x + to * dx;
      const by = y + to * dy;
      const a = [ax + normal[0], ay + normal[1]];
      const b = [ax - normal[0], ay - normal[1]];
      const c = [bx + normal[0], by + normal[1]];
      const d = [bx - normal[0], by - normal[1]];
      triangle(a, b, c);
      triangle(c, b, d);
    }
    distance += length;
  }
}

function createRenderer(THREE, canvas, frame, colors) {
  const { sceneWidth, sceneHeight } = frame;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(colors.plot);
  const camera = new THREE.OrthographicCamera(0, sceneWidth, sceneHeight, 0, 0.1, 10);
  camera.position.z = 1;
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthTest: false, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true
  });
  const palette = Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [name, new THREE.Color(value)])
  );
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let previous;
  let bufferKey;
  return {
    draw(graph, width, height) {
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const nextKey = `${width}:${height}:${density}`;
      if (nextKey !== bufferKey) {
        renderer.setDrawingBufferSize(width, height, density);
        const fit = Math.min(width / sceneWidth, height / sceneHeight);
        const padX = (width / fit - sceneWidth) / 2;
        const padY = (height / fit - sceneHeight) / 2;
        camera.left = -padX;
        camera.right = sceneWidth + padX;
        camera.bottom = -padY;
        camera.top = sceneHeight + padY;
        camera.updateProjectionMatrix();
        bufferKey = nextKey;
      }

      if (graph !== previous) {
        const positions = [];
        const vertexColors = [];
        for (const shapes of Object.values(graph.layers)) {
          for (const shape of shapes) {
            meshShape(shape, sceneHeight, palette[shape.color], positions, vertexColors);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColors, 4));
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        previous = graph;
      }
      renderer.render(scene, camera);
    },
    isLost: () => renderer.getContext().isContextLost(),
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    }
  };
}

function enhanceGraphics(viewport, canvas, frame, colors, getGraph, listen, lifetime) {
  let graphics = null;
  let pending = null;
  let active = true;
  let lost = false;

  function fallback() {
    viewport.dataset.renderer = "svg";
    canvas.hidden = true;
  }

  function cancelDraw() {
    if (pending !== null) cancelAnimationFrame(pending);
    pending = null;
  }

  // Render on change, with no interpolation or animation loop.
  function requestDraw() {
    if (!graphics || lost || !active || document.hidden || pending !== null) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      if (!graphics || lost || !active || document.hidden) return;
      const { clientWidth: width, clientHeight: height } = viewport;
      if (width === 0 || height === 0) {
        fallback();
        return;
      }

      try {
        graphics.draw(getGraph(), width, height);
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
    graphics = createRenderer(THREE, canvas, frame, colors);
    requestDraw();
  }).catch(fallback);

  return requestDraw;
}

function wireChallenge(find, listen) {
  const form = find("challenge");
  const feedback = find("challenge-feedback");
  const next = find("challenge-next");
  const restart = find("challenge-restart");
  const panels = [...form.querySelectorAll("[data-calc-question]")];
  let index = 0;

  function clear() {
    feedback.textContent = "";
    next.hidden = true;
    restart.hidden = true;
  }

  function show() {
    panels.forEach((panel, position) => { panel.hidden = position !== index; });
    clear();
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

    const question = CHALLENGE[panel.dataset.calcQuestion];
    const correct = choice.value === question.answer;
    feedback.textContent = correct ? question.correct : question.retry;
    next.hidden = !correct || index === panels.length - 1;
    restart.hidden = !correct || index < panels.length - 1;
  });

  listen(form, "change", clear);
  listen(next, "click", () => {
    if (next.hidden) return;
    index++;
    show();
  });
  listen(restart, "click", () => {
    form.reset();
    index = 0;
    show();
  });
}

function initializeLab(root) {
  const find = name => root.querySelector(`#calc-${name}`);
  const write = (name, value) => { find(name).textContent = value; };
  const hide = (name, hidden) => { find(name).hidden = hidden; };
  const graphSvg = find("graph");
  const frame = {
    sceneWidth: graphSvg.viewBox.baseVal.width,
    sceneHeight: graphSvg.viewBox.baseVal.height,
    left: Number(graphSvg.dataset.plotLeft),
    top: Number(graphSvg.dataset.plotTop),
    width: Number(graphSvg.dataset.plotWidth),
    height: Number(graphSvg.dataset.plotHeight),
    minX: Number(graphSvg.dataset.xMin),
    maxX: Number(graphSvg.dataset.xMax),
    squareY: [Number(graphSvg.dataset.squareYMin), Number(graphSvg.dataset.squareYMax)],
    otherY: [Number(graphSvg.dataset.otherYMin), Number(graphSvg.dataset.otherYMax)]
  };

  const layerNames = ["grid", "area", "rectangle", "strip", "curve", "axis", "guide", "point"];
  const groups = Object.fromEntries(layerNames.map(name => [name, find(`${name}-layer`)]));
  groups.ticks = find("tick-labels");
  groups.labels = find("plot-labels");

  const style = getComputedStyle(root);
  const colors = Object.fromEntries(
    ["plot", "axis", "grid", "curve", "secant", "tangent", "rect", "area", "point", "strip"]
      .map(name => [name, style.getPropertyValue(`--calc-${name}`).trim()])
  );

  const lifetime = new AbortController();
  const listen = (node, event, handler) => node.addEventListener(event, handler, { signal: lifetime.signal });
  const values = ["mode", "function", "x0", "h", "a", "b", "n", "rule", "sample", "shift"];
  const inputs = Object.fromEntries(values.map(name => [name, find(name)]));
  const stripToggle = find("show-strip");
  const slopeGuess = find("slope-guess");
  const slopeNumber = find("slope-number");
  const areaGuess = find("area-guess");
  const slopeButton = find("slope-reveal");
  const areaButton = find("area-reveal");

  let state = { ...DEFAULTS };
  let slopeRevealed = false;
  let areaRevealed = false;
  let tangent;
  let area;
  let graph;
  let requestDraw = () => {};

  function showNumberGuess() {
    const show = slopeGuess.value === "number";
    hide("slope-number-wrap", !show);
    slopeNumber.disabled = !show;
    slopeNumber.required = show;
  }

  function clearSlopePrediction() {
    slopeGuess.value = "";
    slopeNumber.value = "";
    showNumberGuess();
    write("slope-feedback", "");
  }

  function clearAreaPrediction() {
    areaGuess.value = "";
    write("area-feedback", "");
  }

  function syncInputs() {
    inputs.sample.max = state.n;
    for (const [name, input] of Object.entries(inputs)) {
      input.value = state[name];
      input.removeAttribute("aria-invalid");
    }
    stripToggle.checked = state.showStrip;
  }

  function render(announce = true) {
    const fn = FUNCTIONS[state.function];
    const isArea = state.mode === "area";
    tangent = tangentData(fn, state);
    area = areaData(fn, state);

    for (const suffix of ["settings", "readouts", "legend"]) {
      hide(`tangent-${suffix}`, isArea);
      hide(`area-${suffix}`, !isArea);
    }
    hide("slope-prediction", isArea);
    hide("area-prediction", !isArea);
    hide("strip-settings", !state.showStrip);
    hide("strip-readouts", !state.showStrip);

    hide("slope-exact", !slopeRevealed);
    slopeButton.setAttribute("aria-expanded", String(slopeRevealed));
    slopeButton.textContent = slopeRevealed ? "Hide tangent result" : "Reveal tangent result";
    hide("area-exact", !areaRevealed);
    areaButton.setAttribute("aria-expanded", String(areaRevealed));
    areaButton.textContent = areaRevealed ? "Hide exact integral" : "Reveal exact integral";

    write("point-p", pointLabel(tangent.p));
    write("point-q", pointLabel(tangent.q));
    write("run", format(state.h));
    write("rise", reading(tangent.rise));
    const slopeSign = [tangent.rise, state.h, tangent.slope].some(rounded) ? "≈" : "=";
    write("quotient", `${format(tangent.rise)} ÷ ${format(state.h)} ${slopeSign} ${format(tangent.slope)}`);
    const slopeText = tangent.derivative === null
      ? "The two-sided derivative does not exist."
      : `f′(${format(state.x0)}) = ${format(tangent.derivative)}`;
    write("derivative", slopeText);
    write("derivative-note", tangent.derivative === null
      ? "The left slope is −1 and the right slope is +1. The green dashes show the two one-sided directions."
      : "The dashed line shows the instantaneous slope at P.");

    write("width", reading(area.width));
    write("sample-x", reading(area.selected.x));
    write("sample-height", reading(area.selected.height));
    const productSign = [area.selected.height, area.width, area.selected.term].some(rounded) ? "≈" : "=";
    write("sample-term", `${format(area.selected.height)} × ${format(area.width)} ${productSign} ${format(area.selected.term)}`);
    write("rectangle-sum", reading(area.sum));
    write("integral", fractionText(area.exact));
    write("area-error", reading(area.error));
    write("geometric-area", fractionText(area.geometric));

    const widthNote = state.a === state.b
      ? "Equal bounds give zero width, zero accumulation, and zero geometric area."
      : state.a > state.b
        ? "The interval runs from right to left. Each contribution uses a negative width."
        : "Heights below the x-axis contribute negatively to this forward integral.";
    write("area-note", `${state.n} rectangles, ${state.rule} sampling. ${widthNote}`);
    write("strip-bounds", `${format(state.b)} → ${format(area.shifted)}`);
    write("edge-total", fractionText(area.exact));
    write("strip-change", reading(area.change));
    write("strip-rate", reading(area.average));
    write("edge-rate", reading(area.edge));

    graph = buildGraph(frame, state, fn, tangent, area, slopeRevealed);
    drawSvg(groups, graph, colors, frame);

    const tangentSummary = `P ${pointLabel(tangent.p)}. Q ${pointLabel(tangent.q)}. Rise ${reading(tangent.rise)}, run ${format(state.h)}, secant slope ${reading(tangent.slope)}.`;
    const areaSummary = `From ${format(state.a)} to ${format(state.b)}. ${state.n} rectangles, ${state.rule} sampling. Rectangle sum ${reading(area.sum)}.`;
    const extraArea = areaRevealed ? ` Exact integral ${fractionText(area.exact)}.` : "";
    const extraStrip = state.showStrip
      ? ` Moving-edge average height ${reading(area.average)}. Height at the edge ${reading(area.edge)}.`
      : "";
    const description = isArea
      ? areaSummary + extraArea + extraStrip
      : tangentSummary + (slopeRevealed ? ` ${slopeText}` : "");

    write("graph-desc", `${fn.text}. ${description}`);
    if (announce) write("status", description);
    requestDraw();
  }

  listen(inputs.mode, "change", () => {
    state.mode = inputs.mode.value;
    render();
  });

  listen(inputs.function, "change", () => {
    state.function = inputs.function.value;
    slopeRevealed = areaRevealed = false;
    clearSlopePrediction();
    clearAreaPrediction();
    render();
  });

  for (const name of ["h", "rule", "shift"]) {
    listen(inputs[name], "change", () => {
      state[name] = name === "rule" ? inputs[name].value : Number(inputs[name].value);
      if (name === "rule") clearAreaPrediction();
      render();
    });
  }

  for (const name of ["x0", "a", "b", "n", "sample"]) {
    const field = inputs[name];
    listen(field, "input", () => {
      if (!field.validity.valid) {
        field.setAttribute("aria-invalid", "true");
        write("status", "Enter a value within the stated range. The graph shows the last valid setting.");
        return;
      }
      field.removeAttribute("aria-invalid");
      if (state[name] === field.valueAsNumber) {
        render();
        return;
      }

      state[name] = field.valueAsNumber;
      if (name === "x0") {
        slopeRevealed = false;
        clearSlopePrediction();
      } else if (name !== "sample") {
        clearAreaPrediction();
      }
      if (name === "n") {
        inputs.sample.max = state.n;
        state.sample = Math.min(state.sample, state.n);
        inputs.sample.value = state.sample;
        inputs.sample.removeAttribute("aria-invalid");
      }
      render();
    });

    listen(field, "blur", () => {
      if (field.validity.valid) return;
      field.value = state[name];
      field.removeAttribute("aria-invalid");
      render();
    });
  }

  listen(stripToggle, "change", () => {
    state.showStrip = stripToggle.checked;
    render();
  });

  function loadSettings(changes) {
    state = { ...state, ...changes };
    slopeRevealed = areaRevealed = false;
    clearSlopePrediction();
    clearAreaPrediction();
    syncInputs();
    render();
  }

  for (const button of root.querySelectorAll("[data-calc-preset]")) {
    listen(button, "click", () => { loadSettings(PRESETS[button.dataset.calcPreset]); });
  }
  listen(find("reset"), "click", () => { loadSettings(DEFAULTS); });

  listen(slopeGuess, "change", () => {
    showNumberGuess();
    write("slope-feedback", "");
  });
  listen(slopeNumber, "input", () => { write("slope-feedback", ""); });
  listen(areaGuess, "change", () => { write("area-feedback", ""); });

  listen(find("slope-prediction"), "submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const target = tangent.derivative;
    const correct = target === null ? slopeGuess.value === "no-limit"
      : slopeGuess.value === "number" && Math.abs(slopeNumber.valueAsNumber - target) <= 1e-8;
    const reason = target === null
      ? "At this corner, the left secants approach −1 and the right secants approach +1."
      : `The limiting slope is ${format(target)}. Compare smaller positive and negative steps at the same base point.`;

    slopeRevealed = true;
    render(false);
    write("slope-feedback", `${correct ? "Correct." : "Try both sides and compare."} ${reason}`);
  });

  listen(find("area-prediction"), "submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const relation = Math.abs(area.error) < 1e-10 ? "equal" : area.error < 0 ? "below" : "above";
    const comparison = relation === "equal" ? "equals" : `is ${relation}`;

    areaRevealed = true;
    render(false);
    write("area-feedback", `${areaGuess.value === relation ? "Correct." : "Compare the signed values."} The sum ${reading(area.sum)} ${comparison} the exact integral ${fractionText(area.exact)}.`);
  });

  listen(slopeButton, "click", () => {
    slopeRevealed = !slopeRevealed;
    render();
  });
  listen(areaButton, "click", () => {
    areaRevealed = !areaRevealed;
    render();
  });

  syncInputs();
  showNumberGuess();
  render(false);
  wireChallenge(find, listen);
  for (const name of ["controls", "slope-prediction-controls", "area-prediction-controls", "challenge-controls"]) {
    find(name).disabled = false;
  }
  hide("static-note", true);

  requestDraw = enhanceGraphics(find("viewport"), find("canvas"), frame, colors, () => graph, listen, lifetime);
}

// ===========================================================================
// Calculus Arcade (optional practice). Everything below uses the cb prefix and
// runs separately from the Calculus Lab above it.
// ===========================================================================

const CB_SIZE = [560, 360];
// Rounded answers within this distance of a non-terminating exact value are accepted.
const CB_TOLERANCE = 0.002;
const cbNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 4, useGrouping: false });

function cbFmt(value) {
  if (Number.isNaN(value)) return "undefined";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "−∞";
  if (Math.abs(value) >= 1e7) {
    const [mantissa, power] = value.toExponential(2).split("e");
    return mantissa.replace("-", "−") + " × 10^" + Number(power);
  }
  return cbNumber.format(Math.abs(value) < 5e-10 ? 0 : value).replace("-", "−");
}

// An answer that ends as a decimal must match exactly; anything else gets the stated tolerance.
const cbTerminates = value => Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-6;
const cbFits = (value, answer) => Math.abs(value - answer) <= (cbTerminates(answer) ? 1e-9 : CB_TOLERANCE + 1e-12);
const cbFitsSet = ([p, q], [s, t]) => (cbFits(p, s) && cbFits(q, t)) || (cbFits(p, t) && cbFits(q, s));
// Exact comparison for values built from quarter steps (floating-point noise only).
const cbSame = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

// Show exact fractions such as 4/3 in worked steps, and ≈ for other values.
function cbShow(value) {
  if (cbTerminates(value)) return cbFmt(value);
  for (let q = 2; q <= 60; q++) {
    const p = Math.round(value * q);
    if (Math.abs(value * q - p) < 1e-9) return (p < 0 ? "−" : "") + Math.abs(p) + "/" + q;
  }
  return "≈ " + cbFmt(value);
}

// Parse numbers such as 2, −1.5, 8/3, √2, 1/√2, π/2 or 2π.
// This is a small arithmetic reader (+ − × / √ π and brackets), never eval.
function cbParse(raw) {
  const text = String(raw).trim().toLowerCase()
    .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/sqrt/g, "√").replace(/pi/g, "π").replace(/\s+/g, "");
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
    if (peek() === "π") {
      i++;
      return Math.PI;
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
      } else if (ch === "(" || ch === "√" || ch === "π") {
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

const cbGrade = (pass, fail, work = "", success = "Mission complete.") => ({ pass, fail, work, success });
const cbSetup = message => cbGrade(false, message);
const cbCard = c => (c.s.card && c.spec.cards?.[c.s.card]) ? c.s.card : c.spec.defaultCard;

// Polynomials as { power: coefficient } maps with zero terms removed.
function cbPoly(pairs) {
  const map = {};
  for (const [power, coefficient] of pairs) map[power] = (map[power] ?? 0) + coefficient;
  for (const power of Object.keys(map)) if (Math.abs(map[power]) < 1e-12) delete map[power];
  return map;
}
const cbPolyEval = (map, x) => Object.entries(map).reduce((sum, [p, a]) => sum + a * x ** Number(p), 0);
const cbPolyDeriv = map => cbPoly(Object.entries(map).filter(([p]) => Number(p) > 0).map(([p, a]) => [Number(p) - 1, a * Number(p)]));
const cbPolyEq = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(p => cbFits(a[p] ?? 0, b[p] ?? 0));
};
const CB_SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶"];
function cbPolyText(map, name = "x") {
  const powers = Object.keys(map).map(Number).sort((a, b) => b - a);
  if (!powers.length) return "0";
  return powers.map((p, index) => {
    const a = map[p];
    const size = Math.abs(a);
    const body = p === 0 ? cbShow(size) : (cbSame(size, 1) ? "" : cbShow(size)) + name + (p === 1 ? "" : CB_SUP[p]);
    if (index === 0) return (a < 0 ? "−" : "") + body;
    return (a < 0 ? " − " : " + ") + body;
  }).join("");
}
const cbSig = value => JSON.stringify(value);

// Plot items, in world coordinates of one panel.
const cbCurve = (f, color, options = {}) => ({ type: "curve", f, color, ...options });
const cbPath = (points, color, options = {}) => ({ type: "path", points, color, ...options });
const cbFill = (points, color, opacity = 0.25) => ({ type: "fill", points, color, opacity });
const cbDot = (at, color, options = {}) => ({ type: "dot", at, color, ...options });
const cbText = (text, at, color, options = {}) => ({ type: "label", text, at, color, ...options });
const cbVline = (x, color, options = {}) => ({ type: "vline", x, color, ...options });
const cbLine = (through, slope, color, options = {}) => ({ type: "line", through, slope, color, ...options });
const cbArrow = (from, to, color, options = {}) => ({ type: "arrow", from, to, color, ...options });
const cbPanel = (box, x, y, items, options = {}) => ({ box, x, y, items, ...options });
const CB_FULL = [44, 14, 500, 314];

// Thin strips between the curve and the axis, coloured by sign and split where f crosses zero.
function cbSignedFill(f, from, to, positive, negative, opacity = 0.3, count = 80) {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const items = [];
  if (hi - lo < 1e-12) return items;
  for (let i = 0; i < count; i++) {
    const x1 = lo + (hi - lo) * i / count, x2 = lo + (hi - lo) * (i + 1) / count;
    const y1 = f(x1), y2 = f(x2);
    if (!Number.isFinite(y1) || !Number.isFinite(y2)) continue;
    if (y1 * y2 < 0) {
      const xc = x1 + (x2 - x1) * y1 / (y1 - y2);
      items.push(cbFill([[x1, 0], [x1, y1], [xc, 0]], y1 > 0 ? positive : negative, opacity));
      items.push(cbFill([[xc, 0], [x2, y2], [x2, 0]], y2 > 0 ? positive : negative, opacity));
    } else {
      const color = y1 + y2 >= 0 ? positive : negative;
      items.push(cbFill([[x1, 0], [x1, y1], [x2, y2], [x2, 0]], color, opacity));
    }
  }
  return items;
}

// A y-window that holds the sampled functions, includes zero and stays within the clamp.
function cbRange(fns, from, to, { clamp = 50, pad = 0.12, include = [0], min = 1 } = {}) {
  let lo = Infinity, hi = -Infinity;
  for (const f of fns) {
    for (let i = 0; i <= 120; i++) {
      const y = f(from + (to - from) * i / 120);
      if (!Number.isFinite(y)) continue;
      lo = Math.min(lo, Math.max(-clamp, y));
      hi = Math.max(hi, Math.min(clamp, y));
    }
  }
  for (const y of include) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  if (!Number.isFinite(lo)) [lo, hi] = [-1, 1];
  if (hi - lo < min) { const mid = (hi + lo) / 2; lo = mid - min / 2; hi = mid + min / 2; }
  const room = (hi - lo) * pad;
  return [lo - room, hi + room];
}

// Midpoint-rule integral for readouts (never used for exact checks).
function cbIntegrate(f, a, b, count = 2000) {
  const width = (b - a) / count;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += f(a + (i + 0.5) * width);
  return sum * width;
}

// Slope Matcher: one candidate graph per card.
function cbMatchSingle(key, why) {
  return c => {
    const card = c.spec.cards[key];
    const pick = c.choice(card.pick);
    return cbGrade(pick === card.answer, "Graph " + pick + " does not match. Compare where the given graph is flat, rising and falling with the candidate’s zeros and signs.",
      "Graph " + card.answer + " matches. " + why);
  };
}

// Rule Forge: the built f must match the card, the prediction must be its derivative,
// and a secant test must have been run on exactly this f and prediction.
function cbForgeGrader(key) {
  return c => {
    const target = c.spec.cards[key].target;
    const f = c.spec.built(c);
    if (target && !cbPolyEq(f, target)) return cbSetup("Build f(x) = " + cbPolyText(target) + " first. The forge holds f(x) = " + cbPolyText(f) + ".");
    if (!target) {
      const n = Number(c.val("n")), m = Number(c.val("m"));
      if (n === m || n === 0 || m === 0 || c.num("a") === 0 || c.num("b") === 0) {
        return cbSetup("Use two nonzero coefficients a and b with different positive powers n and m.");
      }
    }
    const prediction = c.spec.predicted(c), truth = cbPolyDeriv(f);
    if (!cbPolyEq(prediction, truth)) {
      return cbGrade(false, "Your prediction f′(x) = " + cbPolyText(prediction) + " is not the derivative yet. For each term, multiply by the power, then lower the power by one. A constant term disappears.");
    }
    const test = c.s.test;
    if (!test || test.f !== cbSig(f) || test.prediction !== cbSig(prediction)) return cbSetup("Your prediction is right. Now run Test with secant for this f and prediction.");
    if (!target && test.x0 === 0) return cbSetup("Run the secant test at some x₀ ≠ 0.");
    return cbGrade(true, "", "f(x) = " + cbPolyText(f) + " gives f′(x) = " + cbPolyText(truth) + ". At x₀ = " + cbFmt(test.x0) +
      " the rule gives " + cbFmt(test.predicted) + " and the secant with h = 0.001 gives " + cbFmt(test.secant) + ". The small gap comes from the leftover terms that still contain h.");
  };
}

// Rectangle Race: the four sums for one function, interval and n.
const CB_RACE = {
  fall: { text: "4 − x²", f: x => 4 - x * x, a: 0, b: 2, exact: 16 / 3 },
  cube: { text: "x³", f: x => x ** 3, a: 0, b: 2, exact: 4 },
  root: { text: "√x", f: x => Math.sqrt(x), a: 0, b: 4, exact: 16 / 3 },
  line: { text: "2x + 1", f: x => 2 * x + 1, a: 0, b: 3, exact: 12 }
};
const CB_RULE_NAMES = { left: "left", right: "right", mid: "midpoint", trap: "trapezoid" };
function cbRaceSums({ f, a, b }, n) {
  const h = (b - a) / n;
  let left = 0, right = 0, mid = 0;
  for (let i = 0; i < n; i++) {
    left += f(a + i * h);
    right += f(a + (i + 1) * h);
    mid += f(a + (i + 0.5) * h);
  }
  return { left: left * h, right: right * h, mid: mid * h, trap: (left + right) * h / 2 };
}

// Signed Area Ledger: net and total area for f(x) = mx + c from a to b.
function cbLedger(m, c, a, b) {
  const F = x => m * x * x / 2 + c * x;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const root = m !== 0 ? -c / m : null;
  const cuts = [lo, ...(root !== null && root > lo && root < hi ? [root] : []), hi];
  let above = 0, below = 0;
  for (let i = 1; i < cuts.length; i++) {
    const piece = F(cuts[i]) - F(cuts[i - 1]);
    if (piece > 0) above += piece; else below -= piece;
  }
  return { net: F(b) - F(a), above, below, total: above + below };
}

// Displacement vs Distance velocities, with sign changes for exact running totals.
const CB_TRAVEL = {
  flip: { text: "v(t) = 2 − t", v: t => 2 - t, T: 4, s0: 0 },
  wave: { text: "v(t) = (t − 1)(t − 3)", v: t => (t - 1) * (t - 3), T: 4, s0: 0 },
  steps: { text: "v = 3, then −1, then 2", v: t => t < 2 ? 3 : t < 5 ? -1 : 2, T: 6, s0: -2, breaks: [2, 5] },
  turn: { text: "v(t) = 6 − 2t", v: t => 6 - 2 * t, T: 5, s0: 0 }
};
function cbTravelTotals(card, t) {
  const count = Math.max(1, Math.ceil(t * 400));
  const h = t / count;
  let displacement = 0, distance = 0;
  for (let i = 0; i < count; i++) {
    const v = card.v((i + 0.5) * h);
    displacement += v * h;
    distance += Math.abs(v) * h;
  }
  return { displacement, distance, position: card.s0 + displacement };
}

// Accumulation Grapher functions and exact node values of A.
const CB_GRAPHER = {
  ramp: { text: "f(t) = 2 − t", f: t => 2 - t, a: 0, nodes: [0, 1.5, 2, 1.5, 0] },
  step: { text: "f = 1, then −2", f: t => t < 2 ? 1 : -2, a: 0, breaks: [2], nodes: [0, 1, 2, 0, -2] },
  peaks: { text: "f(t) = t² − 4t + 3", f: t => t * t - 4 * t + 3, a: 0, nodes: [0, 4 / 3, 2 / 3, 0, 4 / 3] },
  start: { text: "f(t) = 2 − t", f: t => 2 - t, a: 2, nodes: [-2, -0.5, 0, -0.5, -2] }
};
function cbGrapherNodes(key) {
  return c => {
    const card = CB_GRAPHER[key];
    const built = [0, 1, 2, 3, 4].map(i => c.num("A" + i));
    const wrong = built.map((v, i) => cbSame(v, card.nodes[i]) ? null : "A(" + i + ")").filter(Boolean);
    return cbGrade(!wrong.length,
      wrong.length === 5 ? "None of the values match yet. Start from A(" + card.a + ") = 0 and add the signed area of each unit step."
        : "Check " + wrong.join(", ") + ". Add or subtract the signed area under f across each unit step, starting from A(" + card.a + ") = 0.",
      "A(" + card.a + ") = 0, then each step adds the signed area under " + card.text + ": " +
      card.nodes.map((v, i) => "A(" + i + ") = " + cbShow(v)).join(", ") + ". The dashed curve shows the exact A.");
  };
}

// FTC Shortcut cards.
const CB_FTC = {
  cube: { f: cbPoly([[2, 3]]), a: 1, b: 3, value: 26, field: "cube-val" },
  line: { f: cbPoly([[1, 4], [0, -1]]), a: 0, b: 2, value: 6, field: "line-val" },
  cross: { f: cbPoly([[2, 1]]), a: -1, b: 2, value: 3, field: "cross-val" },
  plus: { f: cbPoly([[1, 2]]), a: 1, b: 4, value: 15, field: "plus-val" },
  sum: { f: cbPoly([[3, 1]]), a: 0, b: 2, value: 4 }
};
function cbFtcSum(card, rule, n) {
  const f = x => cbPolyEval(card.f, x), h = (card.b - card.a) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += f(card.a + (i + (rule === "left" ? 0 : rule === "right" ? 1 : 0.5)) * h);
  return sum * h;
}
function cbFtcGrader(key) {
  return c => {
    const card = CB_FTC[key];
    const F = c.spec.built(c), derivative = cbPolyDeriv(F);
    if (!cbPolyEq(derivative, card.f)) {
      return cbGrade(false, "Your F has F′(x) = " + cbPolyText(derivative) + ", not " + cbPolyText(card.f) + ". Raise each power by one and divide by the new power.");
    }
    if (key === "plus" && cbSame(F[0] ?? 0, 0)) return cbSetup("Your F works. Now give it a nonzero constant C and check again.");
    const value = c.ans(card.field);
    const Fb = cbPolyEval(F, card.b), Fa = cbPolyEval(F, card.a);
    return cbGrade(cbFits(value, card.value), "Evaluate your F at both bounds and subtract: F(" + cbFmt(card.b) + ") − F(" + cbFmt(card.a) + ").",
      "F(x) = " + cbPolyText(F) + ". F(" + cbFmt(card.b) + ") − F(" + cbFmt(card.a) + ") = " + cbShow(Fb) + " − " + (Fa < 0 ? "(" + cbShow(Fa) + ")" : cbShow(Fa)) +
      " = " + cbShow(card.value) + "." + (key === "plus" ? " The constant " + cbShow(F[0]) + " appears in both values and cancels." : ""));
  };
}

// Antiderivative Designer: exact integrals of px² + qx + r.
const cbQuadIntegral = (p, q, r, a, b) => p * (b ** 3 - a ** 3) / 3 + q * (b * b - a * a) / 2 + r * (b - a);
function cbQuadMin(p, q, r, lo, hi) {
  const g = x => p * x * x + q * x + r;
  const points = [lo, hi];
  if (p !== 0) {
    const vertex = -q / (2 * p);
    if (vertex > lo && vertex < hi) points.push(vertex);
  }
  return Math.min(...points.map(g));
}

// Error Detective: the planted line and mistake for each case, and its diagram.
const CB_CASES = {
  divzero: { kind: "divzero", line2: "2",
    fix: "You can’t divide by h = 0. Expand first: [(2 + h)³ − 8] / h = 12 + 6h + h², which approaches 12, so f′(2) = 12." },
  revsign: { kind: "revsign", line2: "2",
    fix: "∫ from 3 to 1 = −∫ from 1 to 3, so the answer is −8. Using F directly also gives F(1) − F(3) = 1 − 9 = −8." },
  nettotal: { kind: "nettotal", line2: "3",
    fix: "F(4) − F(0) = 0 is the net integral. The region has a triangle of area 2 below the axis on [0, 2] and one of area 2 above on [2, 4], so the total area is 4." },
  minus: { kind: "minus", line2: "3",
    fix: "The theorem subtracts: F(2) − F(1) = 8 − 1 = 7." },
  onesided: { kind: "onesided", line2: "3",
    fix: "For h < 0 the point 1 + h lies where f(x) = 2x, so the left quotient is [2(1 + h) − 2] / h = 2. The sides give 2 and 1, so f′(1) does not exist." }
};
function cbDetectiveGrader(key) {
  return c => {
    const line = c.choice(key + "-line"), kind = c.choice(key + "-kind");
    const answer = CB_CASES[key];
    if (line !== answer.line2) return cbGrade(false, "Line " + line + " holds up. Read each line and ask whether it follows from the one before.");
    return cbGrade(kind === answer.kind, "Line " + line + " is the first wrong line, but that is not the mistake it makes. Which rule does it break?",
      "Line " + line + " is wrong. " + answer.fix);
  };
}
function cbDetectivePlan(key) {
  if (key === "divzero") {
    const f = x => x ** 3;
    return { text: "f(x) = x³ near x₀ = 2", x: [0, 3.2], y: [-4, 30], items: [
      cbCurve(f, "curve"), cbLine([2, 8], 15.25, "secant", { width: 1.8 }), cbLine([2, 8], 0, "area", { dashed: true, width: 2.2 }),
      cbDot([2.5, f(2.5)], "secant", { hollow: true, label: "Q at h = 0.5", small: true }),
      cbDot([2, 8], "point", { label: "P (2, 8)", offset: [-80, -10] }),
      cbText("claimed: flat", [0.2, 8], "area", { offset: [0, -8], small: true })
    ] };
  }
  if (key === "revsign") {
    const f = x => 2 * x;
    return { text: "∫ from 3 to 1 of 2x dx", x: [0, 4], y: [-1, 8.5], items: [
      ...cbSignedFill(f, 1, 3, "tangent", "area", 0.3, 20), cbCurve(f, "curve"),
      cbVline(1, "point", { label: "b = 1", offset: [4, 18] }), cbVline(3, "point", { label: "a = 3", offset: [4, 18] }),
      cbArrow([3, 0.4], [1, 0.4], "point", { width: 2, head: 9, label: "runs from 3 to 1", offset: [-4, -10] })
    ] };
  }
  if (key === "nettotal") {
    const f = x => x - 2;
    return { text: "f(x) = x − 2 on [0, 4]", x: [-0.5, 4.5], y: [-3, 3], items: [
      ...cbSignedFill(f, 0, 4, "tangent", "area", 0.35, 40), cbCurve(f, "curve"),
      cbText("claimed total area: 0", [0, 2.6], "area", { offset: [0, 0], small: true })
    ] };
  }
  if (key === "minus") {
    const f = x => 3 * x * x;
    return { text: "∫ from 1 to 2 of 3x² dx", x: [0, 2.5], y: [-1, 14], items: [
      ...cbSignedFill(f, 1, 2, "tangent", "area", 0.3, 30), cbCurve(f, "curve"),
      cbVline(1, "point", { label: "a = 1", offset: [4, 18] }), cbVline(2, "point", { label: "b = 2", offset: [4, 18] }),
      cbText("claimed area: 9", [0.1, 12.5], "area", { offset: [0, 0], small: true })
    ] };
  }
  const f = x => x < 1 ? 2 * x : x + 1;
  return { text: "f(x) = 2x, then x + 1, at x₀ = 1", x: [-0.5, 2.5], y: [-1, 4], items: [
    cbLine([1, 2], 2, "secant", { to: 1, width: 1.8 }), cbLine([1, 2], 1, "rect", { from: 1, width: 1.8 }),
    cbLine([1, 2], 1, "area", { to: 1, dashed: true, width: 2.2 }),
    cbCurve(f, "curve"), cbDot([1, 2], "point", { label: "(1, 2)", offset: [-60, -10] }),
    cbText("claimed left slope: 1 (dashed)", [-0.4, 3.6], "area", { offset: [0, 0], small: true })
  ] };
}

// Exponential and Wave Preview.
const CB_WAVES = {
  exp: { text: k => "e^(" + cbFmt(k) + "x)", f: k => x => Math.exp(k * x) },
  sin: { text: () => "sin x", f: () => Math.sin },
  cos: { text: () => "cos x", f: () => Math.cos }
};

// 3D Surface Walk headings as unit vectors.
const CB_HEADINGS = {
  E: [1, 0], NE: [Math.SQRT1_2, Math.SQRT1_2], N: [0, 1], NW: [-Math.SQRT1_2, Math.SQRT1_2],
  W: [-1, 0], SW: [-Math.SQRT1_2, -Math.SQRT1_2], S: [0, -1], SE: [Math.SQRT1_2, -Math.SQRT1_2]
};

// Quantum Calculus Preview: area of g from 0 to x.
const CB_SHAPES = {
  lin: { text: "x", f: x => x, G: x => x * x / 2, end: 2 },
  sq: { text: "x²", f: x => x * x, G: x => x ** 3 / 3, end: 3 }
};
function cbQuantumNorm(key, expected) {
  return c => {
    if (c.val("fn") !== key) return cbSetup("Choose g(x) = " + CB_SHAPES[key].text + " first.");
    const N = c.ans("N"), raw = CB_SHAPES[key].G(CB_SHAPES[key].end);
    return cbGrade(cbFits(N, expected), "With N = " + cbShow(N) + " the total area is " + cbShow(N * raw) + ". Aim for exactly 1.",
      "∫ g = " + cbShow(raw) + ", so N = 1/" + cbShow(raw) + " makes the total area 1.");
  };
}

// ---------------------------------------------------------------------------
// Station definitions. Each station has start / actions / show / checks, where
// each check is [first hint, second hint, grader]. A grader returns
// cbGrade(pass, failure message, worked steps).
// ---------------------------------------------------------------------------

const cbStations = {

  // 1 · Secant Sniper ---------------------------------------------------------
  secant: {
    curves: {
      cube: { text: "x³", f: x => x ** 3, slope: (x, h) => 3 * x * x + 3 * x * h + h * h, ok: () => true },
      recip: { text: "1/x", f: x => 1 / x, slope: (x, h) => -1 / (x * (x + h)), ok: x => x !== 0 },
      root: { text: "√x", f: x => Math.sqrt(x), slope: (x, h) => 1 / (Math.sqrt(x + h) + Math.sqrt(x)), ok: x => x >= 0 }
    },
    start(c) { c.s.log = []; },
    setup(c) {
      const curve = c.spec.curves[c.val("curve")];
      const x0 = Number(c.val("x0")), h = Number(c.val("h"));
      const x1 = Math.round((x0 + h) * 1000) / 1000;
      return { key: c.val("curve"), curve, x0, h, x1, valid: curve.ok(x1) };
    },
    actions: {
      fire(c) {
        const { key, curve, x0, h, x1, valid } = c.spec.setup(c);
        if (!valid) return "Q = (" + cbFmt(x1) + ", f(" + cbFmt(x1) + ")) is not on the curve. Choose another step.";
        const slope = curve.slope(x0, h);
        c.s.log.push({ key, x0, h, slope });
        if (c.s.log.length > 40) c.s.log.shift();
        return "Shot logged: f(x) = " + curve.text + ", x₀ = " + cbFmt(x0) + ", h = " + cbFmt(h) + ", secant slope " + cbFmt(slope) + ".";
      },
      clear(c) { c.s.log = []; return "Shot log cleared."; }
    },
    show(c) {
      const { key, curve, x0, h, x1, valid } = c.spec.setup(c);
      const lo = key === "cube" ? x0 - 1.6 : key === "recip" ? Math.max(0.25, x0 - 1.6) : Math.max(0, x0 - 2.2);
      const hi = x0 + (key === "root" ? 2.2 : 1.6);
      const y = cbRange([curve.f], lo, hi, { clamp: 30 });
      const p = [x0, curve.f(x0)];
      const items = [];
      const shots = c.s.log.filter(shot => shot.key === key && shot.x0 === x0).slice(-6);
      for (const shot of shots) items.push(cbLine(p, shot.slope, "dim", { width: 1.2, dashed: true }));
      items.push(cbCurve(curve.f, "curve", { label: "f(x) = " + curve.text, labelAt: lo + (hi - lo) * 0.12, offset: [8, -12] }));
      let state;
      if (valid) {
        const q = [x1, curve.f(x1)], slope = curve.slope(x0, h);
        items.push(cbLine(p, slope, "secant", { width: 2.4 }));
        items.push(cbPath([p, [x1, p[1]], q], "secant", { dashed: true, width: 1.6 }));
        items.push(cbDot(q, "point", { hollow: true, label: "Q", offset: [9, -9] }));
        state = "P (" + cbFmt(x0) + ", " + cbFmt(p[1]) + ") · Q (" + cbFmt(x1) + ", " + cbFmt(q[1]) + ") · rise " +
          cbFmt(q[1] - p[1]) + " · run " + cbFmt(h) + " · secant slope " + cbFmt(slope);
      } else state = "Q would be at x = " + cbFmt(x1) + ", outside the domain of f(x) = " + curve.text + ". Choose another step.";
      items.push(cbDot(p, "point", { label: "P", offset: [-20, -9] }));
      c.put("state", state);
      const log = c.node("[data-cb-log]");
      const signature = cbSig(c.s.log);
      if (log.dataset.cbSig !== signature) {
        log.dataset.cbSig = signature;
        log.replaceChildren(...c.s.log.map(shot => {
          const li = document.createElement("li");
          li.textContent = "f(x) = " + c.spec.curves[shot.key].text + " · x₀ = " + cbFmt(shot.x0) + " · h = " + cbFmt(shot.h) + " · slope " + cbFmt(shot.slope);
          return li;
        }));
      }
      return {
        caption: "f(x) = " + curve.text + " at x₀ = " + cbFmt(x0),
        desc: "Graph of f(x) = " + curve.text + " with base point P at x₀ = " + cbFmt(x0) + ". " + state + ". Earlier shots at this point appear as faint dashed lines.",
        panels: [cbPanel(CB_FULL, [lo, hi], y, items, { xName: "x" })]
      };
    },
    shots(c, key, x0) { return c.s.log.filter(shot => shot.key === key && shot.x0 === x0); },
    twoSided(c, key, x0, text) {
      const shots = c.spec.shots(c, key, x0).filter(shot => Math.abs(shot.h) <= 0.1 + 1e-12);
      if (!shots.some(shot => shot.h > 0) || !shots.some(shot => shot.h < 0)) {
        return "Log at least one shot with 0 < h ≤ 0.1 and one with −0.1 ≤ h < 0 on f(x) = " + text + " at x₀ = " + cbFmt(x0) + " first.";
      }
      return null;
    },
    checks: {
      cube: ["Fire h = +0.1, −0.1, +0.01 and −0.01. Which number do both columns of slopes approach?",
        "The secant slope here is 3 + 3h + h².", c => {
          const missing = c.spec.twoSided(c, "cube", 1, "x³");
          if (missing) return cbSetup(missing);
          const answer = c.ans("cube-ans");
          return cbGrade(cbFits(answer, 3), "Compare your number with the logged slopes for the smallest steps on each side.",
            "[(1 + h)³ − 1] / h = 3 + 3h + h². The extra terms vanish as h → 0 from either side, so f′(1) = 3.");
        }],
      recip: ["The slopes are negative because 1/x falls as x grows.",
        "The secant slope is −1 / (2(2 + h)). Let h shrink.", c => {
          const missing = c.spec.twoSided(c, "recip", 2, "1/x");
          if (missing) return cbSetup(missing);
          const answer = c.ans("recip-ans");
          return cbGrade(cbFits(answer, -0.25), "Read the logged slopes for |h| = 0.01 or 0.001 on both sides. Keep the sign.",
            "[1/(2 + h) − 1/2] / h = −1 / (2(2 + h)), which approaches −1/4 as h → 0.");
        }],
      root: ["The slopes are positive and shrink slowly as h shrinks.",
        "The secant slope is 1 / (√(4 + h) + 2). Let h shrink.", c => {
          const missing = c.spec.twoSided(c, "root", 4, "√x");
          if (missing) return cbSetup(missing);
          const answer = c.ans("root-ans");
          return cbGrade(cbFits(answer, 0.25), "Read the logged slopes for the smallest steps on both sides.",
            "Multiply [√(4 + h) − 2] / h by (√(4 + h) + 2) / (√(4 + h) + 2) to get 1 / (√(4 + h) + 2), which approaches 1/4.");
        }],
      average: ["The two slopes are 3.31 and 2.71.", "Add them and divide by 2.", c => {
        const shots = c.spec.shots(c, "cube", 1);
        const plus = shots.find(shot => cbSame(shot.h, 0.1)), minus = shots.find(shot => cbSame(shot.h, -0.1));
        if (!plus || !minus) return cbSetup("Log both h = +0.1 and h = −0.1 on f(x) = x³ at x₀ = 1 first.");
        const answer = c.ans("average-ans");
        return cbGrade(cbFits(answer, 3.01), "Average the two logged slopes " + cbFmt(plus.slope) + " and " + cbFmt(minus.slope) + ".",
          "(3.31 + 2.71) / 2 = 3.01. The ±3h terms cancel and only h² = 0.01 remains, so the average misses 3 by 0.01. Each one-sided slope misses it by about 0.3.");
      }]
    }
  },

  // 2 · Slope Matcher ---------------------------------------------------------
  match: {
    defaultCard: "line",
    cards: {
      line: { given: x => (x - 1) ** 2 - 2, givenName: "f", pickName: "f′", x: [-2, 4], pick: "line-pick", answer: "C",
        candidates: { A: x => 2 * x + 2, B: x => -2 * x + 2, C: x => 2 * x - 2, D: x => (x - 1) ** 2 - 2 } },
      cubic: { given: x => x ** 3 - 3 * x, givenName: "f", pickName: "f′", x: [-2.4, 2.4], pick: "cubic-pick", answer: "D",
        candidates: { A: x => 3 * x * x, B: x => 3 * x * x - 12, C: x => -3 * x * x + 3, D: x => 3 * x * x - 3 } },
      reverse: { given: x => -2 * x, givenName: "f′", pickName: "f", x: [-2.4, 2.4], pick: "reverse-pick", answer: "B",
        candidates: { A: x => x * x, B: x => -x * x + 1, C: x => -2 * x, D: x => -(x ** 3) } },
      family: { given: x => x * x - 1, givenName: "f′", pickName: "f", x: [-2.4, 2.4], answer: ["A", "B"],
        candidates: { A: x => x ** 3 / 3 - x, B: x => x ** 3 / 3 - x + 1, C: x => x ** 3 / 3 + x, D: x => 2 * x } }
    },
    picked(c, key) {
      const card = c.spec.cards[key];
      if (card.pick) return c.val(card.pick) ? [c.val(card.pick)] : [];
      return ["A", "B", "C", "D"].filter(letter => c.checked("family-" + letter));
    },
    show(c) {
      const key = cbCard(c), card = c.spec.cards[key];
      const picked = c.spec.picked(c, key);
      const given = cbPanel([40, 14, 230, 316], card.x, cbRange([card.given], ...card.x, { clamp: 12 }),
        [cbCurve(card.given, "curve", { width: 3 })], { title: "Given " + card.givenName, titleColor: "curve", xName: "x" });
      const boxes = [[306, 14, 120, 146], [438, 14, 120, 146], [306, 184, 120, 146], [438, 184, 120, 146]];
      const panels = [given, ...Object.entries(card.candidates).map(([letter, f], index) => cbPanel(boxes[index], card.x,
        cbRange([f], ...card.x, { clamp: 12 }), [cbCurve(f, picked.includes(letter) ? "tangent" : "secant", { width: 2.4, n: 120 })],
        { title: letter, ticks: "x", highlight: picked.includes(letter) ? "tangent" : null, gridX: 1, edgeLabels: false }))];
      c.put("state", "Given " + card.givenName + " on the left. Candidates for " + card.pickName + " are A to D." +
        (picked.length ? " Selected: " + picked.join(", ") + "." : ""));
      return {
        caption: "Find " + card.pickName,
        desc: "The left panel shows the given graph of " + card.givenName + ". Four small panels A to D show candidate graphs for " +
          card.pickName + ", each with its own vertical scale and x grid lines one unit apart." + (picked.length ? " Selected: " + picked.join(", ") + "." : ""),
        panels
      };
    },
    checks: {
      line: ["f is flat at its lowest point, x = 1, so f′ crosses zero there.", "Left of 1, f falls, so f′ is negative. Right of 1, f rises, so f′ is positive.",
        cbMatchSingle("line", "f′(x) = 2x − 2 is zero at x = 1, negative to the left and positive to the right, matching where the parabola falls and rises.")],
      cubic: ["f has horizontal tangents at its hump and dip, x = −1 and x = 1.", "f rises at both ends, so f′ is positive for large |x|.",
        cbMatchSingle("cubic", "f′(x) = 3x² − 3 is zero at x = ±1, negative between them where f falls, and positive outside where f rises.")],
      reverse: ["f′ is positive for x < 0 and negative for x > 0.", "So f rises, then falls, peaking at x = 0.",
        cbMatchSingle("reverse", "f(x) = −x² + 1 rises for x < 0, peaks at 0 and falls for x > 0. Its slope −2x matches the given graph. Graph C is f′ itself, not f.")],
      family: ["f′ is zero at x = ±1, so every valid f has flat points there.", "Shifting a graph up or down does not change its slopes.", c => {
        const picked = c.spec.picked(c, "family");
        if (!picked.length) return cbSetup("Select at least one graph.");
        return cbGrade(cbSig(picked) === cbSig(["A", "B"]), "Check each selected graph: it must be flat at x = ±1 and fall between them. Vertical shifts all count.",
          "A is x³/3 − x and B is the same curve lifted by 1. Both have slope x² − 1. C has slope x² + 1, which is never zero, and D is a line.");
      }]
    }
  },

  // 3 · Corner and Cusp Inspector ---------------------------------------------
  corner: {
    defaultCard: "kink",
    cards: {
      kink: { text: "f(x) = |x − 1| + x", f: x => Math.abs(x - 1) + x, x0: 1 },
      join: { text: "f(x) = x² for x < 1, 2x − 1 for x ≥ 1", f: x => x < 1 ? x * x : 2 * x - 1, x0: 1 },
      jump: { text: "f(x) = x for x < 1, x + 1 for x ≥ 1", f: x => x < 1 ? x : x + 1, x0: 1, breaks: [1], open: [1, 1] },
      root: { text: "f(x) = ∛x", f: Math.cbrt, x0: 0 },
      fold: { text: "f(x) = x|x|", f: x => x * Math.abs(x), x0: 0 }
    },
    show(c) {
      const card = c.spec.cards[cbCard(c)];
      const d = Number(c.val("size")), x0 = card.x0, fx0 = card.f(x0);
      const left = (card.f(x0 - d) - fx0) / -d, right = (card.f(x0 + d) - fx0) / d;
      const lo = x0 - 2, hi = x0 + 2;
      const y = cbRange([card.f], lo, hi, { clamp: 8, min: 3 });
      const items = [
        cbLine([x0, fx0], left, "secant", { to: x0, width: 2.2 }),
        cbLine([x0, fx0], right, "rect", { from: x0, width: 2.2 }),
        cbCurve(card.f, "curve", { breaks: card.breaks }),
        cbDot([x0 - d, card.f(x0 - d)], "secant", { hollow: true, r: 4.5 }),
        cbDot([x0 + d, card.f(x0 + d)], "rect", { hollow: true, r: 4.5 }),
        card.open ? cbDot(card.open, "curve", { hollow: true }) : null,
        cbDot([x0, fx0], "point", { label: "P", offset: [-22, -10] }),
        cbText("left slope " + cbFmt(left), [lo, y[0]], "secant", { offset: [6, -6], small: true }),
        cbText("right slope " + cbFmt(right), [hi, y[0]], "rect", { offset: [-6, -6], small: true, anchor: "end" })
      ];
      c.put("state", card.text + " at x₀ = " + cbFmt(x0) + " · |h| = " + cbFmt(d) + " · left quotient " + cbFmt(left) + " · right quotient " + cbFmt(right));
      return {
        caption: card.text,
        desc: "Graph of " + card.text + " near x₀ = " + cbFmt(x0) + ". The left secant uses h = −" + cbFmt(d) + " and has slope " + cbFmt(left) +
          ". The right secant uses h = +" + cbFmt(d) + " and has slope " + cbFmt(right) + ".",
        panels: [cbPanel(CB_FULL, [lo, hi], y, items, { xName: "x" })]
      };
    },
    checks: {
      kink: ["To the left of 1, |x − 1| = 1 − x, so f(x) = 1 there.", "To the right of 1, f(x) = 2x − 1.", c => {
        const l = c.ans("kink-left"), r = c.ans("kink-right"), type = c.choice("kink-type");
        if (!cbFits(l, 0) || !cbFits(r, 2)) return cbGrade(false, "Read the left and right quotients at |h| = 0.001 and round them to their limits.");
        return cbGrade(type === "corner", "Two different finite one-sided slopes: which classification fits?",
          "Left of 1 the graph is flat, so the left slope is 0. Right of 1 it is 2x − 1, so the right slope is 2. Finite but different limits make a corner, and f′(1) does not exist.");
      }],
      join: ["Left of 1, f(x) = x², whose slope at 1 is 2.", "Right of 1, f(x) = 2x − 1, a line with slope 2.", c => {
        const l = c.ans("join-left"), r = c.ans("join-right"), type = c.choice("join-type");
        if (!cbFits(l, 2) || !cbFits(r, 2)) return cbGrade(false, "Read both quotients at |h| = 0.001. Do they settle on the same number?");
        return cbGrade(type === "smooth", "Both sides approach the same finite slope. What does that make the point?",
          "Left: [(1 − h)² − 1] / (−h) = 2 − h → 2. Right: [2(1 + h) − 1 − 1] / h = 2. The pieces meet and share slope 2, so f′(1) = 2.");
      }],
      jump: ["f(1) = 2, but points just left of 1 have heights near 1.", "Divide a rise of about −1 by a tiny negative run.", c =>
        cbGrade(c.choice("jump-type") === "jump", "Watch the left quotient as |h| shrinks: does it settle at all?",
          "The left quotient is (1 + h)/h for the step size h, which grows without bound. The graph breaks at 1, so no derivative exists there.")],
      root: ["Both quotients equal h^(1/3) / h = h^(−2/3) for the step size h.", "As |h| shrinks, h^(−2/3) grows.", c =>
        cbGrade(c.choice("root-type") === "vertical", "Both quotients grow without bound with the same sign. Which classification describes a graph that turns vertical?",
          "∛h / h = h^(−2/3) → +∞ from both sides. The graph is continuous with a vertical tangent at 0, so f′(0) does not exist as a number.")],
      fold: ["The quotient [f(h) − f(0)] / h simplifies to |h|.", "|h| approaches 0 from both sides.", c => {
        const type = c.choice("fold-type");
        if (type !== "smooth") return cbGrade(false, "Compare the two quotients at |h| = 0.001. Do they disagree?");
        const slope = c.ans("fold-slope");
        return cbGrade(cbFits(slope, 0), "Both quotients approach the same number. Enter it.",
          "f(h) / h = h|h| / h = |h| → 0 from either side. x|x| bends smoothly through 0 with f′(0) = 0, unlike |x|.");
      }]
    }
  },

  // 4 · Rule Forge -------------------------------------------------------------
  forge: {
    defaultCard: "power",
    cards: {
      power: { target: cbPoly([[4, 1]]) },
      multiple: { target: cbPoly([[3, 5]]) },
      sum: { target: cbPoly([[3, 2], [1, -4], [0, 7]]) },
      free: { target: null }
    },
    start(c) { c.s.test = null; },
    built(c, quiet = false) {
      const read = name => quiet ? c.live(name) : c.num(name);
      return cbPoly([[Number(c.val("n")), read("a")], [Number(c.val("m")), read("b")], [0, read("k")]]);
    },
    predicted(c, quiet = false) {
      const read = name => quiet ? c.quiet(name) : c.ans(name);
      const p = read("p"), q = read("q");
      if (p === null || q === null) return null;
      return cbPoly([[Number(c.val("pp")), p], [Number(c.val("qp")), q]]);
    },
    actions: {
      test(c) {
        const f = c.spec.built(c), prediction = c.spec.predicted(c), x0 = c.num("x0");
        const h = 0.001, secant = (cbPolyEval(f, x0 + h) - cbPolyEval(f, x0)) / h;
        c.s.test = { f: cbSig(f), prediction: cbSig(prediction), x0, secant, predicted: cbPolyEval(prediction, x0) };
        return "Secant test run at x₀ = " + cbFmt(x0) + ".";
      }
    },
    show(c) {
      const f = c.spec.built(c, true), prediction = c.spec.predicted(c, true);
      const F = x => cbPolyEval(f, x);
      const items = [cbCurve(F, "curve", { label: "f", labelAt: -2.2, offset: [6, -10] })];
      if (prediction) items.push(cbCurve(x => cbPolyEval(prediction, x), "tangent", { dashed: true, width: 2.4, label: "prediction", labelAt: 2.1, offset: [-90, -10] }));
      const test = c.s.test;
      const current = test && test.f === cbSig(f) && test.prediction === cbSig(prediction);
      if (current) {
        items.push(cbLine([test.x0, F(test.x0)], test.secant, "secant", { width: 2 }));
        items.push(cbDot([test.x0, F(test.x0)], "point", { label: "x₀", offset: [8, 16] }));
      }
      c.put("state", "f(x) = " + cbPolyText(f) + " · prediction f′(x) = " + (prediction ? cbPolyText(prediction) : "incomplete"));
      c.put("test", !test ? "No secant test yet." : !current ? "Change detected. Run the secant test again for this f and prediction." :
        "At x₀ = " + cbFmt(test.x0) + ": secant with h = 0.001 gives " + cbFmt(test.secant) + ". Your prediction gives " + cbFmt(test.predicted) +
        ". Difference " + cbFmt(Math.abs(test.secant - test.predicted)) + ".");
      const fns = prediction ? [F, x => cbPolyEval(prediction, x)] : [F];
      return {
        caption: "f(x) = " + cbPolyText(f),
        desc: "Graph of f(x) = " + cbPolyText(f) + (prediction ? " with the predicted derivative " + cbPolyText(prediction) + " dashed" : "") +
          (current ? ". The secant test line at x₀ = " + cbFmt(test.x0) + " has slope " + cbFmt(test.secant) : "") + ".",
        panels: [cbPanel(CB_FULL, [-2.5, 2.5], cbRange(fns, -2.5, 2.5, { clamp: 24 }), items, { xName: "x" })]
      };
    },
    checks: {
      power: ["Multiply by the power 4, then lower the power by one.", "Enter coefficient 4 with power 3, and coefficient 0 for the second term.", cbForgeGrader("power")],
      multiple: ["A constant multiple stays in front: d/dx 5x³ = 5 · d/dx x³.", "5 · 3x² = 15x².", cbForgeGrader("multiple")],
      sum: ["Differentiate 2x³, −4x and 7 separately, then add.", "The constant 7 does not change, so its derivative is 0. Use coefficient 6, power 2 and coefficient −4, power 0.", cbForgeGrader("sum")],
      free: ["Try a = 1, n = 3, b = 2, m = 1.", "For x³ + 2x, predict 3x² + 2: coefficient 3 with power 2 and coefficient 2 with power 0.", cbForgeGrader("free")]
    }
  },

  // 5 · Chain Reaction ---------------------------------------------------------
  chain: {
    outers: {
      sq: { text: "u²", f: u => u * u, d: u => 2 * u },
      cube: { text: "u³", f: u => u ** 3, d: u => 3 * u * u }
    },
    show(c) {
      const outer = c.spec.outers[c.val("outer")];
      const k = c.live("k"), s = c.live("s"), x0 = c.live("x0");
      const g = x => outer.f(k * x + s);
      const u = k * x0 + s, rate = k * outer.d(u);
      const items = [
        cbCurve(outer.f, "dim", { dashed: true, width: 2, label: "f(u)", labelAt: -2.6, offset: [6, -10] }),
        cbLine([u, outer.f(u)], outer.d(u), "secant", { dashed: true, width: 1.6 }),
        cbCurve(g, "curve", { label: "g(x) = f(kx + s)", labelAt: 2.2, offset: [-150, -12] }),
        cbLine([x0, g(x0)], rate, "tangent", { width: 2.2 }),
        cbDot([u, outer.f(u)], "secant", { hollow: true, label: "u = " + cbFmt(u), offset: [9, 16], small: true }),
        cbDot([x0, g(x0)], "point", { label: "x₀", offset: [-24, -9] })
      ];
      c.put("state", "g(x) = f(" + cbFmt(k) + "x " + (s < 0 ? "− " : "+ ") + cbFmt(Math.abs(s)) + ") with f(u) = " + outer.text +
        " · u = " + cbFmt(u) + " · f′(u) = " + cbFmt(outer.d(u)) + " · g′(" + cbFmt(x0) + ") = " + cbFmt(k) + " × " + cbFmt(outer.d(u)) + " = " + cbFmt(rate));
      return {
        caption: "g(x) = f(kx + s)",
        desc: "The dashed curve is f(u) = " + outer.text + ". The solid curve is g(x) = f(" + cbFmt(k) + "x + " + cbFmt(s) + "). At x₀ = " + cbFmt(x0) +
          " the tangent to g has slope " + cbFmt(rate) + ", which is k times the slope " + cbFmt(outer.d(u)) + " of f at u = " + cbFmt(u) + ".",
        panels: [cbPanel(CB_FULL, [-3, 3], cbRange([outer.f, g], -3, 3, { clamp: 12 }), items, { xName: "x" })]
      };
    },
    checks: {
      double: ["g(x) = (2x)² = 4x².", "g′(x) = 2 · f′(2x) = 2 · 2(2x).", c => cbGrade(cbFits(c.ans("double-ans"), 8),
        "Evaluate f′ at u = 2x₀, then multiply by the inner rate 2.",
        "g′(1) = 2 · f′(2) = 2 · 4 = 8. Doubling the input speed doubles the rate, measured at the matching input u = 2.")],
      half: ["Half as fast means the inner function changes by 1/2 for each unit of x.", "Choose k = 1/2 and leave s at 0.", c => {
        const k = c.num("k"), s = c.num("s");
        return cbGrade(cbSame(k, 0.5) && cbSame(s, 0), "Set the inner multiplier so u = kx grows half as fast as x, with shift 0.",
          "With k = 1/2, g(x) = f(x/2) and g′(x) = (1/2) · f′(x/2). The graph is stretched horizontally by 2, so every slope is halved at the matching point.");
      }],
      reverse: ["g(x) = (−x)³ = −x³.", "g′(x) = (−1) · 3(−x)².", c => cbGrade(cbFits(c.ans("reverse-ans"), -3),
        "Use k = −1: multiply f′(−1) by −1.", "g′(1) = (−1) · f′(−1) = (−1) · 3 = −3. Running the input backward flips the sign of the rate.")],
      combo: ["The inner value at x = 1 is u = 3 · 1 + 1 = 4.", "g′(1) = 3 · f′(4).", c => cbGrade(cbFits(c.ans("combo-ans"), 24),
        "Find u = 3x₀ + 1 first, then multiply f′(u) by 3.", "u = 4 and f′(4) = 8, so g′(1) = 3 · 8 = 24. The shift moves where f is sampled. Only the multiplier 3 scales the rate.")]
    }
  },

  // 6 · Motion Tracker ---------------------------------------------------------
  motion: {
    start(c) { c.s.time = 0; c.s.playing = false; },
    flush(c) { c.s.playing = false; },
    edit(c, name) { if (name === "t") { c.s.time = c.live("t"); c.s.playing = false; } },
    tick(c, ms) {
      if (!c.s.playing) return false;
      c.s.time = Math.min(4, c.s.time + ms / 1000 * 0.7);
      c.set("t", Math.round(c.s.time * 4) / 4);
      if (c.s.time >= 4) c.s.playing = false;
      return true;
    },
    actions: {
      play(c) {
        if (c.s.time >= 4) c.s.time = 0;
        if (c.reduced()) {
          c.s.time = Math.min(4, Math.round(c.s.time * 4) / 4 + 0.25);
          c.set("t", c.s.time);
          return "Reduced effects is on, so the time advanced one step to t = " + cbFmt(c.s.time) + " s.";
        }
        c.s.playing = true;
        return "Playing the motion.";
      },
      pause(c) { c.s.playing = false; return "Paused at t = " + cbFmt(c.s.time) + " s."; }
    },
    show(c) {
      const t = c.s.time;
      const s = x => x ** 3 - 6 * x * x + 9 * x, v = x => 3 * x * x - 12 * x + 9, a = x => 6 * x - 12;
      const track = cbPanel([44, 8, 500, 44], [-0.5, 4.5], [-1, 1], [
        cbPath([[0, -0.45], [4, -0.45]], "dim", { width: 1.4 }),
        cbText("0", [0, -0.45], "axis", { offset: [-4, 4], small: true, anchor: "end" }),
        cbText("4 m", [4, -0.45], "axis", { offset: [6, 4], small: true }),
        cbDot([s(t), -0.45], "point", { r: 7, label: "cart", offset: [10, -6], small: true })
      ], { grid: false, axes: false, title: "track position (m)", smallTitle: true, ticks: false });
      const panel = (box, f, range, slope, title, color, gridY) => cbPanel(box, [0, 4], range, [
        cbVline(t, "point", { width: 1.2 }),
        cbCurve(f, color, { width: 2.6 }),
        slope ? cbLine([t, f(t)], slope(t), "tangent", { from: Math.max(0, t - 0.7), to: Math.min(4, t + 0.7), width: 2 }) : null,
        cbDot([t, f(t)], "point")
      ], { title, smallTitle: true, ticks: "y", gridX: 1, gridY });
      c.put("state", "t = " + cbFmt(t) + " s · s = " + cbFmt(s(t)) + " m · v = " + cbFmt(v(t)) + " m/s · a = " + cbFmt(a(t)) + " m/s²");
      return {
        caption: "t = " + cbFmt(t) + " s",
        desc: "A cart on a track and three graphs against time from 0 to 4 s: position, velocity and acceleration. At t = " + cbFmt(t) +
          " s the position tangent has slope " + cbFmt(v(t)) + " and the velocity tangent has slope " + cbFmt(a(t)) + ".",
        panels: [
          track,
          panel([44, 64, 500, 84], s, [-1, 5], v, "position s (m)", "curve", 2),
          panel([44, 162, 500, 84], v, [-4, 10], a, "velocity v (m/s)", "secant", 5),
          { ...panel([44, 260, 500, 84], a, [-13, 13], null, "acceleration a (m/s²)", "rect", 10), ticks: true, xName: "t (s)" }
        ]
      };
    },
    checks: {
      velocity: ["Velocity is the slope of the position graph at t = 2.", "v(t) = 3t² − 12t + 9.", c => cbGrade(cbFits(c.ans("velocity-ans"), -3),
        "Scrub to t = 2 and read the tangent slope on the position graph, or evaluate v(2).",
        "v(2) = 3 · 4 − 24 + 9 = −3 m/s. The cart moves backward at 3 m/s.")],
      rest: ["At rest means v(t) = 0, where the position graph has a horizontal tangent.", "3t² − 12t + 9 = 3(t − 1)(t − 3).", c => {
        const pair = [c.ans("rest-one"), c.ans("rest-two")];
        return cbGrade(cbFitsSet(pair, [1, 3]), "Find where the velocity graph crosses zero.",
          "v(t) = 3(t − 1)(t − 3) = 0 at t = 1 s and t = 3 s. The position graph has a peak at t = 1 and a valley at t = 3.");
      }],
      accel: ["Acceleration is the slope of the velocity graph.", "a(t) = 6t − 12.", c => cbGrade(cbFits(c.ans("accel-ans"), 6),
        "Read the tangent slope on the velocity graph at t = 3, or evaluate a(3).", "a(3) = 18 − 12 = 6 m/s².")],
      speed: ["Find the signs of v(2.5) and a(2.5).", "Opposite signs mean the speed is shrinking.", c => cbGrade(c.choice("speed-pick") === "down",
        "Compare the signs of v and a at t = 2.5.",
        "v(2.5) = −2.25 m/s and a(2.5) = 3 m/s². The velocity is negative while the acceleration is positive, so |v| shrinks: the cart is slowing down as it approaches its stop at t = 3.")]
    }
  },

  // 7 · Rectangle Race ---------------------------------------------------------
  race: {
    cards: { over: ["fall", 4], exact: ["line", 4], curve: ["cube", 4], winner: ["root", 8] },
    start(c) { c.s.race = null; },
    flush(c) {
      if (c.s.race) { c.set("n", 32); c.s.race = null; }
    },
    open(c, check) {
      const [fn, n] = c.spec.cards[check];
      c.set("fn", fn);
      c.set("n", n);
      c.s.race = null;
    },
    edit(c, name) { if (name === "n" || name === "fn") c.s.race = null; },
    // Returns true while the race runs, so the frame loop keeps going between doublings.
    tick(c, ms) {
      if (!c.s.race) return false;
      c.s.race.elapsed += ms;
      if (c.s.race.elapsed < 650) return true;
      c.s.race.elapsed = 0;
      const steps = [1, 2, 4, 8, 16, 32];
      c.s.race.index += 1;
      c.set("n", steps[c.s.race.index]);
      if (c.s.race.index >= steps.length - 1) c.s.race = null;
      return true;
    },
    actions: {
      race(c) {
        if (c.reduced()) {
          c.set("n", 32);
          return "Reduced effects is on, so the race jumped to n = 32.";
        }
        c.set("n", 1);
        c.s.race = { index: 0, elapsed: 0 };
        return "Race started at n = 1. The count doubles until n = 32.";
      },
      stop(c) { c.s.race = null; return "Race stopped at n = " + c.val("n") + "."; }
    },
    show(c) {
      const card = CB_RACE[c.val("fn")], n = c.live("n"), rule = c.val("show");
      const sums = cbRaceSums(card, n), h = (card.b - card.a) / n;
      const items = [cbFill([[card.a, 0], ...Array.from({ length: 61 }, (_, i) => {
        const x = card.a + (card.b - card.a) * i / 60;
        return [x, card.f(x)];
      }), [card.b, 0]], "area", 0.16)];
      if (n <= 32) for (let i = 0; i < n; i++) {
        const x1 = card.a + i * h, x2 = x1 + h;
        const shape = rule === "trap" ? [[x1, 0], [x1, card.f(x1)], [x2, card.f(x2)], [x2, 0]]
          : (() => { const y = card.f(rule === "left" ? x1 : rule === "right" ? x2 : x1 + h / 2); return [[x1, 0], [x1, y], [x2, y], [x2, 0]]; })();
        items.push(cbPath([...shape, shape[0]], "rect", { width: 1.4 }));
      }
      items.push(cbCurve(card.f, "curve", { from: card.a - 0.3, to: card.b + 0.3 }));
      const errors = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v - card.exact]));
      const top = Math.max(1e-6, ...Object.values(errors).map(Math.abs)) * 1.25;
      const colors = { left: "secant", right: "rect", mid: "tangent", trap: "point" };
      const bars = Object.entries(errors).map(([k, e], i) => cbFill([[i + 0.15, 0], [i + 0.15, Math.abs(e)], [i + 0.85, Math.abs(e)], [i + 0.85, 0]], colors[k], 0.85));
      const barLabels = Object.keys(errors).map((k, i) => cbText(k === "mid" ? "M" : k[0].toUpperCase(), [i + 0.5, 0], colors[k], { offset: [0, 15], anchor: "middle", small: true }));
      c.put("state", card.text + " on [" + cbFmt(card.a) + ", " + cbFmt(card.b) + "] · n = " + n + " · left " + cbFmt(sums.left) + " · right " + cbFmt(sums.right) +
        " · midpoint " + cbFmt(sums.mid) + " · trapezoid " + cbFmt(sums.trap) + " · exact " + cbShow(card.exact));
      const y = cbRange([card.f], card.a - 0.3, card.b + 0.3, { clamp: 20 });
      return {
        caption: card.text + " · n = " + n,
        desc: card.text + " on [" + cbFmt(card.a) + ", " + cbFmt(card.b) + "] with " + n + " " + CB_RULE_NAMES[rule] + " shapes. Errors: left " + cbFmt(errors.left) +
          ", right " + cbFmt(errors.right) + ", midpoint " + cbFmt(errors.mid) + ", trapezoid " + cbFmt(errors.trap) + ".",
        panels: [
          cbPanel([44, 14, 340, 314], [card.a - 0.3, card.b + 0.3], y, items, { xName: "x" }),
          cbPanel([424, 14, 132, 314], [0, 4], [0, top], [...bars, ...barLabels], { title: "|error|", smallTitle: true, ticks: "y", gridX: 1, axes: false })
        ]
      };
    },
    checks: {
      over: ["On a falling curve, the left edge of each slice is its highest point.", "Heights at 0, 0.5, 1 and 1.5 are 4, 3.75, 3 and 1.75. Multiply their sum by Δx = 0.5.", c => {
        const dir = c.choice("over-dir"), value = c.ans("over-val");
        return cbGrade(dir === "over" && cbFits(value, 6.25), dir !== "over" ? "Which height does a left rectangle use on a falling curve: the tallest or the shortest in its slice?" : "Recompute the left sum with Δx = 0.5.",
          "Left sum = (4 + 3.75 + 3 + 1.75) × 0.5 = 6.25, which is over the exact 16/3 ≈ 5.333. Each left rectangle overshoots the falling curve.");
      }],
      exact: ["On a line, the midpoint height equals the average height of the slice.", "A trapezoid under a line fits the region exactly.", c => {
        const picked = ["left", "right", "mid", "trap"].filter(k => c.checked("exact-" + k));
        if (!picked.length) return cbSetup("Select at least one rule.");
        return cbGrade(cbSig(picked) === cbSig(["mid", "trap"]), "Run the race on 2x + 1 and look at which bars stay at zero for every n.",
          "Midpoint and trapezoid sums give exactly 12 for every n. Left sums run low and right sums run high on this rising line.");
      }],
      curve: ["On an upward-curving graph, the chord between endpoints lies above the curve.", "The tangent at the midpoint lies below the curve, and the midpoint rectangle has the same area as the trapezoid under that tangent.", c => {
        const mid = c.choice("curve-mid"), trap = c.choice("curve-trap");
        return cbGrade(mid === "below" && trap === "above", "Compare the curve with its chords (trapezoids) and with its tangent lines (midpoints).",
          "With n = 4: midpoint " + cbFmt(cbRaceSums(CB_RACE.cube, 4).mid) + " and trapezoid " + cbFmt(cbRaceSums(CB_RACE.cube, 4).trap) + " around the exact 4. Upward curvature puts chords above the curve and tangents below it.");
      }],
      winner: ["√x rises, so left sums run low and right sums run high.", "Compare the error bars at n = 8.", c => {
        const pick = c.choice("win-pick");
        const sums = cbRaceSums(CB_RACE.root, 8);
        const errors = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, Math.abs(v - 16 / 3)]));
        const best = Object.entries(errors).sort((p, q) => p[1] - q[1])[0][0];
        return cbGrade(pick === best, "Set n = 8 on √x and compare the four bars.",
          "Errors at n = 8: left " + cbFmt(errors.left) + ", right " + cbFmt(errors.right) + ", midpoint " + cbFmt(errors.mid) + ", trapezoid " + cbFmt(errors.trap) +
          ". The " + CB_RULE_NAMES[best] + " rule wins. Its errors from the downward curvature are smallest.");
      }]
    }
  },

  // 8 · Signed Area Ledger ------------------------------------------------------
  ledger: {
    show(c) {
      const m = c.live("m"), k = c.live("c"), a = c.live("a"), b = c.live("b");
      const f = x => m * x + k, L = cbLedger(m, k, a, b);
      const y = cbRange([f], -4.5, 4.5, { clamp: 14, min: 4 });
      const items = [
        ...cbSignedFill(f, a, b, "tangent", "area", 0.35, 40),
        cbCurve(f, "curve", { label: "f(x) = " + cbPolyText(cbPoly([[1, m], [0, k]])), labelAt: -4, offset: [6, -12] }),
        cbVline(a, "point", { label: "a", offset: [4, 18] }),
        cbVline(b, "point", { label: "b", offset: [4, 34] })
      ];
      if (a !== b) items.push(cbArrow([a, y[0] + (y[1] - y[0]) * 0.05], [b, y[0] + (y[1] - y[0]) * 0.05], "point", { width: 2, head: 9 }));
      const text = "∫ from " + cbFmt(a) + " to " + cbFmt(b) + " = " + cbShow(L.net) + " · area above " + cbShow(L.above) + " · area below " + cbShow(L.below) +
        " · total area " + cbShow(L.total) + (a > b ? " · reversed bounds, so the signs flip" : "");
      c.put("state", text);
      return {
        caption: "net " + cbShow(L.net) + " · total " + cbShow(L.total),
        desc: "Line f(x) = " + cbPolyText(cbPoly([[1, m], [0, k]])) + " with region from a = " + cbFmt(a) + " to b = " + cbFmt(b) + ". Green area lies above the axis and red below. " + text + ".",
        panels: [cbPanel(CB_FULL, [-4.5, 4.5], y, items, { xName: "x", gridX: 1 })]
      };
    },
    read(c) { return { m: c.num("m"), k: c.num("c"), a: c.num("a"), b: c.num("b") }; },
    checks: {
      zero: ["Let the line cross the axis inside [a, b] so equal areas cancel.", "Try f(x) = x − 1 on [0, 2].", c => {
        const { m, k, a, b } = c.spec.read(c), L = cbLedger(m, k, a, b);
        if (m === 1 && k === 0 && Math.min(a, b) === -1 && Math.max(a, b) === 1) return cbSetup("That is the Calculus Lab’s example. Build a different line or interval.");
        return cbGrade(cbSame(L.net, 0) && L.total >= 1 - 1e-9, "Net " + cbShow(L.net) + " with total area " + cbShow(L.total) + ". You need net 0 and total at least 1.",
          "Net " + cbShow(L.net) + ": the area above (" + cbShow(L.above) + ") cancels the area below (" + cbShow(L.below) + "), yet the total area is " + cbShow(L.total) + ".");
      }],
      neg: ["Keep the region below the axis with a < b.", "Try f(x) = −2 on [0, 3].", c => {
        const { m, k, a, b } = c.spec.read(c), L = cbLedger(m, k, a, b);
        if (!(a < b)) return cbSetup("Choose a < b for this card.");
        return cbGrade(cbSame(L.net, -6), "The net integral is " + cbShow(L.net) + ". Aim for −6.",
          "With a < b, the area below the axis counts negatively: net = " + cbShow(L.above) + " − " + cbShow(L.below) + " = −6.");
      }],
      rev: ["Running from right to left flips the sign of every slice.", "Try f(x) = −2 with a = 2 and b = 0.", c => {
        const { m, k, a, b } = c.spec.read(c), L = cbLedger(m, k, a, b);
        if (!(a > b)) return cbSetup("Choose a > b for this card.");
        return cbGrade(cbSame(L.net, 4), "The net integral is " + cbShow(L.net) + ". Aim for +4.",
          "∫ from " + cbFmt(a) + " to " + cbFmt(b) + " = −∫ from " + cbFmt(b) + " to " + cbFmt(a) + " = −(" + cbShow(-L.net) + ") = 4.");
      }],
      split: ["You need area above minus area below to be 6, and above plus below to be 10.", "So 8 above and 2 below. Try f(x) = x on [−2, 4].", c => {
        const { m, k, a, b } = c.spec.read(c), L = cbLedger(m, k, a, b);
        return cbGrade(cbSame(L.net, 6) && cbSame(L.total, 10), "Net " + cbShow(L.net) + " and total " + cbShow(L.total) + ". Aim for net 6 and total 10.",
          "Area above " + cbShow(L.above) + " and below " + cbShow(L.below) + ": net " + cbShow(L.above) + " − " + cbShow(L.below) + " = 6, total " + cbShow(L.above) + " + " + cbShow(L.below) + " = 10.");
      }]
    }
  },

  // 9 · Displacement vs Distance -------------------------------------------------
  travel: {
    defaultCard: "flip",
    cards: CB_TRAVEL,
    start(c) { c.s.time = 0; c.s.driving = false; },
    flush(c) { c.s.driving = false; },
    open(c, check) {
      c.field("t").max = CB_TRAVEL[check].T;
      c.set("t", 0);
      c.s.time = 0;
      c.s.driving = false;
    },
    edit(c, name) { if (name === "t") { c.s.time = c.live("t"); c.s.driving = false; } },
    tick(c, ms) {
      if (!c.s.driving) return false;
      const T = CB_TRAVEL[cbCard(c)].T;
      c.s.time = Math.min(T, c.s.time + ms / 1000 * 0.8);
      c.set("t", Math.round(c.s.time * 4) / 4);
      if (c.s.time >= T) c.s.driving = false;
      return true;
    },
    actions: {
      drive(c) {
        const T = CB_TRAVEL[cbCard(c)].T;
        if (c.s.time >= T) c.s.time = 0;
        if (c.reduced()) {
          c.s.time = Math.min(T, Math.round(c.s.time * 4) / 4 + 0.25);
          c.set("t", c.s.time);
          return "Reduced effects is on, so the time advanced one step to t = " + cbFmt(c.s.time) + " s.";
        }
        c.s.driving = true;
        return "Driving.";
      },
      pause(c) { c.s.driving = false; return "Paused at t = " + cbFmt(c.s.time) + " s."; }
    },
    show(c) {
      const card = CB_TRAVEL[cbCard(c)];
      c.field("t").max = card.T;
      const t = Math.min(c.s.time, card.T);
      const now = cbTravelTotals(card, t);
      const positions = Array.from({ length: 41 }, (_, i) => cbTravelTotals(card, card.T * i / 40).position);
      const lo = Math.min(...positions) - 0.6, hi = Math.max(...positions) + 0.6;
      const track = cbPanel([44, 10, 500, 54], [lo, hi], [-1, 1], [
        cbPath([[lo, -0.3], [hi, -0.3]], "dim", { width: 1.4 }),
        cbDot([card.s0, -0.3], "dim", { hollow: true, r: 4 }),
        cbDot([now.position, -0.3], "point", { r: 7, label: "cart", offset: [10, 4], small: true })
      ], { axes: false, title: "position (m), ○ start", smallTitle: true, ticks: "x", gridX: 1, gridY: 5 });
      const y = cbRange([card.v], 0, card.T, { clamp: 10, min: 3 });
      const graph = cbPanel([44, 96, 500, 232], [0, card.T], y, [
        ...cbSignedFill(card.v, 0, t, "tangent", "area", 0.35, 60),
        cbCurve(card.v, "curve", { breaks: card.breaks }),
        cbVline(t, "point", { width: 1.4 }),
        cbDot([t, card.v(Math.min(t, card.T - 1e-9))], "point")
      ], { title: "velocity v (m/s)", smallTitle: true, xName: "t (s)", gridX: 1 });
      const text = card.text + " · t = " + cbFmt(t) + " s · displacement " + cbFmt(now.displacement) + " m · distance " + cbFmt(now.distance) + " m · position " + cbFmt(now.position) + " m";
      c.put("state", text);
      return {
        caption: card.text,
        desc: "Top: the cart on its track. Bottom: " + card.text + " from 0 to " + card.T + " s, with the area up to t shaded green where v > 0 and red where v < 0. " + text + ".",
        panels: [track, graph]
      };
    },
    checks: {
      flip: ["v > 0 until t = 2, then v < 0.", "Each half is a triangle of area 2.", c => {
        const d = c.ans("flip-disp"), s = c.ans("flip-dist");
        return cbGrade(cbFits(d, 0) && cbFits(s, 4), "Displacement is the signed area. Distance adds the sizes of both triangles.",
          "Forward 2 m from t = 0 to 2, back 2 m from t = 2 to 4. Displacement 2 − 2 = 0 m. Distance 2 + 2 = 4 m.");
      }],
      wave: ["v changes sign at t = 1 and t = 3. Integrate each piece separately.", "∫(t² − 4t + 3) dt = t³/3 − 2t² + 3t. The pieces are 4/3, −4/3 and 4/3.", c => {
        const d = c.ans("wave-disp"), s = c.ans("wave-dist");
        return cbGrade(cbFits(d, 4 / 3) && cbFits(s, 4), "Split at t = 1 and t = 3. Displacement keeps the signs, distance drops them.",
          "Pieces: [0, 1] gives +4/3, [1, 3] gives −4/3, [3, 4] gives +4/3. Displacement 4/3 m. Distance 4/3 + 4/3 + 4/3 = 4 m.");
      }],
      steps: ["Each leg is a rectangle: velocity times duration.", "Legs: 3 × 2 = 6, −1 × 3 = −3, 2 × 1 = 2.", c => {
        const d = c.ans("steps-disp"), s = c.ans("steps-dist"), p = c.ans("steps-final");
        return cbGrade(cbFits(d, 5) && cbFits(s, 11) && cbFits(p, 3), "Find the three leg displacements, then combine them with and without signs. Add the start −2 for the final position.",
          "Displacement 6 − 3 + 2 = 5 m. Distance 6 + 3 + 2 = 11 m. Final position −2 + 5 = 3 m.");
      }],
      turn: ["The cart turns around when v = 0.", "Forward area on [0, 3] is 9 m, backward area on [3, 5] is 4 m.", c => {
        const time = c.ans("turn-time"), s = c.ans("turn-dist");
        return cbGrade(cbFits(time, 3) && cbFits(s, 13), "Solve 6 − 2t = 0, then add the sizes of the two triangles on either side.",
          "6 − 2t = 0 at t = 3 s. Forward ½ × 3 × 6 = 9 m, then back ½ × 2 × 4 = 4 m. Distance 13 m, displacement 5 m.");
      }]
    }
  },

  // 10 · Accumulation Grapher ----------------------------------------------------
  grapher: {
    defaultCard: "ramp",
    cards: CB_GRAPHER,
    show(c) {
      const key = cbCard(c), card = CB_GRAPHER[key];
      const x = c.live("edge");
      const A = u => card.a <= u ? cbIntegrate(card.f, card.a, u, 400) : -cbIntegrate(card.f, u, card.a, 400);
      const built = [0, 1, 2, 3, 4].map(i => c.live("A" + i));
      const fPanel = cbPanel([44, 14, 500, 140], [0, 4], cbRange([card.f], 0, 4, { clamp: 6, min: 3 }), [
        ...cbSignedFill(card.f, card.a, x, "tangent", "area", 0.35, 60),
        cbCurve(card.f, "curve", { breaks: card.breaks }),
        cbVline(card.a, "dim", { label: "a", offset: [4, 16] }),
        cbVline(x, "point", { label: "x", offset: [4, 30], width: 1.4 })
      ], { title: "f(t)", smallTitle: true, gridX: 1 });
      const revealed = c.s.revealed[key];
      const aItems = [
        revealed ? cbCurve(A, "tangent", { dashed: true, width: 2.2, n: 120 }) : null,
        key === "peaks" ? null : cbPath(built.map((v, i) => [i, v]), "point", { width: 2.4 }),
        ...(key === "peaks" ? [] : built.map((v, i) => cbDot([i, v], "point", { r: 4.5 }))),
        cbVline(x, "point", { width: 1.2, opacity: 0.6 })
      ];
      const aRange = cbRange([u => A(u)], 0, 4, { clamp: 6, include: [0, ...built], min: 3 });
      const aPanel = cbPanel([44, 186, 500, 142], [0, 4], aRange, aItems, { title: revealed ? "your A (dots) and exact A (dashed)" : "your A(x)", smallTitle: true, xName: "x", gridX: 1 });
      c.put("state", card.text + " with a = " + card.a + " · your A: " + built.map((v, i) => "A(" + i + ") = " + cbFmt(v)).join(", "));
      return {
        caption: card.text + ", a = " + card.a,
        desc: "Top: " + card.text + " with the signed area from a = " + card.a + " to x = " + cbFmt(x) + " shaded. Bottom: your values " +
          built.map((v, i) => "A(" + i + ") = " + cbFmt(v)).join(", ") + (revealed ? ", with the exact A dashed." : "."),
        panels: [fPanel, aPanel]
      };
    },
    checks: {
      ramp: ["A(0) = 0. From 0 to 1, f falls from 2 to 1, so the area is 1.5.", "The steps add 1.5, 0.5, −0.5 and −1.5.", cbGrapherNodes("ramp")],
      step: ["A grows by 1 per unit while f = 1.", "After t = 2, A drops by 2 per unit.", cbGrapherNodes("step")],
      peaks: ["f = (t − 1)(t − 3): positive before 1, negative between 1 and 3, positive after 3.", "A rises, then falls, then rises again.", c => {
        const max = c.choice("peaks-max"), min = c.choice("peaks-min");
        return cbGrade(max === "1" && min === "3", "Find where f changes sign. Which change makes A stop rising?",
          "f changes from + to − at t = 1, so A peaks there with A(1) = 4/3. It changes from − to + at t = 3, so A dips there with A(3) = 0.");
      }],
      start: ["Now A(2) = 0, because the integral starts at a = 2.", "For x < 2 the integral runs backward, so positive f gives negative A.", cbGrapherNodes("start")]
    }
  },

  // 11 · FTC Shortcut ---------------------------------------------------------------
  ftc: {
    defaultCard: "cube",
    cards: CB_FTC,
    open(c, check) { if (check === "sum") c.set("n", 4); },
    built(c, quiet = false) {
      const read = name => quiet ? c.quiet(name) : c.ans(name);
      const values = ["c1", "c2", "c3", "cc"].map(read);
      if (values.includes(null)) return null;
      return cbPoly([[Number(c.val("p1")), values[0]], [Number(c.val("p2")), values[1]], [Number(c.val("p3")), values[2]], [0, values[3]]]);
    },
    show(c) {
      const key = cbCard(c), card = CB_FTC[key], rule = c.val("rule"), n = c.live("n");
      const f = x => cbPolyEval(card.f, x), F = c.spec.built(c, true);
      const lo = card.a - 0.5, hi = card.b + 0.5, h = (card.b - card.a) / n;
      const rects = [];
      if (n <= 64) for (let i = 0; i < n; i++) {
        const x1 = card.a + i * h, x2 = x1 + h, y = f(x1 + (rule === "left" ? 0 : rule === "right" ? h : h / 2));
        rects.push(cbPath([[x1, 0], [x1, y], [x2, y], [x2, 0]], "rect", { width: 1.2 }));
      }
      const sum = cbFtcSum(card, rule, n);
      const top = cbPanel([44, 14, 500, 150], [lo, hi], cbRange([f], lo, hi, { clamp: 30 }), [
        ...cbSignedFill(f, card.a, card.b, "area", "area", 0.2, 40), ...rects, cbCurve(f, "curve"),
        cbVline(card.a, "point", { label: "a", offset: [4, 16] }), cbVline(card.b, "point", { label: "b", offset: [4, 16] })
      ], { title: "f(x) = " + cbPolyText(card.f), smallTitle: true, gridX: 1 });
      const bottomItems = [];
      let Ftext = "Your F is incomplete.";
      if (F) {
        const G = x => cbPolyEval(F, x), Fa = G(card.a), Fb = G(card.b);
        bottomItems.push(cbCurve(G, "tangent"), cbDot([card.a, Fa], "point", { label: "F(a)", small: true }), cbDot([card.b, Fb], "point", { label: "F(b)", small: true }),
          cbPath([[card.b + 0.25, Fa], [card.b + 0.25, Fb]], "secant", { width: 2.4 }), cbPath([[card.a, Fa], [card.b + 0.25, Fa]], "secant", { dashed: true, width: 1.2 }));
        Ftext = "F(x) = " + cbPolyText(F) + " · F′(x) = " + cbPolyText(cbPolyDeriv(F));
      }
      const G = F ? (x => cbPolyEval(F, x)) : () => 0;
      const bottom = cbPanel([44, 196, 500, 132], [lo, hi], cbRange([G], lo, hi, { clamp: 60 }), bottomItems,
        { title: "your F(x)", smallTitle: true, xName: "x", gridX: 1 });
      c.put("state", Ftext + " · " + CB_RULE_NAMES[rule] + " sum with n = " + n + ": " + cbFmt(sum));
      return {
        caption: "∫ from " + cbFmt(card.a) + " to " + cbFmt(card.b) + " of " + cbPolyText(card.f) + " dx",
        desc: "Top: f(x) = " + cbPolyText(card.f) + " on [" + cbFmt(card.a) + ", " + cbFmt(card.b) + "] with " + n + " " + CB_RULE_NAMES[rule] +
          " rectangles summing to " + cbFmt(sum) + ". Bottom: " + Ftext + ".",
        panels: [top, bottom]
      };
    },
    checks: {
      cube: ["Which function has derivative 3x²?", "F(x) = x³, so compute 27 − 1.", cbFtcGrader("cube")],
      line: ["Antidifferentiate each term: 4x and −1.", "F(x) = 2x² − x. Use coefficient 2 with power 2 and coefficient −1 with power 1.", cbFtcGrader("line")],
      cross: ["F(x) = x³/3. Type the coefficient as 1/3.", "F(2) − F(−1) = 8/3 − (−1/3).", cbFtcGrader("cross")],
      plus: ["F(x) = x² + C for any C.", "Try C = 5: F(4) − F(1) = 21 − 6.", cbFtcGrader("plus")],
      sum: ["Midpoint sums improve quickly on smooth curves.", "Try the midpoint rule with n = 16.", c => {
        const rule = c.val("rule"), n = c.num("n"), sum = cbFtcSum(CB_FTC.sum, rule, n);
        return cbGrade(Math.abs(sum - 4) <= 0.01 + 1e-12, "The " + CB_RULE_NAMES[rule] + " sum with n = " + n + " is " + cbFmt(sum) + ", which misses F(2) − F(0) = 4 by " + cbFmt(Math.abs(sum - 4)) + ".",
          "F(x) = x⁴/4 gives F(2) − F(0) = 4. The " + CB_RULE_NAMES[rule] + " sum with n = " + n + " is " + cbFmt(sum) + ", within 0.01 of it.");
      }]
    }
  },

  // 12 · Antiderivative Designer -------------------------------------------------------
  designer: {
    defaultCard: "zero",
    cards: { zero: "f", split: "f", pos: "f", match: "F", anchor: "F" },
    show(c) {
      const p = c.live("p"), q = c.live("q"), r = c.live("r"), role = c.val("role");
      const g = x => p * x * x + q * x + r;
      const gText = cbPolyText(cbPoly([[2, p], [1, q], [0, r]]));
      if (role === "f") {
        const text = "f(x) = " + gText + " · ∫₀² f = " + cbShow(cbQuadIntegral(p, q, r, 0, 2)) + " · ∫₂⁴ f = " + cbShow(cbQuadIntegral(p, q, r, 2, 4)) +
          " · ∫₀³ f = " + cbShow(cbQuadIntegral(p, q, r, 0, 3)) + " · ∫₀⁴ f = " + cbShow(cbQuadIntegral(p, q, r, 0, 4)) + " · smallest f on [0, 4] = " + cbShow(cbQuadMin(p, q, r, 0, 4));
        c.put("state", text);
        const A = x => cbQuadIntegral(p, q, r, 0, x);
        return {
          caption: "g as a rate f",
          desc: "Top: f(x) = " + gText + " with signed area on [0, 4] shaded. Bottom: its accumulation A(x) from 0. " + text + ".",
          panels: [
            cbPanel([44, 14, 500, 150], [-0.5, 4.5], cbRange([g], -0.5, 4.5, { clamp: 20, min: 3 }), [
              ...cbSignedFill(g, 0, 4, "tangent", "area", 0.32, 60), cbCurve(g, "curve")
            ], { title: "f(x) = " + gText, smallTitle: true, gridX: 1 }),
            cbPanel([44, 196, 500, 132], [-0.5, 4.5], cbRange([A], 0, 4.5, { clamp: 40, min: 3 }), [
              cbCurve(A, "point", { from: 0 }), ...[2, 3, 4].map(x => cbDot([x, A(x)], "point", { r: 4, label: "A(" + x + ") = " + cbShow(A(x)), small: true }))
            ], { title: "A(x) = ∫₀ˣ f", smallTitle: true, xName: "x", gridX: 1 })
          ]
        };
      }
      const text = "F(x) = " + gText + " · F′(x) = " + cbPolyText(cbPoly([[1, 2 * p], [0, q]])) + " · F(4) = " + cbShow(g(4));
      c.put("state", text);
      return {
        caption: "g as an antiderivative F",
        desc: "Top: F(x) = " + gText + ". Bottom: its derivative 2px + q against the dashed target f′(x) = 2x − 3. " + text + ".",
        panels: [
          cbPanel([44, 14, 500, 150], [-0.5, 4.5], cbRange([g], -0.5, 4.5, { clamp: 40, min: 3 }), [cbCurve(g, "curve"), cbDot([4, g(4)], "point", { label: "F(4)", small: true })],
            { title: "F(x) = " + gText, smallTitle: true, gridX: 1 }),
          cbPanel([44, 196, 500, 132], [-0.5, 4.5], [-5, 7], [
            cbCurve(x => 2 * x - 3, "secant", { dashed: true, width: 2.4, label: "target 2x − 3", labelAt: 3.6, offset: [-110, -10] }),
            cbCurve(x => 2 * p * x + q, "tangent", { width: 2.4 })
          ], { title: "F′(x) (solid) and the target (dashed)", smallTitle: true, xName: "x", gridX: 1 })
        ]
      };
    },
    read(c, role) {
      if (c.val("role") !== role) {
        throw new CbFieldError(c.field("role"), role === "f" ? "Treat g as f for this card." : "Treat g as F for this card.");
      }
      return { p: c.num("p"), q: c.num("q"), r: c.num("r") };
    },
    checks: {
      zero: ["The integral is 9p + 4.5q + 3r. Set it to 0.", "A line through (1.5, 0) works: try q = 1, r = −1.5.", c => {
        const { p, q, r } = c.spec.read(c, "f");
        const value = cbQuadIntegral(p, q, r, 0, 3);
        if (p === 0 && q === 0 && r === 0) return cbSetup("Use a function that is not identically zero.");
        return cbGrade(cbSame(value, 0), "∫ from 0 to 3 is " + cbShow(value) + ". Adjust p, q or r to bring it to 0.",
          "∫₀³ (" + cbPolyText(cbPoly([[2, p], [1, q], [0, r]])) + ") dx = 9(" + cbFmt(p) + ") + 4.5(" + cbFmt(q) + ") + 3(" + cbFmt(r) + ") = 0. Positive and negative parts cancel.");
      }],
      split: ["You need two equations: 8p/3 + 2q + 2r = 4 and 56p/3 + 6q + 2r = −4.", "A line works: f(x) = −2x + 4.", c => {
        const { p, q, r } = c.spec.read(c, "f");
        const first = cbQuadIntegral(p, q, r, 0, 2), second = cbQuadIntegral(p, q, r, 2, 4);
        return cbGrade(cbSame(first, 4) && cbSame(second, -4), "Now ∫₀² f = " + cbShow(first) + " and ∫₂⁴ f = " + cbShow(second) + ". Aim for 4 and −4.",
          "∫₀² f = " + cbShow(first) + " and ∫₂⁴ f = " + cbShow(second) + ". f is positive on the first half and negative on the second, mirror-fashion.");
      }],
      pos: ["The total is 64p/3 + 8q + 4r. Set it to 8.", "f(x) = x works: it is 0 at x = 0 and positive after.", c => {
        const { p, q, r } = c.spec.read(c, "f");
        if (p === 0 && q === 0) return cbSetup("Use a nonconstant f: make p or q nonzero.");
        const total = cbQuadIntegral(p, q, r, 0, 4), low = cbQuadMin(p, q, r, 0, 4);
        if (low < -1e-12) return cbGrade(false, "f dips to " + cbShow(low) + " on [0, 4]. Keep it at or above 0.");
        return cbGrade(cbSame(total, 8), "∫₀⁴ f = " + cbShow(total) + ". Aim for 8.",
          "f ≥ 0 on [0, 4] (smallest value " + cbShow(low) + ") and ∫₀⁴ f = 8, so the accumulation never falls and ends at 8.");
      }],
      match: ["F′(x) = 2px + q. Match it to 2x − 3.", "p = 1, q = −3, and any r.", c => {
        const { p, q, r } = c.spec.read(c, "F");
        return cbGrade(cbSame(p, 1) && cbSame(q, -3), "Your F′(x) = " + cbPolyText(cbPoly([[1, 2 * p], [0, q]])) + ". Match the dashed line 2x − 3.",
          "F(x) = x² − 3x " + (r < 0 ? "− " : "+ ") + cbFmt(Math.abs(r)) + " has F′(x) = 2x − 3. Every r works, because a constant has slope 0.");
      }],
      anchor: ["Keep p = 1 and q = −3.", "F(4) = 16 − 12 + r. Choose r to make that 0.", c => {
        const { p, q, r } = c.spec.read(c, "F");
        if (!cbSame(p, 1) || !cbSame(q, -3)) return cbGrade(false, "First match the derivative 2x − 3 with p and q.");
        return cbGrade(cbSame(16 * p + 4 * q + r, 0), "F(4) = " + cbShow(16 * p + 4 * q + r) + ". Change only r.",
          "F(x) = x² − 3x − 4 = (x − 4)(x + 1), so F(4) = 0. One point picks one member from the family F + C.");
      }]
    }
  },

  // 13 · Error Detective -------------------------------------------------------------
  detective: {
    defaultCard: "divzero",
    cards: CB_CASES,
    show(c) {
      const key = cbCard(c), plan = cbDetectivePlan(key);
      const open = c.s.card ? "Case file open: " + plan.text + "." : "Open a case file. Showing case 1.";
      c.put("state", open);
      return {
        caption: plan.text,
        desc: "Diagram for the open case: " + plan.text + ". The claim made in the worked solution is drawn in red.",
        panels: [cbPanel(CB_FULL, plan.x, plan.y, plan.items, { xName: "x" })]
      };
    },
    checks: {
      divzero: ["Line 1 is the correct difference quotient. Is the next step allowed?", "The quotient is undefined at h = 0. It must be simplified first.", cbDetectiveGrader("divzero")],
      revsign: ["F(x) = x² is a correct antiderivative.", "What happens to Δx when an interval runs from right to left?", cbDetectiveGrader("revsign")],
      nettotal: ["Lines 1 and 2 correctly compute the integral.", "The integral keeps the sign of the region below the axis. Area does not.", cbDetectiveGrader("nettotal")],
      minus: ["Lines 1 and 2 are correct.", "Compare line 3 with the theorem’s formula F(b) − F(a).", cbDetectiveGrader("minus")],
      onesided: ["Line 2 uses x + 1 for x ≥ 1, which is correct.", "When h < 0, which formula describes f(1 + h)?", cbDetectiveGrader("onesided")]
    }
  },

  // 14 · Exponential and Wave Preview -------------------------------------------------------
  wave: {
    open(c, check) {
      const fn = { self: "exp", sin: "sin", cos: "cos", spin: "phase", quarter: "phase" }[check];
      c.set("fn", fn);
      if (check === "spin") { c.set("k", 2); c.set("x", 0); }
      if (check === "quarter") c.set("k", -1.5);
      if (check === "sin") c.field("slope").checked = true;
    },
    show(c) {
      const fn = c.val("fn"), k = c.live("k"), x = c.live("x");
      if (fn === "phase") {
        const z = [Math.cos(k * x), Math.sin(k * x)], dz = [-k * Math.sin(k * x), k * Math.cos(k * x)];
        const circle = Array.from({ length: 73 }, (_, i) => [Math.cos(i * Math.PI / 36), Math.sin(i * Math.PI / 36)]);
        const half = [z[0] + dz[0] / 2, z[1] + dz[1] / 2];
        const text = "e^(i·" + cbFmt(k) + "·" + cbFmt(x) + ") = " + cbFmt(z[0]) + (z[1] < 0 ? " − " : " + ") + cbFmt(Math.abs(z[1])) + "i · derivative ik·e^(ikx) = " +
          cbFmt(dz[0]) + (dz[1] < 0 ? " − " : " + ") + cbFmt(Math.abs(dz[1])) + "i · length |k| = " + cbFmt(Math.abs(k));
        c.put("state", text);
        return {
          caption: "e^(ikx) with k = " + cbFmt(k),
          desc: "Left: the complex plane with the unit circle, the position arrow e^(ikx) and its velocity ik·e^(ikx), drawn at half size from the tip and labeled velocity. Right: the real part cos kx and the imaginary part sin kx against x. " + text + ".",
          panels: [
            cbPanel([30, 40, 250, 250], [-2.5, 2.5], [-2.5, 2.5], [
              cbPath(circle, "dim", { width: 1.4 }),
              cbArrow([0, 0], z, "curve", { label: "e^(ikx)" }),
              Math.abs(k) > 0 ? cbArrow(z, half, "secant", { label: "velocity ×½", offset: [-40, -12], small: true }) : null
            ], { title: "complex plane", smallTitle: true, gridX: 1, gridY: 1, xName: "Re" }),
            cbPanel([330, 40, 226, 250], [-3.2, 3.2], [-1.4, 1.4], [
              cbCurve(t => Math.cos(k * t), "curve", { width: 2.2 }), cbCurve(t => Math.sin(k * t), "rect", { width: 2.2, dashed: true }),
              cbVline(x, "point", { width: 1.2 }),
              cbText("Re (solid)", [-3.1, 1.35], "curve", { offset: [0, 12], small: true }), cbText("Im (dashed)", [3.1, 1.35], "rect", { offset: [0, 12], small: true, anchor: "end" })
            ], { title: "parts against x", smallTitle: true, gridX: 1, xName: "x" })
          ]
        };
      }
      const spec = CB_WAVES[fn], f = spec.f(k), name = spec.text(k);
      const slope = t => (f(t + 1e-4) - f(t - 1e-4)) / 2e-4;
      const lo = fn === "exp" ? -3 : -6.4, hi = -lo;
      const y = fn === "exp" ? [-1, 8] : [-1.6, 1.6];
      const items = [cbCurve(f, "curve", { label: "f(x) = " + name, labelAt: fn === "exp" ? (k >= 0 ? -2.8 : 0.4) : -6, offset: [6, -12] })];
      if (c.checked("slope")) items.push(cbCurve(slope, "tangent", { dashed: true, width: 2.4, label: "slope curve", labelAt: fn === "exp" ? (k >= 0 ? 0.4 : -2.8) : 1.2, offset: [6, 16] }));
      items.push(cbLine([x, f(x)], slope(x), "secant", { from: x - 1, to: x + 1, width: 2 }), cbDot([x, f(x)], "point"));
      const ratio = fn === "exp" ? " · f′/f = " + cbFmt(slope(x) / f(x)) : "";
      const text = "f(x) = " + name + " · f(" + cbFmt(x) + ") = " + cbFmt(f(x)) + " · f′(" + cbFmt(x) + ") = " + cbFmt(slope(x)) + ratio;
      c.put("state", text);
      return {
        caption: "f(x) = " + name,
        desc: "Graph of f(x) = " + name + (c.checked("slope") ? " with its slope curve dashed" : "") + " and a tangent at x = " + cbFmt(x) + ". " + text + ".",
        panels: [cbPanel(CB_FULL, [lo, hi], y, items, { xName: "x", gridX: fn === "exp" ? 1 : Math.PI / 2 })]
      };
    },
    checks: {
      self: ["For e^(kx), the slope is k times the height.", "Set k = 3.", c => {
        const fn = c.val("fn"), k = c.num("k");
        return cbGrade(fn === "exp" && cbSame(k, 3), fn !== "exp" ? "Choose e^(kx) first." : "The readout shows f′/f = " + cbFmt(k) + ". Aim for 3.",
          "d/dx e^(3x) = 3e^(3x), so f′/f = 3 at every x. Only exponentials keep a fixed ratio of slope to height.");
      }],
      sin: ["Where sin x peaks, its slope is 0. Where it crosses 0 going up, its slope is 1.", "Which function equals 1 at x = 0?", c =>
        cbGrade(c.choice("sin-pick") === "cos", "Check the slope curve at x = 0, where sin x rises with slope 1.",
          "d/dx sin x = cos x. The slope curve is sine shifted left by a quarter period, π/2.")],
      cos: ["d/dx cos x = −sin x.", "sin(π/2) = 1.", c => cbGrade(cbFits(c.ans("cos-ans"), -1), "Evaluate −sin x at x = π/2.",
        "d/dx cos x = −sin x, and −sin(π/2) = −1. Cosine falls fastest where sine peaks.")],
      spin: ["At x = 0, e^(ikx) = 1.", "ik · 1 = 2i.", c => {
        const re = c.ans("spin-re"), im = c.ans("spin-im");
        return cbGrade(cbFits(re, 0) && cbFits(im, 2), "Multiply e^(i·0) = 1 by ik = 2i.",
          "ik·e^(ikx) at x = 0 is 2i · 1 = 0 + 2i. The position is 1 on the real axis, and the velocity points straight up the imaginary axis.");
      }],
      quarter: ["Multiplying by i rotates an arrow by 90°.", "|ik·e^(ikx)| = |k| · 1.", c => {
        const pick = c.choice("quarter-pick"), size = c.ans("quarter-mag");
        return cbGrade(pick === "perp" && cbFits(size, 1.5), pick !== "perp" ? "What does multiplying by i do to an arrow?" : "The length is |k| times the length of e^(ikx), which is 1.",
          "ik·e^(ikx) is e^(ikx) rotated by 90° and scaled by |k| = 1.5. With k < 0 the point circles clockwise, but the velocity is still perpendicular to the position.");
      }]
    }
  },

  // 15 · 3D Surface Walk -----------------------------------------------------------------------
  surface: {
    drag(c, dx, dy) {
      c.set("yaw", ((Math.round((c.live("yaw") - dx * 0.5) / 5) * 5) % 360 + 360) % 360);
      c.set("tilt", Math.max(10, Math.min(80, Math.round((c.live("tilt") + dy * 0.3) / 5) * 5)));
    },
    show(c) {
      const x0 = c.live("x0"), y0 = c.live("y0"), heading = CB_HEADINGS[c.val("heading")];
      const fx = -2 * x0, fy = -y0, slope = heading[0] * fx + heading[1] * fy;
      const n = Number(c.val("cols")), columns = cbHillColumns(n);
      const sum = columns.reduce((total, col) => total + col.z * col.dx * col.dy, 0);
      const text = "z = " + cbFmt(CB_HILL(x0, y0)) + " · ∂f/∂x = " + cbFmt(fx) + " · ∂f/∂y = " + cbFmt(fy) + " · slope heading " +
        c.field("heading").selectedOptions[0].textContent + " = " + cbFmt(slope) + (n ? " · column sum with " + n + " × " + n + " = " + cbFmt(sum) : "");
      c.put("state", text);
      return {
        space: true, yaw: c.live("yaw"), tilt: c.live("tilt"), walker: [x0, y0], heading, slope, columns,
        caption: "z = 4 − x² − y²/2",
        desc: "Hill z = 4 − x² − y²/2 over −2 ≤ x, y ≤ 2. Walker at (" + cbFmt(x0) + ", " + cbFmt(y0) + "), heading " + c.val("heading") + ". " + text + "."
      };
    },
    checks: {
      east: ["East means holding y fixed, so use ∂f/∂x.", "∂f/∂x = −2x at x = 1.", c => cbGrade(cbFits(c.ans("east-ans"), -2),
        "Set the walker at (1, 1), head east and read the slope, or compute −2x.", "∂f/∂x = −2x = −2 at x = 1. Heading east, the hill falls 2 units per unit step.")],
      north: ["North means holding x fixed, so use ∂f/∂y.", "∂f/∂y = −y at y = 1.", c => cbGrade(cbFits(c.ans("north-ans"), -1),
        "Head north at (1, 1), or compute −y.", "∂f/∂y = −y = −1 at y = 1. The same point gives different slopes in different directions.")],
      flat: ["At (1, 2), ∂f/∂x = −2 and ∂f/∂y = −2.", "A level heading (u, v) needs −2u − 2v = 0, so v = −u.", c => {
        const x0 = c.num("x0"), y0 = c.num("y0"), h = CB_HEADINGS[c.val("heading")];
        if (x0 !== 1 || y0 !== 2) return cbSetup("Move the walker to (1, 2) first.");
        const slope = -2 * x0 * h[0] - y0 * h[1];
        return cbGrade(Math.abs(slope) < 1e-9, "Heading " + c.val("heading") + " has slope " + cbFmt(slope) + ". Try another direction.",
          "Heading " + c.val("heading") + ": (−2)u + (−2)v = 0. Northwest and southeast both stay level, along the hill’s contour line.");
      }],
      volume: ["Columns of 8 × 8 give about 6.01.", "Integrate over y first: ∫₀² (4 − x² − y²/2) dy = 8 − 2x² − 4/3.", c => cbGrade(cbFits(c.ans("volume-ans"), 6),
        "Integrate in y from 0 to 2, then in x from 0 to 1.", "∫₀¹ (8 − 2x² − 4/3) dx = 8 − 2/3 − 4/3 = 6. The column sums approach 6 as the columns shrink.")]
    }
  },

  // 16 · Quantum Calculus Preview -----------------------------------------------------------------
  quantum: {
    open(c, check) {
      const fn = { lin: "lin", share: "lin", half: "lin", sq: "sq", sharesq: "sq" }[check];
      c.set("fn", fn);
      if (check === "sharesq") { c.set("c", 1); c.set("d", 2); }
      if (check === "share") { c.set("c", 0); c.set("d", 1); }
    },
    show(c) {
      const shape = CB_SHAPES[c.val("fn")];
      const N = c.quiet("N") ?? 1;
      const lo = Math.min(Math.max(0, c.live("c")), shape.end), hi = Math.min(Math.max(0, c.live("d")), shape.end);
      const a = Math.min(lo, hi), b = Math.max(lo, hi);
      const g = x => N * shape.f(x);
      const total = N * shape.G(shape.end), part = N * (shape.G(b) - shape.G(a));
      const text = "N·g with N = " + cbShow(N) + " · total area " + cbShow(total) + " · area on [" + cbFmt(a) + ", " + cbFmt(b) + "] is " + cbShow(part);
      c.put("state", text);
      const y = [-0.1 * Math.max(0.1, g(shape.end)), Math.max(0.1, g(shape.end)) * 1.15];
      return {
        caption: "N·g(x) = " + cbShow(N) + " · " + shape.text,
        desc: "Graph of N·g with g(x) = " + shape.text + " on [0, " + shape.end + "]. The whole region is shaded lightly and the interval [" + cbFmt(a) + ", " + cbFmt(b) + "] strongly. " + text + ".",
        panels: [cbPanel(CB_FULL, [-0.3, shape.end + 0.3], y, [
          ...cbSignedFill(g, 0, shape.end, "rect", "rect", 0.14, 40),
          ...cbSignedFill(g, a, b, "rect", "rect", 0.5, 40),
          cbCurve(g, "curve", { from: 0, to: shape.end }),
          cbVline(a, "point", { label: "c", offset: [4, 18] }), cbVline(b, "point", { label: "d", offset: [4, 34] })
        ], { xName: "x" })]
      };
    },
    checks: {
      lin: ["The ramp’s area is a triangle: ½ × 2 × 2.", "N = 1 / (total area).", cbQuantumNorm("lin", 1 / 2)],
      sq: ["∫₀³ x² dx = 3³/3.", "N = 1/9. Type it as 1/9 or 0.111.", cbQuantumNorm("sq", 1 / 9)],
      share: ["Normalized, N·g = x/2. Its area on [0, 1] is a small triangle.", "∫₀¹ x/2 dx = 1/4.", c => cbGrade(cbFits(c.ans("share-ans"), 1 / 4),
        "Find the area of x/2 on [0, 1].", "∫₀¹ x/2 dx = 1/4. Half the interval holds only a quarter of the area, because the ramp is low on the left.")],
      sharesq: ["Normalized, N·g = x²/9.", "∫₁² x²/9 dx = (8 − 1)/27.", c => cbGrade(cbFits(c.ans("sharesq-ans"), 7 / 27),
        "Integrate x²/9 from 1 to 2.", "∫₁² x²/9 dx = (2³ − 1³)/27 = 7/27 ≈ 0.259.")],
      half: ["The share on [0, c] is c²/4.", "Solve c²/4 = 1/2.", c => cbGrade(cbFits(c.ans("half-ans"), Math.SQRT2),
        "Set c²/4 = 1/2 and solve for c > 0. Move c and d to check.", "c²/4 = 1/2 gives c² = 2, so c = √2 ≈ 1.414. The midpoint 1 is too small, because the ramp holds more area on the right.")]
    }
  }
};

// ---------------------------------------------------------------------------
// Arcade runtime: one shared figure moves into the active station.
// ---------------------------------------------------------------------------

function cbLabelText(field) {
  const label = field.closest("label");
  if (!label) return "the selected input";
  const copy = label.cloneNode(true);
  copy.querySelectorAll("input, select, output").forEach(node => node.remove());
  return copy.textContent.replace(/\s+/g, " ").trim() || "the selected input";
}

class CbFieldError extends Error {
  constructor(field, detail = "", custom = false) {
    super("Check " + cbLabelText(field) + "." + (detail ? " " + detail : ""));
    this.field = field;
    this.detail = detail;
    this.custom = custom;
  }
}

function cbSetText(element, text) {
  text = String(text ?? "");
  if (element && element.textContent !== text) element.textContent = text;
}

function cbPalette(root) {
  const css = getComputedStyle(root);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    plot: read("--calc-plot", "#080f1a"),
    grid: read("--calc-grid", "#34465b"),
    axis: read("--calc-axis", "#b6c5d5"),
    curve: read("--calc-curve", "#65b7ff"),
    secant: read("--calc-secant", "#ff9f55"),
    tangent: read("--calc-tangent", "#63f59b"),
    rect: read("--calc-rect", "#c19bff"),
    area: read("--calc-area", "#ff676f"),
    point: read("--calc-point", "#ffe16a"),
    strip: read("--calc-strip", "#ff9ed0"),
    ink: read("--ink", "#ecfff1"),
    dim: "#6b7d93"
  };
}

function initializeCalculusArcade(root) {
  const details = root.querySelector("#calculus-arcade");
  if (!details) return;
  const get = id => root.querySelector("#cb-" + id);
  const select = get("station"), resetButton = get("reset"), status = get("status");
  const reducedBox = get("reduced"), progress = get("progress");
  const figure = get("figure-template").content.firstElementChild.cloneNode(true);
  const toolTemplate = get("mission-template");
  const viewport = figure.querySelector("#cb-viewport");
  const canvas = figure.querySelector("#cb-canvas");
  const geometry = figure.querySelector("[data-cb-geometry]");
  const labelLayer = figure.querySelector("[data-cb-labels]");
  const desc = figure.querySelector("#cb-desc");
  const title = figure.querySelector("#cb-title");
  const renderStatus = figure.querySelector("#cb-render-status");
  const colors = cbPalette(root);
  const lifetime = new AbortController();
  const listen = (node, type, handler, options = {}) =>
    node.addEventListener(type, handler, { ...options, signal: lifetime.signal });
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = () => Boolean(reducedBox.checked || motionQuery?.matches);
  const panels = new Map(), cards = new Map(), completion = new Set();
  let active = null, drawing = null;
  let graphics = null, loading = false, contextLost = false, disposed = false;
  let frame = null, lastTick = null, drag = null;

  const say = message => cbSetText(status, message ?? "");
  const updateProgress = () => cbSetText(progress, completion.size + " of " + cards.size + " missions completed this session.");
  const lastOpenCard = c => [...c.cards].filter(([, card]) => card.open).map(([check]) => check).at(-1) ?? null;

  function onScreen() {
    if (!details.open || document.hidden || !viewport.isConnected) return false;
    const box = viewport.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight;
  }

  for (const panel of root.querySelectorAll("#cb-panels [data-cb-station]")) {
    const key = panel.dataset.cbStation;
    const spec = cbStations[key];
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
        throw new CbFieldError(input);
      },
      ans(name) {
        const input = field(name);
        const value = cbParse(input.value);
        if (value === null) throw new CbFieldError(input, "Enter a number such as 2, −1.5, 8/3, √2 or π/2.", true);
        return value;
      },
      // Parse an answer box for drawing only; null while it is blank or mid-edit.
      quiet: name => cbParse(field(name).value),
      choice(name) {
        const input = field(name);
        if (!input.value) throw new CbFieldError(input, "Choose an option.");
        return input.value;
      },
      // Read a number for drawing; keep the last valid value while an input is mid-edit.
      live(name) {
        const input = field(name);
        c.s.live ??= {};
        const value = input.tagName === "SELECT" ? Number(input.value) : input.valueAsNumber;
        if (input.validity.valid && Number.isFinite(value)) c.s.live[name] = value;
        return c.s.live[name] ?? (Number(c.defaults.get(name)) || 0);
      },
      set(name, value) { field(name).value = String(value); },
      put(name, text) { cbSetText(c.node('[data-cb-read="' + name + '"]'), text); },
      reduced,
      onScreen
    };
    for (const card of panel.querySelectorAll("[data-cb-mission]")) {
      const id = card.dataset.cbMission;
      const check = id.slice(key.length + 1);
      card.append(toolTemplate.content.cloneNode(true));
      c.cards.set(check, card);
      cards.set(id, { id, card, check, hints: 0 });
      listen(card, "toggle", () => {
        if (card.open) {
          c.s.card = check;
          c.spec.open?.(c, check);
        } else if (c.s.card === check) c.s.card = lastOpenCard(c);
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
    c.spec.start?.(c);
  }

  function syncOutputs(c) {
    for (const output of c.panel.querySelectorAll("output[data-cb-for]")) {
      const input = c.field(output.dataset.cbFor);
      if (input) cbSetText(output, cbFmt(Number(input.value)));
    }
  }

  function rebuild() {
    if (!active || !details.open) return;
    syncOutputs(active);
    const plan = active.spec.show(active);
    cbSetText(title, active.title + (plan.caption ? " · " + plan.caption : ""));
    cbSetText(desc, plan.desc);
    drawing = plan.space ? cbBuildSpace(plan) : cbBuildFlat(plan);
    cbPaintSvg(drawing, geometry, labelLayer, colors);
  }

  function refresh() {
    rebuild();
    requestDraw();
  }

  function showSvg(message) {
    viewport.dataset.renderer = "svg";
    canvas.hidden = true;
    if (message) cbSetText(renderStatus, message);
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
      // Clamp the frame step so a stalled or out-of-order frame never jumps or rewinds the animation.
      const step = lastTick === null ? 0 : Math.max(0, Math.min(64, now - lastTick));
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
      cbSetText(renderStatus, drawing.space
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
    cbSetText(renderStatus, "SVG diagram. Loading the WebGL view.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (disposed) return;
      graphics = cbCreateGraphics(THREE, canvas, colors);
      requestDraw();
    } catch {
      graphics = null;
      showSvg("WebGL is unavailable here, so the diagram uses SVG.");
    } finally {
      loading = false;
    }
  }

  function mount() {
    for (const c of panels.values()) c.spec.flush?.(c);
    active = panels.get(select.value) ?? panels.values().next().value;
    for (const c of panels.values()) c.panel.hidden = c !== active;
    active.node("[data-cb-plot-slot]").append(figure);
    viewport.dataset.space = active.spec.drag ? "true" : "false";
    refresh();
  }

  function clearCard(card) {
    cbSetText(card.querySelector("[data-cb-feedback]"), "");
    const work = card.querySelector("[data-cb-work]");
    work.hidden = true;
    work.open = false;
  }

  function showGrade(mission, result) {
    const { card, id, check } = mission;
    const work = card.querySelector("[data-cb-work]");
    cbSetText(card.querySelector("[data-cb-feedback]"),
      result.pass ? result.success + (result.work ? " Open the worked steps, or try another setup." : "") : result.fail);
    cbSetText(card.querySelector("[data-cb-work-text]"), result.work || "");
    work.hidden = !result.work;
    work.open = Boolean(result.work) && !result.pass;
    if (result.pass) active.s.revealed[check] = true;
    if (result.pass && !completion.has(id)) {
      completion.add(id);
      card.querySelector("[data-cb-done]").hidden = false;
      updateProgress();
    }
    say("");
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !active || !active.panel.contains(button) || button.disabled) return;
    const missionCard = button.closest("[data-cb-mission]");
    const mission = missionCard ? cards.get(missionCard.dataset.cbMission) : null;
    const action = button.dataset.cbAction;
    try {
      if (action) {
        const message = active.spec.actions[action](active, button, mission?.check ?? null);
        if (mission) cbSetText(mission.card.querySelector("[data-cb-feedback]"), message ?? "");
        else if (message !== null) say(message);
      } else if (mission && button.hasAttribute("data-cb-check")) {
        showGrade(mission, active.spec.checks[mission.check][2](active));
      } else if (mission && button.hasAttribute("data-cb-hint")) {
        if (mission.hints >= 2) return;
        const list = mission.card.querySelector("[data-cb-hint-list]");
        const item = document.createElement("li");
        cbSetText(item, active.spec.checks[mission.check][mission.hints]);
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
      if (!(error instanceof CbFieldError)) throw error;
      if (mission) cbSetText(mission.card.querySelector("[data-cb-feedback]"), error.message);
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
    const missionCard = target.closest("[data-cb-mission]");
    if (missionCard) clearCard(missionCard);
    active.spec.edit?.(active, target.name, event.type);
    refresh();
  }

  // Drag to turn the 3D view.
  listen(viewport, "pointerdown", event => {
    if (!active?.spec.drag || event.button > 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === "touch" };
    try { viewport.setPointerCapture?.(event.pointerId); } catch { /* Capture is optional. */ }
  });
  listen(viewport, "pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
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
  listen(root.querySelector("#cb-arcade-link"), "click", () => { details.open = true; });

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
  if (location.hash === "#calculus-arcade") details.open = true;
  if (details.open) loadGraphics();
}

// ---------------------------------------------------------------------------
// Flat diagrams: one or more graph panels become a list of shapes in SVG
// pixels, painted with SVG (fallback) or WebGL. Labels always stay in SVG.
// ---------------------------------------------------------------------------

function cbNiceStep(minimum) {
  const power = 10 ** Math.floor(Math.log10(minimum));
  return [1, 2, 5, 10].map(m => m * power).find(step => step >= minimum - 1e-12);
}

// Liang–Barsky clip of a pixel segment to a rectangle.
function cbClipSegment([ax, ay], [bx, by], [L, T, R, B]) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - L], [dx, R - ax], [-dy, ay - T], [dy, B - ay]]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[ax + t0 * dx, ay + t0 * dy], [ax + t1 * dx, ay + t1 * dy]];
}

// Sutherland–Hodgman clip of a pixel polygon to a rectangle.
function cbClipPolygon(points, [L, T, R, B]) {
  const edges = [
    [p => p[0] >= L, (a, b) => [L, a[1] + (b[1] - a[1]) * (L - a[0]) / (b[0] - a[0])]],
    [p => p[0] <= R, (a, b) => [R, a[1] + (b[1] - a[1]) * (R - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= T, (a, b) => [a[0] + (b[0] - a[0]) * (T - a[1]) / (b[1] - a[1]), T]],
    [p => p[1] <= B, (a, b) => [a[0] + (b[0] - a[0]) * (B - a[1]) / (b[1] - a[1]), B]]
  ];
  let output = points;
  for (const [inside, cross] of edges) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i], previous = input[(i + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) output.push(cross(previous, current));
        output.push(current);
      } else if (inside(previous)) output.push(cross(previous, current));
    }
    if (!output.length) break;
  }
  return output;
}

function cbBuildFlat(plan) {
  const [W, H] = CB_SIZE;
  const shapes = [], names = [];
  const stroke = (layer, coords, color, width, options = {}) => shapes.push({ kind: "stroke", layer, coords, color, width, ...options });
  const fill = (layer, coords, color, opacity = 1) => shapes.push({ kind: "fill", layer, coords, color, opacity });
  const label = (text, [x, y], color, offset = [8, -9], small = false, anchor = "start") => {
    if (!text) return;
    const width = text.length * (small ? 7 : 8.6);
    let left = anchor === "end" ? x + offset[0] - width : anchor === "middle" ? x + offset[0] - width / 2 : x + offset[0];
    left = Math.max(2, Math.min(W - width - 2, left));
    let top = Math.max(13, Math.min(H - 4, y + offset[1]));
    for (let tries = 0; tries < 4; tries++) {
      const clash = names.some(n => Math.abs(n.y - top) < (small ? 12 : 15) && left < n.x + n.width && n.x < left + width);
      if (!clash) break;
      top = top + 17 > H - 4 ? top - 34 : top + 17;
    }
    names.push({ text, x: left, y: top, color, small, width });
  };

  for (const panel of plan.panels) {
    const [L, T, PW, PH] = panel.box;
    const R = L + PW, B = T + PH, rect = [L, T, R, B];
    const [x0, x1] = panel.x, [y0, y1] = panel.y;
    const px = x => L + (x - x0) * PW / (x1 - x0);
    const py = y => B - (y - y0) * PH / (y1 - y0);
    const map = ([x, y]) => [px(x), py(y)];
    const inside = ([x, y]) => x >= L - 0.5 && x <= R + 0.5 && y >= T - 0.5 && y <= B + 0.5;
    const polyline = (layer, coords, color, width, options) => {
      let run = [];
      const flush = () => { if (run.length > 1) stroke(layer, run, color, width, options); run = []; };
      for (let i = 1; i < coords.length; i++) {
        const piece = cbClipSegment(coords[i - 1], coords[i], rect);
        if (!piece) { flush(); continue; }
        if (!run.length || Math.hypot(run.at(-1)[0] - piece[0][0], run.at(-1)[1] - piece[0][1]) > 0.5) {
          flush();
          run.push(piece[0]);
        }
        run.push(piece[1]);
      }
      flush();
    };
    const arrowHead = (tip, from, color, layer, size = 11) => {
      const d = [tip[0] - from[0], tip[1] - from[1]], length = Math.hypot(...d);
      if (length < 4) return tip;
      const u = [d[0] / length, d[1] / length], n = [-u[1], u[0]], s = Math.min(size, length * 0.6);
      const base = [tip[0] - u[0] * s, tip[1] - u[1] * s];
      fill(7, [tip, [base[0] + n[0] * s * 0.45, base[1] + n[1] * s * 0.45], [base[0] - n[0] * s * 0.45, base[1] - n[1] * s * 0.45]], color);
      return [base[0] + u[0] * 2, base[1] + u[1] * 2];
    };

    // Frame, grid, axes and tick labels.
    if (panel.highlight) fill(0, [[L, T], [R, T], [R, B], [L, B]], panel.highlight, 0.08);
    if (panel.grid !== false) {
      const gx = panel.gridX ?? cbNiceStep((x1 - x0) / Math.max(2, PW / 46));
      const gy = panel.gridY ?? cbNiceStep((y1 - y0) / Math.max(2, PH / 34));
      for (let i = Math.ceil(x0 / gx - 1e-9); i * gx <= x1 + 1e-9; i++) {
        const x = px(i * gx);
        stroke(0, [[x, T], [x, B]], "grid", 1);
        const atEdge = Math.abs(i * gx - x0) < 1e-9 || Math.abs(i * gx - x1) < 1e-9;
        if (panel.ticks !== false && panel.ticks !== "y" && Math.abs(i * gx) > 1e-9 && !(atEdge && panel.edgeLabels === false)) {
          label(cbFmt(i * gx), [x, B], "axis", [0, 14], true, "middle");
        }
      }
      for (let i = Math.ceil(y0 / gy - 1e-9); i * gy <= y1 + 1e-9; i++) {
        const y = py(i * gy);
        stroke(0, [[L, y], [R, y]], "grid", 1);
        if (panel.ticks !== false && panel.ticks !== "x" && Math.abs(i * gy) > 1e-9) {
          label(cbFmt(i * gy), [L, y], "axis", [-4, 4], true, "end");
        }
      }
    }
    if (panel.axes !== false) {
      const ax = y0 <= 0 && 0 <= y1 ? py(0) : B;
      const ay = x0 <= 0 && 0 <= x1 ? px(0) : L;
      stroke(1, [[L, ax], [R, ax]], "axis", 1.4);
      stroke(1, [[ay, B], [ay, T]], "axis", 1.4);
      if (panel.ticks !== false && x0 <= 0 && 0 <= x1 && y0 <= 0 && 0 <= y1) label("0", [ay, ax], "axis", [-4, 14], true, "end");
    }
    stroke(1, [[L, T], [R, T], [R, B], [L, B], [L, T]], panel.highlight ?? "grid", panel.highlight ? 2.4 : 1.2);
    if (panel.title) label(panel.title, [L, T], panel.titleColor ?? "ink", [6, 15], panel.smallTitle ?? false);
    if (panel.xName) label(panel.xName, [R, panel.y[0] <= 0 && 0 <= panel.y[1] ? py(0) : B], "axis", [-4, -6], true, "end");

    for (const item of panel.items) {
      if (!item) continue;
      if (item.type === "curve") {
        const lo = Math.max(item.from ?? x0, x0), hi = Math.min(item.to ?? x1, x1);
        if (hi <= lo) continue;
        const breaks = (item.breaks ?? []).filter(b => b > lo && b < hi).sort((a, b) => a - b);
        const edges = [lo, ...breaks, hi];
        const count = item.n ?? 240;
        for (let e = 1; e < edges.length; e++) {
          const a = edges[e - 1], b = edges[e];
          const steps = Math.max(8, Math.ceil(count * (b - a) / (hi - lo)));
          let run = [];
          for (let i = 0; i <= steps; i++) {
            let x = a + (b - a) * i / steps;
            if (i === steps && e < edges.length - 1) x = b - 1e-9 * Math.max(1, Math.abs(b));
            const y = item.f(x);
            if (!Number.isFinite(y) || Math.abs(y) > 1e6) {
              if (run.length > 1) polyline(item.layer ?? 5, run, item.color, item.width ?? 3, item);
              run = [];
              continue;
            }
            run.push(map([x, y]));
          }
          if (run.length > 1) polyline(item.layer ?? 5, run, item.color, item.width ?? 3, item);
        }
        if (item.label && item.labelAt !== undefined) {
          const y = item.f(item.labelAt);
          if (Number.isFinite(y) && inside(map([item.labelAt, y]))) label(item.label, map([item.labelAt, y]), item.color, item.offset);
        }
      } else if (item.type === "path") {
        polyline(item.layer ?? 5, item.points.map(map), item.color, item.width ?? 2, item);
      } else if (item.type === "fill") {
        const clipped = cbClipPolygon(item.points.map(map), rect);
        if (clipped.length >= 3) fill(item.layer ?? 2, clipped, item.color, item.opacity ?? 0.25);
      } else if (item.type === "line") {
        const [tx, ty] = item.through;
        const from = item.from ?? x0, to = item.to ?? x1;
        polyline(item.layer ?? 4, [map([from, ty + item.slope * (from - tx)]), map([to, ty + item.slope * (to - tx)])], item.color, item.width ?? 2, item);
      } else if (item.type === "vline") {
        if (item.x < x0 || item.x > x1) continue;
        stroke(item.layer ?? 3, [[px(item.x), T], [px(item.x), B]], item.color, item.width ?? 1.6, { dashed: item.dashed ?? true, opacity: item.opacity });
        if (item.label) label(item.label, [px(item.x), T], item.color, item.offset ?? [5, 30], true);
      } else if (item.type === "arrow") {
        const start = map(item.from), tip = map(item.to);
        const piece = cbClipSegment(start, tip, rect);
        if (!piece) continue;
        const end = inside(tip) ? arrowHead(tip, start, item.color, 7, item.head ?? 11) : piece[1];
        stroke(7, [piece[0], end], item.color, item.width ?? 2.6, { opacity: item.opacity });
        if (item.label) label(item.label, inside(tip) ? tip : piece[1], item.color, item.offset);
      } else if (item.type === "dot") {
        const at = map(item.at);
        if (!inside(at)) continue;
        shapes.push({ kind: "dot", layer: 8, at, color: item.color, r: item.r ?? (item.hollow ? 5.5 : 5), hollow: item.hollow });
        if (item.label) label(item.label, at, item.color, item.offset ?? [9, -9], item.small);
      } else if (item.type === "label") {
        const at = map(item.at);
        label(item.text, [Math.max(L, Math.min(R, at[0])), Math.max(T, Math.min(B, at[1]))], item.color, item.offset ?? [0, 0], item.small, item.anchor);
      }
    }
  }
  return { shapes, names };
}

function cbSvgNode(name, attributes, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
}

function cbPaintSvg(drawing, geometry, labelLayer, colors) {
  const points = coords => coords.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
  const nodes = [...drawing.shapes].sort((a, b) => a.layer - b.layer).map(shape => {
    if (shape.kind === "stroke") {
      return cbSvgNode("polyline", {
        points: points(shape.coords), fill: "none", stroke: colors[shape.color], "stroke-width": shape.width,
        "stroke-linecap": "round", "stroke-linejoin": "round",
        "stroke-dasharray": shape.dashed ? "6 5" : null, "stroke-opacity": shape.opacity ?? null
      });
    }
    if (shape.kind === "fill") {
      return cbSvgNode("polygon", {
        points: points(shape.coords), fill: colors[shape.color],
        "fill-opacity": shape.opacity < 1 ? shape.opacity : null
      });
    }
    return cbSvgNode("circle", {
      cx: shape.at[0].toFixed(2), cy: shape.at[1].toFixed(2), r: shape.r,
      fill: shape.hollow ? colors.plot : colors[shape.color],
      stroke: shape.hollow ? colors[shape.color] : colors.plot,
      "stroke-width": shape.hollow ? 2.2 : 1.4
    });
  });
  geometry.replaceChildren(...nodes);
  labelLayer.replaceChildren(...drawing.names.map(({ text, x, y, color, small }) => cbSvgNode("text", {
    x: x.toFixed(1), y: y.toFixed(1), fill: colors[color], class: small ? "cb-label-small" : null
  }, text)));
}

// ---------------------------------------------------------------------------
// WebGL renderer. Flat diagrams become batched triangle meshes; the surface
// station gets lit 3D geometry. Shapes share the SVG layout, so the SVG labels
// line up with either renderer.
// ---------------------------------------------------------------------------

const cbCross2 = ([p, q], [r, s]) => p * s - q * r;

function cbCreateGraphics(THREE, canvas, colors) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(colors.plot);
  const flatScene = new THREE.Scene();
  const flatCamera = new THREE.OrthographicCamera(-280, 280, 180, -180, 0.1, 10);
  flatCamera.position.z = 5;
  const flatGroup = new THREE.Group();
  flatScene.add(flatGroup);
  const materials = new Map();
  const space = cbCreateSpaceScene(THREE, colors);
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
      const d = [to[0] - from[0], to[1] - from[1]], length = Math.hypot(...d);
      if (length < 1e-6) return;
      const n = [-d[1] * width / 2 / length, d[0] * width / 2 / length];
      const a = [from[0] + n[0], from[1] + n[1]], b = [from[0] - n[0], from[1] - n[1]];
      const c = [to[0] + n[0], to[1] + n[1]], e = [to[0] - n[0], to[1] - n[1]];
      triangle(list, a, b, c);
      triangle(list, c, b, e);
    };
    const polyline = (list, coords, width, dashed) => {
      for (let i = 1; i < coords.length; i++) {
        const from = coords[i - 1], d = [coords[i][0] - from[0], coords[i][1] - from[1]], length = Math.hypot(...d);
        if (length < 1e-6) continue;
        if (!dashed) {
          segment(list, from, coords[i], width);
          if (i < coords.length - 1 && width > 1.5) disc(list, coords[i], width / 2);
          continue;
        }
        const u = [d[0] / length, d[1] / length];
        for (let s = 0; s < length; s += 11) {
          const e = Math.min(length, s + 6);
          segment(list, [from[0] + u[0] * s, from[1] + u[1] * s], [from[0] + u[0] * e, from[1] + u[1] * e], width);
        }
      }
    };
    // Ear-clip simple polygons (clipped fills can be non-convex).
    const polygon = (list, coords) => {
      const pts = coords.map(p => [...p]);
      const sign = Math.sign(pts.reduce((sum, p, i) => sum + cbCross2(p, pts[(i + 1) % pts.length]), 0)) || 1;
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
      const inTriangle = (p, a, b, c) =>
        cbCross2(sub(b, a), sub(p, a)) * sign > 0 && cbCross2(sub(c, b), sub(p, b)) * sign > 0 && cbCross2(sub(a, c), sub(p, c)) * sign > 0;
      let guard = 0;
      while (pts.length > 3 && guard++ < 600) {
        let clipped = false;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
          if (cbCross2(sub(b, a), sub(c, b)) * sign <= 0) continue;
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

// ---------------------------------------------------------------------------
// 3D surface: shared projection, SVG wireframe fallback and WebGL scene.
// The SVG labels and the WebGL camera use the same right/up vectors.
// ---------------------------------------------------------------------------

const CB_HILL = (x, y) => 4 - x * x - y * y / 2;
const CB_HILL_LIFT = -1;
const cbDot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const cbCross3 = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];

function cbSpaceFrame(yawDegrees, tiltDegrees) {
  const yaw = yawDegrees * Math.PI / 180, tilt = tiltDegrees * Math.PI / 180;
  const toward = [Math.cos(tilt) * Math.cos(yaw), Math.cos(tilt) * Math.sin(yaw), Math.sin(tilt)];
  const up = [-Math.sin(tilt) * Math.cos(yaw), -Math.sin(tilt) * Math.sin(yaw), Math.cos(tilt)];
  return { toward, up, right: cbCross3(up, toward) };
}

// Column tops for the n × n midpoint sum over [0, 1] × [0, 2].
function cbHillColumns(n) {
  const columns = [];
  if (!n) return columns;
  const dx = 1 / n, dy = 2 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * dx, y = j * dy;
    columns.push({ x, y, dx, dy, z: CB_HILL(x + dx / 2, y + dy / 2) });
  }
  return columns;
}

function cbBuildSpace(plan) {
  const [W, H] = CB_SIZE;
  const { toward, up, right } = cbSpaceFrame(plan.yaw, plan.tilt);
  const k = 40;
  const shapes = [], names = [];
  const lift = p => [p[0], p[1], p[2] + CB_HILL_LIFT];
  const project = p => { const q = lift(p); return [W / 2 + k * cbDot3(q, right), H / 2 + 10 - k * cbDot3(q, up)]; };
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

  // Floor outline and axes.
  stroke(0, [[-2, -2, -2], [2, -2, -2], [2, 2, -2], [-2, 2, -2], [-2, -2, -2]], "grid", 1);
  for (const [end, name] of [[[2.6, 0, 0], "x"], [[0, 2.6, 0], "y"], [[0, 0, 4.8], "z"]]) {
    stroke(1, [[0, 0, 0], end], "axis", 1.3);
    label(name, project(end), "axis", true);
  }
  // Wireframe of the hill.
  for (let i = -4; i <= 4; i++) {
    const c = i / 2;
    const alongX = [], alongY = [];
    for (let j = 0; j <= 24; j++) {
      const t = -2 + 4 * j / 24;
      alongX.push([t, c, CB_HILL(t, c)]);
      alongY.push([c, t, CB_HILL(c, t)]);
    }
    stroke(2, alongX, "curve", 1.1, { opacity: 0.75 });
    stroke(2, alongY, "curve", 1.1, { opacity: 0.75 });
  }
  // Midpoint columns.
  for (const { x, y, dx, dy, z } of plan.columns) {
    const top = [[x, y, z], [x + dx, y, z], [x + dx, y + dy, z], [x, y + dy, z], [x, y, z]];
    stroke(3, top, "rect", 1.4);
    for (const [cx, cy] of [[x, y], [x + dx, y], [x + dx, y + dy], [x, y + dy]]) stroke(3, [[cx, cy, 0], [cx, cy, z]], "rect", 1);
  }
  if (plan.columns.length) stroke(3, [[0, 0, 0], [1, 0, 0], [1, 2, 0], [0, 2, 0], [0, 0, 0]], "rect", 1.4, { dashed: true });
  // Cross-section along the heading, the walker and the heading arrow.
  const [x0, y0] = plan.walker, [ux, uy] = plan.heading;
  const z0 = CB_HILL(x0, y0);
  const section = [];
  for (let j = 0; j <= 30; j++) {
    const t = -1.5 + 3 * j / 30, x = x0 + ux * t, y = y0 + uy * t;
    if (Math.abs(x) <= 2 + 1e-9 && Math.abs(y) <= 2 + 1e-9) section.push([x, y, CB_HILL(x, y)]);
  }
  stroke(5, section, "tangent", 2.4);
  const tip = [x0 + ux * 1.1, y0 + uy * 1.1, z0 + plan.slope * 1.1];
  stroke(7, [[x0, y0, z0], tip], "secant", 3);
  shapes.push({ kind: "dot", layer: 8, at: project(tip), r: 4, color: "secant" });
  shapes.push({ kind: "dot", layer: 8, at: project([x0, y0, z0]), r: 6, color: "point" });
  label("walker (" + cbFmt(x0) + ", " + cbFmt(y0) + ")", project([x0, y0, z0]), "point");
  label("slope " + cbFmt(plan.slope), project(tip), "secant", true);
  return {
    shapes, names,
    space: { k, toward, up, right, walker: [x0, y0, z0], tip, section, columns: plan.columns }
  };
}

function cbCreateSpaceScene(THREE, colors) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 1, 800);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4), sun, sun.target);
  const world = new THREE.Group();
  world.position.z = CB_HILL_LIFT;
  scene.add(world);
  const fixed = new THREE.Group(), moving = new THREE.Group();
  world.add(fixed, moving);
  const ownedFixed = [], ownedMoving = [];
  let signature = "", built = false;
  const tint = name => new THREE.Color(colors[name]);
  const v3 = ([x, y, z]) => new THREE.Vector3(x, y, z);

  function lines(points, name, owned, group, opacity = 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
    const material = new THREE.LineBasicMaterial({ color: tint(name), transparent: opacity < 1, opacity });
    owned.push(geometry, material);
    group.add(new THREE.LineSegments(geometry, material));
  }

  function buildFixed() {
    const n = 40, positions = [], index = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = -2 + 4 * i / n, y = -2 + 4 * j / n;
      positions.push(x, y, CB_HILL(x, y));
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j, b = a + n + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({
      color: tint("curve"), emissive: tint("curve").multiplyScalar(0.18),
      side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false
    });
    ownedFixed.push(geometry, material);
    fixed.add(new THREE.Mesh(geometry, material));
    const wire = [];
    for (let i = -4; i <= 4; i++) {
      const c = i / 2;
      for (let j = 0; j < 24; j++) {
        const t = -2 + 4 * j / 24, u = -2 + 4 * (j + 1) / 24;
        wire.push([t, c, CB_HILL(t, c) + 0.01], [u, c, CB_HILL(u, c) + 0.01]);
        wire.push([c, t, CB_HILL(c, t) + 0.01], [c, u, CB_HILL(c, u) + 0.01]);
      }
    }
    lines(wire, "curve", ownedFixed, fixed, 0.9);
    lines([[-2, -2, -2], [2, -2, -2], [2, -2, -2], [2, 2, -2], [2, 2, -2], [-2, 2, -2], [-2, 2, -2], [-2, -2, -2]], "grid", ownedFixed, fixed);
    lines([[0, 0, 0], [2.6, 0, 0], [0, 0, 0], [0, 2.6, 0], [0, 0, 0], [0, 0, 4.8]], "axis", ownedFixed, fixed);
    built = true;
  }

  function clearMoving() {
    moving.clear();
    ownedMoving.splice(0).forEach(item => item.dispose());
  }

  function buildMoving(space) {
    clearMoving();
    const px = 1 / space.k;
    const solid = (name, opacity = 1) => {
      const material = new THREE.MeshLambertMaterial({ color: tint(name), emissive: tint(name).multiplyScalar(0.35), transparent: opacity < 1, opacity });
      ownedMoving.push(material);
      return material;
    };
    const sphere = (at, radius, name) => {
      const geometry = new THREE.SphereGeometry(radius, 18, 14);
      ownedMoving.push(geometry);
      const mesh = new THREE.Mesh(geometry, solid(name));
      mesh.position.copy(v3(at));
      moving.add(mesh);
    };
    sphere(space.walker, 6 * px, "point");
    // Heading arrow: shaft and cone along the tangent direction.
    const from = v3(space.walker), to = v3(space.tip), direction = to.clone().sub(from);
    const length = direction.length();
    const head = Math.min(14 * px, length * 0.4);
    const shaftGeometry = new THREE.CylinderGeometry(2 * px, 2 * px, length - head, 12);
    const tipGeometry = new THREE.ConeGeometry(5 * px, head, 16);
    ownedMoving.push(shaftGeometry, tipGeometry);
    const holder = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeometry, solid("secant"));
    shaft.position.y = (length - head) / 2;
    const cone = new THREE.Mesh(tipGeometry, solid("secant"));
    cone.position.y = length - head / 2;
    holder.add(shaft, cone);
    holder.position.copy(from);
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    moving.add(holder);
    const path = [];
    for (let i = 1; i < space.section.length; i++) path.push(space.section[i - 1].map((v, j) => j === 2 ? v + 0.02 : v), space.section[i].map((v, j) => j === 2 ? v + 0.02 : v));
    if (path.length) lines(path, "tangent", ownedMoving, moving);
    for (const { x, y, dx, dy, z } of space.columns) {
      const geometry = new THREE.BoxGeometry(dx, dy, z);
      const box = new THREE.Mesh(geometry, solid("rect", 0.45));
      box.position.set(x + dx / 2, y + dy / 2, z / 2);
      const edges = new THREE.EdgesGeometry(geometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: tint("rect") });
      const outline = new THREE.LineSegments(edges, edgeMaterial);
      outline.position.copy(box.position);
      ownedMoving.push(geometry, edges, edgeMaterial);
      moving.add(box, outline);
    }
  }

  return {
    draw(renderer, drawing, halfWidth, halfHeight) {
      const { space } = drawing;
      if (!built) buildFixed();
      const next = JSON.stringify([space.walker, space.tip, space.columns.length, space.k]);
      if (next !== signature) {
        buildMoving(space);
        signature = next;
      }
      // The SVG projection places the scene centre 10 px below the middle.
      const shift = 10 / space.k;
      camera.left = -halfWidth / space.k;
      camera.right = halfWidth / space.k;
      camera.top = halfHeight / space.k + shift;
      camera.bottom = -halfHeight / space.k + shift;
      camera.position.copy(v3(space.toward).multiplyScalar(200));
      camera.up.copy(v3(space.up));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      sun.position.copy(v3(space.toward).multiplyScalar(100).add(v3(space.up).multiplyScalar(80)).add(v3(space.right).multiplyScalar(-60)));
      renderer.render(scene, camera);
    },
    dispose() {
      clearMoving();
      fixed.clear();
      ownedFixed.splice(0).forEach(item => item.dispose());
      built = false;
      signature = "";
    }
  };
}

// All declarations are initialized before the page starts.
const lesson = document.querySelector(".site-main.calculus-lesson");
if (lesson) {
  initializeLab(lesson);
  // The arcade is optional. If it fails, the Calculus Lab and the challenge keep working.
  try {
    initializeCalculusArcade(lesson);
  } catch (error) {
    console.error("Calculus Arcade could not start.", error);
  }
}
