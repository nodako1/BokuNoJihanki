#!/usr/bin/env python3
"""Generate and analyze the project-original M1.5 summer-morning BGM.

The score and seed are checked in. Every sound in the music file is synthesized
here; no external samples or third-party melody data are used. The rendered
period is circular, so note tails and musical delays cross the loop boundary
without a fade-to-silence.
"""

from __future__ import annotations

import hashlib
import json
import math
import platform
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import scipy
from scipy.io import wavfile
from scipy.signal import butter, resample_poly, sosfilt

ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "tools/audio/m15"
OUTPUT_DIR = ROOT / "public/assets/audio/m15"
SCORE_PATH = SOURCE_DIR / "score.json"
PROVENANCE_PATH = SOURCE_DIR / "provenance.json"
ANALYSIS_PATH = OUTPUT_DIR / "analysis.json"
GENERATOR_PATH = Path(__file__).resolve()

TARGET_RMS_DBFS = -18.0
TARGET_TRUE_PEAK_DBTP = -2.2
AAC_BITRATE = "192k"

NOTE_PATTERN = re.compile(r"^([A-G])([#b]?)(-?\d+)$")
SEMITONES = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def command_output(command: list[str]) -> str:
    result = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def midi_number(note: str) -> int:
    match = NOTE_PATTERN.match(note)
    if not match:
        raise ValueError(f"Invalid note: {note}")
    letter, accidental, octave_text = match.groups()
    pitch_name = f"{letter}{accidental}"
    return (int(octave_text) + 1) * 12 + SEMITONES[pitch_name]


def frequency(note: str) -> float:
    return 440.0 * (2.0 ** ((midi_number(note) - 69) / 12.0))


def equal_power_pan(pan: float) -> tuple[float, float]:
    position = (np.clip(pan, -1.0, 1.0) + 1.0) * math.pi / 4.0
    return math.cos(position), math.sin(position)


def adsr(
    length: int,
    sample_rate: int,
    *,
    attack: float,
    decay: float,
    sustain: float,
    release: float,
) -> np.ndarray:
    attack_samples = min(length, max(1, round(attack * sample_rate)))
    decay_samples = min(length - attack_samples, max(1, round(decay * sample_rate)))
    release_samples = min(
        length - attack_samples - decay_samples,
        max(1, round(release * sample_rate)),
    )
    sustain_samples = max(0, length - attack_samples - decay_samples - release_samples)
    pieces = [
        np.sin(np.linspace(0.0, math.pi / 2.0, attack_samples, endpoint=False)) ** 2,
        np.linspace(1.0, sustain, decay_samples, endpoint=False),
        np.full(sustain_samples, sustain, dtype=np.float64),
        sustain * np.cos(np.linspace(0.0, math.pi / 2.0, release_samples)) ** 2,
    ]
    envelope = np.concatenate(pieces)
    if envelope.size < length:
        envelope = np.pad(envelope, (0, length - envelope.size))
    return envelope[:length]


def add_circular(
    destination: np.ndarray,
    mono: np.ndarray,
    start_sample: int,
    *,
    gain: float,
    pan: float,
) -> None:
    total = destination.shape[0]
    start = start_sample % total
    left, right = equal_power_pan(pan)
    stereo = np.column_stack((mono * gain * left, mono * gain * right))
    if start + stereo.shape[0] <= total:
        destination[start : start + stereo.shape[0]] += stereo
        return
    first_length = total - start
    destination[start:] += stereo[:first_length]
    remainder = stereo[first_length:]
    while remainder.shape[0] > total:
        destination += remainder[:total]
        remainder = remainder[total:]
    destination[: remainder.shape[0]] += remainder


def synth_lead(note: str, seconds: float, sample_rate: int) -> np.ndarray:
    length = max(2, round(seconds * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    base = frequency(note)
    vibrato_depth = 0.0022 * (1.0 - np.exp(-time * 5.0))
    phase = 2.0 * math.pi * base * (
        time + vibrato_depth * np.sin(2.0 * math.pi * 4.7 * time) / 4.7
    )
    tone = (
        np.sin(phase)
        + 0.24 * np.sin(2.0 * phase + 0.17)
        + 0.095 * np.sin(3.0 * phase + 0.31)
        + 0.035 * np.sin(5.0 * phase)
    )
    envelope = adsr(
        length,
        sample_rate,
        attack=0.045,
        decay=0.16,
        sustain=0.72,
        release=min(0.42, seconds * 0.36),
    )
    return tone * envelope / 1.36


def synth_pad(note: str, seconds: float, sample_rate: int, detune_cents: float) -> np.ndarray:
    length = max(2, round(seconds * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    base = frequency(note) * (2.0 ** (detune_cents / 1200.0))
    phase = 2.0 * math.pi * base * time
    tone = (
        np.sin(phase)
        + 0.17 * np.sin(2.0 * phase + 0.4)
        + 0.055 * np.sin(3.0 * phase + 0.7)
    )
    envelope = adsr(
        length,
        sample_rate,
        attack=0.34,
        decay=0.38,
        sustain=0.66,
        release=0.78,
    )
    return tone * envelope / 1.2


def synth_pluck(note: str, seconds: float, sample_rate: int) -> np.ndarray:
    length = max(2, round(seconds * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    base = frequency(note)
    phase = 2.0 * math.pi * base * time
    brightness = np.exp(-time * 5.2)
    body = np.exp(-time * 2.15)
    tone = (
        np.sin(phase) * body
        + 0.42 * np.sin(2.0 * phase + 0.1) * brightness
        + 0.18 * np.sin(3.0 * phase + 0.3) * brightness
        + 0.07 * np.sin(5.0 * phase) * np.exp(-time * 9.0)
    )
    attack = np.minimum(1.0, time / 0.008)
    release = np.minimum(1.0, np.maximum(0.0, (seconds - time) / 0.12))
    return tone * attack * release / 1.55


def synth_bass(note: str, seconds: float, sample_rate: int) -> np.ndarray:
    length = max(2, round(seconds * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    base = frequency(note)
    phase = 2.0 * math.pi * base * time
    tone = np.sin(phase) + 0.22 * np.sin(2.0 * phase) + 0.06 * np.sin(3.0 * phase)
    envelope = adsr(
        length,
        sample_rate,
        attack=0.025,
        decay=0.22,
        sustain=0.68,
        release=0.30,
    )
    return tone * envelope / 1.22


def synth_kick(seconds: float, sample_rate: int) -> np.ndarray:
    length = max(2, round(seconds * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    phase = 2.0 * math.pi * (49.0 * time + 42.0 * (1.0 - np.exp(-time * 20.0)) / 20.0)
    return np.sin(phase) * np.exp(-time * 15.0) * np.minimum(1.0, time / 0.003)


def synth_wood(seconds: float, sample_rate: int) -> np.ndarray:
    length = max(2, round(seconds * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    tone = np.sin(2.0 * math.pi * 710.0 * time) + 0.55 * np.sin(
        2.0 * math.pi * 1080.0 * time,
    )
    return tone * np.exp(-time * 34.0) / 1.55


def synth_brush(
    seconds: float,
    sample_rate: int,
    rng: np.random.Generator,
) -> np.ndarray:
    length = max(2, round(seconds * sample_rate))
    noise = rng.standard_normal(length)
    sos = butter(2, [2500, 10500], btype="bandpass", fs=sample_rate, output="sos")
    filtered = sosfilt(sos, noise)
    time = np.arange(length, dtype=np.float64) / sample_rate
    envelope = np.sin(np.minimum(1.0, time / 0.012) * math.pi / 2.0) ** 2
    envelope *= np.exp(-time * 19.0)
    peak = max(1e-9, float(np.max(np.abs(filtered))))
    return filtered * envelope / peak


def four_x_true_peak(audio: np.ndarray) -> float:
    peaks: list[float] = []
    pad = 96
    for channel in range(audio.shape[1]):
        circular = np.pad(audio[:, channel], (pad, pad), mode="wrap")
        oversampled = resample_poly(circular, 4, 1, window=("kaiser", 8.6))
        oversampled = oversampled[pad * 4 : -pad * 4]
        peaks.append(float(np.max(np.abs(oversampled))))
    return max(peaks)


def render(score: dict[str, Any]) -> np.ndarray:
    sample_rate = int(score["sampleRate"])
    tempo = float(score["tempoBpm"])
    beats_per_bar = int(score["meter"][0])
    bars = int(score["bars"])
    seconds_per_beat = 60.0 / tempo
    duration = bars * beats_per_bar * seconds_per_beat
    total_samples = round(duration * sample_rate)
    music = np.zeros((total_samples, 2), dtype=np.float64)
    melody_bus = np.zeros_like(music)
    pulse_bus = np.zeros_like(music)
    rng = np.random.default_rng(int(score["seed"]))

    melody_bars = score["melodyBars"]
    if len(melody_bars) != bars:
        raise ValueError("melodyBars must contain exactly one entry per bar")

    for bar_index, bar_notes in enumerate(melody_bars):
        beat_cursor = bar_index * beats_per_bar
        total_bar_beats = sum(float(duration_beats) for _, duration_beats in bar_notes)
        if not math.isclose(total_bar_beats, beats_per_bar, abs_tol=1e-9):
            raise ValueError(f"Melody bar {bar_index + 1} totals {total_bar_beats} beats")
        for note_index, (note, duration_beats) in enumerate(bar_notes):
            start_sample = round(beat_cursor * seconds_per_beat * sample_rate)
            note_seconds = float(duration_beats) * seconds_per_beat + 0.28
            lead = synth_lead(str(note), note_seconds, sample_rate)
            phrase_pan = -0.07 if (bar_index // 4) % 2 == 0 else 0.07
            expressive_gain = 0.160 * (1.04 if note_index == 0 else 1.0)
            add_circular(
                melody_bus,
                lead,
                start_sample,
                gain=expressive_gain,
                pan=phrase_pan,
            )
            beat_cursor += float(duration_beats)

    arpeggio_pattern = [0, 2, 1, 2, 0, 3, 1, 2]
    for bar_index, chord in enumerate(score["chords"]):
        bar_start_beat = bar_index * beats_per_bar
        chord_notes = [str(note) for note in chord["notes"]]
        if len(chord_notes) != 4:
            raise ValueError(f"Chord {bar_index + 1} must contain four notes")

        for chord_index, note in enumerate(chord_notes):
            start_sample = round(bar_start_beat * seconds_per_beat * sample_rate)
            pad = synth_pad(
                note,
                beats_per_bar * seconds_per_beat + 0.95,
                sample_rate,
                detune_cents=(-3.5 if chord_index % 2 == 0 else 3.5),
            )
            add_circular(
                music,
                pad,
                start_sample,
                gain=0.040,
                pan=-0.44 + chord_index * 0.29,
            )

        for step, note_index in enumerate(arpeggio_pattern):
            start_beat = bar_start_beat + step * 0.5
            start_sample = round(start_beat * seconds_per_beat * sample_rate)
            pluck = synth_pluck(chord_notes[note_index], 0.68, sample_rate)
            add_circular(
                pulse_bus,
                pluck,
                start_sample,
                gain=0.072 if step % 2 == 0 else 0.058,
                pan=-0.34 if step % 2 == 0 else 0.34,
            )

        bass_notes = [str(note) for note in chord["bass"]]
        for half, note in enumerate(bass_notes):
            start_beat = bar_start_beat + half * 2.0
            start_sample = round(start_beat * seconds_per_beat * sample_rate)
            bass = synth_bass(note, 1.52, sample_rate)
            add_circular(music, bass, start_sample, gain=0.105, pan=0.0)

        for local_beat in range(beats_per_bar):
            start_beat = bar_start_beat + local_beat
            start_sample = round(start_beat * seconds_per_beat * sample_rate)
            if local_beat in (0, 2):
                add_circular(
                    music,
                    synth_kick(0.34, sample_rate),
                    start_sample,
                    gain=0.070 if local_beat == 0 else 0.052,
                    pan=0.0,
                )
            else:
                add_circular(
                    music,
                    synth_wood(0.18, sample_rate),
                    start_sample,
                    gain=0.022,
                    pan=0.20 if local_beat == 1 else -0.20,
                )

        for eighth in range(beats_per_bar * 2):
            start_beat = bar_start_beat + eighth * 0.5
            start_sample = round(start_beat * seconds_per_beat * sample_rate)
            brush = synth_brush(0.16, sample_rate, rng)
            add_circular(
                music,
                brush,
                start_sample,
                gain=0.014 if eighth % 2 else 0.009,
                pan=-0.28 if eighth % 2 else 0.28,
            )

    # Circular musical delays preserve the loop rather than fading it to silence.
    beat_samples = round(seconds_per_beat * sample_rate)
    melody_bus += np.roll(melody_bus, beat_samples, axis=0) * 0.105
    melody_bus += np.roll(melody_bus, beat_samples * 2, axis=0) * 0.045
    pulse_bus += np.roll(pulse_bus, beat_samples, axis=0) * 0.055
    music += melody_bus + pulse_bus

    # Remove tiny floating-point DC, apply a gentle bus saturator, then normalize.
    music -= np.mean(music, axis=0, keepdims=True)
    music = np.tanh(music * 1.10) / math.tanh(1.10)
    rms = float(np.sqrt(np.mean(np.square(music))))
    target_rms = 10.0 ** (TARGET_RMS_DBFS / 20.0)
    music *= target_rms / max(rms, 1e-12)
    true_peak = four_x_true_peak(music)
    target_peak = 10.0 ** (TARGET_TRUE_PEAK_DBTP / 20.0)
    if true_peak > target_peak:
        music *= target_peak / true_peak
    music -= np.mean(music, axis=0, keepdims=True)
    return np.asarray(music, dtype=np.float32)


def encode(audio: np.ndarray, sample_rate: int, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="boku-m15-audio-") as temporary:
        master = Path(temporary) / "master.wav"
        wavfile.write(master, sample_rate, audio)
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-nostdin",
                "-y",
                "-i",
                str(master),
                "-map_metadata",
                "-1",
                "-fflags",
                "+bitexact",
                "-flags:a",
                "+bitexact",
                "-c:a",
                "aac",
                "-profile:a",
                "aac_low",
                "-b:a",
                AAC_BITRATE,
                "-movflags",
                "+faststart",
                str(output),
            ],
            check=True,
        )


def decode_runtime_asset(path: Path, sample_rate: int) -> np.ndarray:
    raw = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-i",
            str(path),
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "-ar",
            str(sample_rate),
            "-ac",
            "2",
            "-",
        ],
        check=True,
        capture_output=True,
    ).stdout
    decoded = np.frombuffer(raw, dtype="<f4")
    if decoded.size % 2:
        raise RuntimeError("Decoded audio did not contain complete stereo frames")
    return decoded.reshape((-1, 2)).astype(np.float64)


def ffprobe(path: Path) -> dict[str, Any]:
    payload = command_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name,codec_long_name,profile,sample_rate,channels,channel_layout,duration,bit_rate",
            "-of",
            "json",
            str(path),
        ],
    )
    return json.loads(payload)["streams"][0]


def loudness(path: Path) -> dict[str, float]:
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostdin",
            "-i",
            str(path),
            "-af",
            "loudnorm=I=-18:TP=-1:LRA=11:print_format=json",
            "-f",
            "null",
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    match = re.search(r"\{\s*\"input_i\".*?\}", result.stderr, re.DOTALL)
    if not match:
        raise RuntimeError("FFmpeg loudnorm did not emit analysis JSON")
    values = json.loads(match.group(0))
    return {
        "integratedLufs": float(values["input_i"]),
        "loudnessRangeLu": float(values["input_lra"]),
        "loudnessThresholdLufs": float(values["input_thresh"]),
        "ffmpegReportedTruePeakDbtp": float(values["input_tp"]),
    }


def longest_silence(audio: np.ndarray, sample_rate: int) -> tuple[float, float]:
    window_samples = round(sample_rate * 0.1)
    usable = audio[: audio.shape[0] - audio.shape[0] % window_samples]
    windows = usable.reshape((-1, window_samples, 2))
    rms = np.sqrt(np.mean(np.square(windows), axis=(1, 2)))
    threshold_db = -60.0
    silent = rms < 10.0 ** (threshold_db / 20.0)
    longest = 0
    current = 0
    for value in silent:
        current = current + 1 if value else 0
        longest = max(longest, current)
    return longest * 0.1, threshold_db


def spectral_metrics(audio: np.ndarray, sample_rate: int) -> dict[str, float]:
    mono = np.mean(audio, axis=1)
    window_size = 4096
    hop = 2048
    starts = range(0, mono.size - window_size + 1, hop)
    window = np.hanning(window_size)
    frequencies = np.fft.rfftfreq(window_size, 1.0 / sample_rate)
    centroids: list[float] = []
    tonal_ratios: list[float] = []
    for start in starts:
        magnitude = np.abs(np.fft.rfft(mono[start : start + window_size] * window))
        total = float(np.sum(magnitude))
        if total <= 1e-12:
            continue
        centroids.append(float(np.sum(frequencies * magnitude) / total))
        top = np.partition(magnitude, -24)[-24:]
        tonal_ratios.append(float(np.sum(top) / total))
    return {
        "meanSpectralCentroidHz": round(float(np.mean(centroids)), 3),
        "meanTop24BinTonalEnergyRatio": round(float(np.mean(tonal_ratios)), 6),
    }


def analyze(
    path: Path,
    score: dict[str, Any],
    provenance: dict[str, Any],
) -> dict[str, Any]:
    sample_rate = int(score["sampleRate"])
    decoded = decode_runtime_asset(path, sample_rate)
    stream = ffprobe(path)
    expected_frames = round(
        int(score["bars"])
        * int(score["meter"][0])
        * (60.0 / float(score["tempoBpm"]))
        * sample_rate,
    )
    duration_seconds = decoded.shape[0] / sample_rate
    true_peak = four_x_true_peak(decoded)
    sample_peak = float(np.max(np.abs(decoded)))
    dc = np.mean(decoded, axis=0)
    clipping_samples = int(np.count_nonzero(np.abs(decoded) >= 1.0))
    longest_silence_seconds, silence_threshold_dbfs = longest_silence(decoded, sample_rate)
    adjacent = np.abs(np.diff(decoded, axis=0))
    p99_step = float(np.percentile(adjacent, 99))
    boundary_jump_channels = np.abs(decoded[0] - decoded[-1])
    boundary_jump = float(np.max(boundary_jump_channels))
    edge_samples = round(sample_rate * 0.1)
    head_rms = float(np.sqrt(np.mean(np.square(decoded[:edge_samples]))))
    tail_rms = float(np.sqrt(np.mean(np.square(decoded[-edge_samples:]))))
    correlation = float(np.corrcoef(decoded[:, 0], decoded[:, 1])[0, 1])
    true_peak_db = 20.0 * math.log10(max(true_peak, 1e-12))
    sample_peak_db = 20.0 * math.log10(max(sample_peak, 1e-12))
    rms_db = 20.0 * math.log10(
        max(float(np.sqrt(np.mean(np.square(decoded)))), 1e-12),
    )

    checks = {
        "codecIsAac": stream["codec_name"] == "aac",
        "sampleRateIs48000": int(stream["sample_rate"]) == 48000,
        "channelsAreStereo": int(stream["channels"]) == 2,
        "decodedFrameCountExact": decoded.shape[0] == expected_frames,
        "durationIs38Point4Seconds": abs(duration_seconds - 38.4) <= 1.0 / sample_rate,
        "truePeakAtOrBelowMinus1Dbtp": true_peak_db <= -1.0,
        "clippingSamplesZero": clipping_samples == 0,
        "dcBelowMinus60Dbfs": float(np.max(np.abs(dc))) < 0.001,
        "noSilenceAtOrAbove100ms": longest_silence_seconds < 0.1,
        "loopBoundaryJumpBelowMinus34Dbfs": boundary_jump < 10.0 ** (-34.0 / 20.0),
        # A loop downbeat is intentionally stronger than the preceding resolution;
        # the discontinuity check above guards clicks while this permits musical accent.
        "loopEdgeRmsDifferenceBelow6Db": abs(
            20.0 * math.log10(max(head_rms, 1e-12) / max(tail_rms, 1e-12)),
        ) < 6.0,
    }

    analysis = {
        "schemaVersion": 1,
        "assetId": score["assetId"],
        "title": score["title"],
        "runtimeFile": str(path.relative_to(ROOT)),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "provenance": {
            "createdDate": provenance["createdDate"],
            "creationMethod": provenance["creationMethod"],
            "externalSamples": provenance["externalSamples"],
            "thirdPartyMelody": provenance["thirdPartyMelody"],
            "copyrightOwner": provenance["copyrightOwner"],
            "license": provenance["license"],
            "scoreSha256": sha256(SCORE_PATH),
            "generatorSha256": sha256(GENERATOR_PATH),
            "provenanceSha256": sha256(PROVENANCE_PATH),
            "fixedSeed": score["seed"],
        },
        "format": {
            "container": "M4A",
            "codec": stream["codec_name"],
            "codecLongName": stream.get("codec_long_name"),
            "profile": stream.get("profile"),
            "sampleRateHz": int(stream["sample_rate"]),
            "channels": int(stream["channels"]),
            "channelLayout": stream.get("channel_layout"),
            "bitRate": int(stream["bit_rate"]),
            "durationSeconds": round(duration_seconds, 9),
            "decodedFrames": decoded.shape[0],
        },
        "composition": {
            "tempoBpm": score["tempoBpm"],
            "meter": score["meter"],
            "bars": score["bars"],
            "key": score["key"],
            "durationSeconds": 38.4,
            "layers": [
                "lead melody",
                "four-note harmony pad",
                "plucked arpeggio",
                "root-and-fifth bass",
                "gentle synthetic rhythm",
            ],
            "environmentIncluded": False,
        },
        "signal": {
            "samplePeakDbfs": round(sample_peak_db, 6),
            "truePeakDbtp": round(true_peak_db, 6),
            "truePeakOversampleFactor": 4,
            "rmsDbfs": round(rms_db, 6),
            "clippingSampleCount": clipping_samples,
            "dcOffset": [round(float(value), 10) for value in dc],
            "longestSilenceSeconds": round(longest_silence_seconds, 6),
            "silenceThresholdDbfs": silence_threshold_dbfs,
            "stereoCorrelation": round(correlation, 6),
            **loudness(path),
            **spectral_metrics(decoded, sample_rate),
        },
        "loop": {
            "loopStartSeconds": 0.0,
            "loopEndSeconds": 38.4,
            "boundaryJump": round(boundary_jump, 9),
            "boundaryJumpPerChannel": [
                round(float(value), 9) for value in boundary_jump_channels
            ],
            "adjacentStepP99": round(p99_step, 9),
            "boundaryToP99StepRatio": round(boundary_jump / max(p99_step, 1e-12), 6),
            "head100msRmsDbfs": round(20.0 * math.log10(max(head_rms, 1e-12)), 6),
            "tail100msRmsDbfs": round(20.0 * math.log10(max(tail_rms, 1e-12)), 6),
        },
        "checks": checks,
        "allChecksPassed": all(checks.values()),
        "toolchain": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "ffmpeg": command_output(["ffmpeg", "-version"]).splitlines()[0],
            "ffprobe": command_output(["ffprobe", "-version"]).splitlines()[0],
        },
    }
    return analysis


def main() -> None:
    score = load_json(SCORE_PATH)
    provenance = load_json(PROVENANCE_PATH)
    if score["assetId"] != provenance["assetId"]:
        raise ValueError("Score and provenance asset IDs do not match")
    audio = render(score)
    with tempfile.TemporaryDirectory(prefix="boku-m15-runtime-") as temporary:
        candidate = Path(temporary) / "summer-morning-loop.m4a"
        encode(audio, int(score["sampleRate"]), candidate)
        output_path = OUTPUT_DIR / f"summer-morning-loop-{sha256(candidate)[:12]}.m4a"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(candidate, output_path)
    analysis = analyze(output_path, score, provenance)
    ANALYSIS_PATH.write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if not analysis["allChecksPassed"]:
        failed = [name for name, passed in analysis["checks"].items() if not passed]
        raise SystemExit(f"M1.5 BGM validation failed: {', '.join(failed)}")
    print(
        f"Generated {output_path.relative_to(ROOT)} "
        f"({analysis['format']['durationSeconds']} s, "
        f"{analysis['signal']['integratedLufs']} LUFS, "
        f"{analysis['signal']['truePeakDbtp']} dBTP, "
        f"sha256={analysis['sha256']})",
    )


if __name__ == "__main__":
    main()
