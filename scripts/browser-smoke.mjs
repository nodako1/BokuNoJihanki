import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const expectedCommit = (process.env.EXPECTED_COMMIT ?? '').slice(0, 7);
const outputDir = process.env.BROWSER_ARTIFACT_DIR ?? 'diagnostics/browser-smoke';
const productionWaitMs = Number(process.env.PRODUCTION_WAIT_MS ?? 480_000);
const areaGroundY = {
  'home-street': 525,
  'life-road': 614,
  'upper-vending-lane': 535,
};
const upArrowLabel = '上のエリアへ移動';
const downArrowLabel = '下のエリアへ移動';

fs.mkdirSync(outputDir, { recursive: true });

const records = [];
const pageErrors = [];
const failedRequests = [];
const transitionChecks = [];
const evidence = {};
let statePayload = { baseUrl, expectedCommit };

const record = (kind, value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  records.push(`[${kind}] ${text}`);
  console.log(`[${kind}] ${text}`);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function latestHud(page) {
  const snapshot = await page.evaluate(() => globalThis.__m14BrowserSmoke?.last ?? null);
  if (!snapshot) throw new Error('M1.4 HUD snapshot is not available.');
  return snapshot;
}

async function hudTimeline(page) {
  return page.evaluate(() => globalThis.__m14BrowserSmoke?.snapshots ?? []);
}

async function waitForHud(page, expected, timeout = 30_000) {
  await page.waitForFunction(
    (criteria) => {
      const snapshot = globalThis.__m14BrowserSmoke?.last;
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
      if (criteria.branchVisible !== undefined && snapshot.branchVisible !== criteria.branchVisible) {
        return false;
      }
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
      if (criteria.minX !== undefined && snapshot.playerX < criteria.minX) return false;
      if (criteria.maxX !== undefined && snapshot.playerX > criteria.maxX) return false;
      if (criteria.minSpeed !== undefined && snapshot.speed < criteria.minSpeed) return false;
      if (criteria.maxSpeed !== undefined && snapshot.speed > criteria.maxSpeed) return false;
      if (
        criteria.minCamera !== undefined
        && snapshot.cameraScrollX < criteria.minCamera
      ) return false;
      if (
        criteria.audioMuted !== undefined
        && snapshot.audioMuted !== criteria.audioMuted
      ) return false;
      if (
        criteria.timeMinutes !== undefined
        && Math.abs(snapshot.timeMinutes - criteria.timeMinutes) > (criteria.timeTolerance ?? 2)
      ) return false;
      if (criteria.minFps !== undefined && snapshot.fps < criteria.minFps) return false;
      return true;
    },
    expected,
    { timeout, polling: 'raf' },
  );
  return latestHud(page);
}

async function waitForIdle(page, area, facing) {
  return waitForHud(page, {
    area,
    transitionState: 'idle',
    inputLocked: false,
    maxSpeed: 0,
    animation: `idle-${facing}`,
  });
}

async function capture(page, filename) {
  await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
}

async function captureWalk(page, area, direction, filename) {
  const key = direction === 'right' ? 'ArrowRight' : 'ArrowLeft';
  const before = await latestHud(page);
  let during;
  await page.keyboard.down(key);
  try {
    await waitForHud(page, {
      area,
      facing: direction,
      animation: `walk-${direction}`,
      minSpeed: 100,
    });
    await page.waitForTimeout(180);
    during = await latestHud(page);
    if (filename) await capture(page, filename);
  } finally {
    await page.keyboard.up(key);
  }
  const idle = await waitForIdle(page, area, direction);
  const movedInDirection = direction === 'right'
    ? during.playerX > before.playerX
    : during.playerX < before.playerX;
  assert(movedInDirection, `${area} did not move ${direction}.`);
  return { before, during, idle };
}

async function moveRightTo(page, area, minX, timeout = 30_000) {
  await page.keyboard.down('ArrowRight');
  try {
    await waitForHud(page, { area, minX, animation: 'walk-right' }, timeout);
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  return waitForIdle(page, area, 'right');
}

async function transitionWithHeldKey(page, key, targetArea, loadingScreenshot) {
  const departure = await latestHud(page);
  let lockedStart;
  let lockedEnd;
  await page.keyboard.down(key);
  try {
    lockedStart = await waitForHud(page, {
      area: departure.area,
      notTransitionState: 'idle',
      inputLocked: true,
      maxSpeed: 0,
    });
    await page.waitForTimeout(90);
    lockedEnd = await latestHud(page);
    if (loadingScreenshot) await capture(page, loadingScreenshot);
  } finally {
    await page.keyboard.up(key);
  }
  const switched = await waitForHud(page, {
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
  });
  const arrival = await waitForHud(page, {
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    maxSpeed: 0,
    animationPrefix: 'idle-',
  });
  const check = {
    departure,
    lockedStart,
    lockedEnd,
    switched,
    arrival,
    inputAttemptedWhileLocked: true,
  };
  transitionChecks.push(check);
  return check;
}

async function transitionWithArrowButton(page, label, targetArea) {
  const departure = await latestHud(page);
  const button = page.getByRole('button', { name: label, exact: true });
  assert(await button.count() === 1, `Expected one visible ${label} button.`);
  await button.click();
  const lockedStart = await waitForHud(page, {
    area: departure.area,
    notTransitionState: 'idle',
    inputLocked: true,
    maxSpeed: 0,
  });

  // Deliberately pulse movement while the curtain is active. Releasing before
  // fade-in completes avoids mistaking valid post-transition movement for leak.
  let lockedEnd;
  await page.keyboard.down('ArrowRight');
  try {
    await page.waitForTimeout(40);
    lockedEnd = await latestHud(page);
  } finally {
    await page.keyboard.up('ArrowRight');
  }

  const switched = await waitForHud(page, {
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
  });
  const arrival = await waitForHud(page, {
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    maxSpeed: 0,
    animationPrefix: 'idle-',
  });
  const check = {
    departure,
    lockedStart,
    lockedEnd,
    switched,
    arrival,
    inputAttemptedWhileLocked: true,
  };
  transitionChecks.push(check);
  return check;
}

async function advanceTime(page, count, targetMinutes) {
  const drawer = page.locator('details.dev-tool-drawer');
  if (!await drawer.evaluate((element) => element.open)) {
    await drawer.locator('summary').click();
  }
  const button = page.getByRole('button', { name: '＋15分', exact: true });
  assert(await button.count() === 1, 'The +15 minute developer control is missing.');
  for (let index = 0; index < count; index += 1) {
    await button.click();
  }
  const snapshot = await waitForHud(page, {
    timeMinutes: targetMinutes,
    timeTolerance: 2,
  }, 12_000);
  if (await drawer.evaluate((element) => element.open)) {
    await drawer.locator('summary').click();
  }
  return snapshot;
}

let browser;
let context;
let page;
let failure;

try {
  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    locale: 'ja-JP',
  });
  await context.addInitScript(() => {
    const state = { last: null, snapshots: [] };
    Object.defineProperty(globalThis, '__m14BrowserSmoke', {
      configurable: true,
      value: state,
    });
    globalThis.addEventListener('boku-no-jihanki:hud-snapshot', (event) => {
      const snapshot = { ...event.detail, capturedAt: performance.now() };
      state.last = snapshot;
      state.snapshots.push(snapshot);
      if (state.snapshots.length > 1_200) state.snapshots.shift();
    });
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  page = await context.newPage();
  page.on('console', (message) => record(`console:${message.type()}`, message.text()));
  page.on('pageerror', (error) => {
    pageErrors.push(error.stack ?? error.message);
    record('pageerror', error.stack ?? error.message);
  });
  page.on('requestfailed', (request) => {
    const detail = `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`;
    failedRequests.push(detail);
    record('requestfailed', detail);
  });

  const deadline = Date.now() + productionWaitMs;
  let commitMatched = expectedCommit.length === 0;
  do {
    const url = `${baseUrl.replace(/\/$/, '')}/?m14-smoke=${Date.now()}`;
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    if (!response || response.status() >= 400) {
      throw new Error(`Page returned HTTP ${response?.status() ?? 'no response'}.`);
    }
    const bodyText = await page.locator('body').innerText();
    commitMatched = expectedCommit.length === 0 || bodyText.includes(expectedCommit);
    if (!commitMatched) await page.waitForTimeout(5_000);
  } while (!commitMatched && Date.now() < deadline);
  if (!commitMatched) {
    throw new Error(`Timed out waiting for commit ${expectedCommit} at ${baseUrl}.`);
  }

  await capture(page, '01-title.png');
  await page.getByRole('button', { name: '夏休みを始める', exact: true }).click();
  await waitForHud(page, {
    area: 'home-street',
    transitionState: 'idle',
    inputLocked: false,
    timeMinutes: 360,
    minFps: 1,
  });
  assert(await page.locator('canvas').count() === 1, 'Expected exactly one game canvas.');

  const developerDrawer = page.locator('details.dev-tool-drawer');
  await developerDrawer.locator('summary').click();
  await page.getByRole('button', { name: 'HUDを表示', exact: true }).click();
  await page.getByText('M1.4 SIDE-SCROLL HUD', { exact: true }).waitFor();
  const initial = await latestHud(page);
  assert(initial.fps > 0, `M1.4 HUD did not report a running frame loop: ${initial.fps}.`);
  assert(initial.playerY === areaGroundY['home-street'], 'Home spawn is off the fixed ground line.');
  await page.getByRole('button', { name: 'HUDを隠す', exact: true }).click();
  await developerDrawer.locator('summary').click();

  const muteButton = page.getByRole('button', { name: '音をオフにする', exact: true });
  await muteButton.waitFor({ state: 'visible' });
  assert(!await muteButton.isDisabled(), 'Web Audio is unavailable in the smoke browser.');
  await muteButton.click();
  const mutedInitial = await waitForHud(page, { audioMuted: true, timeMinutes: 360 });

  await capture(page, '02-home-street.png');
  const homeWalkRight = await captureWalk(
    page,
    'home-street',
    'right',
    '03-walk-right.png',
  );
  const homeWalkLeft = await captureWalk(
    page,
    'home-street',
    'left',
    '04-walk-left.png',
  );

  const homeRightEdge = await moveRightTo(page, 'home-street', 2_210);
  assert(homeRightEdge.playerX < 2_336, 'Home edge setup entered the transition trigger too early.');
  assert(
    homeRightEdge.cameraScrollX >= homeRightEdge.cameraMaxX - 4,
    `Horizontal camera did not reach the authored home edge: ${JSON.stringify(homeRightEdge)}`,
  );
  await capture(page, '05-home-right-edge.png');

  const firstLifeTransition = await transitionWithHeldKey(
    page,
    'ArrowRight',
    'life-road',
    '06-transition-loading.png',
  );
  await capture(page, '07-life-road.png');

  const returnedHome = await transitionWithHeldKey(page, 'ArrowLeft', 'home-street');
  assert(
    returnedHome.arrival.playerX >= 2_100,
    `Life-road left edge returned to an unexpected home spawn: ${returnedHome.arrival.playerX}.`,
  );
  await capture(page, '08-returned-home.png');

  const secondLifeTransition = await transitionWithHeldKey(page, 'ArrowRight', 'life-road');
  const lifeBranch = await moveRightTo(page, 'life-road', 1_280);
  assert(
    lifeBranch.playerX >= 1_220 && lifeBranch.playerX <= 1_480,
    `Life-road branch was overshot: ${lifeBranch.playerX}.`,
  );
  const upPrompt = await waitForHud(page, {
    area: 'life-road',
    branchVisible: true,
    branchDirection: 'up',
    maxSpeed: 0,
  });
  assert(
    await page.getByRole('button', { name: upArrowLabel, exact: true }).count() === 1,
    'The life-road up arrow is not accessible.',
  );
  await capture(page, '09-up-arrow.png');

  const upperTransition = await transitionWithArrowButton(
    page,
    upArrowLabel,
    'upper-vending-lane',
  );
  const upperWalkRight = await captureWalk(
    page,
    'upper-vending-lane',
    'right',
    '10-upper-vending-lane.png',
  );
  const upperWalkLeft = await captureWalk(
    page,
    'upper-vending-lane',
    'left',
    null,
  );

  const idleStart = await waitForIdle(page, 'upper-vending-lane', 'left');
  await page.waitForTimeout(500);
  const idleEnd = await waitForIdle(page, 'upper-vending-lane', 'left');
  assert(idleEnd.playerX === idleStart.playerX, 'Player drifted after returning to idle.');
  assert(idleEnd.footstepCount === idleStart.footstepCount, 'Idle animation emitted a footstep.');

  const downPrompt = await waitForHud(page, {
    area: 'upper-vending-lane',
    branchVisible: true,
    branchDirection: 'down',
    maxSpeed: 0,
  });
  assert(
    await page.getByRole('button', { name: downArrowLabel, exact: true }).count() === 1,
    'The upper lane down arrow is not accessible.',
  );
  await capture(page, '11-down-arrow.png');

  const lowerTransition = await transitionWithArrowButton(
    page,
    downArrowLabel,
    'life-road',
  );
  const morning = await waitForHud(page, {
    area: 'life-road',
    timeMinutes: 360,
    audioMuted: true,
  });
  await capture(page, '12-morning.png');

  const day = await advanceTime(page, 24, 720);
  await capture(page, '13-day.png');
  const evening = await advanceTime(page, 18, 990);
  await capture(page, '14-evening.png');
  const night = await advanceTime(page, 14, 1_200);
  await capture(page, '15-night.png');

  await page.keyboard.down('ArrowRight');
  let focusLossStop;
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
    await page.waitForTimeout(350);
    const stillStopped = await latestHud(page);
    focusLossStop = (
      stillStopped.speed === 0
      && stillStopped.animation === 'idle-right'
      && stillStopped.playerX === stopped.playerX
    );
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  assert(focusLossStop, 'Focus loss did not stop horizontal movement immediately.');

  const snapshots = await hudTimeline(page);
  const m14Snapshots = snapshots.filter((snapshot) => (
    Object.hasOwn(areaGroundY, snapshot.area)
  ));
  const verticalInvariant = (
    m14Snapshots.length > 0
    && m14Snapshots.every((snapshot) => snapshot.playerY === areaGroundY[snapshot.area])
  );
  const cameraBoundsInvariant = m14Snapshots.every((snapshot) => (
    snapshot.cameraScrollX >= -1
    && snapshot.cameraScrollX <= snapshot.cameraMaxX + 1
  ));
  const cameraFollow = (
    homeRightEdge.cameraScrollX > initial.cameraScrollX + 500
    && homeRightEdge.cameraScrollX >= homeRightEdge.cameraMaxX - 4
    && cameraBoundsInvariant
  );
  const lockedSnapshots = m14Snapshots.filter((snapshot) => snapshot.inputLocked);
  const transitionLocked = (
    transitionChecks.length === 5
    && lockedSnapshots.length >= 5
    && lockedSnapshots.every((snapshot) => (
      snapshot.transitionState !== 'idle'
      && snapshot.speed === 0
    ))
    && transitionChecks.every(({ lockedStart }) => (
      lockedStart.inputLocked
      && lockedStart.speed === 0
    ))
    && transitionChecks.every((check) => check.inputAttemptedWhileLocked)
  );
  const timePreserved = transitionChecks.every(({ departure, arrival }) => (
    Math.abs(departure.timeMinutes - arrival.timeMinutes) <= 2
  ));
  const mutePreserved = transitionChecks.every(({ departure, arrival }) => (
    departure.audioMuted === true && arrival.audioMuted === true
  ));
  const areasVisited = new Set(m14Snapshots.map((snapshot) => snapshot.area));
  const idleReturned = (
    idleEnd.animation === 'idle-left'
    && idleEnd.speed === 0
    && idleEnd.playerX === idleStart.playerX
    && idleEnd.footstepCount === idleStart.footstepCount
  );

  assert(verticalInvariant, 'Fixed ground-line verticalInvariant failed.');
  assert(cameraFollow, 'Horizontal cameraFollow invariant failed.');
  assert(transitionLocked, 'Transition transitionLocked invariant failed.');
  assert(timePreserved, 'Time changed while moving between M1.4 areas.');
  assert(mutePreserved, 'Mute state changed while moving between M1.4 areas.');
  assert(idleReturned, 'Walk animation did not return to a stable idle state.');
  assert(areasVisited.size === 3, `Expected all three areas, saw: ${[...areasVisited].join(', ')}`);
  assert(homeWalkRight.during.animation === 'walk-right', 'Home right-walk animation was not active.');
  assert(homeWalkLeft.during.animation === 'walk-left', 'Home left-walk animation was not active.');
  assert(upperWalkRight.during.animation === 'walk-right', 'Upper lane right-walk animation was not active.');
  assert(upperWalkLeft.during.animation === 'walk-left', 'Upper lane left-walk animation was not active.');
  assert(pageErrors.length === 0, `Browser page errors: ${pageErrors.join(' | ')}`);
  assert(failedRequests.length === 0, `Browser request failures: ${failedRequests.join(' | ')}`);

  evidence.initial = initial;
  evidence.mutedInitial = mutedInitial;
  evidence.homeWalkRight = homeWalkRight;
  evidence.homeWalkLeft = homeWalkLeft;
  evidence.focusLossStop = focusLossStop;
  evidence.homeRightEdge = homeRightEdge;
  evidence.firstLifeTransition = firstLifeTransition;
  evidence.returnedHome = returnedHome;
  evidence.secondLifeTransition = secondLifeTransition;
  evidence.lifeBranch = lifeBranch;
  evidence.upPrompt = upPrompt;
  evidence.upperTransition = upperTransition;
  evidence.upperWalkRight = upperWalkRight;
  evidence.upperWalkLeft = upperWalkLeft;
  evidence.idle = { start: idleStart, end: idleEnd };
  evidence.downPrompt = downPrompt;
  evidence.lowerTransition = lowerTransition;
  evidence.phases = { morning, day, evening, night };

  const invariants = {
    verticalInvariant,
    cameraFollow,
    cameraBoundsInvariant,
    focusLossStop,
    transitionLocked,
    timePreserved,
    mutePreserved,
    idleReturned,
    areasVisited: [...areasVisited],
    pageErrors: pageErrors.length,
    failedRequests: failedRequests.length,
  };
  record('invariants', invariants);
  statePayload = {
    baseUrl,
    expectedCommit,
    evidence,
    invariants,
    transitionCount: transitionChecks.length,
    hudSnapshotCount: m14Snapshots.length,
    pageErrors,
    failedRequests,
  };
} catch (error) {
  failure = error;
  record('failure', error?.stack ?? String(error));
  statePayload = {
    baseUrl,
    expectedCommit,
    evidence,
    transitionChecks,
    pageErrors,
    failedRequests,
    failure: error?.stack ?? String(error),
  };
  if (page) {
    await page.screenshot({
      path: path.join(outputDir, 'failure.png'),
      fullPage: true,
    }).catch(() => {});
  }
} finally {
  fs.writeFileSync(
    path.join(outputDir, 'state.json'),
    `${JSON.stringify(statePayload, null, 2)}\n`,
  );
  if (context) {
    await context.tracing.stop({
      path: path.join(outputDir, 'trace.zip'),
    }).catch((error) => record('trace-error', error?.stack ?? String(error)));
  }
  fs.writeFileSync(path.join(outputDir, 'runtime.log'), `${records.join('\n')}\n`);
  if (browser) await browser.close();
}

if (failure) throw failure;
