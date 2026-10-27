/** One line of a hunk: its kind, its text, and whether "\ No newline at end of file" follows it. */
export interface HunkLine {
  kind: " " | "-" | "+";
  text: string;
  noNewline: boolean;
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: HunkLine[];
}

/** The diff for one file, with its paths resolved. */
export interface FilePatch {
  /** The path the file is read from; undefined when it is created. */
  source: string | undefined;
  /** The path the file is written to; undefined when it is deleted. */
  target: string | undefined;
  created: boolean;
  deleted: boolean;
  hunks: Hunk[];
}

/** A file section as read, before its paths are resolved. */
interface Section {
  gitOld?: string;
  gitNew?: string;
  minus?: string | null;
  plus?: string | null;
  renameFrom?: string;
  renameTo?: string;
  newFileMode: boolean;
  deletedFileMode: boolean;
  hunks: Hunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a unified diff in git's format into one patch per file.
 * Throws when the diff is malformed.
 */
export function parseDiff(diff: string): FilePatch[] {
  const lines = diff.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (diff.endsWith("\n")) lines.pop();

  const sections: Section[] = [];
  let current: Section | undefined;
  const start = (): Section => {
    current = { newFileMode: false, deletedFileMode: false, hunks: [] };
    sections.push(current);
    return current;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("diff --git ")) {
      const section = start();
      const paths = gitPaths(line.slice("diff --git ".length));
      if (paths) [section.gitOld, section.gitNew] = paths;
      i++;
    } else if (line.startsWith("@@")) {
      if (!current) throw new Error(`malformed diff: hunk at line ${i + 1} comes before any file header`);
      i = readHunk(lines, i, current.hunks);
    } else if (line.startsWith("--- ")) {
      // A "---" header after a section's hunks or its own "---" starts a plain unified diff's next file.
      const section = !current || current.hunks.length > 0 || current.minus !== undefined ? start() : current;
      section.minus = headerPath(line.slice(4), "a/");
      i++;
    } else if (line.startsWith("+++ ") && current && current.hunks.length === 0 && current.plus === undefined) {
      current.plus = headerPath(line.slice(4), "b/");
      i++;
    } else if (current && current.hunks.length === 0) {
      if (line.startsWith("new file mode")) current.newFileMode = true;
      else if (line.startsWith("deleted file mode")) current.deletedFileMode = true;
      else if (line.startsWith("rename from ")) current.renameFrom = unquote(line.slice("rename from ".length));
      else if (line.startsWith("rename to ")) current.renameTo = unquote(line.slice("rename to ".length));
      i++;
    } else {
      i++;
    }
  }

  return sections.map((section, index) => resolve(section, index));
}

/** Read the hunk whose header is at `at` into `hunks`, returning the index of the line after it. */
function readHunk(lines: string[], at: number, hunks: Hunk[]): number {
  const match = HUNK_HEADER.exec(lines[at]);
  if (!match) throw new Error(`malformed diff: bad hunk header at line ${at + 1}: ${lines[at]}`);
  const hunk: Hunk = {
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newCount: match[4] === undefined ? 1 : Number(match[4]),
    lines: [],
  };
  const short = () =>
    new Error(`malformed diff: hunk at line ${at + 1} has fewer lines than its header counts`);

  let oldLeft = hunk.oldCount;
  let newLeft = hunk.newCount;
  let i = at + 1;
  while (oldLeft > 0 || newLeft > 0) {
    if (i >= lines.length) throw short();
    const line = lines[i];
    // Some tools strip the space from an empty context line.
    const kind = line === "" ? " " : line[0];
    if (kind === "\\") {
      markNoNewline(hunk, i);
      i++;
      continue;
    }
    if (kind === " " && oldLeft > 0 && newLeft > 0) {
      oldLeft--;
      newLeft--;
    } else if (kind === "-" && oldLeft > 0) {
      oldLeft--;
    } else if (kind === "+" && newLeft > 0) {
      newLeft--;
    } else {
      throw short();
    }
    hunk.lines.push({ kind, text: line.slice(1), noNewline: false });
    i++;
  }
  while (i < lines.length && lines[i].startsWith("\\")) {
    markNoNewline(hunk, i);
    i++;
  }
  hunks.push(hunk);
  return i;
}

function markNoNewline(hunk: Hunk, at: number): void {
  const last = hunk.lines.at(-1);
  if (!last) throw new Error(`malformed diff: "\\ No newline at end of file" at line ${at + 1} follows no line`);
  last.noNewline = true;
}

function resolve(section: Section, index: number): FilePatch {
  const created = section.newFileMode || section.minus === null;
  const deleted = section.deletedFileMode || section.plus === null;
  const source = created ? undefined : (section.renameFrom ?? section.minus ?? section.gitOld);
  const target = deleted ? undefined : (section.renameTo ?? section.plus ?? section.gitNew);
  if (source === undefined && target === undefined) {
    throw new Error(`malformed diff: file section ${index + 1} names no path`);
  }
  if (created && deleted) {
    throw new Error(`malformed diff: file section ${index + 1} both creates and deletes its file`);
  }
  return { source, target, created, deleted, hunks: section.hunks };
}

/** The path of a "---" or "+++" header, without its prefix; null for "/dev/null". */
function headerPath(rest: string, prefix: "a/" | "b/"): string | null {
  const tab = rest.indexOf("\t");
  const path = unquote(tab < 0 ? rest : rest.slice(0, tab));
  if (path === "/dev/null") return null;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** The two paths of a "diff --git a/X b/Y" line, without their prefixes. */
function gitPaths(rest: string): [string, string] | undefined {
  if (rest.startsWith('"')) {
    const end = quotedEnd(rest);
    if (end < 0 || rest[end + 1] !== " ") return undefined;
    const old = unquote(rest.slice(0, end + 1));
    const neu = unquote(rest.slice(end + 2));
    return [strip(old, "a/"), strip(neu, "b/")];
  }
  if (rest.endsWith('"')) {
    const open = rest.lastIndexOf(' "');
    if (open < 0) return undefined;
    return [strip(rest.slice(0, open), "a/"), strip(unquote(rest.slice(open + 1)), "b/")];
  }
  // Unquoted paths may hold spaces: prefer the split where both halves name the same path.
  const half = (rest.length - 1) / 2;
  if (Number.isInteger(half) && rest[half] === " ") {
    const old = strip(rest.slice(0, half), "a/");
    const neu = strip(rest.slice(half + 1), "b/");
    if (old === neu) return [old, neu];
  }
  const split = rest.indexOf(" b/");
  if (split < 0) return undefined;
  return [strip(rest.slice(0, split), "a/"), rest.slice(split + 3)];
}

function strip(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** The index of the closing quote of the C-style quoted string at the start of `text`, or -1. */
function quotedEnd(text: string): number {
  for (let i = 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === '"') return i;
  }
  return -1;
}

const ESCAPES: Record<string, string> = { a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" };

/** Undo git's C-style quoting of a path; a path not in quotes is returned as is. */
function unquote(text: string): string {
  if (!text.startsWith('"') || quotedEnd(text) !== text.length - 1) return text;
  try {
    return decodeURIComponent(encodeQuoted(text));
  } catch {
    return text;
  }
}

/** The body of a quoted path as percent-encoded UTF-8, its escapes undone. */
function encodeQuoted(text: string): string {
  let encoded = "";
  for (let i = 1; i < text.length - 1; i++) {
    const c = text[i];
    if (c !== "\\") {
      encoded += encodeURIComponent(c);
      continue;
    }
    const next = text[++i];
    const octal = /^[0-7]{3}/.exec(text.slice(i, i + 3));
    if (octal) {
      encoded += "%" + parseInt(octal[0], 8).toString(16).padStart(2, "0");
      i += 2;
    } else {
      encoded += encodeURIComponent(ESCAPES[next] ?? next);
    }
  }
  return encoded;
}
