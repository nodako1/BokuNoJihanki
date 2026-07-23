import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nextNavigationTransitionState,
  isActiveNavigationPhase,
  isReadyForNavigationTransition,
  NAVIGATION_TRANSITION_STATES,
} from '../src/game/navigation/areaTransitionState.mjs';
// Cross-check only: confirm the pre-existing M1.3 fade lifecycle in
// src/game/systems/ is untouched by this addition (different file entirely).
import { nextAreaTransitionState } from '../src/game/systems/areaTransitionState.mjs';

test('the M1.3 fade lifecycle (systems/areaTransitionState.mjs) is untouched', () => {
  let state = 'idle';
  state = nextAreaTransitionState(state, 'start');
  assert.equal(state, 'fading-out');
  state = nextAreaTransitionState(state, 'fade-out-complete');
  assert.equal(state, 'loading');
  state = nextAreaTransitionState(state, 'scene-ready');
  assert.equal(state, 'fading-in');
  state = nextAreaTransitionState(state, 'fade-in-complete');
  assert.equal(state, 'idle');
});

test('the full M1.4 lifecycle runs idle -> requested -> fading-out -> loading -> spawning -> fading-in -> completed', () => {
  let phase = 'idle';
  phase = nextNavigationTransitionState(phase, 'request');
  assert.equal(phase, 'requested');
  phase = nextNavigationTransitionState(phase, 'start-fade-out');
  assert.equal(phase, 'fading-out');
  phase = nextNavigationTransitionState(phase, 'complete-fade-out');
  assert.equal(phase, 'loading');
  phase = nextNavigationTransitionState(phase, 'area-ready');
  assert.equal(phase, 'spawning');
  phase = nextNavigationTransitionState(phase, 'begin-fade-in');
  assert.equal(phase, 'fading-in');
  phase = nextNavigationTransitionState(phase, 'complete');
  assert.equal(phase, 'completed');
});

test('a new transition can be requested again from completed, cancelled, or error', () => {
  assert.equal(nextNavigationTransitionState('completed', 'request'), 'requested');
  assert.equal(nextNavigationTransitionState('cancelled', 'request'), 'requested');
  assert.equal(nextNavigationTransitionState('error', 'request'), 'requested');
});

test('invalid transition actions do not corrupt the state', () => {
  assert.equal(nextNavigationTransitionState('idle', 'complete'), 'idle');
  assert.equal(nextNavigationTransitionState('loading', 'request'), 'loading');
  assert.equal(nextNavigationTransitionState('fading-out', 'area-ready'), 'fading-out');
  assert.equal(nextNavigationTransitionState('spawning', 'start-fade-out'), 'spawning');
});

test('cancel moves any active phase straight to cancelled', () => {
  for (const phase of ['requested', 'fading-out', 'loading', 'spawning', 'fading-in']) {
    assert.equal(nextNavigationTransitionState(phase, 'cancel'), 'cancelled');
  }
  // Cancelling while already resting is a no-op.
  assert.equal(nextNavigationTransitionState('idle', 'cancel'), 'idle');
});

test('fail moves any active phase straight to error', () => {
  for (const phase of ['requested', 'fading-out', 'loading', 'spawning', 'fading-in']) {
    assert.equal(nextNavigationTransitionState(phase, 'fail'), 'error');
  }
});

test('isActiveNavigationPhase / isReadyForNavigationTransition partition all declared states', () => {
  for (const phase of NAVIGATION_TRANSITION_STATES) {
    assert.notEqual(isActiveNavigationPhase(phase), isReadyForNavigationTransition(phase));
  }
  assert.deepEqual(
    NAVIGATION_TRANSITION_STATES.filter((phase) => isReadyForNavigationTransition(phase)).sort(),
    ['cancelled', 'completed', 'error', 'idle'].sort(),
  );
});
