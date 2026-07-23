import type { AreaId } from '../gameBridge';
import type { SurfaceId } from '../world/worldConfig';
import type { TimePhase } from './timeOfDay';

type AudioContextConstructor = new () => AudioContext;
type WindowWithWebkitAudio = Window & { webkitAudioContext?: AudioContextConstructor };

const MASTER_VOLUME = 0.18;
const NOTE_FREQUENCIES = [261.63, 293.66, 329.63, 392, 440, 392, 329.63, 293.66] as const;

class AmbientAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private trafficGain: GainNode | null = null;
  private melodyTimer: number | null = null;
  private birdTimer: number | null = null;
  private melodyIndex = 0;
  private muted = false;
  private phase: TimePhase = 'morning';
  private area: AreaId = 'residential';
  private persistentNodes: AudioScheduledSourceNode[] = [];
  private readonly handleVisibility = (): void => {
    if (!this.context || !this.masterGain) return;
    const hidden = document.hidden;
    this.masterGain.gain.setTargetAtTime(
      hidden || this.muted ? 0 : MASTER_VOLUME,
      this.context.currentTime,
      hidden ? 0.06 : 0.18,
    );
  };

  async start(): Promise<boolean> {
    if (!this.context) {
      const contextConstructor =
        window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!contextConstructor) return false;

      this.context = new contextConstructor();
      this.createAmbientLayers();
      this.startMelodyLoop();
      this.startBirdLoop();
      document.addEventListener('visibilitychange', this.handleVisibility);
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.applyMix();
    return true;
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
    this.handleVisibility();
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
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
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
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.melodyTimer !== null) window.clearInterval(this.melodyTimer);
    if (this.birdTimer !== null) window.clearInterval(this.birdTimer);
    this.melodyTimer = null;
    this.birdTimer = null;

    for (const node of this.persistentNodes) {
      try {
        node.stop();
      } catch {
        // Stopped nodes cannot be stopped twice.
      }
    }
    this.persistentNodes = [];
    if (this.context) void this.context.close();
    this.context = null;
    this.masterGain = null;
    this.ambienceGain = null;
    this.ambienceFilter = null;
    this.windGain = null;
    this.trafficGain = null;
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
    this.ambienceGain?.gain.setTargetAtTime(cicadaByPhase[this.phase] * profile.cicada, now, 0.7);
    this.windGain?.gain.setTargetAtTime(
      windByPhase[this.phase] * profile.wind,
      now,
      0.8,
    );
    this.trafficGain?.gain.setTargetAtTime(
      profile.traffic,
      now,
      0.8,
    );
    this.handleVisibility();
  }

  private createAmbientLayers(): void {
    const context = this.context;
    if (!context) return;

    this.masterGain = context.createGain();
    this.masterGain.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.masterGain.connect(context.destination);

    const padGain = context.createGain();
    padGain.gain.value = 0.014;
    padGain.connect(this.masterGain);
    for (const [frequency, detune] of [[130.81, -4], [196, 3]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      oscillator.connect(padGain);
      oscillator.start();
      this.persistentNodes.push(oscillator);
    }

    const cicadaSource = this.createLoopingNoise(2, (index, sampleRate) => {
      const pulse = Math.sin((index / sampleRate) * Math.PI * 38) > 0.72 ? 1 : 0.12;
      return (Math.random() * 2 - 1) * pulse;
    });
    this.ambienceFilter = context.createBiquadFilter();
    this.ambienceFilter.type = 'bandpass';
    this.ambienceFilter.frequency.value = 5200;
    this.ambienceFilter.Q.value = 0.85;
    this.ambienceGain = context.createGain();
    this.ambienceGain.gain.value = 0.023;
    cicadaSource.connect(this.ambienceFilter);
    this.ambienceFilter.connect(this.ambienceGain);
    this.ambienceGain.connect(this.masterGain);

    const windSource = this.createLoopingNoise(3, () => Math.random() * 2 - 1);
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 620;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0.01;
    windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

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
    this.trafficGain.connect(this.masterGain);
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
    this.persistentNodes.push(source);
    return source;
  }

  private startMelodyLoop(): void {
    if (this.melodyTimer !== null) return;
    this.melodyTimer = window.setInterval(() => {
      const frequency = NOTE_FREQUENCIES[this.melodyIndex % NOTE_FREQUENCIES.length];
      this.melodyIndex += 1;
      if (!frequency) return;
      const phaseMultiplier: Record<TimePhase, number> = {
        morning: 1,
        day: 0.9,
        evening: 0.68,
        night: 0.42,
      };
      const octave = this.phase === 'night' ? 0.5 : 1;
      this.playTone(frequency * octave, 0.34, 'triangle', 0.021 * phaseMultiplier[this.phase]);
    }, 820);
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
      this.playTone(base + Math.random() * 280, 0.075, 'sine', 0.016);
      window.setTimeout(() => this.playTone(base * 1.16, 0.065, 'sine', 0.012), 80);
    }, 2400);
  }

  private playTone(
    frequency: number,
    duration: number,
    waveform: OscillatorType,
    volume: number,
  ): void {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain || context.state !== 'running' || this.muted) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.04);
  }
}

export const audioEngine = new AmbientAudioEngine();
