# spec

## 1. データモデル

### 1.1 records store

- name: `records`
- key: `id` (autoIncrement)
- fields:
  - `createdAt`: ISO 8601 string
  - `dayKey`: `YYYY-MM-DD`
  - `quantity`: integer (`>= 1`)
  - `trendEligible`: boolean

### 1.2 settings store

- name: `settings`
- key: `key`
- fields:
  - `packPrice`: integer (`>= 1`)

## 2. 記録ルール

- Homeの `+` 登録:
  - `quantity=1`
  - `trendEligible=true`
- 将来の一括登録:
  - `quantity>=1`
  - `trendEligible=false` を許容

## 3. 集計仕様

- 当日本数: 当日レコードの `quantity` 合計
- 今月本数: 当月レコードの `quantity` 合計
- 今月金額:
  - `monthlyCost = floor((monthlyCigarettes * packPrice) / 20)`

## 4. トレンド仕様

- 対象: `trendEligible=true` のみ
- 期間: 過去7日（当日除く）
- 比較値: 各日の「現在時刻まで」の本数合計の平均
- 判定:
  - `todayCount > avg + 0.5` => `↑`
  - `todayCount < avg - 0.5` => `↓`
  - それ以外 => `→`
- 表示:
  - 矢印の横に `avg {value}` を表示（小数1桁）

## 5. UI仕様

### 5.1 Home

- 1画面固定レイアウト
- `+` は横長固定ボタン
- 履歴カード内のみスクロール可能
- 履歴表示:
  - 降順
  - 最大10件
  - `quantity > 1` の場合 `x{quantity}` を末尾表示

### 5.2 Settings

- packPrice入力と保存
- JSONエクスポート
- JSONインポート

## 6. 実行仕様

- `service worker` 利用
- `service worker` 登録失敗時は警告ログのみでアプリ起動継続
