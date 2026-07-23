import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const M15_PLAYWRIGHT_VERSION = '1.56.1';
export const M15_PLAYWRIGHT_CACHE_ROOT = path.join(
  tmpdir(),
  `boku-m15-playwright-${M15_PLAYWRIGHT_VERSION}`,
);

function requireFromRoot(root) {
  const anchoredRequire = createRequire(path.join(path.resolve(root), 'package.json'));
  const packagePath = anchoredRequire.resolve('playwright/package.json');
  const packageMetadata = anchoredRequire(packagePath);
  if (packageMetadata.version !== M15_PLAYWRIGHT_VERSION) {
    throw new Error(
      `M1.5 QA requires playwright ${M15_PLAYWRIGHT_VERSION}, `
      + `but ${packagePath} is ${packageMetadata.version}.`,
    );
  }
  return anchoredRequire('playwright');
}

function installPinnedRuntime(cacheRoot) {
  const result = spawnSync(
    'npm',
    [
      'install',
      '--prefix',
      cacheRoot,
      '--no-save',
      '--no-package-lock',
      `playwright@${M15_PLAYWRIGHT_VERSION}`,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Could not install the pinned M1.5 Playwright runtime: `
      + `${result.error?.message ?? result.stderr ?? result.status}`,
    );
  }
}

export function loadM15Playwright({
  repositoryRoot = process.cwd(),
  autoInstall = process.env.M15_PLAYWRIGHT_AUTO_INSTALL === '1',
} = {}) {
  const candidateRoots = [
    process.env.M15_PLAYWRIGHT_REQUIRE_ROOT,
    repositoryRoot,
    M15_PLAYWRIGHT_CACHE_ROOT,
  ].filter(Boolean);
  const errors = [];
  for (const root of [...new Set(candidateRoots.map((candidate) => path.resolve(candidate)))]) {
    try {
      return requireFromRoot(root);
    } catch (error) {
      errors.push(`${root}: ${error.message}`);
    }
  }

  if (autoInstall) {
    installPinnedRuntime(M15_PLAYWRIGHT_CACHE_ROOT);
    return requireFromRoot(M15_PLAYWRIGHT_CACHE_ROOT);
  }

  throw new Error(
    `Playwright ${M15_PLAYWRIGHT_VERSION} is an external QA runtime and is not `
    + 'declared in the application manifest, which is outside this audit’s edit scope. '
    + 'Set M15_PLAYWRIGHT_REQUIRE_ROOT to a directory whose node_modules contains the '
    + 'pinned version, or set M15_PLAYWRIGHT_AUTO_INSTALL=1 to install it under /tmp. '
    + `Resolution attempts:\n${errors.join('\n')}`,
  );
}
