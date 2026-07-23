import Phaser from 'phaser';
import {
  nextAreaTransitionState,
  type AreaTransitionStateValue,
} from './areaTransitionState.mjs';

export interface AreaTransitionRequest {
  targetScene: string;
  spawnPoint?: string;
  label?: string;
}

export class AreaTransitionSystem {
  private state: AreaTransitionStateValue = 'idle';

  constructor(private readonly scene: Phaser.Scene) {}

  get currentState(): AreaTransitionStateValue {
    return this.state;
  }

  async transition(request: AreaTransitionRequest): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = nextAreaTransitionState(this.state, 'start');
    await this.fade(false, 320);
    this.state = nextAreaTransitionState(this.state, 'fade-out-complete');
    this.scene.scene.start(request.targetScene, {
      spawnPoint: request.spawnPoint,
      areaLabel: request.label,
    });
    this.state = nextAreaTransitionState(this.state, 'scene-ready');
    await this.fade(true, 320);
    this.state = nextAreaTransitionState(this.state, 'fade-in-complete');
  }

  reset(): void {
    this.state = 'idle';
  }

  private fade(fadeIn: boolean, duration: number): Promise<void> {
    return new Promise((resolve) => {
      const camera = this.scene.cameras.main;
      const event = fadeIn
        ? Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE
        : Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE;
      camera.once(event, resolve);
      if (fadeIn) camera.fadeIn(duration, 0, 0, 0);
      else camera.fadeOut(duration, 0, 0, 0);
    });
  }
}
