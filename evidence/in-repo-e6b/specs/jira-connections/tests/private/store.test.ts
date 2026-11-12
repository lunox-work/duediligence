/**
 * Hidden suite for `JiraConnectionStore`, over an in-memory stand-in for
 * Drizzle that answers only the query shapes the spec lists.
 *
 * The fake records every call, refuses any table other than
 * `jiraConnection`, applies an insert's conflict set to the row with the same
 * (organizationId, cloudId), and applies an update when its `where()` is
 * called. It can hold inserts until the test releases them, so the order in
 * which overlapping upserts land is chosen by the test, and it can return a
 * chosen row from `returning()`. `sql\`now()\`` is written as a fixed date.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  createTokenCipher,
  TokenCipherError,
  type TokenCipher,
} from "../../src/cipher.js";
import {
  createJiraConnectionStore,
  type JiraConnectionInput,
  type JiraConnectionSummary,
} from "../../src/jira-connections.js";
import {
  jiraConnection,
  type JiraConnectionRow,
} from "../../src/schema/jira.js";
import type { Database } from "../../src/store.js";

/** Bytes 0..31; default key id "630dcd29". */
const K1 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
/** Bytes 32..63; default key id "72dbb733". */
const K2 = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";

function k1(): TokenCipher {
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

const SAVE_KEYS = [
  "accessToken",
  "expiresAt",
  "healthy",
  "refreshToken",
  "scopes",
  "updatedAt",
];

const ID_PATTERN =
  /^jrc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---- the fake --------------------------------------------------------------

interface Condition {
  readonly column: string;
  readonly value: unknown;
}

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

function lazy<T>(compute: () => T | Promise<T>) {
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

function checkTable(table: unknown): void {
  if (table !== jiraConnection) {
    throw new Error("fake: only jira_connection is modelled");
  }
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

interface SelectCall {
  readonly where: Condition[];
  readonly limit: number | undefined;
}

interface FakeOptions {
  readonly insertReturnsNothing?: boolean;
  /** Returned by every insert's `returning()` instead of the affected row. */
  readonly returningRows?: JiraConnectionRow[];
  /** Hold each insert's `returning()` until the test calls its `release`. */
  readonly holdInserts?: boolean;
}

interface FakeJiraDb {
  readonly db: Database;
  readonly rows: JiraConnectionRow[];
  readonly calls: string[];
  readonly inserts: InsertCall[];
  readonly applied: InsertCall[];
  readonly updates: UpdateCall[];
  readonly selects: SelectCall[];
  /** One release per insert awaiting `returning()`, in call order. */
  readonly held: Array<() => void>;
}

function createFakeJiraDb(
  seed: JiraConnectionRow[] = [],
  options: FakeOptions = {},
): FakeJiraDb {
  const rows = seed.map(copy);
  const calls: string[] = [];
  const inserts: InsertCall[] = [];
  const applied: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  const selects: SelectCall[] = [];
  const held: Array<() => void> = [];

  function select(...projection: unknown[]) {
    calls.push("select");
    assert.equal(projection.length, 0, "select() takes no projection");
    let where: unknown;
    let limit: number | undefined;
    const run = () => {
      const found = conditions(where);
      selects.push({ where: found, limit });
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
      from: (table: unknown) => {
        checkTable(table);
        return {
          where: (value: unknown) => {
            where = value;
            return afterWhere;
          },
        };
      },
    };
  }

  function insert(table: unknown) {
    checkTable(table);
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
          const apply = (): JiraConnectionRow[] => {
            applied.push(call);
            if (options.insertReturnsNothing === true) {
              return [];
            }
            const existing = rows.find(
              (row) =>
                row.organizationId === values["organizationId"] &&
                row.cloudId === values["cloudId"],
            );
            let affected: JiraConnectionRow;
            if (existing !== undefined) {
              applyPatch(existing, config.set);
              affected = existing;
            } else {
              affected = {
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
              rows.push(affected);
            }
            return options.returningRows !== undefined
              ? options.returningRows.map(copy)
              : [copy(affected)];
          };
          let gate: Promise<void> = Promise.resolve();
          if (options.holdInserts === true) {
            gate = new Promise<void>((resolve) => {
              held.push(resolve);
            });
          }
          return {
            returning: (..._args: unknown[]) =>
              lazy(() => gate.then(apply)),
          };
        },
      }),
    };
  }

  function update(table: unknown) {
    checkTable(table);
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

  function remove(table: unknown) {
    checkTable(table);
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
    selects,
    held,
  };
}

/** Yields to the event loop until `done()` holds (no timers, no clock). */
async function until(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < 200 && !done(); turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.ok(done(), "condition never held");
}

/** A cipher that counts calls and, optionally, refuses to decrypt. */
function spyCipher(
  inner: TokenCipher,
  options: { refuseDecrypt?: boolean } = {},
) {
  const counts = { encrypt: 0, decrypt: 0 };
  const cipher: TokenCipher = {
    get keyId() {
      return inner.keyId;
    },
    encrypt(plaintext: string | null) {
      counts.encrypt += 1;
      return inner.encrypt(plaintext);
    },
    decrypt(ciphertext: string | null) {
      counts.decrypt += 1;
      if (options.refuseDecrypt === true) {
        throw new Error("decrypt must not be called");
      }
      return inner.decrypt(ciphertext);
    },
  };
  return { cipher, counts };
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

function summaryOf(source: JiraConnectionRow): JiraConnectionSummary {
  return {
    id: source.id,
    cloudId: source.cloudId,
    siteUrl: source.siteUrl,
    siteName: source.siteName,
    email: source.email,
    healthy: source.healthy,
    scopes: source.scopes,
    createdAt: source.createdAt.toISOString(),
  };
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
    assert.equal(error.name, "TokenCipherError");
    assert.equal(error.message, message);
    return true;
  };
}

function expiryMessage(value: string): string {
  return `expiresAt must be an ISO 8601 timestamp with an offset, got "${value}".`;
}

// ---- [happy-12] A new connection -------------------------------------------

// Extends "[happy-12] a new connection is inserted with encrypted tokens":
// other values throughout, and a store cipher with its own key and key id.
test("[happy-12] a new connection writes every given field and encrypts with the store's cipher", async () => {
  const fake = createFakeJiraDb();
  const storeCipher = createTokenCipher(K2, { keyId: "store-key" });
  const store = createJiraConnectionStore(fake.db, storeCipher);

  const result = await store.upsert("org_9", {
    cloudId: "c-77",
    siteUrl: "https://globex.atlassian.net",
    siteName: "Globex",
    email: "hank@globex.test",
    accessToken: "AT-globex",
    refreshToken: "RT-globex",
    expiresAt: "2027-01-02T03:04:05.678Z",
    scopes: ["write:jira-work", "read:jira-work", "offline_access"],
  });

  assert.deepEqual(fake.calls, ["insert"]);
  const { values, target } = onlyInsert(fake);
  assert.match(String(values["id"]), ID_PATTERN);
  assert.equal(values["organizationId"], "org_9");
  assert.equal(values["cloudId"], "c-77");
  assert.equal(values["siteUrl"], "https://globex.atlassian.net");
  assert.equal(values["siteName"], "Globex");
  assert.equal(values["email"], "hank@globex.test");
  assert.equal(values["healthy"], true);
  assert.deepEqual(values["expiresAt"], new Date("2027-01-02T03:04:05.678Z"));
  assert.deepEqual(values["scopes"], [
    "write:jira-work",
    "read:jira-work",
    "offline_access",
  ]);

  const reader = createTokenCipher(K2, { keyId: "store-key" });
  for (const [key, plaintext] of [
    ["accessToken", "AT-globex"],
    ["refreshToken", "RT-globex"],
  ] as const) {
    const ciphertext = values[key] as string;
    assert.equal(typeof ciphertext, "string");
    assert.equal(ciphertext.includes(plaintext), false);
    assert.equal(ciphertext.split(":")[1], "store-key");
    assert.equal(reader.decrypt(ciphertext), plaintext);
  }

  assert.ok(Array.isArray(target));
  assert.deepEqual(target, [jiraConnection.organizationId, jiraConnection.cloudId]);

  assert.deepEqual(result, {
    id: values["id"],
    cloudId: "c-77",
    siteUrl: "https://globex.atlassian.net",
    siteName: "Globex",
    email: "hank@globex.test",
    healthy: true,
    scopes: ["write:jira-work", "read:jira-work", "offline_access"],
    createdAt: FAKE_NOW.toISOString(),
  });
  assert.deepEqual(Object.keys(result).sort(), SUMMARY_KEYS);
});

// Extends "[happy-12] a new connection is inserted with encrypted tokens": the
// result is the first returned row, not an echo of the input.
test("[happy-12] the result maps the first row returning() resolves to", async () => {
  const returned = row({
    id: "jrc_returned",
    organizationId: "org_1",
    cloudId: "c-1",
    siteUrl: "https://returned.atlassian.net",
    siteName: "Returned",
    email: "returned@acme.test",
    scopes: ["read:me"],
    createdAt: new Date("2025-05-05T05:05:05.555Z"),
    accessToken: "stored-cipher",
  });
  const second = row({ id: "jrc_second", siteName: "Second" });
  const fake = createFakeJiraDb([], { returningRows: [returned, second] });
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.upsert("org_1", INPUT);

  assert.deepEqual(result, summaryOf(returned));
  assert.deepEqual(Object.keys(result).sort(), SUMMARY_KEYS);
});

// Extends "[happy-12] a new connection is inserted with encrypted tokens": ids
// are generated per insert, and the two tokens are encrypted separately.
test("[happy-12] two new sites get two distinct jrc ids and distinct token ciphertexts", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  const one = await store.upsert("org_1", { ...INPUT, cloudId: "c-1" });
  const two = await store.upsert("org_1", {
    ...INPUT,
    cloudId: "c-2",
    accessToken: "same",
    refreshToken: "same",
  });

  assert.match(one.id, ID_PATTERN);
  assert.match(two.id, ID_PATTERN);
  assert.notEqual(one.id, two.id);
  const values = fake.inserts[1]?.values ?? {};
  assert.notEqual(values["accessToken"], values["refreshToken"]);
  assert.equal(k1().decrypt(values["accessToken"] as string), "same");
  assert.equal(k1().decrypt(values["refreshToken"] as string), "same");
  assert.equal(fake.rows.length, 2);
});

// ---- [happy-13] Reconnecting the same site updates the existing row --------

// Extends "[happy-13] reconnecting the same site updates the existing row":
// every input field replaces the stored one, and the set is the values' own.
test("[happy-13] reconnecting replaces email, tokens, expiry and scopes and keeps id and createdAt", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_keep",
      email: "old@acme.test",
      accessToken: k1().encrypt("AT-old"),
      refreshToken: k1().encrypt("RT-old"),
      expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      scopes: ["old:scope"],
      healthy: false,
      createdAt: new Date("2025-12-31T23:59:59.999Z"),
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.upsert("org_1", {
    cloudId: "c-1",
    siteUrl: "https://acme-new.atlassian.net",
    siteName: "Acme New",
    accessToken: "AT-new",
    refreshToken: "RT-new",
    expiresAt: "2026-12-01T00:00:00+00:00",
    scopes: ["b", "c"],
  });

  assert.deepEqual(result, {
    id: "jrc_keep",
    cloudId: "c-1",
    siteUrl: "https://acme-new.atlassian.net",
    siteName: "Acme New",
    email: null,
    healthy: true,
    scopes: ["b", "c"],
    createdAt: "2025-12-31T23:59:59.999Z",
  });

  const { set, values } = onlyInsert(fake);
  assert.equal("email" in set, true);
  assert.equal(set["email"], null);
  assert.equal(set["accessToken"], values["accessToken"]);
  assert.equal(set["refreshToken"], values["refreshToken"]);
  assert.deepEqual(set["scopes"], ["b", "c"]);
  assert.deepEqual(set["expiresAt"], new Date("2026-12-01T00:00:00.000Z"));
  assert.equal(set["healthy"], true);
  assert.equal(isSqlNow(set["updatedAt"]), true);
  for (const key of ["id", "organizationId", "cloudId", "createdAt"]) {
    assert.equal(key in set, false, `set has ${key}`);
  }

  assert.deepEqual(await store.tokens("org_1", "jrc_keep"), {
    accessToken: "AT-new",
    refreshToken: "RT-new",
    expiresAt: "2026-12-01T00:00:00.000Z",
    scopes: ["b", "c"],
  });
});

// Extends "[happy-13] the conflict set is the values without the key columns,
// plus updatedAt": null tokens and expiry replace stored ones too.
test("[happy-13] reconnecting with null tokens and expiry writes nulls into the conflict set", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_keep",
      accessToken: k1().encrypt("AT-old"),
      refreshToken: k1().encrypt("RT-old"),
      expiresAt: new Date("2026-06-01T00:00:00.000Z"),
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.upsert("org_1", {
    ...INPUT,
    email: "new@acme.test",
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  });

  const { set } = onlyInsert(fake);
  assert.equal(set["accessToken"], null);
  assert.equal(set["refreshToken"], null);
  assert.equal(set["expiresAt"], null);
  assert.equal(set["email"], "new@acme.test");
  assert.deepEqual(await store.tokens("org_1", "jrc_keep"), {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scopes: ["read:jira-work", "offline_access"],
  });
});

// ---- [boundary-5] Optional and nullable fields -----------------------------

// Extends "[boundary-5] null and empty tokens, expiry offsets and fractions,
// scopes and padded names": other offsets, fractions and calendar rollover.
test("[boundary-5] expiry offsets, short fractions and rolled-over days are stored as new Date(value)", async () => {
  const cases: Array<[string, string]> = [
    ["2026-11-04T12:00:00-05:30", "2026-11-04T17:30:00.000Z"],
    ["2026-11-04T12:00:00.5+00:00", "2026-11-04T12:00:00.500Z"],
    ["2026-11-04T12:00:00.999999Z", "2026-11-04T12:00:00.999Z"],
    ["2026-11-04T23:30-01:00", "2026-11-05T00:30:00.000Z"],
    ["2026-02-30T00:00:00Z", "2026-03-02T00:00:00.000Z"],
    ["2026-11-31T10:00:00+00:00", "2026-12-01T10:00:00.000Z"],
  ];
  for (const [expiresAt, iso] of cases) {
    const fake = createFakeJiraDb();
    await createJiraConnectionStore(fake.db, k1()).upsert("org_1", {
      ...INPUT,
      expiresAt,
    });
    const { values, set } = onlyInsert(fake);
    assert.ok(values["expiresAt"] instanceof Date, expiresAt);
    assert.equal((values["expiresAt"] as Date).toISOString(), iso, expiresAt);
    assert.equal(
      (values["expiresAt"] as Date).getTime(),
      new Date(expiresAt).getTime(),
    );
    assert.deepEqual(set["expiresAt"], values["expiresAt"]);
  }
});

// Extends "[boundary-5] an omitted, undefined or null email is stored as null;
// a given one as is": strings are never trimmed, folded or nulled.
test("[boundary-5] padded ids, URLs, names, an empty email and repeated scopes are stored as given", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.upsert("org_1", {
    cloudId: " C-1 ",
    siteUrl: "HTTPS://Acme.atlassian.net/",
    siteName: "\tAcme\n",
    email: "",
    accessToken: "AT-1",
    refreshToken: "",
    expiresAt: null,
    scopes: ["x", "x", "x"],
  });

  const { values, set } = onlyInsert(fake);
  assert.equal(values["cloudId"], " C-1 ");
  assert.equal(values["siteUrl"], "HTTPS://Acme.atlassian.net/");
  assert.equal(values["siteName"], "\tAcme\n");
  assert.equal(values["email"], "");
  assert.equal(set["email"], "");
  assert.deepEqual(values["scopes"], ["x", "x", "x"]);
  assert.equal(typeof values["refreshToken"], "string");
  assert.equal(k1().decrypt(values["refreshToken"] as string), "");
  assert.equal(result.cloudId, " C-1 ");
  assert.equal(result.siteName, "\tAcme\n");
  assert.equal(result.email, "");
  assert.deepEqual(result.scopes, ["x", "x", "x"]);
});

// Extends "[boundary-5] an omitted, undefined or null email is stored as null":
// the conflict set carries the same null.
test("[boundary-5] an omitted email is null in the conflict set as well as the values", async () => {
  const fake = createFakeJiraDb();
  await createJiraConnectionStore(fake.db, k1()).upsert("org_1", {
    cloudId: "c-1",
    siteUrl: "https://acme.atlassian.net",
    siteName: "Acme",
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    scopes: [],
  });
  const { values, set } = onlyInsert(fake);
  assert.equal(values["email"], null);
  assert.equal("email" in set, true);
  assert.equal(set["email"], null);
  assert.deepEqual(values["scopes"], []);
});

// ---- [unhappy-9] Rejected input issues no query ----------------------------

// Extends "[unhappy-9] a blank cloudId, siteUrl or siteName rejects before any
// query": other blanks, and the order of the checks.
test("[unhappy-9] the first blank of cloudId, siteUrl, siteName is reported before a bad expiry", async () => {
  const cases: Array<[Partial<JiraConnectionInput>, string]> = [
    [{ siteUrl: "   " }, "siteUrl must not be empty."],
    [{ siteName: "" }, "siteName must not be empty."],
    [{ siteName: "\n \t" }, "siteName must not be empty."],
    [{ cloudId: "\r\n" }, "cloudId must not be empty."],
    [{ siteUrl: "", siteName: "" }, "siteUrl must not be empty."],
    [{ siteUrl: " ", cloudId: " " }, "cloudId must not be empty."],
    [{ siteName: " ", expiresAt: "soon" }, "siteName must not be empty."],
    [
      { cloudId: "\t", siteUrl: "", siteName: "", expiresAt: "x" },
      "cloudId must not be empty.",
    ],
  ];
  for (const [patch, message] of cases) {
    const fake = createFakeJiraDb([row()]);
    const store = createJiraConnectionStore(fake.db, k1());
    await assert.rejects(
      () => store.upsert("org_1", { ...INPUT, ...patch }),
      rangeError(message),
    );
    assert.deepEqual(fake.calls, []);
    assert.equal(fake.inserts.length, 0);
  }
});

// Extends "[unhappy-9] an expiresAt that is not ISO 8601 with an offset rejects
// before any query": values Date would accept, near-misses of the pattern, and
// pattern matches that are not valid dates.
test("[unhappy-9] near-ISO, offset-less, padded and impossible expiries are rejected verbatim", async () => {
  for (const expiresAt of [
    "",
    "2026-11-04T12:00:00z",
    "2026-11-04 12:00:00Z",
    "2026-11-04T12:00:00+0100",
    "2026-11-04T12:00:00+01",
    "2026-11-04T12Z",
    "2026-11-04T12:00:00.Z",
    "+002026-11-04T12:00:00Z",
    "26-11-04T12:00:00Z",
    "2026-1-04T12:00:00Z",
    " 2026-11-04T12:00:00Z",
    "2026-11-04T12:00:00Z\n",
    "2026-11-04T12:00:00.000Z ",
    "2026-11-04T25:00:00Z",
    "2026-11-04T12:60:00Z",
    "2026-11-32T00:00:00Z",
    "2026-00-10T00:00:00Z",
    "2026-11-04T12:00:00+25:00",
    "1793793600000",
    "Wed Nov 04 2026 12:00:00 GMT+0000",
  ]) {
    const fake = createFakeJiraDb();
    const store = createJiraConnectionStore(fake.db, k1());
    await assert.rejects(
      () => store.upsert("org_1", { ...INPUT, expiresAt }),
      rangeError(expiryMessage(expiresAt)),
      JSON.stringify(expiresAt),
    );
    assert.deepEqual(fake.calls, []);
  }
});

// ---- [unhappy-10] The insert returns no row --------------------------------

// Extends "[unhappy-10] an insert that returns no row rejects": also when the
// site already exists, and with the email omitted.
test("[unhappy-10] an empty returning rejects even for an existing site, after one insert", async () => {
  const fake = createFakeJiraDb([row({ id: "jrc_a" })], {
    insertReturnsNothing: true,
  });
  const store = createJiraConnectionStore(fake.db, createTokenCipher(K2));

  await assert.rejects(
    () =>
      store.upsert("org_1", {
        cloudId: "c-1",
        siteUrl: "https://acme.atlassian.net",
        siteName: "Acme",
        accessToken: "AT",
        refreshToken: null,
        expiresAt: "2026-11-04T12:00+01:00",
        scopes: ["a"],
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Upsert returned no row.");
      return true;
    },
  );
  assert.deepEqual(fake.calls, ["insert"]);
});

// ---- [concurrency-1] Two overlapping upserts of the same site leave one connection

// Extends "[concurrency-1] two overlapping upserts of the same site leave one
// connection": the fake applies the second insert first.
test("[concurrency-1] overlapping upserts applied in reverse order converge on one row", async () => {
  const fake = createFakeJiraDb([], { holdInserts: true });
  const store = createJiraConnectionStore(fake.db, k1());

  const first = store.upsert("org_1", { ...INPUT, siteName: "A" });
  const second = store.upsert("org_1", { ...INPUT, siteName: "B" });
  await until(() => fake.held.length === 2);
  fake.held[1]?.();
  await until(() => fake.applied.length === 1);
  fake.held[0]?.();
  const [a, b] = await Promise.all([first, second]);

  assert.equal(a.id, b.id);
  assert.equal(fake.applied[0]?.values["siteName"], "B");
  const held = fake.rows.filter(
    (candidate) =>
      candidate.organizationId === "org_1" && candidate.cloudId === "c-1",
  );
  assert.equal(held.length, 1);
  assert.equal(held[0]?.siteName, "A");
  assert.equal(held[0]?.id, a.id);
  assert.deepEqual(fake.calls, ["insert", "insert"]);
});

// Extends "[concurrency-1] two overlapping upserts ...": three at once.
test("[concurrency-1] three overlapping upserts of one site leave one row with the last name", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  const results = await Promise.all(
    ["A", "B", "C"].map((siteName) =>
      store.upsert("org_1", { ...INPUT, siteName }),
    ),
  );

  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  assert.equal(fake.rows.length, 1);
  const last = fake.applied[fake.applied.length - 1];
  assert.equal(fake.rows[0]?.siteName, last?.values["siteName"]);
  assert.deepEqual(fake.calls, ["insert", "insert", "insert"]);
});

// ---- [happy-14] The same site in two organizations is two connections ------

// Extends "[happy-14] the same site in two organizations is two connections":
// three organizations, then a reconnect within one of them.
test("[happy-14] the same site in three organizations is three connections, each listed by its owner", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  const ids: string[] = [];
  for (const organizationId of ["org_1", "org_2", "org_3"]) {
    ids.push((await store.upsert(organizationId, INPUT)).id);
  }
  assert.equal(new Set(ids).size, 3);
  assert.equal(fake.rows.length, 3);

  const again = await store.upsert("org_2", { ...INPUT, siteName: "Again" });
  assert.equal(again.id, ids[1]);
  assert.equal(fake.rows.length, 3);

  for (const [index, organizationId] of ["org_1", "org_2", "org_3"].entries()) {
    const listed = await store.list(organizationId);
    assert.deepEqual(
      listed.map((summary) => summary.id),
      [ids[index]],
    );
  }
});

// ---- [happy-15] list orders oldest first, then by id -----------------------

// Extends "[happy-15] ties on createdAt are ordered by id in code-unit order":
// ids where locale or numeric collation disagrees with code-unit order.
test("[happy-15] createdAt ties are ordered by code unit, not by locale or number", async () => {
  const createdAt = new Date("2026-03-01T00:00:00.000Z");
  const ids = ["jrc_b", "jrc_ä", "jrc_a", "jrc_9", "jrc_10", "jrc_Z"];
  const fake = createFakeJiraDb(
    ids.map((id, index) => row({ id, cloudId: `c-${index}`, createdAt })),
  );
  const store = createJiraConnectionStore(fake.db, k1());

  const summaries = await store.list("org_1");

  assert.deepEqual(
    summaries.map((summary) => summary.id),
    ["jrc_10", "jrc_9", "jrc_Z", "jrc_a", "jrc_b", "jrc_ä"],
  );
});

// Extends "[happy-15] list orders oldest first, then by id": createdAt wins
// over id even a millisecond apart, and summaries are complete.
test("[happy-15] createdAt one millisecond apart outranks id order, with full summaries", async () => {
  const seeded = [
    row({ id: "jrc_a", cloudId: "c-a", createdAt: new Date("2026-03-01T00:00:00.001Z"), siteName: "A" }),
    row({ id: "jrc_b", cloudId: "c-b", createdAt: new Date("2026-03-01T00:00:00.000Z"), email: null }),
    row({ id: "jrc_c", cloudId: "c-c", createdAt: new Date("1999-12-31T23:59:59.999Z"), healthy: false, scopes: [] }),
    row({ id: "jrc_0", organizationId: "org_2", cloudId: "c-a", createdAt: new Date("1990-01-01T00:00:00.000Z") }),
  ];
  const fake = createFakeJiraDb(seeded);
  const store = createJiraConnectionStore(fake.db, k1());

  const summaries = await store.list("org_1");

  assert.deepEqual(summaries, [
    summaryOf(seeded[2] as JiraConnectionRow),
    summaryOf(seeded[1] as JiraConnectionRow),
    summaryOf(seeded[0] as JiraConnectionRow),
  ]);
  for (const summary of summaries) {
    assert.deepEqual(Object.keys(summary).sort(), SUMMARY_KEYS);
  }
  assert.deepEqual(fake.calls, ["select"]);
});

// Extends "[happy-15] list orders oldest first, then by id": more rows, in a
// scrambled seed order.
test("[happy-15] twelve rows come back sorted by createdAt, then id", async () => {
  const days = [3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2];
  const names = ["m", "c", "x", "a", "k", "b", "q", "z", "e", "f", "d", "y"];
  const seeded = names.map((name, index) =>
    row({
      id: `jrc_${name}`,
      cloudId: `c-${name}`,
      createdAt: new Date(`2026-0${days[index]}-01T00:00:00.000Z`),
    }),
  );
  const fake = createFakeJiraDb(seeded);
  const store = createJiraConnectionStore(fake.db, k1());

  const summaries = await store.list("org_1");

  assert.deepEqual(
    summaries.map((summary) => summary.id),
    [
      "jrc_c", "jrc_d", "jrc_k", "jrc_z",
      "jrc_b", "jrc_e", "jrc_x", "jrc_y",
      "jrc_a", "jrc_f", "jrc_m", "jrc_q",
    ],
  );
});

// ---- [boundary-6] An organization with no connections ----------------------

// Extends "[boundary-6] another organization's connections are not listed":
// several other organizations, and the empty organization id.
test("[boundary-6] list is empty for an organization only others have rows beside", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1" }),
    row({ id: "jrc_b", organizationId: "org_2" }),
    row({ id: "jrc_c", organizationId: "org_empty_not" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.list("org_empty"), []);
  assert.deepEqual(await store.list(""), []);
  assert.deepEqual(await store.list("ORG_1"), []);
});

// ---- [happy-16] Summaries do not need the key ------------------------------

// Extends "[happy-16] summaries do not need the key": list and get never call
// decrypt, even to discard the result.
test("[happy-16] list and get never call decrypt", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", cloudId: "c-1", accessToken: "not-a-ciphertext", refreshToken: k1().encrypt("RT") }),
    row({ id: "jrc_b", cloudId: "c-2", accessToken: k1().encrypt("AT"), refreshToken: null }),
  ]);
  const { cipher, counts } = spyCipher(k1(), { refuseDecrypt: true });
  const store = createJiraConnectionStore(fake.db, cipher);

  assert.equal((await store.list("org_1")).length, 2);
  assert.equal((await store.get("org_1", "jrc_a"))?.id, "jrc_a");
  assert.equal((await store.get("org_1", "jrc_b"))?.id, "jrc_b");
  assert.equal(counts.decrypt, 0);
});

// ---- [happy-17] get returns one summary ------------------------------------

// Extends "[happy-17] the summary copies the row and has exactly eight keys":
// the requested row among several, with a one-row limit.
test("[happy-17] get returns the requested row among several, via a one-row select", async () => {
  const wanted = row({
    id: "jrc_b",
    cloudId: "c-2",
    siteUrl: "https://initech.atlassian.net",
    siteName: "Initech",
    email: "peter@initech.test",
    healthy: false,
    scopes: ["read:jira-user", "read:jira-work", "read:jira-user"],
    createdAt: new Date("2026-05-06T07:08:09.123Z"),
    expiresAt: new Date("2026-11-04T12:00:00.000Z"),
    accessToken: k1().encrypt("AT"),
  });
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", cloudId: "c-1" }),
    wanted,
    row({ id: "jrc_c", cloudId: "c-3" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  const summary = await store.get("org_1", "jrc_b");

  assert.deepEqual(summary, summaryOf(wanted));
  assert.deepEqual(Object.keys(summary ?? {}).sort(), SUMMARY_KEYS);
  assert.deepEqual(fake.calls, ["select"]);
  assert.equal(fake.selects[0]?.limit, 1);
  assert.deepEqual(
    [...(fake.selects[0]?.where ?? [])].sort((x, y) =>
      x.column < y.column ? -1 : 1,
    ),
    [
      { column: "id", value: "jrc_b" },
      { column: "organization_id", value: "org_1" },
    ],
  );
});

// ---- [unhappy-11] get misses return null -----------------------------------

// Extends "[unhappy-11] get of another organization's connection returns null"
// and "[unhappy-11] get of a missing or empty id returns null".
test("[unhappy-11] get misses across organizations, case, padding and empty ids return null", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1", cloudId: "c-1" }),
    row({ id: "jrc_b", organizationId: "org_2", cloudId: "c-1" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  for (const [organizationId, connectionId] of [
    ["org_2", "jrc_a"],
    ["org_1", "jrc_b"],
    ["org_1", "JRC_A"],
    ["org_1", "jrc_a "],
    ["", "jrc_a"],
    ["ORG_1", "jrc_a"],
  ] as const) {
    assert.equal(
      await store.get(organizationId, connectionId),
      null,
      `${organizationId}/${connectionId}`,
    );
  }
});

// ---- [happy-18] Decrypted tokens -------------------------------------------

// Extends "[happy-18] tokens returns the decrypted pair": a store cipher with
// its own key id, the second of two rows, and long multi-byte tokens.
test("[happy-18] tokens decrypts with the store's cipher and maps expiry and scopes", async () => {
  const storeCipher = createTokenCipher(K2, { keyId: "prod" });
  const access = `eyJ${"a".repeat(4000)}.tökén`;
  const refresh = "refresh-🔑-token";
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", cloudId: "c-1", accessToken: storeCipher.encrypt("other") }),
    row({
      id: "jrc_b",
      cloudId: "c-2",
      accessToken: storeCipher.encrypt(access),
      refreshToken: storeCipher.encrypt(refresh),
      expiresAt: new Date("2027-03-04T05:06:07.089Z"),
      scopes: ["write:jira-work", "read:jira-work", "write:jira-work"],
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, storeCipher);

  assert.deepEqual(await store.tokens("org_1", "jrc_b"), {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: "2027-03-04T05:06:07.089Z",
    scopes: ["write:jira-work", "read:jira-work", "write:jira-work"],
  });
  assert.deepEqual(fake.calls, ["select"]);
  assert.equal(fake.selects[0]?.limit, 1);
});

// ---- [boundary-7] Absent tokens and expiry stay null -----------------------

// Extends "[boundary-7] a missing refresh token stays null beside a present
// access token": the other way round, with empty scopes.
test("[boundary-7] a missing access token stays null beside a present refresh token", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: null,
      refreshToken: k1().encrypt("RT-1"),
      expiresAt: null,
      scopes: [],
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: null,
    refreshToken: "RT-1",
    expiresAt: null,
    scopes: [],
  });
});

// ---- [unhappy-12] Another organization's connection ------------------------

// Extends "[unhappy-12] tokens of another organization's connection returns
// null": the other organization has rows of its own, and nothing is decrypted.
test("[unhappy-12] tokens across organizations or for an empty id returns null without decrypting", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1", cloudId: "c-1", accessToken: k1().encrypt("AT-1") }),
    row({ id: "jrc_b", organizationId: "org_2", cloudId: "c-1", accessToken: k1().encrypt("AT-2") }),
  ]);
  const { cipher, counts } = spyCipher(k1());
  const store = createJiraConnectionStore(fake.db, cipher);

  assert.equal(await store.tokens("org_2", "jrc_a"), null);
  assert.equal(await store.tokens("org_1", "jrc_b"), null);
  assert.equal(await store.tokens("org_1", ""), null);
  assert.equal(await store.tokens("", "jrc_a"), null);
  assert.equal(counts.decrypt, 0);
});

// ---- [unhappy-13] Tokens written under another key propagate the cipher error and write nothing

// Extends "[unhappy-13] tokens written under another key reject with the cipher
// error and write nothing": a foreign refresh token, and a store cipher with an
// explicit key id reading a default-id ciphertext.
test("[unhappy-13] a refresh token under another key id rejects with the key-id error", async () => {
  const fake = createFakeJiraDb([
    row({
      id: "jrc_a",
      accessToken: k1().encrypt("AT-1"),
      refreshToken: createTokenCipher(K2).encrypt("RT-1"),
    }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await assert.rejects(
    () => store.tokens("org_1", "jrc_a"),
    cipherError('Ciphertext was encrypted with key "72dbb733", not "630dcd29".'),
  );
  assert.deepEqual(fake.calls, ["select"]);
  assert.equal(fake.rows[0]?.healthy, true);
});

// Extends "[unhappy-13] ...": the error names the store cipher's own id.
test("[unhappy-13] a store cipher with key id prod names prod in the propagated error", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", accessToken: k1().encrypt("AT-1") }),
  ]);
  const store = createJiraConnectionStore(
    fake.db,
    createTokenCipher(K1, { keyId: "prod" }),
  );

  await assert.rejects(
    () => store.tokens("org_1", "jrc_a"),
    cipherError('Ciphertext was encrypted with key "630dcd29", not "prod".'),
  );
  assert.equal(fake.updates.length, 0);
});

// Extends "[unhappy-13] a malformed stored refresh token rejects with the
// cipher error": a tampered token propagates the authentication error.
test("[unhappy-13] a tampered stored access token propagates the authentication error", async () => {
  const valid = k1().encrypt("AT-1") as string;
  const fields = valid.split(":");
  const tag = fields[3] ?? "";
  fields[3] = (tag[0] === "A" ? "B" : "A") + tag.slice(1);
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", accessToken: fields.join(":"), refreshToken: null }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await assert.rejects(
    () => store.tokens("org_1", "jrc_a"),
    cipherError("Ciphertext failed authentication: wrong key or tampered data."),
  );
  assert.deepEqual(fake.calls, ["select"]);
});

// ---- [happy-19] A refreshed pair is stored encrypted ------------------------

// Extends "[happy-19] a refreshed pair is stored encrypted": another id among
// several rows, an offset expiry, repeated scopes and another store cipher.
test("[happy-19] saveTokens writes only the named connection, converting expiry and encrypting with the store's cipher", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", cloudId: "c-1", healthy: false }),
    row({ id: "jrc_b", organizationId: "org_2", cloudId: "c-1", healthy: false }),
  ]);
  const storeCipher = createTokenCipher(K2, { keyId: "rot" });
  const store = createJiraConnectionStore(fake.db, storeCipher);

  const result = await store.saveTokens("jrc_b", {
    accessToken: "AT-9",
    refreshToken: "RT-9",
    expiresAt: "2026-11-04T13:00:00+02:00",
    scopes: ["b", "a", "b"],
  });

  assert.equal(result, undefined);
  assert.deepEqual(fake.calls, ["update"]);
  const { set, where } = onlyUpdate(fake);
  assert.deepEqual(Object.keys(set).sort(), SAVE_KEYS);
  const reader = createTokenCipher(K2, { keyId: "rot" });
  assert.equal((set["accessToken"] as string).split(":")[1], "rot");
  assert.equal(reader.decrypt(set["accessToken"] as string), "AT-9");
  assert.equal(reader.decrypt(set["refreshToken"] as string), "RT-9");
  assert.deepEqual(set["expiresAt"], new Date("2026-11-04T11:00:00.000Z"));
  assert.deepEqual(set["scopes"], ["b", "a", "b"]);
  assert.equal(set["healthy"], true);
  assert.equal(isSqlNow(set["updatedAt"]), true);
  assert.deepEqual(where, [{ column: "id", value: "jrc_b" }]);

  assert.equal(fake.rows[0]?.healthy, false);
  assert.equal(fake.rows[1]?.healthy, true);
  assert.deepEqual(await store.tokens("org_2", "jrc_b"), {
    accessToken: "AT-9",
    refreshToken: "RT-9",
    expiresAt: "2026-11-04T11:00:00.000Z",
    scopes: ["b", "a", "b"],
  });
});

// Extends "[happy-19] a refreshed pair is stored encrypted": fractions and
// rollover convert as in upsert.
test("[happy-19] saveTokens stores a fractional or rolled-over expiry as new Date(value)", async () => {
  for (const [expiresAt, iso] of [
    ["2026-11-04T13:00:00.987654Z", "2026-11-04T13:00:00.987Z"],
    ["2026-04-31T23:59:59.9999-01:00", "2026-05-02T00:59:59.999Z"],
  ] as const) {
    const fake = createFakeJiraDb([row({ id: "jrc_a" })]);
    await createJiraConnectionStore(fake.db, k1()).saveTokens("jrc_a", {
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt,
      scopes: [],
    });
    const { set } = onlyUpdate(fake);
    assert.ok(set["expiresAt"] instanceof Date);
    assert.equal((set["expiresAt"] as Date).toISOString(), iso);
  }
});

// ---- [boundary-8] A grant without offline_access saves a null refresh token

// Extends "[boundary-8] a grant without offline_access saves a null refresh
// token": an empty access token is still a ciphertext, and reads back.
test("[boundary-8] a null refresh token beside an empty access token reads back as null and ''", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", refreshToken: k1().encrypt("RT-old") }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  await store.saveTokens("jrc_a", {
    accessToken: "",
    refreshToken: null,
    expiresAt: null,
    scopes: ["read:jira-work"],
  });

  const { set } = onlyUpdate(fake);
  assert.deepEqual(Object.keys(set).sort(), SAVE_KEYS);
  assert.equal(set["refreshToken"], null);
  assert.equal(set["expiresAt"], null);
  assert.equal(typeof set["accessToken"], "string");
  assert.deepEqual(await store.tokens("org_1", "jrc_a"), {
    accessToken: "",
    refreshToken: null,
    expiresAt: null,
    scopes: ["read:jira-work"],
  });
});

// ---- [boundary-9] An unknown connection id is a no-op -----------------------

// Extends "[boundary-9] saveTokens for an unknown id leaves other connections
// untouched": several rows, and the update is still the documented one.
test("[boundary-9] saveTokens for an unknown id issues the documented update and changes no row", async () => {
  const seeded = [
    row({ id: "jrc_a", cloudId: "c-1", healthy: false }),
    row({ id: "jrc_b", organizationId: "org_2", healthy: false }),
  ];
  const fake = createFakeJiraDb(seeded);
  const store = createJiraConnectionStore(fake.db, k1());

  const result = await store.saveTokens("jrc_gone", {
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: "2026-11-04T13:00:00Z",
    scopes: ["a"],
  });

  assert.equal(result, undefined);
  assert.deepEqual(fake.calls, ["update"]);
  const { set, where } = onlyUpdate(fake);
  assert.deepEqual(Object.keys(set).sort(), SAVE_KEYS);
  assert.deepEqual(where, [{ column: "id", value: "jrc_gone" }]);
  assert.deepEqual(fake.rows, seeded);
});

// ---- [unhappy-14] An unreadable expiry is rejected before any write ---------

// Extends "[unhappy-14] an unreadable expiry is rejected before any write" and
// "[unhappy-14] an expiry without an offset ...": other unreadable values.
test("[unhappy-14] saveTokens rejects empty, lowercase-z, impossible and spaced expiries before any write", async () => {
  for (const expiresAt of [
    "",
    "2026-11-04T13:00:00z",
    "2026-11-04T25:00:00Z",
    "2026-11-04T13:00:00.000+0000",
    "2026-11-04T13:00:00Z ",
    "tomorrow",
    "-3600",
  ]) {
    const fake = createFakeJiraDb([row({ id: "jrc_a", healthy: false })]);
    const store = createJiraConnectionStore(fake.db, k1());
    await assert.rejects(
      () =>
        store.saveTokens("jrc_a", {
          accessToken: "AT",
          refreshToken: "RT",
          expiresAt,
          scopes: [],
        }),
      rangeError(expiryMessage(expiresAt)),
      JSON.stringify(expiresAt),
    );
    assert.deepEqual(fake.calls, []);
    assert.equal(fake.rows[0]?.healthy, false);
  }
});

// ---- [happy-20] Flagging a connection --------------------------------------

// Extends "[happy-20] markUnhealthy leaves other connections healthy": another
// organization's row, flagged by id alone, keeps its tokens.
test("[happy-20] markUnhealthy flags another organization's row by id only and keeps its tokens", async () => {
  const access = k1().encrypt("AT-1");
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1", cloudId: "c-1" }),
    row({ id: "jrc_b", organizationId: "org_2", cloudId: "c-1", accessToken: access }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.markUnhealthy("jrc_b"), undefined);

  assert.deepEqual(fake.calls, ["update"]);
  const { set, where } = onlyUpdate(fake);
  assert.deepEqual(Object.keys(set).sort(), ["healthy", "updatedAt"]);
  assert.equal(set["healthy"], false);
  assert.equal(isSqlNow(set["updatedAt"]), true);
  assert.deepEqual(where, [{ column: "id", value: "jrc_b" }]);
  assert.equal((await store.get("org_2", "jrc_b"))?.healthy, false);
  assert.equal((await store.get("org_1", "jrc_a"))?.healthy, true);
  assert.equal(fake.rows[1]?.accessToken, access);
});

// ---- [boundary-10] Flagging twice, or flagging an unknown id ----------------

// Extends "[boundary-10] flagging twice leaves the connection unhealthy, one
// update per call": an unknown id on an empty table creates nothing.
test("[boundary-10] flagging unknown ids on an empty table resolves and creates no row", async () => {
  const fake = createFakeJiraDb();
  const store = createJiraConnectionStore(fake.db, k1());

  for (const id of ["jrc_gone", "jrc_gone", ""]) {
    assert.equal(await store.markUnhealthy(id), undefined);
  }

  assert.equal(fake.rows.length, 0);
  assert.deepEqual(fake.calls, ["update", "update", "update"]);
  for (const call of fake.updates) {
    assert.equal(call.set["healthy"], false);
    assert.equal(isSqlNow(call.set["updatedAt"]), true);
  }
});

// ---- [concurrency-2] A refresh and a failure flag overlap -------------------

// Extends "[concurrency-2] a refresh then a failure flag, overlapping, end with
// the last update": three overlapping updates, both orders.
test("[concurrency-2] three overlapping refreshes and flags end with the last applied update", async () => {
  const tokens = {
    accessToken: "AT-2",
    refreshToken: "RT-2",
    expiresAt: null,
    scopes: [],
  };
  for (const order of [
    ["save", "flag", "save"],
    ["flag", "save", "flag"],
  ]) {
    const fake = createFakeJiraDb([row({ id: "jrc_a", healthy: true })]);
    const store = createJiraConnectionStore(fake.db, k1());

    const results = await Promise.all(
      order.map((kind) =>
        kind === "save"
          ? store.saveTokens("jrc_a", tokens)
          : store.markUnhealthy("jrc_a"),
      ),
    );

    assert.deepEqual(results, [undefined, undefined, undefined]);
    assert.equal(fake.updates.length, 3);
    const last = fake.updates[fake.updates.length - 1];
    assert.equal(fake.rows[0]?.healthy, last?.set["healthy"]);
    assert.equal(k1().decrypt(fake.rows[0]?.accessToken ?? null), "AT-2");
  }
});

// ---- [happy-21] Removing an existing connection ----------------------------

// Extends "[happy-21] removing one connection keeps the others": several
// organizations, a strict boolean, and one delete.
test("[happy-21] removing one of several connections returns exactly true and keeps the rest", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1", cloudId: "c-1" }),
    row({ id: "jrc_b", organizationId: "org_1", cloudId: "c-2" }),
    row({ id: "jrc_z", organizationId: "org_2", cloudId: "c-2" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  const removed = await store.remove("org_1", "jrc_b");

  assert.equal(removed, true);
  assert.deepEqual(fake.calls, ["delete"]);
  assert.deepEqual(
    fake.rows.map((candidate) => candidate.id),
    ["jrc_a", "jrc_z"],
  );
  assert.equal(await store.get("org_1", "jrc_b"), null);
  assert.deepEqual(
    (await store.list("org_1")).map((summary) => summary.id),
    ["jrc_a"],
  );
});

// ---- [unhappy-15] Removing nothing -----------------------------------------

// Extends "[unhappy-15] removing another organization's connection removes
// nothing" and "[unhappy-15] removing a missing id removes nothing".
test("[unhappy-15] cross-organization, empty and case-variant removals return exactly false", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1", cloudId: "c-1" }),
    row({ id: "jrc_z", organizationId: "org_2", cloudId: "c-1" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  for (const [organizationId, connectionId] of [
    ["org_2", "jrc_a"],
    ["org_1", "jrc_z"],
    ["org_1", ""],
    ["", "jrc_a"],
    ["org_1", "JRC_A"],
  ] as const) {
    assert.equal(
      await store.remove(organizationId, connectionId),
      false,
      `${organizationId}/${connectionId}`,
    );
  }
  assert.deepEqual(
    fake.rows.map((candidate) => candidate.id),
    ["jrc_a", "jrc_z"],
  );
});

// ---- [boundary-11] Removing twice ------------------------------------------

// Extends "[boundary-11] removing twice reports true then false": a third
// removal, in the second organization.
test("[boundary-11] removing three times reports true, false, false", async () => {
  const fake = createFakeJiraDb([
    row({ id: "jrc_a", organizationId: "org_1" }),
    row({ id: "jrc_z", organizationId: "org_2" }),
  ]);
  const store = createJiraConnectionStore(fake.db, k1());

  assert.equal(await store.remove("org_2", "jrc_z"), true);
  assert.equal(await store.remove("org_2", "jrc_z"), false);
  assert.equal(await store.remove("org_2", "jrc_z"), false);
  assert.deepEqual(fake.calls, ["delete", "delete", "delete"]);
  assert.deepEqual(
    fake.rows.map((candidate) => candidate.id),
    ["jrc_a"],
  );
});
