import Phaser from 'phaser';
import type { AreaId } from '../gameBridge';
import { mixColor, type Atmosphere } from '../systems/timeOfDay';
import { VIEW_HEIGHT, VIEW_WIDTH } from './worldConfig';

const STAR_POSITIONS = [
  [62, 48], [142, 91], [238, 55], [337, 104], [432, 44], [529, 82],
  [629, 49], [735, 96], [832, 40], [936, 78], [1046, 52], [1160, 100], [1230, 36],
] as const;

const PARTICLES = Array.from({ length: 26 }, (_, index) => ({
  x: (index * 173 + 47) % VIEW_WIDTH,
  y: 125 + ((index * 97 + 31) % 500),
  speed: 0.015 + (index % 5) * 0.006,
  phase: index * 0.73,
  radius: 1.1 + (index % 4) * 0.55,
}));

export class AtmosphereLayer {
  private readonly backHaze: Phaser.GameObjects.Graphics;
  private readonly shadeOverlay: Phaser.GameObjects.Graphics;
  private readonly colorOverlay: Phaser.GameObjects.Graphics;
  private readonly lightOverlay: Phaser.GameObjects.Graphics;
  private readonly particles: Phaser.GameObjects.Graphics;
  private cloudOffset = 0;
  private particleTime = 0;
  private displayedMinutes = 360;
  private area: AreaId = 'residential';

  constructor(scene: Phaser.Scene) {
    this.backHaze = scene.add.graphics().setScrollFactor(0).setDepth(-10_000);
    this.shadeOverlay = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(890_000)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.colorOverlay = scene.add.graphics().setScrollFactor(0).setDepth(895_000);
    this.lightOverlay = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(900_000)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.particles = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(905_000)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  setArea(area: AreaId): void {
    this.area = area;
  }

  update(atmosphere: Atmosphere, minutes: number, delta: number): void {
    this.displayedMinutes = minutes;
    this.cloudOffset = (this.cloudOffset + delta * 0.018) % (VIEW_WIDTH + 520);
    this.particleTime += delta;
    this.draw(atmosphere);
  }

  destroy(): void {
    this.backHaze.destroy();
    this.shadeOverlay.destroy();
    this.colorOverlay.destroy();
    this.lightOverlay.destroy();
    this.particles.destroy();
  }

  private draw(atmosphere: Atmosphere): void {
    this.drawBackHaze(atmosphere);
    this.drawCloudShadows(atmosphere);
    this.drawColorGrade(atmosphere);
    this.drawSunlight(atmosphere);
    this.drawParticles(atmosphere);
  }

  private drawBackHaze(atmosphere: Atmosphere): void {
    const graphics = this.backHaze;
    graphics.clear();
    const bands = 14;
    const height = 155;
    for (let index = 0; index < bands; index += 1) {
      const progress = index / Math.max(1, bands - 1);
      graphics.fillStyle(mixColor(atmosphere.skyTop, atmosphere.skyBottom, progress), 1);
      graphics.fillRect(0, index * (height / bands), VIEW_WIDTH, height / bands + 1);
    }

    if (atmosphere.starAlpha > 0.02) {
      for (let index = 0; index < STAR_POSITIONS.length; index += 1) {
        const position = STAR_POSITIONS[index];
        if (!position) continue;
        graphics.fillStyle(0xfff5cf, atmosphere.starAlpha * (index % 2 === 0 ? 0.8 : 0.48));
        graphics.fillCircle(position[0], position[1], index % 3 === 0 ? 2 : 1.2);
      }
    }

    graphics.fillStyle(atmosphere.horizon, 0.3);
    graphics.fillRect(0, 115, VIEW_WIDTH, 70);
  }

  private drawCloudShadows(atmosphere: Atmosphere): void {
    const graphics = this.shadeOverlay;
    graphics.clear();
    if (atmosphere.phase === 'night') return;

    const alpha = atmosphere.phase === 'evening' ? 0.035 : 0.055;
    const positions = [120, 680, 1190];
    for (let index = 0; index < positions.length; index += 1) {
      const x = ((positions[index]! + this.cloudOffset * (0.65 + index * 0.1)) % (VIEW_WIDTH + 480)) - 240;
      const y = 250 + index * 135;
      graphics.fillStyle(0x6d7c75, alpha);
      graphics.fillEllipse(x, y, 330, 95);
      graphics.fillEllipse(x + 120, y + 24, 300, 78);
      graphics.fillEllipse(x - 105, y + 15, 220, 64);
    }
  }

  private drawColorGrade(atmosphere: Atmosphere): void {
    const graphics = this.colorOverlay;
    graphics.clear();

    if (atmosphere.phase === 'morning') {
      graphics.fillStyle(0xffc66e, 0.025 + atmosphere.warmthAlpha * 0.06);
      graphics.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }

    if (atmosphere.phase === 'evening') {
      graphics.fillStyle(0xff8752, 0.06 + atmosphere.warmthAlpha * 0.14);
      graphics.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      graphics.fillStyle(0x553f62, 0.035);
      graphics.fillRect(0, 420, VIEW_WIDTH, 300);
    }

    if (atmosphere.phase === 'night') {
      graphics.fillStyle(0x07152c, 0.16 + atmosphere.starAlpha * 0.1);
      graphics.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      graphics.fillStyle(0x172846, 0.08);
      graphics.fillRect(0, 390, VIEW_WIDTH, 330);
    }

    const vignetteAlpha = atmosphere.phase === 'night' ? 0.14 : 0.055;
    graphics.fillStyle(0x07131d, vignetteAlpha);
    graphics.fillRect(0, 0, VIEW_WIDTH, 22);
    graphics.fillRect(0, VIEW_HEIGHT - 28, VIEW_WIDTH, 28);
    graphics.fillRect(0, 0, 18, VIEW_HEIGHT);
    graphics.fillRect(VIEW_WIDTH - 18, 0, 18, VIEW_HEIGHT);
  }

  private drawSunlight(atmosphere: Atmosphere): void {
    const graphics = this.lightOverlay;
    graphics.clear();
    const sunX = VIEW_WIDTH * atmosphere.sunX;
    const sunY = VIEW_HEIGHT * atmosphere.sunY;
    const lightAlpha = atmosphere.phase === 'night' ? 0.015 : 0.035 + atmosphere.sunAlpha * 0.025;

    for (let ring = 4; ring >= 1; ring -= 1) {
      graphics.fillStyle(atmosphere.sunColor, lightAlpha / ring);
      graphics.fillCircle(sunX, sunY, 80 + ring * 70);
    }

    if (atmosphere.phase === 'morning' || atmosphere.phase === 'evening') {
      graphics.fillStyle(atmosphere.sunColor, 0.025 + atmosphere.warmthAlpha * 0.05);
      graphics.fillTriangle(-80, 0, 340, 0, 910, VIEW_HEIGHT);
      graphics.fillTriangle(240, 0, 480, 0, 1090, VIEW_HEIGHT);
    }
  }

  private drawParticles(atmosphere: Atmosphere): void {
    const graphics = this.particles;
    graphics.clear();
    const seconds = this.particleTime / 1000;
    const nightPark = atmosphere.phase === 'night' && this.area === 'park';
    const visible = nightPark || atmosphere.phase !== 'night';
    if (!visible) return;

    for (let index = 0; index < PARTICLES.length; index += 1) {
      const particle = PARTICLES[index];
      if (!particle) continue;
      const x = (particle.x + seconds * 9 * particle.speed * 60) % VIEW_WIDTH;
      const y = particle.y + Math.sin(seconds * (0.7 + particle.speed * 10) + particle.phase) * 12;
      const pulse = 0.45 + Math.sin(seconds * 1.6 + particle.phase) * 0.25;
      if (nightPark) {
        graphics.fillStyle(index % 3 === 0 ? 0xd9ff91 : 0xffe27a, 0.16 + pulse * 0.34);
        graphics.fillCircle(x, y, particle.radius + 1.2);
        graphics.fillStyle(0xfff8c4, 0.48 + pulse * 0.3);
        graphics.fillCircle(x, y, Math.max(1, particle.radius * 0.48));
      } else {
        graphics.fillStyle(0xfff2c0, 0.035 + pulse * 0.08);
        graphics.fillCircle(x, y, particle.radius);
      }
    }
  }
}
