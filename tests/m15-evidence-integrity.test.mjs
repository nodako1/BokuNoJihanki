import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import {
  createM15ScreenshotManifest,
} from '../tools/evidence/m15ScreenshotManifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSEMBLER = path.join(
  ROOT,
  'tools/evidence/assemble_m15_evidence.py',
);
const SCREENSHOT_CONSUMER_PROBE = String.raw`
import copy
import importlib.util
import json
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location("m15_evidence", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
payload = json.load(sys.stdin)
source = Path(sys.argv[2])
key = (2, 1, 1.0, False)
completion = {"schemaVersion": 2, "screenshotManifest": payload}
module.validate_run_screenshot_manifest(source, completion, key, "test")
rejected = []
def must_reject(name, mutate):
    value = copy.deepcopy(completion)
    mutate(value)
    try:
        module.validate_run_screenshot_manifest(source, value, key, "test")
    except module.EvidenceError:
        rejected.append(name)
    else:
        raise RuntimeError(f"accepted screenshot tamper: {name}")
must_reject(
    "consumer-hash",
    lambda value: value["screenshotManifest"]["files"][0].update(
        {"sha256": "0" * 64}
    ),
)
must_reject(
    "consumer-bytes",
    lambda value: value["screenshotManifest"]["files"][0].update(
        {"bytes": value["screenshotManifest"]["files"][0]["bytes"] + 1}
    ),
)
must_reject(
    "consumer-dimensions",
    lambda value: value["screenshotManifest"]["files"][0].update(
        {"width": 1}
    ),
)
must_reject(
    "consumer-coverage",
    lambda value: (
        value["screenshotManifest"]["files"].pop(),
        value["screenshotManifest"].update({"screenshotCount": 1}),
    ),
)
print(json.dumps(rejected))
`;

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBytes, payload]);
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0);
  typeBytes.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(crcInput), 8 + payload.length);
  return chunk;
}

function solidPng(width, height) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let row = 0; row < height; row += 1) {
    rows.push(Buffer.alloc(1 + width * 4));
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const GEOMETRY_PROBE = String.raw`
import copy
import importlib.util
import json
import math
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

selectors = sorted(module.REQUIRED_PANEL_OBSTACLE_SELECTORS)
candidate_state = {
    "geometryFixture": {
        "tolerances": {
            "renderedFootToGroundCssPx": 2,
            "spawnFootToGroundCssPx": 6,
        },
        "areas": {
            "home-street": {
                "ground": {"y": 100},
                "assets": {
                    "backgroundSha256": {"morning": "candidate-bg"},
                    "foregroundSha256": "candidate-fg",
                },
            },
            "life-road": {
                "ground": {"y": 100},
                "assets": {
                    "backgroundSha256": {"morning": "candidate-bg"},
                    "foregroundSha256": "candidate-fg",
                },
            },
        },
        "player": {
            "frameSize": {"width": 40, "height": 80},
            "footPivot": {"x": 0.5, "y": 1, "pixelX": 20, "pixelY": 80},
            "runtimeScale": 1,
        },
    },
}
candidate_run = module.Run(
    role="candidate-local",
    source=Path("/tmp"),
    state_path=Path("/tmp/state.json"),
    state=candidate_state,
    viewport_key=(1280, 720, 1.0, False),
    device_id="desktop-1280x720-dpr1",
)
candidate_measurement = {
    "areaId": "home-street",
    "position": "center",
    "fixtureGroundY": 100,
    "runtimeFootY": 100,
    "renderedFootScreenY": 100,
    "fixtureGroundScreenY": 100,
    "worldDelta": 0,
    "cssDelta": 0,
    "tolerance": 2,
    "backgroundSha256": {"morning": "candidate-bg"},
    "foregroundSha256": "candidate-fg",
    "snapshot": {
        "area": "home-street",
        "playerX": 100,
        "playerY": 100,
        "facing": "right",
    },
    "playerGeometry": {
        "rect": {"left": 80, "top": 20, "width": 40, "height": 80},
        "footRect": {"left": 99, "top": 99, "width": 2, "height": 2},
        "facing": "right",
        "areaId": "home-street",
        "playerWorldX": 100,
        "playerWorldY": 100,
        "cameraScrollX": 0,
        "cameraScrollY": 0,
        "canvasRect": {"left": 0, "top": 0, "width": 1280, "height": 720},
        "scaleX": 1,
        "scaleY": 1,
    },
}

player_contract = {
    "frameWidth": 40,
    "frameHeight": 80,
    "scale": 1,
    "originX": 0.5,
    "originY": 1,
    "derivation": "test atlas contract",
}
baseline_run = module.Run(
    role="baseline",
    source=Path("/tmp"),
    state_path=Path("/tmp/state.json"),
    state={
        "runtimeContract": {"player": player_contract},
        "independentVisualFixture": {
            "areas": {
                "home-street": {
                    "visualGround": {
                        "samples": [
                            {"position": "left", "x": 20, "y": 100},
                            {"position": "center", "x": 100, "y": 100},
                            {"position": "right", "x": 180, "y": 100},
                        ],
                    },
                },
            },
        },
    },
    viewport_key=(1280, 720, 1.0, False),
    device_id="desktop-1280x720-dpr1",
)
baseline_measurement = {
    "areaId": "home-street",
    "position": "center",
    "spawn": False,
    "independentVisualSample": {"position": "center", "x": 100, "y": 100},
    "runtimeSnapshot": {
        "area": "home-street",
        "playerX": 100,
        "playerY": 100,
        "cameraScrollX": 0,
        "facing": "right",
    },
    "requirementCssPx": 2,
    "withinRequirement": True,
    "playerGeometry": {
        "derivation": "test atlas contract",
        "atlasFrame": {
            "width": 40,
            "height": 80,
            "scale": 1,
            "originX": 0.5,
            "originY": 1,
        },
        "canvas": {
            "cssRect": {"left": 0, "top": 0, "width": 1280, "height": 720},
            "backingWidth": 1280,
            "backingHeight": 720,
            "objectFit": "fill",
            "scaleX": 1,
            "scaleY": 1,
        },
        "worldRect": {
            "left": 80,
            "top": 20,
            "width": 40,
            "height": 80,
            "right": 120,
            "bottom": 100,
        },
        "cssRect": {
            "left": 80,
            "top": 20,
            "width": 40,
            "height": 80,
            "right": 120,
            "bottom": 100,
        },
        "foot": {"worldX": 100, "worldY": 100, "cssX": 100, "cssY": 100},
        "visualGroundY": 100,
        "visualGroundCssY": 100,
        "signedFootGroundWorldDelta": 0,
        "signedFootGroundCssDelta": 0,
        "absoluteFootGroundCssDelta": 0,
    },
}

def measured_obstacles(panel):
    raw = []
    measured = []
    for index, selector in enumerate(selectors):
        rectangle = {
            "left": 10 + index * 55,
            "top": 10,
            "width": 40,
            "height": 40,
        }
        raw_entry = {"selector": selector, "id": selector, "rect": rectangle}
        raw.append(raw_entry)
        measured.append({
            **raw_entry,
            "intersectionArea": module.rect_intersection_area(panel, rectangle),
            "distance": module.rect_distance(panel, rectangle),
        })
    return raw, measured

panel = {"left": 300, "top": 300, "width": 100, "height": 50}
player = {"left": 80, "top": 20, "width": 40, "height": 80}
raw_obstacles, obstacle_metrics = measured_obstacles(panel)
panel_intersection = module.rect_intersection_area(panel, player)
panel_distance = module.rect_distance(panel, player)
panel_ground = copy.deepcopy(candidate_measurement)
panel_ground["areaId"] = "life-road"
panel_ground["snapshot"]["area"] = "life-road"
panel_ground["playerGeometry"]["areaId"] = "life-road"
candidate_panel = {
    "areaId": "life-road",
    "actualPlayerWorldX": 100,
    "direction": "up",
    "facing": "right",
    "triggerSample": {"name": "start"},
    "prompt": {
        "area": "life-road",
        "facing": "right",
        "branchVisible": True,
        "branchDirection": "up",
    },
    "groundCss": panel_ground,
    "geometry": {
        "panelRect": panel,
        "playerRect": player,
        "footRect": {"left": 99, "top": 99, "width": 2, "height": 2},
        "playerGeometry": panel_ground["playerGeometry"],
        "playerIntersection": panel_intersection,
        "playerDistance": panel_distance,
        "obstacles": raw_obstacles,
        "obstacleMetrics": obstacle_metrics,
        "viewport": {"width": 1280, "height": 720, "devicePixelRatio": 1},
        "dataset": {
            "anchor": "right",
            "playerIntersection": f"{panel_intersection:.3f}",
            "playerDistance": f"{panel_distance:.3f}",
            "obstacleIntersections": "",
            "x": f"{panel['left']:.3f}",
            "y": f"{panel['top']:.3f}",
        },
        "disabled": False,
        "ariaHidden": "false",
        "prompt": {"visible": True, "direction": "up", "areaId": "life-road"},
    },
}
baseline_player_geometry = baseline_measurement["playerGeometry"]
baseline_panel = copy.deepcopy(candidate_panel)
baseline_panel["actualPlayerX"] = 100
baseline_panel["prompt"] = {
    "area": "life-road",
    "playerX": 100,
    "playerY": 100,
    "cameraScrollX": 0,
    "facing": "right",
    "branchVisible": True,
    "branchDirection": "up",
}
baseline_panel["geometry"] = {
    "panelRect": panel,
    "playerRect": player,
    "playerGeometry": baseline_player_geometry,
    "playerIntersectionArea": panel_intersection,
    "playerDistance": panel_distance,
    "obstacles": raw_obstacles,
    "obstacleMetrics": obstacle_metrics,
    "viewport": {"width": 1280, "height": 720, "devicePixelRatio": 1},
    "touchTargetPass": True,
}
baseline_panel["quality"] = {
    "playerIntersectionZero": True,
    "playerGapAtLeast12": True,
    "touchTargetAtLeast44": True,
    "hudIntersectionZero": True,
}

module.validate_candidate_measurement(
    candidate_run,
    candidate_measurement,
    spawn=False,
)
module.validate_baseline_measurement(
    baseline_run,
    baseline_measurement,
    spawn=False,
)
module.validate_panel_geometry(candidate_run, candidate_panel, baseline=False)
module.validate_panel_geometry(baseline_run, baseline_panel, baseline=True)

tampered = []
def must_reject(name, callback):
    try:
        callback()
    except module.EvidenceError:
        tampered.append(name)
    else:
        raise RuntimeError(f"accepted tamper: {name}")

value = copy.deepcopy(candidate_measurement)
value["cssDelta"] = -999
must_reject(
    "candidate-css-delta",
    lambda: module.validate_candidate_measurement(
        candidate_run, value, spawn=False
    ),
)
value = copy.deepcopy(candidate_measurement)
value["playerGeometry"]["footRect"]["top"] = 109
must_reject(
    "candidate-foot-rect",
    lambda: module.validate_candidate_measurement(
        candidate_run, value, spawn=False
    ),
)
value = copy.deepcopy(baseline_measurement)
value["playerGeometry"]["absoluteFootGroundCssDelta"] = -999
must_reject(
    "baseline-ground-delta",
    lambda: module.validate_baseline_measurement(
        baseline_run, value, spawn=False
    ),
)
value = copy.deepcopy(baseline_measurement)
value["independentVisualSample"]["y"] = 110
value["playerGeometry"]["visualGroundY"] = 110
value["playerGeometry"]["visualGroundCssY"] = 110
value["playerGeometry"]["signedFootGroundWorldDelta"] = -10
value["playerGeometry"]["signedFootGroundCssDelta"] = -10
value["playerGeometry"]["absoluteFootGroundCssDelta"] = 10
value["withinRequirement"] = False
must_reject(
    "baseline-coherent-fixture-drift",
    lambda: module.validate_baseline_measurement(
        baseline_run, value, spawn=False
    ),
)
value = copy.deepcopy(candidate_measurement)
value["playerGeometry"]["rect"]["left"] += 10
must_reject(
    "candidate-coherent-player-rect",
    lambda: module.validate_candidate_measurement(
        candidate_run, value, spawn=False
    ),
)
value = copy.deepcopy(candidate_panel)
value["geometry"]["playerIntersection"] = 0.5
must_reject(
    "panel-player-intersection",
    lambda: module.validate_panel_geometry(
        candidate_run, value, baseline=False
    ),
)
value = copy.deepcopy(candidate_panel)
value["prompt"]["branchVisible"] = False
must_reject(
    "candidate-panel-prompt-state",
    lambda: module.validate_panel_geometry(
        candidate_run, value, baseline=False
    ),
)
value = copy.deepcopy(baseline_panel)
value["prompt"]["facing"] = "left"
must_reject(
    "baseline-panel-prompt-state",
    lambda: module.validate_panel_geometry(
        baseline_run, value, baseline=True
    ),
)
value = copy.deepcopy(candidate_panel)
value["geometry"]["playerRect"]["left"] += 600
value["geometry"]["playerGeometry"]["rect"]["left"] += 600
shifted_player = value["geometry"]["playerRect"]
intersection = module.rect_intersection_area(panel, shifted_player)
distance = module.rect_distance(panel, shifted_player)
value["geometry"]["playerIntersection"] = intersection
value["geometry"]["playerDistance"] = distance
value["geometry"]["dataset"]["playerIntersection"] = f"{intersection:.3f}"
value["geometry"]["dataset"]["playerDistance"] = f"{distance:.3f}"
must_reject(
    "candidate-coherent-panel-body",
    lambda: module.validate_panel_geometry(
        candidate_run, value, baseline=False
    ),
)
value = copy.deepcopy(baseline_panel)
value["geometry"]["playerRect"]["left"] += 600
value["geometry"]["playerGeometry"]["cssRect"]["left"] += 600
value["geometry"]["playerGeometry"]["cssRect"]["right"] += 600
shifted_player = value["geometry"]["playerRect"]
intersection = module.rect_intersection_area(panel, shifted_player)
distance = module.rect_distance(panel, shifted_player)
value["geometry"]["playerIntersectionArea"] = intersection
value["geometry"]["playerDistance"] = distance
value["quality"]["playerIntersectionZero"] = intersection == 0
value["quality"]["playerGapAtLeast12"] = distance >= 12
must_reject(
    "baseline-coherent-panel-body",
    lambda: module.validate_panel_geometry(
        baseline_run, value, baseline=True
    ),
)
value = copy.deepcopy(candidate_panel)
value["geometry"]["obstacleMetrics"][0]["distance"] += 1
must_reject(
    "panel-obstacle-distance",
    lambda: module.validate_panel_geometry(
        candidate_run, value, baseline=False
    ),
)
value = copy.deepcopy(candidate_panel)
value["geometry"]["panelRect"]["left"] = 1240
must_reject(
    "panel-outside-viewport",
    lambda: module.validate_panel_geometry(
        candidate_run, value, baseline=False
    ),
)
print(json.dumps(tampered))
`;

test('screenshot manifest binds every PNG to viewport pixels and bytes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'm15-png-manifest-'));
  const first = solidPng(2, 1);
  const second = solidPng(2, 1);
  await writeFile(path.join(directory, 'first.png'), first);
  await writeFile(path.join(directory, 'second.png'), second);
  const manifest = createM15ScreenshotManifest(directory, {
    viewportWidth: 2,
    viewportHeight: 1,
    deviceScaleFactor: 1,
  });
  assert.equal(manifest.screenshotCount, 2);
  assert.deepEqual(manifest.expectedPixelSize, { width: 2, height: 1 });
  assert.deepEqual(
    manifest.files.map(({ filename }) => filename),
    ['first.png', 'second.png'],
  );
  assert.equal(
    manifest.files[0].sha256,
    createHash('sha256').update(first).digest('hex'),
  );
  const consumer = spawnSync(
    'python3',
    ['-B', '-c', SCREENSHOT_CONSUMER_PROBE, ASSEMBLER, directory],
    {
      cwd: ROOT,
      encoding: 'utf8',
      input: JSON.stringify(manifest),
    },
  );
  assert.equal(consumer.status, 0, consumer.stderr);
  assert.deepEqual(JSON.parse(consumer.stdout), [
    'consumer-hash',
    'consumer-bytes',
    'consumer-dimensions',
    'consumer-coverage',
  ]);

  await writeFile(path.join(directory, 'second.png'), solidPng(1, 1));
  assert.throws(
    () => createM15ScreenshotManifest(directory, {
      viewportWidth: 2,
      viewportHeight: 1,
      deviceScaleFactor: 1,
    }),
    /expected 2x1/,
  );
});

test('Evidence recomputes ground and panel metrics and rejects tampering', () => {
  const result = spawnSync(
    'python3',
    ['-B', '-c', GEOMETRY_PROBE, ASSEMBLER],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    'candidate-css-delta',
    'candidate-foot-rect',
    'baseline-ground-delta',
    'baseline-coherent-fixture-drift',
    'candidate-coherent-player-rect',
    'panel-player-intersection',
    'candidate-panel-prompt-state',
    'baseline-panel-prompt-state',
    'candidate-coherent-panel-body',
    'baseline-coherent-panel-body',
    'panel-obstacle-distance',
    'panel-outside-viewport',
  ]);
});
