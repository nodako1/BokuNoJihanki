import { access, readFile } from 'node:fs/promises';
import process from 'node:process';

const M14_AREAS = ['home-street', 'life-road', 'upper-vending-lane'];
const M14_PHASES = ['morning', 'day', 'evening', 'night'];
const M14_SCREENSHOTS = [
  '01-title.png',
  '02-home-street.png',
  '03-walk-right.png',
  '04-walk-left.png',
  '05-home-right-edge.png',
  '06-transition-loading.png',
  '07-life-road.png',
  '08-returned-home.png',
  '09-up-arrow.png',
  '10-upper-vending-lane.png',
  '11-down-arrow.png',
  '12-morning.png',
  '13-day.png',
  '14-evening.png',
  '15-night.png',
];

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'PROJECT_STATE.json',
  'README.md',
  'vercel.json',
  'public/manifest.webmanifest',
  'public/assets/images/m14/asset-manifest.json',
  'public/assets/images/m14/player-atlas.webp',
  'public/assets/images/m14/player-atlas.json',
  'public/assets/images/m13/asset-manifest.json',
  'public/assets/images/m13/player-atlas.webp',
  'public/assets/images/m13/player-atlas.json',
  'public/assets/images/m13/bg-home-front-morning.webp',
  'public/assets/images/m13/bg-life-road-day.webp',
  'public/assets/images/m13/bg-alley-corner-evening.webp',
  'public/assets/images/m13/bg-vending-crossing-night.webp',
  '.github/workflows/production-smoke.yml',
  '.github/workflows/browser-smoke.yml',
  'tools/art/generate_m14_assets.py',
  'tools/art/generate_m13_assets.py',
  'tools/art/reference/parts/part-00.b64',
  'scripts/browser-smoke.mjs',
  'src/game/createGame.ts',
  'src/game/gameBridge.ts',
  'src/game/scenes/SideScrollTownScene.ts',
  'src/game/scenes/ResidentialScene.ts',
  'src/game/areas/M14AreaWorld.ts',
  'src/game/areas/m14AreaData.mjs',
  'src/game/navigationAdapter/m14NavigationAdapter.mjs',
  'src/game/systems/SideScrollInputSystem.ts',
  'src/game/systems/walkableMovement.mjs',
  'src/game/world/m13Map.ts',
  'src/game/world/residential-m13-map.json',
  'src/ui/AreaArrowButton.tsx',
  'src/ui/GameHud.tsx',
  'src/ui/DeveloperHud.tsx',
  'src/ui/VirtualJoystick.tsx',
  'docs/specs/M1_3_RESIDENTIAL_VERTICAL_SLICE.md',
  'docs/specs/M1_4_SIDE_SCROLL_TOWN.md',
  'docs/PRODUCT_VISION.md',
  'docs/ARCHITECTURE.md',
  'docs/DEVELOPMENT_RULES.md',
  'docs/ART_DIRECTION.md',
  'docs/ASSET_PROVENANCE.md',
  'docs/AUDIO_GUIDE.md',
  'docs/ROADMAP.md',
  'docs/TESTING.md',
  'docs/DEPLOYMENT.md',
];

for (const area of M14_AREAS) {
  requiredFiles.push(`public/assets/images/m14/fg-${area}.webp`);
  for (const phase of M14_PHASES) {
    requiredFiles.push(`public/assets/images/m14/bg-${area}-${phase}.webp`);
  }
}

const failures = [];
for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    failures.push(`Missing required file: ${file}`);
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'));
  } catch (error) {
    failures.push(`Unable to read JSON ${file}: ${error.message}`);
    return {};
  }
}

async function readText(file) {
  try {
    return await readFile(file, 'utf-8');
  } catch (error) {
    failures.push(`Unable to read ${file}: ${error.message}`);
    return '';
  }
}

const [
  packageJson,
  packageLock,
  projectState,
  webManifest,
  vercel,
  m14Manifest,
  m14Atlas,
  m13Manifest,
  m13Atlas,
  m13Map,
  createGame,
  sideScrollScene,
  areaWorld,
  areaData,
  navigationAdapter,
  gameBridge,
  areaArrowButton,
  gameHud,
  developerHud,
  browserSmoke,
  productionSmoke,
] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('PROJECT_STATE.json'),
  readJson('public/manifest.webmanifest'),
  readJson('vercel.json'),
  readJson('public/assets/images/m14/asset-manifest.json'),
  readJson('public/assets/images/m14/player-atlas.json'),
  readJson('public/assets/images/m13/asset-manifest.json'),
  readJson('public/assets/images/m13/player-atlas.json'),
  readJson('src/game/world/residential-m13-map.json'),
  readText('src/game/createGame.ts'),
  readText('src/game/scenes/SideScrollTownScene.ts'),
  readText('src/game/areas/M14AreaWorld.ts'),
  readText('src/game/areas/m14AreaData.mjs'),
  readText('src/game/navigationAdapter/m14NavigationAdapter.mjs'),
  readText('src/game/gameBridge.ts'),
  readText('src/ui/AreaArrowButton.tsx'),
  readText('src/ui/GameHud.tsx'),
  readText('src/ui/DeveloperHud.tsx'),
  readText('scripts/browser-smoke.mjs'),
  readText('.github/workflows/production-smoke.yml'),
]);

if (packageJson.name !== 'boku-no-jihanki') {
  failures.push('package.json name must be boku-no-jihanki.');
}
if (packageJson.version !== '0.1.0') {
  failures.push('package.json version remains 0.1.0 through M1.4.');
}
if (
  packageLock.version !== packageJson.version
  || packageLock.packages?.['']?.version !== packageJson.version
) {
  failures.push('package-lock root version must match package.json.');
}
if (projectState.currentMilestone !== 'M1.4') {
  failures.push('PROJECT_STATE currentMilestone must be M1.4.');
}
if (projectState.nextMilestone !== 'M2') {
  failures.push('PROJECT_STATE nextMilestone must remain M2.');
}
if (projectState.developmentRulesVersion !== '2.4') {
  failures.push('PROJECT_STATE developmentRulesVersion must remain 2.4.');
}
if (webManifest.orientation !== 'landscape' || webManifest.display !== 'standalone') {
  failures.push('PWA must remain landscape standalone.');
}
if (vercel.framework !== 'vite' || vercel.outputDirectory !== 'dist') {
  failures.push('Vercel must build Vite into dist.');
}
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
  if (vercel.git?.deploymentEnabled?.[pattern] !== false) {
    failures.push(`Normal Vercel deployment for ${pattern} must remain disabled.`);
  }
}

if (
  !createGame.includes('SideScrollTownScene')
  || !createGame.includes('scene: [SideScrollTownScene, ResidentialScene]')
) {
  failures.push('Phaser must start SideScrollTownScene and retain ResidentialScene as fallback.');
}

for (const marker of [
  'M14AreaWorld',
  'SideScrollInputSystem',
  'stepHorizontalMovement',
  'getAvailableBranchDirections',
  'resolveAreaExit',
  'getM14CameraScrollX',
  'publishAreaPrompt',
  'TRANSITION_FADE_MS = 300',
]) {
  if (!sideScrollScene.includes(marker)) {
    failures.push(`SideScrollTownScene is missing ${marker}.`);
  }
}
for (const marker of [
  "M14_ASSET_ROOT = '/assets/images/m14'",
  "['morning', 'day', 'evening', 'night']",
  'player-atlas.webp',
  'player-atlas.json',
]) {
  if (!areaWorld.includes(marker)) {
    failures.push(`M14AreaWorld is missing ${marker}.`);
  }
}
for (const marker of [
  'M14_AREA_IDS',
  'home-street',
  'life-road',
  'upper-vending-lane',
  '1220, 1480',
  '1040, 1320',
  'preserveAcrossTransition',
]) {
  if (!areaData.includes(marker)) {
    failures.push(`M1.4 area data is missing ${marker}.`);
  }
}
for (const marker of [
  'stepHorizontalMovement',
  'getAvailableBranchDirections',
  'resolveAreaExit',
  'getM14CameraScrollX',
  'isM14InputLocked',
  'reduceM14Transition',
  'validateM14AreaGraph',
]) {
  if (!navigationAdapter.includes(marker)) {
    failures.push(`M1.4 navigation adapter is missing ${marker}.`);
  }
}
for (const marker of [
  'AREA_PROMPT_EVENT',
  'AREA_TRAVERSAL_REQUEST_EVENT',
  'publishAudioMuted',
  'audioMuted',
  'cameraScrollX',
  'transitionState',
]) {
  if (!gameBridge.includes(marker)) {
    failures.push(`gameBridge is missing M1.4 marker ${marker}.`);
  }
}
for (const marker of [
  '上のエリアへ移動',
  '下のエリアへ移動',
  'requestAreaTraversal',
]) {
  if (!areaArrowButton.includes(marker)) {
    failures.push(`AreaArrowButton is missing ${marker}.`);
  }
}
if (!gameHud.includes('<AreaArrowButton />')) {
  failures.push('GameHud must render the M1.4 area arrow control.');
}
for (const marker of [
  'M1.4 SIDE-SCROLL HUD',
  'AREA_ID',
  'CAMERA',
  'TRANSITION',
  'LOCK',
  'BRANCH',
  'AUDIO',
]) {
  if (!developerHud.includes(marker)) {
    failures.push(`DeveloperHud is missing M1.4 marker ${marker}.`);
  }
}

if (m14Manifest.revision !== 'M1.4') {
  failures.push('M1.4 asset manifest revision must be M1.4.');
}
if (!/Project-original/.test(m14Manifest.license ?? '')) {
  failures.push('M1.4 asset manifest must identify project-original artwork.');
}
if (JSON.stringify(Object.keys(m14Manifest.areas ?? {})) !== JSON.stringify(M14_AREAS)) {
  failures.push('M1.4 asset manifest must define exactly the three authored areas.');
}
const m14Files = m14Manifest.files ?? [];
if (!Array.isArray(m14Files) || new Set(m14Files).size !== m14Files.length) {
  failures.push('M1.4 asset manifest files must be a unique array.');
}
for (const area of M14_AREAS) {
  const areaManifest = m14Manifest.areas?.[area];
  if (!areaManifest || areaManifest.worldWidth < 2200 || areaManifest.worldWidth > 3200) {
    failures.push(`M1.4 ${area} must have an authored side-scroll world width.`);
  }
  if (!m14Files.includes(`fg-${area}.webp`)) {
    failures.push(`M1.4 manifest is missing fg-${area}.webp.`);
  }
  for (const phase of M14_PHASES) {
    if (!m14Files.includes(`bg-${area}-${phase}.webp`)) {
      failures.push(`M1.4 manifest is missing bg-${area}-${phase}.webp.`);
    }
  }
}
if (
  m14Manifest.player?.idleFramesPerDirection !== 4
  || m14Manifest.player?.walkFramesPerDirection !== 10
) {
  failures.push('M1.4 player manifest must define 4 idle and 10 walk frames per side.');
}
for (const direction of ['left', 'right']) {
  for (let frame = 0; frame < 4; frame += 1) {
    if (!m14Atlas.frames?.[`idle-${direction}-${frame}`]) {
      failures.push(`M1.4 player atlas is missing idle-${direction}-${frame}.`);
    }
  }
  for (let frame = 0; frame < 10; frame += 1) {
    if (!m14Atlas.frames?.[`walk-${direction}-${frame}`]) {
      failures.push(`M1.4 player atlas is missing walk-${direction}-${frame}.`);
    }
  }
}
if (Object.keys(m14Atlas.frames ?? {}).length !== 28) {
  failures.push('M1.4 player atlas must contain exactly 28 side-view frames.');
}

// M1.3 remains intact as the Production fallback and design history.
if (
  m13Manifest.revision !== 'M1.3'
  || Object.keys(m13Manifest.sections ?? {}).length !== 4
  || (m13Manifest.files?.length ?? 0) < 50
) {
  failures.push('M1.3 residential asset manifest must remain intact.');
}
for (const direction of ['down', 'up', 'left', 'right']) {
  if (!m13Atlas.frames?.[`idle-${direction}`]) {
    failures.push(`Preserved M1.3 atlas is missing idle-${direction}.`);
  }
  for (let frame = 0; frame < 8; frame += 1) {
    if (!m13Atlas.frames?.[`walk-${direction}-${frame}`]) {
      failures.push(`Preserved M1.3 atlas is missing walk-${direction}-${frame}.`);
    }
  }
}
const requiredM13Layers = [
  'background-far',
  'background-main',
  'ground',
  'walkable',
  'obstacles',
  'occlusion',
  'interactions',
  'exits',
  'spawn-points',
  'camera-bounds',
  'debug-labels',
];
for (const name of requiredM13Layers) {
  if (!m13Map.layers?.some((layer) => layer.name === name)) {
    failures.push(`Preserved M1.3 map is missing layer ${name}.`);
  }
}
if (
  m13Map.layers?.find((layer) => layer.name === 'background-main')?.objects?.length !== 4
) {
  failures.push('Preserved M1.3 map must retain four residential sections.');
}

for (const screenshot of M14_SCREENSHOTS) {
  if (!browserSmoke.includes(screenshot)) {
    failures.push(`Browser Smoke must capture ${screenshot}.`);
  }
}
for (const marker of [
  'home-street',
  'life-road',
  'upper-vending-lane',
  '上のエリアへ移動',
  '下のエリアへ移動',
  'verticalInvariant',
  'cameraFollow',
  'focusLossStop',
  'transitionLocked',
  'timePreserved',
  'mutePreserved',
  'state.json',
  'runtime.log',
  'trace.zip',
  'pageErrors.length',
  'failedRequests.length',
]) {
  if (!browserSmoke.includes(marker)) {
    failures.push(`Browser Smoke is missing M1.4 assertion marker ${marker}.`);
  }
}
for (const marker of [
  'M1.4 SIDE-SCROLL HUD',
  '/assets/images/m14',
  'upper-vending-lane',
  '上のエリアへ移動',
  'player-atlas',
]) {
  if (!productionSmoke.includes(marker)) {
    failures.push(`Production Smoke must verify M1.4 runtime marker ${marker}.`);
  }
}

if (failures.length) {
  console.error('Project validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Project validation passed (${requiredFiles.length} required files, `
    + `${M14_AREAS.length} M1.4 areas, 28 player frames, M1.3 preserved).`,
  );
}
