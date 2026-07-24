import type { AreaId } from '../gameBridge';
import type { SurfaceId } from '../world/worldConfig';
import type { TimePhase } from './timeOfDay';

type AudioContextConstructor = new () => AudioContext;
type WindowWithWebkitAudio = Window & { webkitAudioContext?: AudioContextConstructor };
type RecoverableAudioContextState = AudioContextState | 'interrupted';
type RecoveryReason =
  | 'audio-context-state'
  | 'page-resume'
  | 'page-show'
  | 'user-activation'
  | 'visibility';
type MasterGainAutomationReason =
  | 'context-running'
  | 'freeze'
  | 'mix-update'
  | 'mute'
  | 'unmute'
  | 'visibility-hidden'
  | 'visibility-visible'
  | `recovery:${Exclude<RecoveryReason, 'visibility'>}`;

export type MasterGainAutomationDiagnostics = Readonly<{
  target: number;
  scheduledAtContextTime: number;
  timeConstant: number;
  reason: MasterGainAutomationReason;
}>;

export type AudioEngineDiagnostics = {
  assetUrl: string;
  sourceId: string | null;
  contextState: RecoverableAudioContextState | 'not-created';
  decodedChannels: number;
  decodedSampleRate: number;
  duration: number;
  offset: number;
  muted: boolean;
  documentHidden: boolean;
  masterGain: number;
  bgmBusGain: number;
  ambienceBusGain: number;
  masterGainAutomation: MasterGainAutomationDiagnostics | null;
  recoveryCount: number;
  lastRecoveryReason: RecoveryReason | null;
  lastRecoveryError: string | null;
};

declare global {
  interface Window {
    __BOKU_M15_AUDIO__?: Readonly<{
      getDiagnostics: () => AudioEngineDiagnostics;
    }>;
  }
}

const BGM_ASSET_URL = '/assets/audio/m15/summer-morning-loop-9ea9bb8b71d7.m4a';
const MASTER_VOLUME = 0.68;
const BGM_BUS_VOLUME = 0.68;
const AMBIENCE_BUS_VOLUME = 0.76;

const modulo = (value: number, modulus: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;
  return ((value % modulus) + modulus) % modulus;
};

class AmbientAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmBusGain: GainNode | null = null;
  private ambienceBusGain: GainNode | null = null;
  private cicadaGain: GainNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private trafficGain: GainNode | null = null;
  private bgmBuffer: AudioBuffer | null = null;
  private bgmLoadPromise: Promise<AudioBuffer> | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmSourceSerial = 0;
  private activeSourceId: string | null = null;
  private bgmAnchorOffset = 0;
  private bgmAnchorContextTime = 0;
  private startPromise: Promise<boolean> | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private recoveryCount = 0;
  private lastRecoveryReason: RecoveryReason | null = null;
  private lastRecoveryError: string | null = null;
  private lastMasterGainAutomation: MasterGainAutomationDiagnostics | null = null;
  private lifecycleListenersAttached = false;
  private lifecycleGeneration = 0;
  private tearingDown = false;
  private birdTimer: number | null = null;
  private muted = false;
  private phase: TimePhase = 'morning';
  private area: AreaId = 'residential';
  private persistentAmbienceNodes: AudioScheduledSourceNode[] = [];

  private readonly handleVisibility = (): void => {
    this.captureBgmPosition();
    this.applyOutputGain(document.hidden ? 'visibility-hidden' : 'visibility-visible');
    if (!document.hidden) void this.recoverPlayback('visibility');
  };

  private readonly handleFreeze = (): void => {
    this.captureBgmPosition();
    this.applyOutputGain('freeze', true);
  };

  private readonly handlePageResume = (): void => {
    void this.recoverPlayback('page-resume');
  };

  private readonly handlePageShow = (): void => {
    void this.recoverPlayback('page-show');
  };

  private readonly handleUserActivation = (): void => {
    const state = this.context?.state as RecoverableAudioContextState | undefined;
    if (state && state !== 'running' && state !== 'closed') {
      void this.recoverPlayback('user-activation');
    }
  };

  private readonly handleContextStateChange = (): void => {
    const context = this.context;
    if (!context) return;

    const state = context.state as RecoverableAudioContextState;
    if (state === 'suspended' || state === 'interrupted') {
      this.captureBgmPosition();
      if (!document.hidden) void this.recoverPlayback('audio-context-state');
      return;
    }

    if (state === 'running') {
      this.lastRecoveryError = null;
      this.applyOutputGain('context-running');
    }
  };

  async start(): Promise<boolean> {
    if (this.startPromise) return this.startPromise;

    const promise = this.startInternal();
    this.startPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.startPromise === promise) this.startPromise = null;
    }
  }

  private async startInternal(): Promise<boolean> {
    if (this.context) {
      await this.recoverPlayback('user-activation');
      this.applyMix();
      return this.bgmSource !== null;
    }

    const contextConstructor =
      window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!contextConstructor) return false;

    const generation = ++this.lifecycleGeneration;
    this.tearingDown = false;

    try {
      const context = new contextConstructor();
      this.context = context;
      this.createMixGraph();
      this.createAmbientLayers();
      this.startBirdLoop();
      this.attachLifecycleListeners();

      const buffer = await this.loadBgmBuffer(context);
      if (
        generation !== this.lifecycleGeneration
        || this.context !== context
        || context.state === 'closed'
      ) {
        return false;
      }

      this.bgmBuffer = buffer;
      this.startBgmSource(this.bgmAnchorOffset);
      await this.recoverPlayback('user-activation');
      this.applyMix();
      return this.bgmSource !== null;
    } catch (error) {
      this.lastRecoveryError = error instanceof Error ? error.message : String(error);
      this.releaseAudioGraph();
      return false;
    }
  }

  setPhase(phase: TimePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.applyMix();
  }

  setArea(area: AreaId): void {
    if (this.area === area) return;
    this.area = area;
    this.applyMix();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyOutputGain(muted ? 'mute' : 'unmute');
    if (!muted) this.handleUserActivation();
  }

  getDiagnostics(): AudioEngineDiagnostics {
    const contextState = this.context
      ? this.context.state as RecoverableAudioContextState
      : 'not-created';

    return {
      assetUrl: BGM_ASSET_URL,
      sourceId: this.activeSourceId,
      contextState,
      decodedChannels: this.bgmBuffer?.numberOfChannels ?? 0,
      decodedSampleRate: this.bgmBuffer?.sampleRate ?? 0,
      duration: this.bgmBuffer?.duration ?? 0,
      offset: this.getBgmOffset(),
      muted: this.muted,
      documentHidden: typeof document !== 'undefined' && document.hidden,
      masterGain: this.masterGain?.gain.value ?? 0,
      bgmBusGain: this.bgmBusGain?.gain.value ?? 0,
      ambienceBusGain: this.ambienceBusGain?.gain.value ?? 0,
      masterGainAutomation: this.lastMasterGainAutomation
        ? { ...this.lastMasterGainAutomation }
        : null,
      recoveryCount: this.recoveryCount,
      lastRecoveryReason: this.lastRecoveryReason,
      lastRecoveryError: this.lastRecoveryError,
    };
  }

  playConfirm(): void {
    this.playTone(659.25, 0.12, 'triangle', 0.065);
    window.setTimeout(() => this.playTone(783.99, 0.18, 'triangle', 0.055), 90);
  }

  playClick(): void {
    this.playTone(523.25, 0.06, 'sine', 0.032);
  }

  playTransitionStart(): void {
    this.playTone(392, 0.11, 'sine', 0.042);
    window.setTimeout(() => this.playTone(293.66, 0.16, 'triangle', 0.032), 80);
  }

  playAreaReveal(): void {
    this.playTone(523.25, 0.08, 'triangle', 0.036);
    window.setTimeout(() => this.playTone(659.25, 0.12, 'triangle', 0.03), 75);
  }

  playArrowAvailable(): void {
    this.playTone(880, 0.07, 'sine', 0.018);
  }

  playArrowConfirm(): void {
    this.playTone(698.46, 0.08, 'triangle', 0.038);
    window.setTimeout(() => this.playTone(987.77, 0.11, 'triangle', 0.032), 65);
  }

  playFootstep(surface: SurfaceId): void {
    const context = this.context;
    const master = this.masterGain;
    if (!context || !master || context.state !== 'running' || this.muted) return;

    const duration = surface === 'grass' ? 0.085 : 0.065;
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * duration),
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const envelope = 1 - index / data.length;
      data[index] = (Math.random() * 2 - 1) * envelope;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = surface === 'asphalt' ? 1350 : surface === 'grass' ? 780 : 980;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(surface === 'asphalt' ? 0.026 : 0.021, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
  }

  destroy(): void {
    this.lifecycleGeneration += 1;
    this.tearingDown = true;
    this.detachLifecycleListeners();
    this.releaseAudioGraph();
    this.tearingDown = false;
  }

  private createMixGraph(): void {
    const context = this.context;
    if (!context) return;

    this.masterGain = context.createGain();
    this.masterGain.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.masterGain.connect(context.destination);

    this.bgmBusGain = context.createGain();
    this.bgmBusGain.gain.value = BGM_BUS_VOLUME;
    this.bgmBusGain.connect(this.masterGain);

    this.ambienceBusGain = context.createGain();
    this.ambienceBusGain.gain.value = AMBIENCE_BUS_VOLUME;
    this.ambienceBusGain.connect(this.masterGain);
  }

  private applyMix(): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;

    const frequencyByPhase: Record<TimePhase, number> = {
      morning: 5200,
      day: 6500,
      evening: 3800,
      night: 2500,
    };
    const cicadaByPhase: Record<TimePhase, number> = {
      morning: 0.018,
      day: 0.034,
      evening: 0.014,
      night: 0.006,
    };
    const windByPhase: Record<TimePhase, number> = {
      morning: 0.012,
      day: 0.009,
      evening: 0.016,
      night: 0.018,
    };
    const areaMix: Record<AreaId, { wind: number; traffic: number; cicada: number }> = {
      residential: { wind: 0.8, traffic: 0.012, cicada: 1 },
      park: { wind: 1.35, traffic: 0.004, cicada: 1.1 },
      'home-street': { wind: 0.72, traffic: 0.006, cicada: 0.92 },
      'life-road': { wind: 0.86, traffic: 0.014, cicada: 1 },
      'upper-vending-lane': { wind: 1.28, traffic: 0.0035, cicada: 1.16 },
    };
    const profile = areaMix[this.area];

    this.ambienceFilter?.frequency.setTargetAtTime(frequencyByPhase[this.phase], now, 0.7);
    this.cicadaGain?.gain.setTargetAtTime(
      cicadaByPhase[this.phase] * profile.cicada,
      now,
      0.7,
    );
    this.windGain?.gain.setTargetAtTime(
      windByPhase[this.phase] * profile.wind,
      now,
      0.8,
    );
    this.trafficGain?.gain.setTargetAtTime(profile.traffic, now, 0.8);
    this.applyOutputGain('mix-update');
  }

  private applyOutputGain(
    reason: MasterGainAutomationReason,
    forceSilent = false,
  ): void {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain) return;

    const hidden = typeof document !== 'undefined' && document.hidden;
    const silent = forceSilent || hidden || this.muted;
    const target = silent ? 0 : MASTER_VOLUME;
    const scheduledAtContextTime = context.currentTime;
    const timeConstant = silent ? 0.04 : 0.14;
    masterGain.gain.setTargetAtTime(
      target,
      scheduledAtContextTime,
      timeConstant,
    );
    this.lastMasterGainAutomation = {
      target,
      scheduledAtContextTime,
      timeConstant,
      reason,
    };
  }

  private createAmbientLayers(): void {
    const context = this.context;
    const ambienceBus = this.ambienceBusGain;
    if (!context || !ambienceBus) return;

    const cicadaSource = this.createLoopingNoise(2, (index, sampleRate) => {
      const pulse = Math.sin((index / sampleRate) * Math.PI * 38) > 0.72 ? 1 : 0.12;
      return (Math.random() * 2 - 1) * pulse;
    });
    this.ambienceFilter = context.createBiquadFilter();
    this.ambienceFilter.type = 'bandpass';
    this.ambienceFilter.frequency.value = 5200;
    this.ambienceFilter.Q.value = 0.85;
    this.cicadaGain = context.createGain();
    this.cicadaGain.gain.value = 0.023;
    cicadaSource.connect(this.ambienceFilter);
    this.ambienceFilter.connect(this.cicadaGain);
    this.cicadaGain.connect(ambienceBus);

    const windSource = this.createLoopingNoise(3, () => Math.random() * 2 - 1);
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 620;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0.01;
    windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(ambienceBus);

    const trafficSource = this.createLoopingNoise(4, (index, sampleRate) => {
      const wave = Math.sin((index / sampleRate) * Math.PI * 1.25) * 0.32;
      return (Math.random() * 2 - 1) * 0.45 + wave;
    });
    const trafficFilter = context.createBiquadFilter();
    trafficFilter.type = 'lowpass';
    trafficFilter.frequency.value = 230;
    this.trafficGain = context.createGain();
    this.trafficGain.gain.value = 0.012;
    trafficSource.connect(trafficFilter);
    trafficFilter.connect(this.trafficGain);
    this.trafficGain.connect(ambienceBus);
  }

  private createLoopingNoise(
    seconds: number,
    sample: (index: number, sampleRate: number) => number,
  ): AudioBufferSourceNode {
    const context = this.context;
    if (!context) throw new Error('Audio context is not ready.');
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = sample(index, context.sampleRate);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start();
    this.persistentAmbienceNodes.push(source);
    return source;
  }

  private startBirdLoop(): void {
    if (this.birdTimer !== null) return;
    this.birdTimer = window.setInterval(() => {
      if (this.phase === 'night') return;
      const chance = this.area === 'park'
        ? 0.78
        : this.area === 'upper-vending-lane'
          ? 0.64
          : this.area === 'home-street'
            ? 0.42
            : 0.3;
      if (Math.random() > chance) return;
      const base = this.phase === 'morning' ? 1320 : 1120;
      this.playTone(base + Math.random() * 280, 0.075, 'sine', 0.016, 'ambience');
      window.setTimeout(
        () => this.playTone(base * 1.16, 0.065, 'sine', 0.012, 'ambience'),
        80,
      );
    }, 2400);
  }

  private async loadBgmBuffer(context: AudioContext): Promise<AudioBuffer> {
    if (!this.bgmLoadPromise) {
      this.bgmLoadPromise = (async () => {
        const response = await fetch(BGM_ASSET_URL, { cache: 'force-cache' });
        if (!response.ok) {
          throw new Error(`BGM request failed with status ${response.status}.`);
        }
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (buffer.numberOfChannels !== 2) {
          throw new Error(`BGM must decode as stereo; received ${buffer.numberOfChannels} channels.`);
        }
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) {
          throw new Error('BGM decoded with an invalid duration.');
        }
        return buffer;
      })();
    }
    return this.bgmLoadPromise;
  }

  private startBgmSource(offset: number): void {
    const context = this.context;
    const buffer = this.bgmBuffer;
    const bgmBus = this.bgmBusGain;
    if (!context || !buffer || !bgmBus || this.bgmSource) return;

    const normalizedOffset = modulo(offset, buffer.duration);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(bgmBus);

    this.bgmSourceSerial += 1;
    this.activeSourceId = `${BGM_ASSET_URL}#${this.bgmSourceSerial}`;
    this.bgmSource = source;
    this.bgmAnchorOffset = normalizedOffset;
    this.bgmAnchorContextTime = context.currentTime;

    source.addEventListener('ended', () => {
      if (this.bgmSource !== source) return;
      const preservedOffset = this.getBgmOffset();
      this.bgmAnchorOffset = preservedOffset;
      this.bgmAnchorContextTime = this.context?.currentTime ?? 0;
      this.bgmSource = null;
      this.activeSourceId = null;
      if (!this.tearingDown && !document.hidden) {
        void this.recoverPlayback('audio-context-state');
      }
    }, { once: true });
    source.start(0, normalizedOffset);
  }

  private getBgmOffset(): number {
    const context = this.context;
    const duration = this.bgmBuffer?.duration ?? 0;
    if (!context || duration <= 0) return 0;

    const elapsed = this.bgmSource
      ? Math.max(0, context.currentTime - this.bgmAnchorContextTime)
      : 0;
    return modulo(this.bgmAnchorOffset + elapsed, duration);
  }

  private captureBgmPosition(): void {
    const context = this.context;
    if (!context || !this.bgmBuffer) return;
    this.bgmAnchorOffset = this.getBgmOffset();
    this.bgmAnchorContextTime = context.currentTime;
  }

  private recoverPlayback(reason: RecoveryReason): Promise<void> {
    if (this.recoveryPromise) return this.recoveryPromise;

    const recovery = async (): Promise<void> => {
      const context = this.context;
      if (!context || context.state === 'closed') return;

      this.captureBgmPosition();
      const initialState = context.state as RecoverableAudioContextState;
      const needsSource = !this.bgmSource && this.bgmBuffer !== null;
      const needsContextResume = initialState !== 'running';
      const outputGainReason: MasterGainAutomationReason = reason === 'visibility'
        ? 'visibility-visible'
        : `recovery:${reason}`;

      if (needsSource) this.startBgmSource(this.bgmAnchorOffset);
      if (!needsSource && !needsContextResume) {
        this.applyOutputGain(outputGainReason);
        return;
      }

      this.recoveryCount += 1;
      this.lastRecoveryReason = reason;
      this.lastRecoveryError = null;
      try {
        if (needsContextResume) await context.resume();
        this.applyOutputGain(outputGainReason);
      } catch (error) {
        this.lastRecoveryError = error instanceof Error ? error.message : String(error);
      }
    };

    const promise = recovery().finally(() => {
      if (this.recoveryPromise === promise) this.recoveryPromise = null;
    });
    this.recoveryPromise = promise;
    return promise;
  }

  private attachLifecycleListeners(): void {
    const context = this.context;
    if (!context || this.lifecycleListenersAttached) return;

    document.addEventListener('visibilitychange', this.handleVisibility);
    document.addEventListener('freeze', this.handleFreeze);
    document.addEventListener('resume', this.handlePageResume);
    window.addEventListener('pageshow', this.handlePageShow);
    window.addEventListener('pointerdown', this.handleUserActivation, { passive: true });
    window.addEventListener('touchend', this.handleUserActivation, { passive: true });
    window.addEventListener('keydown', this.handleUserActivation);
    context.addEventListener('statechange', this.handleContextStateChange);
    this.lifecycleListenersAttached = true;
  }

  private detachLifecycleListeners(): void {
    const context = this.context;
    if (!this.lifecycleListenersAttached) return;

    document.removeEventListener('visibilitychange', this.handleVisibility);
    document.removeEventListener('freeze', this.handleFreeze);
    document.removeEventListener('resume', this.handlePageResume);
    window.removeEventListener('pageshow', this.handlePageShow);
    window.removeEventListener('pointerdown', this.handleUserActivation);
    window.removeEventListener('touchend', this.handleUserActivation);
    window.removeEventListener('keydown', this.handleUserActivation);
    context?.removeEventListener('statechange', this.handleContextStateChange);
    this.lifecycleListenersAttached = false;
  }

  private releaseAudioGraph(): void {
    this.detachLifecycleListeners();

    if (this.birdTimer !== null) window.clearInterval(this.birdTimer);
    this.birdTimer = null;

    const source = this.bgmSource;
    this.bgmSource = null;
    this.activeSourceId = null;
    if (source) {
      try {
        source.stop();
      } catch {
        // Stopped nodes cannot be stopped twice.
      }
      source.disconnect();
    }

    for (const node of this.persistentAmbienceNodes) {
      try {
        node.stop();
      } catch {
        // Stopped nodes cannot be stopped twice.
      }
      node.disconnect();
    }
    this.persistentAmbienceNodes = [];

    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close();

    this.masterGain = null;
    this.bgmBusGain = null;
    this.ambienceBusGain = null;
    this.cicadaGain = null;
    this.ambienceFilter = null;
    this.windGain = null;
    this.trafficGain = null;
    this.startPromise = null;
    this.recoveryPromise = null;
    this.bgmAnchorOffset = 0;
    this.bgmAnchorContextTime = 0;
    this.lastMasterGainAutomation = null;
  }

  private playTone(
    frequency: number,
    duration: number,
    waveform: OscillatorType,
    volume: number,
    destination: 'sfx' | 'ambience' = 'sfx',
  ): void {
    const context = this.context;
    const output = destination === 'ambience' ? this.ambienceBusGain : this.masterGain;
    if (!context || !output || context.state !== 'running' || this.muted) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.04);
  }
}

export const audioEngine = new AmbientAudioEngine();

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__BOKU_M15_AUDIO__', {
    configurable: true,
    value: Object.freeze({
      getDiagnostics: (): AudioEngineDiagnostics => audioEngine.getDiagnostics(),
    }),
  });
}
