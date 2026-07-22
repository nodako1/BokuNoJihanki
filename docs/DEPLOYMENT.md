# デプロイ

Production Branchは`main`。Vercelは`npm ci`、`npm run build`、`dist`公開で構築します。Feature、fix、chore、docs、codexブランチの自動Previewは停止しています。

## 標準フロー

1. Featureブランチで実装
2. `npm ci`と`npm run check`
3. Pull Requestで`Quality`と`Browser Smoke`を成功させる
4. 品質成功後にユーザーの手動操作を待たずmainへマージ
5. Vercelの対象コミットがsuccessになるまで確認
6. Playwright ChromiumでProduction URLを開く
7. タイトル開始、Canvas生成、FPS、座標、チャンク、キーボード移動を検査
8. JavaScriptの`pageerror`と期待SHA不一致がないことを確認
9. VercelとProductionのBrowser Smokeが成功したコミットをProduction確認済みとして記録
10. README、PROJECT_STATE、仕様書を確定

Vercelが`Ready`でも、古いコミット、黒いCanvas、Scene起動前例外、操作不能のいずれかがある場合は完了ではありません。JavaScriptバンドルに実装文字列が存在するだけでも完了とは扱いません。

## M1ランタイム障害

Production確認済みとしていた`a169757a823e4ad19205072ab3ea1fc8651547aa`では、タイトル後にUIだけが表示され、HUDが0 FPS・座標0,0・チャンク0件、Canvasが黒い状態になることが実機確認で判明しました。

原因は、コード内SVGをpercent-encoded Data URIでPhaserへ渡した結果、Phaser 4.2.1のローダーがペイロードへ`atob`を適用し、`InvalidCharacterError`でScene起動前に停止したことです。UTF-8 SVGをbase64 Data URIへ変換する修正と、同種の障害を検出するブラウザースモークを導入しました。

- 黒画面修正マージ: `28b7ab6454d523d8ba4c4572e5c940356d8a5513`
- ローカルChromium確認: FPS、初期座標、ロード済みチャンク、ArrowRight移動、pageerrorなしを確認
- Vercel: Hobbyのbuild rate limitにより修正コミットの初回デプロイ失敗
- 再試行: rate limitの時間枠リセット後に一度だけProductionデプロイとブラウザー検査を実行

修正コミットがVercelへ反映され、ProductionのBrowser Smokeが成功するまで、M1のProduction完了状態は再確定しません。

## Browser Smoke

`.github/workflows/browser-smoke.yml`はM1に関係するPull Requestとmain更新で次を行います。

1. クリーンインストールと本番ビルド
2. Playwright Chromiumを準備
3. PRではローカルProduction build、mainではVercel Productionを開く
4. 「夏休みを始める」を押す
5. FPS、座標、ロード済みチャンク、Canvas数を確認
6. 矢印キーで主人公が移動することを確認
7. `pageerror`とBuild SHAを検査
8. ログ、状態JSON、スクリーンショット、traceをartifactへ保存

## 旧Production Smoke

`.github/workflows/production-smoke.yml`によるバンドル文字列検査は補助情報として残っていますが、M1完了の根拠には使用しません。Production完了判定は実ブラウザーの`Browser Smoke`を優先します。

README、`PROJECT_STATE.json`、`docs/**`だけの変更ではProduction用Browser Smokeを発生させません。文書確定コミットには`[skip ci]`を使用し、確認済みProductionコミットを維持します。

## 失敗時

Hobbyのビルド制限時は連続空コミットを作らず、原因と解除時間枠を確認して一度だけ再実行します。ブラウザー検査が失敗した場合は、Vercel対象SHA、Build表示、ブラウザーログ、`pageerror`、HUD、Canvas画像、Playwright traceの順に確認します。ユーザー実機と自動検査が食い違う場合は、ユーザー実機の結果を優先して再現テストを追加します。
