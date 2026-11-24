import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

function workflowStep(source, name) {
  const start = source.indexOf(`      - name: ${name}`);
  const scriptStart = source.indexOf("        run: |\n", start) + "        run: |\n".length;
  const nextStep = source.indexOf("\n      - ", scriptStart);
  assert.ok(start >= 0 && scriptStart > start);
  return source.slice(scriptStart, nextStep < 0 ? source.length : nextStep).split("\n").map((line) => line.replace(/^ {10}/, "")).join("\n");
}

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
  assert.match(workflow, /REQUESTED_REVISION_ID/);
  assert.match(workflow, /revision_id="\$REQUESTED_REVISION_ID"/);
  assert.match(workflow, /ONLY_IF_STALE/);
  assert.match(workflow, /ALERT_ON_RECOVERY/);
  assert.match(workflow, /snapshot_revision/);
  assert.match(workflow, /snapshot_has_industry/);
  assert.match(workflow, /collector_args\+=\(--market-date-if-trading\)/);
  assert.doesNotMatch(workflow, /collector_args\+=\(--market-date "\$REPORT_DATE"\)/);
  assert.match(workflow, /report_date\.\$REVISION_ID\.md/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /Raise a stale-dashboard alert/);
  assert.match(workflow, /Alert when watchdog recovery fails/);
  assert.match(workflow, /Resolve the stale-dashboard alert/);
  assert.match(workflow, /Industry data pending/);
  assert.match(workflow, /startswith/);
});

test("a delayed closing schedule is treated as a morning refresh", async () => {
  const workflow = await readFile(new URL("../.github/workflows/daily-dashboard.yml", import.meta.url), "utf8");
  const script = workflowStep(workflow, "Plan the refresh");
  const directory = await mkdtemp(path.join(tmpdir(), "contropy-workflow-"));
  try {
    const preamble = `date() { if [[ "$*" == *%H%M* ]]; then echo "$FAKE_BEIJING_TIME"; else echo 2026-11-24; fi; }
node() { if [[ "$2" == *.report_date* ]]; then echo 2026-11-23; elif [[ "$2" == *.revision_id* ]]; then echo daily; else echo true; fi; }`;
    for (const [time, expectedRole] of [["0530", "backup"], ["1635", "close"]]) {
      const env = { ...process.env, FAKE_BEIJING_TIME: time, EVENT_NAME: "schedule", EVENT_SCHEDULE: "30 8 * * *", REQUESTED_REPORT_DATE: "", REQUESTED_EDITION: "", REQUESTED_REVISION_ID: "", REQUESTED_MARKET_DATE: "", ONLY_IF_STALE: "", ALERT_ON_RECOVERY: "", GITHUB_ENV: path.join(directory, `env-${time}`), GITHUB_OUTPUT: path.join(directory, `output-${time}`), GITHUB_STEP_SUMMARY: path.join(directory, `summary-${time}`) };
      await run("bash", ["-c", `${preamble}\n${script}`], { env });
      const output = await readFile(env.GITHUB_OUTPUT, "utf8");
      assert.match(output, new RegExp(`run_role=${expectedRole}`));
      assert.match(await readFile(env.GITHUB_ENV, "utf8"), new RegExp(`REVISION_ID=${expectedRole === "close" ? "close" : "daily"}`));
    }
    const delayedDispatch = { ...process.env, FAKE_BEIJING_TIME: "0530", EVENT_NAME: "workflow_dispatch", EVENT_SCHEDULE: "", REQUESTED_REPORT_DATE: "", REQUESTED_EDITION: "close", REQUESTED_REVISION_ID: "close-repair-0530", REQUESTED_MARKET_DATE: "", ONLY_IF_STALE: "", ALERT_ON_RECOVERY: "", GITHUB_ENV: path.join(directory, "manual-env"), GITHUB_OUTPUT: path.join(directory, "manual-output"), GITHUB_STEP_SUMMARY: path.join(directory, "manual-summary") };
    await run("bash", ["-c", `${preamble}\n${script}`], { env: delayedDispatch });
    assert.match(await readFile(delayedDispatch.GITHUB_OUTPUT, "utf8"), /run_role=backup/);
    assert.match(await readFile(delayedDispatch.GITHUB_ENV, "utf8"), /REVISION_ID=daily/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an independent freshness guard checks every calendar day", async () => {
  const guard = await readFile(new URL("../.github/workflows/dashboard-freshness-guard.yml", import.meta.url), "utf8");

  for (const schedule of ["23 23 * * *", "43 23 * * *", "3 0 * * *", "3 2 * * *", "3 3 * * *", "3 4 * * *", "3 9 * * *", "23 9 * * *"]) {
    assert.match(guard, new RegExp(`cron: "${schedule.replaceAll("*", "\\*")}"`));
  }
  assert.match(guard, /actions: write/);
  assert.match(guard, /daily-dashboard\.yml\/dispatches/);
  assert.match(guard, /inputs\[only_if_stale\]=true/);
  assert.match(guard, /inputs\[alert_on_recovery\]=\$final_guard/);
  assert.match(guard, /final_guard=true/);
  assert.match(guard, /snapshot_has_industry/);
  assert.match(guard, /inputs\[revision_id\]/);
});

test("a delayed closing guard dispatches the morning edition", async () => {
  const workflow = await readFile(new URL("../.github/workflows/dashboard-freshness-guard.yml", import.meta.url), "utf8");
  const script = workflowStep(workflow, "Check freshness and dispatch recovery");
  const directory = await mkdtemp(path.join(tmpdir(), "contropy-guard-"));
  try {
    const preamble = `date() { if [[ "$*" == *%H%M* ]]; then echo "$FAKE_BEIJING_TIME"; else echo 2026-11-24; fi; }
node() { if [[ "$2" == *.report_date* ]]; then echo 2026-11-23; elif [[ "$2" == *.revision_id* ]]; then echo daily; else echo true; fi; }
gh() { printf '%s\\n' "$*" >> "$GH_CALL_LOG"; }`;
    for (const [time, expectedEdition] of [["0530", "daily"], ["1730", "close"]]) {
      const env = { ...process.env, FAKE_BEIJING_TIME: time, EVENT_SCHEDULE: "23 9 * * *", GITHUB_REF_NAME: "main", GITHUB_REPOSITORY: "liao497/contropy-site", GH_CALL_LOG: path.join(directory, `gh-${time}`) };
      await run("bash", ["-c", `${preamble}\n${script}`], { env });
      assert.match(await readFile(env.GH_CALL_LOG, "utf8"), new RegExp(`inputs\\[edition\\]=${expectedEdition}`));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
