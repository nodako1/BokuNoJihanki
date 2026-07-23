import { clamp, approach, chooseFacing } from '../systems/walkableMovement.mjs';

/**
 * @typedef {import('./horizontalMovement.d.mts').HorizontalMovementState} HorizontalMovementState
 * @typedef {import('./horizontalMovement.d.mts').HorizontalMovementInput} HorizontalMovementInput
 * @typedef {import('./horizontalMovement.d.mts').HorizontalMovementConfig} HorizontalMovementConfig
 * @typedef {import('./horizontalMovement.d.mts').HorizontalMovementBounds} HorizontalMovementBounds
 * @typedef {import('./horizontalMovement.d.mts').HorizontalMovementResult} HorizontalMovementResult
 */

const DEFAULT_MAX_SUBSTEP = 4;

/**
 * Blocks forward progress at the nearest edge of any obstacle range that
 * `fromX -> toX` would enter from outside. Returns the clamped x, or `toX`
 * unchanged if no obstacle blocks this substep.
 *
 * @param {number} fromX
 * @param {number} toX
 * @param {readonly import('./horizontalMovement.d.mts').HorizontalObstacleRange[]} obstacles
 * @returns {{ x: number, blocked: boolean }}
 */
function applyObstacles(fromX, toX, obstacles) {
  if (!obstacles || obstacles.length === 0) return { x: toX, blocked: false };

  let resultX = toX;
  let blocked = false;

  for (const obstacle of obstacles) {
    // Inclusive on purpose: a position resting exactly on the obstacle's edge
    // (where the previous frame stopped it) must still count as "outside",
    // otherwise the next frame's entering-check is skipped and the same
    // direction input walks straight through the obstacle.
    const wasOutside = fromX <= obstacle.minX || fromX >= obstacle.maxX;
    if (!wasOutside) continue;
    const entersFromLeft = fromX <= obstacle.minX && resultX > obstacle.minX;
    const entersFromRight = fromX >= obstacle.maxX && resultX < obstacle.maxX;
    if (entersFromLeft) {
      resultX = Math.min(resultX, obstacle.minX);
      blocked = true;
    } else if (entersFromRight) {
      resultX = Math.max(resultX, obstacle.maxX);
      blocked = true;
    }
  }

  return { x: resultX, blocked };
}

/**
 * Resolves one frame of left/right-only movement. See horizontalMovement.d.mts
 * for the full contract. Uses `chooseFacing`'s sibling helpers `clamp` /
 * `approach` from ../systems/walkableMovement.mjs rather than reimplementing
 * them.
 *
 * @param {HorizontalMovementState} state
 * @param {HorizontalMovementInput} input
 * @param {HorizontalMovementConfig} config
 * @param {HorizontalMovementBounds} bounds
 * @returns {HorizontalMovementResult}
 */
export function resolveHorizontalMovement(state, input, config, bounds) {
  const deltaSeconds = Math.max(0, input.deltaSeconds ?? 0);

  if (input.locked) {
    return {
      x: state.x,
      velocityX: 0,
      facing: state.facing,
      moving: false,
      blocked: false,
      reachedLeftEdge: state.x <= bounds.minX,
      reachedRightEdge: state.x >= bounds.maxX,
    };
  }

  // `horizontalAxis` is an optional analog override (e.g. a phone's virtual
  // stick) in [-1, 1] - named to match the adapter's existing
  // M14DirectionalInput.horizontalAxis convention. When present it takes
  // priority over the digital left/right booleans so a soft push yields a
  // proportionally lower target speed instead of always snapping to
  // maxSpeed. Omitting it (or passing a non-finite value) falls back to the
  // original digital behavior untouched.
  const hasAxis = Number.isFinite(input.horizontalAxis);
  const axisValue = hasAxis ? clamp(input.horizontalAxis, -1, 1) : 0;

  const effectiveLeft = hasAxis ? axisValue < 0 : Boolean(input.left) && !input.right;
  const effectiveRight = hasAxis ? axisValue > 0 : Boolean(input.right) && !input.left;

  const targetVelocity = hasAxis
    ? axisValue * config.maxSpeed
    : effectiveRight
      ? config.maxSpeed
      : effectiveLeft
        ? -config.maxSpeed
        : 0;
  const rate = targetVelocity === 0 ? config.deceleration : config.acceleration;
  const velocityX = clamp(
    approach(state.velocityX, targetVelocity, Math.max(0, rate) * deltaSeconds),
    -config.maxSpeed,
    config.maxSpeed,
  );

  const totalDelta = velocityX * deltaSeconds;
  const maxSubstep = Math.max(1, config.maxSubstep ?? DEFAULT_MAX_SUBSTEP);
  const steps = Math.max(1, Math.ceil(Math.abs(totalDelta) / maxSubstep));
  const stepDelta = totalDelta / steps;

  let x = state.x;
  let blocked = false;
  let stoppedEarly = false;

  for (let index = 0; index < steps && !stoppedEarly; index += 1) {
    let nextX = x + stepDelta;

    if (nextX <= bounds.minX) {
      nextX = bounds.minX;
      blocked = blocked || x > bounds.minX || stepDelta < 0;
      stoppedEarly = true;
    } else if (nextX >= bounds.maxX) {
      nextX = bounds.maxX;
      blocked = blocked || x < bounds.maxX || stepDelta > 0;
      stoppedEarly = true;
    }

    const afterObstacles = applyObstacles(x, nextX, bounds.obstacles);
    if (afterObstacles.blocked) {
      blocked = true;
      stoppedEarly = true;
    }
    x = afterObstacles.x;
  }

  const reachedLeftEdge = x <= bounds.minX;
  const reachedRightEdge = x >= bounds.maxX;
  const finalVelocity = blocked ? 0 : velocityX;
  const moving = x !== state.x;
  const facing = effectiveLeft ? 'left' : effectiveRight ? 'right' : state.facing;

  return { x, velocityX: finalVelocity, facing, moving, blocked, reachedLeftEdge, reachedRightEdge };
}

/**
 * @param {HorizontalMovementState} state
 * @returns {HorizontalMovementState}
 */
export function resetHorizontalMovement(state) {
  return { ...state, velocityX: 0 };
}
