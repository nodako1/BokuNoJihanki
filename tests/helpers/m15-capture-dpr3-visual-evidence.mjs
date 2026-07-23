import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadM15Playwright } from './m15-playwright-runtime.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputRoot = process.env.M15_DPR3_CAPTURE_ROOT ?? '/tmp/boku-m15-dpr3-captures';
const expectedCommit = (process.env.EXPECTED_COMMIT ?? '29223ee').slice(0, 7);
const viewport = Object.freeze({
  width: 932,
  height: 430,
  deviceScaleFactor: 3,
  hasTouch: true,
});
const { chromium } = loadM15Playwright({ repositoryRoot });

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function pngDimensions(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 24);
  assert.equal(header.subarray(1, 4).toString('ascii'), 'PNG');
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

async function startDistServer() {
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
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

async function waitForHud(page, expected, timeout = 60_000) {
  await page.waitForFunction(
    (criteria) => {
      const snapshot = globalThis.__m15Dpr3Capture?.last;
      if (!snapshot) return false;
      return Object.entries(criteria).every(([key, value]) => {
        if (key === 'minX') return snapshot.playerX >= value;
        if (key === 'maxSpeed') return snapshot.speed <= value;
        return snapshot[key] === value;
      });
    },
    expected,
    { timeout, polling: 'raf' },
  );
  return page.evaluate(() => globalThis.__m15Dpr3Capture.last);
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

async function transitionWithHeldRight(page, targetArea) {
  await page.keyboard.down('ArrowRight');
  try {
    await waitForHud(page, { inputLocked: true, maxSpeed: 0 });
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  return waitForHud(page, {
    area: targetArea,
    transitionState: 'idle',
    inputLocked: false,
    maxSpeed: 0,
  });
}

async function captureState(page, filename) {
  const filePath = path.join(outputRoot, filename);
  await page.screenshot({ path: filePath, fullPage: true, scale: 'css' });
  const hud = await page.evaluate(() => globalThis.__m15Dpr3Capture.last);
  const panel = await page.locator('.area-arrow-button').count() === 1
    ? await page.locator('.area-arrow-button').boundingBox()
    : null;
  return {
    file: filename,
    sha256: sha256(filePath),
    pngDimensions: pngDimensions(filePath),
    hud,
    panelRectCssPx: panel,
  };
}

fs.mkdirSync(outputRoot, { recursive: true });
const server = await startDistServer();
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const pageErrors = [];
const failedRequests = [];
try {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    hasTouch: viewport.hasTouch,
    locale: 'ja-JP',
  });
  await context.addInitScript(() => {
    const state = { last: null };
    Object.defineProperty(globalThis, '__m15Dpr3Capture', {
      configurable: true,
      value: state,
    });
    globalThis.addEventListener('boku-no-jihanki:hud-snapshot', (event) => {
      state.last = { ...event.detail };
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  const response = await page.goto(server.url, { waitUntil: 'networkidle', timeout: 60_000 });
  assert.ok(response && response.status() < 400);
  if (expectedCommit) {
    assert.match(await page.locator('body').innerText(), new RegExp(expectedCommit));
  }
  const measuredEmulation = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  assert.equal(measuredEmulation.devicePixelRatio, 3);
  assert.ok(measuredEmulation.maxTouchPoints > 0);
  assert.equal(measuredEmulation.innerWidth, 932);
  assert.equal(measuredEmulation.innerHeight, 430);

  await page.getByRole('button', { name: '夏休みを始める', exact: true }).click();
  await waitForHud(page, {
    area: 'home-street',
    transitionState: 'idle',
    inputLocked: false,
  });
  const home = await captureState(page, 'home-ground.png');

  await moveRightTo(page, 'home-street', 2210);
  await transitionWithHeldRight(page, 'life-road');
  await moveRightTo(page, 'life-road', 1300);
  await waitForHud(page, {
    area: 'life-road',
    branchVisible: true,
    branchDirection: 'up',
    maxSpeed: 0,
  });
  const life = await captureState(page, 'life-up.png');

  await page.getByRole('button', { name: '上のエリアへ移動', exact: true }).click();
  await waitForHud(page, { inputLocked: true });
  await waitForHud(page, {
    area: 'upper-vending-lane',
    transitionState: 'idle',
    inputLocked: false,
    branchVisible: true,
    branchDirection: 'down',
    maxSpeed: 0,
  });
  const upper = await captureState(page, 'upper-down.png');

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedRequests, []);
  fs.writeFileSync(
    path.join(outputRoot, 'capture-metadata.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      baselineCommit: '29223ee31fd4fc4fbca21a37b01fe89277279647',
      captureMethod: 'Playwright page.screenshot({ scale: \"css\" })',
      viewport,
      measuredEmulation,
      pageErrors,
      failedRequests,
      captures: { home, life, upper },
      disclaimer: 'Browser emulation only; this is not a real-device result.',
    }, null, 2)}\n`,
  );
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
