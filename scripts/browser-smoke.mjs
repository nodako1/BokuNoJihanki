import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const expectedCommit = (process.env.EXPECTED_COMMIT ?? '').slice(0, 7);
const outputDir = process.env.BROWSER_ARTIFACT_DIR ?? 'diagnostics/browser-smoke';
const productionWaitMs = Number(process.env.PRODUCTION_WAIT_MS ?? 480_000);

fs.mkdirSync(outputDir, { recursive: true });

const records = [];
const pageErrors = [];
const failedRequests = [];

function record(kind, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const line = `[${kind}] ${text}`;
  records.push(line);
  console.log(line);
}

function parseHud(bodyText) {
  const fps = Number(bodyText.match(/(\d+) FPS/)?.[1] ?? 0);
  const position = bodyText.match(/POSITION\s+(-?\d+),\s*(-?\d+)/);
  const loaded = Number(bodyText.match(/LOADED\s+(\d+)/)?.[1] ?? 0);
  const chunk = bodyText.match(/CHUNK\s+([^\n]+)/)?.[1]?.trim() ?? '';
  const area = bodyText.match(/AREA\s+([^\n]+)/)?.[1]?.trim() ?? '';
  return {
    fps,
    playerX: Number(position?.[1] ?? 0),
    playerY: Number(position?.[2] ?? 0),
    loaded,
    chunk,
    area,
  };
}

async function advanceTime(page, button, count) {
  for (let index = 0; index < count; index += 1) {
    await button.click();
  }
  await page.waitForTimeout(900);
}

let browser;
let context;
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
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  const page = await context.newPage();
  page.on('console', (message) => record(`console:${message.type()}`, message.text()));
  page.on('pageerror', (error) => {
    const detail = error.stack ?? error.message;
    pageErrors.push(detail);
    record('pageerror', detail);
  });
  page.on('requestfailed', (request) => {
    const detail = `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`;
    failedRequests.push(detail);
    record('requestfailed', detail);
  });

  const deadline = Date.now() + productionWaitMs;
  let commitMatched = expectedCommit.length === 0;
  do {
    const url = `${baseUrl.replace(/\/$/, '')}/?browser-smoke=${Date.now()}`;
    record('navigate', url);
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    if (!response || response.status() >= 400) {
      throw new Error(`Page returned HTTP ${response?.status() ?? 'no response'}.`);
    }
    const bodyText = await page.locator('body').innerText();
    commitMatched = expectedCommit.length === 0 || bodyText.includes(expectedCommit);
    if (!commitMatched) {
      record('wait-production', `Expected commit ${expectedCommit} is not live yet.`);
      await page.waitForTimeout(5_000);
    }
  } while (!commitMatched && Date.now() < deadline);

  if (!commitMatched) {
    throw new Error(`Timed out waiting for commit ${expectedCommit} at ${baseUrl}.`);
  }

  await page.screenshot({ path: path.join(outputDir, '01-title.png'), fullPage: true });
  const startButton = page.getByRole('button', { name: '夏休みを始める' });
  if ((await startButton.count()) !== 1) {
    throw new Error('The start button was not found exactly once.');
  }
  await startButton.click();

  const developerSummary = page.locator('summary', { hasText: '開発' });
  await developerSummary.click();
  await page.getByRole('button', { name: 'HUDを表示' }).click();

  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const fps = Number(text.match(/(\d+) FPS/)?.[1] ?? 0);
    const position = text.match(/POSITION\s+(-?\d+),\s*(-?\d+)/);
    const loaded = Number(text.match(/LOADED\s+(\d+)/)?.[1] ?? 0);
    const playerX = Number(position?.[1] ?? 0);
    const playerY = Number(position?.[2] ?? 0);
    return fps > 0 && playerX > 0 && playerY > 0 && loaded > 0 && !text.includes('CHUNK\n準備中');
  }, { timeout: 30_000 });

  const runningBody = await page.locator('body').innerText();
  const beforeMove = parseHud(runningBody);
  record('running-hud', beforeMove);

  const canvasCount = await page.locator('canvas').count();
  if (canvasCount !== 1) {
    throw new Error(`Expected exactly one game canvas, found ${canvasCount}.`);
  }
  if (pageErrors.length > 0) {
    throw new Error(`Browser page errors were reported: ${pageErrors.join(' | ')}`);
  }

  await page.getByRole('button', { name: 'HUDを隠す' }).click();
  await developerSummary.click();
  await page.screenshot({ path: path.join(outputDir, '02-morning-residential.png'), fullPage: true });

  const captureAt = async (steps, filename) => {
    await developerSummary.click();
    const stepButton = page.getByRole('button', { name: '＋15分' });
    await advanceTime(page, stepButton, steps);
    await developerSummary.click();
    await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
  };
  await captureAt(24, '03-noon-residential.png');
  await captureAt(24, '04-evening-residential.png');
  await captureAt(12, '05-night-residential.png');

  await developerSummary.click();
  await page.getByRole('button', { name: '朝へ戻す' }).click();
  await page.getByRole('button', { name: 'HUDを表示' }).click();
  await developerSummary.click();
  await page.waitForTimeout(900);

  let reachedPark = false;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(850);
    await page.keyboard.up('ArrowRight');
    const current = parseHud(await page.locator('body').innerText());
    if (current.area.includes('なつかぜ公園') || current.playerX >= 2560) {
      reachedPark = true;
      break;
    }
  }

  const movedBody = await page.locator('body').innerText();
  const afterMove = parseHud(movedBody);
  record('park-hud', afterMove);
  if (afterMove.playerX <= beforeMove.playerX + 20) {
    throw new Error(`Keyboard movement failed: ${beforeMove.playerX} -> ${afterMove.playerX}.`);
  }
  if (!reachedPark || !afterMove.area.includes('なつかぜ公園')) {
    throw new Error(`Seamless park traversal failed at x=${afterMove.playerX}, area=${afterMove.area}.`);
  }

  await developerSummary.click();
  await page.getByRole('button', { name: 'HUDを隠す' }).click();
  await developerSummary.click();
  await page.screenshot({ path: path.join(outputDir, '06-morning-park.png'), fullPage: true });

  if (pageErrors.length > 0) {
    throw new Error(`Browser page errors were reported: ${pageErrors.join(' | ')}`);
  }
  if (failedRequests.length > 0) {
    throw new Error(`Browser requests failed: ${failedRequests.join(' | ')}`);
  }

  fs.writeFileSync(
    path.join(outputDir, 'state.json'),
    `${JSON.stringify({
      baseUrl,
      expectedCommit,
      beforeMove,
      afterMove,
      reachedPark,
      screenshots: [
        '01-title.png',
        '02-morning-residential.png',
        '03-noon-residential.png',
        '04-evening-residential.png',
        '05-night-residential.png',
        '06-morning-park.png',
      ],
      pageErrors,
      failedRequests,
      userAgent: await page.evaluate(() => navigator.userAgent),
    }, null, 2)}\n`,
  );
} catch (error) {
  failure = error;
  record('failure', error?.stack ?? String(error));
} finally {
  fs.writeFileSync(path.join(outputDir, 'runtime.log'), `${records.join('\n')}\n`);
  if (context) {
    await context.tracing.stop({ path: path.join(outputDir, 'trace.zip') }).catch((error) => {
      record('trace-error', error?.stack ?? String(error));
    });
  }
  if (browser) await browser.close();
}

if (failure) {
  throw failure;
}
