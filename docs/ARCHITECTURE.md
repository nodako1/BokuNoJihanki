# アーキテクチャ

## 構成

Reactはタイトル、HUD、仮想スティック、画面方向ガードを担当し、Phaserは住宅街Scene、主人公、カメラ、背景、walkable、衝突、時間帯を担当する。`gameBridge.ts`で疎結合に接続する。

## M1.3住宅街Scene

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

### Scene分割

今後の公園、駅前、商店街、山、海は専用Sceneと専用背景を持つ。AreaTransitionSystemがフェードアウト、読み込み、地名表示、フェードインを担当する。無理なシームレス接続は行わない。

## M1.4 2D横スクロール街探索（実装中・Production確認前）

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

M1.4 Release Candidate作成時点では、依頼済みの`claude/m1-4-area-navigation-core`ブランチ／PRが存在しない。このため`src/game/navigationAdapter/`には、上記契約を固定してScene統合とProduction検証を進めるためのPhaser非依存fallbackを置く。Claude成果到着後は、公開APIを維持したままadapter内部を`src/game/navigation/`呼び出しへ置換し、fallback内部ロジックは削除する。これはClaude担当領域を代替完了したものとは扱わない。

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
