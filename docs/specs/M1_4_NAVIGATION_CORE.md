# M1.4 2D横スクロール街探索・3エリア遷移基盤 仕様書（navigationコア）

## 状態

**完了・main統合済み・M1.4 Productionで使用中**

navigationコアPR #33はmain `ee255a1a8413768d0e7dbdf512964268c8eaf276`へマージ済み。実装PR #32はadapter経由で本コアを統合し、main `147f770a4b73077c4e5dc0523839b3fefb789db4`のProduction Browser Smokeまで成功した。

## 目的

M1.3で確立した横スクロール中心の住宅街プレイアブル基盤を、複数エリアがグラフ状に接続された街探索へ拡張する。このドキュメントが担当するのは、Phaser・React・DOM・localStorageに依存しない次の4つの純粋ロジックのみ。

- エリアグラフ（データ構造・クエリ・検証）
- 左右移動の純粋ロジック
- エリア遷移ステートマシン
- 上記を束ねるナビゲーション状態（スポーン解決・入力ロック・キャンセル・エラー回復）

Scene実装、暗転・ロード演出、上下矢印の描画、キャラクターアニメーション、カメラ、`src/game/navigationAdapter/`は本コアの範囲外とする。

## ディレクトリ（重要な経緯）

`src/game/navigation/`に新規実装した。

作業中、M1.3がすでに`src/game/systems/areaTransitionState.mjs`（簡易フェード状態機械）・`walkableMovement.mjs`（衝突・移動ロジック）・`AreaTransitionSystem.ts`を実装済みだったため、いったんそれらへの追記案も検討したが、チャッピーが`CHATGPT_STATUS.md`／`DISCUSSION.md`で明示的に`src/game/navigation/`を前提にした宣言・依頼をすでに行っていたため、当初仕様どおり新規`src/game/navigation/`ディレクトリで実装する方針に確定した。

- `src/game/systems/areaTransitionState.mjs`・`walkableMovement.mjs`・`AreaTransitionSystem.ts`は**一切変更していない**。`tests/area-transition.test.mjs`も無修正のまま引き続きパスする。
- 重複実装を避けるため、`src/game/navigation/horizontalMovement.mjs`は`src/game/systems/walkableMovement.mjs`の`clamp`／`approach`／`chooseFacing`を**import して再利用**し、コピーしていない。
- `src/game/navigation/areaTransitionState.mjs`は既存の`systems/areaTransitionState.mjs`とは完全に別のファイル・別のエクスポート名（`nextNavigationTransitionState`など）であり、混同しない。

## ゲーム方式（M1.4）

- キャラクターは左右にのみ歩く。通常時、上下移動はしない。
- カメラは左右方向だけ追従する（Scene側の責務）。
- 左右端へ到達すると隣接エリアへ移動する。
- 指定地点でのみ上／下矢印を表示し、上下入力は別エリアへの移動にのみ使う。
- エリア切り替え時は短い暗転・ロードを挟む（演出自体はScene側の責務）。

## 3エリア構成

`createM14AreaGraph()`が返すデータ。`worldWidth`・区切り位置・スポーン座標はすべて設定値であり、固定ロジックには埋め込んでいない。表の値はコア単体の既定値で、Productionではadapterが実アート値（2400／2680／2320、`groundY` 525／614／535）を同じ`AreaGraph`契約へ変換する。

| id | 表示名 | 既定worldWidth | 接続 |
| --- | --- | --- | --- |
| `home-street` | 自宅前 | 1600 | right → life-road |
| `life-road` | 住宅街の生活道路 | 2200 | left → home-street／up → upper-vending-lane |
| `upper-vending-lane` | 上側の自販機路地 | 1400 | down → life-road |

`life-road`の`up`出口と`upper-vending-lane`の`down`出口はエリア内X範囲トリガー（`{ kind: 'range', minX, maxX }`、幅128px）で、`life-road`側は`worldWidth * 0.6`を中心に配置している。左右端の出口は48px幅の端範囲トリガー。Production値は`m14AreaData.mjs`を正とし、adapterでコア用グラフへ変換する。

## データ構造（`areaGraph.d.mts`）

- `AreaDefinition`: `id`, `label`, `worldWidth`, `groundY`, `spawnPoints`, `exits`, `metadata?`
- `SpawnPoint`: `id`, `x`, `facing`（`../systems/walkableMovement.d.mts`の`Facing`を再利用）
- `AreaExit`: `id`, `direction`（`left|right|up|down`）, `trigger`, `targetAreaId`, `targetSpawnId`, `transitionType`（`fade|instant`）, `enabled`, `prompt?`
- `ExitTrigger`: `{ kind: 'range', minX, maxX }` または `{ kind: 'marker', markerId }`
  - 左右端／エリア内X範囲はどちらも`range`（境界値が違うだけ）。Tiledのinteractionオブジェクトに紐付けたい場合は`marker`を使い、呼び出し側（Scene）がどのmarkerIdに近接しているかを解決してから渡す。
- `AreaGraph`: `{ areas: AreaDefinition[] }`（配列。重複ID検出のため意図的にMapではなく配列で保持）

## 公開API

### `src/game/navigation/areaGraph.mjs`

```
getArea(graph, areaId)
getSpawnPoint(graph, areaId, spawnId)
findHorizontalExit(graph, areaId, direction: 'left'|'right', locator: { x, markerId? })
findDirectionalExit(graph, areaId, direction: 'up'|'down', locator: { x, markerId? })
isDirectionalPromptVisible(graph, areaId, direction: 'up'|'down', locator)
validateAreaGraph(graph)     // navigationValidation.mjsの再エクスポート
isAreaGraphValid(graph)
createM14AreaGraph(overrides?)
```

初期案では`findDirectionalExit(graph, areaId, markerId, inputDirection)`のようにmarkerId専用の引数列でしたが、`isDirectionalPromptVisible`と同じ`locator`引数（`x`と任意の`markerId`）に統一しました。Scene側は自前のX判定を持たずに済み、範囲トリガーとmarkerトリガーを同じ呼び出し方で扱えます。

### `src/game/navigation/navigationValidation.mjs`

`validateAreaGraph(graph)`は例外を投げず、常に`AreaGraphIssue[]`を返す（空配列＝正常）。検出する`code`：`no-areas`, `duplicate-area-id`, `duplicate-spawn-id`, `duplicate-exit-id`, `invalid-direction`, `invalid-world-width`, `invalid-ground-y`, `invalid-spawn-x`, `invalid-spawn-facing`, `invalid-trigger-range`, `missing-target-area`, `missing-target-spawn`, `unreachable-area`（グラフ先頭エリアからBFSで到達可能かを判定）。

### `src/game/navigation/areaTransitionState.mjs`

```
NAVIGATION_TRANSITION_STATES = [idle, requested, fading-out, loading, spawning, fading-in, completed, cancelled, error]
nextNavigationTransitionState(phase, action)
isActiveNavigationPhase(phase)          // requested/fading-out/loading/spawning/fading-in
isReadyForNavigationTransition(phase)   // idle/completed/cancelled/error
```

チャッピーからの依頼では`idle/fading-out/loading/fading-in`の4状態が挙げられていましたが、「二重遷移防止」「遷移先spawnの解決」「エラー回復」「遷移後状態の確定」を安全に実装するため、`requested`（受理直後・入力ロック開始）、`spawning`（spawn解決後・fade-in前）、`completed`／`cancelled`／`error`（結果ごとに区別できる終端状態）を追加した9状態にしています。`completed`/`cancelled`/`error`はいずれも`isReadyForNavigationTransition = true`（入力ロック解除・次のrequestを即受付可能）です。

### `src/game/navigation/navigationState.mjs`

```
createNavigationState(initialAreaId, initialSpawnId, initialFacing?, metadata?)
isInputLocked(state)              // phase が idle/completed/cancelled/error 以外なら true
isReadyForTransition(state)
beginAreaTransition(state, exit, { now?, metadataPatch? })   // idle/completed/cancelled/error -> requested
startFadeOut(state)                                          // requested -> fading-out
markAreaLoading(state)                                        // fading-out -> loading
resolveAreaSpawn(state, graph, { now?, facingOverride? })     // loading -> spawning（失敗時はerrorへ）
markFadingIn(state)                                           // spawning -> fading-in
completeAreaTransition(state, { now? })                       // fading-in -> completed
cancelAreaTransition(state, { now? })                         // 進行中フェーズ -> cancelled
```

- **入力ロック**：`isInputLocked(state)`は`idle`/`completed`/`cancelled`/`error`のときのみ`false`。それ以外（`requested`〜`fading-in`）はすべてロック中。
- **二重遷移防止**：`beginAreaTransition`は`isReadyForTransition(state)`が`false`、または渡された`exit.enabled === false`のとき、状態を変えずそのまま返す。同じ出口を連打しても最初の1回しか処理されない。
- **エラー・キャンセル時の復帰**：`beginAreaTransition`時点の`{ areaId, spawnId, facing }`を`previousPosition`として保持し、`cancelAreaTransition`と`resolveAreaSpawn`の解決失敗時はここへ戻す。
- **メタデータ引き継ぎ**：`beginAreaTransition`の`metadataPatch`で、時刻や音声状態などScene側が引き継ぎたい値を`state.metadata`へマージできる。

### `src/game/navigation/horizontalMovement.mjs`

```
resolveHorizontalMovement(state, input, config, bounds)
resetHorizontalMovement(state)
```

- `state`: `{ x, velocityX, facing }`
- `input`: `{ left, right, horizontalAxis?, deltaSeconds, locked? }`
- `config`: `{ maxSpeed, acceleration, deceleration, maxSubstep? }`（既定`maxSubstep = 4`。M1.3の`resolveWalkableMovement`と同じ既定値）
- `bounds`: `{ minX, maxX, obstacles?: { minX, maxX }[] }`
- 返り値: `{ x, velocityX, facing, moving, blocked, reachedLeftEdge, reachedRightEdge }`

`../systems/walkableMovement.mjs`の`clamp`/`approach`/`chooseFacing`を再利用しており、ロジックを重複実装していない。

## 横移動ロジックの挙動

- 左右同時押しは「入力なし」として扱う（意図しない移動をしない）。
- `horizontalAxis`は-1〜1へclampし、連続値入力を速度上限へ反映する。未指定時は`left`／`right`へフォールバックする。
- 入力方向へ`acceleration`、無入力（または同時押し）へは`deceleration`で`maxSpeed`まで/から近づける。
- 1フレーム分の移動量を`maxSubstep`（既定4px）ごとに分割して積分するため、大きな`deltaSeconds`でも障害物やエリア境界をすり抜けない。
- エリア境界・障害物区間に当たった時点でそのサブステップで停止し、`blocked = true`、速度を0にする。
- `moving`は実座標が変化したかどうかで判定する（速度が0でなくても壁に張り付いて動けない場合は`false`）。
- `facing`は実際に有効な方向入力があったときだけ更新し、減速中や無入力時は直前の向きを保持する。
- `locked: true`の間は一切移動・速度変化させない（`velocityX`を0で返す）。
- `resetHorizontalMovement(state)`はフォーカス喪失後などに速度だけを0へ戻す（位置・向きは変えない）。

## エリア遷移ステートマシンの図

```
idle ─(request)─▶ requested ─(start-fade-out)─▶ fading-out ─(complete-fade-out)─▶ loading
                                                                                      │
                                                                          (area-ready もしくは fail)
                                                                                      ▼
cancelled ◀─(cancel, 進行中フェーズから)─ ...  spawning ─(begin-fade-in)─▶ fading-in ─(complete)─▶ completed
error ◀───────────────────────────────────(fail, loading中)───┘

completed / cancelled / error はいずれも isReadyForNavigationTransition = true（入力ロック解除・次の request を受け付け可能）
```

## 単体テスト

- `tests/m14-area-graph.test.mjs`（16件）：3エリアと4接続、参照整合性、重複、到達不能、不正寸法、非finite spawn、不正facing、world外triggerを検証する。
- `tests/m14-horizontal-movement.test.mjs`（19件）：左右入力、連続axis、加減速、境界、連続障害物接触、高速delta、入力ロック、moving、facing、reset、フレームレート非依存を検証する。
- `tests/m14-area-transition.test.mjs`（7件）：M1.3既存FSM無傷確認（`src/game/systems/areaTransitionState.mjs`から直接import）、正常な状態遷移一巡、completed/cancelled/errorからの再request、不正アクションの無視、cancel、fail、状態集合の整合性。
- `tests/m14-navigation-state.test.mjs`（8件）：入力ロック、二重開始防止、無効exit、spawn解決、上下往復、キャンセル、エラー時の安全な復帰と再requestを検証する。

navigationコアは計**50件全パス**。最終PR Quality run `30008762303`ではNode 22の全107/107テスト、validator、lint、typecheck、buildが成功した。

## 統合要求への対応状況

M1.4統合で必要な8項目：

1. `home-street` →右→ `life-road` — 対応済み（`createM14AreaGraph` + `findHorizontalExit`）
2. `life-road` →左→ `home-street` — 対応済み
3. `life-road` →上→ `upper-vending-lane` — 対応済み（`findDirectionalExit` + `isDirectionalPromptVisible`）
4. `upper-vending-lane` →下→ `life-road` — 対応済み
5. 加速・減速を含む横移動計算 — 対応済み（`resolveHorizontalMovement`）
6. `idle`／`fading-out`／`loading`／`fading-in`の遷移状態 — 対応済み（上位互換の9状態として実装、理由は上記）
7. 入力ロック、接続先spawnと向きの解決 — 対応済み（`isInputLocked`、`resolveAreaSpawn`）
8. エリア定義・接続・spawnのデータ検証 — 対応済み（`validateAreaGraph`）

ProductionのSceneは`src/game/navigationAdapter/`からのみこのAPIを呼び出し、表示責務と純粋ロジックの境界を維持している。

## adapter統合（`src/game/navigationAdapter/m14NavigationAdapter`）

PR #32でadapterの公開APIを維持したまま、内部を本コアのarea graph query、horizontal movement、navigation state、validationへ差し替えた。

- adapterの公開4フェーズをコアの9状態へ変換し、`lastTransition.result`を保持する。
- camera look-aheadとscroll clamp、演出、時刻、音声はScene／adapter側の責務とする。
- Productionの実アート幅、`groundY`、spawn、branch rangeは`m14AreaData.mjs`を正とし、コアへ渡す。
- 障害物と入力強度は`resolveHorizontalMovement`の`bounds.obstacles`と`horizontalAxis`へ一本化する。
- 最終P2対応ではadapterの遷移状態へ`sourceSpawnId`を保存し、reset時に非初期spawnを含む正確な遷移元へ復元する。

## 統合時の確定事項

1. 実画面の寸法とspawnは`m14AreaData.mjs`、接続検証と解決はnavigationコアを正とする。
2. Productionではrange triggerを使用し、上下矢印の可視判定は`isDirectionalPromptVisible`、描画はScene／UIが担当する。
3. 公開4フェーズと内部9状態の変換はadapterに閉じ、遷移中はコアの`isInputLocked`を正とする。
4. `src/game/economy/`はM1.4へimportせず、M2統合まで保存する。

## 完了結果

- PR #33をmain `ee255a1a8413768d0e7dbdf512964268c8eaf276`へマージした。
- navigationコア50テストと既存M1.3テストが成功した。
- adapter統合テスト15件を含む最終107/107テストとGitHub Actions Qualityが成功した。
- PR #32の最終自動レビューでBlocking issueなし、全review thread解決を確認した。
- main `147f770a4b73077c4e5dc0523839b3fefb789db4`のProduction Browser Smokeで3エリア、5遷移、入力ロック、spawn復元、時刻・音声状態保持、エラー0件を確認した。
