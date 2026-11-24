import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summaryFor(html, title) {
  const start = `<summary><strong>${title}</strong><span>`;
  const position = html.indexOf(start);
  assert.ok(position >= 0, `missing summary for ${title}`);
  return html.slice(position + start.length, html.indexOf("</span></summary>", position)).replace(/<!-- -->/g, "");
}

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the metric-only real daily dashboard", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../data/current-snapshot.json", import.meta.url), "utf8"));
  const breadth = snapshot.metrics.find((metric) => metric.indicator_id === "M1-A01/02");
  const sentimentMetrics = snapshot.metrics.filter((metric) => metric.indicator_id.startsWith("M6-C"));
  const firstNews = snapshot.major_news?.[0];
  const firstCommodity = snapshot.commodities?.[0];

  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>每日资讯博弈 · A股宏观与行业投资看板<\/title>/i);
  assert.match(html, /<h1>每日资讯博弈<\/h1>/);
  if (breadth) {
    const [rising, falling] = String(breadth.value).split("/").map((value) => value.trim());
    assert.ok(rising && falling, "A-share breadth must contain rising and falling values");
    assert.match(html, new RegExp(`s-market-up[^>]*>${escapeRegExp(rising)}<`));
    assert.match(html, new RegExp(`s-market-down[^>]*>${escapeRegExp(falling)}<`));
  }
  assert.match(html, new RegExp(`日报 (?:<!-- -->)?${escapeRegExp(snapshot.report_date)}`));
  assert.match(html, /宏观与行业数据日报/);
  assert.match(html, /重点提示/);
  assert.match(html, new RegExp(`${escapeRegExp(snapshot.run.risk_level)}|行情滞后 · 判断受限`));
  assert.match(html, /机会线索/);
  assert.match(html, /资金流向/);
  if (snapshot.forward_flows?.windows?.length) {
    assert.match(html, /未来资金方向/);
    assert.match(html, /A股 · ETF份额与融资余额/);
    assert.match(html, /港股通 · 内地资金南向成交/);
    assert.match(html, /外资 · 配置条件与沪股通活跃度/);
    if (snapshot.forward_flows.windows.find((item) => item.days === 5)?.equity_etf) {
      assert.match(html, /近5日ETF/);
    }
    assert.match(html, /数据来源与判断边界/);
  }
  assert.match(html, /板块成交占比/);
  assert.match(html, /北向日净买额/);
  assert.match(html, /重大新闻/);
  assert.match(html, /航运要道/);
  if (snapshot.shipping?.length) {
    assert.match(html, new RegExp(escapeRegExp(snapshot.shipping[0].route_name)));
  } else {
    assert.doesNotMatch(html, /aria-label="航运要道通行情况"/);
  }
  assert.match(html, /主要大宗商品/);
  assert.match(html, /当日/);
  assert.match(html, /近一周/);
  if (firstNews) {
    assert.match(html, new RegExp(escapeRegExp(firstNews.source_name)));
  }
  if (firstCommodity) {
    assert.match(html, new RegExp(escapeRegExp(firstCommodity.name)));
    assert.match(html, new RegExp(escapeRegExp(firstCommodity.period)));
  }
  assert.match(html, /指标明细/);
  assert.match(html, /最新数据/);
  assert.match(html, /上一日\/期/);
  assert.match(html, /同比情况/);
  assert.match(html, /跨市场情绪/);
  for (const metric of sentimentMetrics) {
    assert.match(html, new RegExp(escapeRegExp(metric.indicator_name)));
  }
  if (sentimentMetrics.length) assert.match(summaryFor(html, "跨市场情绪"), /\/100/);
  assert.match(html, /行业强度、成交与拥挤/);
  assert.match(html, /风险压力指标/);
  if (snapshot.events.length > 2) assert.match(html, /未来催化/);
  assert.match(html, /href="mailto:liao497@126\.com"[^>]*>liao497@126\.com<\/a>/);
  assert.doesNotMatch(html, /数据缺口|管理观察池|加入观察池|个股候选|DEMO|演示数据|方法论|归档路径/);
});

test("collapsed sections summarize current data instead of only showing item counts", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../data/current-snapshot.json", import.meta.url), "utf8"));
  const response = await render();
  const html = await response.text();

  const capital = summaryFor(html, "当期资金流向与行业活跃度");
  if (snapshot.capital_flows?.etf) assert.match(capital, /ETF.*亿份/);
  if (snapshot.capital_flows?.southbound) assert.match(capital, /南向.*亿元/);
  if (snapshot.capital_flows?.margin) assert.match(capital, /融资.*亿元/);
  const commodities = summaryFor(html, "主要大宗商品");
  if (snapshot.commodities?.length) {
    assert.match(commodities, /种期货下跌.*日变.*近5日/);
    const largest = snapshot.commodities.reduce((best, item) => Math.abs(item.daily_change_pct) > Math.abs(best.daily_change_pct) ? item : best);
    assert.match(commodities, new RegExp(escapeRegExp(largest.name)));
  }
  const titles = ["01 市场环境 · A股与港股通", "02 海外参考 · 美国与亚洲", "03 宏观、利率与政策预期", "04 行业强度、成交与拥挤", "05 风险压力指标", "06 跨市场情绪 · 逆向风险"];
  for (const title of titles) {
    const summary = summaryFor(html, title);
    assert.ok(summary.length > 0, `${title} should summarize its available data`);
    assert.doesNotMatch(summary, /^\d+项$/, `${title} should not be only an item count`);
  }
  if (snapshot.metrics.some((item) => item.indicator_id === "M1-A05/06/07")) assert.match(summaryFor(html, titles[0]), /沪深成交/);
  if (snapshot.metrics.some((item) => item.indicator_id === "M1-C01")) assert.match(summaryFor(html, titles[1]), /标普/);
  if (snapshot.metrics.some((item) => item.indicator_id === "M2-A01/03")) assert.match(summaryFor(html, titles[2]), /PMI/);
  if (snapshot.metrics.some((item) => item.indicator_id === "M3-A01/03")) assert.match(summaryFor(html, titles[3]), /RPS前列/);
  if (snapshot.metrics.some((item) => item.indicator_id === "M6-B02")) assert.match(summaryFor(html, titles[4]), /高收益债OAS/);
  if (snapshot.metrics.some((item) => item.indicator_id.startsWith("M6-C"))) assert.match(summaryFor(html, titles[5]), /\/100/);
});

test("decision summary comes first and supporting modules use progressive disclosure", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../data/current-snapshot.json", import.meta.url), "utf8"));
  const response = await render();
  const html = await response.text();
  const opportunity = html.indexOf("机会线索");
  const risk = html.indexOf("风险雷达");
  const details = html.indexOf("指标明细");
  assert.ok(opportunity > 0 && risk > opportunity && details > risk);
  assert.match(html, snapshot.sector_candidates?.length ? /待确认/ : snapshot.metrics.some((item) => item.indicator_id === "M3-A01/03") ? /暂无符合筛选门槛的行业线索/ : /行业数据暂缺，机会筛选暂停/);
  assert.match(html, /估值.*景气/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(html, /行情数据日/);
});
