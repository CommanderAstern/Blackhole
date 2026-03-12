(() => {
const lab = window.singularityLab;

if (!lab) {
  throw new Error("Singularity Lab core state is unavailable.");
}

const sceneCanvas = lab.canvas;
const objectCanvas = document.querySelector("#objectLayer");
const overlay = objectCanvas.getContext("2d");
const bodyCountBadge = document.querySelector("#bodyCountBadge");
const launchModeButton = document.querySelector("#launchModeButton");
const clearBodiesButton = document.querySelector("#clearBodiesButton");
const burstButton = document.querySelector("#burstButton");
const throwableButtons = Array.from(document.querySelectorAll("[data-throwable]"));
const gravityInputs = new Map(
  ["throwPower", "orbitAssist"].map((key) => [key, document.querySelector(`[data-control="${key}"]`)]),
);
const gravityOutputs = new Map(
  ["throwPower", "orbitAssist"].map((key) => [key, document.querySelector(`[data-output="${key}"]`)]),
);
const THROW_POWER_MIN = 2;
const THROW_POWER_MAX = 5;
const ORBIT_ASSIST_OFFSET = 1;
const ORBIT_ASSIST_DISPLAY_MIN = 0;
const ORBIT_ASSIST_DISPLAY_MAX = 0.6;
const ORBIT_ASSIST_DEFAULT_DISPLAY = 0.58;

const THROWABLES = {
  rock: {
    label: "Rock",
    rgb: [255, 178, 108],
    glow: "rgba(255, 178, 108, 0.45)",
    screenSize: 6.5,
    trailLength: 18,
    agility: 0.62,
    speedScale: 0.94,
  },
  probe: {
    label: "Probe",
    rgb: [126, 220, 255],
    glow: "rgba(126, 220, 255, 0.46)",
    screenSize: 5.2,
    trailLength: 24,
    agility: 1.0,
    speedScale: 1.12,
  },
  comet: {
    label: "Comet",
    rgb: [216, 244, 255],
    glow: "rgba(216, 244, 255, 0.62)",
    screenSize: 7.8,
    trailLength: 32,
    agility: 1.24,
    speedScale: 1.28,
  },
};

const simulation = {
  bodies: [],
  captured: 0,
  escaped: 0,
  nextId: 1,
};

const launchDrag = {
  active: false,
  pointerId: null,
  start: { x: 0, y: 0 },
  current: { x: 0, y: 0 },
};

let selectedThrowable = "rock";
let lastFrame = performance.now();

lab.state.throwPower = normalizeThrowPower(lab.state.throwPower);
lab.state.orbitAssist = normalizeOrbitAssist(lab.state.orbitAssist);
if (typeof lab.state.launchMode !== "boolean") {
  lab.state.launchMode = true;
}

configureOverlayContext();
resizeOverlayCanvas();

bindGravityControls();
syncGravityUI();
requestAnimationFrame(gravityFrame);

window.addEventListener("resize", resizeOverlayCanvas);

function configureOverlayContext() {
  overlay.lineCap = "round";
  overlay.lineJoin = "round";
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeThrowPower(value) {
  const nextValue = typeof value === "number" && Number.isFinite(value) ? value : THROW_POWER_MAX;
  return clampValue(nextValue, THROW_POWER_MIN, THROW_POWER_MAX);
}

function orbitAssistDisplayToState(value) {
  return clampValue(
    value + ORBIT_ASSIST_OFFSET,
    ORBIT_ASSIST_OFFSET + ORBIT_ASSIST_DISPLAY_MIN,
    ORBIT_ASSIST_OFFSET + ORBIT_ASSIST_DISPLAY_MAX,
  );
}

function orbitAssistStateToDisplay(value) {
  return clampValue(value - ORBIT_ASSIST_OFFSET, ORBIT_ASSIST_DISPLAY_MIN, ORBIT_ASSIST_DISPLAY_MAX);
}

function normalizeOrbitAssist(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return orbitAssistDisplayToState(ORBIT_ASSIST_DEFAULT_DISPLAY);
  }

  if (value < ORBIT_ASSIST_OFFSET) {
    return orbitAssistDisplayToState(value);
  }

  return clampValue(
    value,
    ORBIT_ASSIST_OFFSET + ORBIT_ASSIST_DISPLAY_MIN,
    ORBIT_ASSIST_OFFSET + ORBIT_ASSIST_DISPLAY_MAX,
  );
}

function resizeOverlayCanvas() {
  objectCanvas.width = lab.resolution.width;
  objectCanvas.height = lab.resolution.height;
  configureOverlayContext();
}

function bindGravityControls() {
  gravityInputs.forEach((input, key) => {
    if (!input) {
      return;
    }

    input.addEventListener("input", () => {
      const nextValue = Number(input.value);
      lab.state[key] = key === "orbitAssist"
        ? orbitAssistDisplayToState(nextValue)
        : normalizeThrowPower(nextValue);
      syncGravityUI();
    });
  });

  throwableButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedThrowable = button.dataset.throwable;
      syncGravityUI();
    });
  });

  launchModeButton.addEventListener("click", () => {
    lab.state.launchMode = !lab.state.launchMode;
    syncGravityUI();
  });

  clearBodiesButton.addEventListener("click", () => {
    simulation.bodies = [];
    simulation.captured = 0;
    simulation.escaped = 0;
    syncGravityUI();
  });

  burstButton.addEventListener("click", () => {
    spawnRingBurst();
    syncGravityUI();
  });

  sceneCanvas.addEventListener("pointerdown", handlePointerDown, true);
  sceneCanvas.addEventListener("pointermove", handlePointerMove, true);
  sceneCanvas.addEventListener("pointerup", handlePointerUp, true);
  sceneCanvas.addEventListener("pointercancel", handlePointerCancel, true);

  document.querySelectorAll("[data-toggle]").forEach((input) => {
    input.addEventListener("change", () => updateGravityStatus());
  });

  document.querySelectorAll("[data-control]").forEach((input) => {
    if (gravityInputs.has(input.dataset.control)) {
      return;
    }

    input.addEventListener("input", () => updateGravityStatus());
  });

  document.querySelector("#randomizeButton").addEventListener("click", () => {
    selectedThrowable = ["rock", "probe", "comet"][Math.floor(Math.random() * 3)];
    lab.state.launchMode = true;
    syncGravityUI();
  });

  document.querySelector("#resetButton").addEventListener("click", () => {
    simulation.bodies = [];
    simulation.captured = 0;
    simulation.escaped = 0;
    selectedThrowable = "rock";
    lab.state.throwPower = THROW_POWER_MAX;
    lab.state.orbitAssist = orbitAssistDisplayToState(ORBIT_ASSIST_DEFAULT_DISPLAY);
    lab.state.launchMode = true;
    syncGravityUI();
  });

  document.querySelector("#cinematicButton").addEventListener("click", () => {
    selectedThrowable = "comet";
    lab.state.throwPower = THROW_POWER_MAX;
    lab.state.orbitAssist = orbitAssistDisplayToState(ORBIT_ASSIST_DISPLAY_MAX);
    lab.state.launchMode = true;
    syncGravityUI();
  });
}

function syncGravityUI() {
  gravityInputs.forEach((input, key) => {
    if (input) {
      input.value = String(key === "orbitAssist" ? orbitAssistStateToDisplay(lab.state[key]) : lab.state[key]);
    }

    const output = gravityOutputs.get(key);
    if (output) {
      const displayValue = key === "orbitAssist" ? orbitAssistStateToDisplay(lab.state[key]) : lab.state[key];
      output.textContent = lab.formatValue(key, displayValue);
    }
  });

  throwableButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.throwable === selectedThrowable);
  });

  launchModeButton.textContent = lab.state.launchMode ? "Throw Mode On" : "Throw Mode Off";
  launchModeButton.classList.toggle("button--active", lab.state.launchMode);
  document.body.classList.toggle("launch-mode", lab.state.launchMode);

  updateBodyBadge();
  updateGravityStatus();
}
function updateBodyBadge() {
  const current = simulation.bodies.length;
  let label = `${current} bodies`;

  if (simulation.captured > 0) {
    label += ` • ${simulation.captured} swallowed`;
  } else if (simulation.escaped > 0) {
    label += ` • ${simulation.escaped} escaped`;
  }

  bodyCountBadge.textContent = label;
}

function updateGravityStatus() {
  const throwable = THROWABLES[selectedThrowable].label.toLowerCase();
  const message = lab.state.launchMode
    ? `Throw mode is live for ${throwable} launches. Drag in the scene to sling bodies around the singularity.`
    : "Orbit mode is live. Toggle Throw Mode to hurl objects through the gravity well.";

  lab.statusLine.textContent = message;
}

function handlePointerDown(event) {
  if (!lab.state.launchMode || event.button === 2) {
    return;
  }

  launchDrag.active = true;
  launchDrag.pointerId = event.pointerId;
  launchDrag.start.x = event.clientX;
  launchDrag.start.y = event.clientY;
  launchDrag.current.x = event.clientX;
  launchDrag.current.y = event.clientY;
  lab.interaction.launchDragging = true;
  sceneCanvas.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopImmediatePropagation();
}

function handlePointerMove(event) {
  if (!launchDrag.active || event.pointerId !== launchDrag.pointerId) {
    return;
  }

  launchDrag.current.x = event.clientX;
  launchDrag.current.y = event.clientY;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function handlePointerUp(event) {
  if (!launchDrag.active || event.pointerId !== launchDrag.pointerId) {
    return;
  }

  launchDrag.current.x = event.clientX;
  launchDrag.current.y = event.clientY;

  const cameraPos = lab.getCameraPosition(lab.state.zoom, lab.camera.yaw, lab.camera.pitch);
  const cameraBasis = lab.getCameraBasis(cameraPos);
  const spawnPosition = screenToLaunchPoint(launchDrag.start.x, launchDrag.start.y, cameraPos, cameraBasis);
  const velocity = getLaunchVelocity(
    spawnPosition,
    launchDrag.current.x - launchDrag.start.x,
    launchDrag.current.y - launchDrag.start.y,
    cameraBasis,
  );

  spawnThrowable(selectedThrowable, spawnPosition, velocity);
  launchDrag.active = false;
  launchDrag.pointerId = null;
  lab.interaction.launchDragging = false;
  updateBodyBadge();

  if (sceneCanvas.hasPointerCapture(event.pointerId)) {
    sceneCanvas.releasePointerCapture(event.pointerId);
  }

  event.preventDefault();
  event.stopImmediatePropagation();
}

function handlePointerCancel(event) {
  if (!launchDrag.active || event.pointerId !== launchDrag.pointerId) {
    return;
  }

  launchDrag.active = false;
  launchDrag.pointerId = null;
  lab.interaction.launchDragging = false;
  if (sceneCanvas.hasPointerCapture(event.pointerId)) {
    sceneCanvas.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

function gravityFrame(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  simulateBodies(delta);
  renderBodies();
  requestAnimationFrame(gravityFrame);
}

function simulateBodies(delta) {
  const scaledDelta = delta * lab.state.timeScale;
  if (scaledDelta <= 0 || simulation.bodies.length === 0) {
    return;
  }

  const iterations = Math.max(1, Math.min(4, Math.ceil(scaledDelta / 0.012)));
  const step = scaledDelta / iterations;
  const swallowRadius = getEventHorizonRadius() * 1.02;
  const escapeRadius = 42 + lab.state.zoom * 3.0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let index = simulation.bodies.length - 1; index >= 0; index -= 1) {
      const body = simulation.bodies[index];
      const radius = lengthOf(body.position);

      if (radius <= swallowRadius) {
        simulation.bodies.splice(index, 1);
        simulation.captured += 1;
        continue;
      }

      if (radius >= escapeRadius) {
        simulation.bodies.splice(index, 1);
        simulation.escaped += 1;
        continue;
      }

      advanceBody(body, step);
      body.age += step;
      body.heat = clamp(1.0 - (radius - getEventHorizonRadius()) / (getEventHorizonRadius() * 6.0), 0.0, 1.0);
      body.trail.push(body.position.slice());

      if (body.trail.length > body.trailLength) {
        body.trail.shift();
      }
    }
  }
}

function advanceBody(body, step) {
  const acceleration = getGravityAcceleration(body.position, body.velocity, body.agility);
  body.velocity = add(body.velocity, scale(acceleration, step));

  const damping = getAccretionDrag(body.position, body.agility);
  if (damping > 0) {
    body.velocity = scale(body.velocity, Math.max(0, 1 - damping * step));
  }

  body.position = add(body.position, scale(body.velocity, step));
}

function getGravityAcceleration(position, velocity, agility) {
  const radius = Math.max(lengthOf(position), 0.0001);
  const radial = scale(position, 1 / radius);
  const orbitSpeed = getLocalOrbitSpeed(position);
  const effectiveRadius = getEffectiveGravityRadius(radius);
  let acceleration = scale(radial, -getLocalGravityStrength(position));

  let tangent = cross([0, 1, 0], radial);
  if (lengthOf(tangent) < 0.0001) {
    tangent = cross([1, 0, 0], radial);
  }

  tangent = normalize(tangent);

  const tangentialVelocity = dot(velocity, tangent);
  const corotationTarget = orbitSpeed * (0.14 + lab.state.spin * 0.34);
  const frameDragStrength = lab.state.spin * (0.5 + agility * 0.25) / (effectiveRadius + 1.45);
  acceleration = add(
    acceleration,
    scale(tangent, (corotationTarget - tangentialVelocity) * frameDragStrength),
  );

  const diskOuter = getDiskOuterRadius() * 1.18;
  if (radius < diskOuter) {
    const diskBlend = clamp(1 - radius / diskOuter, 0, 1);
    const verticalSettling = (0.14 + (1 - agility) * 0.1) * (0.4 + diskBlend * 0.9) / (effectiveRadius + 1.2);
    acceleration = add(acceleration, [0, -position[1] * verticalSettling, 0]);
  }

  return acceleration;
}
function renderBodies() {
  const cameraPos = lab.getCameraPosition(lab.state.zoom, lab.camera.yaw, lab.camera.pitch);
  const cameraBasis = lab.getCameraBasis(cameraPos);
  const cameraDistance = lengthOf(cameraPos);
  const shadowPixels = getShadowAngularRadius(cameraPos) * 1.7 * lab.resolution.height * 0.5;
  const occlusion = createOcclusionState(cameraPos, cameraDistance, shadowPixels);

  overlay.setTransform(1, 0, 0, 1, 0, 0);
  overlay.clearRect(0, 0, lab.resolution.width, lab.resolution.height);

  const projectedBodies = [];
  for (const body of simulation.bodies) {
    const projection = projectWorld(body.position, cameraPos, cameraBasis);
    if (projection) {
      projectedBodies.push({ body, projection });
    }
  }

  projectedBodies.sort((a, b) => b.projection.viewZ - a.projection.viewZ);

  for (const entry of projectedBodies) {
    drawTrail(entry.body, cameraPos, cameraBasis, occlusion);
  }

  for (const entry of projectedBodies) {
    drawBody(entry.body, entry.projection, occlusion);
  }

  if (launchDrag.active && lab.state.launchMode) {
    drawLaunchPreview(cameraPos, cameraBasis, occlusion);
  }
}

function createOcclusionState(cameraPos, cameraDistance, shadowPixels) {
  const raytraceQuality = lab.state.raytrace ? 1 : 0;

  return {
    cameraPos,
    cameraDistance,
    shadowPixels,
    diskInner: getDiskInnerRadius() - 0.2,
    diskOuter: getDiskOuterRadius() + 0.55,
    diskPlanes: [
      normalize([0, 1, 0.16 + 0.14 * raytraceQuality]),
      normalize([0, 1, 0.03]),
      normalize([0, 1, -0.34 - 0.16 * raytraceQuality]),
    ],
  };
}

function createProjectedPath(points, cameraPos, cameraBasis, occlusion, includeOccluded = true) {
  const path = new Path2D();
  let startedSegment = false;
  let visibleSegments = 0;
  let lastScale = 0;

  for (const point of points) {
    const projection = projectWorld(point, cameraPos, cameraBasis);
    if (!projection) {
      startedSegment = false;
      continue;
    }

    if (!includeOccluded && isOccludedByScene(point, projection, occlusion)) {
      startedSegment = false;
      continue;
    }

    if (!startedSegment) {
      path.moveTo(projection.x, projection.y);
      startedSegment = true;
      lastScale = projection.scale;
      continue;
    }

    path.lineTo(projection.x, projection.y);
    visibleSegments += 1;
    lastScale = projection.scale;
  }

  return { path, visibleSegments, lastScale };
}

function drawTrail(body, cameraPos, cameraBasis, occlusion) {
  const xrayPath = createProjectedPath(body.trail, cameraPos, cameraBasis, occlusion, true);
  const visiblePath = createProjectedPath(body.trail, cameraPos, cameraBasis, occlusion, false);
  const pathScale = visiblePath.lastScale || xrayPath.lastScale;

  if (xrayPath.visibleSegments === 0 || pathScale === 0) {
    return;
  }

  const trailOuterWidth = Math.max(2.1, body.screenSize * pathScale * 0.68);
  const trailCoreWidth = Math.max(1.1, body.screenSize * pathScale * 0.34);
  const trailHighlightRgb = mixRgb(body.rgb, [255, 255, 255], 0.56);

  overlay.strokeStyle = rgbToRgba([8, 12, 20], 0.14 + body.heat * 0.05);
  overlay.lineWidth = trailOuterWidth * 1.08;
  overlay.stroke(xrayPath.path);

  overlay.shadowColor = body.glow;
  overlay.shadowBlur = trailOuterWidth * 0.85;
  overlay.strokeStyle = rgbToRgba(body.rgb, 0.12 + body.heat * 0.12);
  overlay.lineWidth = trailOuterWidth * 0.6;
  overlay.stroke(xrayPath.path);
  overlay.shadowBlur = 0;

  if (visiblePath.visibleSegments === 0) {
    return;
  }

  overlay.strokeStyle = rgbToRgba([8, 12, 20], 0.18 + body.heat * 0.08);
  overlay.lineWidth = trailOuterWidth;
  overlay.stroke(visiblePath.path);

  overlay.shadowColor = body.glow;
  overlay.shadowBlur = trailOuterWidth * (1.1 + body.heat * 0.7);
  overlay.strokeStyle = rgbToRgba(body.rgb, 0.26 + body.heat * 0.26);
  overlay.lineWidth = trailOuterWidth * 0.72;
  overlay.stroke(visiblePath.path);
  overlay.shadowBlur = 0;

  overlay.strokeStyle = rgbToRgba(trailHighlightRgb, 0.22 + body.heat * 0.14);
  overlay.lineWidth = trailCoreWidth;
  overlay.stroke(visiblePath.path);
}

function drawBody(body, projection, occlusion) {
  const occluded = isOccludedByScene(body.position, projection, occlusion);
  const visibility = occluded ? 0.42 : 1;

  const radius = Math.max(2.5, body.screenSize * projection.scale);
  const atmosphereRadius = radius * (2.15 + body.heat * 0.35);
  const rimRgb = mixRgb(body.rgb, [255, 255, 255], 0.34);
  const coreRgb = mixRgb(body.rgb, [255, 255, 255], 0.2 + body.heat * 0.12);
  const highlightRgb = mixRgb(body.rgb, [255, 255, 255], 0.78);
  const atmosphere = overlay.createRadialGradient(
    projection.x,
    projection.y,
    radius * 0.2,
    projection.x,
    projection.y,
    atmosphereRadius,
  );

  atmosphere.addColorStop(0, rgbToRgba(body.rgb, (0.24 + body.heat * 0.12) * visibility));
  atmosphere.addColorStop(0.42, rgbToRgba(body.rgb, (0.09 + body.heat * 0.05) * visibility));
  atmosphere.addColorStop(1, rgbToRgba(body.rgb, 0));

  overlay.beginPath();
  overlay.fillStyle = atmosphere;
  overlay.arc(projection.x, projection.y, atmosphereRadius, 0, Math.PI * 2);
  overlay.fill();

  overlay.beginPath();
  overlay.fillStyle = rgbToRgba([7, 11, 18], (0.12 + body.heat * 0.05) * visibility);
  overlay.arc(projection.x, projection.y, radius * 1.28, 0, Math.PI * 2);
  overlay.fill();

  overlay.beginPath();
  overlay.strokeStyle = rgbToRgba(rimRgb, (0.3 + body.heat * 0.16) * visibility);
  overlay.lineWidth = Math.max(1.25, radius * 0.34);
  overlay.arc(projection.x, projection.y, radius * 1.1, 0, Math.PI * 2);
  overlay.stroke();

  overlay.beginPath();
  overlay.fillStyle = rgbToRgba(coreRgb, 0.98 * visibility);
  overlay.shadowColor = body.glow;
  overlay.shadowBlur = radius * (occluded ? 2.4 : 3.8 + body.heat * 2.3);
  overlay.arc(projection.x, projection.y, radius * 0.92, 0, Math.PI * 2);
  overlay.fill();
  overlay.shadowBlur = 0;

  overlay.beginPath();
  overlay.strokeStyle = rgbToRgba([8, 12, 20], 0.26 * visibility);
  overlay.lineWidth = Math.max(0.9, radius * 0.12);
  overlay.arc(projection.x, projection.y, radius * 0.96, 0, Math.PI * 2);
  overlay.stroke();

  overlay.beginPath();
  overlay.fillStyle = rgbToRgba(highlightRgb, (0.3 + body.heat * 0.18) * visibility);
  overlay.arc(projection.x - radius * 0.16, projection.y - radius * 0.2, radius * 0.44, 0, Math.PI * 2);
  overlay.fill();

  overlay.beginPath();
  overlay.fillStyle = rgbToRgba([255, 255, 255], (0.22 + body.heat * 0.12) * visibility);
  overlay.arc(projection.x - radius * 0.24, projection.y - radius * 0.28, radius * 0.18, 0, Math.PI * 2);
  overlay.fill();
}

function drawLaunchPreview(cameraPos, cameraBasis, occlusion) {
  const spawnPosition = screenToLaunchPoint(launchDrag.start.x, launchDrag.start.y, cameraPos, cameraBasis);
  const velocity = getLaunchVelocity(
    spawnPosition,
    launchDrag.current.x - launchDrag.start.x,
    launchDrag.current.y - launchDrag.start.y,
    cameraBasis,
  );
  const spawnProjection = projectWorld(spawnPosition, cameraPos, cameraBasis);
  const trajectory = predictTrajectory(spawnPosition, velocity, 42);
  const xrayTrajectory = createProjectedPath(trajectory, cameraPos, cameraBasis, occlusion, true);
  const visibleTrajectory = createProjectedPath(trajectory, cameraPos, cameraBasis, occlusion, false);

  overlay.beginPath();
  overlay.strokeStyle = rgbToRgba([8, 12, 20], 0.36);
  overlay.lineWidth = 3 * lab.resolution.dpr;
  overlay.moveTo(launchDrag.start.x * lab.resolution.dpr, launchDrag.start.y * lab.resolution.dpr);
  overlay.lineTo(launchDrag.current.x * lab.resolution.dpr, launchDrag.current.y * lab.resolution.dpr);
  overlay.stroke();

  overlay.beginPath();
  overlay.strokeStyle = rgbToRgba(THROWABLES[selectedThrowable].rgb, 0.84);
  overlay.lineWidth = 1.4 * lab.resolution.dpr;
  overlay.moveTo(launchDrag.start.x * lab.resolution.dpr, launchDrag.start.y * lab.resolution.dpr);
  overlay.lineTo(launchDrag.current.x * lab.resolution.dpr, launchDrag.current.y * lab.resolution.dpr);
  overlay.stroke();

  if (spawnProjection) {
    const spawnOccluded = isOccludedByScene(spawnPosition, spawnProjection, occlusion);
    overlay.beginPath();
    overlay.fillStyle = rgbToRgba(THROWABLES[selectedThrowable].rgb, spawnOccluded ? 0.48 : 0.96);
    overlay.shadowColor = THROWABLES[selectedThrowable].glow;
    overlay.shadowBlur = (spawnOccluded ? 10 : 18) * lab.resolution.dpr;
    overlay.arc(spawnProjection.x, spawnProjection.y, 5 * lab.resolution.dpr, 0, Math.PI * 2);
    overlay.fill();
    overlay.shadowBlur = 0;
  }

  overlay.setLineDash([7 * lab.resolution.dpr, 8 * lab.resolution.dpr]);

  if (xrayTrajectory.visibleSegments < 1) {
    overlay.setLineDash([]);
    return;
  }

  overlay.strokeStyle = rgbToRgba([8, 12, 20], 0.2);
  overlay.lineWidth = 3.2 * lab.resolution.dpr;
  overlay.stroke(xrayTrajectory.path);

  overlay.strokeStyle = rgbToRgba(THROWABLES[selectedThrowable].rgb, 0.22);
  overlay.lineWidth = 1.5 * lab.resolution.dpr;
  overlay.stroke(xrayTrajectory.path);

  if (visibleTrajectory.visibleSegments > 0) {
    overlay.strokeStyle = rgbToRgba(THROWABLES[selectedThrowable].rgb, 0.58);
    overlay.lineWidth = 1.35 * lab.resolution.dpr;
    overlay.stroke(visibleTrajectory.path);
  }

  overlay.setLineDash([]);
}

function predictTrajectory(spawnPosition, initialVelocity, steps) {
  const points = [];
  const body = {
    position: spawnPosition.slice(),
    velocity: initialVelocity.slice(),
    agility: 1.0,
  };
  const dt = 0.045;

  for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
    advanceBody(body, dt);
    points.push(body.position.slice());

    if (lengthOf(body.position) < getEventHorizonRadius() * 1.05) {
      break;
    }
  }

  return points;
}

function projectWorld(position, cameraPos, cameraBasis) {
  const relative = subtract(position, cameraPos);
  const viewX = dot(relative, cameraBasis.right);
  const viewY = dot(relative, cameraBasis.up);
  const viewZ = dot(relative, cameraBasis.forward);

  if (viewZ <= 0.08) {
    return null;
  }

  const aspect = lab.resolution.width / lab.resolution.height;
  const projectedX = 1.7 * viewX / viewZ;
  const projectedY = 1.7 * viewY / viewZ;

  return {
    x: ((projectedX / aspect) * 0.5 + 0.5) * lab.resolution.width,
    y: (0.5 - projectedY * 0.5) * lab.resolution.height,
    viewZ,
    scale: clamp((1.7 / viewZ) * lab.resolution.height * 0.11, 0.12, 2.4),
  };
}

function isOccludedByScene(position, projection, occlusion) {
  return isHiddenBehindHole(projection, occlusion) || isOccludedByDisk(position, occlusion);
}

function isHiddenBehindHole(projection, occlusion) {
  if (projection.viewZ <= occlusion.cameraDistance) {
    return false;
  }

  const centerDistance = Math.hypot(
    projection.x - lab.resolution.width * 0.5,
    projection.y - lab.resolution.height * 0.5,
  );

  return centerDistance < occlusion.shadowPixels * 0.94;
}

function isOccludedByDisk(position, occlusion) {
  const ray = subtract(position, occlusion.cameraPos);

  for (const normal of occlusion.diskPlanes) {
    const denominator = dot(ray, normal);
    if (Math.abs(denominator) < 0.0001) {
      continue;
    }

    const t = -dot(occlusion.cameraPos, normal) / denominator;
    if (t <= 0.02 || t >= 0.98) {
      continue;
    }

    const hit = add(occlusion.cameraPos, scale(ray, t));
    const radialDistance = Math.hypot(hit[0], hit[2]);
    if (radialDistance >= occlusion.diskInner && radialDistance <= occlusion.diskOuter) {
      return true;
    }
  }

  return false;
}
function screenToLaunchPoint(screenX, screenY, cameraPos, cameraBasis) {
  const width = sceneCanvas.clientWidth || window.innerWidth;
  const height = sceneCanvas.clientHeight || window.innerHeight;
  const aspect = width / height;
  const ndcX = (screenX / width) * 2.0 - 1.0;
  const ndcY = 1.0 - (screenY / height) * 2.0;
  const ray = normalize(
    add(
      add(scale(cameraBasis.right, ndcX * aspect), scale(cameraBasis.up, ndcY)),
      scale(cameraBasis.forward, 1.7),
    ),
  );

  const denominator = dot(ray, cameraBasis.forward);
  const planeDistance = denominator > 0.0001 ? dot(scale(cameraPos, -1), cameraBasis.forward) / denominator : lab.state.zoom;
  let point = add(cameraPos, scale(ray, planeDistance));

  const minRadius = getEventHorizonRadius() * 2.8;
  const maxRadius = 13.0 + lab.state.throwPower * 0.35;
  let radius = lengthOf(point);

  if (radius < minRadius) {
    point = scale(normalize(point), minRadius);
    radius = minRadius;
  }

  if (radius > maxRadius) {
    point = scale(normalize(point), maxRadius);
  }

  point[1] *= 0.7;
  return point;
}

function getLaunchVelocity(spawnPosition, dragX, dragY, cameraBasis) {
  const config = THROWABLES[selectedThrowable];
  const radial = normalize(spawnPosition);
  const orbitAssist = orbitAssistStateToDisplay(lab.state.orbitAssist);
  const orbitAssistMix = clamp(orbitAssist / ORBIT_ASSIST_DISPLAY_MAX, 0, 1);
  const throwPowerMix = clamp((lab.state.throwPower - THROW_POWER_MIN) / (THROW_POWER_MAX - THROW_POWER_MIN), 0, 1);
  const orbitSpeed = getLocalOrbitSpeed(spawnPosition);
  const escapeSpeed = getLocalEscapeSpeed(spawnPosition);
  let tangent = cross([0, 1, 0], radial);

  if (lengthOf(tangent) < 0.0001) {
    tangent = cross([1, 0, 0], radial);
  }

  tangent = normalize(tangent);
  const dragDistance = Math.hypot(dragX, dragY);
  const dragDirectionSeed = add(scale(cameraBasis.right, dragX), scale(cameraBasis.up, -dragY));
  const dragDirection = dragDistance > 0.0001 ? normalize(dragDirectionSeed) : tangent;
  const baseOrbitSpeed = orbitSpeed * (0.42 + orbitAssistMix * 0.42 + throwPowerMix * 0.08);
  const inwardSpeed = orbitSpeed * (0.08 + (1 - orbitAssistMix) * 0.08);
  const dragSpeed = escapeSpeed
    * clamp(dragDistance / 220, 0, 1.35)
    * (0.18 + throwPowerMix * 0.32);

  const dragVelocity = scale(dragDirection, dragSpeed);
  let velocity = add(scale(tangent, baseOrbitSpeed), scale(radial, -inwardSpeed));
  velocity = add(velocity, dragVelocity);

  return scale(velocity, config.speedScale);
}

function spawnThrowable(type, position, velocity) {
  const config = THROWABLES[type];
  simulation.bodies.push({
    id: simulation.nextId,
    type,
    position: position.slice(),
    velocity: velocity.slice(),
    trail: [position.slice()],
    trailLength: config.trailLength,
    agility: config.agility,
    screenSize: config.screenSize,
    rgb: config.rgb,
    glow: config.glow,
    age: 0,
    heat: 0,
  });

  simulation.nextId += 1;

  if (simulation.bodies.length > 180) {
    simulation.bodies.splice(0, simulation.bodies.length - 180);
  }
}

function spawnRingBurst() {
  const cameraPos = lab.getCameraPosition(lab.state.zoom, lab.camera.yaw, lab.camera.pitch);
  const cameraBasis = lab.getCameraBasis(cameraPos);
  const count = selectedThrowable === "rock" ? 10 : 14;
  const ringRadius = 8.0 + lab.state.throwPower * 0.32;
  const orbitAssistMix = clamp(orbitAssistStateToDisplay(lab.state.orbitAssist) / ORBIT_ASSIST_DISPLAY_MAX, 0, 1);
  const throwPowerMix = clamp((lab.state.throwPower - THROW_POWER_MIN) / (THROW_POWER_MAX - THROW_POWER_MIN), 0, 1);

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const ringPoint = add(
      scale(cameraBasis.right, Math.cos(angle) * ringRadius),
      scale(cameraBasis.up, Math.sin(angle) * ringRadius * 0.76),
    );
    const spawnPosition = [ringPoint[0], ringPoint[1] * 0.7, ringPoint[2]];
    let tangent = cross([0, 1, 0], normalize(spawnPosition));

    if (lengthOf(tangent) < 0.0001) {
      tangent = cross([1, 0, 0], normalize(spawnPosition));
    }

    tangent = normalize(tangent);
    const orbitSpeed = getLocalOrbitSpeed(spawnPosition);
    const velocity = add(
      scale(
        tangent,
        orbitSpeed * (0.78 + orbitAssistMix * 0.18 + throwPowerMix * 0.08) * THROWABLES[selectedThrowable].speedScale,
      ),
      scale(normalize(spawnPosition), -orbitSpeed * (0.16 + (1 - orbitAssistMix) * 0.12)),
    );

    spawnThrowable(selectedThrowable, spawnPosition, velocity);
  }
}

function getEventHorizonRadius() {
  return 0.78 + lab.state.mass * 0.82;
}

function getDiskInnerRadius() {
  return getEventHorizonRadius() * 1.65;
}

function getDiskOuterRadius() {
  return getDiskInnerRadius() + 5.5 + lab.state.mass * 2.8;
}

function getShadowAngularRadius(cameraPos) {
  return (getEventHorizonRadius() / lengthOf(cameraPos)) * 0.62;
}

function getEffectiveGravityRadius(radius) {
  const horizon = getEventHorizonRadius();
  return Math.max(radius - horizon * 0.52, horizon * 0.62);
}

function getLocalGravityStrength(position) {
  const radius = Math.max(lengthOf(position), 0.0001);
  const effectiveRadius = getEffectiveGravityRadius(radius);
  return (15.0 + lab.state.mass * 10.0) / (effectiveRadius * effectiveRadius + 0.18);
}

function getLocalOrbitSpeed(position) {
  const radius = Math.max(lengthOf(position), 0.0001);
  return Math.sqrt(getLocalGravityStrength(position) * radius);
}

function getLocalEscapeSpeed(position) {
  return getLocalOrbitSpeed(position) * Math.SQRT2;
}

function getAccretionDrag(position, agility) {
  const radius = Math.max(lengthOf(position), 0.0001);
  const horizon = getEventHorizonRadius();
  const diskOuter = getDiskOuterRadius() * 1.08;
  const diskBlend = clamp(1 - (radius - horizon) / Math.max(diskOuter - horizon, 0.0001), 0, 1);
  const planeBlend = clamp(1 - Math.abs(position[1]) / (horizon * 2.6), 0, 1);

  return (0.08 + (1 - agility) * 0.12) * diskBlend * diskBlend * (0.25 + planeBlend * 0.75);
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function lengthOf(vector) {
  return Math.hypot(...vector);
}

function normalize(vector) {
  const vectorLength = lengthOf(vector) || 1;
  return vector.map((value) => value / vectorLength);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbToRgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function mixRgb(a, b, amount) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * amount),
    Math.round(a[1] + (b[1] - a[1]) * amount),
    Math.round(a[2] + (b[2] - a[2]) * amount),
  ];
}

})();
