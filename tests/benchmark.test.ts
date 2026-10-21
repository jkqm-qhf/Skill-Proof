import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { scoreExtraction } from "../src/benchmark.ts";
import type { FixtureManifest } from "../src/benchmark.ts";

test("versioned fixture bytes match the published manifest", async () => {
  const root = new URL("../public/fixtures/pdf-text-v1/", import.meta.url);
  const manifest: FixtureManifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.cases.length, 5);
  for (const fixture of manifest.cases) {
    const bytes = await readFile(new URL(fixture.file, root));
    assert.equal(bytes.length, fixture.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.sha256);
    if (!fixture.expect.error) assert.ok(bytes.toString().startsWith("%PDF-1.4"));
    assert.equal(scoreExtraction(fixture, fixture.expect.error ? { error: "Invalid PDF" } : { pages: fixture.expect.pages }).passed, true);
  }
  assert.equal(scoreExtraction(manifest.cases[1], { pages: [...manifest.cases[1].expect.pages!].reverse() }).passed, false);
  assert.equal(scoreExtraction(manifest.cases[2], { pages: ["Text after a blank page."] }).passed, false);
  assert.equal(scoreExtraction(manifest.cases[4], { pages: [] }).passed, false);
});
