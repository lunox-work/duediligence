/**
 * Ticket content rules shared by native ("manual") and Jira tickets.
 *
 * Every surface takes a ticket's origins, limits, default issue type, title
 * clamp, spec normalization, pricing fingerprint and display key from here.
 * This module stays dependency-free and must not import `node:crypto`.
 */

/** Where a ticket came from: written here, or read from Jira. */
export const TICKET_ORIGINS = ["manual", "jira"] as const;
export type TicketOrigin = (typeof TICKET_ORIGINS)[number];

/** Caps on a ticket's fields, in UTF-16 code units (`String.length`) or entries. */
export const TICKET_LIMITS = {
  title: 255,
  description: 20_000,
  issueType: 64,
  priority: 64,
  labels: 20,
  label: 64,
} as const;

/** The issue type a ticket has when it names none (Jira's own fallback). */
export const DEFAULT_ISSUE_TYPE = "Task";

/**
 * Cuts a title to its first `TICKET_LIMITS.title` UTF-16 code units, without
 * splitting a surrogate pair. Not trimmed, no ellipsis; never throws.
 */
export function clampTicketTitle(_title: string): string {
  throw new Error("not implemented");
}

/** The shape of a ticket's content. `labels` and `components` are not part of any hash. */
export interface TicketContent {
  readonly title: string;
  readonly description: string;
  readonly issueType: string;
  readonly priority: string | null;
  readonly labels: readonly string[];
  readonly components: readonly string[];
  readonly inputTruncated: boolean;
}

/** The version of the fingerprint `ticketSpecHash` produces (stored as `specHashVersion`). */
export const TICKET_SPEC_HASH_VERSION = 1;

/**
 * Fingerprints title, description and issue type: SHA-256 of the JSON array
 * of the three normalized strings, as 64 lowercase hex characters. The same
 * value as the Jira package's `pricingSpecHash`.
 */
export async function ticketSpecHash(
  _title: string,
  _description: string,
  _issueType: string,
): Promise<string> {
  throw new Error("not implemented");
}

/**
 * Removes line-ending and edge whitespace noise and keeps the words. Never
 * throws.
 */
export function normalizeSpecText(_value: string): string {
  throw new Error("not implemented");
}

/**
 * The display key of a ticket: its Jira key when it has one, and "T-" and
 * its number otherwise. Never throws.
 */
export function ticketKey(_ticket: {
  readonly number: number;
  readonly jiraKey?: string | null | undefined;
}): string {
  throw new Error("not implemented");
}
