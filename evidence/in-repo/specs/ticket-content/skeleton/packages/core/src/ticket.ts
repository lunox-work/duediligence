/**
 * Ticket content: the rules for a ticket's text, shared by native ("manual")
 * tickets and tickets read from Jira.
 *
 * Both kinds are priced, so the origins, the limits, the default issue type,
 * title clamping, the shape of a ticket's content, the spec-text
 * normalization, the pricing fingerprint and the display key are defined
 * here once. `ticketSpecHash` is the Jira package's `pricingSpecHash`: same
 * inputs, same 64-character hex, so every stored hash stays valid.
 */

/** Where a ticket came from: written here, or read from Jira. */
export const TICKET_ORIGINS = ["manual", "jira"] as const;
export type TicketOrigin = (typeof TICKET_ORIGINS)[number];

/** Caps on a ticket's fields, in UTF-16 code units (`String.length`) or entries. */
export const TICKET_LIMITS: Readonly<{
  titleMaxChars: 255;
  descriptionMaxChars: 20_000;
  issueTypeMaxChars: 60;
  priorityMaxChars: 60;
  labelMaxChars: 255;
  maxLabels: 20;
  componentMaxChars: 255;
  maxComponents: 20;
}> = Object.freeze({
  titleMaxChars: 255,
  descriptionMaxChars: 20_000,
  issueTypeMaxChars: 60,
  priorityMaxChars: 60,
  labelMaxChars: 255,
  maxLabels: 20,
  componentMaxChars: 255,
  maxComponents: 20,
});

/** The issue type a ticket has when it names none (Jira's own fallback). */
export const DEFAULT_ISSUE_TYPE = "Task";

/**
 * A title trimmed and cut to `TICKET_LIMITS.titleMaxChars` with an ellipsis.
 * Never rejects and never throws; an empty or blank title returns "".
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
 * of the three normalized strings, as 64 lowercase hex characters.
 */
export async function ticketSpecHash(
  _title: string,
  _description: string,
  _issueType: string,
): Promise<string> {
  throw new Error("not implemented");
}

/**
 * Spec text with line-ending and edge whitespace noise removed and the words
 * kept. Never throws.
 */
export function normalizeSpecText(_value: string): string {
  throw new Error("not implemented");
}

/**
 * The display key of a ticket: its Jira key, or `#` and its number.
 *
 * @throws RangeError "A ticket number must be a positive whole number." when
 *   the key falls back to a number that is not a safe integer of at least 1.
 */
export function ticketKey(_ticket: {
  readonly number: number;
  readonly jiraKey?: string | null | undefined;
}): string {
  throw new Error("not implemented");
}
