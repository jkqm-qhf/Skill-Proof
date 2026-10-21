import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_SKILL } from "../src/inspector.ts";
import { parseProfiles, reviseProfile } from "../src/profiles.ts";

test("profile revisions preserve source hashes and prior declarations", async () => {
  const declaration = {
    claims: ["Summarizes documents"],
    environment: "Browser",
    permissions: [],
  };
  const first = (await reviseProfile(undefined, SAMPLE_SKILL, declaration))
    .profile;
  const second = (
    await reviseProfile(first, SAMPLE_SKILL + "\nAdditional instruction.", {
      ...declaration,
      claims: ["Changed declaration"],
    })
  ).profile;
  assert.equal(first.revisions.length, 1);
  assert.equal(second.revisions.length, 2);
  assert.notEqual(
    second.revisions[0].textSha256,
    second.revisions[1].textSha256,
  );
  assert.deepEqual(second.revisions[0].claims, declaration.claims);
  assert.deepEqual(parseProfiles(JSON.stringify([second])), [second]);
  await assert.rejects(reviseProfile(first, SAMPLE_SKILL, declaration), /相同/);
  await assert.rejects(
    reviseProfile(undefined, "invalid", declaration),
    /基础格式/,
  );
});
