import { formatGameTime, getAtmosphere } from '../game/systems/timeOfDay';

interface TitleOverlayProps {
  started: boolean;
  previewMinutes: number;
  autoPlay: boolean;
  muted: boolean;
  audioAvailable: boolean;
  onStart: () => void;
  onStepTime: () => void;
  onToggleAutoPlay: () => void;
  onToggleMuted: () => void;
  onResetTime: () => void;
}

export function TitleOverlay({
  started,
  previewMinutes,
  autoPlay,
  muted,
  audioAvailable,
  onStart,
  onStepTime,
  onToggleAutoPlay,
  onToggleMuted,
  onResetTime,
}: TitleOverlayProps): React.JSX.Element {
  const atmosphere = getAtmosphere(previewMinutes);

  if (!started) {
    return (
      <main className="title-layer">
        <section className="title-card" aria-labelledby="game-title">
          <p className="title-kicker">SUMMER VACATION EXPLORATION RPG</p>
          <h1 id="game-title" className="game-title">
            <span>ぼくの</span>
            自販機
          </h1>
          <p className="tagline">人生で一番バカで、一番楽しい夏休み。</p>
          <p className="title-description">
            夏の町を歩き回り、自販機の下や返却口からお金を集めて、毎日3本だけ入荷するゲームソフトを買いまくろう。
          </p>
          <button className="primary-button" type="button" onClick={onStart}>
            夏休みを始める
          </button>
          <p className="start-note">最初のタップで、オリジナルBGMと夏の環境音が始まります。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="preview-layer">
      <header className="preview-hud" aria-live="polite">
        <div className="date-chip">
          <span>8月1日（土）</span>
          <strong>{formatGameTime(previewMinutes)}</strong>
          <small>{atmosphere.phaseLabel}</small>
        </div>
        <div className="milestone-chip">
          <span>M0</span>
          <strong>開発基盤プレビュー</strong>
        </div>
      </header>

      <section className="preview-controls" aria-label="時間帯と音の確認">
        <p>
          朝・昼・夕方・夏祭りの夜まで、同じ町の光、空、窓、自販機、街灯、環境音が連続して変化します。
        </p>
        <div className="control-row">
          <button type="button" onClick={onStepTime}>
            ＋15分
          </button>
          <button type="button" onClick={onToggleAutoPlay}>
            {autoPlay ? '時間を止める' : '時間を流す'}
          </button>
          <button type="button" onClick={onResetTime}>
            朝に戻す
          </button>
          <button type="button" onClick={onToggleMuted} disabled={!audioAvailable}>
            {!audioAvailable ? '音声非対応' : muted ? '音をON' : '音をOFF'}
          </button>
        </div>
        <small>通常日は18:00まで。夏祭りなどの特別日は21:00まで行動できます。</small>
      </section>
    </main>
  );
}
