/**
 * Row <-> domain mapping. Pure and separate from the store, so timestamp
 * conversion and id generation are testable without Postgres.
 */

import { normalizeTitle, type Todo } from "sandbox-factory";

import type { NewTodoRow, TodoRow } from "./schema.js";

/** Turns a database row into the domain `Todo`. */
export function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    done: row.done,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Builds the row for a new todo. Normalizes the title here as well as at the
 * HTTP edge, so a direct store caller cannot write an invalid one.
 */
export function newTodoRow(
  userId: string,
  title: string,
  id: string = generateId(),
): NewTodoRow {
  return { id, userId, title: normalizeTitle(title), done: false };
}

/**
 * The closed, ordered list of prefixes `generateId` accepts. Exported as
 * declared, not frozen.
 */
export const ID_PREFIXES = ["todo", "jrc", "jrb", "jri", "brn", "bpr"] as const;

/** One of the six `ID_PREFIXES`. */
export type IdPrefix = (typeof ID_PREFIXES)[number];

/**
 * Generated in the application, not by a sequence: `create` stays one round
 * trip and ids stay collision-free across replicas.
 *
 * Returns `${prefix}_${crypto.randomUUID()}`; with no argument (or
 * `undefined`) the prefix is `"todo"`. Throws a `RangeError` with message
 * `Unknown id prefix: ${JSON.stringify(prefix)}` when `prefix` is not
 * strictly equal to one of `ID_PREFIXES`, and generates nothing.
 */
export function generateId(prefix: IdPrefix = "todo"): string {
  // Checked at runtime too: the type alone does not stop a cast or an
  // untyped caller from minting ids with an unlisted prefix.
  if (!(ID_PREFIXES as readonly unknown[]).includes(prefix)) {
    throw new RangeError(`Unknown id prefix: ${JSON.stringify(prefix)}`);
  }
  return `${prefix}_${crypto.randomUUID()}`;
}
