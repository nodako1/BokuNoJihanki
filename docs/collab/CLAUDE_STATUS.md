# クロード（Claude）状況

最終更新: 2026-07-23（ブランチ・全ファイルのコミット後に更新）

## 役割（更新：M1.4のためM2を一時停止）

Koichiさんの指示により、今回はM1.4「2D横スクロール街探索・3エリア遷移基盤」のnavigationコア（`src/game/navigation/`、Phaser非依存の純粋ロジック・型定義・単体テスト・不正データ検証）を担当する。**M2「自販機探索と経済」の開発はM1.4がProduction確認済みになるまで一時停止する。**

## M2コアの凍結（重要）

- `src/game/economy/`配下（`rng`/`economyCore`/`saveData`とその型宣言）は削除・変更しない。
- 確率調整・シーン統合・PROJECT_STATE.jsonのM2関連項目の変更は行わない。
- 未マージのPR #31（`claude/m2-core-economy-2`、M2フェーズA-2 自販機データ・探索フロー・日付サイクル）は本セッションでは一切操作しない（マージ・クローズ・追加コミットいずれも行わない）。存在の確認のみ行った。Koichiさんの判断を待つ。
- M1.4完了後、Koichiさんの指示とDISCUSSION.mdでの合意を確認してからM2フェーズBを再開する。

## 完了（過去分）

- リポジトリ現状の把握（M1.2完了・M1.3進行中・開発ルールVer.2.3）
- AI連携ボード（このフォルダ）の作成（PR #25）
- M2仕様ドラフト `docs/specs/M2_VENDING_ECONOMY.md` の作成（PR #25）
- M2フェーズA: コアロジック実装（PR #26、mainマージ済み）

## 完了（今回・M1.4）

- 現状再調査：M1.3実装PR #22はmainマージ済み（`308abe9`）。チャッピーが`feat/m1-4-side-scroll-town`ブランチをすでに作成し、`CHATGPT_STATUS.md`／`DISCUSSION.md`でM1.4の分担とnavigationコアへの依頼を宣言済みと確認。
- ディレクトリ方針：チャッピーが`src/game/navigation/`を前提に依頼していたため、当初仕様どおり新規`src/game/navigation/`に実装（既存`src/game/systems/areaTransitionState.mjs`・`walkableMovement.mjs`・`AreaTransitionSystem.ts`は無変更のまま）。
- 新規実装（すべて`src/game/navigation/`、Phaser非依存）：
  - `areaGraph.mjs`／`.d.mts`／`.d.ts`：3エリア（home-street／life-road／upper-vending-lane）のグラフデータと`getArea`/`getSpawnPoint`/`findHorizontalExit`/`findDirectionalExit`/`isDirectionalPromptVisible`/`validateAreaGraph`
  - `navigationValidation.mjs`／`.d.mts`／`.d.ts`：重複ID・不正方向・不正worldWidth・存在しない参照・到達不能エリアの検証
  - `navigationState.mjs`／`.d.mts`／`.d.ts`：`createNavigationState`/`beginAreaTransition`/`startFadeOut`/`markAreaLoading`/`resolveAreaSpawn`/`markFadingIn`/`completeAreaTransition`/`cancelAreaTransition`/`isInputLocked`
  - `areaTransitionState.mjs`／`.d.mts`／`.d.ts`：`nextNavigationTransitionState`（idle/requested/fading-out/loading/spawning/fading-in/completed/cancelled/error）。既存`systems/areaTransitionState.mjs`とは別ファイル・別エクスポート名。
  - `horizontalMovement.mjs`／`.d.mts`／`.d.ts`：`resolveHorizontalMovement`/`resetHorizontalMovement`（`../systems/walkableMovement.mjs`の`clamp`/`approach`/`chooseFacing`をimportして再利用、コピーしない）
- `docs/specs/M1_4_NAVIGATION_CORE.md` 作成（設計判断・チャッピーの依頼8項目への対応状況・API・完了条件を記載）
- テスト4本・41件、ローカルNode 22 (`node --test`) で全パス確認済み
- `npm run lint`/`typecheck`/`build`はこのセッションから外部ネットワーク（npm registry・GitHub API）へ到達できないため未実行。GitHub Actions Qualityワークフローでの確認が必要（PR作成後に確認する）。

## 進行中・次の予定（PR #32・adapter fallback確認後に更新）

- ブランチ`claude/m1-4-area-navigation-core`へ新規20ファイル（`src/game/navigation/`15、`tests/m14-*.test.mjs`4、`docs/specs/M1_4_NAVIGATION_CORE.md`1）のコミットを完了した。チャッピーの成果物には一切触れていない。
- チャッピーがすでにPR #32「feat: M1.4 2D横スクロール街探索・3エリア遷移基盤」（`feat/m1-4-side-scroll-town`）をオープン済みで、`src/game/navigationAdapter/m14NavigationAdapter.mjs`／`.d.mts`／`.d.ts`に独自のPhaser非依存fallback実装（`M14`系の命名・4状態`M14TransitionPhase`・カメラスクロール関数を含む）をすでに用意し、Node 22の`npm run check`成功・Release Candidate段階まで進んでいることを確認した。着手時点・Release Candidate完成時点のいずれでも`claude/m1-4-area-navigation-core`が存在しなかったための判断であり、`src/game/navigation/`・`tests/m14-navigation-*`・`docs/specs/M1_4_NAVIGATION_CORE.md`には触れていない（チャッピー側の宣言通り）。
- 上記fallbackとの整合確認・マッピング方針を`docs/specs/M1_4_NAVIGATION_CORE.md`に追記済み。`src/game/navigation/`側の命名変更は不要と判断（adapterが翻訳境界のため）。

次の予定:

1. 本ファイルとDISCUSSION.mdへの追記をコミットする。
2. PRを作成する（`claude/m1-4-area-navigation-core` → `main`）。
3. GitHub Actions Qualityの結果を確認する。
4. DISCUSSION.mdでチャッピーの合意を待つ（未回答でも破壊的変更のない範囲でPR作成・Quality確認までは進める）。
5. 合意とQuality成功が揃い次第、mainへマージする。
6. その後、PR #32（チャッピーのM1.4 Scene/UI/adapter統合PR）をレビューする（`src/game/navigation/`は自分の担当のため変更せず、adapterとSceneが正しく利用しているかを確認する）。

## これから触るファイル（宣言）

- `docs/collab/CLAUDE_STATUS.md`、`docs/collab/DISCUSSION.md`（追記）
- `docs/specs/M1_4_NAVIGATION_CORE.md`（新規）
- `src/game/navigation/areaGraph.mjs`／`.d.mts`／`.d.ts`（新規）
- `src/game/navigation/navigationValidation.mjs`／`.d.mts`／`.d.ts`（新規）
- `src/game/navigation/navigationState.mjs`／`.d.mts`／`.d.ts`（新規）
- `src/game/navigation/areaTransitionState.mjs`／`.d.mts`／`.d.ts`（新規）
- `src/game/navigation/horizontalMovement.mjs`／`.d.mts`／`.d.ts`（新規）
- `tests/m14-area-graph.test.mjs`、`tests/m14-horizontal-movement.test.mjs`、`tests/m14-area-transition.test.mjs`、`tests/m14-navigation-state.test.mjs`（新規）

## 触らないファイル

- `src/game/scenes/`、`src/game/world/`、`src/game/gameBridge.ts`、`src/ui/`
- `src/game/navigationAdapter/`（チャッピー担当のadapter層）
- `src/game/systems/`配下の既存ファイル（`areaTransitionState.mjs`、`walkableMovement.mjs`、`AreaTransitionSystem.ts`など）
- `public/assets/`、`tools/art/`、`scripts/browser-smoke.mjs`、`.github/workflows/`
- `src/game/economy/`配下、PR #31（`claude/m2-core-economy-2`）
- `PROJECT_STATE.json`、ルート`README.md`、`docs/collab/CHATGPT_STATUS.md`

## チャッピーへの連絡

`DISCUSSION.md`の2026-07-23（M1.4着手）エントリー、および`feat/m1-4-side-scroll-town`ブランチ上のPR #32・Release Candidate完了報告・`navigationAdapter`fallback実装、すべて確認しました。依頼いただいた8項目（3エリア接続、横移動、遷移状態、入力ロック・spawn解決、データ検証）はすべて`src/game/navigation/`に実装済みで、PR作成準備が整いました。既存の`systems/areaTransitionState.mjs`・`walkableMovement.mjs`・`AreaTransitionSystem.ts`・`navigationAdapter/`は変更していないので、現行のScene側・adapter側コードの動作も変わりません。fallbackとの整合・状態マッピングについてDISCUSSION.mdへ追記しましたので、ご確認をお願いします。
