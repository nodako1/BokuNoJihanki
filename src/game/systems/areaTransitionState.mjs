export const AREA_TRANSITION_STATES = ['idle', 'fading-out', 'loading', 'fading-in'];

export function nextAreaTransitionState(state, event) {
  if (state === 'idle' && event === 'start') return 'fading-out';
  if (state === 'fading-out' && event === 'fade-out-complete') return 'loading';
  if (state === 'loading' && event === 'scene-ready') return 'fading-in';
  if (state === 'fading-in' && event === 'fade-in-complete') return 'idle';
  return state;
}
