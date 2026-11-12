/**
 * The Drizzle schema, re-exported from `schema/`.
 *
 * **This file stays the single entry point on purpose.** `drizzle.config.ts`
 * names it, `drizzleAdapter` is handed the tables from it, and every store
 * imports from it — so the split below is an internal reorganisation that
 * nothing outside this package can observe. Keep it a barrel: a table declared
 * here rather than in a module beneath would be invisible to anyone reading
 * `schema/`, which is where the tables now live.
 *
 * One module per bounded area, split when the file reached 373 lines and the
 * Jira and commercials tables were about to be added to it:
 *
 * - `schema/auth.ts` — Better Auth's four tables, plus `user_email`.
 * - `schema/organizations.ts` — the second principal and its membership.
 * - `schema/jira.ts` — connections to a client's Atlassian site.
 * - `schema/todos.ts` — the reference surface.
 *
 * `auth.ts` and `organizations.ts` import each other; see the note in
 * `organizations.ts` for why the foreign-key thunks make that safe.
 */

export {
  account,
  session,
  user,
  userEmail,
  verification,
} from "./schema/auth.js";
export type {
  AccountRow,
  NewUserEmailRow,
  SessionRow,
  UserEmailRow,
  UserRow,
  VerificationRow,
} from "./schema/auth.js";

export { invitation, member, organization } from "./schema/organizations.js";
export type {
  InvitationRow,
  MemberRow,
  NewMemberRow,
  NewOrganizationRow,
  OrganizationRow,
} from "./schema/organizations.js";

export { jiraConnection } from "./schema/jira.js";
export type { JiraConnectionRow, NewJiraConnectionRow } from "./schema/jira.js";

export { todos } from "./schema/todos.js";
export type { NewTodoRow, TodoRow } from "./schema/todos.js";

// ---------------------------------------------------------------------------
// The registered Jira board. The spec places this table in `schema/jira.ts`,
// beside `jiraConnection`, with this barrel re-exporting it as
// `export { jiraBoard, jiraConnection } from "./schema/jira.js";`. It is
// declared here only because the contract may touch nothing but this file;
// the implementation moves it to `schema/jira.ts` unchanged.
// ---------------------------------------------------------------------------

import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { jiraConnection as jiraConnectionTable } from "./schema/jira.js";
import { organization as organizationTable } from "./schema/organizations.js";

/**
 * A board registered from one of an organization's Jira connections, with the
 * selection a run uses to choose its oldest backlog tickets. Unique per Jira
 * board per connection.
 */
export const jiraBoard = pgTable(
  "jira_board",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => jiraConnectionTable.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    boardType: text("board_type").notNull(),
    projectKey: text("project_key"),
    selection: jsonb("selection").notNull().default({}),
    writebackEnabled: boolean("writeback_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("jira_board_connection_external_unique").on(
      table.connectionId,
      table.externalId,
    ),
    index("jira_board_organization_id_idx").on(table.organizationId),
  ],
);

/** A `jira_board` row as read. */
export type JiraBoardRow = typeof jiraBoard.$inferSelect;
/** A `jira_board` row as inserted. */
export type NewJiraBoardRow = typeof jiraBoard.$inferInsert;
