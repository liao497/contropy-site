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

test("allows recorded shipping source outages without blocking the other verified modules", async () => {
  const snapshot = JSON.parse(await readFile(fixture, "utf8"));
  const routeIds = ["chokepoint6", "chokepoint4", "chokepoint1"];
  snapshot.shipping = [];
  snapshot.data_gaps = snapshot.data_gaps.filter((item) => !item.indicator_id?.startsWith("M8-SHIPPING-"));
  snapshot.data_gaps.push(...routeIds.map((routeId) => ({ indicator_id: `M8-SHIPPING-${routeId}`, reason: "免费源采集失败" })));
  await validate(snapshot);
  snapshot.data_gaps = snapshot.data_gaps.filter((item) => item.indicator_id !== `M8-SHIPPING-${routeIds[0]}`);
  await assert.rejects(validate(snapshot), /shipping routes/);
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
  const priorDay = new Date(`${marketDay}T00:00:00Z`);
  priorDay.setUTCDate(priorDay.getUTCDate() - 1);
  const previousPeriod = priorDay.toISOString().slice(0, 10);
  snapshot.capital_flows = {
    etf: { period: marketDay, previous_period: previousPeriod, change_100m_shares: -2.5, coverage: 0.95, matched_count: 500, top_increase: [], top_decrease: [] },
    southbound: { period: marketDay, net_buy_100m_cny: 23.3, streak: 3 },
    margin: null,
    sectors: { period: marketDay, increasing: [], decreasing: [] },
  };
  await validate(snapshot);
  snapshot.capital_flows.sectors.period = previousPeriod;
  await assert.rejects(validate(snapshot), /sector activity date/);
  snapshot.capital_flows.sectors.period = marketDay;
  const futureDay = new Date(`${marketDay}T00:00:00Z`);
  futureDay.setUTCDate(futureDay.getUTCDate() + 1);
  snapshot.capital_flows.etf.period = futureDay.toISOString().slice(0, 10);
  await assert.rejects(validate(snapshot), /ETF share date/);
});

test("requires three valid windows and does not convert turnover into foreign net purchases", async () => {
  const snapshot = JSON.parse(await readFile(fixture, "utf8"));
  const marketDay = snapshot.run.market_data_date;
  snapshot.forward_flows = {
    market_day: marketDay,
    windows: [5, 10, 20].map((days) => ({ days, from_period: "2026-10-01", to_period: marketDay, equity_etf: { change_pct: 0.5, coverage: 0.98, matched_count: 400 }, margin: null, southbound: null, northbound: { observations: days, avg_turnover_100m_cny: 900 }, foreign_conditions: {} })),
    verdict: { domestic: "权益ETF持续增份额", hong_kong: "南向多期成交数据不足", foreign_environment: "外资配置环境证据不足", participation: "沪股通活跃度回升", headline: "资金观察" },
    sources: {}, method_note: "沪股通成交无方向",
  };
  await validate(snapshot);
  snapshot.forward_flows.windows[0].northbound.net_buy_100m_cny = 10;
  await assert.rejects(validate(snapshot), /mislabeled northbound turnover/);
  delete snapshot.forward_flows.windows[0].northbound.net_buy_100m_cny;
  snapshot.forward_flows.windows[1].days = 6;
  await assert.rejects(validate(snapshot), /must be 5, 10, 20/);
});
