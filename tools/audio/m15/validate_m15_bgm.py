#!/usr/bin/env python3
"""Independently validate the checked-in M1.5 runtime BGM.

This validator never regenerates the asset and does not import the synthesis
script.  It probes and decodes the shipped M4A, recalculates signal and loop
metrics, and compares those measurements with the tracked analysis manifest.
Use ``--output`` to preserve the result as checkpoint Evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import scipy
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[3]
ANALYSIS_PATH = ROOT / "public/assets/audio/m15/analysis.json"
SCORE_PATH = ROOT / "tools/audio/m15/score.json"
PROVENANCE_PATH = ROOT / "tools/audio/m15/provenance.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], *, binary: bool = False) -> bytes | str:
    result = subprocess.run(command, check=True, capture_output=True)
    if binary:
        return result.stdout
    return result.stdout.decode("utf-8", errors="strict").strip()


def probe(path: Path) -> dict[str, Any]:
    payload = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            (
                "stream=codec_name,codec_long_name,profile,sample_rate,channels,"
                "channel_layout,duration,bit_rate"
            ),
            "-of",
            "json",
            str(path),
        ],
    )
    assert isinstance(payload, str)
    streams = json.loads(payload).get("streams", [])
    if len(streams) != 1:
        raise RuntimeError(f"Expected exactly one audio stream; received {len(streams)}")
    return streams[0]


def decode(path: Path, sample_rate: int, channels: int) -> np.ndarray:
    payload = run(
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


def four_x_true_peak(audio: np.ndarray) -> float:
    """Return a conservative 4× inter-sample peak for a circular loop."""

    margin = min(4096, audio.shape[0] // 4)
    peaks: list[float] = []
    for channel in range(audio.shape[1]):
        circular = np.concatenate(
            (audio[-margin:, channel], audio[:, channel], audio[:margin, channel]),
        )
        oversampled = resample_poly(circular, 4, 1, window=("kaiser", 8.6))
        crop = margin * 4
        peaks.append(float(np.max(np.abs(oversampled[crop:-crop]))))
    return max(peaks)


def longest_silence(audio: np.ndarray, sample_rate: int) -> tuple[float, float]:
    threshold_dbfs = -60.0
    window_seconds = 0.1
    window_frames = round(sample_rate * window_seconds)
    usable = audio[: audio.shape[0] - audio.shape[0] % window_frames]
    windows = usable.reshape((-1, window_frames, audio.shape[1]))
    rms = np.sqrt(np.mean(np.square(windows), axis=(1, 2)))
    silent = rms < 10.0 ** (threshold_dbfs / 20.0)
    longest = 0
    current = 0
    for value in silent:
        current = current + 1 if value else 0
        longest = max(longest, current)
    return longest * window_seconds, threshold_dbfs


def close(actual: float, expected: float, tolerance: float) -> bool:
    return abs(actual - expected) <= tolerance


def analyze() -> dict[str, Any]:
    manifest = load_json(ANALYSIS_PATH)
    score = load_json(SCORE_PATH)
    provenance = load_json(PROVENANCE_PATH)
    runtime_path = (ROOT / str(manifest["runtimeFile"])).resolve()
    if ROOT not in runtime_path.parents:
        raise RuntimeError("Runtime asset path escapes the repository")

    stream = probe(runtime_path)
    sample_rate = int(stream["sample_rate"])
    channels = int(stream["channels"])
    decoded = decode(runtime_path, sample_rate, channels)
    duration = decoded.shape[0] / sample_rate
    expected_duration = (
        float(score["bars"])
        * float(score["meter"][0])
        * 60.0
        / float(score["tempoBpm"])
    )
    expected_frames = round(expected_duration * sample_rate)

    intersample_peak = four_x_true_peak(decoded)
    true_peak_dbtp = 20.0 * math.log10(max(intersample_peak, 1e-12))
    sample_peak = float(np.max(np.abs(decoded)))
    sample_peak_dbfs = 20.0 * math.log10(max(sample_peak, 1e-12))
    clipping_samples = int(np.count_nonzero(np.abs(decoded) >= 1.0))
    dc_offset = np.mean(decoded, axis=0)
    silence_seconds, silence_threshold_dbfs = longest_silence(decoded, sample_rate)

    adjacent = np.abs(np.diff(decoded, axis=0))
    adjacent_p99 = float(np.percentile(adjacent, 99))
    boundary_by_channel = np.abs(decoded[0] - decoded[-1])
    boundary_jump = float(np.max(boundary_by_channel))
    edge_frames = round(sample_rate * 0.1)
    head_rms = float(np.sqrt(np.mean(np.square(decoded[:edge_frames]))))
    tail_rms = float(np.sqrt(np.mean(np.square(decoded[-edge_frames:]))))
    head_rms_dbfs = 20.0 * math.log10(max(head_rms, 1e-12))
    tail_rms_dbfs = 20.0 * math.log10(max(tail_rms, 1e-12))
    edge_rms_delta_db = abs(head_rms_dbfs - tail_rms_dbfs)

    actual_hash = sha256(runtime_path)
    score_hash = sha256(SCORE_PATH)
    provenance_hash = sha256(PROVENANCE_PATH)
    generator_hash = sha256(ROOT / "tools/audio/m15/generate_m15_bgm.py")
    analysis_signal = manifest["signal"]
    analysis_loop = manifest["loop"]
    analysis_provenance = manifest["provenance"]

    checks = {
        "runtimeFileExists": runtime_path.is_file(),
        "runtimeSha256MatchesManifest": actual_hash == manifest["sha256"],
        "runtimeFilenameCarriesHashPrefix": actual_hash[:12] in runtime_path.name,
        "runtimeBytesMatchManifest": runtime_path.stat().st_size == manifest["bytes"],
        "codecIsAacLc": (
            stream["codec_name"] == "aac"
            and str(stream.get("profile", "")).upper() == "LC"
        ),
        "sourceSampleRateIs48000": sample_rate == 48000,
        "sourceIsStereo": channels == 2 and stream.get("channel_layout") == "stereo",
        "durationMatchesScore": (
            decoded.shape[0] == expected_frames
            and close(duration, expected_duration, 1.0 / sample_rate)
        ),
        "durationMatchesManifest": close(
            duration,
            float(manifest["format"]["durationSeconds"]),
            1.0 / sample_rate,
        ),
        "truePeakUsesAtLeast4xOversampling": (
            int(analysis_signal["truePeakOversampleFactor"]) >= 4
        ),
        "truePeakAtOrBelowMinus1Dbtp": true_peak_dbtp <= -1.0,
        "truePeakMatchesManifest": close(
            true_peak_dbtp,
            float(analysis_signal["truePeakDbtp"]),
            0.001,
        ),
        "samplePeakMatchesManifest": close(
            sample_peak_dbfs,
            float(analysis_signal["samplePeakDbfs"]),
            0.001,
        ),
        "clippingSamplesZero": clipping_samples == 0,
        "clippingMatchesManifest": clipping_samples == analysis_signal["clippingSampleCount"],
        "dcBelowMinus60Dbfs": float(np.max(np.abs(dc_offset))) < 0.001,
        "dcMatchesManifest": all(
            close(float(actual), float(expected), 1e-8)
            for actual, expected in zip(dc_offset, analysis_signal["dcOffset"], strict=True)
        ),
        "noSilenceAtOrAbove100ms": silence_seconds < 0.1,
        "silenceMatchesManifest": close(
            silence_seconds,
            float(analysis_signal["longestSilenceSeconds"]),
            1e-9,
        ),
        "loopBoundsMatchRuntime": (
            close(float(analysis_loop["loopStartSeconds"]), 0.0, 1e-9)
            and close(float(analysis_loop["loopEndSeconds"]), duration, 1.0 / sample_rate)
        ),
        "loopBoundaryBelowMinus34Dbfs": boundary_jump < 10.0 ** (-34.0 / 20.0),
        "loopBoundaryMatchesManifest": close(
            boundary_jump,
            float(analysis_loop["boundaryJump"]),
            1e-7,
        ),
        "loopBoundaryIsBelowTypicalStep": (
            boundary_jump / max(adjacent_p99, 1e-12) < 1.0
        ),
        "loopEdgeRmsDifferenceBelow6Db": edge_rms_delta_db < 6.0,
        "scoreHashMatchesManifest": score_hash == analysis_provenance["scoreSha256"],
        "generatorHashMatchesManifest": (
            generator_hash == analysis_provenance["generatorSha256"]
        ),
        "provenanceHashMatchesManifest": (
            provenance_hash == analysis_provenance["provenanceSha256"]
        ),
        "provenanceDeclaresOriginalRights": (
            provenance["externalSamples"] is False
            and provenance["thirdPartyMelody"] is False
            and bool(provenance["copyrightOwner"])
            and bool(provenance["license"])
        ),
    }

    return {
        "schemaVersion": 1,
        "validator": "tools/audio/m15/validate_m15_bgm.py",
        "analysisManifest": str(ANALYSIS_PATH.relative_to(ROOT)),
        "runtimeFile": str(runtime_path.relative_to(ROOT)),
        "sha256": actual_hash,
        "format": {
            "codec": stream["codec_name"],
            "profile": stream.get("profile"),
            "sampleRateHz": sample_rate,
            "channels": channels,
            "channelLayout": stream.get("channel_layout"),
            "durationSeconds": round(duration, 9),
            "decodedFrames": decoded.shape[0],
        },
        "signal": {
            "samplePeakDbfs": round(sample_peak_dbfs, 6),
            "truePeakDbtp": round(true_peak_dbtp, 6),
            "truePeakOversampleFactor": 4,
            "clippingSampleCount": clipping_samples,
            "dcOffset": [round(float(value), 10) for value in dc_offset],
            "longestSilenceSeconds": round(silence_seconds, 6),
            "silenceThresholdDbfs": silence_threshold_dbfs,
        },
        "loop": {
            "loopStartSeconds": 0.0,
            "loopEndSeconds": round(duration, 9),
            "boundaryJump": round(boundary_jump, 9),
            "boundaryJumpPerChannel": [
                round(float(value), 9) for value in boundary_by_channel
            ],
            "adjacentStepP99": round(adjacent_p99, 9),
            "boundaryToP99StepRatio": round(
                boundary_jump / max(adjacent_p99, 1e-12),
                6,
            ),
            "head100msRmsDbfs": round(head_rms_dbfs, 6),
            "tail100msRmsDbfs": round(tail_rms_dbfs, 6),
        },
        "checks": checks,
        "allChecksPassed": all(checks.values()),
        "toolchain": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "ffmpeg": str(run(["ffmpeg", "-version"])).splitlines()[0],
            "ffprobe": str(run(["ffprobe", "-version"])).splitlines()[0],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path for the complete JSON Evidence result.",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Print compact JSON instead of indented JSON.",
    )
    arguments = parser.parse_args()

    result = analyze()
    serialized = json.dumps(
        result,
        ensure_ascii=False,
        indent=None if arguments.compact else 2,
        sort_keys=True,
    ) + "\n"
    if arguments.output:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(serialized, encoding="utf-8")
    print(serialized, end="")
    if not result["allChecksPassed"]:
        failed = [name for name, passed in result["checks"].items() if not passed]
        raise SystemExit(f"M1.5 BGM validation failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
