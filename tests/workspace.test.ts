import assert from "node:assert/strict";
import test from "node:test";
import { skills, suites } from "../src/data.ts";
import { createDemoRun } from "../src/runs.ts";
import {
  createWorkspaceBackup,
  MAX_BACKUP_BYTES,
  mergeWorkspace,
  parseWorkspaceBackup,
} from "../src/workspace.ts";

const date = "2026-10-21T10:00:00.000Z";
const makeRun = (id: string, createdAt = date) =>
  createDemoRun(skills[0], suites[0], { id, createdAt });

test("workspace export/import round-trips favorites, legacy runs and historical snapshots", () => {
  const legacy = makeRun("legacy");
  delete legacy.snapshot;
  const data = {
    favorites: ["pdf-reader"],
    runs: [makeRun("snapshot"), legacy],
  };
  const backup = createWorkspaceBackup(data, date);
  const restored = parseWorkspaceBackup(
    "\uFEFF" + JSON.stringify(backup),
    skills,
  );
  assert.deepEqual(restored.backup, backup);
  assert.equal(restored.unknownFavorites, 0);
  data.runs[0].snapshot!.cases[0].passed = 0;
  assert.equal(backup.runs[0].snapshot!.cases[0].passed, 12);
  assert.equal(backup.mode, "demo");
});

test("invalid files are rejected atomically rather than partially importing records", () => {
  const good = createWorkspaceBackup(
    { favorites: [], runs: [makeRun("valid")] },
    date,
  );
  for (const value of [
    null,
    [],
    {},
    { ...good, version: 2 },
    { ...good, mode: "real" },
    { ...good, exportedAt: "invalid" },
    { ...good, favorites: [false] },
    { ...good, runs: [makeRun("valid"), { ...makeRun("bad"), total: 0 }] },
    { ...good, runs: [{ ...makeRun("bad-snapshot"), snapshot: {} }] },
    { ...good, runs: [makeRun("duplicate"), makeRun("duplicate")] },
    { ...good, runs: Array(1001).fill(makeRun("too-many")) },
  ]) {
    assert.throws(() => parseWorkspaceBackup(JSON.stringify(value), skills));
  }
  assert.throws(() => parseWorkspaceBackup("broken json", skills), /JSON/);
  assert.throws(
    () => parseWorkspaceBackup(" ".repeat(MAX_BACKUP_BYTES + 1), skills),
    /2 MB/,
  );
});

test("unknown favorites are counted and skipped; removed skills retain valid snapshots", () => {
  const retired = { ...makeRun("archived"), skillId: "retired" };
  const backup = createWorkspaceBackup(
    { favorites: ["pdf-reader", "retired", "retired"], runs: [retired] },
    date,
  );
  const parsed = parseWorkspaceBackup(JSON.stringify(backup), skills);
  assert.equal(parsed.unknownFavorites, 1);
  assert.deepEqual(parsed.backup.favorites, ["pdf-reader"]);
  assert.equal(parsed.backup.runs[0].skillId, "retired");
});

test("merge retains local conflicts, adds new data, and importing twice is idempotent", () => {
  const local = makeRun("same");
  const conflict = makeRun("same");
  conflict.snapshot!.skillVersion = "0.0.1";
  const current = { favorites: ["pdf-reader"], runs: [local] };
  const incoming = {
    favorites: ["scan-lens", "pdf-reader"],
    runs: [conflict, makeRun("new")],
  };
  const merged = mergeWorkspace(current, incoming);
  assert.equal(merged.addedRuns, 1);
  assert.equal(merged.addedFavorites, 1);
  assert.equal(merged.duplicateRuns, 1);
  assert.equal(merged.conflictingRuns, 1);
  assert.deepEqual(
    merged.runs.find((run) => run.id === "same"),
    local,
  );
  const second = mergeWorkspace(merged, incoming);
  assert.equal(second.addedRuns, 0);
  assert.equal(second.addedFavorites, 0);
  assert.deepEqual(current, { favorites: ["pdf-reader"], runs: [local] });
});

test("restore respects the record limit without evicting existing local history", () => {
  const current = {
    favorites: [],
    runs: Array.from({ length: 99 }, (_, index) => makeRun(`local-${index}`)),
  };
  const incoming = {
    favorites: [],
    runs: [
      makeRun("older", "2026-10-20T10:00:00.000Z"),
      makeRun("newer", "2026-10-22T10:00:00.000Z"),
    ],
  };
  const merged = mergeWorkspace(current, incoming);
  assert.equal(merged.runs.length, 100);
  assert.equal(merged.addedRuns, 1);
  assert.equal(merged.skippedRuns, 1);
  assert.equal(merged.runs[0].id, "newer");
  assert.ok(current.runs.every((run) => merged.runs.includes(run)));
  const full = mergeWorkspace(merged, {
    favorites: ["scan-lens"],
    runs: [makeRun("another")],
  });
  assert.equal(full.addedRuns, 0);
  assert.equal(full.addedFavorites, 1);
  assert.equal(full.skippedRuns, 1);
});
