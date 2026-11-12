import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GITHUB_CONNECT_OUTCOMES,
  GITHUB_INSTALLATION_STATUSES,
  GITHUB_REPO_ROLES,
  GITHUB_SYNC_STATUSES,
  GITHUB_WEBHOOK_HEADERS,
  githubAvailableInstallationDtoSchema,
  githubConnectionDtoSchema,
  githubConnectOutcomeSchema,
  githubRepoRoleSchema,
  githubSyncStatusSchema,
} from "../src/index.js";

/*
 * The closed vocabularies: their order is part of the contract, and an enum
 * schema takes exactly its constant's values, in their exact casing.
 */

const connection = {
  id: "ghc_1",
  installationId: "42",
  accountLogin: "octo-org",
  accountType: "Organization",
  repositorySelection: "selected",
  healthy: true,
  suspendedAt: null,
  uninstalledAt: null,
  settingsUrl:
    "https://github.com/organizations/octo-org/settings/installations/42",
  createdAt: "2026-11-01T00:00:00.000Z",
};

const available = {
  installationId: "42",
  accountLogin: "o",
  accountType: "User",
  repositorySelection: "all",
};

test("[happy-1] the constants list their values in order", () => {
  assert.deepEqual([...GITHUB_REPO_ROLES], ["source"]);
  assert.deepEqual([...GITHUB_SYNC_STATUSES], ["pending", "ok", "error", "gone"]);
  assert.deepEqual(
    [...GITHUB_INSTALLATION_STATUSES],
    ["linked", "claimed", "free", "not-authorized", "unavailable"],
  );
  assert.deepEqual(
    [...GITHUB_CONNECT_OUTCOMES],
    [
      "connected",
      "pick",
      "cancelled",
      "state",
      "forbidden",
      "not-visible",
      "claimed",
      "not-authorized",
      "unavailable",
      "denied",
      "error",
    ],
  );
  assert.deepEqual(
    { ...GITHUB_WEBHOOK_HEADERS },
    {
      event: "x-github-event",
      delivery: "x-github-delivery",
      signature: "x-hub-signature-256",
    },
  );
});

test("[happy-1] each enum schema's options are its constant, in the same order", () => {
  // The schemas are built from the constants, so the two cannot drift apart.
  assert.deepEqual([...githubRepoRoleSchema.options], [...GITHUB_REPO_ROLES]);
  assert.deepEqual(
    [...githubSyncStatusSchema.options],
    [...GITHUB_SYNC_STATUSES],
  );
  assert.deepEqual(
    [...githubConnectOutcomeSchema.options],
    [...GITHUB_CONNECT_OUTCOMES],
  );
});

test("[happy-2] each enum schema accepts its own example values", () => {
  const cases = [
    [githubRepoRoleSchema, "source"],
    [githubSyncStatusSchema, "pending"],
    [githubSyncStatusSchema, "ok"],
    [githubSyncStatusSchema, "error"],
    [githubSyncStatusSchema, "gone"],
    [githubConnectOutcomeSchema, "connected"],
    [githubConnectOutcomeSchema, "not-authorized"],
    [githubConnectOutcomeSchema, "error"],
  ] as const;
  for (const [schema, value] of cases) {
    assert.equal(schema.parse(value), value);
  }
});

test("[happy-2] every listed value, first and last included, is accepted by its schema", () => {
  for (const value of GITHUB_REPO_ROLES) {
    assert.equal(githubRepoRoleSchema.parse(value), value);
  }
  for (const value of GITHUB_SYNC_STATUSES) {
    assert.equal(githubSyncStatusSchema.parse(value), value);
  }
  for (const value of GITHUB_CONNECT_OUTCOMES) {
    assert.equal(githubConnectOutcomeSchema.parse(value), value);
  }
  for (const status of GITHUB_INSTALLATION_STATUSES) {
    assert.equal(
      githubAvailableInstallationDtoSchema.parse({ ...available, status })
        .status,
      status,
    );
  }
});

test("[unhappy-1] an enum schema refuses other casing and unknown values", () => {
  const cases = [
    [githubRepoRoleSchema, "sandbox"],
    [githubRepoRoleSchema, "Source"],
    [githubSyncStatusSchema, "OK"],
    [githubSyncStatusSchema, "stale"],
    [githubConnectOutcomeSchema, "success"],
  ] as const;
  for (const [schema, value] of cases) {
    assert.equal(schema.safeParse(value).success, false, value);
  }
});

test("[unhappy-1] an enum schema refuses the empty string and padded values", () => {
  // Nothing is trimmed or lowercased on the way in.
  for (const value of ["", " source", "source "]) {
    assert.equal(githubRepoRoleSchema.safeParse(value).success, false);
  }
  for (const value of ["", "Pending", " ok"]) {
    assert.equal(githubSyncStatusSchema.safeParse(value).success, false);
  }
  for (const value of ["", "Connected", "not_authorized"]) {
    assert.equal(githubConnectOutcomeSchema.safeParse(value).success, false);
  }
});

test("[unhappy-2] an available installation's status is closed", () => {
  const result = githubAvailableInstallationDtoSchema.safeParse({
    ...available,
    status: "owned",
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some(
      (issue) => JSON.stringify(issue.path) === JSON.stringify(["status"]),
    ),
  );
});

test("[unhappy-2] an available installation's status refuses another casing of a listed value", () => {
  for (const status of ["Linked", "not_authorized", ""]) {
    const result = githubAvailableInstallationDtoSchema.safeParse({
      ...available,
      status,
    });
    assert.equal(result.success, false, status);
    assert.ok(
      result.error?.issues.some(
        (issue) => JSON.stringify(issue.path) === JSON.stringify(["status"]),
      ),
    );
  }
});

test("[happy-3] account type and repository selection are free strings in GitHub's casing", () => {
  const cases = [
    ["Organization", "selected"],
    ["User", "all"],
    ["Enterprise", "some"],
  ] as const;
  for (const [accountType, repositorySelection] of cases) {
    const parsed = githubConnectionDtoSchema.parse({
      ...connection,
      accountType,
      repositorySelection,
    });
    assert.equal(parsed.accountType, accountType);
    assert.equal(parsed.repositorySelection, repositorySelection);
  }
});

test("[happy-3] account type and repository selection are kept as given, even lowercase or empty", () => {
  // No closed vocabulary and no normalisation: the casing is GitHub's.
  for (const [accountType, repositorySelection] of [
    ["organization", "SELECTED"],
    ["", ""],
  ] as const) {
    const parsed = githubConnectionDtoSchema.parse({
      ...connection,
      accountType,
      repositorySelection,
    });
    assert.equal(parsed.accountType, accountType);
    assert.equal(parsed.repositorySelection, repositorySelection);
  }
});
