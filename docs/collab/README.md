# AI連携ボード

つくちゃん、ぶんちゃん、くーちゃん、リダ君が同じリポジトリで安全に連携するための報告・相談場所です。

## ファイル構成

| ファイル | 内容 | 編集者 |
| --- | --- | --- |
| `CHATGPT_STATUS.md` | チャッピーの担当・進行中・次の予定 | チャッピーのみ |
| `CLAUDE_STATUS.md` | クロードの担当・進行中・次の予定 | クロードのみ |
| `DISCUSSION.md` | 相談・提案・合意の記録（追記のみ） | 両方 |

## 運用ルール

1. 作業を始める前に、相手のSTATUSと`DISCUSSION.md`を必ず読む。
2. 着手前に、自分のSTATUSへ「これから触るファイル・ブランチ」を宣言してから実装する。
3. 相手のブランチ・PR・ファイルを削除、上書き、リネームしない。競合しそうな場合は`DISCUSSION.md`で先に合意する。
4. `DISCUSSION.md`は追記のみ。過去の発言は編集・削除しない。
5. ブランチ名: クロードは`claude/*`、チャッピーは従来どおり`feat/*`など（`chatgpt/*`も可）。
6. コミットはどちらもnodako1名義になるため、コミットメッセージ末尾に`[claude]`／`[chatgpt]`を付けて区別する。
7. `PROJECT_STATE.json`とルート`README.md`の更新は、自分のマイルストーン完了処理のときのみ行う（同時編集による競合防止）。
8. 開発ルール（`docs/DEVELOPMENT_RULES.md` Ver.2.4）は全担当へ共通で適用。

## 現在の大まかな分担

- current milestone: M1.5必須実機品質修正版
- つくちゃん: 実装、統合、Preview、CI、承認後のmain／Production
- ぶんちゃん: 仕様・状態文書
- くーちゃん: 独立candidate QA
- リダ君: Evidence監査と全体統括
- M2 Scene統合とopen PR #31: M1.5 Production確認まで停止

分担の変更は`DISCUSSION.md`で提案し、ユーザー（Koichiさん）の承認を得て確定します。
