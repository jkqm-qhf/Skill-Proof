import { parentPort, workerData } from "node:worker_threads";
import { extractPdfText } from "../src/pdf-adapter.ts";
import { restrictWorkerNetwork } from "../src/limits.ts";
restrictWorkerNetwork(globalThis as unknown as Record<string, unknown>);
try { parentPort!.postMessage({ pages: await extractPdfText(new Uint8Array(workerData)) }); }
catch (cause) { parentPort!.postMessage({ error: cause instanceof Error ? cause.message : String(cause), name: cause instanceof Error ? cause.name : "Error" }); }
