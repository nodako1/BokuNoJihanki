export const TIME_PREVIEW_EVENT = 'boku-no-jihanki:time-preview';
export const GAME_STARTED_EVENT = 'boku-no-jihanki:game-started';
export const COLLISION_DEBUG_EVENT = 'boku-no-jihanki:collision-debug';
export const HUD_SNAPSHOT_EVENT = 'boku-no-jihanki:hud-snapshot';

export type InputSource = 'keyboard' | 'touch' | 'none';
export type AreaId = 'residential' | 'park';

export interface VirtualInputState {
  x: number;
  y: number;
  active: boolean;
}

export interface HudSnapshot {
  fps: number;
  playerX: number;
  playerY: number;
  area: AreaId;
  currentChunk: string;
  loadedChunks: string[];
  loadingChunk: string | null;
  lastUnloadedChunk: string | null;
  inputSource: InputSource;
  collisionDebug: boolean;
  sectionLabel?: string;
  facing?: 'down' | 'up' | 'left' | 'right';
  animation?: string;
  speed?: number;
  walkable?: boolean;
  blocked?: boolean;
  footstepCount?: number;
  exitNearby?: boolean;
}

let virtualInput: VirtualInputState = { x: 0, y: 0, active: false };
let gameStarted = false;
let collisionDebug = false;

export function publishPreviewTime(minutes: number): void {
  window.dispatchEvent(new CustomEvent<number>(TIME_PREVIEW_EVENT, { detail: minutes }));
}

export function publishGameStarted(): void {
  gameStarted = true;
  window.dispatchEvent(new CustomEvent(GAME_STARTED_EVENT));
}

export function isGameStarted(): boolean {
  return gameStarted;
}

export function setVirtualInput(next: VirtualInputState): void {
  virtualInput = next;
}

export function readVirtualInput(): VirtualInputState {
  return virtualInput;
}

export function clearVirtualInput(): void {
  virtualInput = { x: 0, y: 0, active: false };
}

export function publishCollisionDebug(enabled: boolean): void {
  collisionDebug = enabled;
  window.dispatchEvent(new CustomEvent<boolean>(COLLISION_DEBUG_EVENT, { detail: enabled }));
}

export function isCollisionDebugEnabled(): boolean {
  return collisionDebug;
}

export function publishHudSnapshot(snapshot: HudSnapshot): void {
  window.dispatchEvent(new CustomEvent<HudSnapshot>(HUD_SNAPSHOT_EVENT, { detail: snapshot }));
}
