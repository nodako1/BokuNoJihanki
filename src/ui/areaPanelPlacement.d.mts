import type { TraversalDirection } from '../game/gameBridge';

export const AREA_PANEL_MIN_PLAYER_GAP: 12;
export const AREA_PANEL_MIN_TOUCH_TARGET: 44;

export type AreaPanelFacing = 'left' | 'right' | 'up' | 'down';

export interface AreaPanelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface AreaPanelPlayerGeometry {
  rect: AreaPanelRect;
  facing: AreaPanelFacing;
}

export interface AreaPanelObstacle {
  id: string;
  rect: AreaPanelRect;
}

export interface AreaPanelSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AreaPanelPlacementInput {
  viewport: {
    width: number;
    height: number;
  };
  panel: {
    width: number;
    height: number;
  };
  player: AreaPanelRect;
  facing: AreaPanelFacing;
  direction: TraversalDirection;
  obstacles?: readonly AreaPanelObstacle[];
  safeArea?: Partial<AreaPanelSafeArea>;
  playerGap?: number;
  obstacleGap?: number;
}

export type AreaPanelAnchor =
  | 'above-player'
  | 'below-player'
  | 'ahead-player'
  | 'behind-player'
  | 'viewport-top'
  | 'viewport-bottom'
  | 'viewport-left'
  | 'viewport-right'
  | 'viewport-center'
  | 'fallback-grid'
  | 'unavailable';

export interface AreaPanelPlacement {
  x: number;
  y: number;
  rect: AreaPanelRect;
  anchor: AreaPanelAnchor;
  valid: boolean;
  playerIntersectionArea: number;
  playerDistance: number;
  obstacleIntersections: readonly string[];
}

export function createAreaPanelRect(
  left: number,
  top: number,
  width: number,
  height: number,
): AreaPanelRect;

export function areaPanelIntersectionArea(
  first: AreaPanelRect,
  second: AreaPanelRect,
): number;

export function areaPanelRectDistance(
  first: AreaPanelRect,
  second: AreaPanelRect,
): number;

export function chooseAreaPanelPlacement(
  input: AreaPanelPlacementInput,
): AreaPanelPlacement;

export function normalizeAreaPanelPlayerGeometry(
  value: unknown,
): AreaPanelPlayerGeometry | null;
