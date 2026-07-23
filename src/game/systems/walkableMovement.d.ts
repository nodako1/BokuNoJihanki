export interface Point { x: number; y: number }
export interface MovementResolution extends Point {
  movedX: number;
  movedY: number;
  blockedX: boolean;
  blockedY: boolean;
}
export type Facing = 'down' | 'up' | 'left' | 'right';
export function clamp(value: number, minimum: number, maximum: number): number;
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean;
export function distancePointToSegment(point: Point, start: Point, end: Point): number;
export function circleIntersectsPolygon(center: Point, radius: number, polygon: readonly Point[]): boolean;
export function circleInsideWalkable(center: Point, radius: number, polygons: readonly (readonly Point[])[]): boolean;
export function isFootprintValid(center: Point, radius: number, walkablePolygons: readonly (readonly Point[])[], obstaclePolygons: readonly (readonly Point[])[]): boolean;
export function resolveWalkableMovement(position: Point, delta: Point, radius: number, walkablePolygons: readonly (readonly Point[])[], obstaclePolygons: readonly (readonly Point[])[], maxSubstep?: number): MovementResolution;
export function approach(current: number, target: number, maximumDelta: number): number;
export function chooseFacing(x: number, y: number, fallback?: Facing): Facing;
export function sectionIndexForX(x: number, sectionWidth: number, count: number): number;
