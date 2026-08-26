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

const requiredModules = ["市场环境", "宏观、利率与政策预期", "行业主题与海外映射"];
for (const moduleName of requiredModules) {
  if (!snapshot.metrics.some((metric) => metric.module === moduleName)) {
    throw new Error(`critical module missing: ${moduleName}`);
  }
}
if (!snapshot.metrics.some((metric) => ["重点风险", "跨市场情绪"].includes(metric.module))) {
  throw new Error("risk and sentiment modules are both missing");
}
if (!Array.isArray(snapshot.major_news) || !Array.isArray(snapshot.shipping) || !Array.isArray(snapshot.commodities)) {
  throw new Error("news, shipping, and commodities must be arrays");
}
if (snapshot.major_news.length > 9) throw new Error("major_news cannot exceed 9 items");
if (snapshot.shipping.length < 2) throw new Error(`only ${snapshot.shipping.length} shipping routes; publication minimum is 2`);
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
