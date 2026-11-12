/**
 * Hidden contract tests for the Jira connection, connect-body, board and issue
 * schemas, and for the existing exports staying as they were.
 *
 * Boards are built from a parsed connection (a board belongs to a connection)
 * and an issue's url from its trimmed site URL, the way `toIssueDto` builds it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  JIRA_ISSUE_KEY_MESSAGE,
  JIRA_SITE_URL_MESSAGE,
  UNKNOWN_BUILD,
  buildInfoSchema,
  connectJiraApiTokenSchema,
  createTodoSchema,
  handleSchema,
  inviteMemberSchema,
  jiraBoardListSchema,
  jiraBoardSchema,
  jiraConnectionListSchema,
  jiraConnectionSchema,
  jiraIssueListSchema,
  jiraIssueSchema,
  todoSchema,
  trimTrailingSlashes,
  type JiraBoardDto,
  type JiraConnectionDto,
  type JiraIssueDto,
} from "../../src/index.js";
import { buildInfoSchema as buildInfoSchemaFromModule } from "../../src/build-info.js";

const connection: JiraConnectionDto = {
  id: "jrc_1",
  siteUrl: "https://acme.atlassian.net",
  siteName: "Acme",
  authMethod: "oauth",
  createdAt: "2026-09-16T00:00:00.000Z",
};

const body = {
  siteUrl: "https://acme.atlassian.net/",
  email: "dana@example.test",
  apiToken: "  ATATT3xFfGF0abc  ",
};

/** The valid issue, its url built from the stored site URL as `toIssueDto` does. */
function validIssue(overrides: Partial<JiraIssueDto> = {}): JiraIssueDto {
  const key = overrides.key ?? "PROJ-123";
  return {
    id: "jri_1",
    boardId: "jrb_1",
    key,
    summary: "Fix the login redirect",
    status: "In Review",
    statusCategory: "indeterminate",
    assignee: "Dana",
    url: `${trimTrailingSlashes("https://acme.atlassian.net///")}/browse/PROJ-123`,
    updatedAt: "2026-09-17T09:14:00.000Z",
    ...overrides,
  };
}

/** A board of the given connection, as the API lists it after parsing the connection. */
function boardOf(
  source: Record<string, unknown> = connection,
  overrides: Partial<JiraBoardDto> = {},
): JiraBoardDto {
  const parsed = jiraConnectionSchema.parse(source);
  return { id: "jrb_1", connectionId: parsed.id, name: "Platform", ...overrides };
}

const MISSING = Symbol("missing");
function withField(
  value: Record<string, unknown>,
  field: string,
  replacement: unknown,
): Record<string, unknown> {
  const copy = { ...value };
  if (replacement === MISSING) {
    delete copy[field];
  } else {
    copy[field] = replacement;
  }
  return copy;
}

function label(field: string, replacement: unknown): string {
  return `${field}=${replacement === MISSING ? "(missing)" : JSON.stringify(replacement)}`;
}

// ---- jiraConnectionSchema --------------------------------------------------

// Extends "[happy-3] jiraConnectionSchema parses a well-formed connection to itself".
test("[happy-3] jiraConnectionSchema parses other well-formed connections to themselves", () => {
  const others: JiraConnectionDto[] = [
    {
      id: "jrc_9f2c",
      siteUrl: "https://jira.example.com/jira",
      siteName: "Example Jira (self-hosted)",
      authMethod: "api_token",
      createdAt: "2025-01-31T23:59:59.999Z",
    },
    {
      id: "conn-without-prefix",
      siteUrl: "https://Beta.Atlassian.net:8443",
      siteName: "Bêta ✓",
      authMethod: "oauth",
      createdAt: "2026-09-16T00:00:00Z",
    },
  ];
  for (const other of others) {
    assert.deepEqual(jiraConnectionSchema.parse(other), other, other.id);
  }
});

// Extends "[happy-4] jiraConnectionSchema accepts both auth methods".
test("[happy-4] jiraConnectionSchema keeps each auth method alongside a padded, slashed siteUrl", () => {
  for (const authMethod of ["api_token", "oauth"] as const) {
    assert.deepEqual(
      jiraConnectionSchema.parse({
        ...connection,
        siteUrl: " https://acme.atlassian.net// ",
        authMethod,
      }),
      { ...connection, authMethod },
      authMethod,
    );
  }
});

// Extends "[happy-5] jiraConnectionSchema normalises a stored siteUrl with trailing slashes".
test("[happy-5] jiraConnectionSchema normalises stored siteUrls with paths, ports and long slash runs", () => {
  const cases: Array<[string, string]> = [
    ["https://jira.example.com/jira////", "https://jira.example.com/jira"],
    ["https://jira.example.com:8443/", "https://jira.example.com:8443"],
    ["\thttps://Acme.Atlassian.net/\n", "https://Acme.Atlassian.net"],
    ["https://acme.atlassian.net" + "/".repeat(60_000), "https://acme.atlassian.net"],
  ];
  for (const [siteUrl, expected] of cases) {
    const result = jiraConnectionSchema.parse({
      ...connection,
      authMethod: "api_token",
      siteUrl,
    });
    assert.deepEqual(
      result,
      { ...connection, authMethod: "api_token", siteUrl: expected },
      JSON.stringify(siteUrl.slice(0, 60)),
    );
  }
});

// Extends "[boundary-7] jiraConnectionSchema drops a leaked apiToken and email".
test("[boundary-7] jiraConnectionSchema keeps exactly its five keys when secrets of other names leak in", () => {
  const result = jiraConnectionSchema.parse({
    ...connection,
    siteUrl: "https://acme.atlassian.net/",
    apiToken: "secret-token",
    email: "dana@example.test",
    accessToken: "secret-access",
    password: "hunter2",
    credentials: { apiToken: "secret-token" },
  });
  assert.deepEqual(result, connection);
  assert.deepEqual(Object.keys(result).sort(), [
    "authMethod",
    "createdAt",
    "id",
    "siteName",
    "siteUrl",
  ]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("hunter2"), false);
});

// Extends "[boundary-7] ...": a leaked secret inside a listed connection.
test("[boundary-7] jiraConnectionListSchema drops leaked secrets from every listed connection", () => {
  const result = jiraConnectionListSchema.parse({
    connections: [
      { ...connection, apiToken: "secret-1" },
      { ...connection, id: "jrc_2", email: "dana@example.test", apiToken: "secret-2" },
    ],
  });
  assert.deepEqual(result, { connections: [connection, { ...connection, id: "jrc_2" }] });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

// Extends "[unhappy-3] jiraConnectionSchema refuses malformed connections".
test("[unhappy-3] jiraConnectionSchema refuses other malformed field values", () => {
  const changes: Array<[string, unknown]> = [
    ["siteUrl", "https://acme.atlassian.net/#top"],
    ["siteUrl", "https://acme.atlassian.net?x=1"],
    ["siteUrl", "ftp://acme.atlassian.net"],
    ["siteUrl", ""],
    ["siteUrl", "   "],
    ["authMethod", "OAuth"],
    ["authMethod", "API_TOKEN"],
    ["authMethod", "api-token"],
    ["authMethod", "apiToken"],
    ["authMethod", ""],
    ["createdAt", "2026-09-16"],
    ["createdAt", "2026-09-16 00:00:00Z"],
    ["createdAt", "2026-09-16T00:00:00.000+00:00"],
    ["createdAt", ""],
    ["id", 1],
    ["siteName", null],
    ["createdAt", 0],
    ["authMethod", null],
    ["siteUrl", 42],
    ["siteUrl", null],
  ];
  for (const [field, replacement] of changes) {
    assert.equal(
      jiraConnectionSchema.safeParse(withField(connection, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

// Extends "[unhappy-3] ...": a refused siteUrl reports the site URL message on its field.
test("[unhappy-3] jiraConnectionSchema reports a refused siteUrl with the site URL message on siteUrl", () => {
  for (const siteUrl of ["http://acme.atlassian.net", "https://acme.atlassian.net/?", "nope"]) {
    const result = jiraConnectionSchema.safeParse({ ...connection, siteUrl });
    assert.equal(result.success, false, siteUrl);
    assert.equal(result.error?.issues[0]?.message, JIRA_SITE_URL_MESSAGE, siteUrl);
    assert.deepEqual(result.error?.issues[0]?.path, ["siteUrl"], siteUrl);
  }
});

// Extends "[unhappy-3] ...": inputs that are not objects at all.
test("[unhappy-3] jiraConnectionSchema refuses non-object inputs and an empty object", () => {
  assert.equal(
    jiraConnectionSchema.safeParse({ ...connection, siteName: "" }).success,
    false,
  );
  for (const input of [null, undefined, "jrc_1", 1, [], [connection], {}]) {
    assert.equal(jiraConnectionSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

// Extends "[happy-6] jiraConnectionListSchema wraps connections under connections".
test("[happy-6] jiraConnectionListSchema keeps several connections in order, each normalised", () => {
  const second: JiraConnectionDto = {
    id: "jrc_2",
    siteUrl: "https://jira.example.com/jira",
    siteName: "Example",
    authMethod: "api_token",
    createdAt: "2026-10-01T12:00:00.000Z",
  };
  const third: JiraConnectionDto = { ...connection, id: "jrc_3", siteName: "Acme Two" };
  assert.deepEqual(
    jiraConnectionListSchema.parse({
      connections: [
        { ...third, siteUrl: "https://acme.atlassian.net/" },
        { ...second, siteUrl: "https://jira.example.com/jira///" },
        connection,
      ],
      nextPageToken: "abc",
    }),
    { connections: [third, second, connection] },
  );
});

// Extends "[unhappy-4] jiraConnectionListSchema refuses a list with one bad entry".
test("[unhappy-4] jiraConnectionListSchema refuses a bad entry first, in the middle or last", () => {
  const bad: Array<Record<string, unknown> | null> = [
    { ...connection, siteUrl: "http://acme.atlassian.net" },
    { ...connection, createdAt: "yesterday" },
    { ...connection, authMethod: "basic" },
    null,
  ];
  for (const entry of bad) {
    for (const connections of [
      [entry, connection],
      [connection, entry, connection],
      [connection, connection, entry],
    ]) {
      assert.equal(
        jiraConnectionListSchema.safeParse({ connections }).success,
        false,
        JSON.stringify(entry),
      );
    }
  }
});

// ---- connectJiraApiTokenSchema ---------------------------------------------

// Extends "[happy-7] connectJiraApiTokenSchema normalises the site URL and trims the token".
test("[happy-7] connectJiraApiTokenSchema parses other bodies, trimming only the token's ends", () => {
  const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
    [
      {
        siteUrl: "  https://jira.example.com/jira///  ",
        email: "dana+jira@example.test",
        apiToken: "\t\nATATT 3x/FfGF0==//\r\n",
      },
      {
        siteUrl: "https://jira.example.com/jira",
        email: "dana+jira@example.test",
        apiToken: "ATATT 3x/FfGF0==//",
      },
    ],
    [
      { siteUrl: "https://Acme.Atlassian.net", email: "Dana.Smith@Example.test", apiToken: "x" },
      { siteUrl: "https://Acme.Atlassian.net", email: "Dana.Smith@Example.test", apiToken: "x" },
    ],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(connectJiraApiTokenSchema.parse(input), expected);
  }
});

// Extends "[happy-7] ...": strip mode drops keys the body does not define.
test("[happy-7] connectJiraApiTokenSchema drops keys outside siteUrl, email and apiToken", () => {
  const result = connectJiraApiTokenSchema.parse({
    ...body,
    authMethod: "api_token",
    siteName: "Acme",
  });
  assert.deepEqual(result, {
    siteUrl: "https://acme.atlassian.net",
    email: "dana@example.test",
    apiToken: "ATATT3xFfGF0abc",
  });
  assert.deepEqual(Object.keys(result).sort(), ["apiToken", "email", "siteUrl"]);
});

// Extends "[unhappy-5] connectJiraApiTokenSchema refuses a blank token with its own message".
test("[unhappy-5] connectJiraApiTokenSchema refuses other blank tokens with its own message on apiToken", () => {
  for (const apiToken of ["\t", "\n", " \t\r\n ", " ", " ".repeat(10_000)]) {
    const result = connectJiraApiTokenSchema.safeParse({ ...body, apiToken });
    assert.equal(result.success, false, JSON.stringify(apiToken.slice(0, 10)));
    assert.equal(result.error?.issues[0]?.message, "Provide the API token.");
    assert.deepEqual(result.error?.issues[0]?.path, ["apiToken"]);
  }
});

// Extends "[unhappy-6] connectJiraApiTokenSchema refuses other malformed bodies".
test("[unhappy-6] connectJiraApiTokenSchema refuses other malformed emails and site URLs", () => {
  const changes: Array<[string, unknown]> = [
    ["email", "dana@"],
    ["email", "@example.test"],
    ["email", "dana example.test"],
    ["email", "dana@example.test "],
    ["email", "\tdana@example.test"],
    ["siteUrl", "https://acme.atlassian.net/#top"],
    ["siteUrl", "https://acme.atlassian.net?"],
    ["siteUrl", "ftp://acme.atlassian.net"],
    ["siteUrl", "acme.atlassian.net"],
    ["siteUrl", ""],
    ["email", null],
    ["apiToken", 42],
    ["apiToken", null],
    ["siteUrl", null],
  ];
  for (const [field, replacement] of changes) {
    assert.equal(
      connectJiraApiTokenSchema.safeParse(withField(body, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

// Extends "[unhappy-6] ...": a refused site URL in the body carries the site URL message.
test("[unhappy-6] connectJiraApiTokenSchema reports a refused siteUrl with the site URL message on siteUrl", () => {
  for (const siteUrl of ["http://acme.atlassian.net", "https://acme.atlassian.net/#x"]) {
    const result = connectJiraApiTokenSchema.safeParse({ ...body, siteUrl });
    assert.equal(result.success, false, siteUrl);
    assert.equal(result.error?.issues[0]?.message, JIRA_SITE_URL_MESSAGE, siteUrl);
    assert.deepEqual(result.error?.issues[0]?.path, ["siteUrl"], siteUrl);
  }
});

test("[unhappy-6] connectJiraApiTokenSchema refuses non-object bodies", () => {
  assert.equal(
    connectJiraApiTokenSchema.safeParse({ ...body, email: "not-an-email" }).success,
    false,
  );
  for (const input of [null, undefined, "body", [], {}]) {
    assert.equal(connectJiraApiTokenSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

// ---- jiraBoardSchema -------------------------------------------------------

// Extends "[happy-8] jiraBoardSchema parses a board to itself, inside and outside its list".
test("[happy-8] jiraBoardSchema parses other boards to themselves and the list keeps their order", () => {
  const first = boardOf({ ...connection, id: "jrc_42" }, { id: "jrb_a", name: "Plateforme ✓" });
  const second = boardOf(connection, { id: "board-without-prefix", name: "Mobile" });
  const third = boardOf({ ...connection, id: "x" }, { id: "y", name: "Z" });
  for (const board of [first, second, third]) {
    assert.deepEqual(jiraBoardSchema.parse(board), board);
  }
  assert.equal(first.connectionId, "jrc_42");
  assert.deepEqual(
    jiraBoardListSchema.parse({ boards: [third, first, second] }),
    { boards: [third, first, second] },
  );
});

// Extends "[happy-8] ...": unknown keys are dropped from boards inside the list too.
test("[happy-8] jiraBoardListSchema drops unknown keys from each board and from the list", () => {
  const board = boardOf();
  assert.deepEqual(
    jiraBoardListSchema.parse({
      boards: [{ ...board, projectKey: "PROJ", type: "scrum" }],
      total: 1,
    }),
    { boards: [board] },
  );
});

// Extends "[unhappy-7] jiraBoardSchema refuses malformed boards".
test("[unhappy-7] jiraBoardSchema refuses other malformed field values and non-objects", () => {
  const board = boardOf();
  const changes: Array<[string, unknown]> = [
    ["id", 1],
    ["id", null],
    ["connectionId", null],
    ["connectionId", 7],
    ["name", null],
    ["name", 0],
  ];
  for (const [field, replacement] of changes) {
    assert.equal(
      jiraBoardSchema.safeParse(withField(board, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
  for (const input of [null, "jrb_1", [board], {}]) {
    assert.equal(jiraBoardSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

test("[unhappy-7] jiraBoardListSchema refuses a bad board at any position and a malformed wrapper", () => {
  const board = boardOf();
  for (const boards of [
    [{ ...board, id: "" }, board],
    [board, { ...board, connectionId: "" }, board],
    [board, null],
  ]) {
    assert.equal(jiraBoardListSchema.safeParse({ boards }).success, false, JSON.stringify(boards));
  }
  assert.equal(jiraBoardListSchema.safeParse({}).success, false);
  assert.equal(jiraBoardListSchema.safeParse({ boards: board }).success, false);
});

// ---- jiraIssueSchema -------------------------------------------------------

// Extends "[happy-9] jiraIssueSchema parses a well-formed issue to itself".
test("[happy-9] jiraIssueSchema parses other well-formed issues to themselves", () => {
  const others = [
    validIssue({
      id: "jri_77",
      boardId: "jrb_9",
      key: "OPS_2-4096",
      summary: "Rotate the API token — läuft ab ✓",
      status: "Done",
      statusCategory: "done",
      assignee: "Dana Smith",
      url: "https://jira.example.com/jira/browse/OPS_2-4096",
      updatedAt: "2025-02-28T23:59:59Z",
    }),
    validIssue({ summary: "x".repeat(10_000), status: "Blocked by vendor" }),
  ];
  for (const other of others) {
    assert.deepEqual(jiraIssueSchema.parse(other), other, other.key);
  }
});

// Extends "[happy-10] jiraIssueSchema carries a null assignee for an unassigned issue".
test("[happy-10] jiraIssueSchema keeps a null assignee in every status category and inside a list", () => {
  for (const statusCategory of ["new", "indeterminate", "done"] as const) {
    const unassigned = validIssue({ assignee: null, statusCategory });
    assert.deepEqual(jiraIssueSchema.parse(unassigned), unassigned, statusCategory);
  }
  const result = jiraIssueListSchema.parse({ issues: [validIssue({ assignee: null })] });
  assert.equal(result.issues[0]?.assignee, null);
});

// Extends "[happy-11] jiraIssueSchema accepts each status category".
test("[happy-11] jiraIssueSchema keeps each status category with a status name that differs from it", () => {
  const cases: Array<[string, "new" | "indeterminate" | "done"]> = [
    ["To Do", "new"],
    ["Backlog", "new"],
    ["In Progress", "indeterminate"],
    ["Won't Fix", "done"],
  ];
  for (const [status, statusCategory] of cases) {
    const result = jiraIssueSchema.parse(validIssue({ status, statusCategory }));
    assert.equal(result.statusCategory, statusCategory, status);
    assert.equal(result.status, status, status);
  }
});

// Extends "[boundary-8] jiraIssueSchema accepts keys at the edges of the pattern unchanged".
test("[boundary-8] jiraIssueSchema accepts other keys at the edges of the pattern unchanged", () => {
  for (const key of [
    "Z9-1",
    "A0-00",
    "A_-1",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890",
    "Q-" + "9".repeat(50),
    "X" + "_".repeat(30) + "-5",
  ]) {
    assert.equal(jiraIssueSchema.parse(validIssue({ key })).key, key);
  }
});

// Extends "[unhappy-8] jiraIssueSchema refuses keys that do not look like PROJ-123,
// with the key message": unanchored or multiline regexes, \w, case-insensitive
// matching, and non-ASCII letters and digits.
test("[unhappy-8] jiraIssueSchema refuses other malformed keys with the key message", () => {
  for (const key of [
    "_PROJ-1",
    "PROJ_-",
    "PROJ--1",
    "PROJ-+1",
    "PROJ-1.0",
    "PROJ- 1",
    "PROJ -1",
    "\nPROJ-1",
    "PROJ-1\nPROJ-2",
    "x PROJ-1",
    "PROJ-1 x",
    "PRÖJ-1",
    "ＰROJ-1",
    "PROJ-١٢",
    "PROJ-１",
    "PROJ‐1", // HYPHEN
    "PROJ–1", // EN DASH
    "pROJ-1",
    "PROj-1",
    "PR-OJ-1",
    "123-456",
    "-",
  ]) {
    const result = jiraIssueSchema.safeParse(validIssue({ key }));
    assert.equal(result.success, false, JSON.stringify(key));
    assert.equal(result.error?.issues[0]?.message, JIRA_ISSUE_KEY_MESSAGE, JSON.stringify(key));
    assert.deepEqual(result.error?.issues[0]?.path, ["key"], JSON.stringify(key));
  }
});

// Extends "[unhappy-8] ...": the key is checked as given, not uppercased or trimmed first.
test("[unhappy-8] jiraIssueSchema refuses a key that would pass only after uppercasing or trimming", () => {
  for (const key of ["abc-1", "proj-0", "\tPROJ-123\t", "PROJ-123\r"]) {
    const result = jiraIssueSchema.safeParse(validIssue({ key }));
    assert.equal(result.success, false, JSON.stringify(key));
    assert.equal(result.error?.issues[0]?.message, JIRA_ISSUE_KEY_MESSAGE, JSON.stringify(key));
  }
});

// Extends "[unhappy-9] jiraIssueSchema refuses other malformed issues".
test("[unhappy-9] jiraIssueSchema refuses other malformed field values", () => {
  const changes: Array<[string, unknown]> = [
    ["id", MISSING],
    ["boardId", MISSING],
    ["summary", MISSING],
    ["status", MISSING],
    ["url", MISSING],
    ["updatedAt", MISSING],
    ["statusCategory", ""],
    ["statusCategory", "NEW"],
    ["statusCategory", "To Do"],
    ["statusCategory", "in_progress"],
    ["statusCategory", null],
    ["assignee", 0],
    ["assignee", { displayName: "Dana" }],
    ["key", 123],
    ["key", null],
    ["url", ""],
    ["url", "/browse/PROJ-123"],
    ["url", "acme.atlassian.net/browse/PROJ-123"],
    ["updatedAt", "2026-09-17"],
    ["updatedAt", "2026-09-17T09:14:00.000-05:00"],
    ["updatedAt", 1_758_100_440_000],
    ["status", null],
    ["summary", 1],
  ];
  for (const [field, replacement] of changes) {
    assert.equal(
      jiraIssueSchema.safeParse(withField(validIssue(), field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

test("[unhappy-9] jiraIssueSchema and its list refuse non-objects and a bad issue at any position", () => {
  const issue = validIssue();
  for (const input of [null, "PROJ-123", [issue], {}]) {
    assert.equal(jiraIssueSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  for (const issues of [
    [{ ...issue, statusCategory: "undefined" }, issue],
    [issue, { ...issue, summary: "" }, issue],
    [issue, null],
  ]) {
    assert.equal(jiraIssueListSchema.safeParse({ issues }).success, false, JSON.stringify(issues));
  }
  assert.equal(jiraIssueListSchema.safeParse({}).success, false);
  assert.equal(jiraIssueListSchema.safeParse({ issues: issue }).success, false);
});

// Extends "[boundary-9] jiraIssueSchema drops unknown issue fields".
test("[boundary-9] jiraIssueSchema keeps exactly its nine keys when other Jira fields come along", () => {
  const issue = validIssue({ assignee: null });
  const result = jiraIssueSchema.parse({
    ...issue,
    accountId: "5b10ac8d82e05b22cc7d4ef5",
    self: "https://acme.atlassian.net/rest/api/3/issue/10001",
    expand: "renderedFields",
    labels: ["auth", "login"],
  });
  assert.deepEqual(result, issue);
  assert.deepEqual(Object.keys(result).sort(), [
    "assignee",
    "boardId",
    "id",
    "key",
    "status",
    "statusCategory",
    "summary",
    "updatedAt",
    "url",
  ]);
});

// Extends "[happy-12] jiraIssueListSchema wraps issues under issues".
test("[happy-12] jiraIssueListSchema keeps several issues in order and drops unknown keys", () => {
  const issues = [
    validIssue({ id: "jri_3", key: "PROJ-3", statusCategory: "done" }),
    validIssue({ id: "jri_1", key: "PROJ-1", assignee: null, statusCategory: "new" }),
    validIssue({ id: "jri_2", key: "OPS-2" }),
  ];
  assert.deepEqual(
    jiraIssueListSchema.parse({
      issues: issues.map((issue) => ({ ...issue, priority: "High" })),
      startAt: 0,
    }),
    { issues },
  );
});

// ---- the existing contract -------------------------------------------------

// Extends "[happy-13] existing schemas behave as before".
test("[happy-13] the index serves the existing contract next to the Jira exports", () => {
  assert.equal(trimTrailingSlashes("https://acme.atlassian.net/"), "https://acme.atlassian.net");
  const todo = {
    id: "todo_2",
    title: "ship the jira contract",
    done: true,
    createdAt: "2026-11-04T08:30:00.000Z",
  };
  assert.deepEqual(todoSchema.parse(todo), todo);
  assert.deepEqual(createTodoSchema.parse({ title: "  buy milk  " }), { title: "buy milk" });
  assert.equal(handleSchema.parse("  FeverSoul  "), "feversoul");
  assert.equal(buildInfoSchema, buildInfoSchemaFromModule);
  assert.equal(UNKNOWN_BUILD, "unknown");
});

// Extends "[happy-13] ...": the spec ties both new timestamp fields to
// todoSchema.createdAt, so the existing schema must still agree with them.
test("[happy-13] todoSchema still accepts and refuses the same timestamps as the Jira schemas", () => {
  const cases: Array<[string, boolean]> = [
    ["2026-09-16T00:00:00.000Z", true],
    ["2026-09-16T00:00:00Z", true],
    ["2026-09-16T00:00:00+02:00", false],
    ["2026-09-16", false],
    ["yesterday", false],
  ];
  const todo = { id: "todo_1", title: "write tests", done: false };
  for (const [timestamp, accepted] of cases) {
    assert.equal(todoSchema.safeParse({ ...todo, createdAt: timestamp }).success, accepted, timestamp);
    assert.equal(
      jiraConnectionSchema.safeParse({ ...connection, createdAt: timestamp }).success,
      accepted,
      timestamp,
    );
    assert.equal(
      jiraIssueSchema.safeParse(validIssue({ updatedAt: timestamp })).success,
      accepted,
      timestamp,
    );
  }
});

// Extends "[happy-13] ...": the connect body's email follows inviteMemberSchema's, untrimmed.
test("[happy-13] inviteMemberSchema still accepts and refuses the same emails as the connect body", () => {
  const cases: Array<[string, boolean]> = [
    ["dana@example.test", true],
    ["dana+jira@example.test", true],
    [" dana@example.test ", false],
    ["not-an-email", false],
  ];
  for (const [email, accepted] of cases) {
    assert.equal(inviteMemberSchema.safeParse({ email }).success, accepted, email);
    assert.equal(
      connectJiraApiTokenSchema.safeParse({ ...body, email }).success,
      accepted,
      email,
    );
  }
});
