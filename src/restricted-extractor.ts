import { EXECUTION_LIMITS, ExecutionLimitError } from "./limits";
export function extractRestricted(
  data: Uint8Array,
  signal?: AbortSignal,
  timeoutMs: number = EXECUTION_LIMITS.timeoutMs,
): Promise<string[]> {
  if (data.byteLength > EXECUTION_LIMITS.maxInputBytes)
    return Promise.reject(new ExecutionLimitError("PDF 超过 8 MB 输入限制"));
  if (signal?.aborted)
    return Promise.reject(new DOMException("执行已取消", "AbortError"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./restricted-pdf.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("执行已取消", "AbortError"));
    const timer = setTimeout(
      () =>
        fail(new ExecutionLimitError("PDF 解析超过单文件时限，工作线程已终止")),
      timeoutMs,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      const error = new Error("隔离执行器启动或运行失败");
      error.name = "ExecutionInfrastructureError";
      fail(error);
    };
    worker.onmessage = (event) => {
      if (event.data?.type !== "skillproof-result") return;
      if (event.data.error) {
        const error = new Error(event.data.error);
        error.name = event.data.name ?? "Error";
        fail(error);
      } else if (
        Array.isArray(event.data.pages) &&
        event.data.pages.every((page: unknown) => typeof page === "string")
      ) {
        cleanup();
        resolve(event.data.pages);
      } else {
        const error = new Error("执行器返回了无效结果");
        error.name = "ExecutionInfrastructureError";
        fail(error);
      }
    };
    const bytes = new Uint8Array(data);
    worker.postMessage(bytes.buffer, [bytes.buffer]);
  });
}
