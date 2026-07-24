import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'playwright-core';
const TARGET_RELATIVE_PATH =
  'node_modules/playwright-core/lib/server/chromium/crPage.js';
const ORIGINAL_FOCUS_CALL =
  'this._client.send("Emulation.setFocusEmulationEnabled", { enabled: true })';
const PATCHED_FOCUS_CALL =
  'this._client.send("Emulation.setFocusEmulationEnabled", { enabled: false })';

export const M15_PLAYWRIGHT_NATIVE_VISIBILITY_POLICY = Object.freeze({
  packageName: PACKAGE_NAME,
  packageVersion: '1.56.1',
  targetRelativePath: TARGET_RELATIVE_PATH,
  originalSha256:
    '79a25e4eac0d0fa97dcc6eae4edce83436bcdb4bb1322731f65610adaa8e150f',
  patchedSha256:
    'e0ec5890e92413dbb0599f3ed12b0b463fbd81cad62d3b2642dd4554e5d0efea',
  originalFocusCall: ORIGINAL_FOCUS_CALL,
  patchedFocusCall: PATCHED_FOCUS_CALL,
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactOccurrenceCount(source, needle) {
  if (!needle) return 0;
  return source.split(needle).length - 1;
}

function validatePolicy(policy) {
  invariant(
    policy
      && typeof policy === 'object'
      && typeof policy.packageName === 'string'
      && policy.packageName
      && typeof policy.packageVersion === 'string'
      && policy.packageVersion
      && typeof policy.targetRelativePath === 'string'
      && policy.targetRelativePath
      && /^[0-9a-f]{64}$/.test(policy.originalSha256)
      && /^[0-9a-f]{64}$/.test(policy.patchedSha256)
      && policy.originalSha256 !== policy.patchedSha256
      && typeof policy.originalFocusCall === 'string'
      && policy.originalFocusCall
      && typeof policy.patchedFocusCall === 'string'
      && policy.patchedFocusCall
      && policy.originalFocusCall !== policy.patchedFocusCall,
    'The Playwright native-visibility patch policy is invalid.',
  );
}

function packageTargetRelativePath(policy) {
  const packagePrefix = `node_modules/${policy.packageName}/`;
  invariant(
    policy.targetRelativePath.startsWith(packagePrefix)
      && policy.targetRelativePath.length > packagePrefix.length,
    'The Playwright target path must be inside its exact node_modules package.',
  );
  return policy.targetRelativePath.slice(packagePrefix.length);
}

function createPolicyReport(policy, status) {
  invariant(
    ['patched', 'already-patched'].includes(status),
    'The Playwright patch status is invalid.',
  );
  return Object.freeze({
    schemaVersion: 1,
    status,
    playwrightVersion: policy.packageVersion,
    targetRelativePath: policy.targetRelativePath,
    originalSha256: policy.originalSha256,
    patchedSha256: policy.patchedSha256,
    observedSha256: policy.patchedSha256,
    replacementCount: 1,
    focusEmulationEnabled: false,
    method: 'exact-hash-source-patch',
  });
}

export function planPlaywrightNativeVisibilityPatch({
  packageVersion,
  resolvedTargetPath,
  expectedTargetPath,
  source,
  policy = M15_PLAYWRIGHT_NATIVE_VISIBILITY_POLICY,
}) {
  validatePolicy(policy);
  invariant(
    packageVersion === policy.packageVersion,
    `Expected ${policy.packageName} ${policy.packageVersion}, `
      + `received ${String(packageVersion)}.`,
  );
  invariant(
    typeof resolvedTargetPath === 'string'
      && typeof expectedTargetPath === 'string'
      && path.resolve(resolvedTargetPath) === path.resolve(expectedTargetPath),
    `Resolved Playwright target path does not match `
      + `${policy.targetRelativePath}.`,
  );
  invariant(
    typeof source === 'string',
    'The Playwright target source must be UTF-8 text.',
  );

  const observedSha256Before = sha256(source);
  const originalOccurrenceCount = exactOccurrenceCount(
    source,
    policy.originalFocusCall,
  );
  const patchedOccurrenceCountBefore = exactOccurrenceCount(
    source,
    policy.patchedFocusCall,
  );

  let status;
  let replacementCount;
  let outputSource;
  if (observedSha256Before === policy.originalSha256) {
    invariant(
      originalOccurrenceCount === 1
        && patchedOccurrenceCountBefore === 0,
      'The original Playwright focus-emulation call must occur exactly once.',
    );
    outputSource = source.replace(
      policy.originalFocusCall,
      policy.patchedFocusCall,
    );
    status = 'patched';
    replacementCount = 1;
  } else if (observedSha256Before === policy.patchedSha256) {
    invariant(
      originalOccurrenceCount === 0
        && patchedOccurrenceCountBefore === 1,
      'The patched Playwright focus-emulation call must occur exactly once.',
    );
    outputSource = source;
    status = 'already-patched';
    replacementCount = 0;
  } else {
    throw new Error(
      'Unexpected Playwright target SHA-256 '
        + `${observedSha256Before}; original call count `
        + `${originalOccurrenceCount}, patched call count `
        + `${patchedOccurrenceCountBefore}.`,
    );
  }

  const observedSha256After = sha256(outputSource);
  const originalOccurrenceCountAfter = exactOccurrenceCount(
    outputSource,
    policy.originalFocusCall,
  );
  const patchedOccurrenceCountAfter = exactOccurrenceCount(
    outputSource,
    policy.patchedFocusCall,
  );
  invariant(
    observedSha256After === policy.patchedSha256,
    `Patched Playwright target SHA-256 is ${observedSha256After}, `
      + `expected ${policy.patchedSha256}.`,
  );
  invariant(
    originalOccurrenceCountAfter === 0
      && patchedOccurrenceCountAfter === 1,
    'The prepared Playwright source does not contain exactly one disabled '
      + 'focus-emulation call.',
  );

  return Object.freeze({
    outputSource,
    appliedThisRun: status === 'patched',
    report: createPolicyReport(policy, status),
    diagnostics: Object.freeze({
      observedSha256Before,
      observedSha256After,
      appliedReplacementCount: replacementCount,
      originalOccurrenceCountBefore: originalOccurrenceCount,
      patchedOccurrenceCountBefore,
      originalOccurrenceCountAfter,
      patchedOccurrenceCountAfter,
    }),
  });
}

async function writeAtomically(filename, contents, mode) {
  const temporaryPath = `${filename}.m15-${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, {
      encoding: 'utf8',
      mode,
      flag: 'wx',
    });
    await rename(temporaryPath, filename);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

export async function preparePlaywrightNativeVisibility({
  packageRoot,
  artifactPath,
  policy = M15_PLAYWRIGHT_NATIVE_VISIBILITY_POLICY,
}) {
  validatePolicy(policy);
  invariant(
    typeof packageRoot === 'string' && path.isAbsolute(packageRoot),
    'packageRoot must be an absolute path.',
  );
  invariant(
    typeof artifactPath === 'string' && path.isAbsolute(artifactPath),
    'artifactPath must be an absolute path.',
  );

  const canonicalPackageRoot = await realpath(packageRoot);
  const packageJsonPath = path.join(
    canonicalPackageRoot,
    'package.json',
  );
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  invariant(
    packageJson?.name === policy.packageName,
    `Expected package ${policy.packageName}, received `
      + `${String(packageJson?.name)}.`,
  );

  const expectedTargetPath = path.join(
    canonicalPackageRoot,
    packageTargetRelativePath(policy),
  );
  const resolvedTargetPath = await realpath(expectedTargetPath);
  const source = await readFile(resolvedTargetPath, 'utf8');
  const plan = planPlaywrightNativeVisibilityPatch({
    packageVersion: packageJson.version,
    resolvedTargetPath,
    expectedTargetPath,
    source,
    policy,
  });

  if (plan.appliedThisRun) {
    const targetStat = await stat(resolvedTargetPath);
    const currentSource = await readFile(resolvedTargetPath, 'utf8');
    invariant(
      sha256(currentSource) === plan.diagnostics.observedSha256Before,
      'Playwright target changed while the native-visibility patch was prepared.',
    );
    await writeAtomically(
      resolvedTargetPath,
      plan.outputSource,
      targetStat.mode,
    );
  }

  const verifiedSource = await readFile(resolvedTargetPath, 'utf8');
  invariant(
    sha256(verifiedSource) === policy.patchedSha256
      && exactOccurrenceCount(verifiedSource, policy.originalFocusCall) === 0
      && exactOccurrenceCount(verifiedSource, policy.patchedFocusCall) === 1,
    'Playwright native-visibility patch readback failed.',
  );

  const artifact = plan.report;
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    {
      encoding: 'utf8',
      flag: 'w',
    },
  );
  return Object.freeze(artifact);
}

export async function verifyPlaywrightNativeVisibility({
  packageRoot,
  policy = M15_PLAYWRIGHT_NATIVE_VISIBILITY_POLICY,
}) {
  validatePolicy(policy);
  invariant(
    typeof packageRoot === 'string' && path.isAbsolute(packageRoot),
    'packageRoot must be an absolute path.',
  );
  const canonicalPackageRoot = await realpath(packageRoot);
  const packageJson = JSON.parse(await readFile(
    path.join(canonicalPackageRoot, 'package.json'),
    'utf8',
  ));
  invariant(
    packageJson?.name === policy.packageName
      && packageJson?.version === policy.packageVersion,
    `Runtime verification requires ${policy.packageName} `
      + `${policy.packageVersion}.`,
  );
  const expectedTargetPath = path.join(
    canonicalPackageRoot,
    packageTargetRelativePath(policy),
  );
  const resolvedTargetPath = await realpath(expectedTargetPath);
  invariant(
    resolvedTargetPath === expectedTargetPath,
    `Resolved Playwright target path does not match `
      + `${policy.targetRelativePath}.`,
  );
  const source = await readFile(resolvedTargetPath, 'utf8');
  invariant(
    sha256(source) === policy.patchedSha256
      && exactOccurrenceCount(source, policy.originalFocusCall) === 0
      && exactOccurrenceCount(source, policy.patchedFocusCall) === 1,
    'Playwright native-visibility runtime verification failed.',
  );
  return createPolicyReport(policy, 'already-patched');
}

export function resolveInstalledPlaywrightCoreRoot(
  parentUrl = import.meta.url,
) {
  const require = createRequire(parentUrl);
  const packageJsonPath = require.resolve(`${PACKAGE_NAME}/package.json`);
  return path.dirname(packageJsonPath);
}

function parseCliArguments(argv) {
  invariant(
    argv.length === 2 && argv[0] === '--artifact',
    'Usage: node scripts/prepare-playwright-native-visibility.mjs '
      + '--artifact <absolute-json-path>',
  );
  const artifactPath = path.resolve(argv[1]);
  invariant(
    path.extname(artifactPath).toLowerCase() === '.json',
    'The native-visibility policy artifact must be a JSON file.',
  );
  return { artifactPath };
}

async function main() {
  const { artifactPath } = parseCliArguments(process.argv.slice(2));
  const packageRoot = resolveInstalledPlaywrightCoreRoot();
  const artifact = await preparePlaywrightNativeVisibility({
    packageRoot,
    artifactPath,
  });
  console.log(
    `Playwright native visibility: ${artifact.status}; `
      + `${artifact.observedSha256}`,
  );
  console.log(`Policy: ${artifactPath}`);
}

const isCli = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  await main();
}
