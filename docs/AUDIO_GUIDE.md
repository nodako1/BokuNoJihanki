# 音声ガイド

M1.2〜M1.4の音は第三者サンプルを使わずWeb Audio APIで生成する。低音パッド、短い旋律、帯域ノイズによるセミ、低域ノイズによる風と遠い車、短い正弦波による鳥、接地面別ノイズによる足音を重ねる。M1.5では環境音と効果音のruntime生成を保持しながら、BGMだけをproject-originalの静的loop音源へ置換し、別busで再生する。

住宅街では遠い車を、公園では風と鳥を強くし、エリア境界でGainNodeを滑らかに変更します。朝、昼、夕方、夜でセミ、風、鳥、旋律の音量と帯域を変えます。非表示タブではマスター音量を下げ、復帰時に戻します。最初のユーザー操作までAudioContextを作りません。

## M1.3歩行同期

歩行アニメーションの接地フレーム1・5で足音を鳴らす。実座標が移動していない場合は、入力中でも歩行アニメーションと足音を停止する。アスファルトと土・砂利で帯域を変え、音量とピッチへ小さなランダム差を付ける。

## M1.4横スクロール音響（完了・Production確認済み）

M1.4も第三者サンプルを使わず、Web Audio APIで実行時生成する。AudioContextは最初のユーザー操作まで開始せず、Sceneやエリアを切り替えるたびに作り直さない。

### 歩行

横視点player atlasの左右各10歩行フレームのうち、0始まりの接地フレーム2・7でアスファルト足音を鳴らす。左右の足で小さく音量、ピッチ、filterを変え、機械的な連打を避ける。

- 実座標が変化した場合だけ鳴らす
- 停止、画面端でblocked、遷移中、タブ非表示では鳴らさない
- 速度に応じてアニメーション周期が変わっても、接地frameと音の対応を維持する
- エリア到着直後に入力を再武装するまで鳴らさない

### 3エリアの環境mix

- `home-street`: 鳥、弱いセミ、生活音、遠い車を控えめにする
- `life-road`: セミと遠い車を中心に、住宅道路の広がりを出す
- `upper-vending-lane`: 木陰の風、葉音、近いセミを強め、交通音を弱める

朝は鳥、昼はセミ、夕方は風と遠い生活音、夜は虫と低い環境音を中心にする。夜の視覚上の窓・街灯・自販機照明と音の静けさを一致させる。

### 遷移・UI音

- 遷移開始: 入力が受理され暗転を始めるとき
- 地名表示: 接続先の表示準備とspawn適用が完了したとき
- 矢印表示: branch triggerへ入ったとき一度だけ
- 矢印決定: 有効な上／下遷移が受理されたとき

無効入力、trigger外、input lock中は決定音を鳴らさない。

### クロスフェードと状態維持

エリア切り替え時は、永続する環境音ノードのtargetを新しいarea／phase mixへ更新する。`setTargetAtTime`の時定数はfilterとセミが0.7秒、風と遠い車が0.8秒であり、クロスフェード相当の平滑化として動作する。旧・新の2バスを別々にfadeする実装ではない。効果音を鳴らすために意図的な長いロードは入れない。

音声ON／OFF、AudioContextの開始状態、現在時間帯はエリア遷移後も維持する。`document.hidden`時はmaster gainを0へ減衰させ、移動入力と新しい足音を停止する。documentが可視のままの単純な`window.blur`ではmaster gainを変更せず、入力、速度、新しい足音だけを停止する。可視状態への復帰時は現在area／phaseのmixへ滑らかに戻す。

PR #32とmain `147f770a4b73077c4e5dc0523839b3fefb789db4`のBrowser Smokeおよび公開画面で、ミュート状態のエリア間保持、時間帯との同期、focus喪失時停止、復帰後の操作を確認済みである。この履歴はM1.4のProduction Evidenceとして保持し、M1.5 candidateの合格証跡には流用しない。

## M1.5 完成BGMと復帰contract（必須・candidate）

M1.5はBGMを小手先に加工せず、「夏休みの田舎・朝・郷愁」を旋律、和音、rhythmとして認識できる完成loopへ置換する。セミ、鳥、風、遠い車、足音などの環境音／効果音は既存のWeb Audio runtime生成を維持し、BGMとは別busでmixする。noiseや単音だけをBGMとして扱わない。

### 音源と再生成

- title: 「夏の朝、坂の自販機へ」
- asset ID: `m15-summer-morning-loop`
- runtime: `public/assets/audio/m15/summer-morning-loop-9ea9bb8b71d7.m4a`
- source score: `tools/audio/m15/score.json`
- generator: `tools/audio/m15/generate_m15_bgm.py`
- provenance: `tools/audio/m15/provenance.json`
- static analysis: `public/assets/audio/m15/analysis.json`
- SHA-256: `9ea9bb8b71d71d9cb60a31372fc1fe5ea5411eb02374d60d78cca04cab3401c6`

BokuNoJihanki向けproject-original scoreであり、外部sample、第三者melody、外部生成音声serviceを使用しない。固定seed `15072026`とPython／NumPy／SciPy／FFmpegで決定的に再生成できる。権利者は`nodako1`、repository licenseに従う。

音源仕様:

- 48 kHz、stereo、AAC-LC M4A
- 38.4秒、16小節、100 BPM、G major
- integrated loudness: -15.76 LUFS
- 4倍oversampling true peak: -5.406713 dBTP
- clipping sample: 0
- DC offset: L `0.000009124`、R `0.0000054938`
- longest silence: 0秒
- loop boundary jump: `0.006837003`
- loop boundary ratio: `0.232078`

この数値は現在の静的解析結果である。ブラウザでdecodeできること、自然にloopすること、曲として聞こえること、実機で復帰することは別途local／Preview／実iPhoneで確認する。ブラウザの正常なresampleをdecode失敗扱いしない。

### Runtime状態

BGM sourceはarea遷移ごとに不要な再生成をせず、現在のsourceと再生位置を維持する。

- mute／unmute: mute中も論理offsetを進め、解除時に対応位置へ復帰
- area遷移: mute状態、source、offsetを保持
- hidden→visible: 非表示中の入力と新規効果音を止め、復帰時にBGM状態を再同期
- frozen→active: headed Chromium＋Xvfbで校正済みheartbeatのfrozen内側callback 0件とactive後の再開を実測し、offset前進とsource継続も確認
- iOS interrupted→running: user activationが必要な場合を含め、同じmute状態と論理offsetへ復帰
- BGM busとenvironment bus: 独立gainを持ち、BGM muteや復帰が環境mix定義を破壊しない

診断offsetは開始時の定数ではなく、AudioContextの経過時間と開始offsetから算出する。loop testは固定sleepに依存せず、loop直前と直後をpollし、offsetのwrap、時間前進、同一source継続を検証する。

### 合格gate

1. 元音源のcodec、48 kHz stereo、duration、SHA-256を静的解析する
2. 4倍以上oversamplingのtrue peak、clipping、DC、無音、loop境界を検証する
3. local production buildで開始、中間、loop直前、loop直後、mute、area遷移、visibility、実heartbeat停止を伴うfrozen、iOS interruption contractを確認する
4. remote PR headと同じ完全SHAのVercel Previewで同じBrowser Smokeを行う
5. 人間が旋律、和音、rhythm、音量、loop、環境音との分離を聴感確認する
6. ユーザーが同じPreview SHAを実iPhoneで明示承認する

静的解析、unit test、`pageerror` 0、Screenshot成功だけでは聴感をPASSにしない。実iPhone承認前にmainへマージせず、Production確認済みとも報告しない。
