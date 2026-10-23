import type { Execution } from "./executions.ts";
import type { ProfileRevision, SkillProfile } from "./profiles.ts";

export function filterProfiles(profiles: SkillProfile[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return profiles.filter((profile) => {
    const latest = profile.revisions.at(-1)!;
    const text = `${latest.name}\n${latest.description}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function revisionExecutions(
  executions: Execution[],
  profileId: string,
  revision: ProfileRevision,
) {
  return executions
    .filter(
      (item) =>
        item.mode === "executed" &&
        item.profile.id === profileId &&
        item.profile.version === revision.version &&
        item.profile.textSha256 === revision.textSha256,
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
