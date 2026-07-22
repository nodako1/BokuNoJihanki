# テスト

## 一括確認

```bash
npm ci
npm run check
```

`check`は構成検証、ESLint、TypeScript、Node標準テスト、Vite本番ビルドを順に実行します。これは必要条件ですが、Canvasの実描画やブラウザー実行時例外までは保証しません。

## 静的・ロジック自動テスト

- PWA横画面設定
- M1／M2状態管理
- Vercelブランチ運用
- 斜め入力正規化
- チャンク計算と先読み
- 接地点depth
- マップ境界と衝突解決
- Browser Smoke構成とbase64 SVG読込の必須化

## Browser Smoke

UI、Canvas、アセットローダー、入力、Phaserの実行時エラーを検出するため、M1を変更するPull Requestとmain更新時に`.github/workflows/browser-smoke.yml`を実行します。Playwright Chromiumで`script/browser-smoke.mjs`ではなく、正しい`script`名ではなくリポジトリ内の`scripts/browser-smoke.mjs`を実行し、次を検証します。

1. ページとPhaser Canvasが起動する
2. 「夏休みを始める」を押せる
3. JavaScriptの`pageerror`がない
4. HUDのFPSが0より大きい
5. 初期座標とロード済みチャンクが設定される
6. Canvasが1つだけ存在する
7. 矢印キー入力後に主人公のX座標が実際に増える
8. HUDのBuild SHAが検査対象コミットと一致する

実行ログ、開始前・開始後・移動後のスクリーンショット、状態JSON、Playwright traceはGitHub Actionsのartifactとして保存します。

## Production確認

main更新時の`Browser Smoke`は、Vercel Productionに対象コミットが反映されるまで待ってから、同じ実ブラウザー検査を`https://boku-no-jihanki.vercel.app`へ実行します。Vercel statusとProductionのBrowser Smokeが成功するまで、Production確認済み・M1完了とは扱いません。

従来のJavaScriptバンドル文字列検査は、コードが含まれていることしか確認できず、Scene起動前の例外を見逃しました。今後は実ブラウザーで開始・描画・移動まで確認します。

## 手動確認

自動テスト通過後も、スマートフォン横画面で仮想スティック、safe-area、音声開始、時間帯操作、衝突表示、住宅街と公園の往復を確認します。ユーザーから実機の不具合報告があった場合は、自動チェック成功を優先せず、Productionの実挙動を正として調査します。
