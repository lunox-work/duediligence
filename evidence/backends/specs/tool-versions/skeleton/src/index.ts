/** A file from a repository's root: its path and its text. */
export interface RepoFile {
  path: string;
  text: string;
}

/** A tool whose version can be pinned in `.tool-versions`. */
export type Tool = "nodejs" | "python" | "golang";

/** An exact version together with the file it was read from, such as ".nvmrc" or "package.json". */
export interface SourcedVersion {
  version: string;
  source: string;
}

/** A disagreement for one tool: the version chosen from the first source, and the differing exact versions ignored from later sources. */
export interface Conflict {
  tool: Tool;
  chosen: SourcedVersion;
  ignored: SourcedVersion[];
}

/** What was detected from a repository's root files. */
export interface ToolchainResult {
  /** The version each pinned tool is pinned to; a tool no source states exactly is not a key at all. */
  pins: Partial<Record<Tool, string>>;
  /** One entry per tool whose sources disagree. */
  conflicts: Conflict[];
  /** Paths of files that could not be read as their format, such as "package.json" that is not valid JSON. */
  unreadable: string[];
  /** The text of `.tool-versions`; the property is omitted when no tool is pinned. */
  toolVersions?: string;
}

/**
 * Detect the toolchain a repository declares from the files at its root
 * (paths containing "/" are ignored) and produce the `.tool-versions` text.
 */
export function detectToolchain(files: RepoFile[]): ToolchainResult {
  throw new Error("not implemented");
}
