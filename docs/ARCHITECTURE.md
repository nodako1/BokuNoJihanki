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
