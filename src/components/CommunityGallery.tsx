import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../backend";
import type { Execution } from "../executions";
import { PDF_SKILL_SOURCE } from "../executions";
import type { Publication, Feedback } from "../sharing";
import type { SkillProfile } from "../profiles";
import type { Submission } from "../../server/community";
import Modal from "./Modal";
export default function CommunityGallery({
  token,
  executions,
  onExport,
  onAccepted,
}: {
  token: string | null;
  executions: Execution[];
  onExport: (name: string, data: unknown) => void;
  onAccepted: (profile: SkillProfile) => void;
}) {
  const [shares, setShares] = useState<Publication[]>([]),
    [share, setShare] = useState<Publication | null>(null),
    [feedback, setFeedback] = useState<Feedback[]>([]),
    [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [publishing, setPublishing] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const [executionId, setExecutionId] = useState(""),
    [publisher, setPublisher] = useState(""),
    [full, setFull] = useState(false),
    [link, setLink] = useState("");
  const [feedbackName, setFeedbackName] = useState(""),
    [feedbackText, setFeedbackText] = useState(""),
    [submissionSource, setSubmissionSource] = useState(""),
    [submissionPublisher, setSubmissionPublisher] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const id = ++generation.current;
    setError("");
    try {
      if (token) {
        const [publication, comments] = await Promise.all([
          api<Publication>(`/public/shares/${token}`),
          api<Feedback[]>(`/public/shares/${token}/feedback`),
        ]);
        if (id === generation.current) {
          setShare(publication);
          setFeedback(comments);
        }
      } else {
        const [publications, pending] = await Promise.all([
          api<Publication[]>("/public/shares"),
          api<Submission[]>("/submissions"),
        ]);
        if (id === generation.current) {
          setShares(publications);
          setSubmissions(pending);
          setShare(null);
        }
      }
    } catch (cause) {
      if (id === generation.current) {
        setShare(null);
        setError(`无法加载分享服务：${String(cause)}`);
      }
    }
  }, [token]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  async function action(callback: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await callback();
      await load();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  const selected = executions.find((item) => item.id === executionId);
  return (
    <section className="community-page">
      <div className="notice">
        <div>
          <strong>{token ? "只读分享页面" : "报告共享与技能协作"}</strong>
          <p>
            分享链接使用当前服务地址。目前服务仅在本机可访问，尚未部署到公网。显示名由用户自填，未核验身份；报告也不构成独立能力认证。
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="backup-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice compact">
          {message}
        </p>
      )}
      {!token && (
        <>
          <div className="section-heading">
            <h2>已分享报告</h2>
            <div className="community-actions">
              <button
                className="button secondary"
                onClick={() => setSubmitting(true)}
              >
                提交技能供审核
              </button>
              <button
                className="button primary"
                disabled={!executions.some((item) => item.evidence)}
                onClick={() => {
                  setExecutionId(executions.find((item) => item.evidence)!.id);
                  setPublishing(true);
                  setLink("");
                  setFull(false);
                }}
              >
                分享真实报告
              </button>
            </div>
          </div>
          {!shares.length && (
            <div className="empty-state">
              <h3>还没有只读分享</h3>
              <p>先完成真实评测，再选择公开摘要或完整证据。</p>
            </div>
          )}
          <div className="skill-grid">
            {shares.map((item) => (
              <article className="suite-card" key={item.id}>
                <span className="demo-tag">
                  {item.provenance === "server-worker"
                    ? "本机服务执行"
                    : "浏览器报告导入"}
                </span>
                <h2>
                  {item.summary.name} v{item.summary.version}
                </h2>
                <p>
                  {item.summary.passed}/{item.summary.total} 项通过 ·{" "}
                  {item.summary.suite.version}
                </p>
                <p>显示名：{item.publisher.name}（自填，未核验）</p>
                <a className="button secondary" href={`#share/${item.id}`}>
                  打开只读报告
                </a>
                <button
                  className="button danger-subtle"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api(`/shares/${item.id}/revoke`, {});
                      setMessage("分享已撤销，链接将不再返回报告。");
                    })
                  }
                >
                  撤销分享
                </button>
              </article>
            ))}
          </div>
          <section className="suite-card">
            <h2>本机待审核提交</h2>
            <p>提交只进入审核队列；接受后成为声明档案，不会自动执行或发布。</p>
            {submissions.map((item) => (
              <article className="submission-row" key={item.id}>
                <strong>{item.name}</strong>
                <p>
                  {item.publisher.name}（自填，未核验）·{" "}
                  {item.state === "pending" ? "待审核" : "已接受"}
                </p>
                <code className="hash-text">{item.textSha256}</code>
                <details>
                  <summary>查看提交原文</summary>
                  <pre className="source-preview">{item.source}</pre>
                </details>
                {item.state === "pending" && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const profile = await api<SkillProfile>(
                          `/submissions/${item.id}/accept`,
                          {},
                        );
                        onAccepted(profile);
                        setMessage("已接受为真实档案，能力仍待评测。");
                      })
                    }
                  >
                    接受为真实档案
                  </button>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      {token && share && (
        <>
          <section className="suite-card">
            <span className="demo-tag">
              不可变发布快照 · {share.fullReport ? "包含完整证据" : "摘要分享"}
            </span>
            <h2>
              {share.summary.name} v{share.summary.version}
            </h2>
            <p>发布者显示名：{share.publisher.name}（自填，身份未核验）</p>
            <p>
              评测来源：
              {share.provenance === "server-worker"
                ? "本机服务固定适配器实际执行"
                : "浏览器测量报告导入，非独立验证"}
            </p>
            <p>
              执行器：{share.summary.adapter.id} {share.summary.adapter.version}{" "}
              · 通过 {share.summary.passed}/{share.summary.total}
            </p>
            <code className="hash-text">
              档案 SHA-256：{share.summary.textSha256}
              <br />
              测试清单：{share.summary.suite.manifestSha256}
            </code>
            <div className="table-scroll">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>用例</th>
                    <th>结果</th>
                    <th>输出指纹</th>
                  </tr>
                </thead>
                <tbody>
                  {share.summary.results.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>{item.passed ? "通过" : "失败"}</td>
                      <td>
                        <code>{item.outputSha256.slice(0, 16)}…</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {share.fullReport ? (
              <>
                <details>
                  <summary>查看公开的完整证据</summary>
                  <pre className="source-preview">
                    {JSON.stringify(share.fullReport, null, 2)}
                  </pre>
                </details>
                <button
                  className="button secondary"
                  onClick={() =>
                    onExport(
                      `skillproof-shared-${share.id}.json`,
                      share.fullReport,
                    )
                  }
                >
                  下载完整复现报告
                </button>
              </>
            ) : (
              <p className="table-note">
                发布者只分享摘要，技能原文、逐页输出和详细环境未公开。此摘要无法单独复现。
              </p>
            )}
          </section>
          <section className="suite-card">
            <h2>错误与问题反馈</h2>
            <div className="profile-form">
              <label>
                显示名（可选，未核验）
                <input
                  maxLength={80}
                  value={feedbackName}
                  onChange={(event) => setFeedbackName(event.target.value)}
                />
              </label>
              <label>
                反馈内容
                <textarea
                  aria-label="报告反馈内容"
                  maxLength={2000}
                  value={feedbackText}
                  onChange={(event) => setFeedbackText(event.target.value)}
                />
              </label>
            </div>
            <button
              className="button primary"
              disabled={busy || !feedbackText.trim()}
              onClick={() =>
                void action(async () => {
                  await api(`/public/shares/${share.id}/feedback`, {
                    name: feedbackName,
                    message: feedbackText,
                  });
                  setFeedbackText("");
                  setMessage("反馈已保存到此报告。");
                })
              }
            >
              提交反馈
            </button>
            {feedback.map((item) => (
              <article className="submission-row" key={item.id}>
                <strong>{item.name}（未核验）</strong>
                <p className="feedback-text">{item.message}</p>
                <small>
                  {new Date(item.createdAt).toLocaleString("zh-CN")}
                </small>
              </article>
            ))}
          </section>
        </>
      )}
      {publishing && (
        <Modal
          title="创建只读报告分享"
          close={() => setPublishing(false)}
          closeDisabled={busy}
          wide
        >
          {!link ? (
            <>
              <div className="profile-form">
                <label>
                  选择完整执行记录
                  <select
                    aria-label="分享执行记录"
                    value={executionId}
                    onChange={(event) => setExecutionId(event.target.value)}
                  >
                    {executions
                      .filter((item) => item.evidence)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.profile.name} v{item.profile.version} ·{" "}
                          {item.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  发布者显示名（自填，未核验）
                  <input
                    aria-label="发布者显示名"
                    maxLength={80}
                    value={publisher}
                    onChange={(event) => setPublisher(event.target.value)}
                  />
                </label>
              </div>
              {selected && (
                <div className="notice compact">
                  摘要将包含技能名称、版本、输入/输出哈希、评分、显示名和实际存储来源。
                </div>
              )}
              <label className="share-option">
                <input
                  aria-label="公开完整证据"
                  type="checkbox"
                  checked={full}
                  onChange={(event) => setFull(event.target.checked)}
                />{" "}
                额外公开完整复现报告：包含技能原文、逐页输出、预期文本及详细环境信息。
              </label>
              <p className="table-note">
                请检查所选记录是否包含不希望公开的信息。创建后为独立快照，可撤销链接。
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setPublishing(false)}
                >
                  取消
                </button>
                <button
                  className="button primary"
                  disabled={busy || !publisher.trim() || !selected}
                  onClick={() =>
                    void action(async () => {
                      await api("/executions", selected);
                      const publication = await api<Publication>("/shares", {
                        executionId,
                        publisher,
                        fullEvidence: full,
                      });
                      setLink(
                        `${window.location.origin}/#share/${publication.id}`,
                      );
                    })
                  }
                >
                  创建分享
                </button>
              </div>
            </>
          ) : (
            <>
              <p>只读链接已创建。当前地址仅在本机访问；未进行公网部署。</p>
              <input
                className="share-link"
                aria-label="只读分享链接"
                readOnly
                value={link}
                onFocus={(event) => event.target.select()}
              />
              <a
                className="button primary"
                href={link}
                onClick={() => setPublishing(false)}
              >
                打开只读页面
              </a>
            </>
          )}
        </Modal>
      )}
      {submitting && (
        <Modal
          title="提交技能供审核"
          close={() => setSubmitting(false)}
          closeDisabled={busy}
          wide
        >
          <div className="profile-form">
            <label>
              提交者显示名（自填，未核验）
              <input
                aria-label="提交者显示名"
                maxLength={80}
                value={submissionPublisher}
                onChange={(event) => setSubmissionPublisher(event.target.value)}
              />
            </label>
            <label>
              SKILL.md 原文
              <textarea
                aria-label="提交技能原文"
                value={submissionSource}
                onChange={(event) => setSubmissionSource(event.target.value)}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setSubmissionSource(PDF_SKILL_SOURCE)}
            >
              填入内置示例
            </button>
            <button
              className="button primary"
              disabled={
                busy || !submissionPublisher.trim() || !submissionSource.trim()
              }
              onClick={() =>
                void action(async () => {
                  await api("/public/submissions", {
                    publisher: submissionPublisher,
                    source: submissionSource,
                  });
                  setSubmissionSource("");
                  setSubmitting(false);
                  setMessage(
                    "技能已提交，等待本机维护者审核；尚未执行或公开。",
                  );
                })
              }
            >
              提交审核
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
