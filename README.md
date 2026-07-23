# ぼくの自販機

**人生で一番バカで、一番楽しい夏休み。**

8月1日から31日まで夏の町を歩き、自販機周辺でお金を集め、毎日3本だけ入荷するゲームソフトを買い集めるスマートフォン横画面向け探索RPGです。

- GitHub: https://github.com/nodako1/BokuNoJihanki
- Production: https://boku-no-jihanki.vercel.app
- 技術: React 19、TypeScript、Vite、Phaser 4.2.1、Web Audio API、Playwright、Vercel

## 現在の状態

バージョン`0.1.0`、マイルストーン **M1.3 住宅街プレイアブル縦切り再構築（実装中）**です。

M1.2の高精細ペインタリー背景はProduction確認済みですが、背景と当たり判定が独立し、主人公が画像上を滑って見える問題がありました。M1.3では住宅街だけに範囲を絞り、背景・歩行ルート・衝突・主人公アニメーション・カメラを一体設計します。

### M1.3の方針

- 横スクロール中心、上下は限定奥行きのベルトスクロール型2.5D
- Tiled互換JSONのwalkableポリゴン
- 家、庭、屋根、塀、柵はwalkable外
- 道路内の電柱、自販機、標識だけをobstacleポリゴン化
- 最大4pxのサブステップと壁沿いスライド
- 4方向×8歩行フレーム＋4方向待機のTexture Atlas
- 足の接地フレームと足音同期
- 住宅街4区間、全長5,120px
- 公園内部はいったんプレイ可能範囲から外す
- エリア間は必要に応じて暗転・ロードを使い、完成度を優先

## 操作

- スマホ: 左下の仮想スティック
- PC: `WASD`または矢印キー
- 開発ツール: 時刻、HUD、walkable／obstacleデバッグ表示

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

M1.3画像を再生成する場合はPython 3.12、Pillow、OpenCVが必要です。

## 開発ルール Ver.2.4

1. Featureブランチで実装し、Production確認前に完了としない。
2. `npm run check`とPR Browser Smokeを通す。
3. ビジュアル背景とwalkable／obstacleを同時設計する。
4. 主人公は静止画切替ではなくフレーム式アニメーションを必須とする。
5. シームレス性よりエリア単位の完成度を優先する。
6. mainマージ後にVercel、Production Smoke、Production Browser Smoke、実画面を確認する。
7. モックアップを完成証跡として使わない。

詳細: [M1.3仕様](docs/specs/M1_3_RESIDENTIAL_VERTICAL_SLICE.md) / [アーキテクチャ](docs/ARCHITECTURE.md) / [開発ルール](docs/DEVELOPMENT_RULES.md) / [テスト](docs/TESTING.md) / [ロードマップ](docs/ROADMAP.md)
