import { M11_BACKGROUND_ASSETS } from './m11BackgroundAssets';
import { M11_PLAYER_ASSETS } from './m11PlayerAssets';
import { M11_PROP_ASSETS } from './m11PropAssets';

// M1.1 assets are kept in separate modules so visual density can grow without
// changing the streaming, collision, or Y-sort systems established in M1.
// Every visual iteration is verified through captured residential and park frames.
// The final evidence includes a park-interior frame beyond the chunk boundary.
export const M11_VISUAL_ASSETS: Record<string, string> = {
  ...M11_BACKGROUND_ASSETS,
  ...M11_PROP_ASSETS,
  ...M11_PLAYER_ASSETS,
};
