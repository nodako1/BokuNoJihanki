import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const ASSEMBLER = path.join(
  ROOT,
  'tools/evidence/assemble_m15_evidence.py',
);
const PYTHON_PROBE = String.raw`
import importlib.util
import json
from pathlib import Path
import sys
import types

pil = types.ModuleType("PIL")
pil.Image = types.SimpleNamespace()
pil.ImageDraw = types.SimpleNamespace()
pil.ImageOps = types.SimpleNamespace()
pil.__version__ = "test-stub"
sys.modules["PIL"] = pil
spec = importlib.util.spec_from_file_location("m15_evidence", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
payload = json.load(sys.stdin)
runs = [
    module.Run(
        role=entry["role"],
        source=Path("/tmp"),
        state_path=Path("/tmp/state.json"),
        state=entry["state"],
        viewport_key=(1280, 720, 1.0, False),
        device_id=entry["deviceId"],
    )
    for entry in payload
]
try:
    contract = module.validate_render_environment_parity(runs)
except module.EvidenceError as error:
    print(str(error), file=sys.stderr)
    raise SystemExit(2)
print(json.dumps(contract, sort_keys=True))
`;
const X11_CONTRACT_PROBE = String.raw`
import importlib.util
import json
from pathlib import Path
import sys
import types

pil = types.ModuleType("PIL")
pil.Image = types.SimpleNamespace()
pil.ImageDraw = types.SimpleNamespace()
pil.ImageOps = types.SimpleNamespace()
pil.__version__ = "test-stub"
sys.modules["PIL"] = pil
spec = importlib.util.spec_from_file_location("m15_evidence", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
payload = json.load(sys.stdin)
run = module.Run(
    role="candidate-local",
    source=Path("/tmp"),
    state_path=Path("/tmp/state.json"),
    state=payload["state"],
    viewport_key=(1280, 720, 1.0, False),
    device_id="desktop-1280x720",
)
module.validate_x11_tab_lifecycle_contract(run, payload["valid"])
rejected = []
for item in payload["invalid"]:
    contract = item["contract"]
    if item["name"] == "matching-count-float":
        contract["x11TabControl"]["initialActivation"]["matchingChromeWindowCount"] = 1.0
    if item["name"] == "command-attempt-float":
        contract["x11TabControl"]["commands"]["activateWindow"]["attemptCount"] = 1.0
    if item["name"] == "identity-pid-float":
        activation = contract["x11TabControl"]["initialActivation"]
        activation["target"]["wmPid"] = 12345.0
        activation["browserPidClientIdentities"][0]["wmPid"] = 12345.0
    try:
        module.validate_x11_tab_lifecycle_contract(run, contract)
    except module.EvidenceError:
        rejected.append(item["name"])
    else:
        print(f"accepted tampered contract: {item['name']}", file=sys.stderr)
        raise SystemExit(3)
print(json.dumps(rejected))
`;

function renderState() {
  const browserBytes = 280_960_248;
  const browserSha256 =
    '47e00a55c9e412ccb3b5a128fdf3b34378faecb0190b293829ddee28c6d8659e';
  const playwrightNativeVisibility = {
    schemaVersion: 1,
    status: 'already-patched',
    playwrightVersion: '1.56.1',
    targetRelativePath:
      'node_modules/playwright-core/lib/server/chromium/crPage.js',
    originalSha256:
      '79a25e4eac0d0fa97dcc6eae4edce83436bcdb4bb1322731f65610adaa8e150f',
    patchedSha256:
      'e0ec5890e92413dbb0599f3ed12b0b463fbd81cad62d3b2642dd4554e5d0efea',
    observedSha256:
      'e0ec5890e92413dbb0599f3ed12b0b463fbd81cad62d3b2642dd4554e5d0efea',
    replacementCount: 1,
    focusEmulationEnabled: false,
    method: 'exact-hash-source-patch',
  };
  return {
    runtime: {
      nodeVersion: 'v22.18.0',
      browserVersion: '150.0.7871.186',
      browserExecutablePath: '/opt/google/chrome/chrome',
      browserExecutableBytes: browserBytes,
      browserExecutableSha256: browserSha256,
      browserPackageName: 'google-chrome-stable',
      browserPackageVersion: '150.0.7871.186-1',
      browserProcess: {
        pid: 12_345,
        executablePath: '/opt/google/chrome/chrome',
        executableBytes: browserBytes,
        executableSha256: browserSha256,
      },
    },
    browserBinaryContract: {
      packageName: 'google-chrome-stable',
      packageVersion: '150.0.7871.186-1',
      expectedBrowserVersion: '150.0.7871.186',
      executablePath: '/opt/google/chrome/chrome',
      executableBytes: browserBytes,
      executableSha256: browserSha256,
    },
    browserLifecycleLaunch: {
      ignoredPlaywrightDefaultArgs: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
      chromiumArgs: [
        '--use-gl=swiftshader',
        '--enable-webgl',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--ozone-platform=x11',
      ],
      reason:
        'Preserve native Chromium hidden/visible behavior, remove Playwright '
        + 'forced-active focus emulation, and use the real X11 tab-selection '
        + 'path.',
      playwrightNativeVisibility,
    },
    hostEnvironment: {
      runnerOsImage: 'ubuntu-24.04',
      platform: 'linux',
      architecture: 'x64',
    },
    fontEnvironment: {
      japaneseFontMatch: 'Noto Sans CJK JP',
      japaneseFontFile:
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      japaneseFontPackageVersion: '1:20230817+repack1-3',
      japaneseFontSha256: 'a'.repeat(64),
    },
  };
}

function probe(states) {
  return spawnSync(
    'python3',
    ['-B', '-c', PYTHON_PROBE, ASSEMBLER],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: JSON.stringify(states.map((state, index) => ({
        role: index === 0 ? 'baseline' : 'candidate-local',
        deviceId: `device-${index}`,
        state,
      }))),
    },
  );
}

function x11Contract() {
  const browserPid = 12_345;
  const windowId = 4_194_307;
  const wmClass = {
    instance: 'google-chrome',
    class: 'Google-chrome',
  };
  const identity = {
    windowId,
    wmPid: browserPid,
    wmClass,
  };
  const snapshot = () => ({
    xdotoolActiveWindowId: windowId,
    rootActiveWindowId: windowId,
    wmPid: browserPid,
    wmClass,
  });
  const hiddenAudio = {
    sourceId: 'source-1',
    muted: false,
    documentHidden: true,
    masterGain: 0,
    masterGainAutomation: {
      target: 0,
      reason: 'visibility-hidden',
    },
  };
  const visibleSettledAudio = {
    sourceId: 'source-1',
    muted: false,
    documentHidden: false,
    duration: 10,
    offset: 2,
    masterGain: 0.5,
    masterGainAutomation: {
      target: 0.5,
      reason: 'visibility-visible',
    },
  };
  const visibleAudio = {
    ...visibleSettledAudio,
    offset: 2.4,
    lastRecoveryError: null,
  };
  return {
    method: 'x11-xdotool-tab-switch',
    activationCandidateVisibility: {
      documentHidden: false,
      visibilityState: 'visible',
    },
    x11TabControl: {
      tool: {
        name: 'xdotool',
        version: '3.20160805.1',
      },
      browserPid,
      browserProcess: {
        pid: browserPid,
        executablePath: '/opt/google/chrome/chrome',
        executableBytes: 280_960_248,
        executableSha256:
          '47e00a55c9e412ccb3b5a128fdf3b34378faecb0190b293829ddee28c6d8659e',
      },
      candidateTarget: {
        targetId: 'a1',
        browserWindowId: 7,
      },
      foregroundTarget: {
        targetId: 'b2',
        browserWindowId: 7,
        internalNewTab: true,
      },
      initialActivation: {
        discoveryMethod: '_NET_CLIENT_LIST + _NET_WM_PID + WM_CLASS',
        discoveryProperty: '_NET_CLIENT_LIST',
        observedClientWindowCount: 2,
        browserPidClientCount: 1,
        matchingChromeWindowCount: 1,
        browserPidClientIdentities: [identity],
        target: identity,
        attemptCount: 1,
        activationSnapshot: snapshot(),
        candidateVisibility: {
          documentHidden: false,
          visibilityState: 'visible',
        },
      },
      contextPageEventObserved: true,
      pageCounts: {
        before: 1,
        afterOpen: 2,
        afterCleanup: 1,
      },
      commands: {
        activateWindow: {
          action: 'windowactivate',
          sync: true,
          attemptCount: 1,
          targetWindowId: windowId,
          succeeded: true,
        },
        openTab: {
          gesture: 'Ctrl+T',
          succeeded: true,
        },
        returnTab: {
          gesture: 'Ctrl+Shift+Tab',
          succeeded: true,
        },
      },
      x11Snapshots: Object.fromEntries([
        'beforeOpen',
        'atOpenCommand',
        'afterOpen',
        'beforeReturn',
        'atReturnCommand',
        'afterReturn',
        'afterCleanup',
      ].map((name) => [name, snapshot()])),
      foregroundClosed: true,
      cleanupComplete: true,
    },
    beforeHidden: {
      sourceId: 'source-1',
      muted: false,
    },
    hidden: hiddenAudio,
    visible: visibleAudio,
    hiddenSettledState: {
      candidate: {
        documentHidden: true,
        visibilityState: 'hidden',
        audio: hiddenAudio,
      },
      foreground: {
        documentHidden: false,
        visibilityState: 'visible',
      },
    },
    visibleSettledState: {
      candidate: {
        documentHidden: false,
        visibilityState: 'visible',
        audio: visibleSettledAudio,
      },
      foreground: {
        documentHidden: true,
        visibilityState: 'hidden',
      },
    },
    visibleRecoveryDelta: 0.4,
  };
}

function probeX11Contract(payload) {
  return spawnSync(
    'python3',
    ['-B', '-c', X11_CONTRACT_PROBE, ASSEMBLER],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: JSON.stringify(payload),
    },
  );
}

test('Evidence accepts an identical pinned render environment', () => {
  const result = probe([renderState(), renderState()]);
  assert.equal(result.status, 0, result.stderr);
  const contract = JSON.parse(result.stdout);
  assert.equal(contract.hostEnvironment.runnerOsImage, 'ubuntu-24.04');
  assert.equal(
    contract.fontEnvironment.japaneseFontMatch,
    'Noto Sans CJK JP',
  );
});

test('Evidence rejects tofu fonts and cross-run environment drift', () => {
  const tofu = renderState();
  tofu.fontEnvironment.japaneseFontMatch = 'DejaVu Sans';
  let result = probe([tofu]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /did not resolve to Noto Sans CJK JP/);

  const wrongRegion = renderState();
  wrongRegion.fontEnvironment.japaneseFontMatch = 'Noto Sans CJK KR';
  result = probe([wrongRegion]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /did not resolve to Noto Sans CJK JP/);

  const wrongPackage = renderState();
  wrongPackage.runtime.browserPackageVersion = '150.0.7871.128-1';
  result = probe([wrongPackage]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pinned browser package\/process identity/);

  const wrongBrowserVersion = renderState();
  wrongBrowserVersion.runtime.browserVersion = '150.0.7871.128';
  result = probe([wrongBrowserVersion]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /exact pinned browser version is missing/);

  const wrongProcess = renderState();
  wrongProcess.runtime.browserProcess.executableSha256 = 'd'.repeat(64);
  result = probe([wrongProcess]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pinned browser package\/process identity/);

  const wrongElf = renderState();
  const wrongElfSha = 'd'.repeat(64);
  wrongElf.runtime.browserExecutableSha256 = wrongElfSha;
  wrongElf.runtime.browserProcess.executableSha256 = wrongElfSha;
  wrongElf.browserBinaryContract.executableSha256 = wrongElfSha;
  result = probe([wrongElf]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pinned browser package\/process identity/);

  const wrongElfBytes = renderState();
  wrongElfBytes.runtime.browserExecutableBytes -= 1;
  wrongElfBytes.runtime.browserProcess.executableBytes -= 1;
  wrongElfBytes.browserBinaryContract.executableBytes -= 1;
  result = probe([wrongElfBytes]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pinned browser package\/process identity/);

  const forcedFocus = renderState();
  forcedFocus.browserLifecycleLaunch
    .playwrightNativeVisibility.focusEmulationEnabled = true;
  result = probe([forcedFocus]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Playwright native-visibility policy is invalid/);

  const wrongLaunchPolicy = renderState();
  wrongLaunchPolicy.browserLifecycleLaunch.chromiumArgs[0] =
    '--use-gl=not-the-pinned-renderer';
  result = probe([wrongLaunchPolicy]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /browser lifecycle launch policy is invalid/);

  for (const mutate of [
    (state) => {
      state.runtime.nodeVersion = 'v22.19.0';
    },
    (state) => {
      state.fontEnvironment.japaneseFontSha256 = 'b'.repeat(64);
    },
  ]) {
    const changed = renderState();
    mutate(changed);
    result = probe([renderState(), changed]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /render environment differs/);
  }
});

test('Evidence X11 contract rejects every identity and lifecycle tamper', () => {
  const valid = x11Contract();
  const invalid = [];
  const addTamper = (name, mutate) => {
    const contract = structuredClone(valid);
    mutate(contract);
    invalid.push({ name, contract });
  };
  addTamper('browser-pid', (value) => {
    value.x11TabControl.browserPid += 1;
  });
  addTamper('browser-process-hash', (value) => {
    value.x11TabControl.browserProcess.executableSha256 = 'd'.repeat(64);
  });
  addTamper('browser-process-bytes', (value) => {
    value.x11TabControl.browserProcess.executableBytes -= 1;
  });
  addTamper('wm-class', (value) => {
    value.x11TabControl.initialActivation.target.wmClass.instance = 'openbox';
  });
  addTamper('arbitrary-profile-class', (value) => {
    const wmClass = {
      instance: 'google-chrome (/home/user/private-profile)',
      class: 'Google-chrome',
    };
    const activation = value.x11TabControl.initialActivation;
    activation.target.wmClass = wmClass;
    activation.browserPidClientIdentities[0].wmClass = wmClass;
    activation.activationSnapshot.wmClass = wmClass;
    for (const snapshot of Object.values(
      value.x11TabControl.x11Snapshots,
    )) {
      snapshot.wmClass = wmClass;
    }
  });
  addTamper('active-xid', (value) => {
    value.x11TabControl.x11Snapshots.atOpenCommand.rootActiveWindowId += 1;
  });
  addTamper('activation-target', (value) => {
    value.x11TabControl.commands.activateWindow.targetWindowId += 1;
  });
  addTamper('page-count', (value) => {
    value.x11TabControl.pageCounts.afterOpen = 3;
  });
  addTamper('gesture', (value) => {
    value.x11TabControl.commands.openTab.gesture = 'Ctrl+N';
  });
  addTamper('activation-success', (value) => {
    value.x11TabControl.commands.activateWindow.succeeded = false;
  });
  addTamper('mutual-visibility', (value) => {
    value.hiddenSettledState.foreground.documentHidden = true;
  });
  addTamper('source-identity', (value) => {
    value.visible.sourceId = 'source-2';
  });
  addTamper('mute-state', (value) => {
    value.hidden.muted = true;
  });
  addTamper('visible-gain', (value) => {
    value.visible.masterGain = 0;
  });
  addTamper('recovery-delta', (value) => {
    value.visibleRecoveryDelta = 0.2;
  });
  addTamper('browser-pid-count-boolean', (value) => {
    value.x11TabControl.initialActivation.browserPidClientCount = true;
  });
  addTamper('matching-count-float', (value) => {
    value.x11TabControl.initialActivation.matchingChromeWindowCount = 1.0;
  });
  addTamper('activation-attempt-boolean', (value) => {
    value.x11TabControl.initialActivation.attemptCount = true;
  });
  addTamper('command-attempt-float', (value) => {
    value.x11TabControl.commands.activateWindow.attemptCount = 1.0;
  });
  addTamper('identity-pid-float', (value) => {
    value.x11TabControl.initialActivation.target.wmPid = 12_345.0;
    value.x11TabControl.initialActivation
      .browserPidClientIdentities[0].wmPid = 12_345.0;
  });

  const result = probeX11Contract({
    valid,
    invalid,
    state: renderState(),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), invalid.map(({ name }) => name));
});
