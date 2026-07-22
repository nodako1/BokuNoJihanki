#!/usr/bin/env python3
"""Generate project-original M1.2 painterly raster assets from the approved concept master.

The source image was generated specifically for BokuNoJihanki and is treated as the
approved art-direction master. This script removes presentation UI/player pixels,
creates a seamless four-chunk raster world, derives time-of-day variants, foreground
occlusion layers, and raster player sprites. It is deterministic and may be rerun.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps
import cairosvg

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/art/reference/m12-approved-concept.jpg"
SOURCE_PARTS = ROOT / "tools/art/reference/parts"
OUTPUT = ROOT / "public/assets/images/m12"
PLAYER_SVG_DIR = ROOT / "tools/art/player-svg"
WIDTH = 1280
HEIGHT = 720
PHASES = ("morning", "day", "evening", "night")
CHUNKS = ("residential-west", "residential-east", "park-west", "park-east")


def ensure_source() -> None:
    if SOURCE.exists():
        return
    parts = sorted(SOURCE_PARTS.glob('part-*.b64'))
    if not parts:
        raise FileNotFoundError(f"Missing approved M1.2 master image parts: {SOURCE_PARTS}")
    import base64
    encoded = ''.join(path.read_text(encoding='ascii').strip() for path in parts)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    SOURCE.write_bytes(base64.b64decode(encoded))


def remove_player_and_crop() -> Image.Image:
    image = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Unable to decode {SOURCE}")

    # The crop deliberately excludes the mock HUD, joystick, pause controls and FPS panel.
    # It preserves the houses, intersection, park, vending machine and foreground roof.
    crop = image[0:694, 340:1340].copy()
    mask = np.zeros(crop.shape[:2], np.uint8)

    # Approved concept contains a presentation-only player at source x≈785, y≈410.
    # Remove it so the real runtime player can be rendered and animated independently.
    cv2.ellipse(mask, (445, 410), (46, 74), 0, 0, 360, 255, -1)
    cv2.ellipse(mask, (445, 458), (53, 18), 0, 0, 360, 255, -1)
    crop = cv2.inpaint(crop, mask, 7, cv2.INPAINT_TELEA)
    crop = cv2.resize(crop, (WIDTH, HEIGHT), interpolation=cv2.INTER_LANCZOS4)
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    return Image.fromarray(crop_rgb).convert("RGB")


def phase_grade(base: Image.Image, phase: str, flipped: bool) -> Image.Image:
    image = base.copy().convert("RGB")
    if phase == "morning":
        image = ImageEnhance.Brightness(image).enhance(1.02)
        image = ImageEnhance.Color(image).enhance(1.03)
        overlay = Image.new("RGB", image.size, (255, 218, 152))
        image = Image.blend(image, overlay, 0.055)
    elif phase == "day":
        image = ImageEnhance.Brightness(image).enhance(1.075)
        image = ImageEnhance.Contrast(image).enhance(1.025)
        image = ImageEnhance.Color(image).enhance(1.055)
    elif phase == "evening":
        image = ImageEnhance.Brightness(image).enhance(0.78)
        image = ImageEnhance.Contrast(image).enhance(1.09)
        warm = Image.new("RGB", image.size, (227, 91, 48))
        image = Image.blend(image, warm, 0.20)
        # Purple-blue lower haze gives the sunset a painterly depth rather than a flat tint.
        haze = Image.new("RGBA", image.size, (43, 35, 83, 0))
        alpha = Image.new("L", image.size, 0)
        a = np.zeros((HEIGHT, WIDTH), np.uint8)
        for y in range(HEIGHT):
            a[y, :] = int(max(0, (y - 330) / 390) * 80)
        alpha = Image.fromarray(a, "L")
        haze.putalpha(alpha)
        image = Image.alpha_composite(image.convert("RGBA"), haze).convert("RGB")
    elif phase == "night":
        image = ImageEnhance.Brightness(image).enhance(0.37)
        image = ImageEnhance.Color(image).enhance(0.67)
        blue = Image.new("RGB", image.size, (31, 55, 96))
        image = Image.blend(image, blue, 0.38)
        image = ImageEnhance.Contrast(image).enhance(1.08)
        image = add_night_lights(image, flipped)
    else:
        raise ValueError(phase)

    # A restrained paper texture prevents color-graded variants from looking digitally flat.
    arr = np.asarray(image).astype(np.int16)
    yy, xx = np.indices((HEIGHT, WIDTH))
    grain = ((xx * 17 + yy * 31 + (xx * yy) % 23) % 11) - 5
    arr = np.clip(arr + grain[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def add_night_lights(image: Image.Image, flipped: bool) -> Image.Image:
    canvas = image.convert("RGBA")
    glows = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    # Coordinates are defined on the unflipped approved crop.
    points = [
        (90, 240, 85, 45, (255, 197, 92, 104)),
        (270, 285, 70, 38, (255, 185, 79, 90)),
        (1000, 410, 105, 150, (195, 238, 255, 80)),
        (836, 445, 78, 155, (255, 218, 143, 90)),
        (598, 240, 58, 92, (255, 217, 134, 62)),
    ]
    for x, y, rw, rh, color in points:
        if flipped:
            x = WIDTH - x
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ellipse = Image.new("L", canvas.size, 0)
        d = cv2.GaussianBlur(
            cv2.ellipse(np.zeros((HEIGHT, WIDTH), np.uint8), (int(x), int(y)), (rw, rh), 0, 0, 360, 210, -1),
            (0, 0),
            max(10, rw / 3),
        )
        ellipse = Image.fromarray(d, "L")
        layer_color = Image.new("RGBA", canvas.size, color)
        layer_color.putalpha(ImageChops.multiply(ellipse, Image.new("L", canvas.size, color[3])))
        glows = Image.alpha_composite(glows, layer_color)
    return Image.alpha_composite(canvas, glows).convert("RGB")


def foreground_mask(flipped: bool) -> Image.Image:
    mask = np.zeros((HEIGHT, WIDTH), np.uint8)
    # Bottom roof, hedge and near-camera foliage. These are repeated over the background at
    # a high depth so the runtime player can pass visually behind the foreground.
    polygons = [
        np.array([[280, 720], [1065, 720], [1005, 654], [885, 628], [774, 585], [645, 624], [520, 602], [400, 640]], np.int32),
        np.array([[0, 720], [235, 720], [210, 628], [95, 590], [0, 612]], np.int32),
        np.array([[1060, 720], [1280, 720], [1280, 585], [1190, 603], [1125, 650]], np.int32),
    ]
    for polygon in polygons:
        cv2.fillPoly(mask, [polygon], 255)
    if flipped:
        mask = cv2.flip(mask, 1)
    mask = cv2.GaussianBlur(mask, (0, 0), 2.0)
    return Image.fromarray(mask, "L")


def save_webp(image: Image.Image, path: Path, *, quality: int = 88) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6, lossless=False)


def export_player_svgs() -> dict[str, str]:
    """Use checked-in SVGs generated from the M1.1 player source when available."""
    result: dict[str, str] = {}
    if PLAYER_SVG_DIR.exists():
        for path in PLAYER_SVG_DIR.glob("player-*.svg"):
            result[path.stem] = path.read_text(encoding="utf-8")
    return result


def extract_reference_player() -> Image.Image:
    bgr = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
    crop = bgr[325:490, 735:835].copy()
    mask = np.zeros(crop.shape[:2], np.uint8)
    background = np.zeros((1, 65), np.float64)
    foreground = np.zeros((1, 65), np.float64)
    cv2.grabCut(crop, mask, (15, 15, crop.shape[1] - 30, crop.shape[0] - 30), background, foreground, 8, cv2.GC_INIT_WITH_RECT)
    alpha = np.where((mask == 2) | (mask == 0), 0, 255).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8), 8)
    if count > 1:
        component = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        alpha = np.where(labels == component, 255, 0).astype(np.uint8)
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 1.1)
    rgba = cv2.cvtColor(crop, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    ys, xs = np.where(alpha > 12)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    image = Image.fromarray(rgba, "RGBA")
    image.thumbnail((90, 118), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (112, 160), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((112 - image.width) // 2, 150 - image.height))
    return canvas


def rasterize_players() -> list[str]:
    svg_assets = export_player_svgs()
    generated: list[str] = []
    reference_up = extract_reference_player()

    for direction in ("down", "up", "left", "right"):
        for step in (0, 1):
            key = f"player-{direction}-{step}"
            if direction == "up":
                sprite = reference_up.copy()
                if step == 1:
                    # A two-pixel bob is intentionally subtle so the approved silhouette is preserved.
                    shifted = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
                    shifted.alpha_composite(sprite, (0, -2))
                    sprite = shifted
            else:
                svg = svg_assets.get(key)
                if svg is None:
                    raise FileNotFoundError(f"Missing player SVG for {key} in {PLAYER_SVG_DIR}")
                png = cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=224, output_height=320)
                import io
                sprite = Image.open(io.BytesIO(png)).convert("RGBA").resize((112, 160), Image.Resampling.LANCZOS)
                # Painterly softening and fine grain make SVG-origin sprites sit better in raster scenes.
                sprite = sprite.filter(ImageFilter.GaussianBlur(0.18))
            path = OUTPUT / f"{key}.webp"
            path.parent.mkdir(parents=True, exist_ok=True)
            sprite.save(path, "WEBP", lossless=True, method=6)
            generated.append(path.name)
    return generated


def generate() -> None:
    ensure_source()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    base = remove_player_and_crop()
    variants = {
        "residential-west": base,
        "residential-east": ImageOps.mirror(base),
        "park-west": base,
        "park-east": ImageOps.mirror(base),
    }
    generated: list[str] = []

    for chunk, scene in variants.items():
        flipped = chunk.endswith("east")
        mask = foreground_mask(flipped)
        for phase in PHASES:
            graded = phase_grade(scene, phase, flipped)
            bg_path = OUTPUT / f"bg-{chunk}-{phase}.webp"
            fg_path = OUTPUT / f"fg-{chunk}-{phase}.webp"
            save_webp(graded, bg_path, quality=90)
            foreground = graded.convert("RGBA")
            foreground.putalpha(mask)
            foreground.save(fg_path, "WEBP", lossless=True, method=6)
            generated.extend([bg_path.name, fg_path.name])

    transparent = Image.new("RGBA", (4, 4), (0, 0, 0, 0))
    transparent.save(OUTPUT / "transparent.webp", "WEBP", lossless=True)
    generated.append("transparent.webp")
    generated.extend(rasterize_players())

    manifest = {
        "version": "0.1.2",
        "revision": "M1.2",
        "style": "approved painterly Japanese summer raster master",
        "license": "Project-original; approved concept image and derived layers belong to BokuNoJihanki",
        "source": "tools/art/reference/m12-approved-concept.jpg",
        "pipeline": "deterministic crop, presentation-element removal, layered time grading, occlusion mask, sprite rasterization",
        "files": sorted(generated),
    }
    (OUTPUT / "asset-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    generate()
