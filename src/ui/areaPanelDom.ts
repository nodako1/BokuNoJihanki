import {
  createAreaPanelRect,
  normalizeAreaPanelPlayerGeometry,
  type AreaPanelObstacle,
  type AreaPanelPlayerGeometry,
  type AreaPanelRect,
  type AreaPanelSafeArea,
} from './areaPanelPlacement.mjs';

export const AREA_PANEL_HOST_SELECTOR = '.game-ui-layer';

export const AREA_PANEL_OBSTACLE_SELECTORS = [
  '.game-date-chip',
  '.game-actions',
  '.developer-hud',
  '.dev-control-panel',
  '.virtual-joystick',
  '.control-hint',
  '.build-badge',
  '[data-area-panel-obstacle]',
] as const;

const PLAYER_PROPERTY_NAMES = {
  left: '--m15-player-left',
  top: '--m15-player-top',
  width: '--m15-player-width',
  height: '--m15-player-height',
  facing: '--m15-player-facing',
} as const;

function numericCssValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function domRectToAreaPanelRect(rect: DOMRect): AreaPanelRect {
  return createAreaPanelRect(rect.left, rect.top, rect.width, rect.height);
}

function isRendered(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (
    style.display === 'none'
    || style.visibility === 'hidden'
    || Number.parseFloat(style.opacity) === 0
  ) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function readPlayerDataset(host: HTMLElement): AreaPanelPlayerGeometry | null {
  const left = numericCssValue(host.dataset.m15PlayerLeft);
  const top = numericCssValue(host.dataset.m15PlayerTop);
  const width = numericCssValue(host.dataset.m15PlayerWidth);
  const height = numericCssValue(host.dataset.m15PlayerHeight);
  if (left === null || top === null || width === null || height === null) return null;
  return normalizeAreaPanelPlayerGeometry({
    rect: { left, top, width, height },
    facing: host.dataset.m15PlayerFacing,
  });
}

function readPlayerCustomProperties(host: HTMLElement): AreaPanelPlayerGeometry | null {
  const style = window.getComputedStyle(host);
  const left = numericCssValue(style.getPropertyValue(PLAYER_PROPERTY_NAMES.left));
  const top = numericCssValue(style.getPropertyValue(PLAYER_PROPERTY_NAMES.top));
  const width = numericCssValue(style.getPropertyValue(PLAYER_PROPERTY_NAMES.width));
  const height = numericCssValue(style.getPropertyValue(PLAYER_PROPERTY_NAMES.height));
  if (left === null || top === null || width === null || height === null) return null;
  return normalizeAreaPanelPlayerGeometry({
    rect: { left, top, width, height },
    facing: style.getPropertyValue(PLAYER_PROPERTY_NAMES.facing).trim(),
  });
}

/**
 * DOM fallback contract for the Phaser bridge:
 *
 * Set either data-m15-player-{left,top,width,height,facing} or the equivalent
 * --m15-player-* custom properties on `.game-ui-layer`. All coordinates are
 * CSS pixels in the viewport coordinate system.
 */
export function readAreaPanelPlayerGeometryFromDom(
  host: HTMLElement | null = document.querySelector<HTMLElement>(AREA_PANEL_HOST_SELECTOR),
): AreaPanelPlayerGeometry | null {
  if (!host) return null;
  return readPlayerDataset(host) ?? readPlayerCustomProperties(host);
}

export function readAreaPanelSafeArea(
  host: HTMLElement | null = document.querySelector<HTMLElement>(AREA_PANEL_HOST_SELECTOR),
): AreaPanelSafeArea {
  if (!host) return { top: 12, right: 12, bottom: 12, left: 12 };
  const style = window.getComputedStyle(host);
  return {
    top: Math.max(12, numericCssValue(style.paddingTop) ?? 0),
    right: Math.max(12, numericCssValue(style.paddingRight) ?? 0),
    bottom: Math.max(12, numericCssValue(style.paddingBottom) ?? 0),
    left: Math.max(12, numericCssValue(style.paddingLeft) ?? 0),
  };
}

export function readAreaPanelObstacles(
  panelElement: HTMLElement | null,
): AreaPanelObstacle[] {
  const elements = new Set<HTMLElement>();
  for (const selector of AREA_PANEL_OBSTACLE_SELECTORS) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element !== panelElement && !element.contains(panelElement)) elements.add(element);
    }
  }

  return [...elements]
    .filter(isRendered)
    .map((element, index) => ({
      id: element.dataset.areaPanelObstacle
        || element.getAttribute('aria-label')
        || element.classList.item(0)
        || `obstacle-${index}`,
      rect: domRectToAreaPanelRect(element.getBoundingClientRect()),
    }));
}

export function observeAreaPanelObstacleElements(
  observer: ResizeObserver,
  panelElement: HTMLElement,
): void {
  observer.observe(panelElement);
  for (const selector of AREA_PANEL_OBSTACLE_SELECTORS) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      observer.observe(element);
    }
  }
}
