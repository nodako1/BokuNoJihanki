import assert from 'node:assert/strict';
import test from 'node:test';
import { createM14AreaGraph, getArea, findHorizontalExit, findDirectionalExit } from '../src/game/navigation/areaGraph.mjs';
import {
  createNavigationState,
  isInputLocked,
  beginAreaTransition,
  startFadeOut,
  markAreaLoading,
  resolveAreaSpawn,
  markFadingIn,
  completeAreaTransition,
  cancelAreaTransition,
} from '../src/game/navigation/navigationState.mjs';

function homeStreetToLifeRoadExit(g) {
  const area = getArea(g, 'home-street');
  return findHorizontalExit(g, 'home-street', 'right', { x: area.worldWidth });
}

function driveToCompletion(state, graph, exit, now = 0) {
  let s = beginAreaTransition(state, exit, { now });
  s = startFadeOut(s);
  s = markAreaLoading(s);
  s = resolveAreaSpawn(s, graph, { now });
  s = markFadingIn(s);
  s = completeAreaTransition(s, { now });
  return s;
}

test('input is unlocked at idle and locked throughout an in-flight transition', () => {
  const g = createM14AreaGraph();
  const exit = homeStreetToLifeRoadExit(g);
  let state = createNavigationState('home-street', 'default');
  assert.equal(isInputLocked(state), false);

  state = beginAreaTransition(state, exit);
  assert.equal(isInputLocked(state), true);
  state = startFadeOut(state);
  assert.equal(isInputLocked(state), true);
  state = markAreaLoading(state);
  assert.equal(isInputLocked(state), true);
  state = resolveAreaSpawn(state, g);
  assert.equal(isInputLocked(state), true);
  state = markFadingIn(state);
  assert.equal(isInputLocked(state), true);
  state = completeAreaTransition(state);
  assert.equal(isInputLocked(state), false, 'input should unlock once the transition has completed');
});

test('beginAreaTransition only starts one transition even if the exit is triggered repeatedly', () => {
  const g = createM14AreaGraph();
  const exit = homeStreetToLifeRoadExit(g);
  const idle = createNavigationState('home-street', 'default');

  const first = beginAreaTransition(idle, exit);
  const second = beginAreaTransition(first, exit);
  const third = beginAreaTransition(second, exit);

  assert.equal(first.phase, 'requested');
  assert.equal(second, first, 'a second begin call while in flight must be a complete no-op');
  assert.equal(third, first);
});

test('a disabled exit cannot begin a transition', () => {
  const g = createM14AreaGraph();
  const exit = { ...homeStreetToLifeRoadExit(g), enabled: false };
  const idle = createNavigationState('home-street', 'default');
  const result = beginAreaTransition(idle, exit);
  assert.equal(result, idle);
  assert.equal(result.phase, 'idle');
});

test('completing a transition resolves the target spawn (area, position and facing)', () => {
  const g = createM14AreaGraph();
  const exit = homeStreetToLifeRoadExit(g);
  const idle = createNavigationState('home-street', 'default');

  const finished = driveToCompletion(idle, g, exit, 1000);

  assert.equal(finished.phase, 'completed');
  assert.equal(finished.currentAreaId, 'life-road');
  assert.equal(finished.currentSpawnId, 'from-home-street');
  assert.equal(finished.facing, 'right');
  assert.equal(finished.pendingExit, null);
  assert.deepEqual(finished.lastTransition, {
    result: 'completed',
    sourceAreaId: 'home-street',
    targetAreaId: 'life-road',
    at: 1000,
  });
});

test('life-road up exit resolves into upper-vending-lane, and back down resolves back', () => {
  const g = createM14AreaGraph();
  const lifeRoad = getArea(g, 'life-road');
  const upExit = lifeRoad.exits.find((exit) => exit.direction === 'up');
  const markerX = (upExit.trigger.minX + upExit.trigger.maxX) / 2;
  const resolvedUpExit = findDirectionalExit(g, 'life-road', 'up', { x: markerX });

  const atLifeRoad = createNavigationState('life-road', 'from-home-street');
  const up = driveToCompletion(atLifeRoad, g, resolvedUpExit);
  assert.equal(up.currentAreaId, 'upper-vending-lane');
  assert.equal(up.currentSpawnId, 'from-life-road');

  const upperArea = getArea(g, 'upper-vending-lane');
  const downExit = upperArea.exits.find((exit) => exit.direction === 'down');
  const downMarkerX = (downExit.trigger.minX + downExit.trigger.maxX) / 2;
  const resolvedDownExit = findDirectionalExit(g, 'upper-vending-lane', 'down', { x: downMarkerX });

  const down = driveToCompletion(up, g, resolvedDownExit);
  assert.equal(down.currentAreaId, 'life-road');
  assert.equal(down.currentSpawnId, 'from-upper-vending-lane');
});

test('cancelling an in-flight transition safely restores the original area, spawn and facing', () => {
  const g = createM14AreaGraph();
  const exit = homeStreetToLifeRoadExit(g);
  const idle = createNavigationState('home-street', 'default', 'down');

  let state = beginAreaTransition(idle, exit);
  state = startFadeOut(state);
  state = markAreaLoading(state);
  state = resolveAreaSpawn(state, g); // already moved to life-road / spawning
  assert.equal(state.currentAreaId, 'life-road');

  const cancelled = cancelAreaTransition(state, { now: 42 });
  assert.equal(cancelled.phase, 'cancelled');
  assert.equal(cancelled.currentAreaId, 'home-street');
  assert.equal(cancelled.currentSpawnId, 'default');
  assert.equal(cancelled.facing, 'down');
  assert.equal(cancelled.pendingExit, null);
  assert.equal(isInputLocked(cancelled), false);
  assert.deepEqual(cancelled.lastTransition, {
    result: 'cancelled',
    sourceAreaId: 'home-street',
    targetAreaId: 'life-road',
    at: 42,
  });

  // A new transition can begin right away from the recovered state.
  const restarted = beginAreaTransition(cancelled, exit);
  assert.equal(restarted.phase, 'requested');
});

test('cancelling while idle is a no-op', () => {
  const idle = createNavigationState('home-street', 'default');
  assert.equal(cancelAreaTransition(idle), idle);
});

test('an unresolvable target spawn fails safely and recovers to a playable state', () => {
  const g = createM14AreaGraph();
  const brokenExit = {
    id: 'broken-exit',
    direction: 'right',
    trigger: { kind: 'range', minX: 0, maxX: 10 },
    targetAreaId: 'home-street',
    targetSpawnId: 'this-spawn-does-not-exist',
    transitionType: 'fade',
    enabled: true,
  };

  const idle = createNavigationState('life-road', 'from-home-street', 'right');
  let state = beginAreaTransition(idle, brokenExit);
  state = startFadeOut(state);
  state = markAreaLoading(state);
  state = resolveAreaSpawn(state, g, { now: 7 });

  assert.equal(state.phase, 'error');
  assert.equal(state.currentAreaId, 'life-road', 'must stay in the source area on failure');
  assert.equal(state.currentSpawnId, 'from-home-street');
  assert.equal(state.facing, 'right');
  assert.equal(isInputLocked(state), false, 'error is a resolved, unlocked state');
  assert.equal(state.lastTransition.result, 'error');

  // Recovery: a fresh transition can be requested immediately after an error.
  const exit = homeStreetToLifeRoadExit(g);
  const recovered = beginAreaTransition(state, { ...exit, targetAreaId: 'home-street', targetSpawnId: 'from-life-road' });
  assert.equal(recovered.phase, 'requested');
});
