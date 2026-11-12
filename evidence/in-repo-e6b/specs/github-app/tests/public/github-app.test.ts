import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GITHUB_ACCOUNT_TYPES,
  GITHUB_REPOSITORY_SELECTIONS,
  GITHUB_SETUP_ACTIONS,
  githubAccountTypeSchema,
  githubInstallationDtoSchema,
  githubInstallationListSchema,
  githubInstallationRepositoriesResponseSchema,
  githubInstallationResponseSchema,
  githubRepositoryDtoSchema,
  githubRepositoryFullNameSchema,
  githubRepositoryListSchema,
  githubRepositoryPointerDtoSchema,
  githubRepositoryPointerListSchema,
  githubRepositoryResponseSchema,
  githubRepositorySelectionSchema,
  githubSetupActionSchema,
  githubSetupCallbackSchema,
  handleSchema,
  organizationSummarySchema,
  registerBoardSchema,
  trackRepositorySchema,
} from "../src/index.js";

/*
 * The GitHub wire contract (spec.md, issue #66). Each test name starts with
 * the key of the scenario it asserts: its kind tag and its position among the
 * scenarios of that kind, in spec order.
 */

const ID_MESSAGE = "Must be a positive whole number.";
const FULL_NAME_MESSAGE = "Must be owner/name.";
const CALLBACK_ID_MESSAGE =
  "installation_id is required unless setup_action is request.";

type Issue = { message: string; path: PropertyKey[] };
type SafeResult = { success: boolean; error?: { issues: Issue[] } };

/** The parse failed with an issue at `path` (and, if given, with `message`). */
function assertFailsAt(
  result: SafeResult,
  path: PropertyKey[],
  message?: string,
): void {
  assert.equal(result.success, false);
  const issues = result.error?.issues ?? [];
  assert.ok(
    issues.some(
      (issue) =>
        JSON.stringify(issue.path) === JSON.stringify(path) &&
        (message === undefined || issue.message === message),
    ),
    `expected an issue at ${JSON.stringify(path)}${
      message === undefined ? "" : ` with "${message}"`
    }, got ${JSON.stringify(issues.map((i) => [i.path, i.message]))}`,
  );
}

/** The parse failed, and one of its issues carries `message`. */
function assertFailsWithMessage(result: SafeResult, message: string): void {
  assert.equal(result.success, false);
  const issues = result.error?.issues ?? [];
  assert.ok(
    issues.some((issue) => issue.message === message),
    `expected "${message}", got ${JSON.stringify(issues.map((i) => i.message))}`,
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

// ---- vocabularies ----------------------------------------------------------

test("[happy-1] the constants list their values in order", () => {
  assert.deepEqual([...GITHUB_ACCOUNT_TYPES], ["user", "organization"]);
  assert.deepEqual([...GITHUB_REPOSITORY_SELECTIONS], ["all", "selected"]);
  assert.deepEqual([...GITHUB_SETUP_ACTIONS], ["install", "update", "request"]);
});

test("[happy-1] each enum schema's options are exactly its constant, in order", () => {
  assert.deepEqual(githubAccountTypeSchema.options, [...GITHUB_ACCOUNT_TYPES]);
  assert.deepEqual(githubRepositorySelectionSchema.options, [
    ...GITHUB_REPOSITORY_SELECTIONS,
  ]);
  assert.deepEqual(githubSetupActionSchema.options, [...GITHUB_SETUP_ACTIONS]);
});

test("[happy-2] each enum schema accepts its own values", () => {
  assert.equal(githubAccountTypeSchema.parse("user"), "user");
  assert.equal(githubAccountTypeSchema.parse("organization"), "organization");
  assert.equal(githubRepositorySelectionSchema.parse("all"), "all");
  assert.equal(githubRepositorySelectionSchema.parse("selected"), "selected");
  assert.equal(githubSetupActionSchema.parse("install"), "install");
  assert.equal(githubSetupActionSchema.parse("update"), "update");
  assert.equal(githubSetupActionSchema.parse("request"), "request");
});

test("[happy-2] the last value of each vocabulary parses to itself", () => {
  assert.equal(
    githubAccountTypeSchema.parse(GITHUB_ACCOUNT_TYPES.at(-1)),
    "organization",
  );
  assert.equal(
    githubRepositorySelectionSchema.parse(GITHUB_REPOSITORY_SELECTIONS.at(-1)),
    "selected",
  );
  assert.equal(
    githubSetupActionSchema.parse(GITHUB_SETUP_ACTIONS.at(-1)),
    "request",
  );
});

test("[unhappy-1] an enum schema refuses GitHub's casing and unknown values", () => {
  assert.equal(githubAccountTypeSchema.safeParse("User").success, false);
  assert.equal(githubAccountTypeSchema.safeParse("Organization").success, false);
  assert.equal(githubAccountTypeSchema.safeParse("enterprise").success, false);
  assert.equal(githubRepositorySelectionSchema.safeParse("none").success, false);
  assert.equal(githubSetupActionSchema.safeParse("uninstall").success, false);
});

test("[unhappy-1] an enum schema refuses the empty string and padded values", () => {
  for (const schema of [
    githubAccountTypeSchema,
    githubRepositorySelectionSchema,
    githubSetupActionSchema,
  ]) {
    assert.equal(schema.safeParse("").success, false);
  }
  assert.equal(githubAccountTypeSchema.safeParse(" user").success, false);
  assert.equal(githubRepositorySelectionSchema.safeParse("all ").success, false);
  assert.equal(githubSetupActionSchema.safeParse("INSTALL").success, false);
});

// ---- GitHub id text --------------------------------------------------------

test("[happy-3] a canonical id is accepted and kept as a string", () => {
  for (const id of ["1", "123456789"]) {
    const parsed = trackRepositorySchema.parse({
      installationId: "ghi_1",
      externalId: id,
    });
    assert.equal(parsed.externalId, id);
    assert.equal(typeof parsed.externalId, "string");
  }
});

test("[happy-3] the largest safe integer is accepted as an id and kept as a string", () => {
  const parsed = trackRepositorySchema.parse({
    installationId: "ghi_1",
    externalId: "9007199254740991",
  });
  assert.equal(parsed.externalId, "9007199254740991");
});

test("[boundary-1] one past the largest safe integer is refused", () => {
  assertFailsAt(
    trackRepositorySchema.safeParse({
      installationId: "ghi_1",
      externalId: "9007199254740992",
    }),
    ["externalId"],
    ID_MESSAGE,
  );
});

test("[boundary-1] an id far past the largest safe integer is refused", () => {
  assertFailsAt(
    trackRepositorySchema.safeParse({
      installationId: "ghi_1",
      externalId: "99999999999999999999",
    }),
    ["externalId"],
    ID_MESSAGE,
  );
});

test("[unhappy-2] a non-canonical id is refused rather than normalised", () => {
  for (const id of ["0", "0123", "-1", "+1", "1.5", "1e3", " 12", "abc"]) {
    assertFailsAt(
      trackRepositorySchema.safeParse({ installationId: "ghi_1", externalId: id }),
      ["externalId"],
      ID_MESSAGE,
    );
  }
});

test("[unhappy-2] an empty id is refused with the id message", () => {
  assertFailsAt(
    trackRepositorySchema.safeParse({ installationId: "ghi_1", externalId: "" }),
    ["externalId"],
    ID_MESSAGE,
  );
});

test("[unhappy-3] a numeric externalId is refused, not coerced", () => {
  assertFailsAt(
    trackRepositorySchema.safeParse({ installationId: "ghi_1", externalId: 123 }),
    ["externalId"],
  );
});

test("[unhappy-3] the smallest numeric externalId is refused too", () => {
  assertFailsAt(
    trackRepositorySchema.safeParse({ installationId: "ghi_1", externalId: 1 }),
    ["externalId"],
  );
});

// ---- full names ------------------------------------------------------------

test("[happy-4] a valid full name is returned unchanged", () => {
  for (const fullName of [
    "octo-org/hello-world",
    "Octo/Hello.World",
    "o/repo_name-1.x",
    "octo/.github",
  ]) {
    assert.equal(githubRepositoryFullNameSchema.parse(fullName), fullName);
  }
});

test("[happy-4] the shortest full name, one character each side, is returned unchanged", () => {
  assert.equal(githubRepositoryFullNameSchema.parse("a/b"), "a/b");
});

test("[boundary-2] the owner may be 39 characters but not 40", () => {
  assert.equal(
    githubRepositoryFullNameSchema.safeParse(`${"a".repeat(39)}/b`).success,
    true,
  );
  assert.equal(
    githubRepositoryFullNameSchema.safeParse(`${"a".repeat(40)}/b`).success,
    false,
  );
});

test("[boundary-2] the name may be 100 characters but not 101", () => {
  assert.equal(
    githubRepositoryFullNameSchema.safeParse(`a/${"b".repeat(100)}`).success,
    true,
  );
  assert.equal(
    githubRepositoryFullNameSchema.safeParse(`a/${"b".repeat(101)}`).success,
    false,
  );
});

test("[unhappy-4] a malformed full name is refused", () => {
  for (const fullName of [
    "octo",
    "octo/",
    "/repo",
    "a/b/c",
    "-octo/repo",
    "octo-/repo",
    "octo_org/repo",
    "octo/.",
    "octo/..",
    "octo/re po",
  ]) {
    assertFailsWithMessage(
      githubRepositoryFullNameSchema.safeParse(fullName),
      FULL_NAME_MESSAGE,
    );
  }
});

test("[unhappy-4] a full name with surrounding whitespace is refused, not trimmed", () => {
  for (const fullName of [" octo/repo", "octo/repo "]) {
    assertFailsWithMessage(
      githubRepositoryFullNameSchema.safeParse(fullName),
      FULL_NAME_MESSAGE,
    );
  }
});

// ---- setup callback --------------------------------------------------------

test("[happy-5] an install or update yields GitHub's installation id as a number", () => {
  for (const action of ["install", "update"] as const) {
    assert.deepEqual(
      githubSetupCallbackSchema.parse({
        installation_id: "42",
        setup_action: action,
        state: "s1",
      }),
      { installationId: 42, setupAction: action, state: "s1" },
    );
  }
});

test("[happy-5] the largest safe installation id becomes that number", () => {
  assert.deepEqual(
    githubSetupCallbackSchema.parse({
      installation_id: "9007199254740991",
      setup_action: "install",
      state: "s1",
    }),
    {
      installationId: Number.MAX_SAFE_INTEGER,
      setupAction: "install",
      state: "s1",
    },
  );
});

test("[happy-6] a request without an installation id yields a null id", () => {
  assert.deepEqual(
    githubSetupCallbackSchema.parse({ setup_action: "request", state: "s1" }),
    { installationId: null, setupAction: "request", state: "s1" },
  );
});

test("[happy-6] a request with a one-character state yields a null id", () => {
  assert.deepEqual(
    githubSetupCallbackSchema.parse({ setup_action: "request", state: "x" }),
    { installationId: null, setupAction: "request", state: "x" },
  );
});

test("[boundary-3] a request that does carry an id still yields a null id", () => {
  assert.deepEqual(
    githubSetupCallbackSchema.parse({
      installation_id: "42",
      setup_action: "request",
      state: "s1",
    }),
    { installationId: null, setupAction: "request", state: "s1" },
  );
});

test("[boundary-3] a request carrying the largest safe id still yields a null id", () => {
  assert.deepEqual(
    githubSetupCallbackSchema.parse({
      installation_id: "9007199254740991",
      setup_action: "request",
      state: "s1",
    }),
    { installationId: null, setupAction: "request", state: "s1" },
  );
});

test("[unhappy-5] an install or update without an id is refused", () => {
  for (const action of ["install", "update"] as const) {
    assertFailsAt(
      githubSetupCallbackSchema.safeParse({ setup_action: action, state: "s1" }),
      ["installation_id"],
      CALLBACK_ID_MESSAGE,
    );
  }
});

test("[unhappy-5] an update without an id is refused even with other query parameters", () => {
  assertFailsAt(
    githubSetupCallbackSchema.safeParse({
      setup_action: "update",
      state: "s1",
      code: "abc",
    }),
    ["installation_id"],
    CALLBACK_ID_MESSAGE,
  );
});

test("[unhappy-6] a malformed callback is refused", () => {
  for (const query of [
    { installation_id: "42", setup_action: "install" },
    { installation_id: "42", state: "s1" },
    { installation_id: "42", setup_action: "remove", state: "s1" },
    { installation_id: 42, setup_action: "install", state: "s1" },
  ]) {
    assert.equal(
      githubSetupCallbackSchema.safeParse(query).success,
      false,
      JSON.stringify(query),
    );
  }
});

test("[unhappy-6] an empty state or a zero installation id is refused", () => {
  assert.equal(
    githubSetupCallbackSchema.safeParse({
      installation_id: "42",
      setup_action: "install",
      state: "",
    }).success,
    false,
  );
  assert.equal(
    githubSetupCallbackSchema.safeParse({
      installation_id: "0",
      setup_action: "install",
      state: "s1",
    }).success,
    false,
  );
});

test("[happy-7] extra query parameters are dropped", () => {
  const parsed = githubSetupCallbackSchema.parse({
    installation_id: "42",
    setup_action: "install",
    state: "s1",
    code: "abc",
  });
  assert.deepEqual(parsed, { installationId: 42, setupAction: "install", state: "s1" });
  assert.equal("code" in parsed, false);
});

test("[happy-7] extra query parameters on a request are dropped too", () => {
  const parsed = githubSetupCallbackSchema.parse({
    setup_action: "request",
    state: "s1",
    code: "abc",
  });
  assert.deepEqual(parsed, { installationId: null, setupAction: "request", state: "s1" });
  assert.equal("code" in parsed, false);
});

// ---- GitHub's payloads -----------------------------------------------------

test("[happy-8] an installation parses with nothing but its id", () => {
  const parsed = githubInstallationResponseSchema.parse({ id: 42 });
  assert.equal(parsed.id, 42);
  assert.equal(parsed.account, undefined);
  assert.equal(parsed.repository_selection, undefined);
  assert.equal(parsed.suspended_at, undefined);
});

test("[happy-8] an installation parses with the smallest and the largest safe id", () => {
  assert.equal(githubInstallationResponseSchema.parse({ id: 1 }).id, 1);
  assert.equal(
    githubInstallationResponseSchema.parse({ id: Number.MAX_SAFE_INTEGER }).id,
    Number.MAX_SAFE_INTEGER,
  );
});

test("[happy-9] an installation with a null account, an unfamiliar selection and an unknown field parses", () => {
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
  assert.equal(parsed["somethingNew"], true);
});

test("[happy-9] an account keeps GitHub's free-form type and its unknown fields", () => {
  const parsed = githubInstallationResponseSchema.parse({
    id: 42,
    account: { login: "octo-org", id: 9, type: "Bot", node_id: "MDQ6" },
  });
  assert.equal(parsed.account?.login, "octo-org");
  assert.equal(parsed.account?.id, 9);
  assert.equal(parsed.account?.type, "Bot");
  assert.equal(parsed.account?.["node_id"], "MDQ6");
});

test("[unhappy-7] an installation without a usable id is refused", () => {
  for (const payload of [{}, { id: "42" }, { id: 0 }, { id: 1.5 }]) {
    assert.equal(
      githubInstallationResponseSchema.safeParse(payload).success,
      false,
      JSON.stringify(payload),
    );
  }
});

test("[unhappy-7] an installation id one past the largest safe integer is refused", () => {
  assert.equal(
    githubInstallationResponseSchema.safeParse({ id: 9007199254740992 }).success,
    false,
  );
});

test("[happy-10] a repository parses with only its id and full name, keeping unknown fields", () => {
  const parsed = githubRepositoryResponseSchema.parse({
    id: 7,
    full_name: "octo/hello",
    topics: ["x"],
  });
  assert.equal(parsed.id, 7);
  assert.equal(parsed.full_name, "octo/hello");
  assert.equal(parsed.private, undefined);
  assert.equal(parsed.default_branch, undefined);
  assert.equal(parsed.archived, undefined);
  assert.deepEqual(parsed["topics"], ["x"]);
});

test("[happy-10] a repository's full name is not checked against the full-name rule", () => {
  const parsed = githubRepositoryResponseSchema.parse({
    id: 7,
    full_name: "not an owner/name/at all",
  });
  assert.equal(parsed.full_name, "not an owner/name/at all");
});

test("[unhappy-8] a repository without its id or full name is refused", () => {
  assert.equal(
    githubRepositoryResponseSchema.safeParse({ full_name: "octo/a" }).success,
    false,
  );
  assert.equal(githubRepositoryResponseSchema.safeParse({ id: 7 }).success, false);
});

test("[unhappy-8] a repository with a zero id or a null full name is refused", () => {
  assert.equal(
    githubRepositoryResponseSchema.safeParse({ id: 0, full_name: "octo/a" }).success,
    false,
  );
  assert.equal(
    githubRepositoryResponseSchema.safeParse({ id: 7, full_name: null }).success,
    false,
  );
});

test("[boundary-4] an installation's repository page with no repositories parses as empty", () => {
  const parsed = githubInstallationRepositoriesResponseSchema.parse({});
  assert.deepEqual(parsed.repositories, []);
  assert.equal(parsed.total_count, undefined);
});

test("[boundary-4] a repository page with a zero count and no array parses as empty", () => {
  const parsed = githubInstallationRepositoriesResponseSchema.parse({
    total_count: 0,
  });
  assert.deepEqual(parsed.repositories, []);
  assert.equal(parsed.total_count, 0);
});

test("[happy-11] a repository page keeps its repositories in the order GitHub sent", () => {
  const parsed = githubInstallationRepositoriesResponseSchema.parse({
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

test("[happy-11] a repository page neither sorts nor deduplicates", () => {
  const parsed = githubInstallationRepositoriesResponseSchema.parse({
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

// ---- our DTOs --------------------------------------------------------------

test("[happy-12] a complete installation DTO round-trips", () => {
  assert.deepEqual(githubInstallationDtoSchema.parse(installationDto), installationDto);
  assert.deepEqual(
    githubInstallationListSchema.parse({ installations: [installationDto] }),
    { installations: [installationDto] },
  );
});

test("[happy-12] an installation DTO with the other enum values and the largest safe id round-trips", () => {
  const dto = {
    ...installationDto,
    installationId: Number.MAX_SAFE_INTEGER,
    accountType: "user",
    repositorySelection: "all",
    suspended: true,
  } as const;
  assert.deepEqual(githubInstallationDtoSchema.parse(dto), dto);
});

test("[unhappy-9] an installation DTO missing a field is refused", () => {
  for (const key of Object.keys(installationDto) as (keyof typeof installationDto)[]) {
    assert.equal(
      githubInstallationDtoSchema.safeParse(without(installationDto, key)).success,
      false,
      `${key} removed`,
    );
  }
});

test("[unhappy-9] an installation DTO with an empty or mistyped field is refused", () => {
  for (const change of [
    { id: "" },
    { accountLogin: "" },
    { installationId: 0 },
    { installationId: "42" },
    { accountType: "Organization" },
    { repositorySelection: "some" },
    { suspended: null },
    { createdAt: "2026-11-01" },
  ]) {
    assert.equal(
      githubInstallationDtoSchema.safeParse({ ...installationDto, ...change }).success,
      false,
      JSON.stringify(change),
    );
  }
});

test("[happy-13] an unknown key on an installation DTO is stripped", () => {
  const parsed = githubInstallationDtoSchema.parse({
    ...installationDto,
    token: "secret",
  });
  assert.equal("token" in parsed, false);
  assert.deepEqual(parsed, installationDto);
});

test("[happy-13] an unknown key inside an installation list is stripped", () => {
  const parsed = githubInstallationListSchema.parse({
    installations: [{ ...installationDto, token: "secret" }],
  });
  assert.deepEqual(parsed, { installations: [installationDto] });
  assert.equal("token" in (parsed.installations[0] ?? {}), false);
});

test("[happy-14] a complete repository DTO round-trips", () => {
  assert.deepEqual(githubRepositoryDtoSchema.parse(repositoryDto), repositoryDto);
  assert.deepEqual(
    githubRepositoryListSchema.parse({ repositories: [repositoryDto] }),
    { repositories: [repositoryDto] },
  );
});

test("[happy-14] a repository DTO with the extreme id, the shortest name and flipped flags round-trips", () => {
  const dto = {
    externalId: "9007199254740991",
    fullName: "a/b",
    private: false,
    defaultBranch: "x",
    archived: true,
  };
  assert.deepEqual(githubRepositoryDtoSchema.parse(dto), dto);
});

test("[happy-15] a complete repository pointer DTO round-trips", () => {
  assert.deepEqual(githubRepositoryPointerDtoSchema.parse(pointerDto), pointerDto);
  assert.deepEqual(
    githubRepositoryPointerListSchema.parse({ pointers: [pointerDto] }),
    { pointers: [pointerDto] },
  );
});

test("[happy-15] a pointer list keeps its order and does not deduplicate by externalId", () => {
  const second = { ...pointerDto, id: "ptr_2", fullName: "octo/renamed" };
  assert.deepEqual(
    githubRepositoryPointerListSchema.parse({ pointers: [second, pointerDto] }),
    { pointers: [second, pointerDto] },
  );
});

test("[unhappy-10] a repository DTO with a bad field is refused", () => {
  for (const candidate of [
    { ...repositoryDto, externalId: 7 },
    { ...repositoryDto, fullName: "hello" },
    { ...repositoryDto, defaultBranch: "" },
    without(repositoryDto, "private"),
    without(repositoryDto, "archived"),
  ]) {
    assert.equal(
      githubRepositoryDtoSchema.safeParse(candidate).success,
      false,
      JSON.stringify(candidate),
    );
  }
});

test("[unhappy-10] a pointer DTO with a bad field is refused", () => {
  for (const candidate of [
    { ...pointerDto, installationId: 42 },
    { ...pointerDto, externalId: "007" },
    { ...pointerDto, fullName: "octo/a/b" },
    without(pointerDto, "defaultBranch"),
    { ...pointerDto, createdAt: "yesterday" },
  ]) {
    assert.equal(
      githubRepositoryPointerDtoSchema.safeParse(candidate).success,
      false,
      JSON.stringify(candidate),
    );
  }
});

test("[boundary-5] empty lists are valid", () => {
  assert.deepEqual(githubInstallationListSchema.parse({ installations: [] }), {
    installations: [],
  });
  assert.deepEqual(githubRepositoryListSchema.parse({ repositories: [] }), {
    repositories: [],
  });
  assert.deepEqual(githubRepositoryPointerListSchema.parse({ pointers: [] }), {
    pointers: [],
  });
});

test("[boundary-5] an empty list with an unknown key parses to exactly the empty list", () => {
  assert.deepEqual(
    githubRepositoryPointerListSchema.parse({ pointers: [], next: "cursor" }),
    { pointers: [] },
  );
});

test("[unhappy-11] a list without its array is refused", () => {
  assert.equal(githubRepositoryPointerListSchema.safeParse({}).success, false);
});

test("[unhappy-11] a pointer list keyed repositories or with a null array is refused", () => {
  assert.equal(
    githubRepositoryPointerListSchema.safeParse({ repositories: [] }).success,
    false,
  );
  assert.equal(
    githubRepositoryPointerListSchema.safeParse({ pointers: null }).success,
    false,
  );
});

// ---- track body ------------------------------------------------------------

test("[happy-16] a track body parses unchanged", () => {
  assert.deepEqual(
    trackRepositorySchema.parse({ installationId: "ghi_1", externalId: "7" }),
    { installationId: "ghi_1", externalId: "7" },
  );
});

test("[happy-16] a track body with a one-character installation id and id 1 parses unchanged", () => {
  assert.deepEqual(
    trackRepositorySchema.parse({ installationId: "g", externalId: "1" }),
    { installationId: "g", externalId: "1" },
  );
});

test("[happy-17] unknown keys in a track body are stripped", () => {
  const parsed = trackRepositorySchema.parse({
    installationId: "ghi_1",
    externalId: "7",
    fullName: "octo/hello",
  });
  assert.deepEqual(parsed, { installationId: "ghi_1", externalId: "7" });
  assert.equal("fullName" in parsed, false);
});

test("[happy-17] several unknown keys in a track body are all stripped", () => {
  assert.deepEqual(
    trackRepositorySchema.parse({
      installationId: "ghi_1",
      externalId: "7",
      fullName: "octo/hello",
      full_name: "octo/hello",
      installation_id: 42,
    }),
    { installationId: "ghi_1", externalId: "7" },
  );
});

test("[unhappy-12] a track body without an installation is refused", () => {
  for (const body of [
    { externalId: "7" },
    { installationId: "", externalId: "7" },
    { installationId: 1, externalId: "7" },
  ]) {
    assertFailsAt(trackRepositorySchema.safeParse(body), ["installationId"]);
  }
});

test("[unhappy-12] a track body with a null installation is refused", () => {
  assertFailsAt(
    trackRepositorySchema.safeParse({ installationId: null, externalId: "7" }),
    ["installationId"],
  );
});

// ---- existing exports ------------------------------------------------------

test("[happy-18] the organization and Jira contracts still parse as before", () => {
  assert.equal(
    organizationSummarySchema.parse({ id: "org_1", name: "Acme", slug: "acme" }).kind,
    "team",
  );
  assert.deepEqual(
    registerBoardSchema.parse({ connectionId: "c1", externalId: "10" }),
    { connectionId: "c1", externalId: "10" },
  );
  assert.equal(handleSchema.parse("  FeverSoul  "), "feversoul");
});

test("[happy-18] registerBoardSchema still accepts any non-empty externalId", () => {
  // The GitHub id rule must not leak into Jira's board registration.
  assert.deepEqual(
    registerBoardSchema.parse({ connectionId: "c1", externalId: "0123" }),
    { connectionId: "c1", externalId: "0123" },
  );
});
