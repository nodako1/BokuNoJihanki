# ぼくの自販機

**人生で一番バカで、一番楽しい夏休み。**

『ぼくの自販機』は、8月1日から8月31日まで夏の町を歩き回り、自販機の下やお釣り返却口を調べてお金を集め、ゲームショップで毎日3本だけ入荷するゲームソフトを買い集めるスマホ横画面向け探索RPGです。自販機探索、お手伝い、都市伝説、プレゼント、プール、バス、埋蔵金探しなど、すべての遊びが「ゲームソフトを何本買えたか」という一つの評価につながります。

- GitHub: https://github.com/nodako1/BokuNoJihanki
- Production: https://boku-no-jihanki.vercel.app
- 対象: スマートフォン横画面／PC確認
- 技術: React 19、TypeScript、Vite、Phaser 4.2.1、Web Audio API、Vercel

## 現在の状態

バージョン `0.1.0`、マイルストーン **M1のランタイム修正・Production確認中**です。静的な型チェック、Lint、テスト、ビルド、公開バンドルの文字列検査は成功していましたが、実際にProductionで「夏休みを始める」を押すと、UIだけが表示されてPhaser Canvasが黒いままになる重大な回帰が判明しました。

原因は、コード内のオリジナルSVGをpercent-encoded Data URIとしてPhaserへ渡した際、Phaser 4.2.1のローダーがペイロードをbase64として復号し、`InvalidCharacterError`でScene起動前に停止していたことです。SVGをUTF-8対応のbase64 Data URIへ変換する修正をmainへ反映し、ローカル本番ビルドをChromiumで起動して、描画、FPS、初期チャンク、キーボード移動まで確認するブラウザースモークを追加しました。

- 現在Productionに記録されているコミット: `a169757a823e4ad19205072ab3ea1fc8651547aa`（黒画面のためM1完了判定には使用しない）
- 黒画面修正マージコミット: `28b7ab6454d523d8ba4c4572e5c940356d8a5513`
- 修正状態: `runtime-fix-awaiting-production-verification`
- 現在の阻害要因: Vercel Hobbyの一時的なbuild rate limit
- 完了条件: 修正コミットをVercelへ反映し、実ブラウザーのProduction検査を成功させること
- 次のマイルストーン: **M2 自販機探索と所持金**（M1のProduction再確認後に開始）

### M1実装済み

- 主人公の4方向移動、待機・歩行差分、斜め速度正規化
- スマホ用仮想スティック、WASD・矢印キー、共通入力インターフェース
- 滑らかな追従カメラ、マップ外移動防止
- 住宅街2チャンク、公園2チャンク、隣接・進行方向先読み、遠方解放
- 建物、木、植え込み、電柱、街灯、柵、ベンチ、公園設備、自販機の衝突判定
- 接地点基準のYソートによる2.5D表示
- 朝6:00〜夏祭りの夜21:00の空、光、影、窓、街灯、自販機照明の連続変化
- 住宅街／公園の環境音クロスフェード、時刻連動、地面別の足音
- セーフエリア、縦向きガード、スクロール・ズーム誤操作防止
- FPS、座標、チャンク、入力、時間、ビルドを表示する開発HUD
- ゲーム専用のオリジナルSVGアセット
- オリジナルSVGを安全に読み込むUTF-8 base64 Data URI変換
- Chromiumで開始、描画、入力、JavaScript例外を検査する`Browser Smoke`
- Vercel Productionを実際に起動・操作して検査するProduction向けブラウザースモーク

### 未実装

所持金、自販機探索、お金の抽選、15分行動消費、日付変更、NPC、会話、イベント、ゲームショップ、インベントリ、セーブ、エンディング。次のM2では「自販機を見つけ、調べ、結果を確認し、15分とお金が動く」中心体験を実装します。

## 操作

- スマホ: 画面左下の仮想スティック
- PC: `WASD`または矢印キー
- M1開発操作: 時刻+15分、自動時間停止／再生、朝へ戻す、HUD表示、当たり判定表示、音声ON/OFF
- 住宅街の道路を右へ進むと、ロード画面なしで公園へ入ります。

## 開発コマンド

```bash
npm ci
npm run dev
npm run validate
npm run typecheck
npm run lint
npm test
npm run build
npm run check
npm run preview
```

Node.js 22を使用します。環境変数は必須ではありません。Vercelでは`VERCEL_GIT_COMMIT_SHA`をビルド表示へ利用します。ブラウザースモークはGitHub ActionsでPlaywright Chromiumを一時導入し、`scripts/browser-smoke.mjs`を実行します。

## アーキテクチャ

Reactはタイトル、HUD、仮想スティック、画面方向ガードを担当し、Phaserはマップ、主人公、カメラ、ストリーミング、描画を担当します。`gameBridge.ts`で両者を疎結合に接続します。

```text
src/
  game/
    scenes/ExplorationScene.ts
    systems/inputSystem.ts, audioEngine.ts, timeOfDay.ts, worldMath.mjs
    world/AtmosphereLayer.ts, MapStreamer.ts, worldConfig.ts
  ui/VirtualJoystick.tsx, GameHud.tsx, DeveloperHud.tsx
src/game/world/generatedAssets.ts  # 統一済みオリジナルSVGをコード内管理
scripts/validate-project.mjs       # 構成・運用ルール検証
scripts/browser-smoke.mjs          # Chromium実起動・操作検証
tests/                             # Node標準テスト
docs/                              # 仕様・運用・引き継ぎ
```

詳細は[アーキテクチャ](docs/ARCHITECTURE.md)、[M1仕様](docs/specs/M1.md)、[アート方針](docs/ART_DIRECTION.md)、[音声方針](docs/AUDIO_GUIDE.md)を参照してください。

## 開発ルール Ver.2.0

1. 作業開始時にREADME、`PROJECT_STATE.json`、開発ルール、ロードマップ、main、PR、Actions、Vercel Productionを確認する。
2. Featureブランチで実装する。
3. `npm ci`と`npm run check`を通す。重大な失敗状態ではmainへ入れない。
4. UIやCanvasを変更するPRでは`Browser Smoke`を通し、ビルド成功だけで起動成功と判断しない。
5. PRを作成し、品質確認後はユーザーの手動マージを待たずmainへマージする。
6. Vercel Previewは通常の確認工程に使用しない。
7. mainマージ後にVercel Productionと実ブラウザーの検査を確認する。
8. 完了報告はProductionで開始・描画・操作が確認できた後のみ行う。
9. 画像・BGM・効果音は原則オリジナルとし、来歴を記録する。
10. 機能・仕様・ルール変更時はREADME、`PROJECT_STATE.json`、関連文書を同時更新する。
11. チャットが変わっても、リポジトリだけで開発を継続できる状態を維持する。

詳細は[開発ルール](docs/DEVELOPMENT_RULES.md)、[テスト](docs/TESTING.md)、[デプロイ](docs/DEPLOYMENT.md)を参照してください。

## Vercel

Production Branchは`main`です。Feature系ブランチのPreviewデプロイは`vercel.json`で停止しています。機能コードをmainへマージすると、Vercel成功後にPlaywright ChromiumでProductionを開き、「夏休みを始める」を押し、FPS、座標、チャンク読み込みを確認し、矢印キーで主人公が移動することを検査します。ページ例外、0 FPS、座標未初期化、期待コミット不一致のいずれかがあれば完了としません。

JavaScriptバンドルに文字列が含まれているだけでは、M1の完了条件を満たしません。

## ロードマップ

- M0: React＋Phaser、横画面、PWA基盤、時間帯、音声、CI — 完了
- M1: 移動、住宅街・公園、ストリーミング、衝突、2.5D、時間帯連動 — ランタイム修正・Production再確認中
- M2: 自販機探索、所持金、15分経過、固定乱数、当日状態、ローカルセーブ基盤
- M3: 1日の開始・終了、ゲームショップ、3本在庫、日記、複数日
- M4以降: 南北エリア、バス、埋蔵金、NPC、イベント、31日、エンディング

詳細は[ロードマップ](docs/ROADMAP.md)と[`PROJECT_STATE.json`](PROJECT_STATE.json)を参照してください。

## 新しいチャットでの再開手順

最初に次の順で確認してください。

1. `README.md`
2. `PROJECT_STATE.json`
3. `docs/DEVELOPMENT_RULES.md`
4. `docs/ROADMAP.md`
5. mainの最新コミット
6. オープンPR
7. 最新GitHub Actionsの`Quality`と`Browser Smoke`
8. Vercel Productionの対象コミットと実ブラウザー検査

記述と実コードが違う場合は、実コード、main、Actions、Productionを優先し、文書を修正します。
