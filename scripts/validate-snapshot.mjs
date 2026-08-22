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
for (const module of requiredModules) {
  if (!snapshot.metrics.some((metric) => metric.module === module)) {
    throw new Error(`critical module missing: ${module}`);
  }
}
if (!snapshot.metrics.some((metric) => ["重点风险", "跨市场情绪"].includes(metric.module))) {
  throw new Error("risk and sentiment modules are both missing");
}
for (const metric of snapshot.metrics) {
  if (metric.value === null || metric.value === undefined || metric.value === "") {
    throw new Error(`published metric has no value: ${metric.indicator_id}`);
  }
}

process.stdout.write(`${snapshot.report_date}: ${snapshot.metrics.length} metrics validated\n`);
