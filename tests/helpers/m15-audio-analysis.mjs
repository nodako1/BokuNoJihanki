import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const AUDIT_SCHEMA_VERSION = 1;
export const SAMPLE_RATE = 48_000;
export const DURATION_SECONDS = 20;
export const PROXY_EVIDENCE_FILENAMES = Object.freeze({
  metrics: 'M1_5_PROXY_AUDIO_METRICS.json',
  waveform: 'M1_5_PROXY_AUDIO_WAVEFORM.png',
  spectrogram: 'M1_5_PROXY_AUDIO_SPECTROGRAM.png',
});

const TRUE_PEAK_OVERSAMPLE_RATE = SAMPLE_RATE * 4;
const SILENCE_THRESHOLD_DBFS = -60;
const LONG_SILENCE_SECONDS = 1;
const LOOP_BOUNDARY_LIMIT_DBFS = -40;
const CLIP_THRESHOLD = 1;

const NOTE_FREQUENCIES = [261.63, 293.66, 329.63, 392, 440, 392, 329.63, 293.66];
const LOOP_DURATIONS_SECONDS = [2, 3, 4];
const MASTER_VOLUME = 0.18;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function amplitudeToDbfs(amplitude) {
  if (amplitude <= 0) return null;
  return 20 * Math.log10(amplitude);
}

function createPrng(seed = 0x6d313561) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function createBiquad(type, frequency, q, sampleRate) {
  const omega = 2 * Math.PI * frequency / sampleRate;
  const cos = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * q);
  const a0 = 1 + alpha;
  let b0;
  let b1;
  let b2;

  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'bandpass') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  } else {
    throw new TypeError(`Unsupported biquad type: ${type}`);
  }

  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  return (sample) => {
    const output = (
      (b0 / a0) * sample
      + (b1 / a0) * x1
      + (b2 / a0) * x2
      - (a1 / a0) * y1
      - (a2 / a0) * y2
    );
    x2 = x1;
    x1 = sample;
    y2 = y1;
    y1 = output;
    return output;
  };
}

function triangle(phaseCycles) {
  const normalized = phaseCycles - Math.floor(phaseCycles);
  return 1 - 4 * Math.abs(normalized - 0.5);
}

function exponentialEnvelope(elapsed, duration, peak) {
  if (elapsed < 0 || elapsed > duration) return 0;
  const floor = 0.0001;
  const attack = 0.025;
  if (elapsed <= attack) {
    return floor * Math.pow(peak / floor, elapsed / attack);
  }
  return peak * Math.pow(floor / peak, (elapsed - attack) / (duration - attack));
}

function makeNoiseBuffers(random) {
  const cicada = new Float32Array(SAMPLE_RATE * 2);
  for (let index = 0; index < cicada.length; index += 1) {
    const pulse = Math.sin((index / SAMPLE_RATE) * Math.PI * 38) > 0.72 ? 1 : 0.12;
    cicada[index] = (random() * 2 - 1) * pulse;
  }

  const wind = new Float32Array(SAMPLE_RATE * 3);
  for (let index = 0; index < wind.length; index += 1) {
    wind[index] = random() * 2 - 1;
  }

  const traffic = new Float32Array(SAMPLE_RATE * 4);
  for (let index = 0; index < traffic.length; index += 1) {
    const wave = Math.sin((index / SAMPLE_RATE) * Math.PI * 1.25) * 0.32;
    traffic[index] = (random() * 2 - 1) * 0.45 + wave;
  }
  return { cicada, wind, traffic };
}

export function renderDeterministicReference() {
  const random = createPrng();
  const noise = makeNoiseBuffers(random);
  const output = new Float32Array(SAMPLE_RATE * DURATION_SECONDS);
  const cicadaFilter = createBiquad('bandpass', 5_200, 0.85, SAMPLE_RATE);
  const windFilter = createBiquad('lowpass', 620, 1, SAMPLE_RATE);
  const trafficFilter = createBiquad('lowpass', 230, 1, SAMPLE_RATE);

  // Steady-state morning / home-street mix from the baseline Web Audio graph.
  const cicadaGain = 0.018 * 0.92;
  const windGain = 0.012 * 0.72;
  const trafficGain = 0.006;

  for (let index = 0; index < output.length; index += 1) {
    const seconds = index / SAMPLE_RATE;
    const pad = (
      Math.sin(2 * Math.PI * 130.81 * Math.pow(2, -4 / 1_200) * seconds)
      + Math.sin(2 * Math.PI * 196 * Math.pow(2, 3 / 1_200) * seconds)
    ) * 0.014;
    const cicada = cicadaFilter(noise.cicada[index % noise.cicada.length]) * cicadaGain;
    const wind = windFilter(noise.wind[index % noise.wind.length]) * windGain;
    const traffic = trafficFilter(noise.traffic[index % noise.traffic.length]) * trafficGain;

    let melody = 0;
    const melodyEvent = Math.floor(seconds / 0.82);
    if (melodyEvent >= 1) {
      const start = melodyEvent * 0.82;
      const elapsed = seconds - start;
      const frequency = NOTE_FREQUENCIES[(melodyEvent - 1) % NOTE_FREQUENCIES.length];
      melody = (
        triangle(frequency * elapsed)
        * exponentialEnvelope(elapsed, 0.34, 0.021)
      );
    }

    output[index] = (pad + cicada + wind + traffic + melody) * MASTER_VOLUME;
  }
  return output;
}

export function encodeFloat32Wav(samples, sampleRate = SAMPLE_RATE) {
  const channelCount = 1;
  const bytesPerSample = 4;
  const dataLength = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(3, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeFloatLE(samples[index], 44 + index * bytesPerSample);
  }
  return buffer;
}

function requireCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status}:\n${result.stderr}`,
    );
  }
  return result;
}

function probeAudio(wavPath) {
  const result = requireCommand('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,codec_long_name,sample_rate,channels,duration',
    '-show_entries', 'format=format_name,duration,size',
    '-of', 'json',
    wavPath,
  ]);
  return JSON.parse(result.stdout);
}

function decodeToFloat32(wavPath, sampleRate = SAMPLE_RATE) {
  const result = spawnSync('ffmpeg', [
    '-v', 'error',
    '-xerror',
    '-i', wavPath,
    '-map', '0:a:0',
    '-ac', '1',
    '-ar', String(sampleRate),
    '-f', 'f32le',
    '-c:a', 'pcm_f32le',
    'pipe:1',
  ], {
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`ffmpeg decode failed with ${result.status}: ${result.stderr.toString()}`);
  }
  const values = new Float32Array(
    result.stdout.buffer,
    result.stdout.byteOffset,
    result.stdout.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return {
    bytes: result.stdout,
    samples: Float32Array.from(values),
  };
}

function measureSamples(samples) {
  let peak = 0;
  let sum = 0;
  let clippingSampleCount = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    if (absolute > peak) peak = absolute;
    if (absolute >= CLIP_THRESHOLD) clippingSampleCount += 1;
    sum += sample;
  }
  return {
    samplePeakLinear: peak,
    samplePeakDbfs: amplitudeToDbfs(peak),
    clippingSampleCount,
    dcOffset: sum / samples.length,
  };
}

function measureLongSilence(samples) {
  const threshold = Math.pow(10, SILENCE_THRESHOLD_DBFS / 20);
  const minimumSamples = LONG_SILENCE_SECONDS * SAMPLE_RATE;
  const intervals = [];
  let start = null;

  for (let index = 0; index <= samples.length; index += 1) {
    const silent = index < samples.length && Math.abs(samples[index]) < threshold;
    if (silent && start === null) start = index;
    if (!silent && start !== null) {
      if (index - start >= minimumSamples) {
        intervals.push({
          startSeconds: start / SAMPLE_RATE,
          endSeconds: index / SAMPLE_RATE,
          durationSeconds: (index - start) / SAMPLE_RATE,
        });
      }
      start = null;
    }
  }
  return intervals;
}

function measureLoopBoundaries(samples) {
  const boundaries = [];
  for (const loopSeconds of LOOP_DURATIONS_SECONDS) {
    for (
      let boundarySeconds = loopSeconds;
      boundarySeconds < DURATION_SECONDS;
      boundarySeconds += loopSeconds
    ) {
      const index = Math.round(boundarySeconds * SAMPLE_RATE);
      const discontinuity = Math.abs(samples[index] - samples[index - 1]);
      boundaries.push({
        loopSeconds,
        boundarySeconds,
        adjacentDiscontinuityLinear: discontinuity,
        adjacentDiscontinuityDbfs: amplitudeToDbfs(discontinuity),
      });
    }
  }
  boundaries.sort((left, right) => (
    (right.adjacentDiscontinuityLinear - left.adjacentDiscontinuityLinear)
    || (left.boundarySeconds - right.boundarySeconds)
  ));
  return boundaries;
}

function measureTruePeak(wavPath) {
  const decoded = decodeToFloat32(wavPath, TRUE_PEAK_OVERSAMPLE_RATE);
  let peak = 0;
  for (const sample of decoded.samples) peak = Math.max(peak, Math.abs(sample));
  return {
    linear: peak,
    dbtp: amplitudeToDbfs(peak),
    oversampleRate: TRUE_PEAK_OVERSAMPLE_RATE,
    method: 'ffmpeg aresample to 4x float32; maximum absolute inter-sample value',
  };
}

export async function generateAudioEvidenceImages(
  audioPath,
  {
    outputDir,
    waveformFilename = PROXY_EVIDENCE_FILENAMES.waveform,
    spectrogramFilename = PROXY_EVIDENCE_FILENAMES.spectrogram,
  },
) {
  const waveformPath = path.join(outputDir, waveformFilename);
  const spectrogramPath = path.join(outputDir, spectrogramFilename);
  requireCommand('ffmpeg', [
    '-y', '-v', 'error',
    '-i', audioPath,
    '-filter_complex',
    'aformat=channel_layouts=mono,showwavespic=s=1600x420:colors=0x2D7FF9:scale=sqrt',
    '-frames:v', '1',
    waveformPath,
  ]);
  requireCommand('ffmpeg', [
    '-y', '-v', 'error',
    '-i', audioPath,
    '-lavfi',
    'showspectrumpic=s=1600x700:legend=1:color=intensity:scale=log:fscale=log:win_func=hann',
    '-frames:v', '1',
    spectrogramPath,
  ]);
  return { waveformPath, spectrogramPath };
}

export async function createProxyAudioMetrics({
  rootDir,
  outputDir,
  writeEvidenceImages = false,
} = {}) {
  const resolvedRoot = rootDir ?? path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
  );
  const sourcePath = path.join(resolvedRoot, 'src/game/systems/audioEngine.ts');
  const sourceBytes = await readFile(sourcePath);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'm15-audio-audit-'));

  try {
    const samples = renderDeterministicReference();
    const wav = encodeFloat32Wav(samples);
    const wavPath = path.join(temporaryDirectory, 'baseline-reference.wav');
    await writeFile(wavPath, wav);
    const probe = probeAudio(wavPath);
    const decoded = decodeToFloat32(wavPath);
    const sampleMetrics = measureSamples(decoded.samples);
    const truePeak = measureTruePeak(wavPath);
    const longSilenceIntervals = measureLongSilence(decoded.samples);
    const loopBoundaries = measureLoopBoundaries(decoded.samples);
    const worstLoopBoundary = loopBoundaries[0];

    const decodeCheck = spawnSync('ffmpeg', [
      '-v', 'error',
      '-xerror',
      '-i', wavPath,
      '-f', 'null',
      '-',
    ], { encoding: 'utf8' });
    const decodeErrorCount = decodeCheck.status === 0
      ? 0
      : Math.max(1, decodeCheck.stderr.trim().split('\n').filter(Boolean).length);

    const stream = probe.streams[0];
    const format = probe.format;
    const metrics = {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      baselineCommit: '29223ee31fd4fc4fbca21a37b01fe89277279647',
      subject: {
        kind: 'procedural Web Audio graph',
        staticAudioAssetPresent: false,
        runtimeCodec: null,
        runtimeCodecReason: 'Audio is synthesized in AudioContext; no encoded BGM asset exists.',
        sourcePath: 'src/game/systems/audioEngine.ts',
        sourceSha256: sha256(sourceBytes),
      },
      referenceRender: {
        purpose: 'Deterministic QA proxy for repeatable objective analysis; not a browser output capture.',
        area: 'home-street',
        phase: 'morning',
        codec: stream.codec_name,
        codecLongName: stream.codec_long_name,
        container: format.format_name,
        sampleRateHz: Number(stream.sample_rate),
        channels: stream.channels,
        durationSeconds: Number(format.duration),
        byteLength: wav.length,
        sha256: sha256(wav),
        decodedPcmSha256: sha256(decoded.bytes),
        decodeErrorCount,
        samplePeakDbfs: sampleMetrics.samplePeakDbfs,
        truePeakDbtp: truePeak.dbtp,
        truePeakMethod: truePeak.method,
        truePeakOversampleRateHz: truePeak.oversampleRate,
        clippingSampleCount: sampleMetrics.clippingSampleCount,
        dcOffset: sampleMetrics.dcOffset,
        silenceThresholdDbfs: SILENCE_THRESHOLD_DBFS,
        longSilenceMinimumSeconds: LONG_SILENCE_SECONDS,
        longSilenceIntervals,
        loopBoundaryLimitDbfs: LOOP_BOUNDARY_LIMIT_DBFS,
        worstLoopBoundary,
        measuredLoopBoundaryCount: loopBoundaries.length,
      },
      objectiveThresholds: {
        decodeErrorCount: 0,
        clippingSampleCount: 0,
        truePeakMaximumDbtp: -1,
        maximumAbsoluteDcOffset: 0.01,
        longSilenceIntervalCount: 0,
        loopBoundaryMaximumDbfs: LOOP_BOUNDARY_LIMIT_DBFS,
      },
      verdict: {
        deterministicReferenceObjective: (
          decodeErrorCount === 0
          && sampleMetrics.clippingSampleCount === 0
          && truePeak.dbtp <= -1
          && Math.abs(sampleMetrics.dcOffset) <= 0.01
          && longSilenceIntervals.length === 0
          && (
            worstLoopBoundary.adjacentDiscontinuityDbfs === null
            || worstLoopBoundary.adjacentDiscontinuityDbfs <= LOOP_BOUNDARY_LIMIT_DBFS
          )
        ) ? 'PASS' : 'FAIL',
        browserRuntimeObjective: 'NOT_VERIFIED',
        humanListening: 'NOT_VERIFIED',
        release: 'BLOCKED',
        blockingReasons: [
          'The sandbox could not capture the live browser AudioContext output.',
          'Objective proxy values cannot establish that the result sounds like music.',
          'Product Owner listening confirmation is required.',
        ],
      },
      evidenceArtifacts: {},
    };

    if (writeEvidenceImages) {
      const { waveformPath, spectrogramPath } = await generateAudioEvidenceImages(
        wavPath,
        { outputDir },
      );
      const waveformBytes = await readFile(waveformPath);
      const spectrogramBytes = await readFile(spectrogramPath);
      metrics.evidenceArtifacts = {
        waveform: {
          path: `docs/evidence/${PROXY_EVIDENCE_FILENAMES.waveform}`,
          sha256: sha256(waveformBytes),
          source: 'deterministic QA proxy render',
        },
        spectrogram: {
          path: `docs/evidence/${PROXY_EVIDENCE_FILENAMES.spectrogram}`,
          sha256: sha256(spectrogramBytes),
          source: 'deterministic QA proxy render',
        },
      };
    }
    return metrics;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function runCli() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outputArgumentIndex = process.argv.indexOf('--output-dir');
  const outputDir = outputArgumentIndex === -1
    ? path.join(rootDir, 'docs/evidence')
    : path.resolve(process.argv[outputArgumentIndex + 1]);
  if (outputArgumentIndex !== -1 && !process.argv[outputArgumentIndex + 1]) {
    throw new TypeError('--output-dir requires a path.');
  }
  await mkdir(outputDir, { recursive: true });
  const metrics = await createProxyAudioMetrics({
    rootDir,
    outputDir,
    writeEvidenceImages: true,
  });
  const metricsPath = path.join(outputDir, PROXY_EVIDENCE_FILENAMES.metrics);
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli();
}
