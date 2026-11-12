/**
 * `jira_connection`: its columns, its one unique constraint, its foreign key,
 * and its place in the barrel (and not in Better Auth's schema).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";

import { authSchema } from "../src/auth-schema.js";
import * as schema from "../src/schema.js";
import * as jiraSchema from "../src/schema/jira.js";
import { jiraConnection } from "../src/schema/jira.js";
import { organization } from "../src/schema/organizations.js";

function column(name: string) {
  const found = getTableConfig(jiraConnection).columns.find(
    (candidate) => candidate.name === name,
  );
  assert.ok(found, `no column ${name}`);
  return found;
}

test("[happy-8] jira_connection has the documented columns and primary key", () => {
  const { name, columns } = getTableConfig(jiraConnection);
  assert.equal(name, "jira_connection");
  assert.deepEqual(
    columns.map((candidate) => candidate.name),
    [
      "id",
      "organization_id",
      "cloud_id",
      "site_url",
      "site_name",
      "email",
      "access_token",
      "refresh_token",
      "expires_at",
      "scopes",
      "healthy",
      "created_at",
      "updated_at",
    ],
  );
  const primary = columns.filter((candidate) => candidate.primary);
  assert.equal(primary.length, 1);
  assert.equal(primary[0]?.name, "id");
  assert.equal(primary[0]?.getSQLType(), "text");
});

test("[happy-8] jira_connection nullability and defaults", () => {
  for (const name of [
    "organization_id",
    "cloud_id",
    "site_url",
    "site_name",
    "scopes",
    "healthy",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(column(name).notNull, true, `${name} should be notNull`);
  }
  for (const name of ["email", "access_token", "refresh_token", "expires_at"]) {
    assert.equal(column(name).notNull, false, `${name} should be nullable`);
  }
  assert.equal(column("scopes").getSQLType(), "text[]");
  assert.equal(column("scopes").hasDefault, true);
  assert.equal(column("healthy").default, true);
  assert.equal(column("created_at").hasDefault, true);
  assert.equal(column("updated_at").hasDefault, true);
});

test("[happy-9] one connection per site per organization", () => {
  const { uniqueConstraints } = getTableConfig(jiraConnection);
  const constraint = uniqueConstraints.find(
    (candidate) =>
      candidate.getName() === "jira_connection_organization_cloud_unique",
  );
  assert.ok(constraint, "missing jira_connection_organization_cloud_unique");
  assert.deepEqual(
    constraint.columns.map((candidate) => candidate.name),
    ["organization_id", "cloud_id"],
  );
});

test("[happy-9] the unique constraint is the table's only constraint or index", () => {
  const { uniqueConstraints, indexes } = getTableConfig(jiraConnection);
  assert.equal(uniqueConstraints.length, 1);
  assert.equal(indexes.length, 0);
});

test("[happy-10] a connection cascades with its organization", () => {
  const { foreignKeys } = getTableConfig(jiraConnection);
  assert.equal(foreignKeys.length, 1);
  assert.equal(foreignKeys[0]?.reference().foreignTable, organization);
  assert.equal(foreignKeys[0]?.onDelete, "cascade");
});

test("[happy-10] the foreign key runs from organization_id to organization.id", () => {
  const reference = getTableConfig(jiraConnection).foreignKeys[0]?.reference();
  assert.ok(reference);
  assert.deepEqual(
    reference.columns.map((candidate) => candidate.name),
    ["organization_id"],
  );
  assert.equal(reference.foreignColumns.length, 1);
  assert.equal(reference.foreignColumns[0], organization.id);
});

test("[happy-11] the barrel re-exports every export of schema/jira.ts", () => {
  const exports = Object.entries(jiraSchema);
  assert.ok(exports.length >= 1);
  for (const [name, value] of exports) {
    assert.equal(
      (schema as Record<string, unknown>)[name],
      value,
      `schema.ts does not re-export ${name}`,
    );
  }
  assert.equal(schema.jiraConnection, jiraConnection);
});

test("[happy-11] the barrel holds ten distinct tables and authSchema has no jiraConnection", () => {
  const names = (Object.values(schema) as unknown[]).flatMap((value) => {
    try {
      return typeof value === "object" && value !== null
        ? [getTableConfig(value as PgTable).name]
        : [];
    } catch {
      return [];
    }
  });
  const tables = names.filter((name) => name !== "");
  assert.equal(tables.length, 10);
  assert.equal(new Set(tables).size, 10);
  assert.ok(tables.includes("jira_connection"));
  assert.equal("jiraConnection" in authSchema, false);
});
