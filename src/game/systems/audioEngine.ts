import type { TimePhase } from './timeOfDay';

type AudioContextConstructor = new () => AudioContext;
type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

const MASTER_VOLUME = 0.2;
const NOTE_FREQUENCIES = [261.63, 293.66, 329.63, 392, 440, 392, 329.63, 293.66] as const;

class AmbientAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private melodyTimer: number | null = null;
  private melodyIndex = 0;
  private muted = false;
  private phase: TimePhase = 'morning';
  private persistentNodes: AudioScheduledSourceNode[] = [];

  async start(): Promise<boolean> {
    if (!this.context) {
      const contextConstructor =
        window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;

      if (!contextConstructor) {
        return false;
      }

      this.context = new contextConstructor();
      this.createAmbientLayer();
      this.startMelodyLoop();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return true;
  }

  setPhase(phase: TimePhase): void {
    this.phase = phase;
    if (!this.context || !this.ambienceGain || !this.ambienceFilter) {
      return;
    }

    const now = this.context.currentTime;
    const frequencyByPhase: Record<TimePhase, number> = {
      morning: 5200,
      day: 6500,
      evening: 3900,
      night: 2700,
    };
    const ambienceByPhase: Record<TimePhase, number> = {
      morning: 0.023,
      day: 0.035,
      evening: 0.019,
      night: 0.027,
    };

    this.ambienceFilter.frequency.setTargetAtTime(frequencyByPhase[phase], now, 0.45);
    this.ambienceGain.gain.setTargetAtTime(ambienceByPhase[phase], now, 0.45);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.context || !this.masterGain) {
      return;
    }

    this.masterGain.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.context.currentTime, 0.05);
  }

  playConfirm(): void {
    this.playTone(659.25, 0.12, 'triangle', 0.07);
    window.setTimeout(() => this.playTone(783.99, 0.18, 'triangle', 0.06), 90);
  }

  playClick(): void {
    this.playTone(523.25, 0.06, 'sine', 0.035);
  }

  destroy(): void {
    if (this.melodyTimer !== null) {
      window.clearInterval(this.melodyTimer);
      this.melodyTimer = null;
    }

    for (const node of this.persistentNodes) {
      try {
        node.stop();
      } catch {
        // A stopped AudioScheduledSourceNode cannot be stopped twice.
      }
    }
    this.persistentNodes = [];

    if (this.context) {
      void this.context.close();
    }
    this.context = null;
    this.masterGain = null;
    this.ambienceGain = null;
    this.ambienceFilter = null;
  }

  private createAmbientLayer(): void {
    const context = this.context;
    if (!context) {
      return;
    }

    this.masterGain = context.createGain();
    this.masterGain.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.masterGain.connect(context.destination);

    const padGain = context.createGain();
    padGain.gain.value = 0.018;
    padGain.connect(this.masterGain);

    for (const [frequency, detune] of [
      [130.81, -4],
      [196, 3],
    ] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      oscillator.connect(padGain);
      oscillator.start();
      this.persistentNodes.push(oscillator);
    }

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index += 1) {
      const pulse = Math.sin((index / context.sampleRate) * Math.PI * 38) > 0.72 ? 1 : 0.12;
      noiseData[index] = (Math.random() * 2 - 1) * pulse;
    }

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    this.ambienceFilter = context.createBiquadFilter();
    this.ambienceFilter.type = 'bandpass';
    this.ambienceFilter.frequency.value = 5200;
    this.ambienceFilter.Q.value = 0.85;

    this.ambienceGain = context.createGain();
    this.ambienceGain.gain.value = 0.023;

    noiseSource.connect(this.ambienceFilter);
    this.ambienceFilter.connect(this.ambienceGain);
    this.ambienceGain.connect(this.masterGain);
    noiseSource.start();
    this.persistentNodes.push(noiseSource);
  }

  private startMelodyLoop(): void {
    if (this.melodyTimer !== null) {
      return;
    }

    this.melodyTimer = window.setInterval(() => {
      const frequency = NOTE_FREQUENCIES[this.melodyIndex % NOTE_FREQUENCIES.length];
      this.melodyIndex += 1;

      if (!frequency) {
        return;
      }

      const phaseMultiplier: Record<TimePhase, number> = {
        morning: 1,
        day: 1,
        evening: 0.75,
        night: 0.5,
      };
      const octave = this.phase === 'night' ? 0.5 : 1;
      this.playTone(frequency * octave, 0.34, 'triangle', 0.025 * phaseMultiplier[this.phase]);
    }, 720);
  }

  private playTone(
    frequency: number,
    duration: number,
    waveform: OscillatorType,
    volume: number,
  ): void {
    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain || context.state !== 'running') {
      return;
    }

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
