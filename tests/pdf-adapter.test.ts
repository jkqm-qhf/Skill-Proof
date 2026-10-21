import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractPdfText } from "../src/pdf-adapter.ts";
import { scoreExtraction } from "../src/benchmark.ts";
import type { FixtureManifest } from "../src/benchmark.ts";

test("the registered PDF adapter actually extracts every valid fixture and rejects invalid bytes", async () => {
  const root = new URL("../public/fixtures/pdf-text-v1/", import.meta.url);
  const manifest: FixtureManifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  for (const fixture of manifest.cases) {
    const bytes = new Uint8Array(await readFile(new URL(fixture.file, root)));
    if (fixture.expect.error) await assert.rejects(extractPdfText(bytes));
    else assert.equal(scoreExtraction(fixture, { pages: await extractPdfText(bytes) }).passed, true, fixture.id);
  }
});
