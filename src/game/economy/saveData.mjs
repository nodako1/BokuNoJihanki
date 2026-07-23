import { DAY_END_MINUTES, DAY_START_MINUTES } from './economyCore.mjs';

export const SAVE_KEY = 'boku-no-jihanki:save:v1';
export const SAVE_VERSION = 1;

function isValidClock(clock) {
  return (
    typeof clock === 'object' &&
    clock !== null &&
    Number.isInteger(clock.day) &&
    clock.day >= 1 &&
    Number.isInteger(clock.minutes) &&
    clock.minutes >= DAY_START_MINUTES &&
    clock.minutes <= DAY_END_MINUTES
  );
}

function isValidState(state) {
  return (
    typeof state === 'object' &&
    state !== null &&
    Number.isInteger(state.seed) &&
    state.seed >= 0 &&
    Number.isInteger(state.wallet) &&
    state.wallet >= 0 &&
    isValidClock(state.clock) &&
    Array.isArray(state.searchedToday) &&
    state.searchedToday.every((entry) => typeof entry === 'string')
  );
}

export function serializeEconomyState(state) {
  return JSON.stringify({
    version: SAVE_VERSION,
    seed: state.seed,
    wallet: state.wallet,
    clock: { day: state.clock.day, minutes: state.clock.minutes },
    searchedToday: [...state.searchedToday],
  });
}

export function deserializeEconomyState(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'invalid-payload' };
  }
  if (parsed.version !== SAVE_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }

  const state = {
    seed: parsed.seed,
    wallet: parsed.wallet,
    clock: parsed.clock,
    searchedToday: parsed.searchedToday,
  };
  if (!isValidState(state)) {
    return { ok: false, error: 'invalid-state' };
  }

  return {
    ok: true,
    state: {
      seed: state.seed,
      wallet: state.wallet,
      clock: { day: state.clock.day, minutes: state.clock.minutes },
      searchedToday: [...state.searchedToday],
    },
  };
}

export function saveToStorage(storage, state) {
  storage.setItem(SAVE_KEY, serializeEconomyState(state));
}

export function loadFromStorage(storage) {
  const raw = storage.getItem(SAVE_KEY);
  if (raw === null || raw === undefined) {
    return { ok: false, error: 'not-found' };
  }
  return deserializeEconomyState(raw);
}
