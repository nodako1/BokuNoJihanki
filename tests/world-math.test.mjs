import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areaForX,
  chunkIndexForX,
  depthForFootY,
  desiredChunkIds,
  normalizeInput,
  resolveMovement,
  surfaceForPosition,
} from '../src/game/systems/worldMath.mjs';

test('diagonal input is normalized and cannot exceed magnitude 1', () => {
  const result = normalizeInput(1, 1);
  assert.ok(Math.abs(Math.hypot(result.x, result.y) - 1) < 0.00001);
  assert.ok(result.x < 1 && result.y < 1);
});

test('analog input below maximum keeps its magnitude', () => {
  const result = normalizeInput(0.3, 0.4);
  assert.equal(result.magnitude, 0.5);
  assert.equal(result.x, 0.3);
  assert.equal(result.y, 0.4);
});

test('chunk planner loads current, adjacent and forward-prefetch chunks', () => {
  assert.equal(chunkIndexForX(1300, 1280, 4), 1);
  assert.deepEqual(desiredChunkIds(0, 0, 4), [0, 1]);
  assert.deepEqual(desiredChunkIds(1, 1, 4), [0, 1, 2, 3]);
  assert.deepEqual(desiredChunkIds(3, 0, 4), [2, 3]);
});

test('depth increases from the object foot position', () => {
  assert.ok(depthForFootY(610) > depthForFootY(510));
  assert.equal(depthForFootY(500, 2), 5002);
});

test('movement clamps to world bounds and stops at collision rectangles', () => {
  const body = { width: 20, height: 20 };
  const bounds = { left: 0, right: 200, top: 0, bottom: 200 };
  const obstacle = [{ x: 95, y: 80, width: 30, height: 40 }];
  const blocked = resolveMovement({ x: 80, y: 110 }, { x: 30, y: 0 }, body, obstacle, bounds);
  assert.equal(blocked.x, 80);
  const clamped = resolveMovement({ x: 190, y: 190 }, { x: 50, y: 50 }, body, [], bounds);
  assert.equal(clamped.x, 190);
  assert.equal(clamped.y, 200);
});

test('area and surface lookup switches seamlessly at the park boundary', () => {
  assert.equal(areaForX(2559), 'residential');
  assert.equal(areaForX(2560), 'park');
  assert.equal(surfaceForPosition(400, 620), 'asphalt');
  assert.equal(surfaceForPosition(2800, 480), 'grass');
  assert.equal(surfaceForPosition(2800, 620), 'dirt');
});
