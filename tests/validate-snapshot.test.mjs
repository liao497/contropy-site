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
