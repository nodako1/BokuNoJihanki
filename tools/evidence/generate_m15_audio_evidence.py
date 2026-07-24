#!/usr/bin/env python3
"""Generate fresh, reproducible M1.5 audio Evidence.

The checked-in independent validator is executed on every run.  Its fresh
4x-oversampled true-peak result is embedded in ``analysis.json`` and checked
against the exact PCM used to draw the waveform, spectrogram, and loop-boundary
figures.  The output directory must be empty so Evidence from different
candidates cannot be mixed accidentally.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import re
import shlex
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import scipy
from PIL import Image, ImageDraw, __version__ as pillow_version
from scipy.signal import stft

ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = Path(__file__).resolve()
VALIDATOR_PATH = ROOT / "tools/audio/m15/validate_m15_bgm.py"
TRACKED_ANALYSIS_PATH = ROOT / "public/assets/audio/m15/analysis.json"
SCORE_PATH = ROOT / "tools/audio/m15/score.json"
PROVENANCE_PATH = ROOT / "tools/audio/m15/provenance.json"
GENERATOR_PATH = ROOT / "tools/audio/m15/generate_m15_bgm.py"

GENERATED_FILENAMES = (
    "analysis.json",
    "waveform.png",
    "spectrogram.png",
    "loop-boundary.png",
    "sha256-manifest.json",
)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
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


def command_output(command: list[str], *, binary: bool = False) -> bytes | str:
    result = subprocess.run(command, check=True, capture_output=True)
    if binary:
        return result.stdout
    return result.stdout.decode("utf-8", errors="strict").strip()


def version_line(command: list[str]) -> str:
    return str(command_output(command)).splitlines()[0]


def git_output(*arguments: str) -> str:
    return str(command_output(["git", "-C", str(ROOT), *arguments]))


def prepare_output_directory(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if resolved.exists() and any(resolved.iterdir()):
        raise SystemExit(
            f"Refusing non-empty Evidence directory: {resolved}. "
            "Choose a fresh directory to avoid mixing candidate results.",
        )
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def run_independent_validator(temporary_directory: Path) -> dict[str, Any]:
    result_path = temporary_directory / "independent-validation.json"
    subprocess.run(
        [
            sys.executable,
            str(VALIDATOR_PATH),
            "--output",
            str(result_path),
            "--compact",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    result = load_json(result_path)
    if not result["allChecksPassed"]:
        failed = [name for name, passed in result["checks"].items() if not passed]
        raise RuntimeError(f"Independent M1.5 audio validation failed: {failed}")
    if int(result["signal"]["truePeakOversampleFactor"]) < 4:
        raise RuntimeError("Independent true-peak analysis used less than 4x oversampling")
    return result


def decode_pcm(path: Path, sample_rate: int, channels: int) -> np.ndarray:
    payload = command_output(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-i",
            str(path),
            "-map",
            "0:a:0",
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "-ar",
            str(sample_rate),
            "-ac",
            str(channels),
            "-",
        ],
        binary=True,
    )
    assert isinstance(payload, bytes)
    samples = np.frombuffer(payload, dtype="<f4")
    if samples.size == 0 or samples.size % channels:
        raise RuntimeError("Decoded PCM does not contain complete non-empty frames")
    return samples.reshape((-1, channels)).astype(np.float64)


def dbfs(value: float) -> float:
    return 20.0 * math.log10(max(value, 1e-12))


def verify_visualization_pcm(
    pcm: np.ndarray,
    sample_rate: int,
    validation: dict[str, Any],
) -> dict[str, Any]:
    expected = validation["format"]
    signal = validation["signal"]
    loop = validation["loop"]
    duration = pcm.shape[0] / sample_rate
    sample_peak = float(np.max(np.abs(pcm)))
    dc_offset = np.mean(pcm, axis=0)
    boundary_by_channel = np.abs(pcm[0] - pcm[-1])
    boundary_jump = float(np.max(boundary_by_channel))

    checks = {
        "decodedFramesMatchValidator": pcm.shape[0] == int(expected["decodedFrames"]),
        "channelsMatchValidator": pcm.shape[1] == int(expected["channels"]),
        "durationMatchesValidator": abs(
            duration - float(expected["durationSeconds"]),
        ) <= 1.0 / sample_rate,
        "samplePeakMatchesValidator": abs(
            dbfs(sample_peak) - float(signal["samplePeakDbfs"]),
        ) <= 0.001,
        "dcMatchesValidator": all(
            abs(float(actual) - float(reference)) <= 1e-8
            for actual, reference in zip(
                dc_offset,
                signal["dcOffset"],
                strict=True,
            )
        ),
        "loopBoundaryMatchesValidator": abs(
            boundary_jump - float(loop["boundaryJump"]),
        ) <= 1e-7,
        "validatorTruePeakIs4xOrGreater": (
            int(signal["truePeakOversampleFactor"]) >= 4
        ),
    }
    if not all(checks.values()):
        failed = [name for name, passed in checks.items() if not passed]
        raise RuntimeError(f"Visualization PCM differs from validator PCM: {failed}")
    return {
        "checks": checks,
        "samplePeakDbfs": round(dbfs(sample_peak), 6),
        "dcOffset": [round(float(value), 10) for value in dc_offset],
        "loopBoundaryJump": round(boundary_jump, 9),
    }


def circular_segment(
    pcm: np.ndarray,
    center_frame: int,
    radius_frames: int,
) -> np.ndarray:
    indexes = np.arange(center_frame - radius_frames, center_frame + radius_frames)
    return pcm[np.mod(indexes, pcm.shape[0])]


def measurement_positions(
    pcm: np.ndarray,
    sample_rate: int,
    duration: float,
) -> dict[str, Any]:
    window_radius = max(1, round(sample_rate * 0.01))
    requested = {
        "start": 0.0,
        "middle": duration / 2.0,
        "loopBefore": duration - 0.05,
        "loopAfter": duration + 0.05,
    }
    positions: dict[str, Any] = {}
    for name, context_elapsed in requested.items():
        normalized = context_elapsed % duration
        frame = min(pcm.shape[0] - 1, round(normalized * sample_rate))
        segment = circular_segment(pcm, frame, window_radius)
        positions[name] = {
            "contextElapsedSeconds": round(context_elapsed, 9),
            "normalizedLoopOffsetSeconds": round(normalized, 9),
            "decodedFrameIndex": frame,
            "sample": [round(float(value), 9) for value in pcm[frame]],
            "windowSeconds": 0.02,
            "windowRmsDbfs": round(
                dbfs(float(np.sqrt(np.mean(np.square(segment))))),
                6,
            ),
            "windowSamplePeakDbfs": round(
                dbfs(float(np.max(np.abs(segment)))),
                6,
            ),
        }
    return positions


def draw_base(
    title: str,
    *,
    width: int = 1600,
    height: int = 640,
) -> tuple[Image.Image, ImageDraw.ImageDraw, tuple[int, int, int, int]]:
    image = Image.new("RGB", (width, height), "#101827")
    draw = ImageDraw.Draw(image)
    plot = (84, 48, width - 32, height - 62)
    draw.rectangle(plot, fill="#0a1020", outline="#718096", width=1)
    draw.text((plot[0], 15), title, fill="#f7fafc")
    return image, draw, plot


def draw_waveform(
    pcm: np.ndarray,
    sample_rate: int,
    output: Path,
) -> dict[str, Any]:
    image, draw, plot = draw_base("M1.5 BGM waveform (decoded stereo PCM)")
    left, top, right, bottom = plot
    width = right - left
    panel_height = (bottom - top) // 2
    colors = ("#64d8cb", "#f6ad55")
    duration = pcm.shape[0] / sample_rate

    edges = np.linspace(0, pcm.shape[0], width + 1, dtype=np.int64)
    for channel in range(2):
        panel_top = top + channel * panel_height
        panel_bottom = top + (channel + 1) * panel_height
        center = (panel_top + panel_bottom) / 2
        amplitude = panel_height * 0.44
        draw.line((left, center, right, center), fill="#334155", width=1)
        draw.text((left + 8, panel_top + 8), f"channel {channel + 1}", fill=colors[channel])
        for x in range(width):
            segment = pcm[edges[x] : edges[x + 1], channel]
            if segment.size == 0:
                continue
            minimum = float(np.min(segment))
            maximum = float(np.max(segment))
            draw.line(
                (
                    left + x,
                    center - maximum * amplitude,
                    left + x,
                    center - minimum * amplitude,
                ),
                fill=colors[channel],
                width=1,
            )
    for fraction in (0.0, 0.25, 0.5, 0.75, 1.0):
        x = left + round(width * fraction)
        draw.line((x, top, x, bottom), fill="#273449", width=1)
        draw.text(
            (x - 15, bottom + 9),
            f"{duration * fraction:.1f}s",
            fill="#cbd5e1",
        )
    image.save(output, format="PNG", optimize=True)
    return {
        "width": image.width,
        "height": image.height,
        "channels": 2,
        "durationSeconds": round(duration, 9),
        "envelopeColumns": width,
    }


def spectrogram_rgb(decibels: np.ndarray) -> np.ndarray:
    normalized = np.clip((decibels + 90.0) / 80.0, 0.0, 1.0)
    red = np.clip(3.2 * normalized - 1.1, 0.0, 1.0)
    green = np.clip(2.5 * normalized - 0.25, 0.0, 1.0)
    blue = np.clip(1.55 - 2.0 * normalized, 0.0, 1.0)
    return np.asarray(np.dstack((red, green, blue)) * 255.0, dtype=np.uint8)


def draw_spectrogram(
    pcm: np.ndarray,
    sample_rate: int,
    output: Path,
) -> dict[str, Any]:
    mono = np.mean(pcm, axis=1)
    frequencies, times, transform = stft(
        mono,
        fs=sample_rate,
        window="hann",
        nperseg=4096,
        noverlap=3072,
        boundary=None,
        padded=False,
    )
    maximum_frequency = 12_000
    selected = frequencies <= maximum_frequency
    decibels = 20.0 * np.log10(np.maximum(np.abs(transform[selected]), 1e-9))
    pixels = spectrogram_rgb(np.flipud(decibels))
    heatmap = Image.fromarray(pixels, mode="RGB")

    image, draw, plot = draw_base(
        "M1.5 BGM spectrogram (Hann 4096, 75% overlap, dBFS)",
    )
    left, top, right, bottom = plot
    heatmap = heatmap.resize(
        (right - left, bottom - top),
        resample=Image.Resampling.BILINEAR,
    )
    image.paste(heatmap, (left, top))
    draw.rectangle(plot, outline="#718096", width=1)
    for frequency in (0, 3_000, 6_000, 9_000, 12_000):
        y = bottom - round((bottom - top) * frequency / maximum_frequency)
        draw.line((left, y, right, y), fill="#ffffff40", width=1)
        draw.text((10, y - 6), f"{frequency // 1000}k", fill="#cbd5e1")
    duration = pcm.shape[0] / sample_rate
    for fraction in (0.0, 0.25, 0.5, 0.75, 1.0):
        x = left + round((right - left) * fraction)
        draw.line((x, top, x, bottom), fill="#ffffff30", width=1)
        draw.text((x - 15, bottom + 9), f"{duration * fraction:.1f}s", fill="#cbd5e1")
    image.save(output, format="PNG", optimize=True)
    return {
        "width": image.width,
        "height": image.height,
        "fftSize": 4096,
        "overlapFrames": 3072,
        "frequencyRangeHz": [0, maximum_frequency],
        "displayRangeDbfs": [-90, -10],
        "timeBins": int(times.size),
        "frequencyBins": int(np.count_nonzero(selected)),
    }


def draw_loop_boundary(
    pcm: np.ndarray,
    sample_rate: int,
    output: Path,
) -> dict[str, Any]:
    radius_seconds = 0.12
    radius_frames = round(radius_seconds * sample_rate)
    segment = np.concatenate((pcm[-radius_frames:], pcm[:radius_frames]), axis=0)
    image, draw, plot = draw_base(
        "M1.5 BGM loop boundary (tail -> head, decoded stereo PCM)",
    )
    left, top, right, bottom = plot
    center_y = (top + bottom) / 2
    amplitude = (bottom - top) * 0.43
    colors = ("#64d8cb", "#f6ad55")
    draw.line((left, center_y, right, center_y), fill="#334155", width=1)

    x_coordinates = np.linspace(left, right, segment.shape[0])
    for channel in range(2):
        points = [
            (float(x), center_y - float(value) * amplitude)
            for x, value in zip(x_coordinates, segment[:, channel], strict=True)
        ]
        draw.line(points, fill=colors[channel], width=2)
    center_x = left + (right - left) // 2
    draw.line((center_x, top, center_x, bottom), fill="#f56565", width=2)
    draw.text((center_x + 8, top + 8), "loop boundary", fill="#fed7d7")
    draw.text((left + 8, top + 8), "tail", fill="#cbd5e1")
    draw.text((right - 40, top + 8), "head", fill="#cbd5e1")
    for milliseconds in (-120, -60, 0, 60, 120):
        x = left + round(
            (right - left) * (milliseconds + 120) / 240,
        )
        draw.text((x - 18, bottom + 9), f"{milliseconds}ms", fill="#cbd5e1")
    image.save(output, format="PNG", optimize=True)
    return {
        "width": image.width,
        "height": image.height,
        "windowBeforeSeconds": radius_seconds,
        "windowAfterSeconds": radius_seconds,
        "boundaryJumpPerChannel": [
            round(float(value), 9) for value in np.abs(pcm[0] - pcm[-1])
        ],
    }


def manifest_entry(path: Path) -> dict[str, Any]:
    return {
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Generate fresh M1.5 audio analysis, waveform, spectrogram, "
            "loop-boundary, and SHA-256 Evidence files."
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="A new or empty output directory.",
    )
    parser.add_argument(
        "--expected-commit",
        required=True,
        help="The complete 40-character candidate commit SHA.",
    )
    arguments = parser.parse_args()
    expected_commit = arguments.expected_commit.strip().lower()
    if re.fullmatch(r"[0-9a-f]{40}", expected_commit) is None:
        raise SystemExit(
            "--expected-commit must be a complete 40-character Git SHA.",
        )
    actual_commit = git_output("rev-parse", "HEAD").lower()
    if actual_commit != expected_commit:
        raise SystemExit(
            "Refusing Evidence for a different candidate: "
            f"HEAD is {actual_commit}, expected {expected_commit}.",
        )
    git_status = git_output("status", "--short")
    if git_status:
        raise SystemExit(
            "Refusing audio Evidence from a dirty worktree:\n"
            f"{git_status}",
        )
    output_directory = prepare_output_directory(arguments.output_dir)

    with tempfile.TemporaryDirectory(prefix="boku-m15-audio-evidence-") as temporary:
        validation = run_independent_validator(Path(temporary))

    runtime_path = (ROOT / validation["runtimeFile"]).resolve()
    if ROOT not in runtime_path.parents:
        raise RuntimeError("Validated runtime audio path escapes the repository")
    if sha256(runtime_path) != validation["sha256"]:
        raise RuntimeError("Runtime audio changed after independent validation")

    sample_rate = int(validation["format"]["sampleRateHz"])
    channels = int(validation["format"]["channels"])
    pcm = decode_pcm(runtime_path, sample_rate, channels)
    crosscheck = verify_visualization_pcm(pcm, sample_rate, validation)
    duration = pcm.shape[0] / sample_rate

    waveform_path = output_directory / "waveform.png"
    spectrogram_path = output_directory / "spectrogram.png"
    loop_path = output_directory / "loop-boundary.png"
    image_details = {
        "waveform.png": draw_waveform(pcm, sample_rate, waveform_path),
        "spectrogram.png": draw_spectrogram(pcm, sample_rate, spectrogram_path),
        "loop-boundary.png": draw_loop_boundary(pcm, sample_rate, loop_path),
    }

    normalized_command = (
        "python3 tools/evidence/generate_m15_audio_evidence.py "
        "--expected-commit <FULL_CANDIDATE_SHA> --output-dir <OUTPUT_DIR>"
    )
    actual_command = shlex.join([sys.executable, *sys.argv])
    analysis_path = output_directory / "analysis.json"
    evidence_analysis = {
        "schemaVersion": 1,
        "generatedAtUtc": datetime.now(UTC).isoformat(),
        "candidate": {
            "gitHead": actual_commit,
            "expectedGitHead": expected_commit,
            "gitStatusShort": [],
        },
        "runtimeAudio": {
            "path": str(runtime_path.relative_to(ROOT)),
            "sha256": validation["sha256"],
        },
        "independentValidation": validation,
        "visualizationPcmCrosscheck": crosscheck,
        "measurementPositions": measurement_positions(
            pcm,
            sample_rate,
            duration,
        ),
        "images": image_details,
        "reproduction": {
            "workingDirectory": str(ROOT),
            "normalizedCommand": normalized_command,
            "executedCommand": actual_command,
            "outputDirectory": str(output_directory),
            "validatorCommand": (
                "python3 tools/audio/m15/validate_m15_bgm.py "
                "--output <TEMP_VALIDATION_JSON> --compact"
            ),
            "decodeCommand": (
                "ffmpeg -i <TRACKED_M15_M4A> -map 0:a:0 -f f32le "
                "-acodec pcm_f32le -ar 48000 -ac 2 -"
            ),
            "truePeakContract": (
                "Fresh independent validator result; circular PCM, "
                "scipy.signal.resample_poly, 4x oversampling."
            ),
        },
        "toolchain": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "pillow": pillow_version,
            "ffmpeg": version_line(["ffmpeg", "-version"]),
            "ffprobe": version_line(["ffprobe", "-version"]),
        },
    }
    write_json(analysis_path, evidence_analysis)

    generated_paths = {
        name: output_directory / name
        for name in GENERATED_FILENAMES
        if name != "sha256-manifest.json"
    }
    input_paths = {
        str(path.relative_to(ROOT)): path
        for path in (
            runtime_path,
            TRACKED_ANALYSIS_PATH,
            SCORE_PATH,
            PROVENANCE_PATH,
            GENERATOR_PATH,
            VALIDATOR_PATH,
            TOOL_PATH,
        )
    }
    hash_manifest = {
        "schemaVersion": 1,
        "candidateGitHead": evidence_analysis["candidate"]["gitHead"],
        "generatedFiles": {
            name: manifest_entry(path)
            for name, path in sorted(generated_paths.items())
        },
        "inputFiles": {
            name: manifest_entry(path)
            for name, path in sorted(input_paths.items())
        },
        "manifestSelfHash": None,
        "manifestSelfHashReason": (
            "The manifest cannot contain its own SHA-256 without recursion."
        ),
    }
    manifest_path = output_directory / "sha256-manifest.json"
    write_json(manifest_path, hash_manifest)

    print(
        json.dumps(
            {
                "outputDirectory": str(output_directory),
                "candidateGitHead": evidence_analysis["candidate"]["gitHead"],
                "runtimeAudioSha256": validation["sha256"],
                "allChecksPassed": validation["allChecksPassed"],
                "generatedFiles": list(GENERATED_FILENAMES),
            },
            ensure_ascii=False,
            sort_keys=True,
        ),
    )


if __name__ == "__main__":
    main()
