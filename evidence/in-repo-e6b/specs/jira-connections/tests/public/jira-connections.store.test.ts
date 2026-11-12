/**
 * `JiraConnectionStore` over an in-memory stand-in for Drizzle.
 *
 * The fake answers only the query shapes the spec lists, one per method
 * call, and records every call so that "touches the database not at all" and
 * "exactly one update" can be asserted. It keeps state: an insert applies its
 * conflict set to the row with the same (organizationId, cloudId), and an
 * update is applied when its `where()` is called. `sql\`now()\`` is written
 * as a fixed date, so nothing here reads the clock.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { createTokenCipher, TokenCipherError } from "../src/cipher.js";
import {
  createJiraConnectionStore,
  type JiraConnectionInput,
} from "../src/jira-connections.js";
import { jiraConnection, type JiraConnectionRow } from "../src/schema/jira.js";
import type { Database } from "../src/store.js";

/** Bytes 0..31; default key id "630dcd29". */
const K1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
/** Bytes 32..63; default key id "72dbb733". */
const K2 = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";

/** The store's cipher, `createTokenCipher(K1)`; built per call so a failure is per test. */
function k1() {
  return createTokenCipher(K1);
}

/** What the fake writes for `sql\`now()\`` and for a new row's timestamps. */
const FAKE_NOW = new Date("2026-11-04T09:30:00.000Z");

const SUMMARY_KEYS = [
  "cloudId",
  "createdAt",
  "email",
  "healthy",
  "id",
  "scopes",
  "siteName",
  "siteUrl",
];

const ID_PATTERN =
  /^jrc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---- the fake --------------------------------------------------------------

interface Condition {
  readonly column: string;
  readonly value: unknown;
}

/** Recovers `column = value` pairs from an `eq`/`and` clause. */
function conditions(where: unknown): Condition[] {
  const out: Condition[] = [];
  collect(where, out);
  return out;
}

function collect(node: unknown, out: Condition[]): void {
  if (typeof node !== "object" || node === null) {
    return;
  }
  const chunks = (node as { queryChunks?: unknown }).queryChunks;
  if (!Array.isArray(chunks)) {
    return;
  }
  let column: string | undefined;
  for (const chunk of chunks) {
    if (typeof chunk !== "object" || chunk === null) {
      continue;
    }
    const record = chunk as Record<string, unknown>;
    if (Array.isArray(record["queryChunks"])) {
      collect(chunk, out);
      continue;
    }
    if (typeof record["name"] === "string" && "table" in record) {
      column = record["name"];
      continue;
    }
    if (Array.isArray(record["value"])) {
      continue;
    }
    if ("value" in record && column !== undefined) {
      out.push({ column, value: record["value"] });
      column = undefined;
    }
  }
}

/** `organization_id` → `organizationId`. */
function property(column: string): string {
  return column.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

function matches(row: JiraConnectionRow, found: Condition[]): boolean {
  return found.every(
    (condition) =>
      (row as unknown as Record<string, unknown>)[property(condition.column)] ===
      condition.value,
  );
}

/** True when `value` is the SQL fragment `now()`. */
function isSqlNow(value: unknown): boolean {
  return (
    value instanceof SQL &&
    new PgDialect().sqlToQuery(value).sql.trim().toLowerCase() === "now()"
  );
}

function copy(row: JiraConnectionRow): JiraConnectionRow {
  return { ...row, scopes: [...row.scopes] };
}

function applyPatch(row: JiraConnectionRow, patch: Record<string, unknown>) {
  const target = row as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    target[key] = isSqlNow(value) ? FAKE_NOW : value;
  }
}

/** A thenable that runs `compute` once, when first awaited. */
function lazy<T>(compute: () => T) {
  let result: Promise<T> | undefined;
  return {
    then<A = T, B = never>(
      onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
      onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): Promise<A | B> {
      result ??= Promise.resolve().then(compute);
      return result.then(onFulfilled, onRejected);
    },
  };
}

interface InsertCall {
  readonly values: Record<string, unknown>;
  readonly target: unknown;
  readonly set: Record<string, unknown>;
}

interface UpdateCall {
  readonly set: Record<string, unknown>;
  readonly where: Condition[];
}

interface FakeJiraDb {
  readonly db: Database;
  readonly rows: JiraConnectionRow[];
  /** Every top-level call (`select`, `insert`, `update`, `delete`), in order. */
  readonly calls: string[];
  readonly inserts: InsertCall[];
  /** Inserts in the order the fake applied them. */
  readonly applied: InsertCall[];
  /** Updates in the order the fake applied them (their `where()` order). */
  readonly updates: UpdateCall[];
}

function createFakeJiraDb(
  seed: JiraConnectionRow[] = [],
  options: { insertReturnsNothing?: boolean } = {},
): FakeJiraDb {
  const rows = seed.map(copy);
  const calls: string[] = [];
  const inserts: InsertCall[] = [];
  const applied: InsertCall[] = [];
  const updates: UpdateCall[] = [];

  function select() {
    calls.push("select");
    let where: unknown;
    let limit: number | undefined;
    const run = () => {
      const found = conditions(where);
      const out = rows.filter((row) => matches(row, found)).map(copy);
      return limit === undefined ? out : out.slice(0, limit);
    };
    const afterWhere = {
      ...lazy(run),
      limit: (value: number) => {
        limit = value;
        return lazy(run);
      },
    };
    return {
      from: (_table: unknown) => ({
        where: (value: unknown) => {
          where = value;
          return afterWhere;
        },
      }),
    };
  }

  function insert(_table: unknown) {
    calls.push("insert");
    return {
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: (config: {
          target: unknown;
          set: Record<string, unknown>;
        }) => {
          const call: InsertCall = {
            values,
            target: config.target,
            set: config.set,
          };
          inserts.push(call);
          return {
            returning: (..._args: unknown[]) =>
              lazy(() => {
                applied.push(call);
                if (options.insertReturnsNothing === true) {
                  return [];
                }
                const existing = rows.find(
                  (row) =>
                    row.organizationId === values["organizationId"] &&
                    row.cloudId === values["cloudId"],
                );
                if (existing !== undefined) {
                  applyPatch(existing, config.set);
                  return [copy(existing)];
                }
                const created: JiraConnectionRow = {
                  id: values["id"] as string,
                  organizationId: values["organizationId"] as string,
                  cloudId: values["cloudId"] as string,
                  siteUrl: values["siteUrl"] as string,
                  siteName: values["siteName"] as string,
                  email: (values["email"] ?? null) as string | null,
                  accessToken: (values["accessToken"] ?? null) as string | null,
                  refreshToken: (values["refreshToken"] ?? null) as
                    | string
                    | null,
                  expiresAt: (values["expiresAt"] ?? null) as Date | null,
                  scopes: [...((values["scopes"] ?? []) as string[])],
                  healthy: (values["healthy"] ?? true) as boolean,
                  createdAt: FAKE_NOW,
                  updatedAt: FAKE_NOW,
                };
                rows.push(created);
                return [copy(created)];
              }),
          };
        },
      }),
    };
  }

  function update(_table: unknown) {
    calls.push("update");
    return {
      set: (set: Record<string, unknown>) => ({
        where: (value: unknown) => {
          const found = conditions(value);
          updates.push({ set, where: found });
          for (const row of rows) {
            if (matches(row, found)) {
              applyPatch(row, set);
            }
          }
          return lazy(() => []);
        },
      }),
    };
  }

  function remove(_table: unknown) {
    calls.push("delete");
    return {
      where: (value: unknown) => ({
        returning: (..._args: unknown[]) =>
          lazy(() => {
            const found = conditions(value);
            const gone = rows.filter((row) => matches(row, found));
            for (const row of gone) {
              rows.splice(rows.indexOf(row), 1);
            }
            return gone.map((row) => ({ id: row.id }));
          }),
      }),
    };
  }

  const db = { select, insert, update, delete: remove };
  return {
    db: db as unknown as Database,
    rows,
    calls,
    inserts,
    applied,
    updates,
  };
}

// ---- fixtures --------------------------------------------------------------

function row(over: Partial<JiraConnectionRow> = {}): JiraConnectionRow {
  return {
    id: "jrc_a",
    organizationId: "org_1",
    cloudId: "c-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme",
    email: "ada@acme.test",
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scopes: ["read:jira-work"],
    healthy: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  };
}

const INPUT: JiraConnectionInput = {
  cloudId: "c-1",
  siteUrl: "https://acme.atlassian.net",
  siteName: "Acme",
  email: "ada@acme.test",
  accessToken: "AT-1",
  refreshToken: "RT-1",
  expiresAt: "2026-11-04T12:00:00.000Z",
  scopes: ["read:jira-work", "offline_access"],
};

/** `INPUT` with no `email` key at all. */
const INPUT_WITHOUT_EMAIL: JiraConnectionInput = {
  cloudId: INPUT.cloudId,
  siteUrl: INPUT.siteUrl,
  siteName: INPUT.siteName,
  accessToken: INPUT.accessToken,
  refreshToken: INPUT.refreshToken,
  expiresAt: INPUT.expiresAt,
  scopes: INPUT.scopes,
};

function firstInsert(fake: FakeJiraDb): InsertCall {
  assert.equal(fake.inserts.length, 1);
  const call = fake.inserts[0];
  assert.ok(call);
  return call;
}

function onlyUpdate(fake: FakeJiraDb): UpdateCall {
  assert.equal(fake.updates.length, 1);
  const call = fake.updates[0];
  assert.ok(call);
  return call;
}

function rangeError(message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof RangeError, "not a RangeError");
    assert.equal(error.message, message);
    return true;
  };
}

function cipherError(message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof TokenCipherError, "not a TokenCipherError");
    assert.equal(error.message, message);
    return true;
  };
}

function expiryMessage(value: string): string {
  return `expiresAt must be an ISO 8601 timestamp with an offset, got "${value}".`;
}

// ---- upsert ----------------------------------------------------------------

test("[happy-12] a new connection is inserted with encrypted tokens", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.upsert("org_1", INPUT);

  const { values, target } = firstInsert(fake);
  assert.match(String(values["id"]), ID_PATTERN);
  assert.equal(values["organizationId"], "org_1");
  assert.equal(values["cloudId"], "c-1");
  assert.equal(values["healthy"], true);
  assert.deepEqual(values["expiresAt"], new Date("2026-11-04T12:00:00.000Z"));
  assert.notEqual(values["accessToken"], "AT-1");
  assert.equal(k1().decrypt(values["accessToken"] as string), "AT-1");
  assert.notEqual(values["refreshToken"], "RT-1");
  assert.equal(k1().decrypt(values["refreshToken"] as string), "RT-1");

  assert.ok(Array.isArray(target));
  assert.equal(target.length, 2);
  assert.equal(target[0], jiraConnection.organizationId);
  assert.equal(target[1], jiraConnection.cloudId);

  const stored = fake.rows[0];
  assert.ok(stored);
  assert.deepEqual(result, {
    id: values["id"],
    cloudId: "c-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme",
    email: "ada@acme.test",
    healthy: true,
    scopes: ["read:jira-work", "offline_access"],
    createdAt: stored.createdAt.toISOString(),
  });
  assert.deepEqual(Object.keys(result).sort(), SUMMARY_KEYS);
});

test("[happy-12] the insert values carry exactly the documented properties", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  await store.upsert("org_1", INPUT);

  const { values } = firstInsert(fake);
  assert.deepEqual(Object.keys(values).sort(), [
    "accessToken",
    "cloudId",
    "email",
    "expiresAt",
    "healthy",
    "id",
    "organizationId",
    "refreshToken",
    "scopes",
    "siteName",
    "siteUrl",
  ]);
  assert.equal("createdAt" in values, false);
  assert.equal("updatedAt" in values, false);
});

test("[happy-13] reconnecting the same site updates the existing row", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1", cloudId: "c-1", healthy: false }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.upsert("org_1", {
    cloudId: "c-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme Corp",
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: null,
    scopes: [],
  });

  assert.equal(result.id, "jrc_a");
  assert.equal(result.siteName, "Acme Corp");
  assert.equal(result.email, null);
  assert.equal(result.healthy, true);
  assert.deepEqual(result.scopes, []);
  assert.equal(result.createdAt, "2026-01-01T00:00:00.000Z");

  const { set } = firstInsert(fake);
  for (const key of ["id", "organizationId", "cloudId", "createdAt"]) {
    assert.equal(key in set, false, `set has ${key}`);
  }
  assert.equal(isSqlNow(set["updatedAt"]), true);
  assert.equal(set["healthy"], true);
});

test("[happy-13] the conflict set is the values without the key columns, plus updatedAt", async () => {
  const fake = createFakeJiraDb([row({ healthy: false })]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.upsert("org_1", { ...INPUT, accessToken: "AT-2" });

  const { set, values } = firstInsert(fake);
  assert.deepEqual(Object.keys(set).sort(), [
    "accessToken",
    "email",
    "expiresAt",
    "healthy",
    "refreshToken",
    "scopes",
    "siteName",
    "siteUrl",
    "updatedAt",
  ]);
  assert.equal(k1().decrypt(set["accessToken"] as string), "AT-2");
  assert.equal(set["siteUrl"], values["siteUrl"]);
  assert.equal(set["siteName"], values["siteName"]);
  assert.deepEqual(set["expiresAt"], values["expiresAt"]);
  assert.equal(fake.rows.length, 1);
});

test("[boundary-5] an omitted, undefined or null email is stored as null; a given one as is", async () => {
  const cases: Array<[JiraConnectionInput, string | null]> = [
    [INPUT_WITHOUT_EMAIL, null],
    [{ ...INPUT, email: undefined }, null],
    [{ ...INPUT, email: null }, null],
    [{ ...INPUT, email: "Ada@ACME.test" }, "Ada@ACME.test"],
  ];
  for (const [input, expected] of cases) {
    const fake = createFakeJiraDb();
    await createJiraConnectionStore(fake.db, k1()).upsert("org_1", input);
    const { values } = firstInsert(fake);
    assert.equal("email" in values, true);
    assert.equal(values["email"], expected);
  }
});

test("[boundary-5] null and empty tokens, expiry offsets and fractions, scopes and padded names", async () => {
  async function valuesOf(
    input: JiraConnectionInput,
  ): Promise<Record<string, unknown>> {
    const fake = createFakeJiraDb();
    await createJiraConnectionStore(fake.db, k1()).upsert("org_1", input);
    return firstInsert(fake).values;
  }

  const nulls = await valuesOf({
    ...INPUT,
    accessToken: null,
    refreshToken: null,
  });
  assert.equal(nulls["accessToken"], null);
  assert.equal(nulls["refreshToken"], null);

  const empty = await valuesOf({ ...INPUT, accessToken: "" });
  assert.equal(typeof empty["accessToken"], "string");
  assert.equal(k1().decrypt(empty["accessToken"] as string), "");

  assert.equal((await valuesOf({ ...INPUT, expiresAt: null }))["expiresAt"], null);
  assert.deepEqual(
    (await valuesOf({ ...INPUT, expiresAt: "2026-11-04T12:00+01:00" }))[
      "expiresAt"
    ],
    new Date("2026-11-04T11:00:00.000Z"),
  );
  assert.deepEqual(
    (await valuesOf({ ...INPUT, expiresAt: "2026-11-04T12:00:00.123456Z" }))[
      "expiresAt"
    ],
    new Date("2026-11-04T12:00:00.123Z"),
  );

  assert.deepEqual(
    (await valuesOf({ ...INPUT, scopes: ["b", "a", "b"] }))["scopes"],
    ["b", "a", "b"],
  );
  assert.equal(
    (await valuesOf({ ...INPUT, siteName: " Acme " }))["siteName"],
    " Acme ",
  );
});

test("[unhappy-9] a blank cloudId, siteUrl or siteName rejects before any query", async () => {
  const cases: Array<[Partial<JiraConnectionInput>, string]> = [
    [{ cloudId: "" }, "cloudId must not be empty."],
    [{ cloudId: "  " }, "cloudId must not be empty."],
    [{ siteUrl: "" }, "siteUrl must not be empty."],
    [{ siteName: "\t" }, "siteName must not be empty."],
    [{ cloudId: "", siteName: "" }, "cloudId must not be empty."],
  ];
  for (const [patch, message] of cases) {
    const fake = createFakeJiraDb();
    const store = createJiraConnectionStore(fake.db, k1());
    await assert.rejects(
      () => store.upsert("org_1", { ...INPUT, ...patch }),
      rangeError(message),
    );
    assert.deepEqual(fake.calls, []);
  }
});

test("[unhappy-9] an expiresAt that is not ISO 8601 with an offset rejects before any query", async () => {
  for (const expiresAt of [
    "soon",
    "2026-11-04T12:00:00",
    "2026-11-04",
    "2026-13-01T00:00:00Z",
    "Wed, 04 Nov 2026 12:00:00 GMT",
  ]) {
    const fake = createFakeJiraDb();
    const store = createJiraConnectionStore(fake.db, k1());
    await assert.rejects(
      () => store.upsert("org_1", { ...INPUT, expiresAt }),
      rangeError(expiryMessage(expiresAt)),
    );
    assert.deepEqual(fake.calls, []);
  }
});

test("[unhappy-10] an insert that returns no row rejects", async () => {
  const fake = createFakeJiraDb([], { insertReturnsNothing: true });
  const store = createJiraConnectionStore(fake.db, k1());

  await assert.rejects(
    () => store.upsert("org_1", INPUT),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Upsert returned no row.");
      return true;
    },
  );
});

test("[unhappy-10] an empty returning rejects after exactly one insert and no select", async () => {
  const fake = createFakeJiraDb([], { insertReturnsNothing: true });
  const store = createJiraConnectionStore(fake.db, k1());

  await assert.rejects(
    () =>
      store.upsert("org_1", {
        ...INPUT,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
      }),
    { message: "Upsert returned no row." },
  );
  assert.deepEqual(fake.calls, ["insert"]);
});

test("[concurrency-1] two overlapping upserts of the same site leave one connection", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  const first = store.upsert("org_1", { ...INPUT, siteName: "A" });
  const second = store.upsert("org_1", { ...INPUT, siteName: "B" });
  const [a, b] = await Promise.all([first, second]);

  assert.equal(a.id, b.id);
  const held = fake.rows.filter(
    (candidate) =>
      candidate.organizationId === "org_1" && candidate.cloudId === "c-1",
  );
  assert.equal(held.length, 1);
  const last = fake.applied[fake.applied.length - 1];
  assert.ok(last);
  assert.equal(held[0]?.siteName, last.values["siteName"]);
  assert.deepEqual(fake.calls, ["insert", "insert"]);
});

test("[concurrency-1] overlapping upserts onto an existing row keep its id", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  const [a, b] = await Promise.all([
    store.upsert("org_1", { ...INPUT, siteName: "A" }),
    store.upsert("org_1", { ...INPUT, siteName: "B" }),
  ]);

  assert.equal(a.id, "jrc_a");
  assert.equal(b.id, "jrc_a");
  assert.equal(fake.rows.length, 1);
  assert.equal(fake.calls.includes("select"), false);
});

test("[happy-14] the same site in two organizations is two connections", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  const one = await store.upsert("org_1", INPUT);
  const two = await store.upsert("org_2", INPUT);

  assert.notEqual(one.id, two.id);
  assert.equal(fake.rows.length, 2);
});

test("[happy-14] each organization's row carries its own owner and the shared cloudId", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  await store.upsert("org_1", INPUT);
  await store.upsert("org_2", INPUT);

  assert.deepEqual(
    fake.rows.map((candidate) => [candidate.organizationId, candidate.cloudId]),
    [
      ["org_1", "c-1"],
      ["org_2", "c-1"],
    ],
  );
});

// ---- list and get ----------------------------------------------------------

test("[happy-15] list orders oldest first, then by id", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_c", cloudId: "c-3", createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    row({ id: "jrc_b", cloudId: "c-2", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    row({ id: "jrc_a", cloudId: "c-1", createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    row({ id: "jrc_z", organizationId: "org_2", createdAt: new Date("2025-01-01T00:00:00.000Z") }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  const summaries = await store.list("org_1");

  assert.deepEqual(
    summaries.map((summary) => summary.id),
    ["jrc_b", "jrc_a", "jrc_c"],
  );
  for (const summary of summaries) {
    assert.deepEqual(Object.keys(summary).sort(), SUMMARY_KEYS);
  }
});

test("[happy-15] ties on createdAt are ordered by id in code-unit order", async () => {
  const createdAt = new Date("2026-03-01T00:00:00.000Z");
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", cloudId: "c-1", createdAt }),
    row({ id: "jrc_B", cloudId: "c-2", createdAt }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  const summaries = await store.list("org_1");

  assert.deepEqual(
    summaries.map((summary) => summary.id),
    ["jrc_B", "jrc_a"],
  );
});

test("[boundary-6] an organization with no connections lists nothing", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.list("org_empty"), []);
});

test("[boundary-6] another organization's connections are not listed", async () => {
  const fake = createFakeJiraDb([row({ organizationId: "org_1" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.list("org_empty"), []);
});

test("[happy-16] summaries do not need the key", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", accessToken: "not-a-ciphertext", refreshToken: "nor-this" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  const listed = await store.list("org_1");
  const got = await store.get("org_1", "jrc_a");

  assert.equal(listed.length, 1);
  assert.equal(got?.id, "jrc_a");
});

test("[happy-16] a store built with another key still lists and gets", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: k1().encrypt("AT-1"),
      refreshToken: k1().encrypt("RT-1"),
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, createTokenCipher(K2));

  assert.equal((await store.list("org_1")).length, 1);
  assert.equal((await store.get("org_1", "jrc_a"))?.id, "jrc_a");
});

test("[happy-17] get returns one summary", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      organizationId: "org_1",
      healthy: false,
      email: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  const summary = await store.get("org_1", "jrc_a");

  assert.ok(summary);
  assert.equal(summary.id, "jrc_a");
  assert.equal(summary.healthy, false);
  assert.equal(summary.email, null);
  assert.equal(summary.createdAt, "2026-01-01T00:00:00.000Z");
});

test("[happy-17] the summary copies the row and has exactly eight keys", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      cloudId: "c-9",
      siteUrl: "https://globex.atlassian.net",
      siteName: "Globex",
      email: "hank@globex.test",
      scopes: ["write:jira-work", "read:jira-work"],
      accessToken: k1().encrypt("AT-1"),
      expiresAt: new Date("2026-11-04T12:00:00.000Z"),
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.get("org_1", "jrc_a"), {
    id: "jrc_a",
    cloudId: "c-9",
    siteUrl: "https://globex.atlassian.net",
    siteName: "Globex",
    email: "hank@globex.test",
    healthy: true,
    scopes: ["write:jira-work", "read:jira-work"],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
});

test("[unhappy-11] get of another organization's connection returns null", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", organizationId: "org_1" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.get("org_2", "jrc_a"), null);
});

test("[unhappy-11] get of a missing or empty id returns null", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", organizationId: "org_1" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.get("org_1", "jrc_nope"), null);
  assert.equal(await store.get("org_1", ""), null);
});

// ---- tokens ----------------------------------------------------------------

test("[happy-18] tokens returns the decrypted pair", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: k1().encrypt("AT-1"),
      refreshToken: k1().encrypt("RT-1"),
      expiresAt: new Date("2026-11-04T12:00:00.000Z"),
      scopes: ["read:jira-work"],
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: "AT-1",
    refreshToken: "RT-1",
    expiresAt: "2026-11-04T12:00:00.000Z",
    scopes: ["read:jira-work"],
  });
});

test("[happy-18] empty-string tokens and empty scopes come back as stored", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: k1().encrypt(""),
      refreshToken: k1().encrypt(""),
      expiresAt: new Date("2026-11-04T12:00:00.000Z"),
      scopes: [],
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: "",
    refreshToken: "",
    expiresAt: "2026-11-04T12:00:00.000Z",
    scopes: [],
  });
});

test("[boundary-7] absent tokens and expiry stay null", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      scopes: ["read:jira-work", "offline_access"],
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scopes: ["read:jira-work", "offline_access"],
  });
});

test("[boundary-7] a missing refresh token stays null beside a present access token", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: k1().encrypt("AT-1"),
      refreshToken: null,
      expiresAt: null,
      scopes: [],
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: "AT-1",
    refreshToken: null,
    expiresAt: null,
    scopes: [],
  });
});

test("[unhappy-12] tokens of another organization's connection returns null", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1", accessToken: k1().encrypt("AT-1") }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.tokens("org_2", "jrc_a"), null);
});

test("[unhappy-12] tokens of a missing connection returns null", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", organizationId: "org_1" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.tokens("org_1", "jrc_nope"), null);
});

test("[unhappy-13] tokens written under another key reject with the cipher error and write nothing", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: createTokenCipher(K2).encrypt("AT-1"),
      refreshToken: null,
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await assert.rejects(
    () => store.tokens("org_1", "jrc_a"),
    cipherError('Ciphertext was encrypted with key "72dbb733", not "630dcd29".'),
  );
  assert.equal(fake.updates.length, 0);
  assert.deepEqual(fake.calls, ["select"]);
});

test("[unhappy-13] a malformed stored refresh token rejects with the cipher error", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: k1().encrypt("AT-1"),
      refreshToken: "not-a-ciphertext",
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await assert.rejects(
    () => store.tokens("org_1", "jrc_a"),
    cipherError("Ciphertext is not in the v1 format."),
  );
  assert.equal(fake.updates.length, 0);
  assert.equal(fake.rows[0]?.healthy, true);
});

// ---- saveTokens ------------------------------------------------------------

test("[happy-19] a refreshed pair is stored encrypted", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", healthy: false })]);
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.saveTokens("jrc_a", {
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: "2026-11-04T13:00:00.000Z",
    scopes: ["read:jira-work"],
  });

  assert.equal(result, undefined);
  const { set, where } = onlyUpdate(fake);
  assert.deepEqual(Object.keys(set).sort(), [
    "accessToken",
    "expiresAt",
    "healthy",
    "refreshToken",
    "scopes",
    "updatedAt",
  ]);
  assert.equal(k1().decrypt(set["accessToken"] as string), "AT-2");
  assert.equal(k1().decrypt(set["refreshToken"] as string), "RT-2");
  assert.deepEqual(set["expiresAt"], new Date("2026-11-04T13:00:00.000Z"));
  assert.deepEqual(set["scopes"], ["read:jira-work"]);
  assert.equal(set["healthy"], true);
  assert.equal(isSqlNow(set["updatedAt"]), true);
  assert.deepEqual(where, [{ column: "id", value: "jrc_a" }]);
});

test("[happy-19] after saveTokens the connection reads back healthy with the new tokens", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", healthy: false, accessToken: k1().encrypt("AT-1") }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.saveTokens("jrc_a", {
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: "2026-11-04T13:00:00.000Z",
    scopes: ["read:jira-work"],
  });

  assert.equal((await store.get("org_1", "jrc_a"))?.healthy, true);
  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: "2026-11-04T13:00:00.000Z",
    scopes: ["read:jira-work"],
  });
});

test("[boundary-8] a grant without offline_access saves a null refresh token", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.saveTokens("jrc_a", {
    accessToken: "AT-2",
    refreshToken: null,
    expiresAt: null,
    scopes: [],
  });

  const { set } = onlyUpdate(fake);
  assert.equal(set["refreshToken"], null);
  assert.equal(set["expiresAt"], null);
  assert.equal(k1().decrypt(set["accessToken"] as string), "AT-2");
});

test("[boundary-8] a fully null token set saves null tokens", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.saveTokens("jrc_a", {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scopes: [],
  });

  const { set } = onlyUpdate(fake);
  assert.equal(set["accessToken"], null);
  assert.equal(set["refreshToken"], null);
  assert.equal(set["expiresAt"], null);
});

test("[boundary-9] saveTokens for an unknown connection id is a no-op", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.saveTokens("jrc_gone", {
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: null,
    scopes: [],
  });

  assert.equal(result, undefined);
  assert.equal(fake.updates.length, 1);
  assert.deepEqual(fake.calls, ["update"]);
});

test("[boundary-9] saveTokens for an unknown id leaves other connections untouched", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", healthy: false })]);
  const store = createJiraConnectionStore(fake.db, k1());
  const before = fake.rows.map(copy);

  await store.saveTokens("jrc_gone", {
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: null,
    scopes: [],
  });

  assert.deepEqual(fake.rows, before);
});

test("[unhappy-14] an unreadable expiry is rejected before any write", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  await assert.rejects(
    () =>
      store.saveTokens("jrc_a", {
        accessToken: "AT",
        refreshToken: "RT",
        expiresAt: "3600",
        scopes: [],
      }),
    rangeError(expiryMessage("3600")),
  );
  assert.deepEqual(fake.calls, []);
});

test("[unhappy-14] an expiry without an offset is rejected before any write", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  await assert.rejects(
    () =>
      store.saveTokens("jrc_a", {
        accessToken: "AT",
        refreshToken: "RT",
        expiresAt: "2026-11-04T13:00:00",
        scopes: [],
      }),
    rangeError(expiryMessage("2026-11-04T13:00:00")),
  );
  assert.deepEqual(fake.calls, []);
});

// ---- markUnhealthy ---------------------------------------------------------

test("[happy-20] markUnhealthy flags a connection", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", organizationId: "org_1", healthy: true })]);
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.markUnhealthy("jrc_a");

  assert.equal(result, undefined);
  const { set, where } = onlyUpdate(fake);
  assert.deepEqual(Object.keys(set).sort(), ["healthy", "updatedAt"]);
  assert.equal(set["healthy"], false);
  assert.equal(isSqlNow(set["updatedAt"]), true);
  assert.deepEqual(where, [{ column: "id", value: "jrc_a" }]);
  assert.equal((await store.get("org_1", "jrc_a"))?.healthy, false);
});

test("[happy-20] markUnhealthy leaves other connections healthy", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", cloudId: "c-1" }),
    row({ id: "jrc_b", cloudId: "c-2" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.markUnhealthy("jrc_a");

  assert.equal((await store.get("org_1", "jrc_a"))?.healthy, false);
  assert.equal((await store.get("org_1", "jrc_b"))?.healthy, true);
});

test("[boundary-10] flagging twice, or flagging an unknown id, resolves", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.markUnhealthy("jrc_a"), undefined);
  assert.equal(await store.markUnhealthy("jrc_a"), undefined);
  assert.equal(await store.markUnhealthy("jrc_gone"), undefined);
});

test("[boundary-10] flagging twice leaves the connection unhealthy, one update per call", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.markUnhealthy("jrc_a");
  await store.markUnhealthy("jrc_a");
  await store.markUnhealthy("jrc_gone");

  assert.equal(fake.rows[0]?.healthy, false);
  assert.deepEqual(
    fake.updates.map((call) => call.where),
    [
      [{ column: "id", value: "jrc_a" }],
      [{ column: "id", value: "jrc_a" }],
      [{ column: "id", value: "jrc_gone" }],
    ],
  );
});

test("[concurrency-2] a refresh then a failure flag, overlapping, end with the last update", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", healthy: true })]);
  const store = createJiraConnectionStore(fake.db, k1());

  const refresh = store.saveTokens("jrc_a", {
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: null,
    scopes: [],
  });
  const flag = store.markUnhealthy("jrc_a");
  await Promise.all([refresh, flag]);

  assert.equal(fake.updates.length, 2);
  const last = fake.updates[fake.updates.length - 1];
  assert.equal(fake.rows[0]?.healthy, last?.set["healthy"]);
});

test("[concurrency-2] a failure flag then a refresh, overlapping, end with the last update", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", healthy: true })]);
  const store = createJiraConnectionStore(fake.db, k1());

  const flag = store.markUnhealthy("jrc_a");
  const refresh = store.saveTokens("jrc_a", {
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: null,
    scopes: [],
  });
  await Promise.all([flag, refresh]);

  assert.equal(fake.updates.length, 2);
  const last = fake.updates[fake.updates.length - 1];
  assert.equal(fake.rows[0]?.healthy, last?.set["healthy"]);
});

// ---- remove ----------------------------------------------------------------

test("[happy-21] removing an existing connection", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", organizationId: "org_1" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.remove("org_1", "jrc_a"), true);
  assert.equal(await store.get("org_1", "jrc_a"), null);
});

test("[happy-21] removing one connection keeps the others", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", cloudId: "c-1" }),
    row({ id: "jrc_b", cloudId: "c-2" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.remove("org_1", "jrc_a"), true);
  assert.deepEqual(
    fake.rows.map((candidate) => candidate.id),
    ["jrc_b"],
  );
});

test("[unhappy-15] removing another organization's connection removes nothing", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", organizationId: "org_1" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.remove("org_2", "jrc_a"), false);
  assert.deepEqual(
    fake.rows.map((candidate) => candidate.id),
    ["jrc_a"],
  );
});

test("[unhappy-15] removing a missing id removes nothing", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", organizationId: "org_1" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.remove("org_1", "jrc_nope"), false);
  assert.deepEqual(
    fake.rows.map((candidate) => candidate.id),
    ["jrc_a"],
  );
});

test("[boundary-11] removing twice reports true then false", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", organizationId: "org_1" })]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.remove("org_1", "jrc_a"), true);
  assert.equal(await store.remove("org_1", "jrc_a"), false);
});

test("[boundary-11] removing twice leaves another organization's connection in place", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1" }),
    row({ id: "jrc_z", organizationId: "org_2" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.remove("org_1", "jrc_a");
  await store.remove("org_1", "jrc_a");

  assert.deepEqual(
    fake.rows.map((candidate) => candidate.id),
    ["jrc_z"],
  );
});
