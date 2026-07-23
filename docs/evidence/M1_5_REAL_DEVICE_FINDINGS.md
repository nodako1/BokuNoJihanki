# M1.5 ユーザー実機所見

## 記録概要

- 確認日: 2026-07-23
- 確認者: ユーザー
- 確認対象: `https://boku-no-jihanki.vercel.app/`
- 対象履歴build: M1.4 Production merge `147f770a4b73077c4e5dc0523839b3fefb789db4`
- 確認方法: ユーザー実機でのプレイと聴感
- 端末: ユーザー実機（機種未記録）
- 端末モデル、OS version、Safari version、実測viewport: 今回の所見本文には記録なし。M1.5の再確認証跡で実値を記録する

本書はユーザー報告を事実として記録し、未取得の測定値や画像番号を補完しない。修正の受入基準は[M1.5必須実機品質修正仕様](../specs/M1_5_REAL_DEVICE_POLISH.md)を正とする。

## M1.4 Production履歴との関係

M1.4は正常にProductionへ配信され、既存の自動検証と公開画面確認に成功している。この履歴は有効なまま保持する。

| 項目 | 既存結果 |
| --- | --- |
| navigation core merge | `ee255a1a8413768d0e7dbdf512964268c8eaf276` |
| 実装PR #32 head | `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf` |
| Production merge | `147f770a4b73077c4e5dc0523839b3fefb789db4` |
| PR Quality | run `30008762303` — success |
| PR Browser Smoke | run `30008762333` — success、Artifact `8564271801` |
| main Quality | run `30009404756` — success |
| Production Smoke | run `30009405068` — success |
| Production Browser Smoke | run `30009404814` — success、Artifact `8564582434` |
| Browser結果 | 3エリア、5遷移、15画面、全既存invariant成功 |
| Webエラー | `pageerror` 0件、failed request 0件 |

詳細は[M1.4 Production Evidence](M1_4_PRODUCTION_EVIDENCE.md)を正とする。

既存の`fixed ground-line invariant: true`は、主人公Yと実装済み`groundY`が一致したことを示す。背景に描かれた道路面との視覚差を測った結果ではない。既存のtrigger検証も内部range内のpromptと遷移を確認したもので、背景上の道・出口との一致を測っていない。15画面Artifactは配信とシナリオの証跡として保持するが、M1.5の接地、背景分岐、UI重なり、BGM品質の合格根拠にはしない。

## 実機で確認された問題

| ID | 実機所見 | 期待との差 | 影響 | 判定 |
| --- | --- | --- | --- | --- |
| RD-01 | 主人公が未完成の仮素材に見える | 背景と同等の完成度を持つ最終ラスタ素材ではない | ゲーム全体が制作途中に見える | M1 blocking |
| RD-02 | マップごとに接地位置が道路と合わず、空中を歩いて見える | 足元pivotと背景道路面が一致していない | 移動の説得力と操作感を損なう | M1 blocking |
| RD-03 | `life-road`の背景上の上り道と上方向triggerが大きくずれている | 道へ到達した時点で案内が出ず、離れた位置で出る | 背景と操作ルールが矛盾する | M1 blocking |
| RD-04 | `upper-vending-lane`の下矢印に対応する道・出口が背景にない | 下移動を説明する坂、階段、道、開口部がない | 遷移先と空間構造を理解できない | M1 blocking |
| RD-05 | 遷移パネルが主人公を覆い、表示中に主人公が隠れる | UIと主人公が交差せず、余白を持つ必要がある | 視認性と操作性を損なう | M1 blocking |
| RD-06 | BGMがほぼ雑音で、音楽として成立していない | 旋律、和音、反復構造を認識できる完成BGMではない | 聴感品質が完成基準に達しない | M1 blocking |

## 再現範囲

### RD-01、RD-02

3エリアで主人公を左右へ歩かせ、idleへ戻す。背景道路に対する足元位置と、主人公の輪郭・体格・光方向を確認すると再現する。現在の報告ではエリア別のCSS px差は未計測であるため、M1.5で背景を正解にして測定する。

### RD-03

`life-road`を背景上の上り道まで移動し、上案内の出現地点を確認する。背景では上り道が見えているのに、その入口と大きく離れた位置まで移動しないと案内が出ない。

### RD-04

`upper-vending-lane`で下案内を表示する。案内自体は表示されるが、背景に下へ続く道、坂、階段、開口部が見当たらない。

### RD-05

上下分岐の案内を表示し、主人公との位置関係を確認する。遷移パネルが主人公と重なり、主人公を覆う。

### RD-06

音声を有効にし、ユーザー実機でBGMを聴く。環境ノイズと音楽の区別がつかず、完成したBGMとして認識できない。

## 既存検証で検出できなかった理由

| 対象 | 既存検証 | 不足していた検証 |
| --- | --- | --- |
| 接地 | `playerY === areaGroundY` | 背景道路面を独立正解にしたCSS px差 |
| 分岐 | 内部trigger rangeでpromptと遷移を確認 | 背景上の道・出口とtriggerの位置対応 |
| UI | 案内表示とタップ動作 | UIと主人公の交差面積、最短間隔 |
| 主人公 | atlas frame数とheadless画像 | 背景と同等の完成度、全frameの体格・光・pivot一貫性 |
| BGM | mute、時間帯、focus、エリア間状態保持 | 旋律・和音・反復、true peak、clipping、自然なloop、実機聴感 |

`m14ManualProductionVerification.audio: true`は音声操作と状態保持が動作した履歴であり、BGMの音楽品質が承認されたことを意味しない。

## 状態判断

- M1.4のProduction配信成功履歴と既存証跡は維持する
- M1全体の完成判定は再オープンする
- M1.5を必須の実機品質修正とする
- M2はM1.5完了、Production確認、ユーザー実機承認まで開始しない
- M1.3と`src/game/economy/`を保存し、M1.5では変更・接続しない
- `sourceSpawnId`問題は修正済みのため、未解決課題へ戻さない

## M1.5証跡の現在値

| 項目 | 状態 |
| --- | --- |
| M1.5実装commit SHA | 未実施 |
| M1.5 PR Quality run ID | 未実施 |
| M1.5 PR Browser Smoke run ID | 未実施 |
| 主人公素材の出所・生成方法・ライセンス・hash | 未実施 |
| 背景基準の接地・分岐測定 | 未実施 |
| 3 viewportのUI／主人公重なり測定 | 未実施 |
| BGM客観解析 | 未実施 |
| M1.5 Production対象SHA | 未実施 |
| M1.5 Production Smoke run ID | 未実施 |
| M1.5 Production Browser Smoke run ID | 未実施 |
| ユーザーiPhone実機の画面承認 | 未実施 |
| ユーザーiPhoneスピーカーの聴感承認 | 未実施 |

M1.5の実装、PR、mainマージ、Production配信は本書作成時点では行っていない。
