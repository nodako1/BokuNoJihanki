interface TitleOverlayProps {
  onStart: () => void;
}

export function TitleOverlay({ onStart }: TitleOverlayProps): React.JSX.Element {
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
          夏の住宅街を横に歩き、分かれ道から上の路地へ。左右スティック、またはA・D／左右キーで歩き、矢印が現れた場所では上下入力で街を行き来できます。
        </p>
        <button className="primary-button" type="button" onClick={onStart}>
          夏休みを始める
        </button>
        <p className="start-note">最初のタップで、オリジナルBGMと夏の環境音が始まります。</p>
      </section>
    </main>
  );
}
