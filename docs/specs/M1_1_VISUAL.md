# M1.1 ビジュアル完成対応 仕様書

## 状態

**実装・PR実ブラウザー確認済み／main・Production反映待ち**

- Pull Request: #12
- Production: https://boku-no-jihanki.vercel.app
- PR Quality: success
- PR Browser Smoke: success
- 初期座標: `650,590`
- 公園内部到達座標: `3180,590`
- pageerror: 0
- failed request: 0

Production SmokeとProduction Browser Smoke成功後に、状態を`completed-production-verified`へ確定します。

## 背景

M1は移動・ストリーミング・衝突・Yソートを備えていましたが、最初の完成報告で提示した高品質な理想イメージと、実際の簡易SVG画面に大きな差がありました。M1.1は、この差を解消し、資料用画像ではなくProductionで動くゲーム画面として世界観を完成させるためのマイルストーンです。

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

住宅街から公園の境界では、道路・歩道を公園の園路へ連続的に変形させ、チャンク境界のハードシームを抑えます。

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

## 維持するM1機能

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

- [ ] mainへマージ
- [ ] Vercel Productionへ対象コミット反映
- [ ] Production Smoke
- [ ] Production Browser Smoke
- [ ] Production時間帯別スクリーンショット確認
- [ ] README／PROJECT_STATE最終確定

## ビジュアル比較結果

承認済み資料と同じ画像を使用してはいません。M1.1は、資料の特徴である高密度な住宅街、公園の植栽と遊具、斜めに伸びる道路、暖かい色、前景による奥行き、時間帯差を、プロジェクト独自のテクスチャ付きSVGとして再構築しています。

残る差は、資料側のラスターペイントにある微細な筆致・素材感です。構図、密度、ゲームとしてのレイヤー分離、操作可能性を優先し、将来のM8で必要に応じてラスターペイントへ置き換えられる構造を維持します。

## 完了条件

- M1の既存機能を維持
- 住宅街、公園、主人公、時間帯を高密度化
- Quality成功
- PR Browser Smoke成功
- mainマージ
- Vercel Production反映
- Production Smoke成功
- Production Browser Smoke成功
- Productionの朝・昼・夕方・夜・公園実画面を確認
- 文書を実態へ更新
