import Phaser from 'phaser';
import {
  clearAreaTraversalRequest,
  clearVirtualInput,
  consumeAreaTraversalRequest,
  readVirtualInput,
  type InputSource,
  type TraversalDirection,
} from '../gameBridge';

export interface SideScrollInput {
  horizontal: number;
  source: InputSource;
  traversal: TraversalDirection | null;
}

export class SideScrollInputSystem {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | null;
  private readonly keys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key> | null;
  private suspended = false;
  private hardStopPending = false;

  private readonly stopInput = (): void => {
    this.suspended = true;
    this.hardStopPending = true;
    clearVirtualInput();
    clearAreaTraversalRequest();
  };

  private readonly resumeInput = (): void => {
    clearAreaTraversalRequest();
    this.suspended = false;
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.stopInput();
    else this.resumeInput();
  };

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

    window.addEventListener('blur', this.stopInput);
    window.addEventListener('focus', this.resumeInput);
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    document.addEventListener('visibilitychange', this.handleVisibility);
    document.addEventListener('freeze', this.stopInput);
    document.addEventListener('resume', this.resumeInput);
    window.addEventListener('pagehide', this.stopInput);
    window.addEventListener('pageshow', this.resumeInput);
  }

  read(allowedTraversal: TraversalDirection | null = null): SideScrollInput {
    if (this.suspended) {
      return { horizontal: 0, source: 'none', traversal: null };
    }

    const virtual = readVirtualInput();
    let horizontal = 0;
    let source: InputSource = 'none';
    if (virtual.active && Math.abs(virtual.x) > 0.06) {
      horizontal = Phaser.Math.Clamp(virtual.x, -1, 1);
      source = 'touch';
    } else {
      const left = Boolean(this.cursors?.left.isDown || this.keys?.left.isDown);
      const right = Boolean(this.cursors?.right.isDown || this.keys?.right.isDown);
      horizontal = Number(right) - Number(left);
      if (horizontal !== 0) source = 'keyboard';
    }

    const requestedTraversal = consumeAreaTraversalRequest();
    let traversal = requestedTraversal === allowedTraversal ? requestedTraversal : null;
    if (traversal) {
      source = 'touch';
    } else if (
      allowedTraversal === 'up'
      && (
        (this.cursors?.up && Phaser.Input.Keyboard.JustDown(this.cursors.up))
        || (this.keys?.up && Phaser.Input.Keyboard.JustDown(this.keys.up))
      )
    ) {
      traversal = 'up';
      source = 'keyboard';
    } else if (
      allowedTraversal === 'down'
      && (
        (this.cursors?.down && Phaser.Input.Keyboard.JustDown(this.cursors.down))
        || (this.keys?.down && Phaser.Input.Keyboard.JustDown(this.keys.down))
      )
    ) {
      traversal = 'down';
      source = 'keyboard';
    }

    return { horizontal, source, traversal };
  }

  consumeHardStop(): boolean {
    const pending = this.hardStopPending;
    this.hardStopPending = false;
    return pending;
  }

  destroy(): void {
    window.removeEventListener('blur', this.stopInput);
    window.removeEventListener('focus', this.resumeInput);
    window.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    document.removeEventListener('freeze', this.stopInput);
    document.removeEventListener('resume', this.resumeInput);
    window.removeEventListener('pagehide', this.stopInput);
    window.removeEventListener('pageshow', this.resumeInput);
    clearVirtualInput();
    clearAreaTraversalRequest();
  }
}
