# アセット来歴

## 方針

第三者ゲーム、実在ブランド、既存キャラクター、外部音声サンプルを使用しません。素材はこのリポジトリ向けに生成し、編集可能な形式と生成ロジックを残します。

## M0

背景と音はPhaser GraphicsおよびWeb Audio APIでプログラム生成。

## M1 — 2026-07-22

`src/game/world/generatedAssets.ts`に格納したSVGは『ぼくの自販機』専用に新規生成しました。`public/assets/images/m1/asset-manifest.json`は識別子と来歴の索引です。

- 主人公: 4方向×2歩行差分
- 住宅: 2種
- 自然: 木、植え込み、花壇
- 街設備: 電柱、街灯、柵、ベンチ、自販機
- 公園: 遊具、看板

BGM、セミ、風、鳥、遠い車、足音は`audioEngine.ts`がWeb Audio APIで実行時生成します。外部音声ファイルはありません。
