# M1完了計画

## 状態と判定ラベル

**M1.4 Release Candidate実装済み・Production確認前**

本書はM1.4の完了判定と、M1完了後にM2へ進むためのgateを定義する。作成時の実装監査基準はPR #32 head `414338ce3b83f361e57271cf5d9d1f035080d1f7`であり、最終main／Production SHAではない。

- **実装済み**: コード、アセット、テスト定義をリポジトリ内で確認済み
- **自動検証済み**: 明記した対象でコマンドまたはworkflowの成功を確認済み
- **未確認**: PR最終head、main、Productionまたは実機での確認が必要
- **完了**: 必須条件と証跡が同じ最終main／Production SHAを示している

### Chat A最終証跡

最終値が確定するまでは推測値を記入しない。

| 証跡 | 値 |
| --- | --- |
| PR #32最終head SHA | `{{CHAT_A_TO_FILL}}` |
| mainマージ／Production対象SHA | `{{CHAT_A_TO_FILL}}` |
| Quality run ID | `{{CHAT_A_TO_FILL}}` |
| PR Browser Smoke run ID | `{{CHAT_A_TO_FILL}}` |
| Production Smoke run ID | `{{CHAT_A_TO_FILL}}` |
| Production Browser Smoke run ID | `{{CHAT_A_TO_FILL}}` |
| Production実画面確認日時 | `{{CHAT_A_TO_FILL}}` |

## 1. M1.4完了後にM1が満たす必須条件

### 実装済み

- 正式なプレイ経路は`SideScrollTownScene`による2D横スクロールである
- `home-street`、`life-road`、`upper-vending-lane`の3エリアと、左右端および上下分岐の4接続を持つ
- X方向だけを移動し、`horizontalAxis`、固定`groundY`、横カメラ追従、look-ahead、bounds制限へ対応する
- Claude navigation core PR #33はmainへマージ済み（`ee255a1a8413768d0e7dbdf512964268c8eaf276`）
- adapterはfallbackではなく`src/game/navigation/`のcoreを直接利用し、`horizontalAxis`を`resolveHorizontalMovement`へ直接渡す
- coreは9状態、Scene公開層は`idle`、`fading-out`、`loading`、`fading-in`の4状態である
- 遷移中の入力ロック、重複遷移防止、area／spawn／facing解決、失敗時復帰を持つ
- 各エリアに`morning`、`day`、`evening`、`night`の4背景があり、3つの別masterから計12背景を生成している
- 同じ全景の左右反転・単純複製・リサイズによるエリア間流用はせず、エリアごとに別master・別構図を持つ
- 主人公atlasは左右各4 idle、左右各10 walk、合計28frameで、接地frame 2・7へ足音を同期する
- 時刻、時間帯、ミュート状態、AudioContextをエリア遷移後も維持する
- area／phase mixは`setTargetAtTime`の0.7秒・0.8秒設定で平滑化する
- `document.hidden`時はmaster gainを下げ、入力、速度、新しい足音を停止する
- documentが可視のままの単純なblurでは音量を変更せず、入力、速度、新しい足音を停止する
- M1.3のScene、map、atlas、アセット、旧遷移stateをrollback用fallback兼設計履歴として保存する
- M2 economy／saveコアを保存し、M1.4 Scene、bridge、UIから接続しない
- landscape manifest、portrait guard、safe-area、横方向touch入力、上下分岐ボタンを持つ

### 未確認の必須条件

- PR #32の最終headでQualityとPR Browser Smokeが成功する
- PR実画面のVisual Reviewとnavigation境界の最終レビューが完了する
- PR #32がmainへマージされ、同じ対象SHAがVercel Productionへ反映される
- Production SmokeとProduction Browser Smokeが同じ対象SHAで成功する
- Production実画面のVisual Reviewが合格する
- `pageerror`とfailed requestが0件である
- 上の最終証跡表と関連状態文書が実績値で一致する

## 2. 自動検証で確認できる項目

本書作成時の独立docs worktreeではNode.js 22.14.0で`npm run check`が成功し、106／106 tests、validate、lint、typecheck、Production buildを通過した。この結果は文書commitの検証であり、Chat Aが取り込んだ後のPR最終head／main／Productionのworkflow成功を代替しない。

### 既存コードで確認できること

- `npm run validate`: 必須ファイル、3エリア、12背景、28frame、M1.3保存を検証する
- `npm run lint`と`npm run typecheck`: 静的品質と型整合を検証する
- `npm test`: area graph、4接続、spawn、trigger、到達可能性、異常データ検出を検証する
- `npm test`: core 9状態、input lock、二重開始拒否、cancel／error復帰を検証する
- `npm test`: 左右移動、`horizontalAxis`、加減速、bounds、delta分割、30／60fpsの近似一致を検証する
- `npm test`: adapterからcoreへの直接import／呼び出しと、9状態から4状態への投影を検証する
- `npm test`: 3エリア×4背景、28frame atlas、M1.3保存、M2 economy／saveコアの退行を検証する
- `npm run build`: Production buildが生成できることを検証する
- `npm run check`: validate、lint、typecheck、unit test、Production buildを一括実行する

### 最終候補で必要な自動検証

1. `npm ci --no-audit --no-fund`
2. `npm run check`
3. PR Browser Smokeで3エリア、左右歩行、カメラ、固定Y、5回の遷移、input lock、上下矢印、4時間帯、時刻・mute維持、blur停止、単一canvas、エラー0件を確認
4. Production SmokeでVercel成功、対象bundle marker、主要M1.4 assetの取得を確認
5. Production Browser Smokeでbuild badgeのSHA、3エリア往復、状態snapshot、console、network、traceを確認

### 自動検証の限界

- Browser Smokeはheadless Chromiumの1280×720であり、touch joystick、iOS Safari、Android Chrome、実機性能を保証しない
- 別masterであることは検証できても、3エリアが別の場所に見えるかは自動判定できない
- 足滑り、画材の統一、矢印の分かりやすさ、音の聞こえ方は人間の確認が必要
- blur停止はBrowser Smoke対象だが、`document.hidden`時のmaster gain低下は実機または手動runtime確認が必要
- 現行Browser SmokeのFPS条件はframe loopが動作することの確認であり、実機の快適性を保証しない

## 3. 実画面で確認する項目

PR実画面をmainマージ前に確認し、Production反映後に同じ観点で再確認する。

- 開始前後に黒画面、欠落texture、asset 404、不要なScene再生成がない
- 3エリアが反転・複製ではなく、住宅配置、道路形状、小物、植栽、空の抜けが異なる場所に見える
- 主人公の足がground lineに接し、足滑り、向き反転、idle復帰が自然である
- カメラ追従とlook-aheadが自然で、左右端から背景外が見えない
- 暗転、短いロード、地名表示、入力ロックの長さと順序が自然である
- 上下矢印の意味、表示位置、接続先が直感的である
- 朝、昼、夕方、夜の差、夜間照明、時間帯切替に破綻やちらつきがない
- 最初のユーザー操作後だけ音が始まり、muteが効く
- area mixの0.7〜0.8秒設定にpop、途切れ、不自然な音量差がない
- 足音が接地と一致し、停止、blur、タブ非表示、復帰時に連打されない
- portrait guard、safe-area、HUD、joystick、矢印が重ならない
- Productionのbuild badge、対象SHA、console、networkが最終証跡と一致する

## 4. 代表的iPhone／Android実機で残る確認

最低でもiPhone SafariとAndroid Chromeを1台ずつ確認し、端末名、OS、ブラウザversion、確認日時、観測FPSを記録する。Dynamic Island／notchを持つiPhoneと、360〜412 CSS px幅のPixel／Galaxy相当Androidを優先し、小画面を正式サポートする場合は小型iPhone相当も追加する。

- portrait案内、landscape復帰、回転中の状態維持
- iPhoneのsafe-area、アドレスバー伸縮、Home Screen追加版と通常Safariの差
- Androidの画面比率差、gesture navigation領域、通常Chromeでの表示
- joystickのdrag、pointer capture、指を外したときとpointer cancel時の確実な停止
- joystick操作中の上下矢印tap、mute、開発UIの誤操作や重なり
- AudioContextの初回開始、background化・復帰、ミュート維持、足音停止
- 3エリア往復と4時間帯切替の反復後もtexture欠落、reload、継続的なstutterがない
- メモリ増加、発熱、音切れがプレイ継続を妨げない
- HUDの警告境界である45 FPSを継続的に下回らない

これらはM1.4 Release Candidate作成時点では未確認であり、headless Chromiumの成功で代替しない。

## 5. iOS Safari orientation lock制約

現行実装は`screen.orientation.lock()`を呼ばず、`manifest.webmanifest`の`orientation: landscape`と`OrientationGuard`を使用する。manifest指定はinstalled standaloneでの希望値であり、通常のiOS Safariで強制lockを保証しない。Screen Orientation APIのlockはuser agentがfullscreenやinstalled applicationなどの事前条件を課せるため、iPhone Safariで常に成功する前提にしない。

M1の合格条件は「自動で横向きへ強制固定されること」ではない。portrait時に全面案内を表示し、ユーザーが端末を回転した後に案内が消え、同じゲーム状態へ戻れることを確認する。OS側の回転lockをWeb側から強制解除しない。

参考: [W3C Screen Orientation](https://www.w3.org/TR/screen-orientation/)、[WebKit issue 257695](https://bugs.webkit.org/show_bug.cgi?id=257695)

## 6. M1.5 polishが必要になる条件

黒画面、遷移不能、asset 404、例外、入力停止不能、誤ったspawnなどの必須機能不良はM1.5へ先送りせず、M1.4のrelease blockerとして修正する。M1.5はM1.4の機能gateを満たした後に残る非機能・体験品質の調整だけに限定する。

次のいずれかが再現する場合は、範囲を限定したM1.5 polishを実施する。

- 実機でtouch入力が詰まる、指を離しても移動し続ける、UIがsafe-areaと重なる
- 代表実機で45 FPS未満が継続する、目立つframe drop、発熱、texture memory問題がある
- 足滑り、カメラ酔い、遷移の間、背景継ぎ目、主人公と背景の画材不一致が目立つ
- area mixのpop／途切れ、足音同期ずれ、background復帰時の音量異常がある
- iOS Safari／Android Chrome固有のviewport、audio、pointer差分がある

該当問題がなければM1.5を形式的に作らず、直接M2へ進む。

## 7. M2 Scene統合へ進める条件

### 既に満たしていること

- navigation core PR #33がmainへマージ済みである
- adapterがcoreを直接利用している
- M2 economy、RNG、saveコアと単体テストが保存されている
- M1.4 Scene、bridge、UIからeconomyコアをimportせず、責務を分離している

### M2開始前に満たすこと

- M1.4の最終main SHAがProduction確認済みで、最終証跡表が埋まっている
- M1.4のrelease blockerが0件である
- 実機確認でM1.5条件に該当した場合は、M1.5を先に完了する
- 自販機ID、area内の位置、接近範囲、interaction表示条件を固定する
- Scene、React UI、economy、save、ゲーム内clockの状態所有とbridge契約を決める
- interaction中のnavigation input lock、接写UI、結果演出、所持金表示、save／load lifecycleを契約化する

## 8. M1完了後の推奨実装順

1. iPhone Safari／Android Chrome実機smokeを完了する
2. M1.5条件に該当する問題だけをpolishし、問題がなければM1.5を省略する
3. M2統合契約を確定する: machine ID、配置、単一clock、input lock、bridge、save責務
4. 1台の自販機で「接近→選択→接写→抽選→所持金・時間更新→保存」の縦切りを実装する
5. 対象自販機、当日一回制御、時間制限、reload復元へ拡張する
6. M2のunit test、Browser Smoke、実機確認、Production確認を完了する
7. M3の日付変更、自室、ゲームショップへ進む
