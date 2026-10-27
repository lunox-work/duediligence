import type { AppliedHunk, RejectedHunk } from "./index.js";
import type { Hunk, HunkLine } from "./parse.js";

/** A line of a file: its text and its ending, "" for a last line without a newline. */
interface Line {
  text: string;
  eol: string;
}

export type HunksOutcome =
  | { ok: true; text: string; hunks: AppliedHunk[] }
  | { ok: false; rejected: RejectedHunk[] };

/**
 * Apply a file's hunks in order to its text, each located in the text as
 * changed by the hunks before it. `path` is the path the hunks are reported under.
 */
export function applyHunks(text: string, hunks: Hunk[], path: string): HunksOutcome {
  const lines = splitLines(text);
  // A file takes the ending of its first line, or "\n" when it has none.
  const eol = lines[0]?.eol || "\n";
  const applied: AppliedHunk[] = [];
  const rejected: RejectedHunk[] = [];
  // How far the applied hunks have moved the lines after them.
  let shift = 0;
  // Where the last applied hunk ends: no later hunk is placed before it.
  let floor = 0;

  hunks.forEach((hunk, index) => {
    const old = hunk.lines.filter((line) => line.kind !== "+");
    // An empty old side's start line is the line the new lines follow.
    const stated = (old.length === 0 ? hunk.oldStart : hunk.oldStart - 1) + shift;
    const at = nearestMatch(lines, old, stated, floor);
    if (at === undefined) {
      rejected.push({ path, hunk: index + 1, reason: "no match" });
      return;
    }
    const replacement = newLines(hunk.lines, lines, at, eol);
    lines.splice(at, old.length, ...replacement);
    applied.push({ path, hunk: index + 1, offset: at - stated });
    shift += replacement.length - old.length;
    floor = at + replacement.length;
  });

  if (rejected.length > 0) return { ok: false, rejected };
  // Only the last line may lack a newline: one that no longer is last gains the file's ending.
  for (const line of lines.slice(0, -1)) if (line.eol === "") line.eol = eol;
  return { ok: true, text: lines.map((line) => line.text + line.eol).join(""), hunks: applied };
}

/** The position from `floor` on where `old` matches, nearest to `stated`, the earlier of two equally near. */
function nearestMatch(lines: Line[], old: HunkLine[], stated: number, floor: number): number | undefined {
  const last = lines.length - old.length;
  for (let distance = 0; ; distance++) {
    const before = stated - distance;
    const after = stated + distance;
    if (before < floor && after > last) return undefined;
    if (before >= floor && before <= last && matchesAt(lines, old, before)) return before;
    if (after >= floor && after <= last && matchesAt(lines, old, after)) return after;
  }
}

/** Whether every old line matches the file from `at`: same text, and a newline unless marked as having none. */
function matchesAt(lines: Line[], old: HunkLine[], at: number): boolean {
  return old.every((want, k) => {
    const line = lines[at + k];
    return line.text === want.text && (want.noNewline ? line.eol === "" : line.eol !== "");
  });
}

/** The lines replacing the old ones at `at`: context lines as they are in the file, added lines with `eol`. */
function newLines(hunkLines: HunkLine[], lines: Line[], at: number, eol: string): Line[] {
  const result: Line[] = [];
  let k = at;
  for (const line of hunkLines) {
    if (line.kind === " ") result.push({ ...lines[k++] });
    else if (line.kind === "-") k++;
    else result.push({ text: line.text, eol: line.noNewline ? "" : eol });
  }
  return result;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < text.length) {
    const end = text.indexOf("\n", start);
    if (end < 0) {
      lines.push({ text: text.slice(start), eol: "" });
      break;
    }
    const crlf = end > start && text[end - 1] === "\r";
    lines.push({ text: text.slice(start, crlf ? end - 1 : end), eol: crlf ? "\r\n" : "\n" });
    start = end + 1;
  }
  return lines;
}
