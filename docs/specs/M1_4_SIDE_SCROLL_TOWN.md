# M1.4 2D横スクロール街探索・3エリア遷移基盤 仕様書

## 状態

**完了・Production確認済み（2026-07-23）**

実装PR #32の最終head `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`をmain `147f770a4b73077c4e5dc0523839b3fefb789db4`としてマージし、Quality、PR Browser Smoke、Vercel、Production Smoke、Production Browser Smoke、公開画面の確認まで完了した。M1.4の2D横スクロール方式をM1の正式基盤とする。

PR #34後の`29223ee31fd4fc4fbca21a37b01fe89277279647`が現在のmain／Production baselineである。M1.4配信成功は維持するが、後続の実機品質問題によりM1全体の完成判定は再オープンした。現在の必須gateは[M1.5 実機品質修正版](M1_5_POLISH.md)である。

## 1. 決定と目的

M1.4から、街探索のメイン方式を斜め見下ろし2.5D自由移動から、高解像度2D横スクロールへ正式に切り替える。

目標は次のとおり。

- 主人公が左右へ自然に歩き、その移動に合わせてカメラが横方向へ追従する
- 街を一枚の巨大画像ではなく、独立した横長エリアのグラフとして拡張できる
- 上下方向は自由移動に使わず、分岐地点で別エリアへ移る意思決定にだけ使う
- 3エリアが別々の場所に見え、住宅街を実際に歩いている感覚を作る
- シームレスさより、背景、主人公、歩行、操作、構図、短い遷移の完成度を優先する
- M0の時間帯と音声の基盤を維持し、エリア遷移後も状態を失わない

M1.3のコードとアセットはフォールバックおよび設計履歴として残す。M2の`src/game/economy/`コアも変更・削除せず保存し、M1.4には接続しない。M1.4 Production確認時点ではM2 Scene統合を次工程としていたが、後続の実機所見により現在の次工程は必須M1.5へ変更した。

## 2. スコープ

### 実装するもの

- `home-street`、`life-road`、`upper-vending-lane`の3エリア
- 左右移動、加速、減速、停止、画面端の制限
- 左右方向の待機・歩行アニメーションと接地同期足音
- 横方向カメラ追従と進行方向look-ahead
- 左右端の出口遷移
- 分岐地点の上・下矢印と、キー／タップによる遷移
- 250〜350msの暗転、必要素材の準備、地名表示、250〜350msのフェードイン
- 朝、昼、夕方、夜の表示と環境音
- PC入力、スマートフォン横画面の左右入力、タップ可能な方向矢印
- `src/game/navigation/`のnavigationコアを利用するadapter境界
- 統合テスト、Browser Smoke、Production Smoke、実画面確認

> 完了注記: navigationコアPR #33はmain `ee255a1a8413768d0e7dbdf512964268c8eaf276`へマージ済み。`src/game/navigationAdapter/`の公開契約を維持したまま内部をコア呼び出しへ統合した。最終レビューのP2指摘には遷移元`sourceSpawnId`の保存・復元と非初期spawn回帰テストを追加し、cloneされた`fading-in`状態のresetでも正しい遷移元へ戻ることを確認した。

### 実装しないもの

- 自販機を調べる、自販機の下／返却口、抽選
- 所持金、15分消費、ローカルセーブ
- NPC、会話、ゲームショップ、イベント
- 公園内部、海、山、学校、駅前、商店街、エンディング
- 画面内での上下自由移動
- 未完成エリアへの仮遷移

自販機は`upper-vending-lane`の景観要素として表示してよいが、M1.4では操作対象にしない。

## 3. 論理画面と座標

- 基準画面: 1280×720論理ピクセル
- PhaserのScale: `FIT`、中央寄せ
- ワールドY: 0〜720
- 主人公のY: 現在エリアの`groundY`へ固定
- カメラ: Y固定、Xだけを追従
- 画像の右端より外、左端より外、上下の背景外を表示しない
- エリア座標はローカル座標とし、別エリアのX座標を連結して巨大ワールド化しない

表示端末の縦横比が異なる場合も、ゲーム座標、出口判定、分岐判定、スポーン地点は論理座標を正とする。

## 4. エリア構成

アセットmanifestの基準値は次のとおり。

| areaId | 表示名 | worldWidth | groundY | 主な構図 |
| --- | --- | ---: | ---: | --- |
| `home-street` | 自宅前 | 2400 | 525 | 主人公の家、隣家、塀、植え込み、電柱、静かな住宅道路 |
| `life-road` | 生活道路 | 2680 | 614 | 連続する住宅、標識、門、自転車、植木鉢、電線、上側への細い分岐路 |
| `upper-vending-lane` | 自販機路地 | 2320 | 535 | 高い位置の細い住宅路地、オリジナル自販機、古い塀、物置、木陰 |

全エリアの`cameraBounds`は`x=0`、`y=0`、`width=worldWidth`、`height=720`を基準にする。主人公の左右制限は描画端そのものではなく、身体と影が画面外へ消えない安全マージンを含める。

spawnとtriggerのランタイム基準値は次のとおり。

| areaId | spawn／trigger | Xまたはrange | 向き／用途 |
| --- | --- | ---: | --- |
| `home-street` | `start` | 360 | `right` |
| `home-street` | `from-life` | 2180 | `left` |
| `home-street` | right exit | 2336〜2400 | `life-road/from-home`へ |
| `life-road` | `from-home` | 150 | `right` |
| `life-road` | `from-upper` | 1340 | `left` |
| `life-road` | left exit | 0〜64 | `home-street/from-life`へ |
| `life-road` | up branch／arrow | 1220〜1480 | `upper-vending-lane/from-life`へ |
| `upper-vending-lane` | `from-life` | 1160 | `right` |
| `upper-vending-lane` | down branch／arrow | 1040〜1320 | `life-road/from-upper`へ |

上記`groundY`、spawn、triggerはM1.4の履歴値であり、背景道路を独立正解にしたM1.5の期待値ではない。

### 4.1 `home-street`

- 初回開始地点は自宅前の見通しがよい場所
- 右端だけを有効な出口とし、`life-road`へ接続する
- `life-road`から戻る場合は、右端出口の内側へ配置し、左向きで再開する
- 左端は閉鎖端。入力し続けても背景外へ出ず、遷移も始めない

### 4.2 `life-road`

- 左端から`home-street`へ戻れる
- 中央付近の細い分岐路に、上方向のbranch triggerを持つ
- branch trigger内では上矢印を表示し、上入力で`upper-vending-lane`へ移る
- 上下入力だけではX／Y座標を変更しない
- 右端は将来接続予定として閉鎖し、必要なら進入不可の案内を表示する

### 4.3 `upper-vending-lane`

- `life-road`からの到着地点を、路地の景観と自販機が把握できる位置に置く
- 対応するbranch trigger内で下矢印を表示する
- 下入力で`life-road`の上分岐地点へ戻る
- 左右端は閉鎖し、未完成エリアへ遷移させない
- M2で自販機探索を追加できるよう、景観上の自販機IDと将来のinteraction配置余地を残すが、M1.4の入力へは接続しない

## 5. エリアグラフ

```text
home-street
  right ───────────────> life-road
              <──────── left
                              │
                              │ up
                              ▼
                    upper-vending-lane
                              │
                              │ down
                              ▼
                         life-road
```

有効な接続は次の4本だけとする。

| 接続元 | trigger | 接続先 | 接続先spawn | 再開方向 |
| --- | --- | --- | --- | --- |
| `home-street` | `right` | `life-road` | 左端内側 | `right` |
| `life-road` | `left` | `home-street` | 右端内側 | `left` |
| `life-road` | `up` | `upper-vending-lane` | 下り口付近 | 原則`right` |
| `upper-vending-lane` | `down` | `life-road` | `from-upper` | `left` |

同じ入力を押し続けたまま到着しても、到着フレームで逆戻りしないよう、遷移完了時に出口の内側へ配置し、方向入力の再武装または短い再入力待ちを行う。

## 6. エリアデータ契約

各エリア定義は少なくとも次を持つ。

```ts
interface TownAreaDefinition {
  areaId: 'home-street' | 'life-road' | 'upper-vending-lane'
  displayName: string
  backgroundAssetIds: Record<'morning' | 'day' | 'evening' | 'night', string>
  foregroundAssetId: string
  worldWidth: number
  groundY: number
  cameraBounds: { x: number; y: number; width: number; height: number }
  spawnPoints: Record<string, {
    x: number
    facing: 'left' | 'right'
  }>
  leftExit?: TownExit
  rightExit?: TownExit
  upExit?: TownExit
  downExit?: TownExit
  branchPrompts: readonly {
    direction: 'up' | 'down'
    minX: number
    maxX: number
  }[]
  ambienceId: string
  metadata?: Record<string, string | number | boolean>
}

interface TownExit {
  targetAreaId: TownAreaDefinition['areaId']
  targetSpawnId: string
  facing: 'left' | 'right' | 'preserve'
}
```

exit、spawn、branch triggerの整合性はnavigationコアの検証で保証する。存在しないarea、存在しないspawn、逆方向接続の不足、範囲外座標、不正なworld widthはテストまたは起動時検証で失敗させる。

## 7. ランタイム構成

M1.4は**単一の永続Phaser Scene**で動かす。エリアごとにSceneを破棄・再生成せず、同じScene内で現在エリアのレイヤーとboundsを交換する。

```text
React UI
  ├─ タイトル／HUD／音声／時間帯プレビュー
  ├─ 横方向専用タッチ入力
  └─ タップ可能な上下矢印
          │
          ▼
gameBridge
  ├─ UI入力の受け渡し
  ├─ 矢印可視状態と遷移状態の通知
  └─ HUD／Smoke用snapshot
          │
          ▼
M1.4 Town Scene（単一・永続）
  ├─ Area presentation adapter
  ├─ Player and animation
  ├─ Horizontal camera
  ├─ Fade／地名表示
  ├─ Time-of-day presentation
  └─ Audio presentation
          │
          ▼
Navigation adapter
          │
          ▼
Navigation core（Phaser／React非依存）
  ├─ area graph
  ├─ 横移動の純粋ロジック
  ├─ transition state machine
  ├─ spawn解決
  ├─ input lock
  └─ data validation
```

### 7.1 永続Sceneが保持するもの

- 主人公Spriteと影
- 入力System
- カメラ
- 暗転レイヤー、地名表示、矢印表示
- 現在時刻と時間帯表示への参照
- 音声ON／OFFとAudioContextへの参照
- navigation adapter
- Smoke用debug snapshot

### 7.2 エリア切り替え時に交換するもの

- 背景、遠景、中景、地面、前景
- world／camera bounds
- groundY
- 現在エリアのbranch prompt
- エリア固有の環境音mix
- 主人公のspawn xと向き

単一Sceneにすることで、Scene再起動による時刻、ミュート状態、React bridge購読、AudioContext、入力購読の二重化や消失を防ぐ。

## 8. navigation adapter境界

`src/game/navigation/`は純粋ロジックとして扱い、PhaserのScene、Sprite、Camera、Texture、Tween、React DOM、Web Audioを参照させない。

adapterは次だけを担当する。

- キーボード／タッチ入力をnavigationコアの入力形へ正規化する
- 現在X、delta time、出口／branch状態をコアへ渡す
- コアが返した次X、速度、向き、prompt、transition intentをSceneへ反映する
- transition intentに応じて暗転、アセット準備、表示交換を実行する
- コアが解決したareaId、spawnId、facingを表示層へ適用する
- コアが保持しない時刻、音声、カメラ、アニメーションをScene側で維持する

adapterはnavigationコアの内部状態を複製しない。API不整合を発見した場合は、`src/game/navigation/`を直接改変せず、連携ボードで修正案を合意する。

M2の`src/game/economy/`をimportしてはならず、M1.4のSceneやbridgeへ所持金、探索、セーブ状態を追加しない。

## 9. 入力と横移動

### 9.1 PC

- 左: `ArrowLeft`または`A`
- 右: `ArrowRight`または`D`
- 上エリアへ: 有効な上矢印の範囲内で`ArrowUp`または`W`
- 下エリアへ: 有効な下矢印の範囲内で`ArrowDown`または`S`

### 9.2 スマートフォン

- 左下に横方向専用の左右ボタンまたは横軸だけの仮想スティックを置く
- 縦軸の仮想移動は送らない
- branch trigger内では大きな上矢印または下矢印をゲーム画面内に表示する
- 矢印全体をタップ領域にし、押下時に一度だけ遷移要求を送る
- 横画面を前提とし、HUD、矢印、左右入力が主人公と出口を過度に隠さない

### 9.3 移動規則

- X方向だけに加速・減速を適用する
- 相反する左右入力は中立とする
- 入力を離すと自然に減速して停止する
- 実座標が変わったときだけ歩行中と判定する
- 閉鎖端または入力ロック中は速度を0へ戻す
- 主人公のYは常に現在エリアの`groundY`
- 上下入力は通常時のX、Y、速度を変えない
- transition開始からフェードイン完了までは移動・再遷移入力をロックする
- `window.blur`、`document.visibilitychange`、Scene停止時に入力と速度をクリアする
- delta timeを上限クランプし、復帰直後の大移動や出口飛び越しを防ぐ

## 10. 主人公とアニメーション

M1.4専用の横視点主人公atlasを使う。M1.3の斜め見下ろし4方向atlasはフォールバックとして保存するが、M1.4のメインSceneでは使わない。

- フレームサイズ: 128×192
- 左向き待機: 4フレーム
- 右向き待機: 4フレーム
- 左向き歩行: 10フレーム
- 右向き歩行: 10フレーム
- 合計: 28フレーム
- 接地フレーム: 各歩行列の2、7（0始まり）
- 足元の影: 身体とは別レイヤー

速度0または座標が変わらないときは待機へ戻す。歩行再生速度は実移動速度へ追従させ、壁端で足踏みさせない。左右の足と腕を逆位相で動かし、体の上下動を抑え、接地フレームでアスファルト足音を鳴らす。

## 11. カメラ

- X方向だけを滑らかに追従する
- Y位置とズームは通常プレイ中に変えない
- 主人公の進行方向に弱いlook-aheadを加える
- 速度が0へ近づくとlook-aheadも滑らかに戻す
- 主人公を常に画面中央へ固定せず、進行先を少し広く見せる
- camera scrollは`0`から`worldWidth - 1280`の範囲にクランプする
- エリア切り替え時はspawnを先に適用し、その位置へcameraを整合させてからフェードインする
- 急な位置飛び、背景外、縦揺れを発生させない

背景は遠景、中景、地面、前景に分け、必要な場合だけ弱いパララックスを使用する。地面と主人公の接地関係を変えるパララックスは使用しない。

## 12. 分岐矢印

- trigger外では表示も入力受付もしない
- triggerへ入ったときにフェードまたは短いポップで表示する
- 上矢印と下矢印は方向、形、ラベルで識別できる
- PCでは対応キーを添え、タッチ端末ではタップ可能であることを示す
- 矢印が見えた瞬間の効果音はtrigger進入ごとに一度だけ鳴らす
- 決定音は有効な遷移が受理されたときだけ鳴らす
- 暗転中、読み込み中、遷移直後の再武装前は非表示または無効にする
- 画面上の配置はworld座標ではなくcamera／UI座標を基準にし、どの画面位置でも読めるようにする

## 13. エリア遷移

### 13.1 左右端

1. 主人公が出口範囲へ到達する
2. さらに出口方向を入力する
3. navigationコアが有効なtransition intentを返す
4. 入力をロックし、速度を0にする
5. 250〜350msで暗転し、遷移開始音を鳴らす
6. 接続先アセットを確認し、未ロードなら読み込む
7. 現在エリアの表示を接続先へ交換する
8. 解決済みspawnへ主人公を配置し、向きとcameraを設定する
9. 地名を短く表示してエリア表示音を鳴らす
10. 250〜350msでフェードインする
11. 入力を再武装してロックを解除する

### 13.2 上下分岐

1. branch triggerへ入る
2. 対応する上／下矢印を表示する
3. PCの方向キーまたは矢印タップを一度受理する
4. 以後は左右端と同じ遷移処理を実行する

キャッシュ済み遷移は全体約0.6〜1.2秒、初回読み込みも原則2秒以内を目標にする。意図的な長い偽ロードは入れない。読み込みが見える長さになった場合だけ、小さなロード表示と接続先地名を表示する。

遷移失敗時は入力を永久ロックしない。現在エリアを維持して暗転を戻し、開発用snapshotへ失敗理由を残す。

## 14. 時間帯

M0のゲーム内時刻と4時間帯を引き継ぐ。

| phase | 基準時間 | 見た目 |
| --- | --- | --- |
| `morning` | 6:00〜8:59 | 柔らかい朝日、生活感、鳥 |
| `day` | 9:00〜14:59 | 高い夏空、強い日差し、セミ |
| `evening` | 15:00〜17:59 | 暖色、長い影、夕方の落ち着き |
| `night` | 18:00〜21:00 | 暗い空、窓・街灯・自販機照明 |

各エリアは4時間帯の独立背景を持つ。空、建物の明るさ、道路の色温度、影、窓、街灯、自販機照明、環境音mixを変える。現在分、phase、プレビュー状態はエリア切り替えで変化させない。

M1.4の移動とエリア遷移そのものではゲーム内時間を進めない。15分消費はM2の非スコープである。

## 15. 音声

音声は第三者の音声ファイルを使わず、既存方針どおりWeb Audio APIで実行時生成する。

- アスファルト左右足音
- セミ
- 鳥
- 風
- 遠くの車
- 生活道路の環境mix
- エリア遷移開始音
- 地名表示音
- 矢印表示音
- 矢印決定音

接地フレーム2、7で左右足音を交互に鳴らす。実座標が変わらない場合は鳴らさない。エリア切り替え時は永続する環境音ノードを新しいarea／phase mixへ更新し、`setTargetAtTime`の0.7〜0.8秒設定でクロスフェード相当の平滑化を行う。AudioContextは最初のユーザー操作で開始し、ミュート状態を遷移後も維持する。

`document.hidden`時はmaster gainを0へ減衰させ、入力、速度、新しい足音を停止する。documentが可視のままの単純な`window.blur`ではmaster gainを変更せず、入力、速度、新しい足音だけを停止する。復帰時に意図せず足音を連打させない。

## 16. アートとアセット

すべて「ぼくの自販機」専用のオリジナル素材とする。参考画像から採用するのは、左右歩行、横スクロール、上下分岐矢印、短いエリア切り替えという操作方式だけであり、既存ゲームの画像、キャラクター、背景、UI、音、固有の配置は複製しない。

M1.4ランタイム画像は`public/assets/images/m14/`、生成工程は`tools/art/generate_m14_assets.py`、原寸masterは`tools/art/m14-source/`、来歴は`asset-manifest.json`で管理する。

- 3エリアはそれぞれ別のmasterを持つ
- 同じ背景の左右反転、単純複製、引き伸ばしで3エリアを作らない
- エリアごとに住宅配置、道路形状、小物、植栽、遠近、光の抜けを変える
- 高解像度の横視点、日本の夏休み、暖かくノスタルジックな画材を統一する
- 主人公と背景の輪郭、解像感、光方向、接地点を揃える
- 小さいスマートフォン画面でも主人公のシルエットと矢印を判別できる
- 生成物は実ゲームへ組み込み、目視確認して品質不足なら再生成または修正する

## 17. React UIとgameBridge

Reactはタイトル、HUD、音声切り替え、時間帯プレビュー、横方向タッチ入力、画面方向ガードを担当する。Phaserはエリア、主人公、カメラ、背景、前景、遷移演出を担当する。

bridgeは少なくとも次の状態をUIまたはSmokeへ公開する。

- `areaId`、表示名
- `playerX`、固定された`playerY`
- `facing`、`animation`、実速度
- camera scroll X
- `promptDirection`とprompt可視状態
- transition phase、input locked
- spawnIdまたは直前のtransition
- time minutes、time phase
- audio muted／started
- footstep count
- pageerror／resource failure調査に使える最小debug情報

bridgeイベントと購読はSceneの寿命中に一組だけ存在し、再描画やエリア交換で多重登録しない。

## 18. 自動テスト

navigation単体テストに加え、M1.4統合テストで次を確認する。

- 左入力で左へ移動する
- 右入力で右へ移動する
- 入力を離すと減速し停止する
- 通常位置の上・下入力でX／Yが変わらない
- 分岐地点以外の上・下入力で遷移しない
- branch trigger内だけ正しい矢印を表示する
- `life-road`の上入力で`upper-vending-lane`へ遷移する
- `upper-vending-lane`の下入力で`life-road`の対応spawnへ戻る
- `home-street`右端から`life-road`へ遷移する
- `life-road`左端から`home-street`へ戻る
- 閉鎖端では背景外へ出ず、遷移しない
- 遷移中は入力がロックされる
- 遷移後のarea、spawn、X、Y、向きが正しい
- 到着直後に押しっぱなしで逆戻りしない
- 現在時刻、phase、音声状態を維持する
- cameraが横方向だけ追従し、bounds外を表示しない
- 実移動中は歩行フレームが変化する
- 停止時と端でblocked時は待機へ戻る
- 接地フレームと足音が同期する
- 単純なblurで入力、速度、足音を停止し、不要なmaster gain変更を行わない
- `document.hidden`で入力、速度、足音を停止し、master gainを下げる
- Scene、bridge、AudioContextがエリア遷移で多重生成されない
- M2 economyのテストが引き続き成功する

`npm run check`でvalidate、lint、typecheck、unit test、production buildをすべて成功させる。

## 19. Browser Smoke

PRとVercel Productionの両方でPlaywright Chromiumを使い、次の一連を自動操作する。

1. ゲームを開始する
2. 自宅前で右へ歩く
3. カメラの横追従を確認する
4. 自宅前右端へ到達する
5. 暗転と短いロードを経て生活道路へ移る
6. 生活道路左端から自宅前へ戻る
7. 再び生活道路へ入り、上分岐へ移動する
8. 上矢印の表示を確認する
9. 上入力で自販機路地へ移る
10. 自販機路地を右・左へ歩く
11. 下矢印の表示を確認する
12. 下入力で生活道路へ戻る
13. 朝、昼、夕方、夜を確認する
14. 右歩行、左歩行、停止待機を確認する
15. `pageerror` 0件、failed request 0件を確認する

Artifactには少なくとも、自宅前、右歩行、左歩行、自宅前右端、ロード画面、生活道路、上矢印、自販機路地、下矢印、4時間帯、state JSON、console、Playwright traceを保存する。

## 20. 人間による見た目確認

自動テスト成功だけでmainへマージしない。PRとProductionの実画面で次を確認する。

- 主人公が地面を踏んで歩いて見える
- 足滑りが目立たず、左右の足と腕が動く
- 停止時に自然な待機へ戻る
- 背景と主人公が同じゲームの素材に見える
- 3エリアが反転・複製ではなく、それぞれ別の場所に見える
- エリア接続と上下矢印の意味が直感的に分かる
- 暗転とロードが長すぎず、入力ロックが明確である
- カメラの追従、look-ahead、端の停止が不自然でない
- 4時間帯の差と夜の照明が読み取れる
- スマートフォン横画面で入力しやすい
- 「実在する街を探検している感覚」がある

基準不足ならProduction完了扱いにせず、修正、再テスト、再デプロイ、再確認を行う。

## 21. デプロイと完了条件

実装完了後の順序は次のとおり。

1. `npm ci`
2. `npm run validate`
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm run build`
7. `npm run check`
8. Feature PR
9. PR Browser SmokeとArtifact
10. PR実画面確認
11. navigation境界の監査と最終自動レビュー
12. mainへマージ
13. Vercel Production反映
14. Production Smoke
15. Production Browser Smoke
16. Production実画面確認
17. 状態、証跡、関連文書の確定

次をすべて満たした場合だけ状態を**完了・Production確認済み**へ更新できる。

- 3つの独立エリアがゲーム内に存在する
- 主人公は左右にだけ移動する
- 横スクロールcameraが正しくbounds内を追従する
- 左右端と上・下分岐の4接続が動作する
- 暗転、短いロード、地名表示、入力ロックが動作する
- 遷移後のspawn、groundY、向きが正しい
- 左右の正式な待機・歩行アニメーションと足音同期がある
- 4時間帯、現在時刻、音声状態がエリア間で維持される
- navigationコアをadapter経由で使用する
- M1.3フォールバックとM2 economyコアを保存している
- Quality、PR Browser Smoke、最終自動レビューが成功する
- mainへマージ済みである
- Vercel Productionへ対象コミットが反映済みである
- Production SmokeとProduction Browser Smokeが成功する
- Productionの実画面を人間が確認済みである
- `pageerror`、failed requestが0件である
- README、PROJECT_STATE、関連仕様、連携ボード、証跡が最終状態と一致する

## 22. ロールバック

M1.4がProduction確認に失敗した場合は、M1.3のコードとアセットを削除せず、直前に確認済みのProductionへ戻せる状態を保つ。ロールバックはM2 economyコアの削除を伴わない。

## 23. Production確認結果

- navigationコア: PR #33、main `ee255a1a8413768d0e7dbdf512964268c8eaf276`
- 実装PR: #32、最終head `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`、merge `147f770a4b73077c4e5dc0523839b3fefb789db4`
- PR Quality: run `30008762303`、Node 22、107/107テスト、validator、lint、typecheck、build成功
- PR Browser Smoke: run `30008762333`、Artifact `8564271801`、15画面、3エリア、5遷移、`pageerror` 0、failed request 0
- Production: Vercel成功、Production Smoke run `30009405068`成功
- Production Browser Smoke: run `30009404814`、Artifact `8564582434`、expected commit `147f770`、15画面、3エリア、5遷移、`pageerror` 0、failed request 0
- 自動・目視確認: camera bounds／追従、focus喪失時停止、transition lock、時刻・音声状態保持、左右歩行、上下矢印、4時間帯、スマートフォン横画面を確認

全完了条件を満たしたため、M1.4は**Production確認済み**である。詳細は[Production Evidence](../evidence/M1_4_PRODUCTION_EVIDENCE.md)を正とする。

この履歴はM1全体の現在の完成承認を意味しない。M1へ完成判定を戻すには、同一SHA PreviewのQA・Evidence監査・実iPhone承認、mainマージ、M1.5 Production確認が必要である。
