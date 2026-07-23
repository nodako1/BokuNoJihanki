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

この統合テストの`playerY === groundY`は内部座標の整合を確認する。背景に描かれた道路面と足裏の視覚的一致を保証するテストではない。branch triggerの単体・統合テストも内部rangeの挙動を確認するもので、背景上の道や出口との一致は別に検証する。

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

上記はM1.4時点のVisual Review項目である。後続のユーザー実機確認で接地、背景分岐、UI重なり、主人公品質、BGM品質が不合格になったため、M1全体の最終承認には後述のM1.5 gateを適用する。

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

## M1.5 必須実機品質gate

確認済みの6件は[M1.5 ユーザー実機所見](evidence/M1_5_REAL_DEVICE_FINDINGS.md)、受入条件は[M1.5 必須実機品質修正仕様](specs/M1_5_REAL_DEVICE_POLISH.md)を正とする。M1.4の成功結果を削除せず、M1.5の別gateとして追加する。

### 背景を正解にした接地検証

3エリアを背景画像から独立注釈したfixtureを唯一の期待値とする。実装済み`groundY`、spawn、triggerやruntime screenshotから期待値を自己参照してはならない。各時間帯の背景から道路面を独立して特定し、主人公の足裏pivotを同じCSS座標系へ変換して比較する。

```text
groundGapCssPx = abs(playerFootPivotCssY - backgroundRoadCssY)
```

開始、中央、終端、全spawn、全分岐で表示上の`groundGapCssPx <= 2`を原則とする。全spawn設定点のYは独立fixtureの同一Xにあるgroundから6 CSS px以内でなければならず、spawn後の表示上の足裏は2 CSS px原則でも別途確認する。道路が傾斜または段差を持つ場合は、単一Yではなく背景から採った区間別またはX別のground lineを使う。背景を変更した場合は、ground、spawn、入口を再注釈・再計測する。

各エリアの証跡には次を同じ表で記録する。

- walkable領域
- 背景から採ったground line
- spawn IDと位置
- 背景上の分岐入口
- trigger範囲
- 各測定地点の足裏差

`life-road`は背景上の上り道へ到達した時点で上案内が表示されること、`upper-vending-lane`は下案内に対応する道、坂、階段、開口部が背景に存在することを確認する。背景入口中心とtrigger中心の差は5 CSS px以内とし、対応prompt表示中だけ上下遷移入力を有効にする。見えている道と内部triggerが矛盾する場合は不合格とする。

### 主人公Visual QA matrix

最小matrixは3エリア × 左・中央・右 × 左歩行・右歩行・idle × 4時間帯の108状態とする。

各状態で次を確認する。

- 背景と同等の完成度を持つ最終ラスタ素材である
- 少年の設定、服装、世界観を維持し、足元pivot、顔、体格、輪郭、服装、光方向がframe間と向き変更で一貫する
- atlasとfoot pivotが再計測され、影が別レイヤーである
- 透過縁、切断、halo、足元の欠けがない
- 浮遊、埋没、足滑りがない
- 停止時にidleへ戻り、端やinput lock中に足踏みしない
- 素材の出所、生成方法、日付、権利・ライセンス、SHA-256が記録されている

### 分岐と状態

- `life-road`から`upper-vending-lane`へ上移動し、下移動で戻る
- `upper-vending-lane`から`life-road`へ下移動し、再度上移動する
- 上下 × trigger開始・中央・終端 × 左右向きの12状態で表示位置、残留、再表示を確認する
- 往復後もarea、spawn、向き、時刻、時間帯、mute、AudioContext、Scene、bridge listenerを維持する
- `sourceSpawnId`の非初期spawn回帰テストを維持し、修正済み問題として扱う

### UIと主人公の重なり

`1280×720`、`844×390`、`932×430`の各viewportで、UIとPhaser内主人公を同じCSS座標系へ変換して測定する。

- 主人公と遷移パネルの交差面積: 0
- 主人公と遷移パネルの最短間隔: 12 CSS px以上
- 遷移パネルとHUDの交差面積: 0
- タッチ領域: 44×44 CSS px以上
- safe-area内で主人公、足元、進行方向を隠さない

player／panel／HUDの実矩形をEvidenceへ保存する。UI同士の重なりだけを測って合格にしない。

### BGM

- BGMと環境音が分離され、環境ノイズをBGM本体にしていない
- 「夏休みの田舎・朝・郷愁」が伝わり、旋律、和音、リズム、反復構造を認識できる
- 48kHz stereo、decode error 0件、clipping 0件
- true peak -1 dBTP以下
- 過大なDC offsetと意図しない長い無音がない
- ループ境界が自然で、クリック、急な無音、音量跳躍、拍の欠落がない
- mute、遷移、visibility、`frozen`、iOS `interrupted`から復帰できる
- provenance、SHA-256、duration、LUFS、dBTP、loop境界を記録する
- 解析JSON、波形、スペクトログラムを保存する
- iPhoneスピーカーでユーザーの聴感承認を得る

### same-SHA Previewと独立QA

Node.js 22で次を成功させ、local candidateと同一SHAのVercel Previewを作成してSHAを照合する。

```bash
npm run check
```

3 viewportすべてで3エリア × 4時間帯を確認し、before／afterを同一viewport、area、時間帯、位置、向きで保存する。mobileでは実touchによる左右dragと遷移panelのtapを行う。Previewで既存の3エリア、5遷移、時刻・音声状態保持、`pageerror` 0件、failed request 0件を維持する。M1.3と`src/game/economy/`のコード、素材、テストを保持し、M1.5からeconomyをScene接続しない。

headless screenshotの枚数、state invariant、内部`groundY` invariant、内部trigger通過、`pageerror` 0件だけでは見た目や音声を合格にしない。くーちゃんcandidate QAとリダ君Evidence監査を完了し、その後、mainへ進める前にユーザーが同一SHAのPreviewをiPhone実機で操作して次の5項目を明示承認する。

1. 主人公の見た目と歩行
2. 3エリアの接地
3. 上下導線と背景の一致
4. 遷移パネルが主人公・UIを隠さない
5. BGMの聴感、loop、mute／復帰

承認後にコード・素材が変わった場合は、新SHAでPreview、独立QA、Evidence監査、実iPhone承認をやり直す。承認済みSHAだけをmainへマージし、その後にProduction SHA照合、Production Smoke、Production Browser Smoke、同条件Visual Reviewを行う。

M1.5 candidate SHA、run ID、Artifact、Preview承認、Production SHAは本書更新時点で**未実施**である。存在しない値を推測して記録しない。

### 文書branchの既知の一時的不整合

2026-07-23、Node.js `22.14.0`／npm `10.9.2`でM1.5状態正規化後の文書branchを検証した。

- `npm run validate`: 失敗。既存`validate-project.mjs`が`currentMilestone=M1.4`、`status=completed-production-verified`、`lastProductionCommit=147f770...`、`inProgress=[]`、`paused=[]`、`nextTask=m2-vending-machine-scene-integration`を固定しているため、正規化したM1.5状態を6項目で拒否する。現stateの`lastProductionCommit=29223ee...`はPR #34後の現main／Production baseline、`evidence.m14ImplementationProductionCommit=147f770...`はM1.4実装のProduction確認履歴である。`nextMilestone=M2`は将来milestoneとして維持し、blocked statusで保護している
- `npm test`: 106/107成功。`tests/project-structure.test.mjs`の旧状態テスト1件だけが`M1.5 !== M1.4`で失敗する
- `npm run check`: 先頭の`npm run validate`で上記6項目により停止する
- `npm run lint`: 成功
- `npm run typecheck`: 成功
- `npm run build`: 成功

これはM1.5状態更新に伴う既存validator／状態テストの一時的不整合であり、runtime実装の失敗を示さない。本docs branchではvalidatorとテストを変更・弱体化しない。つくちゃんが実装candidateへ文書を採用するとき、`scripts/validate-project.mjs`と`tests/project-structure.test.mjs`をM1.5の正規化済み状態・承認gateへ意図的に更新し、M1.4 Production Evidenceの固定検証は保持する必要がある。
