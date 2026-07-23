import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProxyAudioMetrics,
  generateAudioEvidenceImages,
  PROXY_EVIDENCE_FILENAMES,
} from './m15-audio-analysis.mjs';
import { loadM15Playwright } from './m15-playwright-runtime.mjs';

export const BROWSER_CAPTURE_CONTRACT_VERSION = 1;
export const BROWSER_CAPTURE_DURATION_SECONDS = 12;
export const BROWSER_EVIDENCE_FILENAMES = Object.freeze({
  metrics: 'M1_5_BASELINE_AUDIO_METRICS.json',
  waveform: 'M1_5_BASELINE_AUDIO_WAVEFORM.png',
  spectrogram: 'M1_5_BASELINE_AUDIO_SPECTROGRAM.png',
});

const TRUE_PEAK_SAMPLE_RATE = 192_000;
const SILENCE_THRESHOLD_DBFS = -60;
const LONG_SILENCE_SECONDS = 1;
const CLIP_THRESHOLD = 1;
const BASELINE_COMMIT = '29223ee31fd4fc4fbca21a37b01fe89277279647';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function amplitudeToDbfs(amplitude) {
  return amplitude <= 0 ? null : 20 * Math.log10(amplitude);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
    cwd: options.cwd,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString()
      : result.stderr;
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}:\n${stderr}`);
  }
  return result;
}

function assertExactCommit(value) {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new TypeError('--expected-commit must be a lowercase 40-character Git SHA.');
  }
}

function validateAppSource(rootDir, expectedCommit) {
  assertExactCommit(expectedCommit);
  run('git', ['cat-file', '-e', `${expectedCommit}^{commit}`], { cwd: rootDir });
  const appPaths = [
    'index.html',
    'package-lock.json',
    'package.json',
    'public',
    'src',
    'tsconfig.app.json',
    'tsconfig.json',
    'tsconfig.node.json',
    'vercel.json',
    'vite.config.ts',
  ];
  const diff = run(
    'git',
    ['diff', '--quiet', expectedCommit, '--', ...appPaths],
    { cwd: rootDir, allowFailure: true },
  );
  if (diff.status !== 0) {
    throw new Error(
      `Application source differs from expected capture commit ${expectedCommit}.`,
    );
  }
}

function decodeFloat32(audioPath, sampleRate) {
  const result = run('ffmpeg', [
    '-v', 'error',
    '-xerror',
    '-i', audioPath,
    '-map', '0:a:0',
    '-ar', String(sampleRate),
    '-f', 'f32le',
    '-c:a', 'pcm_f32le',
    'pipe:1',
  ], { encoding: 'buffer' });
  const view = new Float32Array(
    result.stdout.buffer,
    result.stdout.byteOffset,
    result.stdout.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return {
    bytes: result.stdout,
    samples: Float32Array.from(view),
  };
}

function measureFrames(samples, channels, sampleRate) {
  const frameCount = Math.floor(samples.length / channels);
  const dcSums = new Float64Array(channels);
  let peak = 0;
  let clippingSampleCount = 0;
  let maxAdjacentJump = 0;
  let maxAdjacentJumpFrame = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const index = frame * channels + channel;
      const sample = samples[index];
      const absolute = Math.abs(sample);
      peak = Math.max(peak, absolute);
      if (absolute >= CLIP_THRESHOLD) clippingSampleCount += 1;
      dcSums[channel] += sample;
      if (frame > 0) {
        const jump = Math.abs(sample - samples[index - channels]);
        if (jump > maxAdjacentJump) {
          maxAdjacentJump = jump;
          maxAdjacentJumpFrame = frame;
        }
      }
    }
  }

  const silenceThreshold = Math.pow(10, SILENCE_THRESHOLD_DBFS / 20);
  const silenceMinimumFrames = LONG_SILENCE_SECONDS * sampleRate;
  const longSilenceIntervals = [];
  let silenceStart = null;
  for (let frame = 0; frame <= frameCount; frame += 1) {
    let frameSilent = frame < frameCount;
    if (frameSilent) {
      for (let channel = 0; channel < channels; channel += 1) {
        if (Math.abs(samples[frame * channels + channel]) >= silenceThreshold) {
          frameSilent = false;
          break;
        }
      }
    }
    if (frameSilent && silenceStart === null) silenceStart = frame;
    if (!frameSilent && silenceStart !== null) {
      if (frame - silenceStart >= silenceMinimumFrames) {
        longSilenceIntervals.push({
          startSeconds: silenceStart / sampleRate,
          endSeconds: frame / sampleRate,
          durationSeconds: (frame - silenceStart) / sampleRate,
        });
      }
      silenceStart = null;
    }
  }

  return {
    samplePeakDbfs: amplitudeToDbfs(peak),
    clippingSampleCount,
    dcOffsetByChannel: [...dcSums].map((sum) => sum / frameCount),
    longSilenceIntervals,
    maxAdjacentJump: {
      linear: maxAdjacentJump,
      dbfs: amplitudeToDbfs(maxAdjacentJump),
      atSeconds: maxAdjacentJumpFrame / sampleRate,
    },
  };
}

function measureLoudness(audioPath) {
  const result = run('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i', audioPath,
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null',
    '-',
  ]);
  const integratedMatches = [...result.stderr.matchAll(/\bI:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
  const rangeMatches = [...result.stderr.matchAll(/\bLRA:\s+(-?\d+(?:\.\d+)?) LU/g)];
  return {
    integratedLoudnessLufs: Number(integratedMatches.at(-1)?.[1]),
    loudnessRangeLu: Number(rangeMatches.at(-1)?.[1]),
  };
}

export async function analyzeBrowserCapture(audioPath) {
  const encodedBytes = await readFile(audioPath);
  const probeResult = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels',
    '-show_entries', 'format=format_name,duration',
    '-of', 'json',
    audioPath,
  ]);
  const probe = JSON.parse(probeResult.stdout);
  const stream = probe.streams[0];
  if (!stream) throw new Error('Browser capture has no audio stream.');
  const channels = Number(stream.channels);
  const sampleRate = Number(stream.sample_rate);
  const decoded = decodeFloat32(audioPath, sampleRate);
  const frameMetrics = measureFrames(decoded.samples, channels, sampleRate);
  const probedDuration = Number(probe.format.duration);
  const decodedDuration = (
    decoded.bytes.length
    / (Float32Array.BYTES_PER_ELEMENT * channels * sampleRate)
  );
  const durationSeconds = Number.isFinite(probedDuration) && probedDuration > 0
    ? probedDuration
    : decodedDuration;
  const durationMethod = Number.isFinite(probedDuration) && probedDuration > 0
    ? 'ffprobe format duration'
    : 'decoded float32 PCM bytes / (4 bytes × channels × sample rate)';
  const oversampled = decodeFloat32(audioPath, TRUE_PEAK_SAMPLE_RATE);
  let truePeak = 0;
  for (const sample of oversampled.samples) truePeak = Math.max(truePeak, Math.abs(sample));

  const decodeCheck = run('ffmpeg', [
    '-v', 'error',
    '-xerror',
    '-i', audioPath,
    '-f', 'null',
    '-',
  ], { allowFailure: true });
  const decodeErrorCount = decodeCheck.status === 0
    ? 0
    : Math.max(1, decodeCheck.stderr.trim().split('\n').filter(Boolean).length);
  const loudness = measureLoudness(audioPath);

  return {
    codec: stream.codec_name,
    container: probe.format.format_name,
    sampleRateHz: sampleRate,
    channels,
    durationSeconds,
    durationMethod,
    encodedByteLength: encodedBytes.length,
    encodedSha256: sha256(encodedBytes),
    decodedPcmByteLength: decoded.bytes.length,
    decodedPcmSha256: sha256(decoded.bytes),
    decodeErrorCount,
    ...frameMetrics,
    truePeakDbtp: amplitudeToDbfs(truePeak),
    truePeakMethod:
      'ffmpeg decode, 4x resample to 192 kHz float32, maximum absolute inter-sample value',
    truePeakOversampleRateHz: TRUE_PEAK_SAMPLE_RATE,
    silenceThresholdDbfs: SILENCE_THRESHOLD_DBFS,
    longSilenceMinimumSeconds: LONG_SILENCE_SECONDS,
    ...loudness,
  };
}

async function captureBrowserAudio({
  baseUrl,
  expectedCommit,
  durationSeconds,
  browserExecutable,
  outputPath,
}) {
  const { chromium } = loadM15Playwright({
    repositoryRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserExecutable,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const pageErrors = [];
  const failedRequests = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1_280, height: 720 },
      locale: 'ja-JP',
    });
    await context.addInitScript(() => {
      const NativeAudioContext = globalThis.AudioContext;
      const originalConnect = globalThis.AudioNode.prototype.connect;
      const mirrors = new WeakMap();

      globalThis.AudioNode.prototype.connect = function connect(destination, ...args) {
        const result = originalConnect.call(this, destination, ...args);
        const mirror = mirrors.get(destination);
        if (mirror) originalConnect.call(this, mirror);
        return result;
      };

      class QaCaptureAudioContext extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          const captureDestination = this.createMediaStreamDestination();
          mirrors.set(this.destination, captureDestination);
          Object.defineProperty(globalThis, '__m15AudioCapture', {
            configurable: true,
            value: {
              context: this,
              stream: captureDestination.stream,
            },
          });
        }
      }
      globalThis.AudioContext = QaCaptureAudioContext;
    });

    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    page.on('requestfailed', (request) => failedRequests.push(
      `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`,
    ));
    const response = await page.goto(baseUrl, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    if (!response || response.status() >= 400) {
      throw new Error(`Capture page returned ${response?.status() ?? 'no response'}.`);
    }
    const bodyText = await page.locator('body').innerText();
    const shortCommit = expectedCommit.slice(0, 7);
    if (!bodyText.includes(shortCommit)) {
      throw new Error(`Capture page does not expose expected build SHA ${shortCommit}.`);
    }

    await page.getByRole('button', { name: '夏休みを始める', exact: true }).click();
    await page.waitForFunction(() => (
      globalThis.__m15AudioCapture?.context?.state === 'running'
      && globalThis.__m15AudioCapture?.stream?.getAudioTracks().length === 1
    ));
    const base64 = await page.evaluate(async (milliseconds) => {
      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error(`${mimeType} is unavailable.`);
      }
      const chunks = [];
      const recorder = new MediaRecorder(globalThis.__m15AudioCapture.stream, {
        mimeType,
        audioBitsPerSecond: 128_000,
      });
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      const stopped = new Promise((resolve, reject) => {
        recorder.addEventListener('stop', resolve, { once: true });
        recorder.addEventListener('error', () => reject(recorder.error), { once: true });
      });
      recorder.start(1_000);
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
      recorder.stop();
      await stopped;
      const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return btoa(binary);
    }, durationSeconds * 1_000);

    if (pageErrors.length > 0 || failedRequests.length > 0) {
      throw new Error(
        `Capture had page errors or failed requests: ${JSON.stringify({
          pageErrors,
          failedRequests,
        })}`,
      );
    }
    await writeFile(outputPath, Buffer.from(base64, 'base64'));
    return {
      browser: `Playwright Chromium ${browser.version()}`,
      pageErrors: pageErrors.length,
      failedRequests: failedRequests.length,
      observedBuildCommit: expectedCommit,
    };
  } finally {
    await browser.close();
  }
}

async function publishCanonicalEvidence(stagingDir, outputDir) {
  // Images move first and the digest-binding JSON moves last. A failed capture
  // never reaches this function, so existing canonical Evidence remains intact.
  for (const filename of [
    BROWSER_EVIDENCE_FILENAMES.waveform,
    BROWSER_EVIDENCE_FILENAMES.spectrogram,
    BROWSER_EVIDENCE_FILENAMES.metrics,
  ]) {
    await rename(path.join(stagingDir, filename), path.join(outputDir, filename));
  }
}

export async function regenerateBrowserEvidence({
  rootDir,
  outputDir,
  baseUrl,
  expectedCommit = BASELINE_COMMIT,
  durationSeconds = BROWSER_CAPTURE_DURATION_SECONDS,
  browserExecutable,
}) {
  if (!baseUrl) throw new TypeError('--base-url is required.');
  if (durationSeconds !== BROWSER_CAPTURE_DURATION_SECONDS) {
    throw new RangeError(
      `Canonical capture duration must be ${BROWSER_CAPTURE_DURATION_SECONDS} seconds.`,
    );
  }
  validateAppSource(rootDir, expectedCommit);
  await mkdir(outputDir, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'm15-browser-audio-'));
  const stagingDir = await mkdtemp(path.join(outputDir, '.m15-browser-audio-stage-'));

  try {
    const capturePath = path.join(temporaryDirectory, 'runtime-master-output.webm');
    const captureMetadata = await captureBrowserAudio({
      baseUrl,
      expectedCommit,
      durationSeconds,
      browserExecutable,
      outputPath: capturePath,
    });
    const analysis = await analyzeBrowserCapture(capturePath);
    const proxy = await createProxyAudioMetrics({
      rootDir,
      outputDir: stagingDir,
      writeEvidenceImages: false,
    });
    await generateAudioEvidenceImages(capturePath, {
      outputDir: stagingDir,
      waveformFilename: BROWSER_EVIDENCE_FILENAMES.waveform,
      spectrogramFilename: BROWSER_EVIDENCE_FILENAMES.spectrogram,
    });
    const waveformBytes = await readFile(
      path.join(stagingDir, BROWSER_EVIDENCE_FILENAMES.waveform),
    );
    const spectrogramBytes = await readFile(
      path.join(stagingDir, BROWSER_EVIDENCE_FILENAMES.spectrogram),
    );
    const generatorBytes = await readFile(fileURLToPath(import.meta.url));
    const objectivePass = (
      analysis.decodeErrorCount === 0
      && analysis.clippingSampleCount === 0
      && analysis.truePeakDbtp <= -1
      && analysis.dcOffsetByChannel.every((value) => Math.abs(value) <= 0.01)
      && analysis.longSilenceIntervals.length === 0
      && analysis.maxAdjacentJump.dbfs <= -40
    );
    const metrics = {
      ...proxy,
      browserCapture: {
        captureKind: 'QA-only browser master-output tap',
        captureMethod:
          'AudioNode.connect was observed before application start and the master output '
          + 'was additionally connected to a MediaStreamAudioDestination; MediaRecorder '
          + 'encoded the QA branch only.',
        applicationSourceChanged: false,
        expectedCommit,
        area: 'home-street',
        phase: 'morning',
        ...captureMetadata,
        ...analysis,
        captureArtifactCommitted: false,
        captureArtifactPolicy:
          'The encoded recording is temporary; only its measurements, SHA-256 and '
          + 'derived waveform/spectrogram are committed.',
      },
      verdict: {
        deterministicReferenceObjective: proxy.verdict.deterministicReferenceObjective,
        browserRuntimeObjective: objectivePass ? 'PASS' : 'FAIL',
        humanListening: 'NOT_VERIFIED',
        release: 'BLOCKED',
        blockingReasons: [
          'Objective values cannot establish that the result sounds like music.',
          'The Product Owner report that the BGM sounds like noise remains unresolved.',
          'Product Owner listening confirmation is required.',
        ],
      },
      regenerationContract: {
        version: BROWSER_CAPTURE_CONTRACT_VERSION,
        generatorPath: 'tests/helpers/m15-browser-audio-capture.mjs',
        generatorSha256: sha256(generatorBytes),
        expectedCommit,
        sourceVerifiedAgainstExpectedCommit: true,
        proxyNamespace: 'M1_5_PROXY_AUDIO_*',
        canonicalNamespace: 'M1_5_BASELINE_AUDIO_*',
        rawCaptureCommitted: false,
        publication:
          'staging validation first; browser images published before digest-binding JSON',
      },
      evidenceArtifacts: {
        waveform: {
          path: `docs/evidence/${BROWSER_EVIDENCE_FILENAMES.waveform}`,
          sha256: sha256(waveformBytes),
          source: 'Chromium QA master-output capture',
        },
        spectrogram: {
          path: `docs/evidence/${BROWSER_EVIDENCE_FILENAMES.spectrogram}`,
          sha256: sha256(spectrogramBytes),
          source: 'Chromium QA master-output capture',
        },
      },
    };
    await writeFile(
      path.join(stagingDir, BROWSER_EVIDENCE_FILENAMES.metrics),
      `${JSON.stringify(metrics, null, 2)}\n`,
    );
    await publishCanonicalEvidence(stagingDir, outputDir);
    return metrics;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
    await rm(stagingDir, { recursive: true, force: true });
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value) throw new TypeError(`${name} requires a value.`);
  return value;
}

async function runCli() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outputDir = path.resolve(argument('--output-dir') ?? path.join(rootDir, 'docs/evidence'));
  const durationRaw = argument('--duration-seconds');
  const metrics = await regenerateBrowserEvidence({
    rootDir,
    outputDir,
    baseUrl: argument('--base-url'),
    expectedCommit: argument('--expected-commit') ?? BASELINE_COMMIT,
    durationSeconds: durationRaw === undefined
      ? BROWSER_CAPTURE_DURATION_SECONDS
      : Number(durationRaw),
    browserExecutable: argument('--browser-executable'),
  });
  process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli();
}

// Keep namespaces disjoint even if a future rename edits only one helper.
for (const browserFilename of Object.values(BROWSER_EVIDENCE_FILENAMES)) {
  if (Object.values(PROXY_EVIDENCE_FILENAMES).includes(browserFilename)) {
    throw new Error(`Browser and proxy Evidence collide at ${browserFilename}.`);
  }
}
