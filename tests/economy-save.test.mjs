import assert from 'node:assert/strict';
import test from 'node:test';
import { createEconomyState, performSearch } from '../src/game/economy/economyCore.mjs';
import {
  SAVE_KEY,
  SAVE_VERSION,
  deserializeEconomyState,
  loadFromStorage,
  saveToStorage,
  serializeEconomyState,
} from '../src/game/economy/saveData.mjs';

function createMemoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
    entries,
  };
}

test('serialize and deserialize restore the exact economy state', () => {
  const initial = createEconomyState(20260801);
  const searched = performSearch(initial, 'res-west-01', 'under');
  assert.ok(searched.ok);
  const restored = deserializeEconomyState(serializeEconomyState(searched.state));
  assert.ok(restored.ok);
  assert.deepEqual(restored.state, searched.state);
});

test('storage round trip uses the versioned save key', () => {
  const storage = createMemoryStorage();
  const state = createEconomyState(5);
  saveToStorage(storage, state);
  assert.ok(storage.entries.has(SAVE_KEY));
  const payload = JSON.parse(storage.entries.get(SAVE_KEY));
  assert.equal(payload.version, SAVE_VERSION);
  const loaded = loadFromStorage(storage);
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.state, state);
});

test('missing, corrupted and foreign payloads are rejected safely', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadFromStorage(storage), { ok: false, error: 'not-found' });
  assert.deepEqual(deserializeEconomyState('{broken'), { ok: false, error: 'invalid-json' });
  assert.deepEqual(deserializeEconomyState('"text"'), { ok: false, error: 'invalid-payload' });
  assert.deepEqual(deserializeEconomyState(JSON.stringify({ version: 999 })), {
    ok: false,
    error: 'unsupported-version',
  });
  assert.deepEqual(
    deserializeEconomyState(
      JSON.stringify({ version: SAVE_VERSION, seed: -1, wallet: 0, clock: { day: 1, minutes: 360 }, searchedToday: [] }),
    ),
    { ok: false, error: 'invalid-state' },
  );
});

test('deserialized state keeps working for further searches', () => {
  const day = createEconomyState(31);
  const first = performSearch(day, 'park-east-01', 'coinReturn');
  assert.ok(first.ok);
  const reloaded = deserializeEconomyState(serializeEconomyState(first.state));
  assert.ok(reloaded.ok);
  const repeat = performSearch(reloaded.state, 'park-east-01', 'coinReturn');
  assert.deepEqual(repeat, { ok: false, reason: 'already-searched-today' });
  const other = performSearch(reloaded.state, 'park-east-02', 'under');
  assert.ok(other.ok);
});
