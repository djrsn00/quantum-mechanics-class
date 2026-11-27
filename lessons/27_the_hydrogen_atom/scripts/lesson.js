const TAU = 2 * Math.PI;
const EH = 13.605693122994 / (1 + 1 / 1836.15267343);
const H_EV_S = 6.62607015e-34 / 1.602176634e-19;
const HC_EV_NM = H_EV_S * 299792458 * 1e9;
const SVG_NS = "http://www.w3.org/2000/svg";
const BINS = 24;
const S = "1,0,0";
const SECOND_S = "2,0,0";
const P = "2,1,0";
const THIRD_D = "3,2,-2";
const DASH = "—";
const EMPTY = "No photon demonstration yet.";
const NO_HITS = [];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rad = x => x * Math.PI / 180;
const number = (x, places = 2) => (Math.abs(x) < 0.5 * 10 ** -places ? 0 : x)
  .toFixed(places).replace("-", "−");
const percent = (x, places = 2) => number(100 * x, places) + "%";
const tinyPercent = x => x > 0 && x < 0.00000005 ? (100 * x).toExponential(2) + "%" : percent(x, 5);
const E = n => -EH / n ** 2;
const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
const choose = (n, k) => factorial(n) / (factorial(k) * factorial(n - k));
const stateLabel = ({ n, l, m }) => n + "spd"[l] + ", m = " + number(m, 0);
const keyOf = ({ n, l, m }) => [n, l, m].join(",");
const normDensity = density => clamp((Math.log10(Math.max(density, 1e-8)) + 8) / (8 - Math.log10(Math.PI)), 0, 1);
const phaseDegrees = phase => ((phase * 180 / Math.PI) % 360 + 360) % 360;

function radialModel(n, l) {
  const degree = n - l - 1;
  const k = 2 * l + 1;
  const lag = range(0, degree).map(i => (-1) ** i * choose(degree + k, degree - i) / factorial(i));
  const normalization = (2 / n) ** 1.5 * Math.sqrt(factorial(degree) / (2 * n * factorial(n + l)));
  const R = r => {
    const u = 2 * r / n;
    return normalization * Math.exp(-u / 2) * u ** l * lag.reduceRight((value, a) => value * u + a, 0);
  };
  const density = r => (r * R(r)) ** 2;
  let zeros = [];
  if (degree === 1) zeros = [-lag[0] / lag[1]];
  if (degree === 2) {
    const d = Math.sqrt(lag[1] ** 2 - 4 * lag[2] * lag[0]);
    zeros = [
      (-lag[1] - d) / (2 * lag[2]),
      (-lag[1] + d) / (2 * lag[2])
    ].sort((a, b) => a - b);
  }

  // In u = 2r/n, each monomial of the squared radial polynomial has an integer-shape gamma integral.
  const weights = Array(2 * degree + 1).fill(0);
  for (const [i, a] of lag.entries()) {
    for (const [j, b] of lag.entries()) weights[i + j] += a * b;
  }
  const terms = weights.map((coefficient, i) => {
    const power = i + 2 * l + 2;
    return [power, normalization ** 2 * (n / 2) ** 3 * coefficient * factorial(power)];
  });

  function probability(r, tail = false) {
    if (r <= 0) return tail ? 1 : 0;
    const u = 2 * r / n;
    if (u > 745) return tail ? 0 : 1;
    // Evaluate the lower integral directly near the origin to avoid subtracting two nearly equal numbers.
    if (!tail && u < 1) {
      const lower = terms.reduce((sum, [power, weight]) => {
        let step = u ** (power + 1) / factorial(power + 1);
        let series = step;
        for (let j = 1; j <= 25; j += 1) {
          step *= u / (power + 1 + j);
          series += step;
        }
        return sum + weight * series;
      }, 0);
      return clamp(Math.exp(-u) * lower, 0, 1);
    }
    const upper = terms.reduce((sum, [power, weight]) => {
      let factor = 1;
      let series = 1;
      for (let i = 1; i <= power; i += 1) {
        factor *= u / i;
        series += factor;
      }
      return sum + weight * series;
    }, 0) * Math.exp(-u);
    return clamp(tail ? upper : 1 - upper, 0, 1);
  }

  const edges = [0, ...zeros, 48];
  const peaks = edges.slice(0, -1).map((left, j) => {
    let lo = left;
    let hi = edges[j + 1];
    for (let i = 0; i < 48; i += 1) {
      const u = (lo + hi) / 2;
      const derivative = (2 * l + 2) / u - 1 + zeros.reduce((sum, root) => sum + 2 / (u - root), 0);
      if (derivative > 0) lo = u;
      else hi = u;
    }
    return n * (lo + hi) / 4;
  });
  const peak = peaks.reduce((best, r) => density(r) > density(best) ? r : best);
  return {
    R, density, probability, peaks, peak,
    zeros: zeros.map(u => n * u / 2),
    mean: (3 * n * n - l * (l + 1)) / 2
  };
}

function angularFactor(l, m, c) {
  const k = Math.abs(m);
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  let a;
  if (l === 0) a = 1 / Math.sqrt(4 * Math.PI);
  else if (l === 1) a = k === 0 ? Math.sqrt(3 / (4 * Math.PI)) * c
    : -Math.sqrt(3 / (8 * Math.PI)) * s;
  else if (k === 0) a = Math.sqrt(5 / (16 * Math.PI)) * (3 * c * c - 1);
  else if (k === 1) a = -Math.sqrt(15 / (8 * Math.PI)) * s * c;
  else a = Math.sqrt(15 / (32 * Math.PI)) * s * s;
  return m < 0 && k % 2 ? -a : a;
}

const STATES = new Map();
for (const n of [1, 2, 3]) {
  for (const l of range(0, n - 1)) {
    const radial = radialModel(n, l);
    for (const m of range(-l, l)) {
      STATES.set([n, l, m].join(","), { n, l, m, radial });
    }
  }
}

function angularZeros({ l, m }) {
  if (l === 0) return "None. The angular factor is constant.";
  if (l === 1 && m === 0) return "Equatorial plane z = 0.";
  if (l === 2 && m === 0) return "Two cones, cos θ = ±1/√3.";
  if (l === 2 && Math.abs(m) === 1) return "Equatorial plane and z-axis.";
  return "The z-axis.";
}

function wave(state, r, c, phi) {
  const amplitude = state.radial.R(r) * angularFactor(state.l, state.m, c);
  return {
    density: amplitude * amplitude,
    phase: Math.abs(amplitude) < 1e-14 ? null : state.m * phi + (amplitude < 0 ? Math.PI : 0)
  };
}

function positionValue(state, x, y, z) {
  const r = Math.hypot(x, y, z);
  return wave(state, r, r ? z / r : 1, Math.atan2(y, x));
}

function interval(radial, a, b) {
  if (a === b) return 0;
  return clamp(a >= 8
    ? radial.probability(a, true) - radial.probability(b, true)
    : radial.probability(b) - radial.probability(a), 0, 1);
}

function sample(state, random = Math.random) {
  const u = random();
  let lo = 0;
  let hi = 16;
  while (state.radial.probability(hi) < u) hi *= 2;
  for (let j = 0; j < 42; j += 1) {
    const mid = (lo + hi) / 2;
    if (state.radial.probability(mid) < u) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  const { l, m } = state;
  const peakC = m === 0 ? 1 : l === 2 && Math.abs(m) === 1 ? Math.SQRT1_2 : 0;
  const maximum = angularFactor(l, m, peakC) ** 2;
  // Solid angle is uniform in cos θ and φ before weighting it by |Y|².
  let c;
  do {
    c = 2 * random() - 1;
  } while (random() * maximum > angularFactor(l, m, c) ** 2);
  const phi = TAU * random();
  const xy = r * Math.sqrt(Math.max(0, 1 - c * c));
  return { r, x: xy * Math.cos(phi), y: xy * Math.sin(phi), z: r * c };
}

function photon(initial, final) {
  const gap = E(final.n) - E(initial.n);
  const dl = final.l - initial.l;
  const dm = final.m - initial.m;
  const rules = Math.abs(dl) === 1 && Math.abs(dm) <= 1;
  return {
    gap, dl, dm, rules,
    energy: Math.abs(gap),
    allowed: gap !== 0 && rules,
    frequency: gap ? Math.abs(gap) / H_EV_S : null,
    wavelength: gap ? HC_EV_NM / Math.abs(gap) : null
  };
}

function laboratory() {
  return {
    active: S,
    compare: "none",
    samples: [],
    initial: P,
    final: S,
    photonMode: "dipole",
    lines: new Map(),
    photonReport: EMPTY,
    probe: { r: 0, theta: 0, phi: 0, a: 0, b: 1 },
    view: {
      mode: "cloud", palette: "density", extent: 8, contour: .0001, opacity: 65, z: 0,
      nodes: true, detections: true, theory: true
    }
  };
}

function contourSegments(state, z, extent, level, cells, emit) {
  const step = 2 * extent / cells;
  const side = cells + 1;
  const values = new Float64Array(side * side);
  for (let j = 0; j < side; j += 1) {
    for (let i = 0; i < side; i += 1) {
      values[j * side + i] = positionValue(state, i * step - extent, j * step - extent, z).density;
    }
  }

  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const base = j * side + i;
      const offsets = [base, base + 1, base + side + 1, base + side];
      const x = i * step - extent;
      const y = j * step - extent;
      const points = [[x, y], [x + step, y], [x + step, y + step], [x, y + step]];
      const crossings = offsets.flatMap((offset, k) => {
        const a = values[offset];
        const b = values[offsets[(k + 1) % 4]];
        if ((a >= level) === (b >= level)) return [];
        const t = (level - a) / (b - a);
        const from = points[k];
        const to = points[(k + 1) % 4];
        return [[from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1])]];
      });
      if (crossings.length === 2) emit(crossings[0], crossings[1]);
      if (crossings.length === 4) {
        const inside = positionValue(state, x + step / 2, y + step / 2, z).density >= level;
        const first = inside === (values[base] >= level) ? 0 : 1;
        emit(crossings[first], crossings[(first + 1) % 4]);
        emit(crossings[(first + 2) % 4], crossings[(first + 3) % 4]);
      }
    }
  }
}

function nodeCircles(state, z) {
  const circles = state.radial.zeros.filter(r => r >= Math.abs(z)).map(r => Math.sqrt(r * r - z * z));
  if (state.l === 2 && state.m === 0) circles.push(Math.SQRT2 * Math.abs(z));
  if (state.m !== 0) circles.push(0);
  return circles;
}

const PHASE_COLORS = [
  [113, 227, 216], [101, 183, 255], [221, 145, 249], [255, 164, 105], [113, 227, 216]
];

function phaseColor(phase) {
  if (phase === null) return [20, 28, 44];
  const angle = phaseDegrees(phase) / 90;
  const corner = Math.floor(angle);
  return PHASE_COLORS[corner].map((value, i) =>
    value + (PHASE_COLORS[corner + 1][i] - value) * (angle - corner));
}

function drawSlice(canvas, state, view, detections, reduced) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const size = reduced ? 110 : 180;
  if (canvas.width !== size || canvas.height !== size) canvas.width = canvas.height = size;
  const { extent, z, palette, mode, contour, opacity } = view;
  const half = size / 2;
  const scale = half / extent;
  const screenX = x => half + x * scale;
  const screenY = y => half - y * scale;
  const image = ctx.createImageData(size, size);

  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const x = (i + 0.5 - half) / scale;
      const y = (half - j - 0.5) / scale;
      const inView = Math.hypot(x, y, z) <= extent;
      const value = inView ? positionValue(state, x, y, z) : { density: 0, phase: null };
      const rgb = palette === "phase" ? phaseColor(value.phase) : [170, 248, 228];
      const strength = normDensity(value.density) * opacity / 100 * (mode === "surface" ? 0.32 : 1);
      const offset = 4 * (i + size * j);
      for (const [k, background] of [8, 15, 30].entries()) {
        image.data[offset + k] = background + (rgb[k] - background) * strength;
      }
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  ctx.strokeStyle = "#5c7588";
  ctx.beginPath();
  ctx.moveTo(0, half + .5);
  ctx.lineTo(size, half + .5);
  ctx.moveTo(half + .5, 0);
  ctx.lineTo(half + .5, size);
  ctx.stroke();

  if (mode === "surface" && Math.abs(z) < extent) {
    ctx.strokeStyle = "#ffe16a";
    ctx.beginPath();
    contourSegments(state, z, extent, contour, reduced ? 36 : 60, (a, b) => {
      if ([a, b].some(([x, y]) => Math.hypot(x, y, z) > extent)) return;
      ctx.moveTo(screenX(a[0]), screenY(a[1]));
      ctx.lineTo(screenX(b[0]), screenY(b[1]));
    });
    ctx.stroke();
  }
  if (view.nodes) {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#f3ccf4";
    const limit = Math.sqrt(Math.max(0, extent * extent - z * z));
    const circles = nodeCircles(state, z);
    if (Math.abs(z) < 1e-9 && Math.abs(angularFactor(state.l, state.m, 0)) < 1e-14) circles.push(limit);
    for (const r of circles.filter(r => r <= limit)) {
      ctx.beginPath();
      ctx.arc(half, half, Math.max(2.5, r * scale), 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (view.detections) {
    ctx.fillStyle = "#ff759c";
    for (const p of detections.slice(-800)) {
      if (p.r <= extent && Math.abs(p.z - z) <= extent / 40) {
        ctx.fillRect(screenX(p.x) - 1, screenY(p.y) - 1, 2, 2);
      }
    }
  }
  if (z === 0) {
    ctx.fillStyle = "#ffe16a";
    ctx.beginPath();
    ctx.arc(half, half, 2.3, 0, TAU);
    ctx.fill();
  }
  return true;
}

function makeExplorer(THREE, canvas, viewport, browser) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 1, 0.08, 110);
  scene.background = new THREE.Color(0x080f1e);
  const sphere = new THREE.SphereGeometry(1, 24, 15);
  const yUp = (x, y, z) => [x, z, -y];

  function mesh(group, geometry, color, extra = {}) {
    const part = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, ...extra }));
    group.add(part);
    return part;
  }

  for (const x of [-6.8, 6.8]) {
    mesh(scene, new THREE.BoxGeometry(.13, 5.6, .16), 0x4c6c8c).position.set(x, 0, -2.9);
    mesh(scene, new THREE.BoxGeometry(4, .12, 2.9), 0x193047).position.set(x * .64, -3.4, -.7);
  }
  mesh(scene, new THREE.BoxGeometry(14, .12, .28), 0x263c58).position.set(0, 3, -3);
  const flash = mesh(scene, sphere, 0xffffff);
  flash.scale.setScalar(.075);

  function cloudLayer(group, capacity, color, size, points, useColors) {
    const geo = new THREE.BufferGeometry();
    const p = new THREE.BufferAttribute(new Float32Array(3 * capacity), 3);
    geo.setAttribute("position", p);
    const c = useColors ? new THREE.BufferAttribute(new Float32Array(3 * capacity), 3) : null;
    if (c) geo.setAttribute("color", c);
    const mat = points
      ? new THREE.PointsMaterial({ color, size, vertexColors: useColors, transparent: true, depthWrite: false })
      : new THREE.LineBasicMaterial({ color, vertexColors: useColors, transparent: true });
    const object = points ? new THREE.Points(geo, mat) : new THREE.LineSegments(geo, mat);
    object.frustumCulled = false;
    group.add(object);

    function update(coords, colors) {
      p.array.set(coords);
      p.needsUpdate = true;
      if (c) {
        c.array.set(colors);
        c.needsUpdate = true;
      }
      geo.setDrawRange(0, coords.length / 3);
    }
    return { object, update };
  }

  const banks = [0, 1].map(() => {
    const group = new THREE.Group();
    scene.add(group);
    mesh(group, sphere, 0xffdc71).scale.setScalar(.09);
    const nodes = [0, 1].map(() => mesh(group, sphere, 0x9a79ca, {
      wireframe: true, transparent: true, opacity: .17
    }));
    const plane = mesh(group, new THREE.PlaneGeometry(1, 1), 0x6d8cad, {
      side: THREE.DoubleSide, transparent: true, opacity: .12, depthWrite: false
    });
    plane.rotation.x = -Math.PI / 2;
    return {
      group, nodes, plane,
      points: cloudLayer(group, 4600, 0xffffff, .045, true, true),
      outline: cloudLayer(group, 36000, 0xffffff, 0, false, true),
      angular: cloudLayer(group, 384, 0x9a79ca, 0, false, false),
      hits: cloudLayer(group, 800, 0xff7d9b, .085, true, false),
      displayKey: "", hitSource: null, hitCount: -1, hitExtent: 0
    };
  });

  const illustration = new Map();
  function illustrated(state) {
    const key = keyOf(state);
    if (!illustration.has(key)) {
      let seed = 793 + state.n * 137 + state.l * 29 + state.m;
      const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      illustration.set(key, Array.from({ length: 4200 }, () => sample(state, random)));
    }
    return illustration.get(key);
  }

  let sizeKey = "";
  function atom(bank, state, view, hits, x) {
    bank.group.visible = Boolean(state);
    if (!state) return;
    bank.group.position.x = x;
    const { extent, z, mode, contour, palette, nodes, detections, opacity } = view;
    const scale = 3.1 / extent;
    const key = [keyOf(state), extent, mode, mode === "cutaway" ? z : 0, contour, palette].join(":");

    if (key !== bank.displayKey) {
      bank.displayKey = key;
      const coords = [];
      const colors = [];
      const lines = [];
      const lineColors = [];
      if (mode === "surface") {
        for (let j = -12; j <= 12; j += 1) {
          const layer = extent * j / 12;
          contourSegments(state, layer, extent, contour, 36, (a, b) => {
            if (lines.length >= 108000 || [a, b].some(([u, v]) => Math.hypot(u, v, layer) > extent)) return;
            for (const [u, v] of [a, b]) {
              lines.push(...yUp(scale * u, scale * v, scale * layer));
              const rgb = palette === "phase"
                ? phaseColor(positionValue(state, u, v, layer).phase) : [112, 229, 219];
              lineColors.push(...rgb.map(c => c / 255));
            }
          });
        }
      } else {
        for (const p of illustrated(state)) {
          if (p.r > extent || (mode === "cutaway" && p.z > z)) continue;
          coords.push(...yUp(p.x * scale, p.y * scale, p.z * scale));
          const value = positionValue(state, p.x, p.y, p.z);
          const rgb = palette === "phase" ? phaseColor(value.phase)
            : [113, 227, 216].map(c => c * (.45 + .55 * normDensity(value.density)));
          colors.push(...rgb.map(c => c / 255));
        }
      }
      bank.points.update(coords, colors);
      bank.outline.update(lines, lineColors);

      const guides = [];
      const circle = (radius, height) => {
        for (let j = 0; j < 60; j += 1) {
          for (const k of [j, j + 1]) {
            const angle = k * TAU / 60;
            guides.push(...yUp(radius * Math.cos(angle), radius * Math.sin(angle), height));
          }
        }
      };
      if (state.m !== 0) guides.push(...yUp(0, 0, -3.1), ...yUp(0, 0, 3.1));
      if (state.l && Math.abs(angularFactor(state.l, state.m, 0)) < 1e-14) circle(3.1, 0);
      if (state.l === 2 && state.m === 0) {
        for (const sign of [-1, 1]) {
          const height = sign * 3.1 / Math.sqrt(3);
          const radius = Math.SQRT2 * Math.abs(height);
          circle(radius, height);
          for (let j = 0; j < 8; j += 1) {
            const angle = j * TAU / 8;
            guides.push(0, 0, 0, ...yUp(radius * Math.cos(angle), radius * Math.sin(angle), height));
          }
        }
      }
      bank.angular.update(guides);
    }

    bank.points.object.visible = mode !== "surface";
    bank.outline.object.visible = mode === "surface";
    bank.points.object.material.opacity = .48 * opacity / 100;
    bank.outline.object.material.opacity = opacity / 100;
    bank.nodes.forEach((part, i) => {
      const r = state.radial.zeros[i];
      part.visible = nodes && r !== undefined && r <= extent;
      if (part.visible) part.scale.setScalar(r * scale);
    });
    bank.angular.object.visible = nodes;
    bank.angular.object.material.opacity = .45;
    bank.plane.visible = mode === "cutaway";
    bank.plane.position.y = z * scale;
    const width = 2 * scale * Math.sqrt(Math.max(0, extent * extent - z * z));
    bank.plane.scale.set(width, width, 1);

    if (hits !== bank.hitSource || hits.length !== bank.hitCount || extent !== bank.hitExtent) {
      bank.hits.update(hits.slice(-800).filter(p => p.r <= extent)
        .flatMap(p => yUp(p.x * scale, p.y * scale, p.z * scale)));
      bank.hitSource = hits;
      bank.hitCount = hits.length;
      bank.hitExtent = extent;
    }
    bank.hits.object.visible = detections && hits.length > 0;
  }

  return {
    draw(lab, pose, photonProgress, event) {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(browser.devicePixelRatio || 1, 1.5, 1500 / Math.max(width, height));
      const nextSize = [width, height, ratio].join(":");
      if (sizeKey !== nextSize) {
        sizeKey = nextSize;
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      const comparison = STATES.get(lab.compare);
      atom(banks[0], STATES.get(lab.active), lab.view, lab.samples, comparison ? -3.6 : 0);
      if (comparison) atom(banks[1], comparison, lab.view, NO_HITS, 3.6);
      else banks[1].group.visible = false;

      const distance = pose.inside ? .56 : (comparison ? 16 : 11) * Math.max(1, 1.6 / camera.aspect);
      const a = rad(pose.orbit);
      const b = rad(pose.tilt);
      const target = pose.inside && comparison ? -3.6 : 0;
      camera.position.set(target + distance * Math.cos(b) * Math.sin(a),
        distance * Math.sin(b), distance * Math.cos(b) * Math.cos(a));
      camera.lookAt(target, 0, 0);

      flash.visible = event !== null && photonProgress < 1;
      if (flash.visible) {
        const progress = event.gap < 0 ? photonProgress : 1 - photonProgress;
        flash.position.set(banks[0].group.position.x + 4.8 * progress, .55 * progress, 0);
        flash.material.color.setHex(event.wavelength < 400 ? 0xc19bff : 0xff7777);
      }
      renderer.render(scene, camera);
    },
    dispose() {
      const geometries = new Set();
      const materials = new Set();
      scene.traverse(obj => {
        if (obj.geometry) geometries.add(obj.geometry);
        if (obj.material) materials.add(obj.material);
      });
      geometries.forEach(geo => geo.dispose());
      materials.forEach(mat => mat.dispose());
      renderer.dispose();
    }
  };
}

const MISSIONS = {
  first: [
    "First Contact. Record two probes at the same distance in 1s.",
    "Change direction while holding distance fixed."
  ],
  shell: [
    "The Shell Scanner. Identify the point maximum, radial maximum, and mean for 1s.",
    "The radial curve includes r². Compare its peak with the center and the calculated expectation."
  ],
  node: [
    "Node Hunter. Locate a 2s radial zero and the 2p, m = 0 angular zero.",
    "Compare the distance where R changes sign with the directions where Y changes sign."
  ],
  build: [
    "Build an Orbital. Prepare 3d with m = −2, then diagnose the invalid tuple.",
    "A d state has ℓ = 2. The allowed m values run from −ℓ to +ℓ."
  ],
  map: [
    "The Measurement Map. Predict the probability of a detection inside one aH, then measure.",
    "Integrate the radial distribution across the highlighted sphere."
  ],
  spectral: [
    "Spectral Detective. Identify the principal levels of the mystery emission line.",
    "Compare hc/λ with EH(1/nf² − 1/ni²). An emission has ni > nf."
  ],
  forbid: [
    "The Forbidden Jump. Compare the two absorption candidates and commit an electric-dipole prediction.",
    "The energy depends on n. The dipole check also uses Δℓ and Δm."
  ],
  inside: [
    "Inside the Lobes. Record slice centers below, on, and above the equatorial node.",
    "Move z to about −1, 0, and +1 aH, recording each plane. Compare the phases."
  ],
  same: [
    "Same Energy, Different Shape. Compare prepared 2s with 2p, m = 0.",
    "Inspect the scanner’s two curves and the slices. Compare only n when calculating energy."
  ]
};

function initialize(root) {
  const document = root.ownerDocument;
  const browser = document.defaultView;
  const cache = new Map();
  function get(id) {
    if (!cache.has(id)) cache.set(id, root.querySelector("#ha-" + id));
    return cache.get(id);
  }
  const set = (id, value) => { get(id).value = String(value); };
  const text = (id, value) => {
    const node = get(id);
    const message = String(value);
    if (node.textContent !== message) node.textContent = message;
  };
  const hide = (id, hidden) => get(id).toggleAttribute("hidden", hidden);
  const disable = (id, disabled) => { get(id).disabled = disabled; };
  const on = (id, action, type = "click") => get(id).addEventListener(type, action);
  const input = id => get(id).value;
  const checked = id => get(id).checked;
  const attribute = (id, key, value) => get(id).setAttribute(key, value);
  const path = (id, value) => attribute(id, "d", value);
  const svg = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    return el;
  };

  const motion = browser.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => motion.matches || checked("effects");
  const panels = [...root.querySelectorAll("[data-ha-mission]")];
  const bar = (id, count) => {
    const bars = Array.from({ length: count }, () => svg("rect", {}));
    get(id).replaceChildren(...bars);
    return bars;
  };
  const observed = bar("histogram", BINS);
  const expected = bar("theory-bins", BINS);
  const free = laboratory();
  const slices = {};
  let mission = null;
  let boarded = false;
  let inside = false;
  let scene = null;
  let failed = false;
  let pending = false;
  let version = 0;
  let frame = null;
  let pulse = null;

  const lab = () => mission?.lab ?? free;
  const kind = () => mission?.key;
  const waiting = key => kind() === key && !mission.revealed;
  const current = () => STATES.get(lab().active);
  const score = message => text("mission-feedback", message);
  const status = message => text("lab-status", message);
  const reference = photon(STATES.get("3,2,0"), STATES.get(P));
  const distance = (r, digits = 3) => number(r, digits) + " aH";
  const density = (d, power) => number(d, 6) + " aH⁻" + power;

  function options(id, entries, selected) {
    const node = get(id);
    if (node.options.length !== entries.length || entries.some(([key, label], j) =>
      node.options[j].value !== String(key) || node.options[j].textContent !== label)) {
      node.replaceChildren(...entries.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = label;
        return option;
      }));
    }
    set(id, selected);
  }

  const stateOptions = [...STATES].map(([key, state]) => [key, stateLabel(state)]);

  function renderState() {
    const state = current();
    const { n, l, m, radial } = state;
    set("n", n);
    options("l", range(0, n - 1).map(i => [i, i + " · " + "spd"[i]]), l);
    options("m", range(-l, l).map(i => [i, number(i, 0)]), m);
    set("compare", lab().compare);
    for (const id of ["n", "l", "m", "restore"]) disable(id, Boolean(mission) && kind() !== "build");
    disable("compare", kind() === "node" || kind() === "same");

    text("ket", "|" + [n, l, number(m, 0)].join(",") + "⟩ · " + stateLabel(state));
    text("energy", number(E(n), 4) + " eV");
    text("angular", l * (l + 1) + " ℏ² and " + number(m, 0) + " ℏ");
    text("radial-nodes", waiting("node") ? "Inspect the radial curve before committing."
      : radial.zeros.length ? radial.zeros.map(r => distance(r)).join(", ") : "None");
    text("angular-nodes", waiting("node") ? "Compare the angular slices before committing." : angularZeros(state));
    hide("mean-card", waiting("shell"));
    text("mean", distance(radial.mean));
    text("vessel-state", "Prepared " + stateLabel(state) + (lab().compare === "none" ? "."
      : " · Comparison " + stateLabel(STATES.get(lab().compare)) + "."));
  }

  function renderSlices() {
    const { view, active, compare, samples } = lab();
    for (const [slot, key, hits] of [["a", active, samples], ["b", compare, NO_HITS]]) {
      const state = STATES.get(key);
      if (!state) continue;
      const mark = [key, view.extent, view.z, view.mode, view.palette, view.contour,
        view.opacity, view.nodes, view.detections, reduced(), hits.length].join(":");
      if (!slices[slot] || slices[slot].key !== mark || slices[slot].hits !== hits) {
        const drawn = drawSlice(get("slice-" + slot), state, view, hits, reduced());
        hide("slice-" + slot, !drawn);
        if (slot === "a") hide("static-slice", drawn || key !== S || view.z !== 0);
        slices[slot] = { key: mark, hits };
      }
      const point = positionValue(state, 0, 0, view.z);
      text("slice-label-" + slot, (slot === "a" ? "Prepared · " : "Comparison · ") + stateLabel(state));
      text("slice-probe-" + slot, "Center of the z = " + distance(view.z, 2) + " slice: density "
        + density(point.density, "³") + ". Phase "
        + (point.phase === null ? "is undefined at the node." : number(phaseDegrees(point.phase), 1) + "°."));
    }
    hide("slice-compare", compare === "none");
    text("slice-legend", "Shared scale: ±" + view.extent
      + " aH along x and y. Brightness uses a common logarithmic density scale from 10⁻⁸ to 1/π aH⁻³. "
      + (view.palette === "phase" ? "Phase hue: cyan 0°, blue 90°, violet 180°, orange 270°. "
        : "Cyan intensity indicates point density. ")
      + (view.mode === "surface" ? "Yellow slice contours: |ψ|² = " + view.contour + " aH⁻³. "
        : view.mode === "cutaway" ? "The vessel hides illustrative points above the z slice. " : "")
      + (view.nodes ? "Dashed marks show where nodes meet the slice. " : "")
      + (view.detections ? "Pink points are recent measured positions close to this slice." : ""));

    text("opacity-value", view.opacity + "%");
    text("slice-value", number(view.z, 2));
    get("slice-z").min = String(-view.extent);
    get("slice-z").max = String(view.extent);
    for (const [id, value] of [
      ["extent", view.extent], ["view", view.mode], ["palette", view.palette],
      ["opacity", view.opacity], ["contour", view.contour], ["slice-z", view.z]
    ]) set(id, value);
    get("nodes").checked = view.nodes;
    get("show-detections").checked = view.detections;
    get("theory").checked = view.theory;
    disable("contour", view.mode !== "surface");
  }

  function renderScanner() {
    const data = lab();
    const state = current();
    const { probe, view, samples } = data;
    const { extent } = view;
    const radial = state.radial;
    const comparison = STATES.get(data.compare)?.radial;
    const direction = Math.cos(rad(probe.theta));
    const alongRay = r => wave(state, r, direction, rad(probe.phi)).density;
    const binWidth = extent / BINS;
    const counts = Array(BINS).fill(0);
    let off = 0;
    let inShell = 0;
    for (const point of samples) {
      if (point.r > extent) off += 1;
      else counts[Math.min(BINS - 1, Math.floor(point.r / binWidth))] += 1;
      if (point.r >= probe.a && point.r <= probe.b) inShell += 1;
    }

    const count = samples.length;
    const last = samples.at(-1);
    const pShell = interval(radial, probe.a, probe.b);
    const pOff = radial.probability(extent, true);
    const theory = counts.map((_, j) => interval(radial, j * binWidth, (j + 1) * binWidth));
    const hidePrediction = waiting("map");
    const showTheory = view.theory && !hidePrediction;
    const observedDensities = counts.map(n => count ? n / (count * binWidth) : 0);
    const x = r => 68 + 562 * r / extent;
    const rr = range(0, 360).map(i => extent * i / 360);
    const pointMax = Math.max(.01, Math.ceil(100 * Math.max(...rr.map(alongRay))) / 100);
    const radialMax = Math.max(.1, Math.ceil(10 * Math.max(...rr.map(radial.density),
      ...(comparison ? rr.map(comparison.density) : []), ...observedDensities,
      ...(showTheory ? theory.map(p => p / binWidth) : []))) / 10);
    const rY = d => 251 - 100 * d / radialMax;
    const makePath = (radii, value, y) => radii.map((r, j) =>
      (j ? "L" : "M") + x(r).toFixed(2) + " " + y(value(r)).toFixed(2)).join("");

    path("point-path", makePath(rr, alongRay, d => 118 - 82 * d / pointMax));
    path("radial-path", makePath(rr, radial.density, rY));
    path("compare-path", comparison ? makePath(rr, comparison.density, rY) : "");
    hide("compare-path", !comparison);
    hide("compare-key", !comparison);
    const inRange = range(0, 80).map(i => probe.a + (probe.b - probe.a) * i / 80);
    path("shell-shade", probe.a === probe.b ? ""
      : makePath(inRange, radial.density, rY) + "V251H" + x(probe.a) + "Z");
    path("shell-lines", [probe.a, probe.b].map(v => "M" + x(v) + " 151V251").join(" "));
    path("probe-line", "M" + x(probe.r) + " 36V251");
    const nodes = view.nodes && !waiting("node") ? radial.zeros.filter(r => r <= extent) : [];
    get("node-marks").replaceChildren(...nodes.map(r => svg("circle", { cx: x(r), cy: 251, r: 3.8 })));
    hide("theory-bins", !showTheory);
    for (const i of counts.keys()) {
      for (const [node, d] of [
        [observed[i], observedDensities[i]], [expected[i], showTheory ? theory[i] / binWidth : 0]
      ]) {
        const y = rY(d);
        const attrs = { x: x(i * binWidth), y, width: 562 / BINS, height: 251 - y };
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      }
    }

    text("point-top", number(pointMax, 2));
    text("radial-top", number(radialMax, 2));
    for (const i of [1, 2, 3, 4]) text("tick" + i, extent * i / 4);
    text("radial-desc", stateLabel(state)
      + ". Point density follows the selected probe direction. The lower curve integrates all angles."
      + (comparison ? " The dashed comparison curve shares the radial scale." : "")
      + (waiting("shell") ? "" : " Global radial peak at " + distance(radial.peak) + "."));
    for (const [name, value] of [["probe-r", probe.r], ["shell-min", probe.a], ["shell-max", probe.b]]) {
      get(name).max = String(extent);
      set(name, value);
      text(name + "-value", number(value));
    }
    for (const angle of ["theta", "phi"]) {
      set(angle, probe[angle]);
      text(angle + "-value", probe[angle] + "°");
    }
    text("probe-direction", "θ = " + probe.theta + "°, φ = " + probe.phi + "°"
      + (probe.r ? "" : " · origin is direction-independent"));
    text("point-density", density(alongRay(probe.r), "³"));
    text("radial-density", density(radial.density(probe.r), "¹"));
    text("shell-width", distance(probe.b - probe.a, 2));
    text("shell-probability", hidePrediction ? "Commit the mission prediction." : percent(pShell));
    hide("peak-card", waiting("shell"));
    hide("local-card", waiting("shell"));
    text("peak", distance(radial.peak));
    text("local-peaks", radial.peaks.map(r => distance(r)).join(", "));
    text("count", count);
    text("last", last ? "(" + [last.x, last.y, last.z].map(v => number(v, 3)).join(", ") + ") aH" : DASH);
    text("last-r", last ? distance(last.r) : DASH);
    text("in-shell", inShell);
    text("shell-frequency", count ? percent(inShell / count) : DASH);
    text("off-count", (count - off) + " / " + off);
    text("off-probability", hidePrediction ? DASH : tinyPercent(pOff));
    text("sampler-note", "Sampling uses the entire radial distribution. The view ends at " + distance(extent, 0)
      + ". Predicted and observed outlying detections are counted separately.");
    text("vessel-detector", count ? count + " trials · latest radius " + distance(last.r) : "Detector idle · 0 trials");
    for (const id of ["one", "batch"]) disable(id, hidePrediction);
    for (const id of ["shell-min", "shell-max"]) disable(id, kind() === "map");
    disable("clear", count === 0);
    hide("opening", Boolean(mission) || data.active !== S);

    const rows = counts.map((n, j) => [
      number(j * binWidth, 3) + " to " + number((j + 1) * binWidth, 3),
      hidePrediction ? DASH : percent(theory[j], 3), n
    ]);
    rows.push(["Beyond " + extent, hidePrediction ? DASH : tinyPercent(pOff), off]);
    get("bin-rows").replaceChildren(...rows.map(([label, p, n]) => {
      const row = document.createElement("tr");
      const heading = document.createElement("th");
      heading.scope = "row";
      heading.textContent = label;
      const values = [p, n].map(value => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        return cell;
      });
      row.append(heading, ...values);
      return row;
    }));
  }

  function renderPhoton() {
    const data = lab();
    const initial = STATES.get(data.initial);
    const final = STATES.get(data.final);
    const p = photon(initial, final);
    for (const [id, value] of [
      ["initial", data.initial], ["final", data.final], ["photon-mode", data.photonMode]
    ]) set(id, value);

    const label = !p.gap ? "Zero gap" : p.gap > 0 ? "Absorption" : "Emission";
    const energyY = n => 21 - 10.715 * E(n);
    const yi = energyY(initial.n);
    const yf = energyY(final.n);
    attribute("level-initial", "cy", yi);
    attribute("level-final", "y", yf - 5);
    const dx = 36;
    const dy = yf - yi;
    const size = Math.hypot(dx, dy);
    const ax = 270 - 10 * dx / size;
    const ay = yf - 10 * dy / size;
    const px = 4 * dy / size;
    const py = -4 * dx / size;
    path("level-arrow", "M234 " + yi + "L270 " + yf + "M" + (ax + px) + " " + (ay + py)
      + "L270 " + yf + "L" + (ax - px) + " " + (ay - py));
    text("level-desc", stateLabel(initial) + " at " + number(E(initial.n), 4) + " eV to "
      + stateLabel(final) + " at " + number(E(final.n), 4) + " eV. " + label + ".");
    text("gap", (p.gap > 0 ? "+" : "") + number(p.gap, 4) + " eV");
    text("photon-kind", label);
    text("photon-energy", p.gap ? number(p.energy, 4) + " eV" : "0 eV");
    text("frequency", p.frequency === null ? DASH : number(p.frequency / 1e15, 4) + " × 10¹⁵ Hz");
    text("wavelength", p.wavelength === null ? DASH : number(p.wavelength, 2) + " nm"
      + (p.wavelength < 400 ? " · UV" : " · visible"));

    const changes = "Δℓ = " + number(p.dl, 0) + " and Δm = " + number(p.dm, 0) + ". ";
    let rules;
    if (p.rules) {
      rules = "Angular rules pass for some compatible polarization.";
    } else {
      const violations = [];
      if (Math.abs(p.dl) !== 1) violations.push("Δℓ must equal ±1");
      if (Math.abs(p.dm) > 1) violations.push("|Δm| must be at most 1");
      rules = "Electric-dipole check fails. " + violations.join(". ") + ".";
    }
    text("dipole", data.photonMode === "gap" ? "Energy-gap view. This calculation gives the candidate photon energy."
      : changes + rules + (!p.gap ? " The zero gap supplies no photon." : ""));
    text("photon-note", !p.gap ? "Equal principal levels have the same energy here. No finite-frequency photon is demonstrated."
      : !p.allowed ? "Demonstration unavailable under the single-photon electric-dipole check. The energy gap is still shown."
        : "A demonstration illustrates a selected event for compatible polarization. The model supplies no timing, rate, or intensity.");
    text("demo", p.gap > 0 ? "Demonstrate absorption" : p.gap < 0 ? "Demonstrate emission" : "No photon to demonstrate");
    disable("demo", !p.allowed);
    disable("spectrum-clear", data.lines.size === 0);
    text("vessel-photon", data.photonReport);

    const lines = [...data.lines.values()].sort((a, b) => a.wavelength - b.wavelength);
    const descriptions = lines.map(line => line.label + " · " + number(line.wavelength) + " nm"
      + (line.wavelength < 400 ? " UV (symbolic color)" : "") + " · "
      + line.count + (line.count === 1 ? " demonstration" : " demonstrations"));
    get("lines").replaceChildren(...lines.map(line => {
      const x = 48 + 564 * (line.wavelength - 100) / 600;
      return svg("line", {
        x1: x, y1: 29, x2: x, y2: 65,
        stroke: line.wavelength < 400 ? "#c19bff" : "#ff676f",
        "data-band": line.wavelength < 400 ? "uv" : "visible"
      });
    }));
    get("spectrum-list").replaceChildren(...(lines.length ? descriptions : ["No emissions demonstrated yet."]).map(message => {
      const item = document.createElement("li");
      item.textContent = message;
      return item;
    }));
    text("spectrum-desc", descriptions.length ? descriptions.join(". ") + "." : "No demonstrated lines.");
  }

  function render() {
    for (const pane of panels) pane.hidden = pane.dataset.haMission !== kind();
    disable("mission-retry", !mission);
    disable("mission-exit", !mission);
    renderState();
    renderSlices();
    renderScanner();
    renderPhoton();
    drawScene();
  }

  function stopPulse() {
    pulse = null;
    if (frame !== null) browser.cancelAnimationFrame(frame);
    frame = null;
  }

  function releaseGraphics() {
    version += 1;
    pending = false;
    stopPulse();
    scene?.dispose();
    scene = null;
    hide("viewport", true);
  }

  function pose() {
    return { inside, orbit: Number(input("orbit")), tilt: Number(input("tilt")) };
  }

  function drawScene() {
    if (!scene || document.hidden || !boarded || reduced()) return;
    const progress = pulse ? (browser.performance.now() - pulse.start) / 850 : 1;
    try {
      scene.draw(lab(), pose(), clamp(progress, 0, 1), pulse?.event ?? null);
      if (progress < 1 && frame === null) {
        frame = browser.requestAnimationFrame(() => {
          frame = null;
          drawScene();
        });
      }
      if (progress >= 1 && pulse) stopPulse();
    } catch {
      failed = true;
      releaseGraphics();
      text("renderer", "The calibrated slices and instruments below are active.");
    }
  }

  async function syncGraphics() {
    const camera = pose();
    text("orbit-value", number(camera.orbit, 0) + "°");
    text("tilt-value", number(camera.tilt, 0) + "°");
    text("inside", inside ? "Return to observation deck" : "Enter the Atom");
    attribute("inside", "aria-pressed", String(inside));
    if (!boarded || reduced() || failed) {
      releaseGraphics();
      text("renderer", reduced() ? "Reduced effects. Explore both states using the calibrated slices below."
        : "The calibrated slices and instruments below are active.");
      return;
    }
    if (document.hidden || pending) return;
    if (scene) {
      drawScene();
      return;
    }
    const ticket = ++version;
    pending = true;
    text("renderer", "Loading the observation deck. The calibrated slices remain active.");
    try {
      const THREE = await import("../vendor/three.module.js");
      if (ticket !== version || document.hidden) return;
      scene = makeExplorer(THREE, get("world"), get("viewport"), browser);
      hide("viewport", false);
      text("renderer", "Observation deck active. Matched scales for both states. Contours follow the selected density and palette. Pink points mark recent simulated detections.");
      drawScene();
    } catch {
      if (ticket !== version) return;
      failed = true;
      releaseGraphics();
      text("renderer", "Three-dimensional graphics are unavailable. Explore the atom with the calibrated slices below.");
    } finally {
      if (ticket === version) pending = false;
    }
  }

  function prepare(state) {
    const data = lab();
    if (data.active === state) return;
    data.active = state;
    data.samples = [];
    status("Prepared " + stateLabel(current()) + ". Started a fresh measurement ensemble.");
    render();
  }

  for (const field of ["n", "l", "m"]) {
    on(field, () => {
      if (mission && kind() !== "build") return;
      const state = current();
      const value = Number(input(field));
      if (!Number.isInteger(value)) return;
      const n = field === "n" ? clamp(value, 1, 3) : state.n;
      const l = clamp(field === "l" ? value : state.l, 0, n - 1);
      const m = clamp(field === "m" ? value : state.m, -l, l);
      prepare(keyOf({ n, l, m }));
    }, "change");
  }
  on("restore", () => {
    lab().active = S;
    lab().samples = [];
    render();
    status("Restored 1s and cleared position detections.");
  });
  on("compare", () => {
    const value = input("compare");
    if (value === "none" || STATES.has(value)) lab().compare = value;
    render();
  }, "change");

  for (const [id, values] of [
    ["view", ["cloud", "cutaway", "surface"]],
    ["palette", ["density", "phase"]],
    ["extent", ["8", "16", "32"]],
    ["contour", ["0.00001", "0.0001", "0.001", "0.01"]]
  ]) {
    on(id, () => {
      const value = input(id);
      const data = lab();
      if (!values.includes(value)) return;
      data.view[id === "view" ? "mode" : id] = id === "extent" || id === "contour" ? Number(value) : value;
      if (id === "extent") {
        const extent = data.view.extent;
        data.view.z = clamp(data.view.z, -extent, extent);
        for (const key of ["r", "a", "b"]) data.probe[key] = Math.min(data.probe[key], extent);
      }
      render();
    }, "change");
  }
  for (const [id, key] of [["nodes", "nodes"], ["show-detections", "detections"], ["theory", "theory"]]) {
    on(id, () => {
      lab().view[key] = checked(id);
      render();
    }, "change");
  }

  function readNumber(id) {
    const control = get(id);
    const n = control.valueAsNumber;
    return control.value !== "" && control.validity.valid && Number.isFinite(n) ? n : null;
  }

  for (const [id, key] of [["opacity", "opacity"], ["slice-z", "z"]]) {
    on(id, () => {
      const value = readNumber(id);
      if (value === null) return;
      lab().view[key] = value;
      renderSlices();
      drawScene();
    }, "input");
  }
  for (const [id, key] of [
    ["probe-r", "r"], ["theta", "theta"], ["phi", "phi"], ["shell-min", "a"], ["shell-max", "b"]
  ]) {
    on(id, () => {
      if (kind() === "map" && (key === "a" || key === "b")) return;
      const value = readNumber(id);
      if (value === null) return;
      const probe = lab().probe;
      probe[key] = key === "a" ? Math.min(value, probe.b) : key === "b" ? Math.max(value, probe.a) : value;
      renderScanner();
    }, "input");
  }

  function aim(theta) {
    Object.assign(lab().probe, { theta, phi: 0 });
    renderScanner();
  }
  on("probe-axial", () => aim(0));
  on("probe-equatorial", () => aim(90));

  function measure(count) {
    if (waiting("map")) return [];
    const state = current();
    const data = lab();
    const newPoints = Array.from({ length: count }, () => sample(state));
    data.samples.push(...newPoints);
    render();
    status(count === 1 ? "One independent detection at radius " + distance(newPoints[0].r) + "."
      : count + " independent detections added for " + stateLabel(state) + ". Total " + data.samples.length + ".");
    return newPoints;
  }
  on("one", () => measure(1));
  on("batch", () => measure(100));
  on("clear", () => {
    lab().samples = [];
    render();
    status("Position detections cleared.");
  });

  for (const id of ["initial", "final", "photon-mode"]) {
    on(id, () => {
      const value = input(id);
      if (id === "photon-mode" ? !["gap", "dipole"].includes(value) : !STATES.has(value)) return;
      lab()[id === "photon-mode" ? "photonMode" : id] = value;
      stopPulse();
      text("photon-status", "");
      renderPhoton();
      drawScene();
    }, "change");
  }

  on("demo", () => {
    const data = lab();
    const initial = STATES.get(data.initial);
    const final = STATES.get(data.final);
    const event = photon(initial, final);
    if (!event.allowed) return;

    if (event.gap < 0) {
      const key = initial.n + ":" + final.n;
      const old = data.lines.get(key);
      data.lines.set(key, {
        label: "n = " + initial.n + " → " + final.n,
        wavelength: event.wavelength,
        count: (old?.count ?? 0) + 1
      });
    }
    data.photonReport = (event.gap < 0 ? "Demonstrated emission" : "Demonstrated absorption")
      + " at " + number(event.wavelength) + " nm" + (event.wavelength < 400 ? " (UV)." : ".");
    text("photon-status", data.photonReport + " The position preparation and detections were preserved.");
    stopPulse();
    if (scene && !document.hidden) pulse = { event, start: browser.performance.now() };
    renderPhoton();
    drawScene();
  });
  on("spectrum-clear", () => {
    lab().lines.clear();
    lab().photonReport = EMPTY;
    stopPulse();
    renderPhoton();
    drawScene();
    text("photon-status", "Emission spectrum cleared.");
  });

  const missionFields = [
    "first-answer", "shell-point-answer", "shell-peak-answer", "shell-mean-answer", "node-r", "node-plane",
    "build-answer", "map-answer", "spectral-i", "spectral-f", "forbid-answer", "inside-answer", "same-answer"
  ];

  function loadMission(key) {
    if (key !== "free" && !Object.hasOwn(MISSIONS, key)) return;
    stopPulse();
    mission = null;
    if (key !== "free") {
      const work = laboratory();
      if (key === "node" || key === "same") {
        work.active = SECOND_S;
        work.compare = P;
      }
      if (key === "inside") {
        work.active = P;
        Object.assign(work.view, { mode: "cutaway", palette: "phase" });
      }
      if (key === "forbid") Object.assign(work, { initial: S, final: SECOND_S });
      mission = { key, lab: work, records: {}, revealed: false };
    }
    set("mission", key);
    text("mission-goal", mission ? MISSIONS[key][0] : "Free exploration is active.");
    text("mission-hint", mission ? MISSIONS[key][1] : "");
    for (const id of missionFields) set(id, "");
    for (const id of ["first-record", "node-result", "forbid-record", "photon-status"]) text(id, "");
    text("inside-log", "Record a slice below, on, and above the equatorial node.");
    text("spectral-clue", number(reference.wavelength, 2) + " nm");
    score("");
    status("");
    render();
  }

  on("mission-load", () => loadMission(input("mission")));
  on("mission-retry", () => { if (mission) loadMission(mission.key); });
  on("mission-exit", () => {
    loadMission("free");
    get("mission-load").focus();
  });

  for (const [id, key, theta] of [["first-axial", "+z", 0], ["first-equatorial", "+x", 90]]) {
    on(id, () => {
      if (kind() !== "first") return;
      lab().probe.r = 1;
      aim(theta);
      mission.records[key] = wave(current(), 1, Math.cos(rad(theta)), 0).density;
      text("first-record", Object.entries(mission.records)
        .map(([axis, p]) => axis + ": " + density(p, "³")).join(" · "));
    });
  }
  on("first-check", () => {
    if (kind() !== "first") return;
    const answer = input("first-answer");
    if (!answer || Object.keys(mission.records).length < 2) {
      score("Record both equal-radius probes and choose an explanation.");
      return;
    }
    score((answer === "symmetric" ? "Correct. " : "Compare the two readings at the same radius. ")
      + "The 1s angular factor is constant in every direction. The point density still decreases with distance.");
  });

  const near = (a, b, tolerance = .05) => Math.abs(a - b) <= tolerance + 1e-12;
  const filled = numbers => numbers.every(x => x !== null);

  on("shell-check", () => {
    if (kind() !== "shell") return;
    const answers = ["point", "peak", "mean"].map(key => readNumber("shell-" + key + "-answer"));
    if (!filled(answers)) {
      score("Enter all three distances in aH.");
      return;
    }
    const target = [0, current().radial.peak, current().radial.mean];
    mission.revealed = true;
    render();
    score((answers.every((a, i) => near(a, target[i])) ? "All three distances match. " : "Compare the three readouts. ")
      + "Point density peaks at the proton. The shell factor r² shifts the radial peak to "
      + distance(target[1]) + ". The mean is " + distance(target[2]) + " because it averages the entire distribution.");
  });

  on("node-check", () => {
    if (kind() !== "node") return;
    const guess = readNumber("node-r");
    const plane = input("node-plane");
    const node = current().radial.zeros[0];
    if (guess === null || !plane) {
      score("Enter the radius and choose an angular geometry.");
      return;
    }
    mission.revealed = true;
    const radialSigns = [-.25, .25].map(delta => Math.sign(current().radial.R(node + delta)));
    const angularSigns = [75, 105].map(theta => Math.sign(angularFactor(1, 0, Math.cos(rad(theta)))));
    const signs = xs => xs.map(x => x > 0 ? "+" : "−").join(" then ");
    render();
    text("node-result", "2s radial-factor sign at r/aH = 1.75 and 2.25: " + signs(radialSigns)
      + ". 2p angular-factor sign at θ = 75° and 105°, at fixed radius: " + signs(angularSigns) + ".");
    score((near(guess, node) && plane === "equator" ? "Both nodes identified. " : "Compare the two zero sets. ")
      + "The 2s radial node is a sphere at " + distance(node) + ". For 2p, m = 0, the angular factor vanishes across z = 0.");
  });

  on("build-check", () => {
    if (kind() !== "build") return;
    const answer = input("build-answer");
    if (!answer) {
      score("Choose which rule excludes the invalid tuple.");
      return;
    }
    score((lab().active === THIRD_D ? "The requested state is prepared. " : "The target is n = 3, ℓ = 2, m = −2. ")
      + (answer === "l" ? "Correct rule. " : "Check the allowed orbital index. ")
      + "At n = 2, only ℓ = 0 and ℓ = 1 are valid. An m of zero is valid for either of those choices.");
  });

  on("map-check", () => {
    if (!waiting("map")) return;
    const guess = readNumber("map-answer");
    if (guess === null) {
      score("Enter your percentage prediction before sampling.");
      return;
    }
    const p = interval(current().radial, 0, 1);
    mission.revealed = true;
    const found = measure(100).filter(point => point.r <= 1).length;
    score("Theory gives " + percent(p) + ", an absolute prediction error of "
      + number(Math.abs(guess - 100 * p)) + " percentage points. The fresh batch found " + found
      + " of 100 within one aH. Repeated batches fluctuate around the integrated shell probability.");
  });

  on("spectral-check", () => {
    if (kind() !== "spectral") return;
    const i = readNumber("spectral-i");
    const f = readNumber("spectral-f");
    if (!filled([i, f]) || i <= f) {
      score("For emission enter a higher initial n than final n.");
      return;
    }
    const wavelength = HC_EV_NM / (E(i) - E(f));
    score((i === 3 && f === 2 ? "Transition matched. " : "This proposed pair gives " + number(wavelength) + " nm. ")
      + "The clue at " + number(reference.wavelength) + " nm matches n = 3 to n = 2. The gap fixes those principal levels under the stated constraints. Resolving ℓ or m requires additional information.");
  });

  for (const [id, key] of [["forbid-s", SECOND_S], ["forbid-p", P]]) {
    on(id, () => {
      if (kind() !== "forbid") return;
      Object.assign(lab(), { initial: S, final: key, photonMode: "dipole" });
      const event = photon(STATES.get(S), STATES.get(key));
      mission.records[key] = (key === P ? "1s → 2p" : "1s → 2s") + ": "
        + number(event.energy, 4) + " eV, Δℓ = " + event.dl;
      stopPulse();
      render();
      text("photon-status", "");
      text("forbid-record", Object.values(mission.records).join(" · "));
    });
  }
  on("forbid-check", () => {
    if (kind() !== "forbid") return;
    const answer = input("forbid-answer");
    if (!answer || Object.keys(mission.records).length < 2) {
      score("Inspect both candidates and choose an allowed channel.");
      return;
    }
    score((answer === "p" ? "Correct. " : "Compare the orbital-index changes. ")
      + "Both gaps match. Only 1s → 2p, m = 0 passes the stated electric-dipole check. The 1s → 2s result concerns this single-photon model. Other processes are outside its scope.");
  });

  on("inside-record", () => {
    if (kind() !== "inside") return;
    const z = lab().view.z;
    const point = positionValue(current(), 0, 0, z);
    const key = z === 0 ? "Node" : z < 0 ? "Below" : "Above";
    mission.records[key] = key + " (z = " + number(z) + "): "
      + (point.phase === null ? "phase undefined" : "phase " + number(phaseDegrees(point.phase), 0) + "°");
    text("inside-log", ["Below", "Node", "Above"].filter(name => Object.hasOwn(mission.records, name))
      .map(name => mission.records[name]).join(" · "));
  });
  on("inside-check", () => {
    if (kind() !== "inside") return;
    const answer = input("inside-answer");
    if (!answer || Object.keys(mission.records).length < 3) {
      score("Record all three slice positions, then choose an amplitude relation.");
      return;
    }
    score((answer === "opposite" ? "Correct. " : "Compare the two phases. ")
      + "For m = 0 the 2p angular factor is proportional to z/r. It changes sign across the equator. Above and below differ by π in phase, and phase is undefined on the nodal plane.");
  });

  on("same-check", () => {
    if (kind() !== "same") return;
    const answer = input("same-answer");
    if (!answer) {
      score("Choose an observable that separates the two states.");
      return;
    }
    const s = current();
    const p = STATES.get(lab().compare);
    score((answer === "shape" ? "Correct. " : "Compare shape and energy as separate readouts. ")
      + "Both energies are " + number(E(s.n), 4) + " eV. The mean radii are " + distance(s.radial.mean)
      + " and " + distance(p.radial.mean) + ". The 2s radial node and 2p equatorial node distinguish their position distributions.");
  });

  on("opening", event => {
    event.preventDefault();
    const answer = input("opening-answer");
    if (!answer) return;
    text("opening-feedback", (answer === "radial" ? "Correct. " : "Compare the two curves at the origin. ")
      + "Distances follow the radial distribution because each bin includes a whole spherical shell. Measure 100 and compare the observed bins with the theory overlay.");
  }, "submit");

  on("enter", () => {
    boarded = true;
    inside = false;
    hide("explorer", false);
    hide("enter", true);
    attribute("enter", "aria-expanded", "true");
    get("explorer-title").focus();
    void syncGraphics();
  });
  on("inside", () => {
    inside = !inside;
    void syncGraphics();
  });
  on("return", () => {
    boarded = false;
    releaseGraphics();
    hide("explorer", true);
    hide("enter", false);
    attribute("enter", "aria-expanded", "false");
    get("enter").focus();
  });
  on("camera-reset", () => {
    inside = false;
    set("orbit", 0);
    set("tilt", 20);
    void syncGraphics();
  });
  for (const id of ["orbit", "tilt"]) on(id, () => { void syncGraphics(); }, "input");
  const adjustEffects = () => {
    renderSlices();
    void syncGraphics();
  };
  on("effects", adjustEffects, "change");
  motion.addEventListener("change", adjustEffects);
  on("world", event => {
    event.preventDefault();
    failed = true;
    releaseGraphics();
    text("renderer", "The graphics context was interrupted. The calibrated slices remain active.");
  }, "webglcontextlost");
  on("world", () => {
    failed = false;
    void syncGraphics();
  }, "webglcontextrestored");
  if (browser.ResizeObserver) new browser.ResizeObserver(drawScene).observe(get("viewport"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPulse();
    else if (boarded) void syncGraphics();
  });
  browser.addEventListener("pagehide", releaseGraphics);
  browser.addEventListener("pageshow", () => { if (boarded) void syncGraphics(); });

  const symbols = [...root.querySelectorAll("details[data-ha-symbol]")];
  for (const detail of symbols) {
    detail.addEventListener("toggle", () => {
      const active = detail.open ? detail : symbols.filter(item => item.open).at(-1);
      if (active) root.dataset.haSymbol = active.dataset.haSymbol;
      else delete root.dataset.haSymbol;
    });
  }

  options("compare", [["none", "No comparison"], ...stateOptions], "none");
  options("initial", stateOptions, P);
  options("final", stateOptions, S);
  set("orbit", 0);
  set("tilt", 20);
  set("mission", "free");
  get("opening").reset();
  render();
  for (const key of ["state", "view", "probe", "opening", "measure", "photon", "camera", "mission"]) {
    disable(key + "-controls", false);
  }
  disable("enter", false);
  hide("static-note", true);
}

const lesson = document.querySelector(".site-main.hydrogen-lesson");
if (lesson) initialize(lesson);