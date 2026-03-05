(function () {
  "use strict";

  const {
    createInitialState,
    cloneState,
    setDirection,
    tick,
    mulberry32,
  } = window.SnakeLogic;

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");
  const restartBtn = document.getElementById("restart");
  const pauseBtn = document.getElementById("pause");
  const controlButtons = document.querySelectorAll(".ctrl");

  const size = 20;
  const cell = canvas.width / size;
  const bestKey = "snake-best-score";

  let state = createInitialState({
    size,
    rng: mulberry32(Date.now() % 100000),
  });

  let lastTime = 0;
  let accumulator = 0;
  const tickMs = 120;

  const best = Number(localStorage.getItem(bestKey) || "0");
  bestEl.textContent = String(best);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e6dfd4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#d64c1c";
    ctx.fillRect(state.food.x * cell, state.food.y * cell, cell, cell);

    ctx.fillStyle = "#2c241c";
    state.snake.forEach((seg, idx) => {
      const inset = idx === 0 ? 0 : 2;
      ctx.fillRect(
        seg.x * cell + inset,
        seg.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2
      );
    });
  }

  function updateScore() {
    scoreEl.textContent = String(state.score);
    const best = Number(localStorage.getItem(bestKey) || "0");
    if (state.score > best) {
      localStorage.setItem(bestKey, String(state.score));
      bestEl.textContent = String(state.score);
    }
  }

  function setOverlay(text, show) {
    overlayText.textContent = text;
    overlay.classList.toggle("show", show);
  }

  function step(delta) {
    accumulator += delta;
    while (accumulator >= tickMs) {
      state = tick(state);
      updateScore();
      accumulator -= tickMs;
      if (state.over) break;
    }
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const delta = ts - lastTime;
    lastTime = ts;

    if (!state.over && !state.paused) {
      step(delta);
    }

    draw();

    if (state.over) {
      setOverlay("Game over. Press R to restart.", true);
    } else if (state.paused) {
      setOverlay("Paused. Press Space to start.", true);
    } else {
      setOverlay("", false);
    }

    requestAnimationFrame(loop);
  }

  function reset() {
    const best = Number(localStorage.getItem(bestKey) || "0");
    bestEl.textContent = String(best);
    state = createInitialState({
      size,
      rng: mulberry32(Date.now() % 100000),
    });
    updateScore();
    setOverlay("Press Space to start", true);
  }

  function handleInput(dir) {
    state = setDirection(state, dir);
    if (state.paused && !state.over) {
      state.paused = false;
    }
  }

  function handleKey(event) {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
    }

    if (key === "arrowup" || key === "w") handleInput("up");
    if (key === "arrowdown" || key === "s") handleInput("down");
    if (key === "arrowleft" || key === "a") handleInput("left");
    if (key === "arrowright" || key === "d") handleInput("right");

    if (key === " ") {
      event.preventDefault();
      if (state.over) return;
      state.paused = !state.paused;
    }

    if (key === "r") {
      reset();
    }
  }

  function togglePause() {
    if (state.over) return;
    state.paused = !state.paused;
  }

  document.addEventListener("keydown", handleKey);
  restartBtn.addEventListener("click", reset);
  pauseBtn.addEventListener("click", togglePause);

  controlButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleInput(button.dataset.dir);
    });
  });

  reset();
  requestAnimationFrame(loop);
})();
