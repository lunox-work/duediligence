import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import {
  generateId,
  newTodoRow,
  rowToTodo,
  type IdPrefix,
} from "../../src/mapping.js";

/**
 * `newTodoRow` and `rowToTodo` keep their behaviour alongside the prefixed
 * `generateId`. `crypto.randomUUID` is replaced with a fixed sequence of
 * valid lowercase v4 UUIDs, so ids are deterministic and exact.
 */

const UUID_V4 =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function idPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}_${UUID_V4}$`);
}

type Uuid = ReturnType<typeof crypto.randomUUID>;

function fixedUuid(n: number): Uuid {
  return `3e7d1a2b-5c6f-4a80-9b1c-${n.toString(16).padStart(12, "0")}` as Uuid;
}

function useFixedUuids(t: TestContext) {
  let next = 0;
  return t.mock.method(globalThis.crypto, "randomUUID", (): Uuid => {
    next += 1;
    return fixedUuid(next);
  });
}

// ---- newTodoRow -------------------------------------------------------------

// Extends "[happy-5] newTodoRow defaults to a todo-prefixed id and keeps its
// other fields": the default id is todo_ even after generateId was last
// called with another prefix.
test("[happy-5] newTodoRow's default id stays todo_ after generateId calls with other prefixes", (t) => {
  const randomUUID = useFixedUuids(t);
  assert.equal(generateId("brn"), `brn_${fixedUuid(1)}`);
  const row = newTodoRow("user_1", "buy milk");
  assert.equal(row.id, `todo_${fixedUuid(2)}`);
  assert.equal(row.userId, "user_1");
  assert.equal(row.title, "buy milk");
  assert.equal(row.done, false);
  assert.equal(generateId("jrc"), `jrc_${fixedUuid(3)}`);
  assert.match(String(newTodoRow("user_2", "  call mum  ").id), idPattern("todo"));
  assert.equal(randomUUID.mock.callCount(), 4);
});

// Extends "[happy-5] newTodoRow's default id is generateId() with the todo
// prefix": many rows, interleaved with every other prefix.
test("[happy-5] newTodoRow defaults interleaved with each other prefix are distinct todo ids", (t) => {
  useFixedUuids(t);
  const others: IdPrefix[] = ["jrc", "jrb", "jri", "brn", "bpr"];
  const rowIds: string[] = [];
  let n = 0;
  for (const prefix of others) {
    n += 1;
    assert.equal(generateId(prefix), `${prefix}_${fixedUuid(n)}`);
    n += 1;
    const id = String(newTodoRow("user_1", "buy milk").id);
    assert.equal(id, `todo_${fixedUuid(n)}`);
    rowIds.push(id);
  }
  assert.equal(new Set(rowIds).size, 5);
});

// Extends "[happy-6] newTodoRow uses the id it is given verbatim": ids from
// generateId with every non-default prefix are used as given, and no extra
// id is generated for them.
test("[happy-6] newTodoRow keeps an id from generateId(prefix) for each non-default prefix", (t) => {
  const randomUUID = useFixedUuids(t);
  const prefixes: IdPrefix[] = ["bpr", "brn", "jri", "jrb", "jrc"];
  prefixes.forEach((prefix, i) => {
    const row = newTodoRow("user_1", "buy milk", generateId(prefix));
    assert.equal(row.id, `${prefix}_${fixedUuid(i + 1)}`);
    assert.equal(row.userId, "user_1");
    assert.equal(row.done, false);
  });
  assert.equal(randomUUID.mock.callCount(), 5);
});

// Extends "[happy-6] newTodoRow does not check a given id's prefix or
// generate one": given ids that generateId would reject as prefixes, next to
// a generated one.
test("[happy-6] newTodoRow keeps given ids verbatim beside a generated jri id", (t) => {
  const randomUUID = useFixedUuids(t);
  const generated = generateId("jri");
  assert.equal(generated, `jri_${fixedUuid(1)}`);
  assert.equal(newTodoRow("user_1", "buy milk", generated).id, generated);
  for (const id of ["jri_custom", "TODO_1", "email_x", "", "no-underscore"]) {
    assert.equal(newTodoRow("user_1", "buy milk", id).id, id);
  }
  assert.equal(randomUUID.mock.callCount(), 1);
});

// ---- rowToTodo --------------------------------------------------------------

// Extends "[happy-7] rowToTodo maps a row to the domain todo": a row whose id
// was produced by generateId with a non-default prefix.
test("[happy-7] rowToTodo passes a generated jrb id through unchanged", (t) => {
  useFixedUuids(t);
  const id = generateId("jrb");
  assert.equal(id, `jrb_${fixedUuid(1)}`);
  assert.deepEqual(
    rowToTodo({
      id,
      userId: "user_1",
      title: "write tests",
      done: false,
      createdAt: new Date("2026-09-16T00:00:00.000Z"),
    }),
    {
      id: `jrb_${fixedUuid(1)}`,
      title: "write tests",
      done: false,
      createdAt: "2026-09-16T00:00:00.000Z",
    },
  );
});

// Extends "[happy-7] rowToTodo keeps milliseconds and done = true": rows built
// by newTodoRow from generated ids round-trip their id.
test("[happy-7] rowToTodo maps rows from newTodoRow with generated bpr and default ids", (t) => {
  useFixedUuids(t);
  const createdAt = new Date("2026-01-01T12:34:56.789Z");
  const fromBpr = newTodoRow("user_1", " plan trip ", generateId("bpr"));
  const fromDefault = newTodoRow("user_2", "pack bags");
  assert.deepEqual(
    rowToTodo({
      id: String(fromBpr.id),
      userId: fromBpr.userId,
      title: fromBpr.title,
      done: true,
      createdAt,
    }),
    {
      id: `bpr_${fixedUuid(1)}`,
      title: "plan trip",
      done: true,
      createdAt: "2026-01-01T12:34:56.789Z",
    },
  );
  assert.deepEqual(
    rowToTodo({
      id: String(fromDefault.id),
      userId: fromDefault.userId,
      title: fromDefault.title,
      done: false,
      createdAt,
    }),
    {
      id: `todo_${fixedUuid(2)}`,
      title: "pack bags",
      done: false,
      createdAt: "2026-01-01T12:34:56.789Z",
    },
  );
});
