import { useEffect, useState } from 'react';
import { HUD_SNAPSHOT_EVENT, type HudSnapshot } from '../game/gameBridge';

const initialSnapshot: HudSnapshot = {
  fps: 0,
  playerX: 0,
  playerY: 0,
  area: 'residential',
  currentChunk: '準備中',
  loadedChunks: [],
  loadingChunk: null,
  lastUnloadedChunk: null,
  inputSource: 'none',
  collisionDebug: false,
  sectionLabel: '準備中',
  facing: 'right',
  animation: 'idle-right',
  speed: 0,
  walkable: false,
  blocked: false,
  footstepCount: 0,
  exitNearby: false,
};

interface DeveloperHudProps {
  visible: boolean;
  minutes: number;
  phaseLabel: string;
}

export function DeveloperHud({
  visible,
  minutes,
  phaseLabel,
}: DeveloperHudProps): React.JSX.Element | null {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    const handleSnapshot = (event: Event): void => {
      setSnapshot((event as CustomEvent<HudSnapshot>).detail);
    };
    window.addEventListener(HUD_SNAPSHOT_EVENT, handleSnapshot);
    return () => window.removeEventListener(HUD_SNAPSHOT_EVENT, handleSnapshot);
  }, []);

  if (!visible) return null;

  return (
    <aside className="developer-hud" aria-label="開発用情報">
      <header>
        <strong>M1.3 RESIDENTIAL HUD</strong>
        <span className={snapshot.fps >= 45 ? 'hud-ok' : 'hud-warn'}>{snapshot.fps} FPS</span>
      </header>
      <dl>
        <div><dt>POSITION</dt><dd>{snapshot.playerX}, {snapshot.playerY}</dd></div>
        <div><dt>SECTION</dt><dd>{snapshot.sectionLabel ?? snapshot.currentChunk}</dd></div>
        <div><dt>CHUNK</dt><dd>{snapshot.currentChunk}</dd></div>
        <div><dt>FACING</dt><dd>{snapshot.facing ?? '—'}</dd></div>
        <div><dt>ANIMATION</dt><dd>{snapshot.animation ?? '—'}</dd></div>
        <div><dt>SPEED</dt><dd>{snapshot.speed ?? 0}</dd></div>
        <div><dt>WALKABLE</dt><dd>{snapshot.walkable ? 'YES' : 'NO'}</dd></div>
        <div><dt>BLOCKED</dt><dd>{snapshot.blocked ? 'YES' : 'NO'}</dd></div>
        <div><dt>STEPS</dt><dd>{snapshot.footstepCount ?? 0}</dd></div>
        <div><dt>EXIT</dt><dd>{snapshot.exitNearby ? 'NEAR' : '—'}</dd></div>
        <div><dt>LOADED</dt><dd>{snapshot.loadedChunks.length} / {snapshot.loadedChunks.join(', ') || '—'}</dd></div>
        <div><dt>TIME</dt><dd>{Math.floor(minutes / 60).toString().padStart(2, '0')}:{(Math.round(minutes) % 60).toString().padStart(2, '0')} / {phaseLabel}</dd></div>
        <div><dt>INPUT</dt><dd>{snapshot.inputSource}</dd></div>
        <div><dt>DEBUG</dt><dd>{snapshot.collisionDebug ? 'VISIBLE' : 'HIDDEN'}</dd></div>
        <div><dt>BUILD</dt><dd>v{__APP_VERSION__} / {__BUILD_COMMIT__}</dd></div>
      </dl>
    </aside>
  );
}
