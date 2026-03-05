(function (global) {
  "use strict";

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const OPPOSITE = {
    up: "down",
    down: "up",
    left: "right",
    right: "left",
  };

  function createInitialState(options) {
    const size = options.size;
    const mid = Math.floor(size / 2);
    const snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];

    const state = {
      size,
      snake,
      direction: "right",
      nextDirection: "right",
      food: { x: 0, y: 0 },
      score: 0,
      over: false,
      paused: true,
      rng: options.rng,
    };

    state.food = spawnFood(state);
    return state;
  }

  function cloneState(state) {
    return {
      size: state.size,
      snake: state.snake.map((seg) => ({ x: seg.x, y: seg.y })),
      direction: state.direction,
      nextDirection: state.nextDirection,
      food: { x: state.food.x, y: state.food.y },
      score: state.score,
      over: state.over,
      paused: state.paused,
      rng: state.rng,
    };
  }

  function setDirection(state, dir) {
    if (!DIRS[dir]) return state;
    if (OPPOSITE[dir] === state.direction) return state;
    state.nextDirection = dir;
    return state;
  }

  function tick(state) {
    if (state.over || state.paused) return state;
    state.direction = state.nextDirection;

    const head = state.snake[0];
    const delta = DIRS[state.direction];
    const next = { x: head.x + delta.x, y: head.y + delta.y };

    if (next.x < 0 || next.x >= state.size || next.y < 0 || next.y >= state.size) {
      state.over = true;
      return state;
    }

    const hitSelf = state.snake.some((seg) => seg.x === next.x && seg.y === next.y);
    if (hitSelf) {
      state.over = true;
      return state;
    }

    state.snake.unshift(next);

    if (next.x === state.food.x && next.y === state.food.y) {
      state.score += 10;
      state.food = spawnFood(state);
    } else {
      state.snake.pop();
    }

    return state;
  }

  function spawnFood(state) {
    const occupied = new Set(state.snake.map((seg) => `${seg.x},${seg.y}`));
    const size = state.size;
    const total = size * size - state.snake.length;
    if (total <= 0) return { x: 0, y: 0 };

    const pick = Math.floor(state.rng() * total);
    let count = 0;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (occupied.has(`${x},${y}`)) continue;
        if (count === pick) return { x, y };
        count += 1;
      }
    }

    return { x: 0, y: 0 };
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  const api = {
    DIRS,
    createInitialState,
    cloneState,
    setDirection,
    tick,
    spawnFood,
    mulberry32,
  };

  global.SnakeLogic = api;
})(window);
