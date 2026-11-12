import assert from "node:assert/strict";
import { test } from "node:test";

import {
  githubInstallationSettingsUrl,
  handleSchema,
  organizationSummarySchema,
  registerBoardSchema,
} from "../src/index.js";

test("[happy-19] githubInstallationSettingsUrl builds the page for the account type", () => {
  assert.equal(
    githubInstallationSettingsUrl("Organization", "octo-org", "42"),
    "https://github.com/organizations/octo-org/settings/installations/42",
  );
  assert.equal(
    githubInstallationSettingsUrl("User", "octocat", "7"),
    "https://github.com/settings/installations/7",
  );
  assert.equal(
    githubInstallationSettingsUrl("organization", "octo-org", "42"),
    "https://github.com/settings/installations/42",
  );
});

test("[happy-19] any account type other than Organization gets the personal settings page", () => {
  assert.equal(
    githubInstallationSettingsUrl("Enterprise", "big-co", "9999999999999999999"),
    "https://github.com/settings/installations/9999999999999999999",
  );
  assert.equal(
    githubInstallationSettingsUrl("", "octocat", "1"),
    "https://github.com/settings/installations/1",
  );
});

test("[happy-20] the organization and Jira contracts still parse as before", () => {
  assert.equal(
    organizationSummarySchema.parse({ id: "org_1", name: "Acme", slug: "acme" })
      .kind,
    "team",
  );
  assert.deepEqual(
    registerBoardSchema.parse({ connectionId: "c1", externalId: "10" }),
    { connectionId: "c1", externalId: "10" },
  );
  assert.equal(handleSchema.parse("  FeverSoul  "), "feversoul");
});

test("[happy-20] registerBoardSchema is not narrowed to GitHub id text", () => {
  // Jira's board ids stay any non-empty string; the GitHub rule is only GitHub's.
  assert.deepEqual(
    registerBoardSchema.parse({ connectionId: "c1", externalId: "0123" }),
    { connectionId: "c1", externalId: "0123" },
  );
  assert.equal(
    registerBoardSchema.safeParse({ connectionId: "c1", externalId: "" })
      .success,
    false,
  );
});
