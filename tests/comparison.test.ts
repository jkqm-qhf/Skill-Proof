import assert from "node:assert/strict";
import test from "node:test";
import {
  compareExecutions,
  compatibility,
  findRegressionBaseline,
} from "../src/comparison.ts";
import type { Execution } from "../src/executions.ts";
import { EXECUTION_LIMITS } from "../src/limits.ts";
function execution(version: number): Execution {
  return {
    id: `run-${version}`,
    mode: "executed",
    createdAt: new Date().toISOString(),
    profile: { id: "profile", name: "pdf", version, textSha256: "hash" },
    adapter: { id: "pdfjs-text", version: "6.4.299" },
    suite: { id: "pdf", version: "1", manifestSha256: "manifest" },
    durationMs: 1,
    results: [
      {
        id: "case",
        title: "case",
        inputSha256: "input",
        outputSha256: "output",
        passed: true,
        reason: "match",
        durationMs: 1,
        expect: { pages: ["text"] },
      },
    ],
    evidence: {
      profileSource: "",
      manifestText: "",
      graderVersion: "same",
      model: null,
      modelReason: "none",
      environment: {
        runtime: "node",
        platform: "test",
        userAgent: "test",
        timeZone: "UTC",
      },
      limits: { ...EXECUTION_LIMITS },
    },
  };
}
test("comparison finds regressions, improvements and compatible version baselines", () => {
  const first = execution(1),
    second = execution(2);
  second.results[0].passed = false;
  assert.equal(compareExecutions(first, second).cases[0].change, "regressed");
  assert.equal(compareExecutions(second, first).cases[0].change, "improved");
  assert.equal(findRegressionBaseline(second, [first])?.id, first.id);
  const mismatch = structuredClone(first);
  mismatch.suite.manifestSha256 = "different";
  assert.ok(compatibility(mismatch, second).length);
  assert.equal(compareExecutions(mismatch, second).compatible, false);
  const other = structuredClone(first);
  other.evidence!.environment.runtime = "browser";
  assert.ok(compatibility(other, second).length);
});
