import { useEffect, useState } from "react";
import type { Execution } from "../executions";
import {
  compareVerifiedExecutions,
  findRegressionBaseline,
} from "../comparison";
const labels: Record<string, string> = {
  regressed: "退化",
  improved: "改善",
  "output-changed": "评分相同、输出变化",
  unchanged: "无变化",
};
export default function ExecutionComparison({
  executions,
  candidate,
}: {
  executions: Execution[];
  candidate: Execution | null;
}) {
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [comparison, setComparison] = useState<Awaited<
    ReturnType<typeof compareVerifiedExecutions>
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setComparison(null); setError(""); setBusy(false);
    if (candidate) {
      const baseline = findRegressionBaseline(candidate, executions);
      if (baseline) {
        setBefore(baseline.id);
        setAfter(candidate.id);
        setBusy(true);
        void compareVerifiedExecutions(baseline, candidate)
          .then((result) => {
            if (!cancelled) setComparison(result);
          })
          .catch((cause) => {
            if (!cancelled) setError(String(cause));
          })
          .finally(() => {
            if (!cancelled) setBusy(false);
          });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [candidate, executions]);
  async function compare() {
    const first = executions.find((item) => item.id === before),
      second = executions.find((item) => item.id === after);
    if (!first || !second) return;
    setError("");
    setComparison(null);
    setBusy(true);
    try {
      setComparison(await compareVerifiedExecutions(first, second));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="suite-card">
      <h2>同条件对比与版本回归</h2>
      <p>
        新版本出现相容的旧版本结果时自动对照。不同基准、执行器、环境标签或资源限制会阻止比较。耗时只供观察，不作为性能排名。
      </p>
      <div className="profile-form">
        <label>
          基线执行
          <select
            aria-label="基线执行"
            disabled={busy}
            value={before}
            onChange={(event) => {
              setBefore(event.target.value);
              setComparison(null);
            }}
          >
            <option value="">选择基线</option>
            {executions.map((item) => (
              <option value={item.id} key={item.id}>
                {item.profile.name} v{item.profile.version} ·{" "}
                {item.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          候选执行
          <select
            aria-label="候选执行"
            disabled={busy}
            value={after}
            onChange={(event) => {
              setAfter(event.target.value);
              setComparison(null);
            }}
          >
            <option value="">选择候选</option>
            {executions.map((item) => (
              <option value={item.id} key={item.id}>
                {item.profile.name} v{item.profile.version} ·{" "}
                {item.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="button secondary"
        disabled={busy || !before || !after || before === after}
        onClick={() => void compare()}
      >
        {busy ? "核验证据…" : "核对条件并比较"}
      </button>
      {error && (
        <p role="alert" className="backup-error">
          {error}
        </p>
      )}
      {comparison && !comparison.compatible && (
        <div className="notice">
          <div>
            <strong>这些执行条件不相容，不能直接比较。</strong>
            <p>{comparison.reasons.join("；")}</p>
          </div>
        </div>
      )}
      {comparison?.compatible && (
        <>
          <p className="table-note">
            退化{" "}
            {
              comparison.cases.filter((item) => item.change === "regressed")
                .length
            }{" "}
            项 · 改善{" "}
            {
              comparison.cases.filter((item) => item.change === "improved")
                .length
            }{" "}
            项 · 输出变化{" "}
            {
              comparison.cases.filter(
                (item) => item.change === "output-changed",
              ).length
            }{" "}
            项
          </p>
          <div className="table-scroll">
            <table className="runs-table">
              <thead>
                <tr>
                  <th>用例</th>
                  <th>基线</th>
                  <th>候选</th>
                  <th>变化</th>
                </tr>
              </thead>
              <tbody>
                {comparison.cases.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.before ? "通过" : "失败"}</td>
                    <td>{item.after ? "通过" : "失败"}</td>
                    <td>{labels[item.change]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
