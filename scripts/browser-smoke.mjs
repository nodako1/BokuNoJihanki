import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

const targetUrl = process.argv[2] ?? 'http://127.0.0.1:4173/';
const expectedCommit = process.env.EXPECTED_COMMIT_SHA?.slice(0, 7) ?? '';
const outputDirectory = process.env.BROWSER_SMOKE_OUTPUT_DIR ?? '/tmp/boku-no-jihanki-browser-smoke';
const screenshotPath = `${outputDirectory}/gameplay.png`;
const fullScreenshotPath = `${outputDirectory}/page.png`;
const logPath = `${outputDirectory}/runtime.log`;

await mkdir(outputDirectory, { recursive: true });

const events = [];
const runtimeFailures = [];
let browser;
let page;
let rightKeyDown = false;
let unexpectedFailure = null;

function record(line) {
  events.push(line);
  console.log(line);
}

function parsePosition(position) {
  const match = /(-?\d+)\s*,\s*(-?\d+)/.exec(position ?? '');
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

async function readHud() {
  return page.evaluate(() => {
    const hud = document.querySelector('.developer-hud');
    if (!hud) return null;

    const rows = {};
    for (const row of hud.querySelectorAll('dl > div')) {
      const key = row.querySelector('dt')?.textContent?.trim();
      const value = row.querySelector('dd')?.textContent?.trim();
      if (key && value) rows[key] = value;
    }

    const fpsText = hud.querySelector('header span')?.textContent ?? '0';
    return {
      fps: Number.parseInt(fpsText, 10) || 0,
      rows,
      text: hud.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };
  });
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  page.on('console', (message) => {
    const line = `[console:${message.type()}] ${message.text()}`;
    record(line);
    if (message.type() === 'error') runtimeFailures.push(line);
  });
  page.on('pageerror', (error) => {
    const line = `[pageerror] ${error.stack ?? error.message}`;
    record(line);
    runtimeFailures.push(line);
  });
  page.on('requestfailed', (request) => {
    const line = `[requestfailed] ${request.resourceType()} ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`;
    record(line);
    if (['document', 'script', 'stylesheet'].includes(request.resourceType())) {
      runtimeFailures.push(line);
    }
  });

  record(`[target] ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  record(`[title] ${await page.title()}`);

  const canvas = page.locator('canvas');
  assertCondition(await canvas.count() === 1, 'Phaser canvas was not created exactly once.');

  const startButton = page.getByRole('button', { name: /夏休みを始める/ });
  await startButton.waitFor({ state: 'visible', timeout: 10_000 });
  await startButton.click();

  await page.waitForFunction(
    () => {
      const hud = document.querySelector('.developer-hud');
      const fps = Number.parseInt(hud?.querySelector('header span')?.textContent ?? '0', 10);
      const values = Object.fromEntries(
        [...(hud?.querySelectorAll('dl > div') ?? [])].map((row) => [
          row.querySelector('dt')?.textContent?.trim(),
          row.querySelector('dd')?.textContent?.trim(),
        ]),
      );
      return fps > 0 && values.CHUNK === 'residential-west' && Number.parseInt(values.LOADED ?? '0', 10) >= 2;
    },
    undefined,
    { timeout: 15_000 },
  );

  const initialHud = await readHud();
  assertCondition(initialHud, 'Developer HUD was not rendered.');
  const initialPosition = parsePosition(initialHud.rows.POSITION);
  assertCondition(initialPosition, 'Initial player position could not be parsed.');
  assertCondition(initialHud.fps > 0, `Game loop did not start: ${initialHud.fps} FPS.`);
  assertCondition(initialHud.rows.CHUNK === 'residential-west', `Unexpected initial chunk: ${initialHud.rows.CHUNK}.`);
  assertCondition(Number.parseInt(initialHud.rows.LOADED, 10) >= 2, `Adjacent chunks were not loaded: ${initialHud.rows.LOADED}.`);
  if (expectedCommit) {
    assertCondition(
      initialHud.rows.BUILD?.includes(expectedCommit),
      `Production build ${initialHud.rows.BUILD ?? 'unknown'} does not contain expected commit ${expectedCommit}.`,
    );
  }
  record(`[initial-hud] ${initialHud.text}`);

  await page.keyboard.down('ArrowRight');
  rightKeyDown = true;
  await page.waitForTimeout(1_200);
  const movingHud = await readHud();
  const movingPosition = parsePosition(movingHud?.rows.POSITION);
  assertCondition(movingPosition, 'Player position could not be read while moving.');
  assertCondition(
    movingPosition.x >= initialPosition.x + 20,
    `Keyboard movement did not advance the player: ${initialPosition.x} -> ${movingPosition.x}.`,
  );
  record(`[moving-hud] ${movingHud.text}`);

  await page.waitForFunction(
    () => {
      const rows = Object.fromEntries(
        [...document.querySelectorAll('.developer-hud dl > div')].map((row) => [
          row.querySelector('dt')?.textContent?.trim(),
          row.querySelector('dd')?.textContent?.trim(),
        ]),
      );
      const x = Number.parseInt(rows.POSITION?.split(',')[0] ?? '0', 10);
      return rows.AREA === 'なつかぜ公園' && rows.CHUNK === 'park-west' && x >= 2_560;
    },
    undefined,
    { timeout: 18_000 },
  );
  await page.keyboard.up('ArrowRight');
  rightKeyDown = false;
  await page.waitForTimeout(400);

  const parkHud = await readHud();
  const parkPosition = parsePosition(parkHud?.rows.POSITION);
  assertCondition(parkHud, 'HUD disappeared after entering the park.');
  assertCondition(parkPosition && parkPosition.x >= 2_560, `Player did not reach the park: ${parkHud.rows.POSITION}.`);
  assertCondition(parkHud.rows.AREA === 'なつかぜ公園', `Area did not change to the park: ${parkHud.rows.AREA}.`);
  assertCondition(parkHud.rows.CHUNK === 'park-west', `Park chunk was not activated: ${parkHud.rows.CHUNK}.`);
  assertCondition(Number.parseInt(parkHud.rows.LOADED, 10) >= 2, `Park-adjacent chunks were not loaded: ${parkHud.rows.LOADED}.`);
  record(`[park-hud] ${parkHud.text}`);

  const canvasImage = await canvas.screenshot({ path: screenshotPath });
  assertCondition(
    canvasImage.byteLength >= 20_000,
    `Canvas screenshot is suspiciously small (${canvasImage.byteLength} bytes); rendering may still be black.`,
  );
  await page.screenshot({ path: fullScreenshotPath, fullPage: true });
  record(`[canvas-png-bytes] ${canvasImage.byteLength}`);

  assertCondition(runtimeFailures.length === 0, `Browser runtime failures were detected:\n${runtimeFailures.join('\n')}`);
  record('[result] success');
} catch (error) {
  unexpectedFailure = error;
  record(`[result] failure: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
} finally {
  if (rightKeyDown && page) {
    await page.keyboard.up('ArrowRight').catch(() => undefined);
  }
  if (page) {
    await page.screenshot({ path: fullScreenshotPath, fullPage: true }).catch(() => undefined);
  }
  await browser?.close().catch(() => undefined);
  await writeFile(logPath, `${events.join('\n')}\n`, 'utf8');
}

if (unexpectedFailure) {
  throw unexpectedFailure;
}
