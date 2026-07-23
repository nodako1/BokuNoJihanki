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
  'public/assets/images/m13/asset-manifest.json',
  'public/assets/images/m13/bg-home-front-morning.webp',
  'public/assets/images/m13/bg-life-road-day.webp',
  'public/assets/images/m13/bg-alley-corner-evening.webp',
  'public/assets/images/m13/bg-vending-crossing-night.webp',
  'public/assets/images/m13/player-atlas.webp',
  'public/assets/images/m13/player-atlas.json',
  '.github/workflows/production-smoke.yml',
  '.github/workflows/browser-smoke.yml',
  'tools/art/generate_m13_assets.py',
  'tools/art/reference/parts/part-00.b64',
  'scripts/browser-smoke.mjs',
  'src/game/scenes/ResidentialScene.ts',
  'src/game/systems/inputSystem.ts',
  'src/game/systems/walkableMovement.mjs',
  'src/game/systems/AreaTransitionSystem.ts',
  'src/game/systems/areaTransitionState.mjs',
  'src/game/world/ResidentialWorld.ts',
  'src/game/world/m13Map.ts',
  'src/game/world/residential-m13-map.json',
  'src/game/world/AtmosphereLayer.ts',
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
  'docs/specs/M1_3_RESIDENTIAL_VERTICAL_SLICE.md',
];

const failures = [];
for (const file of requiredFiles) {
  try { await access(file); } catch { failures.push(`Missing required file: ${file}`); }
}

const [packageJson, packageLock, projectState, manifest, vercel, assetManifest, playerAtlas, mapData, createGame, residentialScene, mapModule, browserSmoke, productionSmoke] = await Promise.all([
  readFile('package.json', 'utf-8').then(JSON.parse),
  readFile('package-lock.json', 'utf-8').then(JSON.parse),
  readFile('PROJECT_STATE.json', 'utf-8').then(JSON.parse),
  readFile('public/manifest.webmanifest', 'utf-8').then(JSON.parse),
  readFile('vercel.json', 'utf-8').then(JSON.parse),
  readFile('public/assets/images/m13/asset-manifest.json', 'utf-8').then(JSON.parse),
  readFile('public/assets/images/m13/player-atlas.json', 'utf-8').then(JSON.parse),
  readFile('src/game/world/residential-m13-map.json', 'utf-8').then(JSON.parse),
  readFile('src/game/createGame.ts', 'utf-8'),
  readFile('src/game/scenes/ResidentialScene.ts', 'utf-8'),
  readFile('src/game/world/m13Map.ts', 'utf-8'),
  readFile('scripts/browser-smoke.mjs', 'utf-8'),
  readFile('.github/workflows/production-smoke.yml', 'utf-8'),
]);

if (packageJson.name !== 'boku-no-jihanki') failures.push('package.json name must be boku-no-jihanki.');
if (packageJson.version !== '0.1.0') failures.push('package.json version remains 0.1.0 through M1.3.');
if (packageLock.version !== packageJson.version || packageLock.packages?.['']?.version !== packageJson.version) failures.push('package-lock root version must match package.json.');
if (projectState.currentMilestone !== 'M1.3') failures.push('PROJECT_STATE currentMilestone must be M1.3.');
if (projectState.nextMilestone !== 'M2') failures.push('PROJECT_STATE nextMilestone must be M2.');
if (projectState.developmentRulesVersion !== '2.4') failures.push('PROJECT_STATE developmentRulesVersion must be 2.4.');
if (manifest.orientation !== 'landscape' || manifest.display !== 'standalone') failures.push('PWA must remain landscape standalone.');
if (vercel.framework !== 'vite' || vercel.outputDirectory !== 'dist') failures.push('Vercel must build Vite into dist.');
for (const pattern of ['feat/**','feature/**','fix/**','chore/**','docs/**','codex/**','ci/**','diag/**','test/**']) {
  if (vercel.git?.deploymentEnabled?.[pattern] !== false) failures.push(`Normal Vercel deployment for ${pattern} must remain disabled.`);
}
if (!createGame.includes('ResidentialScene') || createGame.includes('scene: [ExplorationScene]')) failures.push('Phaser must start ResidentialScene for M1.3.');
for (const marker of ['resolveWalkableMovement', 'M13_PLAYER_ATLAS_KEY', 'walk-', 'FOOT_RADIUS', 'CAMERA_LOOK_AHEAD']) {
  if (!residentialScene.includes(marker)) failures.push(`ResidentialScene is missing ${marker}.`);
}
if (!mapModule.includes('residential-m13-map.json')) failures.push('M1.3 map module must load the authored Tiled-compatible JSON.');
if (assetManifest.revision !== 'M1.3' || !Array.isArray(assetManifest.files) || assetManifest.files.length < 50) failures.push('M1.3 asset manifest must describe the residential art set.');
if (Object.keys(assetManifest.sections ?? {}).length !== 4) failures.push('M1.3 asset manifest must define four distinct residential sections.');
for (const direction of ['down','up','left','right']) {
  if (!playerAtlas.frames?.[`idle-${direction}`]) failures.push(`Player atlas is missing idle-${direction}.`);
  for (let frame = 0; frame < 8; frame += 1) {
    if (!playerAtlas.frames?.[`walk-${direction}-${frame}`]) failures.push(`Player atlas is missing walk-${direction}-${frame}.`);
  }
}
const requiredLayers = ['background-far','background-main','ground','walkable','obstacles','occlusion','interactions','exits','spawn-points','camera-bounds','debug-labels'];
for (const name of requiredLayers) {
  if (!mapData.layers.some((layer) => layer.name === name)) failures.push(`M1.3 map is missing layer ${name}.`);
}
if (mapData.layers.find((layer) => layer.name === 'background-main')?.objects?.length !== 4) failures.push('M1.3 must contain four authored residential sections.');
for (const evidence of ['02-home-front.png','03-walk-right.png','04-walk-left.png','05-walk-down.png','06-walk-up.png','07-walkable-collision-debug.png','08-life-road.png','09-alley-corner.png','10-vending-crossing.png','11-morning.png','12-noon.png','13-evening.png','14-night.png']) {
  if (!browserSmoke.includes(evidence)) failures.push(`Browser Smoke must capture ${evidence}.`);
}
if (!browserSmoke.includes('sectionShots.size !== 3')) failures.push('Browser Smoke must traverse every residential section.');
if (!productionSmoke.includes('M1.3 RESIDENTIAL HUD') || !productionSmoke.includes('/assets/images/m13')) failures.push('Production Smoke must verify M1.3 runtime markers.');

if (failures.length) {
  console.error('Project validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Project validation passed (${requiredFiles.length} required files).`);
}
