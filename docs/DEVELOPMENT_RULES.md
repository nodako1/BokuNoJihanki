# 開発ルール Ver.2.2

## 標準フロー

仕様確認 → Featureブランチ → 実装とオリジナル素材 → `npm ci` → `npm run check` → PR → ローカル本番ビルドの`Browser Smoke` → 実画面レビュー → mainへマージ → Vercel Production → Productionの`Smoke`と`Browser Smoke` → Production実画面レビュー → 文書確定。

Previewは通常確認に使いません。PR作成だけ、mainマージだけ、Vercel Ready表示だけ、公開JavaScript内の文字列検査だけでは完了ではありません。ユーザーの手動マージを前提にしません。

## mainへ入れてはいけない状態

起動不能、操作不能、主要導線不能、無限ロード、画面外落下、重大なコンソールエラー、既存機能破壊、型・Lint・テスト・Build失敗、実ブラウザーでFPS・座標・チャンクが初期化されない状態、承認済みビジュアル目標から大きく乖離した未完成画面。

## 実ブラウザー確認

Playwright Chromiumでタイトル画面を開き、「夏休みを始める」を押した後に次を確認します。

- canvasが1つ存在する
- FPSが0より大きい
- 主人公座標が初期化されている
- 1つ以上のチャンクが読み込まれている
- `pageerror`と失敗リクエストが発生していない
- キーボード入力で主人公座標が変化する
- 主要エリアへ実際に到達できる
- スクリーンショット、ログ、状態JSON、traceをActions artifactへ保存する

## ビジュアル変更の追加確認

ビジュアルを変更したマイルストーンでは、最低限、朝・昼・夕方・夜・主要エリアの実スクリーンショットを取得します。承認済み資料や基準画像と比較し、密度、構図、奥行き、主人公と背景の統一感、時間帯差を確認します。

資料用の理想画像と実画面を混同しません。モックアップは「完成イメージ」と明記し、完了報告にはProductionから取得した実スクリーンショットを使用します。

## Vercelビルド抑制

Production Branchは`main`です。`feat/**`、`feature/**`、`fix/**`、`chore/**`、`docs/**`、`codex/**`、`ci/**`、`diag/**`、`test/**`はVercel Previewを生成しません。大量の検証コミットでHobbyのビルド回数を消費しないようにします。

## 記録

各マイルストーンでREADME、PROJECT_STATE、仕様、ロードマップ、テスト結果、既知の課題、素材来歴を更新します。Productionの実ブラウザー確認前に`completed-production-verified`を記録しません。

## 新しいチャット

READMEとPROJECT_STATEを入口に、実コード、main、PR、Actions、Vercel、Browser Smoke artifactを照合して現在地を判断します。過去会話を前提にしません。
