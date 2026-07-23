import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEARCH_ACTIONS,
  canSearch,
  createEconomyState,
  performSearch,
} from '../src/game/economy/economyCore.mjs';
import {
  VENDING_AREA_IDS,
  VENDING_MACHINES,
  findVendingMachine,
  machinesForArea,
  validateVendingMachine,
  validateVendingMachineList,
} from '../src/game/economy/vendingMachines.mjs';

test('master data ships two residential and two park machines', () => {
  assert.equal(VENDING_MACHINES.length, 4);
  assert.equal(machinesForArea('residential').length, 2);
  assert.equal(machinesForArea('park').length, 2);
});

test('master data passes its own validation', () => {
  assert.deepEqual(validateVendingMachineList(VENDING_MACHINES), { ok: true, errors: [] });
});

test('master machines use known areas, known actions and placeholder positions', () => {
  for (const machine of VENDING_MACHINES) {
    assert.ok(VENDING_AREA_IDS.includes(machine.areaId));
    assert.ok(machine.actions.length > 0);
    for (const action of machine.actions) {
      assert.ok(SEARCH_ACTIONS.includes(action), `unknown action ${action} on ${machine.id}`);
    }
    assert.equal(machine.position, null, 'positions stay null until the M1.3 map is final');
  }
});

test('master machines are searchable through the economy core', () => {
  const state = createEconomyState(1234);
  for (const machine of VENDING_MACHINES) {
    for (const action of machine.actions) {
      assert.deepEqual(canSearch(state, machine.id, action), { ok: true });
    }
  }
  const first = VENDING_MACHINES[0];
  const result = performSearch(state, first.id, first.actions[0]);
  assert.ok(result.ok);
});

test('lookup helpers find machines by id and by area', () => {
  const machine = findVendingMachine('res-west-01');
  assert.ok(machine);
  assert.equal(machine.areaId, 'residential');
  assert.equal(findVendingMachine('missing-id'), null);
  assert.deepEqual(
    machinesForArea('park').map((entry) => entry.id),
    ['park-east-01', 'park-east-02'],
  );
});

test('validation rejects broken machines with precise errors', () => {
  assert.equal(validateVendingMachine(null).ok, false);
  const broken = validateVendingMachine({
    id: '',
    areaId: 'moon',
    displayName: '',
    actions: ['kick'],
    position: { x: 'a' },
  });
  assert.equal(broken.ok, false);
  assert.ok(broken.errors.some((message) => message.includes('id')));
  assert.ok(broken.errors.some((message) => message.includes('areaId')));
  assert.ok(broken.errors.some((message) => message.includes('displayName')));
  assert.ok(broken.errors.some((message) => message.includes('unknown action: kick')));
  assert.ok(broken.errors.some((message) => message.includes('position')));
  const emptyActions = validateVendingMachine({
    id: 'x-01',
    areaId: 'park',
    displayName: 'X',
    actions: [],
    position: null,
  });
  assert.equal(emptyActions.ok, false);
  assert.ok(emptyActions.errors.some((message) => message.includes('actions')));
});

test('list validation flags duplicate ids and accepts future coordinates', () => {
  const machineA = { id: 'dup-01', areaId: 'park', displayName: 'A', actions: ['under'], position: null };
  const machineB = { ...machineA, displayName: 'B', position: { x: 320, y: 480 } };
  const duplicated = validateVendingMachineList([machineA, machineB]);
  assert.equal(duplicated.ok, false);
  assert.ok(duplicated.errors.some((message) => message.includes('duplicate machine id: dup-01')));
  const unique = validateVendingMachineList([machineA, { ...machineB, id: 'dup-02' }]);
  assert.deepEqual(unique, { ok: true, errors: [] });
  assert.equal(validateVendingMachineList('not-an-array').ok, false);
  assert.equal(validateVendingMachineList([]).ok, false);
});
