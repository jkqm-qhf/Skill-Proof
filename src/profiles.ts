import { inspectSkillDocument } from "./inspector.ts";
import type { SkillInspection } from "./inspector.ts";

export interface ProfileRevision {
  version: number;
  createdAt: string;
  name: string;
  description: string;
  source: string;
  textSha256: string;
  claims: string[];
  environment: string;
  permissions: string[];
}
export interface SkillProfile {
  id: string;
  revisions: ProfileRevision[];
}
export const PROFILE_KEY = "skillproof:profiles";

export function parseProfiles(text: string | null): SkillProfile[] {
  try {
    const data: unknown = JSON.parse(text ?? "[]");
    if (!Array.isArray(data)) return [];
    const ids = new Set<string>();
    return data.filter((item): item is SkillProfile => {
      if (
        !item ||
        typeof item.id !== "string" ||
        !item.id ||
        ids.has(item.id) ||
        !Array.isArray(item.revisions) ||
        !item.revisions.length
      )
        return false;
      if (
        !item.revisions.every(
          (rev: ProfileRevision, index: number) =>
            rev &&
            rev.version === index + 1 &&
            typeof rev.createdAt === "string" &&
            Number.isFinite(Date.parse(rev.createdAt)) &&
            [rev.name, rev.description, rev.source, rev.environment].every(
              (value) => typeof value === "string",
            ) &&
            rev.name.trim() &&
            rev.description.trim() &&
            rev.source.length <= 262144 &&
            typeof rev.textSha256 === "string" &&
            /^[a-f0-9]{64}$/.test(rev.textSha256) &&
            [rev.claims, rev.permissions].every(
              (values) =>
                Array.isArray(values) &&
                values.every((value) => typeof value === "string"),
            ),
        )
      )
        return false;
      ids.add(item.id);
      return true;
    });
  } catch {
    return [];
  }
}

export async function reviseProfile(
  existing: SkillProfile | undefined,
  source: string,
  declaration: { claims: string[]; environment: string; permissions: string[] },
  id = crypto.randomUUID(),
): Promise<{ profile: SkillProfile; inspection: SkillInspection }> {
  const inspection = await inspectSkillDocument(source, "SKILL.md", "paste");
  if (
    !inspection.summary.formatValid ||
    !inspection.metadata.name ||
    !inspection.metadata.description
  )
    throw new Error("请先修复 SKILL.md 的基础格式，再保存档案。");
  const revision: ProfileRevision = {
    version: (existing?.revisions.length ?? 0) + 1,
    createdAt: new Date().toISOString(),
    name: inspection.metadata.name,
    description: inspection.metadata.description,
    source,
    textSha256: inspection.source.textSha256,
    claims: declaration.claims.map((value) => value.trim()).filter(Boolean),
    environment: declaration.environment.trim(),
    permissions: declaration.permissions
      .map((value) => value.trim())
      .filter(Boolean),
  };
  const prior = existing?.revisions.at(-1);
  if (
    prior &&
    prior.textSha256 === revision.textSha256 &&
    prior.environment === revision.environment &&
    JSON.stringify(prior.claims) === JSON.stringify(revision.claims) &&
    JSON.stringify(prior.permissions) === JSON.stringify(revision.permissions)
  )
    throw new Error("内容与当前版本相同，无需创建新版本。");
  return {
    profile: {
      id: existing?.id ?? id,
      revisions: [...(existing?.revisions ?? []), revision],
    },
    inspection,
  };
}

export function persistProfiles(profiles: SkillProfile[]) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
}
