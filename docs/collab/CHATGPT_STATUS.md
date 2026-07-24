# つくちゃん（ChatGPT）状況

最終更新: 2026-07-24

## 役割

M1.5「実機品質修正版」の再構築、実装統合、checkpoint永続化、PR／Preview／CI、候補QA対応、Evidence統合、承認後のリリースを担当する。4担当のうちmainマージとVercel Production確認を行えるのはつくちゃんだけだが、ユーザーが候補Previewの完全SHAを実iPhoneで明示承認するまでは、どちらも実行しない。

## 現在の状態

- M1.4のProduction配信と検証に成功した履歴は有効であり、保持する。
- M1は実機品質問題のため再オープンし、M1.5は必須である。
- M2とopen PR #31は停止したまま変更しない。
- Production baselineは`29223ee31fd4fc4fbca21a37b01fe89277279647`。
- 作業branchは`fix/m1-5-real-device-polish-rebuild`。
- 過去の未push commit `04c6d0879fc4283d94d0a6d515a1916a0999406b`は一時環境消失により復元不能で、現在のcandidateまたはEvidenceではない。

M1.5はbaselineから新しいcommit群として再構築している。

| checkpoint | commit | 状態 |
| --- | --- | --- |
| CP1 主人公・背景・BGM、source、provenance、hash | `edfb2b5f549e8f0407215402e868ebbe6d23c7f4` | remoteへcheckpoint済み |
| CP2 接地・上下導線・遷移パネル・音声runtime | `bd33365d8b3504f9ca034517ec01f2ba5081f023` | remoteへcheckpoint済み |
| CP3 contract／unit／回帰test、fixture、validator | `67b61f703a48bb5086ef53f4ffd92594f5ac3d3e` | remoteへcheckpoint済み |
| CP4 local／Preview Browser Smoke、Evidence、状態文書 | 未確定 | 進行中 |
| CP5 CI、独立review、candidate QA、Evidence監査修正 | 未確定 | 未完了 |

CP1〜CP3のremote保存は実装の消失防止checkpointであり、合格、実機承認、Production-readyを意味しない。

## 他担当branchの確認

- `docs/m1-5-mandatory-device-correction`はremote head `8cafab0aafd18b29857111630521697f293fc493`をread-onlyで確認した。branch全体はmergeせず、M1再オープン、M1.5必須、M2停止、same-SHA Previewから実iPhone承認を経るgateだけを現在の実装状態へ手動反映した。
- `test/m1-5-real-device-audit`はremote head `b4fdc11c27e799e06cfa8ec45ad5544516746348`をread-onlyで確認した。branch全体およびbaseline欠陥を検出する意図的FAILは取り込まない。独立ground注釈、alpha maskによる足位置と遮蔽の考え方、baselineだけをBLOCKEDにするEvidence方針を再検証して採用した。
- audit branchの`life-road`入口注釈は現在の画像を再測定した値と一致しないため流用しない。現在の12背景SHAへ結び付けたfixtureと新しいoverlayを正とする。
- audit branchの「baselineには静的BGMがない」という契約はcandidateに成立しないため取り込まない。M1.5 candidateは専用pathの48 kHz stereo静的BGMを検証する。

## M1.4 Production履歴

- navigation core PR #33 merge: `ee255a1a8413768d0e7dbdf512964268c8eaf276`
- 実装PR #32 head: `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`
- M1.4実装Production commit: `147f770a4b73077c4e5dc0523839b3fefb789db4`
- PR Quality run: `30008762303`
- PR Browser Smoke run／Artifact: `30008762333`／`8564271801`
- Production Smoke run: `30009405068`
- Production Browser Smoke run／Artifact: `30009404814`／`8564582434`
- Production Artifact digest: `sha256:6f83bfcf99ac2f2af0e98899568ee2c17ac28e3f3ad70aef29f4c7f7c26744f3`
- 15画面、3エリア、5遷移、`pageerror` 0、failed request 0

詳細は[M1.4 Production Evidence](../evidence/M1_4_PRODUCTION_EVIDENCE.md)を正とする。これらはM1.4配信履歴であり、M1.5 candidateの合格証跡へ流用しない。

## M1.5実装境界

- 正式area IDは`home-street`、`life-road`、`upper-vending-lane`だけを使う。
- M1.3、M1.4の資産を上書きまたは削除しない。
- `src/game/economy/`、旧Scene、M2機能を変更または接続しない。
- 新しい画像と音声はM1.5専用pathと新URLへ置く。
- geometry期待値は背景SHA-256に結び付いた`src/game/areas/m15GeometryFixture.mjs`だけを出典とする。
- Evidence scriptへgeometry期待値を重複記載しない。
- 画像、音声、fixture、metricsのhashとprovenanceをcandidateから新規取得する。

## 次のゲート

1. Node.js 22系と既存lockfileでvalidator、lint、typecheck、test、Production build、`npm run check`を完了する
2. 1280×720、844×390 touch、932×430 DPR 3 touchのlocal Browser Smokeと人間の全画面目視を完了する
3. remote PR headと同じ完全SHAのVercel Previewで同じSmokeを完了する
4. 同じSHAでCI、自動レビュー、くーちゃんcandidate QA、リダ君Evidence監査を成功させる
5. ユーザーへPR、完全SHA、Preview URL、全Evidenceを提示し、実iPhoneで5項目の承認を受ける
6. 承認対象SHAとPR headが一致する場合だけmainへマージし、同じmerge SHAのProductionを再検証する

codeまたはassetが変わるたび、CI、Preview Smoke、candidate QA、Evidence監査を新SHAで再実行する。実iPhone承認後に変更した場合も、新しいPreview SHAで承認を取り直す。

## 未完了

- local／Preview Browser Smokeと全画面目視
- baseline／candidate Evidence
- PR head、Vercel Preview、Actions、Artifactの同一SHA照合
- くーちゃんcandidate QA
- リダ君Evidence監査
- ユーザーの実iPhone承認
- main merge、Vercel Production deployment、Production Smoke

現在のM1.5にProduction完了判定はない。
