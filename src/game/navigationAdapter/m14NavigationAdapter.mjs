import {
  findDirectionalExit,
  findHorizontalExit,
  getArea as getCoreArea,
  getSpawnPoint as getCoreSpawnPoint,
  isDirectionalPromptVisible,
  validateAreaGraph as validateCoreAreaGraph,
} from '../navigation/areaGraph.mjs';
import { resolveHorizontalMovement } from '../navigation/horizontalMovement.mjs';
import {
  isReadyForNavigationTransition,
  nextNavigationTransitionState,
} from '../navigation/areaTransitionState.mjs';
import {
  beginAreaTransition,
  cancelAreaTransition,
  completeAreaTransition,
  createNavigationState,
  isInputLocked as isCoreInputLocked,
  markAreaLoading,
  markFadingIn,
  resolveAreaSpawn,
  startFadeOut,
} from '../navigation/navigationState.mjs';
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

const CORE_PHASE_BY_PUBLIC_PHASE = Object.freeze({
  idle: 'idle',
  'fading-out': 'fading-out',
  loading: 'loading',
  'fading-in': 'fading-in',
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

const coreStateByAdapterState = new WeakMap();

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function stableMovementNumber(value) {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function isFinitePositive(value) {
  return Number.isFinite(value) && value > 0;
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

function exitForDirection(area, direction) {
  const property = EXIT_PROPERTY_BY_DIRECTION[direction];
  return property ? area?.[property] : null;
}

function toCoreExit(exit) {
  return {
    id: exit?.id,
    direction: exit?.direction,
    trigger: {
      kind: 'range',
      minX: exit?.activationRange?.minX,
      maxX: exit?.activationRange?.maxX,
    },
    targetAreaId: exit?.targetAreaId,
    targetSpawnId: exit?.targetSpawnId,
    transitionType: 'fade',
    enabled: exit?.enabled !== false,
    prompt: exit?.hint,
  };
}

function toCoreAreaGraph(areas) {
  const areaKeys = Object.keys(areas ?? {});
  const orderedKeys = [
    ...M14_AREA_IDS.filter((areaId) => areaKeys.includes(areaId)),
    ...areaKeys.filter((areaId) => !M14_AREA_IDS.includes(areaId)),
  ];
  return {
    areas: orderedKeys.flatMap((areaKey) => {
      const area = areas?.[areaKey];
      if (!isObject(area)) return [];
      const spawnEntries = isObject(area.spawnPoints)
        ? Object.entries(area.spawnPoints)
        : [];
      const exits = ['left', 'right', 'up', 'down']
        .map((direction) => exitForDirection(area, direction))
        .filter((exit) => exit?.kind === 'connected')
        .map(toCoreExit);
      return [{
        id: area.areaId ?? areaKey,
        label: area.displayName ?? area.label ?? areaKey,
        worldWidth: area.worldWidth,
        groundY: area.groundY,
        spawnPoints: spawnEntries.map(([spawnKey, spawnPoint]) => ({
          id: spawnPoint?.id ?? spawnKey,
          x: spawnPoint?.x,
          facing: spawnPoint?.facing,
        })),
        exits,
        metadata: area.metadata ?? {},
      }];
    }),
  };
}

const M14_CORE_AREA_GRAPH = toCoreAreaGraph(M14_AREA_DEFINITIONS);

function verticalDirectionFromInput(input) {
  if (!input || typeof input !== 'object') return null;
  const y = finiteOr(input.y, 0);
  const up = Boolean(input.up) || y < -0.5;
  const down = Boolean(input.down) || y > 0.5;
  if (up === down) return null;
  return up ? 'up' : 'down';
}

function locatorForCoreExit(exit, x) {
  if (Number.isFinite(x)) return { x };
  if (exit?.trigger?.kind === 'range') {
    return { x: (exit.trigger.minX + exit.trigger.maxX) / 2 };
  }
  return { x: 0, markerId: exit?.trigger?.markerId };
}

function findCoreExit(areaId, direction, x) {
  const area = getCoreArea(M14_CORE_AREA_GRAPH, areaId);
  const candidate = area?.exits.find(
    (exit) => exit.enabled && exit.direction === direction,
  );
  if (!candidate) return undefined;
  const locator = locatorForCoreExit(candidate, x);
  if (direction === 'left' || direction === 'right') {
    return findHorizontalExit(M14_CORE_AREA_GRAPH, areaId, direction, locator);
  }
  if (direction === 'up' || direction === 'down') {
    return findDirectionalExit(M14_CORE_AREA_GRAPH, areaId, direction, locator);
  }
  return undefined;
}

function findCoreExitForTransition(transition) {
  if (!transition) return undefined;
  const area = getCoreArea(M14_CORE_AREA_GRAPH, transition.sourceAreaId);
  const exit = area?.exits.find((candidate) => candidate.id === transition.exitId);
  if (
    !exit
    || exit.direction !== transition.direction
    || exit.targetAreaId !== transition.targetAreaId
    || exit.targetSpawnId !== transition.targetSpawnId
  ) {
    return undefined;
  }
  return exit;
}

function resolvedTransitionFromCore(areaId, exit) {
  if (!exit) return null;
  const targetArea = getCoreArea(M14_CORE_AREA_GRAPH, exit.targetAreaId);
  const targetSpawn = getCoreSpawnPoint(
    M14_CORE_AREA_GRAPH,
    exit.targetAreaId,
    exit.targetSpawnId,
  );
  if (
    !targetArea
    || !targetSpawn
    || !M14_AREA_IDS.includes(areaId)
    || !M14_AREA_IDS.includes(exit.targetAreaId)
    || !['left', 'right'].includes(targetSpawn.facing)
  ) {
    return null;
  }
  return Object.freeze({
    exitId: exit.id,
    direction: exit.direction,
    sourceAreaId: areaId,
    targetAreaId: exit.targetAreaId,
    targetSpawnId: targetSpawn.id,
    spawnId: targetSpawn.id,
    targetX: targetSpawn.x,
    x: targetSpawn.x,
    targetGroundY: targetArea.groundY,
    targetFacing: targetSpawn.facing,
    facing: targetSpawn.facing,
  });
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

function resolveMovementWithCore(
  state,
  axis,
  deltaSeconds,
  motion,
  bounds,
  locked = false,
) {
  const normalizedAxis = clamp(finiteOr(axis, 0), -1, 1);
  const result = resolveHorizontalMovement(
    state,
    {
      horizontalAxis: normalizedAxis,
      left: normalizedAxis < 0,
      right: normalizedAxis > 0,
      deltaSeconds,
      locked,
    },
    {
      maxSpeed: motion.maxSpeed,
      acceleration: motion.acceleration,
      deceleration: motion.deceleration,
      maxSubstep: 4,
    },
    bounds,
  );
  return {
    ...result,
    velocityX: Math.abs(result.velocityX) <= motion.stopEpsilon
      ? 0
      : result.velocityX,
  };
}

export function stepHorizontalVelocity(
  velocityX,
  input,
  deltaSeconds,
  config = HORIZONTAL_MOTION_CONFIG,
) {
  const motion = getMotionConfig(config);
  const result = resolveMovementWithCore(
    {
      x: 0,
      velocityX: clamp(finiteOr(velocityX, 0), -motion.maxSpeed, motion.maxSpeed),
      facing: finiteOr(velocityX, 0) < 0 ? 'left' : 'right',
    },
    horizontalAxisFromInput(input),
    Math.max(0, finiteOr(deltaSeconds, 0)),
    motion,
    {
      minX: -Number.MAX_SAFE_INTEGER,
      maxX: Number.MAX_SAFE_INTEGER,
    },
  );
  return result.velocityX;
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
    const motion = getMotionConfig(state.config ?? HORIZONTAL_MOTION_CONFIG);
    const currentX = clamp(finiteOr(state.x, 0), 0, worldWidth);
    const currentVelocity = clamp(
      finiteOr(state.velocity, 0),
      -motion.maxSpeed,
      motion.maxSpeed,
    );
    const axis = horizontalAxisFromInput(state.input);
    const result = resolveMovementWithCore(
      {
        x: currentX,
        velocityX: currentVelocity,
        facing: axis < 0 ? 'left' : 'right',
      },
      axis,
      Math.max(0, finiteOr(state.deltaMs, 0)) / 1000,
      motion,
      { minX: 0, maxX: worldWidth },
      Boolean(state.locked),
    );
    return {
      x: stableMovementNumber(result.x),
      velocity: stableMovementNumber(result.velocityX),
      moved: stableMovementNumber(result.x - currentX),
      blocked: result.blocked,
    };
  }

  const motion = getMotionConfig(config);
  const axis = horizontalAxisFromInput(input);
  const seconds = Math.max(0, finiteOr(deltaSeconds, 0));
  const area = getM14AreaDefinition(areaId);
  const safeHalfWidth = clamp(
    Math.max(0, finiteOr(playerHalfWidth, 0)),
    0,
    area.worldWidth / 2,
  );
  const currentX = clampPlayerX(areaId, finiteOr(state?.x, 0), safeHalfWidth);
  const result = resolveMovementWithCore(
    {
      x: currentX,
      velocityX: clamp(
        finiteOr(state?.velocityX, 0),
        -motion.maxSpeed,
        motion.maxSpeed,
      ),
      facing: state?.facing === 'left' ? 'left' : 'right',
    },
    axis,
    seconds,
    motion,
    {
      minX: safeHalfWidth,
      maxX: area.worldWidth - safeHalfWidth,
    },
  );
  const x = stableMovementNumber(result.x);
  const movedX = stableMovementNumber(x - currentX);
  return {
    x,
    y: area.groundY,
    velocityX: stableMovementNumber(result.velocityX),
    movedX,
    moving: result.moving && Math.abs(movedX) > 0.0001,
    blocked: result.blocked,
    facing: result.facing === 'left' ? 'left' : 'right',
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
  const locator = { x: finiteOr(x, 0) };
  return ['up', 'down'].filter((direction) => (
    isDirectionalPromptVisible(
      M14_CORE_AREA_GRAPH,
      areaId,
      direction,
      locator,
    )
  ));
}

export function isBranchAvailable(areaId, direction, x) {
  if (direction !== 'up' && direction !== 'down') return false;
  return isDirectionalPromptVisible(
    M14_CORE_AREA_GRAPH,
    areaId,
    direction,
    { x: finiteOr(x, 0) },
  );
}

export function resolveAreaExit(areaId, direction, x, transitionState = 'idle') {
  if (isM14InputLocked(transitionState)) return null;
  const exit = findCoreExit(areaId, direction, x);
  return resolvedTransitionFromCore(areaId, exit);
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

function publicPhaseFromCore(corePhase) {
  if (corePhase === 'requested' || corePhase === 'fading-out') return 'fading-out';
  if (corePhase === 'loading') return 'loading';
  if (corePhase === 'spawning' || corePhase === 'fading-in') return 'fading-in';
  return 'idle';
}

export function nextM14TransitionPhase(phase, event) {
  let corePhase = CORE_PHASE_BY_PUBLIC_PHASE[phase] ?? 'idle';
  if (event === 'reset') {
    corePhase = nextNavigationTransitionState(corePhase, 'cancel');
  } else if (event === 'start') {
    corePhase = nextNavigationTransitionState(corePhase, 'request');
    corePhase = nextNavigationTransitionState(corePhase, 'start-fade-out');
  } else if (event === 'fade-out-complete') {
    corePhase = nextNavigationTransitionState(corePhase, 'complete-fade-out');
  } else if (event === 'scene-ready') {
    corePhase = nextNavigationTransitionState(corePhase, 'area-ready');
    corePhase = nextNavigationTransitionState(corePhase, 'begin-fade-in');
  } else if (event === 'fade-in-complete') {
    corePhase = nextNavigationTransitionState(corePhase, 'complete');
  }
  return publicPhaseFromCore(corePhase);
}

function freezeTransitionState(state, coreState) {
  const frozenState = Object.freeze({
    ...state,
    context: Object.isFrozen(state.context)
      ? state.context
      : Object.freeze({ ...state.context }),
  });
  if (coreState) coreStateByAdapterState.set(frozenState, coreState);
  return frozenState;
}

function createCoreState(areaId, spawnId, context) {
  const area = getCoreArea(M14_CORE_AREA_GRAPH, areaId);
  const spawn = getCoreSpawnPoint(M14_CORE_AREA_GRAPH, areaId, spawnId);
  if (!area || !spawn || !['left', 'right'].includes(spawn.facing)) {
    throw new RangeError(`Unknown M1.4 spawn: ${areaId}/${String(spawnId)}`);
  }
  return createNavigationState(area.id, spawn.id, spawn.facing, context);
}

function reconstructCoreState(state) {
  const existing = coreStateByAdapterState.get(state);
  if (existing) return existing;

  const pending = state?.pendingTransition;
  if (state?.phase !== 'idle' && pending) {
    const sourceArea = getCoreArea(
      M14_CORE_AREA_GRAPH,
      pending.sourceAreaId,
    );
    const sourceSpawn = state.currentAreaId === pending.sourceAreaId
      ? getCoreSpawnPoint(
        M14_CORE_AREA_GRAPH,
        pending.sourceAreaId,
        state.currentSpawnId,
      )
      : sourceArea?.spawnPoints[0];
    if (sourceArea && sourceSpawn) {
      let reconstructed = createNavigationState(
        sourceArea.id,
        sourceSpawn.id,
        sourceSpawn.facing,
        state.context,
      );
      const exit = findCoreExitForTransition(pending);
      if (exit) {
        reconstructed = beginAreaTransition(reconstructed, exit);
        reconstructed = startFadeOut(reconstructed);
        if (state.phase === 'loading' || state.phase === 'fading-in') {
          reconstructed = markAreaLoading(reconstructed);
        }
        if (state.phase === 'fading-in') {
          reconstructed = resolveAreaSpawn(
            reconstructed,
            M14_CORE_AREA_GRAPH,
          );
          reconstructed = markFadingIn(reconstructed);
        }
        coreStateByAdapterState.set(state, reconstructed);
        return reconstructed;
      }
    }
  }

  const reconstructed = createCoreState(
    state.currentAreaId,
    state.currentSpawnId,
    state.context,
  );
  coreStateByAdapterState.set(state, reconstructed);
  return reconstructed;
}

export function isM14InputLocked(transitionState) {
  if (typeof transitionState === 'string') {
    const corePhase = CORE_PHASE_BY_PUBLIC_PHASE[transitionState];
    return !isReadyForNavigationTransition(corePhase);
  }
  if (!transitionState || transitionState.phase !== 'idle') {
    return true;
  }
  try {
    return isCoreInputLocked(reconstructCoreState(transitionState));
  } catch {
    return true;
  }
}

export function createM14TransitionState(
  areaId = M14_INITIAL_LOCATION.areaId,
  spawnId = M14_INITIAL_LOCATION.spawnId,
  context = {},
) {
  getM14SpawnPoint(areaId, spawnId);
  const coreState = createCoreState(areaId, spawnId, context);
  return freezeTransitionState({
    phase: 'idle',
    currentAreaId: areaId,
    currentSpawnId: spawnId,
    pendingTransition: null,
    lastTransition: null,
    context: Object.freeze({ ...context }),
  }, coreState);
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
    if (state.phase === 'idle' && state.pendingTransition === null) return state;
    const coreState = cancelAreaTransition(reconstructCoreState(state));
    return freezeTransitionState({
      ...state,
      phase: 'idle',
      currentAreaId: coreState.currentAreaId,
      currentSpawnId: coreState.currentSpawnId,
      pendingTransition: null,
    }, coreState);
  }

  if (normalizedAction.type === 'start') {
    const transition = normalizedAction.transition ?? state.pendingTransition;
    if (
      state.phase !== 'idle'
      || !transition
      || transition.sourceAreaId !== state.currentAreaId
    ) {
      return state;
    }
    const exit = findCoreExitForTransition(transition);
    if (!exit) return state;
    const currentCoreState = reconstructCoreState(state);
    if (!isReadyForNavigationTransition(currentCoreState.phase)) return state;
    const requested = beginAreaTransition(currentCoreState, exit, {
      metadataPatch: state.context,
    });
    const coreState = startFadeOut(requested);
    if (coreState.phase !== 'fading-out') return state;
    return freezeTransitionState({
      ...state,
      phase: 'fading-out',
      pendingTransition: transition,
    }, coreState);
  }

  if (
    normalizedAction.type === 'fade-out-complete'
    && state.phase === 'fading-out'
  ) {
    const coreState = markAreaLoading(reconstructCoreState(state));
    if (coreState.phase !== 'loading') return state;
    return freezeTransitionState({
      ...state,
      phase: 'loading',
    }, coreState);
  }

  if (
    normalizedAction.type === 'scene-ready'
    && state.phase === 'loading'
    && state.pendingTransition
  ) {
    let coreState = resolveAreaSpawn(
      reconstructCoreState(state),
      M14_CORE_AREA_GRAPH,
    );
    coreState = markFadingIn(coreState);
    if (coreState.phase !== 'fading-in' || !coreState.resolvedSpawn) {
      return freezeTransitionState({
        ...state,
        phase: 'idle',
        currentAreaId: coreState.currentAreaId,
        currentSpawnId: coreState.currentSpawnId,
        pendingTransition: null,
      }, coreState);
    }
    return freezeTransitionState({
      ...state,
      phase: 'fading-in',
      currentAreaId: coreState.currentAreaId,
      currentSpawnId: coreState.currentSpawnId,
      lastTransition: state.pendingTransition,
    }, coreState);
  }

  if (
    normalizedAction.type === 'fade-in-complete'
    && state.phase === 'fading-in'
  ) {
    const coreState = completeAreaTransition(reconstructCoreState(state));
    if (!isReadyForNavigationTransition(coreState.phase)) return state;
    return freezeTransitionState({
      ...state,
      phase: 'idle',
      currentAreaId: coreState.currentAreaId,
      currentSpawnId: coreState.currentSpawnId,
      pendingTransition: null,
      lastTransition: state.lastTransition ?? state.pendingTransition,
    }, coreState);
  }

  return state;
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

  for (const issue of validateCoreAreaGraph(toCoreAreaGraph(areas))) {
    errors.push(`Navigation core: ${issue.message}`);
  }

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
        if (!isObject(targetArea)) {
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

  return [...new Set(errors)];
}

export function assertValidM14AreaGraph(areas = M14_AREA_DEFINITIONS) {
  const errors = validateM14AreaGraph(areas);
  if (errors.length > 0) {
    throw new Error(`Invalid M1.4 area graph:\n- ${errors.join('\n- ')}`);
  }
  return areas;
}

assertValidM14AreaGraph();
