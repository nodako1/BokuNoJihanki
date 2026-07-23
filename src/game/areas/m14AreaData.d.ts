export type M14AreaId = 'home-street' | 'life-road' | 'upper-vending-lane';
export type M14Direction = 'left' | 'right' | 'up' | 'down';
export type M14Facing = 'left' | 'right';
export type M14ExitTrigger = 'boundary' | 'branch';
export type M14TimePhase = 'morning' | 'day' | 'evening' | 'night';

export interface M14HorizontalRange {
  readonly minX: number;
  readonly maxX: number;
}

export interface M14SpawnPoint {
  readonly id: string;
  readonly x: number;
  readonly facing: M14Facing;
}

export interface M14ConnectedExit {
  readonly id: string;
  readonly kind: 'connected';
  readonly enabled: true;
  readonly direction: M14Direction;
  readonly trigger: M14ExitTrigger;
  readonly activationRange: M14HorizontalRange;
  readonly zone: M14HorizontalRange;
  readonly arrowRange: M14HorizontalRange | null;
  readonly targetAreaId: M14AreaId;
  readonly targetSpawnId: string;
  readonly targetFacing: M14Facing;
  readonly target: Readonly<{
    areaId: M14AreaId;
    spawnId: string;
    facing: M14Facing;
  }>;
}

export interface M14ClosedExit {
  readonly id: string;
  readonly kind: 'closed';
  readonly enabled: false;
  readonly direction: M14Direction;
  readonly trigger: M14ExitTrigger;
  readonly activationRange: M14HorizontalRange | null;
  readonly zone: M14HorizontalRange | null;
  readonly arrowRange: null;
  readonly target: null;
  readonly reason: 'future-area';
  readonly hint: string;
}

export type M14ExitDefinition = M14ConnectedExit | M14ClosedExit;

export interface M14CameraBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface M14AreaAssets {
  readonly backgroundAssetId: string;
  readonly foregroundAssetId: string;
  readonly backgroundPathPattern: string;
  readonly foregroundPath: string;
}

export interface M14AreaMetadata {
  readonly ambientProfile: string;
  readonly preserveAcrossTransition: readonly [
    'timeMinutes',
    'timePhase',
    'audioEnabled',
  ];
}

export interface M14AreaDefinition {
  readonly areaId: M14AreaId;
  readonly displayName: string;
  readonly label: string;
  readonly sceneKey: string;
  readonly backgroundAssetId: string;
  readonly worldWidth: number;
  readonly groundY: number;
  readonly cameraBounds: M14CameraBounds;
  readonly spawnPoints: Readonly<Record<string, M14SpawnPoint>>;
  readonly leftExit: M14ExitDefinition;
  readonly rightExit: M14ExitDefinition;
  readonly upExit: M14ExitDefinition;
  readonly downExit: M14ExitDefinition;
  readonly exits: Readonly<{
    left: M14ExitDefinition;
    right: M14ExitDefinition;
    up: M14ExitDefinition;
    down: M14ExitDefinition;
  }>;
  readonly arrowRanges: Readonly<Partial<Record<'up' | 'down', M14HorizontalRange>>>;
  readonly assets: M14AreaAssets;
  readonly metadata: M14AreaMetadata;
}

export const M14_AREA_IDS: readonly M14AreaId[];
export const M14_INITIAL_LOCATION: Readonly<{
  areaId: 'home-street';
  spawnId: 'start';
}>;
export const M14_AREA_DEFINITIONS: Readonly<Record<M14AreaId, M14AreaDefinition>>;

export function isM14AreaId(value: unknown): value is M14AreaId;
export function getM14AreaDefinition(areaId: M14AreaId): M14AreaDefinition;
export function getM14SpawnPoint(areaId: M14AreaId, spawnId: string): M14SpawnPoint;
