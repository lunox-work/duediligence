import type { RequisitionStatus } from "./server.js";

const HEADER = ["Requisition ID", "Title", "Status", "Openings", "Filled", "Created"];

const STATUS_LABELS: Record<RequisitionStatus, string> = {
  open: "Open",
  on_hold: "On hold",
  filled: "Filled",
  cancelled: "Cancelled",
};

/** "YYYY-MM-DDTHH:MM:SS", optional fractional seconds, then "Z" or "+HH:MM" / "-HH:MM". */
const TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** An instant: whole seconds since the epoch, and the fraction's digits without trailing zeros. */
interface Instant {
  seconds: number;
  fraction: string;
}

/** A requisition that passed validation, ready to be written. */
export interface Row {
  id: string;
  title: string;
  status: string;
  openings: number;
  filled: number;
  created: Instant;
}

/** The body is not a list of requisitions: answered 400. */
export class BadRequest extends Error {}

/** A requisition cannot be written: answered 422, naming its id. */
export class Unprocessable extends Error {
  constructor(
    message: string,
    readonly id: string,
  ) {
    super(message);
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Days from 1970-01-01 to the given civil date (proleptic Gregorian). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date "YYYY-MM-DD" of the given days from 1970-01-01. */
function civilFromDays(days: number): string {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  const yearText = year < 0 ? `-${String(-year).padStart(4, "0")}` : String(year).padStart(4, "0");
  return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parses a creation time, or returns null when it is not written as required or names no real time. */
function parseTime(value: unknown): Instant | null {
  if (typeof value !== "string") return null;
  const match = TIME.exec(value);
  if (match === null) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, sign, offsetHourText, offsetMinuteText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  let offset = 0;
  if (sign !== undefined) {
    const offsetHour = Number(offsetHourText);
    const offsetMinute = Number(offsetMinuteText);
    if (offsetHour > 23 || offsetMinute > 59) return null;
    offset = (sign === "-" ? -1 : 1) * (offsetHour * 3600 + offsetMinute * 60);
  }
  const seconds = daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset;
  return { seconds, fraction: (fraction ?? "").replace(/0+$/, "") };
}

function compareInstants(a: Instant, b: Instant): number {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  // Without trailing zeros, digit strings compare as fractions do.
  if (a.fraction !== b.fraction) return a.fraction < b.fraction ? -1 : 1;
  return 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Checks one requisition, whose id is already known to be a string. */
function validate(item: Record<string, unknown>, id: string): Row {
  const { title, status, openings, filled, createdAt } = item;
  if (typeof status !== "string" || !Object.hasOwn(STATUS_LABELS, status)) {
    throw new Unprocessable("status must be one of open, on_hold, filled or cancelled", id);
  }
  if (title !== undefined && title !== null && typeof title !== "string") {
    throw new Unprocessable("title must be a string or null", id);
  }
  if (!isCount(openings)) throw new Unprocessable("openings must be a whole number of at least 0", id);
  if (!isCount(filled)) throw new Unprocessable("filled must be a whole number of at least 0", id);
  if (filled > openings) throw new Unprocessable("filled must not be greater than openings", id);
  const created = parseTime(createdAt);
  if (created === null) {
    throw new Unprocessable("createdAt must be a real time written YYYY-MM-DDTHH:MM:SS with Z or an offset", id);
  }
  return {
    id,
    title: title ?? "",
    status: STATUS_LABELS[status as RequisitionStatus],
    openings,
    filled,
    created,
  };
}

/** Parses and checks the request body; throws `BadRequest` or `Unprocessable`. */
export function parseRequisitions(text: string): Row[] {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BadRequest("the body is not JSON");
  }
  if (!Array.isArray(body)) throw new BadRequest("the body must be an array of requisitions");
  for (const item of body) {
    if (typeof item !== "object" || item === null || Array.isArray(item) || typeof item.id !== "string") {
      throw new BadRequest("every requisition must be an object with a string id");
    }
  }
  return body.map((item: Record<string, unknown>) => validate(item, item.id as string));
}

function quote(field: string): string {
  if (/[,"\r\n]/.test(field) || field.startsWith(" ") || field.endsWith(" ")) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
}

function defuse(title: string): string {
  return /^[=+\-@\t\r]/.test(title) ? `'${title}` : title;
}

/** Writes a whole number as plain digits, however large. */
function digits(value: number): string {
  return BigInt(value).toString();
}

/** The CSV text, without the byte order mark: the header and the rows ordered by creation time, then id. */
export function writeCsv(rows: Row[]): string {
  const sorted = [...rows].sort((a, b) => {
    const byTime = compareInstants(a.created, b.created);
    if (byTime !== 0) return byTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const lines = [HEADER.join(",")];
  for (const row of sorted) {
    lines.push(
      [
        quote(row.id),
        quote(defuse(row.title)),
        quote(row.status),
        digits(row.openings),
        digits(row.filled),
        civilFromDays(Math.floor(row.created.seconds / 86400)),
      ].join(","),
    );
  }
  return lines.map((line) => `${line}\r\n`).join("");
}
