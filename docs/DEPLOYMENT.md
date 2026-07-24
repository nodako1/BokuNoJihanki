# デプロイ

Production Branchは`main`。Featureブランチの通常Vercel Previewは停止する。ただしM1.5は、main前の実iPhone承認に使用するcandidate同一SHAのPreviewを例外として用意する。

## M1.3完了フロー

1. Featureブランチ
2. `npm run check`
3. PR
4. PR Browser Smoke
5. 実画面の方向別歩行・衝突・全区間確認
6. mainマージ
7. Vercel成功
8. Production Smokeで`M1.3 RESIDENTIAL HUD`とM1.3アセットを検査
9. Production Browser Smoke
10. Production Visual Evidence
11. README、PROJECT_STATE、仕様確定

Vercel Readyだけでは完了ではない。Productionでwalkable外へ出られず、足が動き、全住宅街区間を歩けることまで確認する。

## M1.4完了フロー（完了・Production確認済み）

Production Branchは引き続き`main`とし、M1.4のFeatureブランチは`feat/m1-4-side-scroll-town`を使用する。M1.3はロールバック可能なフォールバックとして残し、M2 economyコアは変更しない。

1. M1.4全体仕様とnavigation境界を確定する
2. 3エリア、主人公、UI、時間帯、Web Audioを単一永続Sceneへ統合する
3. `npm ci`と`npm run check`を成功させる
4. Feature PRを作成する
5. PR Browser Smokeで3エリア、4接続、左右歩行、上下矢印、4時間帯を自動操作する
6. PR Artifactのconsole、state JSON、trace、スクリーンショットを確認する
7. PR実画面で接地、足滑り、camera、構図、スマートフォン横画面を確認する
8. navigation adapter境界と統合の自動レビューを行い、指摘を解消する
9. M1.4当時はユーザーの手動操作待ちで止めず、全gate成功後にmainへマージする
10. Vercel Productionが対象main commitを配信したことをSHAで照合する
11. Production Smokeを実行する
12. 実際のProduction URLに対してProduction Browser Smokeを実行する
13. Production実画面で3エリア、全接続、歩行、camera、4時間帯、音声を再確認する
14. pageerror／failed request 0件とArtifactを確認する
15. README、PROJECT_STATE、関連仕様、連携ボード、証跡をProductionの事実に合わせて確定する

### Production Smoke

- HTMLと主要M1.4 assetがHTTP成功する
- 配信commitが期待するmain merge commitと一致する
- `home-street`、`life-road`、`upper-vending-lane`の背景・前景が取得できる
- M1.4横視点player atlasが取得できる
- 旧M1.3フォールバックとM2 economyファイルの欠落がない

### Production Browser Smoke

`home-street → life-road → home-street → life-road → upper-vending-lane → life-road`を実操作し、暗転、地名、spawn、向き、入力ロック、上下矢印、camera boundsを確認する。朝、昼、夕方、夜と、左右歩行から待機への復帰も確認する。`pageerror`とfailed requestは0件でなければならない。

### 完了判定

Vercelの`Ready`、GitHub Actions成功、mainマージのいずれか単独では完了ではない。対象commitがProductionへ反映され、Production Smoke、Production Browser Smoke、Production実画面確認、文書・証跡確定まで完了した時点だけ、M1.4を「完了・Production確認済み」とする。

M1.4はこの条件をすべて満たした。

## M1.4確認済みProduction

- 実装PR: #32
- PR head: `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`
- 実装merge: `147f770a4b73077c4e5dc0523839b3fefb789db4`
- Vercel: success
- Quality run: [30009404756](https://github.com/nodako1/BokuNoJihanki/actions/runs/30009404756) — success
- Production Smoke run: [30009405068](https://github.com/nodako1/BokuNoJihanki/actions/runs/30009405068) — success
- Production Browser Smoke run: [30009404814](https://github.com/nodako1/BokuNoJihanki/actions/runs/30009404814) — success
- Production Browser Artifact: `8564582434` / `browser-smoke-30009404814`
- Artifact digest: `sha256:6f83bfcf99ac2f2af0e98899568ee2c17ac28e3f3ad70aef29f4c7f7c26744f3`
- expected commit: `147f770`
- 15画面、3エリア、5遷移、全invariant成功
- pageerror: 0、failed request: 0
- Production: https://boku-no-jihanki.vercel.app

公開URLではbuild `147f770`、左右タッチ移動、停止、時刻操作、mute操作を確認した。3エリア、上下矢印、5遷移、4時間帯はProduction Browser Artifactの15画面とstate JSONで確認した。

run URL、Artifact digest、公開画面確認を含む確定証跡は[M1.4 Production Evidence](evidence/M1_4_PRODUCTION_EVIDENCE.md)を正とする。

## M1.5 必須Preview承認フロー

1. local candidateでQuality、Browser Smoke、Visual Review、音声解析、Evidenceを完了する
2. remote PR headと同じ完全SHAのVercel PreviewでBrowser Smokeを完了する
3. 同じSHAでCI、くーちゃんcandidate QA、リダ君Evidence監査を完了する
4. ユーザーが同じPreviewを実iPhoneで5項目承認する
5. 承認対象SHAとPR headの一致を再確認してmainへマージする
6. merge SHAと一致するVercel ProductionでSmoke、Browser Smoke、画面・音を再確認する

承認後にコードまたは素材が変わった場合は、新SHAで手順2〜4をやり直す。実iPhone承認前にmain／Productionを変更せず、Production確認までM2 Scene統合とopen PR #31を変更・マージしない。仕様は[M1.5 実機品質修正版](specs/M1_5_POLISH.md)を正とする。
