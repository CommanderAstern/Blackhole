const vertexShaderSource = `#version 300 es
in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCameraPos;
uniform mat3 uCameraBasis;
uniform float uMass;
uniform float uSpin;
uniform float uDiskIntensity;
uniform float uLens;
uniform float uTurbulence;
uniform float uGlow;
uniform float uExposure;
uniform float uRaytrace;
uniform float uBloom;
uniform float uChromatic;
uniform float uStarfield;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, s, -s, c);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  float y0 = mix(x00, x10, f.y);
  float y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise3(p);
    p = p * 2.02 + vec3(7.3, 17.1, 11.7);
    amplitude *= 0.52;
  }

  return value;
}

vec3 diskPalette(float heat) {
  vec3 cool = vec3(0.22, 0.42, 1.22);
  vec3 mid = vec3(1.2, 0.45, 0.14);
  vec3 hot = vec3(2.2, 1.55, 0.92);
  vec3 base = mix(cool, mid, smoothstep(0.0, 0.58, heat));
  return base + hot * pow(smoothstep(0.4, 1.0, heat), 2.7);
}

vec2 directionToSkyUv(vec3 dir) {
  dir = normalize(dir);
  float longitude = atan(dir.z, dir.x);
  float latitude = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(longitude / TAU + 0.5, latitude / PI + 0.5);
}

vec3 starLayer(vec3 dir, float scale, float threshold, float size, float seed) {
  vec2 uv = directionToSkyUv(dir);
  uv.x += seed * 0.173;
  uv *= vec2(scale, scale * 0.5);

  vec2 cell = floor(uv);
  vec2 local = fract(uv) - 0.5;
  float cellNoise = hash21(cell + seed);

  if (cellNoise < threshold) {
    return vec3(0.0);
  }

  vec2 starOffset = (hash22(cell + seed + 17.0) - 0.5) * 0.78;
  vec2 delta = local - starOffset;
  float dist = length(delta);
  float core = pow(saturate(1.0 - dist / size), 8.0);
  float halo = pow(saturate(1.0 - dist / (size * 2.8)), 3.0);
  float spikes = pow(saturate(1.0 - abs(delta.x) / (size * 0.22)), 12.0);
  spikes += pow(saturate(1.0 - abs(delta.y) / (size * 0.22)), 12.0);

  float magnitude = pow(saturate((cellNoise - threshold) / max(1.0 - threshold, 0.0001)), 4.5);
  float twinkle = 0.9 + 0.1 * sin(uTime * (0.6 + cellNoise * 2.2) + cellNoise * 29.0 + seed);
  vec3 warm = vec3(1.35, 1.08, 0.9);
  vec3 cool = vec3(0.78, 0.92, 1.28);
  vec3 tint = mix(cool, warm, hash21(cell + seed + 9.7));

  return tint * (core * (1.2 + magnitude * 5.6) + halo * 0.4 + spikes * 0.06 * (0.5 + magnitude)) * twinkle;
}

vec3 starField(vec3 dir) {
  vec3 stars = vec3(0.0);
  stars += starLayer(dir, 64.0, 0.914, 0.094, 1.0) * 1.18;
  stars += starLayer(dir, 148.0, 0.962, 0.06, 7.0) * 1.08;
  stars += starLayer(dir, 320.0, 0.986, 0.034, 13.0) * 0.84;

  float microStars = pow(max(0.0, hash31(floor(dir * 1250.0)) - 0.9966), 18.0) * 18.0;
  stars += vec3(0.92, 0.96, 1.0) * microStars;
  return stars * 1.85;
}

vec3 backgroundSky(vec3 rd) {
  vec3 dir = normalize(rd);
  vec2 skyUv = directionToSkyUv(dir);
  float nebula = fbm(dir * 3.2 + vec3(uTime * 0.012, -uTime * 0.008, 0.0));
  float band = pow(1.0 - abs(dir.y + 0.05), 4.2);
  vec3 stars = starField(dir);
  float mist = pow(max(0.0, fbm(vec3(skyUv * vec2(26.0, 12.0), uTime * 0.015)) - 0.56), 4.2) * 2.2;
  float dust = fbm(vec3(skyUv * vec2(4.2, 2.2), 3.2));

  vec3 cold = vec3(0.022, 0.026, 0.048);
  vec3 midnight = vec3(0.02, 0.03, 0.08);
  vec3 blue = vec3(0.1, 0.15, 0.32);
  vec3 ember = vec3(0.22, 0.08, 0.12);
  vec3 hue = mix(midnight, mix(blue, ember, smoothstep(0.25, 0.9, nebula)), 0.72);
  hue += band * vec3(0.055, 0.07, 0.13) * (0.4 + dust * 0.6);
  hue += mist * vec3(0.18, 0.2, 0.32);
  hue += stars;

  return mix(cold * 0.55, hue + cold * 0.6, uStarfield);
}

vec3 bendRay(vec3 ro, vec3 rd, float shadowRadius, float bendScale) {
  float horizonRadius = 0.78 + uMass * 0.82;
  float closestT = max(-dot(ro, rd), 0.0);
  vec3 closestPoint = ro + rd * closestT;
  float impact = max(length(closestPoint), horizonRadius * 0.92);
  vec3 towardWell = normalize(-closestPoint + vec3(0.0001, 0.0, 0.0));
  vec3 swirlAxis = normalize(cross(vec3(0.0, 1.0, 0.0), towardWell) + vec3(0.0001, 0.0, 0.0));

  float impactRatio = impact / horizonRadius;
  float weakField = (0.22 + 0.1 * uMass) / max(impactRatio, 1.0);
  float photonField = 0.14 / max(impactRatio - 0.92, 0.42);
  photonField *= 1.0 - smoothstep(1.8, 4.6, impactRatio);

  float screenBoost = mix(0.9, 1.04, saturate(shadowRadius * 2.8));
  float deflection = uLens * bendScale * (weakField + photonField) * screenBoost;
  deflection = min(deflection, 0.96);

  float spinTwist = uSpin * deflection * (0.05 + 0.09 / max(impactRatio, 1.0));
  return normalize(rd + towardWell * deflection + swirlAxis * spinTwist);
}

vec3 lensBackground(vec3 ro, vec3 rd, float shadowRadius) {
  float horizonRadius = 0.78 + uMass * 0.82;
  float closestT = max(-dot(ro, rd), 0.0);
  float impact = length(ro + rd * closestT);
  float ringMix = exp(-3.8 * abs(impact - horizonRadius * 1.5) / horizonRadius);

  vec3 primary = bendRay(ro, rd, shadowRadius, 1.0);
  vec3 color = backgroundSky(primary);

  if (ringMix > 0.01) {
    vec3 secondary = bendRay(ro, rd, shadowRadius, 1.14);
    color = mix(color, backgroundSky(secondary), 0.08 + 0.22 * ringMix);

    if (uRaytrace > 0.5) {
      vec3 tertiary = bendRay(ro, rd, shadowRadius, 1.28);
      color = mix(color, backgroundSky(tertiary), 0.06 + 0.14 * ringMix);
    }
  }

  return color;
}

vec3 sampleDiskArc(
  vec3 ro,
  vec3 rayDir,
  vec3 planeNormal,
  float diskInner,
  float diskOuter,
  float layerMix,
  float warpPhase
) {
  float denom = dot(rayDir, planeNormal);
  if (abs(denom) < 0.0001) {
    return vec3(0.0);
  }

  float t = -dot(ro, planeNormal) / denom;
  if (t <= 0.0) {
    return vec3(0.0);
  }

  vec3 hit = ro + rayDir * t;
  float radius = length(hit.xz);
  vec2 warpedXz = rotate2d(warpPhase + uTime * (0.06 + 0.08 * layerMix)) * hit.xz;
  warpedXz.x *= 1.0 + layerMix * 0.04 / max(radius, 1.0);
  float warpedRadius = length(warpedXz);

  float band = smoothstep(diskInner, diskInner + 0.24, warpedRadius);
  band *= 1.0 - smoothstep(diskOuter - 0.85, diskOuter, warpedRadius);
  if (band <= 0.0) {
    return vec3(0.0);
  }

  float angle = atan(warpedXz.y, warpedXz.x);
  float spiral = 0.5 + 0.5 * sin(angle * 8.0 - warpedRadius * 3.6 + uTime * (1.9 + uSpin * 3.0));
  float clumps = fbm(vec3(warpedXz * (0.36 + uTurbulence * 0.96), uTime * 0.15 + warpPhase));
  float streaks = fbm(vec3(hit.xz * (0.72 + uTurbulence * 1.55), angle * 0.8 - uTime * 0.22));
  float heat = 1.0 - smoothstep(diskInner, diskOuter, warpedRadius);
  float thickness = exp(-abs(dot(hit, planeNormal)) * 9.2);

  vec3 tangent = normalize(vec3(-hit.z, 0.0, hit.x));
  float doppler = 0.8 + 1.7 * pow(saturate(dot(-rayDir, tangent) * 0.5 + 0.5), 3.1) * (0.3 + uSpin * 0.82);
  float density = band * mix(0.55, 1.18, spiral * clumps) * mix(0.82, 1.18, streaks) * thickness;

  return diskPalette(heat) * density * doppler * uDiskIntensity * (0.54 + layerMix * 0.18);
}

vec3 diskContribution(vec3 ro, vec3 rd, float shadowRadius, float diskInner, float diskOuter, float quality) {
  vec3 accum = vec3(0.0);
  float screenShadow = length(cross(normalize(rd), normalize(-ro)));
  vec3 frontRay = bendRay(ro, rd, shadowRadius, mix(0.28, 0.52, quality));
  vec3 rearRay = bendRay(ro, rd, shadowRadius, mix(0.54, 0.84, quality));
  vec3 frontNormal = normalize(vec3(0.0, 1.0, 0.04 + 0.04 * quality));
  vec3 midNormal = normalize(vec3(0.0, 1.0, 0.0));
  vec3 rearNormal = normalize(vec3(0.0, 1.0, -0.08 - 0.05 * quality));

  accum += sampleDiskArc(ro, frontRay, frontNormal, diskInner, diskOuter, 0.7, 0.0);
  accum += sampleDiskArc(ro, frontRay, midNormal, diskInner, diskOuter, 0.32, 1.2) * 0.22;
  accum += sampleDiskArc(ro, rearRay, rearNormal, diskInner, diskOuter, 0.72, 2.5) * mix(0.34, 0.62, quality);

  float warpedEcho = exp(-24.0 * abs(screenShadow - shadowRadius * mix(1.56, 1.78, quality)));
  float lensRibbon = exp(-38.0 * abs(screenShadow - shadowRadius * mix(1.16, 1.28, quality)));
  accum += diskPalette(0.72) * warpedEcho * uDiskIntensity * mix(0.08, 0.14, quality);
  accum += diskPalette(0.94) * lensRibbon * uDiskIntensity * 0.06;

  return accum;
}

vec3 grade(vec3 color, vec2 uv, vec3 ro, vec3 rd, float shadowRadius) {
  float centerDistance = length(cross(normalize(rd), normalize(-ro)));
  float shadow = 1.0 - smoothstep(shadowRadius * 0.98, shadowRadius * 1.1, centerDistance);
  float photonRing = exp(-72.0 * abs(centerDistance - shadowRadius * 1.27));
  float outerRing = exp(-34.0 * abs(centerDistance - shadowRadius * 1.68));
  float vignette = 1.0 - smoothstep(0.92, 1.55, length(uv));

  color *= mix(0.8, 1.0, vignette);
  color += photonRing * vec3(0.34, 0.58, 1.08) * uGlow * mix(0.18, 0.46, uBloom);
  color += outerRing * vec3(0.95, 0.48, 0.18) * uDiskIntensity * 0.12;
  color *= 1.0 - shadow * 0.98;

  if (uChromatic > 0.5) {
    float fringe = photonRing * 0.42 + shadow * 0.08;
    color.r += fringe * 0.2;
    color.b += fringe * 0.34;
    color.g *= 0.985;
  }

  color = 1.0 - exp(-color * uExposure);
  return pow(color, vec3(0.92));
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  vec3 ro = uCameraPos;
  vec3 rd = normalize(uCameraBasis * vec3(uv, 1.7));

  float horizonRadius = 0.78 + uMass * 0.82;
  float shadowRadius = horizonRadius / length(ro) * 0.54;
  float diskInner = horizonRadius * 1.42;
  float diskOuter = diskInner + 2.8 + uMass * 1.45;
  float quality = step(0.5, uRaytrace);

  vec3 color = lensBackground(ro, rd, shadowRadius);
  color += diskContribution(ro, rd, shadowRadius, diskInner, diskOuter, quality);

  if (uBloom > 0.5) {
    float aura = exp(-8.0 * length(uv));
    color += aura * vec3(0.05, 0.08, 0.18) * uGlow;
  }

  color = grade(color, uv, ro, rd, shadowRadius);
  outColor = vec4(color, 1.0);
}
`;

const canvas = document.querySelector("#scene");
const statusLine = document.querySelector("#statusLine");
const fpsBadge = document.querySelector("#fpsBadge");
const renderModeBadge = document.querySelector("#renderModeBadge");

const defaults = {
  mass: 1.35,
  spin: 0.72,
  diskIntensity: 1.0,
  lens: 1.28,
  turbulence: 0.55,
  glow: 0.72,
  exposure: 1.18,
  zoom: 8.8,
  timeScale: 1,
  raytrace: false,
  bloom: true,
  chromatic: true,
  starfield: true,
  orbit: true,
};

const sliderKeys = [
  "mass",
  "spin",
  "diskIntensity",
  "lens",
  "turbulence",
  "glow",
  "exposure",
  "zoom",
  "timeScale",
];

const toggleKeys = ["raytrace", "bloom", "chromatic", "starfield", "orbit"];
const state = { ...defaults };

const sliderInputs = new Map(
  sliderKeys.map((key) => [key, document.querySelector(`[data-control="${key}"]`)]),
);
const outputEls = new Map(
  sliderKeys.map((key) => [key, document.querySelector(`[data-output="${key}"]`)]),
);
const toggleInputs = new Map(
  toggleKeys.map((key) => [key, document.querySelector(`[data-toggle="${key}"]`)]),
);

const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: false,
  powerPreference: "high-performance",
  preserveDrawingBuffer: false,
});

if (!gl) {
  renderModeBadge.textContent = "Renderer unavailable";
  statusLine.textContent = "WebGL2 is unavailable in this browser, so the simulation cannot start.";
  throw new Error("WebGL2 not supported.");
}

const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
const vao = gl.createVertexArray();
const buffer = gl.createBuffer();

gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

const positionLocation = gl.getAttribLocation(program, "aPosition");
gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

const uniforms = {
  resolution: gl.getUniformLocation(program, "uResolution"),
  time: gl.getUniformLocation(program, "uTime"),
  cameraPos: gl.getUniformLocation(program, "uCameraPos"),
  cameraBasis: gl.getUniformLocation(program, "uCameraBasis"),
  mass: gl.getUniformLocation(program, "uMass"),
  spin: gl.getUniformLocation(program, "uSpin"),
  diskIntensity: gl.getUniformLocation(program, "uDiskIntensity"),
  lens: gl.getUniformLocation(program, "uLens"),
  turbulence: gl.getUniformLocation(program, "uTurbulence"),
  glow: gl.getUniformLocation(program, "uGlow"),
  exposure: gl.getUniformLocation(program, "uExposure"),
  raytrace: gl.getUniformLocation(program, "uRaytrace"),
  bloom: gl.getUniformLocation(program, "uBloom"),
  chromatic: gl.getUniformLocation(program, "uChromatic"),
  starfield: gl.getUniformLocation(program, "uStarfield"),
};

const camera = {
  yaw: -0.52,
  pitch: 0.18,
};

const ZOOM_MIN = 4.8;
const ZOOM_MAX = 16;

const pointer = {
  active: false,
  x: 0,
  y: 0,
};

const interaction = {
  cameraDragging: false,
  launchDragging: false,
};

const resolution = {
  width: 1,
  height: 1,
  dpr: 1,
};

const stats = {
  frames: 0,
  elapsed: 0,
};

let simTime = 0;
let lastFrame = performance.now();

gl.disable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);

syncUI();
bindControls();
resize();
requestAnimationFrame(frame);
window.addEventListener("resize", resize);

function bindControls() {
  sliderInputs.forEach((input, key) => {
    input.addEventListener("input", () => {
      state[key] = Number(input.value);
      syncUI();
    });
  });

  toggleInputs.forEach((input, key) => {
    input.addEventListener("change", () => {
      state[key] = input.checked;
      syncUI();
    });
  });

  document.querySelector("#randomizeButton").addEventListener("click", () => {
    sliderInputs.forEach((input, key) => {
      const min = Number(input.min);
      const max = Number(input.max);
      const precision = key === "zoom" ? 1 : 2;
      state[key] = Number(randomBetween(min, max).toFixed(precision));
    });

    state.raytrace = Math.random() > 0.35;
    state.bloom = true;
    state.chromatic = Math.random() > 0.2;
    state.starfield = true;
    state.orbit = true;

    syncUI();
    statusLine.textContent = "Fresh cosmic chaos dialed in. Drag the view if you want to frame a new angle.";
  });

  document.querySelector("#resetButton").addEventListener("click", () => {
    Object.assign(state, defaults);
    camera.yaw = -0.52;
    camera.pitch = 0.18;
    syncUI();
    statusLine.textContent = "Back to the default singularity profile.";
  });

  document.querySelector("#cinematicButton").addEventListener("click", () => {
    Object.assign(state, {
      mass: 1.92,
      spin: 1.12,
      diskIntensity: 1.55,
      lens: 1.95,
      turbulence: 0.86,
      glow: 1.08,
      exposure: 1.3,
      zoom: 7.2,
      timeScale: 0.84,
      raytrace: true,
      bloom: true,
      chromatic: true,
      starfield: true,
      orbit: true,
    });

    camera.yaw = -0.68;
    camera.pitch = 0.22;
    syncUI();
    statusLine.textContent = "Cinematic mode armed: hotter disk, tighter framing, heavier lensing.";
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointer.active = true;
    interaction.cameraDragging = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointer.active) {
      return;
    }

    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    camera.yaw -= deltaX * 0.0055;
    camera.pitch = clamp(camera.pitch - deltaY * 0.0045, -1.1, 1.1);
  });

  const stopPointer = (event) => {
    pointer.active = false;
    interaction.cameraDragging = false;
    if (event && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  canvas.addEventListener("pointerup", stopPointer);
  canvas.addEventListener("pointercancel", stopPointer);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      state.zoom = clamp(state.zoom + event.deltaY * 0.0035, ZOOM_MIN, ZOOM_MAX);
      syncUI();
    },
    { passive: false },
  );
}

function syncUI() {
  sliderKeys.forEach((key) => {
    const input = sliderInputs.get(key);
    const output = outputEls.get(key);
    if (!input || !output) {
      return;
    }

    input.value = String(state[key]);
    output.textContent = formatValue(key, state[key]);
  });

  toggleKeys.forEach((key) => {
    const input = toggleInputs.get(key);
    if (input) {
      input.checked = Boolean(state[key]);
    }
  });

  renderModeBadge.textContent = state.raytrace ? "Raytraced lensing" : "Stylized lensing";
  refreshStatusMessage();
}

function refreshStatusMessage() {
  const details = [];
  details.push(state.raytrace ? "Raytracing is on for denser light bending." : "Stylized mode is on for a lighter GPU load.");
  if (state.bloom) {
    details.push("Bloom is feeding a brighter photon halo.");
  }
  if (state.chromatic) {
    details.push("Chromatic fringe is adding spectral warping.");
  }
  if (!state.starfield) {
    details.push("Starfield is muted for a cleaner silhouette.");
  }
  if (!state.orbit) {
    details.push("Auto orbit is paused so the camera stays put.");
  }

  statusLine.textContent = details.join(" ");
}

function frame(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  simTime += delta * state.timeScale;

  if (state.orbit && !interaction.cameraDragging && !interaction.launchDragging) {
    camera.yaw += delta * (0.18 + state.spin * 0.06);
    const targetPitch = 0.16 + Math.sin(simTime * 0.22) * 0.08;
    camera.pitch += (targetPitch - camera.pitch) * delta * 1.2;
  }

  render();
  updateFps(delta);
  requestAnimationFrame(frame);
}

function render() {
  const cameraPos = getCameraPosition(state.zoom, camera.yaw, camera.pitch);
  const cameraBasis = getCameraBasis(cameraPos);

  gl.viewport(0, 0, resolution.width, resolution.height);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform2f(uniforms.resolution, resolution.width, resolution.height);
  gl.uniform1f(uniforms.time, simTime);
  gl.uniform3f(uniforms.cameraPos, cameraPos[0], cameraPos[1], cameraPos[2]);
  gl.uniformMatrix3fv(
    uniforms.cameraBasis,
    false,
    new Float32Array([
      cameraBasis.right[0], cameraBasis.right[1], cameraBasis.right[2],
      cameraBasis.up[0], cameraBasis.up[1], cameraBasis.up[2],
      cameraBasis.forward[0], cameraBasis.forward[1], cameraBasis.forward[2],
    ]),
  );

  gl.uniform1f(uniforms.mass, state.mass);
  gl.uniform1f(uniforms.spin, state.spin);
  gl.uniform1f(uniforms.diskIntensity, state.diskIntensity);
  gl.uniform1f(uniforms.lens, state.lens);
  gl.uniform1f(uniforms.turbulence, state.turbulence);
  gl.uniform1f(uniforms.glow, state.glow);
  gl.uniform1f(uniforms.exposure, state.exposure);
  gl.uniform1f(uniforms.raytrace, state.raytrace ? 1 : 0);
  gl.uniform1f(uniforms.bloom, state.bloom ? 1 : 0);
  gl.uniform1f(uniforms.chromatic, state.chromatic ? 1 : 0);
  gl.uniform1f(uniforms.starfield, state.starfield ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}

function resize() {
  resolution.dpr = Math.min(window.devicePixelRatio || 1, 2);
  resolution.width = Math.floor(window.innerWidth * resolution.dpr);
  resolution.height = Math.floor(window.innerHeight * resolution.dpr);
  canvas.width = resolution.width;
  canvas.height = resolution.height;
}

function updateFps(delta) {
  stats.frames += 1;
  stats.elapsed += delta;

  if (stats.elapsed >= 0.35) {
    const fps = Math.round(stats.frames / stats.elapsed);
    fpsBadge.textContent = `${fps} fps`;
    stats.frames = 0;
    stats.elapsed = 0;
  }
}

function getCameraPosition(distance, yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return [
    distance * cosPitch * Math.sin(yaw),
    distance * Math.sin(pitch),
    distance * cosPitch * Math.cos(yaw),
  ];
}

function getCameraBasis(position) {
  const forward = normalize(scale(position, -1));
  let right = normalize(cross([0, 1, 0], forward));
  if (lengthOf(right) < 0.0001) {
    right = [1, 0, 0];
  }
  const up = normalize(cross(forward, right));
  return { right, up, forward };
}

function normalize(vector) {
  const vectorLength = lengthOf(vector) || 1;
  return vector.map((value) => value / vectorLength);
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function formatValue(key, value) {
  if (key === "zoom") {
    return value.toFixed(1);
  }

  if (key === "timeScale") {
    return value < 0.01 ? "0" : value.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
  }

  return value.toFixed(2).replace(/0$/, "").replace(/\.$/, "");
}

function createProgram(context, vertexSource, fragmentSource) {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentSource);
  const shaderProgram = context.createProgram();

  context.attachShader(shaderProgram, vertexShader);
  context.attachShader(shaderProgram, fragmentShader);
  context.linkProgram(shaderProgram);

  if (!context.getProgramParameter(shaderProgram, context.LINK_STATUS)) {
    const message = context.getProgramInfoLog(shaderProgram) || "Unknown program link error.";
    console.error(message);
    statusLine.textContent = "Shader program failed to link. Check the browser console for details.";
    throw new Error(message);
  }

  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);
  return shaderProgram;
}

function createShader(context, type, source) {
  const shader = context.createShader(type);
  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const message = context.getShaderInfoLog(shader) || "Unknown shader compile error.";
    console.error(message);
    statusLine.textContent = "Shader compilation failed. Check the browser console for details.";
    throw new Error(message);
  }

  return shader;
}



window.singularityLab = {
  canvas,
  resolution,
  state,
  camera,
  interaction,
  statusLine,
  fpsBadge,
  renderModeBadge,
  getCameraPosition,
  getCameraBasis,
  refreshStatusMessage,
  formatValue,
};



