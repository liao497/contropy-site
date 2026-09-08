import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("daily workflow has idempotent morning recovery and a closing refresh", async () => {
  const workflow = await readFile(new URL("../.github/workflows/daily-dashboard.yml", import.meta.url), "utf8");

  for (const schedule of ["5 7 * * 1-5", "45 7 * * 1-5", "15 8 * * 1-5", "30 16 * * 1-5"]) {
    assert.match(workflow, new RegExp(`cron: "${schedule.replaceAll("*", "\\*")}"`));
  }
  assert.match(workflow, /snapshot_date.*report_date/);
  assert.match(workflow, /should_run=false/);
  assert.match(workflow, /run_role=watchdog/);
  assert.match(workflow, /run_role=close/);
  assert.match(workflow, /revision_id=close/);
  assert.match(workflow, /collector_args\+=\(--market-date "\$REPORT_DATE"\)/);
  assert.match(workflow, /report_date\.\$REVISION_ID\.md/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /Raise a stale-dashboard alert/);
  assert.match(workflow, /Alert when watchdog recovery fails/);
  assert.match(workflow, /Resolve the stale-dashboard alert/);
});
