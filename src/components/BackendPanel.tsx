import { useCallback, useEffect, useState } from "react";
import { api } from "../backend";
import type { BackendJob } from "../backend";
import type { SkillProfile } from "../profiles";
import type { Execution } from "../executions";
import { adapterBinding } from "../executions";
const labels = { queued: "排队中", running: "运行中", succeeded: "已完成", failed: "失败", cancelled: "已取消" };
export default function BackendPanel({ profiles, executions, profileId, version, onRestore }: { profiles: SkillProfile[]; executions: Execution[]; profileId: string; version: number; onRestore: (profiles: SkillProfile[], executions: Execution[]) => void }) {
  const [online, setOnline] = useState(false);
  const [jobs, setJobs] = useState<BackendJob[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const refresh = useCallback(async () => { try { await api("/health"); setJobs(await api<BackendJob[]>("/jobs")); setOnline(true); } catch { setOnline(false); } }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 2000); return () => clearInterval(timer); }, [refresh]);
  async function action(callback: () => Promise<void>) { setBusy(true); setError(""); setMessage(""); try { await callback(); await refresh(); } catch (cause) { setError(String(cause)); } finally { setBusy(false); } }
  const profile = profiles.find(item => item.id === profileId);
  const revision = profile?.revisions.find(item => item.version === version);
  return <section className="suite-card backend-panel"><h2>本机持久化服务 <span className="demo-tag">{online ? "SQLite 已连接" : "未连接"}</span></h2><p>任务在本机服务中排队执行，页面关闭后仍可继续。单任务并行度为 1，最多排队 20 个。此服务面向本机单用户，不是公网多用户服务。</p>{!online && <p className="backup-error">请运行 pnpm dev 同时启动前后端；或在另一终端运行 pnpm server。</p>}<div className="modal-actions"><button className="button secondary" disabled={busy || !online} onClick={() => void action(async () => { for (const item of profiles) await api("/profiles", item); let count = 0; for (const execution of executions) if (execution.evidence) { await api("/executions", execution); count++; } setMessage(`已同步 ${profiles.length} 份档案和 ${count} 条完整执行记录。`); })}>同步本地数据到本机服务</button><button className="button secondary" disabled={busy || !online} onClick={() => void action(async () => { const [serverProfiles, serverExecutions] = await Promise.all([api<SkillProfile[]>("/profiles"), api<Execution[]>("/executions")]); onRestore(serverProfiles, serverExecutions); setMessage("已从本机数据库恢复档案和执行记录。"); })}>拉取后台档案与结果</button><button className="button primary" disabled={busy || !online || !profile || !revision || !adapterBinding(revision.source)} onClick={() => void action(async () => { await api("/profiles", profile); const job = await api<BackendJob>("/jobs", { profileId, version }); setMessage(`已创建后台任务 ${job.id}`); })}>将此版本加入后台队列</button></div>{message && <p role="status">{message}</p>}{error && <p className="backup-error" role="alert">{error}</p>}
    <div className="table-scroll"><table className="runs-table"><thead><tr><th>任务</th><th>档案版本</th><th>状态</th><th>操作</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}><td><button onClick={() => setOpened(opened === job.id ? null : job.id)}>{job.id.slice(0, 8)} · 查看日志</button>{opened === job.id && <pre className="source-preview">{job.logs.map(item => `${item.at} ${item.message}`).join("\n")}{job.error ? `\n${job.error}` : ""}</pre>}</td><td>v{job.version}</td><td>{labels[job.state]}</td><td>{["queued", "running"].includes(job.state) && <button className="button secondary" onClick={() => void action(async () => { await api(`/jobs/${job.id}/cancel`, {}); })}>取消后台任务</button>}</td></tr>)}</tbody></table></div><a href="/api/export" download="skillproof-server-backup.json" className="detail-link">导出本机数据库内容（档案、结果、任务）</a>
  </section>;
}
