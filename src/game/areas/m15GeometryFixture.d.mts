export type M15AreaId = 'home-street' | 'life-road' | 'upper-vending-lane';
export type M15TimePhase = 'morning' | 'day' | 'evening' | 'night';
export type M15Facing = 'left' | 'right';

export interface M15HorizontalRange {
  readonly minX: number;
  readonly maxX: number;
}

export interface M15GroundSample {
  readonly x: number;
  readonly y: number;
  readonly position: 'left' | 'center' | 'right';
}

export interface M15SpawnAnnotation {
  readonly x: number;
  readonly y: number;
  readonly facing: M15Facing;
}

export interface M15BranchEntranceAnnotation {
  readonly backgroundRange: M15HorizontalRange;
  readonly backgroundCenterX: number;
  readonly triggerRange: M15HorizontalRange;
  readonly triggerCenterX: number;
  readonly centerDeltaX: number;
  readonly groundY: number;
  readonly annotation: string;
}

export interface M15AreaAssetFixture {
  readonly backgroundAssetId: string;
  readonly foregroundAssetId: string;
  readonly backgroundPathPattern: string;
  readonly backgroundPaths: Readonly<Record<M15TimePhase, string>>;
  readonly backgroundSha256: Readonly<Record<M15TimePhase, string>>;
  readonly foregroundPath: string;
  readonly foregroundSha256: string;
}

export interface M15GeometryArea {
  readonly areaId: M15AreaId;
  readonly worldWidth: number;
  readonly worldHeight: 720;
  readonly assets: M15AreaAssetFixture;
  readonly ground: Readonly<{
    y: number;
    annotation: string;
    samples: readonly M15GroundSample[];
  }>;
  readonly spawns: Readonly<Record<string, M15SpawnAnnotation>>;
  readonly edgeTriggers: Readonly<{
    left: M15HorizontalRange;
    right: M15HorizontalRange;
  }>;
  readonly branchEntrances: Readonly<
    Partial<Record<'up' | 'down', M15BranchEntranceAnnotation>>
  >;
}

export interface M15GeometryFixture {
  readonly schemaVersion: 1;
  readonly revision: 'M1.5';
  readonly measuredAt: string;
  readonly measurementMethod: string;
  readonly coordinateSpace: Readonly<{
    origin: 'top-left';
    unit: 'css-px';
    worldHeight: 720;
    imageToRuntimeScale: 1;
  }>;
  readonly tolerances: Readonly<{
    renderedFootToGroundCssPx: number;
    spawnFootToGroundCssPx: number;
    entranceToTriggerCenterCssPx: number;
  }>;
  readonly player: Readonly<{
    atlasImagePath: string;
    atlasImageSha256: string;
    atlasJsonPath: string;
    atlasJsonSha256: string;
    frameSize: Readonly<{ width: number; height: number }>;
    footPivot: Readonly<{
      x: number;
      y: number;
      pixelX: number;
      pixelY: number;
    }>;
    runtimeScale: number;
  }>;
  readonly areas: Readonly<Record<M15AreaId, M15GeometryArea>>;
}

export const M15_GEOMETRY_FIXTURE: M15GeometryFixture;
export const M15_AREA_IDS: readonly M15AreaId[];
export const M15_TIME_PHASES: readonly M15TimePhase[];

export function isM15AreaId(value: unknown): value is M15AreaId;
export function getM15GeometryArea(areaId: M15AreaId): M15GeometryArea;
