import assert from "node:assert/strict";
import { test } from "node:test";

import {
  githubInstallationResponseSchema,
  githubRepositoryPageResponseSchema,
  githubRepositoryResponseSchema,
  githubTimestamp,
} from "../src/index.js";

/*
 * What GitHub sends is parsed permissively: only the fields GitHub always
 * sends are required, and unknown fields are kept rather than refused.
 */

test("[happy-6] an installation parses with nothing but its id", () => {
  const parsed = githubInstallationResponseSchema.parse({ id: 42 });

  assert.deepEqual(parsed, { id: 42 });
  assert.equal(parsed.account, undefined);
  assert.equal(parsed.repository_selection, undefined);
  assert.equal(parsed.permissions, undefined);
  assert.equal(parsed.suspended_at, undefined);
});

test("[happy-6] an installation's account needs nothing but its login", () => {
  const parsed = githubInstallationResponseSchema.parse({
    id: 42,
    account: { login: "o" },
  });

  assert.equal(parsed.account?.login, "o");
  assert.equal(parsed.account?.id, undefined);
  assert.equal(parsed.account?.type, undefined);
});

test("[happy-7] an installation with a null account, an unfamiliar selection and an unknown field parses", () => {
  const parsed = githubInstallationResponseSchema.parse({
    id: 42,
    account: null,
    repository_selection: "some",
    suspended_at: null,
    somethingNew: true,
  });

  assert.equal(parsed.account, null);
  assert.equal(parsed.repository_selection, "some");
  assert.equal(parsed.suspended_at, null);
  assert.equal((parsed as Record<string, unknown>).somethingNew, true);
});

test("[happy-7] an unknown field on the account is kept as well", () => {
  // The account is loose too, not only the installation.
  const parsed = githubInstallationResponseSchema.parse({
    id: 42,
    account: { login: "o", node_id: "MDQ6VXNlcjE=" },
    suspended_at: "2026-11-01T00:00:00Z",
  });

  assert.equal(
    (parsed.account as Record<string, unknown> | null | undefined)?.node_id,
    "MDQ6VXNlcjE=",
  );
  assert.equal(parsed.suspended_at, "2026-11-01T00:00:00Z");
});

test("[happy-8] an installation's account type is any string", () => {
  const parsed = githubInstallationResponseSchema.parse({
    id: 42,
    account: { login: "o", type: "Enterprise" },
  });

  assert.deepEqual(parsed.account, { login: "o", type: "Enterprise" });
});

test("[happy-8] an installation's account type keeps lowercase and empty values as sent", () => {
  for (const type of ["organization", ""]) {
    const parsed = githubInstallationResponseSchema.parse({
      id: 42,
      account: { login: "o", type },
    });
    assert.equal(parsed.account?.type, type);
  }
});

test("[boundary-2] an installation id is any safe integer, including zero and negatives", () => {
  for (const id of [0, -1, 9007199254740991]) {
    assert.equal(githubInstallationResponseSchema.parse({ id }).id, id);
  }
});

test("[boundary-2] the most negative safe integer is accepted as an installation id", () => {
  assert.equal(
    githubInstallationResponseSchema.parse({ id: -Number.MAX_SAFE_INTEGER }).id,
    -Number.MAX_SAFE_INTEGER,
  );
});

test("[unhappy-6] an installation without a usable id or with an account lacking its login is refused", () => {
  for (const payload of [
    {},
    { id: "42" },
    { id: 1.5 },
    { id: 9007199254740992 },
    { id: 42, account: {} },
  ]) {
    assert.equal(
      githubInstallationResponseSchema.safeParse(payload).success,
      false,
      JSON.stringify(payload),
    );
  }
});

test("[unhappy-6] an installation id just below the safe range or a null id is refused", () => {
  for (const payload of [{ id: -9007199254740992 }, { id: null }]) {
    assert.equal(
      githubInstallationResponseSchema.safeParse(payload).success,
      false,
      JSON.stringify(payload),
    );
  }
});

test("[happy-9] a repository parses with only its id and full name, keeping unknown fields", () => {
  const parsed = githubRepositoryResponseSchema.parse({
    id: 7,
    full_name: "octo/hello",
    topics: ["x"],
  });

  assert.equal(parsed.id, 7);
  assert.equal(parsed.full_name, "octo/hello");
  assert.equal(parsed.private, undefined);
  assert.equal(parsed.default_branch, undefined);
  assert.equal(parsed.size, undefined);
  assert.equal(parsed.pushed_at, undefined);
  assert.deepEqual((parsed as Record<string, unknown>).topics, ["x"]);
});

test("[happy-9] a repository's full name is any string, even empty, with case and spaces kept", () => {
  for (const full_name of ["", " Octo/Hello "]) {
    assert.equal(
      githubRepositoryResponseSchema.parse({ id: 7, full_name }).full_name,
      full_name,
    );
  }
});

test("[happy-10] a repository's pushed_at may be an ISO string, Unix seconds or null", () => {
  for (const pushedAt of ["2026-11-01T00:00:00Z", 1700000000, null]) {
    assert.equal(
      githubRepositoryResponseSchema.parse({
        id: 7,
        full_name: "octo/hello",
        pushed_at: pushedAt,
      }).pushed_at,
      pushedAt,
    );
  }
});

test("[happy-10] a pushed_at of zero seconds is kept as the number zero", () => {
  assert.equal(
    githubRepositoryResponseSchema.parse({
      id: 7,
      full_name: "octo/hello",
      pushed_at: 0,
    }).pushed_at,
    0,
  );
});

test("[unhappy-7] a repository without its id or full name is refused", () => {
  for (const payload of [{ full_name: "octo/a" }, { id: 7 }]) {
    assert.equal(
      githubRepositoryResponseSchema.safeParse(payload).success,
      false,
      JSON.stringify(payload),
    );
  }
});

test("[unhappy-7] a repository with a null full name or a textual id is refused", () => {
  for (const payload of [
    { id: 7, full_name: null },
    { id: "7", full_name: "octo/a" },
  ]) {
    assert.equal(
      githubRepositoryResponseSchema.safeParse(payload).success,
      false,
      JSON.stringify(payload),
    );
  }
});

test("[unhappy-8] a repository page without its repositories array is refused", () => {
  const result = githubRepositoryPageResponseSchema.safeParse({});
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) => JSON.stringify(issue.path) === JSON.stringify(["repositories"]),
    ),
  );
});

test("[unhappy-8] a repository page with null repositories is refused, not defaulted", () => {
  const result = githubRepositoryPageResponseSchema.safeParse({
    total_count: 0,
    repositories: null,
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) => JSON.stringify(issue.path) === JSON.stringify(["repositories"]),
    ),
  );
});

test("[boundary-3] a repository page with an empty array parses as empty", () => {
  const parsed = githubRepositoryPageResponseSchema.parse({ repositories: [] });

  assert.deepEqual(parsed.repositories, []);
  assert.equal(parsed.total_count, undefined);
});

test("[boundary-3] an empty repository page keeps a total count of zero", () => {
  const parsed = githubRepositoryPageResponseSchema.parse({
    total_count: 0,
    repositories: [],
  });

  assert.deepEqual(parsed.repositories, []);
  assert.equal(parsed.total_count, 0);
  assert.equal(parsed.repository_selection, undefined);
});

test("[happy-11] a repository page keeps its repositories in the order GitHub sent", () => {
  const parsed = githubRepositoryPageResponseSchema.parse({
    total_count: 2,
    repositories: [
      { id: 2, full_name: "o/b" },
      { id: 1, full_name: "o/a" },
    ],
  });

  assert.deepEqual(
    parsed.repositories.map((repository) => repository.id),
    [2, 1],
  );
});

test("[happy-11] a repository page keeps a repository listed twice", () => {
  // The schemas neither sort nor deduplicate.
  const parsed = githubRepositoryPageResponseSchema.parse({
    repositories: [
      { id: 3, full_name: "o/c" },
      { id: 1, full_name: "o/a" },
      { id: 3, full_name: "o/c" },
    ],
  });

  assert.deepEqual(
    parsed.repositories.map((repository) => repository.id),
    [3, 1, 3],
  );
});

test("[happy-12] githubTimestamp reads either spelling as ISO, and anything else as null", () => {
  assert.equal(githubTimestamp(1700000000), "2023-11-14T22:13:20.000Z");
  assert.equal(
    githubTimestamp("2026-11-01T00:00:00Z"),
    "2026-11-01T00:00:00.000Z",
  );
  assert.equal(githubTimestamp(null), null);
  assert.equal(githubTimestamp(undefined), null);
  assert.equal(githubTimestamp("nope"), null);
});

test("[happy-12] githubTimestamp reads zero seconds as the epoch and the empty string as null", () => {
  assert.equal(githubTimestamp(0), "1970-01-01T00:00:00.000Z");
  assert.equal(githubTimestamp(""), null);
});
