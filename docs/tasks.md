# tasks

## Phase 1: Analysis実装

- [x] Analysisタブ有効化
- [x] 時間/週/月モード切替
- [x] 期間移動（前/次）
- [x] 週グラフ（対象週 + 過去4週間平均）
- [x] 月グラフ（対象月 + 過去4か月平均）
- [x] 月金額表示
- [x] 時間グラフ（対象週 + 過去4週間平均）
- [x] 曜日フィルタ（全日/各曜日）

## Phase 2: 分析品質補正

- [x] 時間分析では `trendEligible=false` を除外
- [x] 週/月分析では `trendEligible=false` を含める

## Phase 3: 検証

- [ ] AC-A01〜AC-A07 の手動確認
- [ ] iPhoneでグラフ描画確認
- [ ] Data編集時のAnalysis再計算確認
