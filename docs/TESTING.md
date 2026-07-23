# テスト

## 一括確認

```bash
npm ci
npm run check
```

## M1.3ロジック

- point-in-polygon
- 円形フットプリントがwalkable内に収まること
- obstacleポリゴンとの交差拒否
- サブステップによるすり抜け防止
- 壁沿いスライド
- 方向選択
- 4区間マップと必須レイヤー
- 私有地サンプルが歩行不可
- 電柱、自販機、出口バリケード
- AreaTransition状態遷移
- 4方向の待機と8歩行フレーム

## Browser Smoke

PRではローカル本番ビルド、mainではVercel ProductionをPlaywright Chromiumで操作する。

確認内容:

1. 主人公の家の前から開始
2. 右・左・正面・後ろ歩行
3. walkable境界へ衝突
4. デバッグポリゴン表示
5. 4区間を横断
6. 足音カウンター増加
7. 朝・昼・夕方・夜
8. pageerror／failed request 0件

Artifactにはタイトル、家の前、方向別歩行、衝突デバッグ、4区間、4時間帯、state.json、console、traceを保存する。
