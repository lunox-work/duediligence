import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { Database } from "../../src/errors.js";
import {
  createJiraBoardStore,
  type SyncBoardInput,
} from "../../src/jira-boards.js";
import { jiraBoard, type JiraBoardRow } from "../../src/schema.js";

/**
 * A copy of the fake in `fake-db.ts` that also records the argument passed to
 * `onConflictDoUpdate`, and can make the insert statement reject. It records
 * calls rather than interpreting SQL.
 */
interface RecordedCall {
  readonly kind: "select" | "insert" | "update" | "delete";
  readonly values?: Record<string, unknown>;
  conflict?: {
    readonly target?: unknown;
    readonly set?: Record<string, unknown>;
    readonly setWhere?: unknown;
  };
  conflictCalls?: number;
}

function chain(
  rows: readonly unknown[],
  call?: RecordedCall,
  failure?: unknown,
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
        call.conflictCalls = (call.conflictCalls ?? 0) + 1;
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
  options: { insertFailure?: unknown } = {},
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

function store(
  t: TestContext,
  rows: readonly unknown[],
  options: { insertFailure?: unknown } = {},
) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const fake = createRecordingDb(rows, options);
  return { ...fake, store: createJiraBoardStore(fake.db) };
}

const baseInput: SyncBoardInput = {
  connectionId: "jrc_1",
  externalId: "42",
  name: "Acme board",
  boardType: "scrum",
};

const INSERT_KEYS = [
  "boardType",
  "connectionId",
  "externalId",
  "id",
  "name",
  "organizationId",
  "projectKey",
  "selection",
  "updatedAt",
];

const SET_KEYS = ["boardType", "name", "projectKey", "updatedAt"];

function inserts(calls: readonly RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.kind === "insert");
}

function onlyInsert(calls: readonly RecordedCall[]): RecordedCall {
  const found = inserts(calls);
  assert.equal(found.length, 1);
  return found[0] as RecordedCall;
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

// Extends "[happy-1] a first sync issues one insert with exactly the board's
// keys and empty settings": other values everywhere, so nothing hard-coded
// from the scenario survives.
test("[happy-1] a first sync writes the caller's organization and the input's values, whatever they are", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_77", {
    connectionId: "jrc_other",
    externalId: "1001",
    name: "Platform team",
    boardType: "kanban",
    projectKey: "PLAT",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
  const values = calls[0]?.values ?? {};
  assert.deepEqual(Object.keys(values).sort(), INSERT_KEYS);
  assert.match(String(values["id"]), /^jrb_/);
  assert.equal(values["organizationId"], "org_77");
  assert.equal(values["connectionId"], "jrc_other");
  assert.equal(values["externalId"], "1001");
  assert.equal(values["name"], "Platform team");
  assert.equal(values["boardType"], "kanban");
  assert.equal(values["projectKey"], "PLAT");
  assert.deepEqual(values["selection"], {});
  assert.equal("writebackEnabled" in values, false);
  assert.equal("createdAt" in values, false);
});

// Extends "[happy-1] a first sync issues one insert ...": the id is the
// generated one, not the stored row's, and not the external id.
test("[happy-1] the inserted id is freshly generated, not taken from the stored row or the input", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", baseInput);

  const id = String(valuesOf(calls)["id"]);
  assert.match(id, /^jrb_/);
  assert.notEqual(id, "jrb_1");
  assert.notEqual(id, "jrb_42");
  assert.ok(id.length > "jrb_".length);
});

// Extends "[happy-1] a first sync issues one insert ...": updatedAt is taken
// during the call, not when the store was made.
test("[happy-1] updatedAt is taken during the call, not when the store is created", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  t.mock.timers.tick(60_000);
  const calledAt = Date.now();
  await boards.sync("org_1", baseInput);

  const updatedAt = valuesOf(calls)["updatedAt"];
  assert.ok(updatedAt instanceof Date);
  assert.ok(updatedAt.getTime() >= calledAt);
  assert.ok(updatedAt.getTime() > NOW.getTime());
});

// Extends "[happy-1] a first sync without a project key still writes the same
// nine keys, and no createdAt": successive syncs each take their own moment.
test("[happy-1] a later sync records a later updatedAt than an earlier one", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", baseInput);
  t.mock.timers.tick(5_000);
  const secondCalledAt = Date.now();
  await boards.sync("org_1", baseInput);

  const [first, second] = inserts(calls);
  const firstAt = first?.values?.["updatedAt"] as Date;
  const secondAt = second?.values?.["updatedAt"] as Date;
  assert.ok(firstAt instanceof Date);
  assert.ok(secondAt instanceof Date);
  assert.ok(secondAt.getTime() >= secondCalledAt);
  assert.ok(secondAt.getTime() > firstAt.getTime());
});

// ---------------------------------------------------------------------------
// @happy 2: The conflict clause targets the board's Jira identity and sets
// only Jira's facts
// ---------------------------------------------------------------------------

// Extends "[happy-2] the conflict update targets connection and external id
// and sets only Jira's facts": other values, and no projectKey supplied.
test("[happy-2] the conflict update sets exactly Jira's facts from another input, in the target's column order", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_9", {
    connectionId: "jrc_77",
    externalId: "7",
    name: "Support desk",
    boardType: "simple",
  });

  const insert = onlyInsert(calls);
  assert.equal(insert.conflictCalls, 1);
  const conflict = insert.conflict;
  assert.ok(conflict !== undefined);
  assert.deepEqual(conflict.target, [
    jiraBoard.connectionId,
    jiraBoard.externalId,
  ]);
  assert.notEqual((conflict.target as unknown[])[0], jiraBoard.externalId);

  const set = conflict.set ?? {};
  assert.deepEqual(Object.keys(set).sort(), SET_KEYS);
  assert.equal(set["name"], "Support desk");
  assert.equal(set["boardType"], "simple");
  assert.equal(set["projectKey"], null);
  assert.ok(set["updatedAt"] instanceof Date);
  for (const absent of [
    "selection",
    "writebackEnabled",
    "organizationId",
    "connectionId",
    "externalId",
    "id",
    "createdAt",
  ]) {
    assert.equal(absent in set, false, `set should not carry ${absent}`);
  }
});

// Extends "[happy-2] the conflict update carries the same values as the
// insert": updatedAt on conflict is the call's moment, as on insert.
test("[happy-2] the conflict update's updatedAt is the moment of the call, as the insert's is", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  t.mock.timers.tick(3_600_000);
  const calledAt = Date.now();
  await boards.sync("org_1", {
    ...baseInput,
    name: "Acme board (renamed)",
    boardType: "kanban",
    projectKey: "ACME2",
  });

  const values = valuesOf(calls);
  const set = setOf(calls);
  assert.ok(set["updatedAt"] instanceof Date);
  assert.ok((set["updatedAt"] as Date).getTime() >= calledAt);
  assert.equal(
    (set["updatedAt"] as Date).getTime(),
    (values["updatedAt"] as Date).getTime(),
  );
  assert.equal(set["name"], "Acme board (renamed)");
  assert.equal(set["boardType"], "kanban");
  assert.equal(set["projectKey"], "ACME2");
});

// ---------------------------------------------------------------------------
// @happy 3: The summary carries the stored settings, not defaults
// ---------------------------------------------------------------------------

// Extends "[happy-3] sync resolves to the summary of the returned row, with
// its stored settings": a different row, whose every field differs from the
// input and from the Background.
test("[happy-3] the summary is mapped from whatever row is returned, settings and all", async (t) => {
  const row = storedRow({
    id: "jrb_abc",
    connectionId: "jrc_row",
    externalId: "900",
    name: "Row name",
    boardType: "kanban",
    projectKey: null,
    selection: {
      maxTickets: 25,
      excludeAssigned: false,
      issueTypes: ["Bug", "Story"],
      minAgeDays: 2,
      maxAgeDays: null,
      minSpecChars: 40,
    },
    writebackEnabled: false,
    createdAt: new Date("2025-01-02T03:04:05.678Z"),
  });
  const { store: boards } = store(t, [row]);

  const summary = await boards.sync("org_1", {
    ...baseInput,
    projectKey: "INPUT",
  });

  assert.deepEqual(summary, {
    id: "jrb_abc",
    connectionId: "jrc_row",
    externalId: "900",
    name: "Row name",
    boardType: "kanban",
    projectKey: null,
    selection: {
      maxTickets: 25,
      excludeAssigned: false,
      issueTypes: ["Bug", "Story"],
      minAgeDays: 2,
      maxAgeDays: null,
      minSpecChars: 40,
    },
    writebackEnabled: false,
    createdAt: "2025-01-02T03:04:05.678Z",
  });
});

// Extends "[happy-3] the summary is the returned row's, not the input's, and
// maps like get": with more than one row returned, the first is used.
test("[happy-3] when several rows come back, the summary is the first one's", async (t) => {
  const { store: boards } = store(t, [
    storedRow({ id: "jrb_first", name: "First" }),
    storedRow({ id: "jrb_second", name: "Second", writebackEnabled: false }),
  ]);

  const summary = await boards.sync("org_1", baseInput);

  assert.equal(summary.id, "jrb_first");
  assert.equal(summary.name, "First");
  assert.equal(summary.writebackEnabled, true);
  assert.deepEqual(summary.selection, {
    maxTickets: 10,
    excludeAssigned: true,
  });
});

// Extends "[happy-3] the summary is the returned row's ...": the summary has
// exactly the keys list and get report.
test("[happy-3] the summary has exactly the keys list reports for the same row", async (t) => {
  const { store: boards } = store(t, [storedRow()]);

  const synced = await boards.sync("org_1", baseInput);
  const listed = await boards.list("org_1");

  assert.deepEqual(Object.keys(synced).sort(), Object.keys(listed[0] ?? {}).sort());
  assert.deepEqual(synced, listed[0]);
  assert.equal(typeof synced.createdAt, "string");
});

// ---------------------------------------------------------------------------
// @boundary 1: A stored null selection reads back as empty settings
// ---------------------------------------------------------------------------

// Extends "[boundary-1] sync maps a null selection exactly as list does":
// other fields of the row still come through around the null selection.
test("[boundary-1] a null selection reads back as {} while the rest of the row is kept", async (t) => {
  const { store: boards } = store(t, [
    storedRow({
      id: "jrb_null",
      selection: null as unknown as Record<string, never>,
      writebackEnabled: false,
      projectKey: "NUL",
    }),
  ]);

  const summary = await boards.sync("org_3", {
    ...baseInput,
    projectKey: "OTHER",
  });

  assert.deepEqual(summary.selection, {});
  assert.notEqual(summary.selection, null);
  assert.equal(summary.id, "jrb_null");
  assert.equal(summary.writebackEnabled, false);
  assert.equal(summary.projectKey, "NUL");
});

// Extends "[boundary-1] a stored null selection reads back from sync as empty
// settings": the empty settings on read do not leak into what is written.
test("[boundary-1] reading back a null selection does not make the conflict update write one", async (t) => {
  const { store: boards, calls } = store(t, [
    storedRow({ selection: null as unknown as Record<string, never> }),
  ]);

  const summary = await boards.sync("org_1", baseInput);

  assert.deepEqual(summary.selection, {});
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(setOf(calls)).sort(), SET_KEYS);
});

// ---------------------------------------------------------------------------
// @boundary 2: The project key Jira states is what is stored
// ---------------------------------------------------------------------------

// Extends the boundary-2 public examples: an empty project key is a stated
// key, not a missing one, so `?? null` keeps it (an `||` would not).
test('[boundary-2] an empty-string projectKey is written as "" on insert and on update, not as null', async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", { ...baseInput, projectKey: "" });

  assert.equal(valuesOf(calls)["projectKey"], "");
  assert.equal(setOf(calls)["projectKey"], "");
});

// Extends '[boundary-2] a projectKey of "ACME" is written as "ACME" ...':
// another key, not the stored row's, with spacing and case kept.
test("[boundary-2] a projectKey other than the stored one is written as given, unnormalised", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", { ...baseInput, projectKey: " acme-2 " });

  assert.equal(valuesOf(calls)["projectKey"], " acme-2 ");
  assert.equal(setOf(calls)["projectKey"], " acme-2 ");
});

// Extends "[boundary-2] an omitted projectKey is written as null ...": an
// explicitly undefined key is written as null too, even though the stored
// row has one.
test("[boundary-2] an explicitly undefined projectKey is written as null on insert and on update", async (t) => {
  const { store: boards, calls } = store(t, [storedRow({ projectKey: "ACME" })]);

  await boards.sync("org_1", { ...baseInput, projectKey: undefined });

  const values = valuesOf(calls);
  const set = setOf(calls);
  assert.equal("projectKey" in values, true);
  assert.equal(values["projectKey"], null);
  assert.equal("projectKey" in set, true);
  assert.equal(set["projectKey"], null);
});

// Extends "[boundary-2] a null projectKey is written as null ...": the
// summary still reports the key of the returned row, not the input's null.
test("[boundary-2] writing a null projectKey still resolves to the returned row's key", async (t) => {
  const { store: boards, calls } = store(t, [storedRow({ projectKey: "ROW" })]);

  const summary = await boards.sync("org_1", { ...baseInput, projectKey: null });

  assert.equal(valuesOf(calls)["projectKey"], null);
  assert.equal(setOf(calls)["projectKey"], null);
  assert.equal(summary.projectKey, "ROW");
});

// ---------------------------------------------------------------------------
// @boundary 3: Unusual values pass through unchanged
// ---------------------------------------------------------------------------

// Extends the boundary-3 public examples with more unusual values: case,
// whitespace, unicode, length, and board types outside scrum/kanban.
for (const [label, name, boardType] of [
  ["a whitespace-only name", "   ", "scrum"],
  ["a name with a newline and a tab", "Acme\n\tboard", "scrum"],
  ["a unicode name", "Ärger ✓ 看板", "kanban"],
  ["a very long name", "x".repeat(5_000), "scrum"],
  ["an upper-case board type", "Acme board", "SCRUM"],
  ['a board type of "unknown"', "Acme board", "unknown"],
  ["a padded board type", "Acme board", " kanban "],
  ["an empty name and an empty board type", "", ""],
] as const) {
  test(`[boundary-3] ${label} is stored as given on insert and on update, and the call resolves`, async (t) => {
    const { store: boards, calls } = store(t, [storedRow()]);

    const summary = await boards.sync("org_1", {
      ...baseInput,
      name,
      boardType,
    });

    assert.equal(summary.id, "jrb_1");
    const values = valuesOf(calls);
    const set = setOf(calls);
    assert.equal(values["name"], name);
    assert.equal(set["name"], name);
    assert.equal(values["boardType"], boardType);
    assert.equal(set["boardType"], boardType);
  });
}

// Extends the boundary-3 public examples: the identity fields are not
// normalised either.
test("[boundary-3] unusual connection and external ids are stored as given", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    connectionId: " JRC_1 ",
    externalId: "0042",
    name: "",
    boardType: "",
  });

  const values = valuesOf(calls);
  assert.equal(values["connectionId"], " JRC_1 ");
  assert.equal(values["externalId"], "0042");
  assert.equal(values["name"], "");
  assert.equal(values["boardType"], "");
});

// ---------------------------------------------------------------------------
// @unhappy 1: A selection smuggled past the type is ignored
// ---------------------------------------------------------------------------

// Extends "[unhappy-1] a selection smuggled past the type is not written":
// smuggled empty and null selections are ignored too.
for (const [label, smuggled] of [
  ["an empty selection", {}],
  ["a null selection", null],
  ["a selection that is not an object", "everything"],
] as const) {
  test(`[unhappy-1] ${label} smuggled past the type is not written`, async (t) => {
    const { store: boards, calls } = store(t, [storedRow()]);

    await boards.sync("org_1", {
      ...baseInput,
      selection: smuggled,
    } as unknown as SyncBoardInput);

    const values = valuesOf(calls);
    assert.deepEqual(values["selection"], {});
    assert.deepEqual(Object.keys(values).sort(), INSERT_KEYS);
    assert.equal("selection" in setOf(calls), false);
  });
}

// Extends "[unhappy-1] a smuggled selection does not change the insert's keys
// or the summary's settings": an input spread into the statement would also
// carry other smuggled columns, and would let them override the store's own.
test("[unhappy-1] a selection smuggled with other columns changes neither the insert nor the conflict update", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    selection: { maxTickets: 1 },
    id: "evil_1",
    organizationId: "org_evil",
    createdAt: new Date("2000-01-01T00:00:00.000Z"),
    updatedAt: new Date("2000-01-01T00:00:00.000Z"),
  } as unknown as SyncBoardInput);

  const values = valuesOf(calls);
  assert.deepEqual(Object.keys(values).sort(), INSERT_KEYS);
  assert.deepEqual(values["selection"], {});
  assert.match(String(values["id"]), /^jrb_/);
  assert.equal(values["organizationId"], "org_1");
  assert.equal((values["updatedAt"] as Date).getTime(), NOW.getTime());

  const set = setOf(calls);
  assert.deepEqual(Object.keys(set).sort(), SET_KEYS);
  assert.equal((set["updatedAt"] as Date).getTime(), NOW.getTime());
});

// ---------------------------------------------------------------------------
// @unhappy 2: A writebackEnabled smuggled past the type is ignored
// ---------------------------------------------------------------------------

// Extends the unhappy-2 public tests: non-boolean values, and smuggled
// together with a selection.
for (const [label, smuggled] of [
  ["a null writebackEnabled", null],
  ['a writebackEnabled of "false"', "false"],
  ["a writebackEnabled of 0", 0],
] as const) {
  test(`[unhappy-2] ${label} smuggled past the type is not written`, async (t) => {
    const { store: boards, calls } = store(t, [storedRow()]);

    const summary = await boards.sync("org_1", {
      ...baseInput,
      writebackEnabled: smuggled,
    } as unknown as SyncBoardInput);

    assert.equal("writebackEnabled" in valuesOf(calls), false);
    assert.equal("writebackEnabled" in setOf(calls), false);
    assert.equal(summary.writebackEnabled, true);
  });
}

test("[unhappy-2] a writebackEnabled smuggled with a selection is not written, and neither is the selection", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    writebackEnabled: false,
    selection: { maxTickets: 2 },
  } as SyncBoardInput);

  const values = valuesOf(calls);
  const set = setOf(calls);
  assert.equal("writebackEnabled" in values, false);
  assert.equal("writebackEnabled" in set, false);
  assert.deepEqual(values["selection"], {});
  assert.deepEqual(Object.keys(set).sort(), SET_KEYS);
});

// ---------------------------------------------------------------------------
// @unhappy 3: The conflict update is guarded by the caller's organization
// ---------------------------------------------------------------------------

// Extends "[unhappy-3] the setWhere guard is the caller's organization, not
// another": the Background's organization, rendered exactly.
test("[unhappy-3] the setWhere guard for org_1 is eq(organizationId, org_1) and nothing else", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", baseInput);

  const setWhere = onlyInsert(calls).conflict?.setWhere;
  assert.notEqual(setWhere, undefined);
  assert.deepEqual(
    render(setWhere),
    render(eq(jiraBoard.organizationId, "org_1")),
  );
  assert.notDeepEqual(
    render(setWhere),
    render(eq(jiraBoard.connectionId, "org_1")),
  );
});

// Extends "[unhappy-3] the setWhere guard is the caller's organization ...":
// each call is guarded by its own caller, not by one fixed or cached value.
test("[unhappy-3] successive syncs on one store are each guarded by their own caller's organization", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_a", baseInput);
  await boards.sync("org_b", baseInput);
  await boards.sync("org with ' quote", baseInput);

  const guards = inserts(calls).map((call) => render(call.conflict?.setWhere));
  assert.equal(guards.length, 3);
  assert.deepEqual(guards[0], render(eq(jiraBoard.organizationId, "org_a")));
  assert.deepEqual(guards[1], render(eq(jiraBoard.organizationId, "org_b")));
  assert.deepEqual(
    guards[2],
    render(eq(jiraBoard.organizationId, "org with ' quote")),
  );
});

// Extends "[unhappy-3] the conflict update has a setWhere guard": the guard
// is there whatever the input's connection, and even when the input
// smuggles another organization.
test("[unhappy-3] a smuggled organizationId does not change whose organization guards the update", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    connectionId: "jrc_shared",
    organizationId: "org_2",
  } as unknown as SyncBoardInput);

  assert.deepEqual(
    render(onlyInsert(calls).conflict?.setWhere),
    render(eq(jiraBoard.organizationId, "org_1")),
  );
});

// ---------------------------------------------------------------------------
// @unhappy 4: No returned row rejects with a named error
// ---------------------------------------------------------------------------

// Extends "[unhappy-4] a sync whose upsert returns no row rejects with a
// named error": a first-seen board for org_1 with a project key, and the
// message is sync's own, not register's.
test("[unhappy-4] no returned row rejects with sync's message for any caller, never register's", async (t) => {
  const { store: boards, calls } = store(t, []);

  const caught = await boards
    .sync("org_1", { ...baseInput, projectKey: "ACME" })
    .then(
      () => undefined,
      (error: unknown) => error,
    );

  assert.ok(caught instanceof Error);
  assert.equal(caught.constructor, Error);
  assert.equal(caught.message, "Failed to sync the Jira board.");
  assert.notEqual(caught.message, "Failed to register the Jira board.");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
});

// Extends "[unhappy-4] a sync that yields no row ...": it rejects rather than
// resolving to null or undefined, every time.
test("[unhappy-4] repeated syncs that yield no row each reject, none resolves", async (t) => {
  const { store: boards } = store(t, []);

  const outcomes = await Promise.allSettled([
    boards.sync("org_2", baseInput),
    boards.sync("org_3", { ...baseInput, externalId: "43" }),
  ]);

  for (const outcome of outcomes) {
    assert.equal(outcome.status, "rejected");
    const reason = (outcome as PromiseRejectedResult).reason as unknown;
    assert.ok(reason instanceof Error);
    assert.equal(reason.message, "Failed to sync the Jira board.");
  }
});

// ---------------------------------------------------------------------------
// @unhappy 5: A database error surfaces unchanged
// ---------------------------------------------------------------------------

// Extends "[unhappy-5] a database error rejects sync with that same error
// instance": an error subclass with its own fields stays that instance.
test("[unhappy-5] a database error subclass with a code surfaces as that same instance", async (t) => {
  class DatabaseError extends Error {
    readonly code = "23505";
  }
  const failure = new DatabaseError("duplicate key value");
  const { store: boards, calls } = store(t, [storedRow()], {
    insertFailure: failure,
  });

  const caught = await boards.sync("org_1", baseInput).then(
    () => undefined,
    (error: unknown) => error,
  );

  assert.equal(caught, failure);
  assert.ok(caught instanceof DatabaseError);
  assert.equal((caught as DatabaseError).code, "23505");
  assert.equal((caught as Error).message, "duplicate key value");
  assert.equal(calls.length, 1);
});

// Extends "[unhappy-5] a database error is not wrapped, renamed or retried":
// the error is not replaced by the no-row error, even though no row came.
test('[unhappy-5] a "connection reset" error is not replaced by the no-row error', async (t) => {
  const failure = new Error("connection reset");
  const { store: boards } = store(t, [], { insertFailure: failure });

  await assert.rejects(
    () => boards.sync("org_1", baseInput),
    (error: unknown) => {
      assert.equal(error, failure);
      assert.notEqual(
        (error as Error).message,
        "Failed to sync the Jira board.",
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// @concurrency 1: Two syncs of the same board started together each issue
// one insert
// ---------------------------------------------------------------------------

// Extends "[concurrency-1] two overlapping syncs of one board each issue one
// insert and no read": more overlapping calls.
test("[concurrency-1] five overlapping syncs of one board issue five inserts with distinct ids and no read", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  const pending = Array.from({ length: 5 }, () =>
    boards.sync("org_1", baseInput),
  );
  const results = await Promise.all(pending);

  assert.equal(results.length, 5);
  for (const result of results) {
    assert.equal(result.id, "jrb_1");
  }
  assert.equal(calls.length, 5);
  assert.ok(calls.every((call) => call.kind === "insert"));
  assert.equal(
    calls.some((call) => call.kind === "select"),
    false,
  );
  const ids = calls.map((call) => String(call.values?.["id"]));
  for (const id of ids) {
    assert.match(id, /^jrb_/);
  }
  assert.equal(new Set(ids).size, 5);
});

// Extends "[concurrency-1] overlapping syncs each carry their own conflict
// clause ...": two organizations overlapping on one board, each with its
// own guard.
test("[concurrency-1] overlapping syncs from two organizations each issue one insert guarded by their own", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  const [a, b] = await Promise.all([
    boards.sync("org_1", baseInput),
    boards.sync("org_2", baseInput),
  ]);

  assert.equal(a.id, "jrb_1");
  assert.equal(b.id, "jrb_1");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.kind === "insert"));
  const byOrg = new Map(
    calls.map((call) => [call.values?.["organizationId"], call]),
  );
  assert.deepEqual([...byOrg.keys()].sort(), ["org_1", "org_2"]);
  for (const org of ["org_1", "org_2"]) {
    assert.deepEqual(
      render(byOrg.get(org)?.conflict?.setWhere),
      render(eq(jiraBoard.organizationId, org)),
    );
  }
  assert.notEqual(calls[0]?.values?.["id"], calls[1]?.values?.["id"]);
});

// ---------------------------------------------------------------------------
// @concurrency 2: A sync overlapping an update does not write the settings the
// update writes
// ---------------------------------------------------------------------------

// Extends "[concurrency-2] a sync overlapping an update writes neither
// selection nor write-back on conflict": other settings, and several syncs
// around one update.
test("[concurrency-2] syncs on both sides of an overlapping update never write the settings it writes", async (t) => {
  const { store: boards, calls } = store(t, [
    storedRow({ selection: { maxTickets: 10, excludeAssigned: false } }),
  ]);

  const results = await Promise.all([
    boards.sync("org_1", baseInput),
    boards.update("org_1", "jrb_1", {
      selection: { issueTypes: ["Bug"] },
      writebackEnabled: true,
    }),
    boards.sync("org_1", { ...baseInput, name: "Acme board (renamed)" }),
  ]);

  assert.ok(results[0] !== undefined);
  assert.ok(results[1] !== null);
  assert.ok(results[2] !== undefined);

  const syncs = inserts(calls);
  assert.equal(syncs.length, 2);
  for (const call of syncs) {
    const set = call.conflict?.set ?? {};
    assert.deepEqual(Object.keys(set).sort(), SET_KEYS);
    assert.equal("writebackEnabled" in (call.values ?? {}), false);
    assert.deepEqual(call.values?.["selection"], {});
  }

  const updates = calls.filter((call) => call.kind === "update");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0]?.values?.["selection"], {
    maxTickets: 10,
    excludeAssigned: false,
    issueTypes: ["Bug"],
  });
  assert.equal(updates[0]?.values?.["writebackEnabled"], true);
  assert.equal(calls.filter((call) => call.kind === "select").length, 1);
});

// ---------------------------------------------------------------------------
// @happy 4: register still sets the selection it is given, and still leaves
// write-back alone
// ---------------------------------------------------------------------------

// Extends "[happy-4] register still writes the selection it is given, on
// insert and on conflict": register on a store that also syncs keeps its
// overwrite, while the sync beside it does not.
test("[happy-4] register beside a sync still sets its selection on insert and on conflict, and leaves write-back alone", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_1", baseInput);
  await boards.register("org_1", {
    ...baseInput,
    selection: { maxTickets: 3 },
  });

  const [synced, registered] = inserts(calls);
  assert.equal("selection" in (synced?.conflict?.set ?? {}), false);

  const values = registered?.values ?? {};
  const set = registered?.conflict?.set ?? {};
  assert.deepEqual(values["selection"], { maxTickets: 3 });
  assert.deepEqual(set["selection"], { maxTickets: 3 });
  assert.equal("writebackEnabled" in values, false);
  assert.equal("writebackEnabled" in set, false);
});

// Extends "[happy-4] register replaces the selection with a fuller one ...":
// a sync first does not make register merge its selection with anything.
test("[happy-4] register after a sync writes exactly the selection it is given, not a merge with the stored one", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);
  const selection = { minAgeDays: 0, maxAgeDays: null, minSpecChars: 120 };

  await boards.sync("org_1", { ...baseInput, projectKey: "ACME" });
  await boards.register("org_1", { ...baseInput, selection });

  const registered = inserts(calls)[1];
  assert.deepEqual(registered?.values?.["selection"], selection);
  assert.deepEqual(registered?.conflict?.set?.["selection"], selection);
  assert.equal("writebackEnabled" in (registered?.values ?? {}), false);
});

// ---------------------------------------------------------------------------
// @boundary 4: register without a selection still resets it to empty, unlike
// sync
// ---------------------------------------------------------------------------

// Extends "[boundary-4] register without a selection resets it to empty and
// passes no setWhere": the same input to sync and to register, side by side.
test("[boundary-4] register without a selection resets it to {} with no setWhere, where sync with the same input sets no selection and is guarded", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.register("org_1", baseInput);
  await boards.sync("org_1", baseInput);

  const [registered, synced] = inserts(calls);
  assert.equal(registered?.conflictCalls, 1);
  assert.deepEqual(registered?.conflict?.set?.["selection"], {});
  assert.equal(registered?.conflict?.setWhere, undefined);

  assert.equal("selection" in (synced?.conflict?.set ?? {}), false);
  assert.notEqual(synced?.conflict?.setWhere, undefined);
});

// Extends "[boundary-4] register with an explicitly empty selection also
// resets it ...": a sync in between does not leave a guard behind on
// register.
test("[boundary-4] register for another organization after a sync still resets the selection and passes no setWhere", async (t) => {
  const { store: boards, calls } = store(t, [storedRow()]);

  await boards.sync("org_2", baseInput);
  await boards.register("org_2", { ...baseInput, projectKey: "ACME" });

  const registered = inserts(calls)[1];
  assert.ok(registered !== undefined);
  assert.deepEqual(registered.conflict?.set?.["selection"], {});
  assert.equal(registered.conflict?.setWhere, undefined);
  assert.notEqual(inserts(calls)[0]?.conflict?.setWhere, undefined);
});
