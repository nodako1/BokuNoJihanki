# ぼくの自販機

**人生で一番バカで、一番楽しい夏休み。**

8月1日から31日まで夏の町を歩き、自販機周辺でお金を集め、毎日3本だけ入荷するゲームソフトを買い集めるスマートフォン横画面向け探索RPGです。

- GitHub: https://github.com/nodako1/BokuNoJihanki
- Production: https://boku-no-jihanki.vercel.app
- 技術: React 19、TypeScript、Vite、Phaser 4.2.1、Web Audio API、Playwright、Vercel

## 現在の状態

バージョン`0.1.0`、マイルストーン **M1.4 2D横スクロール街探索・3エリア遷移基盤（完了・Production確認済み）**です。

M1.4で街探索の正式基盤を高解像度2D横スクロールへ切り替え、左右移動と横方向カメラ、3つの独立エリア、左右端と上下分岐による遷移を統合しました。M1.3の住宅街実装とアセットはフォールバック／設計履歴として保存し、M2の経済コアも変更せず保持しています。M1.4からM2機能はまだSceneへ接続していません。

### Production確認結果

- 実装Pull Request: `#32`
- 実装PR最終head: `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`
- Production確認済みmerge: `147f770a4b73077c4e5dc0523839b3fefb789db4`
- Vercel／Quality／Production Smoke／Production Browser Smoke: `success`
- Production Browser Smoke: 15画面、3エリア、5遷移、全invariant成功
- `pageerror`: `0`、failed request: `0`
- 公開URL: https://boku-no-jihanki.vercel.app
- 詳細証跡: [M1.4 Production Evidence](docs/evidence/M1_4_PRODUCTION_EVIDENCE.md)

### M1.4のプレイ範囲

| エリア | `areaId` | 接続 |
| --- | --- | --- |
| 自宅前 | `home-street` | 右端から生活道路へ |
| 生活道路 | `life-road` | 左端から自宅前へ、中央の上分岐から自販機路地へ |
| 自販機路地 | `upper-vending-lane` | 下分岐から生活道路へ |

- 主人公は左右に歩き、Y座標は各エリアの地面へ固定
- 左右方向の待機／歩行アニメーション、接地同期の足音
- 横方向だけを追従するカメラと進行方向のlook-ahead
- 250〜350msの暗転、地名表示、フェードインを使うエリア遷移
- 朝、昼、夕方、夜の背景と環境音を全エリアで維持
- M1.4では自販機の探索、所持金、時間消費、セーブをまだ統合しない

## 操作

- スマホ: 左下の横方向スティックで左右移動、表示された上／下矢印をタップして分岐
- PC: `A`／`D`または左右矢印で移動、分岐内で`W`／上矢印または`S`／下矢印
- 上下入力は自由移動には使わず、有効な分岐でだけエリア遷移に使う
- 開発ツール: 時刻、M1.4 HUD、エリア／座標／カメラ／遷移状態の確認

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

M1.4画像をソースマスターから再生成する場合は、Python 3.12とPillowを用意して次を実行します。

```bash
python3 tools/art/generate_m14_assets.py
```

M1.3画像を再生成する場合は、従来どおり`python3 tools/art/generate_m13_assets.py`を使用します（Pillow、OpenCVが必要）。

## 検証とProduction反映

1. Node.js 22環境で`npm ci`と`npm run check`を完走する。
2. ローカルpreviewに対して`node scripts/browser-smoke.mjs`を実行し、3エリア往復、分岐、カメラ、アニメーション、時間帯を確認する。
3. PRのQuality、Browser Smoke、Visual Reviewを完了してmainへマージする。
4. Vercel Productionがmainの対象コミットを配信したことを確認する。
5. Production Smoke、Production Browser Smoke、1280×720実画面の目視確認を完了する。

M1.4は上記すべてを完了し、Production確認済みです。代表的なiPhone／Android実機での性能・操作感確認や微調整は、M2を止めない任意工程の[M1.5 polish](docs/specs/M1_5_POLISH.md)として管理します。

## 開発ルール Ver.2.4

1. Featureブランチで実装し、Production確認前に完了としない。
2. `npm run check`とPR Browser Smokeを通す。
3. 3エリアを独立した横長ワールドとして扱い、巨大な連結画像にしない。
4. 主人公は静止画切替ではなくフレーム式アニメーションを必須とする。
5. シームレス性よりエリア単位の完成度を優先する。
6. mainマージ後にVercel、Production Smoke、Production Browser Smoke、実画面を確認する。
7. モックアップを完成証跡として使わない。

詳細: [M1.4仕様](docs/specs/M1_4_SIDE_SCROLL_TOWN.md) / [M1.5 polish](docs/specs/M1_5_POLISH.md) / [M1.3仕様](docs/specs/M1_3_RESIDENTIAL_VERTICAL_SLICE.md) / [アーキテクチャ](docs/ARCHITECTURE.md) / [開発ルール](docs/DEVELOPMENT_RULES.md) / [テスト](docs/TESTING.md) / [デプロイ](docs/DEPLOYMENT.md) / [ロードマップ](docs/ROADMAP.md)
