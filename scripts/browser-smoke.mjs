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
const record = (kind, value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  records.push(`[${kind}] ${text}`);
  console.log(`[${kind}] ${text}`);
};

function parseHud(text) {
  const position = text.match(/POSITION\s+(-?\d+),\s*(-?\d+)/);
  return {
    fps: Number(text.match(/(\d+) FPS/)?.[1] ?? 0),
    playerX: Number(position?.[1] ?? 0),
    playerY: Number(position?.[2] ?? 0),
    section: text.match(/SECTION\s+([^\n]+)/)?.[1]?.trim() ?? '',
    chunk: text.match(/CHUNK\s+([^\n]+)/)?.[1]?.trim() ?? '',
    facing: text.match(/FACING\s+([^\n]+)/)?.[1]?.trim() ?? '',
    animation: text.match(/ANIMATION\s+([^\n]+)/)?.[1]?.trim() ?? '',
    speed: Number(text.match(/SPEED\s+(\d+)/)?.[1] ?? 0),
    walkable: text.match(/WALKABLE\s+([^\n]+)/)?.[1]?.trim() ?? '',
    blocked: text.match(/BLOCKED\s+([^\n]+)/)?.[1]?.trim() ?? '',
    steps: Number(text.match(/STEPS\s+(\d+)/)?.[1] ?? 0),
  };
}

async function hud(page) {
  return parseHud(await page.locator('body').innerText());
}

async function keyFor(page, key, milliseconds) {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
  await page.waitForTimeout(170);
}

async function screenshotWhileWalking(page, key, filename) {
  await page.keyboard.down(key);
  await page.waitForTimeout(360);
  await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
  await page.keyboard.up(key);
  await page.waitForTimeout(220);
}

async function advanceTime(page, count) {
  const button = page.getByRole('button', { name: '＋15分' });
  for (let index = 0; index < count; index += 1) await button.click();
  await page.waitForTimeout(850);
}

let browser;
let context;
let failure;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'ja-JP' });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  page.on('console', (message) => record(`console:${message.type()}`, message.text()));
  page.on('pageerror', (error) => { pageErrors.push(error.stack ?? error.message); record('pageerror', error.stack ?? error.message); });
  page.on('requestfailed', (request) => { const detail = `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`; failedRequests.push(detail); record('requestfailed', detail); });

  const deadline = Date.now() + productionWaitMs;
  let commitMatched = expectedCommit.length === 0;
  do {
    const url = `${baseUrl.replace(/\/$/, '')}/?m13-smoke=${Date.now()}`;
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    if (!response || response.status() >= 400) throw new Error(`Page returned HTTP ${response?.status() ?? 'no response'}.`);
    const bodyText = await page.locator('body').innerText();
    commitMatched = expectedCommit.length === 0 || bodyText.includes(expectedCommit);
    if (!commitMatched) await page.waitForTimeout(5_000);
  } while (!commitMatched && Date.now() < deadline);
  if (!commitMatched) throw new Error(`Timed out waiting for commit ${expectedCommit} at ${baseUrl}.`);

  await page.screenshot({ path: path.join(outputDir, '01-title.png'), fullPage: true });
  await page.getByRole('button', { name: '夏休みを始める' }).click();
  const developerSummary = page.locator('summary', { hasText: '開発' });
  await developerSummary.click();
  await page.getByRole('button', { name: 'HUDを表示' }).click();
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const fps = Number(text.match(/(\d+) FPS/)?.[1] ?? 0);
    const pos = text.match(/POSITION\s+(-?\d+),\s*(-?\d+)/);
    return fps > 0 && Number(pos?.[1] ?? 0) > 0 && text.includes('WALKABLE') && !text.includes('CHUNK\n準備中');
  }, { timeout: 30_000 });
  const initial = await hud(page);
  record('initial', initial);
  if (initial.walkable !== 'YES') throw new Error(`Spawn is not walkable: ${JSON.stringify(initial)}`);
  if (await page.locator('canvas').count() !== 1) throw new Error('Expected exactly one game canvas.');

  await page.getByRole('button', { name: 'HUDを隠す' }).click();
  await developerSummary.click();
  await page.screenshot({ path: path.join(outputDir, '02-home-front.png'), fullPage: true });

  await screenshotWhileWalking(page, 'ArrowRight', '03-walk-right.png');
  await screenshotWhileWalking(page, 'ArrowLeft', '04-walk-left.png');
  await screenshotWhileWalking(page, 'ArrowDown', '05-walk-down.png');
  await screenshotWhileWalking(page, 'ArrowUp', '06-walk-up.png');

  // Hit the authored top boundary / private-property edge and confirm it blocks the footprint.
  await keyFor(page, 'ArrowUp', 2_800);
  await developerSummary.click();
  await page.getByRole('button', { name: 'HUDを表示' }).click();
  await page.getByRole('button', { name: '当たり判定を表示' }).click();
  await page.waitForTimeout(400);
  const boundary = await hud(page);
  record('boundary', boundary);
  if (boundary.playerY < 350 || boundary.walkable !== 'YES') throw new Error(`Walkable boundary failed: ${JSON.stringify(boundary)}`);
  await page.screenshot({ path: path.join(outputDir, '07-walkable-collision-debug.png'), fullPage: true });
  await page.getByRole('button', { name: '当たり判定を隠す' }).click();
  await page.getByRole('button', { name: 'HUDを隠す' }).click();
  await developerSummary.click();

  // Move to the lower road lane to avoid poles, then traverse the entire residential slice.
  await keyFor(page, 'ArrowDown', 900);
  const sectionShots = new Set();
  for (let attempt = 0; attempt < 55; attempt += 1) {
    await keyFor(page, 'ArrowRight', 800);
    await developerSummary.click();
    await page.getByRole('button', { name: 'HUDを表示' }).click();
    const current = await hud(page);
    await page.getByRole('button', { name: 'HUDを隠す' }).click();
    await developerSummary.click();
    if (current.playerX >= 1400 && !sectionShots.has('life')) {
      sectionShots.add('life');
      await page.screenshot({ path: path.join(outputDir, '08-life-road.png'), fullPage: true });
    }
    if (current.playerX >= 2700 && !sectionShots.has('alley')) {
      sectionShots.add('alley');
      await page.screenshot({ path: path.join(outputDir, '09-alley-corner.png'), fullPage: true });
    }
    if (current.playerX >= 4100 && !sectionShots.has('cross')) {
      sectionShots.add('cross');
      await page.screenshot({ path: path.join(outputDir, '10-vending-crossing.png'), fullPage: true });
    }
    if (current.playerX >= 4750) break;
  }

  await developerSummary.click();
  await page.getByRole('button', { name: 'HUDを表示' }).click();
  const end = await hud(page);
  record('end', end);
  if (end.playerX < 4500) throw new Error(`Horizontal residential traversal failed: ${JSON.stringify(end)}`);
  if (sectionShots.size !== 3) throw new Error(`Not all residential sections were captured: ${[...sectionShots].join(', ')}`);
  if (end.walkable !== 'YES') throw new Error(`End position is outside walkable space: ${JSON.stringify(end)}`);
  if (end.steps <= initial.steps) throw new Error('Footstep counter did not advance during movement.');
  await page.getByRole('button', { name: 'HUDを隠す' }).click();
  await developerSummary.click();

  // Return home for like-for-like time-of-day evidence.
  for (let attempt = 0; attempt < 55; attempt += 1) {
    await keyFor(page, 'ArrowLeft', 800);
    await developerSummary.click();
    await page.getByRole('button', { name: 'HUDを表示' }).click();
    const current = await hud(page);
    await page.getByRole('button', { name: 'HUDを隠す' }).click();
    await developerSummary.click();
    if (current.playerX <= 600) break;
  }
  await page.screenshot({ path: path.join(outputDir, '11-morning.png'), fullPage: true });
  await developerSummary.click();
  await advanceTime(page, 24);
  await developerSummary.click();
  await page.screenshot({ path: path.join(outputDir, '12-noon.png'), fullPage: true });
  await developerSummary.click();
  await advanceTime(page, 24);
  await developerSummary.click();
  await page.screenshot({ path: path.join(outputDir, '13-evening.png'), fullPage: true });
  await developerSummary.click();
  await advanceTime(page, 12);
  await developerSummary.click();
  await page.screenshot({ path: path.join(outputDir, '14-night.png'), fullPage: true });

  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join(' | ')}`);
  if (failedRequests.length) throw new Error(`Browser request failures: ${failedRequests.join(' | ')}`);
  fs.writeFileSync(path.join(outputDir, 'state.json'), `${JSON.stringify({ baseUrl, expectedCommit, initial, boundary, end, sectionShots: [...sectionShots], pageErrors, failedRequests }, null, 2)}\n`);
} catch (error) {
  failure = error;
  record('failure', error?.stack ?? String(error));
} finally {
  fs.writeFileSync(path.join(outputDir, 'runtime.log'), `${records.join('\n')}\n`);
  if (context) await context.tracing.stop({ path: path.join(outputDir, 'trace.zip') }).catch((error) => record('trace-error', error?.stack ?? String(error)));
  if (browser) await browser.close();
}
if (failure) throw failure;
