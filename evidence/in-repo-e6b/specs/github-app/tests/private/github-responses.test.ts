import assert from "node:assert/strict";
import { test } from "node:test";

import {
  githubInstallationRepositoriesResponseSchema,
  githubInstallationResponseSchema,
  githubRepositoryResponseSchema,
} from "../../src/index.js";

// Extends "[happy-8] an installation parses with nothing but its id": other
// ids, and no defaults appear for the optional fields.
test("[happy-8] an installation with only an id parses to that id and no other field values", () => {
  for (const id of [2, 99, 123456789, 9007199254740990]) {
    const parsed = githubInstallationResponseSchema.parse({ id });
    assert.equal(parsed.id, id);
    assert.equal(parsed.account, undefined);
    assert.equal(parsed.repository_selection, undefined);
    assert.equal(parsed.suspended_at, undefined);
    assert.deepEqual(
      Object.entries(parsed).filter(([, value]) => value !== undefined),
      [["id", id]],
    );
  }
});

// Extends "[happy-9] an installation with a null account, an unfamiliar
// selection and an unknown field parses": a full GitHub payload keeps every
// known and unknown field, nested ones included.
test("[happy-9] a full installation payload keeps known values and every unknown field", () => {
  const payload = {
    id: 1234,
    account: {
      login: "Octo-Org",
      id: 5678,
      type: "Organization",
      avatar_url: "https://example.invalid/a.png",
      site_admin: false,
    },
    repository_selection: "all",
    suspended_at: "2026-10-31T12:00:00Z",
    app_id: 77,
    target_type: "Organization",
    permissions: { contents: "read", metadata: "read" },
    events: ["push", "pull_request"],
    suspended_by: { login: "admin" },
  };
  const parsed = githubInstallationResponseSchema.parse(payload);
  assert.deepEqual(parsed, payload);
  assert.equal(parsed.account?.type, "Organization");
  assert.equal(parsed.account?.["site_admin"], false);
  assert.equal(parsed.repository_selection, "all");
  assert.equal(parsed.suspended_at, "2026-10-31T12:00:00Z");
  assert.deepEqual(parsed["permissions"], { contents: "read", metadata: "read" });
});

// Extends "[happy-9] an account keeps GitHub's free-form type and its unknown
// fields": an account with none of its optional fields, and selections that
// are not in our vocabulary.
test("[happy-9] an empty account and any selection string are accepted as sent", () => {
  for (const repository_selection of ["selected", "Selected", "", "everything"]) {
    const parsed = githubInstallationResponseSchema.parse({
      id: 3,
      account: {},
      repository_selection,
    });
    assert.deepEqual(parsed.account, {});
    assert.equal(parsed.repository_selection, repository_selection);
  }
  const user = githubInstallationResponseSchema.parse({
    id: 4,
    account: { login: "octocat", type: "User" },
  });
  assert.equal(user.account?.type, "User");
  assert.equal(user.account?.login, "octocat");
});

// Extends "[unhappy-7] an installation without a usable id is refused": other
// unusable ids.
test("[unhappy-7] an installation with a negative, fractional, non-finite, null or non-number id is refused", () => {
  for (const id of [
    -1,
    -42,
    0.5,
    42.000001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_VALUE,
    2 ** 53,
    2 ** 60,
    null,
    true,
    "1",
    [42],
    { id: 42 },
  ]) {
    assert.equal(
      githubInstallationResponseSchema.safeParse({ id, account: null }).success,
      false,
      String(id),
    );
  }
});

// Extends "[unhappy-7] an installation id one past the largest safe integer is
// refused": an unusable id is refused even when everything else is present.
test("[unhappy-7] a complete installation payload without an id is refused", () => {
  assert.equal(
    githubInstallationResponseSchema.safeParse({
      account: { login: "octo", id: 1, type: "User" },
      repository_selection: "all",
      suspended_at: null,
    }).success,
    false,
  );
  assert.equal(githubInstallationResponseSchema.safeParse(null).success, false);
});

// Extends "[happy-10] a repository parses with only its id and full name,
// keeping unknown fields": every optional field present, plus unknown nested
// fields, all kept.
test("[happy-10] a full repository payload keeps its known and unknown fields", () => {
  const payload = {
    id: 1296269,
    full_name: "octocat/Hello-World",
    name: "Hello-World",
    owner: { login: "octocat", id: 1, type: "User" },
    private: false,
    default_branch: "trunk",
    archived: true,
    node_id: "MDEwOlJlcG9zaXRvcnkxMjk2MjY5",
    topics: ["a", "b"],
    license: null,
  };
  const parsed = githubRepositoryResponseSchema.parse(payload);
  assert.deepEqual(parsed, payload);
  assert.equal(parsed.owner?.login, "octocat");
  assert.equal(parsed.owner?.["type"], "User");
  assert.equal(parsed.default_branch, "trunk");
  assert.equal(parsed.archived, true);
  assert.equal(parsed.private, false);
});

// Extends "[happy-10] a repository's full name is not checked against the
// full-name rule": the full name and name are kept as sent, case and spaces
// included, with only the id and full name present.
test("[happy-10] a repository keeps a full name the full-name rule would refuse, unchanged", () => {
  for (const full_name of [" Octo/Hello ", "octo_org/repo", "a/b/c", "UPPER"]) {
    const parsed = githubRepositoryResponseSchema.parse({ id: 9, full_name });
    assert.equal(parsed.full_name, full_name);
    assert.equal(parsed.id, 9);
    assert.equal(parsed.name, undefined);
    assert.equal(parsed.owner, undefined);
  }
});

// Extends "[unhappy-8] a repository without its id or full name is refused".
test("[unhappy-8] a repository with a mistyped id or full name is refused", () => {
  for (const payload of [
    {},
    { id: "7", full_name: "octo/a" },
    { id: 7.5, full_name: "octo/a" },
    { id: -7, full_name: "octo/a" },
    { id: 9007199254740992, full_name: "octo/a" },
    { id: 7, full_name: 7 },
    { id: 7, full_name: ["octo", "a"] },
    { id: null, full_name: "octo/a" },
  ]) {
    assert.equal(
      githubRepositoryResponseSchema.safeParse(payload).success,
      false,
      JSON.stringify(payload),
    );
  }
});

// Extends "[unhappy-8] a repository with a zero id or a null full name is
// refused": a page holding such a repository is refused too.
test("[unhappy-8] a repository page holding a repository without an id or full name is refused", () => {
  for (const bad of [{ full_name: "o/a" }, { id: 2 }]) {
    assert.equal(
      githubInstallationRepositoriesResponseSchema.safeParse({
        total_count: 2,
        repositories: [{ id: 1, full_name: "o/b" }, bad],
      }).success,
      false,
      JSON.stringify(bad),
    );
  }
});

// Extends "[boundary-4] an installation's repository page with no
// repositories parses as empty": an explicit empty array, and an otherwise
// empty page that carries unknown fields.
test("[boundary-4] a page with an explicit empty array or only unknown fields parses as empty", () => {
  const explicit = githubInstallationRepositoriesResponseSchema.parse({
    repositories: [],
  });
  assert.deepEqual(explicit.repositories, []);
  assert.equal(explicit.total_count, undefined);

  const withExtras = githubInstallationRepositoriesResponseSchema.parse({
    repository_selection: "selected",
  });
  assert.deepEqual(withExtras.repositories, []);
  assert.equal(withExtras.total_count, undefined);
  assert.equal(withExtras["repository_selection"], "selected");
});

// Extends "[happy-11] a repository page keeps its repositories in the order
// GitHub sent" and "[happy-11] a repository page neither sorts nor
// deduplicates": a longer page, out of order by id and by name, each
// repository keeping its own unknown fields.
test("[happy-11] a longer page keeps GitHub's order and each repository's unknown fields", () => {
  const repositories = [
    { id: 50, full_name: "o/m", stars: 1 },
    { id: 7, full_name: "o/z", stars: 2 },
    { id: 900, full_name: "o/a", stars: 3 },
    { id: 7, full_name: "o/z", stars: 4 },
    { id: 1, full_name: "o/b", stars: 5 },
    { id: 31, full_name: "o/a", stars: 6 },
  ];
  const parsed = githubInstallationRepositoriesResponseSchema.parse({
    total_count: 600,
    repositories,
    next_page: 2,
  });
  assert.deepEqual(
    parsed.repositories.map((repository) => repository.id),
    [50, 7, 900, 7, 1, 31],
  );
  assert.deepEqual(
    parsed.repositories.map((repository) => repository["stars"]),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(parsed.total_count, 600);
  assert.equal(parsed["next_page"], 2);
});
