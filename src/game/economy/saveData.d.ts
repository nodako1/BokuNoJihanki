import type { EconomyState } from './economyCore.mjs';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveLoadSuccess {
  ok: true;
  state: EconomyState;
}

export interface SaveLoadFailure {
  ok: false;
  error: string;
}

export type SaveLoadResult = SaveLoadSuccess | SaveLoadFailure;

export const SAVE_KEY: string;
export const SAVE_VERSION: number;

export function serializeEconomyState(state: EconomyState): string;
export function deserializeEconomyState(raw: string): SaveLoadResult;
export function saveToStorage(storage: StorageLike, state: EconomyState): void;
export function loadFromStorage(storage: StorageLike): SaveLoadResult;
