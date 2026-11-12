import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildInfoSchema,
  unknownBuildInfo,
  type BuildInfoDto,
} from "@sandbox-factory/shared";

import { buildInfo, parseEnv } from "../../src/env.js";
import { resolveImageDigest } from "../../src/image-digest.js";
import { createApp } from "../../src/routes.js";
import { createInMemoryStore } from "../../src/store.js";

const DIGEST_A =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const DIGEST_B =
  "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

/** The required variables from `env.test.ts`, so `parseEnv` accepts the rest. */
const required = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:4000",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  ATLASSIAN_CLIENT_ID: "atlassian-client-id",
  ATLASSIAN_CLIENT_SECRET: "atlassian-client-secret",
};

const provenance = {
  BUILD_VERSION: "1.4.2",
  BUILD_SHA: "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
  BUILD_TIME: "2026-11-01T12:00:00Z",
  BUILD_REF: "v1.4.2",
  BUILD_DIRTY: "false",
};

const build: BuildInfoDto = {
  version: "1.4.2",
  gitSha: "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
  gitShortSha: "7f3a9c1",
  buildTime: "2026-11-01T12:00:00Z",
  gitRef: "v1.4.2",
  dirty: false,
};

/** Runs `fn` with process.env.IMAGE_DIGEST set (or deleted), then restores it. */
async function withProcessDigest<T>(
  value: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const had = Object.prototype.hasOwnProperty.call(process.env, "IMAGE_DIGEST");
  const previous = process.env.IMAGE_DIGEST;
  if (value === undefined) delete process.env.IMAGE_DIGEST;
  else process.env.IMAGE_DIGEST = value;
  try {
    return await fn();
  } finally {
    if (had) process.env.IMAGE_DIGEST = previous;
    else delete process.env.IMAGE_DIGEST;
  }
}

async function getVersion(info: BuildInfoDto) {
  const server = createApp({
    store: createInMemoryStore([]),
    corsOrigins: ["http://localhost:5173"],
    buildInfo: info,
  });
  const res = await server.request("/version");
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// --- @happy 6 ---------------------------------------------------------------

// Extends "[happy-6] parseEnv accepts and drops an invalid IMAGE_DIGEST" and
// "[happy-6] parseEnv drops even a valid IMAGE_DIGEST": other values, the
// whole parsed result, and the resolver reading the same source.
test("[happy-6] parseEnv drops every kind of IMAGE_DIGEST while the resolver reads it from the same source", async () => {
  const cases: ReadonlyArray<readonly [string, string | undefined]> = [
    [`  ${DIGEST_B}\n`, DIGEST_B],
    [DIGEST_A, DIGEST_A],
    ["", undefined],
    ["   ", undefined],
    [DIGEST_A.toUpperCase(), undefined],
    [`repo@${DIGEST_A}`, undefined],
    ["sha512:" + "0".repeat(128), undefined],
  ];
  const baseline = parseEnv({ ...required, ...provenance });
  for (const [value, expected] of cases) {
    const source = { ...required, ...provenance, IMAGE_DIGEST: value };
    let env: ReturnType<typeof parseEnv> | undefined;
    assert.doesNotThrow(() => {
      env = parseEnv(source);
    }, JSON.stringify(value));
    assert.equal(Object.prototype.hasOwnProperty.call(env, "IMAGE_DIGEST"), false);
    assert.deepEqual(env, baseline);
    assert.equal(await resolveImageDigest(source), expected);
  }
});

test("[happy-6] the parsed Env carries no digest, so resolving from it gives undefined", async () => {
  const source = { ...required, ...provenance, IMAGE_DIGEST: DIGEST_B };
  const env = parseEnv(source);
  assert.equal("IMAGE_DIGEST" in env, false);
  assert.equal(await resolveImageDigest(source), DIGEST_B);
  assert.equal(
    await resolveImageDigest(env as unknown as NodeJS.ProcessEnv),
    undefined,
  );
});

test("[happy-6] buildInfo from a parsed env is unchanged by IMAGE_DIGEST", async () => {
  const source = { ...required, ...provenance, IMAGE_DIGEST: DIGEST_A };
  const info = buildInfo(parseEnv(source));
  assert.deepEqual(info, buildInfo(parseEnv({ ...required, ...provenance })));
  assert.equal("imageDigest" in info, false);
  assert.equal(await resolveImageDigest(source), DIGEST_A);
});

// --- @happy 7 ---------------------------------------------------------------

// Extends "[happy-7] GET /version returns exactly the given build info" and
// "[happy-7] GET /version adds no imageDigest even when IMAGE_DIGEST is set":
// other build records, with a digest the resolver does report.
test("[happy-7] GET /version returns other build records unchanged while the resolver reports a digest", async () => {
  const dirtyBuild: BuildInfoDto = {
    version: "2.0.0-rc.1",
    gitSha: "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
    gitShortSha: "0a1b2c3",
    buildTime: "2026-11-03T08:30:00Z",
    gitRef: "main",
    dirty: true,
  };
  await withProcessDigest(`  ${DIGEST_B}\n`, async () => {
    assert.equal(await resolveImageDigest(), DIGEST_B);
    for (const info of [build, dirtyBuild, unknownBuildInfo]) {
      const { status, body } = await getVersion(info);
      assert.equal(status, 200);
      assert.deepEqual(body, info);
      assert.equal("imageDigest" in body, false);
      assert.deepEqual(Object.keys(body).sort(), Object.keys(info).sort());
      assert.deepEqual(buildInfoSchema.parse(body), info);
    }
  });
});

test("[happy-7] GET /version body is the build record exactly when a digest is passed in the env", async () => {
  const env = { IMAGE_DIGEST: DIGEST_A, BUILD_SHA: build.gitSha };
  assert.equal(await resolveImageDigest(env), DIGEST_A);
  const { status, body } = await getVersion(build);
  assert.equal(status, 200);
  assert.deepEqual(body, build);
  assert.equal(JSON.stringify(body).includes(DIGEST_A.slice("sha256:".length)), false);
});
