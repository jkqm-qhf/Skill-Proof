import assert from "node:assert/strict";
import test from "node:test";
import { skills, suites } from "../src/data.ts";
import { parseRuns } from "../src/lib.ts";
import { buildRunReport, createDemoRun, filterRuns } from "../src/runs.ts";
import type { Run } from "../src/types.ts";

function makeRun(id = "run-1", date = "2026-10-21T10:00:00.000Z") {
  return createDemoRun(skills[0], suites[0], { id, createdAt: date });
}

test("historical snapshots survive skill changes and catalog removal", () => {
  const skill = structuredClone(skills[0]);
  const suite = structuredClone(suites[0]);
  const run = createDemoRun(skill, suite, {
    id: "history",
    createdAt: "2026-10-21T10:00:00.000Z",
  });
  skill.name = "Renamed";
  skill.version = "99.0.0";
  skill.cases[0].passed = 0;
  suite.version = "99.0.0";
  assert.equal(run.snapshot?.skillName, "PDF Reader");
  assert.equal(run.snapshot?.skillVersion, "1.2.0");
  assert.equal(run.snapshot?.suiteVersion, "0.1.0");
  assert.equal(run.snapshot?.cases[0].passed, 12);
  assert.deepEqual(parseRuns(JSON.stringify([run]), []), [run]);
  assert.equal(buildRunReport(run).evidenceStatus, "demo-snapshot");
  assert.throws(
    () =>
      createDemoRun(skills[0], suites[1], {
        id: "bad",
        createdAt: run.createdAt,
      }),
    /incompatible/,
  );
});

test("legacy summaries stay readable without inventing historical cases", () => {
  const run = makeRun();
  delete run.snapshot;
  const [restored] = parseRuns(JSON.stringify([run]), skills);
  const report = buildRunReport(restored);
  assert.equal(restored.passed, 44);
  assert.equal(report.evidenceStatus, "summary-only");
  assert.equal(report.run.snapshot, undefined);
  assert.equal(report.mode, "demo");
  assert.ok(!("skill" in report));
});

test("corrupt or contradictory snapshots degrade to the stored summary", () => {
  const valid = makeRun();
  for (const snapshot of [
    null,
    {},
    { ...valid.snapshot, cases: [] },
    { ...valid.snapshot, skillVersion: 3 },
    {
      ...valid.snapshot,
      cases: [{ name: "invalid", passed: 100, total: 1, seconds: 1 }],
    },
    {
      ...valid.snapshot,
      cases: [{ name: "wrong aggregate", passed: 1, total: 48, seconds: 11.2 }],
    },
    { ...valid.snapshot, cases: [null] },
  ]) {
    const result = parseRuns(JSON.stringify([{ ...valid, snapshot }]), skills);
    assert.equal(result.length, 1);
    assert.equal(result[0].snapshot, undefined);
    assert.equal(result[0].passed, 44);
  }
  const malformed = { ...valid, snapshot: {}, skillId: "retired-skill" };
  assert.deepEqual(parseRuns(JSON.stringify([malformed]), skills), []);
});

test("history filters combine search, benchmark and stable time ordering", () => {
  const first = makeRun("first", "2026-10-21T09:00:00.000Z");
  const second = makeRun("second", "2026-10-21T10:00:00.000Z");
  const table = createDemoRun(skills[2], suites[1], {
    id: "table",
    createdAt: "2026-10-21T11:00:00.000Z",
  });
  const runs = [first, second, table];
  assert.deepEqual(
    filterRuns(runs, skills, suites, "  pdf READER ", "pdf-core", "newest").map(
      (run) => run.id,
    ),
    ["second", "first"],
  );
  assert.equal(
    filterRuns(runs, skills, suites, "1.2.0", "table-core", "newest").length,
    0,
  );
  assert.equal(
    filterRuns(runs, skills, suites, "first", "", "oldest")[0].id,
    "first",
  );
  assert.equal(
    filterRuns(runs, skills, suites, "", "", "newest")[0].id,
    "table",
  );
  assert.deepEqual(
    runs.map((run) => run.id),
    ["first", "second", "table"],
  );
  const legacy: Run = { ...first };
  delete legacy.snapshot;
  assert.equal(
    filterRuns([legacy], skills, suites, "PDF Reader", "", "oldest").length,
    1,
  );
});
