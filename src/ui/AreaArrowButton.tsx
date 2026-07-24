import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  AREA_PROMPT_EVENT,
  PLAYER_SCREEN_GEOMETRY_EVENT,
  readAreaPrompt,
  requestAreaTraversal,
  type AreaPromptState,
  type PlayerScreenGeometry,
} from '../game/gameBridge';
import {
  AREA_PANEL_HOST_SELECTOR,
  observeAreaPanelObstacleElements,
  readAreaPanelObstacles,
  readAreaPanelPlayerGeometryFromDom,
  readAreaPanelSafeArea,
} from './areaPanelDom';
import {
  chooseAreaPanelPlacement,
  normalizeAreaPanelPlayerGeometry,
  type AreaPanelPlacement,
  type AreaPanelPlayerGeometry,
} from './areaPanelPlacement.mjs';

function placementMatches(
  previous: AreaPanelPlacement | null,
  next: AreaPanelPlacement | null,
): boolean {
  if (previous === null || next === null) return previous === next;
  return (
    previous.x === next.x
    && previous.y === next.y
    && previous.anchor === next.anchor
    && previous.valid === next.valid
    && previous.playerIntersectionArea === next.playerIntersectionArea
    && previous.playerDistance === next.playerDistance
    && previous.obstacleIntersections.join('\u0000') === next.obstacleIntersections.join('\u0000')
  );
}

export function AreaArrowButton(): React.JSX.Element | null {
  const [prompt, setPrompt] = useState<AreaPromptState>(readAreaPrompt);
  const [placement, setPlacement] = useState<AreaPanelPlacement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const playerGeometryRef = useRef<AreaPanelPlayerGeometry | null>(null);

  useEffect(() => {
    const handlePrompt = (event: Event): void => {
      setPrompt((event as CustomEvent<AreaPromptState>).detail);
    };
    window.addEventListener(AREA_PROMPT_EVENT, handlePrompt);
    return () => window.removeEventListener(AREA_PROMPT_EVENT, handlePrompt);
  }, []);

  useLayoutEffect(() => {
    if (!prompt.visible || !prompt.direction) {
      playerGeometryRef.current = null;
      setPlacement(null);
      return undefined;
    }

    const button = buttonRef.current;
    if (!button) return undefined;
    const host = document.querySelector<HTMLElement>(AREA_PANEL_HOST_SELECTOR);
    let frame = 0;

    const measure = (): void => {
      frame = 0;
      const geometry = (
        readAreaPanelPlayerGeometryFromDom(host)
        ?? playerGeometryRef.current
      );
      if (!geometry) {
        setPlacement((previous) => (previous === null ? previous : null));
        return;
      }

      const buttonRect = button.getBoundingClientRect();
      const next = chooseAreaPanelPlacement({
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        panel: {
          width: buttonRect.width,
          height: buttonRect.height,
        },
        player: geometry.rect,
        facing: geometry.facing,
        direction: prompt.direction!,
        obstacles: readAreaPanelObstacles(button),
        safeArea: readAreaPanelSafeArea(host),
        // Keep one render/frame of movement headroom while preserving the
        // externally measured 12 CSS px contract.
        playerGap: 20,
      });
      setPlacement((previous) => (placementMatches(previous, next) ? previous : next));
    };

    const scheduleMeasure = (): void => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(measure);
    };

    const handlePlayerGeometry = (event: Event): void => {
      const next = normalizeAreaPanelPlayerGeometry(
        (event as CustomEvent<PlayerScreenGeometry>).detail,
      );
      if (!next) return;
      playerGeometryRef.current = next;
      scheduleMeasure();
    };

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);
    if (resizeObserver) observeAreaPanelObstacleElements(resizeObserver, button);

    const mutationObserver = host && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(scheduleMeasure)
      : null;
    mutationObserver?.observe(host!, {
      attributes: true,
      attributeFilter: [
        'class',
        'open',
        'style',
        'data-m15-player-left',
        'data-m15-player-top',
        'data-m15-player-width',
        'data-m15-player-height',
        'data-m15-player-facing',
      ],
      childList: true,
      subtree: true,
    });

    window.addEventListener(PLAYER_SCREEN_GEOMETRY_EVENT, handlePlayerGeometry);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', scheduleMeasure);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    scheduleMeasure();

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      playerGeometryRef.current = null;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener(PLAYER_SCREEN_GEOMETRY_EVENT, handlePlayerGeometry);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('orientationchange', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
    };
  }, [prompt.areaId, prompt.direction, prompt.visible]);

  if (!prompt.visible || !prompt.direction) return null;

  const upward = prompt.direction === 'up';
  const ariaLabel = upward ? '上のエリアへ移動' : '下のエリアへ移動';
  const placementStyle = {
    '--area-panel-x': `${placement?.x ?? -10000}px`,
    '--area-panel-y': `${placement?.y ?? -10000}px`,
  } as CSSProperties;
  const placementReady = placement?.valid === true;

  return (
    <button
      ref={buttonRef}
      type="button"
      className={[
        'area-arrow-button',
        `area-arrow-button--${prompt.direction}`,
        placementReady ? 'area-arrow-button--placed' : 'area-arrow-button--awaiting-placement',
      ].join(' ')}
      style={placementStyle}
      aria-label={ariaLabel}
      aria-hidden={!placementReady}
      disabled={!placementReady}
      data-area-panel-anchor={placement?.anchor ?? 'pending'}
      data-area-panel-player-intersection={
        placement?.playerIntersectionArea.toFixed(3) ?? ''
      }
      data-area-panel-player-distance={placement?.playerDistance.toFixed(3) ?? ''}
      data-area-panel-obstacle-intersections={
        placement?.obstacleIntersections.join(',') ?? ''
      }
      data-area-panel-x={placement?.x.toFixed(3) ?? ''}
      data-area-panel-y={placement?.y.toFixed(3) ?? ''}
      onClick={() => {
        const current = readAreaPrompt();
        if (
          !placementReady
          || !current.visible
          || current.direction === null
          || current.direction !== prompt.direction
        ) {
          return;
        }
        requestAreaTraversal(current.direction);
      }}
    >
      <span className="area-arrow-glyph" aria-hidden="true">{upward ? '↑' : '↓'}</span>
      <span className="area-arrow-label">{prompt.label}</span>
      <small>{upward ? 'W / ↑' : 'S / ↓'}</small>
    </button>
  );
}
