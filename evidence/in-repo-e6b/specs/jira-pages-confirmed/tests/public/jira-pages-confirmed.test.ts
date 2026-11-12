import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";

import type { Database } from "../src/errors.js";
import { createJiraBoardStore } from "../src/jira-boards.js";
import type { SyncBoardInput } from "../src/jira-boards.js";
import { jiraBoard } from "../src/schema.js";
import type { JiraBoardRow } from "../src/schema.js";

/**
 * A test-local copy of `fake-db.ts` that also records the argument passed to
 * `onConflictDoUpdate`, so `target`, `set` and the absence of `setWhere` are
 * observable. Like the original, it records calls rather than interpreting
 * SQL, and every query resolves to the rows it was given.
 */
interface RecordedCall {
  readonly kind: "select" | "insert" | "update" | "delete";
  readonly values?: Record<string, unknown>;
  readonly conflict?: Record<string, unknown>;
}

interface RecordingDb {
  readonly db: Database;
  readonly calls: RecordedCall[];
}

function chain(
  rows: readonly unknown[],
  onConflict?: (arg: Record<string, unknown>) => void,
  failure?: unknown,
): unknown {
  const result: Record<string, unknown> = {
    from: () => result,
    where: () => result,
    returning: () => result,
    set: () => result,
    values: () => result,
    onConflictDoUpdate: (arg: Record<string, unknown>) => {
      onConflict?.(arg);
      return result;
    },
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
  options: { readonly insertFailure?: unknown } = {},
): RecordingDb {
  const calls: RecordedCall[] = [];

  const db = {
    select: () => {
      calls.push({ kind: "select" });
      return chain(rows);
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const call: RecordedCall = { kind: "insert", values };
        calls.push(call);
        return chain(
          rows,
          (arg) => {
            Object.assign(call, { conflict: arg });
          },
          options.insertFailure,
        );
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        calls.push({ kind: "update", values });
        return chain(rows);
      },
    }),
    delete: () => {
      calls.push({ kind: "delete" });
      return chain(rows);
    },
  };

  return { db: db as unknown as Database, calls };
}

/** The spec's "stored row". */
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

function store(
  rows: readonly unknown[],
  options: { readonly insertFailure?: unknown } = {},
) {
  const fake = createRecordingDb(rows, options);
  return { ...fake, store: createJiraBoardStore(fake.db) };
}

const NOW = new Date("2026-10-01T12:00:00.000Z");

/** A fixed clock and deterministic ids; both are restored after the test. */
function fixture(t: TestContext): void {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  let counter = 0;
  t.mock.method(globalThis.crypto, "randomUUID", () => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  });
}

const baseInput: SyncBoardInput = {
  connectionId: "jrc_1",
  externalId: "42",
  name: "Acme board",
  boardType: "scrum",
};

function insertsOf(calls: readonly RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.kind === "insert");
}

function valuesOf(call: RecordedCall | undefined): Record<string, unknown> {
  return call?.values ?? {};
}

function conflictOf(call: RecordedCall | undefined): Record<string, unknown> {
  return call?.conflict ?? {};
}

function setOf(call: RecordedCall | undefined): Record<string, unknown> {
  return (conflictOf(call)["set"] ?? {}) as Record<string, unknown>;
}

const SYNC_INSERT_KEYS = [
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

const SYNC_SET_KEYS = ["boardType", "name", "projectKey", "updatedAt"];

// --- @happy 1: A board seen for the first time is inserted with empty settings

test("[happy-1] a board seen for the first time is inserted with empty settings", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);
  const calledAt = Date.now();

  await boards.sync("org_1", { ...baseInput, projectKey: "ACME" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
  const values = valuesOf(calls[0]);
  assert.deepEqual(Object.keys(values).sort(), SYNC_INSERT_KEYS);
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

test("[happy-1] updatedAt is taken during the call, not when the store was made", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  t.mock.timers.tick(60_000);
  const calledAt = Date.now();
  await boards.sync("org_1", baseInput);

  const updatedAt = valuesOf(calls[0])["updatedAt"];
  assert.ok(updatedAt instanceof Date);
  assert.equal(updatedAt.getTime(), calledAt);
  assert.equal(updatedAt.getTime(), NOW.getTime() + 60_000);
});

// --- @happy 2: The conflict clause targets the board's Jira identity and sets only Jira's facts

test("[happy-2] the conflict clause targets the Jira identity and sets only Jira's facts", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", {
    connectionId: "jrc_1",
    externalId: "42",
    name: "Acme board (renamed)",
    boardType: "kanban",
    projectKey: "ACME2",
  });

  const conflict = conflictOf(calls[0]);
  const target = conflict["target"] as unknown[];
  assert.ok(Array.isArray(target));
  assert.equal(target.length, 2);
  assert.equal(target[0], jiraBoard.connectionId);
  assert.equal(target[1], jiraBoard.externalId);

  const set = setOf(calls[0]);
  assert.deepEqual(Object.keys(set).sort(), SYNC_SET_KEYS);
  assert.equal(set["name"], "Acme board (renamed)");
  assert.equal(set["boardType"], "kanban");
  assert.equal(set["projectKey"], "ACME2");
  assert.ok(set["updatedAt"] instanceof Date);
  assert.equal("selection" in set, false);
  assert.equal("writebackEnabled" in set, false);
  assert.equal("organizationId" in set, false);
});

test("[happy-2] the conflict set carries the same values as the insert", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", {
    connectionId: "jrc_1",
    externalId: "42",
    name: "Acme board (renamed)",
    boardType: "kanban",
    projectKey: "ACME2",
  });

  const values = valuesOf(calls[0]);
  const set = setOf(calls[0]);
  assert.equal(set["name"], values["name"]);
  assert.equal(set["boardType"], values["boardType"]);
  assert.equal(set["projectKey"], values["projectKey"]);
  assert.ok(values["updatedAt"] instanceof Date);
  assert.ok(set["updatedAt"] instanceof Date);
  assert.equal(
    (set["updatedAt"] as Date).getTime(),
    (values["updatedAt"] as Date).getTime(),
  );
  assert.equal("connectionId" in set, false);
  assert.equal("externalId" in set, false);
  assert.equal("id" in set, false);
});

// --- @happy 3: The summary carries the stored settings, not defaults

test("[happy-3] the summary carries the stored settings, not defaults", async (t) => {
  fixture(t);
  const { store: boards } = store([
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

test("[happy-3] the summary is the returned row through the same mapping get uses", async (t) => {
  fixture(t);
  const row = storedRow({
    name: "Acme board (renamed)",
    projectKey: null,
    writebackEnabled: false,
    selection: {
      maxTickets: 25,
      excludeAssigned: false,
      issueTypes: ["Bug", "Story"],
      minAgeDays: 2,
      maxAgeDays: null,
      minSpecChars: 80,
    },
  });
  const { store: boards } = store([row]);

  const synced = await boards.sync("org_1", {
    ...baseInput,
    name: "Acme board (renamed)",
    projectKey: "IGNORED",
  });
  const got = await boards.get("org_1", "jrb_1");

  assert.deepEqual(synced, got);
  assert.equal(synced.writebackEnabled, false);
  assert.equal(synced.projectKey, null);
});

// --- @boundary 1: A stored null selection reads back as empty settings

test("[boundary-1] a stored null selection reads back as empty settings", async (t) => {
  fixture(t);
  const { store: boards } = store([
    storedRow({ selection: null as unknown as Record<string, never> }),
  ]);

  const summary = await boards.sync("org_1", baseInput);

  assert.deepEqual(summary.selection, {});
});

test("[boundary-1] a stored empty selection reads back as empty, keeping write-back", async (t) => {
  fixture(t);
  const { store: boards } = store([
    storedRow({ selection: {}, writebackEnabled: true }),
  ]);

  const summary = await boards.sync("org_1", baseInput);

  assert.deepEqual(summary.selection, {});
  assert.equal(summary.writebackEnabled, true);
});

// --- @boundary 2: The project key Jira states is what is stored

test('[boundary-2] a projectKey of "ACME" is written as "ACME" on insert and update', async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", { ...baseInput, projectKey: "ACME" });

  assert.equal(valuesOf(calls[0])["projectKey"], "ACME");
  assert.equal(setOf(calls[0])["projectKey"], "ACME");
});

test("[boundary-2] a null projectKey is written as null on insert and update", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", { ...baseInput, projectKey: null });

  assert.equal(valuesOf(calls[0])["projectKey"], null);
  assert.equal(setOf(calls[0])["projectKey"], null);
});

test("[boundary-2] an omitted projectKey is written as null on insert and update", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", baseInput);

  const values = valuesOf(calls[0]);
  const set = setOf(calls[0]);
  assert.equal("projectKey" in values, true);
  assert.equal(values["projectKey"], null);
  assert.equal("projectKey" in set, true);
  assert.equal(set["projectKey"], null);
});

test("[boundary-2] an empty-string projectKey is not nullish and is written as given", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", { ...baseInput, projectKey: "" });

  assert.equal(valuesOf(calls[0])["projectKey"], "");
  assert.equal(setOf(calls[0])["projectKey"], "");
});

// --- @boundary 3: Unusual values pass through unchanged

for (const [name, boardType] of [
  ["", "scrum"],
  ["  Acme  ", "kanban"],
  ["Acme board", "simple"],
  ["Acme board", ""],
] as const) {
  test(`[boundary-3] name ${JSON.stringify(name)} and boardType ${JSON.stringify(boardType)} pass through unchanged`, async (t) => {
    fixture(t);
    const { store: boards, calls } = store([storedRow()]);

    await assert.doesNotReject(() =>
      boards.sync("org_1", { ...baseInput, name, boardType }),
    );

    const values = valuesOf(calls[0]);
    const set = setOf(calls[0]);
    assert.equal(values["name"], name);
    assert.equal(set["name"], name);
    assert.equal(values["boardType"], boardType);
    assert.equal(set["boardType"], boardType);
  });
}

test("[boundary-3] connectionId and externalId are not trimmed or normalised either", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await assert.doesNotReject(() =>
    boards.sync("org_1", {
      connectionId: " jrc_1 ",
      externalId: "042",
      name: "\tAcme\n",
      boardType: "SCRUM",
      projectKey: " acme ",
    }),
  );

  const values = valuesOf(calls[0]);
  assert.equal(values["connectionId"], " jrc_1 ");
  assert.equal(values["externalId"], "042");
  assert.equal(values["name"], "\tAcme\n");
  assert.equal(values["boardType"], "SCRUM");
  assert.equal(values["projectKey"], " acme ");
  assert.equal(setOf(calls[0])["projectKey"], " acme ");
});

// --- @unhappy 1: A selection smuggled past the type is ignored

test("[unhappy-1] a selection smuggled past the type is ignored", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    selection: { maxTickets: 1 },
  } as SyncBoardInput);

  assert.deepEqual(valuesOf(calls[0])["selection"], {});
  assert.equal("selection" in setOf(calls[0]), false);
});

test("[unhappy-1] a full smuggled selection leaves the insert and set keys exactly as specified", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    projectKey: "ACME",
    selection: {
      maxTickets: 1,
      excludeAssigned: false,
      issueTypes: ["Bug"],
      minAgeDays: 0,
      maxAgeDays: 1,
      minSpecChars: 0,
    },
  } as SyncBoardInput);

  const values = valuesOf(calls[0]);
  assert.deepEqual(Object.keys(values).sort(), SYNC_INSERT_KEYS);
  assert.deepEqual(values["selection"], {});
  assert.deepEqual(Object.keys(setOf(calls[0])).sort(), SYNC_SET_KEYS);
});

// --- @unhappy 2: A writebackEnabled smuggled past the type is ignored

test("[unhappy-2] a writebackEnabled smuggled past the type is ignored", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.sync("org_1", {
    ...baseInput,
    writebackEnabled: false,
  } as SyncBoardInput);

  assert.equal("writebackEnabled" in valuesOf(calls[0]), false);
  assert.equal("writebackEnabled" in setOf(calls[0]), false);
});

test("[unhappy-2] a smuggled writebackEnabled of true is ignored as well", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([
    storedRow({ writebackEnabled: false }),
  ]);

  const summary = await boards.sync("org_1", {
    ...baseInput,
    writebackEnabled: true,
  } as SyncBoardInput);

  assert.equal("writebackEnabled" in valuesOf(calls[0]), false);
  assert.deepEqual(Object.keys(setOf(calls[0])).sort(), SYNC_SET_KEYS);
  // The summary is the returned row's, not the smuggled value.
  assert.equal(summary.writebackEnabled, false);
});

// --- @unhappy 3: The conflict update carries no organization guard

test("[unhappy-3] the conflict update carries no organization guard", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([
    storedRow({ organizationId: "org_2" }),
  ]);

  const summary = await boards.sync("org_1", baseInput);

  assert.equal("setWhere" in conflictOf(calls[0]), false);
  assert.equal(summary.id, "jrb_1");
});

test("[unhappy-3] another organization's row is returned as it comes back, with no read or second write", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([
    storedRow({
      organizationId: "org_2",
      name: "Their board",
      selection: { maxTickets: 99 },
      writebackEnabled: false,
    }),
  ]);

  const summary = await boards.sync("org_1", baseInput);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
  assert.equal("setWhere" in conflictOf(calls[0]), false);
  assert.equal(valuesOf(calls[0])["organizationId"], "org_1");
  assert.equal(summary.id, "jrb_1");
  assert.equal(summary.name, "Their board");
  assert.deepEqual(summary.selection, { maxTickets: 99 });
  assert.equal(summary.writebackEnabled, false);
});

// --- @unhappy 4: No returned row rejects with a named error

test("[unhappy-4] no returned row rejects with a named error", async (t) => {
  fixture(t);
  const { store: boards } = store([]);

  await assert.rejects(
    () => boards.sync("org_1", baseInput),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Failed to record the Jira board.");
      return true;
    },
  );
});

test("[unhappy-4] the rejection follows the one insert, and does not use register's message", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([]);

  await assert.rejects(
    () => boards.sync("org_1", { ...baseInput, projectKey: null }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.notEqual(error.message, "Failed to register the Jira board.");
      assert.equal(error.message, "Failed to record the Jira board.");
      return true;
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
});

// --- @unhappy 5: A database error surfaces unchanged

test("[unhappy-5] a database error surfaces unchanged", async (t) => {
  fixture(t);
  const failure = new Error("connection reset");
  const { store: boards } = store([storedRow()], { insertFailure: failure });

  await assert.rejects(
    () => boards.sync("org_1", baseInput),
    (error: unknown) => {
      assert.equal(error, failure);
      return true;
    },
  );
});

test("[unhappy-5] a driver error with its own fields is the same instance, unwrapped", async (t) => {
  fixture(t);
  class PostgresError extends Error {
    readonly code = "23503";
  }
  const failure = new PostgresError("insert violates foreign key constraint");
  const { store: boards } = store([storedRow()], { insertFailure: failure });

  await assert.rejects(
    () => boards.sync("org_1", baseInput),
    (error: unknown) => {
      assert.equal(error, failure);
      assert.ok(error instanceof PostgresError);
      assert.equal(error.code, "23503");
      assert.equal(error.message, "insert violates foreign key constraint");
      return true;
    },
  );
});

// --- @concurrency 1: Two syncs of the same board started together each issue one insert

test("[concurrency-1] two syncs of the same board started together each issue one insert", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

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
  const ids = calls.map((call) => String(valuesOf(call)["id"]));
  assert.match(ids[0] ?? "", /^jrb_/);
  assert.match(ids[1] ?? "", /^jrb_/);
  assert.notEqual(ids[0], ids[1]);
});

test("[concurrency-1] two overlapping syncs of different boards each insert their own board", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await Promise.all([
    boards.sync("org_1", { ...baseInput, externalId: "42" }),
    boards.sync("org_1", { ...baseInput, externalId: "43", name: "Other" }),
  ]);

  assert.equal(calls.length, 2);
  assert.equal(
    calls.some((call) => call.kind !== "insert"),
    false,
  );
  const external = calls.map((call) => valuesOf(call)["externalId"]).sort();
  assert.deepEqual(external, ["42", "43"]);
  for (const call of calls) {
    assert.deepEqual(Object.keys(setOf(call)).sort(), SYNC_SET_KEYS);
  }
  assert.notEqual(valuesOf(calls[0])["id"], valuesOf(calls[1])["id"]);
});

// --- @concurrency 2: A sync overlapping an update does not write the settings the update writes

test("[concurrency-2] a sync overlapping an update does not write the settings the update writes", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  const updating = boards.update("org_1", "jrb_1", {
    selection: { maxTickets: 5 },
    writebackEnabled: false,
  });
  const syncing = boards.sync("org_1", baseInput);
  await assert.doesNotReject(() => Promise.all([updating, syncing]));

  const inserts = insertsOf(calls);
  assert.equal(inserts.length, 1);
  const set = setOf(inserts[0]);
  assert.equal("selection" in set, false);
  assert.equal("writebackEnabled" in set, false);

  const updates = calls.filter((call) => call.kind === "update");
  assert.equal(updates.length, 1);
  const updated = valuesOf(updates[0]);
  assert.deepEqual(updated["selection"], {
    maxTickets: 5,
    excludeAssigned: true,
  });
  assert.equal(updated["writebackEnabled"], false);
});

test("[concurrency-2] a sync started before a selection-only update leaves both settings to the update", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  const syncing = boards.sync("org_1", baseInput);
  const updating = boards.update("org_1", "jrb_1", {
    selection: { excludeAssigned: false },
  });
  await assert.doesNotReject(() => Promise.all([syncing, updating]));

  const inserts = insertsOf(calls);
  assert.equal(inserts.length, 1);
  assert.deepEqual(Object.keys(setOf(inserts[0])).sort(), SYNC_SET_KEYS);

  const updates = calls.filter((call) => call.kind === "update");
  assert.equal(updates.length, 1);
  const updated = valuesOf(updates[0]);
  assert.deepEqual(updated["selection"], {
    maxTickets: 10,
    excludeAssigned: false,
  });
  assert.equal("writebackEnabled" in updated, false);
});

// --- @happy 4: register still sets the selection it is given, and still leaves write-back alone

test("[happy-4] register still sets the selection it is given, and leaves write-back alone", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.register("org_1", {
    ...baseInput,
    selection: { maxTickets: 3 },
  });

  const values = valuesOf(calls[0]);
  assert.deepEqual(values["selection"], { maxTickets: 3 });
  assert.deepEqual(setOf(calls[0])["selection"], { maxTickets: 3 });
  assert.equal("writebackEnabled" in values, false);
});

test("[happy-4] register's selection replaces the stored one rather than merging, and its set omits write-back", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.register("org_1", {
    ...baseInput,
    selection: { maxTickets: 3 },
  });

  const set = setOf(calls[0]);
  // The stored row has excludeAssigned: true; register does not merge it in.
  assert.deepEqual(set["selection"], { maxTickets: 3 });
  assert.equal("writebackEnabled" in set, false);
  assert.equal(calls.length, 1);
});

// --- @boundary 4: register without a selection still resets it to empty, unlike sync

test("[boundary-4] register without a selection still resets it to empty, unlike sync", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.register("org_1", baseInput);

  const conflict = conflictOf(calls[0]);
  assert.deepEqual(setOf(calls[0])["selection"], {});
  assert.equal("setWhere" in conflict, false);
});

test("[boundary-4] register and sync share the conflict target, but only register's set resets the selection", async (t) => {
  fixture(t);
  const { store: boards, calls } = store([storedRow()]);

  await boards.register("org_1", baseInput);
  await boards.sync("org_1", baseInput);

  const registerTarget = conflictOf(calls[0])["target"] as unknown[];
  const syncTarget = conflictOf(calls[1])["target"] as unknown[];
  assert.deepEqual(registerTarget, [
    jiraBoard.connectionId,
    jiraBoard.externalId,
  ]);
  assert.equal(syncTarget.length, 2);
  assert.equal(syncTarget[0], registerTarget[0]);
  assert.equal(syncTarget[1], registerTarget[1]);
  assert.deepEqual(setOf(calls[0])["selection"], {});
  assert.equal("selection" in setOf(calls[1]), false);
});
