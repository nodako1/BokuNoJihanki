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

test('M1.2 state keeps M2 as the next gameplay milestone', async () => {
  const state = await readJson('PROJECT_STATE.json');
  assert.equal(state.currentMilestone, 'M1.2');
  assert.equal(state.nextMilestone, 'M2');
  assert.equal(state.nextTask, 'vending-machine-search-and-money-system');
  assert.equal(state.developmentRulesVersion, '2.3');
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

test('M1.2 manifest records the painterly raster set', async () => {
  const assets = await readJson('public/assets/images/m12/asset-manifest.json');
  assert.equal(assets.revision, 'M1.2');
  assert.match(assets.license, /Project-original/);
  assert.ok(assets.files.length >= 40);
  for (const asset of [
    'bg-residential-west-morning.webp',
    'bg-residential-west-night.webp',
    'bg-park-west-day.webp',
    'fg-park-west-morning.webp',
    'player-up-0.webp',
    'player-left-0.webp',
    'player-right-0.webp',
  ]) assert.ok(assets.files.includes(asset), `${asset} should be listed`);
});
