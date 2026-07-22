# ぼくの自販機

**人生で一番バカで、一番楽しい夏休み。**

『ぼくの自販機』は、8月1日から8月31日まで夏の町を歩き回り、自販機の下やお釣り返却口を調べてお金を集め、ゲームショップで毎日3本だけ入荷するゲームソフトを買い集めるスマホ横画面向け探索RPGです。自販機探索、お手伝い、都市伝説、プレゼント、プール、バス、埋蔵金探しなど、すべての遊びが「ゲームソフトを何本買えたか」という一つの評価につながります。

- GitHub: https://github.com/nodako1/BokuNoJihanki
- Production: https://boku-no-jihanki.vercel.app
- 対象: スマートフォン横画面／PC確認
- 技術: React 19、TypeScript、Vite、Phaser 4.2.1、Web Audio API、Playwright、Vercel

## 現在の状態

バージョン`0.1.0`、マイルストーン**M1.1 ビジュアル完成対応は完了・Production実ブラウザー確認済み**です。M1の移動・カメラ・衝突・ストリーミング・時間帯・環境音を維持したまま、機能確認用だった簡易画面を、高密度な住宅街・公園・主人公・時間帯演出を持つ実ゲーム画面へ刷新しました。

- M1.1実装Pull Request: `#12`
- M1.1実装マージコミット: `8b9e4c2b77cb65750ae4b74ba14695636241269f`
- Production検証Pull Request: `#13`
- Production確認済みコミット: `f06f5ef138d8871d7768103591ecf88dcd846626`
- Vercel status: `success`
- Production Smoke: `success`
- Production Browser Smoke: `success`
- Production初期座標: `650,590`
- Production公園内部座標: `3180,590`
- pageerror / failed request: `0 / 0`
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

- 住宅街西・東、公園西・東の4チャンクを高密度な背景・小物・前景へ刷新
- 住宅4種、樹木3種、生垣、低木、花壇、木製・金属製フェンス
- 電柱、電線、街灯、道路反射鏡、郵便受け、自転車、架空自販機
- 公園看板、入口ゲート、ベンチ、滑り台、ブランコ、砂場、ごみ箱
- 主人公の上下左右と歩行差分、左移動時の左横顔、右移動時の右横顔
- 地面、背景、建物・樹木、小物、前景、影、光を分離したレイヤー構造
- 住宅街と公園の境界を道路・歩道から園路へ連続的に変化させる構成
- 朝・昼・夕方・夜の色温度、雲影、光線、窓明かり、街灯、自販機照明、夜の粒子
- 通常プレイを邪魔しない簡略HUDと、必要時だけ開く開発ツールドロワー

すべてプロジェクト専用のオリジナルSVGです。承認済み資料そのものを背景画像として貼り付けず、実際に歩けるレイヤー化マップとして再構築しています。

## 実画面検証

ProductionをPlaywright Chromiumで実際に操作し、次の証跡をGitHub Actions Artifactへ保存しています。

- タイトル画面
- 朝6:00の住宅街
- 昼12:00の住宅街
- 夕方18:00の住宅街
- 夜21:00の住宅街
- 朝6:00の公園内部
- 状態JSON
- ブラウザーコンソールログ
- Playwright trace

Headless Chromiumはsoftware WebGLと画面取得を使用するため8〜10 FPSでした。これは端末性能の絶対値ではなく、正式公開前に代表的なiPhone・Android実機で操作感、発熱、メモリを確認します。

## 資料画像との差

承認済み資料の密度、暖かさ、斜め道路、植栽、生活小物、前景による奥行き、時間帯差を取り入れました。現在の実装はプロジェクト独自のテクスチャ付きSVG表現であり、資料側のラスターペイントにある微細な筆致や素材感を完全には複製していません。将来M8で、現在の構図・衝突・Yソート・チャンク構造を維持したまま、必要に応じてラスターペイント素材へ置き換えます。

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

Node.js 22を使用します。必須のユーザー設定環境変数はありません。Vercelでは`VERCEL_GIT_COMMIT_SHA`をビルド表示へ利用します。

## アーキテクチャ

Reactはタイトル、HUD、仮想スティック、画面方向ガードを担当し、Phaserはマップ、主人公、カメラ、ストリーミング、描画を担当します。`gameBridge.ts`で両者を疎結合に接続します。

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
      m11VisualAssets.ts
  ui/VirtualJoystick.tsx, GameHud.tsx, DeveloperHud.tsx
scripts/browser-smoke.mjs
tests/
docs/
```

詳細は[アーキテクチャ](docs/ARCHITECTURE.md)、[M1仕様](docs/specs/M1.md)、[M1.1仕様](docs/specs/M1_1_VISUAL.md)、[アート方針](docs/ART_DIRECTION.md)、[素材来歴](docs/ASSET_PROVENANCE.md)、[音声方針](docs/AUDIO_GUIDE.md)を参照してください。

## 開発ルール Ver.2.2

1. Featureブランチで実装し、`npm ci`と`npm run check`を通す。
2. PRの本番ビルドをPlaywright Chromiumで起動し、描画・FPS・座標・チャンク・実移動・pageerrorを確認する。
3. ビジュアル変更では、朝・昼・夕方・夜・主要エリアの実スクリーンショットを取得し、承認済み基準画像と比較する。
4. 機能が動くだけ、素材数が増えただけ、VercelがReadyになっただけでは完了としない。
5. 品質確認後はユーザーの手動マージを待たずmainへマージする。
6. Vercel Previewは通常の確認工程に使用しない。
7. mainマージ後、Vercel Productionへ同じ実ブラウザーテストを実行する。
8. 実画面、ログ、状態JSON、Playwright traceをActions Artifactへ保存する。
9. 画像・BGM・効果音は原則オリジナルとし、来歴を記録する。
10. 機能・仕様・ルール変更時はREADME、`PROJECT_STATE.json`、関連文書を同時更新する。

詳細は[開発ルール](docs/DEVELOPMENT_RULES.md)、[テスト](docs/TESTING.md)、[デプロイ](docs/DEPLOYMENT.md)を参照してください。

## ロードマップ

- M0: 開発基盤 — 完了
- M1: 町を歩く機能基盤 — 完了
- M1.1: 高密度な住宅街・公園、主人公刷新、時間帯演出、ビジュアル証跡 — 完了・Production確認済み
- M2: 自販機探索、所持金、15分経過、固定乱数、当日状態、ローカルセーブ基盤
- M3: 1日の開始・終了、ゲームショップ、3本在庫、日記、複数日
- M4以降: 南北エリア、バス、埋蔵金、NPC、イベント、31日、エンディング

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
9. 最新のProduction Browser Evidence Artifact

記述と実コードが違う場合は、実コード、main、Actions、Productionを優先し、文書を修正します。
