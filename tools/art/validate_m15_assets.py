#!/usr/bin/env python3
"""Validate the generated M1.5-only visual asset and visible-foot contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Sequence

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/images/m15"
MANIFEST_PATH = OUTPUT / "asset-manifest.json"
SIDECAR_PATH = OUTPUT / "asset-manifest.sha256"
HASHED_NAME = re.compile(r".+-[0-9a-f]{12}(?:-[a-z]+)?\.(?:webp|json)$")
COMMIT_SHA = re.compile(r"^[0-9a-f]{40}$")
ALPHA_THRESHOLD_EXCLUSIVE = 10
VISIBLE_FOOT_TOLERANCE_CSS_PX = 2
EXPECTED_FRAME_COUNT = 24


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_output(*arguments: str) -> str:
    return subprocess.run(
        ["git", "-C", str(ROOT), *arguments],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def load_manifest() -> dict[str, Any]:
    value = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError("M1.5 asset manifest must contain an object.")
    return value


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def validate_hash_record(
    path: Path,
    record: dict[str, Any],
    label: str,
    failures: list[str],
) -> None:
    require(path.is_file(), f"missing {label}: {path}", failures)
    if not path.is_file():
        return
    require(
        path.stat().st_size == record.get("bytes"),
        f"size mismatch: {label}",
        failures,
    )
    require(
        sha256(path) == record.get("sha256"),
        f"SHA-256 mismatch: {label}",
        failures,
    )


def frame_foot_metrics(
    frame_alpha: np.ndarray,
    *,
    frame_name: str,
    pivot_pixel_y: float,
    runtime_scale: float,
    alpha_threshold_exclusive: int = ALPHA_THRESHOLD_EXCLUSIVE,
) -> dict[str, Any]:
    opaque_y, _ = np.where(frame_alpha > alpha_threshold_exclusive)
    max_alpha_y = int(opaque_y.max()) if opaque_y.size else None
    bottom_exclusive = max_alpha_y + 1 if max_alpha_y is not None else None
    row_delta = (
        float(max_alpha_y) - pivot_pixel_y
        if max_alpha_y is not None
        else None
    )
    visible_bottom_edge_delta = (
        float(bottom_exclusive) - pivot_pixel_y
        if bottom_exclusive is not None
        else None
    )
    return {
        "name": frame_name,
        "visiblePixelCount": int(opaque_y.size),
        "maxAlphaY": max_alpha_y,
        "bottomExclusive": bottom_exclusive,
        "pivotPixelY": pivot_pixel_y,
        "rowDeltaPx": row_delta,
        "visibleBottomEdgeDeltaPx": visible_bottom_edge_delta,
        "rowDeltaCssPx": (
            row_delta * runtime_scale if row_delta is not None else None
        ),
        "visibleBottomEdgeDeltaCssPx": (
            visible_bottom_edge_delta * runtime_scale
            if visible_bottom_edge_delta is not None
            else None
        ),
    }


def validate_frame_foot_metrics(
    metrics: dict[str, Any],
    failures: list[str],
) -> None:
    name = metrics["name"]
    require(
        metrics["visiblePixelCount"] > 12_000,
        f"{name} has insufficient opaque coverage",
        failures,
    )
    require(
        metrics["maxAlphaY"] is not None,
        f"{name} has no alpha>{ALPHA_THRESHOLD_EXCLUSIVE} pixels",
        failures,
    )
    if metrics["maxAlphaY"] is None:
        return
    require(
        math.isclose(metrics["rowDeltaPx"], 0, abs_tol=0),
        f"{name} visible foot row does not equal the measured pivot row",
        failures,
    )
    require(
        abs(metrics["rowDeltaCssPx"]) <= VISIBLE_FOOT_TOLERANCE_CSS_PX,
        f"{name} visible foot/pivot CSS delta exceeds "
        f"{VISIBLE_FOOT_TOLERANCE_CSS_PX}",
        failures,
    )
    require(
        abs(metrics["visibleBottomEdgeDeltaCssPx"])
        <= VISIBLE_FOOT_TOLERANCE_CSS_PX,
        f"{name} visible bottom-edge/pivot CSS delta exceeds "
        f"{VISIBLE_FOOT_TOLERANCE_CSS_PX}",
        failures,
    )


def validate(
    *,
    expected_commit: str | None = None,
) -> tuple[list[str], dict[str, Any]]:
    failures: list[str] = []
    try:
        candidate_sha = git_output("rev-parse", "HEAD")
        git_status_short = [
            line
            for line in git_output("status", "--short").splitlines()
            if line
        ]
    except (OSError, subprocess.CalledProcessError) as error:
        candidate_sha = ""
        git_status_short = []
        failures.append(f"could not inspect git checkout: {error}")

    if expected_commit is not None:
        require(
            COMMIT_SHA.fullmatch(expected_commit) is not None,
            "--expected-commit must be a complete lowercase commit SHA",
            failures,
        )
        require(
            candidate_sha == expected_commit,
            "validator checkout HEAD does not match --expected-commit",
            failures,
        )
        require(
            git_status_short == [],
            "validator expected-commit checkout is dirty",
            failures,
        )

    manifest = load_manifest()
    require(
        manifest.get("revision") == "M1.5",
        "manifest revision must be M1.5",
        failures,
    )
    require(
        manifest.get("rights")
        == "Project-original BokuNoJihanki assets; no third-party game art",
        "manifest rights statement changed",
        failures,
    )
    require(
        set(manifest.get("areas", {}))
        == {"home-street", "life-road", "upper-vending-lane"},
        "manifest must use the three official area IDs",
        failures,
    )

    file_records = {
        record["path"]: record
        for record in manifest.get("files", [])
        if isinstance(record, dict) and isinstance(record.get("path"), str)
    }
    for relative, record in file_records.items():
        path = ROOT / relative
        validate_hash_record(path, record, relative, failures)
        if not path.is_file():
            continue
        require(
            HASHED_NAME.fullmatch(path.name) is not None,
            f"runtime asset must have a content-source hash URL: {relative}",
            failures,
        )

    source_records = {
        record["path"]: record
        for record in manifest.get("sources", [])
        if isinstance(record, dict) and isinstance(record.get("path"), str)
    }
    for relative, record in source_records.items():
        path = ROOT / relative
        require(path.is_file(), f"missing source file: {relative}", failures)
        if path.is_file():
            require(
                sha256(path) == record.get("sha256"),
                f"source SHA mismatch: {relative}",
                failures,
            )

    expected_dimensions = {
        "home-street": (2400, 720),
        "life-road": (2680, 720),
        "upper-vending-lane": (2320, 720),
    }
    for area_id, area in manifest["areas"].items():
        for phase in ("morning", "day", "evening", "night"):
            image_path = OUTPUT / area["backgrounds"][phase]
            with Image.open(image_path) as image:
                require(
                    image.size == expected_dimensions[area_id],
                    f"{area_id}/{phase} dimensions changed: {image.size}",
                    failures,
                )
                require(
                    image.mode == "RGB",
                    f"{area_id}/{phase} must be RGB",
                    failures,
                )
        foreground_path = OUTPUT / area["foreground"]
        with Image.open(foreground_path) as foreground:
            require(
                foreground.size == expected_dimensions[area_id],
                f"{area_id} foreground dimensions changed",
                failures,
            )
            require(
                foreground.mode == "RGBA",
                f"{area_id} foreground must be RGBA",
                failures,
            )

    player = manifest["player"]
    require(
        player["idleFramesPerDirection"] == 4,
        "player must have four idle frames",
        failures,
    )
    require(
        player["walkFramesPerDirection"] == 8,
        "player must have eight walk frames",
        failures,
    )
    require(
        player["shadowBakedIntoFrames"] is False,
        "player frames must not bake a shadow",
        failures,
    )
    require(
        player["footPivot"] == {
            "x": 0.5,
            "y": 0.9609375,
            "pixelX": 128.0,
            "pixelY": 369,
        },
        "player foot pivot was not remeasured from the normalized frames",
        failures,
    )
    runtime_scale = float(player["runtimeScale"])
    pivot_pixel_y = float(player["footPivot"]["pixelY"])

    atlas_path = OUTPUT / player["image"]
    atlas_json_path = OUTPUT / player["atlas"]
    atlas_json = json.loads(atlas_json_path.read_text(encoding="utf-8"))
    frames = atlas_json.get("frames", {})
    require(
        isinstance(frames, dict) and len(frames) == EXPECTED_FRAME_COUNT,
        f"player atlas must contain {EXPECTED_FRAME_COUNT} measured frames",
        failures,
    )
    require(
        set(frames) == set(player.get("frameBounds", {})),
        "atlas frame names do not match the manifest frame bounds",
        failures,
    )
    with Image.open(atlas_path) as raw_atlas:
        require(
            raw_atlas.mode == "RGBA",
            "player atlas must have alpha",
            failures,
        )
        require(
            raw_atlas.size == (1536, 1536),
            "player atlas dimensions changed",
            failures,
        )
        atlas = raw_atlas.convert("RGBA")
    atlas_pixels = np.asarray(atlas)
    alpha = atlas_pixels[..., 3]
    red = atlas_pixels[..., 0]
    green = atlas_pixels[..., 1]
    blue = atlas_pixels[..., 2]
    red_blue_delta = np.abs(red.astype(np.int16) - blue.astype(np.int16))
    visible_chroma_residue = (
        (alpha > 5)
        & (red > 180)
        & (blue > 180)
        & (green < 110)
        & (red_blue_delta < 100)
    )
    require(
        int(visible_chroma_residue.sum()) == 0,
        "player atlas retains visible magenta chroma-key pixels",
        failures,
    )
    require(int(alpha[0, :].max()) == 0, "atlas top edge is clipped", failures)
    require(
        int(alpha[-1, :].max()) == 0,
        "atlas bottom edge is clipped",
        failures,
    )
    require(int(alpha[:, 0].max()) == 0, "atlas left edge is clipped", failures)
    require(
        int(alpha[:, -1].max()) == 0,
        "atlas right edge is clipped",
        failures,
    )

    frame_reports: list[dict[str, Any]] = []
    for frame_name, entry in sorted(frames.items()):
        frame = entry["frame"]
        x, y, width, height = frame["x"], frame["y"], frame["w"], frame["h"]
        pixels = atlas_pixels[y : y + height, x : x + width]
        frame_alpha = pixels[..., 3]
        require(
            int(frame_alpha[0, :].max()) == 0,
            f"{frame_name} clips at top",
            failures,
        )
        require(
            int(frame_alpha[-1, :].max()) == 0,
            f"{frame_name} clips at bottom",
            failures,
        )
        require(
            int(frame_alpha[:, 0].max()) == 0,
            f"{frame_name} clips at left",
            failures,
        )
        require(
            int(frame_alpha[:, -1].max()) == 0,
            f"{frame_name} clips at right",
            failures,
        )
        metrics = frame_foot_metrics(
            frame_alpha,
            frame_name=frame_name,
            pivot_pixel_y=pivot_pixel_y,
            runtime_scale=runtime_scale,
        )
        validate_frame_foot_metrics(metrics, failures)
        frame_reports.append(metrics)

    sidecar_value = SIDECAR_PATH.read_text(encoding="ascii").split()[0]
    manifest_sha256 = sha256(MANIFEST_PATH)
    require(
        sidecar_value == manifest_sha256,
        "asset manifest sidecar SHA mismatch",
        failures,
    )
    atlas_record = file_records.get(str(atlas_path.relative_to(ROOT)), {})
    atlas_json_record = file_records.get(
        str(atlas_json_path.relative_to(ROOT)),
        {},
    )
    report = {
        "schemaVersion": 1,
        "status": "PASS" if not failures else "FAIL",
        "candidateSha": candidate_sha,
        "expectedCommit": expected_commit,
        "gitStatusShort": git_status_short,
        "manifest": {
            "path": str(MANIFEST_PATH.relative_to(ROOT)),
            "bytes": MANIFEST_PATH.stat().st_size,
            "sha256": manifest_sha256,
            "sidecarPath": str(SIDECAR_PATH.relative_to(ROOT)),
            "sidecarBytes": SIDECAR_PATH.stat().st_size,
            "sidecarSha256": sha256(SIDECAR_PATH),
            "sidecarDeclaredManifestSha256": sidecar_value,
        },
        "atlas": {
            "path": str(atlas_path.relative_to(ROOT)),
            "bytes": atlas_path.stat().st_size,
            "sha256": sha256(atlas_path),
            "manifestBytes": atlas_record.get("bytes"),
            "manifestSha256": atlas_record.get("sha256"),
            "jsonPath": str(atlas_json_path.relative_to(ROOT)),
            "jsonBytes": atlas_json_path.stat().st_size,
            "jsonSha256": sha256(atlas_json_path),
            "manifestJsonBytes": atlas_json_record.get("bytes"),
            "manifestJsonSha256": atlas_json_record.get("sha256"),
        },
        "alphaThresholdExclusive": ALPHA_THRESHOLD_EXCLUSIVE,
        "visibleFootToleranceCssPx": VISIBLE_FOOT_TOLERANCE_CSS_PX,
        "runtimeScale": runtime_scale,
        "frameCount": len(frame_reports),
        "expectedFrameCount": EXPECTED_FRAME_COUNT,
        "frames": frame_reports,
        "summary": {
            "maxAbsoluteRowDeltaPx": max(
                abs(frame["rowDeltaPx"])
                for frame in frame_reports
                if frame["rowDeltaPx"] is not None
            ),
            "maxAbsoluteRowDeltaCssPx": max(
                abs(frame["rowDeltaCssPx"])
                for frame in frame_reports
                if frame["rowDeltaCssPx"] is not None
            ),
            "maxAbsoluteVisibleBottomEdgeDeltaCssPx": max(
                abs(frame["visibleBottomEdgeDeltaCssPx"])
                for frame in frame_reports
                if frame["visibleBottomEdgeDeltaCssPx"] is not None
            ),
        },
        "failures": failures,
    }
    return failures, report


def parse_arguments(arguments: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-commit")
    parser.add_argument("--json-out", type=str)
    return parser.parse_args(arguments)


def write_report(destination: str, report: dict[str, Any]) -> None:
    rendered = json.dumps(
        report,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"
    if destination == "-":
        sys.stdout.write(rendered)
        return
    path = Path(destination).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered, encoding="utf-8")


def main(arguments: Sequence[str] | None = None) -> None:
    args = parse_arguments(arguments)
    failures, report = validate(expected_commit=args.expected_commit)
    if args.json_out:
        write_report(args.json_out, report)
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        raise SystemExit(1)
    print("M1.5 visual assets: PASS", file=sys.stderr if args.json_out == "-" else sys.stdout)


if __name__ == "__main__":
    main()
