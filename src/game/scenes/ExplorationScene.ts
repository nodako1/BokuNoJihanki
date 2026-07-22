import Phaser from 'phaser';
import {
  COLLISION_DEBUG_EVENT,
  GAME_STARTED_EVENT,
  TIME_PREVIEW_EVENT,
  isCollisionDebugEnabled,
  isGameStarted,
  publishHudSnapshot,
} from '../gameBridge';
import { audioEngine } from '../systems/audioEngine';
import { InputSystem } from '../systems/inputSystem';
import {
  depthForFootY,
  resolveMovement,
  surfaceForPosition,
} from '../systems/worldMath.mjs';
import {
  FESTIVAL_DAY_END,
  GAME_DAY_START,
  getAtmosphere,
  getTimePhase,
} from '../systems/timeOfDay';
import { AtmosphereLayer } from '../world/AtmosphereLayer';
import { M11_VISUAL_ASSETS } from '../world/m11VisualAssets';
import { MapStreamer, type StreamSnapshot } from '../world/MapStreamer';
import {
  PLAYER_BODY,
  PLAYER_BOUNDS,
  PLAYER_START,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../world/worldConfig';

type FacingDirection = 'down' | 'up' | 'left' | 'right';

const PLAYER_SPEED = 220;
const PLAYER_SCALE = 0.62;
const FOOTSTEP_DISTANCE = 40;
const HUD_INTERVAL = 180;
const ATMOSPHERE_INTERVAL = 50;

function svgToBase64DataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/svg+xml;base64,${window.btoa(binary)}`;
}

export class ExplorationScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private inputSystem!: InputSystem;
  private mapStreamer!: MapStreamer;
  private atmosphereLayer!: AtmosphereLayer;
  private targetMinutes = GAME_DAY_START;
  private displayedMinutes = GAME_DAY_START;
  private started = false;
  private facing: FacingDirection = 'down';
  private walkFrame = 0;
  private walkFrameElapsed = 0;
  private footstepDistance = 0;
  private hudElapsed = 0;
  private atmosphereElapsed = 0;
  private lastPosition: { x: number; y: number } = {
    x: PLAYER_START.x,
    y: PLAYER_START.y,
  };
  private lastInputSource: 'keyboard' | 'touch' | 'none' = 'none';
  private cleanedUp = false;
  private streamSnapshot: StreamSnapshot = {
    currentChunk: 'residential-west',
    loadedChunks: [],
    loadingChunk: null,
    lastUnloadedChunk: null,
    area: 'residential',
  };

  private readonly handleTimePreview = (event: Event): void => {
    const nextMinutes = (event as CustomEvent<number>).detail;
    if (nextMinutes < this.displayedMinutes - 400) {
      this.displayedMinutes = nextMinutes;
    }
    this.targetMinutes = Math.min(FESTIVAL_DAY_END, Math.max(GAME_DAY_START, nextMinutes));
  };

  private readonly handleGameStarted = (): void => {
    this.started = true;
  };

  private readonly handleCollisionDebug = (event: Event): void => {
    this.mapStreamer.setCollisionDebug((event as CustomEvent<boolean>).detail);
  };

  constructor() {
    super('ExplorationScene');
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`M1.1 visual asset failed to load: ${file.key}`);
    });

    for (const [key, svg] of Object.entries(M11_VISUAL_ASSETS)) {
      this.load.svg(key, svgToBase64DataUrl(svg));
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#75966b');
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setRoundPixels(false);

    this.atmosphereLayer = new AtmosphereLayer(this);
    this.mapStreamer = new MapStreamer(this);
    this.inputSystem = new InputSystem(this);
    this.streamSnapshot = this.mapStreamer.update(PLAYER_START.x, 0);
    this.atmosphereLayer.setArea(this.streamSnapshot.area);

    this.playerShadow = this.add
      .ellipse(PLAYER_START.x + 4, PLAYER_START.y + 3, 58, 18, 0x173643, 0.24)
      .setDepth(depthForFootY(PLAYER_START.y, -1));
    this.player = this.add
      .image(PLAYER_START.x, PLAYER_START.y, 'player-down-0')
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(depthForFootY(PLAYER_START.y, 1));

    this.cameras.main.startFollow(this.player, true, 0.105, 0.105);
    this.cameras.main.setDeadzone(190, 105);

    this.started = isGameStarted();
    this.mapStreamer.setCollisionDebug(isCollisionDebugEnabled());
    this.applyAtmosphere(0);

    window.addEventListener(TIME_PREVIEW_EVENT, this.handleTimePreview);
    window.addEventListener(GAME_STARTED_EVENT, this.handleGameStarted);
    window.addEventListener(COLLISION_DEBUG_EVENT, this.handleCollisionDebug);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.shutdown());
  }

  update(_time: number, delta: number): void {
    const safeDelta = Math.min(delta, 50);
    const smoothing = Math.min(1, safeDelta / 300);
    this.displayedMinutes += (this.targetMinutes - this.displayedMinutes) * smoothing;

    const movement = this.started
      ? this.inputSystem.read()
      : { x: 0, y: 0, magnitude: 0, source: 'none' as const };
    this.lastInputSource = movement.source;

    const before = { x: this.player.x, y: this.player.y };
    const next = resolveMovement(
      before,
      {
        x: movement.x * PLAYER_SPEED * (safeDelta / 1000),
        y: movement.y * PLAYER_SPEED * (safeDelta / 1000),
      },
      PLAYER_BODY,
      this.mapStreamer.getCollisionRects(),
      PLAYER_BOUNDS,
    );
    this.player.setPosition(next.x, next.y);

    const movedDistance = Phaser.Math.Distance.Between(before.x, before.y, next.x, next.y);
    const moving = movedDistance > 0.02;
    if (moving) {
      this.updateFacing(movement.x, movement.y);
      this.walkFrameElapsed += safeDelta;
      this.footstepDistance += movedDistance;
      if (this.walkFrameElapsed >= 145) {
        this.walkFrameElapsed = 0;
        this.walkFrame = this.walkFrame === 0 ? 1 : 0;
      }
      if (this.footstepDistance >= FOOTSTEP_DISTANCE) {
        this.footstepDistance = 0;
        audioEngine.playFootstep(surfaceForPosition(next.x, next.y));
      }
    } else {
      this.walkFrame = 0;
      this.walkFrameElapsed = 0;
    }

    this.player.setTexture(`player-${this.facing}-${this.walkFrame}`);
    this.player.setDepth(depthForFootY(this.player.y, 1));
    this.playerShadow
      .setPosition(this.player.x + 4, this.player.y + 3)
      .setDepth(depthForFootY(this.player.y, -1));

    const directionX = next.x - this.lastPosition.x;
    this.streamSnapshot = this.mapStreamer.update(next.x, directionX);
    this.lastPosition = next;
    this.atmosphereLayer.setArea(this.streamSnapshot.area);
    audioEngine.setArea(this.streamSnapshot.area);

    this.atmosphereElapsed += safeDelta;
    if (this.atmosphereElapsed >= ATMOSPHERE_INTERVAL) {
      this.applyAtmosphere(this.atmosphereElapsed);
      this.atmosphereElapsed = 0;
    }

    this.hudElapsed += safeDelta;
    if (this.hudElapsed >= HUD_INTERVAL) {
      this.hudElapsed = 0;
      publishHudSnapshot({
        fps: Math.round(this.game.loop.actualFps || 0),
        playerX: Math.round(this.player.x),
        playerY: Math.round(this.player.y),
        area: this.streamSnapshot.area,
        currentChunk: this.streamSnapshot.currentChunk,
        loadedChunks: this.streamSnapshot.loadedChunks,
        loadingChunk: this.streamSnapshot.loadingChunk,
        lastUnloadedChunk: this.streamSnapshot.lastUnloadedChunk,
        inputSource: this.lastInputSource,
        collisionDebug: isCollisionDebugEnabled(),
      });
    }
  }

  private updateFacing(x: number, y: number): void {
    if (Math.abs(x) > Math.abs(y)) {
      this.facing = x < 0 ? 'left' : 'right';
    } else if (Math.abs(y) > 0.02) {
      this.facing = y < 0 ? 'up' : 'down';
    }
  }

  private applyAtmosphere(delta: number): void {
    const atmosphere = getAtmosphere(this.displayedMinutes);
    this.atmosphereLayer.update(atmosphere, this.displayedMinutes, delta);
    this.mapStreamer.applyAtmosphere(atmosphere);
    this.player.setTint(
      atmosphere.phase === 'night'
        ? 0x91a4cc
        : atmosphere.phase === 'evening'
          ? 0xffc89f
          : atmosphere.phase === 'morning'
            ? 0xfff4df
            : 0xffffff,
    );
    this.playerShadow.setFillStyle(
      atmosphere.shadow,
      0.19 + atmosphere.starAlpha * 0.12,
    );
    audioEngine.setPhase(getTimePhase(this.displayedMinutes));
  }

  private shutdown(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    window.removeEventListener(TIME_PREVIEW_EVENT, this.handleTimePreview);
    window.removeEventListener(GAME_STARTED_EVENT, this.handleGameStarted);
    window.removeEventListener(COLLISION_DEBUG_EVENT, this.handleCollisionDebug);
    this.inputSystem?.destroy();
    this.mapStreamer?.destroy();
    this.atmosphereLayer?.destroy();
  }
}
