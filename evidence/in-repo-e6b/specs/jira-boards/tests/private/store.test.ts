import assert from "node:assert/strict";
import { test } from "node:test";

import { SQL } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

import {
  createJiraBoardStore,
  InvalidJiraBoardError,
  JiraConnectionNotFoundError,
} from "../../src/jira-boards.js";
import type {
  InvalidJiraBoardField,
  JiraBoardSummary,
  RegisterBoardInput,
  StoredBoardSelection,
  UpdateBoardInput,
} from "../../src/jira-boards.js";
import type { jiraBoard, JiraBoardRow } from "../../src/schema.js";
import type { Database } from "../../src/store.js";

// ---- fixtures ---------------------------------------------------------------

/** Row "B1" from the spec's background. */
function boardRow(overrides: Partial<JiraBoardRow> = {}): JiraBoardRow {
  return {
    id: "jrb_1",
    organizationId: "org_1",
    connectionId: "jrc_1",
    externalId: "42",
    name: "Platform",
    boardType: "scrum",
    projectKey: "PLAT",
    selection: { maxTickets: 5, issueTypes: ["Bug"] },
    writebackEnabled: false,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** The summary of row "B1". */
const B1_SUMMARY: JiraBoardSummary = {
  id: "jrb_1",
  connectionId: "jrc_1",
  externalId: "42",
  name: "Platform",
  boardType: "scrum",
  projectKey: "PLAT",
  selection: { maxTickets: 5, issueTypes: ["Bug"] },
  writebackEnabled: false,
  createdAt: "2026-10-01T00:00:00.000Z",
};

/** A row unlike "B1" in every field. */
function otherRow(overrides: Partial<JiraBoardRow> = {}): JiraBoardRow {
  return {
    id: "jrb_77",
    organizationId: "org_9",
    connectionId: "jrc_5",
    externalId: "1001",
    name: "Mobile App",
    boardType: "kanban",
    projectKey: "MOB",
    selection: { excludeAssigned: true, minAgeDays: 3 },
    writebackEnabled: true,
    createdAt: new Date("2025-01-02T03:04:05.006Z"),
    updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    ...overrides,
  };
}

const OTHER_SUMMARY: JiraBoardSummary = {
  id: "jrb_77",
  connectionId: "jrc_5",
  externalId: "1001",
  name: "Mobile App",
  boardType: "kanban",
  projectKey: "MOB",
  selection: { excludeAssigned: true, minAgeDays: 3 },
  writebackEnabled: true,
  createdAt: "2025-01-02T03:04:05.006Z",
};

const SUMMARY_KEYS = [
  "boardType",
  "connectionId",
  "createdAt",
  "externalId",
  "id",
  "name",
  "projectKey",
  "selection",
  "writebackEnabled",
];

function rawSelection(value: unknown): StoredBoardSelection {
  return value as StoredBoardSelection;
}

const REGISTER_42: RegisterBoardInput = {
  connectionId: "jrc_1",
  externalId: "42",
  name: "Platform",
  boardType: "scrum",
};

// ---- database fake ----------------------------------------------------------

/**
 * One recorded query: its kind, the table it targets, the values it writes,
 * whether (and with what) a where was applied, whether a join was made, and an
 * `onConflictDoUpdate` config.
 */
interface BoardCall {
  readonly kind: "select" | "insert" | "update" | "delete";
  table?: string;
  values?: Record<string, unknown>;
  filtered?: boolean;
  where?: unknown;
  joined?: boolean;
  conflict?: { target?: unknown; set?: Record<string, unknown> };
}

type Respond = (call: BoardCall) => readonly unknown[];

function nameOf(table: unknown): string | undefined {
  try {
    return getTableConfig(table as typeof jiraBoard).name;
  } catch {
    return undefined;
  }
}

function createBoardDb(respond: readonly unknown[] | Respond) {
  const calls: BoardCall[] = [];
  const rowsFor: Respond =
    typeof respond === "function" ? respond : () => respond;

  function chain(call: BoardCall): unknown {
    const result: Record<string, unknown> = {
      from: (table: unknown) => {
        call.table = nameOf(table);
        return result;
      },
      innerJoin: () => {
        call.joined = true;
        return result;
      },
      leftJoin: () => {
        call.joined = true;
        return result;
      },
      where: (condition: unknown) => {
        call.filtered = true;
        call.where = condition;
        return result;
      },
      set: (values: Record<string, unknown>) => {
        call.values = values;
        return result;
      },
      values: (values: Record<string, unknown>) => {
        call.values = values;
        return result;
      },
      onConflictDoUpdate: (config: {
        target?: unknown;
        set?: Record<string, unknown>;
      }) => {
        call.conflict = config;
        return result;
      },
      returning: () => result,
      orderBy: () => result,
      limit: () => result,
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        try {
          return resolve([...rowsFor(call)]);
        } catch (error) {
          return reject?.(error);
        }
      },
    };
    return result;
  }

  function start(kind: BoardCall["kind"], table?: unknown): unknown {
    const call: BoardCall = { kind };
    if (table !== undefined) {
      call.table = nameOf(table);
    }
    calls.push(call);
    return chain(call);
  }

  const db = {
    select: () => start("select"),
    insert: (table: unknown) => start("insert", table),
    update: (table: unknown) => start("update", table),
    delete: (table: unknown) => start("delete", table),
  };

  return { db: db as unknown as Database, calls };
}

function store(respond: readonly unknown[] | Respond) {
  const fake = createBoardDb(respond);
  return { ...fake, boards: createJiraBoardStore(fake.db) };
}

/** The connection select sees a row; the upsert returns `upserted`. */
function registerDb(upserted: readonly unknown[]): Respond {
  return (call) => (call.kind === "select" ? [{ id: "jrc_1" }] : upserted);
}

const dialect = new PgDialect();

/** The parameters a call's where condition binds, rendered by Drizzle. */
function whereParams(call: BoardCall | undefined): unknown[] {
  assert.ok(call?.filtered, "no where was applied");
  const condition = call.where;
  const sql =
    condition instanceof SQL ? condition : (condition as SQLWrapper).getSQL();
  return dialect.sqlToQuery(sql).params;
}

function assertScopedTo(call: BoardCall | undefined, ...values: string[]) {
  const params = whereParams(call);
  for (const value of values) {
    assert.ok(
      params.includes(value),
      `the where does not filter on ${value}: ${JSON.stringify(params)}`,
    );
  }
}

function isInvalid(
  field: InvalidJiraBoardField,
  message?: string,
): (error: unknown) => boolean {
  return (error) => {
    assert.ok(error instanceof InvalidJiraBoardError);
    assert.equal(error.name, "InvalidJiraBoardError");
    assert.equal(error.field, field);
    if (message !== undefined) {
      assert.equal(error.message, message);
    }
    return true;
  };
}

function isConnectionNotFound(connectionId: string): (error: unknown) => boolean {
  return (error) => {
    assert.ok(error instanceof JiraConnectionNotFoundError);
    assert.equal(error.name, "JiraConnectionNotFoundError");
    assert.equal(error.message, `No Jira connection with id "${connectionId}".`);
    return true;
  };
}

function columnNames(columns: unknown): string[] {
  const list = Array.isArray(columns) ? columns : [columns];
  return list.map((column) => String((column as { name?: unknown }).name));
}

function ids(boards: readonly JiraBoardSummary[]): string[] {
  return boards.map((board) => board.id);
}

function at(id: string, iso: string): JiraBoardRow {
  return boardRow({ id, createdAt: new Date(iso) });
}

// ---- happy-1: summaries -----------------------------------------------------

// Extends "[happy-1] get maps a stored row to a summary with exactly nine
// keys": a row unlike "B1" in every field, so a summary hard-wired to "B1" or
// one that reads createdAt from updatedAt fails.
test("[happy-1] get maps a row with other values field by field", async () => {
  const { boards } = store([otherRow()]);

  const summary = await boards.get("org_9", "jrb_77");

  assert.deepEqual(summary, OTHER_SUMMARY);
  assert.deepEqual(Object.keys(summary ?? {}).sort(), SUMMARY_KEYS);
});

// Extends "[happy-1] get maps a stored row to a summary with exactly nine
// keys": list maps every row the same way.
test("[happy-1] list maps each row to a summary with exactly nine keys", async () => {
  const { boards } = store([otherRow(), boardRow()]);

  const listed = await boards.list("org_1");

  assert.deepEqual(listed, [B1_SUMMARY, OTHER_SUMMARY]);
  for (const summary of listed) {
    assert.deepEqual(Object.keys(summary).sort(), SUMMARY_KEYS);
  }
});

// ---- boundary-1: a null project key -----------------------------------------

// Extends "[boundary-1] a null project key stays null": forRun, update and
// register map it the same way.
test("[boundary-1] a null project key stays null through forRun", async () => {
  const { boards } = store([
    {
      board: boardRow({ projectKey: null }),
      cloudId: "cloud-1",
      siteUrl: "https://acme.atlassian.net",
    },
  ]);

  const run = await boards.forRun("org_1", "jrb_1");

  assert.ok(run);
  assert.equal(run.board.projectKey, null);
});

test("[boundary-1] a null project key stays null through update and register", async () => {
  const { boards } = store(registerDb([boardRow({ projectKey: null })]));

  const updated = await boards.update("org_1", "jrb_1", { writebackEnabled: true });
  const registered = await boards.register("org_1", REGISTER_42);

  assert.ok(updated);
  assert.equal(updated.projectKey, null);
  assert.equal(registered.projectKey, null);
});

// ---- boundary-2: read-time sanitizing ---------------------------------------

// Extends the "[boundary-2] a stored selection ... reads as ..." outline with
// more stored values for every key.
const SANITIZED: ReadonlyArray<readonly [string, unknown, StoredBoardSelection]> = [
  [
    "all six valid keys and two unknown ones",
    {
      maxTickets: 10,
      excludeAssigned: true,
      issueTypes: ["Bug", "Task"],
      minAgeDays: 14,
      maxAgeDays: 365,
      minSpecChars: 200,
      colour: "red",
      priority: 1,
    },
    {
      maxTickets: 10,
      excludeAssigned: true,
      issueTypes: ["Bug", "Task"],
      minAgeDays: 14,
      maxAgeDays: 365,
      minSpecChars: 200,
    },
  ],
  ["maxTickets 100", { maxTickets: 100 }, { maxTickets: 100 }],
  ["maxTickets 1", { maxTickets: 1 }, { maxTickets: 1 }],
  ["maxTickets the string 5", { maxTickets: "5" }, {}],
  ["maxTickets 2.5 beside excludeAssigned true", { maxTickets: 2.5, excludeAssigned: true }, { excludeAssigned: true }],
  ["maxTickets -3", { maxTickets: -3 }, {}],
  ["excludeAssigned false", { excludeAssigned: false }, { excludeAssigned: false }],
  ["excludeAssigned null", { excludeAssigned: null }, {}],
  ["excludeAssigned 1", { excludeAssigned: 1 }, {}],
  ["minAgeDays -1 beside maxAgeDays 0", { minAgeDays: -1, maxAgeDays: 0 }, { maxAgeDays: 0 }],
  ["minAgeDays null", { minAgeDays: null }, {}],
  ["minAgeDays 2^53", { minAgeDays: 2 ** 53 }, {}],
  ["minAgeDays 0", { minAgeDays: 0 }, { minAgeDays: 0 }],
  ["maxAgeDays -1", { maxAgeDays: -1 }, {}],
  ["maxAgeDays the string 7 beside minAgeDays 0", { maxAgeDays: "7", minAgeDays: 0 }, { minAgeDays: 0 }],
  ["maxAgeDays 1.5", { maxAgeDays: 1.5 }, {}],
  ["maxAgeDays null beside minAgeDays 30", { maxAgeDays: null, minAgeDays: 30 }, { minAgeDays: 30, maxAgeDays: null }],
  ["minSpecChars -5 beside maxTickets 3", { minSpecChars: -5, maxTickets: 3 }, { maxTickets: 3 }],
  ["minSpecChars 0", { minSpecChars: 0 }, { minSpecChars: 0 }],
  ["minSpecChars the string 200", { minSpecChars: "200" }, {}],
  ["issueTypes needing trimming and de-duplication", { issueTypes: [" Bug ", "Task", "Bug"] }, { issueTypes: ["Bug", "Task"] }],
  ["issueTypes with a whitespace-only entry", { issueTypes: ["Bug", "  "] }, {}],
  ["issueTypes with a blank entry first", { issueTypes: ["", "Bug", "Task"] }, {}],
  ["issueTypes with a number", { issueTypes: ["Bug", 7] }, {}],
  ["issueTypes with a null", { issueTypes: ["Bug", null] }, {}],
  ["issueTypes []", { issueTypes: [] }, {}],
  ["issueTypes differing in case", { issueTypes: ["bug", "Bug"] }, { issueTypes: ["bug", "Bug"] }],
  ["an invalid issueTypes beside a valid maxTickets", { issueTypes: ["Bug", ""], maxTickets: 9 }, { maxTickets: 9 }],
  ["a number", 5, {}],
  ["true", true, {}],
  ["an array holding a selection", [{ maxTickets: 5 }], {}],
];

for (const [label, stored, read] of SANITIZED) {
  test(`[boundary-2] get reads a stored selection of ${label} as ${JSON.stringify(read)}`, async () => {
    const { boards } = store([boardRow({ selection: rawSelection(stored) })]);

    const summary = await boards.get("org_1", "jrb_1");

    assert.ok(summary);
    assert.deepEqual(summary.selection, read);
  });
}

// Extends the "[boundary-2]" outline: a list sanitizes each row on its own.
test("[boundary-2] list sanitizes each row's selection on its own", async () => {
  const { boards } = store([
    at("jrb_a", "2026-10-03T00:00:00.000Z"),
    boardRow({
      id: "jrb_b",
      createdAt: new Date("2026-10-02T00:00:00.000Z"),
      selection: rawSelection({ maxTickets: 101, issueTypes: [" Bug", "Bug"] }),
    }),
    boardRow({
      id: "jrb_c",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      selection: rawSelection("text"),
    }),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(
    listed.map((board) => board.selection),
    [{ maxTickets: 5, issueTypes: ["Bug"] }, { issueTypes: ["Bug"] }, {}],
  );
});

// ---- happy-2 and boundary-3/4: list ------------------------------------------

// Extends "[happy-2] list is owner-scoped and newest first": five rows whose
// ids follow neither date order nor its reverse, shuffled.
test("[happy-2] list sorts five shuffled boards newest first whatever their ids", async () => {
  const { boards } = store([
    at("jrb_b", "2026-09-01T00:00:00.000Z"),
    at("jrb_e", "2026-10-15T00:00:00.000Z"),
    at("jrb_c", "2026-08-01T00:00:00.000Z"),
    at("jrb_d", "2026-11-01T00:00:00.000Z"),
    at("jrb_a", "2026-10-20T00:00:00.000Z"),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(ids(listed), ["jrb_d", "jrb_a", "jrb_e", "jrb_b", "jrb_c"]);
});

// Extends "[happy-2] list is owner-scoped and newest first": oldest-first
// input across a year boundary is reversed.
test("[happy-2] list reverses oldest-first input across a year boundary", async () => {
  const { boards } = store([
    at("jrb_x", "2025-12-31T23:59:59.999Z"),
    at("jrb_y", "2026-01-01T00:00:00.000Z"),
    at("jrb_w", "2026-02-01T00:00:00.000Z"),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(ids(listed), ["jrb_w", "jrb_y", "jrb_x"]);
});

// Extends "[happy-2] list is owner-scoped and newest first": the where binds
// the caller's organization id.
test("[happy-2] list filters on the caller's organization id", async () => {
  const { boards, calls } = store([boardRow({ organizationId: "org_7" })]);

  await boards.list("org_7");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.table, "jira_board");
  assertScopedTo(calls[0], "org_7");
});

// Extends "[boundary-3] equal timestamps fall back to id order": three ties
// given in descending id order.
test("[boundary-3] three equal timestamps given in descending id order come back ascending", async () => {
  const { boards } = store([
    at("jrb_c", "2026-10-01T00:00:00.000Z"),
    at("jrb_b", "2026-10-01T00:00:00.000Z"),
    at("jrb_a", "2026-10-01T00:00:00.000Z"),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(ids(listed), ["jrb_a", "jrb_b", "jrb_c"]);
});

// Extends "[boundary-3] ties sort by id ascending beneath a newer board": two
// groups of ties, interleaved, where the newer group's ids sort after the
// older group's.
test("[boundary-3] two interleaved groups of ties each sort by id beneath their timestamp", async () => {
  const { boards } = store([
    at("jrb_b", "2026-10-01T00:00:00.000Z"),
    at("jrb_y", "2026-10-02T00:00:00.000Z"),
    at("jrb_a", "2026-10-01T00:00:00.000Z"),
    at("jrb_x", "2026-10-02T00:00:00.000Z"),
    at("jrb_c", "2026-09-30T00:00:00.000Z"),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(ids(listed), ["jrb_x", "jrb_y", "jrb_a", "jrb_b", "jrb_c"]);
});

// Extends "[boundary-4] an organization with no boards lists none": another
// organization, still filtered on its id.
test("[boundary-4] another organization with no boards lists none, filtered on its id", async () => {
  const { boards, calls } = store([]);

  const listed = await boards.list("org_2");

  assert.deepEqual(listed, []);
  assertScopedTo(calls[0], "org_2");
});

// ---- happy-3 and unhappy-1: get ----------------------------------------------

// Extends "[happy-3] get is owner-scoped": the where binds both the
// organization and the board id, on jira_board.
test("[happy-3] get filters on both the organization id and the board id", async () => {
  const { boards, calls } = store([otherRow()]);

  await boards.get("org_3", "jrb_9");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.table, "jira_board");
  assertScopedTo(calls[0], "org_3", "jrb_9");
});

// Extends "[unhappy-1] get for another organization's board is null": the
// miss is null for the caller's own organization id, filtered on it.
test("[unhappy-1] get for another organization's board is null and filtered on the caller", async () => {
  const { boards, calls } = store([]);

  const summary = await boards.get("org_2", "jrb_1");

  assert.equal(summary, null);
  assertScopedTo(calls[0], "org_2", "jrb_1");
});

// ---- happy-5: register --------------------------------------------------------

// Extends "[happy-5] register writes a prefixed, owner-scoped row with
// write-back off": other values in every field, all needing normalization.
test("[happy-5] register normalizes and writes other values, owner-scoped", async () => {
  const { boards, calls } = store((call) =>
    call.kind === "select" ? [{ id: "jrc_9" }] : [otherRow()],
  );

  await boards.register("org_7", {
    connectionId: "jrc_9",
    externalId: " 1001\t",
    name: "Mobile App ",
    boardType: " kanban ",
    projectKey: " MOB ",
    selection: rawSelection({
      issueTypes: [" Bug", "Bug", "Story"],
      maxTickets: 20,
      colour: "red",
    }),
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.table, "jira_connection");
  assertScopedTo(calls[0], "org_7", "jrc_9");
  assert.equal(calls[1]?.kind, "insert");
  assert.equal(calls[1]?.table, "jira_board");
  const values = calls[1]?.values ?? {};
  assert.match(String(values["id"]), /^jrb_/);
  assert.equal(values["organizationId"], "org_7");
  assert.equal(values["connectionId"], "jrc_9");
  assert.equal(values["externalId"], "1001");
  assert.equal(values["name"], "Mobile App");
  assert.equal(values["boardType"], "kanban");
  assert.equal(values["projectKey"], "MOB");
  assert.deepEqual(values["selection"], {
    maxTickets: 20,
    issueTypes: ["Bug", "Story"],
  });
  assert.equal(values["writebackEnabled"], false);
});

// Extends "[happy-5] register writes a prefixed, owner-scoped row with
// write-back off": the result is the summary of the row the database
// returns, not one built from the input.
test("[happy-5] register resolves to the summary of the returned row, not of the input", async () => {
  const { boards } = store(registerDb([otherRow()]));

  const summary = await boards.register("org_9", {
    connectionId: "jrc_5",
    externalId: "1001",
    name: "Mobile App",
    boardType: "kanban",
    projectKey: "MOB",
  });

  assert.deepEqual(summary, OTHER_SUMMARY);
});

// ---- boundary-7: optional and blank fields ------------------------------------

// Extends the "[boundary-7] register with ... stores ..." outline with more
// blank and padded values.
const DEFAULTS: ReadonlyArray<{
  readonly label: string;
  readonly boardType: string;
  readonly projectKey?: string | null | undefined;
  readonly selection?: StoredBoardSelection;
  readonly storedType: string;
  readonly storedKey: string | null;
  readonly storedSelection: StoredBoardSelection;
}> = [
  { label: 'boardType "", projectKey ""', boardType: "", projectKey: "", storedType: "unknown", storedKey: null, storedSelection: {} },
  { label: 'boardType "\\t\\n", projectKey "\\tPLAT\\n"', boardType: "\t\n", projectKey: "\tPLAT\n", storedType: "unknown", storedKey: "PLAT", storedSelection: {} },
  { label: 'boardType " kanban ", projectKey undefined', boardType: " kanban ", projectKey: undefined, storedType: "kanban", storedKey: null, storedSelection: {} },
  { label: 'selection {"maxTickets":undefined}', boardType: "scrum", selection: { maxTickets: undefined }, storedType: "scrum", storedKey: null, storedSelection: {} },
  { label: 'selection {"colour":"red"}', boardType: "scrum", selection: rawSelection({ colour: "red" }), storedType: "scrum", storedKey: null, storedSelection: {} },
  { label: 'selection {"issueTypes":["  Bug","Bug"]}', boardType: "simple", projectKey: "P", selection: { issueTypes: ["  Bug", "Bug"] }, storedType: "simple", storedKey: "P", storedSelection: { issueTypes: ["Bug"] } },
];

for (const row of DEFAULTS) {
  test(`[boundary-7] register with ${row.label} stores ${row.storedType}, ${String(row.storedKey)}, ${JSON.stringify(row.storedSelection)}`, async () => {
    const { boards, calls } = store(registerDb([boardRow()]));
    const input: RegisterBoardInput = {
      connectionId: "jrc_1",
      externalId: "42",
      name: "Platform",
      boardType: row.boardType,
      ...("projectKey" in row ? { projectKey: row.projectKey } : {}),
      ...(row.selection !== undefined ? { selection: row.selection } : {}),
    };

    await boards.register("org_1", input);

    const insert = calls.find((call) => call.kind === "insert");
    assert.ok(insert);
    assert.equal(insert.values?.["boardType"], row.storedType);
    assert.equal(insert.values?.["projectKey"], row.storedKey);
    assert.deepEqual(insert.values?.["selection"], row.storedSelection);
  });
}

// ---- unhappy-4 and unhappy-5: register validation -----------------------------

// Extends the "[unhappy-4] register with externalId ... rejects naming ..."
// outline with other whitespace.
const BLANK: ReadonlyArray<readonly [string, string, InvalidJiraBoardField, string]> = [
  ["\n\t", "Platform", "externalId", "A board needs its Jira id."],
  ["\r\n ", "Platform", "externalId", "A board needs its Jira id."],
  ["42", "\n", "name", "A board needs a name."],
  ["  42  ", "\t\t", "name", "A board needs a name."],
];

for (const [externalId, name, field, message] of BLANK) {
  test(`[unhappy-4] register with externalId ${JSON.stringify(externalId)} and name ${JSON.stringify(name)} rejects naming ${field} with no database call`, async () => {
    const { boards, calls } = store(registerDb([boardRow()]));

    await assert.rejects(
      () =>
        boards.register("org_1", {
          connectionId: "jrc_1",
          externalId,
          name,
          boardType: "scrum",
        }),
      isInvalid(field, message),
    );
    assert.equal(calls.length, 0);
  });
}

// Extends "[unhappy-4] a blank externalId is reported before a blank name":
// with an invalid selection too, externalId still comes first.
test("[unhappy-4] a blank externalId is reported before a blank name and an invalid selection", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  await assert.rejects(
    () =>
      boards.register("org_1", {
        connectionId: "jrc_1",
        externalId: "",
        name: "",
        boardType: "scrum",
        selection: { maxTickets: 0 },
      }),
    isInvalid("externalId", "A board needs its Jira id."),
  );
  assert.equal(calls.length, 0);
});

// Extends "[unhappy-5] an invalid selection is rejected before the database
// is touched": other invalid selections, with their messages.
const INVALID_SELECTIONS: ReadonlyArray<
  readonly [string, unknown, InvalidJiraBoardField, string]
> = [
  ['{"issueTypes":["  "]}', { issueTypes: ["  "] }, "issueTypes", "issueTypes must be a list of non-empty names."],
  ['{"minAgeDays":30,"maxAgeDays":7}', { minAgeDays: 30, maxAgeDays: 7 }, "maxAgeDays", "maxAgeDays cannot be less than minAgeDays."],
  ['{"excludeAssigned":"yes"}', { excludeAssigned: "yes" }, "excludeAssigned", "excludeAssigned must be true or false."],
  ['{"minSpecChars":-1,"maxTickets":101}', { minSpecChars: -1, maxTickets: 101 }, "maxTickets", "maxTickets must be a whole number from 1 to 100."],
  ['{"minSpecChars":1.5}', { minSpecChars: 1.5 }, "minSpecChars", "minSpecChars must be a whole number, 0 or more."],
];

for (const [label, selection, field, message] of INVALID_SELECTIONS) {
  test(`[unhappy-5] register with selection ${label} rejects naming ${field} with no database call`, async () => {
    const { boards, calls } = store(registerDb([boardRow()]));

    await assert.rejects(
      () =>
        boards.register("org_1", {
          ...REGISTER_42,
          selection: rawSelection(selection),
        }),
      isInvalid(field, message),
    );
    assert.equal(calls.length, 0);
  });
}

// ---- unhappy-6: a connection the organization does not own --------------------

// Extends "[unhappy-6] another organization's connection is refused": the
// connection select is on jira_connection and filtered on both the caller and
// the connection id.
test("[unhappy-6] the refused connection select is on jira_connection, filtered on the caller and the connection", async () => {
  const { boards, calls } = store([]);

  await assert.rejects(
    () => boards.register("org_2", { ...REGISTER_42, connectionId: "jrc_42" }),
    isConnectionNotFound("jrc_42"),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.table, "jira_connection");
  assertScopedTo(calls[0], "org_2", "jrc_42");
});

// Extends "[unhappy-6] another organization's connection is refused": a full
// input, valid in every field, is still refused and nothing is written.
test("[unhappy-6] a full valid input against a missing connection is refused and writes nothing", async () => {
  const { boards, calls } = store((call) =>
    call.kind === "select" ? [] : [boardRow()],
  );

  await assert.rejects(
    () =>
      boards.register("org_1", {
        connectionId: "jrc_gone",
        externalId: "7",
        name: "Ops",
        boardType: "kanban",
        projectKey: "OPS",
        selection: { maxTickets: 3, minAgeDays: 1 },
      }),
    isConnectionNotFound("jrc_gone"),
  );
  assert.deepEqual(
    calls.map((call) => call.kind),
    ["select"],
  );
});

// ---- happy-6 and boundary-8: re-registration ----------------------------------

// Extends "[happy-6] re-registering refreshes Jira's details and keeps the
// board's id": other values, all needing normalization, against a board whose
// write-back is on and whose selection the database keeps.
test("[happy-6] re-registering with other values refreshes them and resolves to the kept row", async () => {
  const kept = boardRow({
    name: "Platform v3",
    boardType: "kanban",
    projectKey: "PLT",
    writebackEnabled: true,
    selection: { minAgeDays: 30 },
  });
  const { boards, calls } = store(registerDb([kept]));

  const summary = await boards.register("org_1", {
    connectionId: "jrc_1",
    externalId: "42",
    name: " Platform v3 ",
    boardType: "kanban",
    projectKey: " PLT ",
  });

  const insert = calls.find((call) => call.kind === "insert");
  assert.ok(insert?.conflict, "the insert has no onConflictDoUpdate");
  assert.deepEqual(columnNames(insert.conflict.target).sort(), [
    "connection_id",
    "external_id",
  ]);
  const set = insert.conflict.set ?? {};
  assert.equal(set["name"], "Platform v3");
  assert.equal(set["boardType"], "kanban");
  assert.equal(set["projectKey"], "PLT");
  assert.ok(set["updatedAt"] instanceof Date);
  for (const key of [
    "selection",
    "writebackEnabled",
    "id",
    "organizationId",
    "createdAt",
  ]) {
    assert.ok(!(key in set), `the conflict update sets ${key}`);
  }
  assert.deepEqual(summary, {
    ...B1_SUMMARY,
    name: "Platform v3",
    boardType: "kanban",
    projectKey: "PLT",
    writebackEnabled: true,
    selection: { minAgeDays: 30 },
  });
});

// Extends "[boundary-8] a re-registration that gives a selection replaces
// it": the selection is normalized before it reaches the conflict update and
// the insert alike.
test("[boundary-8] a re-registration's selection is normalized in the conflict update and the insert", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  await boards.register("org_1", {
    ...REGISTER_42,
    selection: rawSelection({
      issueTypes: [" Bug ", "Bug", "Task"],
      maxAgeDays: null,
      colour: "red",
    }),
  });

  const insert = calls.find((call) => call.kind === "insert");
  const normalized = { issueTypes: ["Bug", "Task"], maxAgeDays: null };
  assert.deepEqual(insert?.conflict?.set?.["selection"], normalized);
  assert.deepEqual(insert?.values?.["selection"], normalized);
});

// Extends "[boundary-8] a re-registration that gives an empty selection
// replaces it with {}": a selection that normalizes to nothing replaces it
// with {} too.
test("[boundary-8] a re-registration whose selection normalizes to nothing replaces it with {}", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  await boards.register("org_1", {
    ...REGISTER_42,
    selection: { issueTypes: [], maxTickets: undefined },
  });

  const set = calls.find((call) => call.kind === "insert")?.conflict?.set ?? {};
  assert.deepEqual(set["selection"], {});
});

// ---- unhappy-7: the upsert returns no row ------------------------------------

// Extends "[unhappy-7] an upsert that returns no row rejects": for a full
// input, and the error is not the missing-connection one.
test("[unhappy-7] an empty upsert for a full input rejects with the plain failure, not a missing connection", async () => {
  const { boards } = store(registerDb([]));

  await assert.rejects(
    () =>
      boards.register("org_1", {
        ...REGISTER_42,
        projectKey: "PLAT",
        selection: { maxTickets: 5 },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!(error instanceof JiraConnectionNotFoundError));
      assert.ok(!(error instanceof InvalidJiraBoardError));
      assert.equal(error.message, "Failed to record the Jira board.");
      return true;
    },
  );
});

// The rule of "[unhappy-7]": database errors pass through unchanged, from the
// insert.
test("[unhappy-7] an error from the upsert passes through unchanged", async () => {
  const failure = new Error("duplicate key value violates something");
  const { boards } = store((call) => {
    if (call.kind === "insert") {
      throw failure;
    }
    return [{ id: "jrc_1" }];
  });

  await assert.rejects(
    () => boards.register("org_1", REGISTER_42),
    (error: unknown) => {
      assert.equal(error, failure);
      return true;
    },
  );
});

// The rule of "[unhappy-7]": database errors pass through unchanged, from the
// connection select.
test("[unhappy-7] an error from the connection select passes through unchanged and nothing is inserted", async () => {
  const failure = new Error("connection reset");
  const { boards, calls } = store((call) => {
    if (call.kind === "select") {
      throw failure;
    }
    return [boardRow()];
  });

  await assert.rejects(
    () => boards.register("org_1", REGISTER_42),
    (error: unknown) => {
      assert.equal(error, failure);
      return true;
    },
  );
  assert.ok(!calls.some((call) => call.kind === "insert"));
});

// ---- happy-7: update ---------------------------------------------------------

// Extends "[happy-7] update replaces the selection and toggles write-back":
// other values, a selection needing normalization, write-back off, and a
// result mapped from the returned row.
test("[happy-7] update writes a normalized selection with write-back off and maps the returned row", async () => {
  const { boards, calls } = store([
    otherRow({
      selection: rawSelection({ issueTypes: ["Bug"], colour: "red" }),
      writebackEnabled: false,
    }),
  ]);

  const summary = await boards.update("org_4", "jrb_8", {
    selection: rawSelection({
      issueTypes: [" Bug", "Bug"],
      colour: "red",
    }),
    writebackEnabled: false,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "update");
  assert.equal(calls[0]?.table, "jira_board");
  assertScopedTo(calls[0], "org_4", "jrb_8");
  const values = calls[0]?.values ?? {};
  assert.deepEqual(values["selection"], { issueTypes: ["Bug"] });
  assert.equal(values["writebackEnabled"], false);
  assert.ok(values["updatedAt"] instanceof Date);
  assert.deepEqual(summary, {
    ...OTHER_SUMMARY,
    selection: { issueTypes: ["Bug"] },
    writebackEnabled: false,
  });
});

// ---- boundary-9/10/11: what update writes --------------------------------------

// Extends the "[boundary-9] update with ... writes exactly ..." outline with
// other combinations.
const WRITTEN: ReadonlyArray<readonly [string, UpdateBoardInput, string[]]> = [
  [
    "{selection: {minAgeDays: 1}, writebackEnabled: true}",
    { selection: { minAgeDays: 1 }, writebackEnabled: true },
    ["selection", "updatedAt", "writebackEnabled"],
  ],
  [
    "{selection: {maxTickets: 3}, writebackEnabled: undefined}",
    { selection: { maxTickets: 3 }, writebackEnabled: undefined },
    ["selection", "updatedAt"],
  ],
  [
    '{selection: {colour: "red"}}',
    { selection: rawSelection({ colour: "red" }) },
    ["selection", "updatedAt"],
  ],
  ["{writebackEnabled: true}", { writebackEnabled: true }, ["updatedAt", "writebackEnabled"]],
];

for (const [label, input, keys] of WRITTEN) {
  test(`[boundary-9] update with ${label} writes exactly ${keys.join(", ")}`, async () => {
    const { boards, calls } = store([boardRow()]);

    await boards.update("org_1", "jrb_1", input);

    assert.equal(calls.length, 1);
    const update = calls.find((call) => call.kind === "update");
    assert.deepEqual(Object.keys(update?.values ?? {}).sort(), keys);
  });
}

// Extends "[boundary-10] a selection that normalizes to nothing clears the
// stored one": undefined and unknown keys normalize to nothing too.
const CLEARING: ReadonlyArray<readonly [string, StoredBoardSelection]> = [
  ["{maxTickets: undefined}", { maxTickets: undefined }],
  ['{colour: "red"}', rawSelection({ colour: "red" })],
  ["{issueTypes: [], minSpecChars: undefined}", { issueTypes: [], minSpecChars: undefined }],
];

for (const [label, selection] of CLEARING) {
  test(`[boundary-10] update with selection ${label} writes selection {}`, async () => {
    const { boards, calls } = store([boardRow({ selection: {} })]);

    const summary = await boards.update("org_1", "jrb_1", { selection });

    const update = calls.find((call) => call.kind === "update");
    assert.deepEqual(update?.values?.["selection"], {});
    assert.deepEqual(summary?.selection, {});
  });
}

// Extends "[boundary-11] an empty update reads instead of writing": other
// all-undefined inputs, a row unlike "B1", and a read filtered on both ids.
const EMPTY_UPDATES: ReadonlyArray<readonly [string, UpdateBoardInput]> = [
  ["{}", {}],
  ["{writebackEnabled: undefined}", { writebackEnabled: undefined }],
  [
    "{selection: undefined, writebackEnabled: undefined}",
    { selection: undefined, writebackEnabled: undefined },
  ],
];

for (const [label, input] of EMPTY_UPDATES) {
  test(`[boundary-11] update with ${label} reads the board instead of writing`, async () => {
    const { boards, calls } = store([otherRow()]);

    const summary = await boards.update("org_9", "jrb_77", input);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "select");
    assert.equal(calls[0]?.table, "jira_board");
    assertScopedTo(calls[0], "org_9", "jrb_77");
    assert.deepEqual(summary, OTHER_SUMMARY);
  });
}

// Extends "[boundary-11] an empty update reads instead of writing": the read
// sanitizes the stored selection as get does.
test("[boundary-11] an empty update's read sanitizes the stored selection", async () => {
  const { boards } = store([
    boardRow({ selection: rawSelection({ maxTickets: 0, minAgeDays: 2 }) }),
  ]);

  const summary = await boards.update("org_1", "jrb_1", {});

  assert.deepEqual(summary?.selection, { minAgeDays: 2 });
});

// ---- unhappy-8/9/10: update misses and invalid input ---------------------------

// Extends the "[unhappy-8] update(...) on a miss is null" outline with other
// inputs, each a single call.
const MISSES: ReadonlyArray<readonly [string, UpdateBoardInput, BoardCall["kind"]]> = [
  ["{selection: {maxTickets: 3}}", { selection: { maxTickets: 3 } }, "update"],
  ["{selection: {}, writebackEnabled: false}", { selection: {}, writebackEnabled: false }, "update"],
  ["{writebackEnabled: undefined}", { writebackEnabled: undefined }, "select"],
];

for (const [label, input, kind] of MISSES) {
  test(`[unhappy-8] update("org_2", "jrb_1", ${label}) on a miss is null after one ${kind}`, async () => {
    const { boards, calls } = store([]);

    const result = await boards.update("org_2", "jrb_1", input);

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, kind);
    assertScopedTo(calls[0], "org_2", "jrb_1");
  });
}

// Extends the "[unhappy-9] update with ... rejects naming ... before the
// database is touched" outline with other invalid inputs and their messages.
const INVALID_UPDATES: ReadonlyArray<
  readonly [string, unknown, InvalidJiraBoardField, string]
> = [
  [
    "{selection: {maxTickets: 101}}",
    { selection: { maxTickets: 101 } },
    "maxTickets",
    "maxTickets must be a whole number from 1 to 100.",
  ],
  [
    '{selection: {issueTypes: "Bug"}}',
    { selection: { issueTypes: "Bug" } },
    "issueTypes",
    "issueTypes must be a list of non-empty names.",
  ],
  [
    "{selection: {minAgeDays: 8, maxAgeDays: 7}, writebackEnabled: true}",
    { selection: { minAgeDays: 8, maxAgeDays: 7 }, writebackEnabled: true },
    "maxAgeDays",
    "maxAgeDays cannot be less than minAgeDays.",
  ],
  [
    '{selection: {minAgeDays: 30, maxAgeDays: 7}, writebackEnabled: "yes"}',
    { selection: { minAgeDays: 30, maxAgeDays: 7 }, writebackEnabled: "yes" },
    "maxAgeDays",
    "maxAgeDays cannot be less than minAgeDays.",
  ],
  [
    '{selection: {maxTickets: 3}, writebackEnabled: "true"}',
    { selection: { maxTickets: 3 }, writebackEnabled: "true" },
    "writebackEnabled",
    "writebackEnabled must be true or false.",
  ],
];

for (const [label, input, field, message] of INVALID_UPDATES) {
  test(`[unhappy-9] update with ${label} rejects naming ${field} before the database is touched`, async () => {
    const { boards, calls } = store([boardRow()]);

    await assert.rejects(
      () => boards.update("org_1", "jrb_1", input as UpdateBoardInput),
      isInvalid(field, message),
    );
    assert.equal(calls.length, 0);
  });
}

// Extends "[unhappy-10] a non-boolean writebackEnabled names the field and
// says so": other non-boolean values.
const NOT_BOOLEAN: ReadonlyArray<readonly [string, unknown]> = [
  ['"false"', "false"],
  ["0", 0],
  ["[]", []],
  ["{}", {}],
];

for (const [label, value] of NOT_BOOLEAN) {
  test(`[unhappy-10] writebackEnabled ${label} names the field and says so`, async () => {
    const { boards, calls } = store([boardRow()]);

    await assert.rejects(
      () =>
        boards.update("org_1", "jrb_1", {
          writebackEnabled: value,
        } as unknown as UpdateBoardInput),
      isInvalid("writebackEnabled", "writebackEnabled must be true or false."),
    );
    assert.equal(calls.length, 0);
  });
}

// ---- concurrency ------------------------------------------------------------

// Extends "[concurrency-1] update overlapping a remove resolves to null
// without bringing the board back": the remove started first, and the
// update writing a selection as well.
test("[concurrency-1] an update started after an overlapping remove still resolves to null", async () => {
  const { boards, calls } = store((call) =>
    call.kind === "delete" ? [boardRow()] : [],
  );

  const removing = boards.remove("org_1", "jrb_1");
  const updating = boards.update("org_1", "jrb_1", {
    selection: { maxTickets: 2 },
    writebackEnabled: true,
  });
  const [removed, updated] = await Promise.all([removing, updating]);

  assert.equal(removed, true);
  assert.equal(updated, null);
  assert.deepEqual(
    calls.map((call) => call.kind).sort(),
    ["delete", "update"],
  );
});

function assertRegistrationsUseTheConflictTarget(
  calls: readonly BoardCall[],
  count: number,
): void {
  const selects = calls.filter((call) => call.kind === "select");
  const inserts = calls.filter((call) => call.kind === "insert");
  assert.equal(selects.length, count);
  assert.equal(inserts.length, count);
  assert.equal(calls.length, count * 2);
  for (const select of selects) {
    assert.equal(select.table, "jira_connection");
  }
  for (const insert of inserts) {
    assert.ok(insert.conflict, "an insert has no onConflictDoUpdate");
    assert.deepEqual(columnNames(insert.conflict.target).sort(), [
      "connection_id",
      "external_id",
    ]);
  }
  let seenSelects = 0;
  let seenInserts = 0;
  for (const call of calls) {
    if (call.kind === "select") seenSelects += 1;
    if (call.kind === "insert") {
      seenInserts += 1;
      assert.ok(seenSelects >= seenInserts, "an insert ran before its connection select");
    }
  }
}

// Extends "[concurrency-2] two registrations of board 42 at once both resolve
// to the one row": three at once.
test("[concurrency-2] three registrations of board 42 at once all resolve to the one row", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  const results = await Promise.all([
    boards.register("org_1", REGISTER_42),
    boards.register("org_1", { ...REGISTER_42, name: "Platform v2" }),
    boards.register("org_1", { ...REGISTER_42, boardType: "kanban" }),
  ]);

  assertRegistrationsUseTheConflictTarget(calls, 3);
  for (const result of results) {
    assert.deepEqual(result, B1_SUMMARY);
  }
});

// Extends "[concurrency-2] two registrations of board 42 at once both resolve
// to the one row": two different boards at once each resolve to their own row.
test("[concurrency-2] overlapping registrations of two different boards each resolve to their own row", async () => {
  const { boards, calls } = store((call) => {
    if (call.kind === "select") {
      return [{ id: "jrc_1" }];
    }
    return call.values?.["externalId"] === "43"
      ? [boardRow({ id: "jrb_2", externalId: "43", name: "Payments" })]
      : [boardRow()];
  });

  const [a, b] = await Promise.all([
    boards.register("org_1", REGISTER_42),
    boards.register("org_1", { ...REGISTER_42, externalId: "43", name: "Payments" }),
  ]);

  assertRegistrationsUseTheConflictTarget(calls, 2);
  assert.deepEqual(a, B1_SUMMARY);
  assert.deepEqual(b, {
    ...B1_SUMMARY,
    id: "jrb_2",
    externalId: "43",
    name: "Payments",
  });
});

// ---- happy-8 and unhappy-11: remove ------------------------------------------

// Extends "[happy-8] removing an owned board": other ids, one delete on
// jira_board filtered on both.
test("[happy-8] remove deletes from jira_board filtered on both the organization and the board id", async () => {
  const { boards, calls } = store([otherRow()]);

  const removed = await boards.remove("org_5", "jrb_3");

  assert.equal(removed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "delete");
  assert.equal(calls[0]?.table, "jira_board");
  assertScopedTo(calls[0], "org_5", "jrb_3");
});

// Extends "[unhappy-11] removing another organization's board": false, and
// the delete is filtered on the caller.
test("[unhappy-11] removing another organization's board is false, filtered on the caller", async () => {
  const { boards, calls } = store([]);

  const removed = await boards.remove("org_2", "jrb_1");

  assert.equal(removed, false);
  assertScopedTo(calls[0], "org_2", "jrb_1");
});

// ---- happy-9, boundary-12 and unhappy-12: forRun -------------------------------

// Extends "[happy-9] forRun returns what a run needs": other values in every
// field, one joined select from jira_board filtered on both ids.
test("[happy-9] forRun maps other values and reads them in one joined, owner-scoped select", async () => {
  const { boards, calls } = store([
    {
      board: otherRow(),
      cloudId: "c-77",
      siteUrl: "https://globex.atlassian.net",
    },
  ]);

  const run = await boards.forRun("org_9", "jrb_77");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.table, "jira_board");
  assert.equal(calls[0]?.joined, true);
  assertScopedTo(calls[0], "org_9", "jrb_77");
  assert.deepEqual(run, {
    board: OTHER_SUMMARY,
    connectionId: "jrc_5",
    cloudId: "c-77",
    siteUrl: "https://globex.atlassian.net",
  });
  assert.ok(run);
  assert.deepEqual(Object.keys(run).sort(), [
    "board",
    "cloudId",
    "connectionId",
    "siteUrl",
  ]);
  assert.deepEqual(Object.keys(run.board).sort(), SUMMARY_KEYS);
});

// Extends "[boundary-12] forRun sanitizes the selection the same way get
// does": other stored values.
test("[boundary-12] forRun trims and de-duplicates issueTypes and drops invalid and unknown keys", async () => {
  const { boards } = store([
    {
      board: boardRow({
        selection: rawSelection({
          issueTypes: [" Bug", "Bug", "Task "],
          excludeAssigned: "yes",
          maxAgeDays: null,
          minSpecChars: -1,
          colour: "red",
        }),
      }),
      cloudId: "cloud-1",
      siteUrl: "https://acme.atlassian.net",
    },
  ]);

  const run = await boards.forRun("org_1", "jrb_1");

  assert.deepEqual(run?.board.selection, {
    issueTypes: ["Bug", "Task"],
    maxAgeDays: null,
  });
});

// Extends "[unhappy-12] forRun for a board the caller does not own is null":
// null, filtered on the caller and the board id.
test("[unhappy-12] forRun for another organization's board is null, filtered on the caller", async () => {
  const { boards, calls } = store([]);

  const run = await boards.forRun("org_2", "jrb_5");

  assert.equal(run, null);
  assert.equal(calls.length, 1);
  assertScopedTo(calls[0], "org_2", "jrb_5");
});
