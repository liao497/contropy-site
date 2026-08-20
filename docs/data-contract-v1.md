# 每日资讯博弈数据与存档契约 V1

版本：`snapshot-v1.0.0`

## 目标

每个A股交易日北京时间07:30生成一份可阅读日报和一份结构化快照。日报服务当日决策，JSON服务长期比较、图表、回测和复盘。两者来自同一已校验数据对象。

## 目录

```text
reports/daily/YYYY/MM/YYYY-MM-DD.md
data/snapshots/YYYY/MM/YYYY-MM-DD.json
```

修订不覆盖原文件：

```text
reports/daily/YYYY/MM/YYYY-MM-DD.r2.md
data/snapshots/YYYY/MM/YYYY-MM-DD.r2.json
```

## 快照顶层结构

```json
{
  "schema_version": "snapshot-v1.0.0",
  "indicator_version": "indicator-v1.0.0",
  "model_version": "sector-swing-v1.0.0",
  "report_date": "2026-08-19",
  "as_of": "2026-08-19T07:30:00+08:00",
  "timezone": "Asia/Shanghai",
  "data_state": "demo|partial|verified",
  "metrics": [],
  "opportunities": [],
  "risks": [],
  "events": [],
  "data_gaps": [],
  "run": {}
}
```

## 指标记录

必填字段：

```text
indicator_id, indicator_name, module, frequency,
value, unit, period, previous_value, previous_period,
yoy_value, yoy_period, published_at, available_at, retrieved_at,
source_tier, publisher, canonical_url, field_name,
confidence, coverage, freshness,
interpretation_type, interpretation,
transform_formula, revision_id
```

约束：

- `value`、`previous_value`、`yoy_value`允许为null；缺失不得填0。
- `interpretation_type`只能为 `none`、`opportunity`、`risk`、`watch`。
- 没有触发阈值时，`interpretation_type=none`且`interpretation=null`。
- 市场隐含预期必须标记 `evidence_type=market_implied`。
- 派生值必须保存公式和原始证据ID。
- 所有时间均为带时区ISO 8601格式。

## 行业机会记录

```text
rank, industry_id, industry_name, horizon=swing,
opportunity_type, raw_score, adjusted_score,
confidence, coverage, freshness,
valuation_percentile, drawdown_20d, drawdown_60d,
ma20_deviation, ma60_deviation, atr14_percent,
thesis, evidence_ids, catalyst_ids,
confirmation_conditions, risks, invalidation_conditions,
model_version
```

只允许保存通过质量门的前3名。没有3个合格行业时如实输出少于3个，不用低质量行业补齐。

## 风险记录

风险分为 `vulnerability` 和 `stress`。保存当前状态、阈值、持续天数、证据、是否进入黄色/红色以及失效时间。红色预警要求两个独立风险组共振，或单组连续2—3个交易日确认。

## 事件记录

保存事件时间、时区、类别、影响行业、影响等级、市场预期、正反情景、是否已被交易、来源和实际结果。事件结束后不删除，补充结果字段供复盘。

## 日报固定结构

```markdown
# YYYY-MM-DD 晨间行业投资看板
## 一句话结论
## 市场环境
## 宏观、利率与政策预期
## 国内行业强度与海外映射
## 波段行业机会 Top 3
## 风险脆弱性
## 风险压力
## 未来 7 / 30 / 90 日事件
## 数据缺口与异常
## 来源与版本
```

所有指标表统一包含：指标、最新数据、上一日/期、同比情况、解读。

## 不可变与点时规则

- 初次生成的日报和快照不覆盖。
- 正式数据修订产生新revision，并保留初值。
- 回测使用 `available_at <= decision_time` 的记录。
- 收盘后或07:30后才发布的数据最早进入下一次有效晨报。
- 海外市场使用A股07:30时已经完成的交易时段。
- 数据抓取失败写入 `data_gaps`，不得静默降级。
- 保存数据源、解析器版本、公式和原始校验和，确保可审计。

## 长期复盘

累计20、60、250个交易日后，定期计算：风险信号后的5/20/60日市场表现、行业进入Top 3后的收益与最大回撤、各机会类型命中率、海外到国内的领先/滞后、宏观状态与行业收益的条件分布。复盘只评估当时保存的结论，不事后改写评分。
