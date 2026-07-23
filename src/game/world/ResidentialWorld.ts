import Phaser from 'phaser';
import type { Atmosphere, TimePhase } from '../systems/timeOfDay';
import { depthForFootY } from '../systems/worldMath.mjs';
import { pointInPolygon, sectionIndexForX } from '../systems/walkableMovement.mjs';
import {
  M13_PHASES,
  RESIDENTIAL_M13_MAP,
  m13BackgroundKey,
  m13OcclusionKey,
  type M13SectionId,
  type OcclusionDefinition,
} from './m13Map';
import type { SurfaceId } from './worldConfig';

const PHASE_KEYFRAMES: readonly { minute: number; phase: TimePhase }[] = [
  { minute: 360, phase: 'morning' },
  { minute: 720, phase: 'day' },
  { minute: 1080, phase: 'evening' },
  { minute: 1260, phase: 'night' },
];

interface OcclusionInstance {
  definition: OcclusionDefinition;
  images: Record<TimePhase, Phaser.GameObjects.Image>;
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

export class ResidentialWorld {
  private readonly backgrounds = new Map<M13SectionId, Record<TimePhase, Phaser.GameObjects.Image>>();
  private readonly occlusions: OcclusionInstance[] = [];
  private readonly debugGraphics: Phaser.GameObjects.Graphics;
  private readonly exitLabel: Phaser.GameObjects.Text;
  private collisionDebug = false;

  constructor(scene: Phaser.Scene) {
    this.debugGraphics = scene.add.graphics().setDepth(999_990);
    for (const section of RESIDENTIAL_M13_MAP.sections) {
      const images = {} as Record<TimePhase, Phaser.GameObjects.Image>;
      for (const phase of M13_PHASES) {
        images[phase] = scene.add
          .image(section.x, section.y, m13BackgroundKey(section.id, phase))
          .setOrigin(0, 0)
          .setDepth(-3_000)
          .setAlpha(0)
          .setVisible(false);
      }
      this.backgrounds.set(section.id, images);
    }

    for (const definition of RESIDENTIAL_M13_MAP.occlusions) {
      const images = {} as Record<TimePhase, Phaser.GameObjects.Image>;
      for (const phase of M13_PHASES) {
        images[phase] = scene.add
          .image(definition.x, definition.y, m13OcclusionKey(definition.assetBase, phase))
          .setOrigin(0, 0)
          .setDepth(depthForFootY(definition.footY, 40))
          .setAlpha(0)
          .setVisible(false);
      }
      this.occlusions.push({ definition, images });
    }

    this.exitLabel = scene.add
      .text(4950, 376, '公園方面', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#fff4c7',
        backgroundColor: '#294b36cc',
        padding: { x: 12, y: 7 },
        stroke: '#183126',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(depthForFootY(530, 20));
  }

  applyAtmosphere(_atmosphere: Atmosphere, minutes: number): void {
    const weights = phaseWeights(minutes);
    for (const images of this.backgrounds.values()) {
      for (const phase of M13_PHASES) {
        const alpha = weights[phase];
        images[phase].setAlpha(alpha).setVisible(alpha > 0.001);
      }
    }
    for (const occlusion of this.occlusions) {
      for (const phase of M13_PHASES) {
        const alpha = weights[phase];
        occlusion.images[phase].setAlpha(alpha).setVisible(alpha > 0.001);
      }
    }
  }

  setCollisionDebug(enabled: boolean): void {
    this.collisionDebug = enabled;
    this.redrawDebug();
  }

  sectionForX(x: number): { id: M13SectionId; label: string; index: number } {
    const index = sectionIndexForX(x, 1280, RESIDENTIAL_M13_MAP.sections.length);
    const section = RESIDENTIAL_M13_MAP.sections[index] ?? RESIDENTIAL_M13_MAP.sections[0]!;
    const labels = ['主人公の家の前', '住宅が並ぶ生活道路', '細い路地と曲がり角', '自販機のある小交差点'];
    return { id: section.id, label: labels[index] ?? section.id, index };
  }

  surfaceAt(x: number, y: number): SurfaceId {
    for (let index = RESIDENTIAL_M13_MAP.groundPolygons.length - 1; index >= 0; index -= 1) {
      const ground = RESIDENTIAL_M13_MAP.groundPolygons[index];
      if (ground && pointInPolygon({ x, y }, ground.polygon)) return ground.surface;
    }
    return 'asphalt';
  }

  isAtExit(x: number, y: number): boolean {
    return RESIDENTIAL_M13_MAP.exits.some((exit) =>
      x >= exit.x && x <= exit.x + exit.width && y >= exit.y && y <= exit.y + exit.height,
    );
  }

  redrawDebug(): void {
    const graphics = this.debugGraphics;
    graphics.clear();
    if (!this.collisionDebug) return;

    graphics.lineStyle(3, 0x45ff75, 0.95);
    graphics.fillStyle(0x45ff75, 0.12);
    for (const polygon of RESIDENTIAL_M13_MAP.walkablePolygons) {
      const points = polygon.map((point) => new Phaser.Math.Vector2(point.x, point.y));
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
    }

    graphics.lineStyle(3, 0xff534d, 0.98);
    graphics.fillStyle(0xff534d, 0.18);
    for (const polygon of RESIDENTIAL_M13_MAP.obstaclePolygons) {
      const points = polygon.map((point) => new Phaser.Math.Vector2(point.x, point.y));
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
    }

    graphics.lineStyle(3, 0x4b7dff, 0.96);
    graphics.fillStyle(0x4b7dff, 0.16);
    for (const exit of RESIDENTIAL_M13_MAP.exits) {
      graphics.fillRect(exit.x, exit.y, exit.width, exit.height);
      graphics.strokeRect(exit.x, exit.y, exit.width, exit.height);
    }

    const spawn = RESIDENTIAL_M13_MAP.spawn;
    graphics.fillStyle(0xffd24a, 0.95);
    graphics.fillCircle(spawn.x, spawn.y, 9);
  }

  destroy(): void {
    for (const images of this.backgrounds.values()) {
      for (const image of Object.values(images)) image.destroy();
    }
    for (const occlusion of this.occlusions) {
      for (const image of Object.values(occlusion.images)) image.destroy();
    }
    this.debugGraphics.destroy();
    this.exitLabel.destroy();
  }
}
