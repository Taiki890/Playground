# spec

## 1. データ

- records:
  - `createdAt`, `dayKey`, `quantity`, `trendEligible`
- settings:
  - `packPrice`

## 2. Analysisモード

### 2.1 共通

- モード: `hour`, `week`, `month`
- `analysisAnchor` で対象期間を管理
- 前/次ボタンで対象期間を移動

### 2.2 週

- 対象週（月〜日）の `quantity` 合計を日別で表示
- 過去4週間の曜日別平均を重ねる
- 表示形式: 棒（対象週） + 線（平均）

### 2.3 月

- 対象月の日別 `quantity` 合計を表示
- 過去4か月の日別平均を重ねる
- 表示形式: 棒（対象月） + 線（平均）
- 月金額:
  - `floor((monthQuantity * packPrice) / 20)` を別カード表示

### 2.4 時間

- 対象期間: 1週間
- フィルタ: `all`, `0..6`（曜日）
- 時間帯別（0〜23時）の `quantity` 合計を表示
- 過去4週間平均を重ねる
- 表示形式: 線（対象週） + 線（平均）
- 集計対象:
  - `trendEligible=true` のみ

## 3. Data CRUD（継続）

- 追加:
  - `quantity=1`, `trendEligible=true`
- 一括追加:
  - `quantity>=2`, `trendEligible=false`
- 変更:
  - 時刻、本数、分析利用フラグ
- 削除:
  - 1件削除

## 4. 集計整合

- Homeの日次本数、月金額は Data編集結果を即時反映
- 時間分析のみ `trendEligible=false` を除外
- 週/月分析は `trendEligible` に関係なく含める
