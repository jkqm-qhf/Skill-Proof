import { isMap, isNode, LineCounter, parseDocument } from "yaml";

export const MAX_SKILL_BYTES = 256 * 1024;
export const INSPECTION_SOURCE =
  "https://developers.openai.com/plugins/build/skills";
export const SAMPLE_SKILL = `---
name: document-summary
description: Summarize a supplied document when the user asks for a concise overview. Use only the supplied content.
---

# Document summary

## Inputs
- A document supplied by the user.
- The requested summary language and length.

## Workflow
1. Read the document and identify its main claims.
2. Separate reported facts from author interpretations.
3. Ask for clarification if a required page is missing.

## Outputs
- A concise summary with page references.
- A list of missing information, when applicable.

See [format guidance](references/summary-format.md) when formatting the result.
`;

export type CheckStatus = "pass" | "error" | "warning" | "skipped";
export interface InspectionCheck {
  id: string;
  label: string;
  required: boolean;
  status: CheckStatus;
  message: string;
  line?: number;
}
export interface SkillInspection {
  type: "skillproof-static-inspection";
  schemaVersion: "0.1.0";
  rulesVersion: "0.1.0";
  mode: "static";
  createdAt: string;
  source: {
    fileName: string;
    inputKind: "paste" | "file" | "sample";
    textSha256: string;
    bytes: number;
    lines: number;
  };
  metadata: { name: string | null; description: string | null };
  checks: InspectionCheck[];
  resources: {
    target: string;
    kind: "local" | "external" | "anchor" | "other";
    line: number;
  }[];
  summary: {
    errors: number;
    warnings: number;
    passed: number;
    skipped: number;
    formatValid: boolean;
  };
  rulesSource: string;
  disclaimer: string;
}

// Ignore fenced examples when looking for document headings and resource links.
function withoutFences(lines: string[]) {
  let fence: { character: string; length: number } | null = null;
  return lines.map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence.character &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = null;
      return "";
    }
    if (marker) {
      fence = { character: marker[1][0], length: marker[1].length };
      return "";
    }
    return line;
  });
}

export async function inspectSkillDocument(
  text: string,
  fileName = "粘贴内容",
  inputKind: "paste" | "file" | "sample" = "paste",
): Promise<SkillInspection> {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_SKILL_BYTES)
    throw new Error("内容超过 256 KB，请选择较小的 SKILL.md 文件。");
  if (text.includes("\u0000"))
    throw new Error("内容包含空字符，请提供 UTF-8 编码的 Markdown 文本。");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const textSha256 = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const checks: InspectionCheck[] = [];
  const closing = lines.findIndex(
    (line, index) => index > 0 && /^---[ \t]*$/.test(line),
  );
  const hasHeader = /^---[ \t]*$/.test(lines[0]) && closing > 0;
  checks.push({
    id: "frontmatter",
    label: "元数据分隔符",
    required: true,
    status: hasHeader ? "pass" : "error",
    line: 1,
    message: hasHeader
      ? "文件开头包含一对独立成行的 --- 分隔符。"
      : "请在文件开头使用 --- 包围 YAML 元数据，并在正文前关闭该区块。",
  });
  let metadata: Record<string, unknown> | null = null;
  let nameLine = 2,
    descriptionLine = 2;
  if (hasHeader) {
    try {
      const lineCounter = new LineCounter();
      const document = parseDocument(lines.slice(1, closing).join("\n"), {
        lineCounter,
        uniqueKeys: true,
      });
      if (document.errors.length) {
        const error = document.errors[0];
        checks.push({
          id: "yaml",
          label: "YAML 语法与结构",
          required: true,
          status: "error",
          line: (error.linePos?.[0]?.line ?? 1) + 1,
          message: `YAML 解析失败：${error.message.split("\n")[0]}`,
        });
      } else if (!isMap(document.contents)) {
        checks.push({
          id: "yaml",
          label: "YAML 语法与结构",
          required: true,
          status: "error",
          line: 2,
          message: "元数据应为键值映射，不能是列表或单个值。",
        });
      } else {
        metadata = document.toJS({ maxAliasCount: 20 }) as Record<
          string,
          unknown
        >;
        const nameNode = document.get("name", true);
        const descriptionNode = document.get("description", true);
        if (isNode(nameNode) && nameNode.range)
          nameLine = lineCounter.linePos(nameNode.range[0]).line + 1;
        if (isNode(descriptionNode) && descriptionNode.range)
          descriptionLine =
            lineCounter.linePos(descriptionNode.range[0]).line + 1;
        checks.push({
          id: "yaml",
          label: "YAML 语法与结构",
          required: true,
          status: "pass",
          line: 2,
          message: "元数据可解析为 YAML 键值映射，未检测到重复键。",
        });
        if (document.warnings.length)
          checks.push({
            id: "yaml-warning",
            label: "YAML 兼容性提示",
            required: false,
            status: "warning",
            message: document.warnings
              .map((warning) => warning.message.split("\n")[0])
              .join("；"),
          });
      }
    } catch {
      metadata = null;
      checks.push({
        id: "yaml",
        label: "YAML 语法与结构",
        required: true,
        status: "error",
        line: 2,
        message: "无法展开 YAML 元数据；请检查别名引用或过度嵌套的内容。",
      });
    }
  } else
    checks.push({
      id: "yaml",
      label: "YAML 语法与结构",
      required: true,
      status: "skipped",
      message: "补全元数据分隔符后才能检查。",
    });
  const name =
    typeof metadata?.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : null;
  const description =
    typeof metadata?.description === "string" && metadata.description.trim()
      ? metadata.description.trim()
      : null;
  for (const [id, label, value, line] of [
    ["name", "技能名称 name", name, nameLine],
    ["description", "技能描述 description", description, descriptionLine],
  ] as const) {
    checks.push({
      id,
      label,
      required: true,
      status: !metadata ? "skipped" : value ? "pass" : "error",
      line: metadata ? line : undefined,
      message: !metadata
        ? "修复 YAML 后才能检查此字段。"
        : value
          ? "字段存在且为非空字符串。"
          : `请填写非空字符串 ${id}，不要使用列表、数字或布尔值。`,
    });
  }
  const bodyLines = hasHeader ? lines.slice(closing + 1) : [];
  const body = bodyLines.join("\n").trim();
  const bodyStart = closing + 2;
  checks.push({
    id: "body",
    label: "技能正文",
    required: true,
    status: !hasHeader ? "skipped" : body ? "pass" : "error",
    line: hasHeader ? bodyStart : undefined,
    message: !hasHeader
      ? "补全元数据区块后才能定位正文。"
      : body
        ? "元数据之后包含正文。检查器不判断指令能否正确执行。"
        : "请在元数据区块之后填写技能指令。",
  });
  const visible = withoutFences(bodyLines);
  const headings = visible
    .map((line, index) => ({
      text: line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1],
      line: bodyStart + index,
    }))
    .filter((item) => item.text);
  const hasInputs = headings.some((item) =>
    /\b(inputs?|arguments?|parameters?)\b|输入|入参/i.test(item.text!),
  );
  const hasOutputs = headings.some((item) =>
    /\b(outputs?|results?|deliverables?)\b|输出|交付/i.test(item.text!),
  );
  checks.push({
    id: "sections",
    label: "输入与输出章节（建议）",
    required: false,
    status: !body ? "skipped" : hasInputs && hasOutputs ? "pass" : "warning",
    message: !body
      ? "填写正文后再检查章节。"
      : hasInputs && hasOutputs
        ? "检测到输入与输出相关标题；这里只核对标题，不评估内容质量。"
        : "未同时找到明确的输入、输出标题。建议说明所需材料与交付物；这不是格式错误。",
  });
  const hasSteps = visible.some((line) =>
    /^\s*(?:\d+[.)]|[-*+])\s+\S/.test(line),
  );
  checks.push({
    id: "steps",
    label: "工作流列表（建议）",
    required: false,
    status: !body ? "skipped" : hasSteps ? "pass" : "warning",
    message: !body
      ? "填写正文后再检查工作流。"
      : hasSteps
        ? "检测到列表项；仍需人工确认步骤是否完整、可执行。"
        : "未检测到列表式步骤。可用编号列表说明执行顺序；这不是格式错误。",
  });
  if (fileName !== "粘贴内容" && fileName !== "SKILL.md")
    checks.push({
      id: "filename",
      label: "部署文件名（建议）",
      required: false,
      status: "warning",
      message: "当前文件名不是 SKILL.md。部署技能时，请按官方格式命名。",
    });
  const resources: SkillInspection["resources"] = [];
  const seen = new Set<string>();
  visible.forEach((line, index) => {
    const prose = line.replace(/(`+).*?\1/g, "");
    const targets = [
      ...prose.matchAll(
        /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g,
      ),
    ].map((match) => match[1]);
    const definition = prose.match(/^ {0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/);
    if (definition) targets.push(definition[1]);
    for (const raw of targets) {
      const target = raw.replace(/^<|>$/g, "");
      if (seen.has(target)) continue;
      seen.add(target);
      resources.push({
        target,
        line: bodyStart + index,
        kind: /^https?:\/\/|^\/\//i.test(target)
          ? "external"
          : target.startsWith("#")
            ? "anchor"
            : /^[a-z][a-z0-9+.-]*:/i.test(target)
              ? "other"
              : "local",
      });
    }
  });
  return {
    type: "skillproof-static-inspection",
    schemaVersion: "0.1.0",
    rulesVersion: "0.1.0",
    mode: "static",
    createdAt: new Date().toISOString(),
    source: {
      fileName,
      inputKind,
      textSha256,
      bytes: bytes.length,
      lines: lines.length,
    },
    metadata: { name, description },
    checks,
    resources,
    summary: {
      errors: checks.filter((check) => check.status === "error").length,
      warnings: checks.filter((check) => check.status === "warning").length,
      passed: checks.filter((check) => check.status === "pass").length,
      skipped: checks.filter((check) => check.status === "skipped").length,
      formatValid: checks
        .filter((check) => check.required)
        .every((check) => check.status === "pass"),
    },
    rulesSource: INSPECTION_SOURCE,
    disclaimer:
      "Static document checks only. No skill was executed; capabilities, linked resources, safety, and official compatibility are not certified. The hash covers the inspected UTF-8 text, not original file bytes.",
  };
}
