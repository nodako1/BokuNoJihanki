import { DAY_END_MINUTES, DAY_START_MINUTES } from './economyCore.mjs';

export const FORCED_RETURN_MINUTES = DAY_END_MINUTES;

export function shouldForceReturn(clock) {
  return clock.minutes >= FORCED_RETURN_MINUTES;
}

export function startNextDay(state) {
  return {
    seed: state.seed,
    wallet: state.wallet,
    clock: { day: state.clock.day + 1, minutes: DAY_START_MINUTES },
    searchedToday: [],
  };
}
