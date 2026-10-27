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

import { inSkippedDirectory } from "./repo/stack.js";
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
export function contextKeywords(title: string): string[] {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4);
  return [...new Set(words)];
}

const MARKDOWN = /\.(md|mdx|markdown)$/i;
const DOCS_DIRECTORIES: ReadonlySet<string> = new Set([
  "docs",
  "doc",
  "documentation",
  "adr",
  "adrs",
]);
const ROOT_GUIDES: ReadonlySet<string> = new Set([
  "contributing",
  "architecture",
  "design",
  "development",
  "agents",
  "claude",
  "conventions",
  "overview",
]);
const BOILERPLATE: ReadonlySet<string> = new Set([
  "changelog",
  "changes",
  "history",
  "license",
  "licence",
  "copying",
  "code_of_conduct",
  "security",
  "notice",
  "authors",
  "contributors",
  "codeowners",
]);

/** The name without its Markdown extension, lower-cased. */
function stemOf(name: string): string {
  return name.replace(MARKDOWN, "").toLowerCase();
}

function isDocument(path: string): boolean {
  if (!MARKDOWN.test(path) || inSkippedDirectory(path)) return false;
  const segments = path.split("/");
  if (segments.includes(".github")) return false;
  return !BOILERPLATE.has(stemOf(segments[segments.length - 1]!));
}

/**
 * 0 for the root README, 1 for a root guide, 2 under a docs directory, 3
 * for any other README and 4 for anything else.
 */
function tierOf(segments: readonly string[]): number {
  const stem = stemOf(segments[segments.length - 1]!);
  if (segments.length === 1 && stem === "readme") return 0;
  if (segments.length === 1 && ROOT_GUIDES.has(stem)) return 1;
  if (
    segments
      .slice(0, -1)
      .some((segment) => DOCS_DIRECTORIES.has(segment.toLowerCase()))
  )
    return 2;
  if (stem === "readme") return 3;
  return 4;
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
  files: readonly { readonly path: string; readonly size: number }[],
  keywords: readonly string[] = [],
): { readonly paths: string[]; readonly omitted: number } {
  const ranked = files
    .filter(
      ({ path, size }) =>
        Number.isFinite(size) &&
        size > 0 &&
        size <= CONTEXT_DOCUMENT_BYTES_MAX &&
        isDocument(path),
    )
    .map(({ path }) => {
      const segments = path.split("/");
      const tier = tierOf(segments);
      const lower = path.toLowerCase();
      const matched =
        tier >= 1 && keywords.some((keyword) => lower.includes(keyword));
      return {
        path,
        rank: matched ? Math.max(1, 2 * tier - 3) : 2 * tier,
        depth: segments.length,
      };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.depth - b.depth ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );
  return {
    paths: ranked.slice(0, CONTEXT_DOCUMENTS_MAX).map(({ path }) => path),
    omitted: Math.max(0, ranked.length - CONTEXT_DOCUMENTS_MAX),
  };
}

/**
 * Keeps documents in the order given, each text with its line endings
 * normalized and trimmed, cut to `CONTEXT_DOCUMENT_CHARS` and all of them
 * together to `CONTEXT_TOTAL_CHARS`. Blank documents and those met once the
 * total is used up are dropped and counted in `omitted`.
 */
export function keptDocuments(
  documents: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
  }[],
): { readonly documents: GithubContextDocument[]; readonly omitted: number } {
  const kept: GithubContextDocument[] = [];
  let omitted = 0;
  let room = CONTEXT_TOTAL_CHARS;
  for (const { path, bytes, text } of documents) {
    const trimmed = text.replace(/\r\n?/g, "\n").trim();
    if (trimmed === "" || room === 0) {
      omitted += 1;
      continue;
    }
    const cut = trimmed.slice(0, Math.min(CONTEXT_DOCUMENT_CHARS, room));
    room -= cut.length;
    kept.push({
      path,
      bytes,
      text: cut,
      truncated: cut.length < trimmed.length,
    });
  }
  return { documents: kept, omitted };
}

/** Seconds as hours, rounded to one decimal. */
function hours(seconds: number): number {
  return Math.round(seconds / 360) / 10;
}

/**
 * The issue's fields that are set, in a fixed order, without naming the
 * issue or anything it links to.
 */
export function jiraContextFields(context: JiraContext): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const set = (name: string, value: unknown): void => {
    if (value === null || (Array.isArray(value) && value.length === 0)) return;
    fields[name] = value;
  };
  set("issueType", context.issueType);
  set("status", context.status);
  set("priority", context.priority);
  set("labels", [...context.labels]);
  set("components", [...context.components]);
  set("fixVersions", [...context.fixVersions]);
  set("dueDate", context.dueDate);
  set("storyPoints", context.storyPoints);
  set(
    "originalEstimateHours",
    context.originalEstimateSeconds === null
      ? null
      : hours(context.originalEstimateSeconds),
  );
  set(
    "remainingEstimateHours",
    context.remainingEstimateSeconds === null
      ? null
      : hours(context.remainingEstimateSeconds),
  );
  set("votes", context.votes);
  set("watchers", context.watchers);
  set("subtasks", context.subtaskCount === 0 ? null : context.subtaskCount);
  set("hasParent", context.parentKey === null ? null : true);
  set(
    "links",
    context.links.map(({ type, direction, done }) => ({
      type,
      direction,
      done,
    })),
  );
  return fields;
}

/**
 * Both sources as prompt text: the Jira section, then the repository
 * section, separated by one blank line; `""` when neither contributes.
 */
export function renderSourceContext(context: {
  readonly jira: JiraContext | null;
  readonly github: GithubContext | null;
}): string {
  const sections: string[] = [];
  if (context.jira !== null)
    sections.push(
      `Jira fields:\n${JSON.stringify(jiraContextFields(context.jira))}`,
    );
  if (context.github !== null && context.github.documents.length > 0)
    sections.push(
      [
        "Repository documents:",
        ...context.github.documents.map(
          ({ path, text, truncated }) =>
            `--- ${path}${truncated ? " (cut short)" : ""} ---\n${text}`,
        ),
      ].join("\n\n"),
    );
  return sections.join("\n\n");
}

function sourceDrift(
  current: number | null,
  used: number | null,
): StageDrift | null {
  if (current === null) return null;
  return used === null || used < current ? { uses: used, current } : null;
}

/**
 * For each source, whether a step is behind it: when the overview holds a
 * newer version of it than the step used.
 */
export function contextDrift(
  current: ContextVersions,
  used: ContextVersions,
): {
  readonly jira: StageDrift | null;
  readonly github: StageDrift | null;
} {
  return {
    jira: sourceDrift(current.jira, used.jira),
    github: sourceDrift(current.github, used.github),
  };
}
