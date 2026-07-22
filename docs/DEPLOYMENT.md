# デプロイ

Production Branchは`main`。Vercelは`npm ci`、`npm run build`、`dist`公開で構築します。Feature、fix、chore、docs、codexブランチの自動Previewは停止しています。

## 標準フロー

1. Featureブランチで実装
2. `npm ci`と`npm run check`
3. Pull Request作成
4. 品質成功後にユーザーの手動操作を待たずmainへマージ
5. Vercelの対象コミットがsuccessになるまで確認
6. Production URLのHTMLとJavaScriptバンドルを取得
7. マイルストーン固有の実装マーカーを検査
8. `Production Smoke`がsuccessになったコミットをProduction確認済みとして記録
9. README、PROJECT_STATE、仕様書を確定

Vercelが`Ready`でも、古いコミットまたは古いJavaScriptが公開されている場合は完了ではありません。

## M1確認結果

- Production: https://boku-no-jihanki.vercel.app
- M1機能マージ: `432108024b40c9f3fc20aeec38b7bf871c192da1`
- Production確認済みコミット: `a169757a823e4ad19205072ab3ea1fc8651547aa`
- Vercel status: `success`
- Production Smoke: `success`
- M1検査マーカー: `M1 STREAMING HUD`、`なつかぜ公園`

## Production Smoke

`.github/workflows/production-smoke.yml`は、機能コードがmainへ入ったときに次を行います。

1. `Production Smoke`をpendingとしてコミットへ登録
2. 同じコミットのVercel statusを待機
3. Production URLからHTMLを取得
4. HTMLが参照するJavaScriptバンドルを取得
5. マイルストーン固有マーカーを検索
6. 成功または失敗をコミットステータスとして公開

README、`PROJECT_STATE.json`、`docs/**`だけの変更ではVercel再デプロイとスモークテストを発生させません。

## 失敗時

Hobbyのビルド制限時は連続空コミットを作らず、原因と解除時刻を確認して一度だけ再実行します。スモークテストが失敗した場合は、Vercel対象SHA、Production HTML、バンドルURL、検索マーカーを順に確認します。
