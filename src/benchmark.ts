export interface FixtureCase {
  id: string;
  title: string;
  file: string;
  sha256: string;
  bytes: number;
  expect: { pages: string[]; error?: never } | { error: true; pages?: never };
}
export interface FixtureManifest {
  id: string;
  version: string;
  title: string;
  scope: string;
  license: string;
  scoring: string;
  cases: FixtureCase[];
}
export const FIXTURE_ROOT = "/fixtures/pdf-text-v1/";
export function normalizeText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}
export function scoreExtraction(
  fixture: FixtureCase,
  actual: { pages?: string[]; error?: string },
) {
  if (fixture.expect.error)
    return {
      passed: !!actual.error,
      reason: actual.error ? "按预期拒绝损坏输入" : "损坏输入没有报错",
    };
  if (actual.error)
    return { passed: false, reason: `提取失败：${actual.error}` };
  if (!actual.pages || fixture.expect.pages.length !== actual.pages.length)
    return { passed: false, reason: "页数不匹配" };
  const mismatches = fixture.expect.pages
    .map((text, index) =>
      normalizeText(text) === normalizeText(actual.pages![index])
        ? null
        : index + 1,
    )
    .filter(Boolean);
  return {
    passed: !mismatches.length,
    reason: mismatches.length
      ? `第 ${mismatches.join("、")} 页文字或顺序不匹配`
      : "页数、顺序和规范化文本一致",
  };
}
export async function sha256(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
