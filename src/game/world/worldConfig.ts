import type { AreaId } from '../gameBridge';

export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
export const CHUNK_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const WORLD_CHUNK_COUNT = 4;
export const WORLD_WIDTH = CHUNK_WIDTH * WORLD_CHUNK_COUNT;
export const PLAYER_START = { x: 540, y: 604 } as const;
export const PLAYER_BODY = { width: 34, height: 26 } as const;
export const PLAYER_BOUNDS = {
  left: 24,
  right: WORLD_WIDTH - 24,
  top: 356,
  bottom: 690,
} as const;

export type SurfaceId = 'asphalt' | 'grass' | 'dirt';
export type PropKind =
  | 'house'
  | 'tree'
  | 'hedge'
  | 'pole'
  | 'lamp'
  | 'bench'
  | 'vending'
  | 'fence'
  | 'playground'
  | 'sign'
  | 'flowerbed';

export interface CollisionShape {
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
}

export interface PropDefinition {
  id: string;
  kind: PropKind;
  texture: string;
  x: number;
  y: number;
  scale?: number;
  flipX?: boolean;
  collision?: CollisionShape;
  depthOffset?: number;
}

export interface ChunkDefinition {
  id: string;
  index: number;
  label: string;
  area: AreaId;
  x: number;
  width: number;
  props: PropDefinition[];
}

const houseCollision: CollisionShape = { xOffset: -132, yOffset: -42, width: 264, height: 42 };
const treeCollision: CollisionShape = { xOffset: -22, yOffset: -35, width: 44, height: 35 };
const poleCollision: CollisionShape = { xOffset: -12, yOffset: -34, width: 24, height: 34 };
const lampCollision: CollisionShape = { xOffset: -13, yOffset: -33, width: 26, height: 33 };
const vendingCollision: CollisionShape = { xOffset: -32, yOffset: -41, width: 64, height: 41 };
const benchCollision: CollisionShape = { xOffset: -67, yOffset: -30, width: 134, height: 30 };
const fenceCollision: CollisionShape = { xOffset: -112, yOffset: -23, width: 224, height: 23 };
const hedgeCollision: CollisionShape = { xOffset: -94, yOffset: -26, width: 188, height: 26 };
const playgroundCollision: CollisionShape = { xOffset: -93, yOffset: -34, width: 186, height: 34 };
const flowerbedCollision: CollisionShape = { xOffset: -88, yOffset: -25, width: 176, height: 25 };

export const WORLD_CHUNKS: readonly ChunkDefinition[] = [
  {
    id: 'residential-west',
    index: 0,
    label: '住宅街・西',
    area: 'residential',
    x: 0,
    width: CHUNK_WIDTH,
    props: [
      { id: 'house-01', kind: 'house', texture: 'house-a', x: 260, y: 486, scale: 0.88, collision: houseCollision },
      { id: 'house-02', kind: 'house', texture: 'house-a', x: 720, y: 468, scale: 0.82, collision: houseCollision },
      { id: 'tree-01', kind: 'tree', texture: 'tree', x: 1035, y: 475, scale: 0.72, collision: treeCollision },
      { id: 'tree-02', kind: 'tree', texture: 'tree', x: 1135, y: 652, scale: 0.78, collision: treeCollision },
      { id: 'hedge-01', kind: 'hedge', texture: 'hedge', x: 475, y: 493, scale: 0.84, collision: hedgeCollision },
      { id: 'pole-01', kind: 'pole', texture: 'utility-pole', x: 930, y: 509, scale: 0.78, collision: poleCollision },
      { id: 'lamp-01', kind: 'lamp', texture: 'street-lamp', x: 585, y: 658, scale: 0.66, collision: lampCollision },
      { id: 'fence-01', kind: 'fence', texture: 'fence', x: 160, y: 675, scale: 0.82, collision: fenceCollision },
      { id: 'flower-01', kind: 'flowerbed', texture: 'flowerbed', x: 870, y: 676, scale: 0.72, collision: flowerbedCollision },
    ],
  },
  {
    id: 'residential-east',
    index: 1,
    label: '住宅街・公園通り',
    area: 'residential',
    x: CHUNK_WIDTH,
    width: CHUNK_WIDTH,
    props: [
      { id: 'house-03', kind: 'house', texture: 'house-b', x: 1450, y: 474, scale: 0.86, collision: houseCollision },
      { id: 'house-04', kind: 'house', texture: 'house-a', x: 1935, y: 482, scale: 0.82, collision: houseCollision },
      { id: 'tree-03', kind: 'tree', texture: 'tree', x: 2240, y: 476, scale: 0.78, collision: treeCollision },
      { id: 'tree-04', kind: 'tree', texture: 'tree', x: 2438, y: 650, scale: 0.82, collision: treeCollision },
      { id: 'hedge-02', kind: 'hedge', texture: 'hedge', x: 1695, y: 493, scale: 0.9, collision: hedgeCollision },
      { id: 'pole-02', kind: 'pole', texture: 'utility-pole', x: 2150, y: 515, scale: 0.8, collision: poleCollision },
      { id: 'lamp-02', kind: 'lamp', texture: 'street-lamp', x: 1560, y: 658, scale: 0.66, collision: lampCollision },
      { id: 'vending-01', kind: 'vending', texture: 'vending', x: 2355, y: 664, scale: 0.75, collision: vendingCollision },
      { id: 'fence-02', kind: 'fence', texture: 'fence', x: 1325, y: 675, scale: 0.84, collision: fenceCollision },
      { id: 'flower-02', kind: 'flowerbed', texture: 'flowerbed', x: 2060, y: 675, scale: 0.74, collision: flowerbedCollision },
    ],
  },
  {
    id: 'park-west',
    index: 2,
    label: 'なつかぜ公園・入口',
    area: 'park',
    x: CHUNK_WIDTH * 2,
    width: CHUNK_WIDTH,
    props: [
      { id: 'sign-01', kind: 'sign', texture: 'park-sign', x: 2670, y: 505, scale: 0.78, collision: { xOffset: -35, yOffset: -26, width: 70, height: 26 } },
      { id: 'tree-05', kind: 'tree', texture: 'tree', x: 2860, y: 475, scale: 0.9, collision: treeCollision },
      { id: 'tree-06', kind: 'tree', texture: 'tree', x: 3150, y: 648, scale: 0.94, collision: treeCollision },
      { id: 'tree-07', kind: 'tree', texture: 'tree', x: 3545, y: 465, scale: 0.82, collision: treeCollision },
      { id: 'bench-01', kind: 'bench', texture: 'bench', x: 3060, y: 548, scale: 0.9, collision: benchCollision },
      { id: 'playground-01', kind: 'playground', texture: 'playground', x: 3400, y: 650, scale: 0.85, collision: playgroundCollision },
      { id: 'lamp-03', kind: 'lamp', texture: 'street-lamp', x: 2780, y: 662, scale: 0.68, collision: lampCollision },
      { id: 'vending-02', kind: 'vending', texture: 'vending', x: 3690, y: 659, scale: 0.76, collision: vendingCollision },
      { id: 'fence-03', kind: 'fence', texture: 'fence', x: 2590, y: 675, scale: 0.84, collision: fenceCollision },
      { id: 'flower-03', kind: 'flowerbed', texture: 'flowerbed', x: 3275, y: 500, scale: 0.72, collision: flowerbedCollision },
    ],
  },
  {
    id: 'park-east',
    index: 3,
    label: 'なつかぜ公園・広場',
    area: 'park',
    x: CHUNK_WIDTH * 3,
    width: CHUNK_WIDTH,
    props: [
      { id: 'tree-08', kind: 'tree', texture: 'tree', x: 3970, y: 470, scale: 0.88, collision: treeCollision },
      { id: 'tree-09', kind: 'tree', texture: 'tree', x: 4305, y: 650, scale: 1.0, collision: treeCollision },
      { id: 'tree-10', kind: 'tree', texture: 'tree', x: 4820, y: 478, scale: 0.92, collision: treeCollision },
      { id: 'bench-02', kind: 'bench', texture: 'bench', x: 4145, y: 535, scale: 0.92, collision: benchCollision },
      { id: 'bench-03', kind: 'bench', texture: 'bench', x: 4640, y: 655, scale: 0.86, collision: benchCollision },
      { id: 'playground-02', kind: 'playground', texture: 'playground', x: 4540, y: 510, scale: 0.88, collision: playgroundCollision },
      { id: 'lamp-04', kind: 'lamp', texture: 'street-lamp', x: 3890, y: 660, scale: 0.68, collision: lampCollision },
      { id: 'lamp-05', kind: 'lamp', texture: 'street-lamp', x: 5000, y: 660, scale: 0.68, collision: lampCollision },
      { id: 'fence-04', kind: 'fence', texture: 'fence', x: 5050, y: 495, scale: 0.84, collision: fenceCollision },
      { id: 'flower-04', kind: 'flowerbed', texture: 'flowerbed', x: 4390, y: 675, scale: 0.8, collision: flowerbedCollision },
    ],
  },
] as const;

