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

import { and, desc, eq } from "drizzle-orm";

import { generateId } from "./mapping.js";
import { jiraBoard, jiraConnection } from "./schema.js";
import type { JiraBoardRow } from "./schema.js";
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

  constructor(field: InvalidJiraBoardField, message: string) {
    super(message);
    this.name = "InvalidJiraBoardError";
    this.field = field;
  }
}

/**
 * Thrown by register when the connection is missing or belongs to another
 * organization. Its `name` is "JiraConnectionNotFoundError" and its message
 * `No Jira connection with id "${connectionId}".`
 */
export class JiraConnectionNotFoundError extends Error {
  constructor(connectionId: string) {
    super(`No Jira connection with id "${connectionId}".`);
    this.name = "JiraConnectionNotFoundError";
  }
}

/** The selection keys, in the order they are validated. */
type SelectionKey = Exclude<
  InvalidJiraBoardField,
  "externalId" | "name" | "writebackEnabled"
>;

/** Marks a value that fails its key's rule. */
const INVALID = Symbol("invalid");

/**
 * One rule per selection key: the normal form of a valid value, `undefined`
 * when the key normalizes to absent, or `INVALID`. Shared by the strict write
 * path and the lenient read path, so the two cannot drift apart.
 */
const SELECTION_RULES: ReadonlyArray<
  readonly [SelectionKey, string, (value: unknown) => unknown]
> = [
  [
    "maxTickets",
    `maxTickets must be a whole number from 1 to ${BOARD_MAX_TICKETS_LIMIT}.`,
    (value) =>
      isWholeNumber(value) && value >= 1 && value <= BOARD_MAX_TICKETS_LIMIT
        ? value
        : INVALID,
  ],
  [
    "excludeAssigned",
    "excludeAssigned must be true or false.",
    (value) => (typeof value === "boolean" ? value : INVALID),
  ],
  [
    "issueTypes",
    "issueTypes must be a list of non-empty names.",
    normalizeIssueTypes,
  ],
  [
    "minAgeDays",
    "minAgeDays must be a whole number of days, 0 or more.",
    (value) => (isWholeNumber(value) && value >= 0 ? value : INVALID),
  ],
  [
    "maxAgeDays",
    "maxAgeDays must be null or a whole number of days, 0 or more.",
    (value) =>
      value === null || (isWholeNumber(value) && value >= 0) ? value : INVALID,
  ],
  [
    "minSpecChars",
    "minSpecChars must be a whole number, 0 or more.",
    (value) => (isWholeNumber(value) && value >= 0 ? value : INVALID),
  ],
];

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Trimmed, exact duplicates dropped with the first occurrence kept in place,
 * case-sensitively. An empty list means no restriction and reads as absent.
 */
function normalizeIssueTypes(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return INVALID;
  }
  const names: string[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return INVALID;
    }
    const name = entry.trim();
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return names.length === 0 ? undefined : names;
}

/**
 * Applies every key's rule to `selection`. Strict throws on the first failing
 * key in interface order and then checks `maxAgeDays ≥ minAgeDays`; lenient
 * drops a failing key and skips the cross-field check.
 */
function applySelectionRules(
  selection: Readonly<Record<string, unknown>>,
  strict: boolean,
): StoredBoardSelection {
  const normalized: Record<string, unknown> = {};
  for (const [key, message, rule] of SELECTION_RULES) {
    const raw = selection[key];
    if (raw === undefined) {
      continue;
    }
    const value = rule(raw);
    if (value === INVALID) {
      if (strict) {
        throw new InvalidJiraBoardError(key, message);
      }
      continue;
    }
    if (value !== undefined) {
      normalized[key] = value;
    }
  }

  const { minAgeDays, maxAgeDays } = normalized;
  if (
    strict &&
    typeof minAgeDays === "number" &&
    typeof maxAgeDays === "number" &&
    maxAgeDays < minAgeDays
  ) {
    throw new InvalidJiraBoardError(
      "maxAgeDays",
      "maxAgeDays cannot be less than minAgeDays.",
    );
  }
  return normalized as StoredBoardSelection;
}

/**
 * Validates and normalizes a selection; pure, and does not mutate its input.
 * Throws `InvalidJiraBoardError` naming the first failing field.
 */
export function normalizeBoardSelection(
  selection: StoredBoardSelection,
): StoredBoardSelection {
  return applySelectionRules(
    selection as Readonly<Record<string, unknown>>,
    true,
  );
}

/**
 * A stored selection, read leniently: the column is trusted no further than
 * the rules allow, so a bad value reads as absent rather than failing a read.
 */
function sanitizeStoredSelection(stored: unknown): StoredBoardSelection {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return {};
  }
  return applySelectionRules(stored as Readonly<Record<string, unknown>>, false);
}

function toSummary(row: JiraBoardRow): JiraBoardSummary {
  return {
    id: row.id,
    connectionId: row.connectionId,
    externalId: row.externalId,
    name: row.name,
    boardType: row.boardType,
    projectKey: row.projectKey,
    selection: sanitizeStoredSelection(row.selection),
    writebackEnabled: row.writebackEnabled,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Newest createdAt first, ties by id ascending. */
function newestFirst(a: JiraBoardRow, b: JiraBoardRow): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) {
    return byTime;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A required string, trimmed; empty after trimming throws. */
function requiredText(
  value: unknown,
  field: "externalId" | "name",
  message: string,
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") {
    throw new InvalidJiraBoardError(field, message);
  }
  return text;
}

/** The validated, normalized columns a registration writes. */
function normalizeRegistration(input: RegisterBoardInput) {
  const externalId = requiredText(
    input.externalId,
    "externalId",
    "A board needs its Jira id.",
  );
  const name = requiredText(input.name, "name", "A board needs a name.");
  const selection =
    input.selection === undefined
      ? undefined
      : normalizeBoardSelection(input.selection);
  const boardType = (input.boardType ?? "").trim();
  const projectKey = (input.projectKey ?? "").trim();
  return {
    externalId,
    name,
    boardType: boardType === "" ? "unknown" : boardType,
    projectKey: projectKey === "" ? null : projectKey,
    selection,
  };
}

/** The validated columns an update writes; an empty object writes nothing. */
function normalizeUpdate(
  input: UpdateBoardInput,
): { selection?: StoredBoardSelection; writebackEnabled?: boolean } {
  const values: { selection?: StoredBoardSelection; writebackEnabled?: boolean } =
    {};
  if (input.selection !== undefined) {
    values.selection = normalizeBoardSelection(input.selection);
  }
  if (input.writebackEnabled !== undefined) {
    if (typeof input.writebackEnabled !== "boolean") {
      throw new InvalidJiraBoardError(
        "writebackEnabled",
        "writebackEnabled must be true or false.",
      );
    }
    values.writebackEnabled = input.writebackEnabled;
  }
  return values;
}

/** Both predicates, always: the owner and the board. */
function ownedBoard(organizationId: string, boardId: string) {
  return and(
    eq(jiraBoard.organizationId, organizationId),
    eq(jiraBoard.id, boardId),
  );
}

/** The Postgres `JiraBoardStore`. */
export function createJiraBoardStore(db: Database): JiraBoardStore {
  async function get(
    organizationId: string,
    boardId: string,
  ): Promise<JiraBoardSummary | null> {
    const rows = (await db
      .select()
      .from(jiraBoard)
      .where(ownedBoard(organizationId, boardId))) as JiraBoardRow[];
    const row = rows[0];
    return row === undefined ? null : toSummary(row);
  }

  return {
    async list(organizationId) {
      const rows = (await db
        .select()
        .from(jiraBoard)
        .where(eq(jiraBoard.organizationId, organizationId))
        .orderBy(desc(jiraBoard.createdAt), jiraBoard.id)) as JiraBoardRow[];
      // Sorted here as well as in SQL, as `organizations.ts` does: the order
      // is part of the contract, not an accident of the query plan.
      return rows.slice().sort(newestFirst).map(toSummary);
    },

    get,

    async register(organizationId, input) {
      // Everything is validated before the first query, so a bad input never
      // costs a round trip or leaks whether the connection exists.
      const { selection, ...details } = normalizeRegistration(input);

      const connections = await db
        .select({ id: jiraConnection.id })
        .from(jiraConnection)
        .where(
          and(
            eq(jiraConnection.organizationId, organizationId),
            eq(jiraConnection.id, input.connectionId),
          ),
        );
      if (connections.length === 0) {
        throw new JiraConnectionNotFoundError(input.connectionId);
      }

      // Re-registering refreshes what Jira owns (name, type, project) and
      // replaces the selection only when one is given. Write-back, id and
      // createdAt are the board's own and survive. Overlapping registrations
      // meet at the conflict target rather than racing a read.
      const [row] = (await db
        .insert(jiraBoard)
        .values({
          id: generateId("jrb"),
          organizationId,
          connectionId: input.connectionId,
          ...details,
          selection: selection ?? {},
          writebackEnabled: false,
        })
        .onConflictDoUpdate({
          target: [jiraBoard.connectionId, jiraBoard.externalId],
          set: {
            ...details,
            ...(selection === undefined ? {} : { selection }),
            updatedAt: new Date(),
          },
        })
        .returning()) as JiraBoardRow[];

      if (row === undefined) {
        throw new Error("Failed to record the Jira board.");
      }
      return toSummary(row);
    },

    async update(organizationId, boardId, input) {
      const values = normalizeUpdate(input);
      // An empty update reads instead of writing, as `TodoStore.update` does.
      if (Object.keys(values).length === 0) {
        return get(organizationId, boardId);
      }
      // No read first: a board removed by an overlapping call matches no row
      // here, and the update returns null rather than bringing it back.
      const [row] = (await db
        .update(jiraBoard)
        .set({ ...values, updatedAt: new Date() })
        .where(ownedBoard(organizationId, boardId))
        .returning()) as JiraBoardRow[];
      return row === undefined ? null : toSummary(row);
    },

    async remove(organizationId, boardId) {
      const removed = (await db
        .delete(jiraBoard)
        .where(ownedBoard(organizationId, boardId))
        .returning()) as JiraBoardRow[];
      return removed.length > 0;
    },

    async forRun(organizationId, boardId) {
      // One owner-scoped join. Connection health is the runner's concern: it
      // learns of a refused credential from Atlassian, with a clearer error.
      const rows = (await db
        .select({
          board: jiraBoard,
          cloudId: jiraConnection.cloudId,
          siteUrl: jiraConnection.siteUrl,
        })
        .from(jiraBoard)
        .innerJoin(jiraConnection, eq(jiraBoard.connectionId, jiraConnection.id))
        .where(ownedBoard(organizationId, boardId))) as {
        board: JiraBoardRow;
        cloudId: string;
        siteUrl: string;
      }[];
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      return {
        board: toSummary(row.board),
        connectionId: row.board.connectionId,
        cloudId: row.cloudId,
        siteUrl: row.siteUrl,
      };
    },
  };
}
