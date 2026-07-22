import Phaser from 'phaser';
import { TIME_PREVIEW_EVENT } from '../gameBridge';
import {
  GAME_DAY_START,
  FESTIVAL_DAY_END,
  getAtmosphere,
  mixColor,
  type Atmosphere,
} from '../systems/timeOfDay';

const WIDTH = 1280;
const HEIGHT = 720;
const STAR_POSITIONS = [
  [74, 78],
  [164, 124],
  [246, 62],
  [334, 106],
  [441, 54],
  [523, 130],
  [620, 70],
  [711, 112],
  [807, 58],
  [908, 104],
  [1014, 70],
  [1122, 126],
  [1204, 62],
] as const;

export class FoundationScene extends Phaser.Scene {
  private scenery!: Phaser.GameObjects.Graphics;
  private targetMinutes = GAME_DAY_START;
  private displayedMinutes = GAME_DAY_START;
  private cloudOffset = 0;
  private redrawAccumulator = 0;

  private readonly handleTimePreview = (event: Event): void => {
    const nextMinutes = (event as CustomEvent<number>).detail;
    if (nextMinutes < this.displayedMinutes - 400) {
      this.displayedMinutes = nextMinutes;
    }
    this.targetMinutes = nextMinutes;
  };

  constructor() {
    super('FoundationScene');
  }

  create(): void {
    this.scenery = this.add.graphics();
    this.renderTown(getAtmosphere(this.displayedMinutes));

    window.addEventListener(TIME_PREVIEW_EVENT, this.handleTimePreview);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener(TIME_PREVIEW_EVENT, this.handleTimePreview);
    });
  }

  update(_time: number, delta: number): void {
    const smoothing = Math.min(1, delta / 380);
    this.displayedMinutes += (this.targetMinutes - this.displayedMinutes) * smoothing;
    this.cloudOffset = (this.cloudOffset + delta * 0.009) % (WIDTH + 300);
    this.redrawAccumulator += delta;

    if (this.redrawAccumulator >= 33) {
      this.redrawAccumulator = 0;
      this.renderTown(getAtmosphere(this.displayedMinutes));
    }
  }

  private renderTown(atmosphere: Atmosphere): void {
    const graphics = this.scenery;
    graphics.clear();

    this.drawSky(graphics, atmosphere);
    this.drawCelestialBody(graphics, atmosphere);
    this.drawClouds(graphics, atmosphere);
    this.drawDistantLandscape(graphics, atmosphere);
    this.drawTown(graphics, atmosphere);
    this.drawRoad(graphics, atmosphere);
    this.drawStreetDetails(graphics, atmosphere);
    this.drawForeground(graphics, atmosphere);
    this.drawWarmthOverlay(graphics, atmosphere);
  }

  private drawSky(graphics: Phaser.GameObjects.Graphics, atmosphere: Atmosphere): void {
    const bands = 42;
    const bandHeight = 390 / bands;

    for (let index = 0; index < bands; index += 1) {
      const progress = index / Math.max(1, bands - 1);
      graphics.fillStyle(mixColor(atmosphere.skyTop, atmosphere.skyBottom, progress), 1);
      graphics.fillRect(0, index * bandHeight, WIDTH, bandHeight + 1);
    }

    graphics.fillStyle(atmosphere.horizon, 0.45);
    graphics.fillRect(0, 330, WIDTH, 80);

    if (atmosphere.starAlpha > 0.01) {
      for (let index = 0; index < STAR_POSITIONS.length; index += 1) {
        const position = STAR_POSITIONS[index];
        if (!position) {
          continue;
        }
        const [x, y] = position;
        const radius = index % 3 === 0 ? 2.2 : 1.35;
        graphics.fillStyle(0xfff7d8, atmosphere.starAlpha * (index % 2 === 0 ? 0.9 : 0.62));
        graphics.fillCircle(x, y, radius);
      }
    }
  }

  private drawCelestialBody(
    graphics: Phaser.GameObjects.Graphics,
    atmosphere: Atmosphere,
  ): void {
    const x = WIDTH * atmosphere.sunX;
    const y = HEIGHT * atmosphere.sunY;
    const isNight = this.displayedMinutes >= 18 * 60;

    graphics.fillStyle(atmosphere.sunColor, atmosphere.sunAlpha * 0.12);
    graphics.fillCircle(x, y, isNight ? 55 : 72);
    graphics.fillStyle(atmosphere.sunColor, atmosphere.sunAlpha);
    graphics.fillCircle(x, y, isNight ? 23 : 31);

    if (isNight) {
      graphics.fillStyle(atmosphere.skyTop, 0.84);
      graphics.fillCircle(x + 10, y - 7, 22);
    }
  }

  private drawClouds(graphics: Phaser.GameObjects.Graphics, atmosphere: Atmosphere): void {
    const cloudAlpha = Math.max(0.12, 0.72 - atmosphere.starAlpha * 0.55);
    const cloudColor = mixColor(0xffffff, atmosphere.horizon, 0.22);
    const cloudXs = [120, 520, 920, 1310];

    for (let index = 0; index < cloudXs.length; index += 1) {
      const baseX = cloudXs[index] ?? 0;
      const x = ((baseX + this.cloudOffset * (0.16 + index * 0.025)) % (WIDTH + 300)) - 150;
      const y = 104 + (index % 2) * 58;
      graphics.fillStyle(cloudColor, cloudAlpha * (index % 2 === 0 ? 0.84 : 0.58));
      graphics.fillCircle(x, y, 24);
      graphics.fillCircle(x + 28, y - 9, 31);
      graphics.fillCircle(x + 61, y + 1, 23);
      graphics.fillRoundedRect(x - 8, y + 4, 94, 25, 13);
    }
  }

  private drawDistantLandscape(
    graphics: Phaser.GameObjects.Graphics,
    atmosphere: Atmosphere,
  ): void {
    graphics.fillStyle(mixColor(atmosphere.distantGround, atmosphere.shadow, 0.25), 0.95);
    graphics.fillTriangle(0, 355, 286, 168, 555, 355);
    graphics.fillTriangle(290, 355, 605, 205, 895, 355);
    graphics.fillTriangle(735, 355, 1068, 185, 1280, 355);

    graphics.fillStyle(atmosphere.distantGround, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(0, 345),
        new Phaser.Math.Vector2(170, 322),
        new Phaser.Math.Vector2(355, 350),
        new Phaser.Math.Vector2(548, 314),
        new Phaser.Math.Vector2(730, 346),
        new Phaser.Math.Vector2(930, 311),
        new Phaser.Math.Vector2(1120, 339),
        new Phaser.Math.Vector2(1280, 315),
        new Phaser.Math.Vector2(1280, 430),
        new Phaser.Math.Vector2(0, 430),
      ],
      true,
    );

    for (let x = 35; x < WIDTH; x += 72) {
      const treeHeight = 38 + ((x * 13) % 31);
      graphics.fillStyle(mixColor(atmosphere.distantGround, 0x1f4d38, 0.28), 0.95);
      graphics.fillCircle(x, 352 - treeHeight * 0.35, treeHeight * 0.48);
      graphics.fillCircle(x + 17, 357 - treeHeight * 0.4, treeHeight * 0.4);
    }
  }

  private drawTown(graphics: Phaser.GameObjects.Graphics, atmosphere: Atmosphere): void {
    this.drawHouse(graphics, 90, 338, 154, 115, 0xc96858, atmosphere, true);
    this.drawHouse(graphics, 282, 354, 132, 101, 0x4a78a8, atmosphere, false);
    this.drawGameShop(graphics, 470, 339, atmosphere);
    this.drawHouse(graphics, 760, 353, 141, 105, 0x7c6eab, atmosphere, true);
    this.drawHouse(graphics, 1008, 344, 166, 114, 0xb77b4e, atmosphere, false);

    graphics.fillStyle(mixColor(atmosphere.ground, 0x8aa078, 0.26), 1);
    graphics.fillRect(0, 432, WIDTH, 142);
  }

  private drawHouse(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    roofColor: number,
    atmosphere: Atmosphere,
    litWindow: boolean,
  ): void {
    const wallColor = mixColor(atmosphere.buildingTint, atmosphere.shadow, 0.08);
    const edgeColor = mixColor(atmosphere.shadow, 0x000000, 0.1);

    graphics.fillStyle(edgeColor, 0.28);
    graphics.fillRect(x + 9, y + 14, width, height);
    graphics.fillStyle(wallColor, 1);
    graphics.fillRoundedRect(x, y, width, height, 5);
    graphics.fillStyle(mixColor(roofColor, atmosphere.shadow, atmosphere.starAlpha * 0.4), 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(x - 13, y + 4),
        new Phaser.Math.Vector2(x + width * 0.48, y - 51),
        new Phaser.Math.Vector2(x + width + 15, y + 5),
      ],
      true,
    );

    graphics.fillStyle(0x314a55, 0.85);
    graphics.fillRect(x + 18, y + 48, 34, 57);

    const windowColor = 0xffd47d;
    graphics.fillStyle(windowColor, litWindow ? atmosphere.windowLightAlpha : atmosphere.windowLightAlpha * 0.56);
    graphics.fillRoundedRect(x + width - 58, y + 34, 37, 31, 3);
    graphics.lineStyle(3, edgeColor, 0.48);
    graphics.lineBetween(x + width - 39, y + 34, x + width - 39, y + 65);
    graphics.lineBetween(x + width - 58, y + 49, x + width - 21, y + 49);
  }

  private drawGameShop(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    atmosphere: Atmosphere,
  ): void {
    const width = 225;
    const height = 122;
    const wallColor = mixColor(0xf4e5c5, atmosphere.buildingTint, 0.45);

    graphics.fillStyle(atmosphere.shadow, 0.25);
    graphics.fillRoundedRect(x + 10, y + 14, width, height, 5);
    graphics.fillStyle(wallColor, 1);
    graphics.fillRoundedRect(x, y, width, height, 5);
    graphics.fillStyle(mixColor(0x2f6f91, atmosphere.shadow, atmosphere.starAlpha * 0.35), 1);
    graphics.fillRect(x - 8, y - 19, width + 16, 35);

    graphics.fillStyle(0xe5f2f5, 0.68);
    graphics.fillRect(x + 22, y + 32, 111, 74);
    graphics.fillStyle(0xffd47d, atmosphere.windowLightAlpha * 0.72);
    graphics.fillRect(x + 27, y + 37, 101, 64);

    graphics.fillStyle(0x263c4a, 0.92);
    graphics.fillRect(x + 158, y + 33, 45, 89);
    graphics.fillStyle(0xc6e4e9, 0.55);
    graphics.fillRect(x + 166, y + 43, 29, 36);

    graphics.fillStyle(0xffefb0, 0.92);
    graphics.fillRoundedRect(x + 62, y - 11, 98, 17, 5);
    graphics.fillStyle(0x16324a, 0.9);
    for (let index = 0; index < 4; index += 1) {
      graphics.fillRect(x + 75 + index * 20, y - 6, 12, 7);
    }
  }

  private drawRoad(graphics: Phaser.GameObjects.Graphics, atmosphere: Atmosphere): void {
    graphics.fillStyle(mixColor(0x8f9a99, atmosphere.shadow, 0.18), 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(0, 540),
        new Phaser.Math.Vector2(WIDTH, 517),
        new Phaser.Math.Vector2(WIDTH, HEIGHT),
        new Phaser.Math.Vector2(0, HEIGHT),
      ],
      true,
    );

    graphics.fillStyle(mixColor(0xd9d0b8, atmosphere.shadow, 0.1), 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(0, 505),
        new Phaser.Math.Vector2(WIDTH, 487),
        new Phaser.Math.Vector2(WIDTH, 535),
        new Phaser.Math.Vector2(0, 557),
      ],
      true,
    );

    graphics.lineStyle(6, 0xf7e9aa, 0.5);
    for (let x = 40; x < WIDTH; x += 128) {
      graphics.lineBetween(x, 640, x + 66, 635);
    }
  }

  private drawStreetDetails(
    graphics: Phaser.GameObjects.Graphics,
    atmosphere: Atmosphere,
  ): void {
    this.drawTree(graphics, 47, 418, 1.12, atmosphere);
    this.drawTree(graphics, 720, 424, 0.88, atmosphere);
    this.drawTree(graphics, 1198, 411, 1.04, atmosphere);
    this.drawVendingMachine(graphics, 915, 422, atmosphere);
    this.drawBusStop(graphics, 1078, 437, atmosphere);
    this.drawStreetLamp(graphics, 824, 431, atmosphere);
    this.drawStreetLamp(graphics, 1133, 430, atmosphere);
  }

  private drawTree(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    atmosphere: Atmosphere,
  ): void {
    graphics.fillStyle(mixColor(0x72513a, atmosphere.shadow, 0.28), 1);
    graphics.fillRoundedRect(x - 7 * scale, y - 11 * scale, 14 * scale, 90 * scale, 5);

    const leafColor = mixColor(0x397a50, atmosphere.ground, 0.28);
    const darkLeafColor = mixColor(leafColor, atmosphere.shadow, 0.26);
    graphics.fillStyle(darkLeafColor, 0.96);
    graphics.fillCircle(x - 23 * scale, y - 27 * scale, 37 * scale);
    graphics.fillCircle(x + 24 * scale, y - 35 * scale, 42 * scale);
    graphics.fillCircle(x + 3 * scale, y - 65 * scale, 48 * scale);
    graphics.fillStyle(leafColor, 0.88);
    graphics.fillCircle(x - 6 * scale, y - 48 * scale, 37 * scale);
    graphics.fillCircle(x + 37 * scale, y - 55 * scale, 25 * scale);
  }

  private drawVendingMachine(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    atmosphere: Atmosphere,
  ): void {
    const machineColor = mixColor(0xe24e3f, atmosphere.shadow, atmosphere.starAlpha * 0.32);
    graphics.fillStyle(atmosphere.shadow, 0.32);
    graphics.fillRoundedRect(x + 7, y + 10, 72, 128, 7);
    graphics.fillStyle(machineColor, 1);
    graphics.fillRoundedRect(x, y, 72, 128, 7);
    graphics.fillStyle(0xe8f7fa, 0.86);
    graphics.fillRoundedRect(x + 9, y + 10, 54, 50, 4);

    const drinkColors = [0xf3d46a, 0x6fc4d5, 0xf1826e, 0x89be77, 0xe7e1d6, 0x8d7ab8];
    for (let index = 0; index < drinkColors.length; index += 1) {
      const color = drinkColors[index] ?? 0xffffff;
      graphics.fillStyle(color, 0.95);
      graphics.fillRoundedRect(x + 13 + (index % 3) * 17, y + 18 + Math.floor(index / 3) * 22, 10, 17, 3);
    }

    graphics.fillStyle(0x203541, 0.9);
    graphics.fillRoundedRect(x + 11, y + 74, 49, 13, 4);
    graphics.fillRoundedRect(x + 19, y + 101, 34, 10, 4);

    if (atmosphere.lampAlpha > 0.03) {
      graphics.fillStyle(0xffe7a8, atmosphere.lampAlpha * 0.12);
      graphics.fillCircle(x + 36, y + 48, 66);
    }
  }

  private drawBusStop(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    atmosphere: Atmosphere,
  ): void {
    graphics.fillStyle(mixColor(0x4d5961, atmosphere.shadow, 0.25), 1);
    graphics.fillRoundedRect(x, y, 8, 116, 4);
    graphics.fillStyle(mixColor(0x4f8aa4, atmosphere.shadow, atmosphere.starAlpha * 0.25), 1);
    graphics.fillCircle(x + 4, y - 2, 22);
    graphics.fillStyle(0xf1f4e6, 0.88);
    graphics.fillCircle(x + 4, y - 2, 13);
    graphics.fillStyle(0x2e5265, 0.9);
    graphics.fillRect(x - 10, y + 34, 28, 39);
  }

  private drawStreetLamp(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    atmosphere: Atmosphere,
  ): void {
    graphics.fillStyle(mixColor(0x36454e, atmosphere.shadow, 0.3), 1);
    graphics.fillRoundedRect(x, y, 7, 116, 4);
    graphics.fillRoundedRect(x, y - 2, 33, 7, 4);
    graphics.fillStyle(0xffe4a2, 0.38 + atmosphere.lampAlpha * 0.62);
    graphics.fillRoundedRect(x + 24, y + 2, 19, 13, 4);

    if (atmosphere.lampAlpha > 0.02) {
      graphics.fillStyle(0xffd97f, atmosphere.lampAlpha * 0.13);
      graphics.fillCircle(x + 34, y + 10, 52);
    }
  }

  private drawForeground(
    graphics: Phaser.GameObjects.Graphics,
    atmosphere: Atmosphere,
  ): void {
    const grassColor = mixColor(0x244d35, atmosphere.ground, 0.22);
    graphics.fillStyle(grassColor, 0.92);
    for (let x = 0; x < WIDTH; x += 19) {
      const height = 13 + ((x * 7) % 19);
      graphics.fillTriangle(x, HEIGHT, x + 8, HEIGHT - height, x + 16, HEIGHT);
    }

    graphics.fillStyle(atmosphere.shadow, 0.12);
    graphics.fillRect(0, HEIGHT - 16, WIDTH, 16);
  }

  private drawWarmthOverlay(
    graphics: Phaser.GameObjects.Graphics,
    atmosphere: Atmosphere,
  ): void {
    if (atmosphere.warmthAlpha > 0.001) {
      graphics.fillStyle(0xffa65c, atmosphere.warmthAlpha * 0.18);
      graphics.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const nightProgress = Math.max(
      0,
      Math.min(1, (this.displayedMinutes - 18 * 60) / Math.max(1, FESTIVAL_DAY_END - 18 * 60)),
    );
    if (nightProgress > 0) {
      graphics.fillStyle(0x081629, nightProgress * 0.12);
      graphics.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }
}
