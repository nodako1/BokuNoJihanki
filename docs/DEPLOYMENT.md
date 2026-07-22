# デプロイ

Production Branchは`main`です。Vercelは`npm ci`、`npm run build`、`dist`公開で構築します。Feature、fix、chore、docs、codex、ci、diag、test系ブランチの自動Previewは停止しています。

## 標準フロー

1. Featureブランチで実装
2. `npm ci`と`npm run check`
3. Pull Request作成
4. PRのローカル本番ビルドに対して`Browser Smoke`
5. ビジュアル変更では朝・昼・夕方・夜・主要エリアの実画面を取得して基準画像と比較
6. 品質成功後にユーザーの手動操作を待たずmainへマージ
7. Vercelの対象コミットがsuccessになるまで確認
8. Production URLのHTMLとJavaScriptバンドルを取得して軽量マーカー検査
9. Productionに対して`Browser Smoke`を実行
10. タイトル開始、FPS、座標、チャンク、主要エリアへの実移動、pageerror・failed request 0件を確認
11. Productionの時間帯別・主要エリアスクリーンショットを確認
12. README、PROJECT_STATE、仕様書を確定

Vercelが`Ready`でも、古いコミット、古いJavaScript、実行時例外、または想定と異なる実画面の場合は完了ではありません。

## 三段階確認

### Production Smoke

公開HTMLとJavaScriptバンドル内にマイルストーン固有の文字列が存在するか確認します。配備されたコードの種類を高速に判定できますが、JavaScriptの実行成功までは保証しません。

M1.1では次を検査します。

- `M1.1 VISUAL HUD`
- `m11-bg-residential-west`
- `m11-bg-park-west`
- `なつかぜ公園`

### Browser Smoke

Playwright ChromiumでProductionを開き、実際にボタンを押し、canvas・FPS・座標・チャンク・キーボード移動・主要エリア到達・ブラウザー例外を確認します。ゲーム動作の完了判定に使用します。

### Visual Evidence

ビジュアル変更では、Productionから朝・昼・夕方・夜・主要エリアを撮影します。説明資料のモックアップではなく、Productionの実スクリーンショットを完了報告へ使用します。

実画面と基準画像に差が残る場合は、その差を隠さず既知の課題へ記録します。

## M1黒画面の原因と対策

2026-07-22、M1コードはProductionへ配備されていましたが、生成SVGのdata URL形式がPhaserローダーの期待と一致せず、`atob`の`InvalidCharacterError`でシーン初期化が停止しました。文字列だけの旧スモークは成功していました。

対策:

- SVGをUTF-8バイト列からbase64へ変換して読み込む
- PRとProductionの両方でBrowser Smokeを必須化する
- 非mainブランチのVercelビルドを抑制する
- Actions artifactを取得し、画面・console・network・traceを確認する

## M1確認済みProduction

- Production: https://boku-no-jihanki.vercel.app
- 黒画面修正マージ: `28b7ab6454d523d8ba4c4572e5c940356d8a5513`
- M1 Production確認済みコミット: `6b20507c35e49af4e058d7a6f6ffa57c4e5f991f`
- Vercel status: success
- Production Smoke: success
- Production Browser Smoke: success

## M1.1確認済みProduction

- M1.1実装PR: #12
- M1.1実装マージ: `8b9e4c2b77cb65750ae4b74ba14695636241269f`
- Production検証更新PR: #13
- Production確認済みコミット: `f06f5ef138d8871d7768103591ecf88dcd846626`
- Production: https://boku-no-jihanki.vercel.app
- Vercel status: success
- Production Smoke: success
- Production Browser Smoke: success
- Production Browser Evidence run: `29915997279`
- 初期座標: `650,590`
- 公園内部座標: `3180,590`
- 初期チャンク: `residential-west`
- 公園チャンク: `park-west`
- 朝・昼・夕方・夜・公園のProduction実画面取得済み
- pageerror: 0
- failed request: 0

## Vercel Hobbyのビルド制限

Hobbyでは短時間の大量ビルドを避けます。レート制限時は空コミットを連続作成せず、制限窓が解除された後に一度だけ再デプロイします。Production Browser SmokeとVisual Evidence確認前は`PROJECT_STATE.json`を完了へ変更しません。

## M1.2デプロイ条件

Production Smokeは`M1.2 PAINTERLY HUD`と`assets/images/m12`を検出する。Production Browser Smokeでは、4時間帯、住宅街、公園内部、主人公移動、チャンク読み込み、ブラウザー例外0件を確認する。Vercel Readyだけでは完了としない。
