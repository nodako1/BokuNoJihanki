export interface GameClock {
  day: number;
  minutes: number;
}

export interface EconomyState {
  seed: number;
  wallet: number;
  clock: GameClock;
  searchedToday: string[];
}

export type SearchAction = 'under' | 'coinReturn';
export type SearchDenyReason = 'invalid-action' | 'after-cutoff' | 'already-searched-today';

export interface LootEntry {
  amount: number;
  weight: number;
}

export interface SearchSuccess {
  ok: true;
  state: EconomyState;
  amount: number;
  roll: number;
}

export interface SearchFailure {
  ok: false;
  reason: SearchDenyReason;
}

export type SearchResult = SearchSuccess | SearchFailure;

export interface SpendResult {
  ok: boolean;
  wallet: number;
}

export interface CanSearchSuccess {
  ok: true;
}

export type CanSearchResult = CanSearchSuccess | SearchFailure;

export const DAY_START_MINUTES: number;
export const SEARCH_CUTOFF_MINUTES: number;
export const DAY_END_MINUTES: number;
export const SEARCH_TIME_COST_MINUTES: number;
export const MAX_WALLET: number;
export const SEARCH_ACTIONS: SearchAction[];
export const LOOT_TABLES: Record<SearchAction, LootEntry[]>;

export function clampWallet(amount: number): number;
export function addMoney(wallet: number, amount: number): number;
export function spendMoney(wallet: number, amount: number): SpendResult;
export function createClock(day?: number): GameClock;
export function advanceMinutes(clock: GameClock, minutes: number): GameClock;
export function formatClock(clock: GameClock): string;
export function isBeforeSearchCutoff(minutes: number): boolean;
export function searchKey(machineId: string, action: string): string;
export function lootAmountForRoll(table: LootEntry[], roll: number): number;
export function createEconomyState(seed?: number): EconomyState;
export function canSearch(state: EconomyState, machineId: string, action: string): CanSearchResult;
export function performSearch(state: EconomyState, machineId: string, action: string): SearchResult;
