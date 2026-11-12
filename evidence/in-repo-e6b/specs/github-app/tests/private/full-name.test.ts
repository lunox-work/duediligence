import assert from "node:assert/strict";
import { test } from "node:test";

import { githubRepositoryFullNameSchema } from "../../src/index.js";

const FULL_NAME_MESSAGE = "Must be owner/name.";

type Issue = { message: string; path: PropertyKey[] };
type SafeResult = { success: boolean; error?: { issues: Issue[] } };

function describeIssues(issues: Issue[]): string {
  return JSON.stringify(issues.map((i) => [i.path.map(String), i.message]));
}

/** The parse failed, and one of its issues carries `message`. */
function assertFailsWithMessage(
  result: SafeResult,
  message: string,
  label?: string,
): void {
  assert.equal(result.success, false, label ?? "expected the parse to fail");
  const issues = result.error?.issues ?? [];
  assert.ok(
    issues.some((issue) => issue.message === message),
    `${label ?? ""} expected "${message}", got ${describeIssues(issues)}`,
  );
}

// Extends "[happy-4] a valid full name is returned unchanged": more of the
// allowed characters in each part, in places a narrower pattern would miss.
test("[happy-4] full names using every allowed character class are returned unchanged", () => {
  for (const fullName of [
    "OCTO/REPO",
    "octo/REPO",
    "1octo/2repo",
    "0/0",
    "a-b-c/x",
    "a--b/repo",
    "Octo-Org-2/Hello_World.js",
    "octo/-repo",
    "octo/repo-",
    "octo/_",
    "octo/-",
    "octo/...",
    "octo/.a",
    "octo/a.",
    "octo/a..b",
    "octo/.git.",
    "octo/__init__",
    "A/z.Z-9_",
  ]) {
    assert.equal(githubRepositoryFullNameSchema.parse(fullName), fullName);
  }
});

// Extends "[happy-4] the shortest full name, one character each side, is
// returned unchanged": case is kept, not lowercased as handleSchema would.
test("[happy-4] mixed case is kept exactly, not lowercased", () => {
  const fullName = "MiXeD-Owner/RePo.NaMe";
  const parsed = githubRepositoryFullNameSchema.parse(fullName);
  assert.equal(parsed, fullName);
  assert.notEqual(parsed, fullName.toLowerCase());
});

// Extends "[boundary-2] the owner may be 39 characters but not 40": both
// limits at once, an owner at the limit made of mixed allowed characters, and
// the refusals carry the full-name message.
test("[boundary-2] a 39-character owner with a 100-character name is accepted together", () => {
  const fullName = `${"a".repeat(39)}/${"b".repeat(100)}`;
  assert.equal(githubRepositoryFullNameSchema.parse(fullName), fullName);

  const mixedOwner = `A${"-1".repeat(18)}Z0`; // 39 characters, inner hyphens
  assert.equal(mixedOwner.length, 39);
  const mixedName = `.${"x_".repeat(49)}-`; // 100 characters
  assert.equal(mixedName.length, 100);
  assert.equal(
    githubRepositoryFullNameSchema.parse(`${mixedOwner}/${mixedName}`),
    `${mixedOwner}/${mixedName}`,
  );
});

// Extends "[boundary-2] the name may be 100 characters but not 101".
test("[boundary-2] one character past either limit fails with the full-name message, even when the other part is short", () => {
  for (const fullName of [
    `${"a".repeat(40)}/b`,
    `${"a".repeat(40)}/${"b".repeat(100)}`,
    `a/${"b".repeat(101)}`,
    `${"a".repeat(39)}/${"b".repeat(101)}`,
    `${"a".repeat(41)}/b`,
    `a/${"b".repeat(140)}`,
  ]) {
    assertFailsWithMessage(
      githubRepositoryFullNameSchema.safeParse(fullName),
      FULL_NAME_MESSAGE,
      `${fullName.split("/")[0]?.length}/${fullName.split("/")[1]?.length}`,
    );
  }
});

// Extends "[boundary-2]": a shortened owner does not let a long name through,
// so the limits are per part and not on the whole value.
test("[boundary-2] a 101-character name is refused even with a one-character owner while a 40-character total passes", () => {
  assert.equal(
    githubRepositoryFullNameSchema.safeParse(`${"a".repeat(20)}/${"b".repeat(80)}`)
      .success,
    true,
  );
  assertFailsWithMessage(
    githubRepositoryFullNameSchema.safeParse(`o/${"n".repeat(101)}`),
    FULL_NAME_MESSAGE,
  );
});

// Extends "[unhappy-4] a malformed full name is refused": other separators,
// characters outside each part's class, and hyphen and dot edge cases.
test("[unhappy-4] full names with forbidden characters or shapes fail with the full-name message", () => {
  for (const fullName of [
    "",
    "/",
    "//",
    "octo//repo",
    "octo/repo/",
    "/octo/repo",
    "octo\\repo",
    "octo:repo",
    "-/repo",
    "--/repo",
    "-octo-/repo",
    "octo.org/repo",
    "octo org/repo",
    "octo@org/repo",
    "octo/repo!",
    "octo/re/po",
    "octo/répo",
    "öcto/repo",
    "octo/repo name",
    "octo/repo\t",
    "octo/repo\n",
    "\nocto/repo",
    "octo /repo",
    "octo/ repo",
    "https://github.com/octo/repo",
    "octo/repo.git?x",
  ]) {
    assertFailsWithMessage(
      githubRepositoryFullNameSchema.safeParse(fullName),
      FULL_NAME_MESSAGE,
      JSON.stringify(fullName),
    );
  }
});

// Extends "[unhappy-4] a full name with surrounding whitespace is refused, not trimmed".
test("[unhappy-4] whitespace on either side of either part is refused, not trimmed", () => {
  for (const fullName of [
    "  octo/repo  ",
    "\tocto/repo",
    "octo/repo\r\n",
    " a/b",
    "a/b ",
  ]) {
    assertFailsWithMessage(
      githubRepositoryFullNameSchema.safeParse(fullName),
      FULL_NAME_MESSAGE,
      JSON.stringify(fullName),
    );
  }
});

// Extends "[unhappy-4] a malformed full name is refused": a name of only dots
// is refused for "." and ".." but owners with dots are refused outright.
test("[unhappy-4] dot-only names and dotted owners fail with the full-name message", () => {
  for (const fullName of ["a/.", "a/..", "Octo-Org/.", ".github/repo", "../repo", "./repo"]) {
    assertFailsWithMessage(
      githubRepositoryFullNameSchema.safeParse(fullName),
      FULL_NAME_MESSAGE,
      fullName,
    );
  }
});
