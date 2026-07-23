# M1.5 旧実機polish仕様（廃止済み）

## 状態

**superseded・現行判断と受入判定への使用禁止**

本書はM1.4配信直後に作成された旧仕様の場所を、既存リンクのために残す案内である。M1.4実装がmain `147f770a4b73077c4e5dc0523839b3fefb789db4`で正常にProduction確認された履歴は有効であり、PR #34後の`29223ee31fd4fc4fbca21a37b01fe89277279647`が現main／Production baselineである。

その後のユーザー実iPhone確認で、主人公、3エリアの接地、上下導線、遷移パネル、BGMにM1 blockingの品質不足が判明した。このためM1全体の完成判定を再オープンし、current milestoneをM1.5必須実機品質修正へ変更した。

## 現行仕様

[M1.5 必須実機品質修正](M1_5_REAL_DEVICE_POLISH.md)を唯一の現行仕様とする。

- local candidateと同一SHAのVercel Previewを用意する
- 自動テスト、くーちゃんcandidate QA、リダ君Evidence監査を完了する
- ユーザーがPreviewを実iPhoneで5項目承認するまでmainへ進めない
- 承認後にコード・素材が変わった場合は、新SHAで再承認する
- 承認済みSHAだけをmainへマージし、Productionで再確認する
- M2 Scene統合とopen PR #31は全gate完了まで変更・マージしない

旧数値、旧手順、旧完了判断をM1.5 candidateの仕様またはEvidenceとして使用しない。
