const canvas = document.getElementById("club-canvas");
const ctx = canvas.getContext("2d");

const micStatus = document.getElementById("mic-status");
const intensityStatus = document.getElementById("intensity-status");
const permissionPanel = document.getElementById("permission-panel");
const permissionText = document.getElementById("permission-text");
const permissionSteps = document.getElementById("permission-steps");
const permissionActions = document.getElementById("permission-actions");
const retryMicButton = document.getElementById("retry-mic-button");
const mirrorball = document.getElementById("mirrorball");

const DPR_LIMIT = 1.25;
const BEAM_COUNT = 64;
const PARTICLE_COUNT = 120;
const ORB_COUNT = 14;
const MIRROR_RAY_COUNT = 16;
const VISUALIZER_BARS = 30;
const NEON_HUES = [186, 206, 226, 274, 318, 336, 356, 98];

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  time: 0,
  lastFrame: performance.now(),
  paletteHue: 200,
  altHue: 320,
  accentHue: 98,
  flash: 0.24,
  peakFlash: 0.12,
  bloom: 0.65,
  audioReady: false,
  permissionDenied: false,
  analyser: null,
  audioContext: null,
  stream: null,
  freqData: null,
  prevFreqData: null,
  timeData: null,
  requestingAudio: false,
  volume: 0,
  smoothedVolume: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  spectrumFlux: 0,
  runningAudioAverage: 0.22,
  energy: 0.24,
  targetEnergy: 0.24,
  randomEnergy: 0.34,
  bassPulse: 0,
  surge: 0.08,
  peak: 0.06,
  peakHold: 0,
  mirrorPulse: 0.24,
  chaos: Math.random() * Math.PI * 2,
};

const beams = Array.from({ length: BEAM_COUNT }, (_, index) => createBeam(index));
const particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle());
const orbs = Array.from({ length: ORB_COUNT }, (_, index) => createOrb(index));
const mirrorRays = Array.from({ length: MIRROR_RAY_COUNT }, (_, index) =>
  createMirrorRay(index)
);
const visualizerLevels = Array.from({ length: VISUALIZER_BARS }, () => 0.18);

function createBeam(index) {
  const layerRoll = Math.random();
  let layer = "mid";

  if (layerRoll < 0.28) {
    layer = "back";
  } else if (layerRoll > 0.74) {
    layer = "front";
  }

  return {
    side: Math.random() > 0.5 ? 1 : -1,
    layer,
    depth:
      layer === "front"
        ? 0.42 + Math.random() * 0.28
        : layer === "mid"
          ? 0.72 + Math.random() * 0.5
          : 1.2 + Math.random() * 0.8,
    baseAngle: (-0.85 + Math.random() * 1.7) * Math.PI,
    sweep: 0.35 + Math.random() * 1.85,
    speed:
      layer === "front"
        ? 0.9 + Math.random() * 1.8
        : layer === "mid"
          ? 0.7 + Math.random() * 1.45
          : 0.45 + Math.random() * 1.1,
    width:
      layer === "front"
        ? 3.8 + Math.random() * 5.2
        : layer === "mid"
          ? 2 + Math.random() * 3.4
          : 1.1 + Math.random() * 1.8,
    brightness: 0.52 + Math.random() * 0.85,
    hueOffset: Math.random() * 210 - 105,
    life: (index / BEAM_COUNT) * Math.PI * 2,
    length: 0.48 + Math.random() * 0.48,
    jitter: 0.1 + Math.random() * 0.28,
  };
}

function createParticle() {
  return {
    x: Math.random(),
    y: Math.random(),
    z: 0.22 + Math.random() * 1.36,
    radius: 0.8 + Math.random() * 3.4,
    speed: 0.2 + Math.random() * 1.5,
    drift: -0.35 + Math.random() * 0.7,
    hueOffset: Math.random() * 280 - 140,
  };
}

function createOrb(index) {
  const spread = index / ORB_COUNT;
  return {
    x: spread,
    y: Math.random() * 0.42 + 0.06,
    radius: 90 + Math.random() * 220,
    phase: Math.random() * Math.PI * 2,
    speed: 0.22 + Math.random() * 0.52,
    hueOffset: Math.random() * 220 - 110,
  };
}

function createMirrorRay(index) {
  return {
    offset: (index / MIRROR_RAY_COUNT) * Math.PI * 2,
    speed: 0.45 + Math.random() * 1.1,
    spread: 0.14 + Math.random() * 0.3,
    reach: 0.18 + Math.random() * 0.42,
    width: 0.8 + Math.random() * 3.2,
    hueOffset: Math.random() * 200 - 100,
  };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.dpr = dpr;
  canvas.width = Math.round(state.width * dpr);
  canvas.height = Math.round(state.height * dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function wrapHue(value) {
  const hue = value % 360;
  return hue < 0 ? hue + 360 : hue;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function neonHueAt(phase) {
  const normalized = ((phase % NEON_HUES.length) + NEON_HUES.length) % NEON_HUES.length;
  const baseIndex = Math.floor(normalized);
  const nextIndex = (baseIndex + 1) % NEON_HUES.length;
  const t = normalized - baseIndex;
  const current = NEON_HUES[baseIndex];
  let next = NEON_HUES[nextIndex];

  if (Math.abs(next - current) > 180) {
    next += next > current ? -360 : 360;
  }

  return wrapHue(lerp(current, next, t));
}

function sampleBand(data, startRatio, endRatio) {
  const start = Math.floor(data.length * startRatio);
  const end = Math.max(start + 1, Math.floor(data.length * endRatio));
  let total = 0;

  for (let i = start; i < end; i += 1) {
    total += data[i];
  }

  return total / ((end - start) * 255);
}

function updateFallbackEnergy(delta) {
  state.randomEnergy += rand(-1, 1) * delta * 0.055;
  state.randomEnergy = clamp(state.randomEnergy, 0.28, 0.68);

  if (Math.random() < 0.025 + state.peak * 0.05) {
    state.randomEnergy = clamp(state.randomEnergy + rand(0.03, 0.11), 0.28, 0.88);
  }
}

function updateAudioMetrics() {
  if (!state.analyser || !state.freqData || !state.timeData) {
    state.volume = 0;
    state.bass = 0;
    state.mid = 0;
    state.treble = 0;
    state.spectrumFlux = 0;
    return;
  }

  state.analyser.getByteFrequencyData(state.freqData);
  state.analyser.getByteTimeDomainData(state.timeData);

  let rms = 0;
  for (let i = 0; i < state.timeData.length; i += 1) {
    const centered = (state.timeData[i] - 128) / 128;
    rms += centered * centered;
  }

  let flux = 0;
  for (let i = 0; i < state.freqData.length; i += 12) {
    flux += Math.abs(state.freqData[i] - state.prevFreqData[i]) / 255;
    state.prevFreqData[i] = state.freqData[i];
  }

  state.volume = Math.sqrt(rms / state.timeData.length);
  state.bass = sampleBand(state.freqData, 0.0, 0.08);
  state.mid = sampleBand(state.freqData, 0.08, 0.28);
  state.treble = sampleBand(state.freqData, 0.28, 0.82);
  state.spectrumFlux = clamp(flux / (state.freqData.length / 12), 0, 1);
}

function setPermissionUI({
  stateName = "info",
  message,
  steps = [],
  showRetry = false,
  retryLabel = "マイクを再試行",
}) {
  permissionPanel.dataset.state = stateName;
  permissionText.textContent = message;

  if (steps.length > 0) {
    permissionSteps.hidden = false;
    permissionSteps.innerHTML = steps.map((step) => `<li>${step}</li>`).join("");
  } else {
    permissionSteps.hidden = true;
    permissionSteps.innerHTML = "";
  }

  permissionActions.hidden = !showRetry;
  retryMicButton.textContent = retryLabel;
}

function updateEnergy(delta) {
  updateAudioMetrics();
  updateFallbackEnergy(delta);

  state.smoothedVolume = lerp(state.smoothedVolume, state.volume, 0.18);

  const audioImpact =
    state.smoothedVolume * 3.4 + state.bass * 1.3 + state.mid * 0.82 + state.treble * 0.72;
  state.runningAudioAverage = lerp(state.runningAudioAverage, audioImpact, 0.032);

  const deltaBoost = Math.max(0, audioImpact - state.runningAudioAverage);
  const surgeTarget = clamp(
    deltaBoost * 1.7 + state.spectrumFlux * 1.4 + state.bass * 0.38,
    0,
    1.35
  );
  const peakTarget = clamp(
    state.smoothedVolume * 1.7 +
      state.bass * 1.42 +
      state.spectrumFlux * 1.24 +
      deltaBoost * 2.05 -
      0.38,
    0,
    1.5
  );

  state.surge = lerp(state.surge, surgeTarget, surgeTarget > state.surge ? 0.18 : 0.06);
  state.peak = lerp(state.peak, peakTarget, peakTarget > state.peak ? 0.22 : 0.05);
  state.targetEnergy = clamp(
    state.randomEnergy * 0.88 + audioImpact * 0.86 + state.surge * 0.22,
    0.24,
    1.52
  );
  state.energy = lerp(state.energy, state.targetEnergy, 0.1);
  state.bassPulse = lerp(state.bassPulse, state.bass, 0.16);
  state.mirrorPulse = lerp(
    state.mirrorPulse,
    clamp(state.energy * 0.55 + state.peak * 0.5 + state.bassPulse * 0.45, 0.18, 1.4),
    0.12
  );

  if (peakTarget > 0.82) {
    state.peakHold = 1;
  } else {
    state.peakHold = Math.max(0, state.peakHold - delta * 0.04);
  }

  const palettePhase =
    state.time * 0.22 +
    state.randomEnergy * 3.2 +
    state.bass * 2.7 +
    state.treble * 1.6 +
    state.peak * 1.4;
  state.paletteHue = neonHueAt(palettePhase);
  state.altHue = neonHueAt(palettePhase + 2.1 + state.surge * 0.8);
  state.accentHue = neonHueAt(palettePhase + 4.45 + state.peak * 0.7);

  state.flash = clamp(0.24 + state.energy * 0.55 + state.bassPulse * 0.26, 0.22, 1.08);
  state.peakFlash = clamp(0.1 + state.peak * 0.72 + state.peakHold * 0.24, 0.08, 1.15);
  state.bloom = clamp(0.5 + state.energy * 0.78 + state.peak * 0.45, 0.45, 1.7);

  document.documentElement.style.setProperty("--laser-hue", state.paletteHue.toFixed(1));
  document.documentElement.style.setProperty("--laser-hue-2", state.altHue.toFixed(1));
  document.documentElement.style.setProperty("--laser-hue-3", state.accentHue.toFixed(1));
  document.documentElement.style.setProperty(
    "--mirror-hue",
    neonHueAt(palettePhase + 0.8 + state.treble * 0.8).toFixed(1)
  );
  document.documentElement.style.setProperty("--flash", state.flash.toFixed(3));
  document.documentElement.style.setProperty("--peak-flash", state.peakFlash.toFixed(3));
  document.documentElement.style.setProperty(
    "--glow-alpha",
    clamp(0.56 + state.energy * 0.48 + state.peak * 0.24, 0.52, 1.2).toFixed(3)
  );
  document.documentElement.style.setProperty(
    "--mirror-sheen",
    clamp(0.46 + state.mirrorPulse * 0.46, 0.46, 1.1).toFixed(3)
  );
  document.documentElement.style.setProperty(
    "--spin-duration",
    `${clamp(6.8 - state.energy * 3.1 - state.peak * 1.4, 1.35, 6.8).toFixed(2)}s`
  );
  document.documentElement.style.setProperty(
    "--pulse-scale",
    (1 + state.bassPulse * 0.13 + state.peak * 0.06).toFixed(3)
  );
  document.documentElement.style.setProperty(
    "--status-glow",
    `hsla(${state.altHue.toFixed(1)} 100% 66% / ${clamp(0.22 + state.energy * 0.24 + state.peak * 0.16, 0.22, 0.78).toFixed(3)})`
  );

  if (state.permissionDenied) {
    micStatus.textContent = "DENIED";
  } else if (state.audioReady) {
    micStatus.textContent = "LIVE";
  } else {
    micStatus.textContent = "WAITING";
  }

  if (state.peak > 0.88 || state.peakHold > 0.32) {
    intensityStatus.textContent = "PEAK BURST";
  } else if (state.energy > 0.96) {
    intensityStatus.textContent = "OVERDRIVE";
  } else if (state.energy > 0.62) {
    intensityStatus.textContent = "RAVE PEAK";
  } else if (state.energy > 0.36) {
    intensityStatus.textContent = "CLUB FLOW";
  } else {
    intensityStatus.textContent = "IDLE LASERS";
  }
}

function widthLerp(startRatio, endRatio, t) {
  return lerp(state.width * startRatio, state.width * endRatio, t);
}

function mirrorOrigin() {
  return {
    x: state.width * 0.5,
    y: 164,
  };
}

function drawBackground() {
  const width = state.width;
  const height = state.height;
  const horizonY = height * 0.61;

  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);

  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, `hsla(${wrapHue(state.altHue - 22)} 100% 8% / 1)`);
  bgGradient.addColorStop(0.4, `hsla(${wrapHue(state.paletteHue + 12)} 100% 6% / 1)`);
  bgGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  const centerGradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0,
    width * 0.5,
    height * 0.42,
    Math.max(width, height) * 0.82
  );
  centerGradient.addColorStop(
    0,
    `hsla(${state.paletteHue} 100% 64% / ${0.16 + state.flash * 0.18})`
  );
  centerGradient.addColorStop(
    0.34,
    `hsla(${state.altHue} 100% 58% / ${0.08 + state.energy * 0.08})`
  );
  centerGradient.addColorStop(
    0.58,
    `hsla(${state.accentHue} 100% 54% / ${0.05 + state.peakFlash * 0.05})`
  );
  centerGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = centerGradient;
  ctx.fillRect(0, 0, width, height);

  const topFlash = ctx.createRadialGradient(
    width * 0.5,
    height * 0.04,
    0,
    width * 0.5,
    height * 0.04,
    width * 0.28
  );
  topFlash.addColorStop(0, `rgba(255, 255, 255, ${state.peakFlash * 0.3})`);
  topFlash.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = topFlash;
  ctx.fillRect(0, 0, width, height * 0.36);

  ctx.save();
  ctx.translate(width * 0.5, horizonY);
  for (let i = 0; i < 18; i += 1) {
    const alpha = 0.035 + i * 0.006 + state.energy * 0.024 + state.peak * 0.016;
    const radius = width * (0.07 + i * 0.055 + state.energy * 0.024);
    ctx.beginPath();
    ctx.strokeStyle = `hsla(${neonHueAt(i * 0.75 + state.time * 0.14 + state.energy)} 100% 66% / ${alpha})`;
    ctx.lineWidth = 1 + i * 0.22 + state.peak * 0.6;
    ctx.ellipse(0, 0, radius, radius * 0.22, 0, 0, Math.PI, true);
    ctx.stroke();
  }
  ctx.restore();

  const floorGradient = ctx.createLinearGradient(0, horizonY, 0, height);
  floorGradient.addColorStop(0, `rgba(255, 255, 255, ${0.06 + state.energy * 0.06})`);
  floorGradient.addColorStop(
    0.16,
    `hsla(${state.altHue} 100% 64% / ${0.08 + state.flash * 0.06})`
  );
  floorGradient.addColorStop(1, "rgba(0, 0, 0, 0.84)");
  ctx.fillStyle = floorGradient;
  ctx.fillRect(0, horizonY, width, height - horizonY);
}

function drawOrbs() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const orb of orbs) {
    const wobble = Math.sin(state.time * orb.speed + orb.phase);
    const x = widthLerp(0.04, 0.96, orb.x + wobble * 0.024);
    const y = state.height * orb.y + Math.cos(state.time * orb.speed * 1.4 + orb.phase) * 48;
    const radius = orb.radius * (0.78 + state.energy * 0.3 + state.peak * 0.16);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(
      0,
      `hsla(${wrapHue(state.paletteHue + orb.hueOffset)} 100% 72% / ${0.18 + state.energy * 0.06})`
    );
    gradient.addColorStop(
      0.34,
      `hsla(${wrapHue(state.altHue + orb.hueOffset * 0.32)} 100% 62% / ${0.08 + state.peakFlash * 0.06})`
    );
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function visualizerLevelAt(index) {
  if (state.audioReady && state.freqData) {
    const startRatio = index / VISUALIZER_BARS;
    const endRatio = (index + 1) / VISUALIZER_BARS;
    const bucket = sampleBand(state.freqData, startRatio * 0.66, 0.02 + endRatio * 0.72);
    return clamp(bucket * 1.22 + state.energy * 0.08, 0.05, 1);
  }

  return clamp(
    0.12 +
      state.randomEnergy * 0.28 +
      Math.sin(state.time * 1.8 + index * 0.42) * 0.08 +
      Math.cos(state.time * 0.9 + index * 0.25) * 0.05,
    0.06,
    0.48
  );
}

function drawMirrorScatter() {
  const origin = mirrorOrigin();
  const count = Math.floor(8 + state.energy * 9 + state.peak * 6);

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let index = 0; index < count; index += 1) {
    const ray = mirrorRays[index % mirrorRays.length];
    const spin = state.time * ray.speed + ray.offset;
    const angle =
      -Math.PI / 2 +
      Math.sin(spin * 0.7) * ray.spread +
      Math.cos(spin * 1.12) * 0.1 +
      (index / count - 0.5) * 2.2;
    const distance =
      state.height * (0.16 + ray.reach + state.energy * 0.12 + state.peak * 0.18);
    const endX = origin.x + Math.cos(angle) * distance;
    const endY = origin.y + Math.sin(angle) * distance;
    const alpha = clamp(0.06 + state.energy * 0.06 + state.peak * 0.14, 0.05, 0.24);
    const hue = wrapHue(state.altHue + ray.hueOffset + Math.sin(spin) * 30);

    ctx.strokeStyle = `hsla(${hue} 100% 74% / ${alpha})`;
    ctx.lineWidth = ray.width * (0.42 + state.energy * 0.55 + state.peak * 0.35);
    ctx.shadowBlur = 8 + state.bloom * 10;
    ctx.shadowColor = `hsla(${hue} 100% 74% / ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.restore();
}

function drawLasers() {
  const origin = mirrorOrigin();
  const stageY = state.height * 0.68;
  const beamDrive = clamp(state.energy * 0.72 + state.peak * 0.58, 0, 1);
  const activeBeamCount = Math.floor(lerp(18, BEAM_COUNT, Math.pow(beamDrive, 0.8)));

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let index = 0; index < activeBeamCount; index += 1) {
    const beam = beams[index];
    const layerScale =
      beam.layer === "front" ? 1.24 : beam.layer === "mid" ? 1 : 0.74;
    const speedBoost = 0.5 + state.energy * 2.5 + state.peak * 3.1;
    beam.life += 0.012 * beam.speed * speedBoost;

    const sweep =
      Math.sin(beam.life * beam.sweep + state.chaos) * (0.18 + state.energy * 0.38) +
      Math.cos(beam.life * 0.65 + beam.jitter) * 0.12;
    const perspective = 1 / beam.depth;
    const localOriginX = origin.x + beam.side * (10 + 24 * perspective) + Math.sin(beam.life) * 12;
    const localOriginY = origin.y + Math.cos(beam.life * 0.9) * 8;
    const targetX =
      localOriginX +
      beam.side * state.width * (0.1 + perspective * 0.1) +
      sweep * state.width * (0.22 + perspective * 0.22) +
      Math.sin(beam.life * 1.6) * 38 * layerScale;
    const targetY =
      stageY +
      Math.sin(beam.life * 0.72 + beam.depth) * state.height * (0.18 + state.peak * 0.05) -
      perspective * state.height * (0.16 + state.energy * 0.06);
    const lineWidth =
      beam.width *
      layerScale *
      (0.8 + state.energy * 1.9 + state.peak * 1.2) *
      perspective;
    const alpha = clamp(
      0.14 + beam.brightness * 0.26 + state.energy * 0.34 + state.peak * 0.18,
      0.12,
      0.95
    );
    const hueBase =
      index % 3 === 0 ? state.paletteHue : index % 3 === 1 ? state.altHue : state.accentHue;
    const hue = wrapHue(hueBase + beam.hueOffset + Math.sin(beam.life) * 26);

    ctx.strokeStyle = `hsla(${hue} 100% 63% / ${alpha * 0.32})`;
    ctx.lineWidth = lineWidth * 2.15;
    ctx.shadowBlur = 16 + state.bloom * 20;
    ctx.shadowColor = `hsla(${hue} 100% 64% / ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(localOriginX, localOriginY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();

    ctx.strokeStyle = `hsla(${hue} 100% 68% / ${alpha})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(localOriginX, localOriginY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * (0.62 + state.peak * 0.2)})`;
    ctx.lineWidth = Math.max(1.15, lineWidth * 0.22);
    ctx.beginPath();
    ctx.moveTo(localOriginX, localOriginY);
    ctx.lineTo(
      lerp(localOriginX, targetX, beam.length + state.peak * 0.1),
      lerp(localOriginY, targetY, beam.length + state.peak * 0.1)
    );
    ctx.stroke();
  }

  if (state.peak > 0.66 || state.peakHold > 0.2) {
    const burstCount = 7 + Math.floor(state.peak * 10);
    for (let index = 0; index < burstCount; index += 1) {
      const angle = -0.35 + (index / burstCount) * 0.7 + Math.sin(state.time * 1.8 + index) * 0.05;
      const endX = origin.x + Math.sin(angle) * state.width * (0.46 + state.peak * 0.12);
      const endY = stageY - Math.cos(angle) * state.height * 0.08;

      ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + state.peakFlash * 0.1})`;
      ctx.lineWidth = 1.2 + state.peak * 1.2;
      ctx.shadowBlur = 16 + state.peakFlash * 16;
      ctx.shadowColor = `hsla(${state.altHue} 100% 70% / ${0.18 + state.peakFlash * 0.12})`;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawParticles(delta) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const particle of particles) {
    particle.y -= delta * (0.018 + particle.speed * (0.042 + state.energy * 0.09)) / particle.z;
    particle.x += delta * particle.drift * (0.006 + state.energy * 0.012);

    if (particle.y < -0.08) {
      particle.y = 1.05;
      particle.x = Math.random();
    }

    if (particle.x < -0.08) {
      particle.x = 1.08;
    } else if (particle.x > 1.08) {
      particle.x = -0.08;
    }

    const x = particle.x * state.width;
    const y = particle.y * state.height;
    const radius = particle.radius * (0.56 + state.energy * 1.45 + state.peak * 0.4) / particle.z;
    const alpha = clamp(
      0.1 + state.energy * 0.18 + state.peak * 0.08 + (1 / particle.z) * 0.05,
      0.05,
      0.42
    );
    const hue =
      particle.hueOffset > 0
        ? wrapHue(state.altHue + particle.hueOffset)
        : wrapHue(state.paletteHue + particle.hueOffset);

    ctx.fillStyle = `hsla(${hue} 100% 72% / ${alpha})`;
    ctx.shadowBlur = 10 + state.bloom * 10;
    ctx.shadowColor = `hsla(${wrapHue(hue + 12)} 100% 75% / ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawVisualizer() {
  const totalWidth = Math.min(state.width * 0.62, 860);
  const barGap = 7;
  const barWidth = (totalWidth - barGap * (VISUALIZER_BARS - 1)) / VISUALIZER_BARS;
  const baseX = (state.width - totalWidth) / 2;
  const baseY = state.height - 52;
  const maxHeight = Math.min(state.height * 0.26, 180);

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const floorGlow = ctx.createRadialGradient(
    state.width * 0.5,
    baseY,
    0,
    state.width * 0.5,
    baseY,
    totalWidth * 0.55
  );
  floorGlow.addColorStop(0, `hsla(${state.altHue} 100% 64% / 0.18)`);
  floorGlow.addColorStop(0.5, `hsla(${state.paletteHue} 100% 58% / 0.08)`);
  floorGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = floorGlow;
  ctx.fillRect(baseX - 40, baseY - maxHeight, totalWidth + 80, maxHeight + 70);

  for (let index = 0; index < VISUALIZER_BARS; index += 1) {
    const target = visualizerLevelAt(index);
    visualizerLevels[index] = lerp(visualizerLevels[index], target, 0.28);

    const level = visualizerLevels[index];
    const height = 14 + level * maxHeight * (0.7 + state.peak * 0.2);
    const x = baseX + index * (barWidth + barGap);
    const y = baseY - height;
    const hue = wrapHue(
      state.paletteHue + (index / VISUALIZER_BARS) * 180 + Math.sin(state.time * 0.9 + index) * 18
    );

    ctx.fillStyle = `hsla(${hue} 100% 64% / 0.2)`;
    ctx.fillRect(x, y, barWidth, height);

    const gradient = ctx.createLinearGradient(0, y, 0, baseY);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.6 + state.peak * 0.18})`);
    gradient.addColorStop(0.2, `hsla(${hue} 100% 72% / 0.96)`);
    gradient.addColorStop(1, `hsla(${wrapHue(hue + 24)} 100% 52% / 0.22)`);
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 10 + state.bloom * 8;
    ctx.shadowColor = `hsla(${hue} 100% 70% / 0.35)`;
    ctx.fillRect(x, y, barWidth, height);

    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + state.peak * 0.18})`;
    ctx.fillRect(x, y, barWidth, Math.max(2, 2 + level * 4));
  }

  ctx.restore();
}

function drawFlashOverlay() {
  const washGradient = ctx.createLinearGradient(0, 0, state.width, state.height);
  washGradient.addColorStop(
    0,
    `hsla(${state.paletteHue} 100% 64% / ${0.03 + state.flash * 0.05})`
  );
  washGradient.addColorStop(
    0.5,
    `rgba(255, 255, 255, ${0.015 + state.peakFlash * 0.03})`
  );
  washGradient.addColorStop(
    1,
    `hsla(${state.altHue} 100% 68% / ${0.03 + state.flash * 0.05})`
  );
  ctx.fillStyle = washGradient;
  ctx.fillRect(0, 0, state.width, state.height);

  if (state.peak > 0.7 && Math.random() < 0.28) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + state.peakFlash * 0.14})`;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  if (state.peakHold > 0.28 && Math.random() < 0.14) {
    const bandWidth = state.width * rand(0.08, 0.18);
    const x = rand(-bandWidth * 0.3, state.width - bandWidth * 0.7);
    const bandGradient = ctx.createLinearGradient(x, 0, x + bandWidth, 0);
    bandGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    bandGradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.08 + state.peakFlash * 0.12})`);
    bandGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = bandGradient;
    ctx.fillRect(x, 0, bandWidth, state.height);
  }
}

function draw() {
  drawBackground();
  drawOrbs();
  drawMirrorScatter();
  drawLasers();
  drawParticles(1);
  drawVisualizer();
  drawFlashOverlay();
}

function tick(now) {
  const deltaMs = Math.min(64, now - state.lastFrame);
  const delta = deltaMs / 16.6667;
  state.lastFrame = now;
  state.time += deltaMs / 1000;

  updateEnergy(delta);
  drawBackground();
  drawOrbs();
  drawMirrorScatter();
  drawLasers();
  drawParticles(delta);
  drawVisualizer();
  drawFlashOverlay();

  requestAnimationFrame(tick);
}

async function setupAudio() {
  if (state.requestingAudio) {
    return;
  }

  if (state.audioReady) {
    if (state.audioContext?.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }
    setPermissionUI({
      stateName: "info",
      message: "マイク解析が有効です。音が入ると背景、レーザー、ミラーボールがさらに暴れます。",
    });
    return;
  }

  if (!window.isSecureContext) {
    state.permissionDenied = true;
    micStatus.textContent = "BLOCKED";
    setPermissionUI({
      stateName: "error",
      message: "この開き方ではマイクを使えません。Chromeで localhost から開いてください。",
      steps: [
        "ターミナルで `cd /Users/norisueharuma/Documents/codexお試し` を実行します。",
        "`python3 -m http.server 4173` を実行します。",
        "Chromeで `http://localhost:4173/` を開き直します。",
      ],
      showRetry: true,
      retryLabel: "開き直した後に再試行",
    });
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setPermissionUI({
      stateName: "error",
      message: "このブラウザではマイク取得APIが使えません。Chromeで開いてください。",
      steps: [
        "Google Chrome を使って `http://localhost:4173/` を開きます。",
        "アドレスバー左のサイト設定でマイクを許可します。",
      ],
      showRetry: true,
    });
    micStatus.textContent = "UNSUPPORTED";
    return;
  }

  try {
    state.requestingAudio = true;
    state.permissionDenied = false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      setPermissionUI({
        stateName: "error",
        message: "このブラウザではWeb Audio APIが不足しています。Chromeで開いてください。",
        steps: [
          "Google Chrome を使って `http://localhost:4173/` を開きます。",
          "ページを再読み込みして、マイクを許可します。",
        ],
        showRetry: true,
      });
      micStatus.textContent = "UNSUPPORTED";
      return;
    }

    setPermissionUI({
      stateName: "warning",
      message: "マイク許可を確認中です。Chromeの許可ダイアログが出たら「許可」を押してください。",
      steps: [
        "アドレスバー付近にマイク許可のダイアログが出ていないか確認します。",
        "出ていたら「許可」を押します。",
      ],
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.78;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    state.audioContext = audioContext;
    state.stream = stream;
    state.analyser = analyser;
    state.freqData = new Uint8Array(analyser.frequencyBinCount);
    state.prevFreqData = new Uint8Array(analyser.frequencyBinCount);
    state.timeData = new Uint8Array(analyser.fftSize);
    state.audioReady = true;

    if (audioContext.state === "suspended") {
      const resume = () => {
        audioContext.resume();
      };
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
      setPermissionUI({
        stateName: "warning",
        message: "マイクは接続済みです。解析が止まっている場合は、ページを1回クリックしてください。",
      });
    } else {
      setPermissionUI({
        stateName: "info",
        message: "マイク解析が有効です。音が入ると背景、レーザー、ミラーボールがさらに暴れます。",
      });
    }
  } catch (error) {
    state.permissionDenied = true;
    const errorName = error?.name || "UnknownError";

    if (errorName === "NotAllowedError" || errorName === "SecurityError") {
      setPermissionUI({
        stateName: "error",
        message: "マイクが許可されていません。ChromeかmacOSの設定で許可してください。",
        steps: [
          "Chromeのアドレスバー左のサイト設定を開いて、マイクを「許可」にします。",
          "Macの「システム設定 > プライバシーとセキュリティ > マイク」で Chrome をオンにします。",
          "設定変更後にこのページを再読み込みするか、下のボタンで再試行します。",
        ],
        showRetry: true,
      });
    } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
      setPermissionUI({
        stateName: "error",
        message: "使えるマイクが見つかりません。",
        steps: [
          "Macにマイクが接続されているか確認します。",
          "macOSのサウンド設定で入力デバイスが正しいか確認します。",
          "接続後に下のボタンで再試行します。",
        ],
        showRetry: true,
      });
    } else if (errorName === "NotReadableError" || errorName === "TrackStartError") {
      setPermissionUI({
        stateName: "error",
        message: "マイクはありますが、他のアプリが使用中で読めません。",
        steps: [
          "Zoom、Discord、録音アプリなどマイクを使っているアプリを閉じます。",
          "その後に下のボタンで再試行します。",
        ],
        showRetry: true,
      });
    } else {
      setPermissionUI({
        stateName: "error",
        message: `マイク初期化に失敗しました。原因: ${errorName}`,
        steps: [
          "Chromeで `http://localhost:4173/` を開いているか確認します。",
          "アドレスバー左のサイト設定でマイクが「許可」になっているか確認します。",
          "必要ならページを再読み込みして再試行します。",
        ],
        showRetry: true,
      });
    }

    console.error("Microphone setup failed:", error);
  } finally {
    state.requestingAudio = false;
  }
}

function bindVisibilityHandling() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.audioContext?.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }
  });
}

function updateMirrorballDecor() {
  mirrorball.style.transform = `scale(${1 + state.bassPulse * 0.08 + state.peak * 0.06})`;
}

function boot() {
  resize();
  draw();
  bindVisibilityHandling();
  setupAudio();

  const mirrorLoop = () => {
    updateMirrorballDecor();
    requestAnimationFrame(mirrorLoop);
  };

  requestAnimationFrame(tick);
  requestAnimationFrame(mirrorLoop);
}

window.addEventListener("resize", resize);
window.addEventListener("load", boot, { once: true });
retryMicButton.addEventListener("click", () => {
  setupAudio();
});
