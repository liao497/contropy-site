import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function cell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function metricRows(metrics) {
  return metrics.map((metric) => {
    const interpretation = metric.interpretation_type === "none" ? null : metric.interpretation;
    return `| ${cell(metric.indicator_name)} | ${cell(metric.value)} ${cell(metric.unit) === "—" ? "" : cell(metric.unit)} | ${cell(metric.previous_value)} | ${cell(metric.yoy_value)} | ${cell(interpretation)} |`;
  }).join("\n") || "| — | — | — | — | — |";
}

function sectionMetrics(snapshot, modulePrefix) {
  return snapshot.metrics.filter((metric) => metric.indicator_id.startsWith(modulePrefix));
}

function list(items, render) {
  return items.length ? items.map(render).join("\n") : "- 无";
}

function renderReport(snapshot) {
  const market = sectionMetrics(snapshot, "M1-");
  const macro = sectionMetrics(snapshot, "M2-");
  const sectors = sectionMetrics(snapshot, "M3-");
  const forward = sectionMetrics(snapshot, "M4-");
  const riskMetrics = sectionMetrics(snapshot, "M6-B");
  const sentiment = sectionMetrics(snapshot, "M6-C");
  const vulnerability = snapshot.risks.filter((risk) => risk.risk_type === "vulnerability");
  const stress = snapshot.risks.filter((risk) => risk.risk_type === "stress");
  const table = (rows) => `| 指标 | 最新数据 | 上一日/期 | 同比情况 | 解读 |\n|---|---:|---:|---:|---|\n${metricRows(rows)}`;

  return `# ${snapshot.report_date} 晨间行业投资看板

> 数据截至：${snapshot.as_of}｜状态：${snapshot.data_state}｜指标版本：${snapshot.indicator_version}｜模型版本：${snapshot.model_version}

## 一句话结论

${snapshot.run.top_call ?? "无明确机会或风险解读。"}

## 市场环境

${table(market)}

## 宏观、利率与政策预期

${table(macro)}

## 国内行业强度与海外映射

${table(sectors)}

## 重点行业前瞻

${table(forward)}

## 风险压力指标

${table(riskMetrics)}

## 跨市场情绪

> 温度为 0—100：0代表极度悲观，50代表中性，100代表狂热。狂热按逆向风险处理；极度悲观仅作为潜在反转观察，不构成买入信号。

${table(sentiment)}

## 波段行业机会 Top 3

${list(snapshot.opportunities, (item) => `### ${item.rank}. ${item.industry_name}｜${item.adjusted_score}分

- 类型：${cell(item.opportunity_type)}
- 逻辑：${cell(item.thesis)}
- 确认条件：${cell(item.confirmation_conditions)}
- 风险：${cell(item.risks)}
- 失效条件：${cell(item.invalidation_conditions)}
- 数据质量：置信度${cell(item.confidence)}，覆盖率${cell(item.coverage)}，时效性${cell(item.freshness)}`)}

## 风险脆弱性

${list(vulnerability, (risk) => `- **${cell(risk.name)}**：${cell(risk.status)}${risk.interpretation ? `｜${cell(risk.interpretation)}` : ""}`)}

## 风险压力

${list(stress, (risk) => `- **${cell(risk.name)}**：${cell(risk.status)}${risk.interpretation ? `｜${cell(risk.interpretation)}` : ""}`)}

## 未来 7 / 30 / 90 日事件

${list(snapshot.events, (event) => `- ${cell(event.event_at)}｜${cell(event.window)}｜${cell(event.event_name)}｜影响：${cell(event.impact)}`)}

## 数据缺口与异常

${list(snapshot.data_gaps, (gap) => `- ${cell(gap.indicator_id)}：${cell(gap.reason)}`)}

## 来源与版本

- schema：${snapshot.schema_version}
- indicator：${snapshot.indicator_version}
- model：${snapshot.model_version}
- run：${cell(snapshot.run.run_id)}
`;
}

function assertSnapshot(snapshot) {
  const required = ["schema_version", "indicator_version", "model_version", "report_date", "as_of", "timezone", "data_state", "metrics", "opportunities", "risks", "events", "data_gaps", "run"];
  for (const key of required) {
    if (!(key in snapshot)) throw new Error(`Missing required field: ${key}`);
  }
  if (snapshot.schema_version !== "snapshot-v1.0.0") throw new Error(`Unsupported schema: ${snapshot.schema_version}`);
  if (snapshot.timezone !== "Asia/Shanghai") throw new Error("timezone must be Asia/Shanghai");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.report_date)) throw new Error("report_date must use YYYY-MM-DD");
  if (!Array.isArray(snapshot.metrics) || !Array.isArray(snapshot.opportunities)) throw new Error("metrics and opportunities must be arrays");
  if (snapshot.opportunities.length > 3) throw new Error("opportunities cannot exceed 3");
}

async function main() {
  const [, , inputArg, outputArg = "."] = process.argv;
  if (!inputArg) throw new Error("Usage: node scripts/archive-report.mjs <snapshot.json> [output-root]");
  const input = JSON.parse(await readFile(path.resolve(inputArg), "utf8"));
  assertSnapshot(input);

  const [year, month] = input.report_date.split("-");
  const outputRoot = path.resolve(outputArg);
  const snapshotDir = path.join(outputRoot, "data", "snapshots", year, month);
  const reportDir = path.join(outputRoot, "reports", "daily", year, month);
  await mkdir(snapshotDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });

  const suffix = input.run.revision_id && input.run.revision_id !== "r1" ? `.${input.run.revision_id}` : "";
  const snapshotPath = path.join(snapshotDir, `${input.report_date}${suffix}.json`);
  const reportPath = path.join(reportDir, `${input.report_date}${suffix}.md`);
  await writeFile(snapshotPath, `${JSON.stringify(input, null, 2)}\n`, { flag: "wx" });
  await writeFile(reportPath, renderReport(input), { flag: "wx" });
  process.stdout.write(`${reportPath}\n${snapshotPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
