import Phaser from 'phaser';
import type { AreaId } from '../gameBridge';
import type { Atmosphere, TimePhase } from '../systems/timeOfDay';
import {
  areaForX,
  chunkIndexForX,
  depthForFootY,
  desiredChunkIds,
  type Rect,
} from '../systems/worldMath.mjs';
import {
  CHUNK_WIDTH,
  WORLD_CHUNKS,
  WORLD_CHUNK_COUNT,
  type ChunkDefinition,
  type PropDefinition,
} from './worldConfig';

const PHASE_KEYFRAMES: readonly { minute: number; phase: TimePhase }[] = [
  { minute: 360, phase: 'morning' },
  { minute: 720, phase: 'day' },
  { minute: 1080, phase: 'evening' },
  { minute: 1260, phase: 'night' },
];

interface PropInstance {
  definition: PropDefinition;
  image: Phaser.GameObjects.Image | null;
  shadow: Phaser.GameObjects.Ellipse | null;
}

interface ChunkInstance {
  definition: ChunkDefinition;
  backgrounds: Record<TimePhase, Phaser.GameObjects.Image>;
  foregrounds: Record<TimePhase, Phaser.GameObjects.Image>;
  props: PropInstance[];
  collisions: Rect[];
}

export interface StreamSnapshot {
  currentChunk: string;
  loadedChunks: string[];
  loadingChunk: string | null;
  lastUnloadedChunk: string | null;
  area: AreaId;
}

function phaseWeights(minutes: number): Record<TimePhase, number> {
  const weights: Record<TimePhase, number> = {
    morning: 0,
    day: 0,
    evening: 0,
    night: 0,
  };
  if (minutes <= PHASE_KEYFRAMES[0]!.minute) {
    weights.morning = 1;
    return weights;
  }
  const last = PHASE_KEYFRAMES[PHASE_KEYFRAMES.length - 1]!;
  if (minutes >= last.minute) {
    weights.night = 1;
    return weights;
  }
  for (let index = 0; index < PHASE_KEYFRAMES.length - 1; index += 1) {
    const start = PHASE_KEYFRAMES[index]!;
    const end = PHASE_KEYFRAMES[index + 1]!;
    if (minutes >= start.minute && minutes <= end.minute) {
      const progress = (minutes - start.minute) / Math.max(1, end.minute - start.minute);
      weights[start.phase] = 1 - progress;
      weights[end.phase] = progress;
      return weights;
    }
  }
  weights.day = 1;
  return weights;
}

export class MapStreamer {
  private readonly chunks = new Map<number, ChunkInstance>();
  private readonly debugGraphics: Phaser.GameObjects.Graphics;
  private currentChunkIndex = 0;
  private loadingChunk: string | null = null;
  private lastUnloadedChunk: string | null = null;
  private collisionDebug = false;
  private atmosphere: Atmosphere | null = null;
  private minutes = 360;

  constructor(private readonly scene: Phaser.Scene) {
    this.debugGraphics = scene.add.graphics().setDepth(999_990);
  }

  update(playerX: number, directionX: number): StreamSnapshot {
    this.currentChunkIndex = chunkIndexForX(playerX, CHUNK_WIDTH, WORLD_CHUNK_COUNT);
    const desired = desiredChunkIds(this.currentChunkIndex, directionX, WORLD_CHUNK_COUNT);

    for (const index of desired) {
      if (!this.chunks.has(index)) {
        this.loadingChunk = WORLD_CHUNKS[index]?.id ?? `chunk-${index}`;
        this.loadChunk(index);
        this.loadingChunk = null;
      }
    }
    for (const index of [...this.chunks.keys()]) {
      if (!desired.includes(index)) this.unloadChunk(index);
    }

    this.redrawDebug();
    const definition = WORLD_CHUNKS[this.currentChunkIndex];
    return {
      currentChunk: definition?.id ?? 'unknown',
      loadedChunks: [...this.chunks.keys()]
        .sort((a, b) => a - b)
        .map((index) => WORLD_CHUNKS[index]?.id ?? `chunk-${index}`),
      loadingChunk: this.loadingChunk,
      lastUnloadedChunk: this.lastUnloadedChunk,
      area: areaForX(playerX),
    };
  }

  getCollisionRects(): Rect[] {
    return [...this.chunks.values()].flatMap((chunk) => chunk.collisions);
  }

  applyAtmosphere(atmosphere: Atmosphere, minutes: number): void {
    this.atmosphere = atmosphere;
    this.minutes = minutes;
    const weights = phaseWeights(minutes);
    for (const chunk of this.chunks.values()) {
      for (const phase of Object.keys(weights) as TimePhase[]) {
        const alpha = weights[phase];
        chunk.backgrounds[phase].setAlpha(alpha).setVisible(alpha > 0.001);
        chunk.foregrounds[phase].setAlpha(alpha).setVisible(alpha > 0.001);
      }
      for (const prop of chunk.props) {
        if (prop.image) {
          prop.image.setTint(atmosphere.phase === 'night' ? 0x8ba0c2 : 0xffffff);
        }
        if (prop.shadow) {
          prop.shadow.setFillStyle(atmosphere.shadow, 0.16 + atmosphere.starAlpha * 0.12);
        }
      }
    }
  }

  setCollisionDebug(enabled: boolean): void {
    this.collisionDebug = enabled;
    this.redrawDebug();
  }

  destroy(): void {
    for (const index of [...this.chunks.keys()]) this.unloadChunk(index);
    this.debugGraphics.destroy();
  }

  private loadChunk(index: number): void {
    const definition = WORLD_CHUNKS[index];
    if (!definition) return;

    const backgrounds = {} as Record<TimePhase, Phaser.GameObjects.Image>;
    const foregrounds = {} as Record<TimePhase, Phaser.GameObjects.Image>;
    for (const phase of PHASE_KEYFRAMES.map((item) => item.phase)) {
      backgrounds[phase] = this.scene.add
        .image(definition.x, 0, definition.backgroundTextures[phase])
        .setOrigin(0, 0)
        .setDepth(-3_000)
        .setAlpha(0)
        .setVisible(false);
      foregrounds[phase] = this.scene.add
        .image(definition.x, 0, definition.foregroundTextures[phase])
        .setOrigin(0, 0)
        .setDepth(9_500)
        .setAlpha(0)
        .setVisible(false);
    }

    const props = definition.props.map((prop) => this.createProp(prop, Boolean(definition.bakedVisuals)));
    const collisions = definition.props.flatMap((prop) => {
      if (!prop.collision) return [];
      const scale = prop.scale ?? 1;
      return [{
        x: prop.x + prop.collision.xOffset * scale,
        y: prop.y + prop.collision.yOffset * scale,
        width: prop.collision.width * scale,
        height: prop.collision.height * scale,
      }];
    });

    const instance: ChunkInstance = { definition, backgrounds, foregrounds, props, collisions };
    this.chunks.set(index, instance);
    if (this.atmosphere) this.applyAtmosphere(this.atmosphere, this.minutes);
    else this.applyAtmosphere({
      phase: 'morning', phaseLabel: '朝', skyTop: 0, skyBottom: 0, horizon: 0,
      distantGround: 0, ground: 0, buildingTint: 0xffffff, shadow: 0x31556b,
      sunColor: 0xffffff, sunX: 0.17, sunY: 0.26, sunAlpha: 1, starAlpha: 0,
      lampAlpha: 0, windowLightAlpha: 0, warmthAlpha: 0,
    }, 360);
  }

  private unloadChunk(index: number): void {
    const chunk = this.chunks.get(index);
    if (!chunk) return;
    this.lastUnloadedChunk = chunk.definition.id;
    for (const image of Object.values(chunk.backgrounds)) image.destroy();
    for (const image of Object.values(chunk.foregrounds)) image.destroy();
    for (const prop of chunk.props) {
      prop.image?.destroy();
      prop.shadow?.destroy();
    }
    this.chunks.delete(index);
  }

  private createProp(definition: PropDefinition, bakedVisuals: boolean): PropInstance {
    if (bakedVisuals) return { definition, image: null, shadow: null };
    const scale = definition.scale ?? 1;
    const image = this.scene.add
      .image(definition.x, definition.y, definition.texture)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setFlipX(definition.flipX ?? false)
      .setDepth(depthForFootY(definition.y, definition.depthOffset ?? 0));
    const shadow = this.scene.add
      .ellipse(definition.x + 5, definition.y + 2, 100 * scale, 20 * scale, 0x1c3440, 0.18)
      .setDepth(depthForFootY(definition.y, -2));
    return { definition, image, shadow };
  }

  private redrawDebug(): void {
    this.debugGraphics.clear();
    if (!this.collisionDebug) return;
    this.debugGraphics.lineStyle(2, 0xff5f5f, 0.92);
    this.debugGraphics.fillStyle(0xff5f5f, 0.15);
    for (const rect of this.getCollisionRects()) {
      this.debugGraphics.fillRect(rect.x, rect.y, rect.width, rect.height);
      this.debugGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
  }
}
