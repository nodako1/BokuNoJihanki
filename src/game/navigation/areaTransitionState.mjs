// M1.4 area transition state machine. Deliberately separate from, and does
// not modify, the pre-existing M1.3 fade lifecycle in
// src/game/systems/areaTransitionState.mjs (nextAreaTransitionState /
// AREA_TRANSITION_STATES), which stays untouched for AreaTransitionSystem.ts
// and tests/area-transition.test.mjs. See docs/specs/M1_4_NAVIGATION_CORE.md.

/** Phases in which a transition is actively in flight and input is locked. */
const ACTIVE_NAVIGATION_PHASES = new Set(['requested', 'fading-out', 'loading', 'spawning', 'fading-in']);

/** Phases from which a brand-new transition may be requested. */
const READY_NAVIGATION_PHASES = new Set(['idle', 'completed', 'cancelled', 'error']);

export const NAVIGATION_TRANSITION_STATES = [
  'idle',
  'requested',
  'fading-out',
  'loading',
  'spawning',
  'fading-in',
  'completed',
  'cancelled',
  'error',
];

export const NAVIGATION_TRANSITION_ACTIONS = [
  'request',
  'start-fade-out',
  'complete-fade-out',
  'area-ready',
  'begin-fade-in',
  'complete',
  'cancel',
  'fail',
];

/**
 * @param {(typeof NAVIGATION_TRANSITION_STATES)[number]} state
 * @param {(typeof NAVIGATION_TRANSITION_ACTIONS)[number]} action
 * @returns {(typeof NAVIGATION_TRANSITION_STATES)[number]}
 */
export function nextNavigationTransitionState(state, action) {
  if (action === 'cancel' && ACTIVE_NAVIGATION_PHASES.has(state)) return 'cancelled';
  if (action === 'fail' && ACTIVE_NAVIGATION_PHASES.has(state)) return 'error';
  if (action === 'request' && READY_NAVIGATION_PHASES.has(state)) return 'requested';
  if (state === 'requested' && action === 'start-fade-out') return 'fading-out';
  if (state === 'fading-out' && action === 'complete-fade-out') return 'loading';
  if (state === 'loading' && action === 'area-ready') return 'spawning';
  if (state === 'spawning' && action === 'begin-fade-in') return 'fading-in';
  if (state === 'fading-in' && action === 'complete') return 'completed';
  return state;
}

export function isActiveNavigationPhase(phase) {
  return ACTIVE_NAVIGATION_PHASES.has(phase);
}

export function isReadyForNavigationTransition(phase) {
  return READY_NAVIGATION_PHASES.has(phase);
}
