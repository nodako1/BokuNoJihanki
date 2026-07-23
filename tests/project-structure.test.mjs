import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readJson(path) { return JSON.parse(await readFile(path, 'utf-8')); }

test('PWA is configured for a landscape standalone experience', async () => {
  const manifest = await readJson('public/manifest.webmanifest');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'ja');
});

test('M1.3 state keeps M2 as the next gameplay milestone', async () => {
  const state = await readJson('PROJECT_STATE.json');
  assert.equal(state.currentMilestone, 'M1.3');
  assert.equal(state.nextMilestone, 'M2');
  assert.equal(state.nextTask, 'vending-machine-search-and-money-system');
  assert.equal(state.developmentRulesVersion, '2.4');
});

test('Vercel only deploys main to the normal production flow', async () => {
  const config = await readJson('vercel.json');
  assert.equal(config.framework, 'vite');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  for (const pattern of ['feat/**','feature/**','fix/**','chore/**','docs/**','codex/**','ci/**','diag/**','test/**']) {
    assert.equal(config.git.deploymentEnabled[pattern], false);
  }
});

test('M1.3 manifest records unique residential sections and a 36-frame atlas', async () => {
  const assets = await readJson('public/assets/images/m13/asset-manifest.json');
  assert.equal(assets.revision, 'M1.3');
  assert.match(assets.license, /Project-original/);
  assert.deepEqual(Object.keys(assets.sections), ['home-front','life-road','alley-corner','vending-crossing']);
  for (const section of Object.keys(assets.sections)) {
    for (const phase of ['morning','day','evening','night']) {
      assert.ok(assets.files.includes(`bg-${section}-${phase}.webp`));
    }
  }
  assert.ok(assets.files.includes('player-atlas.webp'));
  assert.ok(assets.files.includes('player-atlas.json'));
});

test('player atlas contains idle and eight walking frames for every direction', async () => {
  const atlas = await readJson('public/assets/images/m13/player-atlas.json');
  for (const direction of ['down','up','left','right']) {
    assert.ok(atlas.frames[`idle-${direction}`]);
    for (let frame = 0; frame < 8; frame += 1) {
      assert.ok(atlas.frames[`walk-${direction}-${frame}`], `${direction} frame ${frame}`);
    }
  }
});
