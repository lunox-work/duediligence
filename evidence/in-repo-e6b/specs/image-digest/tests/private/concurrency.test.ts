import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { resolveImageDigest } from "../../src/image-digest.js";

const DIGEST_A =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const DIGEST_B =
  "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

/** A well-formed digest that is neither DIGEST_A nor DIGEST_B. */
function digestOf(seed: string): string {
  return `sha256:${createHash("sha256").update(seed).digest("hex")}`;
}

/**
 * Wraps `target` in a Proxy that records every string property read. The
 * test changes `target` directly, so its own writes are not recorded.
 */
function recordingEnv(target: NodeJS.ProcessEnv) {
  const reads: string[] = [];
  const env = new Proxy(target, {
    get(t, key, receiver) {
      if (typeof key === "string") reads.push(key);
      return Reflect.get(t, key, receiver);
    },
  });
  return { env, reads };
}

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

// --- @concurrency 1 ---------------------------------------------------------

// Extends "[concurrency-1] setting env after the call does not change the
// pending result": the read has already happened when the call returns.
test("[concurrency-1] IMAGE_DIGEST has been read exactly once by the time the call returns", async () => {
  const target: NodeJS.ProcessEnv = { IMAGE_DIGEST: DIGEST_A };
  const { env, reads } = recordingEnv(target);
  const pending = resolveImageDigest(env);
  assert.deepEqual(reads, ["IMAGE_DIGEST"]);
  target.IMAGE_DIGEST = DIGEST_B;
  assert.equal(await pending, DIGEST_A);
  assert.deepEqual(reads, ["IMAGE_DIGEST"]);
});

// Extends "[concurrency-1] setting env after the call ...": an env that can
// no longer be read at all once the call has returned.
test("[concurrency-1] revoking the env right after the call still resolves the digest read at call time", async () => {
  const { proxy, revoke } = Proxy.revocable<NodeJS.ProcessEnv>(
    { IMAGE_DIGEST: `  ${DIGEST_B}\n` },
    {},
  );
  const pending = resolveImageDigest(proxy);
  revoke();
  await assert.doesNotReject(pending);
  assert.equal(await pending, DIGEST_B);
});

test("[concurrency-1] revoking the env right after a call on an invalid value still resolves to undefined", async () => {
  const { proxy, revoke } = Proxy.revocable<NodeJS.ProcessEnv>(
    { IMAGE_DIGEST: "unknown" },
    {},
  );
  const pending = resolveImageDigest(proxy);
  revoke();
  await assert.doesNotReject(pending);
  assert.equal(await pending, undefined);
});

// Extends "[concurrency-1] setting env after the call ...": other changes
// after the call — delete, invalid, padded, several in a row.
test("[concurrency-1] deleting IMAGE_DIGEST after the call leaves the pending result unchanged", async () => {
  const env: NodeJS.ProcessEnv = { IMAGE_DIGEST: DIGEST_B };
  const pending = resolveImageDigest(env);
  delete env.IMAGE_DIGEST;
  assert.equal(await pending, DIGEST_B);
});

test("[concurrency-1] several changes after the call, across awaits, leave the pending result unchanged", async () => {
  const env: NodeJS.ProcessEnv = { IMAGE_DIGEST: `\t${DIGEST_A}\n` };
  const pending = resolveImageDigest(env);
  env.IMAGE_DIGEST = "not-a-digest";
  await Promise.resolve();
  env.IMAGE_DIGEST = DIGEST_B;
  await new Promise<void>((resolve) => setImmediate(resolve));
  delete env.IMAGE_DIGEST;
  assert.equal(await pending, DIGEST_A);
});

test("[concurrency-1] a valid digest set after a call on an invalid value leaves that call undefined", async () => {
  const env: NodeJS.ProcessEnv = { IMAGE_DIGEST: DIGEST_A.toUpperCase() };
  const pending = resolveImageDigest(env);
  env.IMAGE_DIGEST = DIGEST_A;
  assert.equal(await pending, undefined);
});

test("[concurrency-1] changing process.env after a no-argument call leaves the pending result unchanged", async () => {
  await withProcessDigest(DIGEST_A, async () => {
    const pending = resolveImageDigest();
    process.env.IMAGE_DIGEST = DIGEST_B;
    assert.equal(await pending, DIGEST_A);
  });
  await withProcessDigest(undefined, async () => {
    const pending = resolveImageDigest();
    process.env.IMAGE_DIGEST = DIGEST_B;
    assert.equal(await pending, undefined);
  });
});

// --- @concurrency 2 ---------------------------------------------------------

// Extends "[concurrency-2] overlapping calls each see env as it was when made":
// many more overlapping calls, mixing valid, padded, invalid and unset values.
test("[concurrency-2] thirty overlapping calls each see the value env held when they were made", async () => {
  const env: NodeJS.ProcessEnv = {};
  const pending: Promise<string | undefined>[] = [];
  const expected: (string | undefined)[] = [];
  for (let i = 0; i < 30; i += 1) {
    const digest = digestOf(`overlap-${i}`);
    switch (i % 5) {
      case 0:
        env.IMAGE_DIGEST = digest;
        expected.push(digest);
        break;
      case 1:
        env.IMAGE_DIGEST = ` ${digest}\n`;
        expected.push(digest);
        break;
      case 2:
        env.IMAGE_DIGEST = digest.toUpperCase();
        expected.push(undefined);
        break;
      case 3:
        delete env.IMAGE_DIGEST;
        expected.push(undefined);
        break;
      default:
        env.IMAGE_DIGEST = "";
        expected.push(undefined);
        break;
    }
    pending.push(resolveImageDigest(env));
  }
  assert.deepEqual(await Promise.all(pending), expected);
});

test("[concurrency-2] overlapping calls awaited in reverse order each keep their own value", async () => {
  const env: NodeJS.ProcessEnv = {};
  const p1 = resolveImageDigest(env);
  env.IMAGE_DIGEST = DIGEST_A;
  const p2 = resolveImageDigest(env);
  env.IMAGE_DIGEST = DIGEST_B;
  const p3 = resolveImageDigest(env);
  assert.equal(await p3, DIGEST_B);
  assert.equal(await p2, DIGEST_A);
  assert.equal(await p1, undefined);
});

// Extends "[concurrency-2] a later call after the first has settled sees the
// new value, not a cached one": starting from unset, so a cached undefined fails.
test("[concurrency-2] sequential calls starting from an unset env are never cached", async () => {
  const env: NodeJS.ProcessEnv = {};
  assert.equal(await resolveImageDigest(env), undefined);
  env.IMAGE_DIGEST = DIGEST_A;
  assert.equal(await resolveImageDigest(env), DIGEST_A);
  env.IMAGE_DIGEST = "invalid";
  assert.equal(await resolveImageDigest(env), undefined);
  env.IMAGE_DIGEST = DIGEST_B;
  assert.equal(await resolveImageDigest(env), DIGEST_B);
});

test("[concurrency-2] overlapping calls on different env objects each see their own env", async () => {
  const p1 = resolveImageDigest({ IMAGE_DIGEST: DIGEST_A });
  const p2 = resolveImageDigest({ IMAGE_DIGEST: DIGEST_B });
  const p3 = resolveImageDigest({});
  const p4 = resolveImageDigest({ IMAGE_DIGEST: ` ${DIGEST_A} ` });
  assert.deepEqual(await Promise.all([p1, p2, p3, p4]), [
    DIGEST_A,
    DIGEST_B,
    undefined,
    DIGEST_A,
  ]);
});

test("[concurrency-2] overlapping no-argument calls each see process.env as it was when made", async () => {
  await withProcessDigest(DIGEST_A, async () => {
    const p1 = resolveImageDigest();
    process.env.IMAGE_DIGEST = DIGEST_B;
    const p2 = resolveImageDigest();
    delete process.env.IMAGE_DIGEST;
    const p3 = resolveImageDigest();
    process.env.IMAGE_DIGEST = `\n${DIGEST_A}\n`;
    const p4 = resolveImageDigest();
    assert.deepEqual(await Promise.all([p1, p2, p3, p4]), [
      DIGEST_A,
      DIGEST_B,
      undefined,
      DIGEST_A,
    ]);
  });
});

// --- @concurrency 3 ---------------------------------------------------------

// Extends "[concurrency-3] ten concurrent calls all resolve to the same
// digest": many more calls, and each one reads env itself.
test("[concurrency-3] two hundred concurrent calls agree and each reads IMAGE_DIGEST once", async () => {
  const { env, reads } = recordingEnv({ IMAGE_DIGEST: DIGEST_B, BUILD_SHA: DIGEST_A });
  const results = await Promise.all(
    Array.from({ length: 200 }, () => resolveImageDigest(env)),
  );
  assert.deepEqual(results, Array(200).fill(DIGEST_B));
  assert.deepEqual(reads, Array(200).fill("IMAGE_DIGEST"));
});

test("[concurrency-3] ten concurrent calls on DIGEST_A all resolve to DIGEST_A", async () => {
  const env = { IMAGE_DIGEST: DIGEST_A };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => resolveImageDigest(env)),
  );
  assert.deepEqual(results, Array(10).fill(DIGEST_A));
});

test("[concurrency-3] ten concurrent calls on an invalid value all fulfil with undefined", async () => {
  const env = { IMAGE_DIGEST: "sha512:" + "0".repeat(128) };
  const settled = await Promise.allSettled(
    Array.from({ length: 10 }, () => resolveImageDigest(env)),
  );
  assert.deepEqual(
    settled,
    Array.from({ length: 10 }, () => ({ status: "fulfilled", value: undefined })),
  );
});

test("[concurrency-3] ten concurrent calls on an unset env all resolve to undefined", async () => {
  const env: NodeJS.ProcessEnv = {};
  const results = await Promise.all(
    Array.from({ length: 10 }, () => resolveImageDigest(env)),
  );
  assert.deepEqual(results, Array(10).fill(undefined));
  assert.deepEqual(env, {});
});

test("[concurrency-3] ten concurrent no-argument calls all resolve to process.env's digest", async () => {
  await withProcessDigest(DIGEST_B, async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => resolveImageDigest()),
    );
    assert.deepEqual(results, Array(10).fill(DIGEST_B));
  });
});

test("[concurrency-3] concurrent calls on ten different envs each resolve to their own digest", async () => {
  const digests = Array.from({ length: 10 }, (_, i) => digestOf(`env-${i}`));
  const results = await Promise.all(
    digests.map((digest) => resolveImageDigest({ IMAGE_DIGEST: digest })),
  );
  assert.deepEqual(results, digests);
});
