import { parseDocument } from "yaml";
import { FIXTURE_ROOT, scoreExtraction, sha256 } from "./benchmark.ts";
import type { FixtureCase, FixtureManifest } from "./benchmark.ts";
import type { SkillProfile } from "./profiles.ts";

export const EXECUTION_KEY = "skillproof:executions";
export const PDF_SKILL_SOURCE = `---
name: pdf-text-extract
description: Extract page text from English digital PDFs using SkillProof's registered pdfjs-text adapter. Not for OCR or complex layouts.
metadata:
  skillproof:
    adapter: pdfjs-text
---

# PDF text extraction

## Inputs
- A digital PDF from the versioned SkillProof benchmark.

## Workflow
1. Run the registered pdfjs-text adapter, with its pinned PDF.js version.
2. Preserve blank pages and page order.
3. Return errors for invalid PDFs; do not invent missing text.

## Outputs
- Plain text grouped by page.
- Extraction errors and measured execution time.
`;
export interface ExecutionCase {
  id: string;
  title: string;
  inputSha256: string;
  outputSha256: string;
  passed: boolean;
  reason: string;
  pages?: string[];
  error?: string;
  durationMs: number;
  expect: FixtureCase["expect"];
}
export interface Execution {
  id: string;
  mode: "executed";
  createdAt: string;
  profile: { id: string; version: number; name: string; textSha256: string };
  adapter: { id: "pdfjs-text"; version: string };
  suite: { id: string; version: string; manifestSha256: string };
  durationMs: number;
  results: ExecutionCase[];
}
export function adapterBinding(source: string) {
  const lines = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const end = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  if (lines[0] !== "---" || end < 1) return null;
  try {
    const doc = parseDocument(lines.slice(1, end).join("\n"));
    return doc.getIn(["metadata", "skillproof", "adapter"]) === "pdfjs-text"
      ? "pdfjs-text"
      : null;
  } catch {
    return null;
  }
}
export function parseExecutions(text: string | null): Execution[] {
  try {
    const data = JSON.parse(text ?? "[]");
    return Array.isArray(data)
      ? data
          .filter(
            (item) =>
              item?.mode === "executed" &&
              typeof item.id === "string" &&
              item.profile?.textSha256 &&
              item.adapter?.id === "pdfjs-text" &&
              item.suite?.manifestSha256 &&
              Array.isArray(item.results) &&
              item.results.length &&
              item.results.every(
                (result: ExecutionCase) =>
                  typeof result.id === "string" &&
                  typeof result.passed === "boolean" &&
                  typeof result.reason === "string" &&
                  typeof result.inputSha256 === "string" &&
                  typeof result.outputSha256 === "string" &&
                  Number.isFinite(result.durationMs) &&
                  result.durationMs >= 0,
              ),
          )
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
export async function runBenchmark(
  profile: SkillProfile,
  version: number,
  extract: (data: Uint8Array) => Promise<string[]>,
  adapterVersion: string,
  progress: (message: string) => void,
): Promise<Execution> {
  const revision = profile.revisions.find((item) => item.version === version);
  if (!revision || adapterBinding(revision.source) !== "pdfjs-text")
    throw new Error("此档案版本没有绑定支持的 pdfjs-text 适配器。");
  if (
    (await sha256(new TextEncoder().encode(revision.source))) !==
    revision.textSha256
  )
    throw new Error("技能原文与保存的哈希不一致，拒绝执行。");
  const response = await fetch(`${FIXTURE_ROOT}manifest.json`);
  if (!response.ok) throw new Error("测试清单加载失败");
  const manifestBytes = new Uint8Array(await response.arrayBuffer());
  const manifest: FixtureManifest = JSON.parse(
    new TextDecoder().decode(manifestBytes),
  );
  const results: ExecutionCase[] = [];
  const started = performance.now();
  for (const fixture of manifest.cases) {
    progress(`正在提取：${fixture.title}`);
    if (!/^[a-z0-9-]+\.pdf$/.test(fixture.file))
      throw new Error("测试文件路径无效");
    const file = await fetch(`${FIXTURE_ROOT}${fixture.file}`);
    if (!file.ok) throw new Error("测试文件加载失败");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inputSha256 = await sha256(bytes);
    if (inputSha256 !== fixture.sha256)
      throw new Error(`测试文件哈希不匹配：${fixture.id}`);
    const start = performance.now();
    let output: { pages?: string[]; error?: string };
    try {
      output = { pages: await extract(bytes) };
    } catch (cause) {
      output = {
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
    results.push({
      id: fixture.id,
      title: fixture.title,
      inputSha256,
      outputSha256: await sha256(
        new TextEncoder().encode(JSON.stringify(output)),
      ),
      ...scoreExtraction(fixture, output),
      ...output,
      durationMs: performance.now() - start,
      expect: fixture.expect,
    });
  }
  return {
    id: crypto.randomUUID(),
    mode: "executed",
    createdAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      name: revision.name,
      version,
      textSha256: revision.textSha256,
    },
    adapter: { id: "pdfjs-text", version: adapterVersion },
    suite: {
      id: manifest.id,
      version: manifest.version,
      manifestSha256: await sha256(manifestBytes),
    },
    durationMs: performance.now() - started,
    results,
  };
}
