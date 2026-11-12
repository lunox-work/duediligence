import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GITHUB_ACCOUNT_TYPES,
  GITHUB_REPOSITORY_SELECTIONS,
  GITHUB_SETUP_ACTIONS,
  githubAccountTypeSchema,
  githubInstallationDtoSchema,
  githubRepositorySelectionSchema,
  githubSetupActionSchema,
  githubSetupCallbackSchema,
} from "../../src/index.js";

const installationDto = {
  id: "ghi_1",
  installationId: 42,
  accountLogin: "octo-org",
  accountType: "organization",
  repositorySelection: "selected",
  suspended: false,
  createdAt: "2026-11-01T00:00:00.000Z",
} as const;

/*
 * The enum schemas and constants are plain z.enum values, so each test here
 * also checks that the strict schemas built on them use the same closed
 * vocabulary.
 */

// Extends "[happy-1] the constants list their values in order": the DTO and
// the callback accept the constants' values and hand them back in that order.
test("[happy-1] the constants' values, in order, are what the installation DTO and the callback accept", () => {
  assert.deepEqual([...GITHUB_ACCOUNT_TYPES], ["user", "organization"]);
  assert.deepEqual([...GITHUB_REPOSITORY_SELECTIONS], ["all", "selected"]);
  assert.deepEqual([...GITHUB_SETUP_ACTIONS], ["install", "update", "request"]);

  assert.deepEqual(
    GITHUB_ACCOUNT_TYPES.map(
      (accountType) =>
        githubInstallationDtoSchema.parse({ ...installationDto, accountType })
          .accountType,
    ),
    ["user", "organization"],
  );
  assert.deepEqual(
    GITHUB_REPOSITORY_SELECTIONS.map(
      (repositorySelection) =>
        githubInstallationDtoSchema.parse({
          ...installationDto,
          repositorySelection,
        }).repositorySelection,
    ),
    ["all", "selected"],
  );
  assert.deepEqual(
    GITHUB_SETUP_ACTIONS.map(
      (setup_action) =>
        githubSetupCallbackSchema.parse({
          installation_id: "42",
          setup_action,
          state: "s1",
        }).setupAction,
    ),
    ["install", "update", "request"],
  );
});

// Extends "[happy-2] each enum schema accepts its own values": every value is
// accepted where the schema is used, in each combination of the two DTO enums.
test("[happy-2] the installation DTO accepts every account type with every repository selection", () => {
  for (const accountType of ["user", "organization"] as const) {
    assert.equal(githubAccountTypeSchema.parse(accountType), accountType);
    for (const repositorySelection of ["all", "selected"] as const) {
      assert.equal(
        githubRepositorySelectionSchema.parse(repositorySelection),
        repositorySelection,
      );
      const dto = { ...installationDto, accountType, repositorySelection };
      assert.deepEqual(githubInstallationDtoSchema.parse(dto), dto);
    }
  }
});

// Extends "[happy-2] the last value of each vocabulary parses to itself".
test("[happy-2] the callback accepts every setup action", () => {
  for (const action of ["install", "update", "request"] as const) {
    assert.equal(githubSetupActionSchema.parse(action), action);
    assert.equal(
      githubSetupCallbackSchema.parse({
        installation_id: "7",
        setup_action: action,
        state: "s1",
      }).setupAction,
      action,
    );
  }
});

// Extends "[unhappy-1] an enum schema refuses GitHub's casing and unknown
// values": the installation DTO refuses the same values, so GitHub's casing
// cannot pass through it unmapped.
test("[unhappy-1] the installation DTO refuses GitHub's casing and unknown account types and selections", () => {
  for (const accountType of ["User", "Organization", "enterprise", "Bot", "USER"]) {
    assert.equal(githubAccountTypeSchema.safeParse(accountType).success, false);
    assert.equal(
      githubInstallationDtoSchema.safeParse({ ...installationDto, accountType })
        .success,
      false,
      accountType,
    );
  }
  for (const repositorySelection of ["none", "All", "Selected", "some"]) {
    assert.equal(
      githubRepositorySelectionSchema.safeParse(repositorySelection).success,
      false,
    );
    assert.equal(
      githubInstallationDtoSchema.safeParse({
        ...installationDto,
        repositorySelection,
      }).success,
      false,
      repositorySelection,
    );
  }
});

// Extends "[unhappy-1] an enum schema refuses the empty string and padded values".
test("[unhappy-1] the callback refuses an unknown or differently cased setup action", () => {
  for (const setup_action of ["uninstall", "Install", "REQUEST", "", " update"]) {
    assert.equal(githubSetupActionSchema.safeParse(setup_action).success, false);
    assert.equal(
      githubSetupCallbackSchema.safeParse({
        installation_id: "42",
        setup_action,
        state: "s1",
      }).success,
      false,
      JSON.stringify(setup_action),
    );
  }
});
