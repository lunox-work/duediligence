/**
 * Handle rules shared by users and organizations: casing, validation,
 * normalization of typed input, and deriving a candidate handle ("stem") from
 * free text or an email address. Uniqueness needs a store, so it is not here.
 *
 * A handle is the lowercase identifier used in URLs and mentions: 3 to 30
 * characters, each from a-z, 0-9, "-" or "_". Lengths are UTF-16 code units.
 *
 * Deliberately dependency-free, like the rest of this package. Every function
 * is pure and synchronous, and none throws for any string input.
 */

/** Shortest allowed handle, inclusive. */
export const HANDLE_MIN_LENGTH = 3;

/** Longest allowed handle, inclusive. */
export const HANDLE_MAX_LENGTH = 30;

/** Which rule a rejected handle broke; length is checked first. */
export type HandleProblem = "length" | "charset";

/**
 * A rejected handle. `reason` is a fixed string: for `length`,
 * `Must be between 3 and 30 characters.`; for `charset`,
 * `Can use letters, numbers, hyphens and underscores only.`
 */
export interface HandleRejected {
  readonly status: "invalid";
  readonly problem: HandleProblem;
  readonly reason: string;
}

/** The result of {@link checkHandle}. */
export type HandleCheck = { readonly status: "ok" } | HandleRejected;

/** Trims surrounding whitespace and lowercases, and does nothing else. */
export function toHandleCase(raw: string): string {
  throw new Error("not implemented");
}

/**
 * Checks an already-cased handle as given, with no trimming or lowercasing.
 * Length is checked before the character set, and only one problem is
 * reported.
 */
export function checkHandle(handle: string): HandleCheck {
  throw new Error("not implemented");
}

/**
 * The result of {@link normalizeHandle}: on success the lowercased `handle`
 * and the trimmed input with its typed casing as `display`; on rejection
 * exactly the {@link checkHandle} result.
 */
export type NormalizedHandle =
  | {
      readonly status: "ok";
      readonly handle: string;
      readonly display: string;
    }
  | HandleRejected;

/**
 * Trims and lowercases raw input, then applies {@link checkHandle} to the
 * lowercased form.
 */
export function normalizeHandle(raw: string): NormalizedHandle {
  throw new Error("not implemented");
}

/** Whether {@link normalizeHandle} would return status "ok" for `raw`. */
export function isValidHandle(raw: string): boolean {
  throw new Error("not implemented");
}

/**
 * Derives a candidate handle from free text that always passes
 * {@link checkHandle}: lowercase, replace each run of disallowed characters
 * with "-", strip leading and trailing "-", keep the first
 * {@link HANDLE_MAX_LENGTH} characters, and append "-user" if fewer than
 * {@link HANDLE_MIN_LENGTH} remain.
 */
export function toHandleStem(text: string): string {
  throw new Error("not implemented");
}

/**
 * Applies {@link toHandleStem} to the local part of an email address:
 * everything before the first "@", or the whole string with no "@".
 */
export function handleStemFromEmail(email: string): string {
  throw new Error("not implemented");
}
