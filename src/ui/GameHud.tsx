import { formatGameTime, getAtmosphere } from '../game/systems/timeOfDay';
import { DeveloperHud } from './DeveloperHud';
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

  return (
    <main className="game-ui-layer">
      <header className="game-topbar">
        <div className="game-date-chip" aria-live="polite">
          <span>8月1日（土）</span>
          <strong>{formatGameTime(minutes)}</strong>
          <small>{atmosphere.phaseLabel}</small>
        </div>
        <div className="area-purpose-chip">
          <span>M1</span>
          <div><strong>町を歩く基盤</strong><small>住宅街 ↔ なつかぜ公園</small></div>
        </div>
      </header>

      <DeveloperHud
        visible={developerHudVisible}
        minutes={minutes}
        phaseLabel={atmosphere.phaseLabel}
      />

      <section className="dev-control-rail" aria-label="M1開発操作">
        <button type="button" onClick={onStepTime}>＋15分</button>
        <button type="button" onClick={onToggleAutoPlay}>{autoPlay ? '時間停止' : '時間再生'}</button>
        <button type="button" onClick={onResetTime}>朝へ</button>
        <button type="button" onClick={onToggleDeveloperHud}>{developerHudVisible ? 'HUD非表示' : 'HUD表示'}</button>
        <button type="button" onClick={onToggleCollisionDebug}>{collisionDebug ? '当たり判定OFF' : '当たり判定ON'}</button>
        <button type="button" onClick={onToggleMuted} disabled={!audioAvailable}>{!audioAvailable ? '音声非対応' : muted ? '音ON' : '音OFF'}</button>
      </section>

      <VirtualJoystick />
      <div className="future-action-space" aria-hidden="true"><span>M2</span><small>調べる</small></div>
      <p className="control-hint">スマホ：左スティック　PC：WASD / 矢印キー　道路を右へ進むと公園です</p>
    </main>
  );
}
