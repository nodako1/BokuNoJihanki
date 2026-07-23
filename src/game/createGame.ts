import Phaser from 'phaser';
import { ResidentialScene } from './scenes/ResidentialScene';
import { SideScrollTownScene } from './scenes/SideScrollTownScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#102746',
    banner: false,
    transparent: false,
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720,
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
    },
    input: {
      activePointers: 4,
    },
    // M1.4 is the Production route. M1.3 stays registered as a fallback and
    // design-history scene, but is not auto-started.
    scene: [SideScrollTownScene, ResidentialScene],
  };

  return new Phaser.Game(config);
}
