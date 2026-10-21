import { useEffect, useState } from "react";
import { FIXTURE_ROOT } from "../benchmark";
import type { FixtureManifest } from "../benchmark";
export default function FixtureSuite() {
  const [manifest, setManifest] = useState<FixtureManifest | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); fetch(`${FIXTURE_ROOT}manifest.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error("无法加载真实基准文件"); return response.json(); }).then(setManifest).catch(cause => { if (!controller.signal.aborted) setError(String(cause)); }); return () => controller.abort(); }, []);
  return <section className="suite-card real-suite"><span className="demo-tag">真实测试文件 · 合成资料 · CC0</span><h2>数字 PDF 文本提取基准 v1.0.0</h2><p>5 项实际文件：单页、多页、空白页、标点以及损坏输入。只覆盖英文数字 PDF，不包含 OCR 或复杂版面。</p>{error && <p role="alert">{error}</p>}{manifest && <><p>{manifest.scoring}</p><div className="table-scroll"><table className="runs-table"><thead><tr><th>测试文件</th><th>预期结果</th><th>内容指纹</th></tr></thead><tbody>{manifest.cases.map(item => <tr key={item.id}><td><a href={`${FIXTURE_ROOT}${item.file}`} download>{item.title} ↓</a></td><td>{item.expect.error ? "应报错" : `${item.expect.pages.length} 页，按页核对文本`}</td><td><code>{item.sha256.slice(0, 16)}…</code></td></tr>)}</tbody></table></div><a className="button secondary" href={`${FIXTURE_ROOT}manifest.json`} download>下载测试清单与预期文本</a></>}</section>;
}
