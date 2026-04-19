# 禁煙アプリ 仕様駆動開発ドキュメント

このディレクトリは、個人開発で最小コストに回せる仕様駆動開発（SDD）用です。

## ドキュメント構成

- `requirements.md`: 何を解決するか（要求）
- `spec.md`: どう作るか（仕様）
- `acceptance-criteria.md`: 完了条件（受け入れ基準）
- `tasks.md`: 実装タスク（実行順）
- `change-log.md`: 仕様変更履歴

## 使い方（1サイクル）

1. `requirements.md` の対象項目を決める
2. `spec.md` に画面・データ・挙動を確定する
3. `acceptance-criteria.md` を満たすように実装する
4. `tasks.md` のチェックを更新する
5. 仕様変更が出たら `change-log.md` に記録する

## 運用ルール（簡易）

- 仕様変更は、コード修正より先に `spec.md` を更新する
- 実装後は、必ず受け入れ基準を手動確認する
- 未決事項は `tasks.md` に TODO として残す
