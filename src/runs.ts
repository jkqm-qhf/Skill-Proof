import { summarize } from "./lib.ts";
import type { Run, Skill, Suite } from "./types.ts";

export function createDemoRun(
  skill: Skill,
  suite: Suite,
  metadata: Pick<Run, "id" | "createdAt">,
): Run {
  if (
    skill.suiteId !== suite.id ||
    !suite.categories.includes(skill.category)
  ) {
    throw new Error("The selected benchmark is incompatible with this skill.");
  }
  const { passed, total, duration } = summarize(skill);
  return {
    ...metadata,
    skillId: skill.id,
    suiteId: suite.id,
    passed,
    total,
    duration,
    mode: "demo",
    snapshot: {
      skillName: skill.name,
      skillVersion: skill.version,
      suiteName: suite.name,
      suiteVersion: suite.version,
      environment: skill.environment,
      cases: skill.cases.map((item) => ({ ...item })),
    },
  };
}

export function getRunLabels(run: Run, skills: Skill[], suites: Suite[]) {
  return {
    skillName:
      run.snapshot?.skillName ??
      skills.find((s) => s.id === run.skillId)?.name ??
      run.skillId,
    suiteName:
      run.snapshot?.suiteName ??
      suites.find((s) => s.id === run.suiteId)?.name ??
      run.suiteId,
  };
}

export function filterRuns(
  runs: Run[],
  skills: Skill[],
  suites: Suite[],
  query: string,
  suiteId: string,
  order: "newest" | "oldest",
) {
  const search = query.trim().toLocaleLowerCase();
  return runs
    .filter((run) => {
      const labels = getRunLabels(run, skills, suites);
      return (
        (!suiteId || run.suiteId === suiteId) &&
        [
          run.id,
          run.skillId,
          labels.skillName,
          labels.suiteName,
          run.snapshot?.skillVersion ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search)
      );
    })
    .sort((a, b) =>
      order === "oldest"
        ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
        : Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
}

// Do not rebuild missing historical evidence from today's mutable skill fixtures.
export function buildRunReport(run: Run) {
  return {
    schemaVersion: "0.2.0",
    mode: "demo",
    disclaimer: "Fictional fixture data. No skill or model was executed.",
    evidenceStatus: run.snapshot ? "demo-snapshot" : "summary-only",
    run,
  };
}
