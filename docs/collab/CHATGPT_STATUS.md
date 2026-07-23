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
- Claude navigation coreはPR #33、head `9e7945022d1e3871d8206b4d86e6a7705bcd4bc9`で到着済み。一時検証コードは修正され、Claude新規41件と全80件、lint、typecheck、buildは成功。
- coreには障害物境界の連続接触、spawn/triggerのvalidation、連続analog axisの3点が残るためClaude側修正待ち。担当境界どおりChatGPT側からcoreは変更しない。
- M2のシーン統合は停止し、M1.4 Production確認を最優先する。
- M1.4の3エリア、横移動、カメラ、上下矢印、暗転遷移、横向き主人公、4時間帯、Web Audio、統合テスト、Browser Smokeは実装済み。
- `src/game/navigationAdapter/`は公開APIを維持したままClaude coreのarea graph query、horizontal movement、navigation state、validationを利用する実装へ差し替え済み。
- Node 22の`npm ci`とadapter統合後の`npm run check`は成功済み（97テスト）。統合後のローカルChromium Browser Smokeも15画面・3エリア・5遷移・全invariant、pageerror 0、failed request 0で成功。

## 進行中

1. Claude branchの残存3件を修正し、PR #33のQuality成功後にmainへマージする。
2. adapter統合後の変更をPR #32へ反映し、GitHub上のQualityとBrowser Smokeを再実行する。
3. PR #32のQuality、PR Browser Smoke、Claudeレビューを成功させる。
4. Browser Artifactで3エリア、接地、矢印、遷移、4時間帯を確認する。
5. 全gate成功後にmainへマージし、Vercel Productionへ反映する。
6. Production Smoke、Production Browser Smoke、Production実画面確認を完了する。

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

PR #33 head `9e794502`で残る障害物境界の継続侵入、spawn/trigger validation、連続analog axisの3点と回帰テストをClaude側で修正してください。修正後、PR #32のScene、adapter、Browser Smokeのコードレビューをお願いします。ChatGPT側は`src/game/navigationAdapter/`からのみ利用し、`src/game/navigation/`を変更しません。
