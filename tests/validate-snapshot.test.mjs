import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const validator = new URL("../scripts/validate-snapshot.mjs", import.meta.url);
const fixture = new URL("../data/current-snapshot.json", import.meta.url);
const leadsFixture = new URL("../data/snapshots/2026/10/2026-10-10.r3.json", import.meta.url);

async function validate(snapshot) {
  const directory = await mkdtemp(path.join(tmpdir(), "contropy-snapshot-"));
  const snapshotPath = path.join(directory, "snapshot.json");
  try {
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    return await run(process.execPath, [validator.pathname, snapshotPath, snapshot.report_date]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("accepts a sufficiently covered snapshot when one free-source indicator is unavailable", async () => {
  const snapshot = JSON.parse(await readFile(fixture, "utf8"));
  snapshot.metrics = snapshot.metrics.filter((metric) => metric.indicator_id !== "M1-A05/06/07");

  const result = await validate(snapshot);
  assert.match(result.stdout, /metrics validated/);
});

test("rejects a snapshot when an entire core module is unavailable", async () => {
  const snapshot = JSON.parse(await readFile(fixture, "utf8"));
  snapshot.metrics = snapshot.metrics.filter((metric) => metric.module !== "行业主题与海外映射");

  await assert.rejects(validate(snapshot), /critical module missing: 行业主题与海外映射/);
});

test("rejects a snapshot when commodity coverage falls below the publication floor", async () => {
  const snapshot = JSON.parse(await readFile(fixture, "utf8"));
  snapshot.commodities = snapshot.commodities.slice(0, 9);

  await assert.rejects(validate(snapshot), /publication minimum is 10/);
});

test("rejects sector leads or market activity labelled with the wrong trading date", async () => {
  const snapshot = JSON.parse(await readFile(leadsFixture, "utf8"));
  snapshot.sector_candidates[0].market_data_date = "2026-10-08";
  await assert.rejects(validate(snapshot), /sector candidate.*market_data_date/);
  snapshot.sector_candidates[0].market_data_date = snapshot.run.market_data_date;
  snapshot.metrics.find((metric) => metric.indicator_id === "M1-A01/02").period = "2026-10-08 15:00:00";
  await assert.rejects(validate(snapshot), /market activity.*stale/);
});

test("accepts comparable capital-flow records but rejects future or stale sector dates", async () => {
  const snapshot = JSON.parse(await readFile(fixture, "utf8"));
  const marketDay = snapshot.run.market_data_date;
  snapshot.capital_flows = {
    etf: { period: marketDay, previous_period: "2026-11-12", change_100m_shares: -2.5, coverage: 0.95, matched_count: 500, top_increase: [], top_decrease: [] },
    southbound: { period: marketDay, net_buy_100m_cny: 23.3, streak: 3 },
    margin: null,
    sectors: { period: marketDay, increasing: [], decreasing: [] },
  };
  await validate(snapshot);
  snapshot.capital_flows.sectors.period = "2026-11-12";
  await assert.rejects(validate(snapshot), /sector activity date/);
  snapshot.capital_flows.sectors.period = marketDay;
  snapshot.capital_flows.etf.period = "2026-11-20";
  await assert.rejects(validate(snapshot), /ETF share date/);
});
