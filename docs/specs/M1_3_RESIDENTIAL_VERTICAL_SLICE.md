# M1.3 住宅街プレイアブル縦切り再構築 仕様書

## 状態

**実装中／Production確認前**

M1.2で確立したペインタリーな世界観を維持しつつ、背景画像の上を自由に滑る方式を廃止し、住宅街だけを完成度の高いプレイアブル縦切りとして再構築する。

## 目的

- 主人公が道路と歩道を地面として踏んで歩いて見える
- 家、庭、屋根、塀、柵へ侵入できない
- 横スクロール中心、上下は限定奥行きのベルトスクロール型2.5Dにする
- 正面、後ろ、左、右で同一人物に見える本物の歩行アニメーションを用意する
- シームレス性より、各エリアの完成度と入力の信頼性を優先する

## 住宅街構成

全長5,120×720論理ピクセル、4区間。

1. `home-front`: 主人公の家の前
2. `life-road`: 住宅が並ぶ生活道路と細い上り路地
3. `alley-corner`: 曲がり角と奥へ続く細い路地
4. `vending-crossing`: 自販機のある小交差点と公園方面出口

公園内部はM1.3のプレイ可能範囲から外す。出口は看板とバリケードで示し、AreaTransitionSystemの将来接続点として保持する。

## マップデータ

`src/game/world/residential-m13-map.json`はTiled互換JSONで、次のレイヤーを持つ。

- `background-far`
- `background-main`
- `ground`
- `walkable`
- `obstacles`
- `occlusion`
- `interactions`
- `exits`
- `spawn-points`
- `camera-bounds`
- `debug-labels`

家、庭、屋根、塀、柵は原則としてwalkableポリゴン外に置く。電柱、自販機、標識、出口バリケードなど、道路内の障害物のみobstaclesへ定義する。

## 移動・衝突

- 足元半径12pxの円形フットプリント
- walkableポリゴン内に全サンプル点が収まる場合のみ移動可能
- obstacleポリゴンとの円・線分交差を拒否
- 最大4pxのサブステップで高速すり抜けを防止
- 斜め衝突時はX/Yの有効軸を試し、壁沿いにスライド
- X最大150px/s、Y最大112px/s
- 加速820px/s²、減速1,180px/s²

## 主人公アニメーション

`public/assets/images/m13/player-atlas.webp`とJSON atlasを使用する。

- 4方向の待機：4フレーム
- 4方向×8フレームの歩行：32フレーム
- 合計36フレーム
- 11fps
- 左右の足と腕を逆位相で振る
- 実座標が移動した場合だけ歩行を再生
- 接地フレーム1・5に足音を同期
- 足元影は身体と別レイヤー

## カメラ

- 横方向の手動追従
- 速度に応じた最大88pxのlook-ahead
- 0.075の追従補間
- 縦スクロールは行わず、上下移動で画面が揺れない
- 世界端を超えて表示しない

## アート

`tools/art/generate_m13_assets.py`が、承認済みプロジェクトマスターの画材を使いながら、4区間を独立構図として生成する。

- 4区間×朝・昼・夕方・夜の16背景
- 区間ごとに分割した透過前景
- 36フレームの主人公atlas
- WebPとmanifest

M1.2の住宅街・公園画像はフォールバックとアート履歴として残すが、Productionのプレイ可能マップには使わない。

## 完了条件

- Quality成功
- PR Browser Smoke成功
- 家・私有地・柵への侵入不可
- 4方向の歩行アニメーションと足音同期
- 4区間の横スクロール
- mainマージ
- Vercel Production成功
- Production Smoke成功
- Production Browser Smoke成功
- Productionの方向別、衝突、4区間、4時間帯の実画面確認
- README、PROJECT_STATE、関連文書確定
