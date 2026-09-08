import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("archives an immutable markdown report and JSON snapshot", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "morning-signal-"));
  const result = spawnSync(process.execPath, [
    new URL("../scripts/archive-report.mjs", import.meta.url).pathname,
    new URL("fixtures/demo-snapshot.json", import.meta.url).pathname,
    output,
  ], { cwd: projectRoot, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const report = await readFile(path.join(output, "reports/daily/2026/08/2026-08-19.md"), "utf8");
  const snapshot = JSON.parse(await readFile(path.join(output, "data/snapshots/2026/08/2026-08-19.json"), "utf8"));
  assert.match(report, /波段行业机会 Top 3/);
  assert.match(report, /全市场成交额/);
  assert.match(report, /重大新闻/);
  assert.match(report, /航运要道通行/);
  assert.match(report, /主要大宗商品/);
  assert.equal(snapshot.schema_version, "snapshot-v1.0.0");

  const duplicate = spawnSync(process.execPath, [
    new URL("../scripts/archive-report.mjs", import.meta.url).pathname,
    new URL("fixtures/demo-snapshot.json", import.meta.url).pathname,
    output,
  ], { cwd: projectRoot, encoding: "utf8" });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /exist/i);
});

test("archives a separate closing report", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "closing-signal-"));
  const fixture = JSON.parse(await readFile(new URL("fixtures/demo-snapshot.json", import.meta.url), "utf8"));
  fixture.run.revision_id = "close";
  const fixturePath = path.join(output, "close-fixture.json");
  await writeFile(fixturePath, `${JSON.stringify(fixture)}\n`);

  const result = spawnSync(process.execPath, [
    new URL("../scripts/archive-report.mjs", import.meta.url).pathname,
    fixturePath,
    output,
  ], { cwd: projectRoot, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const report = await readFile(path.join(output, "reports/daily/2026/08/2026-08-19.close.md"), "utf8");
  assert.match(report, /^# 2026-08-19 收盘行业投资看板/m);
});
