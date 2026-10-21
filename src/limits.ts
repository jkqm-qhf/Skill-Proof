export const EXECUTION_LIMITS = {
  maxInputBytes: 8 * 1024 * 1024,
  maxPages: 30,
  maxOutputBytes: 1024 * 1024,
  timeoutMs: 10000,
} as const;
export class ExecutionLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionLimitError";
  }
}
export function restrictWorkerNetwork(scope: Record<string, unknown>) {
  for (const name of [
    "fetch",
    "WebSocket",
    "XMLHttpRequest",
    "EventSource",
    "WebTransport",
    "importScripts",
  ])
    Object.defineProperty(scope, name, {
      configurable: false,
      writable: false,
      value: function () {
        throw new Error("Network access is disabled in the PDF worker.");
      },
    });
}
