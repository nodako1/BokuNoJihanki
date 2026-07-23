import Phaser from 'phaser';
import type { M14AreaId } from '../gameBridge';
import type { Atmosphere, TimePhase } from '../systems/timeOfDay';
import { M14_AREA_IDS, getM14AreaDefinition } from './m14AreaData.mjs';

export const M14_ASSET_ROOT = '/assets/images/m14';
export const M14_PHASES: readonly TimePhase[] = ['morning', 'day', 'evening', 'night'];
export const M14_PLAYER_ATLAS_KEY = 'm14-player-atlas';
export const M14_PLAYER_ATLAS_IMAGE = `${M14_ASSET_ROOT}/player-atlas.webp`;
export const M14_PLAYER_ATLAS_JSON = `${M14_ASSET_ROOT}/player-atlas.json`;

const PHASE_KEYFRAMES: readonly { minute: number; phase: TimePhase }[] = [
  { minute: 360, phase: 'morning' },
  { minute: 720, phase: 'day' },
  { minute: 1080, phase: 'evening' },
  { minute: 1260, phase: 'night' },
];

export function m14BackgroundKey(areaId: M14AreaId, phase: TimePhase): string {
  return `m14-bg-${areaId}-${phase}`;
}

export function m14BackgroundPath(areaId: M14AreaId, phase: TimePhase): string {
  return `${M14_ASSET_ROOT}/bg-${areaId}-${phase}.webp`;
}

export function m14ForegroundKey(areaId: M14AreaId): string {
  return `m14-fg-${areaId}`;
}

export function m14ForegroundPath(areaId: M14AreaId): string {
  return `${M14_ASSET_ROOT}/fg-${areaId}.webp`;
}

export function preloadM14Assets(scene: Phaser.Scene): void {
  for (const areaId of M14_AREA_IDS as readonly M14AreaId[]) {
    for (const phase of M14_PHASES) {
      scene.load.image(m14BackgroundKey(areaId, phase), m14BackgroundPath(areaId, phase));
    }
    scene.load.image(m14ForegroundKey(areaId), m14ForegroundPath(areaId));
  }
  scene.load.atlas(M14_PLAYER_ATLAS_KEY, M14_PLAYER_ATLAS_IMAGE, M14_PLAYER_ATLAS_JSON);
}

function phaseWeights(minutes: number): Record<TimePhase, number> {
  const result: Record<TimePhase, number> = { morning: 0, day: 0, evening: 0, night: 0 };
  if (minutes <= PHASE_KEYFRAMES[0]!.minute) {
    result.morning = 1;
    return result;
  }
  const last = PHASE_KEYFRAMES[PHASE_KEYFRAMES.length - 1]!;
  if (minutes >= last.minute) {
    result.night = 1;
    return result;
  }
  for (let index = 0; index < PHASE_KEYFRAMES.length - 1; index += 1) {
    const start = PHASE_KEYFRAMES[index]!;
    const end = PHASE_KEYFRAMES[index + 1]!;
    if (minutes < start.minute || minutes > end.minute) continue;
    const progress = (minutes - start.minute) / Math.max(1, end.minute - start.minute);
    result[start.phase] = 1 - progress;
    result[end.phase] = progress;
    return result;
  }
  result.day = 1;
  return result;
}

export class M14AreaWorld {
  private backgrounds = {} as Record<TimePhase, Phaser.GameObjects.Image>;
  private foreground!: Phaser.GameObjects.Image;
  private lightLayer!: Phaser.GameObjects.Graphics;
  private closedEdgeHint!: Phaser.GameObjects.Text;
  private areaId!: M14AreaId;

  constructor(private readonly scene: Phaser.Scene, areaId: M14AreaId) {
    this.createArea(areaId);
  }

  get currentAreaId(): M14AreaId {
    return this.areaId;
  }

  setArea(areaId: M14AreaId): void {
    this.destroyArea();
    this.createArea(areaId);
  }

  applyAtmosphere(atmosphere: Atmosphere, minutes: number): void {
    const weights = phaseWeights(minutes);
    for (const phase of M14_PHASES) {
      const alpha = weights[phase];
      this.backgrounds[phase].setAlpha(alpha).setVisible(alpha > 0.001);
    }

    this.lightLayer.clear();
    if (atmosphere.lampAlpha <= 0.02) return;
    const area = getM14AreaDefinition(this.areaId);
    const glows = this.areaId === 'upper-vending-lane'
      ? [{ x: Math.round(area.worldWidth * 0.43), y: 367, radius: 105 }]
      : this.areaId === 'life-road'
        ? [{ x: Math.round(area.worldWidth * 0.52), y: 385, radius: 64 }]
        : [{ x: Math.round(area.worldWidth * 0.58), y: 378, radius: 60 }];
    for (const glow of glows) {
      this.lightLayer.fillStyle(0xffd77b, atmosphere.lampAlpha * 0.11);
      this.lightLayer.fillCircle(glow.x, glow.y, glow.radius);
      this.lightLayer.fillStyle(0xffefbd, atmosphere.lampAlpha * 0.18);
      this.lightLayer.fillCircle(glow.x, glow.y, glow.radius * 0.42);
    }
  }

  updateClosedEdgeHint(playerX: number): void {
    const area = getM14AreaDefinition(this.areaId);
    const nearRight = playerX > area.worldWidth - 180 && area.rightExit.kind === 'closed';
    const nearLeft = playerX < 180 && area.leftExit.kind === 'closed';
    this.closedEdgeHint.setVisible(nearRight || nearLeft);
  }

  destroy(): void {
    this.destroyArea();
  }

  private createArea(areaId: M14AreaId): void {
    this.areaId = areaId;
    const area = getM14AreaDefinition(areaId);
    this.backgrounds = {} as Record<TimePhase, Phaser.GameObjects.Image>;
    for (const phase of M14_PHASES) {
      this.backgrounds[phase] = this.scene.add
        .image(0, 0, m14BackgroundKey(areaId, phase))
        .setOrigin(0, 0)
        .setDisplaySize(area.worldWidth, 720)
        .setDepth(-5_000)
        .setAlpha(phase === 'morning' ? 1 : 0)
        .setVisible(phase === 'morning');
    }
    this.foreground = this.scene.add
      .image(0, 0, m14ForegroundKey(areaId))
      .setOrigin(0, 0)
      .setDisplaySize(area.worldWidth, 720)
      .setDepth(700_000)
      .setAlpha(0.94);
    this.lightLayer = this.scene.add
      .graphics()
      .setDepth(705_000)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.closedEdgeHint = this.scene.add
      .text(640, 570, 'この先は、次の街エリアで開通します', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#fff4c6',
        backgroundColor: '#173731dd',
        padding: { x: 16, y: 10 },
        stroke: '#0c201d',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(999_930)
      .setVisible(false);
  }

  private destroyArea(): void {
    for (const image of Object.values(this.backgrounds)) image.destroy();
    this.foreground?.destroy();
    this.lightLayer?.destroy();
    this.closedEdgeHint?.destroy();
  }
}
