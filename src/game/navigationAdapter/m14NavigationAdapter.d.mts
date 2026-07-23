import type {
  M14AreaDefinition,
  M14AreaId,
  M14Direction,
  M14Facing,
} from '../areas/m14AreaData.mjs';

export interface M14HorizontalMotionConfig {
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly stopEpsilon: number;
}

export interface M14DirectionalInput {
  readonly x?: number;
  readonly y?: number;
  readonly horizontalAxis?: number;
  readonly left?: boolean;
  readonly right?: boolean;
  readonly up?: boolean;
  readonly down?: boolean;
}

export interface M14HorizontalMovementState {
  readonly x: number;
  readonly velocityX: number;
  readonly facing: M14Facing;
}

export interface M14HorizontalMovementResult extends M14HorizontalMovementState {
  readonly y: number;
  readonly movedX: number;
  readonly moving: boolean;
  readonly blocked: boolean;
}

export interface M14HorizontalStep {
  readonly x: number;
  readonly velocity: number;
  readonly input: number | M14DirectionalInput;
  readonly deltaMs: number;
  readonly worldWidth: number;
  readonly locked: boolean;
  readonly config?: M14HorizontalMotionConfig;
}

export interface M14HorizontalStepResult {
  readonly x: number;
  readonly velocity: number;
  readonly moved: number;
  readonly blocked: boolean;
}

export interface M14ResolvedTransition {
  readonly exitId: string;
  readonly direction: M14Direction;
  readonly sourceAreaId: M14AreaId;
  readonly targetAreaId: M14AreaId;
  readonly targetSpawnId: string;
  readonly spawnId: string;
  readonly targetX: number;
  readonly x: number;
  readonly targetGroundY: number;
  readonly targetFacing: M14Facing;
  readonly facing: M14Facing;
}

export type M14TransitionPhase =
  | 'idle'
  | 'fading-out'
  | 'loading'
  | 'fading-in';
export type M14TransitionEvent =
  | 'start'
  | 'fade-out-complete'
  | 'scene-ready'
  | 'fade-in-complete'
  | 'reset';

export interface M14TransitionContext {
  readonly timeMinutes?: number;
  readonly timePhase?: string;
  readonly audioEnabled?: boolean;
  readonly [key: string]: unknown;
}

export interface M14TransitionState {
  readonly phase: M14TransitionPhase;
  readonly currentAreaId: M14AreaId;
  readonly currentSpawnId: string;
  readonly pendingTransition: M14ResolvedTransition | null;
  readonly lastTransition: M14ResolvedTransition | null;
  readonly context: Readonly<M14TransitionContext>;
}

export type M14TransitionAction =
  | { readonly type: 'start'; readonly transition: M14ResolvedTransition }
  | { readonly type: Exclude<M14TransitionEvent, 'start'> };

export interface M14InterpretedInput {
  readonly horizontalAxis: number;
  readonly branchDirections: readonly ('up' | 'down')[];
  readonly requestedBranchDirection: 'up' | 'down' | null;
  readonly transition: M14ResolvedTransition | null;
  readonly locked: boolean;
}

export const HORIZONTAL_MOTION_CONFIG: Readonly<M14HorizontalMotionConfig>;
export const M14_TRANSITION_PHASES: readonly M14TransitionPhase[];

export function horizontalAxisFromInput(
  input: number | M14DirectionalInput | null | undefined,
): number;
export function stepHorizontalVelocity(
  velocityX: number,
  input: number | M14DirectionalInput,
  deltaSeconds: number,
  config?: M14HorizontalMotionConfig,
): number;
export function clampPlayerX(
  areaId: M14AreaId,
  x: number,
  playerHalfWidth?: number,
): number;
export function stepHorizontalMovement(
  step: M14HorizontalStep,
): M14HorizontalStepResult;
export function stepHorizontalMovement(
  state: M14HorizontalMovementState,
  input: number | M14DirectionalInput,
  deltaSeconds: number,
  areaId: M14AreaId,
  playerHalfWidth?: number,
  config?: M14HorizontalMotionConfig,
): M14HorizontalMovementResult;
export function clampCameraScrollX(
  areaId: M14AreaId,
  scrollX: number,
  viewportWidth: number,
): number;
export function getM14CameraScrollX(
  areaId: M14AreaId,
  playerX: number,
  velocityX: number,
  viewportWidth: number,
  lookAheadFactor?: number,
  maxLookAhead?: number,
): number;
export function getAvailableBranchDirections(
  areaId: M14AreaId,
  x: number,
): ('up' | 'down')[];
export function isBranchAvailable(
  areaId: M14AreaId,
  direction: 'up' | 'down',
  x: number,
): boolean;
export function resolveAreaExit(
  areaId: M14AreaId,
  direction: M14Direction,
  x?: number,
  transitionState?: M14TransitionPhase | M14TransitionState,
): M14ResolvedTransition | null;
export function interpretM14Input(
  areaId: M14AreaId,
  x: number,
  input: number | M14DirectionalInput,
  transitionState?: M14TransitionPhase | M14TransitionState,
): M14InterpretedInput;
export function nextM14TransitionPhase(
  phase: M14TransitionPhase,
  event: M14TransitionEvent,
): M14TransitionPhase;
export function isM14InputLocked(
  transitionState: M14TransitionPhase | M14TransitionState,
): boolean;
export function createM14TransitionState(
  areaId?: M14AreaId,
  spawnId?: string,
  context?: M14TransitionContext,
): M14TransitionState;
export function reduceM14Transition(
  state: M14TransitionState,
  action: M14TransitionAction | M14TransitionEvent,
): M14TransitionState;
export function reduceM14Transition(
  state: M14TransitionPhase,
  action: M14TransitionAction | M14TransitionEvent,
): M14TransitionPhase;
export function validateM14AreaGraph(
  areas?: Readonly<Record<string, M14AreaDefinition>>,
): string[];
export function assertValidM14AreaGraph<T extends Readonly<Record<string, M14AreaDefinition>>>(
  areas?: T,
): T extends undefined ? Readonly<Record<M14AreaId, M14AreaDefinition>> : T;
