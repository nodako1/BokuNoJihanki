import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const VALIDATOR = path.join(ROOT, 'tools/art/validate_m15_assets.py');
const PYTHON_PROBE = String.raw`
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

spec = importlib.util.spec_from_file_location("m15_assets", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
payload = json.load(sys.stdin)
alpha = module.np.zeros((384, 256), dtype=module.np.uint8)
end_y = int(payload["maxY"])
alpha[end_y - 69:end_y + 1, 28:228] = 255
metrics = module.frame_foot_metrics(
    alpha,
    frame_name=payload["name"],
    pivot_pixel_y=369,
    runtime_scale=0.38,
)
failures = []
module.validate_frame_foot_metrics(metrics, failures)
hash_failures = []
with tempfile.TemporaryDirectory() as directory:
    target = Path(directory) / "asset.bin"
    target.write_bytes(b"m15")
    module.validate_hash_record(
        target,
        {"bytes": 3, "sha256": "0" * 64},
        "tampered asset",
        hash_failures,
    )
print(json.dumps({
    "metrics": metrics,
    "failures": failures,
    "hashFailures": hash_failures,
}))
`;

function probe(maxY, name) {
  return spawnSync(
    'python3',
    ['-B', '-c', PYTHON_PROBE, VALIDATOR],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: JSON.stringify({ maxY, name }),
    },
  );
}

test('tracked M1.5 atlas reports all visible feet at the measured pivot', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'boku-m15-assets-'));
  try {
    const reportPath = path.join(directory, 'player-foot-alpha.json');
    const result = spawnSync(
      'python3',
      [VALIDATOR, '--json-out', reportPath],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.status, 'PASS');
    assert.equal(report.frameCount, 24);
    assert.equal(report.frames.length, 24);
    assert.equal(report.alphaThresholdExclusive, 10);
    assert.equal(report.runtimeScale, 0.38);
    assert.equal(report.summary.maxAbsoluteRowDeltaPx, 0);
    assert.equal(report.summary.maxAbsoluteRowDeltaCssPx, 0);
    assert.equal(
      report.summary.maxAbsoluteVisibleBottomEdgeDeltaCssPx,
      0.38,
    );
    assert.equal(
      report.atlas.sha256,
      'acf3cf78c2dba0c30ed078de5e6b0ee6fe32b7f0cf8dd8f15fc52a8dd41d46b0',
    );
    assert.equal(report.atlas.sha256, report.atlas.manifestSha256);
    assert.equal(
      report.manifest.sha256,
      report.manifest.sidecarDeclaredManifestSha256,
    );
    assert.deepEqual(
      new Set(report.frames.map(({ maxAlphaY }) => maxAlphaY)),
      new Set([369]),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('visible foot validator rejects alpha shifted above or below the pivot', () => {
  for (const [maxY, message] of [
    [361, 'shifted-up'],
    [377, 'shifted-down'],
  ]) {
    const result = probe(maxY, message);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(
      output.failures.join(' | '),
      /visible foot row does not equal the measured pivot row/,
    );
  }
});

test('asset hash validator rejects bytes that do not match the manifest', () => {
  const result = probe(369, 'aligned');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.failures, []);
  assert.match(
    output.hashFailures.join(' | '),
    /SHA-256 mismatch: tampered asset/,
  );
});
