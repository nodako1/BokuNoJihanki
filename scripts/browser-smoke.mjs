import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  M15_AREA_IDS,
  M15_GEOMETRY_FIXTURE,
  M15_TIME_PHASES,
  getM15GeometryArea,
} from '../src/game/areas/m15GeometryFixture.mjs';
import {
  AREA_PANEL_MIN_PLAYER_GAP,
  AREA_PANEL_MIN_TOUCH_TARGET,
  areaPanelIntersectionArea,
  areaPanelRectDistance,
  createAreaPanelRect,
} from '../src/ui/areaPanelPlacement.mjs';

function positiveIntegerFromEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return value;
}

function positiveNumberFromEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }
  return value;
}

function booleanFromEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(rawValue)) return true;
  if (/^(0|false|no|off)$/i.test(rawValue)) return false;
  throw new RangeError(`${name} must be true or false.`);
}

function safeFilename(value) {
  return value.replace(/[^a-z0-9_.-]+/gi, '-');
}

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const expectedCommit = (process.env.EXPECTED_COMMIT ?? '').trim();
if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) {
  throw new Error('EXPECTED_COMMIT must be a complete 40-character Git SHA.');
}
const parsedBaseUrl = new URL(baseUrl);
const isVercelPreviewTarget =
  parsedBaseUrl.protocol === 'https:'
  && parsedBaseUrl.hostname.endsWith('.vercel.app')
  && parsedBaseUrl.hostname !== 'boku-no-jihanki.vercel.app';
const vercelAutomationBypassSecret = (
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? ''
).trim();
const browserExecutablePath =
  process.env.BROWSER_EXECUTABLE_PATH?.trim() || undefined;
const configuredOutputDir =
  process.env.BROWSER_ARTIFACT_DIR ?? 'diagnostics/browser-smoke';
const productionWaitMs = positiveIntegerFromEnv(
  'PRODUCTION_WAIT_MS',
  480_000,
);
const viewport = Object.freeze({
  width: positiveIntegerFromEnv('BROWSER_VIEWPORT_WIDTH', 1280),
  height: positiveIntegerFromEnv('BROWSER_VIEWPORT_HEIGHT', 720),
});
const deviceScaleFactor = positiveNumberFromEnv(
  'BROWSER_DEVICE_SCALE_FACTOR',
  1,
);
const touchEnabled = booleanFromEnv('BROWSER_TOUCH', false);
const requestedTraceEnabled = booleanFromEnv('BROWSER_TRACE', true);
let traceEnabled = requestedTraceEnabled;
const browserHeadless = booleanFromEnv('BROWSER_HEADLESS', true);
const ignoredPlaywrightBackgroundingArgs = Object.freeze([
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
]);
const browserLifecycleLaunch = Object.freeze({
  ignoredPlaywrightDefaultArgs: Object.freeze([
    ...ignoredPlaywrightBackgroundingArgs,
  ]),
  reason:
    'Preserve native Chromium hidden/visible and background lifecycle behavior.',
});
const hostEnvironment = Object.freeze({
  runnerOsImage: (process.env.M15_RUNNER_OS_IMAGE ?? '').trim(),
  platform: process.platform,
  architecture: process.arch,
});
const fontEnvironment = Object.freeze({
  japaneseFontMatch: (process.env.M15_JAPANESE_FONT_MATCH ?? '').trim(),
  japaneseFontFile: (process.env.M15_JAPANESE_FONT_FILE ?? '').trim(),
  japaneseFontPackageVersion: (
    process.env.M15_JAPANESE_FONT_PACKAGE_VERSION ?? ''
  ).trim(),
  japaneseFontSha256: (
    process.env.M15_JAPANESE_FONT_SHA256 ?? ''
  ).trim(),
});
if (hostEnvironment.runnerOsImage !== 'ubuntu-24.04') {
  throw new Error(
    'M15_RUNNER_OS_IMAGE must identify the pinned ubuntu-24.04 image.',
  );
}
if (fontEnvironment.japaneseFontMatch !== 'Noto Sans CJK JP') {
  throw new Error(
    'M15_JAPANESE_FONT_MATCH must resolve to Noto Sans CJK JP.',
  );
}
if (!path.isAbsolute(fontEnvironment.japaneseFontFile)) {
  throw new Error('M15_JAPANESE_FONT_FILE must be an absolute path.');
}
if (!fontEnvironment.japaneseFontPackageVersion) {
  throw new Error('M15_JAPANESE_FONT_PACKAGE_VERSION is required.');
}
if (!/^[0-9a-f]{64}$/.test(fontEnvironment.japaneseFontSha256)) {
  throw new Error('M15_JAPANESE_FONT_SHA256 must be a complete SHA-256.');
}
fs.mkdirSync(configuredOutputDir, { recursive: true });
const outputDir = fs.mkdtempSync(
  path.join(configuredOutputDir, 'm15-run-'),
);

const PHASE_TARGETS = Object.freeze([
  { phase: 'morning', minutes: 360, increments: 0 },
  { phase: 'day', minutes: 720, increments: 24 },
  { phase: 'evening', minutes: 990, increments: 18 },
  { phase: 'night', minutes: 1_200, increments: 14 },
]);
const PANEL_DIRECTION_AREAS = Object.freeze({
  up: 'life-road',
  down: 'upper-vending-lane',
});
const PANEL_LABELS = Object.freeze({
  up: '上のエリアへ移動',
  down: '下のエリアへ移動',
});
const PANEL_OBSTACLE_SELECTORS = Object.freeze([
  '.game-date-chip',
  '.game-actions',
  '.developer-hud',
  '.dev-control-panel',
  '.virtual-joystick',
  '.control-hint',
  '.build-badge',
  '[data-area-panel-obstacle]',
]);
const POSITION_TOLERANCE_WORLD_PX = 4;
const PANEL_POSITION_TOLERANCE_WORLD_PX = 4;
const PANEL_TRIGGER_INSET_WORLD_PX = 8;
const HORIZONTAL_EDGE_APPROACH_MARGIN_WORLD_PX = 160;

const records = [];
const pageErrors = [];
const failedRequests = [];
const requestedUrls = new Set();
const cdpLifecycleEvents = [];
const transitionChecks = [];
const evidence = {
  areaPositions: {},
  debugGeometry: {},
  phaseMatrix: {},
  panelMatrix: [],
  spawns: [],
  transitions: [],
  audio: {},
  lifecycle: {},
};
let browser;
let browserCdpSession;
let context;
let page;
let cdpSession;
let inputController;
let collectRuntimeFailures = false;
let observedCommit = '';
let failure;
let tracingStarted = false;
let previewAccess = {
  target: isVercelPreviewTarget,
  protectionDetected: false,
  bypassConfigured: false,
  bypassCookieStored: false,
  preflightStatus: null,
};
let statePayload = {
  baseUrl,
  expectedCommit,
  viewport,
  deviceScaleFactor,
  touchEnabled,
  traceEnabled,
  browserHeadless,
  browserLifecycleLaunch,
  hostEnvironment,
  fontEnvironment,
  outputDir,
  previewAccess,
};

const record = (kind, value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  records.push(`[${kind}] ${text}`);
  console.log(`[${kind}] ${text}`);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fileSha256(filename) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filename));
  return hash.digest('hex');
}

function normalizeRect(rect) {
  return createAreaPanelRect(rect.left, rect.top, rect.width, rect.height);
}

function cyclicOffsetDelta(before, after, duration) {
  return ((after - before) % duration + duration) % duration;
}

function isVercelAuthenticationUrl(value) {
  try {
    const url = new URL(value, baseUrl);
    return (
      (url.hostname === 'vercel.com' || url.hostname.endsWith('.vercel.com'))
      && (
        url.pathname.startsWith('/sso-api')
        || url.pathname.startsWith('/login')
      )
    );
  } catch {
    return false;
  }
}

async function prepareVercelPreviewAccess() {
  if (!isVercelPreviewTarget) return previewAccess;

  const publicProbe = await context.request.get(baseUrl, {
    failOnStatusCode: false,
    maxRedirects: 0,
    timeout: 30_000,
  });
  const publicStatus = publicProbe.status();
  const publicLocation = publicProbe.headers().location ?? '';
  if (publicStatus >= 200 && publicStatus < 300) {
    previewAccess = {
      ...previewAccess,
      preflightStatus: publicStatus,
    };
    return previewAccess;
  }

  const protectionDetected =
    publicStatus >= 300
    && publicStatus < 400
    && isVercelAuthenticationUrl(publicLocation);
  if (!protectionDetected) {
    throw new Error(
      `Vercel Preview preflight returned unexpected HTTP ${publicStatus}.`,
    );
  }
  previewAccess = {
    ...previewAccess,
    protectionDetected: true,
    bypassConfigured: vercelAutomationBypassSecret.length > 0,
    preflightStatus: publicStatus,
  };
  if (vercelAutomationBypassSecret.length === 0) {
    throw new Error(
      'Vercel Preview is protected, but the GitHub Actions repository secret '
        + 'VERCEL_AUTOMATION_BYPASS_SECRET is not configured.',
    );
  }

  const cookiesBefore = await context.cookies(baseUrl);
  const bypassResponse = await context.request.get(baseUrl, {
    failOnStatusCode: false,
    headers: {
      'x-vercel-protection-bypass': vercelAutomationBypassSecret,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    },
    maxRedirects: 0,
    timeout: 30_000,
  });
  const bypassStatus = bypassResponse.status();
  if (bypassStatus < 200 || bypassStatus >= 300) {
    throw new Error(
      `Vercel Preview rejected the configured automation bypass with HTTP `
        + `${bypassStatus}.`,
    );
  }
  const cookiesAfter = await context.cookies(baseUrl);
  previewAccess = {
    target: true,
    protectionDetected: true,
    bypassConfigured: true,
    bypassCookieStored: cookiesAfter.length > cookiesBefore.length,
    preflightStatus: bypassStatus,
  };
  return previewAccess;
}

async function latestHud(targetPage = page) {
  const snapshot = await targetPage.evaluate(
    () => globalThis.__m15CandidateSmoke?.lastHud ?? null,
  );
  if (!snapshot) throw new Error('M1.5 HUD snapshot is not available.');
  return snapshot;
}

async function hudTimeline(targetPage = page) {
  return targetPage.evaluate(
    () => globalThis.__m15CandidateSmoke?.hudSnapshots ?? [],
  );
}

async function waitForHud(expected, timeout = 30_000) {
  await page.waitForFunction(
    (criteria) => {
      const snapshot = globalThis.__m15CandidateSmoke?.lastHud;
      if (!snapshot) return false;
      if (criteria.area !== undefined && snapshot.area !== criteria.area) return false;
      if (
        criteria.transitionState !== undefined
        && snapshot.transitionState !== criteria.transitionState
      ) return false;
      if (
        criteria.notTransitionState !== undefined
        && snapshot.transitionState === criteria.notTransitionState
      ) return false;
      if (
        criteria.inputLocked !== undefined
        && snapshot.inputLocked !== criteria.inputLocked
      ) return false;
      if (
        criteria.branchVisible !== undefined
        && snapshot.branchVisible !== criteria.branchVisible
      ) return false;
      if (
        criteria.branchDirection !== undefined
        && snapshot.branchDirection !== criteria.branchDirection
      ) return false;
      if (criteria.facing !== undefined && snapshot.facing !== criteria.facing) return false;
      if (
        criteria.animation !== undefined
        && snapshot.animation !== criteria.animation
      ) return false;
      if (
        criteria.animationPrefix !== undefined
        && !String(snapshot.animation ?? '').startsWith(criteria.animationPrefix)
      ) return false;
      if (
        criteria.spawnId !== undefined
        && snapshot.spawnId !== criteria.spawnId
      ) return false;
      if (
        criteria.lastTransitionId !== undefined
        && snapshot.lastTransitionId !== criteria.lastTransitionId
      ) return false;
      if (criteria.minX !== undefined && snapshot.playerX < criteria.minX) return false;
      if (criteria.maxX !== undefined && snapshot.playerX > criteria.maxX) return false;
      if (criteria.minSpeed !== undefined && snapshot.speed < criteria.minSpeed) return false;
      if (criteria.maxSpeed !== undefined && snapshot.speed > criteria.maxSpeed) return false;
      if (
        criteria.audioMuted !== undefined
        && snapshot.audioMuted !== criteria.audioMuted
      ) return false;
      if (
        criteria.inputSource !== undefined
        && snapshot.inputSource !== criteria.inputSource
      ) return false;
      if (
        criteria.timeMinutes !== undefined
        && Math.abs(snapshot.timeMinutes - criteria.timeMinutes)
          > (criteria.timeTolerance ?? 2)
      ) return false;
      if (criteria.minFps !== undefined && snapshot.fps < criteria.minFps) return false;
      return true;
    },
    expected,
    { timeout, polling: 'raf' },
  );
  return latestHud();
}

async function waitForStableIdle(area, facing, timeout = 15_000) {
  await page.waitForFunction(
    ({ expectedArea, expectedFacing }) => {
      const snapshots =
        globalThis.__m15CandidateSmoke?.hudSnapshots?.slice(-4) ?? [];
      if (snapshots.length < 4) return false;
      return snapshots.every((snapshot) => (
        snapshot.area === expectedArea
        && snapshot.transitionState === 'idle'
        && snapshot.inputLocked === false
        && snapshot.speed === 0
        && snapshot.facing === expectedFacing
        && snapshot.animation === `idle-${expectedFacing}`
        && snapshot.playerX === snapshots[0].playerX
      ));
    },
    { expectedArea: area, expectedFacing: facing },
    { timeout, polling: 'raf' },
  );
  return latestHud();
}

async function audioDiagnostics() {
  return page.evaluate(
    () => globalThis.__BOKU_M15_AUDIO__?.getDiagnostics() ?? null,
  );
}

async function pollFromHost(
  description,
  read,
  accept,
  timeout = 10_000,
  interval = 75,
) {
  const deadline = Date.now() + timeout;
  let lastValue = null;
  do {
    lastValue = await read();
    if (accept(lastValue)) return lastValue;
    await new Promise((resolve) => {
      setTimeout(resolve, interval);
    });
  } while (Date.now() < deadline);
  throw new Error(
    `Timed out waiting for ${description}; last value `
      + `${JSON.stringify(lastValue)}.`,
  );
}

async function waitForAudioReady(timeout = 30_000) {
  await page.waitForFunction(
    () => {
      const diagnostics = globalThis.__BOKU_M15_AUDIO__?.getDiagnostics();
      return Boolean(
        diagnostics
        && diagnostics.sourceId
        && diagnostics.contextState === 'running'
        && diagnostics.decodedChannels === 2
        && diagnostics.duration > 1
        && diagnostics.lastRecoveryError === null,
      );
    },
    null,
    { timeout, polling: 100 },
  );
  return audioDiagnostics();
}

async function waitForAudioAdvance(before, minimumDelta = 0.15, timeout = 15_000) {
  await page.waitForFunction(
    ({ sourceId, offset, duration, requiredDelta }) => {
      const diagnostics = globalThis.__BOKU_M15_AUDIO__?.getDiagnostics();
      if (!diagnostics || diagnostics.sourceId !== sourceId) return false;
      const delta =
        ((diagnostics.offset - offset) % duration + duration) % duration;
      return delta >= requiredDelta && delta < duration / 2;
    },
    {
      sourceId: before.sourceId,
      offset: before.offset,
      duration: before.duration,
      requiredDelta: minimumDelta,
    },
    { timeout, polling: 75 },
  );
  return audioDiagnostics();
}

async function pollAudioLoopBoundary(sourceId, duration) {
  const timeoutMs = Math.ceil(duration * 750 + 5_000);
  return page.evaluate(
    ({ expectedSourceId, expectedDuration, pollTimeoutMs }) => new Promise((resolve, reject) => {
      const startedAt = performance.now();
      let previous = globalThis.__BOKU_M15_AUDIO__?.getDiagnostics() ?? null;
      let timer = null;

      const finish = (result, error) => {
        if (timer !== null) window.clearInterval(timer);
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve(result);
      };

      timer = window.setInterval(() => {
        const current = globalThis.__BOKU_M15_AUDIO__?.getDiagnostics() ?? null;
        if (!current || !previous) {
          finish(null, 'Audio diagnostics disappeared while polling the loop boundary.');
          return;
        }
        if (
          current.sourceId !== expectedSourceId
          || previous.sourceId !== expectedSourceId
        ) {
          finish(null, 'The BGM source changed while polling the loop boundary.');
          return;
        }

        const wrapped = (
          previous.offset > expectedDuration * 0.7
          && current.offset < expectedDuration * 0.3
          && current.offset < previous.offset
        );
        if (wrapped) {
          finish({
            before: previous,
            after: current,
            pollIntervalMs: 25,
            elapsedMs: performance.now() - startedAt,
          }, null);
          return;
        }

        previous = current;
        if (performance.now() - startedAt > pollTimeoutMs) {
          finish(
            null,
            `BGM loop boundary was not observed within ${pollTimeoutMs}ms.`,
          );
        }
      }, 25);
    }),
    {
      expectedSourceId: sourceId,
      expectedDuration: duration,
      pollTimeoutMs: timeoutMs,
    },
  );
}

async function capture(filename) {
  const target = path.join(outputDir, safeFilename(filename));
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

function createInputController(targetPage, targetCdpSession, useTouch) {
  let touchActive = false;

  async function joystickPoint(direction, magnitude) {
    const joystick = targetPage.getByLabel('左右移動スティック', { exact: true });
    await joystick.waitFor({ state: 'visible' });
    const box = await joystick.boundingBox();
    if (!box) throw new Error('Touch joystick does not have a rendered rectangle.');
    const center = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
    const travel = Math.min(56, box.width * 0.38) * magnitude;
    return {
      center,
      target: {
        x: center.x + (direction === 'right' ? travel : -travel),
        y: center.y,
      },
    };
  }

  return {
    async start(direction, magnitude = 1) {
      assert(
        Number.isFinite(magnitude) && magnitude > 0 && magnitude <= 1,
        `Joystick magnitude must be in (0, 1]; received ${magnitude}.`,
      );
      if (!useTouch) {
        await targetPage.keyboard.down(
          direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
        );
        return;
      }
      assert(!touchActive, 'A prior joystick touch is still active.');
      const point = await joystickPoint(direction, magnitude);
      await targetCdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...point.center, radiusX: 7, radiusY: 7, force: 1 }],
      });
      await targetCdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...point.target, radiusX: 7, radiusY: 7, force: 1 }],
      });
      touchActive = true;
    },

    async stop(direction) {
      if (!useTouch) {
        await targetPage.keyboard.up(
          direction === 'right' ? 'ArrowRight' : 'ArrowLeft',
        );
        return;
      }
      if (!touchActive) return;
      await targetCdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      touchActive = false;
    },

    async cancel() {
      if (!useTouch || !touchActive) return;
      await targetCdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchCancel',
        touchPoints: [],
      });
      touchActive = false;
    },
  };
}

async function createInstrumentedPage({
  accountRuntimeFailures = false,
} = {}) {
  const targetPage = await context.newPage();
  const targetCdpSession = await context.newCDPSession(targetPage);
  await targetCdpSession.send('Page.enable');
  await targetCdpSession.send(
    'Page.setLifecycleEventsEnabled',
    { enabled: true },
  );
  targetCdpSession.on('Page.lifecycleEvent', (event) => {
    if (!accountRuntimeFailures) return;
    cdpLifecycleEvents.push({
      ...event,
      receivedAt: Date.now(),
    });
  });
  targetPage.on('console', (message) => {
    if (!accountRuntimeFailures) return;
    record(`console:${message.type()}`, message.text());
  });
  targetPage.on('pageerror', (error) => {
    if (!accountRuntimeFailures || !collectRuntimeFailures) return;
    const detail = error.stack ?? error.message;
    pageErrors.push(detail);
    record('pageerror', detail);
  });
  targetPage.on('request', (request) => {
    if (!accountRuntimeFailures) return;
    requestedUrls.add(request.url());
  });
  targetPage.on('requestfailed', (request) => {
    if (!accountRuntimeFailures || !collectRuntimeFailures) return;
    const detail =
      `${request.method()} ${request.url()} :: `
      + `${request.failure()?.errorText ?? 'unknown'}`;
    failedRequests.push(detail);
    record('requestfailed', detail);
  });
  return {
    page: targetPage,
    cdpSession: targetCdpSession,
    inputController: createInputController(
      targetPage,
      targetCdpSession,
      touchEnabled,
    ),
  };
}

async function exerciseWalk(area, direction, screenshotName) {
  const before = await latestHud();
  let during;
  await inputController.start(direction);
  try {
    during = await waitForHud({
      area,
      facing: direction,
      animation: `walk-${direction}`,
      minSpeed: 35,
      inputSource: touchEnabled ? 'touch' : 'keyboard',
    });
    if (screenshotName) await capture(screenshotName);
  } finally {
    await inputController.stop(direction);
  }
  const stopped = await waitForStableIdle(area, direction);
  const moved = direction === 'right'
    ? during.playerX > before.playerX
    : during.playerX < before.playerX;
  assert(moved, `${area} did not move ${direction}.`);
  assert(
    stopped.inputSource === 'none',
    `${area}/${direction} input did not return to none after release.`,
  );
  return { before, during, stopped };
}

async function moveToX(area, targetX, tolerance = POSITION_TOLERANCE_WORLD_PX) {
  const geometry = getM15GeometryArea(area);
  assert(
    targetX >= 0 && targetX <= geometry.worldWidth,
    `${area} target ${targetX} is outside the fixture world.`,
  );

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = await latestHud();
    assert(current.area === area, `Expected ${area}, got ${current.area}.`);
    const delta = targetX - current.playerX;
    if (Math.abs(delta) <= tolerance) return current;
    const direction = delta > 0 ? 'right' : 'left';
    const distance = Math.abs(delta);
    const precisionMagnitude = touchEnabled && distance <= 42
      ? Math.max(0.08, Math.min(0.6, distance / 40))
      : 1;

    await inputController.start(direction, precisionMagnitude);
    try {
      if (distance > 42) {
        const threshold = direction === 'right'
          ? { minX: targetX - 24 }
          : { maxX: targetX + 24 };
        await waitForHud({
          area,
          facing: direction,
          animation: `walk-${direction}`,
          ...threshold,
        }, 45_000);
      } else {
        if (touchEnabled) {
          await page.waitForTimeout(220);
        } else {
          await page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
          );
        }
      }
    } finally {
      await inputController.stop(direction);
    }
    await waitForStableIdle(area, direction);
  }

  const final = await latestHud();
  throw new Error(
    `${area} could not settle at ${targetX}±${tolerance}; got ${final.playerX}.`,
  );
}

async function setFacingAtX(area, targetX, facing) {
  const geometry = getM15GeometryArea(area);
  const preparationOffset = facing === 'right' ? -24 : 24;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const preparedX = Math.max(
      0,
      Math.min(geometry.worldWidth, targetX + preparationOffset),
    );
    await moveToX(area, preparedX, POSITION_TOLERANCE_WORLD_PX);
    const settled = await moveToX(
      area,
      targetX,
      PANEL_POSITION_TOLERANCE_WORLD_PX,
    );
    if (settled.facing === facing) return settled;
  }
  const final = await latestHud();
  throw new Error(
    `${area} could not face ${facing} at ${targetX}; `
    + `got ${final.facing} at ${final.playerX}.`,
  );
}

async function fixtureGroundMeasurement(areaId, position, spawn = false) {
  const geometry = getM15GeometryArea(areaId);
  const snapshot = await latestHud();
  assert(snapshot.area === areaId, `Ground measurement area drifted to ${snapshot.area}.`);
  await page.waitForFunction(
    ({ expectedArea, expectedPlayerX }) => {
      const playerGeometry =
        globalThis.__m15CandidateSmoke?.lastPlayerGeometry;
      return Boolean(
        playerGeometry
        && playerGeometry.areaId === expectedArea
        && Math.abs(playerGeometry.playerWorldX - expectedPlayerX) <= 2,
      );
    },
    { expectedArea: areaId, expectedPlayerX: snapshot.playerX },
    { timeout: 5_000, polling: 'raf' },
  );
  const playerGeometry = await page.evaluate(
    () => globalThis.__m15CandidateSmoke?.lastPlayerGeometry ?? null,
  );
  assert(playerGeometry, `${areaId}/${position} player geometry is unavailable.`);
  assert(
    playerGeometry.areaId === areaId
      && Math.abs(playerGeometry.playerWorldX - snapshot.playerX) <= 2,
    `${areaId}/${position} player geometry is stale.`,
  );
  const renderedFootScreenY =
    playerGeometry.footRect.top + playerGeometry.footRect.height / 2;
  const fixtureGroundScreenY =
    playerGeometry.canvasRect.top
    + (geometry.ground.y - playerGeometry.cameraScrollY)
      * playerGeometry.scaleY;
  const cssDelta = Math.abs(renderedFootScreenY - fixtureGroundScreenY);
  const worldDelta = Math.abs(snapshot.playerY - geometry.ground.y);
  const tolerance = spawn
    ? M15_GEOMETRY_FIXTURE.tolerances.spawnFootToGroundCssPx
    : M15_GEOMETRY_FIXTURE.tolerances.renderedFootToGroundCssPx;
  assert(
    cssDelta <= tolerance,
    `${areaId}/${position} foot-ground delta ${cssDelta} exceeds ${tolerance}.`,
  );
  const measurement = {
    areaId,
    position,
    fixtureGroundY: geometry.ground.y,
    runtimeFootY: snapshot.playerY,
    renderedFootScreenY,
    fixtureGroundScreenY,
    worldDelta,
    cssDelta,
    tolerance,
    playerGeometry,
    backgroundSha256: geometry.assets.backgroundSha256,
    foregroundSha256: geometry.assets.foregroundSha256,
    snapshot,
  };
  if (spawn) evidence.spawns.push(measurement);
  return measurement;
}

async function captureAreaPositions(areaId, legacyNames = {}) {
  const geometry = getM15GeometryArea(areaId);
  const results = {};
  for (const sample of geometry.ground.samples) {
    await moveToX(areaId, sample.x);
    const ground = await fixtureGroundMeasurement(areaId, sample.position);
    const screenshot =
      legacyNames[sample.position]
      ?? `ground-${areaId}-${sample.position}.png`;
    await capture(screenshot);
    results[sample.position] = ground;

    if (sample.position === 'center') {
      results.walkRight = await exerciseWalk(
        areaId,
        'right',
        legacyNames.walkRight ?? `walk-${areaId}-right.png`,
      );
      await moveToX(areaId, sample.x);
      results.walkLeft = await exerciseWalk(
        areaId,
        'left',
        legacyNames.walkLeft ?? `walk-${areaId}-left.png`,
      );
      await moveToX(areaId, sample.x);
    }
  }
  evidence.areaPositions[areaId] = results;
  return results;
}

async function openDeveloperDrawer() {
  const drawer = page.locator('details.dev-tool-drawer');
  if (!await drawer.evaluate((element) => element.open)) {
    await drawer.locator('summary').click();
  }
  return drawer;
}

async function closeDeveloperDrawer() {
  const drawer = page.locator('details.dev-tool-drawer');
  if (await drawer.evaluate((element) => element.open)) {
    await drawer.locator('summary').click();
  }
}

async function captureGeometryDebug(areaId) {
  await openDeveloperDrawer();
  const showButton = page.getByRole('button', {
    name: '当たり判定を表示',
    exact: true,
  });
  assert(await showButton.count() === 1, 'Geometry debug toggle is missing.');
  await showButton.click();
  await waitForHud({ area: areaId });
  await page.waitForFunction(
    () => globalThis.__m15CandidateSmoke?.lastHud?.collisionDebug === true,
    null,
    { timeout: 5_000, polling: 'raf' },
  );
  await closeDeveloperDrawer();
  const filename = `debug-geometry-${areaId}.png`;
  await capture(filename);

  await openDeveloperDrawer();
  const hideButton = page.getByRole('button', {
    name: '当たり判定を隠す',
    exact: true,
  });
  assert(await hideButton.count() === 1, 'Geometry debug reset toggle is missing.');
  await hideButton.click();
  await page.waitForFunction(
    () => globalThis.__m15CandidateSmoke?.lastHud?.collisionDebug === false,
    null,
    { timeout: 5_000, polling: 'raf' },
  );
  await closeDeveloperDrawer();
  evidence.debugGeometry[areaId] = {
    screenshot: filename,
    fixture: {
      ground: getM15GeometryArea(areaId).ground,
      spawns: getM15GeometryArea(areaId).spawns,
      branchEntrances: getM15GeometryArea(areaId).branchEntrances,
    },
  };
  return evidence.debugGeometry[areaId];
}

async function capturePhaseMatrix(areaId, legacyNames = {}) {
  const results = {};
  await openDeveloperDrawer();
  const stepButton = page.getByRole('button', { name: '＋15分', exact: true });
  const resetButton = page.getByRole('button', { name: '朝へ戻す', exact: true });
  assert(await stepButton.count() === 1, 'The +15 minute control is missing.');
  assert(await resetButton.count() === 1, 'The morning reset control is missing.');

  await resetButton.click();
  for (const phaseTarget of PHASE_TARGETS) {
    for (let index = 0; index < phaseTarget.increments; index += 1) {
      await stepButton.click();
    }
    const snapshot = await waitForHud({
      area: areaId,
      timeMinutes: phaseTarget.minutes,
      timeTolerance: 1,
    }, 15_000);
    const filename =
      legacyNames[phaseTarget.phase]
      ?? `phase-${areaId}-${phaseTarget.phase}.png`;
    await closeDeveloperDrawer();
    await capture(filename);
    results[phaseTarget.phase] = {
      fixtureBackgroundPath:
        getM15GeometryArea(areaId).assets.backgroundPaths[phaseTarget.phase],
      fixtureBackgroundSha256:
        getM15GeometryArea(areaId).assets.backgroundSha256[phaseTarget.phase],
      snapshot,
      screenshot: filename,
    };
    if (phaseTarget.phase !== 'night') await openDeveloperDrawer();
  }

  await openDeveloperDrawer();
  await resetButton.click();
  await waitForHud({ area: areaId, timeMinutes: 360, timeTolerance: 1 });
  await closeDeveloperDrawer();
  evidence.phaseMatrix[areaId] = results;
  return results;
}

async function waitForPanel(direction) {
  const button = page.getByRole('button', {
    name: PANEL_LABELS[direction],
    exact: true,
  });
  await button.waitFor({ state: 'visible' });
  await page.waitForFunction(
    ({ label, minimumGap }) => {
      const candidate = [...document.querySelectorAll('button')]
        .find((element) => element.getAttribute('aria-label') === label);
      if (!(candidate instanceof HTMLButtonElement)) return false;
      const distance = Number(candidate.dataset.areaPanelPlayerDistance);
      return (
        !candidate.disabled
        && candidate.getAttribute('aria-hidden') !== 'true'
        && candidate.classList.contains('area-arrow-button--placed')
        && Number.isFinite(distance)
        && distance >= minimumGap
      );
    },
    {
      label: PANEL_LABELS[direction],
      minimumGap: AREA_PANEL_MIN_PLAYER_GAP,
    },
    { timeout: 12_000, polling: 'raf' },
  );
  return button;
}

async function readPanelGeometry(direction) {
  const domSnapshot = await page.evaluate(
    ({ label, obstacleSelectors }) => {
      const button = [...document.querySelectorAll('button')]
        .find((element) => element.getAttribute('aria-label') === label);
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Panel ${label} is not rendered.`);
      }
      const smoke = globalThis.__m15CandidateSmoke;
      const playerGeometry = smoke?.lastPlayerGeometry ?? null;
      const panelRect = button.getBoundingClientRect().toJSON();
      const obstacles = [];
      const seen = new Set();
      for (const selector of obstacleSelectors) {
        for (const element of document.querySelectorAll(selector)) {
          if (
            !(element instanceof HTMLElement)
            || element === button
            || element.contains(button)
            || seen.has(element)
          ) {
            continue;
          }
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (
            style.display === 'none'
            || style.visibility === 'hidden'
            || Number.parseFloat(style.opacity) === 0
            || rect.width <= 0
            || rect.height <= 0
          ) {
            continue;
          }
          seen.add(element);
          obstacles.push({
            id:
              element.dataset.areaPanelObstacle
              || element.getAttribute('aria-label')
              || element.classList.item(0)
              || selector,
            selector,
            rect: rect.toJSON(),
          });
        }
      }
      return {
        panelRect,
        playerGeometry,
        obstacles,
        dataset: {
          anchor: button.dataset.areaPanelAnchor,
          playerIntersection: button.dataset.areaPanelPlayerIntersection,
          playerDistance: button.dataset.areaPanelPlayerDistance,
          obstacleIntersections:
            button.dataset.areaPanelObstacleIntersections,
          x: button.dataset.areaPanelX,
          y: button.dataset.areaPanelY,
        },
        disabled: button.disabled,
        ariaHidden: button.getAttribute('aria-hidden'),
        prompt: smoke?.lastPrompt ?? null,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
      };
    },
    {
      label: PANEL_LABELS[direction],
      obstacleSelectors: PANEL_OBSTACLE_SELECTORS,
    },
  );
  assert(domSnapshot.playerGeometry, `${direction} player geometry is missing.`);

  const panel = normalizeRect(domSnapshot.panelRect);
  const playerRect = normalizeRect(domSnapshot.playerGeometry.rect);
  const footRect = normalizeRect(domSnapshot.playerGeometry.footRect);
  const playerIntersection = areaPanelIntersectionArea(panel, playerRect);
  const playerDistance = areaPanelRectDistance(panel, playerRect);
  const obstacleMetrics = domSnapshot.obstacles.map((obstacle) => {
    const obstacleRect = normalizeRect(obstacle.rect);
    return {
      ...obstacle,
      intersectionArea: areaPanelIntersectionArea(panel, obstacleRect),
      distance: areaPanelRectDistance(panel, obstacleRect),
    };
  });

  return {
    ...domSnapshot,
    panelRect: panel,
    playerRect,
    footRect,
    playerIntersection,
    playerDistance,
    obstacleMetrics,
  };
}

async function capturePanelMatrix(direction) {
  const areaId = PANEL_DIRECTION_AREAS[direction];
  const area = getM15GeometryArea(areaId);
  const entrance = area.branchEntrances[direction];
  const triggerSamples = [
    {
      name: 'start',
      triggerBoundaryWorldX: entrance.triggerRange.minX,
      fixtureWorldX:
        entrance.triggerRange.minX + PANEL_TRIGGER_INSET_WORLD_PX,
      targetWorldX:
        entrance.triggerRange.minX + PANEL_TRIGGER_INSET_WORLD_PX,
    },
    {
      name: 'center',
      triggerBoundaryWorldX: entrance.triggerCenterX,
      fixtureWorldX: entrance.triggerCenterX,
      targetWorldX: entrance.triggerCenterX,
    },
    {
      name: 'end',
      triggerBoundaryWorldX: entrance.triggerRange.maxX,
      fixtureWorldX:
        entrance.triggerRange.maxX - PANEL_TRIGGER_INSET_WORLD_PX,
      targetWorldX:
        entrance.triggerRange.maxX - PANEL_TRIGGER_INSET_WORLD_PX,
    },
  ];
  const results = [];

  assert(
    entrance.centerDeltaX
      <= M15_GEOMETRY_FIXTURE.tolerances.entranceToTriggerCenterCssPx,
    `${areaId}/${direction} painted entrance and trigger are misaligned.`,
  );

  for (const triggerSample of triggerSamples) {
    for (const facing of ['left', 'right']) {
      const position = await setFacingAtX(
        areaId,
        triggerSample.targetWorldX,
        facing,
      );
      assert(
        Math.abs(position.playerX - triggerSample.fixtureWorldX)
          <= POSITION_TOLERANCE_WORLD_PX + 1,
        `${areaId}/${direction}/${triggerSample.name}/${facing} position drift.`,
      );
      const prompt = await waitForHud({
        area: areaId,
        branchVisible: true,
        branchDirection: direction,
        facing,
        maxSpeed: 0,
      });
      await waitForPanel(direction);
      const geometry = await readPanelGeometry(direction);
      const groundCss = await fixtureGroundMeasurement(
        areaId,
        `panel-${direction}-${triggerSample.name}-${facing}`,
      );
      const filename =
        `panel-${direction}-${triggerSample.name}-${facing}.png`;

      assert(geometry.disabled === false, `${filename} panel is disabled.`);
      assert(geometry.ariaHidden !== 'true', `${filename} panel is aria-hidden.`);
      assert(
        geometry.playerIntersection === 0,
        `${filename} player intersection ${geometry.playerIntersection}.`,
      );
      assert(
        geometry.playerDistance >= AREA_PANEL_MIN_PLAYER_GAP,
        `${filename} player distance ${geometry.playerDistance}.`,
      );
      assert(
        geometry.panelRect.width >= AREA_PANEL_MIN_TOUCH_TARGET
          && geometry.panelRect.height >= AREA_PANEL_MIN_TOUCH_TARGET,
        `${filename} touch rectangle is below 44x44 CSS px.`,
      );
      assert(
        geometry.obstacleMetrics.every((metric) => metric.intersectionArea === 0),
        `${filename} intersects a HUD obstacle.`,
      );
      assert(
        geometry.dataset.obstacleIntersections === '',
        `${filename} placement core reported an obstacle collision.`,
      );
      assert(
        Number(geometry.dataset.playerIntersection) === 0,
        `${filename} placement dataset intersection is not zero.`,
      );
      assert(
        Number(geometry.dataset.playerDistance) >= AREA_PANEL_MIN_PLAYER_GAP,
        `${filename} placement dataset distance is below 12px.`,
      );
      assert(
        geometry.prompt?.visible === true
          && geometry.prompt?.direction === direction
          && geometry.prompt?.areaId === areaId,
        `${filename} prompt state does not match the panel.`,
      );

      await capture(filename);
      if (direction === 'up' && results.length === 0) {
        await capture('09-up-arrow.png');
      }
      if (direction === 'down' && results.length === 0) {
        await capture('11-down-arrow.png');
      }
      results.push({
        viewport,
        deviceScaleFactor,
        touchEnabled,
        areaId,
        direction,
        triggerSample,
        actualPlayerWorldX: position.playerX,
        facing,
        prompt,
        entrance: {
          backgroundRange: entrance.backgroundRange,
          backgroundCenterX: entrance.backgroundCenterX,
          triggerRange: entrance.triggerRange,
          triggerCenterX: entrance.triggerCenterX,
          centerDeltaX: entrance.centerDeltaX,
        },
        geometry,
        groundCss,
        screenshot: filename,
      });
    }
  }

  assert(results.length === 6, `${direction} panel matrix is incomplete.`);
  evidence.panelMatrix.push(...results);
  return results;
}

async function transitionWithHorizontalInput({
  direction,
  targetArea,
  targetSpawnId,
  expectedExitId,
  loadingScreenshot,
}) {
  const departure = await latestHud();
  const beforeAudio = await audioDiagnostics();
  let locked;
  await inputController.start(direction);
  try {
    locked = await waitForHud({
      area: departure.area,
      notTransitionState: 'idle',
      inputLocked: true,
      maxSpeed: 0,
    });
    if (loadingScreenshot) await capture(loadingScreenshot);
  } finally {
    await inputController.stop(direction);
  }
  const arrival = await waitForHud({
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    spawnId: targetSpawnId,
    lastTransitionId: expectedExitId,
    maxSpeed: 0,
    animationPrefix: 'idle-',
  });
  const afterAudio = await waitForAudioAdvance(beforeAudio);
  assert(
    afterAudio.sourceId === beforeAudio.sourceId,
    `${expectedExitId} replaced the BGM source.`,
  );
  assert(
    arrival.audioMuted === departure.audioMuted,
    `${expectedExitId} changed mute state.`,
  );
  const check = {
    kind: 'horizontal',
    direction,
    departure,
    locked,
    arrival,
    expectedTarget: { targetArea, targetSpawnId, expectedExitId },
    audio: { before: beforeAudio, after: afterAudio },
  };
  transitionChecks.push(check);
  evidence.transitions.push(check);
  return check;
}

async function tapPanelAndTransition({
  direction,
  targetArea,
  targetSpawnId,
  expectedExitId,
}) {
  const departure = await latestHud();
  const beforeAudio = await audioDiagnostics();
  const button = await waitForPanel(direction);
  if (touchEnabled) {
    const box = await button.boundingBox();
    if (!box) throw new Error(`${direction} panel does not have a touch box.`);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await button.click();
  }
  const locked = await waitForHud({
    area: departure.area,
    notTransitionState: 'idle',
    inputLocked: true,
    maxSpeed: 0,
  });
  const arrival = await waitForHud({
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    spawnId: targetSpawnId,
    lastTransitionId: expectedExitId,
    maxSpeed: 0,
    animationPrefix: 'idle-',
  });
  const afterAudio = await waitForAudioAdvance(beforeAudio);
  assert(
    afterAudio.sourceId === beforeAudio.sourceId,
    `${expectedExitId} replaced the BGM source.`,
  );
  assert(
    arrival.audioMuted === departure.audioMuted,
    `${expectedExitId} changed mute state.`,
  );
  const check = {
    kind: touchEnabled ? 'touch-panel' : 'desktop-panel',
    direction,
    departure,
    locked,
    arrival,
    expectedTarget: { targetArea, targetSpawnId, expectedExitId },
    audio: { before: beforeAudio, after: afterAudio },
  };
  transitionChecks.push(check);
  evidence.transitions.push(check);
  return check;
}

async function setMuted(muted) {
  const current = await latestHud();
  if (current.audioMuted === muted) return current;
  const before = await audioDiagnostics();
  const label = muted ? '音をオフにする' : '音をオンにする';
  const button = page.getByRole('button', { name: label, exact: true });
  await button.waitFor({ state: 'visible' });
  assert(!await button.isDisabled(), 'Web Audio is unavailable.');
  if (touchEnabled) {
    const box = await button.boundingBox();
    if (!box) throw new Error('Mute button does not have a touch box.');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await button.click();
  }
  const snapshot = await waitForHud({ audioMuted: muted });
  const diagnostics = await pollFromHost(
    `the actual master gain to settle after ${muted ? 'mute' : 'unmute'}`,
    audioDiagnostics,
    (value) => (
      value?.muted === muted
      && value.masterGainAutomation?.reason === (muted ? 'mute' : 'unmute')
      && (
        muted
          ? (
            value.masterGainAutomation.target === 0
            && value.masterGain <= 0.01
          )
          : (
            value.masterGainAutomation.target > 0
            && Math.abs(
              value.masterGain - value.masterGainAutomation.target,
            ) <= 0.02
          )
      )
    ),
    8_000,
  );
  assert(diagnostics.muted === muted, 'Audio diagnostics mute state disagrees.');
  evidence.audio.muteToggles ??= [];
  evidence.audio.muteToggles.push({
    requestedMuted: muted,
    before,
    after: diagnostics,
    hud: snapshot,
  });
  return snapshot;
}

async function verifyAudioTimeline() {
  const start = await waitForAudioReady();
  assert(
    start.assetUrl.includes('/assets/audio/m15/'),
    `Unexpected BGM asset: ${start.assetUrl}.`,
  );
  assert(start.decodedChannels === 2, 'Decoded BGM is not stereo.');
  assert(
    start.decodedSampleRate > 0,
    'Browser decode did not publish a sample rate.',
  );
  const startedForward = await waitForAudioAdvance(start, 0.2);

  await page.waitForFunction(
    ({ sourceId, duration }) => {
      const diagnostics = globalThis.__BOKU_M15_AUDIO__?.getDiagnostics();
      return Boolean(
        diagnostics
        && diagnostics.sourceId === sourceId
        && diagnostics.offset >= duration * 0.45
        && diagnostics.offset <= duration * 0.62,
      );
    },
    { sourceId: start.sourceId, duration: start.duration },
    { timeout: Math.ceil(start.duration * 1_100), polling: 100 },
  );
  const middle = await audioDiagnostics();

  const loopBoundary = await pollAudioLoopBoundary(start.sourceId, start.duration);
  const loopBefore = loopBoundary.before;
  const loopAfter = loopBoundary.after;
  const boundaryDelta = cyclicOffsetDelta(
    loopBefore.offset,
    loopAfter.offset,
    start.duration,
  );
  assert(boundaryDelta > 0 && boundaryDelta < 1.5, 'BGM loop boundary did not advance naturally.');
  assert(loopAfter.sourceId === loopBefore.sourceId, 'BGM loop replaced its source.');

  evidence.audio.timeline = {
    start,
    startedForward,
    middle,
    loopBefore,
    loopAfter,
    loopPollIntervalMs: loopBoundary.pollIntervalMs,
    loopPollElapsedMs: loopBoundary.elapsedMs,
    boundaryDelta,
  };
  return evidence.audio.timeline;
}

async function verifyVisibilityAndFreezeRecovery() {
  const beforeHidden = await audioDiagnostics();
  const beforeVisibilityHud = await latestHud();
  const visibilityEventStartIndex = await page.evaluate(
    () => globalThis.__m15CandidateSmoke?.lifecycleEvents?.length ?? 0,
  );
  const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
  assert(
    typeof targetInfo?.targetId === 'string' && targetInfo.targetId,
    'CDP did not expose the candidate page target ID.',
  );
  const windowForTarget = await browserCdpSession.send(
    'Browser.getWindowForTarget',
    { targetId: targetInfo.targetId },
  );
  assert(
    Number.isInteger(windowForTarget?.windowId),
    'CDP did not expose the candidate browser window ID.',
  );
  const windowId = windowForTarget.windowId;
  const originalBounds = await browserCdpSession.send(
    'Browser.getWindowBounds',
    { windowId },
  );
  const originalGeometry = Object.fromEntries(
    ['left', 'top', 'width', 'height']
      .filter((key) => Number.isFinite(originalBounds?.bounds?.[key]))
      .map((key) => [key, originalBounds.bounds[key]]),
  );
  const geometryRestoreToleranceDip = 2;
  assert(
    Object.keys(originalGeometry).length === 4,
    'CDP did not expose complete original browser window geometry.',
  );
  assert(
    originalBounds?.bounds?.windowState === 'normal'
      && originalGeometry.width > 0
      && originalGeometry.height > 0,
    'CDP did not expose a normal browser window with positive geometry.',
  );
  const windowControl = {
    targetId: targetInfo.targetId,
    windowId,
    originalBounds: originalBounds.bounds,
    geometryRestoreToleranceDip,
    minimizeCommand: null,
    minimizedBounds: null,
    restoreNormalCommand: null,
    restoreGeometryCommand: null,
    restoredBounds: null,
  };
  let hiddenState = null;
  let visibleState = null;
  let hiddenAudio = null;
  let visibleAudio = null;
  let staleTraversal = null;
  let restoreAttempted = false;
  try {
    const minimizeResponse = await browserCdpSession.send(
      'Browser.setWindowBounds',
      {
        windowId,
        bounds: { windowState: 'minimized' },
      },
    );
    windowControl.minimizeCommand = {
      succeeded: true,
      response: minimizeResponse,
    };
    hiddenState = await pollFromHost(
      'a minimized browser window with real hidden state and settled output gain',
      async () => {
        const [pageState, bounds] = await Promise.all([
          page.evaluate(() => ({
            documentHidden: document.hidden,
            visibilityState: document.visibilityState,
            audio:
              globalThis.__BOKU_M15_AUDIO__?.getDiagnostics() ?? null,
          })),
          browserCdpSession.send(
            'Browser.getWindowBounds',
            { windowId },
          ),
        ]);
        return {
          ...pageState,
          browserWindowBounds: bounds.bounds,
        };
      },
      (snapshot) => (
        snapshot?.browserWindowBounds?.windowState === 'minimized'
        && snapshot.documentHidden === true
        && snapshot.visibilityState === 'hidden'
        && snapshot.audio?.documentHidden === true
        && snapshot.audio?.masterGainAutomation?.target === 0
        && snapshot.audio?.masterGain <= 0.01
      ),
      12_000,
    );
    windowControl.minimizedBounds = hiddenState.browserWindowBounds;
    const hidden = hiddenState.audio;
    hiddenAudio = hidden;
    assert(
      hidden.sourceId === beforeHidden.sourceId,
      'hidden state replaced the BGM source.',
    );
    assert(
      hidden.muted === beforeHidden.muted,
      'hidden state changed the logical mute setting.',
    );

    // Queue an adversarial late panel click while input is suspended. The
    // visible edge must clear it before the next game update.
    const hiddenPanelClick = await page.getByRole('button', {
      name: PANEL_LABELS.up,
      exact: true,
    }).evaluate((button) => {
      const smoke = globalThis.__m15CandidateSmoke;
      const requestCountBefore = smoke?.traversalRequests?.length ?? 0;
      button.click();
      const traversalRequest =
        smoke?.traversalRequests?.at(-1) ?? null;
      return {
        clickedAt: performance.now(),
        visibilityState: document.visibilityState,
        requestCountBefore,
        requestCountAfter: smoke?.traversalRequests?.length ?? 0,
        traversalRequest,
      };
    });
    assert(
      hiddenPanelClick.visibilityState === 'hidden',
      'Stale traversal probe did not run while the real tab was hidden.',
    );
    assert(
      hiddenPanelClick.requestCountAfter
        === hiddenPanelClick.requestCountBefore + 1
      && hiddenPanelClick.traversalRequest?.direction === 'up'
      && hiddenPanelClick.traversalRequest?.visibilityState === 'hidden',
      'Hidden panel tap did not enqueue one observable traversal request.',
    );

    restoreAttempted = true;
    const restoreBounds = {
      ...originalGeometry,
      windowState: 'normal',
    };
    const restoreResponse = await browserCdpSession.send(
      'Browser.setWindowBounds',
      {
        windowId,
        bounds: restoreBounds,
      },
    );
    windowControl.restoreNormalCommand = {
      succeeded: true,
      combinedWithGeometry: true,
      bounds: restoreBounds,
      response: restoreResponse,
    };
    windowControl.restoreGeometryCommand = {
      succeeded: true,
      combinedWithNormal: true,
      bounds: restoreBounds,
      response: restoreResponse,
    };
    await page.bringToFront();
    visibleState = await pollFromHost(
      'the restored browser window to become visible with restored output gain',
      async () => {
        const [pageState, bounds] = await Promise.all([
          page.evaluate(() => ({
            documentHidden: document.hidden,
            visibilityState: document.visibilityState,
            audio:
              globalThis.__BOKU_M15_AUDIO__?.getDiagnostics() ?? null,
          })),
          browserCdpSession.send(
            'Browser.getWindowBounds',
            { windowId },
          ),
        ]);
        return {
          ...pageState,
          browserWindowBounds: bounds.bounds,
        };
      },
      (snapshot) => (
        snapshot?.browserWindowBounds?.windowState === 'normal'
        && Object.entries(originalGeometry).every(([key, value]) => (
          Math.abs(snapshot.browserWindowBounds[key] - value)
            <= geometryRestoreToleranceDip
        ))
        && snapshot.documentHidden === false
        && snapshot.visibilityState === 'visible'
        && snapshot.audio?.documentHidden === false
        && snapshot.audio?.masterGainAutomation?.target > 0
        && Math.abs(
          snapshot.audio.masterGain
            - snapshot.audio.masterGainAutomation.target,
        ) <= 0.02
      ),
      12_000,
    );
    windowControl.restoredBounds = visibleState.browserWindowBounds;
    const visible = await waitForAudioAdvance(beforeHidden);
    visibleAudio = visible;
    await new Promise((resolve) => {
      setTimeout(resolve, 750);
    });
    const afterVisibilityHud = await latestHud();
    staleTraversal = {
      injected: hiddenPanelClick,
      before: beforeVisibilityHud,
      after: afterVisibilityHud,
      didNotTransition:
        afterVisibilityHud.area === beforeVisibilityHud.area
        && afterVisibilityHud.spawnId === beforeVisibilityHud.spawnId
        && afterVisibilityHud.lastTransitionId
          === beforeVisibilityHud.lastTransitionId
        && afterVisibilityHud.transitionState === 'idle',
    };
    assert(
      staleTraversal.didNotTransition,
      'A traversal request queued while hidden executed after visibility recovery.',
    );
    assert(
      visible.sourceId === beforeHidden.sourceId,
      'hidden-visible recovery replaced the BGM source.',
    );
    assert(
      visible.muted === beforeHidden.muted,
      'hidden-visible recovery changed the logical mute setting.',
    );
    assert(
      visible.lastRecoveryError === null,
      `hidden-visible recovery error: ${visible.lastRecoveryError}.`,
    );
  } finally {
    if (!restoreAttempted || windowControl.restoredBounds === null) {
      await browserCdpSession.send(
        'Browser.setWindowBounds',
        {
          windowId,
          bounds: {
            ...originalGeometry,
            windowState: 'normal',
          },
        },
      ).catch(() => {});
    }
    if (page && !page.isClosed()) await page.bringToFront().catch(() => {});
  }
  const visibilityEvents = await page.evaluate(
    (startIndex) => (
      globalThis.__m15CandidateSmoke?.lifecycleEvents?.slice(startIndex)
      ?? []
    ),
    visibilityEventStartIndex,
  );
  const hiddenEventIndex = visibilityEvents.findIndex((event) => (
    event.type === 'visibilitychange'
    && event.visibilityState === 'hidden'
  ));
  const visibleEventIndex = visibilityEvents.findIndex((event, index) => (
    index > hiddenEventIndex
    && event.type === 'visibilitychange'
    && event.visibilityState === 'visible'
  ));
  assert(
    hiddenEventIndex >= 0 && visibleEventIndex > hiddenEventIndex,
    `Real hidden-visible events were not observed in order: `
      + `${JSON.stringify(visibilityEvents)}.`,
  );
  evidence.lifecycle.hiddenVisible = {
    method: 'cdp-browser-window-minimize-restore',
    windowControl,
    beforeHidden,
    hiddenSettledState: hiddenState,
    hidden: hiddenAudio,
    visible: visibleAudio,
    visibleSettledState: visibleState,
    visibilityEvents,
    staleTraversal,
  };

  const beforeFreeze = await audioDiagnostics();
  await page.waitForFunction(
    () => globalThis.__m15CandidateSmoke?.heartbeat?.ticks >= 10,
    null,
    { timeout: 5_000, polling: 40 },
  );
  const calibrationHeartbeat = await page.evaluate(() => {
    const heartbeat = globalThis.__m15CandidateSmoke.heartbeat;
    return {
      ...heartbeat,
      recentGapsMs: [...heartbeat.recentGapsMs],
      callbackWallMs: [...heartbeat.callbackWallMs],
    };
  });
  const calibratedGaps = calibrationHeartbeat.recentGapsMs.slice(-8);
  assert(
    calibratedGaps.length === 8
      && calibratedGaps.every((gap) => gap > 0 && gap < 200),
    `Page heartbeat did not calibrate in the foreground: `
      + `${JSON.stringify(calibratedGaps)}.`,
  );
  const hostClockBefore = Date.now();
  const browserClock = await page.evaluate(() => Date.now());
  const hostClockAfter = Date.now();
  const browserClockOffsetMs =
    browserClock - ((hostClockBefore + hostClockAfter) / 2);
  const beforeFreezeHeartbeat = await page.evaluate(() => {
    const heartbeat = globalThis.__m15CandidateSmoke.heartbeat;
    heartbeat.maxGapMs = 0;
    heartbeat.recentGapsMs.length = 0;
    heartbeat.callbackWallMs.length = 0;
    heartbeat.lastWallMs = Date.now();
    return {
      ...heartbeat,
      recentGapsMs: [...heartbeat.recentGapsMs],
      callbackWallMs: [...heartbeat.callbackWallMs],
    };
  });
  const cdpEventStartIndex = cdpLifecycleEvents.length;
  const frozenResponse = await cdpSession.send(
    'Page.setWebLifecycleState',
    { state: 'frozen' },
  );
  const frozenAcceptedAt = Date.now();
  await new Promise((resolve) => {
    setTimeout(resolve, 3_200);
  });
  const activeRequestedAt = Date.now();
  const activeResponse = await cdpSession.send(
    'Page.setWebLifecycleState',
    { state: 'active' },
  );
  await page.bringToFront();
  await page.waitForFunction(
    (minimumTicks) => (
      globalThis.__m15CandidateSmoke?.heartbeat?.ticks >= minimumTicks
    ),
    beforeFreezeHeartbeat.ticks + 2,
    { timeout: 5_000, polling: 40 },
  );
  const afterFreezeHeartbeat = await page.evaluate(() => {
    const heartbeat = globalThis.__m15CandidateSmoke.heartbeat;
    return { ...heartbeat, recentGapsMs: [...heartbeat.recentGapsMs] };
  });
  const frozenWallDurationMs = activeRequestedAt - frozenAcceptedAt;
  // Bound the command-settle edge to 400 ms, then require a callback-free
  // interior longer than 2.5 s. The Evidence assembler independently
  // reconstructs these windows from the raw callback timestamps.
  const frozenSettleMarginMs = 400;
  const activeSettleMarginMs = 100;
  const innerFrozenHostWindow = {
    start: frozenAcceptedAt + frozenSettleMarginMs,
    end: activeRequestedAt - activeSettleMarginMs,
  };
  const innerFrozenBrowserWindow = {
    start: innerFrozenHostWindow.start + browserClockOffsetMs,
    end: innerFrozenHostWindow.end + browserClockOffsetMs,
  };
  const innerFrozenCallbacks = afterFreezeHeartbeat.callbackWallMs.filter(
    (callbackWallMs) => (
      callbackWallMs >= innerFrozenBrowserWindow.start
      && callbackWallMs <= innerFrozenBrowserWindow.end
    ),
  );
  const postActiveCallbacks = afterFreezeHeartbeat.callbackWallMs.filter(
    (callbackWallMs) => (
      callbackWallMs > activeRequestedAt + browserClockOffsetMs
    ),
  );
  const minimumSuspensionGapMs = Math.max(
    2_500,
    Math.floor(frozenWallDurationMs * 0.78),
  );
  const frozenMeasurement = {
    calibration: calibrationHeartbeat,
    browserClockOffsetMs,
    beforeFreeze: beforeFreezeHeartbeat,
    afterResume: afterFreezeHeartbeat,
    frozenAcceptedAt,
    activeRequestedAt,
    frozenWallDurationMs,
    frozenSettleMarginMs,
    activeSettleMarginMs,
    innerFrozenHostWindow,
    innerFrozenBrowserWindow,
    innerFrozenCallbacks,
    postActiveCallbacks,
    minimumSuspensionGapMs,
    verified:
      innerFrozenCallbacks.length === 0
      && postActiveCallbacks.length >= 1
      && afterFreezeHeartbeat.maxGapMs >= minimumSuspensionGapMs,
  };
  evidence.lifecycle.frozenActive = {
    method: 'cdp-page-lifecycle',
    beforeFreeze,
    frozenCommand: {
      succeeded: true,
      response: frozenResponse,
    },
    activeCommand: {
      succeeded: true,
      response: activeResponse,
    },
    heartbeatSuspension: frozenMeasurement,
  };
  assert(
    innerFrozenHostWindow.end > innerFrozenHostWindow.start,
    'CDP frozen measurement window was too short.',
  );
  assert(
    innerFrozenCallbacks.length === 0,
    `CDP frozen state allowed ${innerFrozenCallbacks.length} page heartbeat `
      + 'callbacks inside the measured suspension window.',
  );
  assert(
    postActiveCallbacks.length >= 1,
    'The page heartbeat did not restart after CDP active.',
  );
  assert(
    afterFreezeHeartbeat.maxGapMs >= minimumSuspensionGapMs,
    `CDP frozen state did not suspend the page heartbeat: `
      + `${afterFreezeHeartbeat.maxGapMs}ms < ${minimumSuspensionGapMs}ms.`,
  );
  await waitForAudioAdvance(beforeFreeze);
  const afterResume = await pollFromHost(
    'the actual master gain and BGM position to recover after CDP active',
    audioDiagnostics,
    (snapshot) => (
      snapshot?.sourceId === beforeFreeze.sourceId
      && snapshot.muted === beforeFreeze.muted
      && snapshot.lastRecoveryError === null
      && snapshot.masterGainAutomation?.target > 0
      && Math.abs(
        snapshot.masterGain - snapshot.masterGainAutomation.target,
      ) <= 0.02
      && cyclicOffsetDelta(
        beforeFreeze.offset,
        snapshot.offset,
        beforeFreeze.duration,
      ) > 0
    ),
    12_000,
  );
  assert(
    afterResume.sourceId === beforeFreeze.sourceId,
    'frozen-active recovery replaced the BGM source.',
  );
  assert(
    afterResume.lastRecoveryError === null,
    `frozen-active recovery error: ${afterResume.lastRecoveryError}.`,
  );
  assert(
    afterResume.muted === beforeFreeze.muted,
    'frozen-active recovery changed the logical mute setting.',
  );
  const postActiveInput = await exerciseWalk(
    'life-road',
    'right',
    'lifecycle-active-input.png',
  );
  assert(
    postActiveInput.during.inputSource
      === (touchEnabled ? 'touch' : 'keyboard')
    && postActiveInput.stopped.inputSource === 'none'
    && postActiveInput.stopped.speed === 0,
    'Real movement input did not recover and stop after CDP active.',
  );
  const lifecycleEvents = await page.evaluate(
    () => globalThis.__m15CandidateSmoke?.lifecycleEvents ?? [],
  );
  const cdpEvents = cdpLifecycleEvents.slice(cdpEventStartIndex);
  const domEventObserved = {
    freeze: lifecycleEvents.some((event) => event.type === 'freeze'),
    resume: lifecycleEvents.some((event) => event.type === 'resume'),
  };

  evidence.lifecycle = {
    hiddenVisible: evidence.lifecycle.hiddenVisible,
    frozenActive: {
      method: 'cdp-page-lifecycle',
      beforeFreeze,
      frozenCommand: {
        succeeded: true,
        response: frozenResponse,
      },
      activeCommand: {
        succeeded: true,
        response: activeResponse,
      },
      heartbeatSuspension: {
        ...frozenMeasurement,
      },
      afterResume,
      postActiveInput,
      cdpEvents,
      domEventObserved,
      headlessConstraint:
        'DOM freeze/resume events are optional; after the CDP command settle margin, zero calibrated heartbeat callbacks in the inner frozen window and post-active callback recovery prove the lifecycle interval.',
      relatedUnitTest:
        'tests/m15-audio-contract.test.mjs — mute, area transition, visibility, freeze and iOS interruption preserve one source',
    },
    events: lifecycleEvents,
  };
  return evidence.lifecycle;
}

async function navigateToHorizontalEdge(areaId, direction) {
  const geometry = getM15GeometryArea(areaId);
  const range = geometry.edgeTriggers[direction];
  const targetX = direction === 'right'
    ? range.minX - HORIZONTAL_EDGE_APPROACH_MARGIN_WORLD_PX
    : range.maxX + HORIZONTAL_EDGE_APPROACH_MARGIN_WORLD_PX;
  return moveToX(areaId, targetX, 6);
}

try {
  browser = await chromium.launch({
    headless: browserHeadless,
    executablePath: browserExecutablePath,
    // Playwright normally disables Chromium backgrounding so automation
    // remains deterministic.  Those switches also prevent a minimized
    // headed window from entering the real Page Visibility hidden state.
    // Ignore only those three switches; the smoke test then waits for native
    // hidden/visible DOM events and the actual audio-gain response.
    ignoreDefaultArgs: [...ignoredPlaywrightBackgroundingArgs],
    args: [
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  browserCdpSession = await browser.newBrowserCDPSession();
  context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    hasTouch: touchEnabled,
    isMobile: touchEnabled,
    locale: 'ja-JP',
  });
  previewAccess = await prepareVercelPreviewAccess();
  if (previewAccess.protectionDetected && previewAccess.bypassConfigured) {
    // A Vercel bypass cookie is a credential. Never persist it in trace.zip.
    traceEnabled = false;
  }
  statePayload.previewAccess = previewAccess;
  statePayload.traceEnabled = traceEnabled;
  statePayload.traceSuppressedForProtectedPreview =
    requestedTraceEnabled && !traceEnabled;
  await context.addInitScript(() => {
    const state = {
      lastHud: null,
      hudSnapshots: [],
      lastPlayerGeometry: null,
      playerGeometries: [],
      lastPrompt: null,
      prompts: [],
      traversalRequests: [],
      lifecycleEvents: [],
      heartbeat: {
        ticks: 0,
        lastWallMs: Date.now(),
        maxGapMs: 0,
        recentGapsMs: [],
        callbackWallMs: [],
      },
    };
    Object.defineProperty(globalThis, '__m15CandidateSmoke', {
      configurable: true,
      value: state,
    });
    globalThis.addEventListener('boku-no-jihanki:hud-snapshot', (event) => {
      const snapshot = { ...event.detail, capturedAt: performance.now() };
      state.lastHud = snapshot;
      state.hudSnapshots.push(snapshot);
      if (state.hudSnapshots.length > 2_400) state.hudSnapshots.shift();
    });
    globalThis.addEventListener(
      'boku-no-jihanki:player-screen-geometry',
      (event) => {
        const snapshot = { ...event.detail, capturedAt: performance.now() };
        state.lastPlayerGeometry = snapshot;
        state.playerGeometries.push(snapshot);
        if (state.playerGeometries.length > 1_200) {
          state.playerGeometries.shift();
        }
      },
    );
    globalThis.addEventListener('boku-no-jihanki:area-prompt', (event) => {
      const snapshot = { ...event.detail, capturedAt: performance.now() };
      state.lastPrompt = snapshot;
      state.prompts.push(snapshot);
      if (state.prompts.length > 400) state.prompts.shift();
    });
    globalThis.addEventListener(
      'boku-no-jihanki:area-traversal-request',
      (event) => {
        state.traversalRequests.push({
          direction: event.detail,
          capturedAt: performance.now(),
          visibilityState: document.visibilityState,
        });
      },
    );
    for (const type of ['visibilitychange', 'freeze', 'resume', 'pageshow']) {
      const target = type === 'pageshow' ? globalThis : document;
      target.addEventListener(type, () => {
        state.lifecycleEvents.push({
          type,
          capturedAt: performance.now(),
          visibilityState: document.visibilityState,
        });
      });
    }
    globalThis.setInterval(() => {
      const now = Date.now();
      const heartbeat = state.heartbeat;
      const gap = now - heartbeat.lastWallMs;
      heartbeat.ticks += 1;
      heartbeat.lastWallMs = now;
      heartbeat.maxGapMs = Math.max(heartbeat.maxGapMs, gap);
      heartbeat.recentGapsMs.push(gap);
      if (heartbeat.recentGapsMs.length > 40) {
        heartbeat.recentGapsMs.shift();
      }
      heartbeat.callbackWallMs.push(now);
      if (heartbeat.callbackWallMs.length > 240) {
        heartbeat.callbackWallMs.shift();
      }
    }, 40);
  });
  if (traceEnabled) {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    tracingStarted = true;
  }
  ({
    page,
    cdpSession,
    inputController,
  } = await createInstrumentedPage());

  const deadline = Date.now() + productionWaitMs;
  let commitMatched = false;
  do {
    const url = `${baseUrl.replace(/\/$/, '')}/?m15-smoke=${Date.now()}`;
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    if (
      isVercelPreviewTarget
      && isVercelAuthenticationUrl(page.url())
    ) {
      throw new Error(
        'Vercel Preview navigation was redirected to an authentication page.',
      );
    }
    if (!response || response.status() >= 400) {
      throw new Error(`Page returned HTTP ${response?.status() ?? 'no response'}.`);
    }
    observedCommit = (
      await page.locator('.build-badge').getAttribute('data-build-commit')
      ?? ''
    ).trim();
    commitMatched =
      observedCommit.toLowerCase() === expectedCommit.toLowerCase();
    if (!commitMatched) await page.waitForTimeout(3_000);
  } while (!commitMatched && Date.now() < deadline);
  if (!commitMatched) {
    throw new Error(
      `Timed out waiting for commit ${expectedCommit} at ${baseUrl}.`,
    );
  }

  // The commit polling page can still own app-level preload requests after
  // navigation reaches network-idle. Close it before runtime accounting so a
  // reload cannot misclassify those intentionally aborted requests as
  // failures of the exact candidate page.
  collectRuntimeFailures = false;
  await inputController.cancel().catch(() => {});
  await page.close();
  ({
    page,
    cdpSession,
    inputController,
  } = await createInstrumentedPage({
    accountRuntimeFailures: true,
  }));
  pageErrors.length = 0;
  failedRequests.length = 0;
  requestedUrls.clear();
  cdpLifecycleEvents.length = 0;
  collectRuntimeFailures = true;
  const exactResponse = await page.goto(
    `${baseUrl.replace(/\/$/, '')}/?m15-smoke-exact=${Date.now()}`,
    {
      waitUntil: 'networkidle',
      timeout: 60_000,
    },
  );
  if (!exactResponse || exactResponse.status() >= 400) {
    throw new Error(
      `Exact candidate reload returned HTTP `
      + `${exactResponse?.status() ?? 'no response'}.`,
    );
  }
  observedCommit = (
    await page.locator('.build-badge').getAttribute('data-build-commit')
    ?? ''
  ).trim();
  assert(
    observedCommit.toLowerCase() === expectedCommit.toLowerCase(),
    `Exact candidate reload changed from ${expectedCommit} to `
      + `${observedCommit || '<missing>'}.`,
  );
  const actualBrowserViewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
  assert(
    actualBrowserViewport.width === viewport.width
      && actualBrowserViewport.height === viewport.height,
    `Browser viewport mismatch: ${JSON.stringify(actualBrowserViewport)}.`,
  );
  assert(
    Math.abs(actualBrowserViewport.devicePixelRatio - deviceScaleFactor) < 0.01,
    `Browser DPR mismatch: ${actualBrowserViewport.devicePixelRatio}.`,
  );
  assert(
    touchEnabled
      ? actualBrowserViewport.maxTouchPoints > 0
      : actualBrowserViewport.maxTouchPoints === 0,
    `Browser touch emulation mismatch: ${actualBrowserViewport.maxTouchPoints}.`,
  );
  record('candidate', {
    expectedCommit,
    observedCommit,
    baseUrl,
    browserVersion: browser.version(),
    nodeVersion: process.version,
    viewport,
    deviceScaleFactor,
    touchEnabled,
    browserHeadless,
    actualBrowserViewport,
    outputDir,
  });

  await capture('01-title.png');
  const startButton = page.getByRole('button', {
    name: '夏休みを始める',
    exact: true,
  });
  if (touchEnabled) {
    const box = await startButton.boundingBox();
    if (!box) throw new Error('Start button does not have a touch box.');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await startButton.click();
  }
  const initial = await waitForHud({
    area: 'home-street',
    transitionState: 'idle',
    inputLocked: false,
    spawnId: 'start',
    timeMinutes: 360,
    minFps: 1,
  });
  assert(await page.locator('canvas').count() === 1, 'Expected one game canvas.');
  const initialSpawn = await fixtureGroundMeasurement(
    'home-street',
    'spawn-start',
    true,
  );

  const drawer = await openDeveloperDrawer();
  await page.getByRole('button', { name: 'HUDを表示', exact: true }).click();
  await page.getByText('M1.5 SIDE-SCROLL HUD', { exact: true }).waitFor();
  const developerHudRect = await page.locator('.developer-hud').evaluate(
    (element) => element.getBoundingClientRect().toJSON(),
  );
  assert(initial.fps > 0, `M1.5 HUD did not report a running loop: ${initial.fps}.`);
  await page.getByRole('button', { name: 'HUDを隠す', exact: true }).click();
  await drawer.locator('summary').click();

  await verifyAudioTimeline();
  await capture('02-home-street.png');
  await capturePhaseMatrix('home-street', {
    morning: '12-morning.png',
    day: '13-day.png',
    evening: '14-evening.png',
    night: '15-night.png',
  });
  await captureAreaPositions('home-street', {
    left: 'ground-home-street-left.png',
    center: 'ground-home-street-center.png',
    right: '05-home-right-edge.png',
    walkRight: '03-walk-right.png',
    walkLeft: '04-walk-left.png',
  });
  await captureGeometryDebug('home-street');

  await navigateToHorizontalEdge('home-street', 'right');
  const firstLife = await transitionWithHorizontalInput({
    direction: 'right',
    targetArea: 'life-road',
    targetSpawnId: 'from-home',
    expectedExitId: 'home-to-life',
    loadingScreenshot: '06-transition-loading.png',
  });
  await fixtureGroundMeasurement('life-road', 'spawn-from-home', true);
  await capture('07-life-road.png');
  await capturePhaseMatrix('life-road');
  await captureAreaPositions('life-road');
  await captureGeometryDebug('life-road');

  await setMuted(true);
  await navigateToHorizontalEdge('life-road', 'left');
  const returnedHome = await transitionWithHorizontalInput({
    direction: 'left',
    targetArea: 'home-street',
    targetSpawnId: 'from-life',
    expectedExitId: 'life-to-home',
  });
  await fixtureGroundMeasurement('home-street', 'spawn-from-life', true);
  await capture('08-returned-home.png');

  await navigateToHorizontalEdge('home-street', 'right');
  const secondLife = await transitionWithHorizontalInput({
    direction: 'right',
    targetArea: 'life-road',
    targetSpawnId: 'from-home',
    expectedExitId: 'home-to-life',
  });
  await fixtureGroundMeasurement('life-road', 'spawn-from-home-repeat', true);
  assert(
    returnedHome.arrival.spawnId === 'from-life'
      && secondLife.arrival.spawnId === 'from-home',
    'Repeated horizontal traversal lost its sourceSpawnId mapping.',
  );
  await setMuted(false);

  const upMatrix = await capturePanelMatrix('up');
  const upper = await tapPanelAndTransition({
    direction: 'up',
    targetArea: 'upper-vending-lane',
    targetSpawnId: 'from-life',
    expectedExitId: 'life-to-upper',
  });
  await fixtureGroundMeasurement(
    'upper-vending-lane',
    'spawn-from-life',
    true,
  );
  await capture('10-upper-vending-lane.png');
  await capturePhaseMatrix('upper-vending-lane');
  await captureAreaPositions('upper-vending-lane');
  await captureGeometryDebug('upper-vending-lane');

  const downMatrix = await capturePanelMatrix('down');
  const lower = await tapPanelAndTransition({
    direction: 'down',
    targetArea: 'life-road',
    targetSpawnId: 'from-upper',
    expectedExitId: 'upper-to-life',
  });
  await fixtureGroundMeasurement('life-road', 'spawn-from-upper', true);
  assert(
    upper.arrival.spawnId === 'from-life'
      && lower.arrival.spawnId === 'from-upper',
    'Up/down round trip lost its sourceSpawnId mapping.',
  );

  await verifyVisibilityAndFreezeRecovery();
  const finalAudio = await audioDiagnostics();
  const snapshots = await hudTimeline();
  const candidateSnapshots = snapshots.filter((snapshot) => (
    M15_AREA_IDS.includes(snapshot.area)
  ));
  const groundMeasurements = [
    ...evidence.spawns,
    ...Object.values(evidence.areaPositions).flatMap((area) => (
      ['left', 'center', 'right']
        .map((position) => area[position])
        .filter(Boolean)
    )),
    ...evidence.panelMatrix.map(({ groundCss }) => groundCss),
  ];
  const groundInvariant = (
    groundMeasurements.length >= 27
    && groundMeasurements.every((measurement) => (
      measurement.cssDelta <= measurement.tolerance
      && measurement.playerGeometry.areaId === measurement.areaId
      && Math.abs(
        measurement.playerGeometry.playerWorldX
          - measurement.snapshot.playerX,
      ) <= 2
    ))
  );
  const worldGroundAuxiliaryInvariant = candidateSnapshots.every((snapshot) => (
    Math.abs(snapshot.playerY - getM15GeometryArea(snapshot.area).ground.y)
      <= M15_GEOMETRY_FIXTURE.tolerances.renderedFootToGroundCssPx
  ));
  const cameraBoundsInvariant = candidateSnapshots.every((snapshot) => (
    snapshot.cameraScrollX >= -1
    && snapshot.cameraScrollX <= snapshot.cameraMaxX + 1
  ));
  const transitionLocked = transitionChecks.every(({ locked }) => (
    locked.inputLocked === true
    && locked.transitionState !== 'idle'
    && locked.speed === 0
  ));
  const timePreserved = transitionChecks.every(({ departure, arrival }) => (
    Math.abs(departure.timeMinutes - arrival.timeMinutes) <= 2
  ));
  const mutePreserved = transitionChecks.every(({ departure, arrival }) => (
    departure.audioMuted === arrival.audioMuted
  ));
  const sourceSpawnIdPreserved = [
    [firstLife.arrival.area, firstLife.arrival.spawnId],
    [returnedHome.arrival.area, returnedHome.arrival.spawnId],
    [secondLife.arrival.area, secondLife.arrival.spawnId],
    [upper.arrival.area, upper.arrival.spawnId],
    [lower.arrival.area, lower.arrival.spawnId],
  ].map(([area, spawnId]) => `${area}/${spawnId}`);
  const expectedSpawnSequence = [
    'life-road/from-home',
    'home-street/from-life',
    'life-road/from-home',
    'upper-vending-lane/from-life',
    'life-road/from-upper',
  ];
  const phaseCoverage = M15_AREA_IDS.every((areaId) => (
    M15_TIME_PHASES.every((phase) => evidence.phaseMatrix[areaId]?.[phase])
  ));
  const positionCoverage = M15_AREA_IDS.every((areaId) => (
    ['left', 'center', 'right'].every(
      (position) => evidence.areaPositions[areaId]?.[position],
    )
  ));
  const debugGeometryCoverage = M15_AREA_IDS.every(
    (areaId) => evidence.debugGeometry[areaId]?.screenshot,
  );
  const panelCoverage = (
    evidence.panelMatrix.length === 12
    && evidence.panelMatrix.every(({ geometry }) => (
      geometry.playerIntersection === 0
      && geometry.playerDistance >= AREA_PANEL_MIN_PLAYER_GAP
      && geometry.panelRect.width >= AREA_PANEL_MIN_TOUCH_TARGET
      && geometry.panelRect.height >= AREA_PANEL_MIN_TOUCH_TARGET
      && geometry.obstacleMetrics.every(
        (metric) => metric.intersectionArea === 0,
      )
    ))
  );
  const areasVisited = new Set(
    candidateSnapshots.map((snapshot) => snapshot.area),
  );
  const m15AssetRequests = [...requestedUrls].filter((url) => (
    url.includes('/assets/images/m15/')
    || url.includes('/assets/audio/m15/')
  ));

  assert(groundInvariant, 'Fixture-backed foot-ground invariant failed.');
  assert(
    worldGroundAuxiliaryInvariant,
    'HUD timeline player ground invariant failed.',
  );
  assert(cameraBoundsInvariant, 'Camera escaped its area bounds.');
  assert(transitionLocked, 'Transition input lock invariant failed.');
  assert(timePreserved, 'Time changed across an area transition.');
  assert(mutePreserved, 'Mute changed across an area transition.');
  assert(
    sourceSpawnIdPreserved.length === expectedSpawnSequence.length
      && sourceSpawnIdPreserved.every(
        (entry, index) => entry === expectedSpawnSequence[index],
      ),
    `sourceSpawnId traversal sequence regressed: `
    + `${JSON.stringify(sourceSpawnIdPreserved)}.`,
  );
  assert(phaseCoverage, '3 area x 4 phase coverage is incomplete.');
  assert(positionCoverage, '3 area x left/center/right coverage is incomplete.');
  assert(debugGeometryCoverage, 'Three-area geometry debug coverage is incomplete.');
  assert(panelCoverage, '12-state DOM panel matrix failed.');
  assert(upMatrix.length === 6 && downMatrix.length === 6);
  assert(areasVisited.size === M15_AREA_IDS.length, 'Not all M1.5 areas were visited.');
  assert(m15AssetRequests.length > 0, 'No M1.5 assets were requested.');
  assert(
    m15AssetRequests.some((url) => url.includes('/assets/audio/m15/')),
    'The M1.5 BGM was not requested.',
  );
  assert(finalAudio.sourceId !== null, 'The BGM source was lost.');
  assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`);
  assert(
    failedRequests.length === 0,
    `Failed requests: ${failedRequests.join(' | ')}`,
  );

  const invariants = {
    groundInvariant,
    worldGroundAuxiliaryInvariant,
    groundMeasurementCount: groundMeasurements.length,
    cameraBoundsInvariant,
    transitionLocked,
    timePreserved,
    mutePreserved,
    sourceSpawnIdPreserved,
    expectedSpawnSequence,
    phaseCoverage,
    positionCoverage,
    debugGeometryCoverage,
    panelCoverage,
    panelStatesThisViewport: evidence.panelMatrix.length,
    requiredAggregatePanelStatesAcrossThreeViewports: 36,
    areasVisited: [...areasVisited],
    pageErrors: pageErrors.length,
    failedRequests: failedRequests.length,
  };
  record('invariants', invariants);
  statePayload = {
    schemaVersion: 1,
    revision: 'M1.5',
    baseUrl,
    expectedCommit,
    observedCommit,
    buildCommitDisplay: observedCommit.slice(0, 7),
    viewport,
    deviceScaleFactor,
    touchEnabled,
    traceEnabled,
    traceSuppressedForProtectedPreview:
      requestedTraceEnabled && !traceEnabled,
    browserHeadless,
    browserLifecycleLaunch,
    hostEnvironment,
    fontEnvironment,
    outputDir,
    previewAccess,
    runtime: {
      nodeVersion: process.version,
      browserVersion: browser.version(),
      browserExecutablePath,
      actualBrowserViewport,
      developerHudRect,
      initial,
      initialSpawn,
      finalAudio,
    },
    geometryFixture: {
      schemaVersion: M15_GEOMETRY_FIXTURE.schemaVersion,
      revision: M15_GEOMETRY_FIXTURE.revision,
      measuredAt: M15_GEOMETRY_FIXTURE.measuredAt,
      measurementMethod: M15_GEOMETRY_FIXTURE.measurementMethod,
      tolerances: M15_GEOMETRY_FIXTURE.tolerances,
      player: M15_GEOMETRY_FIXTURE.player,
      areas: Object.fromEntries(M15_AREA_IDS.map((areaId) => {
        const geometry = getM15GeometryArea(areaId);
        return [areaId, {
          ground: geometry.ground,
          spawns: geometry.spawns,
          branchEntrances: geometry.branchEntrances,
          assets: geometry.assets,
        }];
      })),
    },
    evidence,
    invariants,
    transitionCount: transitionChecks.length,
    hudSnapshotCount: candidateSnapshots.length,
    requestedM15Assets: m15AssetRequests,
    pageErrors,
    failedRequests,
  };
} catch (error) {
  failure = error;
  record('failure', error?.stack ?? String(error));
  await inputController?.cancel().catch(() => {});
  const lastHud = page ? await latestHud().catch(() => null) : null;
  const hudTail = page
    ? await hudTimeline().then((timeline) => timeline.slice(-16)).catch(() => [])
    : [];
  const audio = page ? await audioDiagnostics().catch(() => null) : null;
  statePayload = {
    schemaVersion: 1,
    revision: 'M1.5',
    baseUrl,
    expectedCommit,
    observedCommit,
    buildCommitDisplay: observedCommit.slice(0, 7),
    viewport,
    deviceScaleFactor,
    touchEnabled,
    traceEnabled,
    traceSuppressedForProtectedPreview:
      requestedTraceEnabled && !traceEnabled,
    browserHeadless,
    browserLifecycleLaunch,
    hostEnvironment,
    fontEnvironment,
    outputDir,
    previewAccess,
    evidence,
    transitionChecks,
    lastHud,
    hudTail,
    audio,
    pageErrors,
    failedRequests,
    failure: error?.stack ?? String(error),
  };
  if (page) await capture('failure.png').catch(() => {});
} finally {
  let traceFinalized = !tracingStarted;
  if (context && tracingStarted) {
    await context.tracing.stop({
      path: path.join(outputDir, 'trace.zip'),
    }).then(() => {
      traceFinalized = true;
    }).catch((error) => {
      failure ??= error;
      record('trace-error', error?.stack ?? String(error));
    });
  }
  let browserClosed = browser === undefined;
  if (browser) {
    await browser.close().then(() => {
      browserClosed = true;
    }).catch((error) => {
      failure ??= error;
      record('browser-close-error', error?.stack ?? String(error));
    });
  }
  const finalization = {
    browserClosed,
    traceFinalized,
    completedAt: new Date().toISOString(),
  };
  if (failure) {
    statePayload.status = 'failed';
    statePayload.failure ??= failure?.stack ?? String(failure);
  } else {
    statePayload.status = 'complete';
  }
  statePayload.finalization = finalization;
  record('finalization', {
    status: statePayload.status,
    ...finalization,
  });
  const runtimeLogPath = path.join(outputDir, 'runtime.log');
  const statePath = path.join(outputDir, 'state.json');
  fs.writeFileSync(runtimeLogPath, `${records.join('\n')}\n`);
  fs.writeFileSync(
    statePath,
    `${JSON.stringify(statePayload, null, 2)}\n`,
  );
  if (!failure) {
    fs.writeFileSync(
      path.join(outputDir, 'completion.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        status: 'complete',
        expectedCommit,
        observedCommit,
        browserClosed,
        traceFinalized,
        stateSha256: fileSha256(statePath),
        runtimeLogSha256: fileSha256(runtimeLogPath),
        completedAt: finalization.completedAt,
      }, null, 2)}\n`,
    );
  }
}

if (failure) throw failure;
