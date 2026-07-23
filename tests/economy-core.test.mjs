import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  LOOT_TABLES,
  SEARCH_CUTOFF_MINUTES,
  SEARCH_TIME_COST_MINUTES,
  addMoney,
  advanceMinutes,
  canSearch,
  createClock,
  createEconomyState,
  formatClock,
  lootAmountForRoll,
  performSearch,
  spendMoney,
} from '../src/game/economy/economyCore.mjs';
import { hashSeed, mulberry32, rollFromSeed } from '../src/game/economy/rng.mjs';

test('seeded rng is deterministic and uniform in [0, 1)', () => {
  assert.equal(rollFromSeed(12345), rollFromSeed(12345));
  assert.notEqual(rollFromSeed(12345), rollFromSeed(12346));
  const next = mulberry32(99);
  for (let index = 0; index < 1000; index += 1) {
    const value = next();
    assert.ok(value >= 0 && value < 1);
  }
});

test('hash seed separates day, machine and action', () => {
  const base = hashSeed(1, 'day-1', 'res-west-01', 'under');
  assert.equal(base, hashSeed(1, 'day-1', 'res-west-01', 'under'));
  assert.notEqual(base, hashSeed(1, 'day-2', 'res-west-01', 'under'));
  assert.notEqual(base, hashSeed(1, 'day-1', 'res-west-02', 'under'));
  assert.notEqual(base, hashSeed(1, 'day-1', 'res-west-01', 'coinReturn'));
});

test('loot table covers the whole roll range in order', () => {
  assert.equal(lootAmountForRoll(LOOT_TABLES.under, 0), 0);
  assert.equal(lootAmountForRoll(LOOT_TABLES.under, 0.5499), 0);
  assert.equal(lootAmountForRoll(LOOT_TABLES.under, 0.55), 10);
  assert.equal(lootAmountForRoll(LOOT_TABLES.under, 0.9999), 1000);
});

test('loot distribution converges to the configured weights', () => {
  const next = mulberry32(2026);
  const counts = new Map();
  const trials = 200000;
  for (let index = 0; index < trials; index += 1) {
    const amount = lootAmountForRoll(LOOT_TABLES.under, next());
    counts.set(amount, (counts.get(amount) ?? 0) + 1);
  }
  const totalWeight = LOOT_TABLES.under.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of LOOT_TABLES.under) {
    const expected = entry.weight / totalWeight;
    const observed = (counts.get(entry.amount) ?? 0) / trials;
    assert.ok(
      Math.abs(observed - expected) < 0.01,
      `amount ${entry.amount}: expected ${expected}, observed ${observed}`,
    );
  }
});

test('wallet additions and spending clamp to valid amounts', () => {
  assert.equal(addMoney(0, 500), 500);
  assert.equal(addMoney(999990, 1000), 999999);
  assert.deepEqual(spendMoney(100, 40), { ok: true, wallet: 60 });
  assert.deepEqual(spendMoney(30, 40), { ok: false, wallet: 30 });
});

test('clock starts at 6:00, consumes 15 minutes and caps at 21:00', () => {
  const clock = createClock(1);
  assert.equal(clock.minutes, DAY_START_MINUTES);
  assert.equal(formatClock(clock), '6:00');
  const after = advanceMinutes(clock, SEARCH_TIME_COST_MINUTES);
  assert.equal(after.minutes, DAY_START_MINUTES + 15);
  assert.equal(formatClock(after), '6:15');
  const capped = advanceMinutes({ day: 1, minutes: DAY_END_MINUTES - 5 }, 60);
  assert.equal(capped.minutes, DAY_END_MINUTES);
});

test('search is deterministic for the same day, machine and action', () => {
  const state = createEconomyState(777);
  const first = performSearch(state, 'res-west-01', 'under');
  const second = performSearch(state, 'res-west-01', 'under');
  assert.ok(first.ok && second.ok);
  assert.equal(first.amount, second.amount);
  assert.equal(first.roll, second.roll);
});

test('search consumes 15 minutes, pays out and records the attempt', () => {
  const state = createEconomyState(42);
  const result = performSearch(state, 'res-west-01', 'under');
  assert.ok(result.ok);
  assert.equal(result.state.clock.minutes, DAY_START_MINUTES + SEARCH_TIME_COST_MINUTES);
  assert.equal(result.state.wallet, state.wallet + result.amount);
  assert.deepEqual(result.state.searchedToday, ['res-west-01#under']);
  assert.deepEqual(state.searchedToday, [], 'input state must stay unchanged');
});

test('the same machine and action is rejected for the rest of the day', () => {
  const state = createEconomyState(42);
  const first = performSearch(state, 'res-west-01', 'under');
  assert.ok(first.ok);
  const repeat = performSearch(first.state, 'res-west-01', 'under');
  assert.deepEqual(repeat, { ok: false, reason: 'already-searched-today' });
  const otherAction = performSearch(first.state, 'res-west-01', 'coinReturn');
  assert.ok(otherAction.ok, 'the other action of the same machine stays available');
  const otherMachine = performSearch(first.state, 'res-west-02', 'under');
  assert.ok(otherMachine.ok, 'other machines stay available');
});

test('searching stops at the 18:00 cutoff but may finish across it', () => {
  const beforeCutoff = {
    ...createEconomyState(7),
    clock: { day: 1, minutes: SEARCH_CUTOFF_MINUTES - 1 },
  };
  const started = performSearch(beforeCutoff, 'res-west-01', 'under');
  assert.ok(started.ok, 'a search started before 18:00 completes');
  assert.equal(started.state.clock.minutes, SEARCH_CUTOFF_MINUTES + 14);

  const atCutoff = {
    ...createEconomyState(7),
    clock: { day: 1, minutes: SEARCH_CUTOFF_MINUTES },
  };
  assert.deepEqual(performSearch(atCutoff, 'res-west-01', 'under'), {
    ok: false,
    reason: 'after-cutoff',
  });
});

test('unknown search actions are rejected', () => {
  const state = createEconomyState(1);
  assert.deepEqual(canSearch(state, 'res-west-01', 'kick'), {
    ok: false,
    reason: 'invalid-action',
  });
});
