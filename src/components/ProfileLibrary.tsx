import { useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  FileText,
  Plus,
  Search,
} from "lucide-react";
import { reviseProfile } from "../profiles";
import { filterProfiles, revisionExecutions } from "../profile-library";
import type { SkillProfile } from "../profiles";
import Modal from "./Modal";
import type { Execution } from "../executions";

export default function ProfileLibrary({
  profiles,
  onSave,
  onExport,
  initialSource,
  onClearSource,
  executions,
}: {
  profiles: SkillProfile[];
  onSave: (profile: SkillProfile) => void;
  onExport: (profile: SkillProfile) => void;
  initialSource: string | null;
  onClearSource: () => void;
  executions: Execution[];
}) {
  const [editing, setEditing] = useState<{
    id?: string;
    source: string;
    claims: string;
    environment: string;
    permissions: string;
  } | null>(null);
  const [selected, setSelected] = useState<SkillProfile | null>(null);
  const [version, setVersion] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const form =
    editing ??
    (initialSource !== null
      ? { source: initialSource, claims: "", environment: "", permissions: "" }
      : null);
  function close() {
    setEditing(null);
    onClearSource();
    setError("");
  }
  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const { profile } = await reviseProfile(
        profiles.find((item) => item.id === form.id),
        form.source,
        {
          claims: form.claims.split("\n"),
          environment: form.environment,
          permissions: form.permissions.split("\n"),
        },
      );
      onSave(profile);
      close();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "保存失败，请先导出已有档案，检查浏览器存储空间。",
      );
    } finally {
      setSaving(false);
    }
  }
  const revision = selected?.revisions.find((item) => item.version === version);
  const visibleProfiles = filterProfiles(profiles, query);
  const evidence =
    selected && revision
      ? revisionExecutions(executions, selected.id, revision)
      : [];
  const latestExecution = evidence[0];
  return (
    <section className="profiles-page">
      <div className="notice compact">
        <CheckCircle2 size={18} />
        <span>
          以下是你保存的真实技能文档。能力、环境和权限均由发布者声明；执行记录按档案、版本和原文哈希关联，仅反映对应基准的结果。
        </span>
      </div>
      {profiles.length > 0 && (
        <div className="history-toolbar">
          <label className="search-box">
            <Search size={18} />
            <input
              aria-label="搜索我的技能档案"
              placeholder="搜索技能名称或描述…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span role="status">
            显示 {visibleProfiles.length} / {profiles.length} 个档案
          </span>
          {query && (
            <button className="button secondary" onClick={() => setQuery("")}>
              清空搜索
            </button>
          )}
        </div>
      )}
      <div className="section-heading">
        <h2>
          我的技能档案 <span>{profiles.length} PROFILES</span>
        </h2>
        <button
          className="button primary"
          onClick={() =>
            setEditing({
              source: "",
              claims: "",
              environment: "",
              permissions: "",
            })
          }
        >
          <Plus size={16} /> 新建档案
        </button>
      </div>
      {!profiles.length && (
        <div className="empty-state">
          <FileText size={35} />
          <h3>保存你的第一个真实技能</h3>
          <p>在“技能检查”中上传并检查文件后保存，或直接新建档案。</p>
        </div>
      )}
      <div className="skill-grid">
        {visibleProfiles.map((profile) => {
          const latest = profile.revisions.at(-1)!;
          const records = revisionExecutions(executions, profile.id, latest);
          const historicalCount = profile.revisions.slice(0, -1).reduce(
            (count, item) =>
              count + revisionExecutions(executions, profile.id, item).length,
            0,
          );
          return (
            <article className="suite-card" key={profile.id}>
              <span className="demo-tag">
                {records.length
                  ? `当前版本 · ${records.length} 条执行记录`
                  : "当前版本 · 尚无执行记录"}
              </span>
              <h2>{latest.name}</h2>
              <p>{latest.description}</p>
              <p>
                v{latest.version} · {profile.revisions.length} 个历史版本
              </p>
              {historicalCount > 0 && (
                <p>旧版本另有 {historicalCount} 条执行记录，不代表当前版本。</p>
              )}
              <code className="hash-text">{latest.textSha256}</code>
              <button
                className="button secondary"
                onClick={() => {
                  setSelected(profile);
                  setVersion(latest.version);
                }}
              >
                查看版本与声明
              </button>
            </article>
          );
        })}
      </div>
      {profiles.length > 0 && visibleProfiles.length === 0 && (
        <div className="empty-state">
          <Search size={35} />
          <h3>没有匹配的档案</h3>
          <p>试试技能名称或描述中的其他关键词，或清空搜索。</p>
        </div>
      )}
      {selected && revision && (
        <Modal title="真实技能档案" close={() => setSelected(null)} wide>
          <div className="requirements">
            <p>
              <strong>技能名称</strong>
              {revision.name}
            </p>
            <p>
              <strong>档案版本</strong>
              <select
                aria-label="档案历史版本"
                value={version}
                onChange={(event) => setVersion(Number(event.target.value))}
              >
                {selected.revisions.map((item) => (
                  <option key={item.version} value={item.version}>
                    v{item.version} ·{" "}
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </option>
                ))}
              </select>
            </p>
            <p>
              <strong>声明环境</strong>
              {revision.environment || "未声明"}
            </p>
            <p>
              <strong>声明权限</strong>
              {revision.permissions.join("、") || "未声明"}
            </p>
            <p>
              <strong>真实执行证据</strong>
              {evidence.length}{" "}
              条关联记录；仅对所用 PDF 基准有效，静态检查不验证能力。
            </p>
            {latestExecution && (
              <p>
                <strong>最近一次执行</strong>
                {new Date(latestExecution.createdAt).toLocaleString("zh-CN")} ·{" "}
                {latestExecution.suite.id} v{latestExecution.suite.version} ·{" "}
                {latestExecution.results.filter((item) => item.passed).length}/
                {latestExecution.results.length} 项通过
              </p>
            )}
          </div>
          <h4>声明的能力</h4>
          <ul>
            {revision.claims.map((claim, index) => (
              <li key={index}>{claim}</li>
            ))}
          </ul>
          <code className="hash-text">SHA-256: {revision.textSha256}</code>
          <pre className="source-preview">{revision.source}</pre>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => onExport(selected)}
            >
              <ArrowDownToLine size={15} /> 导出完整档案
            </button>
            <button
              className="button primary"
              onClick={() => {
                const latest = selected.revisions.at(-1)!;
                setEditing({
                  id: selected.id,
                  source: latest.source,
                  claims: latest.claims.join("\n"),
                  environment: latest.environment,
                  permissions: latest.permissions.join("\n"),
                });
                setSelected(null);
              }}
            >
              编辑并创建新版本
            </button>
          </div>
        </Modal>
      )}
      {form && (
        <Modal
          title={form.id ? "创建技能新版本" : "保存真实技能档案"}
          close={close}
          closeDisabled={saving}
          wide
        >
          <div className="profile-form">
            <label>
              SKILL.md 原文
              <textarea
                aria-label="档案源文本"
                value={form.source}
                onChange={(event) =>
                  setEditing({ ...form, source: event.target.value })
                }
                disabled={saving}
              />
            </label>
            <label>
              声明的能力（每行一项）
              <textarea
                value={form.claims}
                onChange={(event) =>
                  setEditing({ ...form, claims: event.target.value })
                }
                disabled={saving}
              />
            </label>
            <label>
              声明的运行环境
              <input
                value={form.environment}
                onChange={(event) =>
                  setEditing({ ...form, environment: event.target.value })
                }
                disabled={saving}
              />
            </label>
            <label>
              声明的权限（每行一项）
              <textarea
                value={form.permissions}
                onChange={(event) =>
                  setEditing({ ...form, permissions: event.target.value })
                }
                disabled={saving}
              />
            </label>
          </div>
          {error && (
            <div className="backup-error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={close}
              disabled={saving}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={saving || !form.source.trim()}
              onClick={() => void save()}
            >
              {saving ? "校验并保存…" : "保存版本"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
