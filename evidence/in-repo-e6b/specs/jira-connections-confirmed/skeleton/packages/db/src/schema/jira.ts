/**
 * Jira: the Atlassian sites an organization has connected.
 *
 * `jira_connection` is the `TokenSource` backing store that
 * `packages/jira/src/credentials.ts` names. Each row is owned by an
 * organization and holds the OAuth access/refresh pair, encrypted by a
 * `TokenCipher` (`../cipher.ts`): the token columns only ever hold ciphertext,
 * and `JiraConnectionStore` (`../jira-connections.ts`) is the only code that
 * reads or writes the table.
 *
 * `organization` is used only inside the foreign-key thunk, and
 * `organizations.ts` does not import this module back.
 */

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { organization } from "./organizations.js";

export const jiraConnection = pgTable(
  "jira_connection",
  {
    id: text("id").primaryKey(),
    /** The owner. Cascades on organization delete. */
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    cloudId: text("cloud_id").notNull(),
    siteUrl: text("site_url").notNull(),
    siteName: text("site_name").notNull(),
    kind: text("kind").notNull().default("oauth"),
    /** Ciphertext only. */
    accessTokenEnc: text("access_token_enc"),
    /** Ciphertext only. */
    refreshTokenEnc: text("refresh_token_enc"),
    /** The `keyId` of the cipher that wrote the token columns. */
    keyId: text("key_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Space-separated. */
    scopes: text("scopes").notNull().default(""),
    email: text("email"),
    healthy: boolean("healthy").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One connection per site per organization.
    unique("jira_connection_organization_site_unique").on(
      table.organizationId,
      table.cloudId,
    ),
    index("jira_connection_organization_id_idx").on(table.organizationId),
  ],
);

export type JiraConnectionRow = typeof jiraConnection.$inferSelect;
export type NewJiraConnectionRow = typeof jiraConnection.$inferInsert;
