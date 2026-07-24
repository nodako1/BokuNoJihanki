export const TIME_PREVIEW_EVENT = 'boku-no-jihanki:time-preview';
export const GAME_STARTED_EVENT = 'boku-no-jihanki:game-started';
export const COLLISION_DEBUG_EVENT = 'boku-no-jihanki:collision-debug';
export const HUD_SNAPSHOT_EVENT = 'boku-no-jihanki:hud-snapshot';
export const AREA_PROMPT_EVENT = 'boku-no-jihanki:area-prompt';
export const AREA_TRAVERSAL_REQUEST_EVENT = 'boku-no-jihanki:area-traversal-request';
export const PLAYER_SCREEN_GEOMETRY_EVENT = 'boku-no-jihanki:player-screen-geometry';

export type InputSource = 'keyboard' | 'touch' | 'none';
export type M14AreaId = 'home-street' | 'life-road' | 'upper-vending-lane';
export type AreaId = M14AreaId | 'residential' | 'park';
export type TraversalDirection = 'up' | 'down';

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
  areaLabel?: string;
  cameraScrollX?: number;
  cameraMaxX?: number;
  transitionState?: 'idle' | 'fading-out' | 'loading' | 'fading-in';
  inputLocked?: boolean;
  branchDirection?: TraversalDirection | null;
  branchVisible?: boolean;
  spawnId?: string;
  lastTransitionId?: string | null;
  timeMinutes?: number;
  audioMuted?: boolean;
  worldWidth?: number;
}

export interface AreaPromptState {
  visible: boolean;
  direction: TraversalDirection | null;
  label: string;
  areaId: M14AreaId | null;
}

export interface ScreenRectSnapshot {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlayerScreenGeometry {
  rect: ScreenRectSnapshot;
  footRect: ScreenRectSnapshot;
  facing: 'left' | 'right' | 'up' | 'down';
}

let virtualInput: VirtualInputState = { x: 0, y: 0, active: false };
let gameStarted = false;
let collisionDebug = false;
let previewMinutes = 360;
let audioMuted = false;
let traversalRequest: TraversalDirection | null = null;
let areaPrompt: AreaPromptState = {
  visible: false,
  direction: null,
  label: '',
  areaId: null,
};

export function publishPreviewTime(minutes: number): void {
  previewMinutes = minutes;
  window.dispatchEvent(new CustomEvent<number>(TIME_PREVIEW_EVENT, { detail: minutes }));
}

export function readPreviewTime(): number {
  return previewMinutes;
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

export function publishAudioMuted(muted: boolean): void {
  audioMuted = muted;
}

export function isAudioMuted(): boolean {
  return audioMuted;
}

export function publishAreaPrompt(next: AreaPromptState): void {
  if (
    areaPrompt.visible === next.visible
    && areaPrompt.direction === next.direction
    && areaPrompt.label === next.label
    && areaPrompt.areaId === next.areaId
  ) {
    return;
  }
  areaPrompt = next;
  window.dispatchEvent(new CustomEvent<AreaPromptState>(AREA_PROMPT_EVENT, { detail: next }));
}

export function readAreaPrompt(): AreaPromptState {
  return areaPrompt;
}

export function publishPlayerScreenGeometry(geometry: PlayerScreenGeometry): void {
  window.dispatchEvent(
    new CustomEvent<PlayerScreenGeometry>(PLAYER_SCREEN_GEOMETRY_EVENT, {
      detail: geometry,
    }),
  );
}

export function requestAreaTraversal(direction: TraversalDirection): void {
  traversalRequest = direction;
  window.dispatchEvent(
    new CustomEvent<TraversalDirection>(AREA_TRAVERSAL_REQUEST_EVENT, { detail: direction }),
  );
}

export function consumeAreaTraversalRequest(): TraversalDirection | null {
  const request = traversalRequest;
  traversalRequest = null;
  return request;
}

export function clearAreaTraversalRequest(): void {
  traversalRequest = null;
}
