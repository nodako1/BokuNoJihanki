import { canSearch, performSearch } from './economyCore.mjs';

export const FLOW_PHASES = ['idle', 'prompt', 'closeup', 'result'];

export function createSearchFlow() {
  return { phase: 'idle', machineId: null, action: null, result: null };
}

function invalidPhase() {
  return { ok: false, reason: 'invalid-phase' };
}

export function actionAvailability(economyState, machine) {
  const availability = {};
  for (const action of machine.actions) {
    availability[action] = canSearch(economyState, machine.id, action);
  }
  return availability;
}

export function openPrompt(flow, economyState, machine) {
  if (flow.phase !== 'idle') {
    return invalidPhase();
  }
  return {
    ok: true,
    flow: { phase: 'prompt', machineId: machine.id, action: null, result: null },
    availability: actionAvailability(economyState, machine),
  };
}

export function cancelPrompt(flow) {
  if (flow.phase !== 'prompt') {
    return invalidPhase();
  }
  return { ok: true, flow: createSearchFlow() };
}

export function chooseAction(flow, economyState, action) {
  if (flow.phase !== 'prompt') {
    return invalidPhase();
  }
  const allowed = canSearch(economyState, flow.machineId, action);
  if (!allowed.ok) {
    return { ok: false, reason: allowed.reason };
  }
  return { ok: true, flow: { ...flow, phase: 'closeup', action } };
}

export function resolveSearch(flow, economyState) {
  if (flow.phase !== 'closeup') {
    return invalidPhase();
  }
  const outcome = performSearch(economyState, flow.machineId, flow.action);
  if (!outcome.ok) {
    return { ok: false, reason: outcome.reason };
  }
  return {
    ok: true,
    flow: { ...flow, phase: 'result', result: { amount: outcome.amount, roll: outcome.roll } },
    state: outcome.state,
  };
}

export function closeResult(flow) {
  if (flow.phase !== 'result') {
    return invalidPhase();
  }
  return { ok: true, flow: createSearchFlow() };
}
