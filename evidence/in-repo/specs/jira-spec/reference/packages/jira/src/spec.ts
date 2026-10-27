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
  // Checked here rather than left to JSON.stringify, which would silently
  // hash `undefined` as `null` and throws an unhelpful error on a bigint.
  if (typeof summary !== "string") {
    throw new TypeError(`summary must be a string, got ${typeof summary}`);
  }
  if (typeof descriptionText !== "string") {
    throw new TypeError(
      `descriptionText must be a string, got ${typeof descriptionText}`,
    );
  }
  // An array rather than a concatenation, so text moved across the boundary
  // between the two fields cannot collide.
  const bytes = new TextEncoder().encode(
    JSON.stringify([summary, descriptionText]),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Node types that hold inline content, so their children join with no gap. */
const TEXTBLOCK_TYPES: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "codeBlock",
  "taskItem",
  "decisionItem",
]);

type AdfNode = Record<string, unknown>;

/** Any non-null, non-array object, whatever its prototype. */
function isAdfNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr<T>(value: unknown, fallback: T): string | T {
  return typeof value === "string" ? value : fallback;
}

/**
 * The text of a leaf node, or `undefined` for a node whose text comes from
 * its `content`.
 */
function leafText(node: AdfNode): string | undefined {
  const attrs = isAdfNode(node["attrs"]) ? node["attrs"] : {};
  switch (node["type"]) {
    case "text":
      return stringOr(node["text"], "");
    case "hardBreak":
      return "\n";
    case "mention":
      return stringOr(attrs["text"], "");
    case "emoji":
      return stringOr(attrs["text"], stringOr(attrs["shortName"], ""));
    case "inlineCard":
      return stringOr(attrs["url"], "");
    default:
      return undefined;
  }
}

/** A container node part-way through having its children flattened. */
interface Frame {
  readonly children: readonly AdfNode[];
  readonly separator: string;
  readonly texts: string[];
}

function toFrame(node: AdfNode): Frame {
  const content = node["content"];
  const type = node["type"];
  return {
    children: Array.isArray(content) ? content.filter(isAdfNode) : [],
    separator:
      typeof type === "string" && TEXTBLOCK_TYPES.has(type) ? "" : "\n",
    texts: [],
  };
}

/**
 * Flattens an Atlassian Document Format tree to plain text.
 *
 * Walks with an explicit stack rather than recursion: a description is
 * untrusted input, and a deeply nested one must not overflow the call stack.
 */
function adfToText(root: AdfNode): string {
  const rootLeaf = leafText(root);
  if (rootLeaf !== undefined) {
    return rootLeaf;
  }
  const stack: Frame[] = [toFrame(root)];
  for (;;) {
    const frame = stack[stack.length - 1]!;
    if (frame.texts.length < frame.children.length) {
      const child = frame.children[frame.texts.length]!;
      const text = leafText(child);
      if (text === undefined) {
        stack.push(toFrame(child));
      } else {
        frame.texts.push(text);
      }
      continue;
    }
    const text = frame.texts.join(frame.separator);
    stack.pop();
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      return text;
    }
    parent.texts.push(text);
  }
}

/** A string description verbatim, an ADF tree as its text, anything else "". */
function toDescriptionText(description: unknown): string {
  if (typeof description === "string") {
    return description;
  }
  return isAdfNode(description) ? adfToText(description) : "";
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
  const { summary, description, issuetype, updated } = fields ?? {};
  const summaryText = stringOr(summary, "");
  const descriptionText = toDescriptionText(description);
  return {
    key,
    // "" rather than toIssueDto's "(no summary)", so placeholder text never
    // lands in the spec or its hash.
    summary: summaryText,
    descriptionText,
    issueType: stringOr(isAdfNode(issuetype) ? issuetype.name : undefined, "Task"),
    updated: stringOr(updated, null),
    specHash: await specHash(summaryText, descriptionText),
  };
}
