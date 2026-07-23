export type AreaTransitionStateValue = 'idle' | 'fading-out' | 'loading' | 'fading-in';
export type AreaTransitionEvent = 'start' | 'fade-out-complete' | 'scene-ready' | 'fade-in-complete';
export const AREA_TRANSITION_STATES: readonly AreaTransitionStateValue[];
export function nextAreaTransitionState(state: AreaTransitionStateValue, event: AreaTransitionEvent): AreaTransitionStateValue;
