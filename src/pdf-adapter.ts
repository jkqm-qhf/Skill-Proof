import {
  getDocument,
  GlobalWorkerOptions,
  version,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { EXECUTION_LIMITS, ExecutionLimitError } from "./limits.ts";
export const ADAPTER_VERSION = version;
export function configurePdfWorker(url: string) {
  GlobalWorkerOptions.workerSrc = url;
}
export async function extractPdfText(data: Uint8Array, limits: { maxPages: number; maxOutputBytes: number } = EXECUTION_LIMITS): Promise<string[]> {
  if (data.byteLength > EXECUTION_LIMITS.maxInputBytes) throw new ExecutionLimitError("PDF 超过输入限制");
  const task = getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: true,
    useWorkerFetch: false,
    stopAtErrors: true,
  });
  try {
    const document = await task.promise;
    if (document.numPages > limits.maxPages) throw new ExecutionLimitError("PDF 超过页数限制");
    const pages: string[] = [];
    let outputBytes = 0;
    for (let index = 1; index <= document.numPages; index++) {
      const content = await (await document.getPage(index)).getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim(),
      );
      outputBytes += new TextEncoder().encode(pages.at(-1)!).byteLength;
      if (outputBytes > limits.maxOutputBytes) throw new ExecutionLimitError("提取结果超过输出限制");
    }
    return pages;
  } finally {
    await task.destroy().catch(() => {});
  }
}
