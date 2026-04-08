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

const DPR_LIMIT = 1.8;
const BEAM_COUNT = 56;
const PARTICLE_COUNT = 170;
const ORB_COUNT = 18;

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  time: 0,
  lastFrame: performance.now(),
  paletteHue: 190,
  flash: 0.2,
  bloom: 0.5,
  audioReady: false,
  permissionDenied: false,
  analyser: null,
  audioContext: null,
  stream: null,
  freqData: null,
  timeData: null,
  requestingAudio: false,
  volume: 0,
  smoothedVolume: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  energy: 0.18,
  targetEnergy: 0.18,
  randomEnergy: 0.3,
  bassPulse: 0,
  chaos: Math.random() * Math.PI * 2,
};

const beams = Array.from({ length: BEAM_COUNT }, () => createBeam());
const particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle());
const orbs = Array.from({ length: ORB_COUNT }, (_, index) => createOrb(index));

function createBeam() {
  return {
    side: Math.random() > 0.5 ? 1 : -1,
    depth: 0.25 + Math.random() * 1.25,
    baseAngle: (-0.55 + Math.random() * 1.1) * Math.PI,
    sweep: 0.4 + Math.random() * 1.8,
    speed: 0.5 + Math.random() * 2.4,
    width: 1.5 + Math.random() * 4,
    brightness: 0.4 + Math.random() * 0.8,
    hueOffset: Math.random() * 160 - 80,
    life: Math.random() * Math.PI * 2,
    length: 0.6 + Math.random() * 1.15,
  };
}

function createParticle() {
  return {
    x: Math.random(),
    y: Math.random(),
    z: 0.2 + Math.random() * 1.2,
    radius: 0.8 + Math.random() * 2.8,
    speed: 0.2 + Math.random() * 1.4,
    drift: -0.25 + Math.random() * 0.5,
    hueOffset: Math.random() * 220 - 110,
  };
}

function createOrb(index) {
  const spread = index / ORB_COUNT;
  return {
    x: spread,
    y: Math.random() * 0.45 + 0.08,
    radius: 70 + Math.random() * 160,
    phase: Math.random() * Math.PI * 2,
    speed: 0.25 + Math.random() * 0.5,
    hueOffset: Math.random() * 180 - 90,
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

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function updateFallbackEnergy(delta) {
  state.randomEnergy += rand(-1, 1) * delta * 0.65;
  state.randomEnergy = clamp(state.randomEnergy, 0.18, 0.68);

  if (Math.random() < 0.028 + state.smoothedVolume * 0.14) {
    state.randomEnergy = clamp(state.randomEnergy + rand(0.08, 0.25), 0.18, 0.92);
  }
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

function updateAudioMetrics() {
  if (!state.analyser || !state.freqData || !state.timeData) {
    state.volume = 0;
    state.bass = 0;
    state.mid = 0;
    state.treble = 0;
    return;
  }

  state.analyser.getByteFrequencyData(state.freqData);
  state.analyser.getByteTimeDomainData(state.timeData);

  let rms = 0;
  for (let i = 0; i < state.timeData.length; i += 1) {
    const centered = (state.timeData[i] - 128) / 128;
    rms += centered * centered;
  }

  state.volume = Math.sqrt(rms / state.timeData.length);
  state.bass = sampleBand(state.freqData, 0.0, 0.08);
  state.mid = sampleBand(state.freqData, 0.08, 0.28);
  state.treble = sampleBand(state.freqData, 0.28, 0.82);
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

  state.smoothedVolume = lerp(state.smoothedVolume, state.volume, 0.17);
  const audioImpact =
    state.smoothedVolume * 2.8 + state.bass * 0.95 + state.mid * 0.55 + state.treble * 0.45;

  state.targetEnergy = clamp(
    state.randomEnergy * 0.7 + audioImpact * 0.95,
    0.14,
    1.22
  );
  state.energy = lerp(state.energy, state.targetEnergy, 0.08);
  state.bassPulse = lerp(state.bassPulse, state.bass, 0.12);

  const audioWeightedHue =
    18 +
    state.bass * 36 +
    state.mid * 146 +
    state.treble * 250 +
    Math.sin(state.time * 0.55 + state.chaos) * 22;
  const randomHueDrift = Math.sin(state.time * 0.19) * 40 + Math.cos(state.time * 0.07) * 65;

  state.paletteHue = (audioWeightedHue + randomHueDrift + 360) % 360;
  state.flash = clamp(0.18 + state.energy * 0.72 + state.bassPulse * 0.28, 0.16, 1);
  state.bloom = clamp(0.35 + state.energy * 0.9 + state.treble * 0.35, 0.25, 1.28);

  document.documentElement.style.setProperty("--laser-hue", state.paletteHue.toFixed(1));
  document.documentElement.style.setProperty(
    "--mirror-hue",
    ((state.paletteHue + 42 + state.treble * 72) % 360).toFixed(1)
  );
  document.documentElement.style.setProperty("--flash", state.flash.toFixed(3));
  document.documentElement.style.setProperty(
    "--glow-alpha",
    clamp(0.45 + state.energy * 0.62, 0.4, 1).toFixed(3)
  );
  document.documentElement.style.setProperty(
    "--spin-duration",
    `${clamp(7.2 - state.energy * 4.6 - state.treble * 1.3, 1.6, 7.2).toFixed(2)}s`
  );
  document.documentElement.style.setProperty(
    "--pulse-scale",
    (1 + state.bassPulse * 0.16 + state.energy * 0.05).toFixed(3)
  );
  document.documentElement.style.setProperty(
    "--status-glow",
    `hsla(${(state.paletteHue + 40) % 360} 100% 65% / ${clamp(0.24 + state.energy * 0.4, 0.2, 0.7).toFixed(3)})`
  );

  if (state.permissionDenied) {
    micStatus.textContent = "DENIED";
  } else if (state.audioReady) {
    micStatus.textContent = "LIVE";
  } else {
    micStatus.textContent = "WAITING";
  }

  if (state.energy > 0.9) {
    intensityStatus.textContent = "OVERDRIVE";
  } else if (state.energy > 0.58) {
    intensityStatus.textContent = "RAVE PEAK";
  } else if (state.energy > 0.34) {
    intensityStatus.textContent = "CLUB FLOW";
  } else {
    intensityStatus.textContent = "IDLE FLASH";
  }
}

function drawBackground() {
  const width = state.width;
  const height = state.height;
  const horizonY = height * 0.62;

  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);

  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, `hsla(${(state.paletteHue + 42) % 360} 88% 10% / 1)`);
  bgGradient.addColorStop(0.42, `hsla(${(state.paletteHue + 152) % 360} 86% 6% / 1)`);
  bgGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  const centerGradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.46,
    0,
    width * 0.5,
    height * 0.46,
    Math.max(width, height) * 0.8
  );
  centerGradient.addColorStop(0, `hsla(${(state.paletteHue + 15) % 360} 100% 65% / ${0.1 + state.flash * 0.22})`);
  centerGradient.addColorStop(0.4, `hsla(${(state.paletteHue + 180) % 360} 100% 55% / ${0.06 + state.energy * 0.12})`);
  centerGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = centerGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width * 0.5, horizonY);
  for (let i = 0; i < 14; i += 1) {
    const alpha = 0.04 + i * 0.005 + state.energy * 0.018;
    const radius = width * (0.09 + i * 0.08 + state.energy * 0.02);
    ctx.beginPath();
    ctx.strokeStyle = `hsla(${(state.paletteHue + i * 18) % 360} 100% 62% / ${alpha})`;
    ctx.lineWidth = 1 + i * 0.22;
    ctx.ellipse(0, 0, radius, radius * 0.22, 0, 0, Math.PI, true);
    ctx.stroke();
  }
  ctx.restore();

  const floorGradient = ctx.createLinearGradient(0, horizonY, 0, height);
  floorGradient.addColorStop(0, `rgba(255, 255, 255, ${0.03 + state.energy * 0.06})`);
  floorGradient.addColorStop(1, "rgba(0, 0, 0, 0.7)");
  ctx.fillStyle = floorGradient;
  ctx.fillRect(0, horizonY, width, height - horizonY);
}

function drawOrbs() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const orb of orbs) {
    const wobble = Math.sin(state.time * orb.speed + orb.phase);
    const x = widthLerp(0.08, 0.92, orb.x + wobble * 0.015);
    const y = state.height * orb.y + Math.cos(state.time * orb.speed * 1.4 + orb.phase) * 40;
    const radius = orb.radius * (0.85 + state.energy * 0.28 + state.treble * 0.18);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `hsla(${(state.paletteHue + orb.hueOffset) % 360} 100% 70% / ${0.16 + state.energy * 0.05})`);
    gradient.addColorStop(0.45, `hsla(${(state.paletteHue + orb.hueOffset + 45) % 360} 100% 58% / ${0.08 + state.energy * 0.04})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function widthLerp(startRatio, endRatio, t) {
  return lerp(state.width * startRatio, state.width * endRatio, t);
}

function drawLasers() {
  const originX = state.width / 2;
  const originY = 140;
  const stageY = state.height * 0.66;
  const activeBeamCount = Math.floor(lerp(BEAM_COUNT * 0.42, BEAM_COUNT, clamp(state.energy, 0, 1)));

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let index = 0; index < activeBeamCount; index += 1) {
    const beam = beams[index];
    beam.life += (0.55 + state.energy * 1.8) * beam.speed * 0.016;

    const sweep =
      Math.sin(beam.life * beam.sweep + state.chaos) * (0.22 + state.energy * 0.42) +
      Math.cos(beam.life * 0.55) * 0.16;
    const perspective = 1 / beam.depth;
    const targetX =
      originX +
      beam.side * (state.width * (0.12 + perspective * 0.12)) +
      sweep * state.width * (0.22 + perspective * 0.18);
    const targetY =
      stageY +
      Math.sin(beam.life * 0.75 + beam.depth) * state.height * 0.22 -
      perspective * state.height * 0.18;

    const lineWidth =
      beam.width * (0.75 + state.energy * 1.65 + state.treble * 0.4) * perspective;
    const alpha = clamp(0.18 + beam.brightness * 0.3 + state.energy * 0.42, 0.12, 0.85);
    const hue = (state.paletteHue + beam.hueOffset + Math.sin(beam.life) * 32 + 360) % 360;

    ctx.strokeStyle = `hsla(${hue} 100% ${60 + state.flash * 18}% / ${alpha})`;
    ctx.lineWidth = lineWidth;
    ctx.shadowBlur = 18 + state.bloom * 36;
    ctx.shadowColor = `hsla(${(hue + 8) % 360} 100% 62% / ${alpha})`;

    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();

    ctx.lineWidth = Math.max(1, lineWidth * 0.28);
    ctx.strokeStyle = `hsla(${(hue + 55) % 360} 100% 86% / ${alpha * 0.9})`;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(
      lerp(originX, targetX, beam.length),
      lerp(originY, targetY, beam.length)
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawParticles(delta) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const particle of particles) {
    particle.y -= delta * (0.02 + particle.speed * (0.04 + state.energy * 0.09)) / particle.z;
    particle.x += delta * particle.drift * (0.008 + state.energy * 0.016);

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
    const radius = particle.radius * (0.6 + state.energy * 1.7) / particle.z;
    const alpha = clamp(0.08 + state.energy * 0.18 + (1 / particle.z) * 0.05, 0.04, 0.34);

    ctx.fillStyle = `hsla(${(state.paletteHue + particle.hueOffset) % 360} 100% 70% / ${alpha})`;
    ctx.shadowBlur = 18 + state.bloom * 18;
    ctx.shadowColor = `hsla(${(state.paletteHue + particle.hueOffset + 16) % 360} 100% 75% / ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFlashOverlay() {
  const flashAlpha = clamp(state.flash * 0.08 + state.bassPulse * 0.14, 0.04, 0.26);
  ctx.fillStyle = `hsla(${(state.paletteHue + 20) % 360} 100% 88% / ${flashAlpha})`;
  ctx.fillRect(0, 0, state.width, state.height);

  if (state.energy > 0.72 && Math.random() < 0.18) {
    ctx.fillStyle = `hsla(${(state.paletteHue + 180) % 360} 100% 85% / ${0.08 + state.energy * 0.08})`;
    ctx.fillRect(0, 0, state.width, state.height);
  }
}

function draw() {
  drawBackground();
  drawOrbs();
  drawLasers();
  drawParticles(1);
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
  drawLasers();
  drawParticles(delta);
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
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.76;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    state.audioContext = audioContext;
    state.stream = stream;
    state.analyser = analyser;
    state.freqData = new Uint8Array(analyser.frequencyBinCount);
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
  mirrorball.style.transform = `scale(${1 + state.bassPulse * 0.08 + state.energy * 0.04})`;
}

function boot() {
  resize();
  updateEnergy(1);
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
