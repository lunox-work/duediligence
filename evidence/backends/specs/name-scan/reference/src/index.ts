/** A file to scan: its path and its text. */
export interface ScanFile {
  path: string;
  text: string;
}

/**
 * A match, reported with the file's path, the term as given, the line and
 * column where it starts (both from 1, columns counting UTF-16 code units),
 * and the matched text exactly as written in the file. A match in the
 * file's path has line 0 and the column in the path.
 */
export interface Match {
  path: string;
  term: string;
  line: number;
  column: number;
  text: string;
}

/**
 * The outcome of a scan: the matches, ordered by path, then line, then
 * column, and the paths of files that were not scanned because their text
 * contains a NUL character.
 */
export interface ScanResult {
  matches: Match[];
  skipped: string[];
}

const ALNUM = /[\p{L}\p{Nd}]/u;
const LOWER = /\p{Ll}/u;
const UPPER = /\p{Lu}/u;
const LETTER = /\p{L}/u;

const GENERIC = new Set([
  "admin", "api", "app", "client", "core", "demo",
  "example", "internal", "main", "server", "test", "web",
]);

/** A word of a line: its start and end in UTF-16 code units, and its folded text. */
interface Word {
  start: number;
  end: number;
  key: string;
}

/** A term to scan for: its index in the list given, as given, and its words. */
interface Term {
  index: number;
  given: string;
  keys: string[];
}

interface Candidate {
  term: Term;
  start: number;
  end: number;
}

function fold(word: string): string {
  return word.toUpperCase().toLowerCase();
}

/**
 * Splits a line into words: runs of letters and digits, split further where
 * a lowercase letter is followed by an uppercase one, and where an uppercase
 * letter is followed by an uppercase then a lowercase one.
 */
function words(line: string): Word[] {
  const result: Word[] = [];
  let run: { char: string; offset: number }[] = [];
  const flush = (): void => {
    let first = 0;
    for (let j = 1; j <= run.length; j++) {
      const split =
        j === run.length ||
        (LOWER.test(run[j - 1].char) && UPPER.test(run[j].char)) ||
        (j + 1 < run.length &&
          UPPER.test(run[j - 1].char) &&
          UPPER.test(run[j].char) &&
          LOWER.test(run[j + 1].char));
      if (split) {
        const start = run[first].offset;
        const end = j === run.length
          ? run[j - 1].offset + run[j - 1].char.length
          : run[j].offset;
        result.push({ start, end, key: fold(line.slice(start, end)) });
        first = j;
      }
    }
    run = [];
  };
  let offset = 0;
  for (const char of line) {
    if (ALNUM.test(char)) {
      run.push({ char, offset });
    } else if (run.length > 0) {
      flush();
    }
    offset += char.length;
  }
  if (run.length > 0) flush();
  return result;
}

/** Whether a term says nothing about whose code it is. */
function isSkipped(given: string, keys: string[]): boolean {
  const chars = [...given].filter((c) => ALNUM.test(c));
  if (chars.length < 4) return true;
  if (!chars.some((c) => LETTER.test(c))) return true;
  return keys.length === 1 && GENERIC.has(keys[0]);
}

function prepareTerms(terms: string[]): Map<string, Term[]> {
  const byFirstKey = new Map<string, Term[]>();
  const seen = new Set<string>();
  terms.forEach((given, index) => {
    const keys = words(given).map((w) => w.key);
    if (isSkipped(given, keys)) return;
    const id = keys.join(" ");
    if (seen.has(id)) return;
    seen.add(id);
    const list = byFirstKey.get(keys[0]) ?? [];
    list.push({ index, given, keys });
    byFirstKey.set(keys[0], list);
  });
  return byFirstKey;
}

/** Finds the matches in one line, keeping the longest where they overlap. */
function scanLine(
  path: string,
  lineNumber: number,
  line: string,
  terms: Map<string, Term[]>,
): Match[] {
  const lineWords = words(line);
  const candidates: Candidate[] = [];
  lineWords.forEach((word, i) => {
    for (const term of terms.get(word.key) ?? []) {
      const n = term.keys.length;
      if (i + n > lineWords.length) continue;
      if (term.keys.every((key, k) => lineWords[i + k].key === key)) {
        candidates.push({ term, start: word.start, end: lineWords[i + n - 1].end });
      }
    }
  });
  candidates.sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      a.term.index - b.term.index ||
      a.start - b.start,
  );
  const kept: Candidate[] = [];
  for (const c of candidates) {
    if (kept.every((k) => c.end <= k.start || k.end <= c.start)) kept.push(c);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept.map((c) => ({
    path,
    term: c.term.given,
    line: lineNumber,
    column: c.start + 1,
    text: line.slice(c.start, c.end),
  }));
}

/**
 * Scans a set of files, each with a path and text, for a list of terms
 * (the names the workspace goes by), finding a term however the code
 * happens to spell it. Short and generic terms are not scanned for.
 */
export function scan(terms: string[], files: ScanFile[]): ScanResult {
  const prepared = prepareTerms(terms);
  const matches: Match[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (file.text.includes("\u0000")) {
      skipped.push(file.path);
      continue;
    }
    matches.push(...scanLine(file.path, 0, file.path, prepared));
    file.text.split("\n").forEach((raw, i) => {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      matches.push(...scanLine(file.path, i + 1, line, prepared));
    });
  }
  matches.sort(
    (a, b) =>
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
      a.line - b.line ||
      a.column - b.column,
  );
  return { matches, skipped };
}
