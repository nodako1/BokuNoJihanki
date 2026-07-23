import assert from 'node:assert/strict';
import test from 'node:test';
import { nextAreaTransitionState } from '../src/game/systems/areaTransitionState.mjs';

test('area transition follows fade-out, loading and fade-in lifecycle', () => {
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

test('invalid transition events do not corrupt the state', () => {
  assert.equal(nextAreaTransitionState('idle', 'scene-ready'), 'idle');
  assert.equal(nextAreaTransitionState('loading', 'start'), 'loading');
});
