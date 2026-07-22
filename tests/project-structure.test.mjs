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

test('M0 project state points to M1 as the next milestone', async () => {
  const state = await readJson('PROJECT_STATE.json');
  assert.equal(state.currentMilestone, 'M0');
  assert.equal(state.nextMilestone, 'M1');
  assert.equal(state.nextTask, 'player-movement-and-first-streaming-map');
});

test('Vercel builds the Vite application into dist', async () => {
  const config = await readJson('vercel.json');
  assert.equal(config.framework, 'vite');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
});
