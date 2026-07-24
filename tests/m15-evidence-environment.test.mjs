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

function renderState() {
  return {
    runtime: {
      nodeVersion: 'v22.18.0',
      browserVersion: 'Google Chrome 140.0.7339.80',
      browserExecutablePath: '/usr/bin/google-chrome',
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
  assert.match(result.stderr, /did not resolve to Noto Sans CJK/);

  for (const mutate of [
    (state) => {
      state.runtime.nodeVersion = 'v22.19.0';
    },
    (state) => {
      state.runtime.browserVersion = 'Google Chrome 141.0.0.0';
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
