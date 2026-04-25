# spec

## 1. データモデル

### 1.1 records

- store: `records`
- key: `id` (autoIncrement)
- fields:
  - `createdAt` (ISO 8601)
  - `dayKey` (`YYYY-MM-DD`)
  - `quantity` (integer, `>= 1`)
  - `trendEligible` (boolean)

### 1.2 settings

- store: `settings`
- key: `key`
- fields:
  - `packPrice` (integer, `>= 1`)

## 2. Home仕様（継続）

- `+` ボタンは `quantity=1`, `trendEligible=true`
- トレンド矢印と平均値を表示
- 履歴は降順で最大10件

## 3. Data仕様（新規）

### 3.1 表示

- 上部: 月カレンダー
- 下部: 選択日データ一覧
- 初期選択日: 当日

### 3.2 カレンダー

- 表示月を前月/次月へ切り替え可能
- 日付選択で下部リストを更新
- 日付セルに当日・選択日スタイルを表示
- 日付セルに当日の本数合計バッジを表示（存在時）

### 3.3 一覧

- 選択日のデータを時刻昇順で表示
- 各行に表示:
  - 時刻
  - 本数
  - 分析利用フラグ
- 各行で `変更` と `削除` を実行可能

### 3.4 追加

- `追加`:
  - 選択日に1件追加
  - `quantity=1`
  - `trendEligible=true`
- `一括追加`:
  - 本数入力を受けて1件追加
  - `quantity>=2`
  - `trendEligible=false`

### 3.5 変更

- 時刻、本数、分析利用フラグを変更可能
- 変更時は `dayKey` を `createdAt` から再算出

### 3.6 削除

- 確認ダイアログ後に1件削除

## 4. 集計仕様

- 当日本数/今月本数は `quantity` 合計
- 今月金額:
  - `monthlyCost = floor((monthlyCigarettes * packPrice) / 20)`
- トレンド計算は `trendEligible=true` のみ対象

## 5. 画面遷移仕様

- Bottom nav:
  - `Home` 遷移可
  - `Data` 遷移可
  - `Settings` 遷移可
  - `Analysis` 無効
