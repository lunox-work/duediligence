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

/** The allowed characters. Private: callers use {@link checkHandle}. */
const HANDLE_PATTERN = /^[a-z0-9_-]+$/;

/** Runs of characters a handle may not contain, for {@link toHandleStem}. */
const DISALLOWED_RUN = /[^a-z0-9_-]+/g;

const LENGTH_REASON = `Handle must be between ${HANDLE_MIN_LENGTH} and ${HANDLE_MAX_LENGTH} characters.`;
const CHARSET_REASON =
  "Handle can use letters, numbers, hyphens and underscores only.";

/** Trims surrounding whitespace and lowercases, and does nothing else. */
export function toHandleCase(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Checks an already-cased handle as given, with no trimming or lowercasing.
 * Length is checked before the character set, and only one problem is
 * reported. Never throws.
 */
export function checkHandle(handle: string): HandleCheck {
  if (
    handle.length < HANDLE_MIN_LENGTH ||
    handle.length > HANDLE_MAX_LENGTH
  ) {
    return { status: "invalid", problem: "length", reason: LENGTH_REASON };
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return { status: "invalid", problem: "charset", reason: CHARSET_REASON };
  }
  return { status: "ok" };
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
  const display = raw.trim();
  const handle = display.toLowerCase();
  const check = checkHandle(handle);
  if (check.status === "invalid") {
    return check;
  }
  return { status: "ok", handle, display };
}

/** Whether {@link normalizeHandle} would return status `"ok"` for `raw`. */
export function isValidHandle(raw: string): boolean {
  return checkHandle(toHandleCase(raw)).status === "ok";
}

/** Derives a candidate handle from free text that always passes {@link checkHandle}. */
export function toHandleStem(text: string): string {
  const cleaned = trimTrailingHyphens(
    trimHyphens(text.toLowerCase().replace(DISALLOWED_RUN, "-")).slice(
      0,
      HANDLE_MAX_LENGTH,
    ),
  );
  // Pad a too-short stem: "jo" must still produce a valid handle.
  return cleaned.length >= HANDLE_MIN_LENGTH ? cleaned : `${cleaned}-user`;
}

/**
 * Applies {@link toHandleStem} to the local part of the address (everything
 * before the first `@`, or the whole string with no `@`).
 */
export function handleStemFromEmail(email: string): string {
  const at = email.indexOf("@");
  return toHandleStem(at === -1 ? email : email.slice(0, at));
}

/**
 * Strips leading and trailing hyphens. A loop rather than `/^-+|-+$/g`, which
 * backtracks quadratically on a long run of hyphens.
 */
function trimHyphens(value: string): string {
  let start = 0;
  while (start < value.length && value[start] === "-") {
    start += 1;
  }
  return trimTrailingHyphens(value.slice(start));
}

/** Strips trailing hyphens only, so truncation never ends a stem in `-`. */
function trimTrailingHyphens(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "-") {
    end -= 1;
  }
  return value.slice(0, end);
}
