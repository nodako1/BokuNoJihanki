import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  M15_AREA_IDS,
  M15_GEOMETRY_FIXTURE,
  M15_TIME_PHASES,
} from '../src/game/areas/m15GeometryFixture.mjs';
import {
  M15_BASELINE_GEOMETRY_FIXTURE,
} from '../tools/evidence/m15BaselineGeometryFixture.mjs';
import {
  AREA_PANEL_MIN_PLAYER_GAP,
  AREA_PANEL_MIN_TOUCH_TARGET,
  chooseAreaPanelPlacement,
  createAreaPanelRect,
} from '../src/ui/areaPanelPlacement.mjs';

const M14_AREAS = ['home-street', 'life-road', 'upper-vending-lane'];
const M14_PHASES = ['morning', 'day', 'evening', 'night'];
const M15_AUDIO_FILE =
  'public/assets/audio/m15/summer-morning-loop-9ea9bb8b71d7.m4a';
const M15_BASELINE_COMMIT =
  '29223ee31fd4fc4fbca21a37b01fe89277279647';
const M15_LOST_COMMIT =
  '04c6d0879fc4283d94d0a6d515a1916a0999406b';
const M15_CHECKPOINT_COMMITS = Object.freeze({
  cp1Assets: 'edfb2b5f549e8f0407215402e868ebbe6d23c7f4',
  cp2Runtime: 'bd33365d8b3504f9ca034517ec01f2ba5081f023',
  cp3Tests: '67b61f703a48bb5086ef53f4ffd92594f5ac3d3e',
});
const EXACT_PR_HEAD_CHECKOUT =
  "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";
const M15_RUNTIME_FILES = [
  '.github/fontconfig/m15-noto-cjk.conf',
  'public/assets/audio/m15/analysis.json',
  M15_AUDIO_FILE,
  'public/assets/images/m15/asset-manifest.json',
  'public/assets/images/m15/asset-manifest.sha256',
  'public/assets/images/m15/player-atlas-c02fff1f264e.json',
  'public/assets/images/m15/player-atlas-c02fff1f264e.webp',
  'src/game/areas/m15GeometryFixture.mjs',
  'src/game/areas/m15GeometryFixture.d.mts',
  'src/game/areas/m15GeometryFixture.d.ts',
  'src/ui/areaPanelDom.ts',
  'src/ui/areaPanelPlacement.mjs',
  'src/ui/areaPanelPlacement.d.mts',
  'src/game/systems/audioEngine.ts',
  'scripts/x11-tab-visibility.mjs',
  'tests/m15-audio-contract.test.mjs',
  'tests/m15-evidence-environment.test.mjs',
  'tests/m15-geometry-panel-contract.test.mjs',
  'tests/m15-headed-runner.test.mjs',
  'tests/m15-input-protection.test.mjs',
  'tests/m15-x11-tab-visibility.test.mjs',
  'tools/art/generate_m15_assets.py',
  'tools/art/validate_m15_assets.py',
  'tools/art/m15-source/generation.json',
  'tools/art/m15-source/player-left-atlas-chroma.png',
  'tools/art/m15-source/player-left-atlas-keyed.png',
  'tools/art/m15-source/player-prompt.txt',
  'tools/art/m15-source/upper-edit-prompt.txt',
  'tools/art/m15-source/upper-vending-lane-master.png',
  'tools/audio/m15/generate_m15_bgm.py',
  'tools/audio/m15/provenance.json',
  'tools/audio/m15/score.json',
  'tools/audio/m15/validate_m15_bgm.py',
  'tools/evidence/assemble_m15_evidence.py',
  'tools/evidence/capture_m15_baseline.mjs',
  'tools/evidence/generate_m15_audio_evidence.py',
  'tools/evidence/m15BaselineGeometryFixture.mjs',
  'tools/evidence/probe_m15_x11_visibility.mjs',
];
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

const M14_NAVIGATION_CORE_FILES = [
  'src/game/navigation/areaGraph.mjs',
  'src/game/navigation/areaGraph.d.mts',
  'src/game/navigation/areaGraph.d.ts',
  'src/game/navigation/areaTransitionState.mjs',
  'src/game/navigation/areaTransitionState.d.mts',
  'src/game/navigation/areaTransitionState.d.ts',
  'src/game/navigation/horizontalMovement.mjs',
  'src/game/navigation/horizontalMovement.d.mts',
  'src/game/navigation/horizontalMovement.d.ts',
  'src/game/navigation/navigationState.mjs',
  'src/game/navigation/navigationState.d.mts',
  'src/game/navigation/navigationState.d.ts',
  'src/game/navigation/navigationValidation.mjs',
  'src/game/navigation/navigationValidation.d.mts',
  'src/game/navigation/navigationValidation.d.ts',
  'tests/m14-area-graph.test.mjs',
  'tests/m14-area-transition.test.mjs',
  'tests/m14-horizontal-movement.test.mjs',
  'tests/m14-navigation-state.test.mjs',
  'docs/specs/M1_4_NAVIGATION_CORE.md',
];

const M2_ECONOMY_CORE_FILES = [
  'src/game/economy/economyCore.mjs',
  'src/game/economy/economyCore.d.mts',
  'src/game/economy/economyCore.d.ts',
  'src/game/economy/rng.mjs',
  'src/game/economy/rng.d.mts',
  'src/game/economy/rng.d.ts',
  'src/game/economy/saveData.mjs',
  'src/game/economy/saveData.d.mts',
  'src/game/economy/saveData.d.ts',
  'tests/economy-core.test.mjs',
  'tests/economy-save.test.mjs',
  'docs/specs/M2_VENDING_ECONOMY.md',
];

const M13_PRESERVED_FILES = [
  'src/game/scenes/ResidentialScene.ts',
  'src/game/systems/AreaTransitionSystem.ts',
  'src/game/systems/areaTransitionState.mjs',
  'src/game/systems/areaTransitionState.d.mts',
  'src/game/systems/areaTransitionState.d.ts',
  'src/game/systems/walkableMovement.mjs',
  'src/game/systems/walkableMovement.d.mts',
  'src/game/systems/walkableMovement.d.ts',
  'src/game/world/m13Map.ts',
  'src/game/world/residential-m13-map.json',
  'tests/area-transition.test.mjs',
  'tests/m13-map.test.mjs',
  'tests/walkable-movement.test.mjs',
  'docs/specs/M1_3_RESIDENTIAL_VERTICAL_SLICE.md',
];

const FINAL_RELEASE_FILES = [
  '.vercel-production-retry',
  '.github/workflows/quality.yml',
  '.github/workflows/browser-smoke.yml',
  'scripts/run-headed-browser-smoke.sh',
  '.github/workflows/production-smoke.yml',
  'PROJECT_STATE.json',
  'README.md',
  'docs/ARCHITECTURE.md',
  'docs/ART_DIRECTION.md',
  'docs/ASSET_PROVENANCE.md',
  'docs/AUDIO_GUIDE.md',
  'docs/DEPLOYMENT.md',
  'docs/DEVELOPMENT_RULES.md',
  'docs/ROADMAP.md',
  'docs/TESTING.md',
  'docs/collab/CHATGPT_STATUS.md',
  'docs/collab/DISCUSSION.md',
  'docs/evidence/M1_4_PRODUCTION_EVIDENCE.md',
  'docs/specs/M1.md',
  'docs/specs/M1_4_SIDE_SCROLL_TOWN.md',
  'docs/specs/M1_5_POLISH.md',
];

const requiredFiles = [...new Set([
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
  ...M15_RUNTIME_FILES,
  ...M14_NAVIGATION_CORE_FILES,
  ...M2_ECONOMY_CORE_FILES,
  ...M13_PRESERVED_FILES,
  ...FINAL_RELEASE_FILES,
])];

for (const area of M14_AREAS) {
  requiredFiles.push(`public/assets/images/m14/fg-${area}.webp`);
  for (const phase of M14_PHASES) {
    requiredFiles.push(`public/assets/images/m14/bg-${area}-${phase}.webp`);
  }
}
for (const areaId of M15_AREA_IDS) {
  const fixture = M15_GEOMETRY_FIXTURE.areas[areaId];
  requiredFiles.push(`public${fixture.assets.foregroundPath}`);
  for (const phase of M15_TIME_PHASES) {
    requiredFiles.push(`public${fixture.assets.backgroundPaths[phase]}`);
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

async function sha256(file) {
  try {
    return createHash('sha256').update(await readFile(file)).digest('hex');
  } catch (error) {
    failures.push(`Unable to hash ${file}: ${error.message}`);
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
  m15Manifest,
  m15Atlas,
  m15AudioAnalysis,
  m15AudioProvenance,
  m13Manifest,
  m13Atlas,
  m13Map,
  app,
  createGame,
  sideScrollScene,
  sideScrollInput,
  audioEngine,
  areaWorld,
  areaData,
  navigationAdapter,
  navigationAreaGraph,
  navigationTransitionState,
  navigationMovement,
  navigationState,
  navigationValidation,
  economyCore,
  economySave,
  gameBridge,
  areaArrowButton,
  gameHud,
  developerHud,
  areaPanelDom,
  areaPanelPlacement,
  geometryFixtureSource,
  baselineGeometryFixtureSource,
  baselineCapture,
  audioEvidenceGenerator,
  evidenceAssembler,
  evidenceContractTest,
  browserSmoke,
  x11TabVisibility,
  x11VisibilityPreflight,
  viteConfig,
  buildBadge,
  buildTypes,
  qualityWorkflow,
  browserWorkflow,
  notoFontConfig,
  headedBrowserSmokeRunner,
  productionSmoke,
] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('PROJECT_STATE.json'),
  readJson('public/manifest.webmanifest'),
  readJson('vercel.json'),
  readJson('public/assets/images/m14/asset-manifest.json'),
  readJson('public/assets/images/m14/player-atlas.json'),
  readJson('public/assets/images/m15/asset-manifest.json'),
  readJson('public/assets/images/m15/player-atlas-c02fff1f264e.json'),
  readJson('public/assets/audio/m15/analysis.json'),
  readJson('tools/audio/m15/provenance.json'),
  readJson('public/assets/images/m13/asset-manifest.json'),
  readJson('public/assets/images/m13/player-atlas.json'),
  readJson('src/game/world/residential-m13-map.json'),
  readText('src/App.tsx'),
  readText('src/game/createGame.ts'),
  readText('src/game/scenes/SideScrollTownScene.ts'),
  readText('src/game/systems/SideScrollInputSystem.ts'),
  readText('src/game/systems/audioEngine.ts'),
  readText('src/game/areas/M14AreaWorld.ts'),
  readText('src/game/areas/m14AreaData.mjs'),
  readText('src/game/navigationAdapter/m14NavigationAdapter.mjs'),
  readText('src/game/navigation/areaGraph.mjs'),
  readText('src/game/navigation/areaTransitionState.mjs'),
  readText('src/game/navigation/horizontalMovement.mjs'),
  readText('src/game/navigation/navigationState.mjs'),
  readText('src/game/navigation/navigationValidation.mjs'),
  readText('src/game/economy/economyCore.mjs'),
  readText('src/game/economy/saveData.mjs'),
  readText('src/game/gameBridge.ts'),
  readText('src/ui/AreaArrowButton.tsx'),
  readText('src/ui/GameHud.tsx'),
  readText('src/ui/DeveloperHud.tsx'),
  readText('src/ui/areaPanelDom.ts'),
  readText('src/ui/areaPanelPlacement.mjs'),
  readText('src/game/areas/m15GeometryFixture.mjs'),
  readText('tools/evidence/m15BaselineGeometryFixture.mjs'),
  readText('tools/evidence/capture_m15_baseline.mjs'),
  readText('tools/evidence/generate_m15_audio_evidence.py'),
  readText('tools/evidence/assemble_m15_evidence.py'),
  readText('tests/m15-evidence-environment.test.mjs'),
  readText('scripts/browser-smoke.mjs'),
  readText('scripts/x11-tab-visibility.mjs'),
  readText('tools/evidence/probe_m15_x11_visibility.mjs'),
  readText('vite.config.ts'),
  readText('src/ui/BuildBadge.tsx'),
  readText('src/types/build.d.ts'),
  readText('.github/workflows/quality.yml'),
  readText('.github/workflows/browser-smoke.yml'),
  readText('.github/fontconfig/m15-noto-cjk.conf'),
  readText('scripts/run-headed-browser-smoke.sh'),
  readText('.github/workflows/production-smoke.yml'),
]);

if (packageJson.name !== 'boku-no-jihanki') {
  failures.push('package.json name must be boku-no-jihanki.');
}
if (packageJson.version !== '0.1.0') {
  failures.push('package.json version remains 0.1.0 through the M1.5 rebuild.');
}
if (
  packageLock.version !== packageJson.version
  || packageLock.packages?.['']?.version !== packageJson.version
) {
  failures.push('package-lock root version must match package.json.');
}
if (projectState.developmentRulesVersion !== '2.4') {
  failures.push('PROJECT_STATE developmentRulesVersion must remain 2.4.');
}
if (
  projectState.currentMilestone !== 'M1.5'
  || projectState.currentMilestoneScope !== 'mandatory-real-device-quality-rebuild'
  || projectState.status !== 'implementation-in-progress'
  || projectState.statusScope !== 'm1-reopened-for-real-device-quality; m2-stopped'
) {
  failures.push('PROJECT_STATE must mark the mandatory M1.5 rebuild as in progress.');
}
if (
  projectState.currentProductionBaseline !== M15_BASELINE_COMMIT
  || projectState.lastProductionCommit !== M15_BASELINE_COMMIT
  || projectState.m14ImplementationProductionCommit
    !== '147f770a4b73077c4e5dc0523839b3fefb789db4'
) {
  failures.push(
    'PROJECT_STATE must distinguish the current Production baseline '
    + 'from the historical M1.4 implementation commit.',
  );
}
if (
  projectState.m1Completion?.status !== 'reopened'
  || projectState.m1Completion?.activeCorrection !== 'M1.5'
  || !/explicit user approval.*real iPhone/i.test(
    projectState.m1Completion?.mainMergeBlockedUntil ?? '',
  )
) {
  failures.push('PROJECT_STATE must keep M1 reopened and main blocked on real-iPhone approval.');
}
if (
  projectState.nextMilestone !== 'M1.5'
  || projectState.nextTask !== 'm1.5-evidence-preview-and-independent-qa'
) {
  failures.push('PROJECT_STATE must keep M1.5 Evidence and QA ahead of M2.');
}
for (const item of [
  'm1.3-code-and-assets-preserved',
  'm1.4-navigation-core-merged',
  'm1.4-production-verification',
  'm1.4-2d-official-m1-basis',
  'm1.5-cp1-assets-checkpointed',
  'm1.5-cp2-runtime-checkpointed',
  'm1.5-cp3-contract-tests-checkpointed',
]) {
  if (!projectState.completed?.includes(item)) {
    failures.push(`PROJECT_STATE completed list is missing ${item}.`);
  }
}
for (const item of [
  'm1.5-local-and-preview-browser-smoke',
  'm1.5-evidence',
  'm1.5-independent-candidate-qa',
  'm1.5-evidence-audit',
  'm1.5-ci',
]) {
  if (!projectState.inProgress?.includes(item)) {
    failures.push(`PROJECT_STATE inProgress list is missing ${item}.`);
  }
}
for (const item of ['m2-vending-machine-scene-integration', 'open-pr-31']) {
  if (!projectState.paused?.includes(item)) {
    failures.push(`PROJECT_STATE paused list is missing ${item}.`);
  }
}
if (projectState.notStarted?.includes('m2-vending-machine-scene-integration')) {
  failures.push('PROJECT_STATE must classify M2 Scene integration as paused, not active or next.');
}

const expectedM15StateEvidence = {
  m15Specification: 'docs/specs/M1_5_POLISH.md',
  m15BaselineCommit: M15_BASELINE_COMMIT,
  m15LostHistoricalCommit: M15_LOST_COMMIT,
  m15Branch: 'fix/m1-5-real-device-polish-rebuild',
  m15GeometryFixture: 'src/game/areas/m15GeometryFixture.mjs',
  m15GroundingToleranceCssPx: 2,
  m15SpawnToleranceCssPx: 6,
  m15EntranceTriggerCenterToleranceCssPx: 5,
  m15AssetManifest: 'public/assets/images/m15/asset-manifest.json',
  m15AssetGenerationRecord: 'tools/art/m15-source/generation.json',
  m15PlayerAtlasSha256:
    'acf3cf78c2dba0c30ed078de5e6b0ee6fe32b7f0cf8dd8f15fc52a8dd41d46b0',
  m15AudioAsset: M15_AUDIO_FILE,
  m15AudioSha256:
    '9ea9bb8b71d71d9cb60a31372fc1fe5ea5411eb02374d60d78cca04cab3401c6',
  m15AudioAnalysis: 'public/assets/audio/m15/analysis.json',
  m15CandidateQa: 'pending',
  m15EvidenceAudit: 'pending',
  m15RealIPhoneApproval: 'pending',
  m15ProductionVerification: 'pending',
};
for (const [key, expected] of Object.entries(expectedM15StateEvidence)) {
  if (projectState.evidence?.[key] !== expected) {
    failures.push(`PROJECT_STATE evidence ${key} does not match the M1.5 rebuild contract.`);
  }
}
if (
  !/nonrecoverable/i.test(
    projectState.evidence?.m15LostHistoricalCommitStatus ?? '',
  )
  || !/prohibited as candidate evidence/i.test(
    projectState.evidence?.m15LostHistoricalCommitStatus ?? '',
  )
) {
  failures.push('PROJECT_STATE must reject the lost unpushed commit as candidate Evidence.');
}
if (
  JSON.stringify(projectState.evidence?.m15CheckpointCommits)
    !== JSON.stringify(M15_CHECKPOINT_COMMITS)
) {
  failures.push('PROJECT_STATE must retain the exact CP1-CP3 remote checkpoint SHAs.');
}
if (
  JSON.stringify(projectState.evidence?.m15AreaIds)
    !== JSON.stringify(M15_AREA_IDS)
) {
  failures.push('PROJECT_STATE must list only the official M1.5 area IDs.');
}
if (
  !/sole source/i.test(projectState.evidence?.m15GeometryFixturePolicy ?? '')
  || !/SHA-256/i.test(projectState.evidence?.m15GeometryFixturePolicy ?? '')
) {
  failures.push('PROJECT_STATE must bind the sole geometry fixture to background hashes.');
}
if (
  JSON.stringify(projectState.evidence?.m15RequiredViewports)
  !== JSON.stringify([
    '1280x720',
    '844x390 touch',
    '932x430 DPR3 touch',
  ])
) {
  failures.push('PROJECT_STATE must retain all three M1.5 Browser Smoke viewports.');
}
if (
  JSON.stringify(projectState.evidence?.m15RequiredGateOrder)
  !== JSON.stringify([
    'local-quality-and-browser-smoke',
    'same-sha-vercel-preview-browser-smoke',
    'ci-and-independent-candidate-qa-and-evidence-audit',
    'explicit-real-iphone-approval-for-exact-preview-sha',
    'main-merge',
    'same-merge-sha-production-deploy-and-smoke',
  ])
) {
  failures.push('PROJECT_STATE must enforce Preview, real-iPhone approval, then Production.');
}

const expectedM14Evidence = {
  m14Status: 'completed-production-verified-history',
  m14M1Basis: '2d-side-scroll',
  m14NavigationCoreMergeCommit: 'ee255a1a8413768d0e7dbdf512964268c8eaf276',
  m14PullRequest: 32,
  m14PullRequestHeadCommit: '5c6895d0d1e2ad31a95f6490e60cc26f89d290cf',
  m14PullRequestQualityRun: 30008762303,
  m14PullRequestBrowserRun: 30008762333,
  m14PullRequestBrowserArtifact: 8564271801,
  m14ImplementationProductionCommit: '147f770a4b73077c4e5dc0523839b3fefb789db4',
  m14CurrentProductionBaseline: M15_BASELINE_COMMIT,
  m14VercelProductionStatus: 'success',
  m14MainQualityRun: 30009404756,
  m14ProductionSmokeRun: 30009405068,
  m14ProductionBrowserRun: 30009404814,
  m14ProductionBrowserArtifact: 8564582434,
  m14ProductionBrowserArtifactDigest:
    'sha256:6f83bfcf99ac2f2af0e98899568ee2c17ac28e3f3ad70aef29f4c7f7c26744f3',
  m13Preserved: true,
  m2EconomyCorePreserved: true,
  m2EconomySceneConnected: false,
};
for (const [key, expected] of Object.entries(expectedM14Evidence)) {
  if (projectState.evidence?.[key] !== expected) {
    failures.push(`PROJECT_STATE evidence ${key} does not match verified M1.4 evidence.`);
  }
}
if (
  !/historical M1\.4 delivery evidence only/i.test(
    projectState.evidence?.m14EvidenceUse ?? '',
  )
  || !/not M1\.5 candidate evidence/i.test(
    projectState.evidence?.m14EvidenceUse ?? '',
  )
) {
  failures.push('PROJECT_STATE must preserve M1.4 history without reusing it for M1.5.');
}

const expectedBrowserEvidence = {
  areaCount: 3,
  transitionCount: 5,
  screenCount: 15,
  pageErrorCount: 0,
  failedRequestCount: 0,
  allInvariants: true,
};
for (const [key, expected] of Object.entries(expectedBrowserEvidence)) {
  if (projectState.evidence?.m14ProductionBrowserEvidence?.[key] !== expected) {
    failures.push(`PROJECT_STATE Production Browser evidence ${key} is not verified.`);
  }
}
for (const item of ['publicBuild', 'leftWalk', 'rightWalk', 'timeOfDay', 'audio']) {
  if (projectState.evidence?.m14ManualProductionVerification?.[item] !== true) {
    failures.push(`PROJECT_STATE manual Production verification is missing ${item}.`);
  }
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
  vercel.git?.deploymentEnabled?.['fix/m1-5-real-device-polish-rebuild']
  !== true
) {
  failures.push('Vercel must enable the exact M1.5 rebuild Preview branch.');
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
  "M15_ASSET_ROOT = '/assets/images/m15'",
  "['morning', 'day', 'evening', 'night']",
  'M15_PLAYER_ATLAS_IMAGE',
  'M15_PLAYER_ATLAS_JSON',
  'M15_GEOMETRY_FIXTURE',
]) {
  if (!areaWorld.includes(marker)) {
    failures.push(`M14AreaWorld is missing ${marker}.`);
  }
}
for (const marker of [
  'M14_AREA_IDS',
  'getM15GeometryArea',
  'home-street',
  'life-road',
  'upper-vending-lane',
  'branchEntrances.up.triggerRange',
  'branchEntrances.down.triggerRange',
  'preserveAcrossTransition',
]) {
  if (!areaData.includes(marker)) {
    failures.push(`M1.4 area data is missing ${marker}.`);
  }
}
for (const marker of [
  '../navigation/areaGraph.mjs',
  '../navigation/horizontalMovement.mjs',
  '../navigation/areaTransitionState.mjs',
  '../navigation/navigationState.mjs',
  'stepHorizontalMovement',
  'getAvailableBranchDirections',
  'resolveAreaExit',
  'getM14CameraScrollX',
  'isM14InputLocked',
  'reduceM14Transition',
  'validateM14AreaGraph',
  'sourceSpawnId',
]) {
  if (!navigationAdapter.includes(marker)) {
    failures.push(`M1.4 navigation adapter is missing ${marker}.`);
  }
}

const navigationCoreChecks = [
  [
    'areaGraph',
    navigationAreaGraph,
    ['findHorizontalExit', 'findDirectionalExit', 'isDirectionalPromptVisible', 'validateAreaGraph'],
  ],
  [
    'areaTransitionState',
    navigationTransitionState,
    ['NAVIGATION_TRANSITION_STATES', 'nextNavigationTransitionState', 'isReadyForNavigationTransition'],
  ],
  [
    'horizontalMovement',
    navigationMovement,
    ['resolveHorizontalMovement', 'horizontalAxis', 'locked'],
  ],
  [
    'navigationState',
    navigationState,
    ['createNavigationState', 'resolveAreaSpawn', 'cancelAreaTransition', 'isInputLocked'],
  ],
  [
    'navigationValidation',
    navigationValidation,
    ['invalid-spawn-x', 'invalid-spawn-facing', 'invalid-trigger-range'],
  ],
];
for (const [sourceName, source, markers] of navigationCoreChecks) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      failures.push(`M1.4 navigation core ${sourceName} is missing ${marker}.`);
    }
  }
}

for (const marker of [
  'SEARCH_TIME_COST_MINUTES',
  'createEconomyState',
  'performSearch',
  'canSearch',
]) {
  if (!economyCore.includes(marker)) {
    failures.push(`Preserved M2 economy core is missing ${marker}.`);
  }
}
for (const marker of [
  'SAVE_KEY',
  'serializeEconomyState',
  'deserializeEconomyState',
  'saveToStorage',
  'loadFromStorage',
]) {
  if (!economySave.includes(marker)) {
    failures.push(`Preserved M2 economy save core is missing ${marker}.`);
  }
}
const economyImportPattern =
  /(?:from\s+|import\s*\()\s*['"][^'"]*economy\//;
for (const [runtimeFile, source] of [
  ['src/App.tsx', app],
  ['src/game/createGame.ts', createGame],
  ['src/game/scenes/SideScrollTownScene.ts', sideScrollScene],
  ['src/game/gameBridge.ts', gameBridge],
]) {
  if (economyImportPattern.test(source)) {
    failures.push(`M2 economy core must not be connected from ${runtimeFile} during M1.4.`);
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
  failures.push('GameHud must render the M1.5 area arrow control.');
}
for (const marker of [
  'M1.5 SIDE-SCROLL HUD',
  'AREA_ID',
  'CAMERA',
  'TRANSITION',
  'LOCK',
  'BRANCH',
  'AUDIO',
]) {
  if (!developerHud.includes(marker)) {
    failures.push(`DeveloperHud is missing M1.5 marker ${marker}.`);
  }
}

if (
  JSON.stringify(M15_AREA_IDS)
  !== JSON.stringify(['home-street', 'life-road', 'upper-vending-lane'])
) {
  failures.push('M1.5 must use only the three official area IDs.');
}
if (M15_GEOMETRY_FIXTURE.schemaVersion !== 1 || M15_GEOMETRY_FIXTURE.revision !== 'M1.5') {
  failures.push('M1.5 geometry fixture must use the approved schema and revision.');
}
if (
  M15_GEOMETRY_FIXTURE.coordinateSpace?.worldHeight !== 720
  || M15_GEOMETRY_FIXTURE.coordinateSpace?.imageToRuntimeScale !== 1
) {
  failures.push('M1.5 geometry fixture must use the native 720 CSS-pixel coordinate space.');
}
if (
  M15_GEOMETRY_FIXTURE.tolerances?.renderedFootToGroundCssPx !== 2
  || M15_GEOMETRY_FIXTURE.tolerances?.spawnFootToGroundCssPx !== 6
  || M15_GEOMETRY_FIXTURE.tolerances?.entranceToTriggerCenterCssPx !== 5
) {
  failures.push('M1.5 geometry fixture tolerances must retain the device-quality contract.');
}

if (
  M15_BASELINE_GEOMETRY_FIXTURE.schemaVersion !== 1
  || M15_BASELINE_GEOMETRY_FIXTURE.baselineCommit !== M15_BASELINE_COMMIT
  || M15_BASELINE_GEOMETRY_FIXTURE.sourceRevision !== 'M1.4'
  || JSON.stringify(M15_BASELINE_GEOMETRY_FIXTURE.officialAreaIds)
    !== JSON.stringify(M15_AREA_IDS)
) {
  failures.push('M1.5 baseline fixture must bind the exact baseline and official areas.');
}
if (
  !/Visual raster annotation only/i.test(
    M15_BASELINE_GEOMETRY_FIXTURE.measurement?.sourceIndependence ?? '',
  )
  || baselineGeometryFixtureSource.includes(
    "from '../../src/game/areas/m15GeometryFixture.mjs'",
  )
  || baselineGeometryFixtureSource.includes(
    "from '../src/game/areas/m15GeometryFixture.mjs'",
  )
) {
  failures.push('M1.5 baseline geometry must remain independent of runtime values.');
}
for (const areaId of M15_AREA_IDS) {
  const baselineArea = M15_BASELINE_GEOMETRY_FIXTURE.areas?.[areaId];
  if (
    !baselineArea
    || baselineArea.imageSize?.height !== 720
    || baselineArea.visualGround?.samples?.map(({ position }) => position).join(',')
      !== 'left,center,right'
    || JSON.stringify(baselineArea.visualGround?.verifiedPhases)
      !== JSON.stringify(M15_TIME_PHASES)
  ) {
    failures.push(`M1.5 baseline ${areaId} requires four-phase independent ground annotations.`);
    continue;
  }
  for (const phase of M15_TIME_PHASES) {
    const background = baselineArea.backgrounds?.[phase];
    if (
      !background
      || background.width !== baselineArea.imageSize.width
      || background.height !== baselineArea.imageSize.height
      || await sha256(`public${background.path}`) !== background.sha256
    ) {
      failures.push(`M1.5 baseline ${areaId}/${phase} hash binding is invalid.`);
    }
  }
}
if (
  M15_BASELINE_GEOMETRY_FIXTURE.areas?.['life-road']
    ?.paintedUphillEntrance?.present !== true
  || M15_BASELINE_GEOMETRY_FIXTURE.areas?.['upper-vending-lane']
    ?.paintedDownwardEntrance?.present !== false
) {
  failures.push('M1.5 baseline fixture must retain the independently observed route defects.');
}
for (const marker of [
  "from './m15BaselineGeometryFixture.mjs'",
  "from '../../src/game/areas/m15GeometryFixture.mjs'",
  `const EXACT_BASELINE = '${M15_BASELINE_COMMIT}'`,
  'const REPOSITORY_ROOT = path.resolve(',
  "requiredEnvironment('EXPECTED_COMMIT')",
  "requiredEnvironment('BASELINE_ROOT')",
  'getM15BaselineGeometryArea',
  'getM15GeometryArea',
  'fileSha256',
  'gitBlobSha1',
  'loadBaselineContract',
  '`${expectedCommit}^{commit}`',
  '`${expectedCommit}^{tree}`',
  "'ls-tree'",
  "'-rz'",
  "'--full-tree'",
  'gitBlobSha1(content)',
  'entry.objectSha',
  'does not match the exact baseline blob.',
  'verifiedFileCount: trackedEntries.length',
  'verifiedBytes',
  'Untracked build/dependency extras are intentionally ignored.',
  'loadPlayerContract',
  'calculatePlayerGeometry',
  'const scaleX = canvas.cssRect.width / canvas.backingWidth',
  'const scaleY = canvas.cssRect.height / canvas.backingHeight',
  'renderMapping',
  'mapped independently from the 1280x720 backing store.',
  'verifyFixtureCoordinateParity',
  'captureCandidateEntranceCoordinate',
  'backgroundCenterX',
  'sameCoordinateComparisons',
  'candidateFixtureCoordinateParity',
  "'Input.dispatchTouchEvent'",
  'CDP real touch joystick drag',
  'CDP real touch tap',
  'evidence.panelMatrix.length, 12',
  'Baseline 3-area x 4-phase capture is incomplete.',
  'sourceSpawnSequence',
  'independentVisualFixture: M15_BASELINE_GEOMETRY_FIXTURE',
  'painted-entrance-trigger-misalignment',
  'runtime-trigger-without-painted-route',
  'BASELINE_DEFECTS_OBSERVED_NOT_A_CANDIDATE_PASS',
  'candidatePass: false',
  'context.tracing.start',
  "booleanFromEnvironment('BROWSER_TRACE', true)",
  "booleanFromEnvironment('BROWSER_HEADLESS', true)",
  'if (traceEnabled)',
  'let traceFinalized = !tracingStarted',
  "requiredEnvironment('M15_JAPANESE_FONT_MATCH')",
  "requiredEnvironment('M15_JAPANESE_FONT_SHA256')",
  "requiredEnvironment('M15_RUNNER_OS_IMAGE')",
  'browserExecutablePath',
  'hostEnvironment',
  'fontEnvironment',
  "'state.json'",
  "'runtime.log'",
  "'trace.zip'",
  "'completion.json'",
  'await browser.close().then',
  'stateSha256: fileSha256(statePath)',
  'runtimeLogSha256: fileSha256(runtimeLogPath)',
  'assert.equal(pageErrors.length, 0',
  'Baseline failed requests:',
]) {
  if (!baselineCapture.includes(marker)) {
    failures.push(`M1.5 baseline capture is missing ${marker}.`);
  }
}
const baselineFinalizationOrder = [
  baselineCapture.indexOf('await browser.close().then'),
  baselineCapture.indexOf('fs.writeFileSync(runtimeLogPath'),
  baselineCapture.indexOf(
    'statePath,',
    baselineCapture.indexOf('fs.writeFileSync(runtimeLogPath'),
  ),
  baselineCapture.indexOf("path.join(outputDirectory, 'completion.json')"),
];
if (
  baselineFinalizationOrder.some((index) => index < 0)
  || baselineFinalizationOrder.some(
    (index, markerIndex) => (
      markerIndex > 0 && index <= baselineFinalizationOrder[markerIndex - 1]
    ),
  )
) {
  failures.push(
    'M1.5 baseline capture must close the browser and hash final state/log '
    + 'before writing its completion marker.',
  );
}
if (/gitOutput\(\s*baselineRoot\b/.test(baselineCapture)) {
  failures.push(
    'M1.5 baseline capture must verify archive files against the current '
    + 'repository baseline tree, without requiring archive .git metadata.',
  );
}

const m15FileRecords = new Map(
  (m15Manifest.files ?? []).map((file) => [file.path, file]),
);
if (
  m15Manifest.revision !== 'M1.5'
  || m15Manifest.rights
    !== 'Project-original BokuNoJihanki assets; no third-party game art'
) {
  failures.push('M1.5 asset manifest must retain its revision and project-original rights.');
}
if (
  JSON.stringify(Object.keys(m15Manifest.areas ?? {}))
  !== JSON.stringify(M15_AREA_IDS)
) {
  failures.push('M1.5 asset manifest must define exactly the official area IDs.');
}
for (const areaId of M15_AREA_IDS) {
  const fixture = M15_GEOMETRY_FIXTURE.areas[areaId];
  const areaManifest = m15Manifest.areas?.[areaId];
  if (!fixture || areaManifest?.worldWidth !== fixture.worldWidth) {
    failures.push(`M1.5 ${areaId} manifest and fixture world widths must agree.`);
    continue;
  }
  if (
    fixture.ground.samples.length !== 3
    || fixture.ground.samples.map((sample) => sample.position).join(',')
      !== 'left,center,right'
    || fixture.ground.samples.some((sample) => sample.y !== fixture.ground.y)
  ) {
    failures.push(`M1.5 ${areaId} requires independent left/center/right ground annotations.`);
  }
  for (const [spawnId, spawn] of Object.entries(fixture.spawns)) {
    if (
      Math.abs(spawn.y - fixture.ground.y)
      > M15_GEOMETRY_FIXTURE.tolerances.spawnFootToGroundCssPx
    ) {
      failures.push(`M1.5 ${areaId}/${spawnId} spawn is outside the ground tolerance.`);
    }
  }
  for (const [direction, entrance] of Object.entries(fixture.branchEntrances)) {
    if (
      entrance.centerDeltaX
        > M15_GEOMETRY_FIXTURE.tolerances.entranceToTriggerCenterCssPx
      || entrance.groundY !== fixture.ground.y
    ) {
      failures.push(`M1.5 ${areaId}/${direction} entrance is not aligned to its trigger.`);
    }
  }

  const foregroundPath = `public${fixture.assets.foregroundPath}`;
  const foregroundRecord = m15FileRecords.get(foregroundPath);
  if (foregroundRecord?.sha256 !== fixture.assets.foregroundSha256) {
    failures.push(`M1.5 ${areaId} foreground hash is not bound to the geometry fixture.`);
  }
  for (const phase of M15_TIME_PHASES) {
    const backgroundPath = `public${fixture.assets.backgroundPaths[phase]}`;
    const backgroundRecord = m15FileRecords.get(backgroundPath);
    if (backgroundRecord?.sha256 !== fixture.assets.backgroundSha256[phase]) {
      failures.push(`M1.5 ${areaId}/${phase} background hash is not bound to the geometry fixture.`);
    }
  }
}
if (
  m15Manifest.player?.idleFramesPerDirection !== 4
  || m15Manifest.player?.walkFramesPerDirection !== 8
  || m15Manifest.player?.shadowBakedIntoFrames !== false
  || JSON.stringify(m15Manifest.player?.footPivot)
    !== JSON.stringify(M15_GEOMETRY_FIXTURE.player.footPivot)
) {
  failures.push('M1.5 player manifest must retain 24 frames, measured foot pivot, and runtime shadow.');
}
if (Object.keys(m15Atlas.frames ?? {}).length !== 24) {
  failures.push('M1.5 player atlas must contain exactly 24 completed side-view frames.');
}
for (const direction of ['left', 'right']) {
  for (let frame = 0; frame < 4; frame += 1) {
    if (!m15Atlas.frames?.[`idle-${direction}-${frame}`]) {
      failures.push(`M1.5 player atlas is missing idle-${direction}-${frame}.`);
    }
  }
  for (let frame = 0; frame < 8; frame += 1) {
    if (!m15Atlas.frames?.[`walk-${direction}-${frame}`]) {
      failures.push(`M1.5 player atlas is missing walk-${direction}-${frame}.`);
    }
  }
}
for (const file of m15Manifest.files ?? []) {
  if (await sha256(file.path) !== file.sha256) {
    failures.push(`M1.5 manifest hash does not match ${file.path}.`);
  }
}
const expectedM15ManifestDigest = (await readText(
  'public/assets/images/m15/asset-manifest.sha256',
)).trim().split(/\s+/)[0];
if (
  expectedM15ManifestDigest
  !== await sha256('public/assets/images/m15/asset-manifest.json')
) {
  failures.push('M1.5 asset manifest sidecar SHA-256 is invalid.');
}

if (
  m15AudioAnalysis.runtimeFile !== M15_AUDIO_FILE
  || m15AudioAnalysis.sha256 !== await sha256(M15_AUDIO_FILE)
  || m15AudioAnalysis.format?.codec !== 'aac'
  || m15AudioAnalysis.format?.profile !== 'LC'
  || m15AudioAnalysis.format?.sampleRateHz !== 48000
  || m15AudioAnalysis.format?.channels !== 2
  || m15AudioAnalysis.format?.channelLayout !== 'stereo'
  || !(m15AudioAnalysis.format?.durationSeconds > 0)
) {
  failures.push('M1.5 BGM static codec, source sample rate, stereo, duration, or SHA contract failed.');
}
if (
  m15AudioAnalysis.signal?.truePeakOversampleFactor < 4
  || m15AudioAnalysis.signal?.truePeakDbtp > -1
  || m15AudioAnalysis.signal?.clippingSampleCount !== 0
  || Math.max(
    ...(m15AudioAnalysis.signal?.dcOffset ?? [1]).map((value) => Math.abs(value)),
  ) >= 0.001
  || m15AudioAnalysis.signal?.longestSilenceSeconds >= 0.1
  || m15AudioAnalysis.loop?.boundaryToP99StepRatio >= 1
  || m15AudioAnalysis.allChecksPassed !== true
) {
  failures.push('M1.5 BGM true-peak, clipping, DC, silence, or loop contract failed.');
}
if (
  m15AudioProvenance.externalSamples !== false
  || m15AudioProvenance.thirdPartyMelody !== false
  || m15AudioProvenance.generativeAudioService !== false
  || !/Project-original/.test(m15AudioProvenance.license ?? '')
) {
  failures.push('M1.5 BGM provenance and project-original rights must remain explicit.');
}
for (const marker of [
  'Refusing non-empty Evidence directory',
  'run_independent_validator',
  'verify_visualization_pcm',
  'truePeakOversampleFactor',
  '"decodedFramesMatchValidator"',
  '"channelsMatchValidator"',
  '"durationMatchesValidator"',
  '"samplePeakMatchesValidator"',
  '"dcMatchesValidator"',
  '"loopBoundaryMatchesValidator"',
  'git_output("rev-parse", "HEAD")',
  '"analysis.json"',
  '"waveform.png"',
  '"spectrogram.png"',
  '"loop-boundary.png"',
  '"sha256-manifest.json"',
  '"inputFiles"',
  '"measurementPositions"',
  '"normalizedCommand"',
  '"toolchain"',
  '"--expected-commit"',
  'complete 40-character Git SHA',
  'actual_commit != expected_commit',
  'Refusing audio Evidence from a dirty worktree',
  'tools/audio/m15/validate_m15_bgm.py',
  'public/assets/audio/m15/analysis.json',
]) {
  if (!audioEvidenceGenerator.includes(marker)) {
    failures.push(`M1.5 audio Evidence generator is missing ${marker}.`);
  }
}
for (const marker of [
  `EXACT_BASELINE_SHA = "${M15_BASELINE_COMMIT}"`,
  'exact 40-character hexadecimal commit SHA',
  'All nine Browser Smoke run directories must be distinct.',
  'state.get("observedCommit") == candidate_sha',
  'state.get("browserHeadless") is False',
  'heartbeat.get("verified") is True',
  'heartbeat.get("innerFrozenCallbacks") == recomputed_inner_callbacks',
  'len(recomputed_post_active) >= 1',
  'len(mute_toggles) >= 2',
  'automation = nested(after, "masterGainAutomation")',
  'actual = finite_number(',
  'lifecycle_launch = nested(run.state, "browserLifecycleLaunch")',
  '"--disable-background-timer-throttling"',
  '"--disable-backgrounding-occluded-windows"',
  '"--disable-renderer-backgrounding"',
  'lifecycle_launch.get("chromiumArgs")',
  '"--use-gl=swiftshader"',
  '"--enable-webgl"',
  '"--enable-unsafe-swiftshader"',
  '"--ignore-gpu-blocklist"',
  '"--ozone-platform=x11"',
  '"native Chromium hidden/visible" in lifecycle_launch["reason"]',
  'hidden_visible.get("method") == "x11-xdotool-tab-switch"',
  'validate_x11_tab_lifecycle_contract(run, hidden_visible)',
  '"windowControl" not in hidden_visible',
  '"minimiz" not in json.dumps(hidden_visible, ensure_ascii=True).lower()',
  'tab_control = nested(hidden_visible, "x11TabControl")',
  'tool = nested(tab_control, "tool")',
  'browser_pid = tab_control.get("browserPid")',
  'candidate_target = nested(tab_control, "candidateTarget")',
  'foreground_target = nested(tab_control, "foregroundTarget")',
  'initial_activation = nested(tab_control, "initialActivation")',
  '"_NET_CLIENT_LIST + _NET_WM_PID + WM_CLASS"',
  'isinstance(browser_pid_client_count, int)',
  'not isinstance(browser_pid_client_count, bool)',
  'browser_pid_client_count == 1',
  'isinstance(matching_chrome_window_count, int)',
  'not isinstance(matching_chrome_window_count, bool)',
  'matching_chrome_window_count == 1',
  'isinstance(activation_attempt_count, int)',
  'not isinstance(activation_attempt_count, bool)',
  'activation_attempt_count == 1',
  'isinstance(command_attempt_count, int)',
  'not isinstance(command_attempt_count, bool)',
  'command_attempt_count == 1',
  'isinstance(activation_target.get("wmPid"), int)',
  'not isinstance(activation_target.get("wmPid"), bool)',
  'isinstance(identity.get("wmPid"), int)',
  'not isinstance(identity.get("wmPid"), bool)',
  'browser_pid_client_identities = initial_activation.get(',
  'len(recomputed_matching_chrome_clients) == 1',
  'recomputed_matching_chrome_clients[0] == activation_target',
  'activation_snapshot.get("xdotoolActiveWindowId")',
  'activation_visibility',
  '"documentHidden": False',
  '"visibilityState": "visible"',
  'foreground_target.get("internalNewTab") is True',
  'tab_control.get("contextPageEventObserved") is True',
  'page_counts = nested(tab_control, "pageCounts")',
  'page_counts.get("before") == 1',
  'page_counts.get("afterOpen") == 2',
  'page_counts.get("afterCleanup") == 1',
  'nested(commands, "openTab", "gesture") == "Ctrl+T"',
  'nested(commands, "returnTab", "gesture") == "Ctrl+Shift+Tab"',
  'nested(commands, "activateWindow", "action") == "windowactivate"',
  'nested(commands, "activateWindow", "sync") is True',
  'nested(commands, "activateWindow", "targetWindowId")',
  'nested(commands, "activateWindow", "succeeded") is True',
  'snapshots = nested(tab_control, "x11Snapshots")',
  '"atOpenCommand"',
  '"atReturnCommand"',
  'xdotool_window_id = snapshot.get("xdotoolActiveWindowId")',
  'root_window_id = snapshot.get("rootActiveWindowId")',
  'wm_pid = snapshot.get("wmPid")',
  'wm_class = snapshot.get("wmClass")',
  'root_window_id == xdotool_window_id',
  'wm_pid == browser_pid',
  'len(set(active_window_ids)) == 1',
  'active_window_ids[0] == activation_target_window_id',
  'hidden_visible.get("activationCandidateVisibility")',
  'tab_control.get("foregroundClosed") is True',
  'tab_control.get("cleanupComplete") is True',
  'hidden_candidate.get("visibilityState") == "hidden"',
  'hidden_foreground.get("visibilityState") == "visible"',
  'visible_candidate.get("visibilityState") == "visible"',
  'visible_foreground.get("visibilityState") == "hidden"',
  'visible_event_index > hidden_event_index',
  'visible_recovery_start_offset = finite_number(',
  'visibility_resume_delta = (',
  'recorded_visibility_resume_delta = finite_number(',
  'hidden_visible.get("visibleRecoveryDelta")',
  'math.isclose(',
  '0.15 <= visibility_resume_delta < visibility_duration / 2',
  'request_count_after == request_count_before + 1',
  'nested(injected, "traversalRequest", "visibilityState") == "hidden"',
  'recomputed_stale_rejection',
  'after_resume_automation = nested(after_resume, "masterGainAutomation")',
  'completion_path = resolved / "completion.json"',
  'completion.get("stateSha256") == sha256(state_path)',
  'completion.get("runtimeLogSha256") == sha256(runtime_log)',
  'state.get("observedCommit") == baseline_sha',
  'recomputed_inner_callbacks = [',
  'recomputed_gaps = [',
  'active_requested_at - frozen_accepted_at',
  'math.isclose(measured_max_gap, recomputed_max_gap',
  'frozen_settle_margin == 400',
  'active_settle_margin == 100',
  'window_end - window_start >= 2_600',
  'recomputed_max_gap >= minimum_gap',
  'post_active_input = nested(frozen, "postActiveInput")',
  'state.get("status") == "complete"',
  'state.get("traceEnabled") is False',
  'render_environment_fingerprint',
  'validate_render_environment_parity',
  'font_match == "Noto Sans CJK JP"',
  'runner_os_image == "ubuntu-24.04"',
  're.fullmatch(r"v22\\.\\d+\\.\\d+", node_version)',
  '"renderEnvironmentContract": environment_contract',
  'validate_audio_directory',
  'validate_tracked_assets',
  'assert_phase_and_ground_pairing',
  'All input validation is complete before the first output byte is written.',
  'Refusing non-empty Evidence output directory',
  '"sha256-manifest.json"',
  '"README.md"',
  '"metrics.json"',
  '"candidatePass": False',
]) {
  if (!evidenceAssembler.includes(marker)) {
    failures.push(`M1.5 Evidence assembler is missing ${marker}.`);
  }
}
if (
  /deterministic-document-visibility-override|visibilityOverride/.test(
    evidenceAssembler,
  )
) {
  failures.push(
    'M1.5 Evidence assembler must reject fake document visibility overrides.',
  );
}
if (/if role != ["']baseline["']:/.test(evidenceAssembler)) {
  failures.push(
    'M1.5 Evidence assembler must require completion hashes for baseline runs.',
  );
}
for (const marker of [
  "import { execFile as execFileCallback } from 'node:child_process';",
  'execFile(command, args, {',
  'shell: false',
  "runFixedCommand('xdotool', ['version'])",
  "runFixedCommand('xdotool', ['getactivewindow'])",
  "runFixedCommand('xprop', ['-root', '_NET_CLIENT_LIST'])",
  "runFixedCommand('xprop', ['-root', '_NET_ACTIVE_WINDOW'])",
  "'_NET_WM_PID'",
  "'WM_CLASS'",
  "'SystemInfo.getProcessInfo'",
  "'Target.getTargetInfo'",
  "'Browser.getWindowForTarget'",
  "'--disable-background-timer-throttling'",
  "'--disable-backgrounding-occluded-windows'",
  "'--disable-renderer-backgrounding'",
  'Preserve native Chromium hidden/visible',
  'wmPid === expectedBrowserPid',
  'browserPidClients.length === 1',
  'sanitizedIdentitySummary',
  'browserPidClientIdentities: Object.freeze',
  'atOpenCommand: x11Snapshots.atOpenCommand',
  'atReturnCommand: x11Snapshots.atReturnCommand',
  "'windowactivate',",
  "'--sync',",
  'initialActivation: initialActivationEvidence',
  'activateWindow: commands.activateWindow',
  "context.waitForEvent('page'",
  'predicate: (openedPage) => !pagesBeforeOpen.has(openedPage)',
  "sendXdotoolChord('ctrl+t')",
  "sendXdotoolChord('ctrl+shift+Tab')",
  "foregroundPage.goto('about:blank'",
  'navigatedForegroundTarget.targetId === foregroundTarget.targetId',
  'pageCounts.before === 1',
  'pageCounts.afterOpen === 2',
  'pageCounts.afterCleanup === 1',
  'foregroundTarget.targetId !== candidateTarget.targetId',
  'foregroundTarget.browserWindowId === candidateTarget.browserWindowId',
  'candidate.documentHidden === expectedCandidateHidden',
  'foreground.documentHidden !== expectedCandidateHidden',
  'xdotoolActiveWindowId',
  'rootActiveWindowId',
  'browserPid',
  'candidateTarget',
  'foregroundTarget',
  'contextPageEventObserved',
  'foregroundClosed',
  'cleanupComplete',
]) {
  if (!x11TabVisibility.includes(marker)) {
    failures.push(`M1.5 X11 tab visibility helper is missing ${marker}.`);
  }
}
for (const marker of [
  'module.validate_x11_tab_lifecycle_contract',
  "addTamper('browser-pid'",
  "addTamper('wm-class'",
  "addTamper('active-xid'",
  "addTamper('activation-target'",
  "addTamper('page-count'",
  "addTamper('gesture'",
  "addTamper('activation-success'",
  "addTamper('mutual-visibility'",
  "addTamper('source-identity'",
  "addTamper('mute-state'",
  "addTamper('visible-gain'",
  "addTamper('recovery-delta'",
  "addTamper('browser-pid-count-boolean'",
  "addTamper('matching-count-float'",
  "addTamper('activation-attempt-boolean'",
  "addTamper('command-attempt-float'",
  "addTamper('identity-pid-float'",
]) {
  if (!evidenceContractTest.includes(marker)) {
    failures.push(`M1.5 X11 Evidence contract test is missing ${marker}.`);
  }
}
for (const [forbiddenPattern, label] of [
  [/shell:\s*true/, 'shell-mediated command execution'],
  [/Browser\.setWindowBounds/, 'CDP browser-window minimization'],
  [/\bbringToFront\b/, 'Playwright foreground forcing'],
  [/\bwindowfocus\b/, 'unvalidated X11 focus forcing'],
  [
    /runFixedCommand\('xdotool', \[\s*'search'/,
    'xdotool title/class search discovery',
  ],
  [/foregroundPage\.setContent/, 'privileged new-tab WebUI document rewrite'],
  [
    /Object\.defineProperty\(\s*document\s*,\s*['"](?:hidden|visibilityState)['"]/,
    'synthetic Page Visibility property',
  ],
  [
    /dispatchEvent\(\s*new Event\(\s*['"]visibilitychange['"]/,
    'synthetic visibilitychange event',
  ],
  [
    /Emulation\.setPageVisibilityOverride|Page\.setWebLifecycleState/,
    'synthetic CDP Page Visibility override',
  ],
]) {
  if (forbiddenPattern.test(x11TabVisibility)) {
    failures.push(`M1.5 X11 tab visibility helper still contains ${label}.`);
  }
}
for (const marker of [
  "from '../../scripts/x11-tab-visibility.mjs'",
  "booleanFromEnvironment('BROWSER_HEADLESS', false) === false",
  'headless: false',
  'viewport,',
  'deviceScaleFactor,',
  'hasTouch: touchEnabled',
  'isMobile: touchEnabled',
  'captureX11TabVisibilityLifecycle({',
  'x11TabControl: lifecycle.x11TabControl',
  "path.join(",
  "'visibility-preflight.json'",
  "status: 'passed'",
  'activationCandidateVisibility.documentHidden === false',
  "activationCandidateVisibility.visibilityState === 'visible'",
  "event.type === 'visibilitychange'",
  'hiddenIndex >= 0 && visibleIndex > hiddenIndex',
]) {
  if (!x11VisibilityPreflight.includes(marker)) {
    failures.push(`M1.5 X11 visibility preflight is missing ${marker}.`);
  }
}
if (
  /Object\.defineProperty\(\s*document\s*,\s*['"](?:hidden|visibilityState)['"]/
    .test(x11VisibilityPreflight)
  || /dispatchEvent\(\s*new Event\(\s*['"]visibilitychange['"]/
    .test(x11VisibilityPreflight)
) {
  failures.push(
    'M1.5 X11 visibility preflight must not synthesize Page Visibility.',
  );
}
for (const marker of [
  "BGM_ASSET_URL = '/assets/audio/m15/summer-morning-loop-9ea9bb8b71d7.m4a'",
  'bgmBusGain',
  'ambienceBusGain',
  'decodeAudioData',
  'source.loop = true',
  'context.currentTime - this.bgmAnchorContextTime',
  "'visibilitychange'",
  "'freeze'",
  "'resume'",
  "'pageshow'",
  "'interrupted'",
  '__BOKU_M15_AUDIO__',
  'masterGain: this.masterGain?.gain.value ?? 0',
  'bgmBusGain: this.bgmBusGain?.gain.value ?? 0',
  'ambienceBusGain: this.ambienceBusGain?.gain.value ?? 0',
  'masterGainAutomation: this.lastMasterGainAutomation',
  'this.lastMasterGainAutomation = {',
]) {
  if (!audioEngine.includes(marker)) {
    failures.push(`M1.5 audio runtime is missing ${marker}.`);
  }
}
for (const marker of [
  'read(allowedTraversal',
  'requestedTraversal === allowedTraversal',
  "allowedTraversal === 'up'",
  "allowedTraversal === 'down'",
  "'visibilitychange'",
  "'freeze'",
  "'resume'",
  "'pagehide'",
  "'pageshow'",
]) {
  if (!sideScrollInput.includes(marker)) {
    failures.push(`M1.5 input gate is missing ${marker}.`);
  }
}
for (const marker of [
  'readAreaPanelObstacles',
  'getBoundingClientRect',
  'getComputedStyle',
]) {
  if (!areaPanelDom.includes(marker)) {
    failures.push(`M1.5 panel DOM integration is missing ${marker}.`);
  }
}
for (const marker of [
  'AREA_PANEL_MIN_PLAYER_GAP',
  'AREA_PANEL_MIN_TOUCH_TARGET',
  'chooseAreaPanelPlacement',
  'areaPanelIntersectionArea',
  'areaPanelRectDistance',
]) {
  if (!areaPanelPlacement.includes(marker)) {
    failures.push(`M1.5 panel placement core is missing ${marker}.`);
  }
}
if (AREA_PANEL_MIN_PLAYER_GAP !== 12 || AREA_PANEL_MIN_TOUCH_TARGET !== 44) {
  failures.push('M1.5 panel constants must preserve 12px clearance and 44px touch targets.');
}
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
]) {
  for (const direction of ['up', 'down']) {
    for (const facing of ['left', 'right']) {
      const placement = chooseAreaPanelPlacement({
        viewport,
        panel: { width: 260, height: 89 },
        player: createAreaPanelRect(
          viewport.width / 2 - 28,
          viewport.height * 0.55,
          56,
          100,
        ),
        direction,
        facing,
        safeArea: { top: 12, right: 12, bottom: 12, left: 12 },
        obstacles: [
          {
            id: 'clock',
            rect: createAreaPanelRect(12, 12, 180, 72),
          },
          {
            id: 'audio',
            rect: createAreaPanelRect(viewport.width - 112, 12, 100, 52),
          },
          {
            id: 'joystick',
            rect: createAreaPanelRect(12, viewport.height - 150, 138, 138),
          },
        ],
      });
      if (
        !placement.valid
        || placement.playerIntersectionArea !== 0
        || placement.playerDistance < AREA_PANEL_MIN_PLAYER_GAP
        || placement.obstacleIntersections.length !== 0
        || placement.rect.width < AREA_PANEL_MIN_TOUCH_TARGET
        || placement.rect.height < AREA_PANEL_MIN_TOUCH_TARGET
      ) {
        failures.push(
          `M1.5 panel placement failed ${viewport.width}x${viewport.height} `
          + `${direction}/${facing}.`,
        );
      }
    }
  }
}
if (
  [
    areaData,
    geometryFixtureSource,
    baselineGeometryFixtureSource,
    baselineCapture,
    audioEvidenceGenerator,
    browserSmoke,
    qualityWorkflow,
    browserWorkflow,
    productionSmoke,
    projectState,
    m15Manifest,
  ].some((source) => JSON.stringify(source).includes('home-yard'))
) {
  failures.push('M1.5 must not introduce home-yard; use home-street.');
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
  'groundInvariant',
  'cameraBoundsInvariant',
  'sourceSpawnIdPreserved',
  'transitionLocked',
  'timePreserved',
  'mutePreserved',
  'state.json',
  'runtime.log',
  'trace.zip',
  'pageErrors.length',
  'failedRequests.length',
  'BROWSER_VIEWPORT_WIDTH',
  'BROWSER_VIEWPORT_HEIGHT',
  'BROWSER_TRACE',
  'viewport',
  'traceEnabled',
]) {
  if (!browserSmoke.includes(marker)) {
    failures.push(`Browser Smoke is missing M1.4 assertion marker ${marker}.`);
  }
}
for (const marker of [
  "from '../src/game/areas/m15GeometryFixture.mjs'",
  'getM15GeometryArea',
  'M15_TIME_PHASES',
  "positiveIntegerFromEnv('BROWSER_VIEWPORT_WIDTH', 1280)",
  "positiveIntegerFromEnv('BROWSER_VIEWPORT_HEIGHT', 720)",
  "'Input.dispatchTouchEvent'",
  'page.touchscreen.tap',
  'AREA_PANEL_MIN_PLAYER_GAP',
  'AREA_PANEL_MIN_TOUCH_TARGET',
  'evidence.panelMatrix.length === 12',
  'requiredAggregatePanelStatesAcrossThreeViewports: 36',
  'triggerBoundaryWorldX',
  'PANEL_TRIGGER_INSET_WORLD_PX = 8',
  'entrance.triggerRange.minX + PANEL_TRIGGER_INSET_WORLD_PX',
  'entrance.triggerRange.maxX - PANEL_TRIGGER_INSET_WORLD_PX',
  'fixtureGroundMeasurement',
  "'boku-no-jihanki:player-screen-geometry'",
  'lastPlayerGeometry',
  'renderedFootScreenY',
  'fixtureGroundScreenY',
  'playerGeometry.footRect.top + playerGeometry.footRect.height / 2',
  'geometry.ground.y - playerGeometry.cameraScrollY',
  'cssDelta <= tolerance',
  'backgroundSha256: geometry.assets.backgroundSha256',
  'foregroundSha256: geometry.assets.foregroundSha256',
  '`debug-geometry-${areaId}.png`',
  'groundMeasurements.length >= 27',
  'debugGeometryCoverage',
  'phaseCoverage',
  '__BOKU_M15_AUDIO__',
  'sourceId',
  'BGM loop boundary did not advance naturally.',
  'BGM loop replaced its source.',
  'async function createInstrumentedPage({',
  'accountRuntimeFailures = false',
  'if (!accountRuntimeFailures || !collectRuntimeFailures) return;',
  'await inputController.cancel().catch(() => {});',
  'await page.close();',
  'accountRuntimeFailures: true',
  'cdpLifecycleEvents.length = 0',
  "'Page.setWebLifecycleState'",
  "'Page.setLifecycleEventsEnabled'",
  "'Page.lifecycleEvent'",
  "'visibilitychange'",
  'M15_BROWSER_LIFECYCLE_LAUNCH',
  'M15_CHROMIUM_X11_ARGS',
  'M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS',
  'captureX11TabVisibilityLifecycle',
  "from './x11-tab-visibility.mjs'",
  'ignoreDefaultArgs: [',
  '...M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS',
  'browser.newBrowserCDPSession()',
  'const tabLifecycle = await captureX11TabVisibilityLifecycle({',
  'candidatePage: page',
  "method: 'x11-xdotool-tab-switch'",
  'x11TabControl: tabLifecycle.x11TabControl',
  'hiddenSettledState: hiddenState',
  'visibleSettledState: visibleState',
  'const visibleRecoveryDelta = cyclicOffsetDelta(',
  'visibleRecoveryDelta,',
  'visibilityState: document.visibilityState',
  "hiddenPanelClick.visibilityState === 'hidden'",
  'hiddenPanelClick.requestCountAfter',
  "hiddenPanelClick.traversalRequest?.visibilityState === 'hidden'",
  'traversalRequests: []',
  "'boku-no-jihanki:area-traversal-request'",
  'staleTraversal.didNotTransition',
  'A traversal request queued while hidden executed after visibility recovery.',
  "value.masterGainAutomation?.reason === (muted ? 'mute' : 'unmute')",
  'value.masterGain - value.masterGainAutomation.target',
  'audio?.documentHidden !== true',
  'audio?.masterGainAutomation?.target !== 0',
  "audio?.masterGainAutomation?.reason !== 'visibility-hidden'",
  'audio?.masterGain > 0.01',
  'audio?.documentHidden !== false',
  "audio?.masterGainAutomation?.reason !== 'visibility-visible'",
  'Math.abs(audio.masterGain - target) > 0.02',
  'frozenResponse',
  'activeResponse',
  "method: 'cdp-page-lifecycle'",
  'frozenCommand',
  'activeCommand',
  'domEventObserved',
  'headlessConstraint',
  'relatedUnitTest',
  'waitForAudioAdvance(beforeFreeze)',
  'frozen-active recovery replaced the BGM source.',
  'frozen-active recovery changed the logical mute setting.',
  'frozen-active recovery error:',
  'heartbeatSuspension',
  'calibratedGaps',
  'innerFrozenCallbacks.length === 0',
  'postActiveCallbacks.length >= 1',
  'minimumSuspensionGapMs',
  'setTimeout(resolve, 3_200)',
  'frozenSettleMarginMs = 400',
  'activeSettleMarginMs = 100',
  'Math.floor(frozenWallDurationMs * 0.78)',
  'frozenAcceptedAt,',
  'activeRequestedAt,',
  'const postActiveInput = await exerciseWalk(',
  'fileSha256(statePath)',
  'fileSha256(runtimeLogPath)',
  "path.join(outputDir, 'completion.json')",
  'CDP frozen state did not suspend the page heartbeat:',
  'prepareVercelPreviewAccess',
  'isVercelAuthenticationUrl',
  "'x-vercel-protection-bypass'",
  "'x-vercel-set-bypass-cookie': 'samesitenone'",
  'Never persist it in trace.zip.',
  'traceSuppressedForProtectedPreview',
  'tracingStarted = true',
  'context && tracingStarted',
  'Vercel Preview navigation was redirected to an authentication page.',
  'HUD timeline player ground invariant failed.',
  'pageErrors.length === 0',
  'failedRequests.length === 0',
  'EXPECTED_COMMIT must be a complete 40-character Git SHA.',
  "getAttribute('data-build-commit')",
  'observedCommit.toLowerCase() === expectedCommit.toLowerCase()',
  'pageErrors.length = 0',
  'requestedUrls.clear()',
  'm15-smoke-exact=',
  'Timed out waiting for commit ${expectedCommit} at ${baseUrl}.',
  "'state.json'",
  "'runtime.log'",
  "'trace.zip'",
]) {
  if (!browserSmoke.includes(marker)) {
    failures.push(`M1.5 Browser Smoke is missing ${marker}.`);
  }
}
for (const [legacyPattern, label] of [
  [
    /fixtureWorldX:\s*entrance\.triggerRange\.minX\s*\+\s*4\b/,
    'legacy panel start inset',
  ],
  [
    /fixtureWorldX:\s*entrance\.triggerRange\.maxX\s*-\s*4\b/,
    'legacy panel end inset',
  ],
  [/\bvisibilityOverride\b/, 'fake visibility override'],
  [
    /deterministic-document-visibility-override/,
    'fake visibility Evidence method',
  ],
  [
    /cdp-browser-window-minimize-restore/,
    'obsolete CDP browser-window visibility method',
  ],
  [/Browser\.setWindowBounds/, 'obsolete CDP browser-window minimization'],
  [
    /windowState:\s*['"]minimized['"]/,
    'obsolete minimized browser-window state',
  ],
  [
    /Object\.defineProperty\(\s*document\s*,\s*['"](?:hidden|visibilityState)['"]/,
    'fake document visibility property',
  ],
  [/playwright-real-tab-activation/, 'non-hidden tab activation method'],
  [/coverPage\.bringToFront\(\)/, 'non-hidden cover-tab activation'],
  [/frozenSettleMarginMs\s*=\s*800\b/, 'oversized frozen settle margin'],
  [/activeSettleMarginMs\s*=\s*300\b/, 'oversized active settle margin'],
]) {
  if (legacyPattern.test(browserSmoke)) {
    failures.push(`M1.5 Browser Smoke still contains ${label}.`);
  }
}
if (
  browserSmoke.includes("document.dispatchEvent(new Event('freeze'))")
  || browserSmoke.includes("document.dispatchEvent(new Event('resume'))")
) {
  failures.push(
    'M1.5 Browser Smoke must use actual CDP frozen/active commands, not '
    + 'synthetic DOM freeze/resume events.',
  );
}
if (browserSmoke.includes('expectedCommit.length === 0')) {
  failures.push('M1.5 Browser Smoke must never bypass complete-SHA verification.');
}
const exactBadgeWaitOrder = [
  'let commitMatched = false',
  "getAttribute('data-build-commit')",
  'observedCommit.toLowerCase() === expectedCommit.toLowerCase()',
  'collectRuntimeFailures = true',
  'm15-smoke-exact=',
].map((marker) => browserSmoke.indexOf(marker));
if (
  exactBadgeWaitOrder.some((index) => index < 0)
  || exactBadgeWaitOrder.some(
    (index, markerIndex) => (
      markerIndex > 0 && index <= exactBadgeWaitOrder[markerIndex - 1]
    ),
  )
) {
  failures.push(
    'M1.5 Browser Smoke must wait for the exact commit badge before collecting results.',
  );
}
const freshExactPageOrder = [
  browserSmoke.indexOf('} = await createInstrumentedPage());'),
  browserSmoke.indexOf('let commitMatched = false'),
  browserSmoke.indexOf(
    'collectRuntimeFailures = false;',
    exactBadgeWaitOrder[2],
  ),
  browserSmoke.indexOf('await page.close();', exactBadgeWaitOrder[2]),
  browserSmoke.indexOf(
    '} = await createInstrumentedPage({',
    exactBadgeWaitOrder[2],
  ),
  browserSmoke.indexOf(
    'accountRuntimeFailures: true',
    exactBadgeWaitOrder[2],
  ),
  browserSmoke.indexOf('pageErrors.length = 0', exactBadgeWaitOrder[2]),
  browserSmoke.indexOf('failedRequests.length = 0', exactBadgeWaitOrder[2]),
  browserSmoke.indexOf('requestedUrls.clear()', exactBadgeWaitOrder[2]),
  browserSmoke.indexOf(
    'cdpLifecycleEvents.length = 0',
    exactBadgeWaitOrder[2],
  ),
  browserSmoke.indexOf(
    'collectRuntimeFailures = true',
    exactBadgeWaitOrder[2],
  ),
  browserSmoke.indexOf(
    'const exactResponse = await page.goto',
    exactBadgeWaitOrder[2],
  ),
  browserSmoke.indexOf('m15-smoke-exact=', exactBadgeWaitOrder[2]),
];
if (
  freshExactPageOrder.some((index) => index < 0)
  || freshExactPageOrder.some(
    (index, markerIndex) => (
      markerIndex > 0 && index <= freshExactPageOrder[markerIndex - 1]
    ),
  )
  || browserSmoke.match(/accountRuntimeFailures: true/g)?.length !== 1
) {
  failures.push(
    'M1.5 Browser Smoke must isolate exact-run failures on one fresh '
    + 'instrumented page after closing the commit polling page.',
  );
}
if (
  (browserSmoke.match(/^\s+browserLifecycleLaunch,\s*$/gm)?.length ?? 0)
  !== 3
) {
  failures.push(
    'M1.5 Browser Smoke must retain its native backgrounding launch policy '
      + 'in initial, complete, and failed state payloads.',
  );
}
const finalizationOrder = [
  browserSmoke.indexOf('await browser.close().then'),
  browserSmoke.indexOf("statePayload.status = 'complete'"),
  browserSmoke.indexOf('fs.writeFileSync(runtimeLogPath'),
  browserSmoke.indexOf(
    'statePath,',
    browserSmoke.indexOf('fs.writeFileSync(runtimeLogPath'),
  ),
  browserSmoke.indexOf("path.join(outputDir, 'completion.json')"),
];
if (
  finalizationOrder.some((index) => index < 0)
  || finalizationOrder.some(
    (index, markerIndex) => (
      markerIndex > 0 && index <= finalizationOrder[markerIndex - 1]
    ),
  )
) {
  failures.push(
    'M1.5 Browser Smoke must close the browser and finalize state/log hashes '
    + 'before writing its completion marker.',
  );
}
for (const [source, marker, label] of [
  [viteConfig, '__BUILD_COMMIT_FULL__', 'Vite full build SHA define'],
  [buildBadge, 'data-build-commit={__BUILD_COMMIT_FULL__}', 'build badge full SHA metadata'],
  [buildTypes, 'declare const __BUILD_COMMIT_FULL__: string;', 'build full SHA type'],
]) {
  if (!source.includes(marker)) {
    failures.push(`M1.5 exact-SHA contract is missing ${label}.`);
  }
}
for (const marker of [
  'private publishPanelGeometry(): void',
  'this.game.canvas.getBoundingClientRect()',
  'this.player.getBounds()',
  'const scaleX = canvasRect.width / this.game.canvas.width',
  'const scaleY = canvasRect.height / this.game.canvas.height',
  'publishPlayerScreenGeometry({',
  'footRect: {',
  'cameraScrollY: camera.scrollY',
  'private drawGeometryDebug(): void',
  'const geometry = getM15GeometryArea(this.areaId)',
  'graphics.lineBetween(0, groundY, geometry.worldWidth, groundY)',
  'geometry.ground.samples',
  'geometry.branchEntrances',
  'Object.values(geometry.spawns)',
  'COLOR ground/sample=green bg-entry=blue trigger=orange spawn=yellow foot=red',
]) {
  if (!sideScrollScene.includes(marker)) {
    failures.push(`SideScrollTownScene rendered geometry is missing ${marker}.`);
  }
}
for (const marker of [
  'PLAYER_SCREEN_GEOMETRY_EVENT',
  'interface PlayerScreenGeometry',
  'footRect: ScreenRectSnapshot',
  'cameraScrollY: number',
  'scaleX: number',
  'scaleY: number',
  'publishPlayerScreenGeometry(geometry: PlayerScreenGeometry)',
]) {
  if (!gameBridge.includes(marker)) {
    failures.push(`gameBridge rendered geometry contract is missing ${marker}.`);
  }
}
for (const [workflowName, workflow] of [
  ['Quality', qualityWorkflow],
  ['Browser Smoke', browserWorkflow],
]) {
  if (!workflow.includes(EXACT_PR_HEAD_CHECKOUT)) {
    failures.push(`${workflowName} workflow must checkout the exact pull-request head SHA.`);
  }
  if (!workflow.includes('node-version: 22')) {
    failures.push(`${workflowName} workflow must use Node.js 22.`);
  }
}
const workflowDeviceIds = [...browserWorkflow.matchAll(
  /^\s+- device_id:\s+(\S+)\s*$/gm,
)].map((match) => match[1]);
if (
  JSON.stringify(workflowDeviceIds)
  !== JSON.stringify([
    'desktop-1280x720',
    'touch-844x390',
    'touch-932x430-dpr3',
  ])
) {
  failures.push('Browser Smoke workflow must define exactly the three M1.5 device jobs.');
}
for (const marker of [
  "VERCEL_GIT_COMMIT_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
  'device_id: desktop-1280x720',
  "width: '1280'",
  "height: '720'",
  "dpr: '1'",
  "touch: 'false'",
  'device_id: touch-844x390',
  "width: '844'",
  "height: '390'",
  "dpr: '2'",
  "touch: 'true'",
  "trace: 'false'",
  'device_id: touch-932x430-dpr3',
  "width: '932'",
  "height: '430'",
  "dpr: '3'",
  "'PROJECT_STATE.json'",
  "'docs/**'",
  "'tools/evidence/**'",
  "'.github/fontconfig/**'",
  'M15_PREVIEW_URL: https://',
  'M15_BASELINE_SHA: 29223ee31fd4fc4fbca21a37b01fe89277279647',
  'M15_RUNNER_OS_IMAGE: ubuntu-24.04',
  "BROWSER_HEADLESS: 'false'",
  'timeout-minutes: 90',
  'fetch-depth: 0',
  'Select headed Google Chrome with AAC support',
  'Install browser, real X11 window manager and Japanese font',
  'fontconfig',
  'fonts-noto-cjk',
  'xdotool',
  'x11-utils',
  'fontconfig fonts-noto-cjk openbox xdotool x11-utils xvfb',
  '.github/fontconfig/m15-noto-cjk.conf',
  'export FONTCONFIG_FILE="$M15_FONTCONFIG_FILE"',
  'echo "FONTCONFIG_FILE=$M15_FONTCONFIG_FILE" >> "$GITHUB_ENV"',
  'Fontconfig policy file:',
  'CONFIGURED_JAPANESE_FONT_FAMILY',
  "fc-pattern --config --default \\",
  "'Noto Sans CJK JP:lang=ja'",
  'JAPANESE_FONT_OWNER',
  'fc-query',
  'fc-cache -f -v',
  'render-environment-setup.log',
  'Resolved Japanese font family:',
  'Japanese sans-serif did not resolve to Noto Sans CJK JP.',
  "'sans-serif:lang=ja'",
  'JAPANESE_FONT_SHA256',
  'M15_JAPANESE_FONT_PACKAGE_VERSION',
  'Prepare immutable baseline build',
  'git diff --quiet "$M15_BASELINE_SHA" -- package.json package-lock.json',
  'git archive --format=tar "$M15_BASELINE_SHA"',
  'VERCEL_GIT_COMMIT_SHA="$M15_BASELINE_SHA"',
  'echo "BASELINE_ROOT=$BASELINE_ROOT" >> "$GITHUB_ENV"',
  'test -d "$BASELINE_ROOT"',
  'Capture exact baseline in candidate browser environment',
  'node tools/evidence/capture_m15_baseline.mjs',
  'diagnostics/baseline-${{ matrix.device_id }}',
  'runs-on: ubuntu-24.04',
  "dpkg-query --show \\",
  'CHROME_PATH="$(command -v google-chrome)"',
  'echo "BROWSER_EXECUTABLE_PATH=$CHROME_PATH" >> "$GITHUB_ENV"',
  'Preflight native X11 tab visibility',
  'diagnostics/visibility-preflight-${{ matrix.device_id }}',
  'node tools/evidence/probe_m15_x11_visibility.mjs',
  'browser-smoke-${{ github.run_id }}-${{ matrix.device_id }}',
  'retention-days: 90',
  'name: Assemble exact-head M1.5 Evidence',
  'needs:',
  '- smoke',
  'actions/download-artifact@v4',
  'pattern: browser-smoke-${{ github.run_id }}-*',
  'merge-multiple: true',
  'python3 tools/evidence/generate_m15_audio_evidence.py',
  'python3 tools/evidence/assemble_m15_evidence.py',
  'local run_pattern="$2"',
  '-type d -name "$run_pattern"',
  "'baseline-*'",
  "'m15-run-*'",
  '--candidate-sha "$M15_CANDIDATE_SHA"',
  'm15-evidence-${{ github.run_id }}-${{ github.event.pull_request.head.sha }}',
  'compression-level: 0',
  'Raw tracing',
  'protected Preview credential',
]) {
  if (!browserWorkflow.includes(marker)) {
    failures.push(`Browser Smoke workflow is missing M1.5 viewport/head gate ${marker}.`);
  }
}
for (const marker of [
  '<include ignore_missing="no">/etc/fonts/fonts.conf</include>',
  '<test name="family" qual="any" compare="eq">',
  '<string>sans-serif</string>',
  '<test name="lang" compare="contains">',
  '<string>ja</string>',
  '<edit name="family" mode="prepend_first" binding="strong">',
  '<string>Noto Sans CJK JP</string>',
]) {
  if (!notoFontConfig.includes(marker)) {
    failures.push(`M1.5 Japanese fontconfig policy is missing ${marker}.`);
  }
}
if ((browserWorkflow.match(/trace: 'false'/g)?.length ?? 0) !== 3) {
  failures.push('Browser Smoke raw tracing must stay disabled for all three device jobs.');
}
if (
  (browserWorkflow.match(
    /run: xvfb-run -a bash scripts\/run-headed-browser-smoke\.sh/g,
  )?.length ?? 0) !== 3
) {
  failures.push(
    'M1.5 Browser Smoke must run headed Chromium under Xvfb and a real '
      + 'window manager for local, Preview, and Production lifecycle measurements.',
  );
}
for (const marker of [
  'openbox --sm-disable',
  'command -v xdotool >/dev/null',
  'printf \'xdotoolPath=%s\\n\' "$(command -v xdotool)"',
  'xdotool version',
  'xprop -root _NET_SUPPORTING_WM_CHECK',
  'xprop -id "$candidate_window_id"',
  'candidate_support_window_id="${BASH_REMATCH[1]}"',
  '[[ "$candidate_support_window_id" == "$candidate_window_id" ]]',
  'kill -0 "$window_manager_pid"',
  'window_support_property',
  'window_name_property',
  'window-manager-environment.txt',
  'fontconfig fonts-noto-cjk openbox xdotool x11-utils xvfb',
  'M15_RUNNER_OS_IMAGE',
  'M15_JAPANESE_FONT_MATCH',
  'M15_JAPANESE_FONT_SHA256',
  'window_manager_ready=true',
  'smoke_command=("$@")',
  '"${smoke_command[@]}"',
  'set +e',
  'smoke_status=$?',
  'exit "$smoke_status"',
  'node scripts/browser-smoke.mjs',
]) {
  if (!headedBrowserSmokeRunner.includes(marker)) {
    failures.push(`Headed Browser Smoke runner is missing ${marker}.`);
  }
}
if (/document\.(?:hidden|visibilityState)/.test(headedBrowserSmokeRunner)) {
  failures.push(
    'Headed Browser Smoke runner must not simulate document visibility.',
  );
}
const exactPullRequestCommit =
  'EXPECTED_COMMIT: ${{ github.event.pull_request.head.sha }}';
if (
  (browserWorkflow.match(
    /EXPECTED_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/g,
  )?.length ?? 0) !== 2
) {
  failures.push(
    'Browser Smoke workflow must bind both local and Preview runs to the exact PR head.',
  );
}
const installBrowserStep = browserWorkflow.indexOf(
  '- name: Install browser, real X11 window manager and Japanese font',
);
const selectChromeStep = browserWorkflow.indexOf(
  '- name: Select headed Google Chrome with AAC support',
);
const visibilityPreflightStep = browserWorkflow.indexOf(
  '- name: Preflight native X11 tab visibility',
);
const prepareBaselineStep = browserWorkflow.indexOf(
  '- name: Prepare immutable baseline build',
);
const baselineCaptureStep = browserWorkflow.indexOf(
  '- name: Capture exact baseline in candidate browser environment',
);
const localSmokeStep = browserWorkflow.indexOf(
  '- name: Test exact local pull request build',
);
const previewSmokeStep = browserWorkflow.indexOf(
  '- name: Test exact Vercel Preview',
);
const productionSmokeStep = browserWorkflow.indexOf(
  '- name: Test exact deployed Production',
);
if (
  installBrowserStep < 0
  || selectChromeStep <= installBrowserStep
  || visibilityPreflightStep <= selectChromeStep
  || prepareBaselineStep <= visibilityPreflightStep
  || baselineCaptureStep <= prepareBaselineStep
  || localSmokeStep <= baselineCaptureStep
  || previewSmokeStep <= localSmokeStep
  || productionSmokeStep <= previewSmokeStep
) {
  failures.push(
    'Browser Smoke workflow must select Chrome, prove native X11 tab '
      + 'visibility, then build/capture the immutable baseline before the '
      + 'local candidate and exact Vercel Preview.',
  );
} else {
  const installBrowserStepSource = browserWorkflow.slice(
    installBrowserStep,
    selectChromeStep,
  );
  for (const marker of [
    'sudo apt-get install --yes --no-install-recommends',
    'xdotool \\',
    'x11-utils',
    "dpkg-query --show \\",
    'fontconfig fonts-noto-cjk openbox xdotool x11-utils xvfb',
  ]) {
    if (!installBrowserStepSource.includes(marker)) {
      failures.push(`Browser Smoke X11 package setup is missing ${marker}.`);
    }
  }
  const preflightStepSource = browserWorkflow.slice(
    visibilityPreflightStep,
    prepareBaselineStep,
  );
  for (const marker of [
    "BROWSER_HEADLESS: 'false'",
    'BROWSER_VIEWPORT_WIDTH: ${{ matrix.width }}',
    'BROWSER_VIEWPORT_HEIGHT: ${{ matrix.height }}',
    'BROWSER_DEVICE_SCALE_FACTOR: ${{ matrix.dpr }}',
    'BROWSER_TOUCH: ${{ matrix.touch }}',
    'diagnostics/visibility-preflight-${{ matrix.device_id }}',
    'xvfb-run -a bash scripts/run-headed-browser-smoke.sh',
    'node tools/evidence/probe_m15_x11_visibility.mjs',
  ]) {
    if (!preflightStepSource.includes(marker)) {
      failures.push(`Browser Smoke X11 preflight is missing ${marker}.`);
    }
  }
  const prepareBaselineStepSource = browserWorkflow.slice(
    prepareBaselineStep,
    baselineCaptureStep,
  );
  for (const marker of [
    'git archive --format=tar "$M15_BASELINE_SHA"',
    'npm --prefix "$BASELINE_ROOT" run build',
    'echo "BASELINE_ROOT=$BASELINE_ROOT" >> "$GITHUB_ENV"',
  ]) {
    if (!prepareBaselineStepSource.includes(marker)) {
      failures.push(`Browser Smoke baseline preparation is missing ${marker}.`);
    }
  }
  const baselineStepSource = browserWorkflow.slice(
    baselineCaptureStep,
    localSmokeStep,
  );
  for (const marker of [
    'EXPECTED_COMMIT: ${{ env.M15_BASELINE_SHA }}',
    'BROWSER_VIEWPORT_WIDTH: ${{ matrix.width }}',
    'BROWSER_VIEWPORT_HEIGHT: ${{ matrix.height }}',
    'BROWSER_DEVICE_SCALE_FACTOR: ${{ matrix.dpr }}',
    'BROWSER_TOUCH: ${{ matrix.touch }}',
    'BROWSER_TRACE: ${{ matrix.trace }}',
    'test -d "$BASELINE_ROOT"',
    'npm --prefix "$BASELINE_ROOT" run preview',
    'xvfb-run -a bash scripts/run-headed-browser-smoke.sh',
    'node tools/evidence/capture_m15_baseline.mjs',
  ]) {
    if (!baselineStepSource.includes(marker)) {
      failures.push(`Browser Smoke baseline matrix step is missing ${marker}.`);
    }
  }
  const localStepSource = browserWorkflow.slice(localSmokeStep, previewSmokeStep);
  const previewStepSource = browserWorkflow.slice(
    previewSmokeStep,
    productionSmokeStep,
  );
  for (const marker of [
    exactPullRequestCommit,
    'BROWSER_VIEWPORT_WIDTH: ${{ matrix.width }}',
    'BROWSER_VIEWPORT_HEIGHT: ${{ matrix.height }}',
    'BROWSER_DEVICE_SCALE_FACTOR: ${{ matrix.dpr }}',
    'BROWSER_TOUCH: ${{ matrix.touch }}',
    'BROWSER_TRACE: ${{ matrix.trace }}',
  ]) {
    if (!localStepSource.includes(marker) || !previewStepSource.includes(marker)) {
      failures.push(
        `Browser Smoke local and Preview matrix steps must both include ${marker}.`,
      );
    }
  }
  for (const marker of [
    'BASE_URL: http://127.0.0.1:4173',
    'diagnostics/local-${{ matrix.device_id }}',
  ]) {
    if (!localStepSource.includes(marker)) {
      failures.push(`Browser Smoke local matrix step is missing ${marker}.`);
    }
  }
  for (const marker of [
    'BASE_URL: ${{ env.M15_PREVIEW_URL }}',
    'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}',
    'diagnostics/preview-${{ matrix.device_id }}',
    "PRODUCTION_WAIT_MS: '900000'",
  ]) {
    if (!previewStepSource.includes(marker)) {
      failures.push(`Browser Smoke exact Preview matrix step is missing ${marker}.`);
    }
  }
}
if (
  (browserWorkflow.match(
    /diagnostics\/visibility-preflight-\$\{\{ matrix\.device_id \}\}/g,
  )?.length ?? 0) !== 2
) {
  failures.push(
    'Browser Smoke workflow must both write and upload each X11 preflight diagnostic.',
  );
}
for (const marker of [
  'Verify Vercel Production contains approved M1.5',
  'M1.5 SIDE-SCROLL HUD',
  '/assets/images/m15',
  '/assets/audio/m15/summer-morning-loop-9ea9bb8b71d7.m4a',
  'grep -Fq "${GITHUB_SHA}"',
  'home-street',
  'life-road',
  'upper-vending-lane',
  '上のエリアへ移動',
  '下のエリアへ移動',
  'player-atlas',
]) {
  if (!productionSmoke.includes(marker)) {
    failures.push(`Future Production Smoke must verify M1.5 runtime marker ${marker}.`);
  }
}

if (failures.length) {
  console.error('Project validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Project validation passed (${requiredFiles.length} required files, `
    + `${M14_AREAS.length} official areas, 28 M1.4 and 24 M1.5 player frames, `
    + 'M1.3/M1.4 assets preserved, M2 disconnected).',
  );
}
