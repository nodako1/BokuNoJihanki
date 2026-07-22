import Phaser from 'phaser';
import type { AreaId } from '../gameBridge';
import { mixColor, type Atmosphere } from '../systems/timeOfDay';
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
  type PropKind,
} from './worldConfig';

interface PropInstance {
  definition: PropDefinition;
  image: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  glow: Phaser.GameObjects.Ellipse | null;
}

interface ChunkInstance {
  definition: ChunkDefinition;
  ground: Phaser.GameObjects.Graphics;
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

function tintForProp(kind: PropKind, atmosphere: Atmosphere): number {
  switch (kind) {
    case 'tree':
    case 'hedge':
    case 'flowerbed':
      return mixColor(0xffffff, atmosphere.ground, 0.24 + atmosphere.starAlpha * 0.25);
    case 'house':
      return atmosphere.buildingTint;
    case 'vending':
      return mixColor(0xffffff, atmosphere.shadow, atmosphere.starAlpha * 0.32);
    default:
      return mixColor(0xffffff, atmosphere.shadow, atmosphere.starAlpha * 0.22);
  }
}

export class MapStreamer {
  private readonly chunks = new Map<number, ChunkInstance>();
  private readonly debugGraphics: Phaser.GameObjects.Graphics;
  private currentChunkIndex = 0;
  private loadingChunk: string | null = null;
  private lastUnloadedChunk: string | null = null;
  private collisionDebug = false;
  private atmosphere: Atmosphere | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.debugGraphics = scene.add.graphics().setDepth(999_990);
  }

  update(playerX: number, directionX: number): StreamSnapshot {
    this.currentChunkIndex = chunkIndexForX(playerX, CHUNK_WIDTH, WORLD_CHUNK_COUNT);
    const desired = desiredChunkIds(
      this.currentChunkIndex,
      directionX,
      WORLD_CHUNK_COUNT,
    );

    for (const index of desired) {
      if (!this.chunks.has(index)) {
        this.loadingChunk = WORLD_CHUNKS[index]?.id ?? `chunk-${index}`;
        this.loadChunk(index);
        this.loadingChunk = null;
      }
    }

    for (const index of [...this.chunks.keys()]) {
      if (!desired.includes(index)) {
        this.unloadChunk(index);
      }
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

  applyAtmosphere(atmosphere: Atmosphere): void {
    this.atmosphere = atmosphere;
    for (const chunk of this.chunks.values()) {
      this.drawGround(chunk, atmosphere);
      for (const prop of chunk.props) {
        prop.image.setTint(tintForProp(prop.definition.kind, atmosphere));
        prop.shadow.setFillStyle(atmosphere.shadow, 0.14 + atmosphere.starAlpha * 0.2);
        const sunDirection = (atmosphere.sunX - 0.5) * -1;
        prop.shadow.setScale(1.05 + Math.abs(sunDirection) * 0.65, 0.72);
        prop.shadow.setRotation(sunDirection * 0.16);
        if (prop.glow) {
          prop.glow.setFillStyle(0xffe2a0, 0.05 + atmosphere.lampAlpha * 0.14);
          prop.glow.setVisible(atmosphere.lampAlpha > 0.04);
        }
      }
    }
  }

  setCollisionDebug(enabled: boolean): void {
    this.collisionDebug = enabled;
    this.redrawDebug();
  }

  destroy(): void {
    for (const index of [...this.chunks.keys()]) {
      this.unloadChunk(index);
    }
    this.debugGraphics.destroy();
  }

  private loadChunk(index: number): void {
    const definition = WORLD_CHUNKS[index];
    if (!definition) {
      return;
    }

    const ground = this.scene.add.graphics().setDepth(-1_000);
    const props = definition.props.map((prop) => this.createProp(prop));
    const collisions = definition.props.flatMap((prop) => {
      if (!prop.collision) {
        return [];
      }
      const scale = prop.scale ?? 1;
      return [
        {
          x: prop.x + prop.collision.xOffset * scale,
          y: prop.y + prop.collision.yOffset * scale,
          width: prop.collision.width * scale,
          height: prop.collision.height * scale,
        },
      ];
    });

    const instance: ChunkInstance = { definition, ground, props, collisions };
    this.chunks.set(index, instance);
    if (this.atmosphere) {
      this.drawGround(instance, this.atmosphere);
      this.applyAtmosphere(this.atmosphere);
    }
  }

  private unloadChunk(index: number): void {
    const chunk = this.chunks.get(index);
    if (!chunk) {
      return;
    }

    this.lastUnloadedChunk = chunk.definition.id;
    chunk.ground.destroy();
    for (const prop of chunk.props) {
      prop.image.destroy();
      prop.shadow.destroy();
      prop.glow?.destroy();
    }
    this.chunks.delete(index);
  }

  private createProp(definition: PropDefinition): PropInstance {
    const image = this.scene.add
      .image(definition.x, definition.y, definition.texture)
      .setOrigin(0.5, 1)
      .setScale(definition.scale ?? 1)
      .setFlipX(definition.flipX ?? false)
      .setDepth(depthForFootY(definition.y, definition.depthOffset ?? 0));

    const shadowScaleByKind: Partial<Record<PropKind, [number, number]>> = {
      house: [118, 18],
      tree: [45, 13],
      hedge: [90, 12],
      pole: [19, 7],
      lamp: [20, 7],
      bench: [65, 10],
      vending: [37, 10],
      fence: [110, 9],
      playground: [94, 13],
      sign: [35, 8],
      flowerbed: [82, 11],
    };
    const [baseShadowWidth, baseShadowHeight] = shadowScaleByKind[definition.kind] ?? [45, 11];
    const visualScale = definition.scale ?? 1;
    const shadowWidth = baseShadowWidth * visualScale;
    const shadowHeight = baseShadowHeight * visualScale;
    const shadow = this.scene.add
      .ellipse(definition.x + 5, definition.y + 2, shadowWidth * 2, shadowHeight * 2, 0x1c3440, 0.2)
      .setDepth(depthForFootY(definition.y, -2));

    const needsGlow = definition.kind === 'lamp' || definition.kind === 'vending';
    const glow = needsGlow
      ? this.scene.add
          .ellipse(
            definition.x,
            definition.y - (definition.kind === 'lamp' ? 150 : 75),
            definition.kind === 'lamp' ? 160 : 120,
            definition.kind === 'lamp' ? 210 : 145,
            0xffe3a3,
            0,
          )
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(depthForFootY(definition.y, -3))
      : null;

    image.setDepth(depthForFootY(definition.y, definition.depthOffset ?? 0));
    return { definition, image, shadow, glow };
  }

  private drawGround(chunk: ChunkInstance, atmosphere: Atmosphere): void {
    const graphics = chunk.ground;
    const x = chunk.definition.x;
    graphics.clear();

    const groundColor = mixColor(
      chunk.definition.area === 'park' ? 0x76a862 : 0x6f9c61,
      atmosphere.ground,
      0.52,
    );
    const sidewalkColor = mixColor(0xd4c6ad, atmosphere.shadow, atmosphere.starAlpha * 0.42);
    const roadColor = mixColor(0x66737a, atmosphere.shadow, 0.25 + atmosphere.starAlpha * 0.45);

    graphics.fillStyle(groundColor, 1);
    graphics.fillRect(x, 302, chunk.definition.width, 418);

    if (chunk.definition.area === 'residential') {
      graphics.fillStyle(sidewalkColor, 1);
      graphics.fillRect(x, 493, chunk.definition.width, 66);
      graphics.fillStyle(roadColor, 1);
      graphics.fillRect(x, 559, chunk.definition.width, 135);
      graphics.lineStyle(4, 0xf5e9bd, 0.62);
      for (let lineX = x + 40; lineX < x + chunk.definition.width; lineX += 150) {
        graphics.lineBetween(lineX, 628, lineX + 72, 628);
      }
      graphics.lineStyle(3, 0xb4aaa0, 0.52);
      graphics.lineBetween(x, 556, x + chunk.definition.width, 556);
    } else {
      graphics.fillStyle(
        mixColor(0xb9986d, atmosphere.shadow, atmosphere.starAlpha * 0.38),
        1,
      );
      graphics.fillRoundedRect(x - 22, 552, chunk.definition.width + 44, 142, 56);
      graphics.fillStyle(0xd8c59b, 0.7);
      graphics.fillRoundedRect(x - 22, 567, chunk.definition.width + 44, 20, 10);
      graphics.fillStyle(0x9fcf75, 0.34);
      for (let dotX = x + 28; dotX < x + chunk.definition.width; dotX += 74) {
        graphics.fillCircle(dotX, 465 + ((dotX / 74) % 3) * 27, 4);
        graphics.fillCircle(dotX + 30, 518 + ((dotX / 41) % 2) * 22, 3);
      }
    }

    graphics.fillStyle(atmosphere.shadow, 0.08 + atmosphere.starAlpha * 0.12);
    graphics.fillRect(x, 302, chunk.definition.width, 18);
  }

  private redrawDebug(): void {
    this.debugGraphics.clear();
    if (!this.collisionDebug) {
      return;
    }

    this.debugGraphics.lineStyle(2, 0xff5f5f, 0.92);
    this.debugGraphics.fillStyle(0xff5f5f, 0.15);
    for (const rect of this.getCollisionRects()) {
      this.debugGraphics.fillRect(rect.x, rect.y, rect.width, rect.height);
      this.debugGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
  }
}
