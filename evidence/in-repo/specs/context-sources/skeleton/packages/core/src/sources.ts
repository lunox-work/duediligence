/**
 * The context a bounty takes from its two sources: its Jira issue's fields
 * beyond the text, and its repository's own documents (READMEs, guides and
 * docs, never code). What is decided here is which repository files count
 * as documents and which are read, how their text is cut to fixed caps,
 * which Jira fields are shown, how both sources are rendered into prompt
 * text, and when a step is behind the context the overview holds now.
 *
 * Pure and synchronous: nothing here reads a clock, a network, a database
 * or a file, and nothing mutates its arguments.
 */

import type { StageDrift } from "./stages.js";

/** The two sources a bounty can take context from. */
export const CONTEXT_SOURCES = ["jira", "github"] as const;
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

/** One repository document as kept: `truncated` is true when its text was cut. */
export interface GithubContextDocument {
  readonly path: string;
  readonly bytes: number;
  readonly text: string;
  readonly truncated: boolean;
}

/** A repository's documents at one commit, and how many were left out. */
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

/** No version of either source. Frozen. */
export const NO_CONTEXT: ContextVersions = Object.freeze({
  jira: null,
  github: null,
});

/** The most repository documents read. */
export const CONTEXT_DOCUMENTS_MAX = 12;

/** The largest document read, in bytes (128 KiB); a larger one is omitted. */
export const CONTEXT_DOCUMENT_BYTES_MAX = 131_072;

/** The most UTF-16 code units kept from one document's text. */
export const CONTEXT_DOCUMENT_CHARS = 12000;

/** The most UTF-16 code units kept from all documents' texts together. */
export const CONTEXT_TOTAL_CHARS = 48000;

/**
 * A title's meaningful words: lower-cased runs of letters and digits, at
 * least 3 code units, not all digits, not stopwords, without repeats, in
 * first-seen order.
 */
export function contextKeywords(_title: string): string[] {
  throw new Error("not implemented");
}

/**
 * Which files of a repository listing are documents to read, ranked root
 * README first, then by keywords matched in the path, then shallowest, then
 * by path, at most `CONTEXT_DOCUMENTS_MAX`. `omitted` counts the documents
 * over `CONTEXT_DOCUMENT_BYTES_MAX` and those past the count cap.
 */
export function contextDocuments(
  _files: readonly { readonly path: string; readonly size: number }[],
  _keywords: readonly string[] = [],
): { readonly paths: string[]; readonly omitted: number } {
  throw new Error("not implemented");
}

/**
 * Keeps documents in the order given, cutting each to
 * `CONTEXT_DOCUMENT_CHARS` and all of them together to
 * `CONTEXT_TOTAL_CHARS`, at most `CONTEXT_DOCUMENTS_MAX`. Blank documents
 * are dropped; the others left out are counted in `omitted`.
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
 * The issue's fields beyond its key and text, in a fixed order, leaving out
 * what carries nothing. `subtaskCount` is always included.
 */
export function jiraContextFields(_context: JiraContext): Record<string, unknown> {
  throw new Error("not implemented");
}

/**
 * Both sources as prompt text: the Jira section, then the repository
 * section, separated by one blank line. `""` when both are null.
 */
export function renderSourceContext(_context: {
  readonly jira: JiraContext | null;
  readonly github: GithubContext | null;
}): string {
  throw new Error("not implemented");
}

/**
 * For each source, whether a step is behind it: the overview holds a newer
 * version of it than the step used.
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
