import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";

import { SQL } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import { authSchema } from "../src/auth-schema.js";
import * as root from "../src/index.js";
import * as barrel from "../src/schema.js";
import * as auth from "../src/schema/auth.js";
import * as organizations from "../src/schema/organizations.js";
import * as todosModule from "../src/schema/todos.js";

const AUTH_KEYS = ["account", "session", "user", "userEmail", "verification"];
const ORGANIZATION_KEYS = ["invitation", "member", "organization"];
const TODO_KEYS = ["todos"];

/** Every table, its export name, its module, and its Postgres name. */
const TABLES: Array<{
  name: string;
  table: PgTable;
  module: Record<string, unknown>;
  pgName: string;
}> = [
  { name: "user", table: auth.user, module: auth, pgName: "user" },
  { name: "userEmail", table: auth.userEmail, module: auth, pgName: "user_email" },
  { name: "session", table: auth.session, module: auth, pgName: "session" },
  { name: "account", table: auth.account, module: auth, pgName: "account" },
  { name: "verification", table: auth.verification, module: auth, pgName: "verification" },
  { name: "organization", table: organizations.organization, module: organizations, pgName: "organization" },
  { name: "member", table: organizations.member, module: organizations, pgName: "member" },
  { name: "invitation", table: organizations.invitation, module: organizations, pgName: "invitation" },
  { name: "todos", table: todosModule.todos, module: todosModule, pgName: "todos" },
];

function sortedKeys(namespace: object): string[] {
  return Object.keys(namespace).sort();
}

function foreignKeyOn(table: PgTable, column: string) {
  const matches = getTableConfig(table).foreignKeys.filter((fk) => {
    const columns = fk.reference().columns;
    return columns.length === 1 && columns[0]?.name === column;
  });
  assert.equal(matches.length, 1, `exactly one foreign key on ${column}`);
  return matches[0]!;
}

/**
 * A readable form of an index column: a plain column by its name, an SQL
 * expression as `sql(<names of the columns it references>)`.
 */
function describeIndexColumn(column: unknown): string {
  if (column instanceof SQL) {
    const names = column.queryChunks
      .filter(
        (chunk): chunk is SQL.Aliased & { name: string } =>
          typeof chunk === "object" &&
          chunk !== null &&
          "name" in chunk &&
          typeof (chunk as { name: unknown }).name === "string",
      )
      .map((chunk) => chunk.name);
    return `sql(${names.join(",")})`;
  }
  return (column as { name: string }).name;
}

/** An index or unique constraint by name, with its columns and uniqueness. */
function namedIndexOrUnique(
  table: PgTable,
  name: string,
): { columns: string[]; unique: boolean; where: SQL | undefined } {
  const config = getTableConfig(table);
  const index = config.indexes.find((candidate) => candidate.config.name === name);
  if (index !== undefined) {
    return {
      columns: index.config.columns.map(describeIndexColumn),
      unique: index.config.unique,
      where: index.config.where,
    };
  }
  const constraint = config.uniqueConstraints.find(
    (candidate) => candidate.name === name,
  );
  assert.notEqual(constraint, undefined, `${name} should exist`);
  return {
    columns: constraint!.columns.map((column) => column.name),
    unique: true,
    where: undefined,
  };
}

function columnOf(table: PgTable, name: string) {
  const column = getTableConfig(table).columns.find(
    (candidate) => candidate.name === name,
  );
  assert.notEqual(column, undefined, `${name} should exist`);
  return column!;
}

// ---- module exports ---------------------------------------------------------

test("[happy-9] each schema module's runtime exports are exactly its tables", () => {
  assert.deepEqual(sortedKeys(auth), AUTH_KEYS);
  assert.deepEqual(sortedKeys(organizations), ORGANIZATION_KEYS);
  assert.deepEqual(sortedKeys(todosModule), TODO_KEYS);
});

test("[happy-9] the cycling modules do not re-export each other's tables", () => {
  assert.equal("organization" in auth, false);
  assert.equal("user" in organizations, false);
  assert.equal("user" in todosModule, false);
});

test("[happy-10] each table keeps its Postgres table name", () => {
  for (const { name, table, pgName } of TABLES) {
    assert.equal(getTableConfig(table).name, pgName, name);
  }
});

test("[happy-10] userEmail is the snake_case user_email and the nine names are distinct", () => {
  assert.equal(getTableConfig(auth.userEmail).name, "user_email");
  const names = TABLES.map(({ table }) => getTableConfig(table).name);
  assert.equal(new Set(names).size, 9);
});

// ---- the barrel -------------------------------------------------------------

test("[happy-11] the barrel's runtime exports are the nine tables", () => {
  assert.deepEqual(sortedKeys(barrel), [
    "account",
    "invitation",
    "member",
    "organization",
    "session",
    "todos",
    "user",
    "userEmail",
    "verification",
  ]);
});

test("[happy-11] the barrel's keys are exactly the union of the three modules' keys", () => {
  assert.deepEqual(
    sortedKeys(barrel),
    [...AUTH_KEYS, ...ORGANIZATION_KEYS, ...TODO_KEYS].sort(),
  );
  assert.equal("default" in barrel, false);
});

test("[happy-12] each barrel export is the identical object from its module", () => {
  const fromBarrel = barrel as unknown as Record<string, unknown>;
  for (const { name, module } of TABLES) {
    assert.equal(fromBarrel[name], module[name], name);
  }
});

test("[happy-12] the package root's tables are the identical objects from their modules", () => {
  const fromRoot = root as unknown as Record<string, unknown>;
  for (const { name, module } of TABLES) {
    assert.equal(fromRoot[name], module[name], name);
  }
});

test("[happy-13] authSchema still holds the barrel's tables and not todos or userEmail", () => {
  assert.equal(authSchema.user, auth.user);
  assert.equal(authSchema.organization, organizations.organization);
  assert.equal("todos" in authSchema, false);
  assert.equal("userEmail" in authSchema, false);
});

test("[happy-13] authSchema holds exactly the seven auth and organization tables, by identity", () => {
  assert.deepEqual(sortedKeys(authSchema), [
    "account",
    "invitation",
    "member",
    "organization",
    "session",
    "user",
    "verification",
  ]);
  const schema = authSchema as unknown as Record<string, unknown>;
  for (const { name, module } of TABLES) {
    if (name in schema) {
      assert.equal(schema[name], module[name], name);
    }
  }
});

// ---- foreign keys -----------------------------------------------------------

const FOREIGN_KEYS: Array<{
  from: string;
  table: PgTable;
  column: string;
  target: PgTable;
  onDelete: string;
}> = [
  { from: "todos", table: todosModule.todos, column: "user_id", target: auth.user, onDelete: "cascade" },
  { from: "userEmail", table: auth.userEmail, column: "user_id", target: auth.user, onDelete: "cascade" },
  { from: "session", table: auth.session, column: "user_id", target: auth.user, onDelete: "cascade" },
  { from: "session", table: auth.session, column: "active_organization_id", target: organizations.organization, onDelete: "set null" },
  { from: "account", table: auth.account, column: "user_id", target: auth.user, onDelete: "cascade" },
  { from: "member", table: organizations.member, column: "organization_id", target: organizations.organization, onDelete: "cascade" },
  { from: "member", table: organizations.member, column: "user_id", target: auth.user, onDelete: "cascade" },
  { from: "invitation", table: organizations.invitation, column: "organization_id", target: organizations.organization, onDelete: "cascade" },
  { from: "invitation", table: organizations.invitation, column: "inviter_id", target: auth.user, onDelete: "cascade" },
];

test("[happy-14] every foreign key points at the right table with the right action", () => {
  for (const { from, table, column, target, onDelete } of FOREIGN_KEYS) {
    const fk = foreignKeyOn(table, column);
    const reference = fk.reference();
    assert.equal(reference.foreignTable, target, `${from}.${column}`);
    assert.equal(reference.foreignColumns[0]?.name, "id", `${from}.${column}`);
    assert.equal(fk.onDelete, onDelete, `${from}.${column}`);
  }
});

test("[happy-14] session's cross-module reference to organization sets null, beside its cascading user reference", () => {
  const { foreignKeys } = getTableConfig(auth.session);
  assert.equal(foreignKeys.length, 2);
  const active = foreignKeyOn(auth.session, "active_organization_id");
  assert.equal(active.reference().foreignTable, organizations.organization);
  assert.equal(active.onDelete, "set null");
  assert.equal(foreignKeyOn(auth.session, "user_id").onDelete, "cascade");
});

/**
 * Loads the schema in a fresh module graph (a worker thread has its own
 * module cache), importing `first` before anything else, and reports how the
 * cross-module foreign keys resolve there.
 */
function resolveInFreshGraph(first: string): Promise<{
  sessionTargetName: string;
  sessionTargetIsOrganization: boolean;
  memberTargetName: string;
  memberTargetIsUser: boolean;
}> {
  const authUrl = new URL("../src/schema/auth.js", import.meta.url).href;
  const organizationsUrl = new URL(
    "../src/schema/organizations.js",
    import.meta.url,
  ).href;
  const code = `
    const { parentPort, workerData } = require("node:worker_threads");
    (async () => {
      await import(workerData.first);
      const auth = await import(workerData.auth);
      const organizations = await import(workerData.organizations);
      const { getTableConfig } = await import(workerData.pgCore);
      const fkOn = (table, column) =>
        getTableConfig(table).foreignKeys.find(
          (fk) => fk.reference().columns[0].name === column,
        );
      const sessionTarget = fkOn(auth.session, "active_organization_id")
        .reference().foreignTable;
      const memberTarget = fkOn(organizations.member, "user_id")
        .reference().foreignTable;
      parentPort.postMessage({
        sessionTargetName: getTableConfig(sessionTarget).name,
        sessionTargetIsOrganization: sessionTarget === organizations.organization,
        memberTargetName: getTableConfig(memberTarget).name,
        memberTargetIsUser: memberTarget === auth.user,
      });
    })().catch((error) => {
      parentPort.postMessage({ error: String((error && error.stack) || error) });
    });
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(code, {
      eval: true,
      workerData: {
        first: first === "auth" ? authUrl : organizationsUrl,
        auth: authUrl,
        organizations: organizationsUrl,
        pgCore: import.meta.resolve("drizzle-orm/pg-core"),
      },
    });
    worker.once("message", (message: { error?: string }) => {
      void worker.terminate();
      if (message.error !== undefined) {
        reject(new Error(message.error));
      } else {
        resolve(message as never);
      }
    });
    worker.once("error", reject);
  });
}

test("[boundary-5] with auth.js loaded first, the cross-module foreign keys resolve", async () => {
  const result = await resolveInFreshGraph("auth");
  assert.equal(result.sessionTargetName, "organization");
  assert.equal(result.sessionTargetIsOrganization, true);
  assert.equal(result.memberTargetName, "user");
  assert.equal(result.memberTargetIsUser, true);
});

test("[boundary-5] with organizations.js loaded first, the cross-module foreign keys resolve", async () => {
  const result = await resolveInFreshGraph("organizations");
  assert.equal(result.sessionTargetName, "organization");
  assert.equal(result.sessionTargetIsOrganization, true);
  assert.equal(result.memberTargetName, "user");
  assert.equal(result.memberTargetIsUser, true);
});

test("[happy-15] user, verification and organization have no foreign keys", () => {
  for (const table of [auth.user, auth.verification, organizations.organization]) {
    assert.equal(getTableConfig(table).foreignKeys.length, 0);
  }
});

test("[happy-15] the tables with any foreign key are exactly the six that reference another", () => {
  const withForeignKeys = TABLES.filter(
    ({ table }) => getTableConfig(table).foreignKeys.length > 0,
  ).map(({ name }) => name);
  assert.deepEqual(withForeignKeys.sort(), [
    "account",
    "invitation",
    "member",
    "session",
    "todos",
    "userEmail",
  ]);
});

// ---- indexes, constraints and defaults --------------------------------------

test("[happy-16] each named index or unique constraint is still on its table", () => {
  const expected: Array<[PgTable, string, string[], boolean]> = [
    [todosModule.todos, "todos_user_id_created_at_idx", ["user_id", "sql(created_at)"], false],
    [auth.user, "user_email_lower_unique", ["sql(email)"], true],
    [auth.userEmail, "user_email_one_primary", ["user_id"], true],
    [auth.userEmail, "user_email_email_lower_unique", ["sql(email)"], true],
    [auth.account, "account_provider_identity_unique", ["provider_id", "account_id"], true],
    [organizations.member, "member_organization_user_unique", ["organization_id", "user_id"], true],
    [organizations.member, "member_user_id_idx", ["user_id"], false],
    [organizations.invitation, "invitation_email_status_idx", ["email", "status"], false],
    [organizations.invitation, "invitation_organization_id_idx", ["organization_id"], false],
  ];
  for (const [table, name, columns, unique] of expected) {
    const found = namedIndexOrUnique(table, name);
    assert.deepEqual(found.columns, columns, name);
    assert.equal(found.unique, unique, name);
  }
});

test("[happy-16] only user_email_one_primary is partial, on is_primary", () => {
  const primary = namedIndexOrUnique(auth.userEmail, "user_email_one_primary");
  assert.notEqual(primary.where, undefined);
  assert.equal(describeIndexColumn(primary.where), "sql(is_primary)");
  assert.equal(
    namedIndexOrUnique(auth.userEmail, "user_email_email_lower_unique").where,
    undefined,
  );
});

test("[boundary-6] column-level defaults survive the move", () => {
  const expected: Array<[PgTable, string, unknown]> = [
    [todosModule.todos, "done", false],
    [auth.userEmail, "is_primary", false],
    [auth.user, "email_verified", false],
    [organizations.member, "role", "member"],
    [organizations.invitation, "role", "member"],
    [organizations.invitation, "status", "pending"],
  ];
  for (const [table, name, value] of expected) {
    assert.equal(columnOf(table, name).default, value, name);
  }
});

test("[boundary-6] the false defaults are declared defaults, not absent ones", () => {
  for (const [table, name] of [
    [todosModule.todos, "done"],
    [auth.userEmail, "is_primary"],
    [auth.user, "email_verified"],
  ] as const) {
    const column = columnOf(table, name);
    assert.equal(column.hasDefault, true, name);
    assert.equal(column.default, false, name);
  }
});
