/**
 * The Jira board store.
 *
 * Registers boards from an organization's Jira connections and stores for each
 * board the selection a run uses to choose its oldest backlog tickets. Follows
 * `createJiraConnectionStore`: every method takes the organization id first
 * and puts it in the `WHERE` clause, and another organization's board is a
 * miss (`null` / `false`), never an error. The store does not query Jira.
 */

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
export function createJiraBoardStore(_db: Database): JiraBoardStore {
  throw new Error("not implemented");
}
