import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import {
  generateId,
  ID_PREFIXES,
  newTodoRow,
  rowToTodo,
  type IdPrefix,
} from "../src/mapping.js";

/**
 * `generateId(prefix)` is `${prefix}_${crypto.randomUUID()}`. Every test
 * replaces `crypto.randomUUID` with a fixed sequence of valid lowercase v4
 * UUIDs, so ids are deterministic and exact.
 */

const UUID_V4 =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function idPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}_${UUID_V4}$`);
}

type Uuid = ReturnType<typeof crypto.randomUUID>;

/** The n-th fixed UUID: a valid, lowercase RFC 4122 version 4 value. */
function fixedUuid(n: number): Uuid {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}` as Uuid;
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

test("[happy-1] ID_PREFIXES deep-equals the six prefixes in declaration order", () => {
  assert.deepEqual(ID_PREFIXES, ["todo", "jrc", "jrb", "jri", "brn", "bpr"]);
  assert.equal(ID_PREFIXES.length, 6);
});

test("[happy-1] ID_PREFIXES is a plain array starting at todo and ending at bpr", () => {
  assert.equal(Array.isArray(ID_PREFIXES), true);
  assert.equal(ID_PREFIXES[0], "todo");
  assert.equal(ID_PREFIXES[5], "bpr");
});

test("[boundary-1] every prefix is lowercase letters only and no two are equal", () => {
  for (const prefix of ID_PREFIXES) {
    assert.match(prefix, /^[a-z]+$/);
  }
  assert.equal(new Set(ID_PREFIXES).size, ID_PREFIXES.length);
});

test("[boundary-1] an id of any prefix splits back into that prefix at its first underscore", (t) => {
  useFixedUuids(t);
  for (const prefix of ID_PREFIXES) {
    const id = generateId(prefix);
    const cut = id.indexOf("_");
    assert.equal(id.slice(0, cut), prefix);
    assert.match(id.slice(cut + 1), new RegExp(`^${UUID_V4}$`));
  }
});

test("[boundary-2] ID_PREFIXES is not frozen", () => {
  assert.equal(Object.isFrozen(ID_PREFIXES), false);
});

test("[boundary-2] ID_PREFIXES is exported as an ordinary extensible array", () => {
  assert.equal(Object.isExtensible(ID_PREFIXES), true);
  assert.equal(Object.isSealed(ID_PREFIXES), false);
});

// ---- generateId -------------------------------------------------------------

test("[happy-2] each listed prefix produces <prefix>_<uuid v4> of the expected length", (t) => {
  useFixedUuids(t);
  const lengths: Record<IdPrefix, number> = {
    todo: 41,
    jrc: 40,
    jrb: 40,
    jri: 40,
    brn: 40,
    bpr: 40,
  };
  for (const prefix of ID_PREFIXES) {
    const id = generateId(prefix);
    assert.match(id, idPattern(prefix));
    assert.equal(id.length, lengths[prefix]);
  }
});

test("[happy-2] the id is the prefix, one underscore, then crypto.randomUUID() verbatim", (t) => {
  const randomUUID = useFixedUuids(t);
  assert.equal(generateId("jrc"), `jrc_${fixedUuid(1)}`);
  assert.equal(generateId("bpr"), `bpr_${fixedUuid(2)}`);
  assert.equal(randomUUID.mock.callCount(), 2);
});

test("[happy-3] with no argument the prefix is todo", (t) => {
  useFixedUuids(t);
  const id = generateId();
  assert.match(id, idPattern("todo"));
  assert.equal(id, `todo_${fixedUuid(1)}`);
});

test("[happy-3] with no argument the id has the same shape as generateId(\"todo\")", (t) => {
  useFixedUuids(t);
  const implicit = generateId();
  const explicit = generateId("todo");
  assert.equal(implicit.length, 41);
  assert.equal(implicit.slice(0, 5), explicit.slice(0, 5));
  assert.equal(implicit.slice(0, 5), "todo_");
});

test("[boundary-3] an explicit undefined falls back to the todo prefix", (t) => {
  useFixedUuids(t);
  const id = generateId(undefined);
  assert.match(id, idPattern("todo"));
  assert.equal(id, `todo_${fixedUuid(1)}`);
});

test("[boundary-3] an explicit undefined is not rejected and generates one uuid", (t) => {
  const randomUUID = useFixedUuids(t);
  assert.doesNotThrow(() => generateId(undefined));
  assert.equal(randomUUID.mock.callCount(), 1);
});

test("[happy-4] 1000 calls to generateId(\"jri\") are pairwise distinct and start with jri_", (t) => {
  useFixedUuids(t);
  const ids = Array.from({ length: 1000 }, () => generateId("jri"));
  assert.equal(new Set(ids).size, 1000);
  for (const id of ids) {
    assert.equal(id.startsWith("jri_"), true);
  }
});

test("[happy-4] two consecutive calls with the same prefix already differ", (t) => {
  const randomUUID = useFixedUuids(t);
  const first = generateId("jri");
  const second = generateId("jri");
  assert.notEqual(first, second);
  assert.equal(randomUUID.mock.callCount(), 2);
});

test("[boundary-4] 100 ids for each of the six prefixes are 600 distinct ids with distinct suffixes", (t) => {
  useFixedUuids(t);
  const ids = ID_PREFIXES.flatMap((prefix) =>
    Array.from({ length: 100 }, () => generateId(prefix)),
  );
  assert.equal(ids.length, 600);
  assert.equal(new Set(ids).size, 600);
  const suffixes = ids.map((id) => id.slice(id.indexOf("_") + 1));
  assert.equal(new Set(suffixes).size, 600);
});

test("[boundary-4] ids requested alternately across prefixes never share a suffix", (t) => {
  useFixedUuids(t);
  const ids: string[] = [];
  for (let round = 0; round < 100; round += 1) {
    for (const prefix of ID_PREFIXES) {
      const id = generateId(prefix);
      assert.equal(id.startsWith(`${prefix}_`), true);
      ids.push(id);
    }
  }
  const suffixes = ids.map((id) => id.slice(id.indexOf("_") + 1));
  assert.equal(new Set(suffixes).size, 600);
});

// ---- rejected prefixes ------------------------------------------------------

test("[unhappy-1] a string that is not strictly one of the six prefixes throws a RangeError", (t) => {
  const randomUUID = useFixedUuids(t);
  assertRejected("user", 'Unknown id prefix: "user"');
  assertRejected("", 'Unknown id prefix: ""');
  assertRejected("TODO", 'Unknown id prefix: "TODO"');
  assertRejected("Jrc", 'Unknown id prefix: "Jrc"');
  assertRejected(" todo", 'Unknown id prefix: " todo"');
  assertRejected("todo_", 'Unknown id prefix: "todo_"');
  assertRejected("email", 'Unknown id prefix: "email"');
  assert.equal(randomUUID.mock.callCount(), 0);
});

test("[unhappy-1] null and a number are rejected with their JSON in the message", (t) => {
  const randomUUID = useFixedUuids(t);
  assertRejected(null, "Unknown id prefix: null");
  assertRejected(42, "Unknown id prefix: 42");
  assert.equal(randomUUID.mock.callCount(), 0);
});

// ---- overlapping callers ----------------------------------------------------

test("[concurrency-1] 50 interleaved async tasks of 20 generateId(\"brn\") calls get 1000 distinct ids", async (t) => {
  useFixedUuids(t);
  const batches = await Promise.all(
    Array.from({ length: 50 }, async () => {
      await Promise.resolve();
      return Array.from({ length: 20 }, () => generateId("brn"));
    }),
  );
  const ids = batches.flat();
  assert.equal(ids.length, 1000);
  assert.equal(new Set(ids).size, 1000);
  for (const id of ids) {
    assert.match(id, idPattern("brn"));
  }
});

test("[concurrency-1] tasks that yield between every call each keep their own prefix and id", async (t) => {
  useFixedUuids(t);
  const prefixes: IdPrefix[] = ["brn", "jrc"];
  const batches = await Promise.all(
    Array.from({ length: 50 }, async (_, task) => {
      const prefix = prefixes[task % 2] ?? "brn";
      const ids: string[] = [];
      for (let call = 0; call < 20; call += 1) {
        await Promise.resolve();
        ids.push(generateId(prefix));
      }
      return { prefix, ids };
    }),
  );
  const all = batches.flatMap((batch) => batch.ids);
  assert.equal(new Set(all).size, 1000);
  for (const { prefix, ids } of batches) {
    for (const id of ids) {
      assert.match(id, idPattern(prefix));
    }
  }
});

// ---- newTodoRow and rowToTodo -----------------------------------------------

test("[happy-5] newTodoRow defaults to a todo-prefixed id and keeps its other fields", (t) => {
  useFixedUuids(t);
  const row = newTodoRow("user_1", "buy milk");
  assert.match(String(row.id), idPattern("todo"));
  assert.equal(row.userId, "user_1");
  assert.equal(row.title, "buy milk");
  assert.equal(row.done, false);
});

test("[happy-5] newTodoRow's default id is generateId() with the todo prefix", (t) => {
  const randomUUID = useFixedUuids(t);
  assert.equal(newTodoRow("user_1", "buy milk").id, `todo_${fixedUuid(1)}`);
  assert.equal(randomUUID.mock.callCount(), 1);
});

test("[happy-6] newTodoRow uses the id it is given verbatim", () => {
  assert.equal(newTodoRow("user_1", "buy milk", "jri_custom").id, "jri_custom");
});

test("[happy-6] newTodoRow does not check a given id's prefix or generate one", (t) => {
  const randomUUID = useFixedUuids(t);
  assert.equal(newTodoRow("user_1", "buy milk", "user_custom").id, "user_custom");
  assert.equal(randomUUID.mock.callCount(), 0);
});

test("[happy-7] rowToTodo maps a row to the domain todo", () => {
  assert.deepEqual(
    rowToTodo({
      id: "todo_1",
      userId: "user_1",
      title: "write tests",
      done: false,
      createdAt: new Date("2026-09-16T00:00:00.000Z"),
    }),
    {
      id: "todo_1",
      title: "write tests",
      done: false,
      createdAt: "2026-09-16T00:00:00.000Z",
    },
  );
});

test("[happy-7] rowToTodo keeps milliseconds and done = true", () => {
  assert.deepEqual(
    rowToTodo({
      id: "jri_1",
      userId: "user_1",
      title: "last moment",
      done: true,
      createdAt: new Date("2026-09-16T23:59:59.999Z"),
    }),
    {
      id: "jri_1",
      title: "last moment",
      done: true,
      createdAt: "2026-09-16T23:59:59.999Z",
    },
  );
});
