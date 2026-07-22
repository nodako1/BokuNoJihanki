# 開発ルール Ver.2.0

## 標準フロー

仕様確認 → Featureブランチ → 実装と素材 → `npm ci` → `npm run check` → PR → `Browser Smoke` → mainへマージ → Vercel Production → 実ブラウザーの`Production Smoke` → 対象コミットと動作確認 → 文書確定。

Previewは通常確認に使いません。PR作成だけ、mainマージだけ、Vercel Ready表示だけ、公開バンドルの文字列検査だけでは完了ではありません。ユーザーの手動マージを前提にしません。

## mainへ入れてはいけない状態

起動不能、黒いCanvas、0 FPS、座標未初期化、操作不能、主要導線不能、無限ロード、画面外落下、重大なコンソールエラー、主要リソース読み込み失敗、既存機能破壊、型・Lint・テスト・Build・Browser Smoke失敗。

## ブラウザー確認

Canvas、Phaser、アセットローダー、入力を変更するPRは、Playwright Chromiumでタイトル開始、描画、HUD初期化、キーボード移動、住宅街から公園への到達を検査します。mainマージ後は同じ検査をVercel Productionへ実行します。

自動検査がsuccessでも、ユーザーの実機で重大な不具合が確認された場合は完了判定を取り消し、実機結果を正として再現テストと修正を追加します。

## 記録

各マイルストーンでREADME、PROJECT_STATE、仕様、ロードマップ、既知の課題、素材来歴を更新します。Productionの実ブラウザー確認前に`completed-production-verified`を記録しません。誤って完了扱いした場合は、直ちに状態を未確認へ戻し、原因と再発防止を記録します。

## 新しいチャット

READMEとPROJECT_STATEを入口に、実コード、main、PR、Actionsの`Quality`・`Browser Smoke`、Vercel、`Production Smoke`を照合して現在地を判断します。過去会話を前提にしません。
