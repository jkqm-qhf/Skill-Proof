import {
  getDocument,
  GlobalWorkerOptions,
  version,
} from "pdfjs-dist/legacy/build/pdf.mjs";
export const ADAPTER_VERSION = version;
export function configurePdfWorker(url: string) {
  GlobalWorkerOptions.workerSrc = url;
}
export async function extractPdfText(data: Uint8Array): Promise<string[]> {
  const task = getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: true,
    useWorkerFetch: false,
    stopAtErrors: true,
  });
  try {
    const document = await task.promise;
    const pages: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const content = await (await document.getPage(index)).getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim(),
      );
    }
    return pages;
  } finally {
    await task.destroy().catch(() => {});
  }
}
