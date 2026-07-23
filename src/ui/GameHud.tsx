import { formatGameTime, getAtmosphere } from '../game/systems/timeOfDay';
import { DeveloperHud } from './DeveloperHud';
import { AreaArrowButton } from './AreaArrowButton';
import { VirtualJoystick } from './VirtualJoystick';

interface GameHudProps {
  minutes: number;
  autoPlay: boolean;
  muted: boolean;
  audioAvailable: boolean;
  developerHudVisible: boolean;
  collisionDebug: boolean;
  onStepTime: () => void;
  onToggleAutoPlay: () => void;
  onToggleMuted: () => void;
  onResetTime: () => void;
  onToggleDeveloperHud: () => void;
  onToggleCollisionDebug: () => void;
}

export function GameHud({
  minutes,
  autoPlay,
  muted,
  audioAvailable,
  developerHudVisible,
  collisionDebug,
  onStepTime,
  onToggleAutoPlay,
  onToggleMuted,
  onResetTime,
  onToggleDeveloperHud,
  onToggleCollisionDebug,
}: GameHudProps): React.JSX.Element {
  const atmosphere = getAtmosphere(minutes);
  const phaseIcon = atmosphere.phase === 'night'
    ? '☾'
    : atmosphere.phase === 'evening'
      ? '◒'
      : '☀';

  return (
    <main className="game-ui-layer">
      <header className="game-topbar">
        <div className="game-date-chip" aria-live="polite">
          <span>8月1日（土）</span>
          <strong>{formatGameTime(minutes)}</strong>
          <small><b aria-hidden="true">{phaseIcon}</b>{atmosphere.phaseLabel}</small>
        </div>

        <div className="game-actions" aria-label="ゲーム操作">
          <button
            type="button"
            className="hud-icon-button"
            onClick={onToggleMuted}
            disabled={!audioAvailable}
            aria-label={!audioAvailable ? '音声非対応' : muted ? '音をオンにする' : '音をオフにする'}
            title={!audioAvailable ? '音声非対応' : muted ? '音をオンにする' : '音をオフにする'}
          >
            {muted || !audioAvailable ? '×' : '♪'}
          </button>
          <button
            type="button"
            className="hud-icon-button"
            onClick={onToggleAutoPlay}
            aria-label={autoPlay ? '時間の自動再生を止める' : '時間の自動再生を始める'}
            title={autoPlay ? '時間停止' : '時間再生'}
          >
            {autoPlay ? 'Ⅱ' : '▶'}
          </button>
          <details className="dev-tool-drawer">
            <summary>開発</summary>
            <section className="dev-control-panel" aria-label="M1.4開発操作">
              <button type="button" onClick={onStepTime}>＋15分</button>
              <button type="button" onClick={onResetTime}>朝へ戻す</button>
              <button type="button" onClick={onToggleDeveloperHud}>{developerHudVisible ? 'HUDを隠す' : 'HUDを表示'}</button>
              <button type="button" onClick={onToggleCollisionDebug}>{collisionDebug ? '当たり判定を隠す' : '当たり判定を表示'}</button>
            </section>
          </details>
        </div>
      </header>

      <DeveloperHud
        visible={developerHudVisible}
        minutes={minutes}
        phaseLabel={atmosphere.phaseLabel}
      />

      <VirtualJoystick />
      <AreaArrowButton />
      <p className="control-hint">A / D・← / →で歩く・矢印が現れた場所だけ W / S・↑ / ↓でエリア移動</p>
    </main>
  );
}
