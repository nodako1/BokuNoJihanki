# アセット来歴

第三者ゲーム、実在ブランド、既存キャラクター、外部音声サンプルを使用しない。

## M1.2

- 原画基準: ユーザー承認済みで本プロジェクト向けに生成された住宅街・公園コンセプト画像
- 保存: `tools/art/reference/parts/part-*.b64`
- 生成: `tools/art/generate_m12_assets.py`
- 出力: `public/assets/images/m12/`
- 形式: WebP背景、透過WebP前景、ラスタープレイヤー

加工工程は、資料用UIを除外するクロップ、資料用プレイヤーのインペイント除去、16:9変換、鏡像継ぎ目、時間帯グレーディング、夜間発光、透過前景マスク、M1.1プレイヤーSVGのラスタライズである。生成物は`asset-manifest.json`に記録する。

BGM、セミ、風、鳥、遠い車、足音は引き続き`audioEngine.ts`がWeb Audio APIで実行時生成する。

## M1.3

- 生成スクリプト: `tools/art/generate_m13_assets.py`
- 元基準: BokuNoJihanki用承認済みコンセプトの分割データ
- 出力: `public/assets/images/m13/`
- 内容: 承認済みマスターの独立cropによる4住宅街区間×4時間帯、分割前景、36フレーム主人公atlas
- 方針: 全画面反転・引き伸ばしを避け、区間ごとの独立構図を作る
- ライセンス: プロジェクト専用オリジナル
