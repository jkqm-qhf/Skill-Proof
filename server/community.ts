import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import type { Publication, Feedback } from "../src/sharing.ts";
import { createPublication } from "../src/sharing.ts";
import { inspectSkillDocument } from "../src/inspector.ts";
import { reviseProfile } from "../src/profiles.ts";
import type { SkillProfile } from "../src/profiles.ts";
import type { Execution } from "../src/executions.ts";
export interface Submission {
  id: string;
  publisher: { name: string; verified: false };
  source: string;
  name: string;
  textSha256: string;
  createdAt: string;
  state: "pending" | "accepted";
  profileId?: string;
}
export function communityStore(database: DatabaseSync) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY,share_id TEXT NOT NULL,data TEXT NOT NULL);CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,data TEXT NOT NULL);",
  );
  const getShare = (id: string): Publication | undefined => {
    const row = database
      .prepare("SELECT data FROM shares WHERE id=?")
      .get(id) as { data: string } | undefined;
    const value = row ? JSON.parse(row.data) : undefined;
    return value?.revoked ? undefined : value;
  };
  return {
    list: () =>
      (
        database
          .prepare("SELECT data FROM shares ORDER BY rowid DESC LIMIT 50")
          .all() as { data: string }[]
      )
        .map((row) => JSON.parse(row.data) as Publication)
        .filter((item) => !item.revoked)
        .map(({ fullReport, ...item }) => ({
          ...item,
          hasFullReport: !!fullReport,
        })),
    getShare,
    publish: async (
      executionId: string,
      publisher: string,
      fullEvidence: boolean,
    ) => {
      const row = database
        .prepare("SELECT data,source FROM executions WHERE id=?")
        .get(executionId) as
        | { data: string; source: Publication["provenance"] }
        | undefined;
      if (!row) throw new Error("执行记录不存在，请先同步真实执行结果。");
      const share = await createPublication(
        JSON.parse(row.data) as Execution,
        row.source,
        publisher,
        fullEvidence,
        randomBytes(24).toString("base64url"),
      );
      database
        .prepare("INSERT INTO shares(id,data) VALUES(?,?)")
        .run(share.id, JSON.stringify(share));
      return share;
    },
    revoke: (id: string) => {
      const share = getShare(id);
      if (!share) throw new Error("分享不存在或已撤销");
      database
        .prepare("UPDATE shares SET data=? WHERE id=?")
        .run(JSON.stringify({ ...share, revoked: true }), id);
    },
    feedback: (id: string) => {
      if (!getShare(id)) throw new Error("分享不存在或已撤销");
      return (
        database
          .prepare(
            "SELECT data FROM feedback WHERE share_id=? ORDER BY rowid DESC LIMIT 100",
          )
          .all(id) as { data: string }[]
      ).map((row) => JSON.parse(row.data) as Feedback);
    },
    addFeedback: (shareId: string, name: unknown, message: unknown) => {
      if (!getShare(shareId)) throw new Error("分享不存在或已撤销");
      if (
        typeof message !== "string" ||
        !message.trim() ||
        message.length > 2000 ||
        typeof name !== "string" ||
        name.length > 80
      )
        throw new Error("反馈需为 1–2000 字符，显示名最多 80 字符");
      const count = database
        .prepare("SELECT count(*) as count FROM feedback WHERE share_id=?")
        .get(shareId) as { count: number };
      if (count.count >= 100) throw new Error("此报告的反馈已达到上限");
      const feedback: Feedback = {
        id: crypto.randomUUID(),
        shareId,
        name: name.trim() || "匿名",
        message: message.trim(),
        createdAt: new Date().toISOString(),
        identityVerified: false,
      };
      database
        .prepare("INSERT INTO feedback(id,share_id,data) VALUES(?,?,?)")
        .run(feedback.id, shareId, JSON.stringify(feedback));
      return feedback;
    },
    submit: async (publisher: unknown, source: unknown) => {
      if (
        typeof publisher !== "string" ||
        !publisher.trim() ||
        publisher.length > 80 ||
        typeof source !== "string"
      )
        throw new Error("请填写发布者显示名和 SKILL.md 文本");
      const inspection = await inspectSkillDocument(source);
      if (!inspection.summary.formatValid || !inspection.metadata.name)
        throw new Error("提交文件的基础结构检查未通过");
      const submission: Submission = {
        id: crypto.randomUUID(),
        publisher: { name: publisher.trim(), verified: false },
        source,
        name: inspection.metadata.name,
        textSha256: inspection.source.textSha256,
        createdAt: new Date().toISOString(),
        state: "pending",
      };
      database
        .prepare("INSERT INTO submissions(id,data) VALUES(?,?)")
        .run(submission.id, JSON.stringify(submission));
      return {
        id: submission.id,
        state: submission.state,
        name: submission.name,
      };
    },
    submissions: () =>
      (
        database
          .prepare("SELECT data FROM submissions ORDER BY rowid DESC LIMIT 100")
          .all() as { data: string }[]
      ).map((row) => JSON.parse(row.data) as Submission),
    accept: async (id: string) => {
      const row = database
        .prepare("SELECT data FROM submissions WHERE id=?")
        .get(id) as { data: string } | undefined;
      if (!row) throw new Error("提交不存在");
      const submission: Submission = JSON.parse(row.data);
      if (submission.profileId) {
        const saved = database
          .prepare("SELECT data FROM profiles WHERE id=?")
          .get(submission.profileId) as { data: string };
        return JSON.parse(saved.data) as SkillProfile;
      }
      const { profile } = await reviseProfile(undefined, submission.source, {
        claims: [],
        environment: "",
        permissions: [],
      });
      database.exec("BEGIN");
      try {
        database
          .prepare("INSERT INTO profiles(id,data) VALUES(?,?)")
          .run(profile.id, JSON.stringify(profile));
        submission.state = "accepted";
        submission.profileId = profile.id;
        database
          .prepare("UPDATE submissions SET data=? WHERE id=?")
          .run(JSON.stringify(submission), id);
        database.exec("COMMIT");
      } catch (cause) {
        database.exec("ROLLBACK");
        throw cause;
      }
      return profile;
    },
  };
}
