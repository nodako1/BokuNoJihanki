# 開発ロードマップ

## M0 — 完了
React、Phaser、横画面、PWA、時間帯、音声、CI、Vercel。

## M1 — 完成判定再オープン・M1.5必須
移動、入力、カメラ、時間帯、環境音、3エリア遷移の正式方式はM1.4の2D横スクロール。M1.4実装のProduction確認commit `147f770a4b73077c4e5dc0523839b3fefb789db4`と、PR #34後の現main／Production baseline `29223ee31fd4fc4fbca21a37b01fe89277279647`の履歴は維持するが、ユーザー実機で6件の品質問題が見つかったため、M1全体の完成判定を再オープンした。同一SHAのPreviewで自動テスト、独立QA、Evidence監査、ユーザー実iPhone承認を終えるまでmainへ進めず、その後のProduction確認までM2を開始しない。

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
M1.5でもM1.3のコード、素材、生成工程を変更・削除・接続しない。

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

このM1.4配信成功は取り消さない。ただし既存検証は、背景道路との接地差、背景上の分岐とtriggerの一致、UIと主人公の重なり、BGMの音楽品質を合格させるものではなかった。後続の実機所見により、M1全体の品質承認はM1.5へ移した。

## M1.5 — 必須・実機品質修正

主人公の最終ラスタ化、背景道路に基づく接地と分岐の再整合、遷移UIの重なり解消、BGMの作り直しを扱う。旧「任意・非ブロッキングpolish」判断を置き換え、M1とM2の必須gateとする。

- 現行仕様: [M1.5 必須実機品質修正](specs/M1_5_REAL_DEVICE_POLISH.md)
- 確認済み問題: [M1.5 ユーザー実機所見](evidence/M1_5_REAL_DEVICE_FINDINGS.md)
- 完了条件: 同一SHA Previewの自動テスト、くーちゃん独立QA、リダ君Evidence監査、ユーザーiPhone実機の5項目承認、承認済みSHAのmainマージ、Production再確認
- 再承認: Preview承認後にコード・素材が変わった場合は、新SHAで全Preview gateをやり直す

## M2 — 開始保留
自販機接近、下／返却口、固定乱数、所持金、15分経過、当日一回、18時制限、ローカルセーブ。

既存の`src/game/economy/`コアとテストは変更・削除せず保存済み。open PR #31も変更・マージしない。同一SHA Previewのユーザー実iPhone承認、承認済みSHAのmainマージ、Production再確認が揃うまでimportもScene統合も行わない。

## M3
自室、1日の開始・終了、日付変更、ゲームショップ、1日3本、日記。

## M4以降
駅前、商店街、学校、プール、ビーチ、神社、山、遊園地、バス、埋蔵金、NPC、イベント、31日、エンディング。
