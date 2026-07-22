# テスト

## 一括確認

```bash
npm ci
npm run check
```

`check`は構成検証、ESLint、TypeScript、Node標準テスト、Vite本番ビルドを順に実行します。

## ロジック自動テスト

- PWA横画面設定
- M1.1／M2状態管理
- Vercelブランチ運用
- 斜め入力正規化
- チャンク計算と先読み
- 接地点depth
- マップ境界と衝突解決
- 住宅街／公園と地面種別の切り替え

## Browser Smoke

`.github/workflows/browser-smoke.yml`と`scripts/browser-smoke.mjs`を使用し、Playwright Chromiumで実際の画面を描画して操作します。

PRではViteの本番ビルドをローカル起動し、mainではVercel Productionを対象にします。

### 機能確認

1. タイトル画面が表示される
2. 「夏休みを始める」を押せる
3. canvasが1つ存在する
4. FPSが0より大きい
5. 主人公座標が0,0ではない
6. 1つ以上のチャンクが読み込まれる
7. `pageerror`とfailed requestが0件
8. キーボード入力で主人公のX座標が増える
9. 住宅街から公園へシームレスに移動する
10. 公園内部の座標まで到達する

### M1.1ビジュアル証跡

次の実画面を1280×720で撮影します。

- タイトル画面
- 朝6:00の住宅街
- 昼12:00の住宅街
- 夕方18:00の住宅街
- 夜21:00の住宅街
- 朝6:00の公園内部

通常画面の比較を妨げないよう、ビジュアル証跡では開発HUDを非表示にします。座標・FPS・チャンク・エリアの検査時だけHUDを表示します。

承認済み基準画像と比較し、次を確認します。

- 住宅街と公園の密度
- 道路、歩道、園路、植栽、生活小物の情報量
- 主人公と背景のスケール・画風の統一
- 見下ろし2.5Dの奥行き
- 住宅街と公園の境界に不自然な空白やハードシームがないこと
- 朝、昼、夕方、夜の差が読み取れること

### Artifact

- 6枚の実スクリーンショット
- ブラウザーコンソールログ
- 状態JSON
- Playwright trace

## M1.1 PR確認値

- 初期座標: `650,590`
- 公園内部座標: `3180,590`
- ロード済みチャンク: 2〜3
- pageerror: 0
- failed request: 0
- Headless Chromium FPS: 8〜9（software WebGL、trace・画面取得中）

Headless ChromiumのFPSは性能の絶対値ではありません。正式公開前に、代表的なiPhoneとAndroid実機で操作感・発熱・メモリを確認します。

## 2026-07-22 黒画面インシデント

従来の`Production Smoke`は公開JavaScript内の文字列だけを検査していたため、Phaser初期化時の実行時例外を検出できませんでした。生成SVGのpercent-encoded data URLがbase64として処理され、`atob`で`InvalidCharacterError`が発生していました。

以後、文字列検査は軽量な配備確認として残しますが、ゲームが動作したことの完了判定には`Browser Smoke`を必須とします。
