import { useState } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleHelp,
  DatabaseBackup,
  FileJson,
  LoaderCircle,
  Upload,
} from "lucide-react";
import type { Run, Skill } from "../types";
import {
  createWorkspaceBackup,
  MAX_BACKUP_BYTES,
  mergeWorkspace,
  parseWorkspaceBackup,
} from "../workspace";
import type { ParsedBackup, WorkspaceBackup } from "../workspace";
import Modal from "./Modal";

interface Props {
  favorites: string[];
  runs: Run[];
  skills: Skill[];
  close: () => void;
  onExport: (backup: WorkspaceBackup) => void;
  onRestore: (backup: WorkspaceBackup) => void;
}

export default function WorkspaceTransfer({
  favorites,
  runs,
  skills,
  close,
  onExport,
  onRestore,
}: Props) {
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const preview = parsed
    ? mergeWorkspace({ favorites, runs }, parsed.backup)
    : null;

  async function readFile(file: File | undefined) {
    setParsed(null);
    setError("");
    setFileName("");
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError("文件超过 2 MB，请选择较小的工作区备份。");
      return;
    }
    setReading(true);
    try {
      const result = parseWorkspaceBackup(await file.text(), skills);
      setParsed(result);
      setFileName(file.name);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "无法读取备份文件，请重新选择。",
      );
    } finally {
      setReading(false);
    }
  }

  return (
    <Modal title="工作区备份与恢复" close={close}>
      <div className="backup-intro">
        <span className="backup-symbol">
          <DatabaseBackup size={25} />
        </span>
        <div>
          <h3>让工作区跟着你走。</h3>
          <p>将收藏和评测记录保存为文件，在另一浏览器中恢复。</p>
        </div>
      </div>
      <section className="backup-panel">
        <div className="backup-section-title">
          <h4>备份当前工作区</h4>
          <span>JSON 文件</span>
        </div>
        <div className="backup-counts">
          <span>
            <strong>{favorites.length}</strong> 项收藏
          </span>
          <span>
            <strong>{runs.length}</strong> 条记录
          </span>
          <span>
            <strong>{runs.filter((run) => run.snapshot).length}</strong>{" "}
            份历史快照
          </span>
        </div>
        <button
          className="button secondary"
          onClick={() => onExport(createWorkspaceBackup({ favorites, runs }))}
        >
          <ArrowDownToLine size={16} /> 导出工作区备份
        </button>
      </section>
      <section className="backup-panel">
        <div className="backup-section-title">
          <h4>从备份恢复</h4>
          <span>最大 2 MB</span>
        </div>
        <p className="backup-description">
          选择工作区备份后预览合并结果。已有记录会保留，同编号记录以本地版本为准。
        </p>
        <label
          className={`button secondary backup-file-picker ${reading ? "is-reading" : ""}`}
        >
          {reading ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Upload size={16} />
          )}
          {reading ? "正在校验…" : "选择备份文件"}
          <input
            className="visually-hidden"
            type="file"
            accept=".json,application/json"
            aria-label="选择备份文件"
            disabled={reading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void readFile(file);
            }}
          />
        </label>
        {error && (
          <div className="backup-error" role="alert">
            <CircleHelp size={16} />
            <span>{error}</span>
          </div>
        )}
        {parsed && preview && (
          <div className="backup-preview" aria-live="polite">
            <div className="backup-file-name">
              <FileJson size={18} />
              <strong>{fileName}</strong>
              <Check size={15} />
            </div>
            <p>
              备份时间：
              {new Date(parsed.backup.exportedAt).toLocaleString("zh-CN", {
                hour12: false,
              })}
            </p>
            <dl>
              <div>
                <dt>新增收藏</dt>
                <dd>{preview.addedFavorites} 项</dd>
              </div>
              <div>
                <dt>新增记录</dt>
                <dd>{preview.addedRuns} 条</dd>
              </div>
              <div>
                <dt>同编号记录</dt>
                <dd>{preview.duplicateRuns} 条，保留本地</dd>
              </div>
            </dl>
            {preview.conflictingRuns > 0 && (
              <p className="backup-warning">
                {preview.conflictingRuns} 条同编号记录内容不同，将保留本地版本。
              </p>
            )}
            {preview.skippedRuns > 0 && (
              <p className="backup-warning">
                记录上限为 100 条；空间不足，{preview.skippedRuns}{" "}
                条新记录将跳过。现有记录不会被替换。
              </p>
            )}
            {parsed.unknownFavorites > 0 && (
              <p className="backup-warning">
                {parsed.unknownFavorites} 项收藏已不在当前技能目录中，将跳过。
              </p>
            )}
            {parsed.backup.runs.some((run) => !run.snapshot) && (
              <p>旧版记录将作为历史摘要恢复，缺失的测试明细不会补造。</p>
            )}
            {preview.addedRuns === 0 && preview.addedFavorites === 0 && (
              <p>此备份没有可新增的数据。</p>
            )}
          </div>
        )}
      </section>
      <div className="notice compact">
        <CircleHelp size={17} />
        <span>
          文件仅在此浏览器中读取。备份包含演示数据，不代表真实评测或能力认证。
        </span>
      </div>
      <div className="modal-actions">
        <button className="button secondary" onClick={close}>
          关闭
        </button>
        <button
          className="button primary"
          disabled={
            reading ||
            !parsed ||
            !preview ||
            preview.addedRuns + preview.addedFavorites === 0
          }
          onClick={() => {
            if (parsed) onRestore(parsed.backup);
          }}
        >
          <Upload size={16} /> 合并导入
        </button>
      </div>
    </Modal>
  );
}
