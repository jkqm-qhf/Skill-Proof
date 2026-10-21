import { scoreExtraction, sha256 } from "./benchmark.ts";
import type { FixtureManifest } from "./benchmark.ts";
import type { Execution } from "./executions.ts";
export const GRADER_VERSION = "pdf-text-exact-pages@1.0.0";
export interface ExecutionEvidence {
  profileSource: string;
  manifestText: string;
  graderVersion: string;
  model: null;
  modelReason: string;
  environment: {
    runtime: string;
    userAgent: string;
    platform: string;
    timeZone: string;
  };
  limits: {
    maxInputBytes: number;
    maxPages: number;
    maxOutputBytes: number;
    timeoutMs: number;
  };
}
export async function verifyExecutionEvidence(execution: Execution) {
  const evidence = execution.evidence;
  if (!evidence)
    throw new Error("旧记录缺少完整证据，无法生成可复现报告。请重新运行基准。");
  if (
    (await sha256(new TextEncoder().encode(evidence.profileSource))) !==
    execution.profile.textSha256
  )
    throw new Error("档案原文哈希不匹配");
  if (
    (await sha256(new TextEncoder().encode(evidence.manifestText))) !==
    execution.suite.manifestSha256
  )
    throw new Error("测试清单哈希不匹配");
  if (evidence.graderVersion !== GRADER_VERSION)
    throw new Error("不支持此评分规则版本");
  const manifest: FixtureManifest = JSON.parse(evidence.manifestText);
  if (
    manifest.id !== execution.suite.id ||
    manifest.version !== execution.suite.version ||
    manifest.cases.length !== execution.results.length
  )
    throw new Error("测试范围与报告不一致");
  for (const fixture of manifest.cases) {
    const result = execution.results.find((item) => item.id === fixture.id);
    if (!result || result.inputSha256 !== fixture.sha256)
      throw new Error("测试输入哈希不一致");
    const output = {
      ...(result.pages ? { pages: result.pages } : {}),
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
    if (
      (await sha256(new TextEncoder().encode(JSON.stringify(output)))) !==
      result.outputSha256
    )
      throw new Error("测试输出哈希不一致");
    if (scoreExtraction(fixture, result).passed !== result.passed)
      throw new Error("评分结果与证据不一致");
  }
  return manifest;
}
export async function buildExecutionReport(execution: Execution) {
  await verifyExecutionEvidence(execution);
  return {
    type: "skillproof-execution-report",
    schemaVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    provenance:
      "Locally measured registered-adapter execution; not independent certification.",
    reproduction:
      "node --experimental-strip-types scripts/reproduce.mjs <report.json>",
    execution,
  };
}
