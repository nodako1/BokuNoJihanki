# テスト

## 一括確認

```bash
npm ci
npm run check
```

`check`は構成検証、ESLint、TypeScript、Node標準テスト、Vite本番ビルドを順に実行します。

## ロジック自動テスト

- PWA横画面設定
- M1／M2状態管理
- Vercelブランチ運用
- 斜め入力正規化
- チャンク計算と先読み
- 接地点depth
- マップ境界と衝突解決

## Browser Smoke

`.github/workflows/browser-smoke.yml`と`scripts/browser-smoke.mjs`を使用し、Playwright Chromiumで実際の画面を描画して操作します。

PRではViteの本番ビルドをローカル起動し、mainではVercel Productionを対象にします。

必須確認:

1. タイトル画面が表示される
2. 「夏休みを始める」を押せる
3. canvasが1つ存在する
4. FPSが0より大きい
5. 主人公座標が0,0ではない
6. 1つ以上のチャンクが読み込まれる
7. `pageerror`が発生していない
8. ArrowRight入力後に主人公のX座標が増える

Actions artifactには次を保存します。

- タイトル画面
- 開始直後の画面
- 移動後の画面
- ブラウザーコンソールログ
- 状態JSON
- Playwright trace

## 2026-07-22 黒画面インシデント

従来の`Production Smoke`は公開JavaScript内の文字列だけを検査していたため、Phaser初期化時の実行時例外を検出できませんでした。生成SVGのpercent-encoded data URLがbase64として処理され、`atob`で`InvalidCharacterError`が発生していました。

以後、文字列検査は軽量な配備確認として残しますが、ゲームが動作したことの完了判定には`Browser Smoke`を必須とします。
