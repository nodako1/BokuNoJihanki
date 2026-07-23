import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_SCHEMA_VERSION,
  createProxyAudioMetrics,
  PROXY_EVIDENCE_FILENAMES,
} from './helpers/m15-audio-analysis.mjs';
import {
  BROWSER_CAPTURE_DURATION_SECONDS,
  BROWSER_CAPTURE_CONTRACT_VERSION,
  BROWSER_EVIDENCE_FILENAMES,
} from './helpers/m15-browser-audio-capture.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(rootDir, 'docs/evidence');
const metricsPath = path.join(evidenceDir, 'M1_5_BASELINE_AUDIO_METRICS.json');
const audioSourcePath = path.join(rootDir, 'src/game/systems/audioEngine.ts');
const proxyHelperPath = path.join(rootDir, 'tests/helpers/m15-audio-analysis.mjs');
const browserHelperPath = path.join(rootDir, 'tests/helpers/m15-browser-audio-capture.mjs');
const encodedAudioExtensions = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function listFilesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

async function readMetrics() {
  return JSON.parse(await readFile(metricsPath, 'utf8'));
}

test('baseline BGM is a procedural Web Audio graph, not a decodable static asset', async () => {
  const publicFiles = await listFilesRecursively(path.join(rootDir, 'public'));
  const encodedAudioFiles = publicFiles.filter((file) => (
    encodedAudioExtensions.has(path.extname(file).toLowerCase())
  ));
  assert.deepEqual(
    encodedAudioFiles,
    [],
    'A new encoded audio file must receive its own codec/decode/duration/SHA audit.',
  );

  const source = await readFile(audioSourcePath, 'utf8');
  for (const requiredPrimitive of [
    'new contextConstructor()',
    'context.createOscillator()',
    'context.createBufferSource()',
    'context.createBiquadFilter()',
    'source.loop = true',
    'const MASTER_VOLUME = 0.18',
  ]) {
    assert.match(
      source,
      new RegExp(requiredPrimitive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `Procedural audio source is missing ${requiredPrimitive}.`,
    );
  }
});

test('baseline objective proxy measures codec, decode, peak, clipping, DC, silence and loop boundaries', async () => {
  const recorded = await readMetrics();
  const reproduced = await createProxyAudioMetrics({
    rootDir,
    outputDir: evidenceDir,
    writeEvidenceImages: false,
  });

  assert.equal(recorded.schemaVersion, AUDIT_SCHEMA_VERSION);
  assert.equal(recorded.baselineCommit, '29223ee31fd4fc4fbca21a37b01fe89277279647');
  assert.equal(recorded.subject.sourceSha256, reproduced.subject.sourceSha256);
  assert.equal(recorded.referenceRender.codec, 'pcm_f32le');
  assert.equal(recorded.referenceRender.container, 'wav');
  assert.equal(recorded.referenceRender.sampleRateHz, 48_000);
  assert.equal(recorded.referenceRender.durationSeconds, 20);
  assert.equal(recorded.referenceRender.sha256, reproduced.referenceRender.sha256);
  assert.equal(
    recorded.referenceRender.decodedPcmSha256,
    reproduced.referenceRender.decodedPcmSha256,
  );
  assert.equal(recorded.referenceRender.decodeErrorCount, 0);
  assert.equal(recorded.referenceRender.clippingSampleCount, 0);
  assert.ok(
    recorded.referenceRender.truePeakDbtp
      <= recorded.objectiveThresholds.truePeakMaximumDbtp,
    `True peak ${recorded.referenceRender.truePeakDbtp} dBTP exceeds `
      + `${recorded.objectiveThresholds.truePeakMaximumDbtp} dBTP.`,
  );
  assert.ok(
    Math.abs(recorded.referenceRender.dcOffset)
      <= recorded.objectiveThresholds.maximumAbsoluteDcOffset,
    `DC offset ${recorded.referenceRender.dcOffset} exceeds the threshold.`,
  );
  assert.equal(
    recorded.referenceRender.longSilenceIntervals.length,
    recorded.objectiveThresholds.longSilenceIntervalCount,
  );
  assert.ok(recorded.referenceRender.measuredLoopBoundaryCount > 0);
  assert.ok(
    recorded.referenceRender.worstLoopBoundary.adjacentDiscontinuityDbfs
      <= recorded.objectiveThresholds.loopBoundaryMaximumDbfs,
    `Worst loop boundary is `
      + `${recorded.referenceRender.worstLoopBoundary.adjacentDiscontinuityDbfs} dBFS.`,
  );
  assert.equal(recorded.verdict.deterministicReferenceObjective, 'PASS');

  assert.ok(
    Math.abs(
      recorded.referenceRender.truePeakDbtp
      - reproduced.referenceRender.truePeakDbtp,
    ) < 0.05,
    'Reproduced true peak moved by 0.05 dB or more.',
  );
});

test('proxy generator has a disjoint namespace and cannot overwrite canonical browser Evidence', async () => {
  const proxySource = await readFile(proxyHelperPath, 'utf8');
  const proxyFilenames = Object.values(PROXY_EVIDENCE_FILENAMES);
  const browserFilenames = Object.values(BROWSER_EVIDENCE_FILENAMES);
  assert.equal(
    proxyFilenames.some((filename) => browserFilenames.includes(filename)),
    false,
    'Proxy and browser Evidence filenames must remain disjoint.',
  );
  for (const filename of proxyFilenames) {
    assert.match(proxySource, new RegExp(filename.replaceAll('.', '\\.')));
  }
  for (const filename of browserFilenames) {
    assert.equal(
      proxySource.includes(filename),
      false,
      `Proxy helper must not contain canonical browser filename ${filename}.`,
    );
  }
});

test('proxy CLI writes only proxy artifacts and leaves canonical browser digests unchanged', async () => {
  const canonicalPaths = Object.values(BROWSER_EVIDENCE_FILENAMES).map(
    (filename) => path.join(evidenceDir, filename),
  );
  const before = await Promise.all(canonicalPaths.map(async (filename) => (
    sha256(await readFile(filename))
  )));
  const outputDir = await mkdtemp(path.join(tmpdir(), 'm15-proxy-cli-contract-'));
  try {
    const result = spawnSync(process.execPath, [
      proxyHelperPath,
      '--output-dir',
      outputDir,
    ], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      (await readdir(outputDir)).sort(),
      Object.values(PROXY_EVIDENCE_FILENAMES).sort(),
    );
    const after = await Promise.all(canonicalPaths.map(async (filename) => (
      sha256(await readFile(filename))
    )));
    assert.deepEqual(after, before, 'Proxy CLI changed canonical browser Evidence.');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('canonical browser generator verifies source/build SHA, captures master output and stages publication', async () => {
  const metrics = await readMetrics();
  const generatorBytes = await readFile(browserHelperPath);
  const generatorSource = generatorBytes.toString('utf8');
  const contract = metrics.regenerationContract;

  assert.equal(contract.version, BROWSER_CAPTURE_CONTRACT_VERSION);
  assert.equal(contract.generatorPath, 'tests/helpers/m15-browser-audio-capture.mjs');
  assert.equal(contract.generatorSha256, sha256(generatorBytes));
  assert.equal(contract.expectedCommit, metrics.baselineCommit);
  assert.equal(contract.sourceVerifiedAgainstExpectedCommit, true);
  assert.equal(contract.proxyNamespace, 'M1_5_PROXY_AUDIO_*');
  assert.equal(contract.canonicalNamespace, 'M1_5_BASELINE_AUDIO_*');
  assert.equal(contract.rawCaptureCommitted, false);
  assert.match(generatorSource, /createMediaStreamDestination/);
  assert.match(generatorSource, /new MediaRecorder/);
  assert.match(generatorSource, /Application source differs from expected capture commit/);
  assert.match(generatorSource, /Capture page does not expose expected build SHA/);
  assert.match(generatorSource, /staging validation first/);
});

test('Chromium master-output capture has independently decoded objective measurements', async () => {
  const metrics = await readMetrics();
  const capture = metrics.browserCapture;

  assert.equal(capture.captureKind, 'QA-only browser master-output tap');
  assert.equal(capture.expectedCommit, metrics.baselineCommit);
  assert.equal(capture.observedBuildCommit, metrics.baselineCommit);
  assert.equal(capture.pageErrors, 0);
  assert.equal(capture.failedRequests, 0);
  assert.equal(capture.codec, 'opus');
  assert.equal(capture.container, 'matroska,webm');
  assert.equal(capture.sampleRateHz, 48_000);
  assert.equal(capture.channels, 2);
  assert.ok(
    Math.abs(capture.durationSeconds - BROWSER_CAPTURE_DURATION_SECONDS) <= 0.1,
    `Browser capture duration ${capture.durationSeconds}s is not within 0.1s of `
      + `${BROWSER_CAPTURE_DURATION_SECONDS}s.`,
  );
  assert.match(capture.durationMethod, /ffprobe|decoded float32 PCM bytes/);
  assert.equal(capture.decodeErrorCount, 0);
  assert.equal(capture.clippingSampleCount, 0);
  assert.ok(
    capture.truePeakDbtp <= metrics.objectiveThresholds.truePeakMaximumDbtp,
    `Browser true peak ${capture.truePeakDbtp} dBTP exceeds `
      + `${metrics.objectiveThresholds.truePeakMaximumDbtp} dBTP.`,
  );
  assert.ok(
    capture.dcOffsetByChannel.every((value) => (
      Math.abs(value) <= metrics.objectiveThresholds.maximumAbsoluteDcOffset
    )),
    `Browser DC offsets exceed the threshold: ${capture.dcOffsetByChannel.join(', ')}.`,
  );
  assert.deepEqual(capture.longSilenceIntervals, []);
  assert.ok(
    capture.maxAdjacentJump.dbfs <= metrics.objectiveThresholds.loopBoundaryMaximumDbfs,
    `Browser maximum adjacent jump is ${capture.maxAdjacentJump.dbfs} dBFS.`,
  );
  assert.equal(capture.captureArtifactCommitted, false);
  assert.match(capture.captureMethod, /MediaStreamAudioDestination/i);
  assert.match(capture.encodedSha256, /^[0-9a-f]{64}$/);
  assert.match(capture.decodedPcmSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(capture.encodedSha256, capture.decodedPcmSha256);
  assert.ok(capture.encodedByteLength > 0);
  assert.ok(capture.decodedPcmByteLength > capture.encodedByteLength);
});

test('committed waveform and spectrogram are digest-bound to the baseline metrics', async () => {
  const metrics = await readMetrics();
  for (const artifact of Object.values(metrics.evidenceArtifacts)) {
    const absolute = path.join(rootDir, artifact.path);
    const bytes = await readFile(absolute);
    assert.equal(sha256(bytes), artifact.sha256, `${artifact.path} digest changed.`);
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${artifact.path} is not a PNG.`,
    );
    assert.equal(artifact.source, 'Chromium QA master-output capture');
  }
});

test('objective measurements cannot promote BGM without Product Owner listening', async () => {
  const metrics = await readMetrics();
  assert.equal(metrics.subject.runtimeCodec, null);
  assert.equal(metrics.verdict.browserRuntimeObjective, 'PASS');
  assert.equal(metrics.verdict.humanListening, 'NOT_VERIFIED');
  assert.equal(metrics.verdict.release, 'BLOCKED');
  assert.ok(metrics.verdict.blockingReasons.length >= 2);
});
