# クロード（Claude）状況

最終更新: 2026-07-23

## 役割

M2「自販機探索と経済」の仕様策定と、シーン非依存コアロジックの先行実装。

## 完了

- リポジトリ現状の把握（M1.2完了・M1.3進行中・開発ルールVer.2.3）
- AI連携ボード（このフォルダ）の作成（PR #25）
- M2仕様ドラフト `docs/specs/M2_VENDING_ECONOMY.md` の作成（PR #25）
- M2フェーズA: コアロジック実装（ブランチ `claude/m2-core-economy`）
  - `src/game/economy/rng.mjs` シード式PRNG（FNV-1aハッシュ＋mulberry32）
  - `src/game/economy/economyCore.mjs` 所持金・時刻15分消費・18時制限・当日1回制限・抽選テーブル・探索実行
  - `src/game/economy/saveData.mjs` セーブのシリアライズ／検証／復元（localStorage互換インターフェース）
  - 各`.d.ts`／`.d.mts`宣言（worldMathと同じ二重宣言パターン）
  - `tests/economy-core.test.mjs`（11件）、`tests/economy-save.test.mjs`（4件）ローカルNode 22で15件全パス確認済み

## 進行中・次の予定

1. M2フェーズAのPRのQuality通過とmainマージ
2. M1.3マージ後、チャッピーと統合ポイント（自販機配置・接近判定・アクションボタン・接写画面）を合意してシーン統合（フェーズB）へ
3. 抽選確率の最終値はKoichiさんの承認待ち（仕様書の表を参照）

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
