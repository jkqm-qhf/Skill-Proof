import { Worker } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { adapterBinding } from "../src/executions.ts";
import type { Execution } from "../src/executions.ts";
import type { SkillProfile } from "../src/profiles.ts";
import type { FixtureManifest } from "../src/benchmark.ts";
import { scoreExtraction, sha256 } from "../src/benchmark.ts";
import { EXECUTION_LIMITS, ExecutionLimitError } from "../src/limits.ts";
import { GRADER_VERSION } from "../src/reports.ts";
import pdfPackage from "pdfjs-dist/package.json" with { type: "json" };

export function extractInNodeWorker(
  data: Uint8Array,
  signal: AbortSignal,
  timeoutMs: number = EXECUTION_LIMITS.timeoutMs,
): Promise<string[]> {
  signal.throwIfAborted();
  if (data.byteLength > EXECUTION_LIMITS.maxInputBytes)
    return Promise.reject(new ExecutionLimitError("Input limit exceeded"));
  return new Promise((resolve, reject) => {
    const copy = new Uint8Array(data);
    const worker = new Worker(new URL("./extract.worker.ts", import.meta.url), {
      workerData: copy.buffer,
      transferList: [copy.buffer],
      execArgv: ["--experimental-strip-types"],
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
    let settled = false;
    const finish = (error?: Error, pages?: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      void worker.terminate().catch(() => {});
      if (error) reject(error);
      else resolve(pages!);
    };
    const abort = () =>
      finish(new DOMException("Task cancelled", "AbortError"));
    const timer = setTimeout(
      () => finish(new ExecutionLimitError("Worker execution timeout")),
      timeoutMs,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.on("message", (message) => {
      if (message.error) {
        const error = new Error(message.error);
        error.name = message.name;
        finish(error);
      } else if (
        Array.isArray(message.pages) &&
        message.pages.every((page: unknown) => typeof page === "string")
      )
        finish(undefined, message.pages);
      else finish(new Error("Invalid worker result"));
    });
    worker.on("error", (error) => finish(error));
    worker.on("exit", () => {
      if (!settled) finish(new Error("Worker exited without a result"));
    });
  });
}

export async function runNodeBenchmark(
  profile: SkillProfile,
  revisionNumber: number,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<Execution> {
  const revision = profile.revisions.find(
    (item) => item.version === revisionNumber,
  );
  if (!revision || adapterBinding(revision.source) !== "pdfjs-text")
    throw new Error("Unsupported profile adapter binding");
  if (
    (await sha256(new TextEncoder().encode(revision.source))) !==
    revision.textSha256
  )
    throw new Error("Profile content hash mismatch");
  const root = new URL("../public/fixtures/pdf-text-v1/", import.meta.url);
  const manifestBytes = new Uint8Array(
    await readFile(new URL("manifest.json", root)),
  );
  const manifestText = new TextDecoder().decode(manifestBytes);
  const manifest: FixtureManifest = JSON.parse(manifestText);
  const results: Execution["results"] = [];
  const started = performance.now();
  for (const fixture of manifest.cases) {
    signal.throwIfAborted();
    progress(fixture.id);
    if (!/^[a-z0-9-]+\.pdf$/.test(fixture.file))
      throw new Error("Invalid fixture path");
    const bytes = new Uint8Array(await readFile(new URL(fixture.file, root)));
    const inputSha256 = await sha256(bytes);
    if (inputSha256 !== fixture.sha256)
      throw new Error("Fixture hash mismatch");
    const start = performance.now();
    let output: { pages?: string[]; error?: string };
    try {
      output = { pages: await extractInNodeWorker(bytes, signal) };
    } catch (cause) {
      if (
        signal.aborted ||
        cause instanceof ExecutionLimitError ||
        !(cause instanceof Error) ||
        cause.name !== "InvalidPDFException"
      )
        throw cause;
      output = { error: cause.message };
    }
    results.push({
      id: fixture.id,
      title: fixture.title,
      inputSha256,
      outputSha256: await sha256(
        new TextEncoder().encode(JSON.stringify(output)),
      ),
      ...output,
      ...scoreExtraction(fixture, output),
      durationMs: performance.now() - start,
      expect: fixture.expect,
    });
  }
  signal.throwIfAborted();
  return {
    id: crypto.randomUUID(),
    mode: "executed",
    createdAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      version: revisionNumber,
      name: revision.name,
      textSha256: revision.textSha256,
    },
    adapter: { id: "pdfjs-text", version: pdfPackage.version },
    suite: {
      id: manifest.id,
      version: manifest.version,
      manifestSha256: await sha256(manifestBytes),
    },
    durationMs: performance.now() - started,
    results,
    evidence: {
      profileSource: revision.source,
      manifestText,
      graderVersion: GRADER_VERSION,
      model: null,
      modelReason: "Deterministic adapter; no model call",
      environment: {
        runtime: `node-worker/${process.versions.node}`,
        userAgent: `Node ${process.version}`,
        platform: `${process.platform}/${process.arch}`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      limits: { ...EXECUTION_LIMITS },
    },
  };
}
