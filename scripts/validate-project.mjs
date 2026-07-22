import { access, readFile } from 'node:fs/promises';
import process from 'node:process';

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'PROJECT_STATE.json',
  'README.md',
  'vercel.json',
  'public/manifest.webmanifest',
  'public/assets/images/m1/asset-manifest.json',
  '.github/workflows/production-smoke.yml',
  '.github/workflows/browser-smoke.yml',
  'scripts/browser-smoke.mjs',
  'src/game/world/generatedAssets.ts',
  'src/game/scenes/ExplorationScene.ts',
  'src/game/systems/inputSystem.ts',
  'src/game/systems/worldMath.mjs',
  'src/game/world/MapStreamer.ts',
  'src/game/world/AtmosphereLayer.ts',
  'src/game/world/worldConfig.ts',
  'src/ui/GameHud.tsx',
  'src/ui/DeveloperHud.tsx',
  'src/ui/VirtualJoystick.tsx',
  'docs/PRODUCT_VISION.md',
  'docs/ARCHITECTURE.md',
  'docs/DEVELOPMENT_RULES.md',
  'docs/ART_DIRECTION.md',
  'docs/AUDIO_GUIDE.md',
  'docs/ROADMAP.md',
  'docs/TESTING.md',
  'docs/DEPLOYMENT.md',
  'docs/specs/M0_FOUNDATION.md',
  'docs/specs/M1.md',
];

const failures = [];

for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    failures.push(`Missing required file: ${file}`);
  }
}

const [
  packageJson,
  packageLock,
  projectState,
  manifest,
  vercel,
  assetManifest,
  createGame,
  explorationScene,
] = await Promise.all([
  readFile('package.json', 'utf-8').then(JSON.parse),
  readFile('package-lock.json', 'utf-8').then(JSON.parse),
  readFile('PROJECT_STATE.json', 'utf-8').then(JSON.parse),
  readFile('public/manifest.webmanifest', 'utf-8').then(JSON.parse),
  readFile('vercel.json', 'utf-8').then(JSON.parse),
  readFile('public/assets/images/m1/asset-manifest.json', 'utf-8').then(JSON.parse),
  readFile('src/game/createGame.ts', 'utf-8'),
  readFile('src/game/scenes/ExplorationScene.ts', 'utf-8'),
]);

if (packageJson.name !== 'boku-no-jihanki') {
  failures.push('package.json name must be boku-no-jihanki.');
}
if (packageJson.version !== '0.1.0') {
  failures.push('package.json version must be 0.1.0 for M1.');
}
if (packageLock.version !== packageJson.version || packageLock.packages?.['']?.version !== packageJson.version) {
  failures.push('package-lock.json root version must match package.json.');
}
if (projectState.currentMilestone !== 'M1') {
  failures.push('PROJECT_STATE.json currentMilestone must be M1.');
}
if (projectState.nextMilestone !== 'M2') {
  failures.push('PROJECT_STATE.json nextMilestone must be M2.');
}
if (projectState.developmentRulesVersion !== '2.1') {
  failures.push('PROJECT_STATE.json developmentRulesVersion must be 2.1.');
}
if (manifest.orientation !== 'landscape') {
  failures.push('PWA manifest orientation must be landscape.');
}
if (manifest.display !== 'standalone') {
  failures.push('PWA manifest display must be standalone.');
}
if (vercel.framework !== 'vite' || vercel.outputDirectory !== 'dist') {
  failures.push('Vercel must build the Vite app into dist.');
}
for (const pattern of ['feat/**', 'feature/**', 'fix/**', 'chore/**', 'docs/**', 'codex/**', 'ci/**', 'diag/**', 'test/**']) {
  if (vercel.git?.deploymentEnabled?.[pattern] !== false) {
    failures.push(`Normal Vercel deployment for ${pattern} must remain disabled.`);
  }
}
if (!createGame.includes('ExplorationScene') || createGame.includes('scene: [FoundationScene]')) {
  failures.push('Phaser must start the M1 ExplorationScene.');
}
if (!explorationScene.includes('data:image/svg+xml;base64')) {
  failures.push('Generated SVG assets must use a valid base64 data URL for the Phaser loader.');
}
if (!Array.isArray(assetManifest.files) || assetManifest.files.length < 20) {
  failures.push('M1 asset manifest must contain at least 20 original SVG assets.');
}

if (failures.length > 0) {
  console.error('Project validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Project validation passed (${requiredFiles.length} required files).`);
}
