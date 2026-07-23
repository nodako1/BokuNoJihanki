# M1.2 ペインターリー高精細アートパイプライン 仕様書

## 状態

**完了・Vercel Production実ブラウザー確認済み**

- 実装Pull Request: #16
- 実装マージ: `ecc77aa9ec2801a89e1d28edfd48d981f4de2665`
- Production検証Pull Request: #17、#18
- Production確認済みコミット: `ddfba1f87835ed2c804fbd7f7cdadaaa38936e46`
- Production: https://boku-no-jihanki.vercel.app
- Vercel: success
- Production Smoke: success
- Production Browser Smoke: success
- Production Browser Evidence run: `29967805451`
- 初期座標: `650,550`
- 公園内部到達座標: `3158,550`
- pageerror: 0
- failed request: 0

M1.1の機能を維持しながら、承認済みコンセプト画像の画材、密度、パース、空気感を実ゲームへ移しました。M2の自販機探索は含めていません。

## 目的

- 実際のProduction画面を承認済みコンセプトへ近づける
- UI付きコンセプト画像をそのまま貼らず、ゲーム用レイヤーへ再構成する
- 固定カメラ、斜め見下ろし、暖色光、青緑の影を全エリアの基準にする
- 既存の移動、衝突、Yソート、4チャンクストリーミングを維持する
- 同一地点の朝・昼・夕方・夜を高品質ラスターバリエーションで表現する

## アセット構造

各チャンクに4つの背景と4つの透過前景を持ちます。

```text
bg-<chunk>-morning.webp
bg-<chunk>-day.webp
bg-<chunk>-evening.webp
bg-<chunk>-night.webp
fg-<chunk>-morning.webp
fg-<chunk>-day.webp
fg-<chunk>-evening.webp
fg-<chunk>-night.webp
```

対象チャンク:

1. `residential-west`
2. `residential-east`
3. `park-west`
4. `park-east`

背景はPhase間をアルファ補間します。透過前景は屋根、植栽などをプレイヤーより前へ描画し、奥行きを作ります。衝突情報と自販機IDは`worldConfig.ts`に保持し、背景画像から独立させます。

## 生成

`tools/art/reference/parts/`にプロジェクト専用の承認済みマスターをbase64分割で保持します。`tools/art/generate_m12_assets.py`は以下を決定論的に実行します。

1. マスター復元
2. 資料用HUD、ジョイスティック、FPS表示を含まない範囲を切り出す
3. 資料用プレイヤーをインペイントで除去
4. 1280×720へ変換
5. 鏡像チャンクを生成し境界ピクセルを一致させる
6. 朝、昼、夕方、夜の色、明るさ、発光を生成
7. 透過前景マスクを生成
8. 上下左右プレイヤーをラスタライズ
9. WebPとmanifestを出力

## 維持した機能

- スマホ仮想スティック
- WASD／矢印キー
- 4方向移動と歩行差分
- 追従カメラ
- 衝突判定
- 接地点基準Yソート
- チャンク先読み・解放
- 住宅街から公園へのシームレス移動
- 時間帯システム
- 環境音
- 開発HUD

## Production確認結果

Playwright ChromiumでProductionを開き、次を確認しました。

- タイトル画面からゲーム開始
- canvas、FPS、主人公座標、チャンク初期化
- 初期位置`650,550`、`residential-west`
- 住宅街から公園内部`3158,550`までキーボードで実移動
- 公園チャンク`park-west`、エリア`なつかぜ公園`
- ロード済みチャンク数2〜3
- 朝6:00、昼12:00、夕方18:00、夜21:00の住宅街を撮影
- 朝6:00の公園内部を撮影
- pageerror 0件
- failed request 0件
- 状態JSON、runtime log、Playwright traceを保存

Headless Chromiumはsoftware WebGLと連続撮影・trace記録を使用したため9〜11 FPSでした。これは一般端末の絶対性能値ではありません。

## 承認済みコンセプトとの比較

住宅、公園、道路、電柱、樹木、遊具、自販機、影、湿度感、斜め見下ろし構図は、承認済みコンセプトに近いProduction画面へ置き換わりました。コンセプト画像のUIを固定背景として貼ったものではなく、背景、前景、主人公、時間帯、衝突、ストリーミングを分離しています。

残る差:

- 右、左、上向き主人公は、背景と後ろ向き主人公より描き込みが簡略です。
- 現在の4チャンクは同一マスターと鏡像を利用しています。
- 駅前、商店街、学校、海、山などには専用マスターペイントが必要です。
- 代表的なiPhone／Android実機の性能確認が必要です。

## 完了条件

- [x] 4チャンク×4時間帯の背景が実ゲームで表示される
- [x] 前景レイヤーによりプレイヤーが近景の後ろへ入れる
- [x] 上下左右プレイヤーを実装
- [x] 住宅街から公園内部まで移動できる
- [x] Quality成功
- [x] PR Browser Smoke成功
- [x] mainへマージ
- [x] Vercel Production反映
- [x] Production Smoke成功
- [x] Production Browser Smoke成功
- [x] Productionの朝、昼、夕方、夜、公園画像を取得
- [x] README、PROJECT_STATE、アート、テスト、デプロイ文書を更新

## 次のマイルストーン

M2では、自販機への近接、状況対応ボタン、自販機の下／返却口の探索、固定乱数、所持金、15分経過、当日一回制御、ローカルセーブ基盤を実装します。
