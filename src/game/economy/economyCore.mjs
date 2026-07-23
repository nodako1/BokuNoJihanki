import { hashSeed, rollFromSeed } from './rng.mjs';

export const DAY_START_MINUTES = 360;
export const SEARCH_CUTOFF_MINUTES = 1080;
export const DAY_END_MINUTES = 1260;
export const SEARCH_TIME_COST_MINUTES = 15;
export const MAX_WALLET = 999999;
export const SEARCH_ACTIONS = ['under', 'coinReturn'];

export const LOOT_TABLES = {
  under: [
    { amount: 0, weight: 550 },
    { amount: 10, weight: 200 },
    { amount: 50, weight: 100 },
    { amount: 100, weight: 100 },
    { amount: 500, weight: 40 },
    { amount: 1000, weight: 10 },
  ],
  coinReturn: [
    { amount: 0, weight: 600 },
    { amount: 10, weight: 250 },
    { amount: 50, weight: 80 },
    { amount: 100, weight: 50 },
    { amount: 500, weight: 15 },
    { amount: 1000, weight: 5 },
  ],
};

export function clampWallet(amount) {
  return Math.min(MAX_WALLET, Math.max(0, Math.round(amount)));
}

export function addMoney(wallet, amount) {
  return clampWallet(wallet + Math.max(0, Math.round(amount)));
}

export function spendMoney(wallet, amount) {
  const cost = Math.max(0, Math.round(amount));
  if (cost > wallet) {
    return { ok: false, wallet };
  }
  return { ok: true, wallet: clampWallet(wallet - cost) };
}

export function createClock(day = 1) {
  return { day, minutes: DAY_START_MINUTES };
}

export function advanceMinutes(clock, minutes) {
  const added = Math.max(0, Math.round(minutes));
  return {
    day: clock.day,
    minutes: Math.min(DAY_END_MINUTES, clock.minutes + added),
  };
}

export function formatClock(clock) {
  const hours = Math.floor(clock.minutes / 60);
  const minutes = clock.minutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

export function isBeforeSearchCutoff(minutes) {
  return minutes < SEARCH_CUTOFF_MINUTES;
}

export function searchKey(machineId, action) {
  return `${machineId}#${action}`;
}

export function lootAmountForRoll(table, roll) {
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  const target = roll * totalWeight;
  let cumulative = 0;
  for (const entry of table) {
    cumulative += entry.weight;
    if (target < cumulative) {
      return entry.amount;
    }
  }
  return table[table.length - 1].amount;
}

export function createEconomyState(seed = 1) {
  return {
    seed: seed >>> 0,
    wallet: 0,
    clock: createClock(1),
    searchedToday: [],
  };
}

export function canSearch(state, machineId, action) {
  if (!SEARCH_ACTIONS.includes(action)) {
    return { ok: false, reason: 'invalid-action' };
  }
  if (!isBeforeSearchCutoff(state.clock.minutes)) {
    return { ok: false, reason: 'after-cutoff' };
  }
  if (state.searchedToday.includes(searchKey(machineId, action))) {
    return { ok: false, reason: 'already-searched-today' };
  }
  return { ok: true };
}

export function performSearch(state, machineId, action) {
  const allowed = canSearch(state, machineId, action);
  if (!allowed.ok) {
    return allowed;
  }

  const roll = rollFromSeed(hashSeed(state.seed, `day-${state.clock.day}`, machineId, action));
  const amount = lootAmountForRoll(LOOT_TABLES[action], roll);
  const nextState = {
    seed: state.seed,
    wallet: addMoney(state.wallet, amount),
    clock: advanceMinutes(state.clock, SEARCH_TIME_COST_MINUTES),
    searchedToday: [...state.searchedToday, searchKey(machineId, action)],
  };

  return { ok: true, state: nextState, amount, roll };
}
