import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

test('PWA is configured for a landscape standalone experience', async () => {
  const manifest = await readJson('public/manifest.webmanifest');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'ja');
});

test('M1 state points to vending-machine interaction as M2', async () => {
  const state = await readJson('PROJECT_STATE.json');
  assert.equal(state.currentMilestone, 'M1');
  assert.equal(state.nextMilestone, 'M2');
  assert.equal(state.nextTask, 'vending-machine-search-and-money-system');
  assert.equal(state.developmentRulesVersion, '2.1');
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

test('M1 asset manifest records an original reusable vector set', async () => {
  const assets = await readJson('public/assets/images/m1/asset-manifest.json');
  assert.equal(assets.version, '0.1.0');
  assert.match(assets.license, /Project-original/);
  assert.ok(assets.files.length >= 20);
  assert.ok(assets.files.includes('player-down-0'));
  assert.ok(assets.files.includes('vending'));
});
