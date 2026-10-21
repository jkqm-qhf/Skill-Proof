import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  inspectSkillDocument,
  MAX_SKILL_BYTES,
  SAMPLE_SKILL,
} from "../src/inspector.ts";

test("valid skill produces real static results and a reproducible UTF-8 text hash", async () => {
  const result = await inspectSkillDocument(SAMPLE_SKILL, "SKILL.md", "sample");
  assert.equal(result.mode, "static");
  assert.equal(result.summary.formatValid, true);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.warnings, 0);
  assert.equal(result.metadata.name, "document-summary");
  assert.equal(result.source.inputKind, "sample");
  assert.equal(
    result.source.textSha256,
    createHash("sha256").update(SAMPLE_SKILL, "utf8").digest("hex"),
  );
  assert.equal(result.resources[0].target, "references/summary-format.md");
  assert.equal(result.resources[0].kind, "local");
  assert.equal(result.checks.find((check) => check.id === "name")?.line, 2);
});

test("YAML block strings, Unicode, BOM and CRLF work without changing the hash input", async () => {
  const text =
    "\uFEFF---\r\nname: 中文技能\r\ndescription: >-\r\n  读取文档。\r\n  整理摘要。\r\n---\r\n\r\n# 正文\r\n处理文档。";
  const result = await inspectSkillDocument(text);
  assert.equal(result.summary.formatValid, true);
  assert.equal(result.metadata.name, "中文技能");
  assert.equal(result.metadata.description, "读取文档。 整理摘要。");
  assert.equal(
    result.source.textSha256,
    createHash("sha256").update(text).digest("hex"),
  );
  assert.ok(result.summary.warnings > 0);
});

test("bad frontmatter, duplicate keys, invalid types and empty instructions fail required checks", async () => {
  for (const text of [
    "# Missing YAML",
    "---\nname: test\n# Not closed",
    "---\nname: a\nname: b\ndescription: desc\n---\nBody",
    "---\n- list\n---\nBody",
    "---\nname: [a]\ndescription: true\n---\nBody",
    "---\nname: a\ndescription: desc\n---\n  ",
  ]) {
    const result = await inspectSkillDocument(text);
    assert.equal(result.summary.formatValid, false);
    assert.ok(result.summary.errors > 0);
  }
  const broken = await inspectSkillDocument(
    "---\nname: [\ndescription: desc\n---\nBody",
  );
  assert.equal(
    broken.checks.find((check) => check.id === "yaml")?.status,
    "error",
  );
  assert.equal(
    broken.checks.find((check) => check.id === "name")?.status,
    "skipped",
  );
});

test("advice is distinct from errors; examples in fences do not count as document structure", async () => {
  const text =
    "---\nname: test\ndescription: desc\n---\nInstructions.\n```md\n## Inputs\n## Outputs\n1. A fake step.\n[hidden](secret.md)\n```\n~~~\n[hidden-two](other.md)\n~~~\n";
  const result = await inspectSkillDocument(text, "other.md");
  assert.equal(result.summary.formatValid, true);
  assert.equal(result.summary.errors, 0);
  assert.equal(
    result.checks.find((check) => check.id === "sections")?.status,
    "warning",
  );
  assert.equal(
    result.checks.find((check) => check.id === "steps")?.status,
    "warning",
  );
  assert.equal(
    result.checks.find((check) => check.id === "filename")?.status,
    "warning",
  );
  assert.deepEqual(result.resources, []);
});

test("links are inventoried as inert text, deduplicated, and never fetched", async () => {
  const text =
    "---\nname: links\ndescription: desc\n---\n[Local](references/a.md)\n[Web](https://example.com)\n[Anchor](#section)\n[Unsafe](javascript:alert)\n[Again](references/a.md)\n[ref]: assets/template.docx\n`[inline-code](ignore.md)`";
  const result = await inspectSkillDocument(text);
  assert.deepEqual(
    result.resources.map((item) => item.kind),
    ["local", "external", "anchor", "other", "local"],
  );
  assert.equal(result.resources.length, 5);
  assert.equal(result.resources[0].line, 5);
  assert.ok(result.resources.every((item) => item.target !== "ignore.md"));
});

test("oversized or binary-like text is rejected and edits change the content fingerprint", async () => {
  await assert.rejects(
    inspectSkillDocument("a".repeat(MAX_SKILL_BYTES + 1)),
    /256 KB/,
  );
  await assert.rejects(inspectSkillDocument("\u0000binary"), /空字符/);
  const first = await inspectSkillDocument(SAMPLE_SKILL);
  const second = await inspectSkillDocument(SAMPLE_SKILL + "\n");
  assert.notEqual(first.source.textSha256, second.source.textSha256);
});

test("excessive YAML alias expansion is reported as a format error", async () => {
  const result = await inspectSkillDocument(
    "---\nname: test\ndescription: desc\na: &a [x, x, x, x, x]\nb: &b [*a, *a, *a, *a, *a]\nc: [*b, *b, *b, *b, *b]\n---\nBody",
  );
  assert.equal(result.summary.formatValid, false);
  assert.equal(
    result.checks.find((check) => check.id === "yaml")?.status,
    "error",
  );
  assert.equal(result.metadata.name, null);
});
