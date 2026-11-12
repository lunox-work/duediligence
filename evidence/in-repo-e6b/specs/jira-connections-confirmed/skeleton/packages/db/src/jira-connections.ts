/**
 * The Jira connection store: the only code that reads or writes
 * `jira_connection`.
 *
 * Tokens pass through the `TokenCipher` on the way in and out, and only the
 * ciphertext is written, together with `cipher.keyId`. Listing a connection
 * never decrypts anything; only `tokens()` does.
 */

import type { TokenCipher } from "./cipher.js";
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
  _db: Database,
  _cipher: TokenCipher,
): JiraConnectionStore {
  throw new Error("not implemented");
}
