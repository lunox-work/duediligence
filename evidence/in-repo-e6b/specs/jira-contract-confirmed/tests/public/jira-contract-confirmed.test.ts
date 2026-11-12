/**
 * Tests for the Jira wire contract: the permissive `*Response` schemas for
 * what Atlassian sends, the strict `*Dto` schemas for what we hand on, and the
 * linear-time `trimTrailingSlashes` helper.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  JIRA_STATUS_CATEGORIES,
  UNKNOWN_BUILD,
  accessibleResourceSchema,
  buildInfoSchema,
  handleSchema,
  jiraBoardDtoSchema,
  jiraBoardPageResponseSchema,
  jiraBoardResponseSchema,
  jiraIssueDtoSchema,
  jiraIssuePageDtoSchema,
  jiraIssuePageResponseSchema,
  jiraIssueResponseSchema,
  jiraSiteDtoSchema,
  jiraSprintDtoSchema,
  jiraSprintPageResponseSchema,
  jiraSprintResponseSchema,
  jiraStatusCategorySchema,
  todoSchema,
  tokenResponseSchema,
  trimTrailingSlashes,
  type JiraBoardDto,
  type JiraIssueDto,
} from "../src/index.js";
import * as buildInfoModule from "../src/build-info.js";

const validIssue: JiraIssueDto = {
  id: "10001",
  key: "PROJ-123",
  summary: "Fix the login redirect",
  status: "In Review",
  statusCategory: "indeterminate",
  assignee: "Dana",
  priority: "High",
  issueType: "Bug",
  labels: ["auth"],
  projectKey: "PROJ",
  parentKey: null,
  created: "2026-09-16T00:00:00.000+0000",
  updated: "2026-09-17T09:14:00.000+0000",
  dueDate: null,
  url: "https://acme.atlassian.net/browse/PROJ-123",
};

const validBoard: JiraBoardDto = {
  id: 7,
  name: "Platform",
  type: "scrum",
  projectKey: "PROJ",
  projectName: "Project",
};

/** A copy of `base` without `key`, for "(missing)" rows. */
function without<T extends object>(base: T, key: keyof T): Partial<T> {
  const copy: Partial<T> = { ...base };
  delete copy[key];
  return copy;
}

const SITE = "https://acme.atlassian.net";

// ---------------------------------------------------------------------------
// trimTrailingSlashes
// ---------------------------------------------------------------------------

test("[happy-1] trimTrailingSlashes removes one or many trailing slashes", () => {
  assert.equal(trimTrailingSlashes("https://acme.atlassian.net/"), SITE);
  assert.equal(trimTrailingSlashes("https://acme.atlassian.net///"), SITE);
});

test("[happy-1] trimTrailingSlashes keeps the slashes before the trailing run", () => {
  assert.equal(
    trimTrailingSlashes("https://jira.example.com/jira/"),
    "https://jira.example.com/jira",
  );
  assert.equal(trimTrailingSlashes("a/b/c//"), "a/b/c");
});

test("[boundary-1] trimTrailingSlashes returns a URL with no trailing slash unchanged", () => {
  assert.equal(trimTrailingSlashes(SITE), SITE);
  assert.equal(trimTrailingSlashes("/leading"), "/leading");
});

test("[boundary-1] trimTrailingSlashes leaves inner double slashes and a single character alone", () => {
  assert.equal(trimTrailingSlashes("a//b"), "a//b");
  assert.equal(trimTrailingSlashes("x"), "x");
});

test("[boundary-2] trimTrailingSlashes returns the empty string for the empty string", () => {
  assert.equal(trimTrailingSlashes(""), "");
});

test("[boundary-2] trimTrailingSlashes trims all-slash strings to the empty string", () => {
  assert.equal(trimTrailingSlashes("/"), "");
  assert.equal(trimTrailingSlashes("/////"), "");
});

test("[boundary-3] trimTrailingSlashes keeps trailing backslashes", () => {
  assert.equal(
    trimTrailingSlashes("https://acme.atlassian.net\\\\"),
    "https://acme.atlassian.net\\\\",
  );
});

test("[boundary-3] trimTrailingSlashes does not trim a slash followed by a space or a tab", () => {
  assert.equal(
    trimTrailingSlashes("https://acme.atlassian.net/ "),
    "https://acme.atlassian.net/ ",
  );
  assert.equal(
    trimTrailingSlashes("https://acme.atlassian.net/\t"),
    "https://acme.atlassian.net/\t",
  );
});

test("[boundary-4] trimTrailingSlashes returns the right output for long runs of slashes", () => {
  const run = "/".repeat(60_000);
  assert.equal(trimTrailingSlashes(SITE + run), SITE);
  assert.equal(trimTrailingSlashes(run), "");
  assert.equal(trimTrailingSlashes(SITE + run + "x"), SITE + run + "x");
  assert.equal(trimTrailingSlashes("/".repeat(1_000_000)), "");
});

test("[boundary-4] trimTrailingSlashes handles each long input within 250 ms", () => {
  const run = "/".repeat(60_000);
  const inputs = [
    SITE + run,
    run,
    SITE + run + "x",
    "/".repeat(1_000_000),
  ];
  for (const input of inputs) {
    const started = performance.now();
    trimTrailingSlashes(input);
    const elapsed = performance.now() - started;
    assert.ok(
      elapsed < 250,
      `took ${elapsed.toFixed(0)} ms on an input of length ${input.length}`,
    );
  }
});

// ---------------------------------------------------------------------------
// jiraStatusCategorySchema
// ---------------------------------------------------------------------------

test("[happy-2] jiraStatusCategorySchema accepts each category", () => {
  for (const value of ["new", "indeterminate", "done", "unknown"]) {
    assert.equal(jiraStatusCategorySchema.parse(value), value);
  }
});

test("[happy-2] JIRA_STATUS_CATEGORIES is Jira's three categories plus unknown, in order", () => {
  assert.deepEqual(
    [...JIRA_STATUS_CATEGORIES],
    ["new", "indeterminate", "done", "unknown"],
  );
});

test("[unhappy-1] jiraStatusCategorySchema refuses Jira's display names", () => {
  for (const value of ["To Do", "Done"]) {
    assert.equal(jiraStatusCategorySchema.safeParse(value).success, false);
  }
});

test("[unhappy-1] jiraStatusCategorySchema refuses Jira's 'undefined' and the empty string", () => {
  for (const value of ["undefined", ""]) {
    assert.equal(jiraStatusCategorySchema.safeParse(value).success, false);
  }
});

// ---------------------------------------------------------------------------
// jiraIssueResponseSchema and jiraIssuePageResponseSchema
// ---------------------------------------------------------------------------

test("[happy-3] jiraIssueResponseSchema parses an issue with no fields block", () => {
  const input = { id: "10001", key: "PROJ-123" };
  assert.deepEqual(jiraIssueResponseSchema.parse(input), input);
});

test("[happy-3] jiraIssueResponseSchema adds no fields block to an issue without one", () => {
  const parsed = jiraIssueResponseSchema.parse({ id: "10001", key: "PROJ-123" });
  assert.equal("fields" in parsed, false);
});

const fullIssueResponse = {
  id: "10001",
  key: "PROJ-123",
  fields: {
    summary: "Fix the login redirect",
    status: {
      name: "In Review",
      statusCategory: { key: "indeterminate", name: "In Progress" },
    },
    assignee: null,
    priority: null,
    parent: null,
    issuetype: { name: "Bug" },
    labels: ["auth"],
    project: { key: "PROJ", name: "Project" },
    created: "2026-09-16T00:00:00.000+0000",
    updated: null,
    duedate: null,
  },
};

test("[happy-4] jiraIssueResponseSchema parses a full Jira issue unchanged", () => {
  assert.deepEqual(
    jiraIssueResponseSchema.parse(fullIssueResponse),
    fullIssueResponse,
  );
});

test("[happy-4] jiraIssueResponseSchema keeps the nulls Jira sent rather than dropping them", () => {
  const fields = jiraIssueResponseSchema.parse(fullIssueResponse).fields;
  assert.ok(fields);
  assert.equal(fields.assignee, null);
  assert.equal(fields.priority, null);
  assert.equal(fields.parent, null);
  assert.equal(fields.updated, null);
  assert.equal(fields.duedate, null);
});

test("[boundary-5] jiraIssueResponseSchema parses an empty fields block", () => {
  const input = { id: "1", key: "A-1", fields: {} };
  assert.equal(jiraIssueResponseSchema.safeParse(input).success, true);
});

test("[boundary-5] jiraIssueResponseSchema keeps an unrecognised status category key unchanged", () => {
  const input = {
    id: "1",
    key: "A-1",
    fields: { status: { statusCategory: { key: "To Do" } } },
  };
  assert.deepEqual(jiraIssueResponseSchema.parse(input), input);
});

const issueWithUnknownKeys = {
  id: "1",
  key: "A-1",
  expand: "names",
  fields: {
    customfield_10010: 5,
    assignee: { displayName: "Dana", accountId: "abc" },
  },
};

test("[boundary-6] jiraIssueResponseSchema keeps unknown keys at every level", () => {
  assert.deepEqual(
    jiraIssueResponseSchema.parse(issueWithUnknownKeys),
    issueWithUnknownKeys,
  );
});

test("[boundary-6] jiraIssueResponseSchema keeps an unknown key nested inside a known field", () => {
  const parsed = jiraIssueResponseSchema.parse(issueWithUnknownKeys) as {
    fields: { assignee: { accountId?: unknown } };
  };
  assert.equal(parsed.fields.assignee.accountId, "abc");
});

test("[unhappy-2] jiraIssueResponseSchema refuses an issue without an id or a key", () => {
  for (const input of [{ key: "A-1" }, { id: "1" }]) {
    assert.equal(jiraIssueResponseSchema.safeParse(input).success, false);
  }
});

test("[unhappy-2] jiraIssueResponseSchema refuses a numeric id and mistyped fields", () => {
  for (const input of [
    { id: 1, key: "A-1" },
    { id: "1", key: "A-1", fields: { summary: 5 } },
    { id: "1", key: "A-1", fields: { labels: "auth" } },
  ]) {
    assert.equal(jiraIssueResponseSchema.safeParse(input).success, false);
  }
});

test("[boundary-7] jiraIssuePageResponseSchema parses a page without issues to an empty list", () => {
  assert.deepEqual(jiraIssuePageResponseSchema.parse({}), { issues: [] });
});

test("[boundary-7] jiraIssuePageResponseSchema returns pages with a token or offsets unchanged", () => {
  const withToken = { issues: [{ id: "1", key: "A-1" }], nextPageToken: "tok" };
  assert.deepEqual(jiraIssuePageResponseSchema.parse(withToken), withToken);
  const withOffsets = { issues: [], total: 0, startAt: 0, maxResults: 50 };
  assert.deepEqual(jiraIssuePageResponseSchema.parse(withOffsets), withOffsets);
});

test("[unhappy-3] jiraIssuePageResponseSchema refuses a page with one bad issue", () => {
  const input = { issues: [{ id: "1", key: "A-1" }, { id: "2" }] };
  assert.equal(jiraIssuePageResponseSchema.safeParse(input).success, false);
});

test("[unhappy-3] jiraIssuePageResponseSchema refuses a page whose only issue lacks a key", () => {
  assert.equal(
    jiraIssuePageResponseSchema.safeParse({ issues: [{ id: "2" }] }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// Board and sprint responses
// ---------------------------------------------------------------------------

test("[happy-5] jiraBoardResponseSchema parses a board with only id and name", () => {
  const input = { id: 7, name: "Platform" };
  assert.deepEqual(jiraBoardResponseSchema.parse(input), input);
});

test("[happy-5] jiraBoardResponseSchema parses a board with a type and location unchanged", () => {
  const input = {
    id: 7,
    name: "Platform",
    type: "scrum",
    location: {
      projectKey: "PROJ",
      projectName: "Project",
      displayName: "Project (PROJ)",
    },
  };
  assert.deepEqual(jiraBoardResponseSchema.parse(input), input);
});

test("[unhappy-4] jiraBoardResponseSchema refuses a string id", () => {
  assert.equal(
    jiraBoardResponseSchema.safeParse({ id: "7", name: "Platform" }).success,
    false,
  );
});

test("[unhappy-4] jiraBoardResponseSchema refuses a board missing its id or name", () => {
  for (const input of [{ id: 7 }, { name: "Platform" }]) {
    assert.equal(jiraBoardResponseSchema.safeParse(input).success, false);
  }
});

test("[boundary-8] board and sprint pages without values parse to an empty list", () => {
  assert.deepEqual(jiraBoardPageResponseSchema.parse({}), { values: [] });
  assert.deepEqual(jiraSprintPageResponseSchema.parse({}), { values: [] });
});

test("[boundary-8] jiraBoardPageResponseSchema returns a last page with values unchanged", () => {
  const input = { values: [{ id: 7, name: "Platform" }], isLast: true };
  assert.deepEqual(jiraBoardPageResponseSchema.parse(input), input);
});

test("[happy-6] jiraSprintResponseSchema parses a sprint with null dates and goal", () => {
  const input = {
    id: 3,
    name: "Sprint 3",
    state: "active",
    startDate: null,
    endDate: null,
    goal: null,
  };
  assert.deepEqual(jiraSprintResponseSchema.parse(input), input);
});

test("[happy-6] jiraSprintResponseSchema parses a sprint with only id and name unchanged", () => {
  const input = { id: 3, name: "Sprint 3" };
  assert.deepEqual(jiraSprintResponseSchema.parse(input), input);
});

test("[unhappy-5] jiraSprintResponseSchema refuses a string id", () => {
  assert.equal(
    jiraSprintResponseSchema.safeParse({ id: "3", name: "Sprint 3" }).success,
    false,
  );
});

test("[unhappy-5] jiraSprintPageResponseSchema refuses a page holding a sprint with a string id", () => {
  assert.equal(
    jiraSprintPageResponseSchema.safeParse({
      values: [{ id: "3", name: "Sprint 3" }],
    }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// tokenResponseSchema and accessibleResourceSchema
// ---------------------------------------------------------------------------

test("[happy-7] tokenResponseSchema parses a token without a refresh token or scope", () => {
  const input = { access_token: "at", expires_in: 3600 };
  assert.deepEqual(tokenResponseSchema.parse(input), input);
});

test("[happy-7] tokenResponseSchema parses a full token response unchanged", () => {
  const input = {
    access_token: "at",
    refresh_token: "rt",
    expires_in: 3600,
    scope: "read:jira-work offline_access",
    token_type: "Bearer",
  };
  assert.deepEqual(tokenResponseSchema.parse(input), input);
});

test("[unhappy-6] tokenResponseSchema refuses a token missing the access token or expiry", () => {
  for (const input of [{ expires_in: 3600 }, { access_token: "at" }]) {
    assert.equal(tokenResponseSchema.safeParse(input).success, false);
  }
});

test("[unhappy-6] tokenResponseSchema refuses an expiry sent as a string", () => {
  assert.equal(
    tokenResponseSchema.safeParse({ access_token: "at", expires_in: "3600" })
      .success,
    false,
  );
});

test("[boundary-9] accessibleResourceSchema gives a resource without scopes an empty list", () => {
  assert.deepEqual(
    accessibleResourceSchema.parse({ id: "cloud-1", url: SITE, name: "Acme" }),
    { id: "cloud-1", url: SITE, name: "Acme", scopes: [] },
  );
});

test("[boundary-9] accessibleResourceSchema defaults scopes to an empty list when an avatar is present", () => {
  const input = {
    id: "cloud-1",
    url: SITE,
    name: "Acme",
    avatarUrl: "https://x.test/a.png",
  };
  assert.deepEqual(accessibleResourceSchema.parse(input), {
    ...input,
    scopes: [],
  });
});

test("[unhappy-7] accessibleResourceSchema refuses a resource missing its id", () => {
  assert.equal(
    accessibleResourceSchema.safeParse({ url: SITE, name: "Acme" }).success,
    false,
  );
});

test("[unhappy-7] accessibleResourceSchema refuses a resource missing its url or name", () => {
  for (const input of [
    { id: "cloud-1", name: "Acme" },
    { id: "cloud-1", url: SITE },
  ]) {
    assert.equal(accessibleResourceSchema.safeParse(input).success, false);
  }
});

// ---------------------------------------------------------------------------
// jiraIssueDtoSchema and jiraIssuePageDtoSchema
// ---------------------------------------------------------------------------

test("[happy-8] jiraIssueDtoSchema parses the valid issue DTO to itself", () => {
  assert.deepEqual(jiraIssueDtoSchema.parse(validIssue), validIssue);
});

test("[happy-8] jiraIssueDtoSchema keeps the nulls already in the valid issue DTO", () => {
  const parsed = jiraIssueDtoSchema.parse(validIssue);
  assert.equal(parsed.parentKey, null);
  assert.equal(parsed.dueDate, null);
});

const allNullable = {
  assignee: null,
  priority: null,
  projectKey: null,
  parentKey: null,
  created: null,
  updated: null,
  dueDate: null,
  url: null,
};

test("[happy-9] jiraIssueDtoSchema accepts null in every nullable field", () => {
  const input = { ...validIssue, ...allNullable };
  assert.deepEqual(jiraIssueDtoSchema.parse(input), input);
});

test("[happy-9] jiraIssueDtoSchema accepts a null url on its own", () => {
  const parsed = jiraIssueDtoSchema.parse({ ...validIssue, url: null });
  assert.equal(parsed.url, null);
});

test("[boundary-10] jiraIssueDtoSchema drops a description and other unknown keys", () => {
  assert.deepEqual(
    jiraIssueDtoSchema.parse({
      ...validIssue,
      description: "secret client text",
      fields: {},
    }),
    validIssue,
  );
});

test("[boundary-10] jiraIssueDtoSchema output carries no description key", () => {
  const parsed = jiraIssueDtoSchema.parse({
    ...validIssue,
    description: "secret client text",
  });
  assert.equal("description" in parsed, false);
});

test("[boundary-11] jiraIssueDtoSchema accepts an empty summary, a free-form key and a free-form created", () => {
  const input = {
    ...validIssue,
    summary: "",
    key: "not a key",
    created: "yesterday",
  };
  assert.deepEqual(jiraIssueDtoSchema.parse(input), input);
});

test("[boundary-11] jiraIssueDtoSchema accepts an empty summary on its own", () => {
  assert.equal(jiraIssueDtoSchema.parse({ ...validIssue, summary: "" }).summary, "");
});

test("[unhappy-8] jiraIssueDtoSchema refuses a status category outside the enum", () => {
  assert.equal(
    jiraIssueDtoSchema.safeParse({ ...validIssue, statusCategory: "To Do" })
      .success,
    false,
  );
});

test("[unhappy-8] jiraIssueDtoSchema refuses missing nullable keys, null lists and strings, and a numeric id", () => {
  for (const input of [
    without(validIssue, "assignee"),
    without(validIssue, "url"),
    { ...validIssue, labels: null },
    { ...validIssue, issueType: null },
    { ...validIssue, id: 10001 },
  ]) {
    assert.equal(jiraIssueDtoSchema.safeParse(input).success, false);
  }
});

test("[happy-10] jiraIssuePageDtoSchema parses a page of the valid issue DTO unchanged", () => {
  const input = { issues: [validIssue] };
  assert.deepEqual(jiraIssuePageDtoSchema.parse(input), input);
});

test("[happy-10] jiraIssuePageDtoSchema returns empty pages with offsets or a token unchanged", () => {
  const withOffsets = { issues: [], total: 0, nextStartAt: 50 };
  assert.deepEqual(jiraIssuePageDtoSchema.parse(withOffsets), withOffsets);
  const withToken = { issues: [], nextPageToken: "tok" };
  assert.deepEqual(jiraIssuePageDtoSchema.parse(withToken), withToken);
});

test("[unhappy-9] jiraIssuePageDtoSchema refuses a page without issues", () => {
  assert.equal(jiraIssuePageDtoSchema.safeParse({}).success, false);
});

test("[unhappy-9] jiraIssuePageDtoSchema refuses a page with cursors but no issues", () => {
  assert.equal(
    jiraIssuePageDtoSchema.safeParse({ total: 0, nextPageToken: "tok" }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// Board, sprint and site DTOs
// ---------------------------------------------------------------------------

test("[happy-11] jiraBoardDtoSchema parses the valid board DTO to itself", () => {
  assert.deepEqual(jiraBoardDtoSchema.parse(validBoard), validBoard);
});

test("[happy-11] jiraBoardDtoSchema accepts a null project key and name", () => {
  assert.equal(
    jiraBoardDtoSchema.safeParse({
      ...validBoard,
      projectKey: null,
      projectName: null,
    }).success,
    true,
  );
});

test("[unhappy-10] jiraBoardDtoSchema refuses a string id", () => {
  assert.equal(
    jiraBoardDtoSchema.safeParse({ ...validBoard, id: "7" }).success,
    false,
  );
});

test("[unhappy-10] jiraBoardDtoSchema refuses a board missing its type or project key", () => {
  for (const input of [
    without(validBoard, "type"),
    without(validBoard, "projectKey"),
  ]) {
    assert.equal(jiraBoardDtoSchema.safeParse(input).success, false);
  }
});

const sprintDto = {
  id: 3,
  name: "Sprint 3",
  state: "active",
  startDate: null,
  endDate: null,
  goal: null,
};

test("[happy-12] jiraSprintDtoSchema parses a sprint with null dates and goal to itself", () => {
  assert.deepEqual(jiraSprintDtoSchema.parse(sprintDto), sprintDto);
});

test("[happy-12] jiraSprintDtoSchema keeps the null dates and goal as null", () => {
  const parsed = jiraSprintDtoSchema.parse(sprintDto);
  assert.equal(parsed.startDate, null);
  assert.equal(parsed.endDate, null);
  assert.equal(parsed.goal, null);
});

test("[unhappy-11] jiraSprintDtoSchema refuses a sprint missing its state", () => {
  assert.equal(
    jiraSprintDtoSchema.safeParse(without(sprintDto, "state")).success,
    false,
  );
});

test("[unhappy-11] jiraSprintDtoSchema refuses a sprint whose state is undefined", () => {
  assert.equal(
    jiraSprintDtoSchema.safeParse({ ...sprintDto, state: undefined }).success,
    false,
  );
});

const siteDto = { cloudId: "cloud-1", url: SITE, name: "Acme" };

test("[happy-13] jiraSiteDtoSchema parses a site with or without an avatar unchanged", () => {
  assert.deepEqual(jiraSiteDtoSchema.parse(siteDto), siteDto);
  const withAvatar = { ...siteDto, avatarUrl: "https://x.test/a.png" };
  assert.deepEqual(jiraSiteDtoSchema.parse(withAvatar), withAvatar);
});

test("[happy-13] jiraSiteDtoSchema drops scopes", () => {
  assert.deepEqual(
    jiraSiteDtoSchema.parse({ ...siteDto, scopes: ["read:jira-work"] }),
    siteDto,
  );
});

test("[unhappy-12] jiraSiteDtoSchema refuses a site missing its cloudId", () => {
  assert.equal(
    jiraSiteDtoSchema.safeParse({ url: SITE, name: "Acme" }).success,
    false,
  );
});

test("[unhappy-12] jiraSiteDtoSchema refuses an accessible resource's id in place of a cloudId", () => {
  assert.equal(
    jiraSiteDtoSchema.safeParse({ id: "cloud-1", url: SITE, name: "Acme" })
      .success,
    false,
  );
});

// ---------------------------------------------------------------------------
// The existing contract
// ---------------------------------------------------------------------------

test("[happy-14] todoSchema still parses a well-formed todo to itself", () => {
  const input = {
    id: "todo_1",
    title: "write tests",
    done: false,
    createdAt: "2026-09-16T00:00:00.000Z",
  };
  assert.deepEqual(todoSchema.parse(input), input);
});

test("[happy-14] handleSchema still lowercases and trims, and the build-info exports are still re-exported", () => {
  assert.equal(handleSchema.parse("  FeverSoul  "), "feversoul");
  assert.equal(buildInfoSchema, buildInfoModule.buildInfoSchema);
  assert.equal(UNKNOWN_BUILD, buildInfoModule.UNKNOWN_BUILD);
});
