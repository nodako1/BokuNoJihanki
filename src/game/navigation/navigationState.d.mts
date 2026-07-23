import type { AreaExit, AreaGraph } from './areaGraph.d.mts';
import type { NavigationTransitionPhase } from './areaTransitionState.d.mts';
import type { Facing } from '../systems/walkableMovement.d.mts';

export interface PendingExit {
  readonly sourceAreaId: string;
  readonly exitId: string;
  readonly direction: AreaExit['direction'];
  readonly targetAreaId: string;
  readonly targetSpawnId: string;
  readonly transitionType: AreaExit['transitionType'];
  readonly prompt?: string;
}

export interface PreviousPosition {
  readonly areaId: string;
  readonly spawnId: string;
  readonly facing: Facing;
}

export interface ResolvedSpawn {
  readonly areaId: string;
  readonly spawnId: string;
  readonly x: number;
  readonly facing: Facing;
}

export interface LastTransitionInfo {
  readonly result: 'completed' | 'cancelled' | 'error';
  readonly sourceAreaId: string;
  readonly targetAreaId?: string;
  readonly message?: string;
  readonly at: number;
}

export interface NavigationState {
  readonly phase: NavigationTransitionPhase;
  readonly currentAreaId: string;
  readonly currentSpawnId: string;
  readonly facing: Facing;
  readonly pendingExit: PendingExit | null;
  readonly previousPosition: PreviousPosition | null;
  readonly resolvedSpawn: ResolvedSpawn | null;
  readonly lastTransition: LastTransitionInfo | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface BeginTransitionOptions {
  readonly now?: number;
  readonly metadataPatch?: Readonly<Record<string, unknown>>;
}

export interface ResolveSpawnOptions {
  readonly now?: number;
  readonly facingOverride?: Facing;
}

export interface FinishTransitionOptions {
  readonly now?: number;
}

export function createNavigationState(
  initialAreaId: string,
  initialSpawnId: string,
  initialFacing?: Facing,
  metadata?: Readonly<Record<string, unknown>>,
): NavigationState;

export function isInputLocked(state: NavigationState): boolean;
export function isReadyForTransition(state: NavigationState): boolean;

export function beginAreaTransition(
  state: NavigationState,
  exit: AreaExit,
  options?: BeginTransitionOptions,
): NavigationState;

export function startFadeOut(state: NavigationState): NavigationState;
export function markAreaLoading(state: NavigationState): NavigationState;

export function resolveAreaSpawn(
  state: NavigationState,
  graph: AreaGraph,
  options?: ResolveSpawnOptions,
): NavigationState;

export function markFadingIn(state: NavigationState): NavigationState;

export function completeAreaTransition(state: NavigationState, options?: FinishTransitionOptions): NavigationState;
export function cancelAreaTransition(state: NavigationState, options?: FinishTransitionOptions): NavigationState;
