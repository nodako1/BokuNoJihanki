export const GAME_DAY_START = 6 * 60;
export const NORMAL_DAY_END = 18 * 60;
export const FESTIVAL_DAY_END = 21 * 60;
export const GAME_ACTION_MINUTES = 15;

export type TimePhase = 'morning' | 'day' | 'evening' | 'night';

export interface Atmosphere {
  phase: TimePhase;
  phaseLabel: string;
  skyTop: number;
  skyBottom: number;
  horizon: number;
  distantGround: number;
  ground: number;
  buildingTint: number;
  shadow: number;
  sunColor: number;
  sunX: number;
  sunY: number;
  sunAlpha: number;
  starAlpha: number;
  lampAlpha: number;
  windowLightAlpha: number;
  warmthAlpha: number;
}

interface AtmosphereKeyframe extends Omit<Atmosphere, 'phase' | 'phaseLabel'> {
  minute: number;
}

const KEYFRAMES: readonly AtmosphereKeyframe[] = [
  {
    minute: 360,
    skyTop: 0x6bb8e8,
    skyBottom: 0xffdfaa,
    horizon: 0xf9edc7,
    distantGround: 0x7ba16f,
    ground: 0x557c58,
    buildingTint: 0xfff4dd,
    shadow: 0x31556b,
    sunColor: 0xfff0a0,
    sunX: 0.17,
    sunY: 0.26,
    sunAlpha: 0.92,
    starAlpha: 0,
    lampAlpha: 0,
    windowLightAlpha: 0.08,
    warmthAlpha: 0.13,
  },
  {
    minute: 540,
    skyTop: 0x45a8e5,
    skyBottom: 0xbfeaff,
    horizon: 0xdff6ff,
    distantGround: 0x669565,
    ground: 0x47724d,
    buildingTint: 0xfff7e8,
    shadow: 0x264f67,
    sunColor: 0xfff2a6,
    sunX: 0.35,
    sunY: 0.15,
    sunAlpha: 1,
    starAlpha: 0,
    lampAlpha: 0,
    windowLightAlpha: 0.04,
    warmthAlpha: 0.04,
  },
  {
    minute: 720,
    skyTop: 0x2798dd,
    skyBottom: 0xaee7ff,
    horizon: 0xd9f7ff,
    distantGround: 0x5d905d,
    ground: 0x3d6c47,
    buildingTint: 0xfff8e8,
    shadow: 0x1f4a62,
    sunColor: 0xfff7bd,
    sunX: 0.53,
    sunY: 0.11,
    sunAlpha: 1,
    starAlpha: 0,
    lampAlpha: 0,
    windowLightAlpha: 0.02,
    warmthAlpha: 0,
  },
  {
    minute: 900,
    skyTop: 0x4f8bc7,
    skyBottom: 0xffc07d,
    horizon: 0xffdeb0,
    distantGround: 0x5f7f57,
    ground: 0x405e43,
    buildingTint: 0xffe2c2,
    shadow: 0x3d4660,
    sunColor: 0xffdc75,
    sunX: 0.74,
    sunY: 0.26,
    sunAlpha: 1,
    starAlpha: 0,
    lampAlpha: 0.03,
    windowLightAlpha: 0.1,
    warmthAlpha: 0.18,
  },
  {
    minute: 1080,
    skyTop: 0x314c82,
    skyBottom: 0xe98573,
    horizon: 0xf6b58b,
    distantGround: 0x44554e,
    ground: 0x30433a,
    buildingTint: 0xcdbba8,
    shadow: 0x252d43,
    sunColor: 0xffc75e,
    sunX: 0.89,
    sunY: 0.43,
    sunAlpha: 0.68,
    starAlpha: 0.06,
    lampAlpha: 0.42,
    windowLightAlpha: 0.46,
    warmthAlpha: 0.2,
  },
  {
    minute: 1260,
    skyTop: 0x09152f,
    skyBottom: 0x26375f,
    horizon: 0x3e4a6c,
    distantGround: 0x243433,
    ground: 0x1b2a29,
    buildingTint: 0x657080,
    shadow: 0x10172a,
    sunColor: 0xf5f0d8,
    sunX: 0.78,
    sunY: 0.19,
    sunAlpha: 0.86,
    starAlpha: 0.78,
    lampAlpha: 0.9,
    windowLightAlpha: 0.84,
    warmthAlpha: 0.04,
  },
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

export function mixColor(startColor: number, endColor: number, progress: number): number {
  const t = clamp(progress, 0, 1);
  const startRed = (startColor >> 16) & 0xff;
  const startGreen = (startColor >> 8) & 0xff;
  const startBlue = startColor & 0xff;
  const endRed = (endColor >> 16) & 0xff;
  const endGreen = (endColor >> 8) & 0xff;
  const endBlue = endColor & 0xff;

  const red = Math.round(lerp(startRed, endRed, t));
  const green = Math.round(lerp(startGreen, endGreen, t));
  const blue = Math.round(lerp(startBlue, endBlue, t));

  return (red << 16) | (green << 8) | blue;
}

export function getTimePhase(minutes: number): TimePhase {
  if (minutes < 9 * 60) {
    return 'morning';
  }
  if (minutes < 15 * 60) {
    return 'day';
  }
  if (minutes < 18 * 60) {
    return 'evening';
  }
  return 'night';
}

export function getPhaseLabel(phase: TimePhase): string {
  switch (phase) {
    case 'morning':
      return '朝';
    case 'day':
      return '昼';
    case 'evening':
      return '夕方';
    case 'night':
      return '夏祭りの夜';
  }
}

export function formatGameTime(minutes: number): string {
  const normalized = Math.round(minutes);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function advancePreviewTime(minutes: number): number {
  const next = minutes + GAME_ACTION_MINUTES;
  return next > FESTIVAL_DAY_END ? GAME_DAY_START : next;
}

export function getAtmosphere(minutes: number): Atmosphere {
  const safeMinutes = clamp(minutes, GAME_DAY_START, FESTIVAL_DAY_END);
  let start = KEYFRAMES[0];
  let end = KEYFRAMES[KEYFRAMES.length - 1];

  for (let index = 0; index < KEYFRAMES.length - 1; index += 1) {
    const current = KEYFRAMES[index];
    const next = KEYFRAMES[index + 1];
    if (current && next && safeMinutes >= current.minute && safeMinutes <= next.minute) {
      start = current;
      end = next;
      break;
    }
  }

  if (!start || !end) {
    throw new Error('Atmosphere keyframes are not configured correctly.');
  }

  const duration = Math.max(1, end.minute - start.minute);
  const progress = clamp((safeMinutes - start.minute) / duration, 0, 1);
  const phase = getTimePhase(safeMinutes);

  return {
    phase,
    phaseLabel: getPhaseLabel(phase),
    skyTop: mixColor(start.skyTop, end.skyTop, progress),
    skyBottom: mixColor(start.skyBottom, end.skyBottom, progress),
    horizon: mixColor(start.horizon, end.horizon, progress),
    distantGround: mixColor(start.distantGround, end.distantGround, progress),
    ground: mixColor(start.ground, end.ground, progress),
    buildingTint: mixColor(start.buildingTint, end.buildingTint, progress),
    shadow: mixColor(start.shadow, end.shadow, progress),
    sunColor: mixColor(start.sunColor, end.sunColor, progress),
    sunX: lerp(start.sunX, end.sunX, progress),
    sunY: lerp(start.sunY, end.sunY, progress),
    sunAlpha: lerp(start.sunAlpha, end.sunAlpha, progress),
    starAlpha: lerp(start.starAlpha, end.starAlpha, progress),
    lampAlpha: lerp(start.lampAlpha, end.lampAlpha, progress),
    windowLightAlpha: lerp(start.windowLightAlpha, end.windowLightAlpha, progress),
    warmthAlpha: lerp(start.warmthAlpha, end.warmthAlpha, progress),
  };
}
