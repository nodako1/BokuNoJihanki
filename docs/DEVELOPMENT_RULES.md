# 開発ルール Ver.2.4

1. README、PROJECT_STATE、仕様、main、PR、Actions、Productionを照合する。
2. Featureブランチで実装し、Vercel Previewは通常確認に使わない。ただしM1.5はcandidateと同一完全SHAのPreviewを作り、ユーザー実iPhone承認をmain前に必須とする。
3. `npm ci`と`npm run check`を必須とする。
4. マップ背景とwalkable／obstacle／occlusionを同時に設計する。
5. 家、庭、屋根、塀、柵はwalkable外に置き、大雑把な矩形衝突だけに依存しない。
6. キャラクター移動はTexture Atlasのフレーム式アニメーションを必須とする。
7. 入力中でも実移動していなければ歩行アニメーションと足音を停止する。
8. シームレス移動より各エリアの完成度を優先し、必要ならフェード・ロードを使用する。
9. PR Browser Smokeで方向別歩行、衝突、全区間、時間帯を実操作する。
10. 必須のmain前gateを満たした後だけマージし、Vercel、Production Smoke、Production Browser Smoke、Visual Evidenceを確認する。承認後にコードまたは素材が変わった場合は新SHAで再承認する。
11. モックアップを完成証跡として使わない。
12. 機能・ルール変更時はREADME、PROJECT_STATE、仕様、ロードマップを同時更新する。
