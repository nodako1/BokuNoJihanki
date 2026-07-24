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

## M1.4（完了・Production確認済み）

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

`asset-manifest.json`へversion、revision、style、license、generator、pipeline、area寸法、groundY、player frame構成、全出力ファイルを記録した。実ゲームへ組み込み、PRとProductionの各15画面で3エリアの独立性、接地、4時間帯、スマートフォン横画面の可読性を目視確認済みである。

### 音声

M1.4でも外部の音声サンプルは使用しない。セミ、鳥、風、遠い車、足音、遷移音、地名音、矢印音はWeb Audio APIで実行時生成するため、サンプル音声ファイルの来歴は発生しない。

M1.2、M1.3のアセットと生成工程は上書き・削除せず、フォールバックと設計履歴として保存している。

## M1.5（必須実機品質修正版・candidate）

M1.5素材は既存M1.3／M1.4資産を上書きせず、専用pathと新URLへ保存する。生成日は2026-07-23。BokuNoJihanki向けproject-originalであり、第三者ゲーム素材、既存キャラクター、実在ブランド、外部音声sample、第三者旋律を使用しない。

現在の素材はCP1 commit `edfb2b5f549e8f0407215402e868ebbe6d23c7f4`として保存されている。ただし、checkpoint保存はlocal／Preview目視、candidate QA、実iPhone承認、Production確認を意味しない。

### 画像

- runtime出力: `public/assets/images/m15/`
- manifest: `public/assets/images/m15/asset-manifest.json`
- sourceと生成記録: `tools/art/m15-source/generation.json`
- deterministic後処理: `tools/art/generate_m15_assets.py`
- 原画生成: OpenAI組み込み画像生成
- 権利: Project-original BokuNoJihanki assets
- style: painterly side-scroll Japanese summer town

少年の人物設定と服装はrepository内の既存設定を基準にする。原画の6×2 gridから、largest-connected-character matte、despill、crop、足位置alignmentを決定的に行い、右向きは同じ体格と足位置を保つmirror工程で生成する。影は画像へ焼き込まずruntimeでgroundへ追従する。

- frame: 256×384
- 構成: 左右各4待機＋8歩行、合計24 frame
- foot pivot: `(0.5, 0.9609375)`／pixel `(128, 369)`
- runtime scale: `0.38`
- player atlas SHA-256: `acf3cf78c2dba0c30ed078de5e6b0ee6fe32b7f0cf8dd8f15fc52a8dd41d46b0`
- atlas JSON SHA-256: `fc0f7e4a495dbdf40a7e08b1305d68c57ec15b8b43f87bdcb3710a15c8458f0e`
- chroma source SHA-256: `c02fff1f264e44b21c4d2590db82e0cfe57122490db5dca73e6ef1716c0e8919`
- keyed source SHA-256: `c4b053053d34988a3e174eb128165d427cb50d84c3a5b64036e19d850c9956ce`

背景のsource masterは次の通り。

| areaId | source方針 | source master SHA-256 |
| --- | --- | --- |
| `home-street` | M1.4 project-original masterを不変入力として再生成 | `ffd941607bd373314116dacf3882066dc5e9adb4b9dcdb134b840965578d95d7` |
| `life-road` | M1.4 project-original masterを不変入力として再生成 | `bd033f51dd4882986358cd6fd89732fd438bd2e190050ac3dae7ee1e227a9056` |
| `upper-vending-lane` | 水平路を保ち、前縁へ下り石段を加えたproject-original edit | `58218a55afc28f13d8b9f4d4a7b4988bac74d3727cc6550115c46dd1306882c6` |

代表的なruntime画像SHA-256:

| asset | SHA-256 |
| --- | --- |
| `home-street` morning background | `939713113f709a86a10cd142ea35fbd88917fd61640862f7a7406c4780f1a29d` |
| `life-road` morning background | `340d4c5fe4acb920384ae1ddcf671ce92d20f31bf433283914d25a79a26100a9` |
| `upper-vending-lane` morning background | `f39da4d603f531ce33ab6533719ee913f86bb69ae3b781a9418c892502adb6a3` |
| `home-street` foreground | `b955e02c5f11fb34180da06d83376d0dcc6d78f2592122a98255211b02a0bb73` |
| `life-road` foreground | `3266fab0fd7e0361ceefe2f00fe7eea7c552b33e947a9bfbbdd242d9e058dcd4` |
| `upper-vending-lane` foreground | `5318e24590c33561f8456444675e8e16fd1ae202944e48cd6ed1dc6eae58b396` |

4時間帯を含む全runtime出力のpath、寸法、SHA-256は`public/assets/images/m15/asset-manifest.json`を正とする。背景が変わった場合は、背景SHA-256へ結び付いた`src/game/areas/m15GeometryFixture.mjs`のground、spawn、入口注釈をすべて再測定する。

### BGM

- title: 「夏の朝、坂の自販機へ」
- asset ID: `m15-summer-morning-loop`
- runtime: `public/assets/audio/m15/summer-morning-loop-9ea9bb8b71d7.m4a`
- source: `tools/audio/m15/score.json`
- generator: `tools/audio/m15/generate_m15_bgm.py`
- provenance: `tools/audio/m15/provenance.json`
- analysis: `public/assets/audio/m15/analysis.json`
- SHA-256: `9ea9bb8b71d71d9cb60a31372fc1fe5ea5411eb02374d60d78cca04cab3401c6`
- rights owner: `nodako1`
- license: repository license

音符、和音、rhythm、instrument synthesisを本プロジェクト用に作成し、固定seed `15072026`でPython／NumPy／SciPy／FFmpegから決定的にrenderする。外部sample、第三者melody、外部生成音声serviceは使わない。

runtime音源は48 kHz stereo AAC-LC、38.4秒、16小節、100 BPM、G major。`analysis.json`にintegrated LUFS、4倍oversampling true peak、clipping、DC、無音、loop境界を記録する。静的解析値は素材の技術的provenanceであり、Previewでの聴感、loop、mute／復帰、実iPhone承認の代替ではない。
