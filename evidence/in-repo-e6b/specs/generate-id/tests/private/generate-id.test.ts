import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { generateId, ID_PREFIXES, type IdPrefix } from "../../src/mapping.js";

/**
 * `generateId(prefix)` is `${prefix}_${crypto.randomUUID()}`. Every test
 * replaces `crypto.randomUUID` with a fixed sequence of valid lowercase v4
 * UUIDs, so ids are deterministic and exact.
 */

const UUID_V4 =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

const ALL_PREFIXES: IdPrefix[] = ["todo", "jrc", "jrb", "jri", "brn", "bpr"];

function idPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}_${UUID_V4}$`);
}

type Uuid = ReturnType<typeof crypto.randomUUID>;

/**
 * The n-th fixed UUID: a valid, lowercase RFC 4122 version 4 value whose
 * digits include the letters a-f, so a suffix that is not the UUID verbatim
 * (re-cased, re-formatted, counter-based) is caught.
 */
function fixedUuid(n: number): Uuid {
  return `9f1c2b3a-4d5e-4f60-b7a8-${n.toString(16).padStart(12, "0")}` as Uuid;
}

/** Makes `crypto.randomUUID` return fixedUuid(1), fixedUuid(2), … */
function useFixedUuids(t: TestContext) {
  let next = 0;
  return t.mock.method(globalThis.crypto, "randomUUID", (): Uuid => {
    next += 1;
    return fixedUuid(next);
  });
}

function assertRejected(input: unknown, message: string): void {
  assert.throws(
    () => generateId(input as IdPrefix),
    (error: unknown) => {
      assert.ok(error instanceof RangeError, `${message}: not a RangeError`);
      assert.equal(error.message, message);
      return true;
    },
  );
}

// ---- ID_PREFIXES ------------------------------------------------------------

// Extends "[boundary-1] an id of any prefix splits back into that prefix at
// its first underscore": reverse order, exactly two parts, exact suffix.
test("[boundary-1] ids generated in reverse prefix order split into exactly the prefix and the uuid", (t) => {
  useFixedUuids(t);
  const reversed = [...ID_PREFIXES].reverse();
  reversed.forEach((prefix, i) => {
    const id = generateId(prefix);
    const parts = id.split("_");
    assert.equal(parts.length, 2, id);
    assert.equal(parts[0], prefix);
    assert.equal(parts[1], fixedUuid(i + 1));
  });
});

// Extends "[boundary-1] every prefix is lowercase letters only and no two are
// equal": the prefixes read back from generated ids are distinct, lowercase
// and are the listed entries in their listed order.
test("[boundary-1] prefixes recovered from generated ids are distinct lowercase entries of ID_PREFIXES", (t) => {
  useFixedUuids(t);
  const recovered = ID_PREFIXES.map((prefix) => {
    const id = generateId(prefix);
    return id.slice(0, id.indexOf("_"));
  });
  for (const prefix of recovered) {
    assert.match(prefix, /^[a-z]+$/);
  }
  assert.equal(new Set(recovered).size, 6);
  assert.deepEqual(recovered, ALL_PREFIXES);
});

// ---- generateId -------------------------------------------------------------

// Extends "[happy-2] each listed prefix produces <prefix>_<uuid v4> of the
// expected length": every prefix, in reverse and repeated, exact value.
test("[happy-2] every prefix, called in reverse order twice over, yields exactly prefix_ plus the next uuid", (t) => {
  const randomUUID = useFixedUuids(t);
  const order = [...ALL_PREFIXES].reverse();
  const calls = [...order, ...order];
  calls.forEach((prefix, i) => {
    const id = generateId(prefix);
    assert.equal(id, `${prefix}_${fixedUuid(i + 1)}`);
    assert.match(id, idPattern(prefix));
    assert.equal(id.length, prefix === "todo" ? 41 : 40);
  });
  assert.equal(randomUUID.mock.callCount(), 12);
});

// Extends "[happy-2] the id is the prefix, one underscore, then
// crypto.randomUUID() verbatim": the prefixes the public test skips.
test("[happy-2] jrb, jri and brn ids carry their own prefix, not a default or a neighbour's", (t) => {
  useFixedUuids(t);
  assert.equal(generateId("jrb"), `jrb_${fixedUuid(1)}`);
  assert.equal(generateId("jri"), `jri_${fixedUuid(2)}`);
  assert.equal(generateId("brn"), `brn_${fixedUuid(3)}`);
  assert.equal(generateId("todo"), `todo_${fixedUuid(4)}`);
});

// Shortcut: a suffix not taken from crypto.randomUUID verbatim.
test("[happy-2] the suffix is whatever crypto.randomUUID returns, unchanged", (t) => {
  const uuids = [
    "c0ffee00-beef-4abc-9def-0123456789ab",
    "ffffffff-ffff-4fff-bfff-ffffffffffff",
    "00000000-0000-4000-8000-000000000000",
  ] as Uuid[];
  let next = 0;
  const randomUUID = t.mock.method(
    globalThis.crypto,
    "randomUUID",
    (): Uuid => uuids[next++] as Uuid,
  );
  assert.equal(generateId("bpr"), "bpr_c0ffee00-beef-4abc-9def-0123456789ab");
  assert.equal(generateId("jrc"), "jrc_ffffffff-ffff-4fff-bfff-ffffffffffff");
  assert.equal(generateId("brn"), "brn_00000000-0000-4000-8000-000000000000");
  assert.equal(randomUUID.mock.callCount(), 3);
});

// Extends "[happy-3] with no argument the prefix is todo": the default does
// not follow the most recently used prefix.
test("[happy-3] generateId() returns a todo id even right after calls with other prefixes", (t) => {
  useFixedUuids(t);
  assert.equal(generateId("bpr"), `bpr_${fixedUuid(1)}`);
  assert.equal(generateId(), `todo_${fixedUuid(2)}`);
  assert.equal(generateId("jri"), `jri_${fixedUuid(3)}`);
  assert.equal(generateId("jrc"), `jrc_${fixedUuid(4)}`);
  assert.equal(generateId(), `todo_${fixedUuid(5)}`);
});

// Extends "[happy-3] with no argument the id has the same shape as
// generateId(\"todo\")": interleaved with every prefix.
test("[happy-3] generateId() interleaved with each prefix always matches todo_UUID_V4", (t) => {
  useFixedUuids(t);
  for (const prefix of ALL_PREFIXES) {
    assert.match(generateId(prefix), idPattern(prefix));
    assert.match(generateId(), idPattern("todo"));
  }
});

// Extends "[boundary-3] an explicit undefined falls back to the todo prefix":
// after other prefixes, and via a spread of an empty argument list.
test("[boundary-3] an explicit undefined after other prefixes still yields a todo id", (t) => {
  const randomUUID = useFixedUuids(t);
  assert.equal(generateId("brn"), `brn_${fixedUuid(1)}`);
  assert.equal(generateId(undefined), `todo_${fixedUuid(2)}`);
  assert.equal(generateId("jrb"), `jrb_${fixedUuid(3)}`);
  assert.equal(generateId(undefined), `todo_${fixedUuid(4)}`);
  assert.equal(randomUUID.mock.callCount(), 4);
});

test("[boundary-3] undefined entries mapped through generateId fall back to todo beside listed prefixes", (t) => {
  useFixedUuids(t);
  const inputs: Array<IdPrefix | undefined> = ["jri", undefined, "bpr", undefined];
  const ids = inputs.map((prefix) => generateId(prefix));
  assert.deepEqual(ids, [
    `jri_${fixedUuid(1)}`,
    `todo_${fixedUuid(2)}`,
    `bpr_${fixedUuid(3)}`,
    `todo_${fixedUuid(4)}`,
  ]);
});

// Extends "[happy-4] 1000 calls to generateId(\"jri\") are pairwise distinct
// and start with jri_": every id exact, one uuid per call, more calls.
test("[happy-4] 2000 calls to generateId(\"jri\") are each jri_ plus their own uuid", (t) => {
  const randomUUID = useFixedUuids(t);
  const ids = Array.from({ length: 2000 }, () => generateId("jri"));
  assert.equal(new Set(ids).size, 2000);
  ids.forEach((id, i) => {
    assert.equal(id, `jri_${fixedUuid(i + 1)}`);
  });
  assert.equal(randomUUID.mock.callCount(), 2000);
});

// Extends "[happy-4] two consecutive calls with the same prefix already
// differ": other prefixes than jri.
test("[happy-4] repeated calls with each other prefix are distinct and keep the prefix", (t) => {
  useFixedUuids(t);
  for (const prefix of ["jrc", "jrb", "brn", "bpr"] as IdPrefix[]) {
    const ids = Array.from({ length: 250 }, () => generateId(prefix));
    assert.equal(new Set(ids).size, 250, prefix);
    for (const id of ids) {
      assert.equal(id.startsWith(`${prefix}_`), true, id);
    }
  }
});

// Extends "[boundary-4] 100 ids for each of the six prefixes are 600 distinct
// ids with distinct suffixes": reverse order, 200 each, exact suffixes.
test("[boundary-4] 200 ids per prefix in reverse prefix order are 1200 distinct ids with distinct suffixes", (t) => {
  useFixedUuids(t);
  const reversed = [...ALL_PREFIXES].reverse();
  const ids = reversed.flatMap((prefix) =>
    Array.from({ length: 200 }, () => generateId(prefix)),
  );
  assert.equal(ids.length, 1200);
  assert.equal(new Set(ids).size, 1200);
  const suffixes = ids.map((id) => id.slice(id.indexOf("_") + 1));
  assert.equal(new Set(suffixes).size, 1200);
  ids.forEach((id, i) => {
    const prefix = reversed[Math.floor(i / 200)] as IdPrefix;
    assert.equal(id, `${prefix}_${fixedUuid(i + 1)}`);
  });
});

// Shortcut: a suffix keyed per prefix (e.g. a counter per prefix) collides
// across prefixes; the suffix must come from the shared uuid source.
test("[boundary-4] the first id of each prefix does not reuse another prefix's suffix", (t) => {
  useFixedUuids(t);
  const firsts = ALL_PREFIXES.map((prefix) => generateId(prefix));
  const suffixes = firsts.map((id) => id.slice(id.indexOf("_") + 1));
  assert.equal(new Set(suffixes).size, 6);
  firsts.forEach((id, i) => {
    assert.equal(id.slice(0, id.indexOf("_")), ALL_PREFIXES[i]);
  });
});

// ---- rejected prefixes ------------------------------------------------------

// Extends "[unhappy-1] a string that is not strictly one of the six prefixes
// throws a RangeError": strings a prefix/suffix/substring/trim/case shortcut
// would accept.
test("[unhappy-1] near-miss strings around the listed prefixes are rejected with their JSON", (t) => {
  const randomUUID = useFixedUuids(t);
  for (const input of [
    "tod",
    "t",
    "jr",
    "todojrc",
    "xjrc",
    "_todo",
    "todo ",
    "jri\t",
    "JRI",
    "bPr",
    "brn_",
    "jrb-",
    "todo,jrc",
    "undefined",
    "null",
  ]) {
    assertRejected(input, `Unknown id prefix: ${JSON.stringify(input)}`);
  }
  assert.equal(randomUUID.mock.callCount(), 0);
});

// Shortcut: building the message as `"${prefix}"` rather than with
// JSON.stringify gets escaping wrong.
test("[unhappy-1] strings that need JSON escaping appear escaped in the message", (t) => {
  const randomUUID = useFixedUuids(t);
  assertRejected("todo\n", 'Unknown id prefix: "todo\\n"');
  assertRejected('jr"c', 'Unknown id prefix: "jr\\"c"');
  assertRejected("brn\\", 'Unknown id prefix: "brn\\\\"');
  assertRejected("tоdo", 'Unknown id prefix: "tоdo"');
  assert.equal(randomUUID.mock.callCount(), 0);
});

// Shortcut: a falsy check (`prefix || "todo"`) treats these as the default.
test("[unhappy-1] falsy non-undefined values are rejected, not defaulted to todo", (t) => {
  const randomUUID = useFixedUuids(t);
  assertRejected(false, "Unknown id prefix: false");
  assertRejected(0, "Unknown id prefix: 0");
  assertRejected(Number.NaN, "Unknown id prefix: null");
  assertRejected(null, "Unknown id prefix: null");
  assertRejected("", 'Unknown id prefix: ""');
  assert.equal(randomUUID.mock.callCount(), 0);
});

// Shortcut: loose equality or coercion to string (`==`, `String(prefix)`,
// template literals) accepts values that are not strictly equal.
test("[unhappy-1] values that coerce to a listed prefix are rejected because they are not ===", (t) => {
  const randomUUID = useFixedUuids(t);
  // eslint-disable-next-line no-new-wrappers
  assertRejected(new String("todo"), 'Unknown id prefix: "todo"');
  assertRejected(["jrc"], 'Unknown id prefix: ["jrc"]');
  assertRejected({ toString: () => "bpr" }, "Unknown id prefix: {}");
  assertRejected(
    { valueOf: () => "jri", toString: () => "jri" },
    "Unknown id prefix: {}",
  );
  assert.equal(randomUUID.mock.callCount(), 0);
});

test("[unhappy-1] other numbers, booleans and objects are rejected with their JSON", (t) => {
  const randomUUID = useFixedUuids(t);
  assertRejected(true, "Unknown id prefix: true");
  assertRejected(-1, "Unknown id prefix: -1");
  assertRejected(4.5, "Unknown id prefix: 4.5");
  assertRejected(Number.POSITIVE_INFINITY, "Unknown id prefix: null");
  assertRejected({ prefix: "todo" }, 'Unknown id prefix: {"prefix":"todo"}');
  assertRejected([], "Unknown id prefix: []");
  assert.equal(randomUUID.mock.callCount(), 0);
});

// JSON.stringify returns undefined for these, so the message ends in
// "undefined"; a template literal over the raw symbol would throw TypeError.
test("[unhappy-1] a symbol or a function is rejected with JSON.stringify's undefined in the message", (t) => {
  const randomUUID = useFixedUuids(t);
  assertRejected(Symbol("todo"), "Unknown id prefix: undefined");
  assertRejected(() => "todo", "Unknown id prefix: undefined");
  assert.equal(randomUUID.mock.callCount(), 0);
});

// "Generates nothing": a rejected call consumes no uuid, so the next valid
// call gets the first one.
test("[unhappy-1] a rejected call consumes no uuid and does not disturb the next valid call", (t) => {
  const randomUUID = useFixedUuids(t);
  assertRejected("user", 'Unknown id prefix: "user"');
  assertRejected("email", 'Unknown id prefix: "email"');
  assert.equal(randomUUID.mock.callCount(), 0);
  assert.equal(generateId("jrc"), `jrc_${fixedUuid(1)}`);
  assertRejected("TODO", 'Unknown id prefix: "TODO"');
  assert.equal(generateId(), `todo_${fixedUuid(2)}`);
  assert.equal(randomUUID.mock.callCount(), 2);
});

// ---- overlapping callers ----------------------------------------------------

// Extends "[concurrency-1] 50 interleaved async tasks of 20
// generateId(\"brn\") calls get 1000 distinct ids": every id exact, and the
// suffixes are exactly the uuids handed out.
test("[concurrency-1] 50 async tasks of 20 brn calls use each uuid exactly once", async (t) => {
  const randomUUID = useFixedUuids(t);
  const batches = await Promise.all(
    Array.from({ length: 50 }, async () => {
      await Promise.resolve();
      return Array.from({ length: 20 }, () => generateId("brn"));
    }),
  );
  const ids = batches.flat().sort();
  const expected = Array.from(
    { length: 1000 },
    (_, i) => `brn_${fixedUuid(i + 1)}`,
  ).sort();
  assert.deepEqual(ids, expected);
  assert.equal(randomUUID.mock.callCount(), 1000);
});

// Extends "[concurrency-1] tasks that yield between every call each keep
// their own prefix and id": all six prefixes, uneven yields, and rejected
// calls from other tasks mixed in.
test("[concurrency-1] tasks over all six prefixes with uneven yields and rejected neighbours keep their own ids", async (t) => {
  const randomUUID = useFixedUuids(t);
  const batches = await Promise.all(
    Array.from({ length: 60 }, async (_, task) => {
      const prefix = ALL_PREFIXES[task % 6] as IdPrefix;
      const ids: string[] = [];
      for (let call = 0; call < 20; call += 1) {
        for (let k = 0; k < (task + call) % 4; k += 1) {
          await Promise.resolve();
        }
        if ((task + call) % 7 === 0) {
          assertRejected("brnx", 'Unknown id prefix: "brnx"');
        }
        ids.push(generateId(prefix));
      }
      return { prefix, ids };
    }),
  );
  const all = batches.flatMap((batch) => batch.ids);
  assert.equal(all.length, 1200);
  assert.equal(new Set(all).size, 1200);
  const suffixes = new Set(all.map((id) => id.slice(id.indexOf("_") + 1)));
  assert.equal(suffixes.size, 1200);
  for (let n = 1; n <= 1200; n += 1) {
    assert.equal(suffixes.has(fixedUuid(n)), true, `uuid ${n}`);
  }
  for (const { prefix, ids } of batches) {
    for (const id of ids) {
      assert.match(id, idPattern(prefix));
    }
  }
  assert.equal(randomUUID.mock.callCount(), 1200);
});
