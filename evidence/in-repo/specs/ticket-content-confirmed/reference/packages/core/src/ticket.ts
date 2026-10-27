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
export function clampTicketTitle(title: string): string {
  if (title.length <= TICKET_LIMITS.title) return title;
  const cut = title.slice(0, TICKET_LIMITS.title);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
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
  title: string,
  description: string,
  issueType: string,
): Promise<string> {
  const canonical = JSON.stringify([
    normalizeSpecText(title),
    normalizeSpecText(description),
    normalizeSpecText(issueType),
  ]);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Removes line-ending and edge whitespace noise and keeps the words. Never
 * throws.
 */
export function normalizeSpecText(value: string): string {
  return value
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * The display key of a ticket: its Jira key when it has one, and "T-" and
 * its number otherwise. Never throws.
 */
export function ticketKey(ticket: {
  readonly number: number;
  readonly jiraKey?: string | null | undefined;
}): string {
  return typeof ticket.jiraKey === "string"
    ? ticket.jiraKey
    : `T-${String(ticket.number)}`;
}
