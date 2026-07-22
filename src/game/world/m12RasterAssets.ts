import type { TimePhase } from '../systems/timeOfDay';

export const M12_RASTER_ROOT = '/assets/images/m12';

export const M12_CHUNK_IDS = [
  'residential-west',
  'residential-east',
  'park-west',
  'park-east',
] as const;

export type M12ChunkId = (typeof M12_CHUNK_IDS)[number];

export const M12_PHASES: readonly TimePhase[] = ['morning', 'day', 'evening', 'night'];

export function m12BackgroundKey(chunkId: M12ChunkId, phase: TimePhase): string {
  return `m12-bg-${chunkId}-${phase}`;
}

export function m12ForegroundKey(chunkId: M12ChunkId, phase: TimePhase): string {
  return `m12-fg-${chunkId}-${phase}`;
}

export function m12BackgroundPath(chunkId: M12ChunkId, phase: TimePhase): string {
  return `${M12_RASTER_ROOT}/bg-${chunkId}-${phase}.webp`;
}

export function m12ForegroundPath(chunkId: M12ChunkId, phase: TimePhase): string {
  return `${M12_RASTER_ROOT}/fg-${chunkId}-${phase}.webp`;
}

export function m12PlayerKey(direction: 'down' | 'up' | 'left' | 'right', step: 0 | 1): string {
  return `m12-player-${direction}-${step}`;
}

export function m12PlayerPath(direction: 'down' | 'up' | 'left' | 'right', step: 0 | 1): string {
  return `${M12_RASTER_ROOT}/player-${direction}-${step}.webp`;
}

export const M12_TRANSPARENT_KEY = 'm12-transparent';
export const M12_TRANSPARENT_PATH = `${M12_RASTER_ROOT}/transparent.webp`;
