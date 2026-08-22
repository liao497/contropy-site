import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  assert.match(html, new RegExp(`<span>${escapeRegExp(snapshot.report_date)}</span>`));
  assert.match(html, /宏观与行业数据日报/);
  assert.match(html, /重点提示/);
  assert.match(html, new RegExp(escapeRegExp(snapshot.run.risk_level)));
  assert.match(html, /波段行业机会 Top 3/);
  assert.match(html, /指标明细/);
  assert.match(html, /最新数据/);
  assert.match(html, /上一日\/期/);
  assert.match(html, /同比情况/);
  assert.match(html, /跨市场情绪/);
  assert.match(html, /A股情绪温度/);
  assert.match(html, /欧洲市场情绪温度/);
  assert.match(html, /狂热为逆向风险/);
  assert.match(html, /行业强度、成交与拥挤/);
  assert.match(html, /风险压力指标/);
  assert.match(html, /未来催化/);
  assert.match(html, /href="mailto:liao497@126\.com"[^>]*>liao497@126\.com<\/a>/);
  assert.doesNotMatch(html, /数据缺口|管理观察池|加入观察池|个股候选|DEMO|演示数据|方法论|归档路径/);
});
