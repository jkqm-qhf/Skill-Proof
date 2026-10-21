import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  DatabaseBackup,
  FileCheck2,
  FileSearch,
  FileText,
  FlaskConical,
  GitCompareArrows,
  History,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  X,
} from "lucide-react";
import { categories, skills, suites } from "./data";
import {
  filterSkills,
  parseIds,
  parseRuns,
  readStored,
  summarize,
} from "./lib";
import type { Category, Page, Run, Skill } from "./types";
import Modal from "./components/Modal";
import RunHistory from "./components/RunHistory";
import WorkspaceTransfer from "./components/WorkspaceTransfer";
import SkillInspector from "./components/SkillInspector";
import ProfileLibrary from "./components/ProfileLibrary";
import FixtureSuite from "./components/FixtureSuite";
import EvaluationLab from "./components/EvaluationLab";
import { EXECUTION_KEY, parseExecutions, PDF_SKILL_SOURCE } from "./executions";
import { reviseProfile } from "./profiles";
import { parseProfiles, persistProfiles, PROFILE_KEY } from "./profiles";
import { buildRunReport, createDemoRun } from "./runs";
import { mergeWorkspace } from "./workspace";
import { buildExecutionReport } from "./reports";

const iconMap = {
  file: FileText,
  scan: ScanLine,
  table: Table2,
  layers: Layers3,
  check: FileCheck2,
  book: BookOpen,
};
const navigation = [
  { id: "discover", label: "技能发现", icon: LayoutGrid },
  { id: "inspect", label: "技能检查", icon: FileSearch },
  { id: "profiles", label: "真实档案", icon: BookOpen },
  { id: "evaluate", label: "真实评测", icon: FlaskConical },
  { id: "benchmarks", label: "评测基准", icon: FlaskConical },
  { id: "compare", label: "技能对比", icon: GitCompareArrows },
  { id: "runs", label: "评测记录", icon: History },
] as const;

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SkillIcon({
  skill,
  small = false,
}: {
  skill: Skill;
  small?: boolean;
}) {
  const Icon = iconMap[skill.icon];
  return (
    <span className={`skill-icon ${skill.color} ${small ? "small" : ""}`}>
      <Icon size={small ? 19 : 25} strokeWidth={1.6} />
    </span>
  );
}

function App() {
  const initialPage =
    navigation.find((n) => `#${n.id}` === window.location.hash)?.id ??
    "discover";
  const [page, setPage] = useState<Page>(initialPage);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("全部技能");
  const [sort, setSort] = useState("default");
  const [favorites, setFavorites] = useState(() =>
    parseIds(readStored("skillproof:favorites"), skills),
  );
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [compared, setCompared] = useState<string[]>([]);
  const [detail, setDetail] = useState<Skill | null>(null);
  const [runner, setRunner] = useState(false);
  const [runSkillId, setRunSkillId] = useState(skills[0].id);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<Run[]>(() =>
    parseRuns(readStored("skillproof:runs"), skills),
  );
  const [info, setInfo] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [profiles, setProfiles] = useState(() =>
    parseProfiles(readStored(PROFILE_KEY)),
  );
  const [profileSource, setProfileSource] = useState<string | null>(null);
  const [executions, setExecutions] = useState(() =>
    parseExecutions(readStored(EXECUTION_KEY)),
  );
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = filterSkills(
    skills,
    query,
    category,
    sort,
    onlyFavorites ? favorites : undefined,
  );
  const chosen = skills.filter((skill) => compared.includes(skill.id));
  const runSkill = skills.find((skill) => skill.id === runSkillId)!;
  const runSuite = suites.find((suite) => suite.id === runSkill.suiteId)!;

  function navigate(next: Page) {
    window.location.hash = next;
    setPage(next);
  }
  function notify(message: string) {
    setToast(message);
  }
  useEffect(() => {
    function onHash() {
      setPage(
        navigation.find((n) => `#${n.id}` === window.location.hash)?.id ??
          "discover",
      );
    }
    function onKey(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "k" &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("skillproof:favorites", JSON.stringify(favorites));
      localStorage.setItem("skillproof:runs", JSON.stringify(runs));
    } catch {
      setToast("浏览器存储不可用，本次修改仅保留在当前页面。");
    }
  }, [favorites, runs]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(id);
    }
  }, [toast]);

  function toggleCompare(id: string) {
    if (compared.includes(id))
      setCompared(compared.filter((item) => item !== id));
    else if (compared.length >= 3)
      notify("最多同时对比 3 个技能，请先移除一个。");
    else setCompared([...compared, id]);
  }
  function openRunner(skillId?: string) {
    if (skillId) setRunSkillId(skillId);
    setDetail(null);
    setRunner(true);
  }
  function startRun() {
    if (running) return;
    setRunning(true);
    timer.current = setTimeout(() => {
      const run = createDemoRun(runSkill, runSuite, {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
      setRuns((previous) => [run, ...previous].slice(0, 100));
      setRunning(false);
      setRunner(false);
      navigate("runs");
      notify("演示流程完成，已保存示例结果。未执行真实技能。");
    }, 1500);
  }
  function exportRun(run: Run) {
    download(
      `skillproof-${run.skillId}-${run.id.slice(0, 8)}.json`,
      buildRunReport(run),
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳转到内容
      </a>
      <aside className="sidebar">
        <a className="brand" href="#discover" aria-label="SkillProof 首页">
          <span className="brand-mark">
            <CheckCheck size={24} />
          </span>
          <span>
            Skill<span className="brand-light">Proof</span>
            <small>技能实证</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">S</span>
          <div>
            探索工作台<small>本地工作区</small>
          </div>
          <span className="demo-mini">DEMO</span>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "compare" && compared.length > 0 && (
                <b>{compared.length}</b>
              )}
              {item.id === "runs" && runs.length > 0 && <b>{runs.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={25} />
            <strong>能力，需要证据。</strong>
            <p>用清晰的测试，找到适合你的 AI 技能。</p>
            <button onClick={() => setInfo(true)}>
              了解评测方式 <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="help-link" onClick={() => setInfo(true)}>
            <CircleHelp size={17} /> 关于 SkillProof <span>v0.1</span>
          </button>
          <div className="profile">
            <span className="avatar">S</span>
            <div>
              本地探索者<small>数据保存在此浏览器</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作台 <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="preview-label">
              <span /> 开发预览
            </span>
            <button
              className="workspace-transfer-button"
              onClick={() => setTransfer(true)}
              aria-label="工作区备份与恢复"
              title="工作区备份与恢复"
            >
              <DatabaseBackup size={17} />
              <span>备份与恢复</span>
            </button>
            <button
              className="icon-button"
              onClick={() => setInfo(true)}
              aria-label="使用帮助"
            >
              <CircleHelp size={19} />
            </button>
            <span className="avatar top-avatar">S</span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">EVIDENCE OVER ASSUMPTIONS</div>
              <h1>
                {page === "discover"
                  ? "让每一项能力，有据可查。"
                  : page === "evaluate"
                    ? "用真实文件，运行可检查的测试。"
                    : page === "profiles"
                      ? "把真实技能，保存为可追溯的档案。"
                      : page === "inspect"
                        ? "从技能文件，开始建立证据。"
                        : page === "benchmarks"
                          ? "好的评测，从标准开始。"
                          : page === "compare"
                            ? "把差异放在同一张桌上。"
                            : "每一次验证，都留下记录。"}
              </h1>
              <p>
                {page === "discover"
                  ? "发现、理解和比较 AI 技能，用可验证的结果做选择。"
                  : page === "evaluate"
                    ? "登记适配器、指定档案版本，记录实际输出与测量结果。"
                    : page === "profiles"
                      ? "维护技能原文、版本与声明；实际能力由后续真实评测验证。"
                      : page === "inspect"
                        ? "检查真实 SKILL.md 的基础结构，定位问题，导出可追溯的静态报告。"
                        : page === "benchmarks"
                          ? "查看测试维度与能力边界，建立一致的评价方式。"
                          : page === "compare"
                            ? "结合能力、运行条件与测试范围，找到适合任务的技能。"
                            : "回顾本地演示流程，导出带有数据来源说明的结果。"}
              </p>
            </div>
            {page !== "inspect" && (
              <button className="button primary" onClick={() => openRunner()}>
                <Plus size={17} /> 新建演示评测
              </button>
            )}
          </div>

          <div hidden={page !== "inspect"}>
            <SkillInspector
              onSave={(source) => {
                setProfileSource(source);
                navigate("profiles");
              }}
              onExport={(report) =>
                download(
                  `skillproof-inspection-${report.source.textSha256.slice(0, 12)}.json`,
                  report,
                )
              }
            />
          </div>

          {page === "evaluate" && (
            <EvaluationLab
              profiles={profiles}
              executions={executions}
              onRegister={async () => {
                const existing = profiles.find(
                  (item) => item.revisions.at(-1)?.source === PDF_SKILL_SOURCE,
                );
                if (existing) return existing.id;
                const { profile } = await reviseProfile(
                  undefined,
                  PDF_SKILL_SOURCE,
                  {
                    claims: ["提取英文数字 PDF 的逐页文字"],
                    environment: "Browser / PDF.js",
                    permissions: ["读取选定的基准文件"],
                  },
                );
                const next = [...profiles, profile];
                persistProfiles(next);
                setProfiles(next);
                return profile.id;
              }}
              onExecution={(execution) => {
                const next = [execution, ...executions].slice(0, 50);
                localStorage.setItem(EXECUTION_KEY, JSON.stringify(next));
                setExecutions(next);
              }}
              onExport={(execution) => { void buildExecutionReport(execution).then(report => download(`skillproof-execution-${execution.id}.json`, report)).catch(cause => notify(String(cause))); }}
            />
          )}

          {page === "profiles" && (
            <ProfileLibrary
              profiles={profiles}
              initialSource={profileSource}
              onClearSource={() => setProfileSource(null)}
              onExport={(profile) =>
                download(`skillproof-profile-${profile.id}.json`, {
                  type: "skillproof-profile",
                  profile,
                })
              }
              onSave={(profile) => {
                const next = profiles.some((item) => item.id === profile.id)
                  ? profiles.map((item) =>
                      item.id === profile.id ? profile : item,
                    )
                  : [...profiles, profile];
                persistProfiles(next);
                setProfiles(next);
                notify("真实档案版本已保存；声明能力尚未验证。");
              }}
            />
          )}

          {page === "discover" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="pill hero-pill">
                    <span /> SKILLPROOF LAB
                  </span>
                  <h2>
                    一份档案，读懂
                    <br />
                    <span>技能的能力与边界。</span>
                  </h2>
                  <p>
                    能做什么、在哪运行、表现如何。
                    <br />
                    把每个技能的能力与边界，一起看清楚。
                  </p>
                  <button onClick={() => setDetail(skills[0])}>
                    探索示例档案 <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit-dot dot-one" />
                  <div className="orbit-dot dot-two" />
                  <span className="art-label label-one">
                    CAPABILITY, VERIFIED.
                  </span>
                  <div className="proof-paper">
                    <div className="paper-top">
                      <span className="paper-logo">
                        <CheckCheck size={22} />
                      </span>
                      <span>
                        SKILL PASSPORT<small>DEMONSTRATION / 001</small>
                      </span>
                      <ShieldCheck size={22} />
                    </div>
                    <div className="paper-title">
                      PDF Reader <span>v1.2.0</span>
                    </div>
                    <div className="paper-line">
                      <span>示例测试通过率</span>
                      <b>
                        91.7<span>%</span>
                      </b>
                    </div>
                    <div className="paper-bars">
                      {[94, 72, 88, 100, 84, 94, 76, 91, 100, 86, 96, 91].map(
                        (height, i) => (
                          <i key={i} style={{ height: `${height}%` }} />
                        ),
                      )}
                    </div>
                    <div className="paper-bottom">
                      <span>
                        <Check size={12} /> 44 / 48 示例用例
                      </span>
                      <span>DEMO DATA</span>
                    </div>
                  </div>
                  <span className="art-label label-two">
                    <span /> BUILT ON EVIDENCE
                  </span>
                </div>
              </section>
              <section className="stats-row" aria-label="演示项目统计">
                <div>
                  <span className="stat-icon">
                    <Layers3 size={20} />
                  </span>
                  <div>
                    <span>示例技能</span>
                    <strong>
                      {skills.length.toString().padStart(2, "0")}
                      <small>份能力档案</small>
                    </strong>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <FlaskConical size={20} />
                  </span>
                  <div>
                    <span>基准模板</span>
                    <strong>
                      {suites.length.toString().padStart(2, "0")}
                      <small>类测试场景</small>
                    </strong>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <BarChart3 size={20} />
                  </span>
                  <div>
                    <span>示例用例</span>
                    <strong>
                      {skills.reduce(
                        (sum, skill) => sum + summarize(skill).total,
                        0,
                      )}
                      <small>条预设结果</small>
                    </strong>
                  </div>
                </div>
                <div>
                  <span className="stat-icon">
                    <History size={20} />
                  </span>
                  <div>
                    <span>本地记录</span>
                    <strong>
                      {runs.length.toString().padStart(2, "0")}
                      <small>次演示评测</small>
                    </strong>
                  </div>
                </div>
              </section>
              <section className="catalog">
                <div className="section-heading">
                  <div>
                    <h2>
                      发现技能 <span>THE SKILL DIRECTORY</span>
                    </h2>
                    <p>从文档处理开始，找到适合你工作流的能力。</p>
                  </div>
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索技能、能力或关键词…"
                      aria-label="搜索技能"
                    />
                    <kbd>Ctrl K</kbd>
                  </label>
                </div>
                <div className="filter-row">
                  <div className="category-tabs" aria-label="技能类别">
                    {categories.map((item) => (
                      <button
                        key={item}
                        className={category === item ? "selected" : ""}
                        onClick={() => setCategory(item)}
                        aria-pressed={category === item}
                      >
                        {item}
                        {item === "全部技能" && <span>{skills.length}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="filter-actions">
                    <button
                      className={`favorite-filter ${onlyFavorites ? "enabled" : ""}`}
                      aria-pressed={onlyFavorites}
                      onClick={() => setOnlyFavorites(!onlyFavorites)}
                    >
                      <Star
                        size={15}
                        fill={onlyFavorites ? "currentColor" : "none"}
                      />{" "}
                      已收藏
                    </button>
                    <label className="sort-control">
                      <select
                        aria-label="排序方式"
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                      >
                        <option value="default">默认排序</option>
                        <option value="rate">通过率优先</option>
                        <option value="speed">耗时从低到高</option>
                      </select>
                      <ChevronDown size={13} />
                    </label>
                  </div>
                </div>
                <div className="catalog-meta">
                  <span>
                    {query || onlyFavorites || category !== "全部技能"
                      ? "找到"
                      : "共"}{" "}
                    {filtered.length} 个技能
                  </span>
                  <span>
                    <span className="tiny-square" /> 演示档案 · 非真实认证 ·
                    仅同基准可比较
                  </span>
                </div>
                <div className="skill-grid">
                  {filtered.map((skill) => {
                    const summary = summarize(skill);
                    return (
                      <article className="skill-card" key={skill.id}>
                        <div className="card-top">
                          <SkillIcon skill={skill} />
                          <button
                            className={`icon-button favorite-button ${favorites.includes(skill.id) ? "favorited" : ""}`}
                            aria-label={`${favorites.includes(skill.id) ? "取消收藏" : "收藏"} ${skill.name}`}
                            aria-pressed={favorites.includes(skill.id)}
                            onClick={() =>
                              setFavorites(
                                favorites.includes(skill.id)
                                  ? favorites.filter((id) => id !== skill.id)
                                  : [...favorites, skill.id],
                              )
                            }
                          >
                            <Star
                              size={17}
                              fill={
                                favorites.includes(skill.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </div>
                        <div className="card-title">
                          <button onClick={() => setDetail(skill)}>
                            {skill.name}
                          </button>
                          <span>v{skill.version}</span>
                        </div>
                        <div className="card-subtitle">{skill.subtitle}</div>
                        <p className="card-description">{skill.description}</p>
                        <div className="tags">
                          {skill.tags.map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                        <div className="card-metrics">
                          <div>
                            <span>示例通过率</span>
                            <strong>
                              {summary.rate.toFixed(1)}
                              <small>%</small>
                            </strong>
                          </div>
                          <div>
                            <span>示例用例</span>
                            <strong>
                              {summary.passed}
                              <small> / {summary.total}</small>
                            </strong>
                          </div>
                          <div>
                            <span>示例总耗时</span>
                            <strong>
                              {summary.duration}
                              <small> s</small>
                            </strong>
                          </div>
                        </div>
                        <div className="card-footer">
                          <button
                            className={`compare-toggle ${compared.includes(skill.id) ? "checked" : ""}`}
                            aria-pressed={compared.includes(skill.id)}
                            onClick={() => toggleCompare(skill.id)}
                          >
                            <span>
                              {compared.includes(skill.id) && (
                                <Check size={11} />
                              )}
                            </span>
                            加入对比
                          </button>
                          <button
                            className="detail-link"
                            onClick={() => setDetail(skill)}
                          >
                            查看档案 <ArrowUpRight size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {filtered.length === 0 && (
                  <div className="empty-state">
                    <Search size={32} />
                    <h3>没有找到匹配的技能</h3>
                    <p>试试其他关键词，或清除筛选条件。</p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setQuery("");
                        setCategory("全部技能");
                        setOnlyFavorites(false);
                      }}
                    >
                      清除筛选
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          {page === "benchmarks" && (
            <>
              <FixtureSuite />
              <div className="notice">
                <FlaskConical size={19} />
                <div>
                  <strong>先定义成功，再比较表现。</strong>
                  <p>
                    以下是基准设计模板。当前原型不包含真实测试文件或执行器，示例结果来自预设数据。
                  </p>
                </div>
              </div>
              <div className="suite-grid">
                {suites.map((suite, index) => (
                  <article className="suite-card" key={suite.id}>
                    <span className="suite-number">
                      0{index + 1} / BENCHMARK
                    </span>
                    <FlaskConical size={27} />
                    <h2>{suite.name}</h2>
                    <p>{suite.description}</p>
                    <ul>
                      {suite.checks.map((check) => (
                        <li key={check}>
                          <Check size={15} />
                          {check}
                        </li>
                      ))}
                    </ul>
                    <div className="suite-footer">
                      <span>模板 v{suite.version}</span>
                      <button
                        className="detail-link"
                        onClick={() =>
                          openRunner(
                            skills.find((skill) => skill.suiteId === suite.id)!
                              .id,
                          )
                        }
                      >
                        演示评测 <ArrowRight size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {page === "compare" && (
            <>
              {chosen.length < 2 && (
                <div className="notice">
                  <GitCompareArrows size={20} />
                  <div>
                    <strong>选择 2–3 个技能，查看能力差异。</strong>
                    <p>
                      不同基准的通过率不可直接用于排名；请同时查看用例范围与能力限制。
                    </p>
                  </div>
                </div>
              )}
              {chosen.length > 0 ? (
                <section className="comparison-section">
                  <div className="section-heading">
                    <h2>
                      能力对照 <span>{chosen.length} SKILLS SELECTED</span>
                    </h2>
                    <button
                      className="button secondary"
                      onClick={() => navigate("discover")}
                    >
                      <Plus size={15} /> 继续添加
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="comparison-table">
                      <thead>
                        <tr>
                          <th>比较维度</th>
                          {chosen.map((skill) => (
                            <th key={skill.id}>
                              <div className="compare-title">
                                <SkillIcon skill={skill} small />
                                <span>{skill.name}</span>
                                <button
                                  className="icon-button"
                                  onClick={() => toggleCompare(skill.id)}
                                  aria-label={`移除 ${skill.name}`}
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["技能类别", (s: Skill) => s.category],
                          ["版本", (s: Skill) => `v${s.version}`],
                          [
                            "评测基准",
                            (s: Skill) =>
                              suites.find((suite) => suite.id === s.suiteId)
                                ?.name,
                          ],
                          [
                            "示例通过率",
                            (s: Skill) =>
                              `${summarize(s).rate.toFixed(1)}%（${summarize(s).passed}/${summarize(s).total}）`,
                          ],
                          [
                            "示例总耗时",
                            (s: Skill) => `${summarize(s).duration} s`,
                          ],
                          [
                            "支持能力",
                            (s: Skill) => (
                              <ul>
                                {s.supported.map((value) => (
                                  <li key={value}>{value}</li>
                                ))}
                              </ul>
                            ),
                          ],
                          [
                            "能力边界",
                            (s: Skill) => (
                              <ul>
                                {s.limitations.map((value) => (
                                  <li key={value}>{value}</li>
                                ))}
                              </ul>
                            ),
                          ],
                          ["运行环境", (s: Skill) => s.environment],
                          ["所需权限", (s: Skill) => s.permissions.join("、")],
                        ].map(([label, render]) => (
                          <tr key={label as string}>
                            <th>{label as string}</th>
                            {chosen.map((skill) => (
                              <td key={skill.id}>
                                {(render as (s: Skill) => ReactNode)(skill)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="table-note">
                    所有指标均为虚构示例。耗时为整个示例测试集的预设合计，不代表实际执行性能。
                  </p>
                </section>
              ) : (
                <div className="empty-state large">
                  <GitCompareArrows size={40} />
                  <h3>你的第一组技能对比</h3>
                  <p>在技能卡片上点击「加入对比」，最多可选择 3 项。</p>
                  <button
                    className="button primary"
                    onClick={() => navigate("discover")}
                  >
                    前往技能发现 <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}

          {page === "runs" && (
            <RunHistory
              runs={runs}
              skills={skills}
              suites={suites}
              onStart={openRunner}
              onExport={exportRun}
              onExportMany={(selectedRuns) =>
                download(
                  `skillproof-runs-${new Date().toISOString().slice(0, 10)}.json`,
                  {
                    schemaVersion: "0.2.0",
                    mode: "demo",
                    exportedAt: new Date().toISOString(),
                    count: selectedRuns.length,
                    reports: selectedRuns.map(buildRunReport),
                  },
                )
              }
              onDelete={(ids) => {
                const removed = new Set(ids);
                setRuns((previous) =>
                  previous.filter((run) => !removed.has(run.id)),
                );
                notify(`已删除 ${ids.length} 条评测记录。`);
              }}
            />
          )}

          <footer className="page-footer">
            <span>
              <span className="footer-mark">
                <CheckCheck size={14} />
              </span>{" "}
              SkillProof <span className="footer-separator">/</span> 让 AI
              技能的能力有据可查。
            </span>
            <button onClick={() => setInfo(true)}>
              关于数据与评测 <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>

      {compared.length > 0 && page === "discover" && (
        <div className="compare-tray">
          <GitCompareArrows size={20} />
          <div>
            <strong>已选择 {compared.length} 项技能</strong>
            <span>{chosen.map((s) => s.name).join(" · ")}</span>
          </div>
          <button className="tray-clear" onClick={() => setCompared([])}>
            清空
          </button>
          <button
            className="button primary"
            onClick={() => navigate("compare")}
          >
            查看对比 <ArrowRight size={15} />
          </button>
        </div>
      )}

      {detail && (
        <Modal title="技能能力档案" close={() => setDetail(null)} wide>
          <div className="detail-heading">
            <SkillIcon skill={detail} />
            <div>
              <h3>
                {detail.name}
                <span>v{detail.version}</span>
              </h3>
              <p>{detail.subtitle}</p>
            </div>
            <span className="demo-tag">演示档案</span>
          </div>
          <p className="detail-description">{detail.description}</p>
          <div className="detail-stats">
            <div>
              <span>示例通过率</span>
              <strong>{summarize(detail).rate.toFixed(1)}%</strong>
            </div>
            <div>
              <span>通过 / 总用例</span>
              <strong>
                {summarize(detail).passed} / {summarize(detail).total}
              </strong>
            </div>
            <div>
              <span>基准版本</span>
              <strong>v0.1.0</strong>
            </div>
          </div>
          <div className="detail-columns">
            <section>
              <h4>
                <Check size={16} /> 支持的能力
              </h4>
              <ul>
                {detail.supported.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4>
                <CircleHelp size={16} /> 已知边界
              </h4>
              <ul>
                {detail.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
          <section className="detail-cases">
            <h4>
              示例测试明细{" "}
              <span>{suites.find((s) => s.id === detail.suiteId)?.name}</span>
            </h4>
            {detail.cases.map((item) => (
              <div className="case-row" key={item.name}>
                <span>{item.name}</span>
                <div className="progress-track">
                  <i
                    style={{ width: `${(item.passed / item.total) * 100}%` }}
                  />
                </div>
                <strong>
                  {item.passed} / {item.total}
                </strong>
                <small>{item.seconds} s</small>
              </div>
            ))}
          </section>
          <div className="requirements">
            <p>
              <strong>运行环境</strong>
              {detail.environment}
            </p>
            <p>
              <strong>所需权限</strong>
              {detail.permissions.join("、")}
            </p>
          </div>
          <div className="notice compact">
            <CircleHelp size={17} />
            <span>技能名称、版本和测试结果均为虚构示例，不构成能力认证。</span>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() =>
                download(`skillproof-${detail.id}-passport.json`, {
                  schemaVersion: "0.1.0",
                  mode: "demo",
                  disclaimer: "Fictional skill passport and fixture results.",
                  skill: detail,
                  suite: suites.find((s) => s.id === detail.suiteId),
                })
              }
            >
              <ArrowDownToLine size={16} /> 导出档案
            </button>
            <button
              className="button primary"
              onClick={() => openRunner(detail.id)}
            >
              演示评测 <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}

      {runner && (
        <Modal
          title="新建演示评测"
          closeDisabled={running}
          close={() => {
            if (!running) setRunner(false);
          }}
        >
          <div className="notice compact">
            <Sparkles size={18} />
            <span>
              演示模式：回放预设结果，不执行真实技能，也不会产生 API 费用。
            </span>
          </div>
          <div className="runner-fields">
            <label>
              选择技能
              <select
                value={runSkillId}
                disabled={running}
                onChange={(event) => setRunSkillId(event.target.value)}
              >
                {skills.map((skill) => (
                  <option value={skill.id} key={skill.id}>
                    {skill.name} · v{skill.version}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-label">匹配的评测基准</div>
            <div className="suite-selection">
              <FlaskConical size={22} />
              <div>
                <strong>{runSuite.name}</strong>
                <p>{runSuite.description}</p>
              </div>
              <span>v{runSuite.version}</span>
            </div>
            <div className="runner-summary">
              <span>
                <FileText size={16} /> {summarize(runSkill).total} 条预设用例
              </span>
              <span>
                <Clock3 size={16} /> 约 2 秒演示
              </span>
            </div>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={running}
              onClick={() => setRunner(false)}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={running}
              onClick={startRun}
            >
              {running ? (
                <>
                  <LoaderCircle size={17} className="spin" /> 正在回放示例…
                </>
              ) : (
                <>
                  <FlaskConical size={17} /> 开始演示
                </>
              )}
            </button>
          </div>
        </Modal>
      )}

      {transfer && (
        <WorkspaceTransfer
          favorites={favorites}
          runs={runs}
          skills={skills}
          close={() => setTransfer(false)}
          onExport={(backup) =>
            download(
              `skillproof-workspace-${backup.exportedAt.slice(0, 10)}.json`,
              backup,
            )
          }
          onRestore={(backup) => {
            const merged = mergeWorkspace({ favorites, runs }, backup);
            setFavorites(merged.favorites);
            setRuns(merged.runs);
            setTransfer(false);
            notify(
              `已导入 ${merged.addedFavorites} 项收藏和 ${merged.addedRuns} 条记录。`,
            );
          }}
        />
      )}

      {info && (
        <Modal title="关于 SkillProof" close={() => setInfo(false)}>
          <div className="about-copy">
            <span className="pill">FOUNDATION / v0.1.0</span>
            <h3>让能力的承诺，变成可检查的证据。</h3>
            <p>
              SkillProof 希望为 AI
              技能提供统一的能力档案：支持范围、运行条件、所需权限，以及可复现的评测结果。
            </p>
            <h4>这个版本可以做什么？</h4>
            <p>
              浏览和筛选示例技能、收藏档案、对比能力、回放演示评测，并导出 JSON
              报告。技能检查页支持上传真实 SKILL.md
              或粘贴内容，执行静态结构检查并导出报告。收藏与演示记录保存在当前浏览器，可通过顶部“备份与恢复”导出或合并导入。
            </p>
            <h4>如何理解这里的数据？</h4>
            <p>
              技能目录和评测记录使用虚构演示数据。技能检查报告基于实际输入文本，只检查文档结构，不代表真实执行表现。评测基准目前是设计模板，尚未接入执行器、模型
              API 或认证服务。不同基准的分数不可直接比较。
            </p>
            <h4>独立项目</h4>
            <p>SkillProof 是独立原型，与 OpenAI 无官方隶属或认证关系。</p>
          </div>
          <div className="modal-actions">
            <button className="button primary" onClick={() => setInfo(false)}>
              开始探索 <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CircleHelp size={17} />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="关闭提示"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
