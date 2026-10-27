import { type FilePatch, parseDiff } from "./parse.js";
import { applyHunks } from "./hunks.js";

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
  const patches = parseDiff(diff);
  const work = new Map(Object.entries(files));
  const hunks: AppliedHunk[] = [];
  const rejected: RejectedHunk[] = [];
  // Each file's diff applies to the files as changed by the diffs before it.
  for (const patch of patches) {
    const outcome = applyFilePatch(work, patch);
    if (outcome.ok) hunks.push(...outcome.hunks);
    else rejected.push(...outcome.rejected);
  }
  if (rejected.length > 0) return { ok: false, files: { ...files }, rejected };
  return { ok: true, files: Object.fromEntries(work), hunks };
}

type FileOutcome = { ok: true; hunks: AppliedHunk[] } | { ok: false; rejected: RejectedHunk[] };

/** Apply one file's diff to `work`, changing it only when every hunk applies. */
function applyFilePatch(work: Map<string, string>, patch: FilePatch): FileOutcome {
  const { source, target, created, deleted } = patch;
  const path = (deleted ? source : target) as string;
  // A file with no hunks that fails is reported as hunk 0, since it has no hunk to number.
  const rejectAll = (reason: RejectReason): FileOutcome => ({
    ok: false,
    rejected: (patch.hunks.length > 0 ? patch.hunks : [undefined]).map((_, k) => ({
      path,
      hunk: patch.hunks.length > 0 ? k + 1 : 0,
      reason,
    })),
  });

  let text: string;
  if (created) {
    if (work.has(target as string)) return rejectAll("exists");
    text = "";
  } else {
    const found = work.get(source as string);
    if (found === undefined) return rejectAll("missing");
    if (target !== undefined && target !== source && work.has(target)) return rejectAll("exists");
    text = found;
  }

  let applied: AppliedHunk[] = [];
  if (patch.hunks.length > 0) {
    const outcome = applyHunks(text, patch.hunks, path);
    if (!outcome.ok) return outcome;
    ({ text, hunks: applied } = outcome);
  }
  // A deleted file's hunks must remove its whole text.
  if (deleted && text !== "") return rejectAll("no match");
  if (source !== undefined) work.delete(source);
  if (target !== undefined) work.set(target, text);
  return { ok: true, hunks: applied };
}
