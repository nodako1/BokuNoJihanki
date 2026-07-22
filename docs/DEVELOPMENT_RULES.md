# 開発ルール Ver.2.0

## 標準フロー

仕様確認 → Featureブランチ → 実装と素材 → `npm ci` → `npm run check` → PR → mainへマージ → Vercel Production → 対象コミットと動作確認 → 文書確定。

Previewは通常確認に使いません。PR作成だけ、mainマージだけ、Vercel Ready表示だけでは完了ではありません。ユーザーの手動マージを前提にしません。

## mainへ入れてはいけない状態

起動不能、操作不能、主要導線不能、無限ロード、画面外落下、重大なコンソールエラー、既存機能破壊、型・Lint・テスト・Build失敗。

## 記録

各マイルストーンでREADME、PROJECT_STATE、仕様、ロードマップ、既知の課題、素材来歴を更新します。Production確認前に`completed-production-verified`を記録しません。

## 新しいチャット

READMEとPROJECT_STATEを入口に、実コード、main、PR、Actions、Vercelを照合して現在地を判断します。過去会話を前提にしません。
