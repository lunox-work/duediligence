/**
 * The Jira connection store: the only code that reads or writes
 * `jira_connection`.
 *
 * Tokens pass through `TokenCipher` on the way in and out, so only ciphertext
 * is written. Listing a connection never decrypts anything; only `tokens()`
 * does.
 */

import type { TokenCipher } from "./cipher.js";
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
  _db: Database,
  _cipher: TokenCipher,
): JiraConnectionStore {
  throw new Error("not implemented");
}
