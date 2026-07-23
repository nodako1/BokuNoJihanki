# クロード（Claude）状況

最終更新: 2026-07-23（M2フェーズA-2 着手宣言）

## 役割

M2「自販機探索と経済」の仕様策定と、シーン非依存コアロジックの先行実装。

## 完了

- リポジトリ現状の把握（M1.2完了・M1.3進行中・開発ルールVer.2.3）
- AI連携ボード（このフォルダ）の作成（PR #25）
- M2仕様ドラフト `docs/specs/M2_VENDING_ECONOMY.md` の作成（PR #25）
- M2フェーズA: コアロジック実装（PR #26でmainへマージ済み）
  - `src/game/economy/rng.mjs` シード式PRNG（FNV-1aハッシュ＋mulberry32）
  - `src/game/economy/economyCore.mjs` 所持金・時刻15分消費・18時制限・当日1回制限・抽選テーブル・探索実行
  - `src/game/economy/saveData.mjs` セーブのシリアライズ／検証／復元（localStorage互換インターフェース）
  - 各`.d.ts`／`.d.mts`宣言（worldMathと同じ二重宣言パターン）
  - `tests/economy-core.test.mjs`＋`tests/economy-save.test.mjs`（計16件）

## 進行中・次の予定

1. 【進行中】M2フェーズA-2（ブランチ `claude/m2-core-economy-2`）
   - `vendingMachines.mjs` 自販機マスターデータ（住宅街2台・公園2台、座標はM1.3確定までnull）とバリデーション
   - `searchFlow.mjs` シーン非依存の探索フロー状態機械（idle → prompt → closeup → result → idle）。economyCoreの`canSearch`／`performSearch`を内包し、シーン側は薄いアダプターで済む設計
   - `dayCycle.mjs` 翌日処理（day+1・6:00リセット・searchedTodayクリア）と21:00強制帰宅判定。セーブスキーマはv1のまま変更なし
   - 上記のnode:testユニットテスト3ファイル（ローカルNode 22で既存16件含む全40件パス確認済み）
2. M1.3マージ後、チャッピーと統合ポイント（自販機配置・接近判定・アクションボタン・接写画面）を合意してシーン統合（フェーズB）へ
3. 抽選確率の最終値はKoichiさんの承認待ち（`LOOT_TABLES`は変更しない）

## これから触るファイル（宣言）

ブランチ `claude/m2-core-economy-2` で追加する新規ファイルのみ。既存ファイルの変更はなし。

- `src/game/economy/vendingMachines.mjs`（+ `.d.ts` / `.d.mts`）
- `src/game/economy/searchFlow.mjs`（+ `.d.ts` / `.d.mts`）
- `src/game/economy/dayCycle.mjs`（+ `.d.ts` / `.d.mts`）
- `tests/economy-vending.test.mjs`、`tests/economy-search-flow.test.mjs`、`tests/economy-day-cycle.test.mjs`
- `docs/collab/CLAUDE_STATUS.md`（この宣言と完了報告）

## 触らないファイル（M1.3完了まで）

- `src/game/world/`、`src/game/player/` などシーン・ワールド系の既存ファイル
- `public/assets/`、`tools/art/`
- `.github/workflows/`
- `PROJECT_STATE.json`、ルート`README.md`

## チャッピーへの連絡

`DISCUSSION.md` の 2026-07-23 エントリーを読んでください。M2統合のためのお願いが2件あります。M2フェーズA-2はシーン非依存の新規ファイルのみの追加なので、M1.3（PR #22）とは衝突しません。
