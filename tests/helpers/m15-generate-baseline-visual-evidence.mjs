import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { M14_AREA_DEFINITIONS } from '../../src/game/areas/m14AreaData.mjs';
import {
  cameraScrollX,
  canvasProjection,
  maskRectMetrics,
  panelRectFromCss,
  projectMaskToCssPixels,
  readAtlasMasks,
} from './m15-real-device-visual-math.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baselineCommit = '29223ee31fd4fc4fbca21a37b01fe89277279647';
const smokeRoot = process.env.M15_BASELINE_SMOKE_ROOT ?? '/tmp/boku-m15-baseline';
const dpr3CaptureRoot = process.env.M15_DPR3_CAPTURE_ROOT ?? '/tmp/boku-m15-dpr3-captures';
const outputRoot = path.join(repositoryRoot, 'docs/evidence');
const annotationPath = path.join(
  repositoryRoot,
  'tests/fixtures/m15-real-device-visual-annotations.json',
);
const manualAuditPath = path.join(
  repositoryRoot,
  'tests/fixtures/m15-screenshot-manual-audit.json',
);
const liveResultPath = process.env.M15_VISUAL_LIVE_RESULT_PATH
  ?? '/tmp/boku-m15-live-contract-result.json';
const annotations = JSON.parse(fs.readFileSync(annotationPath, 'utf8'));
const manualAudit = JSON.parse(fs.readFileSync(manualAuditPath, 'utf8'));
const liveContractResult = JSON.parse(fs.readFileSync(liveResultPath, 'utf8'));
const dpr3CaptureMetadataPath = path.join(dpr3CaptureRoot, 'capture-metadata.json');
const dpr3CaptureMetadata = JSON.parse(
  fs.readFileSync(dpr3CaptureMetadataPath, 'utf8'),
);
const masks = readAtlasMasks(
  path.join(repositoryRoot, annotations.playerReview.asset),
  path.join(repositoryRoot, 'public/assets/images/m14/player-atlas.json'),
  annotations.alphaThreshold,
);
const cssPath = path.join(repositoryRoot, 'src/styles/global.css');
const screenshotNames = [
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
const manualAuditFields = Object.freeze([
  'completion',
  'grounding',
  'roadArrow',
  'playerOcclusion',
  'uiCollision',
]);
const branchContracts = Object.freeze([
  { areaId: 'life-road', direction: 'up', exitKey: 'upExit' },
  { areaId: 'upper-vending-lane', direction: 'down', exitKey: 'downExit' },
]);
const cameraStates = Object.freeze([
  { id: 'follow-before', velocityX: -175 },
  { id: 'idle', velocityX: 0 },
  { id: 'follow-after', velocityX: 175 },
]);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function viewportKey(viewport) {
  return `${viewport.width}x${viewport.height}`;
}

function manualAuditKey(viewport, filename) {
  return `${viewportKey(viewport)}/${filename}`;
}

function validateManualAuditFixture() {
  if (manualAudit.schemaVersion !== 1) {
    throw new Error(`Unsupported manual screenshot audit schema: ${manualAudit.schemaVersion}.`);
  }
  if (
    manualAudit.method
    !== 'manual semantic inspection bound to exact screenshot SHA-256'
  ) {
    throw new Error(`Unexpected manual screenshot audit method: ${manualAudit.method}.`);
  }
  const expectedKeys = new Set(
    annotations.viewports.flatMap((viewport) => (
      screenshotNames.map((filename) => manualAuditKey(viewport, filename))
    )),
  );
  const auditByKey = new Map();
  for (const audit of manualAudit.audits ?? []) {
    const key = `${audit.viewport}/${audit.file}`;
    if (auditByKey.has(key)) {
      throw new Error(`Duplicate manual screenshot audit entry: ${key}`);
    }
    auditByKey.set(key, audit);
    for (const field of manualAuditFields) {
      const reasonCode = audit[field];
      const catalogEntry = manualAudit.reasonCatalog?.[reasonCode];
      if (!catalogEntry || !['YES', 'NO'].includes(catalogEntry.value)) {
        throw new Error(
          `Manual screenshot audit ${key} has invalid ${field} reason code ${reasonCode}.`,
        );
      }
    }
  }
  const missing = [...expectedKeys].filter((key) => !auditByKey.has(key));
  const extra = [...auditByKey.keys()].filter((key) => !expectedKeys.has(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Manual screenshot audit coverage mismatch; missing=${missing.join(',')}; extra=${extra.join(',')}.`,
    );
  }
  return auditByKey;
}

const manualAuditByKey = validateManualAuditFixture();

function validateLiveContractResult() {
  if (liveContractResult.schemaVersion !== 1) {
    throw new Error(`Unsupported live contract result schema: ${liveContractResult.schemaVersion}.`);
  }
  if (liveContractResult.baselineCommit !== baselineCommit) {
    throw new Error(
      `Live result baseline mismatch: expected ${baselineCommit}, `
      + `got ${liveContractResult.baselineCommit}.`,
    );
  }
  if (liveContractResult.status !== 'PASS') {
    throw new Error(`Live contract result is not PASS: ${liveContractResult.status}.`);
  }
  if (liveContractResult.scenarios?.length !== annotations.viewports.length) {
    throw new Error(
      `Live result must contain ${annotations.viewports.length} exact viewport scenarios.`,
    );
  }
  const scenariosById = new Map(
    liveContractResult.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  if (scenariosById.size !== annotations.viewports.length) {
    throw new Error('Live result contains duplicate viewport scenario IDs.');
  }
  for (const viewport of annotations.viewports) {
    const scenario = scenariosById.get(viewport.id);
    if (!scenario || scenario.result !== 'PASS') {
      throw new Error(`Live viewport scenario is absent or not PASS: ${viewport.id}.`);
    }
    for (const field of ['width', 'height', 'deviceScaleFactor', 'hasTouch']) {
      if (scenario.requestedContext?.[field] !== viewport[field]) {
        throw new Error(
          `Live viewport ${viewport.id} requested ${field} mismatch: `
          + `${scenario.requestedContext?.[field]} !== ${viewport[field]}.`,
        );
      }
    }
    if (
      scenario.measuredContext?.devicePixelRatio !== viewport.deviceScaleFactor
      || (scenario.measuredContext?.maxTouchPoints > 0) !== viewport.hasTouch
    ) {
      throw new Error(`Live viewport ${viewport.id} measured emulation mismatch.`);
    }
    if (
      scenario.pageErrors?.length !== 0
      || scenario.failedRequests?.length !== 0
    ) {
      throw new Error(`Live viewport ${viewport.id} has browser errors or failed requests.`);
    }
    const touchEvidence = scenario.scenario?.touchJoystick ?? [];
    if (viewport.hasTouch) {
      const directions = touchEvidence.map((entry) => entry.direction).join(',');
      if (
        directions !== 'right,left'
        || touchEvidence.some((entry) => entry.duringInputSource !== 'touch')
      ) {
        throw new Error(`Live viewport ${viewport.id} lacks touch joystick evidence.`);
      }
    } else if (touchEvidence.length !== 0) {
      throw new Error(`Non-touch viewport ${viewport.id} has unexpected touch evidence.`);
    }
  }
}

validateLiveContractResult();

function screenshotAssessment(viewport, filename) {
  const key = manualAuditKey(viewport, filename);
  const audit = manualAuditByKey.get(key);
  const screenshotPath = path.join(
    smokeRoot,
    `smoke-${viewportKey(viewport)}`,
    filename,
  );
  const actualSha256 = sha256(screenshotPath);
  if (actualSha256 !== audit.sha256) {
    throw new Error(
      `Manual audit SHA mismatch for ${key}: fixture=${audit.sha256}, actual=${actualSha256}.`,
    );
  }
  const fields = Object.fromEntries(manualAuditFields.map((field) => {
    const reasonCode = audit[field];
    const catalogEntry = manualAudit.reasonCatalog[reasonCode];
    return [
      field,
      {
        value: catalogEntry.value,
        reason: catalogEntry.reason,
        manualReasonCode: reasonCode,
      },
    ];
  }));
  return {
    file: filename,
    sha256: actualSha256,
    auditMethod: manualAudit.method,
    ...fields,
    screenResult: Object.values(fields).every((field) => field.value === 'YES')
      ? 'PASS'
      : 'FAIL',
  };
}

function matchingFacingMasks(facing) {
  return Object.entries(masks).filter(([frameName]) => (
    frameName.includes(`-${facing}-`)
  ));
}

function panelMeasurement({
  viewport,
  areaId,
  direction,
  playerX,
  playerY,
  cameraX,
  facing,
  panelRect,
  panelRectSource,
  positionId,
  cameraStateId,
  cameraVelocityX,
}) {
  const perFrame = matchingFacingMasks(facing).map(([frameName, mask]) => {
    const maskPixels = projectMaskToCssPixels({
      mask,
      playerX,
      playerY,
      cameraX,
      viewport,
    });
    return {
      frameName,
      opaqueDevicePixels: maskPixels.length,
      ...maskRectMetrics(maskPixels, panelRect),
    };
  });
  const failingFrames = perFrame.filter((frame) => (
    frame.intersectionPixels > 0
    || frame.minimumDistance < annotations.tolerances.playerPanelClearanceCssPx
  ));
  return {
    areaId,
    direction,
    positionId,
    cameraStateId,
    cameraVelocityX,
    facing,
    playerX,
    playerY,
    cameraX,
    panelRectCssPx: panelRect,
    panelRectSource,
    maskSource: 'atlas pixels with alpha > 0',
    maskProjection: 'full projected source-pixel footprint rasterized to device pixels',
    distanceBasis: 'device-pixel center converted to CSS px',
    framesMeasured: perFrame.length,
    framesFailing: failingFrames.length,
    maximumOpaqueDevicePixelIntersection: Math.max(
      ...perFrame.map((frame) => frame.intersectionPixels),
    ),
    minimumClearanceCssPx: Math.min(...perFrame.map((frame) => frame.minimumDistance)),
    intersectionToleranceDevicePixels: 0,
    clearanceToleranceCssPx: annotations.tolerances.playerPanelClearanceCssPx,
    result: failingFrames.length === 0 ? 'PASS' : 'FAIL',
    frameMetrics: perFrame,
  };
}

function analyticalPanelStateGroups(viewport) {
  const groups = [];
  for (const contract of branchContracts) {
    const area = M14_AREA_DEFINITIONS[contract.areaId];
    const activationRange = area[contract.exitKey].activationRange;
    const positions = [
      { id: 'start', playerX: activationRange.minX },
      {
        id: 'center',
        playerX: (activationRange.minX + activationRange.maxX) / 2,
      },
      { id: 'end', playerX: activationRange.maxX },
    ];
    const panelRect = panelRectFromCss(cssPath, viewport, contract.direction);
    for (const position of positions) {
      for (const cameraState of cameraStates) {
        const cameraX = cameraScrollX(
          area,
          position.playerX,
          cameraState.velocityX,
        );
        for (const facing of ['left', 'right']) {
          groups.push(panelMeasurement({
            viewport,
            areaId: contract.areaId,
            direction: contract.direction,
            playerX: position.playerX,
            playerY: area.groundY,
            cameraX,
            facing,
            panelRect,
            panelRectSource: 'parsed CSS estimate (not a DOM measurement)',
            positionId: position.id,
            cameraStateId: cameraState.id,
            cameraVelocityX: cameraState.velocityX,
          }));
        }
      }
    }
  }
  return groups;
}

function representativeDomPanelMeasurements() {
  return ['life', 'upper'].map((captureId) => {
    const capture = dpr3CaptureMetadata.captures[captureId];
    if (!capture.panelRectCssPx) {
      throw new Error(`DPR3 representative capture ${captureId} has no DOM panel rectangle.`);
    }
    return {
      captureId,
      sourceCaptureSha256: capture.sha256,
      measuredContext: dpr3CaptureMetadata.measuredEmulation,
      ...panelMeasurement({
        viewport: dpr3CaptureMetadata.viewport,
        areaId: capture.hud.area,
        direction: capture.hud.branchDirection,
        playerX: capture.hud.playerX,
        playerY: capture.hud.playerY,
        cameraX: capture.hud.cameraScrollX,
        facing: capture.hud.facing,
        panelRect: capture.panelRectCssPx,
        panelRectSource: 'Playwright locator.boundingBox() DOM measurement',
        positionId: 'captured',
        cameraStateId: 'captured',
        cameraVelocityX: null,
      }),
    };
  });
}

function runConvert(argumentsList) {
  const result = spawnSync('convert', argumentsList, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      `ImageMagick convert failed: ${result.error?.message ?? result.stderr ?? result.status}`,
    );
  }
}

function generateAnnotatedScreenshots() {
  const captureViewport = dpr3CaptureMetadata.viewport;
  const projectionScale = Math.min(
    captureViewport.width / 1280,
    captureViewport.height / 720,
  );
  const projectionOffsetX = (captureViewport.width - 1280 * projectionScale) / 2;
  const lifeCameraX = dpr3CaptureMetadata.captures.life.hud.cameraScrollX;
  const screenX = (worldX) => Math.round(
    projectionOffsetX + (worldX - lifeCameraX) * projectionScale,
  );
  const lifePanel = dpr3CaptureMetadata.captures.life.panelRectCssPx;
  const upperPanel = dpr3CaptureMetadata.captures.upper.panelRectCssPx;
  runConvert([
    path.join(dpr3CaptureRoot, dpr3CaptureMetadata.captures.home.file),
    '-fill', '#27d17c38',
    '-stroke', '#27d17caa',
    '-strokewidth', '2',
    '-draw', 'rectangle 84,336 848,372',
    '-stroke', '#ff453a',
    '-strokewidth', '3',
    '-draw', 'line 84,314 848,314',
    '-stroke', '#20e38a',
    '-draw', 'line 84,352 848,352',
    '-fill', 'white',
    '-stroke', '#111111',
    '-strokewidth', '1',
    '-undercolor', '#111111cc',
    '-pointsize', '17',
    '-annotate', '+92+307', 'Runtime opaque-foot Y=525',
    '-annotate', '+92+350', 'Independent ground Y=590',
    path.join(outputRoot, 'M1_5_BASELINE_HOME_GROUND_ANNOTATED.png'),
  ]);

  runConvert([
    path.join(dpr3CaptureRoot, dpr3CaptureMetadata.captures.life.file),
    '-fill', '#20e38a22',
    '-stroke', '#20e38acc',
    '-strokewidth', '2',
    '-draw', `rectangle ${screenX(990)},72 ${screenX(1310)},318`,
    '-fill', '#ff453a22',
    '-stroke', '#ff453acc',
    '-draw', `rectangle ${screenX(1220)},72 ${screenX(1480)},318`,
    '-stroke', '#20e38a',
    '-strokewidth', '3',
    '-draw', `line ${screenX(1150)},72 ${screenX(1150)},318`,
    '-stroke', '#ff453a',
    '-draw',
    `line ${screenX(1350)},72 ${screenX(1350)},318 rectangle `
    + `${Math.floor(lifePanel.x)},${Math.floor(lifePanel.y)} `
    + `${Math.ceil(lifePanel.x + lifePanel.width)},${Math.ceil(lifePanel.y + lifePanel.height)}`,
    '-fill', 'white',
    '-stroke', '#111111',
    '-strokewidth', '1',
    '-undercolor', '#111111dd',
    '-pointsize', '16',
    '-annotate', '+92+82', 'GREEN road center X=1150',
    '-annotate', '+500+82', 'RED trigger center X=1350',
    '-annotate', '+370+414', 'Panel intersects player mask',
    path.join(outputRoot, 'M1_5_BASELINE_LIFE_BRANCH_ANNOTATED.png'),
  ]);

  runConvert([
    path.join(dpr3CaptureRoot, dpr3CaptureMetadata.captures.upper.file),
    '-fill', 'none',
    '-stroke', '#ff453a',
    '-strokewidth', '4',
    '-draw',
    `line 84,367 848,367 rectangle ${Math.floor(upperPanel.x)},`
    + `${Math.floor(upperPanel.y)} ${Math.ceil(upperPanel.x + upperPanel.width)},`
    + `${Math.ceil(upperPanel.y + upperPanel.height)}`,
    '-draw', 'line 425,345 507,405 line 507,345 425,405',
    '-fill', 'white',
    '-stroke', '#111111',
    '-strokewidth', '1',
    '-undercolor', '#111111dd',
    '-pointsize', '17',
    '-annotate', '+92+85', 'DOWN trigger exists',
    '-annotate', '+92+108', 'but background has NO downward exit',
    '-annotate', '+92+389', 'Continuous retaining wall',
    path.join(outputRoot, 'M1_5_BASELINE_UPPER_EXIT_ANNOTATED.png'),
  ]);
}

function viewportProjectionRecords(logicalDifference, toleranceCssPx) {
  return Object.fromEntries(annotations.viewports.map((viewport) => {
    const projection = canvasProjection(viewport);
    const differenceCssPx = logicalDifference * projection.scale;
    return [
      viewport.id,
      {
        viewportCssPx: {
          width: viewport.width,
          height: viewport.height,
        },
        deviceScaleFactor: viewport.deviceScaleFactor,
        cssPxPerLogicalPx: projection.scale,
        differenceCssPx,
        toleranceCssPx,
        result: differenceCssPx <= toleranceCssPx ? 'PASS' : 'FAIL',
      },
    ];
  }));
}

function groundingMeasurements() {
  return Object.fromEntries(Object.entries(annotations.areas).map((
    [areaId, independentArea],
  ) => {
    const runtimeArea = M14_AREA_DEFINITIONS[areaId];
    const independentGroundLogicalY = independentArea.groundLine[0].y;
    const differenceLogicalPx = Math.abs(
      runtimeArea.groundY - independentGroundLogicalY,
    );
    const byViewport = viewportProjectionRecords(
      differenceLogicalPx,
      annotations.tolerances.groundLineCssPx,
    );
    return [
      areaId,
      {
        units: {
          authoredCoordinates: 'logical/background world px',
          projectedDifference: 'CSS px',
          tolerance: 'CSS px',
        },
        runtimeOpaqueFootBottomLogicalY: runtimeArea.groundY,
        independentGroundLogicalY,
        differenceLogicalPx,
        toleranceCssPx: annotations.tolerances.groundLineCssPx,
        byViewport,
        result: Object.values(byViewport).every((record) => record.result === 'PASS')
          ? 'PASS'
          : 'FAIL',
      },
    ];
  }));
}

function branchMeasurements() {
  const lifeRuntime = M14_AREA_DEFINITIONS['life-road'].upExit;
  const lifeVisual = annotations.areas['life-road'].branches.up;
  const triggerCenterLogicalX = (
    lifeRuntime.activationRange.minX + lifeRuntime.activationRange.maxX
  ) / 2;
  const differenceLogicalPx = Math.abs(
    triggerCenterLogicalX - lifeVisual.entranceCenterX,
  );
  const lifeByViewport = viewportProjectionRecords(
    differenceLogicalPx,
    annotations.tolerances.branchCenterCssPx,
  );
  const upperRuntime = M14_AREA_DEFINITIONS['upper-vending-lane'].downExit;
  const upperVisual = annotations.areas['upper-vending-lane'].branches.down;
  const upperByViewport = Object.fromEntries(annotations.viewports.map((viewport) => {
    const projection = canvasProjection(viewport);
    return [
      viewport.id,
      {
        viewportCssPx: {
          width: viewport.width,
          height: viewport.height,
        },
        deviceScaleFactor: viewport.deviceScaleFactor,
        cssPxPerLogicalPx: projection.scale,
        visualPathPresent: upperVisual.visualPathPresent,
        result: upperVisual.visualPathPresent ? 'PASS' : 'FAIL',
      },
    ];
  }));
  return {
    'life-road/up': {
      units: {
        authoredCoordinates: 'logical/background world px',
        projectedDifference: 'CSS px',
        tolerance: 'CSS px',
      },
      visualEntranceCenterLogicalX: lifeVisual.entranceCenterX,
      runtimeTriggerCenterLogicalX: triggerCenterLogicalX,
      differenceLogicalPx,
      toleranceCssPx: annotations.tolerances.branchCenterCssPx,
      entranceCenterInsideRuntimeTrigger: (
        lifeVisual.entranceCenterX >= lifeRuntime.activationRange.minX
        && lifeVisual.entranceCenterX <= lifeRuntime.activationRange.maxX
      ),
      byViewport: lifeByViewport,
      result: Object.values(lifeByViewport).every((record) => record.result === 'PASS')
        ? 'PASS'
        : 'FAIL',
    },
    'upper-vending-lane/down': {
      units: {
        authoredCoordinates: 'logical/background world px',
        projectedDifference: 'CSS px',
      },
      runtimeTriggerRangeLogicalX: upperRuntime.activationRange,
      visualPathPresent: upperVisual.visualPathPresent,
      evidence: upperVisual.directionEvidence,
      byViewport: upperByViewport,
      result: 'FAIL',
    },
  };
}

fs.mkdirSync(outputRoot, { recursive: true });
generateAnnotatedScreenshots();

const viewportRecords = annotations.viewports.map((viewport) => {
  const smokeDir = path.join(
    smokeRoot,
    `smoke-${viewportKey(viewport)}`,
  );
  const state = JSON.parse(fs.readFileSync(path.join(smokeDir, 'state.json'), 'utf8'));
  return {
    ...viewport,
    savedSmokeArtifactDeviceScaleFactor: 1,
    wording: viewport.emulationOnly
      ? 'viewport/touch emulation (not a real-device result); the saved Browser Smoke screenshots were captured at DPR1, while the separate live contract run verified the required DPR shown in deviceScaleFactor'
      : 'desktop browser',
    smokeStateSha256: sha256(path.join(smokeDir, 'state.json')),
    runtimeLogSha256: sha256(path.join(smokeDir, 'runtime.log')),
    invariantSummary: state.invariants,
    analyticalPanelStateGroups: analyticalPanelStateGroups(viewport),
    screenshots: screenshotNames.map((filename) => (
      screenshotAssessment(viewport, filename)
    )),
  };
});

const evidence = {
  schemaVersion: 1,
  baselineCommit,
  generatedAt: new Date().toISOString(),
  auditSemantics: {
    completion: 'YES only when a visible gameplay character has final-quality Product Owner approval. A title/loading image with no testable character is NO, not N/A.',
    grounding: 'YES only when visible opaque-foot bottom-center is in the independent walkable polygon and within 6 CSS px of the independent ground line. No visible feet is NO, not N/A.',
    roadArrow: 'YES when a visible direction panel aligns with a visible road/exit, or when no direction panel is expected and none is shown.',
    playerOcclusion: 'YES when player opaque mask and UI masks do not intersect and clearance is at least 12 CSS px. Deliberate title/loading absence is not accidental occlusion.',
    uiCollision: 'YES when UI components do not intersect one another. Player/UI overlap is scored only under playerOcclusion.',
    screenResult: 'PASS only when all five fields are YES.',
  },
  independentAnnotationsSha256: sha256(annotationPath),
  manualScreenshotAudit: {
    fixturePath: 'tests/fixtures/m15-screenshot-manual-audit.json',
    fixtureSha256: sha256(manualAuditPath),
    method: manualAudit.method,
    expectedScreenshots: annotations.viewports.length * screenshotNames.length,
    auditedScreenshots: manualAudit.audits.length,
    exactScreenshotSha256Validation: 'PASS',
  },
  representativeDpr3Capture: {
    metadataSha256: sha256(dpr3CaptureMetadataPath),
    captureMethod: dpr3CaptureMetadata.captureMethod,
    requestedContext: dpr3CaptureMetadata.viewport,
    measuredContext: dpr3CaptureMetadata.measuredEmulation,
    pageErrors: dpr3CaptureMetadata.pageErrors,
    failedRequests: dpr3CaptureMetadata.failedRequests,
    disclaimer: dpr3CaptureMetadata.disclaimer,
    rawCaptures: dpr3CaptureMetadata.captures,
    domPanelMeasurements: representativeDomPanelMeasurements(),
  },
  liveContractVerification: {
    resultJsonPath: liveResultPath,
    resultJsonSha256: sha256(liveResultPath),
    content: liveContractResult,
  },
  groundingMeasurements: groundingMeasurements(),
  branchMeasurements: branchMeasurements(),
  screenshotSummary: {
    total: viewportRecords.reduce((sum, viewport) => sum + viewport.screenshots.length, 0),
    pass: viewportRecords.reduce(
      (sum, viewport) => sum + viewport.screenshots.filter(
        (screenshot) => screenshot.screenResult === 'PASS',
      ).length,
      0,
    ),
    fail: viewportRecords.reduce(
      (sum, viewport) => sum + viewport.screenshots.filter(
        (screenshot) => screenshot.screenResult === 'FAIL',
      ).length,
      0,
    ),
  },
  viewports: viewportRecords,
  representativeAnnotatedImages: [
    {
      path: 'docs/evidence/M1_5_BASELINE_HOME_GROUND_ANNOTATED.png',
      sha256: sha256(path.join(
        outputRoot,
        'M1_5_BASELINE_HOME_GROUND_ANNOTATED.png',
      )),
      sourceCaptureSha256: dpr3CaptureMetadata.captures.home.sha256,
    },
    {
      path: 'docs/evidence/M1_5_BASELINE_LIFE_BRANCH_ANNOTATED.png',
      sha256: sha256(path.join(
        outputRoot,
        'M1_5_BASELINE_LIFE_BRANCH_ANNOTATED.png',
      )),
      sourceCaptureSha256: dpr3CaptureMetadata.captures.life.sha256,
    },
    {
      path: 'docs/evidence/M1_5_BASELINE_UPPER_EXIT_ANNOTATED.png',
      sha256: sha256(path.join(
        outputRoot,
        'M1_5_BASELINE_UPPER_EXIT_ANNOTATED.png',
      )),
      sourceCaptureSha256: dpr3CaptureMetadata.captures.upper.sha256,
    },
  ],
};

fs.writeFileSync(
  path.join(outputRoot, 'M1_5_BASELINE_VISUAL_MEASUREMENTS.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
