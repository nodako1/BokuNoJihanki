import type { CanSearchResult, EconomyState, SearchAction, SearchDenyReason } from './economyCore.mjs';
import type { VendingMachine } from './vendingMachines.mjs';

export type SearchFlowPhase = 'idle' | 'prompt' | 'closeup' | 'result';
export type SearchFlowDenyReason = SearchDenyReason | 'invalid-phase';

export interface SearchFlowResultPayload {
  amount: number;
  roll: number;
}

export interface SearchFlowState {
  phase: SearchFlowPhase;
  machineId: string | null;
  action: SearchAction | null;
  result: SearchFlowResultPayload | null;
}

export type SearchActionAvailability = Partial<Record<SearchAction, CanSearchResult>>;

export interface SearchFlowFailure {
  ok: false;
  reason: SearchFlowDenyReason;
}

export interface SearchFlowTransition {
  ok: true;
  flow: SearchFlowState;
}

export interface OpenPromptSuccess extends SearchFlowTransition {
  availability: SearchActionAvailability;
}

export interface ResolveSearchSuccess extends SearchFlowTransition {
  state: EconomyState;
}

export const FLOW_PHASES: SearchFlowPhase[];

export function createSearchFlow(): SearchFlowState;
export function actionAvailability(economyState: EconomyState, machine: VendingMachine): SearchActionAvailability;
export function openPrompt(
  flow: SearchFlowState,
  economyState: EconomyState,
  machine: VendingMachine,
): OpenPromptSuccess | SearchFlowFailure;
export function cancelPrompt(flow: SearchFlowState): SearchFlowTransition | SearchFlowFailure;
export function chooseAction(
  flow: SearchFlowState,
  economyState: EconomyState,
  action: string,
): SearchFlowTransition | SearchFlowFailure;
export function resolveSearch(
  flow: SearchFlowState,
  economyState: EconomyState,
): ResolveSearchSuccess | SearchFlowFailure;
export function closeResult(flow: SearchFlowState): SearchFlowTransition | SearchFlowFailure;
