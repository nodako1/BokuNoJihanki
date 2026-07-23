# テスト

## 一括確認

```bash
npm ci
npm run check
```

`check`は構成検証、ESLint、TypeScript、Node標準テスト、Vite本番ビルドを順に実行します。

## ロジック自動テスト

- PWA横画面設定
- マイルストーン状態管理
- Vercelブランチ運用
- 斜め入力正規化
- チャンク計算と先読み
- 接地点depth
- マップ境界と衝突解決
- 住宅街／公園と地面種別の切り替え
- M1.2アセットmanifest、4時間帯、4方向プレイヤー

## Browser Smoke

`.github/workflows/browser-smoke.yml`と`scripts/browser-smoke.mjs`を使用し、Playwright Chromiumで実際の画面を描画して操作します。

PRではViteの本番ビルドをローカル起動し、Production確認ではVercel Productionを対象にします。

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

### ビジュアル証跡

次のProduction実画面を1280×720で撮影します。

- タイトル画面
- 朝6:00の住宅街
- 昼12:00の住宅街
- 夕方18:00の住宅街
- 夜21:00の住宅街
- 朝6:00の公園内部

通常画面の比較を妨げないよう、撮影時は開発HUDを非表示にします。座標、FPS、チャンク、エリアの検査時だけHUDを表示します。

承認済み基準画像と比較する項目:

- カメラ角度とパース
- 住宅街と公園の密度
- 道路、植栽、住宅、遊具、生活小物
- 主人公と背景のスケール・画風
- 見下ろし2.5Dの奥行き
- 前景による遮蔽
- 朝、昼、夕方、夜の差
- チャンク境界の連続性

Visual Evidenceは「画面が描画された」という機能確認だけでなく、コンセプトと実装画面の差を明示するために使用します。差が残る場合は既知の課題へ記録します。

### Artifact

- 6枚の実スクリーンショット
- ブラウザーコンソールログ
- 状態JSON
- Playwright trace

## M1.2 PR確認値

- PR: `#16`
- 最終PR head: `67a482a5e646016b20cdb0bfb7e7885bf1071b34`
- Quality: success
- Browser Smoke: success
- Browser Smoke run: `29965537932`
- 初期座標: `650,550`
- 公園内部座標: `3191,550`
- ロード済みチャンク: 2〜3
- pageerror: 0
- failed request: 0

## M1.2 Production確認値

- 実装マージ: `ecc77aa9ec2801a89e1d28edfd48d981f4de2665`
- Production commit: `ddfba1f87835ed2c804fbd7f7cdadaaa38936e46`
- Vercel: success
- Production Smoke: success
- Production Browser Smoke: success
- Production Browser Evidence PR: `#19`（未マージでクローズ）
- Production Browser Evidence run: `29967805451`
- 初期座標: `650,550`
- 公園内部座標: `3158,550`
- 初期チャンク: `residential-west`
- 公園チャンク: `park-west`
- ロード済みチャンク: 2〜3
- Headless Chromium FPS: 9〜11
- pageerror: 0
- failed request: 0
- 朝、昼、夕方、夜の住宅街と公園内部のProduction画像を取得済み

Headless ChromiumのFPSは、software WebGL、trace、連続画面取得を含む値であり、一般端末の絶対性能値ではありません。正式公開前に代表的なiPhoneとAndroid実機で操作感、発熱、メモリを確認します。

## M1黒画面インシデント

2026-07-22、生成SVGのpercent-encoded data URLをPhaserがbase64として処理し、`atob`の`InvalidCharacterError`でScene初期化が停止しました。公開JavaScript内の文字列だけを確認する旧Production Smokeでは検出できませんでした。

以後、文字列検査は配備確認として残しますが、ゲーム動作の完了判定にはProduction Browser Smokeと実画面証跡を必須とします。

## M1.2 Production Smoke修正

M1.2アセットパスは実行時に組み立てるため、完全なファイルパスをProductionバンドルから検索する検査は誤失敗しました。現在は次の実行時マーカーを検査します。

- `M1.2 PAINTERLY HUD`
- `/assets/images/m12`
- `m12-bg-`
- `m12-player-`
- `なつかぜ公園`
