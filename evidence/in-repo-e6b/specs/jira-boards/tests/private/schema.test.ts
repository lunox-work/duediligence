import assert from "node:assert/strict";
import { test } from "node:test";

import { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

import * as schema from "../../src/schema.js";
import { jiraConnection, organization } from "../../src/schema.js";
import * as jiraSchema from "../../src/schema/jira.js";

/**
 * The table as `schema/jira.ts` declares it. The spec puts the declaration
 * there, beside `jiraConnection`, and has `schema.ts` re-export it.
 */
function declared(): typeof schema.jiraBoard {
  const table = (jiraSchema as Record<string, unknown>)["jiraBoard"];
  assert.ok(table !== undefined, "schema/jira.ts does not export jiraBoard");
  return table as typeof schema.jiraBoard;
}

function columnsByName(table: typeof schema.jiraBoard) {
  return new Map(
    getTableConfig(table).columns.map((column) => [column.name, column]),
  );
}

// Extends "[happy-10] the barrel exports the table, the same object
// schema/jira.ts exports": jiraConnection still comes through the barrel
// unchanged beside it, and both name their Postgres tables.
test("[happy-10] schema/jira.ts declares jira_board beside an unchanged jiraConnection", () => {
  const board = declared();

  assert.equal(schema.jiraBoard, board);
  assert.equal(getTableConfig(board).name, "jira_board");
  assert.equal(jiraSchema.jiraConnection, schema.jiraConnection);
  assert.equal(getTableConfig(jiraSchema.jiraConnection).name, "jira_connection");
});

// Extends "[happy-11] columns, nullability and defaults": each property maps
// to its column, with the column type the spec gives.
const COLUMN_TYPES: ReadonlyArray<readonly [string, string, string]> = [
  ["id", "id", "PgText"],
  ["organizationId", "organization_id", "PgText"],
  ["connectionId", "connection_id", "PgText"],
  ["externalId", "external_id", "PgText"],
  ["name", "name", "PgText"],
  ["boardType", "board_type", "PgText"],
  ["projectKey", "project_key", "PgText"],
  ["selection", "selection", "PgJsonb"],
  ["writebackEnabled", "writeback_enabled", "PgBoolean"],
  ["createdAt", "created_at", "PgTimestamp"],
  ["updatedAt", "updated_at", "PgTimestamp"],
];

test("[happy-11] each property maps to its column with the spec's type", () => {
  const board = declared() as unknown as Record<
    string,
    { name: string; columnType: string }
  >;

  for (const [property, column, type] of COLUMN_TYPES) {
    assert.equal(board[property]?.name, column, `${property} column name`);
    assert.equal(board[property]?.columnType, type, `${column} type`);
  }
});

// Extends "[happy-11] columns, nullability and defaults": the timestamps are
// timestamptz defaulting to now(), and id is the only primary key.
test("[happy-11] the timestamps are timestamptz defaulting to now() and id alone is primary", () => {
  const byName = columnsByName(declared());
  const dialect = new PgDialect();

  for (const name of ["created_at", "updated_at"]) {
    const column = byName.get(name) as unknown as {
      withTimezone?: boolean;
      notNull: boolean;
      default: unknown;
    };
    assert.equal(column.withTimezone, true, `${name} has no time zone`);
    assert.equal(column.notNull, true);
    assert.ok(column.default instanceof SQL, `${name} does not default to SQL`);
    assert.equal(dialect.sqlToQuery(column.default).sql, "now()");
  }
  const primaries = [...byName.values()]
    .filter((column) => column.primary)
    .map((column) => column.name);
  assert.deepEqual(primaries, ["id"]);
  assert.deepEqual(getTableConfig(declared()).primaryKeys, []);
});

// Extends "[happy-11] columns, nullability and defaults": no column besides
// selection, writeback_enabled and the timestamps has a default.
test("[happy-11] only selection, writeback_enabled and the timestamps have defaults", () => {
  const withDefaults = getTableConfig(declared())
    .columns.filter((column) => column.hasDefault)
    .map((column) => column.name)
    .sort();

  assert.deepEqual(withDefaults, [
    "created_at",
    "selection",
    "updated_at",
    "writeback_enabled",
  ]);
});

// Extends "[happy-12] both owners cascade": each owner column references its
// own table's id. A key from organization_id to jira_connection and one from
// connection_id to organization passes the public checks and fails this.
test("[happy-12] organization_id references organization.id and connection_id references jira_connection.id", () => {
  const { foreignKeys } = getTableConfig(declared());

  const pairs = foreignKeys
    .map((key) => {
      const reference = key.reference();
      return {
        local: reference.columns.map((column) => column.name),
        table: reference.foreignTable,
        foreign: reference.foreignColumns.map((column) => column.name),
        onDelete: key.onDelete,
      };
    })
    .sort((a, b) => String(a.local[0]).localeCompare(String(b.local[0])));

  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[0]?.local, ["connection_id"]);
  assert.equal(pairs[0]?.table, jiraConnection);
  assert.deepEqual(pairs[0]?.foreign, ["id"]);
  assert.equal(pairs[0]?.onDelete, "cascade");
  assert.deepEqual(pairs[1]?.local, ["organization_id"]);
  assert.equal(pairs[1]?.table, organization);
  assert.deepEqual(pairs[1]?.foreign, ["id"]);
  assert.equal(pairs[1]?.onDelete, "cascade");
});

// Extends "[happy-13] one row per Jira board per connection, indexed for its
// owner": the constraint has exactly its two columns, no unique constraint
// makes a board unique per organization, and the owner index is on
// organization_id alone.
test("[happy-13] the unique constraint and the owner index have exactly their columns", () => {
  const config = getTableConfig(declared());

  const unique = config.uniqueConstraints.find(
    (constraint) => constraint.name === "jira_board_connection_external_unique",
  );
  assert.ok(unique, "no jira_board_connection_external_unique constraint");
  for (const constraint of config.uniqueConstraints) {
    assert.ok(
      !constraint.columns.some((column) => column.name === "organization_id"),
      `${String(constraint.name)} is unique per organization`,
    );
  }
  assert.deepEqual(
    unique.columns.map((column) => column.name),
    ["connection_id", "external_id"],
  );

  const index = config.indexes.find(
    (candidate) => candidate.config.name === "jira_board_organization_id_idx",
  );
  assert.ok(index, "no jira_board_organization_id_idx index");
  assert.equal(index.config.columns.length, 1);
  const first = index.config.columns[0];
  assert.equal(
    first !== undefined && "name" in first ? first.name : undefined,
    "organization_id",
  );
  assert.notEqual(index.config.unique, true);
});
