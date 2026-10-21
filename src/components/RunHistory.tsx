import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CircleHelp,
  Eye,
  FileText,
  History,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { filterRuns, getRunLabels } from "../runs";
import type { Run, Skill, Suite } from "../types";
import Modal from "./Modal";

interface Props {
  runs: Run[];
  skills: Skill[];
  suites: Suite[];
  onStart: (skillId?: string) => void;
  onExport: (run: Run) => void;
  onExportMany: (runs: Run[]) => void;
  onDelete: (ids: string[]) => void;
}

const formatDate = (date: string) =>
  new Date(date).toLocaleString("zh-CN", { hour12: false });

export default function RunHistory({
  runs,
  skills,
  suites,
  onStart,
  onExport,
  onExportMany,
  onDelete,
}: Props) {
  const [query, setQuery] = useState("");
  const [suiteId, setSuiteId] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [selected, setSelected] = useState<Run | null>(null);
  const [deleting, setDeleting] = useState<Run[] | null>(null);
  const visible = filterRuns(runs, skills, suites, query, suiteId, order);
  const labels = selected ? getRunLabels(selected, skills, suites) : null;

  return (
    <>
      {runs.length === 0 ? (
        <div className="empty-state large">
          <History size={40} />
          <h3>还没有评测记录</h3>
          <p>运行一次演示，了解从选择技能到导出结果的完整流程。</p>
          <button className="button primary" onClick={() => onStart()}>
            <Plus size={16} /> 新建演示评测
          </button>
        </div>
      ) : (
        <section className="runs-section">
          <div className="section-heading">
            <h2>
              本地评测记录 <span>{runs.length} RUNS</span>
            </h2>
            <span className="muted">仅保留最近 100 次演示</span>
          </div>
          <div className="notice compact">
            <CircleHelp size={18} />
            <span>
              这些记录演示完整产品流程，未调用模型、读取文件或执行真实技能。
            </span>
          </div>
          <div className="history-toolbar">
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="搜索评测记录"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技能、版本或记录编号…"
              />
            </label>
            <select
              aria-label="筛选评测基准"
              value={suiteId}
              onChange={(event) => setSuiteId(event.target.value)}
            >
              <option value="">全部基准</option>
              {suites.map((suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.name}
                </option>
              ))}
            </select>
            <select
              aria-label="记录排序"
              value={order}
              onChange={(event) => setOrder(event.target.value as typeof order)}
            >
              <option value="newest">最新优先</option>
              <option value="oldest">最早优先</option>
            </select>
          </div>
          <div className="history-actions">
            <span>
              显示 {visible.length} / {runs.length} 条记录
            </span>
            <div>
              <button
                className="button secondary"
                disabled={!visible.length}
                onClick={() => onExportMany(visible)}
              >
                <ArrowDownToLine size={15} /> 导出筛选结果
              </button>
              <button
                className="button danger-subtle"
                onClick={() => setDeleting(runs)}
              >
                <Trash2 size={15} /> 清空全部记录
              </button>
            </div>
          </div>
          {visible.length ? (
            <div className="table-scroll">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>技能 / 基准</th>
                    <th>数据来源</th>
                    <th>通过用例</th>
                    <th>示例总耗时</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((run) => {
                    const names = getRunLabels(run, skills, suites);
                    return (
                      <tr key={run.id}>
                        <td>
                          <button
                            className="run-name"
                            onClick={() => setSelected(run)}
                            aria-label={`查看 ${names.skillName} 评测详情`}
                          >
                            <span className="skill-icon small mint">
                              <FileText size={18} />
                            </span>
                            <span>
                              <strong>
                                {names.skillName}
                                {run.snapshot && (
                                  <em>v{run.snapshot.skillVersion}</em>
                                )}
                              </strong>
                              <small>{names.suiteName}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className="demo-tag">预设演示</span>
                          <small className="history-evidence">
                            {run.snapshot ? "含历史快照" : "仅历史摘要"}
                          </small>
                        </td>
                        <td>
                          <strong>
                            {run.passed} / {run.total}
                          </strong>
                          <small className="history-evidence">
                            {((run.passed / run.total) * 100).toFixed(1)}%
                          </small>
                        </td>
                        <td>{run.duration} s</td>
                        <td>{formatDate(run.createdAt)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label={`查看 ${names.skillName} 评测详情`}
                              onClick={() => setSelected(run)}
                            >
                              <Eye size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`导出 ${names.skillName} 评测报告`}
                              onClick={() => onExport(run)}
                            >
                              <ArrowDownToLine size={17} />
                            </button>
                            <button
                              className="icon-button danger-icon"
                              aria-label={`删除 ${names.skillName} 记录 ${run.id.slice(0, 8)}`}
                              onClick={() => setDeleting([run])}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state history-empty">
              <Search size={30} />
              <h3>没有匹配的评测记录</h3>
              <p>调整关键词或基准筛选后重试。</p>
              <button
                className="button secondary"
                onClick={() => {
                  setQuery("");
                  setSuiteId("");
                }}
              >
                清除记录筛选
              </button>
            </div>
          )}
        </section>
      )}

      {selected && labels && (
        <Modal title="评测报告详情" close={() => setSelected(null)} wide>
          <div className="report-heading">
            <div>
              <h3>{labels.skillName}</h3>
              <p>
                {labels.suiteName} · {formatDate(selected.createdAt)}
              </p>
            </div>
            <span className="demo-tag">预设演示</span>
          </div>
          <div className="detail-stats">
            <div>
              <span>示例通过率</span>
              <strong>
                {((selected.passed / selected.total) * 100).toFixed(1)}%
              </strong>
            </div>
            <div>
              <span>通过 / 总用例</span>
              <strong>
                {selected.passed} / {selected.total}
              </strong>
            </div>
            <div>
              <span>示例总耗时</span>
              <strong>{selected.duration} s</strong>
            </div>
          </div>
          {selected.snapshot ? (
            <>
              <div className="requirements">
                <p>
                  <strong>技能版本</strong>v{selected.snapshot.skillVersion}
                </p>
                <p>
                  <strong>基准版本</strong>v{selected.snapshot.suiteVersion}
                </p>
                <p>
                  <strong>运行环境</strong>
                  {selected.snapshot.environment}
                </p>
              </div>
              <section className="detail-cases">
                <h4>
                  历史测试明细 <span>评测创建时保存的演示快照</span>
                </h4>
                {selected.snapshot.cases.map((item, index) => (
                  <div className="case-row" key={`${item.name}-${index}`}>
                    <span>{item.name}</span>
                    <div className="progress-track">
                      <i
                        style={{
                          width: `${(item.passed / item.total) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {item.passed} / {item.total}
                    </strong>
                    <small>{item.seconds} s</small>
                  </div>
                ))}
              </section>
            </>
          ) : (
            <div className="notice">
              <CircleHelp size={19} />
              <div>
                <strong>这条旧记录仅保存了评测摘要。</strong>
                <p>
                  当时的技能版本、运行环境和测试明细未被保存。可重新运行演示以生成包含快照的新记录。
                </p>
              </div>
            </div>
          )}
          <p className="report-id">记录编号：{selected.id}</p>
          <div className="notice compact">
            <CircleHelp size={17} />
            <span>
              所有指标均来自虚构演示数据；此报告不代表真实技能的执行或认证结果。
            </span>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => onExport(selected)}
            >
              <ArrowDownToLine size={16} /> 导出报告
            </button>
            <button
              className="button primary"
              disabled={!skills.some((skill) => skill.id === selected.skillId)}
              title={
                skills.some((skill) => skill.id === selected.skillId)
                  ? undefined
                  : "该技能已不在当前目录中"
              }
              onClick={() => {
                const id = selected.skillId;
                setSelected(null);
                onStart(id);
              }}
            >
              再次演示 <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal
          title={
            deleting.length === runs.length && runs.length > 1
              ? "清空全部评测记录"
              : "删除评测记录"
          }
          close={() => setDeleting(null)}
        >
          <div className="delete-copy">
            <span className="delete-symbol">
              <Trash2 size={24} />
            </span>
            <h3>确定删除 {deleting.length} 条记录？</h3>
            <p>删除后将无法在此浏览器中恢复。需要保留时，请先导出报告。</p>
            {deleting.length === runs.length && runs.length > 1 && (
              <p>此操作会清空全部记录，包括当前筛选未显示的记录。</p>
            )}
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(null)}
              autoFocus
            >
              保留记录
            </button>
            <button
              className="button danger"
              onClick={() => {
                onDelete(deleting.map((run) => run.id));
                setDeleting(null);
              }}
            >
              确认删除 {deleting.length} 条
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
