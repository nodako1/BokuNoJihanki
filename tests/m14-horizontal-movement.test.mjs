import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHorizontalMovement, resetHorizontalMovement } from '../src/game/navigation/horizontalMovement.mjs';

const CONFIG = { maxSpeed: 150, acceleration: 820, deceleration: 1180, maxSubstep: 4 };
const BOUNDS = { minX: 0, maxX: 2000 };

function state(overrides = {}) {
  return { x: 1000, velocityX: 0, facing: 'down', ...overrides };
}

test('left input decreases x', () => {
  const result = resolveHorizontalMovement(
    state(),
    { left: true, right: false, deltaSeconds: 0.5 },
    CONFIG,
    BOUNDS,
  );
  assert.ok(result.x < 1000, `expected x to decrease, got ${result.x}`);
  assert.ok(result.velocityX < 0);
});

test('right input increases x', () => {
  const result = resolveHorizontalMovement(
    state(),
    { left: false, right: true, deltaSeconds: 0.5 },
    CONFIG,
    BOUNDS,
  );
  assert.ok(result.x > 1000, `expected x to increase, got ${result.x}`);
  assert.ok(result.velocityX > 0);
});

test('no input decelerates an existing velocity toward zero', () => {
  const moving = state({ velocityX: 150 });
  const result = resolveHorizontalMovement(
    moving,
    { left: false, right: false, deltaSeconds: 0.05 },
    CONFIG,
    BOUNDS,
  );
  assert.ok(result.velocityX < 150 && result.velocityX >= 0, `expected velocity to decay, got ${result.velocityX}`);
  assert.ok(result.x > moving.x, 'should still coast forward while decelerating');

  // Enough time for a full stop from max speed: v/decel = 150/1180 ~= 0.127s
  const stopped = resolveHorizontalMovement(moving, { left: false, right: false, deltaSeconds: 1 }, CONFIG, BOUNDS);
  assert.equal(stopped.velocityX, 0);
  assert.equal(stopped.moving, false);
});

test('simultaneous left+right input produces no unintended movement', () => {
  const result = resolveHorizontalMovement(
    state({ velocityX: 0 }),
    { left: true, right: true, deltaSeconds: 0.5 },
    CONFIG,
    BOUNDS,
  );
  assert.equal(result.x, 1000);
  assert.equal(result.velocityX, 0);
  assert.equal(result.moving, false);
});

test('movement never exceeds the area bounds', () => {
  const nearRightEdge = state({ x: 1995, velocityX: 150 });
  const result = resolveHorizontalMovement(
    nearRightEdge,
    { left: false, right: true, deltaSeconds: 1 },
    CONFIG,
    BOUNDS,
  );
  assert.ok(result.x <= BOUNDS.maxX);
  assert.equal(result.x, BOUNDS.maxX);
  assert.equal(result.reachedRightEdge, true);
  assert.equal(result.blocked, true);

  const nearLeftEdge = state({ x: 5, velocityX: -150 });
  const leftResult = resolveHorizontalMovement(
    nearLeftEdge,
    { left: true, right: false, deltaSeconds: 1 },
    CONFIG,
    BOUNDS,
  );
  assert.ok(leftResult.x >= BOUNDS.minX);
  assert.equal(leftResult.x, BOUNDS.minX);
  assert.equal(leftResult.reachedLeftEdge, true);
});

test('movement does not cross an obstacle range', () => {
  const bounds = { ...BOUNDS, obstacles: [{ minX: 1100, maxX: 1150 }] };
  const approaching = state({ x: 1050, velocityX: 150 });
  const result = resolveHorizontalMovement(
    approaching,
    { left: false, right: true, deltaSeconds: 1 },
    CONFIG,
    bounds,
  );
  assert.ok(result.x <= 1100, `expected to stop at the obstacle, got ${result.x}`);
  assert.equal(result.blocked, true);
});

test('a large delta cannot tunnel through a thin obstacle', () => {
  const bounds = { ...BOUNDS, obstacles: [{ minX: 1100, maxX: 1104 }] };
  const approaching = state({ x: 1090, velocityX: 150 });
  // A huge delta would, without sub-stepping, jump straight over the 4px obstacle.
  const result = resolveHorizontalMovement(
    approaching,
    { left: false, right: true, deltaSeconds: 5 },
    CONFIG,
    bounds,
  );
  assert.ok(result.x <= 1100, `expected the sub-stepped move to stop at the obstacle, got ${result.x}`);
});

test('input is ignored while locked, and position does not change', () => {
  const moving = state({ x: 1000, velocityX: 150 });
  const result = resolveHorizontalMovement(
    moving,
    { left: false, right: true, deltaSeconds: 1, locked: true },
    CONFIG,
    BOUNDS,
  );
  assert.equal(result.x, 1000);
  assert.equal(result.velocityX, 0);
  assert.equal(result.moving, false);
});

test('moving is false whenever x does not actually change', () => {
  const stuckAtEdge = state({ x: BOUNDS.maxX, velocityX: 150 });
  const result = resolveHorizontalMovement(
    stuckAtEdge,
    { left: false, right: true, deltaSeconds: 1 },
    CONFIG,
    BOUNDS,
  );
  assert.equal(result.x, BOUNDS.maxX);
  assert.equal(result.moving, false);
});

test('facing updates with effective direction and holds while coasting to a stop', () => {
  const right = resolveHorizontalMovement(
    state({ facing: 'down' }),
    { left: false, right: true, deltaSeconds: 0.2 },
    CONFIG,
    BOUNDS,
  );
  assert.equal(right.facing, 'right');

  const thenReleased = resolveHorizontalMovement(
    right,
    { left: false, right: false, deltaSeconds: 0.05 },
    CONFIG,
    BOUNDS,
  );
  assert.equal(thenReleased.facing, 'right', 'facing should not change just from releasing input');

  const left = resolveHorizontalMovement(
    state({ facing: 'right' }),
    { left: true, right: false, deltaSeconds: 0.2 },
    CONFIG,
    BOUNDS,
  );
  assert.equal(left.facing, 'left');
});

test('resetHorizontalMovement zeroes velocity without moving x or changing facing', () => {
  const moving = state({ x: 1234, velocityX: 150, facing: 'right' });
  const reset = resetHorizontalMovement(moving);
  assert.equal(reset.velocityX, 0);
  assert.equal(reset.x, 1234);
  assert.equal(reset.facing, 'right');
});

test('result is frame-rate independent: 30fps and 60fps steps agree over the same time span', () => {
  // Same total elapsed time (0.1s) covered by a different number of steps.
  // Kept short enough that velocity never saturates at maxSpeed mid-step,
  // which isolates frame-rate independence from single-step clamping.
  let at60fps = state();
  for (let i = 0; i < 6; i += 1) {
    at60fps = resolveHorizontalMovement(at60fps, { left: false, right: true, deltaSeconds: 1 / 60 }, CONFIG, BOUNDS);
  }

  let at30fps = state();
  for (let i = 0; i < 3; i += 1) {
    at30fps = resolveHorizontalMovement(at30fps, { left: false, right: true, deltaSeconds: 1 / 30 }, CONFIG, BOUNDS);
  }

  // Semi-implicit Euler integration means different step sizes never match
  // to the last decimal during the acceleration ramp - this checks the two
  // frame rates stay in close agreement rather than diverging.
  assert.ok(
    Math.abs(at60fps.x - at30fps.x) < 1.5,
    `expected similar results across frame rates, got ${at60fps.x} (60fps) vs ${at30fps.x} (30fps)`,
  );
  assert.ok(Math.abs(at60fps.velocityX - at30fps.velocityX) < 3);
});

test('a single very large delta does not explode: it clamps to max speed and respects bounds', () => {
  const result = resolveHorizontalMovement(state(), { left: false, right: true, deltaSeconds: 5 }, CONFIG, BOUNDS);
  assert.equal(result.velocityX, CONFIG.maxSpeed);
  assert.ok(result.x <= BOUNDS.maxX);
  assert.ok(Number.isFinite(result.x));
});
