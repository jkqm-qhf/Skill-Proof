import assert from "node:assert/strict";
import test from "node:test";
import { skills, suites } from "../src/data.ts";
import { filterSkills, parseIds, parseRuns, summarize } from "../src/lib.ts";

test("aggregate rates are calculated from case counts, not averaged percentages", () => {
  const result = summarize({
    ...skills[0],
    cases: [
      { name: "small", passed: 1, total: 1, seconds: 0.1 },
      { name: "large", passed: 1, total: 9, seconds: 0.2 },
    ],
  });
  assert.deepEqual(result, { passed: 2, total: 10, duration: 0.3, rate: 20 });
  assert.equal(summarize({ ...skills[0], cases: [] }).rate, 0);
});

test("search, category and favorites combine without mutating the source", () => {
  const ids = skills.map((skill) => skill.id);
  assert.equal(
    filterSkills(skills, "  pDf  ", "PDF 处理", "default").length,
    1,
  );
  assert.equal(
    filterSkills(skills, "中英文", "PDF 处理", "default")[0].id,
    "scan-lens",
  );
  assert.equal(filterSkills(skills, "", "全部技能", "default", []).length, 0);
  assert.equal(
    filterSkills(skills, "", "全部技能", "default", ["cite-check"])[0].id,
    "cite-check",
  );
  const byRate = filterSkills(skills, "", "全部技能", "rate");
  assert.ok(summarize(byRate[0]).rate >= summarize(byRate.at(-1)!).rate);
  assert.deepEqual(
    skills.map((skill) => skill.id),
    ids,
  );
});

test("stored records reject corrupted data, invalid metrics and incompatible suites", () => {
  const valid = {
    id: "test",
    skillId: "pdf-reader",
    suiteId: "pdf-core",
    createdAt: "2026-10-21T10:00:00.000Z",
    passed: 44,
    total: 48,
    duration: 11.2,
    mode: "demo",
  };
  assert.equal(parseRuns(JSON.stringify([valid]), skills).length, 1);
  assert.equal(
    parseRuns(
      JSON.stringify([
        null,
        {},
        { ...valid, suiteId: "table-core" },
        { ...valid, passed: 99 },
        { ...valid, total: -1 },
        { ...valid, duration: "1" },
        { ...valid, mode: "real" },
      ]),
      skills,
    ).length,
    0,
  );
  assert.deepEqual(parseRuns("broken json", skills), []);
  assert.deepEqual(parseRuns("{}", skills), []);
  assert.equal(
    parseRuns(JSON.stringify(Array(110).fill(valid)), skills).length,
    100,
  );
  assert.deepEqual(
    parseIds('["pdf-reader","unknown","pdf-reader",false]', skills),
    ["pdf-reader"],
  );
});

test("every fixture has valid counts and an applicable benchmark", () => {
  for (const skill of skills) {
    const suite = suites.find((item) => item.id === skill.suiteId);
    assert.ok(suite?.categories.includes(skill.category));
    assert.ok(
      skill.cases.every(
        (item) =>
          item.total > 0 &&
          item.passed >= 0 &&
          item.passed <= item.total &&
          item.seconds >= 0,
      ),
    );
  }
});
