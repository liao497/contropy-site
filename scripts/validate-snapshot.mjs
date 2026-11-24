import { readFile } from "node:fs/promises";
import path from "node:path";

const [, , inputArg = "data/current-snapshot.json", expectedDate] = process.argv;
const snapshot = JSON.parse(await readFile(path.resolve(inputArg), "utf8"));

if (expectedDate && snapshot.report_date !== expectedDate) {
  throw new Error(`snapshot date ${snapshot.report_date} does not match ${expectedDate}`);
}
if (snapshot.data_state === "demo") throw new Error("demo snapshots cannot be published");
if (!Array.isArray(snapshot.metrics) || snapshot.metrics.length < 25) {
  throw new Error(`only ${snapshot.metrics?.length ?? 0} metrics; publication minimum is 25`);
}

const ids = new Set(snapshot.metrics.map((metric) => metric.indicator_id));
if (ids.size !== snapshot.metrics.length) throw new Error("duplicate indicator_id detected");

const requiredModules = ["市场环境", "宏观、利率与政策预期"];
for (const moduleName of requiredModules) {
  if (!snapshot.metrics.some((metric) => metric.module === moduleName)) {
    throw new Error(`critical module missing: ${moduleName}`);
  }
}
const hasIndustry = ids.has("M3-A01/03");
if (!hasIndustry) {
  if (!snapshot.data_gaps?.some((gap) => gap.indicator_id === "M3-*" || gap.indicator_id === "M3-UNIVERSE")) {
    throw new Error("industry module missing without an explicit source gap");
  }
  if (snapshot.sector_candidates?.length || snapshot.capital_flows?.sectors) {
    throw new Error("sector signals cannot be published without current industry data");
  }
}
if (!snapshot.metrics.some((metric) => ["重点风险", "跨市场情绪"].includes(metric.module))) {
  throw new Error("risk and sentiment modules are both missing");
}
if (!Array.isArray(snapshot.major_news) || !Array.isArray(snapshot.shipping) || !Array.isArray(snapshot.commodities)) {
  throw new Error("news, shipping, and commodities must be arrays");
}
if (snapshot.major_news.length > 9) throw new Error("major_news cannot exceed 9 items");
const marketDay = snapshot.run?.market_data_date;
if (!/^\d{4}-\d{2}-\d{2}$/.test(marketDay ?? "")) throw new Error("run.market_data_date is missing or invalid");
if (snapshot.capital_flows !== undefined) {
  const flows = snapshot.capital_flows;
  if (!flows || typeof flows !== "object") throw new Error("capital_flows must be an object");
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && !Number.isNaN(Date.parse(value));
  if (flows.etf) {
    if (!isDate(flows.etf.period) || flows.etf.period > marketDay || !isDate(flows.etf.previous_period) || flows.etf.previous_period >= flows.etf.period) {
      throw new Error("ETF share date is invalid or later than market data date");
    }
    if (flows.etf.coverage < 0.9 || flows.etf.coverage > 1 || flows.etf.matched_count < 1 || !Number.isFinite(flows.etf.change_100m_shares)) {
      throw new Error("ETF share comparison has invalid coverage or change");
    }
  }
  if (flows.sectors) {
    if (flows.sectors.period !== marketDay) throw new Error("sector activity date does not match market data date");
    if (!Array.isArray(flows.sectors.increasing) || !Array.isArray(flows.sectors.decreasing)) throw new Error("sector activity lists are invalid");
  }
  for (const key of ["southbound", "margin"]) {
    if (flows[key] && (!isDate(flows[key].period) || flows[key].period > marketDay)) throw new Error(`${key} date is invalid or later than market data date`);
  }
}
if (snapshot.forward_flows !== undefined) {
  const outlook = snapshot.forward_flows;
  if (!outlook || outlook.market_day !== marketDay || !outlook.verdict?.headline || !outlook.verdict?.hong_kong || !Array.isArray(outlook.windows) || outlook.windows.length !== 3) {
    throw new Error("forward_flows structure or market day is invalid");
  }
  if (outlook.windows.map((item) => item.days).join(",") !== "5,10,20") throw new Error("forward flow windows must be 5, 10, 20 days");
  for (const row of outlook.windows) {
    if (row.to_period !== marketDay || row.from_period >= marketDay) throw new Error(`forward flow window ${row.days} has invalid dates`);
    if (row.equity_etf && (row.equity_etf.coverage < 0.9 || row.equity_etf.coverage > 1 || row.equity_etf.matched_count < 1 || !Number.isFinite(row.equity_etf.change_pct))) {
      throw new Error(`forward flow window ${row.days} has invalid ETF comparison`);
    }
    if (row.margin && (row.margin.from_period >= row.margin.to_period || row.margin.to_period > marketDay || !Number.isFinite(row.margin.balance_change_100m_cny))) {
      throw new Error(`forward flow window ${row.days} has invalid margin comparison`);
    }
    if (row.southbound && (row.southbound.to_period > marketDay || !Number.isFinite(row.southbound.net_buy_100m_cny))) {
      throw new Error(`forward flow window ${row.days} has invalid southbound sum`);
    }
    if (row.northbound && (row.northbound.observations !== row.days || !Number.isFinite(row.northbound.avg_turnover_100m_cny) || "net_buy_100m_cny" in row.northbound)) {
      throw new Error(`forward flow window ${row.days} has invalid or mislabeled northbound turnover`);
    }
  }
  if (/南向|港股通/.test(outlook.verdict.domestic)) throw new Error("A-share flow verdict may not include southbound transactions");
  if (/外资净(买|卖|流)/.test(outlook.verdict.headline + outlook.verdict.foreign_environment)) throw new Error("foreign environment may not be stated as observed net flow");
}
const marketActivity = snapshot.metrics.find((metric) => metric.indicator_id === "M1-A01/02");
if (marketActivity && marketActivity.period.slice(0, 10) !== marketDay) {
  throw new Error(`market activity is stale for ${marketDay}`);
}
const industryStrength = snapshot.metrics.find((metric) => metric.indicator_id === "M3-A01/03");
if (industryStrength && industryStrength.period.slice(0, 10) !== marketDay) {
  throw new Error(`industry strength is stale for ${marketDay}`);
}
if (snapshot.sector_candidates !== undefined) {
  if (!Array.isArray(snapshot.sector_candidates) || snapshot.sector_candidates.length > 3) {
    throw new Error("sector candidates must be an array of at most 3 items");
  }
  for (const candidate of snapshot.sector_candidates) {
    if (!industryStrength || candidate.market_data_date !== marketDay || candidate.status !== "待确认" || !candidate.evidence?.length) {
      throw new Error(`sector candidate has invalid market_data_date, status or evidence: ${candidate.industry_name}`);
    }
  }
}
if (snapshot.shipping.length < 2) {
  const reported = new Set(snapshot.shipping.map((item) => item.route_id));
  const missing = new Set(snapshot.data_gaps.filter((item) => item.indicator_id?.startsWith("M8-SHIPPING-")).map((item) => item.indicator_id.slice("M8-SHIPPING-".length)));
  const accounted = ["chokepoint6", "chokepoint4", "chokepoint1"].every((id) => reported.has(id) || missing.has(id));
  if (!accounted) throw new Error(`only ${snapshot.shipping.length} shipping routes; unrecorded source outage`);
}
if (snapshot.commodities.length < 10) throw new Error(`only ${snapshot.commodities.length} commodities; publication minimum is 10`);
for (const item of snapshot.major_news) {
  if (!item.headline || !item.published_at || !item.source_name || !item.source_url) {
    throw new Error("published news must include headline, time, source, and URL");
  }
}
for (const metric of snapshot.metrics) {
  if (metric.value === null || metric.value === undefined || metric.value === "") {
    throw new Error(`published metric has no value: ${metric.indicator_id}`);
  }
}

process.stdout.write(`${snapshot.report_date}: ${snapshot.metrics.length} metrics validated\n`);
