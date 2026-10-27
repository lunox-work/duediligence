/**
 * Hidden tests for the identicon contract: the package surface. The entry
 * point re-exports identicon, the module exports nothing but identicon, and
 * every existing export keeps its name and behaviour.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import * as buildInfo from "../../src/build-info.js";
import * as identiconModule from "../../src/identicon.js";
import * as jira from "../../src/jira.js";

/** Imported dynamically: the entry point's types do not yet name identicon. */
async function entryPoint(): Promise<Record<string, unknown>> {
  return (await import("../../src/index.js")) as unknown as Record<string, unknown>;
}

/** Every value index.ts exports itself, before identicon was added. */
const INDEX_OWN_EXPORTS = [
  "handleSchema",
  "ORGANIZATION_ROLES",
  "organizationRoleSchema",
  "ORGANIZATION_KINDS",
  "organizationKindSchema",
  "organizationSummarySchema",
  "membershipSchema",
  "membershipListSchema",
  "organizationMemberSchema",
  "organizationMemberListSchema",
  "pendingInvitationSchema",
  "pendingInvitationListSchema",
  "inviteMemberSchema",
  "errorSchema",
] as const;

// Extends the public identity test: the re-exported function computes the
// pinned faces, not just any function under that name.
test("[happy-6] identicon from the entry point gives the pinned faces", async () => {
  const entry = await entryPoint();
  assert.equal(entry.identicon, identiconModule.identicon);
  const viaEntry = entry.identicon as typeof identiconModule.identicon;
  assert.deepEqual(viaEntry("user-2"), {
    cells: [
      true, false, false, false, true,
      false, true, false, true, false,
      true, true, false, true, true,
      false, false, false, false, false,
      true, false, true, false, true,
    ],
    hue: 117,
  });
  assert.equal(viaEntry("").hue, 196);
});

// The spec: "The module exports nothing else."
test("[happy-6] identicon.ts exports only identicon, and it works", () => {
  assert.deepEqual(Object.keys(identiconModule), ["identicon"]);
  assert.equal(identiconModule.identicon("a").hue, 249);
});

// Extends the public behaviour test from three exports to all of them: every
// export of build-info.ts and jira.ts reaches the entry point unchanged, and
// so does every value index.ts exports itself.
test("[happy-6] every existing export is still exported from the entry point, alongside identicon", async () => {
  const entry = await entryPoint();
  assert.equal(typeof entry.identicon, "function");
  for (const [name, value] of Object.entries(buildInfo)) {
    assert.equal(entry[name], value, name);
  }
  for (const [name, value] of Object.entries(jira)) {
    assert.equal(entry[name], value, name);
  }
  for (const name of INDEX_OWN_EXPORTS) {
    assert.notEqual(entry[name], undefined, name);
  }
  const expected = new Set<string>([
    ...Object.keys(buildInfo),
    ...Object.keys(jira),
    ...INDEX_OWN_EXPORTS,
    "identicon",
  ]);
  assert.deepEqual(new Set(Object.keys(entry)), expected);
});

// Extends the public behaviour test with the other branches of the existing
// exports it touches.
test("[happy-6] existing exports behave as before once identicon is exported", async () => {
  const entry = await entryPoint();
  assert.equal(typeof entry.identicon, "function");
  const { formatVersion, unknownBuildInfo, UNKNOWN_BUILD } = buildInfo;
  assert.equal(entry.formatVersion, formatVersion);
  assert.equal(
    formatVersion({
      version: "1.4.2",
      gitSha: "7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
      gitShortSha: "7f3a9c1",
      buildTime: "2026-09-17T09:14:00.000Z",
      gitRef: "main",
      dirty: true,
    }),
    "1.4.2+7f3a9c1-dirty",
  );
  assert.equal(formatVersion(unknownBuildInfo), unknownBuildInfo.version);
  assert.equal(UNKNOWN_BUILD, "unknown");
  const handleSchema = entry.handleSchema as {
    safeParse(input: unknown): { success: boolean };
  };
  assert.equal(handleSchema.safeParse("no").success, false);
  assert.equal(handleSchema.safeParse("has space").success, false);
  assert.deepEqual(entry.ORGANIZATION_ROLES, ["owner", "admin", "member"]);
  assert.deepEqual(entry.ORGANIZATION_KINDS, ["personal", "team"]);
});
