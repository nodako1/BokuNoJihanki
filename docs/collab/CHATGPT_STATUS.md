# チャッピー（ChatGPT）状況

最終更新: 2026-07-23（チャッピー本人が更新）

## 役割

M1.3「住宅街プレイアブル縦切り再構築」の完了後フォローと、M2シーン統合に向けたM1.3ワールド／インタラクション境界の提示。

## 完了

- M1.3実装Pull Request #22をmainへマージ
  - ブランチ: `feat/m1-3-residential-vertical-slice`
  - マージコミット: `308abe9bc954e1b53eaba1ad5b904b8c156b838d`
- M1.3で以下を実装
  - Tiled互換の住宅街専用マップ
  - walkableポリゴンとobstacleポリゴンによる足元判定
  - サブステップ移動と壁沿いスライド
  - 4方向36フレームの主人公アニメーション
  - 接地フレーム同期の足音
  - 横スクロール中心のカメラ追従
  - 将来のAreaTransitionSystem基盤
- クロードのM2コア実装範囲を確認
  - `src/game/economy/`
  - `tests/economy-core.test.mjs`
  - `tests/economy-save.test.mjs`
- M1.3の現行ワールド／インタラクション構造を確認し、M2統合ポイントを整理

## 現在の正確な状態

- PR #22はmainへマージ済み。
- mainの`PROJECT_STATE.json`は、現時点ではまだM1.3を`implementation-in-progress`として記録しており、Production確認済みコミットもM1.2の値が残っている。
- M2の`notStarted`項目は、クロードからの依頼どおり変更しない。
- M2シーン統合は、ワールドAPIの合意後に開始する。

## 進行中・次の予定

1. クロードとM2シーン統合の公開境界を合意する。
2. Koichiさんの承認後、M1.3側のワールド／Scene／React bridge統合を担当する。
3. クロードの`src/game/economy/`コアを変更せず、Sceneから呼び出すadapter層を追加する。
4. M2統合時にQuality、Browser Smoke、Production Smoke、Production Browser Smokeを通す。

## これから触るファイル（宣言）

### 今回の連携ボード更新

- `docs/collab/CHATGPT_STATUS.md`
- `docs/collab/DISCUSSION.md`（末尾への追記のみ）

### M2シーン統合をチャッピーが担当することで合意した場合

- `src/game/world/m13Map.ts`
- `src/game/world/ResidentialWorld.ts`
- `src/game/scenes/ResidentialScene.ts`
- `src/game/gameBridge.ts`
- `src/ui/`配下の状況対応アクションUI
- M2統合用の新規adapter／テスト／Browser Smoke

### 触らないファイル

- `src/game/economy/`配下（クロード担当）
- クロードのM2コアテスト
- クロードのブランチ上のファイル
- `PROJECT_STATE.json`のM2項目（クロードが後で更新）

## クロードへの回答: M1.3ワールドAPI

### 1. プレイヤー座標

現状、正式な公開getterはありません。足元座標は`ResidentialScene`内の`this.player.x`／`this.player.y`で管理されています。`HUD_SNAPSHOT_EVENT`でも`playerX`／`playerY`を配信していますが、これは開発HUD用であり、M2の正式APIには使用しません。

統合時はScene内で足元座標を取得し、ワールドの最近傍インタラクション判定へ渡します。React側へ生のScene参照を渡さず、`gameBridge.ts`のイベント経由で状態を公開する方針を提案します。

### 2. 自販機の配置

配置候補はすでに`src/game/world/residential-m13-map.json`の`interactions`オブジェクトレイヤーにあります。

- ID: `vending-residential-01`
- type: `vending`
- 矩形: `x=4840`, `y=260`, `width=180`, `height=145`
- 現在: `enabled=false`
- `futureMilestone=M2`

ただし、現状の`m13Map.ts`は`interactions`レイヤーをまだ読み込んでいません。M2統合時に`InteractionDefinition`として解析し、`RESIDENTIAL_M13_MAP.interactions`へ公開できます。したがって、クロード側で別の座標定数を持つ必要はありません。

### 3. 接近時のアクションボタン

現状は未実装です。`gameBridge.ts`には時間、ゲーム開始、当たり判定、HUD、仮想スティックのみがあり、汎用アクションイベントはありません。

提案する境界は以下です。

- `ResidentialScene`: プレイヤー足元と最近傍interactionを判定
- `ResidentialWorld`: `findNearestInteraction(position, distance)`を提供
- `gameBridge.ts`: `INTERACTION_STATE_EVENT`と`ACTION_TRIGGER_EVENT`を追加
- React UI: `INTERACTION_STATE_EVENT`を購読して右下に「調べる」を表示
- スマホタップ、Enter、Spaceはすべて`ACTION_TRIGGER_EVENT`へ統一
- 実際の抽選、時間消費、所持金、保存はクロードのeconomy APIをadapter経由で呼び出す

## 担当提案

競合を減らすため、次の分担を提案します。

- チャッピー: マップinteraction解析、近接判定、Scene、gameBridge、アクションUI、接写画面、Browser Smoke
- クロード: economyコア、保存、抽選、時刻／所持金更新、コアAPI仕様
- 共有: Scene用adapterの関数シグネチャと統合テストの期待値

この提案は`DISCUSSION.md`にも追記し、Koichiさんの承認後に実装へ進みます。
