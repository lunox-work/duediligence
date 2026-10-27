/** A set of files, each a path and its text, keyed by path. */
export type Files = Record<string, string>;

/** Why a hunk was rejected. */
export type RejectReason = "no match" | "missing" | "exists";

/**
 * A hunk that applied: the path of its file (the "+++" path, or the "---"
 * path for a deleted file), its hunk number counting from 1 within its file,
 * and its offset from its old start line, positive when later in the file
 * and negative when earlier.
 */
export interface AppliedHunk {
  path: string;
  hunk: number;
  offset: number;
}

/**
 * A hunk that failed: the path of its file (as in `AppliedHunk`), its hunk
 * number counting from 1 within its file, and why it failed.
 */
export interface RejectedHunk {
  path: string;
  hunk: number;
  reason: RejectReason;
}

/** The patch applied whole: the new set of files and the offset of every hunk. */
export interface Applied {
  ok: true;
  files: Files;
  hunks: AppliedHunk[];
}

/** The patch did not apply: every hunk that failed, with the original files untouched. */
export interface Rejected {
  ok: false;
  files: Files;
  rejected: RejectedHunk[];
}

/** Applying returns either the new set of files, or the list of rejected hunks with the original files untouched. */
export type ApplyResult = Applied | Rejected;

/**
 * Apply a unified diff in git's format to a set of files, whole or not at all.
 * Does not modify `files`.
 *
 * Throws an error, rather than returning a rejection, when the diff is
 * malformed: a hunk has fewer lines than its header counts, or a hunk comes
 * before any file header.
 */
export function applyPatch(files: Files, diff: string): ApplyResult {
  throw new Error("not implemented");
}
