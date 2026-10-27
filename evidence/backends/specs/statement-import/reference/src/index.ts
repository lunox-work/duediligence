/** A field of a payout line, in order: "id", "date", "amount", "currency", "reference". */
export type FieldName = "id" | "date" | "amount" | "currency" | "reference";

/** The code of an error found while importing a statement. */
export type ErrorCode =
  | "header"
  | "fields"
  | "id"
  | "duplicate"
  | "date"
  | "future"
  | "amount"
  | "currency"
  | "reference"
  | "blank"
  | "too-many";

/** A payout, with its id, date, amount in cents as a whole number, currency and reference. */
export interface Payout {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** Amount in cents as a whole number. */
  amount: number;
  currency: string;
  /** Empty when the field is empty. */
  reference: string;
}

/** An error: a line number counting the header as line 1, the field name or no field, a code, and the text of the offending field or line. */
export interface StatementError {
  line: number;
  /** `null` when the error is on no field. */
  field: FieldName | null;
  code: ErrorCode;
  text: string;
}

/** A statement with no errors: the payouts, in line order. */
export interface ImportSuccess {
  ok: true;
  payouts: Payout[];
}

/** A statement with any error, which imports nothing: the first 100 errors, in order, and the total number of errors found. */
export interface ImportFailure {
  ok: false;
  errors: StatementError[];
  total: number;
}

/** Importing returns either the payouts or the errors. */
export type ImportResult = ImportSuccess | ImportFailure;

/**
 * Validates and parses a payout statement: a header line, then one line per
 * payout, with fields separated by ";".
 *
 * @param statement the statement as text
 * @param currencies the set of accepted currency codes
 * @param today today's date as "YYYY-MM-DD"
 */
const HEADER = "id;date;amount;currency;reference";
const MAX_LINES = 10000;
const MAX_ERRORS = 100;
const ID = /^[A-Za-z0-9-]{1,32}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const AMOUNT = /^(\d+)\.(\d{2})$/;

function isCalendarDay(date: string): boolean {
  const match = DATE.exec(date);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32) return true;
  return false;
}

/**
 * Validates and parses a payout statement: a header line, then one line per
 * payout, with fields separated by ";".
 *
 * @param statement the statement as text
 * @param currencies the set of accepted currency codes
 * @param today today's date as "YYYY-MM-DD"
 */
export function importStatement(
  statement: string,
  currencies: ReadonlySet<string>,
  today: string,
): ImportResult {
  const text = statement.startsWith("\uFEFF") ? statement.slice(1) : statement;
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  // One newline after the last line ends the statement rather than starting an empty line.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

  if (lines[0] !== HEADER) {
    return { ok: false, errors: [{ line: 1, field: null, code: "header", text: lines[0] }], total: 1 };
  }
  if (lines.length - 1 > MAX_LINES) {
    const line = MAX_LINES + 2;
    return {
      ok: false,
      errors: [{ line, field: null, code: "too-many", text: lines[line - 1] }],
      total: 1,
    };
  }

  const errors: StatementError[] = [];
  let total = 0;
  const report = (error: StatementError): void => {
    total++;
    if (errors.length < MAX_ERRORS) errors.push(error);
  };

  const payouts: Payout[] = [];
  const seen = new Set<string>();
  for (let index = 1; index < lines.length; index++) {
    const line = index + 1;
    const raw = lines[index];
    if (raw === "") {
      report({ line, field: null, code: "blank", text: raw });
      continue;
    }
    const fields = raw.split(";");
    if (fields.length !== 5) {
      report({ line, field: null, code: "fields", text: raw });
      continue;
    }
    const [id, date, amount, currency, reference] = fields;
    const before = total;

    if (!ID.test(id)) report({ line, field: "id", code: "id", text: id });
    else if (seen.has(id)) report({ line, field: "id", code: "duplicate", text: id });
    else seen.add(id);

    if (!isCalendarDay(date)) report({ line, field: "date", code: "date", text: date });
    else if (date > today) report({ line, field: "date", code: "future", text: date });

    const cents = AMOUNT.exec(amount);
    const value = cents === null ? 0 : Number(cents[1]) * 100 + Number(cents[2]);
    if (value === 0) report({ line, field: "amount", code: "amount", text: amount });

    if (!currencies.has(currency)) report({ line, field: "currency", code: "currency", text: currency });

    if (reference.length > 140 || hasControlCharacter(reference)) {
      report({ line, field: "reference", code: "reference", text: reference });
    }

    if (total === before) payouts.push({ id, date, amount: value, currency, reference });
  }

  return total === 0 ? { ok: true, payouts } : { ok: false, errors, total };
}
