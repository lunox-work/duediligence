import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { Database } from "../src/errors.js";
import {
  createJiraBoardStore,
  type SyncBoardInput,
} from "../src/jira-boards.js";
import { jiraBoard, type JiraBoardRow } from "../src/schema.js";

/**
 * A test-local copy of `fake-db.ts` that also records the argument passed to
 * `onConflictDoUpdate`, and can make the insert statement reject. Like the
 * shared fake, it records calls rather than interpreting SQL.
 */
interface RecordedCall {
  readonly kind: "select" | "insert" | "update" | "delete";
  readonly values?: Record<string, unknown>;
  conflict?: {
    readonly target?: unknown;
    readonly set?: Record<string, unknown>;
    readonly setWhere?: unknown;
  };
}

function chain(
  rows: readonly unknown[],
  call?: RecordedCall,
  failure?: Error,
): unknown {
  const result: Record<string, unknown> = {
    from: () => result,
    where: () => result,
    returning: () => result,
    set: () => result,
    values: () => result,
    onConflictDoUpdate: (argument: RecordedCall["conflict"]) => {
      if (call !== undefined) {
        call.conflict = argument;
      }
      return result;
    },
    onConflictDoNothing: () => result,
    innerJoin: () => result,
    leftJoin: () => result,
    orderBy: () => result,
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => (failure === undefined ? resolve([...rows]) : reject(failure)),
  };
  return result;
}

function createRecordingDb(
  rows: readonly unknown[],
  options: { insertFailure?: Error } = {},
): { db: Database; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const db = {
    select: () => {
      const call: RecordedCall = { kind: "select" };
      calls.push(call);
      return chain(rows, call);
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const call: RecordedCall = { kind: "insert", values };
        calls.push(call);
        return chain(rows, call, options.insertFailure);
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        const call: RecordedCall = { kind: "update", values };
        calls.push(call);
        return chain(rows, call);
      },
    }),
    delete: () => {
      const call: RecordedCall = { kind: "delete" };
      calls.push(call);
      return chain(rows, call);
    },
  };
  return { db: db as unknown as Database, calls };
}

/** The "stored row" of the spec's Background. */
function storedRow(overrides: Partial<JiraBoardRow> = {}): JiraBoardRow {
  return {
    id: "jrb_1",
    organizationId: "org_1",
    connectionId: "jrc_1",
    externalId: "42",
    name: "Acme board",
    boardType: "scrum",
    projectKey: "ACME",
    selection: { maxTickets: 10, excludeAssigned: true },
    writebackEnabled: true,
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
    updatedAt: new Date("2026-09-21T00:00:00.000Z"),
    ...overrides,
  };
}

const NOW = new Date("2026-11-04T12:00:00.000Z");

/** Fixes the clock, so the `updatedAt` the store takes is deterministic. */
function fixClock(t: TestContext): void {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
}

function store(
  t: TestContext,
  rows: readonly unknown[],
  options: { insertFailure?: Error } = {},
) {
  fixClock(t);
  const fake = createRecordingDb(rows, options);
  return { ...fake, store: createJiraBoardStore(fake.db) };
}

const baseInput: SyncBoardInput = {
  connectionId: "jrc_1",
  externalId: "42",
  name: "Acme board",
  boardType: "scrum",
};

function onlyInsert(calls: readonly RecordedCall[]): RecordedCall {
  const inserts = calls.filter((call) => call.kind === "insert");
  assert.equal(inserts.length, 1);
  return inserts[0] as RecordedCall;
}

function valuesOf(calls: readonly RecordedCall[]): Record<string, unknown> {
  return onlyInsert(calls).values ?? {};
}

function setOf(calls: readonly RecordedCall[]): Record<string, unknown> {
  const conflict = onlyInsert(calls).conflict;
  assert.ok(conflict !== undefined, "onConflictDoUpdate was not called");
  return conflict.set ?? {};
}

const dialect = new PgDialect();

function render(sql: unknown) {
  const query = dialect.sqlToQuery(sql as SQL);
  return { sql: query.sql, params: query.params };
}

// ---------------------------------------------------------------------------
// @happy 1: A board seen for the first time is inserted with empty settings
// ---------------------------------------------------------------------------

test("[happy-1] a first sync issues one insert with exactly the board's keys and empty settings", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);
  const calledAt = Date.now();

  await boards.sync("org_1", {
    connectionId: "jrc_1",
    externalId: "42",
    name: "Acme board",
    boardType: "scrum",
    projectKey: "ACME",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
  const values = calls[0]?.values ?? {};
  assert.deepEqual(Object.keys(values).sort(), [
    "boardType",
    "connectionId",
    "externalId",
    "id",
    "name",
    "organizationId",
    "projectKey",
    "selection",
    "updatedAt",
  ]);
  assert.match(String(values["id"]), /^jrb_/);
  assert.equal(values["organizationId"], "org_1");
  assert.equal(values["connectionId"], "jrc_1");
  assert.equal(values["externalId"], "42");
  assert.equal(values["name"], "Acme board");
  assert.equal(values["boardType"], "scrum");
  assert.equal(values["projectKey"], "ACME");
  assert.deepEqual(values["selection"], {});
  assert.ok(values["updatedAt"] instanceof Date);
  assert.ok((values["updatedAt"] as Date).getTime() >= calledAt);
  assert.equal("writebackEnabled" in values, false);
});

test("[happy-1] a first sync without a project key still writes the same nine keys, and no createdAt", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_2", { ...baseInput, connectionId: "jrc_9" });

  assert.equal(calls.length, 1);
  const values = valuesOf(calls);
  assert.equal(Object.keys(values).length, 9);
  assert.equal(values["projectKey"], null);
  assert.equal(values["organizationId"], "org_2");
  assert.equal(values["connectionId"], "jrc_9");
  assert.deepEqual(values["selection"], {});
  assert.equal("createdAt" in values, false);
  assert.equal("writebackEnabled" in values, false);
});

// ---------------------------------------------------------------------------
// @happy 2: The conflict clause targets the board's Jira identity and sets
// only Jira's facts
// ---------------------------------------------------------------------------

test("[happy-2] the conflict update targets connection and external id and sets only Jira's facts", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", {
    connectionId: "jrc_1",
    externalId: "42",
    name: "Acme board (renamed)",
    boardType: "kanban",
    projectKey: "ACME2",
  });

  const conflict = onlyInsert(calls).conflict;
  assert.ok(conflict !== undefined);
  assert.ok(Array.isArray(conflict.target));
  const target = conflict.target as unknown[];
  assert.equal(target.length, 2);
  assert.equal(target[0], jiraBoard.connectionId);
  assert.equal(target[1], jiraBoard.externalId);

  const set = conflict.set ?? {};
  assert.deepEqual(Object.keys(set).sort(), [
    "boardType",
    "name",
    "projectKey",
    "updatedAt",
  ]);
  assert.equal(set["name"], "Acme board (renamed)");
  assert.equal(set["boardType"], "kanban");
  assert.equal(set["projectKey"], "ACME2");
  assert.ok(set["updatedAt"] instanceof Date);
  assert.equal("selection" in set, false);
  assert.equal("writebackEnabled" in set, false);
  assert.equal("organizationId" in set, false);
});

test("[happy-2] the conflict update carries the same values as the insert", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", {
    connectionId: "jrc_1",
    externalId: "42",
    name: "Acme board (renamed)",
    boardType: "kanban",
    projectKey: "ACME2",
  });

  const values = valuesOf(calls);
  const set = setOf(calls);
  assert.equal(set["name"], values["name"]);
  assert.equal(set["boardType"], values["boardType"]);
  assert.equal(set["projectKey"], values["projectKey"]);
  assert.equal(
    (set["updatedAt"] as Date).getTime(),
    (values["updatedAt"] as Date).getTime(),
  );
  assert.equal("connectionId" in set, false);
  assert.equal("externalId" in set, false);
  assert.equal("id" in set, false);
});

// ---------------------------------------------------------------------------
// @happy 3: The summary carries the stored settings, not defaults
// ---------------------------------------------------------------------------

test("[happy-3] sync resolves to the summary of the returned row, with its stored settings", async (t) => {
  const { store: boards } = store(t, [
    storedRow({ name: "Acme board (renamed)" }),
  ]);

  const summary = await boards.sync("org_1", {
    connectionId: "jrc_1",
    externalId: "42",
    name: "Acme board (renamed)",
    boardType: "scrum",
  });

  assert.deepEqual(summary, {
    id: "jrb_1",
    connectionId: "jrc_1",
    externalId: "42",
    name: "Acme board (renamed)",
    boardType: "scrum",
    projectKey: "ACME",
    selection: { maxTickets: 10, excludeAssigned: true },
    writebackEnabled: true,
    createdAt: "2026-09-21T00:00:00.000Z",
  });
});

test("[happy-3] the summary is the returned row's, not the input's, and maps like get", async (t) => {
  // The input asks for no project key and another name; the row the database
  // returns is what the summary reports.
  const row = storedRow({ writebackEnabled: false, name: "Stored name" });
  const { store: boards } = store(t, [row]);

  const synced = await boards.sync("org_1", {
    ...baseInput,
    name: "Input name",
    projectKey: null,
  });
  const got = await boards.get("org_1", "jrb_1");

  assert.deepEqual(synced, got);
  assert.equal(synced.writebackEnabled, false);
  assert.equal(synced.projectKey, "ACME");
  assert.equal(synced.name, "Stored name");
  assert.equal("organizationId" in synced, false);
  assert.equal("updatedAt" in synced, false);
});

// ---------------------------------------------------------------------------
// @boundary 1: A stored null selection reads back as empty settings
// ---------------------------------------------------------------------------

test("[boundary-1] a stored null selection reads back from sync as empty settings", async (t) => {
  const { store: boards } = store(t, [
    storedRow({ selection: null as unknown as Record<string, never> }),
  ]);

  const summary = await boards.sync("org_1", baseInput);

  assert.deepEqual(summary.selection, {});
});

test("[boundary-1] sync maps a null selection exactly as list does", async (t) => {
  const { store: boards } = store(t, [
    storedRow({ selection: null as unknown as Record<string, never> }),
  ]);

  const synced = await boards.sync("org_1", baseInput);
  const listed = await boards.list("org_1");

  assert.deepEqual(synced, listed[0]);
  assert.deepEqual(synced.selection, {});
  assert.equal(synced.writebackEnabled, true);
});

// ---------------------------------------------------------------------------
// @boundary 2: The project key Jira states is what is stored
// ---------------------------------------------------------------------------

test('[boundary-2] a projectKey of "ACME" is written as "ACME" on insert and on update', async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", { ...baseInput, projectKey: "ACME" });

  assert.equal(valuesOf(calls)["projectKey"], "ACME");
  assert.equal(setOf(calls)["projectKey"], "ACME");
});

test("[boundary-2] a null projectKey is written as null on insert and on update", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", { ...baseInput, projectKey: null });

  assert.equal(valuesOf(calls)["projectKey"], null);
  assert.equal(setOf(calls)["projectKey"], null);
});

test("[boundary-2] an omitted projectKey is written as null on insert and on update, not left out", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", baseInput);

  const values = valuesOf(calls);
  const set = setOf(calls);
  assert.equal("projectKey" in values, true);
  assert.equal(values["projectKey"], null);
  assert.equal("projectKey" in set, true);
  assert.equal(set["projectKey"], null);
});

// ---------------------------------------------------------------------------
// @boundary 3: Unusual values pass through unchanged
// ---------------------------------------------------------------------------

for (const [label, name, boardType] of [
  ["an empty name", "", "scrum"],
  ["a name with surrounding spaces", "  Acme  ", "kanban"],
  ['a board type of "simple"', "Acme board", "simple"],
  ["an empty board type", "Acme board", ""],
] as const) {
  test(`[boundary-3] ${label} is stored as given on insert and on update`, async (t) => {
    const { store: boards, calls } = store(t, [storedRow()]);

    const summary = await boards.sync("org_1", {
      ...baseInput,
      name,
      boardType,
    });

    assert.ok(summary !== undefined);
    const values = valuesOf(calls);
    const set = setOf(calls);
    assert.equal(values["name"], name);
    assert.equal(set["name"], name);
    assert.equal(values["boardType"], boardType);
    assert.equal(set["boardType"], boardType);
  });
}

// ---------------------------------------------------------------------------
// @unhappy 1: A selection smuggled past the type is ignored
// ---------------------------------------------------------------------------

test("[unhappy-1] a selection smuggled past the type is not written", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    selection: { maxTickets: 1 },
  } as SyncBoardInput);

  assert.deepEqual(valuesOf(calls)["selection"], {});
  assert.equal("selection" in setOf(calls), false);
});

test("[unhappy-1] a smuggled selection does not change the insert's keys or the summary's settings", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  const summary = await boards.sync("org_1", {
    ...baseInput,
    selection: { maxTickets: 1, excludeAssigned: false, issueTypes: ["Bug"] },
  } as SyncBoardInput);

  const values = valuesOf(calls);
  assert.deepEqual(values["selection"], {});
  assert.equal(Object.keys(values).length, 9);
  assert.deepEqual(Object.keys(setOf(calls)).sort(), [
    "boardType",
    "name",
    "projectKey",
    "updatedAt",
  ]);
  assert.deepEqual(summary.selection, {
    maxTickets: 10,
    excludeAssigned: true,
  });
});

// ---------------------------------------------------------------------------
// @unhappy 2: A writebackEnabled smuggled past the type is ignored
// ---------------------------------------------------------------------------

test("[unhappy-2] a writebackEnabled of false smuggled past the type is not written", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    writebackEnabled: false,
  } as SyncBoardInput);

  assert.equal("writebackEnabled" in valuesOf(calls), false);
  assert.equal("writebackEnabled" in setOf(calls), false);
});

test("[unhappy-2] a writebackEnabled of true smuggled past the type is not written either", async (t) => {
  const { store: boards, calls } = store(t, [
    storedRow({ writebackEnabled: false }),
  ]);

  const summary = await boards.sync("org_1", {
    ...baseInput,
    writebackEnabled: true,
  } as SyncBoardInput);

  assert.equal("writebackEnabled" in valuesOf(calls), false);
  assert.equal("writebackEnabled" in setOf(calls), false);
  assert.equal(summary.writebackEnabled, false);
});

// ---------------------------------------------------------------------------
// @unhappy 3: The conflict update is guarded by the caller's organization
// ---------------------------------------------------------------------------

test("[unhappy-3] the conflict update has a setWhere guard", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", baseInput);

  const conflict = onlyInsert(calls).conflict;
  assert.ok(conflict !== undefined);
  assert.notEqual(conflict.setWhere, undefined);
});

test("[unhappy-3] the setWhere guard is the caller's organization, not another", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_2", baseInput);

  const setWhere = onlyInsert(calls).conflict?.setWhere;
  assert.notEqual(setWhere, undefined);
  assert.deepEqual(
    render(setWhere),
    render(eq(jiraBoard.organizationId, "org_2")),
  );
  assert.notDeepEqual(
    render(setWhere),
    render(eq(jiraBoard.organizationId, "org_1")),
  );
});

// ---------------------------------------------------------------------------
// @unhappy 4: No returned row rejects with a named error
// ---------------------------------------------------------------------------

test("[unhappy-4] a sync whose upsert returns no row rejects with a named error", async (t) => {
  const { store: boards } = store(t, []);

  await assert.rejects(
    () => boards.sync("org_2", baseInput),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Failed to sync the Jira board.");
      return true;
    },
  );
});

test("[unhappy-4] a sync that yields no row still issued exactly one insert and nothing more", async (t) => {
  const { store: boards, calls } = store(t, []);

  await assert.rejects(() => boards.sync("org_1", baseInput), {
    message: "Failed to sync the Jira board.",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
});

// ---------------------------------------------------------------------------
// @unhappy 5: A database error surfaces unchanged
// ---------------------------------------------------------------------------

test("[unhappy-5] a database error rejects sync with that same error instance", async (t) => {
  const failure = new Error("connection reset");
  const { store: boards } = store(t, [storedRow()], {
    insertFailure: failure,
  });

  await assert.rejects(
    () => boards.sync("org_1", baseInput),
    (error: unknown) => {
      assert.equal(error, failure);
      return true;
    },
  );
});

test("[unhappy-5] a database error is not wrapped, renamed or retried", async (t) => {
  const failure = new Error("connection reset");
  const { store: boards, calls } = store(t, [storedRow()], {
    insertFailure: failure,
  });

  const caught = await boards.sync("org_1", baseInput).then(
    () => undefined,
    (error: unknown) => error,
  );

  assert.equal(caught, failure);
  assert.equal((caught as Error).message, "connection reset");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
});

// ---------------------------------------------------------------------------
// @concurrency 1: Two syncs of the same board started together each issue
// one insert
// ---------------------------------------------------------------------------

test("[concurrency-1] two overlapping syncs of one board each issue one insert and no read", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  const first = boards.sync("org_1", baseInput);
  const second = boards.sync("org_1", baseInput);
  const [a, b] = await Promise.all([first, second]);

  assert.equal(a.id, "jrb_1");
  assert.equal(b.id, "jrb_1");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.kind === "insert"));
  assert.equal(
    calls.some((call) => call.kind === "select"),
    false,
  );
  const ids = calls.map((call) => String(call.values?.["id"]));
  assert.match(ids[0] ?? "", /^jrb_/);
  assert.match(ids[1] ?? "", /^jrb_/);
  assert.notEqual(ids[0], ids[1]);
});

test("[concurrency-1] overlapping syncs each carry their own conflict clause and never set the settings", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await Promise.all([
    boards.sync("org_1", baseInput),
    boards.sync("org_1", { ...baseInput, name: "Acme board (renamed)" }),
  ]);

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.kind, "insert");
    const set = call.conflict?.set ?? {};
    assert.equal("selection" in set, false);
    assert.equal("writebackEnabled" in set, false);
    assert.deepEqual(call.values?.["selection"], {});
  }
  const names = calls.map((call) => call.conflict?.set?.["name"]).sort();
  assert.deepEqual(names, ["Acme board", "Acme board (renamed)"]);
});

// ---------------------------------------------------------------------------
// @concurrency 2: A sync overlapping an update does not write the settings the
// update writes
// ---------------------------------------------------------------------------

test("[concurrency-2] a sync overlapping an update writes neither selection nor write-back on conflict", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  const updating = boards.update("org_1", "jrb_1", {
    selection: { maxTickets: 5 },
    writebackEnabled: false,
  });
  const syncing = boards.sync("org_1", baseInput);
  const [updated, synced] = await Promise.all([updating, syncing]);

  assert.ok(updated !== null);
  assert.ok(synced !== undefined);

  const set = setOf(calls);
  assert.equal("selection" in set, false);
  assert.equal("writebackEnabled" in set, false);

  const updates = calls.filter((call) => call.kind === "update");
  assert.equal(updates.length, 1);
  const updateValues = updates[0]?.values ?? {};
  assert.deepEqual(updateValues["selection"], {
    maxTickets: 5,
    excludeAssigned: true,
  });
  assert.equal(updateValues["writebackEnabled"], false);
});

test("[concurrency-2] a sync started before an overlapping update adds exactly one insert and no read", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  const syncing = boards.sync("org_1", baseInput);
  const updating = boards.update("org_1", "jrb_1", {
    selection: { maxTickets: 5 },
    writebackEnabled: false,
  });
  await Promise.all([syncing, updating]);

  // The update reads once and writes once; the sync adds only its insert.
  assert.equal(calls.filter((call) => call.kind === "insert").length, 1);
  assert.equal(calls.filter((call) => call.kind === "select").length, 1);
  assert.equal(calls.filter((call) => call.kind === "update").length, 1);
  const set = setOf(calls);
  assert.equal("selection" in set, false);
  assert.equal("writebackEnabled" in set, false);
  assert.equal("writebackEnabled" in valuesOf(calls), false);
});

// ---------------------------------------------------------------------------
// @happy 4: register still sets the selection it is given, and still leaves
// write-back alone
// ---------------------------------------------------------------------------

test("[happy-4] register still writes the selection it is given, on insert and on conflict", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.register("org_1", {
    ...baseInput,
    selection: { maxTickets: 3 },
  });

  assert.deepEqual(valuesOf(calls)["selection"], { maxTickets: 3 });
  assert.deepEqual(setOf(calls)["selection"], { maxTickets: 3 });
  assert.equal("writebackEnabled" in valuesOf(calls), false);
});

test("[happy-4] register replaces the selection with a fuller one and still leaves write-back out of the conflict update", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);
  const selection = {
    maxTickets: 3,
    excludeAssigned: false,
    issueTypes: ["Story"],
  };

  await boards.register("org_1", { ...baseInput, selection });

  assert.deepEqual(valuesOf(calls)["selection"], selection);
  assert.deepEqual(setOf(calls)["selection"], selection);
  assert.equal("writebackEnabled" in valuesOf(calls), false);
  assert.equal("writebackEnabled" in setOf(calls), false);
});

// ---------------------------------------------------------------------------
// @boundary 4: register without a selection still resets it to empty, unlike
// sync
// ---------------------------------------------------------------------------

test("[boundary-4] register without a selection resets it to empty and passes no setWhere", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.register("org_1", baseInput);

  const conflict = onlyInsert(calls).conflict;
  assert.ok(conflict !== undefined);
  assert.deepEqual(conflict.set?.["selection"], {});
  assert.equal(conflict.setWhere, undefined);
});

test("[boundary-4] register with an explicitly empty selection also resets it and passes no setWhere", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.register("org_2", { ...baseInput, selection: {} });

  const conflict = onlyInsert(calls).conflict;
  assert.ok(conflict !== undefined);
  assert.deepEqual(conflict.set?.["selection"], {});
  assert.equal(conflict.setWhere, undefined);
});
