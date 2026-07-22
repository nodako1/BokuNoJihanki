# ぼくの自販機

**人生で一番バカで、一番楽しい夏休み。**

『ぼくの自販機』は、8月1日から8月31日まで夏の町を歩き回り、自販機の下やお釣り返却口を調べてお金を集め、ゲームショップで毎日3本だけ入荷するゲームソフトを買い集めるスマホ横画面向け探索RPGです。

- GitHub: https://github.com/nodako1/BokuNoJihanki
- Production: https://boku-no-jihanki.vercel.app
- 対象: スマートフォン横画面／PC確認
- 技術: React 19、TypeScript、Vite、Phaser 4.2.1、Web Audio API、Playwright、Vercel

## 現在の状態

バージョン`0.1.0`、マイルストーン **M1.1 高密度ベクター2.5Dビジュアル対応 完了・Production実ブラウザー確認済み**です。

M1で完成した移動・カメラ・衝突・ストリーミング・Yソート・時間帯・環境音を維持したまま、住宅街、公園、主人公、生活小物、時間帯演出をテクスチャ付きオリジナルSVGとレイヤー構造で刷新しました。

- M1.1実装Pull Request: `#12`
- M1.1実装マージ: `8b9e4c2b77cb65750ae4b74ba14695636241269f`
- Production検証更新Pull Request: `#13`
- Production確認済みコミット: `f06f5ef138d8871d7768103591ecf88dcd846626`
- Vercel: `success`
- Production Smoke: `success`
- Production Browser Smoke: `success`
- Production Browser Evidence run: `29915997279`
- 初期座標: `650,590`
- 公園内部座標: `3180,590`
- pageerror: `0`
- failed request: `0`
- 状態: `completed-production-verified`
- 次のマイルストーン: **M2 自販機探索と所持金**

## M1／M1.1実装済み

### ゲーム基盤

- 主人公の4方向移動、待機・歩行差分、斜め速度正規化
- スマホ用仮想スティック、WASD・矢印キー、共通入力インターフェース
- 滑らかな追従カメラ、マップ外移動防止
- 住宅街2チャンク、公園2チャンク、隣接・進行方向先読み、遠方解放
- 建物、木、植え込み、電柱、街灯、柵、ベンチ、公園設備、自販機の衝突判定
- 接地点基準のYソートによる2.5D表示
- 住宅街から公園までロード画面なしで移動
- 住宅街／公園の環境音クロスフェード、時刻連動、地面別の足音
- セーフエリア、縦向きガード、スクロール・ズーム誤操作防止
- FPS、座標、チャンク、入力、時間、ビルドを表示する開発HUD

### M1.1ビジュアル

- 住宅街西・東、公園西・東の高密度な4チャンク背景
- 住宅4種、樹木3種、生垣、低木、花壇、木製・金属製フェンス
- 電柱、電線、街灯、道路反射鏡、郵便受け、自転車、自販機
- 公園看板、入口ゲート、ベンチ、滑り台、ブランコ、砂場、ごみ箱
- 主人公の上下左右と歩行差分、左移動時の左横顔、右移動時の右横顔
- 地面、背景、建物・樹木、小物、前景、影、光を分離したレイヤー構造
- 住宅街と公園の境界を、道路・歩道から園路へ連続的に変化させる構成
- 朝・昼・夕方・夜の色温度、雲影、光線、窓明かり、街灯、自販機照明、夜の粒子
- 通常プレイを邪魔しない簡略HUDと、必要時だけ開く開発ツールドロワー

すべてプロジェクト専用のオリジナルSVGです。承認済み資料そのものを背景画像として貼り付けず、実際に歩けるレイヤー化マップとして再構築しています。

## 承認済みコンセプト画像との差

現在のM1.1は、高密度なベクター2.5D版としてProductionへ反映済みです。一方、承認済みコンセプト画像にあるラスターペイント特有の葉・瓦・壁・路面の微細な筆致、空気遠近、複雑な光の回り込みまでは再現していません。

コンセプト画像にさらに近い品質は技術的に実現可能ですが、現在のコード生成SVGを細かくするだけでは不十分です。地面、建物、樹木、小物、前景、影、発光を分離した高解像度ラスターペイント、または固定カメラのプリレンダー3Dアセットを制作し、スプライトアトラスとしてPhaserへ組み込む追加パイプラインが必要です。詳細は[ロードマップのM1.2](docs/ROADMAP.md)を参照してください。

## 未実装

所持金、自販機探索、お金の抽選、15分行動消費、日付変更、NPC、会話、イベント、ゲームショップ、インベントリ、セーブ、エンディング。M2では「自販機を見つけ、調べ、結果を確認し、15分とお金が動く」中心体験を実装します。

## 操作

- スマホ: 画面左下の仮想スティック
- PC: `WASD`または矢印キー
- 右上: 音声、時間再生、開発ツール
- 開発ツール: 時刻+15分、朝へ戻す、HUD、当たり判定
- 住宅街を右へ進むと、ロード画面なしで「なつかぜ公園」へ入ります。

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

Node.js 22を使用します。環境変数は必須ではありません。Vercelでは`VERCEL_GIT_COMMIT_SHA`をビルド表示へ利用します。

## アーキテクチャ

Reactはタイトル、HUD、仮想スティック、画面方向ガードを担当し、Phaserはマップ、主人公、カメラ、ストリーミング、Yソート、時間帯描画を担当します。`gameBridge.ts`で両者を疎結合に接続します。

```text
src/
  game/
    scenes/ExplorationScene.ts
    systems/inputSystem.ts, audioEngine.ts, timeOfDay.ts, worldMath.mjs
    world/
      AtmosphereLayer.ts
      MapStreamer.ts
      worldConfig.ts
      m11AssetFactory.ts
      m11BackgroundAssets.ts
      m11PropAssets.ts
      m11PlayerAssets.ts
  ui/VirtualJoystick.tsx, GameHud.tsx, DeveloperHud.tsx
scripts/browser-smoke.mjs
tests/
docs/
```

詳細は[アーキテクチャ](docs/ARCHITECTURE.md)、[M1.1仕様](docs/specs/M1_1_VISUAL.md)、[アート方針](docs/ART_DIRECTION.md)、[素材来歴](docs/ASSET_PROVENANCE.md)、[テスト](docs/TESTING.md)、[デプロイ](docs/DEPLOYMENT.md)を参照してください。

## 開発ルール Ver.2.2

1. 作業開始時にREADME、`PROJECT_STATE.json`、開発ルール、ロードマップ、main、PR、Actions、Vercel Productionを確認する。
2. Featureブランチで実装する。
3. `npm ci`と`npm run check`を通す。
4. PRの本番ビルドをPlaywright Chromiumで起動し、画面描画・FPS・座標・チャンク・主要導線・pageerrorを確認する。
5. ビジュアル変更では、朝・昼・夕方・夜・主要エリアの実画面を取得し、基準画像との差を確認する。
6. 品質確認後はユーザーの手動マージを待たずmainへマージする。
7. Vercel Previewは通常の確認工程に使用しない。
8. mainマージ後、Vercel ProductionへProduction SmokeとBrowser Smokeを実行する。
9. Vercel ReadyやJavaScript文字列検査だけでは完了としない。
10. 説明資料のモックアップをProduction実画面として扱わない。
11. スクリーンショット、ログ、状態JSON、Playwright traceをActions artifactへ保存する。
12. 機能・仕様・ルール変更時はREADME、`PROJECT_STATE.json`、関連文書を同時更新する。

詳細は[開発ルール](docs/DEVELOPMENT_RULES.md)を参照してください。

## ロードマップ

- M0: 開発基盤 — 完了
- M1: 移動・住宅街・公園・ストリーミング — 完了
- M1.1: 高密度ベクター2.5Dビジュアル — 完了・Production確認済み
- M1.2: ペインターリー高精細アートパイプライン — 任意・正式公開前推奨
- M2: 自販機探索、所持金、15分経過、固定乱数、当日状態、ローカルセーブ基盤
- M3以降: 1日、ゲームショップ、全エリア、NPC、イベント、31日、エンディング

詳細は[ロードマップ](docs/ROADMAP.md)と[`PROJECT_STATE.json`](PROJECT_STATE.json)を参照してください。

## 新しいチャットでの再開手順

1. `README.md`
2. `PROJECT_STATE.json`
3. `docs/DEVELOPMENT_RULES.md`
4. `docs/ROADMAP.md`
5. mainの最新コミット
6. オープンPR
7. 最新GitHub Actions
8. Vercel Productionの対象コミット
9. 最新のBrowser Smoke artifactにあるスクリーンショット・ログ・trace

記述と実コードが違う場合は、実コード、main、Actions、Productionを優先し、文書を修正します。
