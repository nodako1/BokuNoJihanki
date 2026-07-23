import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const M14_AREAS = ['home-street', 'life-road', 'upper-vending-lane'];
const M14_PHASES = ['morning', 'day', 'evening', 'night'];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

test('PWA is configured for a landscape standalone experience', async () => {
  const manifest = await readJson('public/manifest.webmanifest');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'ja');
});

test('M1.4 state keeps M2 paused as the next gameplay milestone', async () => {
  const state = await readJson('PROJECT_STATE.json');
  assert.equal(state.currentMilestone, 'M1.4');
  assert.equal(state.nextMilestone, 'M2');
  assert.equal(state.developmentRulesVersion, '2.4');
  assert.match(
    state.nextTask,
    /^(m1\.4-production-browser-smoke-and-visual-verification|m2-vending-machine-scene-integration)$/,
  );
});

test('Vercel only deploys main to the normal production flow', async () => {
  const config = await readJson('vercel.json');
  assert.equal(config.framework, 'vite');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  for (const pattern of [
    'feat/**',
    'feature/**',
    'fix/**',
    'chore/**',
    'docs/**',
    'codex/**',
    'ci/**',
    'diag/**',
    'test/**',
  ]) {
    assert.equal(config.git.deploymentEnabled[pattern], false);
  }
});

test('M1.4 manifest records three original areas and four time phases', async () => {
  const assets = await readJson('public/assets/images/m14/asset-manifest.json');
  assert.equal(assets.revision, 'M1.4');
  assert.match(assets.license, /Project-original/);
  assert.deepEqual(Object.keys(assets.areas), M14_AREAS);
  assert.equal(new Set(assets.files).size, assets.files.length);
  for (const area of M14_AREAS) {
    assert.ok(assets.areas[area].worldWidth >= 2200);
    assert.ok(assets.areas[area].worldWidth <= 3200);
    assert.ok(assets.files.includes(`fg-${area}.webp`));
    for (const phase of M14_PHASES) {
      assert.ok(assets.files.includes(`bg-${area}-${phase}.webp`));
    }
  }
  assert.equal(assets.player.idleFramesPerDirection, 4);
  assert.equal(assets.player.walkFramesPerDirection, 10);
  assert.ok(assets.files.includes('player-atlas.webp'));
  assert.ok(assets.files.includes('player-atlas.json'));
});

test('M1.4 player atlas contains four idle and ten walking frames per side', async () => {
  const atlas = await readJson('public/assets/images/m14/player-atlas.json');
  assert.equal(Object.keys(atlas.frames).length, 28);
  for (const direction of ['left', 'right']) {
    for (let frame = 0; frame < 4; frame += 1) {
      assert.ok(atlas.frames[`idle-${direction}-${frame}`], `${direction} idle ${frame}`);
    }
    for (let frame = 0; frame < 10; frame += 1) {
      assert.ok(atlas.frames[`walk-${direction}-${frame}`], `${direction} walk ${frame}`);
    }
  }
});

test('M1.4 production scene is wired through the adapter and accessible arrow UI', async () => {
  const [createGame, scene, world, adapter, arrow, hud] = await Promise.all([
    readFile('src/game/createGame.ts', 'utf-8'),
    readFile('src/game/scenes/SideScrollTownScene.ts', 'utf-8'),
    readFile('src/game/areas/M14AreaWorld.ts', 'utf-8'),
    readFile('src/game/navigationAdapter/m14NavigationAdapter.mjs', 'utf-8'),
    readFile('src/ui/AreaArrowButton.tsx', 'utf-8'),
    readFile('src/ui/DeveloperHud.tsx', 'utf-8'),
  ]);
  assert.match(createGame, /scene: \[SideScrollTownScene, ResidentialScene\]/);
  for (const marker of [
    'stepHorizontalMovement',
    'resolveAreaExit',
    'getAvailableBranchDirections',
    'getM14CameraScrollX',
  ]) {
    assert.ok(scene.includes(marker), marker);
    assert.ok(adapter.includes(marker), marker);
  }
  assert.match(world, /\/assets\/images\/m14/);
  assert.match(arrow, /上のエリアへ移動/);
  assert.match(arrow, /下のエリアへ移動/);
  assert.match(hud, /M1\.4 SIDE-SCROLL HUD/);
});

test('M1.3 residential scene, art, atlas and authored map remain preserved', async () => {
  const [assets, atlas, map, createGame] = await Promise.all([
    readJson('public/assets/images/m13/asset-manifest.json'),
    readJson('public/assets/images/m13/player-atlas.json'),
    readJson('src/game/world/residential-m13-map.json'),
    readFile('src/game/createGame.ts', 'utf-8'),
  ]);
  assert.equal(assets.revision, 'M1.3');
  assert.deepEqual(
    Object.keys(assets.sections),
    ['home-front', 'life-road', 'alley-corner', 'vending-crossing'],
  );
  assert.equal(Object.keys(atlas.frames).length, 36);
  assert.equal(
    map.layers.find((layer) => layer.name === 'background-main').objects.length,
    4,
  );
  assert.match(createGame, /ResidentialScene/);
});
