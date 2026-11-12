import assert from "node:assert/strict";
import { test } from "node:test";

import { envKeys, jiraOAuthConfig, parseEnv } from "../src/env.js";

/**
 * The second Atlassian app, the one that connects a client's Jira site: two
 * optional variables and `jiraOAuthConfig`. See spec.md.
 */

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

/** The list pinned in test/env-surface.test.ts before this change. */
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

// ---- @happy 1: both variables set yield the credential pair ---------------

test("[happy-1] jiraOAuthConfig returns exactly the pair when both Jira variables are set", () => {
  assert.deepEqual(jiraOAuthConfig(parseEnv({ ...required, ...jira })), {
    clientId: "jira-client-id",
    clientSecret: "jira-client-secret",
  });
});

test("[happy-1] jiraOAuthConfig reads the pair of the env it is given, each time", () => {
  const first = parseEnv({ ...required, ...jira });
  const second = parseEnv({
    ...required,
    JIRA_CLIENT_ID: "other-id",
    JIRA_CLIENT_SECRET: "other-secret",
  });
  assert.deepEqual(jiraOAuthConfig(second), {
    clientId: "other-id",
    clientSecret: "other-secret",
  });
  assert.deepEqual(jiraOAuthConfig(first), {
    clientId: "jira-client-id",
    clientSecret: "jira-client-secret",
  });
});

// ---- @happy 2: neither variable set means not configured ------------------

test("[happy-2] the API boots without the Jira variables and Jira is not configured", () => {
  let env: ReturnType<typeof parseEnv> | undefined;
  assert.doesNotThrow(() => {
    env = parseEnv(required);
  });
  assert.ok(env);
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

test("[happy-2] Jira variables present as undefined count as unset", () => {
  const env = parseEnv({
    ...required,
    JIRA_CLIENT_ID: undefined,
    JIRA_CLIENT_SECRET: undefined,
  });
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

// ---- @boundary 1: a half-configured app is not configured, not an error ---

test("[boundary-1] only JIRA_CLIENT_ID set boots and leaves Jira unconfigured", () => {
  let env: ReturnType<typeof parseEnv> | undefined;
  assert.doesNotThrow(() => {
    env = parseEnv({ ...required, JIRA_CLIENT_ID: "jira-client-id" });
  });
  assert.ok(env);
  assert.equal(jiraOAuthConfig(env), undefined);
});

test("[boundary-1] only JIRA_CLIENT_SECRET set boots and leaves Jira unconfigured", () => {
  let env: ReturnType<typeof parseEnv> | undefined;
  assert.doesNotThrow(() => {
    env = parseEnv({ ...required, JIRA_CLIENT_SECRET: "jira-client-secret" });
  });
  assert.ok(env);
  assert.equal(jiraOAuthConfig(env), undefined);
});

// ---- @boundary 2: an empty value is kept as "" and counts as set ----------

test("[boundary-2] both Jira variables empty are kept as empty strings and configured", () => {
  let env: ReturnType<typeof parseEnv> | undefined;
  assert.doesNotThrow(() => {
    env = parseEnv({ ...required, JIRA_CLIENT_ID: "", JIRA_CLIENT_SECRET: "" });
  });
  assert.ok(env);
  assert.equal(env.JIRA_CLIENT_ID, "");
  assert.equal(env.JIRA_CLIENT_SECRET, "");
  assert.deepEqual(jiraOAuthConfig(env), { clientId: "", clientSecret: "" });
});

test("[boundary-2] one empty Jira variable next to a set one still yields the pair", () => {
  assert.deepEqual(
    jiraOAuthConfig(
      parseEnv({
        ...required,
        JIRA_CLIENT_ID: "jira-client-id",
        JIRA_CLIENT_SECRET: "",
      }),
    ),
    { clientId: "jira-client-id", clientSecret: "" },
  );
  assert.deepEqual(
    jiraOAuthConfig(
      parseEnv({
        ...required,
        JIRA_CLIENT_ID: "",
        JIRA_CLIENT_SECRET: "jira-client-secret",
      }),
    ),
    { clientId: "", clientSecret: "jira-client-secret" },
  );
});

// ---- @boundary 3: non-empty values kept verbatim ---------------------------

test("[boundary-3] Jira credentials are returned verbatim, without trimming", () => {
  assert.deepEqual(
    jiraOAuthConfig(
      parseEnv({
        ...required,
        JIRA_CLIENT_ID: " id ",
        JIRA_CLIENT_SECRET: "s=cr+t/",
      }),
    ),
    { clientId: " id ", clientSecret: "s=cr+t/" },
  );
});

test("[boundary-3] whitespace-only Jira values are kept on env and in the pair", () => {
  const env = parseEnv({
    ...required,
    JIRA_CLIENT_ID: "   ",
    JIRA_CLIENT_SECRET: "\t",
  });
  assert.equal(env.JIRA_CLIENT_ID, "   ");
  assert.equal(env.JIRA_CLIENT_SECRET, "\t");
  assert.deepEqual(jiraOAuthConfig(env), {
    clientId: "   ",
    clientSecret: "\t",
  });
});

// ---- @boundary 4: no fallback to the sign-in app ---------------------------

test("[boundary-4] jiraOAuthConfig does not fall back to ATLASSIAN_CLIENT_*", () => {
  const env = parseEnv(required);
  assert.equal(env.ATLASSIAN_CLIENT_ID, "atlassian-client-id");
  assert.equal(jiraOAuthConfig(env), undefined);
});

test("[boundary-4] a missing Jira half is not filled in from the sign-in app", () => {
  assert.equal(
    jiraOAuthConfig(parseEnv({ ...required, JIRA_CLIENT_ID: "jira-client-id" })),
    undefined,
  );
  assert.equal(
    jiraOAuthConfig(
      parseEnv({ ...required, JIRA_CLIENT_SECRET: "jira-client-secret" }),
    ),
    undefined,
  );
});

// ---- @happy 3: the sign-in app is unaffected -------------------------------

test("[happy-3] the sign-in app keeps its own credentials when the Jira app is set", () => {
  const env = parseEnv({ ...required, ...jira });
  assert.equal(env.ATLASSIAN_CLIENT_ID, "atlassian-client-id");
  assert.equal(env.ATLASSIAN_CLIENT_SECRET, "atlassian-client-secret");
});

test("[happy-3] empty Jira values leave the sign-in app's credentials untouched", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: "", JIRA_CLIENT_SECRET: "" });
  assert.equal(env.ATLASSIAN_CLIENT_ID, "atlassian-client-id");
  assert.equal(env.ATLASSIAN_CLIENT_SECRET, "atlassian-client-secret");
  assert.equal(env.JIRA_CLIENT_ID, "");
  assert.equal(env.JIRA_CLIENT_SECRET, "");
});

// ---- @unhappy 1: sign-in credentials stay required -------------------------

test("[unhappy-1] an empty ATLASSIAN_CLIENT_ID is rejected even with the Jira app set", () => {
  assert.throws(
    () => parseEnv({ ...required, ...jira, ATLASSIAN_CLIENT_ID: "" }),
    (error: unknown) =>
      error instanceof Error && /ATLASSIAN_CLIENT_ID/.test(error.message),
  );
});

test("[unhappy-1] an empty ATLASSIAN_CLIENT_SECRET keeps its message with the Jira app set", () => {
  assert.throws(
    () => parseEnv({ ...required, ...jira, ATLASSIAN_CLIENT_SECRET: "" }),
    /ATLASSIAN_CLIENT_SECRET is required\./,
  );
});

// ---- @happy 4: the environment surface grows by exactly two ----------------

test("[happy-4] envKeys contains JIRA_CLIENT_ID and JIRA_CLIENT_SECRET", () => {
  assert.ok(envKeys.includes("JIRA_CLIENT_ID"));
  assert.ok(envKeys.includes("JIRA_CLIENT_SECRET"));
  assert.equal(envKeys.length, keysBefore.length + 2);
});

test("[happy-4] envKeys is the previous list plus exactly the two Jira variables", () => {
  assert.deepEqual(
    [...envKeys].sort(),
    [...keysBefore, "JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET"].sort(),
  );
});
