import assert from "node:assert/strict";
import { test } from "node:test";

import * as root from "../src/index.js";
import {
  generateId,
  ID_PREFIXES,
  type IdPrefix,
  newTodoRow,
  rowToTodo,
} from "../src/mapping.js";

const UUID_V4 =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_V4_ONLY = new RegExp(`^${UUID_V4}$`);

function idPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}_${UUID_V4}$`);
}

/** Everything after the first "_". */
function suffixOf(id: string): string {
  return id.slice(id.indexOf("_") + 1);
}

// ---- ID_PREFIXES ------------------------------------------------------------

test("[happy-1] ID_PREFIXES holds exactly the six prefixes in declaration order", () => {
  assert.deepEqual([...ID_PREFIXES], ["todo", "jrc", "jrb", "jri", "brn", "bpr"]);
  assert.equal(ID_PREFIXES.length, 6);
});

test("[happy-1] ID_PREFIXES starts with the default prefix todo and ends with bpr", () => {
  assert.equal(ID_PREFIXES[0], "todo");
  assert.equal(ID_PREFIXES[ID_PREFIXES.length - 1], "bpr");
  assert.equal((ID_PREFIXES as readonly string[])[6], undefined);
});

test("[boundary-1] every prefix is lowercase letters only and none repeats", () => {
  for (const prefix of ID_PREFIXES) {
    assert.match(prefix, /^[a-z]+$/);
  }
  assert.equal(new Set(ID_PREFIXES).size, ID_PREFIXES.length);
});

test("[boundary-1] every generated id splits at its first underscore back into its prefix", () => {
  for (const prefix of ID_PREFIXES) {
    const id = generateId(prefix);
    assert.equal(id.indexOf("_"), prefix.length);
    assert.equal(id.slice(0, id.indexOf("_")), prefix);
    assert.match(suffixOf(id), UUID_V4_ONLY);
  }
});

test("[boundary-2] ID_PREFIXES is not frozen", () => {
  assert.equal(Object.isFrozen(ID_PREFIXES), false);
});

test("[boundary-2] ID_PREFIXES is a plain extensible array as declared", () => {
  assert.equal(Array.isArray(ID_PREFIXES), true);
  assert.equal(Object.isExtensible(ID_PREFIXES), true);
});

// `src/index.ts` is not part of the fixed interface, so its new export is read
// untyped.
const rootExports = root as unknown as Record<string, unknown>;

test("[happy-2] the package root re-exports the same ID_PREFIXES object", () => {
  assert.equal(rootExports.ID_PREFIXES, ID_PREFIXES);
});

test("[happy-2] the package root's generateId is the same function as mapping's", () => {
  assert.equal(root.generateId, generateId);
  const prefixes = rootExports.ID_PREFIXES as readonly IdPrefix[];
  assert.equal(prefixes[3], "jri");
  assert.match(root.generateId(prefixes[3]), idPattern("jri"));
});

// ---- generateId with a listed prefix ----------------------------------------

test("[happy-3] each listed prefix produces an id carrying that prefix", () => {
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

test("[happy-3] the uuid part is exactly 36 lowercase characters for every prefix", () => {
  for (const prefix of ID_PREFIXES) {
    const id = generateId(prefix);
    const uuid = id.slice(prefix.length + 1);
    assert.equal(uuid.length, 36);
    assert.equal(uuid, uuid.toLowerCase());
    assert.equal(id.length, prefix.length + 1 + 36);
  }
});

test("[happy-4] generateId with no argument uses the todo prefix", () => {
  assert.match(generateId(), idPattern("todo"));
});

test("[happy-4] generateId() and generateId of the first listed prefix share the todo shape but differ", () => {
  const implicit = generateId();
  const explicit = generateId(ID_PREFIXES[0]);
  assert.match(implicit, idPattern("todo"));
  assert.match(explicit, idPattern("todo"));
  assert.notEqual(implicit, explicit);
});

test("[boundary-3] generateId(undefined) falls back to the todo prefix", () => {
  assert.match(generateId(undefined), idPattern("todo"));
});

test("[boundary-3] a missing optional prefix property falls back to the todo prefix", () => {
  const options: { prefix?: IdPrefix } = {};
  assert.match(generateId(options.prefix), idPattern("todo"));
});

test("[happy-5] 1000 calls to generateId(jri) are pairwise distinct and jri-prefixed", () => {
  const ids = Array.from({ length: 1000 }, () => generateId("jri"));
  assert.equal(new Set(ids).size, 1000);
  for (const id of ids) {
    assert.equal(id.startsWith("jri_"), true);
  }
});

test("[happy-5] two consecutive calls with the same prefix differ", () => {
  const first = generateId("jri");
  const second = generateId("jri");
  assert.notEqual(first, second);
  assert.notEqual(suffixOf(first), suffixOf(second));
});

test("[boundary-4] 100 ids per listed prefix are pairwise distinct, and so are their suffixes", () => {
  const ids = ID_PREFIXES.flatMap((prefix) =>
    Array.from({ length: 100 }, () => generateId(prefix)),
  );
  assert.equal(ids.length, 600);
  assert.equal(new Set(ids).size, 600);
  assert.equal(new Set(ids.map(suffixOf)).size, 600);
});

test("[boundary-4] one id per listed prefix gives six distinct uuid suffixes", () => {
  const ids = ID_PREFIXES.map((prefix) => generateId(prefix));
  ids.forEach((id, i) => assert.match(id, idPattern(ID_PREFIXES[i]!)));
  const suffixes = ids.map(suffixOf);
  for (const suffix of suffixes) {
    assert.match(suffix, UUID_V4_ONLY);
  }
  assert.equal(new Set(suffixes).size, 6);
});

// ---- generateId with an unlisted value --------------------------------------

test("[unhappy-1] a value cast past IdPrefix is stringified into the id without an error", () => {
  const cases: Array<[unknown, string]> = [
    ["user", "user_"],
    ["", "_"],
    ["TODO", "TODO_"],
    ["Jrc", "Jrc_"],
    [" todo", " todo_"],
    ["todo_", "todo__"],
    ["email", "email_"],
    [null, "null_"],
    [42, "42_"],
  ];
  for (const [input, start] of cases) {
    let id = "";
    assert.doesNotThrow(() => {
      id = generateId(input as IdPrefix);
    });
    assert.equal(id.startsWith(start), true, `${String(input)} -> ${id}`);
    assert.match(id.slice(start.length), UUID_V4_ONLY);
  }
});

test("[unhappy-1] null does not trigger the default prefix", () => {
  const id = generateId(null as unknown as IdPrefix);
  assert.equal(id.startsWith("null_"), true);
  assert.equal(id.startsWith("todo_"), false);
  assert.match(id.slice("null_".length), UUID_V4_ONLY);
  assert.equal(id.length, 41);
});

// ---- concurrency ------------------------------------------------------------

test("[concurrency-1] interleaved async tasks each receive distinct brn ids", async () => {
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

test("[concurrency-1] tasks that yield between every call still receive distinct ids", async () => {
  const batches = await Promise.all(
    Array.from({ length: 50 }, async () => {
      const ids: string[] = [];
      for (let i = 0; i < 20; i += 1) {
        await Promise.resolve();
        ids.push(generateId("brn"));
      }
      return ids;
    }),
  );
  const ids = batches.flat();
  assert.equal(ids.length, 1000);
  assert.equal(new Set(ids).size, 1000);
  for (const id of ids) {
    assert.match(id, idPattern("brn"));
  }
});

// ---- newTodoRow and rowToTodo -----------------------------------------------

test("[happy-6] newTodoRow defaults to a todo-prefixed id", () => {
  const row = newTodoRow("user_1", "buy milk");
  assert.match(String(row.id), idPattern("todo"));
  assert.equal(row.userId, "user_1");
  assert.equal(row.title, "buy milk");
  assert.equal(row.done, false);
});

test("[happy-6] two default newTodoRow ids are distinct todo ids", () => {
  const first = String(newTodoRow("user_1", "buy milk").id);
  const second = String(newTodoRow("user_1", "buy milk").id);
  assert.match(first, idPattern("todo"));
  assert.match(second, idPattern("todo"));
  assert.notEqual(first, second);
});

test("[happy-7] newTodoRow uses a given id verbatim", () => {
  assert.equal(newTodoRow("user_1", "buy milk", "jri_custom").id, "jri_custom");
});

test("[happy-7] newTodoRow given an explicit undefined id still generates a todo id", () => {
  assert.match(
    String(newTodoRow("user_1", "buy milk", undefined).id),
    idPattern("todo"),
  );
});

test("[happy-8] rowToTodo maps a row to the domain todo", () => {
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

test("[happy-8] rowToTodo keeps a done flag and millisecond precision", () => {
  assert.deepEqual(
    rowToTodo({
      id: "jri_1",
      userId: "user_1",
      title: "write tests",
      done: true,
      createdAt: new Date("2026-09-16T23:59:59.999Z"),
    }),
    {
      id: "jri_1",
      title: "write tests",
      done: true,
      createdAt: "2026-09-16T23:59:59.999Z",
    },
  );
});
