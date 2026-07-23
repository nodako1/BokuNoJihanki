# ぼくの自販機

**人生で一番バカで、一番楽しい夏休み。**

『ぼくの自販機』は、8月1日から8月31日まで夏の町を歩き回り、自販機の下やお釣り返却口を調べてお金を集め、ゲームショップで毎日3本だけ入荷するゲームソフトを買い集めるスマホ横画面向け探索RPGです。

- GitHub: https://github.com/nodako1/BokuNoJihanki
- Production: https://boku-no-jihanki.vercel.app
- 対象: スマートフォン横画面／PC確認
- 技術: React 19、TypeScript、Vite、Phaser 4.2.1、Web Audio API、Playwright、Vercel

## 現在の状態

バージョン`0.1.0`、マイルストーン **M1.2 ペインターリー高精細アートパイプライン 完了・Production実ブラウザー確認済み**です。

M1で完成した移動、衝突、Yソート、ストリーミング、時間帯、環境音を維持し、M1.1のコード生成SVG版を、承認済みコンセプト画像を基準にした高精細WebP背景、透過前景、時間帯差分、ラスタープレイヤーへ置き換えました。

- M1.2実装Pull Request: `#16`
- M1.2実装マージ: `ecc77aa9ec2801a89e1d28edfd48d981f4de2665`
- Production検証修正Pull Request: `#17`、`#18`
- Production確認済みコミット: `ddfba1f87835ed2c804fbd7f7cdadaaa38936e46`
- Vercel: `success`
- Production Smoke: `success`
- Production Browser Smoke: `success`
- Production Browser Evidence run: `29967805451`
- 初期座標: `650,550`
- 公園内部座標: `3158,550`
- pageerror: `0`
- failed request: `0`
- 状態: `completed-production-verified`
- 次のマイルストーン: **M2 自販機探索と所持金**

## M1.2で実装した内容

- `residential-west`、`residential-east`、`park-west`、`park-east`の4チャンク
- 各チャンクの朝・昼・夕方・夜の高精細WebP背景
- 屋根、植栽などをプレイヤーより前へ描画する透過前景
- 上下左右4方向、各2フレームのラスタープレイヤー
- 背景と独立した衝突判定、接地点基準Yソート、チャンク先読み・解放
- 住宅街から「なつかぜ公園」までロード画面なしの移動
- 時刻に連動した光、色温度、夜間発光
- 承認済みマスターから決定論的に素材を再生成するPythonパイプライン
- Productionの朝、昼、夕方、夜、公園内部の実画面証跡

承認済みコンセプト画像をUIごと一枚貼り付けたものではありません。背景、前景、主人公、時間帯、衝突、ストリーミングを分離し、実際に歩けるゲーム画面として再構築しています。

## 維持しているゲーム基盤

- 主人公の4方向移動、仮想スティック、WASD・矢印キー
- 滑らかな追従カメラ、マップ外移動防止
- 住宅街2チャンク、公園2チャンクの先読み・解放
- 衝突判定と接地点基準のYソート
- 朝6:00〜夜21:00の時間帯変化
- 住宅街／公園の環境音と地面別足音
- セーフエリア、縦向きガード、開発HUD
- Quality、Production Smoke、Browser Smoke、Visual Evidence

## アートパイプライン

`tools/art/generate_m12_assets.py`が、`tools/art/reference/parts/`に分割保存したプロジェクト専用マスターから、UI除去、仮プレイヤー除去、1280×720変換、鏡像チャンク、4時間帯、透過前景、ラスタープレイヤー、WebP最適化を再現可能な形で実行します。生成物は`public/assets/images/m12/`へ保存します。

現在の4チャンクは、承認済みシーンと鏡像を交互に使って境界の連続性を確保しています。駅前、商店街、学校、海、山などには、同じカメラ、画材、光方向で独立したマスターペイントを制作します。

## 既知の課題

- 右・左・上向きの主人公は背景や後ろ向き主人公より描き込みが簡略で、キャラクター本番工程で高精細化が必要です。
- 4チャンクは同一マスターと鏡像を利用しています。追加エリアでは専用マスターが必要です。
- Headless Chromiumはsoftware WebGL、trace、連続撮影のため9〜11 FPSでした。代表的なiPhone／Android実機で操作感、発熱、メモリを確認する必要があります。
- iOS Safariでは画面方向を完全固定できないため、縦向き案内を維持します。

## 未実装

所持金、自販機探索、お金の抽選、15分行動消費、日付変更、NPC、会話、イベント、ゲームショップ、インベントリ、セーブ、エンディング。次のM2では「自販機を見つけ、調べ、結果を確認し、15分と所持金が動く」中心体験を実装します。

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

Node.js 22を使用します。M1.2画像を再生成する場合はPython 3.12、Pillow、OpenCV、CairoSVGが必要です。

## 開発ルール Ver.2.3

1. README、PROJECT_STATE、設計書、main、PR、Actions、Productionを照合する。
2. Featureブランチで実装し、Previewは通常確認に使わない。
3. `npm ci`と`npm run check`を通す。
4. ビジュアル変更は、PRとProductionの朝・昼・夕方・夜・主要エリアを実ブラウザーで撮影する。
5. コンセプト画像と実画面を比較し、モックアップを完成証跡として使わない。
6. 品質成功後はユーザーの手動マージを待たずmainへマージする。
7. Vercel ReadyだけでなくProduction SmokeとProduction Browser Smokeを成功させる。
8. 画像・音声はプロジェクト専用とし、生成元と加工工程を記録する。

詳細は[開発ルール](docs/DEVELOPMENT_RULES.md)、[M1.2仕様](docs/specs/M1_2_PAINTERLY.md)、[アート方針](docs/ART_DIRECTION.md)、[テスト](docs/TESTING.md)、[デプロイ](docs/DEPLOYMENT.md)、[ロードマップ](docs/ROADMAP.md)を参照してください。
