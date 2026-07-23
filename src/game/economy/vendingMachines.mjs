import { SEARCH_ACTIONS } from './economyCore.mjs';

export const VENDING_AREA_IDS = ['residential', 'park'];

// 座標はM1.3のマップ確定後に設定する。それまでpositionはnullのままにする。
export const VENDING_MACHINES = [
  {
    id: 'res-west-01',
    areaId: 'residential',
    displayName: 'いえのまえの じはんき',
    actions: ['under', 'coinReturn'],
    position: null,
  },
  {
    id: 'res-west-02',
    areaId: 'residential',
    displayName: 'さかしたの じはんき',
    actions: ['under', 'coinReturn'],
    position: null,
  },
  {
    id: 'park-east-01',
    areaId: 'park',
    displayName: 'こうえんいりぐちの じはんき',
    actions: ['under', 'coinReturn'],
    position: null,
  },
  {
    id: 'park-east-02',
    areaId: 'park',
    displayName: 'ベンチよこの じはんき',
    actions: ['under', 'coinReturn'],
    position: null,
  },
];

function isValidPosition(position) {
  if (position === null) {
    return true;
  }
  return (
    typeof position === 'object' &&
    position !== null &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  );
}

export function validateVendingMachine(machine) {
  if (typeof machine !== 'object' || machine === null) {
    return { ok: false, errors: ['machine must be an object'] };
  }

  const errors = [];
  if (typeof machine.id !== 'string' || machine.id.length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (!VENDING_AREA_IDS.includes(machine.areaId)) {
    errors.push(`areaId must be one of: ${VENDING_AREA_IDS.join(', ')}`);
  }
  if (typeof machine.displayName !== 'string' || machine.displayName.length === 0) {
    errors.push('displayName must be a non-empty string');
  }
  if (!Array.isArray(machine.actions) || machine.actions.length === 0) {
    errors.push('actions must be a non-empty array');
  } else {
    for (const action of machine.actions) {
      if (!SEARCH_ACTIONS.includes(action)) {
        errors.push(`unknown action: ${String(action)}`);
      }
    }
    if (new Set(machine.actions).size !== machine.actions.length) {
      errors.push('actions must not contain duplicates');
    }
  }
  if (!isValidPosition(machine.position)) {
    errors.push('position must be null or { x: number, y: number }');
  }

  return { ok: errors.length === 0, errors };
}

export function validateVendingMachineList(machines) {
  if (!Array.isArray(machines) || machines.length === 0) {
    return { ok: false, errors: ['machines must be a non-empty array'] };
  }

  const errors = [];
  const seenIds = new Set();
  machines.forEach((machine, index) => {
    const single = validateVendingMachine(machine);
    const label = single.ok ? machine.id : `machines[${index}]`;
    for (const message of single.errors) {
      errors.push(`${label}: ${message}`);
    }
    if (single.ok) {
      if (seenIds.has(machine.id)) {
        errors.push(`duplicate machine id: ${machine.id}`);
      }
      seenIds.add(machine.id);
    }
  });

  return { ok: errors.length === 0, errors };
}

export function findVendingMachine(machineId, machines = VENDING_MACHINES) {
  return machines.find((machine) => machine.id === machineId) ?? null;
}

export function machinesForArea(areaId, machines = VENDING_MACHINES) {
  return machines.filter((machine) => machine.areaId === areaId);
}
