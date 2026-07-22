# 開発ルール Ver.2.3

## 標準フロー

仕様確認 → Featureブランチ → 実装・素材生成 → `npm ci` → `npm run check` → PR Browser Smoke → 実画面と基準画像の比較 → mainへマージ → Vercel Production → Production Smoke → Production Browser Smoke → 文書確定。

Previewは通常確認に使わない。ユーザーの手動マージを前提にしない。

## ビジュアル変更

- 説明資料やコンセプト画像を実装済み画面として報告しない
- ProductionまたはPR本番ビルドのスクリーンショットを証跡にする
- 朝・昼・夕方・夜、主要エリア、主人公移動後を撮影する
- 基準画像との差を画材、パース、密度、光、空気感、操作可能性で評価する
- UI付き一枚絵を貼って完了にしない。背景、前景、実プレイヤー、衝突を分離する

## mainへ入れてはいけない状態

起動不能、操作不能、主要導線不能、無限ロード、画面外落下、重大なブラウザー例外、型・Lint・テスト・Build失敗、実ブラウザーでFPS・座標・チャンクが初期化されない状態。

## 記録

各マイルストーンでREADME、PROJECT_STATE、仕様、ロードマップ、アート来歴、テスト証跡を更新する。Production Browser Smoke前に`completed-production-verified`を記録しない。
