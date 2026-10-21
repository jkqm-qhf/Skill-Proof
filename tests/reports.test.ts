import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sha256, scoreExtraction } from "../src/benchmark.ts";
import { extractPdfText, ADAPTER_VERSION } from "../src/pdf-adapter.ts";
import { PDF_SKILL_SOURCE } from "../src/executions.ts";
import type { Execution } from "../src/executions.ts";
import {
  buildExecutionReport,
  verifyExecutionEvidence,
  GRADER_VERSION,
} from "../src/reports.ts";
import { EXECUTION_LIMITS } from "../src/limits.ts";

test("complete measured evidence verifies and tampering is rejected", async () => {
  const root = new URL("../public/fixtures/pdf-text-v1/", import.meta.url);
  const manifestText = await readFile(new URL("manifest.json", root), "utf8");
  const manifest = JSON.parse(manifestText);
  const results = [];
  for (const fixture of manifest.cases) {
    const bytes = new Uint8Array(await readFile(new URL(fixture.file, root)));
    let output;
    try {
      output = { pages: await extractPdfText(bytes) };
    } catch (cause) {
      output = { error: (cause as Error).message };
    }
    results.push({
      id: fixture.id,
      title: fixture.title,
      inputSha256: fixture.sha256,
      outputSha256: await sha256(
        new TextEncoder().encode(JSON.stringify(output)),
      ),
      ...output,
      ...scoreExtraction(fixture, output),
      durationMs: 1,
      expect: fixture.expect,
    });
  }
  const execution: Execution = {
    id: "evidence-test",
    mode: "executed",
    createdAt: new Date().toISOString(),
    profile: {
      id: "profile",
      version: 1,
      name: "pdf-text-extract",
      textSha256: await sha256(new TextEncoder().encode(PDF_SKILL_SOURCE)),
    },
    adapter: { id: "pdfjs-text", version: ADAPTER_VERSION },
    suite: {
      id: manifest.id,
      version: manifest.version,
      manifestSha256: await sha256(new TextEncoder().encode(manifestText)),
    },
    durationMs: 10,
    results,
    evidence: {
      profileSource: PDF_SKILL_SOURCE,
      manifestText,
      graderVersion: GRADER_VERSION,
      model: null,
      modelReason: "No model",
      environment: {
        runtime: "node-test",
        userAgent: "node",
        platform: process.platform,
        timeZone: "UTC",
      },
      limits: { ...EXECUTION_LIMITS },
    },
  };
  assert.equal(
    (await buildExecutionReport(execution)).type,
    "skillproof-execution-report",
  );
  const tampered = structuredClone(execution);
  tampered.results[0].pages![0] = "fabricated";
  await assert.rejects(verifyExecutionEvidence(tampered), /输出/);
  const falseGrade = structuredClone(execution);
  falseGrade.results[0].passed = false;
  await assert.rejects(verifyExecutionEvidence(falseGrade), /评分/);
  const legacy = { ...execution };
  delete legacy.evidence;
  await assert.rejects(buildExecutionReport(legacy), /旧记录/);
});
