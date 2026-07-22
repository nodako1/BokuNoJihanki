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
  type LightKind,
  type PropDefinition,
  type PropKind,
} from './worldConfig';

interface PropLightInstance {
  kind: LightKind;
  alphaScale: number;
  shape: Phaser.GameObjects.Rectangle;
}

interface PropInstance {
  definition: PropDefinition;
  image: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  glow: Phaser.GameObjects.Ellipse | null;
  lights: PropLightInstance[];
}

interface ChunkInstance {
  definition: ChunkDefinition;
  background: Phaser.GameObjects.Image;
  groundOverlay: Phaser.GameObjects.Graphics;
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
    case 'shrub':
    case 'flowerbed':
      return mixColor(0xffffff, atmosphere.ground, 0.16 + atmosphere.starAlpha * 0.34);
    case 'house':
      return atmosphere.buildingTint;
    case 'vending':
      return mixColor(0xffffff, 0x8fa4c4, atmosphere.starAlpha * 0.28);
    case 'playground':
      return mixColor(0xffffff, atmosphere.shadow, atmosphere.starAlpha * 0.22);
    default:
      return mixColor(0xffffff, atmosphere.shadow, atmosphere.starAlpha * 0.25);
  }
}

function backgroundTint(atmosphere: Atmosphere): number {
  if (atmosphere.phase === 'night') {
    return mixColor(0xffffff, 0x63789b, 0.54);
  }
  if (atmosphere.phase === 'evening') {
    return mixColor(0xffffff, 0xffc28e, 0.2);
  }
  if (atmosphere.phase === 'morning') {
    return mixColor(0xffffff, 0xffe7b4, 0.08);
  }
  return 0xffffff;
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
    const sunDirection = (atmosphere.sunX - 0.5) * -1;

    for (const chunk of this.chunks.values()) {
      chunk.background.setTint(backgroundTint(atmosphere));
      this.drawGroundOverlay(chunk, atmosphere);

      for (const prop of chunk.props) {
        prop.image.setTint(tintForProp(prop.definition.kind, atmosphere));
        prop.shadow.setFillStyle(
          atmosphere.shadow,
          (prop.definition.shadow?.alpha ?? 0.2) + atmosphere.starAlpha * 0.12,
        );
        prop.shadow.setScale(1.02 + Math.abs(sunDirection) * 0.62, 0.76);
        prop.shadow.setRotation(sunDirection * 0.18);

        if (prop.glow) {
          prop.glow.setFillStyle(0xffe0a0, 0.035 + atmosphere.lampAlpha * 0.13);
          prop.glow.setVisible(atmosphere.lampAlpha > 0.025);
        }

        for (const light of prop.lights) {
          const sourceAlpha = light.kind === 'window'
            ? atmosphere.windowLightAlpha
            : atmosphere.lampAlpha;
          const alpha = sourceAlpha * light.alphaScale;
          light.shape.setAlpha(alpha);
          light.shape.setVisible(alpha > 0.025);
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

    const background = this.scene.add
      .image(definition.x, 0, definition.backgroundTexture)
      .setOrigin(0, 0)
      .setDepth(-3_000);
    const groundOverlay = this.scene.add.graphics().setDepth(-2_900);
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

    const instance: ChunkInstance = {
      definition,
      background,
      groundOverlay,
      props,
      collisions,
    };
    this.chunks.set(index, instance);
    if (this.atmosphere) {
      this.applyAtmosphere(this.atmosphere);
    }
  }

  private unloadChunk(index: number): void {
    const chunk = this.chunks.get(index);
    if (!chunk) {
      return;
    }

    this.lastUnloadedChunk = chunk.definition.id;
    chunk.background.destroy();
    chunk.groundOverlay.destroy();
    for (const prop of chunk.props) {
      prop.image.destroy();
      prop.shadow.destroy();
      prop.glow?.destroy();
      for (const light of prop.lights) {
        light.shape.destroy();
      }
    }
    this.chunks.delete(index);
  }

  private createProp(definition: PropDefinition): PropInstance {
    const visualScale = definition.scale ?? 1;
    const baseDepth = depthForFootY(definition.y, definition.depthOffset ?? 0);
    const image = this.scene.add
      .image(definition.x, definition.y, definition.texture)
      .setOrigin(0.5, 1)
      .setScale(visualScale)
      .setFlipX(definition.flipX ?? false)
      .setDepth(baseDepth);

    const shadowScaleByKind: Partial<Record<PropKind, [number, number]>> = {
      house: [248, 27],
      tree: [112, 24],
      hedge: [150, 18],
      shrub: [84, 17],
      pole: [34, 10],
      lamp: [35, 10],
      bench: [132, 18],
      vending: [68, 17],
      fence: [214, 15],
      playground: [190, 24],
      sign: [74, 13],
      flowerbed: [155, 18],
      mirror: [31, 10],
      mailbox: [43, 11],
      bicycle: [120, 14],
      gate: [236, 17],
      sandbox: [190, 18],
      trash: [45, 12],
    };
    const [fallbackWidth, fallbackHeight] = shadowScaleByKind[definition.kind] ?? [80, 16];
    const shadowWidth = (definition.shadow?.width ?? fallbackWidth) * visualScale;
    const shadowHeight = (definition.shadow?.height ?? fallbackHeight) * visualScale;
    const shadow = this.scene.add
      .ellipse(
        definition.x + (definition.shadow?.xOffset ?? 5) * visualScale,
        definition.y + (definition.shadow?.yOffset ?? 3) * visualScale,
        shadowWidth,
        shadowHeight,
        0x1c3440,
        definition.shadow?.alpha ?? 0.2,
      )
      .setDepth(depthForFootY(definition.y, -2));

    const needsGlow = definition.kind === 'lamp' || definition.kind === 'vending';
    const glow = needsGlow
      ? this.scene.add
          .ellipse(
            definition.x,
            definition.y - (definition.kind === 'lamp' ? 155 : 82) * visualScale,
            (definition.kind === 'lamp' ? 175 : 126) * visualScale,
            (definition.kind === 'lamp' ? 240 : 155) * visualScale,
            0xffe3a3,
            0,
          )
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(depthForFootY(definition.y, -3))
      : null;

    const lights: PropLightInstance[] = (definition.lights ?? []).map((light) => {
      const xOffset = definition.flipX ? -light.xOffset : light.xOffset;
      const shape = this.scene.add
        .rectangle(
          definition.x + xOffset * visualScale,
          definition.y + light.yOffset * visualScale,
          light.width * visualScale,
          light.height * visualScale,
          light.color ?? 0xffd789,
          0,
        )
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(baseDepth + 1)
        .setVisible(false);
      return {
        kind: light.kind,
        alphaScale: light.alphaScale ?? 1,
        shape,
      };
    });

    return { definition, image, shadow, glow, lights };
  }

  private drawGroundOverlay(chunk: ChunkInstance, atmosphere: Atmosphere): void {
    const graphics = chunk.groundOverlay;
    const x = chunk.definition.x;
    const width = chunk.definition.width;
    graphics.clear();

    if (atmosphere.phase === 'morning') {
      graphics.fillStyle(0xffe2a4, 0.035 + atmosphere.warmthAlpha * 0.05);
      graphics.fillRect(x, 0, width, 720);
    }

    if (atmosphere.phase === 'evening') {
      graphics.fillStyle(0xff8b52, 0.055 + atmosphere.warmthAlpha * 0.15);
      graphics.fillRect(x, 0, width, 720);
      graphics.fillStyle(0x5d3851, 0.035);
      graphics.fillRect(x, 500, width, 220);
    }

    if (atmosphere.phase === 'night') {
      graphics.fillStyle(0x07172d, 0.18 + atmosphere.starAlpha * 0.14);
      graphics.fillRect(x, 0, width, 720);
      graphics.fillStyle(0x14223f, 0.12);
      graphics.fillRect(x, 430, width, 290);
    }
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
