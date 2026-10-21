import { useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import {
  configurePdfWorker,
  extractPdfText,
  ADAPTER_VERSION,
} from "../pdf-adapter";
import { adapterBinding, runBenchmark } from "../executions";
import type { Execution } from "../executions";
import type { SkillProfile } from "../profiles";
configurePdfWorker(pdfWorkerUrl);

export default function EvaluationLab({
  profiles,
  executions,
  onRegister,
  onExecution,
  onExport,
}: {
  profiles: SkillProfile[];
  executions: Execution[];
  onRegister: () => Promise<string>;
  onExecution: (execution: Execution) => void;
  onExport: (execution: Execution) => void;
}) {
  const [profileId, setProfileId] = useState("");
  const [version, setVersion] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Execution | null>(null);
  const profile = profiles.find((item) => item.id === profileId);
  const revision = profile?.revisions.find((item) => item.version === version);
  async function run() {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      const execution = await runBenchmark(
        profile,
        version,
        extractPdfText,
        ADAPTER_VERSION,
        setProgress,
      );
      onExecution(execution);
      setSelected(execution);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <section>
      <div className="notice">
        <div>
          <strong>真实执行 · 固定适配器 PDF.js {ADAPTER_VERSION}</strong>
          <p>
            运行登记适配器提取实际 PDF 文件，不执行 Markdown
            中的任意指令。测试范围仅限英文数字 PDF；结果不构成广泛能力认证。
          </p>
        </div>
      </div>
      <section className="suite-card">
        <div className="profile-form">
          <label>
            真实技能档案
            <select
              aria-label="实际评测档案"
              disabled={busy}
              value={profileId}
              onChange={(event) => {
                setProfileId(event.target.value);
                setVersion(
                  profiles
                    .find((item) => item.id === event.target.value)
                    ?.revisions.at(-1)?.version ?? 1,
                );
              }}
            >
              <option value="">选择档案</option>
              {profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.revisions.at(-1)!.name}
                </option>
              ))}
            </select>
          </label>
          {profile && (
            <label>
              执行版本
              <select
                aria-label="实际评测版本"
                disabled={busy}
                value={version}
                onChange={(event) => setVersion(Number(event.target.value))}
              >
                {profile.revisions.map((item) => (
                  <option key={item.version} value={item.version}>
                    v{item.version}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setError("");
              void onRegister()
                .then((id) => {
                  setProfileId(id);
                  setVersion(1);
                })
                .catch((cause) => setError(String(cause)));
            }}
          >
            登记内置 PDF 提取档案
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              !revision ||
              adapterBinding(revision.source) !== "pdfjs-text"
            }
            onClick={() => void run()}
          >
            {busy ? "正在实际执行…" : "运行真实 PDF 基准"}
          </button>
        </div>
        {revision && !adapterBinding(revision.source) && (
          <p className="table-note">
            此档案没有声明支持的 metadata.skillproof.adapter:
            pdfjs-text，当前不可执行。
          </p>
        )}
        {progress && <p role="status">{progress}</p>}
        {error && (
          <p role="alert" className="backup-error">
            {error}
          </p>
        )}
      </section>
      <section className="suite-card">
        <h2>真实执行记录</h2>
        <p>
          与演示记录分开保存，最多 50
          条。当前工作区备份不包含真实执行记录，可单独导出。
        </p>
        {executions.map((item) => (
          <button
            key={item.id}
            className="button secondary"
            onClick={() => setSelected(item)}
          >
            {item.profile.name} v{item.profile.version} ·{" "}
            {item.results.filter((result) => result.passed).length}/
            {item.results.length}
          </button>
        ))}
      </section>
      {selected && (
        <section className="suite-card">
          <h2>
            真实结果：{selected.results.filter((item) => item.passed).length}/
            {selected.results.length}
          </h2>
          <code className="hash-text">
            档案 {selected.profile.textSha256} · 测试清单{" "}
            {selected.suite.manifestSha256}
          </code>
          <div className="table-scroll">
            <table className="runs-table">
              <thead>
                <tr>
                  <th>实际输入</th>
                  <th>判定</th>
                  <th>耗时</th>
                  <th>依据</th>
                </tr>
              </thead>
              <tbody>
                {selected.results.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.passed ? "通过" : "失败"}</td>
                    <td>{item.durationMs.toFixed(1)} ms</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="button secondary"
            onClick={() => onExport(selected)}
          >
            导出实际执行结果
          </button>
        </section>
      )}
    </section>
  );
}
