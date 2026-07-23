import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isFootprintValid } from '../src/game/systems/walkableMovement.mjs';

const map = JSON.parse(await readFile('src/game/world/residential-m13-map.json', 'utf-8'));
const layer = (name) => map.layers.find((item) => item.name === name);
const polygons = (name) => (layer(name).objects ?? []).filter((item) => Array.isArray(item.polygon)).map((item) => item.polygon);

test('M1.3 map provides all authored Tiled-compatible layers', () => {
  for (const name of [
    'background-far','background-main','ground','walkable','obstacles','occlusion',
    'interactions','exits','spawn-points','camera-bounds','debug-labels',
  ]) assert.ok(layer(name), `missing ${name}`);
});

test('residential map is four screens wide and excludes park interior', () => {
  const worldWidth = map.properties.find((item) => item.name === 'worldWidth').value;
  assert.equal(worldWidth, 5120);
  assert.equal(layer('background-main').objects.length, 4);
  assert.equal(layer('background-main').objects.some((item) => String(item.name).includes('park')), false);
});

test('spawn is walkable and private property samples are not', () => {
  const walk = polygons('walkable');
  const obstacles = polygons('obstacles');
  const spawn = layer('spawn-points').objects[0];
  assert.equal(isFootprintValid({ x: spawn.x, y: spawn.y }, 12, walk, obstacles), true);
  for (const sample of [
    { x: 180, y: 250 }, // house / private property
    { x: 700, y: 260 }, // garden
    { x: 1400, y: 250 }, // second section houses
    { x: 4100, y: 240 }, // final section houses
  ]) assert.equal(isFootprintValid(sample, 12, walk, obstacles), false, `private sample should be blocked: ${JSON.stringify(sample)}`);
});

test('authored poles, vending machine and park barrier are obstacles', () => {
  const obstacles = layer('obstacles').objects;
  for (const name of ['pole-home','pole-life','pole-alley','pole-cross','vending-cross','park-barrier']) {
    assert.ok(obstacles.some((item) => item.name === name), `missing obstacle ${name}`);
  }
});
