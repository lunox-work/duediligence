import assert from "node:assert/strict";
import { test } from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  BOARD_MAX_TICKETS_LIMIT,
  createJiraBoardStore,
  InvalidJiraBoardError,
  JiraConnectionNotFoundError,
  normalizeBoardSelection,
} from "../src/jira-boards.js";
import type {
  InvalidJiraBoardField,
  JiraBoardSummary,
  RegisterBoardInput,
  StoredBoardSelection,
  UpdateBoardInput,
} from "../src/jira-boards.js";
import * as schema from "../src/schema.js";
import { jiraBoard, jiraConnection, organization } from "../src/schema.js";
import type { JiraBoardRow } from "../src/schema.js";
import * as jiraSchema from "../src/schema/jira.js";
import type { Database } from "../src/store.js";

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

/** A row with a stored selection that is not a valid `StoredBoardSelection`. */
function rawSelection(value: unknown): StoredBoardSelection {
  return value as StoredBoardSelection;
}

// ---- database fake ----------------------------------------------------------

/**
 * One recorded query. Beyond `fake-db.ts`, this fake also records the table a
 * query targets, an `onConflictDoUpdate` config and whether a join was made,
 * and lets each query resolve to rows chosen per call.
 */
interface BoardCall {
  readonly kind: "select" | "insert" | "update" | "delete";
  table?: string;
  values?: Record<string, unknown>;
  filtered?: boolean;
  joined?: boolean;
  conflict?: { target?: unknown; set?: Record<string, unknown> };
}

type Respond = (call: BoardCall) => readonly unknown[];

interface BoardDb {
  readonly db: Database;
  readonly calls: BoardCall[];
}

function nameOf(table: unknown): string | undefined {
  try {
    return getTableConfig(table as typeof jiraBoard).name;
  } catch {
    return undefined;
  }
}

/** @param respond the rows every query resolves to, or a function choosing them per call. */
function createBoardDb(respond: readonly unknown[] | Respond): BoardDb {
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
      where: () => {
        call.filtered = true;
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
  return (call) =>
    call.kind === "select" ? [{ id: "jrc_1" }] : upserted;
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

function columnNames(columns: unknown): string[] {
  const list = Array.isArray(columns) ? columns : [columns];
  return list.map((column) => String((column as { name?: unknown }).name));
}

const REGISTER_42: RegisterBoardInput = {
  connectionId: "jrc_1",
  externalId: "42",
  name: "Platform",
  boardType: "scrum",
};

// ---- summaries --------------------------------------------------------------

test("[happy-1] get maps a stored row to a summary with exactly nine keys", async () => {
  const { boards } = store([boardRow()]);

  const summary = await boards.get("org_1", "jrb_1");

  assert.deepEqual(summary, B1_SUMMARY);
  assert.deepEqual(Object.keys(summary ?? {}).sort(), [
    "boardType",
    "connectionId",
    "createdAt",
    "externalId",
    "id",
    "name",
    "projectKey",
    "selection",
    "writebackEnabled",
  ]);
});

test("[happy-1] get renders createdAt as the exact ISO string, milliseconds included", async () => {
  const { boards } = store([
    boardRow({ createdAt: new Date("2026-10-01T12:34:56.789Z") }),
  ]);

  const summary = await boards.get("org_1", "jrb_1");

  assert.equal(summary?.createdAt, "2026-10-01T12:34:56.789Z");
});

test("[boundary-1] a null project key stays null", async () => {
  const { boards } = store([boardRow({ projectKey: null })]);

  const summary = await boards.get("org_1", "jrb_1");

  assert.equal(summary?.projectKey, null);
});

test("[boundary-1] a null project key stays null in a list too", async () => {
  const { boards } = store([boardRow({ projectKey: null })]);

  const listed = await boards.list("org_1");

  assert.equal(listed[0]?.projectKey, null);
});

// ---- read-time sanitizing ---------------------------------------------------

const SANITIZED: ReadonlyArray<readonly [string, unknown, StoredBoardSelection]> =
  [
    ["{}", {}, {}],
    ["null", null, {}],
    ["[]", [], {}],
    ['"text"', "text", {}],
    ['{"maxTickets":5,"colour":"red"}', { maxTickets: 5, colour: "red" }, { maxTickets: 5 }],
    ['{"maxTickets":0}', { maxTickets: 0 }, {}],
    ['{"maxTickets":101}', { maxTickets: 101 }, {}],
    [
      '{"minAgeDays":1.5,"minSpecChars":200}',
      { minAgeDays: 1.5, minSpecChars: 200 },
      { minSpecChars: 200 },
    ],
    ['{"maxAgeDays":null}', { maxAgeDays: null }, { maxAgeDays: null }],
    ['{"excludeAssigned":"yes"}', { excludeAssigned: "yes" }, {}],
    ['{"issueTypes":["Bug",""]}', { issueTypes: ["Bug", ""] }, {}],
    ['{"issueTypes":"Bug"}', { issueTypes: "Bug" }, {}],
    [
      '{"minAgeDays":30,"maxAgeDays":7}',
      { minAgeDays: 30, maxAgeDays: 7 },
      { minAgeDays: 30, maxAgeDays: 7 },
    ],
  ];

for (const [label, stored, read] of SANITIZED) {
  test(`[boundary-2] a stored selection ${label} reads as ${JSON.stringify(read)}`, async () => {
    const { boards } = store([boardRow({ selection: rawSelection(stored) })]);

    const summary = await boards.get("org_1", "jrb_1");

    assert.deepEqual(summary?.selection, read);
  });
}

// ---- list -------------------------------------------------------------------

test("[happy-2] list is owner-scoped and newest first", async () => {
  const { boards, calls } = store([
    boardRow({ id: "jrb_a", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
    boardRow({ id: "jrb_c", createdAt: new Date("2026-10-03T00:00:00.000Z") }),
    boardRow({ id: "jrb_b", createdAt: new Date("2026-10-02T00:00:00.000Z") }),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(
    listed.map((board) => board.id),
    ["jrb_c", "jrb_b", "jrb_a"],
  );
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

test("[happy-2] list orders timestamps one millisecond apart newest first", async () => {
  const { boards } = store([
    boardRow({ id: "jrb_a", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
    boardRow({ id: "jrb_b", createdAt: new Date("2026-10-01T00:00:00.001Z") }),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(
    listed.map((board) => board.id),
    ["jrb_b", "jrb_a"],
  );
});

test("[boundary-3] equal timestamps fall back to id order", async () => {
  const { boards } = store([
    boardRow({ id: "jrb_z", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
    boardRow({ id: "jrb_m", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(
    listed.map((board) => board.id),
    ["jrb_m", "jrb_z"],
  );
});

test("[boundary-3] ties sort by id ascending beneath a newer board", async () => {
  const { boards } = store([
    boardRow({ id: "jrb_z", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
    boardRow({ id: "jrb_n", createdAt: new Date("2026-10-02T00:00:00.000Z") }),
    boardRow({ id: "jrb_m", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
    boardRow({ id: "jrb_a", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
  ]);

  const listed = await boards.list("org_1");

  assert.deepEqual(
    listed.map((board) => board.id),
    ["jrb_n", "jrb_a", "jrb_m", "jrb_z"],
  );
});

test("[boundary-4] an organization with no boards lists none", async () => {
  const { boards } = store([]);

  assert.deepEqual(await boards.list("org_1"), []);
});

test("[boundary-4] an empty list is still read with a where applied", async () => {
  const { boards, calls } = store([]);

  await boards.list("org_1");

  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

// ---- get --------------------------------------------------------------------

test("[happy-3] get is owner-scoped", async () => {
  const { boards, calls } = store([boardRow()]);

  await boards.get("org_1", "jrb_1");

  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

test("[happy-3] get applies a where even when nothing comes back", async () => {
  const { boards, calls } = store([]);

  await boards.get("org_2", "jrb_1");

  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

test("[unhappy-1] get for another organization's board is null", async () => {
  const { boards } = store([]);

  assert.equal(await boards.get("org_2", "jrb_1"), null);
});

test("[unhappy-1] get for an unknown board id in the caller's organization is null", async () => {
  const { boards } = store([]);

  assert.equal(await boards.get("org_1", "jrb_missing"), null);
});

// ---- normalizeBoardSelection --------------------------------------------------

const FULL_SELECTION: StoredBoardSelection = {
  maxTickets: 10,
  excludeAssigned: true,
  issueTypes: ["Bug", "Task"],
  minAgeDays: 14,
  maxAgeDays: 365,
  minSpecChars: 200,
};

test("[happy-4] a full valid selection passes through", () => {
  assert.deepEqual(normalizeBoardSelection(FULL_SELECTION), {
    maxTickets: 10,
    excludeAssigned: true,
    issueTypes: ["Bug", "Task"],
    minAgeDays: 14,
    maxAgeDays: 365,
    minSpecChars: 200,
  });
});

test("[happy-4] a full valid selection comes back as a new object", () => {
  const input: StoredBoardSelection = { ...FULL_SELECTION };

  const output = normalizeBoardSelection(input);

  assert.notEqual(output, input);
  assert.deepEqual(output, FULL_SELECTION);
});

test("[happy-4] the ticket limit is 100", () => {
  assert.equal(BOARD_MAX_TICKETS_LIMIT, 100);
});

const ACCEPTED: ReadonlyArray<
  readonly [string, StoredBoardSelection, StoredBoardSelection]
> = [
  ["{}", {}, {}],
  ['{"maxTickets":1}', { maxTickets: 1 }, { maxTickets: 1 }],
  ['{"maxTickets":100}', { maxTickets: 100 }, { maxTickets: 100 }],
  [
    '{"minAgeDays":0,"minSpecChars":0}',
    { minAgeDays: 0, minSpecChars: 0 },
    { minAgeDays: 0, minSpecChars: 0 },
  ],
  ['{"maxAgeDays":0}', { maxAgeDays: 0 }, { maxAgeDays: 0 }],
  ['{"maxAgeDays":null}', { maxAgeDays: null }, { maxAgeDays: null }],
  [
    '{"minAgeDays":7,"maxAgeDays":7}',
    { minAgeDays: 7, maxAgeDays: 7 },
    { minAgeDays: 7, maxAgeDays: 7 },
  ],
  ['{"excludeAssigned":false}', { excludeAssigned: false }, { excludeAssigned: false }],
  [
    '{"issueTypes":[" Bug ","Task","Bug"]}',
    { issueTypes: [" Bug ", "Task", "Bug"] },
    { issueTypes: ["Bug", "Task"] },
  ],
  [
    '{"issueTypes":["bug","Bug"]}',
    { issueTypes: ["bug", "Bug"] },
    { issueTypes: ["bug", "Bug"] },
  ],
  ['{"issueTypes":[]}', { issueTypes: [] }, {}],
  [
    '{"maxTickets":undefined,"minAgeDays":3}',
    { maxTickets: undefined, minAgeDays: 3 },
    { minAgeDays: 3 },
  ],
  [
    '{"minAgeDays":3,"colour":"red"}',
    rawSelection({ minAgeDays: 3, colour: "red" }),
    { minAgeDays: 3 },
  ],
];

for (const [label, input, output] of ACCEPTED) {
  test(`[boundary-5] normalizeBoardSelection(${label}) returns ${JSON.stringify(output)}`, () => {
    assert.deepEqual(normalizeBoardSelection(input), output);
  });
}

const REJECTED: ReadonlyArray<
  readonly [string, unknown, InvalidJiraBoardField, string]
> = [
  ['{"maxTickets":0}', { maxTickets: 0 }, "maxTickets", "maxTickets must be a whole number from 1 to 100."],
  ['{"maxTickets":101}', { maxTickets: 101 }, "maxTickets", "maxTickets must be a whole number from 1 to 100."],
  ['{"maxTickets":2.5}', { maxTickets: 2.5 }, "maxTickets", "maxTickets must be a whole number from 1 to 100."],
  ['{"maxTickets":NaN}', { maxTickets: Number.NaN }, "maxTickets", "maxTickets must be a whole number from 1 to 100."],
  ['{"excludeAssigned":"yes"}', { excludeAssigned: "yes" }, "excludeAssigned", "excludeAssigned must be true or false."],
  ['{"issueTypes":["Bug","  "]}', { issueTypes: ["Bug", "  "] }, "issueTypes", "issueTypes must be a list of non-empty names."],
  ['{"issueTypes":"Bug"}', { issueTypes: "Bug" }, "issueTypes", "issueTypes must be a list of non-empty names."],
  ['{"minAgeDays":-1}', { minAgeDays: -1 }, "minAgeDays", "minAgeDays must be a whole number of days, 0 or more."],
  ['{"minAgeDays":Infinity}', { minAgeDays: Number.POSITIVE_INFINITY }, "minAgeDays", "minAgeDays must be a whole number of days, 0 or more."],
  ['{"maxAgeDays":-1}', { maxAgeDays: -1 }, "maxAgeDays", "maxAgeDays must be null or a whole number of days, 0 or more."],
  ['{"maxAgeDays":1.5}', { maxAgeDays: 1.5 }, "maxAgeDays", "maxAgeDays must be null or a whole number of days, 0 or more."],
  ['{"minAgeDays":30,"maxAgeDays":7}', { minAgeDays: 30, maxAgeDays: 7 }, "maxAgeDays", "maxAgeDays cannot be less than minAgeDays."],
  ['{"minSpecChars":-5}', { minSpecChars: -5 }, "minSpecChars", "minSpecChars must be a whole number, 0 or more."],
];

for (const [label, input, field, message] of REJECTED) {
  test(`[unhappy-2] normalizeBoardSelection(${label}) throws naming ${field}`, () => {
    assert.throws(
      () => normalizeBoardSelection(rawSelection(input)),
      isInvalid(field, message),
    );
  });
}

test("[unhappy-3] the first failing key in interface order is the one reported", () => {
  assert.throws(
    () => normalizeBoardSelection({ minSpecChars: -1, maxTickets: 0 }),
    isInvalid("maxTickets"),
  );
});

test("[unhappy-3] a per-key failure is reported before the minAgeDays/maxAgeDays check", () => {
  assert.throws(
    () =>
      normalizeBoardSelection({
        minAgeDays: 30,
        maxAgeDays: 7,
        minSpecChars: -1,
      }),
    isInvalid("minSpecChars"),
  );
});

test("[boundary-6] the input is not mutated", () => {
  const input = { issueTypes: [" Bug "] };

  normalizeBoardSelection(input);

  assert.deepEqual(input, { issueTypes: [" Bug "] });
});

test("[boundary-6] a deeply frozen input normalizes without throwing", () => {
  const issueTypes = Object.freeze([" Bug ", "Bug"]);
  const input = Object.freeze({ issueTypes, maxTickets: undefined });

  assert.deepEqual(normalizeBoardSelection(input), { issueTypes: ["Bug"] });
  assert.deepEqual(input.issueTypes, [" Bug ", "Bug"]);
  assert.ok("maxTickets" in input);
});

// ---- register -----------------------------------------------------------------

test("[happy-5] register writes a prefixed, owner-scoped row with write-back off", async () => {
  const { boards, calls } = store([boardRow()]);

  const summary = await boards.register("org_1", {
    connectionId: "jrc_1",
    externalId: " 42 ",
    name: " Platform ",
    boardType: "scrum",
    projectKey: "PLAT",
    selection: { maxTickets: 5 },
  });

  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
  assert.equal(calls[1]?.kind, "insert");
  const values = calls[1]?.values ?? {};
  assert.match(String(values["id"]), /^jrb_/);
  assert.equal(values["organizationId"], "org_1");
  assert.equal(values["connectionId"], "jrc_1");
  assert.equal(values["externalId"], "42");
  assert.equal(values["name"], "Platform");
  assert.equal(values["boardType"], "scrum");
  assert.equal(values["projectKey"], "PLAT");
  assert.deepEqual(values["selection"], { maxTickets: 5 });
  assert.equal(values["writebackEnabled"], false);
  assert.deepEqual(summary, B1_SUMMARY);
});

test("[happy-5] register trims tabs and newlines from externalId and name", async () => {
  const { boards, calls } = store([boardRow()]);

  await boards.register("org_1", {
    connectionId: "jrc_1",
    externalId: "\t42\n",
    name: "\n Platform\t",
    boardType: "scrum",
  });

  const values = calls[1]?.values ?? {};
  assert.equal(values["externalId"], "42");
  assert.equal(values["name"], "Platform");
});

const DEFAULTS: ReadonlyArray<{
  readonly label: string;
  readonly boardType: string;
  readonly projectKey?: string | null;
  readonly selection?: StoredBoardSelection;
  readonly storedType: string;
  readonly storedKey: string | null;
}> = [
  { label: 'boardType "kanban", no projectKey, no selection', boardType: "kanban", storedType: "kanban", storedKey: null },
  { label: 'boardType "  ", projectKey null, selection {}', boardType: "  ", projectKey: null, selection: {}, storedType: "unknown", storedKey: null },
  { label: 'boardType "scrum", projectKey "  ", no selection', boardType: "scrum", projectKey: "  ", storedType: "scrum", storedKey: null },
  { label: 'boardType "scrum", projectKey " PLAT ", selection {"issueTypes":[]}', boardType: "scrum", projectKey: " PLAT ", selection: { issueTypes: [] }, storedType: "scrum", storedKey: "PLAT" },
];

for (const row of DEFAULTS) {
  test(`[boundary-7] register with ${row.label} stores ${row.storedType}, ${String(row.storedKey)}, {}`, async () => {
    const { boards, calls } = store([boardRow()]);
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
    assert.equal(insert?.values?.["boardType"], row.storedType);
    assert.equal(insert?.values?.["projectKey"], row.storedKey);
    assert.deepEqual(insert?.values?.["selection"], {});
  });
}

const BLANK: ReadonlyArray<readonly [string, string, InvalidJiraBoardField, string]> = [
  ["", "Platform", "externalId", "A board needs its Jira id."],
  ["   ", "Platform", "externalId", "A board needs its Jira id."],
  ["42", "", "name", "A board needs a name."],
  ["42", " \t ", "name", "A board needs a name."],
];

for (const [externalId, name, field, message] of BLANK) {
  test(`[unhappy-4] register with externalId ${JSON.stringify(externalId)} and name ${JSON.stringify(name)} rejects naming ${field}`, async () => {
    const { boards, calls } = store([boardRow()]);

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

test("[unhappy-4] a blank externalId is reported before a blank name", async () => {
  const { boards, calls } = store([boardRow()]);

  await assert.rejects(
    () =>
      boards.register("org_1", {
        connectionId: "jrc_1",
        externalId: " ",
        name: " ",
        boardType: "scrum",
      }),
    isInvalid("externalId"),
  );
  assert.equal(calls.length, 0);
});

test("[unhappy-5] an invalid selection is rejected before the database is touched", async () => {
  const { boards, calls } = store([boardRow()]);

  await assert.rejects(
    () =>
      boards.register("org_1", { ...REGISTER_42, selection: { maxTickets: 0 } }),
    isInvalid("maxTickets"),
  );
  assert.equal(calls.length, 0);
});

test("[unhappy-5] a blank name is reported before an invalid selection", async () => {
  const { boards, calls } = store([boardRow()]);

  await assert.rejects(
    () =>
      boards.register("org_1", {
        ...REGISTER_42,
        name: "",
        selection: { maxTickets: 0 },
      }),
    isInvalid("name"),
  );
  assert.equal(calls.length, 0);
});

test("[unhappy-6] another organization's connection is refused", async () => {
  const { boards, calls } = store([]);

  await assert.rejects(
    () => boards.register("org_2", REGISTER_42),
    (error: unknown) => {
      assert.ok(error instanceof JiraConnectionNotFoundError);
      assert.equal(error.name, "JiraConnectionNotFoundError");
      assert.equal(error.message, 'No Jira connection with id "jrc_1".');
      return true;
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
  assert.ok(!calls.some((call) => call.kind === "insert"));
});

test("[unhappy-6] the refusal names the connection id it was given", async () => {
  const { boards, calls } = store([]);

  await assert.rejects(
    () => boards.register("org_1", { ...REGISTER_42, connectionId: "jrc_other" }),
    (error: unknown) => {
      assert.ok(error instanceof JiraConnectionNotFoundError);
      assert.equal(error.message, 'No Jira connection with id "jrc_other".');
      return true;
    },
  );
  assert.ok(!calls.some((call) => call.kind === "insert"));
});

test("[happy-6] re-registering refreshes Jira's details and keeps the board's id", async () => {
  const { boards, calls } = store(
    registerDb([boardRow({ name: "Platform v2" })]),
  );

  const summary = await boards.register("org_1", {
    ...REGISTER_42,
    name: "Platform v2",
  });

  const insert = calls.find((call) => call.kind === "insert");
  assert.ok(insert?.conflict, "the insert has no onConflictDoUpdate");
  assert.deepEqual(columnNames(insert.conflict.target).sort(), [
    "connection_id",
    "external_id",
  ]);
  const set = insert.conflict.set ?? {};
  assert.equal(set["name"], "Platform v2");
  assert.equal(set["boardType"], "scrum");
  assert.equal(set["projectKey"], null);
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
  assert.equal(summary.id, "jrb_1");
  assert.equal(summary.name, "Platform v2");
});

test("[happy-6] re-registering refreshes a trimmed project key and a defaulted board type", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  await boards.register("org_1", {
    ...REGISTER_42,
    boardType: " ",
    projectKey: " PLAT ",
  });

  const set = calls.find((call) => call.kind === "insert")?.conflict?.set ?? {};
  assert.equal(set["projectKey"], "PLAT");
  assert.equal(set["boardType"], "unknown");
});

test("[boundary-8] a re-registration that gives a selection replaces it", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  await boards.register("org_1", {
    ...REGISTER_42,
    selection: { minAgeDays: 30 },
  });

  const set = calls.find((call) => call.kind === "insert")?.conflict?.set ?? {};
  assert.deepEqual(set["selection"], { minAgeDays: 30 });
});

test("[boundary-8] a re-registration that gives an empty selection replaces it with {}", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  await boards.register("org_1", { ...REGISTER_42, selection: {} });

  const set = calls.find((call) => call.kind === "insert")?.conflict?.set ?? {};
  assert.deepEqual(set["selection"], {});
});

test("[unhappy-7] an upsert that returns no row rejects", async () => {
  const { boards } = store(registerDb([]));

  await assert.rejects(
    () => boards.register("org_1", REGISTER_42),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Failed to record the Jira board.");
      return true;
    },
  );
});

test("[unhappy-7] the empty upsert is detected only after the connection select and the insert", async () => {
  const { boards, calls } = store(registerDb([]));

  await assert.rejects(
    () => boards.register("org_1", REGISTER_42),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Failed to record the Jira board.");
      return true;
    },
  );
  assert.deepEqual(
    calls.map((call) => call.kind),
    ["select", "insert"],
  );
});

// ---- update -------------------------------------------------------------------

test("[happy-7] update replaces the selection and toggles write-back", async () => {
  const { boards, calls } = store([
    boardRow({ writebackEnabled: true, selection: { minAgeDays: 30 } }),
  ]);

  const summary = await boards.update("org_1", "jrb_1", {
    selection: { minAgeDays: 30 },
    writebackEnabled: true,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "update");
  assert.equal(calls[0]?.filtered, true);
  const values = calls[0]?.values ?? {};
  assert.deepEqual(values["selection"], { minAgeDays: 30 });
  assert.equal(values["writebackEnabled"], true);
  assert.ok(values["updatedAt"] instanceof Date);
  assert.equal(summary?.writebackEnabled, true);
  assert.deepEqual(summary?.selection, { minAgeDays: 30 });
});

test("[happy-7] update writes writebackEnabled false as a value, not as absent", async () => {
  const { boards, calls } = store([boardRow({ writebackEnabled: false })]);

  const summary = await boards.update("org_1", "jrb_1", {
    writebackEnabled: false,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "update");
  assert.equal(calls[0]?.values?.["writebackEnabled"], false);
  assert.equal(summary?.writebackEnabled, false);
});

const WRITTEN: ReadonlyArray<readonly [string, UpdateBoardInput, string[]]> = [
  ["{writebackEnabled: false}", { writebackEnabled: false }, ["updatedAt", "writebackEnabled"]],
  ["{selection: {maxTickets: 3}}", { selection: { maxTickets: 3 } }, ["selection", "updatedAt"]],
  ["{selection: {}}", { selection: {} }, ["selection", "updatedAt"]],
  [
    "{selection: undefined, writebackEnabled: true}",
    { selection: undefined, writebackEnabled: true },
    ["updatedAt", "writebackEnabled"],
  ],
];

for (const [label, input, keys] of WRITTEN) {
  test(`[boundary-9] update with ${label} writes exactly ${keys.join(", ")}`, async () => {
    const { boards, calls } = store([boardRow()]);

    await boards.update("org_1", "jrb_1", input);

    const update = calls.find((call) => call.kind === "update");
    assert.deepEqual(Object.keys(update?.values ?? {}).sort(), keys);
  });
}

test("[boundary-10] an empty selection clears the stored one", async () => {
  const { boards, calls } = store([boardRow()]);

  await boards.update("org_1", "jrb_1", { selection: {} });

  const update = calls.find((call) => call.kind === "update");
  assert.deepEqual(update?.values?.["selection"], {});
});

test("[boundary-10] a selection that normalizes to nothing clears the stored one", async () => {
  const { boards, calls } = store([boardRow()]);

  await boards.update("org_1", "jrb_1", { selection: { issueTypes: [] } });

  const update = calls.find((call) => call.kind === "update");
  assert.deepEqual(update?.values?.["selection"], {});
});

test("[boundary-11] an empty update reads instead of writing", async () => {
  const { boards, calls } = store([boardRow()]);

  const summary = await boards.update("org_1", "jrb_1", {});

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
  assert.deepEqual(summary, B1_SUMMARY);
});

test("[boundary-11] an update whose only field is undefined reads instead of writing", async () => {
  const { boards, calls } = store([boardRow()]);

  const summary = await boards.update("org_1", "jrb_1", {
    selection: undefined,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
  assert.deepEqual(summary, B1_SUMMARY);
});

const MISSES: ReadonlyArray<readonly [string, UpdateBoardInput]> = [
  ["{writebackEnabled: true}", { writebackEnabled: true }],
  ["{}", {}],
];

for (const [label, input] of MISSES) {
  test(`[unhappy-8] update("org_2", "jrb_1", ${label}) on a miss is null`, async () => {
    const { boards } = store([]);

    assert.equal(await boards.update("org_2", "jrb_1", input), null);
  });
}

const INVALID_UPDATES: ReadonlyArray<
  readonly [string, UpdateBoardInput, InvalidJiraBoardField]
> = [
  [
    "{selection: {minAgeDays: 30, maxAgeDays: 7}}",
    { selection: { minAgeDays: 30, maxAgeDays: 7 } },
    "maxAgeDays",
  ],
  [
    '{writebackEnabled: "yes"}',
    { writebackEnabled: "yes" } as unknown as UpdateBoardInput,
    "writebackEnabled",
  ],
];

for (const [label, input, field] of INVALID_UPDATES) {
  test(`[unhappy-9] update with ${label} rejects naming ${field} before the database is touched`, async () => {
    const { boards, calls } = store([]);

    await assert.rejects(
      () => boards.update("org_1", "jrb_1", input),
      isInvalid(field),
    );
    assert.equal(calls.length, 0);
  });
}

test("[unhappy-9] an invalid selection is reported before an invalid writebackEnabled", async () => {
  const { boards, calls } = store([]);

  await assert.rejects(
    () =>
      boards.update("org_1", "jrb_1", {
        selection: { maxTickets: 0 },
        writebackEnabled: "yes",
      } as unknown as UpdateBoardInput),
    isInvalid("maxTickets"),
  );
  assert.equal(calls.length, 0);
});

test("[unhappy-10] a non-boolean writebackEnabled names the field and says so", async () => {
  const { boards } = store([boardRow()]);

  await assert.rejects(
    () =>
      boards.update("org_1", "jrb_1", {
        writebackEnabled: 1,
      } as unknown as UpdateBoardInput),
    isInvalid("writebackEnabled", "writebackEnabled must be true or false."),
  );
});

test("[unhappy-10] a null writebackEnabled is rejected the same way", async () => {
  const { boards, calls } = store([boardRow()]);

  await assert.rejects(
    () =>
      boards.update("org_1", "jrb_1", {
        writebackEnabled: null,
      } as unknown as UpdateBoardInput),
    isInvalid("writebackEnabled", "writebackEnabled must be true or false."),
  );
  assert.equal(calls.length, 0);
});

// ---- concurrency --------------------------------------------------------------

test("[concurrency-1] update overlapping a remove resolves to null without bringing the board back", async () => {
  const { boards, calls } = store((call) =>
    call.kind === "delete" ? [boardRow()] : [],
  );

  const [updated] = await Promise.all([
    boards.update("org_1", "jrb_1", { writebackEnabled: true }),
    boards.remove("org_1", "jrb_1"),
  ]);

  assert.equal(updated, null);
  assert.equal(calls.filter((call) => call.kind === "update").length, 1);
  assert.equal(calls.filter((call) => call.kind === "select").length, 0);
  assert.equal(calls.filter((call) => call.kind === "insert").length, 0);
});

test("[concurrency-1] the overlapping remove still reports that its row went", async () => {
  const { boards } = store((call) =>
    call.kind === "delete" ? [boardRow()] : [],
  );

  const [updated, removed] = await Promise.all([
    boards.update("org_1", "jrb_1", { writebackEnabled: true }),
    boards.remove("org_1", "jrb_1"),
  ]);

  assert.equal(updated, null);
  assert.equal(removed, true);
});

function assertEachInsertFollowsAConnectionSelect(calls: BoardCall[]): void {
  let selects = 0;
  let inserts = 0;
  for (const call of calls) {
    if (call.kind === "select") {
      assert.equal(call.table, "jira_connection");
      selects += 1;
    }
    if (call.kind === "insert") {
      inserts += 1;
      assert.ok(call.conflict?.target !== undefined, "insert has no conflict target");
      assert.ok(selects >= inserts, "an insert ran before its connection select");
    }
  }
  assert.equal(selects, 2);
  assert.equal(inserts, 2);
  assert.ok(!calls.some((call) => call.kind === "select" && call.table === "jira_board"));
}

test("[concurrency-2] two registrations of board 42 at once both resolve to the one row", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  const first = boards.register("org_1", REGISTER_42);
  const second = boards.register("org_1", REGISTER_42);
  const [a, b] = await Promise.all([first, second]);

  assertEachInsertFollowsAConnectionSelect(calls);
  assert.equal(a.id, "jrb_1");
  assert.equal(b.id, "jrb_1");
});

test("[concurrency-2] overlapping registrations with different names resolve to the row the database returns", async () => {
  const { boards, calls } = store(registerDb([boardRow()]));

  const [a, b] = await Promise.all([
    boards.register("org_1", REGISTER_42),
    boards.register("org_1", { ...REGISTER_42, name: "Platform v2" }),
  ]);

  assertEachInsertFollowsAConnectionSelect(calls);
  assert.deepEqual(a, B1_SUMMARY);
  assert.deepEqual(b, B1_SUMMARY);
});

// ---- remove -------------------------------------------------------------------

test("[happy-8] removing an owned board", async () => {
  const { boards, calls } = store([boardRow()]);

  assert.equal(await boards.remove("org_1", "jrb_1"), true);
  assert.equal(calls[0]?.kind, "delete");
  assert.equal(calls[0]?.filtered, true);
});

test("[happy-8] a remove that deletes nothing is still a delete with a where applied", async () => {
  const { boards, calls } = store([]);

  await boards.remove("org_2", "jrb_1");

  assert.equal(calls[0]?.kind, "delete");
  assert.equal(calls[0]?.filtered, true);
});

test("[unhappy-11] removing another organization's board", async () => {
  const { boards } = store([]);

  assert.equal(await boards.remove("org_2", "jrb_1"), false);
});

test("[unhappy-11] removing an unknown board id in the caller's organization is false", async () => {
  const { boards } = store([]);

  assert.equal(await boards.remove("org_1", "jrb_missing"), false);
});

// ---- forRun -------------------------------------------------------------------

test("[happy-9] forRun returns what a run needs", async () => {
  const { boards, calls } = store([
    {
      board: boardRow(),
      cloudId: "cloud-1",
      siteUrl: "https://acme.atlassian.net",
    },
  ]);

  const run = await boards.forRun("org_1", "jrb_1");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
  assert.deepEqual(run, {
    board: B1_SUMMARY,
    connectionId: "jrc_1",
    cloudId: "cloud-1",
    siteUrl: "https://acme.atlassian.net",
  });
  assert.deepEqual(Object.keys(run ?? {}).sort(), [
    "board",
    "cloudId",
    "connectionId",
    "siteUrl",
  ]);
  const serialized = JSON.stringify(run);
  assert.ok(!serialized.includes("Token"));
  assert.ok(!serialized.includes("Enc"));
});

test("[happy-9] forRun's connectionId is the board's own connection", async () => {
  const { boards } = store([
    {
      board: boardRow({ connectionId: "jrc_9" }),
      cloudId: "cloud-9",
      siteUrl: "https://other.atlassian.net",
    },
  ]);

  const run = await boards.forRun("org_1", "jrb_1");

  assert.equal(run?.connectionId, "jrc_9");
  assert.equal(run?.board.connectionId, "jrc_9");
  assert.equal(run?.cloudId, "cloud-9");
  assert.equal(run?.siteUrl, "https://other.atlassian.net");
});

test("[boundary-12] forRun sanitizes the selection the same way get does", async () => {
  const { boards } = store([
    {
      board: boardRow({ selection: { maxTickets: 500, minAgeDays: 14 } }),
      cloudId: "cloud-1",
      siteUrl: "https://acme.atlassian.net",
    },
  ]);

  const run = await boards.forRun("org_1", "jrb_1");

  assert.deepEqual(run?.board.selection, { minAgeDays: 14 });
});

test("[boundary-12] forRun reads a null stored selection as {}", async () => {
  const { boards } = store([
    {
      board: boardRow({ selection: rawSelection(null) }),
      cloudId: "cloud-1",
      siteUrl: "https://acme.atlassian.net",
    },
  ]);

  const run = await boards.forRun("org_1", "jrb_1");

  assert.deepEqual(run?.board.selection, {});
});

test("[unhappy-12] forRun for a board the caller does not own is null", async () => {
  const { boards } = store([]);

  assert.equal(await boards.forRun("org_2", "jrb_1"), null);
});

test("[unhappy-12] a forRun miss is still one select with a where applied", async () => {
  const { boards, calls } = store([]);

  await boards.forRun("org_2", "jrb_1");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

// ---- schema -------------------------------------------------------------------

test("[happy-10] the barrel exports the table, the same object schema/jira.ts exports", () => {
  assert.equal(
    (jiraSchema as Record<string, unknown>)["jiraBoard"],
    schema.jiraBoard,
  );
  assert.equal(getTableConfig(jiraBoard).name, "jira_board");
});

test("[happy-10] jira_board is a table distinct from jira_connection", () => {
  assert.notEqual(schema.jiraBoard, schema.jiraConnection);
  assert.notEqual(
    getTableConfig(jiraBoard).name,
    getTableConfig(jiraConnection).name,
  );
});

const COLUMNS: ReadonlyArray<readonly [string, boolean]> = [
  ["id", true],
  ["organization_id", true],
  ["connection_id", true],
  ["external_id", true],
  ["name", true],
  ["board_type", true],
  ["project_key", false],
  ["selection", true],
  ["writeback_enabled", true],
  ["created_at", true],
  ["updated_at", true],
];

test("[happy-11] columns, nullability and defaults", () => {
  const { columns } = getTableConfig(jiraBoard);
  const byName = new Map(columns.map((column) => [column.name, column]));

  for (const [name, notNull] of COLUMNS) {
    const column = byName.get(name);
    assert.ok(column, `jira_board has no ${name} column`);
    assert.equal(column.notNull, notNull, `${name} notNull`);
  }
  assert.equal(byName.get("id")?.primary, true);
  for (const name of [
    "id",
    "organization_id",
    "connection_id",
    "external_id",
    "name",
    "board_type",
    "project_key",
  ]) {
    assert.equal(byName.get(name)?.default, undefined, `${name} has a default`);
  }
  assert.deepEqual(byName.get("selection")?.default, {});
  assert.equal(byName.get("writeback_enabled")?.default, false);
  assert.equal(byName.get("created_at")?.hasDefault, true);
  assert.equal(byName.get("updated_at")?.hasDefault, true);
});

test("[happy-11] jira_board has exactly these eleven columns", () => {
  const names = getTableConfig(jiraBoard).columns.map((column) => column.name);

  assert.deepEqual(
    [...names].sort(),
    COLUMNS.map(([name]) => name).sort(),
  );
});

test("[happy-12] both owners cascade", () => {
  const { foreignKeys } = getTableConfig(jiraBoard);

  const toOrganization = foreignKeys.find(
    (key) => key.reference().foreignTable === organization,
  );
  const toConnection = foreignKeys.find(
    (key) => key.reference().foreignTable === jiraConnection,
  );
  assert.ok(toOrganization, "jira_board does not reference organization");
  assert.ok(toConnection, "jira_board does not reference jira_connection");
  assert.equal(toOrganization.onDelete, "cascade");
  assert.equal(toConnection.onDelete, "cascade");
});

test("[happy-12] jira_board has exactly the two foreign keys, on its owner columns", () => {
  const { foreignKeys } = getTableConfig(jiraBoard);

  assert.equal(foreignKeys.length, 2);
  assert.deepEqual(
    foreignKeys
      .flatMap((key) => key.reference().columns.map((column) => column.name))
      .sort(),
    ["connection_id", "organization_id"],
  );
});

test("[happy-13] one row per Jira board per connection, indexed for its owner", () => {
  const config = getTableConfig(jiraBoard);

  const unique = config.uniqueConstraints.find(
    (constraint) => constraint.name === "jira_board_connection_external_unique",
  );
  assert.ok(unique, "no jira_board_connection_external_unique constraint");
  assert.deepEqual(
    unique.columns.map((column) => column.name),
    ["connection_id", "external_id"],
  );

  const index = config.indexes.find(
    (candidate) => candidate.config.name === "jira_board_organization_id_idx",
  );
  assert.ok(index, "no jira_board_organization_id_idx index");
  const first = index.config.columns[0];
  assert.equal(
    first !== undefined && "name" in first ? first.name : undefined,
    "organization_id",
  );
});

test("[happy-13] the board's uniqueness is per connection, not per organization", () => {
  const unique = getTableConfig(jiraBoard).uniqueConstraints.find(
    (constraint) => constraint.name === "jira_board_connection_external_unique",
  );

  assert.ok(unique);
  assert.ok(
    !unique.columns.some((column) => column.name === "organization_id"),
  );
});
