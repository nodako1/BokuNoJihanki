# アーキテクチャ

## 構成

Reactはタイトル、HUD、横方向仮想スティック、上下分岐ボタン、画面方向ガードを担当し、Phaserは単一永続のM1.4 Town Scene、主人公、横方向カメラ、3エリアの背景・前景、時間帯、遷移演出を担当する。`gameBridge.ts`で疎結合に接続する。

## M1.3住宅街Scene（fallback／設計履歴）

```text
ResidentialScene
  ├─ InputSystem
  ├─ walkableMovement.mjs
  ├─ ResidentialWorld
  │    ├─ 4区間×4時間帯背景
  │    ├─ 分割前景オクルージョン
  │    └─ デバッグ描画
  ├─ Texture Atlas Player
  ├─ AtmosphereLayer
  └─ AreaTransitionSystem
```

### マップ

`residential-m13-map.json`はTiled互換JSON。描画アセットとゲームデータを分離し、walkable、obstacles、occlusion、interactions、exits、spawn、camera-boundsを編集可能にする。

### 移動

足元円がwalkable内かつobstacle外にあることを毎サブステップ検査する。X/Y軸の部分移動を試して壁沿いスライドを実現する。家や私有地を個別矩形で塞ぐのではなく、最初からwalkable外にする。

### M1.3当時のScene分割方針

M1.3では追加エリアを専用Sceneと専用背景へ分け、AreaTransitionSystemで切り替える方針だった。M1.4では正式方式を単一永続Scene内のエリア交換へ変更済みであり、この節はrollback用実装と設計履歴を説明する。`ResidentialScene`は登録を維持するが自動起動せず、実行時に失敗したM1.4へ自動で切り替わる仕組みではない。

## M1.4 2D横スクロール街探索（Release Candidate実装済み・Production確認前）

M1.4は正式なプレイ経路として、独立した横長エリアをグラフで接続する。M1.3の`ResidentialScene`、map、移動ロジック、アセットは削除せずfallbackと設計履歴として残す。

```text
React UI
  ├─ HUD／時間帯／音声
  ├─ 横方向タッチ入力
  └─ 上下分岐のタップ
        │
        ▼
gameBridge
        │
        ▼
M1.4 Town Scene（単一・永続）
  ├─ Area presentation adapter
  ├─ Player animation and shadow
  ├─ Horizontal camera
  ├─ Fade／loading／area label
  ├─ Time-of-day presentation
  └─ Web Audio presentation
        │
        ▼
Navigation adapter
        │
        ▼
Claude navigation core（純粋ロジック）
```

### 単一永続Scene

3エリアはSceneを作り直して切り替えるのではなく、同じScene内で背景、前景、world bounds、camera bounds、groundY、branch prompt、環境音mixを交換する。主人公、camera、入力、時刻、音声ON／OFF、AudioContext、bridge購読、暗転UIはSceneの寿命中維持する。

これにより、遷移ごとの購読多重化、AudioContext再生成、時刻リセット、ミュート解除、入力残留を防ぐ。切り替え中は入力をロックし、表示交換とspawn適用後にcameraを合わせてからフェードインする。

### エリアデータ

各定義は`areaId`、表示名、4時間帯の背景ID、前景ID、`worldWidth`、`groundY`、`cameraBounds`、`spawnPoints`、左右上下exit、矢印表示範囲、接続先area／spawn、遷移後の向き、環境音とメタデータを持つ。

- `home-street`: 2400×720、groundY 525
- `life-road`: 2680×720、groundY 614
- `upper-vending-lane`: 2320×720、groundY 535

座標はエリアローカルで保持する。エリアをX方向に連結した巨大ワールド座標へ変換しない。

基準spawnは`home-street/start=360`、`home-street/from-life=2180`、`life-road/from-home=150`、`life-road/from-upper=1340`、`upper-vending-lane/from-life=1160`。左右端triggerは64px幅、`life-road`の上分岐はX 1220〜1480、`upper-vending-lane`の下分岐はX 1040〜1320とする。

### navigation adapter境界

`src/game/navigation/`はPhaser、React、DOM、Web Audioから独立したClaude担当の純粋コアとする。area graph、横移動、exit判定、transition state、spawn解決、input lock、データ検証を担当する。

ChatGPT側adapterは入力とdelta timeをコアへ渡し、返されたX、速度、向き、prompt、transition intentをSceneへ反映する。Texture読み込み、Tween、camera、表示レイヤー、時間帯、音声はadapterより外に置く。APIに問題がある場合はコアを直接変更せず連携ボードで合意する。

Claude navigation core PR #33はmainへマージ済み（`ee255a1a8413768d0e7dbdf512964268c8eaf276`）。`src/game/navigationAdapter/m14NavigationAdapter.mjs`はfallbackではなく`src/game/navigation/`のarea graph、横移動、遷移、navigation stateを直接利用し、正規化した`horizontalAxis`を`resolveHorizontalMovement`へ渡す。

coreは`idle`、`requested`、`fading-out`、`loading`、`spawning`、`fading-in`、`completed`、`cancelled`、`error`の9状態を持つ。adapterは遷移ロジックを複製せず、Scene公開層へ`idle`、`fading-out`、`loading`、`fading-in`の4状態として投影する。core状態はadapter内部で保持・必要時に復元し、Sceneはcore内部の状態機械を所有しない。

### 遷移状態

```text
idle
  → fade-out / input locked
  → prepare target area
  → swap presentation and apply spawn
  → area label + fade-in
  → re-arm input
  → idle
```

暗転とフェードインは各250〜350ms、キャッシュ済み全体は約0.6〜1.2秒を目標にする。エラー時は現在エリアへ戻し、入力ロックを必ず解除する。

### 状態所有

- navigation core: area graph、現在area／spawn、横移動、遷移状態、input lock
- Scene: Sprite、camera、描画レイヤー、アニメーション、遷移演出
- React／bridge: UI入力、HUD、矢印タップ、観測用snapshot
- time system: 現在分と4時間帯
- audio engine: AudioContext、ミュート、時間帯・エリアmix

M2の`src/game/economy/`は保存するが、M1.4 Sceneからimportせず、所持金、探索、15分消費、saveを接続しない。
