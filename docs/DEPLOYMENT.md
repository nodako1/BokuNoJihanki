# デプロイ

Production Branchは`main`。Featureブランチの通常Vercel Previewは停止する。

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

## M1.4完了フロー（実装中・Production確認前）

Production Branchは引き続き`main`とし、M1.4のFeatureブランチは`feat/m1-4-side-scroll-town`を使用する。M1.3はロールバック可能なフォールバックとして残し、M2 economyコアは変更しない。

1. M1.4全体仕様とClaude navigation境界を確定する
2. 3エリア、主人公、UI、時間帯、Web Audioを単一永続Sceneへ統合する
3. `npm ci`と`npm run check`を成功させる
4. Feature PRを作成する
5. PR Browser Smokeで3エリア、4接続、左右歩行、上下矢印、4時間帯を自動操作する
6. PR Artifactのconsole、state JSON、trace、スクリーンショットを確認する
7. PR実画面で接地、足滑り、camera、構図、スマートフォン横画面を確認する
8. Claudeにnavigation adapter境界と統合のレビューを依頼し、指摘を解消する
9. ユーザーの手動操作待ちで止めず、全gate成功後にmainへマージする
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

それまでは仕様と状態記録を**実装中・Production確認前**のままにする。
