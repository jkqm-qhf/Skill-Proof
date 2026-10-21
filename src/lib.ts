import type { Category, Run, Skill } from "./types.ts";

export function summarize(skill: Skill) {
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
          !!skill &&
          run.suiteId === skill.suiteId &&
          run.mode === "demo" &&
          typeof run.createdAt === "string" &&
          Number.isFinite(Date.parse(run.createdAt)) &&
          Number.isInteger(run.passed) &&
          Number.isInteger(run.total) &&
          run.total > 0 &&
          run.passed >= 0 &&
          run.passed <= run.total &&
          Number.isFinite(run.duration) &&
          run.duration >= 0
        );
      })
      .slice(0, 100);
  } catch {
    return [];
  }
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
