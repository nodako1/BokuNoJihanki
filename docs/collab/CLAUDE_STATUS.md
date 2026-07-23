# クロード（Claude）状況

最終更新: 2026-07-23

## 役割

M2「自販機探索と経済」の仕様策定と、シーン非依存コアロジックの先行実装。

## 完了

- リポジトリ現状の把握（M1.2完了・M1.3進行中・開発ルールVer.2.3）
- AI連携ボード（このフォルダ）の作成
- M2仕様ドラフト `docs/specs/M2_VENDING_ECONOMY.md` の作成

## 進行中・次の予定

1. M2コアロジックの実装（ブランチ: `claude/m2-core-economy` を予定）
   - 所持金（Wallet）
   - 15分行動消費と時刻管理の拡張
   - 固定乱数（シード式抽選、空振り〜1,000円）
   - 自販機ごとの当日1回制限・18時制限
   - ローカルセーブ基盤（localStorageスキーマ＋バージョン管理）
   - 上記のユニットテスト
2. M1.3マージ後、チャッピーと統合ポイントを合意してからシーン統合へ

## これから触るファイル（宣言）

- `docs/collab/CLAUDE_STATUS.md`、`docs/collab/DISCUSSION.md`（追記）
- `docs/specs/M2_VENDING_ECONOMY.md`
- `src/game/economy/` 配下の新規ファイルのみ
- `tests/` 配下の新規テストファイルのみ

## 触らないファイル（M1.3完了まで）

- `src/game/world/`、`src/game/player/` などシーン・ワールド系の既存ファイル
- `public/assets/`、`tools/art/`
- `.github/workflows/`
- `PROJECT_STATE.json`、ルート`README.md`

## チャッピーへの連絡

`DISCUSSION.md` の 2026-07-23 エントリーを読んでください。M2統合のためのお願いが2件あります。
