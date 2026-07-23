# M1.5 必須実機品質修正 仕様書

## 1. 状態

**必須・M1完成判定を再オープン・M2開始をブロック**

M1.4はmain `147f770a4b73077c4e5dc0523839b3fefb789db4`として正常にProduction配信され、既存のQuality、Browser Smoke、Production Smoke、Production Browser Smokeに成功した。この配信履歴と[既存Production証跡](../evidence/M1_4_PRODUCTION_EVIDENCE.md)は取り消さない。

その後の2026-07-23のユーザー実機確認で、主人公、接地、背景と分岐triggerの整合、遷移UI、BGMに完成を妨げる品質問題が確認された。このためM1全体の完成判定を再オープンし、M1.5を任意polishから必須の実機品質修正へ変更する。

本書は、実機所見より前に作成された[M1.5旧仕様](M1_5_POLISH.md)の「任意・M2をブロックしない」という判断を置き換える現行仕様である。確認された事実は[M1.5実機所見](../evidence/M1_5_REAL_DEVICE_FINDINGS.md)を正とする。

M2は次の3条件をすべて満たすまで開始しない。

1. 本書のM1.5受入条件をすべて満たす
2. M1.5対象commitをProductionで確認する
3. ユーザーがiPhone実機で画面と音を承認する

## 2. 目的

- 背景と同等の完成度を持つ最終主人公をゲームへ組み込む
- 実装座標ではなく背景の道路を正解として、足元、spawn、分岐入口、triggerを一致させる
- 遷移UIが主人公を隠さず、代表的な横画面で安全に操作できるようにする
- 環境ノイズとBGMを分離し、音楽として成立する完成音源へ置き換える
- headless自動検証とユーザー実機確認の役割を分離し、両方を合格条件にする

## 3. 変更範囲と保護対象

### 3.1 M1.5で扱うもの

- M1.4専用主人公ラスタ素材とatlas
- 3エリアの道路面、接地基準、spawn、分岐入口、trigger
- `life-road`の上分岐と`upper-vending-lane`の下分岐に対応する背景
- 上下遷移パネルの配置、衝突回避、タッチ領域
- BGM、環境音、音量、ループ、音声分析
- 上記を検証する自動テスト、Browser Smoke、実機確認証跡

### 3.2 変更・接続しないもの

- M1.3のコード、画像、生成工程、設計履歴
- `src/game/economy/`のコアとテスト
- M2の自販機探索、所持金、時間消費、抽選、セーブ
- NPC、会話、イベント、新規エリア

M1.3と`src/game/economy/`は保存し、M1.5から変更、削除、import、Scene接続を行わない。

### 3.3 解決済み事項

`sourceSpawnId`の保存・復元問題はPR #32最終head `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`で修正され、Production merge `147f770a4b73077c4e5dc0523839b3fefb789db4`にも含まれている。非初期spawnへ復帰する回帰テストも成功済みであり、M1.5の未解決課題へ戻さない。

## 4. 受入条件

### 4.1 主人公

- 背景と同等の完成度、画材、解像感を持つ最終ラスタ素材である
- 左右各4フレームのidleと左右各10フレームのwalkを維持し、全28フレームで同一人物に見える
- idle、左歩行、右歩行で足元pivot、体格、頭身、輪郭、服装、光方向、影の向きが一貫する
- 3エリア、4時間帯、左・中央・右の確認地点で浮遊、埋没、足滑りがない
- 停止時は自然なidleへ戻り、閉鎖端や入力ロック中に足踏みしない
- 素材の出所、生成方法、使用ツールとversion、人手修正、ライセンス、各最終ファイルのSHA-256 hashを記録する

主人公素材の記録は「プロジェクトオリジナル」という一語だけで済ませず、第三者が同じ最終ファイルを識別できる粒度にする。M1.5開始時点では最終素材とhashの確定は**未実施**である。

### 4.2 接地と分岐

背景を独立した正解データとして使用する。現在の`groundY`、spawn、triggerをそのまま期待値に転記してはならない。背景上の道路面、坂、階段、開口部を先に特定し、それに合わせて実装値を決める。

| areaId | walkable領域 | ground line | spawn | 背景上の分岐入口 | trigger |
| --- | --- | --- | --- | --- | --- |
| `home-street` | 私有地や塀を除く、背景で連続して見える道路面 | 開始、中央、終端で足裏が接する道路線を背景から採る | `start`、`from-life`を道路線上へ置く | 右端に`life-road`へ続く見た目を持たせる | 右出口を背景上の道路終端と一致させる |
| `life-road` | 左端から右閉鎖端までの生活道路と、上り道入口 | 開始、中央、終端、`from-home`、`from-upper`、上分岐で背景から採る | `from-home`、`from-upper`を道路線上へ置く | 背景で上へ続く細い道の入口を明示する | 主人公が背景上の上り道入口へ到達した時点で上案内を表示する |
| `upper-vending-lane` | 自販機のある路地と、下方向へ戻る出口までの道路面 | 開始、中央、終端、`from-life`、下分岐で背景から採る | `from-life`を道路線上へ置く | 下矢印に対応する道、坂、階段、開口部のいずれかを背景に明示する | 下案内を背景上の出口到達時だけ表示する |

各エリアの最終証跡には、walkable領域、背景から採ったground line、spawn、背景上の分岐入口、trigger範囲を同一座標系で記録する。道路が傾斜または段差を持つ場合、単一の固定Yを正解にせず、区間別またはXに応じた接地線を使用する。

表示上の足裏pivotと背景道路面の垂直差は、次の全地点で6 CSS px以内とする。

- エリア開始地点
- エリア中央
- エリア終端
- すべてのspawn
- すべての分岐地点

朝、昼、夕方、夜の背景差分は同じ道路形状と接地基準を維持する。見えている道と内部triggerが矛盾する状態、道が見えるのに案内が出ない状態、道がないのに案内が出る状態は合格にしない。

### 4.3 UI

- 主人公の表示boundsと遷移パネルの表示boundsの交差面積を0にする
- 主人公と遷移パネルの最短間隔を12 CSS px以上にする
- `1280×720`、`844×390`、`932×430`の各viewportでsafe-areaを含めて安全な位置へレスポンシブ配置する
- 上下遷移パネルのタッチ領域を44×44 CSS px以上にする
- パネルが背景上の分岐入口との対応を示しながら、主人公、足元、進行方向を隠さない
- 案内表示前、表示中、通過後、遷移ロック中のすべてで不要な残留やちらつきがない

UI同士の重なりだけでなく、UIとPhaser内の主人公を同じCSS座標系へ変換して測定する。

### 4.4 BGM

- BGMと環境音を別のassetまたはbusとして分離する
- セミ、風、車、葉音などのノイズをBGM本体として扱わない
- BGMには人が旋律、和音、反復構造を認識できる構成を持たせる
- decode errorを0件にし、再生中のclippingを発生させない
- 最終出力のtrue peakを-1 dBTP以下にする
- ループ境界でクリック、急な無音、音量跳躍、拍の欠落がない自然なループにする
- mute、時間帯、エリア遷移、`document.hidden`、`window.blur`に関する既存状態保持を退行させない
- 客観解析に加え、ユーザー本人のiPhoneスピーカーで音楽として成立していることの聴感承認を得る

true peak、clipping、loop duration、ループ境界の解析結果を証跡へ保存する。M1.4の`audio: true`は音声操作と状態保持の履歴であり、BGMの音楽品質承認として流用しない。

### 4.5 QA

最小確認matrixは次のとおり。

| 軸 | 必須組合せ |
| --- | --- |
| エリアと位置 | 3エリア × 左・中央・右 |
| 主人公状態 | 左歩行・右歩行・idle |
| 時間帯 | 朝・昼・夕方・夜 |
| 分岐 | `life-road`上方向と`upper-vending-lane`下方向を往復 |
| 案内状態 | 表示前・表示中・通過後 |
| viewport | `1280×720`、`844×390`、`932×430` |

QAでは次をすべて確認する。

- 足裏と背景道路面の差を開始、中央、終端、spawn、分岐で測る
- UIと主人公の交差0、間隔12 CSS px以上を測る
- タッチ領域44×44 CSS px以上を測る
- 背景上の道・出口と内部triggerの対応を確認する
- 上下往復後もarea、spawn、向き、時刻、時間帯、mute、AudioContext、Scene、bridge listenerの状態を維持する
- `pageerror` 0件、failed request 0件を維持する
- BGMのdecode、clipping、true peak、loopとiPhone聴感を確認する
- M1.3と`src/game/economy/`のコード・素材・テストが保持され、M1.5 Sceneへ接続されていないことを確認する

headless screenshotの枚数、内部`groundY`との一致、内部trigger範囲の通過だけでは合格にしない。最終判定にはProductionのユーザー実機承認を必須とする。

## 5. 必要証跡

| 証跡 | M1.5開始時点 |
| --- | --- |
| 実装PR head SHA | 未実施 |
| 主人公素材の出所・生成方法・ライセンス・SHA-256 | 未実施 |
| 背景基準の接地・spawn・分岐・trigger表 | 未実施 |
| 3 viewportのUI／主人公測定結果 | 未実施 |
| BGM客観解析結果 | 未実施 |
| PR Quality run ID | 未実施 |
| PR Browser Smoke run IDとArtifact | 未実施 |
| Production対象SHA | 未実施 |
| Production Smoke run ID | 未実施 |
| Production Browser Smoke run IDとArtifact | 未実施 |
| ユーザーiPhone実機の画面承認 | 未実施 |
| ユーザーiPhoneスピーカーの聴感承認 | 未実施 |

存在しないrun ID、Artifact ID、commit SHAを推測して記録しない。

## 6. 完了手順

1. 6件の実機問題を修正し、必要証跡を作成する
2. Node.js 22で`npm run check`を成功させる
3. ローカルBrowser Smokeと人間による背景基準のVisual Reviewを完了する
4. PR Quality、PR Browser Smoke、Artifact監査を完了する
5. mainへ取り込み、M1.5対象SHAをVercel Productionへ配信する
6. Production SmokeとProduction Browser Smokeを成功させる
7. Productionで3 viewportとQA matrixを再確認する
8. ユーザーがiPhone実機で画面とBGMを承認する
9. M1全体を完成へ戻し、M2開始gateを解除する

本書の文書commit自体は実装、PR作成、mainマージ、Production操作を行わない。M1.5の実装と証跡作成は後続担当が行う。
