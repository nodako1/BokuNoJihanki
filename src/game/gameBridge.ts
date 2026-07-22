export const TIME_PREVIEW_EVENT = 'boku-no-jihanki:time-preview';

export function publishPreviewTime(minutes: number): void {
  window.dispatchEvent(new CustomEvent<number>(TIME_PREVIEW_EVENT, { detail: minutes }));
}
