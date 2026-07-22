export interface VectorResult {
  x: number;
  y: number;
  magnitude: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayerBody {
  width: number;
  height: number;
}

export interface WorldBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function clamp(value: number, minimum: number, maximum: number): number;
export function normalizeInput(x: number, y: number): VectorResult;
export function chunkIndexForX(x: number, chunkWidth: number, chunkCount: number): number;
export function desiredChunkIds(currentIndex: number, directionX: number, chunkCount: number): number[];
export function depthForFootY(footY: number, layerOffset?: number): number;
export function aabbIntersects(a: Rect, b: Rect): boolean;
export function playerRectAt(position: Point, body: PlayerBody): Rect;
export function resolveMovement(
  position: Point,
  delta: Point,
  body: PlayerBody,
  obstacles: Rect[],
  bounds: WorldBounds,
): Point;
export function areaForX(x: number): 'residential' | 'park';
export function surfaceForPosition(x: number, y: number): 'asphalt' | 'grass' | 'dirt';
