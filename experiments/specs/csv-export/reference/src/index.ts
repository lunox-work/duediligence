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

const BOM = "﻿";
const HEADER = ["Requisition ID", "Title", "Status", "Openings", "Filled", "Created"];
const ROW_END = "\r\n";

const STATUS_LABELS: ReadonlyMap<string, string> = new Map([
  ["open", "Open"],
  ["on_hold", "On hold"],
  ["filled", "Filled"],
  ["cancelled", "Cancelled"],
]);

const FORMULA_STARTS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Wraps a field in double quotes, doubling inner ones, when it holds a separator or edge spaces. */
function quote(field: string): string {
  const needsQuotes = /[",\r\n]/.test(field) || field.startsWith(" ") || field.endsWith(" ");
  return needsQuotes ? `"${field.replaceAll('"', '""')}"` : field;
}

/** Puts a single quote before a title whose first character would start a formula. */
function defuse(field: string): string {
  return field.length > 0 && FORMULA_STARTS.has(field[0]) ? `'${field}` : field;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Writes a whole number as plain digits, never grouped or in exponent form. */
function formatCount(value: number): string {
  return BigInt(value).toString();
}

/** Writes the UTC date of a time as "YYYY-MM-DD". */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const yyyy = (year < 0 ? "-" : "") + String(Math.abs(year)).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function validate(requisition: Requisition): void {
  const { id, status, openings, filled, createdAt } = requisition;
  if (typeof status !== "string" || !STATUS_LABELS.has(status)) {
    throw new Error(`Requisition ${id} has an unknown status: ${String(status)}`);
  }
  if (!isCount(openings)) {
    throw new Error(`Requisition ${id} has openings that are not a whole number of at least 0: ${String(openings)}`);
  }
  if (!isCount(filled)) {
    throw new Error(`Requisition ${id} has filled that is not a whole number of at least 0: ${String(filled)}`);
  }
  if (filled > openings) {
    throw new Error(`Requisition ${id} has filled (${filled}) greater than openings (${openings})`);
  }
  if (!isValidDate(createdAt)) {
    throw new Error(`Requisition ${id} has an invalid creation time`);
  }
}

function compareRequisitions(a: Requisition, b: Requisition): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function toRow(requisition: Requisition): string[] {
  return [
    quote(String(requisition.id)),
    quote(defuse(requisition.title ?? "")),
    STATUS_LABELS.get(requisition.status)!,
    formatCount(requisition.openings),
    formatCount(requisition.filled),
    formatDate(requisition.createdAt),
  ];
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
  requisitions.forEach(validate);
  const rows = [HEADER, ...[...requisitions].sort(compareRequisitions).map(toRow)];
  return BOM + rows.map((row) => row.join(",") + ROW_END).join("");
}
