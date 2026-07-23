import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseFacing,
  circleInsideWalkable,
  isFootprintValid,
  pointInPolygon,
  resolveWalkableMovement,
  sectionIndexForX,
} from '../src/game/systems/walkableMovement.mjs';

const walkable = [[
  { x: 0, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 300 }, { x: 0, y: 300 },
]];
const obstacle = [[
  { x: 220, y: 150 }, { x: 280, y: 150 }, { x: 280, y: 250 }, { x: 220, y: 250 },
]];

test('point-in-polygon and footprint samples respect authored walkable space', () => {
  assert.equal(pointInPolygon({ x: 100, y: 180 }, walkable[0]), true);
  assert.equal(pointInPolygon({ x: 100, y: 80 }, walkable[0]), false);
  assert.equal(circleInsideWalkable({ x: 100, y: 180 }, 12, walkable), true);
  assert.equal(circleInsideWalkable({ x: 6, y: 180 }, 12, walkable), false);
});

test('footprint rejects houses, fences, poles and other obstacle polygons', () => {
  assert.equal(isFootprintValid({ x: 180, y: 200 }, 12, walkable, obstacle), true);
  assert.equal(isFootprintValid({ x: 230, y: 200 }, 12, walkable, obstacle), false);
});

test('substep movement prevents tunnelling through a narrow obstacle', () => {
  const result = resolveWalkableMovement(
    { x: 180, y: 200 },
    { x: 180, y: 0 },
    12,
    walkable,
    obstacle,
    4,
  );
  assert.ok(result.x < 210, `expected to stop before obstacle, got ${result.x}`);
  assert.equal(result.blockedX, true);
});

test('diagonal collision slides along a wall instead of fully stopping', () => {
  const result = resolveWalkableMovement(
    { x: 190, y: 135 },
    { x: 80, y: 90 },
    12,
    walkable,
    obstacle,
    4,
  );
  assert.ok(result.y > 135, `expected vertical slide, got ${result.y}`);
  assert.ok(result.x < 220, `expected wall to constrain x, got ${result.x}`);
});

test('direction selection prioritizes the dominant movement axis', () => {
  assert.equal(chooseFacing(5, 1, 'down'), 'right');
  assert.equal(chooseFacing(-5, 1, 'down'), 'left');
  assert.equal(chooseFacing(1, -5, 'down'), 'up');
  assert.equal(chooseFacing(1, 5, 'up'), 'down');
  assert.equal(chooseFacing(0, 0, 'left'), 'left');
});

test('section lookup clamps to the residential map bounds', () => {
  assert.equal(sectionIndexForX(-30, 1280, 4), 0);
  assert.equal(sectionIndexForX(1279, 1280, 4), 0);
  assert.equal(sectionIndexForX(1280, 1280, 4), 1);
  assert.equal(sectionIndexForX(9999, 1280, 4), 3);
});
