# デプロイ

Production Branchは`main`です。Vercelは`npm ci`、`npm run build`、`dist`公開で構築します。Feature、fix、chore、docs、codex、ci、diag、test系ブランチの自動Previewは停止しています。

## 標準フロー

1. Featureブランチで実装
2. `npm ci`と`npm run check`
3. Pull Request作成
4. PRのローカル本番ビルドに対してBrowser Smoke
5. ビジュアル変更では朝、昼、夕方、夜、主要エリアの実画面を取得して基準画像と比較
6. 品質成功後にユーザーの手動操作を待たずmainへマージ
7. Vercelの対象コミットがsuccessになるまで確認
8. Production URLのHTMLとJavaScriptバンドルを取得して軽量マーカー検査
9. Productionに対してBrowser Smokeを実行
10. タイトル開始、FPS、座標、チャンク、主要エリアへの実移動、pageerror・failed request 0件を確認
11. Productionの時間帯別・主要エリアスクリーンショットを確認
12. README、PROJECT_STATE、仕様書を確定

Vercelが`Ready`でも、古いコミット、古いJavaScript、実行時例外、または想定と異なる実画面の場合は完了ではありません。

## 三段階確認

### Production Smoke

公開HTMLとJavaScriptバンドル内にマイルストーン固有の文字列が存在するか確認します。配備されたコードの種類を高速に判定できますが、JavaScriptの実行成功までは保証しません。

M1.2では次を検査します。

- `M1.2 PAINTERLY HUD`
- `/assets/images/m12`
- `m12-bg-`
- `m12-player-`
- `なつかぜ公園`

アセットの完全パスは実行時に組み立てられるため、完全な`bg-residential-west-morning.webp`などを一続きのバンドル文字列として要求しません。

### Browser Smoke

Playwright ChromiumでProductionを開き、実際にボタンを押し、canvas、FPS、座標、チャンク、キーボード移動、公園内部到達、ブラウザー例外を確認します。ゲーム動作の完了判定に使用します。

### Visual Evidence

ビジュアル変更では、Productionから朝、昼、夕方、夜、主要エリアを撮影します。説明資料のモックアップではなく、Productionの実スクリーンショットを完了報告へ使用します。

実画面と基準画像に差が残る場合は、その差を隠さず既知の課題へ記録します。

## M1黒画面の原因と対策

2026-07-22、M1コードはProductionへ配備されていましたが、生成SVGのdata URL形式がPhaserローダーの期待と一致せず、`atob`の`InvalidCharacterError`でシーン初期化が停止しました。文字列だけの旧スモークは成功していました。

対策:

- SVGをUTF-8バイト列からbase64へ変換して読み込む
- PRとProductionの両方でBrowser Smokeを必須化する
- 非mainブランチのVercelビルドを抑制する
- Actions artifactを取得し、画面、console、network、traceを確認する

## M1.1確認済みProduction

- M1.1実装PR: #12
- Production確認済みコミット: `f06f5ef138d8871d7768103591ecf88dcd846626`
- Vercel: success
- Production Smoke: success
- Production Browser Smoke: success
- Production Browser Evidence run: `29915997279`

## M1.2確認済みProduction

- M1.2実装PR: #16
- M1.2実装マージ: `ecc77aa9ec2801a89e1d28edfd48d981f4de2665`
- Production検証PR: #17、#18
- Production確認済みコミット: `ddfba1f87835ed2c804fbd7f7cdadaaa38936e46`
- Production: https://boku-no-jihanki.vercel.app
- Vercel: success
- Production Smoke: success
- Production Browser Smoke: success
- Production Browser Evidence PR: #19（未マージでクローズ）
- Production Browser Evidence run: `29967805451`
- 初期座標: `650,550`
- 公園内部座標: `3158,550`
- 初期チャンク: `residential-west`
- 公園チャンク: `park-west`
- ロード済みチャンク: 2〜3
- Headless Chromium FPS: 9〜11
- 朝、昼、夕方、夜、公園のProduction実画面取得済み
- pageerror: 0
- failed request: 0

## Vercel Hobbyのビルド制限

Hobbyでは短時間の大量ビルドを避けます。レート制限時は空コミットを連続作成せず、制限窓が解除された後に一度だけ再デプロイします。Production Browser SmokeとVisual Evidence確認前は`PROJECT_STATE.json`を完了へ変更しません。
