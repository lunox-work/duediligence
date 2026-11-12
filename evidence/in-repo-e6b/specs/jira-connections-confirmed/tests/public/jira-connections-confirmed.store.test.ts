/**
 * `JiraConnectionStore` against an in-memory stand-in for Drizzle, in the
 * style of `fake-organization-db.ts`.
 *
 * The fake answers only the query shapes the spec lists, over a list of
 * `JiraConnectionRow`, and records every call so the assertions can be about
 * what the store asked for (filters, order, values, conflict target) as well
 * as what it returned. The cipher is built from a fixed key.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { desc } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { createTokenCipher, TokenCipherError } from "../src/cipher.js";
import type { TokenCipher } from "../src/cipher.js";
import { createJiraConnectionStore } from "../src/jira-connections.js";
import type {
  JiraConnectionInput,
  JiraConnectionStore,
} from "../src/jira-connections.js";
import { jiraConnection } from "../src/schema/jira.js";
import type { JiraConnectionRow } from "../src/schema/jira.js";
import type { Database } from "../src/store.js";

const K1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const K2 = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";
const K1_ID = "0ebcb5deb52c";

const ID_PATTERN =
  /^jrc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the fake stamps on a row it inserts, as Postgres' `now()` would. */
const INSERTED_AT = new Date("2026-11-04T10:00:00.000Z");

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

// ---- the fake ----------------------------------------------------------------

interface Condition {
  readonly column: string;
  readonly value: unknown;
}

/** snake_case column name to `JiraConnectionRow` property. */
const propertyOf = new Map(
  Object.entries(getTableColumns(jiraConnection)).map(
    ([property, col]) => [col.name, property] as const,
  ),
);

/** Recovers `(column, value)` pairs from a Drizzle `eq`/`and` where clause. */
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
    // A literal fragment, such as the operator.
    if (Array.isArray(record["value"])) {
      continue;
    }
    if ("value" in record && column !== undefined) {
      out.push({ column, value: record["value"] });
      column = undefined;
    }
  }
}

function matches(row: JiraConnectionRow, where: unknown): boolean {
  return conditions(where).every((condition) => {
    const property = propertyOf.get(condition.column) ?? condition.column;
    return (row as Record<string, unknown>)[property] === condition.value;
  });
}

const dialect = new PgDialect();

/** An SQL fragment as Postgres would see it, for comparing shapes. */
function render(value: unknown): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(value as Parameters<PgDialect["sqlToQuery"]>[0]);
  return { sql: query.sql, params: query.params };
}

type Values = Record<string, unknown>;

interface InsertCall {
  readonly values: Values;
  readonly target: unknown;
  readonly set: Values;
}

interface UpdateCall {
  readonly set: Values;
  readonly where: unknown;
}

interface FakeJiraDb {
  readonly db: Database;
  readonly rows: JiraConnectionRow[];
  readonly selects: Array<{ where: unknown; orderBy: unknown[] | undefined }>;
  readonly inserts: InsertCall[];
  /** The insert values in the order the fake applied them. */
  readonly appliedInserts: Values[];
  readonly updates: UpdateCall[];
  readonly deletes: Array<{ where: unknown }>;
}

interface FakeOptions {
  /** `"honour"` sorts by the orderBy it is given; `"ignore"` keeps seed order. */
  readonly orderBy?: "honour" | "ignore";
  /** Makes `insert … returning()` resolve to `[]`. */
  readonly insertReturnsNothing?: boolean;
}

function thenable<T>(
  run: () => T,
): PromiseLike<T> & Record<string, unknown> {
  return {
    then: <A, B>(
      onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
      onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ) => new Promise<T>((resolve) => resolve(run())).then(onFulfilled, onRejected),
  };
}

function createFakeJiraDb(
  seed: JiraConnectionRow[] = [],
  options: FakeOptions = {},
): FakeJiraDb {
  const rows = seed.map((row) => ({ ...row }));
  const selects: FakeJiraDb["selects"] = [];
  const inserts: InsertCall[] = [];
  const appliedInserts: Values[] = [];
  const updates: UpdateCall[] = [];
  const deletes: FakeJiraDb["deletes"] = [];

  function ordered(found: JiraConnectionRow[], orderBy: unknown[] | undefined) {
    if (orderBy === undefined || options.orderBy === "ignore") {
      return found;
    }
    for (const term of [...orderBy].reverse()) {
      const { sql } = render(term);
      const name = /"([a-z_]+)"\s*(asc|desc)?\s*$/i.exec(sql);
      const property = propertyOf.get(name?.[1] ?? "");
      if (property === undefined) {
        continue;
      }
      const direction = /desc\s*$/i.test(sql) ? -1 : 1;
      found = [...found].sort((a, b) => {
        const left = (a as Record<string, unknown>)[property] as Date;
        const right = (b as Record<string, unknown>)[property] as Date;
        return (left.getTime() - right.getTime()) * direction;
      });
    }
    return found;
  }

  function select() {
    const call: { where: unknown; orderBy: unknown[] | undefined } = {
      where: undefined,
      orderBy: undefined,
    };
    selects.push(call);
    let limit: number | undefined;
    const chain = thenable(() => {
      const found = ordered(
        rows.filter((row) => matches(row, call.where)),
        call.orderBy,
      ).map((row) => ({ ...row }));
      return limit === undefined ? found : found.slice(0, limit);
    });
    chain["from"] = () => chain;
    chain["where"] = (where: unknown) => {
      call.where = where;
      return chain;
    };
    chain["orderBy"] = (...terms: unknown[]) => {
      call.orderBy = terms;
      return chain;
    };
    chain["limit"] = (value: number) => {
      limit = value;
      return chain;
    };
    return chain;
  }

  function insert() {
    let values: Values = {};
    const chain: Record<string, unknown> = {
      values: (value: Values) => {
        values = value;
        return chain;
      },
      onConflictDoUpdate: (config: { target: unknown; set: Values }) => {
        const call: InsertCall = { values, target: config.target, set: config.set };
        inserts.push(call);
        return {
          returning: () =>
            thenable(() => {
              appliedInserts.push(call.values);
              const existing = rows.find(
                (row) =>
                  row.organizationId === call.values["organizationId"] &&
                  row.cloudId === call.values["cloudId"],
              );
              let result: JiraConnectionRow;
              if (existing !== undefined) {
                Object.assign(existing, call.set);
                result = { ...existing };
              } else {
                const created = {
                  kind: "oauth",
                  email: null,
                  accessTokenEnc: null,
                  refreshTokenEnc: null,
                  keyId: null,
                  expiresAt: null,
                  scopes: "",
                  healthy: true,
                  createdAt: INSERTED_AT,
                  updatedAt: INSERTED_AT,
                  ...call.values,
                } as JiraConnectionRow;
                rows.push(created);
                result = { ...created };
              }
              return options.insertReturnsNothing === true ? [] : [result];
            }),
        };
      },
    };
    return chain;
  }

  function update() {
    let set: Values = {};
    const chain: Record<string, unknown> = {
      set: (value: Values) => {
        set = value;
        return chain;
      },
      // Applied when `where` is called, so overlapping updates land in the
      // order their `where` ran.
      where: (where: unknown) => {
        updates.push({ set, where });
        for (const row of rows) {
          if (matches(row, where)) {
            Object.assign(row, set);
          }
        }
        const done = thenable(() => [] as unknown[]);
        done["returning"] = () => thenable(() => [] as unknown[]);
        return done;
      },
    };
    return chain;
  }

  function remove() {
    return {
      where: (where: unknown) => {
        const call = { where };
        deletes.push(call);
        let removed: JiraConnectionRow[] | undefined;
        const run = () => {
          if (removed === undefined) {
            removed = rows.filter((row) => matches(row, where));
            for (const row of removed) {
              rows.splice(rows.indexOf(row), 1);
            }
          }
          return removed.map((row) => ({ ...row }));
        };
        const done = thenable(run);
        done["returning"] = () => thenable(run);
        return done;
      },
    };
  }

  const db = { select, insert, update, delete: remove };
  return {
    db: db as unknown as Database,
    rows,
    selects,
    inserts,
    appliedInserts,
    updates,
    deletes,
  };
}

// ---- fixtures ----------------------------------------------------------------

function row(overrides: Partial<JiraConnectionRow> = {}): JiraConnectionRow {
  return {
    id: "jrc_a",
    organizationId: "org_1",
    cloudId: "c-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme",
    kind: "oauth",
    accessTokenEnc: null,
    refreshTokenEnc: null,
    keyId: null,
    expiresAt: null,
    scopes: "",
    email: null,
    healthy: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function input(overrides: Partial<JiraConnectionInput> = {}): JiraConnectionInput {
  return {
    cloudId: "c-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme",
    email: "ada@acme.test",
    accessToken: "AT-1",
    refreshToken: "RT-1",
    expiresAt: "2026-11-04T12:00:00.000Z",
    scopes: ["read:jira-work", "offline_access"],
    ...overrides,
  };
}

function setup(
  seed: JiraConnectionRow[] = [],
  options: FakeOptions = {},
): { fake: FakeJiraDb; cipher: TokenCipher; store: JiraConnectionStore } {
  const fake = createFakeJiraDb(seed, options);
  const cipher = createTokenCipher(K1);
  return { fake, cipher, store: createJiraConnectionStore(fake.db, cipher) };
}

/** A cipher that records calls and refuses to decrypt. */
function countingCipher(): TokenCipher & { decrypts: number } {
  const real = createTokenCipher(K1);
  const cipher = {
    keyId: real.keyId,
    decrypts: 0,
    encrypt: (plaintext: string | null) => real.encrypt(plaintext),
    decrypt: (_ciphertext: string | null): string | null => {
      cipher.decrypts += 1;
      throw new Error("decrypt must not be called");
    },
  };
  return cipher;
}

function onlyInsert(fake: FakeJiraDb): InsertCall {
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

// ---- upsert --------------------------------------------------------------------

test("[happy-14] a new connection is inserted with encrypted tokens", async () => {
  const { fake, cipher, store } = setup();
  const result = await store.upsert("org_1", input());

  const { values, target } = onlyInsert(fake);
  assert.match(String(values["id"]), ID_PATTERN);
  assert.equal(values["organizationId"], "org_1");
  assert.equal(values["cloudId"], "c-1");
  assert.equal(values["keyId"], K1_ID);
  assert.equal(values["healthy"], true);
  assert.equal(values["scopes"], "read:jira-work offline_access");
  assert.ok(values["updatedAt"] instanceof Date);
  assert.deepEqual(values["expiresAt"], new Date("2026-11-04T12:00:00.000Z"));

  assert.notEqual(values["accessTokenEnc"], "AT-1");
  assert.equal(cipher.decrypt(values["accessTokenEnc"] as string), "AT-1");
  assert.notEqual(values["refreshTokenEnc"], "RT-1");
  assert.equal(cipher.decrypt(values["refreshTokenEnc"] as string), "RT-1");

  assert.ok(Array.isArray(target));
  assert.equal(target.length, 2);
  assert.equal(target[0], jiraConnection.organizationId);
  assert.equal(target[1], jiraConnection.cloudId);

  assert.deepEqual(result, {
    id: values["id"],
    cloudId: "c-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme",
    email: "ada@acme.test",
    healthy: true,
    scopes: ["read:jira-work", "offline_access"],
    createdAt: INSERTED_AT.toISOString(),
  });
  assert.deepEqual(Object.keys(result).sort(), SUMMARY_KEYS);
});

test("[happy-14] the insert values carry exactly the documented properties", async () => {
  const { fake, store } = setup();
  await store.upsert("org_1", input());

  const { values } = onlyInsert(fake);
  assert.deepEqual(Object.keys(values).sort(), [
    "accessTokenEnc",
    "cloudId",
    "email",
    "expiresAt",
    "healthy",
    "id",
    "keyId",
    "organizationId",
    "refreshTokenEnc",
    "scopes",
    "siteName",
    "siteUrl",
    "updatedAt",
  ]);
  assert.equal("createdAt" in values, false);
  assert.equal("kind" in values, false);
});

test("[happy-15] reconnecting the same site updates the existing row", async () => {
  const { fake, store } = setup([
    row({ id: "jrc_a", organizationId: "org_1", cloudId: "c-1", healthy: false, email: "old@acme.test" }),
  ]);
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

  const { set } = onlyInsert(fake);
  assert.equal("id" in set, false);
  assert.equal("createdAt" in set, false);
  assert.equal(set["organizationId"], "org_1");
  assert.equal(set["cloudId"], "c-1");
  assert.ok(set["updatedAt"] instanceof Date);
  assert.equal(set["keyId"], K1_ID);
  assert.equal(set["healthy"], true);
  assert.equal(fake.rows.length, 1);
});

test("[happy-15] the conflict set is the insert values without id", async () => {
  const { fake, cipher, store } = setup([row()]);
  await store.upsert("org_1", input({ accessToken: "AT-2" }));

  const { values, set } = onlyInsert(fake);
  const { id: _id, ...rest } = values;
  assert.deepEqual(Object.keys(set).sort(), Object.keys(rest).sort());
  for (const [key, value] of Object.entries(rest)) {
    assert.deepEqual(set[key], value, `conflict set ${key} differs`);
  }
  assert.equal("kind" in set, false);
  assert.equal(cipher.decrypt(set["accessTokenEnc"] as string), "AT-2");
});

const storedFields: Array<[string, Partial<JiraConnectionInput> & { omitEmail?: true }, (values: Values, cipher: TokenCipher) => void]> = [
  ["email omitted", { omitEmail: true }, (v) => assert.equal(v["email"], null)],
  ["email: undefined", { email: undefined }, (v) => assert.equal(v["email"], null)],
  ["email: null", { email: null }, (v) => assert.equal(v["email"], null)],
  ["email kept as given", { email: "Ada@ACME.test" }, (v) => assert.equal(v["email"], "Ada@ACME.test")],
  [
    "null tokens",
    { accessToken: null, refreshToken: null },
    (v) => {
      assert.equal(v["accessTokenEnc"], null);
      assert.equal(v["refreshTokenEnc"], null);
    },
  ],
  [
    "empty access token",
    { accessToken: "" },
    (v, cipher) => {
      assert.equal(typeof v["accessTokenEnc"], "string");
      assert.notEqual(v["accessTokenEnc"], "");
      assert.equal(cipher.decrypt(v["accessTokenEnc"] as string), "");
    },
  ],
  ["expiresAt: null", { expiresAt: null }, (v) => assert.equal(v["expiresAt"], null)],
  [
    "expiresAt with an offset",
    { expiresAt: "2026-11-04T12:00+01:00" },
    (v) => assert.deepEqual(v["expiresAt"], new Date("2026-11-04T11:00:00.000Z")),
  ],
  [
    "expiresAt with microseconds",
    { expiresAt: "2026-11-04T12:00:00.123456Z" },
    (v) => assert.deepEqual(v["expiresAt"], new Date("2026-11-04T12:00:00.123Z")),
  ],
  [
    "expiresAt not a date",
    { expiresAt: "soon" },
    (v) => {
      assert.ok(v["expiresAt"] instanceof Date);
      assert.ok(Number.isNaN(v["expiresAt"].getTime()));
    },
  ],
  ["scopes with duplicates", { scopes: ["b", "a", "b"] }, (v) => assert.equal(v["scopes"], "b a b")],
  ["no scopes", { scopes: [] }, (v) => assert.equal(v["scopes"], "")],
  ["siteName with spaces", { siteName: " Acme " }, (v) => assert.equal(v["siteName"], " Acme ")],
  ["empty cloudId", { cloudId: "" }, (v) => assert.equal(v["cloudId"], "")],
  ["siteName a tab", { siteName: "\t" }, (v) => assert.equal(v["siteName"], "\t")],
];

for (const [why, overrides, check] of storedFields) {
  test(`[boundary-6] optional, nullable and unchecked fields: ${why}`, async () => {
    const { fake, cipher, store } = setup();
    const { omitEmail, ...fields } = overrides;
    const given: Record<string, unknown> = { ...input(), ...fields };
    if (omitEmail === true) {
      delete given["email"];
    }
    await store.upsert("org_1", given as unknown as JiraConnectionInput);
    check(onlyInsert(fake).values, cipher);
  });
}

test("[unhappy-9] the insert returns no row", async () => {
  const { store } = setup([], { insertReturnsNothing: true });
  await assert.rejects(store.upsert("org_1", input()), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Failed to record the Jira connection.");
    return true;
  });
});

test("[unhappy-9] no row back is not followed by a select", async () => {
  const { fake, store } = setup([row()], { insertReturnsNothing: true });
  await assert.rejects(store.upsert("org_1", input()), {
    message: "Failed to record the Jira connection.",
  });
  assert.equal(fake.inserts.length, 1);
  assert.equal(fake.selects.length, 0);
});

test("[concurrency-1] two overlapping upserts of the same site leave one connection", async () => {
  const { fake, store } = setup();
  const [a, b] = await Promise.all([
    store.upsert("org_1", input({ cloudId: "c-1", siteName: "A" })),
    store.upsert("org_1", input({ cloudId: "c-1", siteName: "B" })),
  ]);

  assert.equal(a.id, b.id);
  const held = fake.rows.filter(
    (candidate) => candidate.organizationId === "org_1" && candidate.cloudId === "c-1",
  );
  assert.equal(held.length, 1);
  assert.equal(held[0]?.siteName, fake.appliedInserts.at(-1)?.["siteName"]);
  assert.equal(fake.inserts.length, 2);
  assert.equal(fake.selects.length, 0);
});

test("[concurrency-1] overlapping upserts of different sites leave two connections", async () => {
  const { fake, store } = setup();
  const [a, b] = await Promise.all([
    store.upsert("org_1", input({ cloudId: "c-1" })),
    store.upsert("org_1", input({ cloudId: "c-2" })),
  ]);
  assert.notEqual(a.id, b.id);
  assert.equal(fake.rows.length, 2);
  assert.equal(fake.selects.length, 0);
});

test("[happy-16] the same site in two organizations is two connections", async () => {
  const { fake, store } = setup();
  const first = await store.upsert("org_1", input({ cloudId: "c-1" }));
  const second = await store.upsert("org_2", input({ cloudId: "c-1" }));
  assert.notEqual(first.id, second.id);
  assert.equal(fake.rows.length, 2);
});

test("[happy-16] each organization's upsert carries its own organization id", async () => {
  const { fake, store } = setup();
  await store.upsert("org_1", input({ cloudId: "c-1" }));
  await store.upsert("org_2", input({ cloudId: "c-1" }));
  assert.deepEqual(
    fake.inserts.map((call) => call.values["organizationId"]),
    ["org_1", "org_2"],
  );
  assert.notEqual(fake.inserts[0]?.values["id"], fake.inserts[1]?.values["id"]);
});

// ---- list and get ------------------------------------------------------------

function threeRows(): JiraConnectionRow[] {
  return [
    row({ id: "jrc_a", cloudId: "c-a", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    row({ id: "jrc_b", cloudId: "c-b", createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    row({ id: "jrc_c", cloudId: "c-c", createdAt: new Date("2026-03-01T00:00:00.000Z") }),
    row({ id: "jrc_z", organizationId: "org_2", createdAt: new Date("2026-04-01T00:00:00.000Z") }),
  ];
}

test("[happy-17] list asks for newest first and keeps the order it gets", async () => {
  const { fake, store } = setup(threeRows(), { orderBy: "honour" });
  const result = await store.list("org_1");

  assert.equal(fake.selects.length, 1);
  const { orderBy, where } = fake.selects[0] ?? {};
  assert.equal(orderBy?.length, 1);
  assert.deepEqual(render(orderBy?.[0]), render(desc(jiraConnection.createdAt)));
  assert.deepEqual(conditions(where), [{ column: "organization_id", value: "org_1" }]);

  assert.deepEqual(
    result.map((summary) => summary.id),
    ["jrc_c", "jrc_b", "jrc_a"],
  );
  for (const summary of result) {
    assert.deepEqual(Object.keys(summary).sort(), SUMMARY_KEYS);
  }
});

test("[happy-17] list maps each row to its summary", async () => {
  const { store } = setup(
    [
      row({
        id: "jrc_a",
        email: "ada@acme.test",
        healthy: false,
        scopes: "read:jira-work offline_access",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ],
    { orderBy: "honour" },
  );
  assert.deepEqual(await store.list("org_1"), [
    {
      id: "jrc_a",
      cloudId: "c-1",
      siteUrl: "https://acme.atlassian.net",
      siteName: "Acme",
      email: "ada@acme.test",
      healthy: false,
      scopes: ["read:jira-work", "offline_access"],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
});

test("[boundary-7] list does not re-sort", async () => {
  const [a, b, c, z] = threeRows();
  assert.ok(a && b && c && z);
  const { store } = setup([b, a, c, z], { orderBy: "ignore" });
  const result = await store.list("org_1");
  assert.deepEqual(
    result.map((summary) => summary.id),
    ["jrc_b", "jrc_a", "jrc_c"],
  );
});

test("[boundary-7] list keeps oldest-first order when that is what it gets", async () => {
  const { store } = setup(threeRows(), { orderBy: "ignore" });
  const result = await store.list("org_1");
  assert.deepEqual(
    result.map((summary) => summary.id),
    ["jrc_a", "jrc_b", "jrc_c"],
  );
});

test("[boundary-8] an organization with no connections", async () => {
  const { store } = setup();
  assert.deepEqual(await store.list("org_empty"), []);
});

test("[boundary-8] another organization's connections are not listed", async () => {
  const { store } = setup(threeRows(), { orderBy: "honour" });
  assert.deepEqual(await store.list("org_empty"), []);
});

test("[happy-18] summaries do not need the key", async () => {
  const { store } = setup([row({ id: "jrc_a", accessTokenEnc: "not-a-ciphertext" })]);
  const listed = await store.list("org_1");
  const got = await store.get("org_1", "jrc_a");
  assert.equal(listed.length, 1);
  assert.equal(got?.id, "jrc_a");
});

test("[happy-18] list and get never call decrypt", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessTokenEnc: "not-a-ciphertext",
      refreshTokenEnc: "also-not-one",
      keyId: "old",
    }),
  ]);
  const cipher = countingCipher();
  const store = createJiraConnectionStore(fake.db, cipher);
  const listed = await store.list("org_1");
  const got = await store.get("org_1", "jrc_a");
  assert.equal(cipher.decrypts, 0);
  for (const summary of [...listed, got]) {
    assert.ok(summary);
    assert.deepEqual(Object.keys(summary).sort(), SUMMARY_KEYS);
  }
});

test("[happy-19] get returns one summary", async () => {
  const { store } = setup([
    row({
      id: "jrc_a",
      organizationId: "org_1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      healthy: false,
      email: null,
      scopes: "read:jira-work write:jira-work",
    }),
  ]);
  const result = await store.get("org_1", "jrc_a");
  assert.deepEqual(result, {
    id: "jrc_a",
    cloudId: "c-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme",
    email: null,
    healthy: false,
    scopes: ["read:jira-work", "write:jira-work"],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
});

test("[happy-19] get filters by organization and id in one select", async () => {
  const { fake, store } = setup([
    row({ id: "jrc_a" }),
    row({ id: "jrc_b", cloudId: "c-2" }),
  ]);
  const result = await store.get("org_1", "jrc_b");
  assert.equal(result?.id, "jrc_b");
  assert.equal(fake.selects.length, 1);
  assert.deepEqual(
    [...conditions(fake.selects[0]?.where)].sort((a, b) => a.column.localeCompare(b.column)),
    [
      { column: "id", value: "jrc_b" },
      { column: "organization_id", value: "org_1" },
    ],
  );
});

const getMisses: Array<[string, string]> = [
  ["org_2", "jrc_a"],
  ["org_1", "jrc_nope"],
  ["org_1", ""],
];

for (const [organizationId, connectionId] of getMisses) {
  test(`[unhappy-10] get misses return null: (${JSON.stringify(organizationId)}, ${JSON.stringify(connectionId)})`, async () => {
    const { store } = setup([row({ id: "jrc_a", organizationId: "org_1" })]);
    assert.equal(await store.get(organizationId, connectionId), null);
  });
}

// ---- tokens --------------------------------------------------------------------

test("[happy-20] tokens returns the decrypted pair", async () => {
  const cipher = createTokenCipher(K1);
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      organizationId: "org_1",
      accessTokenEnc: cipher.encrypt("AT-1"),
      refreshTokenEnc: cipher.encrypt("RT-1"),
      keyId: K1_ID,
      expiresAt: new Date("2026-11-04T12:00:00.000Z"),
      scopes: "read:jira-work",
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, cipher);
  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: "AT-1",
    refreshToken: "RT-1",
    expiresAt: "2026-11-04T12:00:00.000Z",
    scopes: ["read:jira-work"],
  });
});

test("[happy-20] tokens decrypts with a cipher of the same key whatever key id wrote them", async () => {
  const writer = createTokenCipher(K1, { keyId: "old" });
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessTokenEnc: writer.encrypt("AT-1"),
      refreshTokenEnc: writer.encrypt("RT-1"),
      keyId: "old",
      scopes: "read:jira-work offline_access",
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, createTokenCipher(K1));
  const result = await store.tokens("org_1", "jrc_a");
  assert.equal(result?.accessToken, "AT-1");
  assert.equal(result?.refreshToken, "RT-1");
  assert.deepEqual(result?.scopes, ["read:jira-work", "offline_access"]);
  assert.equal(fake.updates.length, 0);
});

test("[boundary-9] absent tokens and expiry stay null", async () => {
  const { store } = setup([
    row({
      id: "jrc_a",
      accessTokenEnc: null,
      refreshTokenEnc: null,
      expiresAt: null,
      scopes: "",
    }),
  ]);
  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scopes: [],
  });
});

test("[boundary-9] a missing refresh token alone stays null", async () => {
  const cipher = createTokenCipher(K1);
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", accessTokenEnc: cipher.encrypt(""), refreshTokenEnc: null }),
  ]);
  const store = createJiraConnectionStore(fake.db, cipher);
  const result = await store.tokens("org_1", "jrc_a");
  assert.equal(result?.accessToken, "");
  assert.equal(result?.refreshToken, null);
});

test("[unhappy-11] tokens for another organization's connection is null", async () => {
  const cipher = createTokenCipher(K1);
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      organizationId: "org_1",
      accessTokenEnc: cipher.encrypt("AT-1"),
      refreshTokenEnc: cipher.encrypt("RT-1"),
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, cipher);
  assert.equal(await store.tokens("org_2", "jrc_a"), null);
});

test("[unhappy-11] tokens for a missing connection is null", async () => {
  const { store } = setup([row({ id: "jrc_a" })]);
  assert.equal(await store.tokens("org_1", "jrc_nope"), null);
});

test("[unhappy-12] tokens written under another key propagate the cipher error and write nothing", async () => {
  const { fake, store } = setup([
    row({
      id: "jrc_a",
      organizationId: "org_1",
      accessTokenEnc: createTokenCipher(K2).encrypt("AT-1"),
    }),
  ]);
  await assert.rejects(store.tokens("org_1", "jrc_a"), (error: unknown) => {
    assert.ok(error instanceof TokenCipherError);
    assert.equal(
      error.message,
      "Encrypted token could not be authenticated; the key may have changed.",
    );
    return true;
  });
  assert.equal(fake.updates.length, 0);
  assert.equal(fake.rows[0]?.healthy, true);
});

test("[unhappy-12] an unrecognised stored refresh token propagates too", async () => {
  const cipher = createTokenCipher(K1);
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessTokenEnc: cipher.encrypt("AT-1"),
      refreshTokenEnc: "plaintext-token",
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, cipher);
  await assert.rejects(store.tokens("org_1", "jrc_a"), (error: unknown) => {
    assert.ok(error instanceof TokenCipherError);
    assert.equal(error.message, "Unrecognised token encoding; expected v1.");
    return true;
  });
  assert.equal(fake.updates.length, 0);
});

// ---- saveTokens ----------------------------------------------------------------

test("[happy-21] a refreshed pair is stored encrypted", async () => {
  const { fake, cipher, store } = setup([row({ id: "jrc_a", healthy: false })]);
  const result = await store.saveTokens("jrc_a", {
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: "2026-11-04T13:00:00.000Z",
    scopes: ["read:jira-work"],
  });
  assert.equal(result, undefined);

  const { set, where } = onlyUpdate(fake);
  assert.deepEqual(Object.keys(set).sort(), [
    "accessTokenEnc",
    "expiresAt",
    "healthy",
    "keyId",
    "refreshTokenEnc",
    "scopes",
    "updatedAt",
  ]);
  assert.equal(cipher.decrypt(set["accessTokenEnc"] as string), "AT-2");
  assert.equal(cipher.decrypt(set["refreshTokenEnc"] as string), "RT-2");
  assert.equal(set["keyId"], K1_ID);
  assert.equal(set["scopes"], "read:jira-work");
  assert.deepEqual(set["expiresAt"], new Date("2026-11-04T13:00:00.000Z"));
  assert.equal(set["healthy"], true);
  assert.ok(set["updatedAt"] instanceof Date);
  assert.deepEqual(conditions(where), [{ column: "id", value: "jrc_a" }]);
  assert.equal(fake.rows[0]?.healthy, true);
});

test("[happy-21] saveTokens records the writing cipher's explicit key id", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a", keyId: "old" })]);
  const cipher = createTokenCipher(K1, { keyId: "2026-11_a" });
  const store = createJiraConnectionStore(fake.db, cipher);
  await store.saveTokens("jrc_a", {
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: null,
    scopes: ["b", "a", "b"],
  });
  const { set } = onlyUpdate(fake);
  assert.equal(set["keyId"], "2026-11_a");
  assert.equal(set["scopes"], "b a b");
  assert.equal(fake.selects.length, 0);
});

test("[boundary-10] a grant without offline_access saves a null refresh token", async () => {
  const { fake, cipher, store } = setup([row({ id: "jrc_a" })]);
  await store.saveTokens("jrc_a", {
    accessToken: "AT-2",
    refreshToken: null,
    expiresAt: null,
    scopes: [],
  });
  const { set } = onlyUpdate(fake);
  assert.equal(set["refreshTokenEnc"], null);
  assert.equal(set["expiresAt"], null);
  assert.equal(set["scopes"], "");
  assert.equal(cipher.decrypt(set["accessTokenEnc"] as string), "AT-2");
});

test("[boundary-11] an unknown connection id is a no-op", async () => {
  const { fake, store } = setup();
  const result = await store.saveTokens("jrc_gone", {
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: null,
    scopes: [],
  });
  assert.equal(result, undefined);
  assert.equal(fake.updates.length, 1);
  assert.equal(fake.rows.length, 0);
});

test("[boundary-11] an unknown connection id leaves other rows alone", async () => {
  const { fake, store } = setup([row({ id: "jrc_a", healthy: false, accessTokenEnc: null })]);
  await store.saveTokens("jrc_gone", {
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: null,
    scopes: [],
  });
  assert.equal(fake.updates.length, 1);
  assert.equal(fake.rows[0]?.healthy, false);
  assert.equal(fake.rows[0]?.accessTokenEnc, null);
});

test("[boundary-12] the expiry is not checked", async () => {
  const { fake, store } = setup([row({ id: "jrc_a" })]);
  const result = await store.saveTokens("jrc_a", {
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: "3600",
    scopes: [],
  });
  assert.equal(result, undefined);
  assert.deepEqual(
    onlyUpdate(fake).set["expiresAt"],
    new Date("3600-01-01T00:00:00.000Z"),
  );
});

test("[boundary-12] an unparseable expiry is stored as an invalid Date", async () => {
  const { fake, store } = setup([row({ id: "jrc_a" })]);
  await store.saveTokens("jrc_a", {
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: "soon",
    scopes: [],
  });
  const expiresAt = onlyUpdate(fake).set["expiresAt"];
  assert.ok(expiresAt instanceof Date);
  assert.ok(Number.isNaN(expiresAt.getTime()));
});

// ---- markUnhealthy -------------------------------------------------------------

test("[happy-22] flagging a connection", async () => {
  const { fake, store } = setup([row({ id: "jrc_a", organizationId: "org_1", healthy: true })]);
  const result = await store.markUnhealthy("jrc_a");
  assert.equal(result, undefined);

  const { set, where } = onlyUpdate(fake);
  assert.deepEqual(Object.keys(set).sort(), ["healthy", "updatedAt"]);
  assert.equal(set["healthy"], false);
  assert.ok(set["updatedAt"] instanceof Date);
  assert.deepEqual(conditions(where), [{ column: "id", value: "jrc_a" }]);

  assert.equal((await store.get("org_1", "jrc_a"))?.healthy, false);
});

test("[happy-22] flagging a connection leaves its tokens alone", async () => {
  const cipher = createTokenCipher(K1);
  const accessTokenEnc = cipher.encrypt("AT-1");
  const fake = createFakeJiraDb([row({ id: "jrc_a", accessTokenEnc })]);
  const store = createJiraConnectionStore(fake.db, cipher);
  await store.markUnhealthy("jrc_a");
  assert.equal(fake.rows[0]?.accessTokenEnc, accessTokenEnc);
  assert.equal((await store.tokens("org_1", "jrc_a"))?.accessToken, "AT-1");
});

test("[boundary-13] flagging twice, or flagging an unknown id", async () => {
  const { fake, store } = setup([row({ id: "jrc_a" })]);
  const results = [
    await store.markUnhealthy("jrc_a"),
    await store.markUnhealthy("jrc_a"),
    await store.markUnhealthy("jrc_gone"),
  ];
  assert.deepEqual(results, [undefined, undefined, undefined]);
  assert.equal(fake.updates.length, 3);
  assert.equal(fake.rows[0]?.healthy, false);
});

test("[boundary-13] flagging an unknown id in an empty table resolves", async () => {
  const { fake, store } = setup();
  assert.equal(await store.markUnhealthy("jrc_gone"), undefined);
  assert.deepEqual(conditions(fake.updates[0]?.where), [{ column: "id", value: "jrc_gone" }]);
});

test("[concurrency-2] a refresh and a failure flag overlap: last applied wins", async () => {
  const { fake, store } = setup([row({ id: "jrc_a", healthy: true })]);
  await Promise.all([
    store.saveTokens("jrc_a", {
      accessToken: "AT-2",
      refreshToken: "RT-2",
      expiresAt: null,
      scopes: [],
    }),
    store.markUnhealthy("jrc_a"),
  ]);
  assert.equal(fake.updates.length, 2);
  assert.equal(fake.rows[0]?.healthy, fake.updates.at(-1)?.set["healthy"]);
});

test("[concurrency-2] the flag then a refresh overlap: last applied wins", async () => {
  const { fake, store } = setup([row({ id: "jrc_a", healthy: true })]);
  await Promise.all([
    store.markUnhealthy("jrc_a"),
    store.saveTokens("jrc_a", {
      accessToken: "AT-2",
      refreshToken: "RT-2",
      expiresAt: null,
      scopes: [],
    }),
  ]);
  assert.equal(fake.updates.length, 2);
  assert.equal(fake.rows[0]?.healthy, fake.updates.at(-1)?.set["healthy"]);
});

// ---- remove ------------------------------------------------------------------

test("[happy-23] removing an existing connection", async () => {
  const { fake, store } = setup([row({ id: "jrc_a", organizationId: "org_1" })]);
  assert.equal(await store.remove("org_1", "jrc_a"), true);
  assert.equal(await store.get("org_1", "jrc_a"), null);
  assert.equal(fake.deletes.length, 1);
});

test("[happy-23] removing is scoped to organization and id", async () => {
  const { fake, store } = setup([
    row({ id: "jrc_a" }),
    row({ id: "jrc_b", cloudId: "c-2" }),
  ]);
  assert.equal(await store.remove("org_1", "jrc_a"), true);
  assert.deepEqual(
    fake.rows.map((candidate) => candidate.id),
    ["jrc_b"],
  );
  assert.deepEqual(
    [...conditions(fake.deletes[0]?.where)].sort((a, b) => a.column.localeCompare(b.column)),
    [
      { column: "id", value: "jrc_a" },
      { column: "organization_id", value: "org_1" },
    ],
  );
});

const removeMisses: Array<[string, string]> = [
  ["org_2", "jrc_a"],
  ["org_1", "jrc_nope"],
];

for (const [organizationId, connectionId] of removeMisses) {
  test(`[unhappy-13] removing nothing: (${JSON.stringify(organizationId)}, ${JSON.stringify(connectionId)})`, async () => {
    const { fake, store } = setup([row({ id: "jrc_a", organizationId: "org_1" })]);
    assert.equal(await store.remove(organizationId, connectionId), false);
    assert.deepEqual(
      fake.rows.map((candidate) => candidate.id),
      ["jrc_a"],
    );
  });
}

test("[boundary-14] removing twice", async () => {
  const { store } = setup([row({ id: "jrc_a", organizationId: "org_1" })]);
  assert.equal(await store.remove("org_1", "jrc_a"), true);
  assert.equal(await store.remove("org_1", "jrc_a"), false);
});
