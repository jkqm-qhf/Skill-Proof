import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  CircleMinus,
  FileSearch,
  FileText,
  LoaderCircle,
  Play,
  RotateCcw,
  Upload,
  XCircle,
} from "lucide-react";
import {
  inspectSkillDocument,
  INSPECTION_SOURCE,
  MAX_SKILL_BYTES,
  SAMPLE_SKILL,
} from "../inspector";
import type { CheckStatus, SkillInspection } from "../inspector";

const statusIcons = {
  pass: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  skipped: CircleMinus,
};
const statusLabels: Record<CheckStatus, string> = {
  pass: "通过",
  error: "需修正",
  warning: "建议",
  skipped: "待检查",
};
const resourceLabels = {
  local: "相对路径",
  external: "外部链接",
  anchor: "页内锚点",
  other: "其他引用",
};

export default function SkillInspector({
  onExport,
  onSave,
}: {
  onExport: (report: SkillInspection) => void;
  onSave: (source: string) => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("粘贴内容");
  const [inputKind, setInputKind] = useState<"paste" | "file" | "sample">(
    "paste",
  );
  const [report, setReport] = useState<SkillInspection | null>(null);
  const [reading, setReading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const editor = useRef<HTMLTextAreaElement>(null);

  function changeText(
    value: string,
    name = "粘贴内容",
    kind: typeof inputKind = "paste",
  ) {
    generation.current++;
    setText(value);
    setFileName(name);
    setInputKind(kind);
    setReport(null);
    setError("");
    setChecking(false);
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    const id = ++generation.current;
    setError("");
    setReport(null);
    setChecking(false);
    if (!file.name.toLowerCase().endsWith(".md")) {
      setError("请选择 Markdown 文件（.md）。");
      return;
    }
    if (file.size > MAX_SKILL_BYTES) {
      setError("文件超过 256 KB，请选择较小的 SKILL.md 文件。");
      return;
    }
    setReading(true);
    try {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (generation.current === id) {
        setText(content);
        setFileName(file.name);
        setInputKind("file");
      }
    } catch {
      if (generation.current === id)
        setError("无法读取文件。请使用 UTF-8 编码的 Markdown 文本。");
    } finally {
      if (generation.current === id) setReading(false);
    }
  }
  async function inspect() {
    const id = ++generation.current;
    setChecking(true);
    setReport(null);
    setError("");
    try {
      const result = await inspectSkillDocument(text, fileName, inputKind);
      if (generation.current === id) setReport(result);
    } catch (cause) {
      if (generation.current === id)
        setError(
          cause instanceof Error ? cause.message : "检查失败，请重新尝试。",
        );
    } finally {
      if (generation.current === id) setChecking(false);
    }
  }
  function jumpToLine(line: number) {
    const target = editor.current;
    if (!target) return;
    let offset = 0,
      currentLine = 1;
    for (const match of text.matchAll(/\r\n|\r|\n/g)) {
      if (currentLine >= line) break;
      offset = match.index + match[0].length;
      currentLine++;
    }
    target.focus();
    const ending = text.slice(offset).search(/\r|\n/);
    target.setSelectionRange(
      offset,
      ending < 0 ? text.length : offset + ending,
    );
    const lineHeight = parseFloat(getComputedStyle(target).lineHeight) || 22;
    target.scrollTop = Math.max(
      0,
      (line - 1) * lineHeight - target.clientHeight / 3,
    );
  }

  return (
    <section className="inspector-page">
      <div className="notice compact">
        <CircleHelp size={18} />
        <span>
          基于实际文本检查基础结构和写作标记。检查结果不代表技能执行表现或官方认证，引用资源的可用性仍需核实。
        </span>
      </div>
      <div className="inspector-grid">
        <section className="inspector-editor-panel">
          <div className="inspector-panel-heading">
            <h2>
              <FileText size={18} /> 技能源文件
            </h2>
            <span>UTF-8 · 最大 256 KB</span>
          </div>
          <div className="inspector-tools">
            <label
              className={`button secondary backup-file-picker ${reading ? "is-reading" : ""}`}
            >
              <Upload size={15} />
              {reading ? "读取中…" : "上传 SKILL.md"}
              <input
                className="visually-hidden"
                aria-label="上传技能文件"
                type="file"
                accept=".md,text/markdown"
                disabled={reading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void readFile(file);
                }}
              />
            </label>
            <button
              className="button secondary"
              disabled={reading}
              onClick={() => changeText(SAMPLE_SKILL, "SKILL.md", "sample")}
            >
              载入示例
            </button>
            <button
              className="icon-button"
              disabled={reading || !text}
              onClick={() => changeText("")}
              aria-label="清空技能内容"
              title="清空内容"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <label className="inspector-editor-label" htmlFor="skill-source">
            粘贴或编辑 SKILL.md 内容
          </label>
          <textarea
            ref={editor}
            id="skill-source"
            className="inspector-editor"
            value={text}
            disabled={reading}
            spellCheck={false}
            onChange={(event) => changeText(event.target.value)}
            placeholder={
              "---\nname: your-skill\ndescription: Explain when to use this skill.\n---\n\n# Skill instructions\n"
            }
          />
          <div className="inspector-source-meta">
            <span>{inputKind === "sample" ? "示例文本" : fileName}</span>
            <span>{text ? text.split(/\r\n|\r|\n/).length : 0} 行</span>
          </div>
          {error && (
            <div className="backup-error" role="alert">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="inspector-editor-footer">
            <p>源文本仅保留在当前页面会话，刷新后清空。</p>
            <button
              className="button primary"
              disabled={!text.trim() || reading || checking}
              onClick={() => void inspect()}
            >
              {checking ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Play size={15} />
              )}
              {checking ? "检查中…" : "开始静态检查"}
            </button>
          </div>
        </section>

        <section
          className="inspector-results"
          aria-label="静态检查结果"
          aria-live="polite"
          aria-busy={checking}
        >
          {!report ? (
            <div className="inspector-empty">
              <span className="inspector-empty-icon">
                <FileSearch size={36} strokeWidth={1.4} />
              </span>
              <div className="eyebrow">INSPECT BEFORE YOU RUN</div>
              <h2>{checking ? "正在检查技能文件" : "从真实的技能文件开始"}</h2>
              <p>
                上传或粘贴文件后，检查元数据、正文和工作流结构，导出带内容指纹的结果。
              </p>
              <ol>
                <li>
                  <span>01</span>读取 YAML 元数据与 Markdown 正文
                </li>
                <li>
                  <span>02</span>展示格式问题与可选写作建议
                </li>
                <li>
                  <span>03</span>导出带 SHA-256 的 JSON 报告
                </li>
              </ol>
            </div>
          ) : (
            <>
              <div
                className={`inspection-summary ${report.summary.formatValid ? "valid" : "invalid"}`}
              >
                <div>
                  <span className="pill">STATIC INSPECTION</span>
                  <h2>
                    {report.summary.formatValid
                      ? "基础结构检查通过"
                      : "需要修正基础结构"}
                  </h2>
                  <p>{report.metadata.name ?? "尚未识别技能名称"}</p>
                </div>
                {report.summary.formatValid ? (
                  <CheckCircle2 size={29} />
                ) : (
                  <XCircle size={29} />
                )}
                <div className="inspection-counts">
                  <span>
                    <strong>{report.summary.errors}</strong> 项错误
                  </span>
                  <span>
                    <strong>{report.summary.warnings}</strong> 项建议
                  </span>
                  <span>
                    <strong>{report.summary.passed}</strong> 项通过
                  </span>
                </div>
              </div>
              {report.metadata.description && (
                <p className="inspection-description">
                  {report.metadata.description}
                </p>
              )}
              <div className="inspection-checks">
                {report.checks.map((check) => {
                  const Icon = statusIcons[check.status];
                  return (
                    <article
                      className={`inspection-check status-${check.status}`}
                      key={check.id}
                    >
                      <Icon size={18} />
                      <div>
                        <div className="inspection-check-title">
                          <h3>{check.label}</h3>
                          <span>{statusLabels[check.status]}</span>
                        </div>
                        <p>{check.message}</p>
                      </div>
                      {check.line !== undefined && (
                        <button
                          className="inspection-line"
                          onClick={() => jumpToLine(check.line!)}
                          aria-label={`定位${check.label}第 ${check.line} 行`}
                        >
                          L{check.line}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              <section className="inspection-resources">
                <h3>
                  文档中的资源引用 <span>{report.resources.length}</span>
                </h3>
                <p>
                  仅识别常见 Markdown
                  链接；不读取目标文件或访问链接，也不代表完整依赖清单。
                </p>
                {report.resources.length ? (
                  <ul>
                    {report.resources.slice(0, 50).map((resource) => (
                      <li key={resource.target}>
                        <div>
                          <span>{resourceLabels[resource.kind]}</span>
                          <code>{resource.target}</code>
                        </div>
                        <button
                          className="inspection-line"
                          onClick={() => jumpToLine(resource.line)}
                        >
                          L{resource.line}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>未识别到 Markdown 资源链接。</p>
                )}
                {report.resources.length > 50 && (
                  <p>此处展示前 50 项，完整列表见导出报告。</p>
                )}
              </section>
              <section className="inspection-fingerprint">
                <h3>
                  内容指纹 <span>SHA-256 / UTF-8 文本</span>
                </h3>
                <code>{report.source.textSha256}</code>
                <p>
                  {report.source.bytes.toLocaleString()} 字节 ·{" "}
                  {report.source.lines} 行 · 规则 v{report.rulesVersion}
                </p>
              </section>
              <div className="inspection-export">
                <a href={INSPECTION_SOURCE} target="_blank" rel="noreferrer">
                  格式参考：OpenAI Docs <ArrowUpRight size={13} />
                </a>
                <button
                  className="button secondary"
                  disabled={!report.summary.formatValid}
                  onClick={() => onSave(text)}
                >
                  保存为真实档案
                </button>
                <button
                  className="button primary"
                  onClick={() => onExport(report)}
                >
                  <ArrowDownToLine size={16} /> 导出检查报告
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
