import { buildExecutionReport } from "./reports.ts";
import type { Execution } from "./executions.ts";
export interface Publication {
  id: string;
  createdAt: string;
  executionId: string;
  publisher: { name: string; verified: false };
  provenance: "server-worker" | "browser-import";
  summary: {
    name: string;
    version: number;
    textSha256: string;
    adapter: Execution["adapter"];
    suite: Execution["suite"];
    passed: number;
    total: number;
    results: {
      id: string;
      title: string;
      passed: boolean;
      inputSha256: string;
      outputSha256: string;
    }[];
  };
  fullReport?: Awaited<ReturnType<typeof buildExecutionReport>>;
  revoked?: boolean;
}
export interface Feedback {
  id: string;
  shareId: string;
  name: string;
  message: string;
  createdAt: string;
  identityVerified: false;
}
export async function createPublication(
  execution: Execution,
  provenance: Publication["provenance"],
  publisher: string,
  fullEvidence: boolean,
  id: string,
): Promise<Publication> {
  if (!publisher.trim() || publisher.trim().length > 80)
    throw new Error("发布者显示名应为 1–80 字符");
  const report = await buildExecutionReport(execution);
  return {
    id,
    createdAt: new Date().toISOString(),
    executionId: execution.id,
    publisher: { name: publisher.trim(), verified: false },
    provenance,
    summary: {
      name: execution.profile.name,
      version: execution.profile.version,
      textSha256: execution.profile.textSha256,
      adapter: execution.adapter,
      suite: execution.suite,
      passed: execution.results.filter((item) => item.passed).length,
      total: execution.results.length,
      results: execution.results.map((item) => ({
        id: item.id,
        title: item.title,
        passed: item.passed,
        inputSha256: item.inputSha256,
        outputSha256: item.outputSha256,
      })),
    },
    ...(fullEvidence ? { fullReport: report } : {}),
  };
}
