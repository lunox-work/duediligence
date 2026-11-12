import assert from "node:assert/strict";
import { test } from "node:test";

import {
  githubInstallationDtoSchema,
  githubInstallationListSchema,
  githubRepositoryDtoSchema,
  githubRepositoryListSchema,
  githubRepositoryPointerDtoSchema,
  githubRepositoryPointerListSchema,
} from "../../src/index.js";

const ID_MESSAGE = "Must be a positive whole number.";
const FULL_NAME_MESSAGE = "Must be owner/name.";

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

const installationDto = {
  id: "ghi_1",
  installationId: 42,
  accountLogin: "octo-org",
  accountType: "organization",
  repositorySelection: "selected",
  suspended: false,
  createdAt: "2026-11-01T00:00:00.000Z",
} as const;

const repositoryDto = {
  externalId: "7",
  fullName: "octo/hello",
  private: true,
  defaultBranch: "main",
  archived: false,
} as const;

const pointerDto = {
  id: "ptr_1",
  installationId: "ghi_1",
  externalId: "7",
  fullName: "Octo/Hello",
  defaultBranch: "main",
  createdAt: "2026-11-01T00:00:00.000Z",
} as const;

function without<T extends object>(value: T, key: keyof T): Partial<T> {
  const copy: Partial<T> = { ...value };
  delete copy[key];
  return copy;
}

// ---- installation DTO ------------------------------------------------------

// Extends "[happy-12] a complete installation DTO round-trips": other row ids,
// logins, ids and timestamps, and a longer list in its own order.
test("[happy-12] other complete installation DTOs round-trip, and a list of several keeps its order", () => {
  const dtos = [
    {
      id: "z",
      installationId: 1,
      accountLogin: "a",
      accountType: "user",
      repositorySelection: "all",
      suspended: true,
      createdAt: "2026-01-02T03:04:05Z",
    },
    {
      id: "ghi_0002",
      installationId: 987654321,
      accountLogin: "Octo_Cat Not-A-Handle",
      accountType: "organization",
      repositorySelection: "selected",
      suspended: false,
      createdAt: "1999-12-31T23:59:59.999999Z",
    },
    { ...installationDto, id: "ghi_3", installationId: 42 },
    { ...installationDto, id: "ghi_1" },
  ] as const;
  for (const dto of dtos) {
    assert.deepEqual(githubInstallationDtoSchema.parse(dto), dto);
  }
  assert.deepEqual(githubInstallationListSchema.parse({ installations: dtos }), {
    installations: dtos,
  });
});

// Extends "[unhappy-9] an installation DTO with an empty or mistyped field is
// refused": more mistypes per field, including values a coercing or
// nullable/defaulted schema would accept.
test("[unhappy-9] an installation DTO with any other mistyped or unresolved field is refused", () => {
  for (const change of [
    { id: null },
    { id: 1 },
    { installationId: -1 },
    { installationId: 1.5 },
    { installationId: 9007199254740992 },
    { installationId: null },
    { installationId: Number.NaN },
    { accountLogin: null },
    { accountLogin: 5 },
    { accountType: "User" },
    { accountType: "enterprise" },
    { accountType: null },
    { repositorySelection: "Selected" },
    { repositorySelection: null },
    { suspended: "false" },
    { suspended: 0 },
    { suspended: undefined },
    { createdAt: "2026-11-01T00:00:00" },
    { createdAt: "2026-11-01T00:00:00+02:00" },
    { createdAt: "not a date" },
    { createdAt: "" },
    { createdAt: null },
    { createdAt: 1793491200000 },
  ]) {
    assert.equal(
      githubInstallationDtoSchema.safeParse({ ...installationDto, ...change }).success,
      false,
      JSON.stringify(change),
    );
  }
});

// Extends "[unhappy-9] an installation DTO missing a field is refused": an
// installation list holding one bad DTO is refused, wherever it sits.
test("[unhappy-9] an installation list holding an incomplete DTO is refused", () => {
  for (const key of Object.keys(installationDto) as (keyof typeof installationDto)[]) {
    assert.equal(
      githubInstallationListSchema.safeParse({
        installations: [installationDto, without(installationDto, key)],
      }).success,
      false,
      `${key} removed`,
    );
  }
  assert.equal(
    githubInstallationListSchema.safeParse({
      installations: [{ ...installationDto, accountType: "User" }, installationDto],
    }).success,
    false,
  );
});

// Extends "[unhappy-9]": an empty object and non-objects are refused.
test("[unhappy-9] an empty object or a non-object is refused as an installation DTO", () => {
  for (const value of [{}, null, "ghi_1", 42, [installationDto]]) {
    assert.equal(
      githubInstallationDtoSchema.safeParse(value).success,
      false,
      JSON.stringify(value),
    );
  }
});

// Extends "[happy-13] an unknown key on an installation DTO is stripped": more
// unknown keys, including GitHub's snake_case names for the same fields.
test("[happy-13] several unknown keys on an installation DTO are all stripped", () => {
  const parsed = githubInstallationDtoSchema.parse({
    ...installationDto,
    token: "secret",
    installation_id: 99,
    account: { login: "x" },
    repository_selection: "all",
    suspended_at: null,
    accessToken: "ghs_abc",
  });
  assert.deepEqual(parsed, installationDto);
  assert.deepEqual(Object.keys(parsed).sort(), Object.keys(installationDto).sort());
});

// Extends "[happy-13] an unknown key inside an installation list is stripped":
// the list's own unknown keys and each item's.
test("[happy-13] unknown keys on an installation list and on each item are stripped", () => {
  const other = { ...installationDto, id: "ghi_2", installationId: 43 };
  const parsed = githubInstallationListSchema.parse({
    installations: [
      { ...installationDto, token: "a" },
      { ...other, token: "b", secret: 1 },
    ],
    total: 2,
  });
  assert.deepEqual(parsed, { installations: [installationDto, other] });
  assert.deepEqual(Object.keys(parsed), ["installations"]);
});

// ---- repository DTO --------------------------------------------------------

// Extends "[happy-14] a complete repository DTO round-trips": every flag
// combination, other full names and branches, and a list of several.
test("[happy-14] repository DTOs with every flag combination round-trip, and their list keeps its order", () => {
  const dtos = [];
  let n = 1;
  for (const isPrivate of [false, true]) {
    for (const archived of [false, true]) {
      dtos.push({
        externalId: String(n * 1000003),
        fullName: n % 2 === 0 ? `Org-${n}/Repo.${n}` : `org${n}/repo_${n}`,
        private: isPrivate,
        defaultBranch: n % 2 === 0 ? "release/2026-11" : "master",
        archived,
      });
      n += 1;
    }
  }
  for (const dto of dtos) {
    assert.deepEqual(githubRepositoryDtoSchema.parse(dto), dto);
  }
  const reversed = [...dtos].reverse();
  assert.deepEqual(githubRepositoryListSchema.parse({ repositories: reversed }), {
    repositories: reversed,
  });
});

// Extends "[happy-14] a complete repository DTO round-trips": unknown keys,
// including GitHub's snake_case names, are stripped from the DTO and its list.
test("[happy-14] a repository DTO and its list strip unknown keys", () => {
  assert.deepEqual(
    githubRepositoryDtoSchema.parse({
      ...repositoryDto,
      full_name: "x/y",
      default_branch: "dev",
      topics: ["a"],
    }),
    repositoryDto,
  );
  assert.deepEqual(
    githubRepositoryListSchema.parse({
      repositories: [{ ...repositoryDto, id: 7 }],
      total_count: 1,
    }),
    { repositories: [repositoryDto] },
  );
});

// ---- pointer DTO -----------------------------------------------------------

// Extends "[happy-15] a complete repository pointer DTO round-trips": our row
// ids are any non-empty strings (not GitHub id text), and the full name's case
// is kept.
test("[happy-15] pointer DTOs with other row ids, ids and full names round-trip unchanged", () => {
  const dtos = [
    {
      id: "0",
      installationId: "0",
      externalId: "1",
      fullName: "A/B",
      defaultBranch: "x",
      createdAt: "2026-11-04T10:20:30Z",
    },
    {
      id: "ptr-0042",
      installationId: "42",
      externalId: "9007199254740991",
      fullName: "OCTO-ORG/Hello.World_2",
      defaultBranch: "feature/Ünïcode",
      createdAt: "2026-11-04T10:20:30.123Z",
    },
    {
      id: "p q",
      installationId: "ghi 1",
      externalId: "1234567",
      fullName: "octo/.github",
      defaultBranch: "main",
      createdAt: "2000-02-29T00:00:00.000Z",
    },
  ];
  for (const dto of dtos) {
    assert.deepEqual(githubRepositoryPointerDtoSchema.parse(dto), dto);
  }
  assert.deepEqual(githubRepositoryPointerListSchema.parse({ pointers: dtos }), {
    pointers: dtos,
  });
});

// Extends "[happy-15] a pointer list keeps its order and does not deduplicate
// by externalId": more pointers, duplicates not adjacent, and unknown keys
// stripped from each.
test("[happy-15] a longer pointer list keeps its order, keeps duplicates and strips unknown keys", () => {
  const pointers = ["ptr_c", "ptr_a", "ptr_b", "ptr_a", "ptr_d"].map((id, i) => ({
    ...pointerDto,
    id,
    externalId: String([30, 10, 20, 10, 5][i]),
    fullName: `octo/r${["c", "a", "b", "a", "d"][i]}`,
  }));
  const parsed = githubRepositoryPointerListSchema.parse({
    pointers: pointers.map((p) => ({ ...p, token: "secret" })),
    cursor: "next",
  });
  assert.deepEqual(parsed, { pointers });
  assert.deepEqual(
    parsed.pointers.map((p) => p.id),
    ["ptr_c", "ptr_a", "ptr_b", "ptr_a", "ptr_d"],
  );
});

// ---- bad repository and pointer DTOs ---------------------------------------

// Extends "[unhappy-10] a repository DTO with a bad field is refused": the
// GitHub id rule and the full-name rule apply inside the DTO with their own
// messages at the field's path.
test("[unhappy-10] a repository DTO with a non-canonical externalId fails with the id message at externalId", () => {
  for (const externalId of ["0", "007", "-7", "7.0", " 7", "9007199254740992", ""]) {
    assertFailsAt(
      githubRepositoryDtoSchema.safeParse({ ...repositoryDto, externalId }),
      ["externalId"],
      ID_MESSAGE,
      JSON.stringify(externalId),
    );
  }
});

test("[unhappy-10] a repository DTO with a malformed full name fails with the full-name message at fullName", () => {
  for (const fullName of ["hello", "octo/a/b", " octo/hello", "octo_x/hello", "octo/..", `${"a".repeat(40)}/b`]) {
    assertFailsAt(
      githubRepositoryDtoSchema.safeParse({ ...repositoryDto, fullName }),
      ["fullName"],
      FULL_NAME_MESSAGE,
      fullName,
    );
  }
});

// Extends "[unhappy-10] a repository DTO with a bad field is refused": every
// field removed, and mistyped flags.
test("[unhappy-10] a repository DTO missing any field or with a mistyped flag is refused", () => {
  for (const key of Object.keys(repositoryDto) as (keyof typeof repositoryDto)[]) {
    assert.equal(
      githubRepositoryDtoSchema.safeParse(without(repositoryDto, key)).success,
      false,
      `${key} removed`,
    );
  }
  for (const change of [
    { private: "true" },
    { private: null },
    { private: 1 },
    { archived: "false" },
    { archived: null },
    { defaultBranch: null },
    { defaultBranch: 5 },
    { externalId: null },
    { fullName: null },
  ]) {
    assert.equal(
      githubRepositoryDtoSchema.safeParse({ ...repositoryDto, ...change }).success,
      false,
      JSON.stringify(change),
    );
  }
});

// Extends "[unhappy-10] a pointer DTO with a bad field is refused": the id and
// full-name messages at their paths, every field removed, empty row ids, and
// other bad timestamps.
test("[unhappy-10] a pointer DTO with a bad externalId or full name fails with that rule's message at its path", () => {
  for (const externalId of ["007", "0", "1e3", "9007199254740993"]) {
    assertFailsAt(
      githubRepositoryPointerDtoSchema.safeParse({ ...pointerDto, externalId }),
      ["externalId"],
      ID_MESSAGE,
      externalId,
    );
  }
  for (const fullName of ["octo/a/b", "Octo/Hello ", "Octo/.", "-Octo/Hello"]) {
    assertFailsAt(
      githubRepositoryPointerDtoSchema.safeParse({ ...pointerDto, fullName }),
      ["fullName"],
      FULL_NAME_MESSAGE,
      fullName,
    );
  }
});

test("[unhappy-10] a pointer DTO missing any field, or with an empty row id or a bad timestamp, is refused", () => {
  for (const key of Object.keys(pointerDto) as (keyof typeof pointerDto)[]) {
    assert.equal(
      githubRepositoryPointerDtoSchema.safeParse(without(pointerDto, key)).success,
      false,
      `${key} removed`,
    );
  }
  for (const change of [
    { id: "" },
    { id: 1 },
    { installationId: "" },
    { installationId: null },
    { externalId: 7 },
    { defaultBranch: "" },
    { createdAt: "2026-11-01" },
    { createdAt: "2026-11-01 00:00:00Z" },
    { createdAt: "2026-11-01T00:00:00+00:00" },
    { createdAt: "2026-13-01T00:00:00Z" },
  ]) {
    assert.equal(
      githubRepositoryPointerDtoSchema.safeParse({ ...pointerDto, ...change }).success,
      false,
      JSON.stringify(change),
    );
  }
});

// Extends "[unhappy-10]": a list holding one bad DTO is refused.
test("[unhappy-10] a repository list or pointer list holding one bad DTO is refused", () => {
  assert.equal(
    githubRepositoryListSchema.safeParse({
      repositories: [repositoryDto, { ...repositoryDto, externalId: 7 }],
    }).success,
    false,
  );
  assert.equal(
    githubRepositoryPointerListSchema.safeParse({
      pointers: [{ ...pointerDto, fullName: "octo/a/b" }, pointerDto],
    }).success,
    false,
  );
});

// ---- lists -----------------------------------------------------------------

// Extends "[boundary-5] empty lists are valid" and "[boundary-5] an empty list
// with an unknown key parses to exactly the empty list": every list schema.
test("[boundary-5] every empty list with unknown keys parses to exactly its empty list", () => {
  assert.deepEqual(
    githubInstallationListSchema.parse({ installations: [], next: "c", total: 0 }),
    { installations: [] },
  );
  assert.deepEqual(
    githubRepositoryListSchema.parse({ repositories: [], total_count: 0 }),
    { repositories: [] },
  );
  assert.deepEqual(
    githubRepositoryPointerListSchema.parse({ pointers: [], repositories: [] }),
    { pointers: [] },
  );
});

// Extends "[unhappy-11] a list without its array is refused" and
// "[unhappy-11] a pointer list keyed repositories or with a null array is
// refused": every list schema, under the other lists' keys and with a
// non-array value.
test("[unhappy-11] every list schema refuses a missing, misnamed or non-array list", () => {
  const cases = [
    [githubInstallationListSchema, "installations", ["repositories", "pointers"]],
    [githubRepositoryListSchema, "repositories", ["installations", "pointers"]],
    [githubRepositoryPointerListSchema, "pointers", ["installations", "repositories"]],
  ] as const;
  for (const [schema, key, otherKeys] of cases) {
    assert.equal(schema.safeParse({}).success, false, `${key}: {}`);
    for (const other of otherKeys) {
      assert.equal(
        schema.safeParse({ [other]: [] }).success,
        false,
        `${key}: keyed ${other}`,
      );
    }
    for (const value of [null, undefined, {}, "[]", 0]) {
      assert.equal(
        schema.safeParse({ [key]: value }).success,
        false,
        `${key}: ${JSON.stringify(value)}`,
      );
    }
    assert.equal(schema.safeParse([]).success, false, `${key}: bare array`);
  }
});
