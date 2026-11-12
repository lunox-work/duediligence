import assert from "node:assert/strict";
import { test } from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import { createJiraBoardStore } from "../src/jira-boards.js";
import type {
  JiraBoardSummary,
  RegisterBoardInput,
  StoredBoardSelection,
  UpdateBoardInput,
} from "../src/jira-boards.js";
import * as schema from "../src/schema.js";
import { jiraBoard } from "../src/schema.js";
import type { JiraBoardRow } from "../src/schema.js";
import * as jiraSchema from "../src/schema/jira.js";
import * as organizationSchema from "../src/schema/organizations.js";
import type { Database } from "../src/store.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const CONNECTION = {
  id: "jrc_1",
  cloudId: "cloud-1",
  siteUrl: "https://acme.atlassian.net",
};

const BASIC_INPUT: RegisterBoardInput = {
  connectionId: "jrc_1",
  externalId: "42",
  name: "Platform",
  boardType: "scrum",
};

// ---------------------------------------------------------------------------
// A database fake that resolves each query, in call order per kind of
// statement, to the rows (or the rejection) given for it, and records each
// call's kind, values, conflict settings and whether a where was applied.
// ---------------------------------------------------------------------------

type Kind = "select" | "insert" | "update" | "delete";
type Result = readonly unknown[] | Error;

interface BoardCall {
  readonly kind: Kind;
  readonly values?: Record<string, unknown>;
  conflict?: { target?: unknown; set?: Record<string, unknown> };
  filtered: boolean;
  ordered: boolean;
  joined: boolean;
}

function createBoardDb(results: Partial<Record<Kind, Result[]>> = {}) {
  const calls: BoardCall[] = [];
  const queues: Record<Kind, Result[]> = {
    select: [...(results.select ?? [])],
    insert: [...(results.insert ?? [])],
    update: [...(results.update ?? [])],
    delete: [...(results.delete ?? [])],
  };

  function start(kind: Kind, values?: Record<string, unknown>): unknown {
    const call: BoardCall = {
      kind,
      ...(values === undefined ? {} : { values }),
      filtered: false,
      ordered: false,
      joined: false,
    };
    calls.push(call);
    const result = queues[kind].shift() ?? [];
    const settle = (): Promise<unknown> =>
      result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve([...result]);

    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => {
        call.joined = true;
        return chain;
      },
      leftJoin: () => {
        call.joined = true;
        return chain;
      },
      where: () => {
        call.filtered = true;
        return chain;
      },
      orderBy: () => {
        call.ordered = true;
        return chain;
      },
      limit: () => chain,
      returning: () => chain,
      onConflictDoUpdate: (config: {
        target?: unknown;
        set?: Record<string, unknown>;
      }) => {
        call.conflict = config;
        return chain;
      },
      execute: () => settle(),
      then: (
        resolve?: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => settle().then(resolve, reject),
      catch: (reject?: (reason: unknown) => unknown) =>
        settle().catch(reject),
      finally: (onFinally?: () => void) => settle().finally(onFinally),
    };
    return chain;
  }

  const db = {
    select: () => start("select"),
    insert: () => ({
      values: (values: Record<string, unknown>) => start("insert", values),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => start("update", values),
    }),
    delete: () => start("delete"),
  };

  return {
    calls,
    store: createJiraBoardStore(db as unknown as Database),
  };
}

function targetColumns(target: unknown): unknown[] {
  return Array.isArray(target) ? target : [target];
}

function sortedKeys(value: object | undefined): string[] {
  return Object.keys(value ?? {}).sort();
}

// ---------------------------------------------------------------------------
// Rule: a summary is the row mapped field by field
// ---------------------------------------------------------------------------

test("[happy-1] get maps a stored row to a summary", async () => {
  const { store } = createBoardDb({ select: [[boardRow()]] });

  const summary = await store.get("org_1", "jrb_1");

  assert.deepEqual(summary, B1_SUMMARY);
  assert.deepEqual(sortedKeys(summary ?? undefined), [
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

test("[happy-1] get maps write-back on and a createdAt with milliseconds, without organizationId or updatedAt", async () => {
  const { store } = createBoardDb({
    select: [
      [
        boardRow({
          writebackEnabled: true,
          createdAt: new Date("2026-10-01T12:34:56.789Z"),
          updatedAt: new Date("2026-10-05T00:00:00.000Z"),
        }),
      ],
    ],
  });

  const summary = await store.get("org_1", "jrb_1");

  assert.equal(summary?.writebackEnabled, true);
  assert.equal(summary?.createdAt, "2026-10-01T12:34:56.789Z");
  assert.equal(typeof summary?.createdAt, "string");
  assert.ok(summary !== null && !("organizationId" in summary));
  assert.ok(summary !== null && !("updatedAt" in summary));
});

test("[boundary-1] a null project key stays null", async () => {
  const { store } = createBoardDb({
    select: [[boardRow({ projectKey: null })]],
  });

  const summary = await store.get("org_1", "jrb_1");

  assert.equal(summary?.projectKey, null);
});

test("[boundary-1] a null project key stays null when listed", async () => {
  const { store } = createBoardDb({
    select: [[boardRow({ projectKey: null })]],
  });

  const listed = await store.list("org_1");

  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.projectKey, null);
});

// ---------------------------------------------------------------------------
// Rule: a stored selection is read as stored; only null reads as {}
// ---------------------------------------------------------------------------

const SELECTION_READS: ReadonlyArray<readonly [unknown, unknown]> = [
  [{}, {}],
  [null, {}],
  [
    { maxTickets: 5, colour: "red" },
    { maxTickets: 5, colour: "red" },
  ],
  [{ maxTickets: 101 }, { maxTickets: 101 }],
  [
    { minAgeDays: 1.5, minSpecChars: 200 },
    { minAgeDays: 1.5, minSpecChars: 200 },
  ],
  [{ maxAgeDays: null }, { maxAgeDays: null }],
  [{ issueTypes: ["Bug", ""] }, { issueTypes: ["Bug", ""] }],
  [
    { minAgeDays: 30, maxAgeDays: 7 },
    { minAgeDays: 30, maxAgeDays: 7 },
  ],
];

for (const [stored, read] of SELECTION_READS) {
  test(`[boundary-2] the selection column ${JSON.stringify(stored)} is read as ${JSON.stringify(read)}`, async () => {
    const { store } = createBoardDb({
      select: [[boardRow({ selection: stored })]],
    });

    const summary = await store.get("org_1", "jrb_1");

    assert.deepEqual(summary?.selection, read);
  });
}

// ---------------------------------------------------------------------------
// Rule: list is one owner-scoped select ordered by the query
// ---------------------------------------------------------------------------

test("[happy-2] list is owner-scoped and ordered by the query", async () => {
  const { store, calls } = createBoardDb({
    select: [
      [
        boardRow({ id: "jrb_c", createdAt: new Date("2026-10-03T00:00:00.000Z") }),
        boardRow({ id: "jrb_b", createdAt: new Date("2026-10-02T00:00:00.000Z") }),
        boardRow({ id: "jrb_a", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
      ],
    ],
  });

  const listed = await store.list("org_1");

  assert.deepEqual(
    listed.map((board) => board.id),
    ["jrb_c", "jrb_b", "jrb_a"],
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
  assert.equal(calls[0]?.ordered, true);
});

test("[happy-2] list maps each row to its summary", async () => {
  const { store } = createBoardDb({ select: [[boardRow()]] });

  const listed = await store.list("org_1");

  assert.deepEqual(listed, [B1_SUMMARY]);
});

test("[boundary-3] the store does not re-sort what the database returns", async () => {
  const { store } = createBoardDb({
    select: [
      [
        boardRow({ id: "jrb_a", createdAt: new Date("2026-10-01T00:00:00.000Z") }),
        boardRow({ id: "jrb_c", createdAt: new Date("2026-10-03T00:00:00.000Z") }),
      ],
    ],
  });

  const listed = await store.list("org_1");

  assert.deepEqual(
    listed.map((board) => board.id),
    ["jrb_a", "jrb_c"],
  );
});

test("[boundary-3] boards created at the same instant keep the database's order", async () => {
  const same = new Date("2026-10-02T00:00:00.000Z");
  const { store } = createBoardDb({
    select: [
      [
        boardRow({ id: "jrb_b", createdAt: same }),
        boardRow({ id: "jrb_a", createdAt: same }),
      ],
    ],
  });

  const listed = await store.list("org_1");

  assert.deepEqual(
    listed.map((board) => board.id),
    ["jrb_b", "jrb_a"],
  );
});

test("[boundary-4] an organization with no boards lists none", async () => {
  const { store } = createBoardDb({ select: [[]] });

  assert.deepEqual(await store.list("org_1"), []);
});

test("[boundary-4] an empty list still comes from one owner-scoped select", async () => {
  const { store, calls } = createBoardDb({ select: [[]] });

  await store.list("org_9");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

// ---------------------------------------------------------------------------
// Rule: get filters on owner and id; a miss is null
// ---------------------------------------------------------------------------

test("[happy-3] get is owner-scoped", async () => {
  const { store, calls } = createBoardDb({ select: [[boardRow()]] });

  await store.get("org_1", "jrb_1");

  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

test("[happy-3] get makes exactly one call", async () => {
  const { store, calls } = createBoardDb({ select: [[boardRow()]] });

  await store.get("org_1", "jrb_1");

  assert.equal(calls.length, 1);
});

test("[unhappy-1] another organization's board is null", async () => {
  const { store } = createBoardDb({ select: [[]] });

  assert.equal(await store.get("org_2", "jrb_1"), null);
});

test("[unhappy-1] a miss on get is still a single owner-scoped select", async () => {
  const { store, calls } = createBoardDb({ select: [[]] });

  const result = await store.get("org_2", "jrb_1");

  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

// ---------------------------------------------------------------------------
// Rule: register writes its input as given in one upsert
// ---------------------------------------------------------------------------

test("[happy-4] register writes a prefixed, owner-scoped row", async () => {
  const { store, calls } = createBoardDb({ insert: [[boardRow()]] });

  const summary = await store.register("org_1", {
    connectionId: "jrc_1",
    externalId: "42",
    name: "Platform",
    boardType: "scrum",
    projectKey: "PLAT",
    selection: { maxTickets: 5 },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
  const values = calls[0]?.values ?? {};
  assert.match(String(values["id"]), /^jrb_/);
  assert.equal(values["organizationId"], "org_1");
  assert.equal(values["connectionId"], "jrc_1");
  assert.equal(values["externalId"], "42");
  assert.equal(values["name"], "Platform");
  assert.equal(values["boardType"], "scrum");
  assert.equal(values["projectKey"], "PLAT");
  assert.deepEqual(values["selection"], { maxTickets: 5 });
  assert.ok(values["updatedAt"] instanceof Date);
  assert.ok(!("writebackEnabled" in values));
  assert.deepEqual(summary, B1_SUMMARY);
});

test("[happy-4] register resolves to the summary of the returned row, not of its input", async () => {
  const { store } = createBoardDb({
    insert: [[boardRow({ name: "Stored name", writebackEnabled: true })]],
  });

  const summary = await store.register("org_1", {
    ...BASIC_INPUT,
    selection: { maxTickets: 5 },
  });

  assert.equal(summary.name, "Stored name");
  assert.equal(summary.writebackEnabled, true);
  assert.deepEqual(summary.selection, { maxTickets: 5, issueTypes: ["Bug"] });
});

interface RegisterExample {
  readonly label: string;
  readonly input: RegisterBoardInput;
  readonly storedKey: string | null;
  readonly storedSelection: StoredBoardSelection;
}

const REGISTER_EXAMPLES: readonly RegisterExample[] = [
  {
    label: "kanban, absent projectKey and selection",
    input: {
      connectionId: "jrc_1",
      externalId: "42",
      name: "Platform",
      boardType: "kanban",
    },
    storedKey: null,
    storedSelection: {},
  },
  {
    label: "blank boardType, null projectKey, empty selection",
    input: {
      connectionId: "jrc_1",
      externalId: "42",
      name: "Platform",
      boardType: "  ",
      projectKey: null,
      selection: {},
    },
    storedKey: null,
    storedSelection: {},
  },
  {
    label: "padded externalId, name and blank projectKey",
    input: {
      connectionId: "jrc_1",
      externalId: " 42 ",
      name: " Platform ",
      boardType: "scrum",
      projectKey: "  ",
    },
    storedKey: "  ",
    storedSelection: {},
  },
  {
    label: "padded projectKey and empty issueTypes",
    input: {
      connectionId: "jrc_1",
      externalId: "42",
      name: "Platform",
      boardType: "scrum",
      projectKey: " PLAT ",
      selection: { issueTypes: [] },
    },
    storedKey: " PLAT ",
    storedSelection: { issueTypes: [] },
  },
  {
    label: "empty externalId and name, zero maxTickets and an unknown key",
    input: {
      connectionId: "jrc_1",
      externalId: "",
      name: "",
      boardType: "scrum",
      projectKey: "PLAT",
      selection: { maxTickets: 0, colour: "red" } as StoredBoardSelection,
    },
    storedKey: "PLAT",
    storedSelection: { maxTickets: 0, colour: "red" } as StoredBoardSelection,
  },
];

for (const example of REGISTER_EXAMPLES) {
  test(`[boundary-5] register stores inputs as given: ${example.label}`, async () => {
    const { store, calls } = createBoardDb({ insert: [[boardRow()]] });

    await store.register("org_1", example.input);

    const values = calls[0]?.values ?? {};
    assert.equal(calls[0]?.kind, "insert");
    assert.equal(values["externalId"], example.input.externalId);
    assert.equal(values["name"], example.input.name);
    assert.equal(values["boardType"], example.input.boardType);
    assert.equal(values["projectKey"], example.storedKey);
    assert.deepEqual(values["selection"], example.storedSelection);
  });
}

// ---------------------------------------------------------------------------
// Rule: register does not check that the connection is the organization's
// ---------------------------------------------------------------------------

test("[boundary-6] another organization's connection is not looked up", async () => {
  const { store, calls } = createBoardDb({
    insert: [[boardRow({ organizationId: "org_2" })]],
  });

  const summary = await store.register("org_2", BASIC_INPUT);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "insert");
  assert.equal(calls[0]?.values?.["organizationId"], "org_2");
  assert.equal(calls[0]?.values?.["connectionId"], "jrc_1");
  assert.equal(summary.id, "jrb_1");
});

test("[boundary-6] an unknown connection id is written without a read", async () => {
  const { store, calls } = createBoardDb({
    insert: [[boardRow({ connectionId: "jrc_other" })]],
  });

  const summary = await store.register("org_1", {
    ...BASIC_INPUT,
    connectionId: "jrc_other",
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["insert"],
  );
  assert.equal(calls[0]?.values?.["connectionId"], "jrc_other");
  assert.equal(summary.connectionId, "jrc_other");
});

// ---------------------------------------------------------------------------
// Rule: re-registering updates in place on (connection_id, external_id)
// ---------------------------------------------------------------------------

test("[happy-5] re-registering refreshes Jira's details and keeps the board's id", async () => {
  const { store, calls } = createBoardDb({
    insert: [[boardRow({ name: "Platform v2" })]],
  });

  const summary = await store.register("org_1", {
    ...BASIC_INPUT,
    name: "Platform v2",
  });

  const conflict = calls[0]?.conflict;
  assert.ok(conflict, "the insert has no onConflictDoUpdate");
  const target = targetColumns(conflict.target);
  assert.equal(target.length, 2);
  assert.ok(target.includes(jiraBoard.connectionId));
  assert.ok(target.includes(jiraBoard.externalId));

  const set = conflict.set ?? {};
  assert.equal(set["organizationId"], "org_1");
  assert.equal(set["connectionId"], "jrc_1");
  assert.equal(set["externalId"], "42");
  assert.equal(set["name"], "Platform v2");
  assert.equal(set["boardType"], "scrum");
  assert.equal(set["projectKey"], null);
  assert.deepEqual(set["selection"], {});
  assert.ok(set["updatedAt"] instanceof Date);
  assert.ok(!("writebackEnabled" in set));
  assert.ok(!("id" in set));
  assert.ok(!("createdAt" in set));

  assert.equal(summary.id, "jrb_1");
  assert.equal(summary.name, "Platform v2");
});

test("[happy-5] a re-registration overwrites the owner and project key it is given", async () => {
  const { store, calls } = createBoardDb({
    insert: [[boardRow({ organizationId: "org_2", projectKey: "NEW" })]],
  });

  const summary = await store.register("org_2", {
    ...BASIC_INPUT,
    boardType: "kanban",
    projectKey: "NEW",
  });

  const set = calls[0]?.conflict?.set ?? {};
  assert.equal(set["organizationId"], "org_2");
  assert.equal(set["projectKey"], "NEW");
  assert.equal(set["boardType"], "kanban");
  assert.ok(!("writebackEnabled" in set));
  assert.equal(summary.id, "jrb_1");
  assert.equal(summary.projectKey, "NEW");
});

test("[boundary-7] a re-registration that gives a selection replaces it", async () => {
  const { store, calls } = createBoardDb({ insert: [[boardRow()]] });

  await store.register("org_1", {
    ...BASIC_INPUT,
    selection: { minAgeDays: 30 },
  });

  assert.deepEqual(calls[0]?.conflict?.set?.["selection"], { minAgeDays: 30 });
});

test("[boundary-7] a re-registration's selection keeps unknown keys", async () => {
  const { store, calls } = createBoardDb({ insert: [[boardRow()]] });

  await store.register("org_1", {
    ...BASIC_INPUT,
    selection: { maxAgeDays: null, colour: "red" } as StoredBoardSelection,
  });

  assert.deepEqual(calls[0]?.conflict?.set?.["selection"], {
    maxAgeDays: null,
    colour: "red",
  });
});

test("[boundary-8] a re-registration without a selection resets it to {}", async () => {
  const { store, calls } = createBoardDb({ insert: [[boardRow()]] });

  await store.register("org_1", BASIC_INPUT);

  assert.deepEqual(calls[0]?.conflict?.set?.["selection"], {});
});

test("[boundary-8] a re-registration with an explicitly undefined selection resets it to {}", async () => {
  const { store, calls } = createBoardDb({ insert: [[boardRow()]] });

  await store.register("org_1", { ...BASIC_INPUT, selection: undefined });

  assert.deepEqual(calls[0]?.conflict?.set?.["selection"], {});
  assert.deepEqual(calls[0]?.values?.["selection"], {});
});

// ---------------------------------------------------------------------------
// Rule: register fails loudly on no row; database errors pass through
// ---------------------------------------------------------------------------

test("[unhappy-2] an upsert that returns no row rejects", async () => {
  const { store } = createBoardDb({ insert: [[]] });

  await assert.rejects(
    () => store.register("org_1", BASIC_INPUT),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Failed to register the Jira board.");
      return true;
    },
  );
});

test("[unhappy-2] the no-row rejection is a plain Error, whatever the input", async () => {
  const { store } = createBoardDb({ insert: [[]] });

  await assert.rejects(
    () =>
      store.register("org_1", {
        ...BASIC_INPUT,
        projectKey: "PLAT",
        selection: { maxTickets: 5 },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(Object.getPrototypeOf(error), Error.prototype);
      assert.equal(error.message, "Failed to register the Jira board.");
      return true;
    },
  );
});

test("[unhappy-3] a database error is passed through", async () => {
  const failure = new Error(
    "insert or update on table violates foreign key constraint",
  );
  const { store } = createBoardDb({ insert: [failure] });

  await assert.rejects(
    () =>
      store.register("org_1", { ...BASIC_INPUT, connectionId: "jrc_missing" }),
    (error: unknown) => {
      assert.equal(error, failure);
      return true;
    },
  );
});

test("[unhappy-3] a database error carrying extra fields is passed through as the same object", async () => {
  const failure = Object.assign(new Error("connection terminated"), {
    code: "57P01",
  });
  const { store, calls } = createBoardDb({ insert: [failure] });

  await assert.rejects(
    () => store.register("org_1", BASIC_INPUT),
    (error: unknown) => {
      assert.equal(error, failure);
      assert.equal((error as { code?: string }).code, "57P01");
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

// ---------------------------------------------------------------------------
// Rule: update reads, then writes once; selection merged key by key
// ---------------------------------------------------------------------------

test("[happy-6] update merges the selection and toggles write-back", async () => {
  const merged = { maxTickets: 5, issueTypes: ["Bug"], minAgeDays: 30 };
  const { store, calls } = createBoardDb({
    select: [[boardRow()]],
    update: [[boardRow({ writebackEnabled: true, selection: merged })]],
  });

  const summary = await store.update("org_1", "jrb_1", {
    selection: { minAgeDays: 30 },
    writebackEnabled: true,
  });

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["select", "update"],
  );
  assert.equal(calls[0]?.filtered, true);
  assert.equal(calls[1]?.filtered, true);
  const values = calls[1]?.values ?? {};
  assert.deepEqual(values["selection"], merged);
  assert.equal(values["writebackEnabled"], true);
  assert.ok(values["updatedAt"] instanceof Date);
  assert.equal(summary?.writebackEnabled, true);
  assert.deepEqual(summary?.selection, merged);
});

test("[happy-6] update replaces a stored key it is given and keeps the others", async () => {
  const { store, calls } = createBoardDb({
    select: [[boardRow()]],
    update: [[boardRow()]],
  });

  await store.update("org_1", "jrb_1", {
    selection: { issueTypes: ["Story"] },
    writebackEnabled: false,
  });

  const values = calls[1]?.values ?? {};
  assert.deepEqual(values["selection"], {
    maxTickets: 5,
    issueTypes: ["Story"],
  });
  assert.equal(values["writebackEnabled"], false);
});

interface UpdateExample {
  readonly label: string;
  readonly input: UpdateBoardInput;
  readonly keys: readonly string[];
  readonly selection: Record<string, unknown>;
}

const UPDATE_EXAMPLES: readonly UpdateExample[] = [
  {
    label: "{writebackEnabled: false}",
    input: { writebackEnabled: false },
    keys: ["selection", "writebackEnabled", "updatedAt"],
    selection: { maxTickets: 5, issueTypes: ["Bug"] },
  },
  {
    label: "{selection: {maxTickets: 3}}",
    input: { selection: { maxTickets: 3 } },
    keys: ["selection", "updatedAt"],
    selection: { maxTickets: 3, issueTypes: ["Bug"] },
  },
  {
    label: "{selection: {}}",
    input: { selection: {} },
    keys: ["selection", "updatedAt"],
    selection: { maxTickets: 5, issueTypes: ["Bug"] },
  },
  {
    label: "{selection: {maxAgeDays: null}}",
    input: { selection: { maxAgeDays: null } },
    keys: ["selection", "updatedAt"],
    selection: { maxTickets: 5, issueTypes: ["Bug"], maxAgeDays: null },
  },
  {
    label: "{selection: undefined, writebackEnabled: true}",
    input: { selection: undefined, writebackEnabled: true },
    keys: ["selection", "writebackEnabled", "updatedAt"],
    selection: { maxTickets: 5, issueTypes: ["Bug"] },
  },
  {
    label: "{}",
    input: {},
    keys: ["selection", "updatedAt"],
    selection: { maxTickets: 5, issueTypes: ["Bug"] },
  },
];

for (const example of UPDATE_EXAMPLES) {
  test(`[boundary-9] update ${example.label} writes exactly ${example.keys.join(", ")}`, async () => {
    const { store, calls } = createBoardDb({
      select: [[boardRow()]],
      update: [[boardRow()]],
    });

    await store.update("org_1", "jrb_1", example.input);

    const write = calls.find((call) => call.kind === "update");
    assert.ok(write, "no update was made");
    assert.deepEqual(sortedKeys(write.values), [...example.keys].sort());
    assert.deepEqual(write.values?.["selection"], example.selection);
    assert.ok(write.values?.["updatedAt"] instanceof Date);
  });
}

test("[boundary-10] the selection is not validated", async () => {
  const { store, calls } = createBoardDb({
    select: [[boardRow()]],
    update: [[boardRow()]],
  });

  await store.update("org_1", "jrb_1", {
    selection: { minAgeDays: 30, maxAgeDays: 7 },
  });

  assert.deepEqual(calls[1]?.values?.["selection"], {
    maxTickets: 5,
    issueTypes: ["Bug"],
    minAgeDays: 30,
    maxAgeDays: 7,
  });
});

test("[boundary-10] out-of-range and fractional values are written as given", async () => {
  const { store, calls } = createBoardDb({
    select: [[boardRow()]],
    update: [[boardRow()]],
  });

  await store.update("org_1", "jrb_1", {
    selection: { maxTickets: 101, minAgeDays: 1.5, issueTypes: ["Bug", "Bug", ""] },
  });

  assert.deepEqual(calls[1]?.values?.["selection"], {
    maxTickets: 101,
    issueTypes: ["Bug", "Bug", ""],
    minAgeDays: 1.5,
  });
});

const UPDATE_MISSES: ReadonlyArray<readonly [string, UpdateBoardInput]> = [
  ["{writebackEnabled: true}", { writebackEnabled: true }],
  ["{}", {}],
];

for (const [label, input] of UPDATE_MISSES) {
  test(`[unhappy-4] an update ${label} that misses is null and writes nothing`, async () => {
    const { store, calls } = createBoardDb({ select: [[]] });

    const result = await store.update("org_2", "jrb_1", input);

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "select");
    assert.equal(calls[0]?.filtered, true);
  });
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

test("[concurrency-1] update overlapping a remove resolves to null", async () => {
  const { store, calls } = createBoardDb({
    select: [[boardRow()]],
    delete: [[boardRow()]],
    update: [[]],
  });

  const [updated] = await Promise.all([
    store.update("org_1", "jrb_1", { writebackEnabled: true }),
    store.remove("org_1", "jrb_1"),
  ]);

  assert.equal(updated, null);
  assert.deepEqual(
    calls
      .filter((call) => call.kind === "select" || call.kind === "update")
      .map((call) => call.kind),
    ["select", "update"],
  );
  assert.ok(!calls.some((call) => call.kind === "insert"));
});

test("[concurrency-1] an empty update overlapping a remove does not bring the board back", async () => {
  const { store, calls } = createBoardDb({
    select: [[boardRow()]],
    delete: [[boardRow()]],
    update: [[]],
  });

  const [updated] = await Promise.all([
    store.update("org_1", "jrb_1", { selection: {} }),
    store.remove("org_1", "jrb_1"),
  ]);

  assert.equal(updated, null);
  assert.ok(!calls.some((call) => call.kind === "insert"));
  assert.equal(calls.find((call) => call.kind === "update")?.filtered, true);
});

test("[concurrency-2] two registrations of board 42 at once", async () => {
  const { store, calls } = createBoardDb({
    insert: [[boardRow()], [boardRow()]],
  });

  const first = store.register("org_1", BASIC_INPUT);
  const second = store.register("org_1", BASIC_INPUT);
  const [a, b] = await Promise.all([first, second]);

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["insert", "insert"],
  );
  for (const call of calls) {
    assert.ok(call.conflict, "an insert has no conflict target");
    const target = targetColumns(call.conflict.target);
    assert.ok(target.includes(jiraBoard.connectionId));
    assert.ok(target.includes(jiraBoard.externalId));
  }
  assert.equal(a.id, "jrb_1");
  assert.equal(b.id, "jrb_1");
});

test("[concurrency-2] overlapping registrations with different names both resolve to the row returned", async () => {
  const { store, calls } = createBoardDb({
    insert: [[boardRow({ name: "Platform v2" })], [boardRow({ name: "Platform v2" })]],
  });

  const [a, b] = await Promise.all([
    store.register("org_1", { ...BASIC_INPUT, name: "Platform" }),
    store.register("org_1", { ...BASIC_INPUT, name: "Platform v2" }),
  ]);

  assert.ok(!calls.some((call) => call.kind === "select"));
  assert.equal(calls.length, 2);
  assert.deepEqual(a, b);
  assert.equal(a.id, "jrb_1");
  assert.equal(a.name, "Platform v2");
});

// ---------------------------------------------------------------------------
// Rule: remove deletes with both predicates and reports whether a row went
// ---------------------------------------------------------------------------

test("[happy-7] removing an owned board", async () => {
  const { store, calls } = createBoardDb({ delete: [[boardRow()]] });

  assert.equal(await store.remove("org_1", "jrb_1"), true);
  assert.equal(calls[0]?.kind, "delete");
  assert.equal(calls[0]?.filtered, true);
});

test("[happy-7] remove makes exactly one call, the delete", async () => {
  const { store, calls } = createBoardDb({ delete: [[boardRow()]] });

  await store.remove("org_1", "jrb_1");

  assert.deepEqual(
    calls.map((call) => call.kind),
    ["delete"],
  );
});

test("[unhappy-5] removing another organization's board", async () => {
  const { store } = createBoardDb({ delete: [[]] });

  assert.equal(await store.remove("org_2", "jrb_1"), false);
});

test("[unhappy-5] a remove that misses is still an owner-scoped delete", async () => {
  const { store, calls } = createBoardDb({ delete: [[]] });

  const removed = await store.remove("org_2", "jrb_1");

  assert.equal(removed, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "delete");
  assert.equal(calls[0]?.filtered, true);
});

// ---------------------------------------------------------------------------
// Rule: forRun is one owner-scoped joined query
// ---------------------------------------------------------------------------

test("[happy-8] forRun returns what a run needs", async () => {
  const { store, calls } = createBoardDb({
    select: [[{ jira_board: boardRow(), jira_connection: CONNECTION }]],
  });

  const result = await store.forRun("org_1", "jrb_1");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
  assert.deepEqual(result, {
    board: B1_SUMMARY,
    connectionId: "jrc_1",
    cloudId: "cloud-1",
    siteUrl: "https://acme.atlassian.net",
  });
  assert.deepEqual(sortedKeys(result ?? undefined), [
    "board",
    "cloudId",
    "connectionId",
    "siteUrl",
  ]);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("Token"));
  assert.ok(!serialized.includes("Enc"));
});

test("[happy-8] forRun joins the connection and hands back the board as a summary", async () => {
  const { store, calls } = createBoardDb({
    select: [
      [
        {
          jira_board: boardRow({ writebackEnabled: true }),
          jira_connection: {
            id: "jrc_1",
            cloudId: "cloud-2",
            siteUrl: "https://other.atlassian.net",
          },
        },
      ],
    ],
  });

  const result = await store.forRun("org_1", "jrb_1");

  assert.equal(calls[0]?.joined, true);
  assert.equal(result?.cloudId, "cloud-2");
  assert.equal(result?.siteUrl, "https://other.atlassian.net");
  assert.equal(result?.board.writebackEnabled, true);
  assert.ok(result !== null && !("organizationId" in result.board));
  assert.ok(result !== null && !("updatedAt" in result.board));
});

test("[boundary-11] forRun returns the stored selection as get does", async () => {
  const { store } = createBoardDb({
    select: [
      [
        {
          jira_board: boardRow({ selection: { maxTickets: 500, minAgeDays: 14 } }),
          jira_connection: CONNECTION,
        },
      ],
    ],
  });

  const result = await store.forRun("org_1", "jrb_1");

  assert.deepEqual(result?.board.selection, { maxTickets: 500, minAgeDays: 14 });
});

test("[boundary-11] forRun reads a null selection as {}", async () => {
  const { store } = createBoardDb({
    select: [[{ jira_board: boardRow({ selection: null }), jira_connection: CONNECTION }]],
  });

  const result = await store.forRun("org_1", "jrb_1");

  assert.deepEqual(result?.board.selection, {});
});

test("[unhappy-6] forRun for a board the caller does not own is null", async () => {
  const { store } = createBoardDb({ select: [[]] });

  assert.equal(await store.forRun("org_2", "jrb_1"), null);
});

test("[unhappy-6] a forRun miss is a single owner-scoped select", async () => {
  const { store, calls } = createBoardDb({ select: [[]] });

  const result = await store.forRun("org_2", "jrb_1");

  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.kind, "select");
  assert.equal(calls[0]?.filtered, true);
});

// ---------------------------------------------------------------------------
// Rule: the jira_board table
// ---------------------------------------------------------------------------

test("[happy-9] the barrel exports the table", () => {
  const fromModule = (jiraSchema as Record<string, unknown>)["jiraBoard"];

  assert.notEqual(fromModule, undefined, "schema/jira.ts does not export jiraBoard");
  assert.equal(schema.jiraBoard, fromModule);
  assert.equal(getTableConfig(jiraBoard).name, "jira_board");
});

test("[happy-9] the barrel still re-exports jiraConnection beside jiraBoard", () => {
  assert.equal(schema.jiraConnection, jiraSchema.jiraConnection);
  assert.equal(getTableConfig(schema.jiraConnection).name, "jira_connection");
  assert.equal(
    (jiraSchema as Record<string, unknown>)["jiraBoard"],
    schema.jiraBoard,
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

test("[happy-10] columns, nullability and defaults", () => {
  const { columns } = getTableConfig(jiraBoard);
  const byName = (name: string) =>
    columns.find((column) => column.name === name);

  for (const [name, notNull] of COLUMNS) {
    const column = byName(name);
    assert.ok(column, `jira_board has no ${name} column`);
    assert.equal(column.notNull, notNull, `${name} notNull`);
  }
  assert.deepEqual(byName("selection")?.default, {});
  assert.equal(byName("writeback_enabled")?.default, false);
  assert.equal(byName("created_at")?.hasDefault, true);
  assert.equal(byName("updated_at")?.hasDefault, true);
});

test("[happy-10] jira_board has exactly these columns, keyed by id, with no default on the nullable project key", () => {
  const { columns } = getTableConfig(jiraBoard);

  assert.deepEqual(
    columns.map((column) => column.name).sort(),
    COLUMNS.map(([name]) => name).sort(),
  );
  assert.equal(
    columns.find((column) => column.name === "id")?.primary,
    true,
  );
  const projectKey = columns.find((column) => column.name === "project_key");
  assert.equal(projectKey?.notNull, false);
  assert.equal(projectKey?.hasDefault, false);
});

test("[happy-11] both owners cascade", () => {
  const references = getTableConfig(jiraBoard).foreignKeys.map((key) => ({
    onDelete: key.onDelete,
    reference: key.reference(),
  }));

  const toOrganization = references.find(
    ({ reference }) =>
      reference.foreignTable === organizationSchema.organization,
  );
  assert.ok(toOrganization, "jira_board does not reference organization");
  assert.equal(toOrganization.onDelete, "cascade");

  const toConnection = references.find(
    ({ reference }) => reference.foreignTable === jiraSchema.jiraConnection,
  );
  assert.ok(toConnection, "jira_board does not reference jira_connection");
  assert.equal(toConnection.onDelete, "cascade");
});

test("[happy-11] the two foreign keys hang off organization_id and connection_id", () => {
  const keys = getTableConfig(jiraBoard).foreignKeys.map((key) =>
    key.reference(),
  );

  assert.equal(keys.length, 2);
  const toOrganization = keys.find(
    (reference) => reference.foreignTable === organizationSchema.organization,
  );
  const toConnection = keys.find(
    (reference) => reference.foreignTable === jiraSchema.jiraConnection,
  );
  assert.deepEqual(
    toOrganization?.columns.map((column) => column.name),
    ["organization_id"],
  );
  assert.deepEqual(
    toConnection?.columns.map((column) => column.name),
    ["connection_id"],
  );
  assert.deepEqual(
    toConnection?.foreignColumns.map((column) => column.name),
    ["id"],
  );
});

test("[happy-12] one row per Jira board per connection, indexed for its owner", () => {
  const config = getTableConfig(jiraBoard);

  const constraint = config.uniqueConstraints.find(
    (candidate) => candidate.name === "jira_board_connection_external_unique",
  );
  assert.ok(constraint, "missing jira_board_connection_external_unique");
  assert.deepEqual(
    constraint.columns.map((column) => column.name),
    ["connection_id", "external_id"],
  );

  const index = config.indexes.find(
    (candidate) => candidate.config.name === "jira_board_organization_id_idx",
  );
  assert.ok(index, "missing jira_board_organization_id_idx");
  const first = index.config.columns[0];
  assert.equal(
    first !== undefined && "name" in first ? first.name : undefined,
    "organization_id",
  );
});

test("[happy-12] uniqueness is per connection, not per organization, and the owner index has one column", () => {
  const config = getTableConfig(jiraBoard);

  const constraint = config.uniqueConstraints.find(
    (candidate) => candidate.name === "jira_board_connection_external_unique",
  );
  assert.ok(
    !(constraint?.columns ?? []).some(
      (column) => column.name === "organization_id",
    ),
  );
  const index = config.indexes.find(
    (candidate) => candidate.config.name === "jira_board_organization_id_idx",
  );
  assert.equal(index?.config.columns.length, 1);
});
