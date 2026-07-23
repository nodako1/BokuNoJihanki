import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createM14AreaGraph,
  getArea,
  getSpawnPoint,
  findHorizontalExit,
  findDirectionalExit,
  isDirectionalPromptVisible,
  validateAreaGraph,
  isAreaGraphValid,
} from '../src/game/navigation/areaGraph.mjs';

function graph() {
  return createM14AreaGraph();
}

test('the M1.4 graph defines exactly the three required areas', () => {
  const g = graph();
  assert.equal(g.areas.length, 3);
  assert.ok(getArea(g, 'home-street'));
  assert.ok(getArea(g, 'life-road'));
  assert.ok(getArea(g, 'upper-vending-lane'));
});

test('the M1.4 graph is valid with no issues', () => {
  const g = graph();
  assert.deepEqual(validateAreaGraph(g), []);
  assert.equal(isAreaGraphValid(g), true);
});

test('home-street: moving right from the edge exits to life-road', () => {
  const g = graph();
  const area = getArea(g, 'home-street');
  const rightEdgeX = area.worldWidth;
  const exit = findHorizontalExit(g, 'home-street', 'right', { x: rightEdgeX });
  assert.ok(exit);
  assert.equal(exit.targetAreaId, 'life-road');
  const spawn = getSpawnPoint(g, exit.targetAreaId, exit.targetSpawnId);
  assert.ok(spawn, 'target spawn must exist in life-road');

  // Well inside the area, the right exit must not trigger.
  assert.equal(findHorizontalExit(g, 'home-street', 'right', { x: area.worldWidth / 2 }), undefined);
});

test('life-road: moving left from the edge returns to home-street', () => {
  const g = graph();
  const exit = findHorizontalExit(g, 'life-road', 'left', { x: 0 });
  assert.ok(exit);
  assert.equal(exit.targetAreaId, 'home-street');
  const spawn = getSpawnPoint(g, exit.targetAreaId, exit.targetSpawnId);
  assert.ok(spawn, 'target spawn must exist in home-street');
});

test('life-road: pressing up at the marked point exits to upper-vending-lane', () => {
  const g = graph();
  const area = getArea(g, 'life-road');
  const upExit = area.exits.find((exit) => exit.direction === 'up');
  assert.ok(upExit, 'life-road must declare an up exit');
  const markerX = (upExit.trigger.minX + upExit.trigger.maxX) / 2;

  const exit = findDirectionalExit(g, 'life-road', 'up', { x: markerX });
  assert.ok(exit);
  assert.equal(exit.targetAreaId, 'upper-vending-lane');
  assert.equal(isDirectionalPromptVisible(g, 'life-road', 'up', { x: markerX }), true);

  // Far away from the marker, the up prompt/exit must not be available.
  assert.equal(findDirectionalExit(g, 'life-road', 'up', { x: 5 }), undefined);
  assert.equal(isDirectionalPromptVisible(g, 'life-road', 'up', { x: 5 }), false);
});

test('upper-vending-lane: pressing down at the marked point returns to life-road', () => {
  const g = graph();
  const area = getArea(g, 'upper-vending-lane');
  const downExit = area.exits.find((exit) => exit.direction === 'down');
  assert.ok(downExit, 'upper-vending-lane must declare a down exit');
  const markerX = (downExit.trigger.minX + downExit.trigger.maxX) / 2;

  const exit = findDirectionalExit(g, 'upper-vending-lane', 'down', { x: markerX });
  assert.ok(exit);
  assert.equal(exit.targetAreaId, 'life-road');
  const spawn = getSpawnPoint(g, exit.targetAreaId, exit.targetSpawnId);
  assert.ok(spawn, 'target spawn must exist in life-road');
});

test('validateAreaGraph detects a reference to a non-existent area', () => {
  const g = graph();
  const broken = {
    areas: g.areas.map((area) =>
      area.id === 'home-street'
        ? {
            ...area,
            exits: area.exits.map((exit) => ({ ...exit, targetAreaId: 'does-not-exist' })),
          }
        : area,
    ),
  };
  const issues = validateAreaGraph(broken);
  assert.ok(issues.some((issue) => issue.code === 'missing-target-area'));
});

test('validateAreaGraph detects a reference to a non-existent spawn point', () => {
  const g = graph();
  const broken = {
    areas: g.areas.map((area) =>
      area.id === 'home-street'
        ? { ...area, exits: area.exits.map((exit) => ({ ...exit, targetSpawnId: 'no-such-spawn' })) }
        : area,
    ),
  };
  const issues = validateAreaGraph(broken);
  assert.ok(issues.some((issue) => issue.code === 'missing-target-spawn'));
});

test('validateAreaGraph detects duplicate area ids', () => {
  const g = graph();
  const broken = { areas: [...g.areas, { ...g.areas[0] }] };
  const issues = validateAreaGraph(broken);
  assert.ok(issues.some((issue) => issue.code === 'duplicate-area-id'));
});

test('validateAreaGraph detects duplicate spawn ids within an area', () => {
  const g = graph();
  const broken = {
    areas: g.areas.map((area) =>
      area.id === 'home-street' ? { ...area, spawnPoints: [...area.spawnPoints, { ...area.spawnPoints[0] }] } : area,
    ),
  };
  const issues = validateAreaGraph(broken);
  assert.ok(issues.some((issue) => issue.code === 'duplicate-spawn-id'));
});

test('validateAreaGraph detects duplicate exit ids within an area', () => {
  const g = graph();
  const broken = {
    areas: g.areas.map((area) =>
      area.id === 'life-road' ? { ...area, exits: [...area.exits, { ...area.exits[0] }] } : area,
    ),
  };
  const issues = validateAreaGraph(broken);
  assert.ok(issues.some((issue) => issue.code === 'duplicate-exit-id'));
});

test('validateAreaGraph detects an unreachable area', () => {
  const g = graph();
  const isolated = {
    id: 'isolated-area',
    label: 'Isolated',
    worldWidth: 400,
    groundY: 500,
    spawnPoints: [{ id: 'default', x: 200, facing: 'down' }],
    exits: [],
  };
  const broken = { areas: [...g.areas, isolated] };
  const issues = validateAreaGraph(broken);
  assert.ok(issues.some((issue) => issue.code === 'unreachable-area' && issue.areaId === 'isolated-area'));
});

test('validateAreaGraph detects an invalid direction and invalid worldWidth', () => {
  const g = graph();
  const broken = {
    areas: g.areas.map((area, index) => {
      if (index !== 0) return area;
      return {
        ...area,
        worldWidth: -10,
        exits: area.exits.map((exit) => ({ ...exit, direction: 'sideways' })),
      };
    }),
  };
  const issues = validateAreaGraph(broken);
  assert.ok(issues.some((issue) => issue.code === 'invalid-direction'));
  assert.ok(issues.some((issue) => issue.code === 'invalid-world-width'));
});
