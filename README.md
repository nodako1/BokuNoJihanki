# ぼくの自販機

**人生で一番バカで、一番楽しい夏休み。**

8月1日から31日まで夏の町を歩き、自販機周辺でお金を集め、毎日3本だけ入荷するゲームソフトを買い集めるスマートフォン横画面向け探索RPGです。

- GitHub: https://github.com/nodako1/BokuNoJihanki
- Production: https://boku-no-jihanki.vercel.app
- 技術: React 19、TypeScript、Vite、Phaser 4.2.1、Web Audio API、Playwright、Vercel

## 現在の状態

バージョン`0.1.0`、current milestoneは **M1.5 実機品質修正版（必須・再構築中）**です。

M1.4の2D横スクロール基盤は正常にProduction配信され、その履歴は保持します。一方、後続のユーザー実iPhone確認で主人公、接地、上下導線、遷移パネル、BGMの品質問題が確認されたため、M1全体の完成判定を再オープンしました。M1.5完了までM2 Scene統合とopen PR #31は停止します。

### M1.4 Production確認履歴

- 実装Pull Request: `#32`
- 実装PR最終head: `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`
- M1.4実装Production commit: `147f770a4b73077c4e5dc0523839b3fefb789db4`
- 現main／Production baseline: `29223ee31fd4fc4fbca21a37b01fe89277279647`
- Vercel／Quality／Production Smoke／Production Browser Smoke: `success`
- Production Browser Smoke: 15画面、3エリア、5遷移、全invariant成功
- `pageerror`: `0`、failed request: `0`
- 公開URL: https://boku-no-jihanki.vercel.app
- 詳細証跡: [M1.4 Production Evidence](docs/evidence/M1_4_PRODUCTION_EVIDENCE.md)

M1.4の成功結果は配信履歴であり、M1.5 candidateの合格証跡には流用しません。

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

M1.5は、local検証 → remote PR headと同一完全SHAのVercel Preview → CI・くーちゃんcandidate QA・リダ君Evidence監査 → ユーザー実iPhoneの5項目承認 → main merge → 同一merge SHAのProduction確認、の順で進めます。承認後にコードまたは素材が変わった場合は、新しいPreview SHAで承認を取り直します。

詳細は[M1.5 実機品質修正版仕様](docs/specs/M1_5_POLISH.md)を正とします。

## 開発ルール Ver.2.4

1. Featureブランチで実装し、Production確認前に完了としない。
2. `npm run check`とPR Browser Smokeを通す。
3. 3エリアを独立した横長ワールドとして扱い、巨大な連結画像にしない。
4. 主人公は静止画切替ではなくフレーム式アニメーションを必須とする。
5. シームレス性よりエリア単位の完成度を優先する。
6. 必須のmain前gateを満たした後だけマージし、Vercel、Production Smoke、Production Browser Smoke、実画面を確認する。
7. モックアップを完成証跡として使わない。

詳細: [M1.4仕様](docs/specs/M1_4_SIDE_SCROLL_TOWN.md) / [M1.5 polish](docs/specs/M1_5_POLISH.md) / [M1.3仕様](docs/specs/M1_3_RESIDENTIAL_VERTICAL_SLICE.md) / [アーキテクチャ](docs/ARCHITECTURE.md) / [開発ルール](docs/DEVELOPMENT_RULES.md) / [テスト](docs/TESTING.md) / [デプロイ](docs/DEPLOYMENT.md) / [ロードマップ](docs/ROADMAP.md)
