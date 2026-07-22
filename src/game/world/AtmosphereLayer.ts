import Phaser from 'phaser';
import { mixColor, type Atmosphere } from '../systems/timeOfDay';
import { VIEW_HEIGHT, VIEW_WIDTH } from './worldConfig';

const STAR_POSITIONS = [
  [62, 64], [142, 114], [238, 72], [337, 128], [432, 57], [529, 102],
  [629, 66], [735, 119], [832, 54], [936, 101], [1046, 71], [1160, 126], [1230, 49],
] as const;

export class AtmosphereLayer {
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private cloudOffset = 0;
  private displayedMinutes = 360;

  constructor(scene: Phaser.Scene) {
    this.sky = scene.add.graphics().setScrollFactor(0).setDepth(-10_000);
    this.overlay = scene.add.graphics().setScrollFactor(0).setDepth(900_000);
  }

  update(atmosphere: Atmosphere, minutes: number, delta: number): void {
    this.displayedMinutes = minutes;
    this.cloudOffset = (this.cloudOffset + delta * 0.0065) % (VIEW_WIDTH + 320);
    this.draw(atmosphere);
  }

  destroy(): void {
    this.sky.destroy();
    this.overlay.destroy();
  }

  private draw(atmosphere: Atmosphere): void {
    const graphics = this.sky;
    graphics.clear();

    const bands = 34;
    const skyHeight = 330;
    for (let index = 0; index < bands; index += 1) {
      const progress = index / Math.max(1, bands - 1);
      graphics.fillStyle(mixColor(atmosphere.skyTop, atmosphere.skyBottom, progress), 1);
      graphics.fillRect(0, index * (skyHeight / bands), VIEW_WIDTH, skyHeight / bands + 1);
    }

    graphics.fillStyle(atmosphere.horizon, 0.44);
    graphics.fillRect(0, 270, VIEW_WIDTH, 82);

    if (atmosphere.starAlpha > 0.01) {
      for (let index = 0; index < STAR_POSITIONS.length; index += 1) {
        const position = STAR_POSITIONS[index];
        if (!position) continue;
        const [x, y] = position;
        graphics.fillStyle(0xfff5cf, atmosphere.starAlpha * (index % 2 === 0 ? 0.92 : 0.63));
        graphics.fillCircle(x, y, index % 3 === 0 ? 2.2 : 1.4);
      }
    }

    const bodyX = VIEW_WIDTH * atmosphere.sunX;
    const bodyY = VIEW_HEIGHT * atmosphere.sunY;
    const isNight = this.displayedMinutes >= 18 * 60;
    graphics.fillStyle(atmosphere.sunColor, atmosphere.sunAlpha * 0.13);
    graphics.fillCircle(bodyX, bodyY, isNight ? 52 : 70);
    graphics.fillStyle(atmosphere.sunColor, atmosphere.sunAlpha);
    graphics.fillCircle(bodyX, bodyY, isNight ? 22 : 30);
    if (isNight) {
      graphics.fillStyle(atmosphere.skyTop, 0.84);
      graphics.fillCircle(bodyX + 10, bodyY - 6, 21);
    }

    const cloudAlpha = Math.max(0.12, 0.72 - atmosphere.starAlpha * 0.58);
    const cloudColor = mixColor(0xffffff, atmosphere.horizon, 0.22);
    const cloudXs = [110, 510, 900, 1280];
    for (let index = 0; index < cloudXs.length; index += 1) {
      const baseX = cloudXs[index] ?? 0;
      const x = ((baseX + this.cloudOffset * (0.18 + index * 0.028)) % (VIEW_WIDTH + 300)) - 150;
      const y = 95 + (index % 2) * 53;
      graphics.fillStyle(cloudColor, cloudAlpha * (index % 2 === 0 ? 0.8 : 0.56));
      graphics.fillCircle(x, y, 23);
      graphics.fillCircle(x + 29, y - 9, 30);
      graphics.fillCircle(x + 60, y + 1, 22);
      graphics.fillRoundedRect(x - 8, y + 4, 94, 24, 13);
    }

    const distant = mixColor(atmosphere.distantGround, atmosphere.shadow, 0.22);
    graphics.fillStyle(distant, 0.94);
    graphics.fillTriangle(0, 330, 220, 210, 480, 330);
    graphics.fillTriangle(330, 330, 620, 238, 910, 330);
    graphics.fillTriangle(765, 330, 1050, 205, 1280, 330);
    graphics.fillStyle(atmosphere.distantGround, 0.98);
    graphics.fillRoundedRect(-20, 302, VIEW_WIDTH + 40, 72, 24);

    this.overlay.clear();
    if (atmosphere.warmthAlpha > 0.001) {
      this.overlay.fillStyle(0xff9d52, atmosphere.warmthAlpha * 0.15);
      this.overlay.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }
    if (atmosphere.starAlpha > 0.05) {
      this.overlay.fillStyle(0x071325, atmosphere.starAlpha * 0.08);
      this.overlay.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }
  }
}
