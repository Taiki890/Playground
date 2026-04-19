# spec

## 1. 対象

- 対象画面: Home
- 実行環境: iPhone Safari PWA

## 2. データ仕様

### 2.1 records

- store: `records`
- key: `id` (autoIncrement)
- fields:
  - `createdAt` (ISO 8601)
  - `dayKey` (`YYYY-MM-DD`)
  - `quantity` (number, 1以上)
  - `trendEligible` (boolean)

### 2.2 settings

- store: `settings`
- key: `key`
- fields:
  - `packPrice` (number, JPY)

## 3. 記録ルール

- Homeの `+` 登録:
  - `quantity=1`
  - `trendEligible=true`
- 将来の一括登録:
  - `quantity>=1`
  - `trendEligible=false`

## 4. 集計ルール

- 当日本数:
  - 当日レコードの `quantity` 合計
- 今月本数:
  - 当月レコードの `quantity` 合計
- 今月金額:
  - `monthlyCost = floor((monthlyCigarettes * packPrice) / 20)`
- 履歴:
  - `createdAt` 降順、最大10件

## 5. トレンドルール

- 判定対象:
  - `trendEligible=true` のみ
- 除外:
  - 一括登録（`trendEligible=false`）
- 比較基準:
  - 過去7日の同時刻までの平均本数

## 6. 既存UIへの反映

- 本日の本数表示はレコード件数ではなく `quantity` 合計を使う
- 履歴表示の並びは従来通り日時降順
