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
const PROBE = String.raw`
import copy
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
entry = payload["entry"]
state = {
    "candidateFixtureCoordinateParity": {
        "home-street": {
            "candidateSamples": [
                {"position": "left", "x": 240, "y": 590},
            ],
        },
    },
    "geometryFixture": {
        "areas": {
            "home-street": {
                "ground": {
                    "samples": [
                        {"position": "left", "x": 240, "y": 590},
                    ],
                },
            },
        },
    },
}
run = module.Run(
    role=payload["role"],
    source=Path("/tmp"),
    state_path=Path("/tmp/state.json"),
    state=state,
    viewport_key=(1280, 720, 1.0, False),
    device_id="desktop-1280x720-dpr1",
)
try:
    result = module.validate_phase_coordinate(
        run,
        "home-street",
        "morning",
        entry,
        baseline=payload["baseline"],
    )
except module.EvidenceError as error:
    print(str(error), file=sys.stderr)
    raise SystemExit(2)
print(json.dumps(result, sort_keys=True))
`;

function validEntry() {
  return {
    coordinate: {
      sourceFixture: 'src/game/areas/m15GeometryFixture.mjs',
      sourcePath: 'areas.home-street.ground.samples[left]',
      position: 'left',
      targetWorldX: 240,
      actualWorldX: 242,
      toleranceWorldPx: 4,
      facing: 'right',
    },
    snapshot: {
      playerX: 242,
      facing: 'right',
    },
  };
}

function probe(entry, { baseline = false } = {}) {
  return spawnSync(
    'python3',
    ['-B', '-c', PROBE, ASSEMBLER],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: JSON.stringify({
        baseline,
        entry,
        role: baseline ? 'baseline' : 'candidate-local',
      }),
    },
  );
}

test('phase coordinate accepts the same fixture anchor for baseline and candidate', () => {
  for (const baseline of [true, false]) {
    const result = probe(validEntry(), { baseline });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      actualWorldX: 242,
      targetWorldX: 240,
      toleranceWorldPx: 4,
    });
  }
});

test('phase coordinate rejects missing, stale and out-of-tolerance evidence', () => {
  const mutations = [
    (entry) => {
      delete entry.coordinate;
    },
    (entry) => {
      entry.coordinate.targetWorldX = 241;
    },
    (entry) => {
      entry.coordinate.actualWorldX = 245;
      entry.snapshot.playerX = 245;
    },
    (entry) => {
      entry.snapshot.playerX = 243;
    },
    (entry) => {
      entry.coordinate.facing = 'left';
    },
  ];
  for (const mutate of mutations) {
    const entry = validEntry();
    mutate(entry);
    const result = probe(entry);
    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /phase coordinate|fixture-anchored|Nested value|Missing state field/,
    );
  }
});
