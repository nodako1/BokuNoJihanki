# 開発ロードマップ

## M0 — 完了
React、Phaser、横画面、PWA、時間帯、音声、CI、Vercel。

## M1 — 完了
移動、入力、カメラ、衝突、時間帯、環境音の基盤。

## M1.1 — 完了
高密度ベクター2.5Dビジュアル。

## M1.2 — 完了・Production確認済み
承認済みコンセプトを基準にした高精細WebP背景、前景、時間帯差分、ラスタープレイヤー。

## M1.3 — mainマージ済み・M1.4フォールバック
住宅街だけを完成度の高いプレイアブル縦切りとして再構築した。

- 住宅街専用4区間
- Tiled互換walkable／obstacleデータ
- 足元円、サブステップ、壁沿いスライド
- 4方向×8歩行フレーム＋待機
- 足音同期
- 横スクロール、look-ahead
- 公園は専用Scene完成まで非公開

M1.3のコードと素材はM1.4移行中もProductionフォールバックと設計履歴として保存する。

## M1.4 — 実装中・Production確認前

街探索のメイン方式を2D横スクロールへ切り替え、3つの独立エリアをグラフとして接続する。

- `home-street`、`life-road`、`upper-vending-lane`
- 主人公は左右にだけ移動し、Yはエリアのground lineへ固定
- 横方向camera追従とlook-ahead
- 左右端の隣接エリア遷移
- 上・下矢印による分岐エリア遷移
- 単一永続Scene内の短い暗転・ロード・地名表示
- 左右各4待機＋10歩行フレーム、接地同期足音
- 朝、昼、夕方、夜の背景とWeb Audio mix
- navigation adapter契約と純粋fallbackを実装し、Claude core到着後に内部接続を差し替える
- PR Browser Smoke、mainマージ、Vercel Production、Production Browser Smoke、実画面確認

M1.4はVercel `Ready`だけで完了にしない。Productionで3エリア、全接続、歩行、camera、4時間帯、音声、pageerror／failed request 0件を実操作確認して初めて「完了・Production確認済み」とする。

## M2 — 一時停止・M1.4 Production確認後に再開
自販機接近、下／返却口、固定乱数、所持金、15分経過、当日一回、18時制限、ローカルセーブ。

Claudeが実装済みの`src/game/economy/`コアとテストは変更・削除せず保存する。M1.4がProduction確認済みになるまでScene統合へ進まない。

## M3
自室、1日の開始・終了、日付変更、ゲームショップ、1日3本、日記。

## M4以降
駅前、商店街、学校、プール、ビーチ、神社、山、遊園地、バス、埋蔵金、NPC、イベント、31日、エンディング。
