import assert from "node:assert/strict";
import { test } from "node:test";

import { envKeys, jiraOAuthConfig, parseEnv } from "../src/env.js";

const DATABASE_URL = "postgres://postgres:postgres@localhost:5432/test";
/** Exactly the 32-character minimum. */
const SECRET = "0123456789abcdef0123456789abcdef";
/** Every required var, as in test/env.test.ts. */
const required = {
  DATABASE_URL,
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: "http://localhost:4000",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  ATLASSIAN_CLIENT_ID: "atlassian-client-id",
  ATLASSIAN_CLIENT_SECRET: "atlassian-client-secret",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

const jira = {
  JIRA_CLIENT_ID: "jira-client-id",
  JIRA_CLIENT_SECRET: "jira-client-secret",
};

/** envKeys before this change, as pinned in test/env-surface.test.ts. */
const keysBefore = [
  "PORT",
  "CORS_ORIGINS",
  "ORIGIN_VERIFY",
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_REGION",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "APP_URL",
  "AUTH_COOKIE_DOMAIN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "ATLASSIAN_CLIENT_ID",
  "ATLASSIAN_CLIENT_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "BUILD_VERSION",
  "BUILD_SHA",
  "BUILD_TIME",
  "BUILD_REF",
  "BUILD_DIRTY",
];

// ---- happy-1: both variables set yield the credential pair ----------------

test("[happy-1] jiraOAuthConfig returns exactly the pair when both Jira vars are set", () => {
  const env = parseEnv({ ...required, ...jira });
  assert.deepEqual(jiraOAuthConfig(env), {
    clientId: "jira-client-id",
    clientSecret: "jira-client-secret",
  });
});

test("[happy-1] jiraOAuthConfig accepts one-character credentials", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: "i", JIRA_CLIENT_SECRET: "s" });
  assert.deepEqual(jiraOAuthConfig(env), { clientId: "i", clientSecret: "s" });
});

// ---- happy-2: neither variable set ----------------------------------------

test("[happy-2] parseEnv boots without the Jira vars and jiraOAuthConfig is undefined", () => {
  const env = parseEnv(required);
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

test("[happy-2] Jira vars explicitly undefined are the same as absent", () => {
  const env = parseEnv({
    ...required,
    JIRA_CLIENT_ID: undefined,
    JIRA_CLIENT_SECRET: undefined,
  });
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

// ---- boundary-1: half-configured app --------------------------------------

test("[boundary-1] only one Jira var set is not configured and not a boot error", () => {
  for (const partial of [
    { JIRA_CLIENT_ID: "jira-client-id" },
    { JIRA_CLIENT_SECRET: "jira-client-secret" },
  ]) {
    let env: ReturnType<typeof parseEnv> | undefined;
    assert.doesNotThrow(() => {
      env = parseEnv({ ...required, ...partial });
    });
    assert.equal(jiraOAuthConfig(env!), undefined, JSON.stringify(partial));
  }
});

test("[boundary-1] one Jira var set and the other empty is not configured", () => {
  for (const partial of [
    { JIRA_CLIENT_ID: "jira-client-id", JIRA_CLIENT_SECRET: "" },
    { JIRA_CLIENT_ID: "", JIRA_CLIENT_SECRET: "jira-client-secret" },
  ]) {
    let env: ReturnType<typeof parseEnv> | undefined;
    assert.doesNotThrow(() => {
      env = parseEnv({ ...required, ...partial });
    });
    assert.equal(jiraOAuthConfig(env!), undefined, JSON.stringify(partial));
  }
});

// ---- boundary-2: empty value read as unset --------------------------------

test("[boundary-2] empty Jira vars are parsed as undefined", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: "", JIRA_CLIENT_SECRET: "" });
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

test("[boundary-2] a lone empty JIRA_CLIENT_ID is parsed as undefined", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: "" });
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

// ---- boundary-3: non-empty values kept verbatim ----------------------------

test("[boundary-3] Jira credentials are kept verbatim without trimming", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: " id ", JIRA_CLIENT_SECRET: "s=cr+t/" });
  assert.deepEqual(jiraOAuthConfig(env), { clientId: " id ", clientSecret: "s=cr+t/" });
});

test("[boundary-3] a whitespace-only Jira credential is non-empty and kept", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: " ", JIRA_CLIENT_SECRET: "\t" });
  assert.equal(env.JIRA_CLIENT_ID, " ");
  assert.equal(env.JIRA_CLIENT_SECRET, "\t");
  assert.deepEqual(jiraOAuthConfig(env), { clientId: " ", clientSecret: "\t" });
});

// ---- boundary-4: no fallback to the sign-in app ----------------------------

test("[boundary-4] jiraOAuthConfig does not fall back to the ATLASSIAN_* pair", () => {
  const env = parseEnv(required);
  assert.equal(env.ATLASSIAN_CLIENT_ID, "atlassian-client-id");
  assert.equal(jiraOAuthConfig(env), undefined);
});

test("[boundary-4] a lone JIRA_CLIENT_ID is not completed with ATLASSIAN_CLIENT_SECRET", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: "jira-client-id" });
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

// ---- happy-3: sign-in app unaffected --------------------------------------

test("[happy-3] the ATLASSIAN_* pair is unchanged when the Jira app is set", () => {
  const env = parseEnv({ ...required, ...jira });
  assert.equal(env.ATLASSIAN_CLIENT_ID, "atlassian-client-id");
  assert.equal(env.ATLASSIAN_CLIENT_SECRET, "atlassian-client-secret");
});

test("[happy-3] the ATLASSIAN_* pair is unchanged when the Jira app is half set", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_SECRET: "jira-client-secret" });
  assert.equal(env.ATLASSIAN_CLIENT_ID, "atlassian-client-id");
  assert.equal(env.ATLASSIAN_CLIENT_SECRET, "atlassian-client-secret");
});

// ---- unhappy-1: sign-in credentials stay required --------------------------

test("[unhappy-1] an empty ATLASSIAN_CLIENT_ID is rejected even with the Jira app set", () => {
  assert.throws(
    () => parseEnv({ ...required, ...jira, ATLASSIAN_CLIENT_ID: "" }),
    (error: unknown) => error instanceof Error && /ATLASSIAN_CLIENT_ID/.test(error.message),
  );
});

test("[unhappy-1] a missing ATLASSIAN_CLIENT_SECRET is rejected even with the Jira app set", () => {
  const { ATLASSIAN_CLIENT_SECRET: _omitted, ...rest } = required;
  assert.throws(
    () => parseEnv({ ...rest, ...jira }),
    (error: unknown) => error instanceof Error && /ATLASSIAN_CLIENT_SECRET/.test(error.message),
  );
});

// ---- happy-4: environment surface -----------------------------------------

test("[happy-4] envKeys contains the two Jira vars and two more entries than before", () => {
  assert.ok(envKeys.includes("JIRA_CLIENT_ID"));
  assert.ok(envKeys.includes("JIRA_CLIENT_SECRET"));
  assert.equal(envKeys.length, keysBefore.length + 2);
});

test("[happy-4] envKeys is exactly the previous list plus the two Jira vars", () => {
  assert.deepEqual(
    [...envKeys].sort(),
    [...keysBefore, "JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET"].sort(),
  );
});
