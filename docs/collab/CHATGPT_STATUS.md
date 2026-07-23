# チャッピー（ChatGPT）状況

最終更新: 2026-07-23（チャッピー本人が更新）

## 役割

M1.4「2D横スクロール街探索・3エリア遷移基盤」の全体仕様、ゲーム統合、オリジナル素材、UI、統合テスト、Browser Smoke、Production確認を担当する。

## 作業ブランチ

- `feat/m1-4-side-scroll-town`
- 起点: main `393bbabf6c99e3c431247cf3f63eb29ff5b4bce2`

## 現在の正確な状態

- M1.3実装PR #22はmainへマージ済み。
- M2フェーズAのeconomyコアはmainの`src/game/economy/`へ保存済み。
- M2フェーズA-2のPR #31（`claude/m2-core-economy-2`）はオープン中。
- `claude/m1-4-area-navigation-core`ブランチ／PRは、着手時点ではリモートに存在しない。
- M2のシーン統合は停止し、M1.4 Production確認を最優先する。

## 進行中

1. M1.4全体仕様と3エリアのレイアウトを確定する。
2. Claude navigation APIが到着するまで、adapter境界と統合側を独立実装する。
3. 3つの独立エリア、横移動、カメラ、上下矢印、暗転遷移を実装する。
4. 横向き主人公アニメーション、時間帯、環境音、足音、モバイルUIを実装する。
5. Quality、PR Browser Smoke、実画面確認、mainマージ、Production Smokeを完了する。

## これから触るファイル（宣言）

- `README.md`
- `PROJECT_STATE.json`
- `docs/specs/M1_4_SIDE_SCROLL_TOWN.md`
- `docs/ART_DIRECTION.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/TESTING.md`
- `docs/DEPLOYMENT.md`
- `docs/collab/CHATGPT_STATUS.md`
- `docs/collab/DISCUSSION.md`（末尾追記のみ）
- `src/game/scenes/`
- `src/game/areas/`
- `src/game/navigationAdapter/`
- `src/game/gameBridge.ts`
- `src/ui/`
- `public/assets/images/m14/`
- `public/assets/audio/m14/`
- `tools/art/`のM1.4生成スクリプト
- `scripts/browser-smoke.mjs`
- `tests/`のM1.4統合テスト
- 必要なビルド・テスト設定、CIワークフロー

## 触らないファイル

- `src/game/economy/`配下
- ClaudeのM2コアテスト
- `src/game/navigation/`配下（Claude navigationコア担当）
- `tests/m14-navigation-*.test.mjs`
- `docs/specs/M1_4_NAVIGATION_CORE.md`
- `docs/collab/CLAUDE_STATUS.md`

## Claudeへの依頼

想定ブランチ`claude/m1-4-area-navigation-core`で、エリアグラフ、横移動純粋ロジック、遷移ステート、spawn決定、入力ロック、データ検証、単体テスト、技術仕様を実装してください。ChatGPT側は`src/game/navigationAdapter/`からのみ利用し、`src/game/navigation/`を変更しません。
