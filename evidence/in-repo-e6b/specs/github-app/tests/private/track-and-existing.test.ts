import assert from "node:assert/strict";
import { test } from "node:test";

import {
  githubRepositoryFullNameSchema,
  handleSchema,
  organizationSummarySchema,
  registerBoardSchema,
  trackRepositorySchema,
} from "../../src/index.js";

const ID_MESSAGE = "Must be a positive whole number.";

type Issue = { message: string; path: PropertyKey[] };
type SafeResult = { success: boolean; error?: { issues: Issue[] } };

function describeIssues(issues: Issue[]): string {
  return JSON.stringify(issues.map((i) => [i.path.map(String), i.message]));
}

/** The parse failed with an issue at `path` (and, if given, with `message`). */
function assertFailsAt(
  result: SafeResult,
  path: PropertyKey[],
  message?: string,
  label?: string,
): void {
  assert.equal(result.success, false, label ?? "expected the parse to fail");
  const issues = result.error?.issues ?? [];
  assert.ok(
    issues.some(
      (issue) =>
        JSON.stringify(issue.path) === JSON.stringify(path) &&
        (message === undefined || issue.message === message),
    ),
    `${label ?? ""} expected an issue at ${JSON.stringify(path)}${
      message === undefined ? "" : ` with "${message}"`
    }, got ${describeIssues(issues)}`,
  );
}

// Extends "[happy-16] a track body parses unchanged": our installation row id
// is any non-empty string, including ones the GitHub id rule would refuse.
test("[happy-16] track bodies whose installation id is any non-empty string parse unchanged", () => {
  for (const body of [
    { installationId: "0", externalId: "1" },
    { installationId: "0123", externalId: "123456789" },
    { installationId: "-1", externalId: "9007199254740991" },
    { installationId: " ghi 1 ", externalId: "42" },
    { installationId: "GHI_ABC", externalId: "100" },
    { installationId: "c".repeat(200), externalId: "8" },
  ]) {
    assert.deepEqual(trackRepositorySchema.parse(body), body);
  }
});

// Extends "[happy-16] a track body with a one-character installation id and id
// 1 parses unchanged": key order in the input does not matter.
test("[happy-16] a track body given externalId first parses to the same body", () => {
  assert.deepEqual(
    trackRepositorySchema.parse({ externalId: "31337", installationId: "ghi_9" }),
    { installationId: "ghi_9", externalId: "31337" },
  );
});

// Extends "[happy-17] unknown keys in a track body are stripped" and
// "[happy-17] several unknown keys in a track body are all stripped": a body
// carrying a client-supplied name, branch and flags keeps only the two fields.
test("[happy-17] a track body keeps only installationId and externalId whatever else the client sends", () => {
  const parsed = trackRepositorySchema.parse({
    installationId: "ghi_2",
    externalId: "77",
    fullName: "evil/override",
    defaultBranch: "main",
    private: false,
    id: "ptr_x",
    createdAt: "2026-11-01T00:00:00.000Z",
  });
  assert.deepEqual(parsed, { installationId: "ghi_2", externalId: "77" });
  assert.deepEqual(Object.keys(parsed).sort(), ["externalId", "installationId"]);
});

// Extends "[unhappy-12] a track body without an installation is refused" and
// "[unhappy-12] a track body with a null installation is refused": other
// non-string installation ids, and alongside a bad externalId.
test("[unhappy-12] a track body whose installation id is not a non-empty string is refused at installationId", () => {
  for (const installationId of [undefined, 0, 42, true, [], ["ghi_1"], { id: "ghi_1" }]) {
    assertFailsAt(
      trackRepositorySchema.safeParse({ installationId, externalId: "7" }),
      ["installationId"],
      undefined,
      JSON.stringify(installationId),
    );
  }
});

test("[unhappy-12] an empty body is refused at installationId, and a bad externalId is reported too", () => {
  assertFailsAt(trackRepositorySchema.safeParse({}), ["installationId"]);
  const both = trackRepositorySchema.safeParse({ installationId: "", externalId: "007" });
  assertFailsAt(both, ["installationId"]);
  assertFailsAt(both, ["externalId"], ID_MESSAGE);
});

// Extends "[unhappy-12]": GitHub's snake_case installation key is not ours.
test("[unhappy-12] a track body naming installation_id instead of installationId is refused at installationId", () => {
  assertFailsAt(
    trackRepositorySchema.safeParse({ installation_id: "ghi_1", externalId: "7" }),
    ["installationId"],
  );
});

// Extends "[happy-18] registerBoardSchema still accepts any non-empty
// externalId": the GitHub id rule lives on the track body only, and Jira's
// registration still takes what the track body refuses.
test("[happy-18] registerBoardSchema keeps accepting ids that trackRepositorySchema refuses", () => {
  for (const externalId of ["0", "0123", "abc", "1e3", " 12", "9007199254740992"]) {
    assert.deepEqual(
      registerBoardSchema.parse({ connectionId: "c1", externalId }),
      { connectionId: "c1", externalId },
    );
    assertFailsAt(
      trackRepositorySchema.safeParse({ installationId: "c1", externalId }),
      ["externalId"],
      ID_MESSAGE,
      externalId,
    );
  }
});

// Extends "[happy-18] the organization and Jira contracts still parse as
// before": handleSchema still trims and lowercases while the full-name schema
// beside it keeps case, and an organization still defaults to a team.
test("[happy-18] handleSchema still lowercases and organizations still default to team beside the case-keeping full-name schema", () => {
  assert.equal(handleSchema.parse("  OctoOrg  "), "octoorg");
  assert.equal(
    organizationSummarySchema.parse({ id: "org_2", name: "Octo", slug: "octoorg" }).kind,
    "team",
  );
  assert.equal(githubRepositoryFullNameSchema.parse("OctoOrg/Repo"), "OctoOrg/Repo");
});
