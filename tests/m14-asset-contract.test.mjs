import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  M14_AREA_DEFINITIONS,
  M14_AREA_IDS,
} from '../src/game/areas/m14AreaData.mjs';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ASSET_ROOT = join(REPO_ROOT, 'public/assets/images/m14');
const MANIFEST_PATH = join(ASSET_ROOT, 'asset-manifest.json');
const ATLAS_PATH = join(ASSET_ROOT, 'player-atlas.json');
const AREA_IDS = [
  'home-street',
  'life-road',
  'upper-vending-lane',
];
const TIME_PHASES = ['morning', 'day', 'evening', 'night'];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function assertNonEmptyFile(path) {
  const fileStat = await stat(path);
  assert.ok(fileStat.isFile(), `${path} must be a regular file`);
  assert.ok(fileStat.size > 0, `${path} must not be empty`);
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

test('M1.4 manifest and runtime share the exact three area dimensions', async () => {
  const manifest = await readJson(MANIFEST_PATH);

  assert.deepEqual(M14_AREA_IDS, AREA_IDS);
  assert.deepEqual(Object.keys(M14_AREA_DEFINITIONS), AREA_IDS);
  assert.deepEqual(Object.keys(manifest.areas), AREA_IDS);

  for (const areaId of AREA_IDS) {
    const manifestArea = manifest.areas[areaId];
    const runtimeArea = M14_AREA_DEFINITIONS[areaId];
    assert.equal(
      manifestArea.worldWidth,
      runtimeArea.worldWidth,
      `${areaId} worldWidth differs between manifest and runtime`,
    );
    assert.equal(
      manifestArea.groundY,
      runtimeArea.groundY,
      `${areaId} groundY differs between manifest and runtime`,
    );
  }
});

test('M1.4 backgrounds and foregrounds are complete and visually distinct assets', async () => {
  const manifest = await readJson(MANIFEST_PATH);
  const expectedBackgrounds = AREA_IDS.flatMap((areaId) => (
    TIME_PHASES.map((phase) => `bg-${areaId}-${phase}.webp`)
  ));
  const backgroundFiles = manifest.files.filter((file) => file.startsWith('bg-'));

  assert.deepEqual(
    [...backgroundFiles].sort(),
    [...expectedBackgrounds].sort(),
    'manifest must enumerate exactly 12 authored time-of-day backgrounds',
  );

  const backgroundPaths = expectedBackgrounds.map((file) => join(ASSET_ROOT, file));
  await Promise.all(backgroundPaths.map(assertNonEmptyFile));
  const backgroundHashes = await Promise.all(backgroundPaths.map(sha256));
  assert.equal(
    new Set(backgroundHashes).size,
    12,
    'all 12 time-of-day backgrounds must have unique SHA-256 hashes',
  );

  const foregroundFiles = AREA_IDS.map((areaId) => manifest.areas[areaId].foreground);
  assert.equal(
    new Set(foregroundFiles).size,
    AREA_IDS.length,
    'each area must reference a different foreground',
  );
  const foregroundPaths = foregroundFiles.map((file) => join(ASSET_ROOT, file));
  await Promise.all(foregroundPaths.map(assertNonEmptyFile));
  const foregroundHashes = await Promise.all(foregroundPaths.map(sha256));
  assert.equal(
    new Set(foregroundHashes).size,
    AREA_IDS.length,
    'all three foregrounds must have unique SHA-256 hashes',
  );

  const masterPaths = AREA_IDS.map((areaId) => manifest.areas[areaId].master);
  assert.equal(
    new Set(masterPaths).size,
    AREA_IDS.length,
    'each area must reference a different source master',
  );
  await Promise.all(
    masterPaths.map((path) => assertNonEmptyFile(join(REPO_ROOT, path))),
  );
});

test('M1.4 player atlas has the exact 28-frame side-view contract', async () => {
  const [manifest, atlas] = await Promise.all([
    readJson(MANIFEST_PATH),
    readJson(ATLAS_PATH),
  ]);
  const expectedFrameNames = ['left', 'right'].flatMap((direction) => [
    ...Array.from(
      { length: 4 },
      (_, index) => `idle-${direction}-${index}`,
    ),
    ...Array.from(
      { length: 10 },
      (_, index) => `walk-${direction}-${index}`,
    ),
  ]);
  const frameNames = Object.keys(atlas.frames);

  assert.equal(frameNames.length, 28);
  assert.deepEqual([...frameNames].sort(), [...expectedFrameNames].sort());
  assert.deepEqual(manifest.player.directions, ['left', 'right']);
  assert.equal(manifest.player.idleFramesPerDirection, 4);
  assert.equal(manifest.player.walkFramesPerDirection, 10);
  assert.deepEqual(manifest.player.contactFrames, [2, 7]);

  for (const direction of ['left', 'right']) {
    assert.equal(
      frameNames.filter((name) => name.startsWith(`idle-${direction}-`)).length,
      4,
      `${direction} must have four idle frames`,
    );
    assert.equal(
      frameNames.filter((name) => name.startsWith(`walk-${direction}-`)).length,
      10,
      `${direction} must have ten walk frames`,
    );
  }

  for (const [frameName, frameData] of Object.entries(atlas.frames)) {
    assert.deepEqual(
      [frameData.frame.w, frameData.frame.h],
      [128, 192],
      `${frameName} atlas frame must be 128x192`,
    );
    assert.deepEqual(
      [frameData.sourceSize.w, frameData.sourceSize.h],
      [128, 192],
      `${frameName} source frame must be 128x192`,
    );
  }
});

test('every manifest file exists and manifest filenames are unique', async () => {
  const manifest = await readJson(MANIFEST_PATH);

  assert.equal(
    new Set(manifest.files).size,
    manifest.files.length,
    'manifest.files must not contain duplicate paths',
  );
  assert.equal(
    new Set(manifest.files.map((file) => basename(file))).size,
    manifest.files.length,
    'manifest.files must not contain duplicate filenames',
  );
  await Promise.all(
    manifest.files.map((file) => assertNonEmptyFile(join(ASSET_ROOT, file))),
  );
});
