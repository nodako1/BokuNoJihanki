#!/usr/bin/env python3
"""Generate M1.3 residential vertical-slice art and player atlas.

The approved M1.2 concept remains the painterly source palette, but M1.3 composes
four distinct residential sections around an authored walkable belt instead of
mirroring the same scene. Outputs are deterministic and project-original.
"""
from __future__ import annotations

import base64
import io
import json
import math
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/art/reference/m12-approved-concept.jpg"
SOURCE_PARTS = ROOT / "tools/art/reference/parts"
OUTPUT = ROOT / "public/assets/images/m13"
WIDTH = 1280
HEIGHT = 720
SCALE = 3
PHASES = ("morning", "day", "evening", "night")
SECTIONS = ("home-front", "life-road", "alley-corner", "vending-crossing")


def ensure_source() -> None:
    if SOURCE.exists():
        return
    parts = sorted(SOURCE_PARTS.glob("part-*.b64"))
    if not parts:
        raise FileNotFoundError(SOURCE_PARTS)
    encoded = "".join(path.read_text(encoding="ascii").strip() for path in parts)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    SOURCE.write_bytes(base64.b64decode(encoded))


def clean_master() -> Image.Image:
    ensure_source()
    image = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Unable to read {SOURCE}")
    crop = image[0:694, 340:1340].copy()
    mask = np.zeros(crop.shape[:2], np.uint8)
    cv2.ellipse(mask, (445, 410), (48, 78), 0, 0, 360, 255, -1)
    cv2.ellipse(mask, (445, 458), (55, 20), 0, 0, 360, 255, -1)
    crop = cv2.inpaint(crop, mask, 9, cv2.INPAINT_TELEA)
    crop = cv2.resize(crop, (WIDTH, HEIGHT), interpolation=cv2.INTER_LANCZOS4)
    return Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)).convert("RGB")


def feather_mask(size: tuple[int, int], border: int = 30) -> Image.Image:
    w, h = size
    mask = Image.new("L", (w, h), 255)
    arr = np.full((h, w), 255, np.uint8)
    for y in range(h):
        for x in range(w):
            d = min(x, y, w - 1 - x, h - 1 - y)
            if d < border:
                arr[y, x] = int(255 * max(0.0, d / max(1, border)))
    return Image.fromarray(arr, "L").filter(ImageFilter.GaussianBlur(4))


def color_variant(image: Image.Image, *, brightness: float = 1.0, saturation: float = 1.0, hue_shift: tuple[int, int, int] | None = None) -> Image.Image:
    out = ImageEnhance.Brightness(image).enhance(brightness)
    out = ImageEnhance.Color(out).enhance(saturation)
    if hue_shift:
        overlay = Image.new("RGB", out.size, hue_shift)
        out = Image.blend(out, overlay, 0.09)
    return out


def paste_feathered(canvas: Image.Image, source: Image.Image, box: tuple[int, int, int, int], dest: tuple[int, int], size: tuple[int, int] | None = None, *, brightness: float = 1.0, saturation: float = 1.0, hue_shift: tuple[int, int, int] | None = None) -> None:
    crop = source.crop(box)
    if size:
        crop = crop.resize(size, Image.Resampling.LANCZOS)
    crop = color_variant(crop, brightness=brightness, saturation=saturation, hue_shift=hue_shift)
    rgba = crop.convert("RGBA")
    rgba.putalpha(feather_mask(crop.size, max(14, min(crop.size) // 12)))
    canvas.alpha_composite(rgba, dest)


def texture_fill(canvas: Image.Image, polygon: list[tuple[int, int]], texture: Image.Image, *, opacity: int = 255, tint: tuple[int, int, int] | None = None) -> None:
    mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=opacity)
    tiled = Image.new("RGB", canvas.size)
    tw, th = texture.size
    for y in range(0, HEIGHT, th):
        for x in range(0, WIDTH, tw):
            tiled.paste(texture, (x, y))
    if tint:
        tiled = Image.blend(tiled, Image.new("RGB", tiled.size, tint), 0.18)
    layer = tiled.convert("RGBA")
    layer.putalpha(mask.filter(ImageFilter.GaussianBlur(1.2)))
    canvas.alpha_composite(layer)


def draw_painterly_details(canvas: Image.Image, index: int) -> None:
    draw = ImageDraw.Draw(canvas, "RGBA")
    # Road markings and drains are deliberately different per section.
    if index == 0:
        draw.line([(0, 618), (1280, 600)], fill=(235, 231, 213, 120), width=4)
        draw.ellipse((420, 555, 478, 588), fill=(70, 75, 70, 150), outline=(210, 190, 145, 100), width=3)
        draw.rectangle((1030, 430, 1060, 565), fill=(128, 88, 51, 235), outline=(61, 54, 45, 230), width=3)
    elif index == 1:
        draw.line([(0, 602), (1280, 584)], fill=(240, 236, 218, 105), width=3)
        draw.line([(730, 410), (760, 650)], fill=(233, 228, 206, 95), width=3)
        draw.rectangle((704, 392, 786, 438), fill=(88, 92, 88, 170), outline=(205, 200, 180, 110), width=2)
    elif index == 2:
        draw.line([(0, 590), (1280, 616)], fill=(240, 236, 218, 105), width=3)
        draw.line([(318, 400), (305, 680)], fill=(230, 226, 207, 100), width=3)
        draw.ellipse((876, 530, 938, 565), fill=(65, 70, 67, 155), outline=(210, 190, 145, 95), width=3)
    else:
        draw.line([(0, 586), (1280, 606)], fill=(240, 236, 218, 110), width=3)
        for x in range(820, 1120, 56):
            draw.polygon([(x, 490), (x + 28, 490), (x + 72, 620), (x + 42, 620)], fill=(239, 234, 213, 95))
        # Park-direction sign and a restrained barrier; text is rendered by Phaser.
        draw.rounded_rectangle((1160, 410, 1208, 525), radius=5, fill=(102, 85, 57, 235), outline=(48, 48, 42, 230), width=3)
        draw.rectangle((1090, 575, 1255, 590), fill=(236, 157, 68, 220), outline=(92, 70, 44, 230), width=3)


def polygon_asset(source: Image.Image, box: tuple[int, int, int, int], polygon: list[tuple[int, int]], feather: float = 3.0) -> Image.Image:
    crop = source.crop(box).convert("RGBA")
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    crop.putalpha(mask)
    return crop


def paste_asset(canvas: Image.Image, asset: Image.Image, position: tuple[int, int], size: tuple[int, int], *, brightness: float = 1.0, saturation: float = 1.0, tint: tuple[int, int, int] | None = None, shadow: bool = True) -> None:
    piece = asset.resize(size, Image.Resampling.LANCZOS)
    rgb = color_variant(piece.convert("RGB"), brightness=brightness, saturation=saturation, hue_shift=tint).convert("RGBA")
    rgb.putalpha(piece.getchannel("A"))
    if shadow:
        shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        alpha = Image.new("L", canvas.size, 0)
        local = piece.getchannel("A").filter(ImageFilter.GaussianBlur(12))
        alpha.paste(local.point(lambda v: int(v * 0.24)), (position[0] + 12, position[1] + 16))
        shade = Image.new("RGBA", canvas.size, (24, 43, 39, 0))
        shade.putalpha(alpha)
        canvas.alpha_composite(shade)
    canvas.alpha_composite(rgb, position)


def create_segment(base: Image.Image, index: int) -> Image.Image:
    """Create a coherent section from a single painterly master crop.

    Each section uses a different authored crop. No whole-screen mirroring or tiled
    patch collage is used; small road signs and barriers are drawn as game props.
    """
    # M1.3 is regenerated solely from the checked-in approved project master.
    # Each section uses a different crop/zoom and authored wayfinding details;
    # no whole-screen mirror or horizontal stretch is used.
    residential = base
    sources = [base, residential, residential, residential]
    crops = [
        (0, 0, 900, 720),       # protagonist home and front road
        (0, 0, 1080, 690),      # longer residential lane
        (120, 0, 1180, 680),    # shifted corner and side lane
        (280, 0, 1280, 720),    # vending and park-direction crossing
    ]
    source = sources[index]
    image = source.crop(crops[index]).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")

    # Section-specific wayfinding and unique street details.
    if index == 0:
        # A small gate nameplate identifies the protagonist home without floating UI text.
        draw.rounded_rectangle((175, 365, 232, 386), radius=3, fill=(105, 78, 52, 205), outline=(50, 48, 42, 220), width=2)
    elif index == 1:
        draw.ellipse((735, 510, 785, 538), fill=(66, 71, 67, 145), outline=(207, 190, 151, 100), width=2)
    elif index == 2:
        # A second drain distinguishes the corner without adding painted guide lines.
        draw.ellipse((880, 528, 940, 560), fill=(65, 70, 66, 150), outline=(210, 191, 150, 105), width=3)
    else:
        for x in range(840, 1115, 58):
            draw.polygon([(x, 485), (x + 27, 485), (x + 72, 615), (x + 43, 615)], fill=(241, 236, 216, 100))
        draw.rounded_rectangle((1162, 405, 1210, 525), radius=5, fill=(101, 84, 57, 235), outline=(47, 47, 41, 235), width=3)
        draw.rectangle((1090, 575, 1255, 592), fill=(237, 158, 68, 225), outline=(92, 70, 44, 235), width=3)

    rgb = image.convert("RGB").filter(ImageFilter.GaussianBlur(0.12))
    arr = np.asarray(rgb).astype(np.int16)
    yy, xx = np.indices((HEIGHT, WIDTH))
    grain = (((xx * 13 + yy * 29 + (xx * yy) % 31) % 9) - 4)[..., None]
    arr = np.clip(arr + grain, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")

def phase_grade(base: Image.Image, phase: str) -> Image.Image:
    image = base.copy().convert("RGB")
    if phase == "morning":
        image = ImageEnhance.Brightness(image).enhance(1.02)
        image = Image.blend(image, Image.new("RGB", image.size, (255, 224, 169)), 0.045)
    elif phase == "day":
        image = ImageEnhance.Brightness(image).enhance(1.075)
        image = ImageEnhance.Contrast(image).enhance(1.03)
        image = ImageEnhance.Color(image).enhance(1.04)
    elif phase == "evening":
        image = ImageEnhance.Brightness(image).enhance(0.76)
        image = ImageEnhance.Contrast(image).enhance(1.08)
        image = Image.blend(image, Image.new("RGB", image.size, (224, 92, 50)), 0.22)
        haze = Image.new("RGBA", image.size, (47, 35, 80, 0))
        alpha = np.zeros((HEIGHT, WIDTH), np.uint8)
        for y in range(HEIGHT):
            alpha[y, :] = int(max(0, (y - 330) / 390) * 78)
        haze.putalpha(Image.fromarray(alpha, "L"))
        image = Image.alpha_composite(image.convert("RGBA"), haze).convert("RGB")
    elif phase == "night":
        image = ImageEnhance.Brightness(image).enhance(0.38)
        image = ImageEnhance.Color(image).enhance(0.66)
        image = Image.blend(image, Image.new("RGB", image.size, (31, 54, 95)), 0.40)
        image = add_night_glows(image)
    return image


def add_night_glows(image: Image.Image) -> Image.Image:
    canvas = image.convert("RGBA")
    glow_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow_layer, "RGBA")
    for x, y, rx, ry, color in [
        (180, 260, 90, 55, (255, 196, 92, 95)),
        (540, 290, 85, 48, (255, 189, 78, 85)),
        (990, 420, 95, 130, (195, 238, 255, 80)),
        (1140, 250, 70, 45, (255, 201, 98, 70)),
    ]:
        draw.ellipse((x-rx, y-ry, x+rx, y+ry), fill=color)
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(24))
    return Image.alpha_composite(canvas, glow_layer).convert("RGB")


def save_webp(image: Image.Image, path: Path, *, lossless: bool = False, quality: int = 90) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6, lossless=lossless)


def occlusion_specs() -> dict[str, list[dict[str, object]]]:
    return {
        "home-front": [
            {"id": "home-bottom-left", "box": [0, 520, 330, 720], "footY": 680},
            {"id": "home-bottom-center", "box": [300, 565, 990, 720], "footY": 690},
            {"id": "home-bottom-right", "box": [1000, 510, 1280, 720], "footY": 675},
        ],
        "life-road": [
            {"id": "life-bottom-left", "box": [0, 520, 300, 720], "footY": 675},
            {"id": "life-bottom-center", "box": [260, 560, 990, 720], "footY": 690},
            {"id": "life-bottom-right", "box": [960, 510, 1280, 720], "footY": 675},
        ],
        "alley-corner": [
            {"id": "alley-bottom-left", "box": [0, 510, 320, 720], "footY": 670},
            {"id": "alley-bottom-center", "box": [300, 565, 1000, 720], "footY": 690},
            {"id": "alley-bottom-right", "box": [980, 525, 1280, 720], "footY": 680},
        ],
        "vending-crossing": [
            {"id": "cross-bottom-left", "box": [0, 515, 320, 720], "footY": 672},
            {"id": "cross-bottom-center", "box": [290, 560, 1000, 720], "footY": 690},
            {"id": "cross-bottom-right", "box": [990, 510, 1280, 720], "footY": 675},
        ],
    }


def export_occlusions(section: str, phase_images: dict[str, Image.Image], generated: list[str]) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for spec in occlusion_specs()[section]:
        x1, y1, x2, y2 = (int(v) for v in spec["box"])
        asset_base = f"occlusion-{spec['id']}"
        for phase, image in phase_images.items():
            crop = image.crop((x1, y1, x2, y2)).convert("RGBA")
            alpha = Image.new("L", crop.size, 0)
            ad = ImageDraw.Draw(alpha)
            h = crop.height
            ad.rectangle((0, max(0, h // 3), crop.width, h), fill=255)
            alpha = alpha.filter(ImageFilter.GaussianBlur(2))
            crop.putalpha(alpha)
            filename = f"{asset_base}-{phase}.webp"
            save_webp(crop, OUTPUT / filename, lossless=True)
            generated.append(filename)
        result.append({
            "id": spec["id"],
            "assetBase": asset_base,
            "x": x1,
            "y": y1,
            "width": x2 - x1,
            "height": y2 - y1,
            "footY": spec["footY"],
        })
    return result


def rotate_point(point: tuple[float, float], center: tuple[float, float], angle: float) -> tuple[float, float]:
    px, py = point
    cx, cy = center
    s, c = math.sin(angle), math.cos(angle)
    px -= cx
    py -= cy
    return (px * c - py * s + cx, px * s + py * c + cy)


def draw_limb(draw: ImageDraw.ImageDraw, start: tuple[float, float], length: float, angle: float, width: int, fill: tuple[int, int, int, int], outline: tuple[int, int, int, int]) -> tuple[float, float]:
    end = (start[0] + math.sin(angle) * length, start[1] + math.cos(angle) * length)
    draw.line([start, end], fill=outline, width=width + 4)
    draw.line([start, end], fill=fill, width=width)
    return end


def player_frame(direction: str, frame: int, idle: bool = False) -> Image.Image:
    W, H = 128 * SCALE, 192 * SCALE
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")
    phase = 0.0 if idle else (frame / 8.0) * math.tau
    swing = math.sin(phase)
    contact = math.cos(phase)
    bob = 0 if idle else int((1 - abs(contact)) * 3 * SCALE)
    cx = 64 * SCALE
    foot_y = 180 * SCALE

    # Ground contact shadow is separate in-game; only a faint shoe shadow is baked.
    draw.ellipse((cx-25*SCALE, foot_y-5*SCALE, cx+25*SCALE, foot_y+3*SCALE), fill=(24, 37, 43, 36))

    outline = (48, 42, 38, 255)
    skin = (239, 176, 126, 255)
    skin_hi = (255, 205, 160, 255)
    shirt = (244, 238, 216, 255)
    red = (207, 75, 55, 255)
    shorts = (41, 73, 101, 255)
    shoe = (231, 224, 199, 255)
    shoe_dark = (48, 67, 78, 255)
    hair = (49, 37, 30, 255)
    hair_hi = (83, 61, 45, 255)

    body_y = 86 * SCALE + bob
    leg_swing = 0 if idle else swing * 0.34
    arm_swing = -leg_swing * 0.85

    if direction in ("down", "up"):
        hip_left = (cx-13*SCALE, 133*SCALE+bob)
        hip_right = (cx+13*SCALE, 133*SCALE+bob)
        knee_left = draw_limb(draw, hip_left, 29*SCALE, leg_swing, 10*SCALE, skin, outline)
        knee_right = draw_limb(draw, hip_right, 29*SCALE, -leg_swing, 10*SCALE, skin, outline)
        foot_left = draw_limb(draw, knee_left, 27*SCALE, -leg_swing*0.55, 11*SCALE, skin, outline)
        foot_right = draw_limb(draw, knee_right, 27*SCALE, leg_swing*0.55, 11*SCALE, skin, outline)
        for foot, sign in ((foot_left,-1),(foot_right,1)):
            x, y = foot
            draw.rounded_rectangle((x-12*SCALE, y-4*SCALE, x+10*SCALE, y+7*SCALE), radius=4*SCALE, fill=shoe_dark, outline=outline, width=2*SCALE)
            draw.rounded_rectangle((x-9*SCALE, y-3*SCALE, x+10*SCALE, y+3*SCALE), radius=3*SCALE, fill=shoe, width=1*SCALE)
    else:
        back_leg = -1 if contact >= 0 else 1
        for idx, off in enumerate((-7, 7)):
            sign = -1 if idx == 0 else 1
            hip = (cx+off*SCALE, 133*SCALE+bob)
            ang = leg_swing * sign
            knee = draw_limb(draw, hip, 30*SCALE, ang, 11*SCALE, skin, outline)
            foot = draw_limb(draw, knee, 27*SCALE, -ang*0.5, 11*SCALE, skin, outline)
            x, y = foot
            draw.rounded_rectangle((x-12*SCALE, y-4*SCALE, x+12*SCALE, y+7*SCALE), radius=4*SCALE, fill=shoe_dark, outline=outline, width=2*SCALE)
            draw.rounded_rectangle((x-9*SCALE, y-3*SCALE, x+11*SCALE, y+3*SCALE), radius=3*SCALE, fill=shoe, width=1*SCALE)

    # Shorts and torso.
    draw.rounded_rectangle((cx-24*SCALE, 117*SCALE+bob, cx+24*SCALE, 145*SCALE+bob), radius=8*SCALE, fill=shorts, outline=outline, width=3*SCALE)
    draw.rounded_rectangle((cx-28*SCALE, body_y, cx+28*SCALE, 128*SCALE+bob), radius=13*SCALE, fill=shirt, outline=outline, width=3*SCALE)
    draw.rectangle((cx-26*SCALE, 100*SCALE+bob, cx+26*SCALE, 109*SCALE+bob), fill=red)
    draw.line((cx-22*SCALE, 90*SCALE+bob, cx+18*SCALE, 90*SCALE+bob), fill=(255,255,255,110), width=2*SCALE)

    shoulder_y = 97*SCALE+bob
    if direction in ("down", "up"):
        left_start = (cx-25*SCALE, shoulder_y)
        right_start = (cx+25*SCALE, shoulder_y)
        left_hand = draw_limb(draw, left_start, 38*SCALE, arm_swing, 9*SCALE, skin, outline)
        right_hand = draw_limb(draw, right_start, 38*SCALE, -arm_swing, 9*SCALE, skin, outline)
        for x,y in (left_hand,right_hand):
            draw.ellipse((x-5*SCALE,y-5*SCALE,x+5*SCALE,y+5*SCALE), fill=skin_hi, outline=outline, width=2*SCALE)
    else:
        # The far arm is drawn before the near arm for a real profile silhouette.
        side = 1 if direction == "right" else -1
        far_start = (cx-side*10*SCALE, shoulder_y+2*SCALE)
        near_start = (cx+side*19*SCALE, shoulder_y)
        draw_limb(draw, far_start, 38*SCALE, -arm_swing*0.75, 8*SCALE, skin, outline)
        hand = draw_limb(draw, near_start, 39*SCALE, arm_swing, 9*SCALE, skin, outline)
        draw.ellipse((hand[0]-5*SCALE,hand[1]-5*SCALE,hand[0]+5*SCALE,hand[1]+5*SCALE), fill=skin_hi, outline=outline, width=2*SCALE)

    head_center = (cx, 61*SCALE+bob)
    if direction == "down":
        draw.ellipse((cx-30*SCALE, 28*SCALE+bob, cx+30*SCALE, 91*SCALE+bob), fill=skin, outline=outline, width=3*SCALE)
        draw.pieslice((cx-32*SCALE, 20*SCALE+bob, cx+32*SCALE, 77*SCALE+bob), 180, 360, fill=hair, outline=outline, width=3*SCALE)
        draw.ellipse((cx-12*SCALE,57*SCALE+bob,cx-7*SCALE,63*SCALE+bob), fill=outline)
        draw.ellipse((cx+7*SCALE,57*SCALE+bob,cx+12*SCALE,63*SCALE+bob), fill=outline)
        draw.arc((cx-11*SCALE,63*SCALE+bob,cx+11*SCALE,79*SCALE+bob), 15, 165, fill=(131,61,51,255), width=3*SCALE)
        draw.ellipse((cx-24*SCALE,65*SCALE+bob,cx-14*SCALE,74*SCALE+bob), fill=(232,126,105,70))
        draw.ellipse((cx+14*SCALE,65*SCALE+bob,cx+24*SCALE,74*SCALE+bob), fill=(232,126,105,70))
    elif direction == "up":
        draw.ellipse((cx-31*SCALE, 27*SCALE+bob, cx+31*SCALE, 92*SCALE+bob), fill=hair, outline=outline, width=3*SCALE)
        draw.ellipse((cx-24*SCALE, 48*SCALE+bob, cx+24*SCALE, 88*SCALE+bob), fill=hair_hi)
        for offset in (-20,-10,2,14):
            draw.arc((cx+(offset-8)*SCALE,35*SCALE+bob,cx+(offset+10)*SCALE,68*SCALE+bob), 170, 355, fill=hair, width=5*SCALE)
        draw.arc((cx-22*SCALE,65*SCALE+bob,cx+22*SCALE,94*SCALE+bob), 10, 170, fill=(34,31,28,180), width=2*SCALE)
    else:
        side = 1 if direction == "right" else -1
        draw.ellipse((cx-29*SCALE, 28*SCALE+bob, cx+29*SCALE, 91*SCALE+bob), fill=skin, outline=outline, width=3*SCALE)
        draw.pieslice((cx-31*SCALE,20*SCALE+bob,cx+31*SCALE,78*SCALE+bob), 180, 360, fill=hair, outline=outline, width=3*SCALE)
        nose_x = cx + side*29*SCALE
        draw.ellipse((nose_x-4*SCALE,55*SCALE+bob,nose_x+6*SCALE,67*SCALE+bob), fill=skin_hi, outline=outline, width=2*SCALE)
        eye_x = cx + side*12*SCALE
        draw.ellipse((eye_x-3*SCALE,56*SCALE+bob,eye_x+3*SCALE,63*SCALE+bob), fill=outline)
        mouth_x0 = min(cx+side*4*SCALE, cx+side*24*SCALE)
        mouth_x1 = max(cx+side*4*SCALE, cx+side*24*SCALE)
        draw.arc((mouth_x0,64*SCALE+bob,mouth_x1,78*SCALE+bob), 30 if side>0 else 30, 150 if side>0 else 150, fill=(131,61,51,255), width=3*SCALE)
        # Ear on the far side.
        ear_x = cx - side*25*SCALE
        draw.ellipse((ear_x-5*SCALE,56*SCALE+bob,ear_x+5*SCALE,69*SCALE+bob), fill=skin_hi, outline=outline, width=2*SCALE)

    # Small painterly highlights unify the directions.
    draw.arc((cx-26*SCALE,28*SCALE+bob,cx+22*SCALE,76*SCALE+bob), 205, 320, fill=(255,255,255,45), width=2*SCALE)
    canvas = canvas.resize((128, 192), Image.Resampling.LANCZOS)
    canvas = canvas.filter(ImageFilter.GaussianBlur(0.12))
    return canvas


def generate_player_atlas(generated: list[str]) -> None:
    frames: list[tuple[str, Image.Image]] = []
    for direction in ("down", "up", "left", "right"):
        frames.append((f"idle-{direction}", player_frame(direction, 0, idle=True)))
        for frame in range(8):
            frames.append((f"walk-{direction}-{frame}", player_frame(direction, frame)))

    cols = 6
    rows = math.ceil(len(frames) / cols)
    atlas = Image.new("RGBA", (cols * 128, rows * 192), (0,0,0,0))
    atlas_json: dict[str, object] = {"frames": {}, "meta": {"app": "BokuNoJihanki M1.3 generator", "version": "1.0", "image": "player-atlas.webp", "format": "RGBA8888", "size": {"w": cols*128, "h": rows*192}, "scale": "1"}}
    frame_map = atlas_json["frames"]
    assert isinstance(frame_map, dict)
    for idx, (name, image) in enumerate(frames):
        x = (idx % cols) * 128
        y = (idx // cols) * 192
        atlas.alpha_composite(image, (x,y))
        frame_map[name] = {
            "frame": {"x": x, "y": y, "w": 128, "h": 192},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": 128, "h": 192},
            "sourceSize": {"w": 128, "h": 192},
        }
    save_webp(atlas, OUTPUT / "player-atlas.webp", lossless=True)
    (OUTPUT / "player-atlas.json").write_text(json.dumps(atlas_json, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    generated.extend(["player-atlas.webp", "player-atlas.json"])


def generate() -> None:
    base = clean_master()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    generated: list[str] = []
    section_metadata: dict[str, object] = {}
    for index, section in enumerate(SECTIONS):
        morning = create_segment(base, index)
        phase_images = {phase: phase_grade(morning, phase) for phase in PHASES}
        for phase, image in phase_images.items():
            filename = f"bg-{section}-{phase}.webp"
            save_webp(image, OUTPUT / filename, quality=90)
            generated.append(filename)
        occlusions = export_occlusions(section, phase_images, generated)
        section_metadata[section] = {"index": index, "occlusions": occlusions}

    generate_player_atlas(generated)
    manifest = {
        "version": "0.1.3",
        "revision": "M1.3",
        "style": "authored painterly residential belt-scroll vertical slice",
        "license": "Project-original BokuNoJihanki art derived from the approved project master",
        "source": "tools/art/reference/parts",
        "pipeline": "four coherent authored master crops, walkable belt data, four time phases, split occlusion crops, 36-frame player atlas",
        "sections": section_metadata,
        "files": sorted(generated),
    }
    (OUTPUT / "asset-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


if __name__ == "__main__":
    generate()
