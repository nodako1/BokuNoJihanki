import type { Facing } from '../systems/walkableMovement.d.mts';

export type { Facing };

export interface HorizontalMovementConfig {
  /** Maximum horizontal speed in px/s. */
  readonly maxSpeed: number;
  /** Acceleration applied while a direction is held, in px/s^2. */
  readonly acceleration: number;
  /** Deceleration applied while no (usable) direction is held, in px/s^2. */
  readonly deceleration: number;
  /** Maximum per-substep displacement in px, to prevent tunneling through thin obstacles. Defaults to 4. */
  readonly maxSubstep?: number;
}

export interface HorizontalMovementInput {
  readonly left: boolean;
  readonly right: boolean;
  /** Elapsed time for this update, in seconds. */
  readonly deltaSeconds: number;
  /** When true, all directional input is ignored and position does not change this frame. */
  readonly locked?: boolean;
}

export interface HorizontalObstacleRange {
  readonly minX: number;
  readonly maxX: number;
}

export interface HorizontalMovementBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly obstacles?: readonly HorizontalObstacleRange[];
}

export interface HorizontalMovementState {
  readonly x: number;
  readonly velocityX: number;
  readonly facing: Facing;
}

export interface HorizontalMovementResult extends HorizontalMovementState {
  readonly moving: boolean;
  readonly blocked: boolean;
  readonly reachedLeftEdge: boolean;
  readonly reachedRightEdge: boolean;
}

/**
 * Resolves one frame of left/right-only movement: acceleration, deceleration,
 * a hard maximum speed, sub-stepped integration (so a large `deltaSeconds`
 * cannot tunnel through a thin obstacle), area-bounds clamping and obstacle
 * ranges. Pure and frame-rate independent - no Phaser/React/DOM/localStorage
 * dependency. Reuses clamp/approach/chooseFacing from
 * ../systems/walkableMovement.mjs instead of duplicating them.
 */
export function resolveHorizontalMovement(
  state: HorizontalMovementState,
  input: HorizontalMovementInput,
  config: HorizontalMovementConfig,
  bounds: HorizontalMovementBounds,
): HorizontalMovementResult;

/** Zeroes velocity (e.g. after focus loss) without changing x/facing. */
export function resetHorizontalMovement(state: HorizontalMovementState): HorizontalMovementState;
