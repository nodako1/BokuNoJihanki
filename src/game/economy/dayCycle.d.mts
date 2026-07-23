import type { EconomyState, GameClock } from './economyCore.mjs';

export const FORCED_RETURN_MINUTES: number;

export function shouldForceReturn(clock: GameClock): boolean;
export function startNextDay(state: EconomyState): EconomyState;
