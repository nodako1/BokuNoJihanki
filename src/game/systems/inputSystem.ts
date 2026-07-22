import Phaser from 'phaser';
import {
  clearVirtualInput,
  readVirtualInput,
  type InputSource,
} from '../gameBridge';
import { normalizeInput } from './worldMath.mjs';

export interface MovementInput {
  x: number;
  y: number;
  magnitude: number;
  source: InputSource;
}

export class InputSystem {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | null;
  private readonly keys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key> | null;
  private readonly handleBlur = (): void => clearVirtualInput();
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      event.preventDefault();
    }
  };

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    this.cursors = keyboard?.createCursorKeys() ?? null;
    this.keys = keyboard
      ? {
          up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
          down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
          left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
          right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        }
      : null;

    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    document.addEventListener('visibilitychange', this.handleBlur);
  }

  read(): MovementInput {
    const touch = readVirtualInput();
    if (touch.active && Math.hypot(touch.x, touch.y) > 0.04) {
      const normalized = normalizeInput(touch.x, touch.y);
      return { ...normalized, source: 'touch' };
    }

    const left = Boolean(this.cursors?.left.isDown || this.keys?.left.isDown);
    const right = Boolean(this.cursors?.right.isDown || this.keys?.right.isDown);
    const up = Boolean(this.cursors?.up.isDown || this.keys?.up.isDown);
    const down = Boolean(this.cursors?.down.isDown || this.keys?.down.isDown);
    const x = Number(right) - Number(left);
    const y = Number(down) - Number(up);
    const normalized = normalizeInput(x, y);

    return {
      ...normalized,
      source: normalized.magnitude > 0 ? 'keyboard' : 'none',
    };
  }

  destroy(): void {
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('visibilitychange', this.handleBlur);
    clearVirtualInput();
  }
}
