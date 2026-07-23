import type { Facing } from '../systems/walkableMovement.d.mts';

export type Direction = 'left' | 'right' | 'up' | 'down';

export type AreaTransitionVisualType = 'fade' | 'instant';

export type ExitTrigger =
  | { readonly kind: 'range'; readonly minX: number; readonly maxX: number }
  | { readonly kind: 'marker'; readonly markerId: string };

export interface ExitLocator {
  readonly x: number;
  readonly markerId?: string;
}

export interface SpawnPoint {
  readonly id: string;
  readonly x: number;
  readonly facing: Facing;
}

export interface AreaExit {
  readonly id: string;
  readonly direction: Direction;
  readonly trigger: ExitTrigger;
  readonly targetAreaId: string;
  readonly targetSpawnId: string;
  readonly transitionType: AreaTransitionVisualType;
  readonly enabled: boolean;
  readonly prompt?: string;
}

export interface AreaDefinition {
  readonly id: string;
  readonly label: string;
  readonly worldWidth: number;
  readonly groundY: number;
  readonly spawnPoints: readonly SpawnPoint[];
  readonly exits: readonly AreaExit[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AreaGraph {
  readonly areas: readonly AreaDefinition[];
}

export interface M14AreaGraphOverrides {
  readonly homeStreetWidth?: number;
  readonly lifeRoadWidth?: number;
  readonly upperVendingLaneWidth?: number;
  readonly groundY?: number;
}

export function getArea(graph: AreaGraph, areaId: string): AreaDefinition | undefined;
export function getSpawnPoint(graph: AreaGraph, areaId: string, spawnId: string): SpawnPoint | undefined;
export function findHorizontalExit(
  graph: AreaGraph,
  areaId: string,
  direction: 'left' | 'right',
  locator: ExitLocator,
): AreaExit | undefined;
export function findDirectionalExit(
  graph: AreaGraph,
  areaId: string,
  direction: 'up' | 'down',
  locator: ExitLocator,
): AreaExit | undefined;
export function isDirectionalPromptVisible(
  graph: AreaGraph,
  areaId: string,
  direction: 'up' | 'down',
  locator: ExitLocator,
): boolean;
export function validateAreaGraph(graph: AreaGraph): readonly import('./navigationValidation.d.mts').AreaGraphIssue[];
export function isAreaGraphValid(graph: AreaGraph): boolean;
export function createM14AreaGraph(overrides?: M14AreaGraphOverrides): AreaGraph;
