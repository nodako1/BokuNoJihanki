#!/usr/bin/env python3
"""Validate and assemble fresh M1.5 visual/audio Evidence.

This tool deliberately accepts individual *run directories*, not artifact
parents.  A run is included only when its direct ``state.json`` proves that it
is a complete capture of the requested commit and viewport.  The destination
must be empty so partial, failed, or older candidate artifacts cannot be
silently mixed into a final Evidence bundle.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import re
import shlex
import shutil
import subprocess
import sys
import textwrap
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable, Sequence
from urllib.parse import urlsplit, urlunsplit

from PIL import Image, ImageDraw, ImageOps, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[2]
EXACT_BASELINE_SHA = "29223ee31fd4fc4fbca21a37b01fe89277279647"
AREA_IDS = ("home-street", "life-road", "upper-vending-lane")
PHASES = ("morning", "day", "evening", "night")
POSITIONS = ("left", "center", "right")
DIRECTIONS = ("up", "down")
FACINGS = ("left", "right")
PANEL_SAMPLES = ("start", "center", "end")
PANEL_TRIGGER_INSET_WORLD_PX = 8
REQUIRED_PANEL_OBSTACLE_SELECTORS = frozenset(
    {
        ".game-date-chip",
        ".game-actions",
        ".virtual-joystick",
        ".control-hint",
        ".build-badge",
    },
)
PHASE_CAPTURE_POSITION = "left"
PHASE_CAPTURE_FACING = "right"
PHASE_CAPTURE_TOLERANCE_WORLD_PX = 4
PHASE_CAPTURE_PAIR_TOLERANCE_WORLD_PX = 4
PHASE_CAPTURE_FIXTURE = "src/game/areas/m15GeometryFixture.mjs"
BASELINE_SPAWN_X_TOLERANCE_WORLD_PX = 8
EXPECTED_SOURCE_SPAWNS = (
    "life-road/from-home",
    "home-street/from-life",
    "life-road/from-home",
    "upper-vending-lane/from-life",
    "life-road/from-upper",
)
EXPECTED_SPAWN_MEASUREMENTS = (
    ("home-street", "start", "spawn-start"),
    ("life-road", "from-home", "spawn-from-home"),
    ("home-street", "from-life", "spawn-from-life"),
    ("life-road", "from-home", "spawn-from-home-repeat"),
    ("upper-vending-lane", "from-life", "spawn-from-life"),
    ("life-road", "from-upper", "spawn-from-upper"),
)
EXPECTED_BASELINE_SPAWN_MEASUREMENTS = (
    ("home-street", "start", "spawn-start"),
    ("life-road", "from-home", "spawn-from-home"),
    ("home-street", "from-life", "spawn-from-life"),
    ("life-road", "from-home", "spawn-from-home"),
    ("upper-vending-lane", "from-life", "spawn-from-life"),
    ("life-road", "from-upper", "spawn-from-upper"),
)
EXPECTED_VIEWPORTS = {
    (1280, 720, 1.0, False): "desktop-1280x720-dpr1",
    (844, 390, 2.0, True): "touch-844x390-dpr2",
    (932, 430, 3.0, True): "touch-932x430-dpr3",
}
REQUIRED_AUDIO_FILES = {
    "analysis.json",
    "waveform.png",
    "spectrogram.png",
    "loop-boundary.png",
    "sha256-manifest.json",
}
TRACKED_PROVENANCE = (
    Path("public/assets/images/m15/asset-manifest.json"),
    Path("tools/art/m15-source/generation.json"),
    Path("tools/audio/m15/provenance.json"),
    Path("public/assets/audio/m15/analysis.json"),
)
CHROME_X11_INSTANCE_RE = re.compile(
    r"google-chrome(?:-stable)?"
    r"(?: \(/tmp/playwright_chromiumdev_profile-[0-9A-Za-z_-]+\))?",
    flags=re.IGNORECASE,
)
M15_GOOGLE_CHROME_VERSION = "150.0.7871.186"
M15_GOOGLE_CHROME_PACKAGE_VERSION = "150.0.7871.186-1"
M15_GOOGLE_CHROME_ELF_BYTES = 280_960_248
M15_GOOGLE_CHROME_ELF_SHA256 = (
    "47e00a55c9e412ccb3b5a128fdf3b34378faecb0190b293829ddee28c6d8659e"
)
M15_PLAYWRIGHT_VERSION = "1.56.1"
M15_PLAYWRIGHT_ORIGINAL_SHA256 = (
    "79a25e4eac0d0fa97dcc6eae4edce83436bcdb4bb1322731f65610adaa8e150f"
)
M15_PLAYWRIGHT_PATCHED_SHA256 = (
    "e0ec5890e92413dbb0599f3ed12b0b463fbd81cad62d3b2642dd4554e5d0efea"
)
M15_HEARTBEAT_INTERVAL_MS = 40
M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT = 8
M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS = 750
M15_HEARTBEAT_FREEZE_SEPARATION_RATIO = 4


class EvidenceError(RuntimeError):
    """Raised when an input cannot be admitted to the Evidence bundle."""


@dataclass(frozen=True)
class Run:
    role: str
    source: Path
    state_path: Path
    state: dict[str, Any]
    viewport_key: tuple[int, int, float, bool]
    device_id: str


@dataclass(frozen=True)
class ImageItem:
    label: str
    path: Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise EvidenceError(message)


def finite_number(value: Any, name: str) -> float:
    require(
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value)),
        f"{name} must be a finite number.",
    )
    return float(value)


def validate_positive_rect(value: Any, name: str) -> dict[str, float]:
    require(isinstance(value, dict), f"{name} must be a rectangle object.")
    rectangle = {
        key: finite_number(value.get(key), f"{name}.{key}")
        for key in ("left", "top", "width", "height")
    }
    require(
        rectangle["width"] > 0 and rectangle["height"] > 0,
        f"{name} must have positive dimensions.",
    )
    if "right" in value:
        require(
            math.isclose(
                finite_number(value["right"], f"{name}.right"),
                rectangle["left"] + rectangle["width"],
                abs_tol=0.05,
            ),
            f"{name}.right does not match left + width.",
        )
    if "bottom" in value:
        require(
            math.isclose(
                finite_number(value["bottom"], f"{name}.bottom"),
                rectangle["top"] + rectangle["height"],
                abs_tol=0.05,
            ),
            f"{name}.bottom does not match top + height.",
        )
    return rectangle


def strict_json_load(path: Path) -> dict[str, Any]:
    require(path.is_file() and not path.is_symlink(), f"Missing regular JSON file: {path}")

    def reject_constant(value: str) -> None:
        raise ValueError(f"Non-finite JSON number: {value}")

    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=reject_constant,
        )
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        raise EvidenceError(f"Could not read strict JSON {path}: {error}") from error
    require(isinstance(value, dict), f"Expected a JSON object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    return {"bytes": path.stat().st_size, "sha256": sha256(path)}


def require_sha(value: str, name: str) -> str:
    normalized = value.strip().lower()
    require(
        len(normalized) == 40
        and all(character in "0123456789abcdef" for character in normalized),
        f"{name} must be an exact 40-character hexadecimal commit SHA.",
    )
    return normalized


def canonical_url(value: str, name: str, *, require_https: bool = False) -> str:
    parsed = urlsplit(value.strip())
    require(parsed.scheme in {"http", "https"}, f"{name} must be an HTTP(S) URL.")
    require(bool(parsed.hostname), f"{name} must contain a hostname.")
    require(parsed.username is None and parsed.password is None, f"{name} must not contain credentials.")
    require(not parsed.query and not parsed.fragment, f"{name} must not contain query or fragment data.")
    if require_https:
        require(parsed.scheme == "https", f"{name} must use HTTPS.")
    path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def is_loopback_url(value: str) -> bool:
    hostname = urlsplit(value).hostname
    return hostname in {"localhost", "127.0.0.1", "::1"}


def nested(mapping: Any, *keys: str) -> Any:
    value = mapping
    for key in keys:
        require(isinstance(value, dict) and key in value, f"Missing state field: {'.'.join(keys)}")
        value = value[key]
    return value


def viewport_key(state: dict[str, Any]) -> tuple[int, int, float, bool]:
    viewport = nested(state, "viewport")
    require(isinstance(viewport, dict), "viewport must be an object.")
    width = viewport.get("width")
    height = viewport.get("height")
    dpr = state.get("deviceScaleFactor")
    touch = state.get("touchEnabled")
    require(
        isinstance(width, int) and not isinstance(width, bool) and width > 0,
        "viewport.width must be a positive integer.",
    )
    require(
        isinstance(height, int) and not isinstance(height, bool) and height > 0,
        "viewport.height must be a positive integer.",
    )
    require(
        isinstance(dpr, (int, float))
        and not isinstance(dpr, bool)
        and math.isfinite(float(dpr))
        and float(dpr) > 0,
        "deviceScaleFactor must be a positive finite number.",
    )
    require(isinstance(touch, bool), "touchEnabled must be boolean.")
    return (width, height, float(dpr), touch)


def check_png(path: Path) -> None:
    require(path.is_file() and not path.is_symlink(), f"Missing regular PNG: {path}")
    require(path.suffix.lower() == ".png", f"Expected PNG input: {path}")
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            require(image.width > 0 and image.height > 0, f"Empty image: {path}")
    except (OSError, SyntaxError) as error:
        raise EvidenceError(f"Invalid PNG {path}: {error}") from error


def safe_run_file(run: Run, filename: str, *, png: bool = False) -> Path:
    require(isinstance(filename, str) and filename, f"{run.role}/{run.device_id}: empty artifact filename.")
    relative = Path(filename)
    require(
        not relative.is_absolute()
        and len(relative.parts) == 1
        and relative.name == filename
        and filename not in {".", ".."},
        f"{run.role}/{run.device_id}: unsafe artifact filename {filename!r}.",
    )
    target = run.source / filename
    resolved = target.resolve()
    require(
        resolved.parent == run.source,
        f"{run.role}/{run.device_id}: artifact escapes run directory: {filename}",
    )
    require(target.is_file() and not target.is_symlink(), f"Missing run artifact: {target}")
    if png:
        check_png(target)
    return target


def load_run(role: str, source: Path) -> Run:
    resolved = source.expanduser().resolve()
    require(resolved.is_dir() and not resolved.is_symlink(), f"{role} run is not a regular directory: {resolved}")
    state_path = resolved / "state.json"
    state = strict_json_load(state_path)
    key = viewport_key(state)
    require(key in EXPECTED_VIEWPORTS, f"{role} has unsupported viewport/DPR/touch tuple: {key}")
    failure_artifacts = sorted(
        path.name
        for path in resolved.iterdir()
        if path.is_file() and path.name.lower().startswith(("failure", "failed", "partial"))
    )
    require(not failure_artifacts, f"{role}/{EXPECTED_VIEWPORTS[key]} contains failure artifacts: {failure_artifacts}")
    require("failure" not in state, f"{role}/{EXPECTED_VIEWPORTS[key]} state contains failure.")
    require("partialEvidence" not in state, f"{role}/{EXPECTED_VIEWPORTS[key]} contains partial Evidence.")
    runtime_log = resolved / "runtime.log"
    completion_path = resolved / "completion.json"
    require(
        runtime_log.is_file() and not runtime_log.is_symlink(),
        f"{role}/{EXPECTED_VIEWPORTS[key]} is missing its final runtime log.",
    )
    completion = strict_json_load(completion_path)
    require(
        completion.get("status") == "complete"
        and completion.get("browserClosed") is True
        and completion.get("traceFinalized") is True,
        f"{role}/{EXPECTED_VIEWPORTS[key]} did not complete browser finalization.",
    )
    require(
        completion.get("expectedCommit") == state.get("expectedCommit")
        and completion.get("observedCommit") == state.get("observedCommit"),
        f"{role}/{EXPECTED_VIEWPORTS[key]} completion SHA differs from state.",
    )
    require(
        completion.get("stateSha256") == sha256(state_path)
        and completion.get("runtimeLogSha256") == sha256(runtime_log),
        f"{role}/{EXPECTED_VIEWPORTS[key]} completion hashes do not bind the final files.",
    )
    return Run(
        role=role,
        source=resolved,
        state_path=state_path,
        state=state,
        viewport_key=key,
        device_id=EXPECTED_VIEWPORTS[key],
    )


def require_boolean_map(mapping: Any, context: str) -> None:
    require(isinstance(mapping, dict) and mapping, f"{context} must be a non-empty object.")
    failed = sorted(key for key, value in mapping.items() if value is not True)
    require(not failed, f"{context} contains failed checks: {failed}")


def validate_playwright_native_visibility_policy(
    value: Any,
    context: str,
) -> dict[str, Any]:
    expected_keys = {
        "schemaVersion",
        "status",
        "playwrightVersion",
        "targetRelativePath",
        "originalSha256",
        "patchedSha256",
        "observedSha256",
        "replacementCount",
        "focusEmulationEnabled",
        "method",
    }
    require(
        isinstance(value, dict)
        and set(value) == expected_keys
        and value.get("schemaVersion") == 1
        and value.get("status") == "already-patched"
        and value.get("playwrightVersion") == M15_PLAYWRIGHT_VERSION
        and value.get("targetRelativePath")
        == "node_modules/playwright-core/lib/server/chromium/crPage.js"
        and value.get("originalSha256") == M15_PLAYWRIGHT_ORIGINAL_SHA256
        and value.get("patchedSha256") == M15_PLAYWRIGHT_PATCHED_SHA256
        and value.get("observedSha256") == M15_PLAYWRIGHT_PATCHED_SHA256
        and isinstance(value.get("replacementCount"), int)
        and not isinstance(value.get("replacementCount"), bool)
        and value["replacementCount"] == 1
        and value.get("focusEmulationEnabled") is False
        and value.get("method") == "exact-hash-source-patch",
        f"{context}: Playwright native-visibility policy is invalid.",
    )
    return value


def validate_browser_lifecycle_launch_policy(
    value: Any,
    context: str,
) -> dict[str, Any]:
    require(
        isinstance(value, dict)
        and set(value)
        == {
            "ignoredPlaywrightDefaultArgs",
            "chromiumArgs",
            "reason",
            "playwrightNativeVisibility",
        }
        and value.get("ignoredPlaywrightDefaultArgs")
        == [
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
        ]
        and value.get("chromiumArgs")
        == [
            "--use-gl=swiftshader",
            "--enable-webgl",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
            "--ozone-platform=x11",
        ]
        and isinstance(value.get("reason"), str)
        and "native Chromium hidden/visible" in value["reason"]
        and "Playwright forced-active focus emulation" in value["reason"],
        f"{context}: browser lifecycle launch policy is invalid.",
    )
    validate_playwright_native_visibility_policy(
        value["playwrightNativeVisibility"],
        context,
    )
    return value


def render_environment_fingerprint(run: Run) -> dict[str, Any]:
    state = run.state
    runtime = state.get("runtime")
    host = state.get("hostEnvironment")
    font = state.get("fontEnvironment")
    lifecycle_launch = state.get("browserLifecycleLaunch")
    browser_binary = state.get("browserBinaryContract")
    require(
        isinstance(runtime, dict)
        and isinstance(host, dict)
        and isinstance(font, dict),
        f"{run.role}/{run.device_id}: render environment metadata is missing.",
    )
    node_version = runtime.get("nodeVersion")
    browser_version = runtime.get("browserVersion")
    browser_executable = runtime.get("browserExecutablePath")
    browser_executable_bytes = runtime.get("browserExecutableBytes")
    browser_executable_sha256 = runtime.get("browserExecutableSha256")
    browser_package_name = runtime.get("browserPackageName")
    browser_package_version = runtime.get("browserPackageVersion")
    browser_process = runtime.get("browserProcess")
    runner_os_image = host.get("runnerOsImage")
    platform_name = host.get("platform")
    architecture = host.get("architecture")
    font_match = font.get("japaneseFontMatch")
    font_file = font.get("japaneseFontFile")
    font_package_version = font.get("japaneseFontPackageVersion")
    font_sha256 = font.get("japaneseFontSha256")
    require(
        isinstance(node_version, str) and re.fullmatch(r"v22\.\d+\.\d+", node_version),
        f"{run.role}/{run.device_id}: exact Node 22 version is missing.",
    )
    require(
        browser_version == M15_GOOGLE_CHROME_VERSION,
        f"{run.role}/{run.device_id}: exact pinned browser version is missing.",
    )
    require(
        isinstance(browser_executable, str)
        and Path(browser_executable).is_absolute(),
        f"{run.role}/{run.device_id}: browser executable path is invalid.",
    )
    require(
        isinstance(browser_executable_sha256, str)
        and isinstance(browser_executable_bytes, int)
        and not isinstance(browser_executable_bytes, bool)
        and browser_executable_bytes == M15_GOOGLE_CHROME_ELF_BYTES
        and browser_executable_sha256 == M15_GOOGLE_CHROME_ELF_SHA256
        and browser_package_name == "google-chrome-stable"
        and browser_package_version == M15_GOOGLE_CHROME_PACKAGE_VERSION
        and isinstance(browser_process, dict)
        and isinstance(browser_process.get("pid"), int)
        and not isinstance(browser_process.get("pid"), bool)
        and browser_process["pid"] > 0
        and browser_process.get("executablePath") == browser_executable
        and isinstance(browser_process.get("executableBytes"), int)
        and not isinstance(browser_process.get("executableBytes"), bool)
        and browser_process.get("executableBytes") == browser_executable_bytes
        and browser_process.get("executableSha256") == browser_executable_sha256,
        f"{run.role}/{run.device_id}: pinned browser package/process identity is invalid.",
    )
    require(
        isinstance(browser_binary, dict)
        and set(browser_binary)
        == {
            "packageName",
            "packageVersion",
            "expectedBrowserVersion",
            "executablePath",
            "executableBytes",
            "executableSha256",
        }
        and browser_binary.get("packageName") == browser_package_name
        and browser_binary.get("packageVersion") == browser_package_version
        and browser_binary.get("expectedBrowserVersion") == browser_version
        and browser_binary.get("executablePath") == browser_executable
        and isinstance(browser_binary.get("executableBytes"), int)
        and not isinstance(browser_binary.get("executableBytes"), bool)
        and browser_binary.get("executableBytes") == browser_executable_bytes
        and browser_binary.get("executableSha256") == browser_executable_sha256,
        f"{run.role}/{run.device_id}: browser binary contract is invalid.",
    )
    lifecycle_launch = validate_browser_lifecycle_launch_policy(
        lifecycle_launch,
        f"{run.role}/{run.device_id}",
    )
    require(
        runner_os_image == "ubuntu-24.04"
        and platform_name == "linux"
        and architecture == "x64",
        f"{run.role}/{run.device_id}: pinned Linux render host is invalid.",
    )
    require(
        font_match == "Noto Sans CJK JP",
        f"{run.role}/{run.device_id}: Japanese font did not resolve to Noto Sans CJK JP.",
    )
    require(
        isinstance(font_file, str) and Path(font_file).is_absolute(),
        f"{run.role}/{run.device_id}: resolved Japanese font file is invalid.",
    )
    require(
        isinstance(font_package_version, str)
        and bool(font_package_version.strip()),
        f"{run.role}/{run.device_id}: Japanese font package version is missing.",
    )
    require(
        isinstance(font_sha256, str)
        and re.fullmatch(r"[0-9a-f]{64}", font_sha256) is not None,
        f"{run.role}/{run.device_id}: Japanese font SHA-256 is invalid.",
    )
    return {
        "nodeVersion": node_version,
        "browserVersion": browser_version,
        "browserExecutablePath": browser_executable,
        "browserExecutableBytes": browser_executable_bytes,
        "browserExecutableSha256": browser_executable_sha256,
        "browserPackageName": browser_package_name,
        "browserPackageVersion": browser_package_version,
        "browserProcessExecutablePath": browser_process["executablePath"],
        "browserProcessExecutableBytes": browser_process["executableBytes"],
        "browserProcessExecutableSha256": browser_process["executableSha256"],
        "browserBinaryContract": browser_binary,
        "browserLifecycleLaunch": lifecycle_launch,
        "hostEnvironment": host,
        "fontEnvironment": font,
    }


def validate_render_environment_parity(runs: Sequence[Run]) -> dict[str, Any]:
    require(bool(runs), "At least one render run is required.")
    contract = render_environment_fingerprint(runs[0])
    for run in runs[1:]:
        require(
            render_environment_fingerprint(run) == contract,
            f"{run.role}/{run.device_id}: render environment differs from the "
            "other baseline/local/Preview runs.",
        )
    return contract


def measurement_ground_y(measurement: dict[str, Any], *, baseline: bool) -> float:
    if baseline:
        return float(nested(measurement, "independentVisualSample", "y"))
    return float(nested(measurement, "fixtureGroundY"))


def measurement_actual_x(measurement: dict[str, Any], *, baseline: bool) -> float:
    if baseline:
        return float(nested(measurement, "runtimeSnapshot", "playerX"))
    return float(nested(measurement, "snapshot", "playerX"))


def baseline_ground_entry(run: Run, area_id: str, position: str) -> tuple[dict[str, Any], Path]:
    entry = nested(run.state, "evidence", "positions", area_id, position)
    require(isinstance(entry, dict), f"{run.role}/{run.device_id}: invalid baseline ground entry.")
    measurement = nested(entry, "measurement")
    screenshot = safe_run_file(run, nested(entry, "screenshot"), png=True)
    return measurement, screenshot


def candidate_ground_entry(run: Run, area_id: str, position: str) -> tuple[dict[str, Any], Path]:
    measurement = nested(run.state, "evidence", "areaPositions", area_id, position)
    require(isinstance(measurement, dict), f"{run.role}/{run.device_id}: invalid candidate ground entry.")
    declared = measurement.get("screenshot")
    possible_names: list[str] = []
    if isinstance(declared, str):
        possible_names.append(declared)
    possible_names.append(f"ground-{area_id}-{position}.png")
    if area_id == "home-street" and position == "right":
        possible_names.append("05-home-right-edge.png")
    existing = []
    for filename in dict.fromkeys(possible_names):
        path = run.source / filename
        if path.is_file() and not path.is_symlink():
            existing.append(path)
    require(
        len(existing) == 1,
        f"{run.role}/{run.device_id}: expected exactly one fresh screenshot for "
        f"{area_id}/{position}, found {[path.name for path in existing]}.",
    )
    check_png(existing[0])
    return measurement, existing[0]


def phase_entry(run: Run, area_id: str, phase: str, *, baseline: bool) -> tuple[dict[str, Any], Path]:
    matrix_name = "phases" if baseline else "phaseMatrix"
    entry = nested(run.state, "evidence", matrix_name, area_id, phase)
    require(isinstance(entry, dict), f"{run.role}/{run.device_id}: invalid phase entry.")
    screenshot = safe_run_file(run, nested(entry, "screenshot"), png=True)
    return entry, screenshot


def phase_anchor_world_x(run: Run, area_id: str, *, baseline: bool) -> float:
    samples = (
        nested(
            run.state,
            "candidateFixtureCoordinateParity",
            area_id,
            "candidateSamples",
        )
        if baseline
        else nested(
            run.state,
            "geometryFixture",
            "areas",
            area_id,
            "ground",
            "samples",
        )
    )
    require(
        isinstance(samples, list),
        f"{run.role}/{run.device_id}: {area_id} phase anchor samples are missing.",
    )
    matches = [
        sample
        for sample in samples
        if isinstance(sample, dict)
        and sample.get("position") == PHASE_CAPTURE_POSITION
    ]
    require(
        len(matches) == 1,
        f"{run.role}/{run.device_id}: {area_id} phase anchor is ambiguous.",
    )
    return finite_number(
        matches[0].get("x"),
        f"{run.role}/{run.device_id}: {area_id} phase anchor X",
    )


def validate_phase_coordinate(
    run: Run,
    area_id: str,
    phase: str,
    entry: dict[str, Any],
    *,
    baseline: bool,
) -> dict[str, float]:
    coordinate = nested(entry, "coordinate")
    expected_target = phase_anchor_world_x(run, area_id, baseline=baseline)
    target = finite_number(
        coordinate.get("targetWorldX"),
        f"{run.role}/{run.device_id}: {area_id}/{phase} phase target X",
    )
    actual = finite_number(
        coordinate.get("actualWorldX"),
        f"{run.role}/{run.device_id}: {area_id}/{phase} phase actual X",
    )
    tolerance = finite_number(
        coordinate.get("toleranceWorldPx"),
        f"{run.role}/{run.device_id}: {area_id}/{phase} phase tolerance",
    )
    snapshot_x = finite_number(
        nested(entry, "snapshot", "playerX"),
        f"{run.role}/{run.device_id}: {area_id}/{phase} snapshot X",
    )
    require(
        coordinate.get("sourceFixture") == PHASE_CAPTURE_FIXTURE
        and coordinate.get("sourcePath")
        == f"areas.{area_id}.ground.samples[{PHASE_CAPTURE_POSITION}]"
        and coordinate.get("position") == PHASE_CAPTURE_POSITION
        and coordinate.get("facing") == PHASE_CAPTURE_FACING
        and nested(entry, "snapshot", "facing") == PHASE_CAPTURE_FACING,
        f"{run.role}/{run.device_id}: {area_id}/{phase} phase coordinate "
        "provenance or facing is invalid.",
    )
    require(
        target == expected_target
        and tolerance == PHASE_CAPTURE_TOLERANCE_WORLD_PX
        and actual == snapshot_x
        and abs(actual - target) <= tolerance,
        f"{run.role}/{run.device_id}: {area_id}/{phase} phase world "
        "coordinate is not fixture-anchored.",
    )
    return {
        "targetWorldX": target,
        "actualWorldX": actual,
        "toleranceWorldPx": tolerance,
    }


def panel_entries(run: Run) -> dict[tuple[str, str, str], tuple[dict[str, Any], Path]]:
    raw_entries = nested(run.state, "evidence", "panelMatrix")
    require(isinstance(raw_entries, list) and len(raw_entries) == 12, f"{run.role}/{run.device_id}: panel matrix must contain 12 states.")
    result: dict[tuple[str, str, str], tuple[dict[str, Any], Path]] = {}
    for entry in raw_entries:
        require(isinstance(entry, dict), f"{run.role}/{run.device_id}: panel entry must be an object.")
        sample = nested(entry, "triggerSample", "name")
        key = (entry.get("direction"), sample, entry.get("facing"))
        require(
            key[0] in DIRECTIONS and key[1] in PANEL_SAMPLES and key[2] in FACINGS,
            f"{run.role}/{run.device_id}: invalid panel key {key}.",
        )
        require(key not in result, f"{run.role}/{run.device_id}: duplicate panel state {key}.")
        result[key] = (entry, safe_run_file(run, nested(entry, "screenshot"), png=True))
    expected = {
        (direction, sample, facing)
        for direction in DIRECTIONS
        for sample in PANEL_SAMPLES
        for facing in FACINGS
    }
    require(set(result) == expected, f"{run.role}/{run.device_id}: panel state coverage is incomplete.")
    return result


def validate_baseline(run: Run, baseline_sha: str) -> None:
    state = run.state
    render_environment_fingerprint(run)
    require(state.get("kind") == "M1.5-baseline-capture", f"{run.role}/{run.device_id}: wrong baseline kind.")
    require(state.get("captureStatus") == "complete", f"{run.role}/{run.device_id}: baseline capture is not complete.")
    require(state.get("expectedCommit") == baseline_sha, f"{run.role}/{run.device_id}: baseline SHA mismatch.")
    require(
        state.get("observedCommit") == baseline_sha
        and state.get("browserHeadless") is False
        and state.get("traceEnabled") is False
        and nested(state, "finalization", "browserClosed") is True
        and nested(state, "finalization", "traceFinalized") is True,
        f"{run.role}/{run.device_id}: baseline render mode, finalization, or observed SHA is invalid.",
    )
    require(
        nested(state, "runtime", "baselineSourceCommit") == baseline_sha,
        f"{run.role}/{run.device_id}: verified baseline source SHA mismatch.",
    )
    require(
        isinstance(state.get("pageErrors"), list)
        and state["pageErrors"] == [],
        f"{run.role}/{run.device_id}: baseline page errors are missing or non-zero.",
    )
    require(
        isinstance(state.get("failedRequests"), list)
        and state["failedRequests"] == [],
        f"{run.role}/{run.device_id}: baseline failed requests are missing or non-zero.",
    )
    quality = nested(state, "qualityAssessment")
    require(
        quality.get("status") == "BASELINE_DEFECTS_OBSERVED_NOT_A_CANDIDATE_PASS"
        and quality.get("capturePassed") is True
        and quality.get("candidatePass") is False,
        f"{run.role}/{run.device_id}: baseline quality classification is invalid.",
    )
    defects = quality.get("defects")
    require(isinstance(defects, list) and defects, f"{run.role}/{run.device_id}: expected baseline defects were not observed.")
    require(quality.get("defectCount") == len(defects), f"{run.role}/{run.device_id}: baseline defect count mismatch.")
    defect_kinds = {defect.get("kind") for defect in defects if isinstance(defect, dict)}
    require(
        {
            "painted-entrance-trigger-misalignment",
            "runtime-trigger-without-painted-route",
        }.issubset(defect_kinds),
        f"{run.role}/{run.device_id}: required authored-route baseline defects are missing.",
    )
    require(
        state.get("sourceSpawnSequence") == list(EXPECTED_SOURCE_SPAWNS),
        f"{run.role}/{run.device_id}: baseline sourceSpawnId sequence regressed.",
    )
    parity = state.get("candidateFixtureCoordinateParity")
    require(isinstance(parity, dict) and set(parity) == set(AREA_IDS), f"{run.role}/{run.device_id}: fixture coordinate parity is incomplete.")
    require(
        all(value.get("xCoordinatesMatch") is True for value in parity.values()),
        f"{run.role}/{run.device_id}: baseline/candidate sample X parity failed.",
    )
    spawn_measurements = nested(state, "evidence", "spawnMeasurements")
    require(
        isinstance(spawn_measurements, list)
        and len(spawn_measurements) == len(EXPECTED_BASELINE_SPAWN_MEASUREMENTS),
        f"{run.role}/{run.device_id}: baseline must contain exactly six "
        "spawn measurements.",
    )
    for measurement, expected in zip(
        spawn_measurements,
        EXPECTED_BASELINE_SPAWN_MEASUREMENTS,
        strict=True,
    ):
        expected_area, expected_spawn_id, expected_position = expected
        runtime_spawns = nested(
            state,
            "runtimeContract",
            "areas",
            expected_area,
            "spawnPoints",
        )
        require(
            isinstance(runtime_spawns, dict),
            f"{run.role}/{run.device_id}: baseline {expected_area} runtime "
            "spawn contract is missing.",
        )
        expected_runtime_spawn = runtime_spawns.get(expected_spawn_id)
        expected_runtime_ground_y = finite_number(
            nested(
                state,
                "runtimeContract",
                "areas",
                expected_area,
                "groundY",
            ),
            f"{run.role}/{run.device_id}: baseline {expected_area} "
            "runtime ground Y",
        )
        require(
            isinstance(expected_runtime_spawn, dict)
            and expected_runtime_spawn.get("id") == expected_spawn_id,
            f"{run.role}/{run.device_id}: baseline {expected_area}/"
            f"{expected_spawn_id} runtime spawn is missing.",
        )
        snapshot = nested(measurement, "runtimeSnapshot")
        require(
            measurement.get("spawn") is True
            and measurement.get("areaId") == expected_area
            and measurement.get("position") == expected_position
            and measurement.get("spawnId") == expected_spawn_id
            and measurement.get("runtimeSpawn") == expected_runtime_spawn
            and measurement.get("runtimeSpawnY")
            == expected_runtime_ground_y
            and measurement.get("runtimeSpawnXToleranceWorldPx")
            == BASELINE_SPAWN_X_TOLERANCE_WORLD_PX
            and snapshot.get("area") == expected_area
            and snapshot.get("spawnId") == expected_spawn_id
            and snapshot.get("facing")
            == expected_runtime_spawn.get("facing")
            and abs(
                finite_number(
                    snapshot.get("playerX"),
                    f"{run.role}/{run.device_id}: baseline "
                    f"{expected_position} X",
                )
                - finite_number(
                    expected_runtime_spawn.get("x"),
                    f"{run.role}/{run.device_id}: baseline "
                    f"{expected_spawn_id} contract X",
                )
            )
            <= BASELINE_SPAWN_X_TOLERANCE_WORLD_PX
            and abs(
                finite_number(
                    snapshot.get("playerY"),
                    f"{run.role}/{run.device_id}: baseline "
                    f"{expected_position} Y",
                )
                - expected_runtime_ground_y
            )
            <= 1,
            f"{run.role}/{run.device_id}: baseline {expected_position} is "
            "not bound to its runtime spawn contract.",
        )

    fixture = nested(state, "independentVisualFixture")
    require(fixture.get("baselineCommit") == baseline_sha, f"{run.role}/{run.device_id}: baseline visual fixture SHA mismatch.")
    for area_id in AREA_IDS:
        for position in POSITIONS:
            measurement, _ = baseline_ground_entry(run, area_id, position)
            sample = nested(measurement, "independentVisualSample")
            actual_x = finite_number(
                nested(measurement, "runtimeSnapshot", "playerX"),
                f"{run.role}/{run.device_id}: {area_id}/{position} player X",
            )
            require(
                sample.get("position") == position
                and abs(
                    actual_x
                    - finite_number(
                        sample.get("x"),
                        f"{run.role}/{run.device_id}: "
                        f"{area_id}/{position} fixture X",
                    )
                )
                <= finite_number(
                    nested(
                        state,
                        "measurementPositioning",
                        "targetToleranceWorldPx",
                    ),
                    f"{run.role}/{run.device_id}: baseline X tolerance",
                ),
                f"{run.role}/{run.device_id}: baseline position annotation mismatch.",
            )
        for phase in PHASES:
            entry, _ = phase_entry(run, area_id, phase, baseline=True)
            require(
                entry.get("minutes") in {360, 720, 990, 1200},
                f"{run.role}/{run.device_id}: invalid phase clock value.",
            )
            validate_phase_coordinate(
                run,
                area_id,
                phase,
                entry,
                baseline=True,
            )
    panel_entries(run)
    same_coordinates = nested(state, "evidence", "sameCoordinateComparisons")
    require(set(same_coordinates) == set(DIRECTIONS), f"{run.role}/{run.device_id}: same-coordinate up/down capture is incomplete.")
    for direction in DIRECTIONS:
        entry = same_coordinates[direction]
        require(entry.get("direction") == direction, f"{run.role}/{run.device_id}: same-coordinate direction mismatch.")
        safe_run_file(run, nested(entry, "screenshot"), png=True)
    transitions = nested(state, "evidence", "transitions")
    require(isinstance(transitions, list) and len(transitions) == 5, f"{run.role}/{run.device_id}: baseline must contain five transitions.")
    if run.viewport_key[3]:
        require(
            nested(state, "inputEvidence", "horizontalMovement") == "CDP real touch joystick drag"
            and nested(state, "inputEvidence", "panelActivation") == "CDP real touch tap",
            f"{run.role}/{run.device_id}: baseline mobile input is not real touch.",
        )


def validate_candidate_measurement(
    run: Run,
    measurement: dict[str, Any],
    *,
    spawn: bool,
) -> None:
    area_id = measurement.get("areaId")
    require(area_id in AREA_IDS, f"{run.role}/{run.device_id}: unknown ground area {area_id}.")
    fixture = nested(run.state, "geometryFixture")
    area = nested(fixture, "areas", area_id)
    ground_y = nested(area, "ground", "y")
    tolerance_name = "spawnFootToGroundCssPx" if spawn else "renderedFootToGroundCssPx"
    expected_tolerance = nested(fixture, "tolerances", tolerance_name)
    require(
        measurement.get("fixtureGroundY") == ground_y,
        f"{run.role}/{run.device_id}: {area_id} ground measurement does not use its state fixture.",
    )
    require(
        measurement.get("tolerance") == expected_tolerance
        and float(measurement.get("cssDelta", math.inf)) <= float(expected_tolerance),
        f"{run.role}/{run.device_id}: {area_id} foot/ground tolerance failed.",
    )
    require(
        nested(measurement, "playerGeometry", "areaId") == area_id,
        f"{run.role}/{run.device_id}: stale player geometry in ground measurement.",
    )
    require(
        measurement.get("backgroundSha256") == nested(area, "assets", "backgroundSha256")
        and measurement.get("foregroundSha256") == nested(area, "assets", "foregroundSha256"),
        f"{run.role}/{run.device_id}: {area_id} ground measurement asset hashes differ from the fixture.",
    )


def validate_x11_tab_lifecycle_contract(
    run: Run,
    hidden_visible: dict[str, Any],
) -> None:
    """Fail closed on the native X11 tab, focus, visibility, and audio proof."""
    label = f"{run.role}/{run.device_id}"

    def chrome_wm_class(value: Any) -> bool:
        return (
            isinstance(value, dict)
            and set(value) == {"instance", "class"}
            and isinstance(value.get("instance"), str)
            and CHROME_X11_INSTANCE_RE.fullmatch(value["instance"])
            is not None
            and isinstance(value.get("class"), str)
            and re.fullmatch(
                r"Google-chrome",
                value["class"],
                flags=re.IGNORECASE,
            )
            is not None
        )

    require(
        hidden_visible.get("method") == "x11-xdotool-tab-switch"
        and "windowControl" not in hidden_visible
        and "minimiz" not in json.dumps(hidden_visible, ensure_ascii=True).lower(),
        f"{label}: native X11 tab-switch method is invalid.",
    )
    tab_control = nested(hidden_visible, "x11TabControl")
    browser_pid = tab_control.get("browserPid")
    browser_process = nested(tab_control, "browserProcess")
    runtime_browser_process = nested(run.state, "runtime", "browserProcess")
    tool = nested(tab_control, "tool")
    require(
        isinstance(browser_pid, int)
        and not isinstance(browser_pid, bool)
        and browser_pid > 0
        and isinstance(browser_process.get("pid"), int)
        and not isinstance(browser_process.get("pid"), bool)
        and browser_process.get("pid") == browser_pid
        and isinstance(browser_process.get("executablePath"), str)
        and Path(browser_process["executablePath"]).is_absolute()
        and isinstance(browser_process.get("executableBytes"), int)
        and not isinstance(browser_process.get("executableBytes"), bool)
        and browser_process.get("executableBytes") == M15_GOOGLE_CHROME_ELF_BYTES
        and isinstance(browser_process.get("executableSha256"), str)
        and browser_process["executableSha256"] == M15_GOOGLE_CHROME_ELF_SHA256
        and browser_process == runtime_browser_process
        and tool.get("name") == "xdotool"
        and isinstance(tool.get("version"), str)
        and bool(tool["version"].strip()),
        f"{label}: X11 control tool or browser PID is invalid.",
    )

    candidate_target = nested(tab_control, "candidateTarget")
    foreground_target = nested(tab_control, "foregroundTarget")
    require(
        isinstance(candidate_target.get("targetId"), str)
        and bool(candidate_target["targetId"])
        and isinstance(foreground_target.get("targetId"), str)
        and bool(foreground_target["targetId"])
        and candidate_target["targetId"] != foreground_target["targetId"]
        and isinstance(candidate_target.get("browserWindowId"), int)
        and not isinstance(candidate_target.get("browserWindowId"), bool)
        and candidate_target["browserWindowId"] > 0
        and foreground_target.get("browserWindowId")
        == candidate_target["browserWindowId"]
        and foreground_target.get("internalNewTab") is True
        and tab_control.get("contextPageEventObserved") is True,
        f"{label}: CDP target/window identity is invalid.",
    )

    activation = nested(tab_control, "initialActivation")
    activation_target = nested(activation, "target")
    identities = activation.get("browserPidClientIdentities")
    browser_pid_client_count = activation.get("browserPidClientCount")
    matching_chrome_window_count = activation.get("matchingChromeWindowCount")
    activation_attempt_count = activation.get("attemptCount")
    require(
        activation.get("discoveryMethod")
        == "_NET_CLIENT_LIST + _NET_WM_PID + WM_CLASS"
        and activation.get("discoveryProperty") == "_NET_CLIENT_LIST"
        and isinstance(activation.get("observedClientWindowCount"), int)
        and not isinstance(activation.get("observedClientWindowCount"), bool)
        and activation["observedClientWindowCount"] >= 1
        and isinstance(browser_pid_client_count, int)
        and not isinstance(browser_pid_client_count, bool)
        and browser_pid_client_count == 1
        and isinstance(matching_chrome_window_count, int)
        and not isinstance(matching_chrome_window_count, bool)
        and matching_chrome_window_count == 1
        and isinstance(activation_attempt_count, int)
        and not isinstance(activation_attempt_count, bool)
        and activation_attempt_count == 1
        and isinstance(identities, list)
        and len(identities) == 1
        and identities[0] == activation_target
        and isinstance(activation_target.get("windowId"), int)
        and not isinstance(activation_target.get("windowId"), bool)
        and activation_target["windowId"] > 0
        and isinstance(activation_target.get("wmPid"), int)
        and not isinstance(activation_target.get("wmPid"), bool)
        and activation_target["wmPid"] == browser_pid
        and chrome_wm_class(activation_target.get("wmClass")),
        f"{label}: singleton browser-PID Chrome X11 client is invalid.",
    )
    target_window_id = activation_target["windowId"]
    activation_snapshot = nested(activation, "activationSnapshot")
    activation_visibility = nested(activation, "candidateVisibility")
    require(
        isinstance(activation_snapshot, dict)
        and set(activation_snapshot)
        == {"xdotoolActiveWindowId", "rootActiveWindowId", "wmPid", "wmClass"}
        and isinstance(activation_snapshot.get("xdotoolActiveWindowId"), int)
        and not isinstance(activation_snapshot.get("xdotoolActiveWindowId"), bool)
        and activation_snapshot["xdotoolActiveWindowId"] == target_window_id
        and isinstance(activation_snapshot.get("rootActiveWindowId"), int)
        and not isinstance(activation_snapshot.get("rootActiveWindowId"), bool)
        and activation_snapshot["rootActiveWindowId"] == target_window_id
        and isinstance(activation_snapshot.get("wmPid"), int)
        and not isinstance(activation_snapshot.get("wmPid"), bool)
        and activation_snapshot["wmPid"] == browser_pid
        and activation_snapshot.get("wmClass") == activation_target["wmClass"]
        and isinstance(activation_visibility, dict)
        and set(activation_visibility) == {"documentHidden", "visibilityState"}
        and activation_visibility.get("documentHidden") is False
        and activation_visibility.get("visibilityState") == "visible"
        and isinstance(
            hidden_visible.get("activationCandidateVisibility"),
            dict,
        )
        and hidden_visible["activationCandidateVisibility"]
        == activation_visibility,
        f"{label}: initial X11 activation snapshot is invalid.",
    )

    page_counts = nested(tab_control, "pageCounts")
    require(
        isinstance(page_counts, dict)
        and set(page_counts) == {"before", "afterOpen", "afterCleanup"}
        and all(
            isinstance(page_counts[key], int)
            and not isinstance(page_counts[key], bool)
            for key in page_counts
        )
        and page_counts == {"before": 1, "afterOpen": 2, "afterCleanup": 1},
        f"{label}: X11 page-count lifecycle is not 1 -> 2 -> 1.",
    )
    commands = nested(tab_control, "commands")
    activation_command = nested(commands, "activateWindow")
    activation_command_attempt_count = activation_command.get("attemptCount")
    require(
        isinstance(activation_command, dict)
        and set(activation_command)
        == {"action", "sync", "attemptCount", "targetWindowId", "succeeded"}
        and activation_command.get("action") == "windowactivate"
        and activation_command.get("sync") is True
        and isinstance(activation_command_attempt_count, int)
        and not isinstance(activation_command_attempt_count, bool)
        and activation_command_attempt_count == 1
        and isinstance(activation_command.get("targetWindowId"), int)
        and not isinstance(activation_command.get("targetWindowId"), bool)
        and activation_command["targetWindowId"] == target_window_id
        and activation_command.get("succeeded") is True
        and nested(commands, "openTab", "gesture") == "Ctrl+T"
        and nested(commands, "openTab", "succeeded") is True
        and nested(commands, "returnTab", "gesture") == "Ctrl+Shift+Tab"
        and nested(commands, "returnTab", "succeeded") is True,
        f"{label}: X11 activation or tab gestures are invalid.",
    )

    snapshots = nested(tab_control, "x11Snapshots")
    snapshot_names = {
        "beforeOpen",
        "atOpenCommand",
        "afterOpen",
        "beforeReturn",
        "atReturnCommand",
        "afterReturn",
        "afterCleanup",
    }
    require(
        isinstance(snapshots, dict) and set(snapshots) == snapshot_names,
        f"{label}: active-window snapshot coverage is incomplete.",
    )
    for snapshot_name in snapshot_names:
        snapshot = nested(snapshots, snapshot_name)
        require(
            isinstance(snapshot.get("xdotoolActiveWindowId"), int)
            and not isinstance(snapshot.get("xdotoolActiveWindowId"), bool)
            and snapshot["xdotoolActiveWindowId"] == target_window_id
            and isinstance(snapshot.get("rootActiveWindowId"), int)
            and not isinstance(snapshot.get("rootActiveWindowId"), bool)
            and snapshot["rootActiveWindowId"] == target_window_id
            and isinstance(snapshot.get("wmPid"), int)
            and not isinstance(snapshot.get("wmPid"), bool)
            and snapshot["wmPid"] == browser_pid
            and chrome_wm_class(snapshot.get("wmClass")),
            f"{label}: {snapshot_name} does not identify the activated Chrome window.",
        )
    require(
        tab_control.get("foregroundClosed") is True
        and tab_control.get("cleanupComplete") is True,
        f"{label}: X11 witness cleanup is incomplete.",
    )

    before_hidden = nested(hidden_visible, "beforeHidden")
    hidden_audio = nested(hidden_visible, "hidden")
    visible_audio = nested(hidden_visible, "visible")
    require(
        all(
            item.get("sourceId") == before_hidden.get("sourceId")
            for item in (hidden_audio, visible_audio)
        )
        and isinstance(before_hidden.get("sourceId"), str)
        and bool(before_hidden["sourceId"])
        and all(
            item.get("muted") == before_hidden.get("muted")
            for item in (hidden_audio, visible_audio)
        )
        and isinstance(before_hidden.get("muted"), bool),
        f"{label}: hidden/visible source or mute state changed.",
    )

    hidden_settled = nested(hidden_visible, "hiddenSettledState")
    hidden_candidate = nested(hidden_settled, "candidate")
    hidden_foreground = nested(hidden_settled, "foreground")
    hidden_candidate_audio = nested(hidden_candidate, "audio")
    hidden_automation = nested(hidden_audio, "masterGainAutomation")
    hidden_candidate_automation = nested(
        hidden_candidate_audio,
        "masterGainAutomation",
    )
    require(
        hidden_candidate.get("documentHidden") is True
        and hidden_candidate.get("visibilityState") == "hidden"
        and isinstance(hidden_foreground, dict)
        and hidden_foreground.get("documentHidden") is False
        and hidden_foreground.get("visibilityState") == "visible"
        and hidden_audio.get("documentHidden") is True
        and hidden_candidate_audio.get("documentHidden") is True
        and hidden_candidate_audio.get("sourceId") == before_hidden["sourceId"]
        and hidden_candidate_audio.get("muted") == before_hidden["muted"]
        and hidden_automation.get("reason") == "visibility-hidden"
        and finite_number(hidden_automation.get("target"), f"{label}: hidden target")
        == 0
        and finite_number(hidden_audio.get("masterGain"), f"{label}: hidden gain")
        <= 0.01
        and hidden_candidate_automation.get("reason") == "visibility-hidden"
        and finite_number(
            hidden_candidate_automation.get("target"),
            f"{label}: hidden settled target",
        )
        == 0
        and finite_number(
            hidden_candidate_audio.get("masterGain"),
            f"{label}: hidden settled gain",
        )
        <= 0.01,
        f"{label}: mutually hidden candidate audio did not settle.",
    )

    visible_settled = nested(hidden_visible, "visibleSettledState")
    visible_candidate = nested(visible_settled, "candidate")
    visible_foreground = nested(visible_settled, "foreground")
    visible_candidate_audio = nested(visible_candidate, "audio")
    visible_automation = nested(visible_audio, "masterGainAutomation")
    visible_candidate_automation = nested(
        visible_candidate_audio,
        "masterGainAutomation",
    )
    visible_target = finite_number(
        visible_automation.get("target"),
        f"{label}: visible target",
    )
    visible_gain = finite_number(
        visible_audio.get("masterGain"),
        f"{label}: visible gain",
    )
    visible_candidate_target = finite_number(
        visible_candidate_automation.get("target"),
        f"{label}: visible settled target",
    )
    visible_candidate_gain = finite_number(
        visible_candidate_audio.get("masterGain"),
        f"{label}: visible settled gain",
    )
    require(
        visible_candidate.get("documentHidden") is False
        and visible_candidate.get("visibilityState") == "visible"
        and isinstance(visible_foreground, dict)
        and visible_foreground.get("documentHidden") is True
        and visible_foreground.get("visibilityState") == "hidden"
        and visible_audio.get("documentHidden") is False
        and visible_candidate_audio.get("documentHidden") is False
        and visible_candidate_audio.get("sourceId") == before_hidden["sourceId"]
        and visible_candidate_audio.get("muted") == before_hidden["muted"]
        and visible_audio.get("lastRecoveryError") is None
        and visible_automation.get("reason") == "visibility-visible"
        and visible_target > 0
        and abs(visible_gain - visible_target) <= 0.02
        and visible_candidate_automation.get("reason") == "visibility-visible"
        and visible_candidate_target > 0
        and abs(visible_candidate_gain - visible_candidate_target) <= 0.02,
        f"{label}: mutually visible candidate audio did not recover.",
    )
    duration = finite_number(
        visible_candidate_audio.get("duration"),
        f"{label}: visible duration",
    )
    require(duration > 1, f"{label}: visible duration is invalid.")
    start_offset = finite_number(
        visible_candidate_audio.get("offset"),
        f"{label}: visible settled offset",
    )
    resumed_offset = finite_number(
        visible_audio.get("offset"),
        f"{label}: resumed visible offset",
    )
    recomputed_delta = (resumed_offset - start_offset) % duration
    recorded_delta = finite_number(
        hidden_visible.get("visibleRecoveryDelta"),
        f"{label}: recorded visible recovery delta",
    )
    require(
        0.15 <= recomputed_delta < duration / 2
        and math.isclose(recorded_delta, recomputed_delta, abs_tol=1e-6),
        f"{label}: visible recovery offset delta is invalid.",
    )


def validate_candidate_audio_and_lifecycle(run: Run) -> None:
    timeline = nested(run.state, "evidence", "audio", "timeline")
    names = ("start", "startedForward", "middle", "loopBefore", "loopAfter")
    source_ids = [nested(timeline, name, "sourceId") for name in names]
    require(
        all(isinstance(source_id, str) and source_id for source_id in source_ids)
        and len(set(source_ids)) == 1,
        f"{run.role}/{run.device_id}: BGM source changed across timeline.",
    )
    require(nested(timeline, "start", "decodedChannels") == 2, f"{run.role}/{run.device_id}: decoded BGM is not stereo.")
    require(
        finite_number(
            nested(timeline, "start", "decodedSampleRate"),
            f"{run.role}/{run.device_id}: decoded sample rate",
        ) > 0,
        f"{run.role}/{run.device_id}: invalid decoded sample rate.",
    )
    require(
        0 < finite_number(
            timeline.get("boundaryDelta"),
            f"{run.role}/{run.device_id}: loop boundary delta",
        ) < 1.5,
        f"{run.role}/{run.device_id}: invalid loop-boundary advance.",
    )
    mute_toggles = nested(run.state, "evidence", "audio", "muteToggles")
    require(
        isinstance(mute_toggles, list)
        and len(mute_toggles) >= 2
        and all(isinstance(toggle, dict) for toggle in mute_toggles),
        f"{run.role}/{run.device_id}: actual mute/unmute gain Evidence is incomplete.",
    )
    requested_mute_states = [
        toggle.get("requestedMuted") for toggle in mute_toggles
    ]
    require(
        all(state is True or state is False for state in requested_mute_states)
        and any(state is True for state in requested_mute_states)
        and any(state is False for state in requested_mute_states),
        f"{run.role}/{run.device_id}: mute Evidence states are invalid.",
    )
    for toggle in mute_toggles:
        muted = toggle.get("requestedMuted")
        after = nested(toggle, "after")
        automation = nested(after, "masterGainAutomation")
        expected_reason = "mute" if muted else "unmute"
        require(
            after.get("muted") is muted
            and automation.get("reason") == expected_reason,
            f"{run.role}/{run.device_id}: {expected_reason} automation was not observed.",
        )
        target = finite_number(
            automation.get("target"),
            f"{run.role}/{run.device_id}: {expected_reason} target gain",
        )
        actual = finite_number(
            after.get("masterGain"),
            f"{run.role}/{run.device_id}: {expected_reason} actual gain",
        )
        require(
            (muted and target == 0 and actual <= 0.01)
            or (
                not muted
                and target > 0
                and abs(actual - target) <= 0.02
            ),
            f"{run.role}/{run.device_id}: {expected_reason} actual gain did not settle.",
        )
    lifecycle = nested(run.state, "evidence", "lifecycle")
    lifecycle_launch = validate_browser_lifecycle_launch_policy(
        nested(run.state, "browserLifecycleLaunch"),
        f"{run.role}/{run.device_id}",
    )
    require(
        lifecycle_launch.get("ignoredPlaywrightDefaultArgs")
        == [
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
        ]
        and lifecycle_launch.get("chromiumArgs")
        == [
            "--use-gl=swiftshader",
            "--enable-webgl",
            "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist",
            "--ozone-platform=x11",
        ]
        and isinstance(lifecycle_launch.get("reason"), str)
        and "native Chromium hidden/visible" in lifecycle_launch["reason"],
        f"{run.role}/{run.device_id}: native browser backgrounding was not enabled.",
    )
    hidden_visible = nested(lifecycle, "hiddenVisible")
    validate_x11_tab_lifecycle_contract(run, hidden_visible)
    require(
        hidden_visible.get("method") == "x11-xdotool-tab-switch",
        f"{run.role}/{run.device_id}: visibility recovery did not use a real X11 Chrome tab switch.",
    )
    require(
        "windowControl" not in hidden_visible
        and "minimiz" not in json.dumps(hidden_visible, ensure_ascii=True).lower(),
        f"{run.role}/{run.device_id}: obsolete browser-window minimize Evidence is forbidden.",
    )
    tab_control = nested(hidden_visible, "x11TabControl")
    require(
        isinstance(tab_control, dict),
        f"{run.role}/{run.device_id}: x11TabControl must be an object.",
    )
    tool = nested(tab_control, "tool")
    browser_pid = tab_control.get("browserPid")
    candidate_target = nested(tab_control, "candidateTarget")
    foreground_target = nested(tab_control, "foregroundTarget")
    initial_activation = nested(tab_control, "initialActivation")
    require(
        isinstance(tool, dict)
        and isinstance(candidate_target, dict)
        and isinstance(foreground_target, dict),
        f"{run.role}/{run.device_id}: X11 tool and target records must be objects.",
    )
    candidate_target_id = candidate_target.get("targetId")
    foreground_target_id = foreground_target.get("targetId")
    candidate_window_id = candidate_target.get("browserWindowId")
    foreground_window_id = foreground_target.get("browserWindowId")
    require(
        tool.get("name") == "xdotool"
        and isinstance(tool.get("version"), str)
        and bool(tool["version"].strip())
        and isinstance(browser_pid, int)
        and not isinstance(browser_pid, bool)
        and browser_pid > 0,
        f"{run.role}/{run.device_id}: X11 control tool or Chrome browser PID is invalid.",
    )
    require(
        isinstance(candidate_target_id, str)
        and bool(candidate_target_id)
        and isinstance(foreground_target_id, str)
        and bool(foreground_target_id)
        and candidate_target_id != foreground_target_id
        and isinstance(candidate_window_id, int)
        and not isinstance(candidate_window_id, bool)
        and candidate_window_id > 0
        and isinstance(foreground_window_id, int)
        and not isinstance(foreground_window_id, bool)
        and foreground_window_id == candidate_window_id
        and foreground_target.get("internalNewTab") is True
        and tab_control.get("contextPageEventObserved") is True,
        f"{run.role}/{run.device_id}: candidate/foreground CDP tab identity is invalid.",
    )
    activation_target = nested(initial_activation, "target")
    require(
        isinstance(activation_target, dict),
        f"{run.role}/{run.device_id}: initial Chrome X11 target must be an object.",
    )
    activation_target_window_id = activation_target.get("windowId")
    activation_snapshot = nested(initial_activation, "activationSnapshot")
    activation_visibility = nested(initial_activation, "candidateVisibility")
    browser_pid_client_identities = initial_activation.get(
        "browserPidClientIdentities",
    )
    browser_pid_client_count = initial_activation.get("browserPidClientCount")
    matching_chrome_window_count = initial_activation.get(
        "matchingChromeWindowCount",
    )
    activation_attempt_count = initial_activation.get("attemptCount")
    require(
        isinstance(initial_activation, dict)
        and initial_activation.get("discoveryMethod")
        == "_NET_CLIENT_LIST + _NET_WM_PID + WM_CLASS"
        and initial_activation.get("discoveryProperty") == "_NET_CLIENT_LIST"
        and isinstance(initial_activation.get("observedClientWindowCount"), int)
        and not isinstance(initial_activation.get("observedClientWindowCount"), bool)
        and initial_activation["observedClientWindowCount"] >= 1
        and isinstance(browser_pid_client_count, int)
        and not isinstance(browser_pid_client_count, bool)
        and browser_pid_client_count == 1
        and isinstance(matching_chrome_window_count, int)
        and not isinstance(matching_chrome_window_count, bool)
        and matching_chrome_window_count == 1
        and isinstance(activation_attempt_count, int)
        and not isinstance(activation_attempt_count, bool)
        and activation_attempt_count == 1
        and isinstance(browser_pid_client_identities, list)
        and len(browser_pid_client_identities) == 1
        and isinstance(activation_target_window_id, int)
        and not isinstance(activation_target_window_id, bool)
        and activation_target_window_id > 0
        and isinstance(activation_target.get("wmPid"), int)
        and not isinstance(activation_target.get("wmPid"), bool)
        and activation_target["wmPid"] == browser_pid
        and isinstance(activation_target.get("wmClass"), dict),
        f"{run.role}/{run.device_id}: initial Chrome X11 client discovery is invalid.",
    )
    recomputed_matching_chrome_clients = []
    for identity in browser_pid_client_identities:
        require(
            isinstance(identity, dict)
            and set(identity) == {"windowId", "wmPid", "wmClass"}
            and isinstance(identity.get("wmPid"), int)
            and not isinstance(identity.get("wmPid"), bool)
            and identity["wmPid"] == browser_pid
            and isinstance(identity.get("windowId"), int)
            and not isinstance(identity.get("windowId"), bool)
            and identity["windowId"] > 0
            and isinstance(identity.get("wmClass"), dict),
            f"{run.role}/{run.device_id}: browser-PID X11 client identity is invalid.",
        )
        identity_class = identity["wmClass"]
        if (
            set(identity_class) == {"instance", "class"}
            and isinstance(identity_class.get("instance"), str)
            and CHROME_X11_INSTANCE_RE.fullmatch(identity_class["instance"])
            is not None
            and isinstance(identity_class.get("class"), str)
            and re.fullmatch(
                r"Google-chrome",
                identity_class["class"],
                flags=re.IGNORECASE,
            )
            is not None
        ):
            recomputed_matching_chrome_clients.append(identity)
    require(
        len(recomputed_matching_chrome_clients) == 1
        and recomputed_matching_chrome_clients[0] == activation_target,
        f"{run.role}/{run.device_id}: singleton Chrome X11 client cannot be recomputed from discovery Evidence.",
    )
    activation_wm_class = activation_target["wmClass"]
    require(
        set(activation_wm_class) == {"instance", "class"}
        and isinstance(activation_wm_class.get("instance"), str)
        and CHROME_X11_INSTANCE_RE.fullmatch(activation_wm_class["instance"])
        is not None
        and isinstance(activation_wm_class.get("class"), str)
        and re.fullmatch(
            r"Google-chrome",
            activation_wm_class["class"],
            flags=re.IGNORECASE,
        )
        is not None,
        f"{run.role}/{run.device_id}: initial activation WM_CLASS is not Google Chrome.",
    )
    require(
        isinstance(activation_snapshot, dict)
        and activation_snapshot.get("xdotoolActiveWindowId")
        == activation_target_window_id
        and activation_snapshot.get("rootActiveWindowId")
        == activation_target_window_id
        and activation_snapshot.get("wmPid") == browser_pid
        and activation_snapshot.get("wmClass") == activation_wm_class
        and activation_visibility
        == {
            "documentHidden": False,
            "visibilityState": "visible",
        },
        f"{run.role}/{run.device_id}: post-activation X11 snapshot or candidate visibility is invalid.",
    )
    page_counts = nested(tab_control, "pageCounts")
    require(
        isinstance(page_counts, dict)
        and all(
            isinstance(page_counts.get(key), int)
            and not isinstance(page_counts.get(key), bool)
            for key in ("before", "afterOpen", "afterCleanup")
        )
        and page_counts.get("before") == 1
        and page_counts.get("afterOpen") == 2
        and page_counts.get("afterCleanup") == 1,
        f"{run.role}/{run.device_id}: Chrome context page counts do not prove one-tab cleanup.",
    )
    commands = nested(tab_control, "commands")
    require(
        isinstance(commands, dict),
        f"{run.role}/{run.device_id}: X11 command Evidence must be an object.",
    )
    command_attempt_count = nested(commands, "activateWindow", "attemptCount")
    require(
        nested(commands, "activateWindow", "action") == "windowactivate"
        and nested(commands, "activateWindow", "sync") is True
        and isinstance(command_attempt_count, int)
        and not isinstance(command_attempt_count, bool)
        and command_attempt_count == 1
        and nested(commands, "activateWindow", "targetWindowId")
        == activation_target_window_id
        and nested(commands, "activateWindow", "succeeded") is True
        and nested(commands, "openTab", "gesture") == "Ctrl+T"
        and nested(commands, "openTab", "succeeded") is True
        and nested(commands, "returnTab", "gesture") == "Ctrl+Shift+Tab"
        and nested(commands, "returnTab", "succeeded") is True,
        f"{run.role}/{run.device_id}: X11 tab-switch keyboard gestures are incomplete.",
    )
    snapshots = nested(tab_control, "x11Snapshots")
    snapshot_names = (
        "beforeOpen",
        "atOpenCommand",
        "afterOpen",
        "beforeReturn",
        "atReturnCommand",
        "afterReturn",
        "afterCleanup",
    )
    require(
        isinstance(snapshots, dict) and set(snapshots) == set(snapshot_names),
        f"{run.role}/{run.device_id}: X11 active-window snapshot coverage is incomplete.",
    )
    active_window_ids: list[int] = []
    for snapshot_name in snapshot_names:
        snapshot = nested(snapshots, snapshot_name)
        require(
            isinstance(snapshot, dict),
            f"{run.role}/{run.device_id}: {snapshot_name} must be an X11 snapshot object.",
        )
        xdotool_window_id = snapshot.get("xdotoolActiveWindowId")
        root_window_id = snapshot.get("rootActiveWindowId")
        wm_pid = snapshot.get("wmPid")
        wm_class = snapshot.get("wmClass")
        require(
            isinstance(xdotool_window_id, int)
            and not isinstance(xdotool_window_id, bool)
            and xdotool_window_id > 0
            and isinstance(root_window_id, int)
            and not isinstance(root_window_id, bool)
            and root_window_id == xdotool_window_id
            and isinstance(wm_pid, int)
            and not isinstance(wm_pid, bool)
            and wm_pid == browser_pid,
            f"{run.role}/{run.device_id}: {snapshot_name} does not identify the same active Chrome X11 window.",
        )
        require(
            isinstance(wm_class, dict)
            and set(wm_class) == {"instance", "class"}
            and isinstance(wm_class.get("instance"), str)
            and CHROME_X11_INSTANCE_RE.fullmatch(wm_class["instance"])
            is not None
            and isinstance(wm_class.get("class"), str)
            and re.fullmatch(
                r"Google-chrome",
                wm_class["class"],
                flags=re.IGNORECASE,
            )
            is not None,
            f"{run.role}/{run.device_id}: {snapshot_name} WM_CLASS is not Google Chrome.",
        )
        active_window_ids.append(xdotool_window_id)
    require(
        len(set(active_window_ids)) == 1,
        f"{run.role}/{run.device_id}: X11 active Chrome window changed during the tab lifecycle.",
    )
    require(
        active_window_ids[0] == activation_target_window_id,
        f"{run.role}/{run.device_id}: X11 lifecycle did not use the discovered Chrome client window.",
    )
    require(
        hidden_visible.get("activationCandidateVisibility")
        == activation_visibility,
        f"{run.role}/{run.device_id}: post-activation candidate visibility was not preserved in lifecycle Evidence.",
    )
    require(
        tab_control.get("foregroundClosed") is True
        and tab_control.get("cleanupComplete") is True,
        f"{run.role}/{run.device_id}: foreground witness tab cleanup is incomplete.",
    )
    before_hidden = nested(hidden_visible, "beforeHidden")
    visibility_sources = [
        nested(hidden_visible, name, "sourceId")
        for name in ("beforeHidden", "hidden", "visible")
    ]
    visibility_mute_states = [
        nested(hidden_visible, name, "muted")
        for name in ("beforeHidden", "hidden", "visible")
    ]
    require(
        all(isinstance(source_id, str) and source_id for source_id in visibility_sources)
        and len(set(visibility_sources)) == 1,
        f"{run.role}/{run.device_id}: visibility recovery replaced the BGM source.",
    )
    require(
        all(isinstance(muted, bool) for muted in visibility_mute_states)
        and len(set(visibility_mute_states)) == 1,
        f"{run.role}/{run.device_id}: visibility recovery changed or omitted the logical mute state.",
    )
    hidden_audio = nested(hidden_visible, "hidden")
    hidden_automation = nested(hidden_audio, "masterGainAutomation")
    hidden_settled = nested(hidden_visible, "hiddenSettledState")
    hidden_candidate = nested(hidden_settled, "candidate")
    hidden_foreground = nested(hidden_settled, "foreground")
    hidden_candidate_audio = nested(hidden_candidate, "audio")
    hidden_candidate_automation = nested(
        hidden_candidate_audio,
        "masterGainAutomation",
    )
    hidden_target = finite_number(
        hidden_automation.get("target"),
        f"{run.role}/{run.device_id}: hidden gain target",
    )
    hidden_gain = finite_number(
        hidden_audio.get("masterGain"),
        f"{run.role}/{run.device_id}: hidden actual gain",
    )
    hidden_candidate_target = finite_number(
        hidden_candidate_automation.get("target"),
        f"{run.role}/{run.device_id}: hidden settled candidate gain target",
    )
    hidden_candidate_gain = finite_number(
        hidden_candidate_audio.get("masterGain"),
        f"{run.role}/{run.device_id}: hidden settled candidate actual gain",
    )
    require(
        hidden_candidate.get("documentHidden") is True
        and hidden_candidate.get("visibilityState") == "hidden"
        and hidden_candidate_audio.get("documentHidden") is True
        and hidden_candidate_audio.get("sourceId") == hidden_audio.get("sourceId")
        and hidden_candidate_audio.get("muted") == hidden_audio.get("muted")
        and hidden_candidate_target == 0
        and hidden_candidate_automation.get("reason") == "visibility-hidden"
        and hidden_candidate_gain <= 0.01
        and hidden_foreground.get("documentHidden") is False
        and hidden_foreground.get("visibilityState") == "visible"
        and hidden_audio.get("documentHidden") is True
        and hidden_audio.get("muted") == before_hidden.get("muted")
        and hidden_target == 0
        and hidden_automation.get("reason") == "visibility-hidden"
        and hidden_gain <= 0.01,
        f"{run.role}/{run.device_id}: actual hidden-tab gain was not silenced.",
    )
    visible_audio = nested(hidden_visible, "visible")
    visible_automation = nested(visible_audio, "masterGainAutomation")
    visible_settled = nested(hidden_visible, "visibleSettledState")
    visible_candidate = nested(visible_settled, "candidate")
    visible_foreground = nested(visible_settled, "foreground")
    visible_candidate_audio = nested(visible_candidate, "audio")
    visible_candidate_automation = nested(
        visible_candidate_audio,
        "masterGainAutomation",
    )
    visible_target = finite_number(
        visible_automation.get("target"),
        f"{run.role}/{run.device_id}: visible gain target",
    )
    visible_gain = finite_number(
        visible_audio.get("masterGain"),
        f"{run.role}/{run.device_id}: visible actual gain",
    )
    visible_candidate_target = finite_number(
        visible_candidate_automation.get("target"),
        f"{run.role}/{run.device_id}: visible settled candidate gain target",
    )
    visible_candidate_gain = finite_number(
        visible_candidate_audio.get("masterGain"),
        f"{run.role}/{run.device_id}: visible settled candidate actual gain",
    )
    require(
        visible_candidate.get("documentHidden") is False
        and visible_candidate.get("visibilityState") == "visible"
        and visible_candidate_audio.get("documentHidden") is False
        and visible_candidate_audio.get("sourceId") == visible_audio.get("sourceId")
        and visible_candidate_audio.get("muted") == visible_audio.get("muted")
        and visible_candidate_target > 0
        and visible_candidate_automation.get("reason") == "visibility-visible"
        and abs(visible_candidate_gain - visible_candidate_target) <= 0.02
        and visible_foreground.get("documentHidden") is True
        and visible_foreground.get("visibilityState") == "hidden"
        and visible_audio.get("documentHidden") is False
        and visible_audio.get("muted") == before_hidden.get("muted")
        and visible_audio.get("lastRecoveryError") is None
        and visible_target > 0
        and visible_automation.get("reason") == "visibility-visible"
        and abs(visible_gain - visible_target) <= 0.02,
        f"{run.role}/{run.device_id}: actual visible-tab gain did not recover.",
    )
    visibility_duration = finite_number(
        visible_candidate_audio.get("duration"),
        f"{run.role}/{run.device_id}: visibility source duration",
    )
    require(
        visibility_duration > 1,
        f"{run.role}/{run.device_id}: visibility source duration is invalid.",
    )
    visible_recovery_start_offset = finite_number(
        visible_candidate_audio.get("offset"),
        f"{run.role}/{run.device_id}: visible-settled audio offset",
    )
    resumed_visibility_offset = finite_number(
        visible_audio.get("offset"),
        f"{run.role}/{run.device_id}: resumed audio offset",
    )
    visibility_resume_delta = (
        resumed_visibility_offset - visible_recovery_start_offset
    ) % visibility_duration
    recorded_visibility_resume_delta = finite_number(
        hidden_visible.get("visibleRecoveryDelta"),
        f"{run.role}/{run.device_id}: recorded visible recovery delta",
    )
    require(
        0.15 <= visibility_resume_delta < visibility_duration / 2,
        f"{run.role}/{run.device_id}: visible-tab audio offset did not resume forward.",
    )
    require(
        math.isclose(
            recorded_visibility_resume_delta,
            visibility_resume_delta,
            abs_tol=1e-6,
        ),
        f"{run.role}/{run.device_id}: recorded visible recovery delta is inconsistent.",
    )
    visibility_events = hidden_visible.get("visibilityEvents")
    require(
        isinstance(visibility_events, list)
        and all(isinstance(event, dict) for event in visibility_events),
        f"{run.role}/{run.device_id}: visibility events are malformed.",
    )
    hidden_event_index = next(
        (
            index
            for index, event in enumerate(visibility_events)
            if event.get("type") == "visibilitychange"
            and event.get("visibilityState") == "hidden"
        ),
        -1,
    )
    visible_event_index = next(
        (
            index
            for index, event in enumerate(visibility_events)
            if index > hidden_event_index
            and event.get("type") == "visibilitychange"
            and event.get("visibilityState") == "visible"
        ),
        -1,
    )
    require(
        hidden_event_index >= 0 and visible_event_index > hidden_event_index,
        f"{run.role}/{run.device_id}: real hidden/visible DOM events are missing.",
    )
    stale_traversal = nested(hidden_visible, "staleTraversal")
    injected = nested(stale_traversal, "injected")
    request_count_before = nested(injected, "requestCountBefore")
    request_count_after = nested(injected, "requestCountAfter")
    stale_before = nested(stale_traversal, "before")
    stale_after = nested(stale_traversal, "after")
    recomputed_stale_rejection = (
        stale_after.get("area") == stale_before.get("area")
        and stale_after.get("spawnId") == stale_before.get("spawnId")
        and stale_after.get("lastTransitionId")
        == stale_before.get("lastTransitionId")
        and stale_after.get("transitionState") == "idle"
    )
    require(
        isinstance(request_count_before, int)
        and not isinstance(request_count_before, bool)
        and isinstance(request_count_after, int)
        and not isinstance(request_count_after, bool)
        and stale_traversal.get("didNotTransition") is True
        and recomputed_stale_rejection
        and request_count_after == request_count_before + 1
        and nested(injected, "traversalRequest", "direction") == "up"
        and nested(injected, "traversalRequest", "visibilityState") == "hidden",
        f"{run.role}/{run.device_id}: stale hidden-tab traversal was not rejected.",
    )
    frozen = nested(lifecycle, "frozenActive")
    require(frozen.get("method") == "cdp-page-lifecycle", f"{run.role}/{run.device_id}: lifecycle test did not use CDP.")
    require(
        nested(frozen, "frozenCommand", "succeeded") is True
        and nested(frozen, "activeCommand", "succeeded") is True,
        f"{run.role}/{run.device_id}: CDP frozen/active command failed.",
    )
    require(
        nested(frozen, "beforeFreeze", "sourceId") == nested(frozen, "afterResume", "sourceId")
        and nested(frozen, "afterResume", "lastRecoveryError") is None,
        f"{run.role}/{run.device_id}: frozen/active recovery failed.",
    )
    after_resume = nested(frozen, "afterResume")
    after_resume_automation = nested(after_resume, "masterGainAutomation")
    after_resume_target = finite_number(
        after_resume_automation.get("target"),
        f"{run.role}/{run.device_id}: active recovery gain target",
    )
    after_resume_gain = finite_number(
        after_resume.get("masterGain"),
        f"{run.role}/{run.device_id}: active recovery actual gain",
    )
    require(
        after_resume_target > 0
        and abs(after_resume_gain - after_resume_target) <= 0.02,
        f"{run.role}/{run.device_id}: actual master gain did not recover after CDP active.",
    )
    heartbeat = nested(frozen, "heartbeatSuspension")
    calibration = nested(heartbeat, "calibration")
    calibration_gaps = calibration.get("sampledGaps")
    calibration_raw = nested(calibration, "heartbeat")
    calibration_callbacks = calibration_raw.get("callbackWallMs")
    calibration_started_ticks = calibration.get("startedTicks")
    calibration_finished_ticks = calibration.get("finishedTicks")
    require(
        isinstance(calibration_started_ticks, int)
        and not isinstance(calibration_started_ticks, bool)
        and isinstance(calibration_finished_ticks, int)
        and not isinstance(calibration_finished_ticks, bool)
        and isinstance(calibration_gaps, list)
        and len(calibration_gaps)
        == M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT
        and all(
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(float(value))
            and 0 < float(value) <= M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS
            for value in calibration_gaps
        )
        and isinstance(calibration_callbacks, list)
        and len(calibration_callbacks)
        >= M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT,
        f"{run.role}/{run.device_id}: foreground heartbeat calibration "
        "samples are malformed.",
    )
    calibration_maximum_gap = max(float(value) for value in calibration_gaps)
    calibration_minimum_gap = min(float(value) for value in calibration_gaps)
    calibration_started_wall = finite_number(
        calibration.get("startedWallMs"),
        f"{run.role}/{run.device_id}: heartbeat calibration start",
    )
    calibration_finished_wall = finite_number(
        calibration.get("finishedWallMs"),
        f"{run.role}/{run.device_id}: heartbeat calibration finish",
    )
    require(
        calibration.get("expectedIntervalMs") == M15_HEARTBEAT_INTERVAL_MS
        and calibration.get("requiredSampleCount")
        == M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT
        and calibration.get("maximumAllowedGapMs")
        == M15_HEARTBEAT_CALIBRATION_MAX_GAP_MS
        and calibration.get("freezeSeparationRatio")
        == M15_HEARTBEAT_FREEZE_SEPARATION_RATIO
        and calibration.get("tickDelta")
        == calibration_finished_ticks - calibration_started_ticks
        and calibration.get("tickDelta")
        >= M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT
        and math.isclose(
            finite_number(
                calibration.get("maximumObservedGapMs"),
                f"{run.role}/{run.device_id}: calibration maximum gap",
            ),
            calibration_maximum_gap,
            abs_tol=1,
        )
        and math.isclose(
            finite_number(
                calibration.get("minimumObservedGapMs"),
                f"{run.role}/{run.device_id}: calibration minimum gap",
            ),
            calibration_minimum_gap,
            abs_tol=1,
        )
        and calibration_gaps
        == calibration_raw.get("recentGapsMs", [])[
            -M15_HEARTBEAT_CALIBRATION_SAMPLE_COUNT:
        ]
        and calibration_callbacks == sorted(calibration_callbacks)
        and all(
            calibration_started_wall <= float(value)
            <= calibration_finished_wall
            for value in calibration_callbacks
        )
        and calibration.get("verified") is True,
        f"{run.role}/{run.device_id}: foreground heartbeat calibration "
        "is not fresh or fail-closed.",
    )
    after_heartbeat = nested(heartbeat, "afterResume")
    callback_values = after_heartbeat.get("callbackWallMs")
    before_heartbeat = nested(heartbeat, "beforeFreeze")
    host_window = nested(heartbeat, "innerFrozenHostWindow")
    inner_browser_window = nested(heartbeat, "innerFrozenBrowserWindow")
    require(
        isinstance(callback_values, list)
        and all(
            isinstance(value, (int, float)) and not isinstance(value, bool)
            for value in callback_values
        ),
        f"{run.role}/{run.device_id}: raw heartbeat timestamps are malformed.",
    )
    window_start = finite_number(
        nested(inner_browser_window, "start"),
        f"{run.role}/{run.device_id}: frozen window start",
    )
    window_end = finite_number(
        nested(inner_browser_window, "end"),
        f"{run.role}/{run.device_id}: frozen window end",
    )
    recomputed_inner_callbacks = [
        value
        for value in callback_values
        if window_start <= float(value) <= window_end
    ]
    frozen_settle_margin = finite_number(
        heartbeat.get("frozenSettleMarginMs"),
        f"{run.role}/{run.device_id}: frozen settle margin",
    )
    active_settle_margin = finite_number(
        heartbeat.get("activeSettleMarginMs"),
        f"{run.role}/{run.device_id}: active boundary margin",
    )
    frozen_accepted_at = finite_number(
        heartbeat.get("frozenAcceptedAt"),
        f"{run.role}/{run.device_id}: frozen acceptance time",
    )
    active_requested_at = finite_number(
        heartbeat.get("activeRequestedAt"),
        f"{run.role}/{run.device_id}: active request time",
    )
    browser_clock_offset = finite_number(
        heartbeat.get("browserClockOffsetMs"),
        f"{run.role}/{run.device_id}: browser clock offset",
    )
    host_window_start = finite_number(
        nested(host_window, "start"),
        f"{run.role}/{run.device_id}: frozen host window start",
    )
    host_window_end = finite_number(
        nested(host_window, "end"),
        f"{run.role}/{run.device_id}: frozen host window end",
    )
    active_boundary = active_requested_at + browser_clock_offset
    recomputed_post_active = [
        value for value in callback_values if float(value) > active_boundary
    ]
    frozen_duration = finite_number(
        heartbeat.get("frozenWallDurationMs"),
        f"{run.role}/{run.device_id}: frozen wall duration",
    )
    minimum_gap = finite_number(
        heartbeat.get("minimumSuspensionGapMs"),
        f"{run.role}/{run.device_id}: minimum suspension gap",
    )
    measured_max_gap = finite_number(
        after_heartbeat.get("maxGapMs"),
        f"{run.role}/{run.device_id}: measured maximum heartbeat gap",
    )
    before_last_wall = finite_number(
        before_heartbeat.get("lastWallMs"),
        f"{run.role}/{run.device_id}: pre-freeze heartbeat time",
    )
    require(
        callback_values == sorted(callback_values)
        and all(float(value) >= before_last_wall for value in callback_values),
        f"{run.role}/{run.device_id}: raw heartbeat timestamps are not chronological.",
    )
    recomputed_gaps = [
        float(value) - (
            before_last_wall if index == 0 else float(callback_values[index - 1])
        )
        for index, value in enumerate(callback_values)
    ]
    recomputed_max_gap = max(recomputed_gaps, default=0.0)
    expected_minimum_gap = max(
        2_500,
        math.floor(frozen_duration * 0.78),
        math.ceil(
            calibration_maximum_gap
            * M15_HEARTBEAT_FREEZE_SEPARATION_RATIO
        ),
    )
    require(
        frozen_duration >= 3_000
        and frozen_settle_margin == 400
        and active_settle_margin == 100
        and math.isclose(
            active_requested_at - frozen_accepted_at,
            frozen_duration,
            abs_tol=1,
        )
        and math.isclose(
            host_window_start,
            frozen_accepted_at + frozen_settle_margin,
            abs_tol=1,
        )
        and math.isclose(
            host_window_end,
            active_requested_at - active_settle_margin,
            abs_tol=1,
        )
        and math.isclose(
            window_start,
            host_window_start + browser_clock_offset,
            abs_tol=1,
        )
        and math.isclose(
            window_end,
            host_window_end + browser_clock_offset,
            abs_tol=1,
        )
        and minimum_gap == expected_minimum_gap
        and window_end - window_start >= 2_600,
        f"{run.role}/{run.device_id}: CDP frozen measurement window is too weak.",
    )
    require(
        heartbeat.get("innerFrozenCallbacks") == recomputed_inner_callbacks
        and recomputed_inner_callbacks == [],
        f"{run.role}/{run.device_id}: callbacks ran inside the recomputed frozen window.",
    )
    require(
        heartbeat.get("postActiveCallbacks") == recomputed_post_active
        and len(recomputed_post_active) >= 1,
        f"{run.role}/{run.device_id}: page heartbeat did not resume after active.",
    )
    recomputed_verified = (
        not recomputed_inner_callbacks
        and bool(recomputed_post_active)
        and math.isclose(measured_max_gap, recomputed_max_gap, abs_tol=1)
        and recomputed_max_gap >= minimum_gap
    )
    require(
        heartbeat.get("verified") is True and recomputed_verified,
        f"{run.role}/{run.device_id}: raw heartbeat data does not verify CDP suspension.",
    )
    post_active_input = nested(frozen, "postActiveInput")
    expected_input_source = "touch" if run.viewport_key[3] else "keyboard"
    require(
        nested(post_active_input, "during", "area") == "life-road"
        and nested(post_active_input, "during", "inputSource")
        == expected_input_source
        and finite_number(
            nested(post_active_input, "during", "speed"),
            f"{run.role}/{run.device_id}: post-active movement speed",
        ) > 0
        and nested(post_active_input, "stopped", "area") == "life-road"
        and nested(post_active_input, "stopped", "inputSource") == "none"
        and finite_number(
            nested(post_active_input, "stopped", "speed"),
            f"{run.role}/{run.device_id}: post-active stopped speed",
        ) == 0,
        f"{run.role}/{run.device_id}: real movement input did not recover after CDP active.",
    )
    require(
        isinstance(frozen.get("headlessConstraint"), str) and frozen["headlessConstraint"],
        f"{run.role}/{run.device_id}: headless lifecycle constraint is not documented.",
    )


def validate_candidate(run: Run, candidate_sha: str) -> None:
    state = run.state
    render_environment_fingerprint(run)
    require(state.get("revision") == "M1.5", f"{run.role}/{run.device_id}: wrong candidate revision.")
    require(state.get("expectedCommit") == candidate_sha, f"{run.role}/{run.device_id}: candidate SHA mismatch.")
    require(
        state.get("observedCommit") == candidate_sha,
        f"{run.role}/{run.device_id}: rendered build full SHA mismatch.",
    )
    require(
        state.get("buildCommitDisplay") == candidate_sha[:7],
        f"{run.role}/{run.device_id}: rendered build display SHA mismatch.",
    )
    require(
        state.get("browserHeadless") is False,
        f"{run.role}/{run.device_id}: formal Browser Evidence must use a headed browser.",
    )
    require(
        state.get("traceEnabled") is False,
        f"{run.role}/{run.device_id}: formal Browser Evidence must disable raw tracing.",
    )
    require(
        isinstance(state.get("pageErrors"), list)
        and state["pageErrors"] == [],
        f"{run.role}/{run.device_id}: page errors are missing or non-zero.",
    )
    require(
        isinstance(state.get("failedRequests"), list)
        and state["failedRequests"] == [],
        f"{run.role}/{run.device_id}: failed requests are missing or non-zero.",
    )
    require(
        state.get("status") == "complete"
        and nested(state, "finalization", "browserClosed") is True
        and nested(state, "finalization", "traceFinalized") is True,
        f"{run.role}/{run.device_id}: candidate run is not fully finalized.",
    )

    invariants = nested(state, "invariants")
    for name in (
        "groundInvariant",
        "worldGroundAuxiliaryInvariant",
        "cameraBoundsInvariant",
        "transitionLocked",
        "timePreserved",
        "mutePreserved",
        "phaseCoverage",
        "positionCoverage",
        "debugGeometryCoverage",
        "panelCoverage",
    ):
        require(invariants.get(name) is True, f"{run.role}/{run.device_id}: invariant {name} failed.")
    require(invariants.get("groundMeasurementCount") == 27, f"{run.role}/{run.device_id}: expected exactly 27 ground measurements.")
    require(invariants.get("panelStatesThisViewport") == 12, f"{run.role}/{run.device_id}: expected 12 panel states.")
    require(
        invariants.get("requiredAggregatePanelStatesAcrossThreeViewports") == 36,
        f"{run.role}/{run.device_id}: aggregate panel contract is not 36.",
    )
    require(invariants.get("pageErrors") == 0 and invariants.get("failedRequests") == 0, f"{run.role}/{run.device_id}: error counters are non-zero.")
    require(
        invariants.get("sourceSpawnIdPreserved") == list(EXPECTED_SOURCE_SPAWNS)
        and invariants.get("expectedSpawnSequence") == list(EXPECTED_SOURCE_SPAWNS),
        f"{run.role}/{run.device_id}: sourceSpawnId sequence regressed.",
    )
    require(set(invariants.get("areasVisited", [])) == set(AREA_IDS), f"{run.role}/{run.device_id}: not all areas were visited.")

    fixture = nested(state, "geometryFixture")
    require(set(nested(fixture, "areas")) == set(AREA_IDS), f"{run.role}/{run.device_id}: geometry fixture area set is invalid.")
    evidence = nested(state, "evidence")
    spawns = nested(evidence, "spawns")
    require(isinstance(spawns, list) and len(spawns) == 6, f"{run.role}/{run.device_id}: expected six spawn measurements.")
    for measurement, expected in zip(
        spawns,
        EXPECTED_SPAWN_MEASUREMENTS,
        strict=True,
    ):
        expected_area, expected_spawn_id, expected_position = expected
        validate_candidate_measurement(run, measurement, spawn=True)
        fixture_spawn = nested(
            fixture,
            "areas",
            expected_area,
            "spawns",
            expected_spawn_id,
        )
        snapshot = nested(measurement, "snapshot")
        require(
            measurement.get("areaId") == expected_area
            and measurement.get("position") == expected_position
            and measurement.get("spawnId") == expected_spawn_id
            and measurement.get("fixtureSpawn") == fixture_spawn
            and snapshot.get("area") == expected_area
            and snapshot.get("spawnId") == expected_spawn_id
            and snapshot.get("facing") == fixture_spawn.get("facing")
            and abs(
                finite_number(
                    snapshot.get("playerX"),
                    f"{run.role}/{run.device_id}: {expected_position} X",
                )
                - finite_number(
                    fixture_spawn.get("x"),
                    f"{run.role}/{run.device_id}: "
                    f"{expected_spawn_id} fixture X",
                )
            )
            <= 1
            and abs(
                finite_number(
                    snapshot.get("playerY"),
                    f"{run.role}/{run.device_id}: {expected_position} Y",
                )
                - finite_number(
                    fixture_spawn.get("y"),
                    f"{run.role}/{run.device_id}: "
                    f"{expected_spawn_id} fixture Y",
                )
            )
            <= 1,
            f"{run.role}/{run.device_id}: {expected_position} is not "
            "bound to its fixture spawn.",
        )

    for area_id in AREA_IDS:
        area_positions = nested(evidence, "areaPositions", area_id)
        for position in POSITIONS:
            measurement, _ = candidate_ground_entry(run, area_id, position)
            fixture_sample_matches = [
                sample
                for sample in nested(
                    fixture,
                    "areas",
                    area_id,
                    "ground",
                    "samples",
                )
                if sample.get("position") == position
            ]
            require(
                len(fixture_sample_matches) == 1,
                f"{run.role}/{run.device_id}: {area_id}/{position} "
                "fixture sample is ambiguous.",
            )
            fixture_sample = fixture_sample_matches[0]
            require(
                measurement.get("position") == position
                and measurement.get("fixtureSample") == fixture_sample
                and abs(
                    finite_number(
                        nested(measurement, "snapshot", "playerX"),
                        f"{run.role}/{run.device_id}: "
                        f"{area_id}/{position} player X",
                    )
                    - finite_number(
                        fixture_sample.get("x"),
                        f"{run.role}/{run.device_id}: "
                        f"{area_id}/{position} fixture X",
                    )
                )
                <= 4,
                f"{run.role}/{run.device_id}: {area_id}/{position} "
                "position is not fixture-anchored.",
            )
            validate_candidate_measurement(run, measurement, spawn=False)
        for direction_name in ("walkLeft", "walkRight"):
            walk = nested(area_positions, direction_name)
            require(
                nested(walk, "stopped", "inputSource") == "none"
                and float(nested(walk, "stopped", "speed")) == 0,
                f"{run.role}/{run.device_id}: {area_id}/{direction_name} did not stop.",
            )
            expected_source = "touch" if run.viewport_key[3] else "keyboard"
            require(
                nested(walk, "during", "inputSource") == expected_source,
                f"{run.role}/{run.device_id}: {area_id}/{direction_name} used the wrong input source.",
            )
        phases = nested(evidence, "phaseMatrix", area_id)
        require(set(phases) == set(PHASES), f"{run.role}/{run.device_id}: {area_id} phase matrix is incomplete.")
        for phase in PHASES:
            entry, _ = phase_entry(run, area_id, phase, baseline=False)
            require(
                entry.get("fixtureBackgroundSha256")
                == nested(fixture, "areas", area_id, "assets", "backgroundSha256", phase),
                f"{run.role}/{run.device_id}: {area_id}/{phase} background hash is not fixture-backed.",
            )
            validate_phase_coordinate(
                run,
                area_id,
                phase,
                entry,
                baseline=False,
            )
        debug = nested(evidence, "debugGeometry", area_id)
        safe_run_file(run, nested(debug, "screenshot"), png=True)
        for fixture_key in ("ground", "spawns", "branchEntrances"):
            require(
                nested(debug, "fixture", fixture_key)
                == nested(fixture, "areas", area_id, fixture_key),
                f"{run.role}/{run.device_id}: {area_id} debug overlay fixture drifted.",
            )

    panel = panel_entries(run)
    for (direction, sample_name, _), (entry, _) in panel.items():
        geometry = nested(entry, "geometry")
        validate_positive_rect(
            geometry.get("panelRect"),
            f"{run.role}/{run.device_id}: panel rectangle",
        )
        validate_positive_rect(
            geometry.get("playerRect"),
            f"{run.role}/{run.device_id}: player rectangle",
        )
        validate_positive_rect(
            geometry.get("footRect"),
            f"{run.role}/{run.device_id}: player foot rectangle",
        )
        require(float(geometry.get("playerIntersection", math.inf)) == 0, f"{run.role}/{run.device_id}: panel overlaps player.")
        require(float(geometry.get("playerDistance", -math.inf)) >= 12, f"{run.role}/{run.device_id}: panel/player gap is below 12 CSS px.")
        panel_rect = nested(geometry, "panelRect")
        require(
            float(panel_rect.get("width", 0)) >= 44
            and float(panel_rect.get("height", 0)) >= 44,
            f"{run.role}/{run.device_id}: panel touch target is below 44x44 CSS px.",
        )
        obstacles = geometry.get("obstacleMetrics")
        require(
            isinstance(obstacles, list)
            and {
                metric.get("selector")
                for metric in obstacles
                if isinstance(metric, dict)
            }
            == REQUIRED_PANEL_OBSTACLE_SELECTORS
            and len(obstacles) == len(REQUIRED_PANEL_OBSTACLE_SELECTORS),
            f"{run.role}/{run.device_id}: panel Evidence does not contain "
            "the exact required HUD/control rectangles.",
        )
        for metric in obstacles:
            selector = metric.get("selector")
            validate_positive_rect(
                metric.get("rect"),
                f"{run.role}/{run.device_id}: {selector} rectangle",
            )
            require(
                finite_number(
                    metric.get("intersectionArea"),
                    f"{run.role}/{run.device_id}: {selector} intersection",
                )
                == 0
                and finite_number(
                    metric.get("distance"),
                    f"{run.role}/{run.device_id}: {selector} distance",
                )
                >= 0,
                f"{run.role}/{run.device_id}: panel overlaps or omits "
                f"distance for {selector}.",
            )
        require(
            all(
                float(metric.get("intersectionArea", math.inf)) == 0
                for metric in obstacles
            ),
            f"{run.role}/{run.device_id}: panel overlaps a HUD/control obstacle.",
        )
        require(entry.get("touchEnabled") is run.viewport_key[3], f"{run.role}/{run.device_id}: panel touch metadata mismatch.")
        require(float(entry.get("deviceScaleFactor")) == run.viewport_key[2], f"{run.role}/{run.device_id}: panel DPR metadata mismatch.")
        validate_candidate_measurement(run, nested(entry, "groundCss"), spawn=False)
        area_id = entry.get("areaId")
        entrance = nested(fixture, "areas", area_id, "branchEntrances", direction)
        recorded_entrance = entry.get("entrance")
        require(
            isinstance(recorded_entrance, dict)
            and all(
                key in entrance and entrance[key] == value
                for key, value in recorded_entrance.items()
            )
            and {
                "backgroundRange",
                "backgroundCenterX",
                "triggerRange",
                "triggerCenterX",
                "centerDeltaX",
            }.issubset(recorded_entrance),
            f"{run.role}/{run.device_id}: panel entrance is not fixture-backed.",
        )
        trigger_sample = nested(entry, "triggerSample")
        trigger_range = entrance["triggerRange"]
        expected_trigger_sample = {
            "start": {
                "samplingSemantics": "inside-inclusive-trigger-edge",
                "insetWorldPx": PANEL_TRIGGER_INSET_WORLD_PX,
                "triggerBoundaryWorldX": trigger_range["minX"],
                "fixtureWorldX":
                    trigger_range["minX"] + PANEL_TRIGGER_INSET_WORLD_PX,
                "targetWorldX":
                    trigger_range["minX"] + PANEL_TRIGGER_INSET_WORLD_PX,
            },
            "center": {
                "samplingSemantics": "trigger-center",
                "insetWorldPx": 0,
                "triggerBoundaryWorldX": entrance["triggerCenterX"],
                "fixtureWorldX": entrance["triggerCenterX"],
                "targetWorldX": entrance["triggerCenterX"],
            },
            "end": {
                "samplingSemantics": "inside-inclusive-trigger-edge",
                "insetWorldPx": PANEL_TRIGGER_INSET_WORLD_PX,
                "triggerBoundaryWorldX": trigger_range["maxX"],
                "fixtureWorldX":
                    trigger_range["maxX"] - PANEL_TRIGGER_INSET_WORLD_PX,
                "targetWorldX":
                    trigger_range["maxX"] - PANEL_TRIGGER_INSET_WORLD_PX,
            },
        }[sample_name]
        require(
            trigger_sample.get("name") == sample_name
            and all(
                trigger_sample.get(key) == value
                for key, value in expected_trigger_sample.items()
            )
            and abs(
                finite_number(
                    entry.get("actualPlayerWorldX"),
                    f"{run.role}/{run.device_id}: panel actual player X",
                )
                - float(expected_trigger_sample["fixtureWorldX"])
            )
            <= 5,
            f"{run.role}/{run.device_id}: {direction}/{sample_name} panel "
            "is not sampled at the fixture-backed trigger edge/center.",
        )
        require(
            float(entrance.get("centerDeltaX", math.inf))
            <= float(nested(fixture, "tolerances", "entranceToTriggerCenterCssPx")),
            f"{run.role}/{run.device_id}: entrance/trigger center delta exceeds fixture tolerance.",
        )

    transitions = nested(evidence, "transitions")
    require(
        isinstance(transitions, list)
        and len(transitions) == 5
        and state.get("transitionCount") == 5,
        f"{run.role}/{run.device_id}: expected five transitions.",
    )
    panel_transition_kind = "touch-panel" if run.viewport_key[3] else "desktop-panel"
    require(
        sum(item.get("kind") == panel_transition_kind for item in transitions) == 2,
        f"{run.role}/{run.device_id}: up/down panel activation method is invalid.",
    )
    actual_viewport = nested(state, "runtime", "actualBrowserViewport")
    require(
        actual_viewport.get("width") == run.viewport_key[0]
        and actual_viewport.get("height") == run.viewport_key[1]
        and math.isclose(
            float(actual_viewport.get("devicePixelRatio")),
            run.viewport_key[2],
            abs_tol=0.01,
        ),
        f"{run.role}/{run.device_id}: actual browser viewport does not match requested viewport.",
    )
    max_touch_points = int(actual_viewport.get("maxTouchPoints", -1))
    require(
        max_touch_points > 0 if run.viewport_key[3] else max_touch_points == 0,
        f"{run.role}/{run.device_id}: actual browser touch capability mismatch.",
    )
    requested_assets = state.get("requestedM15Assets")
    require(
        isinstance(requested_assets, list)
        and any("/assets/images/m15/" in url for url in requested_assets)
        and any("/assets/audio/m15/" in url for url in requested_assets),
        f"{run.role}/{run.device_id}: M1.5 image/audio requests were not observed.",
    )
    validate_candidate_audio_and_lifecycle(run)


def validate_run_group(
    role: str,
    sources: Sequence[Path],
    expected_sha: str,
    *,
    baseline: bool,
) -> dict[tuple[int, int, float, bool], Run]:
    require(len(sources) == 3, f"{role} requires exactly three run directories.")
    runs = [load_run(role, source) for source in sources]
    require(len({run.source for run in runs}) == 3, f"{role} run directories must be distinct.")
    indexed: dict[tuple[int, int, float, bool], Run] = {}
    for run in runs:
        require(run.viewport_key not in indexed, f"{role} repeats viewport {run.viewport_key}.")
        if baseline:
            validate_baseline(run, expected_sha)
        else:
            validate_candidate(run, expected_sha)
        indexed[run.viewport_key] = run
    require(set(indexed) == set(EXPECTED_VIEWPORTS), f"{role} does not contain the exact required viewport matrix.")
    return indexed


def assert_phase_and_ground_pairing(
    baseline_runs: dict[tuple[int, int, float, bool], Run],
    local_runs: dict[tuple[int, int, float, bool], Run],
    preview_runs: dict[tuple[int, int, float, bool], Run],
) -> None:
    """Reject screenshots that cannot support like-for-like before/after review."""
    for key in EXPECTED_VIEWPORTS:
        baseline = baseline_runs[key]
        candidates = (local_runs[key], preview_runs[key])
        for area_id in AREA_IDS:
            baseline_fixture_samples = {
                sample["position"]: sample
                for sample in nested(
                    baseline.state,
                    "independentVisualFixture",
                    "areas",
                    area_id,
                    "visualGround",
                    "samples",
                )
            }
            for candidate in candidates:
                candidate_fixture_samples = {
                    sample["position"]: sample
                    for sample in nested(
                        candidate.state,
                        "geometryFixture",
                        "areas",
                        area_id,
                        "ground",
                        "samples",
                    )
                }
                require(
                    baseline_fixture_samples.keys()
                    == candidate_fixture_samples.keys(),
                    f"{candidate.role}/{baseline.device_id}/{area_id}: "
                    "ground sample names differ.",
                )
                for position in POSITIONS:
                    before = baseline_fixture_samples[position]
                    after = candidate_fixture_samples[position]
                    require(
                        before["x"] == after["x"]
                        and before["position"] == after["position"],
                        f"{candidate.role}/{baseline.device_id}/{area_id}/"
                        f"{position}: before/after ground coordinates differ.",
                    )
            for position in POSITIONS:
                baseline_measurement, _ = baseline_ground_entry(
                    baseline,
                    area_id,
                    position,
                )
                local_measurement, _ = candidate_ground_entry(
                    local_runs[key],
                    area_id,
                    position,
                )
                preview_measurement, _ = candidate_ground_entry(
                    preview_runs[key],
                    area_id,
                    position,
                )
                actual_values = [
                    measurement_actual_x(
                        baseline_measurement,
                        baseline=True,
                    ),
                    measurement_actual_x(
                        local_measurement,
                        baseline=False,
                    ),
                    measurement_actual_x(
                        preview_measurement,
                        baseline=False,
                    ),
                ]
                require(
                    max(actual_values) - min(actual_values) <= 8,
                    f"{baseline.device_id}/{area_id}/{position}: baseline/"
                    "local/Preview actual ground X coordinates differ.",
                )
            for phase in PHASES:
                before, _ = phase_entry(baseline, area_id, phase, baseline=True)
                local, _ = phase_entry(
                    local_runs[key],
                    area_id,
                    phase,
                    baseline=False,
                )
                preview, _ = phase_entry(
                    preview_runs[key],
                    area_id,
                    phase,
                    baseline=False,
                )
                entries = (
                    (baseline, before, True),
                    (local_runs[key], local, False),
                    (preview_runs[key], preview, False),
                )
                require(
                    len({
                        nested(entry, "snapshot", "timeMinutes")
                        for _, entry, _ in entries
                    }) == 1,
                    f"{baseline.device_id}/{area_id}/{phase}: phase clock differs.",
                )
                coordinates = [
                    validate_phase_coordinate(
                        run,
                        area_id,
                        phase,
                        entry,
                        baseline=is_baseline,
                    )
                    for run, entry, is_baseline in entries
                ]
                require(
                    len({
                        coordinate["targetWorldX"]
                        for coordinate in coordinates
                    }) == 1
                    and (
                        max(
                            coordinate["actualWorldX"]
                            for coordinate in coordinates
                        )
                        - min(
                            coordinate["actualWorldX"]
                            for coordinate in coordinates
                        )
                    )
                    <= PHASE_CAPTURE_PAIR_TOLERANCE_WORLD_PX,
                    f"{baseline.device_id}/{area_id}/{phase}: baseline/local/"
                    "Preview phase world coordinates differ.",
                )
        baseline_same = nested(
            baseline.state,
            "evidence",
            "sameCoordinateComparisons",
        )
        for candidate in candidates:
            candidate_panels = panel_entries(candidate)
            for direction in DIRECTIONS:
                matching_areas = [
                    area_id
                    for area_id in AREA_IDS
                    if direction
                    in nested(
                        candidate.state,
                        "geometryFixture",
                        "areas",
                        area_id,
                        "branchEntrances",
                    )
                ]
                require(
                    len(matching_areas) == 1,
                    f"{baseline.device_id}/{direction}: fixture direction "
                    "is ambiguous.",
                )
                area_id = matching_areas[0]
                entrance = nested(
                    candidate.state,
                    "geometryFixture",
                    "areas",
                    area_id,
                    "branchEntrances",
                    direction,
                )
                before = baseline_same[direction]
                require(
                    before.get("areaId") == area_id
                    and before.get("candidateEntrance") == entrance
                    and before.get("requestedWorldX")
                    == entrance.get("backgroundCenterX"),
                    f"{baseline.device_id}/{direction}: baseline "
                    "same-coordinate capture is not bound to the candidate "
                    "fixture.",
                )
                baseline_position_tolerance = float(
                    nested(
                        baseline.state,
                        "measurementPositioning",
                        "targetToleranceWorldPx",
                    ),
                )
                require(
                    abs(
                        float(before.get("actualBaselinePlayerX"))
                        - float(before.get("requestedWorldX"))
                    )
                    <= baseline_position_tolerance,
                    f"{baseline.device_id}/{direction}: baseline "
                    "same-coordinate capture missed its requested world X.",
                )
                for facing in FACINGS:
                    panel, _ = candidate_panels[
                        (direction, "center", facing)
                    ]
                    require(
                        nested(panel, "triggerSample", "fixtureWorldX")
                        == entrance.get("triggerCenterX"),
                        f"{candidate.device_id}/{direction}/{facing}: "
                        "candidate center panel is not fixture-backed.",
                    )


def validate_audio_directory(path: Path, candidate_sha: str) -> dict[str, Any]:
    resolved = path.expanduser().resolve()
    require(resolved.is_dir() and not resolved.is_symlink(), f"Audio Evidence directory is invalid: {resolved}")
    actual_names = {entry.name for entry in resolved.iterdir() if entry.is_file()}
    require(
        actual_names == REQUIRED_AUDIO_FILES,
        f"Audio Evidence must contain only the five fresh generated files; found {sorted(actual_names)}.",
    )
    require(not any(entry.is_symlink() for entry in resolved.iterdir()), "Audio Evidence cannot contain symlinks.")
    analysis = strict_json_load(resolved / "analysis.json")
    manifest = strict_json_load(resolved / "sha256-manifest.json")
    require(nested(analysis, "candidate", "gitHead") == candidate_sha, "Audio Evidence candidate SHA mismatch.")
    require(
        nested(analysis, "candidate", "gitStatusShort") == [],
        "Audio Evidence was generated from a dirty worktree.",
    )
    require(nested(analysis, "independentValidation", "allChecksPassed") is True, "Independent audio validation did not pass.")
    require_boolean_map(nested(analysis, "independentValidation", "checks"), "audio independent checks")
    require_boolean_map(nested(analysis, "visualizationPcmCrosscheck", "checks"), "audio visualization PCM cross-checks")
    require(
        int(nested(analysis, "independentValidation", "signal", "truePeakOversampleFactor")) >= 4,
        "Audio true-peak Evidence used less than 4x oversampling.",
    )
    require(manifest.get("candidateGitHead") == candidate_sha, "Audio manifest candidate SHA mismatch.")
    generated = nested(manifest, "generatedFiles")
    for filename in sorted(REQUIRED_AUDIO_FILES - {"sha256-manifest.json"}):
        source = resolved / filename
        if filename.endswith(".png"):
            check_png(source)
        record = generated.get(filename)
        require(
            isinstance(record, dict)
            and record.get("sha256") == sha256(source)
            and record.get("bytes") == source.stat().st_size,
            f"Audio Evidence hash mismatch: {filename}",
        )
    return {
        "path": resolved,
        "analysis": analysis,
        "manifest": manifest,
    }


def git_head() -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise EvidenceError(f"Could not resolve repository HEAD: {error}") from error
    return result.stdout.strip()


def resolve_runtime_asset(url_path: str) -> Path:
    require(
        isinstance(url_path, str) and url_path.startswith("/assets/"),
        f"Unsupported runtime asset path: {url_path!r}",
    )
    relative = Path(url_path.lstrip("/"))
    require(".." not in relative.parts, f"Runtime asset path escapes public/: {url_path}")
    path = (ROOT / "public" / relative).resolve()
    require(path.is_relative_to((ROOT / "public").resolve()), f"Runtime asset escapes public/: {url_path}")
    require(path.is_file() and not path.is_symlink(), f"Runtime asset is missing: {path}")
    return path


def validate_player_foot_evidence(
    path: Path,
    fixture: dict[str, Any],
    candidate_sha: str,
) -> dict[str, Any]:
    resolved = path.expanduser().resolve()
    report = strict_json_load(resolved)
    player = nested(fixture, "player")
    atlas_path = resolve_runtime_asset(player["atlasImagePath"])
    atlas_json_path = resolve_runtime_asset(player["atlasJsonPath"])
    manifest_path = ROOT / TRACKED_PROVENANCE[0]
    sidecar_path = manifest_path.with_suffix(".sha256")
    atlas_json = strict_json_load(atlas_json_path)
    frames = report.get("frames")
    require(
        report.get("schemaVersion") == 1
        and report.get("status") == "PASS"
        and report.get("candidateSha") == candidate_sha
        and report.get("expectedCommit") == candidate_sha
        and report.get("gitStatusShort") == []
        and report.get("failures") == [],
        "Player visible-foot Evidence is stale, dirty, or failed.",
    )
    require(
        nested(report, "manifest", "path")
        == str(manifest_path.relative_to(ROOT))
        and nested(report, "manifest", "bytes")
        == manifest_path.stat().st_size
        and nested(report, "manifest", "sha256") == sha256(manifest_path)
        and nested(report, "manifest", "sidecarPath")
        == str(sidecar_path.relative_to(ROOT))
        and nested(report, "manifest", "sidecarBytes")
        == sidecar_path.stat().st_size
        and nested(report, "manifest", "sidecarSha256")
        == sha256(sidecar_path)
        and nested(
            report,
            "manifest",
            "sidecarDeclaredManifestSha256",
        )
        == sha256(manifest_path),
        "Player visible-foot Evidence is not bound to the asset manifest.",
    )
    require(
        nested(report, "atlas", "path")
        == str(atlas_path.relative_to(ROOT))
        and nested(report, "atlas", "bytes") == atlas_path.stat().st_size
        and nested(report, "atlas", "sha256") == sha256(atlas_path)
        and nested(report, "atlas", "sha256")
        == player["atlasImageSha256"]
        and nested(report, "atlas", "manifestBytes")
        == atlas_path.stat().st_size
        and nested(report, "atlas", "manifestSha256")
        == sha256(atlas_path)
        and nested(report, "atlas", "jsonPath")
        == str(atlas_json_path.relative_to(ROOT))
        and nested(report, "atlas", "jsonBytes")
        == atlas_json_path.stat().st_size
        and nested(report, "atlas", "jsonSha256") == sha256(atlas_json_path)
        and nested(report, "atlas", "jsonSha256")
        == player["atlasJsonSha256"]
        and nested(report, "atlas", "manifestJsonBytes")
        == atlas_json_path.stat().st_size
        and nested(report, "atlas", "manifestJsonSha256")
        == sha256(atlas_json_path),
        "Player visible-foot Evidence is not bound to the fixture atlas.",
    )
    require(
        report.get("alphaThresholdExclusive") == 10
        and report.get("visibleFootToleranceCssPx") == 2
        and report.get("runtimeScale") == player["runtimeScale"]
        and report.get("frameCount") == 24
        and report.get("expectedFrameCount") == 24
        and isinstance(frames, list)
        and len(frames) == 24,
        "Player visible-foot Evidence contract is incomplete.",
    )
    expected_frame_names = set(nested(atlas_json, "frames"))
    require(
        {
            frame.get("name")
            for frame in frames
            if isinstance(frame, dict)
        }
        == expected_frame_names,
        "Player visible-foot Evidence frame names differ from the atlas.",
    )
    pivot_y = finite_number(
        nested(player, "footPivot", "pixelY"),
        "fixture player foot pivot Y",
    )
    runtime_scale = finite_number(
        player.get("runtimeScale"),
        "fixture player runtime scale",
    )
    for frame in frames:
        name = frame.get("name")
        max_alpha_y = finite_number(
            frame.get("maxAlphaY"),
            f"{name} maximum visible alpha Y",
        )
        bottom_exclusive = finite_number(
            frame.get("bottomExclusive"),
            f"{name} visible alpha bottom edge",
        )
        row_delta = finite_number(
            frame.get("rowDeltaPx"),
            f"{name} visible-foot row delta",
        )
        edge_delta = finite_number(
            frame.get("visibleBottomEdgeDeltaPx"),
            f"{name} visible-foot edge delta",
        )
        row_delta_css = finite_number(
            frame.get("rowDeltaCssPx"),
            f"{name} visible-foot CSS row delta",
        )
        edge_delta_css = finite_number(
            frame.get("visibleBottomEdgeDeltaCssPx"),
            f"{name} visible-foot CSS edge delta",
        )
        require(
            frame.get("visiblePixelCount", 0) > 12_000
            and frame.get("pivotPixelY") == pivot_y
            and max_alpha_y == pivot_y
            and bottom_exclusive == max_alpha_y + 1
            and row_delta == max_alpha_y - pivot_y == 0
            and edge_delta == bottom_exclusive - pivot_y
            and math.isclose(
                row_delta_css,
                row_delta * runtime_scale,
                abs_tol=1e-9,
            )
            and math.isclose(
                edge_delta_css,
                edge_delta * runtime_scale,
                abs_tol=1e-9,
            )
            and abs(row_delta_css) <= 2
            and abs(edge_delta_css) <= 2,
            f"{name} visible alpha foot does not match the runtime pivot.",
        )
    require(
        nested(report, "summary", "maxAbsoluteRowDeltaPx") == 0
        and nested(report, "summary", "maxAbsoluteRowDeltaCssPx") == 0
        and math.isclose(
            finite_number(
                nested(
                    report,
                    "summary",
                    "maxAbsoluteVisibleBottomEdgeDeltaCssPx",
                ),
                "maximum visible-foot bottom-edge CSS delta",
            ),
            runtime_scale,
            abs_tol=1e-9,
        ),
        "Player visible-foot Evidence summary does not match its frames.",
    )
    return {
        "path": resolved,
        "report": report,
    }


def validate_tracked_assets(
    fixture: dict[str, Any],
    candidate_sha: str,
) -> dict[str, Any]:
    require(git_head() == candidate_sha, "Assembler checkout HEAD does not match --candidate-sha.")
    manifest_path = ROOT / TRACKED_PROVENANCE[0]
    generation_path = ROOT / TRACKED_PROVENANCE[1]
    audio_provenance_path = ROOT / TRACKED_PROVENANCE[2]
    tracked_audio_analysis_path = ROOT / TRACKED_PROVENANCE[3]
    manifest = strict_json_load(manifest_path)
    generation = strict_json_load(generation_path)
    audio_provenance = strict_json_load(audio_provenance_path)
    tracked_audio = strict_json_load(tracked_audio_analysis_path)
    require(
        isinstance(manifest.get("rights"), str) and manifest["rights"],
        "Image manifest is missing rights information.",
    )
    require(
        isinstance(generation.get("rights"), str) and generation["rights"],
        "Image generation record is missing rights information.",
    )
    require(
        isinstance(audio_provenance.get("license"), str)
        and audio_provenance.get("externalSamples") is False
        and audio_provenance.get("thirdPartyMelody") is False,
        "Audio provenance does not establish project-original rights.",
    )

    manifest_files = {
        entry["path"]: entry
        for entry in manifest.get("files", [])
        if isinstance(entry, dict) and isinstance(entry.get("path"), str)
    }
    fixture_asset_paths: list[tuple[str, str]] = []
    player = nested(fixture, "player")
    fixture_asset_paths.extend(
        [
            (player["atlasImagePath"], player["atlasImageSha256"]),
            (player["atlasJsonPath"], player["atlasJsonSha256"]),
        ],
    )
    for area_id in AREA_IDS:
        assets = nested(fixture, "areas", area_id, "assets")
        for phase in PHASES:
            fixture_asset_paths.append(
                (
                    nested(assets, "backgroundPaths", phase),
                    nested(assets, "backgroundSha256", phase),
                ),
            )
        fixture_asset_paths.append(
            (assets["foregroundPath"], assets["foregroundSha256"]),
        )
    resolved_assets: dict[str, Path] = {}
    for runtime_path, expected_hash in fixture_asset_paths:
        path = resolve_runtime_asset(runtime_path)
        require(sha256(path) == expected_hash, f"Fixture asset SHA-256 mismatch: {runtime_path}")
        repository_relative = str(path.relative_to(ROOT))
        record = manifest_files.get(repository_relative)
        require(
            record is not None
            and record.get("sha256") == expected_hash
            and record.get("bytes") == path.stat().st_size,
            f"Asset manifest does not bind fixture asset: {repository_relative}",
        )
        resolved_assets[runtime_path] = path
    require(
        tracked_audio.get("allChecksPassed") is True
        and isinstance(tracked_audio.get("runtimeFile"), str)
        and tracked_audio["runtimeFile"].startswith(
            audio_provenance["runtimeAssetPattern"].split("<", maxsplit=1)[0],
        ),
        "Tracked audio analysis is invalid.",
    )
    return {
        "manifest": manifest,
        "generation": generation,
        "audioProvenance": audio_provenance,
        "trackedAudioAnalysis": tracked_audio,
        "paths": {
            "manifest": manifest_path,
            "generation": generation_path,
            "audioProvenance": audio_provenance_path,
            "trackedAudioAnalysis": tracked_audio_analysis_path,
            "atlasImage": resolved_assets[player["atlasImagePath"]],
            "atlasJson": resolved_assets[player["atlasJsonPath"]],
        },
    }


def prepare_output(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if resolved.exists():
        require(resolved.is_dir() and not resolved.is_symlink(), f"Output is not a regular directory: {resolved}")
        require(not any(resolved.iterdir()), f"Refusing non-empty Evidence output directory: {resolved}")
    else:
        resolved.mkdir(parents=True)
    return resolved


def copy_file(source: Path, destination: Path) -> None:
    require(source.is_file() and not source.is_symlink(), f"Cannot copy non-regular source: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, (188, 188, 188, 255))
    draw = ImageDraw.Draw(image)
    colors = ((188, 188, 188, 255), (228, 228, 228, 255))
    for top in range(0, height, square):
        for left in range(0, width, square):
            color = colors[((left // square) + (top // square)) % 2]
            draw.rectangle(
                (
                    left,
                    top,
                    min(width, left + square) - 1,
                    min(height, top + square) - 1,
                ),
                fill=color,
            )
    return image


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    position: tuple[int, int],
    value: str,
    *,
    fill: str = "#f8fafc",
    width: int = 46,
) -> None:
    draw.multiline_text(
        position,
        "\n".join(textwrap.wrap(value, width=width) or [""]),
        fill=fill,
        spacing=2,
    )


def make_contact_sheet(
    items: Sequence[ImageItem],
    output: Path,
    *,
    title: str,
    columns: int,
    cell_width: int = 360,
    image_height: int = 230,
) -> None:
    require(items, f"Cannot create empty contact sheet: {title}")
    rows = math.ceil(len(items) / columns)
    label_height = 52
    title_height = 38
    cell_height = image_height + label_height
    sheet = Image.new(
        "RGB",
        (columns * cell_width, title_height + rows * cell_height),
        "#0f172a",
    )
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 12), title, fill="#f8fafc")
    for index, item in enumerate(items):
        check_png(item.path)
        column = index % columns
        row = index // columns
        left = column * cell_width
        top = title_height + row * cell_height
        with Image.open(item.path) as source:
            converted = ImageOps.exif_transpose(source).convert("RGB")
            fitted = ImageOps.contain(
                converted,
                (cell_width - 12, image_height - 12),
                Image.Resampling.LANCZOS,
            )
        image_left = left + (cell_width - fitted.width) // 2
        image_top = top + (image_height - fitted.height) // 2
        sheet.paste(fitted, (image_left, image_top))
        draw.rectangle(
            (left, top, left + cell_width - 1, top + cell_height - 1),
            outline="#475569",
            width=1,
        )
        draw_wrapped(
            draw,
            (left + 6, top + image_height + 5),
            item.label,
            width=max(20, cell_width // 8),
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, format="PNG", optimize=False)


def make_atlas_contact(
    fixture: dict[str, Any],
    atlas_image_path: Path,
    atlas_json_path: Path,
    output: Path,
) -> dict[str, Any]:
    atlas_json = strict_json_load(atlas_json_path)
    frames = atlas_json.get("frames")
    require(isinstance(frames, dict) and frames, "Player atlas JSON contains no frames.")
    player = nested(fixture, "player")
    expected_size = (
        int(nested(player, "frameSize", "width")),
        int(nested(player, "frameSize", "height")),
    )
    pivot_x = float(nested(player, "footPivot", "pixelX"))
    pivot_y = float(nested(player, "footPivot", "pixelY"))
    ordered = sorted(
        frames.items(),
        key=lambda item: (
            int(nested(item[1], "frame", "y")),
            int(nested(item[1], "frame", "x")),
            item[0],
        ),
    )
    columns = 6
    rows = math.ceil(len(ordered) / columns)
    cell_width = 224
    cell_height = 328
    image_box = (176, 264)
    title_height = 42
    sheet = Image.new(
        "RGB",
        (columns * cell_width, title_height + rows * cell_height),
        "#111827",
    )
    draw = ImageDraw.Draw(sheet)
    draw.text(
        (12, 12),
        f"M1.5 player atlas: all {len(ordered)} frames on gray checker",
        fill="#f8fafc",
    )
    with Image.open(atlas_image_path) as atlas_source:
        atlas = atlas_source.convert("RGBA")
        for index, (name, frame_data) in enumerate(ordered):
            frame = nested(frame_data, "frame")
            rectangle = (
                int(frame["x"]),
                int(frame["y"]),
                int(frame["x"]) + int(frame["w"]),
                int(frame["y"]) + int(frame["h"]),
            )
            require(
                (int(frame["w"]), int(frame["h"])) == expected_size
                and frame_data.get("rotated") is False,
                f"Unexpected atlas frame contract: {name}",
            )
            require(
                rectangle[0] >= 0
                and rectangle[1] >= 0
                and rectangle[2] <= atlas.width
                and rectangle[3] <= atlas.height,
                f"Atlas frame is out of bounds: {name}",
            )
            crop = atlas.crop(rectangle)
            fitted = ImageOps.contain(
                crop,
                image_box,
                Image.Resampling.LANCZOS,
            )
            background = checkerboard(image_box)
            image_left = (image_box[0] - fitted.width) // 2
            image_top = (image_box[1] - fitted.height) // 2
            background.alpha_composite(fitted, (image_left, image_top))
            scale_x = fitted.width / expected_size[0]
            scale_y = fitted.height / expected_size[1]
            foot = (
                round(image_left + pivot_x * scale_x),
                round(image_top + pivot_y * scale_y),
            )
            background_draw = ImageDraw.Draw(background)
            background_draw.line(
                (0, foot[1], image_box[0] - 1, foot[1]),
                fill="#ef4444",
                width=1,
            )
            background_draw.ellipse(
                (foot[0] - 3, foot[1] - 3, foot[0] + 3, foot[1] + 3),
                fill="#ef4444",
            )
            column = index % columns
            row = index // columns
            left = column * cell_width
            top = title_height + row * cell_height
            paste_left = left + (cell_width - image_box[0]) // 2
            paste_top = top + 8
            sheet.paste(background.convert("RGB"), (paste_left, paste_top))
            draw.text((left + 8, top + image_box[1] + 18), name, fill="#f8fafc")
            draw.text(
                (left + 8, top + image_box[1] + 34),
                f"pivot=({pivot_x:g},{pivot_y:g})",
                fill="#cbd5e1",
            )
            draw.rectangle(
                (left, top, left + cell_width - 1, top + cell_height - 1),
                outline="#475569",
                width=1,
            )
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, format="PNG", optimize=False)
    return {
        "frameCount": len(ordered),
        "frameNames": [name for name, _ in ordered],
        "frameSize": {"width": expected_size[0], "height": expected_size[1]},
        "footPivot": nested(player, "footPivot"),
    }


def output_relative(path: Path, output: Path) -> str:
    return path.relative_to(output).as_posix()


def copy_run_evidence(
    run: Run,
    output: Path,
    *,
    baseline: bool,
) -> dict[str, Any]:
    role_root = output / "selected" / run.role / run.device_id
    selected: dict[str, Any] = {
        "ground": {},
        "phase": {},
        "panel": {},
        "debug": {},
        "sameCoordinate": {},
    }
    raw_root = output / "raw" / run.role / run.device_id
    copy_file(run.state_path, raw_root / "state.json")
    runtime_log = run.source / "runtime.log"
    if runtime_log.is_file() and not runtime_log.is_symlink():
        copy_file(runtime_log, raw_root / "runtime.log")
    completion = run.source / "completion.json"
    if completion.is_file() and not completion.is_symlink():
        copy_file(completion, raw_root / "completion.json")

    for area_id in AREA_IDS:
        selected["ground"][area_id] = {}
        for position in POSITIONS:
            measurement, source = (
                baseline_ground_entry(run, area_id, position)
                if baseline
                else candidate_ground_entry(run, area_id, position)
            )
            destination = role_root / "ground" / f"{area_id}-{position}.png"
            copy_file(source, destination)
            selected["ground"][area_id][position] = {
                "path": output_relative(destination, output),
                "groundY": measurement_ground_y(measurement, baseline=baseline),
                "actualPlayerX": measurement_actual_x(measurement, baseline=baseline),
                "sourceSha256": sha256(source),
            }

        selected["phase"][area_id] = {}
        for phase in PHASES:
            entry, source = phase_entry(run, area_id, phase, baseline=baseline)
            destination = role_root / "phase" / f"{area_id}-{phase}.png"
            copy_file(source, destination)
            selected["phase"][area_id][phase] = {
                "path": output_relative(destination, output),
                "coordinate": nested(entry, "coordinate"),
                "playerX": nested(entry, "coordinate", "actualWorldX"),
                "targetWorldX":
                    nested(entry, "coordinate", "targetWorldX"),
                "timeMinutes": nested(entry, "snapshot", "timeMinutes"),
                "sourceSha256": sha256(source),
            }

    for key, (entry, source) in panel_entries(run).items():
        direction, sample, facing = key
        destination = role_root / "panel" / f"{direction}-{sample}-{facing}.png"
        copy_file(source, destination)
        selected["panel"]["/".join(key)] = {
            "path": output_relative(destination, output),
            "sourceSha256": sha256(source),
            "actualPlayerWorldX": entry.get(
                "actualPlayerWorldX",
                entry.get("actualPlayerX"),
            ),
            "triggerSample": entry.get("triggerSample"),
            "geometry": entry.get("geometry"),
        }

    if baseline:
        same = nested(run.state, "evidence", "sameCoordinateComparisons")
        for direction in DIRECTIONS:
            entry = same[direction]
            source = safe_run_file(run, nested(entry, "screenshot"), png=True)
            destination = role_root / "same-coordinate" / f"{direction}.png"
            copy_file(source, destination)
            selected["sameCoordinate"][direction] = {
                "path": output_relative(destination, output),
                "requestedWorldX": entry.get("requestedWorldX"),
                "actualPlayerX": entry.get("actualBaselinePlayerX"),
                "sourceSha256": sha256(source),
            }
    else:
        debug = nested(run.state, "evidence", "debugGeometry")
        for area_id in AREA_IDS:
            source = safe_run_file(run, nested(debug, area_id, "screenshot"), png=True)
            destination = role_root / "debug" / f"{area_id}.png"
            copy_file(source, destination)
            selected["debug"][area_id] = {
                "path": output_relative(destination, output),
                "sourceSha256": sha256(source),
            }
    return selected


def path_from_selected(output: Path, entry: dict[str, Any]) -> Path:
    path = (output / entry["path"]).resolve()
    require(path.is_relative_to(output), f"Selected output path escaped bundle: {path}")
    return path


def panel_label(entry: dict[str, Any], role: str) -> str:
    geometry = nested(entry, "geometry")
    panel_rect = nested(geometry, "panelRect")
    return (
        f"{role} {entry['direction']}/{nested(entry, 'triggerSample', 'name')}/"
        f"{entry['facing']} gap={float(geometry['playerDistance']):.2f}px "
        f"overlap={float(geometry['playerIntersection']):.2f}px2 "
        f"touch={float(panel_rect['width']):.1f}x{float(panel_rect['height']):.1f}"
    )


def build_contacts(
    output: Path,
    baseline_runs: dict[tuple[int, int, float, bool], Run],
    local_runs: dict[tuple[int, int, float, bool], Run],
    preview_runs: dict[tuple[int, int, float, bool], Run],
    selected: dict[str, dict[str, dict[str, Any]]],
    audio: dict[str, Any],
    tracked: dict[str, Any],
    candidate_fixture: dict[str, Any],
) -> tuple[list[str], dict[str, Any]]:
    contacts: list[str] = []
    pairings: dict[str, Any] = {}
    for key, device_id in EXPECTED_VIEWPORTS.items():
        baseline = baseline_runs[key]
        local = local_runs[key]
        preview = preview_runs[key]
        device_contacts = output / "contacts" / device_id

        ground_items: list[ImageItem] = []
        ground_pairs = []
        for area_id in AREA_IDS:
            for position in POSITIONS:
                before_measurement, _ = baseline_ground_entry(
                    baseline,
                    area_id,
                    position,
                )
                after_measurement, _ = candidate_ground_entry(
                    local,
                    area_id,
                    position,
                )
                before = selected["baseline"][device_id]["ground"][area_id][position]
                after = selected["candidate-local"][device_id]["ground"][area_id][position]
                ground_items.extend(
                    [
                        ImageItem(
                            (
                                f"BEFORE {area_id}/{position} "
                                f"groundY={measurement_ground_y(before_measurement, baseline=True):g} "
                                f"footDelta={float(nested(before_measurement, 'playerGeometry', 'signedFootGroundCssDelta')):.2f}px"
                            ),
                            path_from_selected(output, before),
                        ),
                        ImageItem(
                            (
                                f"AFTER {area_id}/{position} "
                                f"groundY={measurement_ground_y(after_measurement, baseline=False):g} "
                                f"footDelta={float(after_measurement['cssDelta']):.2f}px"
                            ),
                            path_from_selected(output, after),
                        ),
                    ],
                )
                ground_pairs.append(
                    {
                        "areaId": area_id,
                        "position": position,
                        "baseline": before,
                        "candidateLocal": after,
                    },
                )
        ground_contact = device_contacts / "ground-before-after.png"
        make_contact_sheet(
            ground_items,
            ground_contact,
            title=f"{device_id}: fixture-coordinate ground before / after",
            columns=2,
        )
        contacts.append(output_relative(ground_contact, output))

        phase_items: list[ImageItem] = []
        phase_pairs = []
        for area_id in AREA_IDS:
            for phase in PHASES:
                before = selected["baseline"][device_id]["phase"][area_id][phase]
                after = selected["candidate-local"][device_id]["phase"][area_id][phase]
                phase_items.extend(
                    [
                        ImageItem(
                            f"BEFORE {area_id}/{phase} "
                            f"target={before['targetWorldX']} "
                            f"actual={before['playerX']}",
                            path_from_selected(output, before),
                        ),
                        ImageItem(
                            f"AFTER {area_id}/{phase} "
                            f"target={after['targetWorldX']} "
                            f"actual={after['playerX']}",
                            path_from_selected(output, after),
                        ),
                    ],
                )
                phase_pairs.append(
                    {
                        "areaId": area_id,
                        "phase": phase,
                        "baseline": before,
                        "candidateLocal": after,
                    },
                )
        phase_contact = device_contacts / "phase-before-after.png"
        make_contact_sheet(
            phase_items,
            phase_contact,
            title=f"{device_id}: 3 areas x 4 phases before / after",
            columns=2,
        )
        contacts.append(output_relative(phase_contact, output))

        same_items: list[ImageItem] = []
        same_pairs = []
        local_panel = panel_entries(local)
        for direction in DIRECTIONS:
            before = selected["baseline"][device_id]["sameCoordinate"][direction]
            same_items.append(
                ImageItem(
                    f"BEFORE {direction} x={before['requestedWorldX']}",
                    path_from_selected(output, before),
                ),
            )
            candidate_entries = []
            for facing in FACINGS:
                entry, _ = local_panel[(direction, "center", facing)]
                after = selected["candidate-local"][device_id]["panel"][
                    f"{direction}/center/{facing}"
                ]
                same_items.append(
                    ImageItem(
                        f"AFTER {direction}/center/{facing} x={entry['actualPlayerWorldX']}",
                        path_from_selected(output, after),
                    ),
                )
                candidate_entries.append(after)
            same_pairs.append(
                {
                    "direction": direction,
                    "baseline": before,
                    "candidateLocal": candidate_entries,
                },
            )
        same_contact = device_contacts / "same-coordinate-up-down.png"
        make_contact_sheet(
            same_items,
            same_contact,
            title=f"{device_id}: candidate entrance center on baseline and candidate",
            columns=3,
        )
        contacts.append(output_relative(same_contact, output))

        panel_items: list[ImageItem] = []
        for role, run in (("LOCAL", local), ("PREVIEW", preview)):
            run_panels = panel_entries(run)
            for direction in DIRECTIONS:
                for sample in PANEL_SAMPLES:
                    for facing in FACINGS:
                        entry, _ = run_panels[(direction, sample, facing)]
                        selected_entry = selected[
                            "candidate-local" if role == "LOCAL" else "preview"
                        ][device_id]["panel"][f"{direction}/{sample}/{facing}"]
                        panel_items.append(
                            ImageItem(
                                panel_label(entry, role),
                                path_from_selected(output, selected_entry),
                            ),
                        )
        panel_contact = device_contacts / "panel-matrix-local-preview.png"
        make_contact_sheet(
            panel_items,
            panel_contact,
            title=f"{device_id}: 12-state panel matrix (local + Preview)",
            columns=4,
        )
        contacts.append(output_relative(panel_contact, output))

        debug_items: list[ImageItem] = []
        for role in ("candidate-local", "preview"):
            for area_id in AREA_IDS:
                entry = selected[role][device_id]["debug"][area_id]
                debug_items.append(
                    ImageItem(
                        f"{role} {area_id}: ground/spawn/entrance/trigger/player/pivot",
                        path_from_selected(output, entry),
                    ),
                )
        debug_contact = device_contacts / "debug-geometry-local-preview.png"
        make_contact_sheet(
            debug_items,
            debug_contact,
            title=f"{device_id}: fixture-backed geometry debug",
            columns=3,
        )
        contacts.append(output_relative(debug_contact, output))

        matrix_items: list[ImageItem] = []
        for role in ("baseline", "candidate-local", "preview"):
            for area_id in AREA_IDS:
                for phase in PHASES:
                    entry = selected[role][device_id]["phase"][area_id][phase]
                    matrix_items.append(
                        ImageItem(
                            f"{role} {area_id}/{phase} "
                            f"target={entry['targetWorldX']} "
                            f"actual={entry['playerX']}",
                            path_from_selected(output, entry),
                        ),
                    )
        matrix_contact = device_contacts / "phase-matrix-baseline-local-preview.png"
        make_contact_sheet(
            matrix_items,
            matrix_contact,
            title=f"{device_id}: baseline / local / Preview 3-area x 4-phase matrix",
            columns=4,
        )
        contacts.append(output_relative(matrix_contact, output))
        pairings[device_id] = {
            "groundBeforeAfter": ground_pairs,
            "phaseBeforeAfter": phase_pairs,
            "sameCoordinate": same_pairs,
        }

    atlas_contact = output / "contacts" / "player-atlas-gray-checker.png"
    atlas_metrics = make_atlas_contact(
        candidate_fixture,
        tracked["paths"]["atlasImage"],
        tracked["paths"]["atlasJson"],
        atlas_contact,
    )
    contacts.append(output_relative(atlas_contact, output))

    audio_items = [
        ImageItem(
            "waveform: decoded 48 kHz stereo PCM",
            audio["path"] / "waveform.png",
        ),
        ImageItem(
            "spectrogram: tonal and harmonic content",
            audio["path"] / "spectrogram.png",
        ),
        ImageItem(
            "loop boundary: tail -> head continuity",
            audio["path"] / "loop-boundary.png",
        ),
    ]
    audio_contact = output / "contacts" / "audio-waveform-spectrogram-loop.png"
    make_contact_sheet(
        audio_items,
        audio_contact,
        title="M1.5 BGM objective Evidence",
        columns=1,
        cell_width=900,
        image_height=360,
    )
    contacts.append(output_relative(audio_contact, output))
    return contacts, {"pairings": pairings, "atlas": atlas_metrics}


def run_metrics(run: Run) -> dict[str, Any]:
    state = run.state
    runtime = state.get("runtime", {})
    lifecycle = state.get("evidence", {}).get("lifecycle", {})
    hidden_visible = lifecycle.get("hiddenVisible", {})
    log_path = run.source / "runtime.log"
    trace_path = run.source / "trace.zip"
    completion_path = run.source / "completion.json"
    return {
        "role": run.role,
        "deviceId": run.device_id,
        "sourceRunDirectory": str(run.source),
        "declaredArtifactDirectory": state.get("outputDir", state.get("outputDirectory")),
        "stateSha256": sha256(run.state_path),
        "baseUrl": state.get("baseUrl"),
        "expectedCommit": state.get("expectedCommit"),
        "observedCommit": state.get("observedCommit"),
        "buildCommitDisplay": state.get("buildCommitDisplay"),
        "viewport": state.get("viewport"),
        "deviceScaleFactor": state.get("deviceScaleFactor"),
        "touchEnabled": state.get("touchEnabled"),
        "browserHeadless": state.get("browserHeadless"),
        "traceEnabled": state.get("traceEnabled"),
        "hostEnvironment": state.get("hostEnvironment"),
        "fontEnvironment": state.get("fontEnvironment"),
        "nodeVersion": runtime.get("nodeVersion"),
        "browserVersion": runtime.get("browserVersion"),
        "browserExecutablePath": runtime.get("browserExecutablePath"),
        "pageErrors": state.get("pageErrors"),
        "failedRequests": state.get("failedRequests"),
        "spawnMeasurements": (
            state.get("evidence", {}).get("spawnMeasurements", [])
            if run.role == "baseline"
            else state.get("evidence", {}).get("spawns", [])
        ),
        "lifecycle": {
            "visibilityMethod": hidden_visible.get("method"),
            "x11TabControl": hidden_visible.get("x11TabControl"),
            "visibilityOffsets": {
                name: hidden_visible.get(name, {}).get("offset")
                for name in ("beforeHidden", "hidden", "visible")
            },
            "visibleSettledOffset": (
                hidden_visible.get("visibleSettledState", {})
                .get("candidate", {})
                .get("audio", {})
                .get("offset")
            ),
            "visibleRecoveryDelta": hidden_visible.get(
                "visibleRecoveryDelta",
            ),
            "frozenActiveMethod": lifecycle.get("frozenActive", {}).get("method"),
        },
        "runtimeLog": (
            {"path": str(log_path), **file_record(log_path)}
            if log_path.is_file() and not log_path.is_symlink()
            else None
        ),
        "completion": (
            {"path": str(completion_path), **file_record(completion_path)}
            if completion_path.is_file() and not completion_path.is_symlink()
            else None
        ),
        "trace": (
            {"path": str(trace_path), **file_record(trace_path)}
            if trace_path.is_file() and not trace_path.is_symlink()
            else None
        ),
    }


def aggregate_candidate_metrics(runs: Iterable[Run]) -> dict[str, Any]:
    ground_deltas: list[float] = []
    spawn_deltas: list[float] = []
    panel_distances: list[float] = []
    panel_intersections: list[float] = []
    panel_widths: list[float] = []
    panel_heights: list[float] = []
    obstacle_intersections: list[float] = []
    entrance_deltas: list[dict[str, Any]] = []
    spawn_bindings: list[dict[str, Any]] = []
    for run in runs:
        evidence = nested(run.state, "evidence")
        for spawn in nested(evidence, "spawns"):
            spawn_deltas.append(float(spawn["cssDelta"]))
            spawn_bindings.append(
                {
                    "deviceId": run.device_id,
                    "role": run.role,
                    "areaId": spawn["areaId"],
                    "position": spawn["position"],
                    "spawnId": spawn["spawnId"],
                    "fixtureSpawn": spawn["fixtureSpawn"],
                    "actualPlayerX": nested(
                        spawn,
                        "snapshot",
                        "playerX",
                    ),
                    "actualPlayerY": nested(
                        spawn,
                        "snapshot",
                        "playerY",
                    ),
                    "actualFacing": nested(
                        spawn,
                        "snapshot",
                        "facing",
                    ),
                },
            )
        for area_id in AREA_IDS:
            for position in POSITIONS:
                measurement = nested(evidence, "areaPositions", area_id, position)
                ground_deltas.append(float(measurement["cssDelta"]))
            for direction, entrance in nested(
                run.state,
                "geometryFixture",
                "areas",
                area_id,
                "branchEntrances",
            ).items():
                entrance_deltas.append(
                    {
                        "deviceId": run.device_id,
                        "role": run.role,
                        "areaId": area_id,
                        "direction": direction,
                        "backgroundCenterX": entrance["backgroundCenterX"],
                        "triggerCenterX": entrance["triggerCenterX"],
                        "centerDeltaX": entrance["centerDeltaX"],
                    },
                )
        for entry, _ in panel_entries(run).values():
            ground_deltas.append(float(nested(entry, "groundCss", "cssDelta")))
            geometry = nested(entry, "geometry")
            rect = nested(geometry, "panelRect")
            panel_distances.append(float(geometry["playerDistance"]))
            panel_intersections.append(float(geometry["playerIntersection"]))
            panel_widths.append(float(rect["width"]))
            panel_heights.append(float(rect["height"]))
            obstacle_intersections.extend(
                float(metric["intersectionArea"])
                for metric in geometry["obstacleMetrics"]
            )
    return {
        "runCount": len(list(runs)) if isinstance(runs, Sequence) else None,
        "ground": {
            "measurementCount": len(ground_deltas) + len(spawn_deltas),
            "normalCount": len(ground_deltas),
            "spawnCount": len(spawn_deltas),
            "maxNormalCssDelta": max(ground_deltas),
            "maxSpawnCssDelta": max(spawn_deltas),
        },
        "panel": {
            "stateCount": len(panel_distances),
            "minimumPlayerDistanceCssPx": min(panel_distances),
            "maximumPlayerIntersectionCssPx2": max(panel_intersections),
            "minimumWidthCssPx": min(panel_widths),
            "minimumHeightCssPx": min(panel_heights),
            "maximumObstacleIntersectionCssPx2": max(obstacle_intersections),
        },
        "entranceTrigger": entrance_deltas,
        "spawnBindings": spawn_bindings,
    }


def shell_command(arguments: Sequence[str]) -> str:
    return " ".join(shlex.quote(argument) for argument in arguments)


def build_readme(
    metrics: dict[str, Any],
    command: Sequence[str],
    tracked: dict[str, Any],
) -> str:
    run_rows = []
    for run in metrics["runs"]:
        viewport = run["viewport"]
        run_rows.append(
            "| {role} | {device} | {width}x{height} | {dpr} | {touch} | "
            "{headed} | `{node}` | `{browser}` |".format(
                role=run["role"],
                device=run["deviceId"],
                width=viewport["width"],
                height=viewport["height"],
                dpr=run["deviceScaleFactor"],
                touch=str(run["touchEnabled"]).lower(),
                headed=(
                    "n/a"
                    if run["browserHeadless"] is None
                    else str(not run["browserHeadless"]).lower()
                ),
                node=run["nodeVersion"],
                browser=run["browserVersion"],
            ),
        )
    lifecycle_constraints = sorted(
        {
            nested(run.state, "evidence", "lifecycle", "frozenActive", "headlessConstraint")
            for run in metrics["_candidateRunObjects"]
        },
    )
    image_rights = tracked["manifest"]["rights"]
    image_generation_rights = tracked["generation"]["rights"]
    audio_rights = tracked["audioProvenance"]["license"]
    render_environment = metrics["renderEnvironmentContract"]
    visible_metrics = {key: value for key, value in metrics.items() if not key.startswith("_")}
    return "\n".join(
        [
            "# M1.5 Evidence bundle",
            "",
            f"Generated: `{visible_metrics['generatedAtUtc']}`",
            "",
            "Assembly status: **PASS**. This means the supplied captures passed "
            "the machine-verifiable Evidence admission checks. It is not a "
            "substitute for human visual/audio review or real-iPhone approval.",
            "",
            f"- Baseline SHA: `{visible_metrics['baselineSha']}`",
            f"- Candidate SHA: `{visible_metrics['candidateSha']}`",
            f"- Preview: [{visible_metrics['previewUrl']}]({visible_metrics['previewUrl']})",
            f"- Render OS: `{render_environment['hostEnvironment']['runnerOsImage']}` "
            f"({render_environment['hostEnvironment']['platform']}/"
            f"{render_environment['hostEnvironment']['architecture']})",
            f"- Japanese font: `{render_environment['fontEnvironment']['japaneseFontMatch']}` "
            f"from package `{render_environment['fontEnvironment']['japaneseFontPackageVersion']}`",
            f"- Japanese font SHA-256: "
            f"`{render_environment['fontEnvironment']['japaneseFontSha256']}`",
            "",
            "## Capture matrix",
            "",
            "| Role | Device | Viewport | DPR | Touch | Headed | Node | Browser |",
            "| --- | --- | --- | ---: | --- | --- | --- | --- |",
            *run_rows,
            "",
            "Each direct run `state.json` was accepted only when its exact SHA, "
            "viewport/DPR/touch tuple, completion/PASS contract, zero page errors, "
            "zero failed requests, and required capture coverage were valid.",
            "",
            "## Contacts",
            "",
            *[f"- `{path}`" for path in visible_metrics["contacts"]],
            "",
            "The before/after ground and phase contacts use semantic names from "
            "the run states. Ground, spawn, entrance, and trigger expectations "
            "come from the embedded independently measured fixtures; this "
            "assembler does not restate their coordinate values.",
            "",
            "## Rights and provenance",
            "",
            f"- Image asset manifest: {image_rights}",
            f"- Image generation record: {image_generation_rights}",
            f"- Audio: {audio_rights}",
            f"- Audio runtime SHA-256: `{visible_metrics['audio']['runtimeSha256']}`",
            f"- Player atlas SHA-256: "
            f"`{visible_metrics['playerVisibleFoot']['atlas']['sha256']}`",
            f"- Visible-foot frames: "
            f"`{visible_metrics['playerVisibleFoot']['frameCount']}`; "
            f"max pivot-row delta "
            f"`{visible_metrics['playerVisibleFoot']['summary']['maxAbsoluteRowDeltaCssPx']} CSS px`; "
            f"max visible-edge delta "
            f"`{visible_metrics['playerVisibleFoot']['summary']['maxAbsoluteVisibleBottomEdgeDeltaCssPx']} CSS px`",
            "",
            "The exact provenance JSON, source states, selected PNGs, fixture "
            "snapshots, objective audio analysis, and SHA-256 manifest are "
            "included under `raw/`, `selected/`, and at bundle root.",
            "",
            "## Native lifecycle capture",
            "",
            "Each candidate run discovers exactly one root X11 client matching "
            "the CDP browser PID and Google Chrome `WM_CLASS`, activates that "
            "validated client once with `xdotool --sync`, and then proves a "
            "real Chrome tab switch with one unchanged active X11 window/PID. "
            "It also proves distinct CDP tab targets in the same browser "
            "window, `1 -> 2 -> 1` page cleanup, mutually inverted candidate/"
            "witness visibility, and resumed audio gain and offset.",
            "",
            *[f"- {constraint}" for constraint in lifecycle_constraints],
            "",
            "The browser states separately retain the successful CDP "
            "`frozen -> active` commands, source identity, mute state, offset "
            "advance, observed CDP lifecycle events, and whether headless "
            "Chromium emitted DOM `freeze`/`resume` events.",
            "",
            "## Reproduction",
            "",
            "Assembler command:",
            "",
            "```sh",
            shell_command(command),
            "```",
            "",
            "Capture commands are reconstructed from each state in "
            "`metrics.json` (`baseUrl`, exact commit, viewport, DPR, touch, "
            "Node/browser version, original artifact path). Exact runtime logs "
            "are copied beside each raw state. The audio Evidence `analysis.json` "
            "retains its executed and normalized generation commands.",
            "",
            "## Integrity",
            "",
            "`sha256-manifest.json` covers every other file in this bundle and "
            "records source-input hashes. It omits only its own recursive hash.",
            "",
        ],
    )


def parse_arguments(arguments: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate three baseline, three local-candidate, three Preview "
            "Browser Smoke runs plus fresh audio Evidence and assemble a "
            "deterministic M1.5 Evidence bundle."
        ),
    )
    parser.add_argument("--baseline-run", action="append", default=[], metavar="DIR")
    parser.add_argument("--baseline-runs", nargs=3, metavar=("DIR1", "DIR2", "DIR3"))
    parser.add_argument("--candidate-local-run", action="append", default=[], metavar="DIR")
    parser.add_argument(
        "--candidate-local-runs",
        nargs=3,
        metavar=("DIR1", "DIR2", "DIR3"),
    )
    parser.add_argument("--preview-run", action="append", default=[], metavar="DIR")
    parser.add_argument("--preview-runs", nargs=3, metavar=("DIR1", "DIR2", "DIR3"))
    parser.add_argument("--audio-evidence-dir", "--audio-dir", required=True, type=Path)
    parser.add_argument("--player-foot-evidence-file", required=True, type=Path)
    parser.add_argument("--baseline-sha", required=True)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--preview-url", required=True)
    parser.add_argument("--output-dir", "--output", required=True, type=Path)
    return parser.parse_args(arguments)


def combine_run_arguments(
    repeated: Sequence[str],
    grouped: Sequence[str] | None,
    name: str,
) -> list[Path]:
    require(
        not (repeated and grouped),
        f"Use either --{name}-run repeated three times or --{name}-runs once, not both.",
    )
    values = list(grouped or repeated)
    require(len(values) == 3, f"{name} requires exactly three run directories.")
    return [Path(value) for value in values]


def main(arguments: Sequence[str] | None = None) -> None:
    args = parse_arguments(arguments)
    baseline_sha = require_sha(args.baseline_sha, "--baseline-sha")
    candidate_sha = require_sha(args.candidate_sha, "--candidate-sha")
    require(
        baseline_sha == EXACT_BASELINE_SHA,
        f"--baseline-sha must be the immutable M1.5 baseline {EXACT_BASELINE_SHA}.",
    )
    require(candidate_sha != baseline_sha, "Candidate SHA must differ from baseline SHA.")
    preview_url = canonical_url(args.preview_url, "--preview-url", require_https=True)
    baseline_sources = combine_run_arguments(
        args.baseline_run,
        args.baseline_runs,
        "baseline",
    )
    local_sources = combine_run_arguments(
        args.candidate_local_run,
        args.candidate_local_runs,
        "candidate-local",
    )
    preview_sources = combine_run_arguments(
        args.preview_run,
        args.preview_runs,
        "preview",
    )
    all_sources = [
        source.expanduser().resolve()
        for source in (*baseline_sources, *local_sources, *preview_sources)
    ]
    require(len(set(all_sources)) == 9, "All nine Browser Smoke run directories must be distinct.")

    baseline_runs = validate_run_group(
        "baseline",
        baseline_sources,
        baseline_sha,
        baseline=True,
    )
    local_runs = validate_run_group(
        "candidate-local",
        local_sources,
        candidate_sha,
        baseline=False,
    )
    preview_runs = validate_run_group(
        "preview",
        preview_sources,
        candidate_sha,
        baseline=False,
    )
    formal_runs = [
        *baseline_runs.values(),
        *local_runs.values(),
        *preview_runs.values(),
    ]
    environment_contract = validate_render_environment_parity(formal_runs)
    for run in baseline_runs.values():
        require(is_loopback_url(canonical_url(run.state["baseUrl"], "baseline baseUrl")), f"{run.role}/{run.device_id}: baseline was not captured locally.")
    for run in local_runs.values():
        require(is_loopback_url(canonical_url(run.state["baseUrl"], "candidate local baseUrl")), f"{run.role}/{run.device_id}: local candidate was not captured locally.")
    for run in preview_runs.values():
        require(
            canonical_url(run.state["baseUrl"], "Preview state baseUrl", require_https=True)
            == preview_url,
            f"{run.role}/{run.device_id}: Preview URL mismatch.",
        )

    candidate_fixture = nested(next(iter(local_runs.values())).state, "geometryFixture")
    for run in (*local_runs.values(), *preview_runs.values()):
        require(
            nested(run.state, "geometryFixture") == candidate_fixture,
            f"{run.role}/{run.device_id}: candidate geometry fixture differs across runs.",
        )
    baseline_fixture = nested(
        next(iter(baseline_runs.values())).state,
        "independentVisualFixture",
    )
    for run in baseline_runs.values():
        require(
            nested(run.state, "independentVisualFixture") == baseline_fixture,
            f"{run.role}/{run.device_id}: baseline geometry fixture differs across runs.",
        )
    assert_phase_and_ground_pairing(
        baseline_runs,
        local_runs,
        preview_runs,
    )

    audio = validate_audio_directory(args.audio_evidence_dir, candidate_sha)
    tracked = validate_tracked_assets(candidate_fixture, candidate_sha)
    player_foot = validate_player_foot_evidence(
        args.player_foot_evidence_file,
        candidate_fixture,
        candidate_sha,
    )

    # All input validation is complete before the first output byte is written.
    output = prepare_output(args.output_dir)
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()

    selected: dict[str, dict[str, dict[str, Any]]] = {
        "baseline": {},
        "candidate-local": {},
        "preview": {},
    }
    for key, device_id in EXPECTED_VIEWPORTS.items():
        selected["baseline"][device_id] = copy_run_evidence(
            baseline_runs[key],
            output,
            baseline=True,
        )
        selected["candidate-local"][device_id] = copy_run_evidence(
            local_runs[key],
            output,
            baseline=False,
        )
        selected["preview"][device_id] = copy_run_evidence(
            preview_runs[key],
            output,
            baseline=False,
        )

    raw_geometry = output / "raw" / "geometry"
    write_json(raw_geometry / "baseline-fixture.json", baseline_fixture)
    write_json(raw_geometry / "candidate-fixture.json", candidate_fixture)
    raw_provenance = output / "raw" / "provenance"
    provenance_destinations = {
        "image-asset-manifest.json": tracked["paths"]["manifest"],
        "image-generation.json": tracked["paths"]["generation"],
        "audio-provenance.json": tracked["paths"]["audioProvenance"],
        "tracked-audio-analysis.json": tracked["paths"]["trackedAudioAnalysis"],
    }
    for destination_name, source in provenance_destinations.items():
        copy_file(source, raw_provenance / destination_name)
    copy_file(
        tracked["paths"]["atlasJson"],
        output / "raw" / "assets" / "player-atlas.json",
    )
    copy_file(
        tracked["paths"]["atlasImage"],
        output / "selected" / "assets" / "player-atlas.webp",
    )
    copy_file(
        player_foot["path"],
        output / "raw" / "assets" / "player-foot-alpha.json",
    )
    for filename in sorted(REQUIRED_AUDIO_FILES):
        destination_root = (
            output / "selected" / "audio"
            if filename.endswith(".png")
            else output / "raw" / "audio"
        )
        copy_file(audio["path"] / filename, destination_root / filename)

    contacts, contact_metrics = build_contacts(
        output,
        baseline_runs,
        local_runs,
        preview_runs,
        selected,
        audio,
        tracked,
        candidate_fixture,
    )
    ordered_runs = [
        run
        for role_runs in (baseline_runs, local_runs, preview_runs)
        for key, run in sorted(
            role_runs.items(),
            key=lambda item: list(EXPECTED_VIEWPORTS).index(item[0]),
        )
    ]
    source_inputs = {
        f"{run.role}/{run.device_id}/state.json": {
            "path": str(run.state_path),
            **file_record(run.state_path),
        }
        for run in ordered_runs
    }
    for filename in sorted(REQUIRED_AUDIO_FILES):
        source_inputs[f"audio/{filename}"] = {
            "path": str(audio["path"] / filename),
            **file_record(audio["path"] / filename),
        }
    for destination_name, source in provenance_destinations.items():
        source_inputs[f"provenance/{destination_name}"] = {
            "path": str(source),
            **file_record(source),
        }
    source_inputs["assets/player-atlas.json"] = {
        "path": str(tracked["paths"]["atlasJson"]),
        **file_record(tracked["paths"]["atlasJson"]),
    }
    source_inputs["assets/player-atlas.webp"] = {
        "path": str(tracked["paths"]["atlasImage"]),
        **file_record(tracked["paths"]["atlasImage"]),
    }
    source_inputs["assets/player-foot-alpha.json"] = {
        "path": str(player_foot["path"]),
        **file_record(player_foot["path"]),
    }

    metrics: dict[str, Any] = {
        "schemaVersion": 1,
        "status": "PASS",
        "generatedAtUtc": generated_at,
        "baselineSha": baseline_sha,
        "candidateSha": candidate_sha,
        "previewUrl": preview_url,
        "renderEnvironmentContract": environment_contract,
        "viewportContract": [
            {
                "deviceId": device_id,
                "viewport": {"width": key[0], "height": key[1]},
                "deviceScaleFactor": key[2],
                "touchEnabled": key[3],
            }
            for key, device_id in EXPECTED_VIEWPORTS.items()
        ],
        "runs": [run_metrics(run) for run in ordered_runs],
        "candidateLocalMetrics": aggregate_candidate_metrics(
            list(local_runs.values()),
        ),
        "previewMetrics": aggregate_candidate_metrics(
            list(preview_runs.values()),
        ),
        "baseline": {
            "captureStatus": "complete",
            "candidatePass": False,
            "defectObservations": {
                run.device_id: nested(run.state, "qualityAssessment", "defects")
                for run in baseline_runs.values()
            },
        },
        "audio": {
            "runtimePath": nested(audio["analysis"], "runtimeAudio", "path"),
            "runtimeSha256": nested(audio["analysis"], "runtimeAudio", "sha256"),
            "format": nested(audio["analysis"], "independentValidation", "format"),
            "signal": nested(audio["analysis"], "independentValidation", "signal"),
            "loop": nested(audio["analysis"], "independentValidation", "loop"),
            "measurementPositions": audio["analysis"]["measurementPositions"],
            "toolchain": audio["analysis"]["toolchain"],
        },
        "playerVisibleFoot": player_foot["report"],
        "rights": {
            "images": tracked["manifest"]["rights"],
            "imageGeneration": tracked["generation"]["rights"],
            "audio": tracked["audioProvenance"]["license"],
        },
        "toolchain": {
            "assemblerPython": platform.python_version(),
            "pillow": pillow_version,
        },
        "contacts": sorted(contacts),
        "selected": selected,
        **contact_metrics,
        "sourceInputs": source_inputs,
        "_candidateRunObjects": [
            *local_runs.values(),
            *preview_runs.values(),
        ],
    }
    readme_metrics = metrics.copy()
    readme = build_readme(readme_metrics, [sys.executable, str(Path(__file__)), *(arguments or sys.argv[1:])], tracked)
    metrics.pop("_candidateRunObjects")
    write_json(output / "metrics.json", metrics)
    (output / "README.md").write_text(readme, encoding="utf-8")

    output_files = sorted(
        path
        for path in output.rglob("*")
        if path.is_file() and path != output / "sha256-manifest.json"
    )
    manifest = {
        "schemaVersion": 1,
        "baselineSha": baseline_sha,
        "candidateSha": candidate_sha,
        "generatedAtUtc": generated_at,
        "files": {
            output_relative(path, output): file_record(path)
            for path in output_files
        },
        "sourceInputs": source_inputs,
        "manifestSelfHash": None,
        "manifestSelfHashReason": (
            "The manifest cannot contain its own SHA-256 without recursion."
        ),
    }
    write_json(output / "sha256-manifest.json", manifest)
    print(
        json.dumps(
            {
                "status": "PASS",
                "outputDirectory": str(output),
                "baselineSha": baseline_sha,
                "candidateSha": candidate_sha,
                "previewUrl": preview_url,
                "contactSheets": len(contacts),
                "manifestedFiles": len(output_files),
            },
            ensure_ascii=False,
            sort_keys=True,
        ),
    )


if __name__ == "__main__":
    try:
        main()
    except EvidenceError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(2) from error
    except (
        AttributeError,
        KeyError,
        OverflowError,
        TypeError,
        ValueError,
    ) as error:
        print(f"ERROR: malformed Evidence input: {error}", file=sys.stderr)
        raise SystemExit(2) from error
