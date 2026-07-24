import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS = Object.freeze([
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
]);

export const M15_CHROMIUM_X11_ARGS = Object.freeze([
  '--use-gl=swiftshader',
  '--enable-webgl',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--ozone-platform=x11',
]);

export const M15_BROWSER_LIFECYCLE_LAUNCH = Object.freeze({
  ignoredPlaywrightDefaultArgs: Object.freeze([
    ...M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS,
  ]),
  chromiumArgs: Object.freeze([...M15_CHROMIUM_X11_ARGS]),
  reason:
    'Preserve native Chromium hidden/visible behavior and use the real X11 tab-selection path.',
});

const X11_ID_MAX = 0xffff_ffff;
const COMMAND_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 50;
const INTERNAL_NEW_TAB_LOCATIONS = new Set([
  'about:blank',
  'chrome://newtab/',
  'chrome://new-tab-page/',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function boundedPositiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  invariant(
    Number.isSafeInteger(value) && value > 0 && value <= maximum,
    `${label} must be a bounded positive integer.`,
  );
  return value;
}

function parseBoundedIntegerToken(token, label, maximum) {
  const radix = token.toLowerCase().startsWith('0x') ? 16 : 10;
  const digits = radix === 16 ? token.slice(2) : token;
  const value = Number.parseInt(digits, radix);
  return boundedPositiveInteger(value, label, maximum);
}

export function parseX11WindowId(output) {
  invariant(typeof output === 'string', 'X11 window output must be a string.');
  const normalized = output.trim();
  const plainMatch = normalized.match(/^(0x[0-9a-f]+|[0-9]+)$/i);
  const rootMatch = normalized.match(
    /^_NET_ACTIVE_WINDOW\(WINDOW\): window id # (0x[0-9a-f]+|[0-9]+)$/i,
  );
  const match = plainMatch ?? rootMatch;
  invariant(
    match !== null,
    'X11 window output must contain exactly one decimal or hexadecimal ID.',
  );
  return parseBoundedIntegerToken(match[1], 'X11 window ID', X11_ID_MAX);
}

export function parseX11WindowList(output) {
  invariant(typeof output === 'string', 'X11 window list output must be a string.');
  const match = output.trim().match(
    /^_NET_CLIENT_LIST\(WINDOW\): window id # (.+)$/,
  );
  invariant(
    match !== null,
    '_NET_CLIENT_LIST must contain one or more X11 window IDs.',
  );
  const tokens = match[1].split(', ');
  invariant(
    tokens.length > 0
      && tokens.every((token) => /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(token)),
    '_NET_CLIENT_LIST contains an invalid X11 window ID.',
  );
  const windowIds = tokens.map((token) => parseBoundedIntegerToken(
    token,
    '_NET_CLIENT_LIST window ID',
    X11_ID_MAX,
  ));
  invariant(
    new Set(windowIds).size === windowIds.length,
    '_NET_CLIENT_LIST contains duplicate X11 window IDs.',
  );
  return Object.freeze(windowIds);
}

export function parseWmPid(output) {
  invariant(typeof output === 'string', 'WM PID output must be a string.');
  const match = output.trim().match(
    /^_NET_WM_PID\(CARDINAL\) = ([0-9]+)$/,
  );
  invariant(match !== null, 'WM PID output must contain exactly one PID.');
  return parseBoundedIntegerToken(
    match[1],
    'WM PID',
    Number.MAX_SAFE_INTEGER,
  );
}

export function parseWmClassRecord(output) {
  invariant(typeof output === 'string', 'WM_CLASS output must be a string.');
  const match = output.trim().match(
    /^WM_CLASS\(STRING\) = "([^"\r\n]+)", "([^"\r\n]+)"$/,
  );
  invariant(
    match !== null,
    'WM_CLASS output must contain exactly one instance and class.',
  );
  return Object.freeze({
    instance: match[1],
    class: match[2],
  });
}

function isGoogleChromeWmClass(wmClass) {
  return (
    wmClass
    && /^google-chrome(?:-stable)?$/i.test(wmClass.instance)
    && /^Google-chrome$/i.test(wmClass.class)
  );
}

export function parseWmClass(output) {
  const wmClass = parseWmClassRecord(output);
  invariant(
    /^google-chrome(?:-stable)?$/i.test(wmClass.instance),
    'The active X11 window is not a Google Chrome instance.',
  );
  invariant(
    /^Google-chrome$/i.test(wmClass.class),
    'The active X11 window is not the Google Chrome window class.',
  );
  return wmClass;
}

export function selectSingleChromeX11Client(
  clientIdentities,
  expectedBrowserPid,
) {
  invariant(
    Array.isArray(clientIdentities),
    'X11 client identities must be an array.',
  );
  boundedPositiveInteger(expectedBrowserPid, 'Expected CDP browser PID');
  const browserPidClients = clientIdentities.filter(
    (identity) => identity?.wmPid === expectedBrowserPid,
  );
  const sanitizedIdentitySummary = browserPidClients.map((identity) => ({
    windowId: identity.windowId,
    wmPid: identity.wmPid,
    wmClass: identity.wmClass,
  }));
  invariant(
    browserPidClients.every((identity) => (
      isGoogleChromeWmClass(identity.wmClass)
    )),
    'An X11 client for the CDP browser PID has a non-Chrome WM_CLASS: '
      + `${JSON.stringify(sanitizedIdentitySummary)}.`,
  );
  invariant(
    browserPidClients.length === 1,
    'The root X11 client list must contain exactly one Google Chrome window '
      + `for the CDP browser PID: ${JSON.stringify(sanitizedIdentitySummary)}.`,
  );
  return Object.freeze({
    ...browserPidClients[0],
    wmClass: Object.freeze({ ...browserPidClients[0].wmClass }),
  });
}

async function runFixedCommand(command, args) {
  try {
    const { stdout } = await execFile(command, args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
    });
    return stdout;
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    const suffix = code === undefined ? '' : ` (${String(code)})`;
    throw new Error(`${command} failed${suffix}.`, { cause: error });
  }
}

async function readXdotoolVersion() {
  const output = (await runFixedCommand('xdotool', ['version'])).trim();
  const match = output.match(/^xdotool version ([0-9][0-9A-Za-z.+~-]*)$/);
  invariant(match !== null, 'xdotool returned an unrecognized version.');
  return match[1];
}

async function readActiveX11Snapshot(expectedBrowserPid) {
  const [xdotoolOutput, rootOutput] = await Promise.all([
    runFixedCommand('xdotool', ['getactivewindow']),
    runFixedCommand('xprop', ['-root', '_NET_ACTIVE_WINDOW']),
  ]);
  const xdotoolActiveWindowId = parseX11WindowId(xdotoolOutput);
  const rootActiveWindowId = parseX11WindowId(rootOutput);
  invariant(
    xdotoolActiveWindowId === rootActiveWindowId,
    'xdotool and _NET_ACTIVE_WINDOW disagree about the active X11 window.',
  );

  const windowIdArgument = `0x${xdotoolActiveWindowId.toString(16)}`;
  const [pidOutput, classOutput] = await Promise.all([
    runFixedCommand('xprop', [
      '-id',
      windowIdArgument,
      '_NET_WM_PID',
    ]),
    runFixedCommand('xprop', [
      '-id',
      windowIdArgument,
      'WM_CLASS',
    ]),
  ]);
  const wmPid = parseWmPid(pidOutput);
  const wmClass = parseWmClass(classOutput);
  invariant(
    wmPid === expectedBrowserPid,
    'The active X11 window PID does not match the CDP browser PID.',
  );

  return Object.freeze({
    xdotoolActiveWindowId,
    rootActiveWindowId,
    wmPid,
    wmClass,
  });
}

async function readX11ClientIdentity(windowId, expectedBrowserPid) {
  const windowIdArgument = `0x${windowId.toString(16)}`;
  let wmPid;
  try {
    const pidOutput = await runFixedCommand('xprop', [
      '-id',
      windowIdArgument,
      '_NET_WM_PID',
    ]);
    wmPid = parseWmPid(pidOutput);
  } catch {
    return Object.freeze({
      windowId,
      wmPid: null,
      wmClass: null,
    });
  }
  if (wmPid !== expectedBrowserPid) {
    return Object.freeze({
      windowId,
      wmPid,
      wmClass: null,
    });
  }
  const classOutput = await runFixedCommand('xprop', [
    '-id',
    windowIdArgument,
    'WM_CLASS',
  ]);
  return Object.freeze({
    windowId,
    wmPid,
    wmClass: parseWmClassRecord(classOutput),
  });
}

async function discoverChromeX11Client(expectedBrowserPid) {
  const clientWindowIds = parseX11WindowList(
    await runFixedCommand('xprop', ['-root', '_NET_CLIENT_LIST']),
  );
  const inspected = await Promise.all(
    clientWindowIds.map((windowId) => readX11ClientIdentity(
      windowId,
      expectedBrowserPid,
    )),
  );
  const browserPidClientIdentities = inspected.filter(
    (identity) => identity.wmPid === expectedBrowserPid,
  );
  const matchingChromeWindows = browserPidClientIdentities.filter(
    (identity) => isGoogleChromeWmClass(identity.wmClass),
  );
  const target = selectSingleChromeX11Client(
    inspected,
    expectedBrowserPid,
  );
  return Object.freeze({
    discoveryMethod: '_NET_CLIENT_LIST + _NET_WM_PID + WM_CLASS',
    discoveryProperty: '_NET_CLIENT_LIST',
    observedClientWindowCount: clientWindowIds.length,
    browserPidClientCount: browserPidClientIdentities.length,
    matchingChromeWindowCount: matchingChromeWindows.length,
    browserPidClientIdentities: Object.freeze(
      browserPidClientIdentities.map((identity) => Object.freeze({
        ...identity,
        wmClass: Object.freeze({ ...identity.wmClass }),
      })),
    ),
    target,
  });
}

async function waitForChromeX11Client(expectedBrowserPid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      return await discoverChromeX11Client(expectedBrowserPid);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  throw new Error(
    'The selected Google Chrome X11 client window was not discovered: '
      + `${lastError?.message ?? 'unknown X11 client-list failure'}`,
    { cause: lastError },
  );
}

async function activateChromeX11Client(expectedBrowserPid, timeoutMs) {
  const discovery = await waitForChromeX11Client(
    expectedBrowserPid,
    timeoutMs,
  );
  const targetWindowId = discovery.target.windowId;
  const command = {
    action: 'windowactivate',
    sync: true,
    attemptCount: 1,
    targetWindowId,
    succeeded: false,
  };
  await runFixedCommand('xdotool', [
    'windowactivate',
    '--sync',
    `0x${targetWindowId.toString(16)}`,
  ]);
  command.succeeded = true;
  const activeSnapshot = await waitForActiveX11Snapshot(
    expectedBrowserPid,
    timeoutMs,
    'After initial Chrome activation',
  );
  invariant(
    activeSnapshot.xdotoolActiveWindowId === targetWindowId
      && activeSnapshot.rootActiveWindowId === targetWindowId,
    'Initial X11 activation did not select the discovered Chrome window.',
  );
  return Object.freeze({
    discovery,
    command: Object.freeze({ ...command }),
    activeSnapshot,
  });
}

async function waitForActiveX11Snapshot(expectedBrowserPid, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      return await readActiveX11Snapshot(expectedBrowserPid);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  throw new Error(
    `${label} did not expose the active Google Chrome X11 window: `
      + `${lastError?.message ?? 'unknown X11 inspection failure'}`,
    { cause: lastError },
  );
}

async function readBrowserPid(browserCdpSession) {
  const response = await browserCdpSession.send('SystemInfo.getProcessInfo');
  const browserProcesses = (response?.processInfo ?? []).filter(
    (process) => process?.type === 'browser',
  );
  invariant(
    browserProcesses.length === 1,
    'CDP must expose exactly one browser process.',
  );
  return boundedPositiveInteger(
    browserProcesses[0].id,
    'CDP browser PID',
  );
}

async function readPageTarget(page, context, browserCdpSession) {
  const pageSession = await context.newCDPSession(page);
  try {
    const { targetInfo } = await pageSession.send('Target.getTargetInfo');
    invariant(
      typeof targetInfo?.targetId === 'string'
        && /^[0-9a-f]+$/i.test(targetInfo.targetId),
      'CDP did not expose a valid page target ID.',
    );
    const windowForTarget = await browserCdpSession.send(
      'Browser.getWindowForTarget',
      { targetId: targetInfo.targetId },
    );
    const browserWindowId = boundedPositiveInteger(
      windowForTarget?.windowId,
      'CDP browser window ID',
    );
    return {
      targetId: targetInfo.targetId,
      browserWindowId,
      internalNewTab: INTERNAL_NEW_TAB_LOCATIONS.has(targetInfo.url),
    };
  } finally {
    await pageSession.detach();
  }
}

async function readVisibility(page, label) {
  invariant(page && !page.isClosed(), `${label} page is not open.`);
  const result = await page.evaluate(() => ({
    documentHidden: document.hidden,
    visibilityState: document.visibilityState,
  }));
  invariant(
    typeof result?.documentHidden === 'boolean'
      && ['hidden', 'visible'].includes(result.visibilityState),
    `${label} did not expose a valid Page Visibility state.`,
  );
  return result;
}

async function waitForPageVisibility(
  page,
  expectedHidden,
  timeoutMs,
  label,
) {
  const deadline = Date.now() + timeoutMs;
  let lastVisibility;
  while (Date.now() <= deadline) {
    lastVisibility = await readVisibility(page, label);
    if (
      lastVisibility.documentHidden === expectedHidden
      && lastVisibility.visibilityState
        === (expectedHidden ? 'hidden' : 'visible')
    ) {
      return lastVisibility;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  throw new Error(
    `${label} did not reach ${expectedHidden ? 'hidden' : 'visible'}: `
      + `${JSON.stringify(lastVisibility)}.`,
  );
}

async function pollVisibilityPair({
  candidatePage,
  foregroundPage,
  expectedCandidateHidden,
  ready,
  timeoutMs,
  label,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastPair;
  let lastReadyResult;
  while (Date.now() <= deadline) {
    const [candidate, foreground] = await Promise.all([
      readVisibility(candidatePage, 'Candidate'),
      readVisibility(foregroundPage, 'Foreground'),
    ]);
    lastPair = { candidate, foreground };
    const visibilityMatches = (
      candidate.documentHidden === expectedCandidateHidden
      && candidate.visibilityState
        === (expectedCandidateHidden ? 'hidden' : 'visible')
      && foreground.documentHidden !== expectedCandidateHidden
      && foreground.visibilityState
        === (expectedCandidateHidden ? 'visible' : 'hidden')
    );
    if (visibilityMatches) {
      lastReadyResult = ready
        ? await ready({
          candidatePage,
          foregroundPage,
          settledState: lastPair,
        })
        : {};
      if (lastReadyResult !== null && lastReadyResult !== undefined) {
        return {
          settledState: lastPair,
          readyResult: lastReadyResult,
        };
      }
    }
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  throw new Error(
    `${label} did not reach mutually exclusive native visibility and readiness: `
      + `${JSON.stringify({ lastPair, ready: lastReadyResult != null })}.`,
  );
}

function openPageCount(context) {
  return context.pages().filter((page) => !page.isClosed()).length;
}

function assertSameActiveWindow(reference, snapshots) {
  for (const [phase, snapshot] of Object.entries(snapshots)) {
    invariant(
      snapshot.xdotoolActiveWindowId === reference.xdotoolActiveWindowId
        && snapshot.rootActiveWindowId === reference.rootActiveWindowId,
      `The active Chrome X11 window changed during ${phase}.`,
    );
  }
}

async function sendXdotoolChord(chord) {
  await runFixedCommand('xdotool', [
    'key',
    '--clearmodifiers',
    chord,
  ]);
}

function normalizeTimeout(timeoutMs) {
  invariant(
    Number.isSafeInteger(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= 60_000,
    'X11 visibility timeout must be between 1,000 and 60,000 ms.',
  );
  return timeoutMs;
}

function combineErrors(primaryError, cleanupErrors) {
  if (cleanupErrors.length === 0) return primaryError;
  return new AggregateError(
    [primaryError, ...cleanupErrors].filter(Boolean),
    primaryError
      ? 'X11 tab lifecycle and its cleanup failed.'
      : 'X11 tab lifecycle cleanup failed.',
  );
}

export async function captureX11TabVisibilityLifecycle({
  browser,
  browserCdpSession,
  context,
  candidatePage,
  hiddenReady,
  visibleReady,
  whileHidden,
  afterVisible,
  beforeOpen,
  timeoutMs = 12_000,
}) {
  invariant(browser?.isConnected(), 'The Chromium browser is not connected.');
  invariant(
    browserCdpSession && typeof browserCdpSession.send === 'function',
    'A browser CDP session is required.',
  );
  invariant(context, 'A Chromium browser context is required.');
  invariant(
    candidatePage && !candidatePage.isClosed(),
    'An open candidate page is required.',
  );
  invariant(
    hiddenReady === undefined || typeof hiddenReady === 'function',
    'hiddenReady must be a function when provided.',
  );
  invariant(
    visibleReady === undefined || typeof visibleReady === 'function',
    'visibleReady must be a function when provided.',
  );
  invariant(
    whileHidden === undefined || typeof whileHidden === 'function',
    'whileHidden must be a function when provided.',
  );
  invariant(
    afterVisible === undefined || typeof afterVisible === 'function',
    'afterVisible must be a function when provided.',
  );
  invariant(
    beforeOpen === undefined || typeof beforeOpen === 'function',
    'beforeOpen must be a function when provided.',
  );
  const visibilityTimeoutMs = normalizeTimeout(timeoutMs);

  const browserPid = await readBrowserPid(browserCdpSession);
  const tool = Object.freeze({
    name: 'xdotool',
    version: await readXdotoolVersion(),
  });
  const candidateTargetDetails = await readPageTarget(
    candidatePage,
    context,
    browserCdpSession,
  );
  const candidateTarget = Object.freeze({
    targetId: candidateTargetDetails.targetId,
    browserWindowId: candidateTargetDetails.browserWindowId,
  });
  const pageCounts = {
    before: openPageCount(context),
    afterOpen: null,
    afterCleanup: null,
  };
  invariant(
    pageCounts.before === 1,
    'The X11 lifecycle probe requires exactly one initial context page.',
  );

  const initialActivation = await activateChromeX11Client(
    browserPid,
    visibilityTimeoutMs,
  );
  const activationCandidateVisibility = await waitForPageVisibility(
    candidatePage,
    false,
    visibilityTimeoutMs,
    'Candidate after initial activation',
  );
  invariant(
    activationCandidateVisibility.documentHidden === false
      && activationCandidateVisibility.visibilityState === 'visible',
    'The candidate page is not visible after initial Chrome activation.',
  );
  const initialActivationEvidence = Object.freeze({
    ...initialActivation.discovery,
    attemptCount: 1,
    activationSnapshot: initialActivation.activeSnapshot,
    candidateVisibility: Object.freeze({
      ...activationCandidateVisibility,
    }),
  });
  const beforeOpenResult = beforeOpen
    ? await beforeOpen({
      candidatePage,
      activationCandidateVisibility,
    })
    : undefined;
  const commands = {
    activateWindow: initialActivation.command,
    openTab: {
      gesture: 'Ctrl+T',
      succeeded: false,
    },
    returnTab: {
      gesture: 'Ctrl+Shift+Tab',
      succeeded: false,
    },
  };
  const x11Snapshots = {
    beforeOpen: await waitForActiveX11Snapshot(
      browserPid,
      visibilityTimeoutMs,
      'Immediately before Ctrl+T',
    ),
    atOpenCommand: null,
    afterOpen: null,
    beforeReturn: null,
    atReturnCommand: null,
    afterReturn: null,
    afterCleanup: null,
  };
  let contextPageEventObserved = false;
  let foregroundPage;
  let foregroundTarget;
  let foregroundClosed = false;
  let cleanupComplete = false;
  let hiddenSettledState;
  let visibleSettledState;
  let hiddenReadyResult;
  let visibleReadyResult;
  let whileHiddenResult;
  let afterVisibleResult;
  let primaryError;
  const cleanupErrors = [];

  try {
    assertSameActiveWindow(initialActivation.activeSnapshot, {
      beforeOpen: x11Snapshots.beforeOpen,
    });
    const pagesBeforeOpen = new Set(context.pages());
    const foregroundPagePromise = context.waitForEvent('page', {
      predicate: (openedPage) => !pagesBeforeOpen.has(openedPage),
      timeout: visibilityTimeoutMs,
    });
    // Attach a rejection handler before emitting the keyboard gesture so a
    // command failure cannot leave the armed Playwright event unobserved.
    foregroundPagePromise.catch(() => {});
    x11Snapshots.atOpenCommand = await waitForActiveX11Snapshot(
      browserPid,
      visibilityTimeoutMs,
      'At Ctrl+T command',
    );
    assertSameActiveWindow(x11Snapshots.beforeOpen, {
      atOpenCommand: x11Snapshots.atOpenCommand,
    });
    await sendXdotoolChord('ctrl+t');
    commands.openTab.succeeded = true;
    foregroundPage = await foregroundPagePromise;
    contextPageEventObserved = true;

    pageCounts.afterOpen = openPageCount(context);
    invariant(
      pageCounts.afterOpen === 2,
      'Ctrl+T must produce exactly one additional context page.',
    );
    x11Snapshots.afterOpen = await waitForActiveX11Snapshot(
      browserPid,
      visibilityTimeoutMs,
      'After Ctrl+T',
    );
    assertSameActiveWindow(x11Snapshots.beforeOpen, {
      afterOpen: x11Snapshots.afterOpen,
    });

    const foregroundTargetDetails = await readPageTarget(
      foregroundPage,
      context,
      browserCdpSession,
    );
    foregroundTarget = Object.freeze({
      targetId: foregroundTargetDetails.targetId,
      browserWindowId: foregroundTargetDetails.browserWindowId,
      internalNewTab: foregroundTargetDetails.internalNewTab,
    });
    invariant(
      foregroundTarget.internalNewTab,
      'Ctrl+T did not create an internal blank Chrome tab.',
    );
    invariant(
      foregroundTarget.targetId !== candidateTarget.targetId,
      'Ctrl+T did not create a distinct CDP page target.',
    );
    invariant(
      foregroundTarget.browserWindowId === candidateTarget.browserWindowId,
      'The candidate and foreground tabs are not in the same CDP window.',
    );
    // Keep the real Ctrl+T-created tab and its CDP target, but leave Chrome's
    // privileged new-tab WebUI before evaluating Page Visibility. This local
    // navigation avoids WebUI CSP/Trusted Types without manufacturing a tab.
    await foregroundPage.goto('about:blank', { waitUntil: 'load' });
    const navigatedForegroundTarget = await readPageTarget(
      foregroundPage,
      context,
      browserCdpSession,
    );
    invariant(
      navigatedForegroundTarget.targetId === foregroundTarget.targetId
        && navigatedForegroundTarget.browserWindowId
          === foregroundTarget.browserWindowId,
      'The foreground witness target changed during local blank navigation.',
    );

    const hiddenPoll = await pollVisibilityPair({
      candidatePage,
      foregroundPage,
      expectedCandidateHidden: true,
      ready: hiddenReady,
      timeoutMs: visibilityTimeoutMs,
      label: 'Ctrl+T',
    });
    hiddenSettledState = hiddenPoll.settledState;
    hiddenReadyResult = hiddenPoll.readyResult;
    if (whileHidden) {
      whileHiddenResult = await whileHidden({
        candidatePage,
        foregroundPage,
        settledState: hiddenSettledState,
        readyResult: hiddenReadyResult,
      });
    }

    x11Snapshots.beforeReturn = await waitForActiveX11Snapshot(
      browserPid,
      visibilityTimeoutMs,
      'Before Ctrl+Shift+Tab',
    );
    assertSameActiveWindow(x11Snapshots.beforeOpen, {
      beforeReturn: x11Snapshots.beforeReturn,
    });
    x11Snapshots.atReturnCommand = await waitForActiveX11Snapshot(
      browserPid,
      visibilityTimeoutMs,
      'At Ctrl+Shift+Tab command',
    );
    assertSameActiveWindow(x11Snapshots.beforeOpen, {
      atReturnCommand: x11Snapshots.atReturnCommand,
    });
    await sendXdotoolChord('ctrl+shift+Tab');
    commands.returnTab.succeeded = true;

    const visiblePoll = await pollVisibilityPair({
      candidatePage,
      foregroundPage,
      expectedCandidateHidden: false,
      ready: visibleReady,
      timeoutMs: visibilityTimeoutMs,
      label: 'Ctrl+Shift+Tab',
    });
    visibleSettledState = visiblePoll.settledState;
    visibleReadyResult = visiblePoll.readyResult;
    x11Snapshots.afterReturn = await waitForActiveX11Snapshot(
      browserPid,
      visibilityTimeoutMs,
      'After Ctrl+Shift+Tab',
    );
    assertSameActiveWindow(x11Snapshots.beforeOpen, {
      afterReturn: x11Snapshots.afterReturn,
    });
    if (afterVisible) {
      afterVisibleResult = await afterVisible({
        candidatePage,
        foregroundPage,
        settledState: visibleSettledState,
        readyResult: visibleReadyResult,
      });
    }

    await foregroundPage.close({ runBeforeUnload: false });
    foregroundClosed = foregroundPage.isClosed();
    invariant(foregroundClosed, 'The foreground witness tab did not close.');
    pageCounts.afterCleanup = openPageCount(context);
    invariant(
      pageCounts.afterCleanup === 1,
      'Closing the foreground witness must restore one context page.',
    );
    x11Snapshots.afterCleanup = await waitForActiveX11Snapshot(
      browserPid,
      visibilityTimeoutMs,
      'After foreground cleanup',
    );
    assertSameActiveWindow(x11Snapshots.beforeOpen, {
      afterCleanup: x11Snapshots.afterCleanup,
    });
    const finalCandidateVisibility = await waitForPageVisibility(
      candidatePage,
      false,
      visibilityTimeoutMs,
      'Candidate',
    );
    invariant(
      finalCandidateVisibility.documentHidden === false
        && finalCandidateVisibility.visibilityState === 'visible',
      'The candidate page is not visible after witness cleanup.',
    );
    cleanupComplete = true;
  } catch (error) {
    primaryError = error;
  } finally {
    if (primaryError) {
      const extraPages = context.pages().filter(
        (page) => page !== candidatePage && !page.isClosed(),
      );
      if (extraPages.length > 0) {
        for (const extraPage of extraPages) {
          try {
            await extraPage.close({ runBeforeUnload: false });
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
      }

      try {
        pageCounts.afterCleanup = openPageCount(context);
        invariant(
          pageCounts.afterCleanup === 1,
          'Failure cleanup did not restore exactly one context page.',
        );
        const finalCandidateVisibility = await waitForPageVisibility(
          candidatePage,
          false,
          visibilityTimeoutMs,
          'Candidate',
        );
        invariant(
          finalCandidateVisibility.documentHidden === false
            && finalCandidateVisibility.visibilityState === 'visible',
          'Failure cleanup did not restore candidate visibility.',
        );
        x11Snapshots.afterCleanup = await waitForActiveX11Snapshot(
          browserPid,
          visibilityTimeoutMs,
          'After failure cleanup',
        );
        assertSameActiveWindow(x11Snapshots.beforeOpen, {
          afterCleanup: x11Snapshots.afterCleanup,
        });
        foregroundClosed = extraPages.every((page) => page.isClosed());
        cleanupComplete = foregroundClosed;
        invariant(cleanupComplete, 'Failure cleanup was incomplete.');
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (primaryError || cleanupErrors.length > 0) {
    throw combineErrors(primaryError, cleanupErrors);
  }

  return {
    x11TabControl: {
      tool,
      browserPid,
      candidateTarget,
      foregroundTarget,
      initialActivation: initialActivationEvidence,
      contextPageEventObserved,
      pageCounts: Object.freeze({ ...pageCounts }),
      commands: {
        activateWindow: commands.activateWindow,
        openTab: Object.freeze({ ...commands.openTab }),
        returnTab: Object.freeze({ ...commands.returnTab }),
      },
      x11Snapshots: {
        beforeOpen: x11Snapshots.beforeOpen,
        atOpenCommand: x11Snapshots.atOpenCommand,
        afterOpen: x11Snapshots.afterOpen,
        beforeReturn: x11Snapshots.beforeReturn,
        atReturnCommand: x11Snapshots.atReturnCommand,
        afterReturn: x11Snapshots.afterReturn,
        afterCleanup: x11Snapshots.afterCleanup,
      },
      foregroundClosed,
      cleanupComplete,
    },
    beforeOpenResult,
    hiddenSettledState,
    visibleSettledState,
    hiddenReadyResult,
    whileHiddenResult,
    visibleReadyResult,
    afterVisibleResult,
  };
}
