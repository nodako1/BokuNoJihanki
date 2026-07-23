// M1.4 area transition state machine. Deliberately separate from, and does
// not modify, the pre-existing M1.3 fade lifecycle in
// src/game/systems/areaTransitionState.mjs (nextAreaTransitionState /
// AREA_TRANSITION_STATES), which stays untouched for AreaTransitionSystem.ts
// and tests/area-transition.test.mjs. See docs/specs/M1_4_NAVIGATION_CORE.md.

export type NavigationTransitionPhase =
  | 'idle'
  | 'requested'
  | 'fading-out'
  | 'loading'
  | 'spawning'
  | 'fading-in'
  | 'completed'
  | 'cancelled'
  | 'error';

export type NavigationTransitionAction =
  | 'request'
  | 'start-fade-out'
  | 'complete-fade-out'
  | 'area-ready'
  | 'begin-fade-in'
  | 'complete'
  | 'cancel'
  | 'fail';

export const NAVIGATION_TRANSITION_STATES: readonly NavigationTransitionPhase[];
export const NAVIGATION_TRANSITION_ACTIONS: readonly NavigationTransitionAction[];

/**
 * Pure state-table step. Unknown/mismatched (state, action) pairs are a
 * no-op: the same state is returned unchanged.
 */
export function nextNavigationTransitionState(
  state: NavigationTransitionPhase,
  action: NavigationTransitionAction,
): NavigationTransitionPhase;

/** True for requested/fading-out/loading/spawning/fading-in. */
export function isActiveNavigationPhase(phase: NavigationTransitionPhase): boolean;

/** True for idle/completed/cancelled/error - safe to accept a new `request`. */
export function isReadyForNavigationTransition(phase: NavigationTransitionPhase): boolean;
