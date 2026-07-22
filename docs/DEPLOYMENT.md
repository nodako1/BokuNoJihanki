# デプロイ

Production Branchは`main`。Vercelは`npm ci`、`npm run build`、`dist`公開で構築します。Feature、fix、chore、docs、codexブランチの自動Previewは停止しています。

## 標準フロー

1. Featureブランチで実装
2. `npm ci`と`npm run check`
3. Pull Requestで`Quality`と`Browser Smoke`を成功させる
4. 品質成功後にユーザーの手動操作を待たずmainへマージ
5. Vercelの対象コミットがsuccessになるまで確認
6. Production URLをPlaywright Chromiumで開く
7. タイトル開始、Canvas描画、FPS、初期チャンク、キーボード移動、公園到達を検査
8. JavaScript例外、主要リソース失敗、黒画面、期待SHA不一致がないことを確認
9. `Production Smoke`がsuccessになったコミットをProduction確認済みとして記録
10. README、PROJECT_STATE、仕様書を確定

Vercelが`Ready`でも、古いコミット、黒いCanvas、Scene起動前例外、操作不能のいずれかがある場合は完了ではありません。JavaScriptバンドルに実装文字列が存在するだけでも完了とは扱いません。

## M1ランタイム障害

Production確認済みとしていた`a169757a823e4ad19205072ab3ea1fc8651547aa`では、タイトル後にUIだけが表示され、HUDが0 FPS・座標0,0・チャンク0件、Canvasが黒い状態になることが実機確認で判明しました。

原因は、コード内SVGをpercent-encoded Data URIでPhaserへ渡した結果、Phaser 4.2.1のローダーがペイロードへ`atob`を適用し、`InvalidCharacterError`でScene起動前に停止したことです。UTF-8 SVGをbase64 Data URIへ変換する修正と、同種の障害を検出するブラウザースモークを導入しました。

修正コミットをmainへマージし、Vercelと`Production Smoke`が成功するまで、M1のProduction完了状態は再確定しません。

## Browser Smoke

`.github/workflows/browser-smoke.yml`はM1に関係するPull Requestで次を行います。

1. クリーンインストールと`npm run check`
2. ViteのProduction buildをローカル起動
3. Playwright Chromiumでゲームを開く
4. 「夏休みを始める」を押す
5. FPS、座標、初期チャンク、読み込み済みチャンクを確認
6. 矢印キーで移動し、住宅街から公園へ到達
7. `pageerror`、主要リソース失敗、Canvas画像、Build SHAを検査
8. ログとスクリーンショットをartifactへ保存

## Production Smoke

`.github/workflows/production-smoke.yml`は、機能コードがmainへ入ったときに次を行います。

1. `Production Smoke`をpendingとしてコミットへ登録
2. 同じコミットのVercel statusを待機
3. Playwright Chromiumを準備
4. Production URLへ`Browser Smoke`と同じ実操作検査を実行
5. 成功または失敗をコミットステータスとして公開
6. 証跡画像とログをartifactへ保存

README、`PROJECT_STATE.json`、`docs/**`だけの変更ではVercel再デプロイとProductionスモークを発生させません。

## 失敗時

Hobbyのビルド制限時は連続空コミットを作らず、原因と解除時刻を確認して一度だけ再実行します。スモークテストが失敗した場合は、Vercel対象SHA、Build表示、ブラウザーログ、`pageerror`、リソース失敗、HUD、Canvas画像の順に確認します。ユーザー実機と自動検査が食い違う場合は、ユーザー実機の結果を優先して再現テストを追加します。
