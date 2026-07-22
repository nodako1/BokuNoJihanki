# M1.1 ビジュアル完成対応 仕様書

## 状態

**完了・Vercel Production実ブラウザー確認済み**

- Pull Request: #12
- M1.1実装マージ: `8b9e4c2b77cb65750ae4b74ba14695636241269f`
- Production検証更新マージ: `f06f5ef138d8871d7768103591ecf88dcd846626`
- Production: https://boku-no-jihanki.vercel.app
- Vercel: success
- Production Smoke: success
- Production Browser Smoke: success
- Production Browser Evidence run: `29915997279`
- 初期座標: `650,590`
- 公園内部到達座標: `3180,590`
- pageerror: 0
- failed request: 0

## 背景

M1は移動・ストリーミング・衝突・Yソートを備えていましたが、最初の完成報告で提示した理想イメージと実際の簡易SVG画面に大きな差がありました。M1.1は、資料画像自体を貼り付けず、Productionで動く高密度な住宅街・公園・主人公・時間帯演出へ置き換えるためのビジュアル改修マイルストーンです。

## 目的

- 日本の夏休みらしい暖かさとノスタルジーを実画面で表現する
- 住宅街と公園の情報密度を高める
- 主人公が背景から浮かないよう統一する
- 見下ろし2.5Dの奥行きとYソートを維持する
- 朝・昼・夕方・夜の違いを明確にする
- M1のゲーム基盤と性能要件を維持する

## 実装範囲

### 背景

- `residential-west`: 交差点、住宅、道路、歩道、側道、生活設備
- `residential-east`: 公園通り、住宅、道路、公園入口への連続構成
- `park-west`: 公園入口、園路、看板、植栽、遊具
- `park-east`: 公園広場、園路、樹木、休憩設備

住宅街から公園の境界では、道路・歩道を公園の園路へ連続的に変形させ、チャンク境界のハードシームを抑えています。

### オブジェクト

- 住宅4種
- 樹木3種
- 生垣2種、低木、花壇
- 電柱、電線、街灯、道路反射鏡
- 郵便受け、自転車、架空自販機
- 金属柵、木製柵
- 公園看板、入口ゲート、ベンチ、滑り台、ブランコ、砂場、ごみ箱

### 主人公

- 上下左右4方向
- 待機・歩行差分
- 右入力時は右向き横顔
- 左入力時は左向き横顔
- 背景と共通の輪郭、影、色温度

### レイヤー

1. チャンク背景
2. 地面・道路・園路
3. 建物・樹木・設備
4. 生活小物
5. 主人公
6. 前景
7. 影・窓明かり・街灯・自販機照明
8. 時間帯グレーディング、雲影、光粒

### 時間帯

- 朝6:00
- 昼12:00
- 夕方18:00
- 夜21:00

色温度、影、背景Tint、窓明かり、街灯、自販機照明、公園の光粒を連続補間します。

## 維持したM1機能

- 4方向移動
- 仮想スティック
- WASD／矢印キー
- 追従カメラ
- 衝突判定
- 4チャンクストリーミング
- Y座標基準の2.5D描画順
- 時間帯変化
- 環境音
- 開発HUD
- Production Smoke
- Browser Smoke

## 非対象

自販機探索、所持金、抽選、15分行動消費、日付変更、NPC、会話、ショップ、イベント、インベントリ、セーブ、エンディング。

## テスト

### 静的品質

- [x] `npm ci`
- [x] `npm run validate`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run check`
- [x] GitHub Actions Quality

### PR Browser Smoke

- [x] タイトル開始
- [x] canvas、FPS、座標、チャンク初期化
- [x] 朝・昼・夕方・夜の住宅街を撮影
- [x] 住宅街から公園内部へ実移動
- [x] 公園内部を撮影
- [x] pageerror 0件
- [x] failed request 0件
- [x] 状態JSONとtrace保存

### Production

- [x] mainへマージ
- [x] Vercel Productionへ対象コミット反映
- [x] Production Smoke
- [x] Production Browser Smoke
- [x] Production時間帯別スクリーンショット確認
- [x] README／PROJECT_STATE最終確定

## Production Browser Smoke結果

- 初期座標: `650,590`
- 公園内部到達座標: `3180,590`
- 初期チャンク: `residential-west`
- 公園チャンク: `park-west`
- ロード済みチャンク: 2〜3
- pageerror: 0
- failed request: 0
- Production Browser Evidence run: `29915997279`

## ビジュアル比較結果

承認済み資料そのものは使用していません。M1.1では、高密度な住宅街、公園の植栽と遊具、斜めに伸びる道路、暖かい色、前景による奥行き、時間帯差を、プロジェクト独自のテクスチャ付きSVGとレイヤー構造で再構築しました。

一方で、承認済み資料のラスターペイントにある葉・瓦・壁面・路面の微細な筆致、光の回り込み、空気遠近は再現できていません。現在のM1.1は「高密度なベクター2.5D版」として完了しており、資料と同等のペインターリー品質を目指す場合は、別途ラスターペイントまたはプリレンダー3Dを使うアート制作パイプラインが必要です。

## 完了条件

- [x] M1の既存機能を維持
- [x] 住宅街、公園、主人公、時間帯を高密度化
- [x] Quality成功
- [x] PR Browser Smoke成功
- [x] mainマージ
- [x] Vercel Production反映
- [x] Production Smoke成功
- [x] Production Browser Smoke成功
- [x] Productionの朝・昼・夕方・夜・公園実画面を確認
- [x] 文書を実態へ更新
