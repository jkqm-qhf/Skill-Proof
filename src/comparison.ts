import type { Execution } from "./executions.ts";
import { verifyExecutionEvidence } from "./reports.ts";
export function compatibility(
  baseline: Execution,
  candidate: Execution,
): string[] {
  const reasons: string[] = [];
  if (!baseline.evidence || !candidate.evidence)
    return ["记录缺少完整的环境与评分证据"];
  if (
    baseline.suite.id !== candidate.suite.id ||
    baseline.suite.version !== candidate.suite.version ||
    baseline.suite.manifestSha256 !== candidate.suite.manifestSha256
  )
    reasons.push("测试集版本或文件清单不同");
  if (
    baseline.adapter.id !== candidate.adapter.id ||
    baseline.adapter.version !== candidate.adapter.version
  )
    reasons.push("执行器或依赖版本不同");
  if (baseline.evidence.graderVersion !== candidate.evidence.graderVersion)
    reasons.push("评分规则版本不同");
  const first = baseline.evidence.environment,
    second = candidate.evidence.environment;
  if (
    first.runtime !== second.runtime ||
    first.platform !== second.platform ||
    first.userAgent !== second.userAgent
  )
    reasons.push("执行环境标签不同");
  for (const key of [
    "maxInputBytes",
    "maxPages",
    "maxOutputBytes",
    "timeoutMs",
  ] as const)
    if (baseline.evidence.limits[key] !== candidate.evidence.limits[key]) {
      reasons.push("资源限制不同");
      break;
    }
  const ids = new Set(baseline.results.map((item) => item.id));
  if (
    ids.size !== baseline.results.length ||
    new Set(candidate.results.map((item) => item.id)).size !==
      candidate.results.length ||
    baseline.results.length !== candidate.results.length ||
    candidate.results.some(
      (item) =>
        !baseline.results.some(
          (prior) =>
            prior.id === item.id && prior.inputSha256 === item.inputSha256,
        ),
    )
  )
    reasons.push("逐项输入或用例范围不同");
  return reasons;
}
export function compareExecutions(baseline: Execution, candidate: Execution) {
  const reasons = compatibility(baseline, candidate);
  if (reasons.length) return { compatible: false as const, reasons, cases: [] };
  const cases = candidate.results.map((item) => {
    const prior = baseline.results.find((previous) => previous.id === item.id)!;
    const change =
      prior.passed && !item.passed
        ? "regressed"
        : !prior.passed && item.passed
          ? "improved"
          : prior.outputSha256 !== item.outputSha256
            ? "output-changed"
            : "unchanged";
    return {
      id: item.id,
      title: item.title,
      before: prior.passed,
      after: item.passed,
      change,
      beforeReason: prior.reason,
      afterReason: item.reason,
    };
  });
  return { compatible: true as const, reasons, cases };
}
export async function compareVerifiedExecutions(
  baseline: Execution,
  candidate: Execution,
) {
  await verifyExecutionEvidence(baseline);
  await verifyExecutionEvidence(candidate);
  return compareExecutions(baseline, candidate);
}
export function findRegressionBaseline(
  candidate: Execution,
  executions: Execution[],
) {
  return executions
    .filter(
      (item) =>
        item.profile.id === candidate.profile.id &&
        item.profile.version < candidate.profile.version &&
        !compatibility(item, candidate).length,
    )
    .sort(
      (a, b) =>
        b.profile.version - a.profile.version ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )[0];
}
