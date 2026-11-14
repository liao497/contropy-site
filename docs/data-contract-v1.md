# 每日资讯博弈数据与存档契约 V1

版本：`snapshot-v1.0.0`

## 目标

每个自然日以北京时间07:30前完成晨报更新为目标：05:37开始采集，06:07、06:37、07:07幂等重试，07:23起由独立守卫检查并自动补跑；16:30再执行下午刷新，17:03起复核。周末和休市日的A股行情使用最近已完成交易日，其他可用数据按实际采集时间更新。系统生成可阅读日报与结构化快照；晨间与下午版本分别以`daily`和`close`修订归档，两者都来自同一校验流程。

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
  "indicator_version": "indicator-v1.1.0",
  "model_version": "sector-swing-v1.1.0",
  "report_date": "2026-08-19",
  "as_of": "2026-08-19T07:30:00+08:00",
  "timezone": "Asia/Shanghai",
  "data_state": "demo|partial|verified",
  "metrics": [],
  "opportunities": [],
  "sector_candidates": [],
  "risks": [],
  "events": [],
  "major_news": [],
  "shipping": [],
  "commodities": [],
  "capital_flows": {"etf": null, "southbound": null, "margin": null, "sectors": null},
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

`sector_candidates`与正式`opportunities`严格分开：前者只用行业价格、相对强度、成交及波动指标筛选，均标记`status=待确认`，包含`evidence`、`confirmation_conditions`、`invalidation_conditions`、`market_data_date`和`caveat`。只有行业行情覆盖至少70%、数据日匹配目标交易日，且未触发过度拥挤或高ATR过滤时才可输出，最多3个。此名单不表示估值或前瞻景气已经验证，也不作为交易建议。

## 风险记录

风险分为 `vulnerability` 和 `stress`。保存当前状态、阈值、持续天数、证据、是否进入黄色/红色以及失效时间。红色预警要求两个独立风险组共振，或单组连续2—3个交易日确认。

## 事件记录

保存事件时间、时区、类别、影响行业、影响等级、市场预期、正反情景、是否已被交易、来源和实际结果。事件结束后不删除，补充结果字段供复盘。

## 重大新闻、航运与商品记录

- `major_news`：保存类别、标题、摘要、影响等级、影响资产、市场解读、来源、链接、来源类型、发布时间或首次监测时点。最多发布9条，近似转载稿去重。
- `shipping`：保存航道、数据日、船舶总数、油轮数、前值、7日均值、28日均值、偏离及IMF PortWatch来源。
- `commodities`：保存分类、主力连续代码、品种、收盘价、单位、日涨跌、近5个交易日涨跌、数据日与来源。
- 免费新闻监测不把媒体报道冒充政要社交平台原帖；`time_basis`明确区分官方发布时间、媒体发布时间和GDELT首次监测时点。

## 资金流向与活跃度记录

`capital_flows` 是新日报的结构化模块；旧归档中可缺省。每个子项都保留独立数据日、发布方和来源链接，免费源未取得时为 `null`。

- `etf`：上交所ETF相邻可得日按相同基金代码配对，覆盖当前总份额至少90%才发布可比份额变化（亿份）和增减最多3只。新上市基金不计入可比变化。份额变化可反映申赎方向，不能换算为精确现金净流入。
- `southbound`：港股通南向成交净买额（亿元）及连续净买入日数，作为直接净买入数据。
- `margin`：沪深融资余额及较上一可得期变化（亿元）、融资买入占股票成交比例。融资余额变化是杠杆活动代理，不等于市场净流入。
- `sectors`：同花顺行业成交额优先除以沪深股票成交额；交易所接口缺失时，对当前及上一期统一改用已覆盖行业的成交额合计为基数，并记录 `basis`。两期基数口径一致才计算百分点变化；该指标是相对交易关注度，并非板块真实资金净流入。
- 同一行情日免费接口短时失败时，可复用已归档且数据日匹配的成交额、ETF总份额或两融指标；保留原采集时间及原修订号，发布方标明归档复用。新行情日不得用旧行情日数据冒充。
- 北向日净买额不再公开披露，页面解释口径但不生成伪数据。

## 日报固定结构

```markdown
# YYYY-MM-DD 晨间行业投资看板
## 一句话结论
## 重大新闻与航运要道
## 主要大宗商品
## 市场环境
## 资金流向与活跃度
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
- 主任务实际采集时点后才发布的数据最早进入下一次有效晨报；备份或监控补跑会使用补跑时已发布的数据。
- 海外市场使用实际采集时已经完成的交易时段。
- 数据抓取失败写入 `data_gaps`，不得静默降级。
- 航运等辅助源临时失败且所有预期航道都逐条记录缺口时，允许其他已核验模块发布；页面隐藏缺失航运数据，不复用过期船舶数。市场、宏观和行业等核心模块仍须通过原有覆盖与日期校验。
- 保存数据源、解析器版本、公式和原始校验和，确保可审计。

## 长期复盘

累计20、60、250个交易日后，定期计算：风险信号后的5/20/60日市场表现、行业进入Top 3后的收益与最大回撤、各机会类型命中率、海外到国内的领先/滞后、宏观状态与行业收益的条件分布。复盘只评估当时保存的结论，不事后改写评分。
