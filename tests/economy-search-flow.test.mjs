import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY_START_MINUTES,
  SEARCH_CUTOFF_MINUTES,
  SEARCH_TIME_COST_MINUTES,
  createEconomyState,
  performSearch,
  searchKey,
} from '../src/game/economy/economyCore.mjs';
import { findVendingMachine } from '../src/game/economy/vendingMachines.mjs';
import {
  FLOW_PHASES,
  actionAvailability,
  cancelPrompt,
  chooseAction,
  closeResult,
  createSearchFlow,
  openPrompt,
  resolveSearch,
} from '../src/game/economy/searchFlow.mjs';

const machine = findVendingMachine('res-west-01');

test('flow phases stay within the documented set', () => {
  assert.deepEqual(FLOW_PHASES, ['idle', 'prompt', 'closeup', 'result']);
});

test('flow walks idle, prompt, closeup, result and back to idle', () => {
  const economy = createEconomyState(777);
  const flow = createSearchFlow();
  assert.equal(flow.phase, 'idle');

  const prompt = openPrompt(flow, economy, machine);
  assert.ok(prompt.ok);
  assert.equal(prompt.flow.phase, 'prompt');
  assert.equal(prompt.flow.machineId, 'res-west-01');
  assert.deepEqual(prompt.availability, { under: { ok: true }, coinReturn: { ok: true } });

  const closeup = chooseAction(prompt.flow, economy, 'under');
  assert.ok(closeup.ok);
  assert.equal(closeup.flow.phase, 'closeup');
  assert.equal(closeup.flow.action, 'under');

  const resolved = resolveSearch(closeup.flow, economy);
  assert.ok(resolved.ok);
  assert.equal(resolved.flow.phase, 'result');
  assert.equal(resolved.state.clock.minutes, DAY_START_MINUTES + SEARCH_TIME_COST_MINUTES);
  assert.equal(resolved.state.wallet, resolved.flow.result.amount);
  assert.deepEqual(resolved.state.searchedToday, [searchKey('res-west-01', 'under')]);

  const idle = closeResult(resolved.flow);
  assert.ok(idle.ok);
  assert.deepEqual(idle.flow, createSearchFlow());
});

test('flow result matches a direct economy core search exactly', () => {
  const economy = createEconomyState(20260723);
  const direct = performSearch(economy, 'res-west-01', 'under');
  assert.ok(direct.ok);
  const prompt = openPrompt(createSearchFlow(), economy, machine);
  assert.ok(prompt.ok);
  const closeup = chooseAction(prompt.flow, economy, 'under');
  assert.ok(closeup.ok);
  const resolved = resolveSearch(closeup.flow, economy);
  assert.ok(resolved.ok);
  assert.equal(resolved.flow.result.amount, direct.amount);
  assert.equal(resolved.flow.result.roll, direct.roll);
  assert.deepEqual(resolved.state, direct.state);
});

test('availability marks an action that was already used today', () => {
  const economy = createEconomyState(9);
  const first = performSearch(economy, 'res-west-01', 'under');
  assert.ok(first.ok);
  const availability = actionAvailability(first.state, machine);
  assert.deepEqual(availability.under, { ok: false, reason: 'already-searched-today' });
  assert.deepEqual(availability.coinReturn, { ok: true });
});

test('choosing an unavailable action reports the economy reason', () => {
  const lateEconomy = {
    ...createEconomyState(3),
    clock: { day: 1, minutes: SEARCH_CUTOFF_MINUTES },
  };
  const prompt = openPrompt(createSearchFlow(), lateEconomy, machine);
  assert.ok(prompt.ok);
  assert.deepEqual(prompt.availability.under, { ok: false, reason: 'after-cutoff' });
  assert.deepEqual(chooseAction(prompt.flow, lateEconomy, 'under'), {
    ok: false,
    reason: 'after-cutoff',
  });
  assert.deepEqual(chooseAction(prompt.flow, lateEconomy, 'kick'), {
    ok: false,
    reason: 'invalid-action',
  });
});

test('cancel returns from prompt to idle without touching the economy', () => {
  const economy = createEconomyState(5);
  const prompt = openPrompt(createSearchFlow(), economy, machine);
  assert.ok(prompt.ok);
  const cancelled = cancelPrompt(prompt.flow);
  assert.ok(cancelled.ok);
  assert.equal(cancelled.flow.phase, 'idle');
  assert.deepEqual(economy.searchedToday, []);
  assert.equal(economy.clock.minutes, DAY_START_MINUTES);
});

test('transitions called in the wrong phase are rejected', () => {
  const economy = createEconomyState(8);
  const idleFlow = createSearchFlow();
  assert.deepEqual(chooseAction(idleFlow, economy, 'under'), { ok: false, reason: 'invalid-phase' });
  assert.deepEqual(resolveSearch(idleFlow, economy), { ok: false, reason: 'invalid-phase' });
  assert.deepEqual(closeResult(idleFlow), { ok: false, reason: 'invalid-phase' });
  assert.deepEqual(cancelPrompt(idleFlow), { ok: false, reason: 'invalid-phase' });
  const prompt = openPrompt(idleFlow, economy, machine);
  assert.ok(prompt.ok);
  assert.deepEqual(openPrompt(prompt.flow, economy, machine), {
    ok: false,
    reason: 'invalid-phase',
  });
});
