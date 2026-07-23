# M1.4 独立ローカルQA Evidence

## 監査対象

| 項目 | 値 |
| --- | --- |
| 実施日 | 2026-07-23 |
| QA branch | `test/m1-4-release-audit` |
| 指定base | `a96123b`（このcloneには存在しないことを`git cat-file`で確認） |
| 実監査base | PR #32 head `414338ce3b83f361e57271cf5d9d1f035080d1f7` |
| tree | `1253cfe5dad726f92d1b25e7d969bb3be6de1e89` |
| Node.js | `22.14.0` |
| Browser | Playwright `1.56.1` / Chromium `141.0.7390.37` (build 1194) |
| 標準viewport | `1280x720` |
| スマホ横viewport | `844x390` |

`a96123b`が存在しない場合はPR #32の最新headを使うという指示に従った。GitHubアプリと`git ls-remote`の双方で、開始時のPR #32 headが`414338ce3b83f361e57271cf5d9d1f035080d1f7`であることを確認した。既存実装、画像、manifest、既存test、Browser Smokeは変更していない。

## 結論

**Release判定はBLOCKED。** Asset contract、`npm run check`、最終Browser Smoke、15枚のスクリーンショット、スマホ横UI監査は合格した。ただし、cloneされた`fading-in`状態のresetが元の`life-road/from-upper`ではなく`life-road/from-home`へ戻るBlocking issueを再現した。

## Asset contract test

追加ファイル: `tests/m14-asset-contract.test.mjs`

```text
$ node --test tests/m14-asset-contract.test.mjs
tests 4 / pass 4 / fail 0
```

Node.js標準機能とruntime moduleだけで次を検証した。

- area IDが`home-street`、`life-road`、`upper-vending-lane`の正確な3件
- manifestとruntimeの`worldWidth`／`groundY`が3エリアすべて一致
- 3エリア×4時間帯、計12背景がmanifestに過不足なく存在し、全て非空
- 12背景のSHA-256が全て異なる
- 3 foregroundが存在・非空で、SHA-256が全て異なる
- areaごとの`master`と`foreground`指定がそれぞれ3種類
- player atlasが正確に28 frames
- 左右それぞれidle 4 frames、walk 10 frames
- 全frameの`frame`と`sourceSize`が`128x192`
- contact frameが`[2, 7]`
- `manifest.files`の17件が全て存在・非空
- `manifest.files`内のpath／filenameに重複なし

## 全Quality gate

```text
$ npm run check
validate: PASS (63 required files / 3 M1.4 areas / 28 player frames / M1.3 preserved)
lint: PASS
typecheck: PASS
node tests: 110 / 110 PASS
production build: PASS
```

production buildは`VERCEL_GIT_COMMIT_SHA=414338ce3b83f361e57271cf5d9d1f035080d1f7`を指定して再生成し、Browser Smokeのcommit表示照合にも使用した。

## 独立コード監査

| 監査項目 | 判定 | 根拠 |
| --- | --- | --- |
| cloneされた`fading-in`のresetが`life-road/from-upper`へ戻る | **FAIL / Blocking** | 直接再現で`life-road/from-home`へ誤復旧 |
| `sourceSpawnId`がclone後も保持される | **FAIL / 同一Blocking** | 公開stateにfield自体がなく、clone前後とも`null` |
| 二重遷移防止 | PASS | active phase中の再`start`を拒否。既存回帰testも合格 |
| 遷移中入力lock | PASS | 全active phaseでlock、Browser Smokeの`transitionLocked=true` |
| Scene再起動時の初期状態復旧 | PASS | `create()`でarea、facing、velocity、transition stateを初期化 |
| `horizontalAxis`の連続入力 | PASS | touchの連続axisをScene→adapter→coreへ数値のまま伝達 |
| M1.3保存 | PASS | M1.3 Production commit `393bbabf`との差分なし。M1.3回帰test合格 |
| M2 economy core保存 | PASS | `src/game/economy`とeconomy testは`393bbabf`との差分なし。回帰test合格 |

### Blocking: clone後のresetが元spawnを失う

再現手順:

1. `createM14TransitionState('life-road', 'from-upper')`
2. `life-road`のup exitで遷移を開始
3. `fade-out-complete`、`scene-ready`まで進めて`fading-in`にする
4. `structuredClone(state)`
5. cloneへ`reset`を適用

再現結果:

```json
{
  "beforeClone": {
    "phase": "fading-in",
    "currentAreaId": "upper-vending-lane",
    "currentSpawnId": "from-life",
    "sourceSpawnId": null
  },
  "afterCloneSourceSpawnId": null,
  "expectedReset": "life-road/from-upper",
  "actualReset": "life-road/from-home"
}
```

原因は、`src/game/navigationAdapter/m14NavigationAdapter.mjs`の公開state生成（631–645行）と型定義に`sourceSpawnId`がないこと。WeakMapに紐づくcore stateをcloneで失うと、`reconstructCoreState`（563–603行）が、既にtarget areaへ切り替わった`fading-in` stateのsource spawnをsource areaの先頭要素で推測する。`life-road`の先頭は`from-home`であり、正しい`from-upper`ではない。その誤った再構築結果をreset（657–666行）が採用する。

最小修正案:

- transition開始時に公開stateへ`sourceSpawnId: state.currentSpawnId`を保存
- `.d.mts`／`.d.ts`へ同fieldを追加
- clone後の再構築で`sourceSpawnId`を必ず使用
- `life-road/from-upper` → up遷移 → `fading-in` → clone → resetの回帰testを追加

独立QAの責務に従い、実装は修正していない。

## Local production Browser Smoke

未変更の`scripts/browser-smoke.mjs`をローカルproduction previewへ実行した。最終runは日本語fontを持たないLinux runnerで文字が欠ける環境差を除くため、repo外の一時領域へNoto Sans CJK JPを用意して実行した。アプリのCSS、runtime、画像、Smoke scriptには変更を加えていない。

```text
planned screenshots: 15 / 15
transitionCount: 5
hudSnapshotCount: 674
areasVisited: home-street, life-road, upper-vending-lane
verticalInvariant: true
cameraFollow: true
cameraBoundsInvariant: true
focusLossStop: true
transitionLocked: true
timePreserved: true
mutePreserved: true
idleReturned: true
pageerror: 0
failed request: 0
trace.zip: 218,998,084 bytes / unzip integrity PASS
```

Artifact整合値:

- `state.json` SHA-256: `fa81acd5c260c1c88411721dadceeee07e2a1049c8257e33a78a3be25e6f4ebd`
- 15 PNGのSHA-256一覧を連結して再hash: `20214f736e9f7fb298defd82d61188c454e3df81b7f92af9ac251c4c6b0b8763`
- `trace.zip` SHA-256: `04a8a83ea677ffaae004c74f18d3f71dcf81f1700155b6aa388c5acae4a2cd0d`

確認した15枚:

1. `01-title.png`
2. `02-home-street.png`
3. `03-walk-right.png`
4. `04-walk-left.png`
5. `05-home-right-edge.png`
6. `06-transition-loading.png`
7. `07-life-road.png`
8. `08-returned-home.png`
9. `09-up-arrow.png`
10. `10-upper-vending-lane.png`
11. `11-down-arrow.png`
12. `12-morning.png`
13. `13-day.png`
14. `14-evening.png`
15. `15-night.png`

最初のrunは、歩行capture後のplayer Xが`1335`となり、正しいdown分岐範囲`1040..1320`の外へ出たため11枚目の待機でtimeoutした。同一build／同一scriptの直後のrunと日本語font付き最終runはともに完走したため、product Blockingには分類しない。Smokeを将来安定させる場合は、左右歩行確認後にdown分岐範囲へ明示的に戻してからpromptを待つのが最小案。

## 見た目監査

| 項目 | 判定 | Evidence |
| --- | --- | --- |
| 主人公が地面に接地して見える | PASS | `02`、`07`、`10`、`11`。足元と影が各surfaceへ接し、`verticalInvariant=true` |
| 左右の歩行が判別できる | PASS | `03`と`04`で顔、進行方向、腕脚のposeが明確に異なる |
| 3エリアが別の場所に見える | PASS | `02`の自宅正面、`07`の生活道路、`10`の木陰と自販機・海の路地 |
| 上下矢印の意味が理解できる | PASS | `09`は`↑ / 自販機路地へ / W・↑`、`11`は`↓ / 生活道路へ戻る / S・↓` |
| 夜でも主人公と経路を認識できる | PASS | `15`で主人公の頭・上半身、道路、奥の分かれ道を識別可能 |
| cameraが背景外を表示しない | PASS | `05`に空白帯なし。全snapshotで`cameraBoundsInvariant=true` |
| ロード表示が読み取れる | PASS | `06`の地名`生活道路`が高contrast。加えてlocked `fading-out`を固定した補助captureで`街を移動しています…`を確認 |
| スマホ横画面でUIが重ならない | PASS | `844x390`で6 UI要素を矩形監査し、UI同士の交差0・viewport外0・pageerror/failed request 0 |
| 操作方式だけを参考にし、見た目はオリジナル | PASS | 3 master／背景hashが別で、画面も別構図。provenanceは「左右歩行・横scroll・上下分岐・短い切替だけを参考」と明記 |

スマホ横画面の矩形監査対象はdate chip、game actions、joystick、area arrow、control hint、build badge。矢印panelは分岐上の主人公の一部を隠すが、UI要素同士は重ならず操作領域もviewport内に収まるため、この項目はPASSとした。

## Git管理対象

commit対象は次の2ファイルだけとする。

- `tests/m14-asset-contract.test.mjs`
- `docs/evidence/M1_4_LOCAL_QA.md`

15 PNG、`state.json`、runtime log、Playwright trace、production build、依存package、補助captureはGitへ追加しない。
