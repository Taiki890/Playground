# tasks

## Phase 1: 要件再定義

- [x] 添付画面イメージ基準で要件更新
- [x] トレンド矢印要件を追加
- [x] 今月金額要件を追加
- [x] ナビバー要件を追加
- [x] scope外（Analysis/Trend/Settings詳細）を明記

## Phase 2: 実装（Home）

- [ ] Homeレイアウトを新デザインに更新
- [ ] 本日の本数カードにトレンド矢印を表示
- [ ] 過去7日同時刻比較ロジックを実装
- [ ] 1箱金額設定の保存機能を実装
- [ ] 今月金額計算を実装
- [ ] 下部ナビバー（4タブ）を実装
- [ ] 既存履歴表示を新レイアウトへ移植
- [x] recordsに`quantity`フィールドを追加
- [x] recordsに`trendEligible`フィールドを追加
- [x] Homeの`+`登録を`quantity=1`固定で保存
- [x] 当日本数を`quantity`合計で算出

## Phase 3: 検証

- [ ] acceptance criteria 全件の手動確認
- [ ] iPhone実機でホーム画面追加・表示確認
- [ ] 旧キャッシュ除去後の再インストール確認
