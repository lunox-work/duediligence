/**
 * Jira: the Atlassian sites an organization has connected.
 *
 * `jira_connection` is the `TokenSource` backing store that
 * `packages/jira/src/credentials.ts` names. One row per site per
 * organization, holding the OAuth access/refresh pair as ciphertext only —
 * `JiraConnectionStore` (`jira-connections.ts`) is the only code that reads or
 * writes it.
 *
 * `organization` is imported from `organizations.ts` and used only inside the
 * foreign-key thunk; `organizations.ts` does not import this module back.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
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
    email: text("email"),
    /** Ciphertext only, written by `TokenCipher`. */
    accessToken: text("access_token"),
    /** Ciphertext only, written by `TokenCipher`. */
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    healthy: boolean("healthy").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One connection per site per organization. `organization_id` leads, so
    // this also serves the `list` query and the table needs no other index.
    unique("jira_connection_organization_cloud_unique").on(
      table.organizationId,
      table.cloudId,
    ),
  ],
);

export type JiraConnectionRow = typeof jiraConnection.$inferSelect;
export type NewJiraConnectionRow = typeof jiraConnection.$inferInsert;
