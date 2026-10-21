import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { restrictWorkerNetwork, EXECUTION_LIMITS } from "../src/limits.ts";
import { extractPdfText } from "../src/pdf-adapter.ts";
test("registered worker network capabilities are locked off", () => { const scope = {}; restrictWorkerNetwork(scope); for (const name of ["fetch", "WebSocket", "XMLHttpRequest", "EventSource", "WebTransport", "importScripts"]) { assert.throws(() => (scope as Record<string, () => void>)[name](), /disabled/); assert.equal(Object.getOwnPropertyDescriptor(scope, name)?.writable, false); } });
test("PDF adapter enforces page, input and output quotas", async () => { const data = new Uint8Array(await readFile(new URL("../public/fixtures/pdf-text-v1/multi-page.pdf", import.meta.url))); await assert.rejects(extractPdfText(data, { maxPages: 1, maxOutputBytes: 100000 }), /页数/); await assert.rejects(extractPdfText(data, { maxPages: 30, maxOutputBytes: 1 }), /输出/); await assert.rejects(extractPdfText(new Uint8Array(EXECUTION_LIMITS.maxInputBytes + 1)), /输入/); });
