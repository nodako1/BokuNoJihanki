import { access, readFile } from 'node:fs/promises';
import process from 'node:process';

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'PROJECT_STATE.json',
  'README.md',
  'vercel.json',
  'public/manifest.webmanifest',
  'public/assets/images/m12/asset-manifest.json',
  'public/assets/images/m12/bg-residential-west-morning.webp',
  'public/assets/images/m12/bg-residential-west-night.webp',
  'public/assets/images/m12/bg-park-west-day.webp',
  'public/assets/images/m12/fg-park-west-morning.webp',
  'public/assets/images/m12/player-up-0.webp',
  '.github/workflows/generate-m12-raster-assets.yml',
  '.github/workflows/production-smoke.yml',
  '.github/workflows/browser-smoke.yml',
  'tools/art/generate_m12_assets.py',
  'tools/art/reference/parts/part-00.b64',
  'scripts/browser-smoke.mjs',
  'src/game/scenes/ExplorationScene.ts',
  'src/game/systems/inputSystem.ts',
  'src/game/systems/worldMath.mjs',
  'src/game/world/MapStreamer.ts',
  'src/game/world/AtmosphereLayer.ts',
  'src/game/world/m12RasterAssets.ts',
  'src/game/world/worldConfig.ts',
  'src/ui/GameHud.tsx',
  'src/ui/DeveloperHud.tsx',
  'src/ui/VirtualJoystick.tsx',
  'docs/PRODUCT_VISION.md',
  'docs/ARCHITECTURE.md',
  'docs/DEVELOPMENT_RULES.md',
  'docs/ART_DIRECTION.md',
  'docs/ASSET_PROVENANCE.md',
  'docs/AUDIO_GUIDE.md',
  'docs/ROADMAP.md',
  'docs/TESTING.md',
  'docs/DEPLOYMENT.md',
  'docs/specs/M0_FOUNDATION.md',
  'docs/specs/M1.md',
  'docs/specs/M1_1_VISUAL.md',
  'docs/specs/M1_2_PAINTERLY.md',
];

const failures = [];
for (const file of requiredFiles) {
  try { await access(file); } catch { failures.push(`Missing required file: ${file}`); }
}

const [packageJson, packageLock, projectState, manifest, vercel, assetManifest, createGame, explorationScene, rasterAssets, browserSmoke] = await Promise.all([
  readFile('package.json', 'utf-8').then(JSON.parse),
  readFile('package-lock.json', 'utf-8').then(JSON.parse),
  readFile('PROJECT_STATE.json', 'utf-8').then(JSON.parse),
  readFile('public/manifest.webmanifest', 'utf-8').then(JSON.parse),
  readFile('vercel.json', 'utf-8').then(JSON.parse),
  readFile('public/assets/images/m12/asset-manifest.json', 'utf-8').then(JSON.parse),
  readFile('src/game/createGame.ts', 'utf-8'),
  readFile('src/game/scenes/ExplorationScene.ts', 'utf-8'),
  readFile('src/game/world/m12RasterAssets.ts', 'utf-8'),
  readFile('scripts/browser-smoke.mjs', 'utf-8'),
]);

if (packageJson.name !== 'boku-no-jihanki') failures.push('package.json name must be boku-no-jihanki.');
if (packageJson.version !== '0.1.0') failures.push('package.json version remains 0.1.0 through M1.2.');
if (packageLock.version !== packageJson.version || packageLock.packages?.['']?.version !== packageJson.version) failures.push('package-lock root version must match package.json.');
if (projectState.currentMilestone !== 'M1.2') failures.push('PROJECT_STATE currentMilestone must be M1.2.');
if (projectState.nextMilestone !== 'M2') failures.push('PROJECT_STATE nextMilestone must be M2.');
if (projectState.developmentRulesVersion !== '2.3') failures.push('PROJECT_STATE developmentRulesVersion must be 2.3.');
if (manifest.orientation !== 'landscape' || manifest.display !== 'standalone') failures.push('PWA must remain landscape standalone.');
if (vercel.framework !== 'vite' || vercel.outputDirectory !== 'dist') failures.push('Vercel must build Vite into dist.');
for (const pattern of ['feat/**','feature/**','fix/**','chore/**','docs/**','codex/**','ci/**','diag/**','test/**']) {
  if (vercel.git?.deploymentEnabled?.[pattern] !== false) failures.push(`Normal Vercel deployment for ${pattern} must remain disabled.`);
}
if (!createGame.includes('ExplorationScene')) failures.push('Phaser must start ExplorationScene.');
if (!explorationScene.includes('M12_CHUNK_IDS') || !explorationScene.includes('m12BackgroundPath')) failures.push('ExplorationScene must load M1.2 raster assets.');
if (!rasterAssets.includes("M12_RASTER_ROOT = '/assets/images/m12'")) failures.push('M1.2 raster root must be declared.');
if (assetManifest.revision !== 'M1.2' || !Array.isArray(assetManifest.files) || assetManifest.files.length < 40) failures.push('M1.2 asset manifest must describe at least 40 raster files.');
for (const expected of ['bg-residential-west-morning.webp','bg-residential-west-night.webp','bg-park-west-day.webp','fg-park-west-morning.webp','player-up-0.webp','player-left-0.webp']) {
  if (!assetManifest.files.includes(expected)) failures.push(`M1.2 asset manifest is missing ${expected}.`);
}
for (const evidence of ['02-morning-residential.png','03-noon-residential.png','04-evening-residential.png','05-night-residential.png','06-morning-park.png']) {
  if (!browserSmoke.includes(evidence)) failures.push(`Browser Smoke must capture ${evidence}.`);
}
if (!browserSmoke.includes('current.playerX >= 3150')) failures.push('Browser Smoke must reach the park interior.');

if (failures.length) {
  console.error('Project validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Project validation passed (${requiredFiles.length} required files).`);
}
