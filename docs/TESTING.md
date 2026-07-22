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
- ブラウザースモーク構成の存在とProduction接続

## Browser Smoke

UI、Canvas、ローダー、入力、Phaserの実行時エラーを検出するため、M1を変更するPull Requestでは`.github/workflows/browser-smoke.yml`を実行します。Playwright Chromiumで本番ビルドを起動し、`scripts/browser-smoke.mjs`が次を検証します。

1. ページとPhaser Canvasが起動する
2. 「夏休みを始める」を押せる
3. JavaScriptの`pageerror`と主要リソースの読み込み失敗がない
4. HUDのFPSが0より大きい
5. 初期座標が設定され、`residential-west`と隣接チャンクが読み込まれる
6. 矢印キーで主人公のX座標が増える
7. 住宅街から`park-west`へロード無しで到達する
8. Canvas単体のPNGが一定以上の情報量を持ち、黒一色の描画停止ではない
9. HUDのBuild SHAが検査対象コミットと一致する

実行ログ、Canvas画像、ページ全体画像はGitHub Actionsのartifactとして保存します。

## Production Smoke

main更新後は`.github/workflows/production-smoke.yml`がVercel statusを待ち、同じブラウザースモークを`https://boku-no-jihanki.vercel.app`へ実行します。`Production Smoke`がsuccessになるまで、Production確認済み・M1完了とは扱いません。

従来のJavaScriptバンドル文字列検査は、コードが含まれていることしか確認できず、Scene起動前の例外を見逃しました。今後は実ブラウザーで開始・描画・移動・公園到達まで確認します。

## 手動確認

自動テスト通過後も、スマートフォン横画面で仮想スティック、safe-area、音声開始、時間帯操作、衝突表示、住宅街と公園の往復を確認します。ユーザーから実機の不具合報告があった場合は、自動チェック成功を優先せず、Productionの実挙動を正として調査します。
