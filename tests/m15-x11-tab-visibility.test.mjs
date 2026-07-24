import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  M15_BROWSER_LIFECYCLE_LAUNCH,
  M15_CHROMIUM_X11_ARGS,
  M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS,
  parseWmClass,
  parseWmClassRecord,
  parseWmPid,
  parseX11WindowId,
  parseX11WindowList,
  selectSingleChromeX11Client,
} from '../scripts/x11-tab-visibility.mjs';

test('M1.5 X11 launch policy restores native backgrounding and pins X11', () => {
  assert.deepEqual(M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS, [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ]);
  assert.deepEqual(M15_CHROMIUM_X11_ARGS, [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--ozone-platform=x11',
  ]);
  assert.deepEqual(
    M15_BROWSER_LIFECYCLE_LAUNCH.ignoredPlaywrightDefaultArgs,
    M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS,
  );
  assert.deepEqual(
    M15_BROWSER_LIFECYCLE_LAUNCH.chromiumArgs,
    M15_CHROMIUM_X11_ARGS,
  );
  assert.ok(Object.isFrozen(M15_BROWSER_LIFECYCLE_LAUNCH));
});

test('M1.5 X11 IDs normalize decimal and hexadecimal active-window output', () => {
  assert.equal(parseX11WindowId('4194307\n'), 4_194_307);
  assert.equal(parseX11WindowId('0x400003\n'), 4_194_307);
  assert.equal(
    parseX11WindowId(
      '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x400003\n',
    ),
    4_194_307,
  );
  assert.equal(parseX11WindowId('4294967295'), 0xffff_ffff);
});

test('M1.5 X11 parsers reject ambiguous or unbounded identifiers', () => {
  for (const invalid of [
    '',
    '0',
    '0x0',
    '0x400003 0x400004',
    '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x400003\nextra',
    '4294967296',
  ]) {
    assert.throws(() => parseX11WindowId(invalid));
  }
  assert.equal(
    parseWmPid('_NET_WM_PID(CARDINAL) = 12345\n'),
    12_345,
  );
  assert.throws(() => parseWmPid('_NET_WM_PID(CARDINAL) = 0'));
  assert.throws(() => parseWmPid('_NET_WM_PID(CARDINAL) = 12 13'));
});

test('M1.5 X11 client lists require unique bounded window IDs', () => {
  assert.deepEqual(
    parseX11WindowList(
      '_NET_CLIENT_LIST(WINDOW): window id # 0x400003, 6291460\n',
    ),
    [4_194_307, 6_291_460],
  );
  for (const invalid of [
    '',
    '_NET_CLIENT_LIST(WINDOW): window id # ',
    '_NET_CLIENT_LIST(WINDOW): window id # 0x0',
    '_NET_CLIENT_LIST(WINDOW): window id # 0x400003,0x600004',
    '_NET_CLIENT_LIST(WINDOW): window id # 0x400003, 0x400003',
    '_NET_CLIENT_LIST(WINDOW): window id # 4294967296',
  ]) {
    assert.throws(() => parseX11WindowList(invalid));
  }
});

test('M1.5 X11 WM_CLASS accepts only the selected Google Chrome window', () => {
  assert.deepEqual(
    parseWmClass(
      'WM_CLASS(STRING) = "google-chrome", "Google-chrome"\n',
    ),
    {
      instance: 'google-chrome',
      class: 'Google-chrome',
    },
  );
  assert.deepEqual(
    parseWmClass(
      'WM_CLASS(STRING) = "google-chrome-stable", "Google-chrome"\n',
    ),
    {
      instance: 'google-chrome-stable',
      class: 'Google-chrome',
    },
  );
  assert.throws(
    () => parseWmClass(
      'WM_CLASS(STRING) = "chromium", "Chromium"\n',
    ),
  );
});

test('M1.5 X11 client selection requires one Chrome class for the CDP PID', () => {
  const chrome = {
    windowId: 4_194_307,
    wmPid: 12_345,
    wmClass: parseWmClassRecord(
      'WM_CLASS(STRING) = "google-chrome", "Google-chrome"',
    ),
  };
  const openbox = {
    windowId: 2_097_439,
    wmPid: 777,
    wmClass: parseWmClassRecord(
      'WM_CLASS(STRING) = "openbox", "Openbox"',
    ),
  };
  const otherChrome = {
    ...chrome,
    windowId: 6_291_460,
    wmPid: 54_321,
  };
  assert.deepEqual(
    selectSingleChromeX11Client(
      [openbox, otherChrome, chrome],
      12_345,
    ),
    chrome,
  );
  assert.throws(() => selectSingleChromeX11Client(
    [{ ...openbox, wmPid: 12_345 }],
    12_345,
  ));
  assert.throws(() => selectSingleChromeX11Client(
    [chrome, { ...chrome, windowId: 6_291_460 }],
    12_345,
  ));
  assert.throws(() => selectSingleChromeX11Client(
    [openbox, otherChrome],
    12_345,
  ));
});

test('M1.5 native visibility helper forbids synthetic or minimize paths', async () => {
  const source = await readFile(
    new URL('../scripts/x11-tab-visibility.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /execFile\(command, args/);
  assert.match(source, /xprop', \['-root', '_NET_CLIENT_LIST'\]/);
  assert.match(source, /'windowactivate',\s*'--sync'/);
  assert.match(source, /browserPidClients\.length === 1/);
  assert.match(source, /browserPidClientIdentities: Object\.freeze/);
  assert.match(source, /atOpenCommand: x11Snapshots\.atOpenCommand/);
  assert.match(source, /atReturnCommand: x11Snapshots\.atReturnCommand/);
  assert.match(source, /sendXdotoolChord\('ctrl\+t'\)/);
  assert.match(source, /sendXdotoolChord\('ctrl\+shift\+Tab'\)/);
  assert.match(source, /context\.waitForEvent\('page'/);
  assert.match(source, /foregroundPage\.goto\('about:blank'/);
  assert.doesNotMatch(source, /foregroundPage\.setContent/);
  assert.doesNotMatch(source, /Browser\.setWindowBounds/);
  assert.doesNotMatch(source, /bringToFront/);
  assert.doesNotMatch(source, /\bwindowfocus\b/);
  assert.doesNotMatch(source, /runFixedCommand\('xdotool', \[\s*'search'/);
  assert.doesNotMatch(
    source,
    /Emulation\.setPageVisibilityOverride|Page\.setWebLifecycleState/,
  );
  assert.doesNotMatch(source, /document\.visibilityState\s*=/);
  assert.equal(
    (source.match(/activateChromeX11Client\(/g) ?? []).length,
    2,
    'Initial Chrome activation must be defined and called exactly once.',
  );
  assert.equal(
    (source.match(/sendXdotoolChord\(/g) ?? []).length,
    3,
    'Only the helper definition and two success-path tab gestures are allowed.',
  );
  const cleanupSource = source.slice(
    source.indexOf('if (primaryError) {'),
    source.indexOf('if (primaryError || cleanupErrors.length > 0)'),
  );
  assert.doesNotMatch(cleanupSource, /sendXdotoolChord|windowactivate/);

  const openOrder = [
    "context.waitForEvent('page'",
    'x11Snapshots.atOpenCommand = await waitForActiveX11Snapshot',
    "sendXdotoolChord('ctrl+t')",
    'foregroundPage = await foregroundPagePromise',
    'navigatedForegroundTarget.targetId === foregroundTarget.targetId',
    'const hiddenPoll = await pollVisibilityPair',
  ].map((marker) => source.indexOf(marker));
  assert.ok(openOrder.every((index) => index >= 0));
  assert.deepEqual(openOrder, [...openOrder].sort((left, right) => left - right));

  const returnOrder = [
    'x11Snapshots.beforeReturn = await waitForActiveX11Snapshot',
    'x11Snapshots.atReturnCommand = await waitForActiveX11Snapshot',
    "sendXdotoolChord('ctrl+shift+Tab')",
    'const visiblePoll = await pollVisibilityPair',
  ].map((marker) => source.indexOf(marker));
  assert.ok(returnOrder.every((index) => index >= 0));
  assert.deepEqual(
    returnOrder,
    [...returnOrder].sort((left, right) => left - right),
  );
});
