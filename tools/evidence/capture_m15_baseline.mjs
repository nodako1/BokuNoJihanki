import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  M15_CHROMIUM_X11_ARGS,
  M15_GOOGLE_CHROME_ELF_BYTES,
  M15_GOOGLE_CHROME_ELF_SHA256,
  M15_GOOGLE_CHROME_PACKAGE_VERSION,
  M15_GOOGLE_CHROME_VERSION,
  M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS,
  createM15BrowserLifecycleLaunch,
  readBrowserProcessIdentity,
} from '../../scripts/x11-tab-visibility.mjs';
import {
  resolveInstalledPlaywrightCoreRoot,
  verifyPlaywrightNativeVisibility,
} from '../../scripts/prepare-playwright-native-visibility.mjs';
import {
  M15_BASELINE_GEOMETRY_FIXTURE,
  getM15BaselineGeometryArea,
} from './m15BaselineGeometryFixture.mjs';
import { getM15GeometryArea } from '../../src/game/areas/m15GeometryFixture.mjs';

const EXACT_BASELINE = '29223ee31fd4fc4fbca21a37b01fe89277279647';
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const AREA_IDS = Object.freeze([
  'home-street',
  'life-road',
  'upper-vending-lane',
]);
const PHASE_TARGETS = Object.freeze([
  { phase: 'morning', minutes: 360, increments: 0 },
  { phase: 'day', minutes: 720, increments: 24 },
  { phase: 'evening', minutes: 990, increments: 18 },
  { phase: 'night', minutes: 1200, increments: 14 },
]);
const PANEL_AREAS = Object.freeze({
  up: 'life-road',
  down: 'upper-vending-lane',
});
const PANEL_LABELS = Object.freeze({
  up: '上のエリアへ移動',
  down: '下のエリアへ移動',
});
const HUD_SELECTORS = Object.freeze([
  '.game-date-chip',
  '.game-actions',
  '.developer-hud',
  '.dev-control-panel',
  '.virtual-joystick',
  '.control-hint',
  '.build-badge',
]);
const PLAYER_GAP_REQUIREMENT_CSS_PX = 12;
const TOUCH_TARGET_REQUIREMENT_CSS_PX = 44;
const FOOT_GROUND_REQUIREMENT_CSS_PX = 2;
const SPAWN_GROUND_REQUIREMENT_CSS_PX = 6;
const POSITION_TOLERANCE_WORLD_PX = 8;
const POSITIONING_METHOD = (
  'Measurement-only two-stage navigation uses real CDP keyboard/touch input. '
  + 'Distances over 32 world px stop at a direction-aware 32px lead; nearer '
  + 'moves pulse for one requestAnimationFrame (two only when rounded HUD X '
  + 'did not move). Each release dispatches baseline window blur to consume '
  + 'SideScrollInputSystem.hardStopPending; HUD speed=0/inputSource=none are '
  + 'observed before focus restoration. Recorded walk exercises use natural '
  + 'release/deceleration and never this helper.'
);

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveIntegerFromEnvironment(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
  return value;
}

function positiveNumberFromEnvironment(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }
  return value;
}

function booleanFromEnvironment(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  throw new RangeError(`${name} must be true or false.`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function gitOutput(root, ...arguments_) {
  return execFileSync('git', ['-C', root, ...arguments_], {
    encoding: 'utf8',
  }).trim();
}

function gitBlobSha1(bytes) {
  const digest = createHash('sha1');
  digest.update(`blob ${bytes.length}\0`);
  digest.update(bytes);
  return digest.digest('hex');
}

function safeFilename(value) {
  return value.replace(/[^a-z0-9_.-]+/gi, '-');
}

function plainRect(rect) {
  const left = Number(rect.left ?? rect.x);
  const top = Number(rect.top ?? rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function intersectionArea(first, second) {
  const width = Math.max(
    0,
    Math.min(first.right, second.right) - Math.max(first.left, second.left),
  );
  const height = Math.max(
    0,
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
  );
  return width * height;
}

function rectDistance(first, second) {
  if (intersectionArea(first, second) > 0) return 0;
  const horizontal = Math.max(
    0,
    first.left - second.right,
    second.left - first.right,
  );
  const vertical = Math.max(
    0,
    first.top - second.bottom,
    second.top - first.bottom,
  );
  return Math.hypot(horizontal, vertical);
}

function runtimeAreaSnapshot(area) {
  return {
    areaId: area.areaId,
    worldWidth: area.worldWidth,
    groundY: area.groundY,
    spawnPoints: area.spawnPoints,
    exits: Object.fromEntries(
      Object.entries(area.exits).map(([direction, exit]) => [
        direction,
        exit
          ? {
            id: exit.id,
            kind: exit.kind,
            enabled: exit.enabled,
            direction: exit.direction,
            trigger: exit.trigger,
            activationRange: exit.activationRange,
            target: exit.target,
          }
          : null,
      ]),
    ),
    assets: area.assets,
  };
}

function loadPlayerContract(baselineRoot) {
  const scenePath = path.join(
    baselineRoot,
    'src/game/scenes/SideScrollTownScene.ts',
  );
  const atlasPath = path.join(
    baselineRoot,
    'public/assets/images/m14/player-atlas.json',
  );
  const sceneSource = fs.readFileSync(scenePath, 'utf8');
  const atlasBytes = fs.readFileSync(atlasPath);
  const atlas = JSON.parse(atlasBytes.toString('utf8'));
  const scaleMatch = sceneSource.match(
    /const\s+PLAYER_SCALE\s*=\s*([0-9]+(?:\.[0-9]+)?);/,
  );
  const halfWidthMatch = sceneSource.match(
    /const\s+PLAYER_HALF_WIDTH\s*=\s*([0-9]+(?:\.[0-9]+)?);/,
  );
  const spriteMatch = sceneSource.match(new RegExp(
    String.raw`\.sprite\([\s\S]*?M14_PLAYER_ATLAS_KEY[\s\S]*?\)\s*`
      + String.raw`\.setOrigin\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)`
      + String.raw`\s*\.setScale\(\s*PLAYER_SCALE\s*\)`,
  ));
  assert(scaleMatch, 'Could not extract baseline PLAYER_SCALE.');
  assert(halfWidthMatch, 'Could not extract baseline PLAYER_HALF_WIDTH.');
  assert(spriteMatch, 'Could not extract baseline player origin.');

  const frameSizes = new Set(
    Object.values(atlas.frames).map(({ sourceSize }) => (
      `${sourceSize.w}x${sourceSize.h}`
    )),
  );
  assert.equal(
    frameSizes.size,
    1,
    'Baseline atlas frames do not share one source rectangle.',
  );
  const firstFrame = Object.values(atlas.frames)[0];
  return Object.freeze({
    atlasPath: 'public/assets/images/m14/player-atlas.json',
    atlasSha256: sha256(atlasBytes),
    scenePath: 'src/game/scenes/SideScrollTownScene.ts',
    sceneSha256: sha256(sceneSource),
    frameWidth: firstFrame.sourceSize.w,
    frameHeight: firstFrame.sourceSize.h,
    scale: Number(scaleMatch[1]),
    halfWidth: Number(halfWidthMatch[1]),
    originX: Number(spriteMatch[1]),
    originY: Number(spriteMatch[2]),
    frameCount: Object.keys(atlas.frames).length,
    derivation: (
      'Frame sourceSize from baseline atlas JSON; scale and origin parsed '
      + 'from the exact baseline SideScrollTownScene source.'
    ),
  });
}

async function loadBaselineContract(baselineRoot, expectedCommit) {
  assert.equal(expectedCommit, EXACT_BASELINE);
  assert.equal(M15_BASELINE_GEOMETRY_FIXTURE.baselineCommit, EXACT_BASELINE);
  assert(fs.statSync(baselineRoot).isDirectory(), 'BASELINE_ROOT is not a directory.');
  const sourceCommit = gitOutput(
    REPOSITORY_ROOT,
    'rev-parse',
    `${expectedCommit}^{commit}`,
  );
  assert.equal(
    sourceCommit,
    expectedCommit,
    'The capture repository does not contain EXPECTED_COMMIT.',
  );
  const verifiedTreeSha = gitOutput(
    REPOSITORY_ROOT,
    'rev-parse',
    `${expectedCommit}^{tree}`,
  );
  const treeBytes = execFileSync(
    'git',
    [
      '-C',
      REPOSITORY_ROOT,
      'ls-tree',
      '-rz',
      '--full-tree',
      expectedCommit,
    ],
  );
  const trackedEntries = treeBytes
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(
        /^([0-7]+) ([^ ]+) ([0-9a-f]{40})\t([\s\S]+)$/,
      );
      assert(match, `Could not parse baseline tree entry: ${entry}`);
      return {
        mode: match[1],
        type: match[2],
        objectSha: match[3],
        relativePath: match[4],
      };
    });
  let verifiedBytes = 0;
  for (const entry of trackedEntries) {
    assert.equal(
      entry.type,
      'blob',
      `Unsupported non-blob baseline tree entry: ${entry.relativePath}`,
    );
    const absolutePath = path.resolve(baselineRoot, entry.relativePath);
    assert(
      absolutePath.startsWith(`${baselineRoot}${path.sep}`),
      `Baseline path escapes BASELINE_ROOT: ${entry.relativePath}`,
    );
    const stats = fs.lstatSync(absolutePath);
    let content;
    if (entry.mode === '120000') {
      assert(stats.isSymbolicLink(), `${entry.relativePath} must be a symlink.`);
      content = Buffer.from(fs.readlinkSync(absolutePath));
    } else {
      assert(stats.isFile(), `${entry.relativePath} must be a regular file.`);
      content = fs.readFileSync(absolutePath);
      if (entry.mode === '100755') {
        assert(
          (stats.mode & 0o111) !== 0,
          `${entry.relativePath} lost its executable mode.`,
        );
      }
    }
    assert.equal(
      gitBlobSha1(content),
      entry.objectSha,
      `${entry.relativePath} does not match the exact baseline blob.`,
    );
    verifiedBytes += content.length;
  }

  const areaDataPath = path.join(
    baselineRoot,
    'src/game/areas/m14AreaData.mjs',
  );
  const areaModule = await import(
    `${pathToFileURL(areaDataPath).href}?evidence=${expectedCommit}`
  );
  assert.deepEqual(areaModule.M14_AREA_IDS, AREA_IDS);

  const assetBindings = [];
  for (const areaId of AREA_IDS) {
    const visualArea = getM15BaselineGeometryArea(areaId);
    for (const [phase, background] of Object.entries(visualArea.backgrounds)) {
      const relativePath = `public${background.path}`;
      const absolutePath = path.join(baselineRoot, relativePath);
      const actualSha256 = fileSha256(absolutePath);
      assert.equal(
        actualSha256,
        background.sha256,
        `${relativePath} does not match the visual fixture.`,
      );
      assert.equal(fs.statSync(absolutePath).size, background.bytes);
      assetBindings.push({
        areaId,
        phase,
        path: relativePath,
        sha256: actualSha256,
        bytes: background.bytes,
      });
    }
  }

  const areas = Object.fromEntries(
    AREA_IDS.map((areaId) => [
      areaId,
      areaModule.getM14AreaDefinition(areaId),
    ]),
  );
  return Object.freeze({
    sourceCommit,
    verifiedTreeSha,
    verifiedFileCount: trackedEntries.length,
    verifiedBytes,
    verificationMethod: (
      'All tracked entries from git ls-tree -rz were compared with '
      + 'BASELINE_ROOT using Git blob SHA-1; symlinks hash their link text. '
      + 'Untracked build/dependency extras are intentionally ignored.'
    ),
    areaDataPath: 'src/game/areas/m14AreaData.mjs',
    areaDataSha256: fileSha256(areaDataPath),
    initialLocation: areaModule.M14_INITIAL_LOCATION,
    areas,
    assetBindings,
    player: loadPlayerContract(baselineRoot),
  });
}

const baseUrl = requiredEnvironment('BASE_URL').replace(/\/$/, '');
const expectedCommit = requiredEnvironment('EXPECTED_COMMIT');
const baselineRoot = path.resolve(requiredEnvironment('BASELINE_ROOT'));
const browserArtifactRoot = path.resolve(
  requiredEnvironment('BROWSER_ARTIFACT_DIR'),
);
const browserExecutablePath =
  process.env.BROWSER_EXECUTABLE_PATH?.trim() || undefined;
assert(
  browserExecutablePath
    && path.isAbsolute(browserExecutablePath)
    && fs.statSync(browserExecutablePath).isFile(),
  'BROWSER_EXECUTABLE_PATH must identify the pinned Google Chrome ELF.',
);
const googleChromePackageVersion = requiredEnvironment(
  'M15_GOOGLE_CHROME_PACKAGE_VERSION',
);
assert.equal(
  googleChromePackageVersion,
  M15_GOOGLE_CHROME_PACKAGE_VERSION,
  'M15_GOOGLE_CHROME_PACKAGE_VERSION is not the pinned package.',
);
const browserExecutableSha256 = fileSha256(browserExecutablePath);
assert.equal(
  fs.statSync(browserExecutablePath).size,
  M15_GOOGLE_CHROME_ELF_BYTES,
  'The pinned Google Chrome ELF byte length is incorrect.',
);
assert.equal(
  requiredEnvironment('BROWSER_EXECUTABLE_SHA256'),
  M15_GOOGLE_CHROME_ELF_SHA256,
  'BROWSER_EXECUTABLE_SHA256 is not the pinned Google Chrome ELF hash.',
);
assert.equal(
  browserExecutableSha256,
  M15_GOOGLE_CHROME_ELF_SHA256,
  'The selected Google Chrome ELF SHA-256 is incorrect.',
);
const playwrightNativeVisibility = await verifyPlaywrightNativeVisibility({
  packageRoot: resolveInstalledPlaywrightCoreRoot(import.meta.url),
});
const browserLifecycleLaunch = createM15BrowserLifecycleLaunch(
  playwrightNativeVisibility,
);
const browserBinaryContract = Object.freeze({
  packageName: 'google-chrome-stable',
  packageVersion: googleChromePackageVersion,
  expectedBrowserVersion: M15_GOOGLE_CHROME_VERSION,
  executablePath: browserExecutablePath,
  executableBytes: M15_GOOGLE_CHROME_ELF_BYTES,
  executableSha256: browserExecutableSha256,
});
const viewport = Object.freeze({
  width: positiveIntegerFromEnvironment('BROWSER_VIEWPORT_WIDTH', 1280),
  height: positiveIntegerFromEnvironment('BROWSER_VIEWPORT_HEIGHT', 720),
});
const deviceScaleFactor = positiveNumberFromEnvironment(
  'BROWSER_DEVICE_SCALE_FACTOR',
  1,
);
const touchEnabled = booleanFromEnvironment('BROWSER_TOUCH', false);
const traceEnabled = booleanFromEnvironment('BROWSER_TRACE', true);
const browserHeadless = booleanFromEnvironment('BROWSER_HEADLESS', true);
const hostEnvironment = Object.freeze({
  runnerOsImage: requiredEnvironment('M15_RUNNER_OS_IMAGE'),
  platform: process.platform,
  architecture: process.arch,
});
const fontEnvironment = Object.freeze({
  japaneseFontMatch: requiredEnvironment('M15_JAPANESE_FONT_MATCH'),
  japaneseFontFile: requiredEnvironment('M15_JAPANESE_FONT_FILE'),
  japaneseFontPackageVersion: requiredEnvironment(
    'M15_JAPANESE_FONT_PACKAGE_VERSION',
  ),
  japaneseFontSha256: requiredEnvironment('M15_JAPANESE_FONT_SHA256'),
});
assert.equal(
  hostEnvironment.runnerOsImage,
  'ubuntu-24.04',
  'M15_RUNNER_OS_IMAGE must identify the pinned ubuntu-24.04 image.',
);
assert.equal(
  fontEnvironment.japaneseFontMatch,
  'Noto Sans CJK JP',
  'M15_JAPANESE_FONT_MATCH must resolve to Noto Sans CJK JP.',
);
assert.equal(
  path.isAbsolute(fontEnvironment.japaneseFontFile),
  true,
  'M15_JAPANESE_FONT_FILE must be an absolute path.',
);
assert.match(
  fontEnvironment.japaneseFontSha256,
  /^[0-9a-f]{64}$/,
  'M15_JAPANESE_FONT_SHA256 must be a complete SHA-256.',
);

fs.mkdirSync(browserArtifactRoot, { recursive: true });
const outputDirectory = fs.mkdtempSync(
  path.join(
    browserArtifactRoot,
    `baseline-${viewport.width}x${viewport.height}-dpr${deviceScaleFactor}-`,
  ),
);

const records = [];
const screenshots = [];
const pageErrors = [];
const failedRequests = [];
const requestedUrls = new Set();
const evidence = {
  measurementPositioning: {
    method: POSITIONING_METHOD,
    targetToleranceWorldPx: POSITION_TOLERANCE_WORLD_PX,
  },
  positions: {},
  phases: {},
  panelMatrix: [],
  transitions: [],
  groundMeasurements: [],
  spawnMeasurements: [],
  sameCoordinateComparisons: {},
};
const defects = [];
let baselineContract;
let browser;
let browserProcess;
let context;
let page;
let cdpSession;
let inputController;
let failure;
let captureComplete = false;
let tracingStarted = false;
let statePayload = {
  schemaVersion: 1,
  kind: 'M1.5-baseline-capture',
  expectedCommit,
  browserHeadless,
  traceEnabled,
  browserLifecycleLaunch,
  browserBinaryContract,
  hostEnvironment,
  fontEnvironment,
  outputDirectory,
};

function record(kind, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  records.push(`[${kind}] ${text}`);
  console.log(`[${kind}] ${text}`);
}

function runtimeArea(areaId) {
  const area = baselineContract?.areas[areaId];
  assert(area, `Unknown baseline runtime area: ${areaId}`);
  return area;
}

async function latestHud() {
  const snapshot = await page.evaluate(
    () => globalThis.__m15BaselineCapture?.lastHud ?? null,
  );
  assert(snapshot, 'Baseline HUD snapshot is unavailable.');
  return snapshot;
}

async function hudTimeline() {
  return page.evaluate(
    () => globalThis.__m15BaselineCapture?.hudSnapshots ?? [],
  );
}

async function waitForHud(criteria, timeout = 30_000) {
  await page.waitForFunction(
    (expected) => {
      const snapshot = globalThis.__m15BaselineCapture?.lastHud;
      if (!snapshot) return false;
      if (expected.area !== undefined && snapshot.area !== expected.area) return false;
      if (
        expected.transitionState !== undefined
        && snapshot.transitionState !== expected.transitionState
      ) return false;
      if (
        expected.notTransitionState !== undefined
        && snapshot.transitionState === expected.notTransitionState
      ) return false;
      if (
        expected.inputLocked !== undefined
        && snapshot.inputLocked !== expected.inputLocked
      ) return false;
      if (
        expected.branchVisible !== undefined
        && snapshot.branchVisible !== expected.branchVisible
      ) return false;
      if (
        expected.branchDirection !== undefined
        && snapshot.branchDirection !== expected.branchDirection
      ) return false;
      if (expected.spawnId !== undefined && snapshot.spawnId !== expected.spawnId) {
        return false;
      }
      if (expected.facing !== undefined && snapshot.facing !== expected.facing) {
        return false;
      }
      if (
        expected.animation !== undefined
        && snapshot.animation !== expected.animation
      ) return false;
      if (expected.minSpeed !== undefined && snapshot.speed < expected.minSpeed) {
        return false;
      }
      if (expected.maxSpeed !== undefined && snapshot.speed > expected.maxSpeed) {
        return false;
      }
      if (expected.minX !== undefined && snapshot.playerX < expected.minX) return false;
      if (expected.maxX !== undefined && snapshot.playerX > expected.maxX) return false;
      if (
        expected.timeMinutes !== undefined
        && Math.abs(snapshot.timeMinutes - expected.timeMinutes)
          > (expected.timeTolerance ?? 2)
      ) return false;
      if (
        expected.inputSource !== undefined
        && snapshot.inputSource !== expected.inputSource
      ) return false;
      return true;
    },
    criteria,
    { timeout, polling: 'raf' },
  );
  return latestHud();
}

async function waitForStableIdle(areaId, facing, timeout = 15_000) {
  await page.waitForFunction(
    ({ area, expectedFacing }) => {
      const snapshots =
        globalThis.__m15BaselineCapture?.hudSnapshots?.slice(-4) ?? [];
      if (snapshots.length < 4) return false;
      return snapshots.every((snapshot) => (
        snapshot.area === area
        && snapshot.transitionState === 'idle'
        && snapshot.inputLocked === false
        && snapshot.speed === 0
        && snapshot.facing === expectedFacing
        && snapshot.animation === `idle-${expectedFacing}`
        && snapshot.playerX === snapshots[0].playerX
      ));
    },
    { area: areaId, expectedFacing: facing },
    { timeout, polling: 'raf' },
  );
  return latestHud();
}

async function capture(filename) {
  const safe = safeFilename(filename);
  await page.screenshot({
    path: path.join(outputDirectory, safe),
    fullPage: true,
  });
  screenshots.push(safe);
  return safe;
}

async function activateLocator(locator) {
  await locator.waitFor({ state: 'visible' });
  if (!touchEnabled) {
    await locator.click();
    return;
  }
  const box = await locator.boundingBox();
  assert(box, 'Touch target has no rendered rectangle.');
  const point = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  await cdpSession.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...point, radiusX: 7, radiusY: 7, force: 1 }],
  });
  await cdpSession.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

function createInputController() {
  let touchActive = false;
  let keyboardDirection = null;

  function keyboardParameters(direction, type) {
    const right = direction === 'right';
    return {
      type,
      key: right ? 'ArrowRight' : 'ArrowLeft',
      code: right ? 'ArrowRight' : 'ArrowLeft',
      windowsVirtualKeyCode: right ? 39 : 37,
      nativeVirtualKeyCode: right ? 39 : 37,
    };
  }

  async function joystickPoint(direction) {
    const joystick = page.getByLabel('左右移動スティック', { exact: true });
    await joystick.waitFor({ state: 'visible' });
    const box = await joystick.boundingBox();
    assert(box, 'Touch joystick has no rendered rectangle.');
    const center = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
    const travel = Math.min(56, box.width * 0.38);
    return {
      center,
      target: {
        x: center.x + (direction === 'right' ? travel : -travel),
        y: center.y,
      },
    };
  }

  return {
    async start(direction) {
      if (!touchEnabled) {
        assert.equal(keyboardDirection, null, 'A keyboard input is already active.');
        await cdpSession.send(
          'Input.dispatchKeyEvent',
          keyboardParameters(direction, 'keyDown'),
        );
        keyboardDirection = direction;
        return;
      }
      assert.equal(touchActive, false, 'A joystick touch is already active.');
      const point = await joystickPoint(direction);
      await cdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{
          ...point.center,
          radiusX: 7,
          radiusY: 7,
          force: 1,
        }],
      });
      await cdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          ...point.target,
          radiusX: 7,
          radiusY: 7,
          force: 1,
        }],
      });
      touchActive = true;
    },

    async stop(direction) {
      if (!touchEnabled) {
        if (keyboardDirection === null) return;
        assert.equal(keyboardDirection, direction);
        await cdpSession.send(
          'Input.dispatchKeyEvent',
          keyboardParameters(direction, 'keyUp'),
        );
        keyboardDirection = null;
        return;
      }
      if (!touchActive) return;
      await cdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      touchActive = false;
    },

    async cancel() {
      if (!touchEnabled && keyboardDirection !== null) {
        const direction = keyboardDirection;
        await cdpSession.send(
          'Input.dispatchKeyEvent',
          keyboardParameters(direction, 'keyUp'),
        );
        keyboardDirection = null;
        return;
      }
      if (!touchActive) return;
      await cdpSession.send('Input.dispatchTouchEvent', {
        type: 'touchCancel',
        touchPoints: [],
      });
      touchActive = false;
    },
  };
}

async function canvasMetrics() {
  return page.locator('canvas').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      cssRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      objectFit: getComputedStyle(canvas).objectFit,
    };
  });
}

async function calculatePlayerGeometry(snapshot, visualGroundY) {
  const canvas = await canvasMetrics();
  const scaleX = canvas.cssRect.width / canvas.backingWidth;
  const scaleY = canvas.cssRect.height / canvas.backingHeight;
  const player = baselineContract.player;
  const spriteWidthWorld = player.frameWidth * player.scale;
  const spriteHeightWorld = player.frameHeight * player.scale;
  const playerScreenWorldX = snapshot.playerX - snapshot.cameraScrollX;
  const playerScreenWorldY = snapshot.playerY;
  const worldRect = {
    left: playerScreenWorldX - spriteWidthWorld * player.originX,
    top: playerScreenWorldY - spriteHeightWorld * player.originY,
    width: spriteWidthWorld,
    height: spriteHeightWorld,
  };
  const cssRect = plainRect({
    left: canvas.cssRect.left + worldRect.left * scaleX,
    top: canvas.cssRect.top + worldRect.top * scaleY,
    width: worldRect.width * scaleX,
    height: worldRect.height * scaleY,
  });
  const foot = {
    worldX: snapshot.playerX,
    worldY: snapshot.playerY,
    cssX: canvas.cssRect.left + playerScreenWorldX * scaleX,
    cssY: canvas.cssRect.top + playerScreenWorldY * scaleY,
  };
  const visualGroundCssY = canvas.cssRect.top + visualGroundY * scaleY;
  return {
    derivation: baselineContract.player.derivation,
    atlasFrame: {
      width: player.frameWidth,
      height: player.frameHeight,
      scale: player.scale,
      originX: player.originX,
      originY: player.originY,
    },
    canvas: {
      ...canvas,
      scaleX,
      scaleY,
      renderMapping: (
        'Baseline CSS forces canvas width and height to 100%; X and Y are '
        + 'mapped independently from the 1280x720 backing store.'
      ),
    },
    worldRect: {
      ...worldRect,
      right: worldRect.left + worldRect.width,
      bottom: worldRect.top + worldRect.height,
    },
    cssRect,
    foot,
    visualGroundY,
    visualGroundCssY,
    signedFootGroundWorldDelta: foot.worldY - visualGroundY,
    signedFootGroundCssDelta: foot.cssY - visualGroundCssY,
    absoluteFootGroundCssDelta: Math.abs(foot.cssY - visualGroundCssY),
  };
}

function visualSample(areaId, position, x) {
  const samples = getM15BaselineGeometryArea(areaId).visualGround.samples;
  if (position) {
    const exact = samples.find((sample) => sample.position === position);
    assert(exact, `Missing visual ${areaId}/${position} sample.`);
    return exact;
  }
  return samples.reduce((nearest, sample) => (
    Math.abs(sample.x - x) < Math.abs(nearest.x - x) ? sample : nearest
  ));
}

async function measureGround(areaId, position, { spawn = false } = {}) {
  const snapshot = await latestHud();
  assert.equal(snapshot.area, areaId);
  const sample = visualSample(
    areaId,
    spawn ? null : position,
    snapshot.playerX,
  );
  const playerGeometry = await calculatePlayerGeometry(snapshot, sample.y);
  const measurement = {
    areaId,
    position,
    spawn,
    independentVisualSample: sample,
    runtimeGroundY: runtimeArea(areaId).groundY,
    runtimeSnapshot: snapshot,
    playerGeometry,
    requirementCssPx: spawn
      ? SPAWN_GROUND_REQUIREMENT_CSS_PX
      : FOOT_GROUND_REQUIREMENT_CSS_PX,
    withinRequirement: (
      playerGeometry.absoluteFootGroundCssDelta
      <= (spawn ? SPAWN_GROUND_REQUIREMENT_CSS_PX : FOOT_GROUND_REQUIREMENT_CSS_PX)
    ),
  };
  if (spawn) evidence.spawnMeasurements.push(measurement);
  else evidence.groundMeasurements.push(measurement);
  if (!measurement.withinRequirement) {
    defects.push({
      kind: spawn ? 'spawn-ground-misalignment' : 'foot-ground-misalignment',
      areaId,
      position,
      independentVisualGroundY: sample.y,
      runtimeFootY: snapshot.playerY,
      signedWorldDelta: playerGeometry.signedFootGroundWorldDelta,
      signedCssDelta: playerGeometry.signedFootGroundCssDelta,
      limitCssPx: measurement.requirementCssPx,
    });
  }
  return measurement;
}

async function hardStopMeasurementNavigation(areaId, facing) {
  await cdpSession.send('Runtime.evaluate', {
    expression: "window.dispatchEvent(new Event('blur'))",
  });
  let stopped;
  try {
    stopped = await waitForHud({
      area: areaId,
      facing,
      maxSpeed: 0,
      inputSource: 'none',
    }, 5000);
  } finally {
    await cdpSession.send('Runtime.evaluate', {
      expression: "window.dispatchEvent(new Event('focus'))",
    });
  }
  return { stoppedSnapshot: stopped };
}

async function waitForAnimationFrames(count) {
  assert(count === 1 || count === 2);
  const expression = `new Promise((resolve) => {
    let remaining = ${count};
    const advance = () => {
      remaining -= 1;
      if (remaining === 0) resolve(true);
      else requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
  })`;
  const result = await cdpSession.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.equal(result.exceptionDetails, undefined);
}

async function moveToX(areaId, targetX, tolerance = POSITION_TOLERANCE_WORLD_PX) {
  const area = runtimeArea(areaId);
  assert(targetX >= 0 && targetX <= area.worldWidth);
  let fineFrames = 1;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const current = await latestHud();
    assert.equal(current.area, areaId);
    const delta = targetX - current.playerX;
    if (Math.abs(delta) <= tolerance) {
      return waitForStableIdle(areaId, current.facing);
    }
    const direction = delta > 0 ? 'right' : 'left';
    const coarse = Math.abs(delta) > 32;
    let crossingSnapshot = null;
    let stopResult;
    await inputController.start(direction);
    try {
      if (coarse) {
        crossingSnapshot = await waitForHud(
          direction === 'right'
            ? {
              area: areaId,
              facing: direction,
              minSpeed: 30,
              minX: targetX - 32,
            }
            : {
              area: areaId,
              facing: direction,
              minSpeed: 30,
              maxX: targetX + 32,
            },
          45_000,
        );
      } else {
        await waitForAnimationFrames(fineFrames);
      }
    } finally {
      await inputController.stop(direction);
      stopResult = await hardStopMeasurementNavigation(areaId, direction);
    }
    const stopped = stopResult.stoppedSnapshot;
    record('measurement-position-step', {
      areaId,
      targetX,
      tolerance,
      attempt,
      stage: coarse ? 'coarse' : 'fine',
      animationFrames: coarse ? null : fineFrames,
      startX: current.playerX,
      crossingX: crossingSnapshot?.playerX ?? null,
      stoppedX: stopped.playerX,
      facing: direction,
    });
    fineFrames = (
      !coarse && stopped.playerX === current.playerX ? 2 : 1
    );
  }
  const final = await latestHud();
  throw new Error(
    `Could not settle ${areaId} at ${targetX}±${tolerance}; got ${final.playerX}.`,
  );
}

async function setFacingAtX(areaId, targetX, facing) {
  const preparedX = Math.max(
    40,
    Math.min(
      runtimeArea(areaId).worldWidth - 40,
      targetX + (facing === 'right' ? -48 : 48),
    ),
  );
  await moveToX(areaId, preparedX);
  return moveToX(areaId, targetX);
}

async function exerciseWalk(areaId, direction, screenshotName) {
  const before = await latestHud();
  await inputController.start(direction);
  let during;
  try {
    during = await waitForHud({
      area: areaId,
      facing: direction,
      animation: `walk-${direction}`,
      minSpeed: 35,
      inputSource: touchEnabled ? 'touch' : 'keyboard',
    });
    await capture(screenshotName);
  } finally {
    await inputController.stop(direction);
  }
  const stopped = await waitForStableIdle(areaId, direction);
  return {
    before,
    during,
    stopped,
    movedWorldPx: during.playerX - before.playerX,
    usedRealTouchJoystick: touchEnabled,
  };
}

async function captureAreaPositions(areaId) {
  const results = {};
  for (const sample of getM15BaselineGeometryArea(areaId).visualGround.samples) {
    await moveToX(areaId, sample.x);
    const measurement = await measureGround(areaId, sample.position);
    const screenshot = await capture(
      `ground-${areaId}-${sample.position}.png`,
    );
    results[sample.position] = { measurement, screenshot };
    if (sample.position === 'center') {
      results.walkRight = await exerciseWalk(
        areaId,
        'right',
        `walk-${areaId}-right.png`,
      );
      await moveToX(areaId, sample.x);
      results.walkLeft = await exerciseWalk(
        areaId,
        'left',
        `walk-${areaId}-left.png`,
      );
      await moveToX(areaId, sample.x);
      results.stopped = await waitForStableIdle(areaId, 'right').catch(
        () => latestHud(),
      );
    }
  }
  evidence.positions[areaId] = results;
}

async function openDeveloperDrawer() {
  const drawer = page.locator('details.dev-tool-drawer');
  const open = await drawer.evaluate((element) => element.open);
  if (!open) {
    await activateLocator(drawer.locator('summary'));
    await page.waitForFunction(
      () => document.querySelector('details.dev-tool-drawer')?.open === true,
    );
  }
  return drawer;
}

async function closeDeveloperDrawer() {
  const drawer = page.locator('details.dev-tool-drawer');
  if (await drawer.evaluate((element) => element.open)) {
    await activateLocator(drawer.locator('summary'));
    await page.waitForFunction(
      () => document.querySelector('details.dev-tool-drawer')?.open === false,
    );
  }
}

async function activateDeveloperControl(label, count = 1) {
  await page.evaluate(
    ({ expectedLabel, times }) => {
      const button = [...document.querySelectorAll('.dev-control-panel button')]
        .find((candidate) => candidate.textContent?.trim() === expectedLabel);
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Missing developer control: ${expectedLabel}`);
      }
      for (let index = 0; index < times; index += 1) button.click();
    },
    { expectedLabel: label, times: count },
  );
}

async function capturePhaseMatrix(areaId) {
  const results = {};
  await openDeveloperDrawer();
  await activateDeveloperControl('朝へ戻す');
  for (const target of PHASE_TARGETS) {
    if (target.increments > 0) {
      await activateDeveloperControl('＋15分', target.increments);
    }
    const snapshot = await waitForHud({
      area: areaId,
      timeMinutes: target.minutes,
      timeTolerance: 1,
    });
    await closeDeveloperDrawer();
    const screenshot = await capture(`phase-${areaId}-${target.phase}.png`);
    const visualBackground =
      getM15BaselineGeometryArea(areaId).backgrounds[target.phase];
    results[target.phase] = {
      minutes: target.minutes,
      screenshot,
      snapshot,
      visualBackground,
    };
    if (target.phase !== 'night') await openDeveloperDrawer();
  }
  await openDeveloperDrawer();
  await activateDeveloperControl('朝へ戻す');
  await waitForHud({ area: areaId, timeMinutes: 360, timeTolerance: 1 });
  await closeDeveloperDrawer();
  evidence.phases[areaId] = results;
}

async function waitForPanel(direction) {
  const label = PANEL_LABELS[direction];
  const button = page.getByRole('button', { name: label, exact: true });
  await button.waitFor({ state: 'visible' });
  await page.waitForFunction(
    (ariaLabel) => {
      const candidate = [...document.querySelectorAll('button')]
        .find((element) => element.getAttribute('aria-label') === ariaLabel);
      if (!(candidate instanceof HTMLButtonElement)) return false;
      const rect = candidate.getBoundingClientRect();
      const signature = [
        rect.left.toFixed(2),
        rect.top.toFixed(2),
        rect.width.toFixed(2),
        rect.height.toFixed(2),
      ].join(':');
      const previous = candidate.dataset.baselineEvidenceRect;
      const count = Number(candidate.dataset.baselineEvidenceStable ?? 0);
      candidate.dataset.baselineEvidenceRect = signature;
      candidate.dataset.baselineEvidenceStable =
        previous === signature ? String(count + 1) : '0';
      return Number(candidate.dataset.baselineEvidenceStable) >= 3;
    },
    label,
    { timeout: 5000, polling: 'raf' },
  );
  return button;
}

async function readPanelGeometry(direction) {
  const snapshot = await latestHud();
  const visual = visualSample(snapshot.area, null, snapshot.playerX);
  const playerGeometry = await calculatePlayerGeometry(snapshot, visual.y);
  const dom = await page.evaluate(
    ({ label, selectors }) => {
      const button = [...document.querySelectorAll('button')]
        .find((element) => element.getAttribute('aria-label') === label);
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Panel ${label} is not rendered.`);
      }
      const panelRect = button.getBoundingClientRect();
      const obstacles = [];
      const seen = new Set();
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          if (!(element instanceof HTMLElement) || seen.has(element)) continue;
          if (element === button || element.contains(button)) continue;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (
            rect.width <= 0
            || rect.height <= 0
            || style.display === 'none'
            || style.visibility === 'hidden'
            || Number(style.opacity) === 0
          ) continue;
          seen.add(element);
          obstacles.push({
            selector,
            identity: (
              element.getAttribute('aria-label')
              || element.classList.item(0)
              || element.tagName
            ),
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      }
      return {
        panelRect: {
          left: panelRect.left,
          top: panelRect.top,
          width: panelRect.width,
          height: panelRect.height,
        },
        obstacles,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          devicePixelRatio,
        },
      };
    },
    { label: PANEL_LABELS[direction], selectors: HUD_SELECTORS },
  );
  const panelRect = plainRect(dom.panelRect);
  const playerRect = playerGeometry.cssRect;
  const obstacleMetrics = dom.obstacles.map((obstacle) => {
    const rectangle = plainRect(obstacle.rect);
    return {
      ...obstacle,
      rect: rectangle,
      intersectionArea: intersectionArea(panelRect, rectangle),
      distance: rectDistance(panelRect, rectangle),
    };
  });
  return {
    ...dom,
    panelRect,
    playerRect,
    playerGeometry,
    playerIntersectionArea: intersectionArea(panelRect, playerRect),
    playerDistance: rectDistance(panelRect, playerRect),
    obstacleMetrics,
    touchTargetPass: (
      panelRect.width >= TOUCH_TARGET_REQUIREMENT_CSS_PX
      && panelRect.height >= TOUCH_TARGET_REQUIREMENT_CSS_PX
    ),
  };
}

async function capturePanelMatrix(direction) {
  const areaId = PANEL_AREAS[direction];
  const exit = runtimeArea(areaId).exits[direction];
  assert(exit?.enabled && exit.trigger === 'branch');
  const trigger = exit.activationRange;
  const samples = [
    { name: 'start', boundaryX: trigger.minX, targetX: trigger.minX + 12 },
    {
      name: 'center',
      boundaryX: (trigger.minX + trigger.maxX) / 2,
      targetX: (trigger.minX + trigger.maxX) / 2,
    },
    { name: 'end', boundaryX: trigger.maxX, targetX: trigger.maxX - 12 },
  ];
  const results = [];
  for (const sample of samples) {
    for (const facing of ['left', 'right']) {
      const position = await setFacingAtX(areaId, sample.targetX, facing);
      const prompt = await waitForHud({
        area: areaId,
        branchVisible: true,
        branchDirection: direction,
        facing,
        maxSpeed: 0,
      });
      await waitForPanel(direction);
      const geometry = await readPanelGeometry(direction);
      const screenshot = await capture(
        `panel-${direction}-${sample.name}-${facing}.png`,
      );
      const quality = {
        playerIntersectionZero: geometry.playerIntersectionArea === 0,
        playerGapAtLeast12: (
          geometry.playerDistance >= PLAYER_GAP_REQUIREMENT_CSS_PX
        ),
        touchTargetAtLeast44: geometry.touchTargetPass,
        hudIntersectionZero: geometry.obstacleMetrics.every(
          ({ intersectionArea: area }) => area === 0,
        ),
      };
      if (!Object.values(quality).every(Boolean)) {
        defects.push({
          kind: 'transition-panel-collision-or-spacing',
          areaId,
          direction,
          sample: sample.name,
          facing,
          quality,
          playerIntersectionArea: geometry.playerIntersectionArea,
          playerDistance: geometry.playerDistance,
          panelRect: geometry.panelRect,
          playerRect: geometry.playerRect,
          hudIntersections: geometry.obstacleMetrics.filter(
            ({ intersectionArea: area }) => area > 0,
          ),
        });
      }
      const result = {
        viewport,
        deviceScaleFactor,
        touchEnabled,
        usedRealTouchJoystick: touchEnabled,
        areaId,
        direction,
        trigger,
        triggerSample: sample,
        actualPlayerX: position.playerX,
        facing,
        prompt,
        geometry,
        quality,
        screenshot,
      };
      evidence.panelMatrix.push(result);
      results.push(result);
    }
  }
  return results;
}

async function horizontalTransition({
  areaId,
  direction,
  targetArea,
  targetSpawn,
  exitId,
}) {
  const exit = runtimeArea(areaId).exits[direction];
  const trigger = exit.activationRange;
  const approachMargin = baselineContract.player.halfWidth + 24;
  const approachX = direction === 'right'
    ? trigger.minX - approachMargin
    : trigger.maxX + approachMargin;
  const staged = await moveToX(areaId, approachX);
  assert.equal(staged.area, areaId, 'Area changed during transition staging.');
  const playerEdgeX = direction === 'right'
    ? staged.playerX + baselineContract.player.halfWidth
    : staged.playerX - baselineContract.player.halfWidth;
  const stagedGap = direction === 'right'
    ? trigger.minX - playerEdgeX
    : playerEdgeX - trigger.maxX;
  assert(
    stagedGap >= 16,
    `Transition staging gap must be at least 16px; got ${stagedGap}.`,
  );
  const departure = await latestHud();
  const transitionSequence = evidence.transitions.length + 1;
  await inputController.start(direction);
  let locked;
  let screenshot;
  try {
    locked = await waitForHud({
      area: areaId,
      notTransitionState: 'idle',
      inputLocked: true,
    });
    screenshot = await capture(
      `transition-${String(transitionSequence).padStart(2, '0')}-${exitId}-locked.png`,
    );
  } finally {
    await inputController.stop(direction);
  }
  const arrival = await waitForHud({
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    spawnId: targetSpawn,
  });
  const spawn = await measureGround(
    targetArea,
    `spawn-${targetSpawn}`,
    { spawn: true },
  );
  const result = {
    type: 'horizontal',
    usedRealTouchJoystick: touchEnabled,
    transitionSequence,
    exitId,
    staging: {
      approachX,
      approachMargin,
      playerHalfWidth: baselineContract.player.halfWidth,
      staged,
      playerEdgeX,
      stagedGap,
    },
    departure,
    locked,
    arrival,
    spawn,
    screenshot,
  };
  assert.equal(arrival.lastTransitionId, exitId);
  evidence.transitions.push(result);
  return result;
}

async function panelTransition({
  direction,
  targetArea,
  targetSpawn,
  exitId,
}) {
  const departure = await latestHud();
  const transitionSequence = evidence.transitions.length + 1;
  const button = await waitForPanel(direction);
  await activateLocator(button);
  const locked = await waitForHud({
    area: departure.area,
    notTransitionState: 'idle',
    inputLocked: true,
  });
  const screenshot = await capture(
    `transition-${String(transitionSequence).padStart(2, '0')}-${exitId}-locked.png`,
  );
  const arrival = await waitForHud({
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    spawnId: targetSpawn,
  });
  const spawn = await measureGround(
    targetArea,
    `spawn-${targetSpawn}`,
    { spawn: true },
  );
  const result = {
    type: 'panel',
    direction,
    usedRealTouchTap: touchEnabled,
    transitionSequence,
    exitId,
    departure,
    locked,
    arrival,
    spawn,
    screenshot,
  };
  assert.equal(arrival.lastTransitionId, exitId);
  evidence.transitions.push(result);
  return result;
}

function addAuthoredRouteDefects() {
  const lifeVisual =
    getM15BaselineGeometryArea('life-road').paintedUphillEntrance;
  const lifeRuntime = runtimeArea('life-road').exits.up.activationRange;
  const runtimeCenter = (lifeRuntime.minX + lifeRuntime.maxX) / 2;
  const centerDelta = runtimeCenter - lifeVisual.mouth.centerX;
  defects.push({
    kind: 'painted-entrance-trigger-misalignment',
    areaId: 'life-road',
    direction: 'up',
    independentPaintedMouth: lifeVisual.mouth,
    runtimeTrigger: lifeRuntime,
    runtimeTriggerCenterX: runtimeCenter,
    signedCenterDeltaWorldPx: centerDelta,
    absoluteCenterDeltaWorldPx: Math.abs(centerDelta),
    candidateRequirementPx: 5,
  });

  const upperVisual =
    getM15BaselineGeometryArea('upper-vending-lane').paintedDownwardEntrance;
  const upperRuntime = runtimeArea('upper-vending-lane').exits.down.activationRange;
  defects.push({
    kind: 'runtime-trigger-without-painted-route',
    areaId: 'upper-vending-lane',
    direction: 'down',
    visualAnnotation: upperVisual,
    runtimeTrigger: upperRuntime,
    qualityPass: false,
  });
}

function verifyFixtureCoordinateParity() {
  return Object.fromEntries(AREA_IDS.map((areaId) => {
    const baselineSamples =
      getM15BaselineGeometryArea(areaId).visualGround.samples;
    const candidateSamples = getM15GeometryArea(areaId).ground.samples;
    assert.deepEqual(
      baselineSamples.map(({ position, x }) => ({ position, x })),
      candidateSamples.map(({ position, x }) => ({ position, x })),
      `${areaId} left/center/right world X coordinates differ between fixtures.`,
    );
    return [areaId, {
      xCoordinatesMatch: true,
      baselineSamples,
      candidateSamples,
    }];
  }));
}

async function captureCandidateEntranceCoordinate(direction) {
  const areaId = PANEL_AREAS[direction];
  const candidateEntrance =
    getM15GeometryArea(areaId).branchEntrances[direction];
  const targetX = candidateEntrance.backgroundCenterX;
  const settled = await moveToX(areaId, targetX);
  const snapshot = await waitForStableIdle(areaId, settled.facing);
  const prompt = await page.evaluate(
    () => globalThis.__m15BaselineCapture?.lastPrompt ?? null,
  );
  const screenshot = await capture(
    `same-coordinate-${areaId}-${direction}-candidate-entrance-center.png`,
  );
  const result = {
    areaId,
    direction,
    coordinateSource: (
      'getM15GeometryArea(areaId).branchEntrances[direction].backgroundCenterX'
    ),
    candidateEntrance,
    requestedWorldX: targetX,
    actualBaselinePlayerX: snapshot.playerX,
    baselinePrompt: {
      hudBranchVisible: snapshot.branchVisible,
      hudBranchDirection: snapshot.branchDirection,
      publishedPrompt: prompt,
    },
    screenshot,
  };
  evidence.sameCoordinateComparisons[direction] = result;
  return result;
}

try {
  baselineContract = await loadBaselineContract(baselineRoot, expectedCommit);
  addAuthoredRouteDefects();
  const fixtureCoordinateParity = verifyFixtureCoordinateParity();
  browser = await chromium.launch({
    headless: browserHeadless,
    executablePath: browserExecutablePath,
    ignoreDefaultArgs: [
      ...M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS,
    ],
    args: [...M15_CHROMIUM_X11_ARGS],
  });
  assert.equal(
    browser.version(),
    M15_GOOGLE_CHROME_VERSION,
    'Google Chrome runtime version does not match the pinned browser.',
  );
  const browserCdpSession = await browser.newBrowserCDPSession();
  browserProcess = await readBrowserProcessIdentity(browserCdpSession);
  assert.equal(
    browserProcess.executablePath,
    browserExecutablePath,
    'The CDP browser PID is not running the pinned Google Chrome ELF.',
  );
  assert.equal(
    browserProcess.executableBytes,
    M15_GOOGLE_CHROME_ELF_BYTES,
    'The running Chrome ELF byte length differs from the pinned executable.',
  );
  assert.equal(
    browserProcess.executableSha256,
    browserExecutableSha256,
    'The running Chrome ELF hash differs from the pinned executable.',
  );
  context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    hasTouch: touchEnabled,
    isMobile: touchEnabled,
    locale: 'ja-JP',
  });
  await context.addInitScript(() => {
    const state = {
      lastHud: null,
      hudSnapshots: [],
      prompts: [],
      lastPrompt: null,
    };
    Object.defineProperty(globalThis, '__m15BaselineCapture', {
      configurable: true,
      value: state,
    });
    addEventListener('boku-no-jihanki:hud-snapshot', (event) => {
      const snapshot = { ...event.detail, capturedAt: performance.now() };
      state.lastHud = snapshot;
      state.hudSnapshots.push(snapshot);
      if (state.hudSnapshots.length > 2400) state.hudSnapshots.shift();
    });
    addEventListener('boku-no-jihanki:area-prompt', (event) => {
      const snapshot = { ...event.detail, capturedAt: performance.now() };
      state.lastPrompt = snapshot;
      state.prompts.push(snapshot);
      if (state.prompts.length > 400) state.prompts.shift();
    });
  });
  if (traceEnabled) {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: false,
    });
    tracingStarted = true;
  }
  page = await context.newPage();
  cdpSession = await context.newCDPSession(page);
  inputController = createInputController();

  page.on('console', (message) => {
    record(`console:${message.type()}`, message.text());
  });
  page.on('pageerror', (error) => {
    const detail = error.stack ?? error.message;
    pageErrors.push(detail);
    record('pageerror', detail);
  });
  page.on('request', (request) => requestedUrls.add(request.url()));
  page.on('requestfailed', (request) => {
    const detail = {
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown',
    };
    failedRequests.push(detail);
    record('requestfailed', detail);
  });

  const response = await page.goto(
    `${baseUrl}/?m15-baseline-evidence=${Date.now()}`,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  assert(response && response.status() < 400, 'Baseline page did not load.');
  const bodyText = await page.locator('body').innerText();
  assert(
    bodyText.includes(expectedCommit.slice(0, 7)),
    'Rendered build badge does not match EXPECTED_COMMIT.',
  );
  record('baseline', {
    baseUrl,
    expectedCommit,
    baselineRoot,
    viewport,
    deviceScaleFactor,
    touchEnabled,
    browserVersion: browser.version(),
    nodeVersion: process.version,
    outputDirectory,
  });

  await capture('title.png');
  await activateLocator(
    page.getByRole('button', { name: '夏休みを始める', exact: true }),
  );
  const initial = await waitForHud({
    area: 'home-street',
    transitionState: 'idle',
    inputLocked: false,
    spawnId: 'start',
    timeMinutes: 360,
  });
  assert.equal(await page.locator('canvas').count(), 1);
  const initialSpawn = await measureGround(
    'home-street',
    'spawn-start',
    { spawn: true },
  );

  await capturePhaseMatrix('home-street');
  await captureAreaPositions('home-street');
  const homeToLife = await horizontalTransition({
    areaId: 'home-street',
    direction: 'right',
    targetArea: 'life-road',
    targetSpawn: 'from-home',
    exitId: 'home-to-life',
  });

  await capturePhaseMatrix('life-road');
  await captureAreaPositions('life-road');
  await captureCandidateEntranceCoordinate('up');
  const lifeToHome = await horizontalTransition({
    areaId: 'life-road',
    direction: 'left',
    targetArea: 'home-street',
    targetSpawn: 'from-life',
    exitId: 'life-to-home',
  });
  const homeToLifeAgain = await horizontalTransition({
    areaId: 'home-street',
    direction: 'right',
    targetArea: 'life-road',
    targetSpawn: 'from-home',
    exitId: 'home-to-life',
  });

  const upPanelStates = await capturePanelMatrix('up');
  const lifeToUpper = await panelTransition({
    direction: 'up',
    targetArea: 'upper-vending-lane',
    targetSpawn: 'from-life',
    exitId: 'life-to-upper',
  });

  await capturePhaseMatrix('upper-vending-lane');
  await captureAreaPositions('upper-vending-lane');
  await captureCandidateEntranceCoordinate('down');
  const downPanelStates = await capturePanelMatrix('down');
  const upperToLife = await panelTransition({
    direction: 'down',
    targetArea: 'life-road',
    targetSpawn: 'from-upper',
    exitId: 'upper-to-life',
  });

  const sourceSpawnSequence = [
    homeToLife,
    lifeToHome,
    homeToLifeAgain,
    lifeToUpper,
    upperToLife,
  ].map(({ arrival }) => `${arrival.area}/${arrival.spawnId}`);
  assert.deepEqual(sourceSpawnSequence, [
    'life-road/from-home',
    'home-street/from-life',
    'life-road/from-home',
    'upper-vending-lane/from-life',
    'life-road/from-upper',
  ]);
  assert.equal(upPanelStates.length, 6);
  assert.equal(downPanelStates.length, 6);
  assert.equal(evidence.panelMatrix.length, 12);
  assert(
    AREA_IDS.every((areaId) => (
      ['left', 'center', 'right'].every(
        (position) => evidence.positions[areaId]?.[position],
      )
    )),
    'Baseline position capture is incomplete.',
  );
  assert(
    AREA_IDS.every((areaId) => (
      PHASE_TARGETS.every(({ phase }) => evidence.phases[areaId]?.[phase])
    )),
    'Baseline 3-area x 4-phase capture is incomplete.',
  );
  assert.equal(pageErrors.length, 0, `Baseline page errors: ${pageErrors.join(' | ')}`);
  assert.equal(
    failedRequests.length,
    0,
    `Baseline failed requests: ${JSON.stringify(failedRequests)}`,
  );

  const snapshots = await hudTimeline();
  const promptTimeline = await page.evaluate(
    () => globalThis.__m15BaselineCapture?.prompts ?? [],
  );
  captureComplete = true;
  statePayload = {
    schemaVersion: 1,
    kind: 'M1.5-baseline-capture',
    revision: 'M1.4-baseline-for-M1.5-comparison',
    captureStatus: 'complete',
    baseUrl,
    expectedCommit,
    observedCommit: baselineContract.sourceCommit,
    viewport,
    deviceScaleFactor,
    touchEnabled,
    browserHeadless,
    traceEnabled,
    browserLifecycleLaunch,
    browserBinaryContract,
    hostEnvironment,
    fontEnvironment,
    inputEvidence: {
      horizontalMovement: touchEnabled
        ? 'CDP real touch joystick drag'
        : 'CDP real keyboard input',
      panelActivation: touchEnabled ? 'CDP real touch tap' : 'mouse click',
      measurementPositioning: POSITIONING_METHOD,
    },
    measurementPositioning: evidence.measurementPositioning,
    outputDirectory,
    runtime: {
      nodeVersion: process.version,
      browserVersion: browser.version(),
      browserExecutablePath,
      browserExecutableBytes: M15_GOOGLE_CHROME_ELF_BYTES,
      browserExecutableSha256,
      browserPackageName: browserBinaryContract.packageName,
      browserPackageVersion: browserBinaryContract.packageVersion,
      browserProcess,
      baselineRoot,
      baselineSourceCommit: baselineContract.sourceCommit,
      baselineVerifiedTreeSha: baselineContract.verifiedTreeSha,
      baselineVerifiedFileCount: baselineContract.verifiedFileCount,
      baselineVerifiedBytes: baselineContract.verifiedBytes,
      baselineVerificationMethod: baselineContract.verificationMethod,
      initial,
      initialSpawn,
      hudSnapshotCount: snapshots.length,
      hudTail: snapshots.slice(-20),
      promptTimeline,
    },
    runtimeContract: {
      areaDataPath: baselineContract.areaDataPath,
      areaDataSha256: baselineContract.areaDataSha256,
      initialLocation: baselineContract.initialLocation,
      player: baselineContract.player,
      areas: Object.fromEntries(
        AREA_IDS.map((areaId) => [
          areaId,
          runtimeAreaSnapshot(runtimeArea(areaId)),
        ]),
      ),
      assetBindings: baselineContract.assetBindings,
    },
    independentVisualFixture: M15_BASELINE_GEOMETRY_FIXTURE,
    candidateFixtureCoordinateParity: fixtureCoordinateParity,
    evidence,
    sourceSpawnSequence,
    qualityAssessment: {
      status: 'BASELINE_DEFECTS_OBSERVED_NOT_A_CANDIDATE_PASS',
      candidatePass: false,
      capturePassed: true,
      defectCount: defects.length,
      defects,
      note: (
        'Expected baseline visual defects are observations, not capture '
        + 'assertions; they did not terminate this run.'
      ),
    },
    requestedUrls: [...requestedUrls].sort(),
    screenshots,
    pageErrors,
    failedRequests,
  };
} catch (error) {
  failure = error;
  record('failure', error?.stack ?? String(error));
  await inputController?.cancel().catch(() => {});
  if (page) await capture('failure.png').catch(() => {});
  statePayload = {
    schemaVersion: 1,
    kind: 'M1.5-baseline-capture',
    captureStatus: 'operational-failure',
    baseUrl,
    expectedCommit,
    observedCommit: baselineContract?.sourceCommit ?? null,
    baselineRoot,
    viewport,
    deviceScaleFactor,
    touchEnabled,
    browserHeadless,
    traceEnabled,
    browserLifecycleLaunch,
    browserBinaryContract,
    hostEnvironment,
    fontEnvironment,
    outputDirectory,
    measurementPositioning: evidence.measurementPositioning,
    baselineContract: baselineContract
      ? {
        sourceCommit: baselineContract.sourceCommit,
        verifiedTreeSha: baselineContract.verifiedTreeSha,
        verifiedFileCount: baselineContract.verifiedFileCount,
        verifiedBytes: baselineContract.verifiedBytes,
        verificationMethod: baselineContract.verificationMethod,
        areaDataSha256: baselineContract.areaDataSha256,
        player: baselineContract.player,
      }
      : null,
    partialEvidence: evidence,
    defects,
    screenshots,
    pageErrors,
    failedRequests,
    failure: error?.stack ?? String(error),
  };
} finally {
  let traceFinalized = !tracingStarted;
  if (context && tracingStarted) {
    await context.tracing.stop({
      path: path.join(outputDirectory, 'trace.zip'),
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
    statePayload.captureStatus = 'operational-failure';
    statePayload.failure ??= failure?.stack ?? String(failure);
  }
  statePayload.finalization = finalization;
  record('finalization', {
    captureStatus: statePayload.captureStatus,
    ...finalization,
  });
  const runtimeLogPath = path.join(outputDirectory, 'runtime.log');
  const statePath = path.join(outputDirectory, 'state.json');
  fs.writeFileSync(runtimeLogPath, `${records.join('\n')}\n`);
  fs.writeFileSync(
    statePath,
    `${JSON.stringify(statePayload, null, 2)}\n`,
  );
  if (!failure) {
    fs.writeFileSync(
      path.join(outputDirectory, 'completion.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        status: 'complete',
        expectedCommit,
        observedCommit: baselineContract.sourceCommit,
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
assert.equal(captureComplete, true);
