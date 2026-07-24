import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  M15_AREA_IDS,
  M15_GEOMETRY_FIXTURE,
} from '../src/game/areas/m15GeometryFixture.mjs';
import {
  M15_BASELINE_GEOMETRY_FIXTURE,
} from '../tools/evidence/m15BaselineGeometryFixture.mjs';

const M14_AREAS = ['home-street', 'life-road', 'upper-vending-lane'];
const M14_PHASES = ['morning', 'day', 'evening', 'night'];
const M15_BASELINE_COMMIT = '29223ee31fd4fc4fbca21a37b01fe89277279647';
const M15_CHECKPOINT_COMMITS = {
  cp1Assets: 'edfb2b5f549e8f0407215402e868ebbe6d23c7f4',
  cp2Runtime: 'bd33365d8b3504f9ca034517ec01f2ba5081f023',
  cp3Tests: '67b61f703a48bb5086ef53f4ffd92594f5ac3d3e',
};
const EXACT_PR_HEAD_CHECKOUT =
  "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

test('PWA is configured for a landscape standalone experience', async () => {
  const manifest = await readJson('public/manifest.webmanifest');
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'ja');
});

test('M1.5 state reopens M1 and blocks M2 and Production pending approval', async () => {
  const state = await readJson('PROJECT_STATE.json');
  assert.equal(state.currentMilestone, 'M1.5');
  assert.equal(state.currentMilestoneScope, 'mandatory-real-device-quality-rebuild');
  assert.equal(state.status, 'implementation-in-progress');
  assert.equal(state.statusScope, 'm1-reopened-for-real-device-quality; m2-stopped');
  assert.equal(state.currentProductionBaseline, M15_BASELINE_COMMIT);
  assert.equal(state.lastProductionCommit, M15_BASELINE_COMMIT);
  assert.equal(
    state.m14ImplementationProductionCommit,
    '147f770a4b73077c4e5dc0523839b3fefb789db4',
  );
  assert.equal(state.m1Completion.status, 'reopened');
  assert.equal(state.m1Completion.activeCorrection, 'M1.5');
  assert.match(state.m1Completion.mainMergeBlockedUntil, /real iPhone/i);
  assert.equal(state.nextMilestone, 'M1.5');
  assert.equal(state.nextTask, 'm1.5-evidence-preview-and-independent-qa');
  assert.equal(state.developmentRulesVersion, '2.4');
  assert.ok(state.paused.includes('m2-vending-machine-scene-integration'));
  assert.ok(state.paused.includes('open-pr-31'));
  assert.deepEqual(
    state.evidence.m15CheckpointCommits,
    M15_CHECKPOINT_COMMITS,
  );
  assert.equal(state.evidence.m15BaselineCommit, M15_BASELINE_COMMIT);
  assert.equal(
    state.evidence.m15LostHistoricalCommit,
    '04c6d0879fc4283d94d0a6d515a1916a0999406b',
  );
  assert.match(state.evidence.m15LostHistoricalCommitStatus, /nonrecoverable/i);
  assert.deepEqual(state.evidence.m15AreaIds, M15_AREA_IDS);
  assert.deepEqual(state.evidence.m15RequiredViewports, [
    '1280x720',
    '844x390 touch',
    '932x430 DPR3 touch',
  ]);
  assert.deepEqual(state.evidence.m15RequiredGateOrder, [
    'local-quality-and-browser-smoke',
    'same-sha-vercel-preview-browser-smoke',
    'ci-and-independent-candidate-qa-and-evidence-audit',
    'explicit-real-iphone-approval-for-exact-preview-sha',
    'main-merge',
    'same-merge-sha-production-deploy-and-smoke',
  ]);
  assert.equal(state.evidence.m15CandidateQa, 'pending');
  assert.equal(state.evidence.m15EvidenceAudit, 'pending');
  assert.equal(state.evidence.m15RealIPhoneApproval, 'pending');
  assert.equal(state.evidence.m15ProductionVerification, 'pending');
  const m14History = {
    m14Status: 'completed-production-verified-history',
    m14NavigationCoreMergeCommit: 'ee255a1a8413768d0e7dbdf512964268c8eaf276',
    m14PullRequest: 32,
    m14PullRequestHeadCommit: '5c6895d0d1e2ad31a95f6490e60cc26f89d290cf',
    m14PullRequestQualityRun: 30008762303,
    m14PullRequestBrowserRun: 30008762333,
    m14PullRequestBrowserArtifact: 8564271801,
    m14ImplementationProductionCommit:
      '147f770a4b73077c4e5dc0523839b3fefb789db4',
    m14CurrentProductionBaseline: M15_BASELINE_COMMIT,
    m14VercelProductionStatus: 'success',
    m14MainQualityRun: 30009404756,
    m14ProductionSmokeRun: 30009405068,
    m14ProductionBrowserRun: 30009404814,
    m14ProductionBrowserArtifact: 8564582434,
    m14ProductionBrowserArtifactDigest:
      'sha256:6f83bfcf99ac2f2af0e98899568ee2c17ac28e3f3ad70aef29f4c7f7c26744f3',
  };
  for (const [key, value] of Object.entries(m14History)) {
    assert.equal(state.evidence[key], value, key);
  }
  assert.match(state.evidence.m14EvidenceUse, /historical M1\.4 delivery evidence only/i);
  assert.match(state.evidence.m14EvidenceUse, /not M1\.5 candidate evidence/i);
});

test('Vercel permits only the M1.5 rebuild exception among disabled work branches', async () => {
  const config = await readJson('vercel.json');
  assert.equal(config.framework, 'vite');
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(
    config.git.deploymentEnabled['fix/m1-5-real-device-polish-rebuild'],
    true,
  );
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

test('M1.5 Evidence fixtures are independent and hash-bound to official areas', async () => {
  const [
    manifest,
    candidateSource,
    baselineSource,
    baselineCapture,
    audioEvidence,
    evidenceAssembler,
  ] =
    await Promise.all([
      readJson('public/assets/images/m15/asset-manifest.json'),
      readFile('src/game/areas/m15GeometryFixture.mjs', 'utf-8'),
      readFile('tools/evidence/m15BaselineGeometryFixture.mjs', 'utf-8'),
      readFile('tools/evidence/capture_m15_baseline.mjs', 'utf-8'),
      readFile('tools/evidence/generate_m15_audio_evidence.py', 'utf-8'),
      readFile('tools/evidence/assemble_m15_evidence.py', 'utf-8'),
    ]);
  assert.deepEqual(M15_AREA_IDS, M14_AREAS);
  assert.equal(
    M15_BASELINE_GEOMETRY_FIXTURE.baselineCommit,
    M15_BASELINE_COMMIT,
  );
  assert.deepEqual(
    M15_BASELINE_GEOMETRY_FIXTURE.officialAreaIds,
    M15_AREA_IDS,
  );
  assert.match(
    M15_BASELINE_GEOMETRY_FIXTURE.measurement.sourceIndependence,
    /Visual raster annotation only/i,
  );
  assert.doesNotMatch(
    baselineSource,
    /from ['"].*m15GeometryFixture\.mjs['"]/,
  );

  const candidateFiles = new Map(
    manifest.files.map((record) => [record.path, record]),
  );
  for (const areaId of M15_AREA_IDS) {
    const baselineArea = M15_BASELINE_GEOMETRY_FIXTURE.areas[areaId];
    const candidateArea = M15_GEOMETRY_FIXTURE.areas[areaId];
    assert.deepEqual(
      baselineArea.visualGround.samples.map(({ position }) => position),
      ['left', 'center', 'right'],
    );
    assert.deepEqual(baselineArea.visualGround.verifiedPhases, M14_PHASES);
    for (const phase of M14_PHASES) {
      const baselineBackground = baselineArea.backgrounds[phase];
      assert.equal(
        await sha256(`public${baselineBackground.path}`),
        baselineBackground.sha256,
        `baseline ${areaId}/${phase}`,
      );
      const candidatePath = `public${candidateArea.assets.backgroundPaths[phase]}`;
      assert.equal(
        candidateFiles.get(candidatePath)?.sha256,
        candidateArea.assets.backgroundSha256[phase],
        `candidate ${areaId}/${phase}`,
      );
      assert.equal(
        await sha256(candidatePath),
        candidateArea.assets.backgroundSha256[phase],
        `candidate file ${areaId}/${phase}`,
      );
    }
  }
  assert.equal(
    M15_BASELINE_GEOMETRY_FIXTURE.areas['life-road']
      .paintedUphillEntrance.present,
    true,
  );
  assert.equal(
    M15_BASELINE_GEOMETRY_FIXTURE.areas['upper-vending-lane']
      .paintedDownwardEntrance.present,
    false,
  );

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
    "'state.json'",
    "'runtime.log'",
    "'trace.zip'",
    'assert.equal(pageErrors.length, 0',
    'Baseline failed requests:',
  ]) {
    assert.ok(baselineCapture.includes(marker), marker);
  }
  assert.doesNotMatch(baselineCapture, /gitOutput\(\s*baselineRoot\b/);
  for (const marker of [
    'Refusing non-empty Evidence directory',
    'run_independent_validator',
    'truePeakOversampleFactor',
    'measurementPositions',
    'normalizedCommand',
    '"analysis.json"',
    '"waveform.png"',
    '"spectrogram.png"',
    '"loop-boundary.png"',
    '"sha256-manifest.json"',
    '"inputFiles"',
    '"toolchain"',
    '"--expected-commit"',
    'complete 40-character Git SHA',
    'actual_commit != expected_commit',
    'Refusing audio Evidence from a dirty worktree',
  ]) {
    assert.ok(audioEvidence.includes(marker), marker);
  }
  for (const marker of [
    `EXACT_BASELINE_SHA = "${M15_BASELINE_COMMIT}"`,
    'exact 40-character hexadecimal commit SHA',
    'All nine Browser Smoke run directories must be distinct.',
    'state.get("observedCommit") == candidate_sha',
    'state.get("browserHeadless") is False',
    'heartbeat.get("verified") is True',
    'heartbeat.get("innerFrozenCallbacks") == []',
    'len(heartbeat["postActiveCallbacks"]) >= 1',
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
    assert.ok(evidenceAssembler.includes(marker), marker);
  }
  assert.doesNotMatch(
    JSON.stringify({
      candidateSource,
      baselineSource,
      baselineCapture,
      audioEvidence,
      evidenceAssembler,
      manifest,
    }),
    /home-yard/,
  );
});

test('M1.5 Browser Smoke and workflows enforce exact SHA and device contracts', async () => {
  const [
    smoke,
    qualityWorkflow,
    browserWorkflow,
    productionWorkflow,
    sideScrollScene,
    gameBridge,
    viteConfig,
    buildBadge,
    buildTypes,
  ] = await Promise.all([
    readFile('scripts/browser-smoke.mjs', 'utf-8'),
    readFile('.github/workflows/quality.yml', 'utf-8'),
    readFile('.github/workflows/browser-smoke.yml', 'utf-8'),
    readFile('.github/workflows/production-smoke.yml', 'utf-8'),
    readFile('src/game/scenes/SideScrollTownScene.ts', 'utf-8'),
    readFile('src/game/gameBridge.ts', 'utf-8'),
    readFile('vite.config.ts', 'utf-8'),
    readFile('src/ui/BuildBadge.tsx', 'utf-8'),
    readFile('src/types/build.d.ts', 'utf-8'),
  ]);

  for (const workflow of [qualityWorkflow, browserWorkflow]) {
    assert.ok(workflow.includes(EXACT_PR_HEAD_CHECKOUT));
    assert.match(workflow, /node-version: 22/);
  }
  assert.equal(
    browserWorkflow.match(
      /EXPECTED_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/g,
    )?.length,
    2,
  );
  for (const marker of [
    "positiveIntegerFromEnv('BROWSER_VIEWPORT_WIDTH', 1280)",
    "positiveIntegerFromEnv('BROWSER_VIEWPORT_HEIGHT', 720)",
    "'Input.dispatchTouchEvent'",
    'page.touchscreen.tap',
    'evidence.panelMatrix.length === 12',
    'requiredAggregatePanelStatesAcrossThreeViewports: 36',
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
    'pollAudioLoopBoundary',
    'current.offset < previous.offset',
    'loopPollIntervalMs',
    'BGM loop boundary did not advance naturally.',
    'BGM loop replaced its source.',
    'HORIZONTAL_EDGE_APPROACH_MARGIN_WORLD_PX = 160',
    'Math.max(0.08, Math.min(0.6, distance / 40))',
    'PANEL_POSITION_TOLERANCE_WORLD_PX = 4',
    'requestAnimationFrame(() => resolve())',
    "'Page.setWebLifecycleState'",
    "'Page.setLifecycleEventsEnabled'",
    "'Page.lifecycleEvent'",
    "visibilityOverride = 'hidden'",
    "method: 'deterministic-document-visibility-override'",
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
    'frozenSettleMarginMs = 250',
    'activeSettleMarginMs = 100',
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
    assert.ok(smoke.includes(marker), marker);
  }
  assert.doesNotMatch(
    smoke,
    /document\.dispatchEvent\(new Event\(['"](?:freeze|resume)['"]\)\)/,
  );
  assert.ok(
    smoke.indexOf('previewAccess = await prepareVercelPreviewAccess()')
      < smoke.indexOf('await context.tracing.start'),
  );
  assert.ok(!smoke.includes('expectedCommit.length === 0'));
  const exactBadgeWaitOrder = [
    'let commitMatched = false',
    "getAttribute('data-build-commit')",
    'observedCommit.toLowerCase() === expectedCommit.toLowerCase()',
    'collectRuntimeFailures = true',
    'm15-smoke-exact=',
  ].map((marker) => smoke.indexOf(marker));
  assert.ok(exactBadgeWaitOrder.every((index) => index >= 0));
  assert.ok(
    exactBadgeWaitOrder.every(
      (index, markerIndex) => (
        markerIndex === 0 || index > exactBadgeWaitOrder[markerIndex - 1]
      ),
    ),
  );
  assert.ok(viteConfig.includes('__BUILD_COMMIT_FULL__'));
  assert.ok(buildBadge.includes('data-build-commit={__BUILD_COMMIT_FULL__}'));
  assert.ok(buildTypes.includes('declare const __BUILD_COMMIT_FULL__: string;'));
  assert.equal(
    browserWorkflow.match(
      /run: xvfb-run -a node scripts\/browser-smoke\.mjs/g,
    )?.length,
    3,
  );

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
    assert.ok(sideScrollScene.includes(marker), marker);
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
    assert.ok(gameBridge.includes(marker), marker);
  }

  assert.deepEqual(
    [...browserWorkflow.matchAll(
      /^\s+- device_id:\s+(\S+)\s*$/gm,
    )].map((match) => match[1]),
    [
      'desktop-1280x720',
      'touch-844x390',
      'touch-932x430-dpr3',
    ],
  );
  for (const marker of [
    'device_id: desktop-1280x720',
    "width: '1280'",
    "height: '720'",
    "dpr: '1'",
    "touch: 'false'",
    "trace: 'true'",
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
    'M15_PREVIEW_URL: https://',
    "BROWSER_HEADLESS: 'false'",
    'timeout-minutes: 60',
    'Select headed Google Chrome with AAC support',
    'CHROME_PATH="$(command -v google-chrome)"',
    'echo "BROWSER_EXECUTABLE_PATH=$CHROME_PATH" >> "$GITHUB_ENV"',
    'browser-smoke-${{ github.run_id }}-${{ matrix.device_id }}',
  ]) {
    assert.ok(browserWorkflow.includes(marker), marker);
  }
  const localSmokeStep = browserWorkflow.indexOf(
    '- name: Test exact local pull request build',
  );
  const previewSmokeStep = browserWorkflow.indexOf(
    '- name: Test exact Vercel Preview',
  );
  const productionSmokeStep = browserWorkflow.indexOf(
    '- name: Test exact deployed Production',
  );
  assert.ok(localSmokeStep >= 0);
  assert.ok(previewSmokeStep > localSmokeStep);
  assert.ok(productionSmokeStep > previewSmokeStep);
  const localStepSource = browserWorkflow.slice(localSmokeStep, previewSmokeStep);
  const previewStepSource = browserWorkflow.slice(
    previewSmokeStep,
    productionSmokeStep,
  );
  for (const marker of [
    'EXPECTED_COMMIT: ${{ github.event.pull_request.head.sha }}',
    'BROWSER_VIEWPORT_WIDTH: ${{ matrix.width }}',
    'BROWSER_VIEWPORT_HEIGHT: ${{ matrix.height }}',
    'BROWSER_DEVICE_SCALE_FACTOR: ${{ matrix.dpr }}',
    'BROWSER_TOUCH: ${{ matrix.touch }}',
    'BROWSER_TRACE: ${{ matrix.trace }}',
  ]) {
    assert.ok(localStepSource.includes(marker), `local ${marker}`);
    assert.ok(previewStepSource.includes(marker), `preview ${marker}`);
  }
  for (const marker of [
    'BASE_URL: http://127.0.0.1:4173',
    'diagnostics/local-${{ matrix.device_id }}',
  ]) {
    assert.ok(localStepSource.includes(marker), marker);
  }
  for (const marker of [
    'BASE_URL: ${{ env.M15_PREVIEW_URL }}',
    'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}',
    'diagnostics/preview-${{ matrix.device_id }}',
    "PRODUCTION_WAIT_MS: '900000'",
  ]) {
    assert.ok(previewStepSource.includes(marker), marker);
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
    assert.ok(productionWorkflow.includes(marker), marker);
  }
  assert.doesNotMatch(
    [smoke, qualityWorkflow, browserWorkflow, productionWorkflow].join('\n'),
    /home-yard/,
  );
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

test('M1.5 candidate scene is wired through the adapter and accessible arrow UI', async () => {
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
  assert.match(world, /\/assets\/images\/m15/);
  assert.match(arrow, /上のエリアへ移動/);
  assert.match(arrow, /下のエリアへ移動/);
  assert.match(hud, /M1\.5 SIDE-SCROLL HUD/);
});

test('M1.4 adapter delegates navigation behavior to the shared core', async () => {
  const adapter = await readFile(
    'src/game/navigationAdapter/m14NavigationAdapter.mjs',
    'utf-8',
  );
  for (const modulePath of [
    '../navigation/areaGraph.mjs',
    '../navigation/horizontalMovement.mjs',
    '../navigation/navigationState.mjs',
  ]) {
    assert.ok(
      adapter.includes(`from '${modulePath}'`)
        || adapter.includes(`from "${modulePath}"`),
      `missing core import: ${modulePath}`,
    );
  }

  for (const marker of [
    'findHorizontalExit',
    'findDirectionalExit',
    'isDirectionalPromptVisible',
    'resolveHorizontalMovement',
    'createNavigationState',
    'beginAreaTransition',
    'resolveAreaSpawn',
    'completeAreaTransition',
  ]) {
    const occurrences = adapter.match(new RegExp(`\\b${marker}\\b`, 'g')) ?? [];
    assert.ok(
      occurrences.length >= 2,
      `${marker} must be imported and called by the adapter`,
    );
  }
  const inputLockOccurrences =
    adapter.match(/\b(?:isInputLocked|isCoreInputLocked)\b/g) ?? [];
  assert.ok(
    inputLockOccurrences.length >= 2,
    'isInputLocked must be imported and called by the adapter',
  );
  assert.match(
    adapter,
    /\bvalidate(?:Core)?AreaGraph\s*\(/,
    'the adapter must call the core graph validator',
  );
  assert.match(
    adapter,
    /horizontalAxis:\s*normalizedAxis/,
    'the adapter must pass analog input directly into the core',
  );
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
