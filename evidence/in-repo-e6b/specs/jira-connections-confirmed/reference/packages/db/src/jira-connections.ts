/**
 * The Jira connection store: the only code that reads or writes
 * `jira_connection`.
 *
 * Tokens pass through the `TokenCipher` on the way in and out, and only the
 * ciphertext is written, together with `cipher.keyId`. Listing a connection
 * never decrypts anything; only `tokens()` does.
 */

import { and, desc, eq } from "drizzle-orm";

import type { TokenCipher } from "./cipher.js";
import { generateId } from "./mapping.js";
import { jiraConnection } from "./schema.js";
import type { JiraConnectionRow } from "./schema.js";
import type { Database } from "./store.js";

/** A connection as it is listed. Carries no tokens. */
export interface JiraConnectionSummary {
  readonly id: string;
  readonly cloudId: string;
  readonly siteUrl: string;
  readonly siteName: string;
  readonly email: string | null;
  readonly healthy: boolean;
  /** The stored scopes split on a single space; `[]` when there are none. */
  readonly scopes: readonly string[];
  /** ISO string, from `toISOString()`. */
  readonly createdAt: string;
}

/** A connection's decrypted token set. */
export interface JiraConnectionTokens {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  /** ISO string, from `toISOString()`, or `null`. */
  readonly expiresAt: string | null;
  readonly scopes: readonly string[];
}

/** What `upsert` writes for one site. Not validated: stored as given. */
export interface JiraConnectionInput {
  readonly cloudId: string;
  readonly siteUrl: string;
  readonly siteName: string;
  /** Omitted or `undefined` is stored as `null`. */
  readonly email?: string | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  /** Stored as `new Date(expiresAt)`, or `null`. */
  readonly expiresAt: string | null;
  /** Stored joined with a single space, in order, duplicates kept. */
  readonly scopes: readonly string[];
}

/**
 * Jira connections, scoped to the organization on every read and on
 * `remove`. Another organization's connection is a miss, like a missing one.
 */
export interface JiraConnectionStore {
  /** The organization's connections, newest first, as the query returns them. */
  list(organizationId: string): Promise<JiraConnectionSummary[]>;
  /** One connection, or `null` when it is missing or another organization's. */
  get(
    organizationId: string,
    connectionId: string,
  ): Promise<JiraConnectionSummary | null>;
  /**
   * The decrypted token set, or `null` when the connection is missing or
   * another organization's.
   *
   * @throws {TokenCipherError} propagated from `cipher.decrypt` when a stored
   *   token cannot be decrypted; nothing is written.
   */
  tokens(
    organizationId: string,
    connectionId: string,
  ): Promise<JiraConnectionTokens | null>;
  /**
   * Records the connection for (organization, `cloudId`): inserts it, or
   * replaces every input field of the existing one, keeping its `id` and
   * `createdAt`. Marks it healthy.
   *
   * @throws {Error} "Failed to record the Jira connection." when the insert
   *   returns no row.
   */
  upsert(
    organizationId: string,
    input: JiraConnectionInput,
  ): Promise<JiraConnectionSummary>;
  /**
   * Replaces the token set by connection id and marks the connection healthy.
   * A no-op for an unknown id.
   */
  saveTokens(
    connectionId: string,
    tokens: {
      readonly accessToken: string | null;
      readonly refreshToken: string | null;
      readonly expiresAt: string | null;
      readonly scopes: readonly string[];
    },
  ): Promise<void>;
  /** Flags a connection unhealthy by id. Idempotent; a no-op for an unknown id. */
  markUnhealthy(connectionId: string): Promise<void>;
  /** Deletes within the organization; whether anything was deleted. */
  remove(organizationId: string, connectionId: string): Promise<boolean>;
}

/** The Postgres `JiraConnectionStore`, encrypting tokens with `cipher`. */
export function createJiraConnectionStore(
  db: Database,
  cipher: TokenCipher,
): JiraConnectionStore {
  /** The token columns as written: ciphertext, the key id, and the rest. */
  function tokenColumns(tokens: {
    readonly accessToken: string | null;
    readonly refreshToken: string | null;
    readonly expiresAt: string | null;
    readonly scopes: readonly string[];
  }) {
    return {
      accessTokenEnc: cipher.encrypt(tokens.accessToken),
      refreshTokenEnc: cipher.encrypt(tokens.refreshToken),
      keyId: cipher.keyId,
      expiresAt: tokens.expiresAt === null ? null : new Date(tokens.expiresAt),
      scopes: tokens.scopes.join(" "),
    };
  }

  function byOrganization(organizationId: string, connectionId: string) {
    return and(
      eq(jiraConnection.organizationId, organizationId),
      eq(jiraConnection.id, connectionId),
    );
  }

  async function find(
    organizationId: string,
    connectionId: string,
  ): Promise<JiraConnectionRow | undefined> {
    const rows = await db
      .select()
      .from(jiraConnection)
      .where(byOrganization(organizationId, connectionId));
    return rows[0];
  }

  return {
    async list(organizationId) {
      const rows = await db
        .select()
        .from(jiraConnection)
        .where(eq(jiraConnection.organizationId, organizationId))
        .orderBy(desc(jiraConnection.createdAt));
      return rows.map(rowToSummary);
    },

    async get(organizationId, connectionId) {
      const row = await find(organizationId, connectionId);
      return row === undefined ? null : rowToSummary(row);
    },

    async tokens(organizationId, connectionId) {
      const row = await find(organizationId, connectionId);
      if (row === undefined) {
        return null;
      }
      return {
        accessToken: cipher.decrypt(row.accessTokenEnc),
        refreshToken: cipher.decrypt(row.refreshTokenEnc),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        scopes: splitScopes(row.scopes),
      };
    },

    async upsert(organizationId, input) {
      const values = {
        organizationId,
        cloudId: input.cloudId,
        siteUrl: input.siteUrl,
        siteName: input.siteName,
        email: input.email ?? null,
        ...tokenColumns(input),
        healthy: true,
        updatedAt: new Date(),
      };
      // One statement, never select-then-insert, so overlapping calls for
      // the same site converge on one row.
      const [row] = await db
        .insert(jiraConnection)
        .values({ id: generateId("jrc"), ...values })
        .onConflictDoUpdate({
          target: [jiraConnection.organizationId, jiraConnection.cloudId],
          set: values,
        })
        .returning();
      if (row === undefined) {
        throw new Error("Failed to record the Jira connection.");
      }
      return rowToSummary(row);
    },

    async saveTokens(connectionId, tokens) {
      const set = {
        ...tokenColumns(tokens),
        healthy: true,
        updatedAt: new Date(),
      };
      await db
        .update(jiraConnection)
        .set(set)
        .where(eq(jiraConnection.id, connectionId));
    },

    async markUnhealthy(connectionId) {
      await db
        .update(jiraConnection)
        .set({ healthy: false, updatedAt: new Date() })
        .where(eq(jiraConnection.id, connectionId));
    },

    async remove(organizationId, connectionId) {
      const deleted = await db
        .delete(jiraConnection)
        .where(byOrganization(organizationId, connectionId))
        .returning();
      return deleted.length > 0;
    },
  };
}

/** The stored space-separated scopes as a list; `""` is none. */
function splitScopes(scopes: string): string[] {
  return scopes === "" ? [] : scopes.split(" ");
}

/** A row as it is listed: never the tokens, so nothing is decrypted. */
function rowToSummary(row: JiraConnectionRow): JiraConnectionSummary {
  return {
    id: row.id,
    cloudId: row.cloudId,
    siteUrl: row.siteUrl,
    siteName: row.siteName,
    email: row.email,
    healthy: row.healthy,
    scopes: splitScopes(row.scopes),
    createdAt: row.createdAt.toISOString(),
  };
}
