import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { extractPdfText } from "./pdf-adapter";
import { restrictWorkerNetwork } from "./limits";
Object.assign(globalThis, { pdfjsWorker: { WorkerMessageHandler } });
restrictWorkerNetwork(globalThis as unknown as Record<string, unknown>);
const context = self as unknown as {
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null;
  postMessage: (message: unknown) => void;
};
context.onmessage = (event) => {
  void extractPdfText(new Uint8Array(event.data))
    .then((pages) => context.postMessage({ type: "skillproof-result", pages }))
    .catch((cause) =>
      context.postMessage({
        type: "skillproof-result",
        error: cause instanceof Error ? cause.message : String(cause),
        name: cause instanceof Error ? cause.name : "Error",
      }),
    );
};
