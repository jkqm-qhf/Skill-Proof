import assert from "node:assert/strict";
import test from "node:test";
import { filterProfiles, revisionExecutions } from "../src/profile-library.ts";
import { reviseProfile } from "../src/profiles.ts";
import { PDF_SKILL_SOURCE } from "../src/executions.ts";
import type { Execution } from "../src/executions.ts";

const declaration = { claims: [], environment: "", permissions: [] };

test("profile search uses all keywords in the latest name and description", async () => {
  const first = (await reviseProfile(undefined, PDF_SKILL_SOURCE, declaration)).profile;
  const second = (await reviseProfile(first, PDF_SKILL_SOURCE.replace("pdf-text-extract", "document-reader"), declaration)).profile;
  assert.deepEqual(filterProfiles([second], "  DOCUMENT digital  "), [second]);
  assert.deepEqual(filterProfiles([second], "pdf-text-extract"), []);
  assert.deepEqual(filterProfiles([second], "document missing"), []);
  assert.deepEqual(filterProfiles([second], " \n "), [second]);
});

test("revision evidence excludes other profiles, versions and source hashes and sorts newest first", async () => {
  const profile = (await reviseProfile(undefined, PDF_SKILL_SOURCE, declaration)).profile;
  const revision = profile.revisions[0];
  const run: Execution = {
    id: "old", mode: "executed", createdAt: "2026-10-20T00:00:00Z",
    profile: { id: profile.id, version: 1, name: revision.name, textSha256: revision.textSha256 },
    adapter: { id: "pdfjs-text", version: "6.4.299" },
    suite: { id: "pdf-text", version: "1", manifestSha256: "hash" },
    durationMs: 1, results: [],
  };
  const newer = { ...run, id: "new", createdAt: "2026-10-23T00:00:00Z" };
  const inputs = [
    run,
    { ...run, id: "other", profile: { ...run.profile, id: "other" } },
    { ...run, id: "v2", profile: { ...run.profile, version: 2 } },
    { ...run, id: "changed-source", profile: { ...run.profile, textSha256: "other" } },
    newer,
  ];
  assert.deepEqual(revisionExecutions(inputs, profile.id, revision), [newer, run]);
  assert.equal(inputs[0], run);
  assert.deepEqual(revisionExecutions(inputs, "missing", revision), []);
});
