import assert from "node:assert/strict";
import { test } from "node:test";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import { authSchema } from "../src/auth-schema.js";
import * as barrel from "../src/schema.js";
import * as auth from "../src/schema/auth.js";
import * as organizations from "../src/schema/organizations.js";
import * as todosModule from "../src/schema/todos.js";

/**
 * The split of `schema.ts` into `schema/auth.ts`, `schema/organizations.ts`
 * and `schema/todos.ts`, with `schema.ts` left as a barrel. Everything is read
 * from the table objects; no database is involved.
 */

const modules = {
  "src/schema/auth.js": auth,
  "src/schema/organizations.js": organizations,
  "src/schema/todos.js": todosModule,
} as const;

type ModuleName = keyof typeof modules;

/** Every table, keyed by export name, with the module that owns it. */
const tables: Record<string, { module: ModuleName; table: PgTable }> = {
  user: { module: "src/schema/auth.js", table: auth.user },
  userEmail: { module: "src/schema/auth.js", table: auth.userEmail },
  session: { module: "src/schema/auth.js", table: auth.session },
  account: { module: "src/schema/auth.js", table: auth.account },
  verification: { module: "src/schema/auth.js", table: auth.verification },
  organization: {
    module: "src/schema/organizations.js",
    table: organizations.organization,
  },
  member: { module: "src/schema/organizations.js", table: organizations.member },
  invitation: {
    module: "src/schema/organizations.js",
    table: organizations.invitation,
  },
  todos: { module: "src/schema/todos.js", table: todosModule.todos },
};

function table(name: string): PgTable {
  const entry = tables[name];
  assert.notEqual(entry, undefined, `unknown table ${name}`);
  return (entry as { table: PgTable }).table;
}

/**
 * Renders an index column or `where` clause: a plain column as its name, an
 * SQL expression as its text with column names in place, e.g. `lower(email)`.
 */
function render(part: unknown): string {
  if (part !== null && typeof part === "object" && "queryChunks" in part) {
    return (part.queryChunks as unknown[]).map(render).join("");
  }
  if (part !== null && typeof part === "object" && "name" in part) {
    return String(part.name);
  }
  if (part !== null && typeof part === "object" && "value" in part) {
    return (part.value as string[]).join("");
  }
  return String(part);
}

interface Named {
  columns: string[];
  where: string | undefined;
  unique: boolean;
}

/** Finds an index or unique constraint by name, across both lists. */
function findNamed(from: PgTable, name: string): Named[] {
  const config = getTableConfig(from);
  const found: Named[] = [];
  for (const index of config.indexes) {
    if (index.config.name === name) {
      found.push({
        columns: index.config.columns.map(render),
        where:
          index.config.where === undefined
            ? undefined
            : render(index.config.where),
        unique: index.config.unique,
      });
    }
  }
  for (const constraint of config.uniqueConstraints) {
    if (constraint.getName() === name) {
      found.push({
        columns: constraint.columns.map((column) => column.name),
        where: undefined,
        unique: true,
      });
    }
  }
  return found;
}

// ---- module exports ---------------------------------------------------------

test("[happy-8] each schema module's runtime exports are exactly its tables", () => {
  assert.deepEqual(Object.keys(auth).sort(), [
    "account",
    "session",
    "user",
    "userEmail",
    "verification",
  ]);
  assert.deepEqual(Object.keys(organizations).sort(), [
    "invitation",
    "member",
    "organization",
  ]);
  assert.deepEqual(Object.keys(todosModule).sort(), ["todos"]);
});

test("[happy-8] no schema module re-exports another module's tables", () => {
  assert.equal("organization" in auth, false);
  assert.equal("todos" in auth, false);
  assert.equal("user" in organizations, false);
  assert.equal("todos" in organizations, false);
  assert.equal("user" in todosModule, false);
  assert.equal("organization" in todosModule, false);
});

test("[happy-9] each table keeps its Postgres table name", () => {
  const expected: Record<string, string> = {
    user: "user",
    userEmail: "user_email",
    session: "session",
    account: "account",
    verification: "verification",
    organization: "organization",
    member: "member",
    invitation: "invitation",
    todos: "todos",
  };
  for (const [name, entry] of Object.entries(tables)) {
    const exported = (modules[entry.module] as Record<string, unknown>)[name];
    assert.equal(
      getTableConfig(exported as PgTable).name,
      expected[name],
      `${entry.module} ${name}`,
    );
  }
});

test("[happy-9] the nine Postgres table names are distinct, and userEmail is user_email", () => {
  const names = Object.values(tables).map(
    (entry) => getTableConfig(entry.table).name,
  );
  assert.equal(new Set(names).size, 9);
  assert.equal(getTableConfig(auth.userEmail).name, "user_email");
});

// ---- the barrel -------------------------------------------------------------

test("[happy-10] the barrel's runtime exports are the nine tables", () => {
  assert.deepEqual(Object.keys(barrel).sort(), [
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

test("[happy-10] the barrel exports the union of the three modules' exports and nothing more", () => {
  const union = [
    ...Object.keys(auth),
    ...Object.keys(organizations),
    ...Object.keys(todosModule),
  ].sort();
  assert.deepEqual(Object.keys(barrel).sort(), union);
});

test("[happy-11] each barrel export is the identical object from its module", () => {
  for (const [name, entry] of Object.entries(tables)) {
    const fromBarrel = (barrel as Record<string, unknown>)[name];
    const fromModule = (modules[entry.module] as Record<string, unknown>)[name];
    assert.equal(fromBarrel, fromModule, `${name} from ${entry.module}`);
    assert.notEqual(fromBarrel, undefined, name);
  }
});

test("[happy-11] barrel tables used as foreign key targets are the modules' objects", () => {
  // Strict identity is what lets a cross-module reference resolve.
  assert.equal(barrel.user, auth.user);
  assert.equal(barrel.organization, organizations.organization);
  assert.equal(barrel.todos, todosModule.todos);
});

test("[happy-12] authSchema holds the modules' user and organization but not todos or userEmail", () => {
  assert.equal(authSchema.user, auth.user);
  assert.equal(authSchema.organization, organizations.organization);
  assert.equal("todos" in authSchema, false);
  assert.equal("userEmail" in authSchema, false);
});

test("[happy-12] every table authSchema holds is the identical object from its module", () => {
  assert.equal(authSchema.session, auth.session);
  assert.equal(authSchema.account, auth.account);
  assert.equal(authSchema.verification, auth.verification);
  assert.equal(authSchema.member, organizations.member);
  assert.equal(authSchema.invitation, organizations.invitation);
});

// ---- foreign keys -----------------------------------------------------------

const foreignKeyRows: Array<{
  from: string;
  column: string;
  target: string;
  onDelete: string;
}> = [
  { from: "todos", column: "user_id", target: "user", onDelete: "cascade" },
  { from: "userEmail", column: "user_id", target: "user", onDelete: "cascade" },
  { from: "session", column: "user_id", target: "user", onDelete: "cascade" },
  {
    from: "session",
    column: "active_organization_id",
    target: "organization",
    onDelete: "set null",
  },
  { from: "account", column: "user_id", target: "user", onDelete: "cascade" },
  {
    from: "member",
    column: "organization_id",
    target: "organization",
    onDelete: "cascade",
  },
  { from: "member", column: "user_id", target: "user", onDelete: "cascade" },
  {
    from: "invitation",
    column: "organization_id",
    target: "organization",
    onDelete: "cascade",
  },
  {
    from: "invitation",
    column: "inviter_id",
    target: "user",
    onDelete: "cascade",
  },
];

test("[happy-13] every foreign key points at the right table and column with the right delete action", () => {
  for (const row of foreignKeyRows) {
    const label = `${row.from}.${row.column}`;
    const matching = getTableConfig(table(row.from)).foreignKeys.filter(
      (fk) => fk.reference().columns[0]?.name === row.column,
    );
    assert.equal(matching.length, 1, label);
    const fk = matching[0];
    assert.notEqual(fk, undefined, label);
    const reference = fk?.reference();
    assert.equal(reference?.foreignTable, table(row.target), label);
    assert.equal(reference?.foreignColumns[0]?.name, "id", label);
    assert.equal(fk?.onDelete, row.onDelete, label);
  }
});

test("[happy-13] the listed foreign keys are each table's only ones", () => {
  const counts = new Map<string, number>();
  for (const row of foreignKeyRows) {
    counts.set(row.from, (counts.get(row.from) ?? 0) + 1);
  }
  for (const [from, count] of counts) {
    assert.equal(getTableConfig(table(from)).foreignKeys.length, count, from);
  }
});

test("[happy-14] user, verification and organization have no foreign keys", () => {
  for (const name of ["user", "verification", "organization"]) {
    assert.equal(getTableConfig(table(name)).foreignKeys.length, 0, name);
  }
});

test("[happy-14] the tables with no foreign keys are exactly user, verification and organization", () => {
  const without = Object.keys(tables)
    .filter((name) => getTableConfig(table(name)).foreignKeys.length === 0)
    .sort();
  assert.deepEqual(without, ["organization", "user", "verification"]);
});

// ---- indexes, constraints and defaults ---------------------------------------

test("[happy-15] each named index or unique constraint is still on its table", () => {
  const rows: Array<{
    table: string;
    name: string;
    columns: string[];
    where?: string;
    unique: boolean;
  }> = [
    {
      table: "todos",
      name: "todos_user_id_created_at_idx",
      columns: ["user_id", "created_at desc"],
      unique: false,
    },
    {
      table: "user",
      name: "user_email_lower_unique",
      columns: ["lower(email)"],
      unique: true,
    },
    {
      table: "userEmail",
      name: "user_email_one_primary",
      columns: ["user_id"],
      where: "is_primary",
      unique: true,
    },
    {
      table: "userEmail",
      name: "user_email_email_lower_unique",
      columns: ["lower(email)"],
      unique: true,
    },
    {
      table: "account",
      name: "account_provider_identity_unique",
      columns: ["provider_id", "account_id"],
      unique: true,
    },
    {
      table: "member",
      name: "member_organization_user_unique",
      columns: ["organization_id", "user_id"],
      unique: true,
    },
    {
      table: "member",
      name: "member_user_id_idx",
      columns: ["user_id"],
      unique: false,
    },
    {
      table: "invitation",
      name: "invitation_email_status_idx",
      columns: ["email", "status"],
      unique: false,
    },
    {
      table: "invitation",
      name: "invitation_organization_id_idx",
      columns: ["organization_id"],
      unique: false,
    },
  ];
  for (const row of rows) {
    const found = findNamed(table(row.table), row.name);
    assert.equal(found.length, 1, row.name);
    assert.deepEqual(found[0]?.columns, row.columns, row.name);
    assert.equal(found[0]?.unique, row.unique, row.name);
    if (row.where !== undefined) {
      assert.equal(found[0]?.where?.trim(), row.where, row.name);
    }
  }
});

test("[happy-15] the one-primary index is partial and the plain indexes are not", () => {
  assert.notEqual(
    findNamed(auth.userEmail, "user_email_one_primary")[0]?.where,
    undefined,
  );
  assert.equal(findNamed(organizations.member, "member_user_id_idx")[0]?.where, undefined);
  assert.equal(
    findNamed(todosModule.todos, "todos_user_id_created_at_idx")[0]?.where,
    undefined,
  );
});

function columnDefault(from: PgTable, column: string): unknown {
  const found = getTableConfig(from).columns.find((c) => c.name === column);
  assert.notEqual(found, undefined, column);
  return found?.default;
}

test("[boundary-6] column-level defaults survive the move", () => {
  assert.equal(columnDefault(todosModule.todos, "done"), false);
  assert.equal(columnDefault(auth.userEmail, "is_primary"), false);
  assert.equal(columnDefault(auth.user, "email_verified"), false);
  assert.equal(columnDefault(organizations.member, "role"), "member");
  assert.equal(columnDefault(organizations.invitation, "role"), "member");
  assert.equal(columnDefault(organizations.invitation, "status"), "pending");
});

test("[boundary-6] defaults read through the barrel and authSchema are the same", () => {
  assert.equal(columnDefault(barrel.todos, "done"), false);
  assert.equal(columnDefault(authSchema.user, "email_verified"), false);
  assert.equal(columnDefault(authSchema.member, "role"), "member");
  assert.equal(columnDefault(authSchema.invitation, "status"), "pending");
});
