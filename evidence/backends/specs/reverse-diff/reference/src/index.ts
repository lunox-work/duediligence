/**
 * The kind of a name table entry: "path" entries rename a file or directory
 * path, "identifier" entries rename a word in code.
 */
export type NameKind = "path" | "identifier";

/** One entry of the name table: a kind, a real name and a public name. */
export interface NameEntry {
  kind: NameKind;
  real: string;
  public: string;
}

/** The name table that file paths and identifiers were renamed through. */
export type NameTable = readonly NameEntry[];

/** The result of reverse-mapping a unified diff. */
export interface ReverseMapResult {
  /** The diff with public names replaced by real ones. */
  diff: string;
  /**
   * Paths no path entry covers, each reported once, in the order they first
   * appear.
   */
  unmapped: string[];
}

const DEV_NULL = "/dev/null";
const WORD_CHAR = "[\\p{L}\\p{N}_$]";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Maps paths through the path entries; the deepest covering entry wins. */
class PathMapper {
  private readonly entries: { real: string; public: string }[];
  readonly unmapped: string[] = [];
  private readonly reported = new Set<string>();

  constructor(table: NameTable) {
    const seen = new Set<string>();
    this.entries = [];
    for (const e of table) {
      if (e.kind !== "path") continue;
      const pub = e.public.replace(/\/+$/, "");
      if (pub === "" || seen.has(pub)) continue;
      seen.add(pub);
      this.entries.push({ real: e.real.replace(/\/+$/, ""), public: pub });
    }
    // Longest public path first, so the first match is the most specific one.
    this.entries.sort((a, b) => b.public.length - a.public.length);
  }

  /** Maps a bare path (no a/ or b/ prefix), reporting it if nothing covers it. */
  map(path: string): string {
    if (path === DEV_NULL) return path;
    for (const e of this.entries) {
      if (path === e.public) return e.real;
      if (path.startsWith(e.public + "/")) return e.real + path.slice(e.public.length);
    }
    if (!this.reported.has(path)) {
      this.reported.add(path);
      this.unmapped.push(path);
    }
    return path;
  }

  /** Maps a path that may carry a git a/ or b/ prefix, keeping the prefix. */
  mapPrefixed(path: string): string {
    const m = /^([ab]\/)(.*)$/s.exec(path);
    return m ? m[1] + this.map(m[2]) : this.map(path);
  }
}

/** Replaces whole-word public identifiers with real ones in a single pass. */
function identifierMapper(table: NameTable): (text: string) => string {
  const names = new Map<string, string>();
  for (const e of table) {
    if (e.kind === "identifier" && e.public !== "" && !names.has(e.public)) names.set(e.public, e.real);
  }
  if (names.size === 0) return (text) => text;
  const alternatives = [...names.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const re = new RegExp(`(?<!${WORD_CHAR})(?:${alternatives.join("|")})(?!${WORD_CHAR})`, "gu");
  return (text) => text.replace(re, (word) => names.get(word) ?? word);
}

/** Splits the "a/X b/Y" part of a "diff --git" line into its two paths. */
function splitGitPaths(rest: string): [string, string] | null {
  if (rest.startsWith("a/")) {
    const splits: number[] = [];
    for (let i = rest.indexOf(" b/"); i !== -1; i = rest.indexOf(" b/", i + 1)) splits.push(i);
    if (splits.length === 0) return null;
    const same = splits.find((i) => rest.slice(2, i) === rest.slice(i + 3));
    const at = same ?? splits[0];
    return [rest.slice(0, at), rest.slice(at + 1)];
  }
  const parts = rest.split(" ");
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

/** Maps the path in a "--- X" or "+++ X" line, keeping any tab-separated suffix. */
function mapFileLine(marker: string, rest: string, paths: PathMapper): string {
  const tab = rest.indexOf("\t");
  const path = tab === -1 ? rest : rest.slice(0, tab);
  const suffix = tab === -1 ? "" : rest.slice(tab);
  return marker + paths.mapPrefixed(path) + suffix;
}

/** Maps a line outside any hunk: file headers, rename and copy lines. */
function mapHeaderLine(line: string, paths: PathMapper): string {
  if (line.startsWith("diff --git ")) {
    const split = splitGitPaths(line.slice("diff --git ".length));
    if (!split) return line;
    return "diff --git " + paths.mapPrefixed(split[0]) + " " + paths.mapPrefixed(split[1]);
  }
  if (line.startsWith("--- ")) return mapFileLine("--- ", line.slice(4), paths);
  if (line.startsWith("+++ ")) return mapFileLine("+++ ", line.slice(4), paths);
  const rename = /^((?:rename|copy) (?:from|to) )(.*)$/s.exec(line);
  if (rename) return rename[1] + paths.map(rename[2]);
  const binary = /^Binary files (a\/.*|\/dev\/null) and (b\/.*|\/dev\/null) differ$/s.exec(line);
  if (binary) return `Binary files ${paths.mapPrefixed(binary[1])} and ${paths.mapPrefixed(binary[2])} differ`;
  return line;
}

/**
 * Reverse-maps a unified diff through the name table, replacing public names
 * with real ones in file headers, rename lines and hunk content, so a
 * contributor's patch can be merged back. Everything else is kept unchanged
 * byte for byte.
 */
export function reverseMapDiff(diff: string, table: NameTable): ReverseMapResult {
  const paths = new PathMapper(table);
  const words = identifierMapper(table);

  let out = "";
  let inHunk = false;
  let oldLeft = 0;
  let newLeft = 0;

  const lineRe = /([^\n]*?)(\r?\n|$)/gy;
  let match: RegExpExecArray | null;
  while (lineRe.lastIndex < diff.length && (match = lineRe.exec(diff)) !== null) {
    const [, line, eol] = match;
    let mapped = line;

    const hunk = /^(@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@)(.*)$/s.exec(line);
    if (hunk) {
      inHunk = true;
      oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
      newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]);
      mapped = hunk[1] + words(hunk[4]);
    } else if (inHunk && line.startsWith("\\")) {
      // "\ No newline at end of file" marker: kept as it is.
    } else if (inHunk && (oldLeft > 0 || newLeft > 0) && /^[ +-]|^$/.test(line)) {
      const sign = line.charAt(0);
      if (sign !== "+") oldLeft = Math.max(0, oldLeft - 1);
      if (sign !== "-") newLeft = Math.max(0, newLeft - 1);
      mapped = sign + words(line.slice(1));
    } else {
      inHunk = false;
      mapped = mapHeaderLine(line, paths);
    }

    out += mapped + eol;
  }

  return { diff: out, unmapped: paths.unmapped };
}
