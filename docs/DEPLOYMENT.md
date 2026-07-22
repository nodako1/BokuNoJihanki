# デプロイ

Production Branchは`main`です。Vercelは`npm ci`、`npm run build`、`dist`公開で構築します。Feature、fix、chore、docs、codex、ci、diag、test系ブランチの自動Previewは停止しています。

## 標準フロー

1. Featureブランチで実装
2. `npm ci`と`npm run check`
3. Pull Request作成
4. PRのローカル本番ビルドに対して`Browser Smoke`
5. 品質成功後にユーザーの手動操作を待たずmainへマージ
6. Vercelの対象コミットがsuccessになるまで確認
7. Production URLのHTMLとJavaScriptバンドルを取得して軽量マーカー検査
8. Productionに対して`Browser Smoke`を実行
9. タイトル開始、FPS、座標、チャンク、実移動、pageerrorなしを確認
10. スクリーンショット、ログ、状態JSON、traceを保存
11. README、PROJECT_STATE、仕様書を確定

Vercelが`Ready`でも、古いコミット、古いJavaScript、または実行時例外でゲームが停止している場合は完了ではありません。

## 二段階スモークテスト

### Production Smoke

公開HTMLとJavaScriptバンドル内にマイルストーン固有の文字列が存在するか確認します。配備されたコードの種類を高速に判定できますが、JavaScriptの実行成功までは保証しません。

### Browser Smoke

Playwright ChromiumでProductionを開き、実際にボタンを押し、canvas・FPS・座標・チャンク・キーボード移動・ブラウザー例外を確認します。こちらをゲーム動作の完了判定に使用します。

## M1黒画面の原因と対策

2026-07-22、M1コードはProductionへ配備されていましたが、生成SVGのdata URL形式がPhaserローダーの期待と一致せず、`atob`の`InvalidCharacterError`でシーン初期化が停止しました。文字列だけの旧スモークは成功していました。

対策:

- SVGをUTF-8バイト列からbase64へ変換して読み込む
- PRとProductionの両方でBrowser Smokeを必須化する
- 非mainブランチのVercelビルドを抑制する
- Actions artifactを開発担当AIが取得し、画面・console・network・traceを確認する

## Vercel Hobbyのビルド制限

Hobbyでは短時間の大量ビルドを避けます。レート制限時は空コミットを連続作成せず、制限窓が解除された後に一度だけ再デプロイします。Production確認前は`PROJECT_STATE.json`を完了へ戻しません。
