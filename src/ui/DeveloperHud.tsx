import { useEffect, useState } from 'react';
import { HUD_SNAPSHOT_EVENT, type HudSnapshot } from '../game/gameBridge';

const initialSnapshot: HudSnapshot = {
  fps: 0,
  playerX: 0,
  playerY: 0,
  area: 'home-street',
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
  areaLabel: '自宅前',
  cameraScrollX: 0,
  cameraMaxX: 0,
  transitionState: 'idle',
  inputLocked: false,
  branchDirection: null,
  branchVisible: false,
  spawnId: 'start',
  lastTransitionId: null,
  timeMinutes: 360,
  audioMuted: false,
  worldWidth: 2400,
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
        <strong>M1.4 SIDE-SCROLL HUD</strong>
        <span className={snapshot.fps >= 45 ? 'hud-ok' : 'hud-warn'}>{snapshot.fps} FPS</span>
      </header>
      <dl>
        <div><dt>AREA</dt><dd>{snapshot.areaLabel ?? snapshot.sectionLabel ?? snapshot.currentChunk}</dd></div>
        <div><dt>AREA_ID</dt><dd>{snapshot.area}</dd></div>
        <div><dt>POSITION</dt><dd>{snapshot.playerX}, {snapshot.playerY}</dd></div>
        <div><dt>FACING</dt><dd>{snapshot.facing ?? '—'}</dd></div>
        <div><dt>ANIMATION</dt><dd>{snapshot.animation ?? '—'}</dd></div>
        <div><dt>SPEED</dt><dd>{snapshot.speed ?? 0}</dd></div>
        <div><dt>CAMERA</dt><dd>{snapshot.cameraScrollX ?? 0} / {snapshot.cameraMaxX ?? 0}</dd></div>
        <div><dt>TRANSITION</dt><dd>{snapshot.transitionState ?? 'idle'}</dd></div>
        <div><dt>LOCK</dt><dd>{snapshot.inputLocked ? 'YES' : 'NO'}</dd></div>
        <div><dt>BRANCH</dt><dd>{snapshot.branchVisible ? (snapshot.branchDirection ?? 'YES') : '—'}</dd></div>
        <div><dt>SPAWN</dt><dd>{snapshot.spawnId ?? '—'}</dd></div>
        <div><dt>LAST_EXIT</dt><dd>{snapshot.lastTransitionId ?? '—'}</dd></div>
        <div><dt>STEPS</dt><dd>{snapshot.footstepCount ?? 0}</dd></div>
        <div><dt>LOADED</dt><dd>{snapshot.loadedChunks.length} / {snapshot.loadedChunks.join(', ') || '—'}</dd></div>
        <div><dt>TIME</dt><dd>{Math.floor((snapshot.timeMinutes ?? minutes) / 60).toString().padStart(2, '0')}:{(Math.round(snapshot.timeMinutes ?? minutes) % 60).toString().padStart(2, '0')} / {phaseLabel}</dd></div>
        <div><dt>AUDIO</dt><dd>{snapshot.audioMuted ? 'MUTED' : 'ON'}</dd></div>
        <div><dt>INPUT</dt><dd>{snapshot.inputSource}</dd></div>
        <div><dt>BUILD</dt><dd>v{__APP_VERSION__} / {__BUILD_COMMIT__}</dd></div>
      </dl>
    </aside>
  );
}
