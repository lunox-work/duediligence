/**
 * The context a bounty takes from its two sources: its Jira issue's fields
 * beyond the text (type, status, priority, labels, components, releases,
 * story points, estimates, demand and links) and its repository's own
 * documents (READMEs, guides and docs, never code).
 *
 * Which repository files count as documents and which are read, how their
 * text is cut to fixed caps, which Jira fields are shown, how both sources
 * are rendered into prompt text, and when a step is behind the context the
 * overview holds now. Every export is pure and synchronous: nothing here
 * reads a clock, a network, a database or a file, and nothing mutates its
 * arguments.
 */

import type { StageDrift } from "./stages.js";

/** The two sources a bounty takes context from. */
export const CONTEXT_SOURCES = ["jira", "github"] as const;
/** One of `CONTEXT_SOURCES`. */
export type ContextSource = (typeof CONTEXT_SOURCES)[number];

/** One link from a Jira issue to another issue. */
export interface JiraIssueLinkContext {
  readonly type: string;
  readonly direction: "inward" | "outward";
  readonly key: string | null;
  readonly done: boolean;
}

/** A Jira issue's fields beyond its text. */
export interface JiraContext {
  readonly key: string;
  readonly issueType: string | null;
  readonly status: string | null;
  readonly statusCategory: string | null;
  readonly priority: string | null;
  readonly labels: readonly string[];
  readonly components: readonly string[];
  readonly fixVersions: readonly string[];
  readonly parentKey: string | null;
  readonly dueDate: string | null;
  readonly storyPoints: number | null;
  readonly originalEstimateSeconds: number | null;
  readonly remainingEstimateSeconds: number | null;
  readonly votes: number | null;
  readonly watchers: number | null;
  readonly subtaskCount: number;
  readonly links: readonly JiraIssueLinkContext[];
  readonly updated: string | null;
}

/** One repository document as kept: its text cut to the caps, `truncated` when it was cut. */
export interface GithubContextDocument {
  readonly path: string;
  readonly bytes: number;
  readonly text: string;
  readonly truncated: boolean;
}

/** A repository's documents at one commit, and how many past the cap were not read. */
export interface GithubContext {
  readonly fullName: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly documents: readonly GithubContextDocument[];
  readonly omitted: number;
}

/** The version of each source a step used, or the overview holds; null for none. */
export interface ContextVersions {
  readonly jira: number | null;
  readonly github: number | null;
}

/** No version of either source. Not frozen. */
export const NO_CONTEXT: ContextVersions = { jira: null, github: null };
/** The most documents `contextDocuments` returns. */
export const CONTEXT_DOCUMENTS_MAX = 12;
/** A document larger than this (256 KiB) is ignored. */
export const CONTEXT_DOCUMENT_BYTES_MAX = 262_144;
/** The most UTF-16 code units one kept document's text has. */
export const CONTEXT_DOCUMENT_CHARS = 12000;
/** The most UTF-16 code units all kept documents' texts have together. */
export const CONTEXT_TOTAL_CHARS = 48000;

/**
 * The words of 4 or more characters in the lower-cased title, split on runs
 * of characters other than ASCII `a-z0-9`, in first-seen order without
 * repeats.
 */
export function contextKeywords(_title: string): string[] {
  throw new Error("not implemented");
}

/**
 * Which files of a listing are documents to read: Markdown, not under a
 * skipped directory or `.github`, not boilerplate, with a size above 0 and
 * at most `CONTEXT_DOCUMENT_BYTES_MAX`. Ranked by tier, a keyword match
 * lifting a document ahead of the tier above its own but never ahead of the
 * root README, then shallowest, then by path in code-point order. At most
 * `CONTEXT_DOCUMENTS_MAX` paths are returned; `omitted` counts the
 * documents past that cap.
 */
export function contextDocuments(
  _files: readonly { readonly path: string; readonly size: number }[],
  _keywords: readonly string[] = [],
): { readonly paths: string[]; readonly omitted: number } {
  throw new Error("not implemented");
}

/**
 * Keeps documents in the order given, each text with its line endings
 * normalized and trimmed, cut to `CONTEXT_DOCUMENT_CHARS` and all of them
 * together to `CONTEXT_TOTAL_CHARS`. Blank documents and those met once the
 * total is used up are dropped and counted in `omitted`.
 */
export function keptDocuments(
  _documents: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
  }[],
): { readonly documents: GithubContextDocument[]; readonly omitted: number } {
  throw new Error("not implemented");
}

/**
 * The issue's fields that are set, in a fixed order, without naming the
 * issue or anything it links to.
 */
export function jiraContextFields(_context: JiraContext): Record<string, unknown> {
  throw new Error("not implemented");
}

/**
 * Both sources as prompt text: the Jira section, then the repository
 * section, separated by one blank line; `""` when neither contributes.
 */
export function renderSourceContext(_context: {
  readonly jira: JiraContext | null;
  readonly github: GithubContext | null;
}): string {
  throw new Error("not implemented");
}

/**
 * For each source, whether a step is behind it: when the overview holds a
 * newer version of it than the step used.
 */
export function contextDrift(
  _current: ContextVersions,
  _used: ContextVersions,
): {
  readonly jira: StageDrift | null;
  readonly github: StageDrift | null;
} {
  throw new Error("not implemented");
}
