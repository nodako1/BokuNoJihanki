#!/usr/bin/env python3
"""Build M1.4 side-scroll assets from checked-in project-original masters.

The three masters were generated specifically for BokuNoJihanki with the
built-in OpenAI image generator. This deterministic post-process creates the
runtime panoramas, four time-of-day grades, foreground silhouettes, and the
formal side-view protagonist atlas without using any third-party game art.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/art/m14-source"
OUTPUT = ROOT / "public/assets/images/m14"
HEIGHT = 720
FRAME_W = 128
FRAME_H = 192
SCALE = 3
PHASES = ("morning", "day", "evening", "night")

AREAS = {
    "home-street": {
        "width": 2400,
        "master": "home-street-master.png",
        "crop": (0, 42, 1672, 872),
        "groundY": 525,
        "glows": [(350, 350, 72, 48), (1940, 350, 78, 50)],
    },
    "life-road": {
        "width": 2680,
        "master": "life-road-master.png",
        "crop": (0, 35, 1672, 865),
        "groundY": 614,
        "glows": [(395, 348, 68, 48), (1770, 350, 82, 52)],
    },
    "upper-vending-lane": {
        "width": 2320,
        "master": "upper-vending-lane-master.png",
        "crop": (0, 55, 1672, 885),
        "groundY": 535,
        "glows": [(865, 262, 130, 166)],
    },
}


def save_webp(image: Image.Image, path: Path, *, quality: int = 91, lossless: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6, lossless=lossless)


def runtime_panorama(area_id: str) -> Image.Image:
    config = AREAS[area_id]
    source = Image.open(SOURCE / str(config["master"])).convert("RGB")
    crop = source.crop(config["crop"])
    width = int(config["width"])
    panorama = crop.resize((width, HEIGHT), Image.Resampling.LANCZOS)

    # A restrained filmic pass unifies the three separately authored masters.
    panorama = ImageEnhance.Color(panorama).enhance(0.96)
    panorama = ImageEnhance.Contrast(panorama).enhance(1.025)
    grain = Image.new("RGBA", panorama.size, (0, 0, 0, 0))
    grain_draw = ImageDraw.Draw(grain, "RGBA")
    for y in range(0, HEIGHT, 11):
        for x in range((y * 17) % 19, width, 19):
            value = 245 if (x + y) % 3 else 42
            grain_draw.point((x, y), fill=(value, value, value, 7))
    return Image.alpha_composite(panorama.convert("RGBA"), grain).convert("RGB")


def add_glows(image: Image.Image, area_id: str, strength: float) -> Image.Image:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    for x, y, width, height in AREAS[area_id]["glows"]:
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
    return Image.alpha_composite(image.convert("RGBA"), layer.filter(ImageFilter.GaussianBlur(3))).convert("RGB")


def phase_grade(base: Image.Image, area_id: str, phase: str) -> Image.Image:
    image = base.copy().convert("RGB")
    if phase == "morning":
        image = ImageEnhance.Brightness(image).enhance(1.02)
        image = Image.blend(image, Image.new("RGB", image.size, (255, 230, 184)), 0.055)
    elif phase == "day":
        image = ImageEnhance.Brightness(image).enhance(1.07)
        image = ImageEnhance.Color(image).enhance(1.04)
        image = ImageEnhance.Contrast(image).enhance(1.03)
    elif phase == "evening":
        image = ImageEnhance.Brightness(image).enhance(0.73)
        image = ImageEnhance.Contrast(image).enhance(1.08)
        image = Image.blend(image, Image.new("RGB", image.size, (225, 108, 63)), 0.24)
        image = add_glows(image, area_id, 0.55)
    elif phase == "night":
        image = ImageEnhance.Brightness(image).enhance(0.34)
        image = ImageEnhance.Color(image).enhance(0.66)
        image = Image.blend(image, Image.new("RGB", image.size, (25, 49, 91)), 0.44)
        image = add_glows(image, area_id, 1.0)
    return image


def foreground_for(area_id: str) -> Image.Image:
    width = int(AREAS[area_id]["width"])
    image = Image.new("RGBA", (width, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    seed = sum(ord(char) for char in area_id)

    # Area-specific low foreground detail gives depth without obscuring the path.
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
            draw.line((x, baseline, x + math.sin(phase * 1.7) * 8, baseline - height), fill=(31, 72, 43, 165), width=3)
            draw.ellipse(
                (x - radius, baseline - height - radius, x + radius, baseline - height + radius),
                fill=color,
            )
    return image.filter(ImageFilter.GaussianBlur(0.35))


def limb(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    length: float,
    angle: float,
    width: int,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int],
) -> tuple[float, float]:
    end = (start[0] + math.sin(angle) * length, start[1] + math.cos(angle) * length)
    draw.line((start, end), fill=outline, width=width + 4 * SCALE)
    draw.line((start, end), fill=fill, width=width)
    return end


def player_frame(direction: str, frame: int, *, idle: bool) -> Image.Image:
    width, height = FRAME_W * SCALE, FRAME_H * SCALE
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image, "RGBA")
    side = 1 if direction == "right" else -1
    phase_count = 4 if idle else 10
    phase = (frame / phase_count) * math.tau
    swing = 0.035 * math.sin(phase) if idle else 0.47 * math.sin(phase)
    breath = int((1 + math.sin(phase)) * 1.15 * SCALE) if idle else int((1 - abs(math.cos(phase))) * 2.1 * SCALE)
    cx = 64 * SCALE
    foot_y = 180 * SCALE

    outline = (45, 42, 39, 255)
    skin = (235, 171, 123, 255)
    skin_hi = (255, 207, 162, 255)
    shirt = (244, 238, 215, 255)
    stripe = (204, 73, 54, 255)
    shorts = (42, 72, 100, 255)
    shoe = (236, 229, 205, 255)
    shoe_dark = (45, 63, 75, 255)
    hair = (48, 37, 31, 255)
    hair_hi = (82, 61, 45, 255)

    draw.ellipse(
        (cx - 25 * SCALE, foot_y - 4 * SCALE, cx + 25 * SCALE, foot_y + 3 * SCALE),
        fill=(18, 31, 38, 28),
    )

    hip_y = 132 * SCALE + breath
    far_sign, near_sign = (-1, 1) if direction == "right" else (1, -1)
    leg_specs = ((far_sign, -swing, False), (near_sign, swing, True))
    for depth_sign, angle, near in leg_specs:
        hip = (cx + depth_sign * 6 * SCALE, hip_y)
        knee = limb(draw, hip, 30 * SCALE, angle, 10 * SCALE, skin, outline)
        ankle = limb(draw, knee, 27 * SCALE, -angle * 0.45, 10 * SCALE, skin, outline)
        shoe_length = 18 * SCALE
        x0 = ankle[0] - (6 if side > 0 else 12) * SCALE
        x1 = x0 + shoe_length
        draw.rounded_rectangle(
            (x0, ankle[1] - 5 * SCALE, x1, ankle[1] + 7 * SCALE),
            radius=4 * SCALE,
            fill=shoe_dark,
            outline=outline,
            width=(3 if near else 2) * SCALE,
        )
        draw.rounded_rectangle(
            (x0 + 2 * SCALE, ankle[1] - 3 * SCALE, x1, ankle[1] + 2 * SCALE),
            radius=3 * SCALE,
            fill=shoe,
        )

    # Far arm, torso, shorts, then near arm preserve a readable profile.
    shoulder_y = 96 * SCALE + breath
    limb(draw, (cx - side * 9 * SCALE, shoulder_y), 38 * SCALE, swing * 0.82, 8 * SCALE, skin, outline)
    draw.rounded_rectangle(
        (cx - 24 * SCALE, 116 * SCALE + breath, cx + 24 * SCALE, 145 * SCALE + breath),
        radius=8 * SCALE,
        fill=shorts,
        outline=outline,
        width=3 * SCALE,
    )
    draw.rounded_rectangle(
        (cx - 27 * SCALE, 84 * SCALE + breath, cx + 27 * SCALE, 128 * SCALE + breath),
        radius=12 * SCALE,
        fill=shirt,
        outline=outline,
        width=3 * SCALE,
    )
    draw.rectangle(
        (cx - 25 * SCALE, 99 * SCALE + breath, cx + 25 * SCALE, 108 * SCALE + breath),
        fill=stripe,
    )
    hand = limb(draw, (cx + side * 18 * SCALE, shoulder_y), 40 * SCALE, -swing, 9 * SCALE, skin, outline)
    draw.ellipse(
        (hand[0] - 5 * SCALE, hand[1] - 5 * SCALE, hand[0] + 5 * SCALE, hand[1] + 5 * SCALE),
        fill=skin_hi,
        outline=outline,
        width=2 * SCALE,
    )

    head_y = 57 * SCALE + breath
    draw.ellipse(
        (cx - 29 * SCALE, head_y - 29 * SCALE, cx + 29 * SCALE, head_y + 34 * SCALE),
        fill=skin,
        outline=outline,
        width=3 * SCALE,
    )
    draw.pieslice(
        (cx - 31 * SCALE, head_y - 37 * SCALE, cx + 31 * SCALE, head_y + 20 * SCALE),
        180,
        360,
        fill=hair,
        outline=outline,
        width=3 * SCALE,
    )
    draw.arc(
        (cx - 26 * SCALE, head_y - 29 * SCALE, cx + 19 * SCALE, head_y + 12 * SCALE),
        205,
        325,
        fill=hair_hi,
        width=3 * SCALE,
    )
    nose_x = cx + side * 29 * SCALE
    draw.ellipse(
        (nose_x - 4 * SCALE, head_y - 3 * SCALE, nose_x + 6 * SCALE, head_y + 9 * SCALE),
        fill=skin_hi,
        outline=outline,
        width=2 * SCALE,
    )
    eye_x = cx + side * 12 * SCALE
    blink = idle and frame == 2
    if blink:
        draw.line((eye_x - 3 * SCALE, head_y + 1 * SCALE, eye_x + 3 * SCALE, head_y + 1 * SCALE), fill=outline, width=2 * SCALE)
    else:
        draw.ellipse(
            (eye_x - 3 * SCALE, head_y - 2 * SCALE, eye_x + 3 * SCALE, head_y + 5 * SCALE),
            fill=outline,
        )
    ear_x = cx - side * 25 * SCALE
    draw.ellipse(
        (ear_x - 5 * SCALE, head_y - 2 * SCALE, ear_x + 5 * SCALE, head_y + 11 * SCALE),
        fill=skin_hi,
        outline=outline,
        width=2 * SCALE,
    )
    mouth_a = cx + side * 7 * SCALE
    mouth_b = cx + side * 23 * SCALE
    draw.arc(
        (min(mouth_a, mouth_b), head_y + 7 * SCALE, max(mouth_a, mouth_b), head_y + 19 * SCALE),
        25,
        150,
        fill=(128, 61, 51, 255),
        width=3 * SCALE,
    )

    return image.resize((FRAME_W, FRAME_H), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.1))


def player_atlas() -> tuple[Image.Image, dict[str, object]]:
    frames: list[tuple[str, Image.Image]] = []
    for direction in ("left", "right"):
        for frame in range(4):
            frames.append((f"idle-{direction}-{frame}", player_frame(direction, frame, idle=True)))
        for frame in range(10):
            frames.append((f"walk-{direction}-{frame}", player_frame(direction, frame, idle=False)))

    columns = 7
    rows = math.ceil(len(frames) / columns)
    atlas = Image.new("RGBA", (columns * FRAME_W, rows * FRAME_H), (0, 0, 0, 0))
    data: dict[str, object] = {
        "frames": {},
        "meta": {
            "app": "BokuNoJihanki M1.4 generator",
            "version": "1.0",
            "image": "player-atlas.webp",
            "format": "RGBA8888",
            "size": {"w": columns * FRAME_W, "h": rows * FRAME_H},
            "scale": "1",
        },
    }
    frame_map = data["frames"]
    assert isinstance(frame_map, dict)
    for index, (name, frame_image) in enumerate(frames):
        x = (index % columns) * FRAME_W
        y = (index // columns) * FRAME_H
        atlas.alpha_composite(frame_image, (x, y))
        frame_map[name] = {
            "frame": {"x": x, "y": y, "w": FRAME_W, "h": FRAME_H},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME_W, "h": FRAME_H},
            "sourceSize": {"w": FRAME_W, "h": FRAME_H},
        }
    return atlas, data


def generate() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    generated: list[str] = []
    area_manifest: dict[str, object] = {}

    for area_id in AREAS:
        base = runtime_panorama(area_id)
        for phase in PHASES:
            filename = f"bg-{area_id}-{phase}.webp"
            save_webp(phase_grade(base, area_id, phase), OUTPUT / filename)
            generated.append(filename)
        foreground_name = f"fg-{area_id}.webp"
        save_webp(foreground_for(area_id), OUTPUT / foreground_name, lossless=True)
        generated.append(foreground_name)
        area_manifest[area_id] = {
            "worldWidth": AREAS[area_id]["width"],
            "groundY": AREAS[area_id]["groundY"],
            "master": f"tools/art/m14-source/{AREAS[area_id]['master']}",
            "foreground": foreground_name,
        }

    atlas, atlas_json = player_atlas()
    save_webp(atlas, OUTPUT / "player-atlas.webp", lossless=True)
    (OUTPUT / "player-atlas.json").write_text(
        json.dumps(atlas_json, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    generated.extend(("player-atlas.webp", "player-atlas.json"))

    manifest = {
        "version": "0.1.4",
        "revision": "M1.4",
        "style": "original painterly side-scroll Japanese summer town",
        "license": "Project-original BokuNoJihanki assets",
        "generator": "OpenAI built-in image generation masters + deterministic Pillow post-process",
        "pipeline": "three distinct masters, four time phases, area foregrounds, 28-frame side-view player atlas",
        "areas": area_manifest,
        "player": {
            "directions": ["left", "right"],
            "idleFramesPerDirection": 4,
            "walkFramesPerDirection": 10,
            "contactFrames": [2, 7],
        },
        "files": sorted(generated),
    }
    (OUTPUT / "asset-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    generate()
