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
        <strong>M1.1 VISUAL HUD</strong>
        <span className={snapshot.fps >= 45 ? 'hud-ok' : 'hud-warn'}>{snapshot.fps} FPS</span>
      </header>
      <dl>
        <div><dt>POSITION</dt><dd>{snapshot.playerX}, {snapshot.playerY}</dd></div>
        <div><dt>AREA</dt><dd>{snapshot.area === 'park' ? 'なつかぜ公園' : '住宅街'}</dd></div>
        <div><dt>CHUNK</dt><dd>{snapshot.currentChunk}</dd></div>
        <div><dt>LOADED</dt><dd>{snapshot.loadedChunks.length} / {snapshot.loadedChunks.join(', ') || '—'}</dd></div>
        <div><dt>LOADING</dt><dd>{snapshot.loadingChunk ?? '—'}</dd></div>
        <div><dt>UNLOADED</dt><dd>{snapshot.lastUnloadedChunk ?? '—'}</dd></div>
        <div><dt>TIME</dt><dd>{Math.floor(minutes / 60).toString().padStart(2, '0')}:{(Math.round(minutes) % 60).toString().padStart(2, '0')} / {phaseLabel}</dd></div>
        <div><dt>INPUT</dt><dd>{snapshot.inputSource}</dd></div>
        <div><dt>COLLISION</dt><dd>{snapshot.collisionDebug ? 'VISIBLE' : 'HIDDEN'}</dd></div>
        <div><dt>BUILD</dt><dd>v{__APP_VERSION__} / {__BUILD_COMMIT__}</dd></div>
      </dl>
    </aside>
  );
}
