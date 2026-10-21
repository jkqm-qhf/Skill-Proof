import type { Category, Run, RunSnapshot, Skill } from "./types.ts";

export function summarize(skill: Pick<Skill, "cases">) {
  const passed = skill.cases.reduce((sum, item) => sum + item.passed, 0);
  const total = skill.cases.reduce((sum, item) => sum + item.total, 0);
  const duration = skill.cases.reduce((sum, item) => sum + item.seconds, 0);
  return {
    passed,
    total,
    duration: Number(duration.toFixed(1)),
    rate: total ? (passed / total) * 100 : 0,
  };
}

export function filterSkills(
  skills: Skill[],
  query: string,
  category: Category,
  sort: string,
  favorites?: string[],
) {
  const search = query.trim().toLocaleLowerCase();
  return skills
    .filter(
      (skill) =>
        (category === "全部技能" || skill.category === category) &&
        (!favorites || favorites.includes(skill.id)) &&
        [skill.name, skill.subtitle, skill.description, ...skill.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search),
    )
    .sort((a, b) =>
      sort === "rate"
        ? summarize(b).rate - summarize(a).rate
        : sort === "speed"
          ? summarize(a).duration - summarize(b).duration
          : 0,
    );
}

export function parseRuns(value: string | null, skills: Skill[]): Run[] {
  if (!value) return [];
  try {
    const data: unknown = JSON.parse(value);
    if (!Array.isArray(data)) return [];
    return data
      .filter((item): item is Run => {
        if (!item || typeof item !== "object") return false;
        const run = item as Run;
        const skill = skills.find((s) => s.id === run.skillId);
        return (
          typeof run.id === "string" &&
          run.id.trim().length > 0 &&
          typeof run.skillId === "string" &&
          run.skillId.trim().length > 0 &&
          typeof run.suiteId === "string" &&
          run.suiteId.trim().length > 0 &&
          ((!!skill && run.suiteId === skill.suiteId) ||
            isRunSnapshot(run.snapshot, run)) &&
          run.mode === "demo" &&
          typeof run.createdAt === "string" &&
          Number.isFinite(Date.parse(run.createdAt)) &&
          Number.isSafeInteger(run.passed) &&
          Number.isSafeInteger(run.total) &&
          run.total > 0 &&
          run.passed >= 0 &&
          run.passed <= run.total &&
          Number.isFinite(run.duration) &&
          run.duration >= 0
        );
      })
      .slice(0, 100)
      .map((run) => ({
        id: run.id,
        skillId: run.skillId,
        suiteId: run.suiteId,
        createdAt: run.createdAt,
        passed: run.passed,
        total: run.total,
        duration: run.duration,
        mode: "demo",
        ...(isRunSnapshot(run.snapshot, run) ? { snapshot: run.snapshot } : {}),
      }));
  } catch {
    return [];
  }
}

function isRunSnapshot(value: unknown, run: Run): value is RunSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as RunSnapshot;
  if (
    ![
      snapshot.skillName,
      snapshot.skillVersion,
      snapshot.suiteName,
      snapshot.suiteVersion,
      snapshot.environment,
    ].every((field) => typeof field === "string" && field.trim().length > 0)
  )
    return false;
  if (
    !Array.isArray(snapshot.cases) ||
    snapshot.cases.length === 0 ||
    !snapshot.cases.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        Number.isSafeInteger(item.passed) &&
        Number.isSafeInteger(item.total) &&
        item.total > 0 &&
        item.passed >= 0 &&
        item.passed <= item.total &&
        Number.isFinite(item.seconds) &&
        item.seconds >= 0,
    )
  )
    return false;
  const summary = summarize({ cases: snapshot.cases });
  return (
    summary.passed === run.passed &&
    summary.total === run.total &&
    summary.duration === run.duration
  );
}

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parseIds(value: string | null, skills: Skill[]): string[] {
  try {
    const data: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(data)
      ? [
          ...new Set(
            data.filter(
              (id): id is string =>
                typeof id === "string" && skills.some((s) => s.id === id),
            ),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}
