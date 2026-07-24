import assert from 'node:assert/strict';
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const RUNNER = path.join(ROOT, 'scripts/run-headed-browser-smoke.sh');

async function executable(filename, source) {
  await writeFile(filename, source, 'utf8');
  await chmod(filename, 0o755);
}

async function createFakeCommands(directory) {
  const binaryDirectory = path.join(directory, 'bin');
  await executable(
    path.join(directory, 'make-bin.sh'),
    `#!/usr/bin/env bash
set -e
mkdir -p "$1"
`,
  );
  const makeBin = spawnSync(
    path.join(directory, 'make-bin.sh'),
    [binaryDirectory],
    { encoding: 'utf8' },
  );
  assert.equal(makeBin.status, 0, makeBin.stderr);

  await executable(
    path.join(binaryDirectory, 'openbox'),
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  echo "Openbox 3.6.1"
  exit 0
fi
printf '%s' "$$" > "$M15_FAKE_WM_PID_FILE"
touch "$M15_FAKE_WM_LIVE_FILE"
cleanup() {
  rm -f "$M15_FAKE_WM_LIVE_FILE"
}
trap cleanup EXIT
trap 'cleanup; exit 0' TERM INT
if [[ "\${M15_FAKE_WM_EXIT_IMMEDIATELY:-false}" == true ]]; then
  exit 0
fi
while true; do
  sleep 1
done
`,
  );
  await executable(
    path.join(binaryDirectory, 'xprop'),
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "-root" ]]; then
  echo "_NET_SUPPORTING_WM_CHECK(WINDOW): window id # 0x200001"
  exit 0
fi
if [[ ! -f "$M15_FAKE_WM_LIVE_FILE" ]]; then
  exit 1
fi
if [[ "$*" == *"_NET_SUPPORTING_WM_CHECK"* ]]; then
  echo "_NET_SUPPORTING_WM_CHECK(WINDOW): window id # 0x200001"
fi
if [[ "$*" == *"_NET_WM_NAME"* ]]; then
  echo '_NET_WM_NAME(UTF8_STRING) = "Openbox"'
fi
`,
  );
  await executable(
    path.join(binaryDirectory, 'xdotool'),
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "version" ]]; then
  echo "xdotool version 3.20211022.1"
fi
`,
  );
  await executable(
    path.join(binaryDirectory, 'google-chrome'),
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  echo "Google Chrome 150.0.7871.186"
fi
`,
  );
  await executable(
    path.join(binaryDirectory, 'sha256sum'),
    `#!/usr/bin/env bash
printf '%s  %s\\n' \
  '47e00a55c9e412ccb3b5a128fdf3b34378faecb0190b293829ddee28c6d8659e' \
  "\${1:-}"
`,
  );
  await executable(
    path.join(binaryDirectory, 'stat'),
    `#!/usr/bin/env bash
echo '280960248'
`,
  );
  await executable(
    path.join(binaryDirectory, 'dpkg-query'),
    `#!/usr/bin/env bash
if [[ "$*" == *"google-chrome-stable"* ]]; then
  printf '150.0.7871.186-1'
fi
`,
  );
  await executable(
    path.join(binaryDirectory, 'node'),
    `#!/usr/bin/env bash
if [[ "\${1:-}" == "scripts/prepare-playwright-native-visibility.mjs" ]]; then
  test "\${2:-}" = "--artifact"
  printf '{}\\n' > "\${3:?missing native visibility artifact}"
  exit 0
fi
printf '%s' "$*" > "$M15_FAKE_NODE_MARKER"
exit "\${M15_FAKE_NODE_STATUS:-0}"
`,
  );
  return binaryDirectory;
}

async function withFakeEnvironment(run) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'boku-m15-headed-runner-'),
  );
  try {
    const binaryDirectory = await createFakeCommands(directory);
    const paths = {
      artifactDirectory: path.join(directory, 'artifacts'),
      liveFile: path.join(directory, 'wm-live'),
      nodeMarker: path.join(directory, 'node-invoked'),
      pidFile: path.join(directory, 'wm-pid'),
    };
    const environment = {
      ...process.env,
      BROWSER_ARTIFACT_DIR: paths.artifactDirectory,
      DISPLAY: ':99',
      M15_FAKE_NODE_MARKER: paths.nodeMarker,
      M15_FAKE_WM_LIVE_FILE: paths.liveFile,
      M15_FAKE_WM_PID_FILE: paths.pidFile,
      M15_JAPANESE_FONT_FILE: '/usr/share/fonts/opentype/noto/fake.ttc',
      M15_JAPANESE_FONT_MATCH: 'Noto Sans CJK JP',
      M15_JAPANESE_FONT_PACKAGE_VERSION: '1:20230817+repack1-3',
      M15_JAPANESE_FONT_SHA256: 'a'.repeat(64),
      M15_RUNNER_OS_IMAGE: 'ubuntu-24.04',
      M15_GOOGLE_CHROME_VERSION: '150.0.7871.186',
      M15_GOOGLE_CHROME_PACKAGE_VERSION: '150.0.7871.186-1',
      M15_GOOGLE_CHROME_ELF_BYTES: '280960248',
      M15_GOOGLE_CHROME_ELF_SHA256:
        '47e00a55c9e412ccb3b5a128fdf3b34378faecb0190b293829ddee28c6d8659e',
      BROWSER_EXECUTABLE_PATH:
        path.join(binaryDirectory, 'google-chrome'),
      BROWSER_EXECUTABLE_SHA256:
        '47e00a55c9e412ccb3b5a128fdf3b34378faecb0190b293829ddee28c6d8659e',
      PATH: `${binaryDirectory}:${process.env.PATH}`,
    };
    await run({ directory, environment, paths });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test('headed runner rejects a stale WM property and never starts Node', async () => {
  await withFakeEnvironment(async ({ environment, paths }) => {
    const result = spawnSync('bash', [RUNNER], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...environment,
        M15_FAKE_WM_EXIT_IMMEDIATELY: 'true',
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /did not publish _NET_SUPPORTING_WM_CHECK/);
    await assert.rejects(readFile(paths.nodeMarker, 'utf8'), /ENOENT/);
  });
});

test('headed runner preserves Node failure and cleans up Openbox', async () => {
  await withFakeEnvironment(async ({ environment, paths }) => {
    const result = spawnSync('bash', [RUNNER], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...environment,
        M15_FAKE_NODE_STATUS: '23',
      },
    });
    assert.equal(result.status, 23, result.stderr);
    assert.equal(
      await readFile(paths.nodeMarker, 'utf8'),
      'scripts/browser-smoke.mjs',
    );
    const windowManagerPid = Number(await readFile(paths.pidFile, 'utf8'));
    assert.throws(
      () => process.kill(windowManagerPid, 0),
      (error) => error?.code === 'ESRCH',
    );
    await assert.rejects(readFile(paths.liveFile, 'utf8'), /ENOENT/);
    assert.match(
      await readFile(
        path.join(paths.artifactDirectory, 'window-manager-environment.txt'),
        'utf8',
      ),
      /supportWindowId=0x200001/,
    );
  });
});

test('headed runner executes an explicit baseline capture command', async () => {
  await withFakeEnvironment(async ({ environment, paths }) => {
    const result = spawnSync(
      'bash',
      [
        RUNNER,
        'node',
        'tools/evidence/capture_m15_baseline.mjs',
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: environment,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(paths.nodeMarker, 'utf8'),
      'tools/evidence/capture_m15_baseline.mjs',
    );
    await assert.rejects(readFile(paths.liveFile, 'utf8'), /ENOENT/);
  });
});
