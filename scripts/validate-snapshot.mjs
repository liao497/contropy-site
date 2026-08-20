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

const required = ["M1-A01/02", "M1-A05/06/07", "M1-C01", "M2-A01/03", "M3-A01/03", "M6-B02", "M6-C01"];
for (const id of required) {
  if (!ids.has(id)) throw new Error(`critical indicator missing: ${id}`);
}
for (const metric of snapshot.metrics) {
  if (metric.value === null || metric.value === undefined || metric.value === "") {
    throw new Error(`published metric has no value: ${metric.indicator_id}`);
  }
}

process.stdout.write(`${snapshot.report_date}: ${snapshot.metrics.length} metrics validated\n`);
