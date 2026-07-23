export interface Point2D { x: number; y: number }
export type Polygon2D = readonly Point2D[];
export type Facing = 'down' | 'up' | 'left' | 'right';
export interface MovementResolution extends Point2D {
  movedX: number;
  movedY: number;
  blockedX: boolean;
  blockedY: boolean;
}
export function clamp(value: number, minimum: number, maximum: number): number;
export function pointInPolygon(point: Point2D, polygon: Polygon2D): boolean;
export function distancePointToSegment(point: Point2D, start: Point2D, end: Point2D): number;
export function circleIntersectsPolygon(center: Point2D, radius: number, polygon: Polygon2D): boolean;
export function circleInsideWalkable(center: Point2D, radius: number, polygons: readonly Polygon2D[]): boolean;
export function isFootprintValid(center: Point2D, radius: number, walkablePolygons: readonly Polygon2D[], obstaclePolygons: readonly Polygon2D[]): boolean;
export function resolveWalkableMovement(position: Point2D, delta: Point2D, radius: number, walkablePolygons: readonly Polygon2D[], obstaclePolygons: readonly Polygon2D[], maxSubstep?: number): MovementResolution;
export function approach(current: number, target: number, maximumDelta: number): number;
export function chooseFacing(x: number, y: number, fallback?: Facing): Facing;
export function sectionIndexForX(x: number, sectionWidth: number, count: number): number;
