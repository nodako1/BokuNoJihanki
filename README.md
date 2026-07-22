# ぼくの自販機

**人生で一番バカで、一番楽しい夏休み。**

『ぼくの自販機』は、8月1日から8月31日まで夏の町を歩き回り、自販機の下やお釣り返却口を調べてお金を集め、ゲームショップで毎日3本だけ入荷するゲームソフトを買い集めるスマホ横画面向け探索RPGです。

- GitHub: https://github.com/nodako1/BokuNoJihanki
- Production: https://boku-no-jihanki.vercel.app
- 対象: スマートフォン横画面／PC確認
- 技術: React 19、TypeScript、Vite、Phaser 4.2.1、Web Audio API、Playwright、Vercel

## 現在の状態

バージョン`0.1.0`、現在のマイルストーンは**M1.2 ペインターリー高精細アートパイプライン**です。M1.1はProduction確認済みですが、ユーザーが承認したコンセプト画像と実画面の質感差を解消するため、M2より先にM1.2を実施しています。

M1.2では、承認済み画像を単なる説明資料や固定UI付きスクリーンショットとして貼り付けず、プレゼンテーション用UIと仮プレイヤーを除去したプロジェクト専用マスターから、以下を再生成します。

- 住宅街西・東、公園西・東の1280×720ラスターチャンク
- 朝・昼・夕方・夜の4時間帯差分
- プレイヤーが背後へ入れる透過前景レイヤー
- 4方向のラスタープレイヤー
- ストリーミング、衝突、Yソートと分離したアセット定義

作業ブランチは`feat/m1-2-painterly-raster`、Pull Requestは`#16`です。現時点のProduction確認済みコードはM1.1の`f06f5ef138d8871d7768103591ecf88dcd846626`です。M1.2はQuality、Browser Smoke、mainマージ、Production Smoke、Production Browser Smoke後に完了へ確定します。

## 維持するゲーム基盤

- 主人公の4方向移動、仮想スティック、WASD・矢印キー
- 滑らかな追従カメラ、マップ外移動防止
- 住宅街2チャンク、公園2チャンクの先読み・解放
- 衝突判定と接地点基準のYソート
- 住宅街から公園までロード画面なしの移動
- 朝6:00〜夜21:00の時間帯変化
- 住宅街／公園の環境音と地面別足音
- セーフエリア、縦向きガード、開発HUD

## M1.2アートパイプライン

承認済みコンセプト画像は本プロジェクト用に生成されたアート基準です。`tools/art/generate_m12_assets.py`が、チェックインしたbase64分割マスターからUI除去、仮プレイヤー除去、時間帯グレーディング、透過前景、ラスタープレイヤー、WebP最適化を再現可能な形で実行します。生成物は`public/assets/images/m12/`へ保存します。

4チャンクは、承認済みシーンとその鏡像を交互に配置して境界ピクセルを一致させます。M1.2では世界観の基準を確立し、駅前・商店街・海・山などの追加エリアは同じカメラ・画材・光方向で別マスターを制作します。

## 未実装

所持金、自販機探索、お金の抽選、15分行動消費、日付変更、NPC、会話、イベント、ゲームショップ、インベントリ、セーブ、エンディング。M1.2完了後にM2「自販機探索と所持金」へ進みます。

## 操作

- スマホ: 画面左下の仮想スティック
- PC: `WASD`または矢印キー
- 右上: 音声、時間再生、開発ツール
- 開発ツール: 時刻+15分、朝へ戻す、HUD、当たり判定

## 開発コマンド

```bash
npm ci
npm run validate
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm run dev
npm run preview
```

Node.js 22を使用します。M1.2画像を再生成する場合はPython 3.12、Pillow、OpenCV、CairoSVGが必要です。GitHub Actionsの`Generate M1.2 Raster Assets`が生成とコミットを自動化します。

## 開発ルール Ver.2.3

1. README、PROJECT_STATE、設計書、main、PR、Actions、Productionを照合する。
2. Featureブランチで実装し、Previewは通常確認に使わない。
3. `npm ci`と`npm run check`を通す。
4. ビジュアル変更は、PRとProductionの朝・昼・夕方・夜・主要エリアを実ブラウザーで撮影する。
5. コンセプト画像と実画面を並べて差を確認し、モックアップを完成証跡として使わない。
6. 品質成功後はユーザーの手動マージを待たずmainへマージする。
7. Vercel ReadyだけでなくProduction SmokeとProduction Browser Smokeを成功させる。
8. 画像・音声はプロジェクト専用とし、生成元と加工工程を記録する。

詳細は[開発ルール](docs/DEVELOPMENT_RULES.md)、[M1.2仕様](docs/specs/M1_2_PAINTERLY.md)、[アート方針](docs/ART_DIRECTION.md)、[ロードマップ](docs/ROADMAP.md)を参照してください。
