import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("daily workflow runs every calendar day with idempotent retries and a closing refresh", async () => {
  const workflow = await readFile(new URL("../.github/workflows/daily-dashboard.yml", import.meta.url), "utf8");

  for (const schedule of ["37 21 * * *", "7 22 * * *", "37 22 * * *", "7 23 * * *", "30 8 * * *"]) {
    assert.match(workflow, new RegExp(`cron: "${schedule.replaceAll("*", "\\*")}"`));
  }
  assert.doesNotMatch(workflow, /--trading-days-only/);
  assert.match(workflow, /snapshot_date.*report_date/);
  assert.match(workflow, /should_run=false/);
  assert.match(workflow, /run_role=watchdog/);
  assert.match(workflow, /run_role=close/);
  assert.match(workflow, /revision_id=close/);
  assert.match(workflow, /ONLY_IF_STALE/);
  assert.match(workflow, /ALERT_ON_RECOVERY/);
  assert.match(workflow, /snapshot_revision/);
  assert.match(workflow, /collector_args\+=\(--market-date-if-trading\)/);
  assert.doesNotMatch(workflow, /collector_args\+=\(--market-date "\$REPORT_DATE"\)/);
  assert.match(workflow, /report_date\.\$REVISION_ID\.md/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /Raise a stale-dashboard alert/);
  assert.match(workflow, /Alert when watchdog recovery fails/);
  assert.match(workflow, /Resolve the stale-dashboard alert/);
});

test("an independent freshness guard checks every calendar day", async () => {
  const guard = await readFile(new URL("../.github/workflows/dashboard-freshness-guard.yml", import.meta.url), "utf8");

  for (const schedule of ["23 23 * * *", "43 23 * * *", "3 0 * * *", "3 9 * * *", "23 9 * * *"]) {
    assert.match(guard, new RegExp(`cron: "${schedule.replaceAll("*", "\\*")}"`));
  }
  assert.match(guard, /actions: write/);
  assert.match(guard, /daily-dashboard\.yml\/dispatches/);
  assert.match(guard, /inputs\[only_if_stale\]=true/);
  assert.match(guard, /inputs\[alert_on_recovery\]=\$final_guard/);
  assert.match(guard, /final_guard=true/);
});
