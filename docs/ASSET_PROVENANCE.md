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

## M1.4（実装中・Production確認前）

M1.4は、既存ゲームの画像、キャラクター、背景、UI、音を複製せず、「ぼくの自販機」専用のオリジナル素材として制作する。参考資料から採用するのは、左右歩行、横スクロール、上下分岐矢印、短いエリア切り替えという抽象的な操作方式だけである。

- 原寸master: `tools/art/m14-source/`
- 生成・整形: `tools/art/generate_m14_assets.py`
- ランタイム出力: `public/assets/images/m14/`
- manifest: `public/assets/images/m14/asset-manifest.json`
- 形式: 3エリア×4時間帯のWebP背景、エリア別透過WebP前景、JSON付きWebP player atlas
- ライセンス: Project-original BokuNoJihanki assets

### エリアmaster

| areaId | master | runtime width | groundY |
| --- | --- | ---: | ---: |
| `home-street` | `home-street-master.png` | 2400 | 525 |
| `life-road` | `life-road-master.png` | 2680 | 614 |
| `upper-vending-lane` | `upper-vending-lane-master.png` | 2320 | 535 |

3エリアは別々のmasterを持ち、同じ全景の左右反転、単純複製、引き伸ばしでは作らない。住宅配置、道路形状、塀、電柱、標識、自転車、植木鉢、物置、木陰、自販機、前景をエリアごとに変える。

### 時間帯と主人公

- `morning`、`day`、`evening`、`night`を同じmasterから決定的な工程で生成する
- 夜は窓、街灯、自販機の発光を加える
- player atlasは左右各4待機＋10歩行、合計28フレーム
- 接地フレームは2、7（0始まり）
- atlasの各フレームは128×192

`asset-manifest.json`へversion、revision、style、license、generator、pipeline、area寸法、groundY、player frame構成、全出力ファイルを記録する。生成後は実ゲームへ組み込み、3エリアの独立性、接地、時間帯、スマートフォンでの可読性を目視確認する。

### 音声

M1.4でも外部の音声サンプルは使用しない。セミ、鳥、風、遠い車、足音、遷移音、地名音、矢印音はWeb Audio APIで実行時生成するため、サンプル音声ファイルの来歴は発生しない。

M1.2、M1.3のアセットと生成工程は上書き・削除せず、フォールバックと設計履歴として保存する。
