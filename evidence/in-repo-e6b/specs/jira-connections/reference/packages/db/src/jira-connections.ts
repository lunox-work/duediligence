/**
 * The Jira connection store: the only code that reads or writes
 * `jira_connection`.
 *
 * Tokens pass through `TokenCipher` on the way in and out, so only ciphertext
 * is written. Listing a connection never decrypts anything; only `tokens()`
 * does.
 */

import { and, eq, sql } from "drizzle-orm";

import type { TokenCipher } from "./cipher.js";
import { generateId } from "./mapping.js";
import { jiraConnection, type JiraConnectionRow } from "./schema/jira.js";
import type { Database } from "./store.js";

/** A connection as it is listed: no organization id, no tokens, no expiry. */
export interface JiraConnectionSummary {
  readonly id: string;
  readonly cloudId: string;
  readonly siteUrl: string;
  readonly siteName: string;
  readonly email: string | null;
  readonly healthy: boolean;
  readonly scopes: readonly string[];
  /** `toISOString()` of the row's `createdAt`. */
  readonly createdAt: string;
}

/** The decrypted token set of one connection. */
export interface JiraConnectionTokens {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  /** `toISOString()` of the row's `expiresAt`, or `null`. */
  readonly expiresAt: string | null;
  readonly scopes: readonly string[];
}

/** What `upsert` writes for one (organization, cloudId). */
export interface JiraConnectionInput {
  readonly cloudId: string;
  readonly siteUrl: string;
  readonly siteName: string;
  /** Omitted or `undefined` is stored as `null`. */
  readonly email?: string | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  /** ISO 8601 with an offset, or `null`. */
  readonly expiresAt: string | null;
  readonly scopes: readonly string[];
}

export interface JiraConnectionStore {
  /** The organization's connections, `createdAt` ascending, ties by `id`. */
  list(organizationId: string): Promise<JiraConnectionSummary[]>;
  /** One connection, or `null` when missing or another organization's. */
  get(
    organizationId: string,
    connectionId: string,
  ): Promise<JiraConnectionSummary | null>;
  /**
   * The decrypted tokens of one connection, or `null` when missing or another
   * organization's. Rejects with the `TokenCipherError` when a stored token
   * cannot be decrypted.
   */
  tokens(
    organizationId: string,
    connectionId: string,
  ): Promise<JiraConnectionTokens | null>;
  /**
   * Inserts the connection, or updates the one with the same (organization,
   * cloudId), keeping its `id` and `createdAt`; sets `healthy` to `true`.
   *
   * Rejects with `RangeError` before any query when `cloudId`, `siteUrl` or
   * `siteName` is blank or `expiresAt` is not ISO 8601 with an offset, and
   * with `Error("Upsert returned no row.")` when the insert returns no row.
   */
  upsert(
    organizationId: string,
    input: JiraConnectionInput,
  ): Promise<JiraConnectionSummary>;
  /**
   * Replaces the token set by connection id and marks the connection healthy.
   * A no-op for an unknown id. Rejects with `RangeError` before any query
   * when `expiresAt` is not ISO 8601 with an offset.
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
  /** Deletes within the organization; `true` when a row was deleted. */
  remove(organizationId: string, connectionId: string): Promise<boolean>;
}

/** The `JiraConnectionStore` over Drizzle, encrypting tokens with `cipher`. */
export function createJiraConnectionStore(
  db: Database,
  cipher: TokenCipher,
): JiraConnectionStore {
  const findOne = async (
    organizationId: string,
    connectionId: string,
  ): Promise<JiraConnectionRow | undefined> => {
    // Both predicates, always: `id` alone would serve another organization's
    // connection to a guessed id.
    const [row] = await db
      .select()
      .from(jiraConnection)
      .where(
        and(
          eq(jiraConnection.organizationId, organizationId),
          eq(jiraConnection.id, connectionId),
        ),
      )
      .limit(1);
    return row;
  };

  return {
    async list(organizationId) {
      const rows = await db
        .select()
        .from(jiraConnection)
        .where(eq(jiraConnection.organizationId, organizationId));
      // Sorted here rather than in SQL because the fake databases used by the
      // tests do not interpret `orderBy`.
      return rows
        .slice()
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            // Ids are unique, so code-unit order never ties.
            (a.id < b.id ? -1 : 1),
        )
        .map(rowToSummary);
    },

    async get(organizationId, connectionId) {
      const row = await findOne(organizationId, connectionId);
      return row === undefined ? null : rowToSummary(row);
    },

    async tokens(organizationId, connectionId) {
      const row = await findOne(organizationId, connectionId);
      if (row === undefined) return null;
      return {
        accessToken: cipher.decrypt(row.accessToken),
        refreshToken: cipher.decrypt(row.refreshToken),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        scopes: row.scopes,
      };
    },

    async upsert(organizationId, input) {
      requireNonBlank("cloudId", input.cloudId);
      requireNonBlank("siteUrl", input.siteUrl);
      requireNonBlank("siteName", input.siteName);
      const expiresAt = parseExpiresAt(input.expiresAt);

      const fields = {
        siteUrl: input.siteUrl,
        siteName: input.siteName,
        email: input.email ?? null,
        accessToken: cipher.encrypt(input.accessToken),
        refreshToken: cipher.encrypt(input.refreshToken),
        expiresAt,
        scopes: [...input.scopes],
        healthy: true,
      };

      // One statement, never select-then-insert, so overlapping calls for the
      // same site converge on one row.
      const [row] = await db
        .insert(jiraConnection)
        .values({
          id: generateId("jrc"),
          organizationId,
          cloudId: input.cloudId,
          ...fields,
        })
        .onConflictDoUpdate({
          target: [jiraConnection.organizationId, jiraConnection.cloudId],
          set: { ...fields, updatedAt: sql`now()` },
        })
        .returning();
      if (row === undefined) throw new Error("Upsert returned no row.");
      return rowToSummary(row);
    },

    async saveTokens(connectionId, tokens) {
      const expiresAt = parseExpiresAt(tokens.expiresAt);
      await db
        .update(jiraConnection)
        .set({
          accessToken: cipher.encrypt(tokens.accessToken),
          refreshToken: cipher.encrypt(tokens.refreshToken),
          expiresAt,
          scopes: [...tokens.scopes],
          healthy: true,
          updatedAt: sql`now()`,
        })
        .where(eq(jiraConnection.id, connectionId));
    },

    async markUnhealthy(connectionId) {
      await db
        .update(jiraConnection)
        .set({ healthy: false, updatedAt: sql`now()` })
        .where(eq(jiraConnection.id, connectionId));
    },

    async remove(organizationId, connectionId) {
      const rows = await db
        .delete(jiraConnection)
        .where(
          and(
            eq(jiraConnection.organizationId, organizationId),
            eq(jiraConnection.id, connectionId),
          ),
        )
        .returning({ id: jiraConnection.id });
      return rows.length > 0;
    },
  };
}

/** ISO 8601 date and time with a mandatory `Z` or `±hh:mm` offset. */
const EXPIRES_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** The listed shape: exactly eight keys, nothing secret. */
function rowToSummary(row: JiraConnectionRow): JiraConnectionSummary {
  return {
    id: row.id,
    cloudId: row.cloudId,
    siteUrl: row.siteUrl,
    siteName: row.siteName,
    email: row.email,
    healthy: row.healthy,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
  };
}

function requireNonBlank(field: string, value: string): void {
  if (value.trim() === "") {
    throw new RangeError(`${field} must not be empty.`);
  }
}

/** `null`, or the `Date` of an ISO 8601 timestamp with an offset. */
function parseExpiresAt(value: string | null): Date | null {
  if (value === null) return null;
  const date = new Date(value);
  if (!EXPIRES_AT_PATTERN.test(value) || Number.isNaN(date.getTime())) {
    throw new RangeError(
      `expiresAt must be an ISO 8601 timestamp with an offset, got "${value}".`,
    );
  }
  return date;
}
