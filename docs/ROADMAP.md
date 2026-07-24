# 開発ロードマップ

## M0 — 完了
React、Phaser、横画面、PWA、時間帯、音声、CI、Vercel。

## M1 — 完成判定再オープン・M1.5必須
移動、入力、カメラ、時間帯、環境音、3エリア遷移の正式方式はM1.4の2D横スクロール。M1.4のProduction成功履歴は保持するが、後続の実機品質問題によりM1全体の完成判定を再オープンした。

## M1.1 — 完了
高密度ベクター2.5Dビジュアル。

## M1.2 — 完了・Production確認済み
承認済みコンセプトを基準にした高精細WebP背景、前景、時間帯差分、ラスタープレイヤー。

## M1.3 — 完了・M1.4フォールバック
住宅街だけを完成度の高いプレイアブル縦切りとして再構築した。

- 住宅街専用4区間
- Tiled互換walkable／obstacleデータ
- 足元円、サブステップ、壁沿いスライド
- 4方向×8歩行フレーム＋待機
- 足音同期
- 横スクロール、look-ahead
- 公園は専用Scene完成まで非公開

M1.3のコードと素材はProductionフォールバックと設計履歴として保存する。

## M1.4 — 完了・Production確認済み

街探索のメイン方式を2D横スクロールへ切り替え、3つの独立エリアをグラフとして接続する。

- `home-street`、`life-road`、`upper-vending-lane`
- 主人公は左右にだけ移動し、Yはエリアのground lineへ固定
- 横方向camera追従とlook-ahead
- 左右端の隣接エリア遷移
- 上・下矢印による分岐エリア遷移
- 単一永続Scene内の短い暗転・ロード・地名表示
- 左右各4待機＋10歩行フレーム、接地同期足音
- 朝、昼、夕方、夜の背景とWeb Audio mix
- PR #33のnavigation coreをadapter経由で利用
- cloneされた遷移状態でも正しい遷移元spawnへ復帰
- PR Browser Smoke、mainマージ、Vercel Production、Production Smoke、Production Browser Smoke、実画面確認

PR #32 head `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`とProduction merge `147f770a4b73077c4e5dc0523839b3fefb789db4`で、3エリア、5遷移、左右歩行、camera、4時間帯、音声状態保持、pageerror／failed request 0件を確認した。M1.4をM1の正式基盤とする。

## M1.5 — 必須・実機品質修正版

主人公、3エリアの接地、上下導線、遷移パネル、BGM、音声復帰を修正する。同一SHA PreviewのCI、candidate QA、Evidence監査、ユーザー実iPhone承認、承認済みSHAのmainマージ、Production再確認を完了条件とする。詳細は[M1.5仕様](specs/M1_5_POLISH.md)。

## M2 — 開始保留
自販機接近、下／返却口、固定乱数、所持金、15分経過、当日一回、18時制限、ローカルセーブ。

既存の`src/game/economy/`コアとテストは保存する。M1.5のProduction確認までScene統合とopen PR #31を変更・マージしない。

## M3
自室、1日の開始・終了、日付変更、ゲームショップ、1日3本、日記。

## M4以降
駅前、商店街、学校、プール、ビーチ、神社、山、遊園地、バス、埋蔵金、NPC、イベント、31日、エンディング。
