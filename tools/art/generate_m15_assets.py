#!/usr/bin/env python3
"""Generate M1.5-only player and town assets without modifying M1.3/M1.4.

M1.5 keeps the approved M1.4 home/life masters as immutable inputs, uses the
project-original upper-lane edit in m15-source, and turns the keyed character
sheet into a normalized, mirrored production atlas. Geometry annotations are
deliberately absent here: the image-SHA-bound ground fixture is the sole source
for ground, spawn and branch coordinates.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
M14_SOURCE = ROOT / "tools/art/m14-source"
M15_SOURCE = ROOT / "tools/art/m15-source"
OUTPUT = ROOT / "public/assets/images/m15"

HEIGHT = 720
FRAME_W = 256
FRAME_H = 384
PLAYER_COLUMNS = 6
PLAYER_ROWS = 4
PLAYER_SOURCE_COLUMNS = 6
PLAYER_SOURCE_ROWS = 2
PLAYER_BODY_HEIGHT = 352
PLAYER_FOOT_Y = 369
PLAYER_RUNTIME_SCALE = 0.38
PHASES = ("morning", "day", "evening", "night")
PIPELINE_VERSION = "m15-art-v1"

AREAS: dict[str, dict[str, Any]] = {
    "home-street": {
        "width": 2400,
        "source": M14_SOURCE / "home-street-master.png",
        "crop": (0, 42, 1672, 872),
        "glows": [(350, 350, 72, 48), (1940, 350, 78, 50)],
    },
    "life-road": {
        "width": 2680,
        "source": M14_SOURCE / "life-road-master.png",
        "crop": (0, 35, 1672, 865),
        "glows": [(395, 348, 68, 48), (1770, 350, 82, 52)],
    },
    "upper-vending-lane": {
        "width": 2320,
        "source": M15_SOURCE / "upper-vending-lane-master.png",
        "crop": (0, 55, 1672, 885),
        "glows": [(865, 262, 130, 166)],
    },
}


def cleanup_stale_temporaries() -> None:
    for directory, patterns in (
        (OUTPUT, ("m15-image-*", "m15-text-*", "*.tmp")),
        (M15_SOURCE, ("m15-keyed-*", "*.tmp")),
    ):
        if not directory.exists():
            continue
        for pattern in patterns:
            for path in directory.glob(pattern):
                if path.is_file():
                    path.unlink()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    record: dict[str, Any] = {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    if path.suffix.lower() in {".png", ".webp"}:
        with Image.open(path) as image:
            record["width"] = image.width
            record["height"] = image.height
            record["mode"] = image.mode
    return record


def source_slug(path: Path) -> str:
    return sha256(path)[:12]


def save_webp(
    image: Image.Image,
    path: Path,
    *,
    quality: int = 92,
    lossless: bool = False,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp")
    try:
        image.save(temporary, "WEBP", quality=quality, method=6, lossless=lossless)
        with temporary.open("rb") as handle:
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_write_text(path: Path, content: str, *, encoding: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp")
    try:
        with temporary.open("w", encoding=encoding) as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def runtime_panorama(config: dict[str, Any]) -> Image.Image:
    source = Image.open(config["source"]).convert("RGB")
    crop = source.crop(config["crop"])
    panorama = crop.resize((int(config["width"]), HEIGHT), Image.Resampling.LANCZOS)
    panorama = ImageEnhance.Color(panorama).enhance(0.97)
    panorama = ImageEnhance.Contrast(panorama).enhance(1.02)

    grain = Image.new("RGBA", panorama.size, (0, 0, 0, 0))
    grain_draw = ImageDraw.Draw(grain, "RGBA")
    for y in range(0, HEIGHT, 11):
        for x in range((y * 17) % 19, panorama.width, 19):
            value = 245 if (x + y) % 3 else 42
            grain_draw.point((x, y), fill=(value, value, value, 6))
    return Image.alpha_composite(panorama.convert("RGBA"), grain).convert("RGB")


def add_glows(
    image: Image.Image,
    glows: list[tuple[int, int, int, int]],
    strength: float,
) -> Image.Image:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    for x, y, width, height in glows:
        for ring in range(5, 0, -1):
            padding = ring * 22
            alpha = int((7 - ring) * 5 * strength)
            draw.rounded_rectangle(
                (x - padding, y - padding, x + width + padding, y + height + padding),
                radius=18 + padding,
                fill=(255, 208, 105, alpha),
            )
        draw.rounded_rectangle(
            (x, y, x + width, y + height),
            radius=6,
            fill=(255, 226, 151, int(80 * strength)),
        )
    blurred = layer.filter(ImageFilter.GaussianBlur(3))
    return Image.alpha_composite(image.convert("RGBA"), blurred).convert("RGB")


def phase_grade(
    base: Image.Image,
    phase: str,
    glows: list[tuple[int, int, int, int]],
) -> Image.Image:
    image = base.copy().convert("RGB")
    if phase == "morning":
        image = ImageEnhance.Brightness(image).enhance(1.02)
        image = Image.blend(image, Image.new("RGB", image.size, (255, 230, 184)), 0.05)
    elif phase == "day":
        image = ImageEnhance.Brightness(image).enhance(1.07)
        image = ImageEnhance.Color(image).enhance(1.04)
        image = ImageEnhance.Contrast(image).enhance(1.03)
    elif phase == "evening":
        image = ImageEnhance.Brightness(image).enhance(0.73)
        image = ImageEnhance.Contrast(image).enhance(1.08)
        image = Image.blend(image, Image.new("RGB", image.size, (225, 108, 63)), 0.24)
        image = add_glows(image, glows, 0.55)
    elif phase == "night":
        image = ImageEnhance.Brightness(image).enhance(0.34)
        image = ImageEnhance.Color(image).enhance(0.66)
        image = Image.blend(image, Image.new("RGB", image.size, (25, 49, 91)), 0.44)
        image = add_glows(image, glows, 1.0)
    else:
        raise ValueError(f"Unknown phase: {phase}")
    return image


def foreground_for(area_id: str, width: int) -> Image.Image:
    image = Image.new("RGBA", (width, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    seed = sum(ord(char) for char in area_id)

    if area_id == "home-street":
        clusters = [(80, 680, 180), (2180, 676, 170)]
        color = (43, 91, 57, 190)
    elif area_id == "life-road":
        clusters = [(120, 682, 210), (1290, 690, 130), (2470, 678, 190)]
        color = (39, 78, 49, 185)
    else:
        clusters = [(65, 672, 260), (2100, 674, 210)]
        color = (23, 62, 42, 215)

    for cluster_index, (center, baseline, spread) in enumerate(clusters):
        for index in range(28):
            phase = seed * 0.17 + cluster_index * 1.9 + index * 2.41
            x = center + math.sin(phase) * spread * (0.25 + (index % 5) / 6)
            height = 18 + (index * 13 + seed) % 46
            radius = 5 + (index % 4) * 2
            draw.line(
                (x, baseline, x + math.sin(phase * 1.7) * 8, baseline - height),
                fill=(31, 72, 43, 165),
                width=3,
            )
            draw.ellipse(
                (x - radius, baseline - height - radius, x + radius, baseline - height + radius),
                fill=color,
            )
    return image.filter(ImageFilter.GaussianBlur(0.35))


def alpha_bbox(image: Image.Image, threshold: int = 10) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("Player frame contains no opaque pixels.")
    return bbox


def clean_chroma_cell(cell: Image.Image) -> Image.Image:
    """Keep the single connected character and reject generator background artifacts."""

    rgb = np.asarray(cell.convert("RGB"))
    red, green, blue = np.moveaxis(rgb, -1, 0)
    red_blue_delta = np.abs(red.astype(np.int16) - blue.astype(np.int16))
    chroma_background = (
        (red > 180)
        & (blue > 180)
        & (green < 110)
        & (red_blue_delta < 100)
    )
    labels, label_count = ndimage.label(~chroma_background)
    if label_count == 0:
        raise ValueError("Player chroma cell contains no foreground component.")
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    character = labels == int(np.argmax(counts))
    if int(character.sum()) < 15_000:
        raise ValueError("Player chroma foreground is unexpectedly small.")

    inside_distance = ndimage.distance_transform_edt(character)
    magenta_dominance = np.minimum(red, blue).astype(np.int16) - green.astype(np.int16)
    spill = (
        character
        & (inside_distance <= 3.5)
        & (magenta_dominance > 18)
        & (red_blue_delta < 100)
    )
    clean_interior = character & ~spill
    _, clean_nearest = ndimage.distance_transform_edt(
        ~clean_interior,
        return_indices=True,
    )
    interior_rgb = rgb[clean_nearest[0], clean_nearest[1]]

    # Use a compact soft matte around only the character component. Nearest
    # foreground colours fill the antialias ring so no magenta is reintroduced.
    alpha = ndimage.gaussian_filter(character.astype(np.float32), sigma=0.58)
    alpha[alpha < 0.018] = 0
    alpha[alpha > 0.982] = 1
    cleaned_rgb = rgb.copy()
    cleaned_rgb[spill] = interior_rgb[spill]
    antialias_ring = (alpha > 0) & ~character
    cleaned_rgb[antialias_ring] = interior_rgb[antialias_ring]
    rgba = np.dstack((cleaned_rgb, np.rint(alpha * 255).astype(np.uint8)))
    return Image.fromarray(rgba, "RGBA")


def build_keyed_player_source() -> Image.Image:
    chroma_path = M15_SOURCE / "player-left-atlas-chroma.png"
    keyed_path = M15_SOURCE / "player-left-atlas-keyed.png"
    sheet = Image.open(chroma_path).convert("RGB")
    if sheet.size != (1659, 948):
        raise ValueError(f"Unexpected chroma player source size: {sheet.size}")
    keyed = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    for row in range(PLAYER_SOURCE_ROWS):
        for column in range(PLAYER_SOURCE_COLUMNS):
            x0 = round(column * sheet.width / PLAYER_SOURCE_COLUMNS)
            x1 = round((column + 1) * sheet.width / PLAYER_SOURCE_COLUMNS)
            y0 = round(row * sheet.height / PLAYER_SOURCE_ROWS)
            y1 = round((row + 1) * sheet.height / PLAYER_SOURCE_ROWS)
            keyed.alpha_composite(clean_chroma_cell(sheet.crop((x0, y0, x1, y1))), (x0, y0))
    temporary = keyed_path.with_name(f"{keyed_path.name}.tmp")
    try:
        keyed.save(temporary, "PNG", optimize=True)
        with temporary.open("rb") as handle:
            os.fsync(handle.fileno())
        os.replace(temporary, keyed_path)
    finally:
        temporary.unlink(missing_ok=True)
    return keyed


def normalized_player_frames(sheet: Image.Image) -> list[tuple[str, Image.Image]]:
    sheet = sheet.convert("RGBA")
    if sheet.size != (1659, 948):
        raise ValueError(f"Unexpected keyed player source size: {sheet.size}")

    source_frames: list[Image.Image] = []
    for row in range(PLAYER_SOURCE_ROWS):
        for column in range(PLAYER_SOURCE_COLUMNS):
            x0 = round(column * sheet.width / PLAYER_SOURCE_COLUMNS)
            x1 = round((column + 1) * sheet.width / PLAYER_SOURCE_COLUMNS)
            y0 = round(row * sheet.height / PLAYER_SOURCE_ROWS)
            y1 = round((row + 1) * sheet.height / PLAYER_SOURCE_ROWS)
            source_frames.append(sheet.crop((x0, y0, x1, y1)))

    normalized_left: list[Image.Image] = []
    for source in source_frames:
        bbox = alpha_bbox(source)
        figure = source.crop(bbox)
        scale = PLAYER_BODY_HEIGHT / figure.height
        target_width = max(1, round(figure.width * scale))
        figure = figure.resize((target_width, PLAYER_BODY_HEIGHT), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        x = (FRAME_W - figure.width) // 2
        y = PLAYER_FOOT_Y - figure.height + 1
        frame.alpha_composite(figure, (x, y))
        if alpha_bbox(frame)[3] >= FRAME_H:
            raise ValueError("Normalized player touches the lower frame edge.")
        normalized_left.append(frame)

    names = [*(f"idle-left-{index}" for index in range(4))]
    names.extend(f"walk-left-{index}" for index in range(8))
    frames = list(zip(names, normalized_left, strict=True))
    for name, frame in zip(
        [*(f"idle-right-{index}" for index in range(4))],
        normalized_left[:4],
        strict=True,
    ):
        frames.append((name, ImageOps.mirror(frame)))
    for name, frame in zip(
        [*(f"walk-right-{index}" for index in range(8))],
        normalized_left[4:],
        strict=True,
    ):
        frames.append((name, ImageOps.mirror(frame)))
    return frames


def player_atlas(
    image_name: str,
    keyed_sheet: Image.Image,
) -> tuple[Image.Image, dict[str, Any], dict[str, Any]]:
    frames = normalized_player_frames(keyed_sheet)
    atlas = Image.new(
        "RGBA",
        (PLAYER_COLUMNS * FRAME_W, PLAYER_ROWS * FRAME_H),
        (0, 0, 0, 0),
    )
    atlas_json: dict[str, Any] = {
        "frames": {},
        "meta": {
            "app": "BokuNoJihanki M1.5 deterministic atlas builder",
            "version": PIPELINE_VERSION,
            "image": image_name,
            "format": "RGBA8888",
            "size": {
                "w": PLAYER_COLUMNS * FRAME_W,
                "h": PLAYER_ROWS * FRAME_H,
            },
            "scale": "1",
        },
    }
    frame_bounds: dict[str, dict[str, int]] = {}
    for index, (name, frame_image) in enumerate(frames):
        x = (index % PLAYER_COLUMNS) * FRAME_W
        y = (index // PLAYER_COLUMNS) * FRAME_H
        atlas.alpha_composite(frame_image, (x, y))
        atlas_json["frames"][name] = {
            "frame": {"x": x, "y": y, "w": FRAME_W, "h": FRAME_H},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME_W, "h": FRAME_H},
            "sourceSize": {"w": FRAME_W, "h": FRAME_H},
        }
        left, top, right, bottom = alpha_bbox(frame_image)
        frame_bounds[name] = {
            "left": left,
            "top": top,
            "rightExclusive": right,
            "bottomExclusive": bottom,
        }

    player_metadata = {
        "directions": ["left", "right"],
        "idleFramesPerDirection": 4,
        "walkFramesPerDirection": 8,
        "contactFrames": [0, 4],
        "frameSize": {"width": FRAME_W, "height": FRAME_H},
        "footPivot": {
            "x": 0.5,
            "y": PLAYER_FOOT_Y / FRAME_H,
            "pixelX": FRAME_W / 2,
            "pixelY": PLAYER_FOOT_Y,
        },
        "runtimeScale": PLAYER_RUNTIME_SCALE,
        "shadowBakedIntoFrames": False,
        "frameBounds": frame_bounds,
    }
    return atlas, atlas_json, player_metadata


def generate() -> None:
    cleanup_stale_temporaries()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    keyed_sheet = build_keyed_player_source()
    generated: list[Path] = []
    source_records: list[dict[str, Any]] = []
    area_manifest: dict[str, Any] = {}

    for area_id, config in AREAS.items():
        source = Path(config["source"])
        source_hash = sha256(source)
        source_records.append(file_record(source))
        slug = source_hash[:12]
        base = runtime_panorama(config)
        backgrounds: dict[str, str] = {}
        for phase in PHASES:
            filename = f"bg-{area_id}-{slug}-{phase}.webp"
            output_path = OUTPUT / filename
            save_webp(phase_grade(base, phase, config["glows"]), output_path)
            generated.append(output_path)
            backgrounds[phase] = filename
        foreground_name = f"fg-{area_id}-{slug}.webp"
        foreground_path = OUTPUT / foreground_name
        save_webp(
            foreground_for(area_id, int(config["width"])),
            foreground_path,
            lossless=True,
        )
        generated.append(foreground_path)
        area_manifest[area_id] = {
            "worldWidth": config["width"],
            "source": source.relative_to(ROOT).as_posix(),
            "sourceSha256": source_hash,
            "backgrounds": backgrounds,
            "foreground": foreground_name,
        }

    keyed_source = M15_SOURCE / "player-left-atlas-keyed.png"
    chroma_source = M15_SOURCE / "player-left-atlas-chroma.png"
    source_records.extend((file_record(chroma_source), file_record(keyed_source)))
    player_slug = source_slug(chroma_source)
    atlas_name = f"player-atlas-{player_slug}.webp"
    atlas_json_name = f"player-atlas-{player_slug}.json"
    atlas, atlas_json, player_metadata = player_atlas(atlas_name, keyed_sheet)
    atlas_path = OUTPUT / atlas_name
    atlas_json_path = OUTPUT / atlas_json_name
    save_webp(atlas, atlas_path, lossless=True)
    atomic_write_text(
        atlas_json_path,
        json.dumps(atlas_json, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    generated.extend((atlas_path, atlas_json_path))
    player_metadata.update({
        "image": atlas_name,
        "atlas": atlas_json_name,
        "chromaSource": chroma_source.relative_to(ROOT).as_posix(),
        "chromaSourceSha256": sha256(chroma_source),
        "keyedSource": keyed_source.relative_to(ROOT).as_posix(),
        "keyedSourceSha256": sha256(keyed_source),
    })

    generation_record = M15_SOURCE / "generation.json"
    player_prompt = M15_SOURCE / "player-prompt.txt"
    upper_prompt = M15_SOURCE / "upper-edit-prompt.txt"
    source_records.extend(
        file_record(path)
        for path in (generation_record, player_prompt, upper_prompt)
    )

    manifest_path = OUTPUT / "asset-manifest.json"
    manifest = {
        "version": "0.1.5",
        "revision": "M1.5",
        "pipelineVersion": PIPELINE_VERSION,
        "generatedAt": "2026-07-23",
        "style": "project-original painterly side-scroll Japanese summer town",
        "rights": "Project-original BokuNoJihanki assets; no third-party game art",
        "generator": {
            "imageGeneration": "OpenAI built-in image generator",
            "deterministicPostProcess": "python3 tools/art/generate_m15_assets.py",
            "generationRecord": generation_record.relative_to(ROOT).as_posix(),
        },
        "areas": area_manifest,
        "player": player_metadata,
        "sources": source_records,
        "files": [file_record(path) for path in sorted(generated)],
    }
    atomic_write_text(
        manifest_path,
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # Include the manifest's own digest in a sidecar to avoid a self-referential
    # hash inside the manifest.
    sidecar = OUTPUT / "asset-manifest.sha256"
    atomic_write_text(
        sidecar,
        f"{sha256(manifest_path)}  asset-manifest.json\n",
        encoding="ascii",
    )
    cleanup_stale_temporaries()


if __name__ == "__main__":
    generate()
