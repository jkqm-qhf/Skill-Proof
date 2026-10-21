import test from "node:test";
import assert from "node:assert/strict";
import { createSkillProofService } from "../server/service.ts";
import { reviseProfile } from "../src/profiles.ts";
import { PDF_SKILL_SOURCE } from "../src/executions.ts";

test(
  "sharing is immutable, summary-first, source-attributed, revocable, and supports moderated submissions/feedback",
  { timeout: 30000 },
  async () => {
    const service = createSkillProofService(":memory:");
    try {
      const port = await service.listen(0);
      const request = (path: string, data?: unknown) =>
        fetch(`http://127.0.0.1:${port}/api${path}`, {
          method: data === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
          body: data === undefined ? undefined : JSON.stringify(data),
        });
      const profile = (
        await reviseProfile(undefined, PDF_SKILL_SOURCE, {
          claims: [],
          environment: "Node",
          permissions: [],
        })
      ).profile;
      await request("/profiles", profile);
      const job = await (
        await request("/jobs", { profileId: profile.id, version: 1 })
      ).json();
      let finished;
      for (let index = 0; index < 100; index++) {
        finished = await (await request(`/jobs/${job.id}`)).json();
        if (["succeeded", "failed"].includes(finished.state)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(finished.state, "succeeded", finished.error);
      const shared = await (
        await request("/shares", {
          executionId: finished.executionId,
          publisher: "Test publisher",
          fullEvidence: false,
        })
      ).json();
      assert.equal(shared.provenance, "server-worker");
      const [storedExecution] = await (await request("/executions")).json();
      const idempotent = await (
        await request("/executions", storedExecution)
      ).json();
      assert.equal(idempotent.source, "server-worker");
      assert.equal(shared.publisher.verified, false);
      assert.equal(shared.fullReport, undefined);
      assert.equal(shared.summary.passed, 5);
      assert.ok(!JSON.stringify(shared).includes(PDF_SKILL_SOURCE));
      const full = await (
        await request("/shares", {
          executionId: finished.executionId,
          publisher: "Full publisher",
          fullEvidence: true,
        })
      ).json();
      assert.equal(
        full.fullReport.execution.evidence.profileSource,
        PDF_SKILL_SOURCE,
      );
      const listed = await (await request("/public/shares")).json();
      assert.ok(
        listed.every((item: { fullReport?: unknown }) => !item.fullReport),
      );
      assert.equal(
        (
          await request(`/public/shares/${shared.id}/feedback`, {
            name: "Visitor",
            message: "Please inspect page order.",
          })
        ).status,
        201,
      );
      const comments = await (
        await request(`/public/shares/${shared.id}/feedback`)
      ).json();
      assert.equal(comments[0].identityVerified, false);
      const submission = await (
        await request("/public/submissions", {
          publisher: "Contributor",
          source: PDF_SKILL_SOURCE,
        })
      ).json();
      assert.equal(submission.state, "pending");
      const accepted = await (
        await request(`/submissions/${submission.id}/accept`, {})
      ).json();
      assert.equal(accepted.revisions[0].source, PDF_SKILL_SOURCE);
      assert.equal(
        (await (await request("/submissions")).json())[0].state,
        "accepted",
      );
      const snapshot = await (
        await request(`/public/shares/${shared.id}`)
      ).json();
      assert.equal(snapshot.summary.version, 1);
      let throttled = false;
      for (let index = 0; index < 12; index++) {
        if (
          (
            await request(`/public/shares/${shared.id}/feedback`, {
              name: "Visitor",
              message: `Feedback ${index}`,
            })
          ).status === 429
        )
          throttled = true;
      }
      assert.equal(throttled, true);
      assert.equal(
        (await request(`/shares/${shared.id}/revoke`, {})).status,
        200,
      );
      assert.equal((await request(`/public/shares/${shared.id}`)).status, 404);
    } finally {
      await service.close();
    }
  },
);
