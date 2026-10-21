export type Category =
  | "全部技能"
  | "PDF 处理"
  | "表格提取"
  | "文档转换"
  | "内容校验";
export type Page =
  | "discover"
  | "profiles"
  | "evaluate"
  | "gallery"
  | "inspect"
  | "benchmarks"
  | "compare"
  | "runs";

export interface Skill {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: Exclude<Category, "全部技能">;
  version: string;
  color: string;
  icon: "file" | "scan" | "table" | "layers" | "check" | "book";
  tags: string[];
  supported: string[];
  limitations: string[];
  environment: string;
  permissions: string[];
  suiteId: string;
  cases: { name: string; passed: number; total: number; seconds: number }[];
}

export interface Suite {
  id: string;
  name: string;
  description: string;
  categories: Skill["category"][];
  checks: string[];
  version: string;
}

export interface Run {
  id: string;
  skillId: string;
  suiteId: string;
  createdAt: string;
  passed: number;
  total: number;
  duration: number;
  mode: "demo";
  snapshot?: RunSnapshot;
}

export interface RunSnapshot {
  skillName: string;
  skillVersion: string;
  suiteName: string;
  suiteVersion: string;
  environment: string;
  cases: Skill["cases"];
}
