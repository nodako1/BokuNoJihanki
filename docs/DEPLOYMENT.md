# デプロイ

Production Branchは`main`。Vercelは`npm ci`、`npm run build`、`dist`公開で構築します。Feature、fix、chore、docs、codexブランチの自動Previewは停止しています。

## 完了判定

1. PRの品質チェック成功
2. mainへマージ
3. Vercel statusがsuccess
4. Vercel対象SHAと機能マージSHAを照合
5. Production URLで本編を起動
6. 住宅街を操作し公園へ移動
7. Production確認後にPROJECT_STATEを確定

Hobbyのビルド制限時は連続空コミットを作らず、原因と解除時刻を確認して一度だけ再実行します。
