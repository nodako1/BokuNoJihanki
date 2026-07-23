import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  advanceMinutes,
  createEconomyState,
  performSearch,
} from '../src/game/economy/economyCore.mjs';
import { deserializeEconomyState, serializeEconomyState } from '../src/game/economy/saveData.mjs';
import {
  FORCED_RETURN_MINUTES,
  shouldForceReturn,
  startNextDay,
} from '../src/game/economy/dayCycle.mjs';

test('forced return triggers exactly at 21:00', () => {
  assert.equal(FORCED_RETURN_MINUTES, DAY_END_MINUTES);
  assert.equal(shouldForceReturn({ day: 1, minutes: DAY_END_MINUTES - 1 }), false);
  assert.equal(shouldForceReturn({ day: 1, minutes: DAY_END_MINUTES }), true);
  const capped = advanceMinutes({ day: 1, minutes: DAY_END_MINUTES - 5 }, 120);
  assert.equal(shouldForceReturn(capped), true, 'the capped clock still triggers the return');
});

test('the next day starts at 6:00 with day + 1 and a cleared search history', () => {
  const start = createEconomyState(42);
  const searched = performSearch(start, 'res-west-01', 'under');
  assert.ok(searched.ok);
  const evening = { ...searched.state, clock: { day: 1, minutes: DAY_END_MINUTES } };
  const nextDay = startNextDay(evening);
  assert.equal(nextDay.clock.day, 2);
  assert.equal(nextDay.clock.minutes, DAY_START_MINUTES);
  assert.deepEqual(nextDay.searchedToday, []);
  assert.equal(nextDay.wallet, evening.wallet, 'the wallet carries over');
  assert.equal(nextDay.seed, evening.seed, 'the seed carries over');
  assert.equal(startNextDay(nextDay).clock.day, 3, 'days keep counting up');
  assert.deepEqual(evening.searchedToday, ['res-west-01#under'], 'input state must stay unchanged');
});

test('the same machine becomes searchable again with a fresh daily roll', () => {
  const start = createEconomyState(2026);
  const day1 = performSearch(start, 'res-west-01', 'under');
  assert.ok(day1.ok);
  assert.deepEqual(performSearch(day1.state, 'res-west-01', 'under'), {
    ok: false,
    reason: 'already-searched-today',
  });
  const day2 = performSearch(startNextDay(day1.state), 'res-west-01', 'under');
  assert.ok(day2.ok, 'the daily limit resets on the next day');
  assert.notEqual(day2.roll, day1.roll, 'the roll seed includes the day number');
});

test('a next-day state still fits the v1 save schema', () => {
  const start = createEconomyState(7);
  const searched = performSearch(start, 'park-east-01', 'coinReturn');
  assert.ok(searched.ok);
  const nextDay = startNextDay(searched.state);
  const restored = deserializeEconomyState(serializeEconomyState(nextDay));
  assert.ok(restored.ok);
  assert.deepEqual(restored.state, nextDay);
});
