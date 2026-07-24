import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const ANALYSIS_URL = new URL('public/assets/audio/m15/analysis.json', ROOT);
const SCORE_URL = new URL('tools/audio/m15/score.json', ROOT);
const PROVENANCE_URL = new URL('tools/audio/m15/provenance.json', ROOT);
const AUDIO_ENGINE_URL = new URL('src/game/systems/audioEngine.ts', ROOT);

const [analysis, score, provenance, audioEngineSource] = await Promise.all([
  readFile(ANALYSIS_URL, 'utf8').then(JSON.parse),
  readFile(SCORE_URL, 'utf8').then(JSON.parse),
  readFile(PROVENANCE_URL, 'utf8').then(JSON.parse),
  readFile(AUDIO_ENGINE_URL, 'utf8'),
]);
const runtimeAudioUrl = new URL(analysis.runtimeFile, ROOT);
const runtimeAudio = await readFile(runtimeAudioUrl);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('M1.5 runtime audio is the hash-addressed tracked M4A described by the score', () => {
  const expectedDuration = score.bars * score.meter[0] * (60 / score.tempoBpm);
  assert.equal(analysis.assetId, 'm15-summer-morning-loop');
  assert.equal(score.assetId, analysis.assetId);
  assert.equal(provenance.assetId, analysis.assetId);
  assert.equal(sha256(runtimeAudio), analysis.sha256);
  assert.match(runtimeAudioUrl.pathname, new RegExp(`${analysis.sha256.slice(0, 12)}\\.m4a$`));
  assert.equal(runtimeAudio.byteLength, analysis.bytes);
  assert.equal(runtimeAudio.subarray(4, 8).toString('ascii'), 'ftyp');
  assert.ok(runtimeAudio.subarray(8, 32).includes(Buffer.from('M4A ')));
  assert.equal(expectedDuration, 38.4);
  assert.equal(analysis.format.durationSeconds, expectedDuration);
  assert.equal(analysis.format.decodedFrames, score.sampleRate * expectedDuration);
});

test('tracked source contract requires AAC-LC, 48 kHz stereo and independently measured safety limits', () => {
  assert.equal(analysis.format.codec, 'aac');
  assert.equal(analysis.format.profile, 'LC');
  assert.equal(analysis.format.sampleRateHz, 48_000);
  assert.equal(analysis.format.channels, 2);
  assert.equal(analysis.format.channelLayout, 'stereo');
  assert.ok(analysis.signal.truePeakOversampleFactor >= 4);
  assert.ok(analysis.signal.truePeakDbtp <= -1);
  assert.equal(analysis.signal.clippingSampleCount, 0);
  assert.ok(Math.max(...analysis.signal.dcOffset.map(Math.abs)) < 0.001);
  assert.ok(analysis.signal.longestSilenceSeconds < 0.1);
  assert.equal(analysis.loop.loopStartSeconds, 0);
  assert.equal(analysis.loop.loopEndSeconds, analysis.format.durationSeconds);
  assert.ok(analysis.loop.boundaryJump < 10 ** (-34 / 20));
  assert.ok(analysis.loop.boundaryToP99StepRatio < 1);
  assert.ok(
    Math.abs(analysis.loop.head100msRmsDbfs - analysis.loop.tail100msRmsDbfs) < 6,
  );
  assert.equal(analysis.allChecksPassed, true);
  assert.ok(Object.values(analysis.checks).every(Boolean));
});

test('source, provenance and rights hashes bind the audio manifest to reproducible inputs', async () => {
  const [scoreBytes, generatorBytes, provenanceBytes] = await Promise.all([
    readFile(SCORE_URL),
    readFile(new URL('tools/audio/m15/generate_m15_bgm.py', ROOT)),
    readFile(PROVENANCE_URL),
  ]);
  assert.equal(sha256(scoreBytes), analysis.provenance.scoreSha256);
  assert.equal(sha256(generatorBytes), analysis.provenance.generatorSha256);
  assert.equal(sha256(provenanceBytes), analysis.provenance.provenanceSha256);
  assert.equal(provenance.externalSamples, false);
  assert.equal(provenance.thirdPartyMelody, false);
  assert.equal(provenance.generativeAudioService, false);
  assert.equal(provenance.fixedSeed, score.seed);
  assert.ok(provenance.copyrightOwner);
  assert.ok(provenance.license);
  assert.equal(analysis.composition.environmentIncluded, false);
});

test('runtime fetch/decode contract accepts normal browser resampling and keeps buses separate', () => {
  const expectedRuntimeUrl = `/${analysis.runtimeFile.replace(/^public\//, '')}`;
  assert.match(
    audioEngineSource,
    new RegExp(
      `const BGM_ASSET_URL = '${expectedRuntimeUrl.replaceAll('.', '\\.')}';`,
    ),
  );
  assert.match(audioEngineSource, /fetch\(BGM_ASSET_URL, \{ cache: 'force-cache' \}\)/);
  assert.match(audioEngineSource, /if \(buffer\.numberOfChannels !== 2\)/);
  assert.doesNotMatch(audioEngineSource, /buffer\.sampleRate\s*!==?\s*48_?000/);
  assert.doesNotMatch(audioEngineSource, /decodedSampleRate\s*!==?\s*48_?000/);
  assert.match(audioEngineSource, /private bgmBusGain: GainNode \| null/);
  assert.match(audioEngineSource, /private ambienceBusGain: GainNode \| null/);
  assert.match(audioEngineSource, /source\.connect\(bgmBus\)/);
  assert.match(audioEngineSource, /const output = destination === 'ambience'/);
});

class FakeAudioParam {
  value = 0;

  setTargetAtTime(value) {
    this.value = value;
  }

  setValueAtTime(value) {
    this.value = value;
  }

  exponentialRampToValueAtTime(value) {
    this.value = value;
  }
}

class FakeNode extends EventTarget {
  connections = [];

  connect(destination) {
    this.connections.push(destination);
    return destination;
  }

  disconnect() {
    this.connections = [];
  }
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeFilterNode extends FakeNode {
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  type = 'lowpass';
}

class FakeBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
  }

  getChannelData(channel) {
    return this.channels[channel];
  }
}

class FakeBufferSourceNode extends FakeNode {
  buffer = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startArguments = null;
  stopped = false;

  start(...arguments_) {
    this.startArguments = arguments_;
  }

  stop() {
    this.stopped = true;
  }
}

class FakeOscillatorNode extends FakeNode {
  frequency = new FakeAudioParam();
  type = 'sine';

  start() {}

  stop() {}
}

class FakeAudioContext extends EventTarget {
  static instances = [];

  constructor() {
    super();
    this.currentTime = 0;
    this.sampleRate = 44_100;
    this.state = 'running';
    this.destination = new FakeNode();
    this.sources = [];
    this.resumeCount = 0;
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    return new FakeGainNode();
  }

  createBiquadFilter() {
    return new FakeFilterNode();
  }

  createBuffer(numberOfChannels, length, sampleRate) {
    return new FakeBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource() {
    const source = new FakeBufferSourceNode();
    this.sources.push(source);
    return source;
  }

  createOscillator() {
    return new FakeOscillatorNode();
  }

  async decodeAudioData() {
    return new FakeBuffer(2, Math.round(analysis.format.durationSeconds * 44_100), 44_100);
  }

  async resume() {
    this.resumeCount += 1;
    this.state = 'running';
    this.dispatchEvent(new Event('statechange'));
  }

  async close() {
    this.state = 'closed';
  }
}

class FakeDocument extends EventTarget {
  hidden = false;
}

const documentTarget = new FakeDocument();
const windowTarget = new EventTarget();
Object.assign(windowTarget, {
  AudioContext: FakeAudioContext,
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
});
globalThis.document = documentTarget;
globalThis.window = windowTarget;
globalThis.fetch = async () => ({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(16),
});

const compiledAudioEngine = ts.transpileModule(audioEngineSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    useDefineForClassFields: true,
  },
  fileName: 'audioEngine.ts',
}).outputText;
const runtimeModule = await import(
  `data:text/javascript;base64,${Buffer.from(compiledAudioEngine).toString('base64')}`
);
const { audioEngine } = runtimeModule;
const drainMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test('fake WebAudio proves offset progression and loop relation without fixed sleeps', async () => {
  assert.equal(await audioEngine.start(), true);
  const context = FakeAudioContext.instances.at(-1);
  const started = audioEngine.getDiagnostics();
  assert.equal(started.decodedChannels, 2);
  assert.equal(started.decodedSampleRate, 44_100);
  assert.equal(started.duration, analysis.format.durationSeconds);
  assert.ok(started.sourceId?.endsWith('#1'));

  context.currentTime = analysis.format.durationSeconds - 0.05;
  const beforeBoundary = audioEngine.getDiagnostics();
  context.currentTime += 0.1;
  const afterBoundary = audioEngine.getDiagnostics();
  assert.equal(afterBoundary.sourceId, beforeBoundary.sourceId);
  assert.ok(beforeBoundary.offset > analysis.format.durationSeconds - 0.051);
  assert.ok(afterBoundary.offset >= 0.049 && afterBoundary.offset <= 0.051);
  assert.ok(afterBoundary.offset < beforeBoundary.offset);
});

test('mute, area transition, visibility, freeze and iOS interruption preserve one source', async () => {
  const context = FakeAudioContext.instances.at(-1);
  const sourceId = audioEngine.getDiagnostics().sourceId;

  context.currentTime = 4.25;
  const offsetBeforeMixChanges = audioEngine.getDiagnostics().offset;
  audioEngine.setMuted(true);
  assert.equal(audioEngine.getDiagnostics().masterGain, 0);
  audioEngine.setArea('upper-vending-lane');
  audioEngine.setMuted(false);
  assert.equal(audioEngine.getDiagnostics().sourceId, sourceId);
  assert.equal(audioEngine.getDiagnostics().offset, offsetBeforeMixChanges);

  context.currentTime = 7.5;
  documentTarget.hidden = true;
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(audioEngine.getDiagnostics().masterGain, 0);
  context.state = 'suspended';
  documentTarget.hidden = false;
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  await drainMicrotasks();
  assert.equal(context.state, 'running');
  assert.equal(audioEngine.getDiagnostics().sourceId, sourceId);
  assert.equal(audioEngine.getDiagnostics().lastRecoveryReason, 'visibility');

  context.currentTime = 10;
  documentTarget.dispatchEvent(new Event('freeze'));
  context.state = 'suspended';
  documentTarget.dispatchEvent(new Event('resume'));
  await drainMicrotasks();
  assert.equal(context.state, 'running');
  assert.equal(audioEngine.getDiagnostics().sourceId, sourceId);
  assert.equal(audioEngine.getDiagnostics().lastRecoveryReason, 'page-resume');

  context.currentTime = 12.75;
  context.state = 'interrupted';
  context.dispatchEvent(new Event('statechange'));
  await drainMicrotasks();
  const afterInterruption = audioEngine.getDiagnostics();
  assert.equal(context.state, 'running');
  assert.equal(afterInterruption.sourceId, sourceId);
  assert.equal(afterInterruption.lastRecoveryReason, 'audio-context-state');
  assert.ok(afterInterruption.recoveryCount >= 3);
  assert.equal(afterInterruption.lastRecoveryError, null);

  context.currentTime = 13.25;
  assert.ok(audioEngine.getDiagnostics().offset > afterInterruption.offset);
  assert.match(
    audioEngineSource,
    /context\.currentTime - this\.bgmAnchorContextTime/,
  );
  audioEngine.destroy();
});
