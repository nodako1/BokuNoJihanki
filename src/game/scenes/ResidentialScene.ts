import Phaser from 'phaser';
import {
  COLLISION_DEBUG_EVENT,
  GAME_STARTED_EVENT,
  TIME_PREVIEW_EVENT,
  isCollisionDebugEnabled,
  isGameStarted,
  publishHudSnapshot,
} from '../gameBridge';
import { AreaTransitionSystem } from '../systems/AreaTransitionSystem';
import { audioEngine } from '../systems/audioEngine';
import { InputSystem } from '../systems/inputSystem';
import {
  approach,
  chooseFacing,
  isFootprintValid,
  resolveWalkableMovement,
  type Facing,
} from '../systems/walkableMovement.mjs';
import {
  FESTIVAL_DAY_END,
  GAME_DAY_START,
  getAtmosphere,
  getTimePhase,
} from '../systems/timeOfDay';
import { depthForFootY } from '../systems/worldMath.mjs';
import { AtmosphereLayer } from '../world/AtmosphereLayer';
import {
  M13_PHASES,
  M13_PLAYER_ATLAS_IMAGE,
  M13_PLAYER_ATLAS_JSON,
  M13_PLAYER_ATLAS_KEY,
  RESIDENTIAL_M13_MAP,
  m13BackgroundKey,
  m13BackgroundPath,
  m13OcclusionKey,
  m13OcclusionPath
} from '../world/m13Map';
import { ResidentialWorld } from '../world/ResidentialWorld';

const PLAYER_SCALE = 0.62;
const FOOT_RADIUS = 12;
const MAX_SPEED_X = 150;
const MAX_SPEED_Y = 112;
const ACCELERATION = 820;
const DECELERATION = 1_180;
const HUD_INTERVAL = 160;
const ATMOSPHERE_INTERVAL = 110;
const CAMERA_LERP = 0.075;
const CAMERA_LOOK_AHEAD = 88;
const CONTACT_FRAMES = new Set(['1', '5']);

export class ResidentialScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private inputSystem!: InputSystem;
  private world!: ResidentialWorld;
  private atmosphereLayer!: AtmosphereLayer;
  private transitionSystem!: AreaTransitionSystem;
  private exitHint!: Phaser.GameObjects.Text;
  private targetMinutes = GAME_DAY_START;
  private displayedMinutes = GAME_DAY_START;
  private started = false;
  private facing: Facing = 'right';
  private velocity = { x: 0, y: 0 };
  private lastInputSource: 'keyboard' | 'touch' | 'none' = 'none';
  private hudElapsed = 0;
  private atmosphereElapsed = 0;
  private lastAnimationFrame = '';
  private footstepCount = 0;
  private blocked = false;
  private cleanedUp = false;

  private readonly handleTimePreview = (event: Event): void => {
    const nextMinutes = (event as CustomEvent<number>).detail;
    if (nextMinutes < this.displayedMinutes - 400) this.displayedMinutes = nextMinutes;
    this.targetMinutes = Math.min(FESTIVAL_DAY_END, Math.max(GAME_DAY_START, nextMinutes));
  };

  private readonly handleGameStarted = (): void => {
    this.started = true;
  };

  private readonly handleCollisionDebug = (event: Event): void => {
    this.world.setCollisionDebug((event as CustomEvent<boolean>).detail);
  };

  constructor() {
    super('ResidentialScene');
  }

  preload(): void {
    for (const section of RESIDENTIAL_M13_MAP.sections) {
      for (const phase of M13_PHASES) {
        this.load.image(m13BackgroundKey(section.id, phase), m13BackgroundPath(section.id, phase));
      }
    }
    for (const occlusion of RESIDENTIAL_M13_MAP.occlusions) {
      for (const phase of M13_PHASES) {
        this.load.image(m13OcclusionKey(occlusion.assetBase, phase), m13OcclusionPath(occlusion.assetBase, phase));
      }
    }
    this.load.atlas(M13_PLAYER_ATLAS_KEY, M13_PLAYER_ATLAS_IMAGE, M13_PLAYER_ATLAS_JSON);
  }

  create(): void {
    const map = RESIDENTIAL_M13_MAP;
    this.cameras.main.setBackgroundColor('#6e8d69');
    this.cameras.main.setBounds(map.cameraBounds.x, map.cameraBounds.y, map.cameraBounds.width, map.cameraBounds.height);
    this.cameras.main.setRoundPixels(false);

    this.atmosphereLayer = new AtmosphereLayer(this);
    this.atmosphereLayer.setArea('residential');
    this.world = new ResidentialWorld(this);
    this.inputSystem = new InputSystem(this);
    this.transitionSystem = new AreaTransitionSystem(this);
    this.createAnimations();

    const spawn = map.spawn;
    this.facing = spawn.facing;
    this.playerShadow = this.add
      .ellipse(spawn.x, spawn.y + 2, 48, 15, 0x172f34, 0.26)
      .setDepth(depthForFootY(spawn.y, -2));
    this.player = this.add
      .sprite(spawn.x, spawn.y, M13_PLAYER_ATLAS_KEY, `idle-${this.facing}`)
      .setOrigin(0.5, 1)
      .setScale(PLAYER_SCALE)
      .setDepth(depthForFootY(spawn.y, 2));

    this.exitHint = this.add
      .text(640, 610, '公園方面は、次のエリア制作後に開通します', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#fff5ce',
        backgroundColor: '#17332ddd',
        padding: { x: 16, y: 10 },
        stroke: '#0e211d',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999_950)
      .setVisible(false);

    this.started = isGameStarted();
    this.world.setCollisionDebug(isCollisionDebugEnabled());
    this.applyAtmosphere(0);
    this.updateCamera(true);

    window.addEventListener(TIME_PREVIEW_EVENT, this.handleTimePreview);
    window.addEventListener(GAME_STARTED_EVENT, this.handleGameStarted);
    window.addEventListener(COLLISION_DEBUG_EVENT, this.handleCollisionDebug);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.shutdown());
  }

  update(_time: number, delta: number): void {
    const safeDelta = Math.min(delta, 45);
    const seconds = safeDelta / 1000;
    const timeSmoothing = Math.min(1, safeDelta / 300);
    this.displayedMinutes += (this.targetMinutes - this.displayedMinutes) * timeSmoothing;

    const input = this.started
      ? this.inputSystem.read()
      : { x: 0, y: 0, magnitude: 0, source: 'none' as const };
    this.lastInputSource = input.source;

    const targetVelocity = {
      x: input.x * MAX_SPEED_X,
      y: input.y * MAX_SPEED_Y,
    };
    const rate = input.magnitude > 0.02 ? ACCELERATION : DECELERATION;
    this.velocity.x = approach(this.velocity.x, targetVelocity.x, rate * seconds);
    this.velocity.y = approach(this.velocity.y, targetVelocity.y, rate * seconds);
    if (Math.abs(this.velocity.x) < 0.5) this.velocity.x = 0;
    if (Math.abs(this.velocity.y) < 0.5) this.velocity.y = 0;

    const before = { x: this.player.x, y: this.player.y };
    const resolution = resolveWalkableMovement(
      before,
      { x: this.velocity.x * seconds, y: this.velocity.y * seconds },
      FOOT_RADIUS,
      RESIDENTIAL_M13_MAP.walkablePolygons,
      RESIDENTIAL_M13_MAP.obstaclePolygons,
      4,
    );
    this.player.setPosition(resolution.x, resolution.y);
    if (resolution.blockedX) this.velocity.x = 0;
    if (resolution.blockedY) this.velocity.y = 0;
    this.blocked = resolution.blockedX || resolution.blockedY;

    const movedDistance = Math.hypot(resolution.movedX, resolution.movedY);
    const moving = movedDistance > 0.035;
    if (moving) {
      this.facing = chooseFacing(resolution.movedX, resolution.movedY, this.facing);
      this.playWalkAnimation();
      this.syncFootstep();
    } else {
      this.stopWalkAnimation();
    }

    this.player.setDepth(depthForFootY(this.player.y, 2));
    this.playerShadow
      .setPosition(this.player.x, this.player.y + 2)
      .setDepth(depthForFootY(this.player.y, -2));

    this.updateCamera(false);
    const exitNearby = this.player.x > 4820;
    this.exitHint.setVisible(exitNearby);

    this.atmosphereElapsed += safeDelta;
    if (this.atmosphereElapsed >= ATMOSPHERE_INTERVAL) {
      this.applyAtmosphere(this.atmosphereElapsed);
      this.atmosphereElapsed = 0;
    }

    this.hudElapsed += safeDelta;
    if (this.hudElapsed >= HUD_INTERVAL) {
      this.hudElapsed = 0;
      this.publishHud(moving, exitNearby);
    }
  }

  private createAnimations(): void {
    for (const direction of ['down', 'up', 'left', 'right'] as const) {
      const key = `walk-${direction}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: Array.from({ length: 8 }, (_, index) => ({
          key: M13_PLAYER_ATLAS_KEY,
          frame: `walk-${direction}-${index}`,
        })),
        frameRate: 11,
        repeat: -1,
      });
    }
  }

  private playWalkAnimation(): void {
    const key = `walk-${this.facing}`;
    if (this.player.anims.currentAnim?.key !== key || !this.player.anims.isPlaying) {
      this.player.play(key, true);
      this.lastAnimationFrame = '';
    }
  }

  private stopWalkAnimation(): void {
    if (this.player.anims.isPlaying) this.player.stop();
    this.player.setFrame(`idle-${this.facing}`);
    this.lastAnimationFrame = '';
  }

  private syncFootstep(): void {
    const frameName = String(this.player.frame.name);
    if (frameName === this.lastAnimationFrame) return;
    this.lastAnimationFrame = frameName;
    const contact = frameName.match(/walk-(?:down|up|left|right)-(\d+)/)?.[1];
    if (!contact || !CONTACT_FRAMES.has(contact)) return;
    this.footstepCount += 1;
    audioEngine.playFootstep(this.world.surfaceAt(this.player.x, this.player.y));
  }

  private updateCamera(immediate: boolean): void {
    const camera = this.cameras.main;
    const lookAhead = Phaser.Math.Clamp(this.velocity.x * 0.62, -CAMERA_LOOK_AHEAD, CAMERA_LOOK_AHEAD);
    const maxScroll = Math.max(0, RESIDENTIAL_M13_MAP.worldWidth - camera.width);
    const targetX = Phaser.Math.Clamp(this.player.x + lookAhead - camera.width / 2, 0, maxScroll);
    if (immediate) camera.setScroll(targetX, 0);
    else camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetX, CAMERA_LERP);
    camera.scrollY = 0;
  }

  private applyAtmosphere(delta: number): void {
    const atmosphere = getAtmosphere(this.displayedMinutes);
    this.atmosphereLayer.update(atmosphere, this.displayedMinutes, delta);
    this.world.applyAtmosphere(atmosphere, this.displayedMinutes);
    this.player.setTint(
      atmosphere.phase === 'night'
        ? 0x8ea2c7
        : atmosphere.phase === 'evening'
          ? 0xffc69d
          : atmosphere.phase === 'morning'
            ? 0xfff4df
            : 0xffffff,
    );
    this.playerShadow.setFillStyle(atmosphere.shadow, 0.2 + atmosphere.starAlpha * 0.1);
    audioEngine.setPhase(getTimePhase(this.displayedMinutes));
    audioEngine.setArea('residential');
  }

  private publishHud(moving: boolean, exitNearby: boolean): void {
    const section = this.world.sectionForX(this.player.x);
    publishHudSnapshot({
      fps: Math.round(this.game.loop.actualFps || 0),
      playerX: Math.round(this.player.x),
      playerY: Math.round(this.player.y),
      area: 'residential',
      currentChunk: section.id,
      loadedChunks: RESIDENTIAL_M13_MAP.sections.map((item) => item.id),
      loadingChunk: null,
      lastUnloadedChunk: null,
      inputSource: this.lastInputSource,
      collisionDebug: isCollisionDebugEnabled(),
      sectionLabel: section.label,
      facing: this.facing,
      animation: moving ? `walk-${this.facing}` : `idle-${this.facing}`,
      speed: Math.round(Math.hypot(this.velocity.x, this.velocity.y)),
      walkable: isFootprintValid(
        { x: this.player.x, y: this.player.y },
        FOOT_RADIUS,
        RESIDENTIAL_M13_MAP.walkablePolygons,
        RESIDENTIAL_M13_MAP.obstaclePolygons,
      ),
      blocked: this.blocked,
      footstepCount: this.footstepCount,
      exitNearby,
    });
  }

  private shutdown(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    window.removeEventListener(TIME_PREVIEW_EVENT, this.handleTimePreview);
    window.removeEventListener(GAME_STARTED_EVENT, this.handleGameStarted);
    window.removeEventListener(COLLISION_DEBUG_EVENT, this.handleCollisionDebug);
    this.inputSystem?.destroy();
    this.world?.destroy();
    this.atmosphereLayer?.destroy();
    this.transitionSystem?.reset();
  }
}
