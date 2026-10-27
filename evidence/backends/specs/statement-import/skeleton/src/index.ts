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
export function importStatement(
  statement: string,
  currencies: ReadonlySet<string>,
  today: string,
): ImportResult {
  throw new Error("not implemented");
}
