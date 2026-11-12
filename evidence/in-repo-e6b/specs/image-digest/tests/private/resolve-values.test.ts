import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import * as imageDigestModule from "../../src/image-digest.js";
import { resolveImageDigest } from "../../src/image-digest.js";

const DIGEST_A =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const DIGEST_B =
  "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const HEX_A = DIGEST_A.slice("sha256:".length);
const HEX_B = DIGEST_B.slice("sha256:".length);

/** A well-formed digest that is neither DIGEST_A nor DIGEST_B. */
function digestOf(seed: string): string {
  return `sha256:${createHash("sha256").update(seed).digest("hex")}`;
}

/** Records every string property read and every attempted write on `target`. */
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

/** Replaces global fetch with a spy that counts calls while `fn` runs. */
async function countFetchCalls(fn: () => Promise<void>): Promise<number> {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("network is not available in this test");
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
  return calls;
}

// --- @happy 1 ---------------------------------------------------------------

// Extends "[happy-1] a well-formed IMAGE_DIGEST resolves to that digest":
// many other well-formed digests, so a resolver that only knows DIGEST_A fails.
test("[happy-1] forty computed sha256 digests each resolve verbatim", async () => {
  for (let i = 0; i < 40; i += 1) {
    const digest = digestOf(`image-${i}`);
    assert.equal(
      await resolveImageDigest({ IMAGE_DIGEST: digest }),
      digest,
      digest,
    );
  }
});

// Extends "[happy-1] digests at the edges of the hex range are accepted verbatim".
test("[happy-1] DIGEST_B and every single-hex-character digest resolve verbatim", async () => {
  assert.equal(await resolveImageDigest({ IMAGE_DIGEST: DIGEST_B }), DIGEST_B);
  for (const ch of "0123456789abcdef") {
    const digest = `sha256:${ch.repeat(64)}`;
    assert.equal(await resolveImageDigest({ IMAGE_DIGEST: digest }), digest);
  }
});

test("[happy-1] the module's only export is resolveImageDigest, and it resolves the digest", async () => {
  assert.deepEqual(Object.keys(imageDigestModule).sort(), ["resolveImageDigest"]);
  assert.equal(
    await imageDigestModule.resolveImageDigest({ IMAGE_DIGEST: DIGEST_B }),
    DIGEST_B,
  );
});

test("[happy-1] resolving a valid digest writes nothing to the console", async () => {
  const calls = await countConsoleCalls(async () => {
    assert.equal(await resolveImageDigest({ IMAGE_DIGEST: DIGEST_A }), DIGEST_A);
    assert.equal(
      await resolveImageDigest({ IMAGE_DIGEST: ` ${DIGEST_B}\n` }),
      DIGEST_B,
    );
  });
  assert.equal(calls, 0);
});

// --- @happy 2 ---------------------------------------------------------------

// Extends "[happy-2] other keys alongside IMAGE_DIGEST do not change the result":
// many more keys, several of them holding other valid digests.
test("[happy-2] a hundred other keys holding digests do not change the result", async () => {
  const env: NodeJS.ProcessEnv = {};
  for (let i = 0; i < 100; i += 1) env[`KEY_${i}`] = digestOf(`other-${i}`);
  env.BUILD_SHA = DIGEST_A;
  env.IMAGE_DIGEST_SHA256 = DIGEST_A;
  env.image_digest = DIGEST_A;
  env.ECS_CONTAINER_METADATA_URI_V4 = "http://169.254.170.2/v4/abc";
  env.IMAGE_DIGEST = DIGEST_B;
  assert.equal(await resolveImageDigest(env), DIGEST_B);
});

// Extends "[happy-2] only IMAGE_DIGEST is read, exactly once, ...": the same
// holds for padded, invalid, empty, missing and undefined values.
test("[happy-2] only IMAGE_DIGEST is read, exactly once, whatever its value", async () => {
  const cases: ReadonlyArray<readonly [NodeJS.ProcessEnv, string | undefined]> = [
    [{ IMAGE_DIGEST: `\t ${DIGEST_A}\r\n`, BUILD_SHA: DIGEST_B }, DIGEST_A],
    [{ IMAGE_DIGEST: "not-a-digest", BUILD_SHA: DIGEST_B }, undefined],
    [{ IMAGE_DIGEST: "", BUILD_SHA: DIGEST_B }, undefined],
    [{ IMAGE_DIGEST: "   ", BUILD_SHA: DIGEST_B }, undefined],
    [{ IMAGE_DIGEST: undefined, BUILD_SHA: DIGEST_B }, undefined],
    [{ BUILD_SHA: DIGEST_B, PORT: "4000" }, undefined],
    [
      {
        ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4/abc",
        IMAGE_DIGEST: DIGEST_B.toUpperCase(),
      },
      undefined,
    ],
  ];
  for (const [target, expected] of cases) {
    const { env, reads } = recordingEnv(target);
    assert.equal(await resolveImageDigest(env), expected);
    assert.deepEqual(reads, ["IMAGE_DIGEST"], JSON.stringify(target));
  }
});

test("[happy-2] the ECS metadata URI is ignored and no fetch is made", async () => {
  const calls = await countFetchCalls(async () => {
    assert.equal(
      await resolveImageDigest({
        IMAGE_DIGEST: DIGEST_B,
        ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4/abc",
      }),
      DIGEST_B,
    );
  });
  assert.equal(calls, 0);
});

// --- @happy 3 ---------------------------------------------------------------

// Extends "[happy-3] the return value is a Promise ..." and "[happy-3] an
// invalid value still returns a Promise ...": every kind of input.
test("[happy-3] every kind of input returns a Promise without throwing synchronously", async () => {
  const cases: ReadonlyArray<readonly [NodeJS.ProcessEnv, string | undefined]> = [
    [{ IMAGE_DIGEST: DIGEST_B }, DIGEST_B],
    [{ IMAGE_DIGEST: `  ${DIGEST_B}\n` }, DIGEST_B],
    [{}, undefined],
    [{ IMAGE_DIGEST: undefined }, undefined],
    [{ IMAGE_DIGEST: "" }, undefined],
    [{ IMAGE_DIGEST: "\n" }, undefined],
    [{ IMAGE_DIGEST: "sha256:" }, undefined],
    [{ IMAGE_DIGEST: `repo@${DIGEST_A}` }, undefined],
    [{ IMAGE_DIGEST: "sha256:" + "a".repeat(100_000) }, undefined],
  ];
  for (const [env, expected] of cases) {
    let result: Promise<string | undefined> | undefined;
    assert.doesNotThrow(() => {
      result = resolveImageDigest(env);
    });
    assert.ok(result instanceof Promise, JSON.stringify(env).slice(0, 80));
    assert.equal(await result, expected);
  }
});

test("[happy-3] with no argument the return value is still a Promise", async () => {
  await withProcessDigest(DIGEST_B, async () => {
    const result = resolveImageDigest();
    assert.ok(result instanceof Promise);
    assert.equal(await result, DIGEST_B);
  });
});

// --- @happy 4 ---------------------------------------------------------------

// Extends "[happy-4] with no argument process.env.IMAGE_DIGEST is used":
// several successive values, so neither a snapshot nor a cache passes.
test("[happy-4] successive process.env values are each picked up with no argument", async () => {
  const sequence: ReadonlyArray<readonly [string | undefined, string | undefined]> = [
    [DIGEST_B, DIGEST_B],
    [`  ${DIGEST_A}\n`, DIGEST_A],
    ["not-a-digest", undefined],
    [undefined, undefined],
    [digestOf("process-env"), digestOf("process-env")],
    [DIGEST_A, DIGEST_A],
  ];
  for (const [value, expected] of sequence) {
    await withProcessDigest(value, async () => {
      assert.equal(await resolveImageDigest(), expected, String(value));
    });
  }
});

// Extends "[happy-4] passing undefined explicitly also falls back to process.env".
test("[happy-4] passing undefined explicitly reads process.env, including when it is unset", async () => {
  await withProcessDigest(`\t${DIGEST_A} `, async () => {
    assert.equal(await resolveImageDigest(undefined), DIGEST_A);
  });
  await withProcessDigest(undefined, async () => {
    assert.equal(await resolveImageDigest(undefined), undefined);
  });
});

test("[happy-4] an explicit env argument is used instead of process.env", async () => {
  await withProcessDigest(DIGEST_A, async () => {
    assert.equal(await resolveImageDigest({ IMAGE_DIGEST: DIGEST_B }), DIGEST_B);
    assert.equal(await resolveImageDigest({}), undefined);
  });
});

// --- @happy 5 ---------------------------------------------------------------

// Extends "[happy-5] env is left unchanged after a padded value is trimmed":
// more values and more keys, including a missing and an undefined IMAGE_DIGEST.
test("[happy-5] env deep-equals its original for every kind of value", async () => {
  const cases: ReadonlyArray<readonly [() => NodeJS.ProcessEnv, string | undefined]> = [
    [() => ({ IMAGE_DIGEST: `\r\n${DIGEST_B}\t`, BUILD_SHA: "abc", PORT: "4000" }), DIGEST_B],
    [() => ({ IMAGE_DIGEST: DIGEST_A.toUpperCase(), BUILD_SHA: "abc" }), undefined],
    [() => ({ IMAGE_DIGEST: "   ", BUILD_SHA: "abc" }), undefined],
    [() => ({ IMAGE_DIGEST: `repo@${DIGEST_A}` }), undefined],
    [() => ({ IMAGE_DIGEST: undefined, BUILD_SHA: "abc" }), undefined],
    [() => ({ BUILD_SHA: "abc" }), undefined],
    [() => ({}), undefined],
  ];
  for (const [make, expected] of cases) {
    const env = make();
    assert.equal(await resolveImageDigest(env), expected);
    assert.deepEqual(env, make());
  }
});

// Extends "[happy-5] no write is attempted on env ...": frozen envs of every kind.
test("[happy-5] frozen envs of every kind resolve rather than reject", async () => {
  const cases: ReadonlyArray<readonly [NodeJS.ProcessEnv, string | undefined]> = [
    [Object.freeze({ IMAGE_DIGEST: DIGEST_B }), DIGEST_B],
    [Object.freeze({ IMAGE_DIGEST: `\n${DIGEST_B}\n` }), DIGEST_B],
    [Object.freeze({ IMAGE_DIGEST: "unknown" }), undefined],
    [Object.freeze({ IMAGE_DIGEST: "" }), undefined],
    [Object.freeze({ IMAGE_DIGEST: undefined }), undefined],
    [Object.freeze({}), undefined],
  ];
  for (const [env, expected] of cases) {
    const result = resolveImageDigest(env);
    await assert.doesNotReject(result);
    assert.equal(await result, expected);
  }
});

test("[happy-5] no write is attempted on env with a missing or undefined IMAGE_DIGEST", async () => {
  for (const target of [{}, { IMAGE_DIGEST: undefined }, { BUILD_SHA: DIGEST_A }]) {
    const { env, writes } = recordingEnv(target);
    assert.equal(await resolveImageDigest(env), undefined);
    assert.deepEqual(writes, []);
  }
});

test("[happy-5] a padded process.env value is left padded after the no-argument call", async () => {
  const padded = `  ${DIGEST_B}\n`;
  await withProcessDigest(padded, async () => {
    assert.equal(await resolveImageDigest(), DIGEST_B);
    assert.equal(process.env.IMAGE_DIGEST, padded);
  });
});

// --- @boundary 1 ------------------------------------------------------------

// Extends the three "[boundary-1]" tests: other combinations, one-sided
// padding, long runs, and digests other than DIGEST_A.
const paddings: ReadonlyArray<readonly [string, string, string]> = [
  ["leading newline", "\n", ""],
  ["leading space only", " ", ""],
  ["trailing tab only", "", "\t"],
  ["trailing CR only", "", "\r"],
  ["leading CRLF", "\r\n", ""],
  ["CRLF on both sides", "\r\n", "\r\n"],
  ["mixed runs", " \t\r\n \t", "\n\n \t\r "],
  ["two trailing newlines", "", "\n\n"],
  ["long runs", " \t".repeat(5_000), "\r\n".repeat(5_000)],
];

for (const [name, before, after] of paddings) {
  test(`[boundary-1] ${name} around DIGEST_B is trimmed`, async () => {
    assert.equal(
      await resolveImageDigest({ IMAGE_DIGEST: `${before}${DIGEST_B}${after}` }),
      DIGEST_B,
    );
  });
}

test("[boundary-1] padded computed digests resolve to the trimmed digest", async () => {
  for (let i = 0; i < 20; i += 1) {
    const digest = digestOf(`padded-${i}`);
    const value = `${" ".repeat(i)}${digest}${"\n".repeat(20 - i)}`;
    assert.equal(await resolveImageDigest({ IMAGE_DIGEST: value }), digest);
  }
});

// --- @boundary 2 ------------------------------------------------------------

// Extends the three "[boundary-2]" tests: other whitespace-only values.
const blanks: ReadonlyArray<readonly [string, string]> = [
  ["a tab", "\t"],
  ["a CR", "\r"],
  ["a CRLF", "\r\n"],
  ["mixed whitespace", " \t\r\n \t"],
  ["ten thousand spaces", " ".repeat(10_000)],
];

for (const [name, value] of blanks) {
  test(`[boundary-2] ${name} alone resolves, rather than rejects, to undefined`, async () => {
    const result = resolveImageDigest({ IMAGE_DIGEST: value, BUILD_SHA: DIGEST_A });
    await assert.doesNotReject(result);
    assert.equal(await result, undefined);
  });
}

test("[boundary-2] a blank IMAGE_DIGEST in process.env resolves to undefined", async () => {
  for (const value of ["", " ", "\n"]) {
    await withProcessDigest(value, async () => {
      assert.equal(await resolveImageDigest(), undefined);
    });
  }
});

test("[boundary-2] blank values write nothing to the console", async () => {
  const calls = await countConsoleCalls(async () => {
    for (const value of ["", "   ", "\n", "\t\r\n"]) {
      assert.equal(await resolveImageDigest({ IMAGE_DIGEST: value }), undefined);
    }
  });
  assert.equal(calls, 0);
});

// --- @boundary 3 ------------------------------------------------------------

// Extends the "[boundary-3]" look-alike tests: the same kinds of mistake with
// other values, plus look-alikes a regex without anchors, a lowercasing step,
// a prefix-adding step or an "after the @" step would accept.
const moreLookalikes: ReadonlyArray<readonly [string, string]> = [
  ["DIGEST_B fully uppercased", DIGEST_B.toUpperCase()],
  ["DIGEST_B with uppercase hex", `sha256:${HEX_B.toUpperCase()}`],
  ["a single uppercase hex character", `sha256:${HEX_A.slice(0, 63)}F`],
  ["mixed-case algorithm", `Sha256:${HEX_A}`],
  ["bare hex of DIGEST_B", HEX_B],
  ["padded bare hex", `  ${HEX_A}\n`],
  ["one hex character", "sha256:a"],
  ["128 hex characters", `sha256:${HEX_A}${HEX_B}`],
  ["a trailing non-hex character", `${DIGEST_A}x`],
  ["a leading character", `x${DIGEST_A}`],
  ["a tag after the digest", `${DIGEST_A}:latest`],
  ["a doubled prefix", `sha256:${DIGEST_A}`],
  ["a doubled colon", `sha256::${HEX_A}`],
  ["a dash instead of a colon", `sha256-${HEX_A}`],
  ["no colon", `sha256${HEX_A}`],
  ["letters past f", `sha256:${"z".repeat(64)}`],
  ["underscores", `sha256:${"_".repeat(64)}`],
  ["a 0x prefix on the hex", `sha256:0x${HEX_A.slice(2)}`],
  ["a real sha512 length", `sha512:${HEX_A}${HEX_B}`],
  ["sha384", `sha384:${HEX_A}${HEX_B.slice(0, 32)}`],
  ["a short reference to DIGEST_B", `repo@${DIGEST_B}`],
  ["a tagged reference with a digest", `repo:v1.4.2@${DIGEST_B}`],
  ["a bare @ before the digest", `@${DIGEST_A}`],
  ["a double-quoted digest", `"${DIGEST_A}"`],
  ["a single-quoted digest", `'${DIGEST_A}'`],
  ["a trailing NUL", `${DIGEST_A}\u0000`],
  ["the string undefined", "undefined"],
  ["the string null", "null"],
  ["the string latest", "latest"],
  ["a very long hex run", `sha256:${"a".repeat(1_000_000)}`],
];

for (const [name, value] of moreLookalikes) {
  test(`[boundary-3] ${name} resolves, rather than rejects, to undefined`, async () => {
    const result = resolveImageDigest({ IMAGE_DIGEST: value });
    await assert.doesNotReject(result);
    assert.equal(await result, undefined);
  });
}

test("[boundary-3] look-alikes padded with whitespace still resolve to undefined", async () => {
  for (const value of [
    `  ${DIGEST_A.toUpperCase()}\n`,
    `\t${HEX_A}\r\n`,
    ` sha256:${HEX_A.slice(1)} `,
    `\nrepo@${DIGEST_A}\n`,
  ]) {
    assert.equal(await resolveImageDigest({ IMAGE_DIGEST: value }), undefined);
  }
});

test("[boundary-3] a look-alike IMAGE_DIGEST is not replaced by a valid digest in another key", async () => {
  assert.equal(
    await resolveImageDigest({
      IMAGE_DIGEST: `sha256:${HEX_B.slice(1)}`,
      BUILD_SHA: DIGEST_A,
      IMAGE_DIGEST_SHA256: DIGEST_A,
    }),
    undefined,
  );
});

test("[boundary-3] look-alikes through process.env resolve to undefined", async () => {
  for (const value of [DIGEST_A.toUpperCase(), HEX_A, `repo@${DIGEST_A}`]) {
    await withProcessDigest(value, async () => {
      assert.equal(await resolveImageDigest(), undefined);
    });
  }
});

test("[boundary-3] the extra look-alikes write nothing to the console", async () => {
  const calls = await countConsoleCalls(async () => {
    for (const [, value] of moreLookalikes) {
      assert.equal(await resolveImageDigest({ IMAGE_DIGEST: value }), undefined);
    }
  });
  assert.equal(calls, 0);
});

// --- @unhappy 1 -------------------------------------------------------------

// Extends "[unhappy-1] a space inside the value ..." and "[unhappy-1] a newline
// inside the hex part ...": other whitespace, other places, and values where
// taking only the first token or the first line would leave a valid digest.
const inner: ReadonlyArray<readonly [string, string]> = [
  ["a tab after the colon", `sha256:\t${HEX_A}`],
  ["a space before the colon", `sha256 :${HEX_A}`],
  ["a space in the middle of the hex", `sha256:${HEX_A.slice(0, 32)} ${HEX_A.slice(32)}`],
  ["a tab in the middle of the hex", `sha256:${HEX_B.slice(0, 10)}\t${HEX_B.slice(10)}`],
  ["a CR in the middle of the hex", `sha256:${HEX_A.slice(0, 32)}\r${HEX_A.slice(32)}`],
  ["a CRLF in the middle of the hex", `sha256:${HEX_A.slice(0, 32)}\r\n${HEX_A.slice(32)}`],
  ["a no-break space in the hex", `sha256:${HEX_A.slice(0, 32)} ${HEX_A.slice(32)}`],
  ["two digests separated by a space", `${DIGEST_A} ${DIGEST_B}`],
  ["a digest then a word", `${DIGEST_A} latest`],
  ["a word then a digest", `latest ${DIGEST_A}`],
  ["two digests on two lines", `${DIGEST_A}\n${DIGEST_B}`],
  ["a digest then a second line", `${DIGEST_A}\ngarbage`],
  ["a first line then a digest", `garbage\n${DIGEST_A}`],
  ["padding around an inner space", `  sha256: ${HEX_A}\n`],
];

for (const [name, value] of inner) {
  test(`[unhappy-1] ${name} makes the value invalid`, async () => {
    const result = resolveImageDigest({ IMAGE_DIGEST: value });
    await assert.doesNotReject(result);
    assert.equal(await result, undefined);
  });
}

// --- @unhappy 2 -------------------------------------------------------------

// Extends "[unhappy-2] an empty env resolves to undefined" and "[unhappy-2] a
// differently-cased key ...": other keys that might be mistaken for it.
test("[unhappy-2] keys resembling IMAGE_DIGEST do not count as it", async () => {
  assert.equal(
    await resolveImageDigest({
      Image_Digest: DIGEST_A,
      IMAGE_DIGEST_SHA256: DIGEST_A,
      " IMAGE_DIGEST": DIGEST_A,
      "IMAGE_DIGEST ": DIGEST_A,
      IMAGEDIGEST: DIGEST_B,
      IMAGE_ID: DIGEST_B,
      BUILD_IMAGE_DIGEST: DIGEST_B,
    }),
    undefined,
  );
});

test("[unhappy-2] an unset IMAGE_DIGEST with an ECS metadata URI makes no fetch", async () => {
  const calls = await countFetchCalls(async () => {
    const result = resolveImageDigest({
      ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4/abc",
    });
    await assert.doesNotReject(result);
    assert.equal(await result, undefined);
  });
  assert.equal(calls, 0);
});

test("[unhappy-2] an unset IMAGE_DIGEST in process.env resolves to undefined", async () => {
  await withProcessDigest(undefined, async () => {
    const result = resolveImageDigest();
    await assert.doesNotReject(result);
    assert.equal(await result, undefined);
  });
});

test("[unhappy-2] an unset IMAGE_DIGEST writes nothing to the console", async () => {
  const calls = await countConsoleCalls(async () => {
    assert.equal(await resolveImageDigest({}), undefined);
    assert.equal(await resolveImageDigest({ BUILD_SHA: "abc" }), undefined);
  });
  assert.equal(calls, 0);
});

// --- @unhappy 3 -------------------------------------------------------------

// Extends "[unhappy-3] an explicitly undefined IMAGE_DIGEST ...": alongside
// lookalike keys, in a frozen env, and read exactly once.
test("[unhappy-3] an explicitly undefined IMAGE_DIGEST is read once and resolves to undefined", async () => {
  const { env, reads, writes } = recordingEnv({
    IMAGE_DIGEST: undefined,
    image_digest: DIGEST_A,
    IMAGE_DIGEST_SHA256: DIGEST_B,
  });
  const result = resolveImageDigest(env);
  await assert.doesNotReject(result);
  assert.equal(await result, undefined);
  assert.deepEqual(reads, ["IMAGE_DIGEST"]);
  assert.deepEqual(writes, []);
});

test("[unhappy-3] an explicitly undefined IMAGE_DIGEST in a frozen env resolves to undefined", async () => {
  const env = Object.freeze({ IMAGE_DIGEST: undefined, BUILD_SHA: DIGEST_A });
  const result = resolveImageDigest(env);
  await assert.doesNotReject(result);
  assert.equal(await result, undefined);
  assert.deepEqual(env, { IMAGE_DIGEST: undefined, BUILD_SHA: DIGEST_A });
});
