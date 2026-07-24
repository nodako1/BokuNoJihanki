import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  M15_BROWSER_LIFECYCLE_LAUNCH,
  M15_CHROMIUM_X11_ARGS,
  M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS,
  parseWmClass,
  parseWmPid,
  parseX11WindowId,
} from '../scripts/x11-tab-visibility.mjs';

test('M1.5 X11 launch policy restores native backgrounding and pins X11', () => {
  assert.deepEqual(M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS, [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ]);
  assert.ok(M15_CHROMIUM_X11_ARGS.includes('--ozone-platform=x11'));
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

test('M1.5 native visibility helper forbids synthetic or minimize paths', async () => {
  const source = await readFile(
    new URL('../scripts/x11-tab-visibility.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /execFile\(command, args/);
  assert.match(source, /sendXdotoolChord\('ctrl\+t'\)/);
  assert.match(source, /sendXdotoolChord\('ctrl\+shift\+Tab'\)/);
  assert.match(source, /context\.waitForEvent\('page'/);
  assert.match(source, /foregroundPage\.goto\('about:blank'/);
  assert.doesNotMatch(source, /foregroundPage\.setContent/);
  assert.doesNotMatch(source, /Browser\.setWindowBounds/);
  assert.doesNotMatch(source, /bringToFront/);
  assert.doesNotMatch(source, /document\.visibilityState\s*=/);
});
