# テスト

## 一括確認

```bash
npm ci
npm run check
```

## M1.3ロジック

- point-in-polygon
- 円形フットプリントがwalkable内に収まること
- obstacleポリゴンとの交差拒否
- サブステップによるすり抜け防止
- 壁沿いスライド
- 方向選択
- 4区間マップと必須レイヤー
- 私有地サンプルが歩行不可
- 電柱、自販機、出口バリケード
- AreaTransition状態遷移
- 4方向の待機と8歩行フレーム

## Browser Smoke

PRではローカル本番ビルド、mainではVercel ProductionをPlaywright Chromiumで操作する。

確認内容:

1. 主人公の家の前から開始
2. 右・左・正面・後ろ歩行
3. walkable境界へ衝突
4. デバッグポリゴン表示
5. 4区間を横断
6. 足音カウンター増加
7. 朝・昼・夕方・夜
8. pageerror／failed request 0件

Artifactにはタイトル、家の前、方向別歩行、衝突デバッグ、4区間、4時間帯、state.json、console、traceを保存する。

## M1.4 2D横スクロール（完了・Production確認済み）

### navigation単体テスト

navigationコアでは、area graph、exit、spawn、横移動、遷移state machine、input lock、データ検証をPhaserなしで確認する。

PR #33でnavigation coreをmainへ統合し、`src/game/navigationAdapter/`からcoreを呼ぶ境界を`tests/m14-integration.test.mjs`で検証する。core単体50件とM1.4統合15件を含む全107件が最終PR headで成功した。

- 3 area IDと4本の有効な接続
- 接続先area／spawnの存在
- world width、groundY、trigger範囲、spawn座標の妥当性
- 左右入力による加速、減速、向き、端のクランプ
- 上下入力が通常のX／Y移動を発生させない
- trigger外の上下入力が無効
- 正しいtriggerだけがtransition intentを返す
- transition中のinput lock
- target area、spawn、facingの解決
- 到着直後の押しっぱなしによる逆戻り防止

### M1.4統合テスト

- 左入力で左、右入力で右へ移動する
- 入力解除で自然に停止する
- `playerY`が現在areaの`groundY`から変わらない
- 分岐以外の上・下入力で移動も遷移もしない
- `life-road`の分岐で上矢印が表示され、上入力で`upper-vending-lane`へ移る
- `upper-vending-lane`の分岐で下矢印が表示され、下入力で`life-road`へ戻る
- `home-street`右端と`life-road`左端を往復できる
- 閉鎖端では背景外へ出ず、未完成areaへ遷移しない
- 遷移中は速度0、入力ロック、再遷移不可
- 遷移後のspawn、groundY、向きが正しい
- 時刻、4時間帯、音声ON／OFFが遷移後も一致する
- cameraがXだけ追従し、現在viewportから算出した`0..cameraMaxX`を越えない
- 実移動中は左右歩行frameが変わる
- 停止時と端でblocked時は待機へ戻る
- 接地frame 2・7で足音が増え、非移動時は増えない
- 単純なblurで入力、速度、足音が停止するが、master gainは変更しない
- `document.hidden`で入力、速度、足音が停止し、master gainが下がる
- エリア遷移後もScene、bridge listener、AudioContextが一つである
- M1.3のテストとM2 economyコアのテストが退行しない

### M1.4 Browser Smoke

PRではローカルproduction build、mainマージ後は実際のVercel ProductionをPlaywright Chromiumで操作する。

1. ゲーム開始
2. 自宅前で右歩行とcamera追従
3. 自宅前右端
4. 暗転・短いロード・地名表示
5. 生活道路への到着
6. 左端から自宅前へ帰還
7. 生活道路の上分岐まで移動
8. 上矢印表示と上入力
9. 自販機路地への到着
10. 自販機路地で右・左歩行
11. 下矢印表示と下入力
12. 生活道路の対応spawnへ帰還
13. 朝、昼、夕方、夜
14. 右歩行、左歩行、停止待機
15. `pageerror` 0件、failed request 0件

通常の1280×720と代表スマホ横画面844×390で同じfull scenarioを実行する。Artifactへ、自宅前、右向き歩行、左向き歩行、自宅前右端、ロード画面、生活道路、上矢印、自販機路地、下矢印、朝、昼、夕方、夜、state JSON、consoleを保存する。1280×720ではPlaywright traceも保存し、844×390ではArtifact容量を抑えるためtraceを無効にする。

### 人間によるVisual Review

自動テストとは別に、PRとProductionの実画面で次を確認する。

- 主人公が地面を踏んで見え、足滑りが目立たない
- 左右の足と腕が動き、停止時に待機へ戻る
- 3エリアが反転や複製ではなく別の場所に見える
- 主人公と背景の画材、光、解像感が統一されている
- 上下矢印とエリア接続が直感的である
- 暗転とロードが長すぎない
- camera followとlook-aheadが不自然でない
- スマートフォン横画面で入力しやすい
- 住宅街を探検している感覚がある

### Quality gate

```bash
npm ci
npm run validate
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

テスト、PR Browser Smoke、Visual Review、navigation core監査、最終Codexレビュー、Production Smoke、Production Browser Smoke、Production実画面確認のどれかが未完了なら、M1.4をProduction確認済みとしない。

### M1.4確定結果

#### Pull Request #32

- head: `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`
- Quality run: `30008762303` — success、107/107 tests
- Browser Smoke run: `30008762333` — success
- Artifact: `8564271801` / `browser-smoke-30008762333`
- digest: `sha256:114c5256bf0657f33441ad8a2bcf8c6e918d1a4505e9976736d9c106975f4e5b`
- expected commit: `5c6895d`
- 15画面、3エリア、5遷移
- vertical ground line、camera follow／bounds、focus-loss stop、transition lock、時刻／mute保持、idle復帰: すべて成功
- pageerror: 0、failed request: 0
- 最終Codexレビュー: major issueなし、review thread 2/2解決

#### Production

- merge: `147f770a4b73077c4e5dc0523839b3fefb789db4`
- Quality run: `30009404756` — success
- Production Smoke run: `30009405068` — success
- Production Browser Smoke run: `30009404814` — success
- Artifact: `8564582434` / `browser-smoke-30009404814`
- digest: `sha256:6f83bfcf99ac2f2af0e98899568ee2c17ac28e3f3ad70aef29f4c7f7c26744f3`
- expected commit: `147f770`
- 15画面、3エリア、5遷移、全invariant成功
- pageerror: 0、failed request: 0
- 公開URLでbuild `147f770`、左右タッチ移動、停止、時刻操作、mute操作を確認

run URL、Artifact digest、目視確認を含む確定証跡は[M1.4 Production Evidence](evidence/M1_4_PRODUCTION_EVIDENCE.md)を正とする。
