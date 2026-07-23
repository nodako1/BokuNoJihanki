import mapJson from './residential-m13-map.json';
import type { SurfaceId } from './worldConfig';

export type M13SectionId = 'home-front' | 'life-road' | 'alley-corner' | 'vending-crossing';
export type TimePhaseId = 'morning' | 'day' | 'evening' | 'night';

export interface Point { x: number; y: number }
export interface PolygonObject {
  id: number;
  name: string;
  type: string;
  polygon: readonly Point[];
  properties?: readonly TiledProperty[];
}
export interface RectObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  properties?: readonly TiledProperty[];
}
export interface TiledProperty {
  name: string;
  type: string;
  value: string | number | boolean;
}
interface TiledLayer {
  id: number;
  name: string;
  type: string;
  objects?: readonly (PolygonObject | RectObject)[];
  properties?: readonly TiledProperty[];
}
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: readonly TiledLayer[];
  properties?: readonly TiledProperty[];
}

export interface BackgroundSection {
  id: M13SectionId;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface OcclusionDefinition {
  id: string;
  section: M13SectionId;
  assetBase: string;
  x: number;
  y: number;
  width: number;
  height: number;
  footY: number;
}
export interface ExitDefinition {
  id: string;
  label: string;
  targetScene: string;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ResidentialMapDefinition {
  worldWidth: number;
  worldHeight: number;
  sections: readonly BackgroundSection[];
  walkablePolygons: readonly (readonly Point[])[];
  obstaclePolygons: readonly (readonly Point[])[];
  groundPolygons: readonly { surface: SurfaceId; polygon: readonly Point[] }[];
  occlusions: readonly OcclusionDefinition[];
  exits: readonly ExitDefinition[];
  spawn: Readonly<Point> & { facing: 'down' | 'up' | 'left' | 'right' };
  cameraBounds: { x: number; y: number; width: number; height: number };
}

const data = mapJson as TiledMap;

function property<T extends string | number | boolean>(object: { properties?: readonly TiledProperty[] }, name: string, fallback: T): T {
  const value = object.properties?.find((item) => item.name === name)?.value;
  return (value === undefined ? fallback : value) as T;
}

function layer(name: string): TiledLayer {
  const found = data.layers.find((item) => item.name === name);
  if (!found) throw new Error(`Missing M1.3 map layer: ${name}`);
  return found;
}

function polygonObjects(name: string): readonly PolygonObject[] {
  return (layer(name).objects ?? []).filter((object): object is PolygonObject => 'polygon' in object && Array.isArray(object.polygon));
}

function rectObjects(name: string): readonly RectObject[] {
  return (layer(name).objects ?? []).filter((object): object is RectObject => !('polygon' in object));
}

const sections = rectObjects('background-main').map((object) => ({
  id: property(object, 'section', object.name) as M13SectionId,
  x: object.x,
  y: object.y,
  width: object.width ?? 1280,
  height: object.height ?? 720,
}));

const walkablePolygons = polygonObjects('walkable').map((object) => object.polygon);
const obstaclePolygons = polygonObjects('obstacles').map((object) => object.polygon);
const groundPolygons = polygonObjects('ground').map((object) => ({
  surface: property(object, 'surface', 'asphalt') as SurfaceId,
  polygon: object.polygon,
}));
const occlusions = rectObjects('occlusion').map((object) => ({
  id: object.name,
  section: property(object, 'section', 'home-front') as M13SectionId,
  assetBase: property(object, 'assetBase', object.name),
  x: object.x,
  y: object.y,
  width: object.width ?? 1,
  height: object.height ?? 1,
  footY: Number(property(object, 'footY', object.y + (object.height ?? 0))),
}));
const exits = rectObjects('exits').map((object) => ({
  id: object.name,
  label: property(object, 'label', object.name),
  targetScene: property(object, 'targetScene', ''),
  enabled: Boolean(property(object, 'enabled', false)),
  x: object.x,
  y: object.y,
  width: object.width ?? 1,
  height: object.height ?? 1,
}));
const spawnObject = rectObjects('spawn-points')[0];
if (!spawnObject) throw new Error('M1.3 map must define a spawn point.');
const cameraObject = rectObjects('camera-bounds')[0];
if (!cameraObject) throw new Error('M1.3 map must define camera bounds.');

export const RESIDENTIAL_M13_MAP: ResidentialMapDefinition = {
  worldWidth: Number(property({ properties: data.properties }, 'worldWidth', data.width * data.tilewidth)),
  worldHeight: Number(property({ properties: data.properties }, 'worldHeight', data.height * data.tileheight)),
  sections,
  walkablePolygons,
  obstaclePolygons,
  groundPolygons,
  occlusions,
  exits,
  spawn: {
    x: spawnObject.x,
    y: spawnObject.y,
    facing: property(spawnObject, 'facing', 'right') as 'down' | 'up' | 'left' | 'right',
  },
  cameraBounds: {
    x: cameraObject.x,
    y: cameraObject.y,
    width: cameraObject.width ?? data.width * data.tilewidth,
    height: cameraObject.height ?? data.height * data.tileheight,
  },
};

export const M13_PHASES: readonly TimePhaseId[] = ['morning', 'day', 'evening', 'night'];
export const M13_ASSET_ROOT = '/assets/images/m13';
export function m13BackgroundKey(section: M13SectionId, phase: TimePhaseId): string {
  return `m13-bg-${section}-${phase}`;
}
export function m13BackgroundPath(section: M13SectionId, phase: TimePhaseId): string {
  return `${M13_ASSET_ROOT}/bg-${section}-${phase}.webp`;
}
export function m13OcclusionKey(assetBase: string, phase: TimePhaseId): string {
  return `m13-${assetBase}-${phase}`;
}
export function m13OcclusionPath(assetBase: string, phase: TimePhaseId): string {
  return `${M13_ASSET_ROOT}/${assetBase}-${phase}.webp`;
}
export const M13_PLAYER_ATLAS_KEY = 'm13-player-atlas';
export const M13_PLAYER_ATLAS_IMAGE = `${M13_ASSET_ROOT}/player-atlas.webp`;
export const M13_PLAYER_ATLAS_JSON = `${M13_ASSET_ROOT}/player-atlas.json`;
