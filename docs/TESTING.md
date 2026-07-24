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

## M1.5 実機品質修正版（必須・再構築中）

M1.4の107件成功、Browser Smoke、Artifact、Production Evidenceは配信履歴として保持するが、M1.5 candidateの合格証跡には流用しない。過去の未push commit `04c6d0879fc4283d94d0a6d515a1916a0999406b`に対して報告された件数、画像、hash、座標、音声値も再利用しない。M1.5の件数と測定値は、現在のcandidateから実行して報告する。

### 実行環境

- Node.js 22系
- repositoryの既存lockfile
- npm cache権限で失敗する場合だけ、専用の一時cacheを使いtracked fileを変更しない
- local production buildと、remote PR headと同じ完全SHAのVercel Preview

```bash
npm ci
npm run validate
npm run lint
npm run typecheck
npm test
npm run build
npm run check
git diff --check
```

既存testを削除、skip、弱体化しない。最終test数はbaselineを下回らないことを確認し、baseline件数、追加件数、総数を実行結果から記録する。件数合わせ自体を目的にしない。

### 独立geometry contract

背景ground、spawn、背景入口、triggerは`src/game/areas/m15GeometryFixture.mjs`を唯一の出典とする。fixtureは対象背景のSHA-256へ結び付ける。runtime、test、debug overlay、Evidence scriptはfixtureをimportし、期待座標をそれぞれへ複製しない。

- 正式area ID `home-street`、`life-road`、`upper-vending-lane`の独立ground
- atlas実測foot pivotとrender scale
- 左・中央・右、左右歩行、停止、spawn直後、上下遷移直後のfoot-ground差2 CSS px以内
- spawnと独立groundの差6 CSS px以内
- 背景入口中心とtrigger中心の差5 px以内
- debug表示で背景入口、ground、trigger、spawn、player、foot pivotを同時確認
- 背景SHAが変わった場合にground、spawn、入口を再注釈し、古いfixtureを拒否

runtimeの`groundY`をtestの期待値として読み返す自己参照を禁止する。

### 上下導線・遷移パネル・touch

- 背景上の上り／下り入口と対応triggerが一致する
- 案内表示中だけkeyboard／touchの上下遷移入力が有効になる
- trigger外、誤方向、transition lock中の入力が無効になる
- `sourceSpawnId`のclone、reset、往復遷移が退行しない
- playerとpanelの交差面積0
- playerとpanelの最短距離12 CSS px以上
- joystick、時計、音声UIとpanelの交差0
- panel touch領域44×44 CSS px以上
- touch joystickの右drag、左drag、release停止
- 上／下panelの実tap

各viewportで上／下それぞれについて、trigger開始・中央・終端×facing左・右、計12状態を測定する。player、panel、HUDの実矩形、交差面積、最短距離をEvidenceへ保存する。

### BGM静的解析とruntime復帰

静的解析では`public/assets/audio/m15/analysis.json`と実音源を照合する。

- codec、container、48 kHz source sample rate、stereo、duration、decode
- true peakを4倍以上のoversamplingで解析し、-1 dBTP以下
- clipping 0、過大DCなし、長い無音なし
- loop境界のsample差、energy差、波形、spectrogram
- 音源、source、provenance、analysisのSHA-256

ブラウザの正常なresampleはdecode失敗にしない。runtimeではdecode、stereo、durationを検証する。

- mute／unmuteと再生位置
- area遷移後の同一状態
- hidden→visible
- Chromium frozen→active
- iOS interrupted→復帰
- BGM busと環境音busの分離
- AudioContextの経過時間から算出した診断offsetの前進
- loop直前／直後のoffset関係と同一source継続

loop testは固定sleepや厳しすぎる経過秒判定へ依存せず、境界前後をpollする。objective解析の成功だけで聴感をPASSにしない。

`frozen→active`はCDP commandの成功応答だけでは合格にしない。AAC-LCを実decodeできるheaded Google ChromeをXvfb上で実行し、foregroundで校正した40 ms heartbeatについて、900 msのfrozen区間の両端100 msを除いた内側でcallback 0件、active後のcallback再開、同一audio source、mute保持、offset前進を同時に確認する。headless Chromiumでtimerが継続する場合や、AAC codecを持たないテスト用Chromiumでdecodeが失敗する場合は正しくFAILとし、実ブラウザのdecode成功へ読み替えない。

### Browser Smoke matrix

| viewport | device条件 | 入力 |
| --- | --- | --- |
| 1280×720 | desktop | keyboardとpointer |
| 844×390 | touch有効 | joystick dragとpanel tap |
| 932×430 | DPR 3、touch有効 | joystick dragとpanel tap |

mobile 2サイズではkeyboard操作で代用しない。各viewportで次を確認する。

buildの可視badgeは7桁表示でも、DOMの`data-build-commit`へ完全40桁SHAを埋める。Smokeは完全SHA一致を待った後にruntime failure収集を有効化して同じcandidateを再loadし、そのloadを含む`pageerror`／failed requestを判定する。

1. 3エリアそれぞれの左・中央・右
2. 左右歩行、停止、spawn接地
3. 上下往復と既存の全遷移
4. 背景入口、矢印、triggerの一致
5. panelの12状態matrix
6. 3エリア×朝・昼・夕方・夜
7. mute=true／falseの遷移保持
8. BGM開始、中間、loop直前、loop直後、lifecycle復帰後のoffset前進
9. `pageerror` 0、failed request 0

localとPreviewの全画面を人間が目視する。主人公の完成度、背景との馴染み、foot位置、足滑り、透過縁、frame飛び、水平路と石段、矢印、panel、HUD、touch操作、BGMの旋律／和音／rhythm／loopに違和感が残る場合は、数値が通っていてもBLOCKEDとする。

### Evidence

baseline `29223ee31fd4fc4fbca21a37b01fe89277279647`と現在のcandidateを、同じviewport、area、時間帯、world座標でbuildして採取する。

- before／after画像と両方の完全SHA
- fixture由来のground注釈、foot／ground、spawn、背景入口／trigger
- player／panel／HUD矩形、交差面積、最短距離
- 3 viewportのtouch／panel matrix
- 3エリア×4時間帯
- `pageerror`／failed request
- BGM解析JSON、波形、spectrogram、loop境界
- 画像、音声、fixture、metricsのSHA-256
- 素材の権利とprovenance
- 実行command、Node／browser version

途中で失敗したSmoke、別candidate、M1.4 Evidenceを最終Evidenceへ混在させない。

### 承認gate

1. local Quality／Browser Smoke／Evidence
2. 同じPR head SHAのVercel Preview Smoke
3. 同じSHAのCI、自動review、くーちゃんcandidate QA、リダ君Evidence監査
4. ユーザーによる同じPreview SHAの実iPhone明示承認
5. main merge
6. merge SHAと一致するVercel Production、Production Smoke、Production Browser Smoke

実iPhone承認前はmainとProductionを変更しない。codeまたはassetを変更したら、新SHAでCI、Preview Smoke、candidate QA、Evidence監査を再実行する。承認後の変更は以前の承認を無効にする。
