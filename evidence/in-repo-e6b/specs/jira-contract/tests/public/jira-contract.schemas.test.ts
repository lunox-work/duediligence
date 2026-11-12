/**
 * Public contract tests for the Jira connection, connect-body, board and issue
 * schemas, and for the existing exports staying as they were.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  JIRA_AUTH_METHODS,
  JIRA_ISSUE_KEY_MESSAGE,
  JIRA_STATUS_CATEGORIES,
  UNKNOWN_BUILD,
  buildInfoSchema,
  connectJiraApiTokenSchema,
  handleSchema,
  jiraAuthMethodSchema,
  jiraBoardListSchema,
  jiraBoardSchema,
  jiraConnectionListSchema,
  jiraConnectionSchema,
  jiraIssueListSchema,
  jiraIssueSchema,
  jiraStatusCategorySchema,
  todoSchema,
  type ConnectJiraApiTokenInput,
  type JiraBoardDto,
  type JiraConnectionDto,
  type JiraIssueDto,
} from "../src/index.js";
import { buildInfoSchema as buildInfoSchemaFromModule } from "../src/build-info.js";

const connection: JiraConnectionDto = {
  id: "jrc_1",
  siteUrl: "https://acme.atlassian.net",
  siteName: "Acme",
  authMethod: "oauth",
  createdAt: "2026-09-16T00:00:00.000Z",
};

const issue: JiraIssueDto = {
  id: "jri_1",
  boardId: "jrb_1",
  key: "PROJ-123",
  summary: "Fix the login redirect",
  status: "In Review",
  statusCategory: "indeterminate",
  assignee: "Dana",
  url: "https://acme.atlassian.net/browse/PROJ-123",
  updatedAt: "2026-09-17T09:14:00.000Z",
};

const body = {
  siteUrl: "https://acme.atlassian.net/",
  email: "dana@example.test",
  apiToken: "  ATATT3xFfGF0abc  ",
};

const board: JiraBoardDto = { id: "jrb_1", connectionId: "jrc_1", name: "Platform" };

/** A copy of `value` with `field` set, or removed when `replacement` is MISSING. */
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

test("[happy-3] jiraConnectionSchema parses a well-formed connection to itself", () => {
  assert.deepEqual(jiraConnectionSchema.parse(connection), connection);
});

test("[happy-3] jiraConnectionSchema accepts one-character ids and names without a prefix", () => {
  const minimal = { ...connection, id: "x", siteName: "A" };
  assert.deepEqual(jiraConnectionSchema.parse(minimal), minimal);
});

test("[happy-4] jiraConnectionSchema accepts both auth methods", () => {
  for (const authMethod of ["oauth", "api_token"]) {
    assert.ok(
      jiraConnectionSchema.safeParse({ ...connection, authMethod }).success,
      authMethod,
    );
  }
});

test("[happy-4] the auth methods are exactly oauth and api_token, each kept as given", () => {
  assert.deepEqual([...JIRA_AUTH_METHODS], ["oauth", "api_token"]);
  for (const authMethod of JIRA_AUTH_METHODS) {
    assert.equal(jiraAuthMethodSchema.parse(authMethod), authMethod);
    assert.equal(
      jiraConnectionSchema.parse({ ...connection, authMethod }).authMethod,
      authMethod,
    );
  }
});

test("[happy-5] jiraConnectionSchema normalises a stored siteUrl with trailing slashes", () => {
  const result = jiraConnectionSchema.parse({
    ...connection,
    siteUrl: "https://acme.atlassian.net///",
  });
  assert.equal(result.siteUrl, "https://acme.atlassian.net");
});

test("[happy-5] jiraConnectionSchema normalises a padded siteUrl and leaves the other fields alone", () => {
  const result = jiraConnectionSchema.parse({
    ...connection,
    siteUrl: "  https://acme.atlassian.net/  ",
  });
  assert.deepEqual(result, connection);
});

test("[boundary-7] jiraConnectionSchema drops a leaked apiToken and email", () => {
  const result = jiraConnectionSchema.parse({
    ...connection,
    apiToken: "secret-token",
    email: "dana@example.test",
  });
  assert.deepEqual(result, connection);
  assert.equal(Object.hasOwn(result, "apiToken"), false);
  assert.equal(Object.hasOwn(result, "email"), false);
});

test("[boundary-7] jiraConnectionSchema drops any other unknown key", () => {
  const result = jiraConnectionSchema.parse({
    ...connection,
    cloudId: "abc",
    refreshToken: "secret-refresh",
  });
  assert.deepEqual(result, connection);
  assert.equal(Object.hasOwn(result, "refreshToken"), false);
});

test("[unhappy-3] jiraConnectionSchema refuses malformed connections", () => {
  const changes: Array<[string, unknown]> = [
    ["id", ""],
    ["siteUrl", "http://acme.atlassian.net"],
    ["siteName", ""],
    ["authMethod", "basic"],
    ["createdAt", "yesterday"],
    ["createdAt", "2026-09-16T00:00:00+02:00"],
    ["id", MISSING],
  ];
  for (const [field, replacement] of changes) {
    assert.equal(
      jiraConnectionSchema.safeParse(withField(connection, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

test("[unhappy-3] jiraConnectionSchema requires every field", () => {
  for (const field of ["siteUrl", "siteName", "authMethod", "createdAt"]) {
    assert.equal(
      jiraConnectionSchema.safeParse(withField(connection, field, MISSING)).success,
      false,
      field,
    );
  }
});

test("[happy-6] jiraConnectionListSchema wraps connections under connections", () => {
  assert.deepEqual(
    jiraConnectionListSchema.parse({ connections: [connection] }),
    { connections: [connection] },
  );
  assert.deepEqual(jiraConnectionListSchema.parse({ connections: [] }), {
    connections: [],
  });
});

test("[happy-6] jiraConnectionListSchema normalises the siteUrl of each entry", () => {
  assert.deepEqual(
    jiraConnectionListSchema.parse({
      connections: [{ ...connection, siteUrl: "https://acme.atlassian.net//" }],
    }),
    { connections: [connection] },
  );
});

test("[unhappy-4] jiraConnectionListSchema refuses a list with one bad entry", () => {
  assert.equal(
    jiraConnectionListSchema.safeParse({
      connections: [connection, { ...connection, siteUrl: "nope" }],
    }).success,
    false,
  );
});

test("[unhappy-4] jiraConnectionListSchema refuses a missing or non-array connections", () => {
  assert.equal(jiraConnectionListSchema.safeParse({}).success, false);
  assert.equal(
    jiraConnectionListSchema.safeParse({ connections: connection }).success,
    false,
  );
});

// ---- connectJiraApiTokenSchema ---------------------------------------------

test("[happy-7] connectJiraApiTokenSchema normalises the site URL and trims the token", () => {
  const expected: ConnectJiraApiTokenInput = {
    siteUrl: "https://acme.atlassian.net",
    email: "dana@example.test",
    apiToken: "ATATT3xFfGF0abc",
  };
  assert.deepEqual(connectJiraApiTokenSchema.parse(body), expected);
});

test("[happy-7] connectJiraApiTokenSchema trims only the ends of the token", () => {
  assert.equal(
    connectJiraApiTokenSchema.parse({ ...body, apiToken: " abc def " }).apiToken,
    "abc def",
  );
});

test("[unhappy-5] connectJiraApiTokenSchema refuses a blank token with its own message", () => {
  for (const apiToken of ["", "    "]) {
    const result = connectJiraApiTokenSchema.safeParse({ ...body, apiToken });
    assert.equal(result.success, false, JSON.stringify(apiToken));
    assert.equal(
      result.error?.issues[0]?.message,
      "Provide the API token.",
      JSON.stringify(apiToken),
    );
  }
});

test("[unhappy-5] connectJiraApiTokenSchema treats a tab-and-newline token as blank", () => {
  const result = connectJiraApiTokenSchema.safeParse({ ...body, apiToken: "\t\n" });
  assert.equal(result.success, false);
  assert.equal(result.error?.issues[0]?.message, "Provide the API token.");
});

test("[unhappy-6] connectJiraApiTokenSchema refuses other malformed bodies", () => {
  const changes: Array<[string, unknown]> = [
    ["siteUrl", "http://acme.atlassian.net"],
    ["email", "not-an-email"],
    ["email", " dana@example.test "],
    ["email", MISSING],
    ["apiToken", MISSING],
    ["siteUrl", MISSING],
  ];
  for (const [field, replacement] of changes) {
    assert.equal(
      connectJiraApiTokenSchema.safeParse(withField(body, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

test("[unhappy-6] connectJiraApiTokenSchema refuses a site URL with a query and an empty email", () => {
  for (const [field, replacement] of [
    ["siteUrl", "https://acme.atlassian.net/?x=1"],
    ["email", ""],
  ] as Array<[string, unknown]>) {
    assert.equal(
      connectJiraApiTokenSchema.safeParse(withField(body, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

// ---- jiraBoardSchema -------------------------------------------------------

test("[happy-8] jiraBoardSchema parses a board to itself, inside and outside its list", () => {
  assert.deepEqual(jiraBoardSchema.parse(board), board);
  assert.deepEqual(jiraBoardListSchema.parse({ boards: [board] }), {
    boards: [board],
  });
});

test("[happy-8] jiraBoardListSchema accepts an empty list and boards drop unknown keys", () => {
  assert.deepEqual(jiraBoardListSchema.parse({ boards: [] }), { boards: [] });
  assert.deepEqual(
    jiraBoardSchema.parse({ ...board, projectKey: "PROJ" }),
    board,
  );
});

test("[unhappy-7] jiraBoardSchema refuses malformed boards", () => {
  const changes: Array<[string, unknown]> = [
    ["id", ""],
    ["connectionId", ""],
    ["name", ""],
    ["name", MISSING],
  ];
  for (const [field, replacement] of changes) {
    assert.equal(
      jiraBoardSchema.safeParse(withField(board, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

test("[unhappy-7] jiraBoardSchema refuses a missing id or connectionId, and the list refuses a bad board", () => {
  for (const field of ["id", "connectionId"]) {
    assert.equal(
      jiraBoardSchema.safeParse(withField(board, field, MISSING)).success,
      false,
      field,
    );
  }
  assert.equal(
    jiraBoardListSchema.safeParse({ boards: [board, { ...board, name: "" }] }).success,
    false,
  );
});

// ---- jiraIssueSchema -------------------------------------------------------

test("[happy-9] jiraIssueSchema parses a well-formed issue to itself", () => {
  assert.deepEqual(jiraIssueSchema.parse(issue), issue);
});

test("[happy-9] jiraIssueSchema takes any non-empty status name as free text", () => {
  const custom = { ...issue, status: "Waiting for customer", id: "x", boardId: "y" };
  assert.deepEqual(jiraIssueSchema.parse(custom), custom);
});

test("[happy-10] jiraIssueSchema carries a null assignee for an unassigned issue", () => {
  const result = jiraIssueSchema.parse({ ...issue, assignee: null });
  assert.equal(result.assignee, null);
});

test("[happy-10] jiraIssueSchema keeps every other field of an unassigned issue", () => {
  const unassigned = { ...issue, assignee: null };
  assert.deepEqual(jiraIssueSchema.parse(unassigned), unassigned);
});

test("[happy-11] jiraIssueSchema accepts each status category", () => {
  for (const statusCategory of ["new", "indeterminate", "done"]) {
    assert.ok(
      jiraIssueSchema.safeParse({ ...issue, statusCategory }).success,
      statusCategory,
    );
  }
});

test("[happy-11] the status categories are exactly Jira's three, each kept as given", () => {
  assert.deepEqual([...JIRA_STATUS_CATEGORIES], ["new", "indeterminate", "done"]);
  for (const statusCategory of JIRA_STATUS_CATEGORIES) {
    assert.equal(jiraStatusCategorySchema.parse(statusCategory), statusCategory);
    assert.equal(
      jiraIssueSchema.parse({ ...issue, statusCategory }).statusCategory,
      statusCategory,
    );
  }
});

test("[boundary-8] jiraIssueSchema accepts keys at the edges of the pattern unchanged", () => {
  for (const key of ["A-1", "PROJ-0", "AB_2-99999", "P2P-7"]) {
    assert.equal(jiraIssueSchema.parse({ ...issue, key }).key, key);
  }
});

test("[boundary-8] jiraIssueSchema accepts an underscore-only project tail and a zero-padded number", () => {
  for (const key of ["Z_-0", "A_1_B-007"]) {
    assert.equal(jiraIssueSchema.parse({ ...issue, key }).key, key);
  }
});

test("[unhappy-8] jiraIssueSchema refuses keys that do not look like PROJ-123, with the key message", () => {
  for (const key of [
    "proj-123",
    "PROJ123",
    "PROJ-",
    "-123",
    "2PROJ-1",
    "PROJ-12a",
    " PROJ-123",
    "PROJ-1-2",
    "",
  ]) {
    const result = jiraIssueSchema.safeParse({ ...issue, key });
    assert.equal(result.success, false, JSON.stringify(key));
    assert.equal(
      result.error?.issues[0]?.message,
      JIRA_ISSUE_KEY_MESSAGE,
      JSON.stringify(key),
    );
  }
});

test("[unhappy-8] jiraIssueSchema refuses a key with a trailing newline or a mixed-case project", () => {
  for (const key of ["PROJ-123\n", "PROJ-123 ", "Proj-123"]) {
    const result = jiraIssueSchema.safeParse({ ...issue, key });
    assert.equal(result.success, false, JSON.stringify(key));
    assert.equal(
      result.error?.issues[0]?.message,
      JIRA_ISSUE_KEY_MESSAGE,
      JSON.stringify(key),
    );
  }
});

test("[unhappy-9] jiraIssueSchema refuses other malformed issues", () => {
  const changes: Array<[string, unknown]> = [
    ["id", ""],
    ["boardId", ""],
    ["summary", ""],
    ["status", ""],
    ["statusCategory", "undefined"],
    ["statusCategory", "Done"],
    ["assignee", MISSING],
    ["url", "not a url"],
    ["updatedAt", "yesterday"],
  ];
  for (const [field, replacement] of changes) {
    assert.equal(
      jiraIssueSchema.safeParse(withField(issue, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

test("[unhappy-9] jiraIssueSchema refuses an offset updatedAt and a missing key", () => {
  for (const [field, replacement] of [
    ["updatedAt", "2026-09-17T09:14:00+02:00"],
    ["key", MISSING],
    ["statusCategory", MISSING],
  ] as Array<[string, unknown]>) {
    assert.equal(
      jiraIssueSchema.safeParse(withField(issue, field, replacement)).success,
      false,
      label(field, replacement),
    );
  }
});

test("[boundary-9] jiraIssueSchema drops unknown issue fields", () => {
  assert.deepEqual(jiraIssueSchema.parse({ ...issue, priority: "High" }), issue);
});

test("[boundary-9] jiraIssueSchema drops several unknown fields, nested ones included", () => {
  const result = jiraIssueSchema.parse({
    ...issue,
    priority: "High",
    issueType: "Bug",
    fields: { labels: ["auth"] },
  });
  assert.deepEqual(result, issue);
  assert.equal(Object.hasOwn(result, "fields"), false);
});

test("[happy-12] jiraIssueListSchema wraps issues under issues", () => {
  assert.deepEqual(jiraIssueListSchema.parse({ issues: [issue] }), {
    issues: [issue],
  });
});

test("[happy-12] jiraIssueListSchema accepts an empty list", () => {
  assert.deepEqual(jiraIssueListSchema.parse({ issues: [] }), { issues: [] });
});

// ---- the existing contract -------------------------------------------------

test("[happy-13] existing schemas behave as before", () => {
  const todo = {
    id: "todo_1",
    title: "write tests",
    done: false,
    createdAt: "2026-09-16T00:00:00.000Z",
  };
  assert.deepEqual(todoSchema.parse(todo), todo);
  assert.equal(handleSchema.parse("  FeverSoul  "), "feversoul");
  assert.equal(typeof buildInfoSchema.parse, "function");
  assert.equal(typeof UNKNOWN_BUILD, "string");
});

test("[happy-13] the index re-exports build-info unchanged and todoSchema still refuses a non-ISO date", () => {
  assert.equal(buildInfoSchema, buildInfoSchemaFromModule);
  assert.equal(UNKNOWN_BUILD, "unknown");
  assert.equal(
    todoSchema.safeParse({
      id: "todo_1",
      title: "write tests",
      done: false,
      createdAt: "yesterday",
    }).success,
    false,
  );
});
