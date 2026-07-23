# M1.5 Real-device QA

## 判定

**BLOCKED**

前回の「見た目全項目PASS」は撤回する。前回報告には「スマホ横では矢印panelが主人公の一部を隠す」という観測も含まれており、PASS判定と矛盾していた。

この文書はbaseline `29223ee31fd4fc4fbca21a37b01fe89277279647`の独立QAである。932×430はPlaywright ChromiumによるiPhone相当のemulationであり、実機確認ではない。実装、main、実装branch、Productionには変更を加えていない。

## 対象

| 項目 | 値 |
|---|---|
| Repository | `nodako1/BokuNoJihanki` |
| QA branch | `test/m1-5-real-device-audit` |
| Baseline | `29223ee31fd4fc4fbca21a37b01fe89277279647` |
| Candidate | 未到着。`fix/m1-5-real-device-polish` branch／open PRなし |
| Candidate Preview／Artifact | 未到着のため未検証 |
| QA commit | この文書を含むPhase 1 commit。外部完了報告でSHAを固定 |
| Evidence artifact set SHA-256 | `f3ee6aa4022e7b159651dff4fb791b70f4b653a2de137a8f894e7bfec49fcecd` |

## 結論の根拠

| ユーザー指摘 | Baseline結果 | 客観的な証拠 |
|---|---|---|
| 主人公が未完成に見える | **BLOCKED** | 背景と異なる単純なflat表現で、Product Owner承認referenceなし。atlas上端・左右端の切断候補は0だが、これは最終品質の承認にはならない |
| 3エリアで浮遊して見える | **BLOCKED** | 不透明pixelの足元bottom-centerと独立ground lineの差は全viewport・全エリアで許容6 CSS pxを超過 |
| `life-road`の道とup triggerがずれる | **BLOCKED** | 背景の入口中心X=1150、trigger中心X=1350。投影後の中心差は200／108.33／119.44 CSS pxで、全viewportの許容32 CSS pxを超過 |
| `upper-vending-lane`に下方向の出口がない | **BLOCKED** | down triggerは存在するが、背景には道、坂、階段、開口のいずれもなく、前景の擁壁が連続 |
| 遷移panelが主人公を隠す | **BLOCKED** | `life-road/up`は3 viewportの全54 state groupでFAIL、最短距離0。`upper/down`も844×390と932×430の全36 groupでFAIL |
| BGMが雑音に聞こえる | **BLOCKED** | Chromium出力の客観解析はPASSだが、客観値は音楽性を保証しない。Human listening `NOT_VERIFIED`で、ユーザー聴感指摘を覆す証拠なし |

## 監査方法

### Viewport

| ID | CSS viewport | DPR | Touch | 表現 |
|---|---:|---:|---:|---|
| desktop | 1280×720 | 1 | false | desktop browser |
| phone landscape | 844×390 | 1 | true | emulation。実機結果ではない |
| iPhone相当 | 932×430 | 3 | true | emulation。実機結果ではない |

3条件で同じ5遷移シナリオ、左右歩行、idle復帰、camera、focus stop、transition lock、時刻・mute保持、pageerror、failed requestを確認した。touch 2条件ではCDP touch eventでvirtual joystickの左右入力も実行し、`inputSource=touch`を確認した。932×430を実機確認済みとは表現しない。

Playwrightはapplicationのpackage manifestを変更せず、QA-only resolverがversion `1.56.1`を固定する。clean checkoutでは`M15_PLAYWRIGHT_REQUIRE_ROOT`で外部導入先を明示するか、明示的な`M15_PLAYWRIGHT_AUTO_INSTALL=1`で`/tmp`へ導入できる。Evidence再生成に未追跡`node_modules` symlinkは不要である。

### 主人公と接地

実装の`groundY`を正解にはしていない。day背景のSHA-256に結び付けた独立注釈として、walkable polygonとground lineをfixtureへ記録した。player atlasをRGBAへdecodeし、各idle／walk frameの不透明pixelから足元bottom-centerを求めた。

各エリアについて開始、25%、50%、75%、終端、spawn、分岐の開始／中央／終端をsampleし、左右idle 4 frameずつ、左右walk 10 frameずつ評価した。背景上の差はlogical/background world pxで注釈し、各viewportのcanvas scaleでCSS pxへ投影して6 CSS px基準と比較した。

| Area | Logical差 | 1280×720 CSS差 | 844×390 CSS差 | 932×430 CSS差 | 許容 | 結果 |
|---|---:|---:|---:|---:|---:|---|
| `home-street` | 65 | 65.00 | 35.21 | 38.82 | 6 CSS px | **BLOCKED** |
| `life-road` | 20 | 20.00 | 10.83 | 11.94 | 6 CSS px | **BLOCKED** |
| `upper-vending-lane` | 40 | 40.00 | 21.67 | 23.89 | 6 CSS px | **BLOCKED** |

### 背景導線

`life-road/up`は、背景上で上り道が見える範囲をlogical X=990..1310、中心X=1150と独立注釈した。実装triggerはlogical X=1220..1480、中心X=1350である。中心差200 logical pxは各viewportで200／108.33／119.44 CSS pxとなり、すべて32 CSS pxを超える。背景入口へ到達した時点では案内が表示されず、右側の無関係な景色までtriggerが延びる。

`upper-vending-lane/down`は行き先labelしか方向を説明していない。背景上には下方向へ続く道、坂、階段、開口がなくFAILである。

### 遮蔽

panel矩形はCSSから解析した推定値を108 state groupの網羅測定に使用し、932×430・DPR 3の代表2状態ではPlaywrightのDOM `boundingBox()`実測値でも校正した。alpha > 0のatlas pixel footprint全体をdevice pixelへrasterizeし、案内表示開始、trigger中央、両端、左右向き、camera追従前／idle／追従後を評価した。交差device pixel 0かつ最短距離12 CSS px以上を基準とし、UI同士の非重複だけではPASSにしていない。

| Viewport | `life-road/up` | `upper-vending-lane/down` |
|---|---|---|
| 1280×720 | 18/18 group FAIL、最大1763 device px、距離0 | 0/18 group FAIL、最大0、最短28.50 CSS px |
| 844×390 | 18/18 group FAIL、最大1191 device px、距離0 | 18/18 group FAIL、最大227、距離0 |
| 932×430・DPR 3 | 18/18 group FAIL、最大9385 device px、距離0 | 18/18 group FAIL、最大293、距離0 |

932×430のDOM実測代表状態でも、lifeは14/14 frame FAIL・最大9378 device px、upperは14/14 frame FAIL・最大288 device pxだった。

### 各スクリーンショットの判定

3 viewport × 15枚 = 45枚を、`completion`、`grounding`、`roadArrow`、`playerOcclusion`、`uiCollision`のYES／NOで個別記録した。5項目のどれか一つでもNOならその画面はFAILとした。

| 枚数 | PASS | FAIL |
|---:|---:|---:|
| 45 | 0 | 45 |

全45件はファイル番号による推測ではなく、exact screenshot SHA-256に結び付けたmanual semantic audit fixtureへ、ファイル名、項目別YES／NO、理由を明記した。保存済み45枚のBrowser Smoke画像自体はDPR 1であり、932×430・DPR 3・touchは別のlive contractで同一シナリオを実測した。さらに同じDPR 3 contextからhome、life/up、upper/downの代表3場面を再採取し、注釈画像のsource digest、DOM panel矩形、pageerror 0、failed request 0を`M1_5_BASELINE_VISUAL_MEASUREMENTS.json`へ記録した。画像中の日本語が一部□になるのは監査hostに日本語fontがないためで、座標、mask、state評価には影響しない。

### BGM

baselineにはencoded BGM fileがなく、`src/game/systems/audioEngine.ts`がWeb Audioでoscillatorとnoise loopを実行時合成する。そのためstatic fileのcodec欄を偽って埋めず、次の2系統を分離した。

1. 再現可能な20秒・48 kHz・mono・PCM proxyでsourceとloopの客観値を固定。
2. Application sourceを変更せず、Chromium master outputへQA-onlyの`MediaStreamAudioDestination`を追加して12秒をOpus/WebMで採取し、decode後に客観解析。録音本体はcommitしない。

| 指標 | Chromium master output | 基準 | 結果 |
|---|---:|---:|---|
| Codec／sample rate／duration | Opus、48 kHz、11.94 s | 約12 sを記録 | PASS |
| Decode error | 0 | 0 | PASS |
| True peak | -39.806 dBTP | ≤ -1 dBTP | PASS |
| Clipping sample | 0 | 0 | PASS |
| DC offset | L 0.000000693 / R 0.000000692 | abs ≤ 0.01 | PASS |
| 1秒以上の無音 | 0区間 | 0 | PASS |
| 最大隣接jump | -47.703 dBFS | ≤ -40 dBFS | PASS |
| Encoded SHA-256 | `03d060286ac9ef013a2cc1384e435486fc62418b8a6715b3dafae615b8cf53fa` | 記録必須 | PASS |
| Decoded PCM SHA-256 | `45015626bf36cb1780aac450f22415e1de9c39d17772935525e8b5d0925775fa` | 記録必須 | PASS |

専用generatorはexact source／build badge SHA、pageerror 0、failed request 0を同じrunでassertする。proxy CLIは`M1_5_PROXY_AUDIO_*` namespaceだけへ出力し、canonical Chromium Evidenceを上書きできない。

客観値は**Objective PASS**、聴感は**Human listening NOT VERIFIED**である。実際に音楽として聞こえる保証にはならないため、Releaseは**BLOCKED**。ユーザーがPreviewを実際に聴き、「雑音ではなく意図した音楽」と確認する必要がある。

## 既存回帰と意図した検出失敗

### 既存回帰

新規M1.5 contractを追加する前のexact baselineで`npm run check`を実行し、既存107/107 tests、validator、lint、typecheck、production buildがPASSした。既存Browser Smokeは3エリア、5遷移、左右歩行、idle復帰、camera、focus stop、transition lock、時刻・mute保持を完走し、各viewportでpageerror 0、failed request 0だった。

`life-road/from-upper`由来のclone／resetについては既存test `cloned fade-in reset restores the exact non-initial source spawn`がPASSし、元のspawnへの復旧を確認した。

1280×720 runのPlaywright traceはZIP整合性検査PASS、SHA-256は`24d548bf3daa1ea0c50bc92b7f5980784659c1202473194298b276802480d197`。巨大なtraceと45枚のraw screenshotはcommitしていない。

### 意図したQA検出失敗

新規visual contractはbaseline欠陥を検出して失敗することを目的とする。失敗を既存回帰の破損と混同しない。

| Contract | 結果 | 分類 |
|---|---|---|
| Annotation／asset SHA／viewport／Evidence digest contract | PASS | QA harness |
| 主人公の完成度／PO承認 | FAIL | 意図したbaseline検出 |
| Atlas上・左右端の切断候補 | PASS | 自動bounds検査 |
| 独立ground／walkable | FAIL | 意図したbaseline検出 |
| 背景導線／trigger | FAIL | 意図したbaseline検出 |
| player mask／panel遮蔽 | FAIL | 意図したbaseline検出 |
| Audio objective／再生成contract | 8/8 PASS | 客観解析 |
| Audio human listening gate | PASS（ReleaseをBLOCKEDに保つcontract） | QA gate |

最終`npm run check`は124 total、118 PASS、4 intentional FAIL、2 environment-gated SKIPでnon-zeroとなる。4件は上記visual baseline検出だけで、既存107 testの回帰FAILは0件である。validator、lint、typecheck、production buildは個別実行でPASSした。

## 前回見逃した原因

- 画像の存在確認と意味的な目視評価を混同した。
- UI同士だけを測り、UIと主人公を測らなかった。
- 実装座標を正解にして、背景上の道路を独立評価しなかった。
- `AUDIO ON`／`MUTED`だけを確認し、音源を評価しなかった。
- screenshot数、state invariant、pageerror 0を、完成度、接地、導線、遮蔽、音楽性のPASS根拠として誤用した。

## Evidence

Evidence artifact set SHA-256は、このreportを除く下記canonical JSON／PNG 7点の`sha256sum`行をpathで昇順sortし、そのUTF-8 textをSHA-256した値である。

- `M1_5_BASELINE_VISUAL_MEASUREMENTS.json`: 全45 screenshotの項目別判定、接地、分岐、mask交差、runtime invariant
- `M1_5_BASELINE_HOME_GROUND_ANNOTATED.png`: homeの実足元と独立ground line
- `M1_5_BASELINE_LIFE_BRANCH_ANNOTATED.png`: 背景入口、trigger中心、panel／player交差
- `M1_5_BASELINE_UPPER_EXIT_ANNOTATED.png`: 下方向triggerと背景上の出口不在
- `M1_5_BASELINE_AUDIO_METRICS.json`: proxy／Chromium captureのcodec、decode、peak、clipping、DC、無音、loop／jump、SHA-256
- `M1_5_BASELINE_AUDIO_WAVEFORM.png`
- `M1_5_BASELINE_AUDIO_SPECTROGRAM.png`

`tests/fixtures/m15-screenshot-manual-audit.json`はmanifest対象外である。45 screenshotのexact SHAに結び付けたmanual semantic auditとして、`M1_5_BASELINE_VISUAL_MEASUREMENTS.json`内の`fixtureSha256`から間接的に拘束する。

## Blocking issue

1. 主人公にProduct Ownerの最終品質承認がない。atlas上端・左右端の自動bounds検査PASSだけでは、背景との画風整合や歩行品質を承認できない。
2. 3エリアすべてで独立ground lineとの差が6 CSS pxを超える。
3. `life-road/up`の背景入口とtrigger中心差が全viewportで32 CSS pxを超える。
4. `upper-vending-lane/down`の背景に視覚的な下方向出口がない。
5. `life-road/up`は全viewportで主人公を遮蔽し、`upper/down`も横長mobile 2条件で遮蔽する。
6. BGMはObjective PASSだがHuman listeningが未検証で、ユーザーの「雑音」指摘が未解決。
7. Candidate、Preview、Artifactが未到着のため、before／afterとSHA一致を検証できない。

## Candidate監査

`fix/m1-5-real-device-polish` branchおよび対応するopen PRは監査時点で見つからなかった。したがってPhase 2は未実行であり、candidate headを推測していない。到着後は正確なPR head SHAから別worktreeと一時audit branchを作り、このQA commitを適用して同位置・同viewportでbefore／after、`npm run check`、全QA、Preview build SHA、Artifact digestを照合する。実装branch自体は変更しない。

## ユーザー実機確認が必要な項目

- Candidate主人公の完成素材をProduct Ownerとして承認できるか。
- Candidate PreviewのBGMが雑音ではなく意図した音楽として聞こえるか。
- 844×390および対象iPhone実機の横画面で、主人公全身、接地、背景導線、panel遮蔽、操作性が成立するか。
- 実機確認時のPreview表示SHAがcandidate headと一致するか。
