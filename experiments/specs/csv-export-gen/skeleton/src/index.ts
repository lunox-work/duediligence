/** The status a requisition can have: "open", "on_hold", "filled" or "cancelled". */
export type RequisitionStatus = "open" | "on_hold" | "filled" | "cancelled";

/**
 * A requisition, with an id, a title, a status, a number of openings, a
 * number filled and a creation time. Fields are typed loosely enough to
 * carry the bad data the CSV builder must refuse.
 */
export interface Requisition {
  /** The requisition's id. */
  id: string;
  /** The title; a missing title (absent or null) is an empty field. */
  title?: string | null;
  /** Expected to be one of `RequisitionStatus`; any other value is an unknown status. */
  status: string;
  /** The number of openings; must be a whole number of at least 0. */
  openings: number;
  /** The number filled; must be a whole number of at least 0, not greater than openings. */
  filled: number;
  /** The creation time; an invalid Date is an invalid creation time. */
  createdAt: Date;
}

/**
 * Builds the requisitions CSV: a UTF-8 byte order mark, the header row
 * "Requisition ID,Title,Status,Openings,Filled,Created", then one row per
 * requisition in order of creation time, then id, every row ending with "\r\n".
 *
 * Throws an Error naming the requisition's id when a requisition has an
 * unknown status, openings or filled that is not a whole number of at least
 * 0, filled greater than openings, or an invalid creation time.
 */
export function buildRequisitionsCsv(requisitions: readonly Requisition[]): string {
  throw new Error("not implemented");
}
