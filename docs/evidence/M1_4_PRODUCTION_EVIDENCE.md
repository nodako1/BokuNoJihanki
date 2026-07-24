# M1.4 Production Evidence

M1.4「2D横スクロール街探索・3エリア遷移基盤」の実装とProduction確認記録です。

## 実装Pull Request

- navigation core PR: #33
- navigation core merge commit: `ee255a1a8413768d0e7dbdf512964268c8eaf276`
- implementation PR: #32
- verified PR head: `5c6895d0d1e2ad31a95f6490e60cc26f89d290cf`
- Quality run: `30008762303` — success
- PR Browser Smoke run: `30008762333` — success
- PR Browser Artifact: `8564271801`
- implementation merge commit: `147f770a4b73077c4e5dc0523839b3fefb789db4`
- PR #34後の現main／Production baseline: `29223ee31fd4fc4fbca21a37b01fe89277279647`
- automated review: Blocking issueなし

最終修正では、遷移中に復元された`fading-in`状態をresetした場合も遷移元spawnへ正しく戻るよう、`sourceSpawnId`の保存・復元と非初期spawnの回帰テストを追加しました。修正後は107/107テスト、lint、typecheck、buildが成功しています。

## Production

- Vercel deployment: success
- main Quality run: `30009404756` — success
- Production Smoke run: `30009405068` — success
- Production Browser Smoke run: `30009404814` — success
- Production Browser Artifact: `8564582434`
- artifact name: `browser-smoke-30009404814`
- artifact digest: `sha256:6f83bfcf99ac2f2af0e98899568ee2c17ac28e3f3ad70aef29f4c7f7c26744f3`
- public URL: `https://boku-no-jihanki.vercel.app/`
- expected build: `147f770`

ダウンロードしたZIPのSHA-256はGitHubのdigestと一致しました。

## Browser Artifact確認

- authored areas: 3（`home-street`、`life-road`、`upper-vending-lane`）
- transitions: 5
- screenshots: 15
- page errors: 0
- failed requests: 0
- fixed ground-line invariant: true
- camera follow / bounds invariant: true
- focus-loss stop: true
- transition input lock: true
- time preservation: true
- audio mute preservation: true
- stable idle return: true

15画面で、タイトル、自宅前、左右歩行、右端camera、遷移中、生活道路、帰還、上矢印、自販機のある高台、下矢印、朝・昼・夕方・夜を目視確認しました。

## 公開画面の実操作

公開URLでbuild `147f770`を確認し、左右のタッチ移動、入力解放後の停止、時刻の06:15への更新、音声MUTEDを確認しました。3エリア、上下矢印、5遷移、時間帯は同じ公開URLを対象にしたProduction Browser Smokeと15画面Artifactで確認しています。

## PR #34後のbaseline

最終文書・mobile gateを含むPR #34は`29223ee31fd4fc4fbca21a37b01fe89277279647`として確定した。`147f770...`はM1.4実装のProduction確認commit、`29223ee...`は現在のmain／Production baselineであり、役割を混同しない。

## M1.4配信履歴とM1再オープン

M1.4のProduction配信成功と既存run／Artifactは有効な履歴として保持する。ただし、固定`groundY` invariant、内部trigger通過、15画面、エラー0件は、背景道路との接地、背景導線、UIと主人公の重なり、BGMの聴感品質を承認する証拠ではない。

後続のユーザー実iPhone確認によりM1全体の完成判定を再オープンした。現在の必須gateは[M1.5 実機品質修正版](../specs/M1_5_POLISH.md)であり、Production確認までM2 Scene統合とopen PR #31を停止する。
