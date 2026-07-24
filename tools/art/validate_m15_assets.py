#!/usr/bin/env python3
"""Validate the generated M1.5-only visual asset contract."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/images/m15"
MANIFEST_PATH = OUTPUT / "asset-manifest.json"
HASHED_NAME = re.compile(r".+-[0-9a-f]{12}(?:-[a-z]+)?\.(?:webp|json)$")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def validate() -> list[str]:
    failures: list[str] = []
    manifest = load_manifest()
    require(manifest.get("revision") == "M1.5", "manifest revision must be M1.5", failures)
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
    }
    for relative, record in file_records.items():
        path = ROOT / relative
        require(path.is_file(), f"missing generated file: {relative}", failures)
        if not path.is_file():
            continue
        require(path.stat().st_size == record["bytes"], f"size mismatch: {relative}", failures)
        require(sha256(path) == record["sha256"], f"SHA-256 mismatch: {relative}", failures)
        require(
            HASHED_NAME.fullmatch(path.name) is not None,
            f"runtime asset must have a content-source hash URL: {relative}",
            failures,
        )

    source_records = {
        record["path"]: record
        for record in manifest.get("sources", [])
    }
    for relative, record in source_records.items():
        path = ROOT / relative
        require(path.is_file(), f"missing source file: {relative}", failures)
        if path.is_file():
            require(sha256(path) == record["sha256"], f"source SHA mismatch: {relative}", failures)

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
                require(image.mode == "RGB", f"{area_id}/{phase} must be RGB", failures)
        foreground_path = OUTPUT / area["foreground"]
        with Image.open(foreground_path) as foreground:
            require(
                foreground.size == expected_dimensions[area_id],
                f"{area_id} foreground dimensions changed",
                failures,
            )
            require(foreground.mode == "RGBA", f"{area_id} foreground must be RGBA", failures)

    player = manifest["player"]
    require(player["idleFramesPerDirection"] == 4, "player must have four idle frames", failures)
    require(player["walkFramesPerDirection"] == 8, "player must have eight walk frames", failures)
    require(player["shadowBakedIntoFrames"] is False, "player frames must not bake a shadow", failures)
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

    atlas_path = OUTPUT / player["image"]
    atlas_json_path = OUTPUT / player["atlas"]
    atlas_json = json.loads(atlas_json_path.read_text(encoding="utf-8"))
    require(len(atlas_json["frames"]) == 24, "player atlas must contain 24 measured frames", failures)
    with Image.open(atlas_path) as raw_atlas:
        require(raw_atlas.mode == "RGBA", "player atlas must have alpha", failures)
        require(raw_atlas.size == (1536, 1536), "player atlas dimensions changed", failures)
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
    require(int(alpha[-1, :].max()) == 0, "atlas bottom edge is clipped", failures)
    require(int(alpha[:, 0].max()) == 0, "atlas left edge is clipped", failures)
    require(int(alpha[:, -1].max()) == 0, "atlas right edge is clipped", failures)

    for frame_name, entry in atlas_json["frames"].items():
        frame = entry["frame"]
        x, y, width, height = frame["x"], frame["y"], frame["w"], frame["h"]
        pixels = atlas_pixels[y : y + height, x : x + width]
        frame_alpha = pixels[..., 3]
        require(int(frame_alpha[0, :].max()) == 0, f"{frame_name} clips at top", failures)
        require(int(frame_alpha[-1, :].max()) == 0, f"{frame_name} clips at bottom", failures)
        require(int(frame_alpha[:, 0].max()) == 0, f"{frame_name} clips at left", failures)
        require(int(frame_alpha[:, -1].max()) == 0, f"{frame_name} clips at right", failures)
        opaque_y, _ = np.where(frame_alpha > 10)
        require(opaque_y.size > 12_000, f"{frame_name} has insufficient opaque coverage", failures)
        if opaque_y.size:
            require(
                int(opaque_y.max()) == player["footPivot"]["pixelY"],
                f"{frame_name} foot baseline is not {player['footPivot']['pixelY']}",
                failures,
            )

    sidecar = (OUTPUT / "asset-manifest.sha256").read_text(encoding="ascii").split()[0]
    require(sidecar == sha256(MANIFEST_PATH), "asset manifest sidecar SHA mismatch", failures)
    return failures


def main() -> None:
    failures = validate()
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        raise SystemExit(1)
    print("M1.5 visual assets: PASS")


if __name__ == "__main__":
    main()
