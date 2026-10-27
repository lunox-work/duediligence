/**
 * A Jira ticket's spec and its fingerprint.
 *
 * Turns the `fields` block of a Jira issue into a `JiraIssueSpec`: the
 * ticket's key, summary, description as plain text, issue type and
 * last-updated stamp, plus a `specHash` that changes only when the summary or
 * the description text changes. Callers use the hash to tell whether a
 * ticket's spec changed since they last read it.
 *
 * Read the way `mapping.ts` reads: a missing or malformed field becomes a
 * sensible default rather than throwing. Platform-neutral: hashing uses the
 * web-standard `globalThis.crypto.subtle` and `TextEncoder`, which is why
 * `specHash` is async.
 */

/** A ticket's spec: what it asks for, plus a fingerprint of that ask. */
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
 * The fingerprint of a spec: the SHA-256 of the UTF-8 encoding of
 * `JSON.stringify([summary, descriptionText])`, as 64 lowercase hex
 * characters with no prefix. Nothing is trimmed or normalised first.
 *
 * Rejects with a `TypeError` naming the argument when `summary` or
 * `descriptionText` is not a string.
 */
export async function specHash(
  summary: string,
  descriptionText: string,
): Promise<string> {
  throw new Error("not implemented");
}

/**
 * Reads an issue's `fields` block into a `JiraIssueSpec`, with `specHash`
 * equal to `specHash(summary, descriptionText)`. A string description is kept
 * verbatim and an Atlassian Document Format tree is flattened to its text;
 * missing, null or malformed fields become defaults rather than errors.
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
  throw new Error("not implemented");
}
