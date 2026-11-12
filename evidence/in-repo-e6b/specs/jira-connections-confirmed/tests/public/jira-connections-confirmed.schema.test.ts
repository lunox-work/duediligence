/**
 * `jira_connection`: its columns, constraint, index and foreign key, and how
 * the barrel, `authSchema` and the package entry point expose it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";

import { authSchema } from "../src/auth-schema.js";
import * as cipherModule from "../src/cipher.js";
import * as index from "../src/index.js";
import * as storeModule from "../src/jira-connections.js";
import * as schema from "../src/schema.js";
import * as jiraSchema from "../src/schema/jira.js";
import { organization } from "../src/schema/organizations.js";

const { jiraConnection } = jiraSchema;

function column(name: string) {
  const found = getTableConfig(jiraConnection).columns.find(
    (candidate) => candidate.name === name,
  );
  assert.ok(found, `no column ${name}`);
  return found;
}

/** The column name of an index or constraint column, when it has one. */
function nameOf(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "name" in value
    ? String((value as { name: unknown }).name)
    : undefined;
}

// ---- columns ---------------------------------------------------------------

test("[happy-9] jira_connection has the documented name and columns, in order", () => {
  const config = getTableConfig(jiraConnection);
  assert.equal(config.name, "jira_connection");
  assert.deepEqual(
    config.columns.map((candidate) => candidate.name),
    [
      "id",
      "organization_id",
      "cloud_id",
      "site_url",
      "site_name",
      "kind",
      "access_token_enc",
      "refresh_token_enc",
      "key_id",
      "expires_at",
      "scopes",
      "email",
      "healthy",
      "created_at",
      "updated_at",
    ],
  );
});

test("[happy-9] exactly one column is primary: id, of type text", () => {
  const primary = getTableConfig(jiraConnection).columns.filter(
    (candidate) => candidate.primary,
  );
  assert.equal(primary.length, 1);
  assert.equal(primary[0]?.name, "id");
  assert.equal(primary[0]?.getSQLType(), "text");
});

test("[happy-9] required columns are notNull and the optional ones are not", () => {
  for (const name of [
    "organization_id",
    "cloud_id",
    "site_url",
    "site_name",
    "kind",
    "scopes",
    "healthy",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(column(name).notNull, true, `${name} should be notNull`);
  }
  for (const name of [
    "email",
    "access_token_enc",
    "refresh_token_enc",
    "key_id",
    "expires_at",
  ]) {
    assert.equal(column(name).notNull, false, `${name} should be nullable`);
  }
});

test("[happy-9] scopes, kind, healthy and the timestamps have their defaults", () => {
  assert.equal(column("scopes").getSQLType(), "text");
  assert.equal(column("scopes").default, "");
  assert.equal(column("kind").default, "oauth");
  assert.equal(column("healthy").default, true);
  assert.equal(column("created_at").hasDefault, true);
  assert.equal(column("updated_at").hasDefault, true);
});

test("[happy-9] the token columns and key id have no default", () => {
  // Ciphertext is only ever written by the store, never filled in.
  for (const name of ["access_token_enc", "refresh_token_enc", "key_id"]) {
    assert.equal(column(name).hasDefault, false, `${name} has a default`);
  }
});

// ---- constraint, index, foreign key -----------------------------------------

test("[happy-10] one connection per site per organization", () => {
  const { uniqueConstraints } = getTableConfig(jiraConnection);
  assert.equal(uniqueConstraints.length, 1);
  assert.equal(
    uniqueConstraints[0]?.name,
    "jira_connection_organization_site_unique",
  );
  assert.deepEqual(
    uniqueConstraints[0]?.columns.map((candidate) => candidate.name),
    ["organization_id", "cloud_id"],
  );
});

test("[happy-10] cloud_id alone is not unique", () => {
  // A site may be connected by two organizations.
  assert.equal(column("cloud_id").isUnique, false);
});

test("[happy-11] connections are indexed by organization", () => {
  const { indexes } = getTableConfig(jiraConnection);
  assert.equal(indexes.length, 1);
  assert.equal(indexes[0]?.config.name, "jira_connection_organization_id_idx");
  assert.deepEqual(
    (indexes[0]?.config.columns ?? []).map((candidate) => nameOf(candidate)),
    ["organization_id"],
  );
});

test("[happy-11] the organization index is not unique", () => {
  const { indexes } = getTableConfig(jiraConnection);
  assert.equal(indexes[0]?.config.unique, false);
});

test("[happy-12] a connection cascades with its organization", () => {
  const { foreignKeys } = getTableConfig(jiraConnection);
  assert.equal(foreignKeys.length, 1);
  assert.equal(foreignKeys[0]?.reference().foreignTable, organization);
  assert.equal(foreignKeys[0]?.onDelete, "cascade");
});

test("[happy-12] the foreign key runs from organization_id to organization.id", () => {
  const reference = getTableConfig(jiraConnection).foreignKeys[0]?.reference();
  assert.deepEqual(
    reference?.columns.map((candidate) => candidate.name),
    ["organization_id"],
  );
  assert.deepEqual(
    reference?.foreignColumns.map((candidate) => candidate.name),
    ["id"],
  );
});

// ---- barrel and entry point -----------------------------------------------

test("[happy-13] every export of schema/jira.ts is the identical value from schema.ts", () => {
  const entries = Object.entries(jiraSchema);
  assert.ok(entries.length >= 1);
  for (const [name, value] of entries) {
    assert.equal(
      (schema as Record<string, unknown>)[name],
      value,
      `schema.ts does not re-export ${name}`,
    );
  }
  assert.equal(schema.jiraConnection, jiraConnection);
});

test("[happy-13] the barrel now holds ten distinct Postgres tables", () => {
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
});

test("[happy-13] Better Auth does not see jiraConnection", () => {
  assert.equal("jiraConnection" in authSchema, false);
  assert.equal(
    Object.values(authSchema).some(
      (table) => (table as unknown) === jiraConnection,
    ),
    false,
  );
});

test("[happy-13] the entry point exports the cipher and the store", () => {
  const exported = index as Record<string, unknown>;
  assert.equal(exported["createTokenCipher"], cipherModule.createTokenCipher);
  assert.equal(exported["sameKeyId"], cipherModule.sameKeyId);
  assert.equal(exported["TokenCipherError"], cipherModule.TokenCipherError);
  assert.equal(
    exported["createJiraConnectionStore"],
    storeModule.createJiraConnectionStore,
  );
});

test("[happy-13] the entry point keeps its existing exports", () => {
  const exported = index as Record<string, unknown>;
  assert.equal(exported["authSchema"], authSchema);
  assert.equal(exported["organization"], organization);
  assert.equal(exported["todos"], schema.todos);
});
