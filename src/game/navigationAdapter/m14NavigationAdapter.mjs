import {
  M14_AREA_DEFINITIONS,
  M14_AREA_IDS,
  M14_INITIAL_LOCATION,
  getM14AreaDefinition,
  getM14SpawnPoint,
} from '../areas/m14AreaData.mjs';

const EXIT_PROPERTY_BY_DIRECTION = Object.freeze({
  left: 'leftExit',
  right: 'rightExit',
  up: 'upExit',
  down: 'downExit',
});

const OPPOSITE_DIRECTION = Object.freeze({
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
});

export const HORIZONTAL_MOTION_CONFIG = Object.freeze({
  maxSpeed: 175,
  acceleration: 850,
  deceleration: 1150,
  stopEpsilon: 0.01,
});

export const M14_TRANSITION_PHASES = Object.freeze([
  'idle',
  'fading-out',
  'loading',
  'fading-in',
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function approach(current, target, maxDelta) {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function getMotionConfig(config) {
  const maxSpeed = finiteOr(config?.maxSpeed, HORIZONTAL_MOTION_CONFIG.maxSpeed);
  const acceleration = finiteOr(
    config?.acceleration,
    HORIZONTAL_MOTION_CONFIG.acceleration,
  );
  const deceleration = finiteOr(
    config?.deceleration,
    HORIZONTAL_MOTION_CONFIG.deceleration,
  );
  const stopEpsilon = finiteOr(
    config?.stopEpsilon,
    HORIZONTAL_MOTION_CONFIG.stopEpsilon,
  );
  if (maxSpeed <= 0 || acceleration <= 0 || deceleration <= 0 || stopEpsilon < 0) {
    throw new RangeError('M1.4 horizontal motion values must be positive.');
  }
  return { maxSpeed, acceleration, deceleration, stopEpsilon };
}

function isInsideRange(x, activationRange) {
  return Boolean(
    activationRange
      && x >= activationRange.minX
      && x <= activationRange.maxX,
  );
}

function exitForDirection(area, direction) {
  const property = EXIT_PROPERTY_BY_DIRECTION[direction];
  return property ? area[property] : null;
}

function verticalDirectionFromInput(input) {
  if (!input || typeof input !== 'object') return null;
  const y = finiteOr(input.y, 0);
  const up = Boolean(input.up) || y < -0.5;
  const down = Boolean(input.down) || y > 0.5;
  if (up === down) return null;
  return up ? 'up' : 'down';
}

export function horizontalAxisFromInput(input) {
  if (typeof input === 'number') return clamp(finiteOr(input, 0), -1, 1);
  if (!input || typeof input !== 'object') return 0;
  if (Number.isFinite(input.horizontalAxis)) {
    return clamp(input.horizontalAxis, -1, 1);
  }
  if (Number.isFinite(input.x)) {
    return clamp(input.x, -1, 1);
  }
  return Number(Boolean(input.right)) - Number(Boolean(input.left));
}

export function stepHorizontalVelocity(
  velocityX,
  input,
  deltaSeconds,
  config = HORIZONTAL_MOTION_CONFIG,
) {
  const motion = getMotionConfig(config);
  const current = clamp(
    finiteOr(velocityX, 0),
    -motion.maxSpeed,
    motion.maxSpeed,
  );
  const axis = horizontalAxisFromInput(input);
  const seconds = Math.max(0, finiteOr(deltaSeconds, 0));
  const target = axis * motion.maxSpeed;
  const rate = axis === 0 ? motion.deceleration : motion.acceleration;
  const next = approach(current, target, rate * seconds);
  return Math.abs(next) <= motion.stopEpsilon ? 0 : next;
}

export function clampPlayerX(areaId, x, playerHalfWidth = 0) {
  const area = getM14AreaDefinition(areaId);
  const safeHalfWidth = clamp(
    Math.max(0, finiteOr(playerHalfWidth, 0)),
    0,
    area.worldWidth / 2,
  );
  return clamp(
    finiteOr(x, safeHalfWidth),
    safeHalfWidth,
    area.worldWidth - safeHalfWidth,
  );
}

export function stepHorizontalMovement(
  state,
  input,
  deltaSeconds,
  areaId,
  playerHalfWidth = 0,
  config = HORIZONTAL_MOTION_CONFIG,
) {
  if (
    arguments.length === 1
    && isObject(state)
    && (
      Object.hasOwn(state, 'deltaMs')
      || Object.hasOwn(state, 'worldWidth')
      || Object.hasOwn(state, 'locked')
    )
  ) {
    const worldWidth = finiteOr(state.worldWidth, 0);
    if (worldWidth <= 0) {
      throw new RangeError('M1.4 horizontal movement requires a positive worldWidth.');
    }
    const currentX = clamp(finiteOr(state.x, 0), 0, worldWidth);
    if (state.locked) {
      return {
        x: currentX,
        velocity: 0,
        moved: 0,
        blocked: false,
      };
    }
    const seconds = Math.max(0, finiteOr(state.deltaMs, 0)) / 1000;
    let nextVelocity = stepHorizontalVelocity(
      state.velocity,
      state.input,
      seconds,
      state.config ?? HORIZONTAL_MOTION_CONFIG,
    );
    const requestedX = currentX + nextVelocity * seconds;
    const nextX = clamp(requestedX, 0, worldWidth);
    const hitBoundary = Math.abs(requestedX - nextX) > 0.000001;
    if (hitBoundary) nextVelocity = 0;
    return {
      x: nextX,
      velocity: nextVelocity,
      moved: nextX - currentX,
      blocked: hitBoundary,
    };
  }

  const axis = horizontalAxisFromInput(input);
  const seconds = Math.max(0, finiteOr(deltaSeconds, 0));
  const currentX = clampPlayerX(areaId, finiteOr(state?.x, 0), playerHalfWidth);
  let velocityX = stepHorizontalVelocity(
    state?.velocityX,
    axis,
    seconds,
    config,
  );
  const requestedX = currentX + velocityX * seconds;
  const x = clampPlayerX(areaId, requestedX, playerHalfWidth);
  const blocked = Math.abs(requestedX - x) > 0.000001;
  if (blocked) velocityX = 0;
  const movedX = x - currentX;
  const facing = axis < 0
    ? 'left'
    : axis > 0
      ? 'right'
      : state?.facing === 'left'
        ? 'left'
        : 'right';

  return {
    x,
    y: getM14AreaDefinition(areaId).groundY,
    velocityX,
    movedX,
    moving: Math.abs(movedX) > 0.0001,
    blocked,
    facing,
  };
}

export function clampCameraScrollX(areaId, scrollX, viewportWidth) {
  const area = getM14AreaDefinition(areaId);
  const safeViewportWidth = clamp(
    Math.max(0, finiteOr(viewportWidth, 0)),
    0,
    area.cameraBounds.width,
  );
  const minimum = area.cameraBounds.x;
  const maximum = area.cameraBounds.x
    + area.cameraBounds.width
    - safeViewportWidth;
  return clamp(finiteOr(scrollX, minimum), minimum, maximum);
}

export function getM14CameraScrollX(
  areaId,
  playerX,
  velocityX,
  viewportWidth,
  lookAheadFactor = 0.55,
  maxLookAhead = 96,
) {
  const factor = Math.max(0, finiteOr(lookAheadFactor, 0.55));
  const limit = Math.max(0, finiteOr(maxLookAhead, 96));
  const lookAhead = clamp(finiteOr(velocityX, 0) * factor, -limit, limit);
  const desired = finiteOr(playerX, 0) + lookAhead - viewportWidth / 2;
  return clampCameraScrollX(areaId, desired, viewportWidth);
}

export function getAvailableBranchDirections(areaId, x) {
  const area = getM14AreaDefinition(areaId);
  const safeX = finiteOr(x, 0);
  return ['up', 'down'].filter((direction) => {
    const exit = exitForDirection(area, direction);
    return exit?.kind === 'connected'
      && exit.trigger === 'branch'
      && isInsideRange(safeX, exit.activationRange);
  });
}

export function isBranchAvailable(areaId, direction, x) {
  return getAvailableBranchDirections(areaId, x).includes(direction);
}

export function resolveAreaExit(areaId, direction, x, transitionState = 'idle') {
  if (isM14InputLocked(transitionState)) return null;
  const area = getM14AreaDefinition(areaId);
  const exit = exitForDirection(area, direction);
  if (
    !exit
    || exit.kind !== 'connected'
    || (Number.isFinite(x) && !isInsideRange(x, exit.activationRange))
  ) {
    return null;
  }

  const targetSpawn = getM14SpawnPoint(exit.targetAreaId, exit.targetSpawnId);
  return Object.freeze({
    exitId: exit.id,
    direction,
    sourceAreaId: areaId,
    targetAreaId: exit.targetAreaId,
    targetSpawnId: exit.targetSpawnId,
    spawnId: exit.targetSpawnId,
    targetX: targetSpawn.x,
    x: targetSpawn.x,
    targetGroundY: getM14AreaDefinition(exit.targetAreaId).groundY,
    targetFacing: targetSpawn.facing,
    facing: targetSpawn.facing,
  });
}

export function interpretM14Input(
  areaId,
  x,
  input,
  transitionState = 'idle',
) {
  const branchDirections = getAvailableBranchDirections(areaId, x);
  if (isM14InputLocked(transitionState)) {
    return {
      horizontalAxis: 0,
      branchDirections,
      requestedBranchDirection: null,
      transition: null,
      locked: true,
    };
  }

  const horizontalAxis = horizontalAxisFromInput(input);
  const requestedBranchDirection = verticalDirectionFromInput(input);
  const horizontalDirection = horizontalAxis < 0
    ? 'left'
    : horizontalAxis > 0
      ? 'right'
      : null;
  const transition = requestedBranchDirection
    ? resolveAreaExit(areaId, requestedBranchDirection, x)
    : horizontalDirection
      ? resolveAreaExit(areaId, horizontalDirection, x)
      : null;

  return {
    horizontalAxis,
    branchDirections,
    requestedBranchDirection,
    transition,
    locked: false,
  };
}

export function nextM14TransitionPhase(phase, event) {
  if (event === 'reset') return 'idle';
  if (phase === 'idle' && event === 'start') return 'fading-out';
  if (phase === 'fading-out' && event === 'fade-out-complete') return 'loading';
  if (phase === 'loading' && event === 'scene-ready') return 'fading-in';
  if (phase === 'fading-in' && event === 'fade-in-complete') return 'idle';
  return phase;
}

export function isM14InputLocked(transitionState) {
  const phase = typeof transitionState === 'string'
    ? transitionState
    : transitionState?.phase;
  return phase !== 'idle';
}

function freezeTransitionState(state) {
  return Object.freeze(state);
}

export function createM14TransitionState(
  areaId = M14_INITIAL_LOCATION.areaId,
  spawnId = M14_INITIAL_LOCATION.spawnId,
  context = {},
) {
  getM14SpawnPoint(areaId, spawnId);
  return freezeTransitionState({
    phase: 'idle',
    currentAreaId: areaId,
    currentSpawnId: spawnId,
    pendingTransition: null,
    lastTransition: null,
    context: Object.freeze({ ...context }),
  });
}

export function reduceM14Transition(state, action) {
  if (typeof state === 'string') {
    const event = typeof action === 'string' ? action : action?.type;
    return nextM14TransitionPhase(state, event);
  }
  if (!state || !action) return state;
  const normalizedAction = typeof action === 'string' ? { type: action } : action;
  if (typeof normalizedAction !== 'object') return state;

  if (normalizedAction.type === 'reset') {
    if (
      state.phase === 'idle'
      && state.pendingTransition === null
    ) {
      return state;
    }
    return freezeTransitionState({
      ...state,
      phase: 'idle',
      pendingTransition: null,
    });
  }

  if (normalizedAction.type === 'start') {
    const transition = normalizedAction.transition ?? state.pendingTransition;
    if (
      state.phase !== 'idle'
      || (
        transition
        && state.currentAreaId
        && transition.sourceAreaId !== state.currentAreaId
      )
    ) {
      return state;
    }
    return freezeTransitionState({
      ...state,
      phase: 'fading-out',
      pendingTransition: transition,
    });
  }

  if (
    normalizedAction.type === 'fade-out-complete'
    && state.phase === 'fading-out'
  ) {
    return freezeTransitionState({ ...state, phase: 'loading' });
  }

  if (
    normalizedAction.type === 'scene-ready'
    && state.phase === 'loading'
  ) {
    if (!state.pendingTransition) {
      return freezeTransitionState({ ...state, phase: 'fading-in' });
    }
    return freezeTransitionState({
      ...state,
      phase: 'fading-in',
      currentAreaId: state.pendingTransition.targetAreaId,
      currentSpawnId: state.pendingTransition.targetSpawnId,
      lastTransition: state.pendingTransition,
    });
  }

  if (
    normalizedAction.type === 'fade-in-complete'
    && state.phase === 'fading-in'
  ) {
    return freezeTransitionState({
      ...state,
      phase: 'idle',
      pendingTransition: null,
    });
  }

  return state;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function validateRange(errors, prefix, activationRange, worldWidth, required) {
  if (!isObject(activationRange)) {
    if (required) errors.push(`${prefix} must define an activationRange.`);
    return;
  }
  if (
    !Number.isFinite(activationRange.minX)
    || !Number.isFinite(activationRange.maxX)
    || activationRange.minX < 0
    || activationRange.maxX > worldWidth
    || activationRange.minX > activationRange.maxX
  ) {
    errors.push(`${prefix} has an invalid activationRange.`);
  }
}

export function validateM14AreaGraph(areas = M14_AREA_DEFINITIONS) {
  const errors = [];
  if (!isObject(areas)) return ['Area graph must be an object.'];
  const entries = Object.entries(areas);
  const directions = ['left', 'right', 'up', 'down'];

  for (const [areaKey, area] of entries) {
    const prefix = `Area ${areaKey}`;
    if (!isObject(area)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    if (area.areaId !== areaKey) {
      errors.push(`${prefix} has mismatched areaId ${String(area.areaId)}.`);
    }
    if (!isFinitePositive(area.worldWidth)) {
      errors.push(`${prefix} must have a positive worldWidth.`);
    }
    if (!Number.isFinite(area.groundY)) {
      errors.push(`${prefix} must have a finite groundY.`);
    }
    if (
      !isObject(area.cameraBounds)
      || !isFinitePositive(area.cameraBounds.width)
      || !isFinitePositive(area.cameraBounds.height)
      || area.cameraBounds.x < 0
      || area.cameraBounds.x + area.cameraBounds.width > area.worldWidth
    ) {
      errors.push(`${prefix} has invalid cameraBounds.`);
    }

    const spawnEntries = isObject(area.spawnPoints)
      ? Object.entries(area.spawnPoints)
      : [];
    if (spawnEntries.length === 0) {
      errors.push(`${prefix} must define at least one spawn point.`);
    }
    for (const [spawnKey, spawnPoint] of spawnEntries) {
      if (
        !isObject(spawnPoint)
        || spawnPoint.id !== spawnKey
        || !Number.isFinite(spawnPoint.x)
        || spawnPoint.x < 0
        || spawnPoint.x > area.worldWidth
        || !['left', 'right'].includes(spawnPoint.facing)
      ) {
        errors.push(`${prefix} has invalid spawn point ${spawnKey}.`);
      }
    }

    for (const direction of directions) {
      const exit = exitForDirection(area, direction);
      const exitPrefix = `${prefix} ${direction} exit`;
      if (!isObject(exit)) {
        errors.push(`${exitPrefix} is missing.`);
        continue;
      }
      if (exit.direction !== direction) {
        errors.push(`${exitPrefix} has mismatched direction ${String(exit.direction)}.`);
      }
      const expectedTrigger = ['left', 'right'].includes(direction)
        ? 'boundary'
        : 'branch';
      if (exit.trigger !== expectedTrigger) {
        errors.push(`${exitPrefix} must use the ${expectedTrigger} trigger.`);
      }
      validateRange(
        errors,
        exitPrefix,
        exit.activationRange,
        area.worldWidth,
        exit.kind === 'connected' || expectedTrigger === 'boundary',
      );

      if (exit.kind === 'connected') {
        const targetArea = areas[exit.targetAreaId];
        if (!targetArea) {
          errors.push(`${exitPrefix} targets missing area ${String(exit.targetAreaId)}.`);
          continue;
        }
        const targetSpawn = targetArea.spawnPoints?.[exit.targetSpawnId];
        if (!targetSpawn) {
          errors.push(
            `${exitPrefix} targets missing spawn ${exit.targetAreaId}/${String(exit.targetSpawnId)}.`,
          );
        } else if (targetSpawn.facing !== exit.targetFacing) {
          errors.push(`${exitPrefix} targetFacing does not match its spawn point.`);
        }
        if (
          expectedTrigger === 'branch'
          && (
            !isObject(exit.arrowRange)
            || exit.arrowRange.minX !== exit.activationRange?.minX
            || exit.arrowRange.maxX !== exit.activationRange?.maxX
          )
        ) {
          errors.push(`${exitPrefix} must expose its activationRange as arrowRange.`);
        }
      } else if (exit.kind !== 'closed') {
        errors.push(`${exitPrefix} has unknown kind ${String(exit.kind)}.`);
      }
    }
  }

  for (const [areaKey, area] of entries) {
    if (!isObject(area)) continue;
    for (const direction of ['left', 'right', 'up', 'down']) {
      const exit = exitForDirection(area, direction);
      if (exit?.kind !== 'connected') continue;
      const target = areas[exit.targetAreaId];
      const reverse = target
        ? exitForDirection(target, OPPOSITE_DIRECTION[direction])
        : null;
      if (
        reverse?.kind !== 'connected'
        || reverse.targetAreaId !== areaKey
      ) {
        errors.push(
          `Area ${areaKey} ${direction} exit is missing a reciprocal connection.`,
        );
      }
    }
  }

  if (areas[M14_INITIAL_LOCATION.areaId]) {
    const reachable = new Set([M14_INITIAL_LOCATION.areaId]);
    const queue = [M14_INITIAL_LOCATION.areaId];
    while (queue.length > 0) {
      const areaId = queue.shift();
      const area = areas[areaId];
      if (!area) continue;
      for (const direction of ['left', 'right', 'up', 'down']) {
        const exit = exitForDirection(area, direction);
        if (
          exit?.kind === 'connected'
          && areas[exit.targetAreaId]
          && !reachable.has(exit.targetAreaId)
        ) {
          reachable.add(exit.targetAreaId);
          queue.push(exit.targetAreaId);
        }
      }
    }
    for (const areaId of Object.keys(areas)) {
      if (!reachable.has(areaId)) {
        errors.push(`Area ${areaId} is unreachable from home-street.`);
      }
    }
  } else if (entries.length > 0) {
    errors.push('Area graph must include home-street.');
  }

  return errors;
}

export function assertValidM14AreaGraph(areas = M14_AREA_DEFINITIONS) {
  const errors = validateM14AreaGraph(areas);
  if (errors.length > 0) {
    throw new Error(`Invalid M1.4 area graph:\n- ${errors.join('\n- ')}`);
  }
  return areas;
}

assertValidM14AreaGraph();
