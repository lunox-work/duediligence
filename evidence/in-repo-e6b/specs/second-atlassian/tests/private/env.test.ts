import assert from "node:assert/strict";
import { test } from "node:test";

import { envKeys, jiraOAuthConfig, objectStoreConfig, parseEnv } from "../../src/env.js";

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

// ---- happy-1 ----------------------------------------------------------------

// Extends "[happy-1] jiraOAuthConfig returns exactly the pair when both Jira vars are set":
// other values, so a hard-coded pair fails.
test("[happy-1] jiraOAuthConfig returns whatever pair is configured, not a fixed one", () => {
  for (const [id, secret] of [
    ["abc123", "xyz789"],
    ["another-jira-app", "a-much-longer-client-secret-value-0123456789"],
    ["ID_ÄÖÜ_🚀", "secret:with=symbols+and/slashes"],
  ] as const) {
    const env = parseEnv({ ...required, JIRA_CLIENT_ID: id, JIRA_CLIENT_SECRET: secret });
    assert.equal(env.JIRA_CLIENT_ID, id);
    assert.equal(env.JIRA_CLIENT_SECRET, secret);
    assert.deepEqual(jiraOAuthConfig(env), { clientId: id, clientSecret: secret });
  }
});

// Extends "[happy-1] jiraOAuthConfig returns exactly the pair when both Jira vars are set":
// the pair comes from the env argument, not from process.env or an earlier call.
test("[happy-1] jiraOAuthConfig reads the env it is given, call by call", () => {
  const base = parseEnv(required);
  const first = jiraOAuthConfig({ ...base, JIRA_CLIENT_ID: "first-id", JIRA_CLIENT_SECRET: "first-secret" });
  const second = jiraOAuthConfig({ ...base, JIRA_CLIENT_ID: "second-id", JIRA_CLIENT_SECRET: "second-secret" });
  assert.deepEqual(first, { clientId: "first-id", clientSecret: "first-secret" });
  assert.deepEqual(second, { clientId: "second-id", clientSecret: "second-secret" });
  assert.equal(jiraOAuthConfig(base), undefined);
});

// Extends "[happy-1] jiraOAuthConfig accepts one-character credentials": the
// Jira pair is independent of the other optional groups (object storage).
test("[happy-1] jiraOAuthConfig is set alongside a configured object store", () => {
  const env = parseEnv({
    ...required,
    ...jira,
    S3_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY_ID: "minio",
    S3_SECRET_ACCESS_KEY: "minio-secret",
  });
  assert.deepEqual(jiraOAuthConfig(env), {
    clientId: "jira-client-id",
    clientSecret: "jira-client-secret",
  });
  assert.notEqual(objectStoreConfig(env), undefined);
});

// ---- happy-2 ----------------------------------------------------------------

// Extends "[happy-2] parseEnv boots without the Jira vars and jiraOAuthConfig is undefined":
// with other optional groups set, the Jira app is still not configured.
test("[happy-2] with only other optional vars set, connecting Jira is not configured", () => {
  const env = parseEnv({
    ...required,
    S3_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY_ID: "minio",
    S3_SECRET_ACCESS_KEY: "minio-secret",
    APP_URL: "http://localhost:5173",
    ORIGIN_VERIFY: "origin-secret",
  });
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

// ---- boundary-1 -------------------------------------------------------------

// Extends "[boundary-1] only one Jira var set is not configured and not a boot error":
// other values for the lone variable, including whitespace-only ones.
test("[boundary-1] a lone Jira var of any non-empty value is not configured", () => {
  for (const partial of [
    { JIRA_CLIENT_ID: "x" },
    { JIRA_CLIENT_ID: " " },
    { JIRA_CLIENT_ID: "atlassian-client-id" },
    { JIRA_CLIENT_SECRET: "s" },
    { JIRA_CLIENT_SECRET: "\t" },
    { JIRA_CLIENT_SECRET: "atlassian-client-secret" },
    { JIRA_CLIENT_ID: "jira-client-id", JIRA_CLIENT_SECRET: undefined },
    { JIRA_CLIENT_ID: undefined, JIRA_CLIENT_SECRET: "jira-client-secret" },
  ]) {
    let env: ReturnType<typeof parseEnv> | undefined;
    assert.doesNotThrow(() => {
      env = parseEnv({ ...required, ...partial });
    }, JSON.stringify(partial));
    assert.equal(jiraOAuthConfig(env!), undefined, JSON.stringify(partial));
  }
});

// Extends "[boundary-1] one Jira var set and the other empty is not configured":
// the set half is still parsed verbatim, so the config is undefined because
// the pair is incomplete, not because the set half was dropped.
test("[boundary-1] a half-configured app keeps the set half on env", () => {
  const idOnly = parseEnv({ ...required, JIRA_CLIENT_ID: "jira-client-id", JIRA_CLIENT_SECRET: "" });
  assert.equal(idOnly.JIRA_CLIENT_ID, "jira-client-id");
  assert.equal(idOnly.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(idOnly), undefined);

  const secretOnly = parseEnv({ ...required, JIRA_CLIENT_ID: "", JIRA_CLIENT_SECRET: "jira-client-secret" });
  assert.equal(secretOnly.JIRA_CLIENT_ID, undefined);
  assert.equal(secretOnly.JIRA_CLIENT_SECRET, "jira-client-secret");
  assert.equal(jiraOAuthConfig(secretOnly), undefined);
});

// ---- boundary-2 -------------------------------------------------------------

// Extends "[boundary-2] a lone empty JIRA_CLIENT_ID is parsed as undefined":
// the other variable empty on its own.
test("[boundary-2] a lone empty JIRA_CLIENT_SECRET is parsed as undefined", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_SECRET: "" });
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.JIRA_CLIENT_SECRET, undefined);
  assert.equal(jiraOAuthConfig(env), undefined);
});

// Extends "[boundary-2] empty Jira vars are parsed as undefined": an empty
// value is not kept as "" (which a falsy check would hide).
test("[boundary-2] empty Jira vars are undefined, not empty strings", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: "", JIRA_CLIENT_SECRET: "" });
  assert.notEqual(env.JIRA_CLIENT_ID, "");
  assert.notEqual(env.JIRA_CLIENT_SECRET, "");
  assert.strictEqual(env.JIRA_CLIENT_ID, undefined);
  assert.strictEqual(env.JIRA_CLIENT_SECRET, undefined);
  assert.strictEqual(jiraOAuthConfig(env), undefined);
});

// ---- boundary-3 -------------------------------------------------------------

// Extends "[boundary-3] Jira credentials are kept verbatim without trimming":
// other characters a trimming or normalising parser would change.
test("[boundary-3] Jira credentials with padding, newlines and unicode are kept verbatim", () => {
  for (const [id, secret] of [
    ["  leading", "trailing  "],
    ["\tid\t", "\nsecret\n"],
    ["a b c", "x\r\ny"],
    ["café", "é"],
    [" nbsp ", "=="],
  ] as const) {
    const env = parseEnv({ ...required, JIRA_CLIENT_ID: id, JIRA_CLIENT_SECRET: secret });
    assert.equal(env.JIRA_CLIENT_ID, id);
    assert.equal(env.JIRA_CLIENT_SECRET, secret);
    assert.deepEqual(jiraOAuthConfig(env), { clientId: id, clientSecret: secret });
  }
});

// Extends "[boundary-3] Jira credentials are kept verbatim without trimming":
// a long value is not truncated.
test("[boundary-3] a long Jira credential is kept whole", () => {
  const id = "i".repeat(2048);
  const secret = "s".repeat(4096);
  const env = parseEnv({ ...required, JIRA_CLIENT_ID: id, JIRA_CLIENT_SECRET: secret });
  assert.deepEqual(jiraOAuthConfig(env), { clientId: id, clientSecret: secret });
});

// ---- boundary-4 -------------------------------------------------------------

// Extends "[boundary-4] a lone JIRA_CLIENT_ID is not completed with ATLASSIAN_CLIENT_SECRET":
// the other half.
test("[boundary-4] a lone JIRA_CLIENT_SECRET is not completed with ATLASSIAN_CLIENT_ID", () => {
  const env = parseEnv({ ...required, JIRA_CLIENT_SECRET: "jira-client-secret" });
  assert.equal(env.JIRA_CLIENT_ID, undefined);
  assert.equal(env.ATLASSIAN_CLIENT_ID, "atlassian-client-id");
  assert.equal(jiraOAuthConfig(env), undefined);
});

// Extends "[boundary-4] jiraOAuthConfig does not fall back to the ATLASSIAN_* pair":
// other sign-in values, and empty Jira vars.
test("[boundary-4] empty Jira vars do not fall back to any sign-in pair", () => {
  const env = parseEnv({
    ...required,
    ATLASSIAN_CLIENT_ID: "sign-in-app-id",
    ATLASSIAN_CLIENT_SECRET: "sign-in-app-secret",
    JIRA_CLIENT_ID: "",
    JIRA_CLIENT_SECRET: "",
  });
  assert.equal(env.ATLASSIAN_CLIENT_ID, "sign-in-app-id");
  assert.equal(jiraOAuthConfig(env), undefined);
});

// Extends "[boundary-4] jiraOAuthConfig does not fall back to the ATLASSIAN_* pair":
// a fully set Jira app never mixes in a sign-in credential.
test("[boundary-4] a configured Jira app uses only its own credentials", () => {
  const env = parseEnv({
    ...required,
    ATLASSIAN_CLIENT_ID: "sign-in-app-id",
    ATLASSIAN_CLIENT_SECRET: "sign-in-app-secret",
    JIRA_CLIENT_ID: "connect-app-id",
    JIRA_CLIENT_SECRET: "connect-app-secret",
  });
  assert.deepEqual(jiraOAuthConfig(env), {
    clientId: "connect-app-id",
    clientSecret: "connect-app-secret",
  });
});

// ---- happy-3 ----------------------------------------------------------------

// Extends "[happy-3] the ATLASSIAN_* pair is unchanged when the Jira app is set":
// other sign-in values, with the Jira app set to its own values.
test("[happy-3] the sign-in pair keeps its own values beside a configured Jira app", () => {
  const env = parseEnv({
    ...required,
    ATLASSIAN_CLIENT_ID: "sign-in-app-id",
    ATLASSIAN_CLIENT_SECRET: "sign-in-app-secret",
    ...jira,
  });
  assert.equal(env.ATLASSIAN_CLIENT_ID, "sign-in-app-id");
  assert.equal(env.ATLASSIAN_CLIENT_SECRET, "sign-in-app-secret");
  assert.equal(env.JIRA_CLIENT_ID, "jira-client-id");
  assert.equal(env.JIRA_CLIENT_SECRET, "jira-client-secret");
});

// Extends "[happy-3] the ATLASSIAN_* pair is unchanged when the Jira app is half set":
// the Jira app set to the same strings as the sign-in app does not swap them.
test("[happy-3] the sign-in pair is unchanged when the Jira app holds swapped values", () => {
  const env = parseEnv({
    ...required,
    JIRA_CLIENT_ID: "atlassian-client-secret",
    JIRA_CLIENT_SECRET: "atlassian-client-id",
  });
  assert.equal(env.ATLASSIAN_CLIENT_ID, "atlassian-client-id");
  assert.equal(env.ATLASSIAN_CLIENT_SECRET, "atlassian-client-secret");
  assert.deepEqual(jiraOAuthConfig(env), {
    clientId: "atlassian-client-secret",
    clientSecret: "atlassian-client-id",
  });
});

// ---- unhappy-1 --------------------------------------------------------------

// Extends "[unhappy-1] an empty ATLASSIAN_CLIENT_ID is rejected even with the Jira app set":
// the message is kept, and the same source with the sign-in id restored boots
// with the Jira app configured (so the Jira app is really set here).
test("[unhappy-1] an empty ATLASSIAN_CLIENT_ID keeps its message with the Jira app set", () => {
  const source = { ...required, ...jira };
  assert.deepEqual(jiraOAuthConfig(parseEnv(source)), {
    clientId: "jira-client-id",
    clientSecret: "jira-client-secret",
  });
  assert.throws(
    () => parseEnv({ ...source, ATLASSIAN_CLIENT_ID: "" }),
    (error: unknown) =>
      error instanceof Error && /ATLASSIAN_CLIENT_ID is required\./.test(error.message),
  );
});

// Extends "[unhappy-1] a missing ATLASSIAN_CLIENT_SECRET is rejected even with the Jira app set":
// the other combinations (missing id, empty secret, both missing); the Jira
// credentials never stand in for them.
test("[unhappy-1] missing or empty sign-in credentials are rejected beside a Jira app", () => {
  const { ATLASSIAN_CLIENT_ID: _id, ATLASSIAN_CLIENT_SECRET: _secret, ...rest } = required;
  assert.equal(parseEnv({ ...required, ...jira }).JIRA_CLIENT_ID, "jira-client-id");
  const cases: [Record<string, string>, RegExp[]][] = [
    [{ ...rest, ATLASSIAN_CLIENT_SECRET: "atlassian-client-secret", ...jira }, [/ATLASSIAN_CLIENT_ID/]],
    [{ ...required, ...jira, ATLASSIAN_CLIENT_SECRET: "" }, [/ATLASSIAN_CLIENT_SECRET is required\./]],
    [{ ...rest, ...jira }, [/ATLASSIAN_CLIENT_ID/, /ATLASSIAN_CLIENT_SECRET/]],
  ];
  for (const [source, patterns] of cases) {
    assert.throws(
      () => parseEnv(source),
      (error: unknown) =>
        error instanceof Error && patterns.every((pattern) => pattern.test(error.message)),
      JSON.stringify(Object.keys(source)),
    );
  }
});

// ---- happy-4 ----------------------------------------------------------------

// Extends "[happy-4] envKeys is exactly the previous list plus the two Jira vars":
// no duplicates, and no other Jira-named or renamed variable.
test("[happy-4] envKeys lists each Jira var once and no other Jira variable", () => {
  assert.equal(envKeys.filter((key) => key === "JIRA_CLIENT_ID").length, 1);
  assert.equal(envKeys.filter((key) => key === "JIRA_CLIENT_SECRET").length, 1);
  assert.equal(new Set(envKeys).size, envKeys.length);
  assert.deepEqual(
    envKeys.filter((key) => key.includes("JIRA")).sort(),
    ["JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET"],
  );
  for (const key of keysBefore) assert.ok(envKeys.includes(key), key);
});

// Extends "[happy-4] envKeys contains the two Jira vars and two more entries than before":
// everything parseEnv returns is a listed variable, so the Jira values are
// read through the listed keys.
test("[happy-4] every field parseEnv returns with the Jira app set is in envKeys", () => {
  const env = parseEnv({ ...required, ...jira });
  assert.equal(env.JIRA_CLIENT_ID, "jira-client-id");
  for (const key of Object.keys(env)) assert.ok(envKeys.includes(key), key);
  assert.ok(envKeys.includes("JIRA_CLIENT_ID"));
  assert.ok(envKeys.includes("JIRA_CLIENT_SECRET"));
});
