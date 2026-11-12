/**
 * The Jira board store.
 *
 * Registers boards from an organization's Jira connections and stores for each
 * board the selection a run uses to choose its oldest backlog tickets. Follows
 * `createJiraConnectionStore`: every method takes the organization id first
 * and puts it in the `WHERE` clause, and another organization's board is a
 * miss (`null` / `false`), never an error. The store does not query Jira.
 */

import { and, desc, eq } from "drizzle-orm";

import { generateId } from "./mapping.js";
import { jiraBoard, jiraConnection } from "./schema.js";
import type { JiraBoardRow } from "./schema.js";
import type { Database } from "./store.js";

/** The stored selection a run reads a board's tickets by. */
export interface StoredBoardSelection {
  readonly maxTickets?: number;
  readonly excludeAssigned?: boolean;
  readonly issueTypes?: readonly string[];
  readonly minAgeDays?: number;
  readonly maxAgeDays?: number | null;
  readonly minSpecChars?: number;
}

/** A registered board: the row mapped field by field, `createdAt` as ISO. */
export interface JiraBoardSummary {
  readonly id: string;
  readonly connectionId: string;
  readonly externalId: string;
  readonly name: string;
  readonly boardType: string;
  readonly projectKey: string | null;
  readonly selection: StoredBoardSelection;
  readonly writebackEnabled: boolean;
  readonly createdAt: string;
}

/** What registering a board from a Jira connection records. */
export interface RegisterBoardInput {
  readonly connectionId: string;
  readonly externalId: string;
  readonly name: string;
  readonly boardType: string;
  readonly projectKey?: string | null;
  readonly selection?: StoredBoardSelection;
}

/** A change to a board's selection or write-back. */
export interface UpdateBoardInput {
  readonly selection?: StoredBoardSelection;
  readonly writebackEnabled?: boolean;
}

export interface JiraBoardStore {
  /** The organization's boards, in the order the query returns them. */
  list(organizationId: string): Promise<JiraBoardSummary[]>;
  /** One owned board, or null on a miss. */
  get(
    organizationId: string,
    boardId: string,
  ): Promise<JiraBoardSummary | null>;
  /**
   * Registers a board, updating it in place when the same Jira board is
   * registered again on the same connection.
   *
   * Throws `Error("Failed to register the Jira board.")` when the upsert
   * returns no row; database errors are passed through unchanged.
   */
  register(
    organizationId: string,
    input: RegisterBoardInput,
  ): Promise<JiraBoardSummary>;
  /** Merges a selection and sets write-back on an owned board; null on a miss. */
  update(
    organizationId: string,
    boardId: string,
    input: UpdateBoardInput,
  ): Promise<JiraBoardSummary | null>;
  /** Deletes an owned board, reporting whether a row went. */
  remove(organizationId: string, boardId: string): Promise<boolean>;
  /**
   * What a run needs: the board, its selection, and the connection's id,
   * `cloudId` and `siteUrl`. Null on a miss.
   */
  forRun(
    organizationId: string,
    boardId: string,
  ): Promise<{
    board: JiraBoardSummary;
    connectionId: string;
    cloudId: string;
    siteUrl: string;
  } | null>;
}

/** Builds the Jira board store over a database. */
export function createJiraBoardStore(db: Database): JiraBoardStore {
  return {
    async list(organizationId) {
      const rows = (await db
        .select()
        .from(jiraBoard)
        .where(eq(jiraBoard.organizationId, organizationId))
        .orderBy(desc(jiraBoard.createdAt))) as JiraBoardRow[];
      return rows.map(toSummary);
    },

    async get(organizationId, boardId) {
      const row = await first(db, organizationId, boardId);
      return row === undefined ? null : toSummary(row);
    },

    async register(organizationId, input) {
      // Written as given: no trimming and no checks. Write-back is left out so
      // a new board takes the column default (off) and a re-registration
      // keeps whatever the user set.
      const values = {
        organizationId,
        connectionId: input.connectionId,
        externalId: input.externalId,
        name: input.name,
        boardType: input.boardType,
        projectKey: input.projectKey ?? null,
        selection: input.selection ?? {},
        updatedAt: new Date(),
      };

      const [row] = (await db
        .insert(jiraBoard)
        .values({ id: generateId("jrb"), ...values })
        .onConflictDoUpdate({
          target: [jiraBoard.connectionId, jiraBoard.externalId],
          set: values,
        })
        .returning()) as JiraBoardRow[];

      if (row === undefined) {
        throw new Error("Failed to register the Jira board.");
      }
      return toSummary(row);
    },

    async update(organizationId, boardId, input) {
      const current = await first(db, organizationId, boardId);
      if (current === undefined) {
        return null;
      }

      const values = {
        // Merged key by key, so `{}` or no selection leaves it as it was.
        selection: { ...readSelection(current), ...input.selection },
        ...(input.writebackEnabled === undefined
          ? {}
          : { writebackEnabled: input.writebackEnabled }),
        updatedAt: new Date(),
      };

      // Owner-scoped again: a board removed since the read matches no row, and
      // the result is a miss rather than the board brought back.
      const [row] = (await db
        .update(jiraBoard)
        .set(values)
        .where(
          and(
            eq(jiraBoard.organizationId, organizationId),
            eq(jiraBoard.id, boardId),
          ),
        )
        .returning()) as JiraBoardRow[];
      return row === undefined ? null : toSummary(row);
    },

    async remove(organizationId, boardId) {
      const removed = (await db
        .delete(jiraBoard)
        .where(
          and(
            eq(jiraBoard.organizationId, organizationId),
            eq(jiraBoard.id, boardId),
          ),
        )
        .returning()) as JiraBoardRow[];
      return removed.length > 0;
    },

    async forRun(organizationId, boardId) {
      const rows = (await db
        .select()
        .from(jiraBoard)
        .innerJoin(jiraConnection, eq(jiraBoard.connectionId, jiraConnection.id))
        .where(
          and(
            eq(jiraBoard.organizationId, organizationId),
            eq(jiraBoard.id, boardId),
          ),
        )) as Array<{
        jira_board: JiraBoardRow;
        jira_connection: { id: string; cloudId: string; siteUrl: string };
      }>;
      const [joined] = rows;
      if (joined === undefined) {
        return null;
      }
      // Only these three connection fields: no token material leaves here.
      return {
        board: toSummary(joined.jira_board),
        connectionId: joined.jira_connection.id,
        cloudId: joined.jira_connection.cloudId,
        siteUrl: joined.jira_connection.siteUrl,
      };
    },
  };
}

/** The row mapped field by field, without `organizationId` or `updatedAt`. */
function toSummary(row: JiraBoardRow): JiraBoardSummary {
  return {
    id: row.id,
    connectionId: row.connectionId,
    externalId: row.externalId,
    name: row.name,
    boardType: row.boardType,
    projectKey: row.projectKey,
    selection: readSelection(row),
    writebackEnabled: row.writebackEnabled,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The stored selection as stored, unchecked; only null reads as `{}`. */
function readSelection(row: JiraBoardRow): StoredBoardSelection {
  return (row.selection ?? {}) as StoredBoardSelection;
}

/** One row, scoped to its owner. Both predicates, always. */
async function first(
  db: Database,
  organizationId: string,
  boardId: string,
): Promise<JiraBoardRow | undefined> {
  const rows = (await db
    .select()
    .from(jiraBoard)
    .where(
      and(
        eq(jiraBoard.organizationId, organizationId),
        eq(jiraBoard.id, boardId),
      ),
    )) as JiraBoardRow[];
  return rows[0];
}
