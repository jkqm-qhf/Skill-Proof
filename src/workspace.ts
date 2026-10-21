import { parseRuns } from "./lib.ts";
import type { Run, Skill } from "./types.ts";

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const MAX_RUNS = 100;

export interface WorkspaceData {
  favorites: string[];
  runs: Run[];
}

export interface WorkspaceBackup extends WorkspaceData {
  format: "skillproof-workspace";
  version: 1;
  mode: "demo";
  exportedAt: string;
}

export interface ParsedBackup {
  backup: WorkspaceBackup;
  unknownFavorites: number;
}

export function createWorkspaceBackup(
  data: WorkspaceData,
  exportedAt = new Date().toISOString(),
): WorkspaceBackup {
  return {
    format: "skillproof-workspace",
    version: 1,
    mode: "demo",
    exportedAt,
    favorites: [...data.favorites],
    runs: structuredClone(data.runs),
  };
}

export function parseWorkspaceBackup(
  text: string,
  skills: Skill[],
): ParsedBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error("文件超过 2 MB，请选择较小的工作区备份。");
  }
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("文件不是有效的 JSON，未导入任何数据。");
  }
  if (!value || typeof value !== "object")
    throw new Error("这不是 SkillProof 工作区备份。");
  const data = value as Record<string, unknown>;
  if (
    data.format !== "skillproof-workspace" ||
    data.version !== 1 ||
    data.mode !== "demo"
  ) {
    throw new Error(
      "备份格式或版本不受支持。请选择通过“导出工作区备份”生成的文件。",
    );
  }
  if (
    typeof data.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(data.exportedAt))
  ) {
    throw new Error("备份时间无效，未导入任何数据。");
  }
  if (
    !Array.isArray(data.favorites) ||
    !data.favorites.every((id) => typeof id === "string" && id.trim())
  ) {
    throw new Error("备份中的收藏列表无效，未导入任何数据。");
  }
  if (!Array.isArray(data.runs) || data.runs.length > 1000) {
    throw new Error("备份中的记录列表无效，或超过 1000 条记录。");
  }
  const ids = new Set<string>();
  const runs = data.runs.map((raw, index) => {
    const [run] = parseRuns(JSON.stringify([raw]), skills);
    if (!run)
      throw new Error(`第 ${index + 1} 条评测记录无效，未导入任何数据。`);
    if (raw && typeof raw === "object" && "snapshot" in raw && !run.snapshot) {
      throw new Error(
        `第 ${index + 1} 条记录的测试快照无效或与摘要不一致，未导入任何数据。`,
      );
    }
    if (ids.has(run.id))
      throw new Error("备份包含重复的记录编号，请检查文件后重试。");
    ids.add(run.id);
    return run;
  });
  const favorites = [...new Set(data.favorites as string[])];
  const known = new Set(skills.map((skill) => skill.id));
  return {
    backup: {
      format: "skillproof-workspace",
      version: 1,
      mode: "demo",
      exportedAt: data.exportedAt,
      favorites: favorites.filter((id) => known.has(id)),
      runs,
    },
    unknownFavorites: favorites.filter((id) => !known.has(id)).length,
  };
}

export function mergeWorkspace(
  current: WorkspaceData,
  incoming: WorkspaceData,
) {
  const existing = new Map(current.runs.map((run) => [run.id, run]));
  const candidates = incoming.runs
    .filter((run) => !existing.has(run.id))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  // Import fills free slots. Existing local records are never evicted by a restore.
  const added = candidates.slice(
    0,
    Math.max(0, MAX_RUNS - current.runs.length),
  );
  const favorites = [...new Set([...current.favorites, ...incoming.favorites])];
  const duplicateRuns = incoming.runs.filter((run) => existing.has(run.id));
  return {
    favorites,
    runs: [...current.runs, ...added].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ),
    addedFavorites: favorites.length - current.favorites.length,
    addedRuns: added.length,
    duplicateRuns: duplicateRuns.length,
    conflictingRuns: duplicateRuns.filter(
      (run) => JSON.stringify(run) !== JSON.stringify(existing.get(run.id)),
    ).length,
    skippedRuns: candidates.length - added.length,
  };
}
