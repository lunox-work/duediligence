import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuildInfoDto } from "@sandbox-factory/shared";

import { parseEnv } from "../src/env.js";
import { resolveImageDigest } from "../src/image-digest.js";
import { createApp } from "../src/routes.js";
import { createInMemoryStore } from "../src/store.js";

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

const build: BuildInfoDto = {
  version: "1.4.2",
  gitSha: "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
  gitShortSha: "7f3a9c1",
  buildTime: "2026-11-01T12:00:00Z",
  gitRef: "v1.4.2",
  dirty: false,
};

/**
 * Wraps `target` in a Proxy that records every property read and every
 * attempted write, so a test can assert which keys the resolver touched.
 * Writes are recorded and then applied, so behaviour is otherwise unchanged.
 */
function recordingEnv(target: NodeJS.ProcessEnv) {
  const reads: string[] = [];
  const writes: string[] = [];
  const env = new Proxy(target, {
    get(t, key, receiver) {
      if (typeof key === "string") reads.push(key);
      return Reflect.get(t, key, receiver);
    },
    set(t, key, value, receiver) {
      writes.push(`set ${String(key)}`);
      return Reflect.set(t, key, value, receiver);
    },
    defineProperty(t, key, descriptor) {
      writes.push(`define ${String(key)}`);
      return Reflect.defineProperty(t, key, descriptor);
    },
    deleteProperty(t, key) {
      writes.push(`delete ${String(key)}`);
      return Reflect.deleteProperty(t, key);
    },
  });
  return { env, reads, writes };
}

/**
 * Runs `fn` with process.env.IMAGE_DIGEST set to `value` (or deleted when
 * `undefined`), restoring whatever was there before afterwards.
 */
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

/** Counts calls to the console methods while `fn` runs, then restores them. */
async function countConsoleCalls(fn: () => Promise<void>): Promise<number> {
  const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const originals = methods.map((m) => console[m]);
  let calls = 0;
  for (const m of methods) {
    console[m] = () => {
      calls += 1;
    };
  }
  try {
    await fn();
  } finally {
    methods.forEach((m, i) => {
      console[m] = originals[i]!;
    });
  }
  return calls;
}

// --- @happy 1: The digest set by CD is returned verbatim -------------------

test("[happy-1] a well-formed IMAGE_DIGEST resolves to that digest", async () => {
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: DIGEST_A }), DIGEST_A);
});

test("[happy-1] digests at the edges of the hex range are accepted verbatim", async () => {
  const zeros = `sha256:${"0".repeat(64)}`;
  const effs = `sha256:${"f".repeat(64)}`;
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: zeros }), zeros);
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: effs }), effs);
});

// --- @happy 2: Other keys in the environment do not affect the result ------

test("[happy-2] other keys alongside IMAGE_DIGEST do not change the result", async () => {
  const env = {
    IMAGE_DIGEST: DIGEST_B,
    BUILD_SHA: "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
    PORT: "4000",
  };
  assert.equal(await resolveImageDigest(env), DIGEST_B);
});

test("[happy-2] only IMAGE_DIGEST is read, exactly once, even when another key holds a digest", async () => {
  const { env, reads } = recordingEnv({
    IMAGE_DIGEST: DIGEST_B,
    BUILD_SHA: DIGEST_A,
    PORT: "4000",
  });
  assert.equal(await resolveImageDigest(env), DIGEST_B);
  assert.deepEqual(reads, ["IMAGE_DIGEST"]);
});

// --- @happy 3: The result is a Promise --------------------------------------

test("[happy-3] the return value is a Promise that resolves to the digest", async () => {
  const result = resolveImageDigest({ IMAGE_DIGEST: DIGEST_A });
  assert.ok(result instanceof Promise);
  assert.equal(await result, DIGEST_A);
});

test("[happy-3] an invalid value still returns a Promise, resolving to undefined", async () => {
  let result: Promise<string | undefined> | undefined;
  assert.doesNotThrow(() => {
    result = resolveImageDigest({ IMAGE_DIGEST: "unknown" });
  });
  assert.ok(result instanceof Promise);
  assert.equal(await result, undefined);
});

// --- @happy 4: With no argument the resolver reads process.env -------------

test("[happy-4] with no argument process.env.IMAGE_DIGEST is used", async () => {
  await withProcessDigest(DIGEST_A, async () => {
    assert.equal(await resolveImageDigest(), DIGEST_A);
  });
  await withProcessDigest(undefined, async () => {
    assert.equal(await resolveImageDigest(), undefined);
  });
});

test("[happy-4] passing undefined explicitly also falls back to process.env", async () => {
  await withProcessDigest(DIGEST_B, async () => {
    assert.equal(await resolveImageDigest(undefined), DIGEST_B);
  });
});

// --- @happy 5: The input environment is left unchanged ---------------------

test("[happy-5] env is left unchanged after a padded value is trimmed", async () => {
  const padded = `  ${DIGEST_A}\n`;
  const env = { IMAGE_DIGEST: padded, BUILD_SHA: "abc" };
  assert.equal(await resolveImageDigest(env), DIGEST_A);
  assert.deepEqual(env, { IMAGE_DIGEST: padded, BUILD_SHA: "abc" });
});

test("[happy-5] no write is attempted on env, whether the value is valid or not", async () => {
  for (const value of [`  ${DIGEST_A}\n`, "not-a-digest", ""]) {
    const { env, writes } = recordingEnv({ IMAGE_DIGEST: value });
    await resolveImageDigest(env);
    assert.deepEqual(writes, [], `value ${JSON.stringify(value)}`);
  }
  const frozen = Object.freeze({ IMAGE_DIGEST: `\t${DIGEST_A} ` });
  assert.equal(await resolveImageDigest(frozen), DIGEST_A);
});

// --- @happy 6: parseEnv neither validates nor keeps IMAGE_DIGEST ----------

test("[happy-6] parseEnv accepts and drops an invalid IMAGE_DIGEST", () => {
  let env: ReturnType<typeof parseEnv> | undefined;
  assert.doesNotThrow(() => {
    env = parseEnv({ ...required, IMAGE_DIGEST: "not-a-digest" });
  });
  assert.equal(Object.prototype.hasOwnProperty.call(env, "IMAGE_DIGEST"), false);
});

test("[happy-6] parseEnv drops even a valid IMAGE_DIGEST", () => {
  const env = parseEnv({ ...required, IMAGE_DIGEST: DIGEST_A });
  assert.equal(Object.prototype.hasOwnProperty.call(env, "IMAGE_DIGEST"), false);
});

// --- @happy 7: GET /version still returns exactly the BuildInfoDto --------

test("[happy-7] GET /version returns exactly the given build info", async () => {
  const server = createApp({
    store: createInMemoryStore([]),
    corsOrigins: ["http://localhost:5173"],
    buildInfo: build,
  });
  const res = await server.request("/version");
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(body, build);
  assert.equal("imageDigest" in body, false);
});

test("[happy-7] GET /version adds no imageDigest even when IMAGE_DIGEST is set", async () => {
  await withProcessDigest(DIGEST_A, async () => {
    const server = createApp({
      store: createInMemoryStore([]),
      corsOrigins: ["http://localhost:5173"],
      buildInfo: build,
    });
    const res = await server.request("/version");
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(body, build);
    assert.equal("imageDigest" in body, false);
  });
});

// --- @boundary 1: Leading and trailing whitespace is removed ---------------

test("[boundary-1] a trailing newline is trimmed", async () => {
  assert.equal(
    await resolveImageDigest({ IMAGE_DIGEST: `${DIGEST_A}\n` }),
    DIGEST_A,
  );
});

test("[boundary-1] surrounding spaces are trimmed", async () => {
  assert.equal(
    await resolveImageDigest({ IMAGE_DIGEST: `  ${DIGEST_A}  ` }),
    DIGEST_A,
  );
});

test("[boundary-1] a leading tab and trailing CRLF are trimmed", async () => {
  assert.equal(
    await resolveImageDigest({ IMAGE_DIGEST: `\t${DIGEST_A}\r\n` }),
    DIGEST_A,
  );
});

// --- @boundary 2: An empty or whitespace-only value is treated as unset ----

test("[boundary-2] an empty IMAGE_DIGEST resolves to undefined", async () => {
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: "" }), undefined);
});

test("[boundary-2] a spaces-only IMAGE_DIGEST resolves to undefined", async () => {
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: "   " }), undefined);
});

test("[boundary-2] a newline-only IMAGE_DIGEST resolves to undefined", async () => {
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: "\n" }), undefined);
});

// --- @boundary 3: Values that look like a digest but are not exactly one ---

const lookalikes: ReadonlyArray<readonly [string, string]> = [
  [
    "63 hex characters",
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde",
  ],
  [
    "65 hex characters",
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0",
  ],
  [
    "non-hex character",
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg",
  ],
  [
    "uppercase hex",
    "sha256:0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
  ],
  [
    "uppercase algorithm",
    "SHA256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ],
  [
    "no algorithm prefix",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ],
  ["prefix without hex", "sha256:"],
  [
    "other algorithm",
    "sha512:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ],
  [
    "full image reference",
    "123456789012.dkr.ecr.eu-west-1.amazonaws.com/sandbox-factory-api@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ],
  [
    "tag instead of digest",
    "sandbox-factory-api:7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a",
  ],
  ["placeholder", "unknown"],
];

for (const [name, value] of lookalikes) {
  test(`[boundary-3] ${name} resolves, rather than rejects, to undefined`, async () => {
    const result = resolveImageDigest({ IMAGE_DIGEST: value });
    await assert.doesNotReject(result);
    assert.equal(await result, undefined);
  });
}

test("[boundary-3] a rejected look-alike writes nothing to the console", async () => {
  const calls = await countConsoleCalls(async () => {
    for (const [, value] of lookalikes) {
      assert.equal(await resolveImageDigest({ IMAGE_DIGEST: value }), undefined);
    }
  });
  assert.equal(calls, 0);
});

// --- @unhappy 1: Whitespace inside the value is not removed ----------------

test("[unhappy-1] a space inside the value makes it invalid", async () => {
  assert.equal(
    await resolveImageDigest({
      IMAGE_DIGEST:
        "sha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    }),
    undefined,
  );
});

test("[unhappy-1] a newline inside the hex part makes it invalid", async () => {
  assert.equal(
    await resolveImageDigest({
      IMAGE_DIGEST:
        "sha256:0123456789abcdef0123456789abcdef\n0123456789abcdef0123456789abcdef",
    }),
    undefined,
  );
});

// --- @unhappy 2: IMAGE_DIGEST is not set ------------------------------------

test("[unhappy-2] an empty env resolves to undefined", async () => {
  assert.equal(await resolveImageDigest({}), undefined);
});

test("[unhappy-2] a differently-cased key does not count as IMAGE_DIGEST", async () => {
  assert.equal(
    await resolveImageDigest({ image_digest: DIGEST_A, BUILD_SHA: DIGEST_B }),
    undefined,
  );
});

// --- @unhappy 3: IMAGE_DIGEST is explicitly undefined ----------------------

test("[unhappy-3] an explicitly undefined IMAGE_DIGEST resolves to undefined", async () => {
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: undefined }), undefined);
});

test("[unhappy-3] an explicitly undefined IMAGE_DIGEST is not filled from other keys", async () => {
  const result = resolveImageDigest({
    IMAGE_DIGEST: undefined,
    BUILD_SHA: DIGEST_A,
  });
  await assert.doesNotReject(result);
  assert.equal(await result, undefined);
});

// --- @concurrency 1: Changing env after the call ---------------------------

test("[concurrency-1] setting env after the call does not change the pending result", async () => {
  const env: NodeJS.ProcessEnv = { IMAGE_DIGEST: DIGEST_A };
  const pending = resolveImageDigest(env);
  env.IMAGE_DIGEST = DIGEST_B;
  assert.equal(await pending, DIGEST_A);
});

test("[concurrency-1] setting a digest after a call on an unset env leaves that call undefined", async () => {
  const env: NodeJS.ProcessEnv = {};
  const pending = resolveImageDigest(env);
  env.IMAGE_DIGEST = DIGEST_A;
  assert.equal(await pending, undefined);
});

// --- @concurrency 2: Overlapping calls each see env as it was ---------------

test("[concurrency-2] overlapping calls each see env as it was when made", async () => {
  const env: NodeJS.ProcessEnv = { IMAGE_DIGEST: DIGEST_A };
  const p1 = resolveImageDigest(env);
  env.IMAGE_DIGEST = DIGEST_B;
  const p2 = resolveImageDigest(env);
  delete env.IMAGE_DIGEST;
  const p3 = resolveImageDigest(env);
  assert.deepEqual(await Promise.all([p1, p2, p3]), [
    DIGEST_A,
    DIGEST_B,
    undefined,
  ]);
});

test("[concurrency-2] a later call after the first has settled sees the new value, not a cached one", async () => {
  const env: NodeJS.ProcessEnv = { IMAGE_DIGEST: DIGEST_A };
  assert.equal(await resolveImageDigest(env), DIGEST_A);
  env.IMAGE_DIGEST = DIGEST_B;
  assert.equal(await resolveImageDigest(env), DIGEST_B);
  delete env.IMAGE_DIGEST;
  assert.equal(await resolveImageDigest(env), undefined);
});

// --- @concurrency 3: Concurrent calls on the same environment agree --------

test("[concurrency-3] ten concurrent calls all resolve to the same digest", async () => {
  const env = { IMAGE_DIGEST: DIGEST_B };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => resolveImageDigest(env)),
  );
  assert.deepEqual(results, Array(10).fill(DIGEST_B));
});

test("[concurrency-3] ten concurrent calls on a padded value all resolve trimmed and leave env alone", async () => {
  const padded = ` ${DIGEST_B}\n`;
  const env = { IMAGE_DIGEST: padded };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => resolveImageDigest(env)),
  );
  assert.deepEqual(results, Array(10).fill(DIGEST_B));
  assert.deepEqual(env, { IMAGE_DIGEST: padded });
});
