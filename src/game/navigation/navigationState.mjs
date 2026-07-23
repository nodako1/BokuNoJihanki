import { getArea, getSpawnPoint } from './areaGraph.mjs';
import { nextNavigationTransitionState, isReadyForNavigationTransition } from './areaTransitionState.mjs';

/**
 * @typedef {import('./navigationState.d.mts').NavigationState} NavigationState
 * @typedef {import('./navigationState.d.mts').BeginTransitionOptions} BeginTransitionOptions
 * @typedef {import('./navigationState.d.mts').ResolveSpawnOptions} ResolveSpawnOptions
 * @typedef {import('./navigationState.d.mts').FinishTransitionOptions} FinishTransitionOptions
 * @typedef {import('./areaGraph.d.mts').AreaExit} AreaExit
 * @typedef {import('./areaGraph.d.mts').AreaGraph} AreaGraph
 */

/**
 * @param {string} initialAreaId
 * @param {string} initialSpawnId
 * @param {import('../systems/walkableMovement.d.mts').Facing} [initialFacing]
 * @param {Readonly<Record<string, unknown>>} [metadata]
 * @returns {NavigationState}
 */
export function createNavigationState(initialAreaId, initialSpawnId, initialFacing = 'down', metadata = {}) {
  return {
    phase: 'idle',
    currentAreaId: initialAreaId,
    currentSpawnId: initialSpawnId,
    facing: initialFacing,
    pendingExit: null,
    previousPosition: null,
    resolvedSpawn: null,
    lastTransition: null,
    metadata: { ...metadata },
  };
}

/**
 * True whenever a transition is actively in flight (fading, loading,
 * spawning, ...). Horizontal movement and new exit checks should be
 * suppressed by the caller while this is true.
 *
 * @param {NavigationState} state
 * @returns {boolean}
 */
export function isInputLocked(state) {
  return !isReadyForNavigationTransition(state.phase);
}

/**
 * @param {NavigationState} state
 * @returns {boolean}
 */
export function isReadyForTransition(state) {
  return isReadyForNavigationTransition(state.phase);
}

/**
 * Accepts an exit and begins a transition. No-ops (returns the same state
 * reference) if a transition is already in flight or the exit is disabled,
 * so mashing the same exit trigger only ever starts one transition.
 *
 * @param {NavigationState} state
 * @param {AreaExit} exit
 * @param {BeginTransitionOptions} [options]
 * @returns {NavigationState}
 */
export function beginAreaTransition(state, exit, options = {}) {
  if (!isReadyForNavigationTransition(state.phase)) return state;
  if (!exit || exit.enabled === false) return state;

  return {
    ...state,
    phase: nextNavigationTransitionState(state.phase, 'request'),
    previousPosition: { areaId: state.currentAreaId, spawnId: state.currentSpawnId, facing: state.facing },
    pendingExit: {
      sourceAreaId: state.currentAreaId,
      exitId: exit.id,
      direction: exit.direction,
      targetAreaId: exit.targetAreaId,
      targetSpawnId: exit.targetSpawnId,
      transitionType: exit.transitionType,
      prompt: exit.prompt,
    },
    resolvedSpawn: null,
    metadata: options.metadataPatch ? { ...state.metadata, ...options.metadataPatch } : state.metadata,
  };
}

/**
 * @param {NavigationState} state
 * @returns {NavigationState}
 */
export function startFadeOut(state) {
  if (state.phase !== 'requested') return state;
  return { ...state, phase: nextNavigationTransitionState(state.phase, 'start-fade-out') };
}

/**
 * @param {NavigationState} state
 * @returns {NavigationState}
 */
export function markAreaLoading(state) {
  if (state.phase !== 'fading-out') return state;
  return { ...state, phase: nextNavigationTransitionState(state.phase, 'complete-fade-out') };
}

/**
 * Resolves the pending exit's target spawn point from the area graph and
 * moves the state's current area/spawn/facing to it. On unresolvable data
 * (unknown area or spawn id), safely reverts to the pre-transition position
 * and reports the failure via `lastTransition` instead of throwing.
 *
 * @param {NavigationState} state
 * @param {AreaGraph} graph
 * @param {ResolveSpawnOptions} [options]
 * @returns {NavigationState}
 */
export function resolveAreaSpawn(state, graph, options = {}) {
  if (state.phase !== 'loading' || !state.pendingExit) return state;

  const { pendingExit, previousPosition } = state;
  const targetArea = getArea(graph, pendingExit.targetAreaId);
  const spawn = getSpawnPoint(graph, pendingExit.targetAreaId, pendingExit.targetSpawnId);

  if (!targetArea || !spawn) {
    return {
      ...state,
      phase: nextNavigationTransitionState(state.phase, 'fail'),
      currentAreaId: previousPosition?.areaId ?? state.currentAreaId,
      currentSpawnId: previousPosition?.spawnId ?? state.currentSpawnId,
      facing: previousPosition?.facing ?? state.facing,
      pendingExit: null,
      previousPosition: null,
      resolvedSpawn: null,
      lastTransition: {
        result: 'error',
        sourceAreaId: pendingExit.sourceAreaId,
        targetAreaId: pendingExit.targetAreaId,
        message: `Unable to resolve spawn "${pendingExit.targetSpawnId}" in area "${pendingExit.targetAreaId}".`,
        at: options.now ?? 0,
      },
    };
  }

  const facing = options.facingOverride ?? spawn.facing;

  return {
    ...state,
    phase: nextNavigationTransitionState(state.phase, 'area-ready'),
    currentAreaId: targetArea.id,
    currentSpawnId: spawn.id,
    facing,
    resolvedSpawn: { areaId: targetArea.id, spawnId: spawn.id, x: spawn.x, facing },
  };
}

/**
 * @param {NavigationState} state
 * @returns {NavigationState}
 */
export function markFadingIn(state) {
  if (state.phase !== 'spawning') return state;
  return { ...state, phase: nextNavigationTransitionState(state.phase, 'begin-fade-in') };
}

/**
 * @param {NavigationState} state
 * @param {FinishTransitionOptions} [options]
 * @returns {NavigationState}
 */
export function completeAreaTransition(state, options = {}) {
  if (state.phase !== 'fading-in') return state;
  const sourceAreaId = state.pendingExit?.sourceAreaId ?? state.previousPosition?.areaId ?? state.currentAreaId;

  return {
    ...state,
    phase: nextNavigationTransitionState(state.phase, 'complete'),
    pendingExit: null,
    previousPosition: null,
    lastTransition: {
      result: 'completed',
      sourceAreaId,
      targetAreaId: state.currentAreaId,
      at: options.now ?? 0,
    },
  };
}

/**
 * Aborts an in-flight transition from any active phase and safely restores
 * the pre-transition area/spawn/facing.
 *
 * @param {NavigationState} state
 * @param {FinishTransitionOptions} [options]
 * @returns {NavigationState}
 */
export function cancelAreaTransition(state, options = {}) {
  if (isReadyForNavigationTransition(state.phase)) return state;
  const restore = state.previousPosition;

  return {
    ...state,
    phase: nextNavigationTransitionState(state.phase, 'cancel'),
    currentAreaId: restore?.areaId ?? state.currentAreaId,
    currentSpawnId: restore?.spawnId ?? state.currentSpawnId,
    facing: restore?.facing ?? state.facing,
    pendingExit: null,
    previousPosition: null,
    resolvedSpawn: null,
    lastTransition: {
      result: 'cancelled',
      sourceAreaId: restore?.areaId ?? state.currentAreaId,
      targetAreaId: state.pendingExit?.targetAreaId,
      at: options.now ?? 0,
    },
  };
}
