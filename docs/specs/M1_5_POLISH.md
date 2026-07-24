# M1.5 実機品質修正版 仕様書

## 状態

**必須・再構築中・M2を停止**

M1.4は実装commit `147f770a4b73077c4e5dc0523839b3fefb789db4`でProduction配信と検証に成功した。その履歴とEvidenceは保持する。一方、M1全体は実機で確認された主人公の完成度、接地、上下導線、遷移パネル、BGM、復帰動作の品質問題により再オープンした。M1.5を完了するまでM2へ進まない。

現在のProduction baselineは`29223ee31fd4fc4fbca21a37b01fe89277279647`である。M1.5 candidateは`fix/m1-5-real-device-polish-rebuild`上でCP1〜CP3まで再構築済みだが、local／Preview Smoke、Evidence、独立QA、CI、実iPhone承認は未完了である。Production-ready、実機承認済み、M1完了とは扱わない。

過去のローカルcommit `04c6d0879fc4283d94d0a6d515a1916a0999406b`はpushされないまま一時環境とともに失われ、復元不能である。存在するcandidate、取得済みEvidence、または合格証跡として扱わない。現在の候補はbaselineから作成した新しいcheckpoint commit群だけで構成する。

## 目的

- 少年の設定、服装、世界観を保った完成品質のラスタ主人公を、ペインターリー背景へ馴染ませる
- 3エリアでfoot pivot、spawn、背景の歩行面を独立注釈へ一致させる
- 背景に描かれた上下経路と入口、trigger、矢印、遷移入力を一致させる
- 遷移パネルを主人公、HUD、タッチUIへ重ねず、スマートフォン横画面でも操作可能にする
- 「夏休みの田舎・朝・郷愁」を旋律、和音、リズムとして認識できる完成BGMへ置換する
- touch、visibility、Chromium lifecycle、iOS audio interruptionからの復帰を同一再生状態で実証する

正式なarea IDは次の3つだけである。

- `home-street`
- `life-road`
- `upper-vending-lane`

## 変更境界

### 対象

- `public/assets/images/m15/`と`tools/art/m15-source/`のM1.5専用素材、manifest、再生成工程
- `public/assets/audio/m15/`と`tools/audio/m15/`のM1.5専用BGM、解析、再生成工程
- M1.5専用geometry fixtureと、M1.4横スクロールruntimeへの限定統合
- 接地、上下導線、遷移パネル、音声lifecycleのcontract／unit／Browser Smoke
- baselineとcandidateの同条件Evidence

### 非対象・保護対象

- M1.3、M1.4の素材、生成工程、URLの上書きまたは削除
- `src/game/economy/`の変更またはScene接続
- 旧Sceneの変更
- 新エリア、NPC、会話、探索、所持金、抽選、セーブなどM2以降の機能
- open PR #31の変更またはマージ
- 実iPhone承認前のmainマージとVercel Production変更

## Candidate実装

### CP1: 主人公・背景・BGM

新素材はM1.5専用pathと内容hash付きURLへ保存し、M1.3／M1.4資産を維持する。

- 画像manifest: `public/assets/images/m15/asset-manifest.json`
- 生成記録: `tools/art/m15-source/generation.json`
- 画像生成: OpenAI組み込み画像生成と決定的な`python3 tools/art/generate_m15_assets.py`
- 権利: BokuNoJihanki向けproject-original。第三者ゲーム素材、既存キャラクター、実在ブランドを不使用
- 主人公: 256×384、左右各4待機＋8歩行、合計24 frame
- foot pivot: atlasの実測に基づく`(0.5, 0.9609375)`／pixel `(128, 369)`
- 影: atlasへ焼き込まずruntimeで歩行面へ追従
- player atlas SHA-256: `acf3cf78c2dba0c30ed078de5e6b0ee6fe32b7f0cf8dd8f15fc52a8dd41d46b0`
- atlas JSON SHA-256: `fc0f7e4a495dbdf40a7e08b1305d68c57ec15b8b43f87bdcb3710a15c8458f0e`

背景は既存の町並み、樹木、海景、光、画角、画風を必要以上に変更しない。`upper-vending-lane`は水平路を保ったまま前縁から下る石段を分岐させ、背景上に戻り経路を明示する。各出力のSHA-256とsource masterのSHA-256はmanifestを正とする。

BGM「夏の朝、坂の自販機へ」はproject-originalの音符データを、固定seedのPython／NumPy／SciPy／FFmpeg工程で48 kHz stereo AAC-LCへrenderする。外部sample、第三者旋律、外部生成音声サービスは使わない。

- runtime: `public/assets/audio/m15/summer-morning-loop-9ea9bb8b71d7.m4a`
- SHA-256: `9ea9bb8b71d71d9cb60a31372fc1fe5ea5411eb02374d60d78cca04cab3401c6`
- source: `tools/audio/m15/score.json`
- generator: `tools/audio/m15/generate_m15_bgm.py`
- provenance: `tools/audio/m15/provenance.json`
- analysis: `public/assets/audio/m15/analysis.json`

解析上は38.4秒、100 BPM、G major、16小節、integrated -15.76 LUFS、4倍oversampling true peak -5.406713 dBTP、clipping 0、過大DCなし、長い無音なしである。これらは静的品質値であり、Preview聴感確認や実iPhone承認の代わりにはならない。

### CP2: 接地・導線・パネル・音声runtime

`src/game/areas/m15GeometryFixture.mjs`を背景ground、spawn、背景入口、triggerの唯一の出典とする。fixtureは対象背景の正確なSHA-256へ結び付け、runtime、contract test、debug overlay、Evidence scriptが同じfixtureを読む。Evidence scriptへ期待座標を再記載しない。

- 実描画のfootとgroundの差: 2 CSS px以内
- spawnと独立groundの差: 6 CSS px以内
- 背景入口中心とtrigger中心の差: 5 px以内
- debug表示: 背景入口、ground、trigger、spawn、主人公位置、foot pivotを同時表示

上／下遷移入力は対応案内が表示中の場合だけ有効にする。`sourceSpawnId`のclone、reset、往復遷移を維持する。背景に経路のない場所へ矢印だけを表示しない。

遷移パネルは主人公位置、向き、viewport、HUDを使って安全なanchorを選ぶ。次を全状態で満たす。

- 主人公との交差面積0
- 主人公境界との最短距離12 CSS px以上
- joystick、時計、音声UIとの交差0
- touch領域44×44 CSS px以上

BGMと環境音は別busとする。mute、area遷移、hidden→visible、frozen→active、iOS interrupted→復帰で状態と再生位置を維持する。診断offsetはAudioContextの経過時間から計算し、loop検証は固定sleepではなく境界前後のoffsetと同一source継続をpollする。

### CP3: contract／unit／回帰テスト

次の独立contractを追加し、既存テストを削除、skip、弱体化しない。

- 3エリアの独立ground、foot pivot、spawn接地
- 背景入口とtrigger中心
- panel非重複、12 px距離、HUD非衝突、44×44 touch target
- 案内表示中だけ有効な上下入力、touch joystick、panel tap
- BGM decode、codec、sample rate、4倍以上のoversampling true peak、clipping、DC、無音、loop
- mute、遷移、visibility、frozen／active、iOS interrupted復帰
- `sourceSpawnId`回帰
- M1.3、M1.4、economy、旧Scene、M2未接続の保護
- validator、lint、typecheck、Production build、`npm run check`

Node.js 22系と既存lockfileを使う。最終件数は実行結果から報告し、過去候補の件数やbaselineの期待値をコピーしない。

## Browser SmokeとEvidence

local production buildと、remote PR headと同じ完全SHAのVercel Previewで実行する。

| viewport | 入力条件 |
| --- | --- |
| 1280×720 | desktop |
| 844×390 | touch有効 |
| 932×430 | DPR 3、touch有効 |

mobile 2サイズはtouch joystickを実際に右drag、左drag、releaseし、上下panelを実際にtapする。keyboard操作で代用しない。

各viewportで、3エリアの左・中央・右、左右歩行、停止、spawn、上下往復、既存全遷移、4時間帯、mute保持、BGM開始／中間／loop境界／lifecycle復帰を確認する。上／下それぞれのtrigger開始・中央・終端×左右向き、計12状態を測定し、player／panel／HUDの実矩形、交差面積、最短距離を保存する。

baselineとcandidateは同じviewport、area、時間帯、world座標で採取する。Evidenceには対象SHA、ground注釈、foot／ground、spawn、入口／trigger、矩形、touch matrix、pageerror、failed request、音声解析JSON、波形、spectrogram、loop境界、全対象fileのSHA-256、provenance、実行command、Node／browser versionを含める。

`pageerror` 0、failed request 0、state invariant、画像枚数だけでは合格にしない。atlas全体と各frame、および全画面を人間が目視し、浮き、埋まり、足滑り、透過縁、frame飛び、経路不一致、パネル干渉、音の違和感が残ればBLOCKEDとする。

## 承認とリリースの順序

次の順序を変更しない。

1. local Quality／Browser Smoke／Evidenceを完了する
2. remote PR headと完全一致するVercel PreviewでBrowser Smokeを完了する
3. 同じSHAでCI、自動レビュー、くーちゃんcandidate QA、リダ君Evidence監査を成功させる
4. PR headを固定し、ユーザーがそのPreviewを実iPhoneで明示承認する
5. 承認対象SHAと最新PR headの一致を再確認してmainへマージする
6. merge SHAと一致するVercel Productionを確認し、Production SmokeとProduction Browser Smokeを実行する

実iPhoneでは次の5項目を確認する。

1. 主人公の見た目と歩行
2. 3エリアの接地
3. 上下導線と背景の一致
4. 遷移パネルが主人公・UIを隠さないこと
5. BGMの聴感、loop、mute／復帰

承認後にcodeまたはassetを変更した場合、以前の承認は無効とし、新しいPreview SHAで再承認を受ける。CI、QA、Evidence、Screenshotは実iPhone承認の代替にならない。
