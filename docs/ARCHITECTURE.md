# アーキテクチャ

## 構成

Reactはタイトル、HUD、横方向仮想スティック、上下分岐ボタン、画面方向ガードを担当し、Phaserは`SideScrollTownScene`、主人公、横カメラ、3エリア表示、遷移、時間帯を担当する。`gameBridge.ts`で疎結合に接続する。M1.3の`ResidentialScene`はフォールバックとして保存するが、M1.4失敗時に自動起動する仕組みではない。

## M1.3住宅街Scene（フォールバック／設計履歴）

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

M1.3では追加エリアを専用Sceneと専用背景へ分け、AreaTransitionSystemで切り替える方針だった。M1.4では正式方式を単一永続Scene内のエリア交換へ変更した。この節はロールバック可能な実装と設計履歴を説明する。

## M1.4 2D横スクロール街探索（完了・Production確認済み）

M1.4では斜め見下ろしの巨大walkable mapをメイン方式にせず、独立した横長エリアをグラフで接続する。M1.3の`ResidentialScene`、map、移動ロジック、アセットは削除せずフォールバックとして残す。

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
Navigation core（純粋ロジック）
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

`src/game/navigation/`はPhaser、React、DOM、Web Audioから独立した純粋コアとする。area graph、横移動、exit判定、transition state、spawn解決、input lock、データ検証を担当する。

adapterは入力とdelta timeをコアへ渡し、返されたX、速度、向き、prompt、transition intentをSceneへ反映する。Texture読み込み、Tween、camera、表示レイヤー、時間帯、音声はadapterより外に置く。API変更はコアとadapterの契約を同時に検証する。

navigation coreはPR #33でmainへマージ済み（`ee255a1a8413768d0e7dbdf512964268c8eaf276`）。`src/game/navigationAdapter/`は公開APIを維持しながら、area graph query、横移動、9状態のnavigation state、spawn解決、input lock、validationを`src/game/navigation/`へ委譲する。Scene向け4フェーズへの変換、カメラ、表示、時間帯、音声はadapter／Scene側に残す。

遷移開始時の`sourceSpawnId`をadapter stateへ保存し、cloneされた`fading-in`状態のresetでも非初期spawnへ正しく復帰する。P2修正と回帰テストを含む最終PR head `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`は、Quality、Browser Smoke、最終Codexレビューを通過した。

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

## M1正式基盤

Production確認済みmerge `147f770a4b73077c4e5dc0523839b3fefb789db4`以降、M1の正式な街探索基盤は`SideScrollTownScene`を中心とするM1.4方式とする。新しい街エリアは、独立した横長world、area graph、明示的なspawn／exit、短い暗転遷移を基本単位として追加する。M1.3は削除せず、比較・復旧・設計履歴に使用する。
