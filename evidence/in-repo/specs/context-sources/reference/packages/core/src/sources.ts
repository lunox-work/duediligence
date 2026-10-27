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

import {
  NO_EXTENSION,
  extensionOf,
  isTestFile,
  normalizePath,
} from "./repo/tree.js";
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

/** Extensions a document is written in, lower-cased. */
const DOCUMENT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "mdx",
  "rst",
  "adoc",
  "asciidoc",
]);

/** Directories whose document-extension files count at any depth. */
const DOCS_DIRECTORIES = new Set([
  "docs",
  "doc",
  "documentation",
  "guide",
  "guides",
  "wiki",
]);

/** Directories never read from: dependencies and build output. */
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "vendor",
  "third_party",
  "dist",
  "build",
]);

/** Bases that name housekeeping rather than documentation. */
const EXCLUDED_BASES = new Set([
  "changelog",
  "changes",
  "history",
  "license",
  "licence",
  "copying",
  "notice",
  "code_of_conduct",
  "authors",
  "contributors",
]);

/** Words a title carries that say nothing about where to look. */
const STOPWORDS = new Set(
  (
    "the and for with from into onto when then than that this these those " +
    "not are was were been being can could should would will must has have " +
    "had does did but its our your their they them there here what which " +
    "who why how all any some via per out off over under about after before " +
    "also only just more most less new add adds added fix fixes fixed use " +
    "uses make makes allow allows support supports update updates change " +
    "changes remove removes improve issue bug feature able need needs get set"
  ).split(" "),
);

/**
 * A title's meaningful words: lower-cased runs of letters and digits, at
 * least 3 code units, not all digits, not stopwords, without repeats, in
 * first-seen order.
 */
export function contextKeywords(title: string): string[] {
  const keywords = new Set<string>();
  for (const word of title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (word.length < 3 || /^\p{N}+$/u.test(word) || STOPWORDS.has(word)) {
      continue;
    }
    keywords.add(word);
  }
  return [...keywords];
}

/**
 * Which files of a repository listing are documents to read, ranked root
 * README first, then by keywords matched in the path, then shallowest, then
 * by path, at most `CONTEXT_DOCUMENTS_MAX`. `omitted` counts the documents
 * over `CONTEXT_DOCUMENT_BYTES_MAX` and those past the count cap.
 */
export function contextDocuments(
  files: readonly { readonly path: string; readonly size: number }[],
  keywords: readonly string[] = [],
): { readonly paths: string[]; readonly omitted: number } {
  const terms = [
    ...new Set(
      keywords
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword !== ""),
    ),
  ];
  const seen = new Set<string>();
  const candidates: {
    path: string;
    rootReadme: boolean;
    matches: number;
    depth: number;
  }[] = [];
  let omitted = 0;

  for (const file of files) {
    const path = normalizePath(file.path);
    if (path === "" || seen.has(path)) continue;
    seen.add(path);
    const kind = documentKind(path);
    if (kind === null) continue;
    if (!Number.isFinite(file.size) || file.size <= 0) continue;
    if (file.size > CONTEXT_DOCUMENT_BYTES_MAX) {
      omitted += 1;
      continue;
    }
    const lower = path.toLowerCase();
    const depth = path.split("/").length;
    candidates.push({
      path,
      rootReadme: kind === "readme" && depth === 1,
      matches: terms.filter((term) => lower.includes(term)).length,
      depth,
    });
  }

  candidates.sort(
    (left, right) =>
      Number(right.rootReadme) - Number(left.rootReadme) ||
      right.matches - left.matches ||
      left.depth - right.depth ||
      compare(left.path, right.path),
  );
  omitted += Math.max(0, candidates.length - CONTEXT_DOCUMENTS_MAX);
  return {
    paths: candidates.slice(0, CONTEXT_DOCUMENTS_MAX).map(({ path }) => path),
    omitted,
  };
}

/**
 * Keeps documents in the order given, cutting each to
 * `CONTEXT_DOCUMENT_CHARS` and all of them together to
 * `CONTEXT_TOTAL_CHARS`, at most `CONTEXT_DOCUMENTS_MAX`. Blank documents
 * are dropped; the others left out are counted in `omitted`.
 */
export function keptDocuments(
  documents: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
  }[],
): { readonly documents: GithubContextDocument[]; readonly omitted: number } {
  const kept: GithubContextDocument[] = [];
  let room = CONTEXT_TOTAL_CHARS;
  let omitted = 0;

  for (const { path, bytes, text } of documents) {
    if (text.trim() === "") continue;
    if (kept.length >= CONTEXT_DOCUMENTS_MAX || room === 0) {
      omitted += 1;
      continue;
    }
    const limit = Math.min(CONTEXT_DOCUMENT_CHARS, room);
    const truncated = text.length > limit;
    let cut = truncated ? text.slice(0, limit) : text;
    // Dropping a trailing high surrogate keeps a pair from being halved.
    if (truncated && /[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
    if (cut === "") {
      omitted += 1;
      continue;
    }
    room -= cut.length;
    kept.push({ path, bytes, text: cut, truncated });
  }
  return { documents: kept, omitted };
}

/**
 * The issue's fields beyond its key and text, in a fixed order, leaving out
 * what carries nothing. `subtaskCount` is always included.
 */
export function jiraContextFields(
  context: JiraContext,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const put = (
    name: string,
    value: string | number | readonly unknown[] | null,
  ): void => {
    if (value === null) return;
    if (typeof value === "string" && value.trim() === "") return;
    if (Array.isArray(value)) {
      if (value.length > 0) fields[name] = [...value];
      return;
    }
    fields[name] = value;
  };
  put("issueType", context.issueType);
  put("status", context.status);
  put("statusCategory", context.statusCategory);
  put("priority", context.priority);
  put("labels", context.labels);
  put("components", context.components);
  put("fixVersions", context.fixVersions);
  put("parentKey", context.parentKey);
  put("dueDate", context.dueDate);
  put("storyPoints", context.storyPoints);
  put("originalEstimateSeconds", context.originalEstimateSeconds);
  put("remainingEstimateSeconds", context.remainingEstimateSeconds);
  put("votes", context.votes);
  put("watchers", context.watchers);
  fields["subtaskCount"] = context.subtaskCount;
  put(
    "links",
    context.links.map(({ type, direction, key, done }) => ({
      type,
      direction,
      key,
      done,
    })),
  );
  return fields;
}

/**
 * Both sources as prompt text: the Jira section, then the repository
 * section, separated by one blank line. `""` when both are null.
 */
export function renderSourceContext(context: {
  readonly jira: JiraContext | null;
  readonly github: GithubContext | null;
}): string {
  const sections: string[] = [];
  const { jira, github } = context;
  if (jira !== null) {
    sections.push(
      [`Jira issue ${jira.key}:`, JSON.stringify(jiraContextFields(jira))].join(
        "\n",
      ),
    );
  }
  if (github !== null) {
    const lines = [
      `Repository documents from ${github.fullName} at ${github.branch} (${github.commitSha}):`,
    ];
    if (github.documents.length === 0) lines.push("", "No documents.");
    for (const document of github.documents) {
      lines.push("", `### ${document.path}`);
      const text = document.text.trimEnd();
      if (text !== "") lines.push(text);
      if (document.truncated) lines.push("[truncated]");
    }
    if (github.omitted > 0) {
      lines.push(
        "",
        github.omitted === 1
          ? "1 more document left out."
          : `${github.omitted} more documents left out.`,
      );
    }
    sections.push(lines.join("\n"));
  }
  return sections.join("\n\n");
}

/**
 * For each source, whether a step is behind it: the overview holds a newer
 * version of it than the step used.
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

function sourceDrift(
  current: number | null,
  used: number | null,
): StageDrift | null {
  return current !== null && (used === null || used < current)
    ? { uses: used, current }
    : null;
}

/**
 * Whether a normalized path is a document, and which kind: a README at any
 * depth, or a document-extension file at the root or under a docs
 * directory. Null when it is not one.
 */
function documentKind(path: string): "readme" | "document" | null {
  const segments = path.split("/");
  const name = segments.at(-1) ?? "";
  const directories = segments.slice(0, -1);
  const extension = extensionOf(path);
  const lower = name.toLowerCase();
  const base =
    extension === NO_EXTENSION ? lower : lower.slice(0, lower.lastIndexOf("."));

  if (segments.some((segment) => segment.startsWith("."))) return null;
  if (directories.some((d) => SKIPPED_DIRECTORIES.has(d.toLowerCase()))) {
    return null;
  }
  if (isTestFile(path) || EXCLUDED_BASES.has(base)) return null;

  const documentExtension = DOCUMENT_EXTENSIONS.has(extension);
  if (
    base === "readme" &&
    (extension === NO_EXTENSION || extension === "txt" || documentExtension)
  ) {
    return "readme";
  }
  if (
    documentExtension &&
    (directories.length === 0 ||
      directories.some((d) => DOCS_DIRECTORIES.has(d.toLowerCase())))
  ) {
    return "document";
  }
  return null;
}

/** Code-point order, not locale order, as `repo/tree.ts` sorts. */
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
