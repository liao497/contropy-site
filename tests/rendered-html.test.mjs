import assert from "node:assert/strict";
import test from "node:test";

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
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>每日资讯博弈 · A股宏观与行业投资看板<\/title>/i);
  assert.match(html, /<h1>每日资讯博弈<\/h1>/);
  assert.match(html, /s-market-up[^>]*>420</);
  assert.match(html, /s-market-down[^>]*>4,760</);
  assert.match(html, /宏观与行业数据日报/);
  assert.match(html, /高风险观察/);
  assert.match(html, /420 \/ 4,760/);
  assert.match(html, /本期不生成机会/);
  assert.match(html, /指标明细/);
  assert.match(html, /最新数据/);
  assert.match(html, /上一日\/期/);
  assert.match(html, /同比情况/);
  assert.match(html, /跨市场情绪/);
  assert.match(html, /A股情绪温度/);
  assert.match(html, /欧洲市场情绪温度/);
  assert.match(html, /偏乐观|狂热\/一致乐观/);
  assert.match(html, /狂热为逆向风险/);
  assert.match(html, /行业强度、成交与拥挤/);
  assert.match(html, /风险压力指标/);
  assert.match(html, /行业行情覆盖已达标，但前瞻景气与估值输入覆盖不足70%/);
  assert.match(html, /未来催化/);
  assert.doesNotMatch(html, /管理观察池|加入观察池|个股候选|DEMO|演示数据|方法论|归档路径/);
});
