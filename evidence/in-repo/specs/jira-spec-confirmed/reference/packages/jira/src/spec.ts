/**
 * A Jira ticket's spec and its fingerprint.
 *
 * Turns the `fields` block of a Jira issue into a `JiraIssueSpec`: the key,
 * summary, description as plain text, issue type and last-updated stamp, plus
 * a `specHash` that changes only when the words of the summary or the
 * description text change. Callers use the hash to tell whether a ticket's
 * spec changed since they last read it.
 *
 * Reads the fields the way `mapping.ts` does: a missing or malformed field
 * becomes a sensible default rather than throwing. Platform-neutral like the
 * rest of the package; hashing goes through `globalThis.crypto.subtle` and
 * `TextEncoder`, which is why `specHash` is async.
 */

import { adfToText } from "./adf.js";

/** A ticket's spec as read from its `fields`, with its fingerprint. */
export interface JiraIssueSpec {
  readonly key: string;
  readonly summary: string;
  readonly descriptionText: string;
  readonly issueType: string;
  readonly updated: string | null;
  readonly specHash: string;
}

/** Exactly the Jira fields `toIssueSpec` reads, in this order. */
export const SPEC_FIELDS: readonly string[] = [
  "summary",
  "description",
  "issuetype",
  "updated",
];

/**
 * Text as the hash sees it: line endings unified, each line's trailing
 * whitespace dropped and the whole trimmed. Whitespace inside a line, blank
 * lines between text and the Unicode form are all left as they are.
 */
function canon(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * The fingerprint of a spec: SHA-256 of `canon(summary) + "\u0000" +
 * canon(descriptionText)`, as 64 lowercase hex characters.
 *
 * Rejects with a `TypeError` when either argument is not a string.
 */
export async function specHash(
  summary: string,
  descriptionText: string,
): Promise<string> {
  if (typeof summary !== "string" || typeof descriptionText !== "string") {
    throw new TypeError("specHash expects a string summary and description");
  }
  const input = `${canon(summary)}\u0000${canon(descriptionText)}`;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Turns an issue's `fields` block into a `JiraIssueSpec`, with `specHash`
 * equal to `specHash(summary, descriptionText)`.
 *
 * Rejects with a `TypeError` when `fields` is `null` or `undefined`.
 */
export async function toIssueSpec(
  key: string,
  fields: {
    summary?: unknown;
    description?: unknown;
    issuetype?: {
      name?: unknown;
    } | null;
    updated?: unknown;
  },
): Promise<JiraIssueSpec> {
  if (fields === null || fields === undefined) {
    throw new TypeError("toIssueSpec expects a fields object");
  }
  const summary = typeof fields.summary === "string" ? fields.summary : "";
  const descriptionText = adfToText(fields.description);
  const issueType = fields.issuetype;
  return {
    key,
    summary,
    descriptionText,
    // Matches `toIssueDto`'s default, so the two never disagree on a type.
    issueType:
      typeof issueType === "object" &&
      issueType !== null &&
      typeof issueType.name === "string"
        ? issueType.name
        : "Task",
    updated: typeof fields.updated === "string" ? fields.updated : null,
    specHash: await specHash(summary, descriptionText),
  };
}
