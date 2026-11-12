/**
 * The Jira board store: the boards an organization has registered from its
 * Jira connections, and for each the *selection* a run uses to choose its
 * oldest backlog tickets.
 *
 * Follows `createJiraConnectionStore`: every method takes the organization id
 * first and puts it in the `WHERE` clause, and another organization's board is
 * a miss (`null` / `false`), never an error that confirms the id exists. The
 * store does not query Jira; `forRun` gives the runner what it needs to.
 */

import type { Database } from "./store.js";

/** The stored selection a run reads a board by. */
export interface StoredBoardSelection {
  readonly maxTickets?: number;
  readonly excludeAssigned?: boolean;
  readonly issueTypes?: readonly string[];
  readonly minAgeDays?: number;
  readonly maxAgeDays?: number | null;
  readonly minSpecChars?: number;
}

/** A registered board as callers see it. */
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

/** The fields of a registered board an update may change. */
export interface UpdateBoardInput {
  readonly selection?: StoredBoardSelection;
  readonly writebackEnabled?: boolean;
}

/** The board store, scoped to one organization on every call. */
export interface JiraBoardStore {
  /** The organization's boards, newest createdAt first, ties by id ascending. */
  list(organizationId: string): Promise<JiraBoardSummary[]>;
  /** One board, filtered on both the organization and the board id; a miss is null. */
  get(organizationId: string, boardId: string): Promise<JiraBoardSummary | null>;
  /**
   * Registers a board, or updates it in place when the same Jira board is
   * registered again on the same connection.
   *
   * Rejects with `InvalidJiraBoardError` before any database call when the
   * input is invalid, with `JiraConnectionNotFoundError` when the connection
   * is missing or belongs to another organization, and with an `Error`
   * ("Failed to record the Jira board.") when the upsert returns no row.
   */
  register(
    organizationId: string,
    input: RegisterBoardInput,
  ): Promise<JiraBoardSummary>;
  /**
   * Replaces the selection whole and/or sets write-back; a miss is null.
   *
   * Rejects with `InvalidJiraBoardError` before any database call when the
   * input is invalid.
   */
  update(
    organizationId: string,
    boardId: string,
    input: UpdateBoardInput,
  ): Promise<JiraBoardSummary | null>;
  /** Deletes the board with both predicates; reports whether a row went. */
  remove(organizationId: string, boardId: string): Promise<boolean>;
  /**
   * The board, its selection, and the connection's id, `cloudId` and
   * `siteUrl`, read in one owner-scoped query; a miss is null.
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

/** The most tickets one run may take from a board. */
export const BOARD_MAX_TICKETS_LIMIT = 100;

/** Which input field failed validation. */
export type InvalidJiraBoardField =
  | "externalId"
  | "name"
  | "maxTickets"
  | "excludeAssigned"
  | "issueTypes"
  | "minAgeDays"
  | "maxAgeDays"
  | "minSpecChars"
  | "writebackEnabled";

/**
 * Thrown by register/update/normalizeBoardSelection before any database call.
 * Its `name` is "InvalidJiraBoardError".
 */
export class InvalidJiraBoardError extends Error {
  readonly field: InvalidJiraBoardField;

  constructor(_field: InvalidJiraBoardField, _message: string) {
    super();
    throw new Error("not implemented");
  }
}

/**
 * Thrown by register when the connection is missing or belongs to another
 * organization. Its `name` is "JiraConnectionNotFoundError" and its message
 * `No Jira connection with id "${connectionId}".`
 */
export class JiraConnectionNotFoundError extends Error {
  constructor(_connectionId: string) {
    super();
    throw new Error("not implemented");
  }
}

/**
 * Validates and normalizes a selection; pure, and does not mutate its input.
 * Throws `InvalidJiraBoardError` naming the first failing field.
 */
export function normalizeBoardSelection(
  _selection: StoredBoardSelection,
): StoredBoardSelection {
  throw new Error("not implemented");
}

/** The Postgres `JiraBoardStore`. */
export function createJiraBoardStore(_db: Database): JiraBoardStore {
  throw new Error("not implemented");
}
