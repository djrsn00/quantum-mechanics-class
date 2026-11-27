(() => {
  "use strict";

  const display = document.getElementById("particle-display");
  const still = document.getElementById("particle-static");
  const canvas = document.getElementById("particle-canvas");

  if (!display || !still || !canvas) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const { width: sceneWidth, height: sceneHeight } = still.viewBox.baseVal;
  const collision = { x: 218, y: 54 };
  const segments = 48;
  const scatterLength = 1280;

  // Sample the SVG tracks once so the animated and static scenes match.
  const tracks = Array.from(still.querySelectorAll(".particle-tracks path"), path => {
    const length = path.getTotalLength();

    return {
      color: window.getComputedStyle(path).stroke,
      points: Array.from({ length: segments + 1 }, (_, index) => {
        const { x, y } = path.getPointAtLength(length * index / segments);
        return { x, y };
      })
    };
  });

  const incomingTracks = tracks.slice(0, 2);
  const outgoingTracks = tracks.slice(2);

  let frameId = null;
  let idleTimer = null;
  let cycleStart = null;
  let approachLength = 0;
  let outgoingDurations = [];

  function resizeCanvas() {
    const bounds = display.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));

    if (canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;

    if (idleTimer !== null) drawGuide();
  }

  function drawGuide() {
    context.setTransform(
      canvas.width / sceneWidth, 0,
      0, canvas.height / sceneHeight,
      0, 0
    );
    context.clearRect(0, 0, sceneWidth, sceneHeight);

    context.save();
    context.strokeStyle = "rgba(87, 164, 117, 0.28)";
    context.lineWidth = 1;
    context.setLineDash([2, 7]);
    context.beginPath();
    context.moveTo(12, collision.y);
    context.lineTo(sceneWidth - 12, collision.y);
    context.stroke();
    context.restore();
  }

  function pointAlong(track, progress) {
    const sample = progress * segments;
    const index = Math.min(Math.floor(sample), segments - 1);
    const fraction = sample - index;
    const from = track.points[index];
    const to = track.points[index + 1];

    return {
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction
    };
  }

  function drawTrail(track, progress, trailLength, opacity) {
    const start = Math.max(0, progress - trailLength);
    const end = Math.min(1, progress);

    if (start >= end || opacity <= 0) return;

    const tail = pointAlong(track, start);
    const head = pointAlong(track, end);
    const gradient = context.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(1, track.color);

    context.save();
    context.globalAlpha = Math.min(1, opacity);
    context.strokeStyle = gradient;
    context.lineWidth = 1.6;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(tail.x, tail.y);

    for (let index = Math.floor(start * segments) + 1; index < end * segments; index += 1) {
      const point = track.points[index];
      context.lineTo(point.x, point.y);
    }

    context.lineTo(head.x, head.y);
    context.stroke();

    if (progress < 1) {
      context.fillStyle = track.color;
      context.beginPath();
      context.arc(head.x, head.y, 1.7, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  function drawCollision(age) {
    const progress = age / 430;
    if (progress >= 1) return;

    context.save();
    context.strokeStyle = "#78f8a6";
    context.lineWidth = 1;
    context.globalAlpha = (1 - progress) * 0.55;
    context.beginPath();
    context.arc(collision.x, collision.y, 4 + progress * 19, 0, Math.PI * 2);
    context.stroke();

    context.globalAlpha = (1 - progress) ** 2;
    context.fillStyle = "#f2fff5";
    context.beginPath();
    context.arc(collision.x, collision.y, 2.8 - progress * 1.6, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function beginCycle() {
    idleTimer = null;
    cycleStart = null;
    approachLength = 850 + Math.random() * 300;
    outgoingDurations = outgoingTracks.map(() => 650 + Math.random() * 290);
    frameId = window.requestAnimationFrame(drawFrame);
  }

  function drawFrame(now) {
    frameId = null;
    if (cycleStart === null) cycleStart = now;

    const elapsed = now - cycleStart;
    const age = elapsed - approachLength;

    drawGuide();

    if (age < 0) {
      const progress = elapsed / approachLength;

      for (const track of incomingTracks) {
        drawTrail(track, progress, 0.34, Math.min(1, progress * 7));
      }
    } else if (age < scatterLength) {
      const incomingOpacity = Math.max(0, 1 - age / 190);

      for (const track of incomingTracks) {
        drawTrail(track, 1, 0.34, incomingOpacity);
      }

      outgoingTracks.forEach((track, index) => {
        const progress = age / outgoingDurations[index];
        const opacity = 1 - Math.max(0, progress - 0.65) / 0.65;
        drawTrail(track, progress, 0.3, opacity);
      });

      drawCollision(age);
    }

    if (display.dataset.motion !== "active") {
      display.dataset.motion = "active";
    }

    if (age < scatterLength) {
      frameId = window.requestAnimationFrame(drawFrame);
    } else {
      idleTimer = window.setTimeout(beginCycle, 700 + Math.random() * 1100);
    }
  }

  function syncPlayback() {
    if (reducedMotion.matches || document.hidden) {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(idleTimer);
      frameId = null;
      idleTimer = null;
      delete display.dataset.motion;
      return;
    }

    if (frameId === null && idleTimer === null) {
      resizeCanvas();
      beginCycle();
    }
  }

  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(display);
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("visibilitychange", syncPlayback);
  reducedMotion.addEventListener("change", syncPlayback);

  syncPlayback();
})();

