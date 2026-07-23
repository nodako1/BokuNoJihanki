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
