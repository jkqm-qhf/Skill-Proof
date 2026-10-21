import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseProfiles } from "../src/profiles.ts";
import type { SkillProfile } from "../src/profiles.ts";
import { inspectSkillDocument } from "../src/inspector.ts";
import { verifyExecutionEvidence } from "../src/reports.ts";
import { adapterBinding } from "../src/executions.ts";
import type { Execution } from "../src/executions.ts";
import { runNodeBenchmark } from "./runner.ts";

export interface Job {
  id: string;
  profileId: string;
  version: number;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  executionId?: string;
  error?: string;
  logs: { at: string; message: string }[];
}
class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage) {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new RequestError(415, "JSON content type required");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024)
      throw new RequestError(413, "Request exceeds 2 MB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new RequestError(400, "Invalid JSON");
  }
}

export function createSkillProofService(databaseFile: string) {
  if (databaseFile !== ":memory:")
    mkdirSync(dirname(databaseFile), { recursive: true });
  const database = new DatabaseSync(databaseFile);
  database.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS executions(id TEXT PRIMARY KEY, data TEXT NOT NULL, source TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, data TEXT NOT NULL, profile TEXT NOT NULL);",
  );
  const all = <T>(table: string): T[] =>
    (
      database
        .prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`)
        .all() as { data: string }[]
    ).map((row) => JSON.parse(row.data));
  const getProfile = (id: string): SkillProfile | undefined => {
    const row = database
      .prepare("SELECT data FROM profiles WHERE id=?")
      .get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  };
  const saveJob = (job: Job, profile?: SkillProfile) => {
    if (profile)
      database
        .prepare("INSERT INTO jobs(id,data,profile) VALUES(?,?,?)")
        .run(job.id, JSON.stringify(job), JSON.stringify(profile));
    else
      database
        .prepare("UPDATE jobs SET data=? WHERE id=?")
        .run(JSON.stringify(job), job.id);
  };
  const getJob = (id: string) =>
    all<Job>("jobs").find((item) => item.id === id);
  let active: {
    id: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null = null;
  let closing = false;
  for (const job of all<Job>("jobs"))
    if (job.state === "running") {
      job.state = "failed";
      job.error = "Service restarted during execution; resubmit this job.";
      saveJob(job);
    }
  async function processQueue() {
    if (active || closing) return;
    const job = all<Job>("jobs")
      .reverse()
      .find((item) => item.state === "queued");
    if (!job) return;
    const controller = new AbortController();
    job.state = "running";
    job.updatedAt = new Date().toISOString();
    saveJob(job);
    const row = database
      .prepare("SELECT profile FROM jobs WHERE id=?")
      .get(job.id) as { profile: string };
    const promise = (async () => {
      try {
        const execution = await runNodeBenchmark(
          JSON.parse(row.profile),
          job.version,
          controller.signal,
          (message) => {
            job.logs.push({ at: new Date().toISOString(), message });
            saveJob(job);
          },
        );
        controller.signal.throwIfAborted();
        await verifyExecutionEvidence(execution);
        database
          .prepare("INSERT INTO executions(id,data,source) VALUES(?,?,?)")
          .run(execution.id, JSON.stringify(execution), "server-worker");
        job.state = "succeeded";
        job.executionId = execution.id;
      } catch (cause) {
        job.state = controller.signal.aborted ? "cancelled" : "failed";
        job.error = cause instanceof Error ? cause.message : String(cause);
      } finally {
        job.updatedAt = new Date().toISOString();
        saveJob(job);
        active = null;
        if (!closing) void processQueue();
      }
    })();
    active = { id: job.id, controller, promise };
  }

  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host?.split(":")[0];
      if (!["127.0.0.1", "localhost"].includes(host ?? ""))
        throw new RequestError(403, "Local service only");
      const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (request.method !== "GET") {
        const origin = request.headers.origin;
        if (
          request.headers["sec-fetch-site"] === "cross-site" ||
          (origin &&
            !["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
        )
          throw new RequestError(403, "Cross-origin writes forbidden");
      }
      if (request.method === "GET" && path === "/api/health")
        return json(response, 200, {
          status: "ok",
          storage: "sqlite",
          concurrency: 1,
          scope: "local-single-user",
        });
      if (request.method === "GET" && path === "/api/profiles")
        return json(response, 200, all("profiles"));
      if (request.method === "POST" && path === "/api/profiles") {
        const input = await body(request);
        const [profile] = parseProfiles(JSON.stringify([input]));
        if (!profile) throw new RequestError(400, "Invalid profile history");
        for (const revision of profile.revisions) {
          const inspection = await inspectSkillDocument(revision.source);
          if (
            !inspection.summary.formatValid ||
            inspection.source.textSha256 !== revision.textSha256 ||
            inspection.metadata.name !== revision.name ||
            inspection.metadata.description !== revision.description
          )
            throw new RequestError(
              400,
              "Profile metadata or source hash mismatch",
            );
        }
        const existing = getProfile(profile.id);
        if (existing) {
          const count = Math.min(
            existing.revisions.length,
            profile.revisions.length,
          );
          for (let index = 0; index < count; index++)
            if (
              JSON.stringify(existing.revisions[index]) !==
              JSON.stringify(profile.revisions[index])
            )
              throw new RequestError(409, "Immutable history conflict");
          if (existing.revisions.length >= profile.revisions.length)
            return json(response, 200, existing);
        }
        database
          .prepare(
            "INSERT INTO profiles(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
          )
          .run(profile.id, JSON.stringify(profile));
        const latest = profile.revisions.at(-1)!;
        if (
          existing &&
          adapterBinding(latest.source) &&
          all<Execution>("executions").some(
            (item) =>
              item.profile.id === profile.id &&
              item.profile.version < latest.version,
          ) &&
          all<Job>("jobs").filter((item) =>
            ["queued", "running"].includes(item.state),
          ).length < 20
        ) {
          const now = new Date().toISOString();
          saveJob(
            {
              id: crypto.randomUUID(),
              profileId: profile.id,
              version: latest.version,
              state: "queued",
              createdAt: now,
              updatedAt: now,
              logs: [
                {
                  at: now,
                  message:
                    "Automatic version regression triggered by profile update",
                },
              ],
            },
            profile,
          );
          void processQueue();
        }
        return json(response, 201, profile);
      }
      if (request.method === "GET" && path === "/api/executions")
        return json(response, 200, all("executions"));
      if (request.method === "POST" && path === "/api/executions") {
        const execution: Execution = await body(request);
        await verifyExecutionEvidence(execution);
        const existing = database
          .prepare("SELECT data FROM executions WHERE id=?")
          .get(execution.id) as { data: string } | undefined;
        if (existing && existing.data !== JSON.stringify(execution))
          throw new RequestError(409, "Execution id conflict");
        database
          .prepare(
            "INSERT OR IGNORE INTO executions(id,data,source) VALUES(?,?,?)",
          )
          .run(execution.id, JSON.stringify(execution), "browser-import");
        return json(response, 201, {
          id: execution.id,
          source: "browser-import",
        });
      }
      if (request.method === "GET" && path === "/api/export")
        return json(response, 200, {
          format: "skillproof-server-backup",
          version: 1,
          exportedAt: new Date().toISOString(),
          profiles: all("profiles"),
          executions: all("executions"),
          jobs: all("jobs"),
        });
      if (request.method === "GET" && path === "/api/jobs")
        return json(response, 200, all("jobs"));
      if (request.method === "POST" && path === "/api/jobs") {
        const input = await body(request);
        const profile =
          typeof input.profileId === "string"
            ? getProfile(input.profileId)
            : undefined;
        const revision = profile?.revisions.find(
          (item) => item.version === input.version,
        );
        if (
          !profile ||
          !revision ||
          adapterBinding(revision.source) !== "pdfjs-text"
        )
          throw new RequestError(
            400,
            "A registered profile revision is required",
          );
        if (
          all<Job>("jobs").filter((item) =>
            ["queued", "running"].includes(item.state),
          ).length >= 20
        )
          throw new RequestError(429, "Queue limit reached");
        const now = new Date().toISOString();
        const job: Job = {
          id: crypto.randomUUID(),
          profileId: profile.id,
          version: input.version,
          state: "queued",
          createdAt: now,
          updatedAt: now,
          logs: [],
        };
        saveJob(job, profile);
        json(response, 202, job);
        void processQueue();
        return;
      }
      const match = path.match(/^\/api\/jobs\/([^/]+)(\/cancel)?$/);
      if (match) {
        const job = getJob(match[1]);
        if (!job) throw new RequestError(404, "Job not found");
        if (request.method === "GET" && !match[2])
          return json(response, 200, job);
        if (request.method === "POST" && match[2]) {
          if (!["queued", "running"].includes(job.state))
            throw new RequestError(409, "Job already finished");
          if (active?.id === job.id) active.controller.abort();
          job.state = "cancelled";
          job.updatedAt = new Date().toISOString();
          saveJob(job);
          return json(response, 200, job);
        }
      }
      throw new RequestError(404, "Endpoint not found");
    } catch (cause) {
      json(response, cause instanceof RequestError ? cause.status : 400, {
        error: cause instanceof Error ? cause.message : "Request failed",
      });
    }
  });
  return {
    server,
    listen: (port = 8787) =>
      new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          void processQueue();
          resolve((server.address() as { port: number }).port);
        });
      }),
    close: async () => {
      closing = true;
      const current = active;
      current?.controller.abort();
      await current?.promise;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      database.close();
    },
  };
}
