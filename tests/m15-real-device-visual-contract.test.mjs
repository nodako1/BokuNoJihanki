import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  M14_AREA_DEFINITIONS,
  M14_AREA_IDS,
} from '../src/game/areas/m14AreaData.mjs';
import {
  PLAYER_SCALE,
  cameraScrollX,
  canvasProjection,
  interpolateGroundY,
  maskRectMetrics,
  panelRectFromCss,
  pointInPolygon,
  projectMaskToCssPixels,
  readAtlasMasks,
  sampleWorldPositions,
} from './helpers/m15-real-device-visual-math.mjs';
import {
  loadM15Playwright,
  M15_PLAYWRIGHT_CACHE_ROOT,
  M15_PLAYWRIGHT_VERSION,
} from './helpers/m15-playwright-runtime.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const annotationsPath = path.join(
  repositoryRoot,
  'tests/fixtures/m15-real-device-visual-annotations.json',
);
const annotations = JSON.parse(fs.readFileSync(annotationsPath, 'utf8'));
const manualAuditPath = path.join(
  repositoryRoot,
  'tests/fixtures/m15-screenshot-manual-audit.json',
);
const manualAudit = JSON.parse(fs.readFileSync(manualAuditPath, 'utf8'));
const atlasImagePath = path.join(repositoryRoot, annotations.playerReview.asset);
const atlasJsonPath = path.join(
  repositoryRoot,
  'public/assets/images/m14/player-atlas.json',
);
const globalCssPath = path.join(repositoryRoot, 'src/styles/global.css');
const visualMetricsPath = path.join(
  repositoryRoot,
  'docs/evidence/M1_5_BASELINE_VISUAL_MEASUREMENTS.json',
);
const qaReportPath = path.join(
  repositoryRoot,
  'docs/evidence/M1_5_REAL_DEVICE_QA.md',
);
const atlasMasks = readAtlasMasks(
  atlasImagePath,
  atlasJsonPath,
  annotations.alphaThreshold,
);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function footWorldPoint(mask, playerX, playerY) {
  return {
    x: playerX + (mask.bottomCenter.x + 0.5 - mask.frame.w / 2) * PLAYER_SCALE,
    y: playerY + (mask.bottomCenter.y + 1 - mask.frame.h) * PLAYER_SCALE,
  };
}

function implementationBranches(area) {
  return ['up', 'down'].flatMap((direction) => {
    const exit = area[`${direction}Exit`];
    return exit?.kind === 'connected' && exit.trigger === 'branch'
      ? [{ direction, exit }]
      : [];
  });
}

function assertNoIssues(issues, maximumLines = 48) {
  if (issues.length === 0) return;
  const visible = issues.slice(0, maximumLines);
  const omitted = issues.length - visible.length;
  assert.fail(
    `${issues.length} contract violation(s):\n${visible.join('\n')}`
    + (omitted > 0 ? `\n... ${omitted} additional violation(s) omitted.` : ''),
  );
}

test('M1.5 independent visual annotations are tied to exact background assets and device contracts', () => {
  assert.equal(annotations.schemaVersion, 1);
  assert.deepEqual(
    annotations.viewports.map(({ width, height, deviceScaleFactor, hasTouch }) => ({
      width,
      height,
      deviceScaleFactor,
      hasTouch,
    })),
    [
      { width: 1280, height: 720, deviceScaleFactor: 1, hasTouch: false },
      { width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true },
      { width: 932, height: 430, deviceScaleFactor: 3, hasTouch: true },
    ],
  );
  assert.deepEqual(Object.keys(annotations.areas), [...M14_AREA_IDS]);

  for (const areaId of M14_AREA_IDS) {
    const areaAnnotation = annotations.areas[areaId];
    assert.equal(
      sha256(path.join(repositoryRoot, areaAnnotation.background)),
      areaAnnotation.sha256,
      `${areaId} background changed; its independent visual annotations must be reviewed again.`,
    );
    assert.equal(areaAnnotation.worldWidth, M14_AREA_DEFINITIONS[areaId].worldWidth);
    assert.ok(areaAnnotation.walkablePolygons.length > 0);
    assert.ok(areaAnnotation.groundLine.length >= 2);
  }
  assert.equal(sha256(atlasImagePath), annotations.playerReview.sha256);
});

test('M1.5 browser QA uses an external pinned Playwright runtime without changing the app manifest', () => {
  assert.equal(M15_PLAYWRIGHT_VERSION, '1.56.1');
  assert.match(M15_PLAYWRIGHT_CACHE_ROOT, /^\/tmp\//);
  const packageMetadata = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );
  assert.equal(packageMetadata.dependencies?.playwright, undefined);
  assert.equal(packageMetadata.devDependencies?.playwright, undefined);
});

test('M1.5 visual Evidence binds annotations, all 45 screen verdicts, and representative PNG digests', () => {
  const metrics = JSON.parse(fs.readFileSync(visualMetricsPath, 'utf8'));
  assert.equal(metrics.independentAnnotationsSha256, sha256(annotationsPath));
  assert.equal(metrics.manualScreenshotAudit.fixtureSha256, sha256(manualAuditPath));
  assert.equal(metrics.manualScreenshotAudit.method, manualAudit.method);
  assert.equal(metrics.manualScreenshotAudit.expectedScreenshots, 45);
  assert.equal(metrics.manualScreenshotAudit.auditedScreenshots, 45);
  assert.equal(metrics.manualScreenshotAudit.exactScreenshotSha256Validation, 'PASS');
  assert.deepEqual(metrics.screenshotSummary, { total: 45, pass: 0, fail: 45 });
  assert.equal(metrics.viewports.length, 3);
  assert.equal(
    metrics.viewports.flatMap((viewport) => viewport.screenshots).length,
    45,
  );
  assert.ok(
    metrics.viewports.flatMap((viewport) => viewport.screenshots)
      .every((screenshot) => screenshot.screenResult === 'FAIL'),
  );
  const manualByKey = new Map(manualAudit.audits.map((audit) => (
    [`${audit.viewport}/${audit.file}`, audit]
  )));
  for (const viewport of metrics.viewports) {
    assert.equal(viewport.analyticalPanelStateGroups.length, 36);
    const stateKeys = new Set(viewport.analyticalPanelStateGroups.map((group) => (
      [
        group.areaId,
        group.direction,
        group.positionId,
        group.cameraStateId,
        group.facing,
      ].join('/')
    )));
    assert.equal(stateKeys.size, 36);
    for (const group of viewport.analyticalPanelStateGroups) {
      assert.equal(group.framesMeasured, 14);
      assert.equal(group.frameMetrics.length, 14);
      assert.equal(group.maskSource, 'atlas pixels with alpha > 0');
      assert.equal(
        group.maskProjection,
        'full projected source-pixel footprint rasterized to device pixels',
      );
      assert.equal(group.distanceBasis, 'device-pixel center converted to CSS px');
      assert.equal(
        group.panelRectSource,
        'parsed CSS estimate (not a DOM measurement)',
      );
    }
    for (const screenshot of viewport.screenshots) {
      const manual = manualByKey.get(
        `${viewport.width}x${viewport.height}/${screenshot.file}`,
      );
      assert.ok(manual);
      assert.equal(screenshot.sha256, manual.sha256);
      assert.equal(screenshot.auditMethod, manualAudit.method);
      for (const field of [
        'completion',
        'grounding',
        'roadArrow',
        'playerOcclusion',
        'uiCollision',
      ]) {
        const reasonCode = manual[field];
        assert.equal(screenshot[field].manualReasonCode, reasonCode);
        assert.equal(
          screenshot[field].value,
          manualAudit.reasonCatalog[reasonCode].value,
        );
      }
    }
  }
  for (const [areaId, expectedLogicalDifference] of Object.entries({
    'home-street': 65,
    'life-road': 20,
    'upper-vending-lane': 40,
  })) {
    const measurement = metrics.groundingMeasurements[areaId];
    assert.equal(measurement.differenceLogicalPx, expectedLogicalDifference);
    assert.equal(measurement.toleranceCssPx, 6);
    assert.equal(measurement.result, 'FAIL');
    for (const viewport of annotations.viewports) {
      const projected = measurement.byViewport[viewport.id];
      assert.equal(
        projected.differenceCssPx,
        expectedLogicalDifference * canvasProjection(viewport).scale,
      );
      assert.equal(projected.toleranceCssPx, 6);
      assert.equal(projected.result, 'FAIL');
    }
  }
  const lifeBranch = metrics.branchMeasurements['life-road/up'];
  assert.equal(lifeBranch.differenceLogicalPx, 200);
  assert.equal(lifeBranch.toleranceCssPx, 32);
  assert.equal(lifeBranch.result, 'FAIL');
  for (const viewport of annotations.viewports) {
    assert.equal(
      lifeBranch.byViewport[viewport.id].differenceCssPx,
      200 * canvasProjection(viewport).scale,
    );
    assert.equal(lifeBranch.byViewport[viewport.id].result, 'FAIL');
  }
  assert.equal(
    metrics.branchMeasurements['upper-vending-lane/down'].visualPathPresent,
    false,
  );
  assert.deepEqual(metrics.representativeDpr3Capture.requestedContext, {
    width: 932,
    height: 430,
    deviceScaleFactor: 3,
    hasTouch: true,
  });
  assert.equal(metrics.representativeDpr3Capture.measuredContext.devicePixelRatio, 3);
  assert.ok(metrics.representativeDpr3Capture.measuredContext.maxTouchPoints > 0);
  assert.deepEqual(metrics.representativeDpr3Capture.pageErrors, []);
  assert.deepEqual(metrics.representativeDpr3Capture.failedRequests, []);
  assert.equal(metrics.representativeDpr3Capture.domPanelMeasurements.length, 2);
  assert.ok(metrics.representativeDpr3Capture.domPanelMeasurements.every(
    (measurement) => (
      measurement.panelRectSource
        === 'Playwright locator.boundingBox() DOM measurement'
      && measurement.framesMeasured === 14
    ),
  ));
  const liveResult = metrics.liveContractVerification.content;
  const reboundLiveSha = crypto.createHash('sha256')
    .update(`${JSON.stringify(liveResult, null, 2)}\n`)
    .digest('hex');
  assert.equal(
    metrics.liveContractVerification.resultJsonSha256,
    reboundLiveSha,
  );
  assert.equal(liveResult.baselineCommit, metrics.baselineCommit);
  assert.equal(liveResult.status, 'PASS');
  assert.equal(liveResult.scenarios.length, 3);
  for (const [index, scenario] of liveResult.scenarios.entries()) {
    const viewport = annotations.viewports[index];
    assert.equal(scenario.id, viewport.id);
    assert.equal(scenario.result, 'PASS');
    assert.ok(scenario.durationMilliseconds > 0);
    assert.equal(scenario.expectedCommit, metrics.baselineCommit);
    assert.equal(
      scenario.observedBuildCommit,
      metrics.baselineCommit.slice(0, 7),
    );
    assert.match(
      scenario.buildBadge,
      new RegExp(`${metrics.baselineCommit.slice(0, 7)}$`),
    );
    assert.equal(
      scenario.measuredContext.devicePixelRatio,
      viewport.deviceScaleFactor,
    );
    assert.equal(
      scenario.measuredContext.maxTouchPoints > 0,
      viewport.hasTouch,
    );
    assert.deepEqual(scenario.pageErrors, []);
    assert.deepEqual(scenario.failedRequests, []);
    assert.equal(
      scenario.scenario.touchJoystick.length,
      viewport.hasTouch ? 2 : 0,
    );
    if (viewport.hasTouch) {
      assert.deepEqual(
        scenario.scenario.touchJoystick.map(({ direction }) => direction),
        ['right', 'left'],
      );
      assert.ok(scenario.scenario.touchJoystick.every(
        (touch) => (
          touch.duringInputSource === 'touch'
          && touch.method.includes('CDP Input.dispatchTouchEvent')
        ),
      ));
    }
  }
  assert.equal(metrics.representativeAnnotatedImages.length, 3);
  for (const image of metrics.representativeAnnotatedImages) {
    assert.equal(
      sha256(path.join(repositoryRoot, image.path)),
      image.sha256,
      `${image.path} does not match its metrics digest.`,
    );
    assert.match(image.sourceCaptureSha256, /^[a-f0-9]{64}$/);
  }

  const canonicalArtifacts = [
    'docs/evidence/M1_5_BASELINE_AUDIO_METRICS.json',
    'docs/evidence/M1_5_BASELINE_AUDIO_SPECTROGRAM.png',
    'docs/evidence/M1_5_BASELINE_AUDIO_WAVEFORM.png',
    'docs/evidence/M1_5_BASELINE_HOME_GROUND_ANNOTATED.png',
    'docs/evidence/M1_5_BASELINE_LIFE_BRANCH_ANNOTATED.png',
    'docs/evidence/M1_5_BASELINE_UPPER_EXIT_ANNOTATED.png',
    'docs/evidence/M1_5_BASELINE_VISUAL_MEASUREMENTS.json',
  ].sort();
  const manifest = canonicalArtifacts.map((artifactPath) => (
    `${sha256(path.join(repositoryRoot, artifactPath))}  ${artifactPath}\n`
  )).join('');
  const artifactSetDigest = crypto.createHash('sha256').update(manifest).digest('hex');
  assert.match(
    fs.readFileSync(qaReportPath, 'utf8'),
    new RegExp(`Evidence artifact set SHA-256 \\| \`${artifactSetDigest}\``),
  );
});

test('M1.5 player final-quality gate requires Product Owner approval and unclipped idle/walk masks', () => {
  const issues = [];
  if (!annotations.playerReview.productOwnerApprovalReference) {
    issues.push('Product Owner approval reference is absent; final visual quality is not independently PASS.');
  }
  if (annotations.playerReview.humanAssessment !== 'PASS') {
    issues.push(
      `Human style assessment is ${annotations.playerReview.humanAssessment}: ${annotations.playerReview.notes}`,
    );
  }

  const expectedFrames = [
    ...['left', 'right'].flatMap((direction) => (
      Array.from({ length: 4 }, (_, index) => `idle-${direction}-${index}`)
    )),
    ...['left', 'right'].flatMap((direction) => (
      Array.from({ length: 10 }, (_, index) => `walk-${direction}-${index}`)
    )),
  ];
  assert.deepEqual(Object.keys(atlasMasks).sort(), expectedFrames.sort());
  const edgeFrames = [];
  for (const frameName of expectedFrames) {
    const mask = atlasMasks[frameName];
    const clippingCandidatePixels = mask.edgePixels.filter((pixel) => (
      pixel.x === 0
      || pixel.x === mask.frame.w - 1
      || pixel.y === 0
    ));
    if (clippingCandidatePixels.length > 0) {
      edgeFrames.push(`${frameName}=${clippingCandidatePixels.length}`);
    }
  }
  if (edgeFrames.length > 0) {
    issues.push(
      `${edgeFrames.length}/${expectedFrames.length} frames have opaque pixels touching a frame `
      + `top/left/right edge; clipping/欠け cannot be ruled out (${edgeFrames.join(', ')}). `
      + 'Bottom-edge foot contact is treated as valid contact, not clipping.',
    );
  }
  assertNoIssues(issues, 24);
});

test('M1.5 feet use opaque-pixel bottom-center and match independent walkable/ground annotations at all samples', () => {
  const issues = [];
  const frameNames = Object.keys(atlasMasks);
  for (const viewport of annotations.viewports) {
    const projection = canvasProjection(viewport);
    for (const areaId of M14_AREA_IDS) {
      const area = M14_AREA_DEFINITIONS[areaId];
      const areaAnnotation = annotations.areas[areaId];
      const positions = sampleWorldPositions(area);
      for (const sample of positions) {
        const failures = [];
        for (const frameName of frameNames) {
          const foot = footWorldPoint(atlasMasks[frameName], sample.x, area.groundY);
          const walkable = areaAnnotation.walkablePolygons.some((polygon) => (
            pointInPolygon(foot, polygon)
          ));
          const annotatedGroundY = interpolateGroundY(areaAnnotation.groundLine, foot.x);
          const differenceWorldPx = Math.abs(foot.y - annotatedGroundY);
          const differenceCssPx = differenceWorldPx * projection.scale;
          if (
            !walkable
            || differenceCssPx > annotations.tolerances.groundLineCssPx
          ) {
            failures.push({
              frameName,
              foot,
              walkable,
              annotatedGroundY,
              differenceWorldPx,
              differenceCssPx,
            });
          }
        }
        if (failures.length > 0) {
          const representative = failures[0];
          issues.push(
            `${viewport.id}/${areaId}/${sample.label}: `
            + `${failures.length}/${frameNames.length} idle/walk masks fail; representative `
            + `${representative.frameName} foot=`
            + `(${representative.foot.x.toFixed(1)},${representative.foot.y.toFixed(1)}), `
            + `walkable=${representative.walkable}, annotatedGroundY=`
            + `${representative.annotatedGroundY.toFixed(1)}, difference=`
            + `${representative.differenceWorldPx.toFixed(1)} authored/world px = `
            + `${representative.differenceCssPx.toFixed(2)} CSS px `
            + `(limit ${annotations.tolerances.groundLineCssPx} CSS px).`,
          );
        }
      }
    }
  }
  assertNoIssues(issues);
});

test('M1.5 branch triggers align to independently annotated road entrances and have visible directional exits', () => {
  const issues = [];
  for (const viewport of annotations.viewports) {
    const projection = canvasProjection(viewport);
    const toleratedWorldPx = annotations.tolerances.branchCenterCssPx / projection.scale;
    for (const areaId of M14_AREA_IDS) {
      const area = M14_AREA_DEFINITIONS[areaId];
      const areaAnnotation = annotations.areas[areaId];
      for (const { direction, exit } of implementationBranches(area)) {
        const visualBranch = areaAnnotation.branches[direction];
        if (!visualBranch) {
          issues.push(
            `${viewport.id}/${areaId}/${direction}: no independent background annotation exists.`,
          );
          continue;
        }
        if (!visualBranch.visualPathPresent) {
          issues.push(
            `${viewport.id}/${areaId}/${direction}: runtime has a ${direction} trigger, but the `
            + `background has no road/slope/stairs/exit `
            + `(${visualBranch.directionEvidence}).`,
          );
          continue;
        }
        const triggerCenter = (exit.activationRange.minX + exit.activationRange.maxX) / 2;
        const centerDifferenceWorldPx = Math.abs(
          triggerCenter - visualBranch.entranceCenterX,
        );
        const centerDifferenceCssPx = centerDifferenceWorldPx * projection.scale;
        if (centerDifferenceCssPx > annotations.tolerances.branchCenterCssPx) {
          issues.push(
            `${viewport.id}/${areaId}/${direction}: trigger center ${triggerCenter} is `
            + `${centerDifferenceWorldPx}px in authored/world space = `
            + `${centerDifferenceCssPx.toFixed(2)} CSS px from background entrance center `
            + `${visualBranch.entranceCenterX} `
            + `(limit ${annotations.tolerances.branchCenterCssPx} CSS px).`,
          );
        }
        if (
          visualBranch.entranceCenterX < exit.activationRange.minX
          || visualBranch.entranceCenterX > exit.activationRange.maxX
        ) {
          issues.push(
            `${viewport.id}/${areaId}/${direction}: guidance is not visible at the annotated `
            + `road entrance X=${visualBranch.entranceCenterX}; runtime range is `
            + `${exit.activationRange.minX}..${exit.activationRange.maxX}.`,
          );
        }
        const toleratedMin = visualBranch.entranceRange.minX - toleratedWorldPx;
        const toleratedMax = visualBranch.entranceRange.maxX + toleratedWorldPx;
        if (
          exit.activationRange.minX < toleratedMin
          || exit.activationRange.maxX > toleratedMax
        ) {
          issues.push(
            `${viewport.id}/${areaId}/${direction}: trigger `
            + `${exit.activationRange.minX}..${exit.activationRange.maxX} extends into unrelated `
            + `scenery beyond ${toleratedMin.toFixed(2)}..${toleratedMax.toFixed(2)} `
            + `(the ${annotations.tolerances.branchCenterCssPx} CSS px margin projected to `
            + `${toleratedWorldPx.toFixed(2)} authored/world px).`,
          );
        }
      }
    }
  }
  assertNoIssues(issues);
});

test('M1.5 arrow panel has zero player-mask intersection and at least 12 CSS px clearance in every viewport', () => {
  const issues = [];
  const testedStates = [];
  for (const viewport of annotations.viewports) {
    for (const areaId of M14_AREA_IDS) {
      const area = M14_AREA_DEFINITIONS[areaId];
      for (const { direction, exit } of implementationBranches(area)) {
        const panel = panelRectFromCss(globalCssPath, viewport, direction);
        const triggerPositions = [
          ['start', exit.activationRange.minX],
          ['center', (exit.activationRange.minX + exit.activationRange.maxX) / 2],
          ['end', exit.activationRange.maxX],
        ];
        for (const [positionLabel, playerX] of triggerPositions) {
          for (const [cameraLabel, velocityX] of [
            ['follow-before', -175],
            ['idle', 0],
            ['follow-after', 175],
          ]) {
            const cameraX = cameraScrollX(area, playerX, velocityX);
            for (const facing of ['left', 'right']) {
              const failures = [];
              const frameNames = Object.keys(atlasMasks).filter((name) => (
                name.startsWith(`idle-${facing}-`) || name.startsWith(`walk-${facing}-`)
              ));
              for (const frameName of frameNames) {
                const maskPixels = projectMaskToCssPixels({
                  mask: atlasMasks[frameName],
                  playerX,
                  playerY: area.groundY,
                  cameraX,
                  viewport,
                });
                const metrics = maskRectMetrics(maskPixels, panel);
                testedStates.push({
                  viewport: viewport.id,
                  areaId,
                  direction,
                  positionLabel,
                  cameraLabel,
                  facing,
                  frameName,
                });
                if (
                  metrics.intersectionPixels !== 0
                  || metrics.minimumDistance
                    < annotations.tolerances.playerPanelClearanceCssPx
                ) {
                  failures.push({ frameName, metrics });
                }
              }
              if (failures.length > 0) {
                const maximumIntersection = Math.max(...failures.map(
                  (failure) => failure.metrics.intersectionPixels,
                ));
                const minimumClearance = Math.min(...failures.map(
                  (failure) => failure.metrics.minimumDistance,
                ));
                issues.push(
                  `${viewport.id}/${areaId}/${direction}/${positionLabel}/${cameraLabel}/`
                  + `${facing}: ${failures.length}/${frameNames.length} frames fail, `
                  + `maxIntersection=${maximumIntersection} sampled opaque device pixels, `
                  + `minClearance=${minimumClearance.toFixed(2)} CSS px.`,
                );
              }
            }
          }
        }
      }
    }
  }
  assert.ok(testedStates.length > 0);
  assertNoIssues(issues, 24);
});

function validateFullScenarioState(state, viewport) {
  assert.deepEqual(state.viewport, { width: viewport.width, height: viewport.height });
  assert.equal(state.transitionCount, 5);
  assert.ok(state.hudSnapshotCount > 0);
  assert.deepEqual(state.pageErrors, []);
  assert.deepEqual(state.failedRequests, []);
  assert.equal(state.evidence.homeWalkRight.during.animation, 'walk-right');
  assert.equal(state.evidence.homeWalkLeft.during.animation, 'walk-left');
  assert.equal(state.evidence.homeWalkRight.idle.animation, 'idle-right');
  assert.equal(state.evidence.homeWalkLeft.idle.animation, 'idle-left');
  assert.equal(state.evidence.upperWalkRight.during.animation, 'walk-right');
  assert.equal(state.evidence.upperWalkLeft.during.animation, 'walk-left');
  assert.equal(state.evidence.focusLossStop, true);
  assert.deepEqual(Object.keys(state.evidence.phases), ['morning', 'day', 'evening', 'night']);
  for (const invariant of [
    'verticalInvariant',
    'cameraFollow',
    'cameraBoundsInvariant',
    'focusLossStop',
    'transitionLocked',
    'timePreserved',
    'mutePreserved',
    'idleReturned',
  ]) {
    assert.equal(state.invariants[invariant], true, `${viewport.id}/${invariant}`);
  }
  assert.deepEqual(
    state.invariants.areasVisited,
    ['home-street', 'life-road', 'upper-vending-lane'],
  );
  assert.equal(state.invariants.pageErrors, 0);
  assert.equal(state.invariants.failedRequests, 0);
}

test('M1.5 saved Browser Smoke artifacts prove the same full scenario at all three viewport sizes', {
  skip: !process.env.M15_VISUAL_SMOKE_ROOT,
}, () => {
  for (const viewport of annotations.viewports) {
    const statePath = path.join(
      process.env.M15_VISUAL_SMOKE_ROOT,
      `smoke-${viewport.width}x${viewport.height}`,
      'state.json',
    );
    validateFullScenarioState(
      JSON.parse(fs.readFileSync(statePath, 'utf8')),
      viewport,
    );
  }
});

function hudMatches(snapshot, expected) {
  if (!snapshot) return false;
  return Object.entries(expected).every(([key, value]) => {
    if (key === 'notTransitionState') return snapshot.transitionState !== value;
    if (key === 'animationPrefix') return String(snapshot.animation ?? '').startsWith(value);
    if (key === 'minX') return snapshot.playerX >= value;
    if (key === 'maxSpeed') return snapshot.speed <= value;
    if (key === 'minSpeed') return snapshot.speed >= value;
    if (key === 'minCamera') return snapshot.cameraScrollX >= value;
    return snapshot[key] === value;
  });
}

async function waitForHud(page, expected, timeout = 60_000) {
  await page.waitForFunction(
    (criteria) => {
      const snapshot = globalThis.__m15VisualContract?.last;
      if (!snapshot) return false;
      return Object.entries(criteria).every(([key, value]) => {
        if (key === 'notTransitionState') return snapshot.transitionState !== value;
        if (key === 'animationPrefix') return String(snapshot.animation ?? '').startsWith(value);
        if (key === 'minX') return snapshot.playerX >= value;
        if (key === 'maxSpeed') return snapshot.speed <= value;
        if (key === 'minSpeed') return snapshot.speed >= value;
        if (key === 'minCamera') return snapshot.cameraScrollX >= value;
        return snapshot[key] === value;
      });
    },
    expected,
    { timeout, polling: 'raf' },
  );
  const snapshot = await page.evaluate(() => globalThis.__m15VisualContract?.last ?? null);
  assert.ok(hudMatches(snapshot, expected));
  return snapshot;
}

async function walkAndReturnIdle(page, area, direction) {
  const key = direction === 'right' ? 'ArrowRight' : 'ArrowLeft';
  const before = await page.evaluate(() => globalThis.__m15VisualContract.last);
  await page.keyboard.down(key);
  let during;
  try {
    during = await waitForHud(page, {
      area,
      facing: direction,
      animation: `walk-${direction}`,
      minSpeed: 100,
    });
  } finally {
    await page.keyboard.up(key);
  }
  const idle = await waitForHud(page, {
    area,
    facing: direction,
    animation: `idle-${direction}`,
    maxSpeed: 0,
  });
  assert.ok(
    direction === 'right'
      ? during.playerX > before.playerX
      : during.playerX < before.playerX,
  );
  return { before, during, idle };
}

async function touchJoystickAndReturnIdle(page, cdpSession, area, direction) {
  assert.ok(cdpSession, 'A Chromium DevTools session is required for touch input.');
  const joystick = page.locator('.virtual-joystick');
  await joystick.waitFor({ state: 'visible' });
  const box = await joystick.boundingBox();
  assert.ok(box, 'The virtual joystick must have a measurable DOM box.');
  const offset = Math.min(50, box.width * 0.3);
  const point = {
    x: box.x + box.width / 2 + (direction === 'right' ? offset : -offset),
    y: box.y + box.height / 2,
  };
  const before = await page.evaluate(() => globalThis.__m15VisualContract.last);
  await cdpSession.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{
      id: 1,
      x: point.x,
      y: point.y,
      radiusX: 1,
      radiusY: 1,
      force: 1,
    }],
  });
  let during;
  try {
    during = await waitForHud(page, {
      area,
      inputSource: 'touch',
      facing: direction,
      animation: `walk-${direction}`,
      minSpeed: 100,
    });
  } finally {
    await cdpSession.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  }
  const idle = await waitForHud(page, {
    area,
    facing: direction,
    animation: `idle-${direction}`,
    maxSpeed: 0,
  });
  assert.ok(
    direction === 'right'
      ? during.playerX > before.playerX
      : during.playerX < before.playerX,
  );
  return {
    direction,
    method: 'Chromium CDP Input.dispatchTouchEvent on .virtual-joystick',
    beforePlayerX: before.playerX,
    duringPlayerX: during.playerX,
    duringInputSource: during.inputSource,
    duringAnimation: during.animation,
    idleAnimation: idle.animation,
  };
}

async function moveRightTo(page, area, minimumX) {
  await page.keyboard.down('ArrowRight');
  try {
    await waitForHud(page, {
      area,
      minX: minimumX,
      animation: 'walk-right',
    });
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  return waitForHud(page, {
    area,
    animation: 'idle-right',
    maxSpeed: 0,
  });
}

async function transitionWithHeldKey(page, key, targetArea) {
  const departure = await page.evaluate(() => globalThis.__m15VisualContract.last);
  await page.keyboard.down(key);
  let lockedStart;
  let lockedEnd;
  try {
    lockedStart = await waitForHud(page, {
      area: departure.area,
      notTransitionState: 'idle',
      inputLocked: true,
      maxSpeed: 0,
    });
    await page.waitForTimeout(80);
    lockedEnd = await page.evaluate(() => globalThis.__m15VisualContract.last);
  } finally {
    await page.keyboard.up(key);
  }
  assert.equal(lockedEnd.inputLocked, true);
  assert.equal(lockedEnd.playerX, lockedStart.playerX);
  return waitForHud(page, {
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    maxSpeed: 0,
    animationPrefix: 'idle-',
  });
}

async function transitionWithPanel(page, ariaLabel, targetArea) {
  const button = page.getByRole('button', { name: ariaLabel, exact: true });
  await button.waitFor({ state: 'visible' });
  await button.click();
  const locked = await waitForHud(page, {
    notTransitionState: 'idle',
    inputLocked: true,
    maxSpeed: 0,
  });
  await page.keyboard.press('ArrowRight');
  const afterPulse = await page.evaluate(() => globalThis.__m15VisualContract.last);
  assert.equal(afterPulse.playerX, locked.playerX);
  return waitForHud(page, {
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    maxSpeed: 0,
    animationPrefix: 'idle-',
  });
}

async function runFullLiveScenario(page, cdpSession = null) {
  const transitions = [];
  const touchJoystick = [];
  await page.getByRole('button', { name: '夏休みを始める', exact: true }).click();
  const initial = await waitForHud(page, {
    area: 'home-street',
    transitionState: 'idle',
    inputLocked: false,
    maxSpeed: 0,
  });
  assert.equal(await page.locator('canvas').count(), 1);

  const muteButton = page.getByRole('button', { name: '音をオフにする', exact: true });
  await muteButton.waitFor({ state: 'visible' });
  assert.equal(await muteButton.isDisabled(), false);
  await muteButton.click();
  await waitForHud(page, { audioMuted: true });

  const drawer = page.locator('details.dev-tool-drawer');
  await drawer.locator('summary').click();
  const stepTime = page.getByRole('button', { name: '＋15分', exact: true });
  for (let count = 0; count < 4; count += 1) await stepTime.click();
  const changedTime = await waitForHud(page, { timeMinutes: 420 });
  await drawer.locator('summary').click();

  if (cdpSession) {
    touchJoystick.push(
      await touchJoystickAndReturnIdle(
        page,
        cdpSession,
        'home-street',
        'right',
      ),
    );
    touchJoystick.push(
      await touchJoystickAndReturnIdle(
        page,
        cdpSession,
        'home-street',
        'left',
      ),
    );
  }

  const homeRight = await walkAndReturnIdle(page, 'home-street', 'right');
  const homeLeft = await walkAndReturnIdle(page, 'home-street', 'left');
  assert.ok(homeRight.idle.footstepCount >= homeRight.before.footstepCount);
  assert.ok(homeLeft.idle.footstepCount >= homeLeft.before.footstepCount);

  const homeEdge = await moveRightTo(page, 'home-street', 2210);
  assert.ok(homeEdge.cameraScrollX >= homeEdge.cameraMaxX - 4);
  transitions.push(await transitionWithHeldKey(page, 'ArrowRight', 'life-road'));
  transitions.push(await transitionWithHeldKey(page, 'ArrowLeft', 'home-street'));
  transitions.push(await transitionWithHeldKey(page, 'ArrowRight', 'life-road'));

  await moveRightTo(page, 'life-road', 1280);
  await waitForHud(page, {
    area: 'life-road',
    branchVisible: true,
    branchDirection: 'up',
  });
  transitions.push(await transitionWithPanel(page, '上のエリアへ移動', 'upper-vending-lane'));

  const upperRight = await walkAndReturnIdle(page, 'upper-vending-lane', 'right');
  const upperLeft = await walkAndReturnIdle(page, 'upper-vending-lane', 'left');
  const idleStart = upperLeft.idle;
  await page.waitForTimeout(400);
  const idleEnd = await waitForHud(page, {
    area: 'upper-vending-lane',
    animation: 'idle-left',
    maxSpeed: 0,
  });
  assert.equal(idleEnd.playerX, idleStart.playerX);
  assert.equal(idleEnd.footstepCount, idleStart.footstepCount);
  assert.ok(upperRight.during.playerX > upperRight.before.playerX);

  await waitForHud(page, {
    area: 'upper-vending-lane',
    branchVisible: true,
    branchDirection: 'down',
  });
  transitions.push(await transitionWithPanel(page, '下のエリアへ移動', 'life-road'));
  const preserved = await waitForHud(page, {
    area: 'life-road',
    timeMinutes: changedTime.timeMinutes,
    audioMuted: true,
  });
  assert.equal(preserved.timeMinutes, 420);

  await page.keyboard.down('ArrowRight');
  try {
    await waitForHud(page, {
      area: 'life-road',
      animation: 'walk-right',
      minSpeed: 100,
    });
    await page.evaluate(() => globalThis.dispatchEvent(new Event('blur')));
    const stopped = await waitForHud(page, {
      area: 'life-road',
      animation: 'idle-right',
      maxSpeed: 0,
    });
    await page.waitForTimeout(300);
    const stillStopped = await page.evaluate(() => globalThis.__m15VisualContract.last);
    assert.equal(stillStopped.playerX, stopped.playerX);
    assert.equal(stillStopped.speed, 0);
  } finally {
    await page.keyboard.up('ArrowRight');
  }

  assert.equal(transitions.length, 5);
  assert.deepEqual(
    [...new Set([initial.area, ...transitions.map((snapshot) => snapshot.area)])],
    ['home-street', 'life-road', 'upper-vending-lane'],
  );
  return {
    transitionCount: transitions.length,
    areasVisited: [
      ...new Set([initial.area, ...transitions.map((snapshot) => snapshot.area)]),
    ],
    keyboardWalkAndIdle: {
      home: ['right', 'left'],
      upper: ['right', 'left'],
    },
    touchJoystick,
    focusLossStop: true,
    transitionInputLock: true,
    preservedTimeMinutes: changedTime.timeMinutes,
    preservedAudioMuted: preserved.audioMuted,
  };
}

async function startLocalDistServer() {
  const distRoot = path.join(repositoryRoot, 'dist');
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.webp': 'image/webp',
  };
  const server = http.createServer((request, response) => {
    const requestPath = (request.url ?? '/').split('?')[0];
    const relativePath = requestPath === '/'
      ? 'index.html'
      : decodeURIComponent(requestPath).replace(/^\/+/, '');
    let filePath = path.resolve(distRoot, relativePath);
    if (!filePath.startsWith(`${distRoot}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distRoot, 'index.html');
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes[path.extname(filePath)] ?? 'application/octet-stream',
    });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('M1.5 live browser executes 5 transitions and all existing regression invariants in every viewport', {
  skip: !process.env.M15_VISUAL_BASE_URL,
  timeout: 300_000,
}, async (context) => {
  const localServer = process.env.M15_VISUAL_BASE_URL === 'local-dist'
    ? await startLocalDistServer()
    : null;
  const baseUrl = localServer?.baseUrl ?? process.env.M15_VISUAL_BASE_URL;
  const expectedCommit = process.env.M15_EXPECTED_COMMIT
    ?? '29223ee31fd4fc4fbca21a37b01fe89277279647';
  assert.match(expectedCommit, /^[a-f0-9]{40}$/);
  const { chromium } = loadM15Playwright({ repositoryRoot });
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  context.after(() => browser.close());
  if (localServer) context.after(() => localServer.close());

  const liveResultPath = process.env.M15_VISUAL_LIVE_RESULT_PATH
    ?? '/tmp/boku-m15-live-contract-result.json';
  const overallStartedAt = process.hrtime.bigint();
  const scenarioResults = [];
  for (const viewport of annotations.viewports) {
    await context.test(viewport.id, { timeout: 100_000 }, async () => {
      const scenarioStartedAt = process.hrtime.bigint();
      const browserContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        hasTouch: viewport.hasTouch,
        locale: 'ja-JP',
      });
      try {
        await browserContext.addInitScript(() => {
          const state = { last: null };
          Object.defineProperty(globalThis, '__m15VisualContract', {
            configurable: true,
            value: state,
          });
          globalThis.addEventListener('boku-no-jihanki:hud-snapshot', (event) => {
            state.last = { ...event.detail };
          });
        });
        const page = await browserContext.newPage();
        const pageErrors = [];
        const failedRequests = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('requestfailed', (request) => failedRequests.push(request.url()));
        const response = await page.goto(baseUrl, {
          waitUntil: 'networkidle',
          timeout: 60_000,
        });
        assert.ok(response && response.status() < 400);
        const buildBadge = (await page.locator('.build-badge').innerText()).trim();
        const buildMatch = /·\s+([a-f0-9]{7})$/i.exec(buildBadge);
        assert.ok(buildMatch, `Could not parse build commit from: ${buildBadge}`);
        const observedBuildCommit = buildMatch[1].toLowerCase();
        assert.equal(observedBuildCommit, expectedCommit.slice(0, 7));
        const emulation = await page.evaluate(() => ({
          devicePixelRatio: window.devicePixelRatio,
          maxTouchPoints: navigator.maxTouchPoints,
        }));
        assert.equal(emulation.devicePixelRatio, viewport.deviceScaleFactor);
        assert.equal(emulation.maxTouchPoints > 0, viewport.hasTouch);
        const cdpSession = viewport.hasTouch
          ? await browserContext.newCDPSession(page)
          : null;
        const scenario = await runFullLiveScenario(page, cdpSession);
        assert.equal(scenario.touchJoystick.length, viewport.hasTouch ? 2 : 0);
        if (viewport.hasTouch) {
          assert.deepEqual(
            scenario.touchJoystick.map((result) => result.direction),
            ['right', 'left'],
          );
          assert.ok(scenario.touchJoystick.every(
            (result) => result.duringInputSource === 'touch',
          ));
        }
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(failedRequests, []);
        if (viewport.emulationOnly) {
          assert.match(viewport.id, /(phone|iphone|emulation|equivalent)/i);
        }
        scenarioResults.push({
          id: viewport.id,
          result: 'PASS',
          durationMilliseconds: Number(
            process.hrtime.bigint() - scenarioStartedAt,
          ) / 1_000_000,
          requestedContext: {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: viewport.deviceScaleFactor,
            hasTouch: viewport.hasTouch,
          },
          measuredContext: emulation,
          expectedCommit,
          observedBuildCommit,
          buildBadge,
          pageErrors,
          failedRequests,
          scenario,
        });
      } finally {
        await browserContext.close();
      }
    });
  }
  const liveResult = {
    schemaVersion: 1,
    baselineCommit: expectedCommit,
    generatedAt: new Date().toISOString(),
    status: 'PASS',
    totalDurationMilliseconds: Number(
      process.hrtime.bigint() - overallStartedAt,
    ) / 1_000_000,
    scenarios: scenarioResults,
    emulationDisclaimer: 'The 844x390 and 932x430 runs are browser emulation only, not real-device verification.',
  };
  fs.mkdirSync(path.dirname(liveResultPath), { recursive: true });
  fs.writeFileSync(liveResultPath, `${JSON.stringify(liveResult, null, 2)}\n`);
});
