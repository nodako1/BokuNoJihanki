# 開発運用

## 原則

- `main`は常にVercelでプレイ可能にする。
- 実装途中の壊れた状態を`main`へ直接入れない。
- 恒久的な`develop`ブランチは作らない。
- 一つのマイルストーンまたは確認可能な縦切り単位でPRを作る。
- GitHub Actions成功後にsquash mergeする。
- マージ後、`PROJECT_STATE.json`を次の作業へ更新する。

## 標準フロー

```text
仕様を確認
  ↓
一時ブランチ作成
  ↓
コード・画像・音・文書を実装
  ↓
npm run check
  ↓
PR作成
  ↓
CI成功
  ↓
mainへsquash merge
  ↓
Vercel本番確認
  ↓
次の仕様を作成
```

## コミット

Conventional Commitsに近い形式を使用する。

- `feat:` 機能
- `fix:` 修正
- `docs:` 文書
- `test:` テスト
- `chore:` 基盤・依存関係
- `refactor:` 挙動を変えない整理

## 素材

新しい画像・音を追加した場合は`docs/ASSET_PROVENANCE.md`を更新する。
