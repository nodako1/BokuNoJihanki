import Phaser from 'phaser';
import {
  COLLISION_DEBUG_EVENT,
  GAME_STARTED_EVENT,
  TIME_PREVIEW_EVENT,
  clearAreaTraversalRequest,
  isAudioMuted,
  isCollisionDebugEnabled,
  isGameStarted,
  publishAreaPrompt,
  publishHudSnapshot,
  publishPlayerScreenGeometry,
  readPreviewTime,
  type InputSource,
  type M14AreaId,
  type TraversalDirection,
} from '../gameBridge';
import {
  M14_AREA_IDS,
  getM14AreaDefinition,
  getM14SpawnPoint,
} from '../areas/m14AreaData.mjs';
import {
  M15_GEOMETRY_FIXTURE,
  getM15GeometryArea,
} from '../areas/m15GeometryFixture.mjs';
import {
  M14_PLAYER_ATLAS_KEY,
  M14AreaWorld,
  preloadM14Assets,
} from '../areas/M14AreaWorld';
import {
  HORIZONTAL_MOTION_CONFIG,
  createM14TransitionState,
  getAvailableBranchDirections,
  getM14CameraScrollX,
  isM14InputLocked,
  reduceM14Transition,
  resolveAreaExit,
  stepHorizontalMovement,
  type M14ResolvedTransition,
  type M14TransitionState,
} from '../navigationAdapter/m14NavigationAdapter.mjs';
import { audioEngine } from '../systems/audioEngine';
import { SideScrollInputSystem } from '../systems/SideScrollInputSystem';
import {
  FESTIVAL_DAY_END,
  GAME_DAY_START,
  getAtmosphere,
  getTimePhase,
} from '../systems/timeOfDay';
import { AtmosphereLayer } from '../world/AtmosphereLayer';

const PLAYER_SCALE = M15_GEOMETRY_FIXTURE.player.runtimeScale;
const PLAYER_ORIGIN_X = M15_GEOMETRY_FIXTURE.player.footPivot.x;
const PLAYER_ORIGIN_Y = M15_GEOMETRY_FIXTURE.player.footPivot.y;
const PLAYER_HALF_WIDTH = 37;
const HUD_INTERVAL = 120;
const ATMOSPHERE_INTERVAL = 90;
const CAMERA_LERP = 0.09;
const CONTACT_FRAMES = new Set(['0', '4']);
const TRANSITION_FADE_MS = 300;

type Facing = 'left' | 'right';

export class SideScrollTownScene extends Phaser.Scene {
  private areaId: M14AreaId = 'home-street';
  private world!: M14AreaWorld;
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private inputSystem!: SideScrollInputSystem;
  private atmosphereLayer!: AtmosphereLayer;
  private curtain!: Phaser.GameObjects.Rectangle;
  private loadingLabel!: Phaser.GameObjects.Text;
  private areaTitle!: Phaser.GameObjects.Text;
  private geometryDebug!: Phaser.GameObjects.Graphics;
  private geometryDebugLabel!: Phaser.GameObjects.Text;
  private transitionState: M14TransitionState = createM14TransitionState();
  private facing: Facing = 'right';
  private velocityX = 0;
  private targetMinutes = GAME_DAY_START;
  private displayedMinutes = GAME_DAY_START;
  private started = false;
  private lastInputSource: InputSource = 'none';
  private lastAnimationFrame = '';
  private footstepCount = 0;
  private hudElapsed = 0;
  private atmosphereElapsed = 0;
  private previousBranchDirection: TraversalDirection | null = null;
  private blocked = false;
  private collisionDebugEnabled = false;
  private cleanedUp = false;

  private readonly handleTimePreview = (event: Event): void => {
    const nextMinutes = (event as CustomEvent<number>).detail;
    if (nextMinutes < this.displayedMinutes - 400) this.displayedMinutes = nextMinutes;
    this.targetMinutes = Phaser.Math.Clamp(nextMinutes, GAME_DAY_START, FESTIVAL_DAY_END);
  };

  private readonly handleGameStarted = (): void => {
    this.started = true;
    this.revealAreaTitle();
  };

  private readonly handleCollisionDebug = (event: Event): void => {
    this.collisionDebugEnabled = (event as CustomEvent<boolean>).detail;
    this.drawGeometryDebug();
  };

  constructor() {
    super('M14SideScrollScene');
  }

  preload(): void {
    preloadM14Assets(this);
  }

  create(): void {
    this.cleanedUp = false;
    this.areaId = 'home-street';
    this.facing = 'right';
    this.velocityX = 0;
    this.previousBranchDirection = null;
    this.blocked = false;
    this.collisionDebugEnabled = isCollisionDebugEnabled();
    const initialArea = getM14AreaDefinition(this.areaId);
    const spawn = getM14SpawnPoint(this.areaId, 'start');
    this.targetMinutes = readPreviewTime();
    this.displayedMinutes = this.targetMinutes;
    this.transitionState = createM14TransitionState(this.areaId, spawn.id, {
      timeMinutes: this.targetMinutes,
      timePhase: getTimePhase(this.targetMinutes),
      audioEnabled: !isAudioMuted(),
    });

    this.cameras.main.setBackgroundColor('#88b9cf');
    this.cameras.main.setBounds(0, 0, initialArea.worldWidth, 720);
    this.cameras.main.setRoundPixels(false);

    this.world = new M14AreaWorld(this, this.areaId);
    this.atmosphereLayer = new AtmosphereLayer(this);
    this.atmosphereLayer.setArea(this.areaId);
    this.inputSystem = new SideScrollInputSystem(this);
    this.createAnimations();

    this.facing = spawn.facing;
    this.playerShadow = this.add
      .ellipse(spawn.x, spawn.y + 2, 44, 12, 0x102630, 0.24)
      .setDepth(20);
    this.player = this.add
      .sprite(spawn.x, spawn.y, M14_PLAYER_ATLAS_KEY, `idle-${this.facing}-0`)
      .setOrigin(PLAYER_ORIGIN_X, PLAYER_ORIGIN_Y)
      .setScale(PLAYER_SCALE)
      .setDepth(30);
    this.playIdleAnimation();

    this.geometryDebug = this.add
      .graphics()
      .setDepth(999_920)
      .setVisible(this.collisionDebugEnabled);
    this.geometryDebugLabel = this.add
      .text(14, 106, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px',
        color: '#f6ffef',
        backgroundColor: '#07131de8',
        padding: { x: 10, y: 8 },
        stroke: '#07131d',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(999_921)
      .setVisible(this.collisionDebugEnabled);

    this.curtain = this.add
      .rectangle(640, 360, 1280, 720, 0x07131d, 1)
      .setScrollFactor(0)
      .setDepth(999_960)
      .setAlpha(0);
    this.loadingLabel = this.add
      .text(640, 390, '街を移動しています…', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#fff0bd',
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999_971)
      .setAlpha(0);
    this.areaTitle = this.add
      .text(640, 326, initialArea.displayName, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#fff8df',
        stroke: '#102a30',
        strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 4, color: '#07131d', blur: 12, fill: true },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999_972)
      .setAlpha(0);

    this.started = isGameStarted();
    this.applyAtmosphere(0);
    this.updateCamera(true);
    audioEngine.setArea(this.areaId);
    publishAreaPrompt({ visible: false, direction: null, label: '', areaId: null });
    this.drawGeometryDebug();

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

    const locked = isM14InputLocked(this.transitionState);
    const availableBeforeMove = !locked && this.started
      ? (getAvailableBranchDirections(this.areaId, this.player.x)[0] ?? null)
      : null;
    const input = this.started && !locked
      ? this.inputSystem.read(availableBeforeMove)
      : { horizontal: 0, source: 'none' as const, traversal: null };
    if (this.inputSystem.consumeHardStop()) this.velocityX = 0;
    this.lastInputSource = input.source;

    const movement = stepHorizontalMovement(
      { x: this.player.x, velocityX: this.velocityX, facing: this.facing },
      input.horizontal,
      seconds,
      this.areaId,
      PLAYER_HALF_WIDTH,
    );
    this.velocityX = locked ? 0 : movement.velocityX;
    this.facing = movement.facing;
    this.blocked = movement.blocked;
    this.player.setPosition(movement.x, movement.y);
    this.playerShadow.setPosition(movement.x, movement.y + 2);

    if (movement.moving && !locked) {
      this.playWalkAnimation();
      this.syncFootstep();
    } else {
      this.playIdleAnimation();
    }

    this.updateCamera(false);
    this.world.updateClosedEdgeHint(this.player.x);

    const branchDirections = this.started
      ? getAvailableBranchDirections(this.areaId, this.player.x)
      : [];
    const branchDirection = (branchDirections[0] ?? null) as TraversalDirection | null;
    this.updateBranchPrompt(branchDirection, locked);
    if (branchDirection && !locked) this.publishPanelGeometry();
    this.drawGeometryDebug();

    if (!locked && input.traversal && branchDirection === input.traversal) {
      const transition = resolveAreaExit(this.areaId, input.traversal, this.player.x, this.transitionState);
      if (transition) void this.startTransition(transition);
    }

    if (!locked && input.horizontal < -0.35) {
      const transition = resolveAreaExit(this.areaId, 'left', this.player.x, this.transitionState);
      if (transition) void this.startTransition(transition);
    } else if (!locked && input.horizontal > 0.35) {
      const transition = resolveAreaExit(this.areaId, 'right', this.player.x, this.transitionState);
      if (transition) void this.startTransition(transition);
    }

    this.atmosphereElapsed += safeDelta;
    if (this.atmosphereElapsed >= ATMOSPHERE_INTERVAL) {
      this.applyAtmosphere(this.atmosphereElapsed);
      this.atmosphereElapsed = 0;
    }

    this.hudElapsed += safeDelta;
    if (this.hudElapsed >= HUD_INTERVAL) {
      this.hudElapsed = 0;
      if (!branchDirection || locked) this.publishPanelGeometry();
      this.publishHud(branchDirection, movement.moving);
    }
  }

  private createAnimations(): void {
    for (const direction of ['left', 'right'] as const) {
      const idleKey = `m14-idle-${direction}`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: Array.from({ length: 4 }, (_, index) => ({
            key: M14_PLAYER_ATLAS_KEY,
            frame: `idle-${direction}-${index}`,
          })),
          frameRate: 3,
          repeat: -1,
        });
      }
      const walkKey = `m14-walk-${direction}`;
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: Array.from({ length: 8 }, (_, index) => ({
            key: M14_PLAYER_ATLAS_KEY,
            frame: `walk-${direction}-${index}`,
          })),
          frameRate: 12,
          repeat: -1,
        });
      }
    }
  }

  private playWalkAnimation(): void {
    const key = `m14-walk-${this.facing}`;
    if (this.player.anims.currentAnim?.key !== key || !this.player.anims.isPlaying) {
      this.player.play(key, true);
      this.lastAnimationFrame = '';
    }
    this.player.anims.timeScale = Phaser.Math.Clamp(
      Math.abs(this.velocityX) / HORIZONTAL_MOTION_CONFIG.maxSpeed,
      0.42,
      1,
    );
  }

  private playIdleAnimation(): void {
    const key = `m14-idle-${this.facing}`;
    if (this.player.anims.currentAnim?.key !== key || !this.player.anims.isPlaying) {
      this.player.play(key, true);
      this.lastAnimationFrame = '';
    }
    this.player.anims.timeScale = 1;
  }

  private syncFootstep(): void {
    const frameName = String(this.player.frame.name);
    if (frameName === this.lastAnimationFrame) return;
    this.lastAnimationFrame = frameName;
    const contact = frameName.match(/walk-(?:left|right)-(\d+)/)?.[1];
    if (!contact || !CONTACT_FRAMES.has(contact)) return;
    this.footstepCount += 1;
    audioEngine.playFootstep('asphalt');
  }

  private publishPanelGeometry(): void {
    const canvasRect = this.game.canvas.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    const camera = this.cameras.main;
    const playerBounds = this.player.getBounds();
    const scaleX = canvasRect.width / this.game.canvas.width;
    const scaleY = canvasRect.height / this.game.canvas.height;
    const footX = canvasRect.left + (this.player.x - camera.scrollX) * scaleX;
    const footY = canvasRect.top + (this.player.y - camera.scrollY) * scaleY;
    publishPlayerScreenGeometry({
      rect: {
        left: canvasRect.left + (playerBounds.x - camera.scrollX) * scaleX,
        top: canvasRect.top + (playerBounds.y - camera.scrollY) * scaleY,
        width: playerBounds.width * scaleX,
        height: playerBounds.height * scaleY,
      },
      footRect: {
        left: footX - 1,
        top: footY - 1,
        width: 2,
        height: 2,
      },
      facing: this.facing,
      areaId: this.areaId,
      playerWorldX: this.player.x,
      playerWorldY: this.player.y,
      cameraScrollX: camera.scrollX,
      cameraScrollY: camera.scrollY,
      canvasRect: {
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
      },
      scaleX,
      scaleY,
    });
  }

  private drawGeometryDebug(): void {
    if (!this.geometryDebug || !this.geometryDebugLabel) return;
    this.geometryDebug
      .setVisible(this.collisionDebugEnabled)
      .clear();
    this.geometryDebugLabel.setVisible(this.collisionDebugEnabled);
    if (!this.collisionDebugEnabled || !this.player) return;

    const geometry = getM15GeometryArea(this.areaId);
    const graphics = this.geometryDebug;
    const groundY = geometry.ground.y;

    graphics.lineStyle(3, 0x4eff88, 0.96);
    graphics.lineBetween(0, groundY, geometry.worldWidth, groundY);
    graphics.fillStyle(0x4eff88, 1);
    for (const sample of geometry.ground.samples) {
      graphics.fillCircle(sample.x, sample.y, 5);
    }

    const entranceLines: string[] = [];
    for (const direction of ['up', 'down'] as const) {
      const entrance = geometry.branchEntrances[direction];
      if (!entrance) continue;
      const bandTop = groundY - 76;
      graphics.fillStyle(0x42c8ff, 0.15);
      graphics.fillRect(
        entrance.backgroundRange.minX,
        bandTop,
        entrance.backgroundRange.maxX - entrance.backgroundRange.minX,
        92,
      );
      graphics.lineStyle(3, 0x42c8ff, 0.96);
      graphics.lineBetween(
        entrance.backgroundCenterX,
        bandTop - 14,
        entrance.backgroundCenterX,
        groundY + 20,
      );
      graphics.lineStyle(3, 0xff9e46, 0.98);
      graphics.strokeRect(
        entrance.triggerRange.minX,
        bandTop,
        entrance.triggerRange.maxX - entrance.triggerRange.minX,
        92,
      );
      graphics.lineBetween(
        entrance.triggerCenterX,
        bandTop - 8,
        entrance.triggerCenterX,
        groundY + 14,
      );
      entranceLines.push(
        `${direction.toUpperCase()} bg=${entrance.backgroundCenterX} trigger=${entrance.triggerCenterX} Δ=${entrance.centerDeltaX}`,
      );
    }

    graphics.lineStyle(2, 0xffe56a, 0.95);
    graphics.fillStyle(0xffe56a, 0.95);
    for (const spawn of Object.values(geometry.spawns)) {
      graphics.strokeCircle(spawn.x, spawn.y, 9);
      graphics.fillCircle(spawn.x, spawn.y, 3);
    }

    graphics.lineStyle(3, 0xff4f75, 1);
    graphics.lineBetween(this.player.x - 12, this.player.y, this.player.x + 12, this.player.y);
    graphics.lineBetween(this.player.x, this.player.y - 12, this.player.x, this.player.y + 12);
    graphics.strokeCircle(this.player.x, this.player.y, 7);

    const phase = getTimePhase(this.displayedMinutes);
    const spawnLines = Object.entries(geometry.spawns)
      .map(([id, spawn]) => `${id}@${spawn.x},${spawn.y}`)
      .join(' | ');
    this.geometryDebugLabel.setText([
      `M1.5 GEOMETRY ${this.areaId} / ${phase}`,
      `BG_SHA ${geometry.assets.backgroundSha256[phase].slice(0, 16)}…`,
      `GROUND y=${groundY}  FOOT=(${this.player.x.toFixed(1)},${this.player.y.toFixed(1)}) Δ=${Math.abs(this.player.y - groundY).toFixed(2)}`,
      `PIVOT (${PLAYER_ORIGIN_X},${PLAYER_ORIGIN_Y}) scale=${PLAYER_SCALE}`,
      `SPAWN ${spawnLines}`,
      ...entranceLines,
      'COLOR ground/sample=green bg-entry=blue trigger=orange spawn=yellow foot=red',
    ]);
  }

  private updateCamera(immediate: boolean): void {
    const camera = this.cameras.main;
    const targetX = getM14CameraScrollX(
      this.areaId,
      this.player.x,
      this.velocityX,
      camera.width,
    );
    if (immediate) camera.setScroll(targetX, 0);
    else camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetX, CAMERA_LERP);
    camera.scrollY = 0;
  }

  private updateBranchPrompt(direction: TraversalDirection | null, locked: boolean): void {
    const visible = Boolean(direction) && !locked;
    if (visible && direction !== this.previousBranchDirection) {
      audioEngine.playArrowAvailable();
    }
    this.previousBranchDirection = visible ? direction : null;
    publishAreaPrompt({
      visible,
      direction: visible ? direction : null,
      label: direction === 'up' ? '自販機路地へ' : direction === 'down' ? '生活道路へ戻る' : '',
      areaId: visible ? this.areaId : null,
    });
  }

  private async startTransition(transition: M14ResolvedTransition): Promise<void> {
    if (isM14InputLocked(this.transitionState)) return;
    const origin = {
      areaId: this.areaId,
      spawnId: this.transitionState.currentSpawnId,
      x: this.player.x,
      y: this.player.y,
      facing: this.facing,
      context: this.transitionState.context,
    };
    try {
      this.transitionState = reduceM14Transition(this.transitionState, { type: 'start', transition });
      this.inputSystem.clearForTransition();
      this.velocityX = 0;
      clearAreaTraversalRequest();
      this.updateBranchPrompt(null, true);
      if (transition.direction === 'up' || transition.direction === 'down') {
        audioEngine.playArrowConfirm();
      }
      audioEngine.playTransitionStart();

      this.loadingLabel.setAlpha(0);
      await Promise.all([
        this.tweenAlpha(this.curtain, 1, TRANSITION_FADE_MS),
        this.tweenAlpha(this.loadingLabel, 0.82, TRANSITION_FADE_MS),
      ]);
      this.transitionState = reduceM14Transition(this.transitionState, { type: 'fade-out-complete' });

      await this.wait(90);
      const readyState = reduceM14Transition(
        this.transitionState,
        { type: 'scene-ready' },
      );
      if (
        readyState.phase !== 'fading-in'
        || readyState.currentAreaId !== transition.targetAreaId
        || readyState.currentSpawnId !== transition.targetSpawnId
      ) {
        throw new Error('Navigation core could not resolve the requested M1.5 spawn.');
      }
      this.transitionState = readyState;
      this.areaId = transition.targetAreaId;
      const targetArea = getM14AreaDefinition(this.areaId);
      this.world.setArea(this.areaId);
      this.atmosphereLayer.setArea(this.areaId);
      audioEngine.setArea(this.areaId);
      this.player.setPosition(transition.targetX, transition.targetGroundY);
      this.playerShadow.setPosition(transition.targetX, transition.targetGroundY + 2);
      this.facing = transition.targetFacing;
      this.playIdleAnimation();
      this.cameras.main.setBounds(0, 0, targetArea.worldWidth, 720);
      this.updateCamera(true);
      this.applyAtmosphere(0);
      this.areaTitle.setText(targetArea.displayName).setAlpha(1);
      audioEngine.playAreaReveal();

      await Promise.all([
        this.tweenAlpha(this.curtain, 0, TRANSITION_FADE_MS),
        this.tweenAlpha(this.loadingLabel, 0, 180),
      ]);
      this.transitionState = reduceM14Transition(this.transitionState, { type: 'fade-in-complete' });
      this.tweens.add({
        targets: this.areaTitle,
        alpha: 0,
        delay: 650,
        duration: 280,
        ease: 'Sine.easeIn',
      });
    } catch (error) {
      this.velocityX = 0;
      this.curtain.setAlpha(0);
      this.loadingLabel.setAlpha(0);
      this.areaTitle.setAlpha(0);
      try {
        this.areaId = origin.areaId;
        this.world.setArea(origin.areaId);
        this.atmosphereLayer.setArea(origin.areaId);
        audioEngine.setArea(origin.areaId);
        this.player.setPosition(origin.x, origin.y);
        this.playerShadow.setPosition(origin.x, origin.y + 2);
        this.facing = origin.facing;
        this.transitionState = createM14TransitionState(
          origin.areaId,
          origin.spawnId,
          origin.context,
        );
        const originArea = getM14AreaDefinition(origin.areaId);
        this.cameras.main.setBounds(0, 0, originArea.worldWidth, 720);
        this.playIdleAnimation();
        this.updateCamera(true);
        this.applyAtmosphere(0);
      } catch {
        this.scene.restart();
      }
      console.warn('M1.5 area transition recovered after an unexpected error.', error);
    }
  }

  private revealAreaTitle(): void {
    const label = getM14AreaDefinition(this.areaId).displayName;
    this.areaTitle.setText(label).setAlpha(0);
    this.tweens.add({
      targets: this.areaTitle,
      alpha: 1,
      duration: 240,
      yoyo: true,
      hold: 850,
      ease: 'Sine.easeOut',
    });
  }

  private applyAtmosphere(delta: number): void {
    const atmosphere = getAtmosphere(this.displayedMinutes);
    this.atmosphereLayer.update(atmosphere, this.displayedMinutes, delta);
    this.world.applyAtmosphere(atmosphere, this.displayedMinutes);
    this.player.setTint(
      atmosphere.phase === 'night'
        ? 0x8499c4
        : atmosphere.phase === 'evening'
          ? 0xffc29b
          : atmosphere.phase === 'morning'
            ? 0xfff1da
            : 0xffffff,
    );
    this.playerShadow.setFillStyle(atmosphere.shadow, 0.18 + atmosphere.starAlpha * 0.08);
    audioEngine.setPhase(getTimePhase(this.displayedMinutes));
    audioEngine.setArea(this.areaId);
  }

  private publishHud(branchDirection: TraversalDirection | null, moving: boolean): void {
    const area = getM14AreaDefinition(this.areaId);
    const cameraMaxX = Math.max(0, area.worldWidth - this.cameras.main.width);
    publishHudSnapshot({
      fps: Math.round(this.game.loop.actualFps || 0),
      playerX: Math.round(this.player.x),
      playerY: Math.round(this.player.y),
      area: this.areaId,
      areaLabel: area.displayName,
      currentChunk: this.areaId,
      loadedChunks: [...M14_AREA_IDS],
      loadingChunk: this.transitionState.pendingTransition?.targetAreaId ?? null,
      lastUnloadedChunk: null,
      inputSource: this.lastInputSource,
      collisionDebug: this.collisionDebugEnabled,
      sectionLabel: area.displayName,
      facing: this.facing,
      animation: moving ? `walk-${this.facing}` : `idle-${this.facing}`,
      speed: Math.round(Math.abs(this.velocityX)),
      walkable: true,
      blocked: this.blocked,
      footstepCount: this.footstepCount,
      exitNearby: this.player.x < 90 || this.player.x > area.worldWidth - 90,
      cameraScrollX: Math.round(this.cameras.main.scrollX),
      cameraMaxX,
      transitionState: this.transitionState.phase,
      inputLocked: isM14InputLocked(this.transitionState),
      branchDirection,
      branchVisible: Boolean(branchDirection),
      spawnId: this.transitionState.currentSpawnId,
      lastTransitionId: this.transitionState.lastTransition?.exitId ?? null,
      timeMinutes: Math.round(this.displayedMinutes),
      audioMuted: isAudioMuted(),
      worldWidth: area.worldWidth,
    });
  }

  private tweenAlpha(
    target: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text,
    alpha: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({
        targets: target,
        alpha,
        duration,
        ease: 'Sine.easeInOut',
        onComplete: () => resolve(),
      });
    });
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(milliseconds, resolve);
    });
  }

  private shutdown(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    window.removeEventListener(TIME_PREVIEW_EVENT, this.handleTimePreview);
    window.removeEventListener(GAME_STARTED_EVENT, this.handleGameStarted);
    window.removeEventListener(COLLISION_DEBUG_EVENT, this.handleCollisionDebug);
    publishAreaPrompt({ visible: false, direction: null, label: '', areaId: null });
    this.inputSystem?.destroy();
    this.world?.destroy();
    this.atmosphereLayer?.destroy();
    this.geometryDebug?.destroy();
    this.geometryDebugLabel?.destroy();
  }
}
