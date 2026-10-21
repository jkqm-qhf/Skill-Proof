import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { verifyExecutionEvidence } from "../src/reports.ts";
import { ADAPTER_VERSION, extractPdfText } from "../src/pdf-adapter.ts";
import { sha256, scoreExtraction } from "../src/benchmark.ts";

export async function reproduce(report) {
  if (
    report.type !== "skillproof-execution-report" ||
    report.schemaVersion !== "1.0.0"
  )
    throw new Error("Unsupported report format.");
  const execution = report.execution;
  if (
    execution.adapter.id !== "pdfjs-text" ||
    execution.adapter.version !== ADAPTER_VERSION
  )
    throw new Error(
      "Install the report's exact adapter version before reproducing.",
    );
  const manifest = await verifyExecutionEvidence(execution);
  if (manifest.id !== "pdf-text-baseline" || manifest.version !== "1.0.0")
    throw new Error("Unsupported fixture suite.");
  const root = new URL("../public/fixtures/pdf-text-v1/", import.meta.url);
  const localManifest = new Uint8Array(
    await readFile(new URL("manifest.json", root)),
  );
  if ((await sha256(localManifest)) !== execution.suite.manifestSha256)
    throw new Error("Repository fixture version does not match report.");
  const outcomes = [];
  for (const fixture of manifest.cases) {
    if (!/^[a-z0-9-]+\.pdf$/.test(fixture.file))
      throw new Error("Invalid fixture path.");
    const bytes = new Uint8Array(await readFile(new URL(fixture.file, root)));
    if ((await sha256(bytes)) !== fixture.sha256)
      throw new Error("Input bytes do not match report.");
    let actual;
    try {
      actual = { pages: await extractPdfText(bytes) };
    } catch (cause) {
      actual = { error: cause.message };
    }
    const outputSha256 = await sha256(
      new TextEncoder().encode(JSON.stringify(actual)),
    );
    const original = execution.results.find((item) => item.id === fixture.id);
    const matched =
      outputSha256 === original.outputSha256 &&
      scoreExtraction(fixture, actual).passed === original.passed;
    outcomes.push({ id: fixture.id, matched });
  }
  return {
    reproduced: outcomes.every((item) => item.matched),
    adapterVersion: ADAPTER_VERSION,
    outcomes,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const report = JSON.parse(await readFile(process.argv[2], "utf8"));
    const result = await reproduce(report);
    console.log(JSON.stringify(result, null, 2));
    if (!result.reproduced) process.exitCode = 1;
  } catch (cause) {
    console.error(cause.message);
    process.exitCode = 1;
  }
}
