import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillProofService } from "../server/service.ts";
import { reviseProfile } from "../src/profiles.ts";
import { PDF_SKILL_SOURCE } from "../src/executions.ts";
import { verifyExecutionEvidence } from "../src/reports.ts";

test(
  "SQLite API preserves profiles, runs queued jobs, cancels waiting jobs, and survives restart",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "skillproof-api-"));
    const file = join(directory, "test.sqlite");
    let service = createSkillProofService(file);
    try {
      let port = await service.listen(0);
      const request = async (
        path: string,
        data?: unknown,
        extraHeaders: Record<string, string> = {},
      ) =>
        fetch(`http://127.0.0.1:${port}/api${path}`, {
          method: data === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json", ...extraHeaders },
          body: data === undefined ? undefined : JSON.stringify(data),
        });
      assert.equal((await request("/health")).status, 200);
      const profile = (
        await reviseProfile(undefined, PDF_SKILL_SOURCE, {
          claims: [],
          environment: "Node",
          permissions: [],
        })
      ).profile;
      assert.equal((await request("/profiles", profile)).status, 201);
      assert.equal(
        (
          await request("/profiles", {
            ...profile,
            revisions: [{ ...profile.revisions[0], name: "tampered" }],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/jobs",
            { profileId: profile.id, version: 1 },
            { Origin: "https://example.com" },
          )
        ).status,
        403,
      );
      const first = await (
        await request("/jobs", { profileId: profile.id, version: 1 })
      ).json();
      const waiting = await (
        await request("/jobs", { profileId: profile.id, version: 1 })
      ).json();
      assert.equal(
        (await request(`/jobs/${waiting.id}/cancel`, {})).status,
        200,
      );
      let completed;
      for (let attempt = 0; attempt < 100; attempt++) {
        completed = await (await request(`/jobs/${first.id}`)).json();
        if (["succeeded", "failed"].includes(completed.state)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(completed.state, "succeeded", completed.error);
      const executions = await (await request("/executions")).json();
      assert.equal(executions.length, 1);
      assert.equal(
        executions[0].results.filter((item: { passed: boolean }) => item.passed)
          .length,
        5,
      );
      await verifyExecutionEvidence(executions[0]);
      const cancelled = await (await request(`/jobs/${waiting.id}`)).json();
      assert.equal(cancelled.state, "cancelled");
      const updated = (
        await reviseProfile(
          profile,
          PDF_SKILL_SOURCE + "\nVersion two clarification.\n",
          { claims: [], environment: "Node", permissions: [] },
        )
      ).profile;
      assert.equal((await request("/profiles", updated)).status, 201);
      let regression;
      for (let attempt = 0; attempt < 100; attempt++) {
        const jobs = await (await request("/jobs")).json();
        regression = jobs.find((job: { version: number }) => job.version === 2);
        if (regression && ["succeeded", "failed"].includes(regression.state))
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(regression.state, "succeeded", regression.error);
      assert.match(regression.logs[0].message, /Automatic/);
      await service.close();
      service = createSkillProofService(file);
      port = await service.listen(0);
      assert.equal((await (await request("/profiles")).json()).length, 1);
      assert.equal((await (await request("/executions")).json()).length, 2);
      const exported = await (await request("/export")).json();
      assert.equal(exported.jobs.length, 3);
    } finally {
      await service.close();
      for (const suffix of ["", "-wal", "-shm"])
        await unlink(file + suffix).catch(() => {});
      await rmdir(directory).catch(() => {});
    }
  },
);
