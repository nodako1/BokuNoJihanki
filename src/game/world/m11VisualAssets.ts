import { M11_BACKGROUND_ASSETS } from './m11BackgroundAssets';
import { M11_PLAYER_ASSETS } from './m11PlayerAssets';
import { M11_PROP_ASSETS } from './m11PropAssets';

export const M11_VISUAL_ASSETS: Record<string, string> = {
  ...M11_BACKGROUND_ASSETS,
  ...M11_PROP_ASSETS,
  ...M11_PLAYER_ASSETS,
};
