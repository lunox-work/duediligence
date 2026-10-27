/**
 * Handle rules shared by users and organizations: casing, validation,
 * normalization of typed input, and deriving a candidate handle ("stem") from
 * free text or an email address. Uniqueness needs a store, so it lives
 * elsewhere.
 *
 * Deliberately dependency-free, like the rest of this package.
 */

/** Shortest allowed handle, in UTF-16 code units (inclusive). */
export const HANDLE_MIN_LENGTH = 3;

/** Longest allowed handle, in UTF-16 code units (inclusive). */
export const HANDLE_MAX_LENGTH = 30;

/** Which rule a rejected handle broke: its length or its character set. */
export type HandleProblem = "length" | "charset";

/** A handle that failed a rule, with the fixed human-readable reason. */
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
 * reported. Never throws.
 */
export function checkHandle(handle: string): HandleCheck {
  throw new Error("not implemented");
}

/**
 * The result of {@link normalizeHandle}: the cased `handle` plus the trimmed
 * input in its typed casing as `display`, or the {@link checkHandle} rejection.
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
 * lowercased form. Never throws.
 */
export function normalizeHandle(raw: string): NormalizedHandle {
  throw new Error("not implemented");
}

/** Whether {@link normalizeHandle} would return status `"ok"` for `raw`. */
export function isValidHandle(raw: string): boolean {
  throw new Error("not implemented");
}

/** Derives a candidate handle from free text that always passes {@link checkHandle}. */
export function toHandleStem(text: string): string {
  throw new Error("not implemented");
}

/**
 * Applies {@link toHandleStem} to the local part of the address (everything
 * before the first `@`, or the whole string with no `@`).
 */
export function handleStemFromEmail(email: string): string {
  throw new Error("not implemented");
}
