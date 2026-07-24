import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  M15_PLAYWRIGHT_NATIVE_VISIBILITY_POLICY,
  planPlaywrightNativeVisibilityPatch,
  preparePlaywrightNativeVisibility,
  verifyPlaywrightNativeVisibility,
} from '../scripts/prepare-playwright-native-visibility.mjs';

const ORIGINAL_CALL =
  'this._client.send("Emulation.setFocusEmulationEnabled", { enabled: true })';
const PATCHED_CALL =
  'this._client.send("Emulation.setFocusEmulationEnabled", { enabled: false })';
const TARGET_RELATIVE_PATH =
  'node_modules/playwright-core/lib/server/chromium/crPage.js';
const PACKAGE_TARGET_RELATIVE_PATH = 'lib/server/chromium/crPage.js';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixturePolicy(originalSource) {
  const patchedSource = originalSource.replace(ORIGINAL_CALL, PATCHED_CALL);
  return Object.freeze({
    packageName: 'playwright-core',
    packageVersion: '1.56.1',
    targetRelativePath: TARGET_RELATIVE_PATH,
    originalSha256: sha256(originalSource),
    patchedSha256: sha256(patchedSource),
    originalFocusCall: ORIGINAL_CALL,
    patchedFocusCall: PATCHED_CALL,
  });
}

function planFixture({
  source,
  packageVersion = '1.56.1',
  resolvedTargetPath = '/tmp/playwright-core/lib/server/chromium/crPage.js',
  expectedTargetPath = resolvedTargetPath,
  policy,
}) {
  return planPlaywrightNativeVisibilityPatch({
    packageVersion,
    resolvedTargetPath,
    expectedTargetPath,
    source,
    policy,
  });
}

test('M1.5 locks the exact Playwright 1.56.1 native visibility policy', () => {
  assert.deepEqual(M15_PLAYWRIGHT_NATIVE_VISIBILITY_POLICY, {
    packageName: 'playwright-core',
    packageVersion: '1.56.1',
    targetRelativePath: TARGET_RELATIVE_PATH,
    originalSha256:
      '79a25e4eac0d0fa97dcc6eae4edce83436bcdb4bb1322731f65610adaa8e150f',
    patchedSha256:
      'e0ec5890e92413dbb0599f3ed12b0b463fbd81cad62d3b2642dd4554e5d0efea',
    originalFocusCall: ORIGINAL_CALL,
    patchedFocusCall: PATCHED_CALL,
  });
  assert.ok(Object.isFrozen(M15_PLAYWRIGHT_NATIVE_VISIBILITY_POLICY));
});

test('M1.5 replaces exactly one forced-active call and verifies hashes', () => {
  const originalSource = [
    'const promises = [];',
    `promises.push(${ORIGINAL_CALL});`,
    'export { promises };',
    '',
  ].join('\n');
  const policy = fixturePolicy(originalSource);
  const plan = planFixture({
    source: originalSource,
    policy,
  });

  assert.equal(plan.report.status, 'patched');
  assert.equal(plan.report.replacementCount, 1);
  assert.equal(plan.report.observedSha256, policy.patchedSha256);
  assert.equal(plan.diagnostics.observedSha256Before, policy.originalSha256);
  assert.equal(plan.diagnostics.observedSha256After, policy.patchedSha256);
  assert.equal(plan.diagnostics.originalOccurrenceCountAfter, 0);
  assert.equal(plan.diagnostics.patchedOccurrenceCountAfter, 1);
  assert.doesNotMatch(plan.outputSource, /enabled: true/);
  assert.match(plan.outputSource, /enabled: false/);
});

test('M1.5 rejects an altered Playwright target even if the call remains', () => {
  const originalSource = `before\n${ORIGINAL_CALL}\nafter\n`;
  const policy = fixturePolicy(originalSource);
  assert.throws(
    () => planFixture({
      source: `changed\n${ORIGINAL_CALL}\nafter\n`,
      policy,
    }),
    /Unexpected Playwright target SHA-256/,
  );
});

test('M1.5 rejects duplicate or missing focus-emulation calls', () => {
  const originalSource = `before\n${ORIGINAL_CALL}\nafter\n`;
  const policy = fixturePolicy(originalSource);
  assert.throws(
    () => planFixture({
      source: `${ORIGINAL_CALL}\n${ORIGINAL_CALL}\n`,
      policy,
    }),
    /original call count 2/,
  );
  assert.throws(
    () => planFixture({
      source: 'no focus emulation call\n',
      policy,
    }),
    /original call count 0/,
  );
});

test('M1.5 rejects Playwright version and resolved-path mismatches', () => {
  const originalSource = `before\n${ORIGINAL_CALL}\nafter\n`;
  const policy = fixturePolicy(originalSource);
  assert.throws(
    () => planFixture({
      source: originalSource,
      packageVersion: '1.56.2',
      policy,
    }),
    /Expected playwright-core 1\.56\.1/,
  );
  assert.throws(
    () => planFixture({
      source: originalSource,
      resolvedTargetPath: '/tmp/elsewhere/crPage.js',
      expectedTargetPath:
        '/tmp/playwright-core/lib/server/chromium/crPage.js',
      policy,
    }),
    /target path does not match/,
  );
});

test('M1.5 accepts only the exact patched source on rerun', () => {
  const originalSource = `before\n${ORIGINAL_CALL}\nafter\n`;
  const policy = fixturePolicy(originalSource);
  const patchedSource = originalSource.replace(ORIGINAL_CALL, PATCHED_CALL);
  const plan = planFixture({
    source: patchedSource,
    policy,
  });

  assert.equal(plan.report.status, 'already-patched');
  assert.equal(plan.report.replacementCount, 1);
  assert.equal(plan.appliedThisRun, false);
  assert.equal(plan.outputSource, patchedSource);
  assert.equal(
    plan.diagnostics.observedSha256Before,
    policy.patchedSha256,
  );
  assert.equal(
    plan.diagnostics.observedSha256After,
    policy.patchedSha256,
  );
});

test('M1.5 writes a verified policy artifact without touching node_modules', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'boku-m15-playwright-policy-'),
  );
  try {
    const packageRoot = path.join(root, 'playwright-core');
    const targetPath = path.join(
      packageRoot,
      PACKAGE_TARGET_RELATIVE_PATH,
    );
    const artifactPath = path.join(root, 'evidence', 'policy.json');
    const originalSource = `before\n${ORIGINAL_CALL}\nafter\n`;
    const policy = fixturePolicy(originalSource);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(
      path.join(packageRoot, 'package.json'),
      `${JSON.stringify({
        name: 'playwright-core',
        version: '1.56.1',
      })}\n`,
    );
    await writeFile(targetPath, originalSource);

    const first = await preparePlaywrightNativeVisibility({
      packageRoot,
      artifactPath,
      policy,
    });
    assert.equal(first.status, 'patched');
    assert.equal(first.observedSha256, policy.patchedSha256);
    assert.equal(
      await readFile(targetPath, 'utf8'),
      originalSource.replace(ORIGINAL_CALL, PATCHED_CALL),
    );

    const firstArtifact = JSON.parse(await readFile(artifactPath, 'utf8'));
    assert.equal(firstArtifact.observedSha256, policy.patchedSha256);
    assert.equal(firstArtifact.focusEmulationEnabled, false);

    const second = await preparePlaywrightNativeVisibility({
      packageRoot,
      artifactPath,
      policy,
    });
    assert.equal(second.status, 'already-patched');
    assert.equal(second.replacementCount, 1);
    assert.equal(second.observedSha256, policy.patchedSha256);

    const verified = await verifyPlaywrightNativeVisibility({
      packageRoot,
      policy,
    });
    assert.deepEqual(verified, second);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
