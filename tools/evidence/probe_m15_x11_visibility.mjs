import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  M15_BROWSER_LIFECYCLE_LAUNCH,
  M15_CHROMIUM_X11_ARGS,
  M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS,
  captureX11TabVisibilityLifecycle,
} from '../../scripts/x11-tab-visibility.mjs';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function positiveIntegerFromEnvironment(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = Number(rawValue);
  invariant(
    Number.isSafeInteger(value) && value > 0,
    `${name} must be a positive integer.`,
  );
  return value;
}

function positiveNumberFromEnvironment(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  const value = Number(rawValue);
  invariant(
    Number.isFinite(value) && value > 0,
    `${name} must be a positive number.`,
  );
  return value;
}

function booleanFromEnvironment(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(rawValue)) return true;
  if (/^(0|false|no|off)$/i.test(rawValue)) return false;
  throw new Error(`${name} must be true or false.`);
}

function sanitizeFailureMessage(value) {
  return String(value)
    .replace(/\b(?:about|chrome|file|https?):\/\/[^\s)'"]+/gi, '[location]')
    .replace(/\bcookie\b/gi, '[browser-state]');
}

function combineFailures(primaryFailure, cleanupFailures) {
  if (cleanupFailures.length === 0) return primaryFailure;
  return new AggregateError(
    [primaryFailure, ...cleanupFailures].filter(Boolean),
    primaryFailure
      ? 'The X11 visibility preflight and browser cleanup failed.'
      : 'The X11 visibility preflight browser cleanup failed.',
  );
}

async function lifecycleEvents(page) {
  return page.evaluate(
    () => [...(globalThis.__m15X11VisibilityEvents ?? [])],
  );
}

function validateLifecycleEvents(events) {
  const hiddenIndex = events.findIndex((event) => (
    event.type === 'visibilitychange'
    && event.documentHidden === true
    && event.visibilityState === 'hidden'
  ));
  const visibleIndex = events.findIndex((event, index) => (
    index > hiddenIndex
    && event.type === 'visibilitychange'
    && event.documentHidden === false
    && event.visibilityState === 'visible'
  ));
  invariant(
    hiddenIndex >= 0 && visibleIndex > hiddenIndex,
    'The candidate did not emit native hidden then visible events.',
  );
  return {
    hiddenEventIndex: hiddenIndex,
    visibleEventIndex: visibleIndex,
  };
}

async function main() {
  const artifactDirectory = path.resolve(
    process.env.BROWSER_ARTIFACT_DIR
      ?? 'diagnostics/visibility-preflight',
  );
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const resultPath = path.join(
    artifactDirectory,
    'visibility-preflight.json',
  );

  let browser;
  let context;
  let browserVersion = '';
  let result;
  let primaryFailure;
  const cleanupFailures = [];
  let viewport;
  let deviceScaleFactor;
  let touchEnabled;

  try {
    const browserExecutablePath = (
      process.env.BROWSER_EXECUTABLE_PATH ?? ''
    ).trim();
    invariant(
      path.isAbsolute(browserExecutablePath)
        && fs.statSync(browserExecutablePath).isFile(),
      'BROWSER_EXECUTABLE_PATH must identify the selected Google Chrome binary.',
    );
    invariant(
      booleanFromEnvironment('BROWSER_HEADLESS', false) === false,
      'The native X11 visibility preflight must run headed.',
    );
    viewport = Object.freeze({
      width: positiveIntegerFromEnvironment(
        'BROWSER_VIEWPORT_WIDTH',
        1280,
      ),
      height: positiveIntegerFromEnvironment(
        'BROWSER_VIEWPORT_HEIGHT',
        720,
      ),
    });
    deviceScaleFactor = positiveNumberFromEnvironment(
      'BROWSER_DEVICE_SCALE_FACTOR',
      1,
    );
    touchEnabled = booleanFromEnvironment('BROWSER_TOUCH', false);

    browser = await chromium.launch({
      headless: false,
      executablePath: browserExecutablePath,
      ignoreDefaultArgs: [
        ...M15_IGNORED_PLAYWRIGHT_BACKGROUNDING_ARGS,
      ],
      args: [...M15_CHROMIUM_X11_ARGS],
    });
    browserVersion = browser.version();
    const browserCdpSession = await browser.newBrowserCDPSession();
    context = await browser.newContext({
      viewport,
      deviceScaleFactor,
      hasTouch: touchEnabled,
      isMobile: touchEnabled,
      locale: 'ja-JP',
    });
    const candidatePage = await context.newPage();
    await candidatePage.setContent(
      '<!doctype html><meta charset="utf-8">'
        + '<main data-m15-x11-candidate>Native visibility candidate</main>',
      { waitUntil: 'load' },
    );
    const lifecycle = await captureX11TabVisibilityLifecycle({
      browser,
      browserCdpSession,
      context,
      candidatePage,
      timeoutMs: 12_000,
      beforeOpen: async ({
        candidatePage: activatedPage,
        activationCandidateVisibility,
      }) => {
        invariant(
          activationCandidateVisibility.documentHidden === false
            && activationCandidateVisibility.visibilityState === 'visible',
          'The preflight candidate is not visible after Chrome activation.',
        );
        await activatedPage.evaluate(() => {
          const events = [{
            sequence: 0,
            type: 'initial',
            documentHidden: document.hidden,
            visibilityState: document.visibilityState,
          }];
          globalThis.__m15X11VisibilityEvents = events;
          document.addEventListener('visibilitychange', () => {
            events.push({
              sequence: events.length,
              type: 'visibilitychange',
              documentHidden: document.hidden,
              visibilityState: document.visibilityState,
            });
          });
        });
        return {
          initialVisibility: activationCandidateVisibility,
        };
      },
      hiddenReady: async ({ candidatePage: observedPage }) => {
        const events = await lifecycleEvents(observedPage);
        const hiddenObserved = events.some((event) => (
          event.type === 'visibilitychange'
          && event.documentHidden === true
          && event.visibilityState === 'hidden'
        ));
        return hiddenObserved ? { lifecycleEvents: events } : null;
      },
      visibleReady: async ({ candidatePage: observedPage }) => {
        const events = await lifecycleEvents(observedPage);
        try {
          return {
            lifecycleEvents: events,
            eventOrder: validateLifecycleEvents(events),
          };
        } catch {
          return null;
        }
      },
    });
    const initialVisibility = lifecycle.beforeOpenResult.initialVisibility;
    const events = lifecycle.visibleReadyResult.lifecycleEvents;
    const eventOrder = validateLifecycleEvents(events);
    result = {
      schemaVersion: 1,
      status: 'passed',
      nodeVersion: process.version,
      browserVersion,
      viewport,
      deviceScaleFactor,
      touchEnabled,
      headed: true,
      browserLifecycleLaunch: M15_BROWSER_LIFECYCLE_LAUNCH,
      x11TabControl: lifecycle.x11TabControl,
      initialVisibility,
      hiddenSettledState: lifecycle.hiddenSettledState,
      visibleSettledState: lifecycle.visibleSettledState,
      visibilityEvents: events,
      eventOrder,
    };
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
  }

  const failure = combineFailures(primaryFailure, cleanupFailures);
  if (failure) {
    result = {
      schemaVersion: 1,
      status: 'failed',
      nodeVersion: process.version,
      browserVersion,
      viewport: viewport ?? null,
      deviceScaleFactor: deviceScaleFactor ?? null,
      touchEnabled: touchEnabled ?? null,
      headed: true,
      browserLifecycleLaunch: M15_BROWSER_LIFECYCLE_LAUNCH,
      failure: {
        name: failure.name || 'Error',
        message: sanitizeFailureMessage(failure.message),
      },
    };
  }
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`M1.5 X11 visibility preflight: ${result.status}`);
  console.log(`Evidence: ${resultPath}`);
  if (failure) {
    console.error(result.failure.message);
    process.exitCode = 1;
  }
}

await main();
