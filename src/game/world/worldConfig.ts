import type { AreaId } from '../gameBridge';

export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
export const CHUNK_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const WORLD_CHUNK_COUNT = 4;
export const WORLD_WIDTH = CHUNK_WIDTH * WORLD_CHUNK_COUNT;
export const PLAYER_START = { x: 650, y: 590 } as const;
export const PLAYER_BODY = { width: 34, height: 28 } as const;
export const PLAYER_BOUNDS = {
  left: 24,
  right: WORLD_WIDTH - 24,
  top: 238,
  bottom: 694,
} as const;

export type SurfaceId = 'asphalt' | 'grass' | 'dirt';
export type PropKind =
  | 'house'
  | 'tree'
  | 'hedge'
  | 'shrub'
  | 'pole'
  | 'lamp'
  | 'bench'
  | 'vending'
  | 'fence'
  | 'playground'
  | 'sign'
  | 'flowerbed'
  | 'mirror'
  | 'mailbox'
  | 'bicycle'
  | 'gate'
  | 'sandbox'
  | 'trash';

export type LightKind = 'window' | 'lamp' | 'vending';

export interface CollisionShape {
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
}

export interface LightDefinition {
  kind: LightKind;
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
  color?: number;
  alphaScale?: number;
}

export interface ShadowDefinition {
  width: number;
  height: number;
  xOffset?: number;
  yOffset?: number;
  alpha?: number;
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
  lights?: readonly LightDefinition[];
  shadow?: ShadowDefinition;
}

export interface ChunkDefinition {
  id: string;
  index: number;
  label: string;
  area: AreaId;
  x: number;
  width: number;
  backgroundTexture: string;
  props: readonly PropDefinition[];
}

const houseCollision: CollisionShape = { xOffset: -142, yOffset: -51, width: 284, height: 51 };
const treeCollision: CollisionShape = { xOffset: -24, yOffset: -40, width: 48, height: 40 };
const poleCollision: CollisionShape = { xOffset: -14, yOffset: -37, width: 28, height: 37 };
const lampCollision: CollisionShape = { xOffset: -14, yOffset: -36, width: 28, height: 36 };
const vendingCollision: CollisionShape = { xOffset: -39, yOffset: -46, width: 78, height: 46 };
const benchCollision: CollisionShape = { xOffset: -78, yOffset: -33, width: 156, height: 33 };
const metalFenceCollision: CollisionShape = { xOffset: -119, yOffset: -27, width: 238, height: 27 };
const woodFenceCollision: CollisionShape = { xOffset: -119, yOffset: -35, width: 238, height: 35 };
const hedgeCollision: CollisionShape = { xOffset: -108, yOffset: -34, width: 216, height: 34 };
const playgroundCollision: CollisionShape = { xOffset: -104, yOffset: -43, width: 208, height: 43 };
const swingCollision: CollisionShape = { xOffset: -111, yOffset: -42, width: 222, height: 42 };
const flowerbedCollision: CollisionShape = { xOffset: -96, yOffset: -29, width: 192, height: 29 };
const signCollision: CollisionShape = { xOffset: -45, yOffset: -30, width: 90, height: 30 };
const mirrorCollision: CollisionShape = { xOffset: -14, yOffset: -34, width: 28, height: 34 };
const mailboxCollision: CollisionShape = { xOffset: -22, yOffset: -28, width: 44, height: 28 };
const bicycleCollision: CollisionShape = { xOffset: -73, yOffset: -25, width: 146, height: 25 };
const gateCollision: CollisionShape = { xOffset: -135, yOffset: -34, width: 270, height: 34 };
const sandboxCollision: CollisionShape = { xOffset: -109, yOffset: -27, width: 218, height: 27 };
const trashCollision: CollisionShape = { xOffset: -25, yOffset: -32, width: 50, height: 32 };
const shrubCollision: CollisionShape = { xOffset: -45, yOffset: -31, width: 90, height: 31 };

const warmHouseLights: readonly LightDefinition[] = [
  { kind: 'window', xOffset: -82, yOffset: -136, width: 62, height: 44, color: 0xffd991, alphaScale: 1 },
  { kind: 'window', xOffset: 28, yOffset: -143, width: 43, height: 36, color: 0xffc96f, alphaScale: 0.78 },
];

const compactHouseLights: readonly LightDefinition[] = [
  { kind: 'window', xOffset: -72, yOffset: -130, width: 58, height: 42, color: 0xffd98e, alphaScale: 0.92 },
  { kind: 'window', xOffset: 30, yOffset: -140, width: 38, height: 34, color: 0xffc66a, alphaScale: 0.7 },
];

const lampLight: readonly LightDefinition[] = [
  { kind: 'lamp', xOffset: 32, yOffset: -229, width: 115, height: 150, color: 0xffdfa0, alphaScale: 1 },
];

const vendingLight: readonly LightDefinition[] = [
  { kind: 'vending', xOffset: -4, yOffset: -133, width: 78, height: 104, color: 0xdff8ff, alphaScale: 0.84 },
];

export const WORLD_CHUNKS: readonly ChunkDefinition[] = [
  {
    id: 'residential-west',
    index: 0,
    label: '住宅街・交差点',
    area: 'residential',
    x: 0,
    width: CHUNK_WIDTH,
    backgroundTexture: 'm11-bg-residential-west',
    props: [
      { id: 'house-01', kind: 'house', texture: 'house-b', x: 190, y: 432, scale: 0.75, collision: houseCollision, lights: compactHouseLights, shadow: { width: 250, height: 25, alpha: 0.22 } },
      { id: 'house-02', kind: 'house', texture: 'house-a', x: 520, y: 438, scale: 0.62, collision: houseCollision, lights: warmHouseLights, shadow: { width: 220, height: 22, alpha: 0.2 } },
      { id: 'house-03', kind: 'house', texture: 'house-d', x: 1145, y: 426, scale: 0.66, collision: houseCollision, lights: warmHouseLights, shadow: { width: 230, height: 23, alpha: 0.21 } },
      { id: 'tree-01', kind: 'tree', texture: 'tree-b', x: 34, y: 685, scale: 0.92, collision: treeCollision, shadow: { width: 120, height: 25, xOffset: 8, alpha: 0.25 } },
      { id: 'tree-02', kind: 'tree', texture: 'tree-a', x: 1240, y: 692, scale: 0.86, collision: treeCollision, shadow: { width: 112, height: 23, xOffset: 8, alpha: 0.24 } },
      { id: 'hedge-01', kind: 'hedge', texture: 'hedge-b', x: 355, y: 445, scale: 0.66, collision: hedgeCollision },
      { id: 'hedge-02', kind: 'hedge', texture: 'hedge-a', x: 1010, y: 448, scale: 0.7, collision: hedgeCollision },
      { id: 'pole-01', kind: 'pole', texture: 'utility-pole', x: 792, y: 452, scale: 0.72, collision: poleCollision },
      { id: 'lamp-01', kind: 'lamp', texture: 'street-lamp', x: 610, y: 689, scale: 0.62, collision: lampCollision, lights: lampLight },
      { id: 'mirror-01', kind: 'mirror', texture: 'road-mirror', x: 894, y: 486, scale: 0.72, collision: mirrorCollision },
      { id: 'vending-01', kind: 'vending', texture: 'vending', x: 1014, y: 493, scale: 0.64, collision: vendingCollision, lights: vendingLight },
      { id: 'mailbox-01', kind: 'mailbox', texture: 'mailbox', x: 325, y: 474, scale: 0.7, collision: mailboxCollision },
      { id: 'bicycle-01', kind: 'bicycle', texture: 'bicycle', x: 705, y: 458, scale: 0.58, collision: bicycleCollision },
      { id: 'fence-01', kind: 'fence', texture: 'fence-wood', x: 42, y: 470, scale: 0.66, collision: woodFenceCollision },
      { id: 'flower-01', kind: 'flowerbed', texture: 'flowerbed', x: 1112, y: 685, scale: 0.65, collision: flowerbedCollision },
    ],
  },
  {
    id: 'residential-east',
    index: 1,
    label: '住宅街・公園通り',
    area: 'residential',
    x: CHUNK_WIDTH,
    width: CHUNK_WIDTH,
    backgroundTexture: 'm11-bg-residential-east',
    props: [
      { id: 'house-04', kind: 'house', texture: 'house-c', x: 1430, y: 430, scale: 0.7, collision: houseCollision, lights: compactHouseLights },
      { id: 'house-05', kind: 'house', texture: 'house-b', x: 1810, y: 436, scale: 0.68, collision: houseCollision, lights: compactHouseLights },
      { id: 'house-06', kind: 'house', texture: 'house-a', x: 2195, y: 430, scale: 0.65, collision: houseCollision, lights: warmHouseLights },
      { id: 'tree-03', kind: 'tree', texture: 'tree-c', x: 1305, y: 687, scale: 0.86, collision: treeCollision },
      { id: 'tree-04', kind: 'tree', texture: 'tree-a', x: 2460, y: 688, scale: 0.92, collision: treeCollision },
      { id: 'hedge-03', kind: 'hedge', texture: 'hedge-a', x: 1620, y: 451, scale: 0.72, collision: hedgeCollision },
      { id: 'hedge-04', kind: 'hedge', texture: 'hedge-b', x: 2035, y: 447, scale: 0.68, collision: hedgeCollision },
      { id: 'pole-02', kind: 'pole', texture: 'utility-pole', x: 2280, y: 457, scale: 0.73, collision: poleCollision },
      { id: 'lamp-02', kind: 'lamp', texture: 'street-lamp', x: 1545, y: 688, scale: 0.62, collision: lampCollision, lights: lampLight },
      { id: 'vending-02', kind: 'vending', texture: 'vending', x: 2375, y: 493, scale: 0.66, collision: vendingCollision, lights: vendingLight },
      { id: 'mirror-02', kind: 'mirror', texture: 'road-mirror', x: 2150, y: 487, scale: 0.7, collision: mirrorCollision },
      { id: 'mailbox-02', kind: 'mailbox', texture: 'mailbox', x: 1905, y: 474, scale: 0.68, collision: mailboxCollision },
      { id: 'bicycle-02', kind: 'bicycle', texture: 'bicycle', x: 1720, y: 460, scale: 0.58, collision: bicycleCollision, flipX: true },
      { id: 'gate-transition', kind: 'gate', texture: 'park-gate', x: 2540, y: 454, scale: 0.7, collision: gateCollision },
      { id: 'flower-02', kind: 'flowerbed', texture: 'flowerbed', x: 1365, y: 684, scale: 0.66, collision: flowerbedCollision },
    ],
  },
  {
    id: 'park-west',
    index: 2,
    label: 'なつかぜ公園・入口',
    area: 'park',
    x: CHUNK_WIDTH * 2,
    width: CHUNK_WIDTH,
    backgroundTexture: 'm11-bg-park-west',
    props: [
      { id: 'sign-01', kind: 'sign', texture: 'park-sign', x: 2690, y: 467, scale: 0.72, collision: signCollision },
      { id: 'tree-05', kind: 'tree', texture: 'tree-b', x: 2790, y: 426, scale: 0.83, collision: treeCollision },
      { id: 'tree-06', kind: 'tree', texture: 'tree-a', x: 3015, y: 681, scale: 0.9, collision: treeCollision },
      { id: 'tree-07', kind: 'tree', texture: 'tree-c', x: 3540, y: 423, scale: 0.86, collision: treeCollision },
      { id: 'tree-08', kind: 'tree', texture: 'tree-a', x: 3760, y: 687, scale: 0.88, collision: treeCollision },
      { id: 'shrub-01', kind: 'shrub', texture: 'shrub', x: 2880, y: 492, scale: 0.78, collision: shrubCollision },
      { id: 'shrub-02', kind: 'shrub', texture: 'shrub', x: 3350, y: 465, scale: 0.72, collision: shrubCollision },
      { id: 'bench-01', kind: 'bench', texture: 'bench', x: 3120, y: 519, scale: 0.76, collision: benchCollision },
      { id: 'slide-01', kind: 'playground', texture: 'playground-slide', x: 3425, y: 575, scale: 0.68, collision: playgroundCollision },
      { id: 'sandbox-01', kind: 'sandbox', texture: 'sandbox', x: 3620, y: 665, scale: 0.72, collision: sandboxCollision },
      { id: 'lamp-03', kind: 'lamp', texture: 'street-lamp', x: 2760, y: 685, scale: 0.62, collision: lampCollision, lights: lampLight },
      { id: 'lamp-04', kind: 'lamp', texture: 'street-lamp', x: 3680, y: 485, scale: 0.6, collision: lampCollision, lights: lampLight },
      { id: 'vending-03', kind: 'vending', texture: 'vending', x: 3740, y: 516, scale: 0.66, collision: vendingCollision, lights: vendingLight },
      { id: 'fence-03', kind: 'fence', texture: 'fence-metal', x: 2615, y: 475, scale: 0.74, collision: metalFenceCollision },
      { id: 'flower-03', kind: 'flowerbed', texture: 'flowerbed', x: 3260, y: 442, scale: 0.7, collision: flowerbedCollision },
      { id: 'trash-01', kind: 'trash', texture: 'trash-can', x: 2930, y: 520, scale: 0.66, collision: trashCollision },
    ],
  },
  {
    id: 'park-east',
    index: 3,
    label: 'なつかぜ公園・広場',
    area: 'park',
    x: CHUNK_WIDTH * 3,
    width: CHUNK_WIDTH,
    backgroundTexture: 'm11-bg-park-east',
    props: [
      { id: 'tree-09', kind: 'tree', texture: 'tree-a', x: 3920, y: 424, scale: 0.9, collision: treeCollision },
      { id: 'tree-10', kind: 'tree', texture: 'tree-b', x: 4215, y: 688, scale: 0.96, collision: treeCollision },
      { id: 'tree-11', kind: 'tree', texture: 'tree-c', x: 4805, y: 420, scale: 0.9, collision: treeCollision },
      { id: 'tree-12', kind: 'tree', texture: 'tree-a', x: 5060, y: 690, scale: 0.88, collision: treeCollision },
      { id: 'shrub-03', kind: 'shrub', texture: 'shrub', x: 4040, y: 470, scale: 0.75, collision: shrubCollision },
      { id: 'shrub-04', kind: 'shrub', texture: 'shrub', x: 4710, y: 470, scale: 0.72, collision: shrubCollision },
      { id: 'bench-02', kind: 'bench', texture: 'bench', x: 4090, y: 520, scale: 0.78, collision: benchCollision },
      { id: 'bench-03', kind: 'bench', texture: 'bench', x: 4740, y: 656, scale: 0.75, collision: benchCollision, flipX: true },
      { id: 'swing-01', kind: 'playground', texture: 'playground-swing', x: 4490, y: 490, scale: 0.7, collision: swingCollision },
      { id: 'slide-02', kind: 'playground', texture: 'playground-slide', x: 4660, y: 618, scale: 0.64, collision: playgroundCollision, flipX: true },
      { id: 'sandbox-02', kind: 'sandbox', texture: 'sandbox', x: 4320, y: 610, scale: 0.7, collision: sandboxCollision },
      { id: 'lamp-05', kind: 'lamp', texture: 'street-lamp', x: 3895, y: 682, scale: 0.62, collision: lampCollision, lights: lampLight },
      { id: 'lamp-06', kind: 'lamp', texture: 'street-lamp', x: 4970, y: 505, scale: 0.62, collision: lampCollision, lights: lampLight },
      { id: 'fence-04', kind: 'fence', texture: 'fence-metal', x: 5010, y: 452, scale: 0.74, collision: metalFenceCollision },
      { id: 'flower-04', kind: 'flowerbed', texture: 'flowerbed', x: 4410, y: 688, scale: 0.72, collision: flowerbedCollision },
      { id: 'trash-02', kind: 'trash', texture: 'trash-can', x: 3985, y: 515, scale: 0.66, collision: trashCollision },
    ],
  },
] as const;
